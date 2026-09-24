// The site panel's mechanical half: the findings it lists and where they point,
// the kind fork, the standards lamps' state, the crew fold and the rank.
// Install Playwright and its Chromium browser to run; NODE_PATH may point at an
// existing Playwright installation.
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

const KEY = 'ba:street_secondavenue#10';
const OTHER = 'ba:street_broadway#2';
// The shape _condense() really writes: `rank` and `subject` are popped there,
// and what the panel points at travels as `ev`.
const finding = (id, group, site = 'HART. Gifts', siteKey = KEY, level = 'warn', ev = null) =>
  Object.assign({id, level, site, siteKey, group, text: `${site}: ${group} finding`,
                 worth: null, unit: ''}, ev ? {ev} : {});

// A shop panel, over a fixture whose every field the panel may read is filled
// in. `shop` overrides the site that opens, `alerts` and `minor.rows` the two
// finding lists it reads.
async function site(overrides = {}) {
  const page = await browser.newPage({viewport: overrides.viewport || {width: 1280, height: 1100}});
  await page.route('https://**', route => route.abort());
  /* The board is served from an origin of its own rather than set into a blank
     page: localStorage is denied on an opaque origin, and the panel reads the
     recipes the player named there. */
  await page.route('https://site-panel.test/', route =>
    route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await page.goto('https://site-panel.test/', {waitUntil: 'load'});
  await page.evaluate(overrides => {
    document.body.classList.add('has-board');
    const shop = {
      key: 'ba:street_secondavenue#10', status: 'retail', name: 'HART. Gifts', code: 'HK',
      type: 'Gift Shop', address: '10 Second Avenue', neighbourhood: "Hell's Kitchen",
      opened: 3, revenue: 900, customers: 30, basket: 30, profit: 200, margin: 22.2,
      cogs: 0, wages: 300, rent: 100, marketing: 0, theft: 0, licensing: 0,
      staff: 2, staffCost: 300, crew: [{role: 'Customer service', count: 2, daily: 300, absent: 0}],
      people: [], lines: [], series: [], rhythm: null, peakDay: null, swing: 0,
      staffDemands: [], quitWarnings: 0, daysOpen: 9,
      satisfaction: {overall: 74, service: 88, pricing: 71, cleanliness: 62, facility: 79},
      amenities: {bathroom: true, toiletprivacy: false, sink: true, music: false, interior: true},
      missingUniformLocker: false, uniformGaps: [],
      traffic: 41, marketingIndex: 31, security: 85, capacity: 40,
    };
    const other = {...shop, key: 'ba:street_broadway#2', name: 'HART. Other', revenue: 500};
    try{ localStorage.setItem('ba_line_names', JSON.stringify(overrides.names || {})); }catch(e){}
    D = {
      meta: {character: 'sp-fixture', day: 29}, rhythm: null, daily: [],
      plan: overrides.plan || null,
      supply: Object.assign({day: 29, shops: [], imports: [], idle: [], factories: {sites: []}},
        overrides.supply || {}),
      hours: overrides.hours || [], hourFindings: overrides.hourFindings || [],
      trends: overrides.trends || [], hypeExposure: [],
      alerts: overrides.alerts || [], minor: {rows: overrides.minor || []},
      homes: overrides.homes || [],
      businesses: [Object.assign(shop, overrides.shop || {}), Object.assign(other, overrides.peer || {})],
    };
    siteKey = shop.key; siteOpen = true; spArrived = null; spFindsAll = false;
    showPage('company');
    drawSite();
  }, overrides);
  return page;
}

test('the findings here are the ones about this site, and each lights its block', async () => {
  const page = await site({
    alerts: [
      finding('a1', 'outruns'),
      finding('a2', 'outruns', 'HART. Other', OTHER),
      finding('a3', 'music'),
      finding('a4', 'vacant', 'A lease', null, 'info'),
    ],
    minor: [finding('a5', 'idlestaff', 'HART. Gifts', KEY, 'info')],
  });
  try {
    const rows = await page.$$eval('#sitePanel .sp-find', rows =>
      rows.map(r => ({id: r.dataset.id, ev: r.dataset.ev, hit: r.dataset.hit || null})));
    assert.deepEqual(rows, [
      // This fixture stocks nothing, so there is no shelf row to pulse: the
      // block is still worth scrolling to, and the hit is dropped rather than
      // dimming the page for nothing.
      {id: 'a1', ev: 'shelves', hit: null},
      {id: 'a3', ev: 'standards', hit: 'music'},
      // The counted-away list under the findings is read too.
      {id: 'a5', ev: 'hours', hit: null},
    ]);
    const blocks = await page.evaluate(() => ALERT_EVIDENCE);
    for(const [group, ev] of Object.entries(blocks))
      assert.ok(ev.block, `${group} names the block its evidence sits in`);
    // Hovering a row lights the block the table names, and nothing else.
    await page.hover('.sp-find[data-id="a3"]');
    const lit = await page.evaluate(() => ({
      lit: [...document.querySelectorAll('#sitePanel [data-block].sp-lit')].map(b => b.dataset.block),
      pulsing: document.querySelectorAll('#sitePanel [data-el].sp-hit').length,
    }));
    assert.deepEqual(lit.lit, ['standards']);
    assert.ok(lit.pulsing >= 1, 'the lamp carrying the evidence pulses');
  } finally { await page.close(); }
});

test('a finding arrived at from the list is marked, and show all unfolds the rest', async () => {
  const page = await site({alerts: [
    finding('a1', 'outruns'), finding('a2', 'music'), finding('a3', 'satisfaction'),
    finding('a4', 'loss', 'HART. Gifts', KEY, 'critical'), finding('a5', 'trend'), finding('a6', 'jobdemand'),
  ]});
  try {
    assert.equal(await page.locator('#sitePanel .sp-find').count(), 4);
    assert.match(await page.locator('#sitePanel .sp-findmore').innerText(), /2 more · show all/);
    await page.click('[data-allfinds]');
    assert.equal(await page.locator('#sitePanel .sp-find').count(), 6);
    // Arriving from the board's own list marks the row it came from.
    await page.evaluate(() => openSite(D.businesses[0].key, false, 'a5'));
    assert.equal(await page.locator('#sitePanel .sp-find.arrived').getAttribute('data-id'), 'a5');
  } finally { await page.close(); }
});

test('an office draws no amenity lamps and no Pull block', async () => {
  const page = await site({shop: {status: 'office', type: 'Law Firm', basket: 387.89}});
  try {
    assert.equal(await page.locator('#sitePanel [data-amenity]').count(), 0);
    assert.equal(await page.locator('#sitePanel [data-block="pull"]').count(), 0);
    // The standards it is asked about are the four satisfaction parts alone.
    const parts = await page.$$eval('#sitePanel [data-sat]', els => els.map(e => e.dataset.sat));
    assert.deepEqual(parts, ['service', 'pricing', 'cleanliness', 'facility']);
    assert.equal(await page.locator('#sitePanel [data-block="standards"]').count(), 1);
  } finally { await page.close(); }
});

test('a shop the game has not scored draws every lamp dashed and none lit', async () => {
  const page = await site({shop: {revenue: 0, amenities: {bathroom: true, sink: false}}});
  try {
    const lamps = await page.$$eval('#sitePanel [data-amenity]', els =>
      els.map(e => [e.dataset.amenity, e.dataset.state]));
    // A lamp the type never asks for has no row at all, scored or not.
    assert.deepEqual(lamps, [['bathroom', 'unk'], ['sink', 'unk']]);
    assert.equal(await page.locator('#sitePanel [data-amenity][data-state="ok"]').count(), 0);
  } finally { await page.close(); }
});

test('a scored shop lights the amenities it meets and strikes the ones it misses', async () => {
  const page = await site();
  try {
    const lamps = await page.$$eval('#sitePanel [data-amenity]', els =>
      els.map(e => [e.dataset.amenity, e.dataset.state]));
    assert.deepEqual(lamps, [
      ['bathroom', 'ok'], ['toiletprivacy', 'miss'], ['sink', 'ok'],
      ['music', 'miss'], ['interior', 'ok']]);
    assert.ok(await page.locator('#sitePanel [data-el="locker"][data-state="ok"]').count());
  } finally { await page.close(); }
});

test('a big crew folds into one row a role, a dozen still read as pills', async () => {
  const person = n => ({name: `Person ${n}`, role: n % 2 ? 'Customer service' : 'Cleaning',
                        absent: n === 13, daily: 100});
  const small = await site({shop: {people: Array.from({length: 12}, (_, i) => person(i + 1))}});
  try {
    assert.equal(await small.locator('#sitePanel .sp-rrow').count(), 0);
    assert.equal(await small.locator('#sitePanel .crew > .person').count(), 12);
  } finally { await small.close(); }

  const big = await site({shop: {people: Array.from({length: 13}, (_, i) => person(i + 1))}});
  try {
    const rows = await big.$$eval('#sitePanel .sp-rrow', rows => rows.map(r => ({
      role: r.querySelector('.sp-rbtn').textContent.replace(/\s+/g, ' ').trim(),
      dots: r.querySelectorAll('.sp-dot').length,
      off: r.querySelectorAll('.sp-dot.off').length,
      open: r.classList.contains('open'),
    })));
    assert.deepEqual(rows, [
      {role: 'CSCustomer service', dots: 7, off: 1, open: false},
      {role: 'CLCleaning', dots: 6, off: 0, open: false},
    ]);
    // Opening a role shows its people as the usual pills.
    await big.click('#sitePanel .sp-rrow .sp-rbtn');
    const pills = await big.$$eval('#sitePanel .sp-rrow.open .sp-rpeople .person', els => els.length);
    assert.equal(pills, 7);
  } finally { await big.close(); }
});

// A big crew in a narrow Crew block: one role of eighty beside a small one. The
// block sits a third of the page wide beside Fees, and the three columns (role,
// dots, count) left the eighty dots a single column, a dot a line, with the role
// and its count adrift halfway down. Stacked instead, a role and its count still
// fought for one line at a tablet's width: the badge squashed, the name ran into
// the count, and a long role's count spilled out of the block. Every row now
// keeps its whole name, its count inside the block and its dots in lines of many.
test('a big role in a narrow Crew block keeps its name, its count and its dots inside it', async () => {
  const person = n => ({name: `Person ${n}`, role: n <= 3 ? 'Customer service' : 'Logistics manager',
                        absent: n % 17 === 0 || n === 2, daily: n <= 3 ? 250 : 800});
  const people = Array.from({length: 83}, (_, i) => person(i + 1));
  for (const width of [1850, 1440, 900, 820, 768, 700, 390]) {
    const viewport = {width, height: 1000};
    const page = await site({viewport, shop: {status: 'office', type: 'Law Firm', basket: 387.89,
      staff: 83, staffCost: 64750, people,
      crew: [{role: 'Customer service', count: 3, daily: 750, absent: 1},
             {role: 'Logistics manager', count: 80, daily: 64000, absent: 4}]}});
    try {
      const rows = await page.$$eval('#sitePanel .sp-rrow', rows => rows.map(r => {
        const roster = r.closest('.sp-roster').getBoundingClientRect();
        const edge = roster.right;
        const top = r.getBoundingClientRect().top;
        const button = r.querySelector('.sp-rbtn');
        const btn = button.getBoundingClientRect();
        const countEl = r.querySelector('.sp-rcount');
        const count = countEl.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(countEl);
        return {
          role: button.textContent.trim(),
          count: countEl.textContent,
          btnTop: btn.top - top,
          badge: button.querySelector('i').getBoundingClientRect().width,
          overflow: button.scrollWidth - button.clientWidth,
          // The role and its count never cover each other.
          apart: btn.right <= count.left || btn.bottom <= count.top,
          spill: Math.max(...[...range.getClientRects()].map(rc => rc.right)) - edge,
          width: roster.width,
          dots: r.querySelectorAll('.sp-dot').length,
          lines: new Set([...r.querySelectorAll('.sp-dot')].map(d => Math.round(d.getBoundingClientRect().top))).size,
        };
      }));
      const at = `${viewport.width}px`;
      assert.deepEqual(rows.map(r => [r.role, r.dots]),
        [['CSCustomer service', 3], ['LMLogistics manager', 80]], at);
      for (const r of rows) {
        assert.ok(r.btnTop < 12, `${at}: ${r.role} starts its row ${JSON.stringify(r)}`);
        assert.equal(Math.round(r.badge), 26, `${at}: ${r.role}'s badge keeps its size`);
        assert.ok(r.overflow <= 0, `${at}: ${r.role}'s name fits its button`);
        assert.ok(r.apart, `${at}: ${r.role} and its count overlap ${JSON.stringify(r)}`);
        assert.ok(r.spill <= 0.5, `${at}: ${r.role}'s count runs ${r.spill.toFixed(1)}px out of the block`);
      }
      assert.match(rows[1].count, /^80\s·\s4 off\s·\s\$64,000\/day$/);
      // Eighty dots at 16px a dot (11 and a 5px gap) fill the block's whole
      // width: a handful of lines, not eighty. Six from 768px up; the block is
      // barely 200px wide at 700px, which holds twelve a line.
      const perLine = Math.floor((rows[1].width + 5) / 16);
      assert.ok(rows[1].lines <= Math.min(Math.ceil(80 / perLine), width >= 768 ? 6 : 7),
        `${at}: ${rows[1].lines} lines of dots in ${rows[1].width.toFixed(0)}px`);
    } finally { await page.close(); }
  }
});

test('a silent shop shows the six pre-flight checks in the order it needs them', async () => {
  // Prices, stock and shelves are one chain in _alerts(): only the first of
  // them can fail, and the ones behind it were never looked at.
  const page = await site({shop: {revenue: 0, notTrading: ['prices', 'plan']}});
  try {
    const checks = await page.$$eval('#sitePanel .sp-pre [data-check]', els =>
      els.map(e => [e.dataset.check, e.className]));
    assert.deepEqual(checks, [
      ['closed', 'ok'], ['staff', 'ok'], ['prices', 'no'],
      // Never checked: the chain stops at prices.
      ['stock', 'unk'], ['shelves', 'unk'], ['plan', 'no'],
    ]);
  } finally { await page.close(); }

  const stock = await site({shop: {revenue: 0, notTrading: ['stock', 'plan']}});
  try {
    const checks = await stock.$$eval('#sitePanel .sp-pre [data-check]', els =>
      els.map(e => [e.dataset.check, e.className]));
    assert.deepEqual(checks, [
      ['closed', 'ok'], ['staff', 'ok'], ['prices', 'ok'], ['stock', 'no'], ['shelves', 'unk'],
      ['plan', 'no'],
    ]);
  } finally { await stock.close(); }

  // Shut with the game's switch and otherwise ready: the door is the one red
  // lamp, and its tip says closed rather than "missing: open".
  const closed = await site({shop: {revenue: 0, notTrading: ['closed']}});
  try {
    const checks = await closed.$$eval('#sitePanel .sp-pre [data-check]', els =>
      els.map(e => [e.dataset.check, e.className, e.dataset.tip]));
    assert.deepEqual(checks.map(c => c[1]), ['no', 'ok', 'ok', 'ok', 'ok', 'ok']);
    assert.equal(checks[0][0], 'closed');
    assert.equal(checks[0][2], 'temporarily closed');
    assert.equal(checks[1][2], 'staffed');
  } finally { await closed.close(); }

  // Every check passed and the site simply has not booked a day yet.
  const ready = await site({shop: {revenue: 0, notTrading: []}});
  try {
    const checks = await ready.$$eval('#sitePanel .sp-pre [data-check]', els => els.map(e => e.className));
    assert.deepEqual(checks, ['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
  } finally { await ready.close(); }

  // An older shop with a $0 day was never looked at by that finding, so it has
  // no list and draws no checks — five green ticks would be a lie.
  const old = await site({shop: {revenue: 0}});
  try {
    assert.equal(await old.locator('#sitePanel .sp-pre').count(), 0);
    assert.equal(await old.locator('#sitePanel .sp-lamp.off').count(), 1);
  } finally { await old.close(); }

  // An office has nothing to stock, shelve or deliver, and a trading site has
  // nothing to explain.
  const office = await site({shop: {status: 'office', type: 'Law Firm', revenue: 0,
                                    notTrading: ['staff', 'prices']}});
  try {
    const checks = await office.$$eval('#sitePanel .sp-pre [data-check]', els =>
      els.map(e => [e.dataset.check, e.className]));
    assert.deepEqual(checks, [['closed', 'ok'], ['staff', 'no'], ['prices', 'no']]);
  } finally { await office.close(); }

  const trading = await site();
  try {
    assert.equal(await trading.locator('#sitePanel .sp-pre').count(), 0);
  } finally { await trading.close(); }
});

// The fixture's save was written on day 29, so a full fortnight behind it runs
// days 15 to 28 — the same window _site_trends() compares.
const TODAY = 29;
const fortnight = (n = 16, last = TODAY - 1) => Array.from({length: n}, (_, i) =>
  ({day: last - n + 1 + i, profit: 100 + i, revenue: 1000 + i * 10, customers: 20 + i}));
const READY = [{key: KEY, ready: true, change: -0.1, last7: 700, prev7: 800}];
const grid = (office, staffedAt) => {
  const rows = wd => Array.from({length: 24}, (_, h) => h === 12 ? staffedAt : 0);
  return [{
    key: KEY, name: 'HART. Gifts', office, postRate: 1,
    customers: Array.from({length: 7}, () => Array.from({length: 24}, (_, h) => h === 12 ? 6 : 0)),
    weeks: [2, 2, 2, 2, 2, 2, 2], thin: Array(7).fill(false),
    staffed: Array.from({length: 7}, rows), onShift: Array.from({length: 7}, rows),
    effective: Array.from({length: 7}, rows),
    door: 50, cap: 50, counters: 3, stationCount: 4, basket: 30, peak: 6, capHours: 3,
  }];
};
// A day with one hour at each of the three ceilings. An hour is at the ceiling
// when the customers seen reach the capacity that was on, so customers and
// effective match; the number on the floor is what decides which ceiling held
// it: 50 reaches the door, 2 is short of the three counters, 3 mans them.
const STAFFED_AT = {9: 50, 12: 2, 15: 3};
// _hourly() gives every trading site a role per skill its stations ask for, so
// a shop with counters has exactly one, and it keeps the words the board has
// always used: `noun` null, so its cells and its findings say "register
// capacity", "staffing" and "registers" rather than naming the furniture.
const SERVICE = 'ba:skill_customerservice';
const mixedGrid = () => {
  const row = () => Array.from({length: 24}, (_, h) => STAFFED_AT[h] || 0);
  const week = () => Array.from({length: 7}, row);
  return [{
    key: KEY, name: 'HART. Gifts', office: false, postRate: 1,
    customers: week(), weeks: [2, 2, 2, 2, 2, 2, 2],
    thin: Array(7).fill(false), staffed: week(),
    onShift: week(), effective: week(),
    door: 50, cap: 50, counters: 3, stationCount: 4, basket: 30, peak: 50, capHours: 21,
    roles: [{
      skill: SERVICE, label: 'Customer Service', station: 'Cash register',
      noun: null, one: 'cash register', many: 'cash registers',
      counters: 3, stationCount: 3,
      staffed: week(), onShift: week(),
      posts: Array.from({length: 7}, () => Array(24).fill(1)),
    }],
  }];
};

test("the tiles carry the fortnight, the costs of the day and the ceilings", async () => {
  const page = await site({
    shop: {series: fortnight(), cogs: 400, profit: 200},
    trends: READY,
    hourFindings: [{kind: 'cap', key: KEY, site: 'HART. Gifts', office: false, hours: 3,
                    when: 'Fri 12-13', limit: 'the building', fix: '',
                    cap: 50, capTop: 50, basket: 30, throughput: 900}],
    hours: grid(false, 3),
  });
  try {
    // A fortnight of bars, the last seven of them picked out in the trend's colour.
    const spark = await page.$$eval('#sp-tiles .sp-spark', els =>
      els.map(e => [e.className.trim(), e.children.length, e.querySelectorAll('i.l').length]));
    assert.deepEqual(spark, [['sp-spark dn', 14, 7], ['sp-spark', 14, 7]]);
    // The cost bar replaces the profit tile's tooltip, and ends in the profit.
    assert.equal(await page.locator('#sp-tiles .sstat', {hasText: 'Profit'}).getAttribute('data-tip'), null);
    const parts = await page.$$eval('#sp-tiles .sp-cost i', els =>
      els.map(e => [e.className, e.dataset.read]));
    assert.equal(parts.at(-1)[0], 'p');
    assert.match(parts.at(-1)[1], /^Profit/);
    // The three ceilings, with the one this shop's busy hours ran into lit.
    const ceil = await page.$$eval('#sp-tiles .sp-ceil .sp-i', els =>
      els.map(e => e.classList.contains('on')));
    assert.deepEqual(ceil, [true, false, false]);
  } finally { await page.close(); }
});

test('a loss flags its tile, and a site with no trend draws a dashed line', async () => {
  const page = await site({shop: {profit: -500, series: fortnight(4)}});
  try {
    assert.equal(await page.locator('#sp-tiles .sp-flag').count(), 1);
    assert.equal(await page.locator('#sp-tiles .sp-cost i.l').count(), 1);
    assert.equal(await page.locator('#sp-profit polyline[stroke-dasharray]').count(), 1);
    assert.equal(await page.locator('#sp-profit .sp-band').count(), 0);
  } finally { await page.close(); }
});

test('two full weeks shade the chart with their own averages', async () => {
  const page = await site({shop: {series: fortnight(20)}, trends: READY});
  try {
    const bands = await page.$$eval('#sp-profit .sp-band', els =>
      els.map(e => [e.classList.contains('last'), e.dataset.read]));
    assert.equal(bands.length, 2);
    assert.equal(bands[1][0], true);
    // The windows are day numbers, not positions: days 15-21 and 22-28.
    assert.match(bands[0][1], /^<b>days 15–21<\/b> \$/);
    assert.match(bands[1][1], /^<b>days 22–28<\/b> \$/);
    assert.equal(await page.locator('#sp-profit polyline[stroke-dasharray]').count(), 0);
  } finally { await page.close(); }
});

test('a gap in the series is not two weeks, however many entries there are', async () => {
  // Days 1-7 and then 22-28: fourteen entries, one full week behind them.
  const page = await site({
    shop: {series: fortnight(7, 7).concat(fortnight(7, TODAY - 1))},
    trends: READY,
  });
  try {
    assert.equal(await page.locator('#sp-profit .sp-band').count(), 0);
    assert.equal(await page.locator('#sp-profit polyline[stroke-dasharray]').count(), 1);
  } finally { await page.close(); }
});

test('a trend with no week before it reads as a dash, not as no change', async () => {
  const page = await site({shop: {series: fortnight()},
                           trends: [{key: KEY, ready: true, change: null, last7: 700, prev7: 0}]});
  try {
    const chip = await page.locator('#sp-tiles .chip').first();
    assert.equal((await chip.innerText()).trim(), '—');
    assert.match(await chip.getAttribute('data-tip'), /took nothing to compare/);
    assert.equal(await page.locator('#sp-tiles .chip svg').count(), 0);
  } finally { await page.close(); }
});

test('the ramp chip counts only while the site is still ramping up', async () => {
  const ramping = await site({shop: {daysOpen: 9}});
  try {
    assert.equal((await ramping.locator('#sp-tiles .chip').first().innerText()).trim(), 'day 9 of 14');
  } finally { await ramping.close(); }

  // Old enough for a trend, but without the history behind it: no number to give.
  const old = await site({shop: {daysOpen: 40}});
  try {
    const chip = old.locator('#sp-tiles .chip').first();
    assert.equal((await chip.innerText()).trim(), '—');
    assert.match(await chip.getAttribute('data-tip'), /No full fortnight/);
    assert.ok(await chip.evaluate(e => e.classList.contains('none')));
  } finally { await old.close(); }
});

test('every ceiling the busy hours ran into gets a chip and a lit icon', async () => {
  // Three hours a day at the ceiling, each held by a different one: 09:00 has
  // the whole 50/h door on the floor, 12:00 runs 2 of the 3 counters, 15:00
  // runs all three. That is _hour_findings()' rule — door reached, else fewer
  // staffed than counters, else the counters themselves — so the three cap
  // rows below are what it would emit for this grid.
  // These three rows are not hand-written: they are what the real
  // _hour_findings() emits for mixedGrid(), copied verbatim.
  const cap = (when, limit, fix, at, throughput, limits) => ({kind: 'cap', key: KEY,
    site: 'HART. Gifts', office: false, hours: 7, when, limit, fix, cap: at, capTop: at,
    basket: 30, throughput, ...(limits ? {limits, noun: null} : {})});
  const page = await site({
    hours: mixedGrid(),
    hourFindings: [
      cap('every day 9', 'the building', '', 50, 1500),
      cap('every day 12', 'staffing', 'more service staff on those hours', 2, 60, 1),
      cap('every day 15', 'registers', 'another counter', 3, 90, 1),
    ],
  });
  try {
    // Before anything is pointed at, the read-out opens on the worst hour with
    // something to fix: 15:00, not the building's busier 09:00.
    assert.match(await page.locator('#hourRead').textContent(), /^Worst hour · Monday 15:00 /);
    // A cell says which kind of ceiling held it and whose role held it, as
    // `<kind>:<skill>`; the door is nobody's role, so its token stands alone.
    const chips = await page.$$eval('#sp-hours .sp-hchip.cap', els =>
      els.map(e => [e.dataset.limit, e.dataset.show]));
    assert.deepEqual(chips, [
      ['the building', 'door'],
      ['staffing', `staff:${SERVICE}`],
      ['registers', `post:${SERVICE}`]]);
    // The building's chip is information, not a warning: the neutral
    // modifier, no fix arrow, and a tip that only says how much. The staffing
    // and registers chips keep their warning look and their fixes.
    const chipLook = await page.$$eval('#sp-hours .sp-hchip.cap', els =>
      els.map(e => [e.classList.contains('sp-bcap'),
        e.querySelector('.fix') ? e.querySelector('.fix').textContent : null,
        /so the answer is/.test(e.dataset.tip)]));
    assert.deepEqual(chipLook, [
      [true, null, false],
      [false, 'more service staff on those hours', true],
      [false, 'another counter', true]]);
    const door = page.locator('#sp-hours .sp-hchip[data-show="door"]');
    assert.match(await door.getAttribute('data-tip'),
      /^At the building's capacity 7 hours a week \(every day 9\); \$[\d.,]+k?\/day of trade goes through those hours\.$/);
    assert.match(await door.innerText(), /at building capacity/);
    // Its hours wear the neutral ring too; the other ceilings' hours do not.
    const rings = await page.$$eval('#sp-hours .hc.cap', els =>
      [...new Set(els.map(e => `${e.dataset.caps.split(':')[0]}:${e.classList.contains('sp-bcap')}`))].sort());
    assert.deepEqual(rings, ['door:true', 'post:false', 'staff:false']);
    // And the ceiling tile's door icon is lit without the warning colour.
    assert.deepEqual(await page.$$eval('#sp-tiles .sp-ceil .sp-i.on', els => els.map(e => e.classList.contains('sp-bcap'))),
      [true, false, false]);
    // All three ceilings held hours here, so all three icons are lit.
    const ceil = await page.$$eval('#sp-tiles .sp-ceil .sp-i', els =>
      els.map(e => e.classList.contains('on')));
    assert.deepEqual(ceil, [true, true, true]);
    // Each hour wears the ceiling that held it, and it is the right hour: the
    // grid is seven rows of 24 cells, so cell wd*24+h is that weekday's hour h.
    const marks = await page.evaluate(skill => {
      const cells = [...document.querySelectorAll('#sp-hours .hc')];
      const mark = e => e.dataset.caps || null;
      return [...Array(7).keys()].map(wd =>
        [...Array(24).keys()].map(h => mark(cells[wd * 24 + h])).filter(Boolean).length === 3
          ? [mark(cells[wd * 24 + 9]), mark(cells[wd * 24 + 12]), mark(cells[wd * 24 + 15])]
          : ['extra marks on this day']);
    }, SERVICE);
    for(const day of marks)
      assert.deepEqual(day, ['door', `staff:${SERVICE}`, `post:${SERVICE}`]);
    // A chip lights exactly its own ceiling's hours — nothing else on the
    // grid, and not another ceiling's capped hours either.
    const HOUR = {door: 9, [`staff:${SERVICE}`]: 12, [`post:${SERVICE}`]: 15};
    for(const [mine, hour] of Object.entries(HOUR)){
      await page.hover(`#sp-hours .sp-hchip[data-show="${mine}"]`);
      const lit = await page.evaluate(() => [...document.querySelectorAll('#sp-hours .hc')]
        .map((e, i) => Number(getComputedStyle(e).opacity) === 1 ? i % 24 : null)
        .filter(h => h !== null));
      assert.deepEqual(lit, Array(7).fill(hour), `the ${mine} chip lights ${hour}:00 and nothing else`);
    }
  } finally { await page.close(); }
});

test('a site held only by its building opens on its busiest hour, at building capacity', async () => {
  // mixedGrid() with the 12:00 and 15:00 hours emptied: only the door's 09:00 is full.
  const [g] = mixedGrid();
  [g.customers, g.staffed, g.onShift, g.effective, g.roles[0].staffed, g.roles[0].onShift]
    .forEach(week => week.forEach(day => { day[12] = 0; day[15] = 0; }));
  const page = await site({
    hours: [g],
    hourFindings: [{kind: 'cap', key: KEY, site: 'HART. Gifts', office: false, hours: 7,
      when: 'every day 9', limit: 'the building', fix: '', cap: 50, capTop: 50, basket: 30, throughput: 1500}],
  });
  try {
    const read = await page.locator('#hourRead').textContent();
    assert.match(read, /^Busiest hour · Monday 09:00 50 customers/);
    assert.match(read, /at building capacity$/);
    assert.doesNotMatch(read, /at the ceiling/);
  } finally { await page.close(); }
});

test('a name out of the save is text, in the row and in the read-out it feeds', async () => {
  const hostile = '</b><img src=x onerror="window.__pwned=1">';
  const page = await site({
    shop: {people: Array.from({length: 13}, (_, i) =>
      ({name: i ? `Person ${i}` : hostile, role: 'Customer service', absent: false, daily: 100}))},
    alerts: [{id: 'a1', level: 'warn', site: 'HART. Gifts', siteKey: KEY, group: 'music',
              text: `HART. Gifts: ${hostile} went missing. And ${hostile} too`, worth: null, unit: ''}],
  });
  try {
    assert.equal(await page.locator('#sitePanel img').count(), 0);
    // The read-out assigns data-read to innerHTML, so the escaping has to
    // survive the trip through the attribute.
    await page.hover('#sitePanel .sp-dot');
    assert.equal(await page.locator('#sitePanel img').count(), 0);
    assert.match(await page.locator('#sitePanel .sp-roster + .sp-readout').innerText(), /onerror/);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
  } finally { await page.close(); }
});

test('an office draws its workstations where a shop draws its pull', async () => {
  const page = await site({shop: {status: 'office', type: 'Law Firm'}, hours: grid(true, 3)});
  try {
    assert.equal(await page.locator('#sp-pull').count(), 0);
    const squares = await page.$$eval('#sp-desks .sp-m', els =>
      els.map(e => e.classList.contains('sp-z')));
    // Four workstations, three of them manned at the busiest hour.
    assert.deepEqual(squares, [false, false, false, true]);
    assert.match(await page.locator('#sp-desks .sp-readout').innerText(), /3 of 4 staffed/);
  } finally { await page.close(); }
});

test('without a locker the uniform lamp is dashed, not struck', async () => {
  const page = await site({shop: {missingUniformLocker: true, uniformGaps: ['Customer service']}});
  try {
    const lamps = await page.$$eval('#sp-standards .sp-lampb.locker, #sp-standards .sp-lampb.shirt',
      els => els.map(e => e.dataset.state));
    assert.deepEqual(lamps, ['miss', 'unk']);
    assert.equal(await page.locator('#sp-standards .sp-role').count(), 1);
  } finally { await page.close(); }
});

test('the dimming a hovered finding switches on comes off with the redraw', async () => {
  const page = await site({alerts: [finding('a1', 'music'), finding('a2', 'outruns')]});
  try {
    await page.hover('.sp-find[data-id="a1"]');
    assert.equal(await page.locator('#sitePanel.sp-focus').count(), 1);
    await page.evaluate(() => drawSite());
    assert.equal(await page.locator('#sitePanel.sp-focus').count(), 0);
  } finally { await page.close(); }
});

test('rank is the place by the last seven days of profit, or nothing under seven', async () => {
  const days = (n, profit) => Array.from({length: n}, (_, i) =>
    ({day: i + 1, profit, revenue: profit * 2, customers: 5}));
  const page = await site({shop: {series: days(9, 100)}, peer: {series: days(9, 50)}});
  try {
    assert.deepEqual(await page.evaluate(k => spRank(k), KEY), {place: 1, of: 2});
    assert.deepEqual(await page.evaluate(k => spRank(k), OTHER), {place: 2, of: 2});
    // A peer with under seven entries has no place, and does not hand one on:
    // the shop above is still 1st of the two sites that trade.
    const short = await page.evaluate(() => {
      D.businesses[1].series = D.businesses[1].series.slice(0, 6);
      return [spRank(D.businesses[1].key), spRank(D.businesses[0].key)];
    });
    assert.deepEqual(short, [{place: null, of: 2}, {place: 1, of: 2}]);
    // And the chip by the name says the same thing.
    assert.match(await page.locator('#sitePanel .sp-rank').innerText(), /1\s*\/2/);
  } finally { await page.close(); }
});

// --- the depot and the factory ---------------------------------------------
// The fixture's save was written on day 29, so a delivery on day 33 is four
// days out and its truck sits on the fifth cell of the rail.
const DEPOT = {
  status: 'support', type: 'Warehouse', name: 'HART. Depot', revenue: 0, customers: 0,
  basket: null, profit: -400, margin: null, lines: [
    {item: 'Soda', slug: 'soda', units: 2100, rate: 0, price: 1, revenue: 0, soldPerDay: 0},
    {item: 'Napkins', slug: 'napkins', units: 5000, rate: 0, price: 1, revenue: 0, soldPerDay: 0},
  ],
};
const importRow = (over = {}) => Object.assign({
  s: 0, item: 'Soda', slug: 'soda', stock: 2100, perDay: 1150, basis: 'shipped',
  peakDay: 'Friday', peakPerDay: 1300, cover: 1.8, stockCover: 1.8, daysOnHand: 1.8,
  runsOut: 'Tuesday', weekly: 8000, lastWeek: 8000, weekNeed: 8050, orderFit: 'ok',
  coverFit: 'short', due: 4, shortBy: 2.2, catchUp: 2400, coverageUntil: 33, paused: false,
  arrives: 33, from: 'Acme', level: 'critical', reason: 'shortfall',
}, over);
const deadRow = {s: 0, item: 'Napkins', slug: 'napkins', stock: 5000, perWeek: 0, weeks: null,
                 target: 0, price: 1, value: 5000, dead: true, level: 'warn'};
/* Python's verdict on a line (supplyFact), which the depot and factory blocks
   read: a depot line's use is a week, an input's a day. */
const LVL = {covered: 'ok', made: 'ok', new: 'info', tight: 'warn', stalled: 'warn', idle: 'warn'};
const sf = (st, why = null, extra = {}) => ({st, why, lvl: LVL[st] || 'critical', role: 'depot', cad: 'weekly',
  use: 0, need: 0, have: 0, setTo: null, parts: {lines: 0, sites: 0, route: 0}, ...extra});
// Tokens are a one-to-one encoding of the item's own label, so the test spells
// them the way the panel does rather than hand-rolling a second rule.
const tok = s => 'sp-' + s.replace(/[^A-Za-z0-9-]/g, c => '_' + c.codePointAt(0).toString(16) + '_');
// A line is keyed on its slug, a machine on its list position.
const slugTok = slug => tok('s-' + slug);
const slotTok = slot => tok('m-' + slot);

const railOf = page => page.$$eval('#sp-stock tbody tr', rows => rows.map(r => ({
  el: r.dataset.el,
  cells: [...r.querySelectorAll('.sp-rail i')].map(i => i.className),
  trucks: [...r.querySelectorAll('.sp-rail .sp-trk')].map(t => ({
    d: t.style.getPropertyValue('--d'),
    held: t.classList.contains('sp-held'),
    early: t.classList.contains('sp-early'),
  })),
  zzz: !!r.querySelector('.sp-zz'),
})));

test('a depot draws its week of trucks, and no hour grid', async () => {
  const page = await site({
    shop: DEPOT,
    hours: grid(false, 3),
    supply: {
      day: 29,
      imports: [importRow(), importRow({item: 'Cheap Gift', slug: 'cheapgift', stock: 640,
        perDay: 310, cover: 2, coverFit: 'ok', runsOut: null, catchUp: 0, paused: true,
        weekly: 0, lastWeek: 2200, arrives: 34, coverageUntil: 34, reason: 'paused'})],
      idle: [deadRow],
      shops: [{s: 1, item: 'Soda', slug: 'soda', sold: 900, peakSold: 1000, peakDay: 'Friday',
               target: 1000, pressure: 100, stock: 40, from: 0, level: 'ok'}],
      facts: {0: {soda: sf('short', 'shortfall'), cheapgift: sf('paused', 'order'), napkins: sf('idle', 'notMoving')}},
    },
  });
  try {
    // An hour grid belongs to a shop and an office; a depot has none.
    assert.equal(await page.locator('#sp-hours').count(), 0);
    assert.equal(await page.locator('#sp-stock').count(), 1);
    assert.deepEqual(await railOf(page), [
      // Soda: one whole day covered, dry until the truck on the fifth cell.
      {el: `${slugTok('soda')} short`, cells: ['sp-c', 'sp-d', 'sp-d', 'sp-d', 'sp-c', 'sp-c', 'sp-c'],
       trucks: [{d: '4', held: false, early: false}], zzz: false},
      // A paused contract's truck is struck through and nothing behind it fills.
      {el: `${slugTok('cheapgift')} paused`,
       cells: ['sp-c', 'sp-c', 'sp-d', 'sp-d', 'sp-d', 'sp-d', 'sp-d'],
       trucks: [{d: '5', held: true, early: false}], zzz: false},
      // Nothing draws on the napkins, so there is no cover to run out.
      {el: `${slugTok('napkins')} dead`, cells: Array(7).fill(''), trucks: [], zzz: true},
    ]);
    // One row a site that draws on the depot, and the tile that counts them.
    assert.equal(await page.locator('#sp-feeds .sp-feed').count(), 1);
    assert.match(await page.locator('#sp-tiles .sstat', {hasText: 'Feeds'}).innerText(), /1\s*site/);
    // A depot books no sale, so the cost bar has no profit to close it with.
    assert.equal(await page.locator('#sp-tiles .sp-cost i.p, #sp-tiles .sp-cost i.l').count(), 0);
  } finally { await page.close(); }
});

test('a paused import whose delivery day has gone by is dry all week', async () => {
  // A paused contract keeps the delivery day it had when it was stopped, so
  // `arrives` is usually behind today, or never set at all. Neither leaves a
  // day for the dry run to end on.
  for (const arrives of [12, 0]) {
    const page = await site({
      shop: DEPOT,
      supply: {day: 29, imports: [importRow({cover: 2, coverFit: 'short', runsOut: 'Monday',
        catchUp: 0, paused: true, weekly: 0, lastWeek: 2200, arrives, coverageUntil: arrives,
        reason: 'paused'})], facts: {0: {soda: sf('paused', 'order')}}},
    });
    try {
      const [row] = await railOf(page);
      assert.deepEqual(row.cells,
        ['sp-c', 'sp-c', 'sp-d', 'sp-d', 'sp-d', 'sp-d', 'sp-d'], `arrives ${arrives}`);
      assert.deepEqual(row.trucks, []);
      assert.match(await page.locator('#sp-stock tbody tr').first().getAttribute('data-read'),
        /paused<\/b>; <b>2<\/b> days left/);
    } finally { await page.close(); }
  }
});

test('the truck the cover is measured against is the one the rail draws', async () => {
  // Two active suppliers, days 31 and 34. _scheduled_import_gap() projects
  // through the last drop, so cover, runsOut and catchUp are about day 34 —
  // and that is where the loaded truck goes. The earlier one rides along quietly.
  const page = await site({
    shop: DEPOT,
    supply: {day: 29, imports: [importRow({arrives: 31, coverageUntil: 34, cover: 3,
      coverFit: 'short', runsOut: 'Thursday', catchUp: 1200})], facts: {0: {soda: sf('short', 'shortfall')}}},
  });
  try {
    const [row] = await railOf(page);
    assert.deepEqual(row.trucks, [
      {d: '2', held: false, early: true},   // day 31, quietly
      {d: '5', held: false, early: false},  // day 34, the one the numbers are about
    ]);
    assert.deepEqual(row.cells,
      ['sp-c', 'sp-c', 'sp-c', 'sp-d', 'sp-d', 'sp-c', 'sp-c']);
    assert.match(await page.locator('#sp-stock tbody tr').first().getAttribute('data-read'),
      /Runs dry <b>Thursday<\/b>, the truck lands <b>Saturday<\/b>/);
  } finally { await page.close(); }
});

test('a delivery beyond the seven days still leaves the week dry', async () => {
  // Day 29, two days of cover, the order due on day 40: those five days are
  // dry before a delivery the rail has no room to draw.
  const far = await site({shop: DEPOT, supply: {day: 29, imports: [importRow({
    cover: 2, coverFit: 'short', runsOut: 'Monday', catchUp: 900,
    arrives: 40, coverageUntil: 40})], facts: {0: {soda: sf('short', 'shortfall')}}}});
  try {
    const [row] = await railOf(far);
    assert.deepEqual(row.cells, ['sp-c', 'sp-c', 'sp-d', 'sp-d', 'sp-d', 'sp-d', 'sp-d']);
    assert.deepEqual(row.trucks, []);
  } finally { await far.close(); }

  // A line nothing delivers at all is a different thing: what happens after
  // the cover runs out is unknown, not dry.
  const own = await site({
    shop: {...DEPOT, lines: [
      {item: 'Burger', slug: 'burger', units: 800, rate: 0, price: 1, revenue: 0, soldPerDay: 0}]},
    supply: {day: 29, shops: [{s: 1, item: 'Burger', slug: 'burger', sold: 400, peakSold: 400,
      peakDay: 'Friday', target: 500, pressure: 80, stock: 10, from: 0, level: 'ok'}],
      // Its use a day is the fact's week: 2,800 over seven days.
      facts: {0: {burger: sf('covered', null, {use: 2800})}}},
  });
  try {
    const [row] = await railOf(own);
    assert.deepEqual(row.cells, ['sp-c', 'sp-c', '', '', '', '', '']);
    assert.deepEqual(row.trucks, []);
  } finally { await own.close(); }
});

test('an item token tells names apart that a slug would run together', async () => {
  const page = await site();
  try {
    const toks = await page.evaluate(() =>
      ['A+B', 'A B', 'A-B', 'AB', 'Бублик', 'Bublik', ''].map(spTok));
    assert.equal(new Set(toks).size, toks.length, 'every name keeps a token of its own');
    for (const t of toks) assert.doesNotMatch(t, /\s/, 'a token never carries whitespace');
    // Two names that differ only in punctuation used to collapse into one.
    assert.notEqual(await page.evaluate(() => spTok('A+B')),
                    await page.evaluate(() => spTok('A B')));
  } finally { await page.close(); }
});

test('a depot finding pulses the line it is about', async () => {
  const page = await site({
    shop: DEPOT,
    supply: {day: 29, imports: [importRow()], idle: [deadRow]},
    alerts: [finding('d1', 'shortfall', 'HART. Depot', KEY, 'critical', {slug: 'soda'}),
             finding('d2', 'dead', 'HART. Depot', KEY, 'info', {slug: 'napkins'})],
  });
  try {
    // Stock standing still is a shelf on a shop and a line on a depot.
    const rows = await page.$$eval('#sitePanel .sp-find', rs =>
      rs.map(r => [r.dataset.id, r.dataset.ev, r.dataset.hit]));
    assert.deepEqual(rows, [['d1', 'stock', slugTok('soda')], ['d2', 'stock', slugTok('napkins')]]);
    await page.hover('.sp-find[data-id="d2"]');
    const hit = await page.$$eval('#sp-stock .sp-hit', els => els.map(e => e.dataset.el));
    assert.deepEqual(hit, [`${slugTok('napkins')} dead`]);
  } finally { await page.close(); }
});

test('a depot and a factory say each line\'s word as Checks does', async () => {
  let page = await site({
    shop: DEPOT,
    supply: {day: 29, imports: [importRow()], idle: [deadRow],
             facts: {0: {soda: sf('short', 'shortfall'), napkins: sf('idle', 'notMoving')}}},
  });
  try {
    const words = await page.$$eval('#sp-stock tbody tr', rs => rs.map(r => r.cells[0].textContent.replace(/\s+/g, ' ').trim()));
    assert.deepEqual(words, ['Soda short', 'Napkins idle']);
  } finally { await page.close(); }
  page = await site({shop: FACTORY, supply: {factories: factories(), facts: FACTORY_FACTS}});
  try {
    const words = await page.$$eval('#sp-inputs tbody tr', rs => rs.map(r => r.cells[0].textContent.replace(/\s+/g, ' ').trim()));
    assert.ok(words.includes('Ground Beef short') && words.includes('Grapes covered'), JSON.stringify(words));
  } finally { await page.close(); }
});

test('a wholesale finding opens its shop on the shelf row, lit, and a depot on its Stock', async () => {
  const shop = {lines: [
    {item: 'Gift', slug: 'gift', units: 40, rate: 30, price: 30, revenue: 900, soldPerDay: 30},
    {item: 'Energy Drink', slug: 'energy', units: 100, rate: 10, price: 5, revenue: 5, soldPerDay: 10}]};
  const a = finding('w1', 'wholesale', 'HART. Gifts', KEY, 'critical', {slug: 'energy'});
  const page = await site({shop, alerts: [a], supply: {facts: {0: {energy: sf('short', 'order',
    {role: 'shelf', cad: 'weekly', use: 70, need: 81, have: 50, setTo: 90, wholesale: true})}}}});
  try {
    const landed = await page.evaluate(async a => {
      showPage('today'); goToAlert(a);
      await new Promise(r => setTimeout(r, 1200));
      const row = [...document.querySelectorAll('#sp-shelves tbody tr')].find(tr => /Energy Drink/.test(tr.textContent));
      const r = row ? row.getBoundingClientRect() : null;
      return {row: !!row, lit: !!row && row.classList.contains('sp-hit'), inView: !!r && r.top >= 0 && r.bottom <= innerHeight};
    }, a);
    // The drink sits in the folded odds and ends: the fold opens for it.
    assert.deepEqual(landed, {row: true, lit: true, inView: true});
    // And its row says the word Checks says.
    const cell = await page.$$eval('#sp-shelves tbody tr', rs => rs.map(r => r.cells[0].firstChild.textContent.trim() + ' ' +
      (r.cells[0].querySelector('.chip') || {}).textContent));
    assert.ok(cell.includes('Energy Drink short'), JSON.stringify(cell));
  } finally { await page.close(); }
  const depot = await site({shop: DEPOT, alerts: [finding('w2', 'wholesale', 'HART. Depot', KEY, 'warn', {slug: 'soda'})],
    supply: {day: 29, imports: [importRow()], facts: {0: {soda: sf('short', 'order', {wholesale: true})}}}});
  try {
    const hit = await depot.$$eval('#sitePanel .sp-find', rs => rs.map(r => [r.dataset.ev, r.dataset.hit]));
    assert.deepEqual(hit, [['stock', slugTok('soda')]]);
  } finally { await depot.close(); }
});

/* A link from Today to a line of a depot's Stock opens the depot there with
   the line lit, even where the depot holds none of it yet. */
for (const width of [1440, 390]) {
  test(`a top-up or wholesale finding on a depot lands on its Stock row, lit (${width} px)`, async () => {
    for (const [group, slug, fact] of [
      ['topup', 'cups', sf('short', 'target', {cad: 'daily', use: 100, need: 115, have: 80, setTo: 120, from: 1})],
      ['wholesale', 'syrup', sf('short', 'order', {use: 1680, need: 1680, have: 1000, setTo: 1680, wholesale: true, day: 'Monday'})],
    ]) {
      const a = finding(`l-${group}`, group, 'HART. Depot', KEY, 'critical', {slug});
      const page = await site({shop: DEPOT, alerts: [a], viewport: {width, height: 900},
        supply: {day: 29, imports: [importRow()], facts: {0: {soda: sf('covered'), [slug]: fact}}}});
      try {
        const landed = await page.evaluate(async a => {
          showPage('today'); goToAlert(a);
          await new Promise(r => setTimeout(r, 1200));
          const lit = [...document.querySelectorAll('#sp-stock tbody tr.sp-hit')];
          const r = lit[0] ? lit[0].getBoundingClientRect() : null;
          return {lit: lit.map(tr => tr.cells[0].textContent.replace(/\s+/g, ' ').trim()),
                  inView: !!r && r.top >= 0 && r.bottom <= innerHeight};
        }, a);
        assert.equal(landed.lit.length, 1, `${group}: ${JSON.stringify(landed)}`);
        assert.match(landed.lit[0], /short$/);
        assert.ok(landed.inView, group);
      } finally { await page.close(); }
    }
  });
}

const FACTORY_SITE = {
  s: 0, machines: 5, targets: {}, known: true, arrivals: {},
  lines: [
    {rid: 'r1', item: 'Burger', slug: 'burger', missing: [], workstation: 'Food Workstation',
     slots: [1, 2], machines: 2, rate: 200, makes: 9600, ships: 9480, stock: 2100,
     toCity: 0, toPier: 0, basis: 'match', piling: false, atRoster: 9600,
     hoursWeek: 336, fullWeek: 336, gaps: []},
    {rid: 'r2', item: 'Bottle of Wine', slug: 'wine', missing: [],
     workstation: 'Bottled Goods Workstation', slots: [3], machines: 1, rate: 50, makes: 1200,
     ships: 470, stock: 9400, toCity: 0, toPier: 0, basis: 'match', piling: true,
     atRoster: 1029, hoursWeek: 144, fullWeek: 168,
     gaps: [{slot: 3, hours: 144, off: 'on Sundays'}]},
  ],
  unnamed: [
    {rid: 'r9', workstation: 'Food Workstation', slots: [4], machines: 1, idle: false,
     candidates: [{slug: 'pizza', item: 'Pizza'}], hoursWeek: 168, fullWeek: 168, gaps: []},
    {rid: null, workstation: 'Bottled Goods Workstation', slots: [5], machines: 1, idle: true,
     candidates: [], hoursWeek: 168, fullWeek: 168, gaps: []},
  ],
  needs: [
    {item: 'Ground Beef', slug: 'gb', perDay: 9600, perWeek: 67200, lines: ['Burger'],
     target: 8000, raiseTarget: 9600, raiseImport: null, dailyNeed: 9600, arrives: 1900,
     known: true, stock: 1900, from: 1, directImport: false, stalled: false, waitingOn: [],
     importWeekly: null, depotNeed: 67200, staffedShare: 1, madeAt: [], depotStock: 4000,
     status: 'target', level: 'critical'},
    {item: 'Grapes', slug: 'grapes', perDay: 2400, perWeek: 16800, lines: ['Bottle of Wine'],
     target: 2400, raiseTarget: null, raiseImport: null, dailyNeed: 2400, arrives: 2380,
     known: true, stock: 3000, from: 1, directImport: false, stalled: false, waitingOn: [],
     importWeekly: null, depotNeed: 16800, staffedShare: 1, madeAt: [], depotStock: 900,
     status: 'ok', level: 'ok'},
  ],
};
const factories = (over = {}) => Object.assign(
  {sites: [FACTORY_SITE], machines: 5, unnamed: 2, character: 'sp-fixture',
   aliases: {}, depots: {}, depotOther: {}}, over);
/* The two inputs' facts: the beef's top-up is below a day's need, the grapes are fed. */
const FACTORY_FACTS = {0: {
  gb: sf('short', 'target', {role: 'input', cad: 'daily', use: 9600, need: 9600, have: 8000, setTo: 9600}),
  grapes: sf('covered', null, {role: 'input', cad: 'daily', use: 2400, need: 2400, have: 2400}),
}};
const FACTORY = {...DEPOT, name: 'HART. Works', type: 'Factory',
                 lines: [{item: 'Burger', slug: 'burger', units: 2100, rate: 0, price: 1,
                          revenue: 0, soldPerDay: 0}]};

test('a factory fills each machine square by the week it is rostered', async () => {
  const page = await site({shop: FACTORY, supply: {day: 29, factories: factories()}});
  try {
    const lines = await page.$$eval('#sp-lines .sp-line:not(.sp-head)', rows => rows.map(r => ({
      line: r.dataset.line,
      fill: [...r.querySelectorAll('.sp-m')].map(m => m.style.getPropertyValue('--h')),
      mark: [...r.querySelectorAll('.sp-m')].map(m => m.className),
      slots: [...r.querySelectorAll('.sp-m')].map(m => m.dataset.el),
      stop: !!r.querySelector('.sp-belt.sp-stop'),
    })));
    assert.deepEqual(lines, [
      {line: slugTok('burger'), fill: ['100%', '100%'], mark: ['sp-m', 'sp-m'],
       slots: [slotTok(1), slotTok(2)], stop: false},
      // 144 of 168 hours rostered: the square is 86% full.
      {line: slugTok('wine'), fill: ['86%'], mark: ['sp-m'], slots: [slotTok(3)], stop: false},
      // A machine running a recipe the board cannot name keeps its picker.
      {line: 'sp-unnamed-0', fill: [''], mark: ['sp-m sp-q'], slots: [slotTok(4)], stop: false},
      // One with no recipe at all is staffed, rented, and making nothing.
      {line: 'sp-unnamed-1', fill: [''], mark: ['sp-m sp-z'], slots: [slotTok(5)], stop: true},
    ]);
    assert.equal(await page.locator('#sp-lines select.linepick').count(), 1);
    assert.equal(await page.locator('#sp-lines .sp-pile').count(), 1);
    // The read-out names the machine and the hours behind the fill.
    await page.hover(`#sp-lines .sp-line[data-line="${slugTok('wine')}"] .sp-m`);
    assert.match(await page.locator('#sp-lines .sp-readout').innerText(),
      /Machine 3 · 144 of 168 h rostered: nobody on it on Sundays/);
  } finally { await page.close(); }
});

test('the picker is offered on the same terms the Supply page offers it', async () => {
  // No candidates to choose from, or no recipe id to attach a choice to.
  const page = await site({shop: FACTORY, supply: {day: 29, factories: factories({sites: [
    {...FACTORY_SITE, lines: [], unnamed: [
      {rid: 'r9', workstation: 'Food Workstation', slots: [4], machines: 1, idle: false,
       candidates: [], hoursWeek: 168, fullWeek: 168, gaps: []},
    ]}]})}});
  try {
    assert.equal(await page.locator('#sp-lines select.linepick').count(), 0);
    assert.match(await page.locator('#sp-lines .sp-line:not(.sp-head) .quiet').innerText(),
      /Unnamed recipe/);
  } finally { await page.close(); }
});

test('hovering a factory input lights the lines that draw on it', async () => {
  const page = await site({shop: FACTORY, supply: {day: 29, factories: factories(), facts: FACTORY_FACTS}});
  try {
    const rows = await page.$$eval('#sp-inputs tbody tr', rs =>
      rs.map(r => [r.dataset.lines, r.dataset.el, r.dataset.read]));
    assert.deepEqual(rows, [
      [slugTok('burger'), `${slugTok('gb')} target`,
       'Tops up to <b>8,000</b>, the machines eat <b>9,600</b>'],
      [slugTok('wine'), slugTok('grapes'), 'In step'],
    ]);
    await page.hover('#sp-inputs tbody tr:first-child');
    const lit = await page.$$eval('#sp-lines .sp-line.sp-on', els => els.map(e => e.dataset.line));
    assert.deepEqual(lit, [slugTok('burger')]);
    assert.equal(await page.locator('#sp-lines .sp-lines.sp-dim').count(), 1);
    // The top-up that has to be raised says what to set it to.
    assert.match(await page.locator('#sp-inputs .sp-up.bad').innerText(), /8,000\s*9,600/);
  } finally { await page.close(); }
});

test('every finding on a depot and a factory points at a block and a row that are there', async () => {
  // A depot and a factory are both `support` sites, so the import, idle-stock
  // and staffing findings can all carry one of their keys. `satisfaction` is
  // a shop's alone and neither of them draws its block.
  const groups = ['notrading', 'loss', 'trend', 'staff', 'jobdemand', 'dead', 'target',
                  'shortfall', 'order', 'paused', 'feed', 'unnamed', 'unset', 'satisfaction'];
  // What each group carries as its evidence, in the shape _alerts() writes it.
  // The depot holds "Soda"; the factory eats "gb" and makes "burger".
  const evOf = kind => ({
    staff: {slot: 3, slug: kind === 'factory' ? 'wine' : null},
    dead: {slug: kind === 'factory' ? 'burger' : 'soda'},
    target: {slug: kind === 'factory' ? 'gb' : 'soda'},
    shortfall: {slug: kind === 'factory' ? 'gb' : 'soda'},
    order: {slug: kind === 'factory' ? 'gb' : 'soda'},
    paused: {slug: kind === 'factory' ? 'gb' : 'soda'},
    // _feed_notes re-keys an import finding to the depot that imports it, and
    // the slug is the only thing that joins the recipe's label to the depot's.
    // On the depot the goods are its own line; nothing else here shares it.
    feed: {slug: kind === 'factory' ? 'gb' : 'cheapgift'},
  });
  for (const [kind, shop, supply] of [
    ['depot', DEPOT, {day: 29, idle: [deadRow],
      imports: [importRow(), importRow({item: 'Cheap Gift', slug: 'cheapgift'})]}],
    ['factory', FACTORY, {day: 29, factories: factories()}],
  ]) {
    const ev = evOf(kind);
    const alerts = groups.map((g, i) =>
      finding(`g${i}`, g, 'HART. Site', KEY, 'warn', ev[g] || null));
    const page = await site({shop, supply, alerts, minor: []});
    try {
      await page.click('[data-allfinds]');
      const rows = await page.$$eval('#sitePanel .sp-find', rs =>
        rs.map(r => [r.dataset.id, r.dataset.ev || null, r.dataset.hit || null]));
      const blocks = await page.$$eval('#sitePanel [data-block]', bs => bs.map(x => x.dataset.block));
      for (const [id, block, hit] of rows) {
        if (block) assert.ok(blocks.includes(block), `${kind}: ${id} points at ${block}, which is drawn`);
        // A hit has to sit inside the block the row scrolls to: elsewhere on
        // the page is a dimmed panel and a pulse the reader never sees.
        for (const t of (hit || '').split(' ').filter(Boolean))
          assert.ok(await page.locator(`[data-block="${block}"] [data-el~="${t}"]`).count() > 0,
            `${kind}: ${id} pulses ${t}, which is inside ${block}`);
      }
      // And the ones that belong somewhere else on this kind land there.
      const at = g => rows[groups.indexOf(g)][1];
      assert.equal(at('trend'), 'tiles');
      assert.equal(at('shortfall'), kind === 'depot' ? 'stock' : 'inputs');
      assert.equal(at('feed'), kind === 'depot' ? 'stock' : 'inputs');
      assert.equal(at('staff'), kind === 'depot' ? 'crew' : 'lines');
      // Stock standing still is a line on a depot; at a factory it follows
      // the goods — an input it eats, or something it makes.
      assert.equal(at('dead'), kind === 'depot' ? 'stock' : 'lines');
      assert.equal(at('target'), kind === 'depot' ? 'stock' : 'inputs');
      // A group neither kind draws points nowhere at all, rather than dimming
      // the page and scrolling to nothing.
      assert.equal(at('satisfaction'), null);
      assert.equal(at(kind === 'depot' ? 'unnamed' : 'notrading'),
        kind === 'depot' ? null : 'tiles');
    } finally { await page.close(); }
  }
});

test("a factory's own findings pulse the machine and the line they name", async () => {
  const page = await site({
    shop: FACTORY, supply: {day: 29, factories: factories()},
    alerts: [
      finding('f1', 'staff', 'HART. Works', KEY, 'critical', {slot: 3, slug: 'wine'}),
      // A machine the board cannot read names a workstation, not an item, so
      // these two keep the fixed marks their rows carry.
      finding('f2', 'unnamed', 'HART. Works', KEY, 'warn'),
      finding('f3', 'unset', 'HART. Works', KEY, 'critical'),
    ],
  });
  try {
    const rows = await page.$$eval('#sitePanel .sp-find', rs =>
      rs.map(r => [r.dataset.id, r.dataset.ev, r.dataset.hit]));
    assert.deepEqual(rows, [
      // A staffing finding names a list position as well as its line.
      ['f1', 'lines', `${slugTok('wine')} ${slotTok(3)}`],
      ['f2', 'lines', 'unnamed'],
      ['f3', 'lines', 'unset'],
    ]);
    await page.hover('.sp-find[data-id="f1"]');
    assert.deepEqual(await page.$$eval('#sp-lines .sp-hit', els => els.map(e => e.dataset.el)),
      [slugTok('wine'), slotTok(3)]);
    await page.hover('.sp-find[data-id="f3"]');
    assert.deepEqual(await page.$$eval('#sp-lines .sp-hit', els => els.map(e => e.dataset.el)),
      ['unset']);
  } finally { await page.close(); }
});

test('unknown production reads as a dash, never as a zero', async () => {
  // Every machine runs a recipe the board cannot name: what it makes is not
  // known, and nothing here is measured at nought.
  const blind = await site({shop: FACTORY, supply: {day: 29, factories: factories({sites: [
    {...FACTORY_SITE, lines: [], needs: []}]})}});
  try {
    const tiles = await blind.$$eval('#sp-tiles .sstat', els =>
      els.map(e => e.querySelector('.v').textContent.trim()));
    assert.deepEqual(tiles.slice(0, 3), ['5', '—', '—']);
    assert.equal(await blind.locator('#sp-tiles .sp-meter').count(), 0);
    // And the reader is told why the totals are short.
    assert.match(await blind.locator('#sp-lines .why').getAttribute('data-tip'),
      /cannot name is in none of the totals/);
  } finally { await blind.close(); }

  // The production keys missing outright: still a dash, not a zero.
  const bare = await site({shop: FACTORY, supply: {day: 29, factories: factories({sites: [
    {s: 0, machines: 3, lines: [{item: 'Burger', slug: 'burger', workstation: 'Food Workstation',
                                 slots: [1], machines: 1}], unnamed: []}]})}});
  try {
    const tiles = await bare.$$eval('#sp-tiles .sstat', els =>
      els.map(e => e.querySelector('.v').textContent.trim()));
    assert.deepEqual(tiles.slice(0, 3), ['3· 1 running', '—', '—']);
  } finally { await bare.close(); }
});

test('a depot line nothing imports is covered by what leaves it', async () => {
  // The recipe calls the input "Bag of Tomatoes"; the depot line is "Tomatoes".
  // Only the slug says they are the same goods.
  const page = await site({
    shop: {...DEPOT, lines: [
      {item: 'Tomatoes', slug: 'tomato', units: 14200, rate: 0, price: 1, revenue: 0, soldPerDay: 0},
      {item: 'Napkins', slug: 'napkins', units: 5000, rate: 0, price: 1, revenue: 0, soldPerDay: 0},
    ]},
    supply: {
      day: 29,
      factories: factories({sites: [{...FACTORY_SITE, s: 1, unnamed: [],
        lines: [{...FACTORY_SITE.lines[0], item: 'Tomato Soup', slug: 'soup'}],
        needs: [{...FACTORY_SITE.needs[0], item: 'Bag of Tomatoes', slug: 'tomato',
                 perDay: 4100, lines: ['Tomato Soup'], from: 0}]}]}),
      facts: {0: {tomato: sf('covered', null, {use: 28700}), napkins: sf('idle', 'notMoving')}},
    },
  });
  try {
    const rows = await page.$$eval('#sp-stock tbody tr', rs => rs.map(r => ({
      el: r.dataset.el, read: r.dataset.read,
      cells: [...r.querySelectorAll('td')].map(td => td.textContent.trim()),
      zzz: !!r.querySelector('.sp-zz'),
    })));
    // 14,200 on hand against 4,100 a day is 3.5 days, and the factory that
    // makes the soup is not what tops this line up.
    assert.equal(rows[0].el, slugTok('tomato'));
    assert.equal(rows[0].read, '<b>3.5</b> days on hand');
    assert.equal(rows[0].cells.at(-1), '1');
    assert.equal(rows[0].zzz, false);
    // Nothing draws on the napkins, so there is no cover and no truck.
    assert.equal(rows[1].el, `${slugTok('napkins')} dead`);
    assert.equal(rows[1].zzz, true);
    assert.match(rows[1].read, /Idle stock.*nothing draws on these/);
    assert.equal(rows[1].cells.at(-2), '—');
    // The Thinnest tile reads the same row, not only the imported lines.
    assert.match(await page.locator('#sp-tiles .sstat', {hasText: 'Thinnest'}).innerText(),
      /3\.5 d\s*Tomatoes/);
  } finally { await page.close(); }
});

test('a depot line made in this company names the factory that makes it', async () => {
  const page = await site({
    shop: {...DEPOT, lines: [
      {item: 'Burger', slug: 'burger', units: 14200, rate: 0, price: 1, revenue: 0, soldPerDay: 0}]},
    supply: {
      day: 29,
      shops: [{s: 1, item: 'Burger', slug: 'burger', sold: 4100, peakSold: 4500,
               peakDay: 'Friday', target: 5000, pressure: 90, stock: 400, from: 0, level: 'ok'}],
      factories: factories({sites: [{...FACTORY_SITE, s: 1, unnamed: [], needs: [],
        lines: [FACTORY_SITE.lines[0]]}]}),
    },
  });
  try {
    const cells = await page.$$eval('#sp-stock tbody tr td', tds => tds.map(td => td.textContent.trim()));
    assert.match(cells.at(-2), /^made at /);
  } finally { await page.close(); }
});

test('naming a line on the factory panel redraws it named', async () => {
  const page = await site({
    shop: FACTORY,
    plan: {recipes: [{slug: 'pizza', item: 'Pizza', out: 40,
                      ingredients: [{slug: 'dough', item: 'Dough', per: 2}]}]},
    supply: {day: 29, factories: factories({sites: [
      {...FACTORY_SITE, lines: [], needs: [], unnamed: [FACTORY_SITE.unnamed[0]]}]})},
  });
  try {
    // Nothing is named yet: one machine, no output the board can put a figure to.
    assert.equal(await page.locator('#sp-lines select.linepick').count(), 1);
    assert.match(await page.locator('#sp-tiles .sstat', {hasText: 'Made / day'}).innerText(), /—/);
    assert.equal(await page.locator('#sp-inputs tbody tr').count(), 0);

    await page.selectOption('#sp-lines select.linepick', {label: 'Pizza'});

    // nameLine() keeps the choice and redraws the open site, so the line is
    // named here the same way it is on the Supply page.
    const lines = await page.$$eval('#sp-lines .sp-line:not(.sp-head)', rows =>
      rows.map(r => r.textContent.replace(/\s+/g, ' ').trim()));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^Pizza\s*Food Workstation · #4/);
    assert.equal(await page.locator('#sp-lines select.linepick').count(), 0);
    // Its input followed it in, and its output is a figure now.
    assert.match(await page.locator('#sp-inputs tbody tr').first().innerText(), /Dough/);
    assert.match(await page.locator('#sp-tiles .sstat', {hasText: 'Made / day'}).innerText(),
      /960\s*of 960 rated/);
    // And the choice really went to the store the Supply page reads.
    assert.deepEqual(await page.evaluate(() => localNames()), {r9: 'pizza'});
  } finally { await page.close(); }
});

test('an empty depot and an unreadable factory still draw', async () => {
  const bare = await site({shop: {...DEPOT, lines: [], staff: 0, staffCost: 0, crew: [], people: []}});
  try {
    assert.equal(await bare.locator('#sp-stock').count(), 1);
    assert.equal(await bare.locator('#sp-stock tbody tr').count(), 0);
    assert.equal((await bare.locator('#sp-stock .quiet').innerText()).trim(), 'No stock');
    assert.equal((await bare.locator('#sp-feeds .quiet').innerText()).trim(), 'No feeds');
    assert.match(await bare.locator('#sp-tiles .sstat', {hasText: 'Thinnest'}).innerText(), /—/);
    assert.match(await bare.locator('#sp-tiles .sstat', {hasText: 'On the floor'}).innerText(), /—/);
  } finally { await bare.close(); }

  // A factory row with the keys simply missing: no needs, no unnamed, a line
  // with no machines and no gaps, and an item with no name at all.
  const holes = await site({shop: FACTORY, supply: {day: 29, factories: factories({sites: [
    {s: 0, lines: [{item: null, slug: null, workstation: null}]}]})}});
  try {
    assert.equal(await holes.locator('#sp-lines .sp-line:not(.sp-head)').count(), 1);
    assert.equal(await holes.locator('#sp-lines .sp-m').count(), 0);
    assert.equal((await holes.locator('#sp-inputs .quiet').innerText()).trim(), 'No inputs');
    assert.equal(await holes.locator('#sp-tiles .sstat').count(), 4);
  } finally { await holes.close(); }

  // A machine listed among the gaps is not fully rostered by definition, so
  // one whose hours did not come through is unknown, never a full square.
  const noHours = await site({shop: FACTORY, supply: {day: 29, factories: factories({sites: [
    {...FACTORY_SITE, unnamed: [], needs: [], lines: [{...FACTORY_SITE.lines[0],
      slots: [1], machines: 1, gaps: [{slot: 1, off: 'Sunday'}]}]}]})}});
  try {
    const square = noHours.locator('#sp-lines .sp-m').first();
    // Its own mark: an empty dashed square, not the amber ? of a recipe the
    // board cannot name.
    assert.equal(await square.getAttribute('class'), 'sp-m sp-u');
    assert.equal((await square.innerText()).trim(), '');
    assert.match(await square.getAttribute('data-read'),
      /^Machine 1 · hours <b>not known<\/b>: nobody on it Sunday$/);
    assert.equal(await square.evaluate(e => e.style.getPropertyValue('--h')), '');
  } finally { await noHours.close(); }

  // _factories() hands back `sites: []` when nothing could be read at all, and
  // a factory with no row of its own is a depot as far as the fork is concerned.
  const none = await site({shop: FACTORY, supply: {day: 29, factories: factories({sites: []})}});
  try {
    assert.equal(await none.locator('#sp-lines').count(), 0);
    assert.equal(await none.locator('#sp-stock').count(), 1);
    // Its own holding is all a depot has to show for it.
    assert.equal(await none.locator('#sp-stock tbody tr').count(), 1);
  } finally { await none.close(); }
});

test("a name out of the save is text on the depot and the factory page", async () => {
  const hostile = '</td><img src=x onerror="window.__pwned=1">';
  const factory = await site({
    shop: FACTORY,
    supply: {day: 29, factories: factories({sites: [{...FACTORY_SITE,
      lines: [{...FACTORY_SITE.lines[0], item: hostile, slug: hostile}],
      unnamed: [{...FACTORY_SITE.unnamed[0], workstation: hostile,
                 candidates: [{slug: 'p', item: hostile}]}],
      needs: [{...FACTORY_SITE.needs[0], item: hostile, slug: hostile, lines: [hostile]}]}]})},
  });
  try {
    assert.equal(await factory.locator('#sitePanel img').count(), 0);
    await factory.hover('#sp-inputs tbody tr:first-child');
    await factory.hover('#sp-lines .sp-m');
    assert.equal(await factory.locator('#sitePanel img').count(), 0);
    assert.equal(await factory.evaluate(() => window.__pwned), undefined);
  } finally { await factory.close(); }

  const depot = await site({
    shop: {...DEPOT, lines: [{item: hostile, slug: hostile, units: 9, rate: 0, price: 1,
                              revenue: 0, soldPerDay: 0}]},
    peer: {name: hostile},
    supply: {
      day: 29,
      imports: [importRow({item: hostile, slug: 'hostileimport', from: hostile})],
      idle: [{...deadRow, item: hostile, slug: 'hostileidle'}],
      shops: [{s: 1, item: hostile, slug: hostile, sold: 500, peakSold: 600, peakDay: 'Friday',
               target: 1000, pressure: 60, stock: 40, from: 0, level: 'ok'}],
    },
  });
  try {
    assert.equal(await depot.locator('#sitePanel img').count(), 0);
    await depot.hover('#sp-stock tbody tr:first-child');
    assert.equal(await depot.locator('#sitePanel img').count(), 0);
    // The read-out assigns data-read to innerHTML, so the escaping has to
    // survive the trip through the attribute.
    assert.equal(await depot.evaluate(() => window.__pwned), undefined);
    assert.equal(await depot.locator('#sp-feeds .sp-feed').count(), 1);
    assert.equal(await depot.locator('#sp-feeds img').count(), 0);
  } finally { await depot.close(); }
});

test('a depot expected to hold something and holding none draws that row', async () => {
  // A factory input routed from this depot, with no standing import and
  // nothing on the floor: the slug is in none of imports, idle rows or
  // holdings, and its absence is the whole finding.
  const page = await site({
    shop: {...DEPOT, lines: []},
    supply: {day: 29, factories: factories({sites: [{...FACTORY_SITE, s: 1, unnamed: [],
      lines: [FACTORY_SITE.lines[0]],
      needs: [{...FACTORY_SITE.needs[0], item: 'Bag of Tomatoes', slug: 'tomato',
               perDay: 4100, lines: ['Burger'], from: 0, target: 0,
               status: 'noplan', level: 'warn'}]}]}),
      // Nothing brings it to the depot: no standing import.
      facts: {0: {tomato: sf('noplan')}}},
    alerts: [finding('n1', 'feed', 'HART. Depot', KEY, 'warn', {slug: 'tomato'})],
  });
  try {
    const rows = await page.$$eval('#sp-stock tbody tr', rs => rs.map(r => ({
      el: r.dataset.el, read: r.dataset.read,
      cells: [...r.querySelectorAll('td')].map(td => td.textContent.trim()),
      red: !!r.querySelector('.sp-red'),
      cells7: [...r.querySelectorAll('.sp-rail i')].map(i => i.className),
    })));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].el, slugTok('tomato'));
    // Nothing on hand, in red, with the factory that draws it counted.
    assert.equal(rows[0].cells[1], '0');
    assert.equal(rows[0].red, true);
    assert.equal(rows[0].cells[2], '4,100');
    assert.match(rows[0].cells.at(-2), /no import/);
    assert.equal(rows[0].cells.at(-1), '1');
    assert.deepEqual(rows[0].cells7, Array(7).fill(''));
    assert.match(rows[0].read, /^<b>Nothing on hand<\/b>; <b>4,100<\/b>\/day/);
    // And the finding that named it now has a row to pulse.
    const row = await page.$eval('#sitePanel .sp-find', r => [r.dataset.ev, r.dataset.hit]);
    assert.deepEqual(row, ['stock', slugTok('tomato')]);
    await page.hover('#sitePanel .sp-find');
    assert.equal(await page.locator('#sp-stock .sp-hit').count(), 1);
  } finally { await page.close(); }
});

test('a finding whose row the panel did not draw carries no hit at all', async () => {
  // Nothing on this depot knows the slug: no import, no idle pile, no holding
  // and no factory drawing it from here. The block is still worth scrolling
  // to; a pulse that lands on nothing would only dim the page.
  const depot = await site({
    shop: DEPOT,
    supply: {day: 29, imports: [importRow()], idle: [deadRow]},
    alerts: [finding('x1', 'feed', 'HART. Depot', KEY, 'warn', {slug: 'nowhere'})],
  });
  try {
    const rows = await depot.$$eval('#sitePanel .sp-find', rs =>
      rs.map(r => [r.dataset.id, r.dataset.ev || null, r.dataset.hit || null]));
    assert.deepEqual(rows, [['x1', 'stock', null]]);
  } finally { await depot.close(); }

  // A machine position no square on this factory's Lines carries.
  const works = await site({
    shop: FACTORY,
    supply: {day: 29, factories: factories()},
    alerts: [finding('x2', 'staff', 'HART. Works', KEY, 'warn', {slot: 99, slug: 'wine'}),
             finding('x3', 'staff', 'HART. Works', KEY, 'warn', {slot: 3, slug: 'nowhere'})],
  });
  try {
    const rows = await works.$$eval('#sitePanel .sp-find', rs =>
      rs.map(r => [r.dataset.id, r.dataset.ev || null, r.dataset.hit || null]));
    // Each keeps the half of its evidence the Lines block really holds.
    assert.deepEqual(rows, [['x2', 'lines', slugTok('wine')],
                            ['x3', 'lines', slotTok(3)]]);
  } finally { await works.close(); }
});

test('a token from a block this kind does not draw is not a hit', async () => {
  // A factory whose own holding lists Soda, which none of its lines makes and
  // none of its inputs eats. The shelves table that would carry that row is
  // not composed for a factory at all, so the finding keeps its block and
  // drops the pulse rather than dimming the page for nothing.
  const page = await site({
    shop: {...FACTORY, lines: [
      {item: 'Soda', slug: 'soda', units: 1, rate: 0, price: 1, revenue: 0, soldPerDay: 0}]},
    supply: {day: 29, factories: factories({sites: [{...FACTORY_SITE, unnamed: []}]})},
    alerts: [finding('s1', 'dead', 'HART. Works', KEY, 'info', {slug: 'soda'}),
             // And one that does name a line the factory makes.
             finding('s2', 'dead', 'HART. Works', KEY, 'info', {slug: 'burger'})],
  });
  try {
    assert.equal(await page.locator('#sp-shelves').count(), 0);
    const rows = await page.$$eval('#sitePanel .sp-find', rs =>
      rs.map(r => [r.dataset.id, r.dataset.ev || null, r.dataset.hit || null]));
    assert.deepEqual(rows, [['s1', 'lines', null], ['s2', 'lines', slugTok('burger')]]);
    await page.hover('.sp-find[data-id="s1"]');
    assert.equal(await page.locator('#sitePanel .sp-hit').count(), 0);
    await page.hover('.sp-find[data-id="s2"]');
    assert.equal(await page.locator('#sp-lines .sp-hit').count(), 1);
  } finally { await page.close(); }
});

test('the same goods on two blocks pulse only in the one the finding names', async () => {
  // This factory makes Dough on one line and eats it on another, so the token
  // is a row of Lines and a row of Inputs at once. The finding is about the
  // input, and Lines is a block it has just dimmed.
  const page = await site({
    shop: FACTORY,
    supply: {day: 29, factories: factories({sites: [{...FACTORY_SITE, unnamed: [],
      lines: [{...FACTORY_SITE.lines[0], item: 'Dough', slug: 'dough'},
              FACTORY_SITE.lines[1]],
      needs: [{...FACTORY_SITE.needs[0], item: 'Dough', slug: 'dough'}]}]})},
    alerts: [finding('d1', 'feed', 'HART. Works', KEY, 'critical', {slug: 'dough'})],
  });
  try {
    const row = await page.$eval('#sitePanel .sp-find', r => [r.dataset.ev, r.dataset.hit]);
    assert.deepEqual(row, ['inputs', slugTok('dough')]);
    // Both blocks carry a row under that token.
    assert.equal(await page.locator(`#sp-lines [data-el~="${slugTok('dough')}"]`).count(), 1);
    assert.equal(await page.locator(`#sp-inputs [data-el~="${slugTok('dough')}"]`).count(), 1);
    await page.hover('#sitePanel .sp-find');
    // Only the one inside the lit block pulses.
    const lit = await page.$$eval('#sitePanel .sp-hit', els =>
      els.map(e => e.closest('[data-block]').dataset.block));
    assert.deepEqual(lit, ['inputs']);
  } finally { await page.close(); }
});

test('the same goods on a shelf and on a line are told apart by their block', async () => {
  // The token is the same; only the block the finding sends the reader to
  // decides whether it is a row there.
  const page = await site({
    shop: {...FACTORY, status: 'retail', type: 'Gift Shop', revenue: 900, customers: 30,
           lines: [{item: 'Burger', slug: 'burger', units: 5, rate: 2, price: 3,
                    revenue: 6, soldPerDay: 2}]},
    supply: {day: 29, shops: [], factories: factories({sites: []})},
    alerts: [finding('r1', 'dead', 'HART. Shop', KEY, 'info', {slug: 'burger'})],
  });
  try {
    const row = await page.$eval('#sitePanel .sp-find', r => [r.dataset.ev, r.dataset.hit]);
    assert.deepEqual(row, ['shelves', slugTok('burger')]);
    await page.hover('#sitePanel .sp-find');
    assert.equal(await page.locator('#sp-shelves .sp-hit').count(), 1);
  } finally { await page.close(); }
});

test('the zero-stock row says why there is none of it, for every verdict', async () => {
  // Every state the depot line's fact can be in. _supply() builds its import
  // rows from what a site holds, so a contract signed before its first
  // delivery has a live order and no row on the floor; goods made in one of
  // this company's factories are never imported at all; and a verdict that
  // says nothing about the supply leaves the column at a dash.
  const need = over => ({...FACTORY_SITE.needs[0], item: 'Bag of Tomatoes', slug: 'tomato',
                         perDay: 4100, lines: ['Burger'], from: 0, target: 0,
                         importWeekly: null, madeAt: [], ...over});
  const nothing = /<b>Nothing on hand<\/b>; <b>4,100<\/b>\/day is drawn from here/;
  const cases = [
    [sf('paused', 'order'), {importWeekly: 0}, /paused/, /Import <b>paused<\/b>; <b>nothing<\/b> on hand/],
    [sf('short', 'order'), {importWeekly: 8000}, /8,000\s*\/wk/,
     /<b>8,000<\/b> a week is on order; <b>nothing<\/b> on hand yet/],
    [sf('covered'), {importWeekly: 8000}, /8,000\s*\/wk/,
     /<b>8,000<\/b> a week is on order; <b>nothing<\/b> on hand yet/],
    [sf('made'), {madeAt: [1]}, /made at HART\. Other/,
     /Made at <b>HART\. Other<\/b>; <b>nothing<\/b> on hand here/],
    [sf('noplan'), {}, /no import/, nothing],
    // Nothing these say is about the supply, so nothing is claimed about it.
    [sf('short', 'target'), {}, /^—$/, nothing],
    [sf('stalled', 'waiting'), {}, /^—$/, nothing],
    [sf('covered', 'staffing'), {}, /^—$/, nothing],
    [sf('short', 'dry'), {}, /^—$/, nothing],
    [sf('stalled', 'notDrawn'), {}, /^—$/, nothing],
  ];
  for (const [fact, over, order, read] of cases) {
    const status = `${fact.st}/${fact.why}`;
    const page = await site({
      shop: {...DEPOT, lines: []},
      // The site that makes it has to be a factory of this company for the
      // `made` verdict to have a name to give.
      peer: {name: 'HART. Other', status: 'support'},
      supply: {day: 29, factories: factories({sites: [{...FACTORY_SITE, s: 1, unnamed: [],
        lines: [{...FACTORY_SITE.lines[0], item: 'Bag of Tomatoes', slug: 'tomato'}],
        needs: [need(over)]}]}), facts: {0: {tomato: fact}}},
    });
    try {
      const cells = await page.$$eval('#sp-stock tbody tr:first-child td',
        tds => tds.map(td => td.textContent.trim()));
      assert.match(cells.at(-2).replace(/\s+/g, ' '), order, status);
      assert.match(await page.locator('#sp-stock tbody tr').first().getAttribute('data-read'),
        read, status);
      // Whatever the reason, nothing on hand still reads in red.
      assert.equal(cells[1], '0', status);
      assert.equal(await page.locator('#sp-stock tbody tr .sp-red').count(), 1, status);
    } finally { await page.close(); }
  }
});
// --- a home -----------------------------------------------------------------
// A flat is the one address the panel draws that is not a business. It is
// reached from its map card alone, so the picker never lists it. Hell's Kitchen
// is in the board's own HOOD_TAGS table, so the head's bullet reads HK.
const HOME = {key: 'ba:street_bleeckerstreet#14', address: '14 Bleecker Street',
              rent: 1150, m: 204, hood: "Hell's Kitchen"};

// Opens a home over the shop fixture, the way the map card does.
async function home(row = HOME) {
  const page = await site({homes: [row]});
  await page.evaluate(key => openSite(key, false), row.key);
  return page;
}

test('a home draws its four tiles and none of the shop blocks', async () => {
  const page = await home();
  try {
    const tiles = await page.$$eval('#sitePanel .sp-hometiles .sstat', ts => ts.map(t => [
      t.querySelector('.lab').textContent, t.querySelector('.v').textContent]));
    assert.deepEqual(tiles, [
      ['Rent / day', '$1,150'],
      ['Rent / week', '$8,050'],
      ['Size', '204m²'],
      ['Per m²', '$5.64/day'],
    ]);
    // The head names the flat and its neighbourhood, with the hood's two letters.
    assert.equal(await page.textContent('#sitePanel .sitehead h2'), '14 Bleecker Street');
    assert.equal(await page.textContent('#sitePanel .sitehead .bullet'), 'HK');
    assert.match(await page.textContent('#sitePanel .sitehead .sub'), /^Home · Hell's Kitchen$/);
    // Nothing a shop draws belongs to a flat, and neither does the picker.
    for(const sel of ['#sp-tiles', '#sp-standards', '#sp-pull', '#sp-hours', '#sp-crew',
                      '#sp-shelves', '#sp-profit', '#sp-week', '#sp-stock', '.sp-find', '#sitePick'])
      assert.equal(await page.locator(`#sitePanel ${sel}`).count(), 0, sel);
    assert.equal(await page.locator('#sitePanel .sp-house svg').count(), 1);
    // The lit windows carry their own modifier: an unscoped .sp-lit rule, which
    // means "this block holds the evidence", must never light a window.
    assert.equal(await page.locator('#sitePanel .sp-house .sp-win.sp-win-on').count(), 3);
    assert.equal(await page.locator('#sitePanel .sp-house .sp-win.sp-win-late').count(), 2);
    assert.equal(await page.locator('#sitePanel .sp-house .sp-lit').count(), 0);
    // Closing it puts the section back exactly as a business leaves it.
    await page.evaluate(() => closeSite());
    assert.equal(await page.locator('#secDetail').isHidden(), true);
    assert.equal(await page.evaluate(() => $('sitePanel').innerHTML), '');
  } finally { await page.close(); }
});

test('a flat the building table does not carry reads as a dash, never a zero', async () => {
  const page = await home({...HOME, m: null, hood: null});
  try {
    const tiles = await page.$$eval('#sitePanel .sp-hometiles .sstat .v', vs => vs.map(v => v.textContent));
    assert.deepEqual(tiles, ['$1,150', '$8,050', '—', '—']);
    // No neighbourhood is no bullet and no second half of the line.
    assert.equal(await page.textContent('#sitePanel .sitehead .sub'), 'Home');
    assert.equal(await page.locator('#sitePanel .sitehead .bullet').count(), 0);
  } finally { await page.close(); }
});

test('the week is seven times the day the panel shows, to the dollar', async () => {
  // A fractional rent rounded twice makes the two tiles disagree: $11 a day
  // against $74 a week. The week is seven times the tile above it.
  for(const [rent, day, week, perM] of [[10.5, '$11', '$77', '$0.05/day'],
                                        [34.6, '$35', '$245', '$0.17/day']]) {
    const page = await home({...HOME, rent});
    try {
      const tiles = await page.$$eval('#sitePanel .sp-hometiles .sstat .v', vs => vs.map(v => v.textContent));
      assert.deepEqual(tiles, [day, week, '204m²', perM], `rent ${rent}`);
    } finally { await page.close(); }
  }
});

test('a key in both lists is the business: the flat never wins the fork', async () => {
  // extract() bills an address as a residence or as a business and never as
  // both, so this cannot happen today; the fork is ordered so that it cannot
  // matter if it ever does.
  const page = await site({homes: [{...HOME, key: KEY, address: 'Not the shop'}]});
  try {
    await page.evaluate(k => openSite(k, false), KEY);
    assert.equal(await page.locator('#sitePanel .sp-house').count(), 0);
    assert.equal(await page.locator('#sitePanel #sp-tiles').count(), 1);
    // The shop's own head, rank chip and all, not the flat's address.
    assert.match(await page.textContent('#sitePanel .sitehead h2'), /^HART\. Gifts\b/);
    assert.doesNotMatch(await page.textContent('#sitePanel .sitehead'), /Not the shop/);
  } finally { await page.close(); }
});

test('a save with no home at all opens nothing and throws nothing', async () => {
  const page = await site();
  try {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const still = await page.evaluate(() => {
      openSite('ba:street_bleeckerstreet#14', false);
      return siteKey;
    });
    // The shop that was open stays open; the address that is nothing is refused.
    assert.equal(still, 'ba:street_secondavenue#10');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

// Overstaffed hours. The site's Today line prices and names its whole week, so
// the hours block has to tell that same week: the same staff-hours, the same
// hours lit, the same wages. Grid, finding and Today row all come out of the
// real Python (tests/idle_week_fixture.py), so the two halves cannot drift.
const idleFixture = (...args) => {
  const r = spawnSync(process.env.PYTHON || 'python', ['-m', 'tests.idle_week_fixture', ...args],
    {cwd: path.join(__dirname, '..'), maxBuffer: 4 * 1024 * 1024});
  assert.equal(r.status, 0, r.stderr?.toString());
  return JSON.parse(r.stdout.toString());
};
const IDLE = idleFixture();
const idleSite = (findings = IDLE.findings, fx = IDLE) => site({
  shop: {key: fx.grid.key, name: fx.grid.name, type: 'Gym'},
  hours: [fx.grid], hourFindings: findings, minor: [fx.row],
});
// The grid's cells wearing `cls`, as "weekday:hour"; its rows run Monday first.
const cellsWith = (page, cls) => page.evaluate(cls => {
  const rows = [1, 2, 3, 4, 5, 6, 0];
  return [...document.querySelectorAll('#sp-hours .hc')]
    .map((e, i) => e.classList.contains(cls) ? `${rows[Math.floor(i / 24)]}:${i % 24}` : null)
    .filter(Boolean);
}, cls);
const hoursOf = (days, from, to) =>
  days.flatMap(wd => Array.from({length: to - from}, (_, k) => `${wd}:${from + k}`));

test('the hours block tells the overstaffed week the Today line tells', async () => {
  const page = await idleSite();
  try {
    const worth = await page.evaluate(w => fmt(w), IDLE.row.worth);
    const chip = page.locator('#sp-hours .sp-hchip.idle');
    assert.equal((await chip.textContent()).trim(),
      `72 staff-hours a week · 3 fitness planning boards Mon-Wed 8-20 · ${worth}/day of wages`);
    // The sentence is the Today line's, less the site the page already names.
    assert.equal(await chip.getAttribute('data-tip'),
      `${IDLE.row.text.replace(/^Pump runs /, '')}; about ${worth}/day of wages.`);
    // The chip lights the week's hours, all three days of them.
    await chip.hover();
    assert.deepEqual(await cellsWith(page, 'sp-lit'), hoursOf([1, 2, 3], 8, 20));
    // Not arrived from the line, the read-out opens on the grid's own hour.
    assert.doesNotMatch(await page.locator('#hourRead').textContent(), /^Overstaffed/);
    // The finding's row lights the hours block and pulses the same week.
    const row = page.locator(`.sp-find[data-id="${IDLE.row.id}"]`);
    assert.equal(await row.getAttribute('data-ev'), 'hours');
    assert.equal(await row.getAttribute('data-hit'), 'idle');
    await row.hover();
    assert.equal(await page.locator('#sp-hours.sp-lit').count(), 1);
    assert.deepEqual(await cellsWith(page, 'sp-hit'), hoursOf([1, 2, 3], 8, 20));
  } finally { await page.close(); }
});

test('arrived from the Today line, the hours block opens on its week', async () => {
  const page = await idleSite();
  try {
    await page.evaluate(([key, id]) => openSite(key, false, id), [IDLE.grid.key, IDLE.row.id]);
    const worth = await page.evaluate(w => fmt(w), IDLE.row.worth);
    assert.equal(await page.locator(`.sp-find.arrived`).getAttribute('data-id'), IDLE.row.id);
    assert.equal((await page.locator('#hourRead').textContent()).trim(),
      `Overstaffed · 72 staff-hours a week · 3 fitness planning boards Mon-Wed 8-20 · ${worth}/day of wages`);
  } finally { await page.close(); }
});

test('a roster that differs by day is told one headcount at a time, on the page as on Today', async () => {
  // Two trainers on Monday, four on Tuesday: never "4 ... Mon, Tue".
  const MIXED = idleFixture('mixed');
  const page = await idleSite(MIXED.findings, MIXED);
  try {
    const worth = await page.evaluate(w => fmt(w), MIXED.row.worth);
    const runs = '2 fitness planning boards Mon 8-20; 4 fitness planning boards Tue 8-20';
    assert.match(MIXED.row.text, new RegExp(`: ${runs} for `));
    const chip = page.locator('#sp-hours .sp-hchip.idle');
    assert.equal((await chip.textContent()).trim(), `48 staff-hours a week · ${runs} · ${worth}/day of wages`);
    assert.equal(await chip.getAttribute('data-tip'),
      `${MIXED.row.text.replace(/^Pump runs /, '')}; about ${worth}/day of wages.`);
    await chip.hover();
    assert.deepEqual(await cellsWith(page, 'sp-lit'), hoursOf([1, 2], 8, 20));
  } finally { await page.close(); }
});

test('a week of three headcounts names the biggest two, on the page as on Today, and wraps on a phone', async () => {
  // Two, three and four trainers on Monday, Tuesday and Wednesday.
  const MANY = idleFixture('many');
  const page = await idleSite(MANY.findings, MANY);
  try {
    const worth = await page.evaluate(w => fmt(w), MANY.row.worth);
    const runs = '3 fitness planning boards Tue 8-20; 4 fitness planning boards Wed 8-20 (and 1 more)';
    assert.ok(MANY.row.text.includes(`: ${runs} for `), MANY.row.text);
    const chip = page.locator('#sp-hours .sp-hchip.idle');
    assert.equal((await chip.textContent()).trim(), `72 staff-hours a week · ${runs} · ${worth}/day of wages`);
    assert.equal(await chip.getAttribute('data-tip'),
      `${MANY.row.text.replace(/^Pump runs /, '')}; about ${worth}/day of wages.`);
    // "(and 1 more)": every hour of the week is still lit, Monday's included.
    await chip.hover();
    assert.deepEqual(await cellsWith(page, 'sp-lit'), hoursOf([1, 2, 3], 8, 20));
    // On a phone the chip wraps inside the page rather than pushing it sideways.
    await page.setViewportSize({width: 390, height: 900});
    await page.evaluate(() => drawSite());
    const fit = await page.evaluate(() => {
      const c = document.querySelector('#sp-hours .sp-hchip.idle').getBoundingClientRect();
      return {right: c.right, width: innerWidth, scroll: document.documentElement.scrollWidth,
              client: document.documentElement.clientWidth, tall: c.height > 40};
    });
    assert.ok(fit.right <= fit.width, `chip ends at ${fit.right} of ${fit.width}`);
    assert.ok(fit.scroll <= fit.client, `page scrolls sideways: ${fit.scroll} > ${fit.client}`);
    assert.equal(fit.tall, true, 'the chip wraps onto more than one line');
  } finally { await page.close(); }
});

test('a finding written before the week existed reads as a week of its one run', async () => {
  const old = IDLE.findings.map(({week, ...f}) => f);
  const page = await idleSite(old);
  try {
    const worth = await page.evaluate(w => fmt(w), old[0].worth);
    const chip = page.locator('#sp-hours .sp-hchip.idle');
    assert.equal((await chip.textContent()).trim(),
      `24 staff-hours a week · 3 fitness planning boards Mon 8-20 · ${worth}/day of wages`);
    await chip.hover();
    assert.deepEqual(await cellsWith(page, 'sp-lit'), hoursOf([1], 8, 20));
  } finally { await page.close(); }
});

/* A factory's and a depot's page on a phone: the lines and the stock keep a
   width they can be read at and scroll inside their own box, never the page. */
test('a factory and a depot on a phone scroll their wide blocks inside themselves', async () => {
  const slots = Array.from({length: 40}, (_, i) => i + 1);
  const busy = {...FACTORY_SITE, machines: 40, lines: [{...FACTORY_SITE.lines[0], slots, machines: 40}]};
  for (const [kind, over] of [
    ['factory', {shop: FACTORY, supply: {day: 29, factories: factories({sites: [busy]})}}],
    ['depot', {shop: DEPOT, supply: {day: 29, imports: [importRow()], idle: [deadRow]}}],
  ]) {
    const page = await site(over);
    try {
      await page.setViewportSize({width: 390, height: 844});
      await page.evaluate(() => drawSite());
      const seen = await page.evaluate(() => {
        const W = document.documentElement.getBoundingClientRect().width;
        const spill = [...document.querySelectorAll('#sitePanel *')].filter(el => {
          if (el.getBoundingClientRect().right <= W + 1) return false;
          for (let a = el.parentElement; a && a.id !== 'sitePanel'; a = a.parentElement)
            if (/(auto|scroll|hidden)/.test(getComputedStyle(a).overflowX)) return false;
          return true;
        }).map(el => el.tagName + '.' + el.className);
        const lines = document.querySelector('#sp-lines .sp-lines');
        return {page: document.documentElement.scrollWidth, W, spill,
                lines: lines ? lines.parentElement.scrollWidth > lines.parentElement.clientWidth : null};
      });
      assert.ok(seen.page <= seen.W, `${kind}: nothing pushes the page sideways`);
      assert.deepEqual(seen.spill, [], `${kind}: nothing wider than the screen outside a scrolling box`);
      if (kind === 'factory') assert.equal(seen.lines, true, 'the lines scroll inside their own box');
    } finally { await page.close(); }
  }
});

test('a factory page carries the sizing switch, and its inputs follow it', async () => {
  const facts = JSON.parse(JSON.stringify(FACTORY_FACTS));
  // Under Demand the beef is sized for the shops at the end of the chain, one of them new.
  facts[0].gb.dem = {st: 'covered', why: null, lvl: 'ok', use: 7000, need: 8050, setTo: null, ramp: [1]};
  const page = await site({shop: FACTORY, supply: {day: 29, factories: factories(), facts}});
  try {
    assert.equal(await page.locator('#sp-inputs #spSizing a.on').textContent(), '24/7');
    assert.match(await page.locator('#sp-inputs tbody tr').first().innerText(), /9,600/);
    await page.evaluate(() => { renderAll = () => drawSite(); });
    await page.locator('#spSizing').getByText('Demand').click();
    const row = await page.locator('#sp-inputs tbody tr').first();
    assert.match(await row.innerText(), /7,000\s*may still be ramping/);
    assert.equal(await row.locator('.sp-up').count(), 0, 'nothing to raise under Demand');
    assert.match(await page.locator('#sp-inputs .sz-ramp').getAttribute('data-tip'), /HART\. Other/);
    assert.equal(await page.evaluate(() => localStorage.getItem('ba_dash_sizing')), 'dem');
  } finally { await page.close(); }
});
