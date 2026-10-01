// Expansion › Plan a factory (issue #172): the five steps -- What, Where,
// Investment, Until production, Running -- for a factory the player runs and
// for a new one, over the planner that is step 1. The board is the CLI page
// rendered from the synthetic day-47 payload snapshot (tests/fixtures/
// payload_snapshot/, never a real save): a liquor store, a gift shop, a depot
// and a brewery making Beer. Install Playwright and its Chromium browser to
// run; NODE_PATH may point at an existing installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const {chromium} = require('playwright');
const {enText} = require('./_i18n.cjs');

const ROOT = path.join(__dirname, '..');
const LIQ = 'ba:businesstype_liquorstore', BEER = 'ba:itemname_beer';
const BREWERY = 'ba:street_eighthavenue#8';
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

async function board(t, hash = '#expansion/factory') {
  const ctx = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce', colorScheme: 'dark'});
  t.after(() => ctx.close());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await ctx.route('https://**', route => route.abort());
  await ctx.route('https://of.test/**', route => route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await page.goto('https://of.test/' + hash, {waitUntil: 'load'});
  await page.waitForFunction(() => typeof route === 'string' && typeof hasData === 'function' && hasData());
  /* The save rents every warehouse there is: one stands in as free to rent. */
  await page.evaluate(() => { const w = premises().buildings.find(b => b.type === 'warehouse' && b.status !== 'mine');
    if(w) w.status = 'vacant'; else premises().buildings.push({key: 'ba:street_twentysecondstreet#4', address: '4 22nd Street',
      hood: 'ba:neighborhood_industrycity', type: 'warehouse', size: 'I', layout: 'I3', m2: 1292, traffic: 40, cap: null, rent: 388, deposit: 36320,
      status: 'vacant', occupant: null, owner: 'city', ownerRival: null, occupantRival: null}); });
  return page;
}
const steps = page => page.$$eval('#ofCtl [data-of-step]', bs => bs.map(b => [b.dataset.ofStep, b.className, b.disabled]));
const strip = page => page.$$eval('#ofStrip .os-pb > div', ds => ds.map(d => d.innerText.replace(/\s+/g, ' ').trim()));
const money = text => +((String(text).match(/\$([\d,]+)/) || [])[1] || '').replace(/,/g, '');

test('the view opens on the factory the player runs, five steps, Where ticked as yours, Ingredients beside', async t => {
  const page = await board(t);
  assert.equal(await page.evaluate(() => planTarget), BREWERY);
  assert.equal(await page.evaluate(() => planType), LIQ, 'the type the brewery makes');
  const s = await steps(page);
  assert.deepEqual(s.map(x => x[0]), ['what', 'where', 'investment', 'until', 'running']);
  assert.equal(s[1][1], 'done');
  assert.equal(s[1][2], true, 'Where is not a step for a factory already rented');
  assert.match(await page.locator('#ofCtl [data-of-step="where"]').innerText(), /yours/);
  assert.equal(await page.locator('#secIngredients').isVisible(), true);
  assert.equal(await page.locator('#planBody tr.line').count() > 0, true, 'the planner is step 1');
  assert.match((await strip(page))[3], /Running costs added/i);
  /* The For picker: New factory, then the brewery. */
  assert.deepEqual(await page.$$eval('#planFor [data-of-for]', bs => bs.map(b => b.dataset.ofFor)), ['new', BREWERY]);
});

test('a visit clears the New badge on the view, the Overview task and every other entry', async t => {
  const page = await board(t);
  assert.equal(await page.evaluate(() => VIEW_NEW['expansion/factory']), 'factory-flow');
  assert.equal(await page.evaluate(() => localStorage.getItem('ba_dash_feature_seen:factory-flow')), '1');
  assert.equal(await page.locator('[data-new-feature="factory-flow"]:not([hidden])').count(), 0);
});

test('a line stepped up for the brewery says the change, and the investment is only what it adds', async t => {
  const page = await board(t);
  await page.locator(`#planBody tr.line[data-slug="${BEER}"] .step a[data-d="1"]`).click();
  assert.equal(await page.locator(`#planBody tr.line[data-slug="${BEER}"] .ff-delta`).innerText(), '+1');
  await page.locator('#ofBody .ff-next [data-of-step="investment"]').click();
  await page.waitForFunction(() => ofStep === 'investment');
  const kit = await page.evaluate(() => (D.openFactory.kits.bottledgoods || []).reduce((s, [, p]) => s + p, 0));
  const inv = await page.evaluate(() => ofInvestment(ofPlan()));
  assert.equal(inv.truck, 0, 'the brewery has its vehicles');
  assert.equal(inv.deposit, 0, 'and its lease');
  const shelves = inv.shelves * 2500;
  assert.equal(inv.self, kit + shelves + inv.delivery, 'one workstation, the shelves the plan needs beyond those standing, delivered');
  assert.equal(inv.firm, inv.fee + kit + shelves, 'the firm prices the whole floor again');
  assert.equal(await page.locator('#ofFin').count(), 0, 'no loan for an addition');
});

test('a new factory: the start table, then Where ranks warehouse buildings by rent, cheapest first', async t => {
  const page = await board(t);
  await page.locator('#planFor [data-of-for="new"]').click();
  assert.equal(await page.evaluate(() => planTarget), 'new');
  assert.equal(await page.locator('#secIngredients').isVisible(), false, 'Ingredients belong to a factory you run');
  assert.ok(await page.locator('#ofStart .ff-make tbody tr').count() > 0, 'what the shops buy that a factory can make');
  await page.locator('#ofBody .ff-next [data-of-step="where"]').click();
  await page.locator('#ofFinderMap .place.fr').first().waitFor();
  assert.equal(await page.locator('#ofFinderMap .fplan-type').innerText(), 'Factory');
  const rents = await page.$$eval('#ofFinderMap .place.fr .v.cap', vs => vs.map(v => +v.textContent.replace(/[^0-9.]/g, '')));
  assert.ok(rents.length > 0);
  assert.deepEqual(rents, [...rents].sort((a, b) => a - b), 'ranked by rent');
  assert.equal(await page.locator('#ofFinderMap .fhead.fpw [data-s="rent"].on').count(), 1);
  assert.equal(await page.locator('#ofBody .ff-facts > div').count(), 4);
});

test('a new factory\'s investment is one-off and upfront; the running costs stay apart', async t => {
  const page = await board(t);
  await page.locator('#planFor [data-of-for="new"]').click();
  const key = await page.evaluate(() => premises().buildings.find(b => b.type === 'warehouse' && b.status === 'vacant').key);
  await page.evaluate(k => { ofGo('where'); ofPick(k); }, key);
  await page.waitForFunction(() => ofStep === 'investment');
  const r = await page.evaluate(() => { const plan = ofPlan(), inv = ofInvestment(plan), run = ofRunning(plan, inv);
    return {inv, run, b: inv.b, truck: D.openFactory.vehicles.truck.p, fee: D.openFactory.game.installFee}; });
  assert.equal(r.inv.self, r.inv.furniture + r.inv.delivery + r.truck + r.b.deposit + (r.inv.depot ? r.inv.depot.total : 0));
  assert.equal(r.inv.firm, r.fee * r.b.m2 + r.inv.furniture + r.truck + r.b.deposit + (r.inv.depot ? r.inv.depot.total : 0));
  assert.ok(r.run.rent >= r.b.rent * 7, 'rent is a running cost');
  assert.equal(money((await strip(page))[2]), Math.round(r.inv.self), 'self-installation by default');
  assert.match((await strip(page))[3], /not in the investment/);
  /* The financing panel: borrow, cash upfront, repaid a day, interest; no days to earn it back. */
  await page.locator('[data-of-fin-on]').check();
  const cells = await page.$$eval('#ofFinFacts > div .os-lab', ls => ls.map(l => l.textContent));
  assert.deepEqual(cells, [enText('gr.of.fin.borrow'), enText('gr.os.fin.upfront'), enText('gr.of.fin.daily'), enText('gr.os.fin.interest')]);
});

test('prices: an import less the agent\'s discount, an export at the export price with none', async t => {
  const page = await board(t);
  const r = await page.evaluate(b => ({imp: ofImportPrice(b), exp: ofExportPrice(b), p: D.openFactory.products[b], g: D.openFactory.game}), BEER);
  const wholesale = r.p.w * r.p.i * r.g.prices;
  assert.ok(Math.abs(r.imp - wholesale * (1 - 0.25 * r.g.agent / 100)) < 1e-9);
  assert.ok(Math.abs(r.exp - wholesale * r.g.export) < 1e-9);
  /* Wages at skill 100: base × (1 + 1.05^100 / 100) × the salary multiplier. */
  const w = await page.evaluate(() => ofHourly('factoryworker'));
  assert.ok(Math.abs(w - 12 * (1 + Math.pow(1.05, 100) / 100) * (await page.evaluate(() => D.openFactory.game.wages))) < 1e-9);
});

test('a line left short of the shops is a finding row, with no advice to add machines', async t => {
  const page = await board(t);
  await page.locator('#planFor [data-of-for="new"]').click();
  await page.evaluate(b => { planCounts[b] = 0; drawPlan(); }, BEER);
  await page.evaluate(b => { const tr = document.querySelector(`#planBody tr.line[data-slug="${b}"]`);
    tr.dataset.rate = '1'; planCounts[b] = 1; tr.dataset.m = '1'; planDraw(); }, BEER);
  const row = page.locator('#ofWhat .ff-short');
  assert.equal(await row.count(), 1);
  const text = await row.innerText();
  assert.match(text, /stays short/);
  assert.doesNotMatch(text, /add|more machines|second|bigger/i);
});

test('the old ways in still work: a type set and drawPlan() draws the planner', async t => {
  const page = await board(t, '#expansion/demand');
  await page.evaluate(k => { planType = k; planCounts = {}; showPage('growth'); showSub('growth', 'plan'); drawPlan(); }, 'ba:businesstype_giftshop');
  assert.ok(await page.locator('#planBody tr').count() > 0);
  assert.ok(await page.locator('#planPicker').count() === 1);
  /* openPlan() with a type and New factory, as the store checklist's button does. */
  await page.evaluate(k => openPlan({type: k, target: 'new'}), LIQ);
  assert.equal(await page.evaluate(() => route), 'expansion/factory');
  assert.deepEqual(await page.evaluate(() => [planType, planTarget, ofStep]), [LIQ, 'new', 'what']);
});
