// Payback on Businesses › Results and the site panel (docs/open-a-store-scope.md,
// Phase 1): the column per chain and site, the company-cost rows still as wide
// as the header, the install-mode switch kept per character, sorting by the
// column, and the site panel's line for a shop but not for a factory. The board
// is the CLI page rendered from the synthetic day-47 payload snapshot
// (tests/fixtures/payload_snapshot/, never a real save). Install Playwright and
// its Chromium browser to run; NODE_PATH may point at an existing installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
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
  assert.equal(heads[heads.length - 1].toLowerCase(), en('co.col.payback').toLowerCase());
  // Every row spans the header: the chain rows, the sites, the total and the
  // two company-cost rows under it (their colspan is counted).
  const widths = await page.$$eval('#portfolio tbody tr, #portfolio tfoot tr', rows =>
    rows.map(r => [...r.children].reduce((n, td) => n + (+td.getAttribute('colspan') || 1), 0)));
  assert.ok(widths.length >= 6);
  for(const w of widths) assert.equal(w, heads.length);
  assert.equal(await page.locator('#portfolio tfoot tr.td-outside').count(), 2);
  // The company profit stays under Profit, not under Margin or Payback.
  const profitAt = heads.findIndex(h => enRe('co.col.profit', {}, {flags: 'i'}).test(h));
  const net = await page.$$eval('#portfolio tfoot tr.td-net td', tds => tds.map(td => +td.getAttribute('colspan') || 1));
  assert.equal(net[0], profitAt);
  // Installation firm by default: the shop still has days to go; the brewery
  // is a cost centre and has no payback of its own.
  assert.equal(await kidCell(page, SPIRITS), en('co.payback.cell.togo', {n: 146}));
  assert.equal(await kidCell(page, BREWERY), '—');
  assert.match(await page.$eval(`#portfolio tr.kid[data-key="${SPIRITS}"] .pb-cell`, e => e.dataset.tip),
    new RegExp('^' + enRe('co.payback.togo', {n: 146}).source + '\\.' + ' ' + enRe('co.payback.cost.firm').source));
  // Beside the sidebar at 1280 px the whole table fits, Payback included.
  const fit = await page.$eval('#portfolio', t => [t.parentElement.scrollWidth, t.parentElement.clientWidth]);
  assert.ok(fit[0] <= fit[1], `the table overflows at 1280 px: ${fit}`);
});

test('the install mode changes the cells and is kept per character', async t => {
  const ctx = await context(t);
  const page = await board(t, ctx);
  assert.equal(await page.locator('#paybackMode a.on').getAttribute('data-id'), 'firm');
  await page.click('#paybackMode a[data-id="self"]');
  assert.equal(await kidCell(page, SPIRITS), en('co.payback.cell.reached', {day: 30}));
  assert.match(await page.$eval(`#portfolio tr.kid[data-key="${SPIRITS}"] .pb-cell`, e => e.dataset.tip),
    new RegExp('^' + enRe('co.payback.reached', {day: 30, n: 27}).source + '\\.'));
  assert.equal(await page.evaluate(k => localStorage.getItem(k), STORE), 'self');
  const again = await board(t, ctx);
  assert.equal(await again.locator('#paybackMode a.on').getAttribute('data-id'), 'self');
  assert.equal(await kidCell(again, GIFTS), en('co.payback.cell.reached', {day: 27}));
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
  assert.equal(await page.locator('#sitePanel .sp-pay').innerText(), en('sp.payback.line', {what: en('co.payback.togo', {n: 146})}));
  await page.evaluate(k => openSite(k), BREWERY);
  await page.waitForFunction(k => siteKey === k, BREWERY);
  assert.equal(await page.locator('#sitePanel .sp-pay').count(), 0);
});

test('a real bill is the firm figure only, and an old lease reads as an estimated day', async t => {
  const page = await board(t, await context(t));
  const tip = () => page.$eval(`#portfolio tr.kid[data-key="${SPIRITS}"] .pb-cell`, e => e.dataset.tip);
  await page.evaluate(k => { D.payback.sites[k].cost.billed = 120000; drawPortfolio(); }, SPIRITS);
  assert.match(await tip(), enRe('co.payback.cost.billed', {bill: 120000}));
  await page.click('#paybackMode a[data-id="self"]');
  assert.doesNotMatch(await tip(), enRe('co.payback.cost.billed'));
  assert.match(await tip(), enRe('co.payback.cost.self'));
  await page.click('#paybackMode a[data-id="firm"]');
  // A lease older than the record: the opening plus the payback period, as a
  // day, whether it has passed or not, and sorted by that day.
  const day = await page.evaluate(() => D.meta.day);
  await page.evaluate(([k, g]) => {
    D.payback.sites[k].opened = 10; D.payback.sites[k].firm = {state: 'window', days: 20, day: 30};
    D.payback.sites[g].opened = 10; D.payback.sites[g].firm = {state: 'window', days: 200, day: 210};
    drawPortfolio();
  }, [SPIRITS, GIFTS]);
  assert.equal(await kidCell(page, SPIRITS), en('co.payback.cell.window', {day: 30}));
  assert.match(await tip(), enRe('co.payback.window.past', {day: 30}, {anchor: 'start'}));
  assert.equal(await kidCell(page, GIFTS), en('co.payback.cell.window', {day: 210}));
  assert.ok(210 > day);
  assert.match(await page.$eval(`#portfolio tr.kid[data-key="${GIFTS}"] .pb-cell`, e => e.dataset.tip),
    enRe('co.payback.window.ahead', {day: 210}, {anchor: 'start'}));
  assert.doesNotMatch(await page.$eval(`#portfolio tr.kid[data-key="${GIFTS}"] .pb-cell`, e => e.dataset.tip), enRe('co.payback.togo'));
  assert.deepEqual(await page.evaluate(([k, g]) => [paybackRank(paybackSite(k)), paybackRank(paybackSite(g))], [SPIRITS, GIFTS]), [30, 210]);
});

test('an old chain whose members opened on different days shows the day Python worked out for them', async t => {
  const page = await board(t, await context(t));
  // The Spirits chain: the shop from day 10, the brewery from day 50. Python
  // counts each from its own opening (chain_window_day); the page shows that
  // day, never the first opening plus a period, and sorts on it.
  await page.evaluate(([k, f]) => {
    D.payback.sites[k].opened = 10; D.payback.sites[f].opened = 50;
    const c = D.payback.chains[k];
    c.opened = 10; c.exact = false; c.firm = {state: 'window', day: 140};
    drawPortfolio();
  }, [SPIRITS, BREWERY]);
  const name = await page.evaluate(k => enOf(D.chains.find(c => c.sites[0] === k), 'name'), SPIRITS);
  const cell = await page.$eval(`#portfolio tr.chain[data-chain="${name}"] td:last-child`, td => td.innerText.trim());
  assert.equal(cell, en('co.payback.cell.window', {day: 140}));
  assert.match(await page.$eval(`#portfolio tr.chain[data-chain="${name}"] .pb-cell`, e => e.dataset.tip),
    enRe('co.payback.window.ahead.chain', {day: 140}, {anchor: 'start'}));
  assert.equal(await page.evaluate(k => paybackRank(D.payback.chains[k]), SPIRITS), 140);
  // With no member earning, the plain wording and no day.
  await page.evaluate(k => { D.payback.chains[k].firm = {state: 'window'}; drawPortfolio(); }, SPIRITS);
  const plain = await page.$eval(`#portfolio tr.chain[data-chain="${name}"] .pb-cell`, e => [e.innerText.trim(), e.dataset.tip]);
  assert.equal(plain[0], '—');
  assert.match(plain[1], new RegExp('^' + enRe('co.payback.window.none').source + '\\.'));
});
