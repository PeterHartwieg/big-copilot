// The built page with sections computed on demand (#238): the board arrives
// with the core alone, Today asks only for shops, Staffing › Staff needs and
// Supply › Production ask for theirs and say so while they are worked out,
// and an answer for an older board is dropped. web/index.html and web/app.js
// as they ship, with a stub in place of the Pyodide worker that answers a
// build with the core of tests/save_fixtures.py's company and a section when
// the test lets it go. Install Playwright and its Chromium browser to run.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {en} = require('./_i18n.cjs');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
const PYTHON = process.env.PYTHON || 'python';
const ORIGIN = 'http://localhost:9323';
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml'};
const SECTION_KEYS = {staffing: ['staffing'], officeStaffing: ['officeStaffing'], factoryStaffing: ['factoryStaffing'],
  hiring: ['hiring', 'candidates'], premises: ['premises'], products: ['products'],
  openStore: ['openStore'], openFactory: ['openFactory'], goals: ['goals']};
const SECTION_NEEDS = {officeStaffing: ['staffing'], factoryStaffing: ['officeStaffing'], hiring: ['factoryStaffing'], openStore: ['premises']};

let browser, payload;
before(async () => {
  // The data company (a factory among its sites) with every section computed.
  const made = spawnSync(PYTHON, ['-c', `
import json, os, sys, tempfile
sys.path[:0] = ["tests", "."]
import ba_dashboard, save_fixtures
from ba_save import Names, load_save
path = os.path.join(tempfile.mkdtemp(), "payload.hsg")
save_fixtures.write_data_save(path, save_fixtures.DAY)
print(json.dumps(ba_dashboard.extract(load_save(path), Names(save_fixtures.data_names()), None)))
`], {cwd: root, maxBuffer: 64 * 1024 * 1024});
  assert.equal(made.status, 0, made.stderr?.toString());
  payload = JSON.parse(made.stdout.toString());
  assert.ok(payload.factoryStaffing.cap.length, 'the company has a factory to staff');
  assert.ok(payload.hiring.sites.length, 'and sites to hire for');
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

async function open(t, {hash = "", releaseShops = true, savedFactory = false, kept = null, pick = null} = {}) {
  const context = await browser.newContext({viewport: {width: 1280, height: 1000}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  await context.addInitScript(({payload, keys, needs, savedFactory, kept, pick}) => {
    if(kept) history.replaceState({nxFs: kept, ...(pick ? {nxPick: pick} : {})}, '', location.href);
    if(savedFactory){
      const building = payload.premises.buildings.find(b => b.type === 'warehouse');
      building.status = 'vacant';
      const saved = {current: 'saved-factory', plans: [{id: 'saved-factory', type: 'ba:businesstype_liquorstore',
        site: null, key: building.key, counts: {'ba:itemname_beer': 1}, size: 'custom', mode: 'self', depot: false,
        finance: {on: false, amount: null, bank: null}, step: 'investment'}]};
      window.factorySavedKey = `ba_open_factory_v1:${payload.meta.character}`;
      window.factorySavedText = JSON.stringify(saved);
      localStorage.setItem(window.factorySavedKey, window.factorySavedText);
    }
    // The worker: a build answers the core (every section's keys left out)
    // and keeps the generation; a section is held until the test lets it go.
    window.asked = [];
    window.held = [];
    window.Worker = class {
      postMessage(msg) {
        if (msg.kind === 'build') {
          // window.holdBuilds: the build is left unanswered, as a slow one is.
          if (window.holdBuilds) return;
          const core = Object.assign({}, payload);
          Object.values(keys).flat().forEach(k => delete core[k]);
          window.lastGen = msg.id;
          queueMicrotask(() => this.onmessage({data: {id: msg.id, gen: msg.id, kind: 'built', history: '{}', data: JSON.stringify(core)}}));
        } else if (msg.kind === 'section') {
          window.asked.push({name: msg.name, gen: msg.gen});
          // The worker has moved on to a build whose board was dropped.
          if (window.movedOn) return queueMicrotask(() => this.onmessage({data: {id: msg.id, kind: 'section', stale: true}}));
          const release = () => {
            if (msg.gen !== window.lastGen) return this.onmessage({data: {id: msg.id, kind: 'section', stale: true}});
            const chain = n => [...(needs[n] || []).flatMap(chain), n];
            const names = chain(msg.name);
            const sections = {};
            names.forEach(n => { sections[n] = {}; keys[n].forEach(k => { sections[n][k] = payload[k]; }); });
            this.onmessage({data: {id: msg.id, kind: 'section', data: JSON.stringify({generation: msg.gen, sections})}});
          };
          release.section = msg.name;
          window.held.push(release);
        }
      }
      terminate() {}
    };
    window.release = () => { const all = window.held.splice(0); all.forEach(f => f()); return all.length; };
    window.releaseSection = name => {
      const all = window.held.filter(f => f.section === name);
      window.held = window.held.filter(f => f.section !== name);
      all.forEach(f => f()); return all.length;
    };
  }, {payload, keys: SECTION_KEYS, needs: SECTION_NEEDS, savedFactory, kept, pick});
  await context.route('https://**', (route) => route.abort());
  await context.route(ORIGIN + '/**', (route) => {
    const file = path.join(web, decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || 'index.html');
    if (!file.startsWith(web) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({status: 404, body: ''});
    return route.fulfill({contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await page.goto(`${ORIGIN}/${hash}`);
  await read(page, 1);
  if(!hash){
    await page.waitForFunction(() => window.asked.some(a => a.name === "staffing"));
    if(releaseShops) await page.evaluate(() => window.release());
  }
  return page;
}
// A save chosen as one file: the board builds it.
async function read(page, n) {
  await page.evaluate((n) => {
    const input = document.getElementById('folderPick');
    const file = new File(['x'], 'Payload Co.hsg', {lastModified: Date.now() + n});
    Object.defineProperty(file, 'webkitRelativePath', {value: 'Saves/abc/Payload Co.hsg'});
    Object.defineProperty(input, 'files', {value: [file], configurable: true});
    input.dispatchEvent(new Event('change'));
  }, n);
  await page.waitForFunction(() => document.body.classList.contains('has-board'));
}
const asked = (page) => page.evaluate(() => window.asked.map(a => a.name));

// A live refresh from the same source, using the board's watch path drawers.
async function nextBoard(page, other = false){
  await page.evaluate(other => {
    const old = D;
    const core = {...D[GN_SRC], meta: {...D.meta, day: D.meta.day + 1}};
    Object.values(OD_SECTIONS).flatMap(s => s.keys).forEach(k => delete core[k]);
    if(other) core.meta.character += '-other';
    window.lastGen++;
    Object.defineProperty(core, Symbol.for('bigcopilot.build'), {value: window.lastGen});
    const same = sameCompany(old, core);
    takeData(core); renderCalm(same);
  }, other);
}

function finderHistoryQuestion(){
  const building = payload.premises.buildings.find(b => b.type === 'retail' && b.status === 'rival');
  assert.ok(building, 'the fixture has a rival retail building to pick');
  const demand = payload.premises.demand[building.hood].find(d => d.category === 'retail');
  return {pick: building.key, kept: {cat: 'retail', type: demand.slug, hoods: [building.hood],
    layouts: [building.layout || building.size], show: 'takeover'}};
}
async function assertFinderHistory(page, {kept, pick}){
  await page.waitForFunction(key => cityMapPage.selected === key, pick);
  const filters = await page.evaluate(() => finderPick(cityMapPage.fs));
  for(const key of ['cat', 'type', 'hoods', 'layouts', 'show']) assert.deepEqual(filters[key], kept[key], key);
  assert.equal(await page.evaluate(() => history.state.nxPick), pick);
  assert.equal(await page.locator('#cityMapPage .place.on').getAttribute('data-pick'), pick);
  assert.equal(await page.locator('#cityMapPage .site.in').count(), 1, 'the picked building card is open');
}

test('a cold finder reload waits for premises, then restores its history filters and pick together', async t => {
  const question = finderHistoryQuestion();
  const page = await open(t, {hash: '#expansion/finder', ...question});
  await page.reload();
  await read(page, 2);
  await page.locator('#cityMapPage .list .od-wait').waitFor();
  await page.evaluate(() => cityMapPage.ready);
  assert.deepEqual(await page.evaluate(() => history.state.nxFs), question.kept, 'map readiness never overwrites the question');
  assert.equal(await page.evaluate(() => history.state.nxPick), question.pick, 'map readiness never deletes the pick');
  await page.evaluate(() => window.release());
  await assertFinderHistory(page, question);
});

test('Back restores both finder filters and the building after a refresh without premises', async t => {
  const question = finderHistoryQuestion();
  const page = await open(t, {hash: '#expansion/finder', ...question});
  await page.evaluate(() => window.release());
  await assertFinderHistory(page, question);
  await page.evaluate(() => openRoute('overview'));
  await nextBoard(page);
  await page.goBack();
  await page.waitForFunction(() => route === 'expansion/finder' && !odReady('premises'));
  await page.evaluate(() => cityMapPage.ready);
  assert.deepEqual(await page.evaluate(() => history.state.nxFs), question.kept);
  assert.equal(await page.evaluate(() => history.state.nxPick), question.pick);
  await page.evaluate(() => window.release());
  await assertFinderHistory(page, question);
});

for(const destination of ['map', 'overview']){
  test(`leaving a loading history finder for ${destination} cancels its restoration`, async t => {
    const question = finderHistoryQuestion();
    const page = await open(t, {hash: '#expansion/finder', ...question});
    await page.evaluate(() => cityMapPage.ready);
    await page.evaluate(destination => openRoute(destination), destination);
    assert.equal(await page.evaluate(() => odThens.some(t => t.key === 'finder-restore')), false, 'navigation drops the queued restoration');
    const before = await page.evaluate(() => finderPick(cityMapPage.fs));
    await page.evaluate(() => window.release());
    await page.waitForFunction(() => odReady('premises'));
    assert.equal(await page.evaluate(() => route), destination);
    assert.deepEqual(await page.evaluate(() => finderPick(cityMapPage.fs)), before, 'the abandoned filters never apply');
    assert.equal(await page.evaluate(() => cityMapPage.finderRestore), null);
    if(destination === 'map') assert.equal(await page.evaluate(() => cityMapPage.fs.on), false, 'arrival never reopens the finder on City map');
  });
}

test('a new finder visit at the same hash does not inherit the abandoned restoration', async t => {
  const page = await open(t, {hash: '#expansion/finder', ...finderHistoryQuestion()});
  await page.evaluate(() => cityMapPage.ready);
  await page.evaluate(() => { openRoute('map'); openRoute('expansion/finder', {preset: {cat: 'office', type: ''}}); });
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => odReady('premises'));
  assert.equal(await page.evaluate(() => route), 'expansion/finder');
  assert.equal(await page.evaluate(() => cityMapPage.fs.cat), 'office');
});

test('same-company refresh keeps section rows and scroll, arrival redraws, another company waits', async t => {
  const page = await open(t);
  for(const [route, selector] of [
    ['businesses/prices', '#secProducts'], ['businesses/milestones', '#secGoals'],
    ['staffing/needs', '#secStaff'], ['staffing/schedules', '#secSchedules'],
    ['expansion/open', '#osBody'], ['expansion/factory', '#ofBody'],
    ['overview', '#optimizeStaffingCard'], ['supply/production', '#secProduction'],
  ]){
    await page.evaluate(route => openRoute(route), route);
    await page.evaluate(() => window.release());
    await page.waitForFunction(selector => !document.querySelector(`${selector} .od-wait`), selector);
    await page.evaluate(selector => {
      const el = document.querySelector(selector);
      el.closest('.page').style.minHeight = '5000px';
      el.closest('.page').querySelectorAll('section').forEach(s => s.classList.add('measured'));
      window.scrollTo(0, 200);
      window.keptChild = selector === '#optimizeStaffingCard' ? el.querySelector('.what').firstChild : el.firstElementChild;
    }, selector);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => { window.keptScroll = window.scrollY; });
    await nextBoard(page);
    assert.equal(await page.evaluate(() => keptChild.isConnected), true, route);
    assert.equal(await page.evaluate(() => window.scrollY), await page.evaluate(() => keptScroll), route);
    await page.evaluate(() => window.release());
    await page.waitForFunction(() => !keptChild.isConnected);
    await nextBoard(page, true);
    assert.ok(await page.locator(`${selector} .od-wait`).count(), `${route}: other company waits`);
    await page.evaluate(() => window.release());
  }
});

for(const detached of ['sheet', 'demand', 'select']){
  test(`a retained hiring ${detached} gates actions during refresh and can still close`, async t => {
    const page = await open(t, {hash: '#staffing/needs'});
    await page.waitForFunction(() => window.held.some(f => f.section === 'hiring'));
    await page.evaluate(() => window.release());
    await page.waitForFunction(() => odReady('hiring'));
    // This fixture has no recruiting applicants. Add synthetic candidates
    // for its existing roles so Change picks and both lists can be opened.
    await page.evaluate(() => {
      const skills = [...new Set(D.hiring.sites.flatMap(s => s.accepts || []))];
      D.candidates = skills.map((skill, i) => ({id: `regression-${i}`, name: `Candidate ${i}`, age: 30,
        skill, level: 90, skills: [{skill, level: 90}], wage: 20, demands: ['ba:jobdemand_freeweekends'],
        hoursLeft: 100, source: 'headhunter'}));
      drawStaffPage();
    });
    await page.locator('#secStaff [data-hr-open]').first().click();
    await page.locator('#hsSheet[open]').waitFor();
    await page.evaluate(() => {
      const r = hrModel().roles.find(r => r.skill === hrUi.sheet);
      hrUi.skip.add(r.pool[0].id);
      window.skipBefore = [...hrUi.skip];
    });
    if(detached === 'demand'){
      await page.locator('#hsSheet [data-hs-dem-open]').click();
      await page.locator('#hsDemPop').waitFor();
    } else if(detached === 'select'){
      await page.evaluate(() => hrSelOpen(document.querySelector('#hsSheet .hs-sel select')));
      await page.locator('#hsSelPop').waitFor();
    }
    await nextBoard(page);
    await page.evaluate(() => {
      window.filterBefore = JSON.stringify(hrFilters());
      window.modelReads = 0; window.originalHrModel = hrModel;
      hrModel = (...args) => { if(!odReady('hiring')) window.modelReads++; return originalHrModel(...args); };
    });
    if(detached === 'sheet') await page.locator('#hsSheet [data-hs-reset]').click();
    else if(detached === 'demand'){
      await page.locator('#hsDemPop [data-hs-dem-clear]').click();
      const checkbox = page.locator('#hsDemPop input').first();
      if(await checkbox.count()) await checkbox.click();
    } else {
      await page.locator('#hsSelPop').press('ArrowDown');
      await page.locator('#hsSelPop').press('Enter');
      await page.locator('#hsSelPop [data-hs-opt]').last().click();
    }
    assert.equal(await page.evaluate(() => window.modelReads), 0, 'no handler reads the missing hiring model');
    assert.deepEqual(await page.evaluate(() => [...hrUi.skip]), await page.evaluate(() => skipBefore));
    assert.equal(await page.evaluate(() => JSON.stringify(hrFilters())), await page.evaluate(() => filterBefore));
    assert.equal(await page.locator('#hsSheet[open]').count(), 1, 'Change picks stays open');
    if(detached !== 'sheet'){
      await page.keyboard.press('Escape');
      assert.equal(await page.locator(detached === 'demand' ? '#hsDemPop' : '#hsSelPop').count(), 0, 'Escape closes the detached list');
    }
    await page.locator('#hsSheet [data-hs-close]').click();
    await page.locator('#hsSheet').waitFor({state: 'detached'});
    await page.evaluate(() => window.release());
    await page.waitForFunction(() => odReady('hiring'));
    assert.equal(await page.locator('#hsSheet').count(), 0, 'arrival does not reopen a closed dialog');
  });
}

test('site write controls gate only the sections their action reads', async t => {
  const page = await open(t, {hash: '#map'});
  for(const [kind, expected] of [['uniforms', []], ['marketing', []], ['schedule', ['hiring']]]){
    const needs = await page.evaluate(kind => {
      const button = document.createElement('button');
      button.dataset.gw = kind; button.dataset.gwSites = '["shop"]';
      return odActionNeeds(button);
    }, kind);
    assert.deepEqual(needs, expected, kind);
  }
});

test('a retained write review gates its declared readers and keeps Cancel usable', async t => {
  const page = await open(t, {hash: '#staffing/needs'});
  await page.waitForFunction(() => window.held.some(f => f.section === 'hiring'));
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => odReady('hiring'));
  await page.evaluate(() => {
    window.reviewReads = 0; window.reviewWrites = 0;
    SOURCE.write = async () => { reviewWrites++; return {body: {ok: true}}; };
    gwConfirm({kind: 'hire', icon: 'hire', title: 'Review', needs: ['hiring'],
      body: () => { reviewReads++; return {}; }, applyLabel: () => 'Apply', verdict: () => 'Ready',
      draw: () => '<button type="button" data-test-review-mode>Change mode</button>',
      bind: dlg => { dlg.querySelector('[data-test-review-mode]').onclick = () => { reviewReads++; hrModel(); }; }});
  });
  await page.locator('.gw-dlg[data-phase="ready"]').waitFor();
  await nextBoard(page);
  const before = await page.evaluate(() => [reviewReads, reviewWrites]);
  await page.locator('.gw-dlg [data-test-review-mode]').click();
  await page.locator('.gw-dlg [data-gw-b="apply"]').click();
  assert.deepEqual(await page.evaluate(() => [reviewReads, reviewWrites]), before, 'neither controls nor Apply read missing hiring');
  await page.locator('.gw-dlg .gw-body .od-wait').waitFor();
  await page.locator('.gw-dlg .gw-foot [data-od-close]').click();
  await page.locator('.gw-dlg').waitFor({state: 'detached'});
});

test('Undo in a done write dialog still sends its write while the next board waits for hiring', async t => {
  const page = await open(t, {hash: '#staffing/needs'});
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => odReady('hiring'));
  await page.evaluate(() => {
    window.reviewWrites = [];
    SOURCE.write = async (kind, body, o) => { reviewWrites.push({kind, body, dryRun: o.dryRun}); return {body: {ok: true}}; };
    gwConfirm({kind: 'hire', icon: 'hire', title: 'Review', needs: ['hiring'], body: () => ({}),
      applyLabel: () => 'Apply', verdict: () => 'Ready', draw: () => '', done: () => 'Done'});
  });
  await page.locator('.gw-dlg[data-phase="ready"]').waitFor();
  await page.locator('.gw-dlg [data-gw-b="apply"]').click();
  await page.locator('.gw-dlg[data-phase="done"]').waitFor();
  await nextBoard(page);
  assert.equal(await page.evaluate(() => odReady('hiring')), false);
  await page.locator('.gw-dlg [data-gw-b="undo"]').click();
  await page.locator('.gw-dlg[data-phase="undone"]').waitFor();
  assert.deepEqual(await page.evaluate(() => reviewWrites.at(-1)), {kind: 'undo', body: {kind: 'hire'}, dryRun: false});
});

test('the capture guard allows text selection, scrolling keys and plain navigation, while gating activation', async t => {
  const page = await open(t, {hash: '#staffing/needs'});
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => odReady('hiring'));
  await nextBoard(page);
  const events = await page.evaluate(() => {
    const host = document.querySelector('#secStaff');
    host.insertAdjacentHTML('beforeend', '<p id="guardText">Select this text</p><button id="guardButton">Change</button><a id="guardNav" href="#wiki/test" data-tip="Guide">Guide</a><a id="guardAction" href="#" data-hr-open="role">Change picks</a>');
    const fire = (id, type, key) => {
      const event = type === 'keydown' ? new KeyboardEvent(type, {key, bubbles: true, cancelable: true})
        : new MouseEvent(type, {bubbles: true, cancelable: true});
      document.getElementById(id).dispatchEvent(event);
      return event.defaultPrevented;
    };
    // Keep a permitted click from navigating after the capture guard has run.
    const nav = document.getElementById('guardNav');
    let navClick = false;
    nav.onclick = e => { navClick = !e.defaultPrevented; e.preventDefault(); };
    fire('guardNav', 'click');
    return {selection: fire('guardText', 'mousedown'), arrow: fire('guardButton', 'keydown', 'ArrowDown'),
      textSpace: fire('guardText', 'keydown', ' '), navEnter: fire('guardNav', 'keydown', 'Enter'), navClick,
      enter: fire('guardButton', 'keydown', 'Enter'), space: fire('guardButton', 'keydown', ' '),
      action: fire('guardAction', 'keydown', 'Enter')};
  });
  assert.deepEqual(events, {selection: false, arrow: false, textSpace: false, navEnter: false, navClick: true,
    enter: true, space: true, action: true});
});

for(const action of ['staff', 'all']){
  test(`retained Staff ${action} opens a waiting review while hiring reloads`, async t => {
    const page = await open(t, {hash: '#staffing/needs'});
    await page.evaluate(() => window.release());
    await page.waitForFunction(() => odReady('hiring'));
    await page.evaluate(action => {
      const b = document.createElement('button');
      b.dataset.gw = 'hire';
      if(action === 'staff') b.dataset.hrStaff = D.businesses[0].key; else b.dataset.hrAll = '';
      b.id = 'retainedStaff'; b.textContent = 'Staff';
      document.querySelector('#secStaff').appendChild(b);
      window.reviewWrites = 0; SOURCE.write = async () => { reviewWrites++; return {body: {ok: true}}; };
    }, action);
    await nextBoard(page);
    await page.evaluate(() => {
      window.modelReads = 0; window.originalHrModel = hrModel;
      hrModel = (...args) => { if(!odReady('hiring')) modelReads++; return originalHrModel(...args); };
    });
    await page.evaluate(() => document.querySelector('#retainedStaff').click());
    assert.equal(await page.locator('.gw-dlg').count(), 1, 'the click opens the review immediately');
    await page.locator('.gw-dlg .od-wait').waitFor();
    assert.equal(await page.evaluate(() => modelReads), 0);
    assert.equal(await page.evaluate(() => reviewWrites), 0);
    await page.locator('.gw-dlg .gw-foot [data-od-close]').click();
    await page.locator('.gw-dlg').waitFor({state: 'detached'});
    await page.evaluate(() => window.release());
    await page.waitForFunction(() => odReady('hiring'));
    assert.equal(await page.locator('.gw-dlg').count(), 0, 'closing a waiting review cancels it');
  });
}

test('retained finder footprints cannot move stale card content, and Close dismisses during refresh', async t => {
  const page = await open(t, {hash: '#expansion/finder', ...finderHistoryQuestion()});
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => !!cityMapPage.finderDrawnScope);
  await page.evaluate(async () => { await cityMapPage.ready; await loadFloorPlans(); });
  await page.evaluate(async () => {
    await cityMapPage.select(cityMapPage.matches[0].key, false);
    window.pickedBefore = cityMapPage.selected;
    window.cardBefore = cityMapPage.card.innerHTML;
  });
  await page.locator('#cityMapPage .site.in').waitFor();
  await nextBoard(page);
  await page.evaluate(() => {
    const view = cityMapPage, path = [...view.paths].find(([key]) => key !== pickedBefore)[1];
    const e = {button: 0, pointerId: 17, clientX: 100, clientY: 100, target: path, preventDefault(){}};
    // Exercise the footprint's pointer handlers without native pointer capture.
    view.svg.setPointerCapture = () => {};
    view.svg.onpointerdown(e); view.svg.onpointerup({...e, type: 'pointerup'});
  });
  assert.equal(await page.evaluate(() => cityMapPage.selected), await page.evaluate(() => pickedBefore));
  assert.equal(await page.evaluate(() => history.state.nxPick), await page.evaluate(() => pickedBefore));
  assert.equal(await page.evaluate(() => cityMapPage.card.innerHTML), await page.evaluate(() => cardBefore));
  await page.locator('#cityMapPage .site [data-action="close"]').click();
  assert.equal(await page.evaluate(() => cityMapPage.card.hidden), true);
  assert.equal(await page.evaluate(() => cityMapPage.selected), null);
  assert.equal(await page.evaluate(() => history.state.nxPick || null), null);
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => odReady('premises'));
  assert.equal(await page.locator('#cityMapPage .site.in').count(), 0);
});

test('the drawn finder keeps its list and scroll, ignores filters while loading and redraws on arrival', async t => {
  const page = await open(t, {hash: '#expansion/finder'});
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => !!cityMapPage.finderDrawnScope);
  await page.evaluate(async () => { await cityMapPage.ready; await loadFloorPlans(); });
  await page.evaluate(() => {
    const list = cityMapPage.list;
    list.style.height = '50px'; list.style.flex = 'none'; list.style.overflow = 'auto';
    list.scrollTop = 30;
    window.keptScroll = list.scrollTop; window.keptChild = list.firstElementChild;
    window.filtersBefore = JSON.stringify(cityMapPage.fs);
    window.storageBefore = localStorage.getItem(cityMapPage.finderStore());
  });
  assert.ok(await page.evaluate(() => keptScroll > 0), 'the finder list is scrolled');
  await nextBoard(page);
  assert.equal(await page.evaluate(() => keptChild.isConnected), true);
  assert.equal(await page.evaluate(() => cityMapPage.list.scrollTop), await page.evaluate(() => keptScroll));
  await page.locator('#cityMapPage .fchip.hd').first().click();
  await page.locator('#cityMapPage .fchip.cat').first().click();
  assert.equal(await page.evaluate(() => JSON.stringify(cityMapPage.fs)), await page.evaluate(() => filtersBefore));
  assert.equal(await page.evaluate(() => localStorage.getItem(cityMapPage.finderStore())), await page.evaluate(() => storageBefore));
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => !keptChild.isConnected);
  assert.equal(await page.evaluate(() => cityMapPage.list.scrollTop), await page.evaluate(() => keptScroll));
  await nextBoard(page, true);
  await page.locator('#cityMapPage .list .od-wait').waitFor();
});

test('search intent requests sold products and arrival rebuilds the open index', async t => {
  const page = await open(t, {hash: '#map'});
  await page.locator('#ssField').focus();
  assert.deepEqual(await asked(page), ['products']);
  const product = payload.products.find(p => p.slug === 'ba:itemname_cheapgift');
  await page.evaluate(item => ssOpen(item), product.item);
  assert.equal(await page.evaluate(slug => ssIndex.some(e => e.id === `product:${slug}`), product.slug), false);
  await page.evaluate(() => window.release());
  await page.waitForFunction(slug => ssIndex.some(e => e.id === `product:${slug}`), product.slug);
});

test('a refresh keeps the store plan map and gates its retained controls on current facts', async t => {
  const page = await open(t, {hash: '#expansion/open'});
  await page.evaluate(() => osStart('ba:businesstype_liquorstore'));
  await page.evaluate(() => window.release());
  await page.locator('#osFinderMap svg.map-canvas').waitFor();
  await page.evaluate(() => {
    window.keptMap = document.querySelector('#osFinderMap svg');
    window.planBefore = JSON.stringify(osPlan()); window.stepBefore = osStep;
    window.storeBefore = localStorage.getItem(osStore());
  });
  await nextBoard(page);
  assert.equal(await page.evaluate(() => keptMap.isConnected), true);
  await page.evaluate(() => document.querySelector('[data-os-step="what"]').click());
  assert.equal(await page.evaluate(() => osStep), await page.evaluate(() => stepBefore));
  assert.equal(await page.evaluate(() => JSON.stringify(osPlan())), await page.evaluate(() => planBefore));
  assert.equal(await page.evaluate(() => localStorage.getItem(osStore())), await page.evaluate(() => storeBefore));
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => odReady('openStore'));
  assert.equal(await page.evaluate(() => keptMap.isConnected), true, 'the plan map is reused after arrival too');
});

test('an open site keeps its scheduling block during refresh and shows a section failure', async t => {
  const page = await open(t);
  await page.evaluate(() => openSite(D.businesses.find(b => b.status === 'retail').key));
  await page.locator('#sp-sched').waitFor();
  await page.evaluate(() => { window.keptBlock = document.querySelector('#sp-sched'); });
  await nextBoard(page);
  assert.equal(await page.evaluate(() => keptBlock.isConnected), true);
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => !keptBlock.isConnected);
  await page.evaluate(() => { window.keptBlock = document.querySelector('#sp-sched'); });
  await nextBoard(page);
  assert.equal(await page.evaluate(() => keptBlock.isConnected), true);
  await page.evaluate(() => odFailed(['staffing'], odGen(), new Error('shop failure')));
  await page.locator('#sitePanel .od-wait.err').waitFor();
  assert.equal(await page.evaluate(() => keptBlock.isConnected), false);
});

test('Standards uses core readings without asking for staffing or hiring', async t => {
  const page = await open(t, {hash: '#businesses/standards'});
  await page.waitForSelector('#secStandards .bz-std');
  assert.deepEqual(await asked(page), []);
});

test('Today asks only for shop plans; Staff needs asks for hiring and draws it when it arrives', async (t) => {
  const page = await open(t);
  await page.waitForSelector('#alerts');
  assert.deepEqual(await asked(page), ['staffing'], 'Today asks only for shops');
  await page.evaluate(() => { location.hash = '#staffing/needs'; });
  const wait = page.locator('#secStaff .od-wait');
  await wait.waitFor();
  assert.equal(await wait.textContent(), en('nav.od.hiring'));
  assert.deepEqual(await asked(page), ['staffing', 'hiring']);
  assert.equal(await page.evaluate(() => window.release()), 1);
  await page.locator('#secStaff #hsOpen').waitFor();
  assert.equal(await page.locator('#secStaff .od-wait').count(), 0);
  // Factory staffing came with it: Supply › Production asks for nothing more.
  await page.evaluate(() => { location.hash = '#supply/production'; });
  await page.locator('#sbStaff').waitFor();
  assert.equal(await page.locator('#sbStaff .od-wait').count(), 0);
  assert.deepEqual(await asked(page), ['staffing', 'hiring']);
  await page.evaluate(() => window.release());
});

test('Supply › Production uses core recipes and asks for factory staffing', async (t) => {
  const page = await open(t);
  await page.evaluate(() => { location.hash = '#supply/production'; });
  await page.locator('#sbStaff .od-wait').waitFor();
  assert.deepEqual(await asked(page), ['staffing', 'factoryStaffing']);
  await page.evaluate(() => window.release());
  await page.locator('#sbStaff .sb-sfac').first().waitFor();
  assert.equal(await page.locator('#sbStaff .od-wait').count(), 0);
});

test('an answer for the board before a new read is dropped, and the new board asks again', async (t) => {
  const page = await open(t);
  await page.evaluate(() => { location.hash = '#staffing/needs'; });
  await page.locator('#secStaff .od-wait').waitFor();
  const first = await page.evaluate(() => window.lastGen);
  await read(page, 2);
  await page.waitForFunction((first) => window.lastGen !== first, first);
  // The new board on screen asks for its own; the old answer arrives stale.
  await page.waitForFunction(() => window.asked.filter(a => a.name === "hiring").length === 2);
  const gens = await page.evaluate(() => window.asked.filter(a => a.name === "hiring").map(a => a.gen));
  assert.equal(gens[0], first);
  assert.notEqual(gens[1], first);
  await page.evaluate(() => window.release());
  await page.locator('#secStaff #hsOpen').waitFor();
  assert.equal(await page.locator('#secStaff .od-wait.err').count(), 0, 'the stale answer is not an error on the new board');
});

test('a section left loading for a build that is then cancelled says so', async (t) => {
  const page = await open(t);
  // A newer read is under way: the worker answers the section stale, and
  // the board waits for the new board to ask again.
  await page.evaluate(() => { window.holdBuilds = true; window.movedOn = true; });
  await page.evaluate(() => {
    const input = document.getElementById('folderPick');
    const file = new File(['x'], 'Payload Co.hsg', {lastModified: Date.now() + 5});
    Object.defineProperty(file, 'webkitRelativePath', {value: 'Saves/abc/Payload Co.hsg'});
    Object.defineProperty(input, 'files', {value: [file], configurable: true});
    input.dispatchEvent(new Event('change'));
  });
  await page.evaluate(() => { location.hash = '#staffing/needs'; });
  await page.waitForFunction(() => window.asked.filter(a => a.name === "hiring").length === 1);
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#secStaff .od-wait:not(.err)').count(), 1, 'loading: a new board is coming');
  // Then another save is chosen: that read is cancelled (supersede()), and
  // nothing says a board will come of the new one. The section says so, with
  // Try again, until a board does.
  await page.evaluate(() => {
    const input = document.getElementById('folderPick');
    const file = new File(['x'], 'Other Co.hsg', {lastModified: Date.now() + 9});
    Object.defineProperty(file, 'webkitRelativePath', {value: 'Saves/def/Other Co.hsg'});
    Object.defineProperty(input, 'files', {value: [file], configurable: true});
    input.dispatchEvent(new Event('change'));
  });
  await page.locator('#secStaff .od-wait.err [data-od-retry]').waitFor();
});

test('a stale answer with no new board coming is an error with Try again, not a spinner', async (t) => {
  const page = await open(t);
  // The worker holds a newer build the page dropped (a cancelled read): no
  // build is waiting, so nothing will ask again.
  await page.evaluate(() => { window.movedOn = true; location.hash = '#staffing/needs'; });
  const failed = page.locator('#secStaff .od-wait.err');
  await failed.waitFor();
  assert.ok((await failed.textContent()).includes(en('app.reader.section.gone')));
  // Try again asks once more. The real worker serves this board only after
  // Update reads it again; the stub stands for that, to show Try again loads.
  await page.evaluate(() => { window.movedOn = false; });
  await failed.locator('[data-od-retry]').click();
  await page.locator('#secStaff .od-wait:not(.err)').waitFor();
  await page.evaluate(() => window.release());
  await page.locator('#secStaff #hsOpen').waitFor();
});


test('Today waits for its shop card and leaves the finder count neutral without requesting premises', async t => {
  const page = await open(t, {releaseShops: false});
  await page.locator('#optimizeStaffingCard .od-wait').waitFor({state: 'attached'});
  assert.deepEqual(await asked(page), ['staffing']);
  assert.ok(!(await page.locator('#findLocationCard').textContent()).includes(en('today.moves.find.badge.none')));
  assert.equal(await page.locator('#findLocationCard .soon').textContent(), '');
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => !document.querySelector('#optimizeStaffingCard .od-wait'));
});

test('Map asks for nothing; the finder asks and waits for premises, then shows its saved question', async t => {
  const page = await open(t, {hash: '#map'});
  await page.locator('#cityMapPage .map-canvas').waitFor();
  assert.deepEqual(await asked(page), []);
  await page.evaluate(() => openRoute('expansion/finder', {preset: {cat: 'office'}, focus: false}));
  await page.locator('#cityMapPage .places .od-wait').waitFor();
  assert.deepEqual(await asked(page), ['premises']);
  assert.equal(await page.locator('#cityMapPage .places .empty').count(), 0);
  assert.equal(await page.locator('#cityMapPage .srch .cnt').textContent(), '—');
  await page.evaluate(() => openRoute('map'));
  assert.equal(await page.locator('#cityMapPage').evaluate(el => el.classList.contains('finder')), false,
    'the plain map closes a pending finder too');
  await page.evaluate(() => openRoute('expansion/finder', {preset: {cat: 'office'}, focus: false}));
  assert.deepEqual(await asked(page), ['premises'], 'reopening the pending finder asks once');
  await page.evaluate(() => window.release());
  await page.locator('#cityMapPage .filters').waitFor();
  assert.equal(await page.evaluate(() => cityMapPage.fs.cat), 'office');
  assert.equal(await page.locator('#cityMapPage .places .od-wait').count(), 0);
  await page.evaluate(() => openRoute('map'));
  const gen = await page.evaluate(() => window.lastGen);
  await read(page, 2);
  await page.waitForFunction(gen => window.lastGen !== gen, gen);
  await page.waitForTimeout(100);
  assert.deepEqual(await asked(page), ['premises'], 'a rebuild on Map requests no section');
});

test('the cold Map finder toggle asks for premises and opens the finder', async t => {
  const page = await open(t, {hash: '#map'});
  const toggle = page.locator('#cityMapPage [data-f="tog"]');
  await toggle.waitFor();
  assert.deepEqual(await asked(page), []);
  await toggle.click();
  await page.locator('#cityMapPage .places .od-wait').waitFor();
  assert.deepEqual(await asked(page), ['premises']);
  assert.equal(await page.evaluate(() => route), 'expansion/finder');
  await page.evaluate(() => window.release());
  await page.locator('#cityMapPage .filters').waitFor();
  assert.equal(await page.locator('#cityMapPage .places .od-wait').count(), 0);
});

test('cold search, Demand and Today persist their finder questions on arrival', async t => {
  for(const entry of ['search', 'question', 'type', 'warehouse', 'demand', 'today']){
    const page = await open(t, {hash: '#map'});
    const preset = await page.evaluate(entry => {
      if(entry === 'search') SS_VIEWS.find(v => v.id === 'finder').go();
      else if(entry === 'question') SS_QUESTIONS.find(v => v.id === 'open').go();
      else if(entry === 'warehouse') ssBuild().find(v => v.id === 'finder:warehouse').go();
      else if(entry === 'today'){ openRoute('overview'); document.querySelector('#findLocationCard').click(); }
      else if(entry === 'demand'){
        openRoute('expansion/demand');
        document.querySelector('.heat .cell[data-slug="ba:businesstype_liquorstore"]').click();
        document.querySelector('#demCellPop [data-dem-go="find"]').click();
      }
      else {
        const row = D.market.types.find(r => r.cells.some(Boolean));
        ssBuild().find(v => v.id === `finder:${row.slug}`).go();
      }
      return {...cityMapPage.fs};
    }, entry);
    await page.locator('#cityMapPage .places .od-wait').waitFor();
    assert.ok((await asked(page)).includes(entry === 'demand' ? 'openStore' : 'premises'), entry);
    assert.equal(await page.evaluate(() => route), 'expansion/finder');
    await page.evaluate(() => window.release());
    await page.locator('#cityMapPage .filters').waitFor();
    assert.equal(await page.evaluate(() => cityMapPage.fs.cat), preset.cat, entry);
    assert.equal(await page.evaluate(() => cityMapPage.fs.type), preset.type, entry);
    const filters = await page.evaluate(() => finderPick(cityMapPage.fs));
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem(cityMapPage.finderStore()))), filters, entry);
    assert.deepEqual(await page.evaluate(() => history.state.nxFs), filters, entry);
  }
});

test('a cold type preset survives reload and keeps its own Back and Forward history question', async t => {
  const page = await open(t, {hash: '#map'});
  await page.evaluate(() => ssBuild().find(v => v.id === 'finder:warehouse').go());
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => history.state?.nxFs?.cat === 'warehouse');
  const first = await page.evaluate(() => history.state.nxFs);
  await page.reload();
  await read(page, 2);
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => cityMapPage.fs.cat === 'warehouse' && odReady('premises'));
  assert.deepEqual(await page.evaluate(() => finderPick(cityMapPage.fs)), first);
  await page.evaluate(() => {
    openRoute('map'); openRoute('expansion/finder', {preset: {cat: 'office', type: ''}});
  });
  await page.waitForFunction(() => history.state?.nxFs?.cat === 'office');
  const second = await page.evaluate(() => history.state.nxFs);
  await page.goBack();
  await page.waitForFunction(() => route === 'map');
  await page.goBack();
  await page.waitForFunction(() => cityMapPage.fs.cat === 'warehouse');
  assert.deepEqual(await page.evaluate(() => finderPick(cityMapPage.fs)), first);
  await page.goForward();
  await page.waitForFunction(() => route === 'map');
  await page.goForward();
  await page.waitForFunction(() => cityMapPage.fs.cat === 'office');
  assert.deepEqual(await page.evaluate(() => finderPick(cityMapPage.fs)), second);
});

test('a cold push finder visit records history synchronously even when left before premises', async t => {
  const page = await open(t, {hash: '#map'});
  const first = await page.evaluate(() => {
    openRoute('expansion/finder');
    return {filters: finderPick(cityMapPage.fs), kept: history.state.nxFs};
  });
  assert.deepEqual(first.kept, first.filters);
  await page.evaluate(() => {
    openRoute('map'); openRoute('expansion/finder', {preset: {cat: 'office', type: ''}});
    window.release();
  });
  await page.waitForFunction(() => history.state?.nxFs?.cat === 'office');
  await page.goBack();
  await page.waitForFunction(() => route === 'map');
  await page.goBack();
  await page.waitForFunction(cat => route === 'expansion/finder' && cityMapPage.fs.cat === cat, first.kept.cat);
  assert.deepEqual(await page.evaluate(() => finderPick(cityMapPage.fs)), first.filters);
});

for(const change of ['visit', 'company']){
  test(`a cold preset never persists after its ${change} changes`, async t => {
    const page = await open(t, {hash: '#map'});
    const oldStore = await page.evaluate(() => {
      openRoute('expansion/finder', {preset: {cat: 'warehouse', type: ''}});
      return cityMapPage.finderStore();
    });
    if(change === 'visit') await page.evaluate(() => openRoute('overview'));
    else await nextBoard(page, true);
    await page.evaluate(() => odNeed('premises'));
    await page.evaluate(() => window.release());
    await page.waitForFunction(() => odReady('premises'));
    assert.equal(await page.evaluate(key => localStorage.getItem(key), oldStore), null);
    assert.notEqual(await page.evaluate(() => history.state?.nxFs?.cat), 'warehouse');
  });
}

test('cold factory Investment preserves a saved plan until location and financing facts arrive, then Where works', async t => {
  const page = await open(t, {hash: '#expansion/factory', savedFactory: true});
  await page.locator('#ofBody .od-wait').first().waitFor();
  assert.deepEqual((await asked(page)).sort(), ['openFactory', 'openStore']);
  assert.equal(await page.evaluate(() => localStorage.getItem(factorySavedKey)), await page.evaluate(() => factorySavedText));
  await page.evaluate(() => window.releaseSection('openFactory'));
  await page.waitForFunction(() => !!D.openFactory);
  assert.equal(await page.evaluate(() => 'premises' in D), false);
  assert.equal(await page.evaluate(() => localStorage.getItem(factorySavedKey)), await page.evaluate(() => factorySavedText));
  await page.locator('#ofBody .od-wait').waitFor();
  await page.evaluate(() => window.releaseSection('openStore'));
  await page.locator('#ofFin').waitFor();
  assert.equal(await page.evaluate(() => ofStep), 'investment');
  assert.ok(await page.evaluate(() => ofInvestment(ofPlan()).self > 0));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(factorySavedKey)).plans[0].step), 'investment');
  await page.locator('#ofCtl [data-of-step="where"]').click();
  await page.locator('#ofFinderMap .place.fr').first().waitFor();
  const key = await page.evaluate(() => ofPlan().key);
  await page.evaluate(key => ofPick(key), key);
  await page.locator('#ofFin').waitFor();
  assert.equal(await page.evaluate(() => ofStep), 'investment');
  await page.locator('[data-of-fin-on]').check();
  assert.equal(await page.locator('#ofFinFacts > div').count(), 4);
});

test('factory facts and premises alone still wait for openStore financing', async t => {
  const page = await open(t, {hash: '#map', savedFactory: true});
  await page.evaluate(() => { odNeed('openFactory'); odNeed('premises'); });
  await page.evaluate(() => window.release());
  await page.waitForFunction(() => !!D.openFactory && !!D.premises);
  await page.evaluate(() => openRoute('expansion/factory'));
  await page.locator('#ofBody .od-wait').waitFor();
  assert.equal(await page.evaluate(() => 'openStore' in D), false);
  assert.equal(await page.evaluate(() => localStorage.getItem(factorySavedKey)), await page.evaluate(() => factorySavedText));
  await page.evaluate(() => window.release());
  await page.locator('#ofFin').waitFor();
  assert.equal(await page.evaluate(() => ofStep), 'investment');
});

test('a cold Demand popover requests store facts and refreshes its action and rent count on arrival', async t => {
  const page = await open(t, {hash: '#expansion/demand'});
  await page.evaluate(() => {
    const cell = document.querySelector('.heat .cell[data-slug="ba:businesstype_liquorstore"]');
    cell.scrollIntoView(); cell.click();
  });
  const pop = page.locator('#demCellPop');
  await pop.locator('.od-wait').waitFor();
  assert.deepEqual(await asked(page), ['openStore']);
  assert.equal(await pop.locator('[data-dem-go="open"]').count(), 0);
  assert.ok((await pop.textContent()).includes('—'));
  await pop.locator('[data-dem-go="find"]').focus();
  await page.evaluate(() => window.release());
  await pop.locator('[data-dem-go="open"]').waitFor();
  assert.equal(await pop.locator('.od-wait').count(), 0);
  assert.ok(!(await pop.textContent()).includes('—'));
  assert.equal(await page.evaluate(() => document.activeElement.dataset.demGo), 'find');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => route === 'expansion/finder');
});

test('Demand arrival leaves keyboard focus outside the popover alone', async t => {
  const page = await open(t, {hash: '#expansion/demand'});
  await page.evaluate(() => document.querySelector('.heat .cell[data-slug="ba:businesstype_liquorstore"]').click());
  await page.locator('#demCellPop .od-wait').waitFor();
  await page.locator('#ssField').focus();
  await page.evaluate(() => window.release());
  await page.locator('#demCellPop [data-dem-go="open"]').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ssField');
});

test('Products, Milestones and expansion pages show waits until their facts arrive', async t => {
  const page = await open(t);
  for(const [route, keys, selector] of [
    ['businesses/prices', ['products'], '#secProducts'],
    ['businesses/milestones', ['goals'], '#secGoals'],
    ['expansion/open', ['openStore'], '#osBody'],
    ['expansion/factory', ['openFactory'], '#ofBody'],
  ]){
    const start = (await asked(page)).length;
    await page.evaluate(route => openRoute(route), route);
    await page.locator(`${selector} .od-wait`).first().waitFor();
    assert.deepEqual((await asked(page)).slice(start).sort(), keys.slice().sort(), route);
    assert.equal(await page.locator(`${selector} .od-wait.err`).count(), 0);
    await page.evaluate(() => window.release());
    await page.waitForFunction(selector => !document.querySelector(`${selector} .od-wait`), selector);
  }
});


test('Payroll, fixed costs and Today supply are available with the core', async t => {
  const page = await open(t, {releaseShops: false});
  assert.ok(await page.evaluate(() => D.staff.dailyCost > 0));
  assert.doesNotMatch(await page.locator('#kpis').innerText(), /Working out payroll/);
  assert.ok((await page.locator('#planImportsCard .soon').innerText()).length > 0);
  assert.equal(await page.evaluate(() => Number.isFinite(routeCount('supply/changes'))), true);
  assert.deepEqual(await asked(page), ['staffing']);
  await page.evaluate(() => openRoute('staffing/payroll'));
  assert.equal(await page.locator('#secPayroll .od-wait').count(), 0);
  assert.ok(await page.locator('#secPayroll .pay-tile').count());
  assert.deepEqual(await asked(page), ['staffing']);
  await page.evaluate(() => openRoute('supply/imports'));
  assert.deepEqual(await asked(page), ['staffing']);
  await page.evaluate(() => window.release());
  await page.evaluate(() => openRoute('overview'));
  await page.waitForFunction(() => document.querySelector('#planImportsCard .soon').textContent.length > 0);
  assert.equal(await page.evaluate(() => Number.isFinite(routeCount('supply/changes'))), true);
});
