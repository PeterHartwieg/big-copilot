// Shared setup for tests/game_link_write*.test.cjs: the built page served
// beside the real mock (tools/game_link_mock.py) over a synthetic company from
// tests/es3_fixture.py, a stub worker, the browser, and the helpers the write
// tests use. Each suite that requires it starts its own mock and browser. Not
// a test file itself: the leading underscore keeps it out of the
// tests/*.test.cjs glob.
const {before, beforeEach, after} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe, enText: textEn, textRe} = require('./_i18n.cjs');
const {spawn, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');
const H = require('./_page.cjs');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
const PYTHON = process.env.PYTHON || 'python';
// The approval the game gave this page's origin, as the tests hand it to the
// mock; the page keeps it in localStorage with the mod address it came from.
const TOKEN = 'approvedTokenForThePageAAAAAAAAAAAAAAAAAAAA';
const APPROVAL = 'ledger_link_approval';
const ORIGIN = 'http://localhost:9321';
const GIFTS = 'ba:street_secondavenue#10';
const BARE = 'ba:street_fifthavenue#4';
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml'};

let browser, mock, mockUrl, payload, dir;
/* The board's Weekly imports are Python's import facts (supplyFact), sized
   with the chain's margin. These tests are about writing the Set to figure,
   whatever it is, so each depot line the payload imports is laid in as a
   covered import fact: nothing to change until a test types a figure. */
function withImportFacts(text) {
  const d = JSON.parse(text);
  const facts = d.supply.facts = d.supply.facts || {};
  Object.entries(d.supply.factories.depots || {}).forEach(([s, lines]) => Object.entries(lines).forEach(([slug, line]) => {
    const use = line.weekly || 0;
    (facts[s] = facts[s] || {})[slug] = {st: 'covered', why: null, lvl: 'ok', role: 'depot', cad: 'weekly', use,
      need: use, have: use, setTo: null, parts: {lines: 0, sites: use, route: 0}, imp: true};
  }));
  return JSON.stringify(d);
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'game-link-write-'));
  const save = path.join(dir, 'link.hsg'), data = path.join(dir, 'payload.json');
  const made = spawnSync(PYTHON, [path.join(root, 'tests', 'es3_fixture.py'), save, data], {cwd: root});
  assert.equal(made.status, 0, made.stderr?.toString());
  payload = withImportFacts(fs.readFileSync(data, 'utf8'));
  mock = spawn(PYTHON, ['-u', path.join(root, 'tools', 'game_link_mock.py'), save, '--port', '0',
    '--character', 'default', '--company', 'Link Co', '--day', '34', '--hour', '14'], {cwd: root});
  mockUrl = await new Promise((resolve, reject) => {
    let out = '';
    mock.stdout.on('data', (chunk) => {
      out += chunk;
      const m = /at (http:\/\/127\.0\.0\.1:\d+)\//.exec(out);
      if (m) resolve(m[1]);
    });
    mock.stderr.on('data', (chunk) => { out += chunk; });
    mock.on('exit', (code) => reject(new Error(`the mock exited (${code}): ${out}`)));
  });
  // The page is served by the test on a made-up origin, which Chrome places
  // in no address space it would prompt for; the permission prompt itself is
  // tests/game_link.test.cjs's.
  browser = await H.launch({args: ['--disable-features=LocalNetworkAccessChecks']});
});
after(async () => {
  await browser?.close();
  mock?.kill();
  fs.rmSync(dir, {recursive: true, force: true});
});

async function configure(body) {
  const res = await fetch(mockUrl + '/debug/config', {method: 'POST', body: JSON.stringify(body),
    headers: {'Content-Type': 'application/json'}});
  return res.json();
}
const applied = async () => (await (await fetch(mockUrl + '/debug/writes')).json()).writes;

// Every scenario starts from the mock as it was launched, whatever the one
// before it switched on (rejectTokens, a refused write, a slow player) or
// left behind when it failed half way: one failure cannot cascade.
beforeEach(async () => {
  const state = await configure({reset: true, refuseWrite: null, busyWrites: 0,
    writes: ['uniforms', 'imports', 'schedule'], pair: 'approve', pairDelay: 1.0, pairCooldowns: [10, 30, 120],
    rejectTokens: false, tokens: {}, importTerms: {}});
  assert.equal(state.applied, 0, 'the mock starts each scenario with nothing applied');
});

// The page, linked to the mock. `writes` is what /health lists (null: the key
// is left out, as a 0.1.0 mod does); `approved`: the game approved this
// browser before, so its token is kept; `stored` is an approval kept as it
// is, for the tests of a stale one; `data` is the payload every build answers,
// the fixture's by default. The mock's player answers a new request after a
// quarter of a second.
async function linked(t, {writes = ['uniforms', 'imports', 'schedule'], approved = false, stored = null, link = true,
                          data = payload, viewport = {width: 1280, height: 1000}, clock = false} = {}) {
  await configure({reset: true, refuseWrite: null, busyWrites: 0, writes, pairDelay: 0.25, pairCooldowns: [0],
                   tokens: approved ? {[TOKEN]: ORIGIN} : {}});
  const code = approved ? {link: mockUrl, token: TOKEN} : stored;
  const context = await browser.newContext({viewport, reducedMotion: 'reduce'});
  // A route handler still waiting on route.fetch() when the scenario ends
  // would reject into the next test; drop every handler before closing.
  t.after(async () => {
    for (const p of context.pages()) await p.unrouteAll({behavior: 'ignoreErrors'});
    await context.unrouteAll({behavior: 'ignoreErrors'});
    await context.close();
  });
  await context.addInitScript(({data, code}) => {
    window.builds = 0;
    // What the fake worker builds: the test's payload, or what a test says
    // the game holds after a write (window.buildData).
    window.baseData = data;
    window.buildData = null;
    window.Worker = class {
      postMessage(msg) {
        if (msg.kind !== 'build') return;
        window.builds++;
        // window.holdBuilds: the build is left unanswered, as a slow one is.
        if (window.holdBuilds) return;
        queueMicrotask(() => this.onmessage({data: {id: msg.id, kind: 'built', history: '{}', data: window.buildData || data}}));
      }
      terminate() {}
    };
    if (code) localStorage.setItem('ledger_link_approval', JSON.stringify({[code.link]: code.token}));
  }, {data, code});
  await H.abortExternal(context);
  await context.route(ORIGIN + '/**', (route) => {
    const file = path.join(web, decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || 'index.html');
    if (!file.startsWith(web) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({status: 404, body: ''});
    return route.fulfill({contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
  });
  const page = await context.newPage();
  if (clock) await page.clock.install();
  const errors = H.collectErrors(page);
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await page.goto(`${ORIGIN}/#link=${mockUrl}`);
  if (link) {
    await page.locator('#linkBtn').click();
    await page.waitForFunction(current => document.body.classList.contains('has-board')
      && document.getElementById('srcStatus').textContent === current, en('app.state.current'));
  }
  return page;
}

const button = (page, key, label = en('sp.gw.uni.button')) =>
  page.locator(`#alerts [data-gw="uniforms"][data-gw-sites*='${JSON.stringify(key).slice(1, -1)}']`, {hasText: label}).first();
// A held answer let go once its page is gone (the scenario ended first, and
// its context closed) has nowhere to go; that is no failure of the next one.
const passOn = (route, res) => route.fulfill({response: res}).catch((err) => {
  if (!/disposed|closed/i.test(err.message)) throw err;
});
// Holds the board's next read of the save until the test lets it go.
async function holdSave(page) {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(`${mockUrl}/save`, async (route) => {
    const res = await route.fetch();
    await held;
    await passOn(route, res);
  });
  return release;
}
// Holds the board's refresh requests until the test lets them go. The mock takes a
// request 3 s after the last refresh, as the mod from 0.4.0 does, and answers at
// once, so a reread could replace what the dialog says before the test has seen it.
async function holdRefresh(page) {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const handler = async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue().catch((err) => {
      if (!/disposed|closed/i.test(err.message)) throw err;
    });
  };
  await page.route(`${mockUrl}/refresh`, handler);
  return async () => { release(); await page.unroute(`${mockUrl}/refresh`, handler); };
}
const dialog = (page) => page.locator('dialog.gw-dlg');
// The game's approval is asked inside the write's own dialog, while it waits.
const pair = (page) => page.locator('dialog.gw-dlg[data-phase="approval"]');
const WAITING = en('nav.dlg.say.waiting');
// The game's answer to the dry run, drawn: the dialog offers Apply.
const ready = (page, timeout) => page.locator('dialog.gw-dlg[data-phase="ready"]').waitFor(timeout ? {timeout} : undefined);
// Apply names what it does and counts it.
// The approval kept for the mock's address: one entry per mod address.
const kept = (page) => page.evaluate(({key, link}) => (JSON.parse(localStorage.getItem(key) || '{}') || {})[link] || null,
  {key: APPROVAL, link: mockUrl});

/* --- the gate after an undo: Set again once a board has been built since -- */
const until = async (test, ms) => {
  const end = Date.now() + ms;
  while (!(await test()) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50));
};
const setAgain = (page) => dialog(page).locator('[data-gw-b="again"]');
const setAgainOn = (page, timeout) => page.waitForFunction(() => {
  const b = document.querySelector('dialog.gw-dlg .gw-foot [data-gw-b="again"]');
  return b && !b.disabled;
}, null, timeout ? {timeout} : undefined);
// The watcher's check, now rather than in thirty seconds.
const watchNow = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const mockStamp = async () => (await (await fetch(mockUrl + '/health')).json()).stamp;

// The game loads another of the character's saves: /health and /save both
// name another company and a stamp of their own. Returns the way back.
async function otherCompany(page) {
  const health = async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({response: res, json: Object.assign(body, {company: 'Other Co', stamp: `${body.stamp}-other`})});
  };
  const save = async (route) => {
    const headers = Object.assign({}, route.request().headers());
    delete headers['if-none-match'];
    const res = await route.fetch({headers});
    const stamp = `${res.headers()['x-game-link-stamp']}-other`;
    await route.fulfill({response: res, headers: Object.assign({}, res.headers(), {'x-game-link-stamp': stamp, etag: `"${stamp}"`})});
  };
  await page.route(`${mockUrl}/health`, health);
  await page.route(`${mockUrl}/save`, save);
  return async () => { await page.unroute(`${mockUrl}/health`, health); await page.unroute(`${mockUrl}/save`, save); };
}
const NOT_LINKED = en('nav.dlg.undone.unlinked');
// Apply the uniform, undo it, and wait for Set again.
async function undoneAndOpen(page) {
  await button(page, GIFTS).click();
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  await dialog(page).locator('[data-gw-b="undo"]').click();
  await dialog(page).getByText(en("sp.gw.uni.undone", {"n":1})).waitFor();
  await setAgainOn(page, 20000);
}

/* --- imports -------------------------------------------------------------- */
const DEPOT_ADDRESS = {street: 'ba:street_pier', number: 9};
async function supply(page) {
  await page.evaluate(() => { showPage('supply'); showSub('supply', 'imports'); sbWhich = 'all'; sbMode.imports = 'all'; sbSelOff = true; sbSel = null;
    drawSupplyStrip(); drawImportsView(); wireAll(); });
  return page.locator('#secImports');
}
const importRow = (page, text) => page.locator('#secImports tr[data-slug]', {hasText: text});
async function setTo(page, text, value) {
  const box = importRow(page, text).locator('input[data-imp]');
  await box.fill(String(value));
  await box.press('Enter');
  await page.waitForFunction(({text, value}) => [...document.querySelectorAll('#secImports tr[data-slug]')]
    .some((tr) => tr.textContent.includes(text) && tr.classList.contains('imp-changed')
      && tr.querySelector('input[data-imp]').value === String(value)), {text, value});
}
const applyImports = (page) => page.locator('#secImports > .gw-acts [data-gw="imports"]');

/* The fixture's company with a week of rounds leaving the depot, built and
   extracted by Python: the one payload here whose facts nobody laid in. */
function drawnPayload() {
  const file = path.join(dir, 'drawn.hsg');
  const code = [
    'import json, sys',
    'sys.path.insert(0, "tests")',
    'import es3_fixture as f, ba_dashboard',
    'from ba_save import Names, load_save',
    'c = f.link_company()',
    // The depot's draw comes from the sources, not the delivery log: HART.
    // Gifts sells 800 paper bags a day and the depot tops it up each morning.
    'gifts = next(b for b in c["BuildingRegistrations"] if b["BusinessName"] == "HART. Gifts")',
    'gifts["orderHistory"] = [{"dayNumber": d, "totalCustomers": 400, "itemSales": [',
    '    {"itemName": "ba:itemname_paperbag", "amountSold": 800, "totalPrice": 800.0}]} for d in range(27, 34)]',
    'c["logisticsManagerPlans"] = [{"targetAddress": f.address("ba:street_pier", 9), "destinations": [',
    '    {"deliveryTargetAddress": f.address("ba:street_secondavenue", 10),',
    '     "stockTargets": [{"itemName": "ba:itemname_paperbag", "targetAmount": 2000}]}]}]',
    `open(${JSON.stringify(file)}, "wb").write(f.encode(c))`,
    `sys.stdout.write(json.dumps(ba_dashboard.extract(load_save(${JSON.stringify(file)}), Names({}), None)))`,
  ].join('\n');
  const out = spawnSync(PYTHON, ['-c', code], {cwd: root, maxBuffer: 32 * 1024 * 1024});
  assert.equal(out.status, 0, out.stderr?.toString());
  return JSON.parse(out.stdout.toString());
}

// The foot, every button in it, is on screen.
const footOnScreen = (page) => dialog(page).evaluate((d) => [...d.querySelectorAll('.gw-foot, .gw-foot button')]
  .every((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5; }));
/* --- the schedule --------------------------------------------------------- */
const ANA = 'AAAAemployeeAAAAAAAAAAAA', BEN = 'BBBBemployeeBBBBBBBBBBBB', DEE = 'DDDDemployeeDDDDDDDDDDDD';
const REGISTER = 'REGISTERaaaaaaaaaaaaaa==ue', CLEAN = 'CLEANcccccccccccccccccc==ue';
const CORNER = 'ba:street_broadway#2';
const GIFTS_ADDRESS = {street: 'ba:street_secondavenue', number: 10};
/* The fixture's shops have no measured week, so the plans are laid in here:
   at the Gifts shop Ben on the register on Monday, Dee from the bench on
   Tuesday and a cleaning hire; its full cover Ana and Ben on the register all
   Monday. At the Corner, Cy on Wednesday. */
function withRosters({hq = false} = {}) {
  const d = JSON.parse(payload);
  const gifts = d.staffing.find((r) => r.key === GIFTS);
  Object.assign(gifts, {
    stations: [{id: CLEAN, name: 'Cleaning station', skill: 'ba:skill_cleaning', rate: null},
               {id: REGISTER, name: 'Register', skill: 'ba:skill_customerservice', rate: 20}],
    people: [{id: ANA, name: 'Ana Silva'}, {id: BEN, name: 'Ben Ode'}, {id: DEE, name: 'Dee Lund'}],
    roles: [{skill: 'ba:skill_customerservice', label: 'Customer service', stations: [1]}],
    shifts: [{d: 1, s: 1, f: 8, t: 20, p: 1}, {d: 2, s: 1, f: 8, t: 20, p: 2}, {d: 2, s: 0, f: 8, t: 20, p: null, k: 'clean'}],
    bench: [{p: 2, skill: 'ba:skill_customerservice', skills: ['ba:skill_customerservice']}],
    addPeople: {assign: [{id: DEE, name: 'Dee Lund', skill: 'ba:skill_customerservice', role: 'Customer service', p: 2}],
                hire: [{skill: 'ba:skill_cleaning', role: 'Cleaning', people: 1}], people: 2, hoursUncovered: 24},
    headcount: {},
    current: {shifts: 2, fragments: 0, coverFragments: 0, cleaning: 1, security: 0,
              list: [{d: 0, s: 0, f: 0, t: 12, p: 0, k: 'clean'}, {d: 1, s: 1, f: 8, t: 20, p: 0}]},
  });
  Object.assign(gifts.fullCover, {shifts: [{d: 1, s: 1, f: 0, t: 12, p: 0}, {d: 1, s: 1, f: 12, t: 24, p: 1}],
    bench: [], headcount: {}, openNow: false, addPeople: {assign: [], hire: [], people: 0, hoursUncovered: 0}});
  const corner = d.staffing.find((r) => r.key === CORNER);
  Object.assign(corner, {shifts: [{d: 3, s: 1, f: 8, t: 20, p: 0}], headcount: {}});
  if (hq) d.businesses.find((b) => b.key === GIFTS).typeSlug = 'ba:businesstype_headquarters';
  return JSON.stringify(d);
}
// The board's own read after a schedule write (and, unless `undo` is false,
// its undo): from then on the fake worker builds the payload with the shop's
// print as the game answered it.
async function followPrints(page, key, {undo = true} = {}) {
  const follow = async (route) => {
    const req = route.request();
    const sent = JSON.parse(req.postData() || '{}');
    if (req.method() !== 'POST' || sent.dryRun || (sent.kind && sent.kind !== 'schedule')) return route.fallback();
    const res = await route.fetch();
    const body = await res.json();
    if (res.status() === 200 && body.after && body.after.print) {
      await page.evaluate(({key, print, undo, opened}) => {
        const d = JSON.parse(window.buildData || window.baseData);
        d.businesses.find((b) => b.key === key).shiftPrint = print;
        // The opening hours a full-cover write opens, and its undo closes again.
        const full = (d.staffing.find((r) => r.key === key) || {}).fullCover;
        if (full && (undo || opened)) full.openNow = !undo;
        window.buildData = JSON.stringify(d);
      }, {key, print: body.after.print, undo: !!body.undo, opened: !!body.openedHours});
    }
    await route.fulfill({response: res, json: body});
  };
  await page.route(`${mockUrl}/write/schedule`, follow);
  if (undo) await page.route(`${mockUrl}/write/undo`, follow);
}
const dryRunOf = (page, kind) => page.waitForRequest((req) => req.url().endsWith(`/write/${kind}`) && req.method() === 'POST'
  && JSON.parse(req.postData() || '{}').dryRun === true);
async function roster(page, key, plan = 'demand') {
  /* The one planner is Staffing › Schedules' (a business's page summarises it). */
  await page.evaluate(({key, plan}) => { spPlanWrite(key, plan); openRoute('staffing/schedules', {pick: key}); }, {key, plan});
  return page.locator('#sp-roster');
}

/* --- hire (POST /write/hire, mod 0.3.0) ------------------------------------
   The page's generic write path (LEDGER_SOURCE.write) against the mock's hire.
   The Staff page (issue #89) builds these bodies from its plan; until it lands
   the tests send them by hand. hireBody() and HIRE are the hooks its tests
   can reuse: the fixture's candidates (tests/es3_fixture.py) and addresses. */
const HIRE = {
  ida: 'IIIIcandidateIIIIIIIIIII', oskar: 'OOOOcandidateOOOOOOOOOOO', ben: 'BBBBemployeeBBBBBBBBBBBB',
  ana: 'AAAAemployeeAAAAAAAAAAAA', cy: 'CCCCemployeeCCCCCCCCCCCC',
  gifts: {street: 'ba:street_secondavenue', number: 10}, corner: {street: 'ba:street_broadway', number: 2},
  giftsRegister: 'REGISTERaaaaaaaaaaaaaa==ue', cornerRegister: 'REGISTERaaaaaaaaaaaaaa==ay',
};
const WRITES_WITH_HIRE = ['uniforms', 'imports', 'schedule', 'hire'];
// The shift print of a business as the payload has it (businesses[].shiftPrint).
const printOf = (key) => JSON.parse(payload).businesses.find((b) => b.key === key).shiftPrint;

// Ida and Oskar hired into Gifts with a day each, Ben moved from Gifts (no
// hours there) to Corner with a day, both weeks written.
function hireBody() {
  const at = (who, post, d) => ({d, shifts: [{f: 8, t: 20, employeeId: who, itemInstanceId: post}]});
  return {
    sites: [{address: HIRE.gifts, expect: printOf(GIFTS), openAllHours: false,
             days: [at(HIRE.ana, HIRE.giftsRegister, 1), at(HIRE.ida, HIRE.giftsRegister, 3), at(HIRE.oskar, HIRE.giftsRegister, 4)]},
            {address: HIRE.corner, expect: printOf('ba:street_broadway#2'), openAllHours: false,
             days: [at(HIRE.cy, HIRE.cornerRegister, 2), at(HIRE.ben, HIRE.cornerRegister, 3)]}],
    hires: [{candidateId: HIRE.ida, address: HIRE.gifts, expect: {wage: 26.5}, seenHoursLeft: 71},
            {candidateId: HIRE.oskar, address: HIRE.gifts, expect: {wage: 22.0}, seenHoursLeft: 5}],
    moves: [{employeeId: HIRE.ben, from: HIRE.gifts, to: HIRE.corner}],
  };
}
const sourceWrite = (page, kind, body, dryRun) =>
  page.evaluate(({kind, body, dryRun}) => window.LEDGER_SOURCE.write(kind, body, {dryRun}), {kind, body, dryRun});

/* --- rent (POST /write/rent, mod 0.6.0) ------------------------------------
   The Real estate page's writes go through the same generic path
   (LEDGER_SOURCE.write("rent", {items}) and write("undo", {kind: "rent"})). The
   page sends the save it planned from as the same-save guard, as uniforms and
   marketing do; the fixture owns no building, so every item is not_owned. */
const RENT_ITEM = {address: {street: 'ba:street_secondavenue', number: 10}, pricePerSqm: 3.73,
                   expect: {pricePerSqm: 3.74, pendingPricePerSqm: 0}};

module.exports = {assert, en, enRe, textEn, textRe, spawn, spawnSync, fs, os, path, chromium, root, web, PYTHON, TOKEN, APPROVAL, ORIGIN, GIFTS, BARE, TYPES, withImportFacts, configure, applied, linked, button, passOn, holdSave, holdRefresh, dialog, pair, WAITING, ready, kept, until, setAgain, setAgainOn, watchNow, mockStamp, otherCompany, NOT_LINKED, undoneAndOpen, DEPOT_ADDRESS, supply, importRow, setTo, applyImports, drawnPayload, footOnScreen, ANA, BEN, DEE, REGISTER, CLEAN, CORNER, GIFTS_ADDRESS, withRosters, followPrints, dryRunOf, roster, HIRE, WRITES_WITH_HIRE, printOf, hireBody, sourceWrite, RENT_ITEM,
  get browser(){ return browser; },
  get mock(){ return mock; },
  get mockUrl(){ return mockUrl; },
  get payload(){ return payload; },
  get dir(){ return dir; },
};
