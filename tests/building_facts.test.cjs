const {test} = require('node:test');
const assert = require('node:assert/strict');
// web/app.js run whole; exportSnapshot() is called through window.BigCopilotShell.
const {loadShell} = require('./_shell.cjs');

test('snapshot download preserves the entire package and refuses a superseded source', async () => {
  for (const scenario of ['matching', 'changed-source', 'wrong-file', 'ordinary-save']) {
    const file = {name: scenario === 'ordinary-save' ? 'company.hsg' : 'company.bcsave'};
    const bytes = new TextEncoder().encode('{"format":"big-copilot-save","save":"private","facts":{"stamp":"same"}}');
    const downloads = [];
    let blob;
    const {shell, context} = loadShell({globals: {Blob}});
    // What the page's own handler hands it: the board's save, the reader's
    // copy, and whether that save is still the board's and the last one read.
    const page = {lastGood: file, lastFile: file};
    async function readerHeld() {
      if (scenario === 'changed-source') page.lastFile = {name: file.name};
      return {bytes, name: scenario === 'wrong-file' ? 'another.bcsave' : file.name};
    }
    context.URL = {createObjectURL(value) { blob = value; return 'blob:snapshot'; }, revokeObjectURL() {}};
    context.document.createElement = () => ({click() { downloads.push(this.download); }});
    await shell.exportSnapshot(page.lastGood, readerHeld, (f) => page.lastGood === f && page.lastFile === f);
    assert.deepEqual(downloads, scenario === 'matching' ? [file.name] : [], scenario);
    if (blob) assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  }
});
