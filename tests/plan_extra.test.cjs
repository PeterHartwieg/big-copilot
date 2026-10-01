// Plan a factory's Add product (issue #162): a type's other products are one
// click from a line; an added product the shops do not sell yet runs on a
// per-shop rate the player types, and its raw material joins Ingredients.
// Browser regressions: install Playwright and its Chromium browser to run.
// NODE_PATH may point at an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const FLORIST = 'ba:businesstype_florist', ITEM = 'ba:itemname_';
let browser, html, plan;

/* The real _plan() over a synthetic save: four florists that sell both
   flowers at 150 a shop a day and, at one of them, 30 soda cans. */
function planData(){
  const code = 'import sys, json; sys.path.insert(0, "tests")\n'
    + 'from test_plan_regressions import PlannerRegressions\n'
    + 'PlannerRegressions.setUpClass(); t = PlannerRegressions()\n'
    + 'shop = lambda soda: {"status": "retail", "revenue": 1000, "typeSlug": "' + FLORIST + '", "lines": ['
    + '{"slug": "' + ITEM + 'cheapflower", "price": 25, "rate": 150}, {"slug": "' + ITEM + 'expensiveflower", "price": 40, "rate": 150}]'
    + ' + ([{"slug": "' + ITEM + 'sodacan", "price": 3, "rate": 30}] if soda else [])}\n'
    + 'print(json.dumps(t.plan(businesses=[shop(True), shop(False), shop(False), shop(False)])))';
  const result = spawnSync(process.env.PYTHON || 'python', ['-c', code], {cwd: root, maxBuffer: 16 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  return JSON.parse(result.stdout.toString());
}

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
  plan = planData();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

async function board(saved){
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
  await page.route('https://**', route => route.abort());
  await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
  await page.goto('http://board.test/');
  await page.evaluate(([plan, saved]) => {
    localStorage.clear();
    if(saved) localStorage.setItem('ba_plan_extra_v1', saved);
    D = {meta: {character: 'plan-fixture', save: 'Fixture', day: 10}, businesses: [],
      supply: {shops: [], idle: [], imports: [], factories: {sites: [], depots: {}, depotOther: {}}}, plan};
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageGrowth'; });
    document.querySelectorAll('#pageGrowth section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    planType = 'ba:businesstype_florist'; planCounts = {}; planExtra = null;
    drawPlan(); wirePlan();
  }, [plan, saved || null]);
  return page;
}
const ingRows = page => page.$$eval('#ingBody tr', rows => rows.map(tr => ({
  name: tr.dataset.name, by: tr.cells[1].textContent.trim(), week: tr.querySelector('.wk').textContent})));
const line = (page, slug) => page.locator(`#planBody tr.line[data-slug="${slug}"]`);

test('the catalogue offers what a Florist can additionally sell, heaviest first', () => {
  const extra = plan.catalogue[FLORIST].extra;
  assert.deepEqual(extra.map(([slug]) => slug.replace(ITEM, '')),
    ['sodacan', 'energydrink', 'umbrella', 'cheapgift', 'expensivegift']);
  // Measured beats typed: the soda the shops sell is measured, per shop.
  assert.equal(plan.own[FLORIST].perDay[ITEM + 'sodacan'], 30);
});

test('adding a product gives it a line, a typed rate reworks Supplies, and its raw material joins Ingredients', async () => {
  const page = await board();
  try{
    assert.equal(await page.locator('#planBody tr.line').count(), 2);
    assert.match(await page.locator('.pc-add').textContent(), /Add product\s*5 more/);
    const before = (await ingRows(page)).map(r => r.name);

    await page.click('.pc-add');
    const pop = page.locator('#pcPop');
    assert.equal(await pop.isVisible(), true);
    assert.match(await pop.locator('[data-pc-pick$="umbrella"]').textContent(), /75%/);
    await pop.locator('[data-pc-pick$="umbrella"]').click();
    assert.equal(await pop.isVisible(), false);

    const umbrella = line(page, ITEM + 'umbrella');
    assert.equal(await umbrella.count(), 1);
    assert.match(await page.locator('.pc-add').textContent(), /4 more/);
    // No shop sells umbrellas: the rate is the player's, starting at 150 × 75%, to the ten.
    const field = umbrella.locator('[data-pc-rate]');
    assert.equal(await field.inputValue(), '110');
    assert.match(await umbrella.locator('.pc-rate').textContent(), /your estimate/);

    // Its raw material is new to the order, used by the umbrella alone.
    const added = (await ingRows(page)).filter(r => !before.includes(r.name));
    assert.ok(added.length >= 1, 'the umbrella brings raw material of its own');
    const umbrellaName = await umbrella.getAttribute('data-name');
    added.forEach(r => assert.equal(r.by, umbrellaName));

    // Typing a rate reworks its Supplies cell and keeps the caret in the field.
    await field.fill('40');
    const take = await umbrella.locator('.covers .sub').textContent();
    assert.match(take, /shops take 1,120/);  // 40 × 7 days × 4 shops
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.pcRate), ITEM + 'umbrella');
    const kept = JSON.parse(await page.evaluate(() => localStorage.getItem('ba_plan_extra_v1')));
    assert.deepEqual(kept, {[FLORIST]: {[ITEM + 'umbrella']: 40}});

    // A main line still sells at the type's own rate.
    assert.match(await line(page, ITEM + 'cheapflower').locator('.covers .sub').textContent(), /shops take 4,200/);

    // × takes the line out, and its raw material with it.
    await umbrella.locator('.pc-x').click();
    assert.equal(await line(page, ITEM + 'umbrella').count(), 0);
    assert.deepEqual((await ingRows(page)).map(r => r.name), before);
  } finally { await page.close(); }
});

test('a product the shops already sell runs on its measured rate, with no field', async () => {
  const page = await board(JSON.stringify({[FLORIST]: {[ITEM + 'sodacan']: 500}}));
  try{
    const soda = line(page, ITEM + 'sodacan');
    assert.equal(await soda.count(), 1);
    assert.equal(await soda.locator('[data-pc-rate]').count(), 0);
    assert.equal(await soda.getAttribute('data-pershop'), '30');
    assert.match(await soda.locator('.covers .sub').textContent(), /shops take 840/);  // 30 x 7 days x 4 shops
  } finally { await page.close(); }
});

test('the picker closes on Escape and on a press outside it', async () => {
  const page = await board();
  try{
    await page.click('.pc-add');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#pcPop').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('pc-add')), true);
    await page.click('.pc-add');
    await page.mouse.click(5, 990);
    assert.equal(await page.locator('#pcPop').isVisible(), false);
  } finally { await page.close(); }
});
