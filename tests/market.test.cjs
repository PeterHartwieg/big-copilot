// Market demand grid: every business type ranked on the average demand of its
// primary products, with office agencies as their own band under the shops.
// Install Playwright and its Chromium browser to run; NODE_PATH may point at an
// existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const {chromium} = require('playwright');

let browser;
let html;
before(async () => {
  const result = spawnSync(process.env.PYTHON || 'python', ['-c',
    'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
  {cwd: path.join(__dirname, '..'), maxBuffer: 4 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8')
    : result.stdout.toString();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

async function grid() {
  const page = await browser.newPage({viewport: {width: 1280, height: 1100}});
  await page.route('https://**', route => route.abort());
  await page.setContent(html, {waitUntil: 'load'});
  await page.evaluate(() => {
    document.body.classList.add('has-board');
    const hoods = ['Hell\'s Kitchen', 'Industry City', 'Midtown'];
    const shopCell = (hood, demand, count, providers) => ({hood, demand, count, providers, sell: 0, here: false});
    const fee = (hood, demand, providers, here = false) => ({hood, demand, providers, hype: null, delta: null, here});
    D = {meta: {character: 'market-fixture'}, market: {
      hoods, trendDays: 0, noOffices: ['Industry City'], rows: [
        {item: 'Lawyer Fee (Hourly)', slug: 'ba:itemname_hourlylawyerfee', sell: true, make: false, office: true,
          cells: [{hood: hoods[0], demand: 33, providers: 2, sell: true}, null, {hood: hoods[2], demand: 66, providers: 1}]}],
      // Python ranks rows by their best neighbourhood; the fixture is in that order.
      types: [
        {type: 'Cinema', slug: 'ba:businesstype_cinema', products: 1, mine: false, peak: 90,
          cells: [shopCell(hoods[0], 40, 1, 1), shopCell(hoods[1], 90, 1, 0), shopCell(hoods[2], 64, 1, 3)]},
        {type: 'Supermarket', slug: 'ba:businesstype_supermarket', products: 3, mine: false, peak: 80,
          cells: [shopCell(hoods[0], 55, 3, 2), shopCell(hoods[1], 80, 3, 2), shopCell(hoods[2], 64, 3, 1)]}],
      offices: [
        {type: 'Travel Agency', slug: 'ba:businesstype_travelagency', fees: ['Travel Consultant Fee (Hourly)'],
          mine: false, cells: [fee(hoods[0], 66, 1), null, fee(hoods[2], 30, 5)]},
        {type: 'Law Firm', slug: 'ba:businesstype_lawfirm', fees: ['Lawyer Fee (Hourly)'],
          mine: true, cells: [fee(hoods[0], 33, 2, true), null, fee(hoods[2], 99, 0)]}]}};
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageGrowth'; });
    document.querySelectorAll('#pageGrowth section').forEach(el => { el.hidden = el.id !== 'secMarket'; });
    marketView = 'types';
    drawMarket();
    wireHeat();
  });
  return page;
}

const rowNames = page => page.$$eval('#market .r', rows => rows.map(r => r.firstChild.textContent));
const cell = (page, r, c) => page.locator(`#market .cell[data-r="${r}"][data-c="${c}"]`);

test('a type cell is the average demand of its range, and a one-product type reads its own', async () => {
  const page = await grid();
  try {
    assert.deepEqual(await rowNames(page), ['Cinema', 'Supermarket', 'Travel Agency', 'Law Firm']);
    assert.match(await page.locator('#marketNote').innerText(), /Ranked by each type's best neighbourhood/);
    assert.equal((await cell(page, 1, 2).innerText()).trim(), '64');
    assert.match(await cell(page, 1, 2).getAttribute('data-tip'),
      /average demand 64 across its 3 products, 1 seller on average$/);
    const texts = await page.$$eval('#market .cell', cs => cs.map(c => c.textContent + ' ' + c.dataset.tip).join('\n'));
    assert.doesNotMatch(texts, /\d\/\d|strong demand/, 'no product count against the 60 line anywhere');
    assert.doesNotMatch(texts, /rival seller/, 'the seller count includes the player, so nobody is called a rival');
    assert.doesNotMatch(await page.locator('#marketWhy').getAttribute('data-tip'), /strong demand|rival seller/);
    // The only cinema in Midtown being yours is one seller, not one rival; a
    // range with a product missing here says the average is over what is left.
    await page.evaluate(() => {
      Object.assign(D.market.types[0].cells[2], {here: true, providers: 1});
      D.market.types[1].cells[0].count = 2;
      drawMarket();
    });
    assert.match(await cell(page, 0, 2).getAttribute('data-tip'),
      /^Cinema in Midtown: demand 64 for its one product, 1 seller, yours among them$/);
    assert.match(await cell(page, 1, 0).getAttribute('data-tip'),
      /average demand 55 across the 2 of its 3 products with a reading here, 2 sellers on average$/);
    assert.equal((await cell(page, 0, 1).innerText()).trim(), '90');
    assert.match(await cell(page, 0, 1).getAttribute('data-tip'), /demand 90 for its one product/);
    // The row ends on the way to the type's setup guide in the Wiki.
    assert.match(await page.locator('#market .r[data-r="0"] small').innerText(), /^1 product · Setup guide ›$/);
  } finally { await page.close(); }
});

test('offices follow the shop types as a band of their own, read from their fee', async () => {
  const page = await grid();
  try {
    const around = await page.$eval('#market .band', b => [b.previousElementSibling.dataset.r, b.nextElementSibling.dataset.r]);
    assert.deepEqual(around, ['1', '2'], 'band sits between the last shop row and the first office row');
    assert.match(await page.locator('#market .band').innerText(), /Offices/i);
    const law = page.locator('#market .cell[data-office][data-r="3"][data-c="0"]');
    assert.equal((await law.innerText()).trim(), '33');
    assert.match(await law.getAttribute('class'), /\bmine\b/);
    assert.match(await law.getAttribute('data-tip'), /2 firms charging it, yours among them/);
    assert.match(await cell(page, 3, 2).getAttribute('data-tip'), /no firm charging it yet/);
    assert.match(await page.locator('#market .cell.none[data-office][data-c="1"]').first().getAttribute('data-tip'),
      /no office buildings here/);
    const rows = await page.$$eval('#market .r', rs => rs.map(r => r.dataset.r));
    assert.equal(new Set(rows).size, rows.length);
  } finally { await page.close(); }
});

test('sorting by a neighbourhood orders each band by demand, the emptier market first among equals', async () => {
  const page = await grid();
  try {
    // Midtown: Cinema and Supermarket both read 64; the supermarket has one rival, the cinema three.
    await page.locator('#market .h[data-hood="Midtown"]').click();
    assert.deepEqual(await rowNames(page), ['Supermarket', 'Cinema', 'Law Firm', 'Travel Agency']);
    assert.match(await page.locator('#marketNote').innerText(), /Sorted by demand in Midtown, highest first/);
    // A second click reverses the whole order, ties included: the least
    // inviting cell (equal demand, more sellers) leads.
    await page.locator('#market .h[data-hood="Midtown"]').click();
    assert.deepEqual(await rowNames(page), ['Cinema', 'Supermarket', 'Travel Agency', 'Law Firm']);
    await page.locator('#market .h[data-hood="Hell\'s Kitchen"]').click();
    assert.deepEqual(await rowNames(page), ['Supermarket', 'Cinema', 'Travel Agency', 'Law Firm']);
  } finally { await page.close(); }
});

test('a shop row carries its own way into Plan a chain; an office row has none, in every view', async () => {
  const page = await grid();
  try {
    await page.evaluate(() => {
      D.plan = {catalogue: {
        'ba:businesstype_cinema': {type: 'Cinema', products: ['ba:itemname_popcorn']},
        'ba:businesstype_supermarket': {type: 'Supermarket', products: ['ba:itemname_apple', 'ba:itemname_bread']}}};
      D.market.rows.push({item: 'Apple', slug: 'ba:itemname_apple', sell: true, make: false, office: false,
        cells: [{hood: 'Midtown', demand: 50, providers: 1, sell: true}, null, null]});
      drawMarket();
      window.drawPlan = () => { window.planned = planType; };   // the plan page itself is not under test
    });
    const plans = () => page.$$eval('#market .r', rs => rs.map(r => r.querySelector('.mk-plan')?.dataset.plan || null));
    assert.deepEqual(await plans(), ['ba:businesstype_cinema', 'ba:businesstype_supermarket', null, null]);
    assert.equal(await page.locator('#market .r[data-r="0"] small').innerText(), '1 product · Setup guide › · Plan a chain ›');
    // Nothing is drawn under the grid.
    assert.equal(await page.locator('#cellDetail').count(), 0);
    await page.locator('#market .r[data-r="1"] .mk-plan').click();
    assert.equal(await page.evaluate(() => window.planned), 'ba:businesstype_supermarket');
    assert.equal(await page.evaluate(() => planType), 'ba:businesstype_supermarket');
    // A second click on the type already open keeps the machines the player stepped.
    await page.evaluate(() => { planCounts = {'ba:itemname_apple': 4}; showPage('growth'); showSub('growth', 'market'); });
    await page.locator('#market .r[data-r="1"] .mk-plan').click();
    assert.deepEqual(await page.evaluate(() => planCounts), {'ba:itemname_apple': 4});
    await page.evaluate(() => showSub('growth', 'market'));
    await page.locator('#market .r[data-r="0"] .mk-plan').click();
    assert.deepEqual(await page.evaluate(() => [planType, planCounts]), ['ba:businesstype_cinema', {}]);
    // A product row plans the type that sells it; the office fee still plans nothing.
    await page.evaluate(() => { marketView = 'mine'; drawMarket(); });
    assert.deepEqual(await plans(), [null, 'ba:businesstype_supermarket']);
    assert.equal(await page.locator('#market .r[data-r="0"] small').innerText(), 'you sell it');
    assert.equal(await page.locator('#market .r[data-r="1"] small').innerText(), 'you sell it · Plan a chain ›');
  } finally { await page.close(); }
});

test('without the premises payload a cell is no button and a click stays on the grid', async () => {
  const page = await grid();
  try {
    assert.equal(await page.locator('#market .cell[role=button]').count(), 0);
    await cell(page, 1, 0).click();
    assert.equal(await page.locator('#secMarket').isVisible(), true);
  } finally { await page.close(); }
});

test('the product views carry no office band', async () => {
  const page = await grid();
  try {
    await page.evaluate(() => { marketView = 'mine'; drawMarket(); });
    assert.equal(await page.locator('#market .band').count(), 0);
    assert.deepEqual(await rowNames(page), ['Lawyer Fee (Hourly)']);
  } finally { await page.close(); }
});
