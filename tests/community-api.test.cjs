'use strict';

/**
 * Community API contract tests (docs/community-features-plan.md, "API contract").
 *
 * Runs the real worker (server/worker.mjs) inside Miniflare with an in-memory D1
 * database, the COMMUNITY_IP_SECRET binding, a simulated simple rate limiter and a
 * stubbed ASSETS service binding. Exercises only the public HTTP contract:
 *
 *   POST /api/community/presence  {browserId}   -> {count, countedAt, nextHeartbeatIn}
 *   GET  /api/community/features                -> {features:[{id,title,description,votes,voted}]}
 *   POST /api/community/vote      {featureId}   -> the voted feature incl. voted:true
 *
 * Assumptions (adjust in one place if the migration spells names differently):
 *   - Table/column names below (SCHEMA); migrations/0001_community.sql is the schema
 *     contract. Everything else is discovered through the public API.
 *   - Curated feature ids are read at runtime from GET /api/community/features.
 *   - Public count aggregate may lag <=60s; unique per-test origins give exact reads.
 *   - Bodies larger than 1024 bytes -> 413. Five-minute cadence, ten-minute expiry.
 *
 * Tests run sequentially (default node:test); each starts with a cleared database
 * and its own Origin + synthetic CF-Connecting-IP, so no shared state leaks.
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {Miniflare, convertV4MiniflareOptions, Response} = require('miniflare');

const ROOT = path.join(__dirname, '..');
const WORKER_PATH = path.join(ROOT, 'server', 'worker.mjs');
const MIGRATION_PATH = path.join(ROOT, 'migrations', '0001_community.sql');

// Schema contract defined by migrations/0001_community.sql (only place that may
// need updating if the migration names tables/columns differently).
const SCHEMA = {
  presenceTable: 'community_presence',
  presenceBrowserId: 'browser_id',
  presenceLastSeen: 'last_seen',
  votesTable: 'community_votes',
  votesFeatureId: 'feature_id',
  votesIpHash: 'voter_hash',
};

const HEARTBEAT_CADENCE = 300; // seconds, per contract
const EXPIRY_WINDOW = 600; // seconds (ten minutes), per plan
const MAX_BODY_BYTES = 1024; // per plan/task: larger bodies get 413

const nowSec = () => Math.floor(Date.now() / 1000);

let mf = null; // shared instance for the standard configuration
let db = null; // its D1 database
let workerScript = '';
let ipCounter = 0;

/* ---------------------------------------------------------------- helpers */

function bundleWorker() {
  const result = require('esbuild').buildSync({
    stdin: {resolveDir:ROOT, contents:`
      import worker from './server/worker.mjs';
      export default {...worker, async fetch(request,env,ctx) {
        if(new URL(request.url).pathname==='/__test/scheduled') {
          await worker.scheduled({cron:'17 3 * * *',scheduledTime:Date.now()},env,ctx);
          return new Response('scheduled');
        }
        let reads=0,writes=0;
        const db=env.COMMUNITY_DB;
        const tracked={prepare:sql=>db.prepare(sql),batch:async statements=>{
          const results=await db.batch(statements);
          for(const result of results){reads+=result.meta.rows_read;writes+=result.meta.rows_written;}
          return results;
        }};
        const result=await worker.fetch(request,{...env,COMMUNITY_DB:tracked},ctx);
        const response=new Response(result.body,result);
        response.headers.set('x-test-rows-read',String(reads));
        response.headers.set('x-test-rows-written',String(writes));
        return response;
      }};`},
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  });
  return result.outputFiles[0].text;
}

function baseOptions() {
  return {
    modules: true,
    script: workerScript,
    compatibilityDate: '2026-09-01',
    d1Databases: ['COMMUNITY_DB'],
    bindings: { COMMUNITY_IP_SECRET: 'local-test-secret-not-production' },
    ratelimits: {
      COMMUNITY_LIMITER: { namespace_id: '1001', simple: { limit: 120, period: 60 } },
    },
    serviceBindings: {
      ASSETS: async () => new Response('static fixture'),
    },
  };
}

/** Strip comments, then split the migration into single statements for D1. */
async function applyMigration(target) {
  const raw = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const noComments = raw
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  const statements = noComments
    .split(';')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
  assert.ok(statements.length > 0, 'migrations/0001_community.sql contained no statements');
  for (const stmt of statements) await target.prepare(stmt).run();
}

function originFor(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `https://${slug}.test`;
}

function nextIp() {
  ipCounter += 1;
  return `10.77.${Math.floor(ipCounter / 250) % 256}.${(ipCounter % 250) + 1}`;
}

function apiFetch(mfInst, origin, method, pathname, { body, ip, contentType } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  if (ip) headers['CF-Connecting-IP'] = ip;
  if (body !== undefined) headers['content-type'] = contentType || 'application/json';
  return mfInst.dispatchFetch(new URL(pathname, origin).toString(), {
    method,
    headers,
    body,
  });
}

const postJSON = (mfInst, origin, pathname, payload, ip) =>
  apiFetch(mfInst, origin, 'POST', pathname, {
    body: JSON.stringify(payload),
    ip,
  });

const heartbeat = (browserId, { origin, ip, mfInst = mf } = {}) =>
  postJSON(mfInst, origin, '/api/community/presence', { browserId }, ip);

async function expectJSON(res, status, label) {
  assert.equal(res.status, status, `${label}: expected HTTP ${status}`);
  const ct = res.headers.get('content-type') || '';
  assert.ok(
    ct.includes('application/json'),
    `${label}: expected a JSON body, got content-type "${ct}"`,
  );
  const body = await res.json();
  assert.ok(body && typeof body === 'object', `${label}: expected a JSON object body`);
  return body;
}

/** All application API errors are JSON and must never leak raw driver output. */
async function expectRejected(res, label) {
  assert.ok(
    res.status >= 400 && res.status < 500,
    `${label}: expected a 4xx rejection, got HTTP ${res.status}`,
  );
  const body = await expectJSON(res, res.status, label);
  const text = JSON.stringify(body);
  assert.ok(
    !/sqlite|no such table|D1_ERROR|SqliteError/i.test(text),
    `${label}: error must not leak raw database errors (${text})`,
  );
  return body;
}

function assertBetween(value, lo, hi, label) {
  assert.ok(
    typeof value === 'number' && Number.isFinite(value),
    `${label}: expected a number, got ${JSON.stringify(value)}`,
  );
  assert.ok(
    value >= lo && value <= hi,
    `${label}: expected ${value} to be within [${lo}, ${hi}]`,
  );
}

async function tableRowCount(table) {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).first();
  return Number(row.n);
}

async function allPresenceRows() {
  return (await db.prepare(`SELECT * FROM "${SCHEMA.presenceTable}"`).all()).results;
}

async function setLastSeen(browserId, lastSeen) {
  await db
    .prepare(
      `UPDATE "${SCHEMA.presenceTable}" SET "${SCHEMA.presenceLastSeen}" = ? ` +
        `WHERE "${SCHEMA.presenceBrowserId}" = ?`,
    )
    .bind(lastSeen, browserId)
    .run();
}

async function getFeatures(origin, ip, mfInst = mf) {
  const res = await apiFetch(mfInst, origin, 'GET', '/api/community/features', { ip });
  const body = await expectJSON(res, 200, 'features listing');
  assert.ok(Array.isArray(body.features), 'features must be an array');
  return body.features;
}

/* ------------------------------------------------------------- lifecycle */

before(async () => {
  assert.ok(
    fs.existsSync(WORKER_PATH),
    `server/worker.mjs not found - backend implementation has not landed yet`,
  );
  assert.ok(
    fs.existsSync(MIGRATION_PATH),
    `migrations/0001_community.sql not found - schema has not landed yet`,
  );
  workerScript = bundleWorker();
  mf = new Miniflare(convertV4MiniflareOptions(baseOptions()));
  await mf.ready;
  db = await mf.getD1Database('COMMUNITY_DB');
  await applyMigration(db);
});

beforeEach(async () => {
  if (!db) return;
  await db.prepare(`DELETE FROM "${SCHEMA.presenceTable}"`).run();
  await db.prepare(`DELETE FROM "${SCHEMA.votesTable}"`).run();
});

after(async () => {
  if (mf) await mf.dispose();
});

/* ------------------------------------------------------- presence tests */

test('presence: first heartbeat stores exactly one browser row and reports count 1', async () => {
  const origin = originFor('presence-first');
  const ip = nextIp();
  const browserId = crypto.randomUUID();
  const t0 = nowSec();

  const res = await heartbeat(browserId, { origin, ip });
  const body = await expectJSON(res, 200, 'first heartbeat');
  assert.equal(body.count, 1, 'a single browser must be counted exactly once');
  assertBetween(
    body.nextHeartbeatIn,
    HEARTBEAT_CADENCE - 5,
    HEARTBEAT_CADENCE,
    'nextHeartbeatIn for a fresh browser',
  );
  assertBetween(body.countedAt, t0 - 5, nowSec() + 5, 'countedAt as unix seconds');
  assert.ok(
    (res.headers.get('cache-control') || '').toLowerCase().includes('no-store'),
    'presence responses must be no-store, never publicly cacheable',
  );

  const rows = await allPresenceRows();
  assert.equal(rows.length, 1, 'exactly one presence row may exist');
  assert.equal(rows[0][SCHEMA.presenceBrowserId], browserId, 'row is keyed by the browserId');
  assertBetween(
    Number(rows[0][SCHEMA.presenceLastSeen]),
    t0 - 5,
    nowSec() + 5,
    'stored last_seen is server-now',
  );
});

test('presence: concurrent first heartbeats for one browser still store a single row', async () => {
  const origin = originFor('presence-race-insert');
  const ip = nextIp();
  const browserId = crypto.randomUUID();

  const responses = await Promise.all(
    Array.from({ length: 5 }, () => heartbeat(browserId, { origin, ip })),
  );
  for (const [i, res] of responses.entries()) {
    const body = await expectJSON(res, 200, `concurrent heartbeat #${i + 1}`);
    assert.equal(body.count, 1, 'count must stay 1 regardless of request interleaving');
  }
  assert.equal(
    await tableRowCount(SCHEMA.presenceTable),
    1,
    'concurrent inserts must collapse to one row',
  );
});

test('presence: nextHeartbeatIn tracks stored last_seen; early repeats never rewrite it', async () => {
  const origin = originFor('presence-schedule');
  const ip = nextIp();
  const browserId = crypto.randomUUID();

  const first = await expectJSON(
    await heartbeat(browserId, { origin, ip }),
    200,
    'initial heartbeat',
  );
  assertBetween(first.nextHeartbeatIn, HEARTBEAT_CADENCE - 5, HEARTBEAT_CADENCE, 'fresh schedule');

  // Pretend the stored heartbeat happened two minutes ago.
  const backdated = nowSec() - 120;
  await setLastSeen(browserId, backdated);

  const second = await expectJSON(
    await heartbeat(browserId, { origin, ip }),
    200,
    'heartbeat after backdating',
  );
  assert.equal(second.count, 1);
  assertBetween(
    second.nextHeartbeatIn,
    170,
    190,
    'nextHeartbeatIn must derive from stored last_seen (~180), not a fresh 300',
  );

  // Early repeats (within the cadence) are read-only, even when raced.
  const repeats = await Promise.all(
    Array.from({ length: 4 }, () => heartbeat(browserId, { origin, ip })),
  );
  for (const [i, res] of repeats.entries()) {
    const body = await expectJSON(res, 200, `early repeat #${i + 1}`);
    assert.equal(body.count, 1);
    assertBetween(body.nextHeartbeatIn, 170, 190, 'repeat must not reset the schedule');
  }

  const rows = await allPresenceRows();
  assert.equal(rows.length, 1, 'early repeats must not insert rows');
  assert.equal(
    Number(rows[0][SCHEMA.presenceLastSeen]),
    backdated,
    'early repeats must leave stored last_seen untouched',
  );
});

test('presence: browsers fall out of the count after ten minutes, a just-inside row still counts', async () => {
  const origin = originFor('presence-expiry');
  const idStale = crypto.randomUUID();
  const idFresh = crypto.randomUUID();
  await heartbeat(idStale, { origin, ip: nextIp() });
  await heartbeat(idFresh, { origin, ip: nextIp() });

  await setLastSeen(idStale, nowSec() - (EXPIRY_WINDOW + 1)); // just past ten minutes
  await setLastSeen(idFresh, nowSec() - (EXPIRY_WINDOW - 1)); // just inside ten minutes

  // Fresh origin => cache-free exact read (a duplicate heartbeat does not write).
  const res = await heartbeat(idFresh, { origin: originFor('presence-expiry-fresh'), ip: nextIp() });
  const body = await expectJSON(res, 200, 'readback after expiry');
  assert.equal(
    body.count,
    1,
    'only the browser seen 599s ago counts; the 601s-old row is excluded',
  );
});

test('presence: a due heartbeat refreshes the existing row instead of adding one', async () => {
  const origin = originFor('presence-refresh');
  const ip = nextIp();
  const browserId = crypto.randomUUID();
  await heartbeat(browserId, { origin, ip });

  const stale = nowSec() - 400; // well past the cadence -> refresh is due
  await setLastSeen(browserId, stale);
  const t0 = nowSec();

  const body = await expectJSON(await heartbeat(browserId, { origin, ip }), 200, 'due heartbeat');
  assertBetween(
    body.nextHeartbeatIn,
    HEARTBEAT_CADENCE - 10,
    HEARTBEAT_CADENCE,
    'refreshed schedule restarts the cadence',
  );

  const rows = await allPresenceRows();
  assert.equal(rows.length, 1, 'refresh must reuse the existing row, not insert a new one');
  const refreshedSeen = Number(rows[0][SCHEMA.presenceLastSeen]);
  assertBetween(
    refreshedSeen,
    stale + HEARTBEAT_CADENCE - 10,
    t0 + 10,
    'stored last_seen refreshed to ~now',
  );

  const readback = await expectJSON(
    await heartbeat(browserId, { origin: originFor('presence-refresh-check'), ip }),
    200,
    'readback',
  );
  assert.equal(readback.count, 1, 'the refreshed browser is active again, still exactly one');
});

test('presence: raw connection IPs never reach storage', async () => {
  const origin = originFor('presence-privacy');
  const ip = nextIp();
  const browserId = crypto.randomUUID();
  await heartbeat(browserId, { origin, ip });

  const tables = (
    await db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'community_%'`)
      .all()
  ).results.map((row) => row.name);
  assert.ok(tables.length > 0, 'expected community tables to exist');

  for (const table of tables) {
    const rows = (await db.prepare(`SELECT * FROM "${table}"`).all()).results;
    for (const row of rows) {
      const serialized = JSON.stringify(row);
      assert.ok(
        !serialized.includes(ip),
        `raw IP leaked into ${table}: ${serialized}`,
      );
    }
  }

  const rows = await allPresenceRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0][SCHEMA.presenceBrowserId], browserId, 'only the random browserId is stored');
});

/* --------------------------------------------- count caching + voting */

test('count: aggregate may lag via a short cache; fresh origins and repeats stay exact', async () => {
  const origin = originFor('count-cache');
  const idA = crypto.randomUUID();
  const idB = crypto.randomUUID();
  const idC = crypto.randomUUID();

  const firstRes = await heartbeat(idA, { origin, ip: nextIp() });
  assert.ok(
    (firstRes.headers.get('cache-control') || '').toLowerCase().includes('no-store'),
    'count responses must be no-store, never client/public cacheable',
  );
  const first = await expectJSON(firstRes, 200, 'browser A');
  assert.equal(first.count, 1, 'fresh origin returns the exact total');

  const second = await expectJSON(
    await heartbeat(idB, { origin, ip: nextIp() }),
    200,
    'browser B same origin',
  );
  assert.equal(
    second.count,
    1,
    'same-origin reads serve the cached aggregate (<=60s lag allowed)',
  );

  const third = await expectJSON(
    await heartbeat(idC, { origin: originFor('count-cache-fresh'), ip: nextIp() }),
    200,
    'browser C fresh origin',
  );
  assert.equal(third.count, 3, 'fresh origin counts A, B and the newly inserted C');

  const dup = await expectJSON(
    await heartbeat(idA, { origin: originFor('count-cache-dup'), ip: nextIp() }),
    200,
    'duplicate heartbeat on fresh origin',
  );
  assert.equal(
    dup.count,
    3,
    'A, B and C are active; a repeated browser never inflates the real count',
  );
});

test('cache hits avoid the count scan and fresh duplicate heartbeats write zero rows', async () => {
  await db.batch(Array.from({length:100},()=>db.prepare(
    'INSERT INTO community_presence(browser_id,last_seen) VALUES (?,?)'
  ).bind(crypto.randomUUID(),nowSec())));
  const origin=originFor('count-billing');
  const browserId=crypto.randomUUID();
  const cold=await heartbeat(browserId,{origin,ip:nextIp()});
  assert.equal(cold.status,200);
  const warm=await heartbeat(browserId,{origin,ip:nextIp()});
  assert.equal(warm.status,200);
  assert.ok(Number(cold.headers.get('x-test-rows-read'))-Number(warm.headers.get('x-test-rows-read'))>=100,
    'a cache hit must skip reading the active-browser index, not only reuse the displayed total');
  assert.equal(Number(warm.headers.get('x-test-rows-written')),0,'duplicate requests consume no row writes');
  assert.equal((await warm.json()).count,101);
});

test('scheduled cleanup removes old presence while retaining recent presence and votes', async () => {
  await db.batch([90000,3600,0].map(age=>db.prepare(
    'INSERT INTO community_presence(browser_id,last_seen) VALUES (?,?)'
  ).bind(crypto.randomUUID(),nowSec()-age)));
  await db.prepare('INSERT INTO community_votes VALUES (?,?,?)').bind('optimize-staffing','test-hash',nowSec()-90000).run();
  assert.equal((await mf.dispatchFetch('https://cleanup.test/__test/scheduled')).status,200);
  assert.equal(await tableRowCount(SCHEMA.presenceTable),2);
  assert.equal(await tableRowCount(SCHEMA.votesTable),1);
});

test('features: curated listing starts at zero votes with nothing voted', async () => {
  const origin = originFor('features-initial');
  const ip = nextIp();

  const res = await apiFetch(mf, origin, 'GET', '/api/community/features', { ip });
  const body = await expectJSON(res, 200, 'features listing');
  const cc = (res.headers.get('cache-control') || '').toLowerCase();
  assert.ok(
    cc.includes('no-store') || cc.includes('private'),
    `per-IP features response must not be publicly cacheable, got "${cc}"`,
  );

  assert.equal(body.features.length, 2, 'exactly the two curated SOON options');
  const ids = new Set();
  for (const feature of body.features) {
    assert.equal(typeof feature.id, 'string', 'feature id');
    assert.ok(feature.id.length > 0, 'feature id must be non-empty');
    ids.add(feature.id);
    assert.equal(typeof feature.title, 'string', 'feature title');
    assert.ok(feature.title.length > 0, 'feature title must be non-empty');
    assert.equal(typeof feature.description, 'string', 'feature description');
    assert.equal(feature.votes, 0, 'no votes yet');
    assert.equal(feature.voted, false, 'voting IP has not voted yet');
  }
  assert.equal(ids.size, 2, 'curated feature ids are unique');
});

test('votes: one vote per IP is idempotent under duplicates and races, per-IP flags never leak', async () => {
  const origin = originFor('votes-casting');
  const ip1 = nextIp();
  const ip2 = nextIp();
  const features = await getFeatures(origin, ip1);
  const [f0, f1] = features.map((f) => f.id);

  const first = await expectJSON(
    await postJSON(mf, origin, '/api/community/vote', { featureId: f0 }, ip1),
    200,
    'first vote',
  );
  const voted = first.feature ?? first; // contract: the selected feature object
  assert.equal(voted.id, f0);
  assert.equal(voted.voted, true, 'vote response marks voted:true');
  assert.equal(voted.votes, 1, 'first vote counts once');

  const dup = await expectJSON(
    await postJSON(mf, origin, '/api/community/vote', { featureId: f0 }, ip1),
    200,
    'duplicate vote',
  );
  assert.equal((dup.feature ?? dup).votes, 1, 'duplicate vote stays idempotent');
  assert.equal((dup.feature ?? dup).voted, true);

  const raced = await Promise.all(
    Array.from({ length: 3 }, () =>
      postJSON(mf, origin, '/api/community/vote', { featureId: f0 }, ip1),
    ),
  );
  for (const [i, res] of raced.entries()) {
    const body = await expectJSON(res, 200, `concurrent vote #${i + 1}`);
    assert.equal((body.feature ?? body).votes, 1, 'raced same-IP votes stay at one');
  }
  assert.equal(
    await tableRowCount(SCHEMA.votesTable),
    1,
    'duplicates and races must store exactly one vote row',
  );

  const both = await expectJSON(
    await postJSON(mf, origin, '/api/community/vote', { featureId: f1 }, ip1),
    200,
    'same IP votes the other feature',
  );
  assert.equal((both.feature ?? both).id, f1);
  assert.equal((both.feature ?? both).votes, 1, 'the other feature starts at its own first vote');

  const other = await expectJSON(
    await postJSON(mf, origin, '/api/community/vote', { featureId: f0 }, ip2),
    200,
    'second IP votes first feature',
  );
  assert.equal((other.feature ?? other).votes, 2, 'a different IP increments the total');

  assert.equal(
    await tableRowCount(SCHEMA.votesTable),
    3,
    'two rows for the first feature, one for the second',
  );

  // Stored identity must be a hash, never the raw IP.
  const voteRows = (await db.prepare(`SELECT * FROM "${SCHEMA.votesTable}"`).all()).results;
  assert.equal(voteRows.length, 3);
  for (const row of voteRows) {
    const hash = String(row[SCHEMA.votesIpHash]);
    assert.match(hash, /^[0-9a-f]{64}$/i, 'stored voter identity is a 64-hex digest');
    assert.notEqual(hash, ip1, 'hash must not be the raw first IP');
    assert.notEqual(hash, ip2, 'hash must not be the raw second IP');
    assert.ok(
      typeof row[SCHEMA.votesFeatureId] === 'string',
      'vote rows reference the curated feature id',
    );
  }

  // Per-IP voted flags must not leak through any shared cache.
  const mine = await getFeatures(origin, ip1);
  assert.equal(mine.find((f) => f.id === f0).voted, true, 'ip1 sees its own vote');
  const theirs = await getFeatures(origin, ip2);
  assert.equal(theirs.find((f) => f.id === f0).voted, true, 'ip2 sees the feature it voted for');
  assert.equal(
    theirs.find((f) => f.id === f1).voted,
    false,
    'ip2 must never see ip1’s voted flag (no cache leakage)',
  );
  assert.equal(theirs.find((f) => f.id === f0).votes, 2, 'public totals are shared, flags are not');
});

/* ------------------------------------------- validation + protocol */

test('validation: malformed writes are rejected with 4xx JSON and write nothing', async () => {
  const origin = originFor('validation-writes');
  const ip = nextIp();
  const browserId = crypto.randomUUID();

  const presenceCases = [
    ['cross-origin presence POST', () =>
      mf.dispatchFetch(origin + '/api/community/presence', {method:'POST',
        headers:{Origin:'https://evil.example','CF-Connecting-IP':ip,'Content-Type':'application/json'},
        body:JSON.stringify({browserId})})],
    ['wrong content-type', () =>
      apiFetch(mf, origin, 'POST', '/api/community/presence', {
        ip,
        body: JSON.stringify({ browserId }),
        contentType: 'text/plain',
      })],
    ['malformed JSON', () =>
      apiFetch(mf, origin, 'POST', '/api/community/presence', { ip, body: '{"browserId": ' })],
    ['JSON array body', () =>
      apiFetch(mf, origin, 'POST', '/api/community/presence', { ip, body: '[]' })],
    ['JSON null body', () =>
      apiFetch(mf, origin, 'POST', '/api/community/presence', { ip, body: 'null' })],
    ['extra keys', () =>
      postJSON(mf, origin, '/api/community/presence', { browserId, tabCount: 2 }, ip)],
    ['client-supplied ip field', () =>
      postJSON(mf, origin, '/api/community/presence', { browserId, ip: '203.0.113.9' }, ip)],
    ['invalid browser UUID', () =>
      postJSON(mf, origin, '/api/community/presence', { browserId: 'not-a-uuid' }, ip)],
    ['missing browserId', () => postJSON(mf, origin, '/api/community/presence', {}, ip)],
  ];

  for (const [label, run] of presenceCases) {
    await expectRejected(await run(), `presence ${label}`);
  }

  const voteOrigin = originFor('validation-vote');
  const [feature] = await getFeatures(voteOrigin, nextIp());
  const voteCases = [
    ['unknown feature', () =>
      postJSON(mf, voteOrigin, '/api/community/vote', { featureId: 'not-a-real-feature' }, nextIp())],
    ['vote extra keys', () =>
      postJSON(mf, voteOrigin, '/api/community/vote', { featureId: feature.id, amount: 5 }, nextIp())],
    ['vote missing featureId', () =>
      postJSON(mf, voteOrigin, '/api/community/vote', {}, nextIp())],
    ['vote cross-origin', () =>
      mf.dispatchFetch(origin + '/api/community/vote', {method:'POST',
        headers:{Origin:'https://evil.example','CF-Connecting-IP':nextIp(),'Content-Type':'application/json'},
        body:JSON.stringify({featureId:feature.id})})],
    ['vote invalid body type', () =>
      apiFetch(mf, voteOrigin, 'POST', '/api/community/vote', { ip: nextIp(), body: '"feature"' })],
  ];
  for (const [label, run] of voteCases) {
    await expectRejected(await run(), `vote ${label}`);
  }

  assert.equal(await tableRowCount(SCHEMA.presenceTable), 0, 'rejected presence writes stored nothing');
  assert.equal(await tableRowCount(SCHEMA.votesTable), 0, 'rejected votes stored nothing');
});

test('protocol: oversized bodies (>1024 bytes) are rejected with 413 before any write', async () => {
  const origin = originFor('protocol-oversize');
  const oversized = JSON.stringify({
    browserId: crypto.randomUUID(),
    blob: 'x'.repeat(MAX_BODY_BYTES * 2),
  });
  assert.ok(oversized.length > MAX_BODY_BYTES, 'test body must actually exceed the limit');

  const body = await expectJSON(
    await apiFetch(mf, origin, 'POST', '/api/community/presence', {
      ip: nextIp(),
      body: oversized,
    }),
    413,
    'oversized presence body',
  );
  assert.equal(typeof body, 'object', '413 must still be a JSON error');
  assert.equal(await tableRowCount(SCHEMA.presenceTable), 0, 'rejected body stored nothing');
});

test('protocol: unsupported methods and unknown paths are JSON errors; static rides ASSETS', async () => {
  const origin = originFor('protocol-shapes');
  const ip = nextIp();

  await expectJSON(
    await apiFetch(mf, origin, 'GET', '/api/community/presence', { ip }),
    405,
    'GET on POST-only presence',
  );
  await expectJSON(
    await apiFetch(mf, origin, 'PUT', '/api/community/vote', { ip }),
    405,
    'PUT on vote',
  );
  await expectJSON(
    await apiFetch(mf, origin, 'DELETE', '/api/community/features', { ip }),
    405,
    'DELETE on features',
  );
  await expectJSON(
    await apiFetch(mf, origin, 'GET', '/api/community/definitely-not-a-route', { ip }),
    404,
    'unknown API path',
  );

  const staticRes = await mf.dispatchFetch(`${origin}/`, { method: 'GET' });
  assert.equal(staticRes.status, 200, 'static path is served');
  assert.equal(await staticRes.text(), 'static fixture', 'static requests hit the ASSETS binding');
});

/* --------------------------------- configuration failure + rate limit */

async function withMiniflare(options, run) {
  const scoped = new Miniflare(convertV4MiniflareOptions(options));
  try {
    await scoped.ready;
    return await run(scoped, await scoped.getD1Database('COMMUNITY_DB'));
  } finally {
    await scoped.dispose();
  }
}

test('config: missing IP secret degrades the API to JSON 503 while static still works', async () => {
  const options = baseOptions();
  delete options.bindings.COMMUNITY_IP_SECRET;

  await withMiniflare(options, async (scoped) => {
    await applyMigration(await scoped.getD1Database('COMMUNITY_DB'));
    const origin = originFor('config-no-secret');

    await expectJSON(
      await apiFetch(scoped, origin, 'GET', '/api/community/features', { ip: nextIp() }),
      503,
      'features without secret',
    );
    // Use a genuinely curated id so only the missing secret can cause the failure.
    const [curated] = await getFeatures(originFor('config-no-secret-seed'), nextIp());
    const voteBody = await expectJSON(
      await postJSON(scoped, origin, '/api/community/vote', { featureId: curated.id }, nextIp()),
      503,
      'vote without secret',
    );
    assert.equal(typeof voteBody, 'object', '503 must be a JSON error');

    const staticRes = await scoped.dispatchFetch(`${origin}/`, { method: 'GET' });
    assert.equal(staticRes.status, 200, 'static delivery is unaffected by the missing secret');
    assert.equal(await staticRes.text(), 'static fixture');
  });
});

test('config: absent D1 tables yield a generic JSON 503 and static keeps working', async () => {
  await withMiniflare(baseOptions(), async (scoped) => {
    // Deliberately no migration: tables do not exist.
    const origin = originFor('config-no-tables');

    const presence = await expectJSON(
      await heartbeat(crypto.randomUUID(), { origin, ip: nextIp(), mfInst: scoped }),
      503,
      'presence without tables',
    );
    const text = JSON.stringify(presence);
    assert.ok(
      !/sqlite|no such table|D1_ERROR|SqliteError/i.test(text),
      `503 must be generic, not raw driver output (${text})`,
    );
    await expectJSON(
      await apiFetch(scoped, origin, 'GET', '/api/community/features', { ip: nextIp() }),
      503,
      'features without tables',
    );

    const staticRes = await scoped.dispatchFetch(`${origin}/`, { method: 'GET' });
    assert.equal(staticRes.status, 200, 'static delivery survives a broken database');
    assert.equal(await staticRes.text(), 'static fixture');
  });
});

test('rate limit: vote hammering eventually returns 429 and stops database writes', async () => {
  const origin = originFor('rate-limit-votes');
  const ip = nextIp(); // dedicated IP: the limiter budget is not shared with other tests
  const [feature] = await getFeatures(origin, ip);
  const featureId = feature.id;

  let sawLimited = false;
  let accepted = 0;
  for (let attempt = 0; attempt < 200; attempt++) {
    const res = await postJSON(mf, origin, '/api/community/vote', { featureId }, ip);
    if (res.status === 429) {
      sawLimited = true;
      break;
    }
    await expectJSON(res, 200, `vote #${attempt + 1}`);
    accepted += 1;
  }
  assert.ok(sawLimited, 'the limiter must eventually answer 429 (no exact attempt asserted)');
  assert.ok(accepted > 0, 'limiting kicks in only after real traffic');

  // Same IP + same feature: insert-if-absent means exactly one row, no matter how
  // many votes were accepted before limiting kicked in.
  const rowsAtLimit = await tableRowCount(SCHEMA.votesTable);
  assert.equal(rowsAtLimit, 1, 'hammering duplicates stores exactly one vote row');

  for (let i = 0; i < 5; i++) {
    const res = await postJSON(mf, origin, '/api/community/vote', { featureId }, ip);
    assert.equal(res.status, 429, 'still limited while the window lasts');
  }
  assert.equal(
    await tableRowCount(SCHEMA.votesTable),
    rowsAtLimit,
    'limited requests must not write rows (no unlimited writes)',
  );
});
