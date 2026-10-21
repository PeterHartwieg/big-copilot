const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./_shop_expansions.cjs');
const {suiteBrowser, openPage, boardHtml, loadPayload} = require('./_page.cjs');
const payload = require('./fixtures/payload_snapshot/data_day47_history.json');
const browser = suiteBrowser();

async function shop(t, viewport = {width: 1280, height: 900}){
  const {page} = await openPage(t, await browser(), {html: boardHtml(), viewport});
  const data = structuredClone(payload), f = fixture();
  const b = data.businesses.find(b => b.status === 'retail');
  f.building.key = b.key;
  f.facts.built = {[b.key]: f.facts.built.k};
  Object.assign(b, {typeSlug: 'T', promotion: 20, satisfaction: {...b.satisfaction, overall: 50}});
  data.hours.find(h => h.key === b.key).open = f.options.open;
  data.premises.buildings = [f.building];
  data.openStore = f.facts;
  await loadPayload(page, data);
  await page.evaluate(key => openSite(key, false), b.key);
  return {page, key: b.key};
}

test('shop details compare additions, reveal equipment and update payback with extra costs', async t => {
  const {page, key} = await shop(t);
  assert.equal(await page.locator('#spExpansionBody').isVisible(), false);
  await page.locator('#spExpansionToggle').click();
  const body = page.locator('#spExpansionBody');
  assert.match(await body.innerText(), /34 days/);
  await body.locator('summary').click();
  assert.match(await body.innerText(), /240.*50.*24/s);
  await page.locator('#spExpansionCost').fill('100');
  await page.locator('#spExpansionCost').press('Tab');
  assert.match(await body.innerText(), /No payback/);
  // Save refresh: same-shop controls survive, but newly offered products vanish.
  await page.evaluate(key => {D.openStore.built[key].sells.push('P'); drawSite();}, key);
  assert.match(await body.innerText(), /already offers every physical product/);
  await page.evaluate(() => {D.meta.character = 'another-company'; drawSite();});
  // An open site is dismissed on company change; the comparison cannot leak.
  assert.equal(await page.locator('#spExpansionCost').count(), 0);
});

test('comparison wraps on a phone and remains keyboard operable', async t => {
  const {page} = await shop(t, {width: 390, height: 844});
  await page.locator('#spExpansionToggle').focus();
  await page.keyboard.press('Enter');
  await page.locator('.sp-expansion-option summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.sp-expansion-option').getAttribute('open'), '');
  await page.evaluate(() => document.querySelector('#sp-expansion').classList.add('measured'));
  assert.equal(await page.locator('#sp-expansion').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
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
