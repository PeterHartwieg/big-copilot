// Chunk 3 of the redesign (docs/ui-implementation-plan.md): Businesses'
// Results, Products & prices, Standards and Milestones, a business's own page
// with its ways to the planners, Expansion's Demand → Find a location journey,
// the City map against the finder in history, the uniform write's progress,
// and the Preferences and Help & feedback sheets. The board is the CLI page
// rendered from the synthetic day-47 payload snapshot
// (tests/fixtures/payload_snapshot/, never a real save); with BOARD_TARGET=web
// it is the built web/index.html, its own files served beside it, given the
// same payload on every load. Install Playwright and its Chromium browser to
// run; NODE_PATH may point at an existing installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const ROOT = path.join(__dirname, '..');
const WEB = process.env.BOARD_TARGET === 'web';
const SNAPSHOT = path.join(ROOT, 'tests', 'fixtures', 'payload_snapshot', 'data_day47_history.json');
const DATA = () => JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
let browser, html;
before(async () => {
  const made = spawnSync(process.env.PYTHON || 'python', ['-c', `
import json, sys
from ba_dashboard import render
d = json.load(open("tests/fixtures/payload_snapshot/data_day47_history.json", encoding="utf-8"))
sys.stdout.buffer.write(render(d).encode("utf-8"))`], {cwd: ROOT, maxBuffer: 64 * 1024 * 1024});
  assert.equal(made.status, 0, made.stderr.toString());
  html = WEB ? fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8') : made.stdout.toString('utf8');
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

async function board(t, {hash = '#overview', width = 1440, height = 900} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce', colorScheme: 'dark'});
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await context.route('https://**', route => route.abort());
  await context.route('https://c3.test/**', route => {
    const p = new URL(route.request().url()).pathname;
    if(p === '/') return route.fulfill({contentType: 'text/html; charset=utf-8', body: html});
    const f = path.join(ROOT, 'web', decodeURIComponent(p));
    return WEB && fs.existsSync(f) ? route.fulfill({path: f}) : route.fulfill({status: 404, body: ''});
  });
  if(WEB) await context.addInitScript(raw => {
    window.addEventListener('load', () => { document.body.classList.add('has-board'); takeData(raw); boot(); });
  }, DATA());
  await page.goto('https://c3.test/' + hash, {waitUntil: 'load'});
  await page.waitForFunction(() => typeof route === 'string' && typeof hasData === 'function' && hasData());
  return page;
}
const where = page => page.evaluate(() => ({route, hash: location.hash, site: siteOpen ? siteKey : null,
  lit: (document.querySelector('#localNav a.on') || {}).dataset?.route || null}));
const back = async page => { await page.goBack(); await page.waitForTimeout(200); };
const forward = async page => { await page.goForward(); await page.waitForTimeout(200); };
const GIFTS = 'ba:street_lexingtonavenue#3', SPIRITS = 'ba:street_eighthstreet#5';
const keys = page => page.evaluate(() => ({
  gifts: D.businesses.find(b => /Gifts/.test(b.name)).key, spirits: D.businesses.find(b => /Spirits/.test(b.name)).key}));

// --- Businesses -------------------------------------------------------------------------

test('Results carries Company finances: cash beside profit, the loans and what they cost, how far back history reaches', async t => {
  const page = await board(t, {hash: '#businesses/results'});
  const tiles = await page.$$eval('#secFinance .bz-fin', els => els.map(e => e.innerText.replace(/\s+/g, ' ')));
  assert.equal(tiles.length, 3);
  assert.match(tiles[0], /CASH ON HAND \$25,560/i);
  assert.match(tiles[1], /OWED ON LOANS \$29,900 1 loan · \$40 a day interest, \$300 a day repaid/i);
  assert.match(tiles[2], /HISTORY SINCE day 26 Daily results: 21 days/i);
  // The cash line is a comparison with a day, not where cash history starts (round 1, S4).
  assert.match(tiles[2], /cash compared with day 40/);
  assert.doesNotMatch(tiles[2], /watched from/);
  // The chart's head, its window switch and "?", stands in the row beside the views (declutter round 2).
  assert.match(await page.locator('#viewCtl [data-view-ctl="businesses/results"] h2').textContent(), /Company results/);
  assert.equal(await page.locator('#viewCtl #chartTools').count(), 1);
  // Where the history is kept is Preferences' to say, and Payroll is a tab of
  // its own: no clause and no link repeat them here (declutter BV1, BV4).
  assert.doesNotMatch(tiles[2], /market_history\.json|kept in this browser/);
  assert.equal(await page.locator('#secFinance a[data-ov-route="staffing/payroll"]').count(), 0);
});

test('Standards compares every shop and office: satisfaction against the 80 line, promotion, amenity lamps, uniforms', async t => {
  const page = await board(t, {hash: '#businesses/standards'});
  const k = await keys(page);
  // An office scored at 10% sorts with the shops, first (round 1, Sol LOW).
  await page.evaluate(() => {
    const shop = D.businesses.find(b => /Gifts/.test(b.name));
    D.businesses.push({...JSON.parse(JSON.stringify(shop)), key: 'ba:street_testoffice#1', name: 'HART. Law', status: 'office', type: 'Law Firm',
      typeSlug: 'ba:businesstype_lawfirm', satisfaction: {overall: 10}, amenities: null, uniformGaps: [], uniformGapSkills: []});
    drawStandards(); wireAll();
  });
  const rows = await page.$$eval('#secStandards tr[data-std-row]', trs => trs.map(tr => ({key: tr.dataset.stdRow,
    sat: (tr.querySelector('.bz-sat .bz-v') || {}).textContent || null,
    lamps: [...tr.querySelectorAll('.sp-lampb')].map(l => `${[...l.classList].find(c => ['bathroom', 'toiletprivacy', 'sink', 'music', 'interior'].includes(c))}:${
      ['ok', 'miss', 'unk'].find(s => l.classList.contains(s))}`),
    uni: tr.querySelector('.bz-uni').innerText.trim()})));
  // The lowest satisfaction first.
  assert.deepEqual(rows.map(r => r.key), ['ba:street_testoffice#1', k.gifts, k.spirits]);
  assert.deepEqual(rows.map(r => r.sat), ['10%', '64%', '82%']);
  await page.evaluate(() => { D.businesses.pop(); drawStandards(); wireAll(); });
  const gifts = rows[1];
  assert.ok(gifts.lamps.includes('bathroom:ok') && gifts.lamps.includes('sink:miss') && gifts.lamps.includes('music:miss'), gifts.lamps.join());
  assert.match(gifts.uni, /no uniform locker/);
  assert.match(rows[2].uni, /^set/);
  // A business opens on its own evidence, under Standards; Back returns.
  await page.locator(`#secStandards a[data-std-site="${k.gifts}"]`).click();
  await page.waitForFunction(() => siteOpen);
  let w = await where(page);
  assert.deepEqual([w.route, w.site, w.lit], ['businesses/standards', k.gifts, 'businesses/standards']);
  await back(page);
  w = await where(page);
  assert.deepEqual([w.route, w.site], ['businesses/standards', null]);
});

test('Products & prices: a shop picked shows its prices beside the market\'s lowest, and the pick survives Back, Forward and a reload', async t => {
  const page = await board(t, {hash: '#businesses/prices'});
  const k = await keys(page);
  const picked = () => page.evaluate(() => (document.querySelector('#viewCtl [data-price-pick][aria-pressed="true"]') || {}).dataset?.pricePick);
  await page.locator(`#viewCtl [data-price-pick="${k.gifts}"]`).click();
  assert.equal(await picked(), k.gifts);
  const head = await page.$$eval('#secPrices .bz-prices th', ths => ths.map(th => th.textContent.trim()).filter(Boolean));
  assert.deepEqual(head.slice(0, 5), ['Product', 'Your price', 'Lowest market price · Lower Manhattan', 'Average sold price', 'Sells / day']);
  // What each column holds is its header's tip; no foot paragraph restates them.
  const tips = await page.$$eval('#secPrices .bz-prices th[data-tip]', ths => ths.map(th => th.dataset.tip));
  assert.match(tips[1], /not a recommended price/);
  assert.match(tips[2], /takings over its units sold/);
  assert.equal(await page.locator('#secPrices .bz-foot').count(), 0);
  // The average sold price is the line's own (extraction's takings over
  // units), never rounded revenue over a rounded rate (round 1, Sol SHOULD):
  // one $10 sale in a week reads $10.00, a line that sold nothing reads none.
  const avg = await page.evaluate(key => {
    const b = D.businesses.find(x => x.key === key);
    const l = b.lines.find(x => x.soldPerDay > 0);
    Object.assign(l, {soldPrice: 10, revenue: 1.43, rate: 0.1});
    const none = b.lines.find(x => x !== l && spShelfListed(b, x));
    if(none) none.soldPrice = null;
    drawPriceShops(); wireAll();
    const cells = [...document.querySelectorAll('#secPrices .bz-prices tbody tr')].map(tr => [tr.cells[0].textContent.trim(), tr.cells[3].textContent.trim()]);
    return {item: l.item, cells, other: none ? none.item : null};
  }, k.gifts);
  assert.deepEqual(avg.cells.find(c => c[0] === avg.item), [avg.item, '$10.00']);
  // An office's row reads as fees billed (round 1, L3).
  const officeHead = await page.evaluate(key => {
    const shop = D.businesses.find(x => x.key === key);
    D.businesses.push({...JSON.parse(JSON.stringify(shop)), key: 'ba:street_testoffice#2', name: 'HART. Law', status: 'office', type: 'Law Firm',
      lines: shop.lines.map(l => ({...l, price: 50, configuredPrice: 50}))});
    bzPriceLit = 'ba:street_testoffice#2'; drawPriceShops();
    const head = [...document.querySelectorAll('#secPrices .bz-prices th')].map(th => th.textContent.trim()).filter(Boolean);
    const tips = [...document.querySelectorAll('#secPrices .bz-prices th[data-tip]')].map(th => th.dataset.tip).join(' ');
    D.businesses.pop(); bzPriceLit = key; drawPriceShops(); wireAll();
    return {head, tips};
  }, k.gifts);
  assert.deepEqual([officeHead.head[0], officeHead.head[3], officeHead.head[4]], ['Fee', 'Average billed price', 'Hours billed / day']);
  // An office's columns explain billed hours, never units sold (the office footnote, final QA).
  assert.match(officeHead.tips, /hours billed/);
  assert.doesNotMatch(officeHead.tips, /units sold/);
  if(avg.other) assert.equal(avg.cells.find(c => c[0] === avg.other)[1], '—');
  // Sales across the company follow on the same view.
  assert.match(await page.locator('#secProducts .sechead h2').innerText(), /Sales across the company/);
  // The pick is the entry's: Back to Spirits' visit and Forward to Gifts'.
  await page.evaluate(() => openRoute('businesses/results'));
  await page.evaluate(() => openRoute('businesses/prices'));
  await page.locator(`#viewCtl [data-price-pick="${k.spirits}"]`).click();
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData() && route === 'businesses/prices');
  assert.equal(await picked(), k.spirits, 'a reload keeps the shop on screen');
});

test('Plan a factory names itself so on its page, Demand\'s rows leave it to its tab; search knows Company results', async t => {
  const page = await board(t, {hash: '#expansion/factory'});
  // The heading is the lit tab's name, kept for screen readers (declutter G9).
  // Its head, with the type picker, stands in the row beside the views.
  assert.equal(await page.locator('#viewCtl [data-view-ctl="expansion/factory"] h2').textContent(), 'Plan a factory');
  assert.equal(await page.locator('#viewCtl [data-view-ctl="expansion/factory"] h2.nx-sr').count(), 1);
  assert.equal(await page.locator('#viewCtl #planPicker').count(), 1);
  await page.evaluate(() => openRoute('expansion/demand'));
  // Plan a factory is the next tab: no row links it again (declutter E2).
  assert.equal(await page.locator('#market .mk-plan').count(), 0);
  assert.equal(await page.evaluate(() => SS_VIEWS.find(v => v.id === 'daily').t), 'Company results');
});

test('Milestones: the career goals with their bars, and the totals', async t => {
  const page = await board(t, {hash: '#businesses/milestones'});
  const rows = await page.$$eval('#secGoals .bz-mile', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  assert.deepEqual(rows, ['Every business type run 2 / 2', 'Rivals taken over 0 / 1', 'Personal goals done 1 done', 'Diplomas earned 1 / 2']);
  assert.match(await page.locator('#secGoals .bz-fins').innerText(), /GOODS PRODUCED\s+52,800[\s\S]*TAXES PAID\s+\$5,200[\s\S]*BUILDINGS OWNED\s+1/i);
});

test('a business\'s page summarises its week and links to the one planner; the ways to its planners keep it picked and lead back', async t => {
  const page = await board(t);
  const k = await keys(page);
  await page.evaluate(key => openSite(key), k.spirits);
  // No second planner on the page, a summary with the way to Schedules.
  assert.equal(await page.locator('#sitePanel #sp-roster').count(), 0);
  assert.equal(await page.locator('#sp-sched').count(), 1);
  assert.deepEqual(await page.$$eval('#sitePanel .sp-acts [data-site-go]', bs => bs.map(b => b.dataset.siteGo)),
    ['staffing/schedules', 'supply/deliveries', 'businesses/prices']);
  // Schedule: Staffing › Schedules with this shop picked, the way back named.
  await page.locator('#sitePanel .sp-acts [data-site-go="staffing/schedules"]').click();
  let w = await where(page);
  assert.equal(w.route, 'staffing/schedules');
  assert.equal(await page.evaluate(() => schedLit), k.spirits);
  assert.match(await page.locator('#arrive').innerText(), /HART\. Spirits/);
  await back(page);
  w = await where(page);
  assert.equal(w.site, k.spirits, 'Back returns to the business page');
  // Deliveries: the shop's own scope; Prices: the shop picked.
  await page.locator('#sitePanel .sp-acts [data-site-go="supply/deliveries"]').click();
  assert.equal((await where(page)).route, 'supply/deliveries');
  assert.equal(await page.evaluate(() => sbScope.deliveries), `site:${k.spirits}`);
  await back(page);
  await page.locator('#sitePanel .sp-acts [data-site-go="businesses/prices"]').click();
  assert.equal((await where(page)).route, 'businesses/prices');
  assert.equal(await page.evaluate(() => bzPriceLit), k.spirits);
});

test('a headquarters page offers no Supply action; a warehouse keeps Imports and Deliveries, a factory Production', async t => {
  const page = await board(t);
  const acts = key => page.evaluate(key => { openSite(key); return [...document.querySelectorAll('#sitePanel .sp-acts [data-site-go]')].map(b => b.dataset.siteGo); }, key);
  const hub = await page.evaluate(() => D.businesses.find(b => /Hub/.test(b.name)).key);
  const brewery = await page.evaluate(() => D.businesses.find(b => /Brewery/.test(b.name)).key);
  assert.deepEqual(await acts(hub), ['supply/imports', 'supply/deliveries']);
  assert.deepEqual(await acts(brewery), ['supply/production']);
  // A headquarters: a support site the Supply views do not scope.
  await page.evaluate(() => {
    const hub = D.businesses.find(b => /Hub/.test(b.name));
    D.businesses.push({...JSON.parse(JSON.stringify(hub)), key: 'ba:street_testhq#1', name: 'HART. Group HQ', type: 'Headquarters',
      typeSlug: 'ba:businesstype_headquarters', status: 'overhead', lines: []});
  });
  assert.deepEqual(await acts('ba:street_testhq#1'), [], 'no Imports or Deliveries that would land on empty views');
  assert.deepEqual(await page.evaluate(() => [sbScopeOf('imports'), sbScopeOf('deliveries')]), ['all', 'all']);
});

test('two shops from Results, their prices and standards, then a canonical action and the way back', async t => {
  const page = await board(t, {hash: '#businesses/results'});
  const k = await keys(page);
  for(const key of [k.gifts, k.spirits]){
    await page.evaluate(() => openRoute('businesses/results'));
    await page.evaluate(key => { openChains.add(D.chains.find(c => c.sites.includes(key)).name); drawPortfolio(); }, key);
    await page.evaluate(key => openSite(key), key);
    assert.equal((await where(page)).site, key);
    await page.locator('#sitePanel .sp-acts [data-site-go="businesses/prices"]').click();
    assert.equal(await page.evaluate(() => bzPriceLit), key, 'Prices opens on this shop');
    await page.evaluate(() => openRoute('businesses/standards'));
    assert.equal(await page.locator(`#secStandards tr[data-std-row="${key}"]`).count(), 1);
  }
  // Standards → the shop's page → Schedule (the canonical action) → back to the page.
  await page.locator(`#secStandards a[data-std-site="${k.gifts}"]`).click();
  await page.waitForFunction(() => siteOpen);
  await page.locator('#sitePanel .sp-acts [data-site-go="staffing/schedules"]').click();
  assert.equal((await where(page)).route, 'staffing/schedules');
  await page.locator('#arrive [data-nx="back"]').click();
  await page.waitForTimeout(200);
  const w = await where(page);
  assert.deepEqual([w.site, w.route], [k.gifts, 'businesses/standards'], 'the way back is the page, under Standards');
});

// --- the uniform write's progress --------------------------------------------------------

test('uniforms: Applied from the write\'s answer, Confirmed once a later board shows no gap, Not confirmed where one is back', async t => {
  const page = await board(t, {hash: '#businesses/standards'});
  const k = await keys(page);
  const skill = 'ba:skill_customerservice';
  const state = () => page.evaluate(key => { const u = pgUniformState(key); return u ? u.state : null; }, k.gifts);
  // textContent, not innerText: the table sits in a section{content-visibility:auto},
  // and Chromium gives innerText as '' while that section is off screen or its
  // visibility not yet settled after a redraw. The draws here are synchronous,
  // so the pill's words are in the DOM the moment the evaluate returns.
  const pill = () => page.evaluate(key => {
    const el = document.querySelector(`#secStandards tr[data-std-row="${CSS.escape(key)}"] .nx-st`);
    return el ? el.textContent : '';
  }, k.gifts);
  await page.evaluate(([key, skill]) => {
    const [street, number] = [key.slice(0, key.lastIndexOf('#')), Number(key.slice(key.lastIndexOf('#') + 1))];
    // The locker is in place now; the write dressed the one role.
    D.businesses.find(b => b.key === key).missingUniformLocker = false;
    window.ids = pgUniformDone({rows: [{address: {street, number}, set: [skill], skipped: [], presetName: 'Default'}]});
    drawStandards(); wireAll();
  }, [k.gifts, skill]);
  assert.equal(await state(), 'applied');
  assert.match(await pill(), /Applied · awaiting refresh/);
  // The business's own page shows it beside the write too (round 1, S3).
  await page.evaluate(key => openSite(key), k.gifts);
  assert.match(await page.locator('#sp-standards .sp-unipg').innerText(), /Applied · awaiting refresh/);
  await page.evaluate(() => openRoute('businesses/standards'));
  // The same board judges nothing: a click is not proof.
  await page.evaluate(() => pgEvaluate());
  assert.equal(await state(), 'applied');
  // A later board with the gap gone: Confirmed.
  const later = (gap) => page.evaluate(([key, skill, gap]) => {
    const d = JSON.parse(JSON.stringify(D));
    d.meta.hour += 1;
    const b = d.businesses.find(x => x.key === key);
    b.missingUniformLocker = false;
    b.uniformGapSkills = gap ? [skill] : []; b.uniformGaps = gap ? ['Customer Service'] : [];
    takeData(d); renderAll();
  }, [k.gifts, skill, gap]);
  await later(false);
  assert.equal(await state(), 'confirmed');
  assert.match(await pill(), /Confirmed · day 47/);
  // Supply › Changes clears the import records it lists, not this one (round 1, L2).
  await page.evaluate(() => pgClearSettled());
  assert.equal(await state(), 'confirmed');
  // An undo takes the record back.
  await page.evaluate(() => pgDrop(window.ids));
  assert.equal(await state(), null);
  // Written again, and a later board still shows the role without one: Not confirmed.
  await page.evaluate(([key, skill]) => {
    const [street, number] = [key.slice(0, key.lastIndexOf('#')), Number(key.slice(key.lastIndexOf('#') + 1))];
    pgUniformDone({rows: [{address: {street, number}, set: [skill], skipped: []}]});
  }, [k.gifts, skill]);
  await later(true);
  assert.equal(await state(), 'changed');
  // A refused shop records nothing.
  const none = await page.evaluate(() => pgUniformDone({rows: [{address: {street: 'x', number: 1}, set: ['a'], error: 'no_locker'}]}));
  assert.deepEqual(none, []);
});

// --- Expansion ---------------------------------------------------------------------------

/* A Demand cell by its type and neighbourhood. */
const cell = (page, slug, hood) => page.locator(`#market .cell[data-slug="${slug}"][data-hood="${hood}"]`);
/* A cell opens its popover; its Find a location asks the finder. */
async function findFrom(page, slug, hood){
  await cell(page, slug, hood).click();
  await page.locator('#demCellPop [data-dem-go="find"]').click();
}
const finder = page => page.evaluate(() => ({route, on: cityMapPage.finderOn(), type: cityMapPage.fs.type,
  hoods: cityMapPage.fs.hoods, arrive: (document.querySelector('#arrive') || {}).innerText || ''}));

test('two Demand cells carry their own type and neighbourhood into the one finder; Back, Forward and a reload keep each', async t => {
  const page = await board(t, {hash: '#expansion/demand'});
  const LIQ = 'ba:businesstype_liquorstore', GIFT = 'ba:businesstype_giftshop';
  const MID = 'ba:neighborhood_midtown', LOW = 'ba:neighborhood_lowermanhattan';
  await findFrom(page, LIQ, MID);
  await page.waitForFunction(() => typeof cityMapPage !== 'undefined' && cityMapPage && cityMapPage.finderOn());
  await page.evaluate(() => cityMapPage.ready);
  let f = await finder(page);
  assert.deepEqual([f.route, f.type, f.hoods], ['expansion/finder', LIQ, [MID]]);
  assert.match(f.arrive, /Demand for Liquor Store in Midtown/);
  // Back: Demand, the cell that asked focused.
  await back(page);
  assert.equal((await where(page)).route, 'expansion/demand');
  assert.deepEqual(await page.evaluate(() => [document.activeElement.dataset.slug, document.activeElement.dataset.hood]), [LIQ, MID]);
  // A second cell asks its own question.
  await findFrom(page, GIFT, LOW);
  await page.waitForFunction(() => route === 'expansion/finder' && cityMapPage.fs.type === 'ba:businesstype_giftshop');
  f = await finder(page);
  assert.deepEqual([f.type, f.hoods], [GIFT, [LOW]]);
  assert.match(f.arrive, /Demand for Gift Shop in Lower Manhattan/);
  // The reader narrows it, then leaves and comes back: each entry keeps its own filters.
  await page.evaluate(() => { cityMapPage.fs.minM2 = 50; cityMapPage.saveFinder(); cityMapPage.update(); });
  await page.evaluate(() => openRoute('expansion/factory'));
  await back(page);
  await page.waitForTimeout(200);
  f = await finder(page);
  assert.deepEqual([f.route, f.type, f.hoods, await page.evaluate(() => cityMapPage.fs.minM2)], ['expansion/finder', GIFT, [LOW], 50]);
  await page.reload();
  await page.waitForFunction(() => typeof cityMapPage !== 'undefined' && cityMapPage && cityMapPage.finderOn() && route === 'expansion/finder');
  await page.evaluate(() => cityMapPage.ready);
  await page.waitForTimeout(200);
  f = await finder(page);
  assert.deepEqual([f.type, f.hoods, await page.evaluate(() => cityMapPage.fs.minM2)], [GIFT, [LOW], 50], 'a reload keeps the entry\'s filters');
  assert.match(f.arrive, /Demand for Gift Shop in Lower Manhattan/, 'and why the reader came');
  // Back to Demand, then Forward: the gift shop question again, not the liquor store's.
  await back(page);
  assert.equal((await where(page)).route, 'expansion/demand');
  await forward(page);
  await page.waitForTimeout(200);
  f = await finder(page);
  assert.deepEqual([f.route, f.type, f.hoods], ['expansion/finder', GIFT, [LOW]]);
});

test('Find a location keeps a picked building through a detour, and its strip leads back to Demand with the type ringed', async t => {
  const page = await board(t, {hash: '#expansion/demand'});
  await findFrom(page, 'ba:businesstype_liquorstore', 'ba:neighborhood_midtown');
  await page.waitForFunction(() => typeof cityMapPage !== 'undefined' && cityMapPage && cityMapPage.finderOn());
  await page.evaluate(() => cityMapPage.ready);
  // No cards under the map repeat the tabs and the Wiki (declutter E4).
  assert.equal(await page.locator('#finderCtx .fx-card').count(), 0);
  // Takeover shows the save's one rival: pick it, leave, come back.
  await page.evaluate(() => { cityMapPage.fs.show = 'takeover'; cityMapPage.fs.hoods = null; cityMapPage.saveFinder(); cityMapPage.update(); });
  const key = await page.evaluate(() => { const r = cityMapPage.rows()[0]; if(r) cityMapPage.select(r.key); return r ? r.key : null; });
  assert.ok(key, 'a building to pick');
  await page.evaluate(() => openRoute('expansion/factory'));
  await back(page);
  await page.waitForFunction(k => cityMapPage.selected === k, key);
  // The finder, with the cell's own strip; its way back is Demand, the type's row ringed.
  assert.equal((await where(page)).route, 'expansion/finder');
  assert.match(await page.locator('#arrive').innerText(), /Demand for Liquor Store in Midtown/);
  await page.locator('#arrive [data-nx="back"]').click();
  await page.waitForTimeout(250);
  assert.equal((await where(page)).route, 'expansion/demand', 'the strip leads back to Demand');
  assert.equal(await page.locator('#market .r.mk-arrive[data-slug="ba:businesstype_liquorstore"]').count(), 1);
});

test('the City map is the plain map: the masthead switches the finder off, and the finder\'s switch is a visit Back undoes', async t => {
  const page = await board(t, {hash: '#map'});
  await page.waitForFunction(() => typeof cityMapPage !== 'undefined' && cityMapPage && cityMapPage.panel);
  await page.evaluate(() => cityMapPage.ready);
  const now = () => page.evaluate(() => ({route, on: cityMapPage.finderOn(), head: document.querySelector('#mapHead h2').textContent}));
  assert.deepEqual(await now(), {route: 'map', on: false, head: 'City map'});
  await page.locator('#cityMapPage [data-f="tog"]').click();
  assert.deepEqual(await now(), {route: 'expansion/finder', on: true, head: 'Find a location'});
  await back(page);
  assert.deepEqual(await now(), {route: 'map', on: false, head: 'City map'});
  await forward(page);
  assert.deepEqual(await now(), {route: 'expansion/finder', on: true, head: 'Find a location'});
  // Left on, the City map from the masthead is still the City map.
  await page.evaluate(() => openRoute('overview'));
  await page.locator('#navRefs a[data-id="map"]').click();
  assert.deepEqual(await now(), {route: 'map', on: false, head: 'City map'});
});

// --- the utilities -----------------------------------------------------------------------

/* The sidebar has one ···: the board's own (#navMore) on the local server
   page, and on the hosted board its save-source menu (#menuBtn), which takes
   the utilities in once the page has placed it. Opens it and picks `item`;
   gives back the id of the button the keyboard returns to. */
async function utility(page, item) {
  if (await page.locator('#navMore').isVisible()) {
    await page.locator('#navMore').click();
    await page.locator(`#nxMenu [data-nx-item="${item}"]`).click();
    return 'navMore';
  }
  await page.locator('#menuBtn').click();
  await page.locator(`#menuUtilSlot [data-nx-item="${item}"]`).click();
  return 'menuBtn';
}

test('Preferences is a sheet: the checks panel over it, Escape in order, and the keyboard back on ···; theme and language are the footer\'s', async t => {
  const page = await board(t);
  const opener = await utility(page, 'prefs');
  assert.equal(await page.locator('#pxSheet').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'pxTitle');
  const rows = await page.$$eval('#pxSheet .px-row', rs => rs.map(r => r.dataset.px));
  // Theme and language live in the footer only (declutter X5).
  assert.deepEqual(rows, [...(WEB ? ['gametext'] : []), 'history', 'checks', 'context', 'cli']);
  assert.equal(await page.locator('#pxSheet [data-theme-set], #pxSheet .gn-pick').count(), 0);
  // Customize checks opens the checks panel above the sheet.
  await page.locator('#pxKinds').click();
  assert.equal(await page.evaluate(() => kindsPop.classList.contains('on')), true);
  const top = await page.evaluate(() => { const r = kindsPop.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + 20); return !!el && kindsPop.contains(el); });
  assert.equal(top, true, 'the panel is on top of the sheet');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => kindsPop.classList.contains('on')), false);
  assert.equal(await page.locator('#pxSheet').isVisible(), true, 'the first Escape closes the panel only');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pxSheet').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), opener);
  // The footer's theme switch is the one there is.
  await page.locator('.sitefoot [data-theme-set="light"]').click();
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
  // Company finances' history link opens the sheet on its History row, the
  // row itself focused, not Forget history (round 1, L1); a click says so there.
  await page.evaluate(() => openRoute('businesses/results'));
  const n = await page.locator('#secFinance [data-open-prefs]').count();
  if(n){  // the CLI page keeps its history in a file, with no browser control to open
    await page.locator('#secFinance [data-open-prefs]').click();
    assert.equal(await page.locator('#pxSheet .px-row.px-lit').getAttribute('data-px'), 'history');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.px), 'history');
    await page.locator('#pxSheet [data-px-do="forget"]').click();
    assert.match(await page.locator('#pxSheet [data-px="history"] .px-said').innerText(), /History forgotten/);
  }
});

test('an open Preferences sheet is drawn again in a language picked, the keyboard where it was', async t => {
  const page = await board(t);
  await page.evaluate(() => pxOpen('prefs', document.getElementById('navMore')));
  const head = () => page.locator('#pxSheet [data-px="checks"] h3').innerText();
  assert.equal(await head(), 'Checks');
  // The language is picked in the footer; the sheet's listener is fed a table here.
  await page.evaluate(() => { document.querySelector('#pxSheet [data-px="checks"] button').focus(); ttSetTable('de', {'nav.px.checks.title': 'Prüfungen'}); });
  assert.equal(await head(), 'Prüfungen');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.px), 'checks', 'the keyboard stays in its row');
  assert.equal(await page.locator('#pxSheet').isVisible(), true);
});

test('Help & feedback is a sheet with the way to ask; the changelog and the project\'s links are the footer\'s', async t => {
  const page = await board(t);
  await utility(page, 'help');
  const text = await page.locator('#pxSheet').innerText();
  assert.match(text, /Can.t find something\?/);
  assert.match(text, /Bugs and feedback/);
  // The footer under the sheet, the sidebar and the ··· menu carry the rest (declutter X6).
  assert.doesNotMatch(text, /Source code|Search the board|Where is my save/);
  assert.equal(await page.locator('#pxSheet [data-changelog]').count(), 0);
  await page.keyboard.press('Escape');
  await page.locator('.sitefoot [data-changelog]').first().click();
  assert.equal(await page.evaluate(() => document.getElementById('changelogDialog').open), true);
});

// --- user testing, 28 September 2026 ---------------------------------------------------

test('Plan a factory says nothing its table already says; Demand has no trend-history note; Payroll says plainly where wages part from the rates', async t => {
  const page = await board(t, {hash: '#expansion/factory'});
  await page.locator('#planBody table').first().waitFor();
  assert.equal(await page.locator('#secPlan .planline').count(), 0, 'no sentence under the products');
  if (await page.locator('#ingBody tr').count()) {
    assert.equal((await page.locator('#ingNote').textContent()).trim(), '', 'the Total row is the cost');
    assert.match(await page.locator('#ingTable th.cash').getAttribute('data-tip'), /What you paid/);
    const changes = await page.$$eval('#ingBody td.chg', tds => tds.filter(td => !['', '—'].includes(td.textContent.trim())).length);
    assert.equal(await page.locator('#ingTable').evaluate(tb => tb.classList.contains('nochange')), changes === 0, 'the Change column only where a row has one');
  }
  await page.evaluate(() => openRoute('expansion/demand'));
  assert.doesNotMatch(await page.locator('#pageGrowth').innerText(), /trend history/i);
  await page.evaluate(() => openRoute('staffing/payroll'));
  const text = await page.locator('#secPayroll').innerText();
  assert.doesNotMatch(text, /books part/i);
  if (await page.locator('#secPayroll .pay-off').count()) {
    assert.equal(await page.locator('#secPayroll .pay-off h3').innerText(), "Sites whose wages yesterday differ from today's rates");
    assert.match(await page.locator('#secPayroll .pay-off li small').first().innerText(), /^paid \$[\d,.k]+ yesterday · \$[\d,.k]+ at today's rates$/);
  }
});
