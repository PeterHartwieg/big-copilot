// Exercise startup with unresolved downloads: no wall-clock performance assertions.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'web/worker.js'), 'utf8');
const files = ['ba_save.py', 'ba_dashboard.py', 'gametext.json', 'ba_buildings.json',
  'ba_demand_curves.json', 'ba_item_prices.json', 'ba_store_rules.json'];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return {promise, resolve, reject};
};
const flush = () => new Promise(resolve => setImmediate(resolve));

async function startup(stamp = 'audit') {
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
      py.imported = true;
    },
  };
  // The VM runs the real worker, substituting only its module import boundary.
  const context = vm.createContext({
    URL, Uint8Array, performance, console,
    self: {location: {href: 'https://worker.test/worker.js' + (stamp ? `?v=${stamp}` : '')}},
    postMessage: message => messages.push(message),
    importRuntime: async () => ({loadPyodide: () => runtime.promise}),
    fetch(url, options) {
      const name = /py\/([^?]+)/.exec(url)[1];
      const task = deferred();
      requests.set(name, {...task, url, options});
      return task.promise;
    },
  });
  const entry = 'import(PYODIDE_URL + "pyodide.mjs")';
  assert.ok(source.includes(entry), 'runtime import boundary still exists');
  vm.runInContext(source.replace(entry, 'importRuntime()'), context);
  await flush();
  return {runtime, requests, messages, writes, py};
}

function respond(request, name, status = 200) {
  request.resolve({ok: status === 200, status, text: async () => name});
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
  s.requests.get('ba_save.py').resolve({ok: true, text: () => body.promise});
  await flush();
  assert.equal(s.messages.length, initial, 'headers alone do not complete the download');
  body.resolve('ba_save.py');
  await flush();
  assert.equal(s.messages.length, initial + 1, 'one consumed body restarts inactivity timing');
  respond(s.requests.get('gametext.json'), 'gametext.json', 404);
  await flush();
  assert.equal(s.messages.length, initial + 2, 'optional fallback also completes work');
  assert.ok(!s.py.imported);
  for (const [name, req] of s.requests) respond(req, name);
  s.runtime.resolve(s.py);
  await flush();
  assert.ok(s.py.imported);
});

test('all seven downloads overlap runtime startup and imports wait for every body', async () => {
  const s = await startup();
  assert.deepEqual([...s.requests.keys()], files);
  assert.equal(s.writes.size, 0, 'no filesystem writes before the runtime exists');
  for (const [name, req] of s.requests) {
    assert.equal(req.url, `py/${name}?v=audit`);
    assert.equal(req.options.cache, 'default');
  }
  // Complete out of order; one response body is still being downloaded.
  const body = deferred();
  s.requests.get('ba_store_rules.json').resolve({ok: true, text: () => body.promise});
  for (const name of files.slice(0, -1).reverse()) respond(s.requests.get(name), name);
  s.runtime.resolve(s.py);
  await flush();
  assert.ok(!s.py.imported);
  body.resolve('ba_store_rules.json');
  await flush();
  assert.ok(s.py.imported);
  assert.equal(s.writes.size, 7);
  assert.equal(s.writes.get('/data/ba_store_rules.json'), 'ba_store_rules.json');
  assert.ok(s.messages.some(m => m.stage === 'ready'));
});

test('unstamped builds bypass cache and optional HTTP failures still boot', async () => {
  const s = await startup('');
  assert.equal(s.requests.size, 7);
  for (const [name, req] of s.requests) {
    assert.equal(req.url, `py/${name}?v=dev`);
    assert.equal(req.options.cache, 'no-store');
    respond(req, name, name.endsWith('.json') ? 404 : 200);
  }
  s.runtime.resolve(s.py);
  await flush();
  assert.ok(s.py.imported);
  assert.equal(s.writes.size, 2);
  assert.ok(s.messages.some(m => m.stage === 'ready'));
});

for (const name of ['ba_save.py', 'ba_dashboard.py']) {
  test(`a failed required ${name} reports startup failure before runtime finishes`, async () => {
    const s = await startup();
    assert.ok(s.requests.has(name));
    respond(s.requests.get(name), name, 503);
    await flush();
    assert.ok(s.messages.some(m => m.kind === 'startup-failed' && m.error === `could not load ${name}: 503`));
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
