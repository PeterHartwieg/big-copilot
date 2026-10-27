// Portable encoding is needed only for explicit exports and report attachments.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {loadShell} = require('./_shell.cjs');

test('on-demand portable snapshots preserve every byte across Base64 chunk boundaries', () => {
  const {shell} = loadShell({globals: {TextEncoder, Uint8Array,
    btoa: text => Buffer.from(text, 'binary').toString('base64')}});
  const facts = {stamp: 'same', saveSha256: 'hash', buildings: [{street: 'Türkçe'}]};
  for (const size of [0, 1, 2, 3, 24575, 24576, 24577, 49152, 131075]) {
    const raw = Uint8Array.from({length: size}, (_, i) => i % 256);
    const encoded = shell.portableSaveBytes(raw.buffer, JSON.stringify(facts));
    const portable = JSON.parse(new TextDecoder().decode(encoded));
    assert.equal(portable.format, 'big-copilot-save');
    assert.equal(portable.version, 1);
    assert.deepEqual(portable.facts, facts);
    assert.deepEqual(Buffer.from(portable.save, 'base64'), Buffer.from(raw));
  }
});

const {suiteBrowser, openPage, serveWeb} = require('./_page.cjs');
const {createHash} = require('node:crypto');
const browser = suiteBrowser();

// health.build is the mod's best-known number. It is the save stamp only while
// runningBuild is absent or not a build (an older mod, or GameVersion not yet
// answered). Once runningBuild is known, a reader that dies before the save
// is parsed must not report that running number as the save.
for (const spec of [
  {failure: 'startup', label: 'an older mod', health: {build: 3682}, save: 3682, running: null},
  {failure: 'validation', label: 'an older mod', health: {build: 3682}, save: 3682, running: null},
  {failure: 'startup', label: 'a known running build', health: {build: 3682, runningBuild: 3682}, save: null, running: 3682},
  {failure: 'startup', label: 'a running build of zero', health: {build: 3670, runningBuild: 0}, save: 3670, running: null},
  {failure: 'startup', label: 'a null running build', health: {build: 3670, runningBuild: null}, save: 3670, running: null},
]) {
  test(`linked snapshot reports preserve bytes and facts after ${spec.failure} failure with ${spec.label}`, async t => {
    const raw = Buffer.from([31, 139, 8, 0, 3, 2, 1]);
    const facts = {schemaVersion:1, model:'building-values-v1', stamp:'one', character:'synthetic', build:3682,
      saveSha256:createHash('sha256').update(raw).digest('hex'), buildings:[]};
    const {page, context} = await openPage(t, await browser());
    await context.addInitScript(() => {
      localStorage.setItem('ledger_link', 'http://127.0.0.1:8322');
      window.memoryFixture = {messages:[]};
      window.BigCopilotReport = {open(context) { memoryFixture.report = context; }};
      window.Worker = class {
        constructor() {memoryFixture.worker = this;}
        postMessage(message) {memoryFixture.messages.push(message);}
        terminate() {memoryFixture.terminated = true;}
      };
    });
    await serveWeb(context, {host:'save-memory.test'});
    await context.route('http://127.0.0.1:8322/**', route => {
      const name = new URL(route.request().url()).pathname;
      const json = body => route.fulfill({contentType:'application/json', body:JSON.stringify(body)});
      if (name === '/health') return json({ok:true, schemaVersion:5, features:['building-facts.v1'],
        character:'synthetic', company:'Synthetic', ...spec.health, stamp:'one', busy:false, size:raw.length,
        day:1, hour:1, refreshedAt:'2026-10-23T12:00:00Z'});
      if (name === '/save') return route.fulfill({body:raw, headers:{'X-Game-Link-Stamp':'one', 'X-Game-Link-Character':'synthetic'}});
      if (name === '/facts') return json(facts);
      return route.fulfill({status:404});
    });
    await page.goto('https://save-memory.test/');
    await page.waitForFunction(() => memoryFixture.messages.some(m => m.kind === 'build'));
    await page.evaluate(failure => {
      const msg = memoryFixture.messages.find(m => m.kind === 'build');
      if (failure === 'startup') memoryFixture.worker.onmessage({data:{kind:'startup-failed', error:'runtime unavailable'}});
      else memoryFixture.worker.onmessage({data:{kind:'failed', id:msg.id, error:'invalid facts', trace:'SaveFormatError: invalid facts', bytes:msg.bytes, facts:msg.facts}});
    }, spec.failure);
    await page.waitForFunction(() => !document.getElementById('srcStrip').classList.contains('reading'));
    await page.evaluate(() => document.querySelector('[data-bug-report]').click());
    await page.waitForFunction(() => memoryFixture.report);
    const result = await page.evaluate(async () => ({
      portable:JSON.parse(new TextDecoder().decode(await memoryFixture.report.bytes())),
      build:await memoryFixture.report.gameBuild(),
      running:memoryFixture.report.runningBuild(),
    }));
    assert.deepEqual(Buffer.from(result.portable.save, 'base64'), raw);
    assert.deepEqual(result.portable.facts, facts);
    assert.equal(result.build, spec.save);
    assert.equal(result.running, spec.running);
  });
}
