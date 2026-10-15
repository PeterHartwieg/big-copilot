'use strict';
const {test, before, beforeEach, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {Miniflare, convertV4MiniflareOptions, Response} = require('miniflare');
const ROOT = path.resolve(__dirname, '..');
const V1 = 'a'.repeat(64), V2 = 'b'.repeat(64);
const BASE = {schemaVersion:1, lang:'it', revision:'catalogue-1', entries:[
  {key:'greeting', en:'Hello {n}', text:'Ciao {n}', drafted:true, area:'Board', context:'A synthetic greeting', sourceVersion:V1,
    validation:{allowed:['n:'], required:[['n:']], maxLength:2000}},
  {key:'plain', en:'Plain text', text:null, drafted:false, area:'Board', context:'Synthetic text', sourceVersion:V1,
    validation:{allowed:[], required:[], maxLength:2000}},
  {key:'aliases', en:'Sell {item} for {w:$}', text:'Vendi {item} per {w:$}', drafted:true, area:'Board', context:'Synthetic alias', sourceVersion:V1,
    validation:{allowed:['item:', 'item_name:', 'w:$'], required:[['item:', 'item_name:'], ['w:$']], maxLength:2000}},
]};
// stamp stands in for web/version.json's build stamp; each test is its own
// deployment, so overlays cached by an earlier test never answer a later one.
// catTags[lang], when set, is the ETag ASSETS sends with that catalogue, and it
// answers a matching If-None-Match with 304, as Workers Static Assets does.
// assetHold[lang], when set, parks that catalogue's response until released, and
// assetFull[lang] answers with the full body even to a matching If-None-Match.
let assetHold = {}, assetFull = {};
let cats, catTags = {}, mf, db, script, ipSeq = 1, stamp = null, stampSeq = 0, assetReads = {};
const ip = () => `10.98.${Math.floor(++ipSeq / 250)}.${ipSeq % 250 + 1}`;
const {migrate} = require('./_community.cjs');
// wrangler.jsonc is the source of truth for the translation suggestion budget.
function limiterFromConfig(name) {
  const config = fs.readFileSync(path.join(ROOT,'wrangler.jsonc'),'utf8');
  const m = new RegExp(`"name":\\s*"${name}",\\s*"namespace_id":\\s*"(\\d+)",\\s*"simple":\\s*\\{\\s*"limit":\\s*(\\d+),\\s*"period":\\s*(\\d+)`).exec(config);
  assert.ok(m,`wrangler.jsonc declares ${name}`);
  return {namespace_id:m[1], simple:{limit:Number(m[2]), period:Number(m[3])}};
}
function options() {
  return {modules:true, script, compatibilityDate:'2026-09-01', d1Databases:['COMMUNITY_DB'],
    bindings:{COMMUNITY_IP_SECRET:'synthetic-translation-secret'},
    ratelimits:{COMMUNITY_LIMITER:{namespace_id:'1001',simple:{limit:120,period:60}},
      TRANSLATION_SUGGEST_LIMITER:limiterFromConfig('TRANSLATION_SUGGEST_LIMITER')},
    serviceBindings:{ASSETS:async request => {
      const pathname = new URL(request.url).pathname;
      assetReads[pathname] = (assetReads[pathname] || 0) + 1;
      if (pathname === '/version.json') return stamp ? Response.json({version:stamp, latest:null}) : new Response('missing',{status:404});
      const lang = /^\/translations\/([^/]+)\.json$/.exec(pathname)?.[1];
      if (!lang) return new Response('static fixture');
      if (!cats[lang]) return new Response('missing',{status:404});
      if (assetHold[lang]) { assetHold[lang].arrived(); await assetHold[lang].release; }
      const tag = catTags[lang];
      if (tag && !assetFull[lang] && request.headers.get('if-none-match') === tag) return new Response(null,{status:304,headers:{etag:tag}});
      return Response.json(cats[lang], tag ? {headers:{etag:tag}} : undefined);
    }}};
}
async function fetchApi(route, {body, voter=ip(), instance=mf, headers={}, method}={}) {
  return instance.dispatchFetch('https://translations.test'+route, {
    method:method || (body === undefined ? 'GET' : 'POST'),
    headers:{Origin:'https://translations.test','CF-Connecting-IP':voter,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},
    ...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),
  });
}
async function json(response, status=200) {
  const data = await response.json();
  assert.equal(response.status,status,JSON.stringify(data)); return data;
}
const fields = (key='greeting',version=V1,lang='it') => ({lang,key,sourceVersion:version});
const suggest = (text, voter=ip(), key='greeting', version=V1, lang='it') => fetchApi('/api/translations/suggest',{body:{...fields(key,version,lang),text},voter});
const vote = (candidateId, voter=ip(), key='greeting', version=V1) => fetchApi('/api/translations/vote',{body:{...fields(key,version),candidateId},voter});
const entry = (voter=ip(), key='greeting', version=V1) => fetchApi('/api/translations/entry?'+new URLSearchParams(fields(key,version)),{voter});
const selected = data => data.candidates.find(c=>c.id===data.selectedId);

before(async()=>{
  script = (await require('esbuild').build({stdin:{resolveDir:ROOT,contents:`
    import worker from './server/worker.mjs';
    export default {async fetch(request,env,ctx) {
      if(new URL(request.url).pathname==='/__scheduled') {
        await worker.scheduled({},env,ctx); return new Response('ok');
      }
      return worker.fetch(request,env,ctx);
    }};`},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;
  mf = new Miniflare(convertV4MiniflareOptions(options())); await mf.ready;
  db=await mf.getD1Database('COMMUNITY_DB'); await migrate(db);
});
beforeEach(async()=>{
  cats={it:structuredClone(BASE),de:{...structuredClone(BASE),lang:'de'}}; catTags={}; assetHold={}; assetFull={};
  stamp=`stamp-${++stampSeq}`; assetReads={};
  await db.prepare('DELETE FROM translation_votes').run();
  await db.prepare('DELETE FROM translation_candidates').run();
  await db.prepare('DELETE FROM translation_entries').run();
  await db.prepare('DELETE FROM translation_revisions').run();
});
after(async()=>{if(mf) await mf.dispose();});

test('bundled starts with zero votes; first suggestion wins; repeats are idempotent',async()=>{
  const user=ip();
  const initial=await json(await entry(user));
  assert.equal(initial.selectedId,'bundled'); assert.equal(selected(initial).votes,0);
  const first=await json(await suggest('Salve {n}',user));
  assert.equal(selected(first).text,'Salve {n}'); assert.equal(selected(first).votes,1); assert.equal(selected(first).voted,true);
  const repeat=await json(await suggest('Salve {n}',user));
  assert.deepEqual(repeat,first);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_candidates').first()).n,2);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_votes').first()).n,1);
});

test('ties keep incumbent; vote switching moves exactly one vote; bundled can win',async()=>{
  const a=ip(),b=ip(),c=ip();
  let data=await json(await suggest('Salve {n}',a)); const idA=data.selectedId;
  data=await json(await suggest('Buongiorno {n}',b));
  const idB=data.candidates.find(c=>c.text==='Buongiorno {n}').id;
  assert.equal(data.selectedId,idA);
  data=await json(await vote(idB,c)); assert.equal(data.selectedId,idB); assert.equal(selected(data).votes,2);
  data=await json(await vote(idA,b)); assert.equal(data.selectedId,idA);
  assert.deepEqual(data.candidates.filter(c=>c.voted).map(c=>c.id),[idA]);
  assert.equal(data.candidates.find(c=>c.id===idB).votes,1);
  data=await json(await vote('bundled',a)); assert.equal(data.selectedId,idA,'one vote each retains incumbent');
  data=await json(await vote('bundled',b)); assert.equal(data.selectedId,'bundled'); assert.equal(selected(data).votes,2);
  assert.deepEqual((await json(await fetchApi('/api/translations/overlay?lang=it'))).translations,{});
});

test('new bundled drafts preserve existing community choices, alternatives and votes',async()=>{
  const user=ip();
  cats.it.entries[0].text=null;
  const before=await json(await suggest('Salve {n}',user));
  const choice=before.selectedId;
  cats.it.entries[0].text='Ciao {n}';
  cats.it.revision='catalogue-with-italian-drafts';
  await fetchApi('/__scheduled');
  const after=await json(await entry(user));
  assert.equal(after.selectedId,choice);
  assert.equal(selected(after).text,'Salve {n}');
  assert.equal(selected(after).votes,1);
  assert.equal(selected(after).voted,true);
  assert.equal(after.candidates.find(c=>c.id==='bundled').votes,0);
  assert.ok(after.candidates.some(c=>c.text==='Hello {n}'),'previous wording remains available');
  const overlay=await json(await fetchApi('/api/translations/overlay?lang=it'));
  assert.deepEqual(overlay.translations.greeting,{text:'Salve {n}',sourceVersion:V1});
  const votes=(await db.prepare('SELECT COUNT(*) n FROM translation_votes').first()).n;
  assert.equal(votes,1);
});

test('simultaneous duplicate suggestions collapse; simultaneous switches preserve tally and winner',async()=>{
  const user=ip();
  const results=await Promise.all(Array.from({length:8},()=>suggest('Salve {n}',user)));
  for(const response of results) assert.equal(selected(await json(response)).votes,1);
  const other=await json(await suggest('Buongiorno {n}',ip()));
  const first=other.candidates.find(c=>c.text==='Salve {n}').id;
  const second=other.candidates.find(c=>c.text==='Buongiorno {n}').id;
  await Promise.all(Array.from({length:10},(_,i)=>vote(i%2?first:second,user).then(json)));
  const final=await json(await entry(user));
  assert.equal(final.candidates.reduce((n,c)=>n+c.votes,0),2);
  assert.equal(final.candidates.filter(c=>c.voted).length,1);
  assert.equal(selected(final).votes,Math.max(...final.candidates.map(c=>c.votes)));
});

test('plain punctuation is allowed; malformed tokens, missing aliases, markup and controls are rejected',async()=>{
  const good=await json(await suggest(`L'azienda dice "ciao" & grazie {n}`,ip()));
  assert.equal(selected(good).text,`L'azienda dice "ciao" & grazie {n}`);
  await json(await suggest('Vendi {item_name} per {w:$}',ip(),'aliases'));
  for(const text of ['ciao','{n:$}','{unknown}','{n} {oops','{n} <img src=x onerror=alert(1)>','{n} &lt;script&gt;','{n} &#60;img','{n}\u0000','{n}\u0085','{n} '+'x'.repeat(2000),'   ']) {
    const result=await json(await suggest(text),400); assert.equal(result.error,'invalid_translation',text);
  }
  await json(await suggest('Vendi {item} per {w}',ip(),'aliases'),400);
  await json(await suggest('Vendi {w:$}',ip(),'aliases'),400);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_votes').first()).n,2);
});

test('a tagged phrase accepts exactly its English tags, in any order, and refuses every other markup',async()=>{
  cats.it.entries.push({key:'tagged', en:'<b>{n}</b> shops <span class="ok">ready</span>', text:null, drafted:false, area:'Board',
    context:'Synthetic markup', sourceVersion:V1,
    validation:{allowed:['n:'], required:[['n:']], maxLength:2000, markup:['</b>','</span>','<b>','<span class="ok">']}});
  for(const text of ['{n} negozi pronti','<b>{n}</b> negozi pronti','<b>{n}</b> <span class="ok" onclick="x">pronti</span>',
    '<b>{n}</b> <span class="ok">pronti</span> <img src=x onerror=alert(1)>','<b>{n} <span class="ok">pronti</b></span>',
    '<b>{n}</b> <span class="ok">pronti</span> &lt;b&gt;']) {
    const result=await json(await suggest(text,ip(),'tagged'),400); assert.equal(result.error,'invalid_translation',text);
  }
  const good='<span class="ok">Pronti</span>: <b>{n}</b> negozi';
  assert.equal(selected(await json(await suggest(good,ip(),'tagged'))).text,good);
  const overlay=await json(await fetchApi('/api/translations/overlay?lang=it'));
  assert.equal(overlay.translations.tagged.text,good);
});

test('source versions isolate history and reject stale writes; nightly cleanup removes only retired vote hashes',async()=>{
  const user=ip();
  const old=await json(await suggest('Salve {n}',user));
  const oldHash=(await db.prepare('SELECT voter_hash FROM translation_votes').first()).voter_hash;
  cats.it.entries[0].sourceVersion=V2; cats.it.entries[0].en='Welcome {n}';
  await json(await entry(user),409); await json(await suggest('Vecchio {n}',user),409); await json(await vote(old.selectedId,user),409);
  const fresh=await json(await entry(user,'greeting',V2)); assert.equal(fresh.selectedId,'bundled'); assert.equal(selected(fresh).votes,0);
  const updated=await json(await suggest('Benvenuto {n}',user,'greeting',V2)); assert.notEqual(updated.selectedId,old.selectedId);
  const hashes=(await db.prepare('SELECT voter_hash FROM translation_votes').all()).results.map(r=>r.voter_hash);
  assert.equal(new Set(hashes).size,2); assert.ok(hashes.includes(oldHash));
  const overview=await json(await fetchApi('/api/translations?lang=it'));
  assert.equal(overview.entries.greeting.sourceVersion,V2); assert.ok(!JSON.stringify(overview).includes('Salve'));
  const response=await fetchApi('/__scheduled'); assert.equal(response.status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_votes').first()).n,1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_candidates WHERE source_version=?').bind(V1).first()).n,2,'history retained');
});

test('public summary and overlay contain no voter identity; private entry voted flags are isolated',async()=>{
  const user=ip(); await json(await suggest('Salve {n}',user));
  const mine=await entry(user); assert.match(mine.headers.get('cache-control'),/private, no-store/);
  assert.equal(selected(await json(mine)).voted,true); assert.equal(selected(await json(await entry(ip()))).voted,false);
  for(const endpoint of ['/api/translations?lang=it','/api/translations/overlay?lang=it']) {
    const response=await fetchApi(endpoint); const data=await json(response);
    assert.match(response.headers.get('cache-control'),/^public/);
    assert.doesNotMatch(JSON.stringify(data),/voted|voter|hash|10\.98|synthetic-translation-secret/);
  }
  const overlay=await json(await fetchApi('/api/translations/overlay?lang=it'));
  assert.deepEqual(overlay.translations.greeting,{text:'Salve {n}',sourceVersion:V1});
  const stored=(await db.prepare('SELECT * FROM translation_votes').all()).results;
  assert.doesNotMatch(JSON.stringify(stored),/10\.98/); assert.match(stored[0].voter_hash,/^[a-f0-9]{64}$/);
  await json(await suggest('Salve {n}',user,'greeting',V1,'de'));
  assert.equal(new Set((await db.prepare('SELECT voter_hash FROM translation_votes').all()).results.map(v=>v.voter_hash)).size,2);
});

test('moderation hides and atomically releases pins; restore-pin and unpin preserve vote history',async()=>{
  const {moderationCommand}=await import(pathToFileURL(path.join(ROOT,'tools/translation_moderate.mjs')));
  let data=await json(await suggest('Salve {n}',ip())); const idA=data.selectedId;
  data=await json(await suggest('Buongiorno {n}',ip())); const idB=data.candidates.find(c=>c.text==='Buongiorno {n}').id;
  await json(await vote(idA,ip()));
  await db.prepare(moderationCommand(['restore-pin',idB]).sql).run();
  data=await json(await entry()); assert.equal(data.selectedId,idB); assert.equal(data.pinned,true);
  await db.prepare(moderationCommand(['hide',idB]).sql).run();
  data=await json(await entry()); assert.equal(data.selectedId,idA); assert.equal(data.pinned,false); assert.ok(!data.candidates.some(c=>c.id===idB));
  await json(await vote(idB),404); await json(await suggest('Buongiorno {n}'),404);
  await db.prepare(moderationCommand(['restore-pin',idB]).sql).run();
  assert.equal((await json(await entry())).selectedId,idB);
  await db.prepare(moderationCommand(['unpin',idB]).sql).run();
  assert.equal((await json(await entry())).selectedId,idA);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_votes').first()).n,3);
  assert.ok(moderationCommand(['list']).args.includes('--local')); assert.ok(moderationCommand(['list','--remote']).args.includes('--remote'));
  assert.throws(()=>moderationCommand(['hide',"x'; DROP TABLE translation_votes; --"]));
  assert.doesNotMatch(moderationCommand(['list']).sql,/voter_hash|SELECT \*/);
});

test('a full entry has a bounded list, rejects excess candidates atomically and still accepts existing votes',async()=>{
  // Consume each Miniflare response immediately. Holding unread streams until
  // every request finishes lets Undici's original Response be garbage-collected
  // and cancel its stream beneath Miniflare's wrapper during a busy suite.
  const statuses=await Promise.all(Array.from({length:36},async(_,i)=>{
    const text=`Versione ${i} {n}`,response=await suggest(text,ip());
    const payload=await response.json();
    assert.ok([200,409].includes(response.status),JSON.stringify(payload));
    if(response.status===200){
      const candidate=payload.candidates.find(candidate=>candidate.text===text);
      assert.ok(candidate,'accepted suggestion is present in its response');
      assert.equal(candidate.votes,1);assert.equal(candidate.voted,true);
    }else assert.equal(payload.error,'candidate_limit');
    return response.status;
  }));
  assert.equal(statuses.filter(status=>status===200).length,31,'bundled text plus 31 alternatives fills the entry');
  assert.equal(statuses.filter(status=>status===409).length,5,'the other concurrent suggestions hit the cap');
  const data=await json(await entry()); assert.equal(data.candidates.length,32);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_candidates').first()).n,32);
  const failure=await json(await suggest('Ancora {n}'),409); assert.equal(failure.error,'candidate_limit');
  const voter=ip(),candidateId=data.candidates[1].id;
  const first=await json(await vote(candidateId,voter));
  assert.deepEqual(await json(await vote(candidateId,voter)),first,'existing votes remain idempotent at the cap');
});

test('summary paginates sparse current entries and includes old alternative wording for searching',async()=>{
  for(let i=0;i<53;i++) {
    const key=`phrase_${String(i).padStart(3,'0')}`;
    cats.it.entries.push({...structuredClone(BASE.entries[1]),key});
    await json(await suggest(`Testo ${i}`,ip(),key));
  }
  await json(await suggest('Alternativa precedente',ip(),'phrase_000'));
  let page=await json(await fetchApi('/api/translations?lang=it'));
  assert.equal(Object.keys(page.entries).length,50); assert.equal(page.nextCursor,'phrase_049');
  assert.equal(page.entries.phrase_000.candidates.length,3);
  page=await json(await fetchApi('/api/translations?lang=it&cursor='+page.nextCursor));
  assert.equal(Object.keys(page.entries).length,3); assert.equal(page.nextCursor,null);
});

test('invalid envelopes, cross-origin writes, unknown ids, oversized bodies and unsupported methods fail before storing',async()=>{
  await json(await fetchApi('/api/translations/suggest',{body:{...fields(),text:'ciao {n}',save:{secret:true}}}),400);
  await json(await fetchApi('/api/translations/suggest',{body:{...fields(),text:'ciao {n}'},headers:{Origin:'https://evil.test'}}),400);
  await json(await fetchApi('/api/translations/suggest',{body:'{'}),400);
  await json(await fetchApi('/api/translations/suggest',{body:[]}),400);
  await json(await fetchApi('/api/translations/suggest',{body:{...fields(),text:'ciao {n}'},headers:{'Content-Type':'text/plain'}}),400);
  await json(await suggest('ciao {n}',ip(),'missing'),404);
  await json(await suggest('ciao {n}',ip(),'greeting',V1,'xx'),404);
  await json(await vote('f'.repeat(64)),404);
  await json(await fetchApi('/api/translations/suggest',{body:'x'.repeat(17000)}),413);
  await json(await fetchApi('/api/translations/entry',{method:'POST',body:{}}),405);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_candidates').first()).n,0);
});

test('an unknown or malformed language is unknown_language on every route, with the code alone',async()=>{
  for(const lang of ['xx','../it','']) {
    const query=new URLSearchParams({lang}).toString();
    for(const response of [
      await fetchApi('/api/translations?'+query),
      await fetchApi('/api/translations/entry?'+new URLSearchParams(fields('greeting',V1,lang))),
      await fetchApi('/api/translations/overlay?'+query),
      await suggest('Salve {n}',ip(),'greeting',V1,lang),
      await fetchApi('/api/translations/vote',{body:{...fields('greeting',V1,lang),candidateId:'bundled'}}),
    ]) {
      assert.equal(response.headers.get('cache-control'),'private, no-store');
      assert.deepEqual(await json(response,404),{error:'unknown_language'},`${lang} ${response.url}`);
    }
  }
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_candidates').first()).n,0);
});

test('a summary cursor over 240 characters is invalid_cursor',async()=>{
  await json(await suggest('Salve {n}',ip()));
  assert.deepEqual(await json(await fetchApi('/api/translations?lang=it&cursor='+'z'.repeat(241)),400),{error:'invalid_cursor'});
  // 240 characters is still a cursor: the page starts after it.
  assert.deepEqual(Object.keys((await json(await fetchApi('/api/translations?lang=it&cursor='+'a'.repeat(240)))).entries),['greeting']);
});

test('reads and votes share the community budget: 429 after it, with Retry-After',async()=>{
  // A small stand-in for COMMUNITY_LIMITER, so the budget runs out in a few requests.
  const limit=4,period=60,config=options();
  config.ratelimits={...config.ratelimits,COMMUNITY_LIMITER:{namespace_id:'1001',simple:{limit,period}}};
  const scoped=new Miniflare(convertV4MiniflareOptions(config));
  try {
    await scoped.ready; await migrate(await scoped.getD1Database('COMMUNITY_DB'));
    const windowOf=()=>Math.floor(Date.now()/(period*1000));
    let run=null;
    // As in the suggestion budget test: a run across a window boundary proves nothing.
    for(let tries=1;!run;tries++) {
      const start=windowOf(),voter=ip(),at=route=>fetchApi(route,{voter,instance:scoped});
      const responses=[
        await at('/api/translations?lang=it'),
        await at('/api/translations/entry?'+new URLSearchParams(fields())),
        await at('/api/translations/overlay?lang=it'),
        await fetchApi('/api/translations/vote',{body:{...fields(),candidateId:'bundled'},voter,instance:scoped}),
        await at('/api/translations/entry?'+new URLSearchParams(fields())),
        await fetchApi('/api/translations/vote',{body:{...fields(),candidateId:'bundled'},voter,instance:scoped}),
      ];
      const statuses=responses.map(r=>r.status),retry=responses.at(-1).headers.get('retry-after');
      const bodies=await Promise.all(responses.map(r=>r.json()));
      if(windowOf()===start) run={statuses,body:bodies.at(-1),retry};
      else assert.ok(tries<3,'three runs in a row straddled a limiter window');
    }
    assert.deepEqual(run.statuses,[...Array(limit).fill(200),429,429]);
    assert.deepEqual(run.body,{error:'Too many requests'});
    assert.equal(run.retry,'60');
  } finally {await scoped.dispose();}
});

test('text length is code points and JSON body allows a legitimate 2000-character translation',async()=>{
  const data=await json(await suggest('😀'.repeat(2000),ip(),'plain'));
  assert.equal([...selected(data).text].length,2000);
  await json(await suggest('😀'.repeat(2001),ip(),'plain'),400);
});

test('suggestions have their own budget: 429 after it, no candidate written, votes still accepted',async()=>{
  const {limit,period}=limiterFromConfig('TRANSLATION_SUGGEST_LIMITER').simple;
  // Miniflare's simulated limiter counts in wall-clock-aligned windows, so a run
  // that straddles a window boundary starts a fresh budget halfway and proves
  // nothing: discard it and run again on a fresh connection.
  const windowOf=()=>Math.floor(Date.now()/(period*1000));
  let run=null;
  for(let tries=1;!run;tries++) {
    await db.prepare('DELETE FROM translation_votes').run();
    await db.prepare('DELETE FROM translation_candidates').run();
    const start=windowOf(),user=ip(),statuses=[];
    let firstId=null;
    for(let i=0;i<=limit;i++) {
      const response=await suggest(`Variante ${tries}.${i} {n}`,user),payload=await response.json();
      statuses.push(response.status);
      if(response.status===200) firstId??=payload.selectedId;
      else assert.equal(response.headers.get('retry-after'),'60');
    }
    const candidates=(await db.prepare('SELECT COUNT(*) n FROM translation_candidates').first()).n;
    const voteStatus=(await vote(firstId,user)).status;
    if(windowOf()===start) run={statuses,candidates,voteStatus};
    else assert.ok(tries<3,'three runs in a row straddled a limiter window');
  }
  assert.deepEqual(run.statuses,[...Array(limit).fill(200),429]);
  // The bundled text plus one row per accepted suggestion; the refused one wrote nothing.
  assert.equal(run.candidates,limit+1);
  assert.equal(run.voteStatus,200,'votes stay on the shared budget');
});

test('database/configuration failures yield generic JSON and preserve static delivery',async()=>{
  for(const missing of ['tables','db','secret']) {
    const config=options(); if(missing==='db') delete config.d1Databases;
    if(missing==='secret') delete config.bindings.COMMUNITY_IP_SECRET;
    const scoped=new Miniflare(convertV4MiniflareOptions(config));
    try {
      await scoped.ready;
      const response=await fetchApi('/api/translations/overlay?lang=it',{instance:scoped});
      const failure=await json(response,503); assert.deepEqual(failure,{error:'Service unavailable'});
      assert.equal(await (await scoped.dispatchFetch('https://translations.test/')).text(),'static fixture');
    } finally {await scoped.dispose();}
  }
});

test('a hidden bundled candidate stays hidden after a later suggestion snapshot',async()=>{
  await json(await suggest('Salve {n}',ip()));
  const base=(await db.prepare('SELECT id FROM translation_candidates WHERE text=?').bind('Ciao {n}').first()).id;
  await db.prepare('UPDATE translation_candidates SET hidden=1 WHERE id=?').bind(base).run();
  const response=await json(await suggest('Buongiorno {n}',ip()));
  assert.ok(!response.candidates.some(c=>c.id==='bundled'));
  await json(await vote('bundled'),404);
});

test('D1 batch failure rolls back suggestion, automatic vote and winner changes together',async()=>{
  await db.prepare("CREATE TRIGGER translation_test_failure BEFORE INSERT ON translation_votes BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END").run();
  try {
    await json(await suggest('Salve {n}'),503);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_entries').first()).n,0);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_candidates').first()).n,0);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_revisions').first()).n,0);
  } finally {await db.prepare('DROP TRIGGER translation_test_failure').run();}
});

test('moderation between the candidate pre-check and mutation reports an unavailable version',async()=>{
  const data=await json(await suggest('Salve {n}'));
  const id=data.selectedId;
  // The first statement of the mutation is after the API's candidate read.
  // This trigger deterministically reproduces a moderator hiding in that gap.
  await db.prepare(`CREATE TRIGGER translation_test_hide BEFORE INSERT ON translation_entries
    BEGIN UPDATE translation_candidates SET hidden=1 WHERE id='${id}'; END`).run();
  try {
    const failure=await json(await vote(id),404);
    assert.equal(failure.error,'unknown_candidate');
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM translation_votes WHERE candidate_id=?').bind(id).first()).n,1,
      'the rejected vote must not join the original suggestion vote');
  } finally {await db.prepare('DROP TRIGGER translation_test_hide').run();}
});

test('overlay excludes unsafe or placeholder-invalid legacy text even if externally inserted and pinned',async()=>{
  const data=await json(await suggest('Salve {n}'));
  await db.prepare('UPDATE translation_candidates SET text=? WHERE id=?').bind('<script>alert(1)</script> {n}',data.selectedId).run();
  assert.deepEqual((await json(await fetchApi('/api/translations/overlay?lang=it'))).translations,{});
});

const overlayOf = (lang='it', headers={}) => fetchApi('/api/translations/overlay?lang='+lang,{headers});
const catalogueReads = lang => assetReads[`/translations/${lang}.json`] || 0;

test('overlay is cached per language, revision and build stamp; a repeat costs no catalogue read',async()=>{
  await json(await suggest('Salve {n}',ip()));
  const revision=(await db.prepare("SELECT revision FROM translation_revisions WHERE lang='it'").first()).revision;
  const reads=catalogueReads('it');
  const first=await overlayOf();
  assert.equal(first.headers.get('cache-control'),'public, max-age=60');
  assert.equal(first.headers.get('etag'),`"v1-${revision}-${stamp}"`);
  const body=await json(first);
  assert.equal(body.revision,revision); assert.deepEqual(body.translations.greeting,{text:'Salve {n}',sourceVersion:V1});
  assert.equal(catalogueReads('it'),reads+1,'a miss computes from the catalogue');
  // A database change that bypasses the revision triggers is invisible to a
  // cached revision, which proves the second answer came from the cache.
  await db.prepare("UPDATE translation_candidates SET text='Ciao ciao {n}' WHERE text='Salve {n}'").run();
  const again=await overlayOf();
  assert.equal(again.headers.get('etag'),`"v1-${revision}-${stamp}"`);
  assert.deepEqual(await json(again),body);
  assert.equal(catalogueReads('it'),reads+1,'a hit reads no catalogue');
  const unchanged=await overlayOf('it',{'If-None-Match':`W/"v1-${revision}-${stamp}", "other"`});
  assert.equal(unchanged.status,304); assert.equal(await unchanged.text(),'');
  assert.equal(unchanged.headers.get('etag'),`"v1-${revision}-${stamp}"`);
  stamp=`${stamp}-next`; // a deployment
  const deployed=await overlayOf('it',{'If-None-Match':`"v1-${revision}-${stamp.slice(0,-5)}"`});
  assert.equal(deployed.status,200,'a new build stamp never revalidates an old overlay');
  assert.deepEqual((await json(deployed)).translations.greeting,{text:'Ciao ciao {n}',sourceVersion:V1});
  assert.equal(catalogueReads('it'),reads+2);
});

test('cached overlays never cross languages at the same revision number',async()=>{
  await json(await suggest('Salve {n}',ip()));
  await json(await suggest('Hallo {n}',ip(),'greeting',V1,'de'));
  const revisions=(await db.prepare('SELECT lang, revision FROM translation_revisions ORDER BY lang').all()).results;
  assert.equal(revisions.length,2); assert.equal(revisions[0].revision,revisions[1].revision,'both languages share one revision number');
  const reads=catalogueReads('it')+catalogueReads('de');
  for(let pass=0;pass<2;pass++) {
    const it=await overlayOf('it'),de=await overlayOf('de');
    assert.notEqual(it.headers.get('etag'),null);
    const [itBody,deBody]=[await json(it),await json(de)];
    assert.equal(itBody.lang,'it'); assert.deepEqual(itBody.translations.greeting,{text:'Salve {n}',sourceVersion:V1});
    assert.equal(deBody.lang,'de'); assert.deepEqual(deBody.translations.greeting,{text:'Hallo {n}',sourceVersion:V1});
  }
  assert.equal(catalogueReads('it')+catalogueReads('de'),reads+2,'one miss per language, then hits');
  await json(await fetchApi('/api/translations/overlay?lang=xx'),404);
});

test('a vote or a moderation action moves the revision and replaces the cached overlay',async()=>{
  const {moderationCommand}=await import(pathToFileURL(path.join(ROOT,'tools/translation_moderate.mjs')));
  let data=await json(await suggest('Salve {n}',ip())); const idA=data.selectedId;
  data=await json(await suggest('Buongiorno {n}',ip())); const idB=data.candidates.find(c=>c.text==='Buongiorno {n}').id;
  const before=await overlayOf(); const tag=before.headers.get('etag');
  const initial=await json(before); assert.equal(initial.translations.greeting.text,'Salve {n}');
  await json(await vote(idB,ip()));
  const voted=await overlayOf('it',{'If-None-Match':tag});
  assert.equal(voted.status,200,'the old tag no longer matches'); assert.notEqual(voted.headers.get('etag'),tag);
  const afterVote=await json(voted); assert.ok(afterVote.revision>initial.revision);
  assert.equal(afterVote.translations.greeting.text,'Buongiorno {n}');
  await db.prepare(moderationCommand(['hide',idB]).sql).run();
  const hidden=await json(await overlayOf());
  assert.ok(hidden.revision>afterVote.revision); assert.equal(hidden.translations.greeting.text,'Salve {n}');
  await db.prepare(moderationCommand(['hide',idA]).sql).run();
  assert.deepEqual((await json(await overlayOf())).translations,{});
});

test('without a readable build stamp the overlay is computed every time and carries no tag',async()=>{
  stamp=null;
  await json(await suggest('Salve {n}',ip()));
  const reads=catalogueReads('it');
  for(let i=0;i<2;i++) {
    const response=await overlayOf();
    assert.equal(response.headers.get('etag'),null);
    assert.equal(response.headers.get('cache-control'),'public, max-age=60');
    assert.deepEqual((await json(response)).translations.greeting,{text:'Salve {n}',sourceVersion:V1});
  }
  assert.equal(catalogueReads('it'),reads+2);
});

test('a Worker deploy that bumps OVERLAY_FORMAT never revalidates a browser copy from the old format',async()=>{
  const source=fs.readFileSync(path.join(ROOT,'server/translations.mjs'),'utf8');
  assert.match(source,/^const OVERLAY_FORMAT = 'v1';$/m);
  const bumped=(await require('esbuild').build({stdin:{resolveDir:ROOT,contents:"import worker from './server/worker.mjs'; export default worker;"},
    bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',plugins:[{name:'overlay-format',setup(build){
      build.onLoad({filter:/translations\.mjs$/},()=>({loader:'js',contents:source.replace("const OVERLAY_FORMAT = 'v1';","const OVERLAY_FORMAT = 'v2';")}));
    }}]})).outputFiles[0].text;
  // Same build stamp, same (empty) revision: only the Worker code differs.
  const old=await overlayOf(); const tag=old.headers.get('etag'); await json(old);
  assert.equal(tag,`"v1-0-${stamp}"`);
  assert.equal((await overlayOf('it',{'If-None-Match':tag})).status,304);
  const scoped=new Miniflare(convertV4MiniflareOptions({...options(),script:bumped}));
  try {
    await scoped.ready; await migrate(await scoped.getD1Database('COMMUNITY_DB'));
    const response=await fetchApi('/api/translations/overlay?lang=it',{instance:scoped,headers:{'If-None-Match':tag}});
    assert.equal(response.status,200,'the old tag no longer matches');
    assert.equal(response.headers.get('etag'),`"v2-0-${stamp}"`);
    assert.deepEqual((await json(response)).translations,{});
  } finally {await scoped.dispose();}
});

// The summary before issue #322 ran these two statements, binding the source map
// twice; the single statement that replaced them must answer every page the same.
async function summaryBefore(lang, cursor='') {
  const crypto=require('node:crypto');
  const cat=new Map(cats[lang].entries.map(e=>[e.key,e]));
  const sources=JSON.stringify(Object.fromEntries([...cat].map(([key,e])=>[key,e.sourceVersion])));
  const pageSql=`SELECT e.key, e.source_version, e.selected_id FROM translation_entries e
      JOIN json_each(?2) current ON current.key = e.key AND current.value = e.source_version
      WHERE e.lang = ?1 AND e.key > ?3 ORDER BY e.key LIMIT ?4`;
  const [keys,rows,revision]=await db.batch([
    db.prepare(pageSql).bind(lang,sources,cursor,51),
    db.prepare(`WITH page AS (${pageSql})
      SELECT c.key, c.id, c.text, COUNT(v.voter_hash) AS votes FROM page
      JOIN translation_candidates c ON c.lang = ?1 AND c.key = page.key AND c.source_version = page.source_version
      LEFT JOIN translation_votes v ON v.candidate_id = c.id
      WHERE c.hidden = 0 GROUP BY c.id ORDER BY c.key, c.created_at, c.id`).bind(lang,sources,cursor,50),
    db.prepare('SELECT revision FROM translation_revisions WHERE lang = ?1').bind(lang),
  ]);
  const page=keys.results.slice(0,50), entries={};
  for(const row of page) {
    const e=cat.get(row.key);
    const baseId=crypto.createHash('sha256').update(JSON.stringify([lang,e.key,e.sourceVersion,e.text??e.en])).digest('hex');
    const wire=id=>id===baseId||!id?'bundled':id;
    entries[row.key]={sourceVersion:row.source_version,selectedId:wire(row.selected_id),candidates:
      rows.results.filter(c=>c.key===row.key).map(c=>({id:wire(c.id),text:c.text,votes:c.votes}))};
  }
  return {schemaVersion:1,lang,revision:revision.results[0]?.revision||0,entries,nextCursor:keys.results.length>50?page.at(-1).key:null};
}

test('the one-statement summary answers every page exactly as the two statements did',async()=>{
  for(let i=0;i<130;i++) {
    const key=`phrase_${String(i).padStart(3,'0')}`;
    cats.it.entries.push({...structuredClone(BASE.entries[i%2?1:0]),key});
  }
  for(let i=0;i<130;i++) {
    const key=`phrase_${String(i).padStart(3,'0')}`, tokens=i%2?'':' {n}';
    if(i%7===3) continue; // no community rows at all
    await json(await suggest(`Testo ${i}${tokens}`,ip(),key));
    if(i%3===0) await json(await suggest(`Altro ${i}${tokens}`,ip(),key));
    if(i%5===0) await json(await vote('bundled',ip(),key));
    if(i%11===0) await json(await vote('bundled',ip(),key));
    // Every candidate hidden: the entry stays on the page with none.
    if(i%13===0) await db.prepare('UPDATE translation_candidates SET hidden=1 WHERE key=?1').bind(key).run();
  }
  // A retired source version and another language never reach the Italian page.
  cats.it.entries.find(e=>e.key==='phrase_010').sourceVersion=V2;
  await json(await suggest('Hallo {n}',ip(),'greeting',V1,'de'));
  let cursor='', pages=0;
  do {
    const query=cursor?'&cursor='+encodeURIComponent(cursor):'';
    const actual=await json(await fetchApi('/api/translations?lang=it'+query));
    // Stringified, so the order of entries and candidates must match too.
    assert.equal(JSON.stringify(actual),JSON.stringify(await summaryBefore('it',cursor)),`page after ${JSON.stringify(cursor)}`);
    cursor=actual.nextCursor; pages++;
  } while(cursor);
  assert.equal(pages,3);
  assert.ok(!(await json(await fetchApi('/api/translations?lang=it'))).entries.phrase_010,'the retired version is left out');
  // The overlay's rows, in the order the query before #322 returned them.
  const sources=JSON.stringify(Object.fromEntries(cats.it.entries.map(e=>[e.key,e.sourceVersion])));
  const before=(await db.prepare(`SELECT c.key, c.source_version, c.text FROM translation_entries e
      JOIN translation_candidates c ON c.id = e.selected_id AND c.hidden = 0
      JOIN json_each(?2) current ON current.key = e.key AND current.value = e.source_version
      WHERE e.lang = ?1`).bind('it',sources).all()).results;
  const bundled=new Map(cats.it.entries.map(e=>[e.key,e.text??e.en]));
  const expected=Object.fromEntries(before.filter(r=>r.text!==bundled.get(r.key)).map(r=>[r.key,{text:r.text,sourceVersion:r.source_version}]));
  assert.ok(Object.keys(expected).length>50);
  assert.equal(JSON.stringify((await json(await overlayOf())).translations),JSON.stringify(expected));
});

test('a parsed catalogue is reused only while ASSETS reports the same ETag',async()=>{
  catTags.it='"catalogue-a"';
  const user=ip();
  await json(await entry(user));
  const reads=catalogueReads('it');
  // Changing the bytes behind an unchanged tag cannot happen in a deployment;
  // here it proves the parse was reused, since the change stays invisible.
  cats.it.entries[0].text='Salve {n}';
  const cached=await json(await entry(user));
  assert.equal(cached.candidates.find(c=>c.id==='bundled').text,'Ciao {n}');
  assert.equal(catalogueReads('it'),reads+1,'the request still asks ASSETS, conditionally');
  catTags.it='"catalogue-b"'; // a deployment replaced the catalogue
  const deployed=await json(await entry(user));
  assert.equal(deployed.candidates.find(c=>c.id==='bundled').text,'Salve {n}');
  delete catTags.it; // no ETag: parsed every time, as before
  cats.it.entries[0].text='Buongiorno {n}';
  assert.equal((await json(await entry(user))).candidates.find(c=>c.id==='bundled').text,'Buongiorno {n}');
  cats.it.entries[0].text='Ciao {n}';
  assert.equal((await json(await entry(user))).candidates.find(c=>c.id==='bundled').text,'Ciao {n}');
  // A language the deployment no longer ships is unknown, not served from memory.
  catTags.it='"catalogue-c"'; await json(await entry(user));
  delete cats.it;
  await json(await entry(user),404);
});

const bundledOf = async (lang, voter=ip()) =>
  (await json(await fetchApi('/api/translations/entry?'+new URLSearchParams(fields('greeting',V1,lang)),{voter}))).candidates.find(c=>c.id==='bundled').text;

test('a cached parse is reused when ASSETS answers 200 with the same ETag',async()=>{
  catTags.it='"catalogue-a"';
  assert.equal(await bundledOf('it'),'Ciao {n}');
  assetFull.it=true; // ignores If-None-Match, sends the body and the same tag
  cats.it.entries[0].text='Salve {n}';
  const reads=catalogueReads('it');
  assert.equal(await bundledOf('it'),'Ciao {n}','the same tag reuses the parse');
  assert.equal(catalogueReads('it'),reads+1);
});

test('a revalidation that finishes after eviction still keeps at most two catalogues',async()=>{
  cats.fr={...structuredClone(BASE),lang:'fr'};
  for(const lang of ['it','de','fr']) catTags[lang]=`"${lang}-a"`;
  assert.equal(await bundledOf('it'),'Ciao {n}');
  assert.equal(await bundledOf('de'),'Ciao {n}'); // held: it, de
  let arrived, release;
  const reached=new Promise(resolve=>{arrived=resolve;});
  assetHold.it={arrived, release:new Promise(resolve=>{release=resolve;})};
  const late=bundledOf('it'); // revalidates it, parked in ASSETS
  await reached;
  assert.equal(await bundledOf('fr'),'Ciao {n}'); // held: de, fr (it evicted)
  release(); delete assetHold.it;
  assert.equal(await late,'Ciao {n}'); // the 304 re-inserts it, which must evict de
  // Bytes changed behind unchanged tags reveal which parses are still held.
  for(const lang of ['it','de','fr']) cats[lang].entries[0].text='Salve {n}';
  assert.equal(await bundledOf('de'),'Salve {n}','de was evicted, so it is parsed again');
});
