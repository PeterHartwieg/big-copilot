// The one browser harness for the Playwright suites (issue #340): launching
// Chromium, aborting https requests, rendering the board, serving web/,
// opening a page and catching its script errors, in one place so the suites
// stay in step. Suites move onto it as they are touched, keeping their
// viewport, storage, motion setting and BOARD_TARGET handling; a host may
// change where the harness serves it more simply (sphere left its 127.0.0.1
// server for https://sphere.test/).
//
//   const page = require('./_page.cjs');
//   const browser = page.suiteBrowser();          // launched once, closed after
//   test('...', async t => {
//     const {page: p, errors} = await page.openPage(t, await browser(), {html: page.boardHtml()});
//   });
//
// Install Playwright and its Chromium browser to run; NODE_PATH may point at an
// existing installation, and PLAYWRIGHT_CHANNEL=msedge (or chrome) uses an
// installed browser instead. Not a test file itself: the leading underscore
// keeps it out of the tests/*.test.cjs glob.
'use strict';

const {after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {selectPython} = require('../tools/verify.mjs');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');

/* Content types by extension, for a route that fulfils a body rather than a
   path (Playwright guesses a path's type itself). */
const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
});
const mimeOf = name => MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';

/* Chromium, headless, or the installed browser PLAYWRIGHT_CHANNEL names. */
function launch(options = {}) {
  const {chromium} = require('playwright');
  return chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL, ...options});
}

/* One browser for the whole suite: the returned function launches it on its
   first call and hands back the same one after; it is closed when the suite
   ends. Call at the top level of the suite file. */
function suiteBrowser(options = {}) {
  let launched = null;
  after(async () => {
    // A failed launch already failed the tests that asked for it.
    const browser = await launched?.catch(() => null);
    await browser?.close();
  });
  return () => (launched ||= launch(options));
}

/* Aborts every https request of a page or context. Routes registered later
   win, so register this first and the suite's own https host after it. Plain
   http stays open for a suite that serves from 127.0.0.1. */
function abortExternal(target) {
  return target.route('https://**', route => route.abort());
}

/* The script errors a page throws. Given the test, it also asserts at the
   test's end that there were none. */
function collectErrors(page, t = null) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (t) t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  return errors;
}

/* The CLI board rendered by Python: render(None), a bare board with no data,
   or render() of a JSON payload file named relative to the repository root
   (tests/fixtures/payload_snapshot/..., synthetic only). Memoised per process,
   a failure too: a broken render runs Python once and throws the same error
   to every test that asks. */
const rendered = new Map();
function runRender(payloadFile) {
  const load = payloadFile
    ? `d = json.load(open(${JSON.stringify(payloadFile)}, encoding="utf-8"))`
    : 'd = None';
  const made = spawnSync(selectPython(), ['-c', `
import json, sys
from ba_dashboard import render
${load}
sys.stdout.buffer.write(render(d).encode("utf-8"))`], {cwd: ROOT, maxBuffer: 64 * 1024 * 1024});
  assert.equal(made.status, 0, made.stderr?.toString());
  return made.stdout.toString('utf8');
}
function renderBoard(payloadFile = null) {
  const key = payloadFile || '';
  if (!rendered.has(key)) {
    try { rendered.set(key, {html: runRender(payloadFile)}); } catch (error) { rendered.set(key, {error}); }
  }
  const {html, error} = rendered.get(key);
  if (error) throw error;
  return html;
}

/* The board a suite tests: the CLI page from renderBoard(), or with
   BOARD_TARGET=web the built web/index.html (rebuild it first). */
function boardHtml(payloadFile = null) {
  return process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
    : renderBoard(payloadFile);
}

/* Serves web/ on `host` to a page or context, and aborts every request to any
   other host. `/` is index.html. `only` (paths such as '/app.js') aborts the
   rest of web/ too; `files` maps a path to a body (served with mimeOf) or to
   a route handler, ahead of the folder. A file not in web/ is a 404. */
function serveWeb(target, {host, only = null, files = {}}) {
  const allowed = only && new Set(only);
  return target.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== host) return route.abort();
    const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    if (Object.hasOwn(files, name)) {
      const own = files[name];
      return typeof own === 'function' ? own(route)
        : route.fulfill({contentType: mimeOf(name), body: own});
    }
    if (allowed && !allowed.has(name)) return route.abort();
    const file = path.join(WEB, name);
    if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({path: file});
  });
}

/* A page in a context of its own, closed when the test ends, with https shut
   out and its script errors collected (asserted empty at the end unless
   `allowErrors`). `html` is served at `url`, which is then opened; without
   `html` and `url` the page is left blank for the suite to route and open.
   `context` takes newContext() options; `viewport` and `reducedMotion` are
   the usual two. Returns {page, context, errors}. */
async function openPage(t, browser, {
  html = null, url = html === null ? null : 'https://board.test/', hash = '',
  viewport = {width: 1280, height: 900}, reducedMotion = undefined, context: options = {},
  allowErrors = false, waitUntil = 'load',
} = {}) {
  const context = await browser.newContext({viewport, ...(reducedMotion ? {reducedMotion} : {}), ...options});
  t.after(() => context.close());
  await abortExternal(context);
  if (html !== null) {
    const at = new URL(url);
    await context.route(`${at.origin}/**`, route => new URL(route.request().url()).pathname === at.pathname
      ? route.fulfill({contentType: MIME['.html'], body: html}) : route.fulfill({status: 404, body: ''}));
  }
  const page = await context.newPage();
  const errors = collectErrors(page, allowErrors ? null : t);
  if (url !== null) await page.goto(url + hash, {waitUntil});
  return {page, context, errors};
}

/* Hands a payload to a page already showing the board, the way the web page
   does once its worker has extracted one. */
function loadPayload(page, payload) {
  return page.evaluate(raw => { document.body.classList.add('has-board'); takeData(raw); boot(); }, payload);
}

module.exports = {
  ROOT, WEB, MIME, mimeOf, launch, suiteBrowser, abortExternal, collectErrors,
  renderBoard, boardHtml, serveWeb, openPage, loadPayload,
};
