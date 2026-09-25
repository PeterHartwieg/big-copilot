// The import lines on Supply › Warehouses: Smart Delivery levels, the
// editable Set to box, and how a typed figure reaches the change checklist.
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
/* A depot line's fact, as _supply_facts() writes it for Weekly imports. */
const depotFact = (st, use, extra = {}) => ({st, why: null, lvl: st === 'covered' ? 'ok' : 'warn', role: 'depot',
  cad: 'weekly', use, need: use, have: use, setTo: null, parts: {lines: 0, sites: use, route: 0}, imp: true, ...extra});
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
    /* Python's verdict on each line (supplyFact): the figure to set is the
       fact's, the board only keeps the book around it. */
    facts: {0: {
      sugar: depotFact('short', 1400, {why: 'order', lvl: 'critical', setTo: 1400}),
      flour: depotFact('covered', 1000),
      salt: depotFact('covered', 650),
    }},
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
    D = data; sbWhich = view; supplySort = {}; supplyAuto = false; sub.supply = 'warehouses';
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    drawSupplyStrip(); drawWarehousesTab(); wireAll();
  }, [data, view, storage, before]);
  return page;
}
/* A Warehouses row: its product, the figure in game and what is said around
   the box (the Order / top-up cell, less its chips and contract list), the
   box, and the cell with the row's word. */
const cells = page => page.$$eval('#secWarehouses tr[data-slug]', rows => rows.map(r => {
  const text = (el, drop = '') => {
    const c = el.cloneNode(true);
    if(drop) c.querySelectorAll(drop).forEach(x => x.remove());
    const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT), bits = [];
    while(w.nextNode()) bits.push(w.currentNode.textContent);
    return bits.join(' ').replace(/\s+/g, ' ').trim();
  };
  return {
    item: r.cells[1].firstChild.textContent.trim(),
    inGame: text(r.cells[6], '.imp-contracts, .chip, .up, .gw-short'),
    box: r.cells[6].querySelector('input')?.value ?? null,
    verdict: `${text(r.cells[6])} ${text(r.cells[8])}`,
    changed: r.classList.contains('imp-changed'),
  };
}));
const actions = page => page.evaluate(() => sbData().rows
  .filter(a => a.kind === 'Weekly imports').map(a => [a.item, a.current, a.proposed, a.mode]));
const box = (page, item) => page.locator('#secWarehouses tr[data-slug]', {hasText: item}).locator('input');

test('the table reads a Smart Delivery level apart from a weekly order', async () => {
  const page = await board();
  try{
    const heads = await page.$$eval('#secWarehouses thead th', th => th.slice(1).map(x => x.textContent.trim()));
    assert.deepEqual(heads, ['Product', 'On hand', 'Draw / day', 'Busiest', 'Cover', 'Order / top-up', 'Uses / week', 'Status']);
    const rows = Object.fromEntries((await cells(page)).map(r => [r.item, r]));
    // The figure in game, the arrow, the box: a level is kept in stock, an order is a week's.
    assert.match(rows.Sugar.inGame, /^900 in stock$/);
    // Nothing to change: the box alone holds the figure in game.
    assert.match(rows.Salt.inGame, /^a week$/);
    assert.equal(rows.Salt.box, '700');
    // Sugar's level is short of its week: the box holds the suggestion.
    assert.equal(rows.Sugar.box, '1400');
    assert.equal(rows.Sugar.changed, true);
    assert.match(rows.Sugar.verdict, /raise/);
    // A high level only holds stock: covered, never "could lower".
    assert.equal(rows.Flour.box, '5000');
    assert.equal(rows.Flour.changed, false);
    assert.match(rows.Flour.verdict, /covered/);
    assert.doesNotMatch(await page.locator('#secWarehouses').textContent(), /could lower/);
    // Two contracts on one line are listed in plan order under the material.
    const sugar = await page.locator('#secWarehouses tr[data-slug]', {hasText: 'Sugar'}).locator('.imp-contracts').textContent();
    assert.match(sugar, /1\. Pier 1 · keeps 900 in stock\s*2\. Pier 2 · 500 a week · paused/);
    assert.deepEqual(await actions(page), [['Sugar', 900, 1400, 'smart']]);
    assert.match(await page.evaluate(() => orderChecklistText(sbData().rows, 'Fixture')), /Smart Delivery stock 900 -> 1400 units/);
  } finally { await page.close(); }
});

for(const storage of [true, false]){
  test(`a typed figure is kept, shown as a change and reaches the checklist (${storage ? 'with' : 'without'} storage)`, async () => {
    const page = await board({view: 'changes', storage});
    try{
      assert.deepEqual((await cells(page)).map(r => r.item), ['Sugar']);
      await page.locator('#sbMode').getByText('Everything').click();
      await box(page, 'Flour').fill('6000');
      await box(page, 'Flour').press('Enter');
      await page.waitForFunction(() => document.querySelector('#secWarehouses .imp-reset'));
      const flour = (await cells(page)).find(r => r.item === 'Flour');
      assert.deepEqual([flour.box, flour.changed], ['6000', true]);
      assert.deepEqual(await actions(page), [['Sugar', 900, 1400, 'smart'], ['Flour', 5000, 6000, 'smart']]);
      // The edited row stays in the "Needs a change" view.
      await page.locator('#sbMode').getByText('Needs a change').click();
      assert.deepEqual((await cells(page)).map(r => r.item), ['Sugar', 'Flour']);
      if(storage){
        const saved = await page.evaluate(() => localStorage.getItem('ba_import_set_v2:set-fixture'));
        // What was typed, and what the game held when it was.
        assert.deepEqual(JSON.parse(saved), {'["depot#0","flour"]': {value: 6000, inGame: 5000}});
      }
      // Reset puts the suggestion back and the row leaves the view.
      await page.locator('#secWarehouses .imp-reset').click();
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
    await page.waitForFunction(() => document.querySelector('#secWarehouses .imp-reset'));
    await page.reload();
    await board({page});
    assert.equal((await cells(page)).find(r => r.item === 'Sugar').box, '1800');
    assert.deepEqual((await actions(page))[0], ['Sugar', 900, 1800, 'smart']);
    await box(page, 'Sugar').fill('1400');
    await box(page, 'Sugar').press('Enter');
    await page.waitForFunction(() => !document.querySelector('#secWarehouses .imp-reset'));
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
    {slug: 'yeast', item: 'Yeast', units: 0}, {slug: 'rye', item: 'Rye', units: 0},
    {slug: 'oats', item: 'Oats', units: 0}]);
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
    // Plain 1,000 first exactly reaches the level of 1,000.
    oats: {weekly: 1000, pausedWeekly: 0, smart: true, target: 1000, plain: 1000, plainBefore: 1000, plainAfter: 0,
      levelImporter: 'Pier 1', levelAt: 1, pass: [{amount: 1000, smart: false}, {amount: 1000, smart: true}],
      arrivedLastWeek: 1000, contracts: [contractOf(11, 'Pier 2', false, 1000), contractOf(12, 'Pier 1', true, 1000)]},
    // Set up at zero, nothing brought.
    yeast: {weekly: 0, pausedWeekly: 0, zeroOnly: true, smart: false, target: null, plain: 0, plainAfter: 0,
      arrivedLastWeek: 0, contracts: [contractOf(8, 'Pier 1', false, 0)]},
  });
  Object.assign(data.supply.factories.depotOther[0], {hops: 1800, malt: 1800, yeast: 300, rye: 2000});
  // Python replays each pass for the level a week needs; the board shows its figure.
  Object.assign(data.supply.facts[0], {
    hops: depotFact('short', 1800, {why: 'order', setTo: 1400}),
    malt: depotFact('short', 1800, {why: 'order', setTo: 1800}),
    rye: depotFact('short', 2000, {why: 'order', setTo: 2000}),
    oats: depotFact('covered', 900),
    yeast: depotFact('short', 300, {why: 'order', setTo: 300}),
  });
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
    // Delivered first and already above the level: the level brings nothing.
    assert.match(rows.Rye.inGame, /1,400 a week delivered first already passes it$/);
    assert.doesNotMatch(rows.Rye.inGame, /plus/);
    // Exactly equal: it reaches the level rather than passing it.
    assert.match(rows.Oats.inGame, /1,000 a week delivered first already reaches it$/);
    // The level a week needs is the fact's: Python replays the pass.
    assert.equal(rows.Hops.box, '1400');
    assert.equal(rows.Malt.box, '1800');
    assert.equal(rows.Rye.box, '2000');
    // A contract set up at zero is a contract, at zero.
    assert.match(rows.Yeast.inGame, /^0 a week$/);
    assert.equal(rows.Yeast.box, '300');
    const hops = (await actions(page)).find(a => a[0] === 'Hops');
    assert.deepEqual(hops, ['Hops', 1000, 1400, 'smart']);
    const reason = await page.evaluate(() => sbData().rows.find(a => a.item === 'Hops').reason);
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
    await page.waitForFunction(() => document.querySelector('#secWarehouses .imp-reset'));
    let sugar = (await cells(page)).find(r => r.item === 'Sugar');
    assert.deepEqual([sugar.box, sugar.changed], ['900', false]);
    assert.deepEqual(await actions(page), []);
    // A redraw keeps it: the game has not moved since it was typed.
    await page.evaluate(() => { drawWarehousesTab(); wireAll(); });
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
    await page.waitForFunction(() => document.querySelector('#secWarehouses .imp-reset'));
    assert.match(await tip('Flour'), /^Your own figure\. The game holds 5,?000/);
    const reset = page.locator('#secWarehouses .imp-reset');
    assert.match(await reset.getAttribute('aria-label'), /^Back to the figure in game, 5,?000, for Flour$/);
    await box(page, 'Sugar').fill('2000');
    await box(page, 'Sugar').press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#secWarehouses .imp-reset').length === 2);
    const sugarReset = page.locator('#secWarehouses tr[data-slug]', {hasText: 'Sugar'}).locator('.imp-reset');
    assert.match(await sugarReset.getAttribute('aria-label'), /^Back to the board's suggestion, 1,?400, for Sugar$/);
    assert.match(await page.locator('#secWarehouses thead th', {hasText: 'Order / top-up'}).first().getAttribute('data-tip'), /the figure to type/);
  } finally { await page.close(); }
});

test('the imports table scrolls inside its box, not the page, on a phone', async () => {
  const page = await board({width: 390});
  try{
    const sizes = await page.evaluate(() => ({page: document.documentElement.scrollWidth, view: document.documentElement.clientWidth}));
    assert.ok(sizes.page <= sizes.view, JSON.stringify(sizes));
  } finally { await page.close(); }
});

// Today's Plan imports card is painted by the checklist from the same rows and
// ticks, so its count is always what the strip has left to type.
test('the Plan imports card counts what the checklist has to do', async () => {
  const page = await board();
  try{
    const card = () => page.evaluate(() => [
      document.querySelector('#planImportsCard .soon').textContent,
      document.querySelector('#planImportsCard .soon').className,
      document.querySelector('#planImportsCard .what').textContent,
      document.querySelector('#sbTrayText').textContent]);
    const [badge, cls, what, todo] = await card();
    assert.deepEqual([badge, cls, todo], ['1 TO CHANGE', 'soon live', '0 of 1 typed in']);
    assert.match(what, /^Sugar at North Depot: Smart Delivery stock 900 → 1,400\.$/);
    await box(page, 'Flour').fill('6000');
    await box(page, 'Flour').press('Enter');
    await page.waitForFunction(() => document.querySelector('#secWarehouses .imp-reset'));
    assert.deepEqual((await card()).filter((_, i) => i !== 1), ['2 TO CHANGE', '2 changes at North Depot, starting with Sugar.', '0 of 2 typed in']);
    const tick = item => page.locator('#secWarehouses tr[data-slug]', {hasText: item}).locator('.sb-tick').click();
    await tick('Sugar');
    const one = await card();
    assert.deepEqual([one[0], one[3]], ['1 TO CHANGE', '1 of 2 typed in']);
    assert.match(one[2], /^Flour at North Depot: Smart Delivery stock 5,000 → 6,000\.$/);
    await tick('Flour');
    const [done, quiet, doneWhat, doneTodo] = await card();
    assert.deepEqual([done, quiet, doneTodo], ['ALL TICKED', 'soon', '2 of 2 typed in']);
    assert.match(doneWhat, /^You ticked all 2\./);
  } finally { await page.close(); }
});

// A German browser formats toLocaleString() with a full stop. The board pins
// en-US, so a Supply figure reads the same whatever the player's locale.
test('a German browser still reads Supply figures with a comma', async () => {
  const context = await browser.newContext({locale: 'de-DE', viewport: {width: 1280, height: 1000}});
  const page = await board({page: await (async () => {
    const p = await context.newPage();
    await p.route('https://**', route => route.abort());
    await p.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
    await p.goto('http://board.test/');
    return p;
  })()});
  try{
    assert.equal(await page.evaluate(() => (8000).toLocaleString()), '8.000');
    const flour = await page.locator('#secWarehouses tr[data-slug]', {hasText: 'Flour'}).innerText();
    assert.match(flour, /\b2,000\b/);
    assert.match(flour, /1,200 arrived last week/);
    assert.doesNotMatch(flour, /\d\.\d{3}\b/);
    const what = await page.evaluate(() => document.querySelector('#planImportsCard .what').textContent);
    assert.equal(what, 'Sugar at North Depot: Smart Delivery stock 900 → 1,400.');
  } finally { await context.close(); }
});
