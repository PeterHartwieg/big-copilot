const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./_shop_expansions.cjs');
const {suiteBrowser, openPage, boardHtml, loadPayload} = require('./_page.cjs');
const payload = require('./fixtures/payload_snapshot/data_day47_history.json');
const browser = suiteBrowser();

async function shop(t, {viewport = {width: 1280, height: 900}, sales = null} = {}){
  const {page} = await openPage(t, await browser(), {html: boardHtml(), viewport});
  const data = structuredClone(payload), f = fixture();
  // Both of the payload's shops become the synthetic one, each in its own building.
  const shops = data.businesses.filter(b => b.status === 'retail');
  data.premises.buildings = [];
  f.facts.built = {};
  for(const b of shops){
    data.premises.buildings.push({...f.building, key: b.key});
    f.facts.built[b.key] = {sells: ['existing']};
    Object.assign(b, {typeSlug: 'T', promotion: 20, satisfaction: {...b.satisfaction, overall: 50}});
    data.hours.find(h => h.key === b.key).open = f.options.open;
  }
  if(sales) f.facts.sales = sales;
  data.openStore = f.facts;
  await loadPayload(page, data);
  await page.evaluate(key => openSite(key, false), shops[0].key);
  return {page, key: shops[0].key, other: shops[1].key};
}
const settled = page => page.waitForFunction(() => getComputedStyle(document.querySelector('#sp-expansion')).opacity === '1');
const costOf = page => page.evaluate(() => spExpansionState.extraCost);

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

test('each shop keeps its own comparison when the reader goes A, B and back to A', async t => {
  const {page, key, other} = await shop(t);
  await page.locator('#spExpansionToggle').click();
  await page.locator('.spx-name').first().click();
  await page.locator('#spExpansionCost').fill('100');
  await page.locator('#spExpansionCost').press('Tab');
  await page.evaluate(k => openSite(k, false), other);
  assert.equal(await page.locator('#spExpansionToggle').getAttribute('aria-expanded'), 'false');
  await page.locator('#spExpansionToggle').click();
  assert.equal(await page.locator('#spExpansionCost').inputValue(), '0');
  assert.equal(await page.locator('.spx-kid').first().isVisible(), false);
  await page.locator('#spExpansionCost').fill('7');
  await page.locator('#spExpansionCost').press('Tab');
  await page.evaluate(k => openSite(k, false), key);
  assert.equal(await page.locator('#spExpansionToggle').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#spExpansionCost').inputValue(), '100');
  assert.equal(await page.locator('.spx-kid').first().isVisible(), true);
  assert.match(await page.locator('.spx-row').first().innerText(), /Never/);
  await page.evaluate(k => openSite(k, false), other);
  assert.equal(await page.locator('#spExpansionCost').inputValue(), '7');
});

test('the same shop under another company starts fresh and does not overwrite the first', async t => {
  const {page, key} = await shop(t);
  await page.locator('#spExpansionToggle').click();
  await page.locator('#spExpansionCost').fill('100');
  await page.locator('#spExpansionCost').press('Tab');
  const company = await page.evaluate(() => D.meta.character);
  await page.evaluate(k => {D.meta.character = 'another-company'; drawSite(); openSite(k, false);}, key);
  assert.equal(await page.locator('#spExpansionToggle').getAttribute('aria-expanded'), 'false');
  await page.locator('#spExpansionToggle').click();
  assert.equal(await page.locator('#spExpansionCost').inputValue(), '0');
  await page.locator('#spExpansionCost').fill('5');
  await page.locator('#spExpansionCost').press('Tab');
  await page.evaluate(([k, c]) => {D.meta.character = c; drawSite(); openSite(k, false);}, [key, company]);
  assert.equal(await page.locator('#spExpansionCost').inputValue(), '100');
  assert.equal(await costOf(page), 100);
});

test('a focused cost draft survives a live redraw and commits when the field is left', async t => {
  const {page} = await shop(t);
  await page.locator('#spExpansionToggle').click();
  const input = page.locator('#spExpansionCost');
  await input.fill('100');
  // Two refreshes land while the reader is still typing: nothing commits yet.
  await page.evaluate(() => {drawSite(); drawSite();});
  assert.equal(await input.inputValue(), '100');
  assert.equal(await input.evaluate(el => el === document.activeElement), true);
  assert.equal(await costOf(page), 0);
  assert.doesNotMatch(await page.locator('.spx-row').first().innerText(), /Never/);
  // Leaving the replacement field without another keystroke commits the draft.
  await input.press('Tab');
  assert.equal(await costOf(page), 100);
  assert.match(await page.locator('.spx-row').first().innerText(), /Never/);
  // A later edit on the replacement still commits through change.
  await input.fill('0');
  await page.evaluate(() => drawSite());
  await input.fill('5');
  await input.press('Tab');
  assert.equal(await costOf(page), 5);
  // Unfocused, a redraw shows the committed cost.
  await page.evaluate(() => drawSite());
  assert.equal(await input.inputValue(), '5');
  assert.equal(await input.evaluate(el => el === document.activeElement), false);
});

test('a focused invalid draft survives a redraw, is reported and never committed', async t => {
  const {page} = await shop(t);
  await page.locator('#spExpansionToggle').click();
  const input = page.locator('#spExpansionCost');
  await input.fill('25');
  await input.press('Tab');
  await input.fill('-5');
  await page.evaluate(() => drawSite());
  assert.equal(await input.inputValue(), '-5');
  assert.equal(await input.evaluate(el => el === document.activeElement), true);
  await page.evaluate(() => { window.__reported = 0;
    const el = document.querySelector('#spExpansionCost'), report = el.reportValidity.bind(el);
    el.reportValidity = () => { window.__reported++; return report(); }; });
  await input.evaluate(el => el.blur());
  assert.equal(await page.evaluate(() => window.__reported), 1);
  assert.equal(await costOf(page), 25);
  // Out of focus (reporting may have pulled focus back), a redraw returns the
  // field to the committed cost, and the second blur reports nothing more.
  await input.evaluate(el => el.blur());
  assert.equal(await page.evaluate(() => window.__reported), 1);
  await page.evaluate(() => drawSite());
  assert.equal(await input.inputValue(), '25');
});

// A save refresh drops the on-demand facts and redraws while they load, then
// they arrive and the page redraws again.
const waitFacts = page => page.evaluate(() => {
  window.__facts = D.openStore;
  delete D.openStore;
  SOURCE.section = () => new Promise(() => {});
  Object.defineProperty(D, Symbol.for('bigcopilot.build'), {value: 99, configurable: true});
  drawSite();
});
const factsBack = (page, then = () => drawSite()) => page.evaluate(`D.openStore = window.__facts; (${then})()`);
const focused = input => input.evaluate(el => el === document.activeElement);

test('a focused draft is held through a wait for the facts and restored when they arrive', async t => {
  const {page} = await shop(t);
  await page.locator('#spExpansionToggle').click();
  const input = page.locator('#spExpansionCost');
  await input.fill('100');
  await waitFacts(page);
  await page.evaluate(() => drawSite());
  assert.match(await page.locator('#spExpansionBody').innerText(), /Working out store plans/);
  assert.equal(await input.count(), 0);
  assert.equal(await costOf(page), 0);
  await factsBack(page);
  assert.equal(await input.inputValue(), '100');
  assert.equal(await focused(input), true);
  assert.equal(await costOf(page), 0);
  await input.press('Tab');
  assert.equal(await costOf(page), 100);
  assert.match(await page.locator('.spx-row').first().innerText(), /Never/);
  // Committed, the draft is gone: a later wait and return show the cost, unfocused.
  await waitFacts(page);
  await factsBack(page);
  assert.equal(await input.inputValue(), '100');
  assert.equal(await focused(input), false);
});

test('a held draft is dropped when focus moves, the comparison closes, the outcome is final or the shop changes', async t => {
  const {page, key, other} = await shop(t);
  await page.locator('#spExpansionToggle').click();
  const input = page.locator('#spExpansionCost'), toggle = page.locator('#spExpansionToggle');
  const typeThenWait = async () => { await input.fill('100'); await waitFacts(page); };
  const dropped = async () => {
    assert.equal(await input.inputValue(), '0');
    assert.equal(await focused(input), false);
    assert.equal(await costOf(page), 0);
  };
  // The reader moves to another control while the facts load: the field does
  // not take focus back when they arrive.
  await typeThenWait();
  await toggle.focus();
  await factsBack(page);
  await dropped();
  // The comparison is closed during the wait, without focus moving.
  await typeThenWait();
  await page.evaluate(() => document.querySelector('#spExpansionToggle').click());
  await factsBack(page);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await page.evaluate(() => document.querySelector('#spExpansionToggle').click());
  await dropped();
  // The facts arrive with every product offered, then the range reopens.
  await typeThenWait();
  await factsBack(page, () => {D.openStore.built[siteKey].sells.push('P'); drawSite();});
  assert.match(await page.locator('#spExpansionBody').innerText(), /already offers every physical product/);
  await page.evaluate(() => {D.openStore.built[siteKey].sells.pop(); drawSite();});
  await dropped();
  // Another shop is opened during the wait.
  await typeThenWait();
  await factsBack(page, `() => openSite(${JSON.stringify(other)}, false)`);
  await page.evaluate(k => openSite(k, false), key);
  await dropped();
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
