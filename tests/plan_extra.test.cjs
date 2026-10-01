// Plan a factory's Add product (issue #162): a type's other products are one
// click from a line; an added product the shops do not all sell runs on a
// per-shop rate the player can type, and its raw material joins Ingredients.
// Browser regressions: install Playwright and its Chromium browser to run.
// NODE_PATH may point at an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const FLORIST = 'ba:businesstype_florist', GIFT = 'ba:businesstype_giftshop', ITEM = 'ba:itemname_';
const KEY = 'ba_plan_extra_v1:plan-fixture';
let browser, html, plan;

/* The real _plan() over a synthetic save: four florists that sell both
   flowers at 150 a shop a day and energy drinks at 20; one of them also
   trials soda at 30. */
function planData(){
  const code = 'import sys, json; sys.path.insert(0, "tests")\n'
    + 'from test_plan_regressions import PlannerRegressions\n'
    + 'PlannerRegressions.setUpClass(); t = PlannerRegressions()\n'
    + 'shop = lambda soda: {"status": "retail", "revenue": 1000, "typeSlug": "' + FLORIST + '", "lines": ['
    + '{"slug": "' + ITEM + 'cheapflower", "price": 25, "rate": 150}, {"slug": "' + ITEM + 'expensiveflower", "price": 40, "rate": 150},'
    + ' {"slug": "' + ITEM + 'energydrink", "price": 4, "rate": 20}]'
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

async function board(saved, viewport = {width: 1280, height: 1000}){
  const page = await browser.newPage({viewport});
  await page.route('https://**', route => route.abort());
  await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
  await page.goto('http://board.test/');
  await page.evaluate(([plan, saved, key]) => {
    localStorage.clear();
    if(saved) localStorage.setItem(key, saved);
    D = {meta: {character: 'plan-fixture', save: 'Fixture', day: 10}, businesses: [],
      supply: {shops: [], idle: [], imports: [], factories: {sites: [], depots: {}, depotOther: {}}}, plan};
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageGrowth'; });
    document.querySelectorAll('#pageGrowth section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    planType = 'ba:businesstype_florist'; planCounts = {}; planExtra = null;
    drawPlan(); wirePlan();
  }, [plan, saved || null, KEY]);
  return page;
}
const ingRows = page => page.$$eval('#ingBody tr', rows => rows.map(tr => ({
  name: tr.dataset.name, by: tr.cells[1].textContent.trim(), week: tr.querySelector('.wk').textContent})));
const line = (page, slug) => page.locator(`#planBody tr.line[data-slug="${slug}"]`);
const added = slugs => JSON.stringify({[FLORIST]: Object.fromEntries(slugs.map(s => [ITEM + s, null]))});

test('the catalogue offers what a Florist can additionally sell, heaviest first', () => {
  const extra = plan.catalogue[FLORIST].extra;
  assert.deepEqual(extra.map(([slug]) => slug.replace(ITEM, '')),
    ['sodacan', 'energydrink', 'umbrella', 'cheapgift', 'expensivegift']);
  assert.equal(plan.own[FLORIST].perDay[ITEM + 'sodacan'], 30);
  assert.deepEqual(plan.own[FLORIST].sellers, {[ITEM + 'sodacan']: 1, [ITEM + 'energydrink']: 4});
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
    assert.match(await pop.locator('.pc-pop-h b').textContent(), /^Florist also sells$/i);
    assert.match(await pop.locator('[data-pc-pick$="umbrella"]').textContent(), /75%/);
    await pop.locator('[data-pc-pick$="umbrella"]').click();
    assert.equal(await pop.isVisible(), false);

    const umbrella = line(page, ITEM + 'umbrella');
    assert.equal(await umbrella.count(), 1);
    assert.match(await page.locator('.pc-add').textContent(), /4 more/);
    // No shop sells umbrellas: the rate is the player's, starting at 150 x 75%, to the ten.
    const field = umbrella.locator('[data-pc-rate]');
    assert.equal(await field.inputValue(), '110');
    assert.match(await umbrella.locator('.pc-rate').textContent(), /your estimate/);

    // Its raw material is new to the order, used by the umbrella alone.
    const fresh = (await ingRows(page)).filter(r => !before.includes(r.name));
    assert.ok(fresh.length >= 1, 'the umbrella brings raw material of its own');
    const umbrellaName = await umbrella.getAttribute('data-name');
    fresh.forEach(r => assert.equal(r.by, umbrellaName));

    // Typing a rate reworks its Supplies cell and keeps the caret in the field.
    await field.fill('40');
    assert.match(await umbrella.locator('.covers .sub').textContent(), /shops take 1,120/);  // 40 x 7 days x 4 shops
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.pcRate), ITEM + 'umbrella');
    assert.deepEqual(JSON.parse(await page.evaluate(key => localStorage.getItem(key), KEY)), {[FLORIST]: {[ITEM + 'umbrella']: 40}});
    // The Made tile sums each line's own take: two flowers at 4,200 and the umbrella at 1,120.
    assert.match(await page.getAttribute('#vMadeTile', 'data-tip'), /^The shops take 9,520 units a week/);

    // A main line still sells at the type's own rate.
    assert.match(await line(page, ITEM + 'cheapflower').locator('.covers .sub').textContent(), /shops take 4,200/);

    // × takes the line out, and its raw material with it.
    await umbrella.locator('.pc-x').click();
    assert.equal(await line(page, ITEM + 'umbrella').count(), 0);
    assert.deepEqual((await ingRows(page)).map(r => r.name), before);
  } finally { await page.close(); }
});

test('a product every shop sells runs on its measured rate, with no field', async () => {
  const page = await board(added(['energydrink']));
  try{
    const drink = line(page, ITEM + 'energydrink');
    assert.equal(await drink.count(), 1);
    assert.equal(await drink.locator('[data-pc-rate]').count(), 0);
    assert.equal(await drink.getAttribute('data-pershop'), '20');
    assert.match(await drink.locator('.covers .sub').textContent(), /shops take 560/);  // 20 x 7 days x 4 shops
  } finally { await page.close(); }
});

test('a product only some shops trial is spread over all of them, and stays the player\'s to type', async () => {
  const page = await board(added(['sodacan']));
  try{
    const soda = line(page, ITEM + 'sodacan');
    // One of four sells 30 a day: 30 / 4 a shop, rounded.
    assert.equal(await soda.locator('[data-pc-rate]').inputValue(), '8');
    assert.match(await soda.locator('.pc-rate em').getAttribute('data-tip'), /^1 of your 4 Florist shops sell this/);
    assert.match(await soda.locator('.covers .sub').textContent(), /shops take 224/);  // 8 x 7 x 4
    await soda.locator('[data-pc-rate]').fill('25');
    assert.match(await soda.locator('.covers .sub').textContent(), /shops take 700/);
  } finally { await page.close(); }
});

test('a typed rate is restored from storage, and survives a type switch and a live redraw', async () => {
  const page = await board(JSON.stringify({[FLORIST]: {[ITEM + 'umbrella']: 40}}));
  try{
    assert.equal(await line(page, ITEM + 'umbrella').locator('[data-pc-rate]').inputValue(), '40');
    await page.evaluate(gift => { planType = gift; planCounts = {}; drawPlan(); }, GIFT);
    assert.equal(await line(page, ITEM + 'umbrella').locator('[data-pc-rate]').count(), 0);
    await page.evaluate(f => { planType = f; planCounts = {}; drawPlan(); }, FLORIST);
    const field = line(page, ITEM + 'umbrella').locator('[data-pc-rate]');
    assert.equal(await field.inputValue(), '40');
    // Focus and caret come back after a redraw replaced the field.
    await field.click();
    await page.evaluate(() => { const el = document.querySelector('[data-pc-rate]'); el.setSelectionRange(1, 1); drawPlan(); });
    assert.deepEqual(await page.evaluate(() => {
      const a = document.activeElement;
      return [a && a.dataset.pcRate, a && a.selectionStart];
    }), [ITEM + 'umbrella', 1]);
  } finally { await page.close(); }
});

test('the Add product row goes once everything is added', async () => {
  const page = await board(added(['sodacan', 'energydrink', 'umbrella', 'cheapgift']));
  try{
    await page.click('.pc-add');
    await page.locator('#pcPop [data-pc-pick$="expensivegift"]').click();
    assert.equal(await page.locator('.pc-add').count(), 0);
    // Focus stays with the range: the new line's remove button.
    assert.equal(await page.evaluate(() => document.activeElement.dataset.pcX), ITEM + 'expensivegift');
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

test('in a short window the picker stays inside it and its list scrolls', async () => {
  const page = await board(null, {width: 1280, height: 420});
  try{
    // The button in the middle of the window: no room for the whole list below or above.
    await page.evaluate(() => {
      const b = document.querySelector('.pc-add');
      window.scrollBy(0, b.getBoundingClientRect().top - 194);
    });
    await page.click('.pc-add');
    const box = await page.locator('#pcPop').boundingBox();
    assert.ok(box.y >= 12 && box.y + box.height <= 420 - 12 + 1, JSON.stringify(box));
    assert.ok(await page.evaluate(() => { const p = document.getElementById('pcPop'); return p.scrollHeight > p.clientHeight; }));
  } finally { await page.close(); }
});
