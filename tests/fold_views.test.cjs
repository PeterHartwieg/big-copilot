// Fold the low-value views (UX audit R15): the Weekly rhythm section is the
// Daily result chart's By weekday option, the difficulty is one chip with a
// popover (masthead on a desktop, footer on a phone), and the weekday charts
// name the series they read. Synthetic fixtures only.
// Browser regressions: install Playwright and its Chromium browser to run.
// NODE_PATH may point at an existing Playwright installation.
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
  {cwd: path.join(__dirname, '..'), maxBuffer: 4 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8')
    : result.stdout.toString();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// A weekday profile as _weekday_profile() returns it, Monday first.
const profile = (indexes, n = 4) => indexes.map((index, i) =>
  ({day: DAYS[i], short: DAYS[i].slice(0, 3), index, n}));
const rule = (name, value, normal, lean, unit = '×') => ({name, value, normal, unit, lean, what: 'what it does'});
const CUSTOM = {label: 'Custom', slot: 0, harder: 2, easier: 1, startingMoney: 0, rules: [
  rule('Public prices', 1.3, 0.7, 'harder'), rule('Export price', 0.1, 0.65, 'harder'),
  rule('Tax rate', 0, 5, 'easier', '%'), rule('Bank interest', 0.7, 0.7, 'level'),
]};

async function board({width = 1280, recent, houseRules = CUSTOM, difficulty, businesses = [], products = [], goals} = {}) {
  const page = await browser.newPage({viewport: {width, height: 1000}});
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('https://**', route => route.abort());
  await page.route('https://fold.test/', route =>
    route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await page.goto('https://fold.test/', {waitUntil: 'load'});
  await page.evaluate(o => {
    document.body.classList.add('has-board');
    const daily = Array.from({length: 40}, (_, i) => ({day: 30 + i, profit: 1000 + i, profit7: 1000, revenue: 3000,
      cogs: 1000, wages: 500, business: 1000, loans: 0, insurance: 0, homes: 0, parking: 0}));
    D = {
      meta: {save: 'Fixture', day: 73, hour: 11, minute: 13, cityDate: 'Year 2, day 13 of 60', build: 3682,
        verifiedBuild: 3682, locale: true, houseRules: o.houseRules, source: 'fixture.hsg', saved: 'today',
        generated: 'now', difficulty: o.difficulty},
      kpi: {businesses: 2, employees: 9, vacant: 0},
      daily, rhythm: {recent: o.recent || {}}, businesses: o.businesses, products: o.products,
      goals: o.goals || {typesRun: 1, typesTotal: 3, buildingsOwned: 0, buildingsTotal: 885, goodsProduced: 12, taxesPaid: 0},
    };
    showPage('company', false, 'none'); showSub('company', 'results');
    drawMast(); drawFooter(); drawDifficulty(); drawChart(); drawProducts(); drawGoals(); wireAll();
  }, {recent, houseRules, difficulty, businesses, products, goals});
  return {page, errors};
}
const tools = page => page.$$eval('#chartTools a', as => as.map(a => a.textContent));
// The read-out line is a flex row, so its text is read whole rather than as laid out.
const readout = page => page.locator('#dailyBox .fv-readout').evaluate(el => el.textContent.replace(/\s+/g, ' ').trim());

// --- By weekday ----------------------------------------------------------------

test('By weekday is offered only when a company series clears the weekly-cycle test', async () => {
  const none = await board({recent: {days: 28, revenue: null, profit: null, customers: null}});
  try {
    assert.deepEqual(await tools(none.page), ['30 days', 'All']);
    assert.equal(await none.page.locator('#secRhythm').count(), 0, 'the Weekly rhythm section is gone');
    assert.doesNotMatch(await none.page.locator('#pageCompany').innerText(), /Not enough history to separate/);
    assert.deepEqual(none.errors, []);
  } finally { await none.page.close(); }

  const some = await board({recent: {days: 28, revenue: profile([106, 101, 95, 105, 116, 87, 82]),
    profit: profile([102, 85, 80, 99, 121, 104, 96]), customers: null}});
  try {
    assert.deepEqual(await tools(some.page), ['30 days', 'All', 'By weekday']);
    await some.page.locator('#chartTools a[data-id="wd"]').click();
    // Revenue first; the series that failed the test (customers) has no chip.
    assert.deepEqual(await some.page.$$eval('#dailyBox [data-week]', as => as.map(a => a.textContent.trim())),
      ['Revenue', 'Profit']);
    assert.equal(await some.page.locator('#dailyBox [data-week].on').textContent(), 'Revenue');
    // The series line names what it reads: the company's revenue over its last four weeks.
    assert.equal((await some.page.locator('#dailyBox .fv-basis').innerText()).replace(/\s+/g, ' ').trim(),
      'Company revenue · every site · 4 weeks');
    assert.equal(await readout(some.page), 'Peaks Friday +16 · lowest Sunday −18');
    assert.match(await some.page.locator('#dailyHead .why').getAttribute('data-tip'), /from the company's last 4 weeks of daily results/);
    // One run of text: the read-out's flex gap does not split "Peaks Friday +16".
    assert.equal(await some.page.locator('#dailyBox .fv-readout > *').count(), 1);
    // Day 73 is a Wednesday: its column is outlined, and the tooltip reads it.
    assert.equal(await some.page.locator('#dailyBox .wd.now').getAttribute('data-read'),
      'Wednesday <b>95%</b> of a normal day · from 4 weeks');
    assert.match(await some.page.locator('#dailyBox .fv-basis').getAttribute('data-tip'),
      /Today is Wednesday, normally -5%\. Yesterday was Tuesday, normally \+1%\./);
    // A weekday reads out on the series line while it is pointed at.
    await some.page.locator('#dailyBox .wd').nth(4).hover();
    assert.equal(await readout(some.page), 'Friday 116% of a normal day · from 4 weeks');
    await some.page.locator('#dailyBox [data-week="profit"]').click();
    assert.equal((await some.page.locator('#dailyBox .fv-basis').innerText()).replace(/\s+/g, ' ').trim(),
      'Company profit · every site · 4 weeks');
    // Back to the days: the SVG chart, untouched.
    await some.page.locator('#chartTools a[data-id="30"]').click();
    assert.equal(await some.page.locator('#dailyBox svg').count(), 1);
    assert.deepEqual(some.errors, []);
  } finally { await some.page.close(); }
});

test('a save that stops clearing the test falls back to the days', async () => {
  const {page, errors} = await board({recent: {days: 28, revenue: profile([106, 101, 95, 105, 116, 87, 82])}});
  try {
    await page.locator('#chartTools a[data-id="wd"]').click();
    await page.evaluate(() => { D.rhythm.recent.revenue = null; drawChart(); });
    assert.deepEqual(await tools(page), ['30 days', 'All']);
    assert.equal(await page.locator('#chartTools a.on').textContent(), '30 days');
    assert.equal(await page.evaluate(() => chartWindow), 30);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('site by site keeps its table, and the verdict stays plain text', async () => {
  const shop = i => ({key: `shop#${i}`, name: `Shop ${i}`, status: 'retail', type: 'Clothing Store', address: `${i} Fifth Avenue`,
    rhythm: profile([98, 92, 82, 96, 100, 118, 114], 3), peakDay: i === 7 ? 'Tuesday' : 'Saturday', swing: 36,
    lines: [], series: []});
  const {page, errors} = await board({recent: {days: 28, revenue: profile([106, 101, 95, 105, 116, 87, 82])},
    businesses: Array.from({length: 8}, (_, i) => shop(i))});
  try {
    await page.locator('#chartTools a[data-id="wd"]').click();
    const tip = await page.locator('#dailyBox .fv-basis').getAttribute('data-tip');
    assert.match(tip, /7 sites peak Saturday/);
    assert.match(tip, /Shop 7 peaks Tuesday/);
    assert.doesNotMatch(tip, /<button|<svg|data-map-key/);
    assert.equal(await page.locator('.fv-sites').isHidden(), true);
    await page.locator('#rhythmToggle').click();
    assert.equal(await page.locator('#rhythmToggle').textContent(), 'hide the table');
    assert.equal(await page.locator('#rhythmSites tbody tr').count(), 8);
    assert.deepEqual(await page.$$eval('#rhythmSites thead th', th => th.map(x => x.textContent)),
      ['Business', 'Peaks', 'Swing', 'Across the week']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('Products names its peaks in units, with the weeks they come from', async () => {
  const product = (item, peak, swing, weeks = peak ? 2 : 0) => ({item, revenue: 1000, units: 50, week: 350, price: 20, stores: 7,
    peak, swing, weeks});
  const {page, errors} = await board({products: [product('Shirts', 'Saturday', 37), product('Hats', 'Sunday', 20, 3),
    product('Socks', null, 0)]});
  try {
    const th = page.locator('#secProducts th', {hasText: 'Peaks'});
    assert.equal(await th.textContent(), 'Peaks · units');
    assert.match(await th.getAttribute('data-tip'), /most units, across every store that carries it, from the last 2 to 3 weeks of sales/);
    // Each cell reads its own product's weeks.
    assert.deepEqual(await page.locator('#secProducts td.pos').evaluateAll(tds => tds.map(td => td.dataset.tip)), [
      'Units sold across 7 stores, last 2 weeks: peaks Saturday, 37 points between best and worst day',
      'Units sold across 7 stores, last 3 weeks: peaks Sunday, 20 points between best and worst day']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

// --- the difficulty chip ----------------------------------------------------------

test('the difficulty chip sits on the build line on a desktop and opens its settings', async () => {
  const {page, errors} = await board({width: 1440});
  try {
    const mast = page.locator('#clock .fv-diff');
    assert.equal(await mast.textContent(), 'CUSTOM · 2 HARDER · 1 EASIER');
    assert.equal(await mast.isVisible(), true);
    assert.equal(await page.locator('#footDiff .fv-diff').isVisible(), false, 'the footer copy is for narrow windows');
    assert.equal(await mast.getAttribute('aria-expanded'), 'false');
    await mast.click();
    const pop = page.locator('#fvDiffPop');
    assert.equal(await pop.evaluate(el => [el.parentElement === document.body, getComputedStyle(el).position].join()),
      'true,fixed', 'hung off the body, so no section can clip it');
    assert.equal(await mast.getAttribute('aria-expanded'), 'true');
    assert.match(await pop.locator('h3').textContent(), /Custom difficulty\s*2 harder\s*1 easier/);
    assert.match(await pop.locator('p').first().textContent(), /differs from the game's Normal preset\. Started with \$0\./);
    // The settings that moved, not the one left at Normal.
    assert.deepEqual(await pop.locator('.fv-rule .n').evaluateAll(ns => ns.map(n => n.firstChild.textContent)),
      ['Public prices', 'Export price', 'Tax rate']);
    assert.equal(await pop.locator('.fv-rule').nth(2).getAttribute('data-tip'),
      'What it does. Normal is 5%, so this game is easier.');
    // Right is harder: Export price is lower than Normal and still to the right of the tick.
    const knob = n => pop.locator('.fv-rule').nth(n).locator('.me').evaluate(el => parseFloat(el.style.left));
    assert.ok(await knob(1) > 50);
    assert.ok(await knob(2) < 50);
    // Under its chip, inside the window.
    const [chip, box] = await Promise.all([mast.boundingBox(), pop.boundingBox()]);
    assert.ok(box.y > chip.y + chip.height - 1 && box.x + box.width <= 1440);
    // Focus goes into the dialog, and Esc brings it back to the chip with no
    // tooltip left open over the closed popover.
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fvDiffPop');
    await page.keyboard.press('Escape');
    assert.equal(await mast.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.fvAt), 'mast');
    assert.equal(await page.evaluate(() => document.getElementById('tip').classList.contains('on')), false);
    await mast.click();
    await page.mouse.click(300, 600);
    assert.equal(await pop.evaluate(el => el.classList.contains('on')), false, 'an outside click closes it');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the chip ends the clock\'s last line and never makes the masthead taller', async () => {
  const flagged = {locale: false, build: 3683};
  // A 20-character save name with both flags is the widest clock row there is.
  for (const save of ['Fixture', 'Twenty Char Savename'])
  for (const width of [1440, 1280, 900, 780, 761, 760, 600, 580, 540]) for (const flags of [false, true]) {
    const heights = [];
    for (const houseRules of [CUSTOM, null]) {
      const {page, errors} = await board({width, houseRules});
      try {
        heights.push(await page.evaluate(([flags, flagged, save]) => {
          D.meta.save = save;
          if (flags) Object.assign(D.meta, flagged);
          drawMast();
          return Math.round(document.querySelector('.mast').getBoundingClientRect().height);
        }, [flags, flagged, save]));
        if (houseRules) {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${width} scrolls sideways`);
          // In the clock's last line and no other: never a line of its own. (The
          // web build's live dot always adds a flags line, so no fixed count.)
          const lines = await page.$$eval('#clock > small', ls => ls.map(l => l.querySelectorAll('.fv-diff').length));
          assert.deepEqual(lines, [...Array(lines.length - 1).fill(0), 1]);
          assert.ok(lines.length >= (flags ? 2 : 1));
        }
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    }
    assert.equal(heights[0], heights[1], `masthead at ${width}${flags ? ' with flags' : ''} for ${save}`);
  }
});

test('a resize that swaps the chip closes the popover and hands focus to the chip now shown', async () => {
  // Desktop to phone, scrolled down the page: the footer chip is a page away,
  // so the popover closes rather than follow it off screen.
  const {page, errors} = await board({width: 1280,
    products: Array.from({length: 30}, (_, i) => ({item: `Line ${i}`, revenue: 1000, units: 50, week: 350, price: 20,
      stores: 7, peak: null, swing: 0, weeks: 0}))});
  try {
    await page.evaluate(() => { showSub('company', 'products'); window.scrollTo(0, 400); });
    const mast = page.locator('#clock .fv-diff');
    await mast.click();
    assert.equal(await page.locator('#fvDiffPop.on').count(), 1);
    const scrolled = await page.evaluate(() => window.scrollY);
    await page.setViewportSize({width: 700, height: 800});
    await page.waitForFunction(() => !document.querySelector('#fvDiffPop').classList.contains('on'));
    assert.equal(await page.evaluate(() => document.activeElement.dataset.fvAt), 'foot');
    assert.equal(await page.evaluate(() => window.scrollY), scrolled, 'focus did not scroll the page');
    assert.deepEqual(await page.$$eval('.fv-diff', bs => bs.map(b => b.getAttribute('aria-expanded'))), ['false', 'false']);
    assert.equal(await page.evaluate(() => document.getElementById('tip').classList.contains('on')), false);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
  // Phone to desktop: the same, the other way.
  const phone = await board({width: 390});
  try {
    const foot = phone.page.locator('#footDiff .fv-diff');
    await foot.scrollIntoViewIfNeeded();
    await foot.click();
    await phone.page.setViewportSize({width: 844, height: 1000});
    await phone.page.waitForFunction(() => !document.querySelector('#fvDiffPop').classList.contains('on'));
    assert.equal(await phone.page.evaluate(() => document.activeElement.dataset.fvAt), 'mast');
    assert.deepEqual(phone.errors, []);
  } finally { await phone.page.close(); }
});

test('on a phone the chip moves to the footer stamp', async () => {
  const {page, errors} = await board({width: 390});
  try {
    assert.equal(await page.locator('#clock .fv-diff').isVisible(), false);
    const foot = page.locator('#footDiff .fv-diff');
    assert.equal(await foot.isVisible(), true);
    assert.equal(await foot.textContent(), 'Custom · 2 harder · 1 easier');
    await foot.scrollIntoViewIfNeeded();
    await foot.click();
    const box = await page.locator('#fvDiffPop').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390, 'the popover fits the phone');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a preset says its name, Normal included, and lists what differs', async () => {
  const normal = await board({houseRules: {label: 'Normal', slot: 2, harder: 0, easier: 0, startingMoney: 10000,
    rules: [rule('Public prices', 0.7, 0.7, 'level')]}});
  try {
    assert.equal(await normal.page.locator('#clock .fv-diff').textContent(), 'NORMAL');
    await normal.page.locator('#clock .fv-diff').click();
    assert.equal(await normal.page.locator('#fvDiffPop .fv-rule').count(), 0);
    assert.match(await normal.page.locator('#fvDiffPop').textContent(), /Normal difficulty[\s\S]*Started with \$10,000/);
  } finally { await normal.page.close(); }
  const hard = await board({houseRules: {label: 'Hard', slot: 3, harder: 1, easier: 0, startingMoney: 4200,
    rules: [rule('Wholesale urgent fee', 0.3, 0.2, 'harder')]}});
  try {
    assert.equal(await hard.page.locator('#clock .fv-diff').textContent(), 'HARD');
    assert.match(await hard.page.locator('#clock .fv-diff').getAttribute('data-tip'), /Hard preset: 1 setting harder than Normal/);
  } finally { await hard.page.close(); }
  const old = await board({houseRules: null, difficulty: 'Hard'});
  try {
    // A board built before the house rules still names the difficulty, with nothing to open.
    const plain = old.page.locator('#clock .fv-diff');
    assert.equal(await plain.textContent(), 'HARD');
    assert.equal(await plain.evaluate(el => el.tagName), 'SPAN');
    await plain.click();
    assert.equal(await old.page.locator('#fvDiffPop.on').count(), 0);
    assert.deepEqual(old.errors, []);
  } finally { await old.page.close(); }
  const none = await board({houseRules: null});
  try {
    assert.equal(await none.page.locator('.fv-diff').count(), 0, 'with neither, no chip');
  } finally { await none.page.close(); }
  const unmoved = await board({houseRules: {label: 'Custom', slot: 0, harder: 0, easier: 0, startingMoney: 0,
    rules: [rule('Public prices', 0.7, 0.7, 'level')]}});
  try {
    assert.equal(await unmoved.page.locator('#clock .fv-diff').textContent(), 'CUSTOM');
    await unmoved.page.locator('#clock .fv-diff').click();
    assert.match(await unmoved.page.locator('#fvDiffPop p').textContent(), /^No setting differs from the game's Normal preset\./);
  } finally { await unmoved.page.close(); }
});

test('the site page names its own week', async () => {
  const {page, errors} = await board();
  try {
    const line = await page.evaluate(() => {
      const shop = {
        key: 'ba:street_fifthavenue#1', status: 'retail', name: 'HART. Clothing', code: 'MT',
        type: 'Clothing Store', typeSlug: 'ba:businesstype_clothingstore', address: '1 Fifth Avenue',
        neighbourhood: 'Midtown', opened: 3, revenue: 900, customers: 30, basket: 30, profit: 200,
        margin: 22.2, cogs: 0, wages: 300, rent: 100, marketing: 0, theft: 0, licensing: 0,
        staff: 2, staffCost: 300, crew: [{role: 'Customer service', count: 2, daily: 300, absent: 0}],
        people: [], lines: [], series: [], staffDemands: [], quitWarnings: 0, daysOpen: 30,
        rhythm: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, i) =>
          ({day, short: day.slice(0, 3), index: [98, 92, 82, 96, 100, 118, 114][i], n: 3})),
        peakDay: 'Saturday', swing: 36,
        satisfaction: {overall: 74, service: 88, pricing: 71, cleanliness: 62, facility: 79},
        amenities: {bathroom: true, toiletprivacy: false, sink: true, music: false, interior: true},
        missingUniformLocker: false, uniformGaps: [], traffic: 41, marketingIndex: 31, security: 85, capacity: 40,
      };
      Object.assign(D, {businesses: [shop], supply: {day: 73, shops: [], imports: [], idle: [], factories: {sites: []}},
        hours: [], hourFindings: [], trends: [], hypeExposure: [], alerts: [], minor: {rows: []}, homes: [], chains: [], plan: null});
      siteKey = shop.key; siteOpen = true;
      showPage('company');
      drawSite();
      return document.querySelector('#sp-week .fv-basis').textContent.replace(/\s+/g, ' ').trim();
    });
    assert.equal(line, 'This shop’s revenue · 3 weeks');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
