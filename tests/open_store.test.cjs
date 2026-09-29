// Expansion › Open a store (docs/open-a-store-scope.md, phase 2): the four
// steps a plan walks -- what, where, the investment, break even -- the Demand
// cell's way in, the plans kept per character, and the financing panel. The
// board is the CLI page rendered from the synthetic day-47 payload snapshot
// (tests/fixtures/payload_snapshot/, never a real save). Its one rival shop in
// Midtown (9 Broadway Street, an M1) is the building a plan picks; the test
// frees it first, as the save has no empty shop. Install Playwright and its
// Chromium browser to run; NODE_PATH may point at an existing installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const {chromium} = require('playwright');

const ROOT = path.join(__dirname, '..');
const LIQ = 'ba:businesstype_liquorstore', MID = 'ba:neighborhood_midtown';
const SITE = 'ba:street_broadwaystreet#9';
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

async function board(t, {hash = '#expansion/open', width = 1280, height = 900, context = null} = {}) {
  const ctx = context || await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce', colorScheme: 'dark'});
  if(!context) t.after(() => ctx.close());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await ctx.route('https://**', route => route.abort());
  await ctx.route('https://os.test/**', route => route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await page.goto('https://os.test/' + hash, {waitUntil: 'load'});
  await page.waitForFunction(() => typeof route === 'string' && typeof hasData === 'function' && hasData());
  /* The save has no empty shop: its one rival in Midtown stands in for one. */
  await page.evaluate(site => { premises().buildings.find(b => b.key === site).status = 'vacant'; }, SITE);
  return page;
}
const steps = page => page.$$eval('#osCtl [data-os-step]', bs => bs.map(b => [b.dataset.osStep, b.className, b.disabled]));
const strip = page => page.$$eval('#osStrip .os-pb > div', ds => ds.map(d => d.innerText.replace(/\s+/g, ' ').trim()));
const money = text => +String(text).replace(/[^0-9.-]/g, '');

/* From the grid of types: a plan for a liquor store anywhere, then the
   building picked in the embedded finder. */
async function planned(page){
  await page.locator(`#osBody .os-type[data-os-new="${LIQ}"]`).click();
  await page.locator('#osFinderMap .place.fr').first().waitFor();
  await page.locator(`#osFinderMap .place[data-pick="${SITE}"]`).click();
  await page.locator('#osFinderMap .site [data-action="plan"]').click();
  await page.waitForFunction(() => osStep === 'investment');
}

test('the view is Expansion\'s, New until opened, and starts on What with its six steps', async t => {
  const page = await board(t, {hash: '#expansion/demand'});
  const tab = page.locator('#localNav a[data-route="expansion/open"]');
  assert.equal(await tab.locator('.feature-new').isVisible(), true, 'New until the view is opened');
  assert.deepEqual(await page.$$eval('#localNav a[data-route]', as => as.map(a => a.dataset.route)),
    ['expansion/demand', 'expansion/finder', 'expansion/open', 'expansion/factory']);
  await tab.click();
  await page.waitForFunction(() => route === 'expansion/open');
  assert.equal(await page.locator('#localNav a[data-route="expansion/open"] .feature-new').isVisible(), false);
  assert.equal(await page.locator('#secOpen').isVisible(), true);
  // The steps and the plan picker stand beside the view's tabs.
  assert.equal(await page.locator('#viewCtl #osCtl').count(), 1);
  assert.deepEqual(await steps(page), [['what', 'on', false], ['where', '', true], ['investment', '', true],
    ['breakeven', '', true], ['opening', '', true], ['open', '', true]]);
  // From demand: the neighbourhoods with the most demand where the player has no such shop yet.
  const rows = await page.$$eval('#osBody .os-dl tbody tr', trs => trs.map(tr => tr.innerText.replace(/\s+/g, ' ')));
  assert.ok(rows.length >= 3);
  const scores = await page.$$eval('#osBody .os-dl .sc', cs => cs.map(c => +c.textContent));
  assert.deepEqual(scores, scores.slice().sort((a, b) => b - a), 'strongest demand first');
  // Midtown's liquor store is the player's own, so Midtown is not offered for it.
  assert.ok(!rows.some(r => /Liquor Store .*Midtown/.test(r)), rows.join(' | '));
  // Or a type: every shop the rules know, offices apart; the count is how many the player runs.
  assert.match(await page.locator('#osBody .os-type', {hasText: 'Liquor Store'}).innerText(), /Liquor Store\s*1/);
  assert.equal(await page.locator('#osBody .os-h').count(), 0, 'no plans yet');
});

test('a Demand cell\'s Open a store here starts a plan for its type and neighbourhood on Where', async t => {
  const page = await board(t, {hash: '#expansion/demand'});
  await page.locator(`#market .cell[data-slug="${LIQ}"][data-hood="${MID}"]`).click();
  const pop = page.locator('#demCellPop');
  assert.match(await pop.innerText(), /Liquor Store · Midtown/);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.demGo), 'open');
  await pop.locator('[data-dem-go="open"]').click();
  await page.waitForFunction(() => route === 'expansion/open' && osStep === 'where');
  assert.equal(await pop.isVisible(), false);
  const s = await strip(page);
  assert.match(s[0], /Liquor Store Demand in Midtown 68/);
  assert.match(s[1], /Not picked yet/);
  // The finder is fixed to the plan's type, Midtown only, and lists the building.
  await page.locator('#osFinderMap .place.fr').first().waitFor();
  assert.equal(await page.locator('#osFinderMap .fplan-type').textContent(), 'Liquor Store');
  assert.deepEqual(await page.$$eval('#osFinderMap .place.fr', r => r.map(x => x.dataset.pick)), [SITE]);
  // The way back is Demand.
  assert.match(await page.locator('#arrive').innerText(), /Demand for Liquor Store in Midtown/);
});

test('Plan here opens the investment: one table by reason for the firm, a list by store for self-installation', async t => {
  const page = await board(t);
  await planned(page);
  const inv = await page.evaluate(() => osInvestment(osPlan(), osBuilding(osPlan().key)));
  const b = await page.evaluate(site => premises().buildings.find(x => x.key === site), SITE);
  // The firm charges 586 a square metre, every item at its default price, and the deposit.
  assert.equal(inv.fee, 586 * b.m2);
  assert.equal(inv.firm, inv.furniture + inv.fee + b.deposit);
  const groups = await page.$$eval('#osBody .os-inv tr.grp td', tds => tds.map(td => td.firstChild.textContent.trim()));
  assert.deepEqual(groups.filter(g => g !== 'Customer demands' && g !== 'Building capacity'),
    ['Installation firm', 'Required to open', 'Shelves and displays', 'Deposit']);
  assert.ok(groups.includes('Customer demands'), 'a liquor store asks for music, uniforms and a toilet');
  // Midtown asks for an interior score: the firm lays the walls and floors free.
  assert.match(await page.locator('#osBody .os-inv td.free').locator('xpath=..').innerText(), /Midtown asks for an interior score of 50/);
  assert.equal(money(await page.locator('#osBody .os-inv tfoot td').last().textContent()), Math.round(inv.firm));
  assert.equal(money((await strip(page))[2]), Math.round(inv.firm));
  assert.deepEqual((await steps(page)).map(s => s[1]), ['done', 'done', 'on', '', '', '']);
  // Self-installation: the items by store, a delivery each, the walls and floors Midtown asks for, the deposit.
  await page.locator('#osBody [data-os-mode="self"]').click();
  const cards = page.locator('#osBody .os-store');
  assert.ok(await cards.count() >= 3);
  assert.match(await page.locator('#osBody .os-store', {hasText: 'Walls and floors'}).innerText(), /Interior Designer · Midtown asks for a score of 50/);
  assert.equal(money(await page.locator('#osBody .os-total b').textContent()), Math.round(inv.self));
  assert.equal(inv.self, inv.furniture + inv.delivery + inv.decor + b.deposit);
  assert.match((await strip(page))[2], /Self-installation · deposit included/);
  // The choice is the plan's, and the portfolio's too (paybackMode()).
  assert.equal(await page.evaluate(() => [osPlan().mode, paybackMode()].join()), 'self,self');
});

test('Break even shows both install modes from the game\'s rules, a range, tax, your own shop and a loan', async t => {
  const page = await board(t);
  await planned(page);
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  await page.waitForFunction(() => osStep === 'breakeven');
  const est = await page.evaluate(() => { const p = osPlan(); const e = osEstimate(p, osBuilding(p.key));
    return {profit: e.profit, firm: e.days.firm, self: e.days.self, mix: e.model.mix}; });
  assert.ok(est.profit > 0, 'the rules give the Midtown liquor store a profit');
  assert.ok(est.firm.low <= est.firm.high && est.self.high <= est.firm.high);
  const big = await page.$$eval('#osBody .os-big > div', ds => ds.map(d => d.textContent.replace(/\s+/g, ' ')));
  assert.match(big[0], /INSTALLATION FIRM/i);
  assert.match(big[1], /SELF-INSTALLATION/i);
  assert.equal(await page.locator('#osBody svg.os-chart').count(), 1);
  const notes = await page.locator('#osBody .os-note').allInnerTexts();
  assert.match(notes[0], /^Between \$[\d,]+ and \$[\d,]+ a day if it is priced, stocked and staffed as planned\.$/);
  assert.match(notes[1], /^After 5% tax: \$[\d,]+ a day\.$/);
  // The player's own liquor store against the same rules, as a line and its own card.
  assert.ok(notes.some(n => /Your liquor store earns \d+% of what these rules give its own building\./.test(n)), notes.join('\n'));
  assert.equal(await page.locator('#osBody .os-ownc .os-site').count(), 1);
  // Financing: off until asked for; then the amount moves only the figures.
  assert.match(await page.locator('#osFin').innerText(), /The game books the loan to the company, not to the store\./);
  await page.locator('#osFin [data-os-fin-on]').check();
  const facts = page.locator('#osFinFacts > div');
  assert.equal(await facts.count(), 4);
  await page.locator('#osFin [data-os-fin-amount]').fill('20000');
  await page.waitForFunction(() => osPlan().finance.amount === 20000);
  const loan = await page.evaluate(() => { const bank = osFacts().finance.banks.find(b => b.id === 'VantanderBankSettings');
    return osLoan(20000, bank); });
  // Flat interest, floor(20,000 x 12% x 0.7 / 100 / 60) = 28 a day; 83 repaid over 241 days.
  assert.deepEqual([loan.interest, loan.repay, loan.days], [28, 83, 241]);
  assert.match(await facts.nth(1).innerText(), /\$111[\s\S]*\$83 repaid \+ \$28 interest/);
  assert.match(await facts.nth(2).innerText(), new RegExp(`over 241 days`));
});

test('plans are kept per character: a reload opens the plan where it was left, and a plan can be deleted', async t => {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  const page = await board(t, {context});
  await planned(page);
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  await page.evaluate(site => { premises().buildings.find(b => b.key === site).status = 'vacant'; }, SITE);
  await page.evaluate(() => openRoute('expansion/open'));
  await page.waitForFunction(() => osStep === 'breakeven');
  assert.match(await page.locator('#osCtl select[data-os-plan] option:checked').textContent(), /Liquor Store · 9 Broadway Street/);
  // Another character's board has its own plans.
  const stored = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ba_open_store_v1:')));
  assert.deepEqual(stored, [`ba_open_store_v1:${await page.evaluate(() => D.meta.character)}`]);
  // New plan: What again, with the plan in Your plans; deleting it empties the list.
  await page.locator('#osCtl select[data-os-plan]').selectOption('');
  await page.waitForFunction(() => osStep === 'what');
  assert.equal(await page.locator('#osBody .os-plan').count(), 1);
  assert.match(await page.locator('#osBody .os-plan').innerText(), /Liquor Store[\s\S]*9 Broadway Street · Midtown/);
  await page.locator('#osBody [data-os-drop]').click();
  assert.equal(await page.locator('#osBody .os-plan').count(), 0);
});

test('an office is planned by the office rules: fee-hours from its capacity, its staff by the hour', async t => {
  const page = await board(t);
  const m = await page.evaluate(() => {
    const t = {cat: 'office', model: 'office', products: [['ba:itemname_hourlylawyerfee', 1]], days: Array(7).fill(2),
      hours: Array(24).fill(2), wage: 50, initial: {K1: 50}, layouts: {}};
    D.openStore.types['ba:businesstype_lawfirm'] = t;
    D.openStore.market['ba:itemname_hourlylawyerfee'] = {p: 225, r: 1, d: 1, s: 1, opt: 3, cost: 0,
      hoods: {'ba:neighborhood_midtown': [0, 0, null]}};
    return osModel('ba:businesstype_lawfirm', {hood: 'ba:neighborhood_midtown', cap: 50, m2: 660, layout: 'K1', traffic: 0}, {sat: 100});
  });
  // Every hour brings more clients than the 50 computers: the day shift bills
  // 50 an hour, the 3 around the clock bill the rest.
  assert.equal(m.office, true);
  assert.equal(m.customers, (14 * 50 + 10 * 3) * 5 / 7 + (14 * 25 + 10 * 3) * 2 / 7);
  assert.equal(m.cogs, 0);
  assert.ok(m.wages > 0 && m.revenue > m.wages);
});

test('the loan amount: past the limit the field snaps to it, and 0 stays 0 across a redraw and a reload', async t => {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  const page = await board(t, {context});
  await planned(page);
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  await page.locator('#osFin [data-os-fin-on]').check();
  await page.locator('#osFin [data-os-bank="JensenCapitalSettings"]').click();
  const field = page.locator('#osFin [data-os-fin-amount]');
  const limit = await page.evaluate(() => Math.min(osLoanLimit(osFacts().finance.banks.find(b => b.id === 'JensenCapitalSettings')),
    Math.floor(osInvestment(osPlan(), osBuilding(osPlan().key)).firm)));
  await field.fill('9999999');
  assert.equal(+(await field.inputValue()), limit, 'the field says the loan the figures use');
  assert.ok((await page.locator('#osFinFacts').innerText()).includes('$' + limit.toLocaleString('en-US') + ' borrowed'));
  await field.fill('0');
  assert.equal(await page.evaluate(() => osPlan().finance.amount), 0);
  await page.locator('#osCtl [data-os-step="investment"]').click();
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  assert.equal(await page.locator('#osFin [data-os-fin-amount]').inputValue(), '0', 'a redraw keeps 0');
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  await page.evaluate(() => openRoute('expansion/open'));
  await page.waitForFunction(() => osStep === 'breakeven');
  assert.equal(await page.locator('#osFin [data-os-fin-amount]').inputValue(), '0', 'and so does a reload');
});

/* --- step 5: the checklist until opening ------------------------------------ */
const LINK = {writes: ['hire', 'uniforms', 'marketing'], character: 'PAYLOADco', company: 'Payload Co', approved: true, day: 47, hour: 14, minute: 30};
const rows = page => page.$$eval('#osBody .os-ck', rs => rs.map(r => ({state: r.className.replace('os-ck ', ''), title: r.querySelector('b').textContent,
  sub: r.querySelector('small').innerText.replace(/\s+/g, ' '), act: r.querySelector('.act').innerText.replace(/\s+/g, ' ').trim(), p: r.style.getPropertyValue('--p')})));
const until = async page => { await planned(page); await page.locator('#osCtl [data-os-step="opening"]').click(); };
const BEER = 'ba:itemname_beer', WHISKY = 'ba:itemname_whisky';
const line = slug => ({slug, item: slug, units: 400, rate: 20, tradeRate: 20, soldPerDay: 20, soldPerWeek: 140});
/* The business the save shows once the player has opened the plan's building. A shop that trades, with two products on its shelves. */
const opened = (page, patch = {}, built = null) => page.evaluate(({site, patch, built, lines}) => {
  D.businesses.push(Object.assign({}, D.businesses[0], {key: site, status: 'retail', name: 'Liquor', neighbourhood: 'ba:neighborhood_midtown', typeSlug: 'ba:businesstype_liquorstore', staff: 0, missingAmenities: [],
    amenities: {bathroom: true, interior: true, music: true, sink: true, toiletprivacy: true}, uniformGaps: [], uniformGapSkills: [], lines,
    marketing: 0, marketingIndex: 0, marketingOn: [], stationShifts: 0, revenue: 900, customers: 60, hasTraded: true}, patch));
  if(built) D.openStore.built[site] = built;
  drawOpenStore();
}, {site: SITE, patch, built, lines: [line(BEER), line(WHISKY)]});
const linked = (page, link = LINK) => page.evaluate(l => { SOURCE.link = () => l; drawOpenStore(); }, link);
/* A stock target above zero or a wholesale contract delivers these products into the plan's shop: supply.routed pairs, whatever it sells. */
const routed = (page, slugs) => page.evaluate(({site, slugs}) => { const i = D.businesses.findIndex(b => b.key === site);
  D.supply.routed = (D.supply.routed || []).concat(slugs.map(p => [i, p])); drawOpenStore(); }, {site: SITE, slugs});
/* Every product the plan's type sells that is not a service: what Logistics has to see delivered. */
const wanted = page => page.evaluate(() => { const M = osFacts().market || {}; return [...new Set((osType(osPlan().type).products || []).map(([p]) => p).filter(p => M[p] && !M[p].s))]; });
const FULL = {placed: 61, req: [['pointofsales', 1, 1], ['anyprimaryproduct', 1, 1]], seating: false};
const HIRES = {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', 'hire'], ['ba:skill_customerservice', 'hire'], ['ba:skill_customerservice', 'hire'], ['ba:skill_securityguard', null]]};
/* The hiring model stubbed as it would read with candidates for the plan's building. */
const hiring = (page, h = HIRES) => page.evaluate(({site, h}) => {
  window.hrModel = () => ({sites: [{key: site, planned: h.planned, variant: h.variant, site: h.site || {}, weeks: h.weeks.map(([skill, type]) => ({w: {skill}, who: type ? {type} : null}))}],
    moves: [], roles: [], overs: [], cands: [], byId: new Map(), used: new Set(), quick: []});
  drawOpenStore();
}, {site: SITE, h});
/* The real hrModel over the payload's hiring: the rival shop's own plan under the plan's key, and a candidate for every week of it. */
const realHiring = (page, {noHours = false, candidates = true, demand = false} = {}) => page.evaluate(({site, noHours, candidates, demand}) => {
  const base = D.hiring.sites.find(s => s.kind === 'shop' && s.plans.open && (s.plans.open.hireWeeks || []).length);
  const plans = noHours ? {} : demand ? {demand: {bench: [], fewer: [], hireWeeks: [], spare: [], spareSkills: {}}} : {open: base.plans.open};
  D.hiring.sites.unshift(Object.assign({}, base, {key: site, name: 'Liquor', new: !demand, plans}, noHours ? {noHours: true} : {}));
  D.candidates = candidates && !noHours && !demand ? base.plans.open.hireWeeks.map((w, i) => ({id: `cand${i}`, name: `Candidate ${i}`, wage: 12, hoursLeft: 40, skills: [{skill: w.skill, level: 70}], demands: []})) : [];
  drawOpenStore();
  return base.plans.open.hireWeeks.length;
}, {site: SITE, noHours, candidates, demand});
const spy = page => page.evaluate(() => { window.__writes = [];
  SOURCE.write = async (kind, body, o) => { window.__writes.push({kind, body, dryRun: o && o.dryRun}); return {body: {ok: true, skipped: [], rows: []}}; }; });

test('the Until opening step opens with a plan\'s building; Open stays for payback', async t => {
  const page = await board(t);
  await planned(page);
  assert.equal(await page.locator('#osCtl [data-os-step="opening"]').isDisabled(), false);
  await page.locator('#osCtl [data-os-step="opening"]').click();
  await page.waitForFunction(() => osStep === 'opening');
  assert.equal(await page.locator('#osCtl [data-os-step="open"]').isDisabled(), true);
  assert.match(await page.locator('#osCtl [data-os-step="open"]').getAttribute('data-tip'), /ayback/);
  assert.equal(await page.locator('#osBody .os-prog h2').textContent(), 'Until opening');
});

test('before the business exists every row is a to-do, and only logistics has a button', async t => {
  const page = await board(t);
  await until(page);
  const r = await rows(page);
  assert.deepEqual(r.map(x => [x.title, x.state]), [['Lease', 'todo'], ['Furniture', 'todo'], ['Staff for the opening hours', 'todo'],
    ['Uniforms', 'todo'], ['Customer demands', 'todo'], ['Marketing', 'todo'], ['Logistics', 'todo']]);
  assert.deepEqual(r.map(x => x.act), ['', '', '', '', '', '', 'Plan a factory']);
  assert.match(await page.locator('#osBody .os-prog').innerText(), /0 of 7/);
  await page.locator('#osBody [data-route="expansion/factory"], #osBody [data-os-route="expansion/factory"]').first().click();
  await page.waitForFunction(() => route === 'expansion/factory');
});

test('no row reads done before a business exists, whatever the type asks for', async t => {
  const page = await board(t);
  await until(page);
  const states = await page.evaluate(() => {
    const T = osFacts().types, plain = Object.keys(T).find(k => !T[k].demands.some(d => d[0] === 'employeeuniforms')), office = Object.keys(T).find(k => T[k].model === 'office');
    return [plain, office].filter(Boolean).map(type => { const plan = {type, key: 'ba:street_nowhere#1'}, uni = osCkUniforms(plan, null);
      return [type, uni.state, osCkDemands(plan, null, uni).state, osCkLogistics(plan, null).state, osCkStaff(plan, null).state, osCkMarketing(plan, null, null).state]; });
  });
  assert.ok(states.length >= 1);
  for (const s of states) assert.deepEqual(s.slice(1), ['todo', 'todo', 'todo', 'todo', 'todo'], s[0]);
});

test('the rows tick themselves from the save once a business stands at the address', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 3, marketingOn: ['smallinternet'], stationShifts: 5}, FULL);
  await hiring(page, {...HIRES, weeks: []});
  await routed(page, await wanted(page));
  const r = await rows(page);
  assert.deepEqual(r.map(x => x.state), ['done', 'done', 'done', 'done', 'done', 'done', 'done']);
  assert.match(await page.locator('#osBody .os-prog').innerText(), /7 of 7/);
});

test('a half-done store shows what is missing', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 2, stationShifts: 3, uniformGaps: ['Customer Service', 'Cleaning'], missingAmenities: ['ba:customerdemand_music'],
    amenities: {bathroom: true, interior: true, music: false, sink: false, toiletprivacy: true}},
    {placed: 3, req: [['anyprimaryproduct', 1, 0], ['pointofsales', 1, 1]], seating: false});
  await hiring(page);
  await routed(page, (await wanted(page)).slice(0, 1));
  const r = await rows(page);
  assert.equal(r[0].state, 'done');
  assert.equal(r[1].state, 'part');
  assert.equal(r[3].state, 'todo');
  assert.equal(r[4].state, 'part');
  assert.equal(r[6].state, 'part');
  assert.match(r[6].sub, /No delivery route or import for/);
});

test('staff never ticks without opening hours or verified cover', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 4, stationShifts: 5}, FULL);
  /* a shop the game opens no hour: the model has no plan for it */
  await hiring(page, {planned: true, variant: null, site: {noHours: true}, weeks: []});
  let r = await rows(page);
  assert.equal(r[2].state, 'todo');
  assert.match(r[2].sub, /No opening hours set yet/);
  /* a shop that has never traded, on a demand plan with no hire weeks */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.revenue = 0; b.customers = 0; b.hasTraded = false; });
  await hiring(page, {planned: true, variant: 'demand', weeks: []});
  r = await rows(page);
  assert.equal(r[2].state, 'todo');
  assert.match(r[2].sub, /sizes the staff once the shop has sales/);
  /* nobody hired and nothing to hire */
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).staff = 0; });
  await hiring(page, {...HIRES, weeks: []});
  assert.equal((await rows(page))[2].state, 'todo');
  /* the same shop once it trades and is covered */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.staff = 4; b.revenue = 900; b.customers = 60; b.hasTraded = true; });
  await hiring(page, {planned: true, variant: 'demand', weeks: []});
  assert.equal((await rows(page))[2].state, 'done');
});

test('staff needs hours on the schedule and nobody left without them, and "has traded" is the history, not the last day', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 4, stationShifts: 0}, FULL);
  await hiring(page, {...HIRES, weeks: []});
  let r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, /4 people on staff · no hours scheduled yet/);
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).stationShifts = 6; });
  await hiring(page, {...HIRES, weeks: []});
  assert.equal((await rows(page))[2].state, 'done');
  /* people assigned to the shop with no hours in the plan mode it uses: its own text, not "no hours scheduled yet" */
  const gap = {hours: 12, roles: [{skill: 'ba:skill_cleaning', idle: 1}]};
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'shop', unstaffed: {demand: gap}}});
  r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, /4 on staff · 1 person has no hours/);
  assert.doesNotMatch(r.sub, /scheduled yet/);
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'shop', unstaffed: {demand: {hours: 3, roles: [{skill: 'ba:skill_cleaning', idle: 2}, {skill: 'ba:skill_securityguard', idle: 1}]}}}});
  assert.match((await rows(page))[2].sub, /3 people have no hours/);
  /* a gap in the plan mode the site does not use blocks nothing: the shop is on the demand plan, the gap is the full one */
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'shop', unstaffed: {full: gap}}});
  assert.equal((await rows(page))[2].state, 'done');
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'office', unstaffed: {office: gap}}});
  assert.match((await rows(page))[2].sub, /1 person has no hours/);
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'office', unstaffed: {demand: gap}}});
  assert.equal((await rows(page))[2].state, 'done');
  /* a night-time shop whose last statement is empty has still traded */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); Object.assign(b, {revenue: 0, customers: 0, hasTraded: true}); });
  await hiring(page, {planned: true, variant: 'demand', weeks: []});
  assert.equal((await rows(page))[2].state, 'done');
});

test('through the real hiring model: no hours stays a to-do, and hires are counted from the payload', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 0, stationShifts: 0}, FULL);
  await realHiring(page, {noHours: true});
  assert.equal((await rows(page))[2].state, 'todo');
  assert.match((await rows(page))[2].sub, /No opening hours set yet/);
  await page.evaluate(() => { D.hiring.sites = D.hiring.sites.filter(s => s.key !== osPlan().key); });
  const weeks = await realHiring(page);
  await linked(page);
  const staff = (await rows(page))[2];
  assert.equal(staff.state, 'todo');
  assert.match(staff.act, new RegExp(`Hire ${weeks}`));
});

test('Hire opens the review for this site only, through hrReview and hrRequest', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2}, FULL);
  const weeks = await realHiring(page);
  await linked(page);
  await spy(page);
  await page.locator('#osBody [data-os-write="hire"]').click();
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.waitFor();
  await page.waitForFunction(() => window.__writes.length > 0);
  const sent = await page.evaluate(() => window.__writes[0]);
  assert.equal(sent.kind, 'hire');
  assert.equal(sent.dryRun, true);
  assert.equal(sent.body.hires.length, weeks);
  assert.deepEqual([...new Set(sent.body.hires.map(h => h.address.street + '#' + h.address.number))], ['ba:street_broadwaystreet#9']);
  assert.deepEqual(sent.body.sites.map(s => s.address), [{street: 'ba:street_broadwaystreet', number: 9}]);
  assert.match(await dlg.innerText(), /1 site\b/);
  assert.equal(await dlg.locator('.hr-dsite').count(), 1);
});

test('the Hire button sends hrReview the plan\'s site and the counts, and Assign uniforms sends gwUniforms the key', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2, uniformGaps: ['Customer Service']}, FULL);
  await hiring(page);
  await linked(page);
  await page.evaluate(() => { window.__calls = []; window.hrReview = o => window.__calls.push(['hire', o]); window.gwUniforms = k => window.__calls.push(['uniforms', k]); });
  await page.locator('#osBody [data-os-write="hire"]').click();
  await page.locator('#osBody [data-os-write="uniforms"]').click();
  const calls = await page.evaluate(() => window.__calls);
  assert.deepEqual(calls[0], ['hire', {site: SITE, only: {[SITE + '|ba:skill_cleaning']: 1, [SITE + '|ba:skill_customerservice']: 2}}]);
  assert.deepEqual(calls[1], ['uniforms', [SITE]]);
});

test('weeks filled by moving people offer the full staff review, or a way to do it in the game', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2}, FULL);
  const moveHires = {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', 'move'], ['ba:skill_customerservice', 'hire']]};
  await hiring(page, moveHires);
  assert.match((await rows(page))[2].act, /move the hiring here|Move .* in the game|move 1 Cleaning/i);
  await linked(page);
  assert.equal(await page.locator('#osBody [data-os-write="hire"]').getAttribute('data-os-only'), null);
  assert.equal((await page.locator('#osBody [data-os-write="hire"]').innerText()).trim(), 'Hire 1 · move 1');
  await page.evaluate(() => { window.__calls = []; window.hrReview = o => window.__calls.push(o); });
  await page.locator('#osBody [data-os-write="hire"]').click();
  assert.deepEqual(await page.evaluate(() => window.__calls), [{site: SITE}]);
});

test('nobody to hire says to ask a headhunter', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2}, FULL);
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', null], ['ba:skill_customerservice', null]]});
  await linked(page);
  const staff = (await rows(page))[2];
  assert.match(staff.act, /headhunter/);
  assert.equal(await page.locator('#osBody [data-os-write="hire"]').count(), 0);
});

test('without the game link every write is an instruction in the game, under a link strip', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2, uniformGaps: ['Customer Service']}, FULL);
  await hiring(page);
  assert.equal(await page.locator('#osBody [data-os-write]').count(), 0);
  assert.equal(await page.locator('#osBody .os-ck .os-ingame').count(), 3);
  assert.match(await page.locator('#osBody .os-gate').innerText(), /Link the game and these become buttons\./);
  assert.equal(await page.locator('#osBody [data-os-howlink]').count(), 1);
});

test('How to link opens the game link\'s page, and says where to look when the footer link is missing', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1}, FULL);
  await page.evaluate(() => { const a = document.querySelector('a[data-visit-feature="game-link"]'); if(a) a.remove(); });
  await page.locator('#osBody [data-os-howlink]').click();
  assert.match(await page.locator('#osBody .os-gate').innerText(), /Steam Workshop/);
});

test('with the game link the same rows carry buttons', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2, uniformGaps: ['Customer Service']}, FULL);
  await hiring(page);
  await linked(page);
  assert.equal(await page.locator('#osBody .os-ck .os-ingame').count(), 0);
  assert.equal(await page.locator('#osBody .os-gate').count(), 0);
  assert.deepEqual(await page.$$eval('#osBody [data-os-write]', bs => bs.map(b => [b.dataset.osWrite, b.innerText.trim()])),
    [['hire', 'Hire 3'], ['uniforms', 'Assign uniforms'], ['marketing', 'Set up marketing']]);
});

test('a write the mod lacks turns only its own button into the instruction', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2, uniformGaps: ['Customer Service']}, FULL);
  await hiring(page);
  await linked(page, {...LINK, writes: ['hire', 'uniforms']});
  assert.deepEqual(await page.$$eval('#osBody [data-os-write]', bs => bs.map(b => b.dataset.osWrite)), ['hire', 'uniforms']);
  assert.equal(await page.locator('#osBody .os-ck .os-ingame').count(), 1);
  assert.equal(await page.locator('#osBody .os-gate').count(), 0);
});

test('uniforms wait for hours: staff with no station shifts is a to-do, and only shifts and no gaps make it done', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 3, stationShifts: 0}, FULL);
  let r = await rows(page);
  assert.equal(r[3].state, 'todo');
  assert.match(r[3].sub, /Set once staff have hours/);
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).stationShifts = 4; drawOpenStore(); });
  assert.equal((await rows(page))[3].state, 'done');
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).staff = 0; drawOpenStore(); });
  assert.equal((await rows(page))[3].state, 'todo');
});

test('a coffee shop without chairs does not meet its seating demand; a gym\'s workout variety is checked in the game', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 2, stationShifts: 3}, FULL);
  const out = await page.evaluate(() => {
    const T = osFacts().types, key = osPlan().key, opened = osOpenedAt(osPlan());
    const seat = Object.keys(T).find(k => T[k].demands.some(d => d[0] === 'seating')), gym = Object.keys(T).find(k => T[k].demands.some(d => d[0] === 'workoutvariety'));
    const ask = (type, built) => { D.openStore.built[key] = built; const plan = {type, key}; const uni = osCkUniforms(plan, opened); const r = osCkDemands(plan, opened, uni); return {state: r.state, sub: r.sub.replace(/<[^>]+>/g, ''), act: r.act.replace(/<[^>]+>/g, '')}; };
    const met = {bathroom: true, interior: true, music: true, sink: true, toiletprivacy: true};
    Object.assign(opened, {amenities: met, missingAmenities: [], uniformGaps: []});
    return {seat: seat && [ask(seat, {placed: 9, req: [], seating: false}), ask(seat, {placed: 9, req: [], seating: true})], gym: gym && ask(gym, {placed: 9, req: [], seating: true})};
  });
  assert.ok(out.seat, 'a type asks for seating');
  assert.notEqual(out.seat[0].state, 'done');
  assert.match(out.seat[0].sub, /missing .*Seating/);
  assert.match(out.seat[1].sub, /^(All )?\d+ of \d+ met|demands? met/);
  assert.ok(out.gym, 'a type asks for workout variety');
  assert.notEqual(out.gym.state, 'done');
  assert.match(out.gym.sub, /Workout variety/);
  assert.match(out.gym.act, /Check Workout variety in the game/);
});

test('an office needs no deliveries, before opening too and with no factory button', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 1}, FULL);
  const out = await page.evaluate(() => { const T = osFacts().types, type = 'ba:businesstype_testoffice', b = osOpenedAt(osPlan());
    T[type] = {cat: 'office', model: 'office', products: [], demands: []};
    const ask = (plan, biz) => { const r = osCkLogistics(plan, biz); return {state: r.state, sub: r.sub.replace(/<[^>]+>/g, ''), ok: /class="ok"/.test(r.sub), act: r.act}; };
    return {opened: ask({type, key: b.key}, b), vacant: ask({type, key: 'ba:street_nowhere#1'}, null)}; });
  assert.equal(out.opened.state, 'done');
  assert.match(out.opened.sub, /No deliveries needed/);
  assert.equal(out.vacant.state, 'todo');
  assert.match(out.vacant.sub, /No deliveries needed/);
  assert.ok(!out.vacant.ok, 'a to-do row has no green text');
  assert.ok(out.opened.ok, 'an opened office says it in green');
  assert.equal(out.vacant.act, '');
});

test('a shop needs a route for every product it sells, from a stock target or a wholesale contract, not a supply status', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 1}, FULL);
  const all = await wanted(page);
  assert.ok(all.length >= 2, 'the type sells several products');
  /* a shop whose products are only "covered" in the supply facts has no route */
  await page.evaluate(() => { D.supply.facts[D.businesses.length - 1] = {'ba:itemname_beer': {st: 'covered'}, 'ba:itemname_whisky': {st: 'covered'}}; drawOpenStore(); });
  let r = (await rows(page))[6];
  assert.equal(r.state, 'todo');
  assert.match(r.act, /Plan a factory/);
  /* a product the shop stocks but has not sold yet counts as much as one it sells: the pairs are not tied to sales rows */
  await routed(page, [all[0]]);
  r = (await rows(page))[6];
  assert.equal(r.state, 'part');
  assert.match(r.sub, /No delivery route or import for/);
  await routed(page, all.slice(1));
  assert.equal((await rows(page))[6].state, 'done');
});

test('a product with a zero stock target is not routed, and nothing in D.supply.routed for it means no delivery', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 1}, FULL);
  const all = await wanted(page);
  await routed(page, all.slice(1));
  const r = (await rows(page))[6];
  assert.equal(r.state, 'part');
  assert.ok(r.sub.includes(await page.evaluate(p => itemName(p), all[0])), r.sub);
  assert.match(r.act, /Plan a factory/);
});

test('a link on the graph is not a route: only a stock target or a wholesale contract is', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 1}, FULL);
  const all = await wanted(page);
  await page.evaluate(({site, slugs}) => { D.supply.graph.links.push({from: 'import:ba:street_pier#1', to: site, slugs, cadence: 'daily', paused: false}); drawOpenStore(); }, {site: SITE, slugs: all});
  assert.equal((await rows(page))[6].state, 'todo');
});

test('a different business at the address is named, and the rows wait for the planned one', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 3, typeSlug: 'ba:businesstype_bakery', type: 'Bakery', stationShifts: 2}, FULL);
  const r = await rows(page);
  assert.equal(r[0].state, 'todo');
  assert.match(r[0].sub, /^Rented · /);
  assert.deepEqual(r.slice(1).map(x => x.state), ['todo', 'todo', 'todo', 'todo', 'todo', 'todo']);
  assert.match(await page.locator('#osBody').innerText(), /is a Bakery, not the .* you planned/);
});

test('a rented address with nothing opened there yet leaves the lease a to-do', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {status: 'vacant', staff: 0});
  const r = await rows(page);
  assert.equal(r[0].state, 'todo');
  assert.match(r[0].sub, /^Rented · .*nothing opened there yet/);
  assert.match(await page.locator('#osBody .os-prog').innerText(), /0 of 7/);
  /* once a business of the planned type stands there, the lease ticks */
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).status = 'retail'; drawOpenStore(); });
  assert.equal((await rows(page))[0].state, 'done');
});

test('"Pick N more" after a partial hire keeps the site the review was scoped to', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2}, FULL);
  await realHiring(page);
  await linked(page);
  await spy(page);
  await page.locator('#osBody [data-os-write="hire"]').click();
  await page.locator('dialog.gw-dlg').waitFor();
  assert.equal(await page.evaluate(() => hrLast.site), SITE);
  const calls = await page.evaluate(() => {
    window.__more = [];
    window.hrReview = o => window.__more.push(o);
    bindHireReview();
    hrUi.more = {only: {[`${osPlan().key}|ba:skill_cleaning`]: 1}, board: {}, site: osPlan().key};
    const b = document.createElement('button'); b.setAttribute('data-hr-more', ''); document.body.append(b); b.click();
    return window.__more;
  });
  assert.deepEqual(calls, [{only: {[`${SITE}|ba:skill_cleaning`]: 1}, site: SITE}]);
});

test('Set up marketing previews first, sends the running campaigns as `was` and explains a refusal', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, marketingOn: []}, FULL);
  await linked(page);
  await page.evaluate(() => { window.__writes = [];
    SOURCE.write = async (kind, body, o) => { window.__writes.push({kind, body, dryRun: o && o.dryRun});
      return {body: {ok: false, rows: [{error: 'no_contact', agency: {name: 'CityAds', address: {street: 'ba:street_secondavenue', number: 5}}, opens: null, address: body.sites[0].address}]}}; }; });
  await page.locator('#osBody [data-os-write="marketing"]').click();
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.waitFor();
  const sent = await page.evaluate(() => window.__writes[0]);
  assert.equal(sent.kind, 'marketing');
  assert.equal(sent.dryRun, true);
  assert.deepEqual(sent.body.expect, {character: 'PAYLOADco', company: 'Payload Co'});
  assert.deepEqual(sent.body.sites[0].address, {street: 'ba:street_broadwaystreet', number: 9});
  assert.deepEqual(sent.body.sites[0].was, []);
  assert.ok(sent.body.sites[0].on.length && sent.body.sites[0].on.every(x => /^(Small|Medium|Large)(Internet|Billboard)$/.test(x)));
  assert.match(await dlg.innerText(), /not in your phone yet/);
});

test('the marketing write sends the enabled campaigns as `was`, and no expect without a character and company', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, marketingOn: ['smallbillboard']}, FULL);
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.marketingOn = []; });
  await linked(page, {...LINK, character: null, company: null});
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.marketingOn = ['smallbillboard']; window.__writes = [];
    SOURCE.write = async (kind, body, o) => { window.__writes.push({kind, body, dryRun: o && o.dryRun}); return {body: {ok: true, rows: [{turnedOn: [], on: [], address: body.sites[0].address}]}}; };
    osMarketingWrite(osPlan()); });
  await page.locator('dialog.gw-dlg').waitFor();
  const sent = await page.evaluate(() => window.__writes[0]);
  assert.equal('expect' in sent.body, false);
  assert.deepEqual(sent.body.sites[0].was, ['SmallBillboard']);
});

test('a running campaign, from the save\'s enabled set, leaves the marketing row done with no button', async t => {
  const page = await board(t);
  await until(page);
  await linked(page);
  await opened(page, {staff: 1, marketing: 0, marketingOn: ['mediuminternet']}, FULL);
  const r = await rows(page);
  assert.equal(r[5].state, 'done');
  assert.equal(r[5].act, '');
  /* money spent last week is no proof: with no campaign enabled the row is a to-do */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.marketingOn = []; b.marketing = 350; b.marketingIndex = 20; drawOpenStore(); });
  assert.equal((await rows(page))[5].state, 'todo');
});

test('an unmet hairdresser shelf is named in words, not by its id', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 1}, {placed: 20, req: [['shelfwithhaircareproducts', 1, 0]], seating: false});
  const r = (await rows(page))[1];
  assert.match(r.sub, /missing A shelf with hair-care products on it/);
  assert.doesNotMatch(r.sub, /Shelfwithhaircareproducts/i);
});
