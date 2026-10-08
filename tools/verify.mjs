#!/usr/bin/env node
// Local verification and CI share these stages. No shell, credentials or Git checks.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const NODE_CONCURRENCY = 2;
// A sharded lane also prints each file's seconds for tools/shard_weights.mjs.
export const SHARD_REPORTERS = ['--test-reporter=spec', '--test-reporter-destination=stdout',
  `--test-reporter=${pathToFileURL(path.join(ROOT, 'tools', 'shard_times.mjs')).href}`, '--test-reporter-destination=stdout'];
// One smoke journey against the actual deployment transform. The ordinary Node
// suite already runs CSP/Pyodide against the emitted hosted asset set and checks the optimizer
// itself; repeating those or every functional browser suite adds no useful gate.
export const OPTIMIZED_NODE_SUITES = ['release'].map(name => path.join('tests', `${name}.test.cjs`));

export function selectPython(env = process.env, spawn = spawnSync) {
  const explicit = Object.hasOwn(env, 'PYTHON');
  const candidates = explicit ? [env.PYTHON] : ['python3', 'python', 'py'];
  for (const command of candidates) {
    if (!command) break;
    const probe = spawn(command, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', env });
    if (!probe.error && probe.status === 0 && probe.stdout?.trim()) return probe.stdout.trim();
  }
  throw new Error(explicit
    ? `PYTHON override is invalid: ${env.PYTHON || '(empty)'}; set it to a Python executable path`
    : 'no Python found; install Python 3 or set PYTHON to its executable path');
}

export function nodeFiles(root, requested = []) {
  const files = readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.cjs')).sort();
  if (!requested.length) return files.map(name => `tests/${name}`);
  return [...new Set(requested.flatMap(file => {
    const relative = path.relative(root, path.resolve(root, file));
    const name = path.basename(relative);
    // A small filename-only wildcard keeps quoted focused patterns portable.
    const pattern = new RegExp('^' + name.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    const matches = path.dirname(relative) === 'tests' ? files.filter(candidate => pattern.test(candidate)) : [];
    if (!matches.length) throw new Error(`unknown Node suite: ${file}; use tests/<name>.test.cjs`);
    return matches.map(match => `tests/${match}`);
  }))];
}

// Longest-processing-time first; equal weights use filename order and equal
// lane totals use lane index. Stale weights cannot affect the median fallback.
export function assignShards(files, weights, total) {
  if (!Number.isSafeInteger(total) || total < 1) throw new Error('invalid shard total');
  const known = files.map(file => weights[file]).filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const middle = Math.floor(known.length / 2);
  const fallback = known.length ? (known.length % 2 ? known[middle] : (known[middle - 1] + known[middle]) / 2) : 1;
  const weight = file => Number.isFinite(weights[file]) && weights[file] > 0 ? weights[file] : fallback;
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const lanes = Array.from({ length: total }, () => []);
  const sums = Array(total).fill(0);
  for (const file of [...new Set(files)].sort((a, b) => weight(b) - weight(a) || compare(a, b))) {
    let lane = 0;
    for (let i = 1; i < total; i++) if (sums[i] < sums[lane]) lane = i;
    lanes[lane].push(file);
    sums[lane] += weight(file);
  }
  // Heaviest first within a lane: node --test starts files in this order, so
  // a giant suite starts at once instead of after its lighter neighbours.
  return lanes;
}

export function shardWeights(root = ROOT) {
  return JSON.parse(readFileSync(path.join(root, 'tests', 'shard-weights.json'), 'utf8'));
}

export function pythonModules(root, python, env, spawn = spawnSync) {
  const result = spawn(python, ['tools/python_shard.py', '--list'], { cwd: root, env, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`Python discovery failed: ${result.error?.message || result.stderr || result.signal || result.status}`);
  return JSON.parse(result.stdout);
}

export function verify(args = [], { root = ROOT, env = process.env, spawn = spawnSync, log = console.log } = {}) {
  const [stage = 'all', ...focused] = args;
  if (!['all', 'assemble', 'python', 'node', 'optimized', 'worker', 'check'].includes(stage)) throw new Error(`unknown stage: ${stage}`);
  if (focused.length && !['node', 'python'].includes(stage)) throw new Error(`${stage} does not accept extra arguments`);
  // Explicit CLI option, never an environment variable: the full local gate must
  // always run every suite, even when launched from a sharded CI environment.
  let shard;
  if (['node', 'python'].includes(stage) && focused[0]?.startsWith('--shard')) {
    const match = /^--shard=([1-9]\d*)\/([1-9]\d*)$/.exec(focused.shift());
    if (!match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2])) || Number(match[1]) > Number(match[2])) {
      throw new Error(`invalid ${stage} shard; use --shard=index/total with 1 <= index <= total`);
    }
    if (focused.length) throw new Error('sharding runs the full suite list; do not combine it with focused suites');
    shard = { index: Number(match[1]) - 1, total: Number(match[2]) };
  }
  const python = stage === 'worker' ? null : selectPython(env, spawn);
  const childEnv = python ? { ...env, PYTHON: python } : { ...env };
  const run = (command, commandArgs, envOverrides = {}) => {
    log(`> ${JSON.stringify([command, ...commandArgs])}`);
    const result = spawn(command, commandArgs, { cwd: root, env: { ...childEnv, ...envOverrides }, stdio: 'inherit' });
    if (result.error) throw new Error(`${command}: ${result.error.message}`);
    if (result.signal) throw new Error(`${command} stopped by ${result.signal}`);
    return result.status ?? 1;
  };
  // Resolve focused filenames before assembling, so an invalid invocation changes nothing.
  let files = ['all', 'node'].includes(stage) ? nodeFiles(root, focused) : [];
  let modules;
  let assembled = false;
  if (shard) {
    const weights = shardWeights(root);
    // Discovery imports modules. Like unittest's ordinary stage, it must see
    // the assembled web tree even in a fresh checkout.
    if (stage === 'python') {
      const status = run(python, ['build_web.py', '--assemble']);
      if (status !== 0) return status;
      assembled = true;
    }
    const suites = stage === 'node' ? files : pythonModules(root, python, childEnv, spawn);
    const selected = assignShards(suites, weights[stage] || {}, shard.total)[shard.index];
    if (!selected.length) throw new Error(`${stage} shard is empty; use no more lanes than discovered suites`);
    log(`${stage} shard ${shard.index + 1}/${shard.total}: ${selected.join(', ')}`);
    if (stage === 'node') files = selected; else modules = selected;
  }
  const commands = [];
  if (!assembled && ['all', 'assemble', 'python', 'node', 'optimized'].includes(stage)) commands.push([python, ['build_web.py', '--assemble']]);
  if (['all', 'python'].includes(stage)) commands.push([python, modules
    ? ['tools/python_shard.py', ...modules]
    : ['-m', 'unittest', ...(focused.length ? focused : ['discover', '-s', 'tests'])]]);
  if (['all', 'node'].includes(stage)) commands.push([process.execPath, ['--test', `--test-concurrency=${NODE_CONCURRENCY}`, ...(shard ? SHARD_REPORTERS : []), ...files]]);
  if (['all', 'optimized'].includes(stage)) {
    // Load esbuild only in this child; assemble/Python CI jobs need no npm install.
    commands.push([process.execPath, [path.join(root, 'tools', 'optimize_web.mjs')]]);
    commands.push([process.execPath, [path.join(root, 'tools', 'optimize_web.mjs'), '--check']]);
    commands.push([process.execPath, ['--test', `--test-concurrency=${NODE_CONCURRENCY}`, ...OPTIMIZED_NODE_SUITES], { BOARD_TARGET: 'web' }]);
  }
  // Freshness compares readable Python output, not the deployment transform.
  if (['all', 'optimized'].includes(stage)) commands.push([python, ['build_web.py', '--assemble']]);
  if (['all', 'worker'].includes(stage)) {
    const require = createRequire(path.join(root, 'package.json'));
    let wrangler;
    try {
      const manifest = require.resolve('wrangler/package.json');
      const bin = require(manifest).bin;
      wrangler = path.resolve(path.dirname(manifest), typeof bin === 'string' ? bin : bin.wrangler);
      if (!existsSync(wrangler)) throw new Error('missing executable');
    } catch {
      throw new Error('Wrangler is missing; run npm ci or point NODE_PATH at the checkout containing node_modules');
    }
    commands.push([process.execPath, [wrangler, 'deploy', '--dry-run']]);
  }
  if (['all', 'check'].includes(stage)) commands.push([python, ['build_web.py', '--check']]);
  for (const [command, commandArgs, envOverrides] of commands) {
    const status = run(command, commandArgs, envOverrides);
    if (status !== 0) return status;
  }
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = verify(process.argv.slice(2)); }
  catch (error) { console.error(`verification stopped: ${error.message}`); process.exitCode = 1; }
}
