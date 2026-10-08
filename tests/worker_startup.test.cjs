// Exercise startup with unresolved downloads: no wall-clock performance assertions.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const hash = text => createHash('sha256').update(text).digest('hex');
const buffer = text => new TextEncoder().encode(text).buffer;

const source = fs.readFileSync(path.join(__dirname, '..', 'web/worker.js'), 'utf8');
const files = ['ba_save.py', 'ba_dashboard.py', 'ba_facts.py', 'ba_mods.py', 'gametext.json', 'ba_buildings.json',
  'ba_demand_curves.json', 'ba_item_prices.json', 'ba_store_rules.json'];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return {promise, resolve, reject};
};
const flush = () => new Promise(resolve => setImmediate(resolve));

test('legacy stamped callers without init fail immediately and every queued caller receives the startup error', async () => {
  const messages = [];
  const context = vm.createContext({URL, performance, ArrayBuffer,
    console: {error() {}}, self: {location: {href: 'https://worker.test/worker.js?v=previous-release'}},
    postMessage: message => messages.push(message),
    fetch() {assert.fail('legacy protocol must not download mutable files');},
    importRuntime() {assert.fail('legacy protocol must not start the runtime');}});
  vm.runInContext(source.replace('import(PYODIDE_URL + "pyodide.mjs")', 'importRuntime()'), context);
  for (const [id, kind] of [[7, 'build'], [8, 'section'], [9, 'held']])
    context.onmessage({data: {id, kind, name:'synthetic.hsg', bytes: new ArrayBuffer(8)}});
  await flush();
  assert.equal(messages.filter(m=>m.kind==='startup-failed').length,1);
  for (const id of [7,8,9]) assert.ok(messages.some(m=>m.id===id && m.kind==='failed' && m.error.includes('Reload')));
  assert.ok(messages.every(m=>m.error.includes('reader protocol')));
});

async function startup(stamp = 'audit', configure = manifest => manifest) {
  const manifest = stamp ? {schema: 1, worker: {url: `assets/${'a'.repeat(64)}/worker.js`, sha256: 'a'.repeat(64)},
    files: Object.fromEntries(files.map(name => [name, {url: `assets/${hash(name)}/${name}`, sha256: hash(name)}]))} : null;
  const runtime = deferred(), requests = new Map(), messages = [], writes = new Map();
  const dirs = new Set(['/']);
  const py = {
    FS: {
      mkdir(dir) { dirs.add(dir); },
      writeFile(file, text) {
        assert.ok(dirs.has(path.posix.dirname(file)), `directory exists before writing ${file}`);
        writes.set(file, text);
      },
    },
    // Python's progress callback (set_progress()), handed over as a module.
    registerJsModule(name, module) {
      assert.equal(name, 'big_copilot_worker');
      assert.equal(typeof module.say, 'function');
      py.progress = module.say;
    },
    async runPythonAsync(code) {
      assert.match(code, /ba_dashboard\.set_progress\(big_copilot_worker\.say\)/);
      assert.equal(typeof py.progress, 'function', 'the callback is registered before the import');
      assert.equal(writes.get('/ba_save.py'), 'ba_save.py');
      assert.equal(writes.get('/ba_dashboard.py'), 'ba_dashboard.py');
      assert.equal(writes.get('/ba_facts.py'), 'ba_facts.py');
      assert.equal(writes.get('/ba_mods.py'), 'ba_mods.py');
      py.imported = true;
    },
  };
  // The VM runs the real worker, substituting only its module import boundary.
  const context = vm.createContext({
    URL, Uint8Array, TextDecoder, performance, console,
    crypto: {subtle: {digest: async (_algorithm, bytes) => new Uint8Array(createHash('sha256').update(Buffer.from(bytes)).digest()).buffer}},
    self: {location: {href: 'https://worker.test/' + (manifest ? manifest.worker.url : 'worker.js')}},
    postMessage: message => messages.push(message),
    importRuntime: async () => ({loadPyodide: () => runtime.promise}),
    fetch(url, options) {
      const name = new URL(url).pathname.split('/').at(-1);
      const task = deferred();
      requests.set(name, {...task, url, options});
      return task.promise;
    },
  });
  const entry = 'import(PYODIDE_URL + "pyodide.mjs")';
  assert.ok(source.includes(entry), 'runtime import boundary still exists');
  vm.runInContext(source.replace(entry, 'importRuntime()'), context);
  await flush();
  assert.equal(requests.size, 0, 'no boot before the page pins its manifest');
  context.onmessage({data: {kind: 'init', assets: configure(manifest)}});
  await flush();
  return {runtime, requests, messages, writes, py, manifest, context};
}

function respond(request, name, status = 200) {
  request.resolve({ok: status === 200, status, arrayBuffer: async () => buffer(name)});
}

for (const first of ['runtime', 'downloads']) {
  test(`${first} completion reports progress while the other startup branch is pending`, async () => {
    const s = await startup();
    const initial = s.messages.length;
    if (first === 'runtime') s.runtime.resolve(s.py);
    else for (const [name, req] of s.requests) respond(req, name);
    await flush();
    assert.ok(s.messages.slice(initial).some(m => m.kind === 'progress' && m.stage === 'code'),
      'the pending save inactivity timer can restart before both branches finish');
    assert.ok(!s.py.imported);
    assert.ok(!s.messages.some(m => m.stage === 'ready'));
    if (first === 'runtime') for (const [name, req] of s.requests) respond(req, name);
    else s.runtime.resolve(s.py);
    await flush();
    assert.ok(s.py.imported);
  });
}

test('partial downloads report progress only after consuming a body or taking an HTTP fallback', async () => {
  const s = await startup();
  const body = deferred();
  const initial = s.messages.length;
  s.requests.get('ba_save.py').resolve({ok: true, arrayBuffer: () => body.promise});
  await flush();
  assert.equal(s.messages.length, initial, 'headers alone do not complete the download');
  body.resolve(buffer('ba_save.py'));
  await flush();
  assert.equal(s.messages.length, initial + 1, 'one consumed body restarts inactivity timing');
  respond(s.requests.get('gametext.json'), 'gametext.json');
  await flush();
  assert.equal(s.messages.length, initial + 2, 'optional fallback also completes work');
  assert.ok(!s.py.imported);
  for (const [name, req] of s.requests) respond(req, name);
  s.runtime.resolve(s.py);
  await flush();
  assert.ok(s.py.imported);
});

test('all downloads overlap runtime startup and imports wait for every body', async () => {
  const s = await startup();
  assert.deepEqual([...s.requests.keys()], files);
  assert.equal(s.writes.size, 0, 'no filesystem writes before the runtime exists');
  for (const [name, req] of s.requests) {
    assert.equal(req.url, `https://worker.test/${s.manifest.files[name].url}`);
    assert.equal(req.options.cache, 'default');
  }
  // Complete out of order; one response body is still being downloaded.
  const body = deferred();
  s.requests.get('ba_store_rules.json').resolve({ok: true, arrayBuffer: () => body.promise});
  for (const name of files.slice(0, -1).reverse()) respond(s.requests.get(name), name);
  s.runtime.resolve(s.py);
  await flush();
  assert.ok(!s.py.imported);
  body.resolve(buffer('ba_store_rules.json'));
  await flush();
  assert.ok(s.py.imported);
  assert.equal(s.writes.size, files.length);
  assert.equal(s.writes.get('/data/ba_store_rules.json'), 'ba_store_rules.json');
  assert.ok(s.messages.some(m => m.stage === 'ready'));
});

test('unstamped builds bypass cache and optional HTTP failures still boot', async () => {
  const s = await startup('');
  assert.equal(s.requests.size, files.length);
  for (const [name, req] of s.requests) {
    assert.equal(req.url, `https://worker.test/py/${name}`);
    assert.equal(req.options.cache, 'no-store');
    respond(req, name, name.endsWith('.json') ? 404 : 200);
  }
  s.runtime.resolve(s.py);
  await flush();
  assert.ok(s.py.imported);
  assert.equal(s.writes.size, 4);
  assert.ok(s.messages.some(m => m.stage === 'ready'));
});

for (const name of ['ba_save.py', 'ba_dashboard.py', 'ba_facts.py', 'ba_mods.py']) {
  test(`a failed required ${name} reports startup failure before runtime finishes`, async () => {
    const s = await startup();
    assert.ok(s.requests.has(name));
    respond(s.requests.get(name), name, 503);
    await flush();
    assert.ok(s.messages.some(m => m.kind === 'startup-failed' && m.error.includes(`${name}: 503`) && m.error.includes('Reload')));
    assert.ok(!s.messages.some(m => m.stage === 'ready'));
  });
}

test('a rejected optional fetch reports startup failure without an unhandled rejection', async () => {
  const s = await startup();
  assert.ok(s.requests.has('gametext.json'));
  s.requests.get('gametext.json').reject(new Error('network offline'));
  await flush();
  assert.ok(s.messages.some(m => m.kind === 'startup-failed' && m.error === 'network offline'));
  assert.ok(!s.messages.some(m => m.stage === 'ready'));
});

test('runtime rejection is reported while asset fetches are pending', async () => {
  const s = await startup();
  s.runtime.reject(new Error('wasm unavailable'));
  await flush();
  assert.ok(s.messages.some(m => m.kind === 'startup-failed' && m.error === 'wasm unavailable'));
  assert.ok(!s.messages.some(m => m.stage === 'ready'));
});

for (const name of files) {
  test(`a digest mismatch in ${name} never installs a partial interpreter`, async () => {
    const s = await startup();
    for (const [file, req] of s.requests) respond(req, file === name ? 'wrong release' : file);
    s.runtime.resolve(s.py);
    await flush();
    assert.ok(s.messages.some(m => m.kind === 'startup-failed' && m.error.includes(name + ' digest')));
    assert.equal(s.writes.size, 0);
    assert.ok(!s.py.imported);
  });
}

test('a missing pinned optional table is a release failure, never a development fallback', async () => {
  const s = await startup();
  respond(s.requests.get('ba_store_rules.json'), 'ba_store_rules.json', 404);
  s.runtime.resolve(s.py);
  await flush();
  assert.ok(s.messages.some(m => m.kind === 'startup-failed' && m.error.includes('Reload')));
  assert.equal(s.writes.size, 0);
});

test('an initialized worker keeps its complete installed release when a newer manifest is offered', async () => {
  const s = await startup();
  for (const [name, req] of s.requests) respond(req, name);
  s.runtime.resolve(s.py);
  await flush();
  assert.ok(s.py.imported);
  s.context.onmessage({data: {kind: 'init', assets: {schema: 2}}});
  await flush();
  assert.equal(s.requests.size, files.length);
  assert.equal(s.writes.get('/ba_dashboard.py'), 'ba_dashboard.py');
  assert.ok(!s.messages.some(m => m.kind === 'startup-failed'));
});

for (const [name, configure] of [
  ['missing manifest', () => null],
  ['wrong schema', manifest => ({...manifest, schema: 2})],
  ['missing descriptor', manifest => {delete manifest.files['ba_facts.py']; return manifest;}],
  ['mutable descriptor', manifest => {manifest.files['gametext.json'].url='py/gametext.json'; return manifest;}],
  ['different worker identity', manifest => {manifest.worker.sha256='b'.repeat(64); manifest.worker.url=`assets/${manifest.worker.sha256}/worker.js`; return manifest;}],
]) {
  test(`${name} fails before runtime or file downloads begin`, async () => {
    const s=await startup('audit',configure);
    assert.equal(s.requests.size,0);
    assert.ok(s.messages.some(m=>m.kind==='startup-failed' && m.error.includes('Reload')));
    assert.equal(s.writes.size,0);
  });
}
