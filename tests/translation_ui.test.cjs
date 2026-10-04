const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL});});
after(async()=>{await browser?.close();});
const makeEntry=(key,en,text=null,extra={})=>({key,en,text,drafted:true,area:'sp',context:'Business details',sourceVersion:'v-'+key,validation:{allowed:[],required:[],maxLength:2000},...extra});
async function setup(t,options={}){
  const context=await browser.newContext({viewport:{width:options.width||1280,height:900}});t.after(()=>context.close());
  const entries=options.actual?JSON.parse(fs.readFileSync(path.join(root,'web/translations/it.json'),'utf8')).entries:[
    makeEntry('sp.pull.traffic','Foot traffic <b>{n}</b>','Passaggio pedonale {n}',{validation:{allowed:['n:'],required:[['n:']],maxLength:2000}}),
    makeEntry('nav.staffing','Staffing','Personale'),
    makeEntry('sp.tile.capacity','Building capacity','Capacità dell’edificio'),
    makeEntry('land.privacy','Your save stays on this device.'),
    ...Array.from({length:81},(_,i)=>makeEntry('fixture.'+i,'Fixture phrase '+i,'Frase '+i)),
  ];
  const state={catalogueFail:options.catalogueFail,summaryFail:options.summaryFail,entryFail:false,mutationFail:false,mutationCode:'unavailable',holdEntry:options.holdEntry,holdSummary:options.holdSummary,holdMutation:null,community:options.community||{},reads:[],writes:[],data:{}};
  const entry=(lang,key)=>{
    const e=entries.find(e=>e.key===key);
    if(!state.data[lang+key])state.data[lang+key]={schemaVersion:1,lang,key,sourceVersion:e.sourceVersion,revision:'r1',selectedId:'bundled',candidates:[{id:'bundled',text:e.text??e.en,votes:0,voted:false}]};
    return state.data[lang+key];
  };
  const errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));t.after(()=>assert.deepEqual(errors,[]));
  await context.addInitScript(()=>{window.__copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}});});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.hostname!=='translations.test')return route.abort();
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname.startsWith('/translations/')){state.reads.push(url.pathname);if(state.catalogueFail)return json({},503);return json({schemaVersion:1,lang:url.pathname.split('/').pop().slice(0,-5),revision:'r1',entries});}
    if(url.pathname==='/api/translations'){
      options.onSummary?.();if(state.holdSummary)await state.holdSummary;
      if(state.summaryFail)return json({},503);
      return json({schemaVersion:1,lang:url.searchParams.get('lang'),entries:state.community,nextCursor:null});
    }
    if(url.pathname==='/api/translations/entry'){
      if(state.entryFail)return json({},503);
      const snapshot=structuredClone(entry(url.searchParams.get('lang'),url.searchParams.get('key')));options.onEntry?.();if(state.holdEntry)await state.holdEntry;return json(snapshot);
    }
    if(url.pathname==='/api/translations/suggest'||url.pathname==='/api/translations/vote'){
      const body=req.postDataJSON();state.writes.push(body);if(state.holdMutation)await state.holdMutation;if(state.mutationFail)return json({error:state.mutationCode},503);
      const d=entry(body.lang,body.key);
      let c;if(body.text){c=d.candidates.find(c=>c.text===body.text);if(!c){c={id:'candidate-'+d.candidates.length,text:body.text,votes:0,voted:false};d.candidates.push(c);}}
      else c=d.candidates.find(c=>c.id===body.candidateId);
      for(const old of d.candidates){if(old.voted){old.votes--;old.voted=false;}}c.votes++;c.voted=true;
      if(c.votes>d.candidates.find(c=>c.id===d.selectedId).votes)d.selectedId=c.id;
      return json(d);
    }
    if(url.pathname==='/translate/'||url.pathname==='/translate'){
      let html=fs.readFileSync(path.join(root,options.actual?'web/translate/index.html':'template/translate.html'),'utf8');
      html=html.replaceAll('__TRANSLATE_CSS__','/translate.css').replaceAll('__TRANSLATE_SCRIPT__','/translate.js').replaceAll('__STAMP__','test')
        .replace('__LANG_OPTIONS__','<option value="it">Italiano</option><option value="de">Deutsch</option>')
        .replace('__I18N_SCRIPT__',fs.readFileSync(path.join(root,'web/i18n.js'),'utf8'));
      return route.fulfill({contentType:'text/html',body:html});
    }
    if(['/translate.css','/translate.js'].includes(url.pathname))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(path.join(root,'web',url.pathname.slice(1)),'utf8')});
    if(options.actual&&url.pathname.startsWith('/fonts/'))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'font/woff2',body:fs.readFileSync(path.join(root,'web',url.pathname.slice(1)))});
    return route.abort();
  });
  const page=await context.newPage();await page.goto('https://translations.test/translate/'+(options.query||'?lang=it'));
  return {page,state,context,entries};
}
const rows=page=>page.locator('.tr-group');
const open=async(page,key)=>{await page.locator(`[data-key="${key}"] .tr-edit`).click();await page.locator('textarea').waitFor();await page.locator('.tr-primary:not(:disabled)').waitFor();};
test('alternatives are independently discoverable without editing or voting, and votes can move',async t=>{
  const community={'nav.staffing':{sourceVersion:'v-nav.staffing',selectedId:'bundled',candidates:[{id:'bundled',text:'Personale',votes:0,voted:false},{id:'other',text:'Collaboratori',votes:0,voted:false}]}};
  const {page,state}=await setup(t,{community});
  state.data['itnav.staffing']=structuredClone(community['nav.staffing']);
  const row=page.locator('[data-key="nav.staffing"]');
  await row.getByRole('button',{name:'View alternatives (1)',exact:true}).click();
  await row.locator('.tr-alt').waitFor();
  assert.equal(await page.locator('textarea').count(),0);
  assert.deepEqual(state.writes,[],'viewing alternatives neither approves nor submits');
  assert.equal(await row.locator('.tr-alt .tr-vote').innerText(),'Vote for this\n0');
  assert.equal(await row.locator('.tr-alt .tr-vote').getAttribute('aria-label'),'Vote for Collaboratori · 0 votes');
  await row.locator('.tr-alt .tr-vote').click();await page.getByText('Vote saved.',{exact:true}).waitFor();
  assert.equal(state.writes[0].candidateId,'other');
  assert.match(await row.locator('.tr-row .tr-vote').innerText(),/^Your vote/);
  assert.equal(await row.locator('.tr-row .tr-vote').getAttribute('aria-label'),'Your vote: Collaboratori · 1 vote');
  assert.equal(await page.locator('textarea').count(),0,'voting does not open an editor');
  await row.locator('.tr-alt .tr-vote').click();
  await row.locator('.tr-target').getByText('Personale',{exact:true}).waitFor();
  assert.equal(state.writes[1].candidateId,'bundled');
  await row.getByRole('button',{name:'Suggest a change',exact:true}).click();
  assert.equal(await page.locator('textarea').inputValue(),'Personale');
  await page.locator('textarea').fill('Bozza conservata');
  await row.getByRole('button',{name:'View alternatives (1)',exact:true}).click();
  assert.equal(await page.locator('textarea').count(),0);
  // Escape from inside the alternatives panel restores focus to its opener.
  await row.locator('.tr-alt .tr-vote').press('Escape');
  assert.equal(await row.locator('.tr-alternatives').getAttribute('aria-expanded'),'false');
  assert.equal(await row.locator('.tr-alternatives').evaluate(e=>document.activeElement===e),true);
  await row.getByRole('button',{name:'Suggest a change',exact:true}).click();
  assert.equal(await page.locator('textarea').inputValue(),'Bozza conservata');
  assert.equal(state.writes.length,2);
  if(process.env.TRANSLATION_ACTIONS_DESKTOP_SCREENSHOT)await page.screenshot({path:process.env.TRANSLATION_ACTIONS_DESKTOP_SCREENSHOT,fullPage:false});
});
test('empty alternatives explain their state and separate controls fit a phone',async t=>{
  const {page,state}=await setup(t,{width:375});
  const row=page.locator('[data-key="nav.staffing"]');
  await row.getByRole('button',{name:'View alternatives',exact:true}).click();
  await row.getByText('No alternatives yet. You can suggest new wording.',{exact:true}).waitFor();
  assert.equal(await row.locator('.tr-alternatives').innerText(),'View alternatives (0)');
  assert.equal(await page.locator('textarea').count(),0);assert.equal(state.writes.length,0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await row.getByRole('button',{name:'Suggest a change',exact:true}).click();
  await page.locator('.tr-primary:not(:disabled)').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.TRANSLATION_ACTIONS_SCREENSHOT)await page.screenshot({path:process.env.TRANSLATION_ACTIONS_SCREENSHOT,fullPage:false});
});
test('bounded rows, accent-insensitive rendered search and shareable source links',async t=>{
  const {page}=await setup(t);
  await rows(page).first().waitFor();assert.equal(await rows(page).count(),40);
  assert.equal(await page.locator('#trArea option[value=sp]').innerText(),'Business details');
  await page.locator('#trNext').click();assert.equal(await rows(page).count(),40);
  await page.locator('#trSearch').fill('capacita DELL edificio');assert.equal(await rows(page).count(),1);
  await page.locator('#trSearch').fill('Passaggio pedonale 12');assert.equal(await rows(page).count(),1);
  assert.equal(await rows(page).getAttribute('data-key'),'sp.pull.traffic');
  await page.locator('#trSearch').fill('Foot traffic 12');assert.equal(await rows(page).count(),1);
  await open(page,'sp.pull.traffic');await page.getByRole('button',{name:'Copy link'}).click();
  const copied=await page.evaluate(()=>window.__copied);assert.match(copied,/lang=it/);assert.match(copied,/key=sp.pull.traffic/);assert.match(copied,/q=Foot\+traffic\+12/);
  await page.goto(copied);await page.locator('textarea').waitFor();assert.equal(await rows(page).count(),1);
});
test('source-versioned suggestions start with a vote and safe text; validation preserves editing focus',async t=>{
  const {page,state}=await setup(t,{query:'?lang=it&key=sp.pull.traffic'});
  const input=page.locator('textarea');await page.locator('.tr-primary:not(:disabled)').waitFor();
  await input.fill('Passaggio pedonale');await page.getByRole('button',{name:'Submit',exact:true}).click();
  await page.getByRole('alert').waitFor();assert.equal(state.writes.length,0);assert.equal(await input.evaluate(e=>document.activeElement===e),true);
  await input.fill("Il passaggio dell’edificio {n}");await page.getByRole('button',{name:'Submit',exact:true}).click();
  await page.getByText('Suggestion saved with your vote.',{exact:true}).waitFor();
  assert.deepEqual(state.writes[0],{lang:'it',key:'sp.pull.traffic',sourceVersion:'v-sp.pull.traffic',text:'Il passaggio dell’edificio {n}'});
  assert.equal(await rows(page).locator('.tr-row .tr-vote').getAttribute('aria-pressed'),'true');
  assert.equal(await rows(page).locator('.tr-row .tr-vote-count').innerText(),'1');
  await rows(page).locator('.tr-alt .tr-vote').click();await page.getByText('Vote saved.',{exact:true}).waitFor();
  assert.equal(state.writes[1].candidateId,'bundled');
});
test('mutation failures retain draft, do not double-submit, and language switches restore unsaved wording',async t=>{
  const {page,state}=await setup(t,{query:'?lang=it&key=nav.staffing'});
  await page.locator('.tr-primary:not(:disabled)').waitFor();await page.locator('textarea').fill('Nuovo personale');
  state.mutationFail=true;let release;state.holdMutation=new Promise(resolve=>release=resolve);
  await page.getByRole('button',{name:'Submit',exact:true}).click();assert.equal(await page.locator('.tr-primary').isDisabled(),true);
  release();await page.getByRole('alert').waitFor();assert.equal(await page.locator('textarea').inputValue(),'Nuovo personale');assert.equal(state.writes.length,1);
  await page.locator('#trLanguage').selectOption('de');await page.locator('.tr-primary:not(:disabled)').waitFor();
  await page.locator('#trLanguage').selectOption('it');await page.locator('.tr-primary:not(:disabled)').waitFor();assert.equal(await page.locator('textarea').inputValue(),'Nuovo personale');
  state.mutationFail=false;state.holdMutation=null;await page.getByRole('button',{name:'Submit',exact:true}).click();await page.getByText('Suggestion saved with your vote.',{exact:true}).waitFor();
});
test('catalogue and community failures offer retry, then alternatives are searchable',async t=>{
  const {page,state}=await setup(t,{catalogueFail:true,summaryFail:true,community:{'nav.staffing':{sourceVersion:'v-nav.staffing',selectedId:'other',candidates:[{id:'other',text:'Squadra',votes:2},{id:'old',text:'Organico precedente',votes:1}]}}});
  await page.getByRole('alert').waitFor();state.catalogueFail=false;await page.getByRole('button',{name:'Retry'}).click();await rows(page).first().waitFor();
  await page.locator('#trNotice').getByRole('button',{name:'Retry'}).waitFor();state.summaryFail=false;await page.locator('#trNotice').getByRole('button',{name:'Retry'}).click();
  await page.getByText('Squadra',{exact:true}).waitFor();await page.locator('#trSearch').fill('organico precedente');assert.equal(await rows(page).count(),1);
});
test('mobile keyboard editing stays in bounds and hostile wording creates no elements',async t=>{
  const {page,state}=await setup(t,{width:375,query:'?lang=it&key=nav.staffing'});await page.locator('.tr-primary:not(:disabled)').waitFor();
  const d=state.data['itnav.staffing'];d.candidates.push({id:'hostile',text:'<img src=x onerror="window.pwned=1">',votes:0,voted:false});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await open(page,'nav.staffing');
  // Reopening uses the cached detail; inject through a successful API mutation response.
  await page.locator('textarea').fill('Personale');await page.getByRole('button',{name:'Submit',exact:true}).click();await page.getByText('Suggestion saved with your vote.',{exact:true}).waitFor();
  assert.equal(await page.locator('.tr-alt img').count(),0);assert.equal(await page.evaluate(()=>window.pwned),undefined);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('textarea').fill('Draft kept');await page.locator('textarea').press('Escape');assert.equal(await page.locator('textarea').count(),0);
  assert.equal(await page.locator('[data-key="nav.staffing"] .tr-edit').evaluate(e=>document.activeElement===e),true);
  await open(page,'nav.staffing');assert.equal(await page.locator('textarea').inputValue(),'Draft kept');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await open(page,'nav.staffing');assert.equal(await page.locator('textarea').inputValue(),'Personale');
});
test('offline and alternative-loading retry keep the editor usable and unsaved drafts warn on navigation',async t=>{
  const {page,state,context}=await setup(t);
  await rows(page).first().waitFor();state.entryFail=true;
  await page.locator('[data-key="nav.staffing"] .tr-edit').click();await page.locator('.tr-form').getByRole('alert').waitFor();
  assert.equal(await page.locator('.tr-primary').isDisabled(),true);state.entryFail=false;
  await page.locator('.tr-form').getByRole('button',{name:'Retry'}).click();await page.locator('.tr-primary:not(:disabled)').waitFor();
  await page.locator('textarea').fill('Unsaved wording');
  assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});dispatchEvent(event);return event.defaultPrevented;}),true);
  await context.setOffline(true);await page.locator('#trNotice').getByText('You are offline. Reconnect and try again.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Submit',exact:true}).click();await page.locator('.tr-form').getByRole('alert').waitFor();assert.equal(state.writes.length,0);
  assert.equal(await page.locator('textarea').inputValue(),'Unsaved wording');
  await context.setOffline(false);await page.getByRole('button',{name:'Submit',exact:true}).click();await page.getByText('Suggestion saved with your vote.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});dispatchEvent(event);return event.defaultPrevented;}),false);
});
test('assembled production catalogue finds pasted rendered wording and keeps page names readable',async t=>{
  const {page,entries}=await setup(t,{actual:true,query:'?lang=it&q=Foot+traffic+12'});
  const traffic=entries.find(e=>e.key==='sp.pull.traffic');assert.ok(traffic,'real authored phrase exists');
  await page.locator('.tr-primary:not(:disabled)').waitFor();assert.equal(await rows(page).count(),1);
  assert.equal(await rows(page).getAttribute('data-key'),traffic.key);assert.equal((await page.locator('textarea').inputValue()).includes('<b>'),false);
  assert.equal(await page.locator('#trArea option[value=sp]').innerText(),'Business details');
  assert.equal(await page.locator('#trLanguage option[value=it]').innerText(),'Italiano');
  const external=await page.locator('link[rel=stylesheet]').evaluateAll(links=>links.filter(l=>new URL(l.href).hostname!=='translations.test').length);
  assert.equal(external,0,'production page uses bundled fonts');
  if(process.env.TRANSLATION_UI_SCREENSHOT)await page.screenshot({path:process.env.TRANSLATION_UI_SCREENSHOT,fullPage:true});
});
test('direct key links take precedence over old or community-only search wording',async t=>{
  const {page}=await setup(t,{query:'?lang=it&q=old+community+wording&key=nav.staffing'});
  await page.locator('.tr-primary:not(:disabled)').waitFor();assert.equal(await rows(page).count(),1);
  assert.equal(await rows(page).getAttribute('data-key'),'nav.staffing');assert.equal(await page.locator('textarea').inputValue(),'Personale');
});
test('keyboard voting retains focus when the alternative becomes the selected wording',async t=>{
  const {page,state}=await setup(t,{query:'?lang=it&key=nav.staffing'});await page.locator('.tr-primary:not(:disabled)').waitFor();
  const d=state.data['itnav.staffing'];d.candidates.push({id:'alternative',text:'Collaboratori',votes:0,voted:false});
  await page.locator('textarea').fill('Personale');await page.getByRole('button',{name:'Submit',exact:true}).click();await page.getByText('Suggestion saved with your vote.',{exact:true}).waitFor();
  const vote=page.locator('.tr-alt .tr-vote');await vote.focus();await vote.press('Enter');await page.getByText('Vote saved.',{exact:true}).waitFor();
  assert.equal(await rows(page).locator('.tr-row .tr-target span').innerText(),'Collaboratori');
  assert.equal(await rows(page).locator('.tr-row .tr-vote').evaluate(e=>document.activeElement===e),true);
});
test('a delayed entry read cannot overwrite a successful vote',async t=>{
  let release,started;const hold=new Promise(resolve=>release=resolve),entryStarted=new Promise(resolve=>started=resolve);
  const {page}=await setup(t,{query:'?lang=it&key=nav.staffing',holdEntry:hold,onEntry:started});await entryStarted;
  await page.locator('.tr-row .tr-vote').click();await page.getByText('Vote saved.',{exact:true}).waitFor();
  const response=page.waitForResponse(url=>new URL(url.url()).pathname==='/api/translations/entry');release();await response;
  assert.equal(await page.locator('.tr-row .tr-vote-count').innerText(),'1');assert.equal(await page.locator('.tr-row .tr-vote').getAttribute('aria-pressed'),'true');
});
test('candidate cap errors direct contributors to existing wording and preserve the draft',async t=>{
  const {page,state}=await setup(t,{query:'?lang=it&key=nav.staffing'});await page.locator('.tr-primary:not(:disabled)').waitFor();
  state.mutationFail=true;state.mutationCode='candidate_limit';await page.locator('textarea').fill('Altra proposta');await page.getByRole('button',{name:'Submit',exact:true}).click();
  await page.getByRole('alert').getByText('This phrase has enough alternatives. Vote for an existing version.',{exact:true}).waitFor();
  assert.equal(await page.locator('textarea').inputValue(),'Altra proposta');
});
test('closing a distant direct-linked phrase keeps it visible and focused even with obsolete query text',async t=>{
  const actual=JSON.parse(fs.readFileSync(path.join(root,'web/translations/it.json'),'utf8')).entries;
  const key='sp.pull.traffic';assert.ok(actual.findIndex(e=>e.key===key)>40,'production phrase is outside the first page');
  const {page}=await setup(t,{actual:true,query:'?lang=it&q=obsolete+wording&key='+key});await page.locator('.tr-primary:not(:disabled)').waitFor();
  await page.locator('textarea').fill('Passaggio conservato {n}');await page.locator('textarea').press('Escape');
  assert.equal(await rows(page).count(),1);assert.equal(await rows(page).getAttribute('data-key'),key);
  assert.equal(await page.locator(`[data-key="${key}"] .tr-edit`).evaluate(e=>document.activeElement===e),true);
  assert.equal(new URL(page.url()).searchParams.get('key'),key);
  await open(page,key);assert.equal(await page.locator('textarea').inputValue(),'Passaggio conservato {n}');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await rows(page).count(),1);
  assert.equal(await page.locator(`[data-key="${key}"] .tr-edit`).evaluate(e=>document.activeElement===e),true);
  const bundled=actual.find(e=>e.key===key).text.replace(/<\/?[a-z][^>]*>/gi,'');
  await open(page,key);assert.equal(await page.locator('textarea').inputValue(),bundled,'Cancel restores bundled wording while preserving linked context');
});

test('rendered searches retain clock and currency anchors without matching every placeholder-only phrase',async t=>{
  const {page}=await setup(t,{actual:true});await rows(page).first().waitFor();
  for(const [query,key] of [['Monday09:00','sp.hour.when'],['Mon09:00','sp.hour.whenshort'],['$5.64','sp.home.perm2.v'],['$5,64','sp.home.perm2.v']]){
    await page.locator('#trSearch').fill(query);
    let found=false;
    do{
      if(await page.locator(`[data-key="${key}"]`).count()){found=true;break;}
      if(await page.locator('#trNext').isDisabled())break;
      await page.locator('#trNext').click();
    }while(true);
    assert.ok(found,query+' finds '+key);
  }
  await page.locator('#trSearch').fill('Foot traffic12');
  assert.equal(await rows(page).count(),1);assert.equal(await rows(page).getAttribute('data-key'),'sp.pull.traffic');
  await page.locator('#trSearch').fill('Foot traffic twelve');
  assert.equal(await page.locator('[data-key="sp.pull.traffic"]').count(),0,'numeric slots do not swallow arbitrary words');
  await page.locator('#trSearch').fill('Monday09:37');
  assert.equal(await page.locator('[data-key="sp.hour.when"]').count(),0,'literal minute suffix remains an anchor');
});

test('language round trips discard stale details so fresh summaries and searches win while drafts survive',async t=>{
  const {page,state}=await setup(t);await rows(page).first().waitFor();await open(page,'nav.staffing');
  await page.locator('textarea').fill('Bozza personale');await page.locator('textarea').press('Escape');
  await page.locator('#trLanguage').selectOption('de');await rows(page).first().waitFor();
  state.community={'nav.staffing':{sourceVersion:'v-nav.staffing',selectedId:'remote',candidates:[{id:'remote',text:'Nuova squadra',votes:5}]}};
  const summary=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/translations'&&new URL(r.url()).searchParams.get('lang')==='it');
  await page.locator('#trLanguage').selectOption('it');await summary;
  await page.locator('[data-key="nav.staffing"] .tr-target').getByText('Nuova squadra',{exact:true}).waitFor();
  await page.locator('#trSearch').fill('Nuova squadra');assert.equal(await rows(page).count(),1);assert.equal(await rows(page).getAttribute('data-key'),'nav.staffing');
  state.data['itnav.staffing']={schemaVersion:1,lang:'it',key:'nav.staffing',sourceVersion:'v-nav.staffing',revision:'r2',selectedId:'remote',candidates:[{id:'remote',text:'Nuova squadra',votes:5,voted:false}]};
  await open(page,'nav.staffing');assert.equal(await page.locator('textarea').inputValue(),'Bozza personale');
});

test('an old language visit cannot overwrite a fresh read after returning to that language',async t=>{
  let release,started;const hold=new Promise(resolve=>release=resolve),entryStarted=new Promise(resolve=>started=resolve);
  const {page,state}=await setup(t,{query:'?lang=it&key=nav.staffing',holdEntry:hold,onEntry:started});await entryStarted;
  state.holdEntry=null;
  await page.locator('#trLanguage').selectOption('de');await page.locator('.tr-primary:not(:disabled)').waitFor();
  state.data['itnav.staffing']={schemaVersion:1,lang:'it',key:'nav.staffing',sourceVersion:'v-nav.staffing',revision:'r2',selectedId:'remote',candidates:[{id:'remote',text:'Squadra aggiornata',votes:4,voted:false}]};
  await page.locator('#trLanguage').selectOption('it');await page.locator('.tr-target').getByText('Squadra aggiornata',{exact:true}).waitFor();
  const oldResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/translations/entry'&&new URL(r.url()).searchParams.get('lang')==='it');release();await oldResponse;
  assert.equal(await page.locator('.tr-row .tr-target span').innerText(),'Squadra aggiornata');
  assert.equal(await page.locator('.tr-row .tr-vote-count').innerText(),'4');
});

test('an in-flight suggestion survives a language round trip and refreshes the returned entry',async t=>{
  const {page,state}=await setup(t,{query:'?lang=it&key=nav.staffing'});await page.locator('.tr-primary:not(:disabled)').waitFor();
  let release;state.holdMutation=new Promise(resolve=>release=resolve);
  await page.locator('textarea').fill('Squadra votata');await page.getByRole('button',{name:'Submit',exact:true}).click();
  await page.locator('#trLanguage').selectOption('de');await page.locator('.tr-primary:not(:disabled)').waitFor();
  await page.locator('#trLanguage').selectOption('it');await page.locator('textarea').waitFor();
  assert.equal(await page.locator('textarea').isDisabled(),true);assert.equal(await page.locator('textarea').inputValue(),'Squadra votata');
  release();await page.getByText('Suggestion saved with your vote.',{exact:true}).waitFor();
  await page.locator('.tr-primary:not(:disabled)').waitFor();assert.equal(await page.locator('.tr-row .tr-target span').innerText(),'Squadra votata');
  assert.equal(await page.locator('.tr-row .tr-vote').getAttribute('aria-pressed'),'true');assert.equal(state.writes.length,1);
  assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});dispatchEvent(event);return event.defaultPrevented;}),false);
});

test('area and state filters remove linked phrase state from the URL and do not reopen it on reload',async t=>{
  const {page}=await setup(t,{query:'?lang=it&key=nav.staffing'});await page.locator('.tr-primary:not(:disabled)').waitFor();
  await page.locator('#trArea').selectOption('sp');assert.equal(new URL(page.url()).searchParams.has('key'),false);assert.equal(await page.locator('textarea').count(),0);
  await page.reload();await rows(page).first().waitFor();assert.ok(await rows(page).count()>1);assert.equal(await page.locator('textarea').count(),0);
  await open(page,'nav.staffing');assert.equal(new URL(page.url()).searchParams.get('key'),'nav.staffing');
  await page.locator('#trFilter').selectOption('missing');assert.equal(new URL(page.url()).searchParams.has('key'),false);assert.equal(await page.locator('textarea').count(),0);
  await page.reload();await rows(page).first().waitFor();assert.ok(await rows(page).count()>1);assert.equal(await page.locator('textarea').count(),0);
});

test('a withdrawn candidate explains how to recover without an ineffective retry',async t=>{
  const {page,state}=await setup(t,{query:'?lang=it&key=nav.staffing'});await page.locator('.tr-primary:not(:disabled)').waitFor();
  state.mutationFail=true;state.mutationCode='unknown_candidate';await page.locator('.tr-row .tr-vote').click();
  await page.getByRole('alert').getByText('This version is no longer available. Reload the page and choose another version.',{exact:true}).waitFor();
});
test('delayed actual community summaries cannot undo closing, search, or filter interactions',async t=>{
  for(const action of ['cancel','search','area','filter']){
    let release,started;const hold=new Promise(resolve=>release=resolve),summaryStarted=new Promise(resolve=>started=resolve);
    const {page}=await setup(t,{actual:true,query:'?lang=it&q=Foot+traffic+12',holdSummary:hold,onSummary:started});
    await page.locator('.tr-primary:not(:disabled)').waitFor();await summaryStarted;
    if(action==='cancel')await page.getByRole('button',{name:'Cancel',exact:true}).click();
    else if(action==='search')await page.locator('#trSearch').fill('Foot traffic 24');
    else if(action==='area')await page.locator('#trArea').selectOption('sp');
    else await page.locator('#trFilter').selectOption('draft');
    assert.equal(await page.locator('textarea').count(),0,action+' closes the editor');
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/translations');release();await response;
    // A subsequent task flushes the response handler and any optional entry
    // fetch that an unwanted reopen would initiate, without relying on sleeps.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.locator('textarea').count(),0,action+' remains authoritative after summary delivery');
    assert.equal(await page.locator('[data-key="sp.pull.traffic"]').count(),1);
  }
});
