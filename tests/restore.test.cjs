// Real landing, app.js, and board navigation; controlled browser IO makes races deterministic.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe, textRe} = require('./_i18n.cjs');
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
  // Playwright only sees a file chooser the browser was told to intercept, and
  // it turns interception on without waiting whenever the first 'filechooser'
  // listener is added. A waitForEvent followed at once by a key press can
  // therefore lose the race: the page opens the chooser (trusted keydown,
  // user activation, input.click() all seen in CI) before interception is
  // on, and no event ever comes. A listener held for the page's life turns it
  // on before the page loads, so every later waitForEvent finds it on.
  page.on('filechooser', () => {});
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

test('a portable import offers Download snapshot in the visible More menu', async t => {
  const page = await setup(t, {missing:true});
  await page.waitForFunction(() => fixture.calls.includes('lookup'));
  await page.evaluate(() => fixture.worker.emit({kind:'progress', stage:'ready'}));
  const bytes = Buffer.from('{"format":"big-copilot-save","save":"fixture","facts":{"stamp":"paired"}}');
  await page.locator('#savePick').setInputFiles({name:'portable.bcsave', mimeType:'application/octet-stream', buffer:bytes});
  await messages(page);
  await page.evaluate(() => fixture.complete());
  assert.equal(await hasBoard(page), true);
  assert.equal(await page.locator('#srcStrip').isVisible(), false);
  await page.locator('#menuBtn').click();
  assert.equal(await page.locator('#menuSourceSlot #snapshotExport').isVisible(), true);
  const downloaded = page.waitForEvent('download');
  await page.locator('#snapshotExport').click();
  await page.waitForFunction(() => fixture.worker.messages.some(m => m.kind === 'held'));
  await page.evaluate(() => {
    const request = fixture.worker.messages.find(m => m.kind === 'held');
    const save = fixture.worker.messages[0];
    fixture.worker.emit({kind:'held', id:request.id, name:save.name, bytes:save.bytes});
  });
  const download = await downloaded;
  assert.equal(download.suggestedFilename(), 'portable.bcsave');
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), bytes);
});

test('loading is prominent until data arrives, including runtime ready; remembered page and controls survive', async t => {
  const page = await setup(t, {width:390});
  await messages(page);
  assert.equal(await text(page), en("app.strip.restoring"));
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
  assert.equal(await text(page), en("app.strip.restoring"));
  assert.equal(await hasBoard(page), false);
  assert.equal(await page.evaluate(() => fixture.worker.messages[0].name), 'chosen.hsg');
  const historyLength = await page.evaluate(() => history.length);
  await page.evaluate(() => fixture.complete());
  assert.equal(await hasBoard(page), true);
  /* The fixture's payload is two keys, so nothing on Supply is drawn: the
     remembered page is the one on screen, which is what this holds. */
  assert.deepEqual(await page.evaluate(() => [page, document.getElementById('pageSupply').hidden]), ['supply', false]);
  assert.equal(await page.evaluate(() => sub.supply), 'deliveries', 'a remembered Shops tab opens Deliveries');
  assert.equal(await page.evaluate(() => history.length), historyLength);
  assert.equal(await page.locator('#landing').count(), 0);
  assert.equal(await page.locator('#folderBtn').count(), 1);
  assert.equal(await page.locator('#help #saveLocation').count(), 1);
  await page.reload();
  await page.evaluate(() => { renderAll = () => {}; });
  await messages(page);
  await page.evaluate(() => fixture.complete());
  assert.deepEqual(await page.evaluate(() => [page, document.getElementById('pageSupply').hidden]), ['supply', false]);
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
  for (const [href, label] of [['impressum.html', en('foot.impressum')], ['privacy.html', en('foot.privacy')]]) {
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
  assert.equal(await foot.locator('a[href*="discord.gg/"]', {hasText:en("foot.feedback.text")}).count(), 1);
  assert.match(await foot.locator('.sf-said').innerText(), enRe("foot.fanmade"));
  // This fixture serves no community.js, which is also what the CLI's
  // dashboard.html is: nothing reveals the card, so it must ship hidden. The
  // other direction, a copy whose API fails, is driven in community-browser.
  assert.equal(await foot.locator('[data-vote-card]').isVisible(), false);
});

test('on the board Update and one ··· sit at the sidebar foot, the ··· holds the save source and the utilities, and the strip takes no row until something is wrong', async t => {
  const page = await setup(t);
  await messages(page);
  await page.evaluate(() => fixture.complete());
  assert.equal(await hasBoard(page), true);
  // The sidebar's foot, after the clock: no row of its own for the source controls.
  assert.equal(await page.locator('#mast .sd-foot #mastSrc #updateBtn').count(), 1);
  assert.equal(await page.locator('#mast .sd-foot #mastSrc #menuBtn').count(), 1);
  const order = await page.evaluate(() => ['ssField', 'nav', 'navRefs', 'clock', 'mastSrc'].map(id => document.getElementById(id))
    .every((el, i, all) => i === 0 || (all[i - 1].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)));
  assert.ok(order, 'Search, the places, the references, the clock, then Update and ···');
  // One ···: the board's own steps aside for the hosted board's.
  assert.equal(await page.locator('#navMore').isVisible(), false);
  assert.equal(await page.locator('#mast [aria-haspopup]:visible').count(), 1);
  assert.equal(await page.locator('#srcStrip').isVisible(), false, 'all well: no strip row');
  assert.equal(await page.locator('#sourceRow').evaluate(el => el.getBoundingClientRect().height), 0);
  // The menu opens beside the sidebar: the save source first, then What's
  // new, Preferences and Help & feedback.
  await page.locator('#menuBtn').click();
  const panel = page.locator('#srcMenu.open .menu-panel');
  assert.equal(await panel.isVisible(), true);
  const [side, box] = await Promise.all([page.locator('#mast').boundingBox(), panel.boundingBox()]);
  assert.ok(box.x >= side.x + side.width, `the menu ${box.x} opens beside the sidebar ${side.x + side.width}`);
  assert.deepEqual(await panel.locator('[data-nx-item]').evaluateAll(els => els.map(el => el.dataset.nxItem)), ['news', 'prefs', 'help']);
  assert.ok(await panel.evaluate(el => {
    const at = sel => el.querySelector(sel);
    return !!(at('#menuSrcLine').compareDocumentPosition(at('#folderBtn')) & Node.DOCUMENT_POSITION_FOLLOWING)
      && !!(at('#folderBtn').compareDocumentPosition(at('[data-nx-item="news"]')) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), 'the source, then the utilities');
  // A utility closes the menu and opens its sheet.
  await panel.locator('[data-nx-item="prefs"]').click();
  assert.equal(await page.locator('#srcMenu').evaluate(el => el.classList.contains('open')), false);
  await page.waitForFunction(() => document.body.classList.contains('px-on'));
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
  assert.doesNotMatch(await text(page), enRe("app.build.failed"));
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
  assert.match(await text(page), enRe("app.folder.denied"));
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
  assert.match(await page.locator('#srcMeta').textContent(), enRe("app.build.paused"));
  await page.locator('#updateBtn').click();
  await messages(page, 2);
  await page.evaluate(() => fixture.complete(1));
  assert.doesNotMatch(await page.locator('#srcMeta').textContent(), enRe("app.build.paused"));
  await page.locator('#menuBtn').click();
  await page.locator('.save-trigger').click();
  await page.locator('[role="option"][data-value="bob|newer.hsg"]').click();
  await messages(page, 3);
  await page.evaluate(() => fixture.worker.emit({kind:'failed', id:fixture.worker.messages[2].id, error:'Corrupt save'}));
  assert.equal(await hasBoard(page), true);
  assert.match(await text(page), enRe("app.build.failed"));
  assert.match(await page.locator('#srcMeta').textContent(), new RegExp(enRe('app.build.kept').source + '.*' + enRe('app.build.paused').source));
});

for (const [pick, expected] of [[{dir:'alice', name:''}, 'newer.hsg'], [{dir:'', name:''}, 'newer.hsg'], [{dir:'alice', name:'missing.hsg'}, 'newer.hsg'], [{dir:'missing', name:'chosen.hsg'}, 'newer.hsg']]) {
  test(`selection rule survives startup: ${JSON.stringify(pick)}`, async t => {
    const page = await setup(t, {pick});
    await messages(page);
    const msg = await page.evaluate(() => ({name:fixture.worker.messages[0].name, mtime:fixture.worker.messages[0].mtime}));
    assert.equal(msg.name, expected);
    assert.equal(msg.mtime, pick.dir === 'alice' ? 2 : 3);
    await page.evaluate(() => fixture.complete());
    if (pick.name) assert.match(await page.locator('#srcNote').innerText(), new RegExp(['app.pick.gone.save', 'app.pick.gone.folder',
      'app.pick.moved.any', 'app.pick.moved.character', 'app.pick.moved.folder'].map(k => enRe(k).source).join('|')));
  });
}

// WB-2 in #109: a history the browser will not keep used to be said for a
// moment and then cleared by the build's own note, while the trends froze.
test('storage that refuses the history says so under every board, and the visit keeps its record', async t => {
  const page = await setup(t, {historyFull:true});
  await messages(page);
  await page.evaluate(() => fixture.complete(0, 'fresh-history'));
  assert.equal(await hasBoard(page), true);
  const said = new RegExp(enRe('app.store.history').source + ' ' + enRe('app.store.full').source);
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
  assert.match(await page.locator('#updateBtn').getAttribute('title'), enRe('app.update.file.title'));
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#updateBtn').click();
  await chooser;
  assert.match(await page.locator('#srcNote').innerText(), enRe("app.update.file.note"));

  await page.evaluate(() => { location.hash = '#company'; });
  await page.reload();
  await page.evaluate(() => { renderAll = () => {}; });
  await page.waitForFunction(expected => document.getElementById('srcStatus').textContent === expected, en('app.reopen.file'));
  assert.equal(await hasBoard(page), false);
  assert.match(await page.locator('#srcMeta').innerText(), /manual\.hsg/i);
  assert.match(await page.locator('#srcNote').innerText(), new RegExp(enRe('app.reopen.why').source + '.*' + enRe('app.reopen.where').source, 's'));
  assert.equal(await page.locator('#recoverBtn').isVisible(), true);
  assert.equal(await page.locator('#recoverBtn').innerText(), en("app.recover.file"));
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
  assert.notEqual(await text(page), en("app.reopen.file"));
  assert.equal(await page.evaluate(() => sessionStorage.getItem('ledger_reopen')), null);
});

test('the landing save-folder box has More help, which opens the save help under it', async t => {
  const page = await setup(t);
  const more = page.locator('#saveMoreHelp');
  assert.equal(await more.isVisible(), true);
  assert.equal(await page.locator('#help').isVisible(), false);
  await more.click();
  assert.equal(await page.locator('#help').evaluate(d => d.open), true);
  assert.equal(await more.getAttribute('aria-expanded'), 'true');
  assert.match(await page.locator('#help').innerText(), textRe("land.help.find"));
  await more.click();
  assert.equal(await page.locator('#help').evaluate(d => d.open), false);
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
});
