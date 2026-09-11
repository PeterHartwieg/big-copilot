// Run with: node --test tests/order_checklist.test.cjs
// Exercise the pure checklist logic from the shared page template, without
// copying the implementation into a test or requiring private save files.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'ba_dashboard.py'), 'utf8');
const start = source.indexOf('function buildOrderChecklist(');
const end = source.indexOf('const orderMarkCache', start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({});
vm.runInContext('const ceil100 = v => Math.ceil(v / 100) * 100;\n' + source.slice(start, end), context);
const businesses = [
  {key:'depot#1', name:'Depot', address:'1 Depot Street'},
  {key:'factory#2', name:'Factory', address:'2 Factory Street'},
  {key:'shop#3', name:'Shop', address:'3 Shop Street'},
];
const build = (overrides = {}) => {
  const args = {imports:[], loose:[], sites:[], shops:[], checks:[], businesses, ...overrides};
  return JSON.parse(JSON.stringify(context.buildOrderChecklist(
    args.imports, args.loose, args.sites, args.shops, args.checks, args.businesses)));
};
const order = changes => ({s:0, item:'Sugar', current:1000, setTo:1500,
  fit:'short', factoryWeek:1000, otherWeek:450, ...changes});

test('weekly order changes use the existing consolidated recommendation', () => {
  const rows = build({imports:[{s:0, rows:[order({})]}]});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].current, 1000);
  assert.equal(rows[0].proposed, 1500);
  assert.match(rows[0].reason, /factory inputs plus shop deliveries/);
});

test('covered orders and deliberate surplus buffers are not cut automatically', () => {
  assert.equal(build({imports:[{s:0, rows:[
    order({fit:'ok', current:1600}),
    order({item:'Flour', fit:'ok', current:5000, surplus:true}),
    order({item:'Water', fit:'idle', setTo:null}),
  ]}]}).length, 0);
  // The existing fit helper treats zero as unknown; the checklist still exposes
  // a known zero order when the existing planner has a positive recommendation.
  assert.equal(build({imports:[{s:0, rows:[order({fit:'ok', current:0})]}]})[0].proposed, 1500);
});

test('shop top-ups cover a peak day and require a known delivery route', () => {
  const rows = build({shops:[
    {s:2, item:'Flowers', target:100, peakSold:235, peakDay:'Saturday', from:0},
    {s:2, item:'Coffee', target:0, peakSold:20, from:null},
    {s:2, item:'Service', target:0, peakSold:20},
    {s:2, item:'Gifts', target:300, peakSold:290, from:0},
  ]});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].proposed, 300); // daily, never seven times the peak
  assert.match(rows[0].reason, /Saturday/);
});

test('a paused order or delivery gap is a review action, not an invented quantity', () => {
  const rows = build({checks:[
    {s:0, item:'Flour', paused:true, from:'Importer'},
    {s:0, item:'Sugar', paused:false, coverFit:'short', shortBy:1.2},
  ]});
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.proposed === null));
  assert.match(rows[0].reason, /paused/);
  assert.match(rows[1].reason, /one-off supply/);
});

test('unassigned factories require depot selection and expose full-rate assumptions', () => {
  const rows = build({
    loose:[{item:'Flour', week:1501}],
    sites:[{s:1, rows:[{item:'Flour', status:'unplanned', target:0, perDay:215, from:null}]}],
  });
  assert.equal(rows[0].proposed, null);
  assert.match(rows[0].reason, /Choose a supplying depot/);
  assert.equal(rows[1].proposed, 300);
  assert.match(rows[1].reason, /confirm staffing and output limits/);
});

test('a measured delivery gap has a one-off quantity, separate from the recurring order', () => {
  const gap = {s:0, item:'Sugar', coverFit:'short', shortBy:.8, catchUp:217, runsOut:'Sunday'};
  const rows = build({checks:[gap]});
  assert.equal(rows[0].proposed, 217);
  assert.equal(rows[0].current, null);
  assert.match(rows[0].reason, /before Sunday/);
  const text = context.orderChecklistText(rows, 'Company');
  assert.match(text, /add 217 units once/);
  assert.doesNotMatch(text, /not set ->/);
  assert.notEqual(rows[0].key, build({checks:[{...gap, catchUp:230}]})[0].key);
});

test('completion identities survive site reordering but change with settings and sources', () => {
  const shop = {s:2, item:'Flowers', target:100, peakSold:235, from:0};
  const before = build({shops:[shop]})[0];
  const reordered = build({businesses:[businesses[2], businesses[1], businesses[0]],
    shops:[{...shop, s:0, from:2}]})[0];
  assert.equal(before.key, reordered.key);
  assert.notEqual(before.key, build({shops:[{...shop, target:150}]})[0].key);
  assert.notEqual(before.key, build({shops:[{...shop, peakSold:350}]})[0].key);
  assert.notEqual(before.key, build({shops:[{...shop, from:1}]})[0].key);
});

test('copied checklist groups actions and includes units and read-only instructions', () => {
  const rows = build({imports:[{s:0, rows:[order({})]}],
    checks:[{s:0, item:'Sugar', paused:true, from:'Importer'}]});
  const text = context.orderChecklistText(rows, 'Company · day 12');
  assert.match(text, /Enter these settings in-game/);
  assert.match(text, /units, not boxes/);
  assert.match(text, /1000 -> 1500/);
  assert.equal(text.split('Weekly imports · Depot').length - 1, 1);
});

test('empty or incomplete supply data does not invent an action', () => {
  assert.deepEqual(build(), []);
});
