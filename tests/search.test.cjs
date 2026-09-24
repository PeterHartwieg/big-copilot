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
      chains: [], daily: [], hours: [], hourFindings: [], trends: [], homes: [], staffing: [], market: {rows: []},
    };
    Object.assign(alertGroupPrefs, {idlestaff: false});
    /* The fixture's sites are too thin for the panel and the portfolio to draw;
       where a search lands is what is under test, not those draws. The panel
       is a head and two blocks, enough to land on. */
    drawChart = () => {}; drawPortfolio = () => {};
    drawSite = () => {
      $('secDetail').hidden = !siteOpen;
      $('sitePanel').innerHTML = siteOpen ? `<div class="sitehead"><h2>${siteKey}</h2><aside class="seg" id="sitePick"></aside></div>`
        + '<section class="sec" data-block="crew" id="sp-crew">crew</section>'
        + '<section class="sec" data-block="roster" id="sp-roster"><span class="seg" id="probeDays">'
        + '<a href="#" class="on">MON</a><a href="#">TUE</a></span>'
        + '<button type="button" id="probePlan">Demand plan</button></section>' : '';
      /* The plan pick redraws the roster block, as the real one does. */
      drawSitePicker();
      const pick = $('probePlan');
      if(pick) pick.onclick = () => { $('sp-roster').outerHTML = '<section class="sec" data-block="roster" id="sp-roster">plan</section>'; };
    };
    $('optimizeStaffingCard').dataset.site = SHOP;
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
    // The game's settings are the difficulty chip now (R15), not Milestones.
    assert.ok(by('view:difficulty').syn.includes('house rules'));
    assert.equal(by('view:difficulty').p, 'Custom · every setting against Normal');
    assert.ok(!by('view:milestones').syn.includes('settings'));
    // Weekly rhythm is By weekday in the Daily result chart.
    assert.equal(by('view:rhythm').t, 'By weekday');
    assert.ok(by('view:rhythm').syn.includes('weekly rhythm'));
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
    await page.click('#ssAsk .ss-aq[data-ask="hire"]');
    assert.equal(await page.evaluate(() => page), 'company');
    const strip = page.locator('#pageCompany .ss-asked');
    assert.match(await strip.innerText(), /Whom should I hire\?/);
    assert.match(await strip.innerText(), /Back to Today/);
    assert.equal(await page.locator('#sp-roster').evaluate(el => el.classList.contains('ss-lit')), true);
    assert.equal(await page.locator('#sp-crew').evaluate(el => el.classList.contains('ss-dim')), true);
    assert.equal(await page.locator('#sitePanel .sitehead').evaluate(el => el.classList.contains('ss-dim')), false);
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
    await page.click('#ssAsk .ss-aq[data-ask="import"]');
    assert.equal(await page.locator('#orderChecklist').evaluate(el => el.classList.contains('ss-lit')), true);
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

// --- review round 1 -------------------------------------------------------------------

test('a live refresh while the palette is open re-reads the board, and keeps the lit row', async () => {
  const page = await board();
  try {
    // renderAll() is where a refresh, or another save, arrives.
    const source = fs.readFileSync(path.join(__dirname, '..', 'ba_dashboard.py'), 'utf8');
    const body = source.slice(source.indexOf('function renderAll(){'), source.indexOf('/* --- pages ---'));
    assert.match(body, /ssDataChanged\(\);\s*ssCheckLanding\(\);/);
    await page.keyboard.press('/');
    await typed(page, 'test');
    await page.keyboard.press('ArrowDown');
    assert.equal(await lit(page), 'Test Fitness');
    await page.evaluate(() => {
      D = {...D, businesses: [...D.businesses.slice(1), {key: 'ba:street_broadway#9', name: 'Test Florist', code: 'MT',
        status: 'retail', type: 'Florist', typeSlug: 'ba:businesstype_florist', address: '9 Broadway', neighbourhood: 'Midtown'}]};
      ssDataChanged();
    });
    const titles = await page.$$eval('#ssRes .ss-grp[aria-label="Sites"] .t', ts => ts.map(t => t.textContent));
    assert.ok(titles.includes('Test Florist'), titles.join('|'));
    assert.ok(!titles.includes('Test Clothing'), titles.join('|'));
    assert.equal(await lit(page), 'Test Fitness');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('"Are my prices right?" lands on the wiki guide every time it is asked', async () => {
  const page = await board();
  try {
    for (const round of [1, 2]) {
      await page.evaluate(() => ssAsk('prices'));
      await page.waitForFunction(() => document.querySelector('#pageWiki .ss-asked'), null, {timeout: 5000});
      assert.equal(await page.evaluate(() => page), 'wiki', `round ${round}`);
      assert.equal(await page.locator('#wk-prices').evaluate(el => el.classList.contains('ss-lit')), true, `round ${round}`);
      assert.equal(await page.locator('.ss-asked').count(), 1, `round ${round}`);
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.ss-asked').count(), 1, `round ${round}: nothing clears it`);
      await page.click('#nav a[data-id="today"]');
      await page.waitForFunction(() => !document.querySelector('.ss-asked'));
    }
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('"Why did profit move?" and "Whom should I hire?" light a block whose tag is not clipped', async () => {
  const page = await board();
  try {
    await page.click('#ssAsk .ss-aq[data-ask="profit"]');
    assert.equal(await page.evaluate(() => [page, view, VIEWS.pnl.cols[sortKey][0], sortDir].join()), 'company,pnl,Wk / wk,-1');
    const port = page.locator('#secPortfolio');
    assert.equal(await port.evaluate(el => el.classList.contains('ss-lit')), true);
    // Nothing between the tag and the page scrolls or clips.
    assert.equal(await port.evaluate(el => getComputedStyle(el).overflowX), 'visible');
    assert.equal(await port.evaluate(el => getComputedStyle(el).contentVisibility), 'visible');
    assert.equal(await page.locator('#secDaily').evaluate(el => el.classList.contains('ss-dim')), true);
    assert.equal(await page.locator('#pageCompany .ss-asked + #secPortfolio').count(), 1);
    await page.click('#nav a[data-id="today"]');
    await page.click('#ssAskMini button');
    await page.click('#ssRes .ss-q2 >> text=Whom should I hire?');
    assert.deepEqual(await page.evaluate(() => [page, siteOpen, siteKey]), ['company', true, SHOP]);
    assert.equal(await page.locator('#sp-roster').evaluate(el => el.classList.contains('ss-lit')), true);
    assert.equal(await page.locator('#sp-crew').evaluate(el => el.classList.contains('ss-dim')), true);
    assert.equal(await page.locator('#sitePanel .sitehead').evaluate(el => el.classList.contains('ss-dim')), false);
    assert.match(await page.locator('.ss-asked').innerText(), /Staffing on \[LM\] Test Clothing/);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('a landing still waiting for its page is dropped when the reader goes elsewhere', async () => {
  const page = await board();
  try {
    // Away before the wiki page opens; the landing used to wait its full four
    // seconds for the guide and then put the strip on whatever page was up.
    await page.evaluate(() => { ssAsk('prices'); showPage('supply'); });
    await page.waitForTimeout(4600);
    assert.equal(await page.evaluate(() => page), 'supply');
    assert.equal(await page.locator('.ss-asked').count(), 0);
    assert.equal(await page.locator('.ss-lit').count(), 0);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('a resting pointer never takes the light from the keys', async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await typed(page, 'test');
    // Rest the pointer on the third row, then let the rows be redrawn under it.
    const third = await page.locator('#ssRes .ss-row').nth(2).boundingBox();
    await page.mouse.move(third.x + 40, third.y + 10);
    await typed(page, 'tes');
    await typed(page, 'test');
    await page.evaluate(() => { ssRes.scrollTop = 1; ssRes.scrollTop = 0; });
    await page.waitForTimeout(100);
    assert.equal(await lit(page), 'Test Clothing');
    await page.keyboard.press('ArrowDown');
    assert.equal(await lit(page), 'Test Fitness');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => siteKey), GYM);
    // A pointer that really moves does light the row under it.
    await page.keyboard.press('/');
    await typed(page, 'test');
    const row = await page.locator('#ssRes .ss-row').nth(2).boundingBox();
    await page.mouse.move(row.x + 30, row.y + 10);
    await page.mouse.move(row.x + 40, row.y + 12);
    assert.equal(await page.locator('#ssRes .ss-row').nth(2).evaluate(el => el.classList.contains('on')), true);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('an input method keeps its own Enter and arrows', async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await typed(page, 'test');
    const moved = await page.evaluate(() => {
      const key = (key, o) => ssInput.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...o}));
      key('ArrowDown', {isComposing: true});
      key('ArrowDown', {keyCode: 229});
      key('Enter', {isComposing: true});
      return document.querySelector('#ssRes .on .t').textContent;
    });
    assert.equal(moved, 'Test Clothing');
    assert.equal(await page.locator('#ssPal').isVisible(), true);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('neighbourhoods match by word, and the line shows the neighbourhood that matched', async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await typed(page, 'kitchen');
    const row = page.locator('#ssRes .ss-grp[aria-label="Sites"] .ss-row').first();
    assert.equal(await row.locator('.t').innerText(), 'Test Fitness');
    assert.equal(await row.locator('.p').innerText(), "Gym · 2 Second Avenue · Hell's Kitchen");
    assert.equal(await row.locator('.p mark').innerText(), 'Kitchen');
    // A match is marked where the word starts, not where the letters first occur.
    assert.equal(await page.evaluate(() => ssMark('Unpaid pay', 'pa', true)), 'Unpaid <mark>pa</mark>y');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('Esc on a palette button stays in the palette, / closes the kinds panel, and Ctrl+K reads the K key on any layout', async () => {
  const page = await board();
  try {
    await page.evaluate(() => { window.__escapes = 0; document.addEventListener('keydown', e => { if(e.key === 'Escape') window.__escapes++; }); });
    await page.keyboard.press('/');
    await typed(page, 'zeppelin');
    await page.focus('#ssRes .ss-chip[data-wiki]');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#ssPal').isHidden(), true);
    assert.equal(await page.evaluate(() => window.__escapes), 0);
    await page.evaluate(() => openKindsPanel(q(KINDS_TOGGLE)));
    assert.equal(await page.locator('#alertPop').evaluate(el => el.classList.contains('on')), true);
    await page.evaluate(() => ssOpen());
    assert.equal(await page.locator('#alertPop').evaluate(el => el.classList.contains('on')), false);
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'л', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true})));
    assert.equal(await page.locator('#ssPal').isVisible(), true);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('Shift+Enter shows a site on the map over the palette, whose keys wait for it', async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await typed(page, 'fitness');
    await page.keyboard.press('Shift+Enter');
    assert.equal(await page.locator('#locationMapDialog').evaluate(d => d.open), true);
    assert.equal(await page.locator('#ssPal').isVisible(), true);
    // Ctrl+K under the map leaves both alone.
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#ssPal').isVisible(), true);
    assert.equal(await page.locator('#locationMapDialog').evaluate(d => d.open), true);
    await page.evaluate(() => $('locationMapDialog').close());
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'ssInput');
    assert.equal(await page.locator('#ssPal').isVisible(), true);
  } finally { await page.close(); }
});

test('/ typed into an editable area stays there', async () => {
  const page = await board();
  try {
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'probe'; d.contentEditable = 'true'; document.body.appendChild(d); });
    await page.focus('#probe');
    await page.keyboard.press('/');
    assert.equal(await page.locator('#ssPal').isHidden(), true);
    assert.equal(await page.locator('#probe').innerText(), '/');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('a kind that lands on a site goes through the one way into a site; a preset opens on its neighbourhood', async () => {
  const page = await board();
  try {
    const got = await page.evaluate(() => {
      const via = [];
      const real = ssOpenSite;
      ssOpenSite = (...a) => { via.push(a); return real(...a); };
      ssKindGo('idlestaff');
      let preset = null;
      openFinder = p => { preset = p; };
      ssBuild().find(e => e.id === 'finder:ba:businesstype_gym').go();
      return {via, site: [siteOpen, siteKey, spArrived], preset};
    });
    assert.deepEqual(got.via, [[SHOP, '', {finding: 'idle-1'}]]);
    assert.deepEqual(got.site, [true, SHOP, 'idle-1']);
    assert.deepEqual(got.preset, {cat: 'retail', type: 'ba:businesstype_gym', hoods: ["Hell's Kitchen"]});
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('on a phone the sheet is as tall as the visible viewport', async () => {
  const page = await board({width: 390, height: 700});
  try {
    await page.click('#ssFieldBtn');
    assert.equal(await page.evaluate(() => [ssPal.style.height, `${Math.round(visualViewport.height)}px`].join()), '700px,700px');
    await page.click('#ssPal .ss-cancel');
    assert.equal(await page.evaluate(() => ssPal.style.height), '');
  } finally { await page.close(); }
});

// --- review round 2 -------------------------------------------------------------------

test('a redraw keeps a lit question or "n more" row lit, so Enter does what it said', async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await lit(page), 'Is my factory fed?');
    await page.evaluate(() => ssDataChanged());
    assert.equal(await lit(page), 'Is my factory fed?');
    // The wiki finishing its load redraws the same way.
    await page.evaluate(() => { ssIndex = ssBuild(); ssRender(true); });
    assert.equal(await lit(page), 'Is my factory fed?');
    await typed(page, 'gym');
    await page.waitForSelector('#ssRes .ss-grp[aria-label="Wiki"] .ss-more');
    await page.evaluate(() => ssPick(+document.querySelector('#ssRes .ss-grp[aria-label="Wiki"] .ss-more').dataset.k));
    await page.evaluate(() => ssDataChanged());
    assert.equal(await page.locator('#ssRes .ss-grp[aria-label="Wiki"] .ss-more').evaluate(el => el.classList.contains('on')), true);
    await typed(page, '');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.evaluate(() => ssDataChanged());
    // Which question Enter asks is what is under test, not the Checks table it draws.
    await page.evaluate(() => { ssStock = v => { window.__asked = v; }; });
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__asked), 'feed');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('the answer\'s own controls leave the landing up, and a redrawn answer is lit again', async () => {
  const page = await board();
  try {
    // The profit landing: the chart's series toggles above it are a view, not a way out.
    await page.click('#ssAsk .ss-aq[data-ask="profit"]');
    await page.evaluate(() => { $('dailyHead').innerHTML = '<span class="seg"><a href="#" id="probeSeries">Revenue</a></span>'; });
    await page.click('#probeSeries');
    await page.waitForTimeout(50);
    assert.equal(await page.locator('.ss-asked').count(), 1);
    assert.equal(await page.locator('#secPortfolio.ss-lit').count(), 1);
    // The hire landing: the roster's day tabs are the answer being read.
    await page.click('.ss-asked [data-ss="another"]');
    await page.click('#ssRes .ss-q2 >> text=Whom should I hire?');
    await page.click('#probeDays a:nth-child(2)');
    await page.waitForTimeout(50);
    assert.equal(await page.locator('.ss-asked').count(), 1);
    assert.equal(await page.locator('#sp-roster.ss-lit').count(), 1);
    // Picking the plan draws a new roster in its place: that is still the answer.
    await page.click('#probePlan');
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#sp-roster.ss-lit').innerText(), 'plan');
    assert.equal(await page.locator('.ss-asked').count(), 1);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('Ctrl+K is the letter K; the K key\'s place counts only on a layout with no Latin letters', async () => {
  const page = await board();
  try {
    const press = o => page.evaluate(o => document.dispatchEvent(new KeyboardEvent('keydown',
      {ctrlKey: true, bubbles: true, cancelable: true, ...o})), o);
    await press({key: 'e', code: 'KeyK'});  // Colemak's Ctrl+E
    assert.equal(await page.locator('#ssPal').isHidden(), true);
    await press({key: 'k', code: 'KeyN'});  // K somewhere else on the board
    assert.equal(await page.locator('#ssPal').isVisible(), true);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('a touch never lights a row; the viewport is watched only while the palette is open', async () => {
  const page = await board();
  try {
    const watched = await page.evaluate(() => {
      const vv = window.visualViewport, on = new Set();
      const add = vv.addEventListener.bind(vv), remove = vv.removeEventListener.bind(vv);
      vv.addEventListener = (t, f, o) => { on.add(t); add(t, f, o); };
      vv.removeEventListener = (t, f, o) => { on.delete(t); remove(t, f, o); };
      window.__vv = on;
      return [...on];
    });
    assert.deepEqual(watched, []);
    await page.keyboard.press('/');
    assert.deepEqual(await page.evaluate(() => [...window.__vv].sort()), ['resize', 'scroll']);
    await typed(page, 'test');
    const moved = await page.evaluate(() => {
      const row = document.querySelectorAll('#ssRes .ss-row')[2], r = row.getBoundingClientRect();
      [0, 6].forEach(d => row.dispatchEvent(new PointerEvent('pointermove',
        {pointerType: 'touch', clientX: r.left + 20 + d, clientY: r.top + 10, bubbles: true})));
      return row.classList.contains('on');
    });
    assert.equal(moved, false);
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => [...window.__vv]), []);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

// --- review round 3: one rule, the landing stays while its answer does ---------------------

test('fed: switching the Checks to another view takes the landing down', async () => {
  const page = await board();
  try {
    await page.evaluate(() => {
      // The Checks head as the real one draws it: view tabs that redraw the table.
      wireAll = () => {};
      drawStock = () => {
        $('stockHead').innerHTML = '<div class="sechead"><h2>Stock checks</h2></div><span class="seg">'
          + '<a href="#" id="probeImports">Before the import</a></span>';
        $('stock').innerHTML = `<tbody><tr><td>${stockView}</td></tr></tbody>`;
        $('probeImports').onclick = () => { stockView = 'imports'; drawStock(); };
      };
    });
    await page.click('#ssAsk .ss-aq[data-ask="fed"]');
    assert.equal(await page.locator('#secStock.ss-lit').count(), 1);
    await page.click('#probeImports');
    await page.waitForFunction(() => !document.querySelector('.ss-asked, .ss-lit, .ss-dim'));
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('profit: switching the portfolio to Operations takes the landing down', async () => {
  const page = await board();
  try {
    await page.click('#ssAsk .ss-aq[data-ask="profit"]');
    await page.evaluate(() => {
      $('portHead').innerHTML = '<div class="sechead"><h2>Portfolio</h2><span class="seg"><a href="#" id="probeOps">Operations</a></span></div>';
      $('probeOps').onclick = () => { view = 'ops'; };
    });
    await page.click('#probeOps');
    await page.waitForFunction(() => !document.querySelector('.ss-asked, .ss-lit, .ss-dim'));
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

/* Everything renderAll() draws but the site panel and its picker, which the
   test board draws itself: a live refresh then runs as the app runs it. */
const quietRender = page => page.evaluate(() => {
  ['indexTrends', 'drawMast', 'drawKpis', 'drawAlerts', 'drawRhythm', 'drawLogistics', 'drawStock',
   'drawFlow', 'drawMovers', 'drawMarket', 'drawPlan', 'drawProducts', 'drawPayroll', 'drawGoals', 'drawFindLocation',
   'drawOptimizeStaffing', 'drawFooter', 'wireAll', 'refreshCityMaps'].forEach(name => { window[name] = () => {}; });
});

test('hire: a live refresh lights the same roster again, whatever the staffing card picks by then', async () => {
  const page = await board();
  try {
    await page.click('#ssAsk .ss-aq[data-ask="hire"]');
    assert.equal(await page.locator('#sp-roster.ss-lit').count(), 1);
    const strip = await page.locator('.ss-asked').innerText();
    // The next save makes the card pick another shop; the refresh redraws the panel.
    await page.evaluate(site => { $('optimizeStaffingCard').dataset.site = site; }, GYM);
    await quietRender(page);
    await page.evaluate(() => renderAll());
    assert.equal(await page.locator('#sitePanel h2').innerText(), SHOP);
    assert.equal(await page.locator('#sp-roster.ss-lit').count(), 1);
    assert.equal(await page.locator('#secPortfolio.ss-lit').count(), 0);
    assert.equal(await page.locator('#sp-crew.ss-dim').count(), 1);
    assert.equal(await page.locator('#sitePanel .ss-asked + #sp-roster').count(), 1);
    assert.equal(await page.locator('.ss-asked').innerText(), strip);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('hire: another site picked with the keyboard takes the landing down', async () => {
  const page = await board();
  try {
    await page.click('#ssAsk .ss-aq[data-ask="hire"]');
    assert.equal(await page.locator('#sp-roster.ss-lit').count(), 1);
    await page.waitForTimeout(100);  // the landing's own click has been checked
    await page.focus('#sitePick .sitepick');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(site => siteKey === site, GYM);
    await page.waitForFunction(() => !document.querySelector('.ss-asked, .ss-lit, .ss-dim'));
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('import: closing the change checklist takes the landing down', async () => {
  const page = await board();
  try {
    await page.click('#ssAsk .ss-aq[data-ask="import"]');
    assert.equal(await page.locator('#orderChecklist.ss-lit').count(), 1);
    await page.click('#orderChecklistTitle');
    assert.equal(await page.evaluate(() => $('orderChecklist').open), false);
    await page.waitForFunction(() => !document.querySelector('.ss-asked, .ss-lit, .ss-dim'));
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('prices: moving off the guide\'s prices address takes the landing down', async () => {
  const page = await board();
  try {
    await page.click('#ssAsk .ss-aq[data-ask="prices"]');
    await page.waitForSelector('#pageWiki .ss-asked', {timeout: 5000});
    // The same guide, without the section: the prices are still drawn, but not asked for.
    await page.evaluate(() => { location.hash = location.hash.replace(/\/prices$/, ''); });
    await page.waitForFunction(() => !document.querySelector('.ss-asked, .ss-lit, .ss-dim'));
    assert.equal(await page.evaluate(() => page), 'wiki');
    // The block is still there and on screen: holds() is what took the landing down.
    assert.equal(await page.locator('#wk-prices').isVisible(), true);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('where to open: switching the finder off takes the landing down', async () => {
  const page = await board();
  try {
    await page.evaluate(() => {
      // The finder beside the map, as far as the landing needs it.
      $('cityMapPage').innerHTML = '<div class="citymap"><aside class="places" style="position:relative">finder</aside></div>';
      cityMapPage = {fs: {on: false}, finderOn(){ return this.fs.on; }, paintView(){}};
      openFinder = () => { showPage('map'); cityMapPage.fs.on = true; };
    });
    await page.click('#ssAsk .ss-aq[data-ask="open"]');
    await page.waitForSelector('#pageMap .ss-asked');
    assert.equal(await page.locator('#cityMapPage .places.ss-lit').count(), 1);
    await page.evaluate(() => { cityMapPage.fs.on = false; document.body.click(); });
    await page.waitForFunction(() => !document.querySelector('.ss-asked, .ss-lit'));
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('Ctrl+Alt+K (AltGr+K on Windows) leaves the palette alone', async () => {
  const page = await board();
  try {
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',
      {key: 'k', code: 'KeyK', ctrlKey: true, altKey: true, bubbles: true, cancelable: true})));
    assert.equal(await page.locator('#ssPal').isHidden(), true);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

// --- the seams with site pages (R9) and the folded views (R15) -------------------------

/* The masthead and the footer as the board draws them, so the difficulty chip is there. */
const withChip = page => page.evaluate(() => {
  Object.assign(D.meta, {save: 'Fixture', hour: 9, minute: 0, cityDate: 'Year 1, day 40', build: 3682, verifiedBuild: 3682,
    source: 'fixture.hsg', saved: 'today', generated: 'now'});
  Object.assign(D.kpi, {businesses: 4, employees: 42, vacant: 0});
  drawMast(); drawFooter(); drawDifficulty();
});

test('"What am I playing on?" opens the difficulty chip\'s settings where the reader is, lit while they are open', async () => {
  const page = await board({width: 1600});
  try {
    await withChip(page);
    await page.click('#ssAsk .ss-aq[data-ask="playing"]');
    // No page to go to and no strip: the chip on the build line, its popover open.
    assert.equal(await page.evaluate(() => page), 'today');
    assert.equal(await page.locator('.ss-asked').count(), 0);
    assert.equal(await page.locator('#fvDiffPop').evaluate(el => el.classList.contains('on')), true);
    const chip = page.locator('#clock .fv-diff');
    assert.equal(await chip.getAttribute('aria-expanded'), 'true');
    assert.equal(await chip.evaluate(el => el.classList.contains('ss-lit')), true);
    assert.equal(await page.locator('.ss-dim').count(), 0, 'nothing is dimmed around a chip');
    // A live refresh replaces the chip: the new one is lit.
    await page.evaluate(() => { drawMast(); drawDifficulty(); ssCheckLanding(); });
    assert.equal(await page.locator('#clock .fv-diff.ss-lit').count(), 1);
    // Esc closes the settings, and with them the landing.
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ss-lit').count(), 0);
    // The palette finds it under the words players use, and opens the same popover.
    await page.keyboard.press('/');
    await typed(page, 'house rules');
    assert.equal(await lit(page), 'Difficulty≈ house rules');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#fvDiffPop').evaluate(el => el.classList.contains('on')), true);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('at 1500 px and under "What am I playing on?" opens the footer\'s chip, in the window', async () => {
  const page = await board({width: 1000, height: 700});
  try {
    await withChip(page);
    await page.evaluate(() => { document.body.style.paddingBottom = '3000px'; window.scrollTo(0, 0); });
    await page.click('#ssAsk .ss-aq[data-ask="playing"]');
    const chip = page.locator('#footDiff .fv-diff');
    assert.equal(await chip.evaluate(el => el.classList.contains('ss-lit')), true);
    const [c, p] = await Promise.all([chip.boundingBox(), page.locator('#fvDiffPop').boundingBox()]);
    assert.ok(c.y >= 0 && c.y + c.height <= 700, `the chip is in the window (${c.y})`);
    assert.ok(p.y >= 0 && p.y + p.height <= 700, `and so is its popover (${p.y})`);
    // An outside click closes both.
    await page.mouse.click(40, 300);
    assert.equal(await page.locator('.ss-lit').count(), 0);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('a site found in the palette is a link to its address, and opens its page with the way back', async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await typed(page, 'fitness');
    const link = page.locator('#ssRes .ss-row.on .t a.ss-sl');
    assert.equal(await link.getAttribute('href'), '#site/secondavenue-2');
    // Ctrl+click and a middle click are the browser's: a new tab at the address.
    const ctrl = await page.evaluate(() => {
      const a = document.querySelector('#ssRes .ss-row.on .t a');
      let prevented = null;
      const probe = e => { prevented = e.defaultPrevented; e.preventDefault(); };
      window.addEventListener('click', probe);
      a.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, ctrlKey: true}));
      window.removeEventListener('click', probe);
      return prevented;
    });
    assert.equal(ctrl, false);
    assert.equal(await page.locator('#ssPal').isVisible(), true);
    assert.equal(await page.evaluate(() => siteOpen), false);
    // A plain click opens it here, through the palette: remembered, closed, and
    // the crumb names Today, where it was searched from.
    await link.click();
    assert.equal(await page.locator('#ssPal').isHidden(), true);
    assert.deepEqual(await page.evaluate(() => [location.hash, siteOpen, siteKey, siteFrom && siteFrom.label]),
      ['#site/secondavenue-2', true, GYM, 'Today']);
    assert.deepEqual(await page.evaluate(() => ({...history.state.ssFrom})), {label: 'Today', hash: '#today'});
    assert.deepEqual(await page.evaluate(() => ssRecent().map(r => r.id)), [`site:${GYM}`]);
    // Back is Today again.
    await page.goBack();
    await page.waitForFunction(() => page === 'today' && !siteOpen);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('a question that opens a site names the page it was asked from', async () => {
  const page = await board();
  try {
    await page.click('#ssAsk .ss-aq[data-ask="hire"]');
    assert.deepEqual(await page.evaluate(() => [location.hash, siteFrom && siteFrom.label]), ['#site/fifthavenue-57', 'Today']);
    // Asked from another view, the crumb names that view, as a finding's does.
    await page.evaluate(() => { ssClearAsked(); showSub('supply', 'checks'); showPage('supply'); });
    await page.evaluate(() => ssAsk('hire'));
    assert.equal(await page.evaluate(() => siteFrom && siteFrom.label), 'Checks');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('By weekday is found by the old section\'s name and opens the chart on it', async () => {
  const page = await board();
  try {
    await page.evaluate(() => {
      const day = (d, i) => ({day: d, short: d.slice(0, 3), index: i, n: 4});
      D.rhythm = {recent: {days: 28, revenue: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        .map((d, i) => day(d, [106, 101, 95, 105, 116, 87, 82][i]))}};
    });
    await page.keyboard.press('/');
    await typed(page, 'weekly rhythm');
    assert.equal(await lit(page), 'By weekday≈ weekly rhythm');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => [page, sub.company, chartWindow]), ['company', 'results', 'wd']);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

// --- integration review round 1 ---------------------------------------------------------

test("a site's page opened from the map over the palette takes the palette down, and the crumb names the page under it", async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await typed(page, 'fitness');
    await page.keyboard.press('Shift+Enter');
    assert.equal(await page.locator('#locationMapDialog').evaluate(d => d.open), true);
    // The card's "its page" is a link to the address; the map's own details action goes the same way.
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = '#site/secondavenue-2'; a.id = 'probeGo'; a.textContent = 'its page';
      $('locationMapDialog').appendChild(a);
    });
    await page.click('#probeGo');
    assert.equal(await page.locator('#ssPal').isHidden(), true);
    assert.equal(await page.locator('#locationMapDialog').evaluate(d => d.open), false);
    assert.deepEqual(await page.evaluate(() => [location.hash, siteOpen, siteKey, siteFrom && siteFrom.label]),
      ['#site/secondavenue-2', true, GYM, 'Today']);
    // Without a palette, a name on the map is a name: the portfolio's way back.
    await page.evaluate(() => { siteShut(); showPage('today'); siteOpenOver(D.businesses[0].key); });
    assert.deepEqual(await page.evaluate(() => [siteKey, siteFrom]), [SHOP, null]);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('the palette opens over the difficulty popover by closing it', async () => {
  const page = await board({width: 1600});
  try {
    await withChip(page);
    await page.locator('#clock .fv-diff').click();
    assert.equal(await page.locator('#fvDiffPop').evaluate(el => el.classList.contains('on')), true);
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#ssPal').isVisible(), true);
    assert.equal(await page.locator('#fvDiffPop').evaluate(el => el.classList.contains('on')), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ssInput');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('asked again with its settings already open, the difficulty popover takes focus', async () => {
  const page = await board({width: 1600});
  try {
    await withChip(page);
    await page.evaluate(() => ssAsk('playing'));
    await page.evaluate(() => { document.activeElement.blur(); ssAsk('playing'); });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fvDiffPop');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test("a site's link inside a palette option is hidden from a screen reader, which hears the option's own name", async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await typed(page, 'fitness');
    const row = page.locator('#ssRes .ss-row.on');
    assert.deepEqual(await row.locator('a.ss-sl').evaluate(a => [a.getAttribute('aria-hidden'), a.tabIndex]), ['true', -1]);
    assert.equal(await row.locator('.sf-sr').textContent(), 'Test Fitness');
    // Ctrl+click is still the browser's.
    const ctrl = await page.evaluate(() => {
      let prevented = null;
      const probe = e => { prevented = e.defaultPrevented; e.preventDefault(); };
      window.addEventListener('click', probe);
      document.querySelector('#ssRes .ss-row.on a.ss-sl').dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, ctrlKey: true}));
      window.removeEventListener('click', probe);
      return prevented;
    });
    assert.equal(ctrl, false);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

// --- release round 2 ---------------------------------------------------------------------

test("from one site's page, a site opened over the palette leads back to the first, as Back does", async () => {
  const page = await board();
  try {
    await page.evaluate(key => openSite(key), SHOP);
    const first = await page.evaluate(() => location.hash);
    // The map a palette row showed, and its card's "its page".
    await page.keyboard.press('/');
    await typed(page, 'fitness');
    await page.keyboard.press('Shift+Enter');
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = '#site/secondavenue-2'; a.id = 'probeGo'; a.textContent = 'its page';
      $('locationMapDialog').appendChild(a);
    });
    await page.click('#probeGo');
    assert.deepEqual(await page.evaluate(() => [siteKey, siteFrom && siteFrom.label, siteFrom && siteFrom.hash, history.state.ssFrom.label]),
      [GYM, 'Test Clothing', first, 'Test Clothing']);
    await page.goBack();
    await page.waitForFunction(key => siteOpen && siteKey === key, SHOP);
    // A row opened with Enter says the same.
    await page.keyboard.press('/');
    await typed(page, 'fitness');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => [siteKey, siteFrom && siteFrom.label]), [GYM, 'Test Clothing']);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('the palette opened over the difficulty popover hands focus back to its chip', async () => {
  const page = await board({width: 1600});
  try {
    await withChip(page);
    await page.locator('#clock .fv-diff').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fvDiffPop');
    await page.keyboard.press('Control+k');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#ssPal').isHidden(), true);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.fvAt), 'mast');
    assert.equal(await page.evaluate(() => document.getElementById('tip').classList.contains('on')), false);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test("a press on a site's name in the palette leaves focus in the field", async () => {
  const page = await board();
  try {
    await page.keyboard.press('/');
    await typed(page, 'fitness');
    const prevented = await page.evaluate(() => {
      const ev = new MouseEvent('mousedown', {bubbles: true, cancelable: true, ctrlKey: true});
      document.querySelector('#ssRes .ss-row.on a.ss-sl').dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    assert.equal(prevented, true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ssInput');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});
