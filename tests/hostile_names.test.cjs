// A name out of the save is text, wherever the board prints it. The company
// of tests/save_fixtures.py is renamed by tests/hostile_names_fixture.py: a
// shop, a depot, a factory, a rival's shop, a person, a uniform and a product
// carry markup, an ampersand, "</script>" and "<!--<script". The page is the
// local board, render(data), with the payload inlined, so the names also cross
// the <script> the payload sits in. Every page, every view and each site's own
// page is drawn; no name may grow an element or run a handler, and the names
// read as typed. Synthetic only, never a real save.
// Install Playwright and its Chromium browser to run; NODE_PATH may point at
// an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const PYTHON = process.env.PYTHON || 'python';
const NAMES = JSON.parse(spawnSync(PYTHON, ['-c',
  'import json, sys; sys.path.insert(0, "tests"); import hostile_names_fixture as h; '
  + 'print(json.dumps({k: getattr(h, k) for k in ["SHOP", "GIFTS", "DEPOT", "FACTORY", "PRODUCT", "PERSON", "RIVAL_SHOP", "INGREDIENT"]}))'],
{cwd: root}).stdout.toString());
const base = name => name.replace(/^\[[^\]]*\]\s*/, '');

let browser, html;
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hostile-names-'));
  try {
    const out = path.join(dir, 'board.html');
    const made = spawnSync(PYTHON, [path.join(root, 'tests', 'hostile_names_fixture.py'), out], {cwd: root});
    assert.equal(made.status, 0, made.stderr?.toString());
    html = fs.readFileSync(out, 'utf8');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

async function board(t){
  const context = await browser.newContext({viewport: {width: 1280, height: 1000}});
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await context.route('https://**', route => route.abort());
  await context.route('http://board.test/**', route =>
    route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await page.goto('http://board.test/');
  return page;
}
// Anything a name grew, and whether a handler ran.
const injected = page => page.evaluate(() => ({
  grown: [...document.querySelectorAll('bc-xss, img[src="x"], [onmouseover]')].map(el => {
    const host = el.closest('[id]');
    return `${el.tagName.toLowerCase()} in #${host ? host.id : '?'}`;
  }),
  ran: window.__xss ?? null,
}));
const clean = {grown: [], ran: null};

test('the payload inlined in the page survives "</script>" and "<!--<script" in a name', async t => {
  const page = await board(t);
  assert.equal(await page.evaluate(() => typeof D !== 'undefined' && !!D), true, 'the board has its numbers');
  assert.deepEqual(await page.evaluate(() => D.businesses.map(b => b.name).slice(0, 4)),
    [NAMES.SHOP, NAMES.GIFTS, NAMES.DEPOT, NAMES.FACTORY]);
  assert.match(await page.title(), /^Hostile <bc-xss> & <\/script> Co · Big Copilot$/);
});

test('every page, view and site page prints the names as text', async t => {
  const page = await board(t);
  const seen = {};
  const views = await page.evaluate(() => PAGES.map(p => [p.id, SUBS[p.id] ? SUBS[p.id].items.map(i => i[0]) : [null]]));
  for (const [p, subs] of views) {
    for (const v of subs) {
      await page.evaluate(([p, v]) => { showPage(p); if (v) showSub(p, v); }, [p, v]);
      assert.deepEqual(await injected(page), clean, `${p}${v ? `/${v}` : ''}`);
      seen[`${p}${v ? `/${v}` : ''}`] = await page.evaluate(() =>
        [...document.querySelectorAll('.page')].find(el => !el.hidden).textContent);
    }
  }
  // Supply with every row shown, and the Portfolio's chains unfolded.
  for (const v of ['shops', 'warehouses', 'factories']) {
    await page.evaluate(v => { showPage('supply'); sbWhich = 'all'; showSub('supply', v); drawSupplyTab(v); wireAll(); }, v);
    assert.deepEqual(await injected(page), clean, `supply/${v}, everything`);
  }
  await page.evaluate(() => { showPage('company'); showSub('company', 'results'); });
  await page.$$eval('#secPortfolio tr.chain', rows => rows.forEach(r => r.click()));
  assert.deepEqual(await injected(page), clean, 'chains unfolded');
  // Growth › Demand in each of its views.
  for (const v of ['types', 'mine', 'new']) {
    await page.evaluate(v => { showPage('growth'); showSub('growth', 'market'); marketView = v; showAllMarket = true; drawMarket(); }, v);
    assert.deepEqual(await injected(page), clean, `market ${v}`);
    if (v === 'mine') assert.ok((await page.locator('#market').textContent()).includes(NAMES.PRODUCT), `market ${v} names the product`);
  }
  // Plan a chain for the liquor store, with a machine on each line, so the
  // ingredient table fills in.
  await page.evaluate(() => {
    showPage('growth'); showSub('growth', 'plan'); planType = 'ba:businesstype_liquorstore'; planCounts = {}; drawPlan();
  });
  await page.$$eval('#planBody a[data-d="1"]', links => links.forEach(a => a.click()));
  assert.deepEqual(await injected(page), clean, 'plan a chain');
  // The planner names its lines and inputs from the game's recipe table, not
  // the save, so the names here are the game's; the table is drawn all the same.
  assert.ok(await page.locator('#ingBody tr').count() >= 1, 'the ingredient table is drawn');
  // The factory's line with a recipe the board cannot name: its picker.
  await page.evaluate(() => { showPage('supply'); sbWhich = 'all'; showSub('supply', 'factories'); drawSupplyTab('factories'); wireAll(); });
  assert.deepEqual(await injected(page), clean, 'factory lines');
  assert.ok(await page.locator('#secFactories select.linepick').count() >= 1, 'the picker is drawn');
  // A factory's inputs are named from the recipe table; the depot's lines from the save.
  await page.evaluate(() => { showSub('supply', 'warehouses'); drawSupplyTab('warehouses'); wireAll(); });
  assert.ok((await page.locator('#secWarehouses').textContent()).includes(NAMES.INGREDIENT), 'the depot line is named');
  // Each site's own page: a shop, a second shop, the depot and the factory.
  const sites = await page.evaluate(() => D.businesses.filter(b => b.status !== 'home').map(b => b.key));
  const heads = [];
  for (const key of sites) {
    await page.evaluate(k => openSite(k), key);
    assert.deepEqual(await injected(page), clean, `site ${key}`);
    heads.push(await page.locator('#sitePanel .sitehead h2').innerText());
    seen[key] = await page.locator('#sitePanel').textContent();
  }
  for (const name of [NAMES.SHOP, NAMES.GIFTS, NAMES.DEPOT, NAMES.FACTORY])
    // The heading's first line; the marks after the name (a finding count) wrap under it.
    assert.ok(heads.some(h => h.split('\n')[0].trim() === base(name)), `${base(name)} heads its page: ${heads.join(' | ')}`);

  // The names read as typed where the fixed sinks print them.
  const has = (where, text) => assert.ok(seen[where].includes(text), `${where} shows ${text}`);
  has('today', base(NAMES.SHOP));
  has('company/products', NAMES.PRODUCT);
  has('growth/market', NAMES.PRODUCT);
  has('company/results', NAMES.DEPOT.split(' <img')[0]);
  has(sites[0], NAMES.PRODUCT);
  has(sites[0], NAMES.PERSON);
  // Text made from a slug the game never wrote: the type and street lose their
  // markup in Python, and the number keeps its digits.
  has(sites[1], 'Bc XssGiftshop');
  has(sites[1], '19 Broadway bc-xssstreet');
  // The factory's hood tag, a player's "[...]" prefix, in the goods-flow boxes.
  assert.ok((await page.locator('#flow').textContent()).includes('<bc-xss>'), 'the flow box names the tag');
  assert.deepEqual(await injected(page), clean);
});

test('the search palette lists the names as text', async t => {
  const page = await board(t);
  for (const q of ['Tom', 'Depot', 'Brew', 'Beer', 'Corner']) {
    await page.evaluate(q => ssOpen(q), q);
    assert.ok(await page.locator('#ssPal').isVisible() || await page.locator('#ssInput').isVisible(), 'the palette is open');
    assert.equal(await page.locator('#ssInput').inputValue(), q);
    assert.deepEqual(await injected(page), clean, `search ${q}`);
    await page.evaluate(() => ssClose());
  }
});
