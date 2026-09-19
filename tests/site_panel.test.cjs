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
      supply: Object.assign({day: 29, shops: [], imports: [], idle: [], factories: {sites: []}},
        overrides.supply || {}),
      hours: overrides.hours || [], hourFindings: overrides.hourFindings || [],
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
  const cap = (limit, fix) => ({kind: 'cap', key: KEY, site: 'HART. Gifts', office: false,
    hours: 3, when: 'Fri 12-13', limit, fix, cap: 50, capTop: 50, basket: 30, throughput: 900});
  const page = await site({
    hours: grid(false, 3),
    hourFindings: [cap('the building', 'a bigger site nearby'), cap('staffing', 'more service staff')],
  });
  try {
    const chips = await page.$$eval('#sp-hours .sp-hchip.cap', els =>
      els.map(e => [e.dataset.limit, e.dataset.show]));
    assert.deepEqual(chips, [['the building', 'cap-door'], ['staffing', 'cap-staff']]);
    // The door and the people are lit; the counters were never the limit.
    const ceil = await page.$$eval('#sp-tiles .sp-ceil .sp-i', els =>
      els.map(e => e.classList.contains('on')));
    assert.deepEqual(ceil, [true, false, true]);
    // A chip picks out the hours its own ceiling held, not every capped hour.
    // The fixture staffs 3 of 3 counters against a 50/h door, so its capped
    // hours are the counters', and the staffing chip lights none of them.
    await page.hover('#sp-hours .sp-hchip[data-show="cap-staff"]');
    const dimmed = await page.$$eval('#sp-hours .hc.cap-post', els =>
      els.map(e => getComputedStyle(e).opacity));
    assert.ok(dimmed.length, 'the fixture has hours held by the counters');
    assert.ok(dimmed.every(o => Number(o) < 0.5), 'a chip for another ceiling dims them');
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

// --- the depot and the factory ---------------------------------------------
// The fixture's save was written on day 29, so a truck on day 33 is four days
// out and sits on the fifth cell of the rail.
const DEPOT = {
  status: 'support', type: 'Warehouse', name: 'HART. Depot', revenue: 0, customers: 0,
  basket: null, profit: -400, margin: null, lines: [
    {item: 'Soda', slug: 'soda', units: 2100, rate: 0, price: 1, revenue: 0, soldPerDay: 0},
    {item: 'Napkins', slug: 'napkins', units: 5000, rate: 0, price: 1, revenue: 0, soldPerDay: 0},
  ],
};
const importRow = (over = {}) => Object.assign({
  s: 0, item: 'Soda', stock: 2100, perDay: 1150, basis: 'shipped', peakDay: 'Friday',
  peakPerDay: 1300, cover: 1.8, stockCover: 1.8, daysOnHand: 1.8, runsOut: 'Tuesday',
  weekly: 8000, lastWeek: 8000, weekNeed: 8050, orderFit: 'ok', coverFit: 'short',
  due: 4, shortBy: 2.2, catchUp: 2400, coverageUntil: 33, paused: false, arrives: 33,
  from: 'Acme', level: 'critical', reason: 'shortfall',
}, over);
const deadRow = {s: 0, item: 'Napkins', slug: 'napkins', stock: 5000, perWeek: 0, weeks: null,
                 target: 0, price: 1, value: 5000, dead: true, level: 'warn'};

const railOf = page => page.$$eval('#sp-stock tbody tr', rows => rows.map(r => ({
  el: r.dataset.el,
  cells: [...r.querySelectorAll('.sp-rail i')].map(i => i.className),
  truck: r.querySelector('.sp-rail .trk')
    ? {d: r.querySelector('.sp-rail .trk').style.getPropertyValue('--d'),
       held: r.querySelector('.sp-rail .trk').classList.contains('held')} : null,
  zzz: !!r.querySelector('.sp-zz'),
})));

test('a depot draws its week of trucks, and no hour grid', async () => {
  const page = await site({
    shop: DEPOT,
    hours: grid(false, 3),
    supply: {
      day: 29,
      imports: [importRow(), importRow({item: 'Cheap Gift', stock: 640, perDay: 310, cover: 2,
        coverFit: 'ok', runsOut: null, catchUp: 0, paused: true, weekly: 0, lastWeek: 2200,
        arrives: 34, reason: 'paused'})],
      idle: [deadRow],
      shops: [{s: 1, item: 'Soda', sold: 900, peakSold: 1000, peakDay: 'Friday', target: 1000,
               pressure: 100, stock: 40, from: 0, level: 'ok'}],
    },
  });
  try {
    // An hour grid belongs to a shop and an office; a depot has none.
    assert.equal(await page.locator('#sp-hours').count(), 0);
    assert.equal(await page.locator('#sp-stock').count(), 1);
    assert.deepEqual(await railOf(page), [
      // Soda: one whole day covered, dry until the truck on the fifth cell.
      {el: 'sp-it-soda short', cells: ['c', 'd', 'd', 'd', 'c', 'c', 'c'],
       truck: {d: '4', held: false}, zzz: false},
      // A paused contract's truck is struck through and nothing behind it fills.
      {el: 'sp-it-cheap-gift paused', cells: ['c', 'c', 'd', 'd', 'd', 'd', 'd'],
       truck: {d: '5', held: true}, zzz: false},
      // Nothing draws on the napkins, so there is no cover to run out.
      {el: 'sp-it-napkins dead', cells: Array(7).fill(''), truck: null, zzz: true},
    ]);
    // One row a site that draws on the depot, and the tile that counts them.
    assert.equal(await page.locator('#sp-feeds .sp-feed').count(), 1);
    assert.match(await page.locator('#sp-tiles .sstat', {hasText: 'Feeds'}).innerText(), /1\s*site/);
    // A depot books no sale, so the cost bar has no profit to close it with.
    assert.equal(await page.locator('#sp-tiles .sp-cost i.p, #sp-tiles .sp-cost i.l').count(), 0);
  } finally { await page.close(); }
});

test('a depot finding pulses the line it is about', async () => {
  const page = await site({
    shop: DEPOT,
    supply: {day: 29, imports: [importRow()], idle: [deadRow]},
    alerts: [{id: 'd1', level: 'critical', site: 'HART. Depot', siteKey: KEY, group: 'shortfall',
              subject: 'Soda', text: 'HART. Depot: Soda runs dry Tuesday', worth: null, unit: ''},
             {id: 'd2', level: 'info', site: 'HART. Depot', siteKey: KEY, group: 'dead',
              subject: 'Napkins', text: 'HART. Depot: 5,000 Napkins held with nothing moving out',
              worth: null, unit: ''}],
  });
  try {
    // Stock standing still is a shelf on a shop and a line on a depot.
    const rows = await page.$$eval('#sitePanel .sp-find', rs =>
      rs.map(r => [r.dataset.id, r.dataset.ev, r.dataset.hit]));
    assert.deepEqual(rows, [['d1', 'stock', 'sp-it-soda'], ['d2', 'stock', 'sp-it-napkins']]);
    await page.hover('.sp-find[data-id="d2"]');
    const hit = await page.$$eval('#sp-stock .sp-hit', els => els.map(e => e.dataset.el));
    assert.deepEqual(hit, ['sp-it-napkins dead']);
  } finally { await page.close(); }
});

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
const FACTORY = {...DEPOT, name: 'HART. Works', type: 'Factory',
                 lines: [{item: 'Burger', slug: 'burger', units: 2100, rate: 0, price: 1,
                          revenue: 0, soldPerDay: 0}]};

test('a factory fills each machine square by the week it is rostered', async () => {
  const page = await site({shop: FACTORY, supply: {day: 29, factories: {sites: [FACTORY_SITE]}}});
  try {
    const lines = await page.$$eval('#sp-lines .sp-line:not(.head)', rows => rows.map(r => ({
      line: r.dataset.line,
      fill: [...r.querySelectorAll('.sp-m')].map(m => m.style.getPropertyValue('--h')),
      mark: [...r.querySelectorAll('.sp-m')].map(m => m.className),
      stop: !!r.querySelector('.sp-belt.stop'),
    })));
    assert.deepEqual(lines, [
      {line: 'sp-it-burger', fill: ['100%', '100%'], mark: ['sp-m', 'sp-m'], stop: false},
      // 144 of 168 hours rostered: the square is 86% full.
      {line: 'sp-it-bottle-of-wine', fill: ['86%'], mark: ['sp-m'], stop: false},
      // A machine running a recipe the board cannot name keeps its picker.
      {line: 'sp-unnamed-0', fill: [''], mark: ['sp-m q'], stop: false},
      // One with no recipe at all is staffed, rented, and making nothing.
      {line: 'sp-unnamed-1', fill: [''], mark: ['sp-m z'], stop: true},
    ]);
    assert.equal(await page.locator('#sp-lines select.linepick').count(), 1);
    assert.equal(await page.locator('#sp-lines .sp-pile').count(), 1);
    // The read-out names the machine and the hours behind the fill.
    await page.hover('#sp-lines .sp-line[data-line="sp-it-bottle-of-wine"] .sp-m');
    assert.match(await page.locator('#sp-lines .sp-readout').innerText(),
      /Machine 3 · 144 of 168 h rostered: nobody on it on Sundays/);
  } finally { await page.close(); }
});

test('hovering a factory input lights the lines that draw on it', async () => {
  const page = await site({shop: FACTORY, supply: {day: 29, factories: {sites: [FACTORY_SITE]}}});
  try {
    const rows = await page.$$eval('#sp-inputs tbody tr', rs =>
      rs.map(r => [r.dataset.lines, r.dataset.el, r.dataset.read]));
    assert.deepEqual(rows, [
      ['sp-it-burger', 'sp-it-ground-beef target',
       'Tops up to <b>8,000</b>, the machines eat <b>9,600</b>'],
      ['sp-it-bottle-of-wine', 'sp-it-grapes', 'In step'],
    ]);
    await page.hover('#sp-inputs tbody tr:first-child');
    const lit = await page.$$eval('#sp-lines .sp-line.lit', els => els.map(e => e.dataset.line));
    assert.deepEqual(lit, ['sp-it-burger']);
    assert.equal(await page.locator('#sp-lines .sp-lines.dim').count(), 1);
    // The top-up that has to be raised says what to set it to.
    assert.match(await page.locator('#sp-inputs .sp-up.bad').innerText(), /8,000\s*9,600/);
  } finally { await page.close(); }
});

test('an empty depot and an unreadable factory still draw', async () => {
  const bare = await site({shop: {...DEPOT, lines: [], staff: 0, staffCost: 0, crew: [], people: []}});
  try {
    assert.equal(await bare.locator('#sp-stock').count(), 1);
    assert.equal(await bare.locator('#sp-stock tbody tr').count(), 0);
    assert.equal(await bare.locator('#sp-feeds .sp-feed').count(), 0);
    assert.match(await bare.locator('#sp-tiles .sstat', {hasText: 'Thinnest'}).innerText(), /—/);
  } finally { await bare.close(); }

  // A factory row with nothing readable in it: no lines, no inputs, no names.
  const empty = await site({shop: FACTORY, supply: {day: 29, factories: {sites: [
    {s: 0, machines: 0, lines: [], unnamed: [], needs: [], targets: {}, known: false, arrivals: {}}]}}});
  try {
    assert.equal(await empty.locator('#sp-lines').count(), 1);
    assert.equal(await empty.locator('#sp-inputs tbody tr').count(), 0);
    assert.equal(await empty.locator('#sp-tiles .sstat').count(), 4);
  } finally { await empty.close(); }
});

test("an item's name out of the save is text in the depot and factory rows", async () => {
  const hostile = '</td><img src=x onerror="window.__pwned=1">';
  const page = await site({
    shop: FACTORY,
    supply: {day: 29, factories: {sites: [{...FACTORY_SITE,
      lines: [{...FACTORY_SITE.lines[0], item: hostile}],
      unnamed: [{...FACTORY_SITE.unnamed[0], workstation: hostile,
                 candidates: [{slug: 'p', item: hostile}]}],
      needs: [{...FACTORY_SITE.needs[0], item: hostile, lines: [hostile]}]}]}},
  });
  try {
    assert.equal(await page.locator('#sitePanel img').count(), 0);
    await page.hover('#sp-inputs tbody tr:first-child');
    assert.equal(await page.locator('#sitePanel img').count(), 0);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
  } finally { await page.close(); }
});

test('a depot line nothing imports is covered by what leaves it', async () => {
  const page = await site({
    shop: {...DEPOT, lines: [
      {item: 'Burger', slug: 'burger', units: 14200, rate: 0, price: 1, revenue: 0, soldPerDay: 0},
      {item: 'Napkins', slug: 'napkins', units: 5000, rate: 0, price: 1, revenue: 0, soldPerDay: 0},
    ]},
    supply: {
      day: 29,
      shops: [{s: 1, item: 'Burger', sold: 4100, peakSold: 4500, peakDay: 'Friday', target: 5000,
               pressure: 90, stock: 400, from: 0, level: 'ok'}],
      factories: {sites: [{...FACTORY_SITE, s: 1,
        lines: [{...FACTORY_SITE.lines[0], item: 'Burger'}], unnamed: [], needs: []}]},
    },
  });
  try {
    const rows = await page.$$eval('#sp-stock tbody tr', rs => rs.map(r => ({
      el: r.dataset.el, read: r.dataset.read,
      cells: [...r.querySelectorAll('td')].map(td => td.textContent.trim()),
      zzz: !!r.querySelector('.sp-zz'),
    })));
    // 14,200 on hand against 4,100 a day is 3.5 days, and the factory that
    // makes it stands where a weekly order would.
    assert.equal(rows[0].el, 'sp-it-burger');
    assert.equal(rows[0].read, '<b>3.5</b> days on hand');
    assert.match(rows[0].cells.at(-2), /^made at /);
    assert.equal(rows[0].cells.at(-1), '1');
    assert.equal(rows[0].zzz, false);
    // Nothing draws on the napkins, so there is no cover and no truck.
    assert.equal(rows[1].el, 'sp-it-napkins dead');
    assert.equal(rows[1].zzz, true);
    assert.equal(rows[1].cells.at(-2), '—');
    // The Thinnest tile reads the same row, not only the imported lines.
    assert.match(await page.locator('#sp-tiles .sstat', {hasText: 'Thinnest'}).innerText(),
      /3\.5 d\s*Burger/);
  } finally { await page.close(); }
});
