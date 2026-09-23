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

async function board({width = 1280, view = 'all', storage = true, page: given} = {}){
  const page = given || await browser.newPage({viewport: {width, height: 1000}});
  if(!given){
    await page.route('https://**', route => route.abort());
    await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
    await page.goto('http://board.test/');
  }
  await page.evaluate(([data, view, storage]) => {
    if(!storage) Object.defineProperty(window, 'localStorage', {get(){ throw new Error('denied'); }});
    D = data; logisticsView = view; supplySort = {};
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    const draw = drawOrderChecklist;
    drawOrderChecklist = (rows, f) => { window.fixtureActions = rows; draw(rows, f); };
    drawLogistics(); wireAll();
  }, [fixture(), view, storage]);
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
        const saved = await page.evaluate(() => localStorage.getItem('ba_import_set_v1:set-fixture'));
        assert.deepEqual(JSON.parse(saved), {'["depot#0","flour"]': 6000});
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
    assert.equal(await page.evaluate(() => localStorage.getItem('ba_import_set_v1:set-fixture')), '{}');
  } finally { await page.close(); }
});

test('the imports table scrolls inside its box, not the page, on a phone', async () => {
  const page = await board({width: 390});
  try{
    const sizes = await page.evaluate(() => ({page: document.documentElement.scrollWidth, view: innerWidth}));
    assert.ok(sizes.page <= sizes.view, JSON.stringify(sizes));
  } finally { await page.close(); }
});
