// The page under its own web/_headers, the way Cloudflare serves it: the real
// Pyodide worker reads a synthetic save (tests/es3_fixture.py) until the board
// renders, the Map and Wiki pages load their data, and the game link reads
// tools/game_link_mock.py on loopback. Not one Content-Security-Policy
// violation is allowed, on the page or in its console. tests/test_headers.py
// checks the policy's text. Install Playwright and its Chromium browser to run;
// NODE_PATH may point at an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawn, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
const PYTHON = process.env.PYTHON || 'python';
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.zip': 'application/zip',
  '.woff2': 'font/woff2', '.py': 'text/plain'};

// web/_headers as Cloudflare reads it: a path pattern (a trailing * matches any
// rest) followed by indented "Name: value" lines. Every matching rule applies.
function headerRules() {
  const rules = [];
  for (const line of fs.readFileSync(path.join(web, '_headers'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { rules.push({pattern: line.trim(), headers: {}}); continue; }
    const at = line.indexOf(':');
    rules.at(-1).headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return rules;
}
function headersFor(pathname, rules) {
  const out = {};
  for (const {pattern, headers} of rules) {
    const hit = pattern.endsWith('*') ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern;
    if (hit) Object.assign(out, headers);
  }
  return out;
}

let server, base, mock, mockUrl, browser, dir, save;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-'));
  save = path.join(dir, 'csp.hsg');
  const made = spawnSync(PYTHON, [path.join(root, 'tests', 'es3_fixture.py'), save, path.join(dir, 'payload.json')], {cwd: root});
  assert.equal(made.status, 0, made.stderr?.toString());
  const rules = headerRules();
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(web, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (file.startsWith(web) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(web) || !fs.existsSync(file)) { res.writeHead(404, headersFor(pathname, rules)); return res.end(); }
    res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', ...headersFor(pathname, rules)});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  mock = spawn(PYTHON, ['-u', path.join(root, 'tools', 'game_link_mock.py'), save, '--port', '0',
    '--character', 'default', '--company', 'Link Co', '--day', '34', '--hour', '14'], {cwd: root});
  mockUrl = await new Promise((resolve, reject) => {
    let out = '';
    mock.stdout.on('data', (chunk) => {
      out += chunk;
      const m = /at (http:\/\/127\.0\.0\.1:\d+)\//.exec(out);
      if (m) resolve(m[1]);
    });
    mock.stderr.on('data', (chunk) => { out += chunk; });
    mock.on('exit', (code) => reject(new Error(`the mock exited (${code}): ${out}`)));
  });
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => {
  await browser?.close();
  mock?.kill();
  server?.close();
  fs.rmSync(dir, {recursive: true, force: true});
});

async function watched(t) {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}});
  t.after(() => context.close());
  const found = {violations: [], console: [], errors: []};
  await context.exposeBinding('__csp', (_src, v) => found.violations.push(v));
  await context.addInitScript(() => addEventListener('securitypolicyviolation',
    (e) => window.__csp(`${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`)));
  const page = await context.newPage();
  // Chromium also reports a refusal in the console, the worker's included.
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) found.console.push(m.text()); });
  page.on('pageerror', (e) => found.errors.push(e.message));
  return {page, found};
}

test('the board boots Pyodide and draws its pages under the CSP', async (t) => {
  const {page, found} = await watched(t);
  const res = await page.goto(base + '/');
  assert.match(res.headers()['content-security-policy'] || '', /frame-ancestors 'none'/, 'the server applies web/_headers');
  await page.locator('#savePick').setInputFiles(save);
  await until(page, found, () => document.body.classList.contains('has-board'));
  // The Map (locations, background image as a blob) and the Wiki (its data).
  for (const id of ['map', 'wiki']) {
    await page.locator(`nav [data-id="${id}"]`).first().click();
    await page.waitForLoadState('networkidle');
  }
  assert.deepEqual(found, {violations: [], console: [], errors: []});
  // The listener hears a refusal: a fetch to another host is one.
  // The CSP refuses it before any request leaves the browser.
  await page.evaluate(() => fetch('https://example.com/').catch(() => {}));
  await expectViolation(found, 'connect-src');
});

test('the game link reads the mod on loopback under the CSP', async (t) => {
  const {page, found} = await watched(t);
  await page.goto(`${base}/#link=${mockUrl}`);
  await page.locator('#linkBtn').click();
  await until(page, found, () => document.body.classList.contains('has-board')
    && document.getElementById('srcStatus').textContent === 'Up to date');
  assert.deepEqual(found, {violations: [], console: [], errors: []});
});

// Waits for the page to reach `ready`, but a refusal ends the wait at once: a
// blocked worker import or wasm compile would otherwise only show as a board
// that never appears.
async function until(page, found, ready) {
  const clean = () => !found.violations.length && !found.console.length && !found.errors.length;
  for (let waited = 0; clean() && !(await page.evaluate(ready)); waited += 250) {
    assert.ok(waited < 120000, 'the page never got there');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.deepEqual(found, {violations: [], console: [], errors: []});
}

async function expectViolation(found, directive) {
  for (let i = 0; i < 50 && !found.violations.some((v) => v.startsWith(directive)); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(found.violations.some((v) => v.startsWith(directive)), `no ${directive} violation was heard: ${JSON.stringify(found)}`);
}
