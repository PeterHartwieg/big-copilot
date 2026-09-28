// Payback on Businesses › Results and the site panel (docs/open-a-store-scope.md,
// Phase 1): the column per chain and site, the company-cost rows still as wide
// as the header, the install-mode switch kept per character, sorting by the
// column, and the site panel's line for a shop but not for a factory. The board
// is the CLI page rendered from the synthetic day-47 payload snapshot
// (tests/fixtures/payload_snapshot/, never a real save). Install Playwright and
// its Chromium browser to run; NODE_PATH may point at an existing installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const {chromium} = require('playwright');

const ROOT = path.join(__dirname, '..');
let browser, html;
before(async () => {
  const made = spawnSync(process.env.PYTHON || 'python', ['-c', `
import json, sys
from ba_dashboard import render
d = json.load(open("tests/fixtures/payload_snapshot/data_day47_history.json", encoding="utf-8"))
sys.stdout.buffer.write(render(d).encode("utf-8"))`], {cwd: ROOT, maxBuffer: 64 * 1024 * 1024});
  assert.equal(made.status, 0, made.stderr.toString());
  html = made.stdout.toString('utf8');
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

// The fixture's shop fed by its own brewery, its gift shop, and the brewery.
const SPIRITS = 'ba:street_eighthstreet#5', GIFTS = 'ba:street_broadwaystreet#19', BREWERY = 'ba:street_eighthavenue#8';
const STORE = 'ba_dash_payback:PAYLOADco';

async function board(t, context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await page.goto('https://pb.test/#businesses/results', {waitUntil: 'load'});
  await page.waitForFunction(() => typeof hasData === 'function' && hasData() && document.querySelector('#portfolio thead'));
  return page;
}
async function context(t) {
  const ctx = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
  t.after(() => ctx.close());
  await ctx.route('https://**', route => route.abort());
  await ctx.route('https://pb.test/**', route => new URL(route.request().url()).pathname === '/'
    ? route.fulfill({contentType: 'text/html; charset=utf-8', body: html}) : route.fulfill({status: 404, body: ''}));
  return ctx;
}
const kidCell = (page, key) => page.$eval(`#portfolio tr.kid[data-key="${key}"] td:last-child`, td => td.innerText.trim());

test('the Payback column: its header, a cell per chain and site, and every row as wide as the header', async t => {
  const page = await board(t, await context(t));
  const heads = await page.$$eval('#portfolio thead th', ths => ths.map(th => th.innerText.trim()));
  assert.equal(heads[heads.length - 1].toLowerCase(), 'payback');
  // Every row spans the header: the chain rows, the sites, the total and the
  // two company-cost rows under it (their colspan is counted).
  const widths = await page.$$eval('#portfolio tbody tr, #portfolio tfoot tr', rows =>
    rows.map(r => [...r.children].reduce((n, td) => n + (+td.getAttribute('colspan') || 1), 0)));
  assert.ok(widths.length >= 6);
  for(const w of widths) assert.equal(w, heads.length);
  assert.equal(await page.locator('#portfolio tfoot tr.td-outside').count(), 2);
  // The company profit stays under Profit, not under Margin or Payback.
  const profitAt = heads.findIndex(h => /profit/i.test(h));
  const net = await page.$$eval('#portfolio tfoot tr.td-net td', tds => tds.map(td => +td.getAttribute('colspan') || 1));
  assert.equal(net[0], profitAt);
  // Installation firm by default: the shop still has days to go; the brewery
  // is a cost centre and has no payback of its own.
  assert.equal(await kidCell(page, SPIRITS), '146 d');
  assert.equal(await kidCell(page, BREWERY), '—');
  assert.match(await page.$eval(`#portfolio tr.kid[data-key="${SPIRITS}"] .pb-cell`, e => e.dataset.tip),
    /^146 days to go at recent profit\. Invested \$[\d,]+: furniture/);
  // Beside the sidebar at 1280 px the whole table fits, Payback included.
  const fit = await page.$eval('#portfolio', t => [t.parentElement.scrollWidth, t.parentElement.clientWidth]);
  assert.ok(fit[0] <= fit[1], `the table overflows at 1280 px: ${fit}`);
});

test('the install mode changes the cells and is kept per character', async t => {
  const ctx = await context(t);
  const page = await board(t, ctx);
  assert.equal(await page.locator('#paybackMode a.on').getAttribute('data-id'), 'firm');
  await page.click('#paybackMode a[data-id="self"]');
  assert.equal(await kidCell(page, SPIRITS), 'day 30');
  assert.match(await page.$eval(`#portfolio tr.kid[data-key="${SPIRITS}"] .pb-cell`, e => e.dataset.tip),
    /^Break even on day 30, 27 days after opening\./);
  assert.equal(await page.evaluate(k => localStorage.getItem(k), STORE), 'self');
  const again = await board(t, ctx);
  assert.equal(await again.locator('#paybackMode a.on').getAttribute('data-id'), 'self');
  assert.equal(await kidCell(again, GIFTS), 'day 27');
  // Another character's board does not read this one's choice.
  assert.equal(await again.evaluate(() => { D.meta.character = 'OTHERco'; return paybackMode(); }), 'firm');
});

test('sorting by Payback orders the chains by the day they pay back', async t => {
  const page = await board(t, await context(t));
  const at = await page.$$eval('#portfolio thead th', ths => ths.length - 1);
  const ranks = () => page.$$eval('#portfolio tr.chain', rows => rows.map(r =>
    paybackRank(paybackChain(D.chains.find(c => enOf(c, 'name') === r.dataset.chain)))));
  await page.click(`#portfolio thead th[data-i="${at}"]`);
  const down = await ranks();
  assert.deepEqual(down, [...down].sort((a, z) => z - a));
  await page.click(`#portfolio thead th[data-i="${at}"]`);
  const up = await ranks();
  assert.deepEqual(up, [...up].sort((a, z) => a - z));
  assert.notDeepEqual(up, down);
});

test('the site panel has a Payback line for a shop and none for a factory', async t => {
  const page = await board(t, await context(t));
  await page.evaluate(k => openSite(k), SPIRITS);
  await page.waitForSelector('#sitePanel .sitehead');
  assert.equal(await page.locator('#sitePanel .sp-pay').innerText(), 'Payback: 146 days to go at recent profit');
  await page.evaluate(k => openSite(k), BREWERY);
  await page.waitForFunction(k => siteKey === k, BREWERY);
  assert.equal(await page.locator('#sitePanel .sp-pay').count(), 0);
});
