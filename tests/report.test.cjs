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
  vm.runInNewContext(SOURCE, {window, Blob, URL, JSON, TextEncoder});
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

const TRACE = 'Traceback (most recent call last):\n  File "/ba_dashboard.py", line 4120, in _staffing\n    for x in save["Alice Smith"]:\nKeyError: \'Alice Smith\'\nprivate-trace-sentinel';
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

// A Python traceback as Pyodide hands it over: the header, the frames with
// their source lines, then the exception's line and its message.
const pyTrace = (frames, rest) => ['Traceback (most recent call last):',
  ...frames.flatMap(([file, line, fn]) => [`  File "/${file}", line ${line}, in ${fn}`, '    some_code()']), ...rest].join('\n');

test('report.js: the public error line is the class and the deepest frame, read from before the message', () => {
  const report = load();
  const frames = [['ba_dashboard.py', 19590, 'browser_build'], ['ba_save.py', 255, 'body']];
  const cases = [
    // The save parser: an unquoted type name and the hex window of the bytes
    // around the fault (UTF-16 "Alice").
    [{trace: pyTrace(frames, ['ba_dashboard.SaveShapeError: Alice Smith-live.hsg is not a save this board can read (ValueError: body tag 0xff in Private Employee Alice at offset 0x3a', '  41 00 6c 00 69 00)'])},
      'SaveShapeError in body (ba_save.py line 255)'],
    // A type name read from the save that holds lines shaped like a class or a
    // frame: they come after the exception's line, so they are message.
    [{trace: pyTrace(frames, ['ba_save.SaveFormatError: body tag 0x09 in Acme', 'SmithFamilyHoldingsError at offset 0x1234',
      '  File "/AliceSmith.py", line 123, in PrivateCompany', 'AliceSmithError: x', 'Traceback (most recent call last):', '  File "/Alice.py", line 1, in Bob', 'BobError'])},
      'SaveFormatError in body (ba_save.py line 255)'],
    // A save named like a class: the message is never read.
    [{trace: pyTrace(frames, ['ValueError: AliceSmithError.hsg is not gzip']), error: 'AliceSmithError.hsg is not gzip'}, 'ValueError in body (ba_save.py line 255)'],
    // Escaped and nested quotes.
    [{trace: pyTrace([['ba_dashboard.py', 9, '_premises']], ["KeyError: 'X\\' Alice \"Y\"'"])}, 'KeyError in _premises (ba_dashboard.py line 9)'],
    // No frame of our shape: the class alone.
    [{trace: pyTrace([['<exec>', 3, '<module>']], ['ImportError: no module named Alice'])}, 'ImportError'],
    // A comprehension's own frame is named as Python names it.
    [{trace: pyTrace([['ba_dashboard.py', 9, '_staffing'], ['ba_dashboard.py', 12, '<listcomp>']], ['KeyError: x'])}, 'KeyError in <listcomp> (ba_dashboard.py line 12)'],
    // A frame name longer than the Worker takes is left out.
    [{trace: pyTrace([['ba_dashboard.py', 9, 'f'.repeat(90)]], ['KeyError: x'])}, 'KeyError'],
    // The page's own script: only the error's name, never its stack, whose
    // first line is the message (V8's JSON error quotes the payload).
    [{trace: 'SyntaxError: ..."Bob","x":NaN}" is not valid JSON\n    at Worker.onmessage (http://report.test/app.js?v=abc:340:27)', errorName: 'SyntaxError'}, 'SyntaxError'],
    [{trace: 'Error: x', errorName: 'not a name'}, ''],
    // Nothing recognisable: nothing published.
    [{error: "'Alice Smith-live.hsg' could not be read", trace: ''}, ''],
  ];
  for (const [ctx, expected] of cases) {
    const got = report.errorLine(ctx);
    assert.equal(got, expected, JSON.stringify(ctx));
    assert.doesNotMatch(got, /Alice|Smith|Bob|Private|41 00/);
    if (got) assert.match(got, WORKER_ERROR, 'the Worker accepts what the page builds');
  }
});

test('report.js: a real Python failure on a save named like a class publishes only code words', () => {
  // The board's own browser_build() on a broken save whose file name looks like
  // an exception class, the traceback as Python formats it.
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'br-'));
  fs.writeFileSync(path.join(dir, 'AliceSmithError.hsg'), 'not gzip');
  const script = [
    'import sys, traceback', `sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '..'))})`, 'import ba_dashboard',
    'try:', "    ba_dashboard.browser_build('AliceSmithError.hsg', 'none.json', 'history.json')",
    'except Exception:', '    sys.stdout.write(traceback.format_exc())',
  ].join('\n');
  const run = require('node:child_process').spawnSync(process.env.PYTHON || 'python3', ['-c', script], {cwd: dir, encoding: 'utf8'});
  fs.rmSync(dir, {recursive: true, force: true});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /AliceSmithError\.hsg is not a Big Ambitions save/, 'the message names the save');
  const got = load().errorLine({trace: run.stdout.trim(), error: 'AliceSmithError.hsg is not a Big Ambitions save'});
  assert.match(got, WORKER_ERROR);
  assert.doesNotMatch(got, /Alice|Smith/);
  assert.match(got, /^BadGzipFile in \w+ \(gzip\.py line \d+\)$/, 'the cause, read from the first traceback block');
});

test('report.js: the details stay under the Worker\'s 256 KiB in bytes, whatever the script', () => {
  const report = load();
  const wide = '中'.repeat(100000);  // three bytes each in UTF-8
  const ctx = {trace: `Traceback (most recent call last):\n  File "/ba_save.py", line 255, in body\nValueError: body tag in ${wide}\nTHE-END`, error: wide};
  const details = byName(report.parts(ctx, {text: 'x', details: true}, env())).details;
  assert.ok(Buffer.byteLength(details) <= 256 * 1024, `${Buffer.byteLength(details)} bytes`);
  const parsed = JSON.parse(details);
  assert.ok(parsed.trace.endsWith('THE-END'), 'the end of the traceback, where the error is, is kept');
  assert.equal(parsed.error.length, 2000);
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
