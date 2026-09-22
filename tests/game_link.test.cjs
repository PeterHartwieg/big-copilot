const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
// The game-link section, plus the two functions it drives: update()'s first
// branch hands it the refresh, checkFolder() hands it the watch.
const section = source.slice(
  source.indexOf('  /* --- the game link (docs/game-link-api.md)'),
  source.indexOf('  /* --- building'));
const updater = source.slice(
  source.indexOf('  async function update()'),
  source.indexOf('  /* --- watching the folder'));
const watcher = source.slice(
  source.indexOf('  async function checkFolder()'),
  source.indexOf('  function armWatch()'));

const HEALTH = {
  ok: true, schemaVersion: 1, modVersion: '0.1.0', source: 'mock', build: 3680,
  character: 'abc', company: 'Costy Co', day: 34, hour: 14, minute: 12, cash: 148230.5,
  stamp: 's1', busy: false, size: 5123456, refreshedAt: '2026-09-22T14:33:20Z',
};

const reply = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: {get: (name) => (name in headers ? headers[name] : null)},
  json: async () => body,
  arrayBuffer: async () => new ArrayBuffer(8),
});

// The section runs against a loopback that never sleeps: timers are stubs,
// the clock moves only when the swapped-in linkWait advances it, and every
// answer comes from the routes a test hands over.
function harness({routes = {}} = {}) {
  const clock = {now: Date.parse('2026-09-22T15:00:00Z')};
  class Clock extends Date {}
  Clock.now = () => clock.now;
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) els.set(id, {id, hidden: false, title: '', textContent: '', className: ''});
    return els.get(id);
  };
  const seen = {states: [], notes: [], builds: [], calls: []};
  const strip = {tone: 'ok', head: '', meta: ''};
  const remembered = {};
  const waits = [];
  const context = vm.createContext({
    setTimeout: () => 0, clearTimeout: () => {}, AbortController, URL,
    Date: Clock,
    File: class {
      constructor(parts, name, options) { this.parts = parts; this.name = name; Object.assign(this, options || {}); }
    },
    __waits: waits,
    __advance: (ms) => { clock.now += ms; },
    document: {hidden: false},
    location: {hash: ''},
    localStorage: {getItem: () => null, setItem() {}, removeItem(key) { delete remembered[key]; }},
    // the app helpers the section is allowed to touch
    $: el, strip,
    company: 'Costy Co', sourceGen: 1, busy: false, attempt: null, readerError: null,
    lastGood: {}, lastCheck: null, lastEntries: null, watchChecking: false,
    savePicker: {hidden: false},
    state(tone, head, meta) { seen.states.push([tone, head, meta]); strip.tone = tone; },
    note(...args) { seen.notes.push(args); },
    stored: {get: (key) => remembered[key] || '', set: (key, value) => { remembered[key] = value; return true; }},
    onBoard: () => true,
    supersede: () => ++context.sourceGen,
    closeSavePicker() {}, place() {}, armWatch() {}, stopWatch() {}, syncWatchBtn() {},
    idleState() { seen.states.push(['idle']); strip.tone = 'ready'; },
    startAttempt: () => true, finishAttempt() {},
    async buildFrom(file) { seen.builds.push(file); },
    async scanHandle() { return []; },
    async refreshSaveMenu() { return ''; },
    chooseFrom: () => ({}),
    async fetch(url, init) {
      seen.calls.push([String(url), init]);
      let give = routes[['health', 'save', 'refresh'].find((r) => url.endsWith('/' + r))];
      if (!give) throw new TypeError('Failed to fetch');
      if (typeof give === 'function') give = give(seen.calls.length);
      return 'status' in give ? give : reply(200, give);
    },
  });
  vm.runInContext(section + '\n' + updater + '\n' + watcher, context);
  vm.runInContext('linkWait = (ms) => { __waits.push(ms); __advance(ms); return Promise.resolve(); };', context);
  return {
    context, seen, els, routes, remembered, waits,
    run: (expr) => vm.runInContext(expr, context),
  };
}

test('linkFetch tries loopback, then local, then no annotation, and remembers', async () => {
  const h = harness({routes: {health: HEALTH}});
  const spaces = [];
  h.context.fetch = async (url, init) => {
    spaces.push(init.targetAddressSpace);
    assert.equal(init.credentials, 'omit');
    if (init.targetAddressSpace) throw new TypeError('the value is unknown here');
    return reply(200, HEALTH);
  };
  await h.run('linkFetch("/health")');
  assert.deepEqual(spaces, ['loopback', 'local', undefined]);
  await h.run('linkFetch("/health")');
  assert.deepEqual(spaces, ['loopback', 'local', undefined, undefined],
    'the working spelling is remembered for the rest of the session');
});

test('a link that answers nothing reads as the game not running', async () => {
  const h = harness();
  const err = await h.run('linkFetch("/health").then(() => null, (e) => e)');
  assert.equal(err.message, 'The game is not running, or the Big Copilot Link mod is not installed.');
  assert.equal(h.seen.calls.length, 3, 'every spelling was tried before giving up');
});

test('an unreachable game leaves the bad state, the install note and the link', async () => {
  const h = harness();
  h.run('linkUrl = "http://127.0.0.1:8322"');
  await h.run('loadFromLink("Linking to the game")');
  assert.deepEqual(h.seen.states.at(-1), ['bad', 'Could not reach the game', 'http://127.0.0.1:8322']);
  assert.match(h.seen.notes.at(-1)[1], /The game is not running/);
  assert.match(h.seen.notes.at(-1)[2], /Start the game with the mod enabled and load a save, then click Update\./);
  assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8322', 'Update has to be able to retry');
  assert.equal(h.seen.builds.length, 0);
});

test('a mod speaking another schema version is refused, naming version 1', async () => {
  const h = harness({routes: {health: {...HEALTH, schemaVersion: 2, stamp: 's2'}}});
  await h.run('loadFromLink("Linking to the game")');
  assert.equal(h.seen.states.at(-1)[1], 'The Big Copilot Link mod and this page do not match');
  assert.match(h.seen.notes.at(-1)[1], /The mod speaks version 2; this page needs version 1\./);
  assert.equal(h.seen.builds.length, 0);
});

test('an unchanged stamp with a board on screen builds nothing', async () => {
  const h = harness({routes: {health: HEALTH}});
  h.run(`lastLinkStamp = ${JSON.stringify(HEALTH.stamp)}`);
  await h.run('loadFromLink("Reading the game")');
  assert.deepEqual(h.seen.states.at(-1),
    ['ok', 'No newer state from the game', 'Costy Co · day 34, 14:12 · game link']);
  assert.equal(h.seen.calls.filter(([url]) => url.endsWith('/save')).length, 0);
  assert.equal(h.seen.builds.length, 0);
});

test('a new stamp is read with the old ETag and built under the live name', async () => {
  const h = harness({
    routes: {
      health: {...HEALTH, stamp: 's9'},
      save: reply(200, null, {'X-Game-Link-Stamp': 's9'}),
    },
  });
  h.run('lastLinkStamp = "s1"');
  await h.run('loadFromLink("Reading the game")');
  assert.equal(h.seen.builds.length, 1);
  const file = h.seen.builds[0];
  assert.equal(file.name, 'abc-live.hsg');
  assert.equal(file.lastModified, Date.parse('2026-09-22T14:33:20Z'), 'the file time is refreshedAt');
  assert.equal(file.linkStamp, 's9');
  assert.equal(h.run('lastLinkStamp'), 's9');
  const save = h.seen.calls.find(([url]) => url.endsWith('/save'));
  assert.equal(save[1].headers['If-None-Match'], '"s1"', 'the stamp on screen is the ETag asked against');
});

test('a busy game is waited out, then read once', async () => {
  let n = 0;
  const h = harness({
    routes: {
      health: () => { n += 1; return {...HEALTH, stamp: 's3', busy: n === 1}; },
      save: reply(200, null, {'X-Game-Link-Stamp': 's3'}),
    },
  });
  await h.run('loadFromLink("Reading the game")');
  assert.deepEqual(h.waits, [1000]);
  assert.equal(h.seen.builds.length, 1);
});

test('a game that never serializes says so after thirty seconds', async () => {
  const h = harness({routes: {health: {...HEALTH, stamp: '', busy: false}}});
  await h.run('loadFromLink("Reading the game")');
  assert.deepEqual(h.waits, Array(30).fill(1000));
  assert.equal(h.seen.states.at(-1)[1], 'The game has not produced a save yet');
  assert.equal(h.seen.builds.length, 0);
});

test('update in linked mode asks, waits for the stamp to move, and reads', async () => {
  const h = harness({
    routes: {
      refresh: reply(202, {accepted: true, stamp: 's1'}),
      health: {...HEALTH, stamp: 's2'},
      save: reply(200, null, {'X-Game-Link-Stamp': 's2'}),
    },
  });
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  assert.equal(h.seen.builds.length, 1);
  assert.equal(h.seen.builds[0].linkStamp, 's2');
  assert.equal(h.seen.calls[0][1].method, 'POST', 'the refresh is asked for first');
});

test('a throttled refresh waits out retryAfter, capped, then polls', async () => {
  const h = harness({
    routes: {
      refresh: reply(429, {error: 'throttled', retryAfter: 70}),
      health: {...HEALTH, stamp: 's2'},
      save: reply(200, null, {'X-Game-Link-Stamp': 's2'}),
    },
  });
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  assert.deepEqual(h.waits, [20000], 'retryAfter is capped at 20 s');
  assert.equal(h.seen.builds.length, 1);
});

test('a refusal keeps the board and names what the game is doing', async () => {
  for (const [reason, expected] of [
    ['saving', 'The game is saving right now'],
    ['placement', 'The game cannot save while you are placing items'],
    ['interior', 'The game cannot save while the interior designer is open'],
    ['casino', 'The game cannot save on the casino boat'],
    [undefined, 'The game cannot save right now'],
  ]) {
    const h = harness({routes: {refresh: reply(409, {error: 'cannot_save', reason})}});
    h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
    await h.run('update()');
    assert.equal(h.seen.builds.length, 0, reason);
    assert.match(h.seen.notes.at(-1)[1], new RegExp(expected));
    assert.match(h.seen.notes.at(-1)[1], /Try Update again in a moment\.$/);
  }
});

test('the linked watcher builds only when the stamp has moved', async () => {
  const h = harness({
    routes: {
      health: {...HEALTH, stamp: 'on-screen'},
      save: reply(200, null, {'X-Game-Link-Stamp': 'on-screen'}),
    },
  });
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "on-screen"');
  await h.run('checkFolder()');
  assert.equal(h.seen.builds.length, 0, 'the same stamp is left alone');
  h.routes.health = {...HEALTH, stamp: 'fresh'};
  h.routes.save = reply(200, null, {'X-Game-Link-Stamp': 'fresh'});
  await h.run('checkFolder()');
  assert.equal(h.seen.builds.length, 1);
  assert.equal(h.seen.builds[0].linkStamp, 'fresh');
});

test('a hidden tab defers the linked watcher', async () => {
  const h = harness({routes: {health: {...HEALTH, stamp: 'fresh'}}});
  h.run('linkUrl = "http://127.0.0.1:8322"; document.hidden = true');
  await h.run('checkFolder()');
  assert.equal(h.seen.calls.length, 0, 'nothing is fetched while hidden');
});

test('choosing the link stores its base and clears the folder choice', async () => {
  const h = harness({
    routes: {health: HEALTH, save: reply(200, null, {'X-Game-Link-Stamp': 's1'})},
  });
  h.context.location = {hash: '#link=http://127.0.0.1:8323'};
  h.context.dirHandle = {name: 'Saves'};
  await h.run('linkToGame()');
  assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8323', 'the hash wins over the default port');
  assert.equal(h.remembered.ledger_link, 'http://127.0.0.1:8323');
  assert.equal(h.run('dirHandle'), null, 'the folder is off, in memory');
  assert.equal(h.context.savePicker.hidden, true);
  assert.equal(h.seen.builds.length, 1);
});

test('choosing a folder clears the link, and the next visit opens the folder', async () => {
  const h = harness({routes: {health: HEALTH}});
  h.run('linkUrl = "http://127.0.0.1:8322"');
  await h.run('dropLink()');
  assert.equal(h.run('linkUrl'), null);
  assert.equal(h.remembered.ledger_link === undefined || h.remembered.ledger_link === '', true,
    'nothing is left under the key');
});

test('linking again after a folder reads the game even on the same stamp', async () => {
  const h = harness({
    routes: {health: HEALTH, save: reply(200, null, {'X-Game-Link-Stamp': HEALTH.stamp})},
  });
  // A board built from this stamp, then a folder took over, then the link again.
  h.run(`linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = ${JSON.stringify(HEALTH.stamp)}`);
  h.run('dropLink()');
  assert.equal(h.run('lastLinkStamp'), '', 'dropping the link forgets the stamp');
  await h.run('linkToGame()');
  assert.equal(h.seen.builds.length, 1, 'the same stamp is read again for the new source');
});

test('a refusal before any link build leaves the idle state, not a spinner', async () => {
  const h = harness({routes: {refresh: reply(409, {error: 'cannot_save', reason: 'interior'})}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = ""');
  await h.run('update()');
  assert.deepEqual(h.seen.states.at(-1), ['idle']);
  assert.match(h.seen.notes.at(-1)[1], /interior designer/);
});

test('a throttle followed by a refusal reports the refusal', async () => {
  let asked = 0;
  const h = harness({
    routes: {
      refresh: () => (++asked === 1
        ? reply(429, {error: 'throttled', retryAfter: 3})
        : reply(409, {error: 'cannot_save', reason: 'placement'})),
      health: HEALTH,
    },
  });
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  assert.equal(asked, 2);
  assert.match(h.seen.notes.at(-1)[1], /placing items/);
  assert.equal(h.seen.builds.length, 0);
});

test('a mod that did not take the refresh is not reported as absent', async () => {
  const h = harness({routes: {refresh: reply(503, {error: 'main_thread_unavailable'}), health: HEALTH}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  assert.equal(h.seen.states.at(-1)[0], 'ok');
  assert.match(h.seen.notes.at(-1)[1], /did not take the refresh \(answered 503\)/);
});

test('a save answered with an error names the error, not a parse failure', async () => {
  const h = harness({routes: {health: {...HEALTH, stamp: 's9'}, save: reply(503, {error: 'no_save_yet'})}});
  h.run('linkUrl = "http://127.0.0.1:8322"');
  await h.run('loadFromLink("Reading the game")');
  assert.deepEqual(h.seen.states.at(-1), ['bad', 'Could not read the game', 'http://127.0.0.1:8322']);
  assert.match(h.seen.notes.at(-1)[1], /503 \(no_save_yet\)/);
  assert.equal(h.seen.builds.length, 0);
});

test('the linked watcher says once when the game goes away, and clears it when it is back', async () => {
  let up = false;
  const h = harness({routes: {health: () => { if (!up) throw new TypeError('Failed to fetch'); return HEALTH; }}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"; strip.tone = "ok"');
  await h.run('checkFolder()');
  await h.run('checkFolder()');
  const warns = h.seen.notes.filter((n) => n[0] === 'warn');
  assert.equal(warns.length, 1, 'said once');
  assert.match(warns[0][1], /not reachable/);
  up = true;
  await h.run('checkFolder()');
  assert.deepEqual(h.seen.notes.at(-1), [''], 'cleared when the game answers again');
});

test('#link= only moves the port on this machine', () => {
  const h = harness();
  h.context.location.hash = '#link=http://127.0.0.1:8323';
  assert.equal(h.run('linkBase()'), 'http://127.0.0.1:8323');
  h.context.location.hash = '#link=http://localhost:8325/';
  assert.equal(h.run('linkBase()'), 'http://localhost:8325');
  for (const bad of ['#link=https://evil.example', '#link=http://10.0.0.5:8322', '#link=ftp://127.0.0.1', '#link=not a url']) {
    h.context.location.hash = bad;
    assert.equal(h.run('linkBase()'), 'http://127.0.0.1:8322', bad);
  }
});
