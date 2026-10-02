'use strict';

// What the bug report form (web/report.js) sends, read straight from its
// functions in a VM: nothing is attached unless its box is ticked, the
// settings are an allowlist of three, the full traceback stays out of the
// public report, and the error line is masked. The route's own checks are in
// community-report.test.cjs; the form in the page is report_flow.test.cjs.

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'web', 'report.js'), 'utf8');

function load() {
  const window = {};
  vm.runInNewContext(SOURCE, {window, Blob, URL, JSON});
  return window.BigCopilotReport;
}

// Browser storage as a player's holds it: the history, typed names, recent
// searches, the game link and its approval, and the theme.
const STORED = {
  ledger_history: '{"market":"private-history-sentinel"}',
  ba_line_names: '{"x":"private-line-name"}',
  ba_dash_search_recent: '["private-search"]',
  ledger_link: 'http://127.0.0.1:8322',
  ledger_link_approval: '{"http://127.0.0.1:8322":"private-approval-token"}',
  ledger_pick: '{"dir":"private-character-folder"}',
  ba_dash_theme: 'dark',
};
function env(stored = STORED) {
  const reads = [];
  return {
    reads,
    storage: {getItem: (key) => { reads.push(key); return Object.hasOwn(stored, key) ? stored[key] : null; }},
    doc: {documentElement: {lang: 'de'}},
    nav: {userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', platform: 'Win32'},
  };
}

const TRACE = 'Traceback (most recent call last):\n  File "/ba_dashboard.py", line 4120, in _staffing\n    for x in save["Alice Smith"]:\nprivate-trace-sentinel\nKeyError: \'Alice Smith\'';
const CTX = {
  siteBuild: '0123456789',
  source: 'link',
  error: "KeyError: 'Alice Smith-live.hsg' in /save/Alice Smith-live.hsg for Alice Co",
  trace: TRACE,
};
const BYTES = new Uint8Array([31, 139, 8, 0, 1, 2, 3]).buffer;
const byName = (parts) => Object.fromEntries(parts.map(([name, value]) => [name, value]));

test('report.js: nothing is attached unless its box is ticked', () => {
  const report = load();
  const e = env();
  const parts = report.parts(CTX, {text: '  It broke.  ', save: false, details: false, bytes: BYTES, gameBuild: 3682}, e);
  assert.deepEqual(Array.from(parts, ([name]) => name), ['report']);
  const sent = JSON.parse(parts[0][1]);
  assert.deepEqual(sent, {text: 'It broke.', siteBuild: '0123456789', gameBuild: 3682, browser: 'chrome', source: 'link'});
  assert.deepEqual(e.reads, [], 'no storage is read for a report without details');
});

test('report.js: the details carry the traceback and three settings, and nothing else from storage', () => {
  const report = load();
  const e = env();
  const parts = byName(report.parts(CTX, {text: 'It broke.', save: false, details: true, bytes: null, gameBuild: null}, e));
  assert.deepEqual(Object.keys(parts), ['report', 'details']);
  const details = JSON.parse(parts.details);
  assert.deepEqual(Object.keys(details).sort(), ['error', 'settings', 'trace']);
  assert.deepEqual(details.settings, {language: 'de', theme: 'dark', platform: 'windows'});
  assert.equal(details.trace, TRACE);
  assert.deepEqual(e.reads, ['ba_dash_theme'], 'only the theme is read from storage');
  for (const value of Object.values(STORED).filter((v) => v !== 'dark')) {
    assert.equal(parts.details.includes(value), false, `details must not carry ${value}`);
    assert.equal(parts.report.includes(value), false, `the report must not carry ${value}`);
  }
  // The public report: the error's class and where it was raised, never its message.
  const sent = JSON.parse(parts.report);
  assert.equal(sent.gameBuild, null);
  assert.equal(sent.error, 'KeyError in _staffing (ba_dashboard.py line 4120)');
  assert.equal(parts.report.includes('private-trace-sentinel'), false);
  assert.doesNotMatch(parts.report, /Alice|Smith|Traceback/);
});

test('report.js: an unexpected theme or language is sent as a fixed word', () => {
  const report = load();
  const e = env({ba_dash_theme: '<img src=x>'});
  e.doc.documentElement.lang = 'en"><script>';
  const details = JSON.parse(byName(report.parts(CTX, {text: 'x', details: true}, e)).details);
  assert.deepEqual(details.settings, {language: 'en', theme: 'auto', platform: 'windows'});
  // Storage that throws (a private window) leaves the default.
  const blocked = env();
  blocked.storage = {getItem() { throw new Error('denied'); }};
  assert.equal(report.settings(blocked).theme, 'auto');
});

test('report.js: the save goes only when ticked and held, as the bytes the page read', async () => {
  const report = load();
  const ticked = byName(report.parts(CTX, {text: 'x', save: true, bytes: BYTES}, env()));
  assert.deepEqual(Object.keys(ticked), ['report', 'save']);
  assert.deepEqual(Buffer.from(await ticked.save.arrayBuffer()), Buffer.from(BYTES));
  assert.deepEqual(Object.keys(byName(report.parts(CTX, {text: 'x', save: true, bytes: null}, env()))), ['report']);
  assert.deepEqual(Object.keys(byName(report.parts(CTX, {text: 'x', save: false, bytes: BYTES}, env()))), ['report']);
});

test('report.js: the build, source and browser are held to the values the Worker accepts', () => {
  const report = load();
  const sent = (ctx, choice, e = env()) => JSON.parse(report.parts(ctx, Object.assign({text: 'x'}, choice), e)[0][1]);
  assert.equal(sent({siteBuild: 'not-a-stamp', source: 'C:\\Users\\alice'}, {}).siteBuild, 'dev');
  assert.equal(sent({source: 'C:\\Users\\alice'}, {}).source, 'none');
  assert.equal(sent(CTX, {gameBuild: '3682'}).gameBuild, null);
  assert.equal(sent(CTX, {gameBuild: 3682.5}).gameBuild, null);
  assert.equal(sent(CTX, {text: 'y'.repeat(6000)}).text.length, 5000);
  const browsers = {
    'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0': 'edge',
    'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0': 'firefox',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15': 'safari',
    'curl/8.0': 'other',
  };
  for (const [ua, family] of Object.entries(browsers)) assert.equal(report.browser({userAgent: ua}), family);
});

// The Worker's own pattern for the public line (server/worker.mjs, REPORT_ERROR),
// read from its source so the two cannot drift apart.
const WORKER_ERROR = new RegExp(/const REPORT_ERROR = \/(.+)\/;/.exec(fs.readFileSync(path.join(__dirname, '..', 'server', 'worker.mjs'), 'utf8'))[1]);

test('report.js: the public error line is the class and the place in our code, never the message', () => {
  const report = load();
  const line = (error, trace = '') => report.errorLine({error, trace});
  const cases = [
    // The save parser: an unquoted type name read from the save, and the hex
    // window of the bytes around the fault (UTF-16 "Alice").
    ['  41 00 6c 00 69 00 63 00)', 'Traceback (most recent call last):\n  File "/ba_dashboard.py", line 19590, in browser_build\n  File "/ba_save.py", line 255, in body\nba_dashboard.SaveShapeError: Alice Smith-live.hsg is not a Big Ambitions save this board can read (ValueError: body tag 0xff in Private Employee Alice Smith at offset 0x3a\n  41 00 6c 00 69 00 63 00)',
      'SaveShapeError in body (ba_save.py line 255)'],
    // Escaped and nested quotes in the message.
    ["'X\\' Alice \"Y\"'", 'Traceback (most recent call last):\n  File "/ba_dashboard.py", line 9, in _premises\nValueError: \'X\\\' Alice "Y"\'', 'ValueError in _premises (ba_dashboard.py line 9)'],
    // A startup failure hands its whole traceback over as the error.
    ['Traceback (most recent call last):\n  File "<exec>", line 3, in <module>\nImportError: no module named Alice', '', 'ImportError'],
    // The page's own script: V8's JSON error quotes a piece of the payload.
    ['Unexpected token N, ..."privateName":"Bob","x":NaN}" is not valid JSON', 'SyntaxError: Unexpected token N, ..."privateName":"Bob"... is not valid JSON\n    at JSON.parse (<anonymous>)\n    at Worker.onmessage (http://report.test/app.js?v=abc:340:27)', 'SyntaxError in onmessage (app.js line 340)'],
    // Nothing recognisable: nothing published.
    ["'Alice Smith-live.hsg' could not be read", '', ''],
  ];
  for (const [error, trace, expected] of cases) {
    const got = line(error, trace);
    assert.equal(got, expected, error);
    assert.doesNotMatch(got, /Alice|Smith|Bob|private|41 00/);
    if (got) assert.match(got, WORKER_ERROR, 'the Worker accepts what the page builds');
  }
});

test('report.js: only an issue of this repository is linked', () => {
  const report = load();
  assert.deepEqual({...report.issue({number: 12, url: 'https://github.com/PeterHartwieg/big-copilot/issues/12'})},
    {number: 12, url: 'https://github.com/PeterHartwieg/big-copilot/issues/12'});
  for (const raw of [
    {number: 12, url: 'https://github.com/PeterHartwieg/big-copilot/issues/13'},
    {number: 12, url: 'https://evil.test/PeterHartwieg/big-copilot/issues/12'},
    {number: 12, url: 'javascript:alert(1)'},
    {number: 12, url: 'http://github.com/PeterHartwieg/big-copilot/issues/12'},
    {number: '12', url: 'https://github.com/PeterHartwieg/big-copilot/issues/12'},
    null,
  ]) assert.equal(report.issue(raw), null, JSON.stringify(raw));
});

test('report.js: the source reads browser storage in one place, for the theme only', () => {
  assert.deepEqual(SOURCE.match(/getItem\(/g), ['getItem(']);
  assert.match(SOURCE, /env\.storage\.getItem\(BR_THEME_KEY\)/);
  assert.doesNotMatch(SOURCE, /setItem|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(SOURCE, /\.innerHTML\s*=/, 'everything is rendered with textContent');
});
