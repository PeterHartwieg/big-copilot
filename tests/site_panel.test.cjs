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
// Tokens are a one-to-one encoding of the item's own label, so the test spells
// them the way the panel does rather than hand-rolling a second rule.
const tok = s => 'sp-' + s.replace(/[^A-Za-z0-9-]/g, c => '_' + c.codePointAt(0).toString(16) + '_');

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
    },
  });
  try {
    // An hour grid belongs to a shop and an office; a depot has none.
    assert.equal(await page.locator('#sp-hours').count(), 0);
    assert.equal(await page.locator('#sp-stock').count(), 1);
    assert.deepEqual(await railOf(page), [
      // Soda: one whole day covered, dry until the truck on the fifth cell.
      {el: `${tok('Soda')} short`, cells: ['sp-c', 'sp-d', 'sp-d', 'sp-d', 'sp-c', 'sp-c', 'sp-c'],
       trucks: [{d: '4', held: false, early: false}], zzz: false},
      // A paused contract's truck is struck through and nothing behind it fills.
      {el: `${tok('Cheap Gift')} paused`,
       cells: ['sp-c', 'sp-c', 'sp-d', 'sp-d', 'sp-d', 'sp-d', 'sp-d'],
       trucks: [{d: '5', held: true, early: false}], zzz: false},
      // Nothing draws on the napkins, so there is no cover to run out.
      {el: `${tok('Napkins')} dead`, cells: Array(7).fill(''), trucks: [], zzz: true},
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
        reason: 'paused'})]},
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
      coverFit: 'short', runsOut: 'Thursday', catchUp: 1200})]},
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
    assert.deepEqual(rows, [['d1', 'stock', tok('Soda')], ['d2', 'stock', tok('Napkins')]]);
    await page.hover('.sp-find[data-id="d2"]');
    const hit = await page.$$eval('#sp-stock .sp-hit', els => els.map(e => e.dataset.el));
    assert.deepEqual(hit, [`${tok('Napkins')} dead`]);
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
const factories = (over = {}) => Object.assign(
  {sites: [FACTORY_SITE], machines: 5, unnamed: 2, character: 'sp-fixture',
   aliases: {}, depots: {}, depotOther: {}}, over);
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
      {line: tok('burger'), fill: ['100%', '100%'], mark: ['sp-m', 'sp-m'],
       slots: [tok('machine 1'), tok('machine 2')], stop: false},
      // 144 of 168 hours rostered: the square is 86% full.
      {line: tok('wine'), fill: ['86%'], mark: ['sp-m'], slots: [tok('machine 3')], stop: false},
      // A machine running a recipe the board cannot name keeps its picker.
      {line: 'sp-unnamed-0', fill: [''], mark: ['sp-m sp-q'], slots: [tok('machine 4')], stop: false},
      // One with no recipe at all is staffed, rented, and making nothing.
      {line: 'sp-unnamed-1', fill: [''], mark: ['sp-m z'], slots: [tok('machine 5')], stop: true},
    ]);
    assert.equal(await page.locator('#sp-lines select.linepick').count(), 1);
    assert.equal(await page.locator('#sp-lines .sp-pile').count(), 1);
    // The read-out names the machine and the hours behind the fill.
    await page.hover(`#sp-lines .sp-line[data-line="${tok('wine')}"] .sp-m`);
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
  const page = await site({shop: FACTORY, supply: {day: 29, factories: factories()}});
  try {
    const rows = await page.$$eval('#sp-inputs tbody tr', rs =>
      rs.map(r => [r.dataset.lines, r.dataset.el, r.dataset.read]));
    assert.deepEqual(rows, [
      [tok('burger'), `${tok('Ground Beef')} target`,
       'Tops up to <b>8,000</b>, the machines eat <b>9,600</b>'],
      [tok('wine'), tok('Grapes'), 'In step'],
    ]);
    await page.hover('#sp-inputs tbody tr:first-child');
    const lit = await page.$$eval('#sp-lines .sp-line.sp-on', els => els.map(e => e.dataset.line));
    assert.deepEqual(lit, [tok('burger')]);
    assert.equal(await page.locator('#sp-lines .sp-lines.sp-dim').count(), 1);
    // The top-up that has to be raised says what to set it to.
    assert.match(await page.locator('#sp-inputs .sp-up.bad').innerText(), /8,000\s*9,600/);
  } finally { await page.close(); }
});

test('every finding on a depot and a factory points at a block that is there', async () => {
  // A depot and a factory are both `support` sites, so the import, idle-stock
  // and staffing findings can all carry one of their keys.
  const groups = ['notrading', 'loss', 'trend', 'staff', 'jobdemand', 'dead', 'target',
                  'shortfall', 'order', 'paused', 'feed', 'unnamed', 'unset'];
  const alerts = groups.map((g, i) => ({id: `g${i}`, level: 'warn', site: 'HART. Depot',
    siteKey: KEY, group: g, subject: 'Soda', text: `HART. Depot: ${g} finding`,
    worth: null, unit: ''}));
  for (const [kind, shop, supply] of [
    ['depot', DEPOT, {day: 29, imports: [importRow()], idle: [deadRow]}],
    ['factory', FACTORY, {day: 29, factories: factories()}],
  ]) {
    const page = await site({shop, supply, alerts, minor: []});
    try {
      await page.click('[data-allfinds]');
      const rows = await page.$$eval('#sitePanel .sp-find', rs =>
        rs.map(r => [r.dataset.id, r.dataset.ev || null]));
      const blocks = await page.$$eval('#sitePanel [data-block]', bs => bs.map(x => x.dataset.block));
      for (const [id, ev] of rows)
        if (ev) assert.ok(blocks.includes(ev), `${kind}: ${id} points at ${ev}, which is drawn`);
      // And the ones that belong somewhere else on this kind land there.
      const at = g => rows[groups.indexOf(g)][1];
      assert.equal(at('trend'), 'tiles');
      assert.equal(at('shortfall'), kind === 'depot' ? 'stock' : 'inputs');
      assert.equal(at('feed'), kind === 'depot' ? 'stock' : 'inputs');
      assert.equal(at('staff'), kind === 'depot' ? 'crew' : 'lines');
      assert.equal(at('dead'), kind === 'depot' ? 'stock' : 'lines');
      // A group whose block this kind does not draw points nowhere at all,
      // rather than dimming the page and scrolling to nothing.
      assert.equal(at(kind === 'depot' ? 'unnamed' : 'notrading') === 'tiles' ? 'tiles'
        : at(kind === 'depot' ? 'unnamed' : 'notrading'), kind === 'depot' ? null : 'tiles');
    } finally { await page.close(); }
  }
});

test("a factory's own findings pulse the machine and the line they name", async () => {
  const page = await site({
    shop: FACTORY, supply: {day: 29, factories: factories()},
    alerts: [
      {id: 'f1', level: 'critical', site: 'HART. Works', siteKey: KEY, group: 'staff',
       subject: 'Bottle of Wine at position 3', worth: null, unit: '',
       text: 'HART. Works: Bottle of Wine machine at list position 3 is staffed 144 of 168 hours'},
      {id: 'f2', level: 'warn', site: 'HART. Works', siteKey: KEY, group: 'unnamed',
       subject: 'Food Workstation #4', worth: null, unit: '',
       text: 'HART. Works: 1 machine at Food Workstation #4 runs a recipe without usable details'},
      {id: 'f3', level: 'critical', site: 'HART. Works', siteKey: KEY, group: 'unset',
       subject: 'Bottled Goods Workstation #5', worth: null, unit: '',
       text: 'HART. Works: 1 machine at Bottled Goods Workstation #5 has no recipe set'},
    ],
  });
  try {
    const rows = await page.$$eval('#sitePanel .sp-find', rs =>
      rs.map(r => [r.dataset.id, r.dataset.ev, r.dataset.hit]));
    assert.deepEqual(rows, [
      // A staffing finding names a list position, not an item.
      ['f1', 'lines', tok('machine 3')],
      ['f2', 'lines', 'unnamed'],
      ['f3', 'lines', 'unset'],
    ]);
    await page.hover('.sp-find[data-id="f1"]');
    assert.deepEqual(await page.$$eval('#sp-lines .sp-hit', els => els.map(e => e.dataset.el)),
      [tok('machine 3')]);
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
    assert.equal(rows[0].el, tok('Tomatoes'));
    assert.equal(rows[0].read, '<b>3.5</b> days on hand');
    assert.equal(rows[0].cells.at(-1), '1');
    assert.equal(rows[0].zzz, false);
    // Nothing draws on the napkins, so there is no cover and no truck.
    assert.equal(rows[1].el, `${tok('Napkins')} dead`);
    assert.equal(rows[1].zzz, true);
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

test('a line the player names here is named on the factory panel too', async () => {
  const page = await site({
    shop: FACTORY,
    plan: {recipes: [{slug: 'pizza', item: 'Pizza', out: 40,
                      ingredients: [{slug: 'dough', item: 'Dough', per: 2}]}]},
    supply: {day: 29, factories: factories({sites: [
      {...FACTORY_SITE, lines: [], needs: [], unnamed: [FACTORY_SITE.unnamed[0]]}]})},
    names: {r9: 'pizza'},
  });
  try {
    // The panel reads the overlaid view, so the choice kept in this browser
    // shows here the same way it shows on the Supply page.
    const lines = await page.$$eval('#sp-lines .sp-line:not(.sp-head)', rows =>
      rows.map(r => r.textContent.replace(/\s+/g, ' ').trim()));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^Pizza\s*Food Workstation · #4/);
    assert.equal(await page.locator('#sp-lines select.linepick').count(), 0);
    // And its input followed it in.
    assert.match(await page.locator('#sp-inputs tbody tr').first().innerText(), /Dough/);
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
