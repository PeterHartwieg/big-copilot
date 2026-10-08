const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const runner = import('../tools/verify.mjs');

test('LPT assigns every suite exactly once, spreads heavy files and is deterministic', async () => {
  const {assignShards} = await runner;
  const files = ['a', 'b', 'c', 'd', 'e', 'new'];
  const weights = {a: 100, b: 90, c: 80, d: 2, e: 1, deleted: 10000};
  const lanes = assignShards(files, weights, 3);
  assert.deepEqual(lanes.flat().sort(),files.slice().sort());
  assert.equal(new Set(lanes.flat()).size,files.length);
  assert.deepEqual(assignShards(files.slice().reverse(),weights,3),lanes);
  for (const heavy of ['a','b','c']) assert.equal(lanes.filter(lane => lane.some(file => file === heavy)).length,1);
  assert.ok(lanes.every(lane => lane.filter(file => ['a','b','c'].includes(file)).length === 1));
  // The unknown suite gets the median (80), and stale entries are ignored.
  assert.deepEqual(lanes,assignShards(files,{...weights,new:80},3));
  assert.deepEqual(lanes,assignShards(files,{a:100,b:90,c:80,d:2,e:1},3));
  assert.deepEqual(assignShards(['d','c','b','a'],{},2),[['a','c'],['b','d']]);
  assert.deepEqual(assignShards(['a','b','new'],{a:2,b:4},2),[['b'],['a','new']]);
  assert.throws(()=>assignShards(files,weights,0),/invalid shard/);
});

test('Python lanes cover discovered modules and forward only the selected module names', async t => {
  const {verify,assignShards} = await runner;
  const root = fixture(t);
  const modules = ['test_a','test_b','test_c','nested.test_d'];
  const weights = {test_a:20,test_b:10,test_c:1};
  fs.writeFileSync(path.join(root,'tests','shard-weights.json'),JSON.stringify({node:{},python:weights}));
  const executed=[];
  for (let lane=1;lane<=2;lane++) {
    const calls=[];
    const spawn=(command,args,options)=> args[0] === 'tools/python_shard.py' && args[1] === '--list'
      ? {status:0,stdout:JSON.stringify(modules)} : fakeSpawn(calls)(command,args,options);
    assert.equal(verify(['python',`--shard=${lane}/2`],{root,spawn,log:()=>{}}),0);
    assert.deepEqual(calls[0].args,['build_web.py','--assemble']);
    assert.deepEqual(calls[1].args,['tools/python_shard.py',...assignShards(modules,weights,2)[lane-1]]);
    executed.push(...calls[1].args.slice(1));
  }
  assert.deepEqual(executed.sort(),modules.sort());
  for(const args of [['python','--shard=0/2'],['python','--shard=3/2'],['python','--shard=1/2','test_a']]) {
    assert.throws(()=>verify(args,{root,spawn:fakeSpawn([]),log:()=>{}}),/shard/);
  }
  assert.throws(()=>verify(['python','--shard=1/2'],{root,log:()=>{},spawn:(command,args)=>
    args[0] === '-c' ? {status:0,stdout:'python'} : args[0] === 'build_web.py' ? {status:0}
      : {status:1,stderr:'import failure'}}),/Python discovery failed.*import failure/);
  const failed=[];
  assert.equal(verify(['python','--shard=1/2'],{root,spawn:fakeSpawn(failed,1),log:()=>{}}),7);
  assert.equal(failed.length,1,'failed assembly stops before discovery');
  assert.throws(()=>verify(['python','--shard=2/2'],{root,log:()=>{},spawn:(command,args)=>
    args[0] === '-c' ? {status:0,stdout:'python'} : args[1] === '--list' ? {status:0,stdout:'["test_a"]'}
      : {status:0}}),/shard is empty/);
});

test('Python runner preserves discovery names/sys.path and rejects unknown or empty selections', async t => {
  const {selectPython} = await runner;
  const python = selectPython();
  const root = fixture(t);
  fs.mkdirSync(path.join(root,'tools'));
  fs.copyFileSync(path.join(__dirname,'../tools/python_shard.py'),path.join(root,'tools/python_shard.py'));
  fs.writeFileSync(path.join(root,'root_helper.py'),'VALUE = 42\n');
  fs.writeFileSync(path.join(root,'tests','helper.py'),'VALUE = 7\n');
  for (const name of ['a','b','c']) fs.writeFileSync(path.join(root,'tests',`test_${name}.py`),
    `import unittest, root_helper, helper\nclass Sample(unittest.TestCase):\n def test_value(self):\n  self.assertEqual(root_helper.VALUE,42)\n  self.assertEqual(helper.VALUE,7)\n`);
  const run = args=>spawnSync(python,args,{cwd:root,encoding:'utf8'});
  assert.deepEqual(JSON.parse(run(['tools/python_shard.py','--list']).stdout),['test_a','test_b','test_c']);
  const selected=run(['tools/python_shard.py','test_a','test_c']);
  assert.equal(selected.status,0,selected.stderr);
  assert.match(selected.stderr,/Ran 2 tests/);
  // Each selected module reports its seconds for tools/shard_weights.mjs.
  assert.deepEqual([...selected.stderr.matchAll(/^shard-weight python (\w+) \d+\.\d\r?$/gm)].map(m => m[1]),['test_a','test_c']);
  const full=run(['-m','unittest','discover','-s','tests']);
  assert.equal(full.status,0,full.stderr);
  assert.match(full.stderr,/Ran 3 tests/);
  for(const modules of [[],['missing'],['tests.test_a']]) {
    const result=run(['tools/python_shard.py',...modules]);
    assert.equal(result.status,1);
    assert.match(result.stderr,/Invalid Python shard/);
  }
  fs.writeFileSync(path.join(root,'tests','test_broken.py'),'raise RuntimeError("import failed")\n');
  assert.equal(run(['tools/python_shard.py','--list']).status,1);
  fs.rmSync(path.join(root,'tests','test_broken.py'));
  fs.writeFileSync(path.join(root,'tests','test_failure.py'),'import unittest\nclass Failure(unittest.TestCase):\n def test_fail(self):\n  self.fail("intentional")\n');
  assert.equal(run(['tools/python_shard.py','test_failure']).status,1);
});

test('weights are read back from lane logs, last value per suite, sorted', async () => {
  const {parseWeights} = await import('../tools/shard_weights.mjs');
  const logs = ['✔ some test (12ms)', 'shard-weight node tests/z.test.cjs 4.5', 'shard-weight python test_b 2.0',
    'shard-weight node tests/a.test.cjs 120.25', 'noise shard-weight node tests/x.test.cjs 9', 'shard-weight python test_a 0.4  '].join('\n');
  assert.deepEqual(parseWeights(logs), {node: {'tests/a.test.cjs': 120.25, 'tests/z.test.cjs': 4.5}, python: {test_a: 0.4, test_b: 2}});
  assert.deepEqual(Object.keys(parseWeights(logs).node), ['tests/a.test.cjs', 'tests/z.test.cjs']);
});

test('committed weights name only existing suites', async () => {
  const {nodeFiles, shardWeights, ROOT} = await runner;
  const weights = shardWeights(ROOT);
  const files = new Set(nodeFiles(ROOT));
  for (const file of Object.keys(weights.node)) assert.ok(files.has(file), `stale Node weight: ${file}`);
  for (const module of Object.keys(weights.python)) assert.ok(fs.existsSync(path.join(ROOT, 'tests', `${module}.py`)), `stale Python weight: ${module}`);
  for (const value of [...Object.values(weights.node), ...Object.values(weights.python)]) assert.ok(Number.isFinite(value) && value > 0);
});

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'verify with spaces ')));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'tests', 'shard-weights.json'), JSON.stringify({node: {}, python: {}}));
  for (const name of ['z.test.cjs', 'a.test.cjs', '_helper.cjs']) fs.writeFileSync(path.join(root, 'tests', name), '');
  fs.mkdirSync(path.join(root, 'node_modules', 'wrangler', 'bin'), {recursive: true});
  fs.writeFileSync(path.join(root, 'node_modules', 'wrangler', 'package.json'), JSON.stringify({bin: {wrangler: './bin/wrangler.js'}}));
  fs.writeFileSync(path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), '');
  fs.writeFileSync(path.join(root, 'unrelated.txt'), 'preserve this dirty file');
  return root;
}
function fakeSpawn(calls, failAt = -1, result = {status: 7}) {
  return (command, args, options) => {
    if (args[0] === '-c') return {status: 0, stdout: '/Python path/python3\n'};
    calls.push({command, args, options});
    return calls.length === failAt ? result : {status: 0};
  };
}

test('Python fallback resolves launcher to executable; explicit invalid overrides never fall back', async () => {
  const {selectPython} = await runner;
  const tried = [];
  assert.equal(selectPython({}, (cmd, args) => {
    tried.push(cmd); assert.deepEqual(args, ['-c', 'import sys; print(sys.executable)']);
    return cmd === 'py' ? {status: 0, stdout: 'C:\\Program Files\\Python\\python.exe\n'} : {error: new Error('missing')};
  }), 'C:\\Program Files\\Python\\python.exe');
  assert.deepEqual(tried, ['python3', 'python', 'py']);
  tried.length = 0;
  assert.throws(() => selectPython({PYTHON: 'bad override'}, cmd => {tried.push(cmd); return {status: 1};}), /override is invalid/);
  assert.deepEqual(tried, ['bad override']);
  assert.throws(() => selectPython({PYTHON: ''}), /override is invalid/);
  assert.throws(() => selectPython({}, () => ({status: 1})), /no Python found/);
});

test('full gate order, bounded portable enumeration and child environment', async t => {
  const {verify, OPTIMIZED_NODE_SUITES} = await runner; const root = fixture(t); const calls = [];
  assert.equal(verify([], {root, env: {PLAYWRIGHT_CHANNEL: 'chrome'}, spawn: fakeSpawn(calls), log: () => {}}), 0);
  assert.deepEqual(calls.map(c => c.args), [
    ['build_web.py', '--assemble'], ['-m', 'unittest', 'discover', '-s', 'tests'],
    ['--test', '--test-concurrency=2', 'tests/a.test.cjs', 'tests/z.test.cjs'],
    [path.join(root,'tools','optimize_web.mjs')],
    [path.join(root,'tools','optimize_web.mjs'), '--check'],
    ['--test', '--test-concurrency=2', ...OPTIMIZED_NODE_SUITES],
    ['build_web.py', '--assemble'],
    [path.join(root,'node_modules','wrangler','bin','wrangler.js'), 'deploy', '--dry-run'],
    ['build_web.py', '--check'],
  ]);
  for (const call of calls) {
    assert.equal(call.options.env.PYTHON, '/Python path/python3');
    assert.equal(call.options.env.PLAYWRIGHT_CHANNEL, 'chrome');
    assert.equal(call.options.cwd, root); assert.equal(call.options.shell, undefined);
  }
  assert.equal(calls[5].options.env.BOARD_TARGET,'web');
  assert.equal(calls[2].options.env.BOARD_TARGET,undefined);
  assert.equal(calls[6].options.env.BOARD_TARGET,undefined);
  assert.equal(fs.readFileSync(path.join(root,'unrelated.txt'),'utf8'), 'preserve this dirty file');
});

test('each failure stops later stages; spawn errors and signals fail safely', async t => {
  const {verify} = await runner; const root = fixture(t);
  for (let stage = 1; stage <= 9; stage++) {
    const calls = [];
    assert.equal(verify([], {root, spawn: fakeSpawn(calls,stage), log: () => {}}), 7);
    assert.equal(calls.length, stage);
  }
  for (const failure of [{error: new Error('cannot spawn')}, {signal: 'SIGTERM'}, {status: null}]) {
    const calls = []; const run = () => verify([], {root,spawn: fakeSpawn(calls,1,failure),log: () => {}});
    if (failure.status === null) assert.equal(run(), 1); else assert.throws(run);
    assert.equal(calls.length,1);
  }
});

test('focused stages assemble only when needed and forward unittest arguments', async t => {
  const {verify} = await runner; const root = fixture(t);
  for (const [args, expected] of [
    [['node','tests/z.test.cjs'], [['build_web.py','--assemble'], ['--test','--test-concurrency=2','tests/z.test.cjs']]],
    [['python','tests.test_premises'], [['build_web.py','--assemble'],['-m','unittest','tests.test_premises']]],
    [['check'], [['build_web.py','--check']]],
    [['node','tests/*.test.cjs','tests/z.test.cjs'], [['build_web.py','--assemble'], ['--test','--test-concurrency=2','tests/a.test.cjs','tests/z.test.cjs']]],
  ]) {
    const calls=[]; assert.equal(verify(args,{root,spawn:fakeSpawn(calls),log:()=>{}}),0);
    assert.deepEqual(calls.map(c=>c.args),expected);
  }
  const calls=[];
  assert.throws(()=>verify(['node','missing.test.cjs'],{root,spawn:fakeSpawn(calls)}),/unknown Node suite/);
  assert.equal(calls.length,0);
  assert.throws(()=>verify(['node','--test-name-pattern=example'],{root,spawn:fakeSpawn(calls)}),/unknown Node suite/);
  assert.equal(calls.length,0);
  assert.throws(()=>verify(['unknown'],{root}),/unknown stage/);
});

test('CLI reports invalid override with nonzero exit', () => {
  const result = spawnSync(process.execPath,[path.join(__dirname,'../tools/verify.mjs'),'assemble'],{
    env:{...process.env,PYTHON:path.join(os.tmpdir(),'nonexistent-python-for-verification')},encoding:'utf8',
  });
  assert.equal(result.status,1); assert.match(result.stderr,/PYTHON override is invalid/);
});

test('Node shards preserve assembly and concurrency, passing only chosen files', async t => {
  const {verify, SHARD_REPORTERS} = await runner; const root = fixture(t); const calls = [];
  assert.equal(verify(['node','--shard=2/2'],{root,spawn:fakeSpawn(calls),log:()=>{}}),0);
  assert.deepEqual(calls.map(c=>c.args),[
    ['build_web.py','--assemble'],
    ['--test','--test-concurrency=2',...SHARD_REPORTERS,'tests/z.test.cjs'],
  ]);
  // The spec output stays, and each lane also reports its files' seconds.
  assert.deepEqual(SHARD_REPORTERS.filter(a => a.startsWith('--test-reporter=')).map(a => a.endsWith('/tools/shard_times.mjs') ? 'times' : a),
    ['--test-reporter=spec', 'times']);
  for (const args of [
    ['node','--shard=0/4'], ['node','--shard=5/4'], ['node','--shard=1/0'],
    ['node','--shard=1.5/4'], ['node','--shard=1/4oops'], ['node','--shard'],
    ['node','--shard=1/9007199254740992'],
    ['node','--shard=3/4'],
    ['node','--shard=1/4','tests/a.test.cjs'], ['node','--shard=1/4','--shard=2/4'],
    ['all','--shard=1/4'], ['optimized','--shard=1/4'],
  ]) {
    const rejected=[];
    assert.throws(()=>verify(args,{root,spawn:fakeSpawn(rejected),log:()=>{}}),/shard|extra arguments/);
    assert.equal(rejected.length,0,JSON.stringify(args));
  }
  const failed=[];
  assert.equal(verify(['node','--shard=2/2'],{root,spawn:fakeSpawn(failed,2),log:()=>{}}),7);
});

test('the CI matrix shards execute every discovered file once and propagate a real failure', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root,'tools'));
  for (const file of ['verify.mjs','shard_times.mjs']) fs.copyFileSync(path.join(__dirname,'../tools',file),path.join(root,'tools',file));
  fs.writeFileSync(path.join(root,'build_web.py'),'# Synthetic successful assembly.\n');
  const names = ['a','b','c','d','e','f','g','h','z'];
  for (const name of names) fs.writeFileSync(path.join(root,'tests',`${name}.test.cjs`),
    `require('node:test')('${name}', () => {\n` +
    `require('node:fs').appendFileSync('executed.txt', '${name}\\n');\n` +
    // One real failure must fail exactly the shard that contains this file.
    (name === 'c' ? `throw new Error('intentional shard failure');\n` : '') + '});\n' +
    // A test a helper defines is timed under the file that runs it.
    (name === 'h' ? `require('./_defines.cjs')();\n` : ''));
  fs.writeFileSync(path.join(root,'tests','_defines.cjs'),`module.exports = () => require('node:test')('from a helper', () => {});\n`);
  const workflow = fs.readFileSync(path.join(__dirname,'../.github/workflows/tests.yml'),'utf8').replace(/\r\n/g, '\n');
  const matrix = /^        suite: \[([^\]\n]+)\]/m.exec(workflow);
  assert.ok(matrix, 'the workflow has a static suite matrix');
  const shards = [...matrix[1].matchAll(/'(\d+\/\d+)'/g)].map(match=>match[1]);
  assert.deepEqual(shards,['1/6','2/6','3/6','4/6','5/6','6/6']);
  const statuses=[], timed=[];
  // Exercise a fresh CLI invocation; Node suppresses --test inside a test child.
  const env={...process.env};
  delete env.NODE_TEST_CONTEXT;
  for (const shard of shards) {
    const result = spawnSync(process.execPath,[path.join(root,'tools','verify.mjs'),'node',`--shard=${shard}`],{cwd:root,encoding:'utf8',env});
    assert.ifError(result.error);
    assert.ok([0,1].includes(result.status),result.stderr);
    statuses.push(result.status);
    timed.push(...[...result.stdout.matchAll(/^shard-weight node (\S+) \d+\.\d\r?$/gm)].map(m => m[1]));
  }
  assert.deepEqual(statuses.slice().sort(),[0,0,0,0,0,1]);
  // Every file reports its seconds once, the failing one included.
  assert.deepEqual(timed.sort(),names.map(name => `tests/${name}.test.cjs`));
  assert.deepEqual(fs.readFileSync(path.join(root,'executed.txt'),'utf8').trim().split(/\r?\n/).sort(),names);
});

test('CLI propagates a real failing assembly and never starts later stages in a spaced path', async t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root,'tools'));
  fs.copyFileSync(path.join(__dirname,'../tools/verify.mjs'),path.join(root,'tools','verify.mjs'));
  fs.writeFileSync(path.join(root,'build_web.py'), 'import pathlib, sys\npathlib.Path("stages.log").write_text(sys.argv[1])\nsys.exit(17)\n');
  for (const file of ['a.test.cjs','z.test.cjs']) fs.writeFileSync(path.join(root,'tests',file),'throw new Error("later Node stage ran");');
  const result = spawnSync(process.execPath,[path.join(root,'tools','verify.mjs')],{encoding:'utf8'});
  assert.equal(result.status,17, result.stderr);
  assert.equal(fs.readFileSync(path.join(root,'stages.log'),'utf8'),'--assemble');
  assert.doesNotMatch(result.stdout,/--test|--dry-run|--check|unittest/);
});

test('two CI runs fit within eighteen runner slots, including the aggregate checks', () => {
  const workflow = fs.readFileSync(path.join(__dirname,'../.github/workflows/tests.yml'),'utf8').replace(/\r\n/g, '\n');
  const source = workflow.split(/^jobs:\n/m)[1];
  assert.ok(source, 'the workflow has jobs');
  // Read this workflow's static jobs, scalar/list dependencies and flat suite
  // matrix. Reject an unfamiliar matrix instead of undercounting its runners.
  const jobs = [...source.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|(?![\s\S]))/gm)].map(([,id,body]) => {
    assert.match(body, /^    runs-on:/m, `${id}: reusable workflows need their own runner accounting`);
    const block = /^      matrix:\n((?: {8,}.+\n)+)/m.exec(body);
    const matrix = block && /^        (?:suite|shard): \[([^\]\n]+)\]\n$/.exec(block[1]);
    assert.ok(!/^      matrix:/m.test(body) || matrix, `${id}: uncounted matrix`);
    const needs = /^    needs: (.+)$/m.exec(body)?.[1];
    return {id, body, slots: matrix ? matrix[1].split(',').length : 1,
      needs: needs ? needs.replace(/[\[\]'" ]/g,'').split(',') : []};
  });
  assert.ok(jobs.length);
  for(const job of jobs) for(const need of job.needs) assert.ok(jobs.some(j => j.id === need), need);
  let peak = 0;
  // Enumerate dependency-valid completion states; every ready job may run.
  for(let mask = 0; mask < 2 ** jobs.length; mask++){
    const done = new Set(jobs.filter((_,i) => mask & (1 << i)).map(j => j.id));
    if(jobs.some(j => done.has(j.id) && j.needs.some(n => !done.has(n)))) continue;
    const ready = jobs.filter(j => !done.has(j.id) && j.needs.every(n => done.has(n)));
    peak = Math.max(peak, ready.reduce((sum,j) => sum + j.slots, 0));
  }
  assert.ok(peak < 10, `${peak} concurrent runners per run would use ${peak * 2} for two runs`);
  const python = jobs.find(j => j.id === 'python').body;
  const freshness = jobs.find(j => j.id === 'web-fresh').body;
  assert.match(python, /shard: \['1\/2', '2\/2'\]/);
  assert.match(python, /npm run test:python -- --shard=\$\{\{ matrix.shard \}\}/);
  assert.doesNotMatch(python, /freshness|verify:check/);
  for(const stage of ['verify:assemble', 'verify:check']) assert.ok(freshness.includes(`npm run ${stage}`), stage);
  assert.deepEqual(jobs.find(j => j.id === 'web-fresh').needs,[]);
  for (const [id, dependency, name] of [['python-suite','python','Python suite'],['node','node-tests','Node suites']]) {
    const job = jobs.find(j => j.id === id);
    assert.deepEqual(job.needs,[dependency]);
    assert.ok(job.body.includes(`name: ${name}\n`));
    assert.match(job.body,/if: always\(\)/);
    assert.ok(job.body.includes(`RESULT: \$\{\{ needs.${dependency}.result \}\}`));
    assert.ok(job.body.includes('run: test "$RESULT" = success'));
  }
  const node = jobs.find(j => j.id === 'node-tests').body;
  for(const stage of ['test:optimized', 'check:worker']){
    assert.ok(node.includes(`if: matrix.suite == '6/6'\n        run: npm run ${stage}`), stage);
  }
});

test('standalone Worker check needs no Python and preserves the environment', async t => {
  const {verify} = await runner; const root = fixture(t); const calls = [];
  assert.equal(verify(['worker'], {root, env: {PYTHON: 'invalid Python override'}, log: () => {},
    spawn: (command, args, options) => {calls.push({command,args,options}); return {status: 0};},
  }), 0);
  assert.equal(calls.length,1);
  assert.equal(calls[0].command,process.execPath);
  assert.equal(calls[0].options.env.PYTHON,'invalid Python override');
  assert.deepEqual(calls[0].args.slice(1),['deploy','--dry-run']);
});

test('Worker CLI resolves NODE_PATH dependencies without local node_modules or Python', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root,'tools'));
  fs.copyFileSync(path.join(__dirname,'../tools/verify.mjs'),path.join(root,'tools','verify.mjs'));
  const shared = path.join(root,'shared dependencies');
  fs.renameSync(path.join(root,'node_modules'),shared);
  const bin = path.join(shared,'wrangler','bin','wrangler.js');
  fs.writeFileSync(bin, 'require("node:fs").writeFileSync("worker-args.json",JSON.stringify(process.argv.slice(2)));');
  const result = spawnSync(process.execPath,[path.join(root,'tools','verify.mjs'),'worker'],{
    encoding:'utf8', env:{...process.env,NODE_PATH:shared,PYTHON:'deliberately missing Python',PATH:''},
  });
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'worker-args.json'),'utf8')),['deploy','--dry-run']);
  assert.equal(fs.existsSync(path.join(root,'node_modules')),false);
});

test('optimized stage shares hosted coverage and restores readable assembly', async t => {
  const {verify, OPTIMIZED_NODE_SUITES} = await runner;
  const root = fixture(t); const calls=[];
  assert.equal(verify(['optimized'],{root,env:{BOARD_TARGET:'local',PLAYWRIGHT_CHANNEL:'chrome'},spawn:fakeSpawn(calls),log:()=>{}}),0);
  assert.deepEqual(calls.map(call=>call.args),[
    ['build_web.py','--assemble'], [path.join(root,'tools','optimize_web.mjs')],
    [path.join(root,'tools','optimize_web.mjs'), '--check'],
    ['--test','--test-concurrency=2',...OPTIMIZED_NODE_SUITES], ['build_web.py','--assemble'],
  ]);
  assert.equal(calls[3].options.env.BOARD_TARGET,'web');
  assert.equal(calls[1].options.env.BOARD_TARGET,'local');
  assert.equal(calls[4].options.env.BOARD_TARGET,'local');
  assert.equal(calls[3].options.env.PYTHON,'/Python path/python3');
  assert.equal(calls[3].options.env.PLAYWRIGHT_CHANNEL,'chrome');
  const failed=[];
  assert.equal(verify(['optimized'],{root,spawn:fakeSpawn(failed,3),log:()=>{}}),7);
  assert.equal(failed.length,3);
  assert.throws(()=>verify(['optimized','tests/theme.test.cjs'],{root}),/does not accept extra arguments/);
});
