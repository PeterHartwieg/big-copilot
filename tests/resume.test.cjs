const {test} = require('node:test');
const assert = require('node:assert/strict');
const {en} = require('./_i18n.cjs');
// web/app.js run whole. Startup's last step, resumeSource(), runs through
// BigCopilotShell.scope with stand-ins for what it hands the source to; the
// helpers it calls itself, errWords() and the loopback check a remembered
// link goes through, are the real ones.
const {loadShell} = require('./_shell.cjs');

async function resume(permission, options = {}) {
  const loads = [];
  const links = [];
  const notes = [];
  const handle = {name:'Saves', async queryPermission(){
    if (options.fail) throw new Error('Unavailable');
    if (options.supersede) context.sourceGen++;
    return permission;
  }, requestPermission(){throw new Error('Startup must not request permission');}};
  // A browser without the File System Access API has no folder handle to reopen.
  const {scope: context} = loadShell({globals: options.supported !== false ? {showDirectoryPicker(){}} : {}});
  context.handles.get = async () => (options.missing ? null : handle);
  context.stored.get = (key) => (key === 'ledger_link' && options.link ? options.link : '');
  context.runtimeReady = true;
  context.pick = {dir:'character', name:'chosen.hsg'};
  Object.assign(context, {
    place(){}, idleState(){}, wireLanding(){}, paintStrip(){}, offerReopen(){ context.reopened = true; },
    startAttempt(){return true;}, finishAttempt(){}, state(){},
    note(...args){notes.push(args.map((a) => (typeof a === 'function' ? a() : a)));},
    async loadFromHandle(value){loads.push(value);},
    async loadFromLink(why, gen){links.push([typeof why === 'function' ? why() : why, gen]);},
  });
  await context.resumeSource();
  return {loads, links, notes, handle, context};
}

test('startup reopens the remembered source when permission is granted', async () => {
  const result = await resume('granted');
  assert.deepEqual(result.loads, [result.handle]);
});
for (const permission of ['prompt', 'denied']) {
  test(`startup waits for a click when permission is ${permission}`, async () => {
    assert.equal((await resume(permission)).loads.length, 0);
  });
}
test('unavailable handles and permission checks leave import usable', async () => {
  for (const options of [{missing:true}, {supported:false}, {fail:true}]) {
    assert.equal((await resume('granted', options)).loads.length, 0);
  }
});
test('a user source change supersedes pending restoration', async () => {
  assert.equal((await resume('granted', {supersede:true})).loads.length, 0);
});
test('a remembered game link is opened and the folder path skipped', async () => {
  const result = await resume('granted', {link:'http://127.0.0.1:8323'});
  assert.deepEqual(result.links, [[en("app.open.link"), 0]]);
  assert.deepEqual(result.loads, [], 'the folder handle is left alone');
  assert.equal(result.context.linkUrl, 'http://127.0.0.1:8323');
  assert.deepEqual(result.notes, [], 'the probe owns whatever is said next');
});
test('a remembered link that is not this machine is not followed', async () => {
  for (const link of ['https://evil.example', 'http://192.168.1.5:8322', 'not a url']) {
    const result = await resume('granted', {link});
    assert.equal(result.context.linkUrl, 'http://127.0.0.1:8322', link);
  }
});
test('with nothing to reopen, startup offers to choose a picked-once save again', async () => {
  // U2 in #109: offerReopen() decides from the tab's own record whether a
  // one-file source was open before the reload; startup only asks it when no
  // link and no folder handle can bring the board back.
  assert.equal((await resume('granted', {missing:true})).context.reopened, true);
  assert.equal((await resume('granted', {supported:false})).context.reopened, true);
  assert.equal((await resume('granted')).context.reopened, undefined);
  assert.equal((await resume('granted', {link:'http://127.0.0.1:8322'})).context.reopened, undefined);
});
