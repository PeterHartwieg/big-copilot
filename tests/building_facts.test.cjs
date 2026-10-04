const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {between} = require('./_slice.cjs');

const source = fs.readFileSync(path.join(__dirname, '..', 'web/app.js'), 'utf8');
const exportBinding = between(source, '    $("snapshotExport")?.addEventListener', '    $("recoverBtn").addEventListener');

test('snapshot download preserves the entire package and refuses a superseded source', async () => {
  for (const scenario of ['matching', 'changed-source', 'wrong-file', 'ordinary-save']) {
    const file = {name: scenario === 'ordinary-save' ? 'company.hsg' : 'company.bcsave'};
    const bytes = new TextEncoder().encode('{"format":"big-copilot-save","save":"private","facts":{"stamp":"same"}}');
    const downloads = [];
    let click, blob;
    const context = vm.createContext({
      lastGood: file, lastFile: file, Blob, setTimeout() {},
      $(id) { assert.equal(id, 'snapshotExport'); return {addEventListener(_event, fn) { click = fn; }}; },
      async readerHeld() {
        if (scenario === 'changed-source') context.lastFile = {name: file.name};
        return {bytes, name: scenario === 'wrong-file' ? 'another.bcsave' : file.name};
      },
      URL: {createObjectURL(value) { blob = value; return 'blob:snapshot'; }, revokeObjectURL() {}},
      document: {createElement() { return {click() { downloads.push(this.download); }}; }},
    });
    vm.runInContext(exportBinding, context);
    await click();
    assert.deepEqual(downloads, scenario === 'matching' ? [file.name] : [], scenario);
    if (blob) assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  }
});
