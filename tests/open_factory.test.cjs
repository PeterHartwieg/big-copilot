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
  assert.equal(await page.locator('#ingTable th.ord').first().isVisible(), true, 'the order columns, against the contracts the factory runs on');
  assert.equal(await page.locator('#secIngredients .why:not(.ing-whynew)').isVisible(), true);
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
  assert.equal(await page.locator('#secIngredients').isVisible(), true, 'a new factory lists its inputs too (#442)');
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

test('a new factory lists what its machines eat, and its contract row carries a week of each (#442)', async t => {
  const page = await board(t);
  await page.locator('#planFor [data-of-for="new"]').click();
  const ing = () => page.evaluate(() => ({
    rows: Object.fromEntries([...document.querySelectorAll('#ingBody tr')].map(tr => [tr.dataset.name, tr.querySelector('.wk').textContent])),
    raw: Object.fromEntries(Object.entries(ofRawWeek(ofCounts())).map(([sl, n]) => [itemName(sl), num(Math.round(n))]))}));
  const before = await ing();
  assert.ok(Object.keys(before.rows).length > 0, 'one row per input');
  assert.deepEqual(before.rows, before.raw, 'a week of each input, at the machines planned');
  assert.equal(await page.locator('#ingTable th.ord').first().isVisible(), false, 'no contracts to compare: no order columns');
  assert.equal(await page.locator('#ingTable th.chg').isVisible(), false);
  assert.equal(await page.locator('#secIngredients .why.ing-whynew').isVisible(), true, 'the ? speaks of contracts still to set up');
  await page.locator(`#planBody tr.line[data-slug="${BEER}"] .step a[data-d="1"]`).click();
  const after = await ing();
  assert.deepEqual(after.rows, after.raw, 'the amounts follow the machines');
  assert.notDeepEqual(after.rows, before.rows);
  /* No contract brings any input yet: the row names each with its week. */
  const r = await page.evaluate(() => {
    Object.values(D.plan.sources || {}).forEach(s => { s.active = false; });
    const goods = ofUntilRows(ofPlan()).find(g => g[1].some(c => c.icon === 'crate'))[1];
    const row = goods.find(c => /contract/i.test(c.title));
    return {sub: row.sub, act: row.act,
      want: Object.entries(ofRawWeek(ofCounts())).map(([sl, n]) => `${itemName(sl)} ×${num(Math.ceil(n))} / week`)};
  });
  assert.ok(r.want.length > 0);
  for(const w of r.want.slice(0, 2)){ assert.ok(r.sub.includes(w), `${w} in ${r.sub}`); assert.ok(r.act.includes(w)); }
  /* The factory the player runs keeps names only on its new-ingredients row. */
  await page.locator(`#planFor [data-of-for="${BREWERY}"]`).click();
  await page.locator(`#planBody tr.line[data-slug="${BEER}"] .step a[data-d="1"]`).click();
  const owned = await page.evaluate(() => {
    Object.values(D.plan.sources || {}).forEach(s => { s.active = false; });
    const row = ofUntilRows(ofPlan()).flatMap(g => g[1]).find(c => /contract/i.test(c.title));
    return row.sub;
  });
  assert.match(owned, /No import contract brings/);
  assert.doesNotMatch(owned, /\/ week/);
});

test('a new factory can select an empty rented warehouse without paying its deposit again', async t => {
  const page = await board(t);
  const key = await page.evaluate(() => {
    const b = premises().buildings.find(b => b.type === 'warehouse' && b.status === 'vacant');
    b.status = 'mine'; b.occupant = null; return b.key;
  });
  await page.locator('#planFor [data-of-for="new"]').click();
  await page.locator('#ofBody .ff-next [data-of-step="where"]').click();
  const row = page.locator(`#ofFinderMap .place[data-pick="${key}"]`);
  await row.waitFor();
  assert.match(await row.innerText(), /Already rented/);
  assert.equal(await row.locator('.dep').innerText(), '$0');
  const suggested = await page.$$eval('#ofFinderMap .place.fr', rows => rows.map(r => r.dataset.pick));
  assert.ok(!suggested.includes(BREWERY), 'the running factory is not an empty location');
  await row.click();
  await page.locator('#ofFinderMap .site [data-action="plan"]').click();
  await page.waitForFunction(() => ofStep === 'investment');
  const r = await page.evaluate(() => {
    const inv = ofInvestment(ofPlan()); return {inv, run: ofRunning(ofPlan(), inv), target: planTarget};
  });
  assert.equal(r.target, 'new', 'renting an empty warehouse does not make it a running factory');
  assert.equal(r.inv.b.key, key);
  assert.equal(r.inv.deposit, 0);
  assert.ok(r.inv.furniture > 0);
  assert.ok(r.inv.truck > 0);
  assert.ok(r.run.rent >= r.inv.b.rent * 7);
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

test('an already rented starter depot needs setup, with its lease acknowledged in both investment modes', async t => {
  const page = await board(t);
  const {depot} = await depotPlan(page);
  const result = await page.evaluate(key => {
    const b = premises().buildings.find(b => b.key === key);
    b.status = 'mine'; b.occupant = null;
    const plan = ofPlan();
    const row = ofUntilRows(plan).flatMap(g => g[1]).find(r => /^The depot </.test(r.title));
    return {row, self: ofSelfHtml(ofInvestment(plan)), firm: ofFirmHtml(ofInvestment(plan))};
  }, depot);
  assert.equal(result.row.state, 'todo', 'renting alone does not finish warehouse setup');
  assert.match(JSON.stringify(result.row), /Already rented/);
  assert.doesNotMatch(JSON.stringify(result.row), /not rented yet|Rent .*set it up/);
  assert.match(result.self, /Already rented/);
  assert.match(result.firm, /Already rented/);
});

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
    drawPlan(); // reconcile the changed premises before showing the refreshed plan
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

test('a factory with nothing to change still links to its plan from Production\'s compact row', async t => {
  const page = await board(t, '#supply/production');
  /* The compact row (sbFlat) carries the link sbFactoryPart() hands it. */
  const r = await page.evaluate(k => {
    const s = D.businesses.findIndex(b => b.key === k);
    return {flat: sbFlat(s, 'gear', 'all fine', '', '<a class="sb-plan" data-of-goto="x">x</a>'), src: String(sbFactoryPart)};
  }, BREWERY);
  assert.match(r.flat, /class="sb-flat"[\s\S]*data-of-goto="x"/);
  assert.match(r.src, /return sbFlat\([\s\S]*?, "", planLink\);/, 'the compact factory row is given the plan link');
});

/* A second synthetic recipe crosses the shop-type boundary and shares an input.
   It is not offered by any type's Add product picker. */
const CUSTOM_PRODUCT = 'ba:itemname_cheapgift';
async function customBoard(t, viewport){
  const page = await board(t);
  if(viewport) await page.setViewportSize(viewport);
  await page.evaluate(() => {
    D.plan.recipes.push({slug: 'ba:itemname_cheapgift', item: 'Cheap Gift', workstation: 'bottledgoods', out: 10,
      ingredients: [{slug: 'ba:itemname_water', item: 'Water', per: 5}]});
    D.openFactory.products['ba:itemname_cheapgift'] = {w: 10, i: 1, bx: 20, mo: 10000};
    drawPlan();
  });
  return page;
}
async function addCustom(page, slug){
  await page.locator('#planBody [data-pc-toggle]').click();
  await page.locator(`#pcPop [data-pc-pick="${slug}"]`).click();
}
const customRows = page => page.$$eval('#planBody tr.line', rs => Object.fromEntries(rs.map(r => [r.dataset.slug, +r.dataset.m])));

test('custom setups combine recipes across shop types, sharing ingredient and investment totals', async t => {
  const page = await customBoard(t);
  await page.locator('[data-of-for="new"]').click();
  await page.locator('#ofCustomPick').click();
  assert.deepEqual(await customRows(page), {});
  assert.equal(await page.locator('#ofBody .ff-next').count(), 0, 'an empty range cannot proceed');
  await addCustom(page, BEER);
  await addCustom(page, CUSTOM_PRODUCT);
  await page.locator(`#planBody [data-slug="${BEER}"] [data-d="1"]`).click();
  assert.deepEqual(await customRows(page), {[BEER]: 2, [CUSTOM_PRODUCT]: 1});
  assert.equal(await page.locator('#vFootMade').innerText(), '10,080');
  assert.equal(await page.locator('#vRaw').innerText(), '9,240', 'shared water is counted once at its combined usage');
  const facts = await page.evaluate(() => ({raw: ofRawWeek(ofCounts()), lines: ofLines(), counts: ofPlan().counts}));
  assert.equal(facts.raw['ba:itemname_water'], 9240);
  assert.equal(facts.lines.find(l => l.slug === BEER).want, 321.4 * 7);
  assert.equal(facts.lines.find(l => l.slug === CUSTOM_PRODUCT).want, 85.7 * 7);
  await page.locator('#ofBody .ff-next [data-of-step="where"]').click();
  await page.evaluate(() => ofPick(premises().buildings.find(b => b.type === 'warehouse' && b.status === 'vacant').key));
  const inv = await page.evaluate(() => ofInvestment(ofPlan()));
  assert.deepEqual(inv.adds, {[BEER]: 2, [CUSTOM_PRODUCT]: 1});
  assert.ok(inv.furniture > 0);
  await page.locator('#ofBody [data-of-step="until"]').click();
  assert.equal(await page.evaluate(() => ofStep), 'until');
});

test('custom selections, zero counts and removals belong to each saved plan and survive reload', async t => {
  const page = await board(t);
  await page.locator('[data-of-for="new"]').click();
  await page.locator('#ofCustomPick').click();
  await addCustom(page, BEER);
  const first = await page.evaluate(() => ofCur);
  await page.locator(`#planBody [data-slug="${BEER}"] [data-d="-1"]`).click();
  await page.locator('[data-of-plan]').selectOption('');
  assert.deepEqual(await customRows(page), {});
  await addCustom(page, BEER);
  assert.equal(await page.locator('[data-of-size].on').getAttribute('data-of-size'), 'custom');
  await page.locator(`#planBody [data-slug="${BEER}"] [data-d="1"]`).click();
  const second = await page.evaluate(() => ofCur);
  assert.notEqual(first, second);
  await page.locator('[data-of-plan]').selectOption(first);
  assert.deepEqual(await customRows(page), {[BEER]: 0});
  await page.reload();
  assert.deepEqual(await customRows(page), {[BEER]: 0});
  await page.locator(`[data-pc-x="${BEER}"]`).click();
  await page.reload();
  assert.deepEqual(await customRows(page), {});
  assert.deepEqual(await page.evaluate(() => ofPlan().counts), {});
  await page.locator('[data-of-plan]').selectOption(second);
  assert.deepEqual(await customRows(page), {[BEER]: 2});
  await page.locator(`#planTypes [data-id="${LIQ}"]`).click();
  assert.equal(await page.evaluate(() => planType), LIQ, 'shop-type planning still opens normally');
  assert.equal(await page.locator('[data-of-size].on').getAttribute('data-of-size'), 'peak');
  await page.locator('[data-of-plan]').selectOption(second);
  assert.deepEqual(await customRows(page), {[BEER]: 2});
});

test('custom demand sums only measured sellers across types and excludes unknown products from surplus', async t => {
  const page = await customBoard(t);
  await page.evaluate(() => {
    D.plan.own = {
      a: {shops: 4, perDay: {'ba:itemname_beer': 30}, stocked: {'ba:itemname_beer': 2}},
      b: {shops: 3, perDay: {'ba:itemname_beer': 20}, sellers: {'ba:itemname_beer': 1}}
    };
    drawPlan();
  });
  await page.locator('[data-of-for="new"]').click();
  await page.locator('#ofCustomPick').click();
  await addCustom(page, BEER);
  await addCustom(page, CUSTOM_PRODUCT);
  const lines = await page.evaluate(() => ofLines());
  assert.equal(lines.find(l => l.slug === BEER).want, 560, '(30 × 2 + 20 × 1) × 7');
  assert.equal(lines.find(l => l.slug === CUSTOM_PRODUCT).want, 0);
  assert.match(await page.locator(`#planBody [data-slug="${CUSTOM_PRODUCT}"] .covers`).innerText(), /No measured sales/);
  assert.match(await page.locator('#vFootMade').getAttribute('data-tip'), /3,640 is surplus/);
  assert.equal(await page.locator('#planBody [data-pc-rate]').count(), 0, 'no invented per-shop rate for a mixed range');
});

test('custom setup on an owned factory starts with every known line and prices only additions', async t => {
  const page = await customBoard(t);
  await page.locator('#ofCustomPick').click();
  const now = await page.evaluate(() => ofNow(planTarget));
  assert.deepEqual(await customRows(page), now);
  await addCustom(page, CUSTOM_PRODUCT);
  let inv = await page.evaluate(() => ofInvestment(ofPlan()));
  assert.equal(inv.adds[BEER], 0);
  assert.equal(inv.adds[CUSTOM_PRODUCT], 1);
  assert.equal(inv.deposit, 0);
  await page.locator(`[data-pc-x="${CUSTOM_PRODUCT}"]`).click();
  inv = await page.evaluate(() => ofInvestment(ofPlan()));
  assert.equal(inv.adds[BEER], 0);
  assert.equal(inv.adds[CUSTOM_PRODUCT], undefined);
  await page.locator('[data-of-for="new"]').click();
  assert.equal(await page.evaluate(() => planType), 'custom');
  assert.deepEqual(await customRows(page), {});
  await addCustom(page, BEER);
  assert.equal(await page.locator('[data-of-size].on').getAttribute('data-of-size'), 'custom');
  await page.locator(`[data-of-for="${BREWERY}"]`).click();
  assert.equal(await page.evaluate(() => planType), 'custom');
  assert.deepEqual(await customRows(page), now);
  assert.equal(await page.locator('[data-of-size].on').getAttribute('data-of-size'), 'custom');
});

test('custom product search is usable on a phone and Escape restores focus', async t => {
  const page = await customBoard(t, {width: 390, height: 700});
  await page.locator('[data-of-for="new"]').click();
  await page.locator('#ofCustomPick').click();
  await page.locator('[data-pc-toggle]').click();
  const search = page.locator('#pcPop input[type="search"]');
  assert.equal(await search.evaluate(el => el === document.activeElement), true);
  await search.fill('gift');
  assert.equal(await page.locator('#pcPop .pc-opt:visible').count(), 1);
  assert.equal(await page.locator('#pcPop .pc-w').count(), 0, 'shop weights do not apply');
  const box = await page.locator('#pcPop').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 700);
  await search.fill('no such product');
  assert.equal(await page.locator('#pcPop .pc-opt:visible').count(), 0);
  assert.equal(await page.locator('#pcPop .pc-empty').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pcPop').isVisible(), false);
  assert.equal(await page.locator('[data-pc-toggle]').evaluate(el => el === document.activeElement), true);
});

test('editing only an existing factory’s machine count saves its custom setup', async t => {
  const page = await board(t);
  await page.locator('#ofCustomPick').click();
  const count = (await customRows(page))[BEER];
  await page.locator(`#planBody [data-slug="${BEER}"] [data-d="1"]`).click();
  assert.ok(await page.evaluate(() => ofCur));
  await page.reload();
  assert.equal(await page.evaluate(() => planType), 'custom');
  assert.deepEqual(await customRows(page), {[BEER]: count + 1});
  const saved = await page.evaluate(() => ofCur);
  await page.locator('[data-of-plan]').selectOption('');
  assert.deepEqual(await customRows(page), {[BEER]: count}, 'an owned factory’s new plan starts from its current machines');
  assert.equal(await page.locator('[data-of-size].on').getAttribute('data-of-size'), 'custom');
  await page.locator('[data-of-plan]').selectOption(saved);
  assert.deepEqual(await customRows(page), {[BEER]: count + 1}, 'the saved plan keeps its proposed change');
  await page.locator(`[data-pc-x="${BEER}"]`).click();
  await page.reload();
  assert.deepEqual(await customRows(page), {});
  assert.equal(await page.locator('#ingBody tr').count(), 0, 'the empty range leaves no stale ingredient rows');
});

/* Calculation reads never select/persist a depot; planner transitions do. */
test('investment calculations and redraws leave a settled plan and its storage untouched', async t => {
  const page = await board(t);
  await depotPlan(page);
  const result = await page.evaluate(() => {
    const plan = ofPlan(), before = JSON.stringify(plan), saved = localStorage.getItem(ofStore());
    const set = Storage.prototype.setItem;
    let writes = 0;
    Storage.prototype.setItem = function(key, value){ if(key === ofStore()) writes++; return set.call(this, key, value); };
    try{
      const inv = ofInvestment(plan);
      ofRunning(plan, inv);
      ofInvestHtml(plan);
      ofDraw();
      drawPlan();
      return {before, after: JSON.stringify(plan), saved, stored: localStorage.getItem(ofStore()), writes};
    }finally{ Storage.prototype.setItem = set; }
  });
  assert.equal(result.after, result.before);
  assert.equal(result.stored, result.saved);
  assert.equal(result.writes, 0);
});

for(const empty of [false, true]) test(`a refreshed depot choice is persisted and restored for an ${empty ? 'empty' : 'active'} plan`, async t => {
  const page = await board(t);
  const first = await depotPlan(page);
  if(empty) await page.evaluate(() => {
    ofPlan().type = planType = 'custom';
    ofPlan().counts = planCounts = {};
    drawPlan();
  });
  const result = await page.evaluate(({depot}) => {
    const plan = ofPlan(), before = JSON.stringify(plan);
    const old = premises().buildings.find(b => b.key === depot);
    old.status = 'rival';
    premises().buildings.push({...old, key: 'replacement', status: 'vacant', rent: 50});
    const predicted = ofInvestment(plan).depot.b.key;
    const afterRead = JSON.stringify(plan);
    const set = Storage.prototype.setItem;
    let writes = 0;
    Storage.prototype.setItem = function(key, value){ if(key === ofStore()) writes++; return set.call(this, key, value); };
    try{
      drawPlan(); // updated save/premises are reconciled after the lines are ready
      const saved = JSON.parse(localStorage.getItem(ofStore()));
      const persisted = saved.plans.find(p => p.id === plan.id).depotKey;
      // Restore through the same path as reopening this character's saved plans.
      ofPlansFor = null;
      drawPlan();
      return {before, afterRead, predicted, persisted, restored: ofPlan().depotKey, writes};
    }finally{ Storage.prototype.setItem = set; }
  }, first);
  assert.equal(result.afterRead, result.before, 'cost preview does not mutate the plan');
  assert.equal(result.predicted, 'replacement');
  assert.equal(result.persisted, result.predicted);
  assert.equal(result.restored, result.persisted);
  assert.equal(result.writes, 1, 'only the actual depot change writes storage');
});

for(const empty of [true, false]) test(`switching to an ${empty ? 'empty' : 'unchanged'} owned plan never saves the previous plan's investment`, async t => {
  const page = await board(t);
  const result = await page.evaluate(empty => {
    const site = planTarget;
    D.openFactory.sites[site].shelves = 1000; // no extra storage needed
    const now = ofNow(site), slug = Object.keys(now)[0];
    const source = ofEnsure();
    source.type = planType = 'custom';
    source.counts = {[slug]: now[slug] + 4};
    planCounts = {...source.counts};
    drawPlan();
    const target = {...source, id: 'switch-target', counts: empty ? {} : {...now}, inv: 123};
    ofPlans.push(target);
    const set = Storage.prototype.setItem, writes = [];
    Storage.prototype.setItem = function(key, value){
      if(key === ofStore()) writes.push(JSON.parse(value).plans.find(p => p.id === target.id).inv);
      return set.call(this, key, value);
    };
    try{
      ofOpen(target.id);
      const inv = ofInvestment(target);
      return {writes, stored: JSON.parse(localStorage.getItem(ofStore())).plans.find(p => p.id === target.id),
        counts: ofCounts(), items: inv.items, investment: inv.self};
    }finally{ Storage.prototype.setItem = set; }
  }, empty);
  assert.equal(result.items, 0);
  assert.equal(result.investment, 0);
  assert.ok(result.writes.length > 0);
  assert.ok(result.writes.every(n => n === 123), 'no transient save can cost the previous rows against the selected plan');
  assert.equal(result.stored.inv, 123, 'an owned plan with nothing to buy preserves its earlier investment');
  assert.deepEqual(result.stored.counts, result.counts);
  if(empty) assert.deepEqual(result.counts, {});
});

test('removing the last custom product saves the empty new factory cost before redraw and after reload', async t => {
  const page = await board(t);
  const before = await page.evaluate(() => {
    ofOpen(null);
    planType = 'custom'; planTarget = 'new'; planCounts = {'ba:itemname_beer': 1};
    drawPlan();
    const plan = ofEnsure();
    plan.key = premises().buildings.find(b => b.type === 'warehouse').key;
    plan.depot = false;
    ofSave(); drawPlan();
    return plan.inv;
  });
  await page.locator(`[data-pc-x="${BEER}"]`).click();
  const read = () => page.evaluate(() => ({counts: ofPlan().counts, inv: ofPlan().inv,
    expected: Math.round(ofInvestment(ofPlan()).self),
    stored: JSON.parse(localStorage.getItem(ofStore())).plans.find(p => p.id === ofCur).inv}));
  const removed = await read();
  assert.deepEqual(removed.counts, {});
  assert.ok(removed.inv < before);
  assert.equal(removed.inv, removed.expected);
  assert.equal(removed.stored, removed.expected);
  await page.reload();
  assert.deepEqual(await read(), removed);
});

test('opening a plan for a factory no longer owned preserves its saved investment', async t => {
  const page = await board(t);
  const result = await page.evaluate(() => {
    const plan = ofEnsure();
    plan.inv = 123;
    const site = plan.site;
    D.businesses = D.businesses.filter(b => b.key !== site);
    ofOpen(plan.id);
    return {current: ofCur, investment: plan.inv,
      stored: JSON.parse(localStorage.getItem(ofStore())).plans.find(p => p.id === plan.id).inv};
  });
  assert.equal(result.current, null, 'the old plan is detached');
  assert.equal(result.investment, 123);
  assert.equal(result.stored, 123);
});
