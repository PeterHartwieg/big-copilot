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
  hide <request-id> [...]    Hide up to 100 requests and delete their vote hashes
  purge <request-id>         Permanently erase this record, its aliases and votes
  restore <request-id>       Restore hidden text; voting starts afresh
  retire <request-id>        Close shipped/declined requests and delete vote hashes
  merge <source> <target>    Union votes of two active visitor requests; keep target

Defaults to local D1; --remote explicitly selects production.
IDs include request- and all 64 hexadecimal characters. Curated polls cannot merge.
Mutations use exact listed IDs; merged aliases cannot hide or retire a survivor.
Restore does not revive retired ideas.
Purge is irreversible: purging an alias erases that alias only, not its survivor.
To continue a list, pass the last row's list_cursor as --before.
`;
const key = value => {
  if (!/^request-[a-f0-9]{64}$/.test(value || '')) throw new Error('Supply a full visitor request id.');
  return value.slice(8);
};
export function moderationCommand(args) {
  const options = [...args], remote = options.includes('--remote');
  if (remote) options.splice(options.indexOf('--remote'), 1);
  const action = options.shift();
  let sql, requested = [], targetId = null;
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
  } else if (action === 'hide') {
    if (!options.length || options.length > 100) throw new Error('Hide takes 1–100 visitor request IDs.');
    const ids = [...new Set(options.map(key))];
    requested = ids;
    sql = `UPDATE feature_requests SET state = 'hidden' WHERE id IN (${ids.map(id=>`'${id}'`).join(',')})
      AND state = 'active' RETURNING id,state`;
  } else {
    const id = key(options.shift());
    requested = [id];
    if (action === 'merge') {
      const target = key(options.shift());
      targetId = target;
      if (options.length) throw new Error('Unexpected argument.');
      sql = `UPDATE feature_requests SET state = 'merged', canonical_id = '${target}'
        WHERE id = '${id}' AND state = 'active' RETURNING id,state,canonical_id`;
    } else if (action === 'purge') {
      if (options.length) throw new Error('Unexpected argument.');
      sql = `DELETE FROM feature_requests WHERE id = '${id}' RETURNING id,state`;
    } else {
      if (options.length) throw new Error('Unexpected argument.');
      const choices = {hide: ['hidden', "state = 'active'"], restore: ['active', "state = 'hidden'"],
        retire: ['retired', "state IN ('active','hidden')"]};
      const choice = choices[action];
      if (!choice) throw new Error('Unknown command.');
      sql = `UPDATE feature_requests SET state = '${choice[0]}' WHERE id = '${id}' AND ${choice[1]}
        RETURNING id,state`;
    }
  }
  const inspectSql = requested.length ? `SELECT id,state FROM feature_requests WHERE id IN (${[...requested,...(targetId?[targetId]:[])].map(id=>`'${id}'`).join(',')})` : null;
  return {sql, requested, targetId, inspectSql, args: ['d1','execute','big-copilot-community',remote ? '--remote' : '--local','--command',sql,'--json']};
}

export function moderationOutcome(command, rows, states = []) {
  const changed = new Set(rows.map(row=>row.id));
  return {exitCode:command.requested.some(id=>!changed.has(id)) ? 1 : 0,
    changed: rows.map(row=>({...row,id:'request-'+row.id})),
    unchanged: command.requested.filter(id=>!changed.has(id)).map(id=>({id:'request-'+id,
      state:states.find(row=>row.id===id)?.state || 'missing'})),
    ...(command.targetId ? {target:{id:'request-'+command.targetId,
      state:states.find(row=>row.id===command.targetId)?.state || 'missing'}} : {})};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length < 3 || process.argv.includes('--help')) console.log(HELP);
    else {
      const command = moderationCommand(process.argv.slice(2));
      const require = createRequire(import.meta.url);
      const wrangler = path.join(path.dirname(require.resolve('wrangler/package.json')), 'bin', 'wrangler.js');
      const execute = args => {
        const result = spawnSync(process.execPath, [wrangler, ...args],
          {cwd: ROOT, encoding:'utf8', maxBuffer:10*1024*1024});
        if (result.error) throw result.error;
        if (result.stderr) process.stderr.write(result.stderr);
        if (result.status !== 0) throw new Error(result.stdout || 'Wrangler failed.');
        const parsed = JSON.parse(result.stdout);
        if (!Array.isArray(parsed) || parsed.some(result=>result.success!==true || !Array.isArray(result.results)))
          throw new Error('Unexpected Wrangler JSON result.');
        return parsed.flatMap(result=>result.results);
      };
      let rows = [], rejection = null;
      try { rows = execute(command.args); }
      catch (error) {
        if (!command.requested.length) throw error;
        rejection = error.message;
      }
      if (!command.requested.length) console.log(JSON.stringify(rows,null,2));
      else {
        let states = [], inspectionError = null;
        try { states = execute(command.args.map((arg,i)=>i===command.args.indexOf('--command')+1?command.inspectSql:arg)); }
        catch (error) { inspectionError = error.message; }
        const outcome = moderationOutcome(command,rows,states);
        if (rejection) { outcome.rejection = rejection; outcome.exitCode = 1; }
        if (inspectionError) {
          outcome.inspectionError = inspectionError; outcome.exitCode = 1;
          outcome.unchanged.forEach(row=>{ row.state = 'unknown'; });
          if (outcome.target) outcome.target.state = 'unknown';
        }
        console.log(JSON.stringify(outcome,null,2));
        process.exitCode = outcome.exitCode;
        if (outcome.unchanged.length) console.error('No change for the requested IDs listed as unchanged.');
      }
    }
  } catch (error) { console.error(error.message); console.error(HELP); process.exitCode = 1; }
}
