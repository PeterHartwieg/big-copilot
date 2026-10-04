const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../web/i18n.js'), 'utf8');
const rule = {allowed:['n:'], required:[['n:']], maxLength:2000};
function load(hosted=true, fetch=async () => {throw Error('offline');}){
  const ctx = vm.createContext({console, Intl, URLSearchParams, setTimeout, clearTimeout, fetch});
  vm.runInContext(hosted ? source.replace('/*__TT_SITE__*/false','/*__TT_SITE__*/true').replace('/*__TT_CATALOGUES__*/null','{"it":"catalogue"}') : source, ctx);
  return {ctx, run:s => vm.runInContext(s,ctx)};
}
test('current community text overrides bundled; stale, unknown and invalid text fall back', () => {
  const {ctx,run}=load();
  ctx.bundled={'comm.good':'Bundled {n}', 'comm.stale':'Old {n}'};
  ctx.manifest={schemaVersion:1,lang:'it',revision:'new',entries:{'comm.good':{sourceVersion:'good',validation:rule},'comm.stale':{sourceVersion:'fresh',validation:rule}}};
  ctx.overlay={schemaVersion:1,lang:'it',revision:'old',translations:{'comm.good':{text:'Attività {n}',sourceVersion:'good'},'comm.stale':{text:'Wrong {n}',sourceVersion:'stale'},'comm.unknown':{text:'Oops',sourceVersion:'good'}}};
  assert.deepEqual(JSON.parse(run('JSON.stringify(ttCommunityMerge("it",bundled,manifest,overlay))')), {'comm.good':'Attività {n}','comm.stale':'Old {n}'});
  ctx.overlay.translations['comm.good'].text='<img>{n}';
  assert.equal(run('ttCommunityMerge("it",bundled,manifest,overlay)["comm.good"]'),'Bundled {n}');
});
test('community boundary allows punctuation but rejects HTML, encoded markup and broken fields', () => {
  const {ctx,run}=load(); ctx.rule={allowed:[],required:[],maxLength:2000};
  for(const text of ['L\'attività "migliore"', 'Dati & numeri']) {ctx.text=text;assert.equal(run('ttCommunityValid(text,rule)'),true);}
  for(const text of ['<img>', '&lt;img&gt;', '&#60;img&#62;', '&amp;lt;img&amp;gt;', '{broken','x'.repeat(2001)]) {ctx.text=text;assert.equal(run('ttCommunityValid(text,rule)'),false,text);}
});
test('hosted offline API keeps bundled language and English causes no requests', async () => {
  const calls=[];
  const {run}=load(true,async url => {calls.push(url);if(url.startsWith('/i18n/'))return {ok:true,json:async()=>({'comm.word':'Parola'})};throw Error('offline');});
  await run('setUiLang("en")');assert.equal(calls.length,0);
  await run('setUiLang("it")');await new Promise(r=>setImmediate(r));
  assert.equal(run('tt("comm.word","Word")'),'Parola');
  assert.equal(run('ttNumLocale()'),'it-IT');
  assert(calls.includes('/api/translations/overlay?lang=it'));
});
test('local loader never requests community data', async () => {
  const calls=[];const {run}=load(false, async url => {calls.push(url); return {ok:true,json:async()=>({'comm.word':'Parola'})};});
  await run('setUiLang("it")');await new Promise(r=>setImmediate(r));
  assert.deepEqual(calls,['i18n/it.json']);
});
test('late overlays cannot overwrite a newer language choice', async () => {
  let resolve;const pending=new Promise(r=>resolve=r);
  const {run}=load(true,async url => {
    if(url.startsWith('/i18n/'))return {ok:true,json:async()=>({'comm.good':'Bundled {n}'})};
    if(url.startsWith('/translations/'))return {ok:true,json:async()=>({schemaVersion:1,lang:'it',entries:{'comm.good':{sourceVersion:'good',validation:rule}}})};
    await pending;return {ok:true,json:async()=>({schemaVersion:1,lang:'it',translations:{'comm.good':{text:'Comunità {n}',sourceVersion:'good'}}})};
  });
  await run('setUiLang("it")');await run('setUiLang("en")');resolve();await new Promise(r=>setImmediate(r));
  assert.equal(run('ttLang'),'en');
});
test('an empty Italian bundle adopts a current community overlay after bundled fallback', async () => {
  const {run}=load(true,async url => {
    const data=url.startsWith('/i18n/')?{}:url.startsWith('/translations/')?
      {schemaVersion:1,lang:'it',revision:'catalogue',entries:{'comm.good':{sourceVersion:'good',validation:rule}}}:
      {schemaVersion:1,lang:'it',revision:7,translations:{'comm.good':{text:'Attività {n}',sourceVersion:'good'}}};
    return {ok:true,json:async()=>data};
  });
  await run('setUiLang("it")');await new Promise(r=>setImmediate(r));
  assert.equal(run('ttLang'),'it');
  assert.equal(run('tt("comm.good","English {n}",{n:2})'),'Attività 2');
  assert.equal(run('ttNumLocale()'),'it-IT');
});

test('an older open page rejects a newer deployment manifest even when overlay matches it', async () => {
  const {run}=load(true,async url => {
    const data=url.startsWith('/i18n/')?{}:url.startsWith('/translations/')?
      {schemaVersion:1,lang:'it',revision:'new-deployment',entries:{'comm.good':{sourceVersion:'new-source',validation:rule}}}:
      {schemaVersion:1,lang:'it',translations:{'comm.good':{text:'Nuovo {n}',sourceVersion:'new-source'}}};
    return {ok:true,json:async()=>data};
  });
  await run('setUiLang("it")');await new Promise(r=>setImmediate(r));
  assert.equal(run('tt("comm.good","Old wording {n}",{n:2})'),'Old wording 2');
});

test('the actual picker cancels pending Italian overlay when its empty bundle falls back to English', async () => {
  let release;const delayed=new Promise(resolve=>release=resolve);
  const {ctx,run}=load(true,async url => {
    if(url.startsWith('/i18n/'))return {ok:true,json:async()=>({})};
    if(url.startsWith('/translations/'))return {ok:true,json:async()=>({schemaVersion:1,lang:'it',revision:'catalogue',entries:{'comm.good':{sourceVersion:'good',validation:rule}}})};
    await delayed;return {ok:true,json:async()=>({schemaVersion:1,lang:'it',translations:{'comm.good':{text:'Italiano {n}',sourceVersion:'good'}}})};
  });
  Object.assign(ctx,{gnKnown:()=>true,gnLoad:async()=>({}),gnRemember:()=>{},setGameNames:async()=>true,gnPaint:()=>{},gnRedraw:()=>{}});
  const board=fs.readFileSync(require('node:path').join(__dirname,'../template/board.js'),'utf8');
  run(board.slice(board.indexOf('const gnUiLang ='),board.indexOf('/* "Machine-translated. Help check it"')));
  await run('gnSwitch("it")');assert.equal(run('ttLang'),'en');assert.equal(run('ttWant'),'it');
  await run('gnSwitch("en")');release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(run('ttLang'),'en');assert.equal(run('ttWant'),'en');
  assert.equal(run('tt("comm.good","English {n}",{n:2})'),'English 2');
});
