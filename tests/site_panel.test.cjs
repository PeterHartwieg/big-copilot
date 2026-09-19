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
      supply: {shops: []}, hours: [], hourFindings: [], trends: [], hypeExposure: [],
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
  const page = await site({shop: {revenue: 0, notTrading: ['prices', 'stock', 'plan']}});
  try {
    const checks = await page.$$eval('#sitePanel .sp-pre [data-check]', els =>
      els.map(e => [e.dataset.check, e.className]));
    assert.deepEqual(checks, [
      ['staff', 'ok'], ['prices', 'no'], ['stock', 'no'],
      // Never checked: the alert stops at the first failure behind prices.
      ['shelves', 'unk'], ['plan', 'no'],
    ]);
  } finally { await page.close(); }

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
