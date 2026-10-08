#!/usr/bin/env node
// Refresh tests/shard-weights.json from one green CI run on Linux:
//   node tools/shard_weights.mjs <run id>      (gh must be logged in)
// Every sharded lane prints "shard-weight node|python <suite> <seconds>" lines
// (tools/shard_times.mjs for Node, tools/python_shard.py for Python). The lanes
// are disjoint, so the run holds each suite once. Refresh after adding or
// growing a slow suite, then review the diff and the predicted lane sums.
// Suites the run did not time keep no weight and get the median when assigned.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, assignShards } from './verify.mjs';

export function parseWeights(logs) {
  const weights = { node: {}, python: {} };
  for (const match of logs.matchAll(/^shard-weight (node|python) (\S+) (\d+(?:\.\d+)?)\s*$/gm)) {
    weights[match[1]][match[2]] = Number(match[3]);
  }
  for (const kind of Object.keys(weights)) {
    weights[kind] = Object.fromEntries(Object.entries(weights[kind]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  return weights;
}

function gh(args) {
  const result = spawnSync('gh', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`gh ${args.join(' ')}: ${result.error?.message || result.stderr}`);
  return result.stdout;
}

function main(run) {
  if (!/^\d+$/.test(run || '')) throw new Error('usage: node tools/shard_weights.mjs <run id>');
  const jobs = JSON.parse(gh(['api', `repos/{owner}/{repo}/actions/runs/${run}/jobs?per_page=100`])).jobs
    .filter(job => /^(Node|Python) \(\d+\/\d+\)$/.test(job.name));
  if (!jobs.length) throw new Error(`run ${run} has no sharded lanes`);
  const failed = jobs.filter(job => job.conclusion !== 'success');
  if (failed.length) throw new Error(`refresh from a green run; not green: ${failed.map(job => job.name).join(', ')}`);
  const logs = jobs.map(job => gh(['api', `repos/{owner}/{repo}/actions/jobs/${job.id}/logs`])).join('\n');
  // Strip the runner's timestamp prefix so each weight line starts the line.
  const weights = parseWeights(logs.replace(/^\S+Z /gm, ''));
  for (const [kind, total] of [['node', 8], ['python', 2]]) {
    if (!Object.keys(weights[kind]).length) throw new Error(`no ${kind} weights in run ${run}`);
    const lanes = assignShards(Object.keys(weights[kind]), weights[kind], total);
    console.log(`${kind}: ${Object.keys(weights[kind]).length} suites; predicted lane seconds ` +
      JSON.stringify(lanes.map(lane => Math.round(lane.reduce((sum, suite) => sum + weights[kind][suite], 0)))));
  }
  writeFileSync(path.join(ROOT, 'tests', 'shard-weights.json'), JSON.stringify(weights, null, 1) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'tools', 'shard_weights.mjs')) {
  try { main(process.argv[2]); }
  catch (error) { console.error(`shard weights not refreshed: ${error.message}`); process.exitCode = 1; }
}
