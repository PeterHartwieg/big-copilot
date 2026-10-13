'use strict';
// Issue #446: the full-cover week of a shop not open around the clock is placed
// without holding anybody on the hours they work now, so its review says when,
// written before the people it waits on are added, it leaves an hour with
// fewer people than now (gwFewerNow()).
const {test} = require('node:test');
const assert = require('node:assert/strict');
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
