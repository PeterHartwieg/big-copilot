// Real HTTP caching and real Pyodide, with only synthetic saves. No route
// interception (which disables Chromium's cache), timing or private fixtures.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {gzipSync} = require('node:zlib');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..'), web = path.join(root, 'web');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const types = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.wasm':'application/wasm', '.zip':'application/zip', '.woff2':'font/woff2',
  '.py':'text/plain', '.svg':'image/svg+xml'};
let browser, server, base, dir, save, variants, active, phase, logs = [];
let legacyHold, legacyRequestArrived;

before(async () => {
  const {optimizeWeb, checkOptimized} = await import('../tools/optimize_web.mjs');
  const raw = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
  const release = JSON.parse(fs.readFileSync(path.join(web, 'version.json'), 'utf8'));
  const pinned = JSON.parse(/window\.LEDGER_ASSETS = (.+?);<\/script>/.exec(raw)[1]);
  // A real broad release stamp for a report-only source patch, applied in
  // memory. Its public script is not requested in an ordinary save opening.
  const reportPatch = '\n// synthetic unrelated report change\n';
  const revised = spawnSync(process.env.PYTHON || 'python', ['-c', `
import builtins, io, os
from unittest.mock import patch
import build_web
original = builtins.open
def changed(file, *args, **kwargs):
    if os.path.normpath(str(file)) == os.path.normpath(os.path.join(build_web.HERE, "web/report.js")) and args and args[0] == "rb":
        with original(file, *args, **kwargs) as fh:
            return io.BytesIO(fh.read() + ${JSON.stringify(reportPatch)}.encode("utf-8"))
    return original(file, *args, **kwargs)
with patch("builtins.open", changed):
    print(build_web.stamp())
`], {cwd:root, encoding:'utf8'});
  assert.equal(revised.status,0,revised.stderr);
  const unrelatedVersion = revised.stdout.trim();
  assert.notEqual(unrelatedVersion,release.version);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-cache-'));
  save = path.join(dir, 'synthetic.hsg');
  const made = spawnSync(process.env.PYTHON || 'python', [path.join(root, 'tests/es3_fixture.py'), save,
    path.join(dir, 'payload.json')], {cwd: root});
  assert.equal(made.status, 0, made.stderr?.toString());
  function variant(version, changed, board = false, legacy = false, style = false) {
    const manifest = structuredClone(pinned), assets = new Map();
    for (const [name, entry] of Object.entries(manifest.files)) {
      let bytes = fs.readFileSync(path.join(web, entry.url));
      if (name === changed) {
        if (name.endsWith('.py')) bytes = Buffer.concat([bytes, Buffer.from('\nASSET_CACHE_FIXTURE = 1\n')]);
        else {
          const table = JSON.parse(bytes);
          table.items['ba:itemname_assetcachefixture'] = {p: 123, t: 1};
          bytes = Buffer.from(JSON.stringify(table));
        }
        entry.sha256 = hash(bytes);
        entry.url = `assets/${entry.sha256}/${name}`;
      }
      assets.set('/' + entry.url, bytes);
    }
    let worker = fs.readFileSync(path.join(web, manifest.worker.url));
    if (changed === 'worker.js') {
      worker = Buffer.concat([worker, Buffer.from('\n// synthetic worker-only change\n')]);
      manifest.worker.sha256 = hash(worker);
      manifest.worker.url = `assets/${manifest.worker.sha256}/worker.js`;
    }
    assets.set('/' + manifest.worker.url, worker);
    const metadata = Buffer.from(JSON.stringify(manifest) + '\n');
    assets.set(`/assets/manifest-${hash(metadata)}.json`, metadata);
    let page = raw.replaceAll(release.version, version)
      .replace(/window\.LEDGER_ASSETS = .+?;<\/script>/, 'window.LEDGER_ASSETS = ' + JSON.stringify(manifest) + ';</script>');
    if (legacy) page=page.replace(/<script>window\.LEDGER_ASSETS = .+?;<\/script>\n/, '');
    if (board) {
      const at = page.lastIndexOf('</script>');
      page = page.slice(0, at) + '\nglobalThis.assetCacheFixture = 1;\n' + page.slice(at);
    }
    if (style) {
      const block = [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)].reduce((a,b)=>a[1].length>b[1].length?a:b);
      const at = block.index + block[0].lastIndexOf('</style>');
      page = page.slice(0, at) + '\n/* synthetic stylesheet change */\n' + page.slice(at);
    }
    // Write and serve the actual optimizer outputs, then independently check
    // the emitted set. No inline-only shortcut can pass this journey.
    const site = path.join(dir, version);
    fs.mkdirSync(path.join(site, 'web'), {recursive:true});
    fs.writeFileSync(path.join(site, 'web/index.html'), page);
    for (const [url, bytes] of assets) {
      const file = path.join(site, 'web', url);
      fs.mkdirSync(path.dirname(file), {recursive:true});
      fs.writeFileSync(file, bytes);
    }
    const output = optimizeWeb(site);
    assert.deepEqual(checkOptimized(site, page), []);
    for (const url of output.assets.keys()) assets.set('/' + url, fs.readFileSync(path.join(site, 'web', url)));
    return {manifest, site, assets, html:fs.readFileSync(path.join(site, 'web/index.html')),
      release:{...release, version}};
  }
  variants = {a:variant(release.version), unrelated:variant(unrelatedVersion),
    python:variant('python-change', 'ba_dashboard.py'), data:variant('data-change', 'ba_item_prices.json'),
    board:variant('board-change', null, true), worker:variant('worker-change', 'worker.js'),
    legacy:variant('previous-stamped-page', null, false, true)};
  variants.style=variant('style-change', null, false, false, true);
  const styleUrl=[...variants.a.assets.keys()].find(url=>/^\/assets\/board-.+\.css$/.test(url));
  variants.missingStyle={...variants.a,assets:new Map(variants.a.assets)};
  variants.missingStyle.assets.delete(styleUrl);
  variants.badStyleIntegrity={...variants.a,assets:new Map(variants.a.assets)};
  variants.badStyleIntegrity.assets.set(styleUrl,Buffer.concat([variants.a.assets.get(styleUrl),Buffer.from('\n/* altered stylesheet body */\n')]));
  const boardUrl=[...variants.a.assets.keys()].find(url=>/^\/assets\/board-.+\.js$/.test(url));
  variants.missingBoard={...variants.a,assets:new Map(variants.a.assets)};
  variants.missingBoard.assets.delete(boardUrl);
  variants.badIntegrity={...variants.a,assets:new Map(variants.a.assets)};
  variants.badIntegrity.assets.set(boardUrl,Buffer.concat([variants.a.assets.get(boardUrl),Buffer.from('\n// altered hosted body\n')]));
  const unsupported=Buffer.from('globalThis.assetCacheFixture = 1;'),unsupportedHash=hash(unsupported);
  const unsupportedUrl=`/assets/board-${unsupportedHash}.js`;
  variants.uninitializedBoard={...variants.a,assets:new Map(variants.a.assets),html:Buffer.from(variants.a.html.toString().replace(
    /<script src="assets\/board-[a-f0-9]{64}\.js" integrity="[^"]+" data-board-asset>/,
    `<script src="${unsupportedUrl.slice(1)}" integrity="sha256-${createHash('sha256').update(unsupported).digest('base64')}" data-board-asset>`))};
  variants.uninitializedBoard.assets.delete(boardUrl);
  variants.uninitializedBoard.assets.set(unsupportedUrl,unsupported);
  variants.oldBytes={...variants.a,oldBytes:true};
  variants.failedRuntime={...variants.a,failedRuntime:true};
  const oldWorker=fs.readFileSync(path.join(root,'tests/fixtures/legacy_worker_53497965.js'));
  // Changes in metadata do not alter the coarse hosted JS/CSS blocks.
  for (const version of ['unrelated','python','data'])
    assert.deepEqual([...variants[version].assets.keys()].filter(u=>u.includes('/board-')),
      [...variants.a.assets.keys()].filter(u=>u.includes('/board-')));
  const rules = [];
  for (const line of fs.readFileSync(path.join(web, '_headers'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {rules.push({pattern:line.trim(), headers:{}}); continue;}
    const at = line.indexOf(':'); rules.at(-1).headers[line.slice(0,at).trim()] = line.slice(at+1).trim();
  }
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'), pathname = decodeURIComponent(url.pathname);
    let current = variants[active];
    if(current.oldBytes && pathname.startsWith('/py/') && legacyHold) {
      legacyRequestArrived?.();
      await legacyHold;
      current=variants[active];
    }
    const headers = {};
    for (const rule of rules) if (rule.pattern.endsWith('*') ? pathname.startsWith(rule.pattern.slice(0,-1)) : pathname === rule.pattern)
      Object.assign(headers, rule.headers);
    if(current.failedRuntime && pathname.startsWith('/pyodide/')) {
      logs.push({phase,url:req.url,status:503,body:0});
      res.writeHead(503,{...headers,'Cache-Control':'no-store'}); return res.end();
    }
    let bytes;
    if (pathname.startsWith('/api/')) bytes = Buffer.from('{}');
    else if (pathname === '/legacy-bootstrap') bytes=Buffer.from('<!doctype html><html><body>Synthetic legacy startup</body></html>');
    else if (pathname === '/' || pathname === '/index.html') bytes = current.html;
    else if (pathname === '/version.json') bytes = Buffer.from(JSON.stringify(current.release));
    else if (pathname.startsWith('/assets/')) bytes = current.assets.get(pathname);
    else if(pathname.startsWith('/py/')) {
      const entry=current.manifest.files[pathname.split('/').at(-1)];
      if(entry) bytes=current.assets.get('/'+entry.url);
      // Reproduce the actual pre-migration policy when priming old bytes;
      // new no-store headers cannot invalidate responses already cached.
      if(current.oldBytes) headers['Cache-Control']='public, max-age=31536000, immutable';
    }
    else if(pathname==='/worker.js' && current.oldBytes) {
      bytes=oldWorker;
    }
    else {
      const file = path.resolve(web, '.' + pathname);
      if (file.startsWith(web + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) bytes = fs.readFileSync(file);
      if (bytes && pathname === '/report.js' && active === 'unrelated') bytes = Buffer.concat([bytes,Buffer.from(reportPatch)]);
    }
    if (!bytes) {
      logs.push({phase, url:req.url, status:404, body:0});
      res.writeHead(404, {...headers, 'Cache-Control':'no-store'}); return res.end();
    }
    const digest = hash(bytes), etag = `"${digest}"`;
    Object.assign(headers, {'Content-Type':types[path.extname(pathname)] || 'text/html', ETag:etag});
    // The same conservative unstated-policy assumption as the audit: bodies
    // without an explicit policy revalidate, independent of CDN defaults.
    headers['Cache-Control'] ||= 'public, max-age=0, must-revalidate';
    if (req.headers['if-none-match'] === etag) {
      logs.push({phase, url:req.url, status:304, body:0, digest});
      res.writeHead(304, headers); return res.end();
    }
    const zipped = gzipSync(bytes);
    logs.push({phase, url:req.url, status:200, body:zipped.length, digest});
    res.writeHead(200, {...headers, 'Content-Encoding':'gzip', Vary:'Accept-Encoding', 'Content-Length':zipped.length});
    res.end(zipped);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => {await browser?.close(); await new Promise(resolve=>server ? server.close(resolve) : resolve());
  if (dir) fs.rmSync(dir, {recursive:true, force:true});});

async function context(t, delayed = false) {
  const ctx = await browser.newContext();
  ctx.setDefaultTimeout(0); ctx.setDefaultNavigationTimeout(0);
  t.after(()=>ctx.close());
  if (delayed) await ctx.addInitScript(() => {
    const RealWorker = window.Worker, held = [];
    // Hold only creation, preserving the old page's exact URL and init
    // message; release after the server switches deployments.
    window.Worker = class {
      constructor(url, options) {this.url=url; this.options=options; this.messages=[]; held.push(this);}
      postMessage(message, transfer) {if(this.real)this.real.postMessage(message,transfer); else this.messages.push([message,transfer]);}
      terminate(){this.real?.terminate();}
    };
    window.releaseWorkers = () => {for(const stub of held){
      stub.real=new RealWorker(stub.url,stub.options);
      for(const name of ['onmessage','onerror','onmessageerror']) stub.real[name]=stub[name];
      for(const [message,transfer] of stub.messages) stub.real.postMessage(message,transfer);
    }};
  });
  return ctx;
}
async function load(ctx, name) {
  active = name; phase = name;
  const page = await ctx.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.locator('#savePick').setInputFiles(save);
  await page.waitForFunction(()=>document.body.classList.contains('has-board') && hasData());
  assert.deepEqual(errors,[]);
  return page;
}
const traffic = name => logs.filter(row=>row.phase===name);

test('cold, warm and changed releases reuse exact content bodies in a real browser', async t => {
  const ctx = await context(t);
  for (const [version, label] of [['a','cold-a'],['a','warm-a'],['unrelated','unrelated'],
    ['unrelated','warm-unrelated'],['python','python'],['data','data'],['board','board']]) {
    // Set the phase after navigation starts; load() normally labels by version.
    active = version;
    const page = await ctx.newPage(), errors=[];
    phase = label;
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);
    await page.locator('#savePick').setInputFiles(save);
    await page.waitForFunction(()=>document.body.classList.contains('has-board') && hasData());
    assert.deepEqual(errors,[]);
    await page.close();
  }
  const bodies = label => traffic(label).filter(row=>row.body>0);
  const py = rows => rows.filter(row=>/\/(?:ba_[\w]+\.py|[\w]+\.json)$/.test(new URL(row.url,base).pathname) && row.url.startsWith('/assets/'));
  assert.equal(py(bodies('cold-a')).length, 8);
  for (const label of ['warm-a','unrelated','warm-unrelated']) {
    assert.equal(traffic(label).filter(row=>row.url.startsWith('/assets/')).length, 0, 'immutable assets never revalidate');
    assert.equal(traffic(label).filter(row=>row.url.startsWith('/pyodide/')).length, 0);
  }
  assert.deepEqual(py(bodies('python')).map(row=>new URL(row.url,base).pathname.split('/').at(-1)), ['ba_dashboard.py']);
  assert.deepEqual(py(bodies('data')).map(row=>new URL(row.url,base).pathname.split('/').at(-1)), ['ba_item_prices.json']);
  assert.equal(bodies('board').filter(row=>/\/assets\/board-.+\.js$/.test(row.url)).length, 1);
  assert.equal(bodies('board').filter(row=>/\/assets\/board-.+\.css$/.test(row.url)).length, 0);
  const summary = Object.fromEntries(['cold-a','warm-a','unrelated','warm-unrelated','python','data','board'].map(label=>
    [label,{requests:traffic(label).length, bodyBytes:bodies(label).reduce((n,row)=>n+row.body,0),
      pythonBodyBytes:py(bodies(label)).reduce((n,row)=>n+row.body,0)}]));
  console.log('asset cache transfer evidence ' + JSON.stringify(summary));
  if (process.env.ASSET_CACHE_EVIDENCE) fs.writeFileSync(process.env.ASSET_CACHE_EVIDENCE, JSON.stringify({summary,logs},null,2));
});

for (const change of ['python','data']) for (const priming of ['cold','partial','changed']) {
  const primedChanged = priming === 'changed';
  test(`old page with ${priming} A cache after ${change} deploy ${primedChanged ? 'starts coherent A' : 'asks for reload'}`, async t => {
    const ctx = await context(t, true);
    active='a'; phase=`old-${change}-${priming}`;
    const page=await ctx.newPage(); await page.goto(base);
    const changed=change==='python' ? 'ba_dashboard.py' : 'ba_item_prices.json';
    const names=priming === 'cold' ? [] : ['ba_save.py','ba_facts.py',...(primedChanged?[changed]:[])];
    await page.evaluate(async names=>{for(const name of names){
      const response=await fetch(window.LEDGER_ASSETS.files[name].url); await response.arrayBuffer();
    }},names);
    active=change;
    await page.evaluate(()=>window.releaseWorkers());
    await page.locator('#savePick').setInputFiles(save);
    if(primedChanged) await page.waitForFunction(()=>document.body.classList.contains('has-board') && hasData());
    else {
      await page.waitForFunction(()=>document.getElementById('srcStatus').textContent.includes('could not finish'));
      assert.match(await page.locator('#srcMeta').textContent(), /Reload/i);
      assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('has-board')),false);
      assert.ok(traffic(phase).some(row=>row.status===404 && row.url.endsWith('/'+changed)));
    }
  });
}

test('a removed old worker identity also asks for reload', async t => {
  const ctx=await context(t,true); active='a'; phase='missing-worker';
  const page=await ctx.newPage(); await page.goto(base);
  active='worker'; await page.evaluate(()=>window.releaseWorkers());
  await page.waitForFunction(()=>document.getElementById('srcStatus').textContent.includes('could not finish'));
  assert.match(await page.locator('#srcMeta').textContent(), /Reload/i);
  assert.ok(traffic('missing-worker').some(row=>row.status===404 && row.url.endsWith('/worker.js')));
});

test('an open worker continues its installed A release after a Python deployment', async t => {
  const ctx=await context(t), page=await load(ctx,'a');
  active='python'; phase='open-worker';
  await page.locator('#savePick').setInputFiles(save);
  await page.waitForFunction(()=>document.body.classList.contains('has-board') && !document.getElementById('srcStrip').classList.contains('reading'));
  assert.equal(traffic('open-worker').filter(row=>row.url.startsWith('/assets/')).length,0);
});

for (const legacyWorker of [true,false]) {
  test(`${legacyWorker ? 'an old app starting a stamped worker without init' : 'an old stamped page receiving the new app'} offers reload without a busy reader`, async t => {
    const ctx=await context(t);
    if(legacyWorker) await ctx.addInitScript(()=>{
      const RealWorker=window.Worker;
      window.Worker=class extends RealWorker {
        constructor(){super('worker.js?v=previous-release',{type:'module'});}
        postMessage(message,transfer){if(message.kind!=='init')super.postMessage(message,transfer);}
      };
    });
    active=legacyWorker ? 'a' : 'legacy'; phase=legacyWorker ? 'legacy-worker' : 'legacy-page';
    const page=await ctx.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(()=>document.getElementById('srcStatus').textContent.includes('could not finish'));
    assert.match(await page.locator('#srcMeta').textContent(),/Reload/i);
    assert.equal(await page.locator('#reloadBtn').isVisible(),true);
    assert.equal(await page.locator('#srcProg').isVisible(),false);
    await page.locator('#savePick').setInputFiles(save);
    assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('has-board')),false);
    assert.equal(await page.locator('#srcProg').isVisible(),false);
    assert.equal(traffic(phase).filter(r=>r.url.includes('/pyodide/') || r.url.endsWith('.py')).length,0);
    assert.deepEqual(errors,[]);
    if(legacyWorker) assert.ok(traffic(phase).some(r=>r.url==='/worker.js?v=previous-release' && r.status===200));
    else {
      assert.equal(traffic(phase).filter(r=>r.url.endsWith('/worker.js')).length,0);
      active='a'; phase='legacy-recovery';
      await Promise.all([page.waitForNavigation(),page.locator('#reloadBtn').click()]);
      await page.locator('#savePick').setInputFiles(save);
      await page.waitForFunction(()=>document.body.classList.contains('has-board') && hasData());
    }
  });
}

for(const broken of ['missingBoard','badIntegrity','uninitializedBoard']) {
  test(`${broken} hosted board script fails safely for save, restored source and no-save navigation`,async t=>{
    const ctx=await context(t);
    await ctx.addInitScript(()=>{
      if (!sessionStorage.getItem('asset-failure-link-seeded')) {
        localStorage.setItem('ledger_link','http://127.0.0.1:18232');
        sessionStorage.setItem('asset-failure-link-seeded','1');
      }
    });
    active=broken; phase=broken;
    const page=await ctx.newPage(), requests=[];
    page.on('request',request=>requests.push(request.url()));
    await page.goto(base+'/#wiki');
    await page.waitForFunction(()=>document.getElementById('srcStatus').textContent.includes('could not finish'));
    assert.match(await page.locator('#srcMeta').textContent(),/Reload/i);
    assert.equal(await page.locator('#reloadBtn').isVisible(),true);
    assert.equal(await page.locator('#srcProg').isVisible(),false);
    assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('has-board')),false);
    await page.locator('#savePick').setInputFiles(save);
    await page.evaluate(()=>{location.hash='#map';});
    await page.evaluate(()=>{location.hash='#wiki';});
    assert.equal(await page.locator('#lgWikiLink').count(),0,'a missing board cannot expose its no-save browser');
    assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('has-board')),false);
    assert.equal(await page.locator('#srcProg').isVisible(),false);
    assert.ok(!requests.some(url=>url.includes('/worker.js') || url.includes('/pyodide/') || url.includes(':18232/')));
    assert.ok(traffic(broken).some(row=>/^\/assets\/board-.+\.js$/.test(row.url) && row.status===(broken==='missingBoard' ? 404 : 200)));
    // A current release supplies a fresh content path even if a corrupted old
    // response remains in the browser cache. The reload control stays wired.
    active='board'; phase=broken+'-reload';
    await page.evaluate(()=>localStorage.removeItem('ledger_link'));
    await Promise.all([page.waitForNavigation(),page.locator('#reloadBtn').click()]);
    await page.locator('#savePick').setInputFiles(save);
    await page.waitForFunction(()=>document.body.classList.contains('has-board') && hasData());
  });
}

for (const broken of ['missingStyle','badStyleIntegrity']) {
  test(`a ${broken} hosted stylesheet keeps styled reload recovery and refuses every board entry`,async t=>{
    const ctx=await context(t),page=await ctx.newPage(),requests=[];
    page.on('request',request=>requests.push(request.url()));
    await ctx.addInitScript(()=>{
      if (!sessionStorage.getItem('asset-failure-link-seeded')) {
        localStorage.setItem('ledger_link','http://127.0.0.1:18232');
        sessionStorage.setItem('asset-failure-link-seeded','1');
      }
      window.assetFailureBoardCalls=[];
      let board;
      // Observe real board entry/render functions before DOMContentLoaded can
      // open a cold wiki route. No production code or browser events are stubbed.
      Object.defineProperty(window,'BigCopilotBoard',{configurable:true,get:()=>board,set(value){
        board=value;
        for(const name of ['bootShell','showPage']) {
          const original=window[name];
          window[name]=function(...args){window.assetFailureBoardCalls.push(name);return original.apply(this,args);};
        }
        const original=value.browseWiki;
        value.browseWiki=function(...args){window.assetFailureBoardCalls.push('browseWiki');return original.apply(this,args);};
      }});
    });
    active=broken; phase=broken;
    await page.goto(base+'/#wiki');
    assert.equal(await page.evaluate(()=>typeof BigCopilotBoard), 'object', 'the board script loaded successfully');
    assert.deepEqual(await page.evaluate(()=>window.assetFailureBoardCalls),[],'cold wiki route must not boot or render the failed board');
    assert.match(await page.locator('#srcStatus').textContent(),/could not finish/);
    assert.equal(await page.evaluate(()=>window.LEDGER_ASSET_FAILURE),true,'head handler caught stylesheet failure before the shell loaded');
    assert.equal(await page.locator('#reloadBtn').isVisible(),true);
    assert.equal(await page.locator('#srcProg').isVisible(),false);
    const colors=await page.evaluate(()=>({background:getComputedStyle(document.body).backgroundColor,
      foreground:getComputedStyle(document.body).color,button:getComputedStyle(document.getElementById('reloadBtn')).backgroundColor}));
    assert.equal(colors.background,'rgb(13, 16, 15)');
    assert.equal(colors.foreground,'rgb(233, 236, 230)');
    assert.equal(colors.button,'rgb(67, 192, 122)');
    await page.locator('#savePick').setInputFiles(save);
    for(const hash of ['#map','#wiki']) await page.evaluate(hash=>new Promise(resolve=>{
      window.addEventListener('hashchange',()=>resolve(),{once:true}); location.hash=hash;
    }),hash);
    await page.locator('#lgWikiLink').click();
    assert.deepEqual(await page.evaluate(()=>window.assetFailureBoardCalls),[],'hash events and wiki button must not reach board navigation');
    assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('has-board')),false);
    assert.equal(await page.locator('#srcProg').isVisible(),false);
    assert.ok(!requests.some(url=>url.includes('/worker.js') || url.includes('/pyodide/') || url.includes(':18232/')));
    assert.ok(traffic(broken).some(row=>/^\/assets\/board-.+\.css$/.test(row.url) && row.status===(broken==='missingStyle'?404:200)));
    // A new style content path recovers even if the rejected response is cached.
    active='style'; phase=broken+'-reload';
    await page.evaluate(()=>localStorage.removeItem('ledger_link'));
    await Promise.all([page.waitForNavigation(),page.locator('#reloadBtn').click()]);
    await page.locator('#savePick').setInputFiles(save);
    await page.waitForFunction(()=>document.body.classList.contains('has-board') && hasData());
    assert.equal(await page.evaluate(()=>window.LEDGER_ASSET_FAILURE),false);
  });
}

test('actual pre-manifest worker starting across deploy with a partial old cache exposes the documented migration window',async t=>{
  const ctx=await context(t),page=await ctx.newPage();
  active='oldBytes'; phase='legacy-bytes-prime';
  await page.goto(base+'/legacy-bootstrap');
  const primed=await page.evaluate(async()=>{
    const results=[];
    for(const url of ['py/ba_save.py','py/ba_dashboard.py']) {
      const response=await fetch('/'+url+'?v=legacy-A');
      results.push([url,response.status,(await response.arrayBuffer()).byteLength]);
    }
    return results;
  });
  assert.ok(primed.every(row=>row[1]===200 && row[2]>0));
  let release;
  legacyHold=new Promise(resolve=>{release=resolve;});
  const requested=new Promise(resolve=>{legacyRequestArrived=resolve;});
  t.after(()=>{release(); legacyHold=null; legacyRequestArrived=null;});
  phase='legacy-bytes-start';
  await page.evaluate(()=>{
    window.legacyReady=new Promise((resolve,reject)=>{
      const worker=new Worker('/worker.js?v=legacy-A',{type:'module'});
      window.legacyWorker=worker;
      worker.onmessage=({data})=>{
        if(data.kind==='startup-failed') reject(new Error(data.error));
        if(data.kind==='progress' && data.stage==='ready') resolve();
      };
      worker.onerror=event=>reject(new Error(event.message));
    });
  });
  await requested;
  assert.ok(traffic('legacy-bytes-start').some(row=>row.url==='/worker.js?v=legacy-A' && row.status===200));
  active='data'; phase='legacy-bytes-after-deploy'; release();
  await page.evaluate(()=>window.legacyReady);
  const rows=traffic('legacy-bytes-after-deploy');
  assert.equal([...traffic('legacy-bytes-start'),...rows].filter(row=>row.url.startsWith('/py/ba_save.py') || row.url.startsWith('/py/ba_dashboard.py')).length,0,
    'actual running worker A reused its cached code despite the new no-store headers');
  const data=rows.find(row=>row.url==='/py/ba_item_prices.json?v=legacy-A');
  assert.equal(data?.status,200);
  assert.equal(data.digest,variants.data.manifest.files['ba_item_prices.json'].sha256,
    'uncached old stamped data URL serves the current B bytes: this historical caller has no digest check');
  await page.evaluate(()=>window.legacyWorker.terminate());
});

test('a registered board still opens its no-save wiki after Python startup fails',async t=>{
  const ctx=await context(t),page=await ctx.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  active='failedRuntime'; phase='failed-reader-wiki';
  await page.goto(base);
  await page.waitForFunction(()=>document.getElementById('srcStatus').textContent.includes('could not finish'));
  assert.ok(traffic(phase).some(row=>row.url.includes('/pyodide/') && row.status===503));
  assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('has-board')),false);
  await page.locator('#savePick').setInputFiles(save);
  assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('has-board')),false);
  assert.equal(await page.locator('#srcProg').isVisible(),false);
  await page.locator('#lgWikiLink').click();
  await page.waitForFunction(()=>document.body.classList.contains('has-board') && !!document.querySelector('#wikiRoot .wk-cat'));
  assert.equal(await page.evaluate(()=>hasData()),false,'wiki browsing does not require a successful Python build');
  assert.equal(await page.locator('#reloadBtn').isVisible(),true);
  assert.deepEqual(errors,[]);
});
