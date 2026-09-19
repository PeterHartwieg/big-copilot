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
let THEATRE;
before(async () => {
  const result = spawnSync(process.env.PYTHON || 'python', ['-c',
    'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
  {cwd: path.join(__dirname, '..'), maxBuffer: 4 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  const fixture = spawnSync(process.env.PYTHON || 'python', ['-m', 'tests.theatre_fixture'],
    {cwd: path.join(__dirname, '..'), maxBuffer: 8 * 1024 * 1024});
  assert.equal(fixture.status, 0, fixture.stderr?.toString());
  THEATRE = JSON.parse(fixture.stdout.toString());
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
// hour. Both the grid and the findings come out of tests/theatre_fixture.py,
// which runs the real _hour_findings() over the grid it builds — a hand-written
// finding beside a hand-written grid drifted from it, and said "staffing and
// projection booths" over hours where both roles were short of people.
async function theatre() {
  const page = await browser.newPage({viewport: {width: 1280, height: 1100}});
  await page.route('https://**', route => route.abort());
  await page.setContent(html, {waitUntil: 'load'});
  await page.evaluate(([grid, findings]) => {
    document.body.classList.add('has-board');
    D = {
      meta: {character: 'theatre-fixture', day: 29},
      rhythm: null,
      supply: {shops: []},
      businesses: [{
        key: grid.key, status: 'retail', name: 'Playhouse', code: 'PH', type: 'Theatre',
        address: '7 Second Avenue', neighbourhood: "Hell's Kitchen",
        opened: 12, revenue: 3000, customers: 180, basket: 20, profit: 500, margin: 16.6,
        cogs: 0, wages: 1200, rent: 400, marketing: 0, theft: 0, licensing: 0,
        staff: 6, staffCost: 1200, crew: [], people: [], lines: [],
        series: [], rhythm: null, peakDay: null, swing: 0,
      }],
      hours: [grid],
      hourFindings: findings,
    };
    siteKey = grid.key; siteOpen = true;
    drawSite();
  }, [THEATRE.grid, THEATRE.findings]);
  return page;
}

const hourTip = page => page.locator('#sitePanel .sechead', {hasText: 'Hours'}).locator('.why').getAttribute('data-tip');
const capChip = page => page.locator('#sitePanel .sp-hchip.cap').getAttribute('data-tip');

test('an office reads its grid as staffed workstations, with the finding and its money', async () => {
  const page = await site('office');
  try {
    const tip = await hourTip(page);
    assert.match(tip, /3 workstations, each billing 1 customer an hour when staffed, 50\/h door cap/);
    assert.doesNotMatch(tip, /register capacity|counter/);
    // The ceiling sentence moved out of the ? into the chip under the grid.
    const cap = await capChip(page);
    assert.match(cap, /workstations is the limit, so the answer is another computer workstation\. \$[\d.,]+k?\/day of trade/);
    assert.doesNotMatch(tip, /is the limit/);
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
    const cap = await capChip(page);
    assert.match(cap, /registers is the limit, so the answer is another counter/);
  } finally { await page.close(); }
});

// The capped Monday cells in order: 10:00, then 12:00.
const capReads = page => page.$$eval('#sitePanel .hc.cap', cells => cells.map(c => c.dataset.read));
const capChips = page => page.$$('#sitePanel .sp-hchip.cap');
// The block is off screen, so the delegated listener is given the event
// straight rather than Playwright's hover, which waits for visibility.
const hoverChip = (page, k) => page.evaluate(i => document
  .querySelectorAll('#sitePanel .sp-hchip.cap')[i]
  .dispatchEvent(new MouseEvent('mouseover', {bubbles: true})), k);
const capState = page => page.$$eval('#sitePanel .hc.cap',
  cells => cells.map(c => Number(getComputedStyle(c).opacity) > 0.5 ? 'lit' : 'dim'));

test('a theatre counts furniture and capacity as two numbers, never as one', async () => {
  const page = await theatre();
  try {
    const tip = await hourTip(page);
    assert.match(tip, /3 roles, the slowest 50 an hour, no door cap/);
    assert.doesNotMatch(tip, /register capacity/);
    // 12:00: one projection booth of two is manned, and one booth is 25/h.
    // The old wording said "25 of 25 projection booths", which is neither.
    const [, noon] = await capReads(page);
    assert.match(noon, /25 customers · 1 of 2 projection booths · 25\/h · slowest of 3 roles · <b>at the ceiling<\/b>/);
    assert.doesNotMatch(noon, /25 of 25/);
  } finally { await page.close(); }
});

test('Customer Service binding a multi-role site names its booths, not registers', async () => {
  const page = await theatre();
  try {
    // 10:00: one of two ticket booths manned, 50 of 100. The site number would
    // read "50 of 50 register capacity on" — full, and about furniture the
    // theatre does not have.
    const [ten] = await capReads(page);
    assert.match(ten, /50 customers · 1 of 2 ticket booths · 50\/h/);
    assert.doesNotMatch(ten, /register capacity|counter/);
  } finally { await page.close(); }
});

test('two roles tied at the ceiling are both named', async () => {
  const page = await theatre();
  try {
    // 10:00: one ticket booth of two at 50, and both projection booths at 50.
    // Neither alone is the answer, so the cell says both, as the finding does.
    const [ten] = await capReads(page);
    assert.match(ten, /1 of 2 ticket booths · 50\/h \+ 2 of 2 projection booths · 50\/h · slowest of 3 roles/);
  } finally { await page.close(); }
});

test('a finding naming two tied answers reads as a plural', async () => {
  const page = await theatre();
  try {
    // The sentence lives in the chip under the grid, not in the head's ?.
    const tie = THEATRE.findings.find(f => f.limits === 2);
    assert.equal(tie.limit, 'staffing and projection booths',
      'the planner really does join a people limit to a posts one');
    const tip = await (await capChips(page))[0].getAttribute('data-tip');
    assert.match(tip, /staffing and projection booths are the limit, so the answer is more service staff on those hours and another projection booth/);
    assert.doesNotMatch(tip, /projection booths is the limit/);
    assert.doesNotMatch(await hourTip(page), /is the limit|are the limit/);
  } finally { await page.close(); }
});

test('a chip for two tied answers asks for both kinds of hour, not the door', async () => {
  const page = await theatre();
  try {
    // "staffing and projection booths" is a tie between people and posts, and
    // the chip has to ask the grid for both. Looking the joined sentence up in
    // a table of single limits misses, and the miss used to light the door's
    // hours — a ceiling this theatre does not even have.
    const chips = await capChips(page);
    assert.equal(await chips[0].getAttribute('data-show'),
      'staff:ba:skill_customerservice post:ba:skill_projectionist');
    await hoverChip(page, 0);
    // 10:00 is the tie; 12:00 is projection short of people, and stays dim.
    assert.deepEqual(await capState(page), ['lit', 'dim']);
  } finally { await page.close(); }
});

test('a role-specific limit draws people and its own furniture, never a door', async () => {
  const page = await theatre();
  try {
    // The four old limits had an icon apiece; a role's words -- "Projectionist
    // staffing", "projection booths", the two joined -- matched none of them,
    // and every miss fell through to a DOOR, on a site with no door cap.
    const named = sel => page.evaluate(s => {
      const want = {};
      for(const k of ['door', 'person', 'counter', 'monitor'])
        want[k] = spIcon(k).replace(/^<svg[^>]*>|<\/svg>$/g, '');
      return [...document.querySelectorAll(s)].map(el =>
        Object.keys(want).find(k => want[k] === el.innerHTML) || '?');
    }, sel);
    // The tie: people for the staffing half, the counter for the posts half.
    const icons = await named('#sitePanel .sp-hchips .sp-hchip.cap .sp-i svg');
    assert.deepEqual(icons.slice(0, 2), ['person', 'counter']);
    assert.ok(!icons.includes('door'), icons.join(','));
    // And the ceiling icons on the tile light what the findings name: the
    // theatre has no door cap at all, so that one stays off.
    const ceiling = await page.$$eval('#sitePanel .sp-ceil .sp-i',
      els => els.map(e => e.classList.contains('on')));
    assert.deepEqual(ceiling, [false, true, true], 'door off, counter and person lit');
  } finally { await page.close(); }
});


test('two findings of one kind on different roles do not light each other\'s hours', async () => {
  const page = await theatre();
  try {
    // 10:00 is held partly by the ticket booths' staffing and 12:00 wholly by
    // projection's. Both are "short of people", so a cell stamped with the
    // kind alone belonged to both chips and hovering either lit both hours.
    const kinds = THEATRE.findings.filter(f => f.kind === 'cap')
      .map(f => f.limit);
    assert.deepEqual(kinds, ['staffing and projection booths', 'Projectionist staffing']);
    const chips = await capChips(page);
    assert.equal(await chips[1].getAttribute('data-show'), 'staff:ba:skill_projectionist');
    await hoverChip(page, 1);
    assert.deepEqual(await capState(page), ['dim', 'lit']);
  } finally { await page.close(); }
});

test('every role standing at a capped hour names its own ceiling on the cell', async () => {
  const page = await theatre();
  try {
    // 10:00 two roles stand at the site's 50/h, one short of people and one
    // with every booth it owns already manned; 12:00 projection alone, short
    // of people. A site-wide reading would have called 10:00 posts, because
    // the site's own 50 is its full capacity that hour.
    const worn = await page.$$eval('#sitePanel .hc.cap', cells => cells.map(c => c.dataset.caps));
    assert.deepEqual(worn, [
      'staff:ba:skill_customerservice post:ba:skill_projectionist',
      'staff:ba:skill_projectionist',
    ]);
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
    assert.match(read, /5 customers · 1 of 2 projection booths · 25\/h · slowest of 3 roles · Stage Crew idle/);
    assert.doesNotMatch(read, /Customer Service idle/);
  } finally { await page.close(); }
});
