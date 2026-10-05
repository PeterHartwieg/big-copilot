const {test, before} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const {gzipSync} = require('node:zlib');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
let optimizePage, optimizeWeb, hostedPage, checkOptimized;
before(async () => { ({optimizePage, optimizeWeb, hostedPage, checkOptimized} = await import('../tools/optimize_web.mjs')); });

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

test('optimizer CLI finds esbuild through NODE_PATH without local node_modules', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'optimize with spaces '));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'tools'));
  fs.mkdirSync(path.join(root, 'web'));
  fs.copyFileSync(path.join(__dirname, '../tools/optimize_web.mjs'), path.join(root, 'tools', 'optimize_web.mjs'));
  const shared = path.join(root, 'shared dependencies');
  fs.mkdirSync(shared);
  fs.symlinkSync(path.dirname(require.resolve('esbuild/package.json')), path.join(shared, 'esbuild'), process.platform === 'win32' ? 'junction' : 'dir');
  const file = path.join(root, 'web', 'index.html');
  const input = '<script>globalThis.answer = 1 + 2;</script>';
  fs.writeFileSync(file, input);
  const result = spawnSync(process.execPath, [path.join(root, 'tools', 'optimize_web.mjs')], {
    encoding: 'utf8', env: {...process.env, NODE_PATH: shared},
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.equal(fs.readFileSync(file, 'utf8'), optimizePage(input));
  assert.match(result.stdout, /optimized web\/index.html/);
  assert.equal(fs.existsSync(path.join(root, 'node_modules')), false);
});

test('optimizer CLI checks LF assembly bytes through Python stdout on every platform', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'optimized CLI bytes '));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'tools')); fs.mkdirSync(path.join(root,'web'));
  const cli=path.join(root,'tools/optimize_web.mjs');
  fs.copyFileSync(path.join(__dirname,'../tools/optimize_web.mjs'),cli);
  // Match an ordinary npm ci checkout: the copied CLI has local esbuild and
  // must not depend on a developer's ambient NODE_PATH in either child.
  fs.mkdirSync(path.join(root,'node_modules'));
  fs.symlinkSync(path.dirname(require.resolve('esbuild/package.json')),path.join(root,'node_modules/esbuild'),
    process.platform==='win32' ? 'junction' : 'dir');
  const childEnv={...process.env}; delete childEnv.NODE_PATH;
  const raw='<style>\n:root{--fixture:"'+ 'fixture'.repeat(10000)+'"}\n</style>\n<script>globalThis.answer = 3;</script>\n';
  fs.writeFileSync(path.join(root,'web/index.html'),raw);
  fs.writeFileSync(path.join(root,'build_web.py'),
    'HTML = '+JSON.stringify(raw)+'\ndef release_info(): return {}\ndef page_html(release): return HTML\n');
  for(const args of [[],['--check']]) {
    const result=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',env:childEnv});
    assert.equal(result.status,0,result.error?.message || result.stderr);
  }
});

test('hosted assets hash shipped bytes, preserve classic order and ignore unrelated releases', t => {
  const {createHash} = require('node:crypto');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-assets-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'web'));
  const block = 'const sharedBoardValue = "' + 'board'.repeat(16000) + '";';
  const style = ':root{--test:"' + 'css'.repeat(24000) + '"}';
  const raw = '<style>' + style + '</style><script>globalThis.release = "a";</script>'
    + '<script>' + block + '</script><script>globalThis.answer = sharedBoardValue.length;</script>';
  fs.writeFileSync(path.join(root, 'web/index.html'), raw);
  const output = optimizeWeb(root);
  assert.equal(output.assets.size, 2);
  assert.deepEqual(checkOptimized(root, raw), []);
  assert.deepEqual([...hostedPage(raw.replace('release = "a"', 'release = "b"')).assets.keys()], [...output.assets.keys()]);
  const context = vm.createContext({});
  for (const [, src, inline] of output.html.matchAll(/<script(?: src="([^"]+)" integrity="[^"]+" data-board-asset)?>([\s\S]*?)<\/script>/g))
    vm.runInContext(src ? output.assets.get(src).toString() : inline, context);
  assert.equal(context.answer, 80000);
  for (const [url, bytes] of output.assets) {
    const digest = createHash('sha256').update(bytes).digest();
    assert.ok(url.includes(digest.toString('hex')));
    assert.ok(output.html.includes(`integrity="sha256-${digest.toString('base64')}"`));
    const target = path.join(root, 'web', url);
    fs.unlinkSync(target);
    assert.ok(checkOptimized(root, raw).includes('web/' + url), 'missing asset fails');
    fs.writeFileSync(target, Buffer.concat([bytes, Buffer.from('changed')]));
    assert.ok(checkOptimized(root, raw).includes('web/' + url), 'modified asset fails');
    fs.writeFileSync(target, bytes);
  }
  assert.ok(checkOptimized(root, raw.replace('board'.repeat(16000), 'other'.repeat(16000))).length,
    'a changed script cannot pass an older artifact set');
});

test('optimized checks cover missing and modified pinned metadata and dependencies', t => {
  const {createHash} = require('node:crypto');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'optimized-manifest-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'web'));
  const worker=Buffer.from('worker bytes'), code=Buffer.from('python bytes');
  const manifest={schema:1,worker:{url:`assets/${hash(worker)}/worker.js`,sha256:hash(worker)},
    files:{'ba_dashboard.py':{url:`assets/${hash(code)}/ba_dashboard.py`,sha256:hash(code)}}};
  const metadata=Buffer.from(JSON.stringify(manifest)+'\n');
  const url=`assets/manifest-${hash(metadata)}.json`;
  const raw='<script>window.LEDGER_ASSETS = '+JSON.stringify(manifest)+';</script>';
  const outputs=new Map([[url,metadata],[manifest.worker.url,worker],[manifest.files['ba_dashboard.py'].url,code]]);
  fs.writeFileSync(path.join(root,'web/index.html'),raw);
  for(const [name,bytes] of outputs){
    const target=path.join(root,'web',name); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,bytes);
  }
  optimizeWeb(root);
  assert.deepEqual(checkOptimized(root,raw),[]);
  for(const [name,bytes] of outputs){
    const target=path.join(root,'web',name);
    fs.unlinkSync(target); assert.ok(checkOptimized(root,raw).includes('web/'+name));
    fs.writeFileSync(target,'stale release'); assert.ok(checkOptimized(root,raw).includes('web/'+name));
    fs.writeFileSync(target,bytes);
  }
});
