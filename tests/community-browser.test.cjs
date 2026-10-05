const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const web = path.join(__dirname, '..', 'web');
let browser;
before(async () => { browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL}); });
after(async () => { await browser?.close(); });

async function setup(t, options = {}) {
  const context = await browser.newContext({viewport:{width:options.width || 1280, height:900}, reducedMotion:'reduce'});
  t.after(() => context.close());
  const state = {heartbeats:[], reads:0, votes:[], count:40, failPresence:false, failVotes:false, holdPresence:null,holdVote:null, suggestions:[],failSuggest:false,holdSuggest:null,pageSize:null,voteCanonical:null,fullSuggestions:false,
    features:[
      {id:'optimize-staffing',title:'Optimize staffing',description:'Shifts from the hour grid.',votes:0,voted:false},
      {id:'find-a-location',title:'Find a location',description:'Compare available buildings.',votes:0,voted:false},
    ]};
  await context.addInitScript(options => {
    window.showDirectoryPicker = undefined;
    window.Worker = class {
      constructor(){ window.saveWorker = this; this.messages = []; }
      postMessage(msg){ this.messages.push(msg); }
      terminate(){}
    };
    if(options.blockStorage) Object.defineProperty(window, 'localStorage', {get(){throw Error('Storage blocked');}});
    if(options.seenVoting && location.hostname === 'community.test') localStorage.setItem('ba_dash_feature_seen:community-voting','1');
    if(options.fullStorage) Storage.prototype.setItem = function(){throw Error('Quota exceeded');};
    if(options.legacyState && location.hostname === 'community.test') localStorage.setItem('ba_community_state', JSON.stringify({browserId:'00000000-0000-4000-8000-000000000000',nextDue:Date.now()+300000}));
  }, options);
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  t.after(() => assert.deepEqual(errors, [], 'community failures must not escape into the dashboard'));
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if(url.hostname !== 'community.test') return route.abort();
    const json = (body, status = 200) => route.fulfill({status, contentType:'application/json',body:JSON.stringify(body)});
    if(url.pathname === '/api/community/presence') {
      state.heartbeats.push(request.postDataJSON());
      if(state.holdPresence) await state.holdPresence;
      if(state.failPresence) return json({error:'Unavailable'},503);
      return json({count:state.count,countedAt:Math.floor(Date.now()/1000),nextHeartbeatIn:300});
    }
    if(url.pathname === '/api/community/features') {
      state.reads++;
      if(state.failVotes) return json({error:'Unavailable'},503);
      const after = url.searchParams.get('after');
      const start = after ? state.features.findIndex(feature => feature.id === after) + 1 : 0;
      const page = state.pageSize ? state.features.slice(start,start+state.pageSize) : state.features;
      return json({features:page,nextAfter:state.pageSize && start+page.length < state.features.length ? page.at(-1).id : null});
    }
    if(url.pathname === '/api/community/suggest') {
      const body = request.postDataJSON(); state.suggestions.push(body);
      if(state.holdSuggest) await state.holdSuggest;
      if(state.failSuggest) return json({error:'Unavailable'},503);
      if(state.fullSuggestions) return json({error:'Request list full'},503);
      let feature = state.features.find(feature => feature.title === body.title && feature.description === body.description);
      if(!feature) { feature = {id:'request-'+'a'.repeat(64),...body,votes:1,voted:true}; state.features.push(feature); }
      return json({feature});
    }
    if(url.pathname === '/api/community/vote') {
      const body = request.postDataJSON(); state.votes.push(body);
      if(state.holdVote) await state.holdVote;
      if(state.failVotes) return json({error:'Unavailable'},503);
      const feature = state.features.find(f => f.id === (state.voteCanonical || body.featureId));
      if(!feature.voted) feature.votes++;
      feature.voted = true;
      return json({feature});
    }
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if(!['index.html','app.js','community.js','community.css','version.json'].includes(name)) return route.abort();
    return route.fulfill({contentType:name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : 'application/javascript',body:fs.readFileSync(path.join(web,name),'utf8')});
  });
  async function newPage() {
    const page = await context.newPage();
    await page.clock.install();
    await page.goto('https://community.test/');
    await page.waitForFunction(() => !!window.BigCopilotCommunity);
    await page.evaluate(() => { renderAll = drawMast; });
    return page;
  }
  async function loadSave(page) {
    // Wait for a build this call created, so a repeat load answers the new
    // worker message instead of re-replying to one already answered.
    const builds = await page.evaluate(() => saveWorker.messages.filter(m => m.kind === 'build').length);
    await page.locator('#savePick').setInputFiles({name:'community-test.hsg',mimeType:'application/octet-stream',buffer:Buffer.from('fixture')});
    await page.waitForFunction(n => saveWorker.messages.filter(m => m.kind === 'build').length > n, builds);
    await page.evaluate(() => {
      const msg = saveWorker.messages.filter(m => m.kind === 'build').at(-1);
      saveWorker.onmessage({data:{kind:'built',id:msg.id,history:'{}',data:JSON.stringify({
        meta:{save:msg.name,day:2,hour:9,minute:30},kpi:{businesses:1,employees:1}})}});
    });
    await page.waitForFunction(() => document.body.classList.contains('has-board'));
  }
  return {context,state,newPage,loadSave,page:await newPage()};
}
const online = page => page.locator('#live').getByText(enRe('comm.online', {n: 40}, {anchor: 'full'}));
const openVotes = async page => {
  await page.locator('[data-community-open]').filter({visible:true}).click();
  return page.locator('dialog.community-dialog');
};

test('landing is network quiet; actual save loading starts presence and preserves footer controls', async t => {
  const {page,state,loadSave} = await setup(t);
  assert.equal(state.heartbeats.length,0); assert.equal(state.reads,0);
  const dialog = await openVotes(page);
  await dialog.getByText('Optimize staffing',{exact:true}).waitFor();
  assert.equal(state.reads,1); assert.equal(state.heartbeats.length,0);
  await dialog.locator('.community-head button[autofocus]').click();
  await loadSave(page);
  await online(page).waitFor();
  assert.equal(state.heartbeats.length,1);
  assert.deepEqual(Object.keys(state.heartbeats[0]),['browserId']);
  assert.match(state.heartbeats[0].browserId,/^[0-9a-f-]{36}$/i);
  assert.equal(await page.locator('#landing').count(),0);
  // The count lives in the masthead's live status: its dot stays, and the
  // footer's job is only the vote card, never a second copy of the count.
  assert.equal(await page.locator('#live b').count(),1);
  assert.equal(await page.locator('.sitefoot .community-online').count(),0);
  assert.equal(await page.locator('.sitefoot [data-vote-card]').first().isVisible(),true);
  // A masthead rebuild repaints the stored count without another heartbeat.
  await page.evaluate(() => { renderAll(); });
  await online(page).waitFor();
  assert.equal(state.heartbeats.length,1);
  // A failed rebuild marks the live status Stale; the next good save clears
  // it and restores the count, again without a heartbeat. The failure goes to
  // a fresh build, since an answered id is ignored.
  const builds = await page.evaluate(() => saveWorker.messages.filter(m => m.kind === 'build').length);
  await page.locator('#savePick').setInputFiles({name:'community-test.hsg',mimeType:'application/octet-stream',buffer:Buffer.from('fixture')});
  await page.waitForFunction(n => saveWorker.messages.filter(m => m.kind === 'build').length > n, builds);
  await page.evaluate(() => {
    const msg = saveWorker.messages.filter(m => m.kind === 'build').at(-1);
    saveWorker.onmessage({data:{kind:'failed',id:msg.id,error:'fixture could not rebuild'}});
  });
  await page.locator('#live').getByText(en('nav.stale.word'), {exact:true}).waitFor();
  await loadSave(page);
  await online(page).waitFor();
  assert.equal(state.heartbeats.length,1);
  await page.evaluate(() => { BigCopilotCommunity.start(); BigCopilotCommunity.start(); });
  assert.equal(await page.locator('[data-community-open]').count(),1);
  assert.equal(state.heartbeats.length,1);
});

test('each tab keeps its own id and schedule in memory, and nothing reaches browser storage', async t => {
  const {page,newPage,state,loadSave} = await setup(t,{legacyState:true});
  const other = await newPage();
  const keysBefore = await page.evaluate(() => Object.keys(localStorage).filter(k => k !== 'ba_community_state').sort());
  await Promise.all([loadSave(page),loadSave(other)]);
  await Promise.all([online(page).waitFor(),online(other).waitFor()]);
  assert.equal(state.heartbeats.length,2,'each tab sends its own first heartbeat');
  const ids = state.heartbeats.map(h => h.browserId);
  assert.notEqual(ids[0],ids[1]);
  assert.ok(!ids.includes('00000000-0000-4000-8000-000000000000'),'a stored legacy id is never reused');
  assert.equal(await page.evaluate(() => localStorage.getItem('ba_community_state')),null,'the legacy id is removed');
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(state.heartbeats.length,2,'focus and connectivity events do not send before the due time');
  // The clock belongs to the browser context, so both tabs reach their due time.
  // Wait on the requests themselves: the count already reads "40 online" from
  // the first heartbeats, and in-page timers run on the fake clock.
  await page.clock.fastForward(306000);
  for (let i = 0; i < 200 && state.heartbeats.length < 4; i++) await new Promise(resolve => setTimeout(resolve,25));
  assert.equal(state.heartbeats.length,4);
  assert.deepEqual(state.heartbeats.slice(2).map(h => h.browserId).sort(),[...ids].sort(),'each tab keeps its id between heartbeats');
  // Presence adds nothing to browser storage; the board's own keys are not its business.
  const keysAfter = await page.evaluate(() => Object.keys(localStorage).sort());
  assert.deepEqual(keysAfter.filter(k => !keysBefore.includes(k) && !/^(ba_dash_|ba_line_names$|ba_order_marks_|ba_finder|ledger_)/.test(k)),[],'presence writes no storage key');
});

test('save changes keep the schedule; a reload starts over with a new id', async t => {
  const {page,state,loadSave} = await setup(t);
  await loadSave(page); await online(page).waitFor();
  const id = state.heartbeats[0].browserId;
  await loadSave(page);
  assert.equal(state.heartbeats.length,1,'a new save does not send again');
  await page.reload();
  await page.waitForFunction(() => !!window.BigCopilotCommunity);
  await page.evaluate(() => { renderAll = drawMast; });
  await loadSave(page); await online(page).waitFor();
  assert.equal(state.heartbeats.length,2);
  assert.notEqual(state.heartbeats[1].browserId,id);
});

test('a sleeping browser skips missed intervals and a failed heartbeat backs off', async t => {
  const {page,state,loadSave} = await setup(t);
  await loadSave(page); await online(page).waitFor();
  state.failPresence = true;
  // "Online count unavailable" also shows once the old count goes stale, so
  // wait for the failed response itself, then let the page settle it before
  // the clock moves again.
  const failed = page.waitForResponse('**/api/community/presence');
  await page.clock.fastForward(3600000);
  await failed;
  await page.locator('#live.community-unavailable').waitFor({state:'attached'});
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve,50)));
  assert.equal(state.heartbeats.length,2,'no replay of twelve missed heartbeats');
  await page.clock.fastForward(30000);
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); });
  assert.equal(state.heartbeats.length,2,'a failure waits at least a minute before retrying');
  state.failPresence = false;
  // A response, not the request: the route records a heartbeat before fulfilling it.
  const retry = page.waitForResponse('**/api/community/presence');
  await page.clock.fastForward(100000);
  await retry;
  assert.equal(state.heartbeats.length,3,'the backoff re-arms and retries once');
  assert.equal(await page.locator('#nav').isVisible(),true);
});

test('a copy with no API loses the vote card, but one bad beat does not', async t => {
  const {page,state,loadSave} = await setup(t);
  // Revealed before any request: the landing must stay quiet, so this cannot
  // wait for the API to confirm itself.
  assert.equal(await page.locator('[data-vote-card]').first().isVisible(),true);
  assert.equal(state.heartbeats.length,0);

  state.failPresence = true;
  const first = page.waitForResponse('**/api/community/presence');
  await loadSave(page);
  await first;
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve,50)));
  assert.equal(state.heartbeats.length,1);
  assert.equal(await page.locator('[data-vote-card]').first().isVisible(),true,
    'one failure is a blip: the card a reader can already see stays put');

  // The second failure with nothing good in between is what a copy served
  // without /api/community actually looks like.
  const second = page.waitForResponse('**/api/community/presence');
  await page.clock.fastForward(100000);
  await second;
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve,50)));
  assert.equal(state.heartbeats.length,2);
  assert.equal(await page.locator('[data-vote-card]').first().isVisible(),false,
    'no API behind this copy: stop offering a vote that cannot be cast');
});

test('a site that has answered keeps its vote card through a run of failures', async t => {
  const {page,state,loadSave} = await setup(t);
  await loadSave(page); await online(page).waitFor();
  assert.equal(await page.locator('[data-vote-card]').first().isVisible(),true);

  // presence.receivedAt is cleared by every failure, so it never meant "has
  // ever answered". Two dropped beats used to read as "no API behind this copy"
  // on a site that had been answering all along.
  state.failPresence = true;
  for (const wait of [3600000, 100000, 200000]) {
    const beat = page.waitForResponse('**/api/community/presence');
    await page.clock.fastForward(wait);
    await beat;
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve,50)));
  }
  await page.locator('#live.community-unavailable').waitFor({state:'attached'});
  assert.equal(await page.locator('[data-vote-card]').first().isVisible(),true,
    'the API answered once; a run of blips is not a copy without one');
});

test('a card hidden by an outage comes back when the API does', async t => {
  const {page,state,loadSave} = await setup(t);
  // Cold start into an outage: two failures with nothing ever answered is the
  // one case that hides the card, and only the reveal in settle()'s ok branch
  // brings it back when the outage ends.
  state.failPresence = true;
  const first = page.waitForResponse('**/api/community/presence');
  await loadSave(page);
  await first;
  const second = page.waitForResponse('**/api/community/presence');
  await page.clock.fastForward(100000);
  await second;
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve,50)));
  assert.equal(await page.locator('[data-vote-card]').first().isVisible(),false);

  state.failPresence = false;
  const recovered = page.waitForResponse('**/api/community/presence');
  await page.clock.fastForward(200000);
  await recovered;
  await online(page).waitFor();
  assert.equal(await page.locator('[data-vote-card]').first().isVisible(),true,
    'the API is back, so the vote is castable again');
});

test('a heartbeat whose settling throws still leaves the schedule running, without a page error', async t => {
  const {page,state,loadSave} = await setup(t);
  await loadSave(page); await online(page).waitFor();
  // The only throw sendPresence() can pass on comes from settling the reply,
  // so break the next paint once; the .catch in tick() has to absorb it.
  await page.evaluate(() => {
    const original = document.querySelector.bind(document);
    let broken = true;
    document.querySelector = selector => {
      if (selector === '#live' && broken) { broken = false; throw new Error('paint failed'); }
      return original(selector);
    };
  });
  const second = page.waitForResponse('**/api/community/presence');
  await page.clock.fastForward(306000);
  await second;
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve,50)));
  const third = page.waitForResponse('**/api/community/presence');
  await page.clock.fastForward(306000);
  await third;
  assert.equal(state.heartbeats.length,3);
});

for(const options of [{blockStorage:true},{fullStorage:true}]) test(`presence tolerates unavailable browser facilities: ${JSON.stringify(options)}`, async t => {
  const {page,loadSave,state} = await setup(t,options);
  await loadSave(page); await online(page).waitFor();
  assert.equal(state.heartbeats.length,1);
  const dialog = await openVotes(page);
  await dialog.getByText('Find a location',{exact:true}).waitFor();
});

test('voting fetches on demand, prevents duplicates and uses the mutation result without refetching', async t => {
  const {page,state} = await setup(t);
  const dialog = await openVotes(page);
  const vote = dialog.getByRole('button',{name:en('comm.vote'),exact:true}).first();
  await vote.click();
  await dialog.getByRole('button',{name:en('comm.voted'),exact:true}).waitFor();
  assert.equal(state.votes.length,1); assert.equal(state.reads,1);
  assert.equal(await dialog.getByRole('button',{name:en('comm.voted'),exact:true}).isDisabled(),true);
  await dialog.getByRole('button',{name:en('comm.vote'),exact:true}).click();
  assert.equal(state.votes.length,2,'each feature has its own vote');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:en('foot.vote.cta')}).waitFor();
  assert.equal(await page.getByRole('button',{name:en('foot.vote.cta')}).evaluate(el => el === document.activeElement),true);
  await openVotes(page);
  await page.waitForFunction(() => document.querySelectorAll('dialog[open] button.community-vote[disabled]').length === 2);
  assert.equal(state.reads,2);
  // Opening voting alone does not dismiss discovery of the suggestion form.
  assert.equal(await page.locator('[data-vote-card] [data-new-feature="feature-requests"]:not([hidden])').count(),2);
});

test('voting errors have a user-triggered retry and feature text is rendered as text', async t => {
  const {page,state} = await setup(t);
  state.failVotes = true;
  const dialog = await openVotes(page);
  await dialog.locator('.community-retry').waitFor();
  assert.equal(state.reads,1);
  state.failVotes = false;
  state.features[0].title = '<img src=x onerror=alert(1)>';
  await dialog.locator('.community-retry').click();
  await dialog.getByText('<img src=x onerror=alert(1)>',{exact:true}).waitFor();
  assert.equal(await dialog.locator('img').count(),0);
  assert.equal(state.reads,2);
});

test('wake events while a heartbeat is out do not send a second one', async t => {
  const {page,state,loadSave} = await setup(t);
  let release;
  state.holdPresence = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  const sent = page.waitForRequest('**/api/community/presence');
  await loadSave(page);
  await sent;
  await page.clock.fastForward(310000);
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(state.heartbeats.length,1);
  release();
  await online(page).waitFor();
  assert.equal(state.heartbeats.length,1);
});

test('reopening the dialog during a vote waits for that mutation before fetching totals', async t => {
  const {page,state} = await setup(t);
  const dialog = await openVotes(page);
  let release;
  state.holdVote = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  const sent = page.waitForRequest('**/api/community/vote');
  await dialog.getByRole('button',{name:en('comm.vote'),exact:true}).first().click();
  await sent;
  await page.keyboard.press('Escape');
  await openVotes(page);
  assert.equal(state.reads,1,'on-open GET waits for the in-flight mutation');
  release();
  await dialog.getByRole('button',{name:en('comm.voted'),exact:true}).waitFor();
  assert.equal(state.reads,2);
});

test('community dialog fits mobile in both themes and the keyboard stays in the modal', async t => {
  const {page} = await setup(t,{width:390});
  const dialog = await openVotes(page);
  await dialog.getByText('Optimize staffing',{exact:true}).waitFor();
  for(const theme of ['dark','light']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme,theme);
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),true);
    await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)),true);
  }
  if(process.env.COMMUNITY_SCREENSHOT) await page.screenshot({path:process.env.COMMUNITY_SCREENSHOT});
});


test('visitor requests: empty ballot publishes from the collapsed form and retries keep text',async t => {
  const {page,state}=await setup(t); state.features=[];
  const dialog=await openVotes(page);
  await dialog.getByText(en('comm.empty'),{exact:true}).waitFor();
  assert.equal(await dialog.locator('details').getAttribute('open'),null);
  const badge=dialog.locator('[data-new-feature="feature-requests"]');
  assert.equal(await badge.isVisible(),true);
  await dialog.locator('summary').click();
  await page.waitForFunction(()=>document.querySelector('[data-new-feature="feature-requests"]').hidden);
  await dialog.locator('#communitySuggestionTitle').fill('Synthetic new idea');
  await dialog.locator('#communitySuggestionDescription').fill('An example without private information.');
  state.failSuggest=true;
  await dialog.locator('form button[type=submit]').click();
  await dialog.getByText(/Could not publish this idea/).waitFor();
  assert.equal(await dialog.locator('#communitySuggestionTitle').inputValue(),'Synthetic new idea');
  state.failSuggest=false;
  await dialog.locator('form button[type=submit]').click();
  await dialog.getByText('Synthetic new idea',{exact:true}).waitFor();
  await dialog.getByText(/Your idea is public/).waitFor();
  assert.equal(await dialog.locator('.community-card').count(),1);
  assert.equal(await dialog.locator('.community-vote').isDisabled(),true);
  assert.deepEqual(state.suggestions[0],state.suggestions[1]);
  await page.keyboard.press('Escape'); await openVotes(page);
  await dialog.getByText('Synthetic new idea',{exact:true}).waitFor();
  assert.equal(state.features.length,1);
  await page.reload(); await openVotes(page);
  assert.equal(await dialog.locator('[data-new-feature="feature-requests"]').isVisible(),false);
});

test('visitor requests: more ideas precede the form and mobile keyboard entry remains usable',async t => {
  const {page,state}=await setup(t,{width:390});
  state.features=Array.from({length:5},(_,i)=>({id:'request-'+String(i).padStart(64,'0'),title:'Idea '+i,description:'Synthetic.',votes:0,voted:false}));
  state.pageSize=2;
  const dialog=await openVotes(page);
  await dialog.getByText('Idea 0',{exact:true}).waitFor();
  assert.equal(await dialog.locator('.community-card').count(),2);
  await dialog.locator('.community-more').focus(); await page.keyboard.press('Enter'); await dialog.getByText('Idea 3',{exact:true}).waitFor();
  assert.equal(await dialog.locator('.community-card').nth(2).locator('button').evaluate(el=>el===document.activeElement),true);
  state.failVotes=true;
  await dialog.locator('.community-more').focus(); await page.keyboard.press('Enter');
  await dialog.locator('.community-retry').waitFor();
  assert.match(await dialog.locator('.community-status').first().textContent(),/Could not load the features/);
  assert.equal(await dialog.locator('.community-more').evaluate(el=>el===document.activeElement),true);
  state.failVotes=false;
  await page.keyboard.press('Enter'); await dialog.getByText('Idea 4',{exact:true}).waitFor();
  assert.equal(await dialog.locator('.community-card').nth(4).locator('button').evaluate(el=>el===document.activeElement),true);
  assert.equal(await dialog.locator('.community-card').count(),5);
  assert.equal(await dialog.locator('.community-more').isVisible(),false);
  await dialog.locator('summary').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
  assert.equal(await dialog.locator('#communitySuggestionTitle').evaluate(el=>el===document.activeElement),true);
  assert.equal(await dialog.locator('#communitySuggestionTitle').evaluate(el=>getComputedStyle(el).fontSize),'16px');
  for(const theme of ['dark','light']) {
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
    if(process.env.FEATURE_REQUEST_SCREENSHOT && theme==='light') await page.screenshot({path:process.env.FEATURE_REQUEST_SCREENSHOT});
  }
});


test('visitor requests: reopening during publication waits for mutation and merged votes update survivor',async t => {
  const {page,state}=await setup(t); state.features=[];
  const dialog=await openVotes(page);
  await dialog.getByText(en('comm.empty'),{exact:true}).waitFor();
  let release; state.holdSuggest=new Promise(resolve=>{release=resolve;}); t.after(()=>release());
  await dialog.locator('summary').click();
  await dialog.locator('#communitySuggestionTitle').fill('Pending idea');
  await dialog.locator('#communitySuggestionDescription').fill('Synthetic.');
  const sent=page.waitForRequest('**/api/community/suggest');
  await dialog.locator('form button[type=submit]').click(); await sent;
  assert.equal(await dialog.locator('form button[type=submit]').isDisabled(),true);
  await page.keyboard.press('Escape'); await openVotes(page);
  assert.equal(state.reads,1);
  release(); await dialog.getByText('Pending idea',{exact:true}).waitFor();
  assert.equal(state.reads,2);
  await page.keyboard.press('Escape');
  const source='request-'+'b'.repeat(64),target='request-'+'c'.repeat(64);
  state.features=[{id:source,title:'Before merge',description:'Synthetic.',votes:1,voted:false},
    {id:target,title:'Surviving idea',description:'Synthetic.',votes:1,voted:false}];
  await openVotes(page); await dialog.getByText('Before merge',{exact:true}).waitFor();
  state.voteCanonical=target;
  await dialog.locator('button[data-feature-id="'+source+'"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.community-card').length===1);
  assert.equal(await dialog.getByText('Surviving idea',{exact:true}).count(),1);
  assert.equal(await dialog.locator('.community-vote').isDisabled(),true);
});


test('visitor requests: returning visitors see one footer badge until the form is visited',async t => {
  const {page}=await setup(t,{seenVoting:true});
  const entries=page.locator('[data-vote-card]');
  assert.equal(await entries.count(),2);
  assert.equal(await entries.locator('[data-new-feature="feature-requests"]:not([hidden])').count(),2);
  assert.equal(await entries.locator('[data-new-feature]').count(),2,'no doubled New labels');
  const landingBadge=page.locator('#landing [data-vote-card] [data-new-feature="feature-requests"]');
  assert.equal(await page.locator('#landing [data-community-open] [data-new-feature]').count(),0,'filled CTA carries no badge');
  assert.equal(await page.locator('.wrap [data-community-open] [data-new-feature="feature-requests"]').count(),1);
  for (const theme of ['dark','light']) {
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    assert.equal(await landingBadge.isVisible(),true);
    const contrast=await landingBadge.evaluate(badge=>{
      const rgb=value=>value.match(/[\d.]+/g).map(Number);
      let background=[255,255,255], layers=[];
      for(let node=badge;node;node=node.parentElement) layers.push(rgb(getComputedStyle(node).backgroundColor));
      for(const layer of layers.reverse()) background=background.map((v,i)=>layer[i]*(layer[3]??1)+v*(1-(layer[3]??1)));
      const luminance=values=>values.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
        .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const a=luminance(rgb(getComputedStyle(badge).color)),b=luminance(background);
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    assert.ok(contrast>=4.5,`${theme} landing badge contrast ${contrast}`);
  }
  const dialog=await openVotes(page);
  await dialog.locator('summary').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-new-feature="feature-requests"]')].every(el=>el.hidden));
  await page.reload();
  assert.equal(await page.locator('[data-new-feature="feature-requests"]:not([hidden])').count(),0);
});

test('visitor requests: a full queue keeps typed text and keyboard retry guidance',async t => {
  const {page,state}=await setup(t); state.fullSuggestions=true;
  const dialog=await openVotes(page); await dialog.locator('summary').click();
  await dialog.locator('#communitySuggestionTitle').fill('Capacity retry');
  await dialog.locator('#communitySuggestionDescription').fill('Synthetic.');
  await dialog.locator('form button[type=submit]').focus(); await page.keyboard.press('Enter');
  await dialog.getByText(/The idea list is full/).waitFor();
  assert.equal(await dialog.locator('form button[type=submit]').evaluate(el=>el===document.activeElement),true);
  assert.equal(await dialog.locator('#communitySuggestionTitle').inputValue(),'Capacity retry');
});

test('visitor requests: a held publication failure stays visible after reopen and list refresh',async t => {
  const {page,state}=await setup(t); state.features=[];
  const dialog=await openVotes(page);
  await dialog.getByText(en('comm.empty'),{exact:true}).waitFor();
  let release; state.holdSuggest=new Promise(resolve=>{release=resolve;}); t.after(()=>release());
  state.failSuggest=true;
  await dialog.locator('summary').click();
  await dialog.locator('#communitySuggestionTitle').fill('Retry after reopen');
  await dialog.locator('#communitySuggestionDescription').fill('Text stays available.');
  const sent=page.waitForRequest('**/api/community/suggest');
  await dialog.locator('form button[type=submit]').click(); await sent;
  await page.keyboard.press('Escape'); await openVotes(page);
  release();
  await dialog.getByText(en('comm.empty'),{exact:true}).waitFor();
  assert.equal(state.reads,2);
  assert.equal(await dialog.getByText(/Could not publish this idea/).isVisible(),true);
  assert.equal(await dialog.locator('#communitySuggestionTitle').inputValue(),'Retry after reopen');
  assert.equal(await dialog.locator('#communitySuggestionDescription').inputValue(),'Text stays available.');
  assert.equal(await dialog.locator('form button[type=submit]').isEnabled(),true);
  assert.equal(await dialog.locator('form button[type=submit]').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape'); await openVotes(page);
  await dialog.getByText(en('comm.empty'),{exact:true}).waitFor();
  assert.equal(await dialog.getByText(/Could not publish this idea/).isVisible(),true);
  state.failSuggest=false; state.holdSuggest=null;
  await dialog.locator('form button[type=submit]').click();
  await dialog.getByText('Retry after reopen',{exact:true}).waitFor();
  assert.deepEqual(state.suggestions[0],state.suggestions[1]);
});
