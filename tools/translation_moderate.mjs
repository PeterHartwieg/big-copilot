#!/usr/bin/env node
// Operator-only D1 maintenance via the existing Wrangler login. No browser
// admin endpoint, extra credential, contributor identity or save access.
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELP = `Usage: node tools/translation_moderate.mjs <command> [--remote]
  list [--lang it] [--limit 50]    Recent candidates, public counts and state
  hide <candidate-id>             Hide text and release its pin, retaining history
  restore-pin <candidate-id>      Restore text and keep it selected until unpinned
  unpin <candidate-id>            Resume voting for that candidate's entry

Defaults to local D1. --remote explicitly selects the production database.
Candidate ids are the full 64-character ids from list, including bundled text.
Pinning deliberately overrides vote totals; unpinning resumes highest-vote wins.
`;

export function moderationCommand(args) {
  const options = [...args];
  const remote = options.includes('--remote');
  if (remote) options.splice(options.indexOf('--remote'), 1);
  const action = options.shift();
  let sql;
  if (action === 'list') {
    let lang = null, limit = 50;
    while (options.length) {
      const flag = options.shift(), value = options.shift();
      if (flag === '--lang' && /^[a-z]{2}(?:-[A-Za-z]{2,8})?$/.test(value || '')) lang = value;
      else if (flag === '--limit' && /^\d+$/.test(value || '') && Number(value) >= 1 && Number(value) <= 100) limit = Number(value);
      else throw new Error('Invalid list option.');
    }
    sql = `SELECT c.id, c.lang, c.key, c.source_version, c.text, c.hidden, c.created_at,
      (SELECT COUNT(*) FROM translation_votes v WHERE v.candidate_id = c.id) AS votes,
      c.id = e.selected_id AS selected, c.id = e.pinned_id AS pinned
      FROM translation_candidates c JOIN translation_entries e
        ON e.lang = c.lang AND e.key = c.key AND e.source_version = c.source_version
      ${lang ? `WHERE c.lang = '${lang}'` : ''} ORDER BY c.created_at DESC, c.id DESC LIMIT ${limit}`;
  } else {
    const id = options.shift();
    if (!/^[a-f0-9]{64}$/.test(id || '') || options.length) throw new Error('Supply one full candidate id.');
    if (action === 'hide') sql = `UPDATE translation_candidates SET hidden = 1 WHERE id = '${id}' AND hidden = 0 RETURNING id, lang, key, hidden`;
    else if (action === 'restore-pin' || action === 'unpin') sql = `UPDATE translation_entries SET pinned_id = ${action === 'restore-pin' ? `'${id}'` : 'NULL'}
      WHERE (lang, key, source_version) = (SELECT lang, key, source_version FROM translation_candidates WHERE id = '${id}')
      RETURNING lang, key, source_version, pinned_id`;
    else throw new Error('Unknown command.');
  }
  return { sql, args: ['d1', 'execute', 'big-copilot-community', remote ? '--remote' : '--local', '--command', sql, '--json'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length < 3 || process.argv.includes('--help')) console.log(HELP);
    else {
      const command = moderationCommand(process.argv.slice(2));
      const result = spawnSync(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), ...command.args], {
        cwd: ROOT, stdio: 'inherit',
      });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    }
  } catch (error) {
    console.error(error.message);
    console.error(HELP);
    process.exitCode = 1;
  }
}
