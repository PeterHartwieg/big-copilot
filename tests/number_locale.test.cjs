// Numbers read the same whatever the reader's browser speaks. The board formats
// every number through num(), in the UI's number locale (en-US for English),
// so a German browser never shows "1.234 units" beside "$1,234". Two checks:
// the source holds no bare toLocaleString() (it follows the browser), and the
// real board, drawn in a de-DE browser for the synthetic company in
// tests/es3_fixture.py, never calls one on any page and groups with commas.
// Install Playwright and its Chromium browser to run; NODE_PATH may point at
// an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const PYTHON = process.env.PYTHON || 'python';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// The board script is the TEMPLATE string; map.js and wiki.js run inside it.
const dashboard = read('ba_dashboard.py');
const templateAt = dashboard.indexOf('TEMPLATE = r"""');
const template = dashboard.slice(templateAt, dashboard.indexOf('"""', templateAt + 15));
const firstLine = dashboard.slice(0, templateAt).split('\n').length;
const SOURCES = [['ba_dashboard.py', template, firstLine], ['web/map.js', read('web/map.js'), 1],
  ['web/wiki.js', read('web/wiki.js'), 1]];
const NUM = 'const num = (n, opts) => Number(n).toLocaleString(NUM_LOCALE, opts);';

test('no bare toLocaleString() in the board script, map.js or wiki.js: numbers go through num()', () => {
  assert.ok(templateAt >= 0, 'TEMPLATE not found');
  assert.equal(template.split(NUM).length, 2, 'num() is defined once, in the board script');
  for (const [file, src, first] of SOURCES) {
    const bare = src.split('\n').map((line, i) => `${file}:${first + i}: ${line.trim()}`)
      .filter(line => !line.endsWith(NUM) && /\.toLocaleString\(/.test(line));
    assert.deepEqual(bare, [], 'format through num(), not toLocaleString()');
  }
});

let browser, html;
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'number-locale-'));
  try {
    const save = path.join(dir, 'numbers.hsg'), data = path.join(dir, 'payload.json');
    const made = spawnSync(PYTHON, [path.join(root, 'tests', 'es3_fixture.py'), save, data], {cwd: root});
    assert.equal(made.status, 0, made.stderr?.toString());
    const page = spawnSync(PYTHON, ['-c',
      'import json, sys; from ba_dashboard import render; '
      + 'sys.stdout.buffer.write(render(json.load(open(sys.argv[1], encoding="utf-8"))).encode("utf-8"))', data],
    {cwd: root, maxBuffer: 16 * 1024 * 1024});
    assert.equal(page.status, 0, page.stderr?.toString());
    html = page.stdout.toString();
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

// A number formatted with no locale follows the browser: record where, and
// fail the call, so the page shows the error as well as the test.
const TRAP = () => {
  const own = Number.prototype.toLocaleString;
  window.bareCalls = [];
  window.germanDefault = own.call(1234);
  Number.prototype.toLocaleString = function(locale, opts){
    if (locale === undefined) {
      window.bareCalls.push(new Error('bare toLocaleString').stack.split('\n').slice(2, 4).join(' | '));
      throw new Error('bare toLocaleString(): format through num()');
    }
    return own.call(this, locale, opts);
  };
};

test('a de-DE browser gets en-US numbers on every page and site of the board', async t => {
  const context = await browser.newContext({locale: 'de-DE', viewport: {width: 1280, height: 2400}});
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await context.route('https://**', route => route.abort());
  await context.route('https://numbers.test/', route =>
    route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await context.addInitScript(TRAP);
  await page.goto('https://numbers.test/', {waitUntil: 'load'});
  assert.equal(await page.evaluate(() => window.germanDefault), '1.234', 'the browser really is German');

  // Every page and view, then every site's own page; the text of each as the
  // reader sees it once painted. A step that throws is kept, not fatal, so the
  // report names the bare calls.
  const {text, sites, failed} = await page.evaluate(async () => {
    document.body.classList.add('has-board');
    document.querySelectorAll('section').forEach(s => s.classList.add('measured'));
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const seen = [], failed = [];
    const step = async (what, go, read) => {
      try { go(); await frame(); seen.push(read().innerText); }
      catch (e) { failed.push(`${what}: ${e.message}`); }
    };
    const shown = () => [...document.querySelectorAll('.page')].find(p => !p.hidden);
    for (const id of ['today', 'supply', 'growth', 'company', 'map']) {
      for (const k of SUBS[id] ? SUBS[id].items.map(([k]) => k) : [null])
        await step(k ? `${id}/${k}` : id, () => { showPage(id, false); if (k) showSub(id, k); }, shown);
    }
    for (const b of D.businesses)
      await step(b.key, () => openSite(b.key, false), () => document.getElementById('sitePanel'));
    return {text: seen.join('\n'), sites: D.businesses.length, failed};
  });
  assert.deepEqual(await page.evaluate(() => window.bareCalls), [], 'no number formatted in the browser locale');
  assert.deepEqual(failed, [], 'every page and site draws');
  assert.deepEqual(errors, [], 'no script error on the page');
  assert.ok(sites > 0, 'the fixture has sites to open');
  assert.match(text, /\b\d{1,3},\d{3}\b/, 'thousands are grouped with a comma');
  assert.doesNotMatch(text, /\b\d{1,3}\.\d{3}(?![\d%])/, 'no German grouping');
});
