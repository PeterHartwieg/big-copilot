#!/usr/bin/env node
// npm run deploy: assemble web/ from this checkout, then publish it.
//
// The code-derived files under web/ are not committed (.gitignore), so the
// site exists only after `python build_web.py --assemble`. This script refuses
// to publish anything a commit on main does not describe:
//   1. the working tree is clean (nothing modified, staged or untracked);
//   2. origin/main, freshly fetched, is an ancestor of HEAD
//      (docs/contributing.md, "Deployment baseline");
//   3. assembling leaves every committed file as it is, and --check agrees.
// Then it runs `wrangler deploy --config wrangler.jsonc`. Extra arguments go
// to wrangler, so `npm run deploy -- --dry-run` runs every step but the upload.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function run(cmd, args, options = {}) {
  const shown = [cmd, ...args].join(' ');
  console.log(`> ${shown}`);
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32', ...options });
  if (result.error) stop(`${shown}: ${result.error.message}`);
  return result.status;
}

function output(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  if (result.error) stop(`${cmd} ${args.join(' ')}: ${result.error.message}`);
  if (result.status !== 0) stop(`${cmd} ${args.join(' ')} failed:\n${result.stderr}`);
  return result.stdout;
}

function stop(message) {
  console.error(`deploy stopped: ${message}`);
  process.exit(1);
}

function dirty() {
  // node_modules may be a symlink to another checkout's, which the
  // directory-only node_modules/ ignore rule does not cover.
  return output('git', ['status', '--porcelain'])
    .split('\n').filter(line => line && line.slice(3) !== 'node_modules');
}

// The Python that runs build_web.py: $PYTHON, else the first of python3,
// python and py that answers.
function python() {
  for (const cmd of [process.env.PYTHON, 'python3', 'python', 'py'].filter(Boolean)) {
    const probe = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (!probe.error && probe.status === 0) return cmd;
  }
  stop('no Python found; set PYTHON to its path');
}

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

const status = run('wrangler', ['deploy', '--config', 'wrangler.jsonc', ...process.argv.slice(2)]);
process.exit(status ?? 1);
