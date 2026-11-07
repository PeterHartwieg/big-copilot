'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {loadBoard} = require('./_board.cjs');
const plain = x => JSON.parse(JSON.stringify(x));
const H = require('./_page.cjs');
const browser = H.suiteBrowser();

test('Crew marks only current people with unmet demands and names each demand on hover', async t => {
  const {page} = await H.openPage(t, await browser(), {html: H.boardHtml()});
  const d = structuredClone(require('./fixtures/payload_snapshot/link.json'));
  const insurance = {slug: 'ba:jobdemand_silverhealthinsurance', demand: 'Silver Health Insurance', scope: 'company'};
  const cooler = {slug: 'ba:jobdemand_watercooler', demand: 'Water Cooler', scope: 'site'};
  const b = d.businesses[0];
  b.people = Array.from({length: 13}, (_, i) => ({name: `Current person ${i}`, role: 'Customer Service',
    daily: 100, absent: false, ...(i === 0 ? {unmetDemands: [insurance, cooler]}
      : i === 1 ? {unmetDemands: [insurance]} : {})}));
  b.staffDemands = [{slug: insurance.slug, demand: insurance.demand, count: 2, priority: 1, company: true},
    {slug: cooler.slug, demand: cooler.demand, count: 1, priority: 0, company: false}];
  await H.loadPayload(page, d);
  await page.evaluate(key => routeOpenSite(key, '#sp-crew', 'staffing/needs'), b.key);
  const crew = page.locator('#sp-crew');
  await crew.locator('.sp-rbtn').click();
  const people = crew.locator('.person');
  assert.equal(await people.count(), 13);
  for (const i of [0, 1]) {
    assert.match(await people.nth(i).getAttribute('class'), /sp-demand-warn/);
    assert.match(await people.nth(i).getAttribute('data-tip'), /Silver Health Insurance.*settled company-wide, not here/);
    assert.notEqual(await people.nth(i).evaluate(el => getComputedStyle(el).borderColor),
      await people.nth(2).evaluate(el => getComputedStyle(el).borderColor));
  }
  assert.match(await people.nth(0).getAttribute('data-tip'), /Water Cooler.*not met at this site/);
  assert.doesNotMatch(await people.nth(2).getAttribute('class'), /sp-demand-warn/);
  assert.equal(await people.nth(2).getAttribute('data-tip'), null);
  await people.nth(0).hover();
  assert.match(await page.locator('#tip').textContent(), /Silver Health Insurance/);
  assert.match(await page.locator('#tip').textContent(), /Water Cooler/);
  await people.nth(1).focus();
  assert.match(await page.locator('#tip').textContent(), /Silver Health Insurance/);
  assert.doesNotMatch(await page.locator('#tip').textContent(), /Water Cooler/);
  assert.equal(await crew.locator('.sp-dem').count(), 2, 'the site summary remains');
  // Small Crew lists use the same per-person marks without the folded role.
  await page.evaluate(() => { D.businesses[0].people = D.businesses[0].people.slice(0, 3); drawSite(); });
  assert.equal(await crew.locator('.person.sp-demand-warn').count(), 2);
});
function row(){
  return {key: 'ba:street_secondavenue#10', office: true, demandBased: true, computers: 2,
    staffedComputers: 1, roles: [{skill: 'lawyer', stations: [0, 1]}],
    people: [{id: 'lawyer', name: 'Lawyer'}, {id: 'cleaner', name: 'Cleaner'}],
    stations: [{id: 'pc0', skill: 'lawyer'}, {id: 'pc1', skill: 'lawyer'}, {id: 'clean'}],
    shifts: [{d: 1, f: 9, t: 13, s: 0, p: 0}],
    current: {list: [{d: 1, f: 8, t: 18, s: 0, p: 0}, {d: 1, f: 8, t: 12, s: 2, p: 1, k: 'c'}]}};
}
test('office demand write replaces professional hours and retains cleaning', () => {
  const c = loadBoard(), r = row();
  const week = c.gwRosterWeek(r);
  assert.deepEqual(plain(week.days), [{d: 1, shifts: [
    {f: 9, t: 13, employeeId: 'lawyer', itemInstanceId: 'pc0'},
    {f: 8, t: 12, employeeId: 'cleaner', itemInstanceId: 'clean'}]}]);
  assert.equal(week.kept, 1);
  assert.equal(c.hrDiffers(r, week.days, new Set()), true);
  r.current.list[0] = {...r.shifts[0]};
  assert.equal(c.hrDiffers(r, c.gwRosterWeek(r).days, new Set()), false);
});
test('measured zero demand can remove the last professional hours', () => {
  const c = loadBoard(), r = row();
  r.shifts = [];
  const week = c.gwRosterWeek(r);
  assert.equal(week.sent, 0);
  assert.deepEqual(plain(week.days[0].shifts.map(x => x.employeeId)), ['cleaner']);
  assert.equal(c.hrDiffers(r, week.days, new Set()), true);
  c.payload = {businesses: [{key: r.key, status: 'office'}], officeStaffing: [r]};
  vm.runInContext('D = payload', c);
  assert.ok(c.gwRosterPlan(r.key));
});
test('unreadable duties continue to block the office write', () => {
  const c = loadBoard(), r = row();
  delete r.people[1].id;
  assert.equal(c.gwRosterWeek(r).unreadable, 1);
  r.unrepresentable = 1;
  assert.equal(c.gwRosterWeek(r).unreadable, 2);
});
test('staffing action uses the same demand week without an incoming hire', () => {
  const c = loadBoard(), r = row();
  const S = {key: r.key, site: {kind: 'office'}, row: r, plan: {bench: []}};
  const week = c.hrSiteWeek(S, [], new Set(), new Set(), false, false);
  assert.equal(week.changes, true);
  assert.deepEqual(plain(week.days[0].shifts.map(x => [x.employeeId, x.f, x.t])),
    [['cleaner', 8, 12], ['lawyer', 9, 13]]);
});
test('incoming hire fills the demand plan and keeps other duties', () => {
  const c = loadBoard(), r = row();
  r.shifts[0].p = null;
  const S = {key: r.key, site: {kind: 'office'}, row: r, plan: {bench: []}};
  const week = c.hrSiteWeek(S, [{id: 'new', w: {slots: [{shift: 0, d: 1, f: 9, t: 13}]}}],
    new Set(), new Set(['new']), true, false);
  assert.deepEqual(plain(week.days[0].shifts.map(x => x.employeeId)), ['cleaner', 'new']);
});
test('office without history keeps its additive write', () => {
  const c = loadBoard(), r = row();
  delete r.demandBased;
  assert.deepEqual(plain(c.gwRosterWeek(r).days[0].shifts.map(x => [x.f, x.t])), [[8, 18], [8, 12]]);
});
test('zero shop demand clears serving hours instead of preserving cover-only work', () => {
  const c = loadBoard(), r = row();
  r.office = false; r.shifts = [];
  c.payload = {businesses: [{key: r.key, status: 'retail'}], staffing: [r]};
  vm.runInContext('D = payload', c);
  assert.ok(c.gwRosterPlan(r.key));
  assert.deepEqual(plain(c.gwRosterWeek(r).days), []);
});
test('an unreadable office does not block another site in Staff all sites', () => {
  const c = loadBoard(), bad = row(), good = row();
  bad.unrepresentable = 1;
  good.key = 'ba:street_secondavenue#11';
  const sites = [bad, good].map(r => ({key: r.key, row: r, site: {kind: 'office'},
    planned: true, plan: {bench: []}, weeks: [], b: {shiftPrint: 'old'}}));
  c.payload = {businesses: sites.map(S => ({key: S.key, status: 'office'})), officeStaffing: [bad, good]};
  vm.runInContext('D = payload', c);
  const req = c.hrRequest({sites, moves: [], overs: [], roles: []}, {mode: 'week', one: true});
  assert.deepEqual(plain(req.body.sites.map(s => s.address.number)), [11]);
  assert.equal(req.unreadableSites[0].key, bad.key);
});
