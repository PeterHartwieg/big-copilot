// tests/_i18n.cjs, the helpers the other suites assert UI text with: English
// from the catalogue, the RegExps built from it, and the payload's i18n wires.
// A small made-up catalogue stands in for the extract, so no real wording is
// pinned here; the last test checks the real extract loads.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const h = require('./_i18n.cjs');

const TABLE = {
  't.add_one': 'Add {n} person: {who}',
  't.add_other': 'Add {n} people: {who}',
  't.loss': 'Lost {w:$} yesterday',
  't.role': '{role} staffing',
  't.metres': '{n} m',
  't.head_one': '<b>{n} hire waits</b>.',
  't.head_other': '<b>{n} hires wait</b>.',
  't.gap': '{site} keeps {n} {role} open',
  't.ceiling_one': 'Full; {limit} is the limit; the fix is {fix}.',
  't.ceiling_other': 'Full; {limit} are the limit; the fix is {fix}.',
};
const fake = fn => () => {
  h.useCatalogue(TABLE);
  try { fn(); } finally { h.useCatalogue(null); }
};

test('en() fills a key as the page does: plural by n, specs, cap', fake(() => {
  assert.deepEqual(h.english('t.add'), {one: 'Add {n} person: {who}', other: 'Add {n} people: {who}'});
  assert.equal(h.en('t.add', {n: 1, who: 'x'}), 'Add 1 person: x');
  assert.equal(h.en('t.loss', {w: 1234}), 'Lost $1,234 yesterday');
  assert.equal(h.en('t.role', {role: 'cook'}, {cap: true}), 'Cook staffing');
  assert.equal(h.en('t.add'), 'Add {n} people: {who}', 'an unfilled placeholder stays');
  assert.throws(() => h.english('t.none'), /no catalogue key/);
}));

test('enRe() leaves unfilled placeholders open, takes RegExp params and either plural', fake(() => {
  const add = h.enRe('t.add');
  assert.ok(add.test('Add 1 person: hire 1 Cook'));
  assert.ok(add.test('Add 3 people: hire 3 Cooks'));
  const metres = h.enRe('t.metres', {n: /\d+/}, {anchor: 'full'});
  assert.ok(metres.test('12 m'));
  assert.ok(!metres.test('NaN m'));
  assert.ok(h.enRe('t.loss', {w: 200}, {anchor: 'full'}).test('Lost $200 yesterday'));
  assert.ok(h.enRe('t.role', {role: 'cook'}, {cap: true, anchor: 'full'}).test('Cook staffing'));
  assert.ok(h.enRe('t.add', {n: 2, who: h.en('t.role')}).test('Add 2 people: anyone staffing'),
    'a {placeholder} left in a param is open too');
}));

test("the English's own tags are optional, or dropped for text; a param's markup is literal", fake(() => {
  const head = h.enRe('t.head', {n: 1}, {anchor: 'full'});
  assert.ok(head.test('<b>1 hire waits</b>.'));
  assert.ok(head.test('1 hire waits.'));
  assert.equal(h.enText('t.head', {n: 2}), '2 hires wait.');
  const hostile = '<img src=x>';
  assert.ok(h.textRe('t.gap', {site: hostile, n: 1, role: 'Cook'}, {anchor: 'full'}).test(`${hostile} keeps 1 Cook open`));
  assert.ok(!h.textRe('t.gap', {site: hostile, n: 1, role: 'Cook'}).test(' keeps 1 Cook open'));
  assert.equal(h.enBetween('t.ceiling', 'limit', 'fix', {n: 1}), ' is the limit; the fix is ');
  assert.equal(h.enBetween('t.ceiling', 'limit', 'fix', {n: 2}), ' are the limit; the fix is ');
}));

test('payload wires: wire(), assertMsg() with msgParam(), findMsg()', () => {
  const row = {text: 'x', i18n: {text: ['f.list', {a: 'A', b: {m: ['f.list.last', {a: 'B', b: 'C'}, 'B, C']}}]}};
  assert.equal(h.wire(row, 'text')[0], 'f.list');
  h.assertMsg(row, 'text', 'f.list', {a: 'A', b: h.msgParam('f.list.last')});
  assert.throws(() => h.assertMsg(row, 'text', 'f.list', {a: 'Z'}));
  assert.throws(() => h.wire({text: 'x'}, 'text'), /no i18n wire/);
  assert.deepEqual(h.findMsg(row.i18n.text, 'f.list.last'), ['f.list.last', {a: 'B', b: 'C'}, 'B, C']);
  assert.equal(h.findMsg(row.i18n.text, 'f.none'), null);
});

test('the real catalogue loads, plurals as key_one / key_other', () => {
  const t = h.catalogue();
  assert.ok(Object.keys(t).length > 1000);
  assert.ok(Object.keys(t).some(k => k.endsWith('_one') && typeof t[k.replace(/_one$/, '_other')] === 'string'));
});
