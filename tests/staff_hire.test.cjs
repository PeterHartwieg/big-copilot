// Company > Staff: hiring for every site (docs/staff-hire-plan.md; the page is
// the second design, mockup/staff-hire-v2/NOTES.md). The board is the real
// page from render(), its payload the real extract() of the synthetic company
// in tests/es3_fixture.py with a hand-made hiring overlay in the shape of the
// plan's section 2: three shops (one new, one with a spare person), a factory,
// an office, a headquarters and a warehouse, and invented candidates. Its
// source is a stub that keeps the board's watch() callbacks and answers the
// game link's health and writes as each test says. Never a real save.
// Install Playwright and its Chromium browser to run; NODE_PATH may point at
// an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const PYTHON = process.env.PYTHON || 'python';
const CS = 'ba:skill_customerservice', CLEAN = 'ba:skill_cleaning', FW = 'ba:skill_factoryworker';
const LAW = 'ba:skill_lawyer', HRM = 'ba:skill_hrmanager', DRV = 'ba:skill_deliverydriver';
const PT = 'ba:jobdemand_parttime';
const G = 'ba:street_secondavenue#10', C = 'ba:street_broadway#2', B = 'ba:street_fifthavenue#4';
const W = 'ba:street_pier#9', F = 'ba:street_industry#3', O = 'ba:street_park#88', Q = 'ba:street_wall#1';
const addr = key => ({street: key.slice(0, key.lastIndexOf('#')), number: Number(key.slice(key.lastIndexOf('#') + 1))});
// The host page's source, as web/app.js hands one over, plus the game link:
// window.hrLink is /health as the board last read it (null: not linked), and
// window.hrAnswer(kind, body, o) answers a write.
const STUB = '<script>window.hrWrites = []; window.LEDGER_SOURCE = {label: "Live", data: async () => null, '
  + 'name: async () => null, watch(h){ window.calmWatch = h; }, link: () => window.hrLink || null, '
  + 'write: async (kind, body, o) => { window.hrWrites.push({kind, body: JSON.parse(JSON.stringify(body)), dryRun: !!(o && o.dryRun)}); '
  + 'return window.hrAnswer ? window.hrAnswer(kind, body, o) : {status: 0, error: "unreachable", body: null}; }};</script>';

const cand = (id, name, skills, wage, o = {}) => Object.assign({
  id, name, age: 30, skill: skills[0][0], level: skills[0][1],
  skills: skills.map(([skill, level]) => ({skill, level})), wage, demands: [], hoursLeft: 100, source: 'headhunter'}, o);
const CANDS = [
  cand('c1', 'Ada Brandt', [[CS, 90]], 30),
  cand('c2', 'Bram Castell', [[CS, 90]], 25),
  cand('c3', 'Cleo Duvall', [[CS, 85]], 20, {demands: ['ba:jobdemand_freeweekends']}),
  cand('c4', 'Dario Engstrom', [[CS, 80]], 22, {demands: ['ba:jobdemand_coffeemachine']}),
  cand('c5', 'Edda Farrow', [[CS, 75]], 18, {demands: ['ba:jobdemand_goldhealthinsurance']}),
  cand('c6', 'Femi Gallo', [[CS, 70]], 40, {hoursLeft: 10}),
  cand('c7', 'Greta Hartley', [[CS, 60]], 15, {demands: ['ba:jobdemand_nonights']}),
  cand('c8', 'Hollis Ilves', [[CLEAN, 70], [CS, 40]], 12),
  cand('k1', 'Ines Jansen', [[CLEAN, 88]], 16),
  cand('f1', 'Jonas Kestrel', [[FW, 92]], 28),
  cand('f2', 'Kaia Lomax', [[FW, 80]], 26),
  cand('l1', 'Lior Marlow', [[LAW, 91]], 50),
  cand('h1', 'Mara Nyberg', [[HRM, 85]], 40, {hoursLeft: 5}),
  cand('d1', 'Nils Okafor', [[DRV, 70]], 20),
  cand('x1', 'Odile Pell', [['ba:skill_dj', 50]], 14),
];
const slot = (shift, d, f, t, station) => ({shift, d, f, t, station});

// The overlay: the plan's payload keys on top of the fixture company.
function withHiring(text) {
  const d = JSON.parse(text);
  const depot = d.businesses.find(b => b.key === W);
  const clone = (key, name, code, type, typeSlug, print) => Object.assign(JSON.parse(JSON.stringify(depot)),
    {key, name, code, type, typeSlug, shiftPrint: print, address: name});
  d.businesses.push(clone(F, 'HART. Works', 'IC', 'Factory', 'ba:businesstype_factory', 'f00df00d'),
    clone(O, 'HART. Law', 'MH', 'Law Firm', 'ba:businesstype_lawfirm', '0ff1ce00'),
    clone(Q, 'HART. HQ', 'LM', 'Headquarters', 'ba:businesstype_headquarters', null));
  const fIndex = d.businesses.findIndex(b => b.key === F);
  Object.assign(d.names, {
    [CS]: 'Customer Service', [CLEAN]: 'Cleaning', [FW]: 'Factory Worker', [LAW]: 'Lawyer', [HRM]: 'HR Manager',
    [DRV]: 'Delivery Driver', 'ba:skill_dj': 'DJ', 'ba:jobdemand_freeweekends': 'Free weekends',
    'ba:jobdemand_coffeemachine': 'Coffee Machine', 'ba:jobdemand_goldhealthinsurance': 'Gold Health Insurance',
    'ba:jobdemand_nonights': 'No night shifts', [PT]: 'Part-time'});
  const row = key => d.staffing.find(r => r.key === key);
  // Gifts: Ana works Monday and Tuesday; the plan wants Wednesday to Sunday
  // too, as two hire weeks.
  Object.assign(row(G), {
    stations: [{id: 'REG-G', name: 'Register', skill: CS, rate: 20}],
    people: [{id: 'AAAAemployeeAAAAAAAAAAAA', name: 'Ana Silva'}],
    roles: [{skill: CS, label: 'Customer Service', stations: [0]}],
    shifts: [{d: 1, s: 0, f: 8, t: 20, p: 0}, {d: 2, s: 0, f: 8, t: 20, p: 0}, {d: 3, s: 0, f: 8, t: 20, p: null},
      {d: 4, s: 0, f: 8, t: 20, p: null}, {d: 5, s: 0, f: 8, t: 20, p: null}, {d: 6, s: 0, f: 8, t: 20, p: null},
      {d: 0, s: 0, f: 8, t: 20, p: null}],
    current: {shifts: 2, fragments: 0, coverFragments: 0, cleaning: 0, security: 0,
      list: [{d: 1, s: 0, f: 8, t: 20, p: 0}, {d: 2, s: 0, f: 8, t: 20, p: 0}]},
    fullCover: null,
  });
  // Corner: Cy works Monday and the plan keeps him; Sam has hours now and
  // none in the plan: a spare.
  Object.assign(row(C), {
    stations: [{id: 'REG-C', name: 'Register', skill: CS, rate: 20}],
    people: [{id: 'CCCCemployeeCCCCCCCCCCCC', name: 'Cy Moss'}, {id: 'SPARE1', name: 'Sam Spare'}],
    roles: [{skill: CS, label: 'Customer Service', stations: [0]}],
    shifts: [{d: 1, s: 0, f: 8, t: 20, p: 0}],
    current: {shifts: 2, fragments: 0, coverFragments: 0, cleaning: 0, security: 0,
      list: [{d: 1, s: 0, f: 8, t: 20, p: 0}, {d: 2, s: 0, f: 8, t: 20, p: 1}]},
    fullCover: null,
  });
  // Bare: opened without staff, so the page plans it with full cover. Bo, on
  // the bench, is already in that plan.
  Object.assign(row(B), {
    stations: [{id: 'REG-B', name: 'Register', skill: CS, rate: 20}, {id: 'CLN-B', name: 'Cleaning station', skill: CLEAN, rate: null}],
    people: [{id: 'BENCH1', name: 'Bo Bench'}],
    roles: [{skill: CS, label: 'Customer Service', stations: [0]}],
    shifts: [],
    fullCover: Object.assign({}, row(B).fullCover, {openNow: false, shifts: [
      {d: 1, s: 0, f: 0, t: 12, p: null}, {d: 2, s: 0, f: 0, t: 12, p: null}, {d: 3, s: 0, f: 0, t: 12, p: null},
      {d: 4, s: 0, f: 0, t: 12, p: null}, {d: 5, s: 0, f: 0, t: 12, p: null}, {d: 6, s: 0, f: 0, t: 12, p: null},
      {d: 1, s: 1, f: 8, t: 20, p: 0, k: 'clean'}, {d: 2, s: 1, f: 8, t: 20, p: null, k: 'clean'},
      {d: 3, s: 1, f: 8, t: 20, p: null, k: 'clean'}, {d: 4, s: 1, f: 8, t: 20, p: null, k: 'clean'}]}),
  });
  const fac = (hire, extra) => Object.assign({key: F, s: fIndex, name: 'HART. Works', lines: [],
    headcount: {needed: 96, min: 2, have: 1, spare: 0, hire}, wageDay: 200, delta: {workers: hire, perDay: hire * 200},
    stations: [{id: 'MACH-1', name: 'Machine', skill: FW}], people: [{id: 'FW1', name: 'Fay Works'}]}, extra);
  d.factoryStaffing = {
    cap: [fac(2, {shifts: [{d: 1, s: 0, f: 0, t: 12, p: 0}, {d: 2, s: 0, f: 0, t: 12, p: null}, {d: 3, s: 0, f: 0, t: 12, p: null},
      {d: 4, s: 0, f: 0, t: 12, p: null}, {d: 5, s: 0, f: 0, t: 12, p: null}]})],
    dem: [fac(1, {shifts: [{d: 1, s: 0, f: 0, t: 12, p: 0}, {d: 2, s: 0, f: 0, t: 12, p: null}]})],
  };
  d.officeStaffing = [{key: O, name: 'HART. Law', stations: [{id: 'DESK-1', name: 'Computer', skill: LAW}], people: [],
    shifts: [{d: 1, s: 0, f: 8, t: 22, p: null}, {d: 2, s: 0, f: 8, t: 22, p: null}, {d: 3, s: 0, f: 8, t: 22, p: null}]}];
  d.candidates = CANDS;
  d.hiring = {
    bench: ['BENCH1'],
    people: {SPARE1: {name: 'Sam Spare', skills: [{skill: CS, level: 66}], wage: 21, site: C, hours: 12, demands: []},
      BENCH1: {name: 'Bo Bench', skills: [{skill: CLEAN, level: 55}, {skill: CS, level: 20}], wage: 17, site: null, hours: 0, demands: []}},
    demandKinds: {'ba:jobdemand_freeweekends': 'schedule', 'ba:jobdemand_nonights': 'schedule', 'ba:jobdemand_fulltime': 'schedule',
      'ba:jobdemand_coffeemachine': 'site', 'ba:jobdemand_goldhealthinsurance': 'company'},
    company: {'ba:jobdemand_goldhealthinsurance': false},
    sites: [
      {key: G, name: 'HART. Gifts', kind: 'shop', address: addr(G), planned: true, new: false, accepts: [CS, CLEAN],
       facts: {'ba:jobdemand_coffeemachine': false},
       plans: {demand: {spare: [], bench: [], hireWeeks: [
         {skill: CS, hours: 24, days: 2, slots: [slot(2, 3, 8, 20, 'REG-G'), slot(3, 4, 8, 20, 'REG-G')]},
         {skill: CS, hours: 36, days: 3, slots: [slot(4, 5, 8, 20, 'REG-G'), slot(5, 6, 8, 20, 'REG-G'), slot(6, 0, 8, 20, 'REG-G')]}]}}},
      {key: C, name: 'HART. Corner', kind: 'shop', address: addr(C), planned: true, new: false, accepts: [CS, CLEAN], facts: {},
       plans: {demand: {spare: ['SPARE1'], bench: [], hireWeeks: []}}},
      {key: B, name: 'HART. Bare', kind: 'shop', address: addr(B), planned: true, new: true, accepts: [CS, CLEAN],
       facts: {'ba:jobdemand_coffeemachine': true},
       plans: {demand: {spare: [], bench: [], hireWeeks: []}, full: {spare: [], bench: ['BENCH1'], hireWeeks: [
         {skill: CS, hours: 36, days: 3, slots: [slot(0, 1, 0, 12, 'REG-B'), slot(1, 2, 0, 12, 'REG-B'), slot(2, 3, 0, 12, 'REG-B')]},
         {skill: CS, hours: 36, days: 3, slots: [slot(3, 4, 0, 12, 'REG-B'), slot(4, 5, 0, 12, 'REG-B'), slot(5, 6, 0, 12, 'REG-B')]},
         {skill: CLEAN, hours: 36, days: 3, slots: [slot(7, 2, 8, 20, 'CLN-B'), slot(8, 3, 8, 20, 'CLN-B'), slot(9, 4, 8, 20, 'CLN-B')]}]}}},
      {key: F, name: 'HART. Works', kind: 'factory', address: addr(F), planned: true, new: false, accepts: [FW], facts: {},
       plans: {cap: {spare: [], bench: [], hireWeeks: [
         {skill: FW, hours: 24, days: 2, slots: [slot(1, 2, 0, 12, 'MACH-1'), slot(2, 3, 0, 12, 'MACH-1')]},
         {skill: FW, hours: 24, days: 2, slots: [slot(3, 4, 0, 12, 'MACH-1'), slot(4, 5, 0, 12, 'MACH-1')]}]},
         dem: {spare: [], bench: [], hireWeeks: [{skill: FW, hours: 12, days: 1, slots: [slot(1, 2, 0, 12, 'MACH-1')]}]}}},
      {key: O, name: 'HART. Law', kind: 'office', address: addr(O), planned: true, new: true, accepts: [LAW], facts: {},
       plans: {office: {spare: [], bench: [], hireWeeks: [
         {skill: LAW, hours: 42, days: 3, slots: [slot(0, 1, 8, 22, 'DESK-1'), slot(1, 2, 8, 22, 'DESK-1'), slot(2, 3, 8, 22, 'DESK-1')]}]}}},
      {key: Q, name: 'HART. HQ', kind: 'hq', address: addr(Q), planned: false, new: false, accepts: [HRM], facts: {}, plans: {}},
      {key: W, name: 'HART. Depot', kind: 'warehouse', address: addr(W), planned: false, new: false, accepts: [DRV], facts: {}, plans: {}},
    ],
  };
  return JSON.stringify(d);
}

let browser, html, payload;
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staff-hire-'));
  try {
    const save = path.join(dir, 'hire.hsg'), data = path.join(dir, 'payload.json');
    const made = spawnSync(PYTHON, [path.join(root, 'tests', 'es3_fixture.py'), save, data], {cwd: root});
    assert.equal(made.status, 0, made.stderr?.toString());
    payload = withHiring(fs.readFileSync(data, 'utf8'));
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

// The board after its first delivery, on Company > Staff. `link` is the
// game link's health (null: a save file, not linked).
async function board(t, {link = {writes: ['uniforms', 'imports', 'schedule', 'hire'], day: 34, hour: 14, minute: 0, character: 'default', company: 'Link Co'},
                         viewport = {width: 1280, height: 1400}, data = payload, open = true} = {}) {
  const context = await browser.newContext({viewport, reducedMotion: 'reduce'});
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await context.route('https://**', route => route.abort());
  await context.route('https://hire.test/', route => route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await context.addInitScript(l => { window.hrLink = l; }, link);
  await page.goto('https://hire.test/', {waitUntil: 'load'});
  await page.evaluate(() => { document.body.classList.add('has-board'); });
  await page.evaluate(p => window.calmWatch.changed(JSON.parse(p)), data);
  if (open) await page.evaluate(() => { showPage('company'); showSub('company', 'staff'); });
  return page;
}
// The page's own answer, as plain data.
const model = page => page.evaluate(() => {
  const m = hrModel();
  const who = x => !x.who ? null : x.who.type === 'move' ? `move:${x.who.m.id}` : x.who.type === 'quick' ? `quick:${x.who.c.id}` : `hire:${x.who.c.id}${x.who.misfit.length ? '!' : ''}`;
  return {
    moves: m.moves.map(x => ({id: x.id, from: x.from ? x.from.key : null, to: x.to.key, fixed: !!x.fixed, off: !!x.off})),
    weeks: m.sites.map(S => [S.key, S.variant, S.weeks.map(who)]),
    roles: m.roles.map(r => ({skill: r.skill, short: r.short, pass: r.pass, picked: r.picked.map(c => c.id)})),
    overs: m.overs.map(o => [o.c.id, o.S.key]),
  };
});
const request = page => page.evaluate(() => hrRequest(hrModel()).body);
const quick = page => page.evaluate(() => {
  const Q = hrQuickModel(hrModel());
  return {ready: Q.ready, ex: Q.ex, matches: Q.matches.map(c => c.id), picks: Q.picks.map(p => [p.c.id, p.w ? p.w.hours : null]), short: Q.short};
});
const quickRequest = page => page.evaluate(() => hrQuickRequest(hrQuickModel(hrModel())).body);
const REVIEW = '#hsOrder button.hs-cta[data-hs-review]';
const phase = (page, p) => page.waitForFunction(p => document.querySelector('dialog.gw-dlg')?.dataset.phase === p, p);
// Adds candidates to the payload.
const withCands = (...more) => { const d = JSON.parse(payload); d.candidates.push(...more); return JSON.stringify(d); };

test('netting: the bench a plan counts on, then spare people, then hires, best first', async (t) => {
  const page = await board(t);
  const m = await model(page);
  // Bo is assigned where the full-cover plan already has him; Sam, spare at
  // Corner, takes Gifts' first Customer Service week before anyone is hired.
  assert.deepEqual(m.moves, [
    {id: 'BENCH1', from: null, to: B, fixed: true, off: false},
    {id: 'SPARE1', from: C, to: G, fixed: false, off: false},
  ]);
  // A tie at 90 goes to the lower wage (Bram before Ada); sites fill in list
  // order; Cleo asks for free weekends and Bare's last week has a Saturday,
  // so she takes it with a warning (!) rather than not at all.
  assert.deepEqual(m.weeks, [
    [G, 'demand', ['move:SPARE1', 'hire:c2']],
    [C, 'demand', []],
    [B, 'full', ['hire:c1', 'hire:c3!', 'hire:k1']],
    [F, 'cap', ['hire:f1', 'hire:f2']],
    [O, 'office', ['hire:l1']],
    [Q, null, []],
    [W, null, []],
  ]);
  assert.deepEqual(m.roles.map(r => [r.skill, r.picked, r.short]),
    [[CS, ['c2', 'c1', 'c3'], 0], [FW, ['f1', 'f2'], 0], [CLEAN, ['k1'], 0], [LAW, ['l1'], 0]]);

  // The table: one row a role, the reassign line under its role.
  const roles = page.locator('#hsOpen table.hs-roles');
  assert.deepEqual(await roles.locator('tbody tr[data-hr-role]').evaluateAll(rs => rs.map(r => r.dataset.hrRole)), [CS, FW, CLEAN, LAW]);
  const cs = await roles.locator(`tr[data-hr-role="${CS}"] td`).allTextContents();
  // Open 4, own staff 1 (Sam), 3 new hires at 88% and $25/h on average, none
  // stays open.
  assert.deepEqual([cs[1], cs[2], cs[4]], ['4', '1', '–']);
  assert.match(cs[3], /^3\s*88% · \$25\/h$/);
  assert.match(cs[5], /^\+\$[\d,]+$/);
  assert.match(cs[6], /Change picks/);
  assert.equal(await roles.locator(`button[data-hr-open="${CS}"]`).getAttribute('aria-label'), 'Change picks: Customer Service');
  const sub = roles.locator(`tr[data-hr-role="${CS}"] + tr.hs-subrow .hs-re`);
  assert.match(await sub.textContent(), /Reassign 1 · HART\. Corner \(no hours\) → HART\. Gifts/);
  assert.equal(await sub.locator(`input[data-hr-move="${C}|${G}|${CS}"]`).isChecked(), true);
  // Bo's fixed assignment: no checkbox.
  const bo = roles.locator(`tr[data-hr-role="${CLEAN}"] + tr.hs-subrow .hs-re`);
  assert.match(await bo.textContent(), /Assign 1 · unassigned → HART\. Bare/);
  assert.equal(await bo.locator('input').count(), 0);
  // Bo's assignment takes no hire week: own staff counts Sam alone.
  assert.match(await roles.locator('tfoot').textContent(), /^Total8170\+\$[\d,]+$/);
  assert.match(await page.locator('#hsOpen .hs-facts2').textContent(), /^15 candidates · 2 expire within 24 h$/);
  // The order panel: what the button does.
  const order = page.locator('#hsOrder');
  assert.deepEqual(await order.locator('.hs-ol li > span').allTextContents(), ['Reassign', 'Hire']);
  assert.match(await order.locator('.hs-ol').textContent(), /Reassign2.*Hire7/);
  assert.match(await order.locator('.hs-sum').textContent(), /^Added wages\+\$[\d,]+\/day$/);
  assert.equal((await page.locator(REVIEW).textContent()).trim(), 'Review and hire 7');
  assert.equal(await order.locator('.hs-note').textContent(), 'Picked for you. You confirm next.');
  assert.equal(await page.locator('#secStaff .hs-head h2').textContent(), 'Staff');
  assert.equal(await page.locator('#secStaff .hs-link').textContent(), 'Game linked');

  // Unticking the reassign returns its week to hiring: Bram now takes Gifts'
  // first week, and Cleo finds a week at Bare without a weekend.
  await page.locator(`[data-hr-move="${C}|${G}|${CS}"]`).uncheck();
  const off = await model(page);
  assert.equal(off.moves[1].off, true);
  assert.deepEqual(off.weeks.slice(0, 3), [
    [G, 'demand', ['hire:c2', 'hire:c1']],
    [C, 'demand', []],
    [B, 'full', ['hire:c3', 'hire:c4', 'hire:k1']],
  ]);
  assert.equal(await page.locator(`[data-hr-move="${C}|${G}|${CS}"]`).isChecked(), false);
  assert.equal((await page.locator(REVIEW).textContent()).trim(), 'Review and hire 8');
});

test('ties past the wage go to the id, and the sizing on Supply picks the factory plan', async (t) => {
  const d = JSON.parse(payload);
  d.candidates = d.candidates.map(c => c.id === 'c1' ? Object.assign({}, c, {wage: 25}) : c);
  const page = await board(t, {data: JSON.stringify(d)});
  assert.deepEqual((await model(page)).roles[0].picked, ['c1', 'c2', 'c3']);
  await page.evaluate(() => { sizing = 'dem'; renderAll(); });
  const m = await model(page);
  assert.deepEqual(m.weeks[3], [F, 'dem', ['hire:f1']]);
});

test('filters: company-wide from the demand list, and a role of its own in Change picks', async (t) => {
  const page = await board(t);
  const bar = page.locator('#hsOpen .hs-fbar[data-hr-filters=""]');
  assert.match(await bar.locator('.hs-fsum').textContent(), /^12 match$/);
  // Leaving out anyone who asks for free weekends: Cleo goes, Dario takes
  // her place.
  await bar.locator('[data-hs-dem-open=""]').click();
  const pop = page.locator('body > #hsDemPop');
  assert.equal(await pop.isVisible(), true);
  await pop.locator('[data-hr-dem="ba:jobdemand_freeweekends"]').check();
  let m = await model(page);
  assert.deepEqual(m.roles[0].picked, ['c2', 'c1', 'c4']);
  assert.match(await page.locator('#hsOpen [data-hs-dem-open=""]').textContent(), /Leave out who asks for: Part-time, Free weekends/);
  assert.equal(await page.locator('#hsDemPop [data-hr-dem="ba:jobdemand_freeweekends"]').isChecked(), true);
  assert.match(await page.locator('#hsOpen .hs-fsum').textContent(), /^11 match$/);
  // Kept per character, with the version.
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('ba_dash_hire:default')));
  assert.deepEqual(kept, {v: 2, company: {ex: [PT, 'ba:jobdemand_freeweekends'], min: 0, max: null}, roles: {}});
  // Clear empties the list, All of them too.
  await page.locator('#hsDemPop [data-hs-dem-clear]').click();
  assert.match(await page.locator('#hsOpen [data-hs-dem-open=""]').textContent(), /Leave out who asks for: nobody/);
  await page.locator('#hsDemPop [data-hr-dem="ba:jobdemand_freeweekends"]').check();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#hsDemPop').count(), 0);

  // Cleaning gets its own filters: skill at least 90 leaves Ines (88) and
  // Hollis (70) out, so a Cleaning place stays open; Customer Service is
  // untouched.
  await page.locator(`[data-hr-open="${CLEAN}"]`).click();
  const sheet = page.locator(`body > dialog#hsSheet.hs-sheet[data-hr-drawer="${CLEAN}"]`);
  assert.equal(await sheet.isVisible(), true);
  assert.equal(await sheet.locator('h2').textContent(), 'Cleaning');
  await sheet.locator('[data-hr-scope="own"]').check();
  await sheet.locator(`.hs-fbar[data-hr-filters="${CLEAN}"] [data-hr-min]`).selectOption('90');
  m = await model(page);
  assert.deepEqual(m.roles.find(r => r.skill === CLEAN), {skill: CLEAN, short: 1, pass: 0, picked: []});
  assert.deepEqual(m.roles[0].picked, ['c2', 'c1', 'c4']);
  assert.equal(await sheet.locator('[data-hr-scope="own"]').isChecked(), true);
  assert.match(await sheet.locator('.hs-scope').textContent(), /every role.*Cleaning only/);
  assert.match(await sheet.locator('.hs-fbar .hs-fsum').textContent(), /0 match · 2 left out/);
  const stays = page.locator(`#hsOpen tr[data-hr-role="${CLEAN}"] td:nth-child(5)`);
  assert.equal(await stays.textContent(), '1');
  assert.equal(await stays.getAttribute('class'), 'warn');
  assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('ba_dash_hire:default')))).roles[CLEAN].min, 90);
  // Its own demand list sits in the sheet.
  await sheet.locator(`[data-hs-dem-open="${CLEAN}"]`).click();
  assert.equal(await page.locator('dialog#hsSheet > #hsDemPop').count(), 1);
  await page.keyboard.press('Escape');
  // Back to every role: the company's filters again.
  await sheet.locator('[data-hr-scope="all"]').check();
  assert.deepEqual((await model(page)).roles.find(r => r.skill === CLEAN).picked, ['k1']);
  await sheet.locator('[data-hs-done]').click();
  await page.locator('#hsSheet').waitFor({state: 'detached'});
});

test('a demand the site does not meet warns and still picks', async (t) => {
  const d = JSON.parse(payload);
  // Nobody better than Dario (coffee machine: not at Gifts, at Bare) and
  // Edda (gold insurance: not offered) for Gifts.
  d.candidates = d.candidates.filter(c => !['c1', 'c2', 'c3'].includes(c.id));
  d.hiring.bench = []; d.hiring.sites[1].plans.demand.spare = [];
  const page = await board(t, {data: JSON.stringify(d)});
  const m = await model(page);
  assert.deepEqual(m.weeks[0], [G, 'demand', ['hire:c4', 'hire:c5']]);
  const warns = await page.evaluate(() => {
    const m = hrModel();
    return m.sites[0].weeks.map(x => hrWarns(m, x.who.c, x.S, x).map(([d, t]) => `${d}:${t}`));
  });
  assert.deepEqual(warns, [['ba:jobdemand_coffeemachine:warn'], ['ba:jobdemand_goldhealthinsurance:no']]);
  await page.locator(`[data-hr-open="${CS}"]`).click();
  const warned = await page.$$eval(`#hsSheet[data-hr-drawer="${CS}"] tr.on td.dem .warn`, els => els.map(e => e.textContent));
  // Greta, at Bare, asks for no nights and gets 0 to 12: her hours break it.
  assert.deepEqual(warned, ['Coffee Machine (none at HART. Gifts)', 'Gold Health Insurance (not offered)',
    "No night shifts (the plan's hours break it)"]);
  assert.deepEqual((await page.locator('#hsSheet [data-hr-cand="c4"] td').allTextContents()).map(x => x.trim()),
    ['', 'Dario EngstromCoffee Machine (none at HART. Gifts)', '80%', '$22', 'HART. Gifts', 'Coffee Machine (none at HART. Gifts)', '4 days']);
  // The reason also sits under the name, shown on phones only.
  assert.equal(await page.locator('#hsSheet [data-hr-cand="c4"] td.nm small.hs-why.warn').textContent(), 'Coffee Machine (none at HART. Gifts)');
  // Femi's application expires in 10 hours.
  assert.equal(await page.locator('#hsSheet [data-hr-cand="c6"] td.exp').textContent(), '10 h');
  assert.equal(await page.locator('#hsSheet [data-hr-cand="c4"] td.exp').textContent(), '4 days');
});

test('open places, and ticking one more over the plan', async (t) => {
  const page = await board(t);
  await page.locator('#hsOpen .hs-fbar[data-hr-filters=""] [data-hr-min]').selectOption('90');
  let m = await model(page);
  const cs = m.roles[0];
  assert.deepEqual([cs.picked, cs.short], [['c2', 'c1'], 1]);
  const short = page.locator('#hsOrder .hs-ol li.short');
  assert.match(await short.textContent(), /^Stays open3Customer Service: 1 open · Factory Worker: 1 open · Cleaning: 1 open$/);
  await page.locator('#hsOpen .hs-fbar[data-hr-filters=""] [data-hr-min]').selectOption('0');
  assert.equal(await short.count(), 0);
  // Unticking Bram lets the next best in; ticking Greta, who nobody needs, is
  // over the plan: at the first site with a week in her role, no hours.
  await page.locator(`[data-hr-open="${CS}"]`).click();
  const sheet = page.locator('#hsSheet');
  await sheet.locator('[data-hr-pick="c2"]').uncheck();
  m = await model(page);
  assert.deepEqual(m.roles[0].picked, ['c1', 'c3', 'c4']);
  assert.equal(await sheet.locator('[data-hr-cand="c2"]').getAttribute('class'), '');
  await sheet.locator('[data-hr-pick="c7"]').check();
  m = await model(page);
  assert.deepEqual(m.overs, [['c7', G]]);
  assert.match(await sheet.locator('[data-hr-cand="c7"]').textContent(), /HART\. Gifts over the plan/);
  assert.equal(await sheet.locator('[data-hr-cand="c7"]').getAttribute('class'), 'on');
  assert.match(await sheet.locator('.hs-grp').first().textContent(), /Picked4 of 3 · 1 over the plan/);
  const body = await request(page);
  assert.deepEqual(body.hires.find(h => h.candidateId === 'c7'), {candidateId: 'c7', address: addr(G), expect: {wage: 15}, seenHoursLeft: 100});
  const gifts = body.sites.find(s => s.address.number === 10);
  assert.ok(!gifts.days.some(d => d.shifts.some(s => s.employeeId === 'c7')), 'no hours over the plan');
  // Reset to automatic undoes both ticks.
  await sheet.locator('[data-hs-reset]').click();
  m = await model(page);
  assert.deepEqual([m.roles[0].picked, m.overs], [['c2', 'c1', 'c3'], []]);
  // Show all lists past the first ten; the left out on demand.
  await sheet.locator('[data-hs-close]').click();
  await page.locator('#hsSheet').waitFor({state: 'detached'});
});

test('Change picks lists the next best, all of them, and the left out', async (t) => {
  const more = Array.from({length: 12}, (_, i) => cand(`n${i}`, `Next ${i}`, [[CS, 30 + i]], 10));
  const page = await board(t, {data: withCands(...more, cand('pt', 'Pia Tall', [[CS, 99]], 10, {demands: [PT]}))});
  await page.locator(`[data-hr-open="${CS}"]`).click();
  const sheet = page.locator('#hsSheet');
  assert.match(await sheet.locator('.hs-grp').nth(1).textContent(), /Next best17 more/);
  assert.equal(await sheet.locator('table').nth(1).locator('tbody tr').count(), 10);
  await sheet.locator('[data-hs-all]').click();
  assert.equal(await sheet.locator('table').nth(1).locator('tbody tr').count(), 17);
  // Pia asks for Part-time, left out by default for a shop role.
  const out = sheet.locator('[data-hs-out]');
  assert.equal(await out.textContent(), 'Show the 1 left out');
  await out.click();
  assert.equal(await sheet.locator('[data-hr-cand="pt"]').count(), 1);
  assert.equal(await sheet.locator('[data-hr-cand="pt"] input').isChecked(), false);
});

test('the request: a shop on its plan and on full cover, a factory, an office and a reassign', async (t) => {
  const page = await board(t);
  const body = await request(page);
  assert.deepEqual(body.moves, [
    {employeeId: 'BENCH1', from: null, to: addr(B)},
    {employeeId: 'SPARE1', from: addr(C), to: addr(G)},
  ]);
  assert.deepEqual(body.hires.map(h => [h.candidateId, h.address.number, h.expect.wage]),
    [['c2', 10, 25], ['c1', 4, 30], ['c3', 4, 20], ['k1', 4, 16], ['f1', 3, 28], ['f2', 3, 26], ['l1', 88, 50]]);
  const site = n => body.sites.find(s => s.address.number === n);
  assert.deepEqual(body.sites.map(s => s.address.number), [10, 2, 4, 3, 88]);
  // Gifts, on its demand plan: Ana as planned, Sam reassigned in, Bram hired.
  assert.deepEqual(site(10), {address: addr(G), expect: '9c98d93a', openAllHours: false, days: [
    {d: 0, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]},
    {d: 1, shifts: [{f: 8, t: 20, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
    {d: 2, shifts: [{f: 8, t: 20, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
    {d: 3, shifts: [{f: 8, t: 20, employeeId: 'SPARE1', itemInstanceId: 'REG-G'}]},
    {d: 4, shifts: [{f: 8, t: 20, employeeId: 'SPARE1', itemInstanceId: 'REG-G'}]},
    {d: 5, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]},
    {d: 6, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]}]});
  // Corner, the reassign's source: Sam has hours there now, so its week is
  // written without him.
  assert.deepEqual(site(2), {address: addr(C), expect: 'ecdcd9ed', openAllHours: false, days: [
    {d: 1, shifts: [{f: 8, t: 20, employeeId: 'CCCCemployeeCCCCCCCCCCCC', itemInstanceId: 'REG-C'}]}]});
  // Bare, new, on full cover: open around the clock; Bo on his cleaning day.
  assert.equal(site(4).openAllHours, true);
  assert.equal(site(4).expect, '811c9dc5');
  assert.deepEqual(site(4).days.find(d => d.d === 1).shifts, [
    {f: 0, t: 12, employeeId: 'c1', itemInstanceId: 'REG-B'}, {f: 8, t: 20, employeeId: 'BENCH1', itemInstanceId: 'CLN-B'}]);
  assert.deepEqual(site(4).days.find(d => d.d === 3).shifts, [
    {f: 0, t: 12, employeeId: 'c1', itemInstanceId: 'REG-B'}, {f: 8, t: 20, employeeId: 'k1', itemInstanceId: 'CLN-B'}]);
  // The factory's week, sized 24/7, and the office's.
  assert.deepEqual(site(3), {address: addr(F), expect: 'f00df00d', openAllHours: false, days: [
    {d: 1, shifts: [{f: 0, t: 12, employeeId: 'FW1', itemInstanceId: 'MACH-1'}]},
    {d: 2, shifts: [{f: 0, t: 12, employeeId: 'f1', itemInstanceId: 'MACH-1'}]},
    {d: 3, shifts: [{f: 0, t: 12, employeeId: 'f1', itemInstanceId: 'MACH-1'}]},
    {d: 4, shifts: [{f: 0, t: 12, employeeId: 'f2', itemInstanceId: 'MACH-1'}]},
    {d: 5, shifts: [{f: 0, t: 12, employeeId: 'f2', itemInstanceId: 'MACH-1'}]}]});
  assert.deepEqual(site(88).days.map(d => [d.d, d.shifts.map(s => `${s.employeeId}@${s.itemInstanceId} ${s.f}-${s.t}`)]),
    [[1, ['l1@DESK-1 8-22']], [2, ['l1@DESK-1 8-22']], [3, ['l1@DESK-1 8-22']]]);
});

test('a factory keeps its drivers and an office its cleaner when the week is replaced', async (t) => {
  const d = JSON.parse(payload);
  // The factory: a driver on the van (a station the plan does not staff) on
  // Tuesday and Wednesday, and Fay on a machine the plan leaves out, on
  // Monday, when the plan has her on MACH-1: the plan wins there. On
  // Saturday the plan puts her on MACH-1 8 to 12 and she drives 6 to 14:
  // her driving is cut around the machine, 6 to 8 and 12 to 14.
  const fac = d.factoryStaffing.cap[0];
  fac.shifts.push({d: 6, s: 0, f: 8, t: 12, p: 0});
  fac.stations.push({id: 'VAN-1', name: null, skill: null}, {id: 'MACH-9', name: null, skill: null});
  fac.people.push({id: 'DRV1', name: 'Dee Driver'});
  fac.current = {shifts: 4, fragments: 0, list: [{d: 1, s: 2, f: 6, t: 10, p: 0}, {d: 2, s: 1, f: 0, t: 6, p: 1}, {d: 3, s: 1, f: 6, t: 14, p: 1},
    {d: 6, s: 1, f: 6, t: 14, p: 0}]};
  // The office: a cleaner on Thursday.
  const law = d.officeStaffing[0];
  law.stations.push({id: 'CLN-O', name: null, skill: null});
  law.people.push({id: 'CLN1', name: 'Cora Clean'});
  law.current = {shifts: 1, fragments: 0, list: [{d: 4, s: 1, f: 8, t: 12, p: 0, k: 'clean'}]};
  const page = await board(t, {data: JSON.stringify(d)});
  const body = await request(page);
  const site = n => body.sites.find(s => s.address.number === n);
  assert.deepEqual(site(3).days, [
    {d: 1, shifts: [{f: 0, t: 12, employeeId: 'FW1', itemInstanceId: 'MACH-1'}]},
    {d: 2, shifts: [{f: 0, t: 6, employeeId: 'DRV1', itemInstanceId: 'VAN-1'}, {f: 0, t: 12, employeeId: 'f1', itemInstanceId: 'MACH-1'}]},
    {d: 3, shifts: [{f: 0, t: 12, employeeId: 'f1', itemInstanceId: 'MACH-1'}, {f: 6, t: 14, employeeId: 'DRV1', itemInstanceId: 'VAN-1'}]},
    {d: 4, shifts: [{f: 0, t: 12, employeeId: 'f2', itemInstanceId: 'MACH-1'}]},
    {d: 5, shifts: [{f: 0, t: 12, employeeId: 'f2', itemInstanceId: 'MACH-1'}]},
    {d: 6, shifts: [{f: 6, t: 8, employeeId: 'FW1', itemInstanceId: 'VAN-1'}, {f: 8, t: 12, employeeId: 'FW1', itemInstanceId: 'MACH-1'},
      {f: 12, t: 14, employeeId: 'FW1', itemInstanceId: 'VAN-1'}]}]);
  // What the plan took over is counted for the review: Monday's 4 hours and
  // Saturday's 4.
  assert.equal(await page.evaluate(k => hrRequest(hrModel()).touched.get(k).lost.hours, F), 8);
  assert.deepEqual(site(88).days.map(x => [x.d, x.shifts.map(s => `${s.employeeId}@${s.itemInstanceId} ${s.f}-${s.t}`)]),
    [[1, ['l1@DESK-1 8-22']], [2, ['l1@DESK-1 8-22']], [3, ['l1@DESK-1 8-22']], [4, ['CLN1@CLN-O 8-12']]]);
});

test('a factory that only sends a spare is rewritten without them', async (t) => {
  const d = JSON.parse(payload);
  const F2 = 'ba:street_industry#5';
  const works = d.businesses.find(b => b.key === F);
  d.businesses.push(Object.assign(JSON.parse(JSON.stringify(works)), {key: F2, name: 'HART. Mill', code: 'IM', shiftPrint: 'f2f2f2f2', address: 'HART. Mill'}));
  // Works: Fay on the plan's Monday; Finn has Thursday now and no hours in
  // the plan, spare as a factory worker. Mill wants one worker on Monday.
  const fac = d.factoryStaffing.cap[0];
  fac.people.push({id: 'FW2', name: 'Finn Spare'});
  fac.current = {shifts: 2, fragments: 0, list: [{d: 1, s: 0, f: 0, t: 12, p: 0}, {d: 4, s: 0, f: 0, t: 12, p: 1}]};
  d.factoryStaffing.cap.push({key: F2, s: d.businesses.length - 1, name: 'HART. Mill', lines: [],
    headcount: {needed: 12, min: 1, have: 0, spare: 0, hire: 1}, wageDay: 200, delta: {workers: 1, perDay: 200},
    stations: [{id: 'MACH-2', name: 'Machine', skill: FW}], people: [], shifts: [{d: 1, s: 0, f: 0, t: 12, p: null}]});
  const works2 = d.hiring.sites.find(s => s.key === F);
  works2.plans.cap.spare = ['FW2'];
  works2.plans.cap.spareSkills = {FW2: [FW]};
  d.hiring.people.FW2 = {name: 'Finn Spare', skills: [{skill: FW, level: 60}], wage: 25, site: F, hours: 12, demands: []};
  d.hiring.sites.splice(d.hiring.sites.indexOf(works2) + 1, 0, {key: F2, name: 'HART. Mill', kind: 'factory', address: addr(F2),
    planned: true, new: true, accepts: [FW], facts: {},
    plans: {cap: {spare: [], bench: [], hireWeeks: [{skill: FW, hours: 12, days: 1, slots: [slot(0, 1, 0, 12, 'MACH-2')]}]}}});
  const page = await board(t, {data: JSON.stringify(d)});
  const body = await request(page);
  assert.deepEqual(body.moves.find(m => m.employeeId === 'FW2'), {employeeId: 'FW2', from: addr(F), to: addr(F2)});
  const works3 = body.sites.find(s => s.address.number === 3);
  assert.equal(works3.expect, 'f00df00d');
  assert.ok(!works3.days.some(x => x.shifts.some(s => s.employeeId === 'FW2')), 'Finn leaves Works');
  assert.deepEqual(body.sites.find(s => s.address.number === 5).days,
    [{d: 1, shifts: [{f: 0, t: 12, employeeId: 'FW2', itemInstanceId: 'MACH-2'}]}]);
});

test('a spare is reassigned in the role they are spare in, not their best skill', async (t) => {
  const d = JSON.parse(payload);
  // Sam cleans better than he serves, but Corner has him spare as a cashier.
  d.hiring.people.SPARE1.skills = [{skill: CLEAN, level: 90}, {skill: CS, level: 66}];
  d.hiring.sites[1].plans.demand.spareSkills = {SPARE1: [CS]};
  const page = await board(t, {data: JSON.stringify(d)});
  const m = await model(page);
  assert.deepEqual(m.moves[1], {id: 'SPARE1', from: C, to: G, fixed: false, off: false});
  assert.equal(await page.evaluate(() => hrModel().moves[1].p.level), 66);
  // The line sits under Customer Service.
  assert.match(await page.locator(`#hsOpen tr[data-hr-role="${CS}"] + tr.hs-subrow`).textContent(), /Reassign 1/);
});

test('nobody in training is reassigned or assigned, and their planned hours stay empty', async (t) => {
  const d = JSON.parse(payload);
  d.hiring.people.BENCH1.training = true;
  d.hiring.people.SPARE1.training = true;
  const page = await board(t, {data: JSON.stringify(d)});
  const m = await model(page);
  assert.deepEqual(m.moves, []);
  const body = await request(page);
  assert.deepEqual(body.moves, []);
  const bare = body.sites.find(s => s.address.number === 4);
  assert.ok(!bare.days.some(x => x.shifts.some(s => s.employeeId === 'BENCH1')), 'no shift for someone not assigned here');
  assert.equal(await page.locator('#hsOpen .hs-re').count(), 0);
});

test('"Pick more" sends no reassign, and leaves the bench a plan counts on out of the week', async (t) => {
  const page = await board(t);
  const body = await page.evaluate(k => hrRequest(hrModel(), {[`${k}|ba:skill_customerservice`]: 1}).body, B);
  assert.deepEqual(body.moves, []);
  assert.deepEqual(body.hires.map(h => h.candidateId), ['c1']);
  const bare = body.sites.find(s => s.address.number === 4);
  assert.ok(!bare.days.some(x => x.shifts.some(s => s.employeeId === 'BENCH1')));
});

test('a role with no candidates says so instead of Change picks', async (t) => {
  const d = JSON.parse(payload);
  d.candidates = d.candidates.filter(c => c.id !== 'l1');
  const page = await board(t, {data: JSON.stringify(d)});
  const law = page.locator(`#hsOpen tr[data-hr-role="${LAW}"]`);
  assert.equal(await law.locator('[data-hr-open]').count(), 0);
  assert.equal(await law.locator('td.act').textContent(), 'No candidates');
  assert.match(await page.locator('#hsOrder .hs-ol li.short').textContent(), /Stays open1Lawyer: no candidates/);
});

test('a body over what the game link takes is named before anything is sent', async (t) => {
  const d = JSON.parse(payload);
  // Ana on 40,000 entries at Gifts: a week far past 2 MB.
  const gifts = d.staffing.find(r => r.key === G);
  for (let i = 0; i < 40000; i++) gifts.shifts.push({d: 1, s: 0, f: 8, t: 20, p: 0});
  const page = await board(t, {data: JSON.stringify(d)});
  await page.locator(REVIEW).click();
  await phase(page, 'nothing');
  const dlg = page.locator('dialog.gw-dlg');
  assert.match(await dlg.textContent(), /Too much for one go/);
  assert.match(await dlg.textContent(), /the link takes 2 MB/);
  assert.deepEqual(await page.evaluate(() => window.hrWrites.length), 0);
});

// A dry run's answer for the request the page sent, the game taking all of it
// except anyone named in `gone`.
const answerFor = (body, {dryRun = true, gone = [], ok = true, extra = {}} = {}) => Object.assign({
  ok, kind: 'hire', dryRun, stamp: 's1',
  hired: body.hires.filter(h => !gone.includes(h.candidateId)).map(h => ({candidateId: h.candidateId, name: h.candidateId, business: '', wage: h.expect.wage, hoursLeft: 90})),
  moved: body.moves.map(m => ({employeeId: m.employeeId, name: m.employeeId, from: '', to: '', shiftsCleared: 0})),
  skipped: gone.map(id => ({candidateId: id, name: id, reason: 'gone', hoursDropped: 24})),
  sites: body.sites.map(s => ({address: s.address, business: '', before: s.days ? {shifts: 2, print: 'a'} : null,
    after: s.days ? {shifts: 5, print: 'b'} : null, removed: s.days ? 2 : 0, added: s.days ? 5 : 0, openedHours: !!s.openAllHours,
    leftWithout: [], warnings: [], siteError: null})),
  wageAdded: 1, rows: []}, extra);
const answering = (page, gone) => page.evaluate(async ([src, gone]) => {
  window.answerFor = eval(src);
  window.hrAnswer = async (kind, body, o) => ({status: 200, error: null,
    body: window.answerFor(body, {dryRun: !!o.dryRun, gone: o.dryRun ? [] : gone})});
}, [`(${answerFor.toString()})`, gone]);

test('Review: the dry run, who goes where, one confirm with no undo, and a partial result', async (t) => {
  const page = await board(t);
  // The dry run takes everyone; by the confirm, Ada's application expired.
  await answering(page, ['c1']);
  const review = page.locator(REVIEW);
  assert.equal(await review.getAttribute('aria-disabled'), null);
  await review.click();
  const dlg = page.locator('dialog.gw-dlg.hr-wide');
  await phase(page, 'ready');
  assert.equal(await dlg.locator('h2').textContent(), 'Hire 7 and reassign 2');
  assert.match(await dlg.textContent(), /5 sites · everyone gets hours from their site's plan/);
  assert.match(await dlg.locator('.gw-verdict').textContent(), /The game can take all of them/);
  assert.deepEqual(await dlg.locator('.gw-tile .gw-lab').allTextContents(), ['Hire', 'Reassign', 'Added wages']);
  assert.match(await dlg.locator('.gw-body').textContent(), /Who goes where\. Open a site to see each person and the days they work\./);
  // One row a site touched, in list order.
  assert.deepEqual(await dlg.locator('.hr-dhead .s').allTextContents(), ['HART. Gifts', 'HART. Corner', 'HART. Bare', 'HART. Works', 'HART. Law']);
  assert.match(await dlg.locator('.gw-body').textContent(), /The week is replaced at/);
  const bare = dlg.locator('.hr-dsite', {has: page.locator(`[data-hr-site="${B}"]`)});
  assert.match(await bare.locator('.c').textContent(), /^3 new\+1 reassigned/);
  // A site opens for its people and their days.
  await dlg.locator(`[data-hr-site="${G}"]`).click();
  const people = dlg.locator('.hr-dsite.open .hr-dp:not(.hd)');
  assert.deepEqual(await people.locator('.who b').allTextContents(), ['Bram Castell', 'Sam Spare']);
  assert.deepEqual(await people.locator('.who small').allTextContents(), ['new hire', 'reassigned from HART. Corner']);
  assert.equal(await people.first().locator('.hr-wk i.on').count(), 3);
  const apply = dlg.locator('.gw-foot [data-gw-b="apply"]');
  assert.equal(await apply.textContent(), 'Hire 7 and reassign 2');
  await apply.click();
  await phase(page, 'done');
  const writes = await page.evaluate(() => window.hrWrites.map(w => [w.kind, w.dryRun]));
  assert.deepEqual(writes, [['hire', true], ['hire', false]]);
  // No Undo, and where to let someone go instead; Ada's application expired
  // before the game reached her.
  assert.equal(await dlg.locator('[data-gw-b="undo"]').count(), 0);
  const text = await dlg.locator('.gw-body').textContent();
  assert.match(text, /No undo\. To let someone go, fire them in MyEmployees in the game\./);
  assert.match(text, /1 application expired before the game reached it: Ada Brandt\./);
  assert.equal(await dlg.locator('.gw-body .hr-struck', {hasText: 'Ada Brandt'}).count() > 0, true);
  const more = dlg.locator('[data-hr-more]');
  assert.equal(await more.textContent(), 'Pick 1 more');
  assert.equal(await more.isDisabled(), true, 'waits for the board to read the game');
  assert.equal(await page.locator('#gwToast').count(), 0, 'no undo strip');
  // Bare's row counts who the game hired: Cleo and Ines, Ada's place open,
  // and the wage bill without her.
  assert.match(await bare.locator('.c').textContent(), /^2 hired\+1 reassigned1 still open/);
  assert.equal(await bare.locator('.hr-dots i.gap').count(), 1);
  assert.equal(await bare.locator('.hr-dots i.done').count(), 3);
  assert.equal(await bare.locator('.cst').textContent(), await page.evaluate(() => `+${fmt((20 * 36 + 16 * 36) / 7)}`));
  await bare.locator(`[data-hr-site="${B}"]`).click();
  assert.match(await dlg.locator('.hr-dsite.open').textContent(), /Ada Brandt.*application expired/);
  // The board reads the game again: Ada is gone from the candidates, and
  // "Pick 1 more" opens the review for Bare's week alone.
  await page.evaluate(p => {
    const d = JSON.parse(p);
    d.candidates = d.candidates.filter(c => c.id !== 'c1');
    window.calmWatch.changed(d);
  }, payload);
  assert.equal(await more.isDisabled(), false);
  await more.click();
  await phase(page, 'ready');
  const last = await page.evaluate(() => window.hrWrites.at(-1).body);
  assert.deepEqual(last.moves, []);
  assert.deepEqual(last.hires.map(h => [h.candidateId, h.address.number]), [['c3', 4]]);
});

test('the review names the hours a reassign leaves empty where the week is not replaced', async (t) => {
  const d = JSON.parse(payload);
  // Corner's schedule as the board read it has no hours for Sam, so its week
  // is not replaced; the game says the reassign clears two of his shifts there.
  d.staffing.find(r => r.key === C).current.list = [{d: 1, s: 0, f: 8, t: 20, p: 0}];
  const page = await board(t, {data: JSON.stringify(d)});
  await page.evaluate(src => { window.answerFor = eval(src); }, `(${answerFor.toString()})`);
  await page.evaluate(() => {
    window.hrAnswer = async (kind, body, o) => {
      const a = window.answerFor(body, {dryRun: !!o.dryRun});
      a.moved.forEach(m => { if(m.employeeId === 'SPARE1') m.shiftsCleared = 2; });
      return {status: 200, error: null, body: a};
    };
  });
  const body = await request(page);
  assert.ok(!body.sites.some(s => s.address.number === 2), 'Corner is not rewritten');
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  assert.match(await page.locator('dialog.gw-dlg .gw-body').textContent(), /Hours left empty.*Sam Spare \(2 shifts at HART\. Corner\)/);
});

test('refusals: a row the game refuses, and MyEmployees open', async (t) => {
  const page = await board(t);
  await page.evaluate(() => {
    window.hrAnswer = async (kind, body) => ({status: 200, error: null, body: {ok: false, kind: 'hire', dryRun: true,
      rows: [{scope: 'move', id: 'SPARE1', error: 'in_training'}], sites: [], hired: [], moved: [], skipped: []}});
  });
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.match(await dlg.locator('.gw-no').first().textContent(), /In training/);
  assert.match(await dlg.locator('.gw-no .gw-chip').first().textContent(), /Sam Spare/);
  assert.equal(await dlg.locator('[data-gw-b="apply"]').isDisabled(), true);
  await dlg.locator('[data-gw-close]').click();

  await page.evaluate(() => {
    window.hrAnswer = async () => ({status: 200, error: null, body: {ok: false, kind: 'hire', dryRun: true, blocked: 'myemployees',
      rows: [], sites: [], hired: [], moved: [], skipped: []}});
  });
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  assert.match(await dlg.locator('.gw-verdict').textContent(), /Close MyEmployees in the game/);
  assert.match(await dlg.textContent(), /Close the MyEmployees app on your in-game phone, then try again\./);
  assert.equal(await dlg.locator('[data-gw-b="retry"]').count(), 1, 'try again once it is closed');

  // The same, refused on the confirm (409 cannot_write).
  await dlg.locator('[data-gw-close]').click();
  await page.evaluate(src => { window.answerFor = eval(src); }, `(${answerFor.toString()})`);
  await page.evaluate(() => {
    window.hrAnswer = async (kind, body, o) => o.dryRun ? {status: 200, error: null, body: window.answerFor(body)}
      : {status: 409, error: 'cannot_write', body: {error: 'cannot_write', reason: 'myemployees'}};
  });
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  await dlg.locator('[data-gw-b="apply"]').click();
  await phase(page, 'failed');
  assert.match(await dlg.textContent(), /MyEmployees is open in the game/);
});

test('not linked: everything works from the save, the button is off with how to link', async (t) => {
  const page = await board(t, {link: null});
  const state = page.locator('#secStaff .hs-head .hs-link');
  assert.equal(await state.textContent(), 'Save file · game not linked');
  assert.equal(await state.getAttribute('class'), 'hs-link off');
  const review = page.locator(REVIEW);
  assert.equal(await review.getAttribute('aria-disabled'), 'true');
  assert.equal((await review.textContent()).trim(), 'Review and hire 7');
  assert.equal(await page.locator('[data-gw]').count(), 0, 'no write button while reading a save');
  const gate = page.locator('#hsOrder .hs-gate');
  assert.match(await gate.locator('b').textContent(), /^Link the game to hire$/);
  assert.equal(await gate.locator('li').count(), 3);
  assert.equal(await page.locator('#hsOrder .hs-note').count(), 0);
  assert.match(await page.locator('#hsOpen .hs-facts2').textContent(), /^15 candidates · 2 expire within 24 h \(as of the save\)$/);
  await review.dispatchEvent('click');
  assert.equal(await page.locator('dialog.gw-dlg').count(), 0);
  // The picks still work, and Quick hire picks but does not hire.
  await page.locator(`[data-hr-move="${C}|${G}|${CS}"]`).uncheck();
  assert.equal((await model(page)).moves[1].off, true);
  await page.locator('#hsQuick [data-hq-role]').selectOption(HRM);
  await page.locator('#hsQuick [data-hq-site]').selectOption(Q);
  assert.match(await page.locator('#hsQuick [data-hq-list] summary').textContent(), /1 match · picked/);
  assert.equal(await page.locator('#hsQuick [data-hq-go]').getAttribute('aria-disabled'), 'true');
});

test('the button waits for a mod that can hire', async (t) => {
  const page = await board(t, {link: {writes: ['uniforms', 'imports', 'schedule'], day: 34, hour: 14}});
  const state = page.locator('#secStaff .hs-head .hs-link');
  assert.equal(await state.textContent(), 'Mod · too old to hire');
  assert.equal(await state.getAttribute('class'), 'hs-link old');
  const review = page.locator(REVIEW);
  assert.equal(await review.getAttribute('aria-disabled'), 'true');
  const gate = page.locator('#hsOrder .hs-gate.warn');
  assert.match(await gate.textContent(), /Update Big Copilot Link to 0\.3\.0/);
  assert.match(await gate.textContent(), /Restart the game, then link again\./);
  await review.dispatchEvent('click');
  assert.equal(await page.locator('dialog.gw-dlg').count(), 0);
  await page.locator('#hsQuick [data-hq-role]').selectOption(HRM);
  await page.locator('#hsQuick [data-hq-site]').selectOption(Q);
  const go = page.locator('#hsQuick [data-hq-go]');
  assert.equal(await go.getAttribute('aria-disabled'), 'true');
  await go.dispatchEvent('click');
  assert.equal(await page.locator('dialog.gw-dlg').count(), 0);
});

test('a mod that says its version is named in the head and under the button', async (t) => {
  const page = await board(t, {link: {writes: ['uniforms', 'imports', 'schedule'], mod: '0.2.0', day: 34, hour: 14}});
  assert.equal(await page.locator('#secStaff .hs-head .hs-link.old').textContent(), 'Mod 0.2.0 · too old to hire');
  assert.match(await page.locator('#hsOrder .hs-gate.warn').textContent(), /You have 0\.2\.0\. Restart the game, then link again\./);
});

test('Quick hire: the best matches for one role at the headquarters, with no hours', async (t) => {
  const data = withCands(
    cand('h2', 'Pim Rask', [[HRM, 95]], 45), cand('h3', 'Quin Sato', [[HRM, 85]], 35),
    cand('h4', 'Rhea Tamm', [[HRM, 70]], 30), cand('h5', 'Sven Udal', [[HRM, 60]], 20, {demands: [PT]}));
  const page = await board(t, {data});
  const box = page.locator('#hsQuick');
  assert.equal(await box.locator('.hs-match.none').textContent(), 'Pick a role and a site to see who matches.');
  assert.equal(await box.locator('[data-hq-go]').getAttribute('aria-disabled'), 'true');
  // Roles from what the sites accept; sites that accept the role.
  assert.deepEqual(await box.locator('[data-hq-role] option').evaluateAll(os => os.map(o => o.value)),
    ['', CLEAN, CS, DRV, FW, HRM, LAW]);
  await box.locator('[data-hq-role]').selectOption(HRM);
  assert.deepEqual(await box.locator('[data-hq-site] option').evaluateAll(os => os.map(o => o.value)), ['', Q]);
  await box.locator('[data-hq-site]').selectOption(Q);
  // Not a shop: Part-time is not left out.
  assert.match(await box.locator('[data-hs-dem-open="quick"]').textContent(), /nobody/);
  assert.equal(await box.locator('.hs-shops').count(), 0);
  await box.locator('[data-hq-more]').click();
  await box.locator('[data-hq-more]').click();
  assert.equal(await box.locator('[data-hq-n]').textContent(), '3');
  // Most skilled first, the tie at 85 to the lower wage.
  assert.deepEqual(await quick(page), {ready: true, ex: [], matches: ['h2', 'h3', 'h1', 'h4', 'h5'],
    picks: [['h2', null], ['h3', null], ['h1', null]], short: 0});
  const list = box.locator('details[data-hq-list]');
  assert.match(await list.locator('summary').textContent(), /^5 match · the best 3 are picked/);
  assert.deepEqual(await list.locator('li > span:first-child').allTextContents(), ['Pim Rask', 'Quin Sato', 'Mara Nyberg']);
  assert.equal(await box.locator('[data-hq-go]').textContent(), 'Hire 3');
  assert.equal(await box.locator('[data-hq-go]').getAttribute('aria-disabled'), null);
  // The request: hired, assigned only.
  assert.deepEqual(await quickRequest(page), {
    sites: [{address: addr(Q), expect: null, days: null}],
    hires: [{candidateId: 'h2', address: addr(Q), expect: {wage: 45}, seenHoursLeft: 100},
      {candidateId: 'h3', address: addr(Q), expect: {wage: 35}, seenHoursLeft: 100},
      {candidateId: 'h1', address: addr(Q), expect: {wage: 40}, seenHoursLeft: 5}],
    moves: []});
  // Fewer match than asked: the button drops to the matches.
  await box.locator('[data-hq-min]').selectOption('90');
  assert.match(await list.locator('summary').textContent(), /^1 match · only 1 matches/);
  assert.equal(await list.locator('summary .warn').textContent(), 'only 1 matches');
  assert.equal(await box.locator('[data-hq-go]').textContent(), 'Hire 1');
  await box.locator('[data-hq-min]').selectOption('100');
  assert.equal(await box.locator('.hs-match.none').textContent(), 'Nobody matches.');
  assert.equal(await box.locator('[data-hq-go]').getAttribute('aria-disabled'), 'true');
  await box.locator('[data-hq-min]').selectOption('0');

  // The confirm: the game asked first, then one Hire, no undo.
  await answering(page, []);
  await box.locator('[data-hq-go]').click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('h2').textContent(), 'Hire 3 HR Managers');
  assert.match(await dlg.locator('.gw-verdict').textContent(), /The game can take all 3/);
  const body = await dlg.locator('.gw-body').textContent();
  assert.match(body, /No hours yet: set them in the game\./);
  assert.match(body, /No undo\./);
  assert.match(body, /Pim Rask.*Quin Sato.*Mara Nyberg/);
  const apply = dlg.locator('.gw-foot [data-gw-b="apply"]');
  assert.equal(await apply.textContent(), 'Hire 3');
  await apply.click();
  await phase(page, 'done');
  assert.deepEqual(await page.evaluate(() => window.hrWrites.map(w => [w.kind, w.dryRun])), [['hire', true], ['hire', false]]);
  const done = await dlg.textContent();
  assert.match(done, /3 hired/);
  assert.match(done, /3 HR Managers now work at HART\. HQ, with no hours\./);
  assert.equal(await dlg.locator('[data-gw-b="undo"]').count(), 0);
  const again = dlg.locator('.gw-foot [data-gw-b="more"]');
  assert.equal(await again.textContent(), 'Hire more');
  assert.match(await dlg.locator('.gw-foot').textContent(), /Close/);
  await again.click();
  assert.equal(await page.evaluate(() => !!document.querySelector('dialog.gw-dlg[open]')), false);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-hq-role')), true);
  // Hire more does not offer the three just hired while the board is the
  // one they were hired from; the board read again brings back whoever the
  // game still lists.
  assert.deepEqual((await quick(page)).matches, ['h4', 'h5']);
  assert.match(await box.locator('[data-hq-list] summary').textContent(), /^2 match/);
  await page.evaluate(p => window.calmWatch.changed(JSON.parse(p)), data);
  assert.deepEqual((await quick(page)).matches, ['h2', 'h3', 'h1', 'h4', 'h5']);
});

test('the Quick hire stepper hands the focus to the number when a button turns off', async (t) => {
  const page = await board(t);
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-more]').click();
  assert.equal(await box.locator('[data-hq-n]').textContent(), '2');
  assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-hq-more')), true);
  await box.locator('[data-hq-less]').click();
  assert.equal(await box.locator('[data-hq-n]').textContent(), '1');
  assert.equal(await box.locator('[data-hq-less]').isDisabled(), true);
  assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-hq-n')), true);
});

test('a live refresh on Staff keeps the focused control', async (t) => {
  const page = await board(t);
  const min = page.locator('#hsOpen .hs-fbar[data-hr-filters=""] [data-hr-min]');
  await min.focus();
  await page.evaluate(() => { window.calmOldMin = document.activeElement; });
  await page.evaluate(p => { const d = JSON.parse(p); d.candidates = d.candidates.slice(1); window.calmWatch.changed(d); }, payload);
  assert.match(await page.locator('#hsOpen .hs-facts2').textContent(), /^14 candidates/);
  assert.equal(await page.evaluate(() => window.calmOldMin.isConnected), false, 'the bar was drawn again');
  assert.equal(await page.evaluate(() => document.activeElement.matches('#hsOpen .hs-fbar[data-hr-filters=""] [data-hr-min]')), true);
});

test('Quick hire at a shop takes its plan week first, and nobody else\'s hours change', async (t) => {
  const page = await board(t);
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  // A shop: Part-time left out, and the line saying so.
  assert.match(await box.locator('[data-hs-dem-open="quick"]').textContent(), /Part-time/);
  assert.equal(await box.locator('.hs-shops').textContent(), 'Part-time is left out for shop roles only.');
  // Bram, Open places' pick before, is Quick hire's now, on the week Sam's
  // reassign leaves; Open places re-picks the next best for what is left.
  assert.deepEqual((await quick(page)).picks, [['c2', 36]]);
  const m = await model(page);
  assert.deepEqual(m.weeks.slice(0, 3), [
    [G, 'demand', ['move:SPARE1', 'quick:c2']],
    [C, 'demand', []],
    [B, 'full', ['hire:c1', 'hire:c3!', 'hire:k1']],
  ]);
  assert.deepEqual(m.roles[0].picked, ['c1', 'c3']);
  assert.equal(await page.locator(`#hsOpen tr[data-hr-role="${CS}"] td:nth-child(2)`).textContent(), '3');
  await page.locator(`[data-hr-open="${CS}"]`).click();
  const bram = page.locator('#hsSheet [data-hr-cand="c2"]');
  assert.match(await bram.locator('td.to').textContent(), /picked for HART\. Gifts/);
  assert.equal(await bram.locator('input').isDisabled(), true);
  await page.locator('#hsSheet [data-hs-close]').click();
  await page.locator('#hsSheet').waitFor({state: 'detached'});
  // The write: Gifts' week as the game has it (Ana's two days, as they are),
  // plus Bram's; Sam's reassign is not part of it.
  const body = await quickRequest(page);
  assert.deepEqual(body, {moves: [], hires: [{candidateId: 'c2', address: addr(G), expect: {wage: 25}, seenHoursLeft: 100}],
    sites: [{address: addr(G), expect: '9c98d93a', openAllHours: false, days: [
      {d: 0, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]},
      {d: 1, shifts: [{f: 8, t: 20, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
      {d: 2, shifts: [{f: 8, t: 20, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
      {d: 5, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]},
      {d: 6, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]}]}]});
  await answering(page, []);
  await box.locator('[data-hq-go]').click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('h2').textContent(), 'Hire 1 Customer Service');
  const text = await dlg.locator('.gw-body').textContent();
  assert.match(text, /Hours from HART\. Gifts's plan: 36 h a week; nobody else's hours change\./);
  assert.doesNotMatch(text, /The week is replaced/);
  assert.match(text, /Bram Castell90%\$25\/h36 h/);
  await dlg.locator('[data-gw-close]').click();
  // One more than the plan's week: Ada joins with no hours.
  await box.locator('[data-hq-more]').click();
  assert.deepEqual((await quick(page)).picks, [['c2', 36], ['c1', null]]);
  const two = await page.evaluate(() => { const r = hrQuickRequest(hrQuickModel(hrModel())); return [[...r.hours], r.given]; });
  assert.deepEqual(two, [[['c2', 36], ['c1', 0]], 1]);
  await box.locator('[data-hq-go]').click();
  await phase(page, 'ready');
  assert.match(await dlg.locator('.gw-body').textContent(), /Hours from HART\. Gifts's plan: 36 h a week( each)?; nobody else's hours change\. 1 joins with no hours\./);
});

test('Quick hire leaves out a new shift that meets one already there', async (t) => {
  const d = JSON.parse(payload);
  // Ana also works Friday 10 to 14 on Gifts' register: Bram's Friday meets it.
  d.staffing.find(r => r.key === G).current.list.push({d: 5, s: 0, f: 10, t: 14, p: 0});
  const page = await board(t, {data: JSON.stringify(d)});
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  const r = await page.evaluate(() => { const r = hrQuickRequest(hrQuickModel(hrModel())); return {body: r.body, hours: [...r.hours]}; });
  assert.deepEqual(r.hours, [['c2', 24]]);
  assert.deepEqual(r.body.sites[0].days, [
    {d: 0, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]},
    {d: 1, shifts: [{f: 8, t: 20, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
    {d: 2, shifts: [{f: 8, t: 20, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
    {d: 5, shifts: [{f: 10, t: 14, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
    {d: 6, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]}]);
  await answering(page, []);
  await box.locator('[data-hq-go]').click();
  await phase(page, 'ready');
  assert.match(await page.locator('dialog.gw-dlg .gw-body').textContent(), /Hours from HART\. Gifts's plan: 24 h a week; nobody else's hours change\./);
});

test('Quick hire takes a role Open places had filled, and Open places shrinks', async (t) => {
  const d = JSON.parse(payload);
  d.officeStaffing[0].current = {shifts: 0, fragments: 0, list: []};
  const page = await board(t, {data: JSON.stringify(d)});
  assert.equal(await page.locator(`#hsOpen tr[data-hr-role="${LAW}"]`).count(), 1);
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(LAW);
  await box.locator('[data-hq-site]').selectOption(O);
  // Lior, Open places' pick, takes the office's one week: the Lawyer row goes.
  assert.deepEqual((await quick(page)).picks, [['l1', 42]]);
  const m = await model(page);
  assert.deepEqual(m.roles.map(r => r.skill), [CS, FW, CLEAN]);
  assert.deepEqual(m.weeks[4], [O, 'office', ['quick:l1']]);
  assert.equal(await page.locator(`#hsOpen tr[data-hr-role="${LAW}"]`).count(), 0);
  assert.match(await page.locator('#hsOpen table.hs-roles tfoot').textContent(), /^Total7160\+\$/);
  assert.deepEqual(await quickRequest(page), {moves: [], hires: [{candidateId: 'l1', address: addr(O), expect: {wage: 50}, seenHoursLeft: 100}],
    sites: [{address: addr(O), expect: '0ff1ce00', openAllHours: false, days: [
      {d: 1, shifts: [{f: 8, t: 22, employeeId: 'l1', itemInstanceId: 'DESK-1'}]},
      {d: 2, shifts: [{f: 8, t: 22, employeeId: 'l1', itemInstanceId: 'DESK-1'}]},
      {d: 3, shifts: [{f: 8, t: 22, employeeId: 'l1', itemInstanceId: 'DESK-1'}]}]}]});
  // The main order no longer hires Lior.
  assert.ok(!(await request(page)).hires.some(h => h.candidateId === 'l1'));
});

test('Quick hire where the plan has no open week: no hours, and says so', async (t) => {
  const page = await board(t);
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(C);
  // Corner's plan has no hire week: Bram joins it with no hours, and Open
  // places picks the next best for Gifts.
  assert.deepEqual((await quick(page)).picks, [['c2', null]]);
  assert.deepEqual((await model(page)).weeks[0], [G, 'demand', ['move:SPARE1', 'hire:c1']]);
  assert.deepEqual((await quickRequest(page)).sites, [{address: addr(C), expect: null, days: null}]);
  await answering(page, []);
  await box.locator('[data-hq-go]').click();
  await phase(page, 'ready');
  assert.match(await page.locator('dialog.gw-dlg .gw-body').textContent(), /No open hours in HART\. Corner's plan: they join with no hours\./);
});

test('Part-time is left out per destination: a shop week, not an office week of the same role', async (t) => {
  const d = JSON.parse(payload);
  d.candidates.push(cand('p1', 'Pia Quist', [[CS, 95]], 10, {demands: [PT]}));
  const law = d.hiring.sites.find(s => s.key === O);
  law.accepts = [LAW, CS];
  law.plans.office.hireWeeks.push({skill: CS, hours: 14, days: 1, slots: [slot(0, 1, 8, 22, 'DESK-1')]});
  const page = await board(t, {data: JSON.stringify(d)});
  const m = await model(page);
  // Pia asks for Part-time: kept off the shops' weeks, placed in the office's.
  assert.deepEqual(m.roles[0].picked, ['p1', 'c2', 'c1', 'c3']);
  assert.deepEqual(m.weeks[4], [O, 'office', ['hire:l1', 'hire:p1']]);
  // Lawyer is hired into the office only: its Change picks shows no Part-time.
  await page.locator(`[data-hr-open="${LAW}"]`).click();
  const sheet = page.locator('#hsSheet');
  assert.match(await sheet.locator(`[data-hs-dem-open="${LAW}"]`).textContent(), /Leave out who asks for: nobody/);
  // "Lawyer only" copies the filter it is picked by, without Part-time.
  await sheet.locator('[data-hr-scope="own"]').check();
  assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('ba_dash_hire:default')))).roles[LAW].ex, []);
  await sheet.locator('[data-hs-close]').click();
  await sheet.waitFor({state: 'detached'});
  // The page's list names the company's Part-time as for shop roles only.
  await page.locator('#hsOpen [data-hs-dem-open=""]').click();
  const pt = page.locator('#hsDemPop label', {has: page.locator(`[data-hr-dem="${PT}"]`)});
  assert.match(await pt.textContent(), /Part-time · shop roles only/);
});

test('"<Role> only" for a role hired into shops alone keeps Part-time', async (t) => {
  const page = await board(t);
  await page.locator(`[data-hr-open="${CLEAN}"]`).click();
  const sheet = page.locator('#hsSheet');
  assert.match(await sheet.locator(`[data-hs-dem-open="${CLEAN}"]`).textContent(), /Part-time/);
  await sheet.locator('[data-hr-scope="own"]').check();
  assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('ba_dash_hire:default')))).roles[CLEAN].ex, [PT]);
});

test('Part-time is left out by default for shop roles only', async (t) => {
  const page = await board(t, {data: withCands(
    cand('p1', 'Pia Quist', [[CS, 95]], 10, {demands: [PT]}), cand('p2', 'Rune Vale', [[LAW, 99]], 10, {demands: [PT]}))});
  let m = await model(page);
  // Pia asks for Part-time and is left out of the shop role; Rune, a lawyer
  // for the office, is picked.
  assert.deepEqual(m.roles.find(r => r.skill === CS).picked, ['c2', 'c1', 'c3']);
  assert.deepEqual(m.roles.find(r => r.skill === LAW).picked, ['p2']);
  assert.match(await page.locator('#hsOpen [data-hs-dem-open=""]').textContent(), /^Leave out who asks for: Part-time/);
  assert.equal(await page.locator('#hsOpen .hs-shops').textContent(), 'Part-time is left out for shop roles only.');
  // Quick hire: pre-selected at a shop, not at the office.
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(LAW);
  await box.locator('[data-hq-site]').selectOption(O);
  assert.match(await box.locator('[data-hs-dem-open="quick"]').textContent(), /nobody/);
  assert.equal(await box.locator('.hs-shops').count(), 0);
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  assert.match(await box.locator('[data-hs-dem-open="quick"]').textContent(), /Part-time/);
  assert.equal(await box.locator('.hs-shops').count(), 1);
  assert.ok(!(await quick(page)).matches.includes('p1'));
  // Quick hire's own list: unticking Part-time there brings Pia in for it
  // only; she is Quick hire's pick for Gifts' open week, and Open places
  // fills what is left, still without her.
  await box.locator('[data-hs-dem-open="quick"]').click();
  await page.locator('body > #hsDemPop [data-hr-dem="' + PT + '"]').uncheck();
  assert.deepEqual((await quick(page)).picks, [['p1', 36]]);
  assert.deepEqual((await model(page)).roles.find(r => r.skill === CS).picked, ['c2', 'c1']);
  await page.keyboard.press('Escape');
  await box.locator('[data-hq-role]').selectOption('');
  // Unticking Part-time in the page's list brings her back.
  await page.locator('#hsOpen [data-hs-dem-open=""]').click();
  await page.locator('#hsDemPop [data-hr-dem="' + PT + '"]').uncheck();
  m = await model(page);
  assert.deepEqual(m.roles.find(r => r.skill === CS).picked, ['p1', 'c2', 'c1']);
  assert.equal(await page.locator('#hsOpen .hs-shops').count(), 0);
  assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('ba_dash_hire:default')))).company.ex, []);
  // A set kept before the default gets Part-time once; a v2 set is kept as is.
  const kept = await page.evaluate(pt => {
    const read = v => { localStorage.setItem('ba_dash_hire:default', JSON.stringify(v)); hrFilterMem = null; return hrFilters().company.ex; };
    return [read({company: {ex: ['ba:jobdemand_nonights']}, roles: {}}), read({v: 2, company: {ex: []}, roles: {}})];
  }, PT);
  assert.deepEqual(kept, [['ba:jobdemand_nonights', PT], []]);
});

test('at phone width the page has no sideways scroll, Change picks open', async (t) => {
  const page = await board(t, {viewport: {width: 375, height: 812}});
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(await wide() <= 0, `the page scrolls sideways by ${await wide()}px`);
  await page.locator(`[data-hr-open="${CS}"]`).click();
  assert.ok(await wide() <= 0, `the page scrolls sideways by ${await wide()}px`);
  const box = await page.locator('#hsSheet').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 375, `the sheet spans ${box.x} to ${box.x + box.width}`);
});

test('a live refresh leaves Staff alone while it is hidden, and draws it on the next visit', async (t) => {
  const page = await board(t);
  await page.evaluate(() => { showPage('today'); window.staffDraws = 0; const was = window.drawStaff;
    window.drawStaff = (...a) => { window.staffDraws++; return was(...a); }; });
  await page.evaluate(p => { const d = JSON.parse(p); d.candidates = d.candidates.slice(1); window.calmWatch.changed(d); }, payload);
  assert.equal(await page.evaluate(() => window.staffDraws), 0);
  assert.equal(await page.evaluate(() => [...pageStale].some(r => r[0] === 'company/staff')), true);
  await page.evaluate(() => { showPage('company'); showSub('company', 'staff'); });
  assert.equal(await page.evaluate(() => window.staffDraws), 1);
  assert.match(await page.locator('#hsOpen .hs-facts2').textContent(), /^14 candidates/);
});

test('old Payroll links land on Staff, with Payroll at its foot', async (t) => {
  const page = await board(t, {open: false});
  await page.evaluate(() => openHash('payroll'));
  assert.equal(await page.evaluate(() => `${page}/${sub.company}`), 'company/staff');
  const pay = page.locator('#secStaff section#hrPayroll.hs-apart');
  assert.equal(await pay.locator('.hs-kick').textContent(), 'Current staff');
  assert.equal(await pay.locator('h3').textContent(), 'Payroll');
  assert.match(await pay.locator('.facts').textContent(), /^People\d+Wages a day/);
  await page.evaluate(() => { showPage('today'); reveal('secPayroll'); });
  assert.equal(await page.evaluate(() => `${page}/${sub.company}`), 'company/staff');
});
