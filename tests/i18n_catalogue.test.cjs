// The catalogue of Big Copilot's own text (tools/i18n.py) and the German
// under i18n/. What fails here fails for everybody, so only what is broken
// fails: a key with two English defaults, a call site the catalogue cannot
// read (a key or English that is not a literal, or holds ${}), a translation
// whose placeholders or plural forms do not match the English it was made
// from, broken JSON, and a web/i18n/ table out of step with i18n/. A missing,
// stale or orphaned translation does not fail: the page falls back to English
// per key, and `python tools/i18n.py status --strict` gates translation work.
// docs/architecture.md, "UI text".
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PY = process.env.PYTHON || 'python';
const FIELD = /\{(\w+)(?::([^{}]+))?\}/g;
const SUFFIX = /_(zero|one|two|few|many|other)$/;

function python(code, input){
  const out = spawnSync(PY, ['-c', code], {cwd: ROOT, input, maxBuffer: 16 * 1024 * 1024,
    env: {...process.env, PYTHONIOENCODING: 'utf-8'}});
  return {status: out.status, stdout: out.stdout.toString('utf8'), stderr: out.stderr.toString('utf8')};
}
/* tools/i18n.py's reading of a snippet: its calls, or the error it raises. */
function read(kind, source){
  const out = python(`
import json, sys
from tools import i18n
src = sys.stdin.read()
try:
    found = i18n.${kind}(src, "snippet")
    i18n.catalogue(found)
    print(json.dumps({"ok": [[c["key"], c["en"]] for c in found]}))
except i18n.CatalogueError as exc:
    print(json.dumps({"error": str(exc)}))`, source);
  assert.equal(out.status, 0, out.stderr);
  return JSON.parse(out.stdout);
}
const fields = s => new Set([...String(s).matchAll(FIELD)].map(m => `${m[1]}:${m[2] || ''}`));
const same = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
const within = (a, b) => [...a].every(x => b.has(x));

let english;
test('the English catalogue builds: every call site is a literal and every key has one English', () => {
  const out = spawnSync(PY, [path.join('tools', 'i18n.py'), 'extract'], {cwd: ROOT, maxBuffer: 16 * 1024 * 1024});
  assert.equal(out.status, 0, out.stderr.toString());
  english = JSON.parse(out.stdout.toString('utf8'));
  assert.equal(english['f.loss'], 'Lost {w:$} yesterday');
  assert.equal(english['f.staff.none'], 'No staff assigned');
  assert.equal(english['day.0'], 'Sunday');
  for(const key of Object.keys(english))
    assert.match(key.replace(SUFFIX, ''), /^[a-z]+(\.[A-Za-z0-9_-]+)+$/, key);
});

test('scripts: literal calls are read, and comments, strings and regexes are not calls', () => {
  const got = read('js_calls', [
    'const a = tt("nav.today", "Today");',
    "const b = tt('sp.tile.size', `Size`, {n: 3});",
    'const c = tt("f.m", {one: "{n} machine", other: "{n} machines"}, {n});',
    '// tt("nav.comment", "In a comment")',
    '/* tt("nav.block", "In a block") */',
    'const d = "tt(\\"nav.string\\", \\"In a string\\")";',
    'const e = /tt\\("nav.regex", "x"\\)/.test(s) ? 1 : 2 / 3;',
    'const f = `${tt("nav.nested", "In a template")} and ${x}`;',
    'obj.tt("nav.member", "A method");',
    'function tt(key, en){ return en; }',
  ].join('\n'));
  assert.deepEqual(got.ok, [['nav.today', 'Today'], ['sp.tile.size', 'Size'],
    ['f.m', {one: '{n} machine', other: '{n} machines'}], ['nav.nested', 'In a template']]);
});

test('scripts: a key or English the catalogue cannot read fails', () => {
  for(const src of ['tt(key, "Today")', 'tt("nav.x", english)', 'tt("nav.x", `Hi ${name}`)',
    'tt(`nav.${page}`, "Page")', 'tt("nav.x", "a" + b)', 'tt("nav.x", {one: word, other: "x"})']){
    assert.match(read('js_calls', src).error || '', /literal|English|plain object/, src);
  }
});

test('one key with two English defaults fails, and so does a malformed key or spec', () => {
  assert.match(read('js_calls', 'tt("nav.x", "Today"); tt("nav.x", "Now");').error, /two English defaults/);
  assert.deepEqual(read('js_calls', 'tt("nav.x", "Today"); tt("nav.x", "Today");').ok.length, 2);
  assert.match(read('js_calls', 'tt("today", "Today")').error, /area/);
  assert.match(read('js_calls', 'tt("zz.today", "Today")').error, /area/);
  assert.match(read('js_calls', 'tt("nav.x_one", "Today")').error, /plural suffix/);
  assert.match(read('js_calls', 'tt("nav.x", "{n:%}")').error, /spec/);
  assert.match(read('js_calls', 'tt("nav.x", {one: "a"})').error, /one and other/);
  assert.match(read('js_calls', 'tt("nav.x", {other: "a"})').error, /one and other/);
  // A plain string's "$" before a placeholder is a literal dollar, not ${}.
  assert.deepEqual(read('js_calls', 'tt("nav.x", "${w:,.0f}/day")').ok, [['nav.x', '${w:,.0f}/day']]);
});

test('markup: data-tt around English, data-tt-* beside the attribute, and nothing with children', () => {
  const got = read('markup_calls', [
    '<nav><a href="#today"><span data-tt="nav.today">Today</span></a>',
    '<button data-tt-title="nav.close" title="Close" data-tt-aria-label="nav.close.aria" aria-label="Close it">x</button>',
    '<input data-tt-placeholder="nav.find" placeholder="Search">',
    '<span class="why" data-tt-tip="nav.why" data-tip="Why this">?</span>',
    '<script>const z = tt("nav.script", "In a script");</script></nav>',
  ].join('\n'));
  assert.deepEqual(got.ok, [['nav.today', 'Today'], ['nav.close', 'Close'], ['nav.close.aria', 'Close it'],
    ['nav.find', 'Search'], ['nav.why', 'Why this'], ['nav.script', 'In a script']]);
  assert.match(read('markup_calls', '<p data-tt="nav.x">Hi <b>there</b></p>').error, /innermost/);
});

test('Python: msg() calls are read by ast, and a param the English names must be given', () => {
  const out = python(`
import json, os, sys, tempfile
from tools import i18n
def calls(src):
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, dir=i18n.ROOT) as fh:
        fh.write(src)
    try:
        return [[c["key"], c["en"]] for c in i18n.python_calls(fh.name)]
    except i18n.CatalogueError as exc:
        return str(exc)
    finally:
        os.remove(fh.name)
print(json.dumps([
    calls('x = msg("f.a", "Lost {w:$}", w=1)\\ny = msg("f.b", {"one": "{n} x", "other": "{n} xs"}, n=2)'),
    calls('x = msg(key, "Lost")'),
    calls('x = msg("f.a", "Lost {w:$}")'),
    calls('x = msg("f.a", f"Lost {w}")'),
]))`);
  assert.equal(out.status, 0, out.stderr);
  const [ok, key, param, fstring] = JSON.parse(out.stdout);
  assert.deepEqual(ok, [['f.a', 'Lost {w:$}'], ['f.b', {one: '{n} x', other: '{n} xs'}]]);
  assert.match(key, /literal key/);
  assert.match(param, /no param for w/);
  assert.match(fstring, /literal English/);
});

/* The translations: flat JSON of strings, and every key that is translated
   carries the placeholders and plural forms of the English it came from. */
const LANGS = fs.readdirSync(path.join(ROOT, 'i18n')).filter(n => n.endsWith('.json') && !n.endsWith('.base.json'))
  .map(n => n.slice(0, -5));

test('i18n/ holds German, as flat JSON of strings beside its base', () => {
  assert.ok(LANGS.includes('de'));
  for(const lang of LANGS){
    for(const name of [`${lang}.json`, `${lang}.base.json`]){
      const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', name), 'utf8'));
      assert.equal(typeof data, 'object', name);
      assert.ok(!Array.isArray(data), name);
      for(const [k, v] of Object.entries(data)) assert.equal(typeof v, 'string', `${name} ${k}`);
    }
  }
});

/* The rule the check applies, over a translation and its base. */
function mismatches(lang, table, base){
  const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  const bad = [];
  const groups = new Map();
  for(const k of Object.keys(table)){
    const m = SUFFIX.exec(k);
    if(m){
      if(!cats.includes(m[1])) bad.push(`${k}: ${lang} has no plural form "${m[1]}"`);
      const g = k.replace(SUFFIX, '');
      groups.set(g, (groups.get(g) || new Set()).add(m[1]));
    }
  }
  for(const [g, got] of groups)
    if(!cats.every(c => got.has(c))) bad.push(`${g}: ${lang} needs the forms ${cats.join(', ')}`);
  for(const [k, v] of Object.entries(table)){
    const m = SUFFIX.exec(k);
    if(!m){
      if(k in base && !same(fields(v), fields(base[k]))) bad.push(`${k}: placeholders differ from the English`);
      continue;
    }
    const g = k.replace(SUFFIX, '');
    const forms = Object.keys(base).filter(b => b.replace(SUFFIX, '') === g && SUFFIX.test(b));
    if(!forms.length) continue;
    const all = new Set(forms.flatMap(b => [...fields(base[b])]));
    if(m[1] === 'other' ? !same(fields(v), all) : !within(fields(v), all))
      bad.push(`${k}: placeholders differ from the English`);
  }
  return bad;
}

test('every translated key records the English it was made from', () => {
  for(const lang of LANGS){
    const table = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', `${lang}.json`), 'utf8'));
    const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', `${lang}.base.json`), 'utf8'));
    assert.deepEqual(Object.keys(table).filter(k => !(k in base)), [],
      `${lang}: run python tools/i18n.py accept ${lang} <key> after translating`);
  }
});

test('every translation carries the placeholders and plural forms of the English it was made from', () => {
  for(const lang of LANGS){
    const table = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', `${lang}.json`), 'utf8'));
    const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', `${lang}.base.json`), 'utf8'));
    assert.deepEqual(mismatches(lang, table, base), [], lang);
  }
});

test('the check itself catches a wrong placeholder, a missing plural form and a form German lacks', () => {
  const base = {'f.a': 'Lost {w:$}', 'f.m_one': '{n} machine', 'f.m_other': '{n} machines'};
  assert.deepEqual(mismatches('de', {'f.a': 'Verlust {w:$}', 'f.m_one': 'ein Automat', 'f.m_other': '{n} Automaten'}, base), []);
  assert.equal(mismatches('de', {'f.a': 'Verlust {x:$}'}, base).length, 1);
  assert.equal(mismatches('de', {'f.a': 'Verlust {w}'}, base).length, 1);
  assert.equal(mismatches('de', {'f.m_other': '{n} Automaten'}, base).length, 1);
  assert.equal(mismatches('de', {'f.m_one': 'x', 'f.m_other': '{n} y', 'f.m_few': 'z'}, base).length, 1);
  assert.equal(mismatches('de', {'f.m_one': '{n} {k}', 'f.m_other': '{n} y'}, base).length, 1);
});

test('web/i18n/ is what the build ships from i18n/', () => {
  const out = spawnSync(PY, [path.join('tools', 'i18n.py'), 'ship', '--check'], {cwd: ROOT});
  assert.equal(out.status, 0, out.stdout.toString() + out.stderr.toString());
  for(const lang of LANGS) assert.ok(fs.existsSync(path.join(ROOT, 'web', 'i18n', `${lang}.json`)), lang);
});

test('the build drops orphans, mismatches and stale keys, and status lists each', () => {
  const out = python(`
import json
from tools import i18n
english = {"f.a": "Lost {w:$} yesterday", "f.b": "No staff", "f.c": "Fresh", "f.d": "Unrecorded",
           "f.m_one": "{n} machine", "f.m_other": "{n} machines"}
table = {"f.a": "Verlust: {w:$}", "f.b": "Niemand {x}", "f.c": "Frisch", "f.d": "Ohne Basis", "f.gone": "Weg",
         "f.m_one": "ein Automat", "f.m_other": "{n} Automaten", "f.m_few": "{n} Automaty"}
base = {"f.a": "Lost {w:$} the day before", "f.b": "No staff", "f.c": "Fresh", "f.gone": "Gone",
        "f.m_one": "{n} machine", "f.m_other": "{n} machines", "f.m_few": "{n} machines"}
i18n.load = lambda lang, root=i18n.ROOT: (table, base)
print(json.dumps([i18n.shipped("de", english), i18n.status("de", english)]))`);
  assert.equal(out.status, 0, out.stderr);
  const [shipped, status] = JSON.parse(out.stdout);
  // f.a's English changed and f.d has none recorded: both show English until redone.
  assert.deepEqual(shipped, {'f.c': 'Frisch', 'f.m_one': 'ein Automat', 'f.m_other': '{n} Automaten'});
  assert.deepEqual(status.orphan, ['f.gone']);
  assert.deepEqual(status.mismatch.sort(), ['f.b', 'f.m_few']);
  assert.deepEqual(status.stale.filter(k => !status.mismatch.includes(k)).sort(), ['f.a', 'f.d']);
  assert.deepEqual(status.missing, []);
});

test("the game's words are never written into a git work tree, this one or another", () => {
  const out = python(`
import json, os, tempfile
from tools import i18n
res = []
with tempfile.TemporaryDirectory() as tmp:
    other = os.path.join(tmp, "other-checkout")
    os.makedirs(os.path.join(other, ".git", "x"))
    worktree = os.path.join(tmp, "a-worktree")
    os.makedirs(os.path.join(worktree, "deep"))
    open(os.path.join(worktree, ".git"), "w").write("gitdir: elsewhere")
    for path in (os.path.join(i18n.ROOT, "glossary.json"), os.path.join(other, "sub", "g.json"),
                 os.path.join(worktree, "deep", "g.json"), os.path.join(tmp, "free", "g.json")):
        try:
            i18n._outside_repo(path)
            res.append("ok")
        except SystemExit:
            res.append("refused")
    # A checkout copied without its .git (unpacked from a zip) is still refused.
    copy = os.path.join(tmp, "zip-copy")
    os.makedirs(os.path.join(copy, "tools"))
    i18n.ROOT = copy
    try:
        i18n._outside_repo(os.path.join(copy, "tools", "g.json"))
        res.append("ok")
    except SystemExit:
        res.append("refused")
print(json.dumps(res))`);
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(JSON.parse(out.stdout), ['refused', 'refused', 'refused', 'ok', 'refused']);
});
