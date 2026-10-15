// Shared setup for tests/open_store*.test.cjs (not open_store_model): the board
// rendered from the synthetic day-47 payload snapshot, the browser, and the
// helpers each step's tests use. Each suite that requires it renders its own
// board and launches its own browser. Not a test file itself: the leading
// underscore keeps it out of the tests/*.test.cjs glob.
const {before, after} = require('node:test');
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
  D.candidates = candidates && !noHours && !demand ? base.plans.open.hireWeeks.map((w, i) => ({id: `cand${i}`, name: `Candidate ${i}`, wage: 12, hoursLeft: 40, skill: w.skill, level: 70, skills: [{skill: w.skill, level: 70}], demands: []})) : [];
  hrSiteMemo = null;
  drawOpenStore();
  return base.plans.open.hireWeeks.length;
}, {site: SITE, noHours, candidates, demand});
const spy = page => page.evaluate(() => { window.__writes = [];
  SOURCE.write = async (kind, body, o) => { window.__writes.push({kind, body, dryRun: o && o.dryRun}); return {body: {ok: true, skipped: [], rows: []}}; }; });


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

module.exports = {assert, en, enRe, textEn, textRe, spawnSync, path, chromium, ROOT, LIQ, MID, SITE, board, steps, strip, money, planned, MKPLAN, running, LINK, rows, until, BEER, WHISKY, line, opened, linked, routed, wanted, FULL, HIRES, SHORT6, hiring, realHiring, spy, OPENED, traded, openedPlan, tiles, pvsa, pvRow, goOpen,
  get browser(){ return browser; },
  get html(){ return html; },
};
