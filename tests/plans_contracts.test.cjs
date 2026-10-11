// Supply › Plans & contracts (drawRolesView() in template/board.js): every
// Logistics Manager's plan and every Purchasing Agent's contract, from
// supply.roles (_supply_roles() in ba_dashboard.py), in the game's order. Its
// own flags are its sidebar count; a finding another view owns shows as that
// kind's chip and lands there; the ways in (Goods flow, the heads of Imports,
// a site's Feeds) land here with the row lit and opened.
// Runs on the synthetic R8 fixture (tests/fixtures/r8_supply.json) with a
// hand-built supply.roles over its sites.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {en} = require('./_i18n.cjs');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const FIXTURE = path.join(root, 'tests', 'fixtures', 'r8_supply.json');

let browser, html;
before(async () => {
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(root, 'web/index.html'), 'utf8')
    : (() => {
      const r = spawnSync(process.env.PYTHON || 'python', ['-c', 'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
        {cwd: root, maxBuffer: 16 * 1024 * 1024});
      assert.equal(r.status, 0, r.stderr?.toString());
      return r.stdout.toString();
    })();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

const target = (slug, amount) => ({slug, item: slug[0].toUpperCase() + slug.slice(1), amount});
/* The R8 company's plans and contracts: the hub's plan with more stops than
   its one truck reaches, a stop with nothing set, the factory's plan with an
   export, a manager with no plan, a warehouse nobody picks up from; a running
   contract, one with no agent, an agent with no contract. */
function roles(){
  const tenStops = Array.from({length: 10}, (_, k) => k === 9
    ? {s: 5, key: 'dist#6', kind: 'wh', name: '[CD] Cake Distr.', targets: []}
    : {s: k % 2 ? 3 : 2, key: k % 2 ? 'shop#4' : 'shop#3', kind: 'shop', name: k % 2 ? '[MH] Cake Shop Midtown' : '[DT] Cake Shop Downtown',
       targets: [target('soda', 300), target('bags', 900), target('cake', 100)]});
  return {
    managers: [
      {plan: 'P1', who: 'Rosa Duvall', id: 'E1', skill: 85, s: 0, key: 'hub#1', factory: false,
       vehicles: [{type: 'ba:vehicletype_freighttruckt1', name: 'Freight Truck T1', driver: 'Kai Rasmus', reach: 4},
                  {type: 'ba:vehicletype_deliverytruck', name: 'Vord Courier D500', driver: null, reach: 0}],
       reach: 8, dests: tenStops},
      {plan: 'P2', who: 'Femi Hartley', id: 'E2', skill: 100, s: 1, key: 'factory#2', factory: true,
       vehicles: [{type: 'ba:vehicletype_mersaididash', name: 'Mersaidi Dash', driver: 'Ivo Brenner', reach: 2}], reach: 4,
       dests: [{s: 0, key: 'hub#1', kind: 'wh', name: '[IH] Import Hub', targets: [target('cake', 5000)]},
               {s: null, key: 'ba:street_pier#3', kind: 'pier', name: 'United Ocean Import', pier: '3 Pier', targets: [target('cake', 2000)]}]},
      // A plan nobody runs, its one stop a factory's inputs.
      {plan: 'P3', who: null, id: null, skill: null, s: 5, key: 'dist#6', where: '6 Dist', factory: false, vehicles: [], reach: 0,
       dests: [{s: 1, key: 'factory#2', kind: 'fac', name: '[FB] Bakery Factory', targets: [target('flour', 500)]}]},
      {who: 'Yara Holm', id: 'E3', skill: 100, idle: true},
    ],
    agents: [
      {contract: 'C1', who: 'Mara Okafor', id: 'E4', skill: 80, importer: 'Jet Cargo Imports', importerKey: 'ba:importertypename_jetcargo',
       pier: '1 Pier', pierKey: 'pier', smart: true, repeating: true, urgent: false, active: true, next: 337,
       products: [{slug: 'sugar', item: 'Sugar', s: 0, key: 'hub#1', amount: 5000, last: 4200},
                  {slug: 'flour', item: 'Flour', s: null, key: null, amount: 100, last: 0},
                  {slug: 'flour', item: 'Flour', s: 1, key: 'factory#2', amount: 900, last: 800}]},
      {contract: 'C2', who: null, id: null, skill: null, importer: 'Seaside Internationals', importerKey: 'ba:importertypename_seaside',
       pier: '2 Pier', pierKey: 'ba:street_pier#2', smart: false, repeating: true, urgent: false, active: true, next: 337,
       products: [{slug: 'soda', item: 'Soda', s: 0, key: 'hub#1', amount: 800, last: 800}]},
      {contract: 'C3', who: 'Ugo Marr', id: 'E6', skill: 100, importer: 'Bluestone Imports', importerKey: 'ba:importertypename_bluestone',
       pier: '4 Pier', pierKey: 'ba:street_pier#4', smart: false, repeating: false, urgent: false, active: true, next: 337,
       products: [{slug: 'soda', item: 'Soda', s: 0, key: 'hub#1', amount: 12, last: 0}]},
      {who: 'Kofi Brandauer', id: 'E5', skill: 100, idle: true},
    ],
  };
}

async function board(data){
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('https://**', route => route.abort());
  await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
  await page.goto('http://board.test/');
  await seed(page, data);
  page.errors = errors;
  return page;
}
/* The R8 fixture is a supply payload, not a whole board: the Supply views
   are drawn, as tests/import_routes.test.cjs draws them. */
const seed = (page, data) => page.evaluate(data => {
  takeData(data);
  document.body.classList.add('has-board');
  document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
  document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
  page = 'supply'; route = 'supply/roles'; sub.supply = 'roles';
  drawSupplyStrip(); drawRolesView(); drawImportsView(); drawFlowView(); paintLocal(); wireAll();
}, data);
const fixture = () => { const d = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')); d.supply.roles = roles(); return d; };
/* The fixture with one Deliveries finding at the Cake Shop Downtown, which is
   five stops of Rosa's plan. */
function withShopFinding(){
  const d = fixture();
  d.alerts.push({level: 'warn', site: '[DT] Cake Shop Downtown', siteKey: 'shop#3', group: 'outruns', text: 'Soda outsells its top-up',
    worth: null, unit: '', id: 'outruns-soda', always: false, ev: {slug: 'soda'}});
  d.supply.roles.agents[0].products.push({slug: 'sugar', item: 'Sugar', s: 0, key: 'hub#1', amount: 100, last: 0});
  return d;
}
const rowText = (page, id) => page.$eval(`#secRoles tr[data-sr-row="${id}"]`, el => el.innerText.replace(/\s+/g, ' ').trim());

test('Plans & contracts is second under Supply, and its count is its own flags', async () => {
  const page = await board(fixture());
  try {
    const nav = await page.$$eval('#localNav a[data-route]', as => as.map(a => [a.dataset.route, a.querySelector('small')?.textContent || '']));
    assert.equal(nav[1][0], 'supply/roles');
    // Rosa: 10 stops over 8, a stop with no products; the plan with no
    // manager, over its reach of 0; Yara with no plan; the contract with no
    // agent; one product with no warehouse; Kofi with no contract: 8.
    assert.equal(nav[1][1], '8');
    assert.equal(await page.evaluate(() => srCount()), 8);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('rows keep the game order, split by where a plan picks up; each says what holds it back', async () => {
  const page = await board(fixture());
  try {
    const order = await page.$$eval('#secRoles tr[data-sr-row], #secRoles tr.sr-part', trs => trs.map(t => t.dataset.srRow || `part:${t.innerText.trim()}`));
    assert.deepEqual(order, [`part:${'FROM WAREHOUSES · DAILY 02:00'}`, 'm:P1', 'm:P3', 'part:FROM FACTORIES · DAILY 08:00', 'm:P2', 'part:NO PLAN', 'i:E3',
      'a:C1', 'a:C2', 'a:C3', 'i:E5']);
    const rosa = await rowText(page, 'm:P1');
    assert.match(rosa, /Rosa Duvall skill 85%/);
    assert.match(rosa, /10 stops · vehicles reach 8/);
    assert.doesNotMatch(rosa, /^.*\bvehicles reach 8\b.*vehicles reach 8/, 'over the reach, the chip says it once');
    assert.match(rosa, /Stop with no products/);
    assert.match(await rowText(page, 'm:P2'), /vehicles reach 4/);
    assert.match(await rowText(page, 'm:P2'), /United Ocean Import export/);
    // A plan whose manager is missing.
    assert.match(await rowText(page, 'm:P3'), new RegExp(en('sb.roles.flag.notAssigned')));
    assert.match(await rowText(page, 'm:P3'), /1 stop · vehicles reach 0/);
    assert.match(await rowText(page, 'i:E3'), /No plan/);
    const mara = await rowText(page, 'a:C1');
    assert.match(mara, /skill 80% · −20% on prices/);
    assert.match(mara, /Jet Cargo Imports/);
    assert.match(mara, /Day 337 · Mon/);
    assert.match(mara, /1 with no designated warehouse/);
    const none = await rowText(page, 'a:C2');
    assert.match(none, /Purchasing Agent not assigned/);
    assert.doesNotMatch(none, /Day 337/, 'with no agent the game cancels the order: no delivery is coming');
    assert.match(await rowText(page, 'i:E5'), /No contract/);
    // The importer's address is only a tip.
    assert.equal(await page.$eval('#secRoles tr[data-sr-row="a:C1"] td.site .nm', el => el.dataset.tip), '1 Pier');
    assert.doesNotMatch(mara, /1 Pier/);
  } finally { await page.close(); }
});

test('a plan opens to its stops, 8 then Show all; a stop to its targets in the game order', async () => {
  const page = await board(fixture());
  try {
    await page.click('#secRoles tr[data-sr-row="m:P1"]');
    const det = '#secRoles tr[data-sr-of="m:P1"]';
    assert.equal(await page.$eval(det, el => el.classList.contains('sr-hide')), false);
    assert.match(await page.$eval(`${det} .sr-veh`, el => el.innerText), /No driver/);
    const visible = () => page.$$eval(`${det} tr.sr-dr`, trs => trs.filter(t => getComputedStyle(t).display !== 'none').length);
    assert.equal(await visible(), 8);
    await page.click(`${det} [data-sr-all]`);
    assert.equal(await visible(), 10);
    await page.click(`${det} tr[data-sr-stop="m:P1:0"]`);
    const heads = await page.$$eval(`${det} tr[data-sr-of="m:P1:0"] thead th`, ths => ths.map(t => t.textContent));
    assert.equal(heads[1], 'Minimum stock amount', "a warehouse's plan sets minimum stock amounts");
    const items = await page.$$eval(`${det} tr[data-sr-of="m:P1:0"] tbody td:first-child`, tds => tds.map(t => t.textContent));
    assert.deepEqual(items, ['Soda', 'Bags', 'Cake'], 'the game order, not sorted by amount');
    // A factory's plan delivers up to, its pier stop with that figure alone.
    await page.click('#secRoles tr[data-sr-row="m:P2"]');
    await page.click('#secRoles tr[data-sr-stop="m:P2:1"]');
    assert.deepEqual(await page.$$eval('#secRoles tr[data-sr-of="m:P2:1"] thead th', ths => ths.map(t => t.textContent)), ['Product', 'Deliver up to']);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('a finding of another view shows on its stop and lands on its row there', async () => {
  const data = fixture();
  // The fixture's paused sugar import at the hub is Imports' finding.
  const page = await board(data);
  try {
    const chip = '#secRoles tr[data-sr-row="a:C1"] td.st [data-sr-land*="imports"]';
    assert.equal(await page.locator(chip).count(), 1);
    await page.click(chip);
    assert.equal(await page.evaluate(() => route), 'supply/imports');
    assert.match(await page.$eval('#secImports .sb-crumb', el => el.textContent), /from Plans & contracts/);
  } finally { await page.close(); }
});

test("Goods flow names who delivers the followed site; a line lands on that row, lit and opened, with the crumb", async () => {
  const page = await board(fixture());
  try {
    await page.evaluate(() => { flowPickId = 'hub#1'; openRoute('supply/flow'); });
    const cards = await page.$eval('#sbFlowPanel', el => el.innerText);
    assert.match(cards, /Delivered by/);
    assert.match(cards, /Mara Okafor · Jet Cargo Imports, 1 product/);
    assert.match(cards, /Femi Hartley · \[FB\] Bakery Factory, stop 1 of 2|Femi Hartley · Bakery Factory, stop 1 of 2/);
    assert.match(cards, /Sends/);
    await page.click('#sbFlowPanel [data-sr-go*="m:P2"]');
    assert.equal(await page.evaluate(() => route), 'supply/roles');
    assert.equal(await page.$eval('#secRoles tr[data-sr-row="m:P2"]', el => el.classList.contains('sr-opened')), true);
    assert.equal(await page.$eval('#secRoles tr[data-sr-stop="m:P2:0"]', el => el.classList.contains('sr-lit')), true);
    assert.match(await page.$eval('#secRoles .sb-crumb', el => el.textContent), /from Goods flow/);
    // The crumb puts the light out.
    await page.click('#secRoles [data-sb-crumb]');
    assert.equal(await page.locator('#secRoles .sr-lit').count(), 0);
  } finally { await page.close(); }
});

test("a factory stop carries Production's findings; a row with findings of two views links each", async () => {
  const page = await board(fixture());
  try {
    // The fixture's flour at the Bakery Factory is a Factory inputs finding (Production's).
    assert.match(await rowText(page, 'm:P3'), /1 in Production/);
    await page.click('#secRoles tr[data-sr-row="m:P3"]');
    assert.match(await page.$eval('#secRoles tr[data-sr-stop="m:P3:0"]', el => el.innerText), new RegExp(en('nav.kind.feed.label')));
    // Mara's contract: the paused sugar (Imports') and the factory's flour (Production's).
    const chips = await page.$$eval('#secRoles tr[data-sr-row="a:C1"] td.st [data-sr-land]', as => as.map(a => [a.textContent, JSON.parse(a.dataset.srLand)[0]]));
    assert.deepEqual(chips, [['1 in Imports', 'imports'], ['1 in Production', 'production']]);
  } finally { await page.close(); }
});

test('a finding at a site that is several stops of one plan, or several lines of one contract, counts once', async () => {
  const page = await board(withShopFinding());
  try {
    assert.match(await rowText(page, 'm:P1'), /1 in Deliveries/);
    assert.doesNotMatch(await rowText(page, 'm:P1'), /[2-9] in Deliveries/);
    // Mara's contract lists the hub's sugar twice; its paused import is one finding.
    const chips = await page.$$eval('#secRoles tr[data-sr-row="a:C1"] td.st [data-sr-land]', as => as.map(a => a.textContent));
    assert.deepEqual(chips, ['1 in Imports', '1 in Production']);
  } finally { await page.close(); }
});

test('a stop past 12 targets takes two columns in the game order, a Status column in each when a finding needs one', async () => {
  const d = withShopFinding();
  const many = ['soda', ...Array.from({length: 13}, (_, k) => `item${String(k).padStart(2, '0')}`)];
  d.supply.roles.managers[0].dests[0].targets = many.map((slug, k) => target(slug, 1000 - k));
  const page = await board(d);
  try {
    await page.click('#secRoles tr[data-sr-row="m:P1"]');
    await page.click('#secRoles tr[data-sr-stop="m:P1:0"]');
    const cols = '#secRoles tr[data-sr-of="m:P1:0"] .sr-cols';
    assert.equal(await page.locator(`${cols} table.sr-tt`).count(), 2);
    const items = await page.$$eval(`${cols} table.sr-tt tbody td:first-child`, tds => tds.map(t => t.textContent));
    assert.deepEqual(items, many.map(x => x[0].toUpperCase() + x.slice(1)), 'down the first column, on down the second');
    const heads = await page.$$eval(`${cols} table.sr-tt`, ts => ts.map(t => [...t.querySelectorAll('thead th')].map(h => h.textContent).pop()));
    assert.deepEqual(heads, ['Status', 'Status']);
    assert.match(await page.$eval(`${cols} table.sr-tt tbody tr`, el => el.innerText), new RegExp(en('nav.kind.outruns.label')));
    // Both columns sit inside the opened stop, none spilling past it.
    const [box, ...tables] = await page.$$eval(`${cols}, ${cols} table.sr-tt`, els => els.map(e => e.getBoundingClientRect().right));
    tables.forEach(r => assert.ok(r <= box + 1, `a column ends inside: ${r} <= ${box}`));
  } finally { await page.close(); }
});

test('a company with one plan sees it opened, until the reader closes it', async () => {
  const d = fixture();
  d.supply.roles.managers = d.supply.roles.managers.filter(m => m.plan === 'P2' || m.idle);
  const page = await board(d);
  try {
    assert.equal(await page.$eval('#secRoles tr[data-sr-row="m:P2"]', el => el.classList.contains('sr-opened')), true);
    assert.equal(await page.$eval('#secRoles tr[data-sr-of="m:P2"]', el => el.classList.contains('sr-hide')), false);
    await page.click('#secRoles tr[data-sr-row="m:P2"]');
    await page.evaluate(() => drawRolesView());
    assert.equal(await page.$eval('#secRoles tr[data-sr-row="m:P2"]', el => el.classList.contains('sr-opened')), false, 'a redraw keeps it closed');
    // So does a reload: the history entry keeps what the reader opened and closed.
    await page.reload();
    await seed(page, d);
    await page.evaluate(() => openRoute('supply/roles', {historyMode: 'pop'}));
    assert.equal(await page.$eval('#secRoles tr[data-sr-row="m:P2"]', el => el.classList.contains('sr-opened')), false, 'a reload keeps it closed');
    // Another company's board forgets it.
    await page.evaluate(() => { sbForget(); drawRolesView(); });
    assert.equal(await page.$eval('#secRoles tr[data-sr-row="m:P2"]', el => el.classList.contains('sr-opened')), true);
  } finally { await page.close(); }
  // Two plans: none opens by itself.
  const two = await board(fixture());
  try {
    assert.equal(await two.locator('#secRoles tr.sr-row.sr-opened').count(), 0);
  } finally { await two.close(); }
});

test('a one-time contract buys once; Goods flow is offered only for a site it draws', async () => {
  const page = await board(fixture());
  try {
    await page.click('#secRoles tr[data-sr-row="a:C3"]');
    const det = '#secRoles tr[data-sr-of="a:C3"]';
    assert.match(await rowText(page, 'a:C3'), /One-time delivery/);
    assert.deepEqual(await page.$$eval(`${det} thead th`, ths => ths.map(t => t.textContent)).then(h => h[2]), '# to buy');
    assert.match(await page.$eval(`${det} tbody tr`, el => el.innerText), /12 once/);
    assert.doesNotMatch(await page.$eval(`${det} tbody tr`, el => el.innerText), /a week/);
    // 4 Pier is no node of the picture: no way to follow it. The hub is.
    assert.equal(await page.locator(`${det} [data-sb-toflow]`).count(), 0);
    await page.click('#secRoles tr[data-sr-row="m:P2"]');
    assert.equal(await page.locator('#secRoles tr[data-sr-stop="m:P2:1"] [data-sb-toflow]').count(), 0, 'an export pier is no node');
    assert.equal(await page.locator('#secRoles tr[data-sr-stop="m:P2:0"] [data-sb-toflow]').count(), 1);
  } finally { await page.close(); }
});

test('a reload of a landing on a stop past the first 8 shows the whole list, the stop opened and lit', async () => {
  const page = await board(fixture());
  try {
    // Land through the way in, then reload: the history entry gives it back.
    await page.evaluate(() => srLand('m:P1', 9, 'from Goods flow'));
    assert.deepEqual(await page.evaluate(() => history.state.nxSb.lit), {row: 'm:P1', stop: 9});
    await page.reload();
    await seed(page, fixture());
    await page.evaluate(() => openRoute('supply/roles', {historyMode: 'pop'}));
    const stop = '#secRoles tr[data-sr-stop="m:P1:9"]';
    assert.deepEqual(await page.$eval(stop, el => [el.classList.contains('sr-hide'), el.classList.contains('sr-lit'), el.classList.contains('sr-dopen')]),
      [false, true, true]);
    assert.equal(await page.locator('#secRoles tr[data-sr-of="m:P1"] [data-sr-all]').count(), 0, 'no Show all left');
  } finally { await page.close(); }
});

/* A whole board: tests/test_supply_roles.py's synthetic company, extracted
   by Python, for the ways in that sit on full pages (a site's page, the
   heads of Imports and Deliveries). */
function extracted(){
  const r = spawnSync(process.env.PYTHON || 'python', ['-c', [
    'import json, sys, tempfile, pathlib',
    'import ba_dashboard as d',
    'from ba_save import Names, load_save',
    'from tests.es3_fixture import encode',
    'from tests import save_fixtures as fx',
    'from tests.test_supply_roles import supply_company',
    'p = pathlib.Path(tempfile.mkdtemp(), "s.hsg"); p.write_bytes(encode(supply_company()))',
    'sys.stdout.buffer.write(json.dumps(d.extract(load_save(str(p)), Names(fx.data_names()), None)).encode("utf-8"))',
  ].join('\n')], {cwd: root, maxBuffer: 64 * 1024 * 1024});
  assert.equal(r.status, 0, r.stderr?.toString());
  return JSON.parse(r.stdout.toString());
}
async function wholeBoard(data){
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('https://**', route => route.abort());
  await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
  await page.goto('http://board.test/');
  await page.evaluate(data => { takeData(data); document.body.classList.add('has-board'); renderAll(); }, data);
  page.errors = errors;
  return page;
}
const GIFTS = 'ba:street_broadwaystreet#19', HUB = 'ba:street_eighthavenue#4', SECOND = 'ba:street_pier#9';

test("a shop's page names the plans that fill it; a link lands on its stop, lit, with the crumb back", async () => {
  const page = await wholeBoard(extracted());
  try {
    await page.evaluate(key => openSite(key), GIFTS);
    const head = '#sp-shelves .sechead .aside';
    // HART. Gifts is the first stop of Wendy West's warehouse plan.
    assert.match(await page.$eval(head, el => el.textContent), /Wendy West's plan · 02:00 ›/);
    await page.click(`${head} [data-sr-go]`);
    assert.equal(await page.evaluate(() => route), 'supply/roles');
    assert.equal(await page.$eval('#secRoles tr[data-sr-stop="m:z-warehouse-plan:0"]', el => el.classList.contains('sr-lit')), true);
    assert.equal(await page.$eval('#secRoles tr[data-sr-of="m:z-warehouse-plan:0"]', el => el.classList.contains('sr-hide')), false, 'the stop is opened');
    assert.match(await page.$eval('#secRoles .sb-crumb', el => el.textContent), new RegExp(en('sb.crumb.fromSite')));
    // The plan with no pick-up site sits under No plan; no raw site key reaches the screen.
    assert.match(await page.$eval('#secRoles tr[data-sr-row="m:m-null-plan"]', el => el.innerText), /Nell Null/);
    assert.doesNotMatch(await page.$eval('#secRoles', el => el.innerText), /ba:street_/);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test("a factory's page names the plan that picks up from it, landing on that row with the crumb back", async () => {
  const page = await wholeBoard(extracted());
  try {
    await page.evaluate(() => openSite('ba:street_eighthavenue#8'));
    const head = '#sp-lines .sechead .aside';
    assert.match(await page.$eval(head, el => el.textContent), /Faye Fields's plan · 08:00 ›/);
    await page.click(`${head} [data-sr-go]`);
    assert.equal(await page.evaluate(() => route), 'supply/roles');
    assert.deepEqual(await page.$eval('#secRoles tr[data-sr-row="m:a-factory-plan"]', el => [el.classList.contains('sr-lit'), el.classList.contains('sr-opened')]), [true, true]);
    assert.match(await page.$eval('#secRoles .sb-crumb', el => el.textContent), new RegExp(en('sb.crumb.fromSite')));
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test("Imports' and Deliveries' heads link the contract and the plan stop that bring a depot its goods", async () => {
  const page = await wholeBoard(extracted());
  try {
    // The hub's head on Imports: each importer is a link to its contract.
    await page.evaluate(() => { sbMode.imports = 'all'; openRoute('supply/imports'); });
    const hub = await page.evaluate(key => D.businesses.findIndex(b => b.key === key), HUB);
    const contract = `#secImports details[data-sb-obj="imports|${HUB}"] summary [data-sr-go]`;
    assert.ok(await page.locator(contract).count() >= 1, 'the importer is a link');
    const [row] = JSON.parse(await page.locator(contract).first().getAttribute('data-sr-go'));
    assert.match(row, /^a:(z-no-agent|m-paused|a-replaced)$/);
    await page.locator(contract).first().click();
    assert.equal(await page.evaluate(() => route), 'supply/roles');
    assert.equal(await page.$eval(`#secRoles tr[data-sr-row="${row}"]`, el => el.classList.contains('sr-lit')), true);
    assert.match(await page.$eval('#secRoles .sb-crumb', el => el.textContent), new RegExp(en('sb.crumb.fromImports')));
    // The second warehouse's head on Deliveries: the hub sends to it, stop 2 of Wendy's plan.
    await page.evaluate(() => { sbMode.deliveries = 'all'; openRoute('supply/deliveries'); });
    const stop = `#secDeliveries details[data-sb-obj="deliveries|${SECOND}"] summary [data-sr-go]`;
    assert.equal(await page.locator(stop).count(), 1, `the sender is a link (hub ${hub})`);
    assert.equal(await page.locator(stop).getAttribute('data-sr-go'), JSON.stringify(['m:z-warehouse-plan', 1]));
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('the empty state names where the game sets plans and contracts', async () => {
  const data = fixture();
  data.supply.roles = {managers: [], agents: []};
  const page = await board(data);
  try {
    const t = await page.$eval('#secRoles', el => el.innerText);
    assert.match(t, /No Logistics Manager yet/);
    assert.match(t, /BizMan › Purchasing Agents/);
    assert.equal(await page.locator('#viewCtl select[data-sb-scope="roles"]').count(), 0);
  } finally { await page.close(); }
});

test('a board with no supply.roles draws without throwing', async () => {
  const data = fixture();
  delete data.supply.roles;
  const page = await board(data);
  try {
    assert.equal(await page.evaluate(() => srCount()), 0);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
