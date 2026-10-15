// web/app.js run whole in a VM, for the tests that call its helpers
// (window.BigCopilotShell) rather than slicing its text. The document is a
// stand-in: every element app.js makes or asks for by id takes whatever is
// set on it and answers the calls it makes at load; DOMContentLoaded never
// fires, so nothing of the landing or the board starts. web/i18n.js runs
// first, as on the page, for tt().
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

/* Returns {shell, context}. `globals` go into the VM before app.js runs
   (navigator, localStorage, ...); `byId(id)` stands in for
   document.getElementById, a fresh element per id when not given. The
   context is app.js's global scope: a test may swap what its helpers reach
   for there (document.createElement, URL) once it has loaded. */
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
  return {shell: context.BigCopilotShell, context};
}

module.exports = {loadShell};
