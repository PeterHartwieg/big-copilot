// keptRecord() and rememberedRecord() in template/board.js, the field tables
// the remembered plans and filters are read back through, and the four
// readers on stored records of every shape an earlier board wrote:
// osLoad() (Open a store), ofLoad() (Plan a factory), sfLoad() (Street Food
// routes) and loadFinder() in web/map.js. No browser: the board runs in a VM
// (tests/_board.cjs) with a storage that answers from a Map.
'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {loadBoard} = require('./_board.cjs');

const ROOT = path.join(__dirname, '..');

/* The board with web/map.js in it, a storage that answers from `store`, and a
   save for the character Ann. */
function board(){
  const store = new Map();
  const localStorage = {getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)};
  const b = loadBoard({localStorage});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'web', 'map.js'), 'utf8'), b, {filename: 'web/map.js'});
  vm.runInContext('D = {meta: {character: "Ann", save: "Ann save", day: 40}, businesses: [], names: {}}', b);
  const run = code => vm.runInContext(code, b);
  const json = code => JSON.parse(run(`JSON.stringify(${code})`));
  return {store, run, json};
}
/* What one reader leaves after reading `stored` (a value to store as JSON, or
   a string stored as it is). */
function reads(b, {key, load, state}, stored){
  b.store.clear();
  if (stored !== undefined) b.store.set(b.run(key), typeof stored === 'string' ? stored : JSON.stringify(stored));
  b.run(load);
  return b.json(state);
}
const OS = {key: 'osStore()', load: 'osPlansFor = null; osLoad()', state: '({plans: osPlans, cur: osCur, step: osStep})'};
const OF = {key: 'ofStore()', load: 'ofPlansFor = null; ofLoad()', state: '({plans: ofPlans, cur: ofCur, step: ofStep, planType, planTarget, planCounts})'};
const SF = {key: 'sfStore()', load: 'sfPlansFor = null; sfLoad()', state: '({plans: sfPlans, cur: sfCur})'};
const FINDER = {key: '"ba_finder_v1:Ann"',
  load: `globalThis.__finder = {planning: false, fsCharacter: null, finderStore: CityMapView.prototype.finderStore,
    sortKeys: CityMapView.prototype.sortKeys}; CityMapView.prototype.loadFinder.call(__finder)`,
  state: '({fs: __finder.fs, keys: Object.keys(__finder.fs)})'};

// --- the helper ------------------------------------------------------------------------

test('a closed record holds the table\'s fields in its order, each with its own fallback', () => {
  const {json} = board();
  const shape = '({b: KEEP.num(0), a: KEEP.str("none"), c: KEEP.oneOf(["x", "y"], "x"), gone: () => undefined})';
  assert.deepEqual(json(`keptRecord({a: "kept", b: "7", c: "y", d: "extra", gone: 1}, ${shape})`), {b: 0, a: 'kept', c: 'y'});
  assert.deepEqual(json(`Object.keys(keptRecord({a: "kept"}, ${shape}))`), ['b', 'a', 'c']);
  // Not an object: an empty record, every field at its fallback.
  for (const raw of ['null', 'undefined', '5', '"text"', 'true'])
    assert.deepEqual(json(`keptRecord(${raw}, ${shape})`), {b: 0, a: 'none', c: 'x'}, raw);
  // A rule sees the whole stored record too.
  assert.deepEqual(json('keptRecord({n: 2, m: 3}, {sum: (v, r) => r.n + r.m})'), {sum: 5});
});

test('an open record keeps the base, then every stored field, then the table\'s', () => {
  const {json} = board();
  const base = '{on: false, sort: "score", show: "rent", hoods: null}';
  const got = json(`keptRecord({sort: "m2", extra: 1, old: true}, {show: (v, r) => v || (r.old ? "takeover" : "rent"), old: () => undefined}, ${base})`);
  assert.deepEqual(got, {on: false, sort: 'm2', show: 'takeover', hoods: null, extra: 1});
  assert.deepEqual(Object.keys(got), ['on', 'sort', 'show', 'hoods', 'extra']);
  assert.deepEqual(json(`keptRecord(null, {show: v => v || "rent"}, ${base})`), {on: false, sort: 'score', show: 'rent', hoods: null});
  // The base is copied, not changed.
  assert.equal(json(`(b => (keptRecord({sort: "m2"}, {}, b), b.sort))(${base})`), 'score');
});

test('each rule keeps what it should and turns the rest into its fallback', () => {
  const {json} = board();
  const all = rule => json(`[undefined, null, 0, 2.5, NaN, "", "s", true, false, [], [1], {}].map(${rule})`);
  assert.deepEqual(all('KEEP.str()'), [null, null, null, null, null, '', 's', null, null, null, null, null]);
  assert.deepEqual(all('KEEP.num(-1)'), [-1, -1, 0, 2.5, -1, -1, -1, -1, -1, -1, -1, -1]);
  assert.deepEqual(all('KEEP.bool()'), [null, null, null, null, null, null, null, true, false, null, null, null]);
  assert.deepEqual(all('KEEP.flag()'), [false, false, false, true, false, false, true, true, false, true, true, true]);
  assert.deepEqual(all('KEEP.oneOf(["s", 0])'), [null, null, 0, null, null, null, 's', null, null, null, null, null]);
  assert.deepEqual(json('[{a: 1, b: -1, c: "2"}, [1, 2], null, "x"].map(KEEP.table(n => Number.isFinite(n) && n >= 0))'), [{a: 1}, {}, {}, {}]);
  assert.deepEqual(json('[{on: 1, x: 2}, "x", null].map(KEEP.record({on: KEEP.flag()}))'), [{on: true}, {on: false}, {on: false}]);
  const list = 'KEEP.list(n => n > 9 ? null : n * 2, {keep: n => typeof n === "number", max: 3})';
  assert.deepEqual(json(`[[1, "a", 2, 10, 3, 4], "x", null, {}].map(${list})`), [[2, 4, 6], [], [], []]);
});

test('rememberedRecord() reads the key, and a record that will not parse reads as empty', () => {
  const b = board();
  const shape = '{n: KEEP.num(0)}';
  b.store.set('k', '{"n": 4}');
  assert.deepEqual(b.json(`rememberedRecord("k", ${shape})`), {n: 4});
  b.store.set('k', 'not json{');
  assert.deepEqual(b.json(`rememberedRecord("k", ${shape})`), {n: 0});
  assert.deepEqual(b.json(`rememberedRecord("missing", ${shape})`), {n: 0});
});

// --- the readers, on what earlier boards stored ------------------------------------------

const osPlan = {id: 'p1', type: 'ba:businesstype_giftshop', hood: 'ba:neighborhood_midtown', key: null, mode: 'firm',
  finance: {on: true, amount: 5000, bank: 'VantanderBankSettings'}, step: 'investment', made: 12, snap: null, opened: null, paid: false, sold: false};

test('Open a store reads back a plan as it was stored, and older and broken plans as they always read', () => {
  const b = board();
  assert.deepEqual(reads(b, OS, {plans: [osPlan], current: 'p1'}), {plans: [osPlan], cur: 'p1', step: 'investment'});
  // A plan kept before `sold` was: one whose store opened is a record, one still open is not.
  const {sold, ...noSold} = osPlan;
  assert.deepEqual(reads(b, OS, {plans: [{...noSold, opened: 20}, {...noSold, id: 'p2'}]}).plans.map(p => [p.id, p.sold]),
    [['p1', true], ['p2', false]]);
  // Each field falls back on its own; a plan without a string id or type is dropped.
  const got = reads(b, OS, {plans: [{id: 'p1', type: 't', hood: 3, key: 4, mode: 'boss', finance: 'x', step: 'later',
    made: '9', snap: {inv: {fee: '12'}, curve: [1, 'a']}, opened: '5', paid: 1}, {id: 2, type: 't'}, null, 'p3'], current: 2});
  assert.deepEqual(got, {plans: [{id: 'p1', type: 't', hood: null, key: null, mode: null, finance: {on: false, amount: null, bank: null},
    step: 'what', made: 9, snap: {inv: {furniture: 0, fee: 12, deposit: 0, decor: 0, delivery: 0, firm: 0, self: 0}, cash: null, profit: null,
      days: null, curve: [1]}, opened: null, paid: true, sold: false}], cur: null, step: 'what'});
  assert.deepEqual(reads(b, OS, {plans: [{...osPlan, finance: {on: 0, amount: '-40', bank: 7}, made: 0}]}).plans[0],
    {...osPlan, finance: {on: false, amount: 0, bank: null}, made: null});
  for (const junk of [undefined, 'not json{', 'null', '[]', {plans: 'x'}, {current: 'p1'}])
    assert.deepEqual(reads(board(), OS, junk), {plans: [], cur: null, step: 'what'}, String(junk));
});

const ofPlan = {id: 'f1', type: 'ba:businesstype_factory', site: null, counts: {beer: 2}, size: 'peak', key: null, mode: 'self',
  depot: null, depotKey: null, finance: {on: false, amount: null, bank: null}, step: 'where', made: 30, inv: null};

test('Plan a factory reads back a plan as it was stored, the first twelve, and each bad field as it always read', () => {
  const b = board();
  assert.deepEqual(reads(b, OF, {plans: [ofPlan], current: 'f1'}),
    {plans: [ofPlan], cur: 'f1', step: 'where', planType: 'ba:businesstype_factory', planTarget: 'new', planCounts: {beer: 2}});
  const got = reads(b, OF, {plans: [{id: 'f1', type: 't', site: 1, counts: {a: 1, b: -1, c: '2', d: 1.5}, size: 'huge', key: 2,
    mode: 'self', depot: 'yes', depotKey: 3, finance: [], step: 'nope', made: '30', inv: 4.5}], current: 'f1'});
  assert.deepEqual(got.plans, [{id: 'f1', type: 't', site: null, counts: {a: 1, d: 1.5}, size: 'custom', key: null, mode: 'self',
    depot: null, depotKey: null, finance: {on: false, amount: null, bank: null}, step: 'what', made: null, inv: 4.5}]);
  const many = reads(b, OF, {plans: Array.from({length: 15}, (_, i) => ({...ofPlan, id: `f${i}`})), current: 'f14'});
  assert.equal(many.plans.length, 12);
  assert.equal(many.cur, null, 'the current plan was past the twelfth');
  // A fresh board for each: the planner's own type and counts outlast a read of the same character.
  for (const junk of [undefined, 'not json{', '5', {plans: {}}])
    assert.deepEqual(reads(board(), OF, junk), {plans: [], cur: null, step: 'what', planType: null, planTarget: null, planCounts: {}}, String(junk));
});

test('a Street Food route reads back as stored, and an older or broken one as it always read', () => {
  const b = board();
  const route = {id: 'r1', name: 'Morning run', vehicleId: null, kind: 'cart', weekday: 2,
    stops: [{id: 's1', name: 'Corner', x: 10, z: 20, open: 600, close: 720, key: 'ba:street_a#1'}], from: null};
  assert.deepEqual(reads(b, SF, {plans: [route], current: 'r1'}), {plans: [route], cur: 'r1'});
  // Before a stop kept its building and a route its kind: no key, a cart; an
  // unnamed route is called so, and with no current the first one is on screen.
  const old = reads(b, SF, {plans: [{id: 'r1', name: '', weekday: 2, vehicleId: 7,
    stops: [{id: 's1', name: 'Corner', x: 10, z: 20, open: 600, close: 720}]}]});
  assert.deepEqual(old, {plans: [{id: 'r1', name: b.json('tt("map.sf.plan.unnamed", "Untitled route")'), vehicleId: null, kind: 'cart',
    weekday: 2, stops: [{id: 's1', name: 'Corner', x: 10, z: 20, open: 600, close: 720, key: null}], from: null}], cur: 'r1'});
  // The model drops a route it cannot read (a weekday past Sunday, a stop with no hours).
  assert.deepEqual(reads(b, SF, {plans: [{...route, weekday: 9}, {...route, id: 'r2', stops: [{id: 's1', x: 1, z: 2}]}, {...route, id: 'r3'}],
    current: 'r1'}).plans.map(p => p.id), ['r3']);
  assert.equal(reads(b, SF, {plans: Array.from({length: 25}, (_, i) => ({...route, id: `r${i}`}))}).plans.length, 20);
  for (const junk of [undefined, 'not json{', {plans: [null, 1, {id: 3}]}])
    assert.deepEqual(reads(b, SF, junk), {plans: [], cur: null}, String(junk));
});

test('the finder\'s filters read back over the defaults, with the old switches and English neighbourhoods migrated', () => {
  const b = board();
  const defaults = b.json('finderDefaults()');
  const keys = Object.keys(defaults);
  assert.deepEqual(reads(b, FINDER, undefined), {fs: defaults, keys});
  assert.deepEqual(reads(b, FINDER, 'not json{'), {fs: defaults, keys});
  const kept = reads(b, FINDER, {cat: 'warehouse', show: 'sale', hoods: ['ba:neighborhood_midtown', 'Nowhere', 3],
    layouts: ['S1', 2], minM2: 50, sort: 'm2', saleSort: 'payback', on: true, extra: 'kept'});
  assert.deepEqual(kept.fs, {...defaults, cat: 'warehouse', show: 'sale', hoods: ['ba:neighborhood_midtown'], layouts: ['S1'],
    minM2: 50, sort: 'm2', sortPicked: false, saleSort: 'payback', on: false, extra: 'kept'}, 'm2 is a warehouse\'s own order: not a pick');
  assert.deepEqual(kept.keys, [...keys, 'extra']);
  // Availability was two switches: `buy` opens the takeover list; the old keys go.
  assert.deepEqual(reads(b, FINDER, {buy: true, vac: true, sale: 1, dir: 'up'}).fs, {...defaults, show: 'takeover'});
  // A sort kept before picks were: picked unless it is the category's own order; a kept pick stands.
  assert.equal(reads(b, FINDER, {sort: 'traffic'}).fs.sortPicked, true);
  assert.equal(reads(b, FINDER, {sort: 'score'}).fs.sortPicked, false);
  assert.equal(reads(b, FINDER, {sort: 'traffic', sortPicked: false}).fs.sortPicked, false);
  assert.deepEqual(reads(b, FINDER, {hoods: 'Midtown', layouts: 'S1', saleSort: 'bogus', show: 0}).fs,
    {...defaults, hoods: null, layouts: [], saleSort: 'price', show: 'rent'});
});
