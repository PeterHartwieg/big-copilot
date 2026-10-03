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
  hiring: ['hiring', 'candidates'], premises: ['premises'], products: ['products'], staff: ['staff'],
  openStore: ['openStore'], openFactory: ['openFactory'], plan: ['plan'], goals: ['goals']};
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

async function open(t, {hash = "", releaseShops = true} = {}) {
  const context = await browser.newContext({viewport: {width: 1280, height: 1000}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  await context.addInitScript(({payload, keys, needs}) => {
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
          window.held.push(() => {
            if (msg.gen !== window.lastGen) return this.onmessage({data: {id: msg.id, kind: 'section', stale: true}});
            const chain = n => [...(needs[n] || []).flatMap(chain), n];
            const names = chain(msg.name);
            const sections = {};
            names.forEach(n => { sections[n] = {}; keys[n].forEach(k => { sections[n][k] = payload[k]; }); });
            this.onmessage({data: {id: msg.id, kind: 'section', data: JSON.stringify({generation: msg.gen, sections})}});
          });
        }
      }
      terminate() {}
    };
    window.release = () => { const all = window.held.splice(0); all.forEach(f => f()); return all.length; };
  }, {payload, keys: SECTION_KEYS, needs: SECTION_NEEDS});
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
  assert.deepEqual(await asked(page), ['staffing', 'hiring', 'plan']);
  await page.evaluate(() => window.release());
});

test('Supply › Production asks for recipes and factory staffing', async (t) => {
  const page = await open(t);
  await page.evaluate(() => { location.hash = '#supply/production'; });
  await page.locator('#sbStaff .od-wait').waitFor();
  assert.deepEqual(await asked(page), ['staffing', 'plan', 'factoryStaffing']);
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

test('Products, Payroll, Milestones and expansion pages show waits until their facts arrive', async t => {
  const page = await open(t);
  for(const [route, keys, selector] of [
    ['businesses/prices', ['products'], '#secProducts'],
    ['staffing/payroll', ['staff'], '#secPayroll'],
    ['businesses/milestones', ['goals'], '#secGoals'],
    ['expansion/open', ['openStore'], '#osBody'],
    ['expansion/factory', ['plan', 'openFactory'], '#ofBody'],
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
