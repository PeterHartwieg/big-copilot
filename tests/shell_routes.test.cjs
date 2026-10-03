// The redesign's shell (docs/architecture.md, Routes): canonical routes, where a
// finding or a task lands and stays, the Overview's order and state on the way
// back, the keyboard, and the counts the shell shows on every page. The board
// is the CLI page rendered from the synthetic day-47 payload snapshot
// (tests/fixtures/payload_snapshot/, never a real save); with BOARD_TARGET=web
// it is the built web/index.html, its own files served beside it, given the
// same payload on every load (a reload included, as a resumed source is).
// Install Playwright and its Chromium browser to run; NODE_PATH may point at an
// existing installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const ROOT = path.join(__dirname, '..');
const WEB = process.env.BOARD_TARGET === 'web';
const SNAPSHOT = path.join(ROOT, 'tests', 'fixtures', 'payload_snapshot', 'data_day47_history.json');
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

/* The board at `hash`, in a context of its own (its storage survives a reload). */
async function board(t, {hash = '#overview', width = 1440, height = 900, scheme = 'dark', init = null} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce', colorScheme: scheme});
  t.after(() => context.close());
  // Something to set up before the page runs (storage refused, say).
  if(init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await context.route('https://**', route => route.abort());
  await context.route('https://shell.test/**', route => {
    const p = new URL(route.request().url()).pathname;
    if(p === '/') return route.fulfill({contentType: 'text/html; charset=utf-8', body: html});
    // The web build's own files (app.js, i18n.js, community.js, the wiki's data).
    const f = path.join(ROOT, 'web', decodeURIComponent(p));
    return WEB && fs.existsSync(f) ? route.fulfill({path: f}) : route.fulfill({status: 404, body: ''});
  });
  if(WEB) await context.addInitScript(raw => {
    window.addEventListener('load', () => { document.body.classList.add('has-board'); takeData(raw); boot(); });
  }, JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')));
  await page.goto('https://shell.test/' + hash, {waitUntil: 'load'});
  await page.waitForFunction(() => typeof route === 'string' && typeof hasData === 'function' && hasData());
  return page;
}
const where = page => page.evaluate(() => ({route, page, hash: location.hash, site: siteOpen ? siteKey : null,
  lit: (document.querySelector('#localNav a.on') || {}).dataset?.route || null}));
const back = async page => { await page.goBack(); await page.waitForTimeout(150); };
const forward = async page => { await page.goForward(); await page.waitForTimeout(150); };

// --- the tables ------------------------------------------------------------------------

test('every finding kind names a real route, and every route is a view of its area', async t => {
  const page = await board(t);
  const got = await page.evaluate(() => ({
    kinds: ALERT_GROUPS.map(g => g.id), routed: Object.keys(FINDING_ROUTES),
    bad: Object.entries(FINDING_ROUTES).filter(([, f]) => !ROUTES[f.route]).map(([k]) => k),
    views: AREAS.flatMap(a => (a.views || []).map(v => `${a.id}/${v}`)).filter(id => !ROUTES[id]),
  }));
  assert.equal(got.kinds.length, 32, 'the finding catalogue is 32 kinds');
  assert.deepEqual([...got.routed].sort(), [...got.kinds].sort());
  assert.deepEqual(got.bad, []);
  assert.deepEqual(got.views, []);
});

test('a shortfall a route feeds is a delivery; one an import still falls short of is an import', async t => {
  const page = await board(t);
  const routeOf = key => page.evaluate(k => findingRoute({group: 'shortfall', i18n: {text: [k, {}]}}).route, key);
  assert.equal(await routeOf('f.shortfall.route'), 'supply/deliveries');
  assert.equal(await routeOf('f.shortfall.route.paused'), 'supply/deliveries');
  assert.equal(await routeOf('f.shortfall.routed'), 'supply/imports');
  assert.equal(await routeOf('f.shortfall.routed.paused'), 'supply/imports');
  assert.equal(await routeOf('f.shortfall'), 'supply/imports');
});

test('a share is shown with its decimals: 64.0% satisfied is 64, and 64.5% is 64.5', async t => {
  const page = await board(t);
  const amounts = await page.evaluate(() => [
    findingAmount({group: 'satisfaction', text: 'Customer satisfaction at 64.0%', amt: {n: 64.0, unit: 'satisfied', sign: '%'}}),
    findingAmount({group: 'satisfaction', text: 'Customer satisfaction at 64.5%', amt: {n: 64.5, unit: 'satisfied', sign: '%'}}),
    findingAmount({group: 'promotion', text: 'HART. Gifts can reach 80% promotion', amt: {n: 80, unit: 'promotion', sign: '%'}}),
    findingAmount({group: 'promotion', text: 'HART. Gifts can reach 72.5% promotion', amt: {n: 72.5, unit: 'promotion', sign: '%'}}),
  ]);
  assert.deepEqual(amounts, ['64%<small>satisfied</small>', '64.5%<small>satisfied</small>',
    '80%<small>promotion</small>', '72.5%<small>promotion</small>']);
  // And on the Overview itself: no "0%" beside a 64.0% sentence, and no "64%"
  // either, since the sentence already holds it (declutter G6).
  const row = page.locator('#alerts .find[data-kind="satisfaction"]').first();
  assert.match(await row.locator('.what').textContent(), /64\.0%/);
  assert.equal(await row.locator('.amt').count(), 0);
  assert.equal(await page.evaluate(() => ovEcho('64%<small>satisfied</small>', 'Customer satisfaction at 64.0%')), true);
  assert.equal(await page.evaluate(() => ovEcho('$450<small>/day</small>', 'Umbrella import is paused')), false);
});

// --- landings keep their route -----------------------------------------------------------

test('a promotion finding lands on Businesses › Standards, and Results gets its own portfolio back', async t => {
  const page = await board(t);
  await page.evaluate(() => { ovShowAll = true; drawAlerts(); });
  await page.locator('#alerts .find[data-kind="promotion"] .ov-act').click();
  const w = await where(page);
  assert.deepEqual([w.route, w.page, w.lit], ['businesses/standards', 'company', 'businesses/standards']);
  assert.equal(await page.evaluate(() => [sub.company, view].join()), 'standards,ops');
  assert.equal(await page.locator('#secPortfolio').isVisible(), true);
  await page.locator('#localNav a[data-route="businesses/results"]').click();
  assert.equal(await page.evaluate(() => view), 'pnl', 'Results shows profit and loss, not Standards\' comparison');
});

test('a shop opened from Products & prices stays under it: two shops, Back, Forward and a reload', async t => {
  const page = await board(t, {hash: '#businesses/prices'});
  const shops = await page.$$eval('#viewCtl [data-price-pick]', b => b.map(x => x.dataset.pricePick));
  assert.ok(shops.length >= 2, 'the fixture runs two shops');
  for (const key of shops.slice(0, 2)) {
    await page.evaluate(() => openRoute('businesses/prices'));
    // Its prices beside the market's, then its shelves on its own page.
    await page.locator(`#viewCtl [data-price-pick="${key}"]`).click();
    assert.equal(await page.locator(`#viewCtl [data-price-pick="${key}"]`).getAttribute('aria-pressed'), 'true');
    await page.locator(`#secPrices [data-price-site="${key}"]`).click();
    await page.waitForFunction(() => siteOpen && !!document.querySelector('#sp-shelves'));
    const w = await where(page);
    assert.deepEqual([w.route, w.site, w.lit], ['businesses/prices', key, 'businesses/prices'], key);
    assert.match(w.hash, /^#site\//);
  }
  await back(page);
  assert.deepEqual((await where(page)).route, 'businesses/prices');
  await forward(page);
  let w = await where(page);
  assert.deepEqual([w.route, w.site, w.lit], ['businesses/prices', shops[1], 'businesses/prices']);
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData() && siteOpen);
  w = await where(page);
  assert.deepEqual([w.route, w.site, w.lit], ['businesses/prices', shops[1], 'businesses/prices'], 'a reload keeps it');
});

test('Staffing › Schedules keeps the business picked through a reload, its page keeps the route, and a wholesale finding lands on Deliveries', async t => {
  const page = await board(t, {hash: '#staffing/schedules'});
  const keys = await page.$$eval('#secSchedules [data-sched-pick]', bs => bs.map(b => b.dataset.schedPick));
  const key = keys.at(-1);
  await page.locator(`#secSchedules [data-sched-pick="${key}"]`).click();
  assert.equal(await page.locator(`#secSchedules [data-sched-pick="${key}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => (history.state || {}).nxSch.pick), key, 'the entry keeps the pick');
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  assert.equal(await page.locator(`#secSchedules [data-sched-pick="${key}"]`).getAttribute('aria-pressed'), 'true', 'a reload keeps it');
  await page.locator('#schDetail [data-sched-site]').click();
  await page.waitForFunction(() => siteOpen);
  let w = await where(page);
  assert.deepEqual([w.route, w.site, w.lit], ['staffing/schedules', key, 'staffing/schedules']);
  await page.evaluate(() => { history.back(); });
  await page.waitForFunction(() => !siteOpen);
  await page.evaluate(() => { openRoute('overview'); ovShowAll = true; drawAlerts(); });
  await page.locator('#alerts .find[data-kind="wholesale"] .ov-act').click();
  await page.waitForFunction(() => route === 'supply/deliveries');
  w = await where(page);
  assert.deepEqual([w.route, w.lit, w.site], ['supply/deliveries', 'supply/deliveries', null]);
  assert.equal(await page.locator('#secDeliveries tr.sb-arrived').count(), 1, 'on its row');
  await back(page); await forward(page);
  w = await where(page);
  assert.deepEqual([w.route, w.lit], ['supply/deliveries', 'supply/deliveries'], 'Forward keeps it');
});

test('staffing landings use a factory\'s Production without supply facts and an office\'s Schedule action without office plans', async t => {
  const page = await board(t);
  const got = await page.evaluate(() => {
    const factory = D.businesses.find(b => b.typeSlug === 'ba:businesstype_factory');
    const supply = D.supply;
    D.supply = null;
    const atFactory = ovAtFactory({group: 'staff', site: factory.name, siteKey: factory.key});
    D.supply = supply;
    const office = {key: 'ba:street_nowhere#1', name: 'Test Office', status: 'office'};
    const shop = D.businesses.find(b => b.status === 'retail');
    return {atFactory, route: (() => { D.supply = null; const r = findingRoute({group: 'staff', site: factory.name, siteKey: factory.key}).route; D.supply = supply; return r; })(),
      office: nxStaffInto(office), shop: nxStaffInto(shop)};
  });
  assert.deepEqual(got, {atFactory: true, route: 'supply/production', office: '#sitePanel .sp-acts', shop: '#sp-sched'});
});

// --- Find a location keeps its filters ---------------------------------------------------

test('Find a location opened without a preset keeps the reader\'s filters through Back, Forward and a reload', async t => {
  const page = await board(t);
  await page.evaluate(() => openRoute('expansion/finder', {preset: {cat: 'office', type: '', hoods: null}}));
  await page.waitForFunction(() => typeof cityMapPage !== 'undefined' && cityMapPage && cityMapPage.finderOn());
  await page.evaluate(() => cityMapPage.ready);
  await page.evaluate(() => { cityMapPage.fs.minM2 = 120; cityMapPage.fs.show = 'takeover'; cityMapPage.saveFinder(); });
  const kept = () => page.evaluate(() => ({cat: cityMapPage.fs.cat, minM2: cityMapPage.fs.minM2, show: cityMapPage.fs.show, on: cityMapPage.finderOn()}));
  const want = {cat: 'office', minM2: 120, show: 'takeover', on: true};
  await page.locator('#nav a[data-id="overview"]').click();
  await back(page);
  assert.deepEqual(await kept(), want, 'Back');
  await back(page); await forward(page);
  assert.deepEqual(await kept(), want, 'Forward');
  await page.evaluate(() => openRoute('expansion/demand'));
  await page.locator('#localNav a[data-route="expansion/finder"]').click();
  assert.deepEqual(await kept(), want, 'the area\'s own row');
  await page.reload();
  await page.waitForFunction(() => typeof cityMapPage !== 'undefined' && cityMapPage && cityMapPage.finderOn());
  await page.evaluate(() => cityMapPage.ready);
  assert.deepEqual(await kept(), want, 'a reload');
  assert.equal((await where(page)).route, 'expansion/finder');
});

// --- Supply: the diagram is Goods flow -----------------------------------------------------

test('Goods flow is a view of its own: its tab moves Supply to the picture, a reload keeps it, and Back returns to the view before', async t => {
  const page = await board(t, {hash: '#supply/imports'});
  // No second way there on the view, and no Table toggle on the picture: the row of views does both.
  assert.equal(await page.locator('#secImports .sbv-bar [data-sb-toflow]').count(), 0);
  await page.locator('#localNav a[data-route="supply/flow"]').click();
  let w = await where(page);
  assert.deepEqual([w.route, w.hash, w.lit], ['supply/flow', '#supply/flow', 'supply/flow']);
  assert.equal(await page.locator('#secFlow .sb-diag #flow').count(), 1);
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  assert.equal((await where(page)).route, 'supply/flow');
  assert.equal(await page.locator('#secFlow .sb-diag #flow').count(), 1);
  assert.equal(await page.locator('#secFlow [data-sb-totable]').count(), 0);
  await back(page);
  w = await where(page);
  assert.equal(w.route, 'supply/imports', 'Back goes to the view the reader came from');
  assert.equal(w.lit, 'supply/imports');
});

// --- the Overview's order and state --------------------------------------------------------

test('after the masthead brings the Overview back, a refresh appends a new finding and says so', async t => {
  const page = await board(t, {hash: '#supply/changes'});
  await page.locator('#nav a[data-id="overview"]').click();
  const before = await page.$$eval('#alerts .find.crit', r => r.map(x => x.dataset.id));
  await page.evaluate(() => {
    const next = JSON.parse(JSON.stringify(dataEn ? dataEn() : D));
    next.alerts = [{...next.alerts.find(a => a.level === 'critical'), id: 'zz-new', text: 'A new finding', site: next.businesses[0].name, siteKey: next.businesses[0].key}, ...next.alerts];
    takeData(next); renderCalm(true);
  });
  const now = await page.$$eval('#alerts .find.crit', r => r.map(x => x.dataset.id));
  assert.deepEqual(now, [...before, 'zz-new'], 'the rows on screen keep their places; the new one is last');
  assert.equal(await page.locator('#alerts .find[data-id="zz-new"]').evaluate(r => r.classList.contains('ov-new')), true);
  assert.equal(await page.locator('#ovNews').isVisible(), true);
});

test('leaving the Overview by the masthead keeps its filters and "Show N more" for Back', async t => {
  const page = await board(t);
  await page.locator('[data-ov-more]').click();
  await page.locator('#alertHead .sev[data-kind="opp"]').click();
  await page.locator('#nav a[data-id="supply"]').click();
  await back(page);
  const got = await page.evaluate(() => ({route, all: ovShowAll, off: [...sevOff]}));
  assert.deepEqual(got, {route: 'overview', all: true, off: ['opp']});
});

test('a filtered list is never an empty one with its rows folded away', async t => {
  const page = await board(t);
  await page.locator('#alertHead .sev[data-kind="crit"]').click();
  const shown = await page.$$eval('#alerts .find', rows => rows.filter(r => r.getClientRects().length).length);
  assert.ok(shown >= 13, `every warning the filter keeps shows (${shown})`);
  assert.equal(await page.locator('#ovMore').isHidden(), true);
  // The filters are switches in full-strength text, off drawn as an outline.
  const off = await page.locator('#alertHead .sev[data-kind="crit"]').evaluate(b =>
    [b.getAttribute('aria-pressed'), getComputedStyle(b).opacity]);
  assert.deepEqual(off, ['false', '1']);
});

test('a finding below the line comes back as itself, not as gone', async t => {
  const page = await board(t);
  await page.locator('#alertMinor [data-td-toggle="below"]').click();
  const row = page.locator('#alertMinor .find').first();
  const id = await row.getAttribute('data-id');
  await row.locator('.ov-act').click();
  await page.waitForFunction(() => location.hash !== '#overview');
  await page.locator('#arrive .nx-back').click();
  await page.waitForFunction(() => route === 'overview');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#ovNews').isHidden(), true, 'no "no longer on the list" line');
  assert.equal(await page.locator(`#alertMinor .find[data-id="${id}"]`).count(), 1);
});

test('the keyboard goes with a finding and comes back to it', async t => {
  const page = await board(t);
  const act = page.locator('#alerts .find.crit .ov-act').first();
  const id = await page.locator('#alerts .find.crit').first().getAttribute('data-id');
  await act.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash !== '#overview');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'arrive', 'the arrival strip has the keyboard');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.nx), 'back', 'and its way back is the next Tab');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => route === 'overview');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => {
    const el = document.activeElement;
    return el.classList.contains('ov-act') && el.closest('.find').dataset.id;
  }), id, 'back on the finding\'s action');
});

// --- the shell's counts ------------------------------------------------------------------

test('the critical count follows a refresh made away from the Overview, which waits for its visit', async t => {
  const page = await board(t, {hash: '#supply/imports'});
  const count = () => page.$eval('#nav [data-nav-crit]', b => b.hidden ? 0 : +b.textContent);
  const was = await count();
  await page.evaluate(() => {
    const next = JSON.parse(JSON.stringify(dataEn ? dataEn() : D));
    next.alerts = [{...next.alerts.find(a => a.level === 'critical'), id: 'zz-away'}, ...next.alerts];
    takeData(next); renderCalm(true);
  });
  assert.equal(await count(), was + 1);
  assert.equal(await page.evaluate(() => [...pageStale].some(r => /drawAlerts/.test(String(r[1])))), true,
    'the list itself is drawn when the Overview opens');
});

// --- Staffing: Payroll and Staff needs are two views --------------------------------------

test('Staffing › Payroll draws Payroll; Staff needs carries the demands and the hiring page', async t => {
  const page = await board(t, {hash: '#staffing/payroll'});
  assert.equal(await page.locator('[data-view-ctl="staffing/payroll"] h2').textContent(), en("co.pay.title"));
  await page.locator('#localNav a[data-route="staffing/needs"]').click();
  assert.equal(await page.locator('#secNeeds #nxDemands').isVisible(), true);
  assert.equal(await page.locator('#secStaff .hs-head h2').textContent(), en("co.needs.hire.title"));
  assert.equal(await page.locator('#secPayroll').isHidden(), true);
});

// --- review round 2 (c1-final-code-review, c1-final-visual-qa, c1-final-functional-qa) -------

test('the dark theme keeps the shell\'s own colours, and a finding\'s kind label reads on the ground and a surface', async t => {
  for (const scheme of ['dark', 'light']) {
    const page = await board(t, {scheme});
    const got = await page.evaluate(() => {
      /* A colour as [r, g, b], and the contrast of two, as WCAG counts it. */
      const rgbOf = c => { const p = document.createElement('i'); p.style.color = c; document.body.append(p);
        const m = getComputedStyle(p).color.match(/[\d.]+/g).map(Number); p.remove(); return m.slice(0, 3); };
      const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
        return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      const v = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      /* The small-caps label a row carries (its "new" marker): a probe where
         no row is new, since the kind tag is the headline's tip now. */
      let label = document.querySelector('#alerts .find .ov-k');
      if(!label){ label = document.createElement('span'); label.className = 'ov-k'; label.textContent = 'KIND';
        document.querySelector('#alerts .find .ov-l1').append(label); }
      const ink = getComputedStyle(label).color.match(/[\d.]+/g).map(Number).slice(0, 3);
      return {soft: ['--neg-soft', '--warn-soft', '--info-soft'].map(v), ink3: v('--ink-3'),
        ground: ratio(ink, rgbOf(v('--ground'))), surface: ratio(ink, rgbOf(v('--surface'))),
        // the critical mark's ring is painted with --neg-soft
        ring: getComputedStyle(document.querySelector('#alerts .find.crit .mark')).boxShadow};
    });
    assert.ok(got.soft.every(Boolean), `${scheme}: the soft tints are set: ${got.soft}`);
    if (scheme === 'dark') assert.equal(got.ink3, '#808a84', 'dark --ink-3 is the shell\'s, not the base theme\'s');
    assert.ok(got.ground >= 4.5, `${scheme}: kind label on the ground ${got.ground.toFixed(2)}`);
    assert.ok(got.surface >= 4.5, `${scheme}: kind label on a surface ${got.surface.toFixed(2)}`);
    assert.notEqual(got.ring, 'none', `${scheme}: the critical mark has its ring`);
  }
});

test('#staff lands on the hiring block of Staff needs; #staffing/needs opens at its top', async t => {
  const page = await board(t, {hash: '#staff', height: 700});
  await page.waitForTimeout(300);
  const at = () => page.evaluate(() => ({route, y: Math.round(scrollY),
    staff: Math.round(document.getElementById('secStaff').getBoundingClientRect().top),
    needs: Math.round(document.getElementById('secNeeds').getBoundingClientRect().top)}));
  const staff = await at();
  assert.equal(staff.route, 'staffing/needs');
  assert.ok(staff.y > 0 && staff.staff >= 0 && staff.staff < 200, `the hiring block is at the top: ${JSON.stringify(staff)}`);
  assert.ok(staff.needs < staff.staff, 'the staff demands are above it, scrolled past');
  await page.evaluate(() => { location.hash = '#secStaff'; });
  await page.waitForTimeout(300);
  const sec = await at();
  assert.ok(sec.staff >= 0 && sec.staff < 200, `#secStaff too: ${JSON.stringify(sec)}`);
  await page.evaluate(() => openRoute('staffing/needs'));
  await page.waitForTimeout(300);
  assert.equal((await at()).y, 0, 'the view itself opens at its top');
});

test('the finder switch moves the page between City map and Expansion › Find a location, both ways', async t => {
  const page = await board(t, {hash: '#map'});
  await page.waitForFunction(() => typeof cityMapPage !== 'undefined' && cityMapPage && cityMapPage.panel);
  await page.evaluate(() => cityMapPage.ready);
  const lit = () => page.evaluate(() => ({route, hash: location.hash,
    area: (document.querySelector('#nav a.on, #nav a[aria-current="page"]') || {}).dataset?.id || null,
    ref: (document.querySelector('#navRefs a.on, #navRefs a[aria-current="page"]') || {}).dataset?.id || null,
    view: (document.querySelector('#localNav a.on') || {}).dataset?.route || null,
    on: cityMapPage.finderOn()}));
  assert.deepEqual(await lit(), {route: 'map', hash: '#map', area: null, ref: 'map', view: null, on: false});
  await page.locator('#cityMapPage [data-f="tog"]').click();
  assert.deepEqual(await lit(), {route: 'expansion/finder', hash: '#expansion/finder', area: 'expansion', ref: null,
    view: 'expansion/finder', on: true});
  await page.locator('#cityMapPage [data-f="tog"]').click();
  assert.deepEqual(await lit(), {route: 'map', hash: '#map', area: null, ref: 'map', view: null, on: false});
  // Switched on and left on, the City map from the masthead is still the
  // City map (chunk 3: the finder is its own route, and Back moves between them).
  await page.locator('#cityMapPage [data-f="tog"]').click();
  await page.evaluate(() => openRoute('overview'));
  await page.locator('#navRefs a[data-id="map"]').click();
  assert.deepEqual(await lit(), {route: 'map', hash: '#map', area: null, ref: 'map', view: null, on: false});
});

test('"Whom should I hire?" lands on Staff needs\' hiring block, with the way back to where it was asked', async t => {
  const page = await board(t);
  await page.evaluate(() => ssAsk('hire'));
  await page.waitForSelector('#pageStaffing .ss-asked');
  const got = await page.evaluate(() => ({route, page, hash: location.hash, sub: sub.staffing,
    strip: document.querySelector('#pageStaffing .ss-asked').innerText.replace(/\s+/g, ' '),
    staff: Math.round(document.getElementById('secStaff').getBoundingClientRect().top)}));
  assert.equal(got.route, 'staffing/needs');
  assert.equal(got.page, 'staffing');
  assert.equal(got.hash, '#staffing/needs');
  assert.equal((await where(page)).lit, 'staffing/needs', 'the area\'s row lights Staff needs');
  assert.match(got.strip, new RegExp(enRe("nav.ask.hire.q").source + ".*" + enRe("nav.ask.hire.lands.needs").source + ".*" + enRe("nav.ask.back", {page: en("nav.area.overview")}).source));
  assert.ok(got.staff >= 0 && got.staff < 300, `the hiring block is on screen: ${got.staff}`);
  await page.locator('#pageStaffing .ss-asked [data-ss="back"]').click();
  await page.waitForTimeout(200);
  assert.equal((await where(page)).route, 'overview');
});

test('on a 320 x 568 phone, and at 130% on 390 x 844, the first critical finding and its action are above the bar', async t => {
  for (const [width, height, zoom] of [[320, 568, 0], [390, 844, 1.3]]) {
    const page = await board(t, {width, height});
    if (zoom) { await page.evaluate(z => { document.documentElement.style.zoom = z; }, zoom); await page.waitForTimeout(200); }
    const m = await page.evaluate(() => {
      const row = document.querySelector('#alerts .find.crit'), r = el => el.getBoundingClientRect();
      return {what: r(row.querySelector('.what')).bottom, act: r(row.querySelector('.ov-act')).bottom,
        bar: r(document.getElementById('phoneNav')).top,
        ctx: document.getElementById('ovCtx').innerText.replace(/\s+/g, ' '),
        over: [...document.querySelectorAll('#alerts .find .ov-act')].filter(a => a.offsetParent && a.scrollWidth > a.clientWidth + 1).length,
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth};
    });
    const what = `${width}x${height}${zoom ? ' at 130%' : ''}`;
    assert.ok(m.what < m.bar && m.act <= m.bar, `${what}: headline ${m.what}, action ${m.act}, bar ${m.bar}`);
    // The day is in the sidebar, a drawer here: one tap on Map & more.
    await page.locator('#phoneMore').click();
    assert.equal(await page.locator('#clock > b').isVisible(), true, `${what}: the day is in the drawer`);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#clock > b').isVisible(), false, `${what}: Escape closes the drawer`);
    assert.match(m.ctx, new RegExp(enRe("today.ctx.profit").source + ".*" + enRe("today.ctx.cash").source + ".*" + enRe("today.ctx.all").source));
    assert.equal(m.over, 0, `${what}: every action's words are inside its button`);
    assert.equal(m.sideways, false, `${what}: nothing scrolls sideways`);
  }
});

test('Staffing › Schedules is named for shops and offices, in the board\'s words', async t => {
  const page = await board(t, {hash: '#staffing/schedules'});
  // The heading, for screen readers: the lit tab shows the view, and no line under it restates it (declutter G1, G9).
  const head = await page.locator('#secSchedules > .sechead').textContent();
  assert.match(head, enRe("co.sched.title.all"));
  assert.equal(await page.locator('#secSchedules > .sechead .quiet').count(), 0);
  // Pins the wording: scheduling vocabulary excludes roster, shift and post.
  assert.doesNotMatch(head, /\b(roster|shifts?|posts?)\b/i);
});

/* Chunk 1's office line (review note 2): the plural follows the computers. */
test('Staffing › Schedules counts an office default\'s computers in the right number', async t => {
  const page = await board(t, {hash: '#staffing/schedules'});
  const line = n => page.evaluate(n => {
    const key = 'ba:street_testoffice#1';
    if(!D.businesses.some(b => b.key === key))
      D.businesses.push({key, status: 'office', name: 'Test Office', code: 'TO', type: 'Office', neighbourhood: null, lines: [], people: [], crew: []});
    D.officeStaffing = [{key, computers: n, staffedComputers: 1, shifts: [{d: 1, f: 8, t: 16, s: 0, p: 0}], roles: [], stations: [], people: []}];
    drawSchedules();
    return document.querySelector(`#secSchedules [data-sched-pick="${key}"] .st`).textContent;
  }, n);
  assert.equal(await line(1), en("co.sched.office.plan", {s: "1", n: 1}));
  assert.equal(await line(3), en("co.sched.office.plan", {s: "1", n: 3}));
});

/* The attention journey of the redesign's acceptance: a finding opens its
   import on Imports, Goods flow follows the depot, and the way back finds
   the finding where the reader left it. */
test('a finding opens Imports on its line, Goods flow follows the depot, and the way back finds the finding', async t => {
  const page = await board(t);
  const hub = 'ba:street_eighthavenue#4';
  await page.evaluate(hub => {
    D.alerts.unshift({id: 'jny-order', level: 'critical', group: 'order', site: 'HART. Hub', siteKey: hub,
      text: 'Water: the weekly order brings 3,000 against 16,800', ev: {slug: 'ba:itemname_water'}});
    ovForget(); drawAlerts();
  }, hub);
  await page.locator('#alerts .find[data-id="jny-order"] .ov-act').click();
  await page.waitForFunction(() => route === 'supply/imports');
  // The card reviews the line, lit, and the strip says why the reader is here.
  assert.match(await page.locator('#sbCard[data-sb-at] .sbi-title').textContent(), /Water · HART\. Hub/);
  // The place and the item; the kind is the card's to say, and the back button says where from.
  assert.match(await page.locator('#arrive').textContent(), /Water · HART\. Hub/);
  // Pins the wording: the obsolete arrival prompt must stay absent.
  assert.doesNotMatch(await page.locator('#arrive').textContent(), new RegExp(enRe("nav.kind.order.label").source + "|You came from"));
  // Its supply route, followed.
  await page.locator('#sbCard [data-sb-toflow]').click();
  await page.waitForFunction(() => route === 'supply/flow');
  assert.equal(await page.evaluate(() => flowPickId), hub);
  assert.match(await page.locator('#sbFlowPanel').textContent(), /HART\. Hub/);
  assert.match(await page.locator('#arrive').textContent(), /Water · HART\. Hub/, 'the arrival rides along');
  // Back: Imports, the card as it was.
  await back(page);
  assert.equal((await where(page)).route, 'supply/imports');
  assert.match(await page.locator('#sbCard .sbi-title').textContent(), /Water · HART\. Hub/);
  await forward(page);
  assert.equal((await where(page)).route, 'supply/flow');
  // The strip's way back: the Overview, the finding in its place, with the focus.
  await page.locator('#arrive [data-nx="back"]').click();
  await page.waitForFunction(() => route === 'overview');
  await page.waitForFunction(() => document.activeElement && document.activeElement.closest && document.activeElement.closest('.find[data-id="jny-order"]'));
  // A reload of Imports keeps its line, its scope and its filter.
  await page.goto('https://shell.test/#supply/imports', {waitUntil: 'load'});
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  await page.evaluate(() => { sbScope.imports = 'warehouses'; sbMode.imports = 'all'; sbAgain('imports'); });
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData() && route === 'supply/imports');
  assert.deepEqual(await page.evaluate(() => [sbScope.imports, sbMode.imports]), ['warehouses', 'all']);
});

test('the building picked in Find a location comes back after a reload; one no longer in the results is dropped', async t => {
  const page = await board(t, {hash: '#expansion/finder'});
  const ready = async () => {
    await page.waitForFunction(() => typeof cityMapPage !== 'undefined' && cityMapPage && cityMapPage.finderOn());
    await page.evaluate(() => cityMapPage.ready);
  };
  await ready();
  // The synthetic save's rivals: its city has no empty retail floor to rent.
  await page.locator('#cityMapPage [data-show="takeover"]').click();
  await page.waitForSelector('#cityMapPage .place[data-pick]');
  const key = await page.locator('#cityMapPage .place[data-pick]').first().getAttribute('data-pick');
  await page.locator(`#cityMapPage .place[data-pick="${key}"]`).click();
  const picked = () => page.evaluate(() => ({selected: cityMapPage.selected, pressed: (document.querySelector('#cityMapPage .place.on') || {}).dataset?.pick || null,
    state: (history.state || {}).nxPick || null}));
  assert.deepEqual(await picked(), {selected: key, pressed: key, state: key});
  await page.reload();
  await ready();
  await page.waitForFunction(k => cityMapPage.selected === k && document.querySelector('#cityMapPage .place.on'), key);
  assert.deepEqual(await picked(), {selected: key, pressed: key, state: key}, 'a reload picks it again');
  assert.equal((await where(page)).route, 'expansion/finder');
  // A pick the results no longer hold is dropped, not faked.
  await page.evaluate(() => history.replaceState({...(history.state || {}), nxPick: 'ba:street_nowhere#0'}, '', location.href));
  await page.reload();
  await ready();
  await page.waitForFunction(() => !(history.state || {}).nxPick);
  assert.deepEqual(await picked(), {selected: null, pressed: null, state: null});
});

// --- recheck (c1-recheck-code-sol, c1-recheck-functional): the finder's pick and history ------

/* Find a location on the takeover list, ready, with the picked building's
   state: the live pick, the pressed row, its card and the entry's nxPick. */
async function finderOn(page){
  await page.waitForFunction(() => typeof cityMapPage !== 'undefined' && cityMapPage && cityMapPage.finderOn());
  await page.evaluate(() => cityMapPage.ready);
}
const finderPick = page => page.evaluate(() => ({
  selected: cityMapPage.selected,
  pressed: (document.querySelector('#cityMapPage .place.on') || {}).dataset?.pick || null,
  card: !!document.querySelector('#cityMapPage .site.in:not([hidden])'),
  state: (history.state || {}).nxPick || null, route}));
const settled = (page, key) => page.waitForFunction(k => cityMapPage.selected === k
  && (!k || (document.querySelector('#cityMapPage .place.on') || {}).dataset?.pick === k), key);

test('two visits to Find a location keep their own picks through Back and Forward', async t => {
  const page = await board(t, {hash: '#expansion/finder'});
  await finderOn(page);
  // The synthetic save has one rival to take over; a second, on another street
  // address the map knows, gives two picks to tell apart. Nothing reloads here.
  await page.evaluate(() => {
    const P = premises(), rival = P.buildings.find(x => x.status === 'rival');
    const other = [...cityMapPage.assets.byKey.keys()].find(k => /^ba:street_/.test(k) && !P.buildings.some(x => x.key === k));
    P.buildings.push({...rival, key: other, address: 'Second rival'});
  });
  await page.locator('#cityMapPage [data-show="takeover"]').click();
  await page.waitForSelector('#cityMapPage .place[data-pick]');
  const [a, b] = await page.$$eval('#cityMapPage .place[data-pick]', rows => rows.slice(0, 2).map(r => r.dataset.pick));
  assert.ok(a && b && a !== b, 'two rivals to pick between');
  await page.locator(`#cityMapPage .place[data-pick="${a}"]`).click();
  await settled(page, a);
  // Overview, then Expansion from the masthead: a new visit, which takes the pick on screen.
  await page.locator('#nav a[data-id="overview"]').click();
  await page.locator('#nav a[data-id="expansion"]').click();
  await finderOn(page);
  await page.waitForFunction(k => (history.state || {}).nxPick === k, a);
  assert.deepEqual(await finderPick(page), {selected: a, pressed: a, card: true, state: a, route: 'expansion/finder'});
  await page.locator(`#cityMapPage .place[data-pick="${b}"]`).click();
  await settled(page, b);
  assert.equal((await finderPick(page)).state, b);
  // Back to the Overview, then Back to the first visit: its own pick, not the one on screen.
  await back(page); await back(page);
  await settled(page, a);
  assert.deepEqual(await finderPick(page), {selected: a, pressed: a, card: true, state: a, route: 'expansion/finder'}, 'Back');
  // Forward twice: the second visit's pick again.
  await forward(page); await forward(page);
  await settled(page, b);
  assert.deepEqual(await finderPick(page), {selected: b, pressed: b, card: true, state: b, route: 'expansion/finder'}, 'Forward');
});

test('a pick carried into Find a location by the masthead survives a reload of that visit', async t => {
  const page = await board(t, {hash: '#expansion/finder'});
  await finderOn(page);
  await page.locator('#cityMapPage [data-show="takeover"]').click();
  await page.waitForSelector('#cityMapPage .place[data-pick]');
  const key = await page.locator('#cityMapPage .place[data-pick]').first().getAttribute('data-pick');
  await page.locator(`#cityMapPage .place[data-pick="${key}"]`).click();
  await settled(page, key);
  await page.locator('#nav a[data-id="overview"]').click();
  await page.locator('#nav a[data-id="expansion"]').click();
  await finderOn(page);
  await page.waitForFunction(k => (history.state || {}).nxPick === k, key);
  await page.reload();
  await finderOn(page);
  await settled(page, key);
  assert.deepEqual(await finderPick(page), {selected: key, pressed: key, card: true, state: key, route: 'expansion/finder'});
});

// --- final review: Back returns to the view left inside an area ---------------------

test('a Changes row opens its view as a new visit: Back returns to Changes; a section of another view does the same', async t => {
  const page = await board(t, {hash: '#supply/changes'});
  const len = () => page.evaluate(() => history.length);
  const before = await len();
  const row = page.locator('#secChanges [data-sb-go]').first();
  const target = JSON.parse(await row.getAttribute('data-sb-go'))[0];
  await row.click();
  let w = await where(page);
  assert.equal(w.route, `supply/${target}`);
  assert.equal(await len(), before + 1, 'a new entry');
  await back(page);
  w = await where(page);
  assert.equal(w.route, 'supply/changes', 'Back returns to Changes');
  // The search palette's way to a section on another view of the page on screen.
  await page.evaluate(() => openRoute('businesses/results'));
  await page.evaluate(() => reveal('secGoals'));
  assert.equal((await where(page)).route, 'businesses/milestones');
  await back(page);
  assert.equal((await where(page)).route, 'businesses/results');
});

test('Schedules keeps the business, its day and its now / plan view through Back, Forward and a reload', async t => {
  const page = await board(t, {hash: '#staffing/schedules'});
  const shop = await page.evaluate(() => D.businesses.find(b => b.status === 'retail' && (spRosterRow(b.key) || {}).shifts?.length).key);
  await page.locator(`#secSchedules [data-sched-pick="${shop}"]`).click();
  const tabs = page.locator('#schDetail .sp-daytabs a');
  const day = await tabs.last().getAttribute('data-day');
  await tabs.last().click();
  await page.locator('#schDetail .sp-nowplan a[data-view="now"]').click();
  const state = () => page.evaluate(() => ({pick: schedLit,
    day: (document.querySelector('#schDetail .sp-daytabs a.sp-on') || {}).dataset?.day,
    view: (document.querySelector('#schDetail .sp-nowplan a.sp-on') || {}).dataset?.view,
    now: !!document.querySelector('#schDetail .sp-gantt.sp-now')}));
  const want = {pick: shop, day, view: 'now', now: true};
  assert.deepEqual(await state(), want);
  await page.locator('#localNav a[data-route="staffing/payroll"]').click();
  await back(page);
  assert.deepEqual(await state(), want, 'Back');
  // Forward to Payroll and Back again: the same visit, as it was left.
  await forward(page);
  assert.equal((await where(page)).route, 'staffing/payroll');
  await back(page);
  assert.deepEqual(await state(), want, 'Forward, then Back');
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData() && route === 'staffing/schedules');
  assert.deepEqual(await state(), want, 'a reload');
});

// --- the sidebar (the navigation canvas's variant B) ---------------------------------------

/* Where the open area's views are, whether the top of the page holds them,
   and what the row there holds. */
const shell = page => page.evaluate(() => {
  const views = document.getElementById('localNav'), row = document.getElementById('localRow');
  const r = el => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
  return {rail: document.body.classList.contains('sd-rail'), side: r(document.getElementById('mast')),
    inSide: document.getElementById('mast').contains(views), under: views.previousElementSibling?.dataset?.id || null,
    rowShown: !row.hidden && row.getClientRects().length > 0, rowViews: row.contains(views),
    rowCtl: !document.getElementById('viewCtl').hidden, stored: localStorage.getItem('ba_dash_sidebar')};
});

test("the full sidebar holds the open area's views; the page starts with the view's controls alone, or its content", async t => {
  const page = await board(t, {hash: '#supply/imports', width: 1440});
  const bar = page.locator('#viewCtl .sbv-bar[data-view-ctl="supply/imports"]');
  await bar.waitFor();
  let s = await shell(page);
  assert.equal(s.rail, false);
  assert.ok(s.side[2] - s.side[0] >= 250 && s.side[2] - s.side[0] <= 260, `a 256 px sidebar: ${s.side}`);
  // The views under Supply, the only area open; the others fold theirs away.
  assert.equal(s.inSide, true);
  assert.equal(s.under, 'supply');
  assert.deepEqual(await page.locator('#localNav a[data-route]').evaluateAll(as => as.map(a => a.dataset.route)),
    ['supply/changes', 'supply/imports', 'supply/deliveries', 'supply/production', 'supply/flow']);
  assert.equal(await page.locator('#nav > a[data-id="businesses"] .sd-cv').isVisible(), true);
  assert.equal(await page.locator('#nav > a[data-id="supply"] .sd-cv').isVisible(), false);
  // The top of the page: the scope, the mode and the basis, and no row of views.
  assert.equal(s.rowShown, true);
  assert.equal(s.rowViews, false);
  assert.equal(await bar.locator('select[data-sb-scope], [data-sb-mode]').count() >= 3, true);
  assert.equal(await page.locator('#secImports .sb-verdict, #secImports .sbv-bar').count(), 0);
  // The summary is the view's tip, in the sidebar.
  assert.match(await page.locator('#localNav a[data-route="supply/imports"]').getAttribute('data-tip'), enRe("sb.wh.room"));
  // The sidebar comes first to the keyboard, then the page.
  assert.ok(await page.evaluate(() => !!(document.getElementById('mast').compareDocumentPosition(document.querySelector('.wrap')) & Node.DOCUMENT_POSITION_FOLLOWING)));
  assert.equal(await page.evaluate(() => document.getElementById('mast').tagName + ':' + document.getElementById('mast').getAttribute('aria-label')), 'NAV:' + en('nav.label'));
  // Another view from the sidebar: its controls take the top, the last view's go home.
  await page.locator('#localNav a[data-route="supply/deliveries"]').click();
  await page.locator('#viewCtl [data-view-ctl="supply/deliveries"]').waitFor();
  assert.equal(await page.locator('#viewCtl [data-view-ctl]').count(), 1);
  assert.equal(await page.locator('#secImports [data-view-ctl="supply/imports"]').count(), 1);
  await page.locator('#viewCtl [data-sb-mode="all"]').click();
  assert.equal(await page.evaluate(() => sbMode.deliveries), 'all');
  assert.equal(await page.locator('#viewCtl [data-view-ctl]').count(), 1, 'the redrawn row replaces the old one');
  // Another area: its views move under it; Results keeps its chart switch on top.
  await page.locator('#nav > a[data-id="businesses"]').click();
  await page.locator('#viewCtl #chartTools').waitFor();
  s = await shell(page);
  assert.equal(s.under, 'businesses');
  // A view with no controls, and the Overview, which has no views: the page starts with its content.
  await page.evaluate(() => openRoute('businesses/milestones'));
  assert.equal((await shell(page)).rowShown, false);
  await page.locator('#nav > a[data-id="overview"]').click();
  s = await shell(page);
  assert.equal(s.rowShown, false);
  assert.equal(s.inSide, false, 'no views under the Overview');
  const kpis = await page.locator('#kpis').boundingBox();
  assert.ok(kpis.y < 120, `the Overview starts with its figures: ${kpis.y}`);
});

test('the fold button makes the sidebar a rail and back, remembered on this device; the rail puts the views beside the controls', async t => {
  const page = await board(t, {hash: '#supply/imports', width: 1440});
  await page.locator('#viewCtl .sbv-bar').waitFor();
  const fold = page.locator('#sdToggle');
  assert.equal(await fold.getAttribute('aria-label'), en("nav.side.collapse"));
  assert.equal(await fold.getAttribute('aria-expanded'), 'true');
  await fold.click();
  let s = await shell(page);
  assert.equal(s.rail, true);
  assert.ok(s.side[2] - s.side[0] <= 66, `a 64 px rail: ${s.side}`);
  assert.equal(s.stored, 'rail');
  assert.equal(await fold.getAttribute('aria-label'), en("nav.side.expand"));
  assert.equal(await fold.getAttribute('aria-expanded'), 'false');
  // The views are back at the top of the page, before the controls, on one line at 1440.
  assert.equal(s.inSide, false);
  assert.equal(s.rowViews, true);
  const boxes = await page.evaluate(() => ['localNav', 'viewCtl'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left, r.top, r.bottom]; }));
  assert.ok(boxes[0][0] < boxes[1][0] && boxes[1][1] < boxes[0][2] && boxes[0][1] < boxes[1][2], `one row: ${JSON.stringify(boxes)}`);
  // The rail keeps icons: each place says its name on hover.
  assert.equal(await page.locator('#nav > a[data-id="staffing"]').getAttribute('data-tip'), en("nav.area.staffing"));
  // Its word stays in the link for a screen reader, out of sight.
  assert.ok(await page.locator('#nav > a[data-id="staffing"] > span').evaluate(el => el.getBoundingClientRect().width <= 1));
  assert.equal(await page.locator('#ssFieldBtn').isVisible(), true);
  // Remembered through a reload, and on another route.
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  s = await shell(page);
  assert.equal(s.rail, true);
  assert.equal(s.rowViews, true);
  await page.locator('#sdToggle').click();
  s = await shell(page);
  assert.equal(s.rail, false);
  assert.equal(s.stored, 'full');
  assert.equal(s.under, 'supply');
  assert.equal(await page.locator('#nav > a[data-id="staffing"]').getAttribute('data-tip'), null);
});

test('a window of 1100 px or less starts on the rail and keeps it: only a folded choice holds there; one that cannot be stored lasts the visit', async t => {
  const page = await board(t, {hash: '#supply/imports', width: 1100});
  await page.locator('#viewCtl .sbv-bar').waitFor();
  let s = await shell(page);
  assert.equal(s.rail, true);
  assert.equal(s.stored, null, 'the default is not a choice');
  assert.equal(s.rowViews, true);
  // The views on the first line, the controls wrapping to the right below them.
  const [tabs, ctl] = await page.evaluate(() => ['localNav', 'viewCtl'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return {top: r.top, bottom: r.bottom, right: r.right}; }));
  assert.ok(ctl.top >= tabs.bottom - 1, JSON.stringify({tabs, ctl}));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'nothing scrolls sideways');
  // Unfolded here, it is full for this visit; a reload in a narrow window
  // (a snapped half-screen, say) starts on the rail again (review item).
  await page.locator('#sdToggle').click();
  assert.equal((await shell(page)).rail, false);
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  s = await shell(page);
  assert.equal(s.rail, true);
  assert.equal(s.stored, 'full');
  // The same stored choice is full wider than 1100 px.
  await page.setViewportSize({width: 1300, height: 900});
  await page.waitForFunction(() => !document.body.classList.contains('sd-rail'));
  // A folded choice holds at every width.
  await page.locator('#sdToggle').click();
  await page.setViewportSize({width: 1440, height: 900});
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  assert.equal((await shell(page)).rail, true);
  // Wider than 1100 with no choice made: full.
  const wide = await board(t, {hash: '#overview', width: 1101});
  assert.equal((await shell(wide)).rail, false);
  // With storage refused the fold still works, for the visit.
  const refused = await board(t, {hash: '#supply/imports', width: 1440, init: () => {
    const no = () => { throw new Error('storage refused'); };
    Object.defineProperty(window, 'localStorage', {configurable: true, get: () => ({getItem: no, setItem: no, removeItem: no})});
  }});
  await refused.locator('#sdToggle').click();
  assert.equal(await refused.evaluate(() => document.body.classList.contains('sd-rail')), true);
  await refused.locator('#sdToggle').click();
  assert.equal(await refused.evaluate(() => document.body.classList.contains('sd-rail')), false);
});

test("the sidebar's one ··· opens beside it with What's new, Preferences and Help & feedback", async t => {
  const page = await board(t, {hash: '#overview', width: 1440});
  assert.equal(await page.locator('#mast [aria-haspopup]:visible').count(), 1, 'one ···');
  /* The local server page's own ··· (#navMore); on the hosted board, once it
     has placed its save source, that menu's ··· (#menuBtn) takes the three
     in under the source (tests/restore.test.cjs has the whole menu). */
  const own = await page.locator('#navMore').isVisible();
  const more = page.locator(own ? '#navMore' : '#menuBtn');
  const menu = page.locator(own ? '#nxMenu' : '#srcMenu .menu-panel');
  await more.click();
  assert.equal(await menu.isVisible(), true);
  assert.deepEqual(await menu.locator('[data-nx-item]').evaluateAll(els => els.map(el => el.dataset.nxItem)), ['news', 'prefs', 'help']);
  const [side, box, btn] = await Promise.all([page.locator('#mast').boundingBox(), menu.boundingBox(), more.boundingBox()]);
  assert.ok(box.x >= side.x + side.width, 'beside the sidebar');
  assert.ok(Math.abs(box.y + box.height - (btn.y + btn.height)) <= 1, 'its foot level with the button');
  await page.keyboard.press('Escape');
  assert.equal(await menu.isVisible(), false);
  if (own) assert.equal(await page.evaluate(() => document.activeElement.id), 'navMore');
});

// --- user testing, 28 September 2026 ---------------------------------------------------

test("every select on the board wears the board's look, with no native arrow", async t => {
  const page = await board(t, {hash: '#supply/imports', width: 1440});
  for (const r of ['supply/imports', 'supply/production', 'expansion/factory', 'staffing/needs']) {
    await page.evaluate(r => openRoute(r), r);
    await page.waitForTimeout(150);
    const bad = await page.evaluate(() => [...document.querySelectorAll('select')]
      .filter(s => s.getClientRects().length && getComputedStyle(s).appearance !== 'none').map(s => s.outerHTML.slice(0, 90)));
    assert.deepEqual(bad, [], r);
  }
});

test('the planning basis shows only on a view it changes, as the view is filtered', async t => {
  const page = await board(t, {hash: '#supply/imports', width: 1440});
  const views = {changes: 'secChanges', imports: 'secImports', production: 'secProduction'};
  const seen = [];
  for (const [view, sec] of Object.entries(views)) for (const mode of ['changes', 'all']) {
    const got = await page.evaluate(([view, sec, mode]) => {
      openRoute('supply/' + view);
      if (!sbMode[view] && mode === 'all') return null;
      if (sbMode[view]) sbMode[view] = mode;
      const draw = {changes: drawChangesView, imports: drawImportsView, production: drawProductionView}[view];
      draw();
      const shown = !!document.querySelector(`#sbBasis-${view}`);
      const read = () => sbText(document.getElementById(sec).innerHTML);
      const here = read();
      const there = szWith(sizing === 'dem' ? 'cap' : 'dem', () => { draw(); return read(); });
      draw();
      return {shown, differs: here !== there};
    }, [view, sec, mode]);
    if (!got) continue;
    seen.push(`${view}/${mode}:${got.shown}`);
    assert.equal(got.shown, got.differs, `${view}/${mode}: the switch ${got.shown ? 'shows' : 'is hidden'} and the other basis ${got.differs ? 'changes' : 'does not change'} the view`);
  }
  assert.ok(seen.length >= 5, seen.join(' '));
});
