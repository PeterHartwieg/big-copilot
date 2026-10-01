// Run with: node --test tests/order_checklist.test.cjs
// Exercise the pure checklist logic from the shared page template, without
// copying the implementation into a test or requiring private save files.
// Every figure the checklist proposes is a fact's (supplyFact, Python's
// verdict); these tests hand it facts and check what it does with them.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'template', 'board.html'), 'utf8');
const {at, between} = require('./_slice.cjs');
const start = at(source, 'function buildOrderChecklist(');
const end = at(source, 'const orderMarkCache', {from: start});
const context = vm.createContext({});
// tt(), which the Plan imports card's wording goes through (web/i18n.js).
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'i18n.js'), 'utf8'), context);
// The row setting the imports table computes, which feeds the checklist.
const settingStart = at(source, 'function importSetting(');
assert.ok(settingStart < start);
// The board's number formatter, which the checklist's wording goes through.
vm.runInContext(between(source, 'let NUM_LOCALE', 'const compact ='), context);
// The weekday names and Supply's word helpers (sbDay, sbDayShort) the reasons use.
vm.runInContext(between(source, 'const WEEKDAY_NAMES', 'function drawWeekday('), context);
vm.runInContext(between(source, '/* A list as one message: the last pair is its own key (sb.list.last)', "/* A node's name cut to fit"), context);
vm.runInContext(source.slice(settingStart, end), context);
const businesses = [
  {key:'depot#1', name:'Depot', address:'1 Depot Street'},
  {key:'factory#2', name:'Factory', address:'2 Factory Street'},
  {key:'shop#3', name:'Shop', address:'3 Shop Street'},
];
require('./_payload_contract.cjs').assertPayloadShape({businesses}, 'order_checklist');
// Every row Python sends carries its item's key beside the name; a fixture
// that names only the item gets the key it would have had.
const keyed = r => r.slug ? r : {...r, slug: keyOf(r.item)};
const build = (overrides = {}) => {
  const args = {imports:[], loose:[], sites:[], shops:[], checks:[], businesses, ...overrides};
  return JSON.parse(JSON.stringify(context.buildOrderChecklist(
    args.imports.map(d => ({...d, rows: d.rows.map(keyed)})), args.loose.map(keyed),
    args.sites.map(s => ({...s, rows: s.rows.map(keyed)})), args.shops.map(keyed), args.checks.map(keyed),
    args.businesses)));
};
// A fact as Python sends it, with only the fields a test cares about.
const fact = (st, extra = {}) => ({st, why: null, lvl: st === 'covered' ? 'ok' : 'warn', setTo: null,
  use: 1300, need: 1500, parts: {lines: 1000, sites: 300, route: 0}, ...extra});
// The item's key, as Python sends it beside every name.
const keyOf = item => `ba:itemname_${item.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
// A Weekly imports row as supplyChecklistRows() builds it: the fact's figures, then the setting.
const order = changes => {
  const row = {s:0, item:'Sugar', current:1000, inGame:1000, setTo:1500, value:1500,
    fit:'short', use:1300, parts:{lines:1000, sites:300, route:0}, margin:0.15, ...changes};
  return {slug: keyOf(row.item), ...row};
};

test('a paused contract beside a top-up that falls short is resumed; one the top-up covers is left alone', () => {
  const paused = lvl => order({item: 'Water', fit: 'paused', paused: true, pausedWeekly: 1000, current: 0,
    inGame: 1000, setTo: null, value: 1000, changed: false, use: 0, need: 0, parts: {lines: 0, sites: 0, route: 0},
    fact: fact('paused', {why: lvl === 'info' ? 'topup' : 'order', lvl, use: 0, need: 0})});
  const rows = build({imports: [{s: 1, rows: [paused('critical')]}]});
  assert.deepEqual(rows.map(r => [r.kind, r.item, !!r.paused]), [['Weekly imports', 'Water', true]]);
  assert.match(rows[0].reason, enRe("sb.ck.paused.topup"));
  assert.deepEqual(build({imports: [{s: 1, rows: [paused('info')]}]}), []);
});

test('a wholesale contract short of the week that also runs dry gives two changes; a 24/7 depot claims no margin', () => {
  const shelf = {s: 2, item: 'Soda', slug: 'soda', margin: 0.15, fact: fact('short', {why: 'shortfall', lvl: 'critical',
    role: 'shelf', cad: 'weekly', use: 1232, need: 1417, have: 1200, setTo: 1420, catchUp: 164, day: 'Monday', wholesale: true})};
  const depot = {s: 0, item: 'Syrup', slug: 'syrup', margin: 0.15, fact: fact('short', {why: 'order', lvl: 'critical',
    role: 'depot', cad: 'weekly', use: 1680, need: 1680, have: 1000, setTo: 1680, day: 'Monday', wholesale: true})};
  const rows = JSON.parse(JSON.stringify(context.buildOrderChecklist([], [], [], [], [], businesses, [], [shelf, depot])));
  assert.deepEqual(rows.map(r => [r.kind, r.item, r.current, r.proposed]), [
    ['Wholesale deliveries', 'Soda', 1200, 1420],
    ['Before the next delivery', 'Soda', null, 164],
    ['Wholesale deliveries', 'Syrup', 1000, 1680]]);
  assert.match(rows[0].reason, enRe("sb.ck.ws.sells.all", {n: 1232, margin: en("sb.ck.margin.pct", {pct: 15}), need: 1417}, {anchor: "start"}));
  assert.match(rows[1].reason, enRe("sb.ck.ws.bring.day", {n: 164, day: "Monday"}, {anchor: "start"}));
  // Factory lines sized 24/7 take no margin: need is use, and none is claimed.
  assert.match(rows[2].reason, new RegExp(enRe("sb.ck.ws.uses", {n: 1680}, {anchor: "start"}).source + " " + enRe("sb.ck.ws.change").source));
});

test('a depot only a route feeds gets its daily top-up, from the site whose plan sets it', () => {
  const depot = (st, have, item) => ({s: 0, item, slug: item, margin: 0.15,
    fact: fact(st, {role: 'depot', cad: 'daily', use: 100, need: 115, have, setTo: 120, from: 1})});
  const rows = JSON.parse(JSON.stringify(context.buildOrderChecklist([], [], [], [], [], businesses,
    [depot('short', 80, 'Paper Bag'), depot('tight', 104, 'Soda'), {...depot('covered', 200, 'Cups'),
      fact: fact('covered', {role: 'depot', cad: 'daily', have: 200, setTo: null})}])));
  assert.deepEqual(rows.map(r => [r.kind, r.item, r.current, r.proposed, !!r.tight, r.source]), [
    ['Depot daily top-ups', 'Paper Bag', 80, 120, false, 1],
    ['Depot daily top-ups', 'Soda', 104, 120, true, 1]]);
  assert.match(rows[0].reason, new RegExp("^" + enRe("sb.ck.depot.plan", {site: "Factory · 2 Factory Street"}).source + " " + enRe("sb.ck.depot.busiest", {n: 100, margin: en("sb.ck.margin.pct", {pct: 15})}).source + "$"));
  assert.equal(rows[0].group, en("sb.ck.kind.depot") + ' · Depot · 1 Depot Street');
});

test('weekly order changes propose the fact\'s figure and say what it was sized on', () => {
  const rows = build({imports:[{s:0, rows:[order({})]}]});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].current, 1000);
  assert.equal(rows[0].proposed, 1500);
  assert.match(rows[0].reason, enRe("sb.ck.uses.both", {n: 1300, route: "", margin: en("sb.ck.margin.pct", {pct: 15})}));
});

test('a row whose fact asks for nothing is not on the list', () => {
  assert.equal(build({imports:[{s:0, rows:[
    order({fit:'covered', setTo:null, value:1600, inGame:1600}),
    order({item:'Flour', fit:'covered', setTo:null, value:5000, inGame:5000, lower:1500}),
    order({item:'Water', fit:'idle', setTo:null, value:null}),
    order({item:'Butter', fit:'new', setTo:null, value:700, inGame:700}),
  ]}]}).length, 0);
});

test('a tight order is a change, marked so Today leaves it out', () => {
  const [row] = build({imports:[{s:0, rows:[order({fit:'tight', current:1400, inGame:1400})]}]});
  assert.equal(row.tight, true);
  assert.match(row.reason, enRe("sb.ck.tight"));
  const [short] = build({imports:[{s:0, rows:[order({})]}]});
  assert.equal(short.tight, undefined);
});

test('shop top-ups propose the shelf fact\'s figure and need a route or a depot to send it', () => {
  const rows = build({shops:[
    {s:2, item:'Flowers', target:100, peakSold:235, peakDay:'Saturday', from:0, fact:fact('short', {setTo:280})},
    {s:2, item:'Coffee', target:0, peakSold:20, from:null, fact:fact('noplan', {setTo:30})},
    {s:2, item:'Service', target:0, peakSold:20, fact:fact('noplan', {setTo:30})},
    {s:2, item:'Gifts', target:300, peakSold:290, from:0, fact:fact('covered')},
  ]});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].proposed, 280); // daily, never seven times the peak
  assert.match(rows[0].reason, enRe("sb.ck.peak.day", {n: 235, day: "Saturday", margin: en("sb.ck.margin")}));
  // A shelf on no plan that a depot could send to names that depot (via).
  const [via] = build({shops:[{s:2, item:'Soda', target:0, peakSold:61, from:null,
    fact:fact('noplan', {setTo:70, via:0})}]});
  assert.deepEqual([via.current, via.proposed, via.source], [0, 70, 0]);
  assert.match(via.reason, enRe("sb.ck.from", {site: "Depot · 1 Depot Street"}, {anchor: "start"}));
});

test('incomplete data preserves saved marks until a complete snapshot can reconcile them', () => {
  const rows = build({imports:[{s:0, rows:[order({})]}]});
  let marks = new Set([rows[0].key]);
  marks = context.reconcileOrderMarks(marks, [], false);
  assert.ok(marks.has(rows[0].key), 'a missing recipe must not erase the saved mark');
  // Checking a different visible action during the gap must preserve hidden notes.
  const other = build({shops:[{s:2, item:'Flowers', target:0, peakSold:120, from:0, fact:fact('noplan', {setTo:140})}]});
  marks.add(other[0].key);
  marks = new Set(JSON.parse(JSON.stringify([...marks]))); // save and reload
  marks = context.reconcileOrderMarks(marks, [...rows, ...other], true);
  assert.equal(marks.size, 2);
  const changed = build({imports:[{s:0, rows:[order({setTo:1700, value:1700})]}]});
  marks = context.reconcileOrderMarks(marks, [...changed, ...other], true);
  assert.ok(!marks.has(rows[0].key), 'a changed recommendation invalidates its old mark');
  assert.ok(!marks.has(changed[0].key), 'new quantities must not inherit completion');
  assert.ok(marks.has(other[0].key));
  marks = context.reconcileOrderMarks(marks, [], true);
  assert.equal(marks.size, 0, 'a complete snapshot can remove resolved actions');
});

test('a row is keyed by its item key, and a tick stored under the item name still counts', () => {
  const [row] = build({imports:[{s:0, rows:[order({slug: 'ba:itemname_sugar'})]}]});
  assert.equal(row.key, JSON.stringify(['Weekly imports', 'depot#1', 'ba:itemname_sugar', 1000, 1500, null]));
  // The key a tick was stored under before: the same row, by the item's name.
  const stored = JSON.stringify(['Weekly imports', 'depot#1', 'Sugar', 1000, 1500, null]);
  assert.deepEqual([...context.reconcileOrderMarks(new Set([stored]), [row], true)], [row.key]);
  assert.deepEqual([...context.reconcileOrderMarks(new Set([stored]), [row], false)], [row.key]);
  // A same-named item under another key is another row: its tick is not this one's.
  const [twin] = build({imports:[{s:0, rows:[order({slug: 'ba:itemname_rawsugar'})]}]});
  assert.notEqual(twin.key, row.key);
  // A stored name no row carries any more is dropped like any resolved tick.
  assert.equal(context.reconcileOrderMarks(new Set([stored]), [], true).size, 0);
});

test('with the names in German, a tick stored under the English name still counts', () => {
  // The board's names in German: the row carries the German name, the tick was
  // stored under the English one, before rows were keyed by the item's key.
  const names = {'ba:itemname_sugar': 'Sugar'};
  Object.assign(context, {gnLang: 'de', englishName: key => names[key] || ''});
  try {
    const [row] = build({imports:[{s:0, rows:[order({item: 'Zucker', slug: 'ba:itemname_sugar'})]}]});
    const stored = JSON.stringify(['Weekly imports', 'depot#1', 'Sugar', 1000, 1500, null]);
    assert.deepEqual([...context.reconcileOrderMarks(new Set([stored]), [row], true)], [row.key]);
  } finally {
    delete context.gnLang; delete context.englishName;
  }
});

test('a paused order or delivery gap is a review action, not an invented quantity', () => {
  const rows = build({checks:[
    {s:0, item:'Flour', paused:true, from:'Importer', fact:fact('paused')},
    {s:0, item:'Sugar', paused:false, shortBy:1.2, fact:fact('short', {why:'shortfall'})},
  ]});
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.proposed === null));
  assert.match(rows[0].reason, enRe("sb.ck.review.from", {from: "Importer"}));
  assert.match(rows[1].reason, enRe("sb.ck.oneOff"));
  // A paused backup a route covers is no action: its fact is covered.
  assert.deepEqual(build({checks:[{s:0, item:'Water', paused:true, covered:true, from:'Importer',
    fact:fact('covered', {why:'route'})}]}), []);
});

test('unassigned factories require depot selection; a top-up is the input fact\'s figure', () => {
  const rows = build({
    loose:[{item:'Flour', week:1501}],
    sites:[{s:1, rows:[{item:'Flour', target:0, perDay:215, from:null, fact:fact('noplan', {setTo:250})}]}],
  });
  assert.equal(rows[0].proposed, null);
  assert.match(rows[0].reason, enRe("sb.ck.loose"));
  assert.match(rows[0].reason, enRe("sb.ck.loose.use", {n: 1501}));
  assert.equal(rows[1].proposed, 250);
  assert.match(rows[1].reason, enRe("sb.ck.input.cap", {margin: en("sb.ck.margin")}));
  // Under Demand the reason says what the figure was sized for.
  const [dem] = build({sites:[{s:1, rows:[{item:'Flour', target:100, perDay:215, from:0, margin:0.15,
    sizedFor:'dem', fact:fact('short', {setTo:250})}]}]});
  assert.match(dem.reason, new RegExp("^" + enRe("sb.ck.from", {site: "Depot · 1 Depot Street"}).source + " " + enRe("sb.ck.input.dem", {margin: en("sb.ck.margin.pct", {pct: 15})}).source));
});

test('a stalled input asks to check the route; one waiting on another input does not', () => {
  const rows = build({sites:[{s:1, rows:[
    {item:'Flour', target:300, perDay:215, from:0, fact:fact('stalled', {why:'notDrawn'})},
    {item:'Sugar', target:300, perDay:215, from:0, fact:fact('stalled', {why:'waiting'})},
  ]}]});
  assert.deepEqual(rows.map(r => [r.kind, r.item]), [['Check the delivery route', 'Flour']]);
});

test('a measured delivery gap has a one-off quantity, separate from the recurring order', () => {
  const gap = {s:0, item:'Sugar', shortBy:.8, catchUp:217, runsOut:'Sunday', fact:fact('short', {why:'shortfall'})};
  const rows = build({checks:[gap]});
  assert.equal(rows[0].proposed, 217);
  assert.equal(rows[0].current, null);
  assert.match(rows[0].reason, enRe("sb.ck.bring.day", {n: 217, day: "Sunday"}));
  const text = context.orderChecklistText(rows, 'Company');
  assert.match(text, enRe("sb.ck.copy.once", {n: 217}));
  assert.doesNotMatch(text, new RegExp(enRe("sb.ck.copy.notSet").source + " ->"));
  assert.notEqual(rows[0].key, build({checks:[{...gap, catchUp:230}]})[0].key);
});

test('completion identities survive site reordering but change with settings and sources', () => {
  const shop = {s:2, item:'Flowers', target:100, peakSold:235, from:0, fact:fact('short', {setTo:280})};
  const before = build({shops:[shop]})[0];
  const reordered = build({businesses:[businesses[2], businesses[1], businesses[0]],
    shops:[{...shop, s:0, from:2}]})[0];
  assert.equal(before.key, reordered.key);
  assert.notEqual(before.key, build({shops:[{...shop, target:150}]})[0].key);
  assert.notEqual(before.key, build({shops:[{...shop, fact:fact('short', {setTo:360})}]})[0].key);
  assert.notEqual(before.key, build({shops:[{...shop, from:1}]})[0].key);
});

test('copied checklist groups actions and includes units and read-only instructions', () => {
  const rows = build({imports:[{s:0, rows:[order({})]}],
    checks:[{s:0, item:'Sugar', paused:true, from:'Importer', fact:fact('paused')}]});
  const text = context.orderChecklistText(rows, 'Company · day 12');
  assert.match(text, enRe("sb.ck.copy.enter"));
  assert.match(text, enRe("sb.ck.copy.units"));
  assert.match(text, enRe("sb.ck.copy.weekly", {from: 1000, n: 1500}));
  assert.equal(text.split(en("sb.ck.kind.imports") + " · Depot").length - 1, 1);
});

test('empty or incomplete supply data does not invent an action', () => {
  assert.deepEqual(build(), []);
});

/* --- the Set to box: the fact's figure, Smart Delivery levels and the player's own --- */
/* A bare number is a figure typed while the game held what the contract
   holds now; an object says what the game held when it was typed. */
const heldNow = c => c.smart && Number.isFinite(c.target) ? c.target : c.weekly || c.pausedWeekly || 0;
const typed = (contract, edit) => typeof edit === 'number' ? {value: edit, inGame: heldNow(contract)} : edit;
const setting = (f, contract, edit) => JSON.parse(JSON.stringify(
  context.importSetting(f, contract, typed(contract, edit))));
// A row as supplyChecklistRows builds it: the fact's figures, then the setting.
const row = (f, contract, edit, extra = {}) => ({s:0, item:'Sugar', use:f.use, parts:f.parts, margin:0.15,
  need:f.need, ...setting(f, contract, edit), ...extra});

test('the box holds the figure in game until the fact asks for a change', () => {
  const covered = setting(fact('covered'), {weekly:1500, smart:true, target:1500});
  assert.equal(covered.fit, 'covered');
  assert.equal(covered.inGame, 1500);
  assert.equal(covered.value, 1500, 'nothing to change: the box holds the level in game');
  assert.equal(covered.changed, false);
  const short = setting(fact('short', {setTo:1610}), {weekly:900, smart:true, target:900});
  assert.equal(short.fit, 'short');
  assert.equal(short.value, 1610);
  assert.equal(short.changed, true);
  // A line with no contract yet that a factory line needs: an order from nothing.
  const none = setting(fact('noplan', {setTo:1610}), {});
  assert.deepEqual([none.inGame, none.value, none.changed], [null, 1610, true]);
});

test('could lower is Python\'s word, and only on a plain order', () => {
  assert.equal(setting(fact('covered', {lower:1150}), {weekly:5000}).lower, 1150);
  assert.equal(setting(fact('covered', {lower:1150}), {weekly:5000, smart:true, target:5000}).lower, null);
  assert.equal(setting(fact('covered'), {weekly:5000}).lower, null);
});

test('a paused contract keeps its figure in the box until the player types one', () => {
  const paused = setting(fact('paused', {setTo:1610}), {weekly:0, pausedWeekly:3000, smart:true, target:3000});
  assert.equal(paused.fit, 'paused');
  assert.equal(paused.value, 3000);
  assert.equal(paused.changed, false);
  assert.equal(setting(fact('paused', {setTo:1610}), {weekly:0, pausedWeekly:3000}, 2000).changed, true);
  // A paused level shows the level in game.
  const level = setting(fact('paused'), {weekly:0, pausedWeekly:1400, smart:true, target:1000, plainAfter:400});
  assert.deepEqual([level.paused, level.inGame], [true, 1000]);
});

test('the player\'s figure replaces the suggestion; typing the suggestion is no edit', () => {
  const f = fact('short', {setTo:1400});
  const mine = setting(f, {weekly:900, smart:true, target:900}, 2000);
  assert.deepEqual([mine.edited, mine.value, mine.suggested, mine.changed], [true, 2000, 1400, true]);
  // Typing the figure the game holds turns the suggestion down: an edit
  // that asks for no change, kept while the game's figure stays put.
  const down = setting(f, {weekly:900}, 900);
  assert.deepEqual([down.stale, down.edited, down.value, down.changed], [false, true, 900, false]);
  // Once the game's figure has moved, the typed figure answered a game that
  // is gone: stale, dropped, and the row reads as the board sees it again,
  // whether the game moved to the typed figure or elsewhere.
  const entered = setting(f, {weekly:1200}, {value:1200, inGame:900});
  assert.deepEqual([entered.stale, entered.edited, entered.value], [true, false, 1400]);
  const moved = setting(f, {weekly:1000}, {value:2000, inGame:900});
  assert.deepEqual([moved.stale, moved.edited, moved.value], [true, false, 1400]);
  // The turned-down 900 does not come back as an order to lower a short row.
  const away = setting(f, {weekly:1200}, {value:900, inGame:900});
  assert.deepEqual([away.stale, away.edited, away.value], [true, false, 1400]);
  const rows = build({imports:[{s:0, rows:[row(f, {weekly:1200}, {value:900, inGame:900})]}]});
  assert.deepEqual([rows[0].current, rows[0].proposed], [1200, 1400]);
  // A figure typed on a line no contract imports ("not imported, add N"),
  // which a route from the company's own site has covered since: no contract
  // and no suggestion leaves the figure nothing to answer, so it is stale.
  const routed = setting(fact('covered', {why:'route'}), {}, {value:600, inGame:null});
  assert.deepEqual([routed.stale, routed.edited, routed.value, routed.inGame, routed.changed],
    [true, false, null, null, false]);
  // While the line still asks for an import, the figure stands.
  const adding = setting(fact('noplan', {setTo:1610}), {}, {value:600, inGame:null});
  assert.deepEqual([adding.stale, adding.edited, adding.value], [false, true, 600]);
  // Nothing suggested only because nothing is used right now: the figure stays.
  const idle = setting(fact('noplan', {setTo:null, use:0, need:0}), {}, {value:600, inGame:null});
  assert.deepEqual([idle.stale, idle.edited, idle.value], [false, true, 600]);
  // Not a number, or below zero, is not a figure.
  assert.equal(setting(f, {weekly:900}, -5).edited, false);
  assert.equal(setting(f, {weekly:900}, NaN).edited, false);
});

test('the checklist names a Smart Delivery stock level, not a weekly order', () => {
  const f = fact('short', {setTo:1400});
  const rows = build({imports:[{s:0, rows:[row(f, {weekly:900, smart:true, target:900})]}]});
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].current, rows[0].proposed, rows[0].mode], [900, 1400, 'smart']);
  assert.match(rows[0].reason, enRe("sb.ck.set.smart", {n: 1400}, {anchor: "start"}));
  const text = context.orderChecklistText(rows, 'Company');
  assert.match(text, enRe("sb.ck.copy.smart", {from: 900, n: 1400}));
  assert.doesNotMatch(text, enRe("sb.ck.copy.weekly"));
  const plain = build({imports:[{s:0, rows:[row(f, {weekly:900})]}]});
  assert.match(plain[0].reason, enRe("sb.ck.set.weekly", {n: 1400}, {anchor: "start"}));
  assert.match(context.orderChecklistText(plain, 'Company'), enRe("sb.ck.copy.weekly", {from: 900, n: 1400}));
  assert.notEqual(rows[0].key, plain[0].key, 'a level and an order are not the same mark');
});

test('the checklist names the contract that holds the level', () => {
  const held = {weekly:1100, smart:true, target:500, levelImporter:'A', levelName:'1 Pier, its 2nd of 2 contracts here'};
  const rows = build({imports:[{s:0, rows:[row(fact('short', {setTo:800}), held)]}]});
  assert.equal(rows[0].proposed, 800);
  assert.match(rows[0].reason, enRe("sb.ck.set.smartAt", {at: "1 Pier, its 2nd of 2 contracts here", n: 800}, {anchor: "start"}));
});

test('an edited figure feeds the checklist, including on a row the board finds covered', () => {
  const edited = build({imports:[{s:0, rows:[row(fact('covered'), {weekly:1500, smart:true, target:1500}, 3000)]}]});
  assert.equal(edited.length, 1);
  assert.deepEqual([edited[0].current, edited[0].proposed], [1500, 3000]);
  assert.match(edited[0].reason, enRe("sb.ck.yours"));
  // An edit on a short row replaces the suggestion.
  const f = fact('short', {setTo:1400});
  const short = build({imports:[{s:0, rows:[row(f, {weekly:900}, 2500)]}]});
  assert.equal(short[0].proposed, 2500);
  assert.match(short[0].reason, enRe("sb.ck.yours.suggest", {n: 1400}));
  // Typing the figure in game turns the suggestion down: nothing to do.
  assert.deepEqual(build({imports:[{s:0, rows:[row(f, {weekly:900}, 900)]}]}), []);
  // A new figure is a new action: an old tick does not carry over.
  const other = build({imports:[{s:0, rows:[row(f, {weekly:900}, 2600)]}]});
  assert.notEqual(short[0].key, other[0].key);
});

test('a paused contract resumes at a typed figure, or says the fact\'s week', () => {
  const f = fact('paused', {setTo:1610, need:1610});
  const rows = build({imports:[{s:0, rows:[row(f, {weekly:0, pausedWeekly:3000, smart:true, target:3000}, 1600)]}]});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].proposed, 1600);
  assert.match(rows[0].reason, new RegExp(enRe("sb.ck.resume").source + " " + enRe("sb.ck.paused.smart", {n: 3000}).source + " " + enRe("sb.ck.set.smart", {n: 1600}).source));
  const [untouched] = build({imports:[{s:0, rows:[row(f, {weekly:0, pausedWeekly:13000})]}]});
  assert.equal(untouched.proposed, null);
  assert.match(untouched.reason,
    new RegExp(enRe("sb.ck.resume").source + " " + enRe("sb.ck.paused.weekly", {n: 13000}).source + " " + enRe("sb.ck.paused.sized", {sized: en("sb.ck.uses.both", {n: 1300, route: "", margin: en("sb.ck.margin.pct", {pct: 15})}), n: 1610}).source));
});

test('a route that brings part of the week is named once, off the week', () => {
  const f = fact('short', {setTo:14490, use:12600, parts:{lines:14000, sites:11200, route:12600}});
  const [action] = build({imports:[{s:0, rows:[row(f, {weekly:5000})]}]});
  assert.deepEqual([action.current, action.proposed], [5000, 14490]);
  assert.match(action.reason, new RegExp(enRe("sb.ck.route.less", {n: 12600}).source + enRe("sb.ck.margin.pct", {pct: 15}).source));
  // A route that brings the whole week covers the line: nothing to ask of the import.
  assert.deepEqual(build({imports:[{s:0, rows:[row(fact('covered', {why:'route'}), {weekly:5000}, undefined, {covered:true, need:0})]}]}), []);
});

/* Today's Plan imports card, from the same rows and ticks as the checklist:
   one change said in full, several counted, all ticked, and nothing to do. */
const names = {0: 'Import Hub', 1: 'Factory', 2: 'Shop'};
const card = (rows, ticked = [], gaps = {complete: true, unnamed: 0}) => JSON.parse(JSON.stringify(
  context.planImportsState(rows, new Set(ticked), s => names[s] ?? null, gaps)));

test('the Plan imports card has four states, and counts what the checklist has to do', () => {
  const one = build({imports:[{s:0, rows:[order({item:'Metal Band', smart:true, current:15200, setTo:20200,
    value:20200, inGame:15200, levelName:'Import Hub'})]}]});
  assert.equal(one.length, 1);
  assert.deepEqual(card(one), {badge:en("today.moves.plan.badge.one"), live:true,
    what:en("today.moves.plan.one.at", {item: "<b>Metal Band</b>", site: "Import Hub", change: en("today.moves.plan.smart", {from: "15,200", to: "20,200"})})});

  const many = build({
    imports:[{s:0, rows:[order({item:'Sugar'}), order({item:'Flour'})]}],
    shops:[{s:2, item:'Paper Bag', from:0, peakSold:400, target:100, peakDay:'Saturday', fact:fact('short', {setTo:460})}],
  });
  assert.equal(many.length, 3);
  assert.deepEqual(card(many), {badge:en("today.moves.plan.badge.many", {n: 3}), live:true,
    what:en("today.moves.plan.many.at2", {changes: "<b>" + en("today.moves.plan.changes", {n: 3}) + "</b>", site: "Import Hub", other: "Shop", item: "Sugar"})});
  // A tick takes a row off the count, as it takes it off the checklist's "to do".
  const left = card(many, [many[0].key]);
  assert.equal(left.badge, en("today.moves.plan.badge.many", {n: 2}));
  assert.match(left.what, enRe("today.moves.plan.many.at", {item: "Flour", changes: "<b>" + en("today.moves.plan.changes", {n: 2}) + "</b>"}));
  assert.equal(card(many, [many[0].key, many[2].key]).badge, en("today.moves.plan.badge.one"));

  assert.deepEqual(card(many, many.map(r => r.key)), {badge:en("today.moves.plan.badge.ticked"), live:false,
    what:en("today.moves.plan.ticked", {n: 3})});
  assert.deepEqual(card([], [], {complete: true, unnamed: 0}),
    {badge:en("today.moves.plan.badge.set"), live:false, what:en("today.moves.plan.clear")});
});

test('tight never reaches Today: with only margin changes left, the card says nothing falls short', () => {
  // drawSupplyStrip() hands the card the rows that are not tight, and how many are.
  assert.deepEqual(card([], [], {complete: true, unnamed: 0, margin: 2}), {badge:en("today.moves.plan.badge.set"), live:false,
    what:en("today.moves.plan.short", {changes: en("today.moves.plan.margin", {n: 2})})});
  assert.doesNotMatch(card([], [], {complete: true, unnamed: 0, margin: 1}).what, enRe("sb.word.tight", {}, {flags: "i"}));
  const drawn = between(source, 'function drawSupplyStrip(', '/* The Set to figures the player typed');
  assert.match(drawn, /const urgent = rows\.filter\(r => !r\.tight && !r\.lower\);/);
  assert.match(drawn, /planImportsState\(urgent,/);
});

test('a top-up target set too high is a change to lower, never tight and never on Today', () => {
  const [row] = build({shops:[{s:2, item:'Paper Bag', target:3000, sold:90, peakSold:99, peakDay:'Saturday', from:0,
    fact:fact('idle', {why:'targetHigh', role:'shelf', cad:'daily', use:99, need:114, have:3000, setTo:120, lowers:true})}]});
  assert.deepEqual([row.kind, row.current, row.proposed, row.lower, row.tight], ['Shop daily top-ups', 3000, 120, true, undefined]);
  assert.match(row.reason, new RegExp("^" + enRe("sb.ck.from", {site: "Depot · 1 Depot Street"}).source + " " + enRe("sb.ck.lower.days", {n: 33}).source));
  // An idle shelf without the figure asks for nothing.
  assert.deepEqual(build({shops:[{s:2, item:'Paper Bag', target:3000, sold:90, peakSold:99, from:0,
    fact:fact('idle', {why:'targetHigh', setTo:null})}]}), []);
  // With only a top-up to lower left, Today's card says nothing falls short.
  assert.deepEqual(card([], [], {complete: true, unnamed: 0, lower: 1}), {badge:en("today.moves.plan.badge.set"), live:false,
    what:en("today.moves.plan.short", {changes: en("today.moves.plan.lower", {n: 1})})});
  assert.equal(card([], [], {complete: true, unnamed: 0, margin: 1, lower: 3}).what,
    en("today.moves.plan.short.both", {margin: en("today.moves.plan.margin", {n: 1}), lower: en("today.moves.plan.lower", {n: 3})}));
  // Beside changes to type, the card says what else Supply lists, so its count and the strip's add up.
  const one = build({imports:[{s:0, rows:[order({})]}]});
  assert.match(card(one, [], {complete: true, unnamed: 0, margin: 1, lower: 2}).what, new RegExp(" " + enRe("today.moves.plan.more.both", {n: 3}).source + "$"));
  assert.match(card(one, [one[0].key], {complete: true, unnamed: 0, lower: 2}).what, new RegExp(enRe("today.moves.plan.ticked", {n: 1}).source + " " + enRe("today.moves.plan.more.lower", {n: 2}).source + "$"));
  assert.doesNotMatch(card(one, [], {complete: true, unnamed: 0}).what, enRe("today.moves.plan.more.both"));
});

test('an empty checklist that could not see everything does not say ALL SET', () => {
  // The same caveats the checklist gives: recipes still unnamed, or no game text.
  assert.deepEqual(card([], [], {complete: true, unnamed: 3}), {badge:en("today.moves.plan.badge.none"), live:false,
    what:en("today.moves.plan.none.unnamed", {unnamed: en("today.moves.plan.unnamed", {n: 3})})});
  assert.deepEqual(card([], [], {complete: true, unnamed: 1}).what,
    en("today.moves.plan.none.unnamed", {unnamed: en("today.moves.plan.unnamed", {n: 1})}));
  assert.deepEqual(card([], [], {complete: false, unnamed: 0}), {badge:en("today.moves.plan.badge.none"), live:false,
    what:en("today.moves.plan.none.text")});
  // Both gaps at once are both named.
  assert.equal(card([], [], {complete: false, unnamed: 2}).what,
    en("today.moves.plan.none.both", {unnamed: en("today.moves.plan.unnamed", {n: 2})}));
});

test('a paused import with a figure reads as a resume, not an order from "not set"', () => {
  const rows = build({imports:[{s:0, rows:[
    order({item:'Sugar', fit:'paused', paused:true, need:1400, edited:true, value:1600, pausedWeekly:1000}),
    order({item:'Salt', fit:'paused', smart:true, paused:true, need:900, edited:true, value:1200, pausedWeekly:700}),
  ]}]});
  assert.equal(rows.length, 2);
  // The row says it is paused; the card reads that, not the reason's wording.
  assert.deepEqual(rows.map(r => r.paused), [true, true]);
  assert.equal(card(rows.map(r => ({...r, reason: 'Anything.'})), [rows[1].key]).what,
    en("today.moves.plan.one.at", {item: "<b>Sugar</b>", site: "Import Hub", change: en("today.moves.plan.resume.week", {to: "1,600"})}));
  assert.equal(build({imports:[{s:0, rows:[order({})]}]})[0].paused, undefined, 'an ordinary order carries no flag');
  assert.equal(card(rows, [rows[1].key]).what,
    en("today.moves.plan.one.at", {item: "<b>Sugar</b>", site: "Import Hub", change: en("today.moves.plan.resume.week", {to: "1,600"})}));
  assert.equal(card(rows, [rows[0].key]).what,
    en("today.moves.plan.one.at", {item: "<b>Salt</b>", site: "Import Hub", change: en("today.moves.plan.resume.smart", {to: "1,200"})}));
});

test('the card says a review in the checklist’s own words, and escapes a save’s names', () => {
  const rows = build({loose:[{item:'<Glue>', week:700}]});
  assert.deepEqual(card(rows), {badge:en("today.moves.plan.badge.one"), live:true,
    what:en("today.moves.plan.one", {item: "<b>&lt;Glue></b>", change: en("sb.ck.lead.loose")})});
});

test("in another language the words change, and the kinds, tick keys and Today's wording stay whole", () => {
  // A row's kind is its id: the tabs pick rows by it and every tick's key holds it.
  const input = {loose:[{item:'Glue', week:700}], imports:[{s:0, rows:[order({})]}]};
  const en = build(input);
  context.ttSetTable('de', {'sb.ck.kind.imports': 'Wochenimporte', 'sb.ck.loose': 'Wähle ein Depot.',
    'sb.ck.lead.loose': 'wähle ein Depot', 'sb.ck.copy.row': '[ ] {item} – {change} – {reason}'});
  try {
    const de = build(input);
    assert.deepEqual(de.map(r => [r.kind, r.key, r.legacyKey]), en.map(r => [r.kind, r.key, r.legacyKey]));
    // Pins the wording: translation-table interpolation and grouping.
    assert.match(de[0].group, /^Wochenimporte · Depot · 1 Depot Street$/);
    const review = de.find(r => r.proposed === null);
    // Pins the wording: the supplied German translation is rendered.
    assert.match(review.reason, /^Wähle ein Depot\. /);
    // Today's card takes the review's own first sentence, not a slice of the reason.
    // Pins the wording: translated review lead is kept whole.
    assert.equal(card([review]).what, '<b>Glue</b>: wähle ein Depot.');
    // The copied checklist follows the UI language.
    // Pins the wording: the supplied copy template is interpolated.
    assert.match(context.orderChecklistText(de, 'Company'), /\n\[ \] Glue – Review – Wähle ein Depot\./);
  } finally {
    context.ttSetTable('en', null);
  }
});

test('the board keeps no verdict engine of its own', () => {
  // Python is the only judge (supplyFact); the JS engine that recomputed
  // factory inputs and import levels is gone.
  for(const name of ['function feedVerdict(', 'function feedRoute(', 'const feedFit =', 'function importLevelFor(',
                     'const importRaise =', 'function importWeek(', 'const ceil100 ='])
    assert.equal(source.indexOf(name), -1, name);
});

test('a factory line short of its hours is one "Factory run hours" row; more hours than needed is none', () => {
  const lines = [
    {s: 1, item: 'Cake', slug: 'ba:itemname_cake', fact: {st: 'short', why: 'hours', lvl: 'warn'}, hoursNow: 12, need: 24, machines: 2,
     sizedFor: 'cap'},
    {s: 1, item: 'Bread', slug: 'ba:itemname_bread', fact: {st: 'covered', why: null, lvl: 'ok', lower: 10}, hoursNow: 24, need: 10, machines: 2},
  ];
  const rows = JSON.parse(JSON.stringify(context.buildOrderChecklist([], [], [], [], [], businesses, [], [], lines)));
  assert.deepEqual(rows.map(r => [r.kind, r.item, r.current, r.proposed, r.mode]),
    [['Factory run hours', 'Cake', 12, 24, 'hours']]);
  assert.match(rows[0].reason, new RegExp("^" + enRe("sb.ck.staff.each", {item: "Cake", n: 24, m: 2, now: 12}).source + " " + enRe("sb.ck.hours.full").source));
  // Keyed by the item's key, as every checklist row is.
  assert.equal(rows[0].key, JSON.stringify(['Factory run hours', 'factory#2', 'ba:itemname_cake', 12, 24, null]));
  assert.match(context.orderChecklistText(rows, 'Company'), enRe("sb.ck.copy.row", {item: "Cake", change: en("sb.ck.copy.hours", {from: 12, n: 24})}));
  assert.match(context.orderChecklistText(rows, 'Company', 'dem'), enRe("sb.ck.copy.shop"));
  assert.match(context.orderChecklistText(rows, 'Company'), enRe("sb.ck.copy.full"));
  assert.equal(card(rows).what, en("today.moves.plan.one.at", {item: "<b>Cake</b>", site: "Factory", change: en("today.moves.plan.hours", {from: "12", to: "24"})}));
});
