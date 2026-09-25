// web/worker.js's side of the history and the game text (#109): the page's
// history is taken on a build only (WB-3), "forget" drops the copy the worker
// holds, and a remembered en.json is rewritten whenever its text changes, not
// only when its length does (WB-4). Pyodide is stood in for by a filesystem
// map and a runPython that does what browser_build/browser_name do to it.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'worker.js'), 'utf8');
// Everything after Pyodide's boot: the file helpers and the message handler.
const handler = source.slice(source.indexOf('function writeText('));
const names = ['SAVE_DIR', 'DATA_DIR', 'HISTORY', 'LOCALE', 'NAMES'].map((name) => {
  const line = source.split(/\r?\n/).find((l) => l.startsWith(`const ${name} =`));
  assert.ok(line, name);
  return line;
}).join('\n');

function worker() {
  const files = new Map();
  const posted = [];
  const writes = [];
  const py = {
    FS: {
      writeFile(p, data) { writes.push(p); files.set(p, typeof data === 'string' ? data : '<bytes>'); },
      readFile(p) { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p); },
      unlink(p) { if (!files.delete(p)) throw new Error('ENOENT'); },
      utime() {},
    },
    // browser_build keeps the history file; browser_name adds a name to the
    // history on the filesystem, as History.named()/write() do.
    runPython(code) {
      const hist = '/data/market_history.json';
      if (code.includes('browser_name(')) {
        const [, rid] = /browser_name\("[^"]+", "([^"]+)"/.exec(code);
        const book = JSON.parse(files.get(hist) || '{"names":[]}');
        book.names.push(rid);
        files.set(hist, JSON.stringify(book));
        return undefined;
      }
      // A history that does not parse is set aside and none is written.
      if ((files.get(hist) || '').startsWith('{damaged')) files.delete(hist);
      return JSON.stringify({history: files.get(hist) || ''});
    },
  };
  const context = vm.createContext({
    py, postMessage: (m) => posted.push(m), performance: {now: () => 0},
    String, JSON, Uint8Array, Math, Error,
  });
  vm.runInContext(`${names}
let lastSave = null;
let localeText = null;
let queue = Promise.resolve();
const ready = Promise.resolve();
const say = () => {};
${handler}
this.send = (data) => { onmessage({data}); return queue; };`, context);
  return {send: context.send, files, posted, writes};
}

const HIST = '/data/market_history.json';
const LOCALE = '/data/en.json';
const build = (id, history, locale = '') => ({kind: 'build', id, name: 'a.hsg', bytes: new ArrayBuffer(4), mtime: 1, locale, history});

test('names asked for together each keep theirs', async () => {
  const w = worker();
  const before = JSON.stringify({names: []});
  await w.send(build(1, before));
  // Two names in flight: the page used to send each its copy from before
  // either, and the worker took each, so the second dropped the first.
  await Promise.all([
    w.send({kind: 'name', id: 2, rid: 'a', slug: 'beer', history: before}),
    w.send({kind: 'name', id: 3, rid: 'b', slug: 'wine', history: before}),
  ]);
  assert.deepEqual(JSON.parse(w.files.get(HIST)).names, ['a', 'b']);
  assert.deepEqual(JSON.parse(w.posted.at(-1).history).names, ['a', 'b'], 'the page is handed both');
});

test('a build takes the history the page sends', async () => {
  const w = worker();
  await w.send(build(1, JSON.stringify({names: ['old']})));
  await w.send({kind: 'name', id: 2, rid: 'a', slug: 'beer'});
  await w.send(build(3, JSON.stringify({names: ['page']})));
  assert.deepEqual(JSON.parse(w.files.get(HIST)).names, ['page']);
});

test('forgetting the history drops the copy the worker holds', async () => {
  const w = worker();
  await w.send(build(1, JSON.stringify({names: ['old']})));
  await w.send({kind: 'forget'});
  assert.equal(w.files.has(HIST), false);
  await w.send({kind: 'name', id: 2, rid: 'a', slug: 'beer'});
  assert.deepEqual(JSON.parse(w.files.get(HIST)).names, ['a'], 'a name after it starts a fresh record');
  assert.deepEqual(w.posted.filter((m) => m.kind === "failed"), []);
});

test('a new en.json of the same length replaces the old one; the same text is not rewritten', async () => {
  const w = worker();
  await w.send(build(1, '', '{"a":"x"}'));
  await w.send(build(2, '', '{"a":"y"}'));
  assert.equal(w.files.get(LOCALE), '{"a":"y"}');
  await w.send(build(3, '', '{"a":"y"}'));
  assert.equal(w.writes.filter((p) => p === LOCALE).length, 2);
  await w.send(build(4, '', ''));
  assert.equal(w.files.has(LOCALE), false, 'the built-in text again: the file is gone');
});

test('a build that wrote no history hands back none, so the page keeps its stored copy', async () => {
  const w = worker();
  await w.send(build(1, '{damaged'));
  assert.equal(w.posted.at(-1).kind, 'built');
  assert.strictEqual(w.posted.at(-1).history, null);
  await w.send(build(2, JSON.stringify({names: []})));
  assert.equal(w.posted.at(-1).history, JSON.stringify({names: []}));
});
