// Real landing, app.js, and board navigation; controlled browser IO makes races deterministic.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8');
let browser;
before(async () => { browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL}); });
after(async () => { await browser?.close(); });

async function setup(t, options = {}) {
  const context = await browser.newContext({viewport:{width:options.width || 1280, height:900}, reducedMotion:'reduce'});
  t.after(() => context.close());
  await context.addInitScript(options => {
    const realTimeout = window.setTimeout;
    const releases = {};
    const calls = [];
    const wait = async stage => {
      calls.push(stage);
      if (options.delay === stage) await new Promise(resolve => { releases[stage] = resolve; });
      if (options.fail === stage) throw new Error(`${stage} unavailable`);
    };
    window.fixture = {calls, release:stage => releases[stage]?.()};
    window.setTimeout = (fn, ms, ...args) => {
      if (ms === 120000) fixture.expire = fn;
      return realTimeout(fn, ms, ...args);
    };
    if (!sessionStorage.seeded) {
      localStorage.setItem('ledger_pick', JSON.stringify(options.pick || {dir:'alice', name:'chosen.hsg'}));
      localStorage.setItem('ba_dash_page', 'supply');
      localStorage.setItem('ba_dash_supply', 'shops');
      localStorage.setItem('ledger_history', 'original-history');
      sessionStorage.seeded = 'yes';
    }
    // Storage that refuses the history, as a full quota does.
    if (options.historyFull) {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'ledger_history') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        return real.call(this, key, value);
      };
    }
    const file = (name, time) => {
      const value = new File(['save'], name, {lastModified:time});
      value.arrayBuffer = async () => { await wait('bytes'); return new ArrayBuffer(8); };
      return {kind:'file', name, getFile:async () => value};
    };
    const folder = (name, entries) => ({name, kind:'directory',
      async queryPermission(){ await wait('permission'); return options.permission || 'granted'; },
      async requestPermission(){ calls.push('requestPermission'); return options.request || 'granted'; },
      async *values(){ await wait('scan'); yield* entries; },
    });
    const meta = {kind:'file', name:'chosen.hsg.meta', getFile:async () => ({name:'chosen.hsg.meta', lastModified:1,
      async text(){ await wait('sidecar'); return JSON.stringify({characterData:{name:'Alice'}, day:1}); }})};
    const handle = folder('Saves', options.empty ? [] : [
      folder('alice', [file('chosen.hsg', 1), file('newer.hsg', 2), meta]),
      folder('bob', [file('newer.hsg', 3)]),
    ]);
    fixture.nextFolder = folder('Replacement', [file('replacement.hsg', 4)]);
    window.showDirectoryPicker = options.unsupported ? undefined : async () => {
      if (options.cancelPicker) throw new DOMException('Cancelled', 'AbortError');
      return fixture.nextFolder;
    };
    const db = {objectStoreNames:{contains:() => true}, close(){}, transaction(){
      const tx = {objectStore:() => ({
        get(){
          const req = {};
          realTimeout(async () => {
            try { await wait('lookup'); req.result = options.missing ? null : handle; req.onsuccess?.(); }
            catch (err) { req.error = err; req.onerror?.(); }
          });
          return req;
        },
        put(){ realTimeout(() => tx.oncomplete?.()); },
      })};
      return tx;
    }};
    window.indexedDB.open = () => {
      const req = {};
      realTimeout(() => { req.result = db; req.onsuccess?.(); });
      return req;
    };
    window.Worker = class {
      constructor(){
        if (options.workerConstructorFails) throw new Error('Worker blocked');
        fixture.worker = this; this.messages = [];
      }
      postMessage(msg){ this.messages.push(msg); }
      terminate(){ this.terminated = true; }
      emit(data){ this.onmessage({data}); }
    };
    fixture.complete = (index = 0, history = 'fresh-history') => {
      const msg = fixture.worker.messages[index];
      fixture.worker.emit({kind:'built', id:msg.id, history, data:JSON.stringify({meta:{save:msg.name},daily:[]})});
    };
  }, options);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    // Only the page and app.js matter here; the stylesheet link to the site's
    // fonts would otherwise hold scripts back while the fixture answers it.
    if (url.hostname !== 'restore.test' || url.pathname.startsWith('/fonts/')) return route.abort();
    return route.fulfill({contentType:url.pathname === '/' ? 'text/html' : 'application/javascript',
      body:url.pathname === '/' ? html : url.pathname === '/app.js' ? app : ''});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://restore.test/' + (options.hash || ''));
  // Analysis rendering has its own tests; keep actual boot/navigation/controls.
  await page.evaluate(() => { renderAll = () => {}; });
  t.after(() => assert.deepEqual(errors, [], 'uncaught browser errors'));
  return page;
}
const messages = (page, count = 1) => page.waitForFunction(count => fixture.worker.messages.length >= count, count);
const hasBoard = page => page.locator('body').evaluate(el => el.classList.contains('has-board'));
const text = page => page.locator('#srcStatus').innerText();
const settle = page => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));

test('loading is prominent until data arrives, including runtime ready; remembered page and controls survive', async t => {
  const page = await setup(t, {width:390});
  await messages(page);
  assert.equal(await text(page), 'Loading your previous save…');
  assert.equal(await page.locator('#drop').isVisible(), false);
  assert.equal(await page.locator('#folderBtn').isEnabled(), true);
  assert.equal(await page.locator('#srcProg').getAttribute('role'), 'progressbar');
  assert.equal(await page.locator('#srcProg i').evaluate(el => getComputedStyle(el).animationName), 'none');
  const box = await page.locator('#srcStrip').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  const helpBox = await page.locator('#saveLocation').boundingBox();
  assert.ok(helpBox.y >= box.y + box.height, 'folder help follows the restore message');
  if (process.env.RESTORE_SCREENSHOT) await page.screenshot({path:process.env.RESTORE_SCREENSHOT});
  await page.evaluate(() => fixture.worker.emit({kind:'progress', stage:'ready'}));
  assert.equal(await text(page), 'Loading your previous save…');
  assert.equal(await hasBoard(page), false);
  assert.equal(await page.evaluate(() => fixture.worker.messages[0].name), 'chosen.hsg');
  const historyLength = await page.evaluate(() => history.length);
  await page.evaluate(() => fixture.complete());
  assert.equal(await hasBoard(page), true);
  assert.equal(await page.locator('#pageSupply').isVisible(), true);
  assert.equal(await page.locator('#supplyNav a.on > span').first().innerText(), 'Shops');
  assert.equal(await page.evaluate(() => history.length), historyLength);
  assert.equal(await page.locator('#landing').count(), 0);
  assert.equal(await page.locator('#folderBtn').count(), 1);
  assert.equal(await page.locator('#help #saveLocation').count(), 1);
  await page.reload();
  await page.evaluate(() => { renderAll = () => {}; });
  await messages(page);
  await page.evaluate(() => fixture.complete());
  assert.equal(await page.locator('#pageSupply').isVisible(), true);
});

test("at 390 px the board's source strip wraps a long file line instead of scrolling the page sideways", async t => {
  const page = await setup(t, {width:390});
  await messages(page);
  await page.evaluate(() => fixture.complete());
  assert.equal(await hasBoard(page), true);
  // A company with a long name, read from an autosave, while the board watches the folder.
  await page.evaluate(() => { document.getElementById('srcMeta').textContent =
    'The Very Long Company Name Ltd · autosave from 24 Sep, 12:23 · watching'; });
  const m = await page.evaluate(() => {
    const box = id => document.getElementById(id).getBoundingClientRect();
    const meta = box('srcMeta'), actions = box('srcActions');
    return {scroll: document.documentElement.scrollWidth, room: document.documentElement.getBoundingClientRect().width, metaRight: meta.right, actionsLeft: actions.left,
      beside: meta.top < actions.bottom && actions.top < meta.bottom};
  });
  assert.ok(m.scroll <= m.room, 'nothing scrolls sideways');
  assert.ok(m.metaRight <= 390, `the file line ends at ${m.metaRight}`);
  assert.ok(!m.beside || m.metaRight <= m.actionsLeft, 'and never runs under the buttons');
});

test('the Impressum and privacy notice stay reachable once the board replaces the landing', async t => {
  const page = await setup(t);
  await messages(page);
  await page.evaluate(() => fixture.complete());
  assert.equal(await hasBoard(page), true);
  // They used to be carried into the More menu and copied into a link strip.
  // The board has its own footer now and holds them itself; the landing's copy
  // goes with the landing, so exactly one of each is left.
  for (const [href, label] of [['impressum.html', 'Impressum'], ['privacy.html', 'Privacy']]) {
    assert.equal(await page.locator(`a[href="${href}"]`).count(), 1);
    assert.equal(await page.locator(`.sitefoot a[href="${href}"]`).innerText(), label);
  }
});

test('the board footer offers the game, the channel and the Discord, and stays voteless without community.js', async t => {
  const page = await setup(t);
  await messages(page);
  await page.evaluate(() => fixture.complete());
  assert.equal(await hasBoard(page), true);
  const foot = page.locator('.sitefoot');
  assert.equal(await foot.locator('a[href*="store.steampowered.com"]').count(), 1);
  assert.equal(await foot.locator('a[href*="youtube.com/@"]').count(), 1);
  // Two invites, not one: the Follow column's server invite, and the support
  // channel's own, which is where "Bugs and feedback" goes instead of GitHub.
  assert.equal(await foot.locator('a[href*="discord.gg/"]').count(), 2);
  assert.equal(await foot.locator('a[href*="discord.gg/"]', {hasText:'Bugs and feedback'}).count(), 1);
  assert.match(await foot.locator('.sf-said').innerText(), /Not affiliated with/);
  // This fixture serves no community.js, which is also what the CLI's
  // dashboard.html is: nothing reveals the card, so it must ship hidden. The
  // other direction, a copy whose API fails, is driven in community-browser.
  assert.equal(await foot.locator('[data-vote-card]').isVisible(), false);
});

test('URL destination wins over remembered page without adding a visit', async t => {
  const page = await setup(t, {hash:'#company'});
  await messages(page);
  const length = await page.evaluate(() => history.length);
  await page.evaluate(() => fixture.complete());
  assert.equal(await page.locator('#pageCompany').isVisible(), true);
  assert.equal(await page.evaluate(() => history.length), length);
  await page.locator('#nav a[data-id="supply"]').click();
  await page.goBack();
  assert.equal(await page.locator('#pageCompany').isVisible(), true);
});

for (const permission of ['prompt', 'denied']) test(`${permission} access waits for an explicit click`, async t => {
  const page = await setup(t, {permission});
  await page.waitForFunction(() => document.querySelector('#updateBtn').disabled === false);
  assert.equal(await page.locator('#srcProg').isVisible(), false);
  assert.equal(await page.evaluate(() => fixture.calls.includes('requestPermission')), false);
  await page.locator('#updateBtn').click();
  await messages(page);
  assert.equal(await page.evaluate(() => fixture.calls.filter(x => x === 'requestPermission').length), 1);
});

for (const options of [{missing:true}, {unsupported:true}, {fail:'lookup'}, {fail:'permission'}, {empty:true}, {fail:'scan'}, {fail:'bytes'}]) {
  test(`unavailable restore leaves recovery usable: ${JSON.stringify(options)}`, async t => {
    const page = await setup(t, options);
    await page.waitForFunction(() => document.querySelector('#srcProg').hidden);
    assert.equal(await hasBoard(page), false);
    assert.equal(await page.locator('#folderBtn').isEnabled(), true);
    assert.equal(await page.locator('#savePickLabel').isVisible(), true);
  });
}

for (const delay of ['lookup', 'permission', 'scan', 'sidecar', 'bytes']) test(`new file wins during ${delay}`, async t => {
  const page = await setup(t, {delay});
  await page.waitForFunction(delay => fixture.calls.includes(delay), delay);
  await page.locator('#savePick').setInputFiles({name:'manual.hsg', mimeType:'application/octet-stream', buffer:Buffer.from('save')});
  await messages(page);
  await page.evaluate(delay => fixture.release(delay), delay);
  await settle(page);
  assert.equal(await page.evaluate(() => fixture.worker.messages.length), 1);
  assert.equal(await page.evaluate(() => fixture.worker.messages[0].name), 'manual.hsg');
  await page.evaluate(() => fixture.complete());
  assert.equal(await hasBoard(page), true);
  assert.match(await page.locator('#srcMeta').innerText(), /manual/i);
});

test('new save selection rejects both stale data and history after an old build', async t => {
  const page = await setup(t);
  await messages(page);
  await page.locator('.save-trigger').click();
  await page.locator('[role="option"][data-value="bob|newer.hsg"]').click();
  await messages(page, 2);
  await page.evaluate(() => fixture.complete(0, 'obsolete-history'));
  assert.equal(await hasBoard(page), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('ledger_history')), 'original-history');
  await page.evaluate(() => fixture.complete(1));
  assert.equal(await hasBoard(page), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ledger_pick')).dir), 'bob');
});

test('old scan errors cannot replace a newer source', async t => {
  const page = await setup(t, {delay:'scan', fail:'scan'});
  await page.waitForFunction(() => fixture.calls.includes('scan'));
  await page.locator('#savePick').setInputFiles({name:'manual.hsg', mimeType:'application/octet-stream', buffer:Buffer.from('save')});
  await messages(page);
  await page.evaluate(() => fixture.release('scan'));
  await settle(page);
  assert.doesNotMatch(await text(page), /Could not read/);
  await page.evaluate(() => fixture.complete());
  assert.equal(await hasBoard(page), true);
});

test('changing folders discards the pending build; cancelling the picker keeps it', async t => {
  for (const cancelPicker of [false, true]) {
    const page = await setup(t, {cancelPicker});
    await messages(page);
    await page.locator('#folderBtn').click();
    if (!cancelPicker) {
      await messages(page, 2);
      await page.evaluate(() => fixture.worker.emit({kind:'failed', id:fixture.worker.messages[0].id, error:'Old failure'}));
      assert.doesNotMatch(await text(page), /Old failure/);
      await page.evaluate(() => fixture.complete(1));
      assert.match(await page.locator('#srcMeta').innerText(), /replacement/i);
    } else {
      await page.evaluate(() => fixture.complete());
    }
    assert.equal(await hasBoard(page), true);
  }
});

test('a delayed directory drop cannot supersede a later file selection', async t => {
  const page = await setup(t);
  await messages(page);
  await page.evaluate(() => {
    const event = new Event('drop', {cancelable:true});
    event.dataTransfer = {files:[], items:[{kind:'file',
      getAsFileSystemHandle:() => new Promise(resolve => { fixture.releaseDrop = () => resolve(fixture.nextFolder); }),
    }]};
    document.dispatchEvent(event);
  });
  await page.locator('#savePick').setInputFiles({name:'manual.hsg', mimeType:'application/octet-stream', buffer:Buffer.from('save')});
  await messages(page, 2);
  await page.evaluate(() => fixture.releaseDrop());
  await settle(page);
  assert.equal(await page.evaluate(() => fixture.worker.messages.length), 2);
  await page.evaluate(() => fixture.complete(1));
  assert.match(await page.locator('#srcMeta').innerText(), /manual/i);
});

test('keyboard access to one file opens the picker during restore', async t => {
  const page = await setup(t);
  await messages(page);
  await page.locator('#savePickLabel').focus();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles({name:'keyboard.hsg', mimeType:'application/octet-stream', buffer:Buffer.from('save')});
  await messages(page, 2);
  await page.evaluate(() => fixture.complete(1));
  assert.equal(await hasBoard(page), true);
  assert.match(await page.locator('#srcMeta').innerText(), /keyboard/i);
});

test('permission denial after a click keeps recovery available', async t => {
  const page = await setup(t, {permission:'prompt', request:'denied'});
  await page.locator('#updateBtn').click();
  assert.match(await text(page), /access was not granted/);
  assert.equal(await page.locator('#srcProg').isVisible(), false);
  assert.equal(await page.locator('#recoverBtn').isVisible(), true);
});

// WB-5 in #109: the timeout is the reader's, not the whole attempt's. A slow
// folder lookup, a permission prompt or a game serializing never costs the
// reader; a reader that has work and says nothing for two minutes does.
test("the timeout covers the reader's own work, not the lookup, and Reload app starts a new attempt", async t => {
  const page = await setup(t, {delay:'lookup'});
  await page.waitForFunction(() => fixture.calls.includes('lookup'));
  assert.equal(await page.evaluate(() => typeof fixture.expire), 'undefined', 'nothing is timed while the reader has no work');
  await page.evaluate(() => fixture.release('lookup'));
  await messages(page);
  // A progress message starts the clock again: the timer armed before it is spent.
  const rearmed = await page.evaluate(() => { fixture.first = fixture.expire; fixture.worker.emit({kind:'progress', stage:'code'}); return fixture.first !== fixture.expire; });
  assert.equal(rearmed, true, 'progress arms a new timer');
  await page.evaluate(() => fixture.first());
  assert.equal(await page.locator('#reloadBtn').isVisible(), false, 'the spent timer does nothing');
  await page.evaluate(() => fixture.expire());
  await settle(page);
  assert.equal(await page.locator('#reloadBtn').isVisible(), true);
  assert.equal(await page.locator('#srcProg').isVisible(), false);
  await Promise.all([page.waitForNavigation(), page.locator('#reloadBtn').click()]);
  await page.evaluate(() => { renderAll = () => {}; });
  await page.waitForFunction(() => fixture.calls.includes('lookup'));
  await page.evaluate(() => fixture.release('lookup'));
  await messages(page);
  await page.evaluate(() => fixture.complete());
  assert.equal(await hasBoard(page), true);
});

test('malformed build data does not persist history or strand loading', async t => {
  const page = await setup(t);
  await messages(page);
  await page.evaluate(() => fixture.worker.emit({kind:'built', id:fixture.worker.messages[0].id, data:'invalid JSON', history:'bad-history'}));
  assert.equal(await page.locator('#srcProg').isVisible(), false);
  assert.equal(await page.locator('#updateBtn').isEnabled(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('ledger_history')), 'original-history');
});

for (const failure of ['crash', 'startup', 'timeout', 'constructor']) test(`${failure} settles loading and offers reload`, async t => {
  const page = await setup(t, {workerConstructorFails:failure === 'constructor'});
  if (failure !== 'constructor') {
    await messages(page);
    await page.evaluate(failure => {
      if (failure === 'crash') fixture.worker.onerror({message:'Reader crashed', preventDefault(){}});
      if (failure === 'startup') fixture.worker.emit({kind:'startup-failed', error:'Download failed'});
      if (failure === 'timeout') fixture.expire();
      fixture.complete(0, 'too-late');
    }, failure);
  }
  assert.equal(await page.locator('#srcProg').isVisible(), false);
  assert.equal(await page.locator('#reloadBtn').isVisible(), true);
  assert.equal(await hasBoard(page), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('ledger_history')), 'original-history');
});

test('corrupt save can be retried; a failed live refresh retains the board', async t => {
  const page = await setup(t);
  await messages(page);
  await page.evaluate(() => fixture.worker.emit({kind:'failed', id:fixture.worker.messages[0].id, error:'Corrupt save'}));
  assert.equal(await page.locator('#srcProg').isVisible(), false);
  assert.equal(await page.locator('#recoverBtn').isVisible(), true);
  assert.match(await page.locator('#srcMeta').textContent(), /Automatic updates are paused\. Click Update to retry\./);
  await page.locator('#updateBtn').click();
  await messages(page, 2);
  await page.evaluate(() => fixture.complete(1));
  assert.doesNotMatch(await page.locator('#srcMeta').textContent(), /Automatic updates are paused/);
  await page.locator('#menuBtn').click();
  await page.locator('.save-trigger').click();
  await page.locator('[role="option"][data-value="bob|newer.hsg"]').click();
  await messages(page, 3);
  await page.evaluate(() => fixture.worker.emit({kind:'failed', id:fixture.worker.messages[2].id, error:'Corrupt save'}));
  assert.equal(await hasBoard(page), true);
  assert.match(await text(page), /Could not read/);
  assert.match(await page.locator('#srcMeta').textContent(), /Last good board kept.*Automatic updates are paused/);
});

for (const [pick, expected] of [[{dir:'alice', name:''}, 'newer.hsg'], [{dir:'', name:''}, 'newer.hsg'], [{dir:'alice', name:'missing.hsg'}, 'newer.hsg'], [{dir:'missing', name:'chosen.hsg'}, 'newer.hsg']]) {
  test(`selection rule survives startup: ${JSON.stringify(pick)}`, async t => {
    const page = await setup(t, {pick});
    await messages(page);
    const msg = await page.evaluate(() => ({name:fixture.worker.messages[0].name, mtime:fixture.worker.messages[0].mtime}));
    assert.equal(msg.name, expected);
    assert.equal(msg.mtime, pick.dir === 'alice' ? 2 : 3);
    await page.evaluate(() => fixture.complete());
    if (pick.name) assert.match(await page.locator('#srcNote').innerText(), /Could not find/);
  });
}

// WB-2 in #109: a history the browser will not keep used to be said for a
// moment and then cleared by the build's own note, while the trends froze.
test('storage that refuses the history says so under every board, and the visit keeps its record', async t => {
  const page = await setup(t, {historyFull:true});
  await messages(page);
  await page.evaluate(() => fixture.complete(0, 'fresh-history'));
  assert.equal(await hasBoard(page), true);
  const said = /Could not remember history\. Browser storage is full or blocked\./;
  assert.match(await page.locator('#srcNote').innerText(), said);
  await page.locator('#savePick').setInputFiles({name:'manual.hsg', mimeType:'application/octet-stream', buffer:Buffer.from('save')});
  await messages(page, 2);
  assert.equal(await page.evaluate(() => fixture.worker.messages[1].history), 'fresh-history',
    "the next build carries this visit's record, not the stored one");
  await page.evaluate(() => fixture.complete(1, 'newer-history'));
  assert.match(await page.locator('#srcNote').innerText(), said, 'still said after the next build');
  assert.equal(await page.evaluate(() => localStorage.getItem('ledger_history')), 'original-history');
});

// WB-3 in #109: a name carries no history; the reader names against its own.
// Forget history drops the reader's copy as well as the stored one.
test('a name goes to the reader without a history, and forgetting reaches the reader too', async t => {
  const page = await setup(t);
  await messages(page);
  await page.evaluate(() => fixture.complete());
  await page.evaluate(() => { window.LEDGER_SOURCE.name('rid', 'beer'); window.LEDGER_SOURCE.name('rid2', 'wine'); });
  await messages(page, 3);
  const asked = await page.evaluate(() => fixture.worker.messages.slice(1).map(m => ({kind:m.kind, history:'history' in m})));
  assert.deepEqual(asked, [{kind:'name', history:false}, {kind:'name', history:false}]);
  await page.evaluate(() => document.getElementById('forgetHistory').click());
  await messages(page, 4);
  assert.equal(await page.evaluate(() => fixture.worker.messages[3].kind), 'forget');
  assert.equal(await page.evaluate(() => localStorage.getItem('ledger_history')), null);
});

// U2 in #109: one save file cannot be reopened by the page after a reload.
test('one file: Update says a changed file is chosen again, and a reload asks for the file', async t => {
  const page = await setup(t, {missing:true});
  await page.waitForFunction(() => document.querySelector('#srcProg').hidden);
  await page.locator('#savePick').setInputFiles({name:'manual.hsg', mimeType:'application/octet-stream', buffer:Buffer.from('save')});
  await messages(page);
  await page.evaluate(() => fixture.complete());
  assert.equal(await hasBoard(page), true);
  assert.match(await page.locator('#updateBtn').getAttribute('title'), /choose the file again/);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#updateBtn').click();
  await chooser;
  assert.match(await page.locator('#srcNote').innerText(), /To read a newer save, choose the file again\./);

  await page.evaluate(() => { location.hash = '#company'; });
  await page.reload();
  await page.evaluate(() => { renderAll = () => {}; });
  await page.waitForFunction(() => document.getElementById('srcStatus').textContent === 'Choose the save file again');
  assert.equal(await hasBoard(page), false);
  assert.match(await page.locator('#srcMeta').innerText(), /manual\.hsg/i);
  assert.match(await page.locator('#srcNote').innerText(), /after a reload.*where you left it/s);
  assert.equal(await page.locator('#recoverBtn').isVisible(), true);
  assert.equal(await page.locator('#recoverBtn').innerText(), 'Choose the file again');
  const again = page.waitForEvent('filechooser');
  await page.locator('#recoverBtn').click();
  await (await again).setFiles({name:'manual.hsg', mimeType:'application/octet-stream', buffer:Buffer.from('save')});
  await messages(page);
  await page.evaluate(() => fixture.complete());
  assert.equal(await hasBoard(page), true);
  assert.equal(await page.locator('#pageCompany').isVisible(), true, 'the board opens where it was');
});

test('a remembered folder is never offered as a file to choose again', async t => {
  const page = await setup(t);
  await messages(page);
  await page.evaluate(() => fixture.complete());
  await page.reload();
  await page.evaluate(() => { renderAll = () => {}; });
  await messages(page);
  assert.notEqual(await text(page), 'Choose the save file again');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('ledger_reopen')), null);
});
