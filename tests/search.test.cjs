// Search the board and Ask the board: the masthead field and its palette (the
// index, its synonyms, the grouping and ranking, the keys, the phone sheet and
// the nothing-found state), the seven questions under Next moves, their fold
// and where they land, and the sphere keeping clear of the field. Install
// Playwright and its Chromium browser to run; NODE_PATH may point at an existing
// Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const {chromium} = require('playwright');

let browser;
let html;
before(async () => {
  const result = spawnSync(process.env.PYTHON || 'python', ['-c',
    'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
  {cwd: path.join(__dirname, '..'), maxBuffer: 16 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8')
    : result.stdout.toString();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

const SHOP = 'ba:street_fifthavenue#57';
const GYM = 'ba:street_secondavenue#2';
const FACTORY = 'ba:street_24thstreet#6';
const DEPOT = 'ba:street_pier#7';

/* A small company, synthetic: a clothing store, a gym, a factory short of one
   input and a depot holding something idle, on Today. `o.storage` false makes
   every storage call throw, as a locked-down browser does. */
async function board(o = {}) {
  const page = await browser.newPage({viewport: {width: o.width || 1440, height: o.height || 1000}, reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.errors = errors;
  if(o.storage === false) await page.addInitScript(() => {
    const no = () => { throw new Error('storage refused'); };
    Object.defineProperty(window, 'localStorage', {configurable: true, get: () => ({getItem: no, setItem: no, removeItem: no})});
  });
  await page.route('https://**', route => route.abort());
  await page.route('https://search.test/', route =>
    route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await page.goto('https://search.test/', {waitUntil: 'load'});
  if(o.data === false) return page;
  await page.evaluate(([SHOP, GYM, FACTORY, DEPOT]) => {
    document.body.classList.add('has-board');
    const site = (key, name, code, status, type, slug, address, hood, revenue) =>
      ({key, name, code, status, type, typeSlug: slug, address, neighbourhood: hood, revenue});
    D = {
      meta: {character: 'search-fixture', day: 40, difficulty: 'Custom',
        houseRules: {label: 'Custom', slot: 0, harder: 2, easier: 0, startingMoney: 0, rules: [
          {name: 'Tax rate', value: 51, normal: 25, unit: '%', lean: 'harder', what: 'the tax on profit'},
          {name: 'Bank interest', value: 1.3, normal: 0.7, unit: '×', lean: 'harder', what: 'interest on loans'}]}},
      kpi: {cash: 50000, debt: 250000},
      loans: [{remaining: 250000}], staff: {total: 42, dailyCost: 5000},
      businesses: [
        site(SHOP, '[LM] Test Clothing', 'LM', 'retail', 'Clothing Store', 'ba:businesstype_clothingstore', '57 Fifth Avenue', 'Lower Manhattan', 9000),
        site(GYM, '[HK] Test Fitness', 'HK', 'retail', 'Gym', 'ba:businesstype_gym', '2 Second Avenue', "Hell's Kitchen", 3000),
        site(FACTORY, 'Test Factory', 'IC', 'support', 'Factory', null, '6 24th Street', 'Industry City', 0),
        site(DEPOT, 'Test Depot', 'GD', 'overhead', 'Warehouse', null, '7 Pier', 'Garment District', 0),
      ],
      products: [
        {item: 'Gym Cover Charge', revenue: 3000, units: 300, stores: 1},
        {item: 'Fabric (Expensive)', revenue: 0, units: 0, stores: 0},
      ],
      supply: {day: 40, shops: [], imports: [], idleWeeks: 3,
        idle: [{s: 3, item: 'Energy Drink', slug: 'ba:itemname_energydrink', stock: 4000}],
        factories: {sites: [{s: 2, machines: 2, unnamed: [], known: true,
          needs: [{item: 'Fabric (Expensive)', slug: 'ba:itemname_fabricexpensive', perDay: 1000, lines: []}],
          arrivals: {'ba:itemname_fabricexpensive': 600},
          lines: [{item: 'Clothing (Classic Expensive Female)'}]}]}},
      alerts: [{group: 'feed', level: 'warn', site: 'Test Factory', siteKey: FACTORY, id: 'feed-1',
        text: 'Fabric (Expensive) arrives at 600/day against 1,000 needed', worth: null, unit: ''}],
      minor: {rows: [{group: 'idlestaff', level: 'info', site: '[LM] Test Clothing', siteKey: SHOP, id: 'idle-1',
        text: 'Test Clothing runs 40 staff-hours a week that buy nothing', worth: 100, unit: '/day wages'}]},
      premises: {buildings: [], demand: {
        "Hell's Kitchen": [{slug: 'ba:businesstype_gym', type: 'Gym', demand: 80, category: 'retail'}],
        'Midtown': [{slug: 'ba:businesstype_gym', type: 'Gym', demand: 60, category: 'retail'},
                    {slug: 'ba:businesstype_lawfirm', type: 'Law Firm', demand: 70, category: 'office'}]}},
      goals: {typesRun: 2, typesTotal: 24, buildingsOwned: 0, buildingsTotal: 885, rivalsDefeated: 0, rivalsTotal: 4,
        completed: 3, goalsDone: 3, goalsTotal: null, diplomas: 1, diplomasTotal: 5, goodsProduced: 1200, taxesPaid: 0},
      chains: [], daily: [], hours: [], hourFindings: [], trends: [], homes: [], staffing: [],
    };
    Object.assign(alertGroupPrefs, {idlestaff: false});
    /* The fixture's sites are too thin for the panel and the portfolio to draw;
       where a search lands is what is under test, not those draws. */
    drawChart = () => {}; drawSite = () => {}; drawPortfolio = () => {};
    showPage('today', false, 'replace');
    drawGoals();
  }, [SHOP, GYM, FACTORY, DEPOT]);
  return page;
}
const typed = async (page, text) => { await page.fill('#ssInput', text); };
const groups = page => page.$$eval('#ssRes .ss-grp', gs => gs.map(g => g.getAttribute('aria-label')));
const lit = page => page.$eval('#ssRes .on', el => el.querySelector('.t') ? el.querySelector('.t').textContent : el.textContent);

// --- the index -----------------------------------------------------------------

test('the index holds every group, read from the page, with the words players use', async () => {
  const page = await board();
  try {
    const index = await page.evaluate(() => ssBuild().map(e => ({id: e.id, g: e.g, t: e.t, p: e.p, syn: e.syn,
      tag: e.tag, dot: e.dot, hood: e.hood, map: e.map})));
    const by = id => index.find(e => e.id === id);
    // Pages and views, synonyms included.
    assert.ok(by('view:staffing').syn.includes('hire'));
    assert.ok(by('view:cash').syn.includes('debt'));
    assert.equal(by('view:cash').p, 'Today · $250k owed on loans');
    assert.ok(by('view:milestones').syn.includes('difficulty'));
    assert.ok(by('view:portfolio').syn.includes('break even'));
    // A Supply check is named as its view is.
    assert.equal(by('view:feed').t, 'Feed the factories');
    assert.equal(by('view:feed').dot, 'watch');
    // Sites: the short name, the neighbourhood tag, a map key and the worst finding.
    assert.equal(by(`site:${SHOP}`).t, 'Test Clothing');
    assert.equal(by(`site:${SHOP}`).hood, 'LM');
    assert.equal(by(`site:${SHOP}`).map, SHOP);
    assert.equal(by(`site:${FACTORY}`).dot, 'watch');
    assert.match(by(`site:${FACTORY}`).p, /eats Fabric \(Expensive\)$/);
    // Products: an input first, what sells, what a line makes, what sits idle.
    assert.equal(by('product:Fabric (Expensive)').p, 'Input · Test Factory eats 1,000/day · 600 arrive');
    assert.equal(by('product:Fabric (Expensive)').dot, 'watch');
    assert.equal(by('product:Gym Cover Charge').p, 'Sold in 1 store · 300 a day · $3k');
    assert.equal(by('product:Clothing (Classic Expensive Female)').p, 'Made in Test Factory');
    assert.equal(by('product:Energy Drink').p, '4,000 idle at Test Depot');
    // Finding kinds carry their live count, and say when they are switched off.
    assert.equal(by('kind:feed').tag, '1 today');
    assert.equal(by('kind:idlestaff').tag, 'switched off · 1');
    assert.equal(by('kind:idlestaff').dot, 'off');
    assert.ok(by('kind:jobdemand').syn.includes('hire'));
    // Find-a-location presets: the neighbourhood that wants the type most.
    assert.equal(by('finder:ba:businesstype_gym').t, 'Open a Gym');
    assert.equal(by('finder:ba:businesstype_gym').p, "best fit: Hell's Kitchen · demand 80");
    assert.equal(by('finder:ba:businesstype_lawfirm').t, 'Open a Law Firm');
    assert.ok(by('finder:warehouse'));
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('the wiki joins the index once its file is in, with its synonyms', async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await typed(page, 'headhunter');
    await page.waitForSelector('#ssRes .ss-grp[aria-label="Wiki"]');
    await typed(page, 'hire');
    await page.waitForSelector('#ssRes .ss-grp[aria-label="Wiki"] .ss-syn');
    const wiki = await page.$$eval('#ssRes .ss-grp[aria-label="Wiki"] .t', ts => ts.map(t => t.textContent));
    assert.ok(wiki.some(t => /^Headhunter/.test(t)), wiki.join(' | '));
    assert.ok((await page.evaluate(() => ssIndex.filter(e => e.g === 'wiki').length)) > 800);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

// --- grouping and ranking --------------------------------------------------------

test('groups come best first; your sites lead a tie and the wiki waits', async () => {
  const page = await board({data: false});
  try {
    const order = await page.evaluate(() => {
      const e = (g, t, p = '', syn = []) => ssEntry({id: `${g}:${t}`, g, t, p, ic: 'wiki', syn, go(){}});
      const index = [e('views', 'Gift planner'), e('sites', 'Gift Shop'), e('wiki', 'Gift Shop'),
                     e('views', 'Shop gifts'), e('wiki', 'Gifts overview')];
      return {
        // Both start with "gift": sites (+10) beat views, the wiki (-15) is last.
        tie: ssSearch('gift', index).map(g => g.g),
        // A word start in the views (85) against a title start in the wiki (100 - 15): views first.
        word: ssSearch('shop', [e('views', 'Gift shop'), e('wiki', 'Shop fittings')]).map(g => g.g),
        // The same query through a synonym ranks between a title start and a mere contains.
        syn: ssSearch('hire', [e('views', 'Staffing', '', ['hire']), e('views', 'Chairs to hire')])
          .flatMap(g => g.hits.map(h => [h.e.t, h.s, h.where])),
        more: (() => { const r = ssSearch('a', Array.from({length: 6}, (_, i) => e('views', `A${i}`)), 4); return [r[0].hits.length, r[0].n]; })(),
      };
    });
    assert.deepEqual(order.tie, ['sites', 'views', 'wiki']);
    assert.deepEqual(order.word, ['views', 'wiki']);
    assert.deepEqual(order.syn, [['Chairs to hire', 85, 't'], ['Staffing', 70, 'syn']]);
    assert.deepEqual(order.more, [4, 6]);
  } finally { await page.close(); }
});

test('a synonym says so beside the real name, and "break even" says there is no such figure yet', async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await typed(page, 'hire');
    const first = await page.$eval('#ssRes .ss-row.on', el => [el.querySelector('.t').textContent, el.querySelector('.ss-syn').textContent]);
    assert.equal(first[0], 'Staffing≈ hire');
    assert.equal((await groups(page))[0], 'Pages & views');
    await typed(page, 'break even');
    const row = page.locator('#ssRes .ss-row', {hasText: 'Portfolio'}).first();
    assert.match(await row.locator('.p').innerText(), /^no break-even figure yet/);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

// --- the keys --------------------------------------------------------------------

test('/ and Ctrl+K open the palette, / never while typing, and the arrows, Enter and Esc drive it', async () => {
  const page = await board();
  try {
    // / typed into a field stays in the field.
    await page.evaluate(() => { const i = document.createElement('input'); i.id = 'probe'; document.body.appendChild(i); });
    await page.focus('#probe');
    await page.keyboard.press('/');
    assert.equal(await page.locator('#ssPal').isHidden(), true);
    assert.equal(await page.inputValue('#probe'), '/');
    // Ctrl+K works from a field, and again closes.
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#ssPal').isVisible(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ssInput');
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#ssPal').isHidden(), true);
    await page.evaluate(() => document.activeElement.blur());
    // /, then the empty state: the seven questions, the first one lit.
    await page.keyboard.press('/');
    assert.equal(await page.locator('#ssPal').isVisible(), true);
    assert.equal(await page.locator('#ssRes .ss-q2').count(), 7);
    assert.equal(await lit(page), 'Why did profit move?');
    // Typing lights the best row; the arrows move it and the input names it.
    await page.keyboard.type('test');
    const first = await lit(page);
    await page.keyboard.press('ArrowDown');
    const second = await lit(page);
    assert.notEqual(first, second);
    const active = await page.$eval('#ssInput', i => i.getAttribute('aria-activedescendant'));
    assert.equal(await page.$eval(`#${active}`, el => el.classList.contains('on')), true);
    await page.keyboard.press('ArrowUp');
    assert.equal(await lit(page), first);
    // Esc closes and hands focus back.
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#ssPal').isHidden(), true);
    assert.equal(await page.evaluate(() => document.body.classList.contains('ss-open')), false);
    // Enter opens the lit site and remembers it for next time.
    await page.keyboard.press('/');
    await page.keyboard.type('fitness');
    assert.equal(await lit(page), 'Test Fitness');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#ssPal').isHidden(), true);
    assert.deepEqual(await page.evaluate(() => [page, siteOpen, siteKey]), ['company', true, GYM]);
    await page.keyboard.press('/');
    const recent = page.locator('#ssRes .ss-grp[aria-label="Where you were"] .t');
    assert.deepEqual(await recent.allInnerTexts(), ['Test Fitness']);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('"n more" opens the rest of a group and lights the first row it had kept back', async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await typed(page, 'gym');
    await page.waitForSelector('#ssRes .ss-grp[aria-label="Wiki"] .ss-more');
    const before = await page.locator('#ssRes .ss-grp[aria-label="Wiki"] .ss-row').count();
    assert.equal(before, 4);
    await page.click('#ssRes .ss-grp[aria-label="Wiki"] .ss-more');
    const after = await page.locator('#ssRes .ss-grp[aria-label="Wiki"] .ss-row').count();
    assert.ok(after > before);
    assert.equal(await page.locator('#ssRes .ss-grp[aria-label="Wiki"] .ss-row').nth(4).evaluate(el => el.classList.contains('on')), true);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

// --- nothing found -----------------------------------------------------------------

test('nothing found: the sphere looks, a near word is offered, and the questions stay', async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await typed(page, 'zeppelin');
    assert.equal(await page.locator('#ssRes .ss-none').isVisible(), true);
    assert.equal(await page.locator('#ssCount').innerText(), '0 found');
    assert.match(await page.locator('#ssRes .ss-none p').innerText(), /Nothing on the board or in the wiki is called zeppelin/);
    assert.equal(await page.locator('#ssRes .ss-q2').count(), 7);
    assert.equal(await page.locator('#ssRes .on').count(), 0);
    // Enter with nothing lit does nothing.
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#ssPal').isVisible(), true);
    await typed(page, 'fitmess');
    await page.click('#ssRes .ss-chip[data-near]');
    assert.equal(await page.inputValue('#ssInput'), 'fitness');
    assert.equal(await lit(page), 'Test Fitness');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

// --- the phone -----------------------------------------------------------------------

test('on a phone the masthead has the icon, and the palette is the whole screen, three a group', async () => {
  const page = await board({width: 390, height: 844});
  try {
    assert.equal(await page.locator('#ssField').isHidden(), true);
    assert.equal(await page.locator('#ssFieldBtn').isVisible(), true);
    await page.click('#ssFieldBtn');
    const box = await page.locator('#ssPal').boundingBox();
    assert.deepEqual([box.x, box.y, box.width, box.height], [0, 0, 390, 844]);
    assert.equal(await page.locator('#ssPal .ss-cancel').isVisible(), true);
    await typed(page, 'gym');
    await page.waitForSelector('#ssRes .ss-grp[aria-label="Wiki"]');
    assert.equal(await page.locator('#ssRes .ss-grp[aria-label="Wiki"] .ss-row').count(), 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.click('#ssPal .ss-cancel');
    assert.equal(await page.locator('#ssPal').isHidden(), true);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

// --- Ask the board ---------------------------------------------------------------------

test('a question lands on its answer, lit, and the row folds into a button after first use', async () => {
  const page = await board();
  try {
    assert.equal(await page.locator('#ssAsk').isVisible(), true);
    assert.equal(await page.locator('#ssAsk .ss-aq').count(), 7);
    assert.equal(await page.locator('#ssAskMini').isHidden(), true);
    await page.click('#ssAsk .ss-aq[data-ask="playing"]');
    assert.equal(await page.evaluate(() => page), 'company');
    const strip = page.locator('#pageCompany .ss-asked');
    assert.match(await strip.innerText(), /What am I playing on\?/);
    assert.match(await strip.innerText(), /Back to Today/);
    assert.equal(await page.locator('#secGoals .rules').evaluate(el => el.classList.contains('ss-lit')), true);
    assert.equal(await page.locator('#secGoals .miles').evaluate(el => el.classList.contains('ss-dim')), true);
    assert.equal(await page.locator('#secGoals .sechead').evaluate(el => el.classList.contains('ss-dim')), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('ba_dash_ask_used')), '1');
    // Back to Today: the strip and the lighting go, and the row has folded.
    await strip.locator('[data-ss="back"]').click();
    assert.equal(await page.evaluate(() => page), 'today');
    assert.equal(await page.locator('.ss-asked').count(), 0);
    assert.equal(await page.locator('.ss-lit, .ss-dim').count(), 0);
    assert.equal(await page.locator('#ssAsk').isHidden(), true);
    assert.equal(await page.locator('#ssAskMini').isVisible(), true);
    // The folded button opens search on its empty state, which holds the same questions.
    await page.click('#ssAskMini button');
    assert.equal(await page.locator('#ssRes .ss-q2').count(), 7);
    // Asked from the palette, the next navigation clears the landing.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await lit(page), 'Is my factory fed?');
    await page.keyboard.press('Escape');
    await page.click('#ssAskMini button');
    await page.click('#ssRes .ss-q2 >> text=What should I import this week?');
    assert.equal(await page.evaluate(() => [page, $('orderChecklist').open]).then(x => x.join()), 'supply,true');
    assert.equal(await page.locator('#orderChecklist').evaluate(el => el.classList.contains('ss-lit')), true);
    await page.click('#nav a[data-id="growth"]');
    await page.waitForFunction(() => !document.querySelector('.ss-asked'));
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('with storage refused, the questions and the palette still work and nothing throws', async () => {
  const page = await board({storage: false});
  try {
    await page.click('#ssAsk .ss-aq[data-ask="playing"]');
    assert.equal(await page.locator('#secGoals .rules').evaluate(el => el.classList.contains('ss-lit')), true);
    await page.click('#nav a[data-id="today"]');
    // Nothing could be remembered, so the row is still there.
    assert.equal(await page.locator('#ssAsk').isVisible(), true);
    await page.keyboard.press('/');
    await typed(page, 'fitness');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => siteKey), GYM);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

// --- the masthead ------------------------------------------------------------------------

test('the sphere rests between the nav and the field, and the field steps down before it would crowd it', async () => {
  const page = await board({data: false, width: 1440});
  try {
    await page.evaluate(() => { $('title').textContent = 'Big Copilot'; wireSphere(); });
    await page.locator('#orb.live').waitFor();
    await page.waitForTimeout(700);  // under reduced motion an entrance ends at its 400 ms mark
    const [orb, field, nav] = await page.evaluate(() => ['orb', 'ssField', 'nav'].map(id => {
      const r = document.getElementById(id).getBoundingClientRect(); return {left: r.left, right: r.right, w: r.width};
    }));
    assert.ok(orb.left >= nav.right, `the ball ${orb.left} starts after the nav ${nav.right}`);
    assert.ok(orb.right <= field.left, `the ball ${orb.right} ends before the field ${field.left}`);
    // However many balls roll out, none rests under the field.
    await page.click('.wordmark');
    await page.waitForTimeout(300);
    await page.click('.wordmark');
    await page.waitForTimeout(300);
    const right = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.orb')].map(o => o.getBoundingClientRect().right)));
    assert.ok(right <= (await page.locator('#ssField').boundingBox()).x + 1);
    // Narrower, the field gives way to its icon rather than to the ball.
    await page.setViewportSize({width: 1180, height: 1000});
    await page.waitForFunction(() => $('mast').classList.contains('ss-tight'));
    assert.equal(await page.locator('#ssFieldBtn').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1180);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
