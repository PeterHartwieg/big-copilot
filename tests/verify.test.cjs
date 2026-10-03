const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const runner = import('../tools/verify.mjs');

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'verify with spaces ')));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'tests'));
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
    ['--test', '--test-concurrency=2', path.join('tests','a.test.cjs'), path.join('tests','z.test.cjs')],
    [path.join(root,'tools','optimize_web.mjs')],
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
  assert.equal(calls[4].options.env.BOARD_TARGET,'web');
  assert.equal(calls[2].options.env.BOARD_TARGET,undefined);
  assert.equal(calls[6].options.env.BOARD_TARGET,undefined);
  assert.equal(fs.readFileSync(path.join(root,'unrelated.txt'),'utf8'), 'preserve this dirty file');
});

test('each failure stops later stages; spawn errors and signals fail safely', async t => {
  const {verify} = await runner; const root = fixture(t);
  for (let stage = 1; stage <= 8; stage++) {
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
    [['node','tests/z.test.cjs'], [['build_web.py','--assemble'], ['--test','--test-concurrency=2',path.join('tests','z.test.cjs')]]],
    [['python','tests.test_premises'], [['build_web.py','--assemble'],['-m','unittest','tests.test_premises']]],
    [['check'], [['build_web.py','--check']]],
    [['node','tests/*.test.cjs','tests/z.test.cjs'], [['build_web.py','--assemble'], ['--test','--test-concurrency=2',path.join('tests','a.test.cjs'),path.join('tests','z.test.cjs')]]],
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

test('Node shards preserve assembly, concurrency and the complete suite list', async t => {
  const {verify} = await runner; const root = fixture(t); const calls = [];
  assert.equal(verify(['node','--shard=2/4'],{root,spawn:fakeSpawn(calls),log:()=>{}}),0);
  assert.deepEqual(calls.map(c=>c.args),[
    ['build_web.py','--assemble'],
    ['--test','--test-concurrency=2','--test-shard=2/4',path.join('tests','a.test.cjs'),path.join('tests','z.test.cjs')],
  ]);
  for (const args of [
    ['node','--shard=0/4'], ['node','--shard=5/4'], ['node','--shard=1/0'],
    ['node','--shard=1.5/4'], ['node','--shard=1/4oops'], ['node','--shard'],
    ['node','--shard=1/9007199254740992'],
    ['node','--shard=1/4','tests/a.test.cjs'], ['node','--shard=1/4','--shard=2/4'],
    ['all','--shard=1/4'], ['optimized','--shard=1/4'],
  ]) {
    const rejected=[];
    assert.throws(()=>verify(args,{root,spawn:fakeSpawn(rejected),log:()=>{}}),/shard|extra arguments/);
    assert.equal(rejected.length,0,JSON.stringify(args));
  }
  const failed=[];
  assert.equal(verify(['node','--shard=2/4'],{root,spawn:fakeSpawn(failed,2),log:()=>{}}),7);
});

test('the CI matrix shards execute every discovered file once and propagate a real failure', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root,'tools'));
  fs.copyFileSync(path.join(__dirname,'../tools/verify.mjs'),path.join(root,'tools','verify.mjs'));
  fs.writeFileSync(path.join(root,'build_web.py'),'# Synthetic successful assembly.\n');
  const names = ['a','b','c','d','e','f','z'];
  for (const name of names) fs.writeFileSync(path.join(root,'tests',`${name}.test.cjs`),
    `require('node:test')('${name}', () => {\n` +
    `require('node:fs').appendFileSync('executed.txt', '${name}\\n');\n` +
    // One real failure must fail exactly the shard that contains this file.
    (name === 'c' ? `throw new Error('intentional shard failure');\n` : '') + '});\n');
  const workflow = fs.readFileSync(path.join(__dirname,'../.github/workflows/tests.yml'),'utf8');
  const shards = [...workflow.matchAll(/'(\d+\/\d+)'/g)].map(match=>match[1]);
  assert.deepEqual(shards,['1/6','2/6','3/6','4/6','5/6','6/6']);
  const statuses=[];
  // Exercise a fresh CLI invocation; Node suppresses --test inside a test child.
  const env={...process.env};
  delete env.NODE_TEST_CONTEXT;
  for (const shard of shards) {
    const result = spawnSync(process.execPath,[path.join(root,'tools','verify.mjs'),'node',`--shard=${shard}`],{cwd:root,encoding:'utf8',env});
    assert.ifError(result.error);
    assert.ok([0,1].includes(result.status),result.stderr);
    statuses.push(result.status);
  }
  assert.deepEqual(statuses.slice().sort(),[0,0,0,0,0,1]);
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
    ['--test','--test-concurrency=2',...OPTIMIZED_NODE_SUITES], ['build_web.py','--assemble'],
  ]);
  assert.equal(calls[2].options.env.BOARD_TARGET,'web');
  assert.equal(calls[1].options.env.BOARD_TARGET,'local');
  assert.equal(calls[3].options.env.BOARD_TARGET,'local');
  assert.equal(calls[2].options.env.PYTHON,'/Python path/python3');
  assert.equal(calls[2].options.env.PLAYWRIGHT_CHANNEL,'chrome');
  const failed=[];
  assert.equal(verify(['optimized'],{root,spawn:fakeSpawn(failed,3),log:()=>{}}),7);
  assert.equal(failed.length,3);
  assert.throws(()=>verify(['optimized','tests/theme.test.cjs'],{root}),/does not accept extra arguments/);
});
