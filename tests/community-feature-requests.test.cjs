'use strict';
const {test,before,beforeEach,after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {Miniflare,convertV4MiniflareOptions} = require('miniflare');
const ROOT = path.resolve(__dirname,'..');
let mf,db,moderationCommand,workerScript,ipSeq = 1;
const ip = () => `10.77.${Math.floor(++ipSeq/250)}.${ipSeq%250+1}`;
const migrations = ['0001_community.sql','0003_feature_requests.sql'];
before(async () => {
  ({moderationCommand} = await import(pathToFileURL(path.join(ROOT,'tools/feature_moderate.mjs'))));
  const built = await require('esbuild').build({stdin:{resolveDir:ROOT,contents:`
    import worker from './server/worker.mjs';
    export default {...worker, async fetch(request,env,ctx) {
      if(new URL(request.url).pathname==='/__schedule') {
        await worker.scheduled({cron:'17 3 * * *'},{...env,ASSETS:null}); return new Response('done');
      }
      return worker.fetch(request,env,ctx);
    }};`},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
  workerScript = built.outputFiles[0].text;
  mf = new Miniflare(convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,
    compatibilityDate:'2026-09-01',d1Databases:['COMMUNITY_DB'],
    bindings:{COMMUNITY_IP_SECRET:'synthetic-request-secret'},
    ratelimits:{COMMUNITY_LIMITER:{namespace_id:'1001',simple:{limit:120,period:60}}}}));
  await mf.ready; db = await mf.getD1Database('COMMUNITY_DB');
  for (const file of migrations) {
    const raw = fs.readFileSync(path.join(ROOT,'migrations',file),'utf8');
    for (const statement of raw.match(/CREATE TABLE[\s\S]*?;|CREATE INDEX[\s\S]*?;|CREATE TRIGGER[\s\S]*?END;/g))
      await db.prepare(statement).run();
  }
});
beforeEach(async () => {
  await db.prepare('DELETE FROM feature_request_votes').run();
  await db.prepare('DELETE FROM feature_requests').run();
});
after(async () => { if(mf) await mf.dispose(); });
async function send(route,body,connection=ip(),origin='https://site.example') {
  return mf.dispatchFetch('https://site.example/api/community/'+route,{method:body===undefined?'GET':'POST',
    headers:{'CF-Connecting-IP':connection,...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
}
async function suggest(title='Synthetic idea',description='Make the synthetic example easier.',connection=ip()) {
  const response = await send('suggest',{title,description},connection);
  assert.equal(response.status,200,await response.clone().text()); return (await response.json()).feature;
}
async function moderate(...args) { return db.prepare(moderationCommand(args).sql).run(); }
const all = async sql => (await db.prepare(sql).all()).results;

test('requests: empty submission publishes immediately, persists and includes one vote',async () => {
  assert.deepEqual((await (await send('features')).json()).features,[]);
  const connection=ip(), idea=await suggest(undefined,undefined,connection);
  assert.match(idea.id,/^request-[a-f0-9]{64}$/); assert.equal(idea.votes,1); assert.equal(idea.voted,true);
  const loaded=(await (await send('features',undefined,connection)).json()).features[0];
  assert.deepEqual(loaded,idea);
  const other=ip(), voted=await (await send('vote',{featureId:idea.id},other)).json();
  assert.equal(voted.feature.votes,2);
  assert.equal((await all('SELECT * FROM feature_requests')).length,1);
  const votes=await all('SELECT voter_hash FROM feature_request_votes');
  assert.ok(votes.every(row=>/^[a-f0-9]{64}$/.test(row.voter_hash)));
  assert.ok(!JSON.stringify(await all('SELECT * FROM feature_requests')).includes(connection));
});
test('requests: normalized retries and concurrent submission/votes never inflate or overwrite text',async () => {
  const connection=ip();
  const results=await Promise.all(Array.from({length:12},()=>suggest('  SYNTHETIC  idea ','A useful example.',connection)));
  assert.ok(results.every(row=>row.id===results[0].id && row.votes===1));
  const retry=await suggest('synthetic idea','a useful example.',connection);
  assert.equal(retry.id,results[0].id); assert.equal(retry.title,'SYNTHETIC idea'); assert.equal(retry.votes,1);
  const other=ip(); await Promise.all(Array.from({length:12},()=>send('vote',{featureId:retry.id},other)));
  assert.equal((await (await send('vote',{featureId:retry.id},other)).json()).feature.votes,2);
});
test('requests: bounded Unicode/plain text and envelopes reject markup/control/extra fields and cross-origin writes',async () => {
  for(const body of [{title:'<img>',description:'x'},{title:'＜img＞',description:'x'},
    {title:'x\u202e',description:'x'},{title:'x',description:'x\u0000'},
    {title:'😀'.repeat(101),description:'x'},{title:'x',description:'😀'.repeat(1001)},
    {title:'x',description:'x',state:'active'},{title:' ',description:'x'}])
    assert.equal((await send('suggest',body)).status,400);
  assert.equal((await send('suggest',{title:'x',description:'x'},ip(),'https://elsewhere.example')).status,400);
  assert.equal((await send('suggest',{title:'x',description:'x'.repeat(9000)})).status,413);
  assert.equal((await suggest('😀'.repeat(100),'😀'.repeat(1000))).votes,1);
  assert.equal((await all('SELECT id FROM feature_requests')).length,1);
});
test('requests: merge unions overlapping voters, aliases and chains; retries resolve survivor atomically',async () => {
  const shared=ip(), a=await suggest('A','First.',shared),b=await suggest('B','Second.',shared),c=await suggest('C','Third.',ip());
  await send('vote',{featureId:a.id},ip()); await send('vote',{featureId:b.id},ip());
  await moderate('merge',a.id,b.id);
  assert.equal((await (await send('vote',{featureId:a.id},shared)).json()).feature.votes,3);
  await moderate('merge',b.id,c.id);
  const survivor=await suggest('A','First.',shared);
  assert.equal(survivor.id,c.id); assert.equal(survivor.votes,4);
  const rows=await all('SELECT id,canonical_id FROM feature_requests WHERE state = \'merged\'');
  assert.ok(rows.every(row=>row.canonical_id===c.id.slice(8)));
  const racer=ip();
  await Promise.all([send('vote',{featureId:a.id},racer),send('vote',{featureId:b.id},racer),send('vote',{featureId:c.id},racer)]);
  assert.equal((await (await send('vote',{featureId:a.id},racer)).json()).feature.votes,5);
  assert.equal((await (await send('features')).json()).features.length,1);
});
test('requests: merge racing with submission/voting keeps exact union and never revives closed requests',async () => {
  const shared=ip(),a=await suggest('Race A','Example.',shared),b=await suggest('Race B','Example.',shared);
  await Promise.all([moderate('merge',a.id,b.id),send('vote',{featureId:a.id},shared),suggest('Race A','Example.',shared)]);
  assert.equal((await (await send('vote',{featureId:a.id},shared)).json()).feature.votes,1);
  await moderate('hide',b.id);
  assert.equal((await all('SELECT * FROM feature_request_votes')).length,0);
  assert.equal((await send('vote',{featureId:a.id},ip())).status,409);
  assert.equal((await send('suggest',{title:'Race A',description:'Example.'},ip())).status,409);
  await moderate('restore',b.id);
  assert.equal((await (await send('features')).json()).features[0].votes,0);
  await moderate('retire',b.id); await moderate('restore',b.id);
  assert.deepEqual((await (await send('features')).json()).features,[]);
  assert.equal((await send('suggest',{title:'Race B',description:'Example.'})).status,409);
});
test('requests: pagination is bounded and daily cleanup preserves active request votes',async () => {
  const idea=await suggest();
  const before=(await all('SELECT * FROM feature_request_votes')).length;
  await mf.dispatchFetch('https://site.example/__schedule');
  assert.equal((await all('SELECT * FROM feature_request_votes')).length,before);
  for(let i=1;i<=32;i++) await db.prepare('INSERT INTO feature_requests(id,title,description,created_at) VALUES(?1,?2,?3,1)')
    .bind(i.toString(16).padStart(64,'0'),'Synthetic '+i,'Example.').run();
  const first=await (await send('features')).json(); assert.equal(first.features.length,25); assert.ok(first.nextAfter);
  const second=await (await send('features?after='+first.nextAfter)).json();
  assert.equal(second.features.length,8); assert.equal(second.nextAfter,null);
  assert.equal(new Set([...first.features,...second.features].map(row=>row.id)).size,33);
  assert.equal((await send('features?after=bad')).status,400);
  await moderate('retire',idea.id); assert.equal((await all('SELECT * FROM feature_request_votes')).length,0);
});
test('requests: operator commands stay local by default and reject curated merge/injection',async () => {
  assert.ok(moderationCommand(['list']).args.includes('--local'));
  assert.ok(moderationCommand(['list','--remote']).args.includes('--remote'));
  for(const args of [['merge','curated','request-'+'a'.repeat(64)],['hide',"x';DELETE"],['list','--limit','101'],['list','--remote','--remote']])
    assert.throws(()=>moderationCommand(args));
  const a=await suggest('A','Example.'),b=await suggest('B','Example.');
  await moderate('hide',a.id);
  // Guard applies even to direct operator SQL, not only the CLI.
  await assert.rejects(db.prepare('UPDATE feature_requests SET state=\'merged\',canonical_id=?1 WHERE id=?2').bind(b.id.slice(8),a.id.slice(8)).run(),/merge requires/);
});


test('requests: operator keyset pages reach older active and hidden requests beyond 100',async () => {
  const records=Array.from({length:137},(_,i)=>({id:i.toString(16).padStart(64,'0'),created:Math.floor(i/7),state:i%2?'hidden':'active'}));
  await db.batch(records.map(row=>db.prepare('INSERT INTO feature_requests(id,title,description,created_at,state) VALUES(?1,?2,?3,?4,?5)')
    .bind(row.id,'Synthetic '+row.id,'Example.',row.created,row.state)));
  const first=await all(moderationCommand(['list','--limit','100']).sql);
  assert.equal(first.length,100);
  // A new arrival must not move an older record between continuation pages.
  await db.prepare('INSERT INTO feature_requests(id,title,description,created_at) VALUES(?1,?2,?3,?4)')
    .bind('f'.repeat(64),'New arrival','Example.',99).run();
  const second=await all(moderationCommand(['list','--before',first.at(-1).list_cursor,'--limit','100']).sql);
  assert.equal(second.length,37);
  assert.deepEqual([...first,...second].map(row=>row.id),records.toReversed().map(row=>'request-'+row.id));
  assert.ok(second.some(row=>row.state==='hidden')); assert.ok(second.some(row=>row.state==='active'));
  assert.deepEqual(await all(moderationCommand(['list','--before',second.at(-1).list_cursor]).sql),[]);
  for (const cursor of ['1:x',"1:request-"+'a'.repeat(64)+"';DELETE",'9007199254740992:request-'+'a'.repeat(64)])
    assert.throws(()=>moderationCommand(['list','--before',cursor]));
  await moderate('restore',second.find(row=>row.state==='hidden').id);
});

test('requests: a failed submission transaction rolls back text and vote together',async () => {
  await db.prepare("CREATE TRIGGER synthetic_vote_failure BEFORE INSERT ON feature_request_votes BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;").run();
  try {
    assert.equal((await send('suggest',{title:'Rollback','description':'Synthetic.'})).status,503);
    assert.equal((await all('SELECT * FROM feature_requests')).length,0);
    assert.equal((await all('SELECT * FROM feature_request_votes')).length,0);
  } finally { await db.prepare('DROP TRIGGER synthetic_vote_failure').run(); }
});
test('requests: opposing concurrent merges cannot create an alias cycle or double support',async () => {
  const shared=ip(),a=await suggest('Cycle A','Synthetic.',shared),b=await suggest('Cycle B','Synthetic.',shared);
  const results=await Promise.allSettled([moderate('merge',a.id,b.id),moderate('merge',b.id,a.id)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const list=(await (await send('features')).json()).features;
  assert.equal(list.length,1); assert.equal(list[0].votes,1);
  assert.equal((await (await send('vote',{featureId:a.id},shared)).json()).feature.id,list[0].id);
  assert.equal((await (await send('vote',{featureId:b.id},shared)).json()).feature.id,list[0].id);
});


test('requests: the shared connection limiter refuses submissions before another database write',async () => {
  const limited=new Miniflare(convertV4MiniflareOptions({modules:true,script:workerScript,compatibilityDate:'2026-09-01',
    d1Databases:['COMMUNITY_DB'],bindings:{COMMUNITY_IP_SECRET:'synthetic-limited-secret'},
    ratelimits:{COMMUNITY_LIMITER:{namespace_id:'1001',simple:{limit:1,period:60}}}}));
  try {
    await limited.ready; const database=await limited.getD1Database('COMMUNITY_DB');
    for(const file of migrations) for(const statement of fs.readFileSync(path.join(ROOT,'migrations',file),'utf8')
      .match(/CREATE TABLE[\s\S]*?;|CREATE INDEX[\s\S]*?;|CREATE TRIGGER[\s\S]*?END;/g)) await database.prepare(statement).run();
    const connection=ip(), headers={'CF-Connecting-IP':connection,Origin:'https://limit.example','Content-Type':'application/json'};
    const submit=title=>limited.dispatchFetch('https://limit.example/api/community/suggest',{method:'POST',headers,body:JSON.stringify({title,description:'Synthetic.'})});
    assert.equal((await submit('First')).status,200);
    const blocked=await submit('Second'); assert.equal(blocked.status,429); assert.equal(blocked.headers.get('retry-after'),'60');
    assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM feature_requests').first()).n,1);
  } finally { await limited.dispose(); }
});
