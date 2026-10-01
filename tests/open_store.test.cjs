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
const {en, enRe, enText: textEn, textRe} = require('./_i18n.cjs');
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
  assert.match(s[0], new RegExp('Liquor Store ' + textRe('gr.os.strip.demand', {hood: 'Midtown', n: 68}).source));
  assert.match(s[1], textRe('gr.os.strip.nowhere', {}, {}));
  // The finder is fixed to the plan's type, Midtown only, and lists the building.
  await page.locator('#osFinderMap .place.fr').first().waitFor();
  assert.equal(await page.locator('#osFinderMap .fplan-type').textContent(), 'Liquor Store');
  assert.deepEqual(await page.$$eval('#osFinderMap .place.fr', r => r.map(x => x.dataset.pick)), [SITE]);
  // The way back is Demand.
  assert.match(await page.locator('#arrive').innerText(), textRe('gr.arrive.cell', {type: 'Liquor Store', hood: 'Midtown'}, {}));
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
  assert.deepEqual(groups.filter(g => g !== en('gr.os.grp.dem') && g !== en('gr.os.grp.cap')),
    [en('gr.os.inv.firm'), en('gr.os.grp.req'), en('gr.os.grp.shelf'), en('gr.os.inv.deposit')]);
  assert.ok(groups.includes(en('gr.os.grp.dem')), 'a liquor store asks for music, uniforms and a toilet');
  // Midtown asks for an interior score: the firm lays the walls and floors free.
  assert.match(await page.locator('#osBody .os-inv td.free').locator('xpath=..').innerText(), textRe('gr.os.inv.walls.met', {hood: 'Midtown', n: 50}, {}));
  assert.equal(money(await page.locator('#osBody .os-inv tfoot td').last().textContent()), Math.round(inv.firm));
  assert.equal(money((await strip(page))[2]), Math.round(inv.firm));
  assert.deepEqual((await steps(page)).map(s => s[1]), ['done', 'done', 'on', '', '', '']);
  // Self-installation: the items by store, a delivery each, the walls and floors Midtown asks for, the deposit.
  await page.locator('#osBody [data-os-mode="self"]').click();
  const cards = page.locator('#osBody .os-store');
  assert.ok(await cards.count() >= 3);
  assert.match(await page.locator('#osBody .os-store', {hasText: en('gr.os.inv.walls')}).innerText(), textRe('gr.os.self.walls.sub', {hood: 'Midtown', n: 50}, {}));
  assert.equal(money(await page.locator('#osBody .os-total b').textContent()), Math.round(inv.self));
  assert.equal(inv.self, inv.furniture + inv.delivery + inv.decor + b.deposit);
  assert.match((await strip(page))[2], textRe('gr.os.strip.self', {}, {}));
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
  assert.match(big[0], textRe('gr.os.inv.firm', {}, {flags: 'i'}));
  assert.match(big[1], textRe('gr.os.inv.self', {}, {flags: 'i'}));
  assert.equal(await page.locator('#osBody svg.os-chart').count(), 1);
  const notes = await page.locator('#osBody .os-note').allInnerTexts();
  assert.match(notes[0], textRe('gr.os.be.mid', {}, {anchor: 'full'}));
  // The range behind the single figure is on hover.
  assert.match(await page.locator('#osBody .os-note .os-rng').first().getAttribute('data-tip'), /^\$[\d,]+–\$[\d,]+$/);
  assert.match(notes[1], textRe('gr.os.be.tax', {n: 5}, {anchor: 'full'}));
  // After tax is the shown figure (the range's middle) less the tax, not the top of the range.
  const taxed = await page.evaluate(() => { const plan = osPlan(), est = osEstimate(plan, osBuilding(plan.key));
    return fmt(est.profit * OS_MID * (1 - osFacts().game.tax / 100)); });
  assert.equal(notes[1], textEn('gr.os.be.tax', {n: 5, w: taxed}));
  assert.equal(await page.locator('#osBody .os-ownc h3').innerText(), en('gr.os.own.title', {n: 1}));
  // The player's own liquor store against the same rules, as a line and its own card.
  assert.ok(notes.some(n => textRe('gr.os.be.own', {n: 1}, {}).test(n)), notes.join('\n'));
  assert.equal(await page.locator('#osBody .os-ownc .os-site').count(), 1);
  // Financing: off until asked for; then the amount moves only the figures.
  assert.match(await page.locator('#osFin').innerText(), textRe('gr.os.fin.off', {}, {}));
  await page.locator('#osFin [data-os-fin-on]').check();
  const facts = page.locator('#osFinFacts > div');
  assert.equal(await facts.count(), 4);
  await page.locator('#osFin [data-os-fin-amount]').fill('20000');
  await page.waitForFunction(() => osPlan().finance.amount === 20000);
  const loan = await page.evaluate(() => { const bank = osFacts().finance.banks.find(b => b.id === 'VantanderBankSettings');
    return osLoan(20000, bank); });
  // Flat interest, floor(20,000 x 12% x 0.7 / 100 / 60) = 28 a day; 83 repaid over 241 days.
  assert.deepEqual([loan.interest, loan.repay, loan.days], [28, 83, 241]);
  assert.match(await facts.nth(1).innerText(), new RegExp("\\$111[\\s\\S]*" + textRe('gr.os.fin.daily.sub', {r: '$83', i: '$28'}).source));
  assert.match(await facts.nth(2).innerText(), new RegExp([textRe('gr.os.fin.interest.early', {n: 241}).source, textRe('gr.os.fin.interest.term', {n: 241}).source].join('|')));
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
  assert.ok((await page.locator('#osFinFacts').innerText()).includes(en('gr.os.fin.upfront.sub', {w: '$' + limit.toLocaleString('en-US')})));
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
/* The site's cheapest mix as _marketing() sends it (marketingPlan): one campaign to switch on, from no agency the board waits on. */
const MKPLAN = {on: ['SmallInternet'], was: [], costNow: 0, costPlan: 100, marketingNow: 0, marketingPlan: 40, promotionNow: 60, promotionPlan: 100,
  visit: [], visitRaises: false, agencies: [], setupTypes: [], setupAgencies: [], needsSetup: false};
const running = type => [{type, agency: 'ba:street_secondavenue#5', enabled: true}];
const LINK = {writes: ['hire', 'uniforms', 'marketing'], character: 'PAYLOADco', company: 'Payload Co', approved: true, day: 47, hour: 14, minute: 30};
const rows = page => page.$$eval('#osBody .os-ck', rs => rs.map(r => ({state: r.className.replace('os-ck ', ''), title: r.querySelector('b').textContent,
  sub: r.querySelector('small').innerText.replace(/\s+/g, ' '), act: r.querySelector('.act').innerText.replace(/\s+/g, ' ').trim(), p: r.style.getPropertyValue('--p')})));
const until = async page => { await planned(page); await page.locator('#osCtl [data-os-step="opening"]').click(); };
const BEER = 'ba:itemname_beer', WHISKY = 'ba:itemname_whisky';
const line = slug => ({slug, item: slug, units: 400, rate: 20, tradeRate: 20, soldPerDay: 20, soldPerWeek: 140});
/* The business the save shows once the player has opened the plan's building. A shop that trades, with two products on its shelves. */
const opened = (page, patch = {}, built = null) => page.evaluate(({site, patch, built, lines, mk}) => {
  D.businesses.push(Object.assign({}, D.businesses[0], {key: site, status: 'retail', name: 'Liquor', neighbourhood: 'ba:neighborhood_midtown', typeSlug: 'ba:businesstype_liquorstore', staff: 0, missingAmenities: [],
    amenities: {bathroom: true, interior: true, music: true, sink: true, toiletprivacy: true}, uniformGaps: [], uniformGapSkills: [], lines,
    marketing: 0, marketingIndex: 0, campaigns: [], marketingPlan: mk, staffIdle: [], stationShifts: 0, revenue: 900, customers: 60, hasTraded: true}, patch));
  if(built) D.openStore.built[site] = built;
  drawOpenStore();
}, {site: SITE, patch, built, lines: [line(BEER), line(WHISKY)], mk: MKPLAN});
const linked = (page, link = LINK) => page.evaluate(l => { SOURCE.link = () => l; drawOpenStore(); }, link);
/* A stock target above zero or a wholesale contract delivers these products into the plan's shop: supply.routed pairs, whatever it sells. */
const routed = (page, slugs) => page.evaluate(({site, slugs}) => { const i = D.businesses.findIndex(b => b.key === site);
  D.supply.routed = (D.supply.routed || []).concat(slugs.map(p => [i, p])); drawOpenStore(); }, {site: SITE, slugs});
/* Every product the plan's type sells that is not a service: what Logistics has to see delivered. */
const wanted = page => page.evaluate(() => { const M = osFacts().market || {}; return [...new Set((osType(osPlan().type).products || []).map(([p]) => p).filter(p => M[p] && !M[p].s))]; });
const FULL = {placed: 61, req: [['pointofsales', 1, 1], ['anyprimaryproduct', 1, 1]], seating: false};
const HIRES = {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', 'hire'], ['ba:skill_customerservice', 'hire'], ['ba:skill_customerservice', 'hire'], ['ba:skill_securityguard', null]]};
/* The hiring model stubbed as it would read with candidates for the plan's building. */
/* A week is [skill, who, w]: who is 'hire', 'move', or null (open; an unticked reassign leaves it so, as hrModel() builds it); w adds to the week
   (a short one: {band: 'short', hours: 6}). `work` is what Staff this site would do there (osStaffWork()), by default its hires and moves. */
/* main's six-hour remainder (tests/staff_hire.test.cjs): one day of 6 h, band "short" */
const SHORT6 = {band: 'short', hours: 6, days: 1, slots: [{d: 2, f: 8, t: 14}]};
const hiring = (page, h = HIRES) => page.evaluate(({site, h}) => {
  const weeks = h.weeks.map(([skill, type, w]) => ({w: Object.assign({skill, hours: 40, band: 'full'}, w || {}),
    who: type ? {type, m: {off: false}} : null}));
  const S = {key: site, planned: h.planned, variant: h.variant, site: h.site || {}, weeks};
  /* `bench`: that many unassigned people the plan counts on, moves with no week (fixed), as hrModel() builds them */
  const moves = Array.from({length: h.bench || 0}, (_, i) => ({id: `BENCH${i}`, from: null, to: S, week: null, skill: null, fixed: true}));
  window.hrModel = () => ({sites: [S], moves, roles: [], overs: [], cands: [], byId: new Map(), used: new Set(), quick: []});
  hrSiteMemo = null;
  window.osStaffWork = () => h.work ?? weeks.filter(x => x.who && !x.who.m.off).length;
  drawOpenStore();
}, {site: SITE, h});
/* The real hrModel over the payload's hiring: the rival shop's own plan under the plan's key, and a candidate for every week of it. */
const realHiring = (page, {noHours = false, candidates = true, demand = false} = {}) => page.evaluate(({site, noHours, candidates, demand}) => {
  const base = D.hiring.sites.find(s => s.kind === 'shop' && s.plans.open && (s.plans.open.hireWeeks || []).length);
  const plans = noHours ? {} : demand ? {demand: {bench: [], fewer: [], hireWeeks: [], spare: [], spareSkills: {}}} : {open: base.plans.open};
  D.hiring.sites.unshift(Object.assign({}, base, {key: site, name: 'Liquor', new: !demand, plans}, noHours ? {noHours: true} : {}));
  D.candidates = candidates && !noHours && !demand ? base.plans.open.hireWeeks.map((w, i) => ({id: `cand${i}`, name: `Candidate ${i}`, wage: 12, hoursLeft: 40, skills: [{skill: w.skill, level: 70}], demands: []})) : [];
  hrSiteMemo = null;
  drawOpenStore();
  return base.plans.open.hireWeeks.length;
}, {site: SITE, noHours, candidates, demand});
const spy = page => page.evaluate(() => { window.__writes = [];
  SOURCE.write = async (kind, body, o) => { window.__writes.push({kind, body, dryRun: o && o.dryRun}); return {body: {ok: true, skipped: [], rows: []}}; }; });

test('a redraw of every page (a language switch) keeps Plan a factory\'s Ingredients off Open a store', async t => {
  const page = await board(t);
  await planned(page);
  /* A type with a product a factory line can make, so Plan a factory shows Ingredients. */
  const made = await page.evaluate(() => { indexPlan(); return planTypes().find(k => D.plan.catalogue[k].products.some(p => RECIPE_BY[p])) || null; });
  assert.ok(made, 'the fixture plans something to make');
  await page.evaluate(k => { planType = k; planCounts = {}; openRoute('expansion/factory'); renderCalm(false); }, made);
  const onFactory = await page.evaluate(() => $('secIngredients').hidden);
  assert.equal(onFactory, false, 'Plan a factory has ingredients to show here');
  await page.evaluate(() => openRoute('expansion/open'));
  await page.evaluate(() => renderCalm(false));
  assert.equal(await page.evaluate(() => route), 'expansion/open');
  assert.equal(await page.locator('#secIngredients').isVisible(), false);
  await page.evaluate(() => openRoute('expansion/factory'));
  await page.evaluate(() => renderCalm(false));
  assert.equal(await page.evaluate(() => $('secIngredients').hidden), onFactory, 'Plan a factory shows it as before');
});

test('the Until opening step opens with a plan\'s building; Open stays for payback', async t => {
  const page = await board(t);
  await planned(page);
  assert.equal(await page.locator('#osCtl [data-os-step="opening"]').isDisabled(), false);
  await page.locator('#osCtl [data-os-step="opening"]').click();
  await page.waitForFunction(() => osStep === 'opening');
  assert.equal(await page.locator('#osCtl [data-os-step="open"]').isDisabled(), true);
  assert.match(await page.locator('#osCtl [data-os-step="open"]').getAttribute('data-tip'), textRe('gr.os.step.payback', {}, {}));
  assert.equal(await page.locator('#osBody .os-prog h2').textContent(), en('gr.os.ck.title'));
});

test('before the business exists every row is a to-do, and only logistics has a button', async t => {
  const page = await board(t);
  await until(page);
  const r = await rows(page);
  assert.deepEqual(r.map(x => [x.title, x.state]), [[en('gr.os.ck.lease'), 'todo'], [en('gr.os.ck.furn'), 'todo'], [en('gr.os.ck.staff'), 'todo'],
    [en('gr.os.ck.uni'), 'todo'], [en('gr.os.ck.dem'), 'todo'], [en('gr.os.ck.mk'), 'todo'], [en('gr.os.ck.log'), 'todo']]);
  assert.deepEqual(r.map(x => x.act), ['', '', '', '', '', '', en('gr.os.ck.log.go')]);
  assert.match(await page.locator('#osBody .os-prog').innerText(), textRe('gr.os.ck.count', {n: 0, of: 7}, {}));
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
  await opened(page, {staff: 3, campaigns: running('SmallInternet'), stationShifts: 5}, FULL);
  await hiring(page, {...HIRES, weeks: []});
  await routed(page, await wanted(page));
  const r = await rows(page);
  assert.deepEqual(r.map(x => x.state), ['done', 'done', 'done', 'done', 'done', 'done', 'done']);
  assert.match(await page.locator('#osBody .os-prog').innerText(), textRe('gr.os.ck.count', {n: 7, of: 7}, {}));
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
  assert.match(r[6].sub, textRe('gr.os.ck.log.part', {}, {}));
});

test('staff never ticks without opening hours or verified cover', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 4, stationShifts: 5}, FULL);
  /* a shop the game opens no hour: the model has no plan for it */
  await hiring(page, {planned: true, variant: null, site: {noHours: true}, weeks: []});
  let r = await rows(page);
  assert.equal(r[2].state, 'todo');
  assert.match(r[2].sub, textRe('gr.os.ck.staff.nohours', {}, {}));
  /* a shop that has never traded, on a demand plan with no hire weeks */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.revenue = 0; b.customers = 0; b.hasTraded = false; });
  await hiring(page, {planned: true, variant: 'demand', weeks: []});
  r = await rows(page);
  assert.equal(r[2].state, 'todo');
  assert.match(r[2].sub, textRe('gr.os.ck.staff.unsized', {}, {}));
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
  assert.match(r.sub, textRe('gr.os.ck.staff.idle', {n: 4}, {}));
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).stationShifts = 6; });
  await hiring(page, {...HIRES, weeks: []});
  assert.equal((await rows(page))[2].state, 'done');
  /* people assigned to the shop with no hours in the plan mode it uses: its own text, not "no hours scheduled yet" */
  const gap = {hours: 12, roles: [{skill: 'ba:skill_cleaning', idle: 1}]};
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'shop', unstaffed: {demand: gap}}});
  r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, textRe('gr.os.ck.staff.nohours2', {have: 4, n: 1}, {}));
  assert.doesNotMatch(r.sub, textRe('gr.os.ck.staff.idle', {}, {}));
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'shop', unstaffed: {demand: {hours: 3, roles: [{skill: 'ba:skill_cleaning', idle: 2}, {skill: 'ba:skill_securityguard', idle: 1}]}}}});
  assert.match((await rows(page))[2].sub, textRe('gr.os.ck.staff.nohours2', {n: 3}, {}));
  /* a gap in the plan mode the site does not use blocks nothing: the shop is on the demand plan, the gap is the full one */
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'shop', unstaffed: {full: gap}}});
  assert.equal((await rows(page))[2].state, 'done');
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'office', unstaffed: {office: gap}}});
  assert.match((await rows(page))[2].sub, textRe('gr.os.ck.staff.nohours2', {n: 1}, {}));
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
  assert.match((await rows(page))[2].sub, textRe('gr.os.ck.staff.nohours', {}, {}));
  await page.evaluate(() => { D.hiring.sites = D.hiring.sites.filter(s => s.key !== osPlan().key); });
  const weeks = await realHiring(page);
  await linked(page);
  const staff = (await rows(page))[2];
  assert.equal(staff.state, 'todo');
  assert.match(staff.act, enRe('sp.gw.staff'));
  /* The button is the site panel's Staff this site: the same count of people it hires here. */
  assert.equal(await page.evaluate(k => hrSitePeople(k), SITE), weeks);
});

test('Staff this site opens the Staff page\'s review for this site only, through hrReview and hrRequest', async t => {
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
  assert.match(await dlg.locator('h2').innerText(), textRe('co.hire.title.site', {}, {anchor: 'start'}));
  assert.deepEqual(await page.evaluate(() => hrLast.o), {scope: 'site', site: SITE});
  assert.equal(await dlg.locator('.hr-dsite').count(), 1);
});

test('Staff this site sends hrReview the plan\'s site, and Assign uniforms sends gwUniforms the key', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2, uniformGaps: ['Customer Service']}, FULL);
  await hiring(page);
  await linked(page);
  await page.evaluate(() => { window.__calls = []; window.hrReview = o => window.__calls.push(['hire', o]); window.gwUniforms = k => window.__calls.push(['uniforms', k]); });
  await page.locator('#osBody [data-os-write="hire"]').click();
  await page.locator('#osBody [data-os-write="uniforms"]').click();
  const calls = await page.evaluate(() => window.__calls);
  assert.deepEqual(calls[0], ['hire', {scope: 'site', site: SITE}]);
  assert.deepEqual(calls[1], ['uniforms', [SITE]]);
});

test('weeks filled by moving people offer the full staff review, or a way to do it in the game', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2}, FULL);
  const moveHires = {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', 'move'], ['ba:skill_customerservice', 'hire']]};
  await hiring(page, moveHires);
  assert.match((await rows(page))[2].act, new RegExp([textRe('gr.os.ck.staff.ingame.move', {moves: '1 Cleaning'}).source,
    textRe('gr.os.ck.staff.ingame.mixed', {moves: '1 Cleaning'}).source].join('|'), 'i'));
  await linked(page);
  assert.equal((await page.locator('#osBody [data-os-write="hire"]').innerText()).trim(), en('sp.gw.staff'));
  await page.evaluate(() => { window.__calls = []; window.hrReview = o => window.__calls.push(o); });
  await page.locator('#osBody [data-os-write="hire"]').click();
  assert.deepEqual(await page.evaluate(() => window.__calls), [{scope: 'site', site: SITE}]);
});

test('a week too short for a hire is hours left open, not a place: no "1 more", no headhunter, and the row stays pending', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 2, stationShifts: 3}, FULL);
  /* main's six-hour remainder (tests/staff_hire.test.cjs): Customer Service, 6 h on one day, band "short" */
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_customerservice', null, SHORT6]]});
  let r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, new RegExp(textRe('gr.os.ck.staff.count', {n: 2}).source + ' \u00b7 ' + textRe('co.hire.role.toofew', {h: 6}).source));
  assert.doesNotMatch(r.sub, new RegExp([textRe('gr.os.ck.staff.need', {}).source, textRe('gr.os.ck.staff.nocand', {}).source].join('|')));
  assert.doesNotMatch(r.act, textRe('gr.os.ck.staff.headhunter', {}, {}));
  /* beside a real place, the short hours are said apart and not counted */
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', 'hire'], ['ba:skill_customerservice', null, SHORT6]]});
  r = (await rows(page))[2];
  assert.match(r.sub, new RegExp(textRe('gr.os.ck.staff.need', {have: 2, total: 3, need: 1, roles: '1 Cleaning'}).source + '[^\u00b7]*\u00b7 ' + textRe('co.hire.role.toofew', {h: 6}).source));
  assert.doesNotMatch(r.sub, textRe('gr.os.ck.staff.nocand', {}, {}));
  /* a planned reassign onto the short week is not the hours worked: pending, with Staff this site */
  await linked(page);
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_customerservice', 'move', SHORT6]]});
  r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.doesNotMatch(r.sub, textRe('co.hire.role.toofew', {}, {}));
  assert.equal((await page.locator('#osBody [data-os-write="hire"]').innerText()).trim(), en('sp.gw.staff'));
  /* without the link, the step that clears it is the move, not the schedule */
  await linked(page, null);
  r = (await rows(page))[2];
  assert.match(r.act, textRe('gr.os.ck.staff.ingame.move', {moves: '1 Customer Service'}, {}));
  assert.doesNotMatch(r.act, textRe('gr.os.ck.staff.ingame.week', {}, {}));
  /* beside a regular hire, the step names both the hire and the short week's move */
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', 'hire'], ['ba:skill_customerservice', 'move', SHORT6]]});
  r = (await rows(page))[2];
  assert.match(r.act, textRe('gr.os.ck.staff.ingame.mixed', {roles: '1 Cleaning', moves: '1 Customer Service'}, {}));
  assert.match(r.sub, textRe('gr.os.ck.staff.need', {need: 1, roles: '1 Cleaning'}, {}));
  assert.doesNotMatch(r.sub, /Customer Service/);
  /* a padded week with no hours is no short week */
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_customerservice', null, {band: 'short', hours: 0, days: 0, slots: []}]]});
  assert.equal((await rows(page))[2].state, 'done');
  /* a later save where the week is worked: the plan has no short week left */
  await hiring(page, {planned: true, variant: 'open', weeks: []});
  assert.equal((await rows(page))[2].state, 'done');
});

test('every pending path names the short week\'s planned hire or move in the game, and the schedule where hours are missing', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 0, stationShifts: 0}, FULL);
  const GAP = {kind: 'shop', unstaffed: {demand: {hours: 12, roles: [{skill: 'ba:skill_cleaning', idle: 1}]}}};
  const cases = [
    {name: 'need > 0', biz: {staff: 1, stationShifts: 2}, weeks: [['ba:skill_cleaning', 'hire']], text: textRe('gr.os.ck.staff.need', {have: 1, total: 2}, {}), schedule: false},
    {name: 'nobody hired', biz: {staff: 0, stationShifts: 0}, weeks: [], text: textRe('gr.os.ck.staff.nobody', {}, {}), schedule: false},
    {name: 'nobody hired, bench', biz: {staff: 0, stationShifts: 0}, weeks: [], bench: 2, text: textRe('gr.os.ck.staff.benchonly', {n: 2}, {anchor: 'full'}), schedule: false},
    {name: 'need > 0, bench', biz: {staff: 1, stationShifts: 2}, weeks: [['ba:skill_cleaning', 'hire']], bench: 1, text: new RegExp('^' + textRe('gr.os.ck.staff.need', {have: 1, total: 3}).source + '.* \u00b7 ' + textRe('gr.os.ck.staff.bench', {n: 1}).source), p: '33%', schedule: false},
    {name: 'covered, bench', biz: {staff: 2, stationShifts: 3}, weeks: [], bench: 1, text: new RegExp('^' + textRe('gr.os.ck.staff.count', {n: 2}).source + ' \u00b7 ' + textRe('gr.os.ck.staff.bench', {n: 1}).source + '$'), schedule: false},
    /* the schedule step is for the people the plan uses: a spare alone gets none */
    {name: 'no hours, only a spare', biz: {staff: 1, stationShifts: 0, staffIdle: ['sp1']}, weeks: [], text: textRe('gr.os.ck.staff.count', {n: 1}, {anchor: 'full'}), schedule: false},
    {name: 'no hours, one used and a spare', biz: {staff: 2, stationShifts: 0, staffIdle: ['sp1']}, weeks: [], text: textRe('gr.os.ck.staff.idle', {}, {}), schedule: true},
    {name: 'no hours scheduled', biz: {staff: 2, stationShifts: 0, staffIdle: []}, weeks: [], text: textRe('gr.os.ck.staff.idle', {}, {}), schedule: true},
    {name: 'has no hours', biz: {staff: 2, stationShifts: 3}, weeks: [], site: GAP, text: textRe('gr.os.ck.staff.nohours2', {n: 1}, {}), schedule: true},
    {name: 'covered, short only', biz: {staff: 2, stationShifts: 3, staffIdle: []}, weeks: [], text: textRe('gr.os.ck.staff.count', {n: 2}, {anchor: 'full'}), schedule: false},
  ];
  for (const who of ['hire', 'move']) {
    for (const c of cases) {
      await page.evaluate(biz => { Object.assign(D.businesses.find(x => x.key === osPlan().key), biz); }, c.biz);
      await hiring(page, {planned: true, variant: 'open', site: c.site, bench: c.bench, weeks: [...c.weeks, ['ba:skill_customerservice', who, SHORT6]]});
      const r = (await rows(page))[2];
      const label = `${c.name}, short week ${who}`;
      assert.equal(r.state, c.name.startsWith('need > 0') ? 'part' : 'todo', label);
      assert.match(r.sub, c.text, label);
      if(c.p) assert.equal(r.p, c.p, label);
      assert.match(r.act, who === 'hire' ? textRe('gr.os.ck.staff.ingame', {roles: c.weeks.length ? '1 Cleaning, 1 Customer Service' : '1 Customer Service'}) : new RegExp([textRe('gr.os.ck.staff.ingame.move', {moves: '1 Customer Service'}).source, textRe('gr.os.ck.staff.ingame.mixed', {moves: '1 Customer Service'}).source].join('|')), label);
      if(c.bench) assert.match(r.act, textRe('gr.os.ck.staff.ingame.bench', {n: c.bench}), label);
      else assert.doesNotMatch(r.act, textRe('gr.os.ck.staff.ingame.bench', {}, {}), label);
      assert[c.schedule ? 'match' : 'doesNotMatch'](r.act, textRe('gr.os.ck.staff.ingame.week', {}, {}), label);
    }
  }
});

test('a bench person the plan counts on keeps a covered shop pending, with no short week to do it', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 2, stationShifts: 3}, FULL);
  await hiring(page, {planned: true, variant: 'open', weeks: [], bench: 1});
  const r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, new RegExp('^' + textRe('gr.os.ck.staff.count', {n: 2}).source + ' \u00b7 ' + textRe('gr.os.ck.staff.bench', {n: 1}).source + '$'));
  await hiring(page, {planned: true, variant: 'open', weeks: [], bench: 0});
  const done = (await rows(page))[2];
  assert.equal(done.state, 'done');
  assert.match(done.sub, textRe('gr.os.ck.staff.done', {}, {}));
});

test('a demand plan before any sales: somebody hired early is not "on staff" and done, but waits for the sizing', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 0, staffIdle: ['sp1'], revenue: 0, customers: 0, hasTraded: false}, FULL);
  await hiring(page, {planned: true, variant: 'demand', weeks: []});
  const r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, textRe('gr.os.ck.staff.unsized', {n: 1}, {anchor: 'full'}));
});

test('linked, with nothing for Staff this site to do, the row still says the step in the game', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 2, stationShifts: 3}, FULL);
  await linked(page);
  await hiring(page, {planned: true, variant: 'open', work: 0, weeks: [['ba:skill_customerservice', null, SHORT6]]});
  const r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.equal(await page.locator('#osBody [data-os-write="hire"]').count(), 0);
  assert.match(r.act, textRe('gr.os.ck.staff.ingame.week', {}, {}));
});

test('scheduling only: staff without hours get Staff this site linked, and the BizMan › Schedule step without the link', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 3, stationShifts: 0}, FULL);
  await hiring(page, {...HIRES, weeks: [], work: 1});
  let r = (await rows(page))[2];
  assert.match(r.sub, textRe('gr.os.ck.staff.idle', {}, {}));
  assert.match(r.act, textRe('gr.os.ck.staff.ingame.week', {}, {}));
  await linked(page);
  await page.evaluate(() => { window.__calls = []; window.hrReview = o => window.__calls.push(o); });
  assert.equal((await page.locator('#osBody [data-os-write="hire"]').innerText()).trim(), en('sp.gw.staff'));
  await page.locator('#osBody [data-os-write="hire"]').click();
  assert.deepEqual(await page.evaluate(() => window.__calls), [{scope: 'site', site: SITE}]);
  /* the plan's own people with no hours in the week: the same */
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).stationShifts = 4; });
  await hiring(page, {...HIRES, weeks: [], work: 1, site: {kind: 'shop', unstaffed: {demand: {hours: 12, roles: [{skill: 'ba:skill_cleaning', idle: 1}]}}}});
  r = (await rows(page))[2];
  assert.match(r.sub, textRe('gr.os.ck.staff.nohours2', {n: 1}, {}));
  assert.equal(await page.locator('#osBody [data-os-write="hire"]').count(), 1);
  /* nothing for the action to do: no button */
  await hiring(page, {...HIRES, weeks: [], work: 0, site: {kind: 'shop', unstaffed: {demand: {hours: 12, roles: [{skill: 'ba:skill_cleaning', idle: 1}]}}}});
  assert.equal(await page.locator('#osBody [data-os-write="hire"]').count(), 0);
});

test('nobody hired yet but the plan assigns bench people: Staff this site is offered', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 0, stationShifts: 0}, FULL);
  await linked(page);
  await hiring(page, {planned: true, variant: 'demand', weeks: [], work: 2});
  const r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, enRe('gr.os.ck.staff.nobody'));
  assert.equal((await page.locator('#osBody [data-os-write="hire"]').innerText()).trim(), en('sp.gw.staff'));
});

test('an open place beside a hire: the hire is the step, and the headhunter hint stays with the button', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2}, FULL);
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', null], ['ba:skill_customerservice', 'hire']]});
  let r = (await rows(page))[2];
  assert.match(r.sub, textRe('gr.os.ck.staff.nocand', {n: 1}, {}));
  assert.doesNotMatch(r.act, new RegExp([textRe('gr.os.ck.staff.ingame.move', {}).source, textRe('gr.os.ck.staff.ingame.mixed', {}).source].join('|'), 'i'));
  assert.match(r.act, textRe('gr.os.ck.staff.ingame', {roles: '1 Customer Service'}, {}));
  await linked(page);
  r = (await rows(page))[2];
  assert.match(r.act, enRe('sp.gw.staff'));
  assert.match(r.act, textRe('gr.os.ck.staff.headhunter', {roles: '1 Cleaning'}, {}));
  /* with no link, both steps: the hire and the headhunter for the open place only */
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', null], ['ba:skill_customerservice', 'hire'], ['ba:skill_customerservice', 'hire']]});
  await linked(page, null);
  r = (await rows(page))[2];
  assert.match(r.act, textRe('gr.os.ck.staff.ingame', {roles: '2 Customer Service'}, {}));
  assert.match(r.act, textRe('gr.os.ck.staff.headhunter', {roles: '1 Cleaning'}, {}));
  assert.doesNotMatch(r.act, textRe('gr.os.ck.staff.headhunter', {roles: '1 Customer Service'}, {}));
});

test('spare people the plan gives no week are left out of "n of m" and the progress bar', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 3, stationShifts: 2, staffIdle: ['spare1', 'spare2']}, FULL);
  await hiring(page);
  const r = (await rows(page))[2];
  assert.match(r.sub, textRe('gr.os.ck.staff.need', {have: 1, total: 5, need: 4}, {anchor: 'start'}));
  assert.equal(r.p, '20%');
  assert.doesNotMatch(r.sub, new RegExp([textRe('gr.os.ck.staff.nohours2', {}).source, textRe('gr.os.ck.staff.idle', {}).source, 'spare'].join('|'), 'i'));
});

test('the real staff gate offers Staff this site for a bench move with no hires', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 0, stationShifts: 0}, FULL);
  await realHiring(page, {demand: true, candidates: false});
  // The plan counts on one unassigned person, with nobody to hire.
  await page.evaluate(site => {
    D.hiring.bench = ['BENCH1'];
    D.hiring.people.BENCH1 = {name: 'Bo Bench', skills: [{skill: 'ba:skill_cleaning', level: 55}],
      wage: 17, site: null, hours: 0, demands: []};
    D.hiring.sites.find(s => s.key === site).plans.demand.bench = ['BENCH1'];
    hrSiteMemo = null;
  }, SITE);
  await linked(page);
  const body = await page.evaluate(site => hrRequest(hrMemoModel(), {mode: 'both', site, one: true}).body, SITE);
  assert.deepEqual(body.hires, []);
  assert.deepEqual(body.moves, [{employeeId: 'BENCH1', from: null,
    to: {street: 'ba:street_broadwaystreet', number: 9}}]);
  assert.ok(await page.evaluate(site => osStaffWork(site) > 0, SITE));
  const staff = (await rows(page))[2];
  assert.equal(staff.state, 'todo');
  assert.match(staff.sub, textRe('gr.os.ck.staff.benchonly', {n: 1}, {anchor: 'full'}));
  assert.equal(staff.act, en('sp.gw.staff'));
  await page.evaluate(() => { window.__calls = []; window.hrReview = o => window.__calls.push(o); });
  await page.locator('#osBody .os-ck').nth(2).locator('[data-os-write="hire"]').click();
  assert.deepEqual(await page.evaluate(() => window.__calls), [{scope: 'site', site: SITE}]);
});

test('nobody to hire says to ask a headhunter', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2}, FULL);
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', null], ['ba:skill_customerservice', null]]});
  await linked(page);
  const staff = (await rows(page))[2];
  assert.match(staff.act, textRe('gr.os.ck.staff.headhunter', {}, {}));
  assert.equal(await page.locator('#osBody [data-os-write="hire"]').count(), 0);
});

test('without the game link every write is an instruction in the game, under a link strip', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2, uniformGaps: ['Customer Service']}, FULL);
  await hiring(page);
  assert.equal(await page.locator('#osBody [data-os-write]').count(), 0);
  assert.equal(await page.locator('#osBody .os-ck .os-ingame', {hasNotText: textRe('gr.os.ck.staff.headhunter', {}, {})}).count(), 3);
  assert.match(await page.locator('#osBody .os-gate').innerText(), textRe('gr.os.ck.gate', {}, {}));
  assert.equal(await page.locator('#osBody [data-os-howlink]').count(), 1);
});

test('How to link opens the game link\'s page, and says where to look when the footer link is missing', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1}, FULL);
  await page.evaluate(() => { const a = document.querySelector('a[data-visit-feature="game-link"]'); if(a) a.remove(); });
  await page.locator('#osBody [data-os-howlink]').click();
  assert.match(await page.locator('#osBody .os-gate').innerText(), textRe('gr.os.ck.gate.hint', {}, {}));
});

test('with the game link the same rows carry buttons', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2, uniformGaps: ['Customer Service']}, FULL);
  await hiring(page);
  await linked(page);
  assert.equal(await page.locator('#osBody .os-ck .os-ingame', {hasNotText: textRe('gr.os.ck.staff.headhunter', {}, {})}).count(), 0);
  assert.equal(await page.locator('#osBody .os-gate').count(), 0);
  assert.deepEqual(await page.$$eval('#osBody [data-os-write]', bs => bs.map(b => [b.dataset.osWrite, b.innerText.trim()])),
    [['hire', en('sp.gw.staff')], ['uniforms', en('gr.os.ck.uni.assign')], ['marketing', en('sp.gw.mk.title')]]);
});

test('a write the mod lacks turns only its own button into the instruction', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2, uniformGaps: ['Customer Service']}, FULL);
  await hiring(page);
  await linked(page, {...LINK, writes: ['hire', 'uniforms']});
  assert.deepEqual(await page.$$eval('#osBody [data-os-write]', bs => bs.map(b => b.dataset.osWrite)), ['hire', 'uniforms']);
  assert.equal(await page.locator('#osBody .os-ck .os-ingame', {hasNotText: textRe('gr.os.ck.staff.headhunter', {}, {})}).count(), 1);
  assert.equal(await page.locator('#osBody .os-gate').count(), 0);
});

test('uniforms wait for hours: staff with no station shifts is a to-do, and only shifts and no gaps make it done', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 3, stationShifts: 0}, FULL);
  let r = await rows(page);
  assert.equal(r[3].state, 'todo');
  assert.match(r[3].sub, enRe('gr.os.ck.uni.noshifts'));
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
  assert.match(out.seat[0].sub, textRe('gr.os.ck.dem.part', {items: en('gr.os.ck.dem.seating')}, {}));
  assert.match(out.seat[1].sub, new RegExp(['gr.os.ck.dem.done', 'gr.os.ck.dem.check', 'gr.os.ck.dem.part'].map(k => textRe(k).source).join('|')));
  assert.ok(out.gym, 'a type asks for workout variety');
  assert.notEqual(out.gym.state, 'done');
  assert.match(out.gym.sub, enRe('gr.os.ck.dem.variety'));
  assert.match(out.gym.act, textRe('gr.os.ck.dem.ingame', {items: en('gr.os.ck.dem.variety')}, {}));
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
  assert.match(out.opened.sub, textRe('gr.os.ck.log.office', {}, {}));
  assert.equal(out.vacant.state, 'todo');
  assert.match(out.vacant.sub, textRe('gr.os.ck.log.office.todo'));
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
  assert.match(r.act, enRe('gr.os.ck.log.go'));
  /* a product the shop stocks but has not sold yet counts as much as one it sells: the pairs are not tied to sales rows */
  await routed(page, [all[0]]);
  r = (await rows(page))[6];
  assert.equal(r.state, 'part');
  assert.match(r.sub, textRe('gr.os.ck.log.part', {}, {}));
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
  assert.match(r.act, enRe('gr.os.ck.log.go'));
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
  assert.match(r[0].sub, textRe('gr.os.ck.lease.rented', {}, {anchor: 'start'}));
  assert.deepEqual(r.slice(1).map(x => x.state), ['todo', 'todo', 'todo', 'todo', 'todo', 'todo']);
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.ck.othertype', {type: 'Bakery'}, {}));
});

test('a rented address with nothing opened there yet leaves the lease a to-do', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {status: 'vacant', staff: 0});
  const r = await rows(page);
  assert.equal(r[0].state, 'todo');
  assert.match(r[0].sub, textRe('gr.os.ck.lease.vacant', {}, {anchor: 'start'}));
  assert.match(await page.locator('#osBody .os-prog').innerText(), textRe('gr.os.ck.count', {n: 0, of: 7}, {}));
  /* once a business of the planned type stands there, the lease ticks */
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).status = 'retail'; drawOpenStore(); });
  assert.equal((await rows(page))[0].state, 'done');
});

test('Set the cheapest mix opens the site panel\'s marketing write for the plan\'s store, and explains a refusal', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1}, FULL);
  await linked(page);
  const r = (await rows(page))[5];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, new RegExp(textRe('gr.os.ck.mk.none').source + ' \u00b7 ' + textRe('sp.mk.line', {mix: en('gr.os.mk.smallinternet'), cost: 100, p: 100}).source, 'i'));
  await page.evaluate(() => { window.__writes = [];
    SOURCE.write = async (kind, body, o) => { window.__writes.push({kind, body, dryRun: o && o.dryRun});
      return {body: {ok: false, rows: [{error: 'no_contact', agency: {name: 'CityAds', address: {street: 'ba:street_secondavenue', number: 5}}, opens: null, address: body.sites[0].address}]}}; }; });
  await page.locator('#osBody [data-os-write="marketing"]').click();
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.waitFor();
  await page.waitForFunction(() => window.__writes.length > 0);
  const sent = await page.evaluate(() => window.__writes[0]);
  assert.equal(sent.kind, 'marketing');
  assert.equal(sent.dryRun, true);
  assert.deepEqual(sent.body.sites, [{address: {street: 'ba:street_broadwaystreet', number: 9}, on: ['SmallInternet'], was: []}]);
  assert.equal(await dlg.locator('h2').innerText(), en('sp.gw.mk.title'));
  assert.match(await dlg.innerText(), textRe('nav.dlg.refuse.nocontact.rule', {agency: 'CityAds'}, {}));
});

test('a mix that waits on an agency says why and its button does nothing; without the write it says what to switch in BizMan', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, marketingPlan: {...MKPLAN, agencies: ['ba:street_nowhere#1']}}, FULL);
  await linked(page);
  const r = (await rows(page))[5];
  assert.match(r.sub, textRe('sp.mk.why.none', {}, {}));
  const btn = page.locator('#osBody [data-os-write="marketing"]');
  assert.equal(await btn.getAttribute('aria-disabled'), 'true');
  await btn.click({force: true});
  assert.equal(await page.locator('dialog.gw-dlg[open]').count(), 0);
  await linked(page, {...LINK, writes: ['hire', 'uniforms']});
  assert.match((await rows(page))[5].act, textRe('sp.mk.hand.visit', {types: en('gr.os.mk.smallinternet')}, {flags: 'i'}));
});

test('no agency in the phone yet: the row says which to visit, with no button', async t => {
  const page = await board(t);
  await until(page);
  await page.evaluate(() => { D.marketingAgencies = [{key: 'ba:street_secondavenue#5', name: 'CityAds', address: '5 Second Avenue', contact: false, types: ['SmallInternet'], hours: []}]; });
  await opened(page, {staff: 1, marketingPlan: {...MKPLAN, on: null, visit: ['ba:street_secondavenue#5']}}, FULL);
  await linked(page);
  const r = (await rows(page))[5];
  assert.equal(r.state, 'todo');
  assert.match(r.act, textRe('sp.mk.novisit2', {agencies: 'CityAds (5 Second Avenue)'}, {}));
  assert.equal(await page.locator('#osBody [data-os-write="marketing"]').count(), 0);
});

test('a running campaign, from the save\'s enabled set, leaves the marketing row done with no button; so does a mix of none', async t => {
  const page = await board(t);
  await until(page);
  await linked(page);
  await opened(page, {staff: 1, marketing: 0, campaigns: running('MediumInternet')}, FULL);
  const r = await rows(page);
  assert.equal(r[5].state, 'done');
  assert.equal(r[5].act, '');
  /* money spent last week is no proof: with no campaign enabled the row is a to-do */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.campaigns[0].enabled = false; b.marketing = 350; b.marketingIndex = 20; drawOpenStore(); });
  assert.equal((await rows(page))[5].state, 'todo');
  /* promotion already full without a campaign: nothing to start */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.marketingPlan = {...b.marketingPlan, on: [], costPlan: 0, promotionPlan: 100}; drawOpenStore(); });
  const done = (await rows(page))[5];
  assert.equal(done.state, 'done');
  assert.match(done.sub, textRe('gr.os.ck.mk.unneeded', {}, {}));
});

test('a mix of no campaigns says none would raise promotion; a missing switch is set up, an unvisited agency named', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, marketingPlan: {...MKPLAN, on: [], promotionPlan: 80}}, FULL);
  await linked(page);
  let r = (await rows(page))[5];
  assert.equal(r.state, 'done');
  assert.match(r.sub, enRe('gr.os.ck.mk.useless'));
  assert.doesNotMatch(r.act, textRe('gr.os.ck.mk.ingame', {}, {}));
  assert.equal(await page.locator('#osBody [data-os-write="marketing"]').count(), 0);
  /* a switch BizMan lacks: the site panel's set-up, through gwMarketing's setup mode */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.marketingPlan = {...b.marketingPlan, needsSetup: true}; window.__mk = [];
    window.gwMarketing = (keys, mode) => window.__mk.push([keys, mode]); drawOpenStore(); });
  r = (await rows(page))[5];
  assert.equal(r.state, 'todo');
  const before = await page.evaluate(() => [osPlan().mode, paybackMode()]);
  await page.locator('#osBody [data-os-write="marketing"]').click();
  assert.deepEqual(await page.evaluate(() => window.__mk), [[[SITE], 'setup']]);
  assert.deepEqual(await page.evaluate(() => [osPlan().mode, paybackMode()]), before, 'the set-up is not the install-mode toggle');
  /* without the write the set-up is optional, promotion unchanged: done */
  await linked(page, {...LINK, writes: ['hire', 'uniforms']});
  assert.equal((await rows(page))[5].state, 'done');
  await linked(page);
  /* an agency not visited yet may sell a better mix */
  await page.evaluate(() => { D.marketingAgencies = [{key: 'ba:street_secondavenue#5', name: 'CityAds', address: '5 Second Avenue', contact: false, types: ['SmallInternet'], hours: []}];
    const b = D.businesses.find(x => x.key === osPlan().key); b.marketingPlan = {...b.marketingPlan, needsSetup: false, visit: ['ba:street_secondavenue#5']}; drawOpenStore(); });
  r = (await rows(page))[5];
  assert.equal(r.state, 'todo');
  assert.match(r.act, textRe('sp.mk.better2', {agencies: 'CityAds (5 Second Avenue)'}, {}));
  assert.doesNotMatch(r.sub, textRe('gr.os.ck.mk.useless', {}, {}));
  assert.match(r.sub, textRe('gr.os.ck.mk.none', {}, {}));
  /* a switch to set up and an agency to visit: the button, and the visit hint after it */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.marketingPlan = {...b.marketingPlan, needsSetup: true}; drawOpenStore(); });
  r = (await rows(page))[5];
  assert.match(r.sub, textRe('gr.os.ck.mk.none', {}, {}));
  assert.doesNotMatch(r.sub, textRe('gr.os.ck.mk.useless', {}, {}));
  assert.equal(await page.locator('#osBody [data-os-write="marketing"]').count(), 1);
  assert.match(r.act, textRe('sp.mk.better2', {agencies: 'CityAds (5 Second Avenue)'}, {}));
  /* linked, but a mod without the marketing write: the set-up is optional, the better mix still needs the visit */
  await linked(page, {...LINK, writes: ['hire', 'uniforms']});
  r = (await rows(page))[5];
  assert.equal(r.state, 'todo');
  assert.equal(await page.locator('#osBody [data-os-write="marketing"]').count(), 0);
  assert.match(r.act, textRe('sp.mk.better2', {agencies: 'CityAds (5 Second Avenue)'}, {}));
});

test('an unmet hairdresser shelf is named in words, not by its id', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 1}, {placed: 20, req: [['shelfwithhaircareproducts', 1, 0]], seating: false});
  const r = (await rows(page))[1];
  assert.match(r.sub, textRe('gr.os.ck.furn.part', {items: en('gr.os.ck.furn.haircare')}, {}));
  assert.doesNotMatch(r.sub, /Shelfwithhaircareproducts/i);
});


/* --- step 6: after opening ------------------------------------------------------ */
/* The plan's store opened on day 30 and has traded to the save's day 47: the
   business at the plan's address, and phase 1's payback row for it as
   _payback() sends one (tests/test_payback.py holds the arithmetic). `daily`
   is each day's profit from the first day with sales, the opening day's
   `first` before it; `state` and its figures are the outcome, in both modes. */
const OPENED = 30;
const traded = (page, {daily = [], first = -400, state, extra = {}, cost = null, row = {}} = {}) => page.evaluate(({site, daily, first, state, extra, cost, opened, patch}) => {
  const snap = osPlan().snap, inv = cost || {furniture: snap.inv.furniture, materials: snap.inv.decor, fee: snap.inv.fee,
    deposit: snap.inv.deposit, firm: snap.inv.firm, self: snap.inv.furniture + snap.inv.decor + snap.inv.deposit};
  const days = [[opened, first, 0], ...daily.map((p, i) => [opened + 1 + i, p, p > 0 ? p * 2 : 50])];
  const profit = days.reduce((a, d) => a + d[1], 0);
  const recent = days.slice(1).slice(-14), rate = recent.length ? recent.reduce((a, d) => a + d[1], 0) / recent.length : null;
  D.payback.sites[site] = Object.assign({costCentre: false, cost: inv, exact: true, opened, since: opened, profit, rate, days, before: 0,
    firm: Object.assign({state}, extra), self: Object.assign({state}, extra)}, patch);
  const b = D.businesses.find(x => x.key === site);
  Object.assign(b, {opened, staff: 3, stationShifts: 5, hasTraded: daily.length > 0, revenue: daily.length ? 900 : 0});
  drawOpenStore();
  return {inv: inv.firm, profit, rate};
}, {site: SITE, daily, first, state, extra, cost, opened: OPENED, patch: row});
/* A plan walked to its building, then the store opened there. */
async function openedPlan(page, patch = {}){
  await planned(page);
  await opened(page, Object.assign({opened: OPENED, staff: 3, stationShifts: 5}, patch), FULL);
}
const tiles = page => page.$$eval('#osBody .os-roi .kpi', ks => ks.map(k => k.innerText.replace(/\s+/g, ' ').trim()));
const pvsa = page => page.$$eval('#osBody .os-pvsa tbody tr', trs => trs.map(tr => [...tr.cells].map(td => td.innerText.replace(/\s+/g, ' ').trim())));
const pvRow = async (page, name) => (await pvsa(page)).find(x => x[0].startsWith(name));
const goOpen = async page => { await page.locator('#osCtl [data-os-step="open"]').click(); await page.waitForFunction(() => osStep === 'open'); };

test('once the planned store stands at the address the plan keeps what it said and its opening day, and the Open step unlocks', async t => {
  const page = await board(t);
  await planned(page);
  const snap = await page.evaluate(() => JSON.stringify(osPlan().snap));
  const est = await page.evaluate(() => { const p = osPlan(), e = osEstimate(p, osBuilding(p.key)); return {firm: e.inv.firm, profit: Math.round(e.profit), day0: Math.round(e.day(0))}; });
  assert.deepEqual(JSON.parse(snap).inv.firm, Math.round(est.firm));
  assert.equal(JSON.parse(snap).profit, est.profit);
  assert.equal(JSON.parse(snap).curve[0], est.day0, 'the opening day is ramped as the plan drew it');
  assert.equal(await page.locator('#osCtl [data-os-step="open"]').isDisabled(), true);
  await opened(page, {opened: OPENED}, FULL);
  assert.equal(await page.evaluate(() => osPlan().opened), OPENED, 'the store the plan attached to');
  // A rival that lowers the price the plan was made at no longer moves it.
  await page.evaluate(() => { Object.values(osFacts().market).forEach(m => { if(m.p) m.p *= 0.5; }); osBest = new Map(); drawOpenStore(); });
  assert.equal(await page.evaluate(() => JSON.stringify(osPlan().snap)), snap, 'frozen once the store opened');
  assert.equal(await page.locator('#osCtl [data-os-step="open"]').isDisabled(), false);
  assert.equal(await page.locator('#osCtl [data-os-step="open"]').getAttribute('data-tip'), null);
  // Until opening hands over to the payback.
  await page.locator('#osCtl [data-os-step="opening"]').click();
  await page.locator('#osBody .os-links [data-os-step="open"]').click();
  await page.waitForFunction(() => osStep === 'open');
  // Step 6's strip says what and where only; the tiles carry the numbers.
  assert.deepEqual((await strip(page)).map(c => c.split(' ')[0]), [en('gr.os.strip.open'), en('gr.os.strip.whereLab')].map(s => s.toUpperCase().split(' ')[0]));
  const kept = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem(osStore())).plans[0]; return {snap: osSnapClean(p.snap), opened: p.opened}; });
  assert.deepEqual(kept, {snap: JSON.parse(snap), opened: OPENED});
});

test("premises rented and set up before the plan picked them keep their figures; a new pick drops the last place's", async t => {
  const page = await board(t);
  await planned(page);
  /* One of your own shops turned into a liquor store that has never sold: a
     lease signed and the place set up before the plan picked it. */
  const moved = await page.evaluate(site => {
    const p = osPlan();
    const b = premises().buildings.find(x => x.key !== site && x.type === 'retail' && x.status === 'mine' && osOutfit(p, x));
    Object.assign(D.businesses.find(x => x.key === b.key), {typeSlug: p.type, status: 'retail', hasTraded: false, revenue: 0, opened: 46, lines: []});
    delete (D.payback.sites || {})[b.key];
    const before = JSON.stringify(p.snap);
    osPick(b.key);
    return {key: b.key, before, after: JSON.stringify(p.snap), want: JSON.stringify(osSnapOf(p, b)), opened: p.opened, step: osStep,
      store: JSON.parse(JSON.stringify(D.businesses.find(x => x.key === b.key)))};
  }, SITE);
  assert.ok(moved.key);
  assert.notEqual(moved.after, 'null', 'its figures are kept at the pick');
  assert.equal(moved.after, moved.want, "and they are this place's, not the last one's");
  assert.equal(moved.opened, 46, 'the plan follows the store that stands there');
  assert.equal(moved.step, 'investment');
  // Back to the empty shop: nothing of the unsold store is kept.
  const back = await page.evaluate(site => { const p = osPlan(); osPick(site);
    return {opened: p.opened, snap: JSON.stringify(p.snap), want: JSON.stringify(osSnapOf(p, osBuilding(site)))}; }, SITE);
  assert.equal(back.opened, null);
  assert.equal(back.snap, back.want);
  // A plan whose store has sold is its record: another pick is a new plan of
  // the type there, and the record stays where it was.
  const kept = await page.evaluate(({key, site}) => { const p = osPlan(); osPick(key);
    // It sold, then closed: the plan remembers the sale with no store or payback row left.
    Object.assign(D.businesses.find(x => x.key === key), {hasTraded: true, revenue: 500}); drawOpenStore();
    D.businesses = D.businesses.filter(x => x.key !== key); delete (D.payback.sites || {})[key];
    const before = JSON.stringify([p.key, p.snap, p.opened]), n = osPlans.length;
    osPick(site);
    return {before, after: JSON.stringify([p.key, p.snap, p.opened]), added: osPlans.length - n, now: osPlan().key, fresh: osPlan() !== p, type: osPlan().type === p.type};
  }, {key: moved.key, site: SITE});
  assert.equal(kept.after, kept.before);
  assert.deepEqual([kept.added, kept.now, kept.fresh, kept.type], [1, SITE, true, true]);
  // One that closed before it ever sold has no record: it starts over at the new place.
  const restart = await page.evaluate(({key, site, store}) => { D.businesses.push(store); osPick(key); const p = osPlan();
    const attached = p.opened;
    D.businesses = D.businesses.filter(x => x.key !== key);
    osPick(site); return {attached, same: osPlan() === p, key: p.key, opened: p.opened}; }, {key: moved.key, site: SITE, store: moved.store});
  assert.equal(restart.attached, 46);
  delete restart.attached;
  assert.deepEqual(restart, {same: true, key: SITE, opened: null});
});

test('plans kept before the sold mark: one whose store opened is a record, one that never opened is not', async t => {
  const page = await board(t);
  const got = await page.evaluate(({site, liq}) => {
    const plan = (id, opened) => ({id, type: liq, hood: null, key: 'ba:street_closed#1', mode: null, finance: {on: false, amount: null, bank: null},
      step: 'investment', made: 10, snap: null, opened, paid: false});
    localStorage.setItem(osStore(), JSON.stringify({plans: [plan('old', 20), plan('new', null)]}));
    osPlansFor = null; osLoad();
    const sold = osPlans.map(p => [p.id, p.sold]);
    // The opened one: another place is a new plan, the record stays as it was.
    osCur = 'old'; osPick(site);
    const old = osPlans.find(p => p.id === 'old');
    const first = {current: osPlan().id !== 'old', key: old.key, opened: old.opened};
    // The one that never opened moves to the new place.
    osCur = 'new'; osPick(site);
    return {sold, first, moved: [osPlan().id, osPlan().key]};
  }, {site: SITE, liq: LIQ});
  assert.deepEqual(got.sold, [['old', true], ['new', false]]);
  assert.deepEqual(got.first, {current: true, key: 'ba:street_closed#1', opened: 20});
  assert.deepEqual(got.moved, ['new', SITE]);
});

test('just opened with no sales: invested, nothing earned, no day to go yet', async t => {
  const page = await board(t);
  await openedPlan(page, {hasTraded: false, revenue: 0});
  const {inv} = await traded(page, {state: 'unknown'});
  await goOpen(page);
  const k = await tiles(page);
  assert.match(k[0], new RegExp(enRe('gr.os.roi.invested').source + ' ' + ('$' + inv.toLocaleString('en-US')).replace(/[$]/g, '\\$&') + ' ' + enRe('gr.os.roi.asPlanned').source, 'i'));
  assert.match(k[1], new RegExp([textRe('gr.os.roi.soFar', {}).source, '-\\$400', textRe('gr.os.roi.days', {n: 1}).source, '\u00b7', textRe('gr.os.roi.since', {n: 30}).source].join(" "), 'i'));
  assert.match(k[2], new RegExp([textRe('gr.os.roi.paid', {}).source, '0%'].join(" "), 'i'));
  assert.match(k[3], new RegExp([textRe('gr.os.strip.beLab', {}).source, '\u2013', textRe('gr.os.roi.unknown', {}).source].join(" "), 'i'));
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.noSales', {}, {}));
  const r = await pvsa(page);
  assert.deepEqual(r.map(x => x[0].split(' ')[0]), ['gr.os.roi.furn', 'gr.os.inv.fee', 'gr.os.inv.deposit', 'gr.os.inv.total', 'gr.os.roi.day', 'gr.os.roi.be'].map(k => en(k).split(' ')[0]));
  assert.equal(r[4][2], '–', 'no recent profit before a sale');
  // The plan's profit and days are single figures, the range on hover.
  assert.match(r[4][1], /^\$[\d,]+$/);
  assert.match(await page.locator('#osBody .os-pvsa .os-rng').first().getAttribute('data-tip'), /^\$[\d,]+–\$[\d,]+$/);
  // The links: the site's page, the Payback column and the checklist, in one row.
  const links = await page.locator('#osBody .os-links > *').allInnerTexts();
  assert.equal(links.length, 3);
  assert.match(links[2], textRe('gr.os.roi.until', {of: 7}, {anchor: 'full'}));
  // Pins the wording: the retired checklist sentence must not come back.
  assert.equal(await page.locator('#osBody p', {hasText: 'on the checklist until opening'}).count(), 0);
});

test('trading and paying back: profit so far, the share paid back, days to go against the plan and its ramp', async t => {
  const page = await board(t);
  await openedPlan(page);
  const snap = await page.evaluate(() => osPlan().snap);
  const day = Math.round(snap.inv.firm / 40);
  const daily = Array.from({length: 16}, (_, i) => i < 2 ? Math.round(day * 0.6) : day);
  const {inv, profit, rate} = await traded(page, {daily, state: 'togo', extra: {days: 25}});
  await goOpen(page);
  const k = await tiles(page);
  assert.match(k[1], new RegExp([enRe('gr.os.roi.soFar').source, '\\$' + profit.toLocaleString('en-US'), enRe('gr.os.roi.days', {n: 17}).source, '\u00b7', enRe('gr.os.roi.since', {n: 30}).source].join(' '), 'i'));
  assert.match(k[2], new RegExp(enRe('gr.os.roi.paid').source + ' ' + Math.floor(profit / inv * 100) + '%', 'i'));
  assert.match(k[3], new RegExp([textRe('gr.os.strip.beLab', {}).source, '25', textRe('gr.os.roi.togo', {n: 25}).source, textRe('gr.os.roi.about', {n: 71}).source].join(" "), 'i'));
  assert.equal(await page.locator('#osBody .os-roi .os-meter').getAttribute('style'), `--w:${(profit / inv * 100).toFixed(1)}%`);
  // The chart: the running total, a bar a day, the investment, the plan's line and the way on,
  // its points in days after opening as the axis says (the calendar day is the tile's).
  const chart = page.locator('#osBody svg.os-chart');
  assert.equal(await chart.locator('.os-dbar').count(), 17);
  assert.equal(await chart.locator('polyline.plan').count(), 1);
  assert.equal(await chart.locator('line.fc').count(), 1);
  // Day 46 is 16 days after opening; 25 days to go lands 41 days after it, as the tile's day 71.
  assert.match(await chart.textContent(), textRe('gr.os.roi.chart.today', {after: en('gr.os.roi.chart.after', {n: 16})}, {}));
  assert.match(await chart.textContent(), textRe('gr.os.roi.chart.after', {n: 41}, {}));
  assert.doesNotMatch(await chart.textContent(), textRe('gr.os.be.day', {n: 71}, {}));
  const mid = Math.round(snap.profit * (0.8 + 1.05) / 2);
  const ramp = Math.round(snap.curve.slice(0, 5).reduce((a, b) => a + b, 0) * (0.8 + 1.05) / 2);
  const row = await pvRow(page, en('gr.os.roi.day'));
  assert.equal(money(row[1]), mid);
  assert.equal(row[2], '$' + Math.round(rate).toLocaleString('en-US'));
  // The first five days with sales against the plan's ramped first days.
  const first = daily.slice(0, 5).reduce((a, b) => a + b, 0);
  assert.deepEqual((await pvRow(page, en('gr.os.roi.ramp', {n: 5}))).slice(1, 3), ['$' + ramp.toLocaleString('en-US'), '$' + first.toLocaleString('en-US')]);
  // Days to break even, counted as the plan counts them: the first day with sales is day 1.
  assert.match((await pvRow(page, en('gr.os.roi.be')))[2], textRe('gr.os.roi.aboutDays', {n: 41}, {anchor: 'full'}));
});

test('a forecast past the chart\'s edge is cut at it, and the chart keeps its own days', async t => {
  const page = await board(t);
  await openedPlan(page);
  await traded(page, {daily: Array(16).fill(100), state: 'togo', extra: {days: 5000}});
  await goOpen(page);
  const fc = page.locator('#osBody svg.os-chart line.fc');
  assert.equal(await fc.count(), 1);
  const x2 = +(await fc.getAttribute('x2'));
  assert.ok(x2 <= 900 - 18 + 0.5, `the forecast stops at the chart's right edge (${x2})`);
  assert.equal(await page.locator('#osBody svg.os-chart circle.hit').count(), 0, 'no break-even point off the chart');
  assert.match((await tiles(page))[3], new RegExp(['5,000', textRe('gr.os.roi.togo', {n: 5000}).source].join(" "), 'i'));
});

test('paid back: the day it broke even, the plan beside it, and the way to the site page and the Payback column', async t => {
  const page = await board(t);
  await openedPlan(page);
  const snap = await page.evaluate(() => osPlan().snap);
  const day = Math.ceil(snap.inv.firm / 8);
  await traded(page, {daily: Array(16).fill(day), state: 'reached', extra: {day: 39, after: 9}});
  await goOpen(page);
  const k = await tiles(page);
  assert.match(k[2], new RegExp([textRe('gr.os.roi.paid', {}).source, '100%'].join(" "), 'i'));
  assert.match(k[3], new RegExp([textRe('gr.os.strip.beLab', {}).source, textRe('gr.os.be.day', {n: 39}).source, textRe('gr.os.roi.after', {n: 9}).source].join(" "), 'i'));
  assert.match(await page.locator('#osBody svg.os-chart').textContent(), new RegExp('(?:^|\\D)' + textRe('gr.os.roi.chart.after', {n: 9}).source), 'the chart\'s point says what the tile says');
  const done = page.locator('#osBody .os-done');
  assert.match(await done.innerText(), new RegExp([textRe('co.payback.reached', {day: 39, n: 9}).source, textRe('gr.os.roi.done.plan', {}).source].join("[\\s\\S]*"), 'i'));
  assert.equal(await page.locator('#osBody .os-links').count(), 0, 'the done strip carries the links');
  assert.match((await pvRow(page, en('gr.os.roi.be')))[2], textRe('gr.os.roi.days', {n: 9}, {anchor: 'full'}));
  assert.equal(await page.evaluate(() => osPlan().paid), true);
  // Listed as open and paid back.
  await page.locator('#osCtl select[data-os-plan]').selectOption('');
  assert.match(await page.locator('#osBody .os-plan').innerText(), new RegExp('Liquor Store\\s*' + enRe('gr.os.plans.open').source + '[\\s\\S]*' + enRe('gr.os.stage.paid').source, 'i'));
  assert.match(await page.locator('#osCtl select[data-os-plan] option').nth(1).textContent(), enRe('gr.os.plan.nameOpen', {type: 'Liquor Store', address: '9 Broadway Street'}));
  await page.locator('#osBody [data-os-open]').click();
  await page.waitForFunction(() => osStep === 'open');
  await page.locator('#osBody .os-done [data-os-results]').click();
  await page.waitForFunction(() => page === 'company' && view === 'pnl');
  assert.equal(await page.locator('#secPortfolio').isVisible(), true);
  await page.evaluate(() => openRoute('expansion/open'));
  await page.locator('#osBody .os-done [data-os-site]').click();
  await page.waitForFunction(site => siteOpen && siteKey === site, SITE);
});

test('the figures follow the install mode Results and the site page use; the plan keeps its own, labelled', async t => {
  const page = await board(t);
  await openedPlan(page);
  const snap = await page.evaluate(() => osPlan().snap);
  // Paid back on self-installation, days to go on the firm's price.
  await page.evaluate(({site, snap}) => { D.payback.sites[site] = {costCentre: false, cost: {furniture: snap.inv.furniture, materials: 0, fee: snap.inv.fee, deposit: snap.inv.deposit,
    firm: snap.inv.firm, self: snap.inv.furniture + snap.inv.deposit}, exact: true, opened: 30, since: 30, profit: snap.inv.firm / 2, rate: 1000,
    days: [[30, snap.inv.firm / 2, 10]], before: 0, firm: {state: 'togo', days: 300}, self: {state: 'reached', day: 30, after: 0}}; }, {site: SITE, snap});
  await page.evaluate(() => { osPlan().mode = 'firm'; paybackSetMode('self'); drawOpenStore(); });
  await goOpen(page);
  const k = await tiles(page);
  assert.match(k[0], new RegExp(enRe('gr.os.roi.invested').source + ' ' + ('$' + Math.round(snap.inv.furniture + snap.inv.deposit).toLocaleString('en-US')).replace(/[$]/g, '\\$&') + ' ' + enRe('gr.os.inv.self').source, 'i'));
  assert.match(k[3], new RegExp([textRe('gr.os.strip.beLab', {}).source, textRe('gr.os.be.day', {n: 30}).source].join(" "), 'i'));
  const head = await page.$$eval('#osBody .os-pvsa thead th', ths => ths.map(th => th.innerText.trim()));
  assert.match(head[1], textRe('gr.os.roi.col.planMode', {mode: en('gr.os.inv.firm')}, {flags: 'i'}));
  assert.match(head[2], textRe('gr.os.roi.col.nowMode', {mode: en('gr.os.inv.self')}, {flags: 'i'}));
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.modes', {plan: en('gr.os.inv.firm'), now: en('gr.os.inv.self')}, {}));
  assert.equal((await pvRow(page, en('gr.os.inv.total')))[3], '', 'no difference across two modes');
  // The site's page says the same.
  await page.locator('#osBody .os-done [data-os-site]').click();
  await page.waitForFunction(site => siteOpen && siteKey === site, SITE);
  await page.locator('.sp-pay').first().waitFor();
  assert.match(await page.locator('.sp-pay').first().innerText(), new RegExp([textRe('sp.payback.line', {what: en('co.payback.reached', {day: 30, n: 0})}).source].join(" "), 'i'));
});

test('past the record\'s reach: profit is the record\'s, the share unknown, unless break even was reached', async t => {
  const page = await board(t);
  await openedPlan(page);
  await traded(page, {daily: Array(16).fill(1000), state: 'window', row: {exact: false, days: undefined, before: undefined, since: 40}});
  await page.evaluate(site => { const r = D.payback.sites[site]; delete r.days; delete r.before; drawOpenStore(); }, SITE);
  await goOpen(page);
  let k = await tiles(page);
  assert.match(k[1], new RegExp([textRe('gr.os.roi.record', {}).source, textRe('gr.os.roi.record.sub', {n: 40}).source].join(" .* "), 'i'));
  assert.match(k[2], new RegExp([textRe('gr.os.roi.paid', {}).source, '\u2013', textRe('gr.os.roi.paid.unknown', {}).source].join(" "), 'i'));
  assert.equal(await page.locator('#osBody svg.os-chart').count(), 0);
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.old', {}, {}));
  // Seen from its opening once, but the days between are lost.
  await page.evaluate(site => { D.payback.sites[site].rolled = true; drawOpenStore(); }, SITE);
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.rolled', {}, {}));
  assert.doesNotMatch(await page.locator('#osBody').innerText(), textRe('gr.os.roi.old', {}, {}));
  // A remembered break even: 100%, and the paid-back strip.
  await page.evaluate(site => { const r = D.payback.sites[site]; r.firm = r.self = {state: 'reached', day: 40, after: 10, kept: true}; drawOpenStore(); }, SITE);
  k = await tiles(page);
  assert.match(k[2], new RegExp([textRe('gr.os.roi.paid', {}).source, '100%'].join(" "), 'i'));
  assert.equal(await page.locator('#osBody .os-done').count(), 1);
});

test('a store that closed, or another in its place, leaves the plan as history attached to nothing', async t => {
  const page = await board(t);
  await openedPlan(page);
  await traded(page, {daily: Array(16).fill(1000), state: 'togo', extra: {days: 50}});
  await goOpen(page);
  const snap = await page.evaluate(() => JSON.stringify(osPlan().snap));
  // Closed: nothing at the address.
  await page.evaluate(site => { D.businesses.find(b => b.key === site).status = 'vacant'; drawOpenStore(); }, SITE);
  assert.match(await page.locator('#osBody .os-state').innerText(), new RegExp([textRe('gr.os.roi.closed', {}).source, textRe('gr.os.roi.closedText', {type: 'liquor store', day: 30}).source].join("\\s*"), 'i'));
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.closedNow', {address: '9 Broadway Street'}, {}));
  assert.equal(await page.locator('#osBody .os-roi').count(), 0);
  assert.equal(await page.evaluate(() => JSON.stringify(osPlan().snap)), snap, 'the plan\'s figures are never taken again');
  // Another type in its place.
  await page.evaluate(site => { Object.assign(D.businesses.find(b => b.key === site), {status: 'retail', typeSlug: 'ba:businesstype_giftshop', type: 'Gift Shop', opened: 44}); drawOpenStore(); }, SITE);
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.replaced', {address: '9 Broadway Street', type: 'Gift Shop', day: 44}, {}));
  assert.equal(await page.evaluate(() => JSON.stringify(osPlan().snap)), snap);
  // The same type again, opened later: a new business, not this plan's.
  await page.evaluate(site => { Object.assign(D.businesses.find(b => b.key === site), {typeSlug: 'ba:businesstype_liquorstore', type: 'Liquor Store', opened: 45}); drawOpenStore(); }, SITE);
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.replaced', {type: 'Liquor Store', day: 45}, {}));
  assert.equal(await page.locator('#osBody .os-roi').count(), 0);
  // Listed as closed.
  await page.locator('#osCtl select[data-os-plan]').selectOption('');
  assert.match(await page.locator('#osBody .os-plan').innerText(), enRe('gr.os.stage.closed'));
  assert.match(await page.locator('#osCtl select[data-os-plan] option').nth(1).textContent(), textRe('gr.os.plan.nameClosed', {}, {anchor: 'full'}));
});

test('opened plans are history: twelve of them leave room for new plans, across a reload', async t => {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  const page = await board(t, {context});
  await page.evaluate(() => {
    const plans = [];
    for(let i = 0; i < 12; i++) plans.push({id: `h${i}`, type: 'ba:businesstype_liquorstore', hood: null, key: `ba:street_gone#${i}`, mode: 'firm',
      finance: {on: false}, step: 'open', made: 1, opened: 5 + i, paid: i % 2 === 0});
    for(let i = 0; i < 12; i++) plans.push({id: `u${i}`, type: 'ba:businesstype_liquorstore', hood: null, key: null, mode: null,
      finance: {on: false}, step: 'where', made: 1});
    localStorage.setItem(osStore(), JSON.stringify({plans, current: null}));
  });
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  await page.evaluate(() => openRoute('expansion/open'));
  assert.equal(await page.evaluate(() => osPlans.length), 24, 'a reload keeps twelve of each');
  // A thirteenth unfinished plan pushes out the oldest unfinished one, never history.
  await page.locator('#osBody .os-type[data-os-new="ba:businesstype_giftshop"]').click();
  const ids = await page.evaluate(() => osPlans.map(p => p.id));
  assert.equal(ids.length, 24);
  assert.equal(ids.filter(id => /^h/.test(id)).length, 12);
  assert.ok(!ids.includes('u11'));
  // History past its own limit drops the oldest paid-back plan first.
  const capped = await page.evaluate(() => osCapPlans(Array.from({length: 26}, (_, i) => ({id: `x${i}`, opened: 1, paid: i === 3 || i === 20}))).map(p => p.id));
  assert.equal(capped.length, 24);
  assert.ok(!capped.includes('x20') && !capped.includes('x3'));
});

test('not paying back, with the planned loan beside what the bank is owed in all', async t => {
  const page = await board(t);
  const bankKey = await page.evaluate(() => osFacts().finance.banks.find(b => b.id === 'VantanderBankSettings').key);
  await openedPlan(page);
  await page.evaluate(() => { const p = osPlan(); p.finance = {on: true, amount: 20000, bank: 'VantanderBankSettings'}; osSave(); });
  await traded(page, {daily: Array(16).fill(-150), state: 'never'});
  await goOpen(page);
  const k = await tiles(page);
  assert.match(k[1], new RegExp([textRe('gr.os.roi.soFar', {}).source, '-\\$2,800'].join(" "), 'i'));
  assert.match(k[3], new RegExp([textRe('gr.os.strip.beLab', {}).source, textRe('gr.os.roi.never', {}).source, textRe('gr.os.roi.never.sub', {}).source].join(" "), 'i'));
  assert.match(await page.locator('#osBody .os-state').innerText(), new RegExp([textRe('gr.os.roi.notPaying', {}).source, textRe('gr.os.roi.never.note', {w: '-$150'}).source].join("\\s*"), 'i'));
  let loan = await page.locator('#osBody .os-roiloan').innerText();
  assert.match(loan, new RegExp([textRe('gr.os.roi.loan.plan', {}).source, '\\$20,000', textRe('gr.os.roi.loan.plan.sub', {r: '$83', i: '$28', n: 241}).source].join("[\\s\\S]*"), 'i'));
  assert.match(loan, new RegExp([textRe('gr.os.roi.loan.owed', {bank: 'Vantander Bank'}).source, '\u2013', textRe('gr.os.roi.loan.nothing', {}).source].join("\\s*"), 'i'));
  // Two loans at the bank: their total, said as the bank's, not this store's.
  await page.evaluate(key => { D.loans.push({bank: 'Vantander', key, total: 20000, remaining: 4000, repaid: 80, dailyPayment: 83, dailyInterest: 28},
    {bank: 'Vantander', key, total: 20000, remaining: 15000, repaid: 25, dailyPayment: 83, dailyInterest: 28}); drawOpenStore(); }, bankKey);
  loan = await page.locator('#osBody .os-roiloan').innerText();
  assert.match(loan, new RegExp([textRe('gr.os.roi.loan.owed', {bank: 'Vantander Bank'}).source, '\\$19,000', textRe('gr.os.roi.loan.owed.sub', {n: 2}).source].join("\\s*"), 'i'));
  assert.match(loan, new RegExp([textRe('gr.os.roi.loan.daily', {}).source, '\\$222', textRe('gr.os.roi.loan.daily.sub2', {r: '$166', i: '$56'}).source].join("\\s*"), 'i'));
});

test('a save from before the opening leaves the plan unopened, not closed; a closed plan\'s checklist writes nothing', async t => {
  const page = await board(t);
  await openedPlan(page);
  await traded(page, {daily: Array(16).fill(1000), state: 'togo', extra: {days: 50}});
  assert.equal(await page.evaluate(() => osPlan().opened), OPENED);
  // An older save: day 25, the store not there yet.
  await page.evaluate(site => { D.meta.day = 25; D.businesses = D.businesses.filter(b => b.key !== site); drawOpenStore(); }, SITE);
  assert.equal(await page.evaluate(() => osClosed(osPlan())), false);
  assert.equal(await page.locator('#osCtl [data-os-step="open"]').isDisabled(), true);
  assert.equal(await page.evaluate(() => osPlan().opened), OPENED, 'nothing rewritten');
  // Back to a later save where a new liquor store replaced it: Until opening says so and has no writes.
  await page.evaluate(({site, opened}) => { D.meta.day = 47; D.businesses.push(Object.assign({}, D.businesses[0], {key: site, status: 'retail', typeSlug: 'ba:businesstype_liquorstore',
    type: 'Liquor Store', opened: opened + 10, staff: 0, stationShifts: 0, campaigns: []})); drawOpenStore(); }, {site: SITE, opened: OPENED});
  await linked(page);
  await page.locator('#osCtl [data-os-step="opening"]').click();
  assert.match(await page.locator('#osBody').innerText(), enRe('gr.os.roi.closed'));
  assert.equal(await page.locator('#osBody [data-os-write]').count(), 0);
  assert.equal(await page.evaluate(() => { const b = document.createElement('button'); b.dataset.osWrite = 'marketing'; document.querySelector('#osBody').append(b); b.click();
    return document.querySelectorAll('dialog.gw-dlg[open]').length; }), 0);
});

test('a store that opened since the last visit is history before the cap counts, on a reload and from a Demand cell', async t => {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  const page = await board(t, {context});
  const keys = await page.evaluate(() => D.businesses.filter(b => b.status !== 'vacant' && b.typeSlug).slice(0, 12).map(b => [b.key, b.typeSlug]));
  assert.ok(keys.length >= 1);
  await page.evaluate(keys => {
    const plans = [];
    for(let i = 0; i < 12; i++){ const [key, type] = keys[i % keys.length];
      plans.push({id: `o${i}`, type, hood: null, key, mode: 'firm', finance: {on: false}, step: 'opening', made: 1}); }
    plans.push({id: 'u0', type: 'ba:businesstype_liquorstore', hood: null, key: null, mode: null, finance: {on: false}, step: 'where', made: 1});
    localStorage.setItem(osStore(), JSON.stringify({plans, current: null}));
  }, keys);
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  await page.evaluate(() => { osPlansFor = null; osLoad(); });
  // The openings the save showed are kept in storage by the load itself.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem(osStore())).plans);
  assert.ok(stored.filter(p => /^o/.test(p.id)).every(p => Number.isFinite(p.opened)), JSON.stringify(stored.map(p => [p.id, p.opened])));
  await page.evaluate(() => osStart('ba:businesstype_giftshop', 'ba:neighborhood_midtown'));
  const ids = await page.evaluate(() => osPlans.map(p => p.id));
  assert.equal(ids.length, 14, 'twelve stores that opened are history, and a new plan still finds room');
  assert.ok(ids.includes('u0'));
});

test('step 4: the one figure the headline gives is the day the chart marks', async t => {
  const page = await board(t);
  await planned(page);
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  await page.waitForFunction(() => osStep === 'breakeven');
  const head = (await page.locator('#osBody .os-big > div').first().locator('b').innerText()).trim();
  assert.match(head, textRe('gr.os.days', {n: await page.evaluate(() => { const p = osPlan(), e = osEstimate(p, osBuilding(p.key)); return e.days[osMode(p)].mid; })}, {anchor: 'full'}));
  const labels = await page.$$eval('#osBody svg.os-chart text.lbl', ts => ts.map(t => t.textContent));
  assert.ok(labels.includes(head), `${head} among ${labels.join(' | ')}`);
  const mid = await page.evaluate(() => { const p = osPlan(), e = osEstimate(p, osBuilding(p.key)); return e.days[osMode(p)]; });
  assert.ok(mid.low <= mid.mid && mid.mid <= mid.high);
});

test('a cost centre\'s row is no payback; a plan kept before its figures were compares the investment only', async t => {
  const page = await board(t);
  await openedPlan(page);
  await traded(page, {daily: Array(16).fill(500), state: 'togo', extra: {days: 300}});
  await goOpen(page);
  await page.evaluate(() => { delete osPlan().snap; drawOpenStore(); });
  assert.match(await page.locator('#osBody').innerText(), enRe('gr.os.roi.live2'));
  assert.deepEqual((await pvsa(page)).map(r => r[0].split(' ')[0]), ['gr.os.roi.furn', 'gr.os.inv.fee', 'gr.os.inv.deposit', 'gr.os.inv.total'].map(k => en(k).split(' ')[0]));
  // A store that has a vehicle of its own since: a row of its own, no plan figure.
  await page.evaluate(site => { const c = D.payback.sites[site].cost; c.vehicles = 98000; c.firm += 98000; drawOpenStore(); }, SITE);
  const vehicles = await pvRow(page, en('gr.os.roi.vehicles'));
  assert.ok(vehicles, 'a Vehicles row');
  assert.deepEqual(vehicles.slice(-3), ['–', '$98,000', '']);
  await page.evaluate(site => { D.payback.sites[site] = {costCentre: true, cost: {firm: 1, self: 1}, exact: true, opened: 30, profit: -5}; drawOpenStore(); }, SITE);
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.norow', {address: '9 Broadway Street'}, {}));
});

test('a real _payback() row from a payload snapshot draws in step 6', async t => {
  const page = await board(t);
  await openedPlan(page, {opened: 3});
  const real = JSON.parse(require('node:fs').readFileSync(path.join(ROOT, 'tests/fixtures/payload_snapshot/data_day40.json'), 'utf8')).payback.sites['ba:street_broadwaystreet#19'];
  assert.ok(real.days && real.days.length, 'the snapshot carries the days');
  await page.evaluate(({site, real}) => { D.payback.sites[site] = real; osPlan().opened = null; drawOpenStore(); }, {site: SITE, real});
  await goOpen(page);
  const k = await tiles(page);
  assert.match(k[0], new RegExp(enRe('gr.os.roi.invested').source + ' ' + ('$' + Math.round(real.cost.firm).toLocaleString('en-US')).replace(/[$]/g, '\\$&'), 'i'));
  assert.match(k[1], new RegExp(enRe('gr.os.roi.soFar').source + ' \\$' + Math.round(real.profit).toLocaleString('en-US'), 'i'));
  assert.match(k[3], new RegExp(real.firm.days.toLocaleString('en-US') + ' ' + enRe('gr.os.roi.togo', {n: real.firm.days}).source));
  assert.equal(await page.locator('#osBody svg.os-chart .os-dbar').count(), Math.min(real.days.length, 9999));
});
