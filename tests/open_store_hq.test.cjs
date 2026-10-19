// HQ planning through the board's renderers and real extracted synthetic facts.
// No browser: finder interactions remain covered by open_store.test.cjs.
const {test, before} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {loadBoard} = require('./_board.cjs');
const {ROOT} = require('./_page.cjs');
const {selectPython} = require('../tools/verify.mjs');

let payload;
before(() => {
  payload = JSON.parse(execFileSync(selectPython(), ['-c',
    'import json; from tests.test_open_store import headquarters_payload; print(json.dumps(headquarters_payload()))'],
    {cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}));
});
function fixture(){
  const board = loadBoard({__payload: structuredClone(payload)});
  const run = code => vm.runInContext(code, board);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'web/map.js'), 'utf8'), board, {filename: 'web/map.js'});
  run(`D = __payload;
    var p = {id: 'hq', type: OS_HQ, key: 'ba:street_broadwaystreet#1', mode: 'firm', step: 'investment'};
    osPlans = [p]; osCur = p.id; osStep = p.step;`);
  return {board, run};
}
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('an HQ finder keeps its type without a demand reading and offers only available offices', () => {
  const {run} = fixture();
  run(`var finder = Object.create(CityMapView.prototype);
    finder.planning = {preset: {cat: osType(p.type).cat, type: p.type}};
    finder.fs = finder.planState(finder.planning.preset);
    finder.assets = {byKey: new Map()};`);
  const rows = JSON.parse(run('JSON.stringify(finder.finderRows())'));
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.bld.type === 'office' && r.f.demand === null));
  assert.equal(run('finder.fs.type'), 'ba:businesstype_headquarters');
  run('osBuilding(p.key).status = "mine"; osBuilding(p.key).occupant = null');
  assert.equal(run('finder.finderRows().length'), 2, 'an empty existing lease is available');
  run('osBuilding(p.key).occupant = {typeSlug: "ba:businesstype_lawfirm"}');
  assert.equal(run('finder.finderRows().length'), 1, 'an occupied office is excluded');
});

test('HQ is selectable and both investment modes render all fifteen workstation pieces', () => {
  const {run} = fixture();
  assert.match(run('osWhatHtml()'), /data-os-new="ba:businesstype_headquarters">Headquarters/);
  for(const mode of ['firm', 'self']){
    run(`p.mode = '${mode}'`);
    const html = run('osInvestHtml(p)'), shown = text(html);
    assert.match(shown, /5 workstations by default/);
    for(const role of ['Purchasing Agent', 'Logistics Manager', 'HR Manager', 'Headhunter', 'Pricing Manager'])
      assert.ok(shown.includes(role), role);
    assert.match(shown, /Computer[\s\S]*Armchair[\s\S]*Office Desk/);
    assert.match(shown, /Default outfit 15 items Items \$9,150/);
    assert.match(shown, /\$700\/week in rent/);
    assert.equal(run('osInvestment(p, osBuilding(p.key)).deposit'), 6000);
    assert.equal(run('osInvestment(p, osBuilding(p.key)).furniture'), 9150);
  }
  run('osBuilding(p.key).status = "mine"; osBuilding(p.key).occupant = null');
  assert.equal(run('osInvestment(p, osBuilding(p.key)).deposit'), 0);
  assert.match(text(run('osInvestHtml(p)')), /no additional rental deposit/);
});

test('HQ running cost and its saved snapshot never claim profit or a break-even day', () => {
  const {run} = fixture();
  assert.match(run('osCtlHtml(p)'), /data-os-step="breakeven"[^>]*><i>4<\/i>Running cost/);
  assert.match(text(run('osStripHtml(p)')), /Running cost \$700\/week in rent/);
  const shown = text(run('osBreakHtml(p)'));
  assert.match(shown, /Wages are extra and depend on whom you hire and their hours/);
  assert.match(shown, /Headquarters has no sales income or break-even/);
  assert.equal(run('osModel(p.type, osBuilding(p.key))'), null);
  const snap = JSON.parse(run('JSON.stringify(osSnapClean(osSnapOf(p, osBuilding(p.key))))'));
  assert.equal(snap.profit, null);
  assert.equal(snap.days, null);
  assert.equal(snap.curve, null);
  assert.equal(snap.inv.furniture, 9150);
  run('osBuilding(p.key).rent = null');
  assert.match(text(run('osBreakHtml(p)')), /Rent is unavailable/);
});

test('an opened HQ checks its staff in game and compares costs without waiting for sales', () => {
  const {run} = fixture();
  run(`p.snap = osSnapOf(p, osBuilding(p.key));
    D.businesses.push({key: p.key, typeSlug: OS_HQ, status: 'hq', opened: 30, staff: 2, hasTraded: false});
    D.payback.sites[p.key] = {costCentre: true, cost: {...p.snap.inv, materials: p.snap.inv.decor}, profit: -5000};
    osMarkPlans();`);
  assert.equal(run('osStepReady("open", p)'), true);
  assert.equal(run('p.opened'), 30);
  const rows = JSON.parse(run('JSON.stringify(osUntilRows(p))'));
  assert.deepEqual(rows.map(r => [r.title, r.state]), [['Lease', 'done'], ['Furniture', 'todo'], ['Headquarters staff', 'todo']]);
  assert.match(rows[2].sub, /2 people on staff/);
  assert.match(rows[2].act, /assign each employee a computer workstation in BizMan/);
  assert.doesNotMatch(run('osUntilHtml(p)'), /data-os-write|Marketing|Logistics|payback/);
  const shown = text(run('osRoiHtml(p)'));
  assert.match(shown, /Running cost \$700\/week in rent/);
  assert.match(shown, /Plan and now[\s\S]*Furniture[\s\S]*Deposit/);
  assert.doesNotMatch(shown, /Profit a day|Paid back|No day with sales|no payback for|Days to break even/);
  assert.doesNotMatch(text(run('osPlansHtml()')), /paid back/);
  run('osPlansFor = osStore(); osPick("ba:street_broadwaystreet#17")');
  assert.equal(run('p.key'), 'ba:street_broadwaystreet#1', 'an opened HQ stays in history despite having no sales');
  assert.equal(run('osPlans.length'), 2);
  assert.equal(run('osPlan().key'), 'ba:street_broadwaystreet#17');
});
