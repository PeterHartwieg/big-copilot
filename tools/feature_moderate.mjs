#!/usr/bin/env node
// Operator-only, local by default. No public moderation endpoint or new secret.
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELP = `Usage: node tools/feature_moderate.mjs <command> [--remote]
  list [--limit 50] [--before <list_cursor>]
                            Requests, aliases, state and public vote counts
  hide <request-id>          Hide text and immediately delete its vote hashes
  restore <request-id>       Restore hidden text; voting starts afresh
  retire <request-id>        Close shipped/declined requests and delete vote hashes
  merge <source> <target>    Union votes of two active visitor requests; keep target

Defaults to local D1; --remote explicitly selects production.
IDs include request- and all 64 hexadecimal characters. Curated polls cannot merge.
Merged aliases follow the surviving request. Restore does not revive retired ideas.
To continue a list, pass the last row's list_cursor as --before.
`;
const key = value => {
  if (!/^request-[a-f0-9]{64}$/.test(value || '')) throw new Error('Supply a full visitor request id.');
  return value.slice(8);
};
const canonical = id => `(SELECT COALESCE(canonical_id,id) FROM feature_requests WHERE id = '${id}')`;
export function moderationCommand(args) {
  const options = [...args], remote = options.includes('--remote');
  if (remote) options.splice(options.indexOf('--remote'), 1);
  const action = options.shift();
  let sql;
  if (action === 'list') {
    let limit = 50;
    let before = '', seen = new Set();
    while (options.length) {
      const option = options.shift(), value = options.shift();
      if (seen.has(option)) throw new Error('Repeated list option.');
      seen.add(option);
      if (option === '--limit') {
        if (!/^\d+$/.test(value || '') || +value < 1 || +value > 100) throw new Error('List limit must be 1–100.');
        limit = +value;
      } else if (option === '--before') {
        const cursor = /^(0|[1-9][0-9]*):(request-[a-f0-9]{64})$/.exec(value || '');
        if (!cursor || !Number.isSafeInteger(+cursor[1])) throw new Error('Use the last row’s list_cursor.');
        before = `WHERE (r.created_at,r.id) < (${cursor[1]},'${key(cursor[2])}')`;
      } else throw new Error('Unexpected list option.');
    }
    sql = `SELECT 'request-' || r.id AS id,r.title,r.description,r.state,
      CASE WHEN r.canonical_id IS NOT NULL THEN 'request-' || r.canonical_id END AS canonical_id,
      r.created_at,r.created_at || ':request-' || r.id AS list_cursor,
      (SELECT COUNT(*) FROM feature_request_votes v WHERE v.request_id = COALESCE(r.canonical_id,r.id)) AS votes
      FROM feature_requests r ${before} ORDER BY r.created_at DESC,r.id DESC LIMIT ${limit}`;
  } else {
    const id = key(options.shift());
    if (action === 'merge') {
      const target = key(options.shift());
      if (options.length) throw new Error('Unexpected argument.');
      sql = `UPDATE feature_requests SET state = 'merged', canonical_id = ${canonical(target)}
        WHERE id = ${canonical(id)} AND state = 'active' RETURNING id,state,canonical_id`;
    } else {
      if (options.length) throw new Error('Unexpected argument.');
      const choices = {hide: ['hidden', "state = 'active'"], restore: ['active', "state = 'hidden'"],
        retire: ['retired', "state IN ('active','hidden')"]};
      const choice = choices[action];
      if (!choice) throw new Error('Unknown command.');
      sql = `UPDATE feature_requests SET state = '${choice[0]}' WHERE id = ${canonical(id)} AND ${choice[1]}
        RETURNING id,state`;
    }
  }
  return {sql, args: ['d1','execute','big-copilot-community',remote ? '--remote' : '--local','--command',sql,'--json']};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length < 3 || process.argv.includes('--help')) console.log(HELP);
    else {
      const command = moderationCommand(process.argv.slice(2));
      const require = createRequire(import.meta.url);
      const result = spawnSync(process.execPath, [require.resolve('wrangler/bin/wrangler.js'), ...command.args], {cwd: ROOT, stdio: 'inherit'});
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    }
  } catch (error) { console.error(error.message); console.error(HELP); process.exitCode = 1; }
}
