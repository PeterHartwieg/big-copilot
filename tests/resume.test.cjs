const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const startup = source.slice(source.indexOf('    // A folder chosen on an earlier visit:'), source.lastIndexOf('  });'));

async function resume(permission, options = {}) {
  const loads = [];
  const links = [];
  const notes = [];
  const handle = {name:'Saves', async queryPermission(){
    if (options.fail) throw new Error('Unavailable');
    if (options.supersede) context.sourceGen++;
    return permission;
  }, requestPermission(){throw new Error('Startup must not request permission');}};
  const context = vm.createContext({
    canHandle:options.supported !== false, dirHandle:null, sourceGen:0,
    handles:{async get(){return options.missing ? null : handle;}},
    stored:{get:(key) => key === 'ledger_link' && options.link ? options.link : ''},
    LINK_KEY:'ledger_link', linkUrl:null,
    runtimeReady:true, pick:{dir:'character', name:'chosen.hsg'},
    place(){}, idleState(){}, wireLanding(){}, paintStrip(){},
    startAttempt(){return true;}, finishAttempt(){}, state(){},
    note(...args){notes.push(args);},
    async loadFromHandle(value){loads.push(value);},
    async loadFromLink(why, gen){links.push([why, gen]);},
  });
  await vm.runInContext(`(async () => {${startup}\n})()`, context);
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
  assert.deepEqual(result.links, [['Opening the game link', 0]]);
  assert.deepEqual(result.loads, [], 'the folder handle is left alone');
  assert.equal(result.context.linkUrl, 'http://127.0.0.1:8323');
  assert.deepEqual(result.notes, [], 'the probe owns whatever is said next');
});
