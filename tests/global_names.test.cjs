// Every classic script on the page shares one global scope: web/i18n.js in the
// head, the inline scripts of template/board.html, and the board script
// (template/board.js), which render() splices map.js and wiki.js into. The
// site's page adds web/update.js (inline) and web/app.js and web/community.js
// (classic <script src>). So a top-level name declared twice is a bug: a second
// `const` or `let` is a SyntaxError that stops the whole script (a blank board),
// and a second `function` silently replaces the first. This test reads the
// column-0 declarations of all of them and wants each name once.
// Pure text, no build: it reads the source files, not web/index.html.
'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

// The inline scripts of board.html, each as its own source. The board script's
// slot and the head's i18n slot are placeholders here; their files are read
// below. JSON and other non-script blocks are not code.
function inlineScripts(rel){
  const out = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/g;
  const html = read(rel);
  let m;
  while((m = re.exec(html))){
    const attrs = m[1] || '';
    if(/\bsrc\s*=/.test(attrs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/.exec(attrs);
    if(type && !/^(text|application)\/javascript$/i.test(type[1])) continue;
    // Line numbers count from the file's first line, not the block's.
    const before = html.slice(0, m.index + m[0].length - m[2].length - '</script>'.length);
    out.push({name: rel, text: m[2], firstLine: before.split('\n').length});
  }
  return out;
}

const SOURCES = [
  {name: 'web/i18n.js', text: read('web/i18n.js')},
  ...inlineScripts('template/board.html'),
  {name: 'template/board.js', text: read('template/board.js')},
  {name: 'web/map.js', text: read('web/map.js')},
  {name: 'web/wiki.js', text: read('web/wiki.js')},
  {name: 'web/update.js', text: read('web/update.js')},
  {name: 'web/app.js', text: read('web/app.js')},
  {name: 'web/community.js', text: read('web/community.js')},
];

const DECL = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^class\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+(.*)$/;
const IDENT_START = /^\s*([A-Za-z_$][\w$]*)\s*(?:=(?![=>])|,|;|$)/;

/* Where the literal that opens at rest[i] ends (the index of its last
   character): a string, a template (to its next backtick, so a nested one
   inside `${}` would end it early; none sits on a declaration line today),
   a regular expression or a block comment. A `/` is a regular expression where
   an operand is expected, which is after one of ( , = : [ ! & | ? { } ; or at
   the start. Returns i for anything else. */
function literalEnd(rest, i){
  const c = rest[i];
  const until = (j, stop) => { for(; j < rest.length; j++){ if(rest[j] === '\\') j++; else if(stop(j)) return j; } return rest.length - 1; };
  if(c === '"' || c === "'" || c === '`') return until(i + 1, j => rest[j] === c);
  if(c !== '/') return i;
  if(rest[i + 1] === '*'){ const end = rest.indexOf('*/', i + 2); return end < 0 ? rest.length - 1 : end + 1; }
  if(rest[i + 1] === '/' || !/(^|[(,=:[!&|?{};])\s*$/.test(rest.slice(0, i))) return i;
  let inClass = false;
  return until(i + 1, j => {
    if(rest[j] === '[') inClass = true;
    else if(rest[j] === ']') inClass = false;
    return rest[j] === '/' && !inClass;
  });
}

/* The names one column-0 `const`/`let`/`var` line declares: the first, and
   every further `, name =` at bracket depth 0 on the same line, with strings,
   templates, regular expressions and comments passed over. A declarator list
   carried on to the next line, or a destructuring pattern, is refused, so the
   test cannot miss names quietly. */
function declarators(rest, where){
  if(/^[[{]/.test(rest)) throw new Error(`${where}: destructuring at column 0; teach tests/global_names.test.cjs to read it`);
  const names = [];
  let depth = 0, start = 0;
  const segment = s => {
    const m = IDENT_START.exec(s);
    if(m) names.push(m[1]);
    else if(!names.length) throw new Error(`${where}: cannot read the declared name`);
  };
  for(let i = 0; i < rest.length; i++){
    const c = rest[i];
    if(c === '/' && rest[i + 1] === '/'){ rest = rest.slice(0, i); break; }
    const end = literalEnd(rest, i);
    if(end !== i){ i = end; continue; }
    if(c === '(' || c === '[' || c === '{') depth++;
    else if(c === ')' || c === ']' || c === '}') depth--;
    else if(c === ',' && depth === 0){ segment(rest.slice(start, i)); start = i + 1; }
  }
  const tail = rest.slice(start);
  if(depth === 0 && /,\s*$/.test(rest)) throw new Error(`${where}: declarator list continues on the next line; teach tests/global_names.test.cjs to read it`);
  if(tail.trim()) segment(tail);
  return names;
}

function topLevelNames({name, text, firstLine = 1}){
  const found = [];
  text.split('\n').forEach((line, i) => {
    const m = DECL.exec(line);
    if(!m) return;
    const where = `${name}:${firstLine + i}`;
    const names = m[3] !== undefined ? declarators(m[3], where) : [m[1] || m[2]];
    for(const n of names) found.push({name: n, where});
  });
  return found;
}

test('the reader finds the declarations it should', () => {
  const names = s => topLevelNames({name: 't', text: s}).map(d => d.name);
  assert.deepEqual(names('let a = 1, b = f(x, y), c;\nconst d = x => ({e: 1, f: 2}), g = [1, 2];'), ['a', 'b', 'c', 'd', 'g']);
  assert.deepEqual(names('const s = "a,b//c(", t = \'x,[\\\'\', u = `p,${q}`, v = /[,"/]\\//g, w = 1 /* , x = 2 */;'), ['s', 't', 'u', 'v', 'w']);
  assert.deepEqual(names('const r = a / b, y = c / d;'), ['r', 'y']);
  assert.deepEqual(names('function h(){}\nasync function i(){}\nfunction* j(){}\nclass K {}\nvar l;'), ['h', 'i', 'j', 'K', 'l']);
  assert.deepEqual(names('  const nested = 1;\n// const commented = 1;\nlet m = 1; // , n = 2'), ['m']);
  assert.throws(() => names('let a = 1,\n  b = 2;'), /continues on the next line/);
  assert.throws(() => names('const {a, b} = o;'), /destructuring/);
});

test('every top-level name of the page\'s shared global scope is declared once', () => {
  const seen = new Map();
  for(const source of SOURCES){
    for(const decl of topLevelNames(source)){
      if(!seen.has(decl.name)) seen.set(decl.name, []);
      seen.get(decl.name).push(decl.where);
    }
  }
  // The board script alone declares well over a thousand names; a reader that
  // stopped matching would pass the uniqueness check vacuously.
  assert.ok(seen.size > 1500, `only ${seen.size} top-level names found`);
  const dupes = [...seen].filter(([, at]) => at.length > 1).map(([n, at]) => `${n}: ${at.join(', ')}`);
  assert.deepEqual(dupes, [], 'top-level names declared more than once in the shared global scope');
});
