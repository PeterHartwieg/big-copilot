// Today, found at a glance: the profit tile opens the daily result, heavy debt
// is on the cash tile, the two count lines under the list, the Portfolio's
// company costs, and a phone that never scrolls sideways. Install Playwright and
// its Chromium browser to run; NODE_PATH may point at an existing Playwright
// installation.
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
  {cwd: path.join(__dirname, '..'), maxBuffer: 8 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8')
    : result.stdout.toString();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

const KEY = 'ba:street_secondavenue#10';

/** Today drawn from a synthetic payload: four tiles, a list with a long
 *  sentence, one finding under the gate and three in a switched-off kind. */
async function today(width, {debt = 0, profitSum7 = 70000} = {}) {
  const page = await browser.newPage({viewport: {width, height: 900}});
  await page.route('https://**', route => route.abort());
  await page.setContent(html, {waitUntil: 'load'});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.evaluate(([KEY, debt, profitSum7]) => {
    document.body.classList.add('has-board');
    const day = (d, profit) => ({day: d, profit, business: profit + 1500, revenue: 40000,
      rent: 300, wages: 9000, loans: 900, insurance: 450, homes: 100, parking: 50});
    const finding = (group, level, text, worth, unit) => ({group, level, text, worth, unit,
      site: 'HART. Gifts', siteKey: KEY, id: `${group}-${worth}-${text.length}`});
    D = {
      meta: {character: 'today-fixture', day: 30},
      kpi: {cash: 1234567, debt, profitYesterday: 10000, profitAvg7: 10000, profitPrev7: 9000,
            profitSum7, revenue: 40000, customers: 1234, rentBill: 300, netWorth: null},
      cashFlow: null, loans: debt ? [{remaining: debt}] : [],
      staff: {dailyCost: 8800},
      daily: [day(28, 9000), day(29, 10000)],
      businesses: [{key: KEY, name: 'HART. Gifts', code: 'HK', status: 'retail'}],
      alerts: [
        finding('feed', 'warn', 'HART. Gifts Clothing (Classic Expensive Female) arrives at 6,612/day against 11,520 needed while Import Hub holds 65,354; the line is not drawing it', null, ''),
        finding('atcap', 'warn', 'HART. Gifts fills the counters Mon-Fri 9-16, 35 hours a week at 3/h and $9,000/day through the ceiling', 9000, '/day trade'),
      ],
      minor: {gate: 500, rows: [
        finding('hype', 'info', 'Wave ending', 120, '/day revenue'),
        finding('idlestaff', 'info', 'HART. Gifts runs 72 staff-hours a week that buy nothing: 3 counters Mon-Wed 8-20', 300, '/day wages'),
        finding('idlestaff', 'info', 'HART. Gifts runs 24 staff-hours a week that buy nothing: 2 counters Tue 8-20', 100, '/day wages'),
      ]},
    };
    Object.assign(alertGroupPrefs, {atcap: true, idlestaff: false, hype: true, feed: true});
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageToday'; });
    drawKpis(); drawAlerts();
    document.querySelectorAll('#pageToday section').forEach(s => s.classList.add('measured'));
  }, [KEY, debt, profitSum7]);
  return page;
}

test('the profit tile opens Company > Results and keeps its spark', async () => {
  const page = await today(1440);
  try {
    const tile = page.locator('#kpis a.kpi');
    assert.equal(await tile.count(), 1);
    assert.match(await tile.innerText(), /Profit yesterday/i);
    assert.equal(await tile.locator('.spark').count(), 1);
    assert.equal(await tile.getAttribute('href'), '#secDaily');
    await page.evaluate(() => { reveal = id => { window.went = id; }; });
    await tile.click();
    assert.equal(await page.evaluate(() => window.went), 'secDaily');
    assert.equal(await page.evaluate(() => SEC_PAGE.secDaily.join(' ')), 'company results');
  } finally { await page.close(); }
});

test('debt joins the cash tile only once it outweighs a week of profit', async () => {
  let page = await today(1440, {debt: 1890000, profitSum7: 70000});
  try {
    const cash = page.locator('#kpis .kpi').nth(2);
    // The period the chip is measured over stays; the debt joins it.
    assert.match(await cash.innerText(), /no cash history · \$1\.89M owed on loans/);
  } finally { await page.close(); }
  page = await today(390, {debt: 1890000, profitSum7: 70000});
  try {
    assert.match(await page.locator('#kpis .kpi').nth(2).innerText(), /no cash history · \$1\.89M owed/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.getBoundingClientRect().width), true);
  } finally { await page.close(); }
  page = await today(1440, {debt: 50000, profitSum7: 70000});
  try {
    assert.doesNotMatch(await page.locator('#kpis .kpi').nth(2).innerText(), /owed/);
  } finally { await page.close(); }
});

test('below the gate and switched off are two lines, each with its own show', async () => {
  const page = await today(1440);
  try {
    const lines = await page.locator('#alertMinor .td-count').allInnerTexts();
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^1 below the \$500\/day line/);
    assert.match(lines[1], /^2 in kinds switched off: Overstaffed hours \(2, \$400\/day\)/);
    await page.click('[data-td-toggle="off"]');
    assert.equal(await page.locator('[data-td-rows="off"] .find').count(), 2);
    assert.equal(await page.locator('[data-td-rows="below"] .find').count(), 0);
    // The variant survives the headline cut.
    assert.match(await page.locator('#alerts .find .what').first().innerText(),
      /^Clothing \(Classic Expensive Female\)/);
  } finally { await page.close(); }
});

test('Payroll, at the foot of Staff, says what was booked yesterday, $0 included, once a day has finished', async () => {
  const page = await today(1440);
  try {
    const quiet = await page.evaluate(() => {
      Object.assign(D.staff, {total: 2, roles: [{role: 'Cashier', count: 2, cost: 8800}],
                              avgSatisfaction: 90, unhappy: 0, absent: 0, complaining: 0});
      const read = wageBill => {
        D.kpi.wageBill = wageBill; drawStaff();
        return document.querySelector('#hrPayroll .sechead .quiet').textContent;
      };
      const out = [read(9000), read(0)];
      D.daily = []; out.push(read(0));
      return out;
    });
    assert.deepEqual(quiet, [
      "2 people · $8,800/day at today's rates · $9,000 booked yesterday",
      "2 people · $8,800/day at today's rates · $0 booked yesterday",
      // No finished day: there is no yesterday to have booked anything.
      "2 people · $8,800/day at today's rates",
    ]);
  } finally { await page.close(); }
});

test('the Portfolio total meets Today\'s profit through the company costs', async () => {
  const page = await today(1440);
  try {
    const rows = await page.evaluate(() => {
      const t = document.createElement('table');
      t.innerHTML = `<tfoot>${outsideRows(10)}</tfoot>`;
      return [...t.querySelectorAll('tr')].map(tr => [...tr.cells].map(c => c.textContent.trim()).join('|'));
    });
    assert.deepEqual(rows, ['Company costs outside sites|-$1,500|', 'Company profit|$10,000|']);
    const tip = await page.evaluate(() => {
      const t = document.createElement('table');
      t.innerHTML = `<tfoot>${outsideRows(10)}</tfoot>`;
      return t.querySelector('[data-tip]').dataset.tip;
    });
    assert.match(tip, /loans \$900, health insurance \$450, homes \$100, parking \$50/);
  } finally { await page.close(); }
});

test('at 390 px Today pairs its tiles, stacks its cards and never scrolls sideways', async () => {
  const page = await today(390);
  try {
    const m = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('#kpis .kpi')].map(t => t.getBoundingClientRect());
      const cards = [...document.querySelectorAll('#secMoves .move')].map(c => c.getBoundingClientRect());
      const row = document.querySelector('#alerts .find');
      const site = row.querySelector('.site').getBoundingClientRect();
      const what = row.querySelector('.what').getBoundingClientRect();
      return {
        scroll: document.documentElement.scrollWidth, width: document.documentElement.getBoundingClientRect().width,
        tileTops: tiles.map(r => Math.round(r.top)), tileLefts: tiles.map(r => Math.round(r.left)),
        cardLefts: cards.map(r => Math.round(r.left)),
        sentenceBelowSite: what.top >= site.bottom - 1,
      };
    });
    assert.ok(m.scroll <= m.width, 'no sideways scroll');
    assert.equal(m.tileTops[0], m.tileTops[1]);
    assert.equal(m.tileTops[2], m.tileTops[3]);
    assert.ok(m.tileTops[2] > m.tileTops[0], 'two rows of two');
    assert.equal(new Set(m.cardLefts).size, 1, 'the cards stack');
    assert.ok(m.sentenceBelowSite, 'the sentence has a line of its own');
  } finally { await page.close(); }
});

test('at 390 px the Growth grid narrows its names, never its cells or the page', async () => {
  const page = await browser.newPage({viewport: {width: 390, height: 900}});
  try {
    await page.route('https://**', route => route.abort());
    await page.setContent(html, {waitUntil: 'load'});
    await page.emulateMedia({reducedMotion: 'reduce'});
    const draw = () => page.evaluate(() => {
      document.body.classList.add('has-board');
      const hoods = ['garmentdistrict', 'hellskitchen', 'industrycity', 'lowermanhattan',
                     'midtown', 'murrayhill', 'thehamptons'].map(id => `ba:neighborhood_${id}`);
      // "100" and ten sellers in every cell: the widest a cell's contents get.
      const cells = () => hoods.map(hood => ({hood, demand: 100, count: 1, providers: 10, sell: 0, here: false}));
      D = {meta: {character: 'growth-fixture', day: 30}, market: {
        hoods, trendDays: 0, noOffices: [], rows: [], offices: [], hype: [], shortages: [], movers: [],
        types: [
          {type: 'Fruit And Vegetable Store', slug: 'ba:businesstype_fruitandvegetablestore', products: 6,
            mine: true, peak: 100, cells: cells()},
          {type: 'Cinema', slug: 'ba:businesstype_cinema', products: 1, mine: false, peak: 100, cells: cells()}]}};
      document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageGrowth'; });
      document.querySelectorAll('#pageGrowth section').forEach(el => {
        el.hidden = el.id !== 'secMarket'; el.classList.add('measured'); });
      marketView = 'types';
      drawMarket();
      const box = e => e.getBoundingClientRect();
      const cellEls = [...document.querySelectorAll('#market .cell')];
      const heads = [...document.querySelectorAll('#market .h')];
      const name = document.querySelector('#market .r .mk-name');
      return {
        scroll: document.documentElement.scrollWidth, width: document.documentElement.getBoundingClientRect().width,
        label: Math.round(box(document.querySelector('#market .r')).width),
        cell: Math.min(...cellEls.map(e => box(e).width)),
        // Every seller's dot stays inside its own cell.
        dotsInside: cellEls.every(c => { const o = box(c), d = box(c.querySelector('.rv2'));
          return d.left >= o.left && d.right <= o.right; }),
        heads: heads.map(h => h.innerText.trim()),
        tips: heads.map(h => h.dataset.tip.split(':')[0]),
        short: shortHood(hoodName(hoods[0])),
        nameWhole: name.scrollHeight <= name.clientHeight + 1 && name.textContent === 'Fruit And Vegetable Store',
      };
    });
    const phone = await draw();
    assert.ok(phone.scroll <= phone.width, 'no sideways scroll');
    assert.ok(phone.label < 120, `the name column narrows (${phone.label}px)`);
    assert.ok(phone.cell >= 28, `a cell keeps room for "100" (${phone.cell}px)`);
    assert.ok(phone.dotsInside, 'the seller dots stay inside their cell');
    // The board's two-letter pill heads each column; the full name is in its tip.
    assert.deepEqual(phone.heads, ['GD', 'HK', 'IC', 'LM', 'MT', 'MH', 'HA']);
    assert.deepEqual(phone.tips, ['Garment District', "Hell's Kitchen", 'Industry City',
                                  'Lower Manhattan', 'Midtown', 'Murray Hill', 'The Hamptons']);
    assert.ok(phone.nameWhole, 'a long type name wraps rather than losing its end');
    // A desk keeps its 200px names and its spelt-out heads.
    await page.setViewportSize({width: 1440, height: 900});
    const desk = await draw();
    assert.equal(desk.label, 200);
    assert.equal(desk.heads[0], desk.short.toUpperCase());
    assert.notEqual(desk.short, 'GD');
  } finally { await page.close(); }
});

// --- Today with the other passes on it (site pages R9, search R10/R11, folds R15) ----

test('at 390 px the count lines, the Ask row and a live Plan imports card share Today without overlap', async () => {
  const page = await today(390);
  try {
    const m = await page.evaluate(() => {
      paintPlanImports({live: true, badge: '12 TO CHANGE',
        what: '12 import settings to change this week, 3 of them at shops that ran short yesterday.'});
      document.querySelector('[data-td-toggle="off"]').click();
      const box = el => { const r = el.getBoundingClientRect(); return {l: r.left, t: r.top, r: r.right, b: r.bottom}; };
      const meets = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
      const blocks = [...document.querySelectorAll('#alerts .find, #alertMinor .td-count, #alertMinor .find, #kpis .kpi, #secMoves .move, #ssAsk')]
        .filter(el => el.getClientRects().length).map(el => ({el: el.id || el.className, ...box(el)}));
      const clashes = [];
      blocks.forEach((a, i) => blocks.slice(i + 1).forEach(b => { if(meets(a, b)) clashes.push(`${a.el} / ${b.el}`); }));
      const ask = document.getElementById('ssAsk'), card = document.getElementById('planImportsCard');
      return {clashes, scroll: document.documentElement.scrollWidth, width: document.documentElement.getBoundingClientRect().width,
        askShown: ask.getClientRects().length > 0, askInside: box(ask).l >= -0.5 && box(ask).r <= innerWidth + 0.5,
        askBelowCards: box(ask).t >= Math.max(...[...document.querySelectorAll('#secMoves .move')].map(c => box(c).b)) - 0.5,
        cardText: card.querySelector('.what').textContent, cardInside: box(card).r <= innerWidth + 0.5,
        lines: document.querySelectorAll('#alertMinor .td-count').length};
    });
    assert.deepEqual(m.clashes, [], 'nothing on Today overlaps');
    assert.ok(m.scroll <= m.width, 'no sideways scroll');
    assert.equal(m.lines, 2);
    assert.ok(m.askShown && m.askInside && m.askBelowCards, 'the Ask row sits under the cards, inside the window');
    assert.match(m.cardText, /^12 import settings/);
    assert.ok(m.cardInside);
  } finally { await page.close(); }
});

test("an Overstaffed hours row, one per site, opens its site's page from its sentence and from its name", async () => {
  const page = await today(1440);
  try {
    await page.evaluate(() => {
      // Where the rows land is under test, not the site panel's draw.
      drawSite = () => {}; drawPortfolio = () => {}; drawChart = () => {};
    });
    await page.click('[data-td-toggle="off"]');
    const row = page.locator('[data-td-rows="off"] .find').first();
    // The sentence is the finding: the site's page, with the finding lit and the way back to Today.
    await row.locator('.what').click();
    assert.deepEqual(await page.evaluate(() => [location.hash, siteOpen, spArrived === D.minor.rows[1].id, siteFrom && siteFrom.label]),
      ['#site/secondavenue-10', true, true, 'Today']);
    await page.evaluate(() => { siteShut(); showPage('today'); showSwitchedOff = true; drawAlerts(); });
    // The name is the site's own page, with no finding.
    await page.locator('[data-td-rows="off"] .find').first().locator('a.ss-sl').click();
    assert.deepEqual(await page.evaluate(() => [location.hash, siteOpen, spArrived]), ['#site/secondavenue-10', true, null]);
  } finally { await page.close(); }
});

test('between the phone and the desk the tiles pair up before an amount would clip', async () => {
  for (const width of [700, 900, 1041]) {
    const page = await today(width);
    try {
      const m = await page.evaluate(() => {
        const tiles = [...document.querySelectorAll('#kpis .kpi')];
        return {
          rows: new Set(tiles.map(t => Math.round(t.getBoundingClientRect().top))).size,
          clipped: tiles.filter(t => { const v = t.querySelector('.v'); return v.scrollWidth > v.clientWidth || t.scrollWidth > t.clientWidth; })
            .map(t => t.querySelector('.v').textContent.trim()),
          scroll: document.documentElement.scrollWidth, client: document.documentElement.getBoundingClientRect().width,
        };
      });
      assert.equal(m.rows, width <= 1040 ? 2 : 1, `${width}: ${width <= 1040 ? 'two by two' : 'four in a row'}`);
      assert.deepEqual(m.clipped, [], `${width}: every amount fits its tile`);
      assert.ok(m.scroll <= m.client, `${width}: no sideways scroll`);
    } finally { await page.close(); }
  }
});

test('a figure shrinks only when it is long: 30 px on a desk, 24 px at most on a phone, and it always fits', async () => {
  // A seven-figure amount first, then eleven and twelve characters.
  const AMOUNTS = ['$1,234,567', '$87,654,321', '-$1,234,567', '$123,456,789'];
  for (const width of [390, 700, 1041, 1100, 1440]) {
    const page = await today(width);
    try {
      const m = await page.evaluate(AMOUNTS => {
        const vs = [...document.querySelectorAll('#kpis .kpi .v')];
        // drawKpis() writes each figure's length for the stylesheet.
        const drawn = vs.every(v => +v.style.getPropertyValue('--n') === v.textContent.length);
        vs.forEach((v, i) => { v.textContent = AMOUNTS[i]; v.style.setProperty('--n', AMOUNTS[i].length); });
        return {
          drawn,
          spill: vs.filter(v => v.scrollWidth > v.clientWidth || v.closest('.kpi').scrollWidth > v.closest('.kpi').clientWidth)
            .map(v => `${v.textContent} ${v.scrollWidth}/${v.clientWidth}`),
          sizes: vs.map(v => parseFloat(getComputedStyle(v).fontSize)),
          scroll: document.documentElement.scrollWidth, client: document.documentElement.getBoundingClientRect().width,
        };
      }, AMOUNTS);
      assert.ok(m.drawn, `${width}: each figure carries its own length`);
      assert.deepEqual(m.spill, [], `${width}: every figure fits its tile`);
      assert.ok(m.scroll <= m.client, `${width}: no sideways scroll`);
      if (width <= 640) assert.ok(m.sizes.every(px => px <= 24), `${width}: a phone's figures are 24 px at most (${m.sizes})`);
      else assert.equal(m.sizes[0], 30, `${width}: a seven-figure amount keeps the full 30 px (${m.sizes})`);
      // Only the longer figures give way, never below the one before them.
      assert.ok(m.sizes[3] <= m.sizes[1] && m.sizes[1] <= m.sizes[0], `${width}: ${m.sizes}`);
    } finally { await page.close(); }
  }
});

test('the length-based sizes sit inside @supports (width:1cqi); the plain sizes stand outside it', async () => {
  const page = await today(1440);
  try {
    const found = await page.evaluate(() => {
      const out = {inside: [], outside: []};
      const tile = /(^|,\s*)(#kpis )?\.kpi \.v$|^#kpis \.kpi$/;
      const walk = (rules, supports) => [...rules].forEach(r => {
        if (r instanceof CSSSupportsRule) return walk(r.cssRules, r.conditionText);
        if (r instanceof CSSMediaRule) return walk(r.cssRules, supports);
        if (!(r instanceof CSSStyleRule) || !tile.test(r.selectorText)) return;
        const text = `${r.selectorText} { ${r.style.cssText} }`;
        (supports ? out.inside : out.outside).push(supports ? `${supports} ${text}` : text);
      });
      [...document.styleSheets].forEach(sheet => { try { walk(sheet.cssRules, null); } catch (e) {} });
      return out;
    });
    const list = xs => xs.join(' | ');
    // Every rule that reads the tile's width is behind the check...
    assert.ok(found.inside.length >= 3, list(found.inside));
    assert.ok(found.inside.every(t => /width: ?1cqi/.test(t)), list(found.inside));
    assert.ok(found.inside.some(t => /min\(30px/.test(t)) && found.inside.some(t => /min\(24px/.test(t)), list(found.inside));
    assert.ok(found.inside.some(t => /container-type: inline-size/.test(t)), list(found.inside));
    // ...and nothing outside it does, where the plain sizes are.
    assert.ok(found.outside.every(t => !/cqi|var\(--n|container-type/.test(t)), list(found.outside));
    assert.ok(found.outside.some(t => /^\.kpi \.v .*font-size: 30px/.test(t)), list(found.outside));
    assert.ok(found.outside.some(t => /^#kpis \.kpi \.v .*clamp\(17px/.test(t)), list(found.outside));
  } finally { await page.close(); }
});
