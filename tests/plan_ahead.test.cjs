// Plan a chain, ordered ahead: Save as plan keeps a finished layout on this
// device and every supply view reads its inputs through supplyFact(): the
// checklist rows it adds (the import levels, the factory top-ups, the first
// fill), the word "new" with the plan's reason on Supply, the site page and
// Today, what is built of it, and how it clears. Synthetic figures only.
// Install Playwright and its Chromium browser to run; NODE_PATH may point at
// an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
let browser, html;
before(async () => {
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8')
    : (() => {
      const result = spawnSync(process.env.PYTHON || 'python', ['-c',
        'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
      {cwd: root, maxBuffer: 4 * 1024 * 1024});
      assert.equal(result.status, 0, result.stderr?.toString());
      return result.stdout.toString();
    })();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

const TYPE = 'ba:businesstype_electronicsstore';
const HUB = 'ba:street_pier#1', FACTORY = 'ba:street_mill#2';
const STORE = 'ba_dash_plans:plan-fixture';
const contractOf = (order, importer, smart, amount) =>
  ({order, id: `c${order}`, importer, smart, amount, lastWeek: 0, active: true, repeating: true, agent: true});
const site = (key, name, status, type, lines) => ({
  key, name, status, type, address: key.split('_')[1], neighbourhood: 'ba:neighborhood_midtown', code: 'MT',
  opened: 3, revenue: 0, customers: 0, basket: null, profit: -400, margin: null, cogs: 0, wages: 300, rent: 100,
  marketing: 0, theft: 0, licensing: 0, staff: 2, staffCost: 300, crew: [], people: [], lines,
  series: [], rhythm: null, peakDay: null, swing: 0, staffDemands: [], quitWarnings: 0, daysOpen: 70,
  satisfaction: null, amenities: {}, missingUniformLocker: false, uniformGaps: [], traffic: 0, marketingIndex: 0,
  security: 0, capacity: 0});
const stock = (slug, item, units) => ({slug, item, units, rate: 0, price: 1, revenue: 0, soldPerDay: 0});
/* A depot line's fact and a factory input's, as _supply_facts() writes them. */
const depotFact = (st, use, extra = {}) => ({st, why: null, lvl: st === 'covered' ? 'ok' : 'info', role: 'depot',
  cad: 'weekly', use, need: Math.ceil(use * 1.15 / 10) * 10, have: use, setTo: null,
  parts: {lines: use, sites: 0, route: 0}, imp: true, ...extra});
const inputFact = (use, have) => ({st: 'covered', why: null, lvl: 'ok', role: 'factory', cad: 'daily', use,
  need: Math.ceil(use * 1.15 / 10) * 10, have, setTo: null, from: 0});
const need = (slug, item, perDay, target) => ({item, slug, perDay, perWeek: perDay * 7, lines: ['Smartwatch'],
  lineSlugs: ['watch'], target, from: 0, directImport: false, importSite: 0, factoryImportSite: null, stock: 300,
  arrives: perDay, known: true, depotStock: 1000, waitingOn: [], madeAt: [], staffedShare: 1});

/* An import hub and a factory half built for smartwatches: two machines run
   the recipe, three stand empty on its workstation. The hub holds capacitors
   ordered ahead (so they read idle today) and a battery level for the two
   machines running. */
function fixture({running = 2, placed = 2, empty = 3} = {}){
  return {
    meta: {character: 'plan-fixture', save: 'Fixture', day: 73, locale: true},
    rhythm: null, daily: [], hours: [], hourFindings: [], trends: [], hypeExposure: [], homes: [],
    businesses: [
      site(HUB, 'Import Hub', 'support', 'Warehouse', [stock('cap', 'Capacitors', 5000), stock('bat', 'Battery', 1000)]),
      site(FACTORY, 'Factory Electronics', 'support', 'Factory', [stock('cap', 'Capacitors', 300), stock('bat', 'Battery', 300)]),
    ],
    plan: {
      recipes: [{slug: 'watch', item: 'Smartwatch', out: 30, workstation: 'electronics',
        ingredients: [{item: 'Capacitors', slug: 'cap', per: 60}, {item: 'Battery', slug: 'bat', per: 30}]}],
      catalogue: {[TYPE]: {type: 'Electronics Store', products: ['watch'], services: []}},
      own: {}, workstations: {electronics: {name: 'Electronics Workstation', assembly: [], machines: []}},
      sources: {cap: {ordered: 151300, active: true, smart: true, from: '7 Pier', warehouse: 'Import Hub', contracts: [{}],
                      depots: [{smart: true, level: 151300, warehouse: 'Import Hub'}]},
                bat: {ordered: 20200, active: true, smart: true, from: '7 Pier', warehouse: 'Import Hub', contracts: [{}],
                      depots: [{smart: true, level: 20200, warehouse: 'Import Hub'}]}},
      prices: {}, items: {}, peak: 1, priceDay: 70,
    },
    supply: {
      day: 73, margin: 0.15, roundTo: 10, shops: [], imports: [], graph: {nodes: [], links: []},
      idle: [{s: 0, slug: 'cap', item: 'Capacitors', stock: 5000, perWeek: 21600, weeks: 30, dead: false,
              why: 'importHigh', target: 0, value: 0, price: 0, smart: true, importLevel: 151300}],
      factories: {character: 'plan-fixture', machines: placed + empty, unnamed: empty, aliases: {},
        sites: [{s: 1, machines: placed + empty, running,
          lines: [{rid: 'r-watch', item: 'Smartwatch', slug: 'watch', missing: [], workstation: 'Electronics Workstation',
            slots: [1, 2], machines: placed, running, rate: 30, makes: placed * 720, ships: 0, stock: 0, toCity: 0, toPier: 0,
            basis: 'table', piling: false, limit: null, limitHeld: false, atRoster: placed * 720, hoursWeek: 168 * running,
            fullWeek: 168 * placed, gaps: [], hoursNow: 24, needHours: {cap: 24, dem: 24}, demBasis: 'none',
            status: 'covered', why: null, level: 'ok', dem: {status: 'covered', why: null, level: 'ok'}}],
          unnamed: empty ? [{rid: null, workstation: 'Electronics Workstation', slots: [3, 4, 5], machines: empty, idle: true,
            limit: null, candidates: [], hoursWeek: 0, fullWeek: 168 * empty, gaps: []}] : [],
          needs: [need('cap', 'Capacitors', 2880, 3000), need('bat', 'Battery', 1440, 1500)],
          targets: {cap: [3000, 0], bat: [1500, 0]}, known: true, arrivals: {cap: 2880, bat: 1440}}],
        depots: {0: {
          cap: {weekly: 151300, pausedWeekly: 0, smart: true, target: 151300, plain: 0, arrivedLastWeek: 21000,
                contracts: [contractOf(0, '7 Pier', true, 151300)]},
          bat: {weekly: 20200, pausedWeekly: 0, smart: true, target: 20200, plain: 0, arrivedLastWeek: 10000,
                contracts: [contractOf(1, '7 Pier', true, 20200)]}}},
        depotOther: {}},
      facts: {
        0: {cap: depotFact('idle', 21600, {why: 'importHigh', have: 151300}),
            bat: depotFact('covered', 10080, {have: 20200})},
        1: {cap: inputFact(2880, 3000), bat: inputFact(1440, 1500)},
      },
    },
    alerts: [
      {level: 'info', site: 'Import Hub', siteKey: HUB, group: 'dead', id: 'a-cap', ev: {slug: 'cap'}, worth: null, unit: '',
       text: '5,000 Capacitors is 30 weeks of what it feeds; Smart Delivery keeps 151,300 in stock, so lower the import'},
      {level: 'warn', site: 'Factory Electronics', siteKey: FACTORY, group: 'unset', id: 'a-unset', worth: null, unit: '',
       text: '3 factory machines have no recipe set'},
    ],
    minor: {count: 0, rows: []},
  };
}

async function board({width = 1280, data = fixture(), plan = null} = {}){
  const page = await browser.newPage({viewport: {width, height: 1000}});
  await page.route('https://**', route => route.abort());
  await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
  await page.goto('http://board.test/');
  await page.evaluate(([data, plan, key]) => {
    if(plan) localStorage.setItem(key, JSON.stringify([plan]));
    D = data; sbWhich = 'all'; supplySort = {}; supplyAuto = false; sub.supply = 'warehouses';
    document.body.classList.add('has-board');
  }, [data, plan, STORE]);
  return page;
}
/* The Plan a chain page, the range stepped to twelve machines. */
async function planPage(page, machines = 12){
  await page.evaluate(n => {
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageGrowth'; });
    document.querySelectorAll('#pageGrowth section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    planType = 'ba:businesstype_electronicsstore'; planCounts = {watch: n};
    drawPlan(); wireAll();
  }, machines);
}
const planRows = page => page.evaluate(() => sbData().rows.filter(r => r.plan)
  .map(r => [r.kind, r.item, r.current, r.proposed, r.mode]));
async function savePlan(page){
  await planPage(page);
  await page.click('#plSaveBtn');
}

test('saving a plan adds the import level, the top-ups and one first fill row', async () => {
  const page = await board();
  try{
    await planPage(page);
    // What is built of the layout: two run, three more placed, seven to place.
    assert.equal((await page.textContent('#plState')).replace(/\s+/g, ' ').trim(), '12 planned · 5 placed · 2 running');
    assert.deepEqual(await page.$$eval('tr.line[data-slug="watch"] .machines i', i => i.map(x =>
      x.classList.contains('pl-todo') ? 'todo' : x.classList.contains('pl-placed') ? 'placed' : 'run')),
      ['run', 'run', 'placed', 'placed', 'placed', ...Array(7).fill('todo')]);
    assert.match(await page.textContent('#plSave'), /24\/7 whatever the sizing switch/);
    assert.deepEqual(await planRows(page), []);
    await page.click('#plSaveBtn');
    assert.match(await page.textContent('#plSave'), /Saved · 4 changes on Supply/);
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORE);
    assert.equal(saved.length, 1);
    assert.deepEqual([saved[0].type, saved[0].factory, saved[0].counts, saved[0].importDay, saved[0].opens],
      [TYPE, FACTORY, {watch: 12}, 78, 74]);
    // Capacitors: what is ordered ahead already covers the layout; Battery's
    // level rises by the company gap, and each factory top-up to the finished
    // layout's day with the one margin, rounded up to tens.
    assert.deepEqual(await planRows(page), [
      ['Weekly imports', 'Battery', 20200, 69560, 'smart'],
      ['Factory daily top-ups', 'Capacitors', 3000, 19880, null],
      ['Factory daily top-ups', 'Battery', 1500, 9940, null],
      ['Before the next delivery', 'First fill', null, 123600, null],
    ]);
    const fill = await page.evaluate(() => sbData().rows.find(r => r.slug === 'plan:fill').reason);
    assert.match(fill, /opens on Thursday \(day 74\), 5 morning rounds before Monday's import \(day 78\) lands/);
    assert.match(fill, /Capacitors 81,400, Battery 42,200/);
    // The opening day the player picks sizes the fill: Friday leaves four rounds.
    await page.selectOption('#plOpens', '75');
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0].opens, STORE), 75);
    assert.deepEqual((await planRows(page)).at(-1), ['Before the next delivery', 'First fill', null, 97680, null]);
    assert.match(await page.textContent('#plFill'), /4 morning rounds before the import lands\. One urgent import: Capacitors 64,120 · Battery 33,560/);
  } finally { await page.close(); }
});

test('while a plan is saved its inputs read new, with the plan, on Supply, the site page and Today', async () => {
  const page = await board();
  try{
    await savePlan(page);
    const reason = 'ordered ahead · plan: Factory Electronics, 12 machines';
    // Supply › Warehouses: the strip, and each input's word and reason.
    const wh = await page.evaluate(() => {
      document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
      document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
      drawSupplyStrip(); drawWarehousesTab(); wireAll();
      const row = slug => document.querySelector(`#secWarehouses tr[data-slug="${slug}"] td.st`).textContent.replace(/\s+/g, ' ').trim();
      return {strip: document.querySelector('#secWarehouses .pl-saved').textContent.replace(/\s+/g, ' ').trim(),
              fill: document.querySelector('#secWarehouses .pl-fillrow').textContent.replace(/\s+/g, ' ').trim(),
              cap: row('cap'), bat: row('bat'), tag: !!document.querySelector('#secWarehouses tr[data-slug="bat"] .pl-tag'),
              idle: idleRows().length};
    });
    assert.match(wh.strip, /^Plan saved: Factory Electronics, 12 machines\. 5 placed · 2 running\. Its inputs read new until all 12 run; then the plan clears itself\./);
    assert.match(wh.fill, /^First fill before Monday, one urgent import: Capacitors 81,400 · Battery 42,200\.$/);
    assert.equal(wh.cap, `new${reason}`);
    assert.equal(wh.bat, `new${reason}`);
    assert.equal(wh.tag, true);
    // Nothing the plan orders ahead reads idle.
    assert.equal(wh.idle, 0);
    // Factories: the inputs' top-ups, the same word.
    const inputs = await page.evaluate(() => [supplyFact(1, 'cap'), supplyFact(1, 'bat')].map(f => [f.st, szTip(f), f.setTo]));
    assert.deepEqual(inputs, [['new', reason, 19880], ['new', reason, 9940]]);
    // The site page reads the same fact.
    const panel = await page.evaluate(key => { openSite(key, false); return document.querySelector('#sitePanel').textContent; }, HUB);
    assert.match(panel, new RegExp(`new · ${reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
    // Today: the idle finding about what the plan orders ahead goes; the rest stays.
    assert.deepEqual(await page.evaluate(() => alertLines().map(a => a.id)), ['a-unset']);
    const card = await page.evaluate(() => { drawSupplyStrip(); return document.querySelector('#planImportsCard .soon').textContent; });
    assert.match(card, /4/);
  } finally { await page.close(); }
});

test('a plan sizes at 24/7 whatever the sizing switch says', async () => {
  const page = await board();
  try{
    await savePlan(page);
    const cap = await planRows(page);
    const dem = await page.evaluate(() => { sizing = 'dem'; return sbData().rows.filter(r => r.plan)
      .map(r => [r.kind, r.item, r.current, r.proposed, r.mode]); });
    assert.deepEqual(dem, cap);
  } finally { await page.close(); }
});

test('ticks on plan rows are kept, and the game link writes the planned level', async () => {
  const page = await board();
  try{
    await savePlan(page);
    const kept = await page.evaluate(() => {
      const d = sbData(), row = d.rows.find(r => r.plan && r.kind === 'Weekly imports');
      d.marks.add(row.key); sbSaveMarks(d);
      sbStamp++;
      return sbData().marks.has(row.key) && JSON.parse(localStorage.getItem('ba_order_marks_v1:plan-fixture')).includes(row.key);
    });
    assert.equal(kept, true);
    const write = await page.evaluate(key => gwImportPlan(key).map(l => [l.r.slug, l.contracts.map(c => [c.c.id, c.amount])]), HUB);
    assert.deepEqual(write, [['bat', [['c1', 69560]]]]);
  } finally { await page.close(); }
});

test('the plan clears itself once every planned machine runs, and on Remove', async () => {
  const page = await board();
  try{
    await savePlan(page);
    // Twelve machines running: the plan is done, the facts judge the chain again.
    const done = await page.evaluate(([data, key]) => {
      D = data; sbStamp++;
      return {overlay: planOverlay(), stored: localStorage.getItem(key), cap: supplyFact(0, 'cap').st, rows: sbData().rows.filter(r => r.plan).length};
    }, [fixture({running: 12, placed: 12, empty: 0}), STORE]);
    assert.deepEqual(done, {overlay: null, stored: null, cap: 'idle', rows: 0});
    // Saved again, and removed from the Warehouses strip.
    await page.evaluate(data => { D = data; sbStamp++; }, fixture());
    await savePlan(page);
    await page.evaluate(() => {
      document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
      document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
      drawSupplyStrip(); drawWarehousesTab(); wireAll();
    });
    await page.click('#secWarehouses .pl-saved [data-pl-remove]');
    const gone = await page.evaluate(key => ({stored: localStorage.getItem(key), plan: planSaved(), cap: supplyFact(0, 'cap').st,
      alerts: alertLines().map(a => a.id)}), STORE);
    assert.deepEqual(gone, {stored: null, plan: null, cap: 'idle', alerts: ['a-cap', 'a-unset']});
  } finally { await page.close(); }
});

test('a finding that counts several holdings counts only those the plan leaves', async () => {
  const data = fixture();
  data.alerts = [{level: 'info', site: 'Import Hub', siteKey: HUB, group: 'dead', id: 'sum', ev: {slug: 'cap'},
    slugs: ['cap', 'glue', 'tape'], worth: null, unit: '', text: '3 products sit idle; largest Capacitors', detail: 'x'}];
  data.plan.items = {glue: 'Glue', tape: 'Tape'};
  const page = await board({data});
  try{
    await savePlan(page);
    const a = await page.evaluate(() => alertLines()[0]);
    assert.deepEqual([a.text, a.slugs, a.ev.slug], ['2 products sit idle; largest Glue', ['glue', 'tape'], 'glue']);
  } finally { await page.close(); }
});

test('the first fill is the rounds to the import at the layout\'s day, less what the depot holds', async () => {
  const page = await board();
  try{
    const out = await page.evaluate(() => [
      planImportDay(73), planImportDay(78), planImportDay(77),
      planFill({a: {item: 'A', day: 1000}, b: {item: 'B', day: 10}}, 75, 78, s => ({a: 1500, b: 100})[s], 10),
    ]);
    assert.deepEqual(out, [78, 85, 78, {opens: 75, importDay: 78, rounds: 4,
      items: [{slug: 'a', item: 'A', amount: 2500}], total: 2500}]);
  } finally { await page.close(); }
});
