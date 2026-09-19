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
        lines: [{item: 'Lawyer Fee (Hourly)', price: 387.89, rate: 9, units: 0, revenue: 3491, soldPerDay: 9},
          // Furniture still boxed in the office's cargo: held, never sold.
          {item: 'Classic Phone', price: 0, rate: 0, units: 2, revenue: 0, soldPerDay: 0}],
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

// A theatre: two roles at one site, the projection booth the slower of them.
// Stage crew are five on the floor while one projectionist holds the ceiling,
// so the site's own onShift never reaches two and only a per-role reading can
// see the idle stage crew.
async function theatre() {
  const page = await browser.newPage({viewport: {width: 1280, height: 1100}});
  await page.route('https://**', route => route.abort());
  await page.setContent(html, {waitUntil: 'load'});
  await page.evaluate(() => {
    document.body.classList.add('has-board');
    const row = v => Array(24).fill(v);
    const week = v => Array.from({length: 7}, () => row(v));
    const key = 'ba:street_secondavenue#7';
    const customers = week(null);
    const staffed = week(0), onShift = week(0);
    const crewStaffed = week(0), crewOn = week(0);
    const projStaffed = week(0), projOn = week(0);
    for(let h = 9; h < 18; h++){
      customers[1][h] = h < 13 ? 25 : 5;   // full house, then a quiet afternoon
      staffed[1][h] = 25; onShift[1][h] = 1;  // the site is its slowest role
      projStaffed[1][h] = 25; projOn[1][h] = 1;
      crewStaffed[1][h] = 500; crewOn[1][h] = 5;
    }
    D = {
      meta: {character: 'theatre-fixture', day: 29},
      rhythm: null,
      supply: {shops: []},
      businesses: [{
        key, status: 'retail', name: 'Playhouse', code: 'PH', type: 'Theatre',
        address: '7 Second Avenue', neighbourhood: "Hell's Kitchen",
        opened: 12, revenue: 3000, customers: 180, basket: 20, profit: 500, margin: 16.6,
        cogs: 0, wages: 1200, rent: 400, marketing: 0, theft: 0, licensing: 0,
        staff: 6, staffCost: 1200, crew: [], people: [], lines: [],
        series: [], rhythm: null, peakDay: null, swing: 0,
      }],
      hours: [{
        key, name: 'Playhouse', office: false, postRate: null, customers,
        weeks: [0, 2, 0, 0, 0, 0, 0],
        thin: [true, false, true, true, true, true, true],
        staffed, onShift, effective: staffed,
        door: null, cap: 25, counters: 25, stationCount: 6, basket: 20, peak: 25, capHours: 4,
        roles: [
          {skill: 'ba:skill_projectionist', label: 'Projectionist', station: 'Projection Booth',
            noun: 'projection booths', counters: 25, stationCount: 1,
            staffed: projStaffed, onShift: projOn},
          {skill: 'ba:skill_stagecrew', label: 'Stage Crew', station: 'Costume Booth',
            noun: 'costume booths', counters: 500, stationCount: 5,
            staffed: crewStaffed, onShift: crewOn},
        ],
      }],
      hourFindings: [{
        kind: 'cap', key, site: 'Playhouse', office: false, hours: 4, when: 'Mon 9-13',
        limit: 'Projectionist cover', fix: 'another projection booth',
        noun: 'projection booths', cap: 25, capTop: 25, basket: 20, throughput: 285.71,
      }],
    };
    siteKey = key; siteOpen = true;
    drawSite();
  });
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
    const fees = await page.$$eval('#sitePanel table tbody tr', rows => rows.map(r => r.cells[0].firstChild.textContent));
    assert.deepEqual(fees, ['Lawyer Fee (Hourly)'], 'boxed furniture is not a fee');
    assert.doesNotMatch(panel, /odds and ends/);
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
    // The same boxed phone is a shop's odds and ends, behind the toggle.
    assert.match(panel, /show 1 more: bags, drinks, odds and ends/);
    assert.match(await page.locator('#sitePanel .sstat', {hasText: 'Customers'}).innerText(), /\/visit/);
  } finally { await page.close(); }
});

test('a theatre reads its grid by the role that holds it back, not by registers', async () => {
  const page = await theatre();
  try {
    const tip = await hourTip(page);
    assert.match(tip, /2 roles, the slowest 25 an hour, no door cap/);
    assert.doesNotMatch(tip, /register capacity|counters/);
    const read = await page.locator('#sitePanel .hc.cap').first().getAttribute('data-read');
    assert.match(read, /25 customers · 25 of 25 projection booths on · slowest of 2 roles · <b>at the ceiling<\/b>/);
    assert.doesNotMatch(read, /register capacity/);
  } finally { await page.close(); }
});

test('idle stage crew are outlined although the site as a whole runs one person', async () => {
  const page = await theatre();
  try {
    // The site's own onShift is 1 all afternoon, so the old site-wide test saw
    // nothing; the stage crew's five are idle against five customers an hour.
    const slack = page.locator('#sitePanel .hc.slack');
    assert.equal(await slack.count(), 5, 'the quiet hours 13:00-17:00');
    assert.match(await slack.first().getAttribute('data-read'), /5 customers · .* · capacity idle/);
  } finally { await page.close(); }
});
