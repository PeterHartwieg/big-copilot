// Which list a finding shows in: the materiality gate decides, a kind's switch
// only demotes. Issue #51 — the switch under the list did nothing at all to a
// finding the gate had already set aside, because the smaller list was built
// from the raw minor rows.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'ba_dashboard.py'), 'utf8');
/* The comment above the function is the slice's opening anchor: rewording it is
   a change to this test as well. */
const START = '/* Where a finding shows is decided twice over';
const PARTITION = source.slice(source.indexOf(START), source.indexOf('function drawAlerts()'));
const DRAW = source.slice(
  source.indexOf('function drawAlerts()'), source.indexOf('/* A round step for the y axis'));

const context = vm.createContext({});
vm.runInContext(PARTITION, context);
const split = (alerts, minorRows, prefs) =>
  vm.runInContext('partitionFindings', context)(alerts, minorRows, prefs);

const row = (group, worth, id) => ({group, worth, id});
const GATE = {atcap: false, idlestaff: false, jobdemand: true, hype: true};

test('a kind switched off leaves the list and lands under it', () => {
  const alerts = [row('atcap', 9000, 'a'), row('jobdemand', 8000, 'b')];
  const minor = [row('hype', 30, 'c')];
  const {list, smaller, off} = split(alerts, minor, GATE);
  assert.deepEqual(list, [alerts[1]]);
  assert.deepEqual(smaller, [minor[0], alerts[0]]);
  assert.equal(off, 1);
});

test('nothing is dropped, in either direction', () => {
  const alerts = [row('atcap', 9000, 'a'), row('idlestaff', 8000, 'b'), row('hype', 7000, 'c')];
  const minor = [row('jobdemand', 30, 'd'), row('hype', 20, 'e')];
  const every = (prefs) => {
    const {list, smaller} = split(alerts, minor, prefs);
    return list.concat(smaller);
  };
  // The same five findings are on screen whichever way the switches point.
  const ids = (rows) => rows.map(r => r.id).sort();
  assert.deepEqual(ids(every(GATE)), ids(every({})));
  assert.deepEqual(ids(every({atcap: false, idlestaff: false, hype: false, jobdemand: false})),
                   ids(every({})));
});

test('a below-gate finding answers its own switch by moving to the bottom', () => {
  const minor = [
    row('hype', 40, 'hype'),
    row('idlestaff', 30, 'idle'),
    row('jobdemand', 20, 'demand'),
  ];
  const on = split([], minor, {});
  assert.deepEqual(on.smaller.map(r => r.id), ['hype', 'idle', 'demand']);
  assert.equal(on.off, 0);
  const off = split([], minor, {idlestaff: false});
  assert.deepEqual(off.smaller.map(r => r.id), ['hype', 'demand', 'idle']);
  assert.equal(off.off, 1);
});

test('off counts the switched-off rows from both sides of the gate', () => {
  const alerts = [row('atcap', 9000, 'a'), row('idlestaff', 8000, 'b')];
  const minor = [row('idlestaff', 30, 'c'), row('hype', 20, 'd')];
  const {smaller, off} = split(alerts, minor, {atcap: false, idlestaff: false});
  // 'd' is the only below-gate row still switched on, so it leads.
  assert.deepEqual(smaller.map(r => r.id), ['d', 'c', 'a', 'b']);
  assert.equal(off, 3);
});

test('with the defaults the smaller list is the gate rows and nothing is called off', () => {
  const minor = [row('hype', 40, 'a'), row('jobdemand', 30, 'b')];
  const {list, smaller, off} = split([row('atcap', 9000, 'c')], minor, {});
  assert.deepEqual(list, [row('atcap', 9000, 'c')]);
  assert.deepEqual(smaller, minor);
  assert.equal(off, 0);
});

test('the gate and the switches are two lines, not one "smaller" count (issue #51)', () => {
  const alerts = [row('atcap', 9000, 'a'), row('jobdemand', 8000, 'b')];
  const minor = [row('hype', 30, 'c'), row('idlestaff', 20, 'd')];
  const {list, below, switchedOff} = split(alerts, minor, {atcap: false, idlestaff: false});
  assert.deepEqual(list.map(r => r.id), ['b']);
  // Below the line: only what the gate set aside of the kinds still on.
  assert.deepEqual(below.map(r => r.id), ['c']);
  // Switched off: from both sides of the gate, never counted as "below".
  assert.deepEqual(switchedOff.map(r => r.id), ['d', 'a']);
});

test('the switched-off line names each kind with its count and worth', () => {
  const kinds = vm.runInContext('switchedOffKinds', context);
  const label = id => ({atcap: 'At capacity', idlestaff: 'Overstaffed hours', dead: 'Idle stock'})[id];
  const money = n => `$${Math.round(n / 1000)}k`;
  const rows = [row('atcap', 97000, 'a'), row('atcap', 31000, 'b'), row('atcap', 8000, 'c'),
                row('idlestaff', 400, 'd'), row('dead', null, 'e')];
  assert.equal(kinds(rows, label, money),
    'At capacity (3, $136k/day), Overstaffed hours (1, $0k/day), Idle stock (1)');
});

test('the switched-off line lists its kinds in the tune panel order', () => {
  const kinds = vm.runInContext('switchedOffKinds', context);
  const label = id => id;
  const money = n => `$${n}`;
  // Below-gate rows come first in the rows handed over; the order is the panel's.
  const rows = [row('dead', null, 'a'), row('idlestaff', 300, 'b'), row('atcap', 900, 'c'), row('mystery', null, 'd')];
  assert.equal(kinds(rows, label, money, ['atcap', 'idlestaff', 'dead']),
    'atcap (1, $900/day), idlestaff (1, $300/day), dead (1), mystery (1)');
});

test('the count lines say which is which', () => {
  assert.match(DRAW, /partitionFindings\(/);
  assert.match(DRAW, /below the \$\{fmt\(gate\)\}\/day line/);
  // Overstaffed hours is off by default, so the line cannot say "you".
  assert.match(DRAW, /in kinds switched off: /);
  assert.doesNotMatch(DRAW, /you switched off/);
  assert.match(DRAW, /switchedOffKinds\(switchedOff, kindLabel, compact, ALERT_GROUPS\.map\(g => g\.id\)\)/);
});

/* The kinds, their defaults and what a device already stores. The slice runs
   from the list to the comment that follows the storage helpers. */
const KINDS = source.slice(source.indexOf('const ALERT_GROUPS = ['),
  source.indexOf('/* The control that opens the panel'));
const kinds = vm.createContext({});
/* web/i18n.js runs ahead of the board script on the page: the kinds' labels
   are read through its tt(). */
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'i18n.js'), 'utf8'), kinds);
vm.runInContext(KINDS, kinds);
const run = expr => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, kinds));

test('At capacity is on by default; Overstaffed hours and Demand wave ending are off', () => {
  const on = Object.fromEntries(run('ALERT_GROUPS').map(g => [g.id, g.on]));
  assert.equal(on.atcap, true);
  assert.equal(on.idlestaff, false);
  assert.equal(on.hype, false);
  assert.equal(run('kindPrefs({})').atcap, true);
  assert.equal(run('kindPrefs({})').hype, false);
  // A player who switched Demand wave ending on keeps it on.
  assert.equal(run('kindPrefs(readKindChoices({v: 2, set: {hype: true}}))').hype, true);
});

test('a stored whole map keeps only what differs from the defaults it was saved under', () => {
  // The first boards wrote every kind on any flip, At capacity off among them.
  const legacy = Object.fromEntries(run('ALERT_GROUPS').map(g => [g.id, g.id !== 'atcap' && g.id !== 'idlestaff']));
  legacy.hype = false;  // the one kind this player really switched
  const choices = run(`readKindChoices(${JSON.stringify(legacy)})`);
  assert.deepEqual(choices, {hype: false});
  const prefs = run(`kindPrefs(${JSON.stringify(choices)})`);
  assert.equal(prefs.atcap, true, 'never touched: the new default applies');
  assert.equal(prefs.hype, false, 'a real choice survives');
  assert.equal(prefs.idlestaff, false);
  // The first boards had Demand wave ending on, so a stored true was only a
  // copy of that default: it is dropped, and the new default (off) applies.
  const copied = Object.fromEntries(run('ALERT_GROUPS').map(g => [g.id, g.id !== 'atcap' && g.id !== 'idlestaff']));
  assert.deepEqual(run(`readKindChoices(${JSON.stringify(copied)})`), {});
  assert.equal(run(`kindPrefs(readKindChoices(${JSON.stringify(copied)}))`).hype, false);
});

test('a player who had switched At capacity on keeps it on, and an explicit off survives', () => {
  assert.deepEqual(run('readKindChoices({atcap: true, idlestaff: true, loss: true})'),
    {atcap: true, idlestaff: true});
  // The new shape stores choices only, so an off written after the change is kept.
  assert.equal(run('kindPrefs(readKindChoices({v: 2, set: {atcap: false}}))').atcap, false);
  assert.deepEqual(run('readKindChoices(null)'), {});
});

test('a switch set back to its default stops being a stored choice', () => {
  assert.deepEqual(run('setKindChoice({}, "trend", false)'), {trend: false});
  assert.deepEqual(run('setKindChoice({trend: false}, "trend", true)'), {});
  assert.deepEqual(run('setKindChoice({}, "idlestaff", true)'), {idlestaff: true});
  assert.deepEqual(run('setKindChoice({idlestaff: true, trend: false}, "idlestaff", false)'), {trend: false});
  assert.deepEqual(run('setKindChoice({}, "hype", true)'), {hype: true});
  assert.deepEqual(run('setKindChoice({hype: true}, "hype", false)'), {});
  // Dropped, the kind follows its default again.
  assert.equal(run('kindPrefs(setKindChoice({atcap: false}, "atcap", true))').atcap, true);
});

/* R2: a headline cut at a bracket used to drop the item's variant, so
   "Fabric (Expensive)" and "Fabric (Cheap)" both read "Fabric". */
const SPLIT = source.slice(source.indexOf('/* A finding is a short verb phrase'),
  source.indexOf('/* The figure on the right'));
const splitting = vm.createContext({});
vm.runInContext(SPLIT, splitting);
const headline = a => vm.runInContext('splitFinding', splitting)(a).what;

test('a finding keeps the variant in its headline', () => {
  const site = 'Factory Clothing';
  const text = v => `Fabric (${v}) arrives at 6,612/day against 11,520 needed while Import Hub holds 65,354; the line is not drawing it`;
  const a = headline({site, text: text('Expensive')});
  const b = headline({site, text: text('Cheap')});
  assert.match(a, /^Fabric \(Expensive\)/);
  assert.match(b, /^Fabric \(Cheap\)/);
  assert.notEqual(a, b);
  assert.match(headline({site, text: 'Clothing (Classic Cheap Female) sells 400 on a Saturday against a 300 top-up, and a much longer tail here'}),
    /^Clothing \(Classic Cheap Female\)/);
});

test('a bracket of words is still a place to cut a long headline', () => {
  const t = 'Revenue down 20% week on week with a very long explanation (mostly the weekend) after that';
  assert.equal(headline({site: 'X', text: t}), 'Revenue down 20% week on week with a very long explanation');
  // Cut at the bracket, the detail loses the bracket's own ")" and nothing else.
  assert.equal(vm.runInContext('splitFinding', splitting)({site: 'X', text: t}).more,
    'mostly the weekend after that');
});

test('a cut at a comma leaves the variant bracket whole in the detail', () => {
  const t = 'Shelves run dry at 3 shops, Clothing (Classic Cheap Female) sells out first every Saturday';
  const {what, more} = vm.runInContext('splitFinding', splitting)({site: 'X', text: t});
  assert.equal(what, 'Shelves run dry at 3 shops');
  assert.equal(more, 'Clothing (Classic Cheap Female) sells out first every Saturday');
});

/* The renames of R12 change what a kind is called, never its id: the id is
   what a stored switch is keyed by, so a player's choices carry over. */
test('idle stock has one name, and a renamed kind keeps its id', () => {
  // The label's English, beside its key: get label(){ return tt("nav.kind.dead.label", "Idle stock"); }
  const kind = id => (source.match(new RegExp(`\\{id:"${id}",\\s*get label\\(\\)\\{ return tt\\("[^"]+", "([^"]+)"`)) || [])[1];
  // A depot's idle group on Supply (R13) and the finding kind share one name.
  const group = (source.match(/slug: null, item: "([^"]+)", fact: kids\[0\]\.fact/) || [])[1];
  assert.equal(kind('dead'), 'Idle stock');
  assert.equal(group, kind('dead'), 'the idle group and the finding kind share one name');
  assert.equal(kind('staff'), 'Nobody staffed');
});

/* R8: stock a depot holds that no plan sends on, while the company's own
   sites sell or need it, is a kind of its own, and every map that routes a
   kind knows it. */
test('Not routed is a kind, on by default, linked to the site\'s Supply tab and the depot\'s Stock', () => {
  const g = run('ALERT_GROUPS').find(x => x.id === 'notrouted');
  assert.deepEqual([g.label, g.on], ['Not routed', true]);
  const links = source.slice(source.indexOf('const ALERT_LINKS = {'), source.indexOf('const SEC_PAGE ='));
  assert.match(links, /notrouted: \{sec:"secWarehouses", tab:"site"\}/);
  const evidence = source.slice(source.indexOf('const ALERT_EVIDENCE = {'), source.indexOf('const SEV_KIND ='));
  assert.match(evidence, /notrouted: \{block: "stock"\}/);
  assert.match(source, /depot: \{[^}]*notrouted: "stock"/);
});

/* A depot only a route from the company's own site feeds, whose busiest day
   outruns its daily top-up: a kind of its own, opening the depot's page on
   its Stock, since Before the import never lists such a depot. */
test("Depot top-up too low is a kind, on by default, landing on the depot's own Stock", () => {
  const g = run('ALERT_GROUPS').find(x => x.id === 'topup');
  assert.deepEqual([g.label, g.on], ['Depot top-up too low', true]);
  const links = source.slice(source.indexOf('const ALERT_LINKS = {'), source.indexOf('const SEC_PAGE ='));
  assert.match(links, /topup: \{sec:"secDetail", site:true\}/);
  const evidence = source.slice(source.indexOf('const ALERT_EVIDENCE = {'), source.indexOf('const SEV_KIND ='));
  assert.match(evidence, /topup: \{block: "stock"\}/);
  assert.match(source, /depot: \{[^}]*topup: "stock"/);
});

/* A wholesale store's weekly delivery that falls short, to a shop or a
   depot: one kind for every such finding, opening the site's page on its
   shelves (a shop) or its Stock (a depot). Top-up stays a route's. */
test('Wholesale delivery too low is a kind of its own, landing on the shelves or the depot\'s Stock', () => {
  const g = run('ALERT_GROUPS').find(x => x.id === 'wholesale');
  assert.deepEqual([g.label, g.on], ['Wholesale delivery too low', true]);
  assert.match(g.note, /wholesale store delivers/);
  assert.match(run('ALERT_GROUPS').find(x => x.id === 'topup').note, /route from your own site/);
  const links = source.slice(source.indexOf('const ALERT_LINKS = {'), source.indexOf('const SEC_PAGE ='));
  assert.match(links, /wholesale: \{sec:"secDetail", site:true\}/);
  const evidence = source.slice(source.indexOf('const ALERT_EVIDENCE = {'), source.indexOf('const SEV_KIND ='));
  assert.match(evidence, /wholesale: \{block: "shelves"\}/);
  assert.match(source, /depot: \{[^}]*wholesale: "stock"/);
  assert.match(source, /wholesale: \["wholesale", "contract", "delivery"\]/);
});

test('a wholesale finding shows the week used, or the units left, in the amount column', () => {
  const at = source.indexOf('const amtHtml =');
  const ctx = vm.createContext({money: String, fmt: String});
  vm.runInContext(source.slice(at, source.indexOf('/* A finding whose kind is switched off', at)), ctx);
  const amount = a => vm.runInContext('findingAmount', ctx)(a);
  assert.equal(amount({group: 'wholesale', text: "Soda's wholesale delivery brings 600 a week against the 700 it sells"}),
    '700<small>/week used</small>');
  assert.equal(amount({group: 'wholesale', text: "Water's wholesale delivery brings 1,000 a week against 1,680 used"}),
    '1,680<small>/week used</small>');
  assert.equal(amount({group: 'wholesale', text: "Beer runs out before Tuesday's wholesale delivery: 150 left at 100/day"}),
    '150<small>left</small>');
});

/* Today reads the findings of the sizing on screen: Python runs the list
   twice, and Demand has its own (alertsDemand). */
test('Today, the kinds popover and the map read the list of the sizing on screen', () => {
  const at = source.indexOf('const alertLines =');
  const ctx = vm.createContext({});
  vm.runInContext('let sizing = "cap"; let D = null;\n' + source.slice(at, source.indexOf('/* The sizing switch.', at)), ctx);
  const lines = ctx => JSON.parse(vm.runInContext('JSON.stringify(alertLines().map(a => a.id))', ctx));
  vm.runInContext(`D = {alerts: [{id: 'feed'}, {id: 'paused'}], minor: {rows: [{id: 'm'}]},
    alertsDemand: {lines: [{id: 'paused'}], minor: {rows: []}}}`, ctx);
  assert.deepEqual(lines(ctx), ['feed', 'paused']);
  vm.runInContext('sizing = "dem"', ctx);
  assert.deepEqual(lines(ctx), ['paused']);
  assert.deepEqual(vm.runInContext('alertMinor().rows.length', ctx), 0);
  // A payload from before the second pass keeps the 24/7 list under Demand.
  vm.runInContext('delete D.alertsDemand', ctx);
  assert.deepEqual(lines(ctx), ['feed', 'paused']);
  assert.match(DRAW, /alertLines\(\), alertMinor\(\)\.rows/);
  const map = fs.readFileSync(path.join(__dirname, '..', 'web', 'map.js'), 'utf8');
  assert.match(map, /\.\.\.alertLines\(\), \.\.\.\(alertMinor\(\)\.rows/);
});

/* R13: every supply kind lands on a Supply tab: the one named, or with tab
   "site" the tab of the site's own kind (a shop's Shops, a factory's
   Factories, every other site's Warehouses). */
test('the supply kinds land on the Supply tab of their object', () => {
  const ctx = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('const ALERT_LINKS = {'), source.indexOf('/* Put something at the top of the window')) +
    '; this.out = JSON.stringify({ALERT_LINKS, SEC_PAGE, SEC_MOVED});', ctx);
  const got = JSON.parse(ctx.out), links = got.ALERT_LINKS;
  const tabs = Object.fromEntries(Object.entries(links).filter(([, l]) => l.tab).map(([id, l]) => [id, l.tab]));
  assert.deepEqual(tabs, {shortfall: 'site', order: 'site', paused: 'site',
    outruns: 'shops', unplanned: 'shops', dead: 'site', target: 'site', notrouted: 'site',
    feed: 'factories', staff: 'factories', unnamed: 'factories', unset: 'factories'});
  const pages = got.SEC_PAGE;
  for (const l of Object.values(links)) if (l.tab) assert.equal(pages[l.sec][0], 'supply');
  assert.deepEqual([...pages.secShops], ['supply', 'shops']);
  assert.deepEqual([...pages.secFactories], ['supply', 'factories']);
  const moved = got.SEC_MOVED;
  assert.deepEqual([moved.secLogistics, moved.secStock, moved.secFlow], ['secWarehouses', 'secShops', 'secWarehouses']);
});
