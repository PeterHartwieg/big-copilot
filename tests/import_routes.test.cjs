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
        assert.match(imports, /2[,.\s]?000\s*paused/);
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
