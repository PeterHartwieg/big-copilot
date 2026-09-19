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

// A theatre: three roles at one site, and a different one holding it back each
// hour. 10:00 the ticket booths bind on their own, 11:00 they tie with
// projection at 50/h, 12:00 projection binds with one booth of three manned,
// and the quiet afternoon leaves five stage crew standing about while the site
// as a whole never has two people on, so only a per-role reading sees them.
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
    const role = () => ({staffed: week(0), onShift: week(0), posts: week(0)});
    const ticket = role(), proj = role(), crew = role();
    // [customers, ticket posts manned, projection posts manned] by the hour;
    // the stage crew's five booths are manned all day.
    const day = {10: [50, 1, 3], 11: [50, 1, 2], 12: [25, 2, 1],
      14: [5, 1, 1], 15: [5, 1, 1], 16: [5, 1, 1]};
    for(const [hour, [seen, tp, pp]] of Object.entries(day)){
      const h = Number(hour);
      customers[1][h] = seen;
      ticket.posts[1][h] = tp; ticket.staffed[1][h] = tp * 50; ticket.onShift[1][h] = tp;
      proj.posts[1][h] = pp; proj.staffed[1][h] = pp * 25; proj.onShift[1][h] = pp;
      crew.posts[1][h] = 5; crew.staffed[1][h] = 500; crew.onShift[1][h] = 5;
      staffed[1][h] = Math.min(ticket.staffed[1][h], proj.staffed[1][h], 500);
      onShift[1][h] = Math.min(tp, pp, 5);
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
        door: null, cap: 0, counters: 75, stationCount: 10, basket: 20, peak: 50, capHours: 3,
        roles: [
          // Customer Service: the role whose alert words are the old ones, so
          // its `noun` is null and only the station names it on the page.
          {skill: 'ba:skill_customerservice', label: 'Customer Service', station: 'Ticket Booth',
            noun: null, one: 'ticket booth', many: 'ticket booths',
            counters: 100, stationCount: 2, ...ticket},
          {skill: 'ba:skill_projectionist', label: 'Projectionist', station: 'Projection Booth',
            noun: 'projection booths', one: 'projection booth', many: 'projection booths',
            counters: 75, stationCount: 3, ...proj},
          {skill: 'ba:skill_stagecrew', label: 'Stage Crew', station: 'Costume Booth',
            noun: 'costume booths', one: 'costume booth', many: 'costume booths',
            counters: 500, stationCount: 5, ...crew},
        ],
      }],
      hourFindings: [{
        kind: 'cap', key, site: 'Playhouse', office: false, hours: 3, when: 'Mon 10-13',
        limit: 'staffing', fix: 'more service staff on those hours',
        noun: null, cap: 25, capTop: 50, basket: 20, throughput: 285.71,
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

// The capped Monday cells in order: 10:00, 11:00, 12:00.
const capReads = page => page.$$eval('#sitePanel .hc.cap', cells => cells.map(c => c.dataset.read));

test('a theatre counts furniture and capacity as two numbers, never as one', async () => {
  const page = await theatre();
  try {
    const tip = await hourTip(page);
    assert.match(tip, /3 roles, the slowest 75 an hour, no door cap/);
    assert.doesNotMatch(tip, /register capacity/);
    // 12:00: one projection booth of three is manned, and one booth is 25/h.
    // The old wording said "25 of 25 projection booths", which is neither.
    const [, , noon] = await capReads(page);
    assert.match(noon, /25 customers · 1 of 3 projection booths · 25\/h · slowest of 3 roles · <b>at the ceiling<\/b>/);
    assert.doesNotMatch(noon, /25 of 25/);
  } finally { await page.close(); }
});

test('Customer Service binding a multi-role site names its booths, not registers', async () => {
  const page = await theatre();
  try {
    // 10:00: one of two ticket booths manned, 50 of 100, while projection runs
    // all three at 75. The site number would read "50 of 50 register capacity
    // on" — full, and about furniture the theatre does not have.
    const [ten] = await capReads(page);
    assert.match(ten, /50 customers · 1 of 2 ticket booths · 50\/h · slowest of 3 roles · <b>at the ceiling<\/b>/);
    assert.doesNotMatch(ten, /register capacity|counter/);
  } finally { await page.close(); }
});

test('two roles tied at the ceiling are both named', async () => {
  const page = await theatre();
  try {
    // 11:00: one ticket booth at 50 and two projection booths at 50. Neither
    // alone is the answer, so the cell says both, as the findings do.
    const [, eleven] = await capReads(page);
    assert.match(eleven, /1 of 2 ticket booths · 50\/h \+ 2 of 3 projection booths · 50\/h · slowest of 3 roles/);
  } finally { await page.close(); }
});

test('an idle hour names the role that is idle', async () => {
  const page = await theatre();
  try {
    // The site's own onShift is 1 all afternoon, so the old site-wide test saw
    // nothing; the stage crew's five are idle against five customers an hour,
    // and the hover has to say it was the stage crew.
    const slack = page.locator('#sitePanel .hc.slack');
    assert.equal(await slack.count(), 3, 'the quiet hours 14:00-16:00');
    const read = await slack.first().getAttribute('data-read');
    assert.match(read, /5 customers · 1 of 3 projection booths · 25\/h · slowest of 3 roles · Stage Crew idle/);
    assert.doesNotMatch(read, /Customer Service idle/);
  } finally { await page.close(); }
});
