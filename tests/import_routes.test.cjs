// Weekly imports, Daily top-ups and the change checklist read Python's one
// verdict per supply fact (supplyFact); the board works none out of its own.
// The board tests run on the synthetic R8 fixture (tests/fixtures/r8_supply.json).
// The parity tests render real extraction from the Python test builders and
// hold the tables and the checklist to the facts that extraction sends.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
function python(code) {
  const result = spawnSync(process.env.PYTHON || 'python', ['-c', code],
    {cwd: root, maxBuffer: 4 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout.toString();
}
const FIXTURE = path.join(root, 'tests', 'fixtures', 'r8_supply.json');
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
let browser, html;
before(async () => {
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(root, 'web/index.html'), 'utf8')
    : python('from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))');
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

/* The Supply page drawn from `data` under a sizing, with the checklist's rows
   kept for the test. `names` are recipes named in this browser. */
async function board(data, {mode = 'cap', names = null} = {}){
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
  await page.route('https://**', route => route.abort());
  await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
  await page.goto('http://board.test/');
  await page.evaluate(([data, mode, names]) => {
    if(names) localStorage.setItem('ba_line_names', JSON.stringify(names));
    D = data; sizing = mode; stockView = 'feed'; showAllStock = true; logisticsView = 'all'; supplySort = {};
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    const draw = drawOrderChecklist;
    drawOrderChecklist = (rows, f) => { window.fixtureActions = rows; draw(rows, f); };
    drawStock(); drawLogistics(); wireAll();
  }, [data, mode, names]);
  return page;
}
const actions = page => page.evaluate(() => window.fixtureActions.map(a =>
  ({kind: a.kind, item: a.item, current: a.current, proposed: a.proposed, tight: !!a.tight, paused: !!a.paused})));
/* The Weekly imports rows: material, Used / week, the Set to box and its verdict. */
const importRows = page => page.$$eval('#importPlan tbody tr', rows => rows.map(r => ({
  item: r.cells[0].firstChild.textContent.trim(),
  used: r.cells[1].textContent.replace(/\s+/g, ' ').trim(),
  box: r.cells[4].querySelector('input')?.value ?? null,
  verdict: r.cells[4].textContent.replace(/\s+/g, ' ').trim(),
})));

test('Weekly imports lists the depot facts Python marks as import rows, with their figures', async () => {
  const page = await board(fixture());
  try {
    const rows = Object.fromEntries((await importRows(page)).map(r => [r.item, r]));
    // Soda Can is held at the hub but imported by nobody: no import row.
    assert.deepEqual(Object.keys(rows).sort(), ['Butter', 'Coffee', 'Flour', 'Paper Bag', 'Sugar']);
    assert.match(rows.Flour.used, /^11,200$/);
    assert.equal(rows.Flour.box, '12880');
    assert.match(rows.Flour.verdict, /raise/);
    assert.match(rows.Sugar.verdict, /resume import/);
    assert.equal(rows.Sugar.box, '2800', 'a paused contract resumes as it stands');
    assert.match(rows['Paper Bag'].verdict, /idle/);
    assert.match(rows.Butter.verdict, /new/);
    assert.match(rows.Coffee.verdict, /could lower/);
    // Used / week carries Python's split on hover.
    const tip = await page.locator('#importPlan tbody tr', {hasText: 'Coffee'}).locator('td').nth(1).getAttribute('data-tip');
    assert.match(tip, /shops 420 a week/);
    const head = await page.locator('#importPlan .sechead').first().textContent();
    assert.match(head, /1 tight/);
    assert.match(head, /1 paused/);
  } finally { await page.close(); }
});

test('every change on the checklist is a fact\'s figure', async () => {
  const page = await board(fixture());
  try {
    assert.deepEqual(await actions(page), [
      {kind: 'Weekly imports', item: 'Flour', current: 12000, proposed: 12880, tight: true, paused: false},
      {kind: 'Weekly imports', item: 'Sugar', current: null, proposed: null, tight: false, paused: true},
      {kind: 'Factory daily top-ups', item: 'Flour', current: 1400, proposed: 1840, tight: false, paused: false},
      // The gym's shelf is on no plan; the hub that holds its soda could send it.
      {kind: 'Shop daily top-ups', item: 'Soda Can', current: 0, proposed: 70, tight: false, paused: false},
    ]);
    const topups = await page.locator('#topupPlan').textContent();
    assert.match(topups, /1[,.]840/);
    assert.match(topups, /1 short/);
    // Today's card leaves the tight Flour order out.
    assert.equal(await page.locator('#planImportsCard .soon').textContent(), '3 TO CHANGE');
  } finally { await page.close(); }
});

test('Demand sizing reads the facts\' Demand figures, and says where a shop is still ramping', async () => {
  const page = await board(fixture(), {mode: 'dem'});
  try {
    const flour = (await importRows(page)).find(r => r.item === 'Flour');
    assert.match(flour.used, /^8,120 may still be ramping$/);
    assert.equal(flour.box, '12000');
    assert.match(flour.verdict, /covered/);
    const ramp = await page.locator('#importPlan .sz-ramp').first().getAttribute('data-tip');
    assert.match(ramp, /Cake Shop Midtown/);
    assert.match(await page.locator('#topupPlan').textContent(), /1,160\s*may still be ramping/);
    assert.deepEqual((await actions(page)).map(a => [a.kind, a.item]), [
      ['Weekly imports', 'Sugar'], ['Shop daily top-ups', 'Soda Can']]);
    // The switch sits beside the Orders tools, on Demand.
    assert.equal(await page.locator('#logisticsSizing a.on').textContent(), 'Demand');
  } finally { await page.close(); }
});

test('the switch remembers the sizing on the device and redraws the board', async () => {
  const page = await board(fixture());
  try {
    await page.evaluate(() => { window.redrawn = 0; renderAll = () => { window.redrawn++; drawLogistics(); }; });
    await page.locator('#logisticsSizing').getByText('Demand').click();
    assert.equal(await page.evaluate(() => [sizing, localStorage.getItem('ba_dash_sizing'), window.redrawn].join()), 'dem,dem,1');
    assert.match(await page.locator('#importPlan').textContent(), /8,120/);
    await page.locator('#logisticsSizing').getByText('24/7').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('ba_dash_sizing')), 'cap');
  } finally { await page.close(); }
});

test('a paused backup a route covers is covered by route, with nothing to resume', async () => {
  const data = fixture();
  data.supply.facts[0].sugar = {...data.supply.facts[0].sugar, st: 'covered', why: 'route', lvl: 'ok', setTo: null,
    parts: {lines: 2800, sites: 0, route: 2800}};
  const page = await board(data);
  try {
    const sugar = (await importRows(page)).find(r => r.item === 'Sugar');
    assert.match(sugar.verdict, /covered by route/);
    assert.doesNotMatch(sugar.verdict, /resume/);
    assert.ok((await actions(page)).every(a => a.item !== 'Sugar'));
  } finally { await page.close(); }
});

test('a recipe named in this browser reads new until the next refresh', async () => {
  const data = fixture();
  data.supply.factories.sites[0].unnamed = [{rid: 'r-muffin', workstation: 'Oven', slots: [5], machines: 1, idle: false,
    candidates: [{slug: 'muffin', item: 'Muffin'}], hoursWeek: 168, fullWeek: 168, gaps: []}];
  data.plan.recipes.push({slug: 'muffin', item: 'Muffin', out: 10, workstation: 'oven',
    ingredients: [{slug: 'butter', item: 'Butter', per: 5}]});
  const page = await board(data, {names: {'r-muffin': 'muffin'}});
  try {
    const feed = await page.locator('#stock tbody tr', {hasText: 'Butter'}).textContent();
    assert.match(feed, /new/);
    assert.match(feed, /named in this browser/);
    // Its top-up has no figure until Python judges it, so nothing to set.
    const topup = await page.locator('#topupPlan tbody tr', {hasText: 'Butter'}).textContent();
    assert.match(topup, /new/);
    assert.ok((await actions(page)).every(a => a.item !== 'Butter'));
    // The line itself is named, and new.
    await page.evaluate(() => { stockView = 'lines'; drawStock(); });
    assert.match(await page.locator('#stock tbody tr', {hasText: 'Muffin'}).textContent(), /named by you\s*new/);
  } finally { await page.close(); }
});

test('Checks, Goods flow and Today read the same facts, by sizing', async () => {
  const page = await board(fixture());
  try {
    const view = async v => page.evaluate(v => { stockView = v; drawStock(); return document.getElementById('stock').textContent; }, v);
    // One status word per row; tight shows on Checks.
    assert.match(await view('imports'), /tight/);
    const idle = await view('idle');
    // The status word is one of the nine; "not routed" is the reason, with the shops.
    assert.match(idle, /idle\s*not routed: Garden Gym\s*53\/day/);
    assert.match(await view('shops'), /no plan[\s\S]*top-up to 70 from\s*Import Hub/);
    // The switch sits in the Checks toolbar for the sized views only.
    assert.equal(await page.locator('#stockSizing').count(), 0, 'not on Idle stock');
    await view('feed');
    assert.equal(await page.locator('#stockSizing').count(), 1);
    // Goods flow counts the hub's facts; Today has no tight, and Not routed is a kind.
    const flow = await page.evaluate(() => { drawFlow(); flowPickId = 'hub#1'; drawFlowDetail();
      return document.getElementById('flowDetail').textContent; });
    assert.match(flow, /1 paused/);
    assert.match(flow, /2 idle, 1 tight/);
    const today = async mode => page.evaluate(mode => { sizing = mode; drawAlerts();
      return [...document.querySelectorAll('#alerts .find')].map(f => f.dataset.id); }, mode);
    assert.deepEqual(await today('cap'), ['r8feed', 'r8paused', 'r8notrouted', 'r8dead']);
    assert.deepEqual(await today('dem'), ['r8paused', 'r8notrouted', 'r8dead']);
    assert.doesNotMatch(await page.locator('#alerts').textContent(), /tight/i);
  } finally { await page.close(); }
});

/* Real extraction, from the Python builders. Once _supply() sends facts, the
   tables and the checklist say exactly what they say; a payload without them
   (the board ahead of the extraction) has nothing to hold the board to. */
for (const scenario of [
  // The fixture holds the harness itself to account: it has facts today.
  {name: 'the R8 fixture', code: 'd = json.load(open("tests/fixtures/r8_supply.json", encoding="utf-8"))'},
  {name: 'paused direct', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(2000,active=False,destination=("factory",0))])'},
  {name: 'mixed fully covered', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(2000,destination=("factory",0))],routed=True)'},
  {name: 'mixed partially direct', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(840,destination=("factory",0)),contract(900)],routed=True)'},
  {name: 'a warehouse contract before its first delivery', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(126000)],routed=True)'},
  {name: 'a short daily top-up', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(840,destination=("factory",0)),contract(900)],routed=True,target=130)'},
  {name: 'a line the route covers half of', code: 'from test_routed_supply import board_data,contract; '
    + 'd = board_data(0.5,[contract(5000,5000,smart=False)],import_days=(7,))'},
  {name: 'a paused backup the route covers', code: 'from test_routed_supply import board_data,contract; '
    + 'd = board_data(1.0,[contract(5200,0,smart=True,active=False)])'},
]) {
  test(`parity with extraction: ${scenario.name}`, async t => {
    const data = JSON.parse(python(`import sys,json; sys.path.insert(0,"tests"); ${scenario.code}; print(json.dumps(d))`));
    if (!data.supply.facts) { t.skip('this extraction sends no supply facts yet'); return; }
    const page = await board(data);
    try {
      const seen = await page.evaluate(() => {
        const facts = D.supply.facts, out = {imports: [], wanted: [], topups: []};
        Object.keys(facts).forEach(s => Object.keys(facts[s]).forEach(slug => {
          const f = supplyFact(s, slug);
          if(f.imp) out.imports.push(slug);
          if(f.imp && Number.isFinite(f.setTo) && f.st !== 'paused') out.wanted.push([+s, slug, f.setTo]);
          if(f.role === 'input' && f.cad === 'daily' && Number.isFinite(f.setTo)) out.topups.push([+s, slug, f.setTo]);
        }));
        out.rows = gwImportRows.map(r => [r.s, r.slug, r.setTo]);
        return out;
      });
      assert.equal(seen.rows.length, seen.imports.length, 'one Weekly imports row per import fact');
      const acts = await page.evaluate(() => window.fixtureActions);
      const weekly = acts.filter(a => a.kind === 'Weekly imports' && a.proposed !== null);
      assert.equal(weekly.length, seen.wanted.length);
      for (const [s, , setTo] of seen.wanted)
        assert.ok(weekly.some(a => a.site === s && a.proposed === setTo), `weekly ${setTo} at ${s}`);
      const daily = acts.filter(a => a.kind === 'Factory daily top-ups');
      assert.deepEqual(daily.map(a => [a.site, a.proposed]).sort(), seen.topups.map(([s, , v]) => [s, v]).sort());
    } finally { await page.close(); }
  });
}
