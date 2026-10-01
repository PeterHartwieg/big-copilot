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
//                        params matches anything (lazily), a plural key with
//                        no n matches either form, the English's tags are
//                        optional (so one RegExp reads a data-tip and
//                        innerText), and {flags, anchor: 'start' | 'full',
//                        text} in the third argument.
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
/* {key: English} with a plural as key_one / key_other, read once. */
function catalogue(){
  if (table) return table;
  const out = spawnSync(PY, [path.join('tools', 'i18n.py'), 'extract'], {cwd: ROOT, maxBuffer: 16 * 1024 * 1024});
  if (out.status !== 0) throw new Error(`tools/i18n.py extract failed: ${out.stderr}`);
  table = JSON.parse(out.stdout.toString('utf8'));
  return table;
}

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
   param is not given is left as {name}. */
function en(key, params = {}){
  return i18n().ttText(key, english(key), params);
}

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PLACEHOLDER = /\{(\w+)(?::([^{}]+))?\}/g;

/* A RegExp for en(key, params), any unfilled placeholder a lazy wildcard.
   A plural key with no params.n matches any of its forms. The English's
   markup (<b>…</b>) is optional; with text it is dropped. */
function enRe(key, params = {}, {flags = '', anchor = null, text = false} = {}){
  const base = english(key);
  const templates = typeof base === 'object'
    ? (Object.prototype.hasOwnProperty.call(params, 'n') ? [ttEnglishOf(base, params)] : [base.one, base.other])
    : [base];
  // A tag in the English (<b>, <span class="w">) is optional in the match, so
  // the same RegExp reads markup (data-tip, innerHTML) and innerText; with
  // text it is dropped. Only the template's own tags: a param's text, markup
  // or not, is matched as it is.
  const forms = [...new Set(templates.map(t => i18n().ttText(key,
    text ? t.replace(/<[^>]*>/g, '') : t.replace(/<[^>]*>/g, tag => `\u0001${tag}\u0002`), params)))];
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

module.exports = {catalogue, english, en, enText, enRe, textRe, wire, assertMsg, msgParam, findMsg};
