'use strict';
// Issue #446: the full-cover week of a shop not open around the clock is placed
// without holding anybody on the hours they work now, so its review says when,
// written before the people it waits on are added, it leaves an hour with
// fewer people than now (gwFewerNow()).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {loadBoard} = require('./_board.cjs');

function row(){
  // One register; Ann works it Thursday 09-21 now. The plan gives her Monday
  // and leaves Thursday to a hire.
  return {key: 'ba:street_x#1', full: true,
    people: [{id: 'ann', name: 'Ann'}],
    stations: [{id: 'reg', skill: 'cs'}],
    shifts: [{d: 0, f: 9, t: 21, s: 0, p: 0}, {d: 3, f: 9, t: 21, s: 0, p: null}],
    addPeople: {people: 1, assign: [], hire: [{skill: 'cs', people: 1}]},
    current: {list: [{d: 3, f: 9, t: 21, s: 0, p: 0}]}};
}

test('a full-cover week that leaves Thursday empty until the hire says so', () => {
  const c = loadBoard(), r = row();
  assert.equal(c.gwFewerNow(r, c.gwRosterWeek(r).days), 12);
});

test('nothing is said where the plan waits on nobody', () => {
  const c = loadBoard(), r = row();
  r.shifts[1].p = 0;
  r.shifts[0].d = 4;
  assert.equal(c.gwFewerNow(r, c.gwRosterWeek(r).days), 0);
});

test('an hour the plan wants fewer people on is not counted', () => {
  const c = loadBoard(), r = row();
  r.shifts = [{d: 0, f: 9, t: 21, s: 0, p: 0}, {d: 2, f: 9, t: 21, s: 0, p: null}];
  assert.equal(c.gwFewerNow(r, c.gwRosterWeek(r).days), 0);
});

test('people kept where they work now leave nothing to say', () => {
  const c = loadBoard(), r = row();
  r.shifts = [{d: 3, f: 9, t: 21, s: 0, p: 0}, {d: 0, f: 9, t: 21, s: 0, p: null}];
  assert.equal(c.gwFewerNow(r, c.gwRosterWeek(r).days), 0);
});

test('a bench member the plan waits on counts as waiting', () => {
  const c = loadBoard(), r = row();
  // Bo is unassigned: the plan gives Bo Thursday, and the write leaves it empty.
  r.people.push({id: 'bo', name: 'Bo'});
  r.shifts[1].p = 1;
  r.addPeople = {people: 1, assign: [{id: 'bo', p: 1}], hire: []};
  assert.equal(c.gwFewerNow(r, c.gwRosterWeek(r).days), 12);
});

test('a cleaner on Thursday does not hide the empty register hours', () => {
  const c = loadBoard(), r = row();
  r.people.push({id: 'cy', name: 'Cy'});
  r.stations.push({id: 'mop', skill: 'cleaning'});
  r.shifts.push({d: 3, f: 9, t: 21, s: 1, p: 1, k: 'clean'});
  // New on Thursday: counted as one more person there, the empty register
  // would read as made up for.
  assert.equal(c.gwFewerNow(r, c.gwRosterWeek(r).days), 12);
});

// The write review itself: the line is drawn for a full-cover week, never
// for the same week as another plan.
function review(c, r){
  c.payload = r;
  vm.runInContext(`D = {businesses: [{key: payload.key, status: 'retail', name: 'Shop'}]};
    gwRosterPlan = () => payload;
    var __specs = []; gwConfirm = spec => { __specs.push(spec); };
    gwSchedule(payload.key);`, c);
  const [spec] = vm.runInContext('__specs', c);
  spec.body();
  return spec.draw({}, 'ready');
}

test('the full-cover review says it, and the same week as another plan does not', () => {
  const c = loadBoard();
  const line = 'fewer people than now until you add the people this plan waits on';
  assert.ok(review(c, row()).includes(line));
  assert.ok(!review(loadBoard(), Object.assign(row(), {full: false})).includes(line));
});
