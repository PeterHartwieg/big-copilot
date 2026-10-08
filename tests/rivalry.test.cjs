'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {loadBoard, recordingDocument} = require('./_board.cjs');
const {en, enRe} = require('./_i18n.cjs');
const {assertPayloadShape} = require('./_payload_contract.cjs');

function rivalry(overrides = {}){
  return {rank: 1, tied: 0, first: true, you: 12000, top: 10000, gap: 2000, of: 20,
    rival: {number: 3, name: 'Synthetic Holdings'}, streak: 3, streakAtLeast: false,
    days: [{day: 17}, {day: 18, rank: 2, tied: 0, first: false, gap: -100},
      {day: 19, rank: 1, tied: 1, first: false, gap: 0},
      {day: 20, rank: 1, tied: 0, first: true, gap: 2000}], ...overrides};
}

function board(r = rivalry(), hidden = false, omit = false){
  const {document, element} = recordingDocument();
  const storage = new Map(hidden ? [['ba_rivalry_hidden', '1']] : []);
  const localStorage = {getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k)};
  const classes = new Set();
  element('kpis').classList = {toggle(k, on){ on ? classes.add(k) : classes.delete(k); }};
  // Capture actual listeners on the created preferences sheet, while retaining
  // the recording harness for all other boot-time DOM operations.
  const created = [];
  const wrappedDocument = new Proxy(document, {get(target, key){
    if(key === 'createElement') return () => {
      const node = element(`created-${created.length}`);
      node.listeners = new Map();
      node.addEventListener = (kind, callback) => node.listeners.set(kind, callback);
      created.push(node);
      return node;
    };
    return target[key];
  }});
  const D = {goals: {typesRun: 1, typesTotal: 3}, meta: {day: 20},
    kpi: {cash: 25000, debt: 0, profitYesterday: 1000, profitAvg7: 1000,
      profitPrev7: 900, profitSum7: 7000, revenue: 2000, rentBill: 100,
      netWorth: null, customers: 20}, daily: [{day: 19, profit: 1000, revenue: 2000}],
    staff: {dailyCost: 100}, loans: [], ...(!omit ? {rivalry: r} : {})};
  assertPayloadShape(D, 'rivalry');
  const context = loadBoard({document: wrappedDocument, localStorage, __D: D});
  vm.runInContext('D = __D', context);
  // Optional preference rows need textContent; absent rows are represented by
  // empty text here so pxPrefsHtml can build the real rivalry preference.
  element('localeChip').textContent = '';
  element('localeReset').textContent = '';
  const goals = () => { context.drawGoals(); return element('secGoals').innerHTML; };
  const kpis = () => { context.drawKpis(); return element('kpis').innerHTML; };
  return {context, element, storage, classes, goals, kpis};
}

test('Milestones renders rank, lead, first-place days and each strip state', () => {
  const b = board(), html = b.goals();
  assert.match(html, enRe('co.rv.rank.v', {n: 1, of: 20}));
  assert.match(html, enRe('co.rv.lead.lab'));
  assert.match(html, enRe('co.rv.lead.sub', {rival: 'Synthetic Holdings', w: 10000}));
  assert.match(html, /<span class="v">\$2,000<\/span>/);
  assert.match(html, new RegExp(enRe('co.rv.run.lab').source + '<\\/span><span class="v">3<\\/span>'));
  assert.deepEqual([...html.matchAll(/<i class="(on|off|tie|unk)" data-tip="([^"]*)"><\/i>/g)]
    .map(m => m[1]), ['unk', 'off', 'tie', 'on']);
  assert.match(html, enRe('co.rv.day.unk', {d: 17}));
  assert.match(html, enRe('co.rv.day.off', {d: 18, n: 2, w: 100}));
  assert.match(html, enRe('co.rv.day.tie', {d: 19}));
  assert.match(html, enRe('co.rv.day.on', {d: 20, w: 2000}));
});

test('behind shows the shortfall and leader name in both views', () => {
  const b = board(rivalry({rank: 4, first: false, gap: -3000, top: 15000, streak: 0}));
  const html = b.goals();
  assert.match(html, enRe('co.rv.rank.v', {n: 4, of: 20}));
  assert.match(html, enRe('co.rv.behind.lab'));
  assert.match(html, enRe('co.rv.behind.sub', {rival: 'Synthetic Holdings', w: 15000}));
  assert.match(html, /<span class="v">\$3,000<\/span>/);
  assert.doesNotMatch(html, enRe('co.rv.lead.lab'));
  assert.match(b.kpis(), enRe('today.kpi.rv.behind.tip', {rival: 'Synthetic Holdings', w: 3000}));
});

test('a tie at the top is unsafe first place and displays a tied Overview chip', () => {
  const b = board(rivalry({tied: 1, first: false, gap: 0, streak: 0}));
  assert.match(b.goals(), enRe('co.rv.rank.tied', {n: 1}));
  assert.match(b.goals(), enRe('co.rv.level.lab'));
  assert.doesNotMatch(b.goals(), enRe('co.rv.lead.lab'));
  assert.match(b.kpis(), enRe('today.kpi.rv.tied'));
  assert.match(b.kpis(), enRe('today.kpi.rv.tied.tip', {n: 1}));
});

test('a run with missing earlier days displays the lower bound in both views', () => {
  const b = board(rivalry({streak: 12, streakAtLeast: true}));
  assert.match(b.goals(), enRe('co.rv.run.least', {n: 12}));
  assert.match(b.goals(), enRe('co.rv.run.least.sub'));
  assert.match(b.kpis(), enRe('today.kpi.rv.days.least', {n: 12}));
});

test('rival names are escaped as text and inside Overview tooltip attributes', () => {
  const name = '<img src=x onerror=alert(1)>', b = board(rivalry({rival: {number: 3, name}}));
  const goals = b.goals(), kpis = b.kpis();
  assert.doesNotMatch(goals, /<img\b/);
  assert.ok(goals.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.doesNotMatch(kpis, /<img\b/);
  const tips = [...kpis.matchAll(/data-tip="([^"]*)"/g)].map(m => m[1]);
  // Attribute escaping must neutralize the opening bracket; a closing bracket
  // is safe inside a quoted attribute whether escaped or left as text.
  assert.ok(tips.some(t => /&lt;img src=x onerror=alert\(1\)(?:>|&gt;)/.test(t)));
  assert.equal(kpis.replace(/data-tip="[^"]*"/g, '').includes('onerror=alert(1)'), false);
  const quoted = board(rivalry({rival: {number: 3, name: 'A "quoted" & <rival>'}}));
  assert.match(quoted.kpis(), /A &quot;quoted&quot; &amp; &lt;rival(?:>|&gt;)/);
});

test('an unnamed rival uses the stable numbered company label', () => {
  const b = board(rivalry({rival: {number: 7, name: null}}));
  const name = en('co.rv.rival.n', {n: 7});
  assert.match(b.goals(), enRe('co.rv.lead.sub', {rival: name, w: 10000}));
  assert.match(b.kpis(), enRe('today.kpi.rv.lead.tip2', {rival: name, w: 2000}));
});

test('absent, null and hidden rivalry leave four Overview tiles and no Milestones block', () => {
  for(const b of [board(null), board(null, false, true), board(rivalry(), true)]){
    assert.doesNotMatch(b.goals(), /rl-fins|rl-strip/);
    const html = b.kpis();
    assert.equal([...html.matchAll(/data-kpi="/g)].length, 4);
    assert.doesNotMatch(html, /data-kpi="rivals"/);
    assert.equal(b.classes.has('ov-k5'), false);
  }
});

test('visible rivalry is the fifth tile and the layout resets when it is hidden', () => {
  const b = board();
  assert.deepEqual([...b.kpis().matchAll(/data-kpi="([^"]+)"/g)].map(m => m[1]).slice(-1), ['rivals']);
  assert.equal([...b.kpis().matchAll(/data-kpi="/g)].length, 5);
  assert.equal(b.classes.has('ov-k5'), true);
  b.storage.set('ba_rivalry_hidden', '1');
  assert.equal([...b.kpis().matchAll(/data-kpi="/g)].length, 4);
  assert.equal(b.classes.has('ov-k5'), false);
  assert.doesNotMatch(b.goals(), /rl-fins/);
});

test('the preferences button toggles persistent visibility and refreshes both views', () => {
  const b = board();
  const button = {dataset: {pxDo: 'rivalry'}};
  const event = {target: {closest: selector => selector === '[data-px-do]' ? button : null}};
  const click = vm.runInContext('pxSheet', b.context).listeners.get('click');
  assert.equal(typeof click, 'function');
  // The test exercises the registered click handler, storage and draw calls.
  // Reopening the sheet is a separate DOM focus/layout operation.
  vm.runInContext('pxOpen = () => {}; odReady = () => true;', b.context);
  assert.match(b.context.pxPrefsHtml(), new RegExp('data-px-do="rivalry">' + enRe('nav.px.rv.hide').source));
  click(event);
  assert.equal(b.storage.get('ba_rivalry_hidden'), '1');
  assert.doesNotMatch(b.element('secGoals').innerHTML, /rl-fins/);
  assert.equal(b.classes.has('ov-k5'), false);
  assert.match(b.context.pxPrefsHtml(), new RegExp('data-px-do="rivalry">' + enRe('nav.px.rv.show').source));
  click(event);
  assert.equal(b.storage.get('ba_rivalry_hidden'), '0');
  assert.match(b.element('secGoals').innerHTML, /rl-fins/);
  assert.equal(b.classes.has('ov-k5'), true);
});
