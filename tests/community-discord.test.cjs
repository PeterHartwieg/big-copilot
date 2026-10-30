'use strict';
// The Discord changelog announcer (server/discord_announcer.mjs) through the Worker's
// scheduled() handler: the bundled Worker runs in a node:vm context with a mocked
// fetch and ASSETS, over Miniflare's in-memory D1 with every migration applied.
const {test, before, beforeEach, after} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {Miniflare, convertV4MiniflareOptions} = require('miniflare');
const {migrate, vmWorkerSource} = require('./_community.cjs');

const WEBHOOK = 'https://discord.com/api/webhooks/123456789/synthetic_Token-1';
const DUE = Date.UTC(2026, 9, 30, 12, 7); // :07, a due minute
let mf, db, script;

before(async () => {
  script = await vmWorkerSource([]);
  mf = new Miniflare(convertV4MiniflareOptions({modules: true, script: 'export default {}',
    compatibilityDate: '2026-09-01', d1Databases: ['COMMUNITY_DB']}));
  await mf.ready;
  db = await mf.getD1Database('COMMUNITY_DB');
  await migrate(db);
});
beforeEach(async () => {
  await db.prepare('DELETE FROM discord_announced').run();
  await db.prepare('DELETE FROM discord_announcer_state').run();
});
after(async () => { if (mf) await mf.dispose(); });

const entry = (pr, title = `Feature ${pr}`) => ({pr, date: `2026-10-${String(pr % 28 + 1).padStart(2, '0')}`, title, summary: `Summary of ${title}.`});
const key = (e) => crypto.createHash('sha256').update(`${e.pr}:${e.title}`).digest('hex');
const prs = (posts) => posts.map((p) => p.body.embeds[0].footer.text.split('#')[1]);
const all = async (sql) => (await db.prepare(sql).all()).results;
const state = async () => (await all('SELECT * FROM discord_announcer_state'))[0];
const outcomes = (events) => events.map(([line]) => line.outcome);

// A Worker whose outbound fetch answers with `discord` (default: a new message id
// each post); returns the posts it received and its log lines.
function setup({changelog, discord, database = db, webhook = WEBHOOK, assets} = {}) {
  const posts = [], events = [];
  const context = {
    Request, Response, URL, TextEncoder, TextDecoder, AbortSignal, setTimeout,
    crypto: crypto.webcrypto,
    console: {error: (...args) => events.push(args), log: (...args) => events.push(args)},
    fetch: async (url, init) => {
      posts.push({url: String(url), init, body: JSON.parse(init.body)});
      return discord ? discord(posts.length) : new Response(JSON.stringify({id: String(1000 + posts.length)}), {status: 200});
    },
  };
  require('node:vm').runInNewContext(script, context);
  const env = {
    COMMUNITY_DB: database,
    ASSETS: assets || {fetch: async (request) => {
      assert.equal(request.url, 'https://bigcopilot.com/changelog.json');
      return new Response(JSON.stringify(typeof changelog === 'function' ? changelog() : changelog));
    }},
    ...(webhook === null ? {} : {BIGCOPILOT_DISCORD_WEBHOOK: webhook}),
  };
  const tick = (time = DUE) => context.worker.scheduled({cron: '* * * * *', scheduledTime: time}, env);
  return {tick, posts, events, env, worker: context.worker};
}

test('discord: the first run is a baseline that records every entry and sends nothing', async () => {
  const log = [entry(3), entry(2), entry(1)];
  const {tick, posts, events} = setup({changelog: log});
  await tick();
  assert.equal(posts.length, 0);
  assert.deepEqual((await all('SELECT key FROM discord_announced')).map((r) => r.key).sort(), log.map(key).sort());
  const row = await state();
  assert.ok(row.baselined_at > 0);
  assert.equal(row.pending_key, null);
  assert.equal(row.lease_until, 0, 'the lease is released');
  await tick();
  assert.equal(posts.length, 0, 'nothing new after the baseline');
  assert.deepEqual(events, []);
});

test('discord: new entries go oldest first, exactly once, in the exact payload, mentions suppressed', async () => {
  let log = [entry(1)];
  const {tick, posts, events} = setup({changelog: () => log});
  await tick();
  log = [entry(4, 'Fourth <@&1> @everyone'), entry(3), entry(2), entry(1)];
  await tick();
  assert.deepEqual(prs(posts), ['2', '3', '4']);
  assert.equal(posts[0].url, `${WEBHOOK}?wait=true`);
  assert.equal(posts[0].init.method, 'POST');
  assert.equal(posts[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(posts[2].body, {
    username: 'BigCopilot',
    allowed_mentions: {parse: []},
    embeds: [{
      title: 'BigCopilot update: Fourth <@&1> @everyone',
      description: 'Summary of Fourth <@&1> @everyone.',
      url: 'https://bigcopilot.com/',
      color: 0x43C07A,
      footer: {text: `Released ${entry(4).date} · PR #4`},
    }],
  });
  const row = await state();
  assert.equal(row.pending_key, null);
  assert.equal(row.last_message_id, '1003');
  await tick();
  assert.equal(posts.length, 3, 'an announced entry is never sent again');
  assert.deepEqual(events, []);
});

test('discord: long fields are cut to the embed limits by character', async () => {
  let log = [entry(1)];
  const {tick, posts} = setup({changelog: () => log});
  await tick();
  log = [{pr: 2, date: '2026-10-30', title: '\u{1F600}'.repeat(300), summary: 'x'.repeat(5000)}, entry(1)];
  await tick();
  const embed = posts[0].body.embeds[0];
  assert.equal([...embed.title].length, 256);
  assert.ok(embed.title.endsWith('\u{1F600}'));
  assert.equal(embed.description.length, 4000);
});

test('discord: at most five sends a run, the rest at the next due run', async () => {
  let log = [entry(1)];
  const {tick, posts} = setup({changelog: () => log});
  await tick();
  log = Array.from({length: 9}, (_, i) => entry(9 - i));
  await tick();
  assert.equal(posts.length, 5);
  await tick();
  assert.deepEqual(prs(posts), ['2', '3', '4', '5', '6', '7', '8', '9']);
});

test('discord: a pending entry blocks every run and is logged', async () => {
  let log = [entry(1)];
  const {tick, posts, events} = setup({changelog: () => log});
  await tick();
  await db.prepare("UPDATE discord_announcer_state SET pending_key = 'abc', pending_payload = '{}'").run();
  log = [entry(2), entry(1)];
  await tick();
  assert.equal(posts.length, 0);
  assert.deepEqual(outcomes(events), ['pending']);
  assert.equal((await state()).lease_until, 0, 'the lease is released');
});

test('discord: a failed pending write prevents the send', async () => {
  const {tick} = setup({changelog: [entry(1)]});
  await tick();
  const failing = {
    prepare(sql) {
      if (/SET pending_key = \?1/.test(sql)) return {bind: () => ({run: async () => { throw new Error('d1 down'); }})};
      return db.prepare(sql);
    },
    batch: (statements) => db.batch(statements),
  };
  const {tick: failingTick, posts, events} = setup({changelog: [entry(2), entry(1)], database: failing});
  await assert.rejects(failingTick(), /^Error: discord announcer failed$/);
  assert.equal(posts.length, 0);
  assert.deepEqual(outcomes(events), ['pending_write_failed']);
  assert.equal((await state()).pending_key, null);
});

for (const [name, discord] of [
  ['an error status', () => new Response(JSON.stringify({id: '1'}), {status: 500})],
  ['a reply without an id', () => new Response(JSON.stringify({}), {status: 200})],
  ['a reply with a numeric id', () => new Response(JSON.stringify({id: 1}), {status: 200})],
  ['a reply that is not JSON', () => new Response('<html>', {status: 200})],
  ['a network failure', () => { throw new Error(`fetch failed for ${WEBHOOK}`); }],
]) {
  test(`discord: ${name} leaves the entry pending and stops later runs`, async () => {
    let log = [entry(1)];
    const {tick, posts, events} = setup({changelog: () => log, discord});
    await tick();
    log = [entry(3), entry(2), entry(1)];
    await assert.rejects(tick(), /^Error: discord announcer failed$/);
    assert.equal(posts.length, 1, 'stops after the first failure');
    const row = await state();
    assert.equal(row.pending_key, key(entry(2)));
    assert.deepEqual(JSON.parse(row.pending_payload), posts[0].body);
    assert.equal((await all('SELECT key FROM discord_announced')).length, 1);
    await tick();
    assert.equal(posts.length, 1, 'a pending entry is never retried on its own');
    assert.deepEqual(outcomes(events), ['discord_failed', 'pending']);
    assert.ok(!JSON.stringify(events).includes('discord.com'), 'the webhook is never logged');
  });
}

test('discord: the documented resolution records a delivered pending entry', async () => {
  let log = [entry(1)];
  let fail = true;
  const {tick, posts} = setup({changelog: () => log, discord: () => fail
    ? new Response('', {status: 502}) : new Response(JSON.stringify({id: '77'}), {status: 200})});
  await tick();
  log = [entry(3), entry(2), entry(1)];
  await assert.rejects(tick());
  // docs/community-features.md, "Discord announcements": the message was delivered.
  await db.prepare('INSERT OR IGNORE INTO discord_announced(key, announced_at) SELECT pending_key, unixepoch() FROM discord_announcer_state WHERE id = 1 AND pending_key IS NOT NULL').run();
  await db.prepare('UPDATE discord_announcer_state SET pending_key = NULL, pending_payload = NULL WHERE id = 1').run();
  fail = false;
  await tick();
  assert.deepEqual(prs(posts), ['2', '3']);
});

for (const [name, changelog] of [
  ['an empty changelog', []],
  ['a changelog that is not an array', {pr: 1}],
  ['a non-integer pr', [entry(2), {...entry(1), pr: '1'}]],
  ['a zero pr', [entry(2), {...entry(1), pr: 0}]],
  ['an empty title', [entry(2), {...entry(1), title: ' '}]],
  ['a missing summary', [entry(2), {pr: 1, date: '2026-10-01', title: 'x'}]],
  ['a repeated identity', [entry(2), entry(1), entry(1)]],
]) {
  test(`discord: ${name} stops the run without sending`, async () => {
    let log = [entry(1)];
    const {tick, posts, events} = setup({changelog: () => log});
    await tick();
    log = changelog;
    await assert.rejects(tick(), /^Error: discord announcer failed$/);
    assert.equal(posts.length, 0);
    assert.deepEqual(outcomes(events), ['invalid_changelog']);
  });
}

test('discord: an invalid changelog on the first run takes no baseline', async () => {
  const {tick, posts} = setup({changelog: [entry(1), {...entry(2), date: ''}]});
  await assert.rejects(tick());
  assert.equal(posts.length, 0);
  assert.equal(await state(), undefined);
});

for (const webhook of ['https://example.com/api/webhooks/1/abc', 'http://discord.com/api/webhooks/1/abc',
  'https://discord.com/api/webhooks/1/abc?x=1', 'https://discord.com/api/webhooks/abc/abc']) {
  test(`discord: a webhook that is not a Discord webhook stops the run (${webhook})`, async () => {
    const {tick, posts, events} = setup({changelog: [entry(1)], webhook});
    await assert.rejects(tick(), /^Error: discord announcer failed$/);
    assert.equal(posts.length, 0);
    assert.deepEqual(outcomes(events), ['invalid_webhook']);
    assert.equal(await state(), undefined);
    assert.ok(!JSON.stringify(events).includes(webhook));
  });
}

test('discord: a missing webhook is a no-op with one log line', async () => {
  const {tick, posts, events} = setup({changelog: [entry(1)], webhook: null});
  await tick();
  assert.equal(posts.length, 0);
  assert.equal(JSON.stringify(events), JSON.stringify([[{event: 'discord_announcer', outcome: 'unconfigured'}]]));
  assert.equal(await state(), undefined);
});

test('discord: runs only at :07, :22, :37 and :52 of the minute cron', async () => {
  let reads = 0;
  const {worker, env, events} = setup({assets: {fetch: async () => { reads++; return new Response('[]'); }}, webhook: null});
  const due = [];
  for (let minute = 0; minute < 60; minute++) {
    const before = events.length;
    await worker.scheduled({cron: '* * * * *', scheduledTime: Date.UTC(2026, 9, 30, 5, minute, 30)}, env);
    if (events.length > before) due.push(minute);
  }
  assert.deepEqual(due, [7, 22, 37, 52]);
  for (const controller of [{cron: '17 3 * * *', scheduledTime: DUE}, {cron: '* * * * *'}, {}]) {
    await worker.scheduled(controller, {...env, COMMUNITY_DB: null});
  }
  assert.equal(events.length, 4, 'not on the daily cron, and not without a scheduled time');
  assert.equal(reads, 0);
});

test('discord: a run that finds the lease held sends nothing', async () => {
  let log = [entry(1)];
  const {tick, posts, events} = setup({changelog: () => log});
  await tick();
  await db.prepare('UPDATE discord_announcer_state SET lease_until = ?1').bind(Date.now() + 60000).run();
  log = [entry(2), entry(1)];
  await tick();
  assert.equal(posts.length, 0);
  assert.deepEqual(outcomes(events), ['leased']);
  await db.prepare('UPDATE discord_announcer_state SET lease_until = ?1').bind(Date.now() - 1).run();
  await tick();
  assert.equal(posts.length, 1, 'an expired lease is taken over');
});

test('discord: overlapping runs send each entry once', async () => {
  let log = [entry(1)];
  const {tick, posts} = setup({changelog: () => log});
  await tick();
  log = [entry(3), entry(2), entry(1)];
  await Promise.all([tick(), tick(), tick()]);
  assert.deepEqual(prs(posts), ['2', '3']);
});

test('discord: a failing announcer leaves the report sweep running, and the other way round', async () => {
  let listed = 0;
  const bucket = {
    list: async () => { listed++; return {objects: [], truncated: false, delimitedPrefixes: []}; },
    get: async () => null, head: async () => null, put: async () => ({etag: 'e'}), delete: async () => {},
  };
  const failing = setup({assets: {fetch: async () => { throw new Error('assets down'); }}});
  await assert.rejects(failing.worker.scheduled({cron: '* * * * *', scheduledTime: DUE}, {...failing.env, REPORTS: bucket}),
    /discord announcer failed/);
  assert.ok(listed > 0, 'the report sweep still ran');
  assert.deepEqual(outcomes(failing.events), ['changelog_unavailable']);

  let log = [entry(1)];
  const {tick, worker, env, posts} = setup({changelog: () => log});
  await tick();
  log = [entry(2), entry(1)];
  const broken = {list: async () => { throw new Error('list down'); }, get: async () => null, head: async () => null,
    put: async () => { throw new Error('put down'); }};
  await assert.rejects(worker.scheduled({cron: '* * * * *', scheduledTime: DUE}, {...env, REPORTS: broken}));
  assert.equal(posts.length, 1, 'the announcer still sent');
});
