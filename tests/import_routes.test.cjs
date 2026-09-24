// Exercise real extraction through the rendered supply tables and checklist.
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
let browser, html;
before(async () => {
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(root, 'web/index.html'), 'utf8')
    : python('from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))');
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

for (const scenario of [
  {name: 'paused direct', expression: '[contract(2000,active=False,destination=("factory",0))]', routed: false},
  {name: 'mixed fully covered', expression: '[contract(2000,destination=("factory",0))]', routed: true},
  {name: 'mixed partially direct', expression: '[contract(840,destination=("factory",0)),contract(900)]', routed: true},
]) {
  test(`${scenario.name} does not recommend a redundant order`, async () => {
    const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
      + 'from test_import_routes import ImportRoutesTests,contract; '
      + `print(json.dumps(ImportRoutesTests().build(${scenario.expression},routed=${scenario.routed ? 'True' : 'False'})))`));
    const page = await browser.newPage();
    try {
      await page.route('https://**', route => route.abort());
      await page.setContent(html, {waitUntil: 'load'});
      await page.evaluate(data => {
        D = data; stockView = 'feed'; showAllStock = true; logisticsView = 'all';
        const draw = drawOrderChecklist;
        drawOrderChecklist = (rows, f) => { window.fixtureActions = rows; draw(rows, f); };
        drawStock(); drawLogistics();
      }, data);
      const actions = await page.evaluate(() => window.fixtureActions);
      const imports = await page.locator('#importPlan').textContent();
      if (scenario.name === 'paused direct') {
        assert.match(imports, /2[,.\s]?000\s*a week\s*paused/);
        assert.match(imports, /resume import/);
        assert.equal(actions.length, 1);
        assert.match(actions[0].reason, /Resume the paused import/);
        assert.equal(actions[0].proposed, null);
        assert.doesNotMatch(await page.locator('#stock').textContent(), /raise the weekly import/);
      } else {
        assert.equal(actions.filter(a => a.kind === 'Weekly imports').length, 0);
        assert.doesNotMatch(imports, /nothing draws it|not imported/);
        assert.match(await page.locator('#stock').textContent(), /covered/);
      }
    } finally { await page.close(); }
  });
}

test('126000-unit warehouse contract is visible before its first delivery', async () => {
  const data = JSON.parse(python(
    'import sys,json; sys.path.insert(0,"tests"); from test_import_routes import ImportRoutesTests,contract; '
    + 'print(json.dumps(ImportRoutesTests().build([contract(126000)],routed=True)))'));
  const page = await browser.newPage();
  try {
    await page.route('https://**', route => route.abort());
    await page.setContent(html, {waitUntil: 'load'});
    await page.evaluate(data => {
      D = data; stockView = 'feed'; showAllStock = true; logisticsView = 'all';
      drawStock(); drawLogistics();
    }, data);
    const imports = await page.locator('#importPlan').textContent();
    assert.match(imports, /WH Import Hub/);
    assert.match(imports, /126[,.\s]?000/);
    assert.doesNotMatch(imports, /not imported/);
    assert.match(await page.locator('#stock').textContent(), /126[,.\s]?000/);
  } finally { await page.close(); }
});

for (const amount of [700, 2000]) {
  test(`direct factory import ${amount} reaches tables and weekly checklist`, async () => {
    const data = JSON.parse(python(
      'import sys,json; sys.path.insert(0,"tests"); from test_import_routes import ImportRoutesTests,contract; '
      + `print(json.dumps(ImportRoutesTests().build([contract(${amount},destination=("factory",0))])))`));
    const page = await browser.newPage();
    try {
      await page.route('https://**', route => route.abort());
      await page.setContent(html, {waitUntil: 'load'});
      await page.evaluate(data => {
        D = data;
        stockView = 'feed'; showAllStock = true; logisticsView = 'all';
        const drawChecklist = drawOrderChecklist;
        drawOrderChecklist = (rows, factories) => {
          window.fixtureActions = rows;
          drawChecklist(rows, factories);
        };
        drawStock(); drawLogistics();
      }, data);
      const feed = await page.locator('#stock').textContent();
      assert.match(feed, /Direct import/);
      assert.doesNotMatch(feed, /no top-up|put Water on a plan/);
      assert.equal(await page.locator('#topupPlan tbody tr').count(), 0);
      const imports = await page.locator('#importPlan').textContent();
      assert.match(imports, /Factory/);
      assert.doesNotMatch(imports, /not imported|on no plan/);
      const actions = await page.evaluate(() => window.fixtureActions);
      if (amount === 700) {
        const weekly = actions.filter(row => row.kind === 'Weekly imports');
        assert.equal(weekly.length, 1);
        assert.equal(weekly[0].site, 0);
        assert.equal(weekly[0].current, 700);
        assert.equal(weekly[0].proposed, 1700);
      }
      assert.ok(actions.every(row => row.kind !== 'Factory daily top-ups'));
    } finally { await page.close(); }
  });
}

for (const target of [130, 300]) {
  test(`mixed imports keep a full-day fill target when target is ${target}`, async () => {
    const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
      + 'from test_import_routes import ImportRoutesTests,contract; '
      + `print(json.dumps(ImportRoutesTests().build([contract(840,destination=("factory",0)),contract(900)],routed=True,target=${target})))`));
    const page = await browser.newPage();
    try {
      await page.route('https://**', route => route.abort());
      await page.setContent(html, {waitUntil: 'load'});
      await page.evaluate(data => {
        D = data; logisticsView = 'all';
        const draw = drawOrderChecklist;
        drawOrderChecklist = (rows, f) => { window.fixtureActions = rows; draw(rows, f); };
        drawLogistics();
      }, data);
      const topups = await page.locator('#topupPlan').textContent();
      assert.match(topups, /240/);
      assert.doesNotMatch(topups, /after direct imports|could lower/);
      const actions = await page.evaluate(() => window.fixtureActions);
      const daily = actions.filter(a => a.kind === 'Factory daily top-ups');
      if (target === 130) {
        assert.equal(daily.length, 1);
        assert.equal(daily[0].proposed, 300);
        assert.match(topups, /raise/);
      } else {
        assert.equal(daily.length, 0);
        assert.match(topups, /covered/);
      }
      assert.equal(actions.filter(a => a.kind === 'Weekly imports').length, 0);
    } finally { await page.close(); }
  });
}

test('unused paused contract stays paused without a resume recommendation', async () => {
  const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
    + 'from test_import_routes import ImportRoutesTests,contract; '
    + 'print(json.dumps(ImportRoutesTests().build([contract(5000,active=False)])))'));
  data.supply.factories.sites = [];
  const page = await browser.newPage();
  try {
    await page.route('https://**', route => route.abort());
    await page.setContent(html, {waitUntil: 'load'});
    await page.evaluate(data => {
      D = data; logisticsView = 'all';
      const draw = drawOrderChecklist;
      drawOrderChecklist = (rows, f) => { window.fixtureActions = rows; draw(rows, f); };
      drawLogistics();
    }, data);
    const imports = await page.locator('#importPlan').textContent();
    assert.match(imports, /nothing draws it/);
    assert.doesNotMatch(imports, /resume import/);
    assert.equal((await page.evaluate(() => window.fixtureActions)).length, 0);
  } finally { await page.close(); }
});

/* A depot a factory's route tops up (tests/test_routed_supply.py): the Weekly
   imports table sizes the import on what the route leaves, and the table,
   the checklist and the Stock view say the same thing. */
for (const scenario of [
  {name: 'a paused backup the route covers', args: '1.0,[contract(5200,0,smart=True,active=False)]'},
  {name: 'an active backup below the week the route covers', args: '1.0,[contract(2000,0,smart=False)]'},
  {name: 'a line the route covers half of', args: '0.5,[contract(5000,5000,smart=False)],import_days=(7,)'},
  {name: 'a paused import on a line the route covers half of', args: '0.5,[contract(13000,13000,smart=False,active=False)],import_days=(7,)'},
  // The route also runs the day the import lands, so the log nets both off it.
  {name: 'a line the route covers half of every day', args: '0.5,[contract(5000,5000,smart=False)],import_days=(7,),route_from=3'},
  {name: 'a covered backup with a figure typed in', args: '1.0,[contract(2000,0,smart=False)]', typed: 2500},
  // No route: the log loses the import's day, the measured draw does not.
  {name: 'a line only the import feeds', args: '0.0,[contract(5000,5000,smart=False)],import_days=(7,)'},
]) {
  test(`routed supply: ${scenario.name}`, async () => {
    const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
      + 'from test_routed_supply import board_data,contract; '
      + `print(json.dumps(board_data(${scenario.args})))`));
    const page = await browser.newPage();
    try {
      await page.route('https://**', route => route.abort());
      await page.setContent(html, {waitUntil: 'load'});
      await page.evaluate(([data, typed]) => {
        D = data; stockView = 'imports'; showAllStock = true; logisticsView = 'all';
        const draw = drawOrderChecklist;
        drawOrderChecklist = (rows, f) => { window.fixtureActions = rows; draw(rows, f); };
        if (typed) {
          const line = D.supply.factories.depots[1]['ba:itemname_frozenfood'];
          impSetKeep(impSetId(D.businesses[1].key, 'ba:itemname_frozenfood'), {value: typed, inGame: line.weekly});
        }
        drawStock(); drawLogistics();
      }, [data, scenario.typed || 0]);
      const actions = await page.evaluate(() => window.fixtureActions);
      const imports = await page.locator('#importPlan').textContent();
      const stock = await page.locator('#stock').textContent();
      const row = data.supply.imports.find(r => r.s === 1);
      const weekly = actions.filter(a => a.kind === 'Weekly imports');
      if (row.covered && scenario.typed) {
        // The player's own figure goes to the checklist; the chip still says why.
        assert.match(imports, /route brings it/);
        assert.doesNotMatch(imports, /nothing draws it/);
        assert.equal(weekly.length, 1);
        assert.equal(weekly[0].proposed, scenario.typed);
      } else if (row.covered) {
        assert.match(imports, /route brings it/);
        assert.doesNotMatch(imports, /resume import|raise|nothing draws it/);
        assert.deepEqual(actions, []);
        assert.equal(row.level, 'ok');
      } else if (!row.routed) {
        // The Stock view's week, 25,200, not the log's 21,600.
        assert.equal(row.weekNeed, 25200);
        assert.equal(weekly.length, 1);
        assert.equal(weekly[0].proposed, row.weekNeed);
        assert.match(imports, /25[,.\s]?200/);
      } else if (row.paused) {
        assert.match(imports, /resume import/);
        assert.equal(weekly.length, 1);
        assert.match(weekly[0].reason,
          /Resume the paused import contract.*after the 12[,.\s]?600 a week a route brings, is 12[,.\s]?600\./);
        assert.equal(row.weekNeed, 12600);
      } else {
        // The table's suggestion is the Stock view's week for the import,
        // and what it shows as used is the draw the route is taken off.
        assert.equal(row.weekNeed, 12600);
        assert.match(stock, /after 1[,.\s]?800\/day by route/);
        assert.match(imports, /raise/);
        assert.match(imports, /25[,.\s]?200/);
        assert.equal(weekly.length, 1);
        assert.equal(weekly[0].proposed, row.weekNeed);
        assert.match(weekly[0].reason, /less the 12[,.\s]?600 a week a route brings/);
      }
    } finally { await page.close(); }
  });
}

test('a depot line with no import that a route feeds is not asked to import', async () => {
  // A factory drawing 1,680 water a week from a depot with no import
  // contract; a route from another of the company's depots brings that
  // depot the whole draw (_depot_routes).
  const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
    + 'from test_import_routes import ImportRoutesTests; '
    + 'print(json.dumps(ImportRoutesTests().build([],routed=True)))'));
  const page = await browser.newPage();
  try {
    await page.route('https://**', route => route.abort());
    await page.setContent(html, {waitUntil: 'load'});
    const run = routes => page.evaluate(([data, routes]) => {
      D = data; logisticsView = 'all';
      D.supply.factories.depotRoutes = routes;
      const draw = drawOrderChecklist;
      drawOrderChecklist = (rows, f) => { window.fixtureActions = rows; draw(rows, f); };
      drawLogistics();
      return {actions: window.fixtureActions, imports: document.getElementById('importPlan').textContent};
    }, [data, routes]);
    const slug = data.supply.factories.sites[0].needs[0].slug;
    const without = await run({});
    assert.equal(without.actions.filter(a => a.kind === 'Weekly imports').length, 1, 'no route: an import to add');
    const fed = await run({1: {[slug]: {routed: 1680, covered: true, drawWeek: 1680}}});
    assert.equal(fed.actions.filter(a => a.kind === 'Weekly imports').length, 0);
    assert.match(fed.imports, /route brings it/);
  } finally { await page.close(); }
});
