// tools/deploy.mjs with every command stubbed: nothing here fetches, builds or
// reaches Cloudflare. It holds the restore: once the page is optimized, the
// deploy assembles again whether wrangler succeeds or fails.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const deployer = import('../tools/deploy.mjs');

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'deploy ')));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'node_modules', 'wrangler', 'bin'), {recursive: true});
  fs.writeFileSync(path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), '');
  return root;
}

// Each call is recorded by a short label: the git subcommand, build_web.py's
// flag, or "wrangler" with its arguments. Every command succeeds but the ones
// `fail` names ('--check', 'wrangler', ...), which get that result instead.
function fakeSpawn(calls, fail = {}) {
  return (command, args) => {
    if (args[0] === '--version') return {status: 0};
    if (command === 'git' && args[0] === 'status') return {status: 0, stdout: ''};
    const key = args[0] === 'build_web.py' ? args[1]
      : path.basename(args[0]) === 'wrangler.js' ? 'wrangler' : args[0];
    calls.push(key === 'wrangler' ? ['wrangler', ...args.slice(1)].join(' ') : key);
    return fail[key] || {status: 0};
  };
}

async function deployWith(t, fail = {}, optimize = async () => {}) {
  const {deploy} = await deployer;
  const calls = [];
  const root = fixture(t);
  const optimized = [];
  const run = deploy(['--dry-run'], {
    root, env: {PYTHON: 'python-test'}, spawn: fakeSpawn(calls, fail), log: () => {},
    optimize: async where => { optimized.push(where); calls.push('optimize'); return optimize(); },
  });
  return {run, calls, optimized, root};
}

test('a successful deploy publishes the optimized page, then assembles the readable one', async t => {
  const {run, calls, optimized, root} = await deployWith(t);
  assert.equal(await run, 0);
  assert.deepEqual(calls, ['fetch', 'merge-base', '--assemble', '--check', 'optimize',
    'wrangler deploy --config wrangler.jsonc --dry-run', '--assemble']);
  assert.deepEqual(optimized, [root]);
});

test('a failed wrangler run keeps its status and still restores the readable page', async t => {
  const {run, calls} = await deployWith(t, {wrangler: {status: 3}});
  assert.equal(await run, 3);
  assert.deepEqual(calls.slice(-2), ['wrangler deploy --config wrangler.jsonc --dry-run', '--assemble']);
});

test('a wrangler that cannot start or is killed still restores the readable page', async t => {
  const {DeployStop} = await deployer;
  const failed = await deployWith(t, {wrangler: {error: new Error('cannot spawn')}});
  await assert.rejects(failed.run, err => err instanceof DeployStop && /cannot spawn/.test(err.message));
  assert.equal(failed.calls.at(-1), '--assemble');
  const killed = await deployWith(t, {wrangler: {status: null, signal: 'SIGTERM'}});
  assert.equal(await killed.run, 1);
  assert.equal(killed.calls.at(-1), '--assemble');
});

test('a failed optimization skips wrangler and still restores the readable page', async t => {
  const {DeployStop} = await deployer;
  const {run, calls} = await deployWith(t, {}, async () => { throw new Error('esbuild missing'); });
  await assert.rejects(run, err => err instanceof DeployStop && /page optimization failed: esbuild missing/.test(err.message));
  assert.deepEqual(calls.slice(-2), ['optimize', '--assemble']);
});

test('a stop before optimizing leaves the assembled page as it is', async t => {
  const {DeployStop} = await deployer;
  const {run, calls} = await deployWith(t, {'--check': {status: 1}});
  await assert.rejects(run, err => err instanceof DeployStop && /reports stale files/.test(err.message));
  assert.deepEqual(calls, ['fetch', 'merge-base', '--assemble', '--check']);
});

test('Ctrl-C during the deploy cannot end the script before the restore', async t => {
  const {deploy} = await deployer;
  const root = fixture(t);
  const before = process.listenerCount('SIGINT');
  const seen = [];
  const spawn = (command, args) => {
    if (args[0] === '--version') return {status: 0};
    if (command === 'git' && args[0] === 'status') return {status: 0, stdout: ''};
    if (path.basename(args[0]) === 'wrangler.js') {
      seen.push(['wrangler', process.listenerCount('SIGINT')]);
      return {status: null, signal: 'SIGINT'};
    }
    if (args[1] === '--assemble') seen.push(['--assemble', process.listenerCount('SIGINT')]);
    return {status: 0};
  };
  assert.equal(await deploy([], {root, env: {PYTHON: 'python-test'}, spawn, log: () => {}, optimize: async () => {}}), 1);
  // A handler of its own while wrangler and the restore run; none left after.
  assert.deepEqual(seen, [['--assemble', before], ['wrangler', before + 1], ['--assemble', before + 1]]);
  assert.equal(process.listenerCount('SIGINT'), before);
});
