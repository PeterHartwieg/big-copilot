// Mods › Street Food's route write in the real page (render(), live), through
// the board's own review-then-apply dialog (gwConfirm, kind "streetFoodRoute"):
// importing an owned vehicle's saved route, the game's review of it, Apply
// bound to that review's quote, and what forces the game to be asked again.
// The source is a synthetic LEDGER_SOURCE that records every write and answers
// as the game's mod would; nothing reaches a game. The payload is the
// synthetic snapshot in tests/fixtures/payload_snapshot with a hand-made
// Street Food section. Install Playwright and its Chromium browser to run;
// NODE_PATH may point at an existing Playwright installation.
'use strict';
const {test, before} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {selectPython} = require('../tools/verify.mjs');
const harness = require('./_page.cjs');

const ROOT = harness.ROOT;
const browser = harness.suiteBrowser();
const STUB = '<script>window.sfWrites = []; window.LEDGER_SOURCE = {label: "Live", data: async () => null, '
  + 'name: async () => null, watch(h){ window.calmWatch = h; }, link: () => window.sfLink || null, '
  + 'write: async (kind, body, o) => { window.sfWrites.push({kind, body: JSON.parse(JSON.stringify(body)), dryRun: !!(o && o.dryRun)}); '
  + 'return window.sfAnswer ? window.sfAnswer(kind, body, o) : {status: 0, error: "unreachable", body: null}; }};</script>';
const LINK = {writes: ['streetFoodRoute'], features: ['streetFood.routes'], approved: true, day: 40, hour: 14, minute: 30,
  character: 'PAYLOADco', company: 'Payload Co', source: 'link'};
const week = span => [0, 1, 2, 3, 4, 5, 6].map(() => [span]);
/* Tuesday's saved route: two stops a short walk apart. */
const STREET_FOOD = status => ({
  status, version: '0.10.0', schemaVersion: 1, day: 40, weekday: 1, minute: 720, gameSpeed: 1, travelBasis: 'default',
  rules: {radiusMetres: 50, travel: {driveMinutesPerMetre: 0.04, pushMetresPerSecond: 4, roadFactor: 1},
    schedules: {maxStops: 6, latestCloseMinute: 1620, restockMinutes: 30}},
  vehicles: [{id: 'veh-7', name: 'Taco Cart', kind: 'cart', routeRevision: 'r-0007', position: {x: 10, z: 10}, home: null,
    crew: [{id: 'e1', name: 'Ann', exists: true}],
    schedule: {days: [1], stops: [{id: 'a', name: 'Pier', day: 1, x: 0, z: 0, open: 600, close: 720},
      {id: 'b', name: 'Office row', day: 1, x: 100, z: 0, open: 760, close: 900}],
      crewHours: [{id: 'e1', day: 1, start: 540, end: 960}]}}],
  opportunities: [{key: 'ba:street_a#1', address: '1 A Street', name: 'Tower', type: 'Office', hood: null, kind: 'building',
    categories: ['office'], hours: week([540, 1020]), closed: false, x: 0, z: 0}],
});
const SENT_STOPS = [{x: 0, z: 0, open: 600, close: 720}, {x: 100, z: 0, open: 760, close: 900}];

let html, base;
before(() => {
  const page = spawnSync(selectPython(), ['-c',
    'from ba_dashboard import render; import sys; '
    + 'sys.stdout.buffer.write(render(None, live=True, before_script=sys.argv[1]).encode("utf-8"))', STUB],
  {cwd: ROOT, maxBuffer: 64 * 1024 * 1024});
  assert.equal(page.status, 0, page.stderr?.toString());
  html = page.stdout.toString();
  base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'payload_snapshot', 'data_day40.json'), 'utf8'));
});

async function board(t, {link = LINK, status = 'ready'} = {}) {
  const {page, context} = await harness.openPage(t, await browser(), {viewport: {width: 1280, height: 1100}, reducedMotion: 'reduce'});
  await context.route('https://streetfood.test/', route => route.fulfill({contentType: harness.MIME['.html'], body: html}));
  await context.addInitScript(l => { window.sfLink = l; }, link);
  await page.goto('https://streetfood.test/', {waitUntil: 'load'});
  const data = {...base, streetFood: STREET_FOOD(status), mods: {...(base.mods || {}), streetFood: {status, version: '0.10.0'}}};
  await page.evaluate(p => { document.body.classList.add('has-board'); window.calmWatch.changed(JSON.parse(p)); }, JSON.stringify(data));
  await page.evaluate(() => openRoute('mods/street-food'));
  await page.waitForSelector('#sfFleet [data-sf-import="veh-7"]');
  return page;
}
/* The game's answers: a review moves the first stop 4 m to a legal spot and
   quotes it; an apply answers the same rows. */
const answering = page => page.evaluate(() => {
  window.sfQuotes = 0;
  window.sfAnswer = async (kind, body, o) => {
    const after = body.stops.map((s, i) => ({x: i ? s.x : s.x + 4, z: s.z, y: 0, heading: 90, open: s.open, close: s.close}));
    const quote = o.dryRun ? `q-${++window.sfQuotes}` : body.quote;
    return {status: 200, error: null, body: {ok: true, kind: 'streetFoodRoute', dryRun: !!o.dryRun, quote,
      rows: [{vehicleId: body.vehicleId, weekday: body.weekday, changed: true,
        before: [{x: 50, z: 50, y: 0, heading: 0, open: 480, close: 540}], after}],
      warnings: [{code: 'crew_gap', minutes: 15}], ...(o.dryRun ? {} : {stamp: 'stamp-1'})}};
  };
});
const writes = page => page.evaluate(() => window.sfWrites);
const phase = (page, p) => page.waitForFunction(p => document.querySelector('dialog.gw-dlg')?.dataset.phase === p, p);
const routeButton = page => page.locator('#sfPlan [data-gw="streetFoodRoute"]');
async function importAndReview(page){
  await page.click('#sfFleet [data-sf-import="veh-7"]');
  await routeButton(page).waitFor();
  assert.deepEqual(await writes(page), [], 'importing writes nothing');
  await routeButton(page).click();
  await phase(page, 'ready');
}

test('review shows before and after, Apply sends the reviewed quote with the same stops, and no undo is offered', async t => {
  const page = await board(t);
  await answering(page);
  await importAndReview(page);
  let sent = await writes(page);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {kind: 'streetFoodRoute', dryRun: true,
    body: {vehicleId: 'veh-7', weekday: 1, revision: 'r-0007', stops: SENT_STOPS}});
  const dlg = page.locator('dialog.gw-dlg');
  const text = await dlg.innerText();
  assert.match(text, /In the game now/i, 'the dialog\'s labels are set in capitals by its CSS');
  assert.match(text, /^After$/im);
  assert.match(text, /08:00–09:00/, 'the day as the game holds it');
  assert.match(text, /10:00–12:00/);
  assert.match(text, /placed 4 m from your spot/);
  // The stop in the game now is told by the place it is near, and each
  // proposed stop by its legal spot and the place it was asked for.
  assert.match(text, /08:00–09:00\s*71 m from Tower/);
  assert.match(text, /10:00–12:00\s*at Tower\s*for Pier\s*placed 4 m from your spot/);
  assert.match(text, /12:40–15:00\s*.+\s*for Office row/);
  assert.match(text, /nearest legal parking or pavement spot/);
  assert.match(text, /15 minutes of the route have no saved crew hours/);
  assert.match(text, /no undo/i);
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'done');
  sent = await writes(page);
  assert.equal(sent.length, 2, 'one review, one apply');
  assert.deepEqual(sent[1], {kind: 'streetFoodRoute', dryRun: false,
    body: {vehicleId: 'veh-7', weekday: 1, revision: 'r-0007', stops: SENT_STOPS, quote: 'q-1'}});
  assert.equal(await dlg.locator('[data-gw-b="undo"]').count(), 0, 'no undo for a route write');
  // The plan stays the player's: the apply did not replace it with the game's answer.
  assert.deepEqual(await page.evaluate(() => sfPlan().stops.map(s => [s.x, s.open, s.close])), [[0, 600, 720], [100, 760, 900]]);
});

test('an edit after the review, or another company in the game, asks the game again before anything is set', async t => {
  const page = await board(t);
  await answering(page);
  await importAndReview(page);
  // The plan changes after the review: Apply reviews it again instead of applying.
  await page.evaluate(() => sfEdit(p => { p.stops[1].close = 930; }));
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await page.waitForFunction(() => window.sfWrites.length === 2);
  await phase(page, 'ready');
  let sent = await writes(page);
  assert.equal(sent[1].dryRun, true, 'the edit is reviewed, not applied');
  assert.equal(sent[1].body.stops[1].close, 930);
  // The game now holds another company: Apply asks again rather than sending.
  await page.evaluate(() => { window.sfLink = {...window.sfLink, company: 'Other Co'}; });
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await page.waitForFunction(() => window.sfWrites.length === 3);
  await phase(page, 'ready');
  sent = await writes(page);
  assert.equal(sent[2].dryRun, true, 'another company is reviewed, not applied');
  assert.ok(sent.every(w => w.dryRun), 'nothing was applied');
  // Only now, with nothing changed since the last review, Apply sends that review's quote.
  await dlg.locator('.gw-foot [data-gw-b="apply"]').click();
  await phase(page, 'done');
  sent = await writes(page);
  assert.equal(sent.length, 4);
  assert.deepEqual(sent[3], {kind: 'streetFoodRoute', dryRun: false,
    body: {vehicleId: 'veh-7', weekday: 1, revision: 'r-0007', stops: [SENT_STOPS[0], {...SENT_STOPS[1], close: 930}], quote: 'q-3'}});
});

test('without the capability, or with stale records, the write stays off and nothing is sent', async t => {
  for (const [label, o, why] of [
    ['an older mod', {link: {...LINK, writes: [], features: []}}, /Update the Big Copilot Link mod/],
    ['a mod without the feature', {link: {...LINK, features: []}}, /Update the Big Copilot Link mod/],
    ['stale records', {status: 'stale'}, /read from the running game/],
  ]) {
    const page = await board(t, o);
    await page.click('#sfFleet [data-sf-import="veh-7"]');
    const button = routeButton(page);
    await button.waitFor();
    assert.equal(await button.getAttribute('aria-disabled'), 'true', label);
    assert.match(await page.locator('#sfPlan').innerText(), why, label);
    await button.click({force: true});
    assert.equal(await page.locator('dialog.gw-dlg').count(), 0, `${label}: no dialog`);
    assert.deepEqual(await writes(page), [], `${label}: nothing sent`);
  }
});
