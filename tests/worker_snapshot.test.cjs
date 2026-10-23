// Real bundled Pyodide: repeated raw snapshot/facts loads, failure recovery,
// portable export equivalence, and source switches. Synthetic saves only.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {suiteBrowser, openPage, serveWeb} = require('./_page.cjs');
const {loadShell} = require('./_shell.cjs');
const root = path.join(__dirname, '..');
const browser = suiteBrowser();
const opaqueMiB = Number(process.env.SAVE_PROBE_MIB || 16);

// The probe only observes the worker's memory/retained files and temporarily
// lowers the parser budget. Production worker requests still run unchanged.
const instrumented = fs.readFileSync(path.join(root, 'web/worker.js'), 'utf8') + `
const originalMessage = onmessage;
onmessage = event => {
  if (event.data.kind !== 'memory-probe') return originalMessage(event);
  queue = queue.then(async () => {
    await ready;
    if (event.data.limit) py.runPython('ba_save.MAX_DECOMPRESSED_BYTES = ' + event.data.limit);
    const readers = py.runPython('sum(isinstance(o, ba_save._Reader) for o in ba_save.gc.get_objects())');
    postMessage({kind:'memory-probe', id:event.data.id, files:py.FS.readdir('/save').sort(),
      heap:py._module.HEAPU8.byteLength, readers});
  });
};
`;

test('real worker keeps raw snapshots and facts paired through repeated refreshes and failures', async t => {
  const made = spawnSync(process.env.PYTHON || 'python3', ['-c', `
import base64, json
from tests.es3_fixture import encode, link_company
from tests.test_building_facts import facts_for
root = link_company()
root['characterId'] = 'synthetic-memory'
root['buildNumberAtLastSave'] = 3682
root['modData'] = [{'$k': 'opaque.synthetic', '$v': 'x' * (${opaqueMiB} * 1024 * 1024)}]
raw = encode(root)
print(json.dumps({'raw': base64.b64encode(raw).decode(), 'facts': facts_for(raw, root)}))
`], {cwd:root, encoding:'utf8', maxBuffer:2 * 1024 * 1024});
  assert.equal(made.status, 0, made.stderr);
  const fixture = JSON.parse(made.stdout), raw = Buffer.from(fixture.raw, 'base64');
  const {page, context} = await openPage(t, await browser());
  await serveWeb(context, {host:'snapshot.test', files:{
    '/index.html':'<!doctype html><html><body>Synthetic worker probe</body></html>',
    '/worker.js':instrumented,
    '/synthetic.hsg':raw,
  }});
  await page.goto('https://snapshot.test/');
  const result = await page.evaluate(async ({facts, length}) => {
    const worker = new Worker('/worker.js', {type:'module'});
    let next = 1;
    const pending = new Map();
    worker.onmessage = ({data}) => {
      if (pending.has(data.id)) {pending.get(data.id)(data); pending.delete(data.id);}
    };
    worker.postMessage({kind:'init', assets:null});
    function ask(msg, transfer = []) {
      return new Promise(resolve => {
        const id = next++;
        pending.set(id, resolve);
        worker.postMessage({...msg, id}, transfer);
      });
    }
    async function build(factsText = JSON.stringify(facts), name = 'live.bcsave') {
      const bytes = await (await fetch('/synthetic.hsg')).arrayBuffer();
      const reply = ask({kind:'build', name, bytes, facts:factsText, mtime:1, live:true}, [bytes]);
      if (bytes.byteLength !== 0) throw new Error('save bytes were copied instead of transferred');
      return reply;
    }
    const results = [], heaps = [];
    for (let i = 0; i < 5; i++) {
      results.push((await build()).kind);
      const probe = await ask({kind:'memory-probe'});
      if (probe.readers !== 0) throw new Error('parser retained after build');
      heaps.push(probe.heap);
    }
    const held = await ask({kind:'held'});
    const heldLength = held.bytes.byteLength;
    const paired = held.facts === JSON.stringify(facts);
    const beforeFiles = (await ask({kind:'memory-probe'})).files;
    const badFacts = await build(JSON.stringify({...facts, saveSha256:'0'.repeat(64)}));
    const invalidHeld = await ask({kind:'held'});
    await ask({kind:'memory-probe', limit:1024});
    const exceeded = await build();
    await ask({kind:'memory-probe', limit:512 * 1024 * 1024});
    const recovered = await build();
    const plain = await build(null, 'plain.hsg');
    const plainHeld = await ask({kind:'held'});
    const afterFiles = (await ask({kind:'memory-probe'})).files;
    worker.terminate();
    return {results, heaps, heldLength, paired, beforeFiles,
      invalid:badFacts.kind, invalidFacts:invalidHeld.facts, invalidBytes:invalidHeld.bytes.byteLength,
      exceeded:exceeded.kind, exceededError:exceeded.error, failureFacts:exceeded.facts,
      failureBytes:exceeded.bytes.byteLength, recovered:recovered.kind, plain:plain.kind,
      plainFacts:plainHeld.facts, afterFiles, expected:length};
  }, {facts:fixture.facts, length:raw.length});
  assert.deepEqual(result.results, Array(5).fill('built'));
  assert.equal(result.heldLength, raw.length);
  assert.equal(result.paired, true);
  assert.deepEqual(result.beforeFiles, ['.', '..', 'building-facts.json', 'live.bcsave']);
  assert.equal(result.invalid, 'failed');
  assert.equal(JSON.parse(result.invalidFacts).saveSha256, '0'.repeat(64));
  assert.equal(result.invalidBytes, raw.length);
  assert.equal(result.exceeded, 'failed');
  assert.match(result.exceededError, /decompressed safety limit/);
  assert.deepEqual(JSON.parse(result.failureFacts), fixture.facts);
  assert.equal(result.failureBytes, raw.length);
  assert.equal(result.recovered, 'built');
  assert.equal(result.plain, 'built');
  assert.equal(result.plainFacts, null);
  assert.deepEqual(result.afterFiles, ['.', '..', 'plain.hsg']);
  // Allocator growth is runtime/device-dependent; record it rather than
  // impose a timing- or heap-size assertion that fails across browsers.
  t.diagnostic(`Pyodide heap MiB after five ${opaqueMiB * 2} MiB ES3 refreshes: ` + result.heaps.map(n => n / 2**20).join(', '));

  const {shell} = loadShell({globals:{TextEncoder, Uint8Array,
    btoa:value => Buffer.from(value, 'binary').toString('base64')}});
  const packed = shell.portableSaveBytes(raw, JSON.stringify(fixture.facts));
  const portable = JSON.parse(new TextDecoder().decode(packed));
  assert.deepEqual(Buffer.from(portable.save, 'base64'), raw);
  assert.deepEqual(portable.facts, fixture.facts);
});
