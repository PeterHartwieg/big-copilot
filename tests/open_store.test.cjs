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
/* The business the save shows once the player has opened the plan's building. */
const opened = (page, patch = {}, built = null) => page.evaluate(({site, patch, built}) => {
  D.businesses.push(Object.assign({}, D.businesses[0], {key: site, status: 'retail', name: 'Liquor', neighbourhood: 'ba:neighborhood_midtown', typeSlug: 'ba:businesstype_liquorstore', staff: 0, missingAmenities: [],
    amenities: {bathroom: true, interior: true, music: true, sink: true, toiletprivacy: true}, uniformGaps: [], uniformGapSkills: [],
    marketing: 0, marketingIndex: 0}, patch));
  if(built) D.openStore.built[site] = built;
  drawOpenStore();
}, {site: SITE, patch, built});
const linked = (page, link = LINK) => page.evaluate(l => { SOURCE.link = () => l; drawOpenStore(); }, link);
const HIRES = {planned: true, weeks: [['ba:skill_cleaning', 'hire'], ['ba:skill_customerservice', 'hire'], ['ba:skill_customerservice', 'hire'], ['ba:skill_securityguard', null]]};
/* The hiring model as it would read with candidates for the plan's building. */
const hiring = page => page.evaluate(({site, h}) => {
  window.hrModel = () => ({sites: [{key: site, planned: h.planned, weeks: h.weeks.map(([skill, type]) => ({w: {skill}, who: type ? {type} : null}))}], moves: [], roles: [], overs: [], cands: [], byId: new Map(), used: new Set(), quick: []});
  drawOpenStore();
}, {site: SITE, h: HIRES});

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

test('the rows tick themselves from the save once a business stands at the address', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 3, marketingIndex: 20}, {placed: 61, req: [['pointofsales', 1, 1], ['anyprimaryproduct', 1, 1]]});
  await page.evaluate(() => { D.supply.facts[D.businesses.length - 1] = {'ba:item_x': {st: 'covered'}}; drawOpenStore(); });
  const r = await rows(page);
  assert.deepEqual(r.map(x => x.state), ['done', 'done', 'done', 'done', 'done', 'done', 'done']);
  assert.match(await page.locator('#osBody .os-prog').innerText(), /7 of 7/);
});

test('a half-done store shows what is missing', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 2, uniformGaps: ['Customer Service', 'Cleaning'], missingAmenities: ['ba:customerdemand_music'],
    amenities: {bathroom: true, interior: true, music: false, sink: false, toiletprivacy: true}},
    {placed: 3, req: [['anyprimaryproduct', 1, 0], ['pointofsales', 1, 1]]});
  await page.evaluate(() => { D.supply.facts[D.businesses.length - 1] = {'ba:item_x': {st: 'noplan'}, 'ba:item_y': {st: 'covered'}}; drawOpenStore(); });
  const r = await rows(page);
  assert.equal(r[0].state, 'done');
  assert.equal(r[1].state, 'part');
  assert.equal(r[3].state, 'todo');
  assert.equal(r[4].state, 'part');
  assert.equal(r[6].state, 'part');
});

test('without the game link every write is an instruction in the game, under a link strip', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, uniformGaps: ['Customer Service']});
  await hiring(page);
  assert.equal(await page.locator('#osBody [data-os-write]').count(), 0);
  assert.equal(await page.locator('#osBody .os-ck .os-ingame').count(), 3);
  assert.match(await page.locator('#osBody .os-gate').innerText(), /Link the game and these become buttons\./);
  assert.equal(await page.locator('#osBody [data-os-howlink]').count(), 1);
});

test('with the game link the same rows carry buttons', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, uniformGaps: ['Customer Service']});
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
  await opened(page, {staff: 1, uniformGaps: ['Customer Service']});
  await hiring(page);
  await linked(page, {...LINK, writes: ['hire', 'uniforms']});
  assert.deepEqual(await page.$$eval('#osBody [data-os-write]', bs => bs.map(b => b.dataset.osWrite)), ['hire', 'uniforms']);
  assert.equal(await page.locator('#osBody .os-ck .os-ingame').count(), 1);
  assert.equal(await page.locator('#osBody .os-gate').count(), 0);
});

test('Set up marketing sends the wire body and explains a refusal', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1});
  await linked(page);
  await page.evaluate(() => { window.__writes = [];
    SOURCE.write = async (kind, body, o) => { window.__writes.push({kind, body});
      return {body: {ok: false, rows: [{error: 'no_contact', agency: {name: 'CityAds', address: {street: 'ba:street_secondavenue', number: 5}}, opens: null, address: body.sites[0].address}]}}; }; });
  await page.locator('#osBody [data-os-write="marketing"]').click();
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.waitFor();
  const sent = await page.evaluate(() => window.__writes[0]);
  assert.equal(sent.kind, 'marketing');
  assert.deepEqual(sent.body.expect, {character: 'PAYLOADco', company: 'Payload Co'});
  assert.deepEqual(sent.body.sites[0].address, {street: 'ba:street_broadwaystreet', number: 9});
  assert.ok(sent.body.sites[0].on.length && sent.body.sites[0].on.every(x => /^(Small|Medium|Large)(Internet|Billboard)$/.test(x)));
  assert.match(await dlg.innerText(), /not in your phone yet/);
});

test('a running campaign leaves the marketing row done with no button', async t => {
  const page = await board(t);
  await until(page);
  await linked(page);
  await opened(page, {staff: 1, marketing: 350});
  const r = await rows(page);
  assert.equal(r[5].state, 'done');
  assert.equal(r[5].act, '');
});
