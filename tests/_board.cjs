// The board script, template/board.js with its parts spliced back in
// (BOARD_PARTS), loaded whole into a VM, for tests of its pure functions: no
// slicing, so no anchors to keep in step with the code.
// What it touches at load (document, window, storage, observers) is one inert
// stub that answers every property and call with itself, so the boot code runs
// and does nothing. A test that runs a draw and reads what it wrote passes
// recordingDocument()'s document (below); one that drives navigation passes its
// own document, window, location and history (tests/navigation.test.cjs). A
// test that needs real events or layout runs in the browser.
// Section metadata comes from Python's authored registry, as on either front
// door; do not depend on the readable/optimized state of the assembled HTML.
// What it does not provide: render() fills no other placeholder, so there is no
// map.js or wiki.js, and D, GN_EMBED and HOOD_NAMES keep their defaults (null,
// null, {}): set them with vm.runInContext. The stub answers `then` with itself,
// so awaiting anything that reaches it never settles, and `instanceof` against
// it (Symbol.hasInstance, also the stub) is always true.
// Not a test file itself: the leading underscore keeps it out of the
// tests/*.test.cjs glob.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {selectPython} = require('../tools/verify.mjs');

const ROOT = path.join(__dirname, '..');
const SECTION_META = execFileSync(selectPython(),
  ['-c', 'import json, ba_dashboard; print(json.dumps(ba_dashboard.section_metadata()))'],
  {cwd: ROOT, encoding: 'utf8'}).trim();
const template = name => fs.readFileSync(path.join(ROOT, 'template', name), 'utf8');
/* The board script's parts kept in files of their own, each put back at its
   placeholder line in board.js, as load_template() in ba_dashboard.py does:
   the same text in the same order as one file. */
const BOARD_PARTS = [['/*__BOARD_WRITE__*/', 'board-write.js']];
function boardScript(){
  let board = template('board.js');
  for (const [slot, name] of BOARD_PARTS) {
    const parts = board.split(new RegExp(slot.replace(/[*/]/g, '\\$&') + '\\r?\\n'));
    if (parts.length !== 2) throw new Error(`template/board.js must carry ${slot} once`);
    // Joined, not .replace()d: a replacement string would read the part's own "$&" and "$$".
    board = parts[0] + template(name) + parts[1];
  }
  return board;
}
const SOURCE = template('mod-economy-model.js') + '\n'
  + template('mod-demand-model.js') + '\n'
  + template('open-store-model.js') + '\n'
  + template('open-factory-model.js') + '\n'
  + template('street-food-model.js') + '\n'
  + boardScript().replace('/*__SECTION_META__*/{}', () => SECTION_META);
const I18N = fs.readFileSync(path.join(ROOT, 'web', 'i18n.js'), 'utf8');

const inert = new Proxy(function(){}, {
  get(_, key){
    if(key === Symbol.toPrimitive) return () => 0;
    if(key === Symbol.iterator) return function*(){};
    if(key === 'length') return 0;
    return inert;
  },
  apply: () => inert,
  construct: () => inert,
  set: () => true,
});

/* A fresh context with web/i18n.js (which runs ahead of the board script on
   the page) and then the whole board script in it. Top-level functions are
   properties of the returned context; `const` and `let` names are reached with
   vm.runInContext(name, context). `globals` are set before either runs.
   `edit`, given, rewrites the board script's source first (a test's extra
   registry row). */
function loadBoard(globals = {}, {edit = null} = {}){
  const context = vm.createContext({
    document: inert, window: inert, navigator: inert, location: inert, history: inert,
    localStorage: inert, sessionStorage: inert, matchMedia: inert, getComputedStyle: inert,
    ResizeObserver: inert, IntersectionObserver: inert, MutationObserver: inert,
    Event: inert, CustomEvent: inert, fetch: inert, CSS: inert,
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    requestAnimationFrame: () => 0, addEventListener(){},
    // Defined by an earlier script of template/board.html.
    featureDiscovery: inert,
    console, URL, URLSearchParams,
    ...globals,
  });
  vm.runInContext(I18N, context, {filename: 'web/i18n.js'});
  vm.runInContext(edit ? edit(SOURCE) : SOURCE, context, {filename: 'template/board.js'});
  return context;
}

/* A document for loadBoard({document}) whose getElementById(id) hands back one
   element per id. The element keeps what a draw writes to it (innerHTML,
   hidden, ...) and answers everything else as the inert stub does, so a test
   can run a draw and read what it wrote: element(id).innerHTML. */
function recordingDocument(){
  const elements = new Map();
  const element = id => {
    if(!elements.has(id)){
      const own = {};
      elements.set(id, new Proxy(function(){}, {
        get: (_, key) => key in own ? own[key] : inert[key],
        set(_, key, value){ own[key] = value; return true; },
        apply: () => inert,
      }));
    }
    return elements.get(id);
  };
  const document = new Proxy(function(){}, {
    get: (_, key) => key === 'getElementById' ? element : inert[key],
    apply: () => inert,
    set: () => true,
  });
  return {document, element};
}

module.exports = {loadBoard, recordingDocument, SOURCE, BOARD_PARTS};
