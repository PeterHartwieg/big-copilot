const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
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
  const state = {heartbeats:[], reads:0, votes:[], count:40, failPresence:false, failVotes:false, holdPresence:null,holdVote:null,
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
    if(options.fullStorage) Storage.prototype.setItem = function(){throw Error('Quota exceeded');};
    if(options.noLocks) Object.defineProperty(navigator, 'locks', {value:undefined});
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
      return json({features:state.features});
    }
    if(url.pathname === '/api/community/vote') {
      const body = request.postDataJSON(); state.votes.push(body);
      if(state.holdVote) await state.holdVote;
      if(state.failVotes) return json({error:'Unavailable'},503);
      const feature = state.features.find(f => f.id === body.featureId);
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
const online = page => page.locator('#live').getByText(/^\d+ online$/);
const openVotes = async page => {
  await page.getByRole('button',{name:/Vote on features/}).filter({visible:true}).click();
  return page.getByRole('dialog',{name:'Vote on upcoming features'});
};

test('landing is network quiet; actual save loading starts presence and preserves footer controls', async t => {
  const {page,state,loadSave} = await setup(t);
  assert.equal(state.heartbeats.length,0); assert.equal(state.reads,0);
  const dialog = await openVotes(page);
  await dialog.getByText('Optimize staffing',{exact:true}).waitFor();
  assert.equal(state.reads,1); assert.equal(state.heartbeats.length,0);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await loadSave(page);
  await online(page).waitFor();
  assert.equal(state.heartbeats.length,1);
  assert.deepEqual(Object.keys(state.heartbeats[0]),['browserId']);
  assert.match(state.heartbeats[0].browserId,/^[0-9a-f-]{36}$/i);
  assert.equal(await page.locator('#landing').count(),0);
  // The count lives in the masthead's live status: its dot stays, and the
  // footer keeps only the vote button.
  assert.equal(await page.locator('#live b').count(),1);
  assert.equal(await page.locator('#footerLinks .community-online').count(),0);
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
  await page.getByText('Stale',{exact:true}).waitFor();
  await loadSave(page);
  await online(page).waitFor();
  assert.equal(state.heartbeats.length,1);
  await page.evaluate(() => { BigCopilotCommunity.start(); BigCopilotCommunity.start(); });
  assert.equal(await page.getByRole('button',{name:/Vote on features/}).count(),1);
  assert.equal(state.heartbeats.length,1);
});

test('concurrent tabs share the browser identity, request schedule and online count', async t => {
  const {page,newPage,state,loadSave} = await setup(t);
  const other = await newPage();
  await Promise.all([loadSave(page),loadSave(other)]);
  await Promise.all([online(page).waitFor(),online(other).waitFor()]);
  assert.equal(state.heartbeats.length,1,'only one tab claims the due heartbeat');
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(state.heartbeats.length,1,'focus and connectivity events respect the lease');
  await page.clock.fastForward(306000);
  await page.waitForFunction(() => document.querySelector('#live').textContent.includes('40 online'));
  // Wait for the actual request/response state instead of relying on timer ordering.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve,0)));
  assert.equal(state.heartbeats.length,2);
  assert.equal(state.heartbeats[0].browserId,state.heartbeats[1].browserId);
});

test('reload and save changes retain the next heartbeat instead of sending immediately', async t => {
  const {page,state,loadSave} = await setup(t);
  await loadSave(page); await online(page).waitFor();
  const id = state.heartbeats[0].browserId;
  await page.reload();
  await page.waitForFunction(() => !!window.BigCopilotCommunity);
  await page.evaluate(() => { renderAll = drawMast; });
  await loadSave(page); await online(page).waitFor();
  assert.equal(state.heartbeats.length,1);
  await loadSave(page);
  assert.equal(state.heartbeats.length,1);
  await page.clock.fastForward(306000);
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve,0)));
  assert.equal(state.heartbeats.at(-1).browserId,id);
});

test('a sleeping browser skips missed intervals and a failed heartbeat backs off across reloads', async t => {
  const {page,state,loadSave} = await setup(t);
  await loadSave(page); await online(page).waitFor();
  state.failPresence = true;
  await page.clock.fastForward(3600000);
  await page.getByText('Online count unavailable',{exact:true}).waitFor();
  assert.equal(state.heartbeats.length,2,'no replay of twelve missed heartbeats');
  await page.reload(); await page.waitForFunction(() => !!window.BigCopilotCommunity);
  await page.evaluate(() => { renderAll = drawMast; });
  await loadSave(page);
  assert.equal(state.heartbeats.length,2,'failure backoff survives reload');
  assert.equal(await page.locator('#nav').isVisible(),true);
});

for(const options of [{blockStorage:true},{fullStorage:true},{noLocks:true}]) test(`presence tolerates unavailable browser facilities: ${JSON.stringify(options)}`, async t => {
  const {page,loadSave,state} = await setup(t,options);
  await loadSave(page); await online(page).waitFor();
  assert.equal(state.heartbeats.length,1);
  const dialog = await openVotes(page);
  await dialog.getByText('Find a location',{exact:true}).waitFor();
});

test('voting fetches on demand, prevents duplicates and uses the mutation result without refetching', async t => {
  const {page,state} = await setup(t);
  const dialog = await openVotes(page);
  const vote = dialog.getByRole('button',{name:'Vote',exact:true}).first();
  await vote.click();
  await dialog.getByRole('button',{name:'Voted',exact:true}).waitFor();
  assert.equal(state.votes.length,1); assert.equal(state.reads,1);
  assert.equal(await dialog.getByRole('button',{name:'Voted',exact:true}).isDisabled(),true);
  await dialog.getByRole('button',{name:'Vote',exact:true}).click();
  assert.equal(state.votes.length,2,'each feature has its own vote');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/Vote on features/}).waitFor();
  assert.equal(await page.getByRole('button',{name:/Vote on features/}).evaluate(el => el === document.activeElement),true);
  await openVotes(page);
  await page.waitForFunction(() => [...document.querySelectorAll('dialog[open] button')].filter(b => b.textContent === 'Voted').length === 2);
  assert.equal(state.reads,2);
  assert.equal(await page.locator('[data-new-feature="community-voting"]').isVisible(),false);
});

test('voting errors have a user-triggered retry and feature text is rendered as text', async t => {
  const {page,state} = await setup(t);
  state.failVotes = true;
  const dialog = await openVotes(page);
  await dialog.getByRole('button',{name:/Retry/}).waitFor();
  assert.equal(state.reads,1);
  state.failVotes = false;
  state.features[0].title = '<img src=x onerror=alert(1)>';
  await dialog.getByRole('button',{name:/Retry/}).click();
  await dialog.getByText('<img src=x onerror=alert(1)>',{exact:true}).waitFor();
  assert.equal(await dialog.locator('img').count(),0);
  assert.equal(state.reads,2);
});

test('a second tab recovers an abandoned heartbeat lease and ignores the old result', async t => {
  const {page,newPage,state,loadSave} = await setup(t);
  let release;
  state.holdPresence = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  const sent = page.waitForRequest('**/api/community/presence');
  await loadSave(page);
  await sent;
  const other = await newPage();
  state.holdPresence = null;
  state.count = 41;
  await loadSave(other);
  await other.clock.fastForward(31000);
  await online(other).waitFor();
  assert.equal(state.heartbeats.length,2);
  state.count = 999;
  release();
  await online(page).waitFor();
  assert.equal(await online(page).innerText(),'41 online','late owner cannot overwrite the newer result');
});

test('reopening the dialog during a vote waits for that mutation before fetching totals', async t => {
  const {page,state} = await setup(t);
  const dialog = await openVotes(page);
  let release;
  state.holdVote = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  const sent = page.waitForRequest('**/api/community/vote');
  await dialog.getByRole('button',{name:'Vote',exact:true}).first().click();
  await sent;
  await page.keyboard.press('Escape');
  await openVotes(page);
  assert.equal(state.reads,1,'on-open GET waits for the in-flight mutation');
  release();
  await dialog.getByRole('button',{name:'Voted',exact:true}).waitFor();
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
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)),true);
  }
  if(process.env.COMMUNITY_SCREENSHOT) await page.screenshot({path:process.env.COMMUNITY_SCREENSHOT});
});
