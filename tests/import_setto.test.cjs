// The Weekly imports table: Smart Delivery levels, the editable Set to box,
// and how a typed figure reaches the Plan imports checklist.
// Browser regressions: install Playwright and its Chromium browser to run.
// NODE_PATH may point at an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
let browser, html;
before(async () => {
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8')
    : (() => {
      const result = spawnSync(process.env.PYTHON || 'python', ['-c',
        'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
      {cwd: root, maxBuffer: 4 * 1024 * 1024});
      assert.equal(result.status, 0, result.stderr?.toString());
      return result.stdout.toString();
    })();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

const contractOf = (order, importer, smart, amount, active = true) =>
  ({order, id: `c${order}`, importer, smart, amount, lastWeek: 0, active, repeating: true, agent: true});
/* One depot, three materials, all synthetic. Sugar runs on a Smart Delivery
   level too low for its week and has two contracts; Flour's level is far above
   its week; Salt is a plain weekly order that covers its week. */
const fixture = () => ({
  meta: {character: 'set-fixture', save: 'Fixture', day: 10},
  businesses: [
    {key: 'depot#0', name: 'North Depot', type: 'Warehouse', address: '1 North St', lines: [
      {slug: 'sugar', item: 'Sugar', units: 500}, {slug: 'flour', item: 'Flour', units: 2000},
      {slug: 'salt', item: 'Salt', units: 300}]},
  ],
  supply: {
    shops: [], idle: [], imports: [],
    factories: {character: 'set-fixture', machines: 0, unnamed: 0, sites: [],
      depots: {0: {
        sugar: {weekly: 900, pausedWeekly: 0, smart: true, target: 900, plain: 0, arrivedLastWeek: 850,
          contracts: [contractOf(0, 'Pier 1', true, 900), contractOf(3, 'Pier 2', false, 500, false)]},
        flour: {weekly: 5000, pausedWeekly: 0, smart: true, target: 5000, plain: 0, arrivedLastWeek: 1200,
          contracts: [contractOf(1, 'Pier 1', true, 5000)]},
        salt: {weekly: 700, pausedWeekly: 0, smart: false, target: null, plain: 700, arrivedLastWeek: 700,
          contracts: [contractOf(2, 'Pier 1', false, 700)]},
      }},
      depotOther: {0: {sugar: 1400, flour: 1000, salt: 650}}},
  },
});

async function board({width = 1280, view = 'all', storage = true, page: given, data = fixture(), before = null} = {}){
  const page = given || await browser.newPage({viewport: {width, height: 1000}});
  if(!given){
    await page.route('https://**', route => route.abort());
    await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
    await page.goto('http://board.test/');
  }
  await page.evaluate(([data, view, storage, before]) => {
    if(!storage) Object.defineProperty(window, 'localStorage', {get(){ throw new Error('denied'); }});
    if(before) localStorage.setItem(before[0], before[1]);
    D = data; logisticsView = view; supplySort = {};
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    const draw = drawOrderChecklist;
    drawOrderChecklist = (rows, f) => { window.fixtureActions = rows; draw(rows, f); };
    drawLogistics(); wireAll();
  }, [data, view, storage, before]);
  return page;
}
const cells = page => page.$$eval('#importPlan tbody tr', rows => rows.map(r => ({
  item: r.cells[0].firstChild.textContent.trim(),
  inGame: r.cells[3].textContent.replace(/\s+/g, ' ').trim(),
  box: r.cells[4].querySelector('input')?.value ?? null,
  verdict: r.cells[4].textContent.replace(/\s+/g, ' ').trim(),
  changed: r.classList.contains('imp-changed'),
})));
const actions = page => page.evaluate(() => window.fixtureActions
  .filter(a => a.kind === 'Weekly imports').map(a => [a.item, a.current, a.proposed, a.mode]));
const box = (page, item) => page.locator('#importPlan tbody tr', {hasText: item}).locator('input');

test('the table reads a Smart Delivery level apart from a weekly order', async () => {
  const page = await board();
  try{
    const heads = await page.$$eval('#importPlan thead th', th => th.slice(0, 6).map(x => x.textContent.trim()));
    assert.deepEqual(heads, ['Material', 'Used / week', 'Arrived last week', 'Set in game', 'Set to', 'At depot']);
    const rows = Object.fromEntries((await cells(page)).map(r => [r.item, r]));
    assert.match(rows.Sugar.inGame, /^900 in stock$/);
    assert.match(rows.Salt.inGame, /^700 a week$/);
    // Sugar's level is short of its week: the box holds the suggestion.
    assert.equal(rows.Sugar.box, '1400');
    assert.equal(rows.Sugar.changed, true);
    assert.match(rows.Sugar.verdict, /raise/);
    // A high level only holds stock: covered, never "could lower".
    assert.equal(rows.Flour.box, '5000');
    assert.equal(rows.Flour.changed, false);
    assert.match(rows.Flour.verdict, /covered/);
    assert.doesNotMatch(await page.locator('#importPlan').textContent(), /could lower/);
    // Two contracts on one line are listed in plan order under the material.
    const sugar = await page.locator('#importPlan tbody tr', {hasText: 'Sugar'}).locator('.imp-contracts').textContent();
    assert.match(sugar, /1\. Pier 1 · keeps 900 in stock\s*2\. Pier 2 · 500 a week · paused/);
    assert.deepEqual(await actions(page), [['Sugar', 900, 1400, 'smart']]);
    assert.match(await page.locator('#orderChecklistBody').textContent(), /in stock/);
  } finally { await page.close(); }
});

for(const storage of [true, false]){
  test(`a typed figure is kept, shown as a change and reaches the checklist (${storage ? 'with' : 'without'} storage)`, async () => {
    const page = await board({view: 'changes', storage});
    try{
      assert.deepEqual((await cells(page)).map(r => r.item), ['Sugar']);
      await page.locator('#logisticsTools').getByText('Everything').click();
      await box(page, 'Flour').fill('6000');
      await box(page, 'Flour').press('Enter');
      await page.waitForFunction(() => document.querySelector('#importPlan .imp-reset'));
      const flour = (await cells(page)).find(r => r.item === 'Flour');
      assert.deepEqual([flour.box, flour.changed], ['6000', true]);
      assert.deepEqual(await actions(page), [['Sugar', 900, 1400, 'smart'], ['Flour', 5000, 6000, 'smart']]);
      // The edited row stays in the "Needs a change" view.
      await page.locator('#logisticsTools').getByText('Needs a change').click();
      assert.deepEqual((await cells(page)).map(r => r.item), ['Sugar', 'Flour']);
      if(storage){
        const saved = await page.evaluate(() => localStorage.getItem('ba_import_set_v2:set-fixture'));
        // What was typed, and what the game held when it was.
        assert.deepEqual(JSON.parse(saved), {'["depot#0","flour"]': {value: 6000, inGame: 5000}});
      }
      // Reset puts the suggestion back and the row leaves the view.
      await page.locator('#importPlan .imp-reset').click();
      assert.deepEqual((await cells(page)).map(r => r.item), ['Sugar']);
      assert.deepEqual(await actions(page), [['Sugar', 900, 1400, 'smart']]);
    } finally { await page.close(); }
  });
}

test('a typed figure survives a reload, and typing the suggestion is no edit', async () => {
  const page = await board();
  try{
    await box(page, 'Sugar').fill('1800');
    await box(page, 'Sugar').press('Enter');
    await page.waitForFunction(() => document.querySelector('#importPlan .imp-reset'));
    await page.reload();
    await board({page});
    assert.equal((await cells(page)).find(r => r.item === 'Sugar').box, '1800');
    assert.deepEqual((await actions(page))[0], ['Sugar', 900, 1800, 'smart']);
    await box(page, 'Sugar').fill('1400');
    await box(page, 'Sugar').press('Enter');
    await page.waitForFunction(() => !document.querySelector('#importPlan .imp-reset'));
    assert.equal(await page.evaluate(() => localStorage.getItem('ba_import_set_v2:set-fixture')), '{}');
  } finally { await page.close(); }
});

/* The Plan page's ingredient table, from the real _plan() over a synthetic
   save: water on a Smart Delivery level, a plain order of it for comparison. */
function planData(smart){
  const code = 'import sys, json; sys.path.insert(0, "tests")\n'
    + 'from test_plan_regressions import PlannerRegressions, contract\n'
    + 'PlannerRegressions.setUpClass(); t = PlannerRegressions()\n'
    + `plan = t.plan([contract(3000, smart=${smart ? 'True' : 'False'})])\n`
    + 'print(json.dumps(plan))';
  const result = spawnSync(process.env.PYTHON || 'python', ['-c', code], {cwd: root, maxBuffer: 16 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  return JSON.parse(result.stdout.toString());
}
for(const smart of [true, false]){
  test(`the Plan page names ${smart ? 'a Smart Delivery level as stock kept' : 'a plain order as a weekly amount'}`, async () => {
    const plan = planData(smart);
    const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
    try{
      await page.route('https://**', route => route.abort());
      await page.setContent(html, {waitUntil: 'load'});
      const water = await page.evaluate(plan => {
        D = {meta: {character: 'plan-fixture', save: 'Fixture', day: 10}, businesses: [],
          supply: {shops: [], idle: [], imports: [], factories: {sites: [], depots: {}, depotOther: {}}}, plan};
        planType = 'ba:businesstype_gym'; drawPlan();
        const meta = JSON.parse(document.querySelector('[data-ingmeta]').dataset.ingmeta);
        const row = [...document.querySelectorAll('#ingBody tr')].find(tr => tr.dataset.name === 'Water');
        return {tip: meta.Water.tip, cell: row ? row.cells[5].textContent.replace(/\s+/g, ' ').trim() : null};
      }, plan);
      if(smart){
        // Said at its depot, never summed across depots into a level none has.
        assert.match(water.tip, /^Smart Delivery keeps 3,000 in stock at 1 Depot, from /);
        assert.doesNotMatch(water.tip, /a week on order/);
        assert.match(water.cell, /^3,000 a week at most, Smart Delivery/);
      } else {
        assert.match(water.tip, /^3,000 a week on order now from /);
        assert.doesNotMatch(water.cell, /Smart Delivery/);
      }
    } finally { await page.close(); }
  });
}

/* Review round 1: mixed lines, a contract at zero, an entered figure, and
   what the box says it holds. */
const mixed = () => {
  const data = fixture();
  Object.assign(data.businesses[0].lines, [...data.businesses[0].lines,
    {slug: 'hops', item: 'Hops', units: 0}, {slug: 'malt', item: 'Malt', units: 0},
    {slug: 'yeast', item: 'Yeast', units: 0}, {slug: 'rye', item: 'Rye', units: 0}]);
  Object.assign(data.supply.factories.depots[0], {
    // Level first, then a plain 400 on top: at most 1,400 a week.
    hops: {weekly: 1400, pausedWeekly: 0, smart: true, target: 1000, plain: 400, plainBefore: 0, plainAfter: 400,
      levelImporter: 'Pier 1', levelAt: 0, pass: [{amount: 1000, smart: true}, {amount: 400, smart: false}],
      arrivedLastWeek: 1400, contracts: [contractOf(4, 'Pier 1', true, 1000), contractOf(5, 'Pier 2', false, 400)]},
    // Plain first: the 400 lands inside the level.
    malt: {weekly: 1000, pausedWeekly: 0, smart: true, target: 1000, plain: 400, plainBefore: 400, plainAfter: 0,
      levelImporter: 'Pier 1', levelAt: 1, pass: [{amount: 400, smart: false}, {amount: 1000, smart: true}],
      arrivedLastWeek: 1000, contracts: [contractOf(6, 'Pier 2', false, 400), contractOf(7, 'Pier 1', true, 1000)]},
    // Plain 1,400 first already passes the level of 1,000.
    rye: {weekly: 1400, pausedWeekly: 0, smart: true, target: 1000, plain: 1400, plainBefore: 1400, plainAfter: 0,
      levelImporter: 'Pier 1', levelAt: 1, pass: [{amount: 1400, smart: false}, {amount: 1000, smart: true}],
      arrivedLastWeek: 1400, contracts: [contractOf(9, 'Pier 2', false, 1400), contractOf(10, 'Pier 1', true, 1000)]},
    // Set up at zero, nothing brought.
    yeast: {weekly: 0, pausedWeekly: 0, zeroOnly: true, smart: false, target: null, plain: 0, plainAfter: 0,
      arrivedLastWeek: 0, contracts: [contractOf(8, 'Pier 1', false, 0)]},
  });
  Object.assign(data.supply.factories.depotOther[0], {hops: 1800, malt: 1800, yeast: 300, rye: 2000});
  return data;
};

test('a mixed line shows its level, and only a plain amount after it comes on top', async () => {
  const page = await board({data: mixed()});
  try{
    const rows = Object.fromEntries((await cells(page)).map(r => [r.item, r]));
    // The contract holding the level is named; plain amounts are placed
    // before or after it as the game delivers them.
    assert.match(rows.Hops.inGame, /^1,000 in stock\s*at Pier 1\s*plus 400 a week$/);
    assert.match(rows.Malt.inGame, /^1,000 in stock\s*at Pier 1\s*400 a week delivered first counts toward it$/);
    assert.match(rows.Rye.inGame, /1,400 a week delivered first counts toward it$/);
    assert.doesNotMatch(rows.Rye.inGame, /plus/);
    // The level a week needs is the pass replayed, never the plain taken off.
    assert.equal(rows.Hops.box, '1400');
    assert.equal(rows.Malt.box, '1800');
    assert.equal(rows.Rye.box, '2000');
    // A contract set up at zero is a contract, at zero.
    assert.match(rows.Yeast.inGame, /^0 a week$/);
    assert.equal(rows.Yeast.box, '300');
    const hops = (await actions(page)).find(a => a[0] === 'Hops');
    assert.deepEqual(hops, ['Hops', 1000, 1400, 'smart']);
    const reason = await page.evaluate(() => window.fixtureActions.find(a => a.item === 'Hops').reason);
    assert.match(reason, /^Set Smart Delivery stock at Pier 1 to 1,?400\./);
    assert.match(await box(page, 'Rye').getAttribute('data-tip'), /The board suggests 2,?000: the level at Pier 1/);
  } finally { await page.close(); }
});

const KEY = 'ba_import_set_v2:set-fixture';
for(const value of [900, 2000]){
  test(`a figure typed before the game moved is forgotten (${value === 900 ? 'moved onto it' : 'moved elsewhere'})`, async () => {
    // Typed when the game held 700; the game now holds 900.
    const page = await board({before: [KEY, JSON.stringify({'["depot#0","sugar"]': {value, inGame: 700}})]});
    try{
      const sugar = (await cells(page)).find(r => r.item === 'Sugar');
      assert.deepEqual([sugar.box, sugar.changed], ['1400', true]);
      assert.match(sugar.verdict, /raise/);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), '{}');
    } finally { await page.close(); }
  });
}

test('typing the figure in game turns the suggestion down and it stays down', async () => {
  const page = await board();
  try{
    await box(page, 'Sugar').fill('900');
    await box(page, 'Sugar').press('Enter');
    await page.waitForFunction(() => document.querySelector('#importPlan .imp-reset'));
    let sugar = (await cells(page)).find(r => r.item === 'Sugar');
    assert.deepEqual([sugar.box, sugar.changed], ['900', false]);
    assert.deepEqual(await actions(page), []);
    // A redraw keeps it: the game has not moved since it was typed.
    await page.evaluate(() => { drawLogistics(); wireAll(); });
    sugar = (await cells(page)).find(r => r.item === 'Sugar');
    assert.equal(sugar.box, '900');
    assert.deepEqual(JSON.parse(await page.evaluate(key => localStorage.getItem(key), KEY)),
      {'["depot#0","sugar"]': {value: 900, inGame: 900}});
  } finally { await page.close(); }
});

test('figures stored by the first version are not read', async () => {
  const page = await board({before: ['ba_import_set_v1:set-fixture', JSON.stringify({'["depot#0","flour"]': 6000})]});
  try{
    assert.equal((await cells(page)).find(r => r.item === 'Flour').box, '5000');
  } finally { await page.close(); }
});

test('a paused row says it is paused, not that nothing asks for a change', async () => {
  const data = fixture();
  data.supply.factories.depots[0].salt = {...data.supply.factories.depots[0].salt, weekly: 0, pausedWeekly: 700};
  const page = await board({data});
  try{
    const tip = await box(page, 'Salt').getAttribute('data-tip');
    assert.match(tip, /paused contract: resume it in game/);
    assert.doesNotMatch(tip, /nothing here asks/);
  } finally { await page.close(); }
});

test('the box and its reset say what they hold in each state', async () => {
  const page = await board();
  try{
    const tip = item => box(page, item).getAttribute('data-tip');
    assert.match(await tip('Sugar'), /^The board suggests 1,?400: the level at which the week's deliveries/);
    assert.match(await tip('Flour'), /^The figure in game/);
    await box(page, 'Flour').fill('6000');
    await box(page, 'Flour').press('Enter');
    await page.waitForFunction(() => document.querySelector('#importPlan .imp-reset'));
    assert.match(await tip('Flour'), /^Your own figure\. The game holds 5,?000/);
    const reset = page.locator('#importPlan .imp-reset');
    assert.match(await reset.getAttribute('aria-label'), /^Back to the figure in game, 5,?000, for Flour$/);
    await box(page, 'Sugar').fill('2000');
    await box(page, 'Sugar').press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#importPlan .imp-reset').length === 2);
    const sugarReset = page.locator('#importPlan tbody tr', {hasText: 'Sugar'}).locator('.imp-reset');
    assert.match(await sugarReset.getAttribute('aria-label'), /^Back to the board's suggestion, 1,?400, for Sugar$/);
    assert.match(await page.locator('#importPlan thead th', {hasText: 'Set to'}).first().getAttribute('data-tip'), /Enter your own figure/);
  } finally { await page.close(); }
});

test('the imports table scrolls inside its box, not the page, on a phone', async () => {
  const page = await board({width: 390});
  try{
    const sizes = await page.evaluate(() => ({page: document.documentElement.scrollWidth, view: innerWidth}));
    assert.ok(sizes.page <= sizes.view, JSON.stringify(sizes));
  } finally { await page.close(); }
});
