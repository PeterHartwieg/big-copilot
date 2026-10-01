// The board script, template/board.js, loaded whole into a VM, for tests of
// its pure functions: no slicing, so no anchors to keep in step with the code.
// What it touches at load (document, window, storage, observers) is one inert
// stub that answers every property and call with itself, so the boot code runs
// and does nothing. A test that needs a real helper or real DOM still slices
// (tests/_slice.cjs) and stubs what that piece reaches.
// What it does not provide: render() fills no placeholder, so there is no
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

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'template', 'board.js'), 'utf8');
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
   vm.runInContext(name, context). `globals` are set before either runs. */
function loadBoard(globals = {}){
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
  vm.runInContext(SOURCE, context, {filename: 'template/board.js'});
  return context;
}

module.exports = {loadBoard, SOURCE};
