#!/usr/bin/env node
// npm run deploy: assemble web/ from this checkout, then publish it.
//
// The code-derived files under web/ are not committed (.gitignore), so the
// site exists only after `python build_web.py --assemble`. This script refuses
// to publish anything but a committed HEAD that contains origin/main:
//   1. the working tree is clean (nothing modified, staged or untracked);
//   2. origin/main, freshly fetched, is an ancestor of HEAD
//      (docs/contributing.md, "Deployment baseline");
//   3. assembling leaves every committed file as it is, and --check agrees.
// Then it optimizes the generated page and runs `wrangler deploy --config wrangler.jsonc`. Extra arguments go
// to wrangler, so `npm run deploy -- --dry-run` runs every step but the upload.
// Once the page is optimized it assembles again whether wrangler succeeds or
// fails, so web/ ends up holding the readable page that --check compares.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export class DeployStop extends Error {}

function stop(message) {
  throw new DeployStop(message);
}

// Minify web/ in place and check the emitted assets against the raw page.
async function optimizeHosted(root) {
  const { optimizeWeb, checkOptimized } = await import('./optimize_web.mjs');
  const raw = readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
  optimizeWeb(root);
  const stale = checkOptimized(root, raw);
  if (stale.length) stop(`optimized assets differ: ${stale.join(', ')}`);
}

export async function deploy(args = [], {
  root = ROOT, env = process.env, spawn = spawnSync, optimize = optimizeHosted, log = console.log,
} = {}) {
  const run = (cmd, cmdArgs) => {
    const shown = [cmd, ...cmdArgs].join(' ');
    log(`> ${shown}`);
    // No shell, on Windows too, so a path or an argument with spaces stays one argument.
    const result = spawn(cmd, cmdArgs, { cwd: root, stdio: 'inherit' });
    if (result.error) stop(`${shown}: ${result.error.message}`);
    return result.status;
  };
  const output = (cmd, cmdArgs) => {
    const result = spawn(cmd, cmdArgs, { cwd: root, encoding: 'utf8' });
    if (result.error) stop(`${cmd} ${cmdArgs.join(' ')}: ${result.error.message}`);
    if (result.status !== 0) stop(`${cmd} ${cmdArgs.join(' ')} failed:\n${result.stderr}`);
    return result.stdout;
  };
  const dirty = () => output('git', ['status', '--porcelain']).split('\n').filter(Boolean);
  // The Python that runs build_web.py: $PYTHON, else the first of python3,
  // python and py that answers.
  const python = () => {
    for (const cmd of [env.PYTHON, 'python3', 'python', 'py'].filter(Boolean)) {
      const probe = spawn(cmd, ['--version'], { encoding: 'utf8' });
      if (!probe.error && probe.status === 0) return cmd;
    }
    stop('no Python found; set PYTHON to its path');
  };

  let changed = dirty();
  if (changed.length) stop(`the working tree is not clean; commit or stash first:\n${changed.join('\n')}`);

  if (run('git', ['fetch', 'origin']) !== 0) stop('git fetch origin failed');
  if (run('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']) !== 0) {
    stop('origin/main is not an ancestor of HEAD; merge or check out an up-to-date main first');
  }

  const py = python();
  if (run(py, ['build_web.py', '--assemble']) !== 0) stop('python build_web.py --assemble failed');
  changed = dirty();
  if (changed.length) {
    stop('assembling changed committed files, so main is stale; rebuild and commit these first:\n'
      + changed.join('\n'));
  }
  if (run(py, ['build_web.py', '--check']) !== 0) stop('python build_web.py --check reports stale files');

  // wrangler's own entry point, run by this Node: no .cmd shim, so no shell on Windows.
  const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (!existsSync(wrangler)) stop('node_modules/wrangler is missing; run npm ci');

  // Check the reproducible Python output first; minification only changes the
  // ignored deployment artifact. From here on web/ holds the minified page and
  // web/assets/board-*, so assemble again however the deploy ends: --check and
  // the tests compare the readable page.
  try {
    try {
      await optimize(root);
    } catch (err) {
      if (err instanceof DeployStop) throw err;
      stop(`page optimization failed: ${err.message}; ensure dependencies are installed with npm ci`);
    }
    return run(process.execPath, [wrangler, 'deploy', '--config', 'wrangler.jsonc', ...args]) ?? 1;
  } finally {
    let restored = false;
    try { restored = run(py, ['build_web.py', '--assemble']) === 0; } catch (err) { console.error(err.message); }
    if (!restored) {
      console.error('deploy: re-assembling the readable page failed; web/ still holds the minified page, '
        + 'so run python build_web.py --assemble before --check or the tests');
    }
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await deploy(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof DeployStop)) throw err;
    console.error(`deploy stopped: ${err.message}`);
    process.exitCode = 1;
  }
}
