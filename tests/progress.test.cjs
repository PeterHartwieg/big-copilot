// Chunk 2 of the redesign: one proposal from the row to the copy, the basis
// kept per company, the stores migrated, and the three meanings of done
// (docs/ui-progress-postconditions.md). The board runs on the synthetic R8
// fixture (tests/fixtures/r8_supply.json); a later board is the same payload
// taken in again, changed the way the game would hold it.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const FIXTURE = path.join(root, 'tests', 'fixtures', 'r8_supply.json');
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
let browser, html;
before(async () => {
  if(process.env.BOARD_TARGET === 'web') html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  else {
    const r = spawnSync(process.env.PYTHON || 'python', ['-c',
      'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
      {cwd: root, maxBuffer: 16 * 1024 * 1024});
    assert.equal(r.status, 0, r.stderr?.toString());
    html = r.stdout.toString();
  }
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

/* The progress store's record ids as one tab reads them, sorted; and a wait
   until a tab's storage holds `has` and none of `not` (another tab's write
   reaches it a moment later). */
const PG_STORE = 'ba_progress_v1:r8-fixture';
const pgStored = p => p.evaluate(k => Object.keys((JSON.parse(localStorage.getItem(k)) || {recs: {}}).recs).sort(), PG_STORE);
const pgSees = (p, has, not = []) => p.waitForFunction(([k, has, not]) => {
  const r = (JSON.parse(localStorage.getItem(k)) || {recs: {}}).recs;
  return has.every(i => i in r) && not.every(i => !(i in r));
}, [PG_STORE, has, not]);

/* A page with storage on a real origin: `seed` is written before the board
   takes its data (a store from an older board), `refuse` makes every write to
   storage throw, as a full quota does. */
async function board(t, {data = fixture(), seed = {}, refuse = false, mode = null} = {}){
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await page.route('https://**', r => r.abort());
  /* The page, and under BOARD_TARGET=web the files the built page loads
     beside it, from web/. */
  await page.route('http://progress.test/**', r => {
    const rel = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
    if(!rel) return r.fulfill({contentType: 'text/html', body: html});
    const f = path.join(root, 'web', rel);
    return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({path: f}) : r.fulfill({status: 404, body: ''});
  });
  await page.goto('http://progress.test/');
  await page.evaluate(([data, seed, refuse, mode]) => {
    localStorage.clear();
    Object.entries(seed).forEach(([k, v]) => localStorage.setItem(k, v));
    if(refuse){ const real = Storage.prototype.setItem; Storage.prototype.setItem = function(){ throw new Error('quota'); }; window.realSet = real; }
    document.body.classList.add('has-board');
    takeData(data);
    if(mode) sizing = mode;
    sbSelOff = true; sbSel = null;
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    drawSupplyStrip(); drawChangesView(); drawImportsView(); drawDeliveriesView(); drawProductionView(); wireAll();
  }, [data, seed, refuse, mode]);
  return page;
}
const redraw = page => page.evaluate(() => { drawSupplyStrip(); drawChangesView(); drawImportsView(); drawDeliveriesView(); drawProductionView(); wireAll(); });
const HUB_FLOUR = JSON.stringify(['hub#1', 'flour']);

test('the basis is kept per company: the device key is the fallback, and one company never sets another\'s', async t => {
  const page = await board(t, {seed: {ba_dash_sizing: 'dem'}});
  // No choice of its own yet: the device-wide choice every board used before.
  assert.equal(await page.evaluate(() => sizing), 'dem');
  await page.evaluate(() => { szPick('cap'); });
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem('ba_dash_sizing:r8-fixture'), localStorage.getItem('ba_dash_sizing')]), ['cap', 'dem'],
    'the pick is the company\'s; the device key is never written again');
  // Another company, with no choice of its own, still reads the fallback.
  const other = await page.evaluate(() => { const d = JSON.parse(JSON.stringify(D)); d.meta.character = 'other-co'; takeData(d); return sizing; });
  assert.equal(other, 'dem');
  await page.evaluate(() => szPick('dem'));
  // And back to the first: its own pick stands.
  const first = await page.evaluate(() => { const d = JSON.parse(JSON.stringify(D)); d.meta.character = 'r8-fixture'; takeData(d); return sizing; });
  assert.equal(first, 'cap');
  // Without storage the pick lasts as long as the page.
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; szPick('dem'); });
  assert.equal(await page.evaluate(() => szRead()), 'dem');
});

test('a figure kept by the previous board has no basis: Needs review, out of every write, until kept or reset', async t => {
  const page = await board(t, {seed: {'ba_import_set_v2:r8-fixture': JSON.stringify({[HUB_FLOUR]: {value: 15000, inGame: 14000}})}});
  // Copied to version 3 with no basis; version 2 stays, for a rollback to find.
  assert.deepEqual(await page.evaluate(() => [JSON.parse(localStorage.getItem('ba_import_set_v3:r8-fixture')), JSON.parse(localStorage.getItem('ba_import_set_v2:r8-fixture'))]),
    [{[HUB_FLOUR]: {value: 15000, inGame: 14000, basis: null}}, {[HUB_FLOUR]: {value: 15000, inGame: 14000}}]);
  const row = () => page.evaluate(() => { const r = sbData().rows.find(x => x.kind === 'Weekly imports' && x.slug === 'flour');
    return [r.proposed, r.review, r.basis]; });
  assert.deepEqual(await row(), [15000, true, null], 'the figure is kept, and asks for a review');
  assert.equal(await page.evaluate(() => gwImportPlan(null).some(l => l.r.slug === 'flour')), false, 'never written as it stands');
  // The Changes row and the card say so.
  assert.match(await page.locator('#secChanges .sbc-row', {hasText: 'Flour'}).first().textContent(), /Needs review/);
  await page.evaluate(() => { sbSelOff = false; sbSel = {s: 0, slug: 'flour'}; drawImportsView(); wireAll(); });
  assert.match(await page.locator('#sbCard .sbi-basis').textContent(), /kept from before the board recorded a basis/);
  // The copied line says it too.
  assert.match(await page.evaluate(() => orderChecklistText(sbData().rows, 'T')), /Flour: 14000 -> 15000 units\/week\..*review it first/);
  // Kept for the basis on screen: an ordinary figure of the player's, written like any other.
  await page.locator('#sbCard [data-imp-keep]').click();
  assert.deepEqual(await row(), [15000, false, 'cap']);
  assert.equal(await page.evaluate(() => gwImportPlan(null).some(l => l.r.slug === 'flour')), true);
});

test('with storage refused the old figure stays where it was, and the page still reviews it', async t => {
  const page = await board(t, {refuse: true, seed: {'ba_import_set_v2:r8-fixture': JSON.stringify({[HUB_FLOUR]: {value: 15000, inGame: 14000}})}});
  assert.equal(await page.evaluate(() => localStorage.getItem('ba_import_set_v2:r8-fixture')) !== null, true, 'version 2 is kept');
  assert.equal(await page.evaluate(() => localStorage.getItem('ba_import_set_v3:r8-fixture')), null);
  assert.equal(await page.evaluate(() => sbData().rows.find(x => x.slug === 'flour' && x.kind === 'Weekly imports').review), true);
});

test('figures, marks and progress belong to one company', async t => {
  const page = await board(t, {seed: {
    'ba_import_set_v3:r8-fixture': JSON.stringify({[HUB_FLOUR]: {value: 15000, inGame: 14000, basis: 'cap'}}),
    'ba_import_set_v3:other-co': JSON.stringify({[HUB_FLOUR]: {value: 99000, inGame: 14000, basis: 'dem'}}),
  }});
  assert.equal(await page.evaluate(() => sbData().rows.find(x => x.slug === 'flour' && x.kind === 'Weekly imports').proposed), 15000);
  await page.locator('#secImports tr[data-slug="flour"] .sb-tick').click();
  await page.evaluate(() => pgRecord({id: 'imports|hub#1|flour|weekly|15000', family: 'imports', target: {depot: 'hub#1', slug: 'flour'},
    expect: {contracts: [], inGame: 15000}, rowKeys: [], label: 'Flour'}));
  // The same map, another character: none of it.
  const other = await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(D)); d.meta.character = 'other-co'; d.supply.factories.character = 'other-co';
    takeData(d); orderMarkCache.clear(); sbStamp++;
    const r = sbData().rows.find(x => x.slug === 'flour' && x.kind === 'Weekly imports');
    return {proposed: r.proposed, marked: sbData().marks.size, progress: Object.keys(pgStore().recs).length};
  });
  assert.deepEqual(other, {proposed: 99000, marked: 0, progress: 0});
});

test('a mark stands through a basis switch and back; a changed figure is a new row that needs its own', async t => {
  const page = await board(t);
  await page.locator('#secImports tr[data-slug="flour"] .sb-tick').click();
  const marked = () => page.evaluate(() => sbData().rows.filter(r => sbData().marks.has(r.key)).map(r => r.slug));
  assert.deepEqual(await marked(), ['flour']);
  await page.evaluate(() => { sizing = 'dem'; sbStamp++; drawSupplyStrip(); });
  await page.evaluate(() => { sizing = 'cap'; sbStamp++; drawSupplyStrip(); });
  assert.deepEqual(await marked(), ['flour'], 'switching the basis and back loses no mark');
  // A figure typed now is another change: the old mark does not mark it.
  await page.evaluate(() => { impSetKeep(impSetId('hub#1', 'flour'), {value: 16000, inGame: 14000, basis: 'cap'}); drawSupplyStrip(); });
  assert.deepEqual(await marked(), []);
});

test('the recurring order and the one-time catch-up are two changes, each with its own mark', async t => {
  const data = fixture();
  // Flour at the hub also runs dry before Monday: a catch-up to buy by hand.
  const ir = data.supply.imports.find(r => r.slug === 'flour' && r.s === 0) || data.supply.imports[0];
  Object.assign(ir, {slug: 'flour', s: 0, item: 'Flour', catchUp: 600, runsOut: 'Saturday', shortBy: 1, stockCover: 3.2});
  data.supply.facts[0].flour = {...data.supply.facts[0].flour, st: 'short', why: 'shortfall', lvl: 'critical'};
  const page = await board(t, {data});
  await page.evaluate(() => { sbSelOff = false; sbSel = {s: 0, slug: 'flour'}; drawImportsView(); wireAll(); });
  const card = page.locator('#sbCard');
  assert.equal(await card.locator('.sbi-sec').count(), 2, 'the order and the gap, side by side');
  assert.match(await card.locator('.sbi-gap').textContent(), /~600\s*units, bought now/);
  // No write offers itself for the purchase, and no line says so (A4).
  assert.equal(await card.locator('.sbi-gap [data-gw]').count(), 0);
  assert.doesNotMatch(await card.locator('.sbi-gap').textContent(), /game-link/);
  // No copy of its own: Manual instructions says the same (Peter's testing, A2).
  assert.equal(await card.locator('[data-sb-copy]').count(), 0);
  // The card has no mark buttons of its own (declutter U20): each change has
  // its tick on its own row of Changes.
  assert.equal(await card.locator('[data-sb-mark]').count(), 0);
  const keys = await page.evaluate(() => sbData().rows.filter(r => r.slug === 'flour' && r.site === 0 && r.view === 'imports').map(r => r.key));
  await page.evaluate(() => { openRoute('supply/changes'); });
  const tick = key => page.locator(`#secChanges .sbc-row[data-key="${key.replace(/"/g, '\\"')}"] .sb-tick`);
  const st = () => page.evaluate(() => sbData().rows.filter(r => r.slug === 'flour' && r.site === 0 && r.view === 'imports')
    .map(r => [r.kind, pgState(sbData(), r)]));
  await tick(keys[1]).click();
  assert.deepEqual(await st(), [['Weekly imports', 'suggested'], ['Before the next delivery', 'marked']]);
  await tick(keys[0]).click();
  assert.deepEqual(await st(), [['Weekly imports', 'marked'], ['Before the next delivery', 'marked']]);
  // Copy the changes: both, each in its own words.
  const copied = await page.evaluate(() => orderChecklistText(sbData().rows.filter(r => r.slug === 'flour' && r.site === 0 && r.view === 'imports'), 'T'));
  assert.match(copied, /Flour: 14000 -> 14420 units\/week/);
  assert.match(copied, /Flour: add 600 units once/);
});

test('one figure and one basis from the row to the copy, under both bases', async t => {
  for(const mode of ['cap', 'dem']){
    const page = await board(t, {mode});
    // The player's own figure, typed on the card.
    await page.evaluate(() => { sbSelOff = false; sbSel = {s: 0, slug: 'flour'}; drawImportsView(); wireAll(); });
    const box = page.locator('#sbCard input.imp-in');
    await box.fill('15500'); await box.press('Enter');
    // Kept once the card is drawn again with the figure as the player's own.
    await page.waitForFunction(() => /set while planning/.test(document.querySelector('#sbCard .sbi-basis')?.textContent || ''));
    const basis = mode === 'cap' ? 'full production' : 'shop demand';
    // The card: the box, what it is planned for, Why and the manual instructions.
    assert.match(await page.locator('#sbCard .sbi-basis').textContent(), new RegExp(`set while planning for ${basis}`));
    await page.click('#sbCard [data-sbi-panel=why]');
    // Planned on the basis on screen: the switch says which, the heading does not again.
    assert.match(await page.locator('#sbCard .sbi-panel[data-panel=why] h4').textContent(), /^Why 15,500 a week$/i);
    await page.click('#sbCard [data-sbi-panel=manual]');
    assert.match(await page.locator('#sbCard .sbi-panel[data-panel=manual]').textContent(), /set the amount to 15,500 a week/);
    // Changes, its copy, and the write the game link would send.
    const got = await page.evaluate(() => {
      const r = sbData().rows.find(x => x.kind === 'Weekly imports' && x.slug === 'flour');
      const plan = gwImportPlan(null, gwImportRows.find(x => x.slug === 'flour' && x.s === 0).impId)[0];
      return {proposed: r.proposed, basis: r.basis, text: orderChecklistText([r], 'T', sizing), write: plan ? plan.r.value : null};
    });
    assert.deepEqual([got.proposed, got.basis, got.write], [15500, mode, 15500]);
    // The copy's header names the basis; a line names it only when it is the other one.
    assert.match(got.text, /14000 -> 15500 units\/week/);
    assert.match(got.text, new RegExp(`Planned for ${basis}:`));
    assert.doesNotMatch(got.text, /Planned for [a-z ]+\./);
    await redraw(page);
    assert.match(await page.locator('#secChanges .sbc-row', {hasText: 'Flour'}).first().textContent(), /15,500/);
    // The other basis keeps the figure, beside its own suggestion, with a way back to it.
    await page.evaluate(m => { sizing = m === 'cap' ? 'dem' : 'cap'; sbStamp++; drawSupplyStrip(); drawImportsView(); wireAll(); }, mode);
    assert.equal(await page.locator('#sbCard input.imp-in').inputValue(), '15500');
    assert.match(await page.locator('#sbCard .sbi-basis').textContent(), new RegExp(`set while planning for ${basis}.*on screen now`));
    assert.equal(await page.locator('#sbCard .sbi-basis [data-imp-reset]').count(), 1);
  }
});

test('the factory hours an import is planned on: named on the card, a step of their own, a row of their own, under both bases', async t => {
  // Full production: the Flour order assumes the cake line runs 24 h; it runs 12.
  const cap = await board(t);
  await cap.evaluate(() => { sbSelOff = false; sbSel = {s: 0, slug: 'flour'}; drawImportsView(); wireAll(); });
  assert.match(await cap.locator('#sbCard .sbi-dep').textContent(), /Needs a factory-hours change\..*Cake.*staffed 12 h a day → 24 h a day each/s);
  assert.match(await cap.locator('#sbCard .sbi-dep').textContent(), /less than planned/);
  await cap.click('#sbCard [data-sbi-panel=manual]');
  assert.match(await cap.locator('#sbCard .sbi-steps').textContent(), /Schedule: staff Cake 24 h a day on each of its 2 machines \(now 12 h\)\./);
  assert.doesNotMatch(await cap.locator('#sbCard .sbi-steps').textContent(), /game link/);
  const hours = () => cap.evaluate(() => sbData().rows.filter(r => r.kind === 'Factory run hours').map(r => [r.current, r.proposed, (r.forImports || []).map(x => x.item).join()]));
  assert.deepEqual(await hours(), [[12, 24, 'Flour']]);
  assert.match(await cap.locator('#secChanges .sbc-row[data-key*="Factory run hours"]').textContent(), /factory staffing, for Flour/);
  // The link offers no write for it.
  assert.equal(await cap.evaluate(() => gwImportPlan(null).some(l => l.r.item === 'Cake')), false);
  // Shop demand: Flour needs no change, so nothing depends on the hours; a
  // figure typed there is planned on 10 h, which the line does not run.
  const dem = await board(t, {mode: 'dem'});
  assert.deepEqual(await dem.evaluate(() => sbData().rows.filter(r => r.kind === 'Factory run hours').length), 0);
  await dem.evaluate(() => { impSetKeep(impSetId('hub#1', 'flour'), {value: 12000, inGame: 14000, basis: 'dem'}); drawSupplyStrip(); drawChangesView(); });
  const row = await dem.evaluate(() => sbData().rows.filter(r => r.kind === 'Factory run hours').map(r => [r.current, r.proposed, !!r.dep]));
  assert.deepEqual(row, [[12, 10, true]]);
  await dem.evaluate(() => { sbSelOff = false; sbSel = {s: 0, slug: 'flour'}; drawImportsView(); wireAll(); });
  assert.match(await dem.locator('#sbCard .sbi-dep').textContent(), /staffed 12 h a day → 10 h a day each.*more than planned/s);
});

test('Applied is set only by a write that went through; Confirmed only by a later board that holds it', async t => {
  const page = await board(t);
  const state = () => page.evaluate(() => { const r = pgOfFamily('imports')[0]; return r ? r.state : null; });
  // A mark, a filter or a redraw is no write.
  await page.locator('#secImports tr[data-slug="flour"] .sb-tick').click();
  await redraw(page);
  assert.equal(await state(), null);
  // The write's answer: contract c1 now holds 14,420 of flour at the hub.
  await page.evaluate(() => {
    const r = gwImportRows.find(x => x.slug === 'flour' && x.s === 0);
    const line = gwImportPlan(null, r.impId)[0];
    pgImportsDone([line], {rows: [{id: line.contracts[0].c.id, reactivated: false,
      products: [{itemName: 'flour', warehouse: gwAddress('hub#1'), before: 14000, amount: 14420}]}]});
  });
  assert.equal(await state(), 'applied');
  // Changes, when next shown, says so rather than the mark.
  await page.evaluate(() => { sub.supply = 'changes'; drawStale('supply'); });
  assert.match(await page.locator('#secChanges .sbc-row', {hasText: 'Flour'}).first().textContent(), /Applied · awaiting refresh/);
  // The same board again is no evidence.
  await page.evaluate(() => { pgJudged = 0; pgEvaluate(); });
  assert.equal(await state(), 'applied');
  // A later read whose contract holds the figure: Confirmed, and Changes lists it.
  await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(D));
    const c = d.supply.factories.depots[0].flour.contracts[0]; c.amount = 14420; d.supply.factories.depots[0].flour.weekly = 14420;
    d.meta.hour = 13; takeData(d); sbStamp++; drawSupplyStrip(); drawChangesView();
  });
  assert.equal(await state(), 'confirmed');
  assert.match(await page.locator('#secChanges .sbc-settled').textContent(), /Confirmed · day 30/);
  // A later read that holds another figure is not a confirmation.
  await page.evaluate(() => {
    pgRecord({id: 'imports|hub#1|sugar|weekly|3000', family: 'imports', target: {depot: 'hub#1', slug: 'sugar'},
      expect: {contracts: [{id: D.supply.factories.depots[0].sugar.contracts[0].id, amount: 3000, activate: true}], inGame: 3000}, rowKeys: [], label: 'Sugar'});
    const d = JSON.parse(JSON.stringify(D)); d.meta.hour = 14; takeData(d); pgEvaluate(); drawSupplyStrip();
  });
  assert.equal(await page.evaluate(() => pgOfFamily('imports').find(r => r.target.slug === 'sugar').state), 'changed');
  // An undo takes a write's records back.
  await page.evaluate(() => pgDrop(['imports|hub#1|sugar|weekly|3000']));
  assert.equal(await page.evaluate(() => pgOfFamily('imports').some(r => r.target.slug === 'sugar')), false);
  // An older board (a save from before the write) judges nothing.
  await page.evaluate(() => {
    pgRecord({id: 'x', family: 'imports', target: {depot: 'hub#1', slug: 'milk'}, expect: {contracts: [], inGame: 0}, rowKeys: [], label: 'Milk'});
    const d = JSON.parse(JSON.stringify(D)); d.meta.day = 20; takeData(d); pgEvaluate();
  });
  assert.equal(await page.evaluate(() => pgStore().recs.x.state), 'applied');
});

test('a schedule is confirmed by its shift print on a later read; a hire by each person at the site sent to', async t => {
  const data = fixture();
  data.businesses[2].shiftPrint = 'aaaaaaaa';
  data.staffing = [{key: data.businesses[2].key, people: [{id: 'E1', name: 'Ana'}]}];
  const page = await board(t, {data});
  const key = data.businesses[2].key;
  await page.evaluate(k => pgScheduleDone(k, {row: {full: false}}, {after: {print: 'bbbbbbbb'}, added: 3, removed: 2}), key);
  const sched = () => page.evaluate(() => pgOfFamily('schedule')[0].state);
  assert.equal(await sched(), 'applied');
  await page.evaluate(k => { const d = JSON.parse(JSON.stringify(D)); d.businesses.find(b => b.key === k).shiftPrint = 'bbbbbbbb'; takeData(d); pgEvaluate(); }, key);
  assert.equal(await sched(), 'confirmed');
  // A hire and a move: one seen at its site, one not yet (a warehouse keeps no list).
  await page.evaluate(k => pgHireDone({hires: [{candidateId: 'C1', address: gwAddress(k)}], moves: [{employeeId: 'E9', to: gwAddress('hub#1')}]},
    {hired: [{candidateId: 'C1'}], moved: [{employeeId: 'E9'}], skipped: [{candidateId: 'C2', reason: 'gone'}]}), key);
  const hire = () => page.evaluate(() => { const r = pgOfFamily('hire')[0]; return [r.state, r.expect.hired, r.expect.moved, r.expect.skipped]; });
  assert.deepEqual(await hire(), ['applied', 1, 1, 1]);
  await page.evaluate(k => { const d = JSON.parse(JSON.stringify(D)); d.staffing[0].people.push({id: 'C1', name: 'New'}); d.meta.minute = 5; takeData(d); pgEvaluate(); }, key);
  assert.deepEqual((await hire())[0], 'partly', 'the hire is seen, the move to a warehouse is not');
  // Staff needs says how many were seen, never the clock the board judged them at.
  const said = await page.evaluate(() => { drawNeeds(); return document.querySelector('#secNeeds .nd-pg').textContent; });
  assert.match(said, /1 of 2 seen at their sites so far/);
  assert.doesNotMatch(said, /object/);
  // Someone found at another site than the one they were sent to: not confirmed.
  await page.evaluate(k => { const d = JSON.parse(JSON.stringify(D)); d.staffing.push({key: 'dist#6', people: [{id: 'E9', name: 'Moved'}]}); d.meta.minute = 9; takeData(d); pgEvaluate(); }, key);
  assert.equal((await hire())[0], 'changed');
});

test('a write at a fractional link minute is judged by a board at that same whole minute (a paused game)', async t => {
  const data = fixture();
  data.businesses[2].shiftPrint = 'aaaaaaaa';
  data.meta.day = 96; data.meta.hour = 7; data.meta.minute = 16;
  const key = data.businesses[2].key;
  const page = await board(t, {data});
  // The link reads the game's float minute; the save holds the whole one.
  await page.evaluate(k => {
    SOURCE.link = () => ({day: 96, hour: 7, minute: 16.3715});
    pgScheduleDone(k, {row: {full: false}}, {after: {print: 'bbbbbbbb'}, added: 3, removed: 2});
    const d = JSON.parse(JSON.stringify(D)); d.businesses.find(b => b.key === k).shiftPrint = 'bbbbbbbb'; takeData(d); pgEvaluate();
  }, key);
  assert.equal(await page.evaluate(() => pgOfFamily('schedule')[0].state), 'confirmed');
});

test('a board at the write\'s own minute that still shows the old week says nothing; a later one says Not confirmed', async t => {
  const data = fixture();
  data.businesses[2].shiftPrint = 'aaaaaaaa';
  data.meta.day = 96; data.meta.hour = 7; data.meta.minute = 16;
  const key = data.businesses[2].key;
  const page = await board(t, {data});
  const state = () => page.evaluate(() => pgOfFamily('schedule')[0].state);
  // A read taken just before the write, arriving just after it.
  await page.evaluate(k => {
    SOURCE.link = () => ({day: 96, hour: 7, minute: 16.3715});
    pgScheduleDone(k, {row: {full: false}}, {after: {print: 'bbbbbbbb'}, added: 3, removed: 2});
    takeData(JSON.parse(JSON.stringify(D))); pgEvaluate();
  }, key);
  assert.equal(await state(), 'applied');
  await page.evaluate(() => { const d = JSON.parse(JSON.stringify(D)); d.meta.minute = 17; takeData(d); pgEvaluate(); });
  assert.equal(await state(), 'changed');
});

// --- round 1 of the chunk's review -------------------------------------------

/* The synthetic company of tests/save_fixtures.py on day 47, as a payload:
   its brewery's two Beer machines are staffed 12 h and 0 h a day, and the
   Water they eat comes from 1 Pier through HART. Hub. */
let day47 = null;
const DAY47 = () => {
  if(!day47){
    const r = spawnSync(process.env.PYTHON || 'python', ['-c', [
      'import sys, os, json, tempfile',
      'sys.path.insert(0, "tests")',
      'import save_fixtures as f, ba_dashboard',
      'from ba_save import Names, load_save',
      'd = tempfile.mkdtemp(); p = os.path.join(d, "s.hsg"); f.write_data_save(p, 47)',
      'sys.stdout.write(json.dumps(ba_dashboard.extract(load_save(p), Names(f.data_names()), None)))'].join('\n')],
      {cwd: root, maxBuffer: 64 * 1024 * 1024, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
    assert.equal(r.status, 0, r.stderr?.toString());
    day47 = r.stdout.toString();
  }
  return JSON.parse(day47);
};
const HUB47 = 'ba:street_eighthavenue#4', WATER = 'ba:itemname_water';
/* The same page after a reload: storage as it was, the board taken in again. */
const takeAgain = (page, data) => page.evaluate(data => {
  document.body.classList.add('has-board');
  takeData(data);
  sbSelOff = true; sbSel = null;
  document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
  document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
  drawSupplyStrip(); drawChangesView(); wireAll();
}, data);

test('after a reload, a board at the write\'s minute that holds the old week says nothing; one that holds the new week confirms it (a paused game)', async t => {
  const data = fixture();
  data.businesses[2].shiftPrint = 'aaaaaaaa';
  const key = data.businesses[2].key;
  const page = await board(t, {data});
  // A few boards in this page load first: the write is not the first thing counted.
  await page.evaluate(k => {
    takeData(JSON.parse(JSON.stringify(D))); takeData(JSON.parse(JSON.stringify(D)));
    pgScheduleDone(k, {row: {full: false}}, {after: {print: 'bbbbbbbb'}, added: 3, removed: 2});
  }, key);
  const state = () => page.evaluate(() => pgOfFamily('schedule')[0].state);
  assert.equal(await state(), 'applied');
  await page.reload();
  // The save file read again at the write's own minute may hold the bytes from before it.
  await takeAgain(page, data);
  assert.equal(await state(), 'applied', 'the old week at the write\'s minute after a reload judges nothing');
  // A read at the same minute that holds the week written: Confirmed, after the reload.
  const later = JSON.parse(JSON.stringify(data));
  later.businesses[2].shiftPrint = 'bbbbbbbb';
  await takeAgain(page, later);
  assert.equal(await state(), 'confirmed');
});

test('a figure typed under one basis keeps it after a switch; the hours it assumes are no step where the basis on screen plans others', async t => {
  const page = await board(t);
  // Flour typed at 15,500 while planning for full production: the cake line is planned on 24 h.
  await page.evaluate(() => { impSetKeep(impSetId('hub#1', 'flour'), {value: 15500, inGame: 14000, basis: 'cap'}); sbStamp++; });
  await page.evaluate(() => { sizing = 'dem'; sbStamp++; drawSupplyStrip(); });
  const got = await page.evaluate(() => {
    const d = sbData();
    const r = sbImportRow(d, 0, 'flour');
    const w = d.rows.find(x => x.kind === 'Weekly imports' && x.slug === 'flour');
    return {deps: r.deps.map(x => [x.need, x.basis]), hours: (w.hours || []).map(h => h.proposed),
      text: orderChecklistText([w, ...(w.hours || [])], 'T', sizing)};
  });
  assert.deepEqual(got.deps, [[24, 'cap']], 'the hours of the plan the figure was set for');
  // Shop demand plans the cake line for 10 h: 24 h is no step of this checklist.
  assert.deepEqual(got.hours, []);
  assert.match(got.text, /Flour: 14000 -> 15500 units\/week\..*Its figure assumes Cake at .* runs 24 hours a day, as full production plans; that is not a step here, where shop demand plans 10 h\..*Planned for full production\./);
  assert.doesNotMatch(got.text, /Cake: run/);
  assert.match(got.text, /Lines that name another basis keep the figure they were set for; the factory hours are this basis's/);
  // The card says so, and its manual steps have no hours step.
  await page.evaluate(() => { sbSelOff = false; sbSel = {s: 0, slug: 'flour'}; drawImportsView(); wireAll(); });
  assert.match(await page.locator('#sbCard .sbi-dep').textContent(), /Planned on other factory hours\..*15,500 assumes Cake at .* runs 24 h a day, as full production plans; shop demand plans 10 h/s);
  await page.click('#sbCard [data-sbi-panel=manual]');
  assert.doesNotMatch(await page.locator('#sbCard .sbi-steps').textContent(), /staff Cake/);
});

test('an import figure typed on full production, then shop demand on screen: Why explains full production, and the machines get one hours step', async t => {
  const page = await board(t, {data: DAY47()});
  const hub = await page.evaluate(k => D.businesses.findIndex(b => b.key === k), HUB47);
  await page.evaluate(([s, slug, k]) => {
    sizing = 'cap'; impSetKeep(impSetId(k, slug), {value: 17000, inGame: 3000, basis: 'cap'}); sbStamp++;
    sizing = 'dem'; sbStamp++; sbSelOff = false; sbSel = {s, slug}; drawSupplyStrip(); drawImportsView(); wireAll();
  }, [hub, WATER, HUB47]);
  const want = await page.evaluate(([s, slug]) => {
    const pick = m => { const w = szFactFor(s, slug, m); return w.import || w; };
    return {cap: pick('cap').use, dem: pick('dem').use};
  }, [hub, WATER]);
  assert.notEqual(want.cap, want.dem, 'the two bases use different weeks here');
  await page.click('#sbCard [data-sbi-panel=why]');
  const why = page.locator('#sbCard [data-panel=why]');
  assert.match(await why.locator('h4').textContent(), /17,000 a week · planned for full production/i);
  const uses = await why.locator('tr', {hasText: 'Uses a week'}).locator('td').nth(1).textContent();
  assert.equal(uses, await page.evaluate(n => num(n), want.cap), 'the week full production uses, not shop demand\'s');
  assert.match(await why.textContent(), /With shop demand instead/);
  assert.doesNotMatch(await why.textContent(), /With full production instead/);
  // Changes and its copy: one hours step for the Beer machines, never two.
  const got = await page.evaluate(() => {
    const d = sbData();
    const hours = d.rows.filter(x => x.kind === 'Factory run hours' && x.slug === 'ba:itemname_beer');
    return {hours: hours.map(h => h.proposed), text: orderChecklistText(d.rows, 'T', sizing)};
  });
  assert.ok(got.hours.length <= 1, `one hours step for the Beer machines, got ${got.hours}`);
  assert.equal((got.text.match(/Beer: run/g) || []).length, got.hours.length);
  assert.doesNotMatch(got.text, /Beer: run [^\n]*-> 24 hours/, 'full production\'s 24 h is not a step on shop demand');
});

test('the factory hours an import assumes are each machine\'s: 12 h and 0 h at the day-47 brewery', async t => {
  const page = await board(t, {data: DAY47()});
  const hub = await page.evaluate(k => D.businesses.findIndex(b => b.key === k), HUB47);
  // Full production: both machines round the clock against 84 machine-hours a week staffed.
  await page.evaluate(([s, slug]) => { sbSelOff = false; sbSel = {s, slug}; drawImportsView(); wireAll(); }, [hub, WATER]);
  const dep = page.locator('#sbCard .sbi-dep');
  assert.match(await dep.textContent(), /Beer at HART\. Brewery \(2 machines\): staffed 12 h and 0 h a day → 24 h a day each/);
  // 25 Water a machine-hour: (336 - 84) × 25 a week less than the plan.
  assert.match(await dep.textContent(), /about 6,300 a week less than planned/);
  await page.click('#sbCard [data-sbi-panel=manual]');
  assert.match(await page.locator('#sbCard .sbi-steps').textContent(), /staff Beer 24 h a day on each of its 2 machines \(now 12 h and 0 h\)/);
  // Production's observation: 12 machine-hours a day, not the least-staffed machine's 0 twice.
  await page.evaluate(() => drawProductionView());
  assert.equal(await page.locator('#secProduction .sbp-tile.obs b').textContent(), '12');
  // Shop demand, a figure of the player's: 8 h a machine, 112 machine-hours against 84.
  await page.evaluate(([s, slug, k]) => {
    sizing = 'dem'; impSetKeep(impSetId(k, slug), {value: 2600, inGame: 3000, basis: 'dem'}); sbStamp++;
    sbSel = {s, slug}; drawSupplyStrip(); drawImportsView(); wireAll();
  }, [hub, WATER, HUB47]);
  assert.match(await dep.textContent(), /staffed 12 h and 0 h a day → 8 h a day each/);
  assert.match(await dep.textContent(), /about 700 a week less than planned/);
});

test('an old write\'s record lights a finding only where its line has no open change', async t => {
  const page = await board(t);
  const pill = slug => page.evaluate(slug => ovStatePill({ev: {slug}}, D.businesses[0]), slug);
  // Confirmed on an earlier read; the board now proposes Flour afresh.
  await page.evaluate(() => {
    pgRecord({id: 'imports|hub#1|flour|weekly|14000', family: 'imports', target: {depot: 'hub#1', slug: 'flour'},
      expect: {contracts: [], inGame: 14000}, rowKeys: ['an older row'], label: 'Flour'});
    pgStore().recs['imports|hub#1|flour|weekly|14000'].state = 'confirmed';
  });
  assert.ok(await page.evaluate(() => (sbData().at.get('0|flour') || []).length > 0), 'Flour has an open change');
  assert.equal(await pill('flour'), '', 'a new proposal is not the old write\'s');
  // A line with nothing open still says what the game confirmed.
  const quiet = await page.evaluate(() => Object.keys(D.supply.facts[0]).find(slug => !(sbData().at.get(`0|${slug}`) || []).length));
  assert.ok(quiet, 'a line of the hub with no change');
  await page.evaluate(slug => {
    pgRecord({id: `imports|hub#1|${slug}|weekly|1`, family: 'imports', target: {depot: 'hub#1', slug}, expect: {contracts: [], inGame: 1}, rowKeys: [], label: slug});
    pgStore().recs[`imports|hub#1|${slug}|weekly|1`].state = 'confirmed';
  }, quiet);
  assert.match(await pill(quiet), /Confirmed/);
});

test('Supply\'s view state is the company\'s, and keeps its sites by key', async t => {
  const page = await board(t);
  // One depot as the Imports scope, and its Flour under review.
  await page.evaluate(() => { sbScope.imports = 'site:hub#1'; sbSel = {s: 0, slug: 'flour'}; sbSelOff = false; });
  const snap = await page.evaluate(() => sbSnap());
  assert.deepEqual([snap.sel, snap.who], [{key: 'hub#1', slug: 'flour'}, 'r8-fixture']);
  // The same company's next board lists the hub elsewhere: the line follows it.
  const moved = await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(D)); const hub = d.businesses.shift(); d.businesses.push(hub);
    takeData(d); const s = sbSel && sbSel.s; takeData(JSON.parse(JSON.stringify(D))); return s;
  });
  assert.equal(moved, 5);
  // A snapshot restores by key; an entry from before keys (an index) keeps no line.
  assert.equal(await page.evaluate(snap => { sbRestore(snap); return sbSel.s; }, snap), 5);
  assert.equal(await page.evaluate(() => { sbRestore({sel: {s: 0, slug: 'flour'}}); return sbSel; }), null);
  // Another company's board starts every view afresh.
  const other = await page.evaluate(() => {
    sbScope.imports = 'site:hub#1'; sbSel = {s: 0, slug: 'flour'}; sbArrive = {view: 'imports', s: 0, slug: 'flour', crumb: 'x'};
    const d = JSON.parse(JSON.stringify(D)); d.meta.character = 'other-co'; takeData(d);
    return [sbScope.imports, sbSel, sbArrive];
  });
  assert.deepEqual(other, ['all', null, null]);
  // And an entry of the other company's restores nothing of its own.
  await page.evaluate(snap => { sbRestore(snap); }, {...snap, who: 'r8-fixture'});
  assert.deepEqual(await page.evaluate(() => [sbScope.imports, sbSel]), ['all', null]);
});

test('a site gone from the company is no scope: the view lists the company and the select says so', async t => {
  const page = await board(t);
  const got = await page.evaluate(() => {
    sbScope.imports = 'site:hub#1'; sbMode.imports = 'all';
    const d = JSON.parse(JSON.stringify(D)); d.businesses[0].key = 'hub#sold';
    d.supply.graph.nodes.forEach(n => { if(n.id === 'hub#1') n.id = 'hub#sold'; });
    takeData(d); drawImportsView();
    return {inScope: sbInScope('imports', 0), shown: document.querySelector('#secImports select[data-sb-scope]').value,
      rows: document.querySelectorAll('#secImports tr[data-slug]').length};
  });
  assert.equal(got.inScope, true);
  assert.equal(got.shown, 'all');
  assert.ok(got.rows > 0, 'the company\'s import lines, not an empty scope');
});

test('Goods flow draws the chain in the order the goods travel: Pier, Hub, Brewery, shops', async t => {
  const page = await board(t, {data: DAY47()});
  const got = await page.evaluate(() => {
    sub.supply = 'flow'; drawFlowView(); drawFlow();
    const x = id => { const r = document.querySelector(`#flow .node[data-id="${CSS.escape(id)}"] rect`); return r ? Number(r.getAttribute('x')) : null; };
    return {heads: [...document.querySelectorAll('#flow text.col')].map(t => t.textContent),
      pier: x('import:ba:street_pier#1'), hub: x('ba:street_eighthavenue#4'), brewery: x('ba:street_eighthavenue#8'), shop: x('ba:street_eighthstreet#5')};
  });
  assert.deepEqual(got.heads, ['IMPORTERS', 'DEPOTS', 'FACTORIES', 'SHOPS']);
  assert.ok(got.pier < got.hub && got.hub < got.brewery && got.brewery < got.shop, JSON.stringify(got));
});

test('Changes counts what the Overview counts, lists only import records, and copies its scope', async t => {
  const page = await board(t);
  // A write the game confirmed, and a hire found elsewhere: records with no row.
  await page.evaluate(() => {
    pgRecord({id: 'imports|hub#1|milk|weekly|2100', family: 'imports', target: {depot: 'hub#1', slug: 'milk'}, expect: {contracts: [], inGame: 2100}, rowKeys: [], label: 'Milk'});
    // Judged, as pgEvaluate() judges it: the page's own change until its next save.
    pgStore().recs['imports|hub#1|milk|weekly|2100'].state = 'confirmed';
    pgStore().memo.mine.add('imports|hub#1|milk|weekly|2100');
    pgRecord({id: 'hire|1', family: 'hire', target: {sites: ['shop#3']}, expect: {people: [{id: 'X', site: 'shop#3'}], hired: 1, moved: 0, skipped: 0}, rowKeys: [], label: '1 hired'});
    pgStore().recs['hire|1'].state = 'changed';
    sbStamp++; drawSupplyStrip(); drawChangesView(); wireAll();
  });
  const n = await page.evaluate(() => { const d = sbData(); return {total: d.rows.length, done: d.rows.filter(r => pgDone(d, r)).length}; });
  assert.equal(await page.locator('#sbcTop .sb-road').getAttribute('aria-label'), `${n.done} of ${n.total} changes recorded or applied`);
  const settled = await page.locator('#secChanges .sbc-settled .sbc-row').allTextContents();
  assert.equal(settled.length, 1);
  assert.match(settled[0], /Milk/);
  // Copy remaining copies the scope on screen.
  await page.evaluate(() => { sbScope.changes = 'factories'; drawChangesView(); wireAll(); });
  const left = await page.evaluate(() => { const d = sbData(); return d.rows.filter(r => !pgDone(d, r) && sbInScope('changes', r.site)).length; });
  assert.ok(left > 0 && left < n.total);
  // The preview holds what Copy remaining copies: the scope's changes still open.
  assert.equal(await page.evaluate(() => (document.querySelector('#secChanges .sbc-prev pre').textContent.match(/^\[ \]/gm) || []).length), left);
  // A mark takes its line out of the preview at once (final review, Fable 3).
  await page.locator('#secChanges .sbc-row .sb-tick').first().click();
  assert.equal(await page.evaluate(() => (document.querySelector('#secChanges .sbc-prev pre').textContent.match(/^\[ \]/gm) || []).length), left - 1);
});

test('Production speaks the board\'s words: no roster, shift or posting, and the bases by their names', async t => {
  const page = await board(t);
  await page.evaluate(() => { sbMode.production = 'all'; drawProductionView(); });
  const words = await page.evaluate(() => {
    const sec = document.getElementById('secProduction');
    return [sec.textContent, ...[...sec.querySelectorAll('[data-tip]')].map(e => e.dataset.tip), SB_STAFF_WHY()].join(' \n ');
  });
  assert.doesNotMatch(words, /\b(roster|rostered|shifts?|posted|post)\b/i);
  assert.doesNotMatch(words, /24\/7|under Demand/);
});

// --- round 2 of the chunk's review -------------------------------------------

test('two tabs of one company: a board in one keeps the other\'s records, and an undo in one stays undone', async t => {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}});
  t.after(() => context.close());
  await context.route('https://**', r => r.abort());
  await context.route('http://progress.test/**', r => {
    const rel = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
    if(!rel) return r.fulfill({contentType: 'text/html', body: html});
    const f = path.join(root, 'web', rel);
    return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({path: f}) : r.fulfill({status: 404, body: ''});
  });
  const open = async () => { const p = await context.newPage(); await p.goto('http://progress.test/'); return p; };
  const a = await open(), b = await open();
  await a.evaluate(() => localStorage.clear());
  for(const p of [a, b]) await p.evaluate(d => { takeData(d); }, fixture());
  const rec = id => ({id, family: 'imports', target: {depot: 'hub#1', slug: id}, expect: {contracts: [], inGame: 1}, rowKeys: [], label: id});
  await b.evaluate(r => pgRecord(r), rec('from-b'));
  /* A write in one tab reaches another tab's storage a moment later (the
     browser passes it between processes): each step waits until the tab
     about to act sees the other's write, as two tabs used by one player do. */
  await pgSees(a, ['from-b']);
  await a.evaluate(r => pgRecord(r), rec('from-a'));
  await pgSees(b, ['from-a', 'from-b']);
  // Tab B's next board saves its count: tab A's record stays.
  await b.evaluate(() => takeData(JSON.parse(JSON.stringify(D))));
  assert.deepEqual(await pgStored(b), ['from-a', 'from-b']);
  // Tab A's undo takes its record away; tab B's next board does not bring it back.
  await a.evaluate(() => pgDrop(['from-a']));
  await pgSees(b, ['from-b'], ['from-a']);
  await b.evaluate(() => { takeData(JSON.parse(JSON.stringify(D))); pgRecord({id: 'b2', family: 'imports', target: {depot: 'hub#1', slug: 'b2'}, expect: {contracts: [], inGame: 1}, rowKeys: [], label: 'b2'}); });
  assert.deepEqual(await pgStored(b), ['b2', 'from-b']);
  // The count is the higher of the two tabs'.
  const n = await Promise.all([a, b].map(p => p.evaluate(() => pgStore().memo.n)));
  assert.equal(await b.evaluate(() => JSON.parse(localStorage.getItem('ba_progress_v1:r8-fixture')).n), Math.max(...n));
});

/* Day 47 as the installed game's recipes make it (the review's): Beer eats 50
   Water a machine-hour and shop demand plans 4 h a machine. Python's
   shop-demand week for the Hub's Water is 2,250, all of it lines, the draw
   before the hours are rounded up and without the margin. The machines at
   12 h and 0 h are 84 machine-hours a week: they draw 4,200 now, 1,400 more
   than the plan's 56 hours. The figure is weighed against those 4,200, not
   against the plan's week plus the difference (3,650). */
test('lines drawing more than planned: the figure is weighed against what the staffed machines draw', async t => {
  const data = DAY47();
  const brewery = data.supply.factories.sites[0];
  brewery.lines[0].needHours.dem = 4;
  data.plan.recipes.find(r => r.slug === brewery.lines[0].slug).ingredients.find(i => i.slug === WATER).per = 50;
  const hub = data.businesses.findIndex(b => b.key === HUB47);
  Object.assign(data.supply.facts[hub][WATER].dem, {use: 2250, need: 2588, parts: {lines: 2250, sites: 0, route: 0}});
  const page = await board(t, {data, mode: 'dem'});
  const said = value => page.evaluate(([s, slug, k, value]) => {
    impSetKeep(impSetId(k, slug), {value, inGame: 3000, basis: 'dem'}); sbStamp++;
    sbSelOff = false; sbSel = {s, slug}; drawSupplyStrip(); drawImportsView(); wireAll();
    return document.querySelector('#sbCard .sbi-dep').textContent.replace(/\s+/g, ' ');
  }, [hub, WATER, HUB47, value]);
  const covers = await said(5000);
  assert.match(covers, /staffed 12 h and 0 h a day → 4 h a day each/);
  assert.match(covers, /the lines draw about 1,400 a week more than planned\. 5,000 still covers the 4,200 a week that takes\./);
  assert.doesNotMatch(covers, /runs short/);
  assert.match(await said(4000), /4,000 runs short of the 4,200 a week that takes\./);
  // A line whose rate the board does not know: the lead alone, no verdict.
  await page.evaluate(slug => { D.plan.recipes.find(r => r.slug === slug).ingredients = []; }, brewery.lines[0].slug);
  const unknown = await said(4100);
  assert.match(unknown, /the lines draw more than planned: check that 4,100 covers it/);
  assert.doesNotMatch(unknown, /runs short|still covers/);
});

test('machines split unevenly that draw the plan\'s total read as uneven, not as a draw that differs', async t => {
  const data = fixture();
  // The cake line's two machines at 24 h and 0 h; shop demand plans 12 h each.
  Object.assign(data.supply.factories.sites[0].lines[0], {gaps: [{slot: 2, hours: 0, off: 'Mon-Sun 0-24'}], hoursWeek: 168, hoursNow: 0,
    needHours: {cap: 24, dem: 12}});
  const page = await board(t, {data, mode: 'dem'});
  const text = await page.evaluate(() => {
    impSetKeep(impSetId('hub#1', 'flour'), {value: 12000, inGame: 14000, basis: 'dem'}); sbStamp++;
    sbSelOff = false; sbSel = {s: 0, slug: 'flour'}; drawSupplyStrip(); drawImportsView(); wireAll();
    return document.querySelector('#sbCard .sbi-dep').textContent.replace(/\s+/g, ' ');
  });
  assert.match(text, /staffed 24 h and 0 h a day → 12 h a day each/);
  assert.match(text, /The machines' hours are uneven, but together they draw what 12,000 is planned on\./);
  assert.doesNotMatch(text, /is not what|more than planned|less than planned/);
});

// --- round 3 of the chunk's review -------------------------------------------

test('two tabs that both hold a record: an undo in one is not written back by the other\'s next board', async t => {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}});
  t.after(() => context.close());
  await context.route('https://**', r => r.abort());
  await context.route('http://progress.test/**', r => {
    const rel = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
    if(!rel) return r.fulfill({contentType: 'text/html', body: html});
    const f = path.join(root, 'web', rel);
    return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({path: f}) : r.fulfill({status: 404, body: ''});
  });
  const open = async () => { const p = await context.newPage(); await p.goto('http://progress.test/'); return p; };
  const a = await open();
  await a.evaluate(() => localStorage.clear());
  await a.evaluate(d => { takeData(d); pgRecord({id: 'X', family: 'imports', target: {depot: 'hub#1', slug: 'flour'}, expect: {contracts: [], inGame: 1}, rowKeys: [], label: 'X'}); }, fixture());
  // Tab B opens after the write: it holds X as loaded.
  const b = await open();
  await pgSees(b, ['X']);
  await b.evaluate(d => { takeData(d); }, fixture());
  assert.equal(await b.evaluate(() => 'X' in pgStore().recs), true);
  const stored = () => pgStored(b);
  // Tab A undoes it.
  await a.evaluate(() => pgDrop(['X']));
  assert.deepEqual(await pgStored(a), []);
  await pgSees(b, [], ['X']);
  // Tab B's next board keeps it undone, and drops it from its own copy too.
  await b.evaluate(() => takeData(JSON.parse(JSON.stringify(D))));
  assert.deepEqual(await stored(), []);
  assert.equal(await b.evaluate(() => 'X' in pgStore().recs), false);
  // A record B judges on a later board is B's own and is kept, over what A stored.
  await a.evaluate(() => pgRecord({id: 'Y', family: 'schedule', target: {site: 'shop#3'}, expect: {print: 'p'}, rowKeys: [], label: 'Y'}));
  await pgSees(b, ['Y']);
  await b.evaluate(() => { pgMemo.clear(); pgStore(); pgStore().recs.Y.state = 'confirmed'; pgStore().memo.mine.add('Y'); pgSave(); });
  assert.equal(await b.evaluate(() => JSON.parse(localStorage.getItem('ba_progress_v1:r8-fixture')).recs.Y.state), 'confirmed');
});

// --- chunk 3: carried from chunk 2's round-4 review --------------------------

/* Two tabs of one company over the same origin: `later(h)` is the board the
   game gives h hours on, shop#3's week changed (so a schedule record is
   judged, and judged Not confirmed). */
async function twoTabs(t){
  const context = await browser.newContext({viewport: {width: 1280, height: 900}});
  t.after(() => context.close());
  await context.route('https://**', r => r.abort());
  await context.route('http://progress.test/**', r => {
    const rel = decodeURIComponent(new URL(r.request().url()).pathname.slice(1));
    if(!rel) return r.fulfill({contentType: 'text/html', body: html});
    const f = path.join(root, 'web', rel);
    return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({path: f}) : r.fulfill({status: 404, body: ''});
  });
  return async () => { const p = await context.newPage(); await p.goto('http://progress.test/'); return p; };
}
const laterBoard = h => page => page.evaluate(h => {
  const d = JSON.parse(JSON.stringify(D));
  d.meta.hour = (d.meta.hour || 0) + h;
  d.businesses.forEach(b => { if(b.key === 'shop#3') b.shiftPrint = 'now'; });
  takeData(d); pgEvaluate();
}, h);
const SCHED_X = {id: 'X', family: 'schedule', target: {site: 'shop#3'}, expect: {print: 'never-matches'}, rowKeys: [], label: 'X'};

test('two tabs: an undo in one stands even after the other has judged the record', async t => {
  const open = await twoTabs(t);
  const a = await open();
  await a.evaluate(() => localStorage.clear());
  await a.evaluate(([d, rec]) => { takeData(d); pgEvaluate(); pgRecord(rec); }, [fixture(), SCHED_X]);
  const b = await open();
  await pgSees(b, ['X']);
  await b.evaluate(d => { takeData(d); pgEvaluate(); }, fixture());
  await laterBoard(1)(b);
  assert.equal(await b.evaluate(() => pgStore().recs.X.state), 'changed', 'tab B judged the record');
  await pgSees(a, ['X']);
  await a.evaluate(() => pgDrop(['X']));
  await pgSees(b, [], ['X']);
  await laterBoard(2)(b);
  assert.deepEqual(await pgStored(b), [], 'the undo stands');
  assert.equal(await b.evaluate(() => 'X' in pgStore().recs), false, 'and tab B lets it go');
});

test('two tabs: a clear in one stands even after the other has judged the records', async t => {
  const open = await twoTabs(t);
  const a = await open();
  await a.evaluate(() => localStorage.clear());
  await a.evaluate(([d, rec]) => { takeData(d); pgEvaluate(); pgRecord(rec); }, [fixture(), SCHED_X]);
  const b = await open();
  await pgSees(b, ['X']);
  await b.evaluate(d => { takeData(d); pgEvaluate(); }, fixture());
  await laterBoard(1)(a);
  await laterBoard(1)(b);
  await b.evaluate(() => pgClearSettled('schedule'));
  await pgSees(a, [], ['X']);
  await laterBoard(2)(a);
  assert.deepEqual(await pgStored(a), [], 'the clear stands');
  // A record made in a tab after that is its own and is kept.
  await a.evaluate(rec => pgRecord({...rec, id: 'Z'}), SCHED_X);
  await pgSees(b, ['Z']);
  await laterBoard(3)(b);
  assert.deepEqual(await pgStored(b), ['Z']);
});
