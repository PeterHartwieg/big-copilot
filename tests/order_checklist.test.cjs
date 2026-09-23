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
const fitStart = source.indexOf('const feedFit =');
const fitEnd = source.indexOf('/* The same verdict', fitStart);
// The row setting the imports table computes, which feeds the checklist.
const settingStart = source.indexOf('function importSetting(');
assert.ok(settingStart >= 0 && settingStart < start);
vm.runInContext(source.slice(fitStart, fitEnd) + '\nconst ceil100 = v => Math.ceil(v / 100) * 100;\n'
  + source.slice(settingStart, start) + source.slice(start, end), context);
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

test('shop recommendations respect the existing absolute and percentage noise floors', () => {
  const shop = {s:2, item:'Flowers', target:100, from:0};
  for(const peakSold of [101, 104, 105]){
    assert.deepEqual(build({shops:[{...shop, peakSold}]}), []);
  }
  assert.deepEqual(build({shops:[{...shop, target:1000, peakSold:1010}]}), []);
  for(const peakSold of [106, 120]){
    assert.equal(build({shops:[{...shop, peakSold}]})[0].proposed, 200);
  }
  assert.equal(build({shops:[{...shop, target:0, peakSold:4}]})[0].proposed, 100);
  assert.deepEqual(build({shops:[{...shop, target:0, peakSold:0}]}), []);
});

test('incomplete data preserves saved marks until a complete snapshot can reconcile them', () => {
  const rows = build({imports:[{s:0, rows:[order({})]}]});
  let marks = new Set([rows[0].key]);
  marks = context.reconcileOrderMarks(marks, [], false);
  assert.ok(marks.has(rows[0].key), 'a missing recipe must not erase the saved mark');
  // Checking a different visible action during the gap must preserve hidden notes.
  const other = build({shops:[{s:2, item:'Flowers', target:0, peakSold:120, from:0}]});
  marks.add(other[0].key);
  marks = new Set(JSON.parse(JSON.stringify([...marks]))); // save and reload
  marks = context.reconcileOrderMarks(marks, [...rows, ...other], true);
  assert.equal(marks.size, 2);
  const changed = build({imports:[{s:0, rows:[order({setTo:1700})]}]});
  marks = context.reconcileOrderMarks(marks, [...changed, ...other], true);
  assert.ok(!marks.has(rows[0].key), 'a changed recommendation invalidates its old mark');
  assert.ok(!marks.has(changed[0].key), 'new quantities must not inherit completion');
  assert.ok(marks.has(other[0].key));
  marks = context.reconcileOrderMarks(marks, [], true);
  assert.equal(marks.size, 0, 'a complete snapshot can remove resolved actions');
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

/* --- the Set to box: Smart Delivery levels and the player's own figures --- */
const setting = (total, contract, edit) => JSON.parse(JSON.stringify(
  context.importSetting(total, contract, edit)));
// A row as drawLogistics builds it: the factory week, then the setting.
const row = (total, contract, edit, extra = {}) => ({s:0, item:'Sugar', factoryWeek:total, otherWeek:0,
  total, ...setting(total, contract, edit), ...extra});

test('a Smart Delivery level is judged as a week of supply and shows the level in game', () => {
  const covered = setting(1400, {weekly:1500, smart:true, target:1500});
  assert.equal(covered.fit, 'ok');
  assert.equal(covered.inGame, 1500);
  assert.equal(covered.value, 1500, 'nothing to change: the box holds the level in game');
  assert.equal(covered.changed, false);
  const short = setting(1400, {weekly:900, smart:true, target:900});
  assert.equal(short.fit, 'short');
  assert.equal(short.value, 1400);
  assert.equal(short.changed, true);
});

test('a high Smart Delivery level only holds stock, so it is never told to lower', () => {
  assert.equal(setting(1000, {weekly:5000, smart:true, target:5000}).surplus, false);
  assert.equal(setting(1000, {weekly:5000}).surplus, true);
});

test('a mixed depot shows the level in game and judges what one delivery can bring', () => {
  // A level of 1,000 with a plain 400 delivered after it: 1,400 a week at most.
  const mixed = setting(1400, {weekly:1400, smart:true, target:1000, plain:400});
  assert.equal(mixed.inGame, 1000);
  assert.equal(mixed.fit, 'ok');
});

test('a paused contract keeps its figure in the box until the player types one', () => {
  const paused = setting(1400, {weekly:0, pausedWeekly:3000, smart:true, target:3000});
  assert.equal(paused.fit, 'paused');
  assert.equal(paused.value, 3000);
  assert.equal(paused.changed, false);
  assert.equal(setting(1400, {weekly:0, pausedWeekly:3000}, 2000).changed, true);
});

test('the player\'s figure replaces the suggestion; typing the suggestion is no edit', () => {
  const mine = setting(1400, {weekly:900, smart:true, target:900}, 2000);
  assert.deepEqual([mine.edited, mine.value, mine.suggested, mine.changed], [true, 2000, 1400, true]);
  assert.equal(setting(1400, {weekly:900}, 1400).edited, false);
  // A figure the game now holds has been entered: no longer an edit, and
  // the row goes back to the board's own verdict and suggestion.
  const entered = setting(1400, {weekly:900}, 900);
  assert.deepEqual([entered.entered, entered.edited, entered.value, entered.changed], [true, false, 1400, true]);
  // Not a number, or below zero, is not a figure.
  assert.equal(setting(1400, {weekly:900}, -5).edited, false);
  assert.equal(setting(1400, {weekly:900}, NaN).edited, false);
});

test('the checklist names a Smart Delivery stock level, not a weekly order', () => {
  const rows = build({imports:[{s:0, rows:[row(1400, {weekly:900, smart:true, target:900})]}]});
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].current, rows[0].proposed, rows[0].mode], [900, 1400, 'smart']);
  assert.match(rows[0].reason, /^Set Smart Delivery stock to 1[,.]400\./);
  const text = context.orderChecklistText(rows, 'Company');
  assert.match(text, /Smart Delivery stock 900 -> 1400 units/);
  assert.doesNotMatch(text, /units\/week/);
  const plain = build({imports:[{s:0, rows:[row(1400, {weekly:900})]}]});
  assert.match(plain[0].reason, /^Set the weekly order to 1[,.]400\./);
  assert.match(context.orderChecklistText(plain, 'Company'), /900 -> 1400 units\/week/);
  assert.notEqual(rows[0].key, plain[0].key, 'a level and an order are not the same mark');
});

test('an edited figure feeds the checklist, including on a row the board finds covered', () => {
  const edited = build({imports:[{s:0, rows:[row(1400, {weekly:1500, smart:true, target:1500}, 3000)]}]});
  assert.equal(edited.length, 1);
  assert.deepEqual([edited[0].current, edited[0].proposed], [1500, 3000]);
  assert.match(edited[0].reason, /Your own figure; the board suggests 1[,.]400/);
  // An edit on a short row replaces the suggestion.
  const short = build({imports:[{s:0, rows:[row(1400, {weekly:900}, 2500)]}]});
  assert.equal(short[0].proposed, 2500);
  // A figure the game already holds is no longer the player's: the board's
  // suggestion comes back.
  const back = build({imports:[{s:0, rows:[row(1400, {weekly:900}, 900)]}]});
  assert.deepEqual([back[0].current, back[0].proposed], [900, 1400]);
  // A new figure is a new action: an old tick does not carry over.
  const other = build({imports:[{s:0, rows:[row(1400, {weekly:900}, 2600)]}]});
  assert.notEqual(short[0].key, other[0].key);
});

test('a paused contract with a typed figure resumes at that figure', () => {
  const rows = build({imports:[{s:0, rows:[row(1400, {weekly:0, pausedWeekly:3000, smart:true, target:3000}, 1600)]}]});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].proposed, 1600);
  assert.match(rows[0].reason, /Resume the paused import contract\. It is set to keep 3[,.]000 in stock\. Set Smart Delivery stock to 1[,.]600\./);
  const untouched = build({imports:[{s:0, rows:[row(1400, {weekly:0, pausedWeekly:3000, smart:true, target:3000})]}]});
  assert.equal(untouched[0].proposed, null);
});

test('a figure entered in game on a tight row goes back to the tight verdict', () => {
  // 1,350 a week against a level of 1,300: tight. The player typed 1,300 and
  // the game now holds it, so the row is tight again, with the suggestion.
  const tight = setting(1350, {weekly:1300, smart:true, target:1300}, 1300);
  assert.deepEqual([tight.fit, tight.entered, tight.edited, tight.value], ['tight', true, false, 1400]);
  const rows = build({imports:[{s:0, rows:[row(1350, {weekly:1300, smart:true, target:1300}, 1300)]}]});
  assert.deepEqual([rows[0].current, rows[0].proposed], [1300, 1400]);
});

test('a level with a plain amount after it shows the level and asks for the week less that amount', () => {
  // Delivered level first, then 400 plain: a week brings 1,400 at most.
  const after = setting(1800, {weekly:1400, smart:true, target:1000, plainAfter:400});
  assert.deepEqual([after.inGame, after.plainAfter, after.fit, after.setTo, after.value], [1000, 400, 'short', 1400, 1400]);
  const rows = build({imports:[{s:0, rows:[row(1800, {weekly:1400, smart:true, target:1000, plainAfter:400})]}]});
  assert.deepEqual([rows[0].current, rows[0].proposed], [1000, 1400]);
  assert.match(rows[0].reason, /^Set Smart Delivery stock to 1[,.]400\./);
  // Plain first, the 400 lands inside the level: the level alone is the week.
  const inside = setting(1800, {weekly:1000, smart:true, target:1000, plainAfter:0});
  assert.deepEqual([inside.inGame, inside.setTo], [1000, 1800]);
});

test('a paused level shows the level in game', () => {
  const paused = setting(1400, {weekly:0, pausedWeekly:1400, smart:true, target:1000, plainAfter:400});
  assert.deepEqual([paused.paused, paused.inGame], [true, 1000]);
});
