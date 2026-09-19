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
const finding = (id, group, site = 'HART. Gifts', siteKey = KEY, level = 'warn') =>
  ({id, level, site, siteKey, group, text: `${site}: ${group} finding`, worth: null, unit: ''});

// A shop panel, over a fixture whose every field the panel may read is filled
// in. `shop` overrides the site that opens, `alerts` and `minor.rows` the two
// finding lists it reads.
async function site(overrides = {}) {
  const page = await browser.newPage({viewport: {width: 1280, height: 1100}});
  await page.route('https://**', route => route.abort());
  await page.setContent(html, {waitUntil: 'load'});
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
    D = {
      meta: {character: 'sp-fixture', day: 29}, rhythm: null, daily: [],
      supply: {shops: []}, hours: overrides.hours || [], hourFindings: overrides.hourFindings || [],
      trends: overrides.trends || [], hypeExposure: [],
      alerts: overrides.alerts || [], minor: {rows: overrides.minor || []},
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
      {id: 'a1', ev: 'shelves', hit: 'outruns'},
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

test('a silent shop shows the five pre-flight checks in the order it needs them', async () => {
  // Prices, stock and shelves are one chain in _alerts(): only the first of
  // them can fail, and the ones behind it were never looked at.
  const page = await site({shop: {revenue: 0, notTrading: ['prices', 'plan']}});
  try {
    const checks = await page.$$eval('#sitePanel .sp-pre [data-check]', els =>
      els.map(e => [e.dataset.check, e.className]));
    assert.deepEqual(checks, [
      ['staff', 'ok'], ['prices', 'no'],
      // Never checked: the chain stops at prices.
      ['stock', 'unk'], ['shelves', 'unk'], ['plan', 'no'],
    ]);
  } finally { await page.close(); }

  const stock = await site({shop: {revenue: 0, notTrading: ['stock', 'plan']}});
  try {
    const checks = await stock.$$eval('#sitePanel .sp-pre [data-check]', els =>
      els.map(e => [e.dataset.check, e.className]));
    assert.deepEqual(checks, [
      ['staff', 'ok'], ['prices', 'ok'], ['stock', 'no'], ['shelves', 'unk'], ['plan', 'no'],
    ]);
  } finally { await stock.close(); }

  // Every check passed and the site simply has not booked a day yet.
  const ready = await site({shop: {revenue: 0, notTrading: []}});
  try {
    const checks = await ready.$$eval('#sitePanel .sp-pre [data-check]', els => els.map(e => e.className));
    assert.deepEqual(checks, ['ok', 'ok', 'ok', 'ok', 'ok']);
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
    assert.deepEqual(checks, [['staff', 'no'], ['prices', 'no']]);
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
const mixedGrid = () => {
  const row = () => Array.from({length: 24}, (_, h) => STAFFED_AT[h] || 0);
  return [{
    key: KEY, name: 'HART. Gifts', office: false, postRate: 1,
    customers: Array.from({length: 7}, row), weeks: [2, 2, 2, 2, 2, 2, 2],
    thin: Array(7).fill(false), staffed: Array.from({length: 7}, row),
    onShift: Array.from({length: 7}, row), effective: Array.from({length: 7}, row),
    door: 50, cap: 50, counters: 3, stationCount: 4, basket: 30, peak: 50, capHours: 21,
  }];
};

test("the tiles carry the fortnight, the costs of the day and the ceilings", async () => {
  const page = await site({
    shop: {series: fortnight(), cogs: 400, profit: 200},
    trends: READY,
    hourFindings: [{kind: 'cap', key: KEY, site: 'HART. Gifts', office: false, hours: 3,
                    when: 'Fri 12-13', limit: 'the building', fix: 'a bigger site nearby',
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
  const cap = (when, limit, fix, at, throughput) => ({kind: 'cap', key: KEY, site: 'HART. Gifts',
    office: false, hours: 7, when, limit, fix, cap: at, capTop: at, basket: 30, throughput});
  const page = await site({
    hours: mixedGrid(),
    hourFindings: [
      cap('every day 9', 'the building', 'a bigger site or a second shop nearby', 50, 1500),
      cap('every day 12', 'staffing', 'more service staff on those hours', 2, 60),
      cap('every day 15', 'registers', 'another counter', 3, 90),
    ],
  });
  try {
    const chips = await page.$$eval('#sp-hours .sp-hchip.cap', els =>
      els.map(e => [e.dataset.limit, e.dataset.show]));
    assert.deepEqual(chips, [
      ['the building', 'cap-door'], ['staffing', 'cap-staff'], ['registers', 'cap-post']]);
    // All three ceilings held hours here, so all three icons are lit.
    const ceil = await page.$$eval('#sp-tiles .sp-ceil .sp-i', els =>
      els.map(e => e.classList.contains('on')));
    assert.deepEqual(ceil, [true, true, true]);
    // Each hour wears the ceiling that held it, and it is the right hour: the
    // grid is seven rows of 24 cells, so cell wd*24+h is that weekday's hour h.
    const marks = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#sp-hours .hc')];
      const mark = e => ['cap-door', 'cap-staff', 'cap-post'].find(c => e.classList.contains(c)) || null;
      return [...Array(7).keys()].map(wd =>
        [...Array(24).keys()].map(h => mark(cells[wd * 24 + h])).filter(Boolean).length === 3
          ? [mark(cells[wd * 24 + 9]), mark(cells[wd * 24 + 12]), mark(cells[wd * 24 + 15])]
          : ['extra marks on this day']);
    });
    for(const day of marks) assert.deepEqual(day, ['cap-door', 'cap-staff', 'cap-post']);
    // A chip lights exactly its own ceiling's hours — nothing else on the
    // grid, and not another ceiling's capped hours either.
    const HOUR = {'cap-door': 9, 'cap-staff': 12, 'cap-post': 15};
    for(const [mine, hour] of Object.entries(HOUR)){
      await page.hover(`#sp-hours .sp-hchip[data-show="${mine}"]`);
      const lit = await page.evaluate(() => [...document.querySelectorAll('#sp-hours .hc')]
        .map((e, i) => Number(getComputedStyle(e).opacity) === 1 ? i % 24 : null)
        .filter(h => h !== null));
      assert.deepEqual(lit, Array(7).fill(hour), `the ${mine} chip lights ${hour}:00 and nothing else`);
    }
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
      els.map(e => e.classList.contains('z')));
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
