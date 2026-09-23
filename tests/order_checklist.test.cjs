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
/* A bare number is a figure typed while the game held what the contract
   holds now; an object says what the game held when it was typed. */
const heldNow = c => c.smart && Number.isFinite(c.target) ? c.target : c.weekly || c.pausedWeekly || 0;
const typed = (contract, edit) => typeof edit === 'number' ? {value: edit, inGame: heldNow(contract)} : edit;
const setting = (total, contract, edit) => JSON.parse(JSON.stringify(
  context.importSetting(total, contract, typed(contract, edit))));
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
  // Typing the figure the game holds turns the suggestion down: an edit
  // that asks for no change, kept while the game's figure stays put.
  const down = setting(1400, {weekly:900}, 900);
  assert.deepEqual([down.stale, down.edited, down.value, down.changed], [false, true, 900, false]);
  // Once the game's figure has moved, the typed figure answered a game that
  // is gone: stale, dropped, and the row reads as the board sees it again,
  // whether the game moved to the typed figure or elsewhere.
  const entered = setting(1400, {weekly:1200}, {value:1200, inGame:900});
  assert.deepEqual([entered.stale, entered.edited, entered.value], [true, false, 1400]);
  const moved = setting(1400, {weekly:1000}, {value:2000, inGame:900});
  assert.deepEqual([moved.stale, moved.edited, moved.value], [true, false, 1400]);
  // The turned-down 900 does not come back as an order to lower a short row.
  const away = setting(1400, {weekly:1200}, {value:900, inGame:900});
  assert.deepEqual([away.stale, away.edited, away.value], [true, false, 1400]);
  const rows = build({imports:[{s:0, rows:[row(1400, {weekly:1200}, {value:900, inGame:900})]}]});
  assert.deepEqual([rows[0].current, rows[0].proposed], [1200, 1400]);
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
  // Typing the figure in game turns the suggestion down: nothing to do.
  assert.deepEqual(build({imports:[{s:0, rows:[row(1400, {weekly:900}, 900)]}]}), []);
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
  // 1,350 a week against a level of 1,300: tight. The player typed 1,300 when
  // the game held 1,200, and the game now holds it, so the row is tight
  // again, with the suggestion.
  const was = {value:1300, inGame:1200};
  const tight = setting(1350, {weekly:1300, smart:true, target:1300}, was);
  assert.deepEqual([tight.fit, tight.stale, tight.edited, tight.value], ['tight', true, false, 1400]);
  const rows = build({imports:[{s:0, rows:[row(1350, {weekly:1300, smart:true, target:1300}, was)]}]});
  assert.deepEqual([rows[0].current, rows[0].proposed], [1300, 1400]);
});

/* A line as the payload carries it: the counted contracts in delivery order,
   the named level's place in them, and what one pass brings. */
const line = (pass, at, importer = 'Pier 1') => {
  const d = (a, s = false) => ({amount: a, smart: s});
  const drops = pass.map(([a, s]) => d(a, s));
  let before = 0, after = 0;
  drops.forEach((x, i) => { if(!x.smart){ if(i < at) before += x.amount; else if(i > at) after += x.amount; } });
  return {weekly: context.importPassDelivers(drops, at, drops[at].amount), smart: true,
    target: drops[at].amount, plainBefore: before, plainAfter: after, pass: drops, levelAt: at, levelImporter: importer};
};

test('a level with a plain amount after it shows the level and asks for what the replayed pass needs', () => {
  // Level first, then 400 plain: a week brings 1,400 at most.
  const after = setting(1800, line([[1000, true], [400]], 0));
  assert.deepEqual([after.inGame, after.plainAfter, after.fit, after.setTo, after.value], [1000, 400, 'short', 1400, 1400]);
  const rows = build({imports:[{s:0, rows:[row(1800, line([[1000, true], [400]], 0))]}]});
  assert.deepEqual([rows[0].current, rows[0].proposed], [1000, 1400]);
  assert.match(rows[0].reason, /^Set Smart Delivery stock at Pier 1 to 1[,.]400\./);
  // Plain first, the 400 lands inside the level: the level alone is the week.
  const inside = setting(1800, line([[400], [1000, true]], 1));
  assert.deepEqual([inside.inGame, inside.plainBefore, inside.setTo], [1000, 400, 1800]);
});

test('a plain amount delivered before the level is never taken off the level', () => {
  // Plain 1,400 then a level of 1,000, a week of 2,000: the level must be
  // 2,000, since 1,600 would bring only max(1,400, 1,600).
  const over = setting(2000, line([[1400], [1000, true]], 1));
  assert.equal(over.setTo, 2000);
  assert.equal(context.importPassDelivers(line([[1400], [1000, true]], 1).pass, 1, over.setTo), 2000);
  // Plain 600, level 500, plain 200, a week of 1,000: 800, not 700.
  const mixed = setting(1000, line([[600], [500, true], [200]], 1));
  assert.equal(mixed.setTo, 800);
});

test('the checklist names the contract that holds the level', () => {
  // A 500, plain 300, C 600: A holds the level, and a week of 1,100 needs A
  // at 800. C at 800 would bring 500 + 300, then nothing: still short.
  const held = line([[500, true], [300], [600, true]], 0, 'A');
  const rows = build({imports:[{s:0, rows:[row(1100, held)]}]});
  assert.equal(rows[0].proposed, 800);
  assert.match(rows[0].reason, /^Set Smart Delivery stock at A to 800\./);
  assert.ok(context.importPassDelivers(held.pass, 2, 800) < 1100);
});

test('the level search matches a plain replay over many orders', () => {
  let seed = 3680;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for(let k = 0; k < 400; k++){
    const drops = Array.from({length: 1 + Math.floor(rand() * 5)},
      () => ({amount: Math.floor(rand() * 61) * 50, smart: rand() < .5}));
    if(!drops.some(d => d.smart)) drops[0].smart = true;
    const at = drops.findIndex(d => d.smart);
    const need = 1 + Math.floor(rand() * 8000);
    const level = context.importLevelFor(drops, at, need);
    let smallest = 0;
    while(context.importPassDelivers(drops, at, smallest) < need) smallest += 100;
    assert.equal(level, smallest, JSON.stringify({drops, at, need}));
  }
});

test('a paused level shows the level in game', () => {
  const paused = setting(1400, {weekly:0, pausedWeekly:1400, smart:true, target:1000, plainAfter:400});
  assert.deepEqual([paused.paused, paused.inGame], [true, 1000]);
});
