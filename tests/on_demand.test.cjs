// Run with: node --test tests/on_demand.test.cjs
// The board's sections computed on demand (#238, docs/architecture.md,
// "Sections"): a board from a source that computes sections arrives without
// them; what is on screen asks for one through odNeed(), once a board; the
// answer is merged into the English payload and localised into D, never taken
// in as a new board; an answer for an older board is dropped; and a write or a
// progress check never reads a section the board does not have yet.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {loadBoard, recordingDocument} = require('./_board.cjs');

const GEN = Symbol.for('bigcopilot.build');

/* A board whose LEDGER_SOURCE records what it is asked for and answers when
   the test says. `core` is the payload the build sent. */
function board(core = {}) {
  const asked = [];
  const source = {
    label: 'In browser',
    data: async () => null,
    watch() {},
    section(name, gen) {
      return new Promise((resolve, reject) => asked.push({name, gen, resolve, reject}));
    },
  };
  // Everything else on window answers as the harness's stub does: with itself.
  const inert = new Proxy(function(){}, {
    get: (_, k) => k === Symbol.toPrimitive ? () => 0 : k === Symbol.iterator ? function*(){} : k === 'length' ? 0 : inert,
    apply: () => inert, construct: () => inert, set: () => true,
  });
  const window = new Proxy({}, {get: (_, k) => k === 'LEDGER_SOURCE' ? source : inert[k]});
  const {document} = recordingDocument();
  // The redraw an arrival makes runs on the stub document and throws there;
  // the board logs and carries on, as it would on the page.
  const quiet = Object.assign(Object.create(console), {error() {}});
  const context = loadBoard({document, window, console: quiet});
  const take = (raw, gen) => {
    Object.defineProperty(raw, GEN, {value: gen});
    context.__raw = raw;
    vm.runInContext('takeData(__raw)', context);
  };
  take(Object.assign({meta: {day: 3}, names: {}, businesses: [], supply: {factories: {sites: []}},
    staffing: [], officeStaffing: [], plan: {}}, core), 5);
  const run = code => vm.runInContext(code, context);
  return {context, asked, take, run, source};
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('held planner and finder actions are dropped on another company or source', () => {
  for(const change of ['company', 'source']){
    const b = board({meta: {character: 'A', save: 'A', day: 3}});
    let source = 1;
    b.source.identity = () => source;
    b.take({meta: {character: 'A', save: 'A'}, names: {}, businesses: [],
      supply: {factories: {sites: []}}, staffing: [], officeStaffing: []}, 5);
    b.run(`osStart('shop', 'hood'); ofPreset({type: 'shop'});
      globalThis.ran = 0; odThen('premises', () => ran++, 'finder')`);
    assert.ok(b.run('odThens.length') >= 3);
    if(change === 'source') source++;
    b.take({meta: {character: change === 'company' ? 'B' : 'A', save: change === 'company' ? 'B' : 'A'},
      names: {}, businesses: [], supply: {factories: {sites: []}}, staffing: [], officeStaffing: []}, 6);
    const asked = b.asked.length;
    b.run('odThensAsk()');
    assert.equal(b.asked.length, asked, 'no requests for the previous selection');
    assert.equal(b.run('odThens.length'), 0);
    b.run(`D.premises = {}; D.openStore = {}; D.openFactory = {}; D.factoryStaffing = {}; D.hiring = {}; D.candidates = []; odArrived()`);
    assert.equal(b.run('ran'), 0);
    assert.equal(b.run('osCur'), null);
    assert.equal(b.run('ofCur'), null);
  }
});

test('a held action on an old board after source selection changes cannot belong to the new source', () => {
  const b = board();
  b.source.identity = () => 2; // source changed, its board has not arrived yet
  b.run(`globalThis.ran = 0; odThen('premises', () => ran++)`);
  assert.equal(b.run('odThens.length'), 0);
  assert.equal(b.asked.length, 0);
  b.take({meta: {day: 4}, names: {}, businesses: [], supply: {factories: {sites: []}}, premises: {}}, 6);
  b.run('odArrived()');
  assert.equal(b.run('ran'), 0);
});

test('a retained row keeps waiting only on its own company, and failure draws the error', () => {
  const b = board({meta: {character: 'A', save: 'A'}, products: []});
  b.run(`globalThis.row = PAGE_DRAWS.find(r => r[0] === 'company/products' && r[3].length); odRowDrawn(row)`);
  const core = who => ({meta: {character: who, save: who}, names: {}, businesses: [], supply: {factories: {sites: []}}});
  b.take(core('A'), 6);
  assert.equal(b.run(`odKeepRow(row, 'company/products')`), true);
  assert.equal(b.run('pageStale.has(row)'), true);
  b.run(`odAsked.set('products', {gen: 6, state: 'error', error: 'boom'})`);
  assert.equal(b.run(`odKeepRow(row, 'company/products')`), false);
  b.take(core('B'), 7);
  assert.equal(b.run(`odKeepRow(row, 'company/products')`), false);
});

test('the Schedules search site comes from current staffing, never an old card', () => {
  const b = board({staffing: [{key: 'new', name: 'New shop', demandDataComplete: true}]});
  b.run(`$('optimizeStaffingCard').dataset = {site: 'old'}`);
  assert.equal(b.run('ssStaffingSite()'), 'new');
  b.run('delete D.staffing');
  assert.equal(b.run('ssStaffingSite()'), '');
  assert.equal(b.asked.length, 0);
});

test('a section is asked for once a board, with its generation, and not by a hidden draw', () => {
  const b = board();
  assert.equal(b.run('odReady("hiring")'), false);
  b.run('odHidden = true');
  assert.equal(b.run('odNeed("hiring")'), false);
  assert.equal(b.asked.length, 0, 'a view not on screen asks for nothing');
  assert.equal(b.run('odWanted'), true, 'and its row is left to draw again when it opens');
  b.run('odHidden = false');
  assert.equal(b.run('odNeed("hiring")'), false);
  assert.equal(b.run('odNeed("hiring")'), false);
  assert.deepEqual(b.asked.map(a => [a.name, a.gen]), [['hiring', 5]]);
  // Hiring needs the factory staffing: both are being worked out.
  assert.equal(b.run('odState("hiring")'), 'loading');
  assert.equal(b.run('odState("factoryStaffing")'), 'loading');
  assert.match(b.run('odWaitHtml("hiring")'), /class="od-wait" role="status"/);
});

test('an arriving section is merged into the English payload and the board, not taken as a new board', async () => {
  const b = board();
  const seq = b.run('boardSeq');
  b.run('odNeed("hiring")');
  b.asked[0].resolve({generation: 5, sections: {
    factoryStaffing: {factoryStaffing: {cap: [], dem: []}},
    hiring: {hiring: {sites: [], people: {}}, candidates: [{id: 'c1'}]},
  }});
  await tick();
  assert.equal(b.run('odReady("hiring")'), true);
  assert.equal(b.run('odReady("factoryStaffing")'), true);
  assert.equal(b.run('D.candidates[0].id'), 'c1');
  assert.equal(b.run('D[GN_SRC].candidates[0].id'), 'c1', 'kept in the English payload');
  assert.notEqual(b.run('D.candidates'), b.run('D[GN_SRC].candidates'), 'D holds a localised copy');
  assert.equal(b.run('boardSeq'), seq, 'no new board');
  // A language switch localises from the English payload: the section stays.
  assert.equal(b.run('localiseNames(D).hiring.sites.length'), 0);
  assert.equal(b.run('odNeed("hiring")'), true);
  assert.equal(b.asked.length, 1);
});

test('an answer for an older board is dropped, and the newer board asks again', async () => {
  const b = board();
  b.run('odNeed("factoryStaffing")');
  b.take({meta: {day: 4}, names: {}, businesses: [], supply: {factories: {sites: []}}, staffing: [], officeStaffing: []}, 6);
  b.asked[0].resolve({generation: 5, sections: {factoryStaffing: {factoryStaffing: {cap: [{key: 'old'}], dem: []}}}});
  await tick();
  assert.equal(b.run('odReady("factoryStaffing")'), false, 'board 5\'s answer is not board 6\'s');
  assert.equal(b.run('odState("factoryStaffing")'), 'missing');
  b.run('odNeed("factoryStaffing")');
  assert.deepEqual(b.asked.map(a => a.gen), [5, 6]);
});

test('a section that fails says so, and Try again asks again', async () => {
  const b = board();
  b.run('odNeed("hiring")');
  b.asked[0].reject(new Error('the board hit a bug reading this save'));
  await tick();
  assert.equal(b.run('odState("hiring")'), 'error');
  assert.equal(b.run('odState("factoryStaffing")'), 'error');
  assert.match(b.run('odWaitHtml("hiring")'), /class="od-wait err" role="alert"[^]*the board hit a bug[^]*data-od-retry="hiring"/);
  assert.equal(b.run('odNeed("hiring")'), false);
  assert.equal(b.asked.length, 1, 'a failure is not asked again by itself');
  b.run('odRetry("hiring")');
  assert.equal(b.asked.length, 2);
  assert.equal(b.run('odState("hiring")'), 'loading');
});

test('a board with every section (the CLI page, the watch server) asks for nothing', () => {
  const b = board({factoryStaffing: {cap: [], dem: []}, hiring: {sites: []}, candidates: []});
  assert.equal(b.run('odNeed("hiring")'), true);
  assert.equal(b.run('odNeed("factoryStaffing")'), true);
  assert.equal(b.asked.length, 0);
});

test('a hire is judged only on a board that has worked out where everybody is', async () => {
  const b = board();
  const rec = {family: 'hire', state: 'applied', expect: {people: [{id: 'p1', site: 'ba:street_a#1'}]}};
  b.context.__rec = rec;
  assert.equal(b.run('PG_CHECK.hire(__rec)'), null, 'not Not confirmed: not judged yet');
  assert.deepEqual(b.asked.map(a => a.name), ['hiring']);
  b.asked[0].resolve({generation: 5, sections: {
    factoryStaffing: {factoryStaffing: {cap: [], dem: []}},
    hiring: {hiring: {sites: [], people: {p1: {site: 'ba:street_a#1'}}}, candidates: []},
  }});
  await tick();
  assert.equal(b.run('pgJudged'), b.run('boardSeq'), 'the arrival judged the checks again on this board');
  assert.equal(b.run('PG_CHECK.hire(__rec).state'), 'confirmed');
});

test('nobody at a factory is called spare before its staffing is worked out', () => {
  const factory = {key: 'ba:street_f#1', staffIdle: ['w1', 'w2']};
  const b = board({businesses: [factory], supply: {factories: {sites: [{s: 0, lines: []}]}}});
  assert.equal(b.run('spSpareIds(D.businesses[0]).length'), 0);
  assert.deepEqual(b.asked.map(a => a.name), [], 'a spare count is a pure read; the site draw asks');
});

test('a shop the game opens no hour is read off its own plan, not the Staff page', () => {
  const b = board();
  assert.equal(b.run('spNoHours({open: [[], [], [], [], [], [], []]})'), true);
  assert.equal(b.run('spNoHours({open: [[], [[9, 17]], [], [], [], [], []]})'), false);
  assert.equal(b.run('spNoHours({failed: true, open: []})'), false);
  assert.equal(b.run('spNoHours(null)'), false);
  assert.equal(b.asked.length, 0);
});

test('work held for a section runs when it arrives; a waiting write dialog hears arrivals and failures', async () => {
  const b = board();
  b.run('globalThis.ran = 0; odThen("hiring", () => { globalThis.ran++; })');
  b.run('globalThis.painted = 0; gwOpen = {open: true, _odWait: () => { globalThis.painted++; }}');
  assert.equal(b.run('ran'), 0);
  b.asked[0].reject(new Error('boom'));
  await tick();
  assert.equal(b.run('painted'), 1, 'the dialog paints the failure');
  b.run('gwOpen._odWait = () => { globalThis.painted++; }');
  b.run('odThen("hiring", () => { globalThis.ran++; })');
  b.run('odRetry("hiring")');
  assert.equal(b.run('painted'), 2, 'and paints the Try again');
  b.run('gwOpen._odWait = () => { globalThis.painted++; }');
  b.asked.at(-1).resolve({generation: 5, sections: {
    factoryStaffing: {factoryStaffing: {cap: [], dem: []}},
    hiring: {hiring: {sites: []}, candidates: []},
  }});
  await tick();
  assert.equal(b.run('ran'), 1, 'the work held before the failure was dropped; the one after it ran');
  assert.equal(b.run('painted'), 3, 'the dialog plans on arrival');
  b.run('gwOpen = null');
});

test('a stale refusal before the new board keeps the section loading and the held work, until the source fails', async () => {
  const b = board();
  b.run('globalThis.ran = 0; odThen("hiring", () => { globalThis.ran++; }, "k")');
  b.run('odThen("hiring", () => { globalThis.ran++; }, "k")');
  b.asked[0].reject(Object.assign(new Error('The save on screen has been read again since'), {stale: true}));
  await tick();
  assert.equal(b.run('odState("hiring")'), 'loading', 'not an error: the newer board asks again');
  assert.equal(b.run('odThens.length'), 1, 'held once, by its key');
  // The newer board arrives and asks again; the held work runs once.
  b.take({meta: {day: 4}, names: {}, businesses: [], supply: {factories: {sites: []}}, staffing: [], officeStaffing: []}, 6);
  b.run('odThensAsk()');
  assert.deepEqual(b.asked.map(a => a.gen), [5, 6]);
  b.asked[1].resolve({generation: 6, sections: {
    factoryStaffing: {factoryStaffing: {cap: [], dem: []}}, hiring: {hiring: {sites: []}, candidates: []}}});
  await tick();
  assert.equal(b.run('ran'), 1);
  // Had the newer build failed instead, the source says so and it is an error.
  const c = board();
  c.run('odNeed("hiring")');
  c.asked[0].reject(Object.assign(new Error('stale'), {stale: true}));
  await tick();
  c.run('markStale("Could not read the save")');
  assert.equal(c.run('odState("hiring")'), 'error');
  assert.match(c.run('odWaitHtml("hiring")'), /Could not read the save/);
});

test('after a read that failed, a section asked for is an error, and Try again stays one', async () => {
  // The worker answers `gone` (web/app.js rejects it without `stale`): no
  // newer board is coming to ask again.
  const b = board();
  b.run('markStale("Could not read the save")');
  b.run('odNeed("hiring")');
  b.asked[0].reject(new Error('The reader could not read the save again: Update to try once more'));
  await tick();
  assert.equal(b.run('odState("hiring")'), 'error');
  b.run('odRetry("hiring")');
  assert.equal(b.run('odState("hiring")'), 'loading');
  b.asked[1].reject(new Error('The reader could not read the save again: Update to try once more'));
  await tick();
  assert.equal(b.run('odState("hiring")'), 'error', 'not a spinner that never stops');
});

test('Staff needs without hiring says it is worked out, and closes the demand list it cannot draw', () => {
  const b = board();
  b.run('hrPop = {target: "", all: false}; hrUi.sheet = "ba:skill_cleaning"');
  b.run('drawStaffPage()');
  assert.equal(b.run('hrPop'), null, 'the demand list is closed');
  assert.match(b.run('$("secStaff").innerHTML'), /class="od-wait" role="status"/);
  assert.deepEqual(b.asked.map(a => a.name), ['hiring']);
  // Drawn again while hiring is still missing, the list stays shut.
  b.run('hrPop = {target: "", all: false}; hrPopDraw()');
  assert.equal(b.run('hrPop'), null);
});

test('every row and route declares sections; Today asks only for shop plans and Map none', () => {
  const b = board();
  const rows = JSON.parse(b.run('JSON.stringify(PAGE_DRAWS.filter(r => r[3]).map(r => [r[0], r[3]]))'));
  const known = Object.keys(JSON.parse(b.run('JSON.stringify(OD_SECTIONS)')));
  assert.ok(rows.length, 'some rows declare sections');
  rows.forEach(([view, names]) => names.forEach(n => assert.ok(known.includes(n), `${view} declares an unknown section ${n}`)));
  assert.deepEqual([...new Set(rows.filter(([view]) => view.split(' ').includes('today')).flatMap(([, n]) => n))], ['staffing']);
  assert.equal(b.run('PAGE_DRAWS.every(r => Array.isArray(r[3]))'), true);
  assert.equal(b.run('Object.values(ROUTES).every(r => Array.isArray(r.needs))'), true);
  assert.equal(b.run('JSON.stringify(ROUTES.map.needs)'), '[]');
  assert.equal(b.run('JSON.stringify(ROUTES["expansion/finder"].needs)'), '["premises"]');
  // Opening a view asks for what it declares.
  b.run('odWantView("staffing/needs")');
  assert.deepEqual(b.asked.map(a => a.name), ['hiring']);
});


test('new page-only draws wait without declaring missing data empty', () => {
  for(const [draw, key, host] of [['drawProducts', 'products', 'secProducts'],
    ['drawGoals', 'goals', 'secGoals'],
    ['drawOpenStore', 'openStore', 'osBody'], ['drawPlan', 'openFactory', 'ofBody']]){
    const b = board();
    b.run(`${draw}()`);
    assert.match(b.run(`$("${host}").innerHTML`), /od-wait/, draw);
    assert.ok(b.asked.some(a => a.name === key), draw);
  }
  const b = board();
  b.run('delete D.staffing; delete D.officeStaffing;');
  assert.match(b.run('spRosterBlock({key: "x"})'), /od-wait/);
  assert.match(b.run('spOfficeRoster({key: "x"})'), /od-wait/);
  assert.match(b.run('spSchedSummary({key: "x", status: "retail"})'), /od-wait/);
  assert.match(b.run('spSchedSummary({key: "x", status: "office"})'), /od-wait/);
  assert.deepEqual(b.asked.map(a => a.name), ['staffing', 'officeStaffing']);
});

test('a partly or unseen hire never requests hiring on its own, but rechecks if ready', () => {
  for(const state of ['partly', 'unseen']){
    const b = board();
    b.context.__rec = {state, expect: {people: []}};
    assert.equal(b.run('PG_CHECK.hire(__rec)'), null);
    assert.equal(b.run('pgPeopleSites()'), null);
    assert.equal(b.asked.length, 0);
    b.run('D.factoryStaffing = {cap: []}; D.hiring = {people: {}}; D.candidates = [];');
    assert.equal(b.run('PG_CHECK.hire(__rec).state'), 'confirmed');
    assert.equal(b.asked.length, 0);
  }
});

test('prefetch filters factory dependencies and shares the per-board request and generation checks', async () => {
  const b = board();
  b.run('globalThis.document = {hidden: false}');
  const sections = view => JSON.parse(b.run(`JSON.stringify(odPrefetchSections("${view}"))`));
  assert.deepEqual(sections('staffing/needs'), ['staffing', 'officeStaffing']);
  assert.deepEqual(sections('staffing/schedules'), ['staffing', 'officeStaffing']);
  assert.deepEqual(sections('supply/production'), ['staffing', 'officeStaffing']);
  assert.deepEqual(sections('expansion/factory'), ['openFactory', 'openStore']);
  assert.deepEqual(sections('expansion/finder'), ['premises']);
  assert.deepEqual(sections('map'), []);
  b.run('document.hidden = true; odPrefetch("expansion/open")');
  assert.equal(b.asked.length, 0);
  b.run('document.hidden = false; odHidden = true; odPrefetch("expansion/open")');
  assert.equal(b.asked.length, 0, 'prefetch never acts as a hidden draw');
  b.run('odHidden = false; odPrefetch("expansion/open"); odPrefetch("expansion/open"); odNeed("openStore")');
  assert.deepEqual(b.asked.map(a => [a.name, a.gen]), [['openStore', 5]]);
  b.take({meta: {day: 4}, businesses: []}, 6);
  b.run('odPrefetch("expansion/open")');
  b.asked[0].resolve({generation: 5, sections: {openStore: {openStore: {old: true}}, premises: {premises: {}}}});
  await tick();
  assert.equal(b.run('odReady("openStore")'), false);
  assert.deepEqual(b.asked.map(a => a.gen), [5, 6]);
});

test('Staffing intent prefetches light planning stages without factory staffing or hiring', () => {
  const b = board();
  b.run('delete D.staffing; delete D.officeStaffing; globalThis.document = {hidden: false}; odPrefetch("staffing/schedules"); odPrefetch("staffing/needs")');
  assert.deepEqual(b.asked.map(a => a.name), ['staffing', 'officeStaffing']);
});

test('factory planning waits for location and financing before loading or saving its step', () => {
  for(const core of [{}, {openFactory: {}, premises: {buildings: []}}]){
    const b = board(core);
    b.run(`ofStep = "investment"; globalThis.__saved = 0;
      globalThis.localStorage = {setItem(){ __saved++; }};
      ofDraw(); ofSave()`);
    assert.equal(b.run('ofStep'), 'investment');
    assert.equal(b.run('__saved'), 0);
    assert.match(b.run('$("ofBody").innerHTML'), /od-wait/);
    assert.ok(b.asked.some(a => a.name === 'openStore'));
    assert.equal(b.run('JSON.stringify(ROUTES["expansion/factory"].needs)'), '["openFactory","openStore"]');
  }
});

test('an opened store staff check waits for shop plans before judging spare people', () => {
  const b = board({factoryStaffing: {}, hiring: {}, candidates: []});
  b.run('delete D.staffing; globalThis.__read = 0; hrMemoModel = () => { __read++; throw new Error("must wait"); }');
  const row = b.run('osCkStaff({key: "shop"}, {key: "shop", staff: 2, stationShifts: 0})');
  assert.match(row.act, /od-wait/);
  assert.doesNotMatch(row.sub, /no hours scheduled|of .*people/);
  assert.equal(b.run('__read'), 0);
  assert.deepEqual(b.asked.map(a => a.name), ['staffing']);
});

test('Today office schedule target is independent of deferred office plans', () => {
  const b = board();
  b.run('delete D.officeStaffing');
  const before = b.run('nxStaffInto({key: "office", status: "office"})');
  b.run('D.officeStaffing = [{key: "office", shifts: [{h: 8}]}]');
  assert.equal(b.run('nxStaffInto({key: "office", status: "office"})'), before);
  assert.equal(before, '#sitePanel .sp-acts');
  assert.equal(b.asked.length, 0);
});

test('search and the expansion question enter the on-demand finder with their presets', () => {
  const b = board({market: {hoods: ['hood'], types: [{slug: 'shop', type: 'Shop', cells: [{demand: 30}]}], offices: []}});
  b.run('globalThis.__route = null; openRoute = (id, o) => { __route = {id, o}; odNeed("premises"); }');
  b.run('SS_VIEWS.find(v => v.id === "finder").go()');
  assert.equal(b.run('__route.id'), 'expansion/finder');
  b.run('SS_QUESTIONS.find(v => v.id === "open").go()');
  assert.equal(b.run('__route.id'), 'expansion/finder');
  b.run('ssFinder({cat: "office", type: "law", hoods: ["hood"]})');
  assert.equal(b.run('JSON.stringify(__route.o.preset)'), '{"cat":"office","type":"law","hoods":["hood"]}');
  assert.deepEqual(b.asked.map(a => a.name), ['premises']);
});

test('navigation intent maps route links and area tabs to their declared prefetch', () => {
  const b = board();
  b.run('globalThis.document = {hidden: false}');
  b.context.__event = {target: {closest: () => ({dataset: {route: 'businesses/prices'}})}};
  b.run('odNavIntent(__event); odNavIntent(__event)');
  assert.deepEqual(b.asked.map(a => a.name), ['products']);
  b.context.__event = {target: {closest: () => ({dataset: {id: 'expansion'}})}};
  b.run('areaLast.expansion = "open"; odNavIntent(__event)');
  assert.deepEqual(b.asked.map(a => a.name), ['products', 'openStore']);
  b.context.__event = {target: {closest: () => ({dataset: {}, getAttribute: () => '#wiki/businesstypes-giftshop'})}};
  b.run('odNavIntent(__event)');
  assert.deepEqual(b.asked.map(a => a.name), ['products', 'openStore']);
});


test('a Demand cell can open the finder from core market data without asking for premises', () => {
  const b = board({market: {hoods: ['hood'], types: [
    {slug: 'ba:businesstype_cinema', cells: [{demand: 50}]},
    {slug: 'ba:businesstype_theater', cells: [{demand: 40}]},
    {slug: 'shop', cells: [{demand: 30}]},
    {slug: 'missing', cells: [null]}], offices: [{slug: 'law', cells: [{demand: 20}]}]}});
  assert.equal(b.run('finderPreset("ba:businesstype_cinema", "hood").cat'), 'cinema');
  assert.equal(b.run('finderPreset("ba:businesstype_theater", "hood").cat'), 'theater');
  assert.equal(b.run('finderPreset("shop", "hood").cat'), 'retail');
  assert.equal(b.run('finderPreset("law", "hood").cat'), 'office');
  assert.equal(b.run('finderPreset("missing", "hood")'), null);
  assert.equal(b.asked.length, 0);
});

test('Today fixed costs and Payroll use core staff without a section request', () => {
  const b = board({staff: {total: 2, dailyCost: 700, roles: [], unhappy: 0, absent: 0, complaining: 0},
    kpi: {netWorth: null, rentBill: 300, debt: 0, profitAvg7: 0, profitPrev7: 0}, daily: [], loans: []});
  b.run('drawKpis(); drawPayroll()');
  assert.match(b.run('$("kpis").innerHTML'), /\$1,000/);
  assert.doesNotMatch(b.run('$("kpis").innerHTML'), /Working out payroll/);
  assert.doesNotMatch(b.run('$("secPayroll").innerHTML'), /od-wait/);
  assert.equal(b.run('JSON.stringify(ROUTES["staffing/payroll"].needs)'), '[]');
  assert.equal(b.run('JSON.stringify(PAGE_DRAWS.find(r => r[0] === "staffing/payroll")[3])'), '[]');
  assert.equal(b.asked.length, 0);
});

test('Today and shell supply readers use core recipes without a section request', () => {
  const b = board({businesses: [{key: 'factory', lines: []}], supply: {factories: {sites: [
    {s: 0, lines: [], needs: [], unnamed: [{rid: 'r1', candidates: [{slug: 'beer'}], machines: 1}]}]}},
    plan: {items: {beer: 'Core Beer'}, recipes: [{slug: 'beer', item: 'Beer', out: 10, ingredients: []}]}});
  b.run('localNames = () => ({r1: "beer"}); globalThis.__painted = null; paintPlanImports = s => { __painted = s; }; drawSupplyStrip()');
  assert.equal(b.run('factoryView().unnamed'), 0, 'the core resolves the named factory line immediately');
  assert.equal(b.run('itemName("beer")'), 'Core Beer', 'plan labels take precedence');
  assert.ok(b.run('__painted.badge.length > 0'), 'Today has a supply verdict on the first board');
  assert.equal(b.run('Number.isFinite(routeCount("supply/changes"))'), true);
  assert.equal(b.run('Number.isFinite(routeCount("supply/production"))'), true);
  b.run('SS_VIEWS.find(r => r.id === "checklist").live(); pgStateAt("factory", "beer"); ovPlanHtml({ev: {slug: "beer"}, group: "staff"}, D.businesses[0])');
  assert.equal(b.run('"plan" in OD_SECTIONS'), false);
  assert.equal(b.run('Object.values(ROUTES).every(r => !r.needs.includes("plan"))'), true);
  assert.equal(b.asked.length, 0);
});

test('Demand popover asks for store facts and redraws the still-open cell on arrival', async () => {
  const b = board({market: {hoods: ['hood'], types: [{slug: 'shop', cells: [{demand: 30}]}]}});
  b.run(`demPop = {contains(){ return false; }, setAttribute(){}, querySelector(){ return null; }, focus(){}};
    demPopPlace = () => {}; hideTip = () => {};
    globalThis.__cell = {isConnected: true, dataset: {slug: "shop", hood: "hood"}, setAttribute(){}};
    demCellPop(__cell)`);
  assert.doesNotMatch(b.run('demPop.innerHTML'), /data-dem-go="open"/);
  assert.match(b.run('demPop.innerHTML'), /data-dem-go="find"/);
  assert.deepEqual(b.asked.map(a => a.name), ['openStore']);
  assert.match(b.run('demPop.innerHTML'), /od-wait/);
  assert.match(b.run('demPop.innerHTML'), /To rent<\/span><b>—/);
  b.asked[0].resolve({sections: {openStore: {openStore: {types: {shop: {}}}},
    premises: {premises: {demand: {hood: [{slug: 'shop', category: 'retail'}]}, buildings: []}}}});
  await tick();
  assert.match(b.run('demPop.innerHTML'), /data-dem-go="open"/);
  assert.doesNotMatch(b.run('demPop.innerHTML'), /od-wait/);
  assert.match(b.run('demPop.innerHTML'), /To rent<\/span><b>0/);
});

test('a closed Demand popover stays closed when store facts arrive', async () => {
  const b = board({market: {hoods: ['hood'], types: [{slug: 'shop', cells: [{demand: 30}]}]}});
  b.run(`demPop = {contains(){ return false; }, setAttribute(){}, querySelector(){ return null; }, focus(){}};
    demPopPlace = () => {}; hideTip = () => {};
    globalThis.__cell = {isConnected: true, dataset: {slug: "shop", hood: "hood"}, setAttribute(){}};
    demCellPop(__cell); demPopClose(false)`);
  b.asked[0].resolve({sections: {openStore: {openStore: {types: {shop: {}}}}, premises: {premises: {buildings: []}}}});
  await tick();
  assert.equal(b.run('demPop.hidden'), true);
});
