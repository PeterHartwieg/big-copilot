/* Big Copilot's own words in the reader's language (docs/architecture.md, "UI text").

   The English stays at the call site, beside a key: tt("sp.tile.size", "Size")
   in a script, data-tt="nav.today" around English in markup, and msg(...) in
   Python. With no table loaded every call returns its English, so an English
   page is exactly what it was. A table (web/i18n/<lang>.json, built from
   i18n/<lang>.json by `python build_web.py`) is flat: "key": "text", plurals
   as key_one / key_other (the language's CLDR categories).

   This file is spliced into the end of the page's head by render(), after the
   stylesheets and ahead of every other script but the theme's, so app.js, update.js, community.js, the board script, map.js
   and wiki.js can all call tt(). Its top-level names share the page's one
   global scope: every one starts tt, TT_, or is one of tt(), tApply(),
   enOf() and setUiLocale(). */

/* A local page built with `--lang de` carries its table: {lang, table}. */
const TT_EMBED = /*__UI_TABLE__*/null;
/* The languages Big Copilot's own text comes in, English first. */
const TT_LANGS = ["en", "de"];
/* Numbers follow the UI language: English is always en-US. */
const TT_NUM_LOCALES = {en: "en-US", de: "de-DE"};
/* A placeholder: {name} or {name:spec}; single braces, as SUMMARIES writes them. */
const TT_SPEC = /\{(\w+)(?::([^{}]+))?\}/g;
/* A game name inside a sentence (tok() in Python), for a page without the
   board script's gnString(). */
const TT_TOKEN = /⟦(ba:[^⟧|\s]+)(?:\|([^⟧]*))?⟧/g;
/* The English a localised payload row showed, per field; enOf() reads it. A
   symbol key, enumerable, so a row copied with {...row} (idleRows(), the
   supply rows) keeps it, while JSON and Object.keys() never see it. */
const TT_EN = Symbol("english text");
/* Markup attributes tApply() fills, and the attribute each one names. */
const TT_ATTRS = [["data-tt-title", "title"], ["data-tt-aria-label", "aria-label"],
  ["data-tt-placeholder", "placeholder"], ["data-tt-tip", "data-tip"]];
const TT_SELECTOR = "[data-tt]," + TT_ATTRS.map(([a]) => `[${a}]`).join(",");
/* The longest the landing stays hidden while a table loads. */
const TT_WAIT_MS = 400;

let ttLang = "en", ttTable = null, ttSeq = 0;
const ttListeners = [];
const ttRules = new Map();
const ttOrig = typeof WeakMap === "function" ? new WeakMap() : new Map();

const ttOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const ttKnown = lang => TT_LANGS.includes(lang);
/* The number locale of the UI language on screen. */
const ttNumLocale = () => TT_NUM_LOCALES[ttLang] || "en-US";
/* Which plural form a count takes in a language. A tag Intl does not know
   reads as English. */
function ttCategory(lang, n){
  if(!ttRules.has(lang)){
    let r;
    try{ r = new Intl.PluralRules(lang); }catch(e){ r = new Intl.PluralRules("en"); }
    ttRules.set(lang, r);
  }
  return ttRules.get(lang).select(Number.isFinite(n) ? n : 0);
}
/* A number in the UI's locale: the board's num() once it exists (it follows
   NUM_LOCALE), and the same Intl call before it does. */
function ttNum(v, opts){
  try{ if(typeof num === "function") return num(v, opts); }catch(e){}
  return new Intl.NumberFormat(ttNumLocale(), opts).format(Number(v));
}
/* A weekday index, 0 Sunday as the game counts it, as its name. */
function ttDay(d){
  switch(((Math.trunc(Number(d)) % 7) + 7) % 7){
    case 0: return tt("day.0", "Sunday");
    case 1: return tt("day.1", "Monday");
    case 2: return tt("day.2", "Tuesday");
    case 3: return tt("day.3", "Wednesday");
    case 4: return tt("day.4", "Thursday");
    case 5: return tt("day.5", "Friday");
    default: return tt("day.6", "Saturday");
  }
}
/* One placeholder's value, by its spec. The same specs as Python's msg(),
   each writing in English exactly what the code it replaces wrote
   (docs/architecture.md, "UI text"): {n} as is (String()), {n:,} as num()
   (grouped, up to three decimals), {x:.1f} and {x:,.0f} fixed decimals, ungrouped
   or grouped, {w:$} money as fmt() ("-$1,234"), {w:$c} compact money as
   compact(), {d:day} a weekday. A param {m: [key, params, english]} is a
   nested message. */
function ttFormat(v, spec){
  if(v && typeof v === "object" && Array.isArray(v.m)) return ttWire(v.m);
  if(spec === "day") return ttDay(v);
  if(typeof v !== "number") return String(v ?? "");
  if(!spec) return ttLang === "en" ? String(v) : ttNum(v, {useGrouping: false, maximumFractionDigits: 3});
  if(spec === ",") return ttNum(v);
  if(spec === "$") return (v < 0 ? "-" : "") + "$" + ttNum(Math.abs(Math.round(v)));
  if(spec === "$c"){
    const a = Math.abs(v), s = v < 0 ? "-" : "";
    if(a >= 1e6){
      const d = a >= 1e7 ? 1 : 2;
      return s + "$" + ttNum(a / 1e6, {minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false}) + "M";
    }
    if(a >= 1e3) return s + "$" + ttNum(Math.round(a / 1e3), {useGrouping: false}) + "k";
    return s + "$" + ttNum(Math.round(a), {useGrouping: false});
  }
  const fixed = /^(,)?\.(\d)f$/.exec(spec);
  if(fixed){
    const d = Number(fixed[2]);
    return ttNum(v, {minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: !!fixed[1]});
  }
  return String(v);
}
/* The names of the placeholders a template uses. */
const ttNamesIn = s => [...String(s).matchAll(TT_SPEC)].map(m => m[1]);
/* A translation is only used when every placeholder it names is given. */
const ttFits = (s, p) => ttNamesIn(s).every(name => ttOwn(p, name));
const ttFill = (s, p) => String(s).replace(TT_SPEC, (m, name, spec) => ttOwn(p, name) ? ttFormat(p[name], spec) : m);
/* The table's text for a key, its plural form chosen by the param n, or null. */
function ttLookup(key, p){
  const T = ttTable;
  if(!T) return null;
  if(typeof T[key] === "string") return T[key];
  const cat = ttCategory(ttLang, Number(p.n));
  const s = ttOwn(T, `${key}_${cat}`) ? T[`${key}_${cat}`] : T[`${key}_other`];
  return typeof s === "string" ? s : null;
}
/* The English default: a string, or {one, other} chosen by n. */
function ttEnglish(en, p){
  if(en && typeof en === "object"){
    const cat = ttCategory("en", Number(p.n));
    return String(ttOwn(en, cat) ? en[cat] : en.other ?? "");
  }
  return String(en ?? "");
}
/* Game names inside the text, in the language the names are shown in: the
   board's gnString() where it is loaded, their English otherwise. */
function ttNames(s){
  if(s.indexOf("⟦") < 0) return s;
  try{
    if(typeof gnString === "function")
      return gnString(s, gnTable, ((typeof dataEn === "function" && dataEn()) || {}).names || {});
  }catch(e){}
  return s.replace(TT_TOKEN, (m, key, english) => english || key);
}
/* The one call for text on the page: the key's text in the UI language, else
   the English given here, with its placeholders filled. Returns text; callers
   escape it as they escape any other text. The key and the English are
   literals, so tools/i18n.py can read them off the call. */
function tt(key, en, params){ return ttText(key, en, params); }
/* The same, for a key and English held in variables: only tApply(), whose
   keys the catalogue reads off the markup. */
function ttText(key, en, params){
  const p = params || {};
  let s = ttLookup(key, p);
  if(s === null || !ttFits(s, p)) s = ttEnglish(en, p);
  return ttNames(ttFill(s, p));
}
/* A message Python sent as [key, params, english?] (the `i18n` field of a
   payload row, or a nested {m: [...]}). Python already wrote the English, so
   with no translation for the key that English is the answer, as sent. */
function ttWire(w, english){
  const key = w[0], p = (w[1] && typeof w[1] === "object") ? w[1] : {};
  const en = english ?? w[2] ?? "";
  if(!ttTable) return String(en);
  const s = ttLookup(key, p);
  if(s === null || !ttFits(s, p)) return String(en);
  return ttNames(ttFill(s, p));
}
/* The English Python wrote for a field of a payload row, whatever the page
   shows: for the code that reads Python's words (findingAmount(),
   spLimitShow(), splitFinding()). It is the row's own field when nothing was
   translated. */
function enOf(row, field){
  const en = row && row[TT_EN];
  return en && ttOwn(en, field) ? en[field] : row ? row[field] : undefined;
}
/* Swap every field Python sent as a message (row.i18n[field] = [key, params])
   for its text in the UI language, in place, on a payload already copied by
   localiseNames(). The English each row showed is kept on it, unenumerated.
   Nothing happens while no table is loaded. */
function ttPayload(v){
  if(!ttTable || !v || typeof v !== "object") return v;
  if(Array.isArray(v)){ v.forEach(ttPayload); return v; }
  const wires = v.i18n;
  if(wires && typeof wires === "object" && !Array.isArray(wires)){
    let en = null;
    for(const f of Object.keys(wires)){
      if(!Array.isArray(wires[f]) || typeof v[f] !== "string") continue;
      const s = ttWire(wires[f], v[f]);
      if(s === v[f]) continue;
      if(!en){
        en = v[TT_EN] || (v[TT_EN] = {});
      }
      if(!ttOwn(en, f)) en[f] = v[f];
      v[f] = s;
    }
  }
  for(const k of Object.keys(v)) if(k !== "i18n") ttPayload(v[k]);
  return v;
}
/* The static markup: data-tt on an element holding only text, and
   data-tt-title / -aria-label / -placeholder / -tip on any element. The
   English is what the markup says; it is kept aside the first time, so a
   switch back to English restores it. An element with element children is
   left alone: put data-tt on the innermost element that holds the words. */
function ttOrigOf(el){
  let rec = ttOrig.get(el);
  if(!rec){ rec = {attrs: {}}; ttOrig.set(el, rec); }
  return rec;
}
function tApply(root){
  if(typeof document === "undefined") return;
  root = root || document;
  if(!root.querySelectorAll) return;
  const els = [...root.querySelectorAll(TT_SELECTOR)];
  if(root.matches && root.matches(TT_SELECTOR)) els.unshift(root);
  for(const el of els){
    const rec = ttOrigOf(el);
    const key = el.getAttribute("data-tt");
    if(key && !(el.children && el.children.length)){
      if(rec.text === undefined) rec.text = el.textContent;
      const want = ttTable ? ttText(key, rec.text) : rec.text;
      if(el.textContent !== want) el.textContent = want;
    }
    for(const [a, target] of TT_ATTRS){
      const k = el.getAttribute(a);
      if(!k) continue;
      if(!ttOwn(rec.attrs, target)) rec.attrs[target] = el.getAttribute(target);
      const en = rec.attrs[target];
      if(en === null) continue;
      const want = ttTable ? ttText(k, en) : en;
      if(el.getAttribute(target) !== want) el.setAttribute(target, want);
    }
  }
}
function ttWhenDom(fn){
  if(typeof document !== "undefined" && document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", fn, {once: true});
  else fn();
}
/* The page follows the UI language: <html lang> (hyphenation, screen
   readers), and the number locale it returns, which the board's NUM_LOCALE
   takes. */
function setUiLocale(lang){
  const code = ttKnown(lang) ? lang : "en";
  try{ document.documentElement.lang = code; }catch(e){}
  return TT_NUM_LOCALES[code] || "en-US";
}
/* Called with the language whenever the table changes; the board redraws. */
function ttOnChange(fn){ if(typeof fn === "function") ttListeners.push(fn); }
/* Put a table in force (null for English), then refill the markup and tell
   the board. `lang` may be one TT_LANGS does not list, such as the tests'
   pseudo-locale "xx"; it is English for numbers and <html lang>. */
function ttSetTable(lang, table){
  ttLang = lang || "en";
  /* A table with no keys is no translation: English, numbers included, so
     "$1.234" never stands beside an English sentence (as cli_ui_table()). */
  ttTable = ttLang !== "en" && table && typeof table === "object" && Object.keys(table).length ? table : null;
  if(!ttTable) ttLang = "en";
  setUiLocale(ttLang);
  ttWhenDom(() => tApply());
  ttListeners.slice().forEach(fn => { try{ fn(ttLang); }catch(e){ console.error(e); } });
}
/* A language's table, fetched beside the page with the build stamp. */
function ttLoad(lang){
  const v = encodeURIComponent((typeof window !== "undefined" && window.LEDGER_BUILD) || "");
  return fetch(`i18n/${encodeURIComponent(lang)}.json${v ? `?v=${v}` : ""}`)
    .then(r => { if(!r.ok) throw new Error(`i18n/${lang}.json: ${r.status}`); return r.json(); });
}
/* Switch the UI language. A table that will not load leaves the page as it
   was and resolves false. */
async function setUiLang(lang){
  if(!ttKnown(lang)) lang = "en";
  const seq = ++ttSeq;
  let table = null;
  if(lang !== "en"){
    try{ table = await ttLoad(lang); }catch(e){ return false; }
  }
  if(seq !== ttSeq) return false;
  ttSetTable(lang, table);
  return true;
}
/* At load: a table the page carries, or the ?ui=de developer switch, which
   is not remembered. While a table loads the page stays hidden, for at most
   TT_WAIT_MS, so it does not paint in English first. */
(function ttBoot(){
  if(typeof document === "undefined" || typeof location === "undefined") return;
  let want = null;
  try{ want = new URLSearchParams(location.search).get("ui"); }catch(e){}
  if(TT_EMBED && TT_EMBED.lang && TT_EMBED.table && want !== "en"){
    ttSetTable(TT_EMBED.lang, TT_EMBED.table);
    return;
  }
  if(!want || want === "en" || !ttKnown(want)) return;
  const html = document.documentElement;
  html.classList.add("tt-wait");
  try{
    const style = document.createElement("style");
    style.textContent = "html.tt-wait body{visibility:hidden}";
    (document.head || html).appendChild(style);
  }catch(e){}
  const show = () => html.classList.remove("tt-wait");
  const timer = setTimeout(show, TT_WAIT_MS);
  setUiLang(want).finally(() => { clearTimeout(timer); ttWhenDom(show); });
})();
