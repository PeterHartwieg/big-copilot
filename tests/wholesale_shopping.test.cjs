const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./_page.cjs');
const browser = H.suiteBrowser();
const fixture = path.join(__dirname, 'fixtures/payload_snapshot/data_day47_history.json');

async function board(t, width = 1280){
  const {page} = await H.openPage(t, await browser(), {
    html: H.boardHtml(fixture), hash: '#supply/deliveries', viewport: {width, height: 1000}, reducedMotion: 'reduce',
  });
  const shops = await page.evaluate(() => {
    const shops = D.businesses.map((b, s) => ({b, s})).filter(x => x.b.status === 'retail').slice(0, 2);
    D.wholesale = {available: true, margin: .15, rows: [
      {s: shops[0].s, slug: 'soda', item: 'Soda <img src=x onerror=alert(1)>', week: 700, stock: 100,
        scheduled: 50, deliveries: [[.5, 50]], buy: 700, boxes: 14, box: 50, weekly: 810, current: 50, reason: null, deliveryUnknown: false},
      {s: shops[1].s, slug: 'beer', item: 'Beer', week: 350, stock: 500,
        scheduled: 0, deliveries: [], buy: 0, boxes: 0, box: 100, weekly: 410, current: 0, reason: null, deliveryUnknown: false},
      {s: shops[0].s, slug: 'new', item: 'New product', week: 0, stock: 20,
        scheduled: 0, deliveries: [], buy: null, boxes: null, box: 50, weekly: null, current: 0, reason: 'no-sales', deliveryUnknown: false},
      {s: shops[0].s, slug: 'routed', item: 'Routed product', week: 100, stock: 30,
        scheduled: 0, deliveries: [], buy: null, boxes: null, box: 50, weekly: null, current: 0, reason: 'route', deliveryUnknown: false},
    ]};
    drawDeliveriesView(); wireAll();
    return shops.map(x => ({key: x.b.key, name: shortName(x.b)}));
  });
  return {page, shops};
}

test('buying, recurring amounts and unavailable estimates stay distinct; names are text', async t => {
  const {page} = await board(t);
  const panel = page.locator('.sw-plan');
  const soda = panel.locator('[data-sw-slug="soda"]');
  assert.match(await soda.innerText(), /14 boxes · 700 units/);
  assert.match(await soda.innerText(), /810\s*Now 50 \/ week/);
  assert.equal(await soda.locator('img').count(), 0);
  assert.match(await panel.locator('[data-sw-slug="new"]').innerText(), /No measured use yet/);
  assert.equal(await panel.locator('[data-sw-slug="routed"]').count(), 0);
  assert.match(await panel.innerText(), /1 product already has a daily delivery plan or an import/);
  await panel.locator('summary').click();
  assert.match(await panel.innerText(), /repeat the order weekly/);
  assert.match(await panel.innerText(), /across all repeating wholesale contracts/);
});

test('shop filtering applies to both copy lists, and refreshes use current facts', async t => {
  const {page, shops} = await board(t);
  await page.evaluate(() => {
    window.copiedWholesale = [];
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async text => copiedWholesale.push(text)}});
  });
  await page.locator('[data-sw-copy="buy"]').click();
  let copied = await page.evaluate(() => copiedWholesale.at(-1));
  assert.match(copied, /14 boxes · 700 units/);
  assert.match(copied, /New product: No measured use yet/);
  assert.doesNotMatch(copied, /Beer|Routed product/);
  await page.locator('[data-sw-shop]').selectOption(shops[1].key);
  assert.equal(await page.locator('.sw-table tbody tr').count(), 1);
  assert.equal(await page.locator('[data-sw-copy="buy"]').isDisabled(), true);
  await page.locator('[data-sw-copy="weekly"]').click();
  copied = await page.evaluate(() => copiedWholesale.at(-1));
  assert.match(copied, /Beer: 410 units \/ week/);
  assert.doesNotMatch(copied, /Soda/);
  await page.evaluate(() => { D.wholesale.rows.find(r => r.slug === 'beer').weekly = 600; drawDeliveriesView(); });
  await page.locator('[data-sw-copy="weekly"]').click();
  assert.match(await page.evaluate(() => copiedWholesale.at(-1)), /600 units \/ week/);
  await page.evaluate(() => { D.meta.character = 'another-company'; drawDeliveriesView(); });
  assert.equal(await page.locator('[data-sw-shop]').inputValue(), '');
  assert.equal(await page.locator('.sw-table tbody tr').count(), 3);
});

test('clipboard refusal offers selectable text, and an uncertain drop blocks buying only', async t => {
  const {page} = await board(t);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async () => { throw new Error('denied'); }}});
  });
  await page.locator('[data-sw-copy="buy"]').click();
  const fallback = page.locator('.sw-plan textarea');
  assert.equal(await fallback.isVisible(), true);
  assert.match(await fallback.inputValue(), /14 boxes · 700 units/);
  await page.evaluate(() => {
    Object.assign(D.wholesale.rows[0], {buy: null, boxes: null, deliveryUnknown: true}); drawDeliveriesView();
  });
  assert.match(await page.locator('[data-sw-slug="soda"]').innerText(), /Check the outstanding delivery date/);
  assert.equal(await page.locator('[data-sw-copy="buy"]').isDisabled(), true);
  assert.equal(await page.locator('[data-sw-copy="weekly"]').isDisabled(), false);
});

test('the wholesale panel stays within the phone page and the table scrolls independently', async t => {
  const {page} = await board(t, 390);
  await page.locator('.sw-plan').scrollIntoViewIfNeeded();
  const bounds = await page.locator('.sw-plan').evaluate(el => ({
    left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right,
    viewport: innerWidth, table: el.querySelector('.scrollx').getBoundingClientRect().right,
  }));
  assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewport + 1, JSON.stringify(bounds));
  assert.ok(bounds.table <= bounds.right, JSON.stringify(bounds));
});
