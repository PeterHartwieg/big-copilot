// The cheapest marketing mix on the board (docs/marketing-write-scope.md,
// section 4): the Promotion block's line and Set button on a shop and an
// office, the promotion finding's action, Standards' "Set up all", and the
// write dialog for kind "marketing". The board is the real page from render(),
// its payload the real extract() of the synthetic company in
// tests/es3_fixture.py with a hand-made marketing overlay; its source is a stub
// that answers the game link's health and writes as each test says. Never a
// real save. Install Playwright and its Chromium browser to run; NODE_PATH may
// point at an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
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
const LINK = {writes: ['uniforms', 'imports', 'schedule', 'hire', 'marketing'], day: 34, hour: 14, minute: 0, character: 'default', company: 'Link Co'};

const plan = (on, was, o = {}) => Object.assign({on, was, costNow: 0, costPlan: 0, marketingNow: 0, marketingPlan: 0,
  promotionNow: 0, promotionPlan: 100, target: 'promotion', needsSetup: true}, o);
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
    marketingPlan: plan(['MediumBillboard'], ['MediumBillboard'], {costNow: 2500, costPlan: 2500, promotionNow: 100})});
  d.businesses.push(Object.assign(JSON.parse(JSON.stringify(at(G))), {key: O, name: 'HART. Law', code: 'MH',
    status: 'office', type: 'Law Firm', typeSlug: 'ba:businesstype_lawfirm', address: '88 Park Avenue', amenities: null,
    uniformGaps: [], uniformGapSkills: [], missingUniformLocker: false, promotion: 100, traffic: 70, marketingIndex: 100,
    campaigns: ['SmallInternet', 'MediumInternet', 'LargeInternet', 'SmallBillboard', 'MediumBillboard', 'LargeBillboard']
      .map(type => ({type, agency: 'ba:street_secondavenue#5', enabled: type === 'SmallBillboard' || type === 'LargeBillboard'})),
    marketingPlan: plan(['SmallBillboard'], ['SmallBillboard', 'LargeBillboard'],
      {costNow: 6500, costPlan: 500, promotionNow: 100, needsSetup: false})}));
  // The promotion finding alone, so no other warning folds it away.
  d.alerts = [{level: 'warn', site: 'HART. Gifts', group: 'promotion', siteKey: G, id: 'promo-gifts', worth: null, unit: '',
    text: 'HART. Gifts promotes at 90% of the 100% cap: 60% foot traffic and 43% marketing. The address sets the foot traffic, so the missing 10 points have to come from campaigns'}];
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
async function answering(page, {errors = {}, total = {}} = {}) {
  await page.evaluate(({errors, total}) => {
    const key = a => `${a.street}#${a.number}`;
    window.mkAnswer = async (kind, body, o) => {
      if (kind === 'undo') return {status: 200, error: null, body: {ok: true, kind: 'marketing', undo: true, rows: []}};
      const rows = body.sites.map(s => ({address: s.address, business: key(s.address), on: s.on, dailyCost: 0,
        promotion: {trafficIndex: 60, marketing: 57, total: total[key(s.address)] ?? 100},
        turnedOn: [], turnedOff: [], entriesAdded: [], campaigns: [], error: errors[key(s.address)] || null}));
      return {status: 200, error: null, body: {ok: !rows.some(r => r.error), kind: 'marketing', dryRun: !!o.dryRun, contactsAdded: [], rows}};
    };
  }, {errors, total});
}

test('a shop: the cheapest mix, a dry run, Apply and Undo', async (t) => {
  const page = await board(t);
  await answering(page);
  await openSite(page, G);
  const line = page.locator('#sp-pull .spmk');
  assert.equal((await line.locator('p').first().innerText()).trim(), 'Cheapest mix: Small internet + Small billboard · $600/day · 100%');
  assert.equal(await line.locator('.spmk-hand').count(), 0, 'the board can write it: no hand instructions');
  const set = line.locator('[data-gw="marketing"]');
  assert.equal(await set.getAttribute('aria-label'), 'Set the cheapest mix');
  await set.click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('h2').textContent(), 'Set the cheapest mix');
  assert.match(await dlg.locator('.gw-verdict').innerText(), /The game will change the campaigns at 1 site/);
  const row = dlg.locator('.gw-mkrow');
  assert.equal(await row.locator('.gw-mk').innerText(), 'Large internet → Small internet + Small billboard');
  assert.equal(await row.locator('.c').innerText(), '$500 → $600/day');
  assert.deepEqual(await writes(page), [{kind: 'marketing', dryRun: true,
    body: {sites: [{address: addr(G), on: ['SmallInternet', 'SmallBillboard'], was: ['LargeInternet']}]}}]);
  await dlg.locator('[data-gw-b="apply"]').click();
  await phase(page, 'done');
  const sent = await writes(page);
  assert.equal(sent.length, 2);
  assert.deepEqual([sent[1].kind, sent[1].dryRun, sent[1].body], ['marketing', false, sent[0].body]);
  assert.match(await dlg.locator('.gw-said').textContent(), /The cheapest mix runs at HART\. Gifts\./);
  await dlg.locator('[data-gw-b="undo"]').click();
  await phase(page, 'undone');
  const undo = (await writes(page))[2];
  assert.deepEqual([undo.kind, undo.body, undo.dryRun], ['undo', {kind: 'marketing'}, false]);
  assert.match(await dlg.innerText(), /Undone: campaigns back as they were\./);
});

test('the game\'s own reckoning is said where it is not the plan\'s', async (t) => {
  const page = await board(t);
  await answering(page, {total: {[G]: 97}});
  await openSite(page, G);
  await page.locator('#sp-pull [data-gw="marketing"]').click();
  await phase(page, 'ready');
  assert.match(await page.locator('dialog.gw-dlg .gw-mkrow .gw-mk').innerText(), /the game says 97%/);
});

test('without the link, or with an older mod, the line says what to switch in BizMan', async (t) => {
  const bare = await board(t, {link: null});
  await openSite(bare, G);
  assert.equal(await bare.locator('#sp-pull [data-gw]').count(), 0);
  assert.equal((await bare.locator('#sp-pull .spmk-hand').innerText()).trim(),
    'In BizMan › Marketing, switch off Large internet. Book Small internet, Small billboard at a marketing agency: BizMan has no switch for them yet.');
  const old = await board(t, {link: Object.assign({}, LINK, {writes: ['uniforms', 'imports', 'schedule', 'hire']})});
  await openSite(old, G);
  const btn = old.locator('#sp-pull [data-gw="marketing"]');
  assert.equal(await btn.getAttribute('aria-disabled'), 'true');
  assert.equal(await btn.getAttribute('data-tip'), 'Update the Big Copilot Link mod to set marketing from here');
  assert.equal(await old.locator('#sp-pull .spmk-hand').count(), 1);
});

test('a site on plan: running, and Set up only while a switch is missing', async (t) => {
  const page = await board(t);
  await openSite(page, B);
  assert.equal((await page.locator('#sp-pull .spmk p').first().innerText()).trim(), 'Cheapest mix, running: Medium billboard · $2,500/day');
  const setup = page.locator('#sp-pull [data-gw="marketing"]');
  assert.equal(await setup.innerText(), 'Set up');
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
  assert.equal((await page.locator('#sp-pull .spmk p').first().innerText()).trim(), 'Cheapest mix: Small billboard · $500/day · 100%');
  assert.equal(await page.locator('#sp-pull [data-gw="marketing"]').count(), 1);
});

test('the promotion finding and Standards: every site at once, a site on plan only set up', async (t) => {
  const page = await board(t);
  await answering(page, {errors: {[O]: 'no_agency'}});
  await page.evaluate(() => { showPage('today'); });
  const act = page.locator('#alerts .find[data-kind="promotion"] [data-gw="marketing"]');
  // Gifts and the office run another mix than their plan; Bare runs its own.
  assert.equal(await act.innerText(), 'Set the cheapest mix at 2 sites');
  await page.evaluate(() => openRoute('businesses/standards'));
  const std = page.locator('#secStandards .bz-mk [data-gw="marketing"]');
  assert.deepEqual(await std.allInnerTexts(), ['Set the cheapest mix at 2 sites', 'Set up all 2 sites']);
  await std.nth(1).click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('h2').textContent(), 'Set up marketing at 2 sites');
  assert.deepEqual((await writes(page))[0].body.sites.map(s => `${s.address.street}#${s.address.number}`), [G, B]);
  assert.match(await dlg.locator('.gw-mkrow').nth(1).innerText(), /switches added, nothing else changes/);
  assert.match(await dlg.locator('.gw-tally').innerText(), /\$3,000[\s\S]*\$3,100/);
  // A refused site in a run of many is said in its row, with Leave it out.
  await page.keyboard.press('Escape');
  await page.evaluate(() => { showPage('today'); });
  await act.click();
  await phase(page, 'ready');
  const bad = dlg.locator('.gw-mkrow.bad');
  assert.match(await bad.innerText(), /No marketing agency in the city offers a campaign in this mix/);
  assert.equal(await dlg.locator('[data-gw-b="apply"]').isDisabled(), true);
  await bad.locator('[data-gw-leave]').click();
  await phase(page, 'ready');
  assert.equal(await dlg.locator('[data-gw-b="apply"]').isDisabled(), false);
  assert.equal(await dlg.locator('h2').textContent(), 'Set the cheapest mix at 1 site');
  assert.deepEqual((await writes(page)).at(-1).body.sites.map(s => s.address.number), [10]);
});
