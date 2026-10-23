'use strict';
// Synthetic board regression: optional model limits must be visible where the
// affected number/action would appear, without hiding recorded company data.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {suiteBrowser, openPage, renderBoard} = require('./_page.cjs');
const browser = suiteBrowser();
const payload = 'tests/fixtures/payload_snapshot/data_day47_history.json';
async function board(t){
  const {page} = await openPage(t, await browser(), {html: renderBoard(payload), hash: '#expansion/factory', reducedMotion: 'reduce'});
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  return page;
}

test('factory forecasts and opening checks explain unsupported costs while recorded output remains available', async t => {
  const page = await board(t);
  const result = await page.evaluate(() => {
    D.openFactory.compatibility = {factoryRunning: ['equipmentUtilities'], factoryOpening: ['factoryDiplomas']};
    ofDraw();
    const plan = ofEnsure();
    return {strip: document.getElementById('ofStrip').textContent,
      rows: ofUntilRows(plan).flatMap(g => g[1]).map(r => ({title: r.title, state: r.state, sub: r.sub})),
      investment: ofInvestHtml(plan), records: ofRunHtml(plan), totals: D.kpi};
  });
  assert.match(result.strip, /No estimate/);
  assert.match(result.strip, /Equipment utility costs/);
  assert.doesNotMatch(result.strip, /\$[\d,.]+\/week/);
  const row = result.rows.find(r => r.title === 'Unverified opening requirements');
  assert.equal(row.state, 'todo');
  assert.match(row.sub, /course requirements and fees/);
  assert.match(result.investment, /equipment estimate and opening checklist are incomplete/);
  assert.match(result.records, /Raw material/);
  assert.ok(result.totals);
});

test('store profit and unknown vehicle finance show explicit limits at their point of use', async t => {
  const page = await board(t);
  const result = await page.evaluate(() => {
    D.openStore.compatibility = {storeProfit: ['equipmentUtilities']};
    const type = 'ba:businesstype_liquorstore';
    const b = premises().buildings.find(b => (D.openStore.types[type].layouts[b.key] || D.openStore.types[type].layouts[osLayout(b)]));
    const plan = {type, key: b.key, mode: 'self', finance: {on: true}};
    D.openStore.finance.unavailable = 'vehiclePrices';
    D.openStore.finance.wealth = null;
    return {estimate: osEstimate(plan, b), html: osBreakHtml(plan),
      finance: planFinanceHtml('os', plan, 100000, '', () => { throw Error('must not price a loan'); })};
  });
  assert.ok(result.estimate.inv.firm > 0);
  assert.match(result.estimate.none, /Equipment utility costs/);
  assert.match(result.html, /No estimate/);
  assert.match(result.finance, /owned vehicle prices are unknown/);
  assert.doesNotMatch(result.finance, /type="range"/);
});

test('unsupported marketing catalogue cannot use cached supported profits or offer a marketing write', async t => {
  const page = await board(t);
  const result = await page.evaluate(() => {
    const type = 'ba:businesstype_liquorstore';
    const b = premises().buildings.find(b => D.openStore.types[type].layouts[osLayout(b)]);
    const before = osBestModel(type, b);
    // Even a capability arriving on the same payload must beat a cached result.
    D.openStore.compatibility = {storeProfit: ['marketingUnknown'], marketing: ['marketingUnknown']};
    const site = D.businesses.find(b => b.status === 'retail');
    site.marketingPlan = {unavailable: true, on: null, needsSetup: false, visit: []};
    return {hadForecast: !!before, after: osBestModel(type, b), line: spMkLine(site), actions: gwMkWants('mix').filter(b => b.key === site.key).map(b => b.key)};
  });
  assert.equal(result.hadForecast, true);
  assert.equal(result.after, null);
  assert.match(result.line, /Campaign planning is unavailable/);
  assert.deepEqual(result.actions, []);
});
