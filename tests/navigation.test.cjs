const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'ba_dashboard.py'), 'utf8');

function board() {
  const entries = ['#today'];
  let position = 0;
  const listeners = {};
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, {hidden:false, addEventListener(type, fn){this[type] = fn;}});
    return elements.get(id);
  };
  const location = {hash:'#today'};
  const context = vm.createContext({$, location,
    history:{
      replaceState(_, __, hash){entries[position] = location.hash = hash;},
      pushState(_, __, hash){entries.splice(++position); entries.push(location.hash = hash);},
    },
    localStorage:{getItem(){return null;}, setItem(){}},
    document:{querySelectorAll(){return [];}},
    window:{scrollY:0, addEventListener(type, fn){listeners[type] = fn;}},
    drawChart(){}, wireReveal(){}, requestAnimationFrame(){}, inkHome(){}, icon(){return '';},
  });
  vm.runInContext(source.slice(source.indexOf('const SEC_PAGE ='), source.indexOf('/* The business a finding')), context);
  vm.runInContext(source.slice(source.indexOf('const PAGES ='), source.indexOf('/* --- which kinds of finding')), context);
  return {context, entries, $, move(delta){
    position = Math.max(0, Math.min(entries.length - 1, position + delta));
    location.hash = entries[position];
    listeners.hashchange();
  }, page(){return vm.runInContext('page', context);}};
}

test('Today finding opens its page and Back returns to Today', () => {
  const b = board();
  b.context.reveal('secDetail');
  assert.equal(b.page(), 'results');
  b.move(-1);
  assert.equal(b.page(), 'today');
  b.move(1);
  assert.equal(b.page(), 'results');
});

test('top menu preserves the sequence through Back and Forward without duplicates', () => {
  const b = board();
  for (const id of ['results', 'supply', 'supply']) {
    b.$('nav').click({preventDefault(){}, target:{closest(){return {dataset:{id}};}}});
  }
  assert.deepEqual(b.entries, ['#today', '#results', '#supply']);
  b.move(-1); assert.equal(b.page(), 'results');
  b.move(-1); assert.equal(b.page(), 'today');
  b.move(1); assert.equal(b.page(), 'results');
  b.move(1); assert.equal(b.page(), 'supply');
  assert.equal(b.entries.length, 3);
});

test('startup normalises the current entry without creating an extra visit', () => {
  const b = board();
  b.context.location.hash = '';
  b.context.renderAll = b.context.wireNav = b.context.wireCoin = b.context.wireSphere = () => {};
  vm.runInContext(source.slice(source.indexOf('function boot(){'), source.indexOf('/* A page written with its numbers')), b.context);
  b.context.boot();
  assert.deepEqual(b.entries, ['#today']);
  b.context.showPage('results');
  b.move(-1);
  assert.equal(b.page(), 'today');
});

test('replaying a section hash keeps that history entry intact', () => {
  const b = board();
  b.context.history.pushState(null, '', '#secStock');
  b.move(0);
  assert.equal(b.page(), 'supply');
  assert.equal(b.context.location.hash, '#secStock');
  assert.deepEqual(b.entries, ['#today', '#secStock']);
  b.move(-1);
  assert.equal(b.page(), 'today');
});

test('Supply Map has an unambiguous link and fresh section navigation selects the flow view', () => {
  const b = board();
  b.context.showSub('supply','orders');
  assert.match(b.$('supplyNav').innerHTML,/href="#secFlow" data-id="map"/);
  b.context.location.hash='#secFlow';
  b.context.renderAll=b.context.wireNav=b.context.wireCoin=b.context.wireSphere=()=>{};
  vm.runInContext(source.slice(source.indexOf('function boot(){'), source.indexOf('/* A page written with its numbers')),b.context);
  b.context.boot();
  assert.equal(b.page(),'supply');
  assert.equal(vm.runInContext('sub.supply',b.context),'map');
});

for(const [pageId,view,anchor] of [
  ['supply','orders','secLogistics'],['supply','checks','secStock'],
  ['growth','market','secMarket'],['growth','plan','secPlan'],
]) test(`modified-click destination boots ${pageId}/${view}`,()=>{
  const b=board();b.context.showSub(pageId,view);
  const nav=b.$(pageId==='supply'?'supplyNav':'growthNav');
  assert.ok(nav.innerHTML.includes(`href="#${anchor}" data-id="${view}"`));
  let prevented=false;
  nav.click({ctrlKey:true,preventDefault(){prevented=true;},target:{closest(){return {dataset:{id:view}};}}});
  assert.equal(prevented,false);
  b.context.location.hash='#'+anchor;
  b.context.renderAll=b.context.wireNav=b.context.wireCoin=b.context.wireSphere=()=>{};
  vm.runInContext(source.slice(source.indexOf('function boot(){'),source.indexOf('/* A page written with its numbers')),b.context);
  b.context.boot();assert.equal(b.page(),pageId);
  assert.equal(vm.runInContext(`sub.${pageId}`,b.context),view);
});
