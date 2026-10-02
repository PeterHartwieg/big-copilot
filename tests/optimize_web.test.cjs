const {test, before} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const {gzipSync} = require('node:zlib');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
let optimizePage, optimizeWeb;
before(async () => { ({optimizePage, optimizeWeb} = await import('../tools/optimize_web.mjs')); });

test('inline blocks retain their shared global functions and values', () => {
  const input = '<script>const value = 7; function fromBoard() { return value; }</script>'
    + '<script>globalThis.answer = fromBoard(); globalThis.name = fromBoard.name;</script>';
  const ctx = vm.createContext({});
  const result = optimizePage(input);
  for (const [, code] of result.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(code, ctx);
  assert.equal(ctx.answer, 7);
  assert.equal(ctx.name, 'fromBoard');
});

test('escaped script terminators and HTML comments remain safe in the browser parser', async t => {
  const browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined});
  t.after(() => browser.close());
  const page = await browser.newPage();
  for (const text of ['</script><script>globalThis.injected = true</script>',
    '</SCRIPT><script>globalThis.injected = true</Script>', '<!--<script>text</script>']) {
    const input = '<script>globalThis.text = ' + JSON.stringify(text).replace(/</g, '\\u003c') + ';</script>'
      + '<script>globalThis.after = true;</script>';
    await page.goto('about:blank');
    await page.setContent(optimizePage(input));
    assert.deepEqual(await page.evaluate(() => [globalThis.text, globalThis.injected, globalThis.after]),
      [text, undefined, true]);
  }
});

test('layout reads retain their side effects when restarting animations', () => {
  let reads = 0;
  const ctx = vm.createContext({element: {get offsetWidth() { reads++; return 7; }}});
  const result = optimizePage('<script>void element.offsetWidth; element.offsetWidth;</script>');
  vm.runInContext(result.slice('<script>'.length, -'</script>'.length), ctx);
  assert.equal(reads, 2);
});

test('the assembled page shrinks while markup, styles and external script order stay identical', () => {
  // Deploy leaves index.html optimized. Get the readable page from its source
  // without rewriting the deployment artifact or depending on test order.
  const built = spawnSync(process.env.PYTHON || 'python', ['-c',
    'import build_web; print(build_web.page_html(build_web.release_info()), end="")'],
  {cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  assert.equal(built.status, 0, built.error?.message || built.stderr);
  const input = built.stdout;
  const result = optimizePage(input);
  const withoutCode = html => html.replace(/<script>([\s\S]*?)<\/script>/g, '<script></script>');
  assert.equal(withoutCode(result), withoutCode(input));
  assert.ok(gzipSync(result).length < gzipSync(input).length * 0.8, 'at least 20% smaller compressed HTML');
});

test('a later script compilation failure leaves the deployment artifact intact', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize-web-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'web'));
  const file = path.join(root, 'web', 'index.html');
  const invalid = '<script>globalThis.first = 1;</script><script>const = broken;</script>';
  fs.writeFileSync(file, invalid);
  assert.throws(() => optimizeWeb(root));
  assert.equal(fs.readFileSync(file, 'utf8'), invalid);
});
