'use strict';
// Arithmetic runs through the same module Python embeds, without a board or DOM.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../template/open-factory-model.js');

function frozen(value){
  if(value && typeof value === 'object'){
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
function fixture(){
  return {
    facts: {
      game: {prices: 2, agent: 100, export: 0.5, wages: 0.7, delivery: 100, installFee: 5, driverHours: 5.7, hqHours: 40},
      products: {beer: {w: 20, i: 1.5, bx: 20}, cider: {w: 12, i: 1, bx: 10},
        water: {w: 1, i: 2, bx: 10}, grain: {w: 4, i: 1, bx: 25}, fruit: {w: 5, i: 1, bx: 40}},
      skills: {'ba:skill_factoryworker': 10, 'ba:skill_deliverydriver': 8,
        'ba:skill_purchasingagent': 12, 'ba:skill_logisticsmanager': 14},
      kits: {brew: [['machine', 1000], ['mount', 100]], press: [['press', 500]]},
      items: {machine: {p: 1000, v: ['equipment']}, mount: {p: 100, v: ['equipment', 'storage']},
        shelf: {p: 200, v: ['storage']}, press: {p: 500, v: ['equipment']}},
      shelf: {item: 'shelf', p: 200, cc: 60}, vehicles: {truck: {p: 4000}, van: {p: 2000}},
      sites: {factory: {shelves: 2}}, hq: {agents: 0, contracts: 0, managers: 0, managed: 0},
    },
    recipes: {beer: {out: 10, workstation: 'brew', ingredients: [{slug: 'water', per: 2}, {slug: 'grain', per: 3}]},
      cider: {out: 5, workstation: 'press', ingredients: [{slug: 'water', per: 1}, {slug: 'fruit', per: 4}]}},
    aliases: {water: 'tap'}, sources: {tap: {active: true}},
  };
}
const factory = frozen({key: 'factory', hood: 'industry', m2: 100, rent: 50, deposit: 1000});
const depot = frozen({key: 'depot', hood: 'industry', type: 'warehouse', status: 'vacant', rent: 30, deposit: 900});
const wage = base => base * (1 + Math.pow(1.05, 100) / 100) * 0.7;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('new factory prices kits, shared mounts, rounded storage, delivery and both installation modes', () => {
  const model = create(frozen(fixture()));
  const input = frozen({counts: {beer: 2}, building: factory});
  const inv = model.investment(input);
  assert.equal(inv.boxes, 157); // 48 beer + 68 water + 41 grain
  assert.equal(inv.shelves, 3);
  assert.deepEqual(inv.out.lines, [['machine', 2, 'ws'], ['mount', 2, 'ws'], ['shelf', 3, 'shelf']]);
  assert.deepEqual(inv.stores, [{key: 'equipment', lines: [0, 1]}, {key: 'storage', lines: [2]}]);
  assert.equal(inv.furniture, 2800);
  assert.equal(inv.delivery, 200);
  assert.equal(inv.fee, 500);
  assert.equal(inv.self, 8000);
  assert.equal(inv.firm, 8300);
  assert.deepEqual(model.investment(input), inv, 'repeated reads are identical and do not mutate frozen inputs');
});

test('a selected depot adds eight shelves, van, deposit and one delivery', () => {
  const inv = create(frozen(fixture())).investment(frozen({counts: {beer: 2}, building: factory, depot}));
  assert.deepEqual(inv.depot, {b: depot, deposit: 900, shelves: 8, racks: 1600, van: 2000, delivery: 100, total: 4600});
  assert.equal(inv.self, 12600);
  assert.equal(inv.firm, 12900);
});

test('empty rented factory and depot premises waive deposits but keep equipment and running rent', () => {
  const model = create(frozen(fixture()));
  const input = frozen({counts: {beer: 2}, building: {...factory, status: 'mine', occupant: null},
    depot: {...depot, status: 'mine', occupant: null}});
  const inv = model.investment(input);
  assert.equal(inv.deposit, 0);
  assert.equal(inv.depot.deposit, 0);
  assert.equal(inv.self, 12600 - factory.deposit - depot.deposit);
  assert.equal(inv.firm, 12900 - factory.deposit - depot.deposit);
  assert.equal(inv.truck, 4000);
  assert.equal(inv.depot.van, 2000);
  assert.equal(model.running(input, inv).rent, (factory.rent + depot.rent) * 7);
});

test('owned factories buy only added machines and storage, retaining other product ranges', () => {
  const model = create(frozen(fixture()));
  const inv = model.investment(frozen({counts: {beer: 2}, building: factory, owned: true, current: {beer: 1, cider: 2}, depot}));
  assert.deepEqual(inv.adds, {beer: 1});
  assert.equal(inv.boxes, 272, 'storage includes the retained cider range and pooled water');
  assert.equal(inv.placed, 2);
  assert.equal(inv.shelves, 3);
  assert.equal(inv.furniture, 1700);
  assert.equal(inv.truck, 0);
  assert.equal(inv.deposit, 0);
  assert.equal(inv.depot, null);
  assert.equal(inv.self, 1900);
  assert.equal(inv.firm, 2200);
});

test('unchanged or reduced owned production does not buy machines or bill delivery', () => {
  const model = create(frozen(fixture()));
  for(const count of [0, 1]){
    const inv = model.investment(frozen({counts: {beer: count}, building: factory, owned: true, current: {beer: 1}}));
    assert.equal(inv.items, 0);
    assert.equal(inv.furniture, 0);
    assert.equal(inv.delivery, 0);
    assert.equal(inv.self, 0);
  }
});

test('weekly running costs separate ingredients, machine hours, drivers, headquarters and rent', () => {
  const model = create(frozen(fixture()));
  const input = frozen({counts: {beer: 2}, building: factory, depot, wantsDepot: true});
  const inv = model.investment(input), run = model.running(input, inv);
  assert.equal(run.raw, 8064);
  close(run.workers, 2 * 168 * wage(10));
  close(run.driver, 2 * 5.7 * 7 * wage(8));
  close(run.hq, (wage(12) + 2 * wage(14)) * 40);
  assert.equal(run.rent, 560);
  close(run.wages, run.workers + run.driver + run.hq);
  close(run.total, run.raw + run.wages + run.rent);
});

test('owned running costs count only the selected range delta, including material savings', () => {
  const model = create(frozen(fixture()));
  const run = model.running(frozen({counts: {beer: 2}, owned: true, current: {beer: 1, cider: 2}}));
  assert.equal(run.raw, 4032);
  close(run.workers, 168 * wage(10));
  assert.equal(run.rent, 0);
  assert.equal(run.driver, 0);
  assert.equal(run.hq, 0);
  const less = model.running(frozen({counts: {beer: 0}, owned: true, current: {beer: 1}}));
  assert.equal(less.raw, -4032);
  assert.equal(less.wages, 0);
});

test('price lookup preserves aliases, agent discounts, exports and raw-unit conversion', () => {
  const input = frozen(fixture()), model = create(input);
  assert.equal(model.product('tap'), input.facts.products.water);
  assert.equal(model.wholesale('beer'), 60);
  assert.equal(model.importPrice('beer'), 45);
  assert.equal(model.exportPrice('beer'), 30);
  assert.equal(model.rawUnit('beer'), 2.4);
  assert.deepEqual(model.rawWeek({beer: 2, cider: 1}), {water: 840, grain: 1008, fruit: 672});
  assert.equal(model.saves({slug: 'beer', made: 100, want: 80}), 3360);
  for(const [agent, discount] of [[-1, 1], [0, 1], [100, 0.75], [120, 0.75], [undefined, 0.75]]){
    const data = fixture(); data.facts.game.agent = agent;
    assert.equal(create(frozen(data)).discount(), discount);
  }
});

test('headquarters hiring uses active aliased contracts and spare management capacity', () => {
  const input = fixture();
  input.facts.hq = {agents: 2, contracts: 1, managers: 3, managed: 1};
  const model = create(frozen(input));
  assert.deepEqual(model.uncontracted({beer: 1}), ['grain']);
  assert.deepEqual(model.hq({beer: 1}, true), {managers: 0, agents: 0});
  const contracted = fixture(); contracted.sources.grain = {active: true};
  assert.deepEqual(create(frozen(contracted)).hq({beer: 1}), {managers: 1, agents: 0});
});

test('depot choice is deterministic, keeps owned premises, and replaces invalid choices without mutation', () => {
  const model = create();
  const a = {...depot, key: 'a'}, b = {...depot, key: 'b'}, far = {...depot, key: 'far', hood: 'elsewhere', rent: 1};
  const buildings = frozen([b, far, a, {...depot, key: factory.key, rent: 0}, {...depot, key: 'no-rent', rent: null}]);
  assert.equal(model.selectDepot({building: factory, buildings}).key, 'a');
  assert.equal(model.selectDepot({building: factory, buildings, rememberedKey: 'b'}).key, 'b');
  assert.equal(model.selectDepot({building: factory, buildings, rememberedKey: factory.key}).key, 'a');
  const owned = frozen([{...a, status: 'mine'}, b]);
  assert.equal(model.selectDepot({building: factory, buildings: owned, rememberedKey: 'a'}).key, 'a');
  assert.equal(model.selectDepot({building: factory, buildings: owned}).key, 'a');
  const occupied = frozen([{...a, status: 'mine', occupant: {typeSlug: 'ba:businesstype_factory'}}, b]);
  assert.equal(model.selectDepot({building: factory, buildings: occupied, rememberedKey: 'a'}).key, 'b');
  const rival = frozen([{...a, status: 'rival'}, far]);
  assert.equal(model.selectDepot({building: factory, buildings: rival, rememberedKey: 'a'}).key, 'far');
  assert.equal(model.selectDepot({building: factory, buildings: []}), null);
});

test('missing game tables, prices, recipes and buildings retain existing fallbacks', () => {
  const model = create();
  assert.equal(model.investment({counts: {}, building: factory}), null);
  assert.equal(create({facts: {kits: {}}}).investment({counts: {}, building: null}), null);
  assert.equal(model.importPrice('unknown'), 0);
  assert.equal(model.rawUnit('unknown'), 0);
  assert.equal(model.boxes({unknown: 10}), 0);
  assert.deepEqual(model.rawWeek({unknown: 10}), {});
  assert.deepEqual([...model.kit({unknown: 10})], []);
  assert.equal(model.running({counts: {}}).total, 0);
  const noBox = fixture(); delete noBox.facts.products.grain.bx;
  assert.equal(create(frozen(noBox)).boxes({beer: 2}), 116);
});
