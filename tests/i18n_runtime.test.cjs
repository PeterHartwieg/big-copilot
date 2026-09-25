// Big Copilot's own text in the UI language: web/i18n.js, run in a vm.
// tt() with plurals, placeholder specs, nested messages and game-name tokens;
// the fallback to English per key; numbers in both locales (and the same
// English as Python's msg() and the board's fmt()/compact()); ttPayload() and
// enOf() over Python's messages; tApply() over markup; and the boot: the ?ui=de
// switch, the table a --lang page carries, and the html.tt-wait guard.
// docs/architecture.md, "UI text".
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'web', 'i18n.js'), 'utf8');
const BOARD = fs.readFileSync(path.join(ROOT, 'ba_dashboard.py'), 'utf8').replace(/\r\n/g, '\n');
const COFFEE = '⟦ba:itemname_coffee|Coffee⟧';

/* A minimal element: attributes, text, element children, matches(). */
function element(attrs = {}, text = '', children = 0){
  const a = {...attrs};
  return {
    textContent: text, children: {length: children},
    getAttribute: k => (k in a ? a[k] : null), setAttribute(k, v){ a[k] = String(v); },
    hasAttribute: k => k in a, attrs: a,
    matches: sel => sel.split(',').some(s => s.slice(1, -1) in a),
  };
}
function fakeDocument(els = [], readyState = 'complete'){
  const classes = new Set();
  const listeners = {};
  return {
    readyState, head: {appendChild(){}},
    documentElement: {lang: 'en', classList: {add: c => classes.add(c), remove: c => classes.delete(c),
      contains: c => classes.has(c)}},
    createElement: () => ({}),
    querySelectorAll: sel => els.filter(e => e.matches(sel)),
    addEventListener(type, fn){ (listeners[type] ||= []).push(fn); },
    fire(type){ (listeners[type] || []).forEach(fn => fn()); },
    classes,
  };
}
/* web/i18n.js in its own global scope. `extra` lands in that scope. */
function load({source = SOURCE, extra = {}} = {}){
  const context = vm.createContext({Intl, Symbol, WeakMap, Map, Set, URLSearchParams, console,
    setTimeout, clearTimeout, ...extra});
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  return {context, run};
}
const german = (table, extra) => {
  const it = load({extra});
  it.context.__table = table;
  it.run('ttSetTable("de", __table)');
  return it;
};

test('English with no table: the English given, placeholders filled, plural by n', () => {
  const {run} = load();
  assert.equal(run('tt("sp.tile.size", "Size")'), 'Size');
  assert.equal(run('tt("f.x", "{n:,} units short at {site}", {n: 12345, site: "HART. Gifts"})'),
    '12,345 units short at HART. Gifts');
  const en = '{one: "{n} machine", other: "{n} machines"}';
  assert.equal(run(`tt("f.m", ${en}, {n: 1})`), '1 machine');
  assert.equal(run(`tt("f.m", ${en}, {n: 0})`), '0 machines');
  assert.equal(run(`tt("f.m", ${en}, {n: 2})`), '2 machines');
  // A placeholder with no param is left as written, rather than guessed.
  assert.equal(run('tt("f.x", "{n} left")'), '{n} left');
});

test('German: the table decides, with its own plural forms', () => {
  const {run} = german({'f.m_one': 'ein Automat', 'f.m_other': '{n} Automaten', 'sp.tile.size': 'Größe'});
  assert.equal(run('tt("sp.tile.size", "Size")'), 'Größe');
  const en = '{one: "{n} machine", other: "{n} machines"}';
  assert.equal(run(`tt("f.m", ${en}, {n: 1})`), 'ein Automat');
  assert.equal(run(`tt("f.m", ${en}, {n: 0})`), '0 Automaten');
  assert.equal(run(`tt("f.m", ${en}, {n: 1234})`), '1234 Automaten');
  assert.deepEqual([...new Intl.PluralRules('de').resolvedOptions().pluralCategories].sort(), ['one', 'other']);
});

test('a missing key, or a translation naming a param it was not given, falls back to English for that key only', () => {
  const {run} = german({'f.a': 'Verlust: {w:$}', 'f.b': '{tage} Tage früher'});
  assert.equal(run('tt("f.a", "Lost {w:$} yesterday", {w: 1234})'), 'Verlust: $1.234');
  assert.equal(run('tt("f.b", "{days:.1f} days early", {days: 3.5})'), '3,5 days early');
  assert.equal(run('tt("f.c", "Nobody here")'), 'Nobody here');
});

test('numbers follow the UI language: en-US in English, German in German', () => {
  const cases = [['{n:,}', 1234567.4], ['{x:.1f}', 3.46], ['{x:,.2f}', 12345.678], ['{w:$}', -1234.5],
    ['{w:$c}', 3574000], ['{w:$c}', 12345678], ['{w:$c}', 751400], ['{n}', 2.5]];
  const en = load(), de = german({'day.0': 'Sonntag'});
  const both = cases.map(([spec, v]) => {
    const code = `tt("f.x", ${JSON.stringify(spec)}, {n: ${v}, x: ${v}, w: ${v}})`;
    return [en.run(code), de.run(code)];
  });
  assert.deepEqual(both, [['1,234,567.4', '1.234.567,4'], ['3.5', '3,5'], ['12,345.68', '12.345,68'],
    ['-$1,234', '-$1.234'], ['$3.57M', '$3,57M'], ['$12.3M', '$12,3M'], ['$751k', '$751k'], ['2.5', '2,5']]);
  assert.equal(de.run('ttNumLocale()'), 'de-DE');
  assert.equal(en.run('ttNumLocale()'), 'en-US');
});

test("the board's num() does the formatting once it exists", () => {
  const seen = [];
  const {run} = load({extra: {num: (n, opts) => { seen.push([n, opts]); return `<${n}>`; }}});
  assert.equal(run('tt("f.x", "{w:$} and {n:,}", {w: 12.4, n: 5})'), '$<12> and <5>');
  assert.deepEqual(seen.map(([n, o]) => [n, o && {...o}]), [[12, undefined], [5, undefined]]);
});

test("in English every spec writes what the board code it replaces wrote", () => {
  const from = BOARD.indexOf('const fmt = n =>');
  const to = BOARD.indexOf('const el = (t,c,h)');
  assert.ok(from > 0 && to > from, 'fmt/compact moved: update tests/i18n_runtime.test.cjs');
  const board = vm.createContext({});
  vm.runInContext(BOARD.slice(from, to).replace(/^const /gm, 'var ').replace(/^let /gm, 'var '), board);
  // tt() in the vm formats through this num(), as it does on the page.
  const {run} = load({extra: {num: board.num}});
  const values = [0, 0.4, -0.4, 2.5, -2.5, 98, 999.5, 1000, 1234.5, -1234.5, 1234.5678, -0.04, 0.1 + 0.2,
    99999, 999999, 1000000, 1125000, 3574000, 9999999, 12345678, -2500, -3574000];
  const fixed = d => ({minimumFractionDigits: d, maximumFractionDigits: d});
  const old = {
    '{x}': v => String(v),
    '{x:,}': v => board.num(v),
    '{x:.1f}': v => v.toFixed(1),
    '{x:,.2f}': v => board.num(v, fixed(2)),
    '{x:$}': v => board.fmt(v),
    '{x:$c}': v => board.compact(v),
  };
  for(const [spec, was] of Object.entries(old))
    for(const v of values)
      assert.equal(run(`tt("f.x", ${JSON.stringify(spec)}, {x: ${v}})`), was(v), `${spec} ${v}`);
});

test("in English every spec writes what Python's msg() writes", () => {
  // Values where Python's repr and JS agree; each side is held to its own old
  // code above and in tests/test_i18n_msg.py.
  const cases = [['{n}', 7], ['{n}', 2.5], ['{n}', -1234.5], ['{n:,}', 1234567], ['{n:,}', 1234.4],
    ['{n:,}', -1234.5], ['{n:,}', 0.25], ['{x:,.0f}', 1234.4], ['{x:,.0f}', -1234.4], ['${x:,.0f}', -1234.4],
    ['{x:.1f}', -0.04], ['{x:.1f}', -3.14159], ['{w:$}', -1234.4], ['{x:.1f}', 3.14159],
    ['{x:.2f}', 1234.5], ['{x:,.1f}', 12345.67], ['{w:$}', 98.4], ['{w:$}', 1234567], ['{w:$}', -50],
    ['{w:$c}', 98], ['{w:$c}', 751400], ['{w:$c}', 3574000], ['{w:$c}', 12345678], ['{w:$c}', 1125000],
    ['{w:$c}', -2500], ['{d:day}', 0], ['{d:day}', 3], ['{d:day}', 6]];
  const py = spawnSync(process.env.PYTHON || 'python', ['-c', `
import json, sys
from ba_dashboard import msg
cases = json.loads(sys.stdin.read())
print(json.dumps([msg("f.x", t, n=v, x=v, w=v, d=v) for t, v in cases]))`],
  {cwd: ROOT, input: JSON.stringify(cases)});
  assert.equal(py.status, 0, py.stderr?.toString());
  const want = JSON.parse(py.stdout.toString());
  const {run} = load();
  cases.forEach(([spec, v], i) =>
    assert.equal(run(`tt("f.x", ${JSON.stringify(spec)}, {n: ${v}, x: ${v}, w: ${v}, d: ${v}})`), want[i], spec));
});

test('weekday names come from the table', () => {
  const {run} = german({'day.1': 'Montag'});
  assert.equal(run('tt("f.x", "Short on {d:day}", {d: 1})'), 'Short on Montag');
  assert.equal(run('tt("f.x", "Short on {d:day}", {d: 2})'), 'Short on Tuesday');
});

test('a game name travels as a token; the template decides where it stands', () => {
  const table = {'f.dry': '{item}: läuft {days:.1f} Tage vor der Lieferung leer'};
  const params = `{item: ${JSON.stringify(COFFEE)}, days: 3.5}`;
  const en = '"{item} runs dry {days:.1f} days before its next delivery"';
  // No board loaded: the token reads as the English it carries.
  assert.equal(german(table).run(`tt("f.dry", ${en}, ${params})`),
    'Coffee: läuft 3,5 Tage vor der Lieferung leer');
  // The board's gnString() writes it in the names language, German or English.
  const board = names => ({gnTable: names, dataEn: () => ({names: {'ba:itemname_coffee': 'Coffee'}}),
    gnString: (s, T, EN) => s.replace(/⟦(ba:[^⟧|\s]+)(?:\|([^⟧]*))?⟧/g,
      (m, key, english) => (T && T[key]) || english || EN[key])});
  assert.equal(german(table, board({'ba:itemname_coffee': 'Kaffee'})).run(`tt("f.dry", ${en}, ${params})`),
    'Kaffee: läuft 3,5 Tage vor der Lieferung leer');
  assert.equal(german(table, board(null)).run(`tt("f.dry", ${en}, ${params})`),
    'Coffee: läuft 3,5 Tage vor der Lieferung leer');
  assert.equal(load({extra: board({'ba:itemname_coffee': 'Kaffee'})}).run(`tt("f.dry", ${en}, ${params})`),
    'Kaffee runs dry 3.5 days before its next delivery');
});

test("Python's messages: nested ones resolve per key, and the English Python wrote is the fallback", () => {
  const wire = JSON.stringify(['f.outer', {item: COFFEE, when: {m: ['f.inner', {days: 3.5}, '3.5 days early']}}]);
  const english = 'Coffee runs dry 3.5 days early';
  assert.equal(load().run(`ttWire(${wire}, ${JSON.stringify(english)})`), english);
  assert.equal(german({'f.outer': '{item}: {when}'}).run(`ttWire(${wire}, ${JSON.stringify(english)})`),
    'Coffee: 3.5 days early');
  assert.equal(german({'f.outer': '{item}: {when}', 'f.inner': '{days:.1f} Tage zu früh'})
    .run(`ttWire(${wire}, ${JSON.stringify(english)})`), 'Coffee: 3,5 Tage zu früh');
  assert.equal(german({'day.0': 'Sonntag'}).run(`ttWire(${wire}, ${JSON.stringify(english)})`), english);
});

test('ttPayload() swaps the fields Python sent as messages, and enOf() gives back the English', () => {
  const payload = () => ({alerts: [
    {group: 'loss', text: 'Lost $1,234 yesterday', i18n: {text: ['f.loss', {w: 1234.4}]}},
    {group: 'staff', text: 'No staff assigned', detail: 'x', i18n: {text: ['f.staff.none', {}]}},
    {group: 'hype', text: 'Plain English'},
  ], hours: [{limit: 'the building', i18n: {limit: ['sp.limit.building', {}]}}]});
  // English: nothing moves, and enOf() is the field itself.
  const en = load();
  en.context.__p = payload();
  en.run('ttPayload(__p)');
  assert.deepEqual(JSON.parse(JSON.stringify(en.context.__p)), payload());
  assert.equal(en.run('enOf(__p.alerts[0], "text")'), 'Lost $1,234 yesterday');
  // German: the rows with a translation change, the rest stay English.
  const de = german({'f.loss': 'Gestern {w:$} Verlust', 'sp.limit.building': 'das Gebäude'});
  de.context.__p = payload();
  de.run('ttPayload(__p)');
  const p = de.context.__p;
  assert.equal(p.alerts[0].text, 'Gestern $1.234 Verlust');
  assert.equal(p.alerts[1].text, 'No staff assigned');
  assert.equal(p.alerts[2].text, 'Plain English');
  assert.equal(p.hours[0].limit, 'das Gebäude');
  assert.equal(de.run('enOf(__p.alerts[0], "text")'), 'Lost $1,234 yesterday');
  assert.equal(de.run('enOf(__p.hours[0], "limit")'), 'the building');
  assert.equal(de.run('enOf(__p.alerts[1], "text")'), 'No staff assigned');
  assert.equal(de.run('enOf(__p.alerts[0], "group")'), 'loss');
  // The English rides along unenumerated: keys and JSON are the row's own.
  assert.deepEqual(Object.keys(p.alerts[0]), ['group', 'text', 'i18n']);
  // A copied row keeps it: idleRows() and the supply rows spread theirs.
  de.context.__copy = {...p.alerts[0], worth: 1};
  assert.equal(de.run('enOf(__copy, "text")'), 'Lost $1,234 yesterday');
  assert.equal(de.run('enOf({...__p.hours[0], ...{extra: 1}}, "limit")'), 'the building');
  assert.equal(JSON.parse(JSON.stringify(p)).alerts[0].text, 'Gestern $1.234 Verlust');
});

test('tApply() fills the markup from the table, and a switch back to English restores it', () => {
  const today = element({'data-tt': 'nav.today'}, 'Today');
  const close = element({'data-tt-title': 'app.close', title: 'Close', 'data-tt-aria-label': 'app.close.aria',
    'aria-label': 'Close the map'});
  const nested = element({'data-tt': 'nav.more'}, 'More', 1);
  const document = fakeDocument([today, close, nested]);
  const {context, run} = load({extra: {document, location: {search: ''}}});
  context.__table = {'nav.today': 'Heute', 'app.close': 'Schließen', 'nav.more': 'Mehr'};
  run('ttSetTable("de", __table)');
  assert.equal(today.textContent, 'Heute');
  assert.equal(close.attrs.title, 'Schließen');
  assert.equal(close.attrs['aria-label'], 'Close the map');
  assert.equal(nested.textContent, 'More', 'an element with element children is left alone');
  assert.equal(document.documentElement.lang, 'de');
  run('ttSetTable("en", null)');
  assert.equal(today.textContent, 'Today');
  assert.equal(close.attrs.title, 'Close');
  assert.equal(document.documentElement.lang, 'en');
});

/* The boot, with a fake fetch and timers. */
function boot(search, {table = {'nav.today': 'Heute'}, hang = false, source = SOURCE} = {}){
  const fetched = [], timers = [];
  const today = element({'data-tt': 'nav.today'}, 'Today');
  const document = fakeDocument([today], 'loading');
  const changes = [];
  const it = load({source, extra: {
    __changes: changes, document, location: {search}, window: {LEDGER_BUILD: 'abc123'},
    setTimeout: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, clearTimeout: () => {},
    fetch: url => { fetched.push(url); return hang ? new Promise(() => {}) :
      Promise.resolve({ok: true, json: async () => table}); },
  }});
  it.run('ttOnChange(lang => __changes.push(lang))');
  return {...it, fetched, timers, document, today, changes};
}
const tick = () => new Promise(r => setImmediate(r));

test('without ?ui the page is English and asks for nothing', async () => {
  for(const search of ['', '?ui=en', '?ui=fr', '?x=1']){
    const b = boot(search);
    await tick();
    assert.deepEqual(b.fetched, [], search);
    assert.equal(b.document.classes.size, 0, search);
    assert.equal(b.document.documentElement.lang, 'en', search);
    assert.equal(b.run('ttLang'), 'en', search);
  }
});

test('?ui=de fetches the table with the build stamp, hides the page until it is in, and fills it', async () => {
  const b = boot('?ui=de');
  assert.deepEqual(b.fetched, ['i18n/de.json?v=abc123']);
  assert.ok(b.document.classes.has('tt-wait'));
  assert.equal(b.timers[0][1], 400);
  await tick(); await tick();
  assert.equal(b.run('ttLang'), 'de');
  assert.equal(b.document.documentElement.lang, 'de');
  // The markup waits for the DOM, and so does the reveal.
  assert.ok(b.document.classes.has('tt-wait'));
  b.document.fire('DOMContentLoaded');
  assert.equal(b.today.textContent, 'Heute');
  assert.ok(!b.document.classes.has('tt-wait'));
  assert.deepEqual(b.changes, ['de']);
});

test('an empty table is English, numbers included', async () => {
  const b = boot('?ui=de', {table: {}});
  await tick(); await tick();
  b.document.fire('DOMContentLoaded');
  assert.equal(b.run('ttLang'), 'en');
  assert.equal(b.run('ttNumLocale()'), 'en-US');
  assert.equal(b.document.documentElement.lang, 'en');
  assert.equal(b.run('tt("f.x", "{w:$}", {w: 1234})'), '$1,234');
  assert.ok(!b.document.classes.has('tt-wait'));
});

test('a table that does not come shows the page after 400 ms, in English', async () => {
  const b = boot('?ui=de', {hang: true});
  assert.ok(b.document.classes.has('tt-wait'));
  b.timers[0][0]();
  assert.ok(!b.document.classes.has('tt-wait'));
  assert.equal(b.run('ttLang'), 'en');
});

test('a page built with --lang carries its table and needs no fetch', async () => {
  const source = SOURCE.replace('/*__UI_TABLE__*/null', JSON.stringify({lang: 'de', table: {'nav.today': 'Heute'}}));
  assert.notEqual(source, SOURCE, 'the placeholder render() fills moved');
  const b = boot('', {source});
  assert.deepEqual(b.fetched, []);
  assert.equal(b.run('ttLang'), 'de');
  assert.equal(b.run('tt("nav.today", "Today")'), 'Heute');
  assert.equal(b.document.classes.size, 0);
  // ?ui=en still shows the English.
  const en = boot('?ui=en', {source});
  assert.equal(en.run('ttLang'), 'en');
});

test('a language switch tells the board, which redraws', async () => {
  const b = boot('');
  const seen = [];
  b.context.__seen = seen;
  b.run('ttOnChange(lang => __seen.push(lang))');
  b.context.__t = {'nav.today': 'Heute'};
  b.run('ttSetTable("de", __t)');
  b.run('ttSetTable("en", null)');
  assert.deepEqual(seen, ['de', 'en']);
  // The board registers its listener with a guard, so a page without i18n.js
  // still runs: numbers follow the language, then the board redraws.
  assert.match(BOARD, /if\(typeof ttOnChange === "function"\) ttOnChange\(\(\) => \{ NUM_LOCALE = ttNumLocale\(\); gnRedraw\(\); \}\);/);
});
