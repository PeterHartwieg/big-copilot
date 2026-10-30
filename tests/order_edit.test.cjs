// Run with: node --test tests/order_edit.test.cjs
// Phase 1 of editing a purchase order: pre-fill, the old-to-new diff, and
// copy/restore. The write itself is the existing weekly and imports paths;
// these tests hand them a contract and read the body, and they never await
// the clipboard (the board VM's stand-in never settles).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {loadBoard} = require('./_board.cjs');

const context = loadBoard();
const run = code => vm.runInContext(code, context);
/* A value made in the board VM has that realm's prototypes, so compare the
   plain JSON of it with one made here. */
const plain = v => JSON.parse(JSON.stringify(v));

function memory(){
  const box = {};
  context.localStorage = {
    getItem(k){ return Object.prototype.hasOwnProperty.call(box, k) ? box[k] : null; },
    setItem(k, v){ box[k] = String(v); },
  };
  return box;
}

const weekly = {
  id: 'w:shop#3|wh#1|0', shop: 'shop#3', s: 0, supplier: 'wh#1',
  supplierName: 'Warehouse & Co', enabled: true, mode: 'weekly', next: 40, fee: 100,
  items: [
    {slug: 'soda', item: 'Soda', amount: 40, price: 2},
    {slug: 'gift', item: 'Gift', amount: 10, price: 5},
  ],
};
const agent = {
  contract: 'C1', who: 'Mara', importer: 'Jet Cargo', smart: false, repeating: true,
  urgent: false, active: true, next: 50,
  products: [
    {slug: 'sugar', item: 'Sugar', s: 0, key: 'hub#1', where: 'Hub', amount: 5000},
    {slug: 'flour', item: 'Flour', s: 1, key: 'factory#2', where: 'Factory', amount: 100},
  ],
};
const link = {writes: ['wholesale', 'imports'], stamp: 'stamp-1'};

function setBoard(){
  context.__roles = {managers: [], agents: [agent]};
  context.__wholesale = {rows: [], margin: 0.15, available: true, suppliers: [
    {key: 'wh#1', name: 'Warehouse & Co', products: ['soda', 'gift', 'beer']}], contracts: [weekly]};
  run(`D = {meta: {character: 'Ann'}, businesses: [
    {key: 'shop#3', name: 'Shop', status: 'retail'},
    {key: 'hub#1', name: 'Hub', status: 'support'},
    {key: 'factory#2', name: 'Factory', status: 'support'}],
    supply: {roles: __roles}, wholesale: __wholesale, names: {}}`);
}

test('a wholesale contract and an import contract pre-fill their current lines', () => {
  setBoard();
  const order = context.poFromWholesale(weekly);
  assert.equal(order.kind, 'wholesale');
  assert.deepEqual(plain(order.lines.map(l => [l.slug, l.item, l.amount, l.price, l.expect])), [
    ['soda', 'Soda', 40, 2, 40], ['gift', 'Gift', 10, 5, 10]]);
  const open = context.poFormBody(order, context.poLines(order), {write: true, reason: ''});
  assert.match(open, /Warehouse &amp; Co/);
  assert.match(open, /Weekly/);
  assert.match(open, /next delivery day 40/);
  assert.match(open, /value="40"/);
  assert.match(open, /value="10"/);
  assert.match(open, /data-po-amount="0"/);

  const imp = context.poFromAgent(agent);
  assert.equal(imp.mode, 'weekly');
  assert.deepEqual(plain(imp.lines.map(l => [l.slug, l.amount, l.warehouse, l.s, l.expect])), [
    ['sugar', 5000, 'hub#1', 0, 5000], ['flour', 100, 'factory#2', 1, 100]]);
  const read = context.poFormBody(imp, context.poLines(imp), context.poGate(imp, null));
  assert.match(read, /Sugar/);
  assert.match(read, />5,000</);
  assert.doesNotMatch(read, /data-po-amount/);
});

test('a missing or older Link, a stopped contract and a one-off stay read-only', () => {
  const order = context.poFromWholesale(weekly);
  const imp = context.poFromAgent(agent);
  assert.deepEqual(plain(context.poGate(order, null)), {write: false, reason: 'missing'});
  assert.deepEqual(plain(context.poGate(order, {writes: []})), {write: false, reason: 'old'});
  assert.match(context.poGateSay(context.poGate(order, null), order),
    /Update Big Copilot Link to version 0\.7\.0 or later/);
  assert.match(context.poGateSay(context.poGate(imp, {writes: ['wholesale']}), imp),
    /Update the Big Copilot Link mod to change imports from here/);

  const stopped = context.poFromWholesale({...weekly, enabled: false});
  assert.deepEqual(plain(context.poGate(stopped, link)), {write: false, reason: 'stopped'});
  assert.match(context.poGateSay(context.poGate(stopped, link), stopped), /will not start it again/);
  const stoppedImport = context.poFromAgent({...agent, active: false});
  assert.equal(context.poGate(stoppedImport, link).reason, 'stopped');

  assert.equal(context.poGate(context.poFromWholesale({...weekly, mode: 'once'}), link).reason, 'phase2');
  assert.equal(context.poGate(context.poFromWholesale({...weekly, mode: 'urgent'}), link).reason, 'phase2');
  assert.equal(context.poGate(context.poFromAgent({...agent, smart: false, repeating: false}), link).reason, 'phase2');
  assert.match(context.poGateSay({write: false, reason: 'phase2'}, order), /later Link update/);

  assert.deepEqual(plain(context.poGate(order, link)), {write: true, reason: ''});
  assert.deepEqual(plain(context.poGate(context.poFromAgent({...agent, smart: true}), link)), {write: true, reason: ''});
});

test('clearing every line points at BizMan, and a wholesale line cannot drop to zero yet', () => {
  const order = context.poFromWholesale(weekly);
  const none = order.lines.map(l => ({...l, amount: 0}));
  assert.match(context.poBlock(order, none), /Cancel the contract in BizMan/);
  assert.match(context.poBlock(order, []), /does not delete an order/);
  assert.match(context.poBlock(order, [{...order.lines[0], amount: 0}, order.lines[1]]), /at least 1/);
  assert.match(context.poBlock(order, [{...order.lines[0], amount: 1.5}, order.lines[1]]), /whole number/);
  assert.equal(context.poBlock(order, order.lines), '');

  const imp = context.poFromAgent(agent);
  assert.equal(context.poBlock(imp, [{...imp.lines[0], amount: 0}, imp.lines[1]]), '');
  assert.match(context.poBlock(imp, imp.lines.map(l => ({...l, amount: 0}))), /BizMan/);
  assert.match(context.poBlock(imp, [{...imp.lines[0], warehouse: null}, imp.lines[1]]), /no warehouse/);
});

test('the diff names each line old to new, the cost, and a moved delivery day', () => {
  const before = [
    {slug: 'soda', item: 'Soda', amount: 40, warehouse: ''},
    {slug: 'gift', item: 'Gift', amount: 10, warehouse: ''},
  ];
  const after = [
    {slug: 'soda', item: 'Soda', amount: 90, warehouse: ''},
    {slug: 'gift', item: 'Gift', amount: 4, warehouse: ''},
    {slug: 'beer', item: 'Beer', amount: 3, warehouse: ''},
  ];
  const diff = context.poDiff(before, after, {costBefore: 230, costAfter: 1980, dayBefore: 40, dayAfter: 43});
  assert.deepEqual(plain(diff.rows.map(r => [r.item, r.old, r.neu])), [
    ['Soda', 40, 90], ['Gift', 10, 4], ['Beer', null, 3]]);
  assert.match(diff.dayNote, /from day 40 to day 43/);
  assert.equal(context.poDiff(before, before, {dayBefore: 40, dayAfter: 40}).dayNote, '');
  assert.equal(context.poDiff(before, after, {dayBefore: 40}).dayNote, '');
  const html = context.poDiffHtml(diff);
  assert.match(html, /Now/);
  assert.match(html, /After/);
  assert.match(html, /Soda/);
  assert.match(html, /Cost goes from \$230 to \$1,980/);
  assert.match(html, /from day 40 to day 43/);

  const order = context.poFromWholesale(weekly);
  assert.equal(context.poCost(order, order.lines), 40 * 2 + 10 * 5 + 100);
  const fresh = {...order, reenter: true, next: null};
  const quoted = context.poAnswerDiff(fresh, [], order.lines, {rows: [{
    cost: 500, nextDeliveryDay: 48, items: [{item: 'soda', amount: 40}, {item: 'gift', amount: 10}]}]});
  assert.match(quoted, /—/);
  assert.match(quoted, /The game quotes \$500/);
  assert.doesNotMatch(quoted, /moves from day/);
});

test('an edit reuses the weekly wholesale body and leaves a stopped import unstarted', () => {
  const order = context.poFromWholesale(weekly);
  const body = context.poWholesaleBody(order, order.lines);
  assert.equal(body.mode, 'weekly');
  assert.equal(Object.hasOwn(body, 'edit'), false);
  assert.deepEqual(plain(body.address), {street: 'shop', number: 3});
  assert.deepEqual(plain(body.supplier), {street: 'wh', number: 1});
  assert.deepEqual(plain(body.items), [{item: 'soda', amount: 40}, {item: 'gift', amount: 10}]);

  const imp = context.poFromAgent(agent);
  const sent = context.poImportBody(imp, imp.lines.map((l, i) => ({...l, amount: i === 0 ? 4800 : l.amount})));
  assert.equal(sent.contracts.length, 1);
  assert.equal(sent.contracts[0].activate, false);
  assert.equal(sent.contracts[0].id, 'C1');
  assert.deepEqual(plain(sent.contracts[0].products[0]), {
    itemName: 'sugar', warehouse: {street: 'hub', number: 1}, amount: 4800, expect: 5000});
  const stopped = context.poFromAgent({...agent, active: false});
  assert.equal(context.poImportBody(stopped, stopped.lines).contracts[0].activate, false);
});

test('copy keeps the lines in this browser and restore puts a cancelled order back', () => {
  memory();
  const order = context.poFromWholesale(weekly);
  const text = context.poRemember(context.poSnapshot(order, order.lines));
  assert.match(text, /Warehouse & Co/);
  assert.match(text, /Soda: 40/);
  assert.match(text, /Gift: 10/);
  const saved = context.poRecall('wholesale', order.id);
  assert.equal(saved.v, 1);
  assert.deepEqual(plain(saved.lines.map(l => [l.slug, l.amount])), [['soda', 40], ['gift', 10]]);

  const raised = {...saved, lines: saved.lines.map(l => l.slug === 'soda' ? {...l, amount: 77} : l)};
  const over = context.poRestoreLines(order.lines, raised);
  assert.deepEqual(plain(over.map(l => [l.slug, l.amount])), [['soda', 77], ['gift', 10]]);
  const withNew = context.poRestoreLines(order.lines.slice(0, 1), saved);
  assert.deepEqual(plain(withNew.map(l => l.slug)), ['soda', 'gift']);

  const cancelled = context.poRestoreLines([], saved);
  assert.deepEqual(plain(cancelled.map(l => [l.slug, l.amount])), [['soda', 40], ['gift', 10]]);

  const imp = context.poFromAgent(agent);
  const snap = context.poSnapshot(imp);
  snap.lines = [...snap.lines, {slug: 'new', item: 'New', amount: 3, warehouse: 'hub#1'}];
  const kept = context.poRestoreLines(imp.lines, snap);
  assert.deepEqual(plain(kept.map(l => l.slug)), ['sugar', 'flour']);
  assert.equal(context.poRestoreLines([], snap).length, 3);

  context.localStorage = {getItem(){ return {not: 'a string'}; }, setItem(){ throw new Error('private'); }};
  assert.deepEqual(plain(context.poReadAll()), {});
  assert.doesNotThrow(() => context.poWriteAll({a: 1}));
});

test('Deliveries lists both kinds of contract, and a copied order survives without Link', () => {
  memory();
  setBoard();
  const html = context.poContractsHtml('deliveries');
  assert.match(html, /data-po-edit="wholesale"/);
  assert.match(html, /data-po-edit="import"/);
  assert.match(html, /Warehouse &amp; Co/);
  assert.match(html, /Soda/);
  assert.match(html, /Sugar/);
  assert.match(html, />Edit</);

  context.poRemember(context.poSnapshot(context.poFromWholesale({...weekly, id: 'gone', supplierName: 'Old Market'})));
  const roles = context.poContractsHtml('roles');
  assert.match(roles, /Copied orders/);
  assert.match(roles, /with or without Link/);
  assert.match(roles, /data-po-copied="wholesale\|gone"/);
  assert.match(roles, /Old Market/);
  assert.doesNotMatch(roles, /data-po-edit="import"/);
});

test('putting a cancelled weekly order back is a new weekly write, not a restart', () => {
  const again = context.poFromSnap(context.poSnapshot(context.poFromWholesale(weekly)));
  assert.equal(again.reenter, true);
  assert.deepEqual(plain(context.poGate(again, link)), {write: true, reason: ''});
  assert.equal(context.poWholesaleBody(again, again.lines).mode, 'weekly');
  const imp = context.poFromSnap(context.poSnapshot(context.poFromAgent(agent)));
  assert.deepEqual(plain(context.poGate(imp, link)), {write: false, reason: 'gone'});
  assert.match(context.poGateSay(context.poGate(imp, null), imp), /entered again in BizMan/);
});
