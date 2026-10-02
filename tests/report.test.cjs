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

const TRACE = 'Traceback (most recent call last):\n  File "/save/Alice Smith-live.hsg"\nprivate-trace-sentinel\nKeyError: shelf';
const CTX = {
  siteBuild: '0123456789',
  source: 'link',
  error: "KeyError: 'Alice Smith-live.hsg' in /save/Alice Smith-live.hsg for Alice Co",
  trace: TRACE,
  names: ['Alice Smith-live.hsg', 'Alice Co'],
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
  // The public report: the error's last line, masked, and never the traceback.
  const sent = JSON.parse(parts.report);
  assert.equal(sent.gameBuild, null);
  assert.equal(sent.error, "KeyError: '…' in /save/<save> for <save>");
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

test('report.js: home folders and save paths are masked even with spaces in them', () => {
  const report = load();
  assert.equal(report.mask('No such file: C:\\Users\\Bob Jones\\Saves', []), 'No such file: <home>\\Saves');
  assert.equal(report.mask("KeyError: 'Bob Jones Bakery'", []), "KeyError: '…'", 'a quoted value can be a name from the save');
  assert.equal(report.mask('at /Users/bob/Library and /home/bob/.local', []), 'at <home>/Library and <home>/.local');
  assert.equal(report.mask('open /save/Recover #3.hsg failed', []), 'open /save/<save> failed');
  assert.equal(report.mask('line\nbreak', []).includes('\n'), false);
  assert.equal(report.mask('ALICE CO lost', ['Alice Co']), '<save> lost', 'names are masked whatever their case');
});

test('report.js: the public line skips the save parser\'s hex window and is one line of a multiline error', () => {
  const report = load();
  const sent = (ctx) => JSON.parse(report.parts(Object.assign({names: []}, ctx), {text: 'x', details: true}, env())[0][1]).error;
  // ba_save's _where(): the message, then the bytes around the fault, which
  // worker.js shows as the last line. UTF-16 "Alice" is 41 00 6c 00 69 00 ...
  const parser = 'Traceback (most recent call last):\n  File "/ba_save.py", line 9\nValueError: unknown tag 0x99 at offset 0x1f0\n  41 00 6c 00 69 00 63 00 65 00 20 00';
  assert.equal(sent({error: '  41 00 6c 00 69 00 63 00 65 00 20 00', trace: parser}), 'ValueError: unknown tag 0x99 at offset 0x1f0');
  // A startup failure hands its whole traceback over as the error.
  assert.equal(sent({error: 'Traceback (most recent call last):\n  File "/x.py", line 1\nImportError: no module', trace: ''}), 'ImportError: no module');
  // Bytes inside a line are masked as well.
  assert.equal(report.mask('bad at 0x10 41 00 6c 00 69 00', []), 'bad at 0x10 <bytes>');
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
