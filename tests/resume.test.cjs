const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const startup = source.slice(source.indexOf('    // A folder chosen on an earlier visit:'), source.lastIndexOf('  });'));

async function resume(permission, options = {}) {
  const loads = [];
  const notes = [];
  const handle = {name:'Saves', async queryPermission(){
    if (options.fail) throw new Error('Unavailable');
    if (options.supersede) context.sourceGen++;
    return permission;
  }, requestPermission(){throw new Error('Startup must not request permission');}};
  const context = vm.createContext({
    canHandle:options.supported !== false, dirHandle:null, sourceGen:0,
    handles:{async get(){return options.missing ? null : handle;}},
    runtimeReady:true, pick:{dir:'character', name:'chosen.hsg'},
    place(){}, idleState(){}, wireLanding(){},
    note(...args){notes.push(args);},
    async loadFromHandle(value){loads.push(value);},
  });
  await vm.runInContext(`(async () => {${startup}\n})()`, context);
  return {loads, notes, handle};
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
