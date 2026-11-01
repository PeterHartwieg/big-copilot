'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {loadBoard} = require('./_board.cjs');
const prices = require('../ba_item_prices.json');
const rules = require('../ba_store_rules.json');
const {execFileSync} = require('node:child_process');
const {selectPython} = require('../tools/verify.mjs');
const H = require('./_page.cjs');
const browser = H.suiteBrowser();

test('Sommerhus shopping prices distinguish one chair from ten chairs (#523)', () => {
  const board = loadBoard();
  const facts = {items: prices.items};
  const item = 'ba:itemname_armchair1';
  assert.equal(board.mcItemMoney(facts, item), '$130');
  assert.equal(board.mcItemMoney(facts, item, 10), '$1,300');
});

test('the Installation firm keeps separate quantity, unit price and total columns (#523)', () => {
  const board = loadBoard();
  const item = 'ba:itemname_armchair1', vendor = rules.furniture[item].v[0];
  // The openStore payload's item and vendor records, as _open_store() writes them.
  const openStore = {items: {[item]: {p: prices.items[item].p, v: [vendor]}},
    vendors: {[vendor]: rules.vendors[vendor]}, game: {installFee: 586, delivery: 250}, hoods: {}};
  vm.runInContext(`D = {openStore: ${JSON.stringify(openStore)}}`, board);
  const b = {key: 'test:street#1', hood: 'test:hood', m2: 10, status: 'vacant', address: '1 Test St', deposit: 0};
  const out = {lines: [[item, 10, 'req', 'seat']]};
  const inv = {fee: 5860, deposit: 0, firm: 7160, self: 1550, items: 10};
  const row = html => html.match(/<tr><td class="l">[^<]*Armchair 1<\/td>.*?<\/tr>/)[0]
    .match(/<td[^>]*>([^<]*)<\/td>/g).map(td => td.replace(/<[^>]+>/g, ''));
  // Installation firm: Item, Why (tags), Qty, Each, Total.
  assert.deepEqual(row(board.osFirmHtml(b, out, inv)).slice(-3), ['10', '$130', '$1,300']);
});

let officePayload;
function office(capacity){
  if(!officePayload) officePayload = JSON.parse(execFileSync(selectPython(), ['-c',
    'import json; from tests.test_open_store import headquarters_payload; print(json.dumps(headquarters_payload()))'],
  {cwd: H.ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}));
  const payload = structuredClone(officePayload), type = 'ba:businesstype_lawfirm';
  payload.names['ba:itemname_armchair1'] = 'Sommerhus Arm Chair';
  const building = payload.premises.buildings.find(b => b.key === 'ba:street_broadwaystreet#1');
  building.cap = capacity;
  if(capacity === 1){
    const facts = payload.openStore, outfit = facts.types[type].layouts[building.layout];
    // A synthetic one-computer office: keep required fittings, omit capacity additions.
    outfit.lines = outfit.lines.filter(l => l[2] !== 'cap');
    outfit.furniture = outfit.lines.reduce((sum, [id, n]) => sum + facts.items[id].p * n, 0);
    facts.types[type].initial[building.layout] = 1;
  }
  return {payload, type, key: building.key};
}

for(const capacity of [10, 1]) test(`Self-installation distinguishes unit prices and totals in a capacity-${capacity} office (#523)`, async t => {
  const {page} = await H.openPage(t, await browser(), {html: H.boardHtml(), hash: '#expansion/open'});
  const {payload, type, key} = office(capacity);
  await H.loadPayload(page, payload);
  const before = await page.evaluate(({type, key}) => {
    const plan = osNew(type), b = osBuilding(key);
    plan.key = key; plan.mode = 'self'; plan.step = osStep = 'investment';
    const inv = osInvestment(plan, b), estimate = osEstimate(plan, b);
    drawOpenStore();
    return {inv, days: estimate.days, profit: estimate.profit};
  }, {type, key});
  assert.deepEqual([before.inv.furniture, before.inv.fee, before.inv.deposit, before.inv.delivery,
    before.inv.decor, before.inv.firm, before.inv.self], capacity > 1
    ? [19880, 167010, 6000, 250, 0, 192890, 26130] : [3410, 167010, 6000, 250, 0, 176420, 9660]);
  assert.ok(before.days, 'the office has a payback estimate to compare');
  const store = page.locator('#osBody .os-store').filter({has: page.locator('.os-sh b', {hasText: 'Ika Bohag'})});
  const row = store.locator('tr').filter({hasText: 'Sommerhus Arm Chair'});
  assert.equal(await row.count(), 1, 'required and capacity chairs form one shopping row');
  const quantity = `${capacity} × Sommerhus Arm Chair`;
  assert.ok((await row.locator('td.l').innerText()).startsWith(quantity));
  if(capacity > 1){
    assert.equal(await row.locator('td.l .sub').count(), 1, 'multiple items show a unit price');
    assert.equal(await row.locator('td.l .sub').innerText(), 'Each $130');
    assert.equal(await row.locator('td').last().innerText(), '$1,300\nTotal');
  } else {
    assert.equal(await row.locator('td').last().innerText(), '$130');
    assert.equal(await row.locator('.sub').count(), 0);
  }
  // Vendor subtotals include one delivery; investment still includes the deposit.
  const vendorTotal = await store.locator('.os-sh .t').innerText();
  assert.equal(vendorTotal, capacity > 1 ? '$20,130' : '$3,660');
  assert.equal(await page.locator('#osBody .os-total b').innerText(), `$${before.inv.self.toLocaleString('en-US')}`);
  await page.setViewportSize({width: 390, height: 844});
  await row.scrollIntoViewIfNeeded();
  for(const cell of [row.locator('td.l'), row.locator('td').last()]){
    const bounds = await cell.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'quantity and prices fit at mobile width');
    assert.equal(await cell.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'cell text is not clipped');
  }
  await page.locator('[data-os-mode="firm"]').click();
  const firm = page.locator('#osBody .os-inv');
  assert.deepEqual(await firm.locator('thead th').allTextContents(), ['Item', 'Why', 'Qty', 'Each', 'Total']);
  const firmRow = firm.locator('tbody tr').filter({has: page.locator('td.l', {hasText: 'Sommerhus Arm Chair'})});
  assert.deepEqual((await firmRow.locator('td').allTextContents()).slice(-3),
    [String(capacity), '$130', capacity > 1 ? '$1,300' : '$130']);
  assert.equal(await firm.locator('tfoot td').last().innerText(), `$${before.inv.firm.toLocaleString('en-US')}`);
  const after = await page.evaluate(() => {
    const plan = osPlan(), b = osBuilding(plan.key), estimate = osEstimate(plan, b);
    return {inv: osInvestment(plan, b), days: estimate.days, profit: estimate.profit};
  });
  assert.deepEqual(after, before, 'rendering and switching modes leave investment and payback unchanged');
});
