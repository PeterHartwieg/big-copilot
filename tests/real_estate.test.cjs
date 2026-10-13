// Real estate on the built page (mockup/real-estate): My buildings and Buy a
// building, the two findings and their landings, and the rent write through
// the game link. The company is tests/save_fixtures.py's (four owned
// buildings and a villa), served by tools/game_link_mock.py, with a stub in
// place of the Pyodide worker that answers every build with its payload; a
// second payload is the same company on the last day before tax day. Install
// Playwright and its Chromium browser to run; NODE_PATH may point at an
// existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
const {spawn, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
const PYTHON = process.env.PYTHON || 'python';
const TOKEN = 'approvedTokenForThePageAAAAAAAAAAAAAAAAAAAA';
const ORIGIN = 'http://localhost:9327';
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml'};
const PENDING = 'ba:street_tenthavenue#1';   // its best price already waits: never offered again
const OVER = 'ba:street_eighthstreet#5';     // 1.2 x market rent, emptying: the largest gain

let browser, mock, mockUrl, dir, payload, eve, pend;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-estate-'));
  const made = spawnSync(PYTHON, ['-c', `
import json, os, sys
sys.path.insert(0, ${JSON.stringify(root)})
import ba_dashboard as d
from ba_save import Names, load_save
from tests import save_fixtures as F
from tests.test_real_estate import eve_build
out = sys.argv[1]
save = os.path.join(out, "estate.hsg")
F.write_data_save(save)
names = Names(F.data_names())
with open(os.path.join(out, "payload.json"), "w", encoding="utf-8") as fh:
    json.dump(d.materialize_all(d.build_core(load_save(save), names)), fh)
with open(os.path.join(out, "eve.json"), "w", encoding="utf-8") as fh:
    json.dump(d.materialize_all(eve_build()), fh)
# (The save holds prices as floats; the payload and the page show them rounded to the cent.)
# Two pending prices: the best price at 1 Harbor Street, whose market rent rounds
# to that same cent, and 24 Twelfth Street's own market rent, at which it never fills.
from tests.es3_fixture import address, encode
tree = F.data_company()
twelfth = d._market_rent(d.load_buildings()[("ba:street_twelfthstreet", 24)])
tree["realEstate"] = tree["realEstate"] + [
    {"address": address("ba:street_harborstreet", 1), "purchaseDay": 20, "purchasePrice": 5000000.0, "totalSqm": 1000,
     "occupancy": 40.0, "pricePerSqm": 6.5, "pendingPricePerSqm": 5.64, "daysUntilUpdatingPricePerSqm": 7},
    {"address": address("ba:street_twelfthstreet", 24), "purchaseDay": 20, "purchasePrice": 5000000.0, "totalSqm": 1000,
     "occupancy": 97.0, "pricePerSqm": 3.5, "pendingPricePerSqm": twelfth, "daysUntilUpdatingPricePerSqm": 4}]
pend = os.path.join(out, "pend.hsg")
with open(pend, "wb") as fh:
    fh.write(encode(tree))
with open(os.path.join(out, "pend.json"), "w", encoding="utf-8") as fh:
    json.dump(d.materialize_all(d.build_core(load_save(pend), names)), fh)
`, dir], {cwd: root, env: {...process.env, PYTHONIOENCODING: 'utf-8'}});
  assert.equal(made.status, 0, made.stderr?.toString());
  payload = fs.readFileSync(path.join(dir, 'payload.json'), 'utf8');
  eve = fs.readFileSync(path.join(dir, 'eve.json'), 'utf8');
  pend = fs.readFileSync(path.join(dir, 'pend.json'), 'utf8');
  const meta = JSON.parse(payload).meta;
  mock = spawn(PYTHON, ['-u', path.join(root, 'tools', 'game_link_mock.py'), path.join(dir, 'estate.hsg'), '--port', '0',
    '--day', String(meta.day), '--hour', '14'], {cwd: root});
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
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL,
    args: ['--disable-features=LocalNetworkAccessChecks']});
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
const ALL = ['uniforms', 'imports', 'schedule', 'hire', 'marketing', 'rent'];

/* The page, linked to the mock (approved before), on `data`; `writes` is
   what /health lists. */
async function linked(t, {writes = ALL, data = payload} = {}) {
  await configure({reset: true, refuseWrite: null, busyWrites: 0, writes, pairDelay: 0.25, pairCooldowns: [0],
    tokens: {[TOKEN]: ORIGIN}});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
  t.after(async () => {
    for (const p of context.pages()) await p.unrouteAll({behavior: 'ignoreErrors'});
    await context.unrouteAll({behavior: 'ignoreErrors'});
    await context.close();
  });
  await context.addInitScript(({data, link, token}) => {
    window.Worker = class {
      postMessage(msg) {
        if (msg.kind !== 'build') return;
        queueMicrotask(() => this.onmessage({data: {id: msg.id, kind: 'built', history: '{}', data}}));
      }
      terminate() {}
    };
    localStorage.setItem('ledger_link_approval', JSON.stringify({[link]: token}));
  }, {data, link: mockUrl, token: TOKEN});
  await context.route('https://**', (route) => route.abort());
  await context.route(ORIGIN + '/**', (route) => {
    const file = path.join(web, decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || 'index.html');
    if (!file.startsWith(web) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({status: 404, body: ''});
    return route.fulfill({contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await page.goto(`${ORIGIN}/#link=${mockUrl}`);
  await page.locator('#linkBtn').click();
  await page.waitForFunction(current => document.body.classList.contains('has-board')
    && document.getElementById('srcStatus').textContent === current, en('app.state.current'));
  return page;
}
const go = async (page, route) => { await page.evaluate(r => openRoute(r), route); await page.waitForTimeout(250); };
const owned = data => JSON.parse(data).realEstate.owned;

test('Real estate is the sixth area: two views, the count of buildings off their best price', async (t) => {
  const page = await linked(t);
  assert.deepEqual(await page.evaluate(() => AREAS.map(a => a.id)), ['overview', 'businesses', 'supply', 'staffing', 'expansion', 'estate']);
  await go(page, 'estate/buildings');
  assert.deepEqual(await page.locator('#localNav a[data-route]').evaluateAll(as => as.map(a => a.dataset.route)), ['estate/buildings', 'estate/buy']);
  const flagged = owned(payload).filter(o => o.flag).length;
  assert.ok(flagged > 0);
  assert.equal(await page.locator('#localNav a[data-route="estate/buildings"] small').textContent(), String(flagged));
  // Buy a building counts only on the last day before tax day.
  assert.equal(await page.locator('#localNav a[data-route="estate/buy"] small').count(), 0);
});

test('My buildings: a row a building, flagged first by gain, the villa a line, a row opens in place', async (t) => {
  const page = await linked(t);
  await go(page, 'estate/buildings');
  const rows = owned(payload);
  assert.deepEqual(await page.locator('#secEstate tr.re-row').evaluateAll(trs => trs.map(tr => tr.dataset.reRow)), rows.map(o => o.key));
  assert.equal(rows[0].key, OVER);
  const villas = JSON.parse(payload).realEstate.villas;
  assert.match(await page.locator('#secEstate tfoot').innerText(), enRe('re.villas', {n: villas}));
  // Over market: the share it is over, in amber, beside the price.
  assert.match(await page.locator(`#secEstate tr[data-re-row="${OVER}"]`).innerText(), enRe('re.over', {p: /\d+/}));
  // A pending best price: old → new with its days, the gain set, no Set button.
  const pend = page.locator(`#secEstate tr[data-re-row="${PENDING}"]`);
  assert.match(await pend.innerText(), enRe('re.pending.in', {n: /\d+/}));
  assert.equal(await pend.locator('[data-gw="rent"]').count(), 0);
  // The row opens: 61 days of occupancy and one facts line; again, it closes.
  await page.locator(`#secEstate tr[data-re-row="${OVER}"] td.bd b`).click();
  const det = page.locator(`#secEstate tr[data-re-of="${OVER}"]`);
  await det.locator('svg.re-spark').waitFor();
  assert.match(await det.innerText(), enRe('re.fact.market', {m: /[\d.]+/}, {text: true}));
  assert.equal(await det.locator('.re-spark .pj').count(), 1, 'a flagged building shows the wait and the fill');
  await page.locator(`#secEstate tr[data-re-row="${OVER}"] td.bd b`).click();
  assert.equal(await det.isVisible(), false);
  // A vanilla save says nothing of the multiplier; a modded one names it, quietly.
  assert.equal(await page.locator('#viewCtl .re-mod').count(), 0);
  await page.evaluate(() => { D.realEstate.mult = {value: 5, source: 'measured', buildings: 3}; drawEstate(); });
  assert.equal(await page.locator('#viewCtl .re-mod b').textContent(), en('re.mult', {x: '5'}));
});

test('without the rent capability the button stays, off, and says which mod to install', async (t) => {
  const page = await linked(t, {writes: ALL.filter(k => k !== 'rent')});
  await go(page, 'estate/buildings');
  const btn = page.locator('#viewCtl [data-gw="rent"]');
  assert.equal(await btn.getAttribute('aria-disabled'), 'true');
  assert.equal(await btn.getAttribute('data-tip'), en('nav.dlg.mod.rent'));
});

test('Set best prices: the dry run lists every change, Apply sets them, Undo puts them back', async (t) => {
  const page = await linked(t);
  await go(page, 'estate/buildings');
  const flagged = owned(payload).filter(o => o.flag);
  await page.locator('#viewCtl [data-gw="rent"]').click();
  const dlg = page.locator('dialog.gw-dlg');
  await page.locator('dialog.gw-dlg[data-phase="ready"]').waitFor();
  assert.equal(await dlg.locator('h2').textContent(), en('re.gw.title.many', {n: flagged.length}));
  assert.equal(await dlg.locator('.gw-shop').count(), flagged.length);
  assert.match(await dlg.locator('.gw-verdict').innerText(), enRe('re.gw.will', {n: flagged.length}, {text: true}));
  // Once full is each building's own full income at the best price, filling included.
  assert.equal(await dlg.locator('.gw-tally > div').nth(1).locator('.gw-big').textContent(),
    await page.evaluate(keys => fmt(D.realEstate.owned.filter(o => keys.includes(o.key)).reduce((s, o) => s + o.full, 0)), flagged.map(o => o.key)));
  await dlg.locator('[data-gw-b="apply"]').click();
  await page.locator('dialog.gw-dlg[data-phase="done"]').waitFor();
  const writes = (await (await fetch(mockUrl + '/debug/writes')).json()).writes.filter(w => w.kind === 'rent');
  assert.equal(writes.length, 1);
  const items = writes[0].body.items;
  assert.deepEqual(items.map(i => `${i.address.street}#${i.address.number}`).sort(), flagged.map(o => o.key).sort());
  // Each asks the best price and expects the price and pending price the board read.
  items.forEach(i => {
    const o = flagged.find(x => x.key === `${i.address.street}#${i.address.number}`);
    assert.equal(i.pricePerSqm, o.best);
    assert.deepEqual(i.expect, {pricePerSqm: o.price, pendingPricePerSqm: o.pendingRaw});
  });
  assert.match(await dlg.locator('.gw-foot').innerText(), enRe('re.gw.undohint', {n: flagged.length}));
  await dlg.locator('.gw-foot button', {hasText: en('nav.dlg.undo.button')}).click();
  await page.locator('dialog.gw-dlg[data-phase="undone"]').waitFor();
  const undo = (await (await fetch(mockUrl + '/debug/writes')).json()).writes.filter(w => w.kind === 'undo' || (w.body || {}).kind === 'rent');
  assert.ok(undo.length >= 1, 'the undo reached the game');
});

test("one row's Set writes that building alone", async (t) => {
  const page = await linked(t);
  await go(page, 'estate/buildings');
  await page.locator(`#secEstate tr[data-re-row="${OVER}"] [data-gw="rent"]`).click();
  const dlg = page.locator('dialog.gw-dlg');
  await page.locator('dialog.gw-dlg[data-phase="ready"]').waitFor();
  assert.equal(await dlg.locator('h2').textContent(), en('re.gw.title'));
  assert.match(await dlg.locator('.gw-where').innerText(), /8th Street|Eighth Street/);
  assert.equal(await dlg.locator('[data-gw-b="apply"]').textContent(), en('re.gw.apply1'));
  await dlg.locator('[data-gw-b="apply"]').click();
  await page.locator('dialog.gw-dlg[data-phase="done"]').waitFor();
  const writes = (await (await fetch(mockUrl + '/debug/writes')).json()).writes.filter(w => w.kind === 'rent');
  assert.deepEqual(writes.map(w => w.body.items.length), [1]);
});

test('Buy a building: cheapest first, Payback by its switch or its head, the rented-in first there', async (t) => {
  const page = await linked(t, {data: eve});
  await go(page, 'estate/buy');
  const buy = JSON.parse(eve).realEstate.buy;
  const prices = await page.locator('#secBuy tbody tr').evaluateAll(trs => trs.length);
  assert.equal(prices, Math.min(buy.length, 10));
  const cash = JSON.parse(eve).realEstate.tax.cash;
  // A building past the cash is dimmed, never hidden, and says by how much.
  const dim = page.locator('#secBuy tr.re-dim').first();
  if (buy.some(x => x.price > cash)) assert.match(await dim.getAttribute('data-tip'), enRe('re.dim.tip', {w: /.+/}));
  await page.locator('#viewCtl [data-re-sort="payback"]').click();
  assert.equal(await page.locator('#secBuy th[data-re-sort="payback"]').getAttribute('class'), 'on');
  const order = await page.evaluate(() => reBuySorted(D.realEstate.buy).map(x => [x.saves > 0, x.payback]));
  const firstOther = order.findIndex(([saves]) => !saves);
  assert.ok(order.slice(firstOther).every(([saves]) => !saves), 'the buildings you rent in lead the Payback sort');
  // The column head switches back.
  await page.locator('#secBuy th[data-re-sort="price"]').click();
  assert.equal(await page.locator('#viewCtl [data-re-sort="price"]').getAttribute('class'), 'on');
  // Show all lists the rest.
  await page.evaluate(() => { RE_FIRST.buy = 2; reAll.buy = false; drawEstateBuy(); });
  assert.equal(await page.locator('#secBuy tbody tr:not(.re-hide)').count(), 2);
  await page.locator('#secBuy [data-re-all="buy"]').click();
  assert.equal(await page.locator('#secBuy tbody tr:not(.re-hide)').count(), buy.length);
});

test('the last day before tax day: the panel, the count, the warning and its landing', async (t) => {
  const page = await linked(t, {data: eve});
  const tax = JSON.parse(eve).realEstate.tax;
  assert.ok(tax.pick.length > 0 && tax.left === 1);
  await go(page, 'overview');
  const row = page.locator('#alerts .find[data-kind="taxeve"]');
  assert.ok(await row.evaluate(f => f.classList.contains('watch')), 'a warning');
  assert.match(await row.locator('.what').innerText(), enRe('re.find.tax', {n: tax.pick.length}));
  assert.match(await row.locator('.site').innerText(), enRe('nav.view.estate.buy'));
  await row.locator('.ov-act').click();
  await page.locator('#reTax.re-litbox').waitFor();
  assert.match(await page.locator('#arrive').innerText(), enRe('re.arrive.tax', {n: tax.pick.length}));
  assert.equal(await page.locator('#reTax .re-cd.hot').count(), 1);
  assert.equal(await page.locator('#reTax .re-pick:not(.sum)').count(), tax.pick.length);
  assert.equal(await page.locator('#localNav a[data-route="estate/buy"] small').textContent(), '1');
});

test('the rent finding: one opportunity, its picture and Details, landing on every flagged row lit', async (t) => {
  const page = await linked(t);
  const flagged = owned(payload).filter(o => o.flag);
  await go(page, 'overview');
  // The fixture's warnings fill the first five places: the rest unfold.
  await page.evaluate(() => { ovShowAll = true; drawAlerts(); });
  const row = page.locator('#alerts .find[data-kind="rentprice"]');
  assert.ok(await row.evaluate(f => f.classList.contains('opp')), 'an opportunity');
  assert.equal(await row.locator('.ov-cmp').count(), 1);
  const ev = JSON.parse(payload).alerts.find(a => a.group === 'rentprice').ev;
  assert.equal(await row.locator('.ov-cmp .n').nth(1).textContent(), await page.evaluate(v => fmt(v), ev.full));
  await row.locator('.ov-det').click();
  assert.equal(await row.locator('.ov-x .ov-plan:not(.quiet)').count(), Math.min(3, flagged.length));
  await row.locator('.ov-act').click();
  await page.locator('#secEstate tr.re-lit').first().waitFor();
  assert.deepEqual(await page.locator('#secEstate tr.re-row.re-lit').evaluateAll(trs => trs.map(tr => tr.dataset.reRow)), flagged.map(o => o.key));
  assert.match(await page.locator('#arrive').innerText(), enRe('re.arrive.rent', {n: flagged.length}));
  // The light goes out with the arrival: the view on its own again.
  await page.evaluate(() => { routeArrival = null; drawEstate(); });
  assert.equal(await page.locator('#secEstate tr.re-lit').count(), 0);
});

test("a pending price fills where the game says it is under market, and only there", async (t) => {
  const page = await linked(t, {data: pend});
  await go(page, 'estate/buildings');
  const rows = owned(pend);
  const harbor = rows.find(o => o.key === 'ba:street_harborstreet#1');
  const twelfth = rows.find(o => o.key === 'ba:street_twelfthstreet#24');
  // The board's recommended price, pending, where the rounded market rent is that same cent.
  assert.equal(harbor.pending, harbor.best);
  assert.equal(Math.round(harbor.market * 100) / 100, harbor.best);
  assert.equal(harbor.under, true);
  assert.ok(harbor.fill > 0);
  // A pending price at market rent: not flagged, not full, and it never fills.
  assert.deepEqual([twelfth.under, twelfth.flag, twelfth.risk, twelfth.fill > 0], [false, false, false, true]);
  for (const o of [harbor, twelfth]) await page.locator(`#secEstate tr[data-re-row="${o.key}"] td.bd b`).click();
  const h = page.locator(`#secEstate tr[data-re-of="${harbor.key}"]`), w = page.locator(`#secEstate tr[data-re-of="${twelfth.key}"]`);
  await h.locator('svg.re-spark').waitFor();
  assert.equal(await h.locator('.re-spark .pj').count(), 1);
  assert.match(await h.innerText(), enRe('re.fact.fills', {n: harbor.fill}));
  assert.equal(await w.locator('.re-spark .pj').count(), 0);
  assert.doesNotMatch(await w.innerText(), enRe('re.fact.fills', {n: twelfth.fill}));
});
