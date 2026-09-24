// Weekly imports, Daily top-ups and the change checklist read Python's one
// verdict per supply fact (supplyFact); the board works none out of its own.
// The board tests run on the synthetic R8 fixture (tests/fixtures/r8_supply.json).
// The parity tests render real extraction from the Python test builders and
// hold the tables and the checklist to the facts that extraction sends.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
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

/* The Supply page drawn from `data` under a sizing, with the checklist's rows
   kept for the test. `names` are recipes named in this browser. */
async function board(data, {mode = 'cap', names = null} = {}){
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
  await page.route('https://**', route => route.abort());
  await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
  await page.goto('http://board.test/');
  await page.evaluate(([data, mode, names]) => {
    if(names) localStorage.setItem('ba_line_names', JSON.stringify(names));
    D = data; sizing = mode; stockView = 'feed'; showAllStock = true; logisticsView = 'all'; supplySort = {};
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    const draw = drawOrderChecklist;
    drawOrderChecklist = (rows, f) => { window.fixtureActions = rows; draw(rows, f); };
    drawStock(); drawLogistics(); wireAll();
  }, [data, mode, names]);
  return page;
}
const actions = page => page.evaluate(() => window.fixtureActions.map(a =>
  ({kind: a.kind, item: a.item, current: a.current, proposed: a.proposed, tight: !!a.tight, paused: !!a.paused})));
/* The Weekly imports rows: material, Used / week, the Set to box and its verdict. */
const importRows = page => page.$$eval('#importPlan tbody tr', rows => rows.map(r => ({
  item: r.cells[0].firstChild.textContent.trim(),
  used: r.cells[1].textContent.replace(/\s+/g, ' ').trim(),
  box: r.cells[4].querySelector('input')?.value ?? null,
  verdict: r.cells[4].textContent.replace(/\s+/g, ' ').trim(),
})));

test('Weekly imports lists the depot facts Python marks as import rows, with their figures', async () => {
  const page = await board(fixture());
  try {
    const rows = Object.fromEntries((await importRows(page)).map(r => [r.item, r]));
    // Soda Can is held at the hub but imported by nobody: no import row.
    assert.deepEqual(Object.keys(rows).sort(), ['Butter', 'Coffee', 'Flour', 'Milk', 'Paper Bag', 'Sugar']);
    // The lines' 11,200 and the other sites' 2,800; 24/7 puts the margin on the sites' part only.
    assert.match(rows.Flour.used, /^14,000$/);
    assert.equal(rows.Flour.box, '14420');
    assert.match(rows.Flour.verdict, /raise/);
    assert.match(rows.Sugar.verdict, /resume import/);
    assert.equal(rows.Sugar.box, '2800', 'a paused contract resumes as it stands');
    assert.match(rows['Paper Bag'].verdict, /idle/);
    assert.match(rows.Butter.verdict, /new/);
    assert.match(rows.Coffee.verdict, /could lower/);
    // Used / week carries Python's split on hover.
    const tip = await page.locator('#importPlan tbody tr', {hasText: 'Coffee'}).locator('td').nth(1).getAttribute('data-tip');
    assert.match(tip, /shops 420 a week/);
    const head = await page.locator('#importPlan .sechead').first().textContent();
    assert.match(head, /1 tight/);
    assert.match(head, /1 paused/);
  } finally { await page.close(); }
});

test('every change on the checklist is a fact\'s figure', async () => {
  const page = await board(fixture());
  try {
    assert.deepEqual(await actions(page), [
      {kind: 'Weekly imports', item: 'Flour', current: 14000, proposed: 14420, tight: true, paused: false},
      {kind: 'Weekly imports', item: 'Sugar', current: null, proposed: null, tight: false, paused: true},
      // 24/7 sizes a line at capacity with no margin: a day of the machines.
      {kind: 'Factory daily top-ups', item: 'Flour', current: 1400, proposed: 1600, tight: false, paused: false},
      {kind: 'Check the delivery route', item: 'Milk', current: null, proposed: null, tight: false, paused: false},
      // The gym's shelf is on no plan; the hub that holds its soda could send it.
      {kind: 'Shop daily top-ups', item: 'Soda Can', current: 0, proposed: 70, tight: false, paused: false},
    ]);
    const topups = await page.locator('#topupPlan').textContent();
    assert.match(topups, /1[,.]600/);
    assert.match(topups, /1 short/);
    // Today's card leaves the tight Flour order out.
    assert.equal(await page.locator('#planImportsCard .soon').textContent(), '4 TO CHANGE');
  } finally { await page.close(); }
});

test('Demand sizing reads the facts\' Demand figures, and says where a shop is still ramping', async () => {
  const page = await board(fixture(), {mode: 'dem'});
  try {
    const flour = (await importRows(page)).find(r => r.item === 'Flour');
    assert.match(flour.used, /^10,920 may still be ramping$/);
    assert.equal(flour.box, '14000');
    assert.match(flour.verdict, /covered/);
    const ramp = await page.locator('#importPlan .sz-ramp').first().getAttribute('data-tip');
    assert.match(ramp, /Cake Shop Midtown/);
    assert.match(await page.locator('#topupPlan').textContent(), /1,160\s*may still be ramping/);
    assert.deepEqual((await actions(page)).map(a => [a.kind, a.item]), [
      ['Weekly imports', 'Sugar'], ['Check the delivery route', 'Milk'], ['Shop daily top-ups', 'Soda Can']]);
    // The switch sits beside the Orders tools, on Demand.
    assert.equal(await page.locator('#logisticsSizing a.on').textContent(), 'Demand');
  } finally { await page.close(); }
});

test('the switch remembers the sizing on the device and redraws the board', async () => {
  const page = await board(fixture());
  try {
    await page.evaluate(() => { window.redrawn = 0; renderAll = () => { window.redrawn++; drawLogistics(); }; });
    await page.locator('#logisticsSizing').getByText('Demand').click();
    assert.equal(await page.evaluate(() => [sizing, localStorage.getItem('ba_dash_sizing'), window.redrawn].join()), 'dem,dem,1');
    assert.match(await page.locator('#importPlan').textContent(), /10,920/);
    await page.locator('#logisticsSizing').getByText('24/7').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('ba_dash_sizing')), 'cap');
  } finally { await page.close(); }
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
    const shops = await page.evaluate(() => { stockView = 'shops'; drawStock(); return document.getElementById('stock').textContent; });
    assert.match(shops, /—wholesale 300 a week/);
    assert.match(shops, /short\s*wholesale 430 a week/);
    assert.doesNotMatch(shops, /no plan/);
  } finally { await page.close(); }
});

test("Orders lists a route-fed depot's daily top-up from its fact, naming the site that sets it", async () => {
  const data = fixture();
  // The hub's soda, fed only by the bakery's plan: its busiest day outruns the top-up.
  data.supply.facts[0].soda = {st: 'short', why: 'target', lvl: 'critical', role: 'depot', cad: 'daily',
    use: 100, need: 115, have: 80, setTo: 120, imp: false, from: 1};
  const page = await board(data);
  try {
    const act = (await page.evaluate(() => window.fixtureActions)).find(a => a.kind === 'Depot daily top-ups');
    assert.deepEqual([act.kind, act.current, act.proposed, act.source, !!act.tight],
      ['Depot daily top-ups', 80, 120, 1, false]);
    assert.match(act.reason, /Bakery Factory/);
  } finally { await page.close(); }
});

test("Orders: a factory's paused contract the top-up falls short without is a change; one it covers is not", async () => {
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
        logisticsView = 'changes'; drawLogistics();
        return {head: document.querySelector('#importPlan .sechead').textContent,
                rows: [...document.querySelectorAll('#importPlan tbody tr')].map(r => r.cells[0].textContent.trim()),
                acts: window.fixtureActions.filter(a => a.item === 'Milk' && a.kind === 'Weekly imports')
                  .map(a => [a.kind, !!a.paused])};
      });
    } finally { await page.close(); }
  };
  const short = await read('critical');
  assert.match(short.head, /2 paused/);
  assert.ok(short.rows.some(r => r.startsWith('Milk')), JSON.stringify(short.rows));
  assert.deepEqual(short.acts, [['Weekly imports', true]]);
  const covered = await read('info');
  assert.match(covered.head, /1 paused/);
  assert.ok(!covered.rows.some(r => r.startsWith('Milk')), JSON.stringify(covered.rows));
  assert.deepEqual(covered.acts, []);
});

/* Facts shaped as extraction writes them for a real save: a gym's shelf a
   wholesale store fills each Monday (short, a warning while its stock reaches
   the drop), another tight, and a depot only a route from a factory fills,
   tight against its busiest day. Orders lists each in a group of its own. */
test('Orders shows Wholesale deliveries and Depot daily top-ups from facts shaped like a real save\'s', async () => {
  const data = fixture();
  data.businesses[4].lines.push({slug: 'energy', item: 'Energy Drink', units: 1026, rate: 176, price: 5},
                                {slug: 'chips', item: 'Chips', units: 100, rate: 100, price: 2});
  data.supply.facts[4] = {
    energy: {st: 'short', why: 'order', lvl: 'warn', role: 'shelf', cad: 'weekly', use: 1232, need: 1417,
      have: 1200, setTo: 1420, parts: {lines: 0, sites: 1232, route: 0}, imp: false, wholesale: true, day: 'Monday'},
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
     pressure: null, stock: 817, from: null, level: 'ok', wholesale: 900, wholesaleDay: 'Monday'}]);
  data.supply.facts[0].bread = {st: 'tight', why: 'target', lvl: 'warn', role: 'depot', cad: 'daily',
    use: 905, need: 1041, have: 1000, setTo: 1050, imp: false, from: 1};
  data.supply.facts[0].cups = {st: 'covered', why: 'route', lvl: 'ok', role: 'depot', cad: 'daily',
    use: 100, need: 115, have: 200, setTo: null, imp: false, from: 1};
  const page = await board(data);
  try {
    const read = view => page.evaluate(view => {
      logisticsView = view; drawLogistics();
      const rows = id => [...document.querySelectorAll(`#${id} tbody tr`)].map(r =>
        [...r.cells].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
      return {wholesale: rows('wholesalePlan'), depot: rows('depotTopupPlan'),
              head: document.querySelector('#wholesalePlan .sechead').textContent};
    }, view);
    const all = await read('all');
    const row = text => all.wholesale.find(r => r.includes(text)) || '';
    assert.equal(all.wholesale.length, 4);
    assert.match(row('Energy Drink'), /Energy Drink ?each Monday \| 1,232 \| 1,200 \| 1,420 ?raise \| short$/);
    assert.match(row('Soda Can'), /Soda Can ?each Monday \| 883 \| 900 \| 1,020 ?raise \| tight$/);
    assert.match(row('Chips'), /\| 700 \| 900 \| 120 ?bring in \| short$/);
    assert.match(row('Syrup'), /Import Hub.*\| Syrup ?each Monday \| 1,680 \| 1,000 \| 1,680 ?raise \| short$/);
    assert.match(all.head, /3 short/);
    assert.equal(all.depot.length, 2);
    assert.match(all.depot[0], /\| 905 \| 1,000 \| 1,050 ?raise \| .*Bakery Factory.* \| tight$/);
    // Needs a change: the covered route-fed line drops out, both wholesale rows stay.
    const changes = await read('changes');
    assert.equal(changes.depot.length, 1);
    assert.equal(changes.wholesale.length, 4);
    // The checklist has the depot's wholesale contract, from its fact, and the
    // shelf's stock to bring in before the delivery.
    const acts = await page.evaluate(() => window.fixtureActions.map(a =>
      [a.kind, a.site, a.item, a.current, a.proposed]));
    assert.ok(acts.some(a => a.join() === 'Wholesale deliveries,0,Syrup,1000,1680'), JSON.stringify(acts));
    assert.ok(acts.some(a => a.join() === 'Before the next delivery,4,Chips,,120'), JSON.stringify(acts));
  } finally { await page.close(); }
});

test('a paused backup a route covers is covered by route, with nothing to resume', async () => {
  const data = fixture();
  data.supply.facts[0].sugar = {...data.supply.facts[0].sugar, st: 'covered', why: 'route', lvl: 'ok', setTo: null,
    parts: {lines: 2800, sites: 0, route: 2800}};
  const page = await board(data);
  try {
    const sugar = (await importRows(page)).find(r => r.item === 'Sugar');
    assert.match(sugar.verdict, /covered by route/);
    assert.doesNotMatch(sugar.verdict, /resume/);
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
    const feed = await page.locator('#stock tbody tr', {hasText: 'Butter'}).textContent();
    assert.match(feed, /new/);
    assert.match(feed, /named in this browser/);
    // Its top-up has no figure until Python judges it, so nothing to set.
    const topup = await page.locator('#topupPlan tbody tr', {hasText: 'Butter'}).textContent();
    assert.match(topup, /new/);
    assert.ok((await actions(page)).every(a => a.item !== 'Butter'));
    // The line itself is named, and new.
    await page.evaluate(() => { stockView = 'lines'; drawStock(); });
    assert.match(await page.locator('#stock tbody tr', {hasText: 'Muffin'}).textContent(), /named by you\s*new/);
  } finally { await page.close(); }
});

test('Checks, Goods flow and Today read the same facts, by sizing', async () => {
  const page = await board(fixture());
  try {
    const view = async v => page.evaluate(v => { stockView = v; drawStock(); return document.getElementById('stock').textContent; }, v);
    // One status word per row; tight shows on Checks.
    assert.match(await view('imports'), /tight/);
    const idle = await view('idle');
    // The status word is one of the nine; "not routed" is the reason, with the shops.
    assert.match(idle, /idle\s*not routed: Garden Gym\s*53\/day/);
    assert.match(await view('shops'), /no plan[\s\S]*top-up to 70 from\s*Import Hub/);
    // The switch sits in the Checks toolbar for the sized views only.
    assert.equal(await page.locator('#stockSizing').count(), 0, 'not on Idle stock');
    await view('feed');
    assert.equal(await page.locator('#stockSizing').count(), 1);
    // Goods flow counts the hub's facts; Today has no tight, and Not routed is a kind.
    const flow = await page.evaluate(() => { drawFlow(); flowPickId = 'hub#1'; drawFlowDetail();
      return document.getElementById('flowDetail').textContent; });
    assert.match(flow, /1 paused/);
    assert.match(flow, /2 idle, 1 tight/);
    const today = async mode => page.evaluate(mode => { sizing = mode; drawAlerts();
      return [...document.querySelectorAll('#alerts .find')].map(f => f.dataset.id); }, mode);
    assert.deepEqual(await today('cap'), ['r8feed', 'r8paused', 'r8stalled', 'r8notrouted', 'r8dead']);
    assert.deepEqual(await today('dem'), ['r8paused', 'r8stalled', 'r8notrouted', 'r8dead']);
    assert.doesNotMatch(await page.locator('#alerts').textContent(), /tight/i);
  } finally { await page.close(); }
});

/* Real extraction, from the Python builders. Once _supply() sends facts, the
   tables and the checklist say exactly what they say; a payload without them
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
    + 'd = board_data(0.5,[contract(5000,5000,smart=False)],import_days=(7,))'},
  {name: 'a paused backup the route covers', code: 'from test_routed_supply import board_data,contract; '
    + 'd = board_data(1.0,[contract(5200,0,smart=True,active=False)])'},
]) {
  test(`parity with extraction: ${scenario.name}`, async t => {
    const data = JSON.parse(python(`import sys,json; sys.path.insert(0,"tests"); ${scenario.code}; print(json.dumps(d))`));
    if (!data.supply.facts) { t.skip('this extraction sends no supply facts yet'); return; }
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
      assert.equal(seen.rows.length, seen.imports.length, 'one Weekly imports row per import fact');
      const acts = await page.evaluate(() => window.fixtureActions);
      const weekly = acts.filter(a => a.kind === 'Weekly imports' && a.proposed !== null);
      assert.equal(weekly.length, seen.wanted.length);
      for (const [s, , setTo] of seen.wanted)
        assert.ok(weekly.some(a => a.site === s && a.proposed === setTo), `weekly ${setTo} at ${s}`);
      const daily = acts.filter(a => a.kind === 'Factory daily top-ups');
      assert.deepEqual(daily.map(a => [a.site, a.proposed]).sort(), seen.topups.map(([s, , v]) => [s, v]).sort());
    } finally { await page.close(); }
  });
}
