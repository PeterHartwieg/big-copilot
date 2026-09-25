// Run with: node --test tests/milestones.test.cjs
// The Milestones checklist and its running totals, and the difficulty that
// used to sit under them: now one chip (the masthead's build line, the footer on
// a phone) and a popover with every setting that differs from Normal.
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

const board = (goals = {typesRun: 1, typesTotal: 3}) => {
  const section = {innerHTML: ''};
  const context = vm.createContext({
    $: id => (assert.equal(id, 'secGoals'), section),
    sechead: (title, o) => `<head why="${o.why ?? ''}">${o.quiet}</head>`,
    icon: () => '',
    compact: n => String(n),
    D: {goals, meta: {}},
  });
  vm.runInContext(slice('const fmt =', 'const compact =') + slice('const attr =', '/* Tooltips are plain text')
    + slice('\nconst plural =', '/* A rival per dot')
    + slice('function drawGoals(){', '/* Next moves: the Plan imports card'), context);
  require('./_payload_contract.cjs').assertPayloadShape(context.D, 'milestones');
  return {context, section};
};
const draw = goals => { const b = board(goals); b.context.drawGoals(); return b.section.innerHTML; };
const chip = (h, place = 'mast') => board().context.fvDiffChip(h, place);
const pop = h => board().context.fvDiffPopHtml(h);
const rule = (name, value, normal, lean, unit = '×') =>
  ({name, value, normal, unit, lean, what: 'what it does'});

test('Milestones is the checklist and its totals, with the buildings a total, not a goal', () => {
  const html = draw({typesRun: 5, typesTotal: 24, buildingsOwned: 0, buildingsTotal: 885, rivalsDefeated: 0,
    rivalsTotal: 4, goalsDone: 44, diplomas: 5, diplomasTotal: 5, goodsProduced: 321, taxesPaid: 0});
  assert.match(html, /<head why="">career totals<\/head>/);
  assert.doesNotMatch(html, /Every building owned|885/);
  assert.match(html, /321 goods produced · 0 in tax paid · 0 buildings owned<\/p>/);
  assert.match(draw({buildingsOwned: 1}), /· 1 building owned</);
  // The difficulty is no longer here: no chips, no "playing on".
  assert.doesNotMatch(html, /class="rules"|playing on/);
});

test('a custom game counts each direction that moved', () => {
  const h = {label: 'Custom', slot: 0, harder: 10, easier: 0, startingMoney: 0, rules: []};
  assert.match(chip(h), /<span>CUSTOM · 10 HARDER<\/span><\/button>$/);
  assert.match(chip(h, 'foot'), /<span>Custom · 10 harder<\/span>/);
  assert.match(chip({...h, easier: 1}), /CUSTOM · 10 HARDER · 1 EASIER/);
  assert.match(chip(h), /data-tip="Custom difficulty: 10 settings harder than Normal\. Click for each setting\."/);
  assert.match(chip({...h, harder: 1, easier: 2}), /1 setting harder and 2 easier than Normal/);
  // A real button that says what it opens.
  assert.match(chip(h), /^<button type="button" class="fv-diff" data-fv-at="mast" aria-expanded="false" aria-controls="fvDiffPop"/);
});

test('a preset is its name, Normal included', () => {
  assert.match(chip({label: 'Normal', slot: 2, harder: 0, easier: 0, startingMoney: 10000, rules: []}), /<span>NORMAL<\/span>/);
  assert.match(chip({label: 'Hard', slot: 3, harder: 2, easier: 0, startingMoney: 4200, rules: []}), /<span>HARD<\/span>/);
  assert.match(chip({label: 'Easy', slot: 1, harder: 0, easier: 8, startingMoney: 15000, rules: []}),
    /data-tip="The game's Easy preset: 8 settings easier than Normal\./);
  assert.match(chip({label: 'Unknown', slot: 4, harder: 0, easier: 0, startingMoney: 5000, rules: []}), /<span>UNKNOWN<\/span>/);
  assert.equal(chip(undefined), '', 'a board without house rules shows no chip');
});

test('the popover lists every moved setting against Normal, the tax rate as a percentage', () => {
  const html = pop({label: 'Hard', slot: 3, harder: 2, easier: 0, startingMoney: 4200, rules: [
    rule('Wholesale urgent fee', 0.3, 0.2, 'harder'), rule('Tax rate', 51, 5, 'harder', '%'),
    rule('Public prices', 0.7, 0.7, 'level'),
  ]});
  assert.match(html, /<h3>Hard difficulty<span class="fv-popchips"><span class="chip warn">2 harder<\/span><\/span><\/h3>/);
  assert.match(html, /Hard is one of the game's presets: every setting where it differs from Normal\. Started with \$4,200\./);
  assert.match(html, /data-tip="What it does\. Normal is ×0\.2, so this game is harder\.">.*Wholesale urgent fee/);
  assert.match(html, /<span class="v">51%<small>Normal 5%<\/small><\/span>/);
  assert.doesNotMatch(html, /×51|Public prices/);
});

test('right is always harder: a harder setting knobs right, an easier one left', () => {
  const html = pop({label: 'Custom', slot: 0, harder: 1, easier: 1, startingMoney: 0, rules: [
    rule('Export price', 0.1, 0.65, 'harder'), rule('Rival attacks', 0, 1, 'easier'),
  ]});
  const knobs = [...html.matchAll(/<span class="me( easy)?" style="left:(\d+)%"/g)].map(m => [!!m[1], +m[2]]);
  assert.equal(knobs.length, 2);
  assert.ok(knobs[0][1] > 50 && !knobs[0][0]);
  // Rival attacks at 0 switches them off: the far easy end, not a division by zero.
  assert.deepEqual(knobs[1], [true, 4]);
});

test('a Normal game has nothing to list', () => {
  const html = pop({label: 'Normal', slot: 2, harder: 0, easier: 0, startingMoney: 10000,
    rules: [rule('Public prices', 0.7, 0.7, 'level')]});
  assert.match(html, /<h3>Normal difficulty<\/h3>/);
  assert.doesNotMatch(html, /fv-rule|fv-popfoot/);
});
