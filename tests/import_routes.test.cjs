// Supply's views (the redesign's chunk 2: Changes, Imports, Deliveries,
// Production, Goods flow) and the one change checklist read Python's one
// verdict per supply fact (supplyFact); the board works none out of its own.
// Shops, warehouses and factories are each view's scope.
// The board tests run on the synthetic R8 fixture (tests/fixtures/r8_supply.json).
// The parity tests render real extraction from the Python test builders and
// hold the tabs and the checklist to the facts that extraction sends.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
// The line tips capitalize their first word; rendered text omits emphasis tags.
const textRe = (key, params = {}, options = {}) => { const {cap, ...opts} = options, re = enRe(key, params, opts); const src = re.source.replace(/<[^>]*>/g, ''); return new RegExp(cap ? src.replace(/^(\^?)(.)/, (_, a, b) => a + b.toUpperCase()) : src, re.flags); };
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
function python(code) {
  const result = spawnSync(process.env.PYTHON || 'python', ['-c', code],
    {cwd: root, maxBuffer: 4 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout.toString();
}
const FIXTURE = path.join(root, 'tests', 'fixtures', 'r8_supply.json');
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
let browser, html;
before(async () => {
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(root, 'web/index.html'), 'utf8')
    : python('from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))');
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

/* The Supply page drawn from `data` under a basis, every view drawn. `which`
   is Needs a change or Everything; `names` are recipes named in this browser. */
async function board(data, {mode = 'cap', names = null, which = 'all', tab = 'imports'} = {}){
  require('./_payload_contract.cjs').assertPayloadShape(data, 'import_routes');
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
  await page.route('https://**', route => route.abort());
  await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
  await page.goto('http://board.test/');
  await page.evaluate(([data, mode, names, which, tab]) => {
    if(names) localStorage.setItem('ba_line_names', JSON.stringify(names));
    D = data; sizing = mode; sbWhich = which; sbMode.imports = sbMode.deliveries = sbMode.production = which;
    supplySort = {}; sbSelOff = true; sbSel = null; sub.supply = tab;
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    drawSupplyStrip(); drawChangesView(); drawImportsView(); drawDeliveriesView(); drawProductionView(); wireAll();
  }, [data, mode, names, which, tab]);
  return page;
}
/* Every view drawn again, as a refresh would. */
const redraw = page => page.evaluate(() => { drawSupplyStrip(); drawChangesView(); drawImportsView(); drawDeliveriesView(); drawProductionView(); wireAll(); });
/* How far along Changes is, as its road says it to a screen reader: "3 of 10
   recorded or applied" (the words on screen went, Peter's testing A9). */
const counted = page => page.$eval('#sbcTop .sb-road', el => el.getAttribute('aria-label'));
const actions = page => page.evaluate(() => sbData().rows.map(a =>
  ({kind: a.kind, item: a.item, current: a.current, proposed: a.proposed, tight: !!a.tight, paused: !!a.paused,
    ...(a.lower ? {lower: true} : {})})));
/* A tab's rows by product: every cell's text, the Set to box, the tick. */
const rows = (page, sec) => page.$$eval(`#${sec} tr[data-slug]`, trs => trs.map(r => ({
  s: r.dataset.s, slug: r.dataset.slug,
  // Each text node apart, the way the cell reads.
  cells: [...r.cells].map(c => {
    const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT), bits = [];
    while(w.nextNode()) bits.push(w.currentNode.textContent);
    return bits.join(' ').replace(/\s+/g, ' ').trim();
  }),
  box: r.querySelector('input.imp-in')?.value ?? null,
  tick: !!r.querySelector('.sb-tick'),
  // The status word's sentence is its tip (declutter G4).
  tip: r.querySelector('.st .sb-v')?.dataset.tip || '',
})));
const bySlug = async (page, sec, s) => Object.fromEntries((await rows(page, sec))
  .filter(r => s === undefined || r.s === String(s)).map(r => [r.slug, r]));
/* A depot's lines on both the views that list them: its imports on Imports,
   its deliveries (a route-fed top-up, a wholesale contract, idle stock) on
   Deliveries. */
const depot = async (page, s) => ({...await bySlug(page, 'secDeliveries', s), ...await bySlug(page, 'secImports', s)});
/* An element's text the way it reads: each text node apart. */
const text = (page, sel) => page.$eval(sel, el => {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), bits = [];
  while(w.nextNode()) bits.push(w.currentNode.textContent);
  return bits.join(' ').replace(/\s+/g, ' ').trim();
});
/* A view's summary: its tab's tip, not a line under the controls (declutter round 2). */
const tabTip = (page, view) => page.evaluate(v => viewTips[`supply/${v}`] || '', view);
/* Warehouses columns after the tick: Product, On hand, Draw, Busiest, Cover, Order / top-up, Uses / week, Status. */
const WH = {item: 1, order: 6, uses: 7, status: 8};

test('Imports and Deliveries list every depot line, with the import lines\' Set to boxes and figures', async () => {
  const page = await board(fixture());
  try {
    const hub = await depot(page, 0);
    assert.deepEqual(Object.keys(hub).sort(), ['bags', 'butter', 'coffee', 'flour', 'milk', 'soda', 'sugar']);
    // Soda Can is held at the hub but imported by nobody: no box.
    assert.deepEqual(Object.values(hub).filter(r => r.box !== null).map(r => r.slug).sort(),
      ['bags', 'butter', 'coffee', 'flour', 'milk', 'sugar']);
    // The lines' 11,200 and the other sites' 2,800; 24/7 puts the margin on the sites' part only.
    assert.match(hub.flour.cells[WH.uses], /^14,000$/);
    assert.equal(hub.flour.box, '14420');
    // The arrow to the box says raise: no chip says it again (declutter U12).
    // Pins the wording: the old raise label stays absent beside the Set to box.
    assert.doesNotMatch(hub.flour.cells[WH.order], /raise/);
    assert.match(hub.sugar.cells[WH.order], enRe("sb.imp.resume"));
    assert.equal(hub.sugar.box, '2800', 'a paused contract resumes as it stands');
    assert.match(hub.bags.cells[WH.status], enRe("sb.word.idle", {}, {anchor: "start"}));
    assert.match(hub.butter.cells[WH.status], enRe("sb.word.new", {}, {anchor: "start"}));
    assert.match(hub.coffee.cells[WH.order], enRe("sb.imp.couldLower"));
    assert.match(hub.soda.tip, textRe("sb.wh.notRouted", {sites: en("sb.wh.perDay", {site: "Garden Gym", n: 53})}, {cap: true}));
    // Uses / week carries Python's split on hover.
    const tip = await page.locator('#secImports tr[data-slug="coffee"] .sb-uses').getAttribute('data-tip');
    assert.match(tip, enRe("sb.parts.shops", {n: 420}));
    // The verdict counts only what no tab count or status column says (declutter U6).
    assert.equal(await page.locator('#secImports .sb-verdict').count(), 0, 'no summary line under the controls');
    const verdict = await tabTip(page, 'imports');
    assert.match(verdict, enRe("sb.wh.room"));
    // Pins the wording: retired wording must not come back.
    assert.doesNotMatch(verdict, /inside the margin|fall short/);
    // Soda is held and imported by nobody: a delivery, on Deliveries, not an import.
    assert.ok(!(await bySlug(page, 'secImports', 0)).soda);
    assert.match(await tabTip(page, 'deliveries'), enRe("sb.wh.idle.n", {n: 2}));
    // The second-tier depot, fed each morning from the factory, is on Deliveries.
    const cd = await bySlug(page, 'secDeliveries', 5);
    assert.match(cd.cake.cells[WH.order], new RegExp("^200 290 " + enRe("sb.unit.day").source + " " + enRe("sb.where.plan", {site: "Bakery Factory"}).source + "$"));
    assert.match(cd.cake.cells[WH.status], enRe("sb.word.short", {}, {anchor: "start"}));
    assert.ok(cd.cake.tick);
  } finally { await page.close(); }
});

test('every change on the checklist is a fact\'s figure, and sits on its task view', async () => {
  const page = await board(fixture());
  try {
    assert.deepEqual(await actions(page), [
      {kind: 'Weekly imports', item: 'Flour', current: 14000, proposed: 14420, tight: true, paused: false},
      {kind: 'Weekly imports', item: 'Sugar', current: null, proposed: null, tight: false, paused: true},
      // 24/7 sizes a line at capacity with no margin: a day of the machines.
      {kind: 'Factory daily top-ups', item: 'Flour', current: 1400, proposed: 1600, tight: false, paused: false},
      {kind: 'Check the delivery route', item: 'Milk', current: null, proposed: null, tight: false, paused: false},
      // Paper Bag topped up far above its sales: the lower target, a change to lower.
      {kind: 'Shop daily top-ups', item: 'Paper Bag', current: 3000, proposed: 120, tight: false, paused: false, lower: true},
      // The gym's shelf is on no plan; the hub that holds its soda could send it.
      {kind: 'Shop daily top-ups', item: 'Soda Can', current: 0, proposed: 70, tight: false, paused: false},
      {kind: 'Shop daily top-ups', item: 'Paper Bag', current: 1400, proposed: 30, tight: false, paused: false, lower: true},
      {kind: 'Shop daily top-ups', item: 'Paper Bag', current: 1500, proposed: 30, tight: false, paused: false, lower: true},
      {kind: 'Depot daily top-ups', item: 'Cake', current: 200, proposed: 290, tight: false, paused: false},
      // The cake line is staffed 12 of the 24 hours full production plans it for.
      {kind: 'Factory run hours', item: 'Cake', current: 12, proposed: 24, tight: false, paused: false},
    ]);
    const views = await page.evaluate(() => Object.fromEntries(Object.entries(sbData().byView).map(([t, r]) => [t, r.length])));
    assert.deepEqual(views, {imports: 2, deliveries: 5, production: 3});
    assert.match(await page.locator('#secProduction').textContent(), new RegExp("1,400\\s*1,600\\s*" + enRe("sb.unit.day").source));
    // Every change has its tick on Changes, and on its view; none is left to the "Other changes" list.
    assert.equal(await page.locator('#secChanges .sb-tick').count(), 10);
    assert.equal(await page.locator('#secImports .sb-tick, #secDeliveries [data-sb-table="shops"] .sb-tick, #secDeliveries [data-sb-table="warehouses"] .sb-tick, #secProduction .sb-tick').count(), 10);
    assert.equal(await page.locator('#pageSupply .sb-part', {hasText: en("sb.others")}).count(), 0);
    // Today's card leaves the tight Flour order and the three top-ups to lower out, and says so:
    // 6 on the card and 4 more make the strip's 10.
    assert.equal(await page.locator('#planImportsCard .soon').textContent(), en("today.moves.plan.badge.many", {n: 6}));
    assert.match(await page.locator('#planImportsCard .what').textContent(),
      new RegExp(enRe("today.moves.plan.changes", {n: 6}).source + ".*\\. " + enRe("today.moves.plan.more.both", {n: 4}).source + "$"));
  } finally { await page.close(); }
});

test('a tick stored under the old name-keyed form carries over to the key-based row', async () => {
  const page = await board(fixture(), {which: 'changes', tab: 'imports'});
  try {
    const legacy = JSON.stringify(['Weekly imports', 'hub#1', 'Flour', 14000, 14420, null]);
    const now = JSON.stringify(['Weekly imports', 'hub#1', 'flour', 14000, 14420, null]);
    await page.evaluate(legacy => {
      localStorage.setItem('ba_order_marks_v1:r8-fixture', JSON.stringify([legacy]));
      orderMarkCache.clear(); sbStamp++;
      drawSupplyStrip(); drawChangesView(); drawImportsView(); drawDeliveriesView(); drawProductionView(); wireAll();
    }, legacy);
    assert.equal(await page.locator('#secImports tr[data-slug="flour"] .sb-tick').getAttribute('aria-pressed'), 'true');
    assert.equal(await counted(page), en("sb.cw.road", {done: 1, n: 10}));
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ba_order_marks_v1:r8-fixture'))), [now]);
  } finally { await page.close(); }
});

test('Changes counts the marks on every view, and each view counts what is left', async () => {
  const page = await board(fixture(), {which: 'changes'});
  try {
    const strip = () => counted(page);
    const badges = () => page.evaluate(() => ({...sbLeft}));
    assert.equal(await strip(), en("sb.cw.road", {done: 0, n: 10}));
    assert.deepEqual(await badges(), {imports: 2, deliveries: 5, production: 3});
    await page.locator('#secImports tr[data-slug="flour"] .sb-tick').click();
    await page.locator('#secProduction tr[data-slug="cake"] .sb-tick').click();
    await page.locator('#secDeliveries tr[data-slug="soda"] .sb-tick').click();
    assert.equal(await strip(), en("sb.cw.road", {done: 3, n: 10}));
    assert.deepEqual(await badges(), {imports: 1, deliveries: 4, production: 2});
    assert.match(await page.locator('#secImports tr[data-slug="flour"]').getAttribute('class'), /sb-done/);
    // The same mark shows on Changes, as Marked by you.
    assert.match(await page.locator('#secChanges .sbc-row.sb-done').first().textContent(), enRe("sb.st.marked"));
    // The road says how far along the list is, and no counter says it again (A9);
    // Copy remaining carries no second count.
    assert.equal(await counted(page), en("sb.cw.road", {done: 3, n: 10}));
    assert.equal(await page.locator('#sbcTop .sbc-n').count(), 0);
    await page.evaluate(() => { openRoute('overview'); drawAlerts(); });
    // Pins the wording: the obsolete Your changes label stays off Overview.
    assert.doesNotMatch(await page.locator('#alertSection').innerText(), /Your changes/);
    await page.evaluate(() => openRoute('supply/changes'));
    assert.equal(await page.locator('#sbcTop [data-sb-copy="remaining"] small').count(), 0);
    // The ticks are kept on the device, per character, under the key the old checklist used.
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('ba_order_marks_v1:r8-fixture')));
    assert.equal(kept.length, 3);
    // The flour tick is Weekly imports only: its top-up into the factory is a row of its own.
    assert.equal(await page.locator('#secProduction tr[data-slug="flour"] .sb-tick').getAttribute('aria-pressed'), 'false');
    await page.locator('#secChanges [data-sbc-clear]').click();
    assert.equal(await strip(), en("sb.cw.road", {done: 0, n: 10}));
    assert.equal(await page.locator('#secDeliveries .sb-done').count(), 0);
  } finally { await page.close(); }
});

test('idle rows fold into one group per cause, which opens on a click', async () => {
  const page = await board(fixture(), {which: 'changes'});
  try {
    // Paper Bag topped up far above sales at three shops: one group.
    const group = page.locator('#secDeliveries [data-sb-table="shops"] tr.sb-gr');
    assert.equal(await group.count(), 1);
    assert.match(await group.textContent(), new RegExp(enRe("sb.shops.group", {n: 3}).source + "\\s*Paper Bag"));
    const kids = page.locator('#secDeliveries [data-sb-table="shops"] tr[data-kid]');
    assert.equal(await kids.count(), 3);
    // Each shelf carries its lower target to type, and a tick; the group counts them.
    assert.match(await group.textContent(), enRe("sb.group.left", {n: 3}));
    assert.equal(await kids.locator('.sb-tick').count(), 3);
    assert.match(await kids.first().textContent(), new RegExp("3,000\\s*120\\s*" + enRe("sb.unit.day").source));
    assert.equal(await page.locator('#secDeliveries [data-sb-table="shops"] tr[data-kid].sb-open').count(), 0);
    await group.click();
    assert.equal(await page.locator('#secDeliveries [data-sb-table="shops"] tr[data-kid].sb-open').count(), 3);
    assert.equal(await kids.first().isVisible(), true);
    // The hub's two idle lines: one group, per site.
    const hub = page.locator('#secDeliveries [data-sb-table="warehouses"] tr.sb-gr');
    assert.match(await hub.textContent(), new RegExp(enRe("nav.kind.dead.label").source + "\\s*\\+2"));
    await hub.locator('.sb-kids').click();
    assert.equal(await page.locator('#secDeliveries [data-sb-table="warehouses"] tr[data-kid].sb-open').count(), 2);
    // The group stays open through a redraw.
    await page.evaluate(() => drawDeliveriesView());
    assert.equal(await page.locator('#secDeliveries [data-sb-table="warehouses"] tr[data-kid].sb-open').count(), 2);
  } finally { await page.close(); }
});

test('Needs a change keeps the rows with a change or a word worth reading', async () => {
  const page = await board(fixture(), {which: 'changes', tab: 'deliveries'});
  try {
    const shelves = () => page.$$eval('#secDeliveries [data-sb-table="shops"] tr[data-slug]', trs => trs.map(r => ({s: r.dataset.s, slug: r.dataset.slug})));
    const shops = await shelves();
    // The no-plan gym and the three idle paper-bag shelves; the covered and new shelves wait under Everything.
    assert.deepEqual(shops.map(r => `${r.s}:${r.slug}`).sort(), ['2:bags', '3:bags', '4:bags', '4:soda']);
    // No line counts the fine ones: Everything, in the view's one row, lists them.
    assert.equal(await page.locator('#secDeliveries .sb-more').count(), 0);
    await page.locator('#secDeliveries .sbv-mode [data-sb-mode="all"]').click();
    assert.equal((await shelves()).length, 7);
    assert.equal(await page.locator('#secDeliveries .sbv-mode a.on').textContent(), en("sb.mode.all"));
  } finally { await page.close(); }
});

test('Demand sizing reads the facts\' Demand figures, and says where a shop is still ramping', async () => {
  const page = await board(fixture(), {mode: 'dem'});
  try {
    const hub = await depot(page, 0);
    assert.match(hub.flour.cells[WH.uses], new RegExp("^10,920 " + enRe("sb.ramp").source + "$"));
    assert.equal(hub.flour.box, '14000');
    assert.match(hub.flour.cells[WH.status], enRe("sb.word.covered", {}, {anchor: "start"}));
    const ramp = await page.locator('#secImports .sz-ramp').first().getAttribute('data-tip');
    assert.match(ramp, /Cake Shop Midtown/);
    assert.match(await page.locator('#secProduction').textContent(), new RegExp("1,160\\s*" + enRe("sb.ramp").source));
    assert.match(await page.locator('#secProduction .sb-ramp').textContent(), /Cake Shop Midtown/);
    assert.deepEqual((await actions(page)).map(a => [a.kind, a.item]), [
      ['Weekly imports', 'Sugar'], ['Check the delivery route', 'Milk'], ['Shop daily top-ups', 'Paper Bag'],
      ['Shop daily top-ups', 'Soda Can'], ['Shop daily top-ups', 'Paper Bag'], ['Shop daily top-ups', 'Paper Bag'],
      ['Depot daily top-ups', 'Cake']]);
    // The basis sits on Imports, Production and Changes, all on Shop demand.
    assert.equal(await page.locator('#sbBasis-imports a.on').textContent(), en("sb.basis.dem"));
    assert.equal(await page.locator('#sbBasis-production a.on').textContent(), en("sb.basis.dem"));
    assert.equal(await page.locator('#sbBasis-changes a.on').textContent(), en("sb.basis.dem"));
  } finally { await page.close(); }
});

test('the basis on any view is kept for this company, never on the device key, and redraws the board', async () => {
  const page = await board(fixture());
  try {
    await page.evaluate(() => { window.redrawn = 0;
      renderAll = () => { window.redrawn++; drawSupplyStrip(); drawChangesView(); drawImportsView(); drawProductionView(); }; });
    await page.locator('#sbBasis-production').locator('[data-id="dem"]').click();
    const kept = () => page.evaluate(() => [sizing, localStorage.getItem('ba_dash_sizing:r8-fixture'), localStorage.getItem('ba_dash_sizing'), window.redrawn].join());
    assert.equal(await kept(), 'dem,dem,,1');
    assert.match(await page.locator('#secImports').textContent(), /10,920/);
    assert.equal(await page.locator('#sbBasis-imports a.on').textContent(), en("sb.basis.dem"));
    await page.locator('#sbBasis-imports').locator('[data-id="cap"]').click();
    assert.equal(await kept(), 'cap,cap,,2');
  } finally { await page.close(); }
});

test('a line short of its hours is a change at full production; under shop demand it only may run fewer', async () => {
  const cap = await board(fixture());
  try {
    const cake = (await bySlug(cap, 'secProduction', 1)).cake;
    assert.ok(cake.tick);
    // Line, Machines, Hours a day, Makes, Ships, Held, Status after the tick.
    assert.match(cake.cells[3], new RegExp("^12 24 " + enRe("sb.unit.h").source + "$"));
    assert.match(cake.cells[7], enRe("sb.word.short", {}, {anchor: "full"}));
    assert.match(cake.tip, textRe("sb.line.short.each2", {now: en("sb.dep.h", {h: 12}), n: 24}, {anchor: "start", cap: true}));
    assert.doesNotMatch(cake.tip, enRe("sb.ck.hours.full"));
    assert.match(await counted(cap), enRe("sb.cw.road", {done: 0, n: 10}));
  } finally { await cap.close(); }
  const dem = await board(fixture(), {mode: 'dem'});
  try {
    const cake = (await bySlug(dem, 'secProduction', 1)).cake;
    assert.equal(cake.tick, false);
    assert.match(cake.cells[7], enRe("sb.word.covered", {}, {anchor: "full"}));
    assert.match(cake.tip, textRe("sb.line.fewer", {lower: 10, now: 12}, {anchor: "start", cap: true}));
    assert.ok((await actions(dem)).every(a => a.kind !== 'Factory run hours'));
    // Bread feeds nothing a shop draws: Demand sizes it round the clock too.
    assert.match((await bySlug(dem, 'secProduction', 1)).bread.cells[3], enRe("sb.unit.nh", {n: 24}));
  } finally { await dem.close(); }
});

test('machines on a recipe not named yet are counted in the staffing card, and said so', async () => {
  const data = fixture();
  data.factoryStaffing.cap[0].unnamedMachines = 2;
  const page = await board(data);
  try {
    assert.match(await text(page, '#sbStaff'), enRe("sb.staff.unnamed", {n: 2}));
  } finally { await page.close(); }
});

test('under Demand the Factories verdict says, plainly, that fewer hours and workers would do', async () => {
  const page = await board(fixture(), {mode: 'dem'});
  try {
    const verdict = await tabTip(page, 'production');
    // Workers who could go are the staffing block's to count, below the lines.
    assert.match(verdict, enRe("sb.fac.schedulesCover", {rest: en("sb.fac.fewer", {n: 1}) + "."}));
    // "factory staffing below" is retired wording that must not come back.
    assert.doesNotMatch(verdict, new RegExp(enRe("sb.staff.spare").source + "|factory staffing below"));
    assert.equal(await page.locator('#secProduction .sb-verdict').count(), 0, 'no summary line under the controls');
  } finally { await page.close(); }
  // At 24/7 the bakery has to hire: named, and no "Current rosters cover".
  const cap = await board(fixture());
  try {
    const verdict = await tabTip(cap, 'production');
    // The hires are the staffing block's own figure.
    // "factory staffing below" is retired wording that must not come back.
    assert.doesNotMatch(verdict, new RegExp(enRe("sb.staff.hire").source + "|factory staffing below"));
    assert.doesNotMatch(verdict, enRe("sb.fac.schedulesCover"));
  } finally { await cap.close(); }
  // Spares are counted, never netted against another factory's hires.
  const data = fixture();
  data.factoryStaffing.dem.push({...data.factoryStaffing.dem[0], key: 'dist#6', s: 5, name: 'Other',
    headcount: {needed: 700, min: 14, have: 10, spare: 0, hire: 4}, delta: {workers: 4, perDay: 720}});
  const mixed = await board(data, {mode: 'dem'});
  try {
    assert.doesNotMatch(await tabTip(mixed, 'production'), new RegExp(enRe("sb.staff.spare").source + "|" + enRe("sb.staff.hire").source));
    // Spares are counted per factory, never netted against another factory's hires.
    assert.match(await text(mixed, '#sbStaff'), enRe("sb.staff.spare", {n: 2}));
    assert.match(await text(mixed, '#sbStaff'), enRe("sb.staff.tot.all"));
  } finally { await mixed.close(); }
  // No staffing card, no pointer to it.
  delete data.factoryStaffing;
  const none = await board(data, {mode: 'dem'});
  try {
    const verdict = await tabTip(none, 'production');
    assert.match(verdict, enRe("sb.fac.fewer", {n: 1}));
    // Pins the wording: retired wording must not come back.
    assert.doesNotMatch(verdict, /factory staffing below/);
  } finally { await none.close(); }
});

test('a line with a day off reads its week, and names the thin day', async () => {
  const data = fixture();
  Object.assign(data.supply.factories.sites[0].lines[0], {hoursNow: 12, thinDay: {day: 'Sun', hours: 0}});
  const page = await board(data);
  try {
    const cake = (await bySlug(page, 'secProduction', 1)).cake;
    assert.match(cake.tip, textRe("sb.line.short.thin2", {now: 12, day: "Sun", hours: 0, n: 24}, {cap: true}));
    const row = await page.evaluate(() => sbData().rows.find(r => r.kind === 'Factory run hours'));
    assert.match(row.reason, enRe("sb.ck.staff.each.thin", {now: 12, day: "Sun", h: 0}));
  } finally { await page.close(); }
});

test('two lines making one item at a factory each keep their own change and tick', async () => {
  const data = fixture();
  const site = data.supply.factories.sites[0];
  site.lines.push({...site.lines[0], rid: 'r-cake-2', slots: [9, 10]});
  const page = await board(data);
  try {
    const rows = await page.evaluate(() => sbData().rows.filter(r => r.kind === 'Factory run hours').map(r => [r.line, r.key]));
    assert.deepEqual(rows.map(r => r[0]), ['r-cake', 'r-cake-2']);
    assert.notEqual(rows[0][1], rows[1][1]);
    const ticks = page.locator('#secProduction tr[data-slug="cake"] .sb-tick');
    assert.equal(await ticks.count(), 2);
    await ticks.first().click();
    assert.deepEqual(await ticks.evaluateAll(b => b.map(x => x.getAttribute('aria-pressed'))), ['true', 'false']);
    // The product's ships and held are shown once, on the first line.
    const cells = await page.$$eval('#secProduction tr[data-slug="cake"]', trs => trs.map(t => t.innerText.replace(/\s+/g, ' ')));
    assert.match(cells[0], enRe("sb.line.toCity", {n: 270}));
    assert.match(cells[0], enRe("sb.line.makers", {n: 2, item: "Cake"}));
    assert.match(cells[1], enRe("sb.line.shared", {item: "Cake"}));
    assert.doesNotMatch(cells[1], enRe("sb.line.toCity"));
    assert.match(await page.locator('#secProduction tr[data-slug="cake"]').nth(1).locator('.sub[data-tip]').last().getAttribute('data-tip'),
      enRe("sb.line.shared.tip", {item: "Cake"}));
  } finally { await page.close(); }
});

test('shared product figures sit on the first line shown, after the sort and the filter', async () => {
  const data = fixture();
  const site = data.supply.factories.sites[0];
  // Its machines' weeks are its own slots' (12 h a day each, as the first line's).
  site.lines.push({...site.lines[0], rid: 'r-cake-2', slots: [9, 10], gaps: site.lines[0].gaps.map((g, i) => ({...g, slot: [9, 10][i]})),
    makes: 9999, status: 'covered', why: null, level: 'ok'});
  // Sorted by Makes / day, high first: the second line comes first and carries them.
  const page = await board(data, {which: 'all'});
  try {
    await page.evaluate(() => { supplySort['factory-lines'] = {col: 3, dir: -1}; drawProductionView(); });
    const cells = await page.$$eval('#secProduction tr[data-slug="cake"]', trs => trs.map(t => t.innerText.replace(/\s+/g, ' ')));
    assert.match(cells[0], /9,999/);
    assert.match(cells[0], enRe("sb.line.toCity", {n: 270}));
    assert.match(cells[1], enRe("sb.line.shared", {item: "Cake"}));
  } finally { await page.close(); }
  // Needs a change keeps both: the short line, and the second, which runs 12 of
  // the 24 hours the Flour import is planned on (a factory-hours step of its own).
  const changes = await board(data, {which: 'changes'});
  try {
    const cells = await changes.$$eval('#secProduction tr[data-slug="cake"]', trs => trs.map(t => t.innerText.replace(/\s+/g, ' ')));
    assert.equal(cells.length, 2);
    assert.match(cells[0], enRe("sb.line.toCity", {n: 270}));
    assert.match(cells[1], enRe("sb.line.shared", {item: "Cake"}));
    const dep = await changes.evaluate(() => sbData().rows.filter(r => r.kind === 'Factory run hours').map(r => [r.line, !!r.dep, (r.forImports || []).map(x => x.item).join()]));
    assert.deepEqual(dep, [['r-cake', false, 'Flour'], ['r-cake-2', true, 'Flour']]);
  } finally { await changes.close(); }
});

test('search opens the Supply view it names, and Goods flow keeps the picture to itself', async () => {
  const page = await board(fixture(), {which: 'changes', tab: 'deliveries'});
  try {
    await page.evaluate(() => { showPage('today'); ssSupply('production'); });
    assert.equal(await page.evaluate(() => [sub.supply, route].join()), 'production,supply/production');
    assert.equal(await page.locator('#secProduction').isHidden(), false);
    assert.equal(await page.locator('#sbFlowHome #flow').count(), 1);
    await page.evaluate(() => SS_VIEWS.find(v => v.id === 'imports').go());
    assert.equal(await page.evaluate(() => [sub.supply, route].join()), 'imports,supply/imports');
    // Search's Shops opens Deliveries on the shops, its Warehouses Imports on the warehouses.
    await page.evaluate(() => SS_VIEWS.find(v => v.id === 'shops').go());
    assert.equal(await page.evaluate(() => [sub.supply, sbScope.deliveries].join()), 'deliveries,shops');
    await page.evaluate(() => SS_VIEWS.find(v => v.id === 'flow').go());
    assert.equal(await page.locator('#secFlow .sb-diag #flow').count(), 1);
  } finally { await page.close(); }
});

test('Ships / day says what a line tops up to your own sites and what it exports', async () => {
  const page = await board(fixture(), {which: 'all'});
  try {
    const lines = await bySlug(page, 'secProduction', 1);
    assert.match(lines.cake.cells[5], enRe("sb.line.toCity", {n: 270}));
    assert.match(lines.bread.cells[5], enRe("sb.line.toPier", {n: 960}));
    assert.doesNotMatch(lines.bread.cells[5], enRe("sb.line.toCity"));
  } finally { await page.close(); }
});

test('the Deliveries search entry opens Deliveries, where every daily top-up and wholesale contract is', async () => {
  const page = await board(fixture());
  try {
    await page.evaluate(() => { showPage('today'); SS_VIEWS.find(v => v.id === 'topups').go(); });
    assert.equal(await page.evaluate(() => route), 'supply/deliveries');
    // Shops, a second-tier depot and the factory's inputs, grouped by where the goods arrive.
    assert.deepEqual(await page.$$eval('#secDeliveries .sbv-group > h3', hs => hs.map(h => h.textContent.trim())),
      [en("sb.del.shops2"), en("sb.del.depots2")]);
  } finally { await page.close(); }
});

test('Staffing for factory lines reads the plan for the sizing on screen', async () => {
  const cap = await board(fixture());
  try {
    const card = await text(cap, '#sbStaff');
    assert.match(card, new RegExp(enRe("sb.staff.have", {hours: 672, have: 12, n: 12}).source + " " + enRe("sb.staff.hire", {n: 2}).source));
    // The hire chip says the hires once; no line under it says them again.
    // Pins the wording: the retired line under the chip must not come back.
    assert.doesNotMatch(card, /hire 2: the week needs/);
    assert.match(card, new RegExp("\\+\\$360 " + enRe("sb.staff.wages").source));
    assert.match(card, new RegExp("Cake .*12 24 " + enRe("sb.unit.h").source + " 00–12 " + enRe("sb.unit.nh", {n: 12}).source + " 12–24 " + enRe("sb.unit.nh", {n: 12}).source + " × " + enRe("sb.staff.machines", {n: 2}).source));
    // One factory: no totals under it restating its own figures.
    assert.doesNotMatch(card, new RegExp(enRe("sb.basis.cap").source + ":|" + enRe("sb.staff.tot.all").source));
    // The factory's own page has its lines, not a staffing block: the link says so and lands there.
    const open = cap.locator('#sbStaff a[data-sb-lines]');
    assert.equal(await open.textContent(), en("sb.staff.open"));
    assert.equal(await open.getAttribute('href'), await cap.evaluate(() => siteHref('factory#2')));
    await cap.evaluate(() => { window.opened = null; ssOpenSite = (key, into) => { window.opened = [key, into]; return true; }; });
    await open.click();
    assert.deepEqual(await cap.evaluate(() => window.opened), ['factory#2', '#sp-lines']);
  } finally { await cap.close(); }
  const dem = await board(fixture(), {mode: 'dem'});
  try {
    const card = await text(dem, '#sbStaff');
    assert.match(card, new RegExp(enRe("sb.staff.have", {hours: 476, have: 12, n: 12}).source + " −2"));
    // The fewest workers that cover the week are placed; the rest could go.
    assert.match(card, enRe("sb.staff.spare", {n: 2, week: 10}));
    assert.match(card, new RegExp("Cake .*12 10 " + enRe("sb.unit.h").source + " 06–16 " + enRe("sb.unit.nh", {n: 10}).source + " × " + enRe("sb.staff.machines", {n: 2}).source));
    // One factory: its own row says it, with no totals line under it.
    assert.match(card, new RegExp(enRe("sb.staff.spare", {n: 2, week: 10}).source + " −\\$360 " + enRe("sb.staff.wages").source));
    assert.doesNotMatch(card, new RegExp(enRe("sb.basis.dem").source + ":"));
    // The day strip starts where the run does: Cake runs from 06:00.
    const cells = await dem.$$eval('#sbStaff .sb-sln .sb-day', ds => [...ds[0].children].map(i => i.className));
    assert.deepEqual([cells[5], cells[6], cells[15], cells[16]], ['', 'on', 'on', 'slack']);
  } finally { await dem.close(); }
  // A factory whose plan could not be built says so; no plan at all, no card.
  const data = fixture();
  data.factoryStaffing.cap = [{key: 'factory#2', s: 1, name: '[FB] Bakery Factory', failed: true}];
  const failed = await board(data);
  try {
    assert.match(await failed.locator('#sbStaff').textContent(), enRe("sb.staff.failed"));
  } finally { await failed.close(); }
  delete data.factoryStaffing;
  const none = await board(data);
  try { assert.equal(await none.locator('#sbStaff').count(), 0); } finally { await none.close(); }
});

test("a shelf a wholesale store delivers each week reads its week, and its change is the contract's", async () => {
  const data = fixture();
  // The gym's soda comes from a wholesale store each Monday: 300 a week against 371 sold.
  data.supply.facts[4].soda = {st: 'short', why: 'order', lvl: 'critical', role: 'shelf', cad: 'weekly',
    use: 371, need: 427, have: 300, setTo: 430, parts: {lines: 0, sites: 371, route: 0}, imp: false,
    wholesale: true, day: 'Monday'};
  Object.assign(data.supply.shops.find(r => r.slug === 'soda'), {wholesale: 300, wholesaleDay: 'Monday'});
  const page = await board(data);
  try {
    assert.deepEqual((await actions(page)).find(a => a.item === 'Soda Can'),
      {kind: 'Wholesale deliveries', item: 'Soda Can', current: 300, proposed: 430, tight: false, paused: false});
    // Shop, Product, Sells, Busiest, On hand, Pressure, Daily top-up, Status after the tick.
    const soda = (await bySlug(page, 'secDeliveries', 4)).soda;
    assert.match(soda.cells[7], new RegExp("^300 430 " + enRe("sb.unit.week").source + " " + enRe("sb.where.wholesaleDay", {day: "Monday"}).source + "$"));
    assert.match(soda.cells[8], enRe("sb.word.short", {}, {anchor: "start"}));
    assert.ok(soda.tick);
  } finally { await page.close(); }
});

test("Deliveries lists a route-fed depot's daily top-up from its fact, naming the site that sets it", async () => {
  const data = fixture();
  // The hub's soda, fed only by the bakery's plan: its busiest day outruns the top-up.
  data.supply.facts[0].soda = {st: 'short', why: 'target', lvl: 'critical', role: 'depot', cad: 'daily',
    use: 100, need: 115, have: 80, setTo: 120, imp: false, from: 1};
  const page = await board(data);
  try {
    const act = (await page.evaluate(() => sbData().rows)).find(a => a.kind === 'Depot daily top-ups' && a.item === 'Soda Can');
    assert.deepEqual([act.kind, act.current, act.proposed, act.source, !!act.tight],
      ['Depot daily top-ups', 80, 120, 1, false]);
    assert.match(act.reason, /Bakery Factory/);
    const soda = (await bySlug(page, 'secDeliveries', 0)).soda;
    assert.match(soda.cells[WH.order], new RegExp("^80 120 " + enRe("sb.unit.day").source + " " + enRe("sb.where.plan", {site: "Bakery Factory"}).source + "$"));
    assert.match(soda.cells[5], /125%/);
    assert.ok(soda.tick);
  } finally { await page.close(); }
});

test("a factory's paused contract the top-up falls short without is a change; one it covers is not", async () => {
  const withPaused = lvl => {
    const data = fixture();
    data.supply.facts[1].milk = {...data.supply.facts[1].milk, imp: true, import: {st: 'paused',
      why: lvl === 'info' ? 'topup' : 'order', lvl, role: 'input', cad: 'weekly', use: 0, need: 0, have: 2100,
      setTo: null, parts: {lines: 0, sites: 0, route: 0}, from: 0}};
    const hubMilk = data.supply.factories.depots[0].milk;
    data.supply.factories.depots[1] = {milk: {...hubMilk, weekly: 0, pausedWeekly: 2100, plain: 0,
      contracts: [{...hubMilk.contracts[0], id: 'c7', active: false}]}};
    return data;
  };
  const read = async lvl => {
    const page = await board(withPaused(lvl));
    try {
      return await page.evaluate(() => {
        const own = [...document.querySelectorAll('#secImports .sb-part')].find(p => p.textContent === 'Its own imports');
        const table = own && own.nextElementSibling;
        const tr = table ? table.querySelector('tr[data-slug="milk"]') : null;
        return {milk: tr ? `${tr.textContent} ${[...tr.querySelectorAll('[data-tip]')].map(x => x.dataset.tip).join(' ')}`.replace(/\s+/g, ' ') : null,
                tick: !!(table && table.querySelector('tr[data-slug="milk"] .sb-tick')),
                acts: sbData().rows.filter(a => a.item === 'Milk' && a.kind === 'Weekly imports').map(a => [a.kind, !!a.paused])};
      });
    } finally { await page.close(); }
  };
  const short = await read('critical');
  assert.match(short.milk, enRe("sb.imp.resume"));
  assert.ok(short.tick);
  assert.deepEqual(short.acts, [['Weekly imports', true]]);
  const covered = await read('info');
  assert.match(covered.milk, enRe("sb.why.paused.topup"));
  assert.equal(covered.tick, false);
  assert.deepEqual(covered.acts, []);
});

/* Facts shaped as extraction writes them for a real save: a gym's shelf a
   wholesale store fills each Monday (short, a warning while its stock reaches
   the drop), another tight, and a depot only a route from a factory fills,
   tight against its busiest day. */
test('wholesale deliveries and depot top-ups from facts shaped like a real save\'s', async () => {
  const data = fixture();
  data.businesses[4].lines.push({slug: 'energy', item: 'Energy Drink', units: 1026, rate: 176, price: 5},
                                {slug: 'chips', item: 'Chips', units: 100, rate: 100, price: 2});
  data.supply.facts[4] = {
    energy: {st: 'short', why: 'order', lvl: 'warn', role: 'shelf', cad: 'weekly', use: 1232, need: 1417,
      have: 1200, setTo: 1420, catchUp: 50, parts: {lines: 0, sites: 1232, route: 0}, imp: false, wholesale: true,
      day: 'Monday'},
    soda: {st: 'tight', why: 'order', lvl: 'warn', role: 'shelf', cad: 'weekly', use: 883, need: 1015,
      have: 900, setTo: 1020, parts: {lines: 0, sites: 883, route: 0}, imp: false, wholesale: true, day: 'Monday'},
    // Covered for the week, but the stock runs out before Monday's delivery.
    chips: {st: 'short', why: 'shortfall', lvl: 'critical', role: 'shelf', cad: 'weekly', use: 700, need: 805,
      have: 900, setTo: null, catchUp: 120, parts: {lines: 0, sites: 700, route: 0}, imp: false, wholesale: true,
      day: 'Monday'},
  };
  // The hub takes a wholesale store's syrup for the factory lines: 1,000 a week against 1,680.
  data.supply.facts[0].syrup = {st: 'short', why: 'order', lvl: 'critical', role: 'depot', cad: 'weekly',
    use: 1680, need: 1680, have: 1000, setTo: 1680, parts: {lines: 1680, sites: 0, route: 0}, imp: false,
    wholesale: true, day: 'Monday'};
  data.supply.shops = data.supply.shops.filter(r => r.s !== 4).concat([
    {s: 4, item: 'Energy Drink', slug: 'energy', sold: 176, peakSold: 192, peakDay: 'Sunday', target: 0,
     pressure: null, stock: 1026, from: null, level: 'ok', wholesale: 1200, wholesaleDay: 'Monday'},
    {s: 4, item: 'Soda Can', slug: 'soda', sold: 126, peakSold: 137, peakDay: 'Sunday', target: 0,
     pressure: null, stock: 817, from: null, level: 'ok', wholesale: 900, wholesaleDay: 'Monday'},
    {s: 4, item: 'Chips', slug: 'chips', sold: 100, peakSold: 110, peakDay: 'Sunday', target: 0,
     pressure: null, stock: 100, from: null, level: 'ok', wholesale: 900, wholesaleDay: 'Monday'}]);
  data.supply.facts[0].bread = {st: 'tight', why: 'target', lvl: 'warn', role: 'depot', cad: 'daily',
    use: 905, need: 1041, have: 1000, setTo: 1050, imp: false, from: 1};
  data.supply.facts[0].cups = {st: 'covered', why: 'route', lvl: 'ok', role: 'depot', cad: 'daily',
    use: 100, need: 115, have: 200, setTo: null, imp: false, from: 1};
  const page = await board(data);
  try {
    const gym = await bySlug(page, 'secDeliveries', 4);
    // Short of the week and dry before Monday: the raise and the stock to bring in, both.
    assert.match(gym.energy.cells[7], new RegExp("^1,200 1,420 " + enRe("sb.unit.week").source + " " + enRe("sb.where.wholesaleDay", {day: "Monday"}).source + " " + enRe("sb.once.n", {n: 50}).source + "$"));
    assert.match(gym.soda.cells[7], new RegExp("^900 1,020 " + enRe("sb.unit.week").source));
    assert.match(gym.soda.cells[8], enRe("sb.word.tight", {}, {anchor: "start"}));
    assert.match(gym.chips.cells[7], new RegExp("^900 " + enRe("sb.unit.week").source + " " + enRe("sb.where.wholesaleDay", {day: "Monday"}).source + " " + enRe("sb.once.n", {n: 120}).source + "$"));
    const hub = await bySlug(page, 'secDeliveries', 0);
    assert.match(hub.syrup.cells[WH.order], new RegExp("^1,000 1,680 " + enRe("sb.unit.week").source + " " + enRe("sb.where.wholesaleDay", {day: "Monday"}).source + "$"));
    assert.match(hub.bread.cells[WH.order], new RegExp("^1,000 1,050 " + enRe("sb.unit.day").source + " " + enRe("sb.where.plan", {site: "Bakery Factory"}).source + "$"));
    assert.match(hub.bread.cells[WH.status], enRe("sb.word.tight", {}, {anchor: "start"}));
    assert.match(hub.cups.cells[WH.status], enRe("sb.word.covered", {}, {anchor: "start"}));
    // Needs a change: the covered route-fed line drops out.
    await page.evaluate(() => { sbMode.deliveries = 'changes'; drawDeliveriesView(); });
    assert.ok(!(await bySlug(page, 'secDeliveries', 0)).cups);
    const acts = await page.evaluate(() => sbData().rows.map(a => [a.kind, a.site, a.item, a.current, a.proposed]));
    assert.ok(acts.some(a => a.join() === 'Wholesale deliveries,0,Syrup,1000,1680'), JSON.stringify(acts));
    assert.ok(acts.some(a => a.join() === 'Before the next delivery,4,Chips,,120'), JSON.stringify(acts));
    assert.equal(await page.locator('#pageSupply .sb-part', {hasText: en("sb.others")}).count(), 0);
  } finally { await page.close(); }
});

test('a paused backup a route covers is covered by route, with nothing to resume', async () => {
  const data = fixture();
  data.supply.facts[0].sugar = {...data.supply.facts[0].sugar, st: 'covered', why: 'route', lvl: 'ok', setTo: null,
    parts: {lines: 2800, sites: 0, route: 2800}};
  const page = await board(data);
  try {
    const sugar = (await bySlug(page, 'secImports', 0)).sugar;
    assert.match(sugar.cells[WH.order], enRe("sb.imp.byRoute"));
    assert.doesNotMatch(sugar.cells[WH.order], enRe("sb.imp.resume"));
    assert.ok((await actions(page)).every(a => a.item !== 'Sugar'));
  } finally { await page.close(); }
});

test('a recipe named in this browser reads new until the next refresh', async () => {
  const data = fixture();
  data.supply.factories.sites[0].unnamed = [{rid: 'r-muffin', workstation: 'Oven', slots: [5], machines: 1, idle: false,
    candidates: [{slug: 'muffin', item: 'Muffin'}], hoursWeek: 168, fullWeek: 168, gaps: []}];
  data.plan.recipes.push({slug: 'muffin', item: 'Muffin', out: 10, workstation: 'oven',
    ingredients: [{slug: 'butter', item: 'Butter', per: 5}]});
  const page = await board(data, {names: {'r-muffin': 'muffin'}});
  try {
    const f = await bySlug(page, 'secProduction', 1);
    assert.match(f.butter.cells.at(-1), enRe("sb.word.new", {}, {anchor: "full"}));
    assert.match(f.butter.tip, enRe("sb.why.new.named", {}, {flags: "i"}));
    // Its top-up has no figure until Python judges it, so nothing to set.
    assert.equal(f.butter.tick, false);
    assert.ok((await actions(page)).every(a => a.item !== 'Butter'));
    // The line itself is named, and new.
    assert.match(f.muffin.cells[1], enRe("sb.line.you"));
    assert.match(f.muffin.cells.at(-1), enRe("sb.word.new", {}, {anchor: "start"}));
  } finally { await page.close(); }
});

test('an unnamed line is on Production with its recipe picker', async () => {
  const data = fixture();
  data.supply.factories.sites[0].unnamed = [{rid: 'r-x', workstation: 'Oven', slots: [5], machines: 1, idle: false,
    candidates: [{slug: 'cake', item: 'Cake'}], hoursWeek: 168, fullWeek: 168, gaps: []}];
  data.supply.factories.unnamed = 1;
  const page = await board(data, {which: 'changes'});
  try {
    assert.equal(await page.locator('#secProduction select.linepick').count(), 1);
    assert.match(await tabTip(page, 'production'), enRe("sb.fac.unnamed", {n: 1}));
  } finally { await page.close(); }
});

test('the views, Goods flow and Today read the same facts, by basis', async () => {
  const page = await board(fixture());
  try {
    const shops = await bySlug(page, 'secDeliveries', 4);
    assert.match(shops.soda.cells[7], new RegExp("^— 70 " + enRe("sb.unit.day").source + " " + enRe("sb.where.planFrom", {site: "Import Hub"}).source + "$"));
    assert.match(shops.soda.cells[8], enRe("sb.word.noplan", {}, {anchor: "start"}));
    // Goods flow counts each site's facts on its dot: the worst of them.
    const dots = await page.evaluate(() => { showSub('supply', 'flow'); drawFlowView(); drawFlow();
      return [...document.querySelectorAll('#flow circle')].map(c => c.textContent).filter(Boolean); });
    assert.ok(dots.includes("1 " + en("sb.word.paused")), JSON.stringify(dots));
    // The second-tier depot's short top-up is its own red dot.
    assert.equal(dots.filter(d => d === "1 " + en("sb.word.short")).length, 2, JSON.stringify(dots));
    const today = async mode => page.evaluate(mode => { sizing = mode; drawAlerts();
      return [...document.querySelectorAll('#alerts .find')].map(f => f.dataset.id); }, mode);
    const cap = await today('cap'), dem = await today('dem');
    assert.ok(cap.includes('r13hours') && cap.includes('r8feed'), JSON.stringify(cap));
    assert.deepEqual(dem, ['r8paused', 'r8stalled', 'r8notrouted', 'r8dead']);
    assert.doesNotMatch(await page.locator('#alerts').textContent(), enRe("sb.word.tight", {}, {flags: "i"}));
  } finally { await page.close(); }
});

test('the picture survives a redraw of Goods flow and of the other views: a basis switch keeps the one svg', async () => {
  const page = await board(fixture(), {which: 'changes', tab: 'flow'});
  try {
    await page.evaluate(() => { showSub('supply', 'flow'); drawFlowView(); drawFlow(); });
    assert.equal(await page.locator('#secFlow .sb-diag #flow').count(), 1);
    await page.evaluate(() => { drawImportsView(); drawDeliveriesView(); drawFlowView(); });
    assert.equal(await page.locator('#secFlow .sb-diag #flow').count(), 1, 'a redraw keeps the picture');
    await page.evaluate(() => { sizing = 'dem'; drawSupplyStrip(); drawChangesView(); drawImportsView(); drawFlowView(); drawFlow(); });
    assert.equal(await page.locator('#flow').count(), 1, 'a basis switch keeps the one svg');
    assert.equal(await page.locator('#secFlow .sb-diag #flow').count(), 1);
    // A later draw still finds it.
    assert.equal(await page.evaluate(() => { drawFlow(); return document.querySelectorAll('#flow .node').length > 0; }), true);
  } finally { await page.close(); }
});

test("a factory's own import finding lands on Imports, on its import row", async () => {
  const data = fixture();
  data.supply.facts['1'].butter = {st: 'short', why: 'order', lvl: 'critical', role: 'input', cad: 'weekly', imp: true,
    use: 700, need: 805, have: 500, setTo: 810, parts: {lines: 700, sites: 0, route: 0}};
  data.alerts.push({id: 'r13ownorder', level: 'critical', group: 'order', site: '[FB] Bakery Factory', siteKey: 'factory#2',
    text: 'Butter: the weekly order brings 500 against 805', ev: {slug: 'butter'}});
  const page = await board(data, {which: 'changes', tab: 'deliveries'});
  try {
    const got = await page.evaluate(() => { goToAlert(D.alerts.find(a => a.id === 'r13ownorder'));
      const at = document.querySelector('#secImports tr[data-sb-at]');
      return {view: sub.supply, at: at ? `${at.dataset.s}:${at.dataset.slug}` : null, card: !!document.querySelector('#sbCard[data-sb-at]')}; });
    assert.deepEqual(got, {view: 'imports', at: '1:butter', card: true});
    // A depot's own import lands on Imports as well.
    assert.equal(await page.evaluate(() => { goToAlert(D.alerts.find(a => a.id === 'r8paused')); return sub.supply; }), 'imports');
  } finally { await page.close(); }
});

test('a finding reached while Goods flow is on opens its view, on its row', async () => {
  const page = await board(fixture(), {which: 'changes', tab: 'flow'});
  try {
    await page.evaluate(() => { showSub('supply', 'flow'); drawFlowView(); });
    await page.evaluate(() => goToAlert(D.alerts.find(a => a.id === 'r8notrouted')));
    assert.equal(await page.evaluate(() => sub.supply), 'deliveries');
    assert.equal(await page.locator('#secDeliveries').isHidden(), false);
    assert.equal(await page.locator('#secDeliveries tr.sb-arrived').isVisible(), true);
    assert.equal(await page.locator('#sbFlowHome #flow').count(), 1);
  } finally { await page.close(); }
});

test('a finding lands on its view and row, lit, with a crumb back', async () => {
  const page = await board(fixture(), {which: 'changes', tab: 'deliveries'});
  try {
    const land = id => page.evaluate(id => { goToAlert(D.alerts.find(a => a.id === id));
      const at = document.querySelector(`#${SB_SEC[sub.supply]} [data-sb-at]`);
      return {tab: sub.supply, at: at ? `${at.dataset.s}:${at.dataset.slug}` : null,
              crumb: document.querySelector(`#${SB_SEC[sub.supply]} .sb-crumb`)?.textContent || ''}; }, id);
    // Not routed: Deliveries, on the soda row, its group opened.
    const soda = await land('r8notrouted');
    assert.deepEqual([soda.tab, soda.at], ['deliveries', '0:soda']);
    assert.match(soda.crumb, enRe("today.crumb", {kind: en("nav.kind.notrouted.label")}));
    assert.equal(await page.locator('#secDeliveries [data-sb-table="warehouses"] tr[data-slug="soda"]').evaluate(r => r.classList.contains('sb-open')), true);
    // Too few hours: Production, on the cake line.
    const cake = await land('r13hours');
    assert.deepEqual([cake.tab, cake.at], ['production', '1:cake']);
    // A row that is no change opens Everything.
    await page.evaluate(() => { sbMode.deliveries = 'changes'; sbLand('deliveries', 2, 'cake', 'from Today · a test'); });
    assert.equal(await page.evaluate(() => sbMode.deliveries), 'all');
    assert.equal(await page.locator('#secDeliveries tr.sb-arrived').getAttribute('data-slug'), 'cake');
    // The crumb's close drops the landing.
    await page.locator('#secDeliveries [data-sb-crumb]').click();
    assert.equal(await page.locator('#secDeliveries .sb-crumb').count(), 0);
    assert.equal(await page.locator('#secDeliveries tr.sb-arrived').count(), 0);
  } finally { await page.close(); }
});

test('Goods flow follows a site clicked on the picture; its rows are one click on, and the picture waits outside the other views', async () => {
  const page = await board(fixture(), {which: 'changes', tab: 'flow'});
  try {
    await page.evaluate(() => { showSub('supply', 'flow'); drawFlowView(); drawFlow(); wireAll(); });
    assert.equal(await page.locator('#secFlow .sb-diag #flow').count(), 1);
    await page.locator('#flow .node[data-id="dist#6"]').click();
    assert.equal(await page.evaluate(() => flowPickId), 'dist#6');
    assert.match(await page.locator('#sbFlowPanel').textContent(), /Cake Distr\./);
    assert.match(await page.locator('#sbFlowPanel').textContent(), enRe("sb.flow.fixes"));
    await page.locator('#sbFlowPanel [data-sb-go]').first().click();
    assert.equal(await page.evaluate(() => sub.supply), 'imports');
    await page.evaluate(() => sbNodeRows('dist#6'));
    assert.equal(await page.evaluate(() => sub.supply), 'imports');
    assert.equal(await page.locator('#sbFlowHome #flow').count(), 1, 'another view on, the picture waits outside the views');
  } finally { await page.close(); }
});

/* Real extraction, from the Python builders. Once _supply() sends facts, the
   tabs and the checklist say exactly what they say; a payload without them
   (the board ahead of the extraction) has nothing to hold the board to. */
for (const scenario of [
  // The fixture holds the harness itself to account: it has facts today.
  {name: 'the R8 fixture', code: 'd = json.load(open("tests/fixtures/r8_supply.json", encoding="utf-8"))'},
  {name: 'paused direct', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(2000,active=False,destination=("factory",0))])'},
  {name: 'mixed fully covered', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(2000,destination=("factory",0))],routed=True)'},
  {name: 'mixed partially direct', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(840,destination=("factory",0)),contract(900)],routed=True)'},
  {name: 'a warehouse contract before its first delivery', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(126000)],routed=True)'},
  {name: 'a short daily top-up', code: 'from test_import_routes import ImportRoutesTests,contract; '
    + 'd = ImportRoutesTests().build([contract(840,destination=("factory",0)),contract(900)],routed=True,target=130)'},
  {name: 'a line the route covers half of', code: 'from test_routed_supply import board_data,contract; '
    + 'd = board_data(0.5,[contract(5000,5000,smart=False)])'},
  {name: 'a paused backup the route covers', code: 'from test_routed_supply import board_data,contract; '
    + 'd = board_data(1.0,[contract(5200,0,smart=True,active=False)])'},
]) {
  test(`parity with extraction: ${scenario.name}`, async () => {
    const data = JSON.parse(python(`import sys,json; sys.path.insert(0,"tests"); ${scenario.code}; print(json.dumps(d))`));
    assert.ok(data.supply.facts, 'the extraction sends its supply facts');
    const page = await board(data);
    try {
      const seen = await page.evaluate(() => {
        const facts = D.supply.facts, out = {imports: [], wanted: [], topups: []};
        Object.keys(facts).forEach(s => Object.keys(facts[s]).forEach(slug => {
          const f = supplyFact(s, slug), imp = f.import || f;
          if(f.imp) out.imports.push(slug);
          if(f.imp && Number.isFinite(imp.setTo) && imp.st !== 'paused') out.wanted.push([+s, slug, imp.setTo]);
          if(f.role === 'input' && f.cad === 'daily' && Number.isFinite(f.setTo)) out.topups.push([+s, slug, f.setTo]);
        }));
        out.rows = gwImportRows.map(r => [r.s, r.slug, r.setTo]);
        return out;
      });
      assert.equal(seen.rows.length, seen.imports.length, 'one import row per import fact');
      const acts = await page.evaluate(() => sbData().rows);
      const weekly = acts.filter(a => a.kind === 'Weekly imports' && a.proposed !== null);
      assert.equal(weekly.length, seen.wanted.length);
      for (const [s, , setTo] of seen.wanted)
        assert.ok(weekly.some(a => a.site === s && a.proposed === setTo), `weekly ${setTo} at ${s}`);
      const daily = acts.filter(a => a.kind === 'Factory daily top-ups');
      assert.deepEqual(daily.map(a => [a.site, a.proposed]).sort(), seen.topups.map(([s, , v]) => [s, v]).sort());
      // Every change has a tick on its tab.
      const ticked = await page.evaluate(() => [...document.querySelectorAll('#pageSupply .sb-tick[data-sb-keys]')]
        .flatMap(b => b.dataset.sbKeys.split(' ').map(Number)));
      assert.deepEqual([...new Set(ticked)].sort((a, b) => a - b), acts.map((_, i) => i));
    } finally { await page.close(); }
  });
}

/* A shelf nothing upstream supplies has sold nothing, yet its finding lands
   on its row: Python sends the shelf a row of its own (supply.shops). */
test('an unsourced finding lands on its shelf on Deliveries', async () => {
  const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
    + 'from test_supply_bottom_up import cafe_board; print(json.dumps(cafe_board()))'));
  const page = await board(data, {which: 'changes', tab: 'deliveries'});
  try {
    const got = await page.evaluate(() => {
      const a = D.alerts.find(x => x.group === 'unsourced');
      goToAlert(a);
      const at = document.querySelector(`#${SB_SEC[sub.supply]} [data-sb-at]`);
      return {tab: sub.supply, at: at ? `${at.dataset.s}:${at.dataset.slug}` : null};
    });
    assert.deepEqual(got, {tab: 'deliveries', at: '1:ba:itemname_beer'});
    assert.equal(await page.locator('#secDeliveries tr.sb-arrived').getAttribute('data-slug'), 'ba:itemname_beer');
  } finally { await page.close(); }
});

/* A depot nothing brings its goods to is unsourced too, and its fix is an
   import: its finding lands on Imports, whatever key its text has (a
   condensed row carries f.sum.unsourced). */
test('an unsourced finding on a depot lands on Imports', async () => {
  const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
    + 'from test_supply_bottom_up import depot_board; print(json.dumps(depot_board()))'));
  const page = await board(data, {which: 'changes', tab: 'deliveries'});
  try {
    const got = await page.evaluate(() => {
      const a = D.alerts.find(x => x.group === 'unsourced');
      const summary = {...a, i18n: {text: ['f.sum.unsourced', {}]}};
      const routes = [findingRoute(a).route, findingRoute(summary).route];
      goToAlert(a);
      const at = document.querySelector(`#${SB_SEC[sub.supply]} tr.sb-arrived`);
      return {routes, tab: sub.supply, at: at ? `${at.dataset.s}:${at.dataset.slug}` : null};
    });
    // The depot's line, with the import to add, is a row of Imports to land on.
    assert.deepEqual(got, {routes: ['supply/imports', 'supply/imports'], tab: 'imports', at: '0:ba:itemname_beer'});
    assert.equal(await page.locator('#secImports tr.sb-arrived').getAttribute('data-slug'), 'ba:itemname_beer');
  } finally { await page.close(); }
});

/* Several sites top a depot up and both targets have to rise: each plan is a
   change of its own on the checklist, to the same level. */
test('a depot two plans have to rise for lists both on the checklist', async () => {
  const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
    + 'from test_supply_bottom_up import two_breweries_board; print(json.dumps(two_breweries_board()))'));
  const page = await board(data, {which: 'changes', tab: 'deliveries'});
  try {
    const got = await page.evaluate(() => supplyChecklistRows().rows
      .filter(r => r.kind === 'Depot daily top-ups').map(r => [D.businesses[r.source].name, r.current, r.proposed]));
    assert.deepEqual(got.sort(), [['Brewery a', 500, 1500], ['Brewery b', 500, 1500]]);
  } finally { await page.close(); }
});

/* Round 9: a depot's row in the Supply table names every plan a finding
   raises, not the first alone. */
test('the depot row names both plans a finding raises', async () => {
  const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
    + 'from test_supply_bottom_up import two_breweries_board; print(json.dumps(two_breweries_board()))'));
  const page = await board(data, {tab: 'deliveries'});
  try {
    const cells = (await page.$$eval('#pageSupply tr[data-slug]', trs => trs.map(r => r.innerText))).filter(t => enRe("sb.where.plans").test(t));
    assert.equal(cells.length, 1, JSON.stringify(cells));
    assert.match(cells[0], /Brewery a, Brewery b/);
  } finally { await page.close(); }
});

/* Round 9: Demand sizing lists only its own plan changes. Two hubs top a
   water depot up; full production raises both plans, shop demand one, and
   no 24/7 change shows through when the basis switches. */
test('each basis lists only its own depot top-up changes', async () => {
  const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
    + 'from test_supply_bottom_up import water_depot_board; print(json.dumps(water_depot_board()))'));
  const page = await board(data, {which: 'changes', tab: 'deliveries'});
  try {
    const plans = mode => page.evaluate(mode => { sizing = mode; return supplyChecklistRows().rows
      .filter(r => r.kind === 'Depot daily top-ups').map(r => [D.businesses[r.source].name, r.current, r.proposed]).sort(); }, mode);
    assert.deepEqual(await plans('cap'), [['Hub a', 100, 2400], ['Hub b', 100, 2400]]);
    assert.deepEqual(await plans('dem'), [['Hub a', 100, 120]]);
    assert.deepEqual(await plans('cap'), [['Hub a', 100, 2400], ['Hub b', 100, 2400]]);
  } finally { await page.close(); }
});

/* QA of PR #195: a depot whose order is short of its week while it still
   holds months of stock reads short, so its line sits on Imports; its idle
   and target findings land on Deliveries, which shows it too, lit. */
for (const [name, targetHigh, group, at] of [
  ['an idle-stock finding on a depot whose order is short', false, 'dead', '0:ba:itemname_beer'],
  ['a target finding on a depot whose order is short', true, 'target', '1:ba:itemname_beer'],
]) {
  test(`${name} lands on its row on Deliveries`, async () => {
    const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
      + `from test_supply_bottom_up import idle_but_short_board; print(json.dumps(idle_but_short_board(${targetHigh ? 'True' : 'False'})))`));
    const page = await board(data, {which: 'changes', tab: 'imports'});
    try {
      const got = await page.evaluate(([group, at]) => {
        const [s] = at.split(':');
        const fact = szFact(Number(s), 'ba:itemname_beer');
        goToAlert(D.alerts.find(x => x.group === group));
        const lit = document.querySelector(`#${SB_SEC[sub.supply]} tr.sb-arrived`);
        return {st: fact.st, tab: sub.supply, at: lit ? `${lit.dataset.s}:${lit.dataset.slug}` : null};
      }, [group, at]);
      assert.deepEqual(got, {st: 'short', tab: 'deliveries', at});
    } finally { await page.close(); }
  });
}

/* QA of PR #195: an Imports row's status tip gives the order finding's own
   sentence, the route that only passes on what its sender holds and how long
   that lasts, as the finding does for its site's worst line. */
test('a short import row says in its tip how long the passing route lasts', async () => {
  const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
    + 'from test_supply_bottom_up import idle_but_short_board; print(json.dumps(idle_but_short_board(True)))'));
  const page = await board(data, {which: 'all', tab: 'imports'});
  try {
    const tip = await page.evaluate(() => {
      const tr = document.querySelector('#secImports tr[data-s="1"][data-slug="ba:itemname_beer"]');
      return tr && tr.querySelector('td.st .sb-v').dataset.tip;
    });
    assert.match(tip, enRe("sb.why.short.order", {}, {anchor: "start"}));
    assert.match(tip, enRe("f.order.passes", {sender: "Holder", lasts: en("f.lasts.over", {n: 60})}));
  } finally { await page.close(); }
});

/* QA of PR #195: idle stock at a factory lands on Production, on the
   factory itself where no line of its own draws on the item (no row lists
   it), lit, with a crumb back. */
test('an idle-stock finding at a factory lands on the factory on Production', async () => {
  const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
    + 'from test_supply_bottom_up import idle_landing_board; print(json.dumps(idle_landing_board("factory")))'));
  const page = await board(data, {which: 'changes', tab: 'deliveries'});
  try {
    const got = await page.evaluate(() => {
      const a = D.alerts.find(x => x.group === 'dead');
      const route = findingRoute(a).route;
      goToAlert(a);
      const lit = document.querySelector('#secProduction [data-sb-at]');
      return {route, tab: sub.supply, lit: lit ? lit.dataset.sbObj : null, crumb: !!document.querySelector('#secProduction .sb-crumb')};
    });
    assert.deepEqual(got, {route: 'supply/production', tab: 'production', lit: 'production|brew_lane#2', crumb: true});
  } finally { await page.close(); }
});

/* QA of PR #195: one target set too high across two shops has no site of
   its own; it lands on the shop holding most of it, lit. */
test('a target finding across two shops lands on the shop holding most', async () => {
  const data = JSON.parse(python('import sys,json; sys.path.insert(0,"tests"); '
    + 'from test_supply_bottom_up import idle_landing_board; print(json.dumps(idle_landing_board("shops")))'));
  const page = await board(data, {which: 'changes', tab: 'imports'});
  try {
    const got = await page.evaluate(() => {
      const a = D.alerts.find(x => x.group === 'target');
      goToAlert(a);
      const lit = document.querySelector(`#${SB_SEC[sub.supply]} tr.sb-arrived`);
      return {site: a.site, tab: sub.supply, at: lit ? `${D.businesses[Number(lit.dataset.s)].name}:${lit.dataset.slug}` : null};
    });
    assert.deepEqual(got, {site: en("f.target.site", {n: 2}), tab: "deliveries", at: "Shop b:ba:itemname_beer"});
  } finally { await page.close(); }
});
