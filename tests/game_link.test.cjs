const {test} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const {between} = require('./_slice.cjs');
// The game-link section, plus the two functions it drives: update()'s first
// branch hands it the refresh, checkFolder() hands it the watch.
// The page's tt(), which app.js writes every word through.
const i18n = fs.readFileSync(path.join(__dirname, '..', 'web', 'i18n.js'), 'utf8');
// How app.js hands the strip its words: say(), failure() and errWords(),
// from web/app.js run whole.
const {shell} = require('./_shell.cjs').loadShell();
const words = (v) => (typeof v === 'function' ? v() : v);
const section = between(source, '  /* --- the game link (docs/game-link-api.md)', '  /* --- building');
const updater = between(source, '  async function update()', '  /* --- watching the folder');
const watcher = between(source, '  async function checkFolder()', '  function armWatch()');
const reporting = between(source, '  const reportSource = () =>', '  async function openReport(');
// The page's attempt, as app.js keeps it: one read at a time, per source,
// and a build in it ends it itself.
const attempts = between(source, '  function finishAttempt(gen)', '  // Cancel ownership');

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
    console, crypto: require("node:crypto").webcrypto, TextEncoder, TextDecoder,
    btoa: value => Buffer.from(value, "binary").toString("base64"),
    Date: Clock,
    File: class {
      constructor(parts, name, options) { this.parts = parts; this.name = name; Object.assign(this, options || {}); }
    },
    __waits: waits,
    __advance: (ms) => { clock.now += ms; },
    document: {hidden: false},
    window: {LEDGER_BUILD: 'test'},
    location: {hash: ''},
    localStorage: {getItem: () => null, setItem() {}, removeItem(key) { delete remembered[key]; }},
    // the app helpers the section is allowed to touch
    $: el, strip,
    say: shell.say, failure: shell.failure, errWords: shell.errWords,
    company: 'Costy Co', sourceGen: 1, attempt: null, readerError: null, handlers: null,
    canHandle: true, dirHandle: null, handles: {get: async () => null, set() {}},
    sourceActivity: 0, directoryPickPending: 0,
    watchTimer: 1,  // watching the game; null is the player's pause
    lastGood: {}, lastCheck: null, lastEntries: null, watchChecking: false,
    savePicker: {hidden: false},
    // app.js hands state() and note() its words as text or as a function
    // that writes them; the stand-ins write them out, as the real ones do.
    state(tone, head, meta) { seen.states.push([tone, words(head), words(meta)]); strip.tone = tone; },
    noted: {tone: '', text: '', sub: ''},
    note(...given) {
      const args = given.map((a, i) => (i === 1 || i === 2 ? words(a) : a));
      seen.notes.push(args); context.noted.tone = args[0] || ''; context.noted.text = args[1] || ''; context.noted.sub = args[2] || '';
      context.noted.words = [given[1], given[2]]; context.noted.recover = !!given[3];
    },
    stored: {get: (key) => remembered[key] || '', set: (key, value) => { remembered[key] = value; return true; }},
    onBoard: () => true,
    supersede: () => { context.finishAttempt(context.sourceGen); return ++context.sourceGen; },
    closeSavePicker() {}, place() {}, armWatch() {}, stopWatch() {}, syncWatchBtn() {}, linkMoved() {},
    pickedOnce() {},
    idleState() { seen.states.push(['idle']); strip.tone = 'ready'; },
    // A build ends the attempt whether the board takes the bytes or not.
    async buildFrom(file, dir, gen) {
      seen.builds.push(file);
      if (!context.startAttempt(gen)) return;
      const run = context.attempt;
      run.building = true;
      await null;
      run.building = false;
      context.finishAttempt(gen);
    },
    async scanHandle() { return []; },
    async refreshSaveMenu() { return ''; },
    chooseFrom: () => ({}),
    async fetch(url, init) {
      seen.calls.push([String(url), init]);
      let give = routes[['health', 'save', 'facts', 'refresh'].find((r) => new URL(url).pathname === '/' + r)];
      if (!give) throw new TypeError('Failed to fetch');
      if (typeof give === 'function') give = give(seen.calls.length);
      return 'status' in give ? give : reply(200, give);
    },
  });
  vm.runInContext(i18n, context);
  vm.runInContext(attempts + '\n' + section + '\n' + updater + '\n' + watcher + '\n' + reporting, context);
  vm.runInContext('heldFailure = null; sectionFailure = null; builtGen = null; snapshot = ""; lastFile = null;', context);
  vm.runInContext('linkWait = (ms) => { __waits.push(ms); __advance(ms); return Promise.resolve(); };', context);
  // linkFetch only ever reaches an address on this computer; the tests that
  // call it directly talk to the default one.
  vm.runInContext('linkUrl = "http://127.0.0.1:8322";', context);
  return {
    context, seen, els, routes, remembered, waits,
    run: (expr) => vm.runInContext(expr, context),
  };
}

test('linkFetch reaches only an address on this computer', async () => {
  for (const link of ['null', 'https://evil.example', '']) {
    const h = harness({routes: {health: HEALTH}});
    h.run(`linkUrl = ${JSON.stringify(link) === '""' ? 'null' : JSON.stringify(link)}`);
    await assert.rejects(h.run('linkFetch("/write/uniforms", {method: "POST"})'), (err) => err.unsent === true);
    assert.deepEqual(h.seen.calls, [], link);
  }
});

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
  assert.equal(err.message, en("app.link.down"));
  assert.equal(h.seen.calls.length, 3, 'every spelling was tried before giving up');
});

// Chrome's loopback permission, as navigator.permissions reports it: one
// state per name, and a name the browser does not know throws.
const permissions = (states) => ({
  permissions: {query: async ({name}) => {
    if (!(name in states)) throw new TypeError(`unknown permission ${name}`);
    return {state: states[name]};
  }},
});

test('an open permission prompt gets a long wait and a strip that says so', async () => {
  const h = harness({routes: {health: HEALTH}});
  const delays = [];
  h.context.setTimeout = (fn, ms) => { delays.push(ms); return 0; };
  h.context.navigator = permissions({'loopback-network': 'prompt', 'local-network-access': 'prompt'});
  h.context.location = {hash: '', hostname: 'bigcopilot.com'};
  h.run('linkUrl = "http://127.0.0.1:8322"; attempt = {gen: 1}');
  await h.run('linkFetch("/health")');
  assert.deepEqual(delays, [90000], 'the fetch waits for the player, not five seconds');
  assert.deepEqual(h.seen.states.at(-1),
    ['busy', en("app.link.allow"), en("app.link.allow.where")]);
});

test('a granted permission, or a browser that knows none, keeps the five-second timeout', async () => {
  for (const states of [{'loopback-network': 'granted', 'local-network-access': 'prompt'}, {}]) {
    const h = harness({routes: {health: HEALTH}});
    const delays = [];
    h.context.setTimeout = (fn, ms) => { delays.push(ms); return 0; };
    h.context.navigator = permissions(states);
    h.context.location = {hash: '', hostname: 'bigcopilot.com'};
    h.run('linkUrl = "http://127.0.0.1:8322"; attempt = {gen: 1}');
    await h.run('linkFetch("/health")');
    assert.deepEqual(delays, [5000]);
    assert.equal(h.seen.states.length, 0, 'nothing to ask, nothing said');
  }
});

test('a page served from this machine is never told to wait for a prompt', async () => {
  const h = harness({routes: {health: HEALTH}});
  const delays = [];
  h.context.setTimeout = (fn, ms) => { delays.push(ms); return 0; };
  h.context.navigator = permissions({'loopback-network': 'prompt'});
  h.context.location = {hash: '', hostname: 'localhost'};
  h.run('linkUrl = "http://127.0.0.1:8322"; attempt = {gen: 1}');
  await h.run('linkFetch("/health")');
  assert.deepEqual(delays, [5000]);
});

test('a blocked site is named as blocked, not as a closed game', async () => {
  const h = harness({routes: {health: HEALTH}});
  h.context.navigator = permissions({'loopback-network': 'denied'});
  h.context.location = {hash: '', hostname: 'bigcopilot.com'};
  h.run('linkUrl = "http://127.0.0.1:8322"');
  await h.run('loadFromLink("Linking to the game")');
  assert.equal(h.seen.calls.length, 0, 'no fetch the browser will refuse anyway');
  assert.deepEqual(h.seen.states.at(-1), ['bad', en("app.link.unreached"), 'http://127.0.0.1:8322']);
  assert.equal(h.seen.notes.at(-1)[1], en("app.link.blocked"));
  assert.match(h.seen.notes.at(-1)[2], enRe("app.link.blocked.fix"));
});

test('a Block answered under the prompt reads as blocked once the fetch fails', async () => {
  const h = harness();
  const states = {'loopback-network': 'prompt'};
  h.context.navigator = permissions(states);
  h.context.location = {hash: '', hostname: 'bigcopilot.com'};
  h.context.fetch = async () => { states['loopback-network'] = 'denied'; throw new TypeError('Failed to fetch'); };
  h.run('linkUrl = "http://127.0.0.1:8322"');
  const err = await h.run('linkFetch("/health").then(() => null, (e) => e)');
  assert.equal(err.message, en("app.link.blocked"));
  assert.equal(err.unsent, true, 'held at the prompt, it never left the browser');
});

test('an unreachable game leaves the bad state, the install note and the link', async () => {
  const h = harness();
  h.run('linkUrl = "http://127.0.0.1:8322"');
  await h.run('loadFromLink("Linking to the game")');
  assert.deepEqual(h.seen.states.at(-1), ['bad', en("app.link.unreached"), 'http://127.0.0.1:8322']);
  assert.match(h.seen.notes.at(-1)[1], enRe("app.link.down"));
  assert.match(h.seen.notes.at(-1)[2], enRe("app.link.start"));
  assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8322', 'Update has to be able to retry');
  assert.equal(h.seen.builds.length, 0);
});

test('a mod speaking another schema version is refused, naming the supported version', async () => {
  const h = harness({routes: {health: {...HEALTH, schemaVersion: 99, stamp: 's2'}}});
  await h.run('loadFromLink("Linking to the game")');
  assert.equal(h.seen.states.at(-1)[1], en("app.link.mismatch"));
  assert.match(h.seen.notes.at(-1)[1], enRe("app.link.mismatch.why", {v:99, need:5}));
  assert.equal(h.seen.builds.length, 0);
});

test('an unchanged stamp with a board on screen builds nothing', async () => {
  const h = harness({routes: {health: HEALTH}});
  h.run(`lastLinkStamp = ${JSON.stringify(HEALTH.stamp)}`);
  await h.run('loadFromLink("Reading the game")');
  assert.deepEqual(h.seen.states.at(-1),
    ['ok', en("app.link.same"), 'Costy Co \u00b7 ' + en('app.link.when', {day:34, at:'14:12'}) + ' \u00b7 ' + en('app.link.source')]);
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
  // The stamp is the board's only once buildFrom() has had the board take the
  // bytes (the stub here takes nothing): a failed build leaves the old one.
  assert.equal(h.run('lastLinkStamp'), 's1');
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
  assert.deepEqual(h.waits, [250], 'a quarter-second poll');
  assert.equal(h.seen.builds.length, 1);
});

test('a game that never serializes says so after thirty seconds', async () => {
  const h = harness({routes: {health: {...HEALTH, stamp: '', busy: false}}});
  await h.run('loadFromLink("Reading the game")');
  // Thirty seconds of the clock, however often it looks.
  assert.deepEqual(h.waits, Array(120).fill(250));
  assert.equal(h.seen.states.at(-1)[1], en("app.link.nosave"));
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
  let asked = 0;
  const h = harness({
    routes: {
      refresh: () => { asked += 1; return reply(429, {error: 'throttled', retryAfter: 70}); },
      // Nothing newer than the board until the second ask, then the refresh in flight lands.
      health: () => ({...HEALTH, stamp: asked < 2 ? 's1' : 's2'}),
      save: reply(200, null, {'X-Game-Link-Stamp': 's2'}),
    },
  });
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  assert.deepEqual(h.waits, [20000], 'retryAfter is capped at 20 s');
  assert.equal(h.seen.builds.length, 1);
  assert.equal(h.seen.builds[0].linkStamp, 's2');
});

test('a refusal keeps the board and names what the game is doing', async () => {
  for (const [reason, expected] of [
    ['saving', 'app.link.refuse.saving'],
    ['placement', 'app.link.refuse.placement'],
    ['interior', 'app.link.refuse.interior'],
    ['casino', 'app.link.refuse.casino'],
    [undefined, 'app.link.refuse.other'],
  ]) {
    const h = harness({routes: {refresh: reply(409, {error: 'cannot_save', reason})}});
    h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
    await h.run('update()');
    assert.equal(h.seen.builds.length, 0, reason);
    assert.match(h.seen.notes.at(-1)[1], enRe(expected));
    assert.match(h.seen.notes.at(-1)[1], new RegExp(enRe(expected).source + '$'));
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

test('linking again on another port forgets the stamp of the earlier link', async () => {
  const h = harness({
    routes: {health: HEALTH, save: reply(200, null, {'X-Game-Link-Stamp': HEALTH.stamp})},
  });
  h.run(`linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = ${JSON.stringify(HEALTH.stamp)}; linkGone = true`);
  h.context.location.hash = '#link=http://127.0.0.1:8323';
  await h.run('linkToGame()');
  assert.equal(h.seen.builds.length, 1, 'the new link reads its first stamp whatever the old one was');
  assert.equal(h.run('linkGone'), false, 'and starts with nothing said about the old one');
});

test('a refusal before any link build leaves the idle state, not a spinner', async () => {
  const h = harness({routes: {refresh: reply(409, {error: 'cannot_save', reason: 'interior'})}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = ""');
  await h.run('update()');
  assert.deepEqual(h.seen.states.at(-1), ['idle']);
  assert.match(h.seen.notes.at(-1)[1], enRe("app.link.refuse.interior"));
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
  assert.match(h.seen.notes.at(-1)[1], enRe("app.link.refuse.placement"));
  assert.equal(h.seen.builds.length, 0);
});

// The stub buildFrom() takes nothing; this one has the board take the bytes,
// and say so, as the real one does once the board has drawn them, taking
// `ms` of the clock.
function taking(h, ms = 0) {
  h.context.__builds = h.seen.builds;
  h.run(`buildFrom = async (file, dir, gen) => { __builds.push(file); __advance(${ms}); finishAttempt(gen);
    lastLinkStamp = file.linkStamp; state("ok", "Up to date"); }`);
}
const healthCalls = (h) => h.seen.calls.filter(([url]) => url.endsWith('/health')).length;
const saveFor = (stamp) => reply(200, null, {'X-Game-Link-Stamp': stamp});

test('the wait for a moving stamp after Update polls every quarter second, for 45 seconds of clock', async () => {
  const h = harness({routes: {refresh: reply(202, {accepted: true, stamp: 's1'}), health: HEALTH}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  assert.equal(h.seen.states.at(-1)[1], en("app.link.unfinished"));
  assert.ok(h.waits.every((ms) => ms === 250), 'every poll a quarter second');
  assert.equal(h.waits.reduce((a, b) => a + b, 0), 45000, 'the deadline is time, not a count of polls');
  assert.equal(h.run('attempt'), null);
});

test('a stamp that moves during the wait is read within a quarter second', async () => {
  let polls = 0;
  const h = harness({
    routes: {
      refresh: reply(202, {accepted: true, stamp: 's1'}),
      health: () => ({...HEALTH, stamp: ++polls > 8 ? 's2' : 's1'}),
      save: saveFor('s2'),
    },
  });
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  assert.equal(h.seen.builds.length, 1);
  assert.deepEqual(h.waits, Array(8).fill(250), 'two seconds of quarter-second polls');
});

test('Update inside the quiet window builds the newer bytes the mod holds, then still asks for a refresh', async () => {
  let asked = 0;
  const h = harness({
    routes: {
      refresh: () => (++asked === 1 ? reply(429, {error: 'throttled', retryAfter: 6}) : reply(202, {accepted: true, stamp: 's2'})),
      // The mod refreshed moments ago (s2, newer than the board's s1); the
      // refresh asked for after the window lands as s3.
      health: () => ({...HEALTH, stamp: asked < 2 ? 's2' : 's3'}),
      save: () => saveFor(asked < 2 ? 's2' : 's3'),
    },
  });
  taking(h, 3500);
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  await h.run('lookRun');
  assert.deepEqual(h.seen.builds.map((f) => f.linkStamp), ['s2', 's3'], 'the newest bytes at once, then the refresh after the click');
  assert.equal(asked, 2, 'the refresh is asked for again once the window lifts');
  assert.equal(h.waits[0], 2500, 'only what is left of the window after the build');
  const said = h.seen.states.find((st) => st[1] === en("app.link.recent"));
  assert.ok(said, 'the quiet window is named as such');
  assert.equal(said[2], 'http://127.0.0.1:8322 \u00b7 ' + en('app.link.askagain', {s:3}));
  assert.ok(!h.seen.states.some((st) => st[1] === en("app.link.already")), 'nothing was serializing');
  assert.equal(h.run('lastLinkStamp'), 's3');
  assert.equal(h.seen.states.at(-1)[0], 'ok');
  // The throttle's read and s2's; the poll and s3's; one look, after Update's
  // own build only: the build inside the window is followed by the ask.
  assert.equal(healthCalls(h), 5);
  assert.equal(h.run('attempt'), null, 'no attempt left held');
});

test('Update inside the quiet window with nothing newer waits it out and asks again, saying so', async () => {
  let asked = 0;
  const h = harness({
    routes: {
      refresh: () => (++asked === 1 ? reply(429, {error: 'throttled', retryAfter: 6}) : reply(202, {accepted: true, stamp: 's1'})),
      health: () => ({...HEALTH, stamp: asked < 2 ? 's1' : 's2'}),
      save: saveFor('s2'),
    },
  });
  taking(h);
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  await h.run('lookRun');
  assert.deepEqual(h.seen.builds.map((f) => f.linkStamp), ['s2']);
  assert.equal(h.waits[0], 6000);
  assert.ok(h.seen.states.some((st) => st[1] === en("app.link.recent") && new RegExp(enRe('app.link.askagain', {s:6}).source + '$').test(st[2])));
  assert.equal(h.run('attempt'), null);
});

test('a throttle while the game is serializing says so, and builds nothing early', async () => {
  let asked = 0;
  const h = harness({
    routes: {
      refresh: () => { asked += 1; return reply(429, {error: 'throttled', retryAfter: 4}); },
      // In flight: the stamp on /health is already newer, but busy.
      health: () => ({...HEALTH, stamp: asked < 2 ? 's2' : 's3', busy: asked < 2}),
      save: saveFor('s3'),
    },
  });
  taking(h);
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  await h.run('lookRun');
  assert.deepEqual(h.seen.states.find((st) => [en('app.link.already'), en('app.link.recent')].includes(st[1])),
    ['busy', en("app.link.already"), 'http://127.0.0.1:8322 \u00b7 ' + en('app.link.waiting', {s:4})]);
  assert.deepEqual(h.seen.builds.map((f) => f.linkStamp), ['s3'], 'only the finished refresh is built');
  assert.equal(h.run('attempt'), null);
});

test('a throttle whose health cannot be judged is not called serializing', async () => {
  for (const unread of [reply(503, {error: 'x'}), null]) {
    let asked = 0, reads = 0;
    const h = harness({
      routes: {
        refresh: () => (++asked === 1 ? reply(429, {error: 'throttled', retryAfter: 4}) : reply(202, {accepted: true, stamp: 's1'})),
        // The read right after the throttle is not health (or does not
        // answer at all); the poll after the second ask finds s2.
        health: () => {
          reads += 1;
          if (reads === 1 && !unread) throw new TypeError('Failed to fetch');
          return reads === 1 ? unread : {...HEALTH, stamp: 's2'};
        },
        save: saveFor('s2'),
      },
    });
    taking(h);
    h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
    await h.run('update()');
    await h.run('lookRun');
    assert.deepEqual(h.seen.states.find((st) => [en('app.link.already'), en('app.link.recent')].includes(st[1])),
      ['busy', en("app.link.recent"), 'http://127.0.0.1:8322 \u00b7 ' + en('app.link.askagain', {s:4})], String(unread && unread.status));
    assert.deepEqual(h.seen.builds.map((f) => f.linkStamp), ['s2']);
    assert.equal(h.run('attempt'), null);
  }
});

test('a build from the link looks once more, and an unchanged stamp ends it', async () => {
  const h = harness({routes: {health: {...HEALTH, stamp: 's2'}, save: saveFor('s2')}});
  taking(h);
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('checkFolder()');
  await h.run('lookRun');
  assert.equal(h.seen.builds.length, 1);
  // The watcher's check, the read's own health, and one look after the build.
  assert.equal(healthCalls(h), 3);
  assert.equal(h.waits.length, 0, 'the look waits for nothing');
  assert.equal(h.run('attempt'), null);
});

test('a refresh that landed during the first build is read at once', async () => {
  let builds = 0;
  const h = harness({
    routes: {
      // The attach refresh: s1 was served on linking, s2 lands while s1 builds.
      health: () => ({...HEALTH, stamp: builds === 0 ? 's1' : 's2'}),
      save: () => saveFor(builds === 0 ? 's1' : 's2'),
    },
  });
  taking(h);
  const take = h.context.buildFrom;
  h.context.buildFrom = async (file, dir, gen) => { await take(file, dir, gen); builds += 1; };
  await h.run('linkToGame()');
  await h.run('lookRun');
  assert.deepEqual(h.seen.builds.map((f) => f.linkStamp), ['s1', 's2']);
  assert.equal(h.run('lastLinkStamp'), 's2');
  assert.equal(h.run('attempt'), null);
});

test("a look's own build does not look again: the watcher takes it from there", async () => {
  // The game refreshes through every build, as at top speed on a slow machine.
  let n = 0;
  const stamp = () => `s${n + 2}`;
  const h = harness({routes: {health: () => ({...HEALTH, stamp: stamp()}), save: () => saveFor(stamp())}});
  taking(h);
  const take = h.context.buildFrom;
  h.context.buildFrom = async (file, dir, gen) => { await take(file, dir, gen); n += 1; };
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('checkFolder()');
  await h.run('lookRun');
  assert.deepEqual(h.seen.builds.map((f) => f.linkStamp), ['s2', 's3'], 'the build, and the one its look found; no third');
  // The check and its read; the look and its read; nothing after.
  assert.equal(healthCalls(h), 4);
  assert.equal(h.run('attempt'), null);
});

test('a paused watcher is not followed by a look after a build', async () => {
  const h = harness({routes: {health: {...HEALTH, stamp: 's2'}, save: saveFor('s2')}});
  taking(h);
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"; watchTimer = null');
  await h.run('loadFromLink("Reading the game")');
  assert.equal(h.seen.builds.length, 1);
  assert.equal(healthCalls(h), 1, 'the read only; no look while the player has paused watching');
  assert.equal(h.run('lookRun'), null);
  assert.equal(h.run('attempt'), null);
});

test('a pause while the look is reading /health ends the look before it builds', async () => {
  let reads = 0;
  const h = harness({
    routes: {
      // The check and the read find s2; the look's own read finds s3, and the
      // player pauses watching while that answer is on the way.
      health: () => {
        reads += 1;
        if (reads === 3) h.run('watchTimer = null');
        return {...HEALTH, stamp: reads < 3 ? 's2' : 's3'};
      },
      save: () => saveFor(reads < 3 ? 's2' : 's3'),
    },
  });
  taking(h);
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('checkFolder()');
  await h.run('lookRun');
  assert.equal(reads, 3, 'the look read /health');
  assert.deepEqual(h.seen.builds.map((f) => f.linkStamp), ['s2'], 'and built nothing after the pause');
  assert.equal(h.run('attempt'), null);
});

test('a build that did not take never loops on the same stamp', async () => {
  // The stub buildFrom() leaves the board's stamp as it was, as a failed build does.
  const h = harness({routes: {health: {...HEALTH, stamp: 's2'}, save: saveFor('s2')}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('checkFolder()');
  assert.equal(h.seen.builds.length, 1);
  assert.equal(healthCalls(h), 2, 'no look after a build the board did not take');
  assert.equal(h.run('lookRun'), null);
  assert.equal(h.run('attempt'), null);
});

test("a write's follow reports on its own build, not on the look after it", async () => {
  let builds = 0;
  const told = [];
  const h = harness({
    routes: {
      // The write's refresh is s2; the game moves on to s3 while it builds,
      // and the save the look asks for is not served.
      health: () => ({...HEALTH, stamp: builds === 0 ? 's2' : 's3'}),
      save: () => (builds === 0 ? saveFor('s2') : reply(503, {error: 'no_save_yet'})),
    },
  });
  taking(h);
  const take = h.context.buildFrom;
  h.context.buildFrom = async (file, dir, gen) => { await take(file, dir, gen); builds += 1; };
  h.context.handlers = {followDone: () => told.push('done'), followFailed: () => told.push('failed')};
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('followWrite("s1")');
  assert.deepEqual(told, ['done'], 'told as soon as its own build is on the board');
  await h.run('lookRun');
  assert.deepEqual(told, ['done'], "the look's failure is not the follow's");
  assert.equal(h.seen.states.at(-1)[1], en("app.link.unread"), 'the look said its own trouble');
  assert.equal(h.run('attempt'), null);
});

test('a mod that did not take the refresh is not reported as absent', async () => {
  const h = harness({routes: {refresh: reply(503, {error: 'main_thread_unavailable'}), health: HEALTH}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  assert.equal(h.seen.states.at(-1)[0], 'ok');
  assert.match(h.seen.notes.at(-1)[1], enRe("app.link.refresh.refused", {status:503}));
});

test('a save answered with an error names the error, not a parse failure', async () => {
  const h = harness({routes: {health: {...HEALTH, stamp: 's9'}, save: reply(503, {error: 'no_save_yet'})}});
  h.run('linkUrl = "http://127.0.0.1:8322"');
  await h.run('loadFromLink("Reading the game")');
  assert.deepEqual(h.seen.states.at(-1), ['bad', en("app.link.unread"), 'http://127.0.0.1:8322']);
  assert.match(h.seen.notes.at(-1)[1], enRe("app.link.save.error", {status:503, error:"no_save_yet"}));
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
  assert.match(warns[0][1], enRe("app.link.gone"));
  up = true;
  await h.run('checkFolder()');
  assert.deepEqual(h.seen.notes.at(-1), [''], 'cleared when the game answers again');
});

test('any answer from the mod ends the gone note, a refusal included', async () => {
  const h = harness({routes: {refresh: reply(409, {error: 'cannot_save', reason: 'saving'}), health: HEALTH}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"; linkGone = true');
  await h.run('update()');
  assert.equal(h.run('linkGone'), false, 'a 409 is still an answer');
  h.run('linkGone = true; lastLinkStamp = "s1"');
  await h.run('loadFromLink("Reading the game")');
  assert.equal(h.seen.states.at(-1)[1], en("app.link.same"));
  assert.equal(h.run('linkGone'), false, 'so is "no newer state"');
});

test('a /health that is not 200 is waited out, never read as a version mismatch', async () => {
  let asked = 0;
  // A 503, then a 204 that a browser would call ok: neither is a health answer.
  const h = harness({
    routes: {
      health: () => (asked++ === 0 ? reply(503, {error: 'too_many_requests'})
        : asked === 2 ? reply(204, null) : {...HEALTH, stamp: 's7'}),
      save: reply(200, null, {'X-Game-Link-Stamp': 's7'}),
    },
  });
  h.run('linkUrl = "http://127.0.0.1:8322"');
  await h.run('loadFromLink("Reading the game")');
  assert.equal(h.seen.builds.length, 1, 'built once the mod answered with health');
  assert.ok(!h.seen.states.some((s) => enRe("app.link.mismatch").test(s[1])), 'no version refusal');
});

test('an incompatible mod that is busy is refused at once, not after the wait', async () => {
  const h = harness({routes: {health: {...HEALTH, schemaVersion: 99, stamp: '', busy: true}}});
  h.run('linkUrl = "http://127.0.0.1:8322"');
  await h.run('loadFromLink("Reading the game")');
  assert.equal(h.waits.length, 0, 'no waiting');
  assert.match(h.seen.notes.at(-1)[1], enRe("app.link.mismatch.why", {v:99, need:5}));
});

test('a port that never answers as the mod is named after the wait, not blamed on a missing save', async () => {
  const h = harness({routes: {health: reply(503, {error: 'x'})}});
  h.run('linkUrl = "http://127.0.0.1:8322"');
  await h.run('loadFromLink("Reading the game")');
  assert.equal(h.seen.states.at(-1)[1], en("app.link.notmod"));
  assert.match(h.seen.notes.at(-1)[1], enRe('app.link.notmod.never'));
});

test('a port that answered as the mod once is not blamed when it stops answering as it', async () => {
  let asked = 0;
  const h = harness({routes: {health: () => (asked++ === 0 ? {...HEALTH, stamp: '', busy: true} : reply(503, {error: 'x'}))}});
  h.run('linkUrl = "http://127.0.0.1:8322"');
  await h.run('loadFromLink("Reading the game")');
  assert.equal(h.seen.states.at(-1)[1], en("app.link.nosave"));
});

test('a foreign 200 that copies the not-ready shape is still judged', async () => {
  const h = harness({routes: {health: {stamp: '', busy: true, notReady: true}}});
  h.run('linkUrl = "http://127.0.0.1:8322"');
  await h.run('loadFromLink("Reading the game")');
  assert.equal(h.seen.states.at(-1)[1], en("app.link.notmod"));
  assert.equal(h.waits.length, 0, 'judged at once, not waited out as not ready');
});

test('a 200 /health with no object in it is not ready, and names the port after the wait', async () => {
  for (const body of [null, [1, 2], 'x']) {
    const h = harness({routes: {health: reply(200, body)}});
    h.run('linkUrl = "http://127.0.0.1:8322"');
    await h.run('loadFromLink("Reading the game")');
    assert.equal(h.seen.states.at(-1)[1], en("app.link.notmod"), JSON.stringify(body));
    assert.ok(!h.seen.states.some((s) => enRe("app.link.mismatch").test(s[1])), 'never a version refusal');
    assert.ok(h.waits.length > 0, 'waited out like busy, not refused on the first answer');
  }
});

test('an Update accepted by something that never answers as the mod names the port, in thirty seconds', async () => {
  const h = harness({routes: {refresh: reply(202, {accepted: true, stamp: 's1'}), health: reply(503, {error: 'x'})}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  assert.equal(h.seen.states.at(-1)[1], en("app.link.notmod"));
  const waited = h.waits.reduce((a, b) => a + b, 0);
  assert.ok(waited <= 30000, `waited ${waited} ms; the bound for never-health is thirty seconds`);
});

test('an incompatible mod answering an Update is refused inside the poll, not after 45 seconds', async () => {
  const h = harness({routes: {refresh: reply(202, {accepted: true, stamp: 's1'}), health: {...HEALTH, schemaVersion: 99}}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"');
  await h.run('update()');
  assert.match(h.seen.notes.at(-1)[1], enRe("app.link.mismatch.why", {v:99, need:5}));
  assert.equal(h.waits.length, 0);
});

test('a health object with no version is the port, not "version undefined"', async () => {
  // (not `status`: the harness reads that key as an HTTP status)
  for (const body of [{hello: 'world'}, {schemaVersion: null}]) {
    const h = harness({routes: {health: body}});
    h.run('linkUrl = "http://127.0.0.1:8322"');
    await h.run('loadFromLink("Reading the game")');
    assert.equal(h.seen.states.at(-1)[1], en("app.link.notmod"), JSON.stringify(body));
    assert.match(h.seen.notes.at(-1)[1], enRe("app.link.notmod.why"));
    assert.ok(!/undefined|null/.test(h.seen.notes.at(-1)[1]));
  }
});

test('the watcher names a port taken over after ten checks, once, and counts from zero on health', async () => {
  let healthy = false;
  const h = harness({routes: {health: () => (healthy ? HEALTH : reply(503, {error: 'x'}))}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"; strip.tone = "ok"');
  for (let i = 0; i < 12; i++) await h.run('checkFolder()');
  const warns = h.seen.notes.filter((n) => n[0] === 'warn');
  assert.equal(warns.length, 1);
  assert.match(warns[0][1], enRe("app.link.port.gone"));
  healthy = true;
  await h.run('checkFolder()');
  assert.equal(h.run('linkNotReady'), 0);
});

test('the takeover count does not leak into a relink, and a disconnect does not silence it for good', async () => {
  let mode = 'notready';
  const h = harness({routes: {health: () => {
    if (mode === 'down') throw new TypeError('Failed to fetch');
    return mode === 'health' ? HEALTH : reply(503, {error: 'x'});
  }, save: reply(200, null, {'X-Game-Link-Stamp': 's1'})}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"; strip.tone = "ok"');
  for (let i = 0; i < 9; i++) await h.run('checkFolder()');
  assert.equal(h.run('linkNotReady'), 9);
  // A relink to another port starts from nothing: the port stays not ready
  // through the relink, so only linkToGame's own reset can bring the count
  // to zero (readHealth resets it on a health answer, and there is none).
  h.context.location.hash = '#link=http://127.0.0.1:8323';
  await h.run('linkToGame()');
  assert.equal(h.run('linkNotReady'), 0, 'linkToGame itself reset the count');
  h.run('strip.tone = "ok"');
  await h.run('checkFolder()');
  assert.equal(h.seen.notes.filter((n) => n[0] === 'warn').length, 0, 'one check on the new port says nothing');
  // Ten more say it once; a disconnect and a return say it again.
  for (let i = 0; i < 10; i++) await h.run('checkFolder()');
  let warns = h.seen.notes.filter((n) => enRe("app.link.port.gone").test(n[1]));
  assert.equal(warns.length, 1);
  mode = 'down';
  await h.run('checkFolder()');
  mode = 'notready';
  await h.run('checkFolder()');
  warns = h.seen.notes.filter((n) => enRe("app.link.port.gone").test(n[1]));
  assert.equal(warns.length, 2, 'said again after the game came back and the port was still not the mod');
});

test('the takeover note is withdrawn when the port answers as the mod again, stamp or no stamp', async () => {
  let mode = 'notready';
  const h = harness({routes: {health: () => (mode === 'health' ? {...HEALTH, stamp: 's1'} : reply(503, {error: 'x'}))}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"; strip.tone = "ok"');
  for (let i = 0; i < 10; i++) await h.run('checkFolder()');
  assert.match(h.seen.notes.at(-1)[1], enRe("app.link.port.gone"));
  mode = 'health';
  await h.run('checkFolder()');
  assert.deepEqual(h.seen.notes.at(-1), [''], 'withdrawn although the stamp did not move');
  assert.equal(h.seen.builds.length, 0);
});

test('the watcher says once when a foreign object or another version answers, and withdraws it on health', async () => {
  let body = {hello: 'world'};
  const h = harness({routes: {health: () => body}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"; strip.tone = "ok"');
  await h.run('checkFolder()');
  await h.run('checkFolder()');
  let warns = h.seen.notes.filter((n) => n[0] === 'warn');
  assert.equal(warns.length, 1);
  assert.match(warns[0][1], enRe("app.link.port.gone"));
  body = {...HEALTH, stamp: 's1'};
  await h.run('checkFolder()');
  assert.deepEqual(h.seen.notes.at(-1), ['']);
  body = {...HEALTH, schemaVersion: 99, stamp: 's1'};
  await h.run('checkFolder()');
  assert.match(h.seen.notes.at(-1)[1], enRe("app.link.port.version", {v:99, need:5}));
});

test('an Update that reads health of this version re-arms the port note of the watcher', async () => {
  let mode = 'notready';
  const h = harness({routes: {
    health: () => (mode === 'health' ? {...HEALTH, stamp: 's2'} : reply(503, {error: 'x'})),
    refresh: reply(202, {accepted: true, stamp: 's1'}),
    save: reply(200, null, {'X-Game-Link-Stamp': 's2'}),
  }});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"; strip.tone = "ok"');
  for (let i = 0; i < 10; i++) await h.run('checkFolder()');
  assert.match(h.context.noted.text, enRe("app.link.port.gone"));
  mode = 'health';
  await h.run('update()');
  assert.ok(!enRe("app.link.port.gone").test(h.context.noted.text), 'the build replaced the note');
  mode = 'notready';
  h.run('strip.tone = "ok"');
  for (let i = 0; i < 10; i++) await h.run('checkFolder()');
  assert.equal(h.seen.notes.filter((n) => enRe("app.link.port.gone").test(n[1])).length, 2, 'said again');
});

test('a note the player earned another way does not silence the watcher, and the note stands while the condition holds', async () => {
  let body = {hello: 'world'};
  const h = harness({routes: {health: () => body, refresh: reply(404, {error: 'not_found'})}});
  h.run('linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"; strip.tone = "ok"');
  await h.run('checkFolder()');
  assert.match(h.context.noted.text, enRe("app.link.port.gone"));
  await h.run('checkFolder()');
  assert.match(h.context.noted.text, enRe("app.link.port.gone"), 'still up, not withdrawn while the condition holds');
  assert.equal(h.seen.notes.filter((n) => enRe("app.link.port.gone").test(n[1])).length, 1, 'and not said twice');
  // The player follows the advice; Update's refusal replaces the note.
  await h.run('update()');
  assert.match(h.context.noted.text, enRe("app.link.refresh.refused"));
  h.run('strip.tone = "ok"');
  await h.run('checkFolder()');
  assert.match(h.context.noted.text, enRe("app.link.port.gone"), 'said again once the other note is gone');
  // A version-2 mod on the port replaces the wording.
  body = {...HEALTH, schemaVersion: 99, stamp: 's1'};
  await h.run('checkFolder()');
  assert.match(h.context.noted.text, enRe("app.link.port.version", {v:99, need:5}));
});

test('#link= only moves the port on this machine', () => {
  const h = harness();
  h.context.location.hash = '#link=http://127.0.0.1:8323';
  assert.equal(h.run('linkBase()'), 'http://127.0.0.1:8323');
  // GL-1 in #110: the mod listens on 127.0.0.1 and turns away any other Host,
  // so the other names for this machine are spelt the way it answers.
  for (const other of ['#link=http://localhost:8325/', '#link=http://LOCALHOST:8325', '#link=http://[::1]:8325']) {
    h.context.location.hash = other;
    assert.equal(h.run('linkBase()'), 'http://127.0.0.1:8325', other);
  }
  for (const bad of ['#link=https://evil.example', '#link=http://10.0.0.5:8322', '#link=ftp://127.0.0.1', '#link=not a url',
    '#link=http://localhost.evil.example:8325', '#link=https://localhost:8325']) {
    h.context.location.hash = bad;
    assert.equal(h.run('linkBase()'), 'http://127.0.0.1:8322', bad);
  }
});

// WB-1 in #109: the save's bytes are read under linkFetch's own timer, and a
// game that quits or stalls mid-download ends the read like a closed game,
// not as an unhandled rejection that leaves "Reading the game" on screen.
test('a game that quits mid-download reads as unreachable, with nothing built', async () => {
  const cut = {...reply(200, null, {'X-Game-Link-Stamp': 's9'}),
    arrayBuffer: async () => { throw new TypeError('network error'); }};
  const h = harness({routes: {health: {...HEALTH, stamp: 's9'}, save: cut}});
  let finished = 0;
  h.context.finishAttempt = () => { finished++; };
  h.run('lastLinkStamp = "s1"');
  await h.run('loadFromLink("Reading the game")');
  assert.equal(h.seen.builds.length, 0);
  assert.deepEqual(h.seen.states.at(-1), ['bad', en("app.link.unreached"), 'http://127.0.0.1:8322']);
  assert.match(h.seen.notes.at(-1)[1], enRe("app.link.down"));
  assert.equal(finished, 1, 'the attempt is over, so Update works again');
  assert.equal(h.run('lastLinkStamp'), 's1', 'the next check reads the save again');
});

test("the save's timer runs until its bytes are in, and is longer than a health check's", async () => {
  const h = harness({routes: {health: {...HEALTH, stamp: 's9'}}});
  const timers = [];
  let live = 0;
  h.context.setTimeout = (fn, ms) => { timers.push(ms); live++; return timers.length; };
  h.context.clearTimeout = () => { live--; };
  let during = null;
  h.routes.save = {...reply(200, null, {'X-Game-Link-Stamp': 's9'}),
    arrayBuffer: async () => { during = live; return new ArrayBuffer(8); }};
  await h.run('loadFromLink("Reading the game")');
  assert.deepEqual(timers, [5000, 30000], 'health, then the save');
  assert.equal(during, 1, "the save's timer is still armed while its body is read");
  assert.equal(live, 0);
  assert.equal(h.seen.builds.length, 1);
  assert.equal(h.seen.builds[0].parts[0].byteLength, 8, 'the bytes read are the ones built');
});

// GL-4 in #110: the tab outlives the mod it was read from. linkHealth moves
// only with new bytes, so the watcher's health is what says the mod now
// speaks another version: no write goes to it, and the dialog says why.
// Values made inside the harness's context, compared as plain data.
const plain = (v) => JSON.parse(JSON.stringify(v));

test('a mod that now speaks another version takes no writes until it speaks this one again', async () => {
  let body = {...HEALTH, writes: ['uniforms', 'imports'], stamp: 's1'};
  const h = harness({routes: {health: () => body}});
  let moved = 0;
  h.context.linkMoved = () => { moved++; };
  h.run(`linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"; strip.tone = "ok"; linkHealth = ${JSON.stringify(body)}`);
  await h.run('checkFolder()');
  assert.deepEqual(plain(h.run('linkWrites()')), ['uniforms', 'imports']);
  assert.equal(moved, 0, 'nothing changed');

  body = {...HEALTH, schemaVersion: 99, writes: ['uniforms', 'imports'], stamp: 's1'};
  await h.run('checkFolder()');
  assert.match(h.context.noted.text, enRe("app.link.port.version", {v:99, need:5}));
  assert.deepEqual(plain(h.run('linkWrites()')), [], 'the board draws its write buttons off');
  assert.equal(moved, 1, 'an open write dialog hears of it');
  const refused = await h.run('gameWrite("uniforms", {sites: []}, {dryRun: true})');
  assert.deepEqual(plain(refused), {status: 0, error: 'mismatch', version: 99, need: 5, body: null});
  assert.equal(h.run('bindSource().holds()'), false, 'a write under way stops before its next request');
  assert.ok(!h.seen.calls.some(([url]) => url.includes('/write/') || url.includes('/pair/')), 'nothing was sent');

  body = {hello: 'world'};
  await h.run('checkFolder()');
  assert.equal((await h.run('gameWrite("uniforms", {sites: []}, {dryRun: true})')).error, 'not_linked',
    'something that is no mod at all is not linked');

  body = {...HEALTH, writes: ['uniforms', 'imports'], stamp: 's1'};
  await h.run('checkFolder()');
  assert.deepEqual(plain(h.run('linkWrites()')), ['uniforms', 'imports'], 'back once it speaks this version');
  assert.equal(h.run('bindSource().holds()'), true);
});

// Mod 0.4.0 lists what its kinds can do beyond their first contract (the hire
// call's reschedule-only weeks and its undo): the board reads it off link().
test('the features a mod lists reach the board as strings; an older mod, or another version, lists none', async () => {
  const h = harness({routes: {health: () => HEALTH}});
  h.run(`linkUrl = "http://127.0.0.1:8322"; linkSchema = 1; linkHealth = ${JSON.stringify({...HEALTH, writes: ['hire'], features: ['hire.reschedule', 'hire.undo', 7]})}`);
  assert.deepEqual(plain(h.run('linkFeatures()')), ['hire.reschedule', 'hire.undo']);
  h.run(`linkHealth = ${JSON.stringify({...HEALTH, writes: ['hire']})}`);
  assert.deepEqual(plain(h.run('linkFeatures()')), []);
  h.run(`linkSchema = 99; linkHealth = ${JSON.stringify({...HEALTH, writes: ['hire'], features: ['hire.undo']})}`);
  assert.deepEqual(plain(h.run('linkFeatures()')), []);
});

// Uniforms and marketing (mod 0.4.0) find their buildings by address alone:
// they name the save the board was read from, so the mod answers `changed`
// when the game has another one loaded. The other kinds carry their own ids.
// The board judges an agency open by the game's hour, so the clock moves on
// every /health, new bytes or not; the strip keeps the bytes' own time.
test('the game clock moves with every health read, and the board hears when the hour turns', async () => {
  const h = harness({routes: {health: HEALTH}});
  h.run(`linkHealth = ${JSON.stringify(HEALTH)}; lastLinkStamp = "s1"`);
  const ticks = [];
  h.context.handlers = {linkClock: () => ticks.push(h.run('linkTime().hour'))};
  h.routes.health = {...HEALTH, minute: 40};
  await h.run('readHealth()');
  assert.deepEqual(plain(h.run('linkTime()')), {day: 34, hour: 14, minute: 40});
  assert.deepEqual(ticks, [], 'the same hour: nothing to hear');
  h.routes.health = {...HEALTH, hour: 17, minute: 45};
  await h.run('readHealth()');
  assert.deepEqual(plain(h.run('linkTime()')), {day: 34, hour: 17, minute: 45});
  assert.deepEqual(ticks, [17]);
  // Another game's health moves nothing: the board is not of it.
  h.routes.health = {...HEALTH, character: 'other', hour: 20};
  await h.run('readHealth()');
  assert.equal(h.run('linkTime().hour'), 17);
  assert.deepEqual(ticks, [17]);
  assert.equal(h.run('linkHealth.hour'), 14, 'the bytes keep their own time for the strip');
  // Newer bytes waiting: the clock moves, but the board is not drawn again
  // before the build that follows draws it.
  h.routes.health = {...HEALTH, hour: 18, stamp: 's2'};
  await h.run('readHealth()');
  assert.equal(h.run('linkTime().hour'), 18);
  assert.deepEqual(ticks, [17]);
});

test('guarded writes including Street Food routes name the save they were planned from; imports do not', async () => {
  const health = {...HEALTH, writes: ['uniforms', 'imports', 'schedule', 'hire', 'marketing', 'rent', 'wholesale', 'streetFoodRoute']};
  const h = harness({routes: {health}});
  h.run(`linkHealth = ${JSON.stringify(health)}; keepApproval(linkUrl, "approved-token")`);
  const sent = [];
  const reads = h.context.fetch;
  h.context.fetch = async (url, init) => {
    if (!String(url).includes('/write/')) return reads(url, init);
    const kind = String(url).split('/write/')[1];
    sent.push([kind, JSON.parse(init.body), init.headers.Authorization]);
    return reply(200, {ok: true, kind, dryRun: true, rows: []});
  };
  for (const kind of ['marketing', 'uniforms', 'rent', 'wholesale', 'streetFoodRoute', 'imports']) {
    const got = await h.run(`gameWrite(${JSON.stringify(kind)}, {sites: []}, {dryRun: true})`);
    assert.equal(got.error, null, kind);
    assert.equal(got.body.kind, kind);
  }
  const save = {character: 'abc', company: 'Costy Co'};
  assert.deepEqual(sent.map(([kind, body, auth]) => [kind, body.expect || null, body.dryRun, auth]), [
    ['marketing', save, true, 'Bearer approved-token'],
    ['uniforms', save, true, 'Bearer approved-token'],
    ['rent', save, true, 'Bearer approved-token'],
    ['wholesale', save, true, 'Bearer approved-token'],
    ['streetFoodRoute', save, true, 'Bearer approved-token'],
    ['imports', null, true, 'Bearer approved-token'],
  ]);
  assert.deepEqual(plain(h.run('linkWrites()')), health.writes, 'the board offers what the mod lists');
});

test('the refusal on Update is still the full one, and names the version this page needs', async () => {
  const h = harness({routes: {health: {...HEALTH, schemaVersion: 99}}});
  await h.run('loadFromLink("Linking to the game")');
  assert.deepEqual(h.seen.states.at(-1), ['bad', en("app.link.mismatch"), 'http://127.0.0.1:8322']);
  assert.match(h.seen.notes.at(-1)[1], enRe("app.link.mismatch.why", {v:99, need:5}));
  assert.deepEqual(plain(h.run('linkWrites()')), []);
});


test('schema 2 transfers raw save bytes and hash-bound facts separately; stale facts never build', async () => {
  const raw = new Uint8Array([31, 139, 1, 2, 3]).buffer;
  const health = {...HEALTH, schemaVersion: 2, features: ['building-facts.v1']};
  const facts = {schemaVersion: 1, model: 'building-values-v1', stamp: HEALTH.stamp, character: HEALTH.character,
    saveSha256: require('node:crypto').createHash('sha256').update(Buffer.from(raw)).digest('hex')};
  const save = {...reply(200, null, {'X-Game-Link-Stamp': HEALTH.stamp, 'X-Game-Link-Character': HEALTH.character}), arrayBuffer: async () => raw};
  for (const invalid of [null, 'stamp', 'character', 'saveSha256']) {
    const current = {...facts, ...(invalid ? {[invalid]: 'wrong'} : {})};
    const response = {...reply(200, null), arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(current)).buffer};
    const h = harness({routes: {health, save, facts: response}});
    h.context.btoa = () => { throw new Error('A live load must not encode Base64'); };
    withFallback(h); // Invalid facts keep their diagnostic even with a local fallback.
    await h.run('loadFromLink("Reading the game")');
    assert.equal(h.seen.builds.length, invalid ? 0 : 1, invalid || 'matching pair');
    if (!invalid) {
      const file = h.seen.builds[0];
      assert.equal(file.name, 'abc-live.bcsave');
      assert.equal(file.parts[0], raw, 'no binary string, Base64 or JSON copy before parsing');
      assert.deepEqual(JSON.parse(file.linkFacts), facts);
    }
  }
});

// Exercise the actual folder loader after a link failure, including its scan,
// saved selection, failure states and handoff to the board's build.
function withFallback(h, permission = 'granted') {
  const local = {name: 'local.hsg', lastModified: 10};
  const handle = {name: 'Big Ambitions', queryPermission: async () => permission,
    requestPermission: async () => { throw new Error('Automatic fallback must not prompt'); }};
  h.context.handles.get = async () => handle;
  h.remembered.ledger_link = 'http://127.0.0.1:8322';
  h.context.scanHandle = async value => {
    assert.equal(value, handle);
    return [{file: local, dir: 'character'}];
  };
  h.context.chooseFrom = entries => entries[0] || {};
  h.context.onScreen = () => false;
  h.context.fileLine = file => file.name;
  h.context.sayStoreTrouble = () => false;
  h.context.armWatch = () => { h.seen.folderWatch = true; };
  // The strip as the real buildFrom() leaves it after a board took the bytes:
  // the note cleared, busy while reading, then storage trouble said again
  // and the ok tone, which is what the fallback's own note is judged on. The
  // build holds the attempt while it runs and ends it itself.
  h.context.buildFrom = async (file, dir, gen) => {
    h.seen.builds.push(file);
    if (!h.context.startAttempt(gen)) return;
    const run = h.context.attempt;
    run.building = true;
    h.context.note('');
    h.context.state('busy', file.name);
    await null;
    run.building = false;
    h.context.finishAttempt(gen);
    if (!h.context.sayStoreTrouble()) h.context.note('');
    h.context.state('ok', 'Up to date');
  };
  vm.runInContext(between(source, '  async function loadFromEntries(', '  async function takeHandle('), h.context);
  return {handle, local};
}

test('a failed initial link opens the remembered local folder and keeps Link for the next visit', async () => {
  const h = harness();
  h.context.onBoard = () => false;
  const {handle, local} = withFallback(h);
  await h.run('loadFromLink("Opening the game link", sourceGen)');
  assert.deepEqual(h.seen.builds, [local]);
  assert.equal(h.run('linkUrl'), null);
  assert.equal(h.context.dirHandle, handle);
  assert.equal(h.remembered.ledger_link, 'http://127.0.0.1:8322');
  assert.equal(h.context.attempt, null);
  assert.equal(h.seen.folderWatch, true);
  assert.equal(h.els.get('srcStrip').title, '');
});

test('a disconnected watcher switches to local saves and disables game writes', async () => {
  const h = harness();
  const {local} = withFallback(h);
  h.run(`linkHealth = ${JSON.stringify({...HEALTH, writes: ['uniforms']})}; lastLinkStamp = "s1"`);
  assert.deepEqual(plain(h.run('linkWrites()')), ['uniforms']);
  await h.run('checkFolder()');
  assert.deepEqual(h.seen.builds, [local]);
  assert.deepEqual(plain(h.run('linkWrites()')), []);
  assert.equal(h.run('linkHealth'), null);
  assert.equal(h.context.watchChecking, false);
});

test('Update falls back when the running game has closed', async () => {
  const h = harness();
  const {local} = withFallback(h);
  await h.run('update()');
  assert.deepEqual(h.seen.builds, [local]);
  assert.equal(h.context.attempt, null);
});

for (const permission of ['prompt', 'denied']) {
  test(`folder permission ${permission} waits for an explicit Update click`, async () => {
    const h = harness();
    const {handle, local} = withFallback(h, permission);
    await h.run('loadFromLink("Opening", sourceGen)');
    assert.deepEqual(h.seen.builds, []);
    assert.equal(h.run('linkUrl'), null);
    assert.equal(h.context.dirHandle, handle);
    assert.equal(h.context.attempt, null);
    assert.equal(h.seen.states.at(-1)[0], 'remembered');
    assert.equal(h.seen.notes.at(-1)[1], en('app.link.fallback.permission'));
    handle.requestPermission = async () => 'granted';
    await h.run('update()');
    assert.deepEqual(h.seen.builds, [local]);
  });
}

test('a folder handle kept in this tab works when browser storage is unavailable', async () => {
  const h = harness();
  const {handle, local} = withFallback(h);
  h.context.handles.get = async () => null;
  h.context.dirHandle = handle;
  await h.run('linkToGame()');
  assert.deepEqual(h.seen.builds, [local]);
});

test('no remembered folder, unsupported browsers and unavailable permission checks keep link recovery usable', async () => {
  for (const mode of ['missing', 'unsupported', 'permission-error']) {
    const h = harness();
    if (mode === 'unsupported') h.context.canHandle = false;
    if (mode === 'permission-error') h.context.handles.get = async () => ({queryPermission: async () => { throw Error('Unavailable'); }});
    await h.run('loadFromLink("Opening", sourceGen)');
    assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8322', mode);
    assert.equal(h.seen.states.at(-1)[1], en('app.link.unreached'), mode);
    assert.equal(h.seen.notes.at(-1)[3], true, 'offers the existing Choose a folder instead action');
    assert.equal(h.context.attempt, null);
  }
});

test('source selections supersede pending folder restoration', async () => {
  for (const stage of ['storage', 'permission', 'scan']) {
    const h = harness();
    const {handle} = withFallback(h);
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    if (stage === 'storage') h.context.handles.get = () => pending;
    if (stage === 'permission') handle.queryPermission = () => pending;
    if (stage === 'scan') h.context.scanHandle = () => pending;
    const loading = h.run('loadFromLink("Opening", sourceGen)');
    await new Promise(resolve => setImmediate(resolve));
    h.run('supersede(); dropLink(); dirHandle = null;');
    release(stage === 'storage' ? handle : stage === 'permission' ? 'granted' : []);
    await loading;
    assert.deepEqual(h.seen.builds, [], stage);
    assert.equal(h.context.dirHandle, null, stage);
    assert.equal(h.run('linkUrl'), null, stage);
  }
});

test('an empty or unreadable fallback folder keeps its own actionable error', async () => {
  for (const empty of [true, false]) {
    const h = harness();
    withFallback(h);
    h.context.scanHandle = async () => { if (empty) return []; throw Error('Folder moved'); };
    await h.run('loadFromLink("Opening", sourceGen)');
    assert.equal(h.seen.states.at(-1)[1], en(empty ? 'app.nosave' : 'app.folder.unread'));
    assert.deepEqual(h.seen.builds, []);
    assert.equal(h.context.attempt, null);
  }
});

test('healthy Link never reads the fallback folder', async () => {
  const h = harness({routes: {health: HEALTH, save: reply(200)}});
  withFallback(h);
  h.context.handles.get = async () => { throw Error('Unexpected folder read'); };
  await h.run('loadFromLink("Opening", sourceGen, false)');
  assert.equal(h.seen.builds.length, 1);
  assert.equal(h.seen.builds[0].linkStamp, 's1');
});

test('a mod with no save or an incompatible connection falls back after its normal diagnosis', async () => {
  for (const health of [{...HEALTH, stamp: '', busy: true}, {...HEALTH, schemaVersion: 99}, reply(503)]) {
    const h = harness({routes: {health}});
    const {local} = withFallback(h);
    await h.run('loadFromLink("Opening", sourceGen)');
    assert.deepEqual(h.seen.builds, [local]);
  }
});

// The note the fallback leaves, as the strip writes it: text, then sub.
const lastNote = (h) => h.seen.notes.at(-1);
const used = en('app.link.fallback.used', {folder: 'Big Ambitions'});
const reconnect = en('app.link.fallback.reconnect');
const mismatch = (h) => en('app.link.mismatch.why', {v: 99, need: h.run('LINK_SCHEMA')});
// A blocked browser's fallback names its own next step: Update now reads the folder.
const blocked = `${en('app.link.blocked')} ${en('app.link.blocked.fallback')}`;

test('plain unavailability falls back with the generic reconnect hint', async () => {
  const h = harness();
  withFallback(h);
  await h.run('loadFromLink("Opening", sourceGen)');
  assert.deepEqual(lastNote(h).slice(0, 3), ['info', used, reconnect]);
});

test('a fallback keeps the diagnosis the player can act on', async (t) => {
  const cases = {
    mismatch: [{...HEALTH, schemaVersion: 99}, (h) => `${mismatch(h)} ${reconnect}`],
    'not the mod': [{...HEALTH, schemaVersion: undefined}, () => `${en('app.link.notmod.why')} ${reconnect}`],
    'never health': [reply(503), () => `${en('app.link.notmod.never')} ${reconnect}`],
    'denied loopback': [HEALTH, () => blocked],
  };
  for (const [name, [health, sub]] of Object.entries(cases)) {
    await t.test(name, async () => {
      const h = harness({routes: {health}});
      // The browser's own answer: this site may not reach the loopback.
      if (name === 'denied loopback') h.context.navigator = {permissions: {query: async () => ({state: 'denied'})}};
      const {local} = withFallback(h);
      await h.run('loadFromLink("Opening", sourceGen)');
      assert.deepEqual(h.seen.builds, [local]);
      assert.equal(h.run('linkUrl'), null);
      assert.deepEqual(lastNote(h).slice(0, 3), ['info', used, sub(h)]);
      if (name === 'denied loopback') assert.deepEqual(h.seen.calls, [], 'a blocked browser sends nothing');
    });
  }
});

test('a blocked browser with no folder to fall back to keeps its Update advice', async () => {
  const h = harness({routes: {health: HEALTH}});
  h.context.navigator = {permissions: {query: async () => ({state: 'denied'})}};
  await h.run('loadFromLink("Opening", sourceGen)');
  assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8322');
  assert.deepEqual(lastNote(h), ['bad', en('app.link.blocked'), en('app.link.blocked.fix'), true]);
});

test('a fallback waiting for folder access still says why Link failed', async () => {
  const h = harness({routes: {health: {...HEALTH, schemaVersion: 99}}});
  withFallback(h, 'prompt');
  await h.run('loadFromLink("Opening", sourceGen)');
  assert.equal(h.seen.states.at(-1)[0], 'remembered');
  assert.deepEqual(lastNote(h), ['info', en('app.link.fallback.permission'), `${mismatch(h)} ${reconnect}`, true]);
});

test('the watcher keeps a version, port or blocked-browser diagnosis when it falls back', async () => {
  for (const [health, sub, denied] of [
    [{...HEALTH, schemaVersion: 99}, (h) => `${en('app.link.port.version', {v: 99, need: h.run('LINK_SCHEMA')})} ${reconnect}`],
    [{...HEALTH, schemaVersion: undefined}, () => `${en('app.link.port.gone')} ${reconnect}`],
    [HEALTH, () => blocked, true],
  ]) {
    const h = harness({routes: {health}});
    if (denied) h.context.navigator = {permissions: {query: async () => ({state: 'denied'})}};
    const {local} = withFallback(h);
    await h.run('checkFolder()');
    assert.deepEqual(h.seen.builds, [local]);
    assert.deepEqual(lastNote(h).slice(0, 3), ['info', used, sub(h)]);
  }
});

test('a folder warning keeps its place and the switch to the local save is still said', async () => {
  const h = harness();
  withFallback(h);
  const moved = 'The character you chose is gone; showing the newest save.';
  h.context.chooseFrom = entries => ({...entries[0], fellBack: moved});
  await h.run('loadFromLink("Opening", sourceGen)');
  assert.equal(h.seen.states.at(-1)[0], 'ok');
  assert.deepEqual(lastNote(h), ['warn', moved, `${used} ${reconnect}`, false]);
});

test('a folder warning with its own advice keeps it ahead of the fallback and the Link diagnosis', async () => {
  const h = harness({routes: {health: {...HEALTH, schemaVersion: 99}}});
  withFallback(h);
  h.context.sayStoreTrouble = () => { h.context.note('warn', 'Browser storage is full.', 'Free some space.'); return true; };
  await h.run('loadFromLink("Opening", sourceGen)');
  assert.deepEqual(lastNote(h), ['warn', 'Browser storage is full.',
    `Free some space. ${used} ${mismatch(h)} ${reconnect}`, false]);
});

test('Link can reconnect after fallback, while an explicit local selection forgets the preference', async () => {
  const h = harness();
  withFallback(h);
  await h.run('loadFromLink("Opening", sourceGen)');
  h.routes.health = HEALTH;
  h.routes.save = reply(200);
  await h.run('linkToGame()');
  assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8322');
  assert.equal(h.context.dirHandle, null);
  assert.equal(h.seen.builds.at(-1).linkStamp, 's1');
  h.run('dropLink()');
  assert.equal(h.remembered.ledger_link, undefined);
  assert.equal(h.run('linkFolderHandle'), null);
});


test('a game that closes during the building-facts download falls back to local saves', async () => {
  const h = harness({routes: {health: {...HEALTH, features: ['building-facts.v1']}, save: reply(200)}});
  const {local} = withFallback(h);
  await h.run('loadFromLink("Opening", sourceGen)');
  assert.deepEqual(h.seen.builds, [local]);
  assert.equal(h.run('linkUrl'), null);
});

test('an accepted refresh whose port stops answering as the mod falls back after its normal wait', async () => {
  const h = harness({routes: {refresh: reply(202, {stamp:'s1'}), health: reply(503)}});
  const {local} = withFallback(h);
  await h.run('refreshFromGame()');
  assert.deepEqual(h.seen.builds, [local]);
});


for (const stage of ['health', 'storage', 'permission']) {
  for (const completed of [false, true]) {
    test(`background fallback yields to Update during ${stage}, completed=${completed}`, async () => {
      const h = harness();
      const {handle} = withFallback(h);
      let release;
      const pending = new Promise(resolve => { release = resolve; });
      if (stage === 'health') h.run('readHealth = () => __pending');
      h.context.__pending = pending;
      if (stage === 'storage') h.context.handles.get = () => pending;
      if (stage === 'permission') handle.queryPermission = () => pending;
      const checking = h.run('checkLink()');
      await new Promise(resolve => setImmediate(resolve));
      // Exercise the real foreground entry point and real attempt bookkeeping.
      let finishRefresh;
      h.run('linkFetch = () => __refresh');
      h.context.__refresh = new Promise(resolve => { finishRefresh = resolve; });
      const updating = h.run('update()');
      if (completed) {
        finishRefresh(reply(409, {reason:'saving'}));
        await updating;
      }
      const states = h.seen.states.length, notes = h.seen.notes.length;
      release(stage === 'health' ? {schemaVersion:99} : stage === 'storage' ? handle : 'granted');
      await checking;
      assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8322');
      assert.equal(h.context.sourceGen, 1);
      assert.deepEqual(h.seen.builds, []);
      assert.equal(h.seen.states.length, states, 'obsolete failure must not change foreground status');
      assert.equal(h.seen.notes.length, notes, 'obsolete failure must not replace foreground diagnostics');
      if (!completed) {
        assert.ok(h.context.attempt, 'Update still owns its attempt');
        finishRefresh(reply(409, {reason:'saving'}));
        await updating;
      }
    });
  }
}

test('an open directory picker takes precedence over fallback and its accepted folder wins', async () => {
  const h = harness();
  withFallback(h);
  const chosen = {name:'Chosen by hand'};
  const file = {name:'chosen.hsg', lastModified:20};
  let accept;
  h.context.window = {showDirectoryPicker: () => new Promise(resolve => { accept = resolve; })};
  h.context.handles.set = async () => {};
  h.context.scanHandle = async handle => { assert.equal(handle, chosen); return [{file, dir:'.'}]; };
  vm.runInContext(between(source, '  async function takeHandle(', '  // What this tab picked once'), h.context);
  const picking = h.run('pickFolder()');
  await h.run('checkLink()');
  assert.equal(h.context.directoryPickPending, 1);
  assert.deepEqual(h.seen.builds, []);
  assert.equal(h.context.sourceGen, 1);
  accept(chosen);
  await picking;
  assert.equal(h.context.directoryPickPending, 0);
  assert.equal(h.context.dirHandle, chosen);
  assert.deepEqual(h.seen.builds, [file]);
  assert.equal(h.remembered.ledger_link, undefined);
});

test('a picker opened during fallback permission checking suppresses the pending fallback', async () => {
  const h = harness();
  const {handle} = withFallback(h);
  let permission, dismiss;
  handle.queryPermission = () => new Promise(resolve => { permission = resolve; });
  h.context.window = {showDirectoryPicker: () => new Promise((resolve, reject) => { dismiss = reject; })};
  vm.runInContext(between(source, '  async function takeHandle(', '  // What this tab picked once'), h.context);
  const checking = h.run('checkLink()');
  await new Promise(resolve => setImmediate(resolve));
  const picking = h.run('pickFolder()');
  permission('granted');
  await checking;
  assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8322');
  assert.deepEqual(h.seen.builds, []);
  dismiss(new Error('Picker cancelled'));
  await picking;
  assert.equal(h.context.directoryPickPending, 0);
  handle.queryPermission = async () => 'granted';
  await h.run('checkLink()');
  assert.equal(h.run('linkUrl'), null, 'a later check may fall back after cancellation');
});

for (const state of ['hidden', 'paused', 'pause-resume']) {
  test(`background fallback stops when ${state} while permission is pending`, async () => {
    const h = harness();
    const {handle} = withFallback(h);
    let release;
    handle.queryPermission = () => new Promise(resolve => { release = resolve; });
    const checking = h.run('checkLink()');
    await new Promise(resolve => setImmediate(resolve));
    if (state === 'hidden') h.context.document.hidden = true;
    else {
      h.context.stopWatch = () => { h.context.watchTimer = null; };
      vm.runInContext(between(source, '  async function toggleWatch()', "  /* --- the game's text"), h.context);
      await h.run('toggleWatch()');
      if (state === 'pause-resume') h.context.watchTimer = 1;
    }
    release('granted');
    await checking;
    assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8322');
    assert.deepEqual(h.seen.builds, []);
  });
}


for (const operation of ['load', 'update']) {
  test(`a foreground ${operation} failure finishes while a folder picker is open, even if cancelled`, async () => {
    const h = harness();
    withFallback(h);
    let rejectLink, dismiss;
    const pending = new Promise((resolve, reject) => { rejectLink = reject; });
    h.context.__foreground = pending;
    if (operation === 'load') h.run('readHealth = () => __foreground');
    else h.run('linkFetch = () => __foreground');
    h.context.window = {showDirectoryPicker: () => new Promise((resolve, reject) => { dismiss = reject; })};
    vm.runInContext(between(source, '  async function takeHandle(', '  // What this tab picked once'), h.context);
    const loading = h.run(operation === 'load' ? 'loadFromLink("Opening", sourceGen)' : 'update()');
    const picking = h.run('pickFolder()');
    rejectLink(new Error('Game closed'));
    await loading;
    assert.equal(h.context.attempt, null, 'foreground failure releases its attempt');
    assert.equal(h.context.strip.tone, 'bad', 'normal recovery diagnostics remain available');
    assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8322');
    assert.deepEqual(h.seen.builds, []);
    dismiss(new Error('Picker cancelled'));
    await picking;
    assert.equal(h.context.directoryPickPending, 0);
    assert.equal(h.context.attempt, null);
    h.context.__foreground = Promise.resolve(reply(409, {reason:'saving'}));
    h.run('linkFetch = () => __foreground');
    await h.run('update()');
    assert.equal(h.context.attempt, null);
    assert.match(h.seen.notes.at(-1)[1], enRe('app.link.refuse.saving'), 'Update can retry after cancellation');
  });
}


test('a version-mismatch fallback cannot replace a newer successful Update', async () => {
  const h = harness({routes:{health:{...HEALTH, schemaVersion:99}}});
  const {handle} = withFallback(h);
  let release;
  handle.queryPermission = () => new Promise(resolve => { release = resolve; });
  const loading = h.run('loadFromLink("Opening", sourceGen)');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.context.attempt, null, 'version diagnostic made Update available');
  h.routes.health = HEALTH;
  h.routes.save = reply(200);
  h.routes.refresh = reply(202, {stamp:''});
  await h.run('update()');
  assert.equal(h.seen.builds.length, 1);
  assert.equal(h.seen.builds[0].linkStamp, HEALTH.stamp);
  const states = h.seen.states.length, notes = h.seen.notes.length;
  release('granted');
  await loading;
  assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8322');
  assert.equal(h.context.sourceGen, 1);
  assert.equal(h.seen.builds.length, 1, 'the successful Link board stays');
  assert.equal(h.seen.states.length, states);
  assert.equal(h.seen.notes.length, notes);
});

test('a link failure while a build of the link holds the attempt leaves the build alone', async () => {
  const h = harness();
  withFallback(h);
  assert.equal(h.run('startAttempt(sourceGen)'), true);
  h.run('attempt.building = true');
  const owner = h.run('attempt');
  await h.run('linkDown(sourceGen, failure(() => "gone"))');
  assert.deepEqual(h.seen.builds, [], 'no folder read');
  assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8322');
  assert.equal(h.run('attempt'), owner, 'the build still holds its attempt');
  assert.equal(h.context.sourceGen, 1);
});

// #359: a read that settles while a build of the same source runs (the game
// gone mid-build) leaves the attempt to the build, which ends it.
test('an attempt with a build in it outlives its reader and ends with the build', () => {
  const h = harness();
  assert.equal(h.run('startAttempt(1)'), true);
  h.run('attempt.building = true');
  h.run('finishAttempt(1)');
  assert.notEqual(h.run('attempt'), null, 'the reader settled, the build still holds the attempt');
  assert.equal(h.run('startAttempt(1) && attempt.building'), true, 'a second read waits on that build');
  h.run('attempt.building = false; finishAttempt(1)');
  assert.equal(h.run('attempt'), null, 'the build ended it');
  assert.equal(h.run('startAttempt(0)'), false, 'an older source takes nothing');
});

// The loopback permission, remembered for the polls and asked afresh for
// everything else. Each query hands back its own status, whose onchange the
// page sets, so a test can say the site settings changed.
function onPublicPage(h, states) {
  const log = {queries: 0, statuses: []};
  h.context.navigator = {permissions: {query: async ({name}) => {
    log.queries++;
    if (!(name in states)) throw new TypeError(`unknown permission ${name}`);
    const status = {state: states[name], onchange: null};
    log.statuses.push(status);
    return status;
  }}};
  h.context.location = {hash: '', hostname: 'bigcopilot.com'};
  return log;
}
const changed = (log) => log.statuses.forEach((s) => s.onchange && s.onchange());

test('a grant is asked for once across the polls, and again after a failed fetch', async () => {
  const h = harness({routes: {health: HEALTH}});
  const log = onPublicPage(h, {'loopback-network': 'granted'});
  for (let i = 0; i < 4; i++) await h.run('linkFetch("/health")');
  assert.equal(log.queries, 2, 'both names asked once, for the first poll only');
  delete h.routes.health;  // nothing answers now
  await h.run('linkFetch("/health").then(() => null, (e) => e)');
  assert.equal(log.queries, 4, 'the failure asks the browser again');
});

test('a grant withdrawn in the site settings is refused before the next poll, unsent', async () => {
  const h = harness({routes: {health: HEALTH}});
  const states = {'loopback-network': 'granted'};
  const log = onPublicPage(h, states);
  await h.run('linkFetch("/health")');
  states['loopback-network'] = 'denied';
  changed(log);
  const calls = h.seen.calls.length;
  const err = await h.run('linkFetch("/health").then(() => null, (e) => e)');
  assert.equal(err.message, en("app.link.blocked"));
  assert.equal(err.unsent, true);
  assert.equal(h.seen.calls.length, calls, 'nothing fetched');
});

test('a grant reset to Ask waits for the player again, with the strip saying so', async () => {
  const h = harness({routes: {health: HEALTH}});
  const states = {'loopback-network': 'granted'};
  const log = onPublicPage(h, states);
  await h.run('linkFetch("/health")');
  states['loopback-network'] = 'prompt';
  changed(log);
  const delays = [];
  h.context.setTimeout = (fn, ms) => { delays.push(ms); return 0; };
  h.run('attempt = {gen: 1}');
  await h.run('linkFetch("/health")');
  assert.deepEqual(delays, [90000]);
  assert.deepEqual(h.seen.states.at(-1), ['busy', en("app.link.allow"), en("app.link.allow.where")]);
});

test('a write asks the browser afresh: withdrawn is unreachable and unsent, reset to Ask waits', async () => {
  for (const now of ['denied', 'prompt']) {
    const h = harness({routes: {health: HEALTH}});
    const states = {'loopback-network': 'granted'};
    onPublicPage(h, states);
    await h.run('linkFetch("/health")');
    // No change event: a browser that sends none still has the write ask.
    states['loopback-network'] = now;
    const delays = [];
    h.context.setTimeout = (fn, ms) => { delays.push(ms); return 0; };
    h.run('approvalMemo["http://127.0.0.1:8322"] = "token"');
    const got = await h.run('gameWrite("uniforms", {sites: []}, {})');
    if (now === 'denied') {
      assert.equal(got.error, 'unreachable', 'not "uncertain": the write never left');
      assert.equal(got.reread, undefined);
      assert.ok(!h.seen.calls.some(([url]) => url.includes('/write/')), 'nothing was sent');
    } else {
      assert.equal(delays[0], 90000, 'the write waits for the player');
    }
  }
});

test('a fetch that fails under a grant the player then withdraws may have left: blocked, not unsent', async () => {
  const h = harness({routes: {health: HEALTH}});
  const states = {'loopback-network': 'granted'};
  onPublicPage(h, states);
  await h.run('linkFetch("/health")');
  h.context.fetch = async () => { states['loopback-network'] = 'denied'; throw new TypeError('Failed to fetch'); };
  const err = await h.run('linkFetch("/health").then(() => null, (e) => e)');
  assert.equal(err.message, en("app.link.blocked"));
  assert.notEqual(err.unsent, true);
});

test('a write under a fresh grant whose fetch fails, the grant then withdrawn, is uncertain and read again', async () => {
  const h = harness({routes: {health: HEALTH}});
  const states = {'loopback-network': 'granted'};
  onPublicPage(h, states);
  h.run('approvalMemo["http://127.0.0.1:8322"] = "token"; linkSpace = "loopback"');
  h.context.fetch = async (url) => {
    h.seen.calls.push([String(url)]);
    if (String(url).includes('/write/')) states['loopback-network'] = 'denied';
    throw new TypeError('Failed to fetch');
  };
  const got = await h.run('gameWrite("uniforms", {sites: []}, {})');
  assert.equal(got.error, 'uncertain', 'the request may have reached the game');
  assert.ok(got.reread && typeof got.reread.then === 'function', 'the board reads the game again');
  assert.equal(h.seen.calls.filter(([url]) => url.includes('/write/')).length, 1, 'the write went out, once');
  await got.reread;
});

test('a write the player allowed at the prompt, then blocked, may have reached the game', async () => {
  for (const [kind, body, path] of [['uniforms', {sites: []}, '/write/uniforms'], ['undo', {kind: 'uniforms'}, '/write/undo']]) {
    const h = harness({routes: {health: HEALTH}});
    const states = {'loopback-network': 'prompt'};
    const log = onPublicPage(h, states);
    h.run('approvalMemo["http://127.0.0.1:8322"] = "token"; linkSpace = "loopback"');
    const sent = [];
    h.context.fetch = async (url) => {
      if (String(url).endsWith(path)) {
        // Allow on the prompt: the request goes out and the game has it.
        log.statuses.forEach((s) => { s.state = 'granted'; });
        changed(log);
        sent.push(String(url));
        // Then Block in the site settings, before the answer is in.
        states['loopback-network'] = 'denied';
        log.statuses.forEach((s) => { s.state = 'denied'; });
        changed(log);
      }
      throw new TypeError('Failed to fetch');
    };
    const got = await h.run(`gameWrite(${JSON.stringify(kind)}, ${JSON.stringify(body)}, {})`);
    assert.equal(sent.length, 1, kind);
    assert.equal(got.error, 'uncertain', kind);
    assert.ok(got.reread && typeof got.reread.then === 'function', kind);
    await got.reread;
  }
});

test('a refused write of a new link address does not leave the old one remembered', async () => {
  const h = harness({routes: {health: HEALTH, save: reply(200, null, {'X-Game-Link-Stamp': 's1'})}});
  h.remembered.ledger_link = 'http://127.0.0.1:8323';
  h.context.stored.set = () => false;
  await h.run('linkToGame()');
  assert.equal('ledger_link' in h.remembered, false, 'the old address is gone');
  assert.equal(h.run('linkUrl'), 'http://127.0.0.1:8322', 'the link is the source for this visit');
});

test('a write held at the prompt and blocked there is unreachable, unsent', async () => {
  const h = harness({routes: {health: HEALTH}});
  const states = {'loopback-network': 'prompt'};
  onPublicPage(h, states);
  h.run('approvalMemo["http://127.0.0.1:8322"] = "token"');
  h.context.fetch = async () => { states['loopback-network'] = 'denied'; throw new TypeError('Failed to fetch'); };
  const got = await h.run('gameWrite("uniforms", {sites: []}, {})');
  assert.equal(got.error, 'unreachable');
  assert.equal(got.reread, undefined);
});

test('only the first status per permission name is listened to, however often it is asked', async () => {
  const h = harness({routes: {health: HEALTH, refresh: reply(202, {accepted: true, stamp: 's1'})}});
  const log = onPublicPage(h, {'loopback-network': 'granted', 'local-network-access': 'prompt'});
  for (let i = 0; i < 5; i++) await h.run('linkFetch("/refresh", {method: "POST"})');
  assert.equal(log.queries, 10, 'every write-like call asks afresh');
  const listened = log.statuses.filter((s) => typeof s.onchange === 'function');
  assert.deepEqual(listened, [log.statuses[0], log.statuses[1]], 'one per name, the first');
});

test('a change during the ask leaves nothing remembered', async () => {
  const h = harness({routes: {health: HEALTH}});
  const states = {'loopback-network': 'granted'};
  const log = onPublicPage(h, states);
  await h.run('linkFetch("/health")');  // listens to the first status
  const query = h.context.navigator.permissions.query;
  h.context.navigator.permissions.query = async (q) => {
    const status = await query(q);
    changed(log);  // the site settings change while the answer is read
    return status;
  };
  await h.run('loopbackPermission(true)');
  h.context.navigator.permissions.query = query;
  const before = log.queries;
  await h.run('linkFetch("/health")');
  assert.ok(log.queries > before, 'the poll asks again: the overtaken grant was not kept');
});


// A /health that was already in flight when the source changed must not
// publish. The address is not the source: the same port, chosen again, is a
// new one, and a file or a folder is not a link.
for (const spec of [
  {name: 'a file', kind: 'file'},
  {name: 'a folder', kind: 'folder'},
  {name: 'another link address', kind: 'link', url: 'http://127.0.0.1:8323'},
  {name: 'the same link address again', kind: 'link', url: 'http://127.0.0.1:8322'},
]) {
  test(`a health reply already in flight does not publish after a switch to ${spec.name}`, async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const stale = {...HEALTH, schemaVersion: 4, build: 3682, runningBuild: 3682};
    const fresh = {...HEALTH, schemaVersion: 5, build: 3670, runningBuild: 3690};
    const h = harness();
    const published = [];
    h.context.handlers = {runningBuild() { published.push(h.run('linkRunning')); }};
    h.context.pickedOnce = (kind) => { h.context.snapshot = kind || ''; };
    h.context.fetch = async (url) => {
      h.seen.calls.push(String(url));
      const body = h.seen.calls.length === 1 ? await gate : fresh;
      return reply(200, body);
    };
    const reading = h.run('readHealth()');
    for (let i = 0; i < 30 && h.seen.calls.length < 1; i++) await Promise.resolve();
    assert.equal(h.seen.calls.length, 1, 'the first health read has left');
    if (spec.kind === 'file') h.run('becomeSource("file", {name: "Co.hsg"})');
    else if (spec.kind === 'folder') h.run('becomeSource("folder", {handle: {name: "Saves", kind: "directory"}})');
    else h.run(`becomeSource("link", {url: ${JSON.stringify(spec.url)}})`);
    let current = null;
    if (spec.kind === 'link') current = await h.run('readHealth()');
    release(stale);
    const late = await reading;
    assert.equal(late, h.run('NOT_READY'), 'the late reply is not a health answer of this source');
    assert.equal(h.run('linkSchema'), 5, 'the late reply does not change the schema');
    if (spec.kind === 'link') {
      assert.equal(current.runningBuild, 3690);
      assert.equal(h.run('reportContext().runningBuild()'), 3690);
      assert.equal(h.run('reportContext().source'), 'link');
      assert.deepEqual(published, [3690]);
    } else {
      if (spec.kind === 'file') h.run('lastFile = {name: "Co.hsg"}');
      assert.equal(h.run('reportContext().runningBuild()'), null);
      assert.equal(h.run('linkUrl'), null);
      assert.equal(h.run('reportContext().source'), spec.kind);
      assert.deepEqual(published, []);
    }
  });
}

// The watcher and Update share one source, so the generation does not tell
// their /health replies apart. An older reply must not replace the running
// build a later read already published. Update does not wait for the watcher.
for (const [label, staleRunning] of [
  ['an older zero', 0],
  ['an omitted field', undefined],
  ['an older positive build', 3670],
]) {
  test(`an older health reply does not replace a newer running build (${label})`, async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const fresh = {...HEALTH, schemaVersion: 5, stamp: 's1', runningBuild: 3682};
    const stale = {...HEALTH, schemaVersion: 5, stamp: 's1'};
    if (staleRunning === undefined) delete stale.runningBuild;
    else stale.runningBuild = staleRunning;
    const h = harness();
    const published = [];
    let healths = 0, refreshes = 0;
    h.context.handlers = {runningBuild() { published.push(h.run('linkRunning')); }};
    h.context.fetch = async (url) => {
      const path = new URL(url).pathname;
      if (path === '/health') {
        healths++;
        return reply(200, healths === 1 ? await gate : fresh);
      }
      if (path === '/refresh') {
        refreshes++;
        return refreshes === 1 ? reply(429, {error: 'throttled', retryAfter: 1}) : reply(409, {reason: 'saving'});
      }
      throw new TypeError('Failed to fetch');
    };
    h.run(`linkUrl = "http://127.0.0.1:8322"; lastLinkStamp = "s1"; strip.tone = "ok"; linkHealth = ${JSON.stringify(HEALTH)}`);
    const watching = h.run('checkFolder()');
    for (let i = 0; i < 20 && healths < 1; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(healths, 1, 'the watcher is held on /health');
    const updating = h.run('update()');
    for (let i = 0; i < 20 && published.length < 1; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(published, [3682], 'Update published the running build before the watcher replied');
    release(stale);
    await watching;
    await updating;
    assert.equal(refreshes, 2, 'the throttled refresh was asked again and refused');
    assert.match(h.seen.notes.at(-1)[1], enRe('app.link.refuse.saving'));
    assert.deepEqual(published, [3682]);
    assert.equal(h.run('reportContext().runningBuild()'), 3682);
  });
}

test('schema 5 and every supported older game link can still load saves', async () => {
  for (const schemaVersion of [1, 2, 3, 4, 5]) {
    const h = harness({routes: {health: {...HEALTH, schemaVersion}, save: reply(200)}});
    await h.run('loadFromLink("Reading the game")');
    assert.equal(h.seen.builds.length, 1, `schema ${schemaVersion}`);
  }
});
