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

async function linkedBoard(t, {width = 1280, old = false} = {}) {
  const stub = `<script>
    window.swCalls = [];
    window.swLink = {writes: ${JSON.stringify(old ? [] : ['wholesale'])}, features: ['wholesale.undo'],
      day: 47, hour: 14, minute: 0, character: 'default', company: 'Link Co', stamp: 'read-stamp', source: 1};
    window.LEDGER_SOURCE = {label: 'Live', data: async () => null, name: async () => null, watch() {}, link: () => swLink,
      write: async (kind, body, opts) => {
        swCalls.push({kind, body: JSON.parse(JSON.stringify(body)), dryRun: !!opts.dryRun});
        if(window.swAnswer) return swAnswer(kind, body, opts);
        return {status: 200, error: null, body: {ok: true, kind: 'wholesale', undo: kind === 'undo', quote: 'checked-quote',
          rows: [{address: body.address, supplier: body.supplier, supplierName: 'Wholesale <img>', set: true,
            nextDeliveryDay: 50, hour: 8, cost: 1500, items: body.items || [], repeating: body.mode === 'weekly', error: null}]}};
      }};
    </script>`;
  const {page} = await H.openPage(t, await browser(), {html: H.boardHtml(fixture).replace('<title>', stub + '<title>'),
    hash: '#supply/deliveries', viewport: {width, height: 1000}, reducedMotion: 'reduce'});
  const shop = await page.evaluate(() => {
    const s = D.businesses.findIndex(b => b.status === 'retail');
    D.wholesale = {available: true, margin: .15, suppliers: [
      {key: 'supplier#4', name: 'Wholesale <img>', fee: 100, contact: true, hours: Array.from({length: 7}, () => [[8, 18]]), products: ['soda'], closed: false},
      {key: 'other#2', name: 'Other wholesaler', contact: false, hours: [], products: ['beer'], closed: false},
    ], rows: [
      {s, slug: 'soda', item: 'Soda', week: 700, stock: 100, scheduled: 50, deliveries: [], buy: 700, boxes: 14, box: 50, weekly: 810, current: 0, reason: null},
      {s, slug: 'beer', item: 'Beer', week: 100, stock: 0, scheduled: 0, deliveries: [], buy: 150, boxes: 3, box: 50, weekly: 120, current: 0, reason: null},
    ]};
    drawDeliveriesView(); wireAll();
    return D.businesses[s].key;
  });
  await page.locator('[data-sw-shop]').selectOption(shop);
  return page;
}
const orderPhase = (page, phase) => page.waitForFunction(p => document.querySelector('dialog.gw-dlg')?.dataset.phase === p, phase);

test('one click checks then applies weekly and one-off quantities for the selected supplier; undo is offered', async t => {
  for(const mode of ['weekly', 'once']) {
    const page = await linkedBoard(t);
    assert.match(await page.locator('.sw-order').innerText(), /New contract delivery fee: \$100/);
    assert.match(await page.locator('.sw-order').innerText(), /Weekly: Soda: 810/);
    assert.match(await page.locator('.sw-order').innerText(), /One-off: Soda: 700/);
    assert.equal(await page.locator('.sw-order img').count(), 0);
    await page.locator(`[data-gw-mode="${mode}"]`).click();
    await orderPhase(page, 'done');
    const calls = await page.evaluate(() => swCalls);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].dryRun, true);
    assert.equal(calls[1].dryRun, false);
    assert.deepEqual(calls[1].body, {...calls[0].body, quote: 'checked-quote'});
    assert.equal(calls[0].body.snapshot, 'read-stamp');
    assert.equal(calls[0].body.mode, mode);
    assert.deepEqual(calls[0].body.items, [{item: 'soda', amount: mode === 'weekly' ? 810 : 700}]);
    assert.equal(await page.locator('dialog.gw-dlg img').count(), 0);
    await page.locator('[data-gw-b="undo"]').click();
    await orderPhase(page, 'undone');
    assert.equal(await page.evaluate(() => swCalls.at(-1).kind), 'undo');
    assert.doesNotMatch(await page.locator('dialog.gw-dlg').innerText(), /undefined|NaN/);
  }
});

test('closed, unvisited and unsupported wholesalers explain disabled orders; copying remains available', async t => {
  const page = await linkedBoard(t, {width: 390});
  await page.evaluate(() => { swLink.hour = 18; gwMkTick(); });
  assert.equal(await page.locator('[data-gw-mode="weekly"]').isDisabled(), true);
  assert.match(await page.locator('.sw-order').innerText(), /wholesaler is closed/);
  assert.equal(await page.locator('[data-sw-copy="weekly"]').isDisabled(), false);
  await page.locator('[data-sw-supplier]').selectOption('other#2');
  assert.match(await page.locator('.sw-order').innerText(), /Visit this wholesaler/);
  const bounds = await page.locator('.sw-order').evaluate(el => ({right: el.getBoundingClientRect().right, width: innerWidth}));
  assert.ok(bounds.right <= bounds.width + 1);
  const old = await linkedBoard(t, {old: true});
  assert.equal(await old.locator('[data-gw-mode="weekly"]').isDisabled(), true);
  assert.match(await old.locator('[data-gw-mode="weekly"]').getAttribute('data-tip'), /0.7.0/);
});

test('a live refusal never applies and retry requires an explicit placement', async t => {
  const page = await linkedBoard(t);
  await page.evaluate(() => { window.swAnswer = async () => ({status: 200, error: null,
    body: {ok: false, kind: 'wholesale', rows: [{error: 'supplier_closed', set: false}]}}); });
  await page.locator('[data-gw-mode="weekly"]').click();
  await orderPhase(page, 'ready');
  assert.match(await page.locator('dialog.gw-dlg').innerText(), /wholesaler is closed now/);
  assert.equal(await page.evaluate(() => swCalls.length), 1);
  await page.evaluate(() => { window.swAnswer = null; });
  await page.locator('[data-gw-b="retry"]').click();
  await orderPhase(page, 'ready');
  assert.equal(await page.evaluate(() => swCalls.filter(c => !c.dryRun).length), 0);
  await page.locator('[data-gw-b="apply"]').click();
  await orderPhase(page, 'done');
});

test('an unanswered check or a closed dialog cannot auto-apply later', async t => {
  const page = await linkedBoard(t);
  await page.evaluate(() => { window.swAnswer = async () => ({status: 0, error: 'unreachable'}); });
  await page.locator('[data-gw-mode="once"]').click();
  await page.getByRole('button', {name: 'Try again', exact: true}).waitFor();
  await page.evaluate(() => { window.swAnswer = null; });
  await page.getByRole('button', {name: 'Try again', exact: true}).click();
  await orderPhase(page, 'ready');
  assert.equal(await page.evaluate(() => swCalls.filter(c => !c.dryRun).length), 0);
  await page.evaluate(() => document.querySelector('dialog.gw-dlg').close());
  await page.evaluate(() => { window.swAnswer = () => new Promise(resolve => { window.swRelease = resolve; }); });
  await page.locator('[data-gw-mode="once"]').click();
  await page.waitForFunction(() => !!window.swRelease);
  await page.evaluate(() => {
    document.querySelector('dialog.gw-dlg').close();
    swRelease({status: 200, error: null, body: {ok: true, quote: 'q', rows: [{set: true}]}});
  });
  assert.equal(await page.evaluate(() => swCalls.filter(c => !c.dryRun).length), 0);
});
