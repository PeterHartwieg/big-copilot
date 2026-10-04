// The cheapest marketing mix on the board (docs/dashboard-reference.md,
// Promotion): the Promotion block's line and Set button on a shop and an
// office, the promotion finding's action, Standards' "Set up all", and the
// write dialog for kind "marketing". The board is the real page from render(),
// its payload the real extract() of the synthetic company in
// tests/es3_fixture.py with a hand-made marketing overlay; its source is a stub
// that answers the game link's health and writes as each test says. Never a
// real save. Install Playwright and its Chromium browser to run; NODE_PATH may
// point at an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const PYTHON = process.env.PYTHON || 'python';
const G = 'ba:street_secondavenue#10', B = 'ba:street_fifthavenue#4', O = 'ba:street_park#88';
const addr = key => ({street: key.slice(0, key.lastIndexOf('#')), number: Number(key.slice(key.lastIndexOf('#') + 1))});
// The host page's source, as web/app.js hands one over, plus the game link:
// window.mkLink is /health as the board last read it (null: not linked), and
// window.mkAnswer(kind, body, o) answers a write.
const STUB = '<script>window.mkWrites = []; window.LEDGER_SOURCE = {label: "Live", data: async () => null, '
  + 'name: async () => null, watch(h){ window.calmWatch = h; }, link: () => window.mkLink || null, '
  + 'write: async (kind, body, o) => { window.mkWrites.push({kind, body: JSON.parse(JSON.stringify(body)), dryRun: !!(o && o.dryRun)}); '
  + 'return window.mkAnswer ? window.mkAnswer(kind, body, o) : {status: 0, error: "unreachable", body: null}; }};</script>';
// Day 36 is a Monday: both agencies open 8 to 17 on weekdays.
const LINK = {writes: ['uniforms', 'imports', 'schedule', 'hire', 'marketing'], day: 36, hour: 14, minute: 0, character: 'default', company: 'Link Co'};
const NET = 'ba:street_thirdavenue#17', ADS = 'ba:street_secondavenue#5';
const WEEK = [[], [[8, 17]], [[8, 17]], [[8, 17]], [[8, 17]], [[8, 17]], []];
const AGENCIES = [
  {key: NET, name: "McCain's eMarketing", address: '17 Third Avenue', contact: true, types: ['SmallInternet', 'MediumInternet', 'LargeInternet'],
   hours: WEEK, closed: false, open: true, opens: null},
  {key: ADS, name: 'CityAds', address: '5 Second Avenue', contact: true, types: ['SmallBillboard', 'MediumBillboard', 'LargeBillboard'],
   hours: WEEK, closed: false, open: true, opens: null},
];

const plan = (on, was, o = {}) => Object.assign({on, was, costNow: 0, costPlan: 0, marketingNow: 0, marketingPlan: 0,
  promotionNow: 0, promotionPlan: 100, target: 'promotion', needsSetup: true, agencies: [NET, ADS], visit: [],
  setupTypes: ['SmallInternet', 'MediumInternet', 'SmallBillboard', 'MediumBillboard', 'LargeBillboard'], setupAgencies: [NET, ADS]}, o);
// Gifts runs Large internet and the plan is Small internet and Small billboard;
// Bare runs its plan but misses switches; the office overspends and is set up.
function withMarketing(text) {
  const d = JSON.parse(text);
  const at = key => d.businesses.find(b => b.key === key);
  Object.assign(at(G), {promotion: 90, traffic: 60, marketingIndex: 43,
    campaigns: [{type: 'LargeInternet', agency: 'ba:street_thirdavenue#17', enabled: true}],
    marketingPlan: plan(['SmallInternet', 'SmallBillboard'], ['LargeInternet'],
      {costNow: 500, costPlan: 600, marketingNow: 43, marketingPlan: 57, promotionNow: 90})});
  Object.assign(at(B), {promotion: 100, traffic: 70, marketingIndex: 40,
    campaigns: [{type: 'MediumBillboard', agency: 'ba:street_secondavenue#5', enabled: true}],
    marketingPlan: plan(['MediumBillboard'], ['MediumBillboard'], {costNow: 2500, costPlan: 2500, promotionNow: 100, agencies: [],
      setupTypes: ['SmallInternet', 'MediumInternet', 'LargeInternet', 'SmallBillboard', 'LargeBillboard']})});
  d.businesses.push(Object.assign(JSON.parse(JSON.stringify(at(G))), {key: O, name: 'HART. Law', code: 'MH',
    status: 'office', type: 'Law Firm', typeSlug: 'ba:businesstype_lawfirm', address: '88 Park Avenue', amenities: null,
    uniformGaps: [], uniformGapSkills: [], missingUniformLocker: false, promotion: 100, traffic: 70, marketingIndex: 100,
    campaigns: ['SmallInternet', 'MediumInternet', 'LargeInternet', 'SmallBillboard', 'MediumBillboard', 'LargeBillboard']
      .map(type => ({type, agency: 'ba:street_secondavenue#5', enabled: type === 'SmallBillboard' || type === 'LargeBillboard'})),
    marketingPlan: plan(['SmallBillboard'], ['SmallBillboard', 'LargeBillboard'],
      {costNow: 6500, costPlan: 500, promotionNow: 100, needsSetup: false, agencies: [ADS], setupTypes: [], setupAgencies: []})}));
  d.marketingAgencies = AGENCIES;
  // The promotion findings alone, so no other warning folds them away: the
  // line of the sites the plan raises (Gifts) and of those it only saves at
  // (the office), each told apart by its sentence's key, as _alerts() writes them.
  d.alerts = [
    {level: 'warn', site: 'HART. Gifts', group: 'promotion', siteKey: G, id: 'promo-gifts', worth: null, unit: '',
     text: 'HART. Gifts can reach 100% promotion for $100/day more',
     i18n: {text: ['f.promotion.reach.more.one', {site: 'HART. Gifts', p: 100, w: 100}]}},
    {level: 'info', site: 'HART. Law', group: 'promotion', siteKey: O, id: 'promo-law', worth: null, unit: '',
     text: 'HART. Law can save $6,000/day at the same promotion',
     i18n: {text: ['f.promotion.save.one', {site: 'HART. Law', w: 6000}]}}];
  return JSON.stringify(d);
}

let browser, html, payload;
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marketing-write-'));
  try {
    const save = path.join(dir, 'mk.hsg'), data = path.join(dir, 'payload.json');
    const made = spawnSync(PYTHON, [path.join(root, 'tests', 'es3_fixture.py'), save, data], {cwd: root});
    assert.equal(made.status, 0, made.stderr?.toString());
    payload = withMarketing(fs.readFileSync(data, 'utf8'));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  const page = spawnSync(PYTHON, ['-c',
    'from ba_dashboard import render; import sys; '
    + 'sys.stdout.buffer.write(render(None, live=True, before_script=sys.argv[1]).encode("utf-8"))', STUB],
  {cwd: root, maxBuffer: 16 * 1024 * 1024});
  assert.equal(page.status, 0, page.stderr?.toString());
  html = page.stdout.toString();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

async function board(t, {link = LINK, data = payload} = {}) {
  const context = await browser.newContext({viewport: {width: 1280, height: 1200}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await context.route('https://**', route => route.abort());
  await context.route('https://marketing.test/', route => route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await context.addInitScript(l => { window.mkLink = l; }, link);
  await page.goto('https://marketing.test/', {waitUntil: 'load'});
  await page.evaluate(() => { document.body.classList.add('has-board'); });
  await page.evaluate(p => window.calmWatch.changed(JSON.parse(p)), data);
  return page;
}
const openSite = (page, key) => page.evaluate(k => openSite(k, false), key);
const phase = (page, p) => page.waitForFunction(p => document.querySelector('dialog.gw-dlg')?.dataset.phase === p, p);
const writes = page => page.evaluate(() => window.mkWrites);
// The game's answer: every site as the page asked, at 100 unless a test says
// otherwise, and `error` per site key.
// `entries`: per site key, the switches the game adds (entriesAdded), and
// `waiting`, the ones it skips for an agency ({type, agency, opens}); a site
// left out of `entries` answers neither, as an older mod, and the board
// reckons them.
async function answering(page, {errors = {}, total = {}, entries = {}, waiting = {}} = {}) {
  await page.evaluate(({errors, total, entries, waiting}) => {
    const key = a => `${a.street}#${a.number}`;
    window.mkAnswer = async (kind, body, o) => {
      if (kind === 'undo') return {status: 200, error: null, body: {ok: true, kind: 'marketing', undo: true, rows: []}};
      const rows = body.sites.map(s => ({address: s.address, business: key(s.address), on: s.on, dailyCost: s.prediction.dailyCost,
        promotion: {trafficIndex: 60, marketing: s.prediction.marketing, total: total[key(s.address)] ?? s.prediction.total},
        turnedOn: [], turnedOff: [], campaigns: [], error: errors[key(s.address)] || null,
        ...(entries[key(s.address)] ? {entriesAdded: entries[key(s.address)], waiting: waiting[key(s.address)] || []} : {})}));
      return {status: 200, error: null, body: {ok: !rows.some(r => r.error), kind: 'marketing', dryRun: !!o.dryRun, contactsAdded: [], rows}};
    };
  }, {errors, total, entries, waiting});
}

test('a shop: the cheapest mix, a dry run, Apply and Undo', async (t) => {
  const page = await board(t);
  await answering(page);
  await openSite(page, G);
  const line = page.locator('#sp-pull .spmk');
  assert.equal((await line.locator('p').first().innerText()).trim(), en("sp.mk.line", {mix:en("sp.mk.type.smallinternet") + " + " + en("sp.mk.type.smallbillboard"),"cost":600,"p":100}));
  assert.equal(await line.locator('.spmk-hand').count(), 0, 'the board can write it: no hand instructions');
  const set = line.locator('[data-gw="marketing"]');
  assert.equal(await set.getAttribute('aria-label'), en("sp.gw.mk.title"));
  await set.click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('h2').textContent(), en("sp.gw.mk.title"));
  assert.match(await dlg.locator('.gw-verdict').innerText(), enRe("sp.gw.mk.change", {"n":1}));
  const row = dlg.locator('.gw-mkrow');
  assert.equal(await row.locator('.gw-mk').innerText(), en('sp.mk.type.largeinternet') + ' \u2192 ' + en('sp.mk.type.smallinternet') + ' + ' + en('sp.mk.type.smallbillboard'));
  assert.equal(await row.locator('.c').innerText(), en('sp.gw.mk.costs', {a:500, b:600}));
  assert.equal(await row.getAttribute('data-read'), en("sp.gw.mk.read", {"a":90,"b":100}), 'the read-out adds what the row does not show');
  assert.deepEqual(await writes(page), [{kind: 'marketing', dryRun: true,
    body: {sites: [{address: addr(G), on: ['SmallInternet', 'SmallBillboard'], was: ['LargeInternet'], prediction: {dailyCost: 600, marketing: 57, total: 100}}]}}]);
  await dlg.locator('[data-gw-b="apply"]').click();
  await phase(page, 'done');
  const sent = await writes(page);
  assert.equal(sent.length, 2);
  assert.deepEqual([sent[1].kind, sent[1].dryRun, sent[1].body], ['marketing', false, sent[0].body]);
  assert.match(await dlg.locator('.gw-said').textContent(), enRe("sp.gw.mk.done.one", {"shop":"HART. Gifts"}));
  await dlg.locator('[data-gw-b="undo"]').click();
  await phase(page, 'undone');
  const undo = (await writes(page))[2];
  assert.deepEqual([undo.kind, undo.body, undo.dryRun], ['undo', {kind: 'marketing'}, false]);
  assert.match(await dlg.innerText(), enRe("sp.gw.mk.undone"));
});

test('a different game prediction refuses the plan before apply', async (t) => {
  const page = await board(t);
  await answering(page, {total: {[G]: 97}});
  await openSite(page, G);
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  assert.equal(await page.locator('dialog.gw-dlg [data-gw-b="apply"]').count(), 0);
  assert.match(await page.locator('dialog.gw-dlg .gw-why').innerText(), enRe("nav.dlg.refuse.changed.rule"));
});

test('without the link, or with an older mod, the line says what to switch in BizMan', async (t) => {
  const bare = await board(t, {link: null});
  await openSite(bare, G);
  assert.equal(await bare.locator('#sp-pull [data-gw]').count(), 0);
  assert.equal((await bare.locator('#sp-pull .spmk-hand').innerText()).trim(),
    en('sp.mk.hand.off', {off:en('sp.mk.type.largeinternet')}) + ' ' + en('sp.mk.hand.visit', {types:en('sp.mk.type.smallinternet') + ', ' + en('sp.mk.type.smallbillboard')}));
  const old = await board(t, {link: Object.assign({}, LINK, {writes: ['uniforms', 'imports', 'schedule', 'hire']})});
  await openSite(old, G);
  const btn = old.locator('#sp-pull [data-gw="marketing"]');
  assert.equal(await btn.getAttribute('aria-disabled'), 'true');
  assert.equal(await btn.getAttribute('data-tip'), en("nav.dlg.mod.marketing"));
  assert.equal(await old.locator('#sp-pull .spmk-hand').count(), 1);
});

test('an unsupported campaign model explains why planning is unavailable', async t => {
  const data = JSON.parse(payload);
  data.businesses.find(b => b.key === G).marketingPlan = {unavailable: true, on: null};
  const page = await board(t, {data: JSON.stringify(data)});
  await openSite(page, G);
  assert.match(await page.locator('#sp-pull').innerText(), enRe('sp.mk.unavailable'));
  assert.equal(await page.locator('#sp-pull [data-gw="marketing"]').count(), 0);
});

test('a site on plan: running, and Set up only while a switch is missing', async (t) => {
  const page = await board(t);
  await openSite(page, B);
  assert.equal((await page.locator('#sp-pull .spmk p').first().innerText()).trim(), en("sp.mk.running", {mix:en("sp.mk.type.mediumbillboard"),"cost":2500}));
  const setup = page.locator('#sp-pull [data-gw="marketing"]');
  assert.equal(await setup.innerText(), en("sp.mk.setup"));
  assert.equal(await setup.getAttribute('data-gw-mode'), 'setup');
  // Set up and on plan: nothing to press.
  const done = JSON.parse(payload);
  done.businesses.find(b => b.key === B).marketingPlan.needsSetup = false;
  const quiet = await board(t, {data: JSON.stringify(done)});
  await openSite(quiet, B);
  assert.equal(await quiet.locator('#sp-pull [data-gw]').count(), 0);
});

test('an office draws the Promotion block with its line and button', async (t) => {
  const page = await board(t);
  await openSite(page, O);
  assert.equal(await page.locator('#sitePanel [data-block="pull"]').count(), 1);
  assert.equal((await page.locator('#sp-pull .spmk p').first().innerText()).trim(), en("sp.mk.line", {mix:en("sp.mk.type.smallbillboard"),"cost":500,"p":100}));
  assert.equal(await page.locator('#sp-pull [data-gw="marketing"]').count(), 1);
});

test('the promotion finding and Standards: every site at once, a site on plan only set up', async (t) => {
  const page = await board(t);
  await answering(page, {errors: {[O]: 'no_agency'}});
  await page.evaluate(() => { showPage('today'); });
  // Gifts and the office run another mix than their plan; Bare runs its own.
  // Each line's button is over its own sites alone.
  const act = page.locator('#alerts .find[data-id="promo-gifts"] [data-gw="marketing"]');
  const save = page.locator('#alerts .find[data-id="promo-law"] [data-gw="marketing"]');
  assert.equal(await act.innerText(), en("sp.gw.mk.all", {"n":1}));
  assert.equal(await save.innerText(), en("sp.gw.mk.all", {"n":1}));
  await page.evaluate(() => openRoute('businesses/standards'));
  const std = page.locator('#secStandards .bz-mk [data-gw="marketing"]');
  // textContent: the section may not be laid out yet when it is read.
  assert.deepEqual(await std.evaluateAll(bs => bs.map(b => b.textContent.trim())), [en("sp.gw.mk.all", {"n":2}), en("sp.gw.mk.setupall", {"n":2})]);
  await std.nth(1).click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('h2').textContent(), en("sp.gw.mk.title.setupmany", {"n":2}));
  assert.deepEqual((await writes(page))[0].body.sites.map(s => `${s.address.street}#${s.address.number}`), [G, B]);
  assert.match(await dlg.locator('.gw-mkrow').nth(1).innerText(), enRe("sp.gw.mk.plus", {n:5}));
  assert.match(await dlg.locator('.gw-tally').innerText(), /\$3,000[\s\S]*\$3,100/);
  // A refused site in a run of many is said in its row, with Leave it out.
  await page.keyboard.press('Escape');
  await std.nth(0).click();
  await phase(page, 'ready');
  const bad = dlg.locator('.gw-mkrow.bad');
  assert.match(await bad.innerText(), enRe("nav.dlg.refuse.noagency.rule"));
  assert.equal(await dlg.locator('[data-gw-b="apply"]').isDisabled(), true);
  await bad.locator('[data-gw-leave]').click();
  await phase(page, 'ready');
  assert.equal(await dlg.locator('[data-gw-b="apply"]').isDisabled(), false);
  assert.equal(await dlg.locator('h2').textContent(), en("sp.gw.mk.all", {"n":1}));
  assert.deepEqual((await writes(page)).at(-1).body.sites.map(s => s.address.number), [10]);
  // The savings line's button sends the office alone.
  await page.keyboard.press('Escape');
  await page.evaluate(() => { showPage('today'); });
  await save.click();
  await phase(page, 'ready');
  assert.deepEqual((await writes(page)).at(-1).body.sites.map(s => s.address.number), [88]);
});

test('a new switch from a shut agency: the button waits and one line beside it says when', async (t) => {
  // Monday 20:00: shut until Tuesday 8:00. Gifts' plan needs new switches at both.
  const page = await board(t, {link: Object.assign({}, LINK, {hour: 20})});
  await openSite(page, G);
  const set = page.locator('#sp-pull [data-gw="marketing"]');
  assert.equal(await set.getAttribute('aria-disabled'), 'true');
  assert.equal(await page.locator('#sp-pull .spmk-why').innerText(), en("sp.mk.why.open.day", {"d":2,"h":8}));
  assert.equal(await set.getAttribute('data-tip'), null, 'hover does not repeat the line beside it');
  assert.equal(await set.getAttribute('aria-label'), en('nav.dlg.offlabel', {name:en('sp.mk.set.name'), why:en('sp.mk.why.open.day', {d:2, h:8})}));
  // Before opening on the same day: the hour alone, and one agency by name.
  const early = await board(t, {link: Object.assign({}, LINK, {hour: 7})});
  await openSite(early, O);
  assert.equal(await early.locator('#sp-pull .spmk-why').innerText(), en("sp.mk.why.opens", {"agency":"CityAds","h":8}));
  // The raise line's action waits too, its reason on hover.
  await early.evaluate(() => { showPage('today'); });
  const all = early.locator('#alerts .find[data-id="promo-gifts"] [data-gw="marketing"]');
  assert.equal(await all.getAttribute('aria-disabled'), 'true');
  assert.equal(await all.getAttribute('data-tip'), en("sp.mk.why.open", {"h":8}));
  // An agency not in the phone yet: a first visit.
  const d = JSON.parse(payload);
  d.marketingAgencies.find(a => a.key === ADS).contact = false;
  const stranger = await board(t, {data: JSON.stringify(d)});
  await openSite(stranger, O);
  assert.equal(await stranger.locator('#sp-pull .spmk-why').innerText(), en("sp.mk.why.visit", {"agency":"CityAds"}));
});

// Peter's rule: a switch the site already has flips at any time, like the
// phone; only a new one needs its agency known and open.
function flipsOnly() {
  const d = JSON.parse(payload);
  const g = d.businesses.find(b => b.key === G);
  g.campaigns = ['LargeInternet', 'SmallInternet', 'SmallBillboard'].map(type =>
    ({type, agency: type.endsWith('Billboard') ? ADS : NET, enabled: type === 'LargeInternet'}));
  Object.assign(g.marketingPlan, {agencies: []});
  return JSON.stringify(d);
}
test('a plan that only flips switches the site has goes through while the agencies are shut', async (t) => {
  // Monday 17:45: both agencies shut.
  const page = await board(t, {link: Object.assign({}, LINK, {hour: 17, minute: 45}), data: flipsOnly()});
  await openSite(page, G);
  const set = page.locator('#sp-pull [data-gw="marketing"]');
  assert.equal(await set.getAttribute('aria-disabled'), null);
  assert.equal(await page.locator('#sp-pull .spmk-why').count(), 0);
  await page.evaluate(() => { showPage('today'); });
  assert.equal(await page.locator('#alerts .find[data-id="promo-gifts"] [data-gw="marketing"]').getAttribute('aria-disabled'), null);
});

test('the game\'s clock turning the hour redraws the gate, with no new board', async (t) => {
  // 16:00: open. The link's clock moves to 17:00 without new bytes.
  const page = await board(t, {link: Object.assign({}, LINK, {hour: 16})});
  await openSite(page, G);
  assert.equal(await page.locator('#sp-pull [data-gw="marketing"]').getAttribute('aria-disabled'), null);
  await page.evaluate(() => { window.mkLink = Object.assign({}, window.mkLink, {hour: 17}); window.calmWatch.linkClock(); });
  assert.equal(await page.locator('#sp-pull [data-gw="marketing"]').getAttribute('aria-disabled'), 'true');
  assert.equal(await page.locator('#sp-pull .spmk-why').innerText(), en("sp.mk.why.open.day", {"d":2,"h":8}));
});

test('no agency in the phone yet: the line names where to go, and there is no button', async (t) => {
  const d = JSON.parse(payload);
  d.marketingAgencies.forEach(a => { a.contact = false; });
  Object.assign(d.businesses.find(b => b.key === G).marketingPlan, {on: null, costPlan: null, promotionPlan: null, marketingPlan: null,
    target: null, agencies: [], visit: [NET, ADS]});
  const page = await board(t, {data: JSON.stringify(d)});
  await openSite(page, G);
  assert.equal((await page.locator('#sp-pull .spmk').innerText()).trim(),
    en('sp.mk.novisit2', {agencies:en('sp.mk.agency', {agency:"McCain's eMarketing", address:'17 Third Avenue'}) + ', ' + en('sp.mk.agency', {agency:'CityAds', address:'5 Second Avenue'})}));
  assert.equal(await page.locator('#sp-pull [data-gw]').count(), 0);
  // An agency that would make a better plan: one hint under the plan.
  const better = JSON.parse(payload);
  better.businesses.find(b => b.key === B).marketingPlan.visit = [NET];
  const hint = await board(t, {data: JSON.stringify(better)});
  await openSite(hint, B);
  assert.match(await hint.locator('#sp-pull .spmk').innerText(), enRe("sp.mk.better2", {"agencies":en("sp.mk.agency", {agency:"McCain's eMarketing", address:"17 Third Avenue"})}));
});

test('the game refuses a row for a shut or unknown agency, and an undo goes through while it is shut', async (t) => {
  const page = await board(t);
  await answering(page, {errors: {[G]: 'agency_closed'}});
  await openSite(page, G);
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  // The row names the agency by the board's name for its address; the
  // answer's own opening hour is said.
  await page.evaluate(() => { window.mkAnswer = async (kind, body) => ({status: 200, error: null, body: {ok: false, kind: 'marketing', dryRun: true,
    rows: body.sites.map(s => ({address: s.address, error: 'agency_closed', agency: {address: {street: 'ba:street_secondavenue', number: 5}},
      opens: {day: 37, hour: 8}}))}}); });
  await dlg.getByRole('button', {name: en('nav.dlg.tryagain')}).click();
  await dlg.locator('.gw-no').filter({hasText:enRe('nav.dlg.refuse.closed.rule', {agency:'CityAds'})}).waitFor();
  assert.match(await dlg.locator('.gw-no').innerText(), enRe("nav.dlg.refuse.closed.day", {"d":2,"h":8}));
  assert.equal(await dlg.locator('[data-gw-b="apply"]').isDisabled(), true);
  await page.evaluate(() => { window.mkAnswer = async (kind, body) => ({status: 200, error: null, body: {ok: false, kind: 'marketing', dryRun: true,
    rows: body.sites.map(s => ({address: s.address, error: 'no_contact', agency: {name: 'CityAds'}}))}}); });
  await dlg.getByRole('button', {name: en('nav.dlg.tryagain')}).click();
  await dlg.locator('.gw-no').filter({hasText:enRe('nav.dlg.refuse.nocontact.rule', {agency:'CityAds'})}).waitFor();
  // An apply, then its undo after the agencies have shut: the mod only flips
  // switches the site has, so it goes through (MarketingWrite's undo).
  await answering(page);
  await dlg.getByRole('button', {name: en('nav.dlg.tryagain')}).click();
  await phase(page, 'ready');
  await dlg.locator('[data-gw-b="apply"]').click();
  await phase(page, 'done');
  await page.evaluate(() => { window.mkLink = Object.assign({}, window.mkLink, {hour: 18}); window.calmWatch.linkClock(); });
  await dlg.locator('[data-gw-b="undo"]').click();
  await phase(page, 'undone');
  const sent = await writes(page);
  assert.deepEqual([sent.at(-1).kind, sent.at(-1).body], ['undo', {kind: 'marketing'}]);
});

test('an undo after a switch was flipped by hand is refused as changed, and not offered again', async (t) => {
  const page = await board(t);
  await answering(page);
  await openSite(page, G);
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.locator('[data-gw-b="apply"]').click();
  await phase(page, 'done');
  await page.evaluate(g => { window.mkAnswer = async () => ({status: 409, error: 'changed',
    body: {error: 'changed', rows: [{address: g, error: 'changed'}]}}); }, addr(G));
  await dlg.locator('[data-gw-b="undo"]').click();
  await phase(page, 'failed');
  // The game has moved on: nothing was put back, and the way on is a refresh.
  assert.match(await dlg.innerText(), new RegExp(enRe('nav.dlg.say.moved').source + '[\\s\\S]*' + enRe('nav.dlg.unchanged').source));
  assert.equal(await dlg.locator('[data-gw-again]').count(), 0);
  assert.equal(await page.evaluate(() => 'marketing' in gwUndoable), false);
});

// Monday 7:00: CityAds opens at 8:00; McCain's, in this variant, is open
// around the clock. Gifts' plan switches at McCain's alone.
function earlyMorning() {
  const d = JSON.parse(payload);
  d.marketingAgencies.find(a => a.key === NET).hours = WEEK.map(() => [[0, 24]]);
  d.businesses.find(b => b.key === G).marketingPlan.agencies = [NET];
  return JSON.stringify(d);
}

test('set-up while an agency is shut: waits when every one is, says what waits when one is', async (t) => {
  const shut = await board(t, {link: Object.assign({}, LINK, {hour: 7})});
  await openSite(shut, B);
  const setup = shut.locator('#sp-pull [data-gw="marketing"]');
  assert.equal(await setup.getAttribute('aria-disabled'), 'true');
  assert.equal(await shut.locator('#sp-pull .spmk-why').innerText(), en("sp.mk.why.open", {"h":8}));
  assert.match(await setup.getAttribute('aria-label'), enRe('nav.dlg.offlabel', {name:en('sp.mk.setup.name')}, {anchor:'start'}));

  const page = await board(t, {link: Object.assign({}, LINK, {hour: 7}), data: earlyMorning()});
  // An older mod's answer: no `waiting`, so the board reckons by its clock.
  await answering(page);
  await page.evaluate(() => { const was = window.mkAnswer; window.mkAnswer = async (...a) => {
    const res = await was(...a); res.body.rows.forEach(r => { r.entriesAdded = ['SmallInternet', 'MediumInternet', 'LargeInternet']; }); return res; }; });
  await openSite(page, B);
  const btn = page.locator('#sp-pull [data-gw="marketing"]');
  assert.equal(await btn.getAttribute('aria-disabled'), null, 'one agency is open');
  assert.equal(await btn.getAttribute('aria-label'), en("sp.mk.setup.now"));
  await btn.click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.match(await dlg.locator('.gw-verdict').innerText(), enRe("sp.gw.mk.switches", {"n":3}));
  assert.equal(await dlg.locator('.gw-mkrow .gw-mk').innerText(), en("sp.gw.mk.plus", {n:3}) + " \u00b7 " + en("sp.gw.mk.later.at", {n:2, h:8}));
  assert.equal(await dlg.locator('.gw-mkrow').getAttribute('data-read'), null, 'no read-out repeating the row');
  await dlg.locator('[data-gw-b="apply"]').click();
  await phase(page, 'done');
  assert.equal(await dlg.locator('.gw-said').textContent(), en("sp.gw.mk.done.some", {n:3}) + " " + en("sp.gw.mk.done.later", {n:2}));
  // Nothing added: McCain's three were there already, and CityAds' two wait.
  // One line, and no Apply that would do nothing.
  await page.keyboard.press('Escape');
  await answering(page);
  await page.evaluate(() => { const was = window.mkAnswer; window.mkAnswer = async (...a) => {
    const res = await was(...a); res.body.rows.forEach(r => { r.entriesAdded = []; }); return res; }; });
  await btn.click();
  await phase(page, 'ready');
  assert.equal(await dlg.locator('.gw-verdict b').innerText(), en("sp.gw.mk.idle.at", {"h":8,"agency":"CityAds"}));
  assert.equal(await dlg.locator('.gw-body').innerText(), '');
  assert.equal(await dlg.locator('[data-gw-b="apply"]').isDisabled(), true);
  assert.equal(await dlg.locator('[data-gw-b="apply"]').getAttribute('title'), null);

  // Both agencies open and nothing added: the switches were there already.
  const open = await board(t);
  await answering(open, {entries: {[B]: []}});
  await openSite(open, B);
  assert.equal(await open.locator('#sp-pull [data-gw="marketing"]').getAttribute('aria-label'), en("sp.mk.setup.name"));
  await open.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(open, 'ready');
  const d2 = open.locator('dialog.gw-dlg');
  assert.equal(await d2.locator('.gw-verdict b').innerText(), en("sp.gw.mk.idle.none"));
  assert.equal(await d2.locator('[data-gw-b="apply"]').isDisabled(), true);
});

test('each line\'s button counts only the sites the game takes now', async (t) => {
  const page = await board(t, {link: Object.assign({}, LINK, {hour: 7}), data: earlyMorning()});
  await page.evaluate(() => { showPage('today'); });
  // Gifts switches at McCain's, open; the office waits for CityAds.
  const raise = page.locator('#alerts .find[data-id="promo-gifts"] [data-gw="marketing"]');
  const save = page.locator('#alerts .find[data-id="promo-law"] [data-gw="marketing"]');
  assert.equal(await raise.innerText(), en("sp.gw.mk.all", {"n":1}));
  assert.equal(await raise.getAttribute('aria-disabled'), null);
  assert.equal(await save.getAttribute('aria-disabled'), 'true');
  assert.equal(await save.getAttribute('data-tip'), en("sp.mk.why.opens", {"agency":"CityAds","h":8}));
  await answering(page);
  await raise.click();
  await phase(page, 'ready');
  assert.deepEqual((await writes(page)).at(-1).body.sites.map(s => s.address.number), [10]);
});

test('each promotion line carries its own button, and a filter hides it with its row', async (t) => {
  const page = await board(t, {link: Object.assign({}, LINK, {hour: 7}), data: earlyMorning()});
  await page.evaluate(() => { showPage('today'); });
  const buttons = () => page.locator('#alerts .find:not(.hide) [data-gw="marketing"]')
    .evaluateAll(bs => bs.map(b => [b.closest('.find').dataset.id, b.dataset.gwMkLine]));
  assert.deepEqual(await buttons(), [['promo-gifts', 'raise'], ['promo-law', 'save']]);
  await page.locator('#alertHead .sev[data-kind="watch"]').click();
  assert.deepEqual(await buttons(), [['promo-law', 'save']]);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.kind), 'watch');
});

const CITYADS = {name: 'CityAds', address: {street: 'ba:street_secondavenue', number: 5}};
test('the game says what waits: its `waiting`, not the board\'s clock', async (t) => {
  // Monday 14:00: the board thinks CityAds open, but the game has it shut.
  const page = await board(t);
  await answering(page, {entries: {[B]: []}, waiting: {[B]: [
    {type: 'SmallBillboard', agency: CITYADS, opens: {day: 37, hour: 8}},
    {type: 'LargeBillboard', agency: CITYADS, opens: {day: 37, hour: 8}}]}});
  await openSite(page, B);
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('.gw-verdict b').innerText(), en("sp.gw.mk.idle.day", {"d":2,"h":8,"agency":"CityAds"}));
  assert.equal(await dlg.locator('[data-gw-b="apply"]').isDisabled(), true);
});

test('an idle dry run offers Try again, and asks the game again when its hour turns', async (t) => {
  const page = await board(t);
  await answering(page, {entries: {[B]: []}, waiting: {[B]: [{type: 'SmallBillboard', agency: CITYADS, opens: {day: 37, hour: 8}}]}});
  await openSite(page, B);
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('.gw-verdict b').innerText(), en("sp.gw.mk.idle.day", {"d":2,"h":8,"agency":"CityAds"}));
  assert.equal(await dlg.getByRole('button', {name: en('nav.dlg.tryagain')}).count(), 1);
  const asked = (await writes(page)).length;
  // Tuesday 8:00: the game now adds the switch.
  await answering(page, {entries: {[B]: ['SmallBillboard']}});
  await page.evaluate(() => { window.mkLink = Object.assign({}, window.mkLink, {day: 37, hour: 8}); window.calmWatch.linkClock(); });
  await dlg.locator('.gw-verdict').filter({hasText:enRe('sp.gw.mk.switches', {n:1})}).waitFor();
  assert.equal((await writes(page)).length, asked + 1);
  assert.equal(await dlg.locator('[data-gw-b="apply"]').isDisabled(), false);
});

test('an idle dialog asks again when the hour turns with a new board, as the mod refreshes on the hour', async (t) => {
  const page = await board(t);
  await answering(page, {entries: {[B]: []}, waiting: {[B]: [{type: 'SmallBillboard', agency: CITYADS, opens: {day: 37, hour: 8}}]}});
  await openSite(page, B);
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  const asked = (await writes(page)).length;
  // A board built from new bytes at the same hour asks nothing.
  await page.evaluate(p => window.calmWatch.changed(JSON.parse(p)), payload);
  assert.equal((await writes(page)).length, asked);
  // The new bytes come with Tuesday 8:00, with no clock tick of their own.
  await answering(page, {entries: {[B]: ['SmallBillboard']}});
  await page.evaluate(p => { window.mkLink = Object.assign({}, window.mkLink, {day: 37, hour: 8}); window.calmWatch.changed(JSON.parse(p)); }, payload);
  await page.locator('dialog.gw-dlg .gw-verdict').filter({hasText:enRe('sp.gw.mk.switches', {n:1})}).waitFor();
  assert.equal((await writes(page)).length, asked + 1);
});

test('a site not trading yet: left out of the cheapest mix for all, kept in the set-up for all', async (t) => {
  const d = JSON.parse(payload);
  d.businesses.find(b => b.key === G).notTrading = [];
  const page = await board(t, {data: JSON.stringify(d)});
  await page.evaluate(() => { showPage('today'); });
  // Its promotion is the not-trading finding's business, as in _alerts().
  assert.equal(await page.locator('#alerts .find[data-id="promo-gifts"] [data-gw="marketing"]').count(), 0);
  await page.evaluate(() => openRoute('businesses/standards'));
  const std = page.locator('#secStandards .bz-mk [data-gw="marketing"]');
  // A new site is the set-up's first case: it stays in "Set up all".
  assert.deepEqual(await std.evaluateAll(bs => bs.map(b => b.textContent.trim())), [en("sp.gw.mk.all", {"n":1}), en("sp.gw.mk.setupall", {"n":2})]);
  await answering(page);
  await std.nth(1).click();
  await phase(page, 'ready');
  assert.deepEqual((await writes(page)).at(-1).body.sites.map(s => `${s.address.street}#${s.address.number}`), [G, B]);
});

test('one switch added says so in the singular; a refused row adds nothing', async (t) => {
  const d = JSON.parse(payload);
  d.businesses.find(b => b.key === B).marketingPlan.setupTypes = ['SmallInternet'];
  const page = await board(t, {data: JSON.stringify(d)});
  await answering(page, {entries: {[B]: ['SmallInternet']}});
  await openSite(page, B);
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('.gw-mkrow .gw-mk').innerText(), en("sp.gw.mk.plus", {"n":1}));
  assert.match(await dlg.locator('.gw-verdict').innerText(), new RegExp(enRe('sp.gw.mk.switches', {n:1}).source + '(\\n|$)'));
  await page.keyboard.press('Escape');
  await answering(page, {errors: {[B]: 'agency_closed'}});
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  assert.equal(await dlg.locator('.gw-mkrow .gw-mk').innerText(), en("sp.gw.mk.setupplan"));
});

test('silencing a promotion line takes its button with it, and undo brings both back', async (t) => {
  const page = await board(t, {link: Object.assign({}, LINK, {hour: 7}), data: earlyMorning()});
  await page.evaluate(() => { showPage('today'); });
  const carriers = () => page.locator('#alerts .find[data-kind="promotion"]:not(.gone) [data-gw="marketing"]')
    .evaluateAll(bs => bs.map(b => b.closest('.find').dataset.id));
  assert.deepEqual(await carriers(), ['promo-gifts', 'promo-law']);
  await page.locator('#alerts .find[data-id="promo-gifts"] .mark').click();
  assert.deepEqual(await carriers(), ['promo-law']);
  await page.locator('#silenced a').click();
  assert.deepEqual(await carriers(), ['promo-gifts', 'promo-law']);
  // The focus goes back to the row that was silenced.
  assert.equal(await page.evaluate(() => document.activeElement.closest('.find')?.dataset.id), 'promo-gifts');
});

test('undoing a silence puts the focus on the row it brings back, or on the first row shown', async (t) => {
  const d = JSON.parse(earlyMorning());
  d.alerts[1].level = 'info';  // the office's finding an opportunity
  const page = await board(t, {link: Object.assign({}, LINK, {hour: 7}), data: JSON.stringify(d)});
  await page.evaluate(() => { showPage('today'); });
  const focused = () => page.evaluate(() => document.activeElement.closest('.find')?.dataset.id || null);
  // No button moves here: the focus still goes to the row brought back.
  await page.locator('#alerts .find[data-id="promo-law"] .mark').click();
  await page.locator('#silenced a').click();
  assert.equal(await focused(), 'promo-law');
  // Its band filtered away: the first row shown takes the focus instead.
  await page.locator('#alerts .find[data-id="promo-law"] .mark').click();
  await page.locator('#alertHead .sev[data-kind="opp"]').click();
  await page.locator('#silenced a').click();
  assert.equal(await focused(), 'promo-gifts');
  // The opportunities still filtered, Gifts' warning silenced and the
  // warnings filtered too: no row is shown, so the focus goes to the filter
  // of the band the row belongs to.
  await page.locator('#alerts .find[data-id="promo-gifts"] .mark').click();
  await page.locator('#alertHead .sev[data-kind="watch"]').click();
  await page.locator('#silenced a').click();
  assert.equal(await page.evaluate(() => document.activeElement.matches('#alertHead .sev[data-kind="watch"]')), true);
});

test('a switch waiting for an agency the board thinks is a contact is not called closed', async (t) => {
  const page = await board(t);
  await answering(page, {entries: {[B]: []}, waiting: {[B]: [
    {type: 'SmallBillboard', agency: CITYADS, opens: null}, {type: 'LargeBillboard', agency: CITYADS, opens: null}]}});
  await openSite(page, B);
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('.gw-verdict b').innerText(), en("sp.gw.mk.idle.wait"));
  assert.doesNotMatch(await dlg.innerText(), new RegExp(enRe('nav.dlg.refuse.closed.rule').source + '|' + enRe('sp.mk.why.opens').source));
  assert.equal(await dlg.locator('[data-gw-b="apply"]').isDisabled(), true);
});

test('switches of an agency the board knows is no contact: a first visit, never "every switch"', async (t) => {
  const d = JSON.parse(payload);
  d.marketingAgencies.find(a => a.key === ADS).contact = false;
  // The board plans set-up with McCain's alone.
  Object.assign(d.businesses.find(b => b.key === B).marketingPlan,
    {setupTypes: ['SmallInternet', 'MediumInternet', 'LargeInternet'], setupAgencies: [NET]});
  const page = await board(t, {data: JSON.stringify(d)});
  await answering(page, {entries: {[B]: ['SmallInternet', 'MediumInternet', 'LargeInternet']}, waiting: {[B]: [
    {type: 'SmallBillboard', agency: CITYADS, opens: null}, {type: 'LargeBillboard', agency: CITYADS, opens: null}]}});
  await openSite(page, B);
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('.gw-mkrow .gw-mk').innerText(), en("sp.gw.mk.plus", {n:3}) + " \u00b7 " + en("sp.gw.mk.later.visit", {n:2, agency:"CityAds"}));
  await dlg.locator('[data-gw-b="apply"]').click();
  await phase(page, 'done');
  assert.equal(await dlg.locator('.gw-said').textContent(), en("sp.gw.mk.done.some", {n:3}) + " " + en("sp.gw.mk.done.later", {n:2}));
  // With nothing to add, the one line names the visit.
  await page.keyboard.press('Escape');
  await answering(page, {entries: {[B]: []}, waiting: {[B]: [
    {type: 'SmallBillboard', agency: CITYADS, opens: null}, {type: 'LargeBillboard', agency: CITYADS, opens: null}]}});
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  assert.equal(await dlg.locator('.gw-verdict b').innerText(), en("sp.gw.mk.idle.visit", {"agency":"CityAds"}));
});

test('a temporarily closed agency the board knows of counts as closed', async (t) => {
  const d = JSON.parse(payload);
  d.marketingAgencies.find(a => a.key === ADS).closed = true;
  const page = await board(t, {data: JSON.stringify(d)});
  await answering(page, {entries: {[B]: []}, waiting: {[B]: [
    {type: 'SmallBillboard', agency: CITYADS, opens: null}, {type: 'LargeBillboard', agency: CITYADS, opens: null}]}});
  await openSite(page, B);
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('.gw-verdict b').innerText(), en("sp.gw.mk.idle.reopen", {"agency":"CityAds"}));
  assert.equal(await dlg.locator('[data-gw-b="apply"]').isDisabled(), true);
});
