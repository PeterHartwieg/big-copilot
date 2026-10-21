const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./_shop_expansions.cjs');
const {suiteBrowser, openPage, boardHtml, loadPayload} = require('./_page.cjs');
const payload = require('./fixtures/payload_snapshot/data_day47_history.json');
const browser = suiteBrowser();

async function shop(t, {viewport = {width: 1280, height: 900}, sales = null} = {}){
  const {page} = await openPage(t, await browser(), {html: boardHtml(), viewport});
  const data = structuredClone(payload), f = fixture();
  const b = data.businesses.find(b => b.status === 'retail');
  f.building.key = b.key;
  f.facts.built = {[b.key]: f.facts.built.k};
  if(sales) f.facts.sales = sales;
  Object.assign(b, {typeSlug: 'T', promotion: 20, satisfaction: {...b.satisfaction, overall: 50}});
  data.hours.find(h => h.key === b.key).open = f.options.open;
  data.premises.buildings = [f.building];
  data.openStore = f.facts;
  await loadPayload(page, data);
  await page.evaluate(key => openSite(key, false), b.key);
  return {page, key: b.key};
}
const settled = page => page.waitForFunction(() => getComputedStyle(document.querySelector('#sp-expansion')).opacity === '1');

test('shop details compare additions, open a shopping list and update payback with extra costs', async t => {
  const {page, key} = await shop(t);
  const toggle = page.locator('#spExpansionToggle'), body = page.locator('#spExpansionBody');
  assert.equal(await body.isVisible(), false);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await toggle.click();
  await settled(page);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  const row = page.locator('.spx-row').first();
  assert.match(await row.innerText(), /34 days/);
  const detail = page.locator('.spx-kid').first();
  assert.equal(await detail.isVisible(), false);
  await row.locator('.spx-name').click();
  assert.equal(await row.locator('.spx-name').getAttribute('aria-expanded'), 'true');
  const text = await detail.innerText();
  // Two displays and two supports cover building capacity 20; one vendor, one delivery.
  assert.match(text, /Synthetic Fittings/);
  assert.match(text, /2 × .*\n?\$100\.00 each\s+\$200/);
  assert.match(text, /\$20\.00 each\s+\$40/);
  assert.match(text, /Delivery\s+\$50/);
  assert.match(text, /Seven days of stock\s+\$24/);
  assert.match(text, /Upfront\s+\$314/);
  assert.match(text, /sold at \$15\.00, bought at \$4\.00/);
  const input = page.locator('#spExpansionCost');
  await input.fill('100');
  await input.press('Tab');
  assert.match(await row.innerText(), /Never/);
  assert.match(await detail.innerText(), /Extra staffing and other costs\s+-\$100/);
  // Only the rows repaint: the block stays revealed and the open row stays open.
  await settled(page);
  assert.equal(await detail.isVisible(), true);
  assert.equal(await input.inputValue(), '100');
  // Save refresh: same-shop controls survive, but newly offered products vanish.
  await page.evaluate(key => {D.openStore.built[key].sells.push('P'); drawSite();}, key);
  assert.match(await body.innerText(), /already offers every physical product/);
  await page.evaluate(() => {D.meta.character = 'another-company'; drawSite();});
  // An open site is dismissed on company change; the comparison cannot leak.
  assert.equal(await page.locator('#spExpansionCost').count(), 0);
});

test('margin lost at your own shops nearby is shown on the row and in its ledger', async t => {
  const {page} = await shop(t, {sales: {H: {P: [['elsewhere', 10, 5]]}}});
  await page.locator('#spExpansionToggle').click();
  const row = page.locator('.spx-row').first();
  assert.match(await row.innerText(), /-\$\d+ from your shops nearby/);
  await row.locator('.spx-name').click();
  assert.match(await page.locator('.spx-kid').first().innerText(), /Lost at your shops nearby\s+-\$\d+/);
});

test('comparison fits a phone and is keyboard operable', async t => {
  const {page} = await shop(t, {viewport: {width: 390, height: 844}});
  await page.locator('#spExpansionToggle').focus();
  await page.keyboard.press('Enter');
  const name = page.locator('.spx-name').first();
  await name.focus();
  await page.keyboard.press('Enter');
  assert.equal(await name.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('.spx-kid').first().isVisible(), true);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.spx-kid').first().isVisible(), false);
  await page.evaluate(() => document.querySelector('#sp-expansion').classList.add('measured'));
  assert.equal(await page.locator('#sp-expansion').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  assert.equal(await page.locator('#spExpansionRows').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
});

test('incomplete equipment facts show unknown costs and no payback', async t => {
  const {page} = await shop(t);
  await page.evaluate(() => {delete D.openStore.items.support;});
  await page.locator('#spExpansionToggle').click();
  const row = page.locator('.spx-row').first();
  assert.match(await row.innerText(), /equipment unknown/);
  assert.equal(await row.locator('.spx-pay').innerText(), '—');
  await row.locator('.spx-name').click();
  assert.match(await page.locator('.spx-kid').first().innerText(), /Equipment details are incomplete/);
});

test('absent on-demand facts wait instead of reporting an empty product range', async t => {
  const {page} = await shop(t);
  await page.evaluate(() => {
    delete D.openStore;
    SOURCE.section = () => new Promise(() => {});
    Object.defineProperty(D, Symbol.for('bigcopilot.build'), {value: 99, configurable: true});
  });
  await page.locator('#spExpansionToggle').click();
  assert.match(await page.locator('#spExpansionBody').innerText(), /Working out store plans/);
  assert.doesNotMatch(await page.locator('#spExpansionBody').innerText(), /already offers/);
});
