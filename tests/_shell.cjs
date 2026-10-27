// web/app.js run whole in a VM, for the tests that call its helpers
// (window.BigCopilotShell) rather than slicing its text. The document is a
// stand-in: every element app.js makes or asks for by id takes whatever is
// set on it and answers the calls it makes at load; DOMContentLoaded never
// fires, so nothing of the landing or the board starts. web/i18n.js runs
// first, as on the page, for tt().
// The tests of startup, the game's text and the game link drive app.js's own
// names, which it hands over as BigCopilotShell.scope: `scope` reads and sets
// them by name, and run() runs a test's code among them.
// Not a test file itself: the leading underscore keeps it out of the
// tests/*.test.cjs glob.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const web = path.join(__dirname, '..', 'web');
const app = fs.readFileSync(path.join(web, 'app.js'), 'utf8');
const i18n = fs.readFileSync(path.join(web, 'i18n.js'), 'utf8');

function element(tag = 'div') {
  const attrs = {};
  return {
    tagName: String(tag).toUpperCase(), hidden: false, textContent: '', innerHTML: '', className: '',
    title: '', value: '', dataset: {}, style: {setProperty() {}},
    classList: {add() {}, remove() {}, toggle() {}, contains: () => false},
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    hasAttribute: (name) => name in attrs,
    removeAttribute(name) { delete attrs[name]; },
    addEventListener() {}, removeEventListener() {},
    append() {}, prepend() {}, appendChild: (child) => child,
    querySelector: () => element(), querySelectorAll: () => [],
    contains: () => false, focus() {},
  };
}

const named = (key) => typeof key === 'string';
function refuse(key) {
  throw new TypeError(`web/app.js hands ${key} to the tests to read only (BigCopilotShell.scope)`);
}

/* Returns {shell, context, scope, run}. `globals` go into the VM before
   app.js runs (navigator, localStorage, ...); `byId(id)` stands in for
   document.getElementById, a fresh element per id when not given. The
   context is app.js's global scope: a test may swap what its helpers reach
   for there (document.createElement, URL) once it has loaded.
   `scope` is the context as app.js's own code sees it: a name app.js hands
   over (BigCopilotShell.scope) reads and sets its binding, so setting a
   function stands in for it everywhere app.js calls it; any other name is the
   context's. run(code) runs code in the context with the same names in
   reach and returns its last value. Setting a name app.js hands over to
   read only throws. */
function loadShell({globals = {}, byId = null} = {}) {
  const ids = new Map();
  const context = vm.createContext({
    console, URL, AbortController, Intl, queueMicrotask,
    setTimeout: () => 0, clearTimeout() {},
    navigator: {},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    location: {hash: '', hostname: 'bigcopilot.test'},
    document: {
      hidden: false,
      body: element('body'),
      createElement: element,
      getElementById: byId || ((id) => {
        if (!ids.has(id)) ids.set(id, element());
        return ids.get(id);
      }),
      querySelector: () => null, querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {},
    },
    addEventListener() {}, removeEventListener() {},
    ...globals,
  });
  context.window = context;
  vm.runInContext(i18n, context);
  vm.runInContext(app, context, {filename: 'web/app.js'});
  const shell = context.BigCopilotShell;
  const own = shell.scope;
  const scope = new Proxy(context, {
    has: (g, key) => (named(key) && key in own) || key in g,
    get: (g, key) => (named(key) && key in own ? own[key] : g[key]),
    set(g, key, value) {
      if (!(named(key) && key in own)) g[key] = value;
      else if (!Reflect.set(own, key, value)) refuse(key);
      return true;
    },
  });
  // The object a `with` statement reads names through: app.js's own first,
  // then the context's globals, as a script inside app.js would.
  context.__appScope = new Proxy(own, {
    has: (o, key) => named(key) && key in o,
    get: (o, key) => (named(key) ? o[key] : undefined),
    set(o, key, value) {
      if (!Reflect.set(o, key, value)) refuse(key);
      return true;
    },
  });
  const run = (code) => vm.runInContext(`with (__appScope) {\n${code}\n}`, context);
  return {shell, context, scope, run};
}

module.exports = {loadShell, element};
