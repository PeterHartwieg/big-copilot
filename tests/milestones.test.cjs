// Run with: node --test tests/milestones.test.cjs
// The Milestones checklist and its running totals, and the difficulty that
// used to sit under them: now one chip (the masthead's build line, the footer on
// a phone) and a popover with every setting that differs from Normal.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'template', 'board.js'), 'utf8');
const slice = (from, to) => require('./_slice.cjs').between(source, from, to);

const board = (goals = {typesRun: 1, typesTotal: 3}) => {
  const section = {innerHTML: ''};
  const context = vm.createContext({
    $: id => (assert.equal(id, 'secGoals'), section),
    sechead: (title, o = {}) => `<head why="${o.why ?? ''}">${title}${o.quiet ? ` · ${o.quiet}` : ''}</head>`,
    icon: () => '',
    compact: n => String(n),
    D: {goals, meta: {}},
  });
  /* web/i18n.js runs ahead of the board script on the page: the difficulty's
     words are read through its tt(). */
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'i18n.js'), 'utf8'), context);
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

test('Milestones is the career goals and the totals, with the buildings a total, not a goal', () => {
  const html = draw({typesRun: 5, typesTotal: 24, buildingsOwned: 0, buildingsTotal: 885, rivalsDefeated: 0,
    rivalsTotal: 4, goalsDone: 44, diplomas: 5, diplomasTotal: 5, goodsProduced: 321, taxesPaid: 0});
  // The heading alone: no line under it saying what the goals are.
  assert.match(html, new RegExp("<head why=\"\">" + enRe('co.goals.title2').source + "<\\/head>"));
  assert.doesNotMatch(html, new RegExp(enRe('co.goals.tax.lab').source + "<\\/span><span class=\"v\">\\$0<\\/span><span class=\"sub\">"));
  // Pins the wording: the obsolete building-ownership goal must stay absent.
  assert.doesNotMatch(html, /Every building owned|885/);
  // Each goal with a total has its bar; the complete one is ticked; personal
  // goals have no total and no bar.
  assert.match(html, new RegExp(enRe('co.goals.types').source + "<\\/span><span class=\"bz-mbar\" role=\"img\" aria-label=\"" + enRe('co.goals.of', {n: 5, total: 24}).source + "\"><i style=\"--v:20\\.8%\"><\\/i><\\/span><span class=\"c\">5 \\/ 24<\\/span>"));
  assert.match(html, new RegExp("class=\"mile bz-mile done\"><span class=\"box\"><\\/span><span class=\"bz-ml\">" + enRe('co.goals.diplomas').source));
  assert.match(html, new RegExp(enRe('co.goals.personal').source + "<\\/span><span class=\"bz-mbar none\"><\\/span><span class=\"c\">" + enRe('co.goals.done', {n: 44}).source));
  // The running totals, as tiles.
  assert.match(html, new RegExp(enRe('co.goals.goods.lab').source + "<\\/span><span class=\"v\">321<\\/span>"));
  assert.match(html, new RegExp(enRe('co.goals.tax.lab').source + "<\\/span><span class=\"v\">\\$0<\\/span>"));
  assert.match(html, new RegExp(enRe('co.goals.buildings.lab').source + "<\\/span><span class=\"v\">0<\\/span>"));
  assert.match(draw({buildingsOwned: 1}), new RegExp(enRe('co.goals.buildings.lab').source + "<\\/span><span class=\"v\">1<\\/span>"));
  // The difficulty is no longer here: no chips, no "playing on".
  // Pins the wording: the retired difficulty sentence must stay absent from Milestones.
  assert.doesNotMatch(html, /class="rules"|playing on/);
});

test('a custom game counts each direction that moved', () => {
  const h = {label: 'Custom', slot: 0, harder: 10, easier: 0, startingMoney: 0, rules: []};
  assert.match(chip(h), new RegExp("<span>" + enRe('nav.diff.custom').source.toUpperCase() + ' · ' + enRe('nav.diff.harder', {n: 10}).source.toUpperCase() + "<\\/span><\\/button>$"));
  assert.match(chip(h, 'foot'), new RegExp("<span>" + enRe('nav.diff.custom').source + ' · ' + enRe('nav.diff.harder', {n: 10}).source + "<\\/span>"));
  assert.match(chip({...h, easier: 1}), new RegExp((en('nav.diff.custom') + ' · ' + en('nav.diff.harder', {n: 10}) + ' · ' + en('nav.diff.easier', {n: 1})).toUpperCase()));
  assert.match(chip(h), new RegExp('data-tip="' + enRe('nav.diff.tip.vs', {what: en('nav.diff.what.custom'), vs: en('nav.diff.vs.harder', {n: 10})}).source + '"'));
  assert.match(chip({...h, harder: 1, easier: 2}), enRe('nav.diff.tip.vs', {what: en('nav.diff.what.custom'), vs: en('nav.diff.vs.both', {n: 1, e: 2})}));
  // A real button that says what it opens.
  assert.match(chip(h), /^<button type="button" class="fv-diff" data-fv-at="mast" aria-expanded="false" aria-controls="fvDiffPop"/);
});

test('a preset is its name, Normal included', () => {
  assert.match(chip({label: 'Normal', slot: 2, harder: 0, easier: 0, startingMoney: 10000, rules: []}), new RegExp("<span>" + enRe('nav.diff.normal').source.toUpperCase() + "<\\/span>"));
  assert.match(chip({label: 'Hard', slot: 3, harder: 2, easier: 0, startingMoney: 4200, rules: []}), new RegExp("<span>" + enRe('nav.diff.hard').source.toUpperCase() + "<\\/span>"));
  assert.match(chip({label: 'Easy', slot: 1, harder: 0, easier: 8, startingMoney: 15000, rules: []}),
    enRe('nav.diff.tip.vs', {what: en('nav.diff.what.preset', {name: en('nav.diff.easy')}), vs: en('nav.diff.vs.easier', {n: 8})}));
  assert.match(chip({label: 'Unknown', slot: 4, harder: 0, easier: 0, startingMoney: 5000, rules: []}), new RegExp("<span>" + enRe('nav.diff.unknown').source.toUpperCase() + "<\\/span>"));
  assert.equal(chip(undefined), '', 'a board without house rules shows no chip');
});

test('the popover lists every moved setting against Normal, the tax rate as a percentage', () => {
  const html = pop({label: 'Hard', slot: 3, harder: 2, easier: 0, startingMoney: 4200, rules: [
    rule('Wholesale urgent fee', 0.3, 0.2, 'harder'), rule('Tax rate', 51, 5, 'harder', '%'),
    rule('Public prices', 0.7, 0.7, 'level'),
  ]});
  assert.match(html, new RegExp("<h3>" + enRe('nav.diff.pop.title', {name: en('nav.diff.hard')}).source + "<span class=\"fv-popchips\"><span class=\"chip warn\">" + enRe('nav.diff.harder', {n: 2}).source + "<\\/span><\\/span><\\/h3>"));
  assert.match(html, new RegExp(enRe('nav.diff.lead.preset', {name: en('nav.diff.hard')}).source + ' ' + enRe('nav.diff.started', {w: '$4,200'}).source));
  assert.match(html, new RegExp('data-tip="' + enRe('nav.diff.rule.harder', {what: 'What it does', normal: '×0.2'}).source + '">.*Wholesale urgent fee'));
  assert.match(html, new RegExp("<span class=\"v\">51%<small>" + enRe('nav.diff.rule.normal', {v: '5%'}).source + "<\\/small><\\/span>"));
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
  assert.match(html, new RegExp("<h3>" + enRe('nav.diff.pop.title', {name: en('nav.diff.normal')}).source + "<\\/h3>"));
  assert.doesNotMatch(html, /fv-rule|fv-popfoot/);
});
