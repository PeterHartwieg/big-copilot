// Sortable Supply tables: the five Checks views and the two Orders tables.
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

/* Three shops, two depots and a factory, all synthetic. The shop rows are
   listed in an order no column sorts them into, so every sort shows. */
const fixture = () => ({
  meta: {character: 'sort-fixture'},
  businesses: [
    {key: 'b0', name: 'Birch', type: 'Grocery store', address: '1 Main St', lines: []},
    {key: 'b1', name: 'Alder', type: 'Grocery store', address: '2 Main St', lines: []},
    {key: 'b2', name: 'Cedar', type: 'Grocery store', address: '3 Main St', lines: []},
    {key: 'd3', name: 'North Depot', type: 'Warehouse', address: '4 North St', lines: [
      {slug: 'apple', item: 'Apple', units: 120}, {slug: 'pear', item: 'Pear', units: 900},
      {slug: 'fig', item: 'Fig', units: 40}]},
    {key: 'd4', name: 'South Depot', type: 'Warehouse', address: '5 South St', lines: [
      {slug: 'kiwi', item: 'Kiwi', units: 700}, {slug: 'lime', item: 'Lime', units: 10},
      {slug: 'kale', item: 'Kale', units: 0}]},
    {key: 'f5', name: 'Juice Factory', type: 'Factory', address: '6 Mill St', lines: []},
  ],
  supply: {
    shops: [
      {s: 0, item: 'Milk', sold: 300, peakDay: 'Friday', peakSold: 420, target: 500, pressure: 84, level: 'ok', stock: 200},
      {s: 1, item: 'Bread', sold: 120, peakDay: 'Saturday', peakSold: 150, target: 100, pressure: 150, level: 'critical', stock: 40},
      {s: 2, item: 'Eggs', sold: 80, peakDay: null, peakSold: 80, target: 0, pressure: null, level: 'critical', stock: 10},
      {s: 0, item: 'Apples', sold: 500, peakDay: 'Sunday', peakSold: 610, target: 700, pressure: 87, level: 'ok', stock: 650},
    ],
    idle: [
      {s: 0, item: 'Rice', stock: 5000, perWeek: 500, weeks: 10, dead: false, target: 0},
      {s: 1, item: 'Salt', stock: 900, perWeek: 0, weeks: null, dead: true, target: 0},
      {s: 2, item: 'Tea', stock: 3000, perWeek: 250, weeks: 12, dead: false, target: 400},
    ],
    idleWeeks: 5,
    imports: [],
    factories: {character: 'sort-fixture', machines: 4, unnamed: 0,
      sites: [{s: 5, unnamed: [], lines: [
        {item: 'Juice', slug: 'juice', basis: 'table', workstation: 'Juicer', slots: [1], machines: 2, rate: 30, hoursWeek: 168, fullWeek: 336, gaps: [], makes: 1440, atRoster: 720, ships: 1440, stock: 500, toCity: 1200, toPier: 0},
        {item: 'Cordial', slug: 'cordial', basis: 'table', workstation: 'Juicer', slots: [1], machines: 2, rate: 30, hoursWeek: 169, fullWeek: 336, gaps: [], makes: 1440, atRoster: 720, ships: 1440, stock: 500, toCity: 0, toPier: 0}], needs: [
        {item: 'Apple', slug: 'apple', perDay: 50, perWeek: 350, from: 3, lines: ['Juice'], status: 'ok',
          target: 100, known: true, arrives: 60, level: 'ok'},
        {item: 'Pear', slug: 'pear', perDay: 200, perWeek: 1400, from: 3, lines: ['Juice'], status: 'ok',
          target: 250, known: true, arrives: 140, level: 'ok'},
        {item: 'Fig', slug: 'fig', perDay: 20, perWeek: 140, from: 3, lines: ['Juice'], status: 'ok',
          target: 0, known: false, arrives: 0, level: 'ok'}]}],
      depots: {3: {apple: {weekly: 800}, pear: {weekly: 2400}, fig: {weekly: 200}},
        4: {kiwi: {weekly: 300}, lime: {weekly: 900}, kale: {weekly: 100}}},
      depotOther: {3: {apple: 400, pear: 1000, fig: 50}, 4: {kiwi: 200, lime: 800}}},
  },
});

async function board(data = fixture()){
  const page = await browser.newPage({viewport: {width: 1280, height: 1100}});
  await page.route('https://**', route => route.abort());
  await page.setContent(html, {waitUntil: 'load'});
  await page.evaluate(data => {
    D = data; stockView = 'shops'; showAllStock = true; logisticsView = 'all'; supplySort = {};
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    drawStock(); drawLogistics(); wireAll();
  }, data);
  return page;
}
// The second cell of a Checks row names the product.
const products = page => page.$$eval('#stock tbody tr', rows => rows.map(r => r.cells[1].textContent.trim()));
const header = (page, label) => page.locator('#stock thead th', {hasText: label});
/* Each depot or factory group is its own table; the first cell opens with the
   material, and a top-up names its line under it. */
const groups = (page, host) => page.$$eval(`${host} details.supply-location`, list =>
  list.map(d => [...d.querySelectorAll('tbody tr')].map(r => r.cells[0].firstChild.textContent.trim())));

test('a Checks header sorts high to low, then low to high, then back to the usual order', async () => {
  const page = await board();
  try{
    assert.deepEqual(await products(page), ['Milk', 'Bread', 'Eggs', 'Apples']);
    await header(page, 'Pressure').click();
    // A shelf with no plan has no pressure to rank, so it stays at the bottom.
    assert.deepEqual(await products(page), ['Bread', 'Apples', 'Milk', 'Eggs']);
    assert.equal(await header(page, 'Pressure').getAttribute('aria-sort'), 'descending');
    assert.match(await page.locator('#stockMore').textContent(), /Sorted by Pressure, high to low/);
    await header(page, 'Pressure').click();
    assert.deepEqual(await products(page), ['Milk', 'Apples', 'Bread', 'Eggs']);
    assert.equal(await header(page, 'Pressure').getAttribute('aria-sort'), 'ascending');
    await page.locator('#stockMore [data-usual]').click();
    assert.deepEqual(await products(page), ['Milk', 'Bread', 'Eggs', 'Apples']);
    assert.equal(await header(page, 'Pressure').getAttribute('aria-sort'), 'none');
    assert.doesNotMatch(await page.locator('#stockMore').textContent(), /Sorted by/);
  } finally { await page.close(); }
});

test('a name column reads A to Z first, and equal names keep the usual order', async () => {
  const page = await board();
  try{
    await header(page, 'Product').click();
    assert.deepEqual(await products(page), ['Apples', 'Bread', 'Eggs', 'Milk']);
    assert.match(await page.locator('#stockMore').textContent(), /Sorted by Product, A to Z/);
    await header(page, 'Shop').click();
    // Birch runs Milk and Apples, in that order in the view's own ranking.
    assert.deepEqual(await products(page), ['Bread', 'Milk', 'Apples', 'Eggs']);
  } finally { await page.close(); }
});

test('a holding with nothing flowing out sorts as the deepest cover', async () => {
  const page = await board();
  try{
    await page.locator('#stockTools a[data-id="idle"]').click();
    await header(page, 'Weeks of supply').click();
    assert.deepEqual(await products(page), ['Salt', 'Tea', 'Rice']);
    await header(page, 'Weeks of supply').click();
    assert.deepEqual(await products(page), ['Rice', 'Tea', 'Salt']);
    // Nothing out is a dash in its own column, so there it ranks as no value at
    // all and stays at the bottom whichever way the column points.
    await header(page, 'Out / week').click();
    assert.deepEqual(await products(page), ['Rice', 'Tea', 'Salt']);
    await header(page, 'Out / week').click();
    assert.deepEqual(await products(page), ['Tea', 'Rice', 'Salt']);
  } finally { await page.close(); }
});

test('each Checks view keeps its own order', async () => {
  const page = await board();
  try{
    await header(page, 'Pressure').click();
    await page.locator('#stockTools a[data-id="idle"]').click();
    assert.deepEqual(await products(page), ['Rice', 'Salt', 'Tea']);
    assert.equal(await page.locator('#stock thead th[data-dir]').count(), 0);
    await page.locator('#stockTools a[data-id="shops"]').click();
    assert.deepEqual(await products(page), ['Bread', 'Apples', 'Milk', 'Eggs']);
    // A finding link switches the view without the tabs; the order still fits it.
    await page.evaluate(() => { stockView = 'idle'; drawStock(); wireAll(); });
    assert.deepEqual(await products(page), ['Rice', 'Salt', 'Tea']);
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

test('a sort runs before the 40-row cap', async () => {
  const data = fixture();
  data.supply.shops = Array.from({length: 50}, (_, i) => ({s: i % 3, item: `Item ${String(i).padStart(2, '0')}`,
    sold: 10, peakDay: 'Monday', peakSold: 10, target: 10, pressure: 149 - i, level: 'critical', stock: 1}));
  const page = await board(data);
  try{
    const rows = await products(page);
    assert.equal(rows.length, 40);
    assert.equal(rows[0], 'Item 00');
    await header(page, 'Pressure').click();
    await header(page, 'Pressure').click();
    const low = await products(page);
    // Lowest first across all fifty, not the forty that were on screen.
    assert.equal(low.length, 40);
    assert.deepEqual([low[0], low[39]], ['Item 49', 'Item 10']);
    // Every row here is worth reading, so there is no "show all" to explain the
    // ten that are missing: the line says the table is holding them back.
    assert.match(await page.locator('#stockMore').textContent(), /first 40 of 50 shown/);
    assert.equal(await page.locator('#stockToggle').count(), 0);
  } finally { await page.close(); }
});

test('a dash is last in every column that draws one, and equal percents keep their order', async () => {
  const page = await board();
  try{
    await page.locator('#stockTools a[data-id="lines"]').click();
    // A line's cell carries its recipe chip and workstation under the name.
    const lines = () => page.$$eval('#stock tbody tr', rows =>
      rows.map(r => r.cells[1].firstChild.textContent.trim()));
    // Cordial ships nothing to the city, so its Top-up out is a dash.
    await header(page, 'Top-up out').click();
    assert.deepEqual(await lines(), ['Juice', 'Cordial']);
    await header(page, 'Top-up out').click();
    assert.deepEqual(await lines(), ['Juice', 'Cordial']);
    // 168 and 169 hours of a 336-hour week both read 50%, so neither outranks
    // the other and the view's own order stands.
    await header(page, 'Staffed').click();
    assert.deepEqual(await lines(), ['Juice', 'Cordial']);
    await header(page, 'Staffed').click();
    assert.deepEqual(await lines(), ['Juice', 'Cordial']);
  } finally { await page.close(); }
});

test('an import nothing draws sorts as a dash, not as a zero', async () => {
  const page = await board();
  try{
    const south = page.locator('#importPlan details.supply-location').nth(1);
    await south.locator('summary').click();
    assert.deepEqual((await groups(page, '#importPlan'))[1], ['Lime', 'Kiwi', 'Kale']);
    const used = south.locator('thead th', {hasText: 'Used / week'});
    await used.click();
    assert.deepEqual((await groups(page, '#importPlan'))[1], ['Lime', 'Kiwi', 'Kale']);
    await used.click();
    assert.deepEqual((await groups(page, '#importPlan'))[1], ['Kiwi', 'Lime', 'Kale']);
  } finally { await page.close(); }
});

test('usual order from the keyboard puts the focus on the column it un-sorted', async () => {
  const page = await board();
  try{
    await header(page, 'Pressure').click();
    await page.locator('#stockMore [data-usual]').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await products(page), ['Milk', 'Bread', 'Eggs', 'Apples']);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Pressure');
  } finally { await page.close(); }
});

test('usual order in Orders keeps the focus out of a folded depot', async () => {
  const page = await board();
  try{
    const north = page.locator('#importPlan details.supply-location').first();
    // Open the second depot, so there is a header left once the first is folded.
    await page.locator('#importPlan details.supply-location').nth(1).locator('summary').click();
    await north.locator('thead th', {hasText: 'At depot'}).click();
    // Fold the depot whose header was used, so its copy is no longer on screen.
    await north.locator('summary').click();
    assert.equal(await north.evaluate(d => d.open), false);
    await page.locator('#importPlan .sechead [data-usual]').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await groups(page, '#importPlan'), [['Pear', 'Apple', 'Fig'], ['Lime', 'Kiwi', 'Kale']]);
    const landed = await page.evaluate(() => {
      const el = document.activeElement;
      return {text: el?.textContent, shown: !!el?.offsetParent,
        depot: el?.closest('details')?.querySelector('.location-name')?.textContent};
    });
    assert.equal(landed.text, 'At depot');
    assert.equal(landed.shown, true);
    assert.match(landed.depot, /South Depot/);
  } finally { await page.close(); }
});

test('usual order with every depot folded hands the focus to a depot, not the page', async () => {
  const page = await board();
  try{
    const north = page.locator('#importPlan details.supply-location').first();
    await north.locator('thead th', {hasText: 'At depot'}).click();
    await north.locator('summary').click();
    assert.deepEqual(await page.$$eval('#importPlan details.supply-location', d => d.map(x => x.open)), [false, false]);
    await page.locator('#importPlan .sechead [data-usual]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'SUMMARY');
    assert.match(await page.evaluate(() => document.activeElement?.textContent), /North Depot/);
  } finally { await page.close(); }
});

test('usual order clicked with the mouse leaves the focus where the click put it', async () => {
  const page = await board();
  try{
    await header(page, 'Pressure').click();
    await page.locator('#stockMore [data-usual]').click();
    assert.deepEqual(await products(page), ['Milk', 'Bread', 'Eggs', 'Apples']);
    // Not carried back up to a header the reader did not ask for.
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('thead')), false);
  } finally { await page.close(); }
});

test('imports sort inside each depot, and the depots keep their order', async () => {
  const page = await board();
  try{
    // Usual order: most used a week first.
    assert.deepEqual(await groups(page, '#importPlan'), [['Pear', 'Apple', 'Fig'], ['Lime', 'Kiwi', 'Kale']]);
    const at = page.locator('#importPlan details.supply-location').first().locator('thead th', {hasText: 'At depot'});
    await at.click();
    assert.deepEqual(await groups(page, '#importPlan'), [['Pear', 'Apple', 'Fig'], ['Kiwi', 'Lime', 'Kale']]);
    // Every depot's header shows the one order.
    assert.deepEqual(await page.$$eval('#importPlan thead th[data-dir]', th => th.map(x => x.textContent)), ['At depot', 'At depot']);
    await page.locator('#importPlan details.supply-location').first().locator('thead th', {hasText: 'Material'}).click();
    assert.deepEqual(await groups(page, '#importPlan'), [['Apple', 'Fig', 'Pear'], ['Kale', 'Kiwi', 'Lime']]);
    assert.match(await page.locator('#importPlan .sechead').textContent(), /Sorted by Material, A to Z/);
    await page.locator('#importPlan .sechead [data-usual]').click();
    assert.deepEqual(await groups(page, '#importPlan'), [['Pear', 'Apple', 'Fig'], ['Lime', 'Kiwi', 'Kale']]);
    // What to set an import to is an action, not a figure.
    assert.equal(await page.locator('#importPlan thead th', {hasText: 'Set to'}).first().locator('button').count(), 0);
  } finally { await page.close(); }
});

test('top-ups sort inside each factory, a route with no reading last', async () => {
  const page = await board();
  try{
    assert.deepEqual(await groups(page, '#topupPlan'), [['Pear', 'Apple', 'Fig']]);
    const arrives = page.locator('#topupPlan thead th', {hasText: 'Arrives / day'});
    await arrives.click();
    assert.deepEqual(await groups(page, '#topupPlan'), [['Pear', 'Apple', 'Fig']]);
    await arrives.click();
    assert.deepEqual(await groups(page, '#topupPlan'), [['Apple', 'Pear', 'Fig']]);
    // The "show all" link still sits beside the note, and both still work.
    assert.match(await page.locator('#topupPlan .sechead').textContent(), /Sorted by Arrives \/ day, low to high/);
    assert.equal(await page.locator('#topupAll').count(), 1);
    assert.equal(await page.locator('#topupPlan thead th', {hasText: 'From'}).locator('button').count(), 0);
    // Imports were not touched by the top-up sort.
    assert.equal(await page.locator('#importPlan thead th[data-dir]').count(), 0);
  } finally { await page.close(); }
});
