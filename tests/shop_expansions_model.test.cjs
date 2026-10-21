const {test} = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../template/open-store-model.js');
const {fixture} = require('./_shop_expansions.cjs');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ~= ${b}`);

test('an addition counts a new seller, prices a complete kit and repays only from the increment', () => {
  const {facts, building, options} = fixture();
  const m = Model.create({facts});
  const [r] = m.expansions('T', building, options);
  assert.equal(r.p, 'P');
  assert.equal(r.demand, 85.5);
  close(r.units, 6 / 7);
  assert.equal(r.price, 15);
  close(r.margin, 66 / 7);
  // 20 capacity: two 10-capacity displays and two required supports.
  assert.deepEqual(r.kit.lines.map(l => l.slice(0, 2)), [['display', 2], ['support', 2]]);
  assert.equal(r.kit.equipment, 240);
  assert.equal(r.kit.delivery, 50);
  close(r.stock, 24);
  close(r.investment, 314);
  assert.equal(r.payback, 34);
});

test('other shops lose demand, but the same shop’s historical sales do not count as a loss', () => {
  const {facts, building, options} = fixture();
  facts.sales = {H: {P: [['k', 1000, 10], ['other', 10, 2]]}};
  facts.market.P.hoods.H = [1, 0, null];
  const m = Model.create({facts});
  const [r] = m.expansions('T', building, {...options, extraCost: 3});
  close(r.loss, 20 * (1 - m.demandWith(2, 10) / m.demandWith(1, 10)));
  close(r.net, r.margin - r.loss - 3);
  assert.equal(r.payback, Math.ceil(r.investment / r.net));
});

test('existing products disappear and negative margin has no payback', () => {
  const {facts, building, options} = fixture();
  const [r] = Model.create({facts}).expansions('T', building, {...options, extraCost: 100});
  assert.ok(r.net < 0);
  assert.equal(r.payback, null);
  facts.built.k.sells.push('P');
  assert.deepEqual(Model.create({facts}).expansions('T', building, options), []);
});

test('missing equipment prices never become a free investment', () => {
  const {facts, building, options} = fixture();
  delete facts.items.support;
  const [r] = Model.create({facts}).expansions('T', building, options);
  assert.equal(r.kit, null);
  assert.equal(r.investment, null);
  assert.equal(r.payback, null);
});

test('selects complete equipment by total delivered cost and includes a scale once', () => {
  const {facts, building, options} = fixture();
  facts.items.big = {p: 210, v: ['shop']};
  facts.items.scale = {p: 50, v: ['shop']};
  facts.types.T.expansionDisplays.P.push({capacity: 30, lines: [['big', 1]], extra: [['scale', 1]]});
  // First kit 240 + delivery; second 260 + delivery: first still wins.
  assert.equal(Model.create({facts}).expansions('T', building, options)[0].kit.equipment, 240);
  facts.items.big.p = 100;
  const [r] = Model.create({facts}).expansions('T', building, options);
  assert.equal(r.kit.equipment, 150);
  assert.equal(r.kit.lines.find(l => l[0] === 'scale')[1], 1);
});

test('unknown hours, satisfaction, promotion, capacity, providers and legacy rules remain unavailable', () => {
  for(const mutate of [f => {f.facts.game.capInitial = false;}, f => {delete f.options.open;},
    f => {f.options.sat = null;}, f => {f.options.promoTotal = null;},
    f => {delete f.facts.built.k;}, f => {f.building.cap = 0;}, f => {f.building.factsUnavailable = true;}]){
    const f = fixture(); mutate(f);
    assert.equal(Model.create({facts: f.facts}).expansions('T', f.building, f.options), null);
  }
});

test('closed hours and zero satisfaction/promotion are known values, without invented sales', () => {
  const {facts, building, options} = fixture();
  const [r] = Model.create({facts}).expansions('T', building, {...options, open: Array.from({length: 7}, () => []), sat: 0, promoTotal: 0});
  assert.equal(r.units, 0);
  assert.equal(r.payback, null);
});
