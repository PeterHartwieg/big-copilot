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

test('the lines table carries Saves / week, line by line and in its total row', async t => {
  const page = await board(t);
  assert.equal(await page.locator('#planBody thead th.saves').count(), 1);
  const r = await page.evaluate(b => {
    const tr = document.querySelector(`#planBody tr.line[data-slug="${b}"]`), host = tr.closest('table');
    const want = (+(tr.dataset.pershop ?? host.dataset.pershop) || 0) * 7 * (+host.dataset.shops || 0), made = +tr.dataset.m * +tr.dataset.rate * 24 * 7;
    return {cell: tr.querySelector('td.saves').textContent, want, expect: fmt(ofSaves({slug: b, made, want})), foot: $('vFootSaves').textContent};
  }, BEER);
  assert.ok(r.want > 0, 'the fixture measures the liquor store');
  assert.equal(r.cell, r.expect);
  assert.ok(r.foot.length > 0);
});

test('Running charts what left the factory each day against the plan line', async t => {
  const page = await board(t);
  await page.evaluate(([k, b]) => { D.openFactory.sites[k].days = {first: 40, out: {[b]: [900, 1100, 1200]}, sold: {[b]: [100, 200, null]}}; ofGo('running'); }, [BREWERY, BEER]);
  await page.waitForFunction(() => ofStep === 'running');
  const chart = page.locator('#ofBody svg.ff-chart');
  assert.equal(await chart.count(), 1);
  assert.equal(await chart.locator('rect.os-dbar').count(), 3, 'a bar a day');
  assert.equal(await chart.locator('rect.ff-pier').count(), 2, 'the piers part where the sales history holds it');
  assert.equal(await chart.locator('line.inv').count(), 1, 'the plan line');
  /* Too few days: said, not drawn. */
  await page.evaluate(([k, b]) => { D.openFactory.sites[k].days = {first: 42, out: {[b]: [1200]}, sold: {}}; drawPlan(); }, [BREWERY, BEER]);
  assert.equal(await page.locator('#ofBody svg.ff-chart').count(), 0);
});

/* --- review round 1 (#172) ------------------------------------------------- */

test('each product goes at its own measured rate a shop; one never sold at the type\'s average', async t => {
  const page = await board(t);
  const r = await page.evaluate(([b, liq]) => {
    const rows = Object.fromEntries(ofLines().map(l => [l.slug, l]));
    const host = document.querySelector('#planBody table[data-pershop]');
    return {beer: rows[b].want, soda: (rows['ba:itemname_sodacan'] || {}).want, measured: D.plan.own[liq].perDay[b],
      avg: +host.dataset.pershop, shops: +host.dataset.shops};
  }, [BEER, LIQ]);
  assert.equal(r.beer, r.measured * 7 * r.shops);
  if(r.soda !== undefined) assert.equal(r.soda, r.avg * 7 * r.shops, 'Soda is sold nowhere yet: the average');
});

test('a factory running other types\' lines is judged on this plan\'s lines alone', async t => {
  const page = await board(t);
  const r = await page.evaluate(([k, b]) => {
    /* The brewery also runs five machines of a gift product, ships it, and it waits on plastic. */
    const site = D.supply.factories.sites[0];
    site.lines.push({...site.lines[0], slug: 'ba:itemname_cheapgift', item: 'Gift (Cheap)', machines: 5, atRoster: 99999, missing: ['Plastic']});
    D.openFactory.sites[k].days = {first: 40, out: {[b]: [1200, 1200], 'ba:itemname_cheapgift': [50000, 50000]}, sold: {}};
    drawPlan();
    const machines = ofUntilRows(null).flatMap(g => g[1]).find(x => /Machines/.test(x.title));
    ofGo('running');
    const why = document.querySelector('#ofBody .ff-why');
    return {machines, left: document.querySelector('#ofBody .os-roi .kpi .v').textContent, why: why ? why.textContent : ''};
  }, [BREWERY, BEER]);
  assert.equal(r.machines.state, 'done', 'the beer machines are all there; the gift ones are not counted');
  assert.equal(r.left.replace(/[^0-9]/g, ''), String(1200 * 7), 'only beer left the factory for this plan');
  assert.doesNotMatch(r.why, /Plastic/, 'another type\'s waiting line is not this plan\'s');
});

test('the order ahead for one factory leaves every other factory\'s consumption ordered', async t => {
  const page = await board(t);
  const r = await page.evaluate(() => {
    /* A second factory makes the same beer and eats the same water; the
       company orders enough for both. */
    const f = D.supply.factories, two = JSON.parse(JSON.stringify(f.sites[0]));
    two.s = 0; f.sites.push(two);
    const water = 2 * f.sites[0].lines[0].machines * RECIPE_BY['ba:itemname_beer'].ingredients[0].per * 24 * 7;
    D.plan.sources['ba:itemname_water'].ordered = water;
    drawPlan();
    const tr = [...document.querySelectorAll('#ingBody tr')].find(x => x.dataset.name === 'Water');
    return {target: +tr.querySelector('.set').textContent.replace(/[^0-9]/g, ''), change: tr.querySelector('td.chg').textContent.trim(), water};
  });
  assert.equal(r.target, Math.ceil(r.water / 100) * 100, 'the plan for one unchanged factory keeps the whole order');
  assert.equal(r.change, '');
});

test('Running reports what left, labels the staffed rate an estimate, and keeps an input shortage in view', async t => {
  const page = await board(t);
  const r = await page.evaluate(([k, b]) => {
    Object.assign(D.supply.factories.sites[0].lines[0], {atRoster: 1200, toCity: 600, toPier: 600, missing: ['Water']});
    D.openFactory.sites[k].days = {first: 40, out: {[b]: [0, 0]}, sold: {[b]: [0, 0]}};
    ofGo('running');
    const why = document.querySelector('#ofBody .ff-why');
    return {tiles: [...document.querySelectorAll('#ofBody .os-roi .kpi .v')].map(v => v.textContent),
      tip: document.querySelector('#ofBody .ff-out thead th[data-tip]').dataset.tip, why: why ? why.textContent : ''};
  }, [BREWERY, BEER]);
  assert.equal(r.tiles[0], '0', 'nothing left the factory: not what the staffed hours allow');
  assert.equal(r.tiles[2], '$0', 'nothing exported');
  assert.match(r.tip, /estimate/);
  assert.match(r.why, /Water/, 'the line waiting on water is named');
});

test('a line the shops want with no machine on it is a shortage row too', async t => {
  const page = await board(t);
  await page.locator('#planFor [data-of-for="new"]').click();
  await page.evaluate(b => { planCounts[b] = 0; planCounts['ba:itemname_sodacan'] = 1; drawPlan(); }, BEER);
  assert.match(await page.locator('#ofWhat').innerText(), /Beer stays short/);
});

test('an owned factory\'s pallet shelves are sized over every line it keeps, less those standing', async t => {
  const page = await board(t);
  const r = await page.evaluate(([k, b]) => {
    /* The brewery also keeps four machines of another product, boxed small. */
    RECIPE_BY['ba:itemname_x'] = {slug: 'ba:itemname_x', item: 'X', out: 100, workstation: 'bottledgoods', ingredients: [{slug: 'ba:itemname_water', item: 'Water', per: 100}]};
    D.openFactory.products['ba:itemname_x'] = {w: 1, i: 1, bx: 100, mo: 1000};
    const site = D.supply.factories.sites[0];
    site.lines.push({...site.lines[0], slug: 'ba:itemname_x', item: 'X', machines: 4});
    D.openFactory.sites[k].shelves = 3;
    const inv = ofInvestment(null), mine = Object.fromEntries(ofLines().map(l => [l.slug, l.m]));
    return {inv, all: ofBoxes({...ofNow(k), ...mine}), own: ofBoxes(mine), cc: D.openFactory.shelf.cc};
  }, [BREWERY, BEER]);
  assert.ok(r.all > r.own, 'the other line needs room too');
  assert.equal(r.inv.boxes, r.all);
  assert.equal(r.inv.shelves, Math.max(0, Math.ceil(r.all / r.cc) - 3));
});

test('the Overview task and Production\'s button open Plan a factory on a new factory', async t => {
  const page = await board(t, '#overview');
  await page.locator('a.ov-task[data-ov-route="expansion/factory"]').click();
  await page.waitForFunction(() => route === 'expansion/factory');
  assert.equal(await page.evaluate(() => planTarget), 'new');
  assert.equal(await page.locator('#planFor [data-of-for="new"].on').count(), 1);
});

/* --- review round 2 (#172) ------------------------------------------------- */

test('an imports button opens the weekly imports for its site and leaves the depot choice alone', async t => {
  const page = await board(t);
  const r = await page.evaluate(k => {
    window.__imports = [];
    SOURCE.link = () => ({writes: ['imports', 'hire']});
    window.gwImports = site => window.__imports.push(site);
    const plan = ofEnsure();
    ofGo('running');
    const btn = document.querySelector('#ofBody [data-of-write="imports"]');
    if(btn) btn.click();
    return {found: !!btn, site: btn && btn.dataset.ofSite, depot: plan.depot, calls: window.__imports, step: ofStep};
  }, BREWERY);
  assert.ok(r.found, 'water arrives short of what the brewery eats');
  assert.deepEqual(r.calls, [r.site], 'the dialog for the site whose contract brings water');
  assert.equal(r.depot, null, 'the depot choice is untouched');
  assert.equal(r.step, 'running');
});

test('the depot a new factory\'s plan costed stays the plan\'s through its setup, and ticks', async t => {
  const page = await board(t);
  await page.locator('#planFor [data-of-for="new"]').click();
  const r = await page.evaluate(() => {
    /* No depot yet: the company's warehouse stands empty. */
    const wh = D.businesses.find(b => b.typeSlug === 'ba:businesstype_warehouse');
    wh.status = 'vacant';
    const free = premises().buildings.filter(b => b.type === 'warehouse' && b.status === 'vacant');
    /* A second warehouse to rent, for the depot beside the factory. */
    premises().buildings.push({...free[0], key: 'ba:street_twentyfourthstreet#6', address: '6 24th Street', rent: 300, deposit: 28000});
    ofGo('where'); ofPick(free[0].key);
    const plan = ofPlan(), inv = ofInvestment(plan);
    const before = {depotKey: plan.depotKey, cost: inv.depot && inv.depot.total};
    /* The player rents the warehouse the plan picked, sets it up, parks a driven van. */
    wh.status = 'overhead'; wh.key = plan.depotKey; wh.opened = (D.meta || {}).day;
    D.openFactory.sites[plan.depotKey] = {kind: 'depot', shelves: 8, imports: [], vehicles: [['ba:vehicletype_deliverytruck', true]]};
    const after = ofInvestment(plan);
    const rows = ofUntilRows(plan).flatMap(g => g[1]);
    const pick = re => rows.find(x => re.test(x.title)) || {state: 'missing: ' + rows.map(x => x.title).join(' | ')};
    return {before, after: after.depot && after.depot.total, rented: pick(/^The depot </).state, van: pick(/van and driver/).state,
      route: pick(/Deliveries to the shops/).state};
  });
  assert.ok(r.before.depotKey, 'the plan keeps which warehouse it costed');
  assert.equal(r.after, r.before.cost, 'and its cost, once the company has a depot');
  assert.equal(r.rented, 'done');
  assert.equal(r.van, 'done');
  assert.ok(['done', 'todo'].includes(r.route), 'its deliveries have their own condition');
});

/* --- review round 3 (#172) ------------------------------------------------- */

/* A company with no depot, a new factory planned with one beside it. */
async function depotPlan(page){
  await page.locator('#planFor [data-of-for="new"]').click();
  return page.evaluate(() => {
    const wh = D.businesses.find(b => b.typeSlug === 'ba:businesstype_warehouse');
    wh.status = 'vacant';
    const free = premises().buildings.filter(b => b.type === 'warehouse' && b.status === 'vacant');
    premises().buildings.push({...free[0], key: 'ba:street_twentyfourthstreet#6', address: '6 24th Street', rent: 300, deposit: 28000});
    ofGo('where'); ofPick(free[0].key);
    return {factory: free[0].key, depot: ofPlan().depotKey};
  });
}

test('deliveries to the shops tick only from the depot, and only for what a shop stocks', async t => {
  const page = await board(t);
  await depotPlan(page);
  const r = await page.evaluate(b => {
    const plan = ofPlan(), wh = D.businesses.find(x => x.typeSlug === 'ba:businesstype_warehouse');
    wh.status = 'overhead'; wh.key = plan.depotKey; wh.opened = D.meta.day;
    const row = () => ofUntilRows(plan).flatMap(g => g[1]).find(x => /Deliveries to the shops/.test(x.title)).state;
    /* The shop's own wholesale contract brings beer: no delivery from the depot. */
    D.supply.routed = [[0, b]];
    const shop = D.businesses.find(x => x.typeSlug === 'ba:businesstype_liquorstore');
    const wholesale = row();
    /* A second liquor store that sells no beer cannot hold the row back. */
    D.businesses.push({...shop, key: 'ba:street_ninthstreet#1', address: '1 Ninth Street', lines: []});
    D.supply.graph.links.push({from: plan.depotKey, to: shop.key, slugs: [b], cadence: 'daily'});
    const depot = row();
    /* A third one holding a little beer and no route at all (no node in the goods graph) does. */
    D.businesses.push({...shop, key: 'ba:street_ninthstreet#2', address: '2 Ninth Street', lines: [{slug: b, units: 50}]});
    return {wholesale, depot, unrouted: row()};
  }, BEER);
  assert.equal(r.wholesale, 'todo', 'a wholesale contract is no delivery from the depot');
  assert.equal(r.depot, 'done', 'the depot delivers every shop that stocks beer');
  assert.equal(r.unrouted, 'todo', 'a shop stocking beer with no route keeps the row open');
});

test('the depot is picked again when the factory moves onto it, or a rival takes it', async t => {
  const page = await board(t);
  const first = await depotPlan(page);
  const r = await page.evaluate(({factory, depot}) => {
    /* Back to Where: the factory goes into the building costed as the depot. */
    ofPick(depot);
    const moved = ofInvestment(ofPlan());
    const after = {factory: ofPlan().key, depot: moved.depot && moved.depot.b.key};
    /* A rival rents the remembered depot before the player does; a third warehouse is free. */
    premises().buildings.push({...premises().buildings.find(b => b.key === depot), key: 'ba:street_twentyfifthstreet#8', address: '8 25th Street', status: 'vacant', rent: 500});
    premises().buildings.find(b => b.key === ofPlan().depotKey).status = 'rival';
    const taken = ofInvestment(ofPlan());
    return {after, rival: taken.depot && taken.depot.b.key, depotKey: ofPlan().depotKey};
  }, first);
  assert.notEqual(r.after.depot, r.after.factory, 'never the factory\'s own building');
  assert.ok(r.rival && r.rival !== r.after.depot, 'a building a rival rents is picked again');
  assert.equal(r.depotKey, r.rival);
  /* Rented but not set up yet (the business still vacant, premises "mine"):
     picking the factory again keeps it. */
  const kept = await page.evaluate(() => {
    const key = ofPlan().depotKey;
    premises().buildings.find(b => b.key === key).status = 'mine';
    ofPick(ofPlan().key);
    return [key, ofPlan().depotKey];
  });
  assert.equal(kept[1], kept[0]);
});

test('a factory that never exported shows 0 to the piers on the days its sales cover', async t => {
  const page = await board(t);
  const cell = await page.evaluate(([k, b]) => {
    D.openFactory.sites[k].days = {first: 40, covered: [1, 1], out: {[b]: [1200, 1200]}, sold: {}};
    ofGo('running');
    return document.querySelector('#ofBody .ff-out tbody tr td:last-child').textContent;
  }, [BREWERY, BEER]);
  assert.equal(cell, '0');
});

/* --- QA on real saves (#172) ----------------------------------------------- */

test('Running\'s output table scrolls inside its card', async t => {
  const page = await board(t);
  await page.evaluate(() => ofGo('running'));
  assert.equal(await page.locator('#ofBody .ff-outc .scrollx > table.ff-out').count(), 1);
});

test('another character on the same page starts the flow afresh', async t => {
  const page = await board(t);
  const r = await page.evaluate(b => {
    const seed = machinesOn(b);
    planCounts[b] = seed + 3; drawPlan();
    D.meta.character = 'someone else'; drawPlan();
    return {seed, after: machinesOn(b), stored: localStorage.getItem('ba_open_factory_v1:someone else')};
  }, BEER);
  assert.equal(r.after, r.seed, 'the last character\'s machine count does not carry over');
  assert.equal(r.stored, null, 'and nothing is saved under the new one');
});

test('an addition to a factory you run asks for workers only, in the singular for one', async t => {
  const page = await board(t);
  await page.locator(`#planBody tr.line[data-slug="${BEER}"] .step a[data-d="1"]`).click();
  const rows = await page.evaluate(() => ofUntilRows(ofEnsure()).flatMap(g => g[1]).map(r => r.title + ' :: ' + r.sub + ' :: ' + r.act).join('\n'));
  assert.doesNotMatch(rows, /Delivery Driver/, 'the brewery keeps its truck and driver');
  assert.match(rows, /1 new workstation,/);
  assert.doesNotMatch(rows, /1 new workstations/);
});

test('with no depot, headquarters asks for as many Logistics Managers as the plan costs', async t => {
  const page = await board(t);
  await depotPlan(page);
  const r = await page.evaluate(() => {
    D.openFactory.hq = {agents: 0, contracts: 0, managers: 0, managed: 0};
    const plan = ofPlan(), hq = ofHq(plan);
    const row = ofUntilRows(plan).flatMap(g => g[1]).find(x => x.title === en_hq());
    return {managers: hq.managers, text: row.sub + ' ' + row.act};
    function en_hq(){ return 'Headquarters'; }
  });
  assert.equal(r.managers, 2, 'the factory and its depot');
  assert.match(r.text, /2 Logistics Managers/);
});

test('Supply › Production opens Plan a factory on each factory it lists', async t => {
  const page = await board(t, '#supply/production');
  await page.waitForFunction(() => sub.supply === 'production');
  const link = page.locator(`a.sb-plan[data-of-goto="${BREWERY}"]`);
  await link.first().click();
  await page.waitForFunction(() => route === 'expansion/factory');
  assert.equal(await page.evaluate(() => planTarget), BREWERY);
});
