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
      {who: null, id: null, skill: null, s: 5, key: 'dist#6', factory: false, gap: 'warehouse', holds: 1200},
      {who: 'Yara Holm', id: 'E3', skill: 100, idle: true},
    ],
    agents: [
      {contract: 'C1', who: 'Mara Okafor', id: 'E4', skill: 80, importer: 'Jet Cargo Imports', importerKey: 'ba:importertypename_jetcargo',
       pier: '1 Pier', pierKey: 'pier', smart: true, repeating: true, urgent: false, active: true, next: 337,
       products: [{slug: 'sugar', item: 'Sugar', s: 0, key: 'hub#1', amount: 5000, last: 4200},
                  {slug: 'flour', item: 'Flour', s: null, key: null, amount: 100, last: 0}]},
      {contract: 'C2', who: null, id: null, skill: null, importer: 'Seaside Internationals', importerKey: 'ba:importertypename_seaside',
       pier: '2 Pier', pierKey: 'ba:street_pier#2', smart: false, repeating: true, urgent: false, active: true, next: 337,
       products: [{slug: 'soda', item: 'Soda', s: 0, key: 'hub#1', amount: 800, last: 800}]},
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
  await page.evaluate(data => {
    /* The R8 fixture is a supply payload, not a whole board: the Supply
       views are drawn, as tests/import_routes.test.cjs draws them. */
    takeData(data);
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    page = 'supply'; route = 'supply/roles'; sub.supply = 'roles';
    drawSupplyStrip(); drawRolesView(); drawImportsView(); drawFlowView(); paintLocal(); wireAll();
  }, data);
  page.errors = errors;
  return page;
}
const fixture = () => { const d = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')); d.supply.roles = roles(); return d; };
const rowText = (page, id) => page.$eval(`#secRoles tr[data-sr-row="${id}"]`, el => el.innerText.replace(/\s+/g, ' ').trim());

test('Plans & contracts is second under Supply, and its count is its own flags', async () => {
  const page = await board(fixture());
  try {
    const nav = await page.$$eval('#localNav a[data-route]', as => as.map(a => [a.dataset.route, a.querySelector('small')?.textContent || '']));
    assert.equal(nav[1][0], 'supply/roles');
    // Rosa: 10 stops over 8, a stop with no products; the gap warehouse; Yara
    // with no plan; the contract with no agent; one product with no
    // warehouse; Kofi with no contract: 7.
    assert.equal(nav[1][1], '7');
    assert.equal(await page.evaluate(() => srCount()), 7);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('rows keep the game order, split by where a plan picks up; each says what holds it back', async () => {
  const page = await board(fixture());
  try {
    const order = await page.$$eval('#secRoles tr[data-sr-row], #secRoles tr.sr-part', trs => trs.map(t => t.dataset.srRow || `part:${t.innerText.trim()}`));
    assert.deepEqual(order, [`part:${'FROM WAREHOUSES · DAILY 02:00'}`, 'm:P1', 'g:dist#6', 'part:FROM FACTORIES · DAILY 08:00', 'm:P2', 'part:NO PLAN', 'i:E3',
      'a:C1', 'a:C2', 'i:E5']);
    const rosa = await rowText(page, 'm:P1');
    assert.match(rosa, /Rosa Duvall skill 85%/);
    assert.match(rosa, /10 stops · vehicles reach 8/);
    assert.doesNotMatch(rosa, /^.*\bvehicles reach 8\b.*vehicles reach 8/, 'over the reach, the chip says it once');
    assert.match(rosa, /Stop with no products/);
    assert.match(await rowText(page, 'm:P2'), /vehicles reach 4/);
    assert.match(await rowText(page, 'm:P2'), /United Ocean Import export/);
    assert.match(await rowText(page, 'g:dist#6'), new RegExp(en('sb.roles.flag.noRound')));
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
    const chip = '#secRoles tr[data-sr-row="a:C1"] [data-sr-land]';
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

test("a shop's page names the plans that fill it; a link lands on its stop, lit, with the crumb back", async () => {
  const page = await board(fixture());
  try {
    // The Cake Shop Downtown is stop 1, 3, 5 and 7 of Rosa's plan: its first stop.
    const html = await page.evaluate(() => srFillLinks('shop#3'));
    assert.match(html, /Rosa Duvall's plan · 02:00 ›/);
    assert.match(html, /data-sr-go="\[&quot;m:P1&quot;,0\]"/);
    assert.equal(await page.evaluate(() => srFillLinks('gym#5')), '', 'a site no plan fills says nothing');
    // Clicked from the site's page (inside #pageCompany), as the Shelves head holds it.
    await page.evaluate(html => {
      const host = document.createElement('div');
      host.id = 'srTestHead'; host.innerHTML = html;
      document.getElementById('pageCompany').appendChild(host);
    }, html);
    await page.evaluate(() => document.querySelector('#srTestHead [data-sr-go]').click());
    assert.equal(await page.evaluate(() => route), 'supply/roles');
    assert.equal(await page.$eval('#secRoles tr[data-sr-stop="m:P1:0"]', el => el.classList.contains('sr-lit')), true);
    assert.equal(await page.$eval('#secRoles tr[data-sr-of="m:P1:0"]', el => el.classList.contains('sr-hide')), false, 'the stop is opened');
    assert.match(await page.$eval('#secRoles .sb-crumb', el => el.textContent), new RegExp(en('sb.crumb.fromSite')));
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
