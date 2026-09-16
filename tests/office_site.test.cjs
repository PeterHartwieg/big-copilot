// An office's site detail: the shop's hour grid in office words, and its fee in
// place of shelves. Install Playwright and its Chromium browser to run; NODE_PATH
// may point at an existing Playwright installation.
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

async function site(status) {
  const page = await browser.newPage({viewport: {width: 1280, height: 1100}});
  await page.route('https://**', route => route.abort());
  await page.setContent(html, {waitUntil: 'load'});
  await page.evaluate(office => {
    document.body.classList.add('has-board');
    const row = v => Array(24).fill(v);
    const week = v => Array.from({length: 7}, () => row(v));
    const key = 'ba:street_secondavenue#10';
    const staffed = week(0), customers = week(null), onShift = week(0);
    for(let h = 9; h < 17; h++){ staffed[1][h] = 3; customers[1][h] = 3; onShift[1][h] = 3; }
    D = {
      meta: {character: 'office-fixture', day: 29},
      rhythm: null,
      supply: {shops: []},
      businesses: [{
        key, status: office ? 'office' : 'retail', name: 'HART. &Partners', code: 'HK',
        type: office ? 'Law Firm' : 'Supermarket', address: '10 Second Avenue', neighbourhood: "Hell's Kitchen",
        opened: 12, revenue: 3491, customers: 9, basket: 387.89, profit: 1200, margin: 34.4,
        cogs: 0, wages: 2000, rent: 291, marketing: 0, theft: 0, licensing: 0,
        staff: 3, staffCost: 2100, crew: [{role: 'Lawyer', count: 3, daily: 2100, absent: 0}], people: [],
        lines: [{item: 'Lawyer Fee (Hourly)', price: 387.89, rate: 9, units: 0, revenue: 3491, soldPerDay: 9}],
        series: [], rhythm: null, peakDay: null, swing: 0,
      }],
      hours: [{
        key, name: 'HART. &Partners', office, postRate: office ? 1 : null, customers, weeks: [0, 2, 0, 0, 0, 0, 0],
        thin: [true, false, true, true, true, true, true], staffed, onShift, effective: staffed,
        door: 50, cap: 50, counters: 3, stationCount: 3, basket: 387.89, peak: 3, capHours: 8,
      }],
      hourFindings: [{
        kind: 'cap', key, site: 'HART. &Partners', office, hours: 8, when: 'Mon 9-17',
        limit: office ? 'workstations' : 'registers', fix: office ? 'another computer workstation' : 'another counter',
        cap: 3, capTop: 3, basket: 387.89, throughput: 1330.08,
      }],
    };
    siteKey = key; siteOpen = true;
    drawSite();
  }, status === 'office');
  return page;
}

const hourTip = page => page.locator('#sitePanel .sechead', {hasText: 'Customers by hour'}).locator('.why').getAttribute('data-tip');

test('an office reads its grid as staffed workstations, with the finding and its money', async () => {
  const page = await site('office');
  try {
    const tip = await hourTip(page);
    assert.match(tip, /3 workstations, each billing 1 customer an hour when staffed, 50\/h door cap/);
    assert.match(tip, /workstations is the limit, so the answer is another computer workstation\. \$[\d.,]+k?\/day of trade/);
    assert.doesNotMatch(tip, /register capacity|counter/);
    const read = await page.locator('#sitePanel .hc.cap').first().getAttribute('data-read');
    assert.match(read, /3 customers · 3 of 3 workstations staffed · <b>at the ceiling<\/b>/);
    assert.match(await page.locator('#sitePanel .sstat', {hasText: 'Customers'}).innerText(), /\$387\.89\/hour billed/);
  } finally { await page.close(); }
});

test('an office lists its fee, not shelves to top up', async () => {
  const page = await site('office');
  try {
    const panel = await page.locator('#sitePanel').innerText();
    assert.match(panel, /Fees/);
    assert.doesNotMatch(panel, /Shelves|before tomorrow's top-up|On hand|Pressure/);
    const heads = await page.$$eval('#sitePanel table thead th', ths => ths.map(th => th.textContent));
    assert.deepEqual(heads, ['Fee', 'Hours billed / day', 'Revenue / day']);
  } finally { await page.close(); }
});

test('a shop keeps its registers and shelves', async () => {
  const page = await site('retail');
  try {
    const tip = await hourTip(page);
    assert.match(tip, /3 register capacity across 3 counters, 50\/h door cap/);
    const read = await page.locator('#sitePanel .hc.cap').first().getAttribute('data-read');
    assert.match(read, /3 of 3 register capacity on/);
    const panel = await page.locator('#sitePanel').innerText();
    assert.match(panel, /Shelves/);
    assert.match(await page.locator('#sitePanel .sstat', {hasText: 'Customers'}).innerText(), /\/visit/);
  } finally { await page.close(); }
});
