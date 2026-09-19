// Which list a finding shows in: the materiality gate decides, a kind's switch
// only demotes. Issue #51 — the switch under the list did nothing at all to a
// finding the gate had already set aside, because the smaller list was built
// from the raw minor rows.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'ba_dashboard.py'), 'utf8');
/* The comment above the function is the slice's opening anchor: rewording it is
   a change to this test as well. */
const START = '/* Where a finding shows is decided twice over';
const PARTITION = source.slice(source.indexOf(START), source.indexOf('function drawAlerts()'));
const DRAW = source.slice(
  source.indexOf('function drawAlerts()'), source.indexOf('/* A round step for the y axis'));

const context = vm.createContext({});
vm.runInContext(PARTITION, context);
const split = (alerts, minorRows, prefs) =>
  vm.runInContext('partitionFindings', context)(alerts, minorRows, prefs);

const row = (group, worth, id) => ({group, worth, id});
const GATE = {atcap: false, idlestaff: false, jobdemand: true, hype: true};

test('a kind switched off leaves the list and lands under it', () => {
  const alerts = [row('atcap', 9000, 'a'), row('jobdemand', 8000, 'b')];
  const minor = [row('hype', 30, 'c')];
  const {list, smaller, off} = split(alerts, minor, GATE);
  assert.deepEqual(list, [alerts[1]]);
  assert.deepEqual(smaller, [minor[0], alerts[0]]);
  assert.equal(off, 1);
});

test('nothing is dropped, in either direction', () => {
  const alerts = [row('atcap', 9000, 'a'), row('idlestaff', 8000, 'b'), row('hype', 7000, 'c')];
  const minor = [row('jobdemand', 30, 'd'), row('hype', 20, 'e')];
  const every = (prefs) => {
    const {list, smaller} = split(alerts, minor, prefs);
    return list.concat(smaller);
  };
  // The same five findings are on screen whichever way the switches point.
  const ids = (rows) => rows.map(r => r.id).sort();
  assert.deepEqual(ids(every(GATE)), ids(every({})));
  assert.deepEqual(ids(every({atcap: false, idlestaff: false, hype: false, jobdemand: false})),
                   ids(every({})));
});

test('a below-gate finding answers its own switch by moving to the bottom', () => {
  const minor = [
    row('hype', 40, 'hype'),
    row('idlestaff', 30, 'idle'),
    row('jobdemand', 20, 'demand'),
  ];
  const on = split([], minor, {});
  assert.deepEqual(on.smaller.map(r => r.id), ['hype', 'idle', 'demand']);
  assert.equal(on.off, 0);
  const off = split([], minor, {idlestaff: false});
  assert.deepEqual(off.smaller.map(r => r.id), ['hype', 'demand', 'idle']);
  assert.equal(off.off, 1);
});

test('off counts the switched-off rows from both sides of the gate', () => {
  const alerts = [row('atcap', 9000, 'a'), row('idlestaff', 8000, 'b')];
  const minor = [row('idlestaff', 30, 'c'), row('hype', 20, 'd')];
  const {smaller, off} = split(alerts, minor, {atcap: false, idlestaff: false});
  // 'd' is the only below-gate row still switched on, so it leads.
  assert.deepEqual(smaller.map(r => r.id), ['d', 'c', 'a', 'b']);
  assert.equal(off, 3);
});

test('with the defaults the smaller list is the gate rows and nothing is called off', () => {
  const minor = [row('hype', 40, 'a'), row('jobdemand', 30, 'b')];
  const {list, smaller, off} = split([row('atcap', 9000, 'c')], minor, {});
  assert.deepEqual(list, [row('atcap', 9000, 'c')]);
  assert.deepEqual(smaller, minor);
  assert.equal(off, 0);
});

test('the count line says what was switched off', () => {
  assert.match(DRAW, /partitionFindings\(/);
  assert.match(DRAW, /switched off/);
});
