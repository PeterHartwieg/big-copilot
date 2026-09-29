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
  // Bare: opened without staff and nothing measured, so the page plans it
  // with every station the hours it opens (openCover), never full cover.
  // Bo, on the bench, is already in that plan.
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
  row(B).openCover = Object.assign({}, row(B).fullCover, {open: row(B).open, openAllHours: false, complete: false,
    openNow: undefined, inGame: undefined});
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
       plans: {open: {spare: [], bench: ['BENCH1'], hireWeeks: [
         {skill: CS, hours: 36, days: 3, slots: [slot(0, 1, 0, 12, 'REG-B'), slot(1, 2, 0, 12, 'REG-B'), slot(2, 3, 0, 12, 'REG-B')]},
         {skill: CS, hours: 36, days: 3, slots: [slot(3, 4, 0, 12, 'REG-B'), slot(4, 5, 0, 12, 'REG-B'), slot(5, 6, 0, 12, 'REG-B')]},
         {skill: CLEAN, hours: 36, days: 3, slots: [slot(7, 2, 8, 20, 'CLN-B'), slot(8, 3, 8, 20, 'CLN-B'), slot(9, 4, 8, 20, 'CLN-B')]}]}}},
      {key: F, name: 'HART. Works', kind: 'factory', address: addr(F), planned: true, new: false, accepts: [FW], facts: {},
       plans: {cap: {spare: [], bench: [], hireWeeks: [
         {skill: FW, hours: 24, days: 2, slots: [slot(1, 2, 0, 12, 'MACH-1'), slot(2, 3, 0, 12, 'MACH-1')]},
         {skill: FW, hours: 24, days: 2, slots: [slot(3, 4, 0, 12, 'MACH-1'), slot(4, 5, 0, 12, 'MACH-1')]}]},
         dem: {spare: [], bench: [], hireWeeks: [{skill: FW, hours: 12, days: 1, slots: [slot(1, 2, 0, 12, 'MACH-1')]}]}}},
      {key: O, name: 'HART. Law', kind: 'office', address: addr(O), planned: true, new: true, accepts: [LAW], facts: {},
       plans: {office: {spare: [], bench: [], fewer: [{id: 'LAWYER1', name: 'Lena Voss', now: 48, hours: 40}], hireWeeks: [
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
  // Staff is Staffing › Staff needs in the redesign (docs/ui-route-migration.md).
  if (open) await page.evaluate(() => { showPage('staffing'); showSub('staffing', 'needs'); });
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
const quickRequest = (page, mode = 'both') => page.evaluate(mode => { const m = hrModel(); return hrRequest(m, {mode, quick: m.quick}).body; }, mode);
// The link of a mod that takes the whole action in one call, with its undo (0.4.0).
const ONE = {writes: ['uniforms', 'imports', 'schedule', 'hire'], features: ['hire.reschedule', 'hire.undo'], day: 34, hour: 14, minute: 0,
  character: 'default', company: 'Link Co'};
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
  // order; Cleo asks for free weekends and every week left has a weekend day,
  // so she is not picked (a schedule demand is a hard filter) and Dario is.
  assert.deepEqual(m.weeks, [
    [G, 'demand', ['move:SPARE1', 'hire:c2']],
    [C, 'demand', []],
    [B, 'open', ['hire:c1', 'hire:c4', 'hire:k1']],
    [F, 'cap', ['hire:f1', 'hire:f2']],
    [O, 'office', ['hire:l1']],
    [Q, null, []],
    [W, null, []],
  ]);
  assert.deepEqual(m.roles.map(r => [r.skill, r.picked, r.short]),
    [[CS, ['c2', 'c1', 'c4'], 0], [FW, ['f1', 'f2'], 0], [CLEAN, ['k1'], 0], [LAW, ['l1'], 0]]);

  // The table: one row a role, the reassign line under its role.
  const roles = page.locator('#hsOpen table.hs-roles');
  assert.deepEqual(await roles.locator('tbody tr[data-hr-role]').evaluateAll(rs => rs.map(r => r.dataset.hrRole)), [CS, FW, CLEAN, LAW]);
  const cs = await roles.locator(`tr[data-hr-role="${CS}"] td`).allTextContents();
  // Open 4, own staff 1 (Sam), 3 new hires at 87% and $26/h on average, none
  // stays open.
  assert.deepEqual([cs[1], cs[2], cs[4]], ['4', '1', '–']);
  assert.match(cs[3], /^3\s*87% · \$26\/h$/);
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
  // The order panel beside the table holds the totals: no Total row repeats them (declutter T6).
  assert.equal(await roles.locator('tfoot').count(), 0);
  assert.match(await page.locator('#hsOpen .hs-facts2').textContent(), /^15 candidates · 2 expire within 24 h$/);
  // The order panel: what the button does.
  const order = page.locator('#hsOrder');
  assert.deepEqual(await order.locator('.hs-ol li > span').allTextContents(), ['Reassign', 'Hire', 'Weeks']);
  // The weeks: the four sites the hires and reassigns reach.
  assert.match(await order.locator('.hs-ol').textContent(), /Reassign2.*Hire7.*Weeks4/);
  assert.match(await order.locator('.hs-sum').textContent(), /^Added wages\+\$[\d,]+\/day$/);
  assert.equal((await page.locator(REVIEW).textContent()).trim(), 'Staff all sites');
  assert.equal(await order.locator('.hs-note').textContent(), 'Picked for you. You confirm next.');
  assert.equal(await page.locator('#secStaff .hs-head h2').textContent(), 'Whom to hire');
  // Linked is the normal state: nothing says so (declutter T4).
  assert.equal(await page.locator('#secStaff .hs-link').count(), 0);

  // Unticking the reassign returns its week to hiring: Bram now takes Gifts'
  // first week, and Cleo finds a week at Bare without a weekend.
  await page.locator(`[data-hr-move="${C}|${G}|${CS}"]`).uncheck();
  const off = await model(page);
  assert.equal(off.moves[1].off, true);
  assert.deepEqual(off.weeks.slice(0, 3), [
    [G, 'demand', ['hire:c2', 'hire:c1']],
    [C, 'demand', []],
    [B, 'open', ['hire:c3', 'hire:c4', 'hire:k1']],
  ]);
  assert.equal(await page.locator(`[data-hr-move="${C}|${G}|${CS}"]`).isChecked(), false);
  assert.equal((await page.locator(REVIEW).textContent()).trim(), 'Staff all sites');
  // Corner keeps Sam now, whose Tuesday the plan does not have: its week is
  // one to write as well, and the order counts it.
  assert.match(await order.locator('.hs-ol').textContent(), /Hire8.*Weeks5/);
});

test('ties past the wage go to the id, and the sizing on Supply picks the factory plan', async (t) => {
  const d = JSON.parse(payload);
  d.candidates = d.candidates.map(c => c.id === 'c1' ? Object.assign({}, c, {wage: 25}) : c);
  const page = await board(t, {data: JSON.stringify(d)});
  assert.deepEqual((await model(page)).roles[0].picked, ['c1', 'c2', 'c4']);
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
  assert.deepEqual(warned, ['Coffee Machine (none at HART. Gifts)', 'Gold Health Insurance (not offered)']);
  // Greta asks for no nights and Bare's week left runs 0 to 12: no week fits
  // her, so she is not picked (Hollis is) and Change picks says why.
  assert.deepEqual(m.weeks[2], [B, 'open', ['hire:c6', 'hire:c8', 'hire:k1']]);
  assert.equal(await page.locator('#hsSheet [data-hr-cand="c7"] td.to').textContent(), 'no open week meets their schedule demands');
  assert.equal(await page.locator('#hsSheet [data-hr-cand="c7"] input').isChecked(), false);
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
  // Its number; the roles are the table's rows (declutter T5).
  assert.match(await short.textContent(), /^Stays open3$/);
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
  assert.deepEqual([m.roles[0].picked, m.overs], [['c2', 'c1', 'c4'], []]);
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
    [['c2', 10, 25], ['c1', 4, 30], ['c4', 4, 22], ['k1', 4, 16], ['f1', 3, 28], ['f2', 3, 26], ['l1', 88, 50]]);
  const site = n => body.sites.find(s => s.address.number === n);
  assert.deepEqual(body.sites.map(s => s.address.number), [10, 4, 3, 88]);
  // Gifts, on its demand plan: Ana as planned, Sam reassigned in, Bram hired.
  assert.deepEqual(site(10), {address: addr(G), expect: '9c98d93a', openAllHours: false, days: [
    {d: 0, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]},
    {d: 1, shifts: [{f: 8, t: 20, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
    {d: 2, shifts: [{f: 8, t: 20, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
    {d: 3, shifts: [{f: 8, t: 20, employeeId: 'SPARE1', itemInstanceId: 'REG-G'}]},
    {d: 4, shifts: [{f: 8, t: 20, employeeId: 'SPARE1', itemInstanceId: 'REG-G'}]},
    {d: 5, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]},
    {d: 6, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]}]});
  // Corner, the reassign's source, is not written: the game's move clears
  // Sam's hours there, and nobody else's week there changes.
  assert.equal(site(2), undefined);
  // Bare, new, nothing measured: every station the hours it opens, and the
  // write never opens it longer; Bo on his cleaning day.
  assert.equal(site(4).openAllHours, false);
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
  const body = await page.evaluate(k => hrRequest(hrModel(), {only: {[`${k}|ba:skill_customerservice`]: 1}}).body, B);
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
  assert.match(await page.locator('#hsOrder .hs-ol li.short').textContent(), /^Stays open1$/);
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
  assert.equal(await dlg.locator('h2').textContent(), 'Staff all sites');
  assert.match(await dlg.locator('.gw-where').textContent(), /^4 sites$/);
  assert.match(await dlg.locator('.gw-verdict').textContent(), /The game can take all of it/);
  // What it does, picked at the top: hire and schedule, the first.
  assert.deepEqual(await dlg.locator('[data-hr-mode]').allTextContents(), ['Hire and schedule', 'Hire only', 'Schedule only']);
  assert.equal(await dlg.locator('[data-hr-mode][aria-pressed="true"]').textContent(), 'Hire and schedule');
  assert.deepEqual(await dlg.locator('.gw-tile .gw-lab').allTextContents(), ['Hire', 'Reassign', 'Weeks', 'Added wages']);
  assert.match(await dlg.locator('.gw-body').textContent(), /Who goes where\. Open a site to see each person and the days they work\./);
  // One row a site touched, in list order.
  assert.deepEqual(await dlg.locator('.hr-dhead .s').allTextContents(), ['HART. Gifts', 'HART. Bare', 'HART. Works', 'HART. Law']);
  // This mod writes it all in the hire call, and has no undo for it.
  assert.match(await dlg.locator('.gw-foot').textContent(), /This mod cannot undo a hire/);
  // Somebody the plan's week gives fewer hours than now is named before the confirm.
  assert.match(await dlg.locator('.gw-body').textContent(), /Fewer hours than now in the plan's week: Lena Voss \(HART\. Law, 48 → 40 h\)\./);
  const bare = dlg.locator('.hr-dsite', {has: page.locator(`[data-hr-site="${B}"]`)});
  assert.match(await bare.locator('.c').textContent(), /^3 new\+1 reassigned/);
  // A site opens for its people and their days.
  await dlg.locator(`[data-hr-site="${G}"]`).click();
  const people = dlg.locator('.hr-dsite.open .hr-dp:not(.hd)');
  assert.deepEqual(await people.locator('.who b').allTextContents(), ['Bram Castell', 'Sam Spare']);
  assert.deepEqual(await people.locator('.who small').allTextContents(), ['new hire', 'reassigned from HART. Corner']);
  assert.equal(await people.first().locator('.hr-wk i.on').count(), 3);
  const apply = dlg.locator('.gw-foot [data-gw-b="apply"]');
  assert.equal(await apply.textContent(), 'Staff 4 sites');
  await apply.click();
  await phase(page, 'done');
  const writes = await page.evaluate(() => window.hrWrites.map(w => [w.kind, w.dryRun]));
  assert.deepEqual(writes, [['hire', true], ['hire', false]]);
  // Applied from the answer: everyone the game hired or moved, and where to;
  // Ada, whose application expired, is not in it. There is no undo to drop it.
  assert.deepEqual(await page.evaluate(() => pgOfFamily('hire').map(r => [r.state, r.expect.hired, r.expect.moved, r.expect.skipped,
    r.expect.people.length, r.expect.people.some(p => p.id === 'c1')])), [['applied', 6, 2, 1, 8, false]]);
  // No Undo, and where to let someone go instead; Ada's application expired
  // before the game reached her.
  assert.equal(await dlg.locator('[data-gw-b="undo"]').count(), 0);
  const text = await dlg.locator('.gw-body').textContent();
  assert.match(text, /No undo with this mod\. To let someone go, fire them in MyEmployees in the game\./);
  // Each site says it is done.
  assert.equal(await dlg.locator('.hr-st.ok').count(), 4);
  assert.match(text, /1 application expired before the game reached it: Ada Brandt\./);
  assert.equal(await dlg.locator('.gw-body .hr-struck', {hasText: 'Ada Brandt'}).count() > 0, true);
  const more = dlg.locator('[data-hr-more]');
  assert.equal(await more.textContent(), 'Pick 1 more');
  assert.equal(await more.isDisabled(), true, 'waits for the board to read the game');
  assert.equal(await page.locator('#gwToast').count(), 0, 'no undo strip');
  // Bare's row counts who the game hired: Dario and Ines, Ada's place open,
  // and the wage bill without her.
  assert.match(await bare.locator('.c').textContent(), /^2 hired\+1 reassigned1 still open/);
  assert.equal(await bare.locator('.hr-dots i.gap').count(), 1);
  assert.equal(await bare.locator('.hr-dots i.done').count(), 3);
  assert.equal(await bare.locator('.cst').textContent(), await page.evaluate(() => `+${fmt((22 * 36 + 16 * 36) / 7)}`));
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
  assert.match(await page.locator('dialog.gw-dlg .gw-body').textContent(), /Hours left empty.*Sam Spare \(2 stretches of hours at HART\. Corner\)/);
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
  // Not linked is said under the button, not in the head (declutter T4).
  assert.equal(await page.locator('#secStaff .hs-head .hs-link').count(), 0);
  const review = page.locator(REVIEW);
  assert.equal(await review.getAttribute('aria-disabled'), 'true');
  assert.equal((await review.textContent()).trim(), 'Staff all sites');
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
  // No hint line: the two empty selects and the off button say it (declutter G8).
  assert.equal(await box.locator('.hs-match').count(), 0);
  assert.equal(await box.locator('[data-hq-go]').getAttribute('aria-disabled'), 'true');
  // Roles from what the sites accept; sites that accept the role.
  assert.deepEqual(await box.locator('[data-hq-role] option').evaluateAll(os => os.map(o => o.value)),
    ['', CLEAN, CS, DRV, FW, HRM, LAW]);
  await box.locator('[data-hq-role]').selectOption(HRM);
  assert.deepEqual(await box.locator('[data-hq-site] option').evaluateAll(os => os.map(o => o.value)), ['', Q]);
  await box.locator('[data-hq-site]').selectOption(Q);
  // Quick hire takes the page's filters (declutter T9); not a shop, so Part-time is not left out.
  assert.equal(await box.locator('[data-hs-dem-open="quick"], [data-hq-min]').count(), 0);
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
  await page.locator('#hsOpen [data-hr-min]').selectOption('90');
  assert.match(await list.locator('summary').textContent(), /^1 match · only 1 candidate matches/);
  assert.equal(await list.locator('summary .warn').textContent(), 'only 1 candidate matches');
  assert.equal(await box.locator('[data-hq-go]').textContent(), 'Hire 1');
  await page.locator('#hsOpen [data-hr-min]').selectOption('100');
  assert.equal(await box.locator('.hs-match.none').textContent(), 'Nobody matches.');
  assert.equal(await box.locator('[data-hq-go]').getAttribute('aria-disabled'), 'true');
  await page.locator('#hsOpen [data-hr-min]').selectOption('0');

  // The confirm: the game asked first, then one Hire, no undo.
  await answering(page, []);
  await box.locator('[data-hq-go]').click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('h2').textContent(), 'Quick hire: HR Manager');
  assert.match(await dlg.locator('.gw-verdict').textContent(), /The game can take all of it/);
  // A headquarters has no plan: hire only, the one thing it can do, so no pick.
  assert.equal(await dlg.locator('[data-hr-mode]').count(), 0);
  const body = await dlg.locator('.gw-body').textContent();
  assert.match(body, /HART\. HQ.*no hours: assigned only/);
  assert.match(await dlg.locator('.gw-foot').textContent(), /This mod cannot undo a hire/);
  await dlg.locator(`[data-hr-site="${Q}"]`).click();
  assert.match(await dlg.locator('.gw-body').textContent(), /Pim Rask[\s\S]*Quin Sato[\s\S]*Mara Nyberg/);
  const apply = dlg.locator('.gw-foot [data-gw-b="apply"]');
  assert.equal(await apply.textContent(), 'Hire 3');
  await apply.click();
  await phase(page, 'done');
  assert.deepEqual(await page.evaluate(() => window.hrWrites.map(w => [w.kind, w.dryRun])), [['hire', true], ['hire', false]]);
  const done = await dlg.textContent();
  assert.match(done, /3 hired/);
  assert.match(done, /HART\. HQ.*assigned/);
  assert.equal(await dlg.locator('[data-gw-b="undo"]').count(), 0);
  const again = dlg.locator('.gw-foot [data-gw-b="more"]');
  assert.equal(await again.textContent(), 'Hire more');
  assert.match(await dlg.locator('.gw-foot').textContent(), /Close/);
  await again.click();
  assert.equal(await page.evaluate(() => !!document.querySelector('dialog.gw-dlg[open]')), false);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-hq-role')), true);
  // Done: the form starts again, drawn when the dialog's close event lands.
  await page.waitForFunction(() => !hrUi.quickHold);
  assert.equal(await box.locator('[data-hq-role]').inputValue(), '');
  assert.equal(await box.locator('[data-hq-site]').inputValue(), '');
  assert.equal(await box.locator('[data-hq-n]').textContent(), '1');
  assert.equal(await box.locator('.hs-match').count(), 0);
  // Hire more does not offer the three just hired while the board is the
  // one they were hired from; the board read again brings back whoever the
  // game still lists.
  await box.locator('[data-hq-role]').selectOption(HRM);
  await box.locator('[data-hq-site]').selectOption(Q);
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

// Opens Quick hire's confirm, the game taking everyone, and waits for its answer.
const quickConfirm = async page => {
  await answering(page, []);
  await page.locator('#hsQuick [data-hq-go]').click();
  await phase(page, 'ready');
  return page.locator('dialog.gw-dlg');
};
const quickClose = async page => {
  await page.locator('dialog.gw-dlg [data-gw-close]').click();
  // The dialog's close event releases the hold and redraws the page.
  await page.waitForFunction(() => !document.querySelector('dialog.gw-dlg[open]') && !hrUi.quickHold);
};

test('Quick hire at a shop holds its plan week while its confirm is open, and nobody else\'s hours change', async (t) => {
  const page = await board(t);
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  // A shop: Part-time left out, as the page's filter has it.
  assert.deepEqual((await quick(page)).ex, [PT]);
  // Bram would take the week Sam's reassign leaves at Gifts; the form alone
  // holds nothing: Open places is as it was.
  assert.deepEqual((await quick(page)).picks, [['c2', 36]]);
  const before = await model(page);
  assert.deepEqual(before.weeks[0], [G, 'demand', ['move:SPARE1', 'hire:c2']]);
  assert.deepEqual(before.roles[0].picked, ['c2', 'c1', 'c4']);
  assert.equal(await page.evaluate(() => hrModel().quick.hold), false);
  assert.equal(await page.locator('#hsOrder .hs-held').count(), 0);
  // The write: Gifts' week on its plan, Ana's two days and Bram on his plan
  // week; Sam's reassign is not part of it.
  const body = await quickRequest(page);
  assert.deepEqual(body, {moves: [], hires: [{candidateId: 'c2', address: addr(G), expect: {wage: 25}, seenHoursLeft: 100}],
    sites: [{address: addr(G), expect: '9c98d93a', openAllHours: false, days: [
      {d: 0, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]},
      {d: 1, shifts: [{f: 8, t: 20, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
      {d: 2, shifts: [{f: 8, t: 20, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
      {d: 5, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]},
      {d: 6, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]}]}]});
  // The confirm open: the week is held, Bram is Quick hire's, and Open
  // places re-picks the next best for what is left.
  const dlg = await quickConfirm(page);
  const m = await model(page);
  assert.deepEqual(m.weeks.slice(0, 3), [
    [G, 'demand', ['move:SPARE1', 'quick:c2']],
    [C, 'demand', []],
    [B, 'open', ['hire:c1', 'hire:c4', 'hire:k1']],
  ]);
  assert.deepEqual(m.roles[0].picked, ['c1', 'c4']);
  assert.equal(await page.evaluate(() => hrModel().roles[0].at.get('c2').elsewhere.key), G);
  assert.equal(await page.locator(`#hsOpen tr[data-hr-role="${CS}"] td:nth-child(2)`).textContent(), '3');
  assert.equal(await page.locator('#hsOrder p.hs-held').textContent(), '1 week held for Quick hire (Customer Service at HART. Gifts)');
  assert.deepEqual(await page.evaluate(() => window.hrWrites.at(-1).body), body);
  assert.equal(await dlg.locator('h2').textContent(), 'Quick hire: Customer Service');
  // Hire and schedule, or hire only; the week is the site's plan.
  assert.deepEqual(await dlg.locator('[data-hr-mode]').allTextContents(), ['Hire and schedule', 'Hire only']);
  assert.equal(await dlg.locator('.gw-foot [data-gw-b="apply"]').textContent(), 'Hire and schedule');
  assert.match(await dlg.locator('.gw-body').textContent(), /HART\. Gifts.*hours from the board's plan/);
  await dlg.locator(`[data-hr-site="${G}"]`).click();
  assert.match(await dlg.locator('.gw-body').textContent(), /Bram Castellnew hire[\s\S]*90%\$25[\s\S]*36 h/);
  // Closed: the hold is released.
  await quickClose(page);
  assert.deepEqual((await model(page)).weeks[0], [G, 'demand', ['move:SPARE1', 'hire:c2']]);
  assert.equal(await page.locator('#hsOrder .hs-held').count(), 0);
  assert.equal(await page.locator(`#hsOpen tr[data-hr-role="${CS}"] td:nth-child(2)`).textContent(), '4');
  // Change picks, the form still filled: Bram is Open places' own again.
  await page.locator(`[data-hr-open="${CS}"]`).click();
  assert.equal(await page.locator('#hsSheet [data-hr-cand="c2"] input').isChecked(), true);
  await page.locator('#hsSheet [data-hs-close]').click();
  await page.locator('#hsSheet').waitFor({state: 'detached'});
  // One more than the plan's week: Ada joins with no hours.
  await box.locator('[data-hq-more]').click();
  assert.deepEqual((await quick(page)).picks, [['c2', 36], ['c1', null]]);
  const two = await quickRequest(page);
  assert.deepEqual(two.hires.map(h => h.candidateId), ['c2', 'c1']);
  assert.ok(!two.sites[0].days.some(x => x.shifts.some(e => e.employeeId === 'c1')), 'Ada has no week');
  await quickConfirm(page);
  // Not silent: she joins with no hours, and hire only is the way to mean it.
  assert.match(await dlg.locator('.gw-body').textContent(), /1 hire joins with no hours\. Choose Hire only.*Ada Brandt: the plan has no open week left for them/);
  await dlg.locator('[data-hr-mode="hire"]').click();
  await page.waitForFunction(() => document.querySelector('dialog.gw-dlg').dataset.phase === 'ready'
    && window.hrWrites.at(-1).body.sites.every(x => x.days === null));
  assert.equal(await dlg.locator('.gw-foot [data-gw-b="apply"]').textContent(), 'Hire 2');
  assert.doesNotMatch(await dlg.locator('.gw-body').textContent(), /joins with no hours/);
});

test('Quick hire never opens a shop: a full-cover shop keeps its hours', async (t) => {
  const d = JSON.parse(payload);
  // Bare, new on full cover and closed now, with a week in the game (empty).
  d.staffing.find(r => r.key === B).current = {shifts: 0, fragments: 0, coverFragments: 0, cleaning: 0, security: 0, list: []};
  const page = await board(t, {data: JSON.stringify(d)});
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(B);
  assert.deepEqual((await quick(page)).picks, [['c2', 36]]);
  assert.deepEqual((await quickRequest(page)).sites, [{address: addr(B), expect: '811c9dc5', openAllHours: false, days: [
    {d: 1, shifts: [{f: 0, t: 12, employeeId: 'c2', itemInstanceId: 'REG-B'}]},
    {d: 2, shifts: [{f: 0, t: 12, employeeId: 'c2', itemInstanceId: 'REG-B'}]},
    {d: 3, shifts: [{f: 0, t: 12, employeeId: 'c2', itemInstanceId: 'REG-B'}]}]}]);
});

test('Quick hire passes over a match no plan week fits', async (t) => {
  const d = JSON.parse(payload);
  // Bram asks for free weekends; Gifts' one open week runs Friday to Sunday.
  d.candidates.find(c => c.id === 'c2').demands = ['ba:jobdemand_freeweekends'];
  const page = await board(t, {data: JSON.stringify(d)});
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  assert.deepEqual((await quick(page)).picks, [['c1', 36]]);
});

test('Quick hire takes a role Open places had filled while its confirm is open, and Open places shrinks', async (t) => {
  const d = JSON.parse(payload);
  d.officeStaffing[0].current = {shifts: 0, fragments: 0, list: []};
  const page = await board(t, {data: JSON.stringify(d)});
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(LAW);
  await box.locator('[data-hq-site]').selectOption(O);
  // Lior, Open places' pick, would take the office's one week; the form
  // alone leaves the Lawyer row where it is.
  assert.deepEqual((await quick(page)).picks, [['l1', 42]]);
  assert.equal(await page.locator(`#hsOpen tr[data-hr-role="${LAW}"]`).count(), 1);
  assert.deepEqual(await quickRequest(page), {moves: [], hires: [{candidateId: 'l1', address: addr(O), expect: {wage: 50}, seenHoursLeft: 100}],
    sites: [{address: addr(O), expect: '0ff1ce00', openAllHours: false, days: [
      {d: 1, shifts: [{f: 8, t: 22, employeeId: 'l1', itemInstanceId: 'DESK-1'}]},
      {d: 2, shifts: [{f: 8, t: 22, employeeId: 'l1', itemInstanceId: 'DESK-1'}]},
      {d: 3, shifts: [{f: 8, t: 22, employeeId: 'l1', itemInstanceId: 'DESK-1'}]}]}]});
  // The confirm open: the week is held and the Lawyer row goes.
  await quickConfirm(page);
  const m = await model(page);
  assert.deepEqual(m.roles.map(r => r.skill), [CS, FW, CLEAN]);
  assert.deepEqual(m.weeks[4], [O, 'office', ['quick:l1']]);
  assert.equal(await page.locator(`#hsOpen tr[data-hr-role="${LAW}"]`).count(), 0);
  assert.match(await page.locator('#hsOrder .hs-ol').textContent(), /Hire6/);
  assert.equal(await page.locator('#hsOrder p.hs-held').textContent(), '1 week held for Quick hire (Lawyer at HART. Law)');
  // The main order no longer hires Lior.
  assert.ok(!(await request(page)).hires.some(h => h.candidateId === 'l1'));
  // Closed: the row is back.
  await quickClose(page);
  assert.equal(await page.locator(`#hsOpen tr[data-hr-role="${LAW}"]`).count(), 1);
  assert.equal(await page.locator('#hsOrder .hs-held').count(), 0);
});

test('Quick hire where the plan has no open week: no hours, and says so', async (t) => {
  const page = await board(t);
  const corner = JSON.parse(payload).businesses.find(b => b.key === C).shiftPrint;
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(C);
  // Corner's plan has no hire week: Bram joins it with no hours. While the
  // confirm is open he is Quick hire's, and Open places picks the next best
  // for Gifts; no week is held.
  assert.deepEqual((await quick(page)).picks, [['c2', null]]);
  assert.deepEqual((await model(page)).weeks[0], [G, 'demand', ['move:SPARE1', 'hire:c2']]);
  // Hire and schedule writes Corner's week on its plan all the same.
  assert.deepEqual((await quickRequest(page)).sites, [{address: addr(C), expect: corner, openAllHours: false,
    days: [{d: 1, shifts: [{f: 8, t: 20, employeeId: 'CCCCemployeeCCCCCCCCCCCC', itemInstanceId: 'REG-C'}]}]}]);
  assert.deepEqual((await quickRequest(page, 'hire')).sites, [{address: addr(C), expect: null, days: null}]);
  const dlg = await quickConfirm(page);
  assert.deepEqual((await model(page)).weeks[0], [G, 'demand', ['move:SPARE1', 'hire:c1']]);
  assert.equal(await page.locator('#hsOrder .hs-held').count(), 0);
  // Each with their own reason, beside the name in the form and in the confirm (PR #184).
  assert.match(await page.locator('#hsQuick .hs-match').textContent(), /Bram Castellno open hours left in the plan/);
  const text = await dlg.locator('.gw-body').textContent();
  assert.match(text, /1 hire joins with no hours\. Choose Hire only/);
  assert.match(text, /Bram Castell: the plan has no open week left for them/);
});

test('Part-time is left out per destination: a shop week, not an office week of the same role', async (t) => {
  const d = JSON.parse(payload);
  d.candidates.push(cand('p1', 'Pia Quist', [[CS, 95]], 10, {demands: [PT]}), cand('p2', 'Paz Ruiz', [[CS, 94]], 10, {demands: [PT]}));
  const law = d.hiring.sites.find(s => s.key === O);
  law.accepts = [LAW, CS];
  law.plans.office.hireWeeks.push({skill: CS, hours: 14, days: 1, slots: [slot(0, 1, 8, 22, 'DESK-1')]});
  const page = await board(t, {data: JSON.stringify(d)});
  const m = await model(page);
  // Pia asks for Part-time: kept off the shops' weeks, placed in the office's.
  // Paz asks for it too, and the office has no second week.
  assert.deepEqual(m.roles[0].picked, ['p1', 'c2', 'c1', 'c4']);
  assert.deepEqual(m.weeks[4], [O, 'office', ['hire:l1', 'hire:p1']]);
  await page.locator(`[data-hr-open="${CS}"]`).click();
  assert.equal(await page.locator('#hsSheet [data-hr-cand="p2"] td.to').textContent(), 'not for shop weeks (Part-time)');
  assert.equal(await page.locator('#hsSheet [data-hr-cand="p1"] td.to').textContent(), 'HART. Law');
  await page.locator('#hsSheet [data-hs-close]').click();
  await page.locator('#hsSheet').waitFor({state: 'detached'});
  // Lawyer is hired into the office only: its Change picks shows no Part-time.
  await page.locator(`[data-hr-open="${LAW}"]`).click();
  const sheet = page.locator('#hsSheet');
  assert.match(await sheet.locator(`[data-hs-dem-open="${LAW}"]`).textContent(), /Leave out who asks for: nobody/);
  // Its demand list names the company's Part-time as for shop roles only,
  // and does not let it be changed from here; Clear keeps it.
  await sheet.locator(`[data-hs-dem-open="${LAW}"]`).click();
  const pop = page.locator('dialog#hsSheet > #hsDemPop');
  const pt = pop.locator('label', {has: page.locator(`[data-hr-dem="${PT}"]`)});
  assert.match(await pt.textContent(), /Part-time · shop roles only/);
  assert.equal(await pop.locator(`[data-hr-dem="${PT}"]`).isDisabled(), true);
  await pop.locator('[data-hs-dem-clear]').click();
  assert.deepEqual(await page.evaluate(() => hrFilters().company.ex), [PT]);
  assert.deepEqual((await model(page)).roles[0].picked, ['p1', 'c2', 'c1', 'c4']);
  await page.keyboard.press('Escape');
  // "Lawyer only" copies the filter it is picked by, without Part-time.
  await sheet.locator('[data-hr-scope="own"]').check();
  assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('ba_dash_hire:default')))).roles[LAW].ex, []);
  await sheet.locator('[data-hs-close]').click();
  await sheet.waitFor({state: 'detached'});
  // The page's list names the company's Part-time as for shop roles only.
  await page.locator('#hsOpen [data-hs-dem-open=""]').click();
  const pagePt = page.locator('#hsDemPop label', {has: page.locator(`[data-hr-dem="${PT}"]`)});
  assert.match(await pagePt.textContent(), /Part-time · shop roles only/);
  assert.equal(await page.locator(`#hsDemPop [data-hr-dem="${PT}"]`).isDisabled(), false);
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
  assert.deepEqual(m.roles.find(r => r.skill === CS).picked, ['c2', 'c1', 'c4']);
  assert.deepEqual(m.roles.find(r => r.skill === LAW).picked, ['p2']);
  const filter = page.locator('#hsOpen [data-hs-dem-open=""]');
  assert.match(await filter.textContent(), /^Leave out who asks for: Part-time/);
  // Shop roles only: the filter's tip, not a line under it (declutter T10).
  assert.equal(await filter.getAttribute('data-tip'), 'Part-time is left out for shop roles only.');
  assert.equal(await page.locator('#hsOpen .hs-shops').count(), 0);
  // Quick hire takes the page's filters (declutter T9): Part-time left out at a shop, not at the office.
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(LAW);
  await box.locator('[data-hq-site]').selectOption(O);
  assert.deepEqual((await quick(page)).ex, []);
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  assert.deepEqual((await quick(page)).ex, [PT]);
  assert.ok(!(await quick(page)).matches.includes('p1'));
  // Unticking Part-time in the page's list brings her back, in both.
  await filter.click();
  await page.locator('#hsDemPop [data-hr-dem="' + PT + '"]').uncheck();
  m = await model(page);
  assert.deepEqual(m.roles.find(r => r.skill === CS).picked, ['p1', 'c2', 'c1']);
  assert.ok((await quick(page)).matches.includes('p1'));
  await page.keyboard.press('Escape');
  await box.locator('[data-hq-role]').selectOption('');
  assert.equal(await filter.getAttribute('data-tip'), null);
  assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('ba_dash_hire:default')))).company.ex, []);
  // A set kept before the default gets Part-time once; a v2 set is kept as is.
  const kept = await page.evaluate(pt => {
    const read = v => { localStorage.setItem('ba_dash_hire:default', JSON.stringify(v)); hrFilterMem = null; return hrFilters().company.ex; };
    return [read({company: {ex: ['ba:jobdemand_nonights']}, roles: {}}), read({v: 2, company: {ex: []}, roles: {}})];
  }, PT);
  assert.deepEqual(kept, [['ba:jobdemand_nonights', PT], []]);
});

test('at 390 px every role, its Change picks and its reassign line are on screen', async (t) => {
  const page = await board(t, {viewport: {width: 390, height: 844}});
  const out = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const off = el => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > vw; };
    const rows = [...document.querySelectorAll('#hsOpen tr[data-hr-role]')];
    return {rows: rows.length, buttons: document.querySelectorAll('#hsOpen [data-hr-open]').length,
      off: [...document.querySelectorAll('#hsOpen [data-hr-open], #hsOpen .hs-re, #hsOpen td.hs-rn, #hsOpen td.act')].filter(off).map(e => e.outerHTML.slice(0, 60)),
      table: (() => { const s = document.querySelector('#hsOpen .hs-scroll'); return s.scrollWidth - s.clientWidth; })()};
  });
  assert.equal(out.rows, 4);
  assert.equal(out.buttons, 4);
  assert.deepEqual(out.off, [], 'nothing past the right edge');
  assert.ok(out.table <= 0, `the table scrolls sideways by ${out.table}px`);
  // The button is the role's own, under it, and opens its Change picks.
  await page.locator(`[data-hr-open="${CS}"]`).click();
  assert.equal(await page.locator('#hsSheet').getAttribute('data-hr-drawer'), CS);
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
  assert.equal(await page.evaluate(() => [...pageStale].some(r => r[0] === 'staffing/needs' && /drawStaff/.test(String(r[1])))), true);
  await page.evaluate(() => { showPage('staffing'); showSub('staffing', 'needs'); });
  assert.equal(await page.evaluate(() => window.staffDraws), 1);
  assert.match(await page.locator('#hsOpen .hs-facts2').textContent(), /^14 candidates/);
});

/* The redesign keeps Payroll as a Staffing view of its own beside Staff needs,
   which draws no second Payroll (declutter T8): an old Payroll link opens
   Payroll, an old Staff link opens Staff needs (docs/ui-route-migration.md). */
test('old Payroll links land on Payroll; old Staff links on Staff needs, which draws no second Payroll', async (t) => {
  const page = await board(t, {open: false});
  await page.evaluate(() => openHash('staff'));
  assert.equal(await page.evaluate(() => `${page}/${sub.staffing} ${route}`), 'staffing/needs staffing/needs');
  assert.equal(await page.locator('#secStaff #hrPayroll').count(), 0);
  for (const go of [() => openHash('payroll'), () => { showPage('today'); reveal('secPayroll'); }]) {
    await page.evaluate(go);
    assert.equal(await page.evaluate(() => `${page}/${sub.staffing} ${route}`), 'staffing/payroll staffing/payroll');
    assert.equal(await page.locator('[data-view-ctl="staffing/payroll"] h2').textContent(), 'Payroll');
    assert.match(await page.locator('#secPayroll').textContent(), /People\d+/);
  }
});

test('closing the Quick hire confirm gives the focus back to its Hire button', async (t) => {
  const page = await board(t);
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  await quickConfirm(page);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.gw-dlg[open]') && !hrUi.quickHold);
  assert.equal(await page.evaluate(() => document.activeElement.matches('#hsQuick [data-hq-go]')), true);
});

// Quick hire at Gifts whose apply waits until window.release(answer) is
// called, with the dialog closed while it is under way.
async function closedWhileApplying(page) {
  await page.evaluate(src => {
    window.answerFor = eval(src);
    window.hrAnswer = (kind, body, o) => o.dryRun ? Promise.resolve({status: 200, error: null, body: window.answerFor(body)})
      : new Promise(r => { window.release = ok => r(ok ? {status: 200, error: null, body: window.answerFor(body, {dryRun: false})}
        : {status: 409, error: 'cannot_write', body: {error: 'cannot_write', reason: 'myemployees'}}); });
  }, `(${answerFor.toString()})`);
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  await box.locator('[data-hq-go]').click();
  await phase(page, 'ready');
  await page.locator('dialog.gw-dlg .gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'applying');
  await page.evaluate(() => document.querySelector('dialog.gw-dlg').close());
  // The close event (which removes the dialog) has run, not only close().
  await page.waitForFunction(() => !document.querySelector('dialog.gw-dlg'));
  // The write is still under way: the week stays held.
  assert.ok(await page.evaluate(() => hrUi.quickHold));
  assert.deepEqual((await model(page)).weeks[0], [G, 'demand', ['move:SPARE1', 'quick:c2']]);
}

test('a Quick hire confirm closed while it applies keeps its hold until the game answers', async (t) => {
  const page = await board(t);
  await closedWhileApplying(page);
  await page.evaluate(() => window.release(true));
  await page.waitForFunction(() => !hrUi.quickHold);
  // Bram is staff now: Open places does not list him, and the form is reset.
  assert.deepEqual(await page.evaluate(() => [...hrUi.hired.ids]), ['c2']);
  const m = await model(page);
  assert.deepEqual(m.weeks[0], [G, 'demand', ['move:SPARE1', 'hire:c1']]);
  assert.ok(!m.roles[0].picked.includes('c2'));
  assert.equal(await page.locator('#hsQuick [data-hq-role]').inputValue(), '');
  assert.equal(await page.locator('#hsOrder .hs-held').count(), 0);
});

test('a Quick hire confirm closed while it applies releases its hold when the write fails', async (t) => {
  const page = await board(t);
  await closedWhileApplying(page);
  await page.evaluate(() => window.release(false));
  await page.waitForFunction(() => !hrUi.quickHold);
  assert.deepEqual((await model(page)).weeks[0], [G, 'demand', ['move:SPARE1', 'hire:c2']]);
  assert.equal(await page.locator('#hsOrder .hs-held').count(), 0);
  // Nobody was hired: the form keeps its role.
  assert.equal(await page.locator('#hsQuick [data-hq-role]').inputValue(), CS);
});

test('while a closed Quick hire confirm still applies, the button waits and no second confirm opens', async (t) => {
  const page = await board(t);
  await closedWhileApplying(page);
  const go = page.locator('#hsQuick [data-hq-go]');
  assert.equal((await go.textContent()).trim(), 'Hiring…');
  assert.equal(await go.getAttribute('aria-disabled'), 'true');
  await page.evaluate(() => hrQuickReview());
  assert.equal(await page.locator('dialog.gw-dlg[open]').count(), 0);
  // The write fails: nobody hired, the form as it was, the button back.
  await page.evaluate(() => window.release(false));
  await page.waitForFunction(() => !hrUi.quickHold && !hrUi.quickPending);
  assert.equal((await go.textContent()).trim(), 'Hire 1');
  assert.equal(await go.getAttribute('aria-disabled'), null);
});

test('an answer that lands before the close event leaves nothing pending', async (t) => {
  const page = await board(t);
  await page.evaluate(src => {
    window.answerFor = eval(src);
    window.hrAnswer = (kind, body, o) => o.dryRun ? Promise.resolve({status: 200, error: null, body: window.answerFor(body)})
      : new Promise(r => { window.release = () => r({status: 409, error: 'cannot_write', body: {error: 'cannot_write', reason: 'myemployees'}}); });
  }, `(${answerFor.toString()})`);
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  await box.locator('[data-hq-go]').click();
  await phase(page, 'ready');
  await page.locator('dialog.gw-dlg .gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'applying');
  // close() queues its event; the write's answer runs first, in microtasks.
  await page.evaluate(() => { document.querySelector('dialog.gw-dlg').close(); window.release(); });
  await page.waitForFunction(() => !document.querySelector('dialog.gw-dlg'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 50)));
  assert.deepEqual(await page.evaluate(() => [hrUi.quickHold, !!hrUi.quickPending]), [false, false]);
  const go = page.locator('#hsQuick [data-hq-go]');
  assert.equal((await go.textContent()).trim(), 'Hire 1');
  assert.equal(await go.getAttribute('aria-disabled'), null);
});

test("a late answer to a closed Quick hire confirm leaves the next confirm's hold alone", async (t) => {
  const page = await board(t);
  await closedWhileApplying(page);
  const a = await page.evaluate(() => hrUi.quickHold);
  // Past the waiting button: a second confirm, B, opens while A applies.
  await page.evaluate(() => { hrUi.quickPending = false; hrQuickReview(); });
  await phase(page, 'ready');
  const b = await page.evaluate(() => hrUi.quickHold);
  assert.ok(b && b !== a, `B holds its own token (${a}, ${b})`);
  // A's answer lands: its release is stale and B keeps its hold.
  await page.evaluate(() => window.release(true));
  await page.waitForFunction(() => hrUi.hired && hrUi.hired.ids.has('c2'));
  assert.equal(await page.evaluate(() => hrUi.quickHold), b);
  assert.equal(await page.locator('dialog.gw-dlg[open]').count(), 1);
});

test('a desk or chair demand is judged at the desk the week is on, and a pick goes to one that meets it', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(() => {
    const EXEC = 'ba:jobdemand_seatedatofficedesk2';
    D.hiring.demandKinds[EXEC] = 'station';
    const at = (station) => ({w: {slots: [{station, d: 1, f: 8, t: 22}]}});
    const S = {site: {stations: {'DESK-2': [EXEC]}, name: 'Law'}, planned: true};
    const bare = {site: {stations: {}, name: 'Bare'}, planned: true};
    const m = {sites: [S]};
    return {
      met: hrDemandAt(m, EXEC, S, at('DESK-2')),
      other: hrDemandAt(m, EXEC, S, at('DESK-1')),
      why: hrWhy(m, EXEC, S, at('DESK-1')),
      none: hrDemandAt({sites: [bare]}, EXEC, bare, at('DESK-1')),
      noWeek: hrDemandAt(m, EXEC, S, null),
      miss: hrDeskMiss([EXEC, 'ba:jobdemand_fulltime'], S, at('DESK-1').w),
    };
  });
  assert.deepEqual(out, {met: 'ok', other: 'warn', why: 'not at this desk', none: 'no', noWeek: 'warn',
                         miss: ['ba:jobdemand_seatedatofficedesk2']});
});

test('an insurance tier some HR plan offers warns that a hire has to be added to it', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(() => {
    const GOLD = 'ba:jobdemand_goldhealthinsurance';
    D.hiring.company[GOLD] = 'plan';
    const S = {site: {stations: {}, name: 'Law'}, planned: true};
    return [hrDemandAt({sites: [S]}, GOLD, S, null), hrWhy({sites: [S]}, GOLD, S, null)];
  });
  assert.deepEqual(out, ['warn', 'add them to an HR plan that offers it']);
});

test('a Staff select opens the page\'s own option list, by mouse and by keyboard', async (t) => {
  const page = await board(t);
  const role = page.locator('#hsQuick [data-hq-role]');
  await role.click();
  const pop = page.locator('#hsSelPop');
  assert.equal(await pop.isVisible(), true, 'the list, not the system\'s');
  assert.equal(await pop.getAttribute('role'), 'listbox');
  assert.equal(await page.locator('#hsQuick .hs-sel[aria-expanded="true"] [data-hq-role]').count(), 1);
  await pop.locator('.hs-selopt', {hasText: 'HR Manager'}).click();
  assert.equal(await pop.count(), 0);
  assert.equal(await page.locator('#hsQuick [data-hq-role]').inputValue(), HRM);
  // The keyboard: Enter opens it, the arrows move, Enter picks, Escape closes.
  await page.locator('#hsQuick [data-hq-site]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#hsSelPop').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#hsSelPop').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.matches('[data-hq-site]')), true);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.notEqual(await page.locator('#hsQuick [data-hq-site]').inputValue(), '');
});

test('Where to find them: a role places stay open in, how many and where people come from', async (t) => {
  const page = await board(t);
  const text = await page.evaluate(([LAW, CS]) => {
    D.hiring.recruiting = {[CS]: 1};
    const role = (skill, short, pool, pass) => ({skill, short, pool: Array(pool).fill({}), pass});
    const html = hrFindHtml({roles: [role(LAW, 6, 0, 0), role(CS, 2, 3, 1), role('ba:skill_cleaning', 0, 5, 5)]});
    const el = document.createElement('div'); el.innerHTML = html;
    return [...el.querySelectorAll('li')].map(li => [...li.children].map(c => c.textContent.trim()).join(' '));
  }, [LAW, CS]);
  // How many stay open, and that there are no candidates, is the table's to say (declutter T5, T7).
  assert.deepEqual(text, [
    'Lawyer a Headhunter at your headquarters recruiting Lawyer, or a Recruitment Agency',
    'Customer Service 2 more left out by your filters your Headhunter is recruiting Customer Service: wait for more candidates, or a Recruitment Agency',
  ]);
  // Nothing short, nothing said.
  assert.equal(await page.evaluate(() => hrFindHtml({roles: []})), '');
});

test('a shop with no hour read is hired for the hours it opens, and the write never opens it', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(([G]) => {
    const base = D.staffing.find(r => r.key === G);
    base.openCover = {shifts: base.shifts, open: [[[10, 18]]], openAllHours: false};
    const site = {key: G, kind: 'shop', new: true, plans: {open: {hireWeeks: []}, full: {hireWeeks: []}}};
    const v = hrVariant(site), row = hrPlanRow(site, v);
    return {v, full: row.full, open: row.open, openAllHours: !!(row.full && !row.openNow)};
  }, [G]);
  assert.deepEqual(out, {v: 'open', full: false, open: [[[10, 18]]], openAllHours: false});
});

test('the Staff page opens a shop only on the full cover picked there, and a shop with no hours has no plan', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(([G]) => {
    /* Full cover on offer at Gifts, which the pick needs to stand. */
    D.staffing.find(r => r.key === G).fullCover = {shifts: []};
    spPlanWrite(G, 'full');
    const picked = hrVariant({key: G, kind: 'shop', plans: {demand: {}, open: {}}});
    const noOpen = hrVariant({key: G, kind: 'shop', plans: {demand: {}, full: {}}});
    spPlanWrite(G, 'demand');
    const measured = hrVariant({key: G, kind: 'shop', plans: {demand: {}, open: {}}});
    D.hiring.sites.find(s => s.key === G).noHours = true;
    drawStaff(); wireStaff();
    return {picked, noOpen, measured, note: document.querySelector('#secStaff .hs-nohours').textContent};
  }, [G]);
  // Full cover picked: the full plan where the payload has one, the open
  // hours where it does not (a board read before 29 September 2026).
  assert.deepEqual(out, {picked: 'open', noOpen: 'full', measured: 'demand',
    note: 'HART. Gifts opens no hour in the game: set its opening hours first.'});
  // Every site of a hire request keeps its opening hours.
  const body = await request(page);
  assert.ok(body.sites.length > 0);
  assert.ok(body.sites.every(x => x.openAllHours === false));
});

test('a desk demand at a site with no plan is met at a desk there: seat them there', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(() => {
    const EXEC = 'ba:jobdemand_seatedatofficedesk2';
    D.hiring.demandKinds[EXEC] = 'station';
    const hq = {site: {stations: {d1: [EXEC]}, name: 'HQ'}, planned: false};
    return [hrDemandAt({sites: [hq]}, EXEC, hq, null), hrWhy({sites: [hq]}, EXEC, hq, null)];
  });
  assert.deepEqual(out, ['warn', 'met at a desk here: seat them there']);
});

test('a live refresh under an open option list keeps the list on the new select, and the pick lands', async (t) => {
  const page = await board(t);
  await page.locator('#hsQuick [data-hq-role]').click();
  assert.equal(await page.locator('#hsSelPop').isVisible(), true);
  const out = await page.evaluate(([HRM]) => {
    const old = document.querySelector('#hsQuick [data-hq-role]');
    drawStaff(); wireStaff();
    const now = document.querySelector('#hsQuick [data-hq-role]');
    const i = [...now.options].findIndex(o => o.value === HRM);
    return {redrawn: old !== now && !old.isConnected, open: !!document.getElementById('hsSelPop'),
      pointed: hrSel && hrSel.select === now, i,
      active: document.getElementById('hsSelPop').getAttribute('aria-activedescendant'),
      controls: now.getAttribute('aria-controls'), expanded: now.getAttribute('aria-expanded')};
  }, [HRM]);
  assert.equal(out.redrawn, true);
  assert.equal(out.open, true);
  assert.equal(out.pointed, true);
  assert.equal(out.active, 'hsSelOpt0');
  assert.equal(out.controls, 'hsSelPop');
  assert.equal(out.expanded, 'true');
  await page.locator(`#hsSelPop [data-hs-opt="${out.i}"]`).click();
  assert.equal(await page.locator('#hsQuick [data-hq-role]').inputValue(), HRM);
  // Type-ahead: "h" lights the first option starting with it.
  await page.locator('#hsQuick [data-hq-role]').click();
  await page.keyboard.press('h');
  const lit = await page.evaluate(() => document.querySelector('#hsSelPop .hs-selopt.on').textContent.trim());
  assert.match(lit, /^H/);
});

test('an option list whose select comes back disabled, or not at all, closes', async (t) => {
  const page = await board(t);
  for(const how of ['disabled', 'gone']){
    await page.locator('#hsQuick [data-hq-role]').click();
    const open = await page.evaluate(how => {
      const old = document.querySelector('#hsQuick [data-hq-role]');
      const next = old.cloneNode(true);
      if(how === 'disabled'){ next.disabled = true; old.replaceWith(next); }
      else old.remove();
      hrSelRepoint();
      const still = !!document.getElementById('hsSelPop');
      drawStaff(); wireStaff();
      return still;
    }, how);
    assert.equal(open, false, how);
  }
});

test('Staff with no hours: a site whose own staff the plan counts on have no hours, and a link to its Staffing', async (t) => {
  const page = await board(t);
  const text = await page.evaluate(([G, CS]) => {
    D.hiring.sites.find(s => s.key === G).unstaffed = {demand: {hours: 168, roles: [{skill: CS, hours: 168, idle: 4}]}};
    drawStaff(); wireStaff();
    const box = document.querySelector('#secStaff .hs-idle');
    return box && [...box.querySelectorAll('li')].map(li => [...li.children].map(c => c.textContent.trim()).join(' | '));
  }, [G, CS]);
  assert.deepEqual(text, ['HART. Gifts | 168 h with nobody on · your 4 Customer Service staff have no hours | Write their week']);
  const link = page.locator('#secStaff .hs-idle a[data-hr-roster]');
  // Their week is Staffing › Schedules', with the site picked and its planner beside the list.
  await link.click();
  await page.waitForFunction(() => route === 'staffing/schedules');
  assert.deepEqual(await page.evaluate(() => [schedLit, !!document.querySelector('#schDetail #sp-roster')]), [G, true]);
  // Not counted in the order: nobody is hired for those hours.
  assert.equal(await page.evaluate(() => hrTotals(hrModel()).hire), 7);
});

test('Staff with no hours shows when nothing needs hiring, and then says no more that every site has its people', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(([G, CS]) => {
    const m = hrModel();
    m.roles = [];
    m.sites.find(S => S.key === G).site.unstaffed = {demand: {hours: 168, roles: [{skill: CS, hours: 168, idle: 4}]}};
    const withIdle = hrOpenHtml(m);
    m.sites.find(S => S.key === G).site.unstaffed = null;
    const without = hrOpenHtml(m);
    return {withIdle, without};
  }, [G, CS]);
  assert.match(out.withIdle, /Staff with no hours/);
  assert.match(out.withIdle, /168 h with nobody on/);
  assert.doesNotMatch(out.withIdle, /Every planned site has its people/);
  assert.match(out.without, /Every planned site has its people/);
  assert.doesNotMatch(out.without, /Staff with no hours/);
});

test('Staff with no hours: shops and offices, each measured on the plan its Staffing block writes', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(([G, O, CS, LAW]) => {
    const m = hrModel();
    const u = (h, skill) => ({hours: h, roles: [{skill, hours: h, idle: 2}]});
    /* Full cover on offer at Gifts, as gwRosterPlan() asks before taking it. */
    D.staffing.find(r => r.key === G).fullCover = {shifts: []};
    m.sites.find(S => S.key === G).site.unstaffed = {demand: u(20, CS), full: u(90, CS)};
    m.sites.find(S => S.key === O).site.unstaffed = {office: u(40, LAW)};
    const text = () => { const el = document.createElement('div'); el.innerHTML = hrIdleHtml(m); return el.textContent; };
    const demand = text();
    spPlanWrite(G, 'full');
    const full = text();
    spPlanWrite(G, 'demand');
    return {demand, full};
  }, [G, O, CS, LAW]);
  assert.match(out.demand, /HART\. Gifts20 h with nobody on/);
  assert.match(out.full, /HART\. Gifts90 h with nobody on/);
  assert.match(out.demand, /HART\. Law40 h with nobody on/);
});

test('an office week is written from Staffing › Schedules: the office default for its own staff, never opening it', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(([O, LAW]) => {
    const row = D.officeStaffing.find(r => r.key === O);
    Object.assign(row, {people: [{id: 'LAWYER1', name: 'Lena Voss'}], alwaysOn: 1,
      shifts: [{d: 1, s: 0, f: 8, t: 20, p: 0}, {d: 2, s: 0, f: 8, t: 20, p: 0}, {d: 3, s: 0, f: 8, t: 22, p: null}],
      current: {list: []}});
    window.hrAnswer = async (kind, body, o) => ({status: 200, error: null, body: {ok: true, kind, dryRun: !!o.dryRun, stamp: 's',
      address: body.address, business: 'HART. Law', before: {shifts: 0, print: 'a'}, after: {shifts: 2, print: 'b'},
      removed: 0, added: 2, openedHours: false, leftWithout: [], warnings: [], siteError: null, rows: []}});
    Object.assign(D.businesses.find(b => b.key === O), {status: 'office'});
    openRoute('staffing/schedules', {pick: O});
    const block = document.querySelector('#schDetail #sp-roster');
    return {plan: !!gwRosterPlan(O), block: block && block.textContent.replace(/\s+/g, ' ').trim(),
      button: !!(block && block.querySelector('[data-gw-sites]'))};
  }, [O, LAW]);
  assert.equal(out.plan, true);
  assert.match(out.block, /Staffing/);
  assert.match(out.block, /Waiting on a hire\s*14 h/);
  assert.match(out.block, /Hours \/ week\s*0 → 24/);
  assert.equal(out.button, true);
  await page.locator('#schDetail #sp-roster [data-gw-sites]').first().click();
  await phase(page, 'ready');
  const w = await page.evaluate(() => window.hrWrites.filter(x => x.kind === 'schedule').at(-1));
  assert.deepEqual(w.body, {address: addr(O), expect: '0ff1ce00', openAllHours: false, days: [
    {d: 1, shifts: [{f: 8, t: 20, employeeId: 'LAWYER1', itemInstanceId: 'DESK-1'}]},
    {d: 2, shifts: [{f: 8, t: 20, employeeId: 'LAWYER1', itemInstanceId: 'DESK-1'}]}]});
  assert.match(await page.locator('dialog.gw-dlg').textContent(), /Office default/);
});

test('an office write only adds: the week as it stands plus the planned entries whose computer and person are free', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(([O]) => {
    const row = D.officeStaffing.find(r => r.key === O);
    Object.assign(row, {
      stations: [{id: 'DESK-1', name: 'Computer', skill: 'ba:skill_lawyer'}, {id: 'CLN-O', name: 'Cleaning station', skill: 'ba:skill_cleaning'}],
      roles: [{skill: 'ba:skill_lawyer', label: 'Lawyer', stations: [0]}],
      people: [{id: 'LAWYER1', name: 'Lena Voss'}, {id: 'CLEANER1', name: 'Cleo Mop'}, {id: 'LAWYER2', name: 'Max Idle'}],
      shifts: [{d: 1, s: 0, f: 8, t: 20, p: 0}, {d: 2, s: 0, f: 8, t: 20, p: 0}, {d: 3, s: 0, f: 8, t: 22, p: null}],
      current: {list: [{d: 0, s: 0, f: 8, t: 22, p: 0}, {d: 1, s: 1, f: 8, t: 12, p: 1, k: 'clean'}, {d: 2, s: 0, f: 10, t: 14, p: 2}]}});
    Object.assign(D.businesses.find(b => b.key === O), {status: 'office'});
    const plan = gwRosterPlan(O), week = gwRosterWeek(plan);
    const flat = week.days.flatMap(({d, shifts}) => shifts.map(s => `${d} ${s.f}-${s.t} ${s.employeeId}@${s.itemInstanceId}`));
    // Once the game's week is this week, nothing is left to add: written.
    const same = Object.assign({}, plan, {current: {list: week.days.flatMap(({d, shifts}) => shifts.map(s => ({d, f: s.f, t: s.t,
      s: plan.stations.findIndex(x => x.id === s.itemInstanceId), p: plan.people.findIndex(x => x.id === s.employeeId)})))}});
    const again = gwRosterWeek(same);
    return {flat, sent: week.sent, kept: week.kept, matches: gwRosterMatches(plan, week), after: gwRosterMatches(same, again), againSent: again.sent};
  }, [O]);
  // Everything at the office stays; Lena's Monday is added; her Tuesday meets
  // Max on the same computer, so it is not.
  assert.deepEqual(out.flat, [
    '0 8-22 LAWYER1@DESK-1',
    '1 8-12 CLEANER1@CLN-O', '1 8-20 LAWYER1@DESK-1',
    '2 10-14 LAWYER2@DESK-1']);
  assert.deepEqual([out.sent, out.kept, out.matches, out.after, out.againSent], [1, 3, false, true, 0]);
  await page.evaluate(([O]) => {
    window.hrAnswer = async (kind, body, o) => ({status: 200, error: null, body: {ok: true, kind, dryRun: !!o.dryRun, stamp: 's',
      address: body.address, business: 'HART. Law', before: {shifts: 3, print: 'a'}, after: {shifts: 4, print: 'b'},
      removed: 3, added: 4, openedHours: false, leftWithout: [], warnings: [], siteError: null, rows: []}});
    openRoute('staffing/schedules', {pick: O});
  }, [O]);
  await page.locator('#schDetail #sp-roster [data-gw-sites]').first().click();
  await phase(page, 'ready');
  const text = await page.locator('dialog.gw-dlg').textContent();
  assert.match(text, /Adds 12 h for Lena Voss; nobody's current hours change\./);
  assert.doesNotMatch(text, /Fewer hours than now|stay as they stand|replaces the whole week/);
  assert.match(text, /Office default\s*adds to the week/);
});

test('an office entry this board cannot read stops the office write, and still keeps its hours from additions', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(([O]) => {
    const row = D.officeStaffing.find(r => r.key === O);
    Object.assign(row, {
      stations: [{id: 'DESK-1', name: 'Computer', skill: 'ba:skill_lawyer'}],
      roles: [{skill: 'ba:skill_lawyer', label: 'Lawyer', stations: [0]}],
      people: [{id: 'LAWYER1', name: 'Lena Voss'}, {id: null, name: 'Nobody Known'}],
      shifts: [{d: 1, s: 0, f: 8, t: 20, p: 0}, {d: 2, s: 0, f: 8, t: 20, p: 0}],
      current: {list: [{d: 1, s: 0, f: 10, t: 14, p: 1}]}});
    Object.assign(D.businesses.find(b => b.key === O), {status: 'office'});
    const week = gwRosterWeek(gwRosterPlan(O));
    openRoute('staffing/schedules', {pick: O});
    const b = document.querySelector('#schDetail #sp-roster [data-gw-sites]');
    return {unreadable: week.unreadable, days: week.days.map(x => x.d), listed: gwScheduleSites().includes(O),
      off: b && (b.getAttribute('aria-disabled') === 'true' || b.disabled), why: b && (b.getAttribute('aria-label') || b.title || b.textContent)};
  }, [O]);
  // The unreadable Monday entry keeps Lena's Monday out; her Tuesday is added.
  assert.deepEqual(out.days, [2]);
  assert.equal(out.unreadable, 1);
  assert.equal(out.listed, false);
  assert.equal(out.off, true);
  assert.match(out.why, /can't be read; change it in the game first/);
});

test('an office write is refused while a shift cannot be carried, and nothing to add says so', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(([O]) => {
    const row = D.officeStaffing.find(r => r.key === O);
    Object.assign(row, {
      stations: [{id: 'DESK-1', name: 'Computer', skill: 'ba:skill_lawyer'}],
      roles: [{skill: 'ba:skill_lawyer', label: 'Lawyer', stations: [0]}],
      people: [{id: 'LAWYER1', name: 'Lena Voss'}],
      shifts: [{d: 1, s: 0, f: 8, t: 22, p: 0}], current: {list: []}, unrepresentable: 1});
    Object.assign(D.businesses.find(b => b.key === O), {status: 'office'});
    const blocked = gwRosterWeek(gwRosterPlan(O)).unreadable;
    delete row.unrepresentable;
    row.current = {list: [{d: 1, s: 0, f: 8, t: 22, p: 0}]};
    const written = gwRosterWeek(gwRosterPlan(O));
    return {blocked, sent: written.sent, listed: gwScheduleSites().includes(O)};
  }, [O]);
  assert.deepEqual(out, {blocked: 1, sent: 0, listed: false});
});

// --- user testing, 28 September 2026 ---------------------------------------------------

test('Staff needs has one heading over its filters; beside the full sidebar at 1280 px the roles table is whole, its panel under it, and beside it wider', async (t) => {
  const page = await board(t, {viewport: {width: 1280, height: 1400}});
  const heads = await page.$$eval('#secStaff h2, #secStaff h3', hs => hs.map(h => h.textContent.trim()));
  assert.ok(!heads.includes('Open places'), JSON.stringify(heads));
  const fit = () => page.evaluate(() => {
    const t = document.querySelector('#secStaff table.hs-roles'), box = t.closest('.hs-scroll');
    return {right: t.getBoundingClientRect().right, box: box.getBoundingClientRect().right, over: box.scrollWidth - box.clientWidth,
      tracks: getComputedStyle(document.querySelector('#secStaff .hs-split')).gridTemplateColumns.trim().split(/\s+/).length};
  });
  let f = await fit();
  assert.ok(f.over <= 1 && f.right <= f.box + 1, `nothing cut off: ${JSON.stringify(f)}`);
  assert.equal(f.tracks, 1, 'the panel goes under the table');
  await page.setViewportSize({width: 1700, height: 1400});
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#secStaff .hs-split')).gridTemplateColumns.trim().split(/\s+/).length === 2);
  f = await fit();
  assert.ok(f.over <= 1 && f.right <= f.box + 1, JSON.stringify(f));
});

// --- staffing revisit, 28 September 2026 -----------------------------------------------

test('a spare person moves only into a week that meets their schedule demands, at any site', async (t) => {
  // Sam asks for free weekends. Both Gifts weeks run into the weekend, Bare's
  // first runs Monday to Wednesday: he goes to Bare, not to the first site.
  const d = JSON.parse(payload);
  d.hiring.people.SPARE1.demands = ['ba:jobdemand_freeweekends'];
  d.hiring.sites.find(s => s.key === G).plans.demand.hireWeeks[0] =
    {skill: CS, hours: 24, days: 2, slots: [slot(2, 6, 8, 20, 'REG-G'), slot(3, 0, 8, 20, 'REG-G')]};
  let page = await board(t, {data: JSON.stringify(d)});
  let m = await model(page);
  assert.deepEqual(m.moves[1], {id: 'SPARE1', from: C, to: B, fixed: false, off: false});
  assert.equal(m.weeks[2][2][0], 'move:SPARE1');
  // He asks for a four-day week and every week is two or three days: he is
  // not moved at all, and nobody is moved into a week they would not keep.
  d.hiring.people.SPARE1.demands = ['ba:jobdemand_fourdaysweek'];
  d.hiring.demandKinds['ba:jobdemand_fourdaysweek'] = 'schedule';
  page = await board(t, {data: JSON.stringify(d)});
  m = await model(page);
  assert.deepEqual(m.moves.map(x => x.id), ['BENCH1']);
});

test('one plan a shop is on: its Staffing, the Staff page and Staff with no hours read the same', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(([G, CS]) => {
    const base = D.staffing.find(r => r.key === G);
    /* Gifts without complete data: its open-hours plan is the one it is on. */
    base.fullCover = {shifts: [{d: 2, s: 0, f: 0, t: 12, p: 0}]};
    base.openCover = {shifts: [{d: 1, s: 0, f: 8, t: 20, p: 0}], open: base.open, openAllHours: false, complete: false};
    const site = D.hiring.sites.find(s => s.key === G);
    site.plans = {open: {spare: [], bench: [], hireWeeks: []}};
    const u = h => ({hours: h, roles: [{skill: CS, hours: h, idle: 1}]});
    site.unstaffed = {demand: u(20), full: u(90), open: u(40)};
    const read = () => {
      const m = hrModel(), el = document.createElement('div');
      el.innerHTML = hrIdleHtml(m);
      const plan = gwRosterPlan(G);
      return {on: spPlanOf(base), staff: hrVariant(site), block: plan.variant || (plan.full ? 'full' : 'demand'),
        write: JSON.stringify(plan.shifts) === JSON.stringify(plan.full ? base.fullCover.shifts : base.openCover.shifts),
        idle: (el.textContent.match(/HART\. Gifts(\d+) h/) || [])[1]};
    };
    const open = read();
    spPlanWrite(G, 'full');
    const full = read();
    spPlanWrite(G, 'demand');
    /* Complete data, and people working there: the demand plan. */
    base.openCover.complete = true;
    site.plans = {demand: {spare: [], bench: [], hireWeeks: []}, open: {spare: [], bench: [], hireWeeks: []}};
    const demand = read();
    return {open, full, demand};
  }, [G, CS]);
  assert.deepEqual(out.open, {on: 'open', staff: 'open', block: 'open', write: true, idle: '40'});
  // Full cover: the block writes 24/7 and Staff with no hours judges it; the
  // Staff page hires into the open hours in its place, as before.
  assert.deepEqual(out.full, {on: 'full', staff: 'open', block: 'full', write: true, idle: '90'});
  // With the full plan in the payload the Staff page hires into it too.
  assert.equal(await page.evaluate(([G]) => {
    const site = D.hiring.sites.find(s => s.key === G);
    site.plans = {open: {spare: [], bench: [], hireWeeks: []}, full: {spare: [], bench: [], hireWeeks: []}};
    spPlanWrite(G, 'full');
    const v = hrVariant(site);
    spPlanWrite(G, 'demand');
    return v;
  }, [G, CS]), 'full');
  assert.deepEqual(out.demand, {on: 'demand', staff: 'demand', block: 'demand', write: false, idle: '20'});
});

test('every week a write sends is checked per person: hours, days, 12 hours, overlap and demands', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(() => {
    const row = {stations: [{id: 'R', skill: 'ba:skill_customerservice'}, {id: 'M', skill: 'ba:skill_cleaning'}],
      people: [{id: 'a', name: 'Ana', demands: ['ba:jobdemand_parttime', 'ba:jobdemand_fivedaysweek']},
        {id: 'b', name: 'Ben', demands: ['ba:jobdemand_freeweekends', 'ba:jobdemand_nocleaning', 'ba:jobdemand_nomornings']},
        {id: 'c', name: 'Cy'}, {id: 'x', name: 'Xan'}, {id: 'z', name: 'Zia', demands: ['ba:jobdemand_fulltime']}],
      // Zia works 36 h here now and the week gives her none at all.
      current: {list: [{d: 1, s: 0, f: 8, t: 20, p: 2}, ...[4, 5, 6].map(d => ({d, s: 0, f: 8, t: 20, p: 4}))]}};
    const e = (id, st, f, t) => ({f, t, employeeId: id, itemInstanceId: st});
    const days = [
      {d: 1, shifts: [e('c', 'R', 8, 20), e('a', 'M', 8, 20), e('x', 'R', 20, 24), e('x', 'M', 0, 14)]},
      {d: 2, shifts: [e('a', 'R', 8, 20), e('x', 'R', 8, 16), e('x', 'M', 12, 20)]},
      {d: 3, shifts: [e('a', 'R', 8, 20), e('x', 'R', 8, 20)]},
      {d: 4, shifts: [e('x', 'R', 8, 20)]},
      {d: 6, shifts: [e('b', 'M', 6, 14)]},
    ];
    const found = gwWeekCheck(row, days);
    const el = document.createElement('div');
    el.innerHTML = gwCheckLines(found);
    return {found: found.map(p => [p.id, p.breaks.map(b => b.slug ? `${b.k}:${b.slug.replace('ba:jobdemand_', '')}` : b.d !== undefined ? `${b.k}:${b.d}` : b.k)]),
      text: [...el.querySelectorAll('li')].map(li => li.textContent)};
  });
  // Cy's week is as the game has it: not the write's to answer for.
  assert.deepEqual(out.found, [
    ['a', ['hours', 'days']],
    ['x', ['most', 'entry:1', 'day:2', 'twice:2']],
    ['b', ['demand:freeweekends', 'demand:nocleaning', 'demand:nomornings']],
    ['z', ['hours']],
  ]);
  // One sentence a break.
  assert.deepEqual(out.text.slice(0, 6), ['Ana: 36 h a week, asks for 10 to 30', 'Ana: 3 days a week, asks for 5',
    'Xan: 58 h a week, more than 50', 'Xan: an entry of 14 h on Monday', 'Xan: 16 h on Tuesday', 'Xan: two entries at once on Tuesday']);
  assert.equal(out.text.at(-1), 'Zia: 0 h a week, asks for 30 to 50');
});

test('an office write adds no entry that takes someone past their hours: the 60-hour week', async (t) => {
  const page = await board(t);
  const out = await page.evaluate(([O]) => {
    const row = D.officeStaffing.find(r => r.key === O);
    Object.assign(row, {
      stations: [{id: 'DESK-1', name: 'Computer', skill: 'ba:skill_lawyer'}, {id: 'DESK-2', name: 'Computer', skill: 'ba:skill_lawyer'}],
      roles: [{skill: 'ba:skill_lawyer', label: 'Lawyer', stations: [0, 1]}],
      people: [{id: 'LAWYER1', name: 'Lena Voss', demands: ['ba:jobdemand_fulltime']}],
      // 36 hours at the office now, Monday to Wednesday.
      current: {list: [1, 2, 3].map(d => ({d, s: 0, f: 8, t: 20, p: 0}))},
      // The office default adds Friday and Saturday on the other computer.
      shifts: [{d: 5, s: 1, f: 8, t: 20, p: 0}, {d: 6, s: 1, f: 8, t: 20, p: 0}]});
    Object.assign(D.businesses.find(b => b.key === O), {status: 'office'});
    const week = gwRosterWeek(gwRosterPlan(O));
    return {sent: week.sent, dropped: week.dropped,
      hours: week.days.flatMap(x => x.shifts).filter(s => s.employeeId === 'LAWYER1').reduce((n, s) => n + s.t - s.f, 0)};
  }, [O]);
  // Friday takes her to 48; Saturday would make 60, past her 50: left out.
  assert.deepEqual(out, {sent: 1, dropped: 1, hours: 48});
  // The confirm says so, for her.
  await page.evaluate(([O]) => {
    window.hrAnswer = async (kind, body, o) => ({status: 200, error: null, body: {ok: true, kind, dryRun: !!o.dryRun, stamp: 's',
      address: body.address, business: 'HART. Law', before: {shifts: 3, print: 'a'}, after: {shifts: 4, print: 'b'},
      removed: 3, added: 4, openedHours: false, leftWithout: [], warnings: [], siteError: null, rows: []}});
    openRoute('staffing/schedules', {pick: O});
  }, [O]);
  await page.locator('#schDetail #sp-roster [data-gw-sites]').first().click();
  await phase(page, 'ready');
  assert.match(await page.locator('dialog.gw-dlg .gw-body').textContent(),
    /Lena Voss: 12 h of the office default left out, more than their week can take/);
});

test('an office whose office default is all past its staff hours does not call itself written', async (t) => {
  const page = await board(t);
  const why = await page.evaluate(([O]) => {
    const row = D.officeStaffing.find(r => r.key === O);
    Object.assign(row, {
      stations: [{id: 'DESK-1', name: 'Computer', skill: 'ba:skill_lawyer'}],
      roles: [{skill: 'ba:skill_lawyer', label: 'Lawyer', stations: [0]}],
      people: [{id: 'LAWYER1', name: 'Lena Voss', demands: ['ba:jobdemand_fulltime']}],
      current: {list: [1, 2, 3, 4].map(d => ({d, s: 0, f: 8, t: 20, p: 0}))},
      shifts: [{d: 5, s: 0, f: 8, t: 20, p: 0}]});
    Object.assign(D.businesses.find(b => b.key === O), {status: 'office'});
    openRoute('staffing/schedules', {pick: O});
    const b = document.querySelector('#schDetail #sp-roster [data-gw-sites]');
    return b && (b.getAttribute('aria-label') || b.title || b.textContent);
  }, [O]);
  assert.match(why, /Nothing more fits: the rest of the office default is more than its staff's weeks can take/);
  assert.doesNotMatch(why, /Every entry the office default can add is in the game/);
});

test('a shop write names who its week leaves breaking a demand, before the confirm', async (t) => {
  const d = JSON.parse(payload);
  // Ana asks for full time; Gifts' plan gives her Monday and Tuesday, 24 h.
  const gifts = d.staffing.find(r => r.key === G);
  delete gifts.openCover;
  gifts.people[0].demands = ['ba:jobdemand_fulltime'];
  gifts.current.list = [{d: 1, s: 0, f: 8, t: 20, p: 0}];
  const page = await board(t, {data: JSON.stringify(d)});
  await page.evaluate(([G]) => {
    window.hrAnswer = async (kind, body, o) => ({status: 200, error: null, body: {ok: true, kind, dryRun: !!o.dryRun, stamp: 's',
      address: body.address, business: 'HART. Gifts', before: {shifts: 1, print: 'a'}, after: {shifts: 2, print: 'b'},
      removed: 1, added: 2, openedHours: false, leftWithout: [], warnings: [], siteError: null, rows: []}});
    openRoute('staffing/schedules', {pick: G});
  }, [G]);
  await page.locator('#schDetail #sp-roster [data-gw-sites]').first().click();
  await phase(page, 'ready');
  assert.match(await page.locator('dialog.gw-dlg .gw-body').textContent(),
    /This week breaks a rule or a demand for 1 person:Ana Silva: 24 h a week, asks for 30 to 50/);
});

test('Staff needs names who a hire write leaves breaking a demand, per site', async (t) => {
  const page = await board(t);
  await answering(page, []);
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  // The office default's 8 to 22 is one 14-hour entry a day for the lawyer.
  assert.match(await page.locator('dialog.gw-dlg .gw-body').textContent(), /Lior Marlow at HART\. Law: an entry of 14 h on Monday/);
});

test('a candidate no week at the first site fits takes a week at a later site that does', async (t) => {
  // Cleo asks for free weekends and is now the best: Gifts' open week runs
  // Friday to Sunday, Bare's first Monday to Wednesday. She goes to Bare,
  // with no warning, where she used to take Gifts' week, warned.
  const d = JSON.parse(payload);
  d.candidates.find(c => c.id === 'c3').skills = [{skill: CS, level: 95}];
  d.candidates.find(c => c.id === 'c3').level = 95;
  const page = await board(t, {data: JSON.stringify(d)});
  const m = await model(page);
  assert.deepEqual(m.weeks[0], [G, 'demand', ['move:SPARE1', 'hire:c2']]);
  assert.deepEqual(m.weeks[2], [B, 'open', ['hire:c3', 'hire:c1', 'hire:k1']]);
});

test('Quick hire writes its pick\'s plan week whole: hours set there give way, and a full-time pick keeps all 36 h', async (t) => {
  const d = JSON.parse(payload);
  // Bram asks for full time; Ana on Gifts' register Friday to Sunday meets
  // every hour of his plan week. The one action writes the site's plan week
  // (PR 3), so no clash cuts his week and no demand of his is broken.
  d.candidates.find(c => c.id === 'c2').demands = ['ba:jobdemand_fulltime'];
  d.names['ba:jobdemand_fulltime'] = 'Full-time';
  d.staffing.find(r => r.key === G).current.list.push({d: 5, s: 0, f: 8, t: 20, p: 0}, {d: 6, s: 0, f: 8, t: 20, p: 0}, {d: 0, s: 0, f: 8, t: 20, p: 0});
  const page = await board(t, {data: JSON.stringify(d)});
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  const days = (await quickRequest(page)).sites[0].days;
  assert.deepEqual(days.filter(x => [5, 6, 0].includes(x.d)).map(x => x.shifts.map(e => e.employeeId)), [['c2'], ['c2'], ['c2']]);
  assert.doesNotMatch(await box.locator('.hs-match').textContent(), /hours break|meet hours already set/);
  const dlg = await quickConfirm(page);
  const text = await dlg.locator('.gw-body').textContent();
  assert.doesNotMatch(text, /Bram Castell: the week breaks|joins with no hours/);
});

test('Quick hire: a better match no plan week fits still joins, with no hours, past the fitting ones', async (t) => {
  const d = JSON.parse(payload);
  // Bram asks for free weekends; Gifts has one open week, Friday to Sunday.
  // Two places: Ada takes the week, Bram the second place with no hours
  // (not Cleo, who ranks below him).
  d.candidates.find(c => c.id === 'c2').demands = ['ba:jobdemand_freeweekends'];
  let page = await board(t, {data: JSON.stringify(d)});
  let box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  await box.locator('[data-hq-more]').click();
  assert.deepEqual((await quick(page)).picks, [['c2', null], ['c1', 36]]);
  // Nobody fits the week: the best still joins, with no hours, and Hire is on.
  const e = JSON.parse(payload);
  e.candidates.forEach(c => { c.demands = ['ba:jobdemand_freeweekends']; });
  page = await board(t, {data: JSON.stringify(e)});
  box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  assert.deepEqual((await quick(page)).picks, [['c2', null]]);
  assert.equal(await box.locator('[data-hq-go]').getAttribute('aria-disabled'), null);
});

test('Quick hire says why a match held back from the plan weeks joins with no hours', async (t) => {
  const d = JSON.parse(payload);
  d.names['ba:jobdemand_freeweekends'] = 'Free weekends';
  d.candidates.forEach(c => { c.demands = ['ba:jobdemand_freeweekends']; });
  const page = await board(t, {data: JSON.stringify(d)});
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  // Gifts had an open week, Friday to Sunday: Bram fits none of it.
  assert.match(await box.locator('.hs-match').textContent(), /Bram Castellno open week fits Free weekends/);
  const dlg = await quickConfirm(page);
  const text = await dlg.locator('.gw-body').textContent();
  assert.match(text, /1 hire joins with no hours\./);
  assert.match(text, /Bram Castell: no open week fits Free weekends/);
  assert.doesNotMatch(text, /the plan has no open week left/);
});

test('Quick hire says there are no open hours only where the plan has none', async (t) => {
  const d = JSON.parse(payload);
  // Gifts' plan weeks all taken: Sam's reassign takes one, the other is gone.
  d.hiring.sites.find(s => s.key === G).plans.demand.hireWeeks.pop();
  const page = await board(t, {data: JSON.stringify(d)});
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  assert.deepEqual((await quick(page)).picks, [['c2', null]]);
  assert.match(await box.locator('.hs-match').textContent(), /Bram Castellno open hours left in the plan/);
  const dlg = await quickConfirm(page);
  const text = await dlg.locator('.gw-body').textContent();
  assert.match(text, /Bram Castell: the plan has no open week left for them/);
  assert.match(text, /1 hire joins with no hours\./);
  assert.doesNotMatch(text, /no open week fits/);
});

test('Quick hire with several picks gives each their own reason: only the one no week fits joins with no hours', async (t) => {
  // Two places at Gifts, one open week (Friday to Sunday). Ana is on the
  // register all of it, but the one action writes the plan week, so the one
  // who takes the week (Ada) keeps it; Bram asks for free weekends and fits
  // no week. Only his reason is said.
  const d = JSON.parse(payload);
  d.names['ba:jobdemand_freeweekends'] = 'Free weekends';
  d.candidates.find(c => c.id === 'c2').demands = ['ba:jobdemand_freeweekends'];
  d.staffing.find(r => r.key === G).current.list.push({d: 5, s: 0, f: 8, t: 20, p: 0}, {d: 6, s: 0, f: 8, t: 20, p: 0}, {d: 0, s: 0, f: 8, t: 20, p: 0});
  const page = await board(t, {data: JSON.stringify(d)});
  const box = page.locator('#hsQuick');
  await box.locator('[data-hq-role]').selectOption(CS);
  await box.locator('[data-hq-site]').selectOption(G);
  await box.locator('[data-hq-more]').click();
  assert.deepEqual((await quick(page)).picks, [['c2', null], ['c1', 36]]);
  const dlg = await quickConfirm(page);
  const text = await dlg.locator('.gw-body').textContent();
  assert.match(text, /Bram Castell: no open week fits Free weekends/);
  assert.match(text, /1 hire joins with no hours\./);
  assert.doesNotMatch(text, /Ada Brandt: |meet hours already set there/);
});

// --- one action, undone in one step (staffing revisit, 29 September 2026) --------------

test('with mod 0.4.0 Staff all sites is one call, the weeks no hire reaches with it, undone in one step', async (t) => {
  const page = await board(t, {link: ONE});
  // Sam stays at Corner (his reassign unticked): Corner's week has him on
  // Tuesday and its plan does not, a week no hire or move reaches.
  await page.locator(`[data-hr-move="${C}|${G}|${CS}"]`).uncheck();
  const body = await request(page);
  assert.deepEqual(body.sites.map(s => s.address.number), [10, 2, 4, 3, 88]);
  assert.deepEqual(body.sites[1].days, [{d: 1, shifts: [{f: 8, t: 20, employeeId: 'CCCCemployeeCCCCCCCCCCCC', itemInstanceId: 'REG-C'}]}]);
  // An older mod takes the same week only after the hire, on its own.
  assert.deepEqual(await page.evaluate(() => { const r = hrRequest(hrModel(), {one: false}); return [r.body.sites.map(s => s.address.number), r.rest.map(x => x.S.key)]; }),
    [[10, 4, 3, 88], [C]]);
  await page.evaluate(src => {
    window.answerFor = eval(src);
    window.hrAnswer = async (kind, body, o) => kind === 'undo'
      ? {status: 200, error: null, body: {ok: true, kind: 'hire', dryRun: false, undo: true, stamp: 's2',
          hired: [{candidateId: 'c2', name: 'Bram Castell', business: 'HART. Gifts', wage: 25, hoursLeft: 99}],
          moved: [], skipped: [], sites: [], wageAdded: -25, rows: []}}
      : {status: 200, error: null, body: window.answerFor(body, {dryRun: !!o.dryRun, extra: o.dryRun ? {} : {undoable: true}})};
  }, `(${answerFor.toString()})`);
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.match(await dlg.locator('.gw-where').textContent(), /^5 sites$/);
  assert.match(await dlg.locator('.gw-foot').textContent(), /Undo takes every hire, reassign and week of this back in one step\./);
  assert.doesNotMatch(await dlg.locator('.gw-body').textContent(), /only after the hire/);
  const corner = dlg.locator('.hr-dsite', {has: page.locator(`[data-hr-site="${C}"]`)});
  assert.match(await corner.textContent(), /week only/);
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'done');
  assert.deepEqual(await page.evaluate(() => window.hrWrites.map(w => [w.kind, w.dryRun])), [['hire', true], ['hire', false]]);
  // Each site says it is done; nothing says there is no undo.
  assert.equal(await dlg.locator('.hr-st.ok').count(), 5);
  assert.doesNotMatch(await dlg.locator('.gw-body').textContent(), /No undo/);
  assert.equal(await page.evaluate(() => pgOfFamily('hire').length), 1);
  assert.equal(await page.evaluate(() => hrUi.hired.ids.has('c2')), true);
  // One Undo takes all of it back.
  const undo = dlg.locator('.gw-foot [data-gw-b="undo"]');
  assert.equal(await undo.count(), 1);
  assert.match(await dlg.locator('.gw-foot').textContent(), /Undo takes it all back, until the game's next day\./);
  await undo.click();
  await phase(page, 'undone');
  assert.deepEqual(await page.evaluate(() => window.hrWrites.at(-1)), {kind: 'undo', body: {kind: 'hire'}, dryRun: false});
  assert.match(await dlg.textContent(), /Undone: every hire, reassign and week of that step is back as it was\./);
  // Whoever it hired is a candidate again, and its progress record goes.
  assert.equal(await page.evaluate(() => hrUi.hired.ids.has('c2')), false);
  assert.equal(await page.evaluate(() => pgOfFamily('hire').length), 0);
});

test('the company\'s first hire: the hint says it cannot be undone, and the done screen says why there is no Undo', async (t) => {
  const d = JSON.parse(payload);
  d.staff = Object.assign({}, d.staff, {total: 0});
  const page = await board(t, {data: JSON.stringify(d), link: ONE});
  await page.evaluate(src => {
    window.answerFor = eval(src);
    window.hrAnswer = async (kind, body, o) => ({status: 200, error: null,
      body: window.answerFor(body, {dryRun: !!o.dryRun, extra: o.dryRun ? {} : {undoable: false}})});
  }, `(${answerFor.toString()})`);
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  const foot = await dlg.locator('.gw-foot').textContent();
  assert.match(foot, /Your company's first hire cannot be undone: the game gives its one-time first-employee bonus with it\./);
  assert.doesNotMatch(foot, /Undo takes every hire/);
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'done');
  assert.equal(await dlg.locator('.gw-foot [data-gw-b="undo"]').count(), 0);
  assert.match(await dlg.locator('.gw-body').textContent(),
    /No Undo: this was your company's first hire, and the game's one-time first-employee bonus cannot be taken back\./);
});

test('with staff already employed, the hint promises the one-step Undo', async (t) => {
  const d = JSON.parse(payload);
  d.staff = Object.assign({}, d.staff, {total: 3});
  const page = await board(t, {data: JSON.stringify(d), link: ONE});
  await page.evaluate(src => { window.answerFor = eval(src);
    window.hrAnswer = async (kind, body, o) => ({status: 200, error: null, body: window.answerFor(body, {dryRun: !!o.dryRun})}); }, `(${answerFor.toString()})`);
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  assert.match(await page.locator('dialog.gw-dlg .gw-foot').textContent(), /Undo takes every hire, reassign and week of this back in one step\./);
});

test('an older mod: the weeks no hire reaches are written one by one after the hire, and each site says how it went', async (t) => {
  const page = await board(t);
  await page.locator(`[data-hr-move="${C}|${G}|${CS}"]`).uncheck();
  await page.evaluate(src => {
    window.answerFor = eval(src);
    window.hrAnswer = async (kind, body, o) => kind === 'schedule'
      ? {status: 409, error: 'changed', body: {error: 'changed', rows: []}}
      : {status: 200, error: null, body: window.answerFor(body, {dryRun: !!o.dryRun})};
  }, `(${answerFor.toString()})`);
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.match(await dlg.locator('.gw-body').textContent(),
    /This mod writes 1 more week after the hire, on its own, and cannot undo any of it\. A newer Big Copilot Link does it all in one step, with Undo\./);
  // An earlier schedule write's Undo, which the chained write will replace in the game.
  await page.evaluate(k => { gwUndoable.schedule = {spec: {kind: 'schedule', title: 'x', sites: [k]}, text: 'x', sub: '', whose: gwWhose(), at: 1, sites: [k]}; }, B);
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'done');
  assert.match(await dlg.textContent(), /1 more week is being written, one at a time\./);
  await page.waitForFunction(() => window.hrWrites.some(w => w.kind === 'schedule'));
  const sched = await page.evaluate(() => window.hrWrites.filter(w => w.kind === 'schedule'));
  assert.deepEqual(sched.map(w => [w.body.address, w.body.openAllHours, w.dryRun]), [[addr(C), false, false]]);
  // Corner's week, refused because the game moved on, says so; the rest are done.
  const corner = dlg.locator('.hr-dsite', {has: page.locator(`[data-hr-site="${C}"]`)});
  await corner.locator('.hr-st.no').waitFor();
  assert.match(await corner.locator('.hr-st').textContent(), /changed in the game: not written/);
  assert.equal(await dlg.locator('.hr-st.ok').count(), 4);
  assert.equal(await dlg.locator('.gw-foot [data-gw-b="undo"]').count(), 0);
  // The chained write replaced the game's schedule undo: the board's goes too.
  assert.equal(await page.evaluate(() => !!gwUndoable.schedule), false);
});

test('an older mod: two weeks after the hire are named as two, and a write with no answer says so', async (t) => {
  const page = await board(t);
  await page.locator(`[data-hr-move="${C}|${G}|${CS}"]`).uncheck();
  const out = await page.evaluate(() => {
    const r = hrRequest(hrModel(), {one: false});
    r.rest.push(r.rest[0]);
    hrLast = {req: r, one: false};
    return [r.rest.length, hrChainSay({error: 'uncertain'})];
  });
  assert.deepEqual(out, [2, 'no answer came: check this week in the game']);
  const text = await page.evaluate(() => { const el = document.createElement('div'); el.innerHTML = hrChainNote(2); return el.textContent; });
  assert.match(text, /This mod writes the other 2 weeks after the hire, one at a time, and cannot undo any of it\./);
});

test('an older mod, schedule only: no empty hire call, and every week it writes is counted', async (t) => {
  const page = await board(t);
  await page.locator(`[data-hr-move="${C}|${G}|${CS}"]`).uncheck();
  await page.evaluate(src => {
    window.answerFor = eval(src);
    window.hrAnswer = async (kind, body, o) => kind === 'schedule'
      ? {status: 200, error: null, body: {ok: true, kind: 'schedule', dryRun: false, stamp: 's', before: {shifts: 1, print: 'a'}, after: {shifts: 2, print: 'b'},
          removed: 1, added: 2, openedHours: false, leftWithout: [], warnings: [], siteError: null, rows: []}}
      : {status: 200, error: null, body: window.answerFor(body, {dryRun: !!o.dryRun})};
  }, `(${answerFor.toString()})`);
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.locator('[data-hr-mode="week"]').click();
  await page.waitForFunction(() => document.querySelector('dialog.gw-dlg').dataset.phase === 'ready'
    && /Write/.test(document.querySelector('dialog.gw-dlg .gw-foot [data-gw-b="apply"]').textContent));
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'done');
  await page.waitForFunction(() => window.hrWrites.filter(w => w.kind === 'schedule').length === 2);
  // The hire call would have carried nothing: it is never sent.
  assert.deepEqual(await page.evaluate(() => window.hrWrites.filter(w => w.kind === 'hire').map(w => w.dryRun)), [true], 'only the dry run of the first choice');
  assert.doesNotMatch(await dlg.textContent(), /Nothing changed in the game/);
  assert.match(await dlg.textContent(), /2 more weeks are being written, one at a time\./);
  await dlg.locator('.hr-st.wait').first().waitFor({state: 'detached'});
  assert.equal(await dlg.locator('.hr-st.ok').count(), 2);
});

test('with mod 0.4.0 the one call drops the board\'s schedule Undo for a site it writes, and an Undo the mod did not keep is not offered', async (t) => {
  const page = await board(t, {link: ONE});
  await page.evaluate(src => {
    window.answerFor = eval(src);
    window.hrAnswer = async (kind, body, o) => ({status: 200, error: null, body: window.answerFor(body, {dryRun: !!o.dryRun,
      extra: o.dryRun ? {} : {undoable: window.keep !== false}})});
  }, `(${answerFor.toString()})`);
  await page.evaluate(k => { gwUndoable.schedule = {spec: {kind: 'schedule', title: 'x'}, text: 'x', sub: '', whose: gwWhose(), at: 1, sites: [k]}; }, G);
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'done');
  assert.equal(await page.evaluate(() => !!gwUndoable.schedule), false, 'the game dropped it with the call');
  assert.equal(await dlg.locator('.gw-foot [data-gw-b="undo"]').count(), 1);
  await dlg.locator('[data-gw-close]').click();
  // The mod could not record what the undo needs: no Undo is offered.
  await page.evaluate(() => { window.keep = false; delete gwUndoable.hire; });
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'done');
  assert.equal(await dlg.locator('.gw-foot [data-gw-b="undo"]').count(), 0);
  await dlg.locator('[data-gw-close]').click();
  // A 0.4.0 answer that does not say `undoable` is not taken as undoable.
  await page.evaluate(() => { window.keep = undefined; delete gwUndoable.hire;
    const was = window.hrAnswer; window.hrAnswer = async (kind, body, o) => { const r = await was(kind, body, o); if(r.body) delete r.body.undoable; return r; }; });
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'done');
  assert.equal(await dlg.locator('.gw-foot [data-gw-b="undo"]').count(), 0);
});

test('an older mod: a chained week written drops the board\'s schedule Undo for a site the hire call never touched', async (t) => {
  const page = await board(t);
  await page.locator(`[data-hr-move="${C}|${G}|${CS}"]`).uncheck();
  await page.evaluate(src => {
    window.answerFor = eval(src);
    window.hrAnswer = async (kind, body, o) => kind === 'schedule'
      ? {status: 200, error: null, body: {ok: true, kind: 'schedule', dryRun: false, stamp: 's', before: {shifts: 1, print: 'a'}, after: {shifts: 2, print: 'b'},
          removed: 1, added: 2, openedHours: false, leftWithout: [], warnings: [], siteError: null, rows: []}}
      : {status: 200, error: null, body: window.answerFor(body, {dryRun: !!o.dryRun})};
  }, `(${answerFor.toString()})`);
  await page.evaluate(k => { gwUndoable.schedule = {spec: {kind: 'schedule', title: 'x'}, text: 'x', sub: '', whose: gwWhose(), at: 1, sites: [k]}; }, W);
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'done');
  // The hire call writes no week at the depot: its Undo stands until the chain writes.
  await page.waitForFunction(() => window.hrWrites.some(w => w.kind === 'schedule'));
  await page.locator('dialog.gw-dlg .hr-st.wait').first().waitFor({state: 'detached'});
  assert.equal(await page.evaluate(() => !!gwUndoable.schedule), false);
});

test('undoing the hire drops the board\'s schedule Undo for a site it touched, and keeps one elsewhere', async (t) => {
  const page = await board(t, {link: ONE});
  await page.evaluate(src => {
    window.answerFor = eval(src);
    window.hrAnswer = async (kind, body, o) => kind === 'undo'
      ? {status: 200, error: null, body: {ok: true, kind: 'hire', dryRun: false, undo: true, stamp: 's2', hired: [], moved: [], skipped: [], sites: [], wageAdded: 0, rows: []}}
      : {status: 200, error: null, body: window.answerFor(body, {dryRun: !!o.dryRun, extra: o.dryRun ? {} : {undoable: true}})};
  }, `(${answerFor.toString()})`);
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'done');
  // A schedule write at Bare after the call: the hire undo restores Bare's week.
  await page.evaluate(k => { gwUndoable.schedule = {spec: {kind: 'schedule', title: 'x'}, text: 'x', sub: '', whose: gwWhose(), at: 1, sites: [k]}; }, B);
  await dlg.locator('.gw-foot [data-gw-b="undo"]').click();
  await phase(page, 'undone');
  assert.equal(await page.evaluate(() => !!gwUndoable.schedule), false);
  // One at the depot, which the call never touched, stays.
  await page.evaluate(k => { gwUndoable.schedule = {spec: {kind: 'schedule', title: 'x'}, text: 'x', sub: '', whose: gwWhose(), at: 1, sites: [k]}; }, W);
  const kept = await page.evaluate(k => { hrUndoTouched(new Set([k])); return !!gwUndoable.schedule; }, G);
  assert.equal(kept, true);
});

test('Staff this site counts again when the shop is put on full cover or the factory sizing changes', async (t) => {
  const d = JSON.parse(payload);
  d.staffing.find(r => r.key === G).fullCover = {openNow: false, shifts: [{d: 1, s: 0, f: 0, t: 12, p: 0}, {d: 1, s: 0, f: 12, t: 24, p: null}]};
  d.hiring.sites.find(s => s.key === G).plans.full = {spare: [], bench: [], hireWeeks: [
    {skill: CS, hours: 12, days: 1, slots: [slot(1, 1, 12, 24, 'REG-G')]}]};
  const page = await board(t, {data: JSON.stringify(d), link: ONE});
  const count = () => page.evaluate(k => hrSitePeople(k), G);
  assert.equal(await count(), 2, 'Sam reassigned and Bram hired, on the demand plan');
  await page.evaluate(k => spPlanWrite(k, 'full'), G);
  assert.equal(await count(), 1, 'the 24/7 plan has one open week: Sam takes it');
  const works = () => page.evaluate(k => hrSitePeople(k), F);
  assert.equal(await works(), 2);
  await page.evaluate(() => { sizing = 'dem'; });
  assert.equal(await works(), 1);
});


test('the Undo strip takes back the call it was made for, whatever review opened since', async (t) => {
  const page = await board(t, {link: ONE});
  await page.evaluate(src => {
    window.answerFor = eval(src);
    window.hrAnswer = async (kind, body, o) => kind === 'undo'
      ? {status: 200, error: null, body: {ok: true, kind: 'hire', dryRun: false, undo: true, stamp: 's2', hired: [], moved: [], skipped: [], sites: [], wageAdded: 0, rows: []}}
      : {status: 200, error: null, body: window.answerFor(body, {dryRun: !!o.dryRun, extra: o.dryRun ? {} : {undoable: true}})};
  }, `(${answerFor.toString()})`);
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'done');
  assert.equal(await page.evaluate(() => hrUi.hired.ids.has('c2')), true);
  await dlg.locator('[data-gw-close]').click();
  // Another review opens and closes: hrLast is its now.
  await page.evaluate(() => { hrReview({scope: 'site', site: 'ba:street_industry#3'}); });
  await phase(page, 'ready');
  await page.locator('dialog.gw-dlg [data-gw-close]').click();
  await page.locator('#gwToast [data-gw-undo]').click();
  await phase(page, 'undone');
  assert.equal(await page.evaluate(() => hrUi.hired.ids.has('c2')), false, 'the first call\'s hires are candidates again');
});

test('the hire undo refused for the day says the undo only works on the day of the write', async (t) => {
  const page = await board(t, {link: ONE});
  const p = await page.evaluate(() => gwProblem({status: 409, error: 'changed', body: {error: 'changed', rows: [{scope: 'day', error: 'changed'}]}}));
  assert.match(p.text, /Undo only works on the game day of the write\./);
  assert.ok(!p.refresh, 'reading the game again would not help');
});

test('a Staffing block builds the Staff page\'s model once, and a mod that cannot hire keeps the MyEmployees step', async (t) => {
  const d = JSON.parse(payload);
  d.staffing.find(r => r.key === G).addPeople = {assign: [], hire: [{skill: CS, role: 'Customer Service', people: 2}], people: 2, hoursUncovered: 60};
  const data = JSON.stringify(d);
  const page = await board(t, {link: ONE, data});
  const calls = await page.evaluate(([G]) => {
    const real = hrModel;
    let n = 0;
    window.hrModel = () => { n++; return real(); };
    openRoute('staffing/schedules', {pick: G});
    window.hrModel = real;
    return n;
  }, [G]);
  assert.ok(calls <= 1, `hrModel built ${calls} times`);
  const old = await board(t, {link: {writes: ['uniforms', 'imports', 'schedule'], day: 34, hour: 14}, data});
  await old.evaluate(([G]) => openRoute('staffing/schedules', {pick: G}), [G]);
  assert.equal(await old.locator('#schDetail #sp-roster .sp-add').count(), 1);
  assert.equal(await old.locator('#schDetail #sp-roster [data-hr-staff]').count(), 0);
});

test('shops that open no hour are named in one sentence, in the plural where there are several', async (t) => {
  const page = await board(t);
  const text = await page.evaluate(([G, C]) => {
    D.hiring.sites.filter(s => s.key === G || s.key === C).forEach(s => { s.noHours = true; });
    const el = document.createElement('div'); el.innerHTML = hrNoHoursHtml(); return el.textContent;
  }, [G, C]);
  assert.equal(text, 'HART. Gifts, HART. Corner open no hour in the game: set their opening hours first.');
  const src = await page.evaluate(() => hrNoHoursHtml.toString());
  assert.match(src, /tt\("co\.hire\.nohours\.shut"/);
});

test('hire only and schedule only: the pick changes what is sent and the verb of the confirm', async (t) => {
  const page = await board(t, {link: ONE});
  await answering(page, []);
  await page.locator(REVIEW).click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  const last = () => page.evaluate(() => window.hrWrites.at(-1).body);
  const apply = dlg.locator('.gw-foot [data-gw-b="apply"]');
  assert.equal(await apply.textContent(), 'Staff 4 sites');
  await dlg.locator('[data-hr-mode="hire"]').click();
  await page.waitForFunction(() => document.querySelector('dialog.gw-dlg').dataset.phase === 'ready'
    && window.hrWrites.at(-1).body.sites.every(s => s.days === null));
  let body = await last();
  assert.deepEqual([body.hires.length, body.moves.length], [7, 2]);
  assert.equal(await apply.textContent(), 'Hire 7, reassign 2');
  assert.equal(await dlg.locator('[data-hr-mode][aria-pressed="true"]').textContent(), 'Hire only');
  assert.deepEqual(await dlg.locator('.gw-tile .gw-lab').allTextContents(), ['Hire', 'Reassign', 'Added wages']);
  await dlg.locator('[data-hr-mode="week"]').click();
  await page.waitForFunction(() => document.querySelector('dialog.gw-dlg').dataset.phase === 'ready' && !window.hrWrites.at(-1).body.hires.length);
  body = await last();
  // The weeks alone: Corner (Sam's Tuesday is not in its plan) and Works.
  assert.deepEqual(body.moves, []);
  assert.deepEqual(body.sites.map(s => s.address.number), [2, 3]);
  assert.equal(await apply.textContent(), 'Write 2 weeks');
});

test('Staff this site on a shop\'s Staffing: its hires and reassigns and its week, in place of the MyEmployees step', async (t) => {
  const d = JSON.parse(payload);
  // Gifts waits on two people, as its plan says.
  d.staffing.find(r => r.key === G).addPeople = {assign: [], hire: [{skill: CS, role: 'Customer Service', people: 2}], people: 2, hoursUncovered: 60};
  const data = JSON.stringify(d);
  const page = await board(t, {link: ONE, data});
  await answering(page, []);
  await page.evaluate(([G]) => openRoute('staffing/schedules', {pick: G}), [G]);
  const block = page.locator('#schDetail #sp-roster');
  const staff = block.locator('[data-gw="hire"][data-hr-staff]');
  assert.equal(await staff.count(), 1);
  assert.match(await staff.textContent(), /Staff this site\s*2/);
  // The step that sent the player to MyEmployees is gone while the button does it.
  assert.equal(await block.locator('.sp-add').count(), 0);
  await staff.click();
  await phase(page, 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.equal(await dlg.locator('h2').textContent(), 'Staff HART. Gifts');
  const body = await page.evaluate(() => window.hrWrites.at(-1).body);
  assert.deepEqual(body.moves, [{employeeId: 'SPARE1', from: addr(C), to: addr(G)}]);
  assert.deepEqual(body.hires.map(h => h.candidateId), ['c2']);
  assert.deepEqual(body.sites.map(s => s.address.number), [10]);
  assert.equal(await dlg.locator('.gw-foot [data-gw-b="apply"]').textContent(), 'Hire and schedule');
  // Not linked, the step stays: nothing on the board writes.
  const off = await board(t, {link: null, data});
  await off.evaluate(([G]) => openRoute('staffing/schedules', {pick: G}), [G]);
  assert.equal(await off.locator('#schDetail #sp-roster .sp-add').count(), 1);
  assert.equal(await off.locator('#schDetail #sp-roster [data-hr-staff]').count(), 0);
});

test('full cover picked on a shop: the Staff page hires into its 24/7 week, and only that site\'s write opens it', async (t) => {
  const d = JSON.parse(payload);
  // Gifts on full cover: Ana 0 to 12 on Monday, 12 to 24 open.
  const gifts = d.staffing.find(r => r.key === G);
  gifts.fullCover = {openNow: false, shifts: [{d: 1, s: 0, f: 0, t: 12, p: 0}, {d: 1, s: 0, f: 12, t: 24, p: null}]};
  d.hiring.sites.find(s => s.key === G).plans.full = {spare: [], bench: [], hireWeeks: [
    {skill: CS, hours: 12, days: 1, slots: [slot(1, 1, 12, 24, 'REG-G')]}]};
  const page = await board(t, {data: JSON.stringify(d), link: ONE});
  await page.evaluate(([G]) => spPlanWrite(G, 'full'), [G]);
  const m = await model(page);
  // Sam's reassign takes the one open week of the 24/7 plan.
  assert.deepEqual(m.weeks[0], [G, 'full', ['move:SPARE1']]);
  const body = await request(page);
  const gs = body.sites.find(s => s.address.number === 10);
  assert.equal(gs.openAllHours, true);
  assert.deepEqual(gs.days, [{d: 1, shifts: [{f: 0, t: 12, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'},
    {f: 12, t: 24, employeeId: 'SPARE1', itemInstanceId: 'REG-G'}]}]);
  // Every other site keeps its hours.
  assert.ok(body.sites.filter(s => s.address.number !== 10).every(s => s.openAllHours === false));
});

test('an entry the game holds past 12 hours goes back as the same hours in pieces the grid takes, and is no change on its own', async (t) => {
  const d = JSON.parse(payload);
  // Works: Dee drives 0 to 16 on Tuesday, as an older build could leave it.
  const fac = d.factoryStaffing.cap[0];
  fac.stations.push({id: 'VAN-1', name: null, skill: null});
  fac.people.push({id: 'DRV1', name: 'Dee Driver'});
  fac.current = {shifts: 2, fragments: 0, list: [{d: 1, s: 0, f: 0, t: 12, p: 0}, {d: 2, s: 1, f: 0, t: 16, p: 1}]};
  const page = await board(t, {data: JSON.stringify(d), link: ONE});
  const works = (await request(page)).sites.find(s => s.address.number === 3);
  assert.deepEqual(works.days.find(x => x.d === 2).shifts.filter(s => s.employeeId === 'DRV1'),
    [{f: 0, t: 12, employeeId: 'DRV1', itemInstanceId: 'VAN-1'}, {f: 12, t: 16, employeeId: 'DRV1', itemInstanceId: 'VAN-1'}]);
  // Its week with nobody hired: the same as the game's, entry for entry but the cut.
  const same = await page.evaluate(k => {
    const S = hrModel().sites.find(x => x.key === k);
    return hrDiffers(S.row, hrWeek(S, [], new Set(), new Set(), {hours: 0}), new Set());
  }, F);
  assert.equal(same, false, 'Fay on Monday and Dee as she is: the cut alone is no change');
});
