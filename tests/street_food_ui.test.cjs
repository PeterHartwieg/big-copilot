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
/* A synthetic catalogue of checked stopping places: two pavement spots for
   carts and two parking spots for trucks near the Tower, none far out. */
const STOPS = {version: 1, status: 'ready', source: {gameBuild: 'test'}, spots: [
  {id: 'cart-a', kind: 'cart', key: 'ba:street_a#1', x: 2, z: 1, y: 0, heading: 90},
  {id: 'cart-b', kind: 'cart', key: 'ba:street_a#1', x: 30, z: 4, y: 0, heading: 270},
  {id: 'truck-a', kind: 'truck', key: 'ba:street_a#1', x: 6, z: -3, y: 0.5, heading: 180},
  {id: 'truck-b', kind: 'truck', key: 'ba:street_a#1', x: 25, z: 20, y: 0, heading: 0}]};
const STORE_KEY = `ba_street_food_routes_v1:${JSON.stringify(['PAYLOADco', 'Payload Co'])}`;

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

async function board(t, {link = LINK, status = 'ready', stops = undefined, stored = null} = {}) {
  const {page, context} = await harness.openPage(t, await browser(), {viewport: {width: 1280, height: 1100}, reducedMotion: 'reduce'});
  await context.route('https://streetfood.test/', route => route.fulfill({contentType: harness.MIME['.html'], body: html}));
  // The city map's geometry and background, as the page fetches them from web/maps.
  await context.route('https://streetfood.test/maps/**', route => {
    const file = path.join(harness.WEB, 'maps', path.basename(new URL(route.request().url()).pathname));
    return fs.existsSync(file) ? route.fulfill({path: file}) : route.fulfill({status: 404, body: ''});
  });
  await context.addInitScript(l => { window.sfLink = l; }, link);
  if (stored) await context.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [STORE_KEY, JSON.stringify(stored)]);
  await page.goto('https://streetfood.test/', {waitUntil: 'load'});
  const data = {...base, streetFood: {...STREET_FOOD(status), ...(stops !== undefined ? {stopLocations: stops} : {})},
    mods: {...(base.mods || {}), streetFood: {status, version: '0.10.0'}}};
  await page.evaluate(p => { document.body.classList.add('has-board'); window.calmWatch.changed(JSON.parse(p)); }, JSON.stringify(data));
  await page.evaluate(() => openRoute('mods/street-food'));
  await page.waitForSelector('#sfFleet [data-sf-import="veh-7"]');
  // The city map's stage, built once its geometry has loaded.
  await page.waitForFunction(() => !!(sfMapView && sfMapView.svg));
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
  assert.match(text, /08:00–09:00\s*(at |\d+ m from )[A-Z0-9]/, "named by the place it is at or near, here a map building");
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

test('removing every stop of an owned route reviews the day as cleared, and Apply sends exactly the reviewed empty route', async t => {
  const page = await board(t);
  await answering(page);
  await page.click('#sfFleet [data-sf-import="veh-7"]');
  await routeButton(page).waitFor();
  // Delete both stops in the plan, the last one included.
  await page.click('#sfPlan [data-sf-del]');
  await page.click('#sfPlan [data-sf-del]');
  await page.waitForFunction(() => sfPlan().stops.length === 0);
  const button = routeButton(page);
  assert.equal(await button.getAttribute('aria-disabled'), null, 'an empty route for an owned vehicle may be reviewed');
  assert.match(await button.innerText(), /Clear in the game/);
  assert.match(await page.locator('#sfPlan').innerText(), /clears Tuesday for this vehicle in the game/);
  assert.deepEqual(await writes(page), [], 'deleting stops writes nothing');
  await button.click();
  await phase(page, 'ready');
  let sent = await writes(page);
  assert.deepEqual(sent, [{kind: 'streetFoodRoute', dryRun: true,
    body: {vehicleId: 'veh-7', weekday: 1, revision: 'r-0007', stops: []}}], 'only a review so far');
  const dlg = page.locator('dialog.gw-dlg');
  const text = await dlg.innerText();
  assert.match(text, /Clear the Tuesday route for Taco Cart/);
  assert.match(text, /The game will remove 1 stop on Tuesday/);
  assert.match(text, /08:00–09:00\s*(at |\d+ m from )[A-Z0-9]/, 'the stop that goes, by its place');
  assert.match(text, /No stops: the vehicle has no route on this day/);
  assert.match(text, /the other days and the crew stay as they are/);
  const apply = dlg.locator('.gw-foot [data-gw-b="apply"]');
  assert.match(await apply.innerText(), /Clear the route/);
  await apply.click();
  await phase(page, 'done');
  sent = await writes(page);
  assert.equal(sent.length, 2, 'one review, one apply: nothing applied by itself');
  assert.deepEqual(sent[1], {kind: 'streetFoodRoute', dryRun: false,
    body: {vehicleId: 'veh-7', weekday: 1, revision: 'r-0007', stops: [], quote: 'q-1'}});
  assert.match(await dlg.innerText(), /route is cleared in the game/);
  assert.equal(await dlg.locator('[data-gw-b="undo"]').count(), 0, 'no undo');
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

/* What the planner shows for the place inspected, and the plan's stops. */
const inspect = page => page.locator('#sfInspect').innerText();
const stops = page => page.evaluate(() => (sfPlan() ? sfPlan().stops : []).map(s => ({locationId: s.locationId, x: s.x, z: s.z, y: s.y, heading: s.heading})));
const pick = (page, p) => page.evaluate(p => { sfPick = p; sfRedraw(); }, p);

test('a building or open ground is inspected only: the checked places near it are listed, and nothing is added at the point', async t => {
  const page = await board(t, {stops: STOPS});
  // The Tower, as a click on its footprint hands it over.
  await pick(page, {key: 'ba:street_a#1'});
  let text = await inspect(page);
  assert.match(text, /Pavement spots within 40 m/);
  assert.match(text, /2 m/);
  assert.match(text, /30 m/);
  assert.doesNotMatch(text, /6 m|parking/i, 'only the route kind\'s places');
  assert.equal(await page.locator('#sfInspect [data-sf-add]').count(), 0, 'no Add at a building\'s centre');
  // Open ground with no checked place near: said so, and still nothing to add.
  await pick(page, {x: 400, z: 400});
  text = await inspect(page);
  assert.match(text, /No checked pavement spot is within 40 m/);
  assert.equal(await page.locator('#sfInspect [data-sf-add]').count(), 0, 'no Add at a raw point');
  assert.equal(await page.evaluate(() => sfPlans.length), 0, 'nothing chosen for the player');
});

test('picking a checked place, from the list or its dot on the map, adds the stop at its exact point', async t => {
  const page = await board(t, {stops: STOPS});
  await pick(page, {key: 'ba:street_a#1'});
  await page.click('#sfInspect [data-sf-spot="cart-a"]');
  let text = await inspect(page);
  assert.match(text, /Pavement spot for carts/);
  assert.match(text, /Checked against the game's placement rules\. A spot may still be occupied in-game\./);
  assert.doesNotMatch(text, /\bfree\b|\bchecked again\b/i, 'no promise that the spot is empty');
  assert.equal(await page.locator('#sfMap .sf-pin.sf-spotsel').count(), 1, 'the picked place has its own marker');
  await page.click('#sfInspect [data-sf-add]');
  assert.deepEqual(await stops(page), [{locationId: 'cart-a', x: 2, z: 1, y: 0, heading: 90}]);
  // The second, by clicking its dot, which the map shows once zoomed in.
  await page.evaluate(() => sfMapView.focusOn({x: 30, z: 4}));
  await page.waitForFunction(() => document.querySelector('#sfMap .stage').classList.contains('zoomed'));
  await page.waitForTimeout(900);
  await page.locator('#sfMap [data-spot="cart-b"]').click({force: true});
  await page.waitForFunction(() => sfPick && sfPick.spot === 'cart-b');
  await page.click('#sfInspect [data-sf-add]');
  assert.deepEqual(await stops(page), [{locationId: 'cart-a', x: 2, z: 1, y: 0, heading: 90}, {locationId: 'cart-b', x: 30, z: 4, y: 0, heading: 270}]);
  assert.doesNotMatch(await page.locator('#sfPlan').innerText(), /not on a checked/);
  // Kept across a reload, exactly.
  const kept = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).plans[0].stops.map(s => [s.locationId, s.x, s.z, s.heading]), STORE_KEY);
  assert.deepEqual(kept, [['cart-a', 2, 1, 90], ['cart-b', 30, 4, 270]]);
});

test('another kind of vehicle shows its own places, flags stops that no longer fit, and moves one only when asked', async t => {
  const page = await board(t, {stops: STOPS});
  await pick(page, {key: 'ba:street_a#1'});
  await page.click('#sfInspect [data-sf-spot="cart-a"]');
  await page.click('#sfInspect [data-sf-add]');
  // The draft becomes a truck: parking spots now, and the cart's stop is flagged, not moved.
  await page.click('#sfLayers [data-sf-kind="truck"]');
  assert.equal(await page.evaluate(() => sfPlan().kind), 'truck');
  assert.match(await page.locator('#sfPlan').innerText(), /Stop 1 is not on a checked parking spot/);
  assert.deepEqual(await stops(page), [{locationId: 'cart-a', x: 2, z: 1, y: 0, heading: 90}], 'nothing moves by itself');
  await pick(page, {key: 'ba:street_a#1'});
  let text = await inspect(page);
  assert.match(text, /Parking spots within 40 m/);
  assert.doesNotMatch(text, /Pavement/);
  await page.click('#sfInspect [data-sf-spot="truck-a"]');
  await page.click('#sfInspect [data-sf-move]');
  assert.deepEqual(await stops(page), [{locationId: 'truck-a', x: 6, z: -3, y: 0.5, heading: 180}]);
  assert.doesNotMatch(await page.locator('#sfPlan').innerText(), /not on a checked/);
  // An owned vehicle's kind is its own: the switch does not change it.
  await page.evaluate(() => sfEdit(p => { p.vehicleId = 'veh-7'; }));
  assert.equal(await page.locator('#sfLayers [data-sf-kind="truck"]').getAttribute('aria-disabled'), 'true');
});

test('without checked places nothing new can be added, and a route copied from the game keeps its own stops', async t => {
  const page = await board(t, {stops: {version: 1, status: 'unavailable', spots: []}});
  await answering(page);
  await pick(page, {key: 'ba:street_a#1'});
  assert.match(await inspect(page), /Checked stopping places are not available/);
  assert.equal(await page.locator('#sfInspect [data-sf-add]').count(), 0);
  // The vehicle's own saved stops are its game positions: kept as they are, and the review may go ahead.
  await page.click('#sfFleet [data-sf-import="veh-7"]');
  assert.deepEqual((await stops(page)).map(s => [s.x, s.z]), [[0, 0], [100, 0]]);
  assert.doesNotMatch(await page.locator('#sfPlan').innerText(), /not on a checked/);
  assert.equal(await routeButton(page).getAttribute('aria-disabled'), null);
});

test('a kept draft with a freely placed stop says how to fix it, and the game is not asked until it is fixed', async t => {
  const page = await board(t, {stops: STOPS, stored: {current: 'old', plans: [{id: 'old', name: 'Old draft', vehicleId: 'veh-7', kind: 'cart', weekday: 1,
    stops: [{id: 'free', name: 'Somewhere', key: null, x: 50, z: 50, open: 600, close: 700}]}]}});
  await page.waitForFunction(() => !!sfPlan());
  const plan = await page.locator('#sfPlan').innerText();
  assert.match(plan, /Stop 1 is not on a checked pavement spot\. Pick one near it on the map, then Move here\./);
  const button = routeButton(page);
  assert.equal(await button.getAttribute('aria-disabled'), 'true');
  assert.match(plan, /Sort out the route's issues first/);
  await button.click({force: true});
  assert.equal(await page.locator('dialog.gw-dlg').count(), 0);
  assert.deepEqual(await writes(page), []);
  assert.deepEqual(await stops(page), [{locationId: undefined, x: 50, z: 50, y: undefined, heading: undefined}], 'the kept stop is not moved');
  // Moved onto a checked place at the player's word, the review is offered.
  await pick(page, {key: 'ba:street_a#1'});
  await page.click('#sfInspect [data-sf-spot="cart-b"]');
  await page.click('#sfInspect [data-sf-move="free"]');
  assert.deepEqual(await stops(page), [{locationId: 'cart-b', x: 30, z: 4, y: 0, heading: 270}]);
  assert.equal(await routeButton(page).getAttribute('aria-disabled'), null);
});

test('a payload without a stop catalogue fails closed: an old free-placed draft is blocked, nothing new is added, the game\'s own stops pass', async t => {
  // No stopLocations at all, as an older cached payload has.
  const page = await board(t, {stored: {current: 'old', plans: [{id: 'old', name: 'Old draft', vehicleId: 'veh-7', kind: 'cart', weekday: 1,
    stops: [{id: 'free', name: 'Somewhere', key: null, x: 50, z: 50, open: 600, close: 700}]}]}});
  await answering(page);
  await page.waitForFunction(() => !!sfPlan());
  assert.equal(await page.evaluate(() => 'stopLocations' in D.streetFood), false);
  let plan = await page.locator('#sfPlan').innerText();
  assert.match(plan, /Stop 1 is not on a checked pavement spot/);
  assert.equal(await routeButton(page).getAttribute('aria-disabled'), 'true');
  await routeButton(page).click({force: true});
  assert.equal(await page.locator('dialog.gw-dlg').count(), 0);
  assert.deepEqual(await writes(page), [], 'the old point never reaches the game');
  // Nothing new can be placed without the catalogue.
  await pick(page, {key: 'ba:street_a#1'});
  assert.match(await inspect(page), /Checked stopping places are not available/);
  assert.equal(await page.locator('#sfInspect [data-sf-add]').count(), 0);
  await pick(page, {spot: 'cart-a', x: 2, z: 1});
  assert.equal(await page.locator('#sfInspect [data-sf-add]').count(), 0, 'a remembered spot id adds nothing without the catalogue');
  // The vehicle's own saved stops are still accepted, and reviewed.
  await page.click('#sfFleet [data-sf-import="veh-7"]');
  plan = await page.locator('#sfPlan').innerText();
  assert.doesNotMatch(plan, /not on a checked/);
  assert.equal(await routeButton(page).getAttribute('aria-disabled'), null);
  await routeButton(page).click();
  await phase(page, 'ready');
  assert.deepEqual((await writes(page))[0].body.stops, SENT_STOPS);
});

test('a truck plan offers only parking spots, keeps a picked spot\'s exact point, and a cart switch flags it', async t => {
  const page = await board(t, {stops: STOPS});
  await page.click('#sfLayers [data-sf-kind="truck"]');
  await pick(page, {x: 10, z: 0});
  const text = await inspect(page);
  assert.match(text, /Parking spots within 40 m/);
  assert.equal(await page.locator('#sfInspect [data-sf-spot="cart-a"]').count(), 0);
  await page.click('#sfInspect [data-sf-spot="truck-b"]');
  await page.click('#sfInspect [data-sf-add]');
  assert.equal(await page.evaluate(() => sfPlan().kind), 'truck', 'the new route takes the kind shown');
  assert.deepEqual(await stops(page), [{locationId: 'truck-b', x: 25, z: 20, y: 0, heading: 0}]);
  const kept = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).plans[0].stops[0], STORE_KEY);
  assert.deepEqual([kept.locationId, kept.x, kept.z, kept.y, kept.heading], ['truck-b', 25, 20, 0, 0]);
  await page.click('#sfLayers [data-sf-kind="cart"]');
  assert.match(await page.locator('#sfPlan').innerText(), /Stop 1 is not on a checked pavement spot/);
  assert.deepEqual(await stops(page), [{locationId: 'truck-b', x: 25, z: 20, y: 0, heading: 0}], 'unchanged until moved');
});
