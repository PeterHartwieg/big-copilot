// Supply by object (R13): the Shops, Warehouses and Factories tabs and the one
// change checklist read Python's one verdict per supply fact (supplyFact); the
// board works none out of its own.
// The board tests run on the synthetic R8 fixture (tests/fixtures/r8_supply.json).
// The parity tests render real extraction from the Python test builders and
// hold the tabs and the checklist to the facts that extraction sends.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
function python(code) {
  const result = spawnSync(process.env.PYTHON || 'python', ['-c', code],
    {cwd: root, maxBuffer: 4 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout.toString();
}
const FIXTURE = path.join(root, 'tests', 'fixtures', 'r8_supply.json');
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
let browser, html;
before(async () => {
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(root, 'web/index.html'), 'utf8')
    : python('from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))');
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

/* The Supply page drawn from `data` under a sizing, every tab drawn. `which`
   is Needs a change or Everything; `names` are recipes named in this browser. */
async function board(data, {mode = 'cap', names = null, which = 'all', tab = 'warehouses'} = {}){
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
  await page.route('https://**', route => route.abort());
  await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
  await page.goto('http://board.test/');
  await page.evaluate(([data, mode, names, which, tab]) => {
    if(names) localStorage.setItem('ba_line_names', JSON.stringify(names));
    D = data; sizing = mode; sbWhich = which; supplySort = {}; supplyAuto = false; sub.supply = tab;
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    drawSupplyStrip(); drawShopsTab(); drawWarehousesTab(); drawFactoriesTab(); wireAll();
  }, [data, mode, names, which, tab]);
  return page;
}
const actions = page => page.evaluate(() => sbData().rows.map(a =>
  ({kind: a.kind, item: a.item, current: a.current, proposed: a.proposed, tight: !!a.tight, paused: !!a.paused,
    ...(a.lower ? {lower: true} : {})})));
/* A tab's rows by product: every cell's text, the Set to box, the tick. */
const rows = (page, sec) => page.$$eval(`#${sec} tr[data-slug]`, trs => trs.map(r => ({
  s: r.dataset.s, slug: r.dataset.slug,
  // Each text node apart, the way the cell reads.
  cells: [...r.cells].map(c => {
    const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT), bits = [];
    while(w.nextNode()) bits.push(w.currentNode.textContent);
    return bits.join(' ').replace(/\s+/g, ' ').trim();
  }),
  box: r.querySelector('input.imp-in')?.value ?? null,
  tick: !!r.querySelector('.sb-tick'),
})));
const bySlug = async (page, sec, s) => Object.fromEntries((await rows(page, sec))
  .filter(r => s === undefined || r.s === String(s)).map(r => [r.slug, r]));
/* An element's text the way it reads: each text node apart. */
const text = (page, sel) => page.$eval(sel, el => {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), bits = [];
  while(w.nextNode()) bits.push(w.currentNode.textContent);
  return bits.join(' ').replace(/\s+/g, ' ').trim();
});
/* Warehouses columns after the tick: Product, On hand, Draw, Busiest, Cover, Order / top-up, Uses / week, Status. */
const WH = {item: 1, order: 6, uses: 7, status: 8};

test('Warehouses lists every depot line, with the import lines\' Set to boxes and figures', async () => {
  const page = await board(fixture());
  try {
    const hub = await bySlug(page, 'secWarehouses', 0);
    assert.deepEqual(Object.keys(hub).sort(), ['bags', 'butter', 'coffee', 'flour', 'milk', 'soda', 'sugar']);
    // Soda Can is held at the hub but imported by nobody: no box.
    assert.deepEqual(Object.values(hub).filter(r => r.box !== null).map(r => r.slug).sort(),
      ['bags', 'butter', 'coffee', 'flour', 'milk', 'sugar']);
    // The lines' 11,200 and the other sites' 2,800; 24/7 puts the margin on the sites' part only.
    assert.match(hub.flour.cells[WH.uses], /^14,000 24\/7$/);
    assert.equal(hub.flour.box, '14420');
    assert.match(hub.flour.cells[WH.order], /raise/);
    assert.match(hub.sugar.cells[WH.order], /resume import/);
    assert.equal(hub.sugar.box, '2800', 'a paused contract resumes as it stands');
    assert.match(hub.bags.cells[WH.status], /^idle/);
    assert.match(hub.butter.cells[WH.status], /^new/);
    assert.match(hub.coffee.cells[WH.order], /could lower/);
    assert.match(hub.soda.cells[WH.status], /not routed: Garden Gym 53\/day/);
    // Uses / week carries Python's split on hover.
    const tip = await page.locator('#secWarehouses tr[data-slug="coffee"] .sb-uses').getAttribute('data-tip');
    assert.match(tip, /shops 420 a week/);
    const verdict = await page.locator('#secWarehouses .sb-verdict').textContent();
    assert.match(verdict, /inside the margin/);
    assert.match(verdict, /2 lines sit idle/);
    // The second-tier depot, fed each morning from the factory, is on Warehouses too.
    const cd = await bySlug(page, 'secWarehouses', 5);
    assert.match(cd.cake.cells[WH.order], /^200 290 a day Bakery Factory's plan$/);
    assert.match(cd.cake.cells[WH.status], /^short/);
    assert.ok(cd.cake.tick);
  } finally { await page.close(); }
});

test('every change on the checklist is a fact\'s figure, and sits on its object\'s tab', async () => {
  const page = await board(fixture());
  try {
    assert.deepEqual(await actions(page), [
      {kind: 'Weekly imports', item: 'Flour', current: 14000, proposed: 14420, tight: true, paused: false},
      {kind: 'Weekly imports', item: 'Sugar', current: null, proposed: null, tight: false, paused: true},
      // 24/7 sizes a line at capacity with no margin: a day of the machines.
      {kind: 'Factory daily top-ups', item: 'Flour', current: 1400, proposed: 1600, tight: false, paused: false},
      {kind: 'Check the delivery route', item: 'Milk', current: null, proposed: null, tight: false, paused: false},
      // Paper Bag topped up far above its sales: the lower target, a change to lower.
      {kind: 'Shop daily top-ups', item: 'Paper Bag', current: 3000, proposed: 120, tight: false, paused: false, lower: true},
      // The gym's shelf is on no plan; the hub that holds its soda could send it.
      {kind: 'Shop daily top-ups', item: 'Soda Can', current: 0, proposed: 70, tight: false, paused: false},
      {kind: 'Shop daily top-ups', item: 'Paper Bag', current: 1400, proposed: 30, tight: false, paused: false, lower: true},
      {kind: 'Shop daily top-ups', item: 'Paper Bag', current: 1500, proposed: 30, tight: false, paused: false, lower: true},
      {kind: 'Depot daily top-ups', item: 'Cake', current: 200, proposed: 290, tight: false, paused: false},
      // The cake line is rostered 12 of the 24 hours 24/7 sizes it for.
      {kind: 'Factory run hours', item: 'Cake', current: 12, proposed: 24, tight: false, paused: false},
    ]);
    const tabs = await page.evaluate(() => Object.fromEntries(Object.entries(sbData().byTab).map(([t, r]) => [t, r.length])));
    assert.deepEqual(tabs, {shops: 4, warehouses: 3, factories: 3});
    assert.match(await page.locator('#secFactories').textContent(), /1,400\s*1,600\s*a day/);
    // Every change has its tick; none is left to the "Other changes" list.
    assert.equal(await page.locator('#pageSupply .sb-tick').count(), 10);
    assert.equal(await page.locator('#pageSupply .sb-part', {hasText: 'Other changes'}).count(), 0);
    // Today's card leaves the tight Flour order and the three top-ups to lower out.
    assert.equal(await page.locator('#planImportsCard .soon').textContent(), '6 TO CHANGE');
  } finally { await page.close(); }
});

test('the strip counts the ticks on every tab, and the tab badges what is left', async () => {
  const page = await board(fixture(), {which: 'changes'});
  try {
    const strip = () => page.locator('#sbTrayText').textContent();
    const badges = () => page.$$eval('#supplyNav a', as => as.map(a => [a.dataset.id, a.querySelector('.sb-n')?.textContent || '✓']));
    assert.equal(await strip(), '0 of 10 typed in');
    assert.deepEqual(await badges(), [['shops', '4'], ['warehouses', '3'], ['factories', '3']]);
    await page.locator('#secWarehouses tr[data-slug="flour"] .sb-tick').click();
    await page.locator('#secFactories tr[data-slug="cake"] .sb-tick').click();
    await page.locator('#secShops tr[data-slug="soda"] .sb-tick').click();
    assert.equal(await strip(), '3 of 10 typed in');
    assert.deepEqual(await badges(), [['shops', '3'], ['warehouses', '2'], ['factories', '2']]);
    assert.match(await page.locator('#secWarehouses tr[data-slug="flour"]').getAttribute('class'), /sb-done/);
    assert.equal(await page.locator('#sbCopyLeft').textContent(), '7');
    // The ticks are kept on the device, per character, under the key the old checklist used.
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('ba_order_marks_v1:r8-fixture')));
    assert.equal(kept.length, 3);
    // The flour tick is Weekly imports only: its top-up into the factory is a row of its own.
    assert.equal(await page.locator('#secFactories tr[data-slug="flour"] .sb-tick').getAttribute('aria-pressed'), 'false');
    await page.locator('#sbReset').click();
    assert.equal(await strip(), '0 of 10 typed in');
    assert.equal(await page.locator('#secShops .sb-done').count(), 0);
  } finally { await page.close(); }
});

test('idle rows fold into one group per cause, which opens on a click', async () => {
  const page = await board(fixture(), {which: 'changes'});
  try {
    // Paper Bag topped up far above sales at three shops: one group.
    const group = page.locator('#secShops tr.sb-gr');
    assert.equal(await group.count(), 1);
    assert.match(await group.textContent(), /3 shops\s*Paper Bag/);
    const kids = page.locator('#secShops tr[data-kid]');
    assert.equal(await kids.count(), 3);
    // Each shelf carries its lower target to type, and a tick; the group counts them.
    assert.match(await group.textContent(), /3 to type/);
    assert.equal(await kids.locator('.sb-tick').count(), 3);
    assert.match(await kids.first().textContent(), /3,000\s*120\s*a day/);
    assert.equal(await page.locator('#secShops tr[data-kid].sb-open').count(), 0);
    await group.click();
    assert.equal(await page.locator('#secShops tr[data-kid].sb-open').count(), 3);
    assert.equal(await kids.first().isVisible(), true);
    // The hub's two idle lines: one group, per site.
    await page.evaluate(() => { sub.supply = 'warehouses'; drawWarehousesTab(); });
    const hub = page.locator('#secWarehouses tr.sb-gr');
    assert.match(await hub.textContent(), /Idle stock\s*\+2/);
    await hub.locator('.sb-kids').click();
    assert.equal(await page.locator('#secWarehouses tr[data-kid].sb-open').count(), 2);
    // The group stays open through a redraw.
    await page.evaluate(() => drawWarehousesTab());
    assert.equal(await page.locator('#secWarehouses tr[data-kid].sb-open').count(), 2);
  } finally { await page.close(); }
});

test('Needs a change keeps the rows with a change or a word worth reading', async () => {
  const page = await board(fixture(), {which: 'changes', tab: 'shops'});
  try {
    const shops = await rows(page, 'secShops');
    // The no-plan gym and the three idle paper-bag shelves; the covered and new shelves wait under Everything.
    assert.deepEqual(shops.map(r => `${r.s}:${r.slug}`).sort(), ['2:bags', '3:bags', '4:bags', '4:soda']);
    assert.match(await page.locator('#secShops .sb-more').textContent(), /3 more shelves are fine/);
    await page.locator('#secShops [data-sb-mode="all"]').click();
    assert.equal((await rows(page, 'secShops')).length, 7);
    assert.equal(await page.locator('#sbMode a.on').textContent(), 'Everything');
  } finally { await page.close(); }
});

test('Demand sizing reads the facts\' Demand figures, and says where a shop is still ramping', async () => {
  const page = await board(fixture(), {mode: 'dem'});
  try {
    const hub = await bySlug(page, 'secWarehouses', 0);
    assert.match(hub.flour.cells[WH.uses], /^10,920 may still be ramping$/);
    assert.equal(hub.flour.box, '14000');
    assert.match(hub.flour.cells[WH.status], /^covered/);
    const ramp = await page.locator('#secWarehouses .sz-ramp').first().getAttribute('data-tip');
    assert.match(ramp, /Cake Shop Midtown/);
    assert.match(await page.locator('#secFactories').textContent(), /1,160\s*may still be ramping/);
    assert.match(await page.locator('#secFactories .sb-ramp').textContent(), /Cake Shop Midtown/);
    assert.deepEqual((await actions(page)).map(a => [a.kind, a.item]), [
      ['Weekly imports', 'Sugar'], ['Check the delivery route', 'Milk'], ['Shop daily top-ups', 'Paper Bag'],
      ['Shop daily top-ups', 'Soda Can'], ['Shop daily top-ups', 'Paper Bag'], ['Shop daily top-ups', 'Paper Bag'],
      ['Depot daily top-ups', 'Cake']]);
    // The switch sits on Warehouses and on Factories, both on Demand.
    assert.equal(await page.locator('#sbSizingW a.on').textContent(), 'Demand');
    assert.equal(await page.locator('#sbSizingF a.on').textContent(), 'Demand');
  } finally { await page.close(); }
});

test('the switch on either tab remembers the sizing on the device and redraws the board', async () => {
  const page = await board(fixture());
  try {
    await page.evaluate(() => { window.redrawn = 0;
      renderAll = () => { window.redrawn++; drawSupplyStrip(); drawWarehousesTab(); drawFactoriesTab(); }; });
    await page.locator('#sbSizingF').getByText('Demand').click();
    assert.equal(await page.evaluate(() => [sizing, localStorage.getItem('ba_dash_sizing'), window.redrawn].join()), 'dem,dem,1');
    assert.match(await page.locator('#secWarehouses').textContent(), /10,920/);
    assert.equal(await page.locator('#sbSizingW a.on').textContent(), 'Demand');
    await page.locator('#sbSizingW').getByText('24/7').click();
    assert.equal(await page.evaluate(() => [sizing, localStorage.getItem('ba_dash_sizing'), window.redrawn].join()), 'cap,cap,2');
  } finally { await page.close(); }
});

test('a line short of its hours is a change at 24/7; under Demand it only may run fewer', async () => {
  const cap = await board(fixture());
  try {
    const cake = (await bySlug(cap, 'secFactories', 1)).cake;
    assert.ok(cake.tick);
    // Line, Machines, Hours a day, Makes, Ships, Held, Status after the tick.
    assert.match(cake.cells[3], /^12 24 h$/);
    assert.match(cake.cells[7], /^short rostered 12 of the 24 hours a day it needs, sized 24\/7$/);
    assert.match(await cap.locator('#sbStrip').textContent(), /0 of 10/);
  } finally { await cap.close(); }
  const dem = await board(fixture(), {mode: 'dem'});
  try {
    const cake = (await bySlug(dem, 'secFactories', 1)).cake;
    assert.equal(cake.tick, false);
    assert.match(cake.cells[7], /^covered needs 10 of its 12 hours: fewer would do$/);
    assert.ok((await actions(dem)).every(a => a.kind !== 'Factory run hours'));
    // Bread feeds nothing a shop draws: Demand sizes it round the clock too.
    assert.match((await bySlug(dem, 'secFactories', 1)).bread.cells[3], /24 h/);
  } finally { await dem.close(); }
});

test('Staffing for factory lines reads the plan for the sizing on screen', async () => {
  const cap = await board(fixture());
  try {
    const card = await text(cap, '#sbStaff');
    assert.match(card, /672 machine-hours a week; you have 12 factory workers hire \+2/);
    assert.match(card, /hire 2: the week needs 14/);
    assert.match(card, /\+\$360 a day in wages/);
    assert.match(card, /Cake .*12 24 h 00–12 12 h 12–24 12 h × 2 machines/);
    assert.match(card, /Sized 24\/7: \+2 factory workers \+\$360 a day/);
    assert.equal(await cap.locator('#sbStaff a.ss-sl.go').getAttribute('href'), await cap.evaluate(() => siteHref('factory#2')));
  } finally { await cap.close(); }
  const dem = await board(fixture(), {mode: 'dem'});
  try {
    const card = await text(dem, '#sbStaff');
    assert.match(card, /476 machine-hours a week; you have 12 factory workers −2/);
    // The fewest workers that cover the week are placed; the rest could go.
    assert.match(card, /2 could go: the week needs 10/);
    assert.match(card, /Cake .*12 10 h 06–16 10 h × 2 machines/);
    assert.match(card, /Sized for demand: −2 factory workers −\$360 a day/);
  } finally { await dem.close(); }
  // A factory whose plan could not be built says so; no plan at all, no card.
  const data = fixture();
  data.factoryStaffing.cap = [{key: 'factory#2', s: 1, name: '[FB] Bakery Factory', failed: true}];
  const failed = await board(data);
  try {
    assert.match(await failed.locator('#sbStaff').textContent(), /No plan could be built/);
  } finally { await failed.close(); }
  delete data.factoryStaffing;
  const none = await board(data);
  try { assert.equal(await none.locator('#sbStaff').count(), 0); } finally { await none.close(); }
});

test("a shelf a wholesale store delivers each week reads its week, and its change is the contract's", async () => {
  const data = fixture();
  // The gym's soda comes from a wholesale store each Monday: 300 a week against 371 sold.
  data.supply.facts[4].soda = {st: 'short', why: 'order', lvl: 'critical', role: 'shelf', cad: 'weekly',
    use: 371, need: 427, have: 300, setTo: 430, parts: {lines: 0, sites: 371, route: 0}, imp: false,
    wholesale: true, day: 'Monday'};
  Object.assign(data.supply.shops.find(r => r.slug === 'soda'), {wholesale: 300, wholesaleDay: 'Monday'});
  const page = await board(data);
  try {
    assert.deepEqual((await actions(page)).find(a => a.item === 'Soda Can'),
      {kind: 'Wholesale deliveries', item: 'Soda Can', current: 300, proposed: 430, tight: false, paused: false});
    // Shop, Product, Sells, Busiest, On hand, Pressure, Daily top-up, Status after the tick.
    const soda = (await bySlug(page, 'secShops', 4)).soda;
    assert.match(soda.cells[7], /^300 430 a week wholesale, each Monday$/);
    assert.match(soda.cells[8], /^short/);
    assert.ok(soda.tick);
  } finally { await page.close(); }
});

test("Warehouses lists a route-fed depot's daily top-up from its fact, naming the site that sets it", async () => {
  const data = fixture();
  // The hub's soda, fed only by the bakery's plan: its busiest day outruns the top-up.
  data.supply.facts[0].soda = {st: 'short', why: 'target', lvl: 'critical', role: 'depot', cad: 'daily',
    use: 100, need: 115, have: 80, setTo: 120, imp: false, from: 1};
  const page = await board(data);
  try {
    const act = (await page.evaluate(() => sbData().rows)).find(a => a.kind === 'Depot daily top-ups' && a.item === 'Soda Can');
    assert.deepEqual([act.kind, act.current, act.proposed, act.source, !!act.tight],
      ['Depot daily top-ups', 80, 120, 1, false]);
    assert.match(act.reason, /Bakery Factory/);
    const soda = (await bySlug(page, 'secWarehouses', 0)).soda;
    assert.match(soda.cells[WH.order], /^80 120 a day Bakery Factory's plan$/);
    assert.match(soda.cells[5], /125%/);
    assert.ok(soda.tick);
  } finally { await page.close(); }
});

test("a factory's paused contract the top-up falls short without is a change; one it covers is not", async () => {
  const withPaused = lvl => {
    const data = fixture();
    data.supply.facts[1].milk = {...data.supply.facts[1].milk, imp: true, import: {st: 'paused',
      why: lvl === 'info' ? 'topup' : 'order', lvl, role: 'input', cad: 'weekly', use: 0, need: 0, have: 2100,
      setTo: null, parts: {lines: 0, sites: 0, route: 0}, from: 0}};
    const hubMilk = data.supply.factories.depots[0].milk;
    data.supply.factories.depots[1] = {milk: {...hubMilk, weekly: 0, pausedWeekly: 2100, plain: 0,
      contracts: [{...hubMilk.contracts[0], id: 'c7', active: false}]}};
    return data;
  };
  const read = async lvl => {
    const page = await board(withPaused(lvl));
    try {
      return await page.evaluate(() => {
        const own = [...document.querySelectorAll('#secFactories .sb-part')].find(p => p.textContent === 'Its own imports');
        const table = own && own.nextElementSibling;
        return {milk: table ? table.querySelector('tr[data-slug="milk"]')?.textContent.replace(/\s+/g, ' ') : null,
                tick: !!(table && table.querySelector('tr[data-slug="milk"] .sb-tick')),
                acts: sbData().rows.filter(a => a.item === 'Milk' && a.kind === 'Weekly imports').map(a => [a.kind, !!a.paused])};
      });
    } finally { await page.close(); }
  };
  const short = await read('critical');
  assert.match(short.milk, /resume import/);
  assert.ok(short.tick);
  assert.deepEqual(short.acts, [['Weekly imports', true]]);
  const covered = await read('info');
  assert.match(covered.milk, /a depot's daily top-up feeds the line/);
  assert.equal(covered.tick, false);
  assert.deepEqual(covered.acts, []);
});

/* Facts shaped as extraction writes them for a real save: a gym's shelf a
   wholesale store fills each Monday (short, a warning while its stock reaches
   the drop), another tight, and a depot only a route from a factory fills,
   tight against its busiest day. */
test('wholesale deliveries and depot top-ups from facts shaped like a real save\'s', async () => {
  const data = fixture();
  data.businesses[4].lines.push({slug: 'energy', item: 'Energy Drink', units: 1026, rate: 176, price: 5},
                                {slug: 'chips', item: 'Chips', units: 100, rate: 100, price: 2});
  data.supply.facts[4] = {
    energy: {st: 'short', why: 'order', lvl: 'warn', role: 'shelf', cad: 'weekly', use: 1232, need: 1417,
      have: 1200, setTo: 1420, catchUp: 50, parts: {lines: 0, sites: 1232, route: 0}, imp: false, wholesale: true,
      day: 'Monday'},
    soda: {st: 'tight', why: 'order', lvl: 'warn', role: 'shelf', cad: 'weekly', use: 883, need: 1015,
      have: 900, setTo: 1020, parts: {lines: 0, sites: 883, route: 0}, imp: false, wholesale: true, day: 'Monday'},
    // Covered for the week, but the stock runs out before Monday's delivery.
    chips: {st: 'short', why: 'shortfall', lvl: 'critical', role: 'shelf', cad: 'weekly', use: 700, need: 805,
      have: 900, setTo: null, catchUp: 120, parts: {lines: 0, sites: 700, route: 0}, imp: false, wholesale: true,
      day: 'Monday'},
  };
  // The hub takes a wholesale store's syrup for the factory lines: 1,000 a week against 1,680.
  data.supply.facts[0].syrup = {st: 'short', why: 'order', lvl: 'critical', role: 'depot', cad: 'weekly',
    use: 1680, need: 1680, have: 1000, setTo: 1680, parts: {lines: 1680, sites: 0, route: 0}, imp: false,
    wholesale: true, day: 'Monday'};
  data.supply.shops = data.supply.shops.filter(r => r.s !== 4).concat([
    {s: 4, item: 'Energy Drink', slug: 'energy', sold: 176, peakSold: 192, peakDay: 'Sunday', target: 0,
     pressure: null, stock: 1026, from: null, level: 'ok', wholesale: 1200, wholesaleDay: 'Monday'},
    {s: 4, item: 'Soda Can', slug: 'soda', sold: 126, peakSold: 137, peakDay: 'Sunday', target: 0,
     pressure: null, stock: 817, from: null, level: 'ok', wholesale: 900, wholesaleDay: 'Monday'},
    {s: 4, item: 'Chips', slug: 'chips', sold: 100, peakSold: 110, peakDay: 'Sunday', target: 0,
     pressure: null, stock: 100, from: null, level: 'ok', wholesale: 900, wholesaleDay: 'Monday'}]);
  data.supply.facts[0].bread = {st: 'tight', why: 'target', lvl: 'warn', role: 'depot', cad: 'daily',
    use: 905, need: 1041, have: 1000, setTo: 1050, imp: false, from: 1};
  data.supply.facts[0].cups = {st: 'covered', why: 'route', lvl: 'ok', role: 'depot', cad: 'daily',
    use: 100, need: 115, have: 200, setTo: null, imp: false, from: 1};
  const page = await board(data);
  try {
    const gym = await bySlug(page, 'secShops', 4);
    // Short of the week and dry before Monday: the raise and the stock to bring in, both.
    assert.match(gym.energy.cells[7], /^1,200 1,420 a week wholesale, each Monday bring in \+50 once$/);
    assert.match(gym.soda.cells[7], /^900 1,020 a week/);
    assert.match(gym.soda.cells[8], /^tight/);
    assert.match(gym.chips.cells[7], /^900 a week wholesale, each Monday bring in \+120 once$/);
    const hub = await bySlug(page, 'secWarehouses', 0);
    assert.match(hub.syrup.cells[WH.order], /^1,000 1,680 a week wholesale, each Monday$/);
    assert.match(hub.bread.cells[WH.order], /^1,000 1,050 a day Bakery Factory's plan$/);
    assert.match(hub.bread.cells[WH.status], /^tight/);
    assert.match(hub.cups.cells[WH.status], /^covered/);
    // Needs a change: the covered route-fed line drops out.
    await page.evaluate(() => { sbWhich = 'changes'; drawWarehousesTab(); });
    assert.ok(!(await bySlug(page, 'secWarehouses', 0)).cups);
    const acts = await page.evaluate(() => sbData().rows.map(a => [a.kind, a.site, a.item, a.current, a.proposed]));
    assert.ok(acts.some(a => a.join() === 'Wholesale deliveries,0,Syrup,1000,1680'), JSON.stringify(acts));
    assert.ok(acts.some(a => a.join() === 'Before the next delivery,4,Chips,,120'), JSON.stringify(acts));
    assert.equal(await page.locator('#pageSupply .sb-part', {hasText: 'Other changes'}).count(), 0);
  } finally { await page.close(); }
});

test('a paused backup a route covers is covered by route, with nothing to resume', async () => {
  const data = fixture();
  data.supply.facts[0].sugar = {...data.supply.facts[0].sugar, st: 'covered', why: 'route', lvl: 'ok', setTo: null,
    parts: {lines: 2800, sites: 0, route: 2800}};
  const page = await board(data);
  try {
    const sugar = (await bySlug(page, 'secWarehouses', 0)).sugar;
    assert.match(sugar.cells[WH.order], /covered by route/);
    assert.doesNotMatch(sugar.cells[WH.order], /resume/);
    assert.ok((await actions(page)).every(a => a.item !== 'Sugar'));
  } finally { await page.close(); }
});

test('a recipe named in this browser reads new until the next refresh', async () => {
  const data = fixture();
  data.supply.factories.sites[0].unnamed = [{rid: 'r-muffin', workstation: 'Oven', slots: [5], machines: 1, idle: false,
    candidates: [{slug: 'muffin', item: 'Muffin'}], hoursWeek: 168, fullWeek: 168, gaps: []}];
  data.plan.recipes.push({slug: 'muffin', item: 'Muffin', out: 10, workstation: 'oven',
    ingredients: [{slug: 'butter', item: 'Butter', per: 5}]});
  const page = await board(data, {names: {'r-muffin': 'muffin'}});
  try {
    const f = await bySlug(page, 'secFactories', 1);
    assert.match(f.butter.cells.at(-1), /^new named in this browser/);
    // Its top-up has no figure until Python judges it, so nothing to set.
    assert.equal(f.butter.tick, false);
    assert.ok((await actions(page)).every(a => a.item !== 'Butter'));
    // The line itself is named, and new.
    assert.match(f.muffin.cells[1], /named by you/);
    assert.match(f.muffin.cells.at(-1), /^new/);
  } finally { await page.close(); }
});

test('an unnamed line is on Factories with its recipe picker', async () => {
  const data = fixture();
  data.supply.factories.sites[0].unnamed = [{rid: 'r-x', workstation: 'Oven', slots: [5], machines: 1, idle: false,
    candidates: [{slug: 'cake', item: 'Cake'}], hoursWeek: 168, fullWeek: 168, gaps: []}];
  data.supply.factories.unnamed = 1;
  const page = await board(data, {which: 'changes'});
  try {
    assert.equal(await page.locator('#secFactories select.linepick').count(), 1);
    assert.match(await page.locator('#sbRecipes').textContent(), /1 recipe to name/);
    assert.match(await page.locator('#secFactories .sb-verdict').textContent(), /1 machine without usable recipe details/);
  } finally { await page.close(); }
});

test('the tabs, Goods flow and Today read the same facts, by sizing', async () => {
  const page = await board(fixture());
  try {
    const shops = await bySlug(page, 'secShops', 4);
    assert.match(shops.soda.cells[7], /^— 70 a day plan from Import Hub$/);
    assert.match(shops.soda.cells[8], /^no plan/);
    // Goods flow counts each site's facts on its dot: the worst of them.
    const dots = await page.evaluate(() => { drawFlow();
      return [...document.querySelectorAll('#flow circle')].map(c => c.textContent).filter(Boolean); });
    assert.ok(dots.includes('1 paused'), JSON.stringify(dots));
    // The second-tier depot's short top-up is its own red dot.
    assert.equal(dots.filter(d => d === '1 short').length, 2, JSON.stringify(dots));
    const today = async mode => page.evaluate(mode => { sizing = mode; drawAlerts();
      return [...document.querySelectorAll('#alerts .find')].map(f => f.dataset.id); }, mode);
    const cap = await today('cap'), dem = await today('dem');
    assert.ok(cap.includes('r13hours') && cap.includes('r8feed'), JSON.stringify(cap));
    assert.deepEqual(dem, ['r8paused', 'r8stalled', 'r8notrouted', 'r8dead']);
    assert.doesNotMatch(await page.locator('#alerts').textContent(), /tight/i);
  } finally { await page.close(); }
});

test('a finding lands on its tab and row, lit, with a crumb back', async () => {
  const page = await board(fixture(), {which: 'changes', tab: 'shops'});
  try {
    const land = id => page.evaluate(id => { goToAlert(D.alerts.find(a => a.id === id));
      const at = document.querySelector(`#${SB_SEC[sub.supply]} [data-sb-at]`);
      return {tab: sub.supply, at: at ? `${at.dataset.s}:${at.dataset.slug}` : null,
              crumb: document.querySelector(`#${SB_SEC[sub.supply]} .sb-crumb`)?.textContent || ''}; }, id);
    // Not routed: the tab of the depot's kind, on the soda row, its group opened.
    const soda = await land('r8notrouted');
    assert.deepEqual([soda.tab, soda.at], ['warehouses', '0:soda']);
    assert.match(soda.crumb, /from Today · Not routed/);
    assert.equal(await page.locator('#secWarehouses tr[data-slug="soda"]').evaluate(r => r.classList.contains('sb-open')), true);
    // Too few hours: Factories, on the cake line.
    const cake = await land('r13hours');
    assert.deepEqual([cake.tab, cake.at], ['factories', '1:cake']);
    // A row that is no change opens Everything.
    await page.evaluate(() => { sbWhich = 'changes'; sbLand('shops', 2, 'cake', 'from Today · a test'); });
    assert.equal(await page.evaluate(() => sbWhich), 'all');
    assert.equal(await page.locator('#secShops tr.sb-arrived').getAttribute('data-slug'), 'cake');
    // The crumb's close drops the landing.
    await page.locator('#secShops [data-sb-crumb]').click();
    assert.equal(await page.locator('#secShops .sb-crumb').count(), 0);
    assert.equal(await page.locator('#secShops tr.sb-arrived').count(), 0);
  } finally { await page.close(); }
});

test('the diagram is a view of the tab; a site clicked on it opens its rows', async () => {
  const page = await board(fixture(), {which: 'changes', tab: 'warehouses'});
  try {
    await page.locator('#sbView a[data-id="diagram"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('ba_dash_supply_view')), 'diagram');
    await page.evaluate(() => drawFlow());
    assert.equal(await page.locator('#secWarehouses .sb-diag #flow').count(), 1);
    assert.equal(await page.locator('#secWarehouses .sb-list').isHidden(), true);
    // Another tab takes the diagram with it.
    await page.evaluate(() => { showSub('supply', 'factories'); });
    assert.equal(await page.locator('#secFactories .sb-diag #flow').count(), 1);
    await page.locator('#flow .node[data-id="dist#6"]').click();
    assert.equal(await page.evaluate(() => [sbViewMode(), sub.supply].join()), 'list,warehouses');
    assert.equal(await page.locator('#secWarehouses .sb-obj.lit').count(), 1);
    assert.match(await page.locator('#secWarehouses .sb-obj.lit').textContent(), /Cake Distr\./);
    assert.equal(await page.locator('#sbFlowHome #flow').count(), 1, 'the list back on, the diagram waits outside the tabs');
  } finally { await page.close(); }
});

/* Real extraction, from the Python builders. Once _supply() sends facts, the
   tabs and the checklist say exactly what they say; a payload without them
   (the board ahead of the extraction) has nothing to hold the board to. */
for (const scenario of [
  // The fixture holds the harness itself to account: it has facts today.
  {name: 'the R8 fixture', code: 'd = json.load(open("tests/fixtures/r8_supply.json", encoding="utf-8"))'},
  {name: 'paused direct', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(2000,active=False,destination=("factory",0))])'},
  {name: 'mixed fully covered', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(2000,destination=("factory",0))],routed=True)'},
  {name: 'mixed partially direct', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(840,destination=("factory",0)),contract(900)],routed=True)'},
  {name: 'a warehouse contract before its first delivery', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(126000)],routed=True)'},
  {name: 'a short daily top-up', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(840,destination=("factory",0)),contract(900)],routed=True,target=130)'},
  {name: 'a line the route covers half of', code: 'from test_routed_supply import board_data,contract; '
    + 'd = board_data(0.5,[contract(5000,5000,smart=False)],import_days=(7,))'},
  {name: 'a paused backup the route covers', code: 'from test_routed_supply import board_data,contract; '
    + 'd = board_data(1.0,[contract(5200,0,smart=True,active=False)])'},
]) {
  test(`parity with extraction: ${scenario.name}`, async t => {
    const data = JSON.parse(python(`import sys,json; sys.path.insert(0,"tests"); ${scenario.code}; print(json.dumps(d))`));
    if (!data.supply.facts) { t.skip('this extraction sends no supply facts yet'); return; }
    const page = await board(data);
    try {
      const seen = await page.evaluate(() => {
        const facts = D.supply.facts, out = {imports: [], wanted: [], topups: []};
        Object.keys(facts).forEach(s => Object.keys(facts[s]).forEach(slug => {
          const f = supplyFact(s, slug), imp = f.import || f;
          if(f.imp) out.imports.push(slug);
          if(f.imp && Number.isFinite(imp.setTo) && imp.st !== 'paused') out.wanted.push([+s, slug, imp.setTo]);
          if(f.role === 'input' && f.cad === 'daily' && Number.isFinite(f.setTo)) out.topups.push([+s, slug, f.setTo]);
        }));
        out.rows = gwImportRows.map(r => [r.s, r.slug, r.setTo]);
        return out;
      });
      assert.equal(seen.rows.length, seen.imports.length, 'one import row per import fact');
      const acts = await page.evaluate(() => sbData().rows);
      const weekly = acts.filter(a => a.kind === 'Weekly imports' && a.proposed !== null);
      assert.equal(weekly.length, seen.wanted.length);
      for (const [s, , setTo] of seen.wanted)
        assert.ok(weekly.some(a => a.site === s && a.proposed === setTo), `weekly ${setTo} at ${s}`);
      const daily = acts.filter(a => a.kind === 'Factory daily top-ups');
      assert.deepEqual(daily.map(a => [a.site, a.proposed]).sort(), seen.topups.map(([s, , v]) => [s, v]).sort());
      // Every change has a tick on its tab.
      const ticked = await page.evaluate(() => [...document.querySelectorAll('#pageSupply .sb-tick')]
        .flatMap(b => b.dataset.sbKeys.split(' ').map(Number)));
      assert.deepEqual([...new Set(ticked)].sort((a, b) => a - b), acts.map((_, i) => i));
    } finally { await page.close(); }
  });
}
