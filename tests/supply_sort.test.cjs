// Sortable Supply tables (R13): the Shops table, each depot's table on
// Warehouses, and a factory's lines and inputs on Factories.
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
  const result = spawnSync(process.env.PYTHON || 'python', ['-c',
    'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
  {cwd: root, maxBuffer: 4 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8')
    : result.stdout.toString();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

const imp = use => ({st: 'covered', why: null, lvl: 'ok', role: 'depot', cad: 'weekly', use, need: use,
  have: use, setTo: null, parts: {lines: 0, sites: use, route: 0}, imp: true});
/* Three shops, two depots and a factory, all synthetic. The shop rows are
   listed in an order no column sorts them into, so every sort shows. */
const fixture = () => ({
  meta: {character: 'sort-fixture', locale: true},
  businesses: [
    {key: 'b0', name: 'Birch', type: 'Grocery store', status: 'retail', address: '1 Main St', lines: []},
    {key: 'b1', name: 'Alder', type: 'Grocery store', status: 'retail', address: '2 Main St', lines: []},
    {key: 'b2', name: 'Cedar', type: 'Grocery store', status: 'retail', address: '3 Main St', lines: []},
    {key: 'd3', name: 'North Depot', type: 'Warehouse', status: 'support', address: '4 North St', lines: [
      {slug: 'apple', item: 'Apple', units: 120}, {slug: 'pear', item: 'Pear', units: 900},
      {slug: 'fig', item: 'Fig', units: 40}]},
    {key: 'd4', name: 'South Depot', type: 'Warehouse', status: 'support', address: '5 South St', lines: [
      {slug: 'kiwi', item: 'Kiwi', units: 700}, {slug: 'lime', item: 'Lime', units: 10},
      {slug: 'kale', item: 'Kale', units: 0}]},
    {key: 'f5', name: 'Juice Factory', type: 'Factory', status: 'support', address: '6 Mill St', lines: []},
  ],
  supply: {
    shops: [
      {s: 0, item: 'Milk', slug: 'milk', sold: 300, peakDay: 'Friday', peakSold: 420, target: 500, pressure: 84, level: 'ok', stock: 200},
      {s: 1, item: 'Bread', slug: 'bread', sold: 120, peakDay: 'Saturday', peakSold: 150, target: 100, pressure: 150, level: 'critical', stock: 40},
      {s: 2, item: 'Eggs', slug: 'eggs', sold: 80, peakDay: null, peakSold: 80, target: 0, pressure: null, level: 'critical', stock: 10},
      {s: 0, item: 'Apples', slug: 'apples', sold: 500, peakDay: 'Sunday', peakSold: 610, target: 700, pressure: 87, level: 'ok', stock: 650},
    ],
    idle: [], idleWeeks: 5, imports: [], graph: {nodes: [], links: []},
    factories: {character: 'sort-fixture', machines: 4, unnamed: 0,
      sites: [{s: 5, machines: 4, unnamed: [], lines: [
        {item: 'Juice', slug: 'juice', basis: 'table', workstation: 'Juicer', slots: [1], machines: 2, rate: 30, hoursWeek: 168, fullWeek: 336, gaps: [], makes: 1440, atRoster: 720, ships: 1440, stock: 500, toCity: 1200, toPier: 0},
        {item: 'Cordial', slug: 'cordial', basis: 'table', workstation: 'Juicer', slots: [2], machines: 2, rate: 30, hoursWeek: 169, fullWeek: 336, gaps: [], makes: 1440, atRoster: 720, ships: 1440, stock: 500, toCity: 0, toPier: 0}], needs: [
        {item: 'Apple', slug: 'apple', perDay: 50, perWeek: 350, from: 3, lines: ['Juice'], waitingOn: [], madeAt: [],
          target: 100, known: true, arrives: 60, stock: 10},
        {item: 'Pear', slug: 'pear', perDay: 200, perWeek: 1400, from: 3, lines: ['Juice'], waitingOn: [], madeAt: [],
          target: 250, known: true, arrives: 140, stock: 10},
        {item: 'Fig', slug: 'fig', perDay: 20, perWeek: 140, from: 3, lines: ['Juice'], waitingOn: [], madeAt: [],
          target: 0, known: false, arrives: 0, stock: 10}]}],
      depots: {3: {apple: {weekly: 800}, pear: {weekly: 2400}, fig: {weekly: 200}},
        4: {kiwi: {weekly: 300}, lime: {weekly: 900}, kale: {weekly: 100}}},
      depotOther: {3: {apple: 400, pear: 1000, fig: 50}, 4: {kiwi: 200, lime: 800}}},
    /* Python's verdict on each depot line (supplyFact): Uses / week is the
       fact's use. Kale is used by nothing. */
    facts: {
      3: {apple: imp(750), pear: imp(2400), fig: imp(190)},
      4: {kiwi: imp(200), lime: imp(800), kale: imp(0)},
    },
  },
});

async function board(data = fixture()){
  const page = await browser.newPage({viewport: {width: 1280, height: 1100}});
  await page.route('https://**', route => route.abort());
  await page.setContent(html, {waitUntil: 'load'});
  await page.evaluate(data => {
    D = data; sbWhich = 'all'; supplySort = {}; supplyAuto = false; sub.supply = 'shops';
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    drawSupplyStrip(); drawShopsTab(); drawWarehousesTab(); drawFactoriesTab(); wireAll();
  }, data);
  return page;
}
// The Product cell of a Shops row names the product (the tick and the shop come first).
const products = page => page.$$eval('#secShops tbody tr', rows => rows.map(r => r.cells[2].textContent.trim()));
const header = (page, label) => page.locator('#secShops thead th', {hasText: label});
const shopNote = page => page.locator('#secShops .sb-tw .sb-more').textContent();
/* Each depot is its own table; the product cell opens with the material. */
const depots = page => page.$$eval('#secWarehouses .sb-obj', list =>
  list.map(d => [...d.querySelectorAll('tbody tr')].map(r => r.cells[1].firstChild.textContent.trim())));
const inputs = page => page.$$eval('#secFactories [data-sb-table="factory-inputs"] tbody tr', rows =>
  rows.map(r => r.cells[1].firstChild.textContent.trim()));

test('a Shops header sorts high to low, then low to high, then back to the usual order', async () => {
  const page = await board();
  try{
    // Usual order: worst word first, then the tightest shelf.
    assert.deepEqual(await products(page), ['Bread', 'Apples', 'Milk', 'Eggs']);
    await header(page, 'Pressure').click();
    // A shelf with no plan has no pressure to rank, so it stays at the bottom.
    assert.deepEqual(await products(page), ['Bread', 'Apples', 'Milk', 'Eggs']);
    assert.equal(await header(page, 'Pressure').getAttribute('aria-sort'), 'descending');
    assert.match(await shopNote(page), /Sorted by Pressure, high to low/);
    await header(page, 'Pressure').click();
    assert.deepEqual(await products(page), ['Milk', 'Apples', 'Bread', 'Eggs']);
    assert.equal(await header(page, 'Pressure').getAttribute('aria-sort'), 'ascending');
    await page.locator('#secShops [data-usual]').click();
    assert.deepEqual(await products(page), ['Bread', 'Apples', 'Milk', 'Eggs']);
    assert.equal(await header(page, 'Pressure').getAttribute('aria-sort'), 'none');
    assert.equal(await page.locator('#secShops .sb-tw .sb-more').count(), 0);
  } finally { await page.close(); }
});

test('a name column reads A to Z first, and equal names keep the usual order', async () => {
  const page = await board();
  try{
    await header(page, 'Product').click();
    assert.deepEqual(await products(page), ['Apples', 'Bread', 'Eggs', 'Milk']);
    assert.match(await shopNote(page), /Sorted by Product, A to Z/);
    await header(page, 'Shop').click();
    // Birch runs Apples and Milk, in that order in the tab's own ranking.
    assert.deepEqual(await products(page), ['Bread', 'Apples', 'Milk', 'Eggs']);
  } finally { await page.close(); }
});

test('a header sorts from the keyboard and keeps the focus', async () => {
  const page = await board();
  try{
    await header(page, 'Sells / day').locator('button').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await products(page), ['Apples', 'Milk', 'Bread', 'Eggs']);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Sells / day');
    await page.keyboard.press('Space');
    assert.deepEqual(await products(page), ['Eggs', 'Bread', 'Milk', 'Apples']);
    assert.equal(await page.evaluate(() => document.activeElement.closest('th')?.getAttribute('aria-sort')), 'ascending');
  } finally { await page.close(); }
});

test('every shelf is on the table: no cap holds rows back', async () => {
  const data = fixture();
  data.supply.shops = Array.from({length: 50}, (_, i) => ({s: i % 3, item: `Item ${String(i).padStart(2, '0')}`, slug: `i${i}`,
    sold: 10, peakDay: 'Monday', peakSold: 10, target: 10, pressure: 149 - i, level: 'critical', stock: 1}));
  const page = await board(data);
  try{
    assert.equal((await products(page)).length, 50);
    await header(page, 'Pressure').click();
    await header(page, 'Pressure').click();
    const low = await products(page);
    assert.deepEqual([low[0], low[49]], ['Item 49', 'Item 00']);
  } finally { await page.close(); }
});

test('usual order from the keyboard puts the focus on the column it un-sorted', async () => {
  const page = await board();
  try{
    await header(page, 'Pressure').click();
    await page.locator('#secShops [data-usual]').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await products(page), ['Bread', 'Apples', 'Milk', 'Eggs']);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Pressure');
  } finally { await page.close(); }
});

test('usual order clicked with the mouse leaves the focus where the click put it', async () => {
  const page = await board();
  try{
    await header(page, 'Pressure').click();
    await page.locator('#secShops [data-usual]').click();
    assert.deepEqual(await products(page), ['Bread', 'Apples', 'Milk', 'Eggs']);
    // Not carried back up to a header the reader did not ask for.
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('thead')), false);
  } finally { await page.close(); }
});

test('depot lines sort inside each depot, and the depots keep their order', async () => {
  const page = await board();
  try{
    // Usual order: most used a week first.
    assert.deepEqual(await depots(page), [['Pear', 'Apple', 'Fig'], ['Lime', 'Kiwi', 'Kale']]);
    const first = page.locator('#secWarehouses .sb-obj').first();
    await first.locator('thead th', {hasText: 'On hand'}).click();
    assert.deepEqual(await depots(page), [['Pear', 'Apple', 'Fig'], ['Kiwi', 'Lime', 'Kale']]);
    // Every depot's header shows the one order.
    assert.deepEqual(await page.$$eval('#secWarehouses thead th[data-dir]', th => th.map(x => x.textContent)), ['On hand', 'On hand']);
    await page.locator('#secWarehouses .sb-obj').first().locator('thead th', {hasText: 'Product'}).click();
    assert.deepEqual(await depots(page), [['Apple', 'Fig', 'Pear'], ['Kale', 'Kiwi', 'Lime']]);
    assert.match(await page.locator('#secWarehouses .sb-more').first().textContent(), /Sorted by Product, A to Z/);
    await page.locator('#secWarehouses [data-usual]').first().click();
    assert.deepEqual(await depots(page), [['Pear', 'Apple', 'Fig'], ['Lime', 'Kiwi', 'Kale']]);
    // What to set a line to is an action, not a figure; the Shops order is untouched.
    assert.equal(await page.locator('#secWarehouses thead th', {hasText: 'Order / top-up'}).first().locator('button').count(), 0);
    assert.equal(await page.locator('#secShops thead th[data-dir]').count(), 0);
  } finally { await page.close(); }
});

test('an import nothing uses sorts as a dash, not as a zero', async () => {
  const page = await board();
  try{
    const south = page.locator('#secWarehouses .sb-obj').nth(1);
    const used = south.locator('thead th', {hasText: 'Uses / week'});
    await used.click();
    assert.deepEqual((await depots(page))[1], ['Lime', 'Kiwi', 'Kale']);
    await used.click();
    assert.deepEqual((await depots(page))[1], ['Kiwi', 'Lime', 'Kale']);
  } finally { await page.close(); }
});

test('factory inputs sort inside their factory, a route with no reading last', async () => {
  const page = await board();
  try{
    assert.deepEqual(await inputs(page), ['Pear', 'Apple', 'Fig']);
    const arrives = page.locator('#secFactories thead th', {hasText: 'Arrived / day'});
    await arrives.click();
    assert.deepEqual(await inputs(page), ['Pear', 'Apple', 'Fig']);
    await arrives.click();
    assert.deepEqual(await inputs(page), ['Apple', 'Pear', 'Fig']);
    assert.match(await page.locator('#secFactories [data-sb-table="factory-inputs"] .sb-more').textContent(), /Sorted by Arrived \/ day, low to high/);
    // The lines keep their own order.
    assert.equal(await page.locator('#secFactories [data-sb-table="factory-lines"] thead th[data-dir]').count(), 0);
  } finally { await page.close(); }
});

test('the Status column sorts worst first, by the facts Python sent', async () => {
  const data = fixture();
  const shelf = (st, lvl) => ({st, why: null, lvl, role: 'shelf', cad: 'daily', use: 1, need: 1, have: 1, setTo: null});
  Object.assign(data.supply.facts, {
    0: {milk: shelf('covered', 'ok'), apples: shelf('tight', 'warn')},
    1: {bread: shelf('short', 'critical')},
    2: {eggs: shelf('noplan', 'critical')},
  });
  const page = await board(data);
  try{
    await header(page, 'Status').click();
    assert.deepEqual(await products(page), ['Eggs', 'Bread', 'Apples', 'Milk']);
    assert.match(await shopNote(page), /Sorted by Status, worst first/);
    await header(page, 'Status').click();
    assert.deepEqual(await products(page), ['Milk', 'Apples', 'Bread', 'Eggs']);
  } finally { await page.close(); }
});
