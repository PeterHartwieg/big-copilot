// Staff demands on a site's detail and in the finding filters. Install
// Playwright and its Chromium browser to run; NODE_PATH may point at an existing
// Playwright installation.
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

async function site(demands, quit = 0) {
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
  await page.route('https://**', route => route.abort());
  await page.setContent(html, {waitUntil: 'load'});
  await page.evaluate(([demands, quit]) => {
    document.body.classList.add('has-board');
    const key = 'ba:street_secondavenue#10';
    D = {
      meta: {character: 'demand-fixture', day: 29}, rhythm: null, supply: {shops: []}, hours: [], hourFindings: [],
      businesses: [{
        key, status: 'retail', name: 'HART. Gifts', code: 'HK', type: 'Gift Shop', address: '10 Second Avenue',
        neighbourhood: "Hell's Kitchen", opened: 3, revenue: 900, customers: 30, basket: 30, profit: 200, margin: 22.2,
        cogs: 0, wages: 300, rent: 100, marketing: 0, theft: 0, licensing: 0, staff: 2, staffCost: 300,
        crew: [{role: 'Customer Service', count: 2, daily: 300, absent: 0}], people: [], lines: [],
        series: [], rhythm: null, peakDay: null, swing: 0, staffDemands: demands, quitWarnings: quit,
      }],
    };
    siteKey = key; siteOpen = true;
    drawSite();
  }, [demands, quit]);
  return page;
}

test('a site lists its unmet staff demands under the crew', async () => {
  const page = await site([
    {slug: 'ba:jobdemand_fulltime', demand: 'Full-time', count: 1, priority: 2, company: false},
    {slug: 'ba:jobdemand_goldhealthinsurance', demand: 'Gold Health Insurance', count: 2, priority: 1, company: true},
  ], 1);
  try {
    const crew = await page.locator('#sitePanel section', {hasText: 'Crew'}).first().innerText();
    assert.match(crew, /Unmet staff demands: Full-time ×1 · Gold Health Insurance ×2 \(company-wide\) · 1 has warned they will quit/);
  } finally { await page.close(); }
});

test('a site with every demand met says nothing', async () => {
  const page = await site([]);
  try {
    assert.doesNotMatch(await page.locator('#sitePanel').innerText(), /Unmet staff demands/);
  } finally { await page.close(); }
});

test('both demand findings can be filtered and link somewhere', async () => {
  const page = await site([]);
  try {
    const kinds = await page.evaluate(() => ALERT_GROUPS.filter(g => /demand/.test(g.id)).map(g => [g.id, g.on]));
    assert.deepEqual(kinds, [['jobdemand', true], ['companydemand', true]]);
    const links = await page.evaluate(() => [ALERT_LINKS.jobdemand, ALERT_LINKS.companydemand]);
    assert.deepEqual(links, [{sec: 'secDetail', site: true}, {sec: 'secPayroll'}]);
    // The amount column carries the people, since these findings have no money.
    const amounts = await page.evaluate(() => [
      findingAmount({group: 'jobdemand', text: '2 staff with unmet demands: Mouse Pad for 2 (nice to have)'}),
      findingAmount({group: 'companydemand', text: '11 staff with demands only you can meet: Gold Health Insurance for 4'}),
      splitFinding({group: 'jobdemand', site: 'HART. Gifts', text: '2 staff with unmet demands: Mouse Pad for 2 (nice to have)'}).what,
    ]);
    assert.deepEqual(amounts, ['2<small>staff</small>', '11<small>staff</small>', '2 staff with unmet demands']);
  } finally { await page.close(); }
});
