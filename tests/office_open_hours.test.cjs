'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {loadBoard} = require('./_board.cjs');
const {selectPython} = require('../tools/verify.mjs');
const {suiteBrowser, openPage, boardHtml, ROOT} = require('./_page.cjs');
const payload = JSON.parse(execFileSync(selectPython(), ['-m', 'tests.office_open_fixture'],
  {cwd: ROOT, encoding: 'utf8'}));
const key = payload.businesses[0].key;
const plain = x => JSON.parse(JSON.stringify(x));
function board(storage = new Map()) {
  const c = loadBoard({payload: structuredClone(payload), localStorage: {
    getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k)}});
  vm.runInContext('D = payload', c);
  return c;
}
const run = (c, code) => vm.runInContext(code, c);
const choose = c => run(c, 'spPlanWrite(D.businesses[0].key, "open")');

test('default stays selected; opt-in persists per company and site and can be reset', () => {
  const storage = new Map();
  let c = board(storage);
  assert.equal(c.hrVariant(payload.hiring.sites[0]), 'office');
  assert.deepEqual(plain(c.gwRosterPlan(key).shifts), payload.officeStaffing[0].shifts);
  choose(c);
  assert.equal(c.hrVariant(payload.hiring.sites[0]), 'open');
  assert.deepEqual(plain(c.hrPlanRow(payload.hiring.sites[0], 'open')), payload.officeStaffing[0].openCover);
  c = board(storage);
  assert.equal(c.gwRosterPlan(key).variant, 'open');
  run(c, 'D.meta.character = "another-company"');
  assert.equal(run(c, 'spOfficePlanOf(D.businesses[0].key)'), 'office');
  run(c, 'D.meta.character = "office-open-hours"; spPlanWrite(D.businesses[0].key, "demand")');
  assert.equal(board(storage).gwRosterPlan(key).variant, undefined);
});

test('unavailable alternative falls back to the original plan', () => {
  const c = board(); choose(c);
  run(c, 'D.officeStaffing[0].openCover = {failed: true}');
  assert.equal(c.hrVariant(payload.hiring.sites[0]), 'office');
  assert.equal(c.gwRosterPlan(key).variant, undefined);
});

test('spare people and the schedule status follow the selected plan', () => {
  const c = board();
  run(c, `D.businesses[0].staffIdle = ['l0', 'l1', 'l2', 'l3', 'gone'];
    D.officeStaffing[0].shifts = D.officeStaffing[0].shifts.filter(s => D.officeStaffing[0].people[s.p].id === 'l0')`);
  assert.deepEqual(plain(run(c, 'spSpareIds(D.businesses[0])')), ['l1', 'l2', 'l3', 'gone']);
  assert.notEqual(run(c, 'schedStatus(D.businesses[0])'), 'Every open hour');
  choose(c);
  assert.deepEqual(plain(run(c, 'spSpareIds(D.businesses[0])')), ['gone']);
  assert.equal(run(c, 'schedStatus(D.businesses[0])'), 'Every open hour');
});

test('office idle-hours summaries follow the selection even without hiring plans', () => {
  const c = board(), office = {hours: 12}, open = {hours: 24};
  const S = {key, site: {kind: 'office', unstaffed: {office, open}}};
  assert.equal(c.hrUnstaffedOf(S), office);
  choose(c);
  assert.equal(c.hrUnstaffedOf(S), open);
});

test('schedule request writes the selected week, preserves other duties and never extends opening', () => {
  const c = board(); choose(c);
  run(c, 'var spec; gwConfirm = s => { spec = s; }; gwSchedule(D.businesses[0].key)');
  const spec = run(c, 'spec'), body = spec.body();
  assert.equal(body.openAllHours, false);
  assert.deepEqual(plain(body.days), plain(c.gwRosterWeek(c.gwRosterPlan(key)).days));
  assert.ok(body.days.flatMap(d => d.shifts).some(s => s.itemInstanceId === 'clean'));
  assert.match(spec.draw({}, 'ready'), /Every open hour/);
  const S = c.hrModel().sites[0];
  assert.equal(S.variant, 'open');
  assert.deepEqual(plain(S.plan), payload.hiring.sites[0].plans.open);
  const week = c.hrSiteWeek(S, [], new Set(), new Set(), false, false);
  assert.ok(week.days.flatMap(d => d.shifts).some(s => s.itemInstanceId === 'clean'));
  const req = c.hrRequest({sites: [S], moves: [], overs: [], roles: []}, {mode: 'week', one: true});
  assert.equal(req.body.sites[0].openAllHours, false);
  assert.deepEqual(plain(req.body.sites[0].days), plain(week.days));
});

test('new hires fill the selected plan using its own indices and keep cleaning', () => {
  const c = board(); choose(c);
  const S = c.hrModel().sites[0];
  const fill = S.plan.hireWeeks.map((w, i) => ({id: `new-${i}`, w}));
  assert.ok(fill.length);
  const week = c.hrSiteWeek(S, fill, new Set(), new Set(fill.map(x => x.id)), true, false);
  assert.ok(week.days.flatMap(d => d.shifts).some(s => s.employeeId === 'new-0'));
  assert.ok(week.days.flatMap(d => d.shifts).some(s => s.itemInstanceId === 'clean'));
  for (const {d, shifts} of week.days) {
    for (const station of ['pc0', 'pc1', 'pc2', 'pc3']) {
      const hours = new Set(shifts.filter(s => s.itemInstanceId === station).flatMap(s =>
        Array.from({length: s.t - s.f}, (_, i) => s.f + i)));
      assert.deepEqual([...hours].sort((a,b) => a-b), [8,9,10,11,12,13,14,15], `${d} ${station}`);
    }
  }
});

const browser = suiteBrowser();
test('office toggle redraws in place and survives a page reload', async t => {
  const {page} = await openPage(t, await browser(), {html: boardHtml()});
  const draw = () => page.evaluate(data => {
    D = data; document.body.classList.add('has-board');
    openRoute('staffing/schedules', {pick: D.businesses[0].key});
    wireAll();
  }, structuredClone(payload));
  await draw();
  await page.evaluate(() => featureDiscovery.asOf('2026-10-28'));
  const pick = page.locator('#sp-roster [data-plan="open"]');
  const badge = pick.locator('[data-new-feature="office-open-hours"]');
  // textContent, not innerText: the plan sits in a section{content-visibility:auto},
  // and Chromium can give innerText as '' before that section's visibility settles.
  // The draw is synchronous, so the words are in the DOM once the evaluate returns.
  assert.match((await pick.textContent()).trim(), /^Every open hour\s*New$/i);
  assert.equal(await badge.isVisible(), true, 'the opt-in carries its New badge');
  assert.equal(await pick.getAttribute('aria-current'), null);
  await page.locator('#sp-roster [data-plan="demand"]').click();
  assert.equal(await badge.isVisible(), true, 'picking the default is not a visit');
  await pick.click();
  assert.equal(await pick.getAttribute('aria-current'), 'true');
  assert.equal(await badge.isVisible(), false, 'opening the plan retires the badge');
  assert.equal(await page.evaluate(() => localStorage.getItem('ba_dash_feature_seen:office-open-hours')), '1');
  assert.match(await page.locator('#sp-roster').textContent(), /opening hours, cleaning and other duties stay as they are/);
  await page.reload(); await draw();
  assert.equal(await pick.getAttribute('aria-current'), 'true');
  await page.locator('#sp-roster [data-plan="demand"]').click();
  assert.equal(await pick.getAttribute('aria-current'), null);
});
