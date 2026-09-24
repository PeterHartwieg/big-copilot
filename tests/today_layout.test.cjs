// Today, found at a glance: the profit tile opens the daily result, heavy debt
// is on the cash tile, the two count lines under the list, the Portfolio's
// company costs, and a phone that never scrolls sideways. Install Playwright and
// its Chromium browser to run; NODE_PATH may point at an existing Playwright
// installation.
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
  {cwd: path.join(__dirname, '..'), maxBuffer: 8 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8')
    : result.stdout.toString();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

const KEY = 'ba:street_secondavenue#10';

/** Today drawn from a synthetic payload: four tiles, a list with a long
 *  sentence, one finding under the gate and three in a switched-off kind. */
async function today(width, {debt = 0, profitSum7 = 70000} = {}) {
  const page = await browser.newPage({viewport: {width, height: 900}});
  await page.route('https://**', route => route.abort());
  await page.setContent(html, {waitUntil: 'load'});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.evaluate(([KEY, debt, profitSum7]) => {
    document.body.classList.add('has-board');
    const day = (d, profit) => ({day: d, profit, business: profit + 1500, revenue: 40000,
      rent: 300, wages: 9000, loans: 900, insurance: 450, homes: 100, parking: 50});
    const finding = (group, level, text, worth, unit) => ({group, level, text, worth, unit,
      site: 'HART. Gifts', siteKey: KEY, id: `${group}-${worth}-${text.length}`});
    D = {
      meta: {character: 'today-fixture', day: 30},
      kpi: {cash: 1234567, debt, profitYesterday: 10000, profitAvg7: 10000, profitPrev7: 9000,
            profitSum7, revenue: 40000, customers: 1234, rentBill: 300, netWorth: null},
      cashFlow: null, loans: debt ? [{remaining: debt}] : [],
      staff: {dailyCost: 8800},
      daily: [day(28, 9000), day(29, 10000)],
      businesses: [{key: KEY, name: 'HART. Gifts', code: 'HK', status: 'retail'}],
      alerts: [
        finding('feed', 'warn', 'HART. Gifts Clothing (Classic Expensive Female) arrives at 6,612/day against 11,520 needed while Import Hub holds 65,354; the line is not drawing it', null, ''),
        finding('atcap', 'warn', 'HART. Gifts is at the 50/h building capacity Mon-Fri 9-16, 35 hours a week at the ceiling', 9000, '/day trade'),
      ],
      minor: {gate: 500, rows: [
        finding('hype', 'info', 'Wave ending', 120, '/day revenue'),
        finding('idlestaff', 'info', 'HART. Gifts runs 72 staff-hours a week that buy nothing: 3 counters Mon-Wed 8-20', 300, '/day wages'),
        finding('idlestaff', 'info', 'HART. Gifts runs 24 staff-hours a week that buy nothing: 2 counters Tue 8-20', 100, '/day wages'),
      ]},
    };
    Object.assign(alertGroupPrefs, {atcap: true, idlestaff: false, hype: true, feed: true});
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageToday'; });
    drawKpis(); drawAlerts();
    document.querySelectorAll('#pageToday section').forEach(s => s.classList.add('measured'));
  }, [KEY, debt, profitSum7]);
  return page;
}

test('the profit tile opens Company > Results and keeps its spark', async () => {
  const page = await today(1440);
  try {
    const tile = page.locator('#kpis a.kpi');
    assert.equal(await tile.count(), 1);
    assert.match(await tile.innerText(), /Profit yesterday/i);
    assert.equal(await tile.locator('.spark').count(), 1);
    assert.equal(await tile.getAttribute('href'), '#secDaily');
    await page.evaluate(() => { reveal = id => { window.went = id; }; });
    await tile.click();
    assert.equal(await page.evaluate(() => window.went), 'secDaily');
    assert.equal(await page.evaluate(() => SEC_PAGE.secDaily.join(' ')), 'company results');
  } finally { await page.close(); }
});

test('debt joins the cash tile only once it outweighs a week of profit', async () => {
  let page = await today(1440, {debt: 1890000, profitSum7: 70000});
  try {
    const cash = page.locator('#kpis .kpi').nth(2);
    assert.match(await cash.innerText(), /\$1\.89M owed on loans/);
  } finally { await page.close(); }
  page = await today(1440, {debt: 50000, profitSum7: 70000});
  try {
    assert.doesNotMatch(await page.locator('#kpis .kpi').nth(2).innerText(), /owed/);
  } finally { await page.close(); }
});

test('below the gate and switched off are two lines, each with its own show', async () => {
  const page = await today(1440);
  try {
    const lines = await page.locator('#alertMinor .td-count').allInnerTexts();
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^1 below the \$500\/day line/);
    assert.match(lines[1], /^2 in kinds you switched off: Overstaffed hours \(2, \$400\/day\)/);
    await page.click('[data-td-toggle="off"]');
    assert.equal(await page.locator('[data-td-rows="off"] .find').count(), 2);
    assert.equal(await page.locator('[data-td-rows="below"] .find').count(), 0);
    // The variant survives the headline cut.
    assert.match(await page.locator('#alerts .find .what').first().innerText(),
      /^Clothing \(Classic Expensive Female\)/);
  } finally { await page.close(); }
});

test('the Portfolio total meets Today\'s profit through the company costs', async () => {
  const page = await today(1440);
  try {
    const rows = await page.evaluate(() => {
      const t = document.createElement('table');
      t.innerHTML = `<tfoot>${outsideRows(10)}</tfoot>`;
      return [...t.querySelectorAll('tr')].map(tr => [...tr.cells].map(c => c.textContent.trim()).join('|'));
    });
    assert.deepEqual(rows, ['Company costs outside sites|-$1,500|', 'Company profit|$10,000|']);
    const tip = await page.evaluate(() => {
      const t = document.createElement('table');
      t.innerHTML = `<tfoot>${outsideRows(10)}</tfoot>`;
      return t.querySelector('[data-tip]').dataset.tip;
    });
    assert.match(tip, /loans \$900, health insurance \$450, homes \$100, parking \$50/);
  } finally { await page.close(); }
});

test('at 390 px Today pairs its tiles, stacks its cards and never scrolls sideways', async () => {
  const page = await today(390);
  try {
    const m = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('#kpis .kpi')].map(t => t.getBoundingClientRect());
      const cards = [...document.querySelectorAll('#secMoves .move')].map(c => c.getBoundingClientRect());
      const row = document.querySelector('#alerts .find');
      const site = row.querySelector('.site').getBoundingClientRect();
      const what = row.querySelector('.what').getBoundingClientRect();
      return {
        scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth,
        tileTops: tiles.map(r => Math.round(r.top)), tileLefts: tiles.map(r => Math.round(r.left)),
        cardLefts: cards.map(r => Math.round(r.left)),
        sentenceBelowSite: what.top >= site.bottom - 1,
      };
    });
    assert.equal(m.scroll, m.width, 'no sideways scroll');
    assert.equal(m.tileTops[0], m.tileTops[1]);
    assert.equal(m.tileTops[2], m.tileTops[3]);
    assert.ok(m.tileTops[2] > m.tileTops[0], 'two rows of two');
    assert.equal(new Set(m.cardLefts).size, 1, 'the cards stack');
    assert.ok(m.sentenceBelowSite, 'the sentence has a line of its own');
  } finally { await page.close(); }
});
