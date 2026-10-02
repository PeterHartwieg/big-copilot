// Which list a finding shows in: the materiality gate decides, a kind's switch
// only demotes. Issue #51 — the switch under the list did nothing at all to a
// finding the gate had already set aside, because the smaller list was built
// from the raw minor rows.
// The board script runs whole, through loadBoard() (tests/_board.cjs): the
// finding tables (ALERT_GROUPS, ALERT_LINKS, ALERT_EVIDENCE, ...) are read as
// the values the board builds, never as source text, so they may be written
// any way that builds the same values.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {loadBoard, recordingDocument} = require('./_board.cjs');

const context = loadBoard();
/* A value of the board, through JSON, so its objects compare as plain ones. */
const run = expr => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, context));
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
  const label = id => en("nav.kind." + id + ".label");
  const money = n => `$${Math.round(n / 1000)}k`;
  const rows = [row('atcap', 97000, 'a'), row('atcap', 31000, 'b'), row('atcap', 8000, 'c'),
                row('idlestaff', 400, 'd'), row('dead', null, 'e')];
  assert.equal(kinds(rows, label, money),
    [en("today.minor.offKind.worth", {kind: label("atcap"), n: 3, worth: "$136k"}), en("today.minor.offKind.worth", {kind: label("idlestaff"), n: 1, worth: "$0k"}), en("today.minor.offKind", {kind: label("dead"), n: 1})].join(", "));
});

test('the switched-off line lists its kinds in the tune panel order', () => {
  const kinds = vm.runInContext('switchedOffKinds', context);
  const label = id => id;
  const money = n => `$${n}`;
  // Below-gate rows come first in the rows handed over; the order is the panel's.
  const rows = [row('dead', null, 'a'), row('idlestaff', 300, 'b'), row('atcap', 900, 'c'), row('mystery', null, 'd')];
  assert.equal(kinds(rows, label, money, ['atcap', 'idlestaff', 'dead']),
    [en("today.minor.offKind.worth", {kind: "atcap", n: 1, worth: "$900"}), en("today.minor.offKind.worth", {kind: "idlestaff", n: 1, worth: "$300"}), en("today.minor.offKind", {kind: "dead", n: 1}), en("today.minor.offKind", {kind: "mystery", n: 1})].join(", "));
});

/* drawAlerts() on a board of its own, with the page's elements recorded: the
   ids the list shows, and the two count lines under it. */
function drawn(data, choices = {}, sizing = 'cap'){
  const {document, element} = recordingDocument();
  const board = loadBoard({document, __data: data, __choices: choices});
  vm.runInContext(`D = __data; sizing = ${JSON.stringify(sizing)};
    alertGroupPrefs = kindPrefs(__choices); drawAlerts();`, board);
  const ids = html => [...String(html).matchAll(/<div class="find [^"]*" data-id="([^"]+)"/g)].map(m => m[1]);
  return {list: ids(element('alerts').innerHTML), minor: String(element('alertMinor').innerHTML)};
}
const finding = (id, group, worth, level = 'warn') => ({id, group, level, site: 'X', text: `Finding ${id}`, worth});

test('the count lines say which is which', () => {
  const data = {meta: {}, businesses: [],
    alerts: [finding('a', 'atcap', 9000), finding('b', 'jobdemand', 8000)],
    minor: {gate: 500, rows: [finding('c', 'idlestaff', 400, 'info'), finding('d', 'hype', 30, 'info'),
      finding('e', 'loss', 20, 'info')]}};
  // Overstaffed hours and Demand wave ending are off by default; At capacity is switched off here.
  const {list, minor} = drawn(data, {atcap: false});
  assert.deepEqual(list, ['b'], 'the list keeps what partitionFindings() keeps');
  const [below, off] = minor.split('</p>');
  assert.match(below, enRe('today.minor.below', {n: 1, gate: 500}));
  // The switched-off kinds in the tune panel's order (ALERT_GROUPS), not in
  // the order their rows reach the line.
  const order = run('ALERT_GROUPS.map(g => g.id)').filter(id => ['atcap', 'idlestaff', 'hype'].includes(id));
  assert.notDeepEqual(order, ['idlestaff', 'hype', 'atcap'], 'the rows reach the line in another order than the panel');
  const worth = {atcap: '$9k', idlestaff: '$400', hype: '$30'};
  assert.match(off, enRe('today.minor.off', {n: 3, kinds: order.map(id =>
    en('today.minor.offKind.worth', {kind: en(`nav.kind.${id}.label`), n: 1, worth: worth[id]})).join(', ')}));
  // Pins the wording: default-off kinds must not be attributed to the player.
  assert.doesNotMatch(minor, /you switched off/i);
});

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
const headline = a => vm.runInContext('splitFinding', context)(a).what;

test('a finding keeps the variant in its headline', () => {
  const site = 'Factory Clothing';
  const text = v => `Fabric (${v}) arrives at 6,612/day against 11,520 needed while Import Hub holds 65,354; it isn't reaching the factory`;
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
  assert.equal(vm.runInContext('splitFinding', context)({site: 'X', text: t}).more,
    'mostly the weekend after that');
});

test('a cut at a comma leaves the variant bracket whole in the detail', () => {
  const t = 'Shelves run dry at 3 shops, Clothing (Classic Cheap Female) sells out first every Saturday';
  const {what, more} = vm.runInContext('splitFinding', context)({site: 'X', text: t});
  assert.equal(what, 'Shelves run dry at 3 shops');
  assert.equal(more, 'Clothing (Classic Cheap Female) sells out first every Saturday');
});

/* The renames of R12 change what a kind is called, never its id: the id is
   what a stored switch is keyed by, so a player's choices carry over. */
test('idle stock has one name, and a renamed kind keeps its id', () => {
  const kind = id => run('ALERT_GROUPS').find(g => g.id === id).label;
  // A depot's idle group on Supply (R13) and the finding kind share one name:
  // two idle lines fold into a group row named for the kind.
  const board = loadBoard();
  vm.runInContext('D = {meta: {}, businesses: [{key: "k", name: "Depot"}], supply: {}}', board);
  const idle = slug => ({s: 0, slug, item: slug, fact: {st: 'idle', why: 'notMoving'}, chk: [], stock: 5, week: 1, draw: null, busy: null});
  const table = vm.runInContext('sbDepotTable', board)({}, {}, [idle('a'), idle('b')]);
  const group = (table.match(/<tr class="sb-gr[^"]*"[^>]*><td class="sb-tk"><\/td><td class="l nm">([^<]+)</) || [])[1];
  assert.equal(kind('dead'), en("nav.kind.dead.label"));
  assert.equal(group, kind('dead'), 'the idle group and the finding kind share one name');
  assert.equal(kind('staff'), en("nav.kind.staff.label"));
});

/* R8: stock a depot holds that no plan sends on, while the company's own
   sites sell or need it, is a kind of its own, and every map that routes a
   kind knows it. */
test('Not routed is a kind, on by default, linked to Supply › Deliveries and the depot\'s Stock', () => {
  const g = run('ALERT_GROUPS').find(x => x.id === 'notrouted');
  assert.deepEqual([g.label, g.on], [en("nav.kind.notrouted.label"), true]);
  assert.deepEqual(run('ALERT_LINKS.notrouted'), {sec: "secDeliveries", view: "deliveries"});
  assert.deepEqual(run('ALERT_EVIDENCE.notrouted'), {block: "stock"});
  assert.equal(run('SP_EVIDENCE_KIND.depot.notrouted'), "stock");
});

/* A depot only a route from the company's own site feeds, whose busiest day
   outruns its daily top-up: a kind of its own, opening the depot's page on
   its Stock, since Before the import never lists such a depot. */
test("Depot top-up too low is a kind, on by default, landing on Deliveries, the depot's own Stock its evidence", () => {
  const g = run('ALERT_GROUPS').find(x => x.id === 'topup');
  assert.deepEqual([g.label, g.on], [en("nav.kind.topup.label"), true]);
  assert.deepEqual(run('ALERT_LINKS.topup'), {sec: "secDeliveries", view: "deliveries"});
  assert.deepEqual(run('ALERT_EVIDENCE.topup'), {block: "stock"});
  assert.equal(run('SP_EVIDENCE_KIND.depot.topup'), "stock");
});

/* A wholesale store's weekly delivery that falls short, to a shop or a
   depot: one kind for every such finding, opening the site's page on its
   shelves (a shop) or its Stock (a depot). Top-up stays a route's. */
test('Wholesale delivery too low is a kind of its own, landing on Deliveries, the shelves or the depot\'s Stock its evidence', () => {
  const g = run('ALERT_GROUPS').find(x => x.id === 'wholesale');
  assert.deepEqual([g.label, g.on], [en("nav.kind.wholesale.label"), true]);
  assert.match(g.note, enRe("nav.kind.wholesale.note"));
  assert.match(run('ALERT_GROUPS').find(x => x.id === 'topup').note, enRe("nav.kind.topup.note"));
  assert.deepEqual(run('ALERT_LINKS.wholesale'), {sec: "secDeliveries", view: "deliveries"});
  assert.deepEqual(run('ALERT_EVIDENCE.wholesale'), {block: "shelves"});
  assert.equal(run('SP_EVIDENCE_KIND.depot.wholesale'), "stock");
  assert.deepEqual(run('SS_KIND_SYN.wholesale'), ["wholesale", "contract", "delivery"]);
});

/* A finding with no money shows the figure Python sends beside it (`amt`,
   _amt() in ba_dashboard.py), never one read back out of its sentence: a
   reworded or translated sentence keeps its amount. */
test("the amount column shows a finding's amt, whatever its sentence says", () => {
  const amount = a => vm.runInContext('findingAmount', context)(a);
  const said = 'Words with 999 units and $5/day in them';
  const u = key => `<small>${en(key)}</small>`;
  assert.equal(amount({group: 'wholesale', text: said, amt: {n: 1680, unit: '/week used'}}), '1,680' + u('today.amt.weekUsed'));
  assert.equal(amount({group: 'wholesale', text: said, amt: {n: 150, unit: 'left'}}), '150' + u('today.amt.left'));
  assert.equal(amount({group: 'staff', text: said, amt: {n: 84, of: 168, unit: 'hours staffed'}}), '84/168' + u('today.amt.hoursStaffed'));
  assert.equal(amount({group: 'target', text: said, amt: {n: 64, unit: 'daily sales', sign: 'x'}}), '64x' + u('today.amt.dailySales'));
  assert.equal(amount({group: 'hype', text: said, amt: {n: 1550, unit: '/day under hype', sign: '$'}}), '$1,550' + u('today.amt.dayHype'));
  assert.equal(amount({group: 'shortfall', text: said, amt: {n: 4.2, unit: 'days early'}}), '4.2' + u('today.amt.daysEarly'));
  // No amt, no figure, however many numbers the sentence holds.
  assert.equal(amount({group: 'outruns', text: said}), '');
  // Money wins over amt.
  assert.equal(amount({group: 'dead', text: said, worth: 12, unit: '/day tied up', amt: {n: 4, unit: 'weeks'}}), '$12<small>/day tied up</small>');
});

/* Today reads the findings of the sizing on screen: Python runs the list
   twice, and Demand has its own (alertsDemand). */
test('Today, the kinds popover and the map read the list of the sizing on screen', () => {
  const ctx = loadBoard();
  vm.runInContext('sizing = "cap"', ctx);
  const lines = ctx => JSON.parse(vm.runInContext('JSON.stringify(alertLines().map(a => a.id))', ctx));
  vm.runInContext(`D = {alerts: [{id: 'feed'}, {id: 'paused'}], minor: {rows: [{id: 'm'}]},
    alertsDemand: {lines: [{id: 'paused'}], minor: {rows: []}}}`, ctx);
  require('./_payload_contract.cjs').assertPayloadShape(vm.runInContext('D', ctx), 'alert_kinds');
  assert.deepEqual(lines(ctx), ['feed', 'paused']);
  vm.runInContext('sizing = "dem"', ctx);
  assert.deepEqual(lines(ctx), ['paused']);
  assert.deepEqual(vm.runInContext('alertMinor().rows.length', ctx), 0);
  // A payload from before the second pass keeps the 24/7 list under Demand.
  vm.runInContext('delete D.alertsDemand', ctx);
  assert.deepEqual(lines(ctx), ['feed', 'paused']);
  // Today draws the list and the smaller findings of the sizing on screen.
  const data = {meta: {}, businesses: [], alerts: [finding('feed', 'feed', 9000)],
    minor: {gate: 500, rows: [finding('m', 'loss', 20, 'info')]},
    alertsDemand: {lines: [finding('paused', 'paused', 8000)], minor: {gate: 500, rows: []}}};
  assert.deepEqual(drawn(data).list, ['feed']);
  assert.match(drawn(data).minor, enRe('today.minor.below', {n: 1, gate: 500}));
  assert.deepEqual(drawn(data, {}, 'dem').list, ['paused']);
  assert.equal(drawn(data, {}, 'dem').minor, '');
  const map = fs.readFileSync(path.join(__dirname, '..', 'web', 'map.js'), 'utf8');
  assert.match(map, /\.\.\.alertLines\(\), \.\.\.\(alertMinor\(\)\.rows/);
});

/* R13: every supply kind lands on a Supply tab: the one named, or with tab
   "site" the tab of the site's own kind (a shop's Shops, a factory's
   Factories, every other site's Warehouses). */
test('the supply kinds land on the Supply view of their route', () => {
  const got = run('{ALERT_LINKS, SEC_PAGE, SEC_MOVED}'), links = got.ALERT_LINKS;
  const views = Object.fromEntries(Object.entries(links).filter(([, l]) => l.view).map(([id, l]) => [id, l.view]));
  assert.deepEqual(views, {shortfall: 'route', order: 'imports', paused: 'imports',
    outruns: 'deliveries', unplanned: 'deliveries', unsourced: 'route', dead: 'deliveries', target: 'deliveries', notrouted: 'deliveries',
    topup: 'deliveries', wholesale: 'deliveries',
    feed: 'production', staff: 'production', unnamed: 'production', unset: 'production'});
  const pages = got.SEC_PAGE;
  for (const l of Object.values(links)) if (l.view) assert.equal(pages[l.sec][0], 'supply');
  // The old sections open the view that took their place.
  assert.deepEqual([...pages.secShops], ['supply', 'deliveries']);
  assert.deepEqual([...pages.secWarehouses], ['supply', 'imports']);
  assert.deepEqual([...pages.secFactories], ['supply', 'production']);
  assert.deepEqual([...pages.secFlow], ['supply', 'flow']);
  const moved = got.SEC_MOVED;
  assert.deepEqual([moved.secLogistics, moved.secStock, moved.secShops, moved.secWarehouses, moved.secFactories],
    ['secImports', 'secDeliveries', 'secDeliveries', 'secImports', 'secProduction']);
});

/* Issue #100 Change C: a finding kind is one FINDING_KINDS record
   (docs/architecture.md, Registries, "A finding kind"), and the tables read
   here are derived from it. Every ALERT_GROUPS id needs an entry in each, so a
   record without its link or evidence fails here. */
const GROUP_IDS = run('ALERT_GROUPS').map(g => g.id);
/* The keys of a board-script table. */
const tableKeys = name => run(`Object.keys(${name})`);
/* The kinds a table may lack on purpose, each with its reason. */
const NO_EVIDENCE = {
  // A vacant lease has no business, so there is no site panel to light.
  vacant: 'no site panel',
};
/* ALERT_UNITS (Python) gives a unit only to the kinds whose worth is money;
   every other kind's worth is always None. A new kind goes in one list or
   the other, so the choice is made rather than forgotten. */
const NOT_MONEY = ['staff', 'satisfaction', 'promotion', 'uniform', 'bathroom', 'toiletprivacy',
  'sink', 'music', 'interior', 'jobdemand', 'companydemand', 'unplanned', 'unsourced', 'outruns', 'paused',
  'feed', 'unnamed', 'unset', 'shortfall', 'topup', 'wholesale', 'order', 'notrouted'];

const registryGaps = (name, keys, exempt = []) => {
  const missing = GROUP_IDS.filter(id => !keys.includes(id) && !exempt.includes(id));
  const stale = keys.filter(id => !GROUP_IDS.includes(id));
  assert.deepEqual(missing, [], `ALERT_GROUPS kinds with no ${name} entry: ${missing.join(', ')}`);
  assert.deepEqual(stale, [], `${name} entries for kinds ALERT_GROUPS does not list: ${stale.join(', ')}`);
  const gone = exempt.filter(id => !GROUP_IDS.includes(id));
  assert.deepEqual(gone, [], `exempt from ${name} but no longer an ALERT_GROUPS kind: ${gone.join(', ')}`);
};

test('every finding kind has an ALERT_LINKS entry, so a click lands somewhere', () => {
  const keys = tableKeys('ALERT_LINKS');
  registryGaps('ALERT_LINKS', keys);
});

test('every finding kind with a site panel has an ALERT_EVIDENCE entry', () => {
  const keys = tableKeys('ALERT_EVIDENCE');
  registryGaps('ALERT_EVIDENCE', keys, Object.keys(NO_EVIDENCE));
  for (const id of Object.keys(NO_EVIDENCE))
    assert.ok(!keys.includes(id), `${id} has an ALERT_EVIDENCE entry now: take it off NO_EVIDENCE`);
});

test('every finding kind has an ALERT_UNITS unit or is listed as carrying no money', () => {
  // The Python dict's keys, read by importing ba_dashboard.py.
  const out = spawnSync(process.env.PYTHON || 'python', ['-c',
    'import json, ba_dashboard; print(json.dumps(list(ba_dashboard.ALERT_UNITS)))'],
  {cwd: path.join(__dirname, '..'), encoding: 'utf8'});
  assert.equal(out.status, 0, out.stderr);
  const keys = JSON.parse(out.stdout);
  assert.ok(keys.length, 'no keys read out of ALERT_UNITS');
  registryGaps('ALERT_UNITS', keys, NOT_MONEY);
  const both = NOT_MONEY.filter(id => keys.includes(id));
  assert.deepEqual(both, [], `in ALERT_UNITS and NOT_MONEY at once: ${both.join(', ')}`);
});

/* NOT_MONEY checked against real extract() output: in the committed payload
   snapshots (tests/test_payload_snapshot.py), no finding of such a kind
   carries a worth, which is the amount ALERT_UNITS would give a unit to. */
test('in the payload snapshots, no NOT_MONEY finding carries a worth', () => {
  const dir = path.join(__dirname, 'fixtures', 'payload_snapshot');
  const rowsOf = list => (Array.isArray(list) ? list : (list && list.rows) || []);
  let seen = 0;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const rows = [...rowsOf(d.alerts), ...rowsOf(d.minor),
      ...rowsOf(d.alertsDemand && d.alertsDemand.lines), ...rowsOf(d.alertsDemand && d.alertsDemand.minor)];
    for (const r of rows.filter(r => NOT_MONEY.includes(r.group))) {
      seen++;
      assert.equal(r.worth, null, `${file}: a ${r.group} finding has worth ${r.worth}; it is money, so give it an ALERT_UNITS unit`);
    }
  }
  assert.ok(seen, 'the snapshots hold no NOT_MONEY finding to check');
});
