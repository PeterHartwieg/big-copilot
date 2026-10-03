// web/worker.js's side of the history and the game text (#109): the page's
// history is taken on a build only (WB-3), "forget" drops the copy the worker
// holds, and a remembered en.json is rewritten whenever its text changes, not
// only when its length does (WB-4). And its sections (#238): computed only for
// the build the worker holds, never writing the history, and answered stale
// unrun once a newer build is asked for. Pyodide is stood in for by a
// filesystem map and a runPython that does what browser_build/browser_name/
// browser_section do to it.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {at} = require('./_slice.cjs');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'worker.js'), 'utf8');
// Everything after Pyodide's boot: the file helpers and the message handler.
const handler = source.slice(at(source, 'function writeText('));
const names = ['SAVE_DIR', 'DATA_DIR', 'HISTORY', 'LOCALE', 'NAMES'].map((name) => {
  const line = source.split(/\r?\n/).find((l) => l.startsWith(`const ${name} =`));
  assert.ok(line, name);
  return line;
}).join('\n');

function worker({failSection = false} = {}) {
  const files = new Map();
  const posted = [];
  const writes = [];
  const calls = [];
  const py = {
    FS: {
      writeFile(p, data) { writes.push(p); files.set(p, typeof data === 'string' ? data : '<bytes>'); },
      readFile(p) { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p); },
      unlink(p) { if (!files.delete(p)) throw new Error('ENOENT'); },
      analyzePath(p) { return {exists: files.has(p)}; },
      utime() {},
    },
    // browser_build keeps the history file; browser_name adds a name to the
    // history on the filesystem, as History.named()/write() do.
    runPython(code) {
      const hist = '/data/market_history.json';
      calls.push(code);
      if (code.includes('browser_section(')) {
        if (failSection) throw new Error('Traceback...\nSaveShapeError: the board hit a bug');
        const [, name, gen] = /browser_section\("(\w+)", (\d+)\)/.exec(code);
        return JSON.stringify({generation: Number(gen), sections: {[name]: {[name]: []}}});
      }
      if (code.includes('browser_build(') && files.has('/save/boom.hsg')) throw new Error('Traceback...\nSaveShapeError: not a save');
      if (code.includes('browser_name(')) {
        const [, rid] = /browser_name\("[^"]+", "([^"]+)"/.exec(code);
        const book = JSON.parse(files.get(hist) || '{"names":[]}');
        book.names.push(rid);
        files.set(hist, JSON.stringify(book));
        return undefined;
      }
      // A history that does not parse is set aside and none is written.
      if ((files.get(hist) || '').startsWith('{damaged')) {
        files.set(hist + '.bad', files.get(hist));
        files.delete(hist);
      }
      return JSON.stringify({history: files.get(hist) || ''});
    },
  };
  const context = vm.createContext({
    py, postMessage: (m) => posted.push(m), performance: {now: () => 0},
    String, JSON, Uint8Array, Math, Error, MessageChannel,
  });
  vm.runInContext(`${names}
let lastSave = null;
let localeText = null;
let queue = Promise.resolve();
let heldGen = null;
let boards = 0;
const ready = Promise.resolve();
const say = () => {};
${handler}
this.send = (data) => { onmessage({data}); return queue; };`, context);
  return {send: context.send, files, posted, writes, calls};
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

test('a damaged history set aside is dropped by the page, and the next build starts fresh', async () => {
  const w = worker();
  await w.send(build(1, '{damaged'));
  assert.equal(w.posted.at(-1).kind, 'built');
  assert.strictEqual(w.posted.at(-1).history, '', 'the page drops its damaged copy');
  assert.equal(w.files.has(HIST + '.bad'), false, 'said once: the set-aside copy is gone');
  // A page that still resent it (another tab) recovers the same way.
  await w.send(build(2, '{damaged'));
  assert.strictEqual(w.posted.at(-1).history, '');
  await w.send(build(3, ''));
  await w.send({kind: 'name', id: 4, rid: 'a', slug: 'beer'});
  assert.deepEqual(JSON.parse(w.posted.at(-1).history).names, ['a'], 'a fresh record');
});

test('a build that leaves no history file for another reason hands back none', async () => {
  const w = worker();
  await w.send(build(1, ''));  // nothing sent, nothing written (the stand-in writes no file)
  assert.strictEqual(w.posted.at(-1).history, null, 'null: the page keeps what it has stored');
});

test('a section is computed for the build the worker holds, and writes no history', async () => {
  const w = worker();
  await w.send(build(1, JSON.stringify({names: ['page']})));
  assert.equal(w.posted.at(-1).gen, 1, 'a build names its generation');
  const before = w.writes.length;
  await w.send({kind: 'section', id: 2, name: 'hiring', gen: 1});
  const reply = w.posted.at(-1);
  assert.equal(reply.kind, 'section');
  assert.equal(reply.id, 2);
  assert.equal(JSON.stringify(JSON.parse(reply.data).sections), JSON.stringify({hiring: {hiring: []}}));
  assert.equal('history' in reply, false, 'a section carries no history');
  assert.equal(w.writes.length, before, 'and writes nothing to the filesystem');
  assert.match(w.calls.at(-1), /browser_section\("hiring", 1\)/);
});

test('a section of a build the worker no longer holds is answered stale, unrun', async () => {
  const w = worker();
  await w.send(build(1, ''));
  await w.send(build(3, ''));
  const ran = w.calls.length;
  await w.send({kind: 'section', id: 4, name: 'hiring', gen: 1});
  assert.equal(JSON.stringify(w.posted.at(-1)), JSON.stringify({kind: 'section', id: 4, stale: true}));
  assert.equal(w.calls.length, ran, 'Python is not asked');
});

test('a section still waiting when a newer build is asked for is dropped', async () => {
  const w = worker();
  await w.send(build(1, ''));
  // Asked together: the section for board 1 waits behind nothing but is
  // overtaken by the build asked for after it.
  const section = w.send({kind: 'section', id: 2, name: 'factoryStaffing', gen: 1});
  const rebuild = w.send(build(3, ''));
  await Promise.all([section, rebuild]);
  const answer = w.posted.find(m => m.id === 2);
  assert.equal(JSON.stringify(answer), JSON.stringify({kind: 'section', id: 2, stale: true}));
  assert.equal(w.calls.filter(c => c.includes('browser_section(')).length, 0);
  assert.equal(w.posted.at(-1).gen, 3);
});

test('a build delivered after a section has reached the front of the queue still goes first', async () => {
  const w = worker();
  await w.send(build(1, ''));
  // The section is taken off the queue first; the build arrives as a task of
  // its own a moment later, before the section has started Python.
  const section = w.send({kind: 'section', id: 2, name: 'hiring', gen: 1});
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const rebuild = w.send(build(3, ''));
  await Promise.all([section, rebuild]);
  assert.equal(JSON.stringify(w.posted.find(m => m.id === 2)), JSON.stringify({kind: 'section', id: 2, stale: true}));
  assert.equal(w.calls.filter(c => c.includes('browser_section(')).length, 0, 'the old section never ran');
});

test('a build that fails leaves no build to ask sections of', async () => {
  const w = worker();
  await w.send(build(1, ''));
  // The next build throws in Python: the worker holds nothing afterwards,
  // not the board before it either (its save was let go first).
  await w.send({kind: 'build', id: 2, name: 'boom.hsg', bytes: new ArrayBuffer(4), mtime: 1, locale: '', history: ''});
  assert.equal(w.posted.at(-1).kind, 'failed');
  await w.send({kind: 'section', id: 3, name: 'hiring', gen: 1});
  assert.equal(w.posted.at(-1).gone, true, 'the older board is not served, and no newer one is coming');
  await w.send({kind: 'section', id: 4, name: 'hiring', gen: 2});
  assert.equal(w.posted.at(-1).gone, true, 'nor the failed one');
});

test('a section Python cannot work out fails like a build, with its last line', async () => {
  const w = worker({failSection: true});
  await w.send(build(1, ''));
  await w.send({kind: 'section', id: 2, name: 'hiring', gen: 1});
  const reply = w.posted.at(-1);
  assert.equal(reply.kind, 'failed');
  assert.equal(reply.id, 2);
  assert.equal(reply.error, 'the board hit a bug');
  // The whole traceback rides along for a bug report, as a build's does; a
  // section sends no save bytes (it was given none).
  assert.match(reply.trace, /SaveShapeError: the board hit a bug/);
  assert.equal(reply.bytes, null);
});
