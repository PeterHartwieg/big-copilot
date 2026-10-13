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
const fs = require('node:fs');
const path = require('node:path');
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
    section(name, gen, have) {
      return new Promise((resolve, reject) => asked.push({name, gen, have: have && [...have], resolve, reject}));
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

/* Real finder filtering/restoration with only the map's drawing and camera
   stubbed. The current retail question differs from the warehouse visit. */
function finderBoard(){
  const b = board({meta: {character: 'A', save: 'A', day: 3}});
  const stored = new Map();
  b.context.localStorage = {getItem: key => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value)};
  b.context.location = {hash: '#expansion/finder', href: 'https://example.test/#expansion/finder'};
  b.context.history = {state: {nxFs: {cat: 'warehouse', minM2: 1000}, nxPick: 'warehouse'},
    replaceState(state){ this.state = state; }};
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'web/map.js'), 'utf8'), b.context);
  b.run(`renderCalm = () => {}; drawFinderCtx = () => {};
    page = 'map'; route = 'expansion/finder';
    cityMapPage = Object.assign(Object.create(CityMapView.prototype), {
      panel: true, fs: {...finderDefaults(), on: true}, selected: 'retail',
      assets: {byKey: new Map()}, ready: Promise.resolve(true),
      update(){}, select(key){ this.selected = key; finderPickRemember(this); },
      deselect(){ this.selected = null; finderPickRemember(this); }
    });`);
  return {...b, stored};
}
const finderPremises = {buildings: [
  {key: 'warehouse', type: 'warehouse', status: 'vacant', m2: 1500, cap: 0, traffic: 30},
  {key: 'retail', type: 'retail', status: 'vacant', m2: 100, cap: 30, traffic: 50},
], demand: {}};

async function failFinder(b, newerBuild){
  b.asked[0].reject(Object.assign(new Error('premises failed'), newerBuild ? {stale: true} : {}));
  await tick();
  if(newerBuild) b.run('odSourceFailed("newer build failed")');
  assert.equal(b.run('odState("premises")'), 'error');
}

for(const newerBuild of [false, true]){
  const failure = newerBuild ? 'a failed newer build' : 'a failed premises request';
  for(const recovery of ['Try again', 'Update']){
    test(`finder history question and pick survive ${failure} followed by ${recovery}`, async () => {
      const b = finderBoard();
      b.run('finderPickRestore(cityMapPage, true, finderEntryState())');
      await failFinder(b, newerBuild);
      assert.equal(b.run('cityMapPage.fs.cat'), 'retail', 'waits before restoring');
      // A redraw can write the latest question into history; restoration must
      // still use the question and pick captured on arrival at this visit.
      b.context.history.state = {nxFs: {cat: 'retail', minM2: 0}, nxPick: 'retail'};
      if(recovery === 'Update'){
        b.take({meta: {character: 'A', save: 'A', day: 4}, names: {}, businesses: [],
          supply: {factories: {sites: []}}}, 6);
        b.run('odThensAsk()');
      }else b.run('odRetry("premises")');
      b.asked.at(-1).resolve({sections: {premises: {premises: finderPremises}}});
      await tick();
      assert.equal(b.run('cityMapPage.fs.cat'), 'warehouse');
      assert.equal(b.run('cityMapPage.fs.minM2'), 1000);
      assert.equal(b.run('cityMapPage.selected'), 'warehouse');
      assert.equal(b.context.history.state.nxPick, 'warehouse');
      assert.equal(b.run('odThens.length'), 0, 'restored once');
    });
  }

  test(`finder restoration after ${failure} is cancelled when its visit ends`, async () => {
    const b = finderBoard();
    b.run('finderPickRestore(cityMapPage, true, finderEntryState())');
    await failFinder(b, newerBuild);
    b.run(`drawStale = () => {}; paintShell = () => {}; wireReveal = () => {}; siteShut = () => {};
      showPage('today', false, 'none');
      page = 'map'; route = 'expansion/finder';`);
    assert.equal(b.run('cityMapPage.finderRestore'), null, 'leaving ends the visit even at the same hash');
    b.run('odRetry("premises")');
    b.asked.at(-1).resolve({sections: {premises: {premises: finderPremises}}});
    await tick();
    assert.equal(b.run('cityMapPage.fs.cat'), 'retail');
    assert.equal(b.run('cityMapPage.fs.minM2'), 0);
    assert.equal(b.run('cityMapPage.selected'), 'retail');
    assert.equal(b.run('odThens.length'), 0);
  });

  test(`cold finder preset persistence survives ${failure} and retry`, async () => {
    const b = finderBoard();
    b.run(`cityMapPage.fs = {...finderDefaults(), on: true, cat: 'warehouse', minM2: 1000};
      cityMapPage.selected = null; finderPickRestore(cityMapPage, false)`);
    await failFinder(b, newerBuild);
    assert.equal(b.stored.size, 0, 'no persistence before premises arrives');
    b.run('odRetry("premises")');
    b.asked.at(-1).resolve({sections: {premises: {premises: finderPremises}}});
    await tick();
    const filters = JSON.parse(b.stored.get('ba_finder_v1:A'));
    assert.equal(filters.cat, 'warehouse');
    assert.equal(filters.minM2, 1000);
  });
}

test('finder restoration retained after failure is cancelled by a company or source change', async () => {
  for(const change of ['company', 'source']){
    const b = finderBoard();
    let source = 1;
    b.source.identity = () => source;
    b.run('odBoard(D); finderPickRestore(cityMapPage, true, finderEntryState())');
    await failFinder(b, false);
    if(change === 'source') source++;
    const who = change === 'company' ? 'B' : 'A';
    b.take({meta: {character: who, save: who}, names: {}, businesses: [],
      supply: {factories: {sites: []}}}, 6);
    assert.equal(b.run('odThens.length'), 0);
    b.run('odRetry("premises")');
    b.asked.at(-1).resolve({sections: {premises: {premises: finderPremises}}});
    await tick();
    assert.equal(b.run('cityMapPage.fs.cat'), 'retail');
    assert.equal(b.run('cityMapPage.selected'), 'retail');
  }
});

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

test('a section asked for lists what the board holds of its chain, and a new board holds none (#327)', async () => {
  // The core here carries staffing and office staffing, as a prefetch would
  // have left them: asking for hiring says so, and the reply that leaves
  // them out still makes hiring ready.
  const b = board();
  b.run('odNeed("hiring")');
  assert.deepEqual(b.asked[0].have, ['staffing', 'officeStaffing']);
  b.asked[0].resolve({generation: 5, sections: {
    factoryStaffing: {factoryStaffing: {cap: [], dem: []}},
    hiring: {hiring: {sites: [], people: {}}, candidates: []},
  }});
  await tick();
  assert.equal(b.run('odReady("hiring")'), true);
  assert.equal(b.run('D.staffing.length'), 0, 'the held section is kept');
  b.run('odNeed("premises")');
  assert.deepEqual(b.asked[1].have, []);
  b.asked[1].resolve({generation: 5, sections: {premises: {premises: {}}}});
  await tick();
  // A language switch localises from the English payload, which keeps what
  // the board holds, so it is still listed.
  b.run('D = localiseNames(D)');
  b.run('odNeed("openStore")');
  assert.deepEqual(b.asked[2].have, ['premises']);
  b.asked[2].resolve({generation: 5, sections: {openStore: {openStore: {}}}});
  await tick();
  assert.equal(b.run('odReady("openStore")'), true);
  // A new board (another save, a live refresh, a worker restart) holds
  // nothing of the old one's sections: it lists none it does not hold.
  b.take({meta: {day: 4}, names: {}, businesses: [], supply: {factories: {sites: []}}}, 6);
  b.run('odNeed("hiring")');
  b.run('odNeed("openStore")');
  assert.deepEqual(b.asked.slice(3).map(a => [a.name, a.gen, a.have]), [['hiring', 6, []], ['openStore', 6, []]]);
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
  b.run('globalThis.painted = 0; gwOpen = {open: true}; gwState(gwOpen).odWait = () => { globalThis.painted++; }');
  assert.equal(b.run('ran'), 0);
  b.asked[0].reject(new Error('boom'));
  await tick();
  assert.equal(b.run('painted'), 1, 'the dialog paints the failure');
  b.run('gwOpenState().odWait = () => { globalThis.painted++; }');
  b.run('odThen("hiring", () => { globalThis.ran++; })');
  b.run('odRetry("hiring")');
  assert.equal(b.run('painted'), 2, 'and paints the Try again');
  b.run('gwOpenState().odWait = () => { globalThis.painted++; }');
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
    ['drawGoals', 'goals', 'secGoals'], ['drawEstate', 'realEstate', 'secEstate'], ['drawEstateBuy', 'realEstate', 'secBuy'],
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
  // The second request counts on the first, still on its way (#474).
  assert.deepEqual(b.asked.map(a => a.have), [[], ['staffing']]);
});

/* Sections of one chain, keyed as SECTIONS keys them, for a reply that sends
   what was asked less what it lists in `have` (browser_section()). */
const STAFF_CHAIN = {
  staffing: {staffing: []},
  officeStaffing: {officeStaffing: []},
  factoryStaffing: {factoryStaffing: {cap: [], dem: []}},
  hiring: {hiring: {sites: [], people: {}}, candidates: []},
};
const chainReply = (b, a) => {
  const chain = JSON.parse(b.run(`JSON.stringify(odChain(${JSON.stringify(a.name)}))`));
  return {generation: a.gen, sections: Object.fromEntries(chain.filter(n => !a.have.includes(n)).map(n => [n, STAFF_CHAIN[n]]))};
};
function schedulesBoard(){
  const b = board();
  b.take({meta: {day: 4}, names: {}, businesses: [], supply: {factories: {sites: []}}}, 6);
  b.run('drawSchedules()');
  return b;
}

test('one Schedules draw after a new build sends each section once (#474)', async () => {
  const b = schedulesBoard();
  assert.deepEqual(b.asked.map(a => [a.name, a.gen, a.have]), [
    ['staffing', 6, []],
    ['officeStaffing', 6, ['staffing']],
    ['hiring', 6, ['staffing', 'officeStaffing']],
  ]);
  const sent = b.asked.flatMap(a => Object.keys(chainReply(b, a).sections));
  assert.deepEqual(sent, ['staffing', 'officeStaffing', 'factoryStaffing', 'hiring'], 'each section once');
  for(const a of b.asked){ a.resolve(chainReply(b, a)); await tick(); }
  for(const n of Object.keys(STAFF_CHAIN)) assert.equal(b.run(`odState("${n}")`), 'ready', n);
  b.run('drawSchedules()');
  assert.equal(b.asked.length, 3, 'nothing asked again');
});

test('an in-flight section that fails is offered again with what counted on it (#474)', async () => {
  const b = schedulesBoard();
  for(const a of [...b.asked]){ a.reject(new Error('staffing failed')); await tick(); }
  for(const n of Object.keys(STAFF_CHAIN)) assert.equal(b.run(`odState("${n}")`), 'error', n);
  b.run('odRetry("hiring")');
  const retry = b.asked.at(-1);
  assert.deepEqual([retry.name, retry.gen, retry.have], ['hiring', 6, []], 'the whole chain again');
  retry.resolve(chainReply(b, retry));
  await tick();
  for(const n of Object.keys(STAFF_CHAIN)) assert.equal(b.run(`odState("${n}")`), 'ready', n);
});

test('a later request answered after an earlier one failed leaves the failure to retry (#474)', async () => {
  const b = schedulesBoard();
  b.asked[0].reject(new Error('staffing failed'));
  await tick();
  b.asked[1].resolve(chainReply(b, b.asked[1]));
  await tick();
  b.asked[2].resolve(chainReply(b, b.asked[2]));
  await tick();
  assert.equal(b.run('odState("staffing")'), 'error');
  assert.equal(b.run('odReady("hiring")'), false);
  assert.equal(b.run('odError("hiring")'), true, 'Try again is offered where hiring is drawn');
  b.run('odRetry("hiring")');
  const retry = b.asked.at(-1);
  assert.equal(retry.have.includes('staffing'), false, 'the failed section comes with the retry');
  retry.resolve(chainReply(b, retry));
  await tick();
  assert.equal(b.run('odReady("hiring")'), true);
});

test('work held on a later section is dropped when an earlier one in its chain fails (#474)', async () => {
  const b = schedulesBoard();
  b.run(`globalThis.ran = 0; globalThis.kept = 0;
    odThen("hiring", () => ran++);
    odThen("hiring", () => kept++, "keep", true)`);
  b.asked[0].reject(new Error('staffing failed'));
  await tick();
  b.asked[1].resolve(chainReply(b, b.asked[1]));
  await tick();
  b.asked[2].resolve(chainReply(b, b.asked[2]));
  await tick();
  assert.deepEqual(JSON.parse(b.run('JSON.stringify(odThens.map(t => t.key))')), ['keep'],
    'only the work that keeps through errors is still held');
  b.run('odRetry("hiring")');
  const retry = b.asked.at(-1);
  retry.resolve(chainReply(b, retry));
  await tick();
  assert.equal(b.run('odReady("hiring")'), true);
  assert.equal(b.run('ran'), 0);
  assert.equal(b.run('kept'), 1);
});

test('a reply that leaves out what it alone was bringing makes that an error, not a wait (#474)', async () => {
  const b = schedulesBoard();
  // Said in the reader's language, as every message on the board is.
  b.run('ttLang = "de"; ttTable = {"nav.od.notSent": "DE-not-sent"}');
  b.asked[0].resolve({generation: 6, sections: {}});
  await tick();
  assert.equal(b.run('odState("staffing")'), 'error');
  assert.equal(b.run('odAsked.get("staffing").error'), 'DE-not-sent');
  assert.match(b.run('odWaitHtml("staffing")'), /DE-not-sent/);
  assert.equal(b.run('odError("hiring")'), true, 'what counted on it says so where it is drawn');
});

test('a stale-refused section is not counted on, and a new build starts afresh (#474)', async () => {
  const b = schedulesBoard();
  b.asked[0].reject(Object.assign(new Error('newer build'), {stale: true}));
  await tick();
  assert.equal(b.run('odInFlight("staffing", 6)'), false);
  b.take({meta: {day: 5}, names: {}, businesses: [], supply: {factories: {sites: []}}}, 7);
  const before = b.asked.length;
  b.run('drawSchedules()');
  assert.deepEqual(b.asked.slice(before).map(a => [a.name, a.gen, a.have]), [
    ['staffing', 7, []],
    ['officeStaffing', 7, ['staffing']],
    ['hiring', 7, ['staffing', 'officeStaffing']],
  ]);
  // Board 6's late answer is dropped.
  b.asked[1].resolve(chainReply(b, b.asked[1]));
  await tick();
  assert.equal(b.run('odReady("officeStaffing")'), false);
  assert.equal(b.run('odState("officeStaffing")'), 'loading', 'board 7 still waits for its own');
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
    demUi = {open(){ demPop.hidden = false; }, close(){ demPop.hidden = true; }, isOpen: () => !demPop.hidden};
    demPopPlace = () => {}; hideTip = () => {};
    globalThis.__cell = {isConnected: true, dataset: {slug: "shop", hood: "hood"}, setAttribute(){}};
    demCellPop(__cell)`);
  assert.doesNotMatch(b.run('demPop.innerHTML'), /data-dem-go="open"/);
  assert.match(b.run('demPop.innerHTML'), /data-dem-go="find"/);
  assert.deepEqual(b.asked.map(a => a.name), ['openStore']);
  assert.match(b.run('demPop.innerHTML'), /od-wait/);
  assert.match(b.run('demPop.innerHTML'), /Available<\/span><b>—/);
  b.asked[0].resolve({sections: {openStore: {openStore: {types: {shop: {}}}},
    premises: {premises: {demand: {hood: [{slug: 'shop', category: 'retail'}]}, buildings: [
      {hood: 'hood', type: 'retail', status: 'mine', occupant: null},
      {hood: 'hood', type: 'retail', status: 'mine', occupant: {typeSlug: 'shop'}},
    ]}}}});
  await tick();
  assert.match(b.run('demPop.innerHTML'), /data-dem-go="open"/);
  assert.doesNotMatch(b.run('demPop.innerHTML'), /od-wait/);
  assert.match(b.run('demPop.innerHTML'), /Available<\/span><b>1/);
});

test('a closed Demand popover stays closed when store facts arrive', async () => {
  const b = board({market: {hoods: ['hood'], types: [{slug: 'shop', cells: [{demand: 30}]}]}});
  b.run(`demPop = {contains(){ return false; }, setAttribute(){}, querySelector(){ return null; }, focus(){}};
    demUi = {open(){ demPop.hidden = false; }, close(){ demPop.hidden = true; }, isOpen: () => !demPop.hidden};
    demPopPlace = () => {}; hideTip = () => {};
    globalThis.__cell = {isConnected: true, dataset: {slug: "shop", hood: "hood"}, setAttribute(){}};
    demCellPop(__cell); demPopClose(false)`);
  b.asked[0].resolve({sections: {openStore: {openStore: {types: {shop: {}}}}, premises: {premises: {buildings: []}}}});
  await tick();
  assert.equal(b.run('demPop.hidden'), true);
});
