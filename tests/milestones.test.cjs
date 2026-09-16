// Run with: node --test tests/milestones.test.cjs
// The Milestones section's house rules: the difficulty in the section head, and
// one chip per setting that differs from the game's Normal preset.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'ba_dashboard.py'), 'utf8');
const slice = (from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `${from} not found`);
  return source.slice(start, end);
};

const draw = (houseRules, difficulty = houseRules?.label) => {
  const section = {innerHTML: ''};
  const context = vm.createContext({
    $: id => (assert.equal(id, 'secGoals'), section),
    sechead: (title, o) => `<head why="${o.why}">${o.quiet}</head>`,
    icon: () => '',
    compact: n => String(n),
    D: {goals: {typesRun: 1, typesTotal: 3}, meta: {difficulty, houseRules}},
  });
  vm.runInContext(slice('const fmt =', 'const compact =') + slice('const attr =', '/* Tooltips are plain text')
    + slice('\nconst plural =', '/* A rival per dot')
    + slice('function drawGoals(){', 'function drawFindLocation('), context);
  context.drawGoals();
  return section.innerHTML;
};
const rule = (name, value, normal, lean, unit = '×') =>
  ({name, value, normal, unit, lean, what: 'what it does'});

test('a Hard game names its preset and marks the urgent fee harder than Normal', () => {
  const html = draw({label: 'Hard', slot: 3, harder: 2, easier: 0, startingMoney: 4200, rules: [
    rule('Wholesale urgent fee', 0.3, 0.2, 'harder'),
    rule('Tax rate', 30, 5, 'harder', '%'),
  ]});
  assert.match(html, />career totals · playing on Hard, 2 settings harder than Normal, started on \$4,200<\/head>/);
  assert.match(html, /data-tip="What it does\. Normal is ×0\.2, so this game is harder\.">Wholesale urgent fee<b>×0\.3<\/b>/);
  assert.doesNotMatch(html, /Stock|Custom|easier/);
});

test('the tax rate reads as a percentage, not a multiplier', () => {
  const html = draw({label: 'Custom', slot: 0, harder: 1, easier: 0, startingMoney: 0,
    rules: [rule('Tax rate', 51, 5, 'harder', '%')]});
  assert.match(html, /playing on custom settings, 1 setting harder than Normal, started on \$0/);
  assert.match(html, /Normal is 5%, so this game is harder\.">Tax rate<b>51%<\/b>/);
  assert.doesNotMatch(html, /×51/);
});

test('the head counts each direction that moved, and a Normal game lists no chips', () => {
  const custom = draw({label: 'Custom', slot: 0, harder: 1, easier: 2, startingMoney: 0, rules: [
    rule('Public prices', 1.3, 0.7, 'harder'), rule('Rival attacks', 0, 1, 'easier'),
    rule('Tax rate', 0, 5, 'easier', '%'),
  ]});
  assert.match(custom, /playing on custom settings, 1 setting harder and 2 easier than Normal, started on \$0/);
  const easy = draw({label: 'Easy', slot: 1, harder: 0, easier: 8, startingMoney: 15000, rules: []});
  assert.match(easy, />career totals · playing on Easy, 8 settings easier than Normal, started on \$15,000<\/head>/);
  const normal = draw({label: 'Normal', slot: 2, harder: 0, easier: 0, startingMoney: 10000,
    rules: [rule('Public prices', 0.7, 0.7, 'level')]});
  assert.match(normal, />career totals · playing on Normal, started on \$10,000<\/head>/);
  assert.doesNotMatch(normal, /class="rules"/);
});

test('a slot the board does not know is not called custom', () => {
  const html = draw({label: 'Unknown', slot: 4, harder: 0, easier: 0, startingMoney: 5000, rules: []});
  assert.match(html, /playing on an unrecognised difficulty, started on \$5,000/);
});

test('without house rules the head falls back to the difficulty and drops the help', () => {
  const html = draw(undefined, 'Hard');
  assert.match(html, /<head why="">career totals · playing on Hard<\/head>/);
  assert.doesNotMatch(html, /class="rules"/);
});
