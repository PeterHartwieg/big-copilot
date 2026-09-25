// Company > Staff: mass hire (docs/staff-hire-plan.md, section 3). The board is
// the real page from render(), its payload the real extract() of the synthetic
// company in tests/es3_fixture.py with a hand-made hiring overlay in the shape
// of the plan's section 2: three shops (one new, one with a spare person), a
// factory, an office, a headquarters and a warehouse, and invented candidates.
// Its source is a stub that keeps the board's watch() callbacks and answers
// the game link's health and writes as each test says. Never a real save.
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
    'ba:jobdemand_nonights': 'No night shifts'});
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
    people: {SPARE1: {name: 'Sam Spare', skill: CS, level: 66, wage: 21}, BENCH1: {name: 'Bo Bench', skill: CLEAN, level: 55, wage: 17}},
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
  const who = x => !x.who ? null : x.who.type === 'move' ? `move:${x.who.m.id}` : `hire:${x.who.c.id}${x.who.misfit.length ? '!' : ''}`;
  return {
    moves: m.moves.map(x => ({id: x.id, from: x.from ? x.from.key : null, to: x.to.key, fixed: !!x.fixed, off: !!x.off})),
    weeks: m.sites.map(S => [S.key, S.variant, S.weeks.map(who)]),
    roles: m.roles.map(r => ({skill: r.skill, short: r.short, pass: r.pass, picked: r.picked.map(c => c.id)})),
    overs: m.overs.map(o => [o.c.id, o.S.key]),
  };
});
const request = page => page.evaluate(() => hrRequest(hrModel()).body);

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

  // Unticking the move returns its week to hiring: Bram now takes Gifts'
  // first week, and Cleo finds a week at Bare without a weekend.
  await page.locator(`[data-hr-move="${C}|${G}|${CS}"]`).uncheck();
  const off = await model(page);
  assert.equal(off.moves[1].off, true);
  assert.deepEqual(off.weeks.slice(0, 3), [
    [G, 'demand', ['hire:c2', 'hire:c1']],
    [C, 'demand', []],
    [B, 'full', ['hire:c3', 'hire:c4', 'hire:k1']],
  ]);
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

test('filters: company-wide, and a role of its own in the drawer', async (t) => {
  const page = await board(t);
  // Leaving out anyone who asks for free weekends: Cleo goes, Dario takes
  // her place.
  await page.locator('#hrNeeds > .hr-filters [data-hr-dem="ba:jobdemand_freeweekends"]').click();
  let m = await model(page);
  assert.deepEqual(m.roles[0].picked, ['c2', 'c1', 'c4']);
  assert.equal(await page.locator('#hrNeeds > .hr-filters [data-hr-dem="ba:jobdemand_freeweekends"]').getAttribute('aria-pressed'), 'true');
  // Kept per character across a reload of the page's state.
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ba_dash_hire:default')).company.ex),
    ['ba:jobdemand_freeweekends']);

  // Cleaning gets its own filters: skill at least 90 leaves Ines (88) and
  // Hollis (70) out, so Cleaning is short; Customer Service is untouched.
  await page.locator(`[data-hr-open="${CLEAN}"]`).click();
  const drawer = page.locator(`[data-hr-drawer="${CLEAN}"]`);
  await drawer.locator('[data-hr-scope="own"]').click();
  await page.locator(`[data-hr-drawer="${CLEAN}"] [data-hr-min]`).fill('90');
  m = await model(page);
  assert.deepEqual(m.roles.find(r => r.skill === CLEAN), {skill: CLEAN, short: 1, pass: 0, picked: []});
  assert.deepEqual(m.roles[0].picked, ['c2', 'c1', 'c4']);
  const line = page.locator(`.hr-need[data-hr-role="${CLEAN}"]`);
  assert.match(await line.textContent(), /1 short/);
  assert.equal(await line.locator('.hr-pool u').count(), 1, 'the short part is hatched');
  // Back to every role: the company's filters again.
  await page.locator(`[data-hr-drawer="${CLEAN}"] [data-hr-scope="all"]`).click();
  assert.deepEqual((await model(page)).roles.find(r => r.skill === CLEAN).picked, ['k1']);
});

test("a demand the site does not meet warns and still picks", async (t) => {
  const d = JSON.parse(payload);
  // Nobody better than Dario (coffee machine: not at Gifts, at Bare) and
  // Edda (gold insurance: no site has it) for Gifts.
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
  const chips = await page.$$eval(`[data-hr-drawer="${CS}"] tr.hr-picked .hr-d`, els => els.map(e => `${e.textContent}:${e.className}`));
  // Greta, at Bare, asks for no nights and gets 0 to 12: her hours break it.
  assert.deepEqual(chips, ['Coffee Machine:hr-d warn', 'Gold Health Insurance:hr-d no', 'No night shifts:hr-d warn']);
});

test('short roles, and ticking one more over the plan', async (t) => {
  const page = await board(t);
  await page.locator('#hrNeeds > .hr-filters [data-hr-min]').fill('90');
  let m = await model(page);
  const cs = m.roles[0];
  assert.deepEqual([cs.picked, cs.short], [['c2', 'c1'], 1]);
  assert.match(await page.locator('#hrTiles').textContent(), /1 Customer Service, 1 Factory Worker, 1 Cleaning short/);
  await page.locator('#hrNeeds > .hr-filters [data-hr-min]').fill('0');
  // Unticking Bram lets the next best in; ticking Greta, who nobody needs, is
  // over the plan: at the first site with a week in her role, no hours.
  await page.locator(`[data-hr-open="${CS}"]`).click();
  await page.locator('[data-hr-pick="c2"]').uncheck();
  m = await model(page);
  assert.deepEqual(m.roles[0].picked, ['c1', 'c3', 'c4']);
  await page.locator('[data-hr-pick="c7"]').check();
  m = await model(page);
  assert.deepEqual(m.overs, [['c7', G]]);
  assert.match(await page.locator('[data-hr-cand="c7"]').textContent(), /over the plan/);
  const body = await request(page);
  assert.deepEqual(body.hires.find(h => h.candidateId === 'c7'), {candidateId: 'c7', address: addr(G), expect: {wage: 15}, seenHoursLeft: 100});
  const gifts = body.sites.find(s => s.address.number === 10);
  assert.ok(!gifts.days.some(d => d.shifts.some(s => s.employeeId === 'c7')), 'no hours over the plan');
});

test('the request: a shop on its plan and on full cover, a factory, an office, a hand pick and a move', async (t) => {
  const page = await board(t);
  // Mara, picked by hand for the headquarters from its Candidates table.
  await page.locator(`#hrFound [data-hr-browse="${HRM}"]`).click();
  await page.locator('#hrBrowse [data-hr-pick="h1"]').check();
  const body = await request(page);
  assert.deepEqual(body.moves, [
    {employeeId: 'BENCH1', from: null, to: addr(B)},
    {employeeId: 'SPARE1', from: addr(C), to: addr(G)},
  ]);
  assert.deepEqual(body.hires.map(h => [h.candidateId, h.address.number, h.expect.wage]),
    [['c2', 10, 25], ['c1', 4, 30], ['c3', 4, 20], ['k1', 4, 16], ['f1', 3, 28], ['f2', 3, 26], ['l1', 88, 50], ['h1', 1, 40]]);
  const site = n => body.sites.find(s => s.address.number === n);
  assert.deepEqual(body.sites.map(s => s.address.number), [10, 2, 4, 3, 88, 1]);
  // Gifts, on its demand plan: Ana as planned, Sam moved in, Bram hired.
  assert.deepEqual(site(10), {address: addr(G), expect: '9c98d93a', openAllHours: false, days: [
    {d: 0, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]},
    {d: 1, shifts: [{f: 8, t: 20, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
    {d: 2, shifts: [{f: 8, t: 20, employeeId: 'AAAAemployeeAAAAAAAAAAAA', itemInstanceId: 'REG-G'}]},
    {d: 3, shifts: [{f: 8, t: 20, employeeId: 'SPARE1', itemInstanceId: 'REG-G'}]},
    {d: 4, shifts: [{f: 8, t: 20, employeeId: 'SPARE1', itemInstanceId: 'REG-G'}]},
    {d: 5, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]},
    {d: 6, shifts: [{f: 8, t: 20, employeeId: 'c2', itemInstanceId: 'REG-G'}]}]});
  // Corner, the move's source: Sam has hours there now, so its week is
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
  // The headquarters: assigned only.
  assert.deepEqual(site(1), {address: addr(Q), expect: null, days: null});
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

test('Review: the dry run, who goes where, one confirm with no undo, and a partial result', async (t) => {
  const page = await board(t);
  // The dry run takes everyone; by the confirm, Ada has left the list.
  await page.evaluate(src => { window.answerFor = eval(src); }, `(${answerFor.toString()})`);
  await page.evaluate(() => {
    window.hrAnswer = async (kind, body, o) => ({status: 200, error: null,
      body: window.answerFor(body, {dryRun: !!o.dryRun, gone: o.dryRun ? [] : ['c1']})});
  });
  const review = page.locator('#hrBar [data-gw="hire"]');
  assert.equal(await review.getAttribute('aria-disabled'), null);
  await review.click();
  const dlg = page.locator('dialog.gw-dlg.hr-wide');
  await page.waitForFunction(() => document.querySelector('dialog.gw-dlg')?.dataset.phase === 'ready');
  assert.equal(await dlg.locator('h2').textContent(), 'Hire 7, move 2');
  assert.match(await dlg.locator('.gw-verdict').textContent(), /The game can take all of them/);
  // One row a site touched, in list order.
  assert.deepEqual(await dlg.locator('.hr-dhead .s').allTextContents(), ['HART. Gifts', 'HART. Corner', 'HART. Bare', 'HART. Works', 'HART. Law']);
  assert.match(await dlg.locator('.gw-body').textContent(), /The week is replaced at/);
  // A site opens for its people and their days.
  await dlg.locator(`[data-hr-site="${G}"]`).click();
  const people = await dlg.locator('.hr-dsite.open .hr-dp:not(.hd) .who b').allTextContents();
  assert.deepEqual(people, ['Bram Castell', 'Sam Spare']);
  assert.equal(await dlg.locator('.hr-dsite.open .hr-dp:not(.hd)').first().locator('.hr-wk i.on').count(), 3);
  const apply = dlg.locator('.gw-foot [data-gw-b="apply"]');
  assert.equal(await apply.textContent(), 'Hire 7, move 2');
  await apply.click();
  await page.waitForFunction(() => document.querySelector('dialog.gw-dlg')?.dataset.phase === 'done');
  const writes = await page.evaluate(() => window.hrWrites.map(w => [w.kind, w.dryRun]));
  assert.deepEqual(writes, [['hire', true], ['hire', false]]);
  // No Undo, and where to let someone go instead; Ada left the list before
  // the game reached her.
  assert.equal(await dlg.locator('[data-gw-b="undo"]').count(), 0);
  const text = await dlg.locator('.gw-body').textContent();
  assert.match(text, /No undo\. To let someone go, use MyEmployees in the game\./);
  assert.match(text, /1 candidate left the headhunter's list/);
  assert.equal(await dlg.locator('.gw-body .hr-struck', {hasText: 'Ada Brandt'}).count() > 0, true);
  const more = dlg.locator('[data-hr-more]');
  assert.equal(await more.textContent(), 'Pick 1 more');
  assert.equal(await more.isDisabled(), true, 'waits for the board to read the game');
  assert.equal(await page.locator('#gwToast').count(), 0, 'no undo strip');
  // The board reads the game again: Ada is gone from the candidates, and
  // "Pick 1 more" opens the review for Bare's week alone.
  await page.evaluate(p => {
    const d = JSON.parse(p);
    d.candidates = d.candidates.filter(c => c.id !== 'c1');
    window.calmWatch.changed(d);
  }, payload);
  assert.equal(await more.isDisabled(), false);
  await more.click();
  await page.waitForFunction(() => document.querySelector('dialog.gw-dlg')?.dataset.phase === 'ready');
  const last = await page.evaluate(() => window.hrWrites.at(-1).body);
  assert.deepEqual(last.moves, []);
  assert.deepEqual(last.hires.map(h => [h.candidateId, h.address.number]), [['c3', 4]]);
});

test('refusals: a row the game refuses, and MyEmployees open', async (t) => {
  const page = await board(t);
  await page.evaluate(() => {
    window.hrAnswer = async (kind, body) => ({status: 200, error: null, body: {ok: false, kind: 'hire', dryRun: true,
      rows: [{scope: 'move', id: 'SPARE1', error: 'in_training'}], sites: [], hired: [], moved: [], skipped: []}});
  });
  await page.locator('#hrBar [data-gw="hire"]').click();
  await page.waitForFunction(() => document.querySelector('dialog.gw-dlg')?.dataset.phase === 'ready');
  const dlg = page.locator('dialog.gw-dlg');
  assert.match(await dlg.locator('.gw-no').first().textContent(), /In training/);
  assert.match(await dlg.locator('.gw-no .gw-chip').first().textContent(), /Sam Spare/);
  assert.equal(await dlg.locator('[data-gw-b="apply"]').isDisabled(), true);
  await dlg.locator('[data-gw-close]').click();

  await page.evaluate(() => {
    window.hrAnswer = async () => ({status: 200, error: null, body: {ok: false, kind: 'hire', dryRun: true, blocked: 'myemployees',
      rows: [], sites: [], hired: [], moved: [], skipped: []}});
  });
  await page.locator('#hrBar [data-gw="hire"]').click();
  await page.waitForFunction(() => document.querySelector('dialog.gw-dlg')?.dataset.phase === 'ready');
  assert.match(await dlg.locator('.gw-verdict').textContent(), /Close MyEmployees in the game/);
  assert.match(await dlg.textContent(), /Close the MyEmployees app on your phone in the game, then try again\./);
  assert.equal(await dlg.locator('[data-gw-b="retry"]').count(), 1, 'try again once it is closed');

  // The same, refused on the confirm (409 cannot_write).
  await dlg.locator('[data-gw-close]').click();
  await page.evaluate(src => { window.answerFor = eval(src); }, `(${answerFor.toString()})`);
  await page.evaluate(() => {
    window.hrAnswer = async (kind, body, o) => o.dryRun ? {status: 200, error: null, body: window.answerFor(body)}
      : {status: 409, error: 'cannot_write', body: {error: 'cannot_write', reason: 'myemployees'}};
  });
  await page.locator('#hrBar [data-gw="hire"]').click();
  await page.waitForFunction(() => document.querySelector('dialog.gw-dlg')?.dataset.phase === 'ready');
  await dlg.locator('[data-gw-b="apply"]').click();
  await page.waitForFunction(() => document.querySelector('dialog.gw-dlg')?.dataset.phase === 'failed');
  assert.match(await dlg.textContent(), /MyEmployees is open in the game/);
});

test('not linked: everything works from the save, Review is off with how to link', async (t) => {
  const page = await board(t, {link: null});
  assert.match(await page.locator('#secStaff .hr-linked').textContent(), /Save file/);
  assert.match(await page.locator('#secStaff .hr-nolink').textContent(), /Hiring goes through the game/);
  assert.equal(await page.locator('#hrBar [data-gw="hire"]').count(), 0);
  assert.equal(await page.locator('#hrBar .gw-btn.off').getAttribute('aria-disabled'), 'true');
  assert.match(await page.locator('#hrTiles').textContent(), /leave the list within a day, as of the save/);
  // The picks still work.
  await page.locator(`[data-hr-move="${C}|${G}|${CS}"]`).uncheck();
  assert.equal((await model(page)).moves[1].off, true);
});

test('Review waits for a mod that can hire', async (t) => {
  const page = await board(t, {link: {writes: ['uniforms', 'imports', 'schedule'], day: 34, hour: 14}});
  const review = page.locator('#hrBar [data-gw="hire"]');
  assert.equal(await review.getAttribute('aria-disabled'), 'true');
  assert.match(await review.getAttribute('data-tip'), /Update the Big Copilot Link mod/);
  assert.match(await page.locator('#hrBar .gw-hint').textContent(), /0\.3\.0/);
  await review.dispatchEvent('click');
  assert.equal(await page.locator('dialog.gw-dlg').count(), 0);
});

test('at phone width the page has no sideways scroll', async (t) => {
  const page = await board(t, {viewport: {width: 375, height: 812}});
  await page.locator(`[data-hr-open="${CS}"]`).click();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(wide <= 0, `the page scrolls sideways by ${wide}px`);
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
  assert.match(await page.locator('#hrTiles').textContent(), /14\s*found/);
});

test('old Payroll links land on Staff, with Payroll at its foot', async (t) => {
  const page = await board(t, {open: false});
  await page.evaluate(() => openHash('payroll'));
  assert.equal(await page.evaluate(() => `${page}/${sub.company}`), 'company/staff');
  assert.match(await page.locator('#hrPayroll .sechead h2').textContent(), /Payroll/);
  await page.evaluate(() => { showPage('today'); reveal('secPayroll'); });
  assert.equal(await page.evaluate(() => `${page}/${sub.company}`), 'company/staff');
});
