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
let cats, mf, db, script, ipSeq = 1, stamp = null, stampSeq = 0, assetReads = {};
const ip = () => `10.98.${Math.floor(++ipSeq / 250)}.${ipSeq % 250 + 1}`;
const raw = fs.readFileSync(path.join(ROOT,'migrations/0002_translations.sql'),'utf8');
async function migrate(target) {
  for (const stmt of raw.match(/CREATE TABLE[\s\S]*?;|CREATE INDEX[\s\S]*?;|CREATE TRIGGER[\s\S]*?END;/g)) await target.prepare(stmt).run();
  for (const stmt of fs.readFileSync(path.join(ROOT,'migrations/0001_community.sql'),'utf8').replace(/--[^\n]*/g,'').split(';').filter(x=>x.trim())) await target.prepare(stmt).run();
  const requests = fs.readFileSync(path.join(ROOT,'migrations/0003_feature_requests.sql'),'utf8');
  for (const stmt of requests.match(/CREATE TABLE[\s\S]*?;|CREATE INDEX[\s\S]*?;|CREATE TRIGGER[\s\S]*?END;/g)) await target.prepare(stmt).run();
}
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
      return lang ? cats[lang] ? Response.json(cats[lang]) : new Response('missing',{status:404}) : new Response('static fixture');
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
  cats={it:structuredClone(BASE),de:{...structuredClone(BASE),lang:'de'}};
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
