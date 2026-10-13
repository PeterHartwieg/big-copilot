'use strict';
// Shared set-up for the community API suites (tests/community-*.test.cjs).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'migrations');

// Applies every migrations/*.sql file in order, each as one whole file, the way
// `wrangler d1 migrations apply` does. D1's exec() takes one statement per line,
// so it cannot run a migration; a prepared statement runs every statement in it.
async function migrate(db) {
  for (const file of fs.readdirSync(MIGRATIONS).filter(name => name.endsWith('.sql')).sort()) {
    await db.prepare(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8')).run();
  }
}

// The Worker as one classic script that sets globalThis.worker, for running in a
// node:vm context with synthetic Web API globals. `features` stands in for
// server/features.json.
async function vmWorkerSource(features) {
  const result = await require('esbuild').build({
    stdin: {resolveDir: ROOT, contents: "import worker from './server/worker.mjs'; globalThis.worker = worker;"},
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    plugins: [{name: 'test-ballot', setup(build) {
      build.onLoad({filter: /[\\/]server[\\/]features\.json$/},
        () => ({contents: JSON.stringify(features), loader: 'json'}));
    }}],
  });
  return result.outputFiles[0].text;
}

module.exports = {migrate, vmWorkerSource};
