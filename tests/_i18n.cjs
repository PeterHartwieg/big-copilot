// Assert on which message, not on its English (issue #173). A test that is
// about which sentence the board shows, with which values, names the
// catalogue key and its params; the English comes from the catalogue
// (`python tools/i18n.py extract`), so rewording a sentence breaks no test.
//
//   en(key, params)      the English the page writes for the key: plural form
//                        by params.n, placeholders filled by web/i18n.js's own
//                        ttText(), so specs ({n:,}, {w:$}, {d:day}) read as on
//                        the page. For a Playwright locator or a text match.
//   enRe(key, params)    a RegExp for that English; a placeholder not in
//                        params matches anything (lazily), a param given as a
//                        RegExp matches that pattern (enRe(k, {n: /\d+/})), a
//                        plural key with no n matches either form, and the
//                        English's tags are optional (so one RegExp reads a
//                        data-tip and innerText). A string param that itself
//                        holds a {placeholder} (an unfilled en() passed as a
//                        param) leaves a wildcard there too. Options, the
//                        third argument: flags; anchor 'start' | 'full'; text
//                        (drop the tags); cap (the first letter upper case, as
//                        a sentence that opens with the message writes it).
//   enBetween(key, a, b, params)
//                        the fixed English between placeholders {a} and {b},
//                        for a broad check ("is the limit" in any sentence);
//                        escapeRe(s) makes it safe inside new RegExp().
//   textRe(key, params), enText(key, params)
//                        enRe() and en() with the English's markup (<b>)
//                        dropped, for innerText.
//   wire(row, field)     [key, params] Python sent beside a Msg field
//                        (row.i18n[field], _wire_msgs() in ba_dashboard.py).
//   assertMsg(row, field, key, params)
//                        that field is the key, and each given param equals
//                        (deepEqual) what was sent. A nested message param is
//                        compared as {m: [key, params, english]}; pass
//                        msgParam(key) to check only its key.
//   findMsg(w, key)      the first [key, params] at or inside w (a wire, a
//                        row's i18n entry, or a params object), or null.
//
// Not a test file itself: the leading underscore keeps it out of the
// tests/*.test.cjs glob.
'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const PY = process.env.PYTHON || 'python';

let table = null;
/* The files the catalogue is read from (calls() in tools/i18n.py), as
   path:size:mtime: the extract is kept on disk under this signature, so the
   test files of one run read it once instead of once each. */
function sources(){
  const files = ['tools/i18n.py', 'ba_dashboard.py', 'build_web.py', 'tools/wiki_sample.json'];
  for (const dir of ['template', 'web']) {
    for (const name of fs.readdirSync(path.join(ROOT, dir))) {
      if (dir === 'template' || name.endsWith('.js')) files.push(`${dir}/${name}`);
    }
  }
  return files.sort().map(f => {
    try { const st = fs.statSync(path.join(ROOT, f)); return `${f}:${st.size}:${st.mtimeMs}`; } catch (e) { return `${f}:-`; }
  }).join('|');
}
/* {key: English} with a plural as key_one / key_other, read once. */
function catalogue(){
  if (table) return table;
  const cache = path.join(require('node:os').tmpdir(),
    `big-copilot-i18n-${require('node:crypto').createHash('sha1').update(ROOT).digest('hex').slice(0, 12)}.json`);
  let sig = null;
  try {
    sig = sources();
    const kept = JSON.parse(fs.readFileSync(cache, 'utf8'));
    if (kept.sig === sig) return (table = kept.table);
  } catch (e) {}
  const out = spawnSync(PY, [path.join('tools', 'i18n.py'), 'extract'], {cwd: ROOT, maxBuffer: 16 * 1024 * 1024});
  if (out.status !== 0) {
    throw new Error(`tools/i18n.py extract failed (${out.error ? out.error.message : `exit ${out.status}`}): ${out.stderr}`);
  }
  table = JSON.parse(out.stdout.toString('utf8'));
  try {
    // Written aside and renamed, so a test file starting at the same moment
    // never reads half a cache.
    if (sig) { const part = `${cache}.${process.pid}`; fs.writeFileSync(part, JSON.stringify({sig, table})); fs.renameSync(part, cache); }
  } catch (e) {}
  return table;
}

/* A table in place of the extract, for tests/i18n_helpers.test.cjs. */
function useCatalogue(t){ table = t; }

/* The English default of a key, a string or {one, other}. */
function english(key){
  const t = catalogue();
  if (typeof t[key] === 'string') return t[key];
  if (typeof t[`${key}_other`] === 'string') return {one: t[`${key}_one`], other: t[`${key}_other`]};
  throw new Error(`no catalogue key ${JSON.stringify(key)}`);
}

/* The one form of a plural English the page writes for params.n. */
const ttEnglishOf = (base, params) => i18n().ttEnglish(base, params);

let runtime = null;
/* web/i18n.js in a VM with no table loaded: ttText() is then the English. */
function i18n(){
  if (runtime) return runtime;
  const ctx = {Intl, console, document: undefined, window: undefined, localStorage: undefined};
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(ROOT, 'web', 'i18n.js'), 'utf8');
  vm.runInContext(src + '\n;globalThis.__tt = {ttText, ttEnglish};', ctx);
  runtime = ctx.__tt;
  return runtime;
}

/* The English the page writes for key with params. A placeholder whose
   param is not given is left as {name}. With cap, the first letter upper
   case, as a sentence that opens with the message writes it. */
function en(key, params = {}, {cap = false} = {}){
  const s = i18n().ttText(key, english(key), params);
  return cap ? s.replace(/^./, c => c.toUpperCase()) : s;
}

/* The English between two placeholders of a key, {a} and {b} (null for the
   start or the end): the fixed words a broad check can look for, such as
   " is the limit; the fix is " in sp.cap.ceiling. Plural keys take params.n. */
function enBetween(key, a, b, params = {}){
  const base = english(key);
  const t = typeof base === 'object' ? ttEnglishOf(base, params) : base;
  const from = a === null ? 0 : t.indexOf(`{${a}}`) + `{${a}}`.length;
  const to = b === null ? t.length : t.indexOf(`{${b}}`, from);
  if ((a !== null && from < `{${a}}`.length) || to < 0) throw new Error(`${key} has no {${a}} … {${b}}`);
  return t.slice(from, to).replace(/\{[^{}]*\}/g, '');
}

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PLACEHOLDER = /\{(\w+)(?::([^{}]+))?\}/g;

/* A RegExp for en(key, params), any unfilled placeholder a lazy wildcard.
   A plural key with no params.n matches any of its forms. The English's
   markup (<b>…</b>) is optional; with text it is dropped. */
function enRe(key, params = {}, {flags = '', anchor = null, text = false, cap = false} = {}){
  const base = english(key);
  // A plural form is chosen by a number n only: an n given as a RegExp (or
  // not at all) matches either form.
  const counted = typeof params.n === 'number';
  // A RegExp param goes in as a marker the escaping leaves alone.
  const patterns = [];
  params = Object.fromEntries(Object.entries(params).map(([k, v]) =>
    v instanceof RegExp ? [k, `\u0003${patterns.push(v.source) - 1}\u0003`] : [k, v]));
  const templates = typeof base === 'object'
    ? (counted ? [ttEnglishOf(base, params)] : [base.one, base.other])
    : [base];
  // A tag in the English (<b>, <span class="w">) is optional in the match, so
  // the same RegExp reads markup (data-tip, innerHTML) and innerText; with
  // text it is dropped. Only the template's own tags: a param's text, markup
  // or not, is matched as it is.
  let forms = templates.map(t => i18n().ttText(key,
    text ? t.replace(/<[^>]*>/g, '') : t.replace(/<[^>]*>/g, tag => `\u0001${tag}\u0002`), params));
  if (cap) forms = forms.map(f => f.replace(/^((?:\u0001[^\u0002]*\u0002)*)(.)/, (m, tags, c) => tags + c.toUpperCase()));
  forms = [...new Set(forms)];
  const plain = s => {
    let src = '', last = 0;
    for (const m of s.matchAll(PLACEHOLDER)) {
      src += escape(s.slice(last, m.index)) + '.+?';
      last = m.index + m[0].length;
    }
    return src + escape(s.slice(last));
  };
  const one = s => s.split(/\u0001([^\u0002]*)\u0002/).map((part, i) => i % 2 ? `(?:${escape(part)})?` : plain(part)).join('');
  let src = forms.length > 1 ? `(?:${forms.map(one).join('|')})` : one(forms[0]);
  src = src.replace(/\u0003(\d+)\u0003/g, (m, i) => `(?:${patterns[Number(i)]})`);
  if (anchor === 'start' || anchor === 'full') src = '^' + src;
  if (anchor === 'full') src += '$';
  return new RegExp(src, flags);
}

/* enRe() and en() for rendered text: the English's markup dropped, as
   innerText reads it. */
const textRe = (key, params = {}, options = {}) => enRe(key, params, {...options, text: true});
const enText = (key, params = {}) => en(key, params).replace(/<[^>]*>/g, '');

/* [key, params] Python sent for a row's Msg field. */
function wire(row, field){
  const w = row && row.i18n && row.i18n[field];
  assert.ok(Array.isArray(w), `${field} carries no i18n wire: ${JSON.stringify(row && row[field])}`);
  return w;
}

const ANY = Symbol('any message param');
/* A params value that only checks a nested message's key. */
const msgParam = key => ({[ANY]: key});

function checkParams(got, want, where){
  for (const [name, value] of Object.entries(want)) {
    assert.ok(got && Object.prototype.hasOwnProperty.call(got, name), `${where}: no param ${name} in ${JSON.stringify(got)}`);
    if (value && typeof value === 'object' && value[ANY]) {
      const m = got[name] && got[name].m;
      assert.ok(Array.isArray(m), `${where}: param ${name} is not a message: ${JSON.stringify(got[name])}`);
      assert.equal(m[0], value[ANY], `${where}: param ${name}`);
    } else {
      assert.deepEqual(got[name], value, `${where}: param ${name}`);
    }
  }
}

/* The row's field is the message key, with (at least) these params. */
function assertMsg(row, field, key, params = {}){
  const [k, p] = wire(row, field);
  assert.equal(k, key, `${field}: ${JSON.stringify(row[field])}`);
  checkParams(p, params, `${field} ${key}`);
  return p;
}

/* The first [key, params] with this key at or inside w, or null. */
function findMsg(w, key){
  if (!w || typeof w !== 'object') return null;
  if (Array.isArray(w) && typeof w[0] === 'string' && w.length >= 1 && (w[1] === undefined || typeof w[1] === 'object')) {
    if (w[0] === key) return w;
    return findMsg(w[1], key);
  }
  if (Array.isArray(w)) {
    for (const x of w) { const f = findMsg(x, key); if (f) return f; }
    return null;
  }
  if (Array.isArray(w.m)) return findMsg(w.m, key);
  for (const v of Object.values(w)) { const f = findMsg(v, key); if (f) return f; }
  return null;
}

module.exports = {catalogue, useCatalogue, english, en, enBetween, enText, enRe, textRe, escapeRe: escape, wire, assertMsg, msgParam, findMsg};
