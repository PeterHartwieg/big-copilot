// Mods › Browse mods and Mods › Street Food (the sf* functions in
// template/board.js), drawn in a VM against synthetic payloads: what each
// catalogue row says about the save and the board's support, the planner's
// states, plans kept per character and never replaced by an import, the
// model's issues as sentences, and when the route write is offered.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {loadBoard, recordingDocument} = require('./_board.cjs');

/* An inert stub like _board.cjs's, for a window that also carries a source. */
const inert = new Proxy(function(){}, {
  get(_, key){
    if(key === Symbol.toPrimitive) return () => 0;
    if(key === Symbol.iterator) return function*(){};
    if(key === 'length') return 0;
    return inert;
  },
  apply: () => inert, construct: () => inert, set: () => true,
});
function storage(){
  const m = new Map();
  return {getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, map: m};
}
/* The board with a recording document, a real storage and, when given, a linked source. */
function board({store = storage(), link = null} = {}){
  const {document, element} = recordingDocument();
  const source = {label: 'Live', data: async () => null, link: () => link, write: async () => ({status: 0, error: 'unreachable', body: null}),
    section: async () => ({})};
  const window = new Proxy({}, {get: (_, key) => key === 'LEDGER_SOURCE' ? source : inert[key], set: () => true});
  const b = loadBoard({document, window, localStorage: store});
  return {b, element, store};
}
const week = span => [0, 1, 2, 3, 4, 5, 6].map(() => [span]);
const SF = () => ({
  status: 'ready', version: '0.10.0', schemaVersion: 1, day: 12, weekday: 1, minute: 720, gameSpeed: 1, travelBasis: 'default',
  rules: {radiusMetres: 50, travel: {driveMinutesPerMetre: 0.04, pushMetresPerSecond: 4, roadFactor: 1},
    schedules: {maxStops: 6, latestCloseMinute: 1620, restockMinutes: 30}},
  vehicles: [{id: 'v1', name: 'Taco Cart', kind: 'cart', routeRevision: 'rev-3', position: {x: 10, z: 10}, home: null,
    crew: [{id: 'e1', name: 'Ann', exists: true}],
    schedule: {days: [1], stops: [{id: 'a', name: 'Pier', day: 1, x: 0, z: 0, open: 600, close: 720},
      {id: 'b', name: 'Office row', day: 1, x: 100, z: 0, open: 760, close: 900}],
      crewHours: [{id: 'e1', day: 1, start: 540, end: 960}]}}],
  opportunities: [
    {key: 'ba:street_a#1', address: '1 A Street', name: 'Tower', type: 'Office', hood: null, kind: 'building', categories: ['office'],
     hours: week([540, 1020]), closed: false, x: 0, z: 0},
    {key: 'pitch:1', buildingKey: 'ba:street_a#2', address: '2 A Street', name: 'Pier pitch', type: 'Pitch', kind: 'pitch', categories: [],
     hours: null, closed: false, x: 30, z: 0},
    {key: 'ba:street_b#1', address: '1 B Street', name: 'Club', type: 'Nightclub', kind: 'building', categories: ['nightlife'],
     hours: week([1320, 180]), closed: false, x: 1000, z: 1000},
  ],
});
const setD = (b, d) => { b.__d = d; vm.runInContext('D = __d', b); };

test('Browse mods keeps what the save carries apart from what the board supports', () => {
  const {b, element} = board();
  setD(b, {meta: {character: 'kim'}, businesses: [], mods: {streetFood: {status: 'ready', version: '0.10.0'},
    seasons: {season: 'summer', day: 3, length: 14, left: 11, demand: true}}});
  b.drawMods();
  const html = element('secMods').innerHTML;
  const rows = [...html.matchAll(/data-mod="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(rows, ['streetFood', 'seasons', 'retailExpansion', 'economyExpansion'], 'Street Food leads the curated list');
  assert.match(html, /class="md-row feat" data-mod="streetFood"/);
  assert.match(html, /by Peter Hartwieg/);
  assert.match(html, /steamcommunity\.com\/sharedfiles\/filedetails\/\?id=3822355169/);
  assert.match(html, /In this save, version 0\.10\.0/);
  assert.match(html, /In this save: Summer, day 3 of 14/);
  assert.equal((html.match(/Not in this save/g) || []).length, 2, 'Retail and Economy Expansion are supported but absent');
  assert.match(html, /What Big Copilot reads/);
  assert.match(html, /Not covered/);
  assert.doesNotMatch(html, /fully compatible|all features|every feature/i);
});

test('Browse mods says the records are unreadable rather than calling the mod supported in full', () => {
  const {b, element} = board();
  setD(b, {meta: {}, businesses: [], mods: {streetFood: {status: 'stale'}, retailExpansion: {renovated: null}}});
  b.drawMods();
  const html = element('secMods').innerHTML;
  assert.match(html, /In this save, records stale/);
  assert.match(html, /In this save, records unreadable/);
});

test('Street Food draws the layers the data has, the fleet as context, and no ranking', () => {
  const {b, element} = board();
  setD(b, {meta: {character: 'kim'}, businesses: [], streetFood: SF()});
  b.drawStreetFood();
  assert.equal(element('sfGrid').hidden, false);
  assert.match(element('sfCtl').innerHTML, /Read from the save/);
  const layers = element('sfLayers').innerHTML;
  assert.match(layers, /data-sf-lay="office"/);
  assert.match(layers, /data-sf-lay="nightlife"/);
  assert.match(layers, /data-sf-lay="event"/, 'a pitch is on the events and pitches layer');
  assert.doesNotMatch(layers, /data-sf-lay="retail"/, 'a layer without places is left out');
  assert.match(element('sfPlan').innerHTML, /No route yet/);
  assert.match(element('sfRibbon').innerHTML, /Tue/);
  const fleet = element('sfFleet').innerHTML;
  assert.match(fleet, /Taco Cart/);
  assert.match(fleet, /data-sf-import="v1" data-sf-iday="1"/);
  const all = ['sfCtl', 'sfNote', 'sfLayers', 'sfInspect', 'sfPlan', 'sfRibbon', 'sfFleet'].map(id => element(id).innerHTML).join('');
  assert.doesNotMatch(all, /best spot|best place|ranked|score|demand/i);
});

test('a save without Street Food still offers the map and drafting, and says why there are no vehicles', () => {
  const {b, element} = board();
  setD(b, {meta: {character: 'kim'}, businesses: [], streetFood: {...SF(), status: 'absent', vehicles: []}});
  b.drawStreetFood();
  assert.match(element('sfNote').innerHTML, /no Street Food records/);
  assert.match(element('sfCtl').innerHTML, /Not in this save/);
  assert.match(element('sfLayers').innerHTML, /data-sf-lay="office"/);
  assert.equal(element('sfFleet').innerHTML, '');
});

const KIM_A = {character: 'kim', save: 'Kim Foods'}, KIM_B = {character: 'kim', save: 'Kim Carts'};
const keyOf = m => `ba_street_food_routes_v1:${JSON.stringify([m.character, m.save])}`;
const names = b => JSON.parse(vm.runInContext('JSON.stringify(sfPlans.map(p => p.name))', b));

test('an import is a new plan beside the player\'s own, kept per company of each character', () => {
  const store = storage();
  const {b, element} = board({store});
  setD(b, {meta: {...KIM_A}, businesses: [], streetFood: SF()});
  b.drawStreetFood();
  vm.runInContext('sfNewPlan({name: "Mine", weekday: 1})', b);
  vm.runInContext('sfImport("v1", 1)', b);
  const plans = JSON.parse(vm.runInContext('JSON.stringify(sfPlans)', b));
  assert.equal(plans.length, 2);
  assert.equal(plans[1].name, 'Mine', 'the player\'s plan is untouched');
  assert.equal(plans[0].vehicleId, 'v1');
  assert.deepEqual(plans[0].stops.map(s => [s.name, s.open, s.close]), [['Pier', 600, 720], ['Office row', 760, 900]]);
  assert.equal(plans[0].stops[0].key, 'ba:street_a#1', 'an imported stop at a building keeps its key');
  assert.deepEqual([...store.map.keys()], [keyOf(KIM_A)]);
  assert.match(element('sfPlan').innerHTML, /Copied from the save/);
  // A refresh of the same company keeps the plans and their edits.
  vm.runInContext('sfEdit(p => { p.stops[1].close = 960; })', b);
  setD(b, {meta: {...KIM_A}, businesses: [], streetFood: SF()});
  b.drawStreetFood();
  assert.equal(vm.runInContext('sfPlan().stops[1].close', b), 960, 'a refresh keeps the edit');
  // The same character's other company, on the same board, has none of them.
  setD(b, {meta: {...KIM_B}, businesses: [], streetFood: SF()});
  b.drawStreetFood();
  assert.equal(vm.runInContext('sfPlans.length', b), 0);
  vm.runInContext('sfNewPlan({name: "Carts only", weekday: 2})', b);
  // Back on the first company: its two plans, the edit included.
  setD(b, {meta: {...KIM_A}, businesses: [], streetFood: SF()});
  b.drawStreetFood();
  assert.deepEqual(names(b), plans.map(p => p.name));
  assert.equal(vm.runInContext('sfPlan().stops[1].close', b), 960);
  assert.deepEqual([...store.map.keys()].sort(), [keyOf(KIM_A), keyOf(KIM_B)].sort());
  // Reloaded, each company reads back its own.
  const a = board({store});
  setD(a.b, {meta: {...KIM_A}, businesses: [], streetFood: {...SF(), vehicles: []}});
  a.b.drawStreetFood();
  assert.deepEqual(names(a.b), plans.map(p => p.name));
  assert.equal(vm.runInContext('sfPlan().stops[1].close', a.b), 960);
  const c = board({store});
  setD(c.b, {meta: {...KIM_B}, businesses: [], streetFood: SF()});
  c.b.drawStreetFood();
  assert.deepEqual(names(c.b), ['Carts only']);
  // Another character with a company of the same name starts with none.
  const other = board({store});
  setD(other.b, {meta: {character: 'lee', save: 'Kim Foods'}, businesses: [], streetFood: SF()});
  other.b.drawStreetFood();
  assert.equal(vm.runInContext('sfPlans.length', other.b), 0);
});

test('no character and company pair can pass for another in the storage key', () => {
  const {b} = board();
  const key = m => { setD(b, {meta: m, businesses: []}); return vm.runInContext('sfStore()', b); };
  assert.notEqual(key({character: 'a:b', save: 'c'}), key({character: 'a', save: 'b:c'}));
  assert.notEqual(key({character: 'a","b', save: ''}), key({character: 'a', save: 'b'}));
  assert.notEqual(key({character: 'kim'}), key({character: 'kim', save: 'Kim Foods'}));
});

test('the model\'s issues read as sentences about the stops the player ordered', () => {
  const {b, element} = board();
  setD(b, {meta: {character: 'kim'}, businesses: [], streetFood: SF()});
  b.drawStreetFood();
  vm.runInContext(`sfNewPlan({name: "Clash", weekday: 1, stops: [
    {id: "s1", name: "Tower", key: null, x: 0, z: 0, open: 600, close: 800},
    {id: "s2", name: "Club", key: null, x: 1000, z: 1000, open: 780, close: 900}]}); sfRedraw();`, b);
  const html = element('sfPlan').innerHTML;
  assert.match(html, /Stop 2 opens before stop 1 closes\./);
  assert.doesNotMatch(html, /no crew in the save/, 'a draft has no crew to check');
  assert.match(html, /Crew is checked once the route names one of your vehicles/);
  assert.match(html, /Travel assumes the game's normal speed/);
  // The order stays the player's: nothing reorders the stops to fix the clash.
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(sfPlan().stops.map(s => s.id))', b)), ['s1', 's2']);
});

test('the route write is offered only for a live, owned vehicle whose route fits', () => {
  const ready = SF();
  // No link: no write at all.
  let t = board();
  setD(t.b, {meta: {character: 'kim'}, businesses: [], streetFood: ready});
  t.b.drawStreetFood();
  vm.runInContext('sfImport("v1", 1)', t.b);
  assert.doesNotMatch(t.element('sfPlan').innerHTML, /data-gw="streetFoodRoute"/);
  // Linked, the mod writes routes, the vehicle is owned and the route fits.
  t = board({link: {writes: ['streetFoodRoute'], features: ['streetFood.routes'], approved: true}});
  setD(t.b, {meta: {character: 'kim'}, businesses: [], streetFood: ready});
  t.b.drawStreetFood();
  vm.runInContext('sfImport("v1", 1)', t.b);
  let html = t.element('sfPlan').innerHTML;
  assert.match(html, /data-gw="streetFoodRoute"/);
  assert.doesNotMatch(html, /data-gw="streetFoodRoute"[^>]*aria-disabled/);
  // A draft cannot be set.
  vm.runInContext('sfEdit(p => { p.vehicleId = null; })', t.b);
  html = t.element('sfPlan').innerHTML;
  assert.match(html, /data-gw="streetFoodRoute"[^>]*aria-disabled="true"/);
  assert.match(html, /Choose one of your vehicles/);
  // An empty draft is no route to clear: still refused.
  vm.runInContext('sfEdit(p => { p.stops = []; })', t.b);
  html = t.element('sfPlan').innerHTML;
  assert.match(html, /data-gw="streetFoodRoute"[^>]*aria-disabled="true"/);
  assert.match(html, /Choose one of your vehicles/);
  // The same empty plan for the owned vehicle clears that day, after a review.
  vm.runInContext('sfEdit(p => { p.vehicleId = "v1"; })', t.b);
  html = t.element('sfPlan').innerHTML;
  assert.doesNotMatch(html, /data-gw="streetFoodRoute"[^>]*aria-disabled/);
  assert.match(html, /Clear in the game/);
  // Stale records hold it back.
  t = board({link: {writes: ['streetFoodRoute'], features: ['streetFood.routes'], approved: true}});
  setD(t.b, {meta: {character: 'kim'}, businesses: [], streetFood: {...ready, status: 'stale'}});
  t.b.drawStreetFood();
  vm.runInContext('sfImport("v1", 1)', t.b);
  assert.match(t.element('sfPlan').innerHTML, /read from the running game/);
  // An older mod says to update it.
  t = board({link: {writes: [], approved: true}});
  setD(t.b, {meta: {character: 'kim'}, businesses: [], streetFood: ready});
  t.b.drawStreetFood();
  vm.runInContext('sfImport("v1", 1)', t.b);
  assert.match(t.element('sfPlan').innerHTML, /Update the Big Copilot Link mod/);
});

test('missing crew and a late return are warnings a review may go ahead with; route errors hold it back', () => {
  const link = {writes: ['streetFoodRoute'], features: ['streetFood.routes'], approved: true};
  const enabled = html => /data-gw="streetFoodRoute"/.test(html) && !/data-gw="streetFoodRoute"[^>]*aria-disabled/.test(html);
  // An owned vehicle with nobody on it: the issue shows, and the review is offered.
  let t = board({link});
  const crewless = SF();
  crewless.vehicles[0].crew = [];
  setD(t.b, {meta: {character: 'kim'}, businesses: [], streetFood: crewless});
  t.b.drawStreetFood();
  vm.runInContext('sfImport("v1", 1)', t.b);
  let html = t.element('sfPlan').innerHTML;
  assert.match(html, /This vehicle has no crew in the save\./);
  assert.ok(enabled(html), 'missing crew does not hold the review back');
  // The estimated return home after the latest close: shown, not blocking.
  t = board({link});
  const late = SF();
  late.vehicles[0].home = {x: 0, z: 0, name: 'Pier commissary'};
  late.vehicles[0].schedule.stops[1] = {...late.vehicles[0].schedule.stops[1], open: 1380, close: 1615};
  setD(t.b, {meta: {character: 'kim'}, businesses: [], streetFood: late});
  t.b.drawStreetFood();
  vm.runInContext('sfImport("v1", 1)', t.b);
  html = t.element('sfPlan').innerHTML;
  assert.match(html, /The route runs past 03:00 \+1/);
  assert.ok(enabled(html), 'a late return does not hold the review back');
  // Bad times, an overlap and too little travel time do.
  for (const [label, edit, said] of [
    ['bad times', 'p.stops[0].close = p.stops[0].open', /closes before it opens/],
    ['overlap', 'p.stops[1].open = 700', /opens before stop 1 closes/],
    ['travel gap', 'p.stops[1].open = 730', /before the vehicle can be there/],
  ]) {
    t = board({link});
    setD(t.b, {meta: {character: 'kim'}, businesses: [], streetFood: SF()});
    t.b.drawStreetFood();
    vm.runInContext(`sfImport("v1", 1); sfEdit(p => { ${edit}; });`, t.b);
    html = t.element('sfPlan').innerHTML;
    assert.match(html, said, label);
    assert.match(html, /data-gw="streetFoodRoute"[^>]*aria-disabled="true"/, label);
    assert.match(html, /Sort out the route's issues first/, label);
  }
});

test('a kept plan that is not a plan is dropped, and a good one is read back through the model', () => {
  const store = storage();
  store.setItem(keyOf({character: 'kim', save: ''}), JSON.stringify({current: 'r1', plans: [
    {id: 'r1', name: 'Kept', vehicleId: null, kind: 'truck', weekday: 4, stops: [{id: 's1', name: 'Tower', key: 'ba:street_a#1', x: 0, z: 0, open: 600, close: 700}]},
    {id: 'bad', weekday: 9, stops: 'nope'}, null, 'text']}));
  const {b} = board({store});
  setD(b, {meta: {character: 'kim'}, businesses: [], streetFood: SF()});
  b.drawStreetFood();
  const plans = JSON.parse(vm.runInContext('JSON.stringify(sfPlans)', b));
  assert.equal(plans.length, 1);
  assert.equal(plans[0].kind, 'truck');
  assert.equal(plans[0].weekday, 4);
  assert.equal(plans[0].stops[0].key, 'ba:street_a#1');
});

test('the route write reviews first, binds Apply to the quote, and offers no undo', () => {
  const t = board({link: {writes: ['streetFoodRoute'], features: ['streetFood.routes'], approved: true}});
  setD(t.b, {meta: {character: 'kim'}, businesses: [], streetFood: SF()});
  t.b.drawStreetFood();
  vm.runInContext('sfImport("v1", 1); var sfSpec = null; gwConfirm = spec => { sfSpec = spec; }; gwStreetFoodRoute(sfCur);', t.b);
  const spec = vm.runInContext('sfSpec', t.b);
  assert.equal(spec.kind, 'streetFoodRoute');
  assert.equal(spec.nothing(), '');
  const body = JSON.parse(JSON.stringify(spec.body()));
  assert.deepEqual(body, {vehicleId: 'v1', weekday: 1, revision: 'rev-3',
    stops: [{x: 0, z: 0, open: 600, close: 720}, {x: 100, z: 0, open: 760, close: 900}]});
  assert.deepEqual(JSON.parse(JSON.stringify(spec.applyBody({quote: 'q-7'}, body))), {...body, quote: 'q-7'});
  const answer = {ok: true, kind: 'streetFoodRoute', dryRun: true, quote: 'q-7',
    rows: [{vehicleId: 'v1', weekday: 1, changed: true,
      before: [{x: 5, z: 5, y: 0, heading: 0, open: 540, close: 600}],
      after: [{x: 3, z: 0, open: 600, close: 720}, {x: 100, z: 0, open: 760, close: 900}]}],
    warnings: [{code: 'crew_gap', minutes: 20}, {code: 'day_closed'}]};
  assert.match(spec.verdict(answer), /set 2 stops on Tuesday/);
  const drawn = spec.draw(answer, 'ready');
  assert.match(drawn, /In the game now/);
  assert.match(drawn, /placed 3 m from your spot/);
  // Each stop says where it is, never only its coordinates: the game's stop
  // today, and each proposed one with the place it was asked for.
  const lists = [...drawn.matchAll(/<ol class="sf-gwlist">([\s\S]*?)<\/ol>/g)].map(m => m[1]);
  assert.match(lists[0], /09:00–10:00<\/span><span class="sf-gwwhere">at Tower<\/span>/, 'the stop in the game now, by its place');
  assert.match(lists[1], /10:00–12:00<\/span><span class="sf-gwwhere">at Tower<\/span><span class="quiet">for Pier<\/span>/);
  assert.match(lists[1], /12:40–15:00<\/span><span class="sf-gwwhere">70 m from Pier pitch<\/span><span class="quiet">for Office row<\/span>/);
  assert.doesNotMatch(drawn, /\b5, 5\b|x: ?5/, 'no bare coordinates');
  const far = spec.draw({...answer, rows: [{...answer.rows[0], before: [{x: 4000, z: 4000, open: 540, close: 600}]}]}, 'ready');
  assert.match(far, /a spot on the map/, 'no named place nearby');
  assert.match(drawn, /20 minutes of the route have no saved crew hours/);
  assert.match(drawn, /switched off for this vehicle/);
  assert.match(drawn, /nearest legal parking or pavement spot/);
  assert.notEqual(spec.idle({...answer, rows: [{...answer.rows[0], changed: false}]}), '');
  assert.equal(spec.changed(answer), false, 'no undo for a route write yet');
  assert.match(spec.draw({ok: false, reason: 'vehicle_busy'}, 'refused'), /cannot take a new route/);
  // An edit after the review changes the body, so Apply asks the game again.
  vm.runInContext('sfEdit(p => { p.stops[1].close = 960; })', t.b);
  assert.notDeepEqual(JSON.parse(JSON.stringify(spec.body())), body);
});
