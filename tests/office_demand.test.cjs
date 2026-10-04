'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {loadBoard} = require('./_board.cjs');
const plain = x => JSON.parse(JSON.stringify(x));
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
  assert.equal(c.gwRosterMatches(r, week), false);
  r.current.list[0] = {...r.shifts[0]};
  assert.equal(c.gwRosterMatches(r, c.gwRosterWeek(r)), true);
});
test('measured zero demand can remove the last professional hours', () => {
  const c = loadBoard(), r = row();
  r.shifts = [];
  const week = c.gwRosterWeek(r);
  assert.equal(week.sent, 0);
  assert.deepEqual(plain(week.days[0].shifts.map(x => x.employeeId)), ['cleaner']);
  assert.equal(c.gwRosterMatches(r, week), false);
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
test('confirmed zero shop demand clears serving hours instead of preserving cover-only work', () => {
  const c = loadBoard(), r = row();
  r.office = false; r.shifts = []; r.demandEvidence = {persistent: true, phase: 'confirmed'};
  c.payload = {businesses: [{key: r.key, status: 'retail'}], staffing: [r]};
  vm.runInContext('D = payload', c);
  assert.ok(c.gwRosterPlan(r.key));
  assert.deepEqual(plain(c.gwRosterWeek(r).days), []);
  assert.match(c.spDemandEvidence(r), /Measurement reviewed/);
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
test('measurement view distinguishes pending, ready and unavailable history', () => {
  const c = loadBoard(), r = row();
  r.demandEvidence = {persistent: true, phase: 'pending'};
  assert.match(c.spDemandEvidence(r), /Apply the week/);
  r.demandEvidence.phase = 'ready';
  assert.match(c.spDemandEvidence(r), /Confirm only if/);
  r.demandEvidence.persistent = false;
  assert.match(c.spDemandEvidence(r), /unavailable without saved company history/);
});
