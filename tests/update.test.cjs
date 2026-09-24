const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const web = path.join(__dirname, '..', 'web');
const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
const loaded = JSON.parse(fs.readFileSync(path.join(web, 'version.json'), 'utf8'));
const next = {version:'aaaaaaaaaa', latest:{pr:999, date:'2099-01-01', title:'A useful new feature', summary:'The latest improvement for your company.'}};
let browser;
before(async () => { browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL}); });
after(async () => { await browser?.close(); });

async function setup(t, options = {}) {
  const context = await browser.newContext({viewport:{width:options.width || 1280, height:900}, reducedMotion:'reduce'});
  t.after(() => context.close());
  const page = await context.newPage();
  const state = {release:options.initial || loaded, checks:0, navigations:0};
  await page.addInitScript(blockStorage => {
    window.Worker = class {postMessage(){} terminate(){}};
    const interval = window.setInterval;
    window.setInterval = (fn, ms, ...args) => {
      if (ms === 60000) { window.checkRelease = fn; return 0; }
      return interval(fn, ms, ...args);
    };
    let now = Date.now();
    Date.now = () => now;
    window.advanceRelease = () => { now += 61000; return window.checkRelease(); };
    if (blockStorage) Object.defineProperty(window, 'sessionStorage', {get(){throw Error('Blocked');}});
  }, !!options.blockStorage);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'update.test') return route.abort();
    if (url.pathname === '/') {
      state.navigations++;
      return route.fulfill({contentType:'text/html', body:state.html || html});
    }
    if (url.pathname === '/app.js') return route.fulfill({contentType:'text/javascript', body:fs.readFileSync(path.join(web, 'app.js'), 'utf8')});
    if (url.pathname === '/version.json') {
      state.checks++;
      if (state.fail) return route.fulfill({status:503, body:'Unavailable'});
      return route.fulfill({contentType:'application/json', body:JSON.stringify(state.release)});
    }
    return route.abort();
  });
  await page.goto('https://update.test/#supply');
  await page.waitForFunction(() => typeof window.advanceRelease === 'function');
  await page.evaluate(() => window.advanceRelease());
  return {page, state, async check(release){state.release = release; await page.evaluate(() => window.advanceRelease());}};
}

test('same build stays quiet; a later build includes expandable release notes', async t => {
  const {page, state, check} = await setup(t);
  assert.equal(await page.locator('#releaseBanner').isVisible(), false);
  await check(next);
  assert.equal(await page.locator('#releaseBanner').isVisible(), true);
  assert.equal(await page.locator('#releaseTitle').innerText(), next.latest.title);
  await page.locator('#releaseTitle').click();
  assert.equal(await page.locator('#releaseSummary').innerText(), next.latest.summary);
  assert.equal(state.navigations, 1, 'updates never reload automatically');
  // A repeated check does not collapse the notes being read.
  await check(next);
  assert.equal(await page.locator('#releaseDetails').getAttribute('open'), '');
  await check(loaded);
  assert.equal(await page.locator('#releaseBanner').isVisible(), false);
});

for (const blockStorage of [false, true]) test(`dismissal suppresses only that version (storage blocked: ${blockStorage})`, async t => {
  const {page, check} = await setup(t, {initial:next, blockStorage});
  assert.equal(await page.locator('#releaseBanner').isVisible(), true, 'first check compares against the embedded build');
  await page.getByRole('button', {name:'Dismiss this update'}).click();
  await check(next);
  assert.equal(await page.locator('#releaseBanner').isVisible(), false);
  if (!blockStorage) {
    await page.reload();
    await page.evaluate(() => window.advanceRelease());
    assert.equal(await page.locator('#releaseBanner').isVisible(), false);
  }
  await check({...next, version:'bbbbbbbbbb'});
  assert.equal(await page.locator('#releaseBanner').isVisible(), true);
});

test('unchanged or missing notes use a generic banner; invalid manifests and outages are quiet', async t => {
  const {page, state, check} = await setup(t);
  for (const latest of [loaded.latest, null]) {
    await check({...next, latest});
    assert.equal(await page.locator('#releaseDetails').isVisible(), false);
    await check(loaded);
  }
  for (const release of [null, {}, {version:42}, {version:'oops'}]) {
    await check(release);
    assert.equal(await page.locator('#releaseBanner').isVisible(), false);
  }
  state.fail = true;
  await check(next);
  assert.equal(await page.locator('#releaseBanner').isVisible(), false);
  state.fail = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.locator('#releaseBanner').waitFor({state:'visible'});
});

test('reload gets the new shell while retaining the page hash and saved browser state', async t => {
  const {page, state, check} = await setup(t);
  await check(next);
  state.html = html.replace(`window.LEDGER_RELEASE = ${JSON.stringify(loaded)}`, `window.LEDGER_RELEASE = ${JSON.stringify(next)}`);
  await page.evaluate(() => localStorage.setItem('ledger_history', 'remembered history'));
  await Promise.all([page.waitForEvent('load'), page.locator('#releaseReload').click()]);
  await page.evaluate(() => window.advanceRelease());
  assert.equal(state.navigations, 2);
  assert.equal(new URL(page.url()).hash, '#supply');
  assert.equal(await page.evaluate(() => localStorage.getItem('ledger_history')), 'remembered history');
  assert.equal(await page.locator('#releaseBanner').isVisible(), false);
});

for (const width of [390, 1280]) test(`banner fits landing and dashboard at ${width}px in both themes`, async t => {
  const {page, check} = await setup(t, {width});
  await check({...next, latest:{...next.latest, title:'<img src=x onerror=alert(1)> A longer changelog title to wrap on a phone'}});
  assert.equal(await page.locator('#releaseTitle img').count(), 0);
  for (const theme of ['light', 'dark']) for (const board of [false, true]) {
    await page.evaluate(({theme, board}) => {
      document.documentElement.dataset.theme = theme;
      document.body.classList.toggle('has-board', board);
    }, {theme, board});
    const box = await page.locator('#releaseBanner').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width);
    for (const id of ['releaseTitle', 'releaseReload', 'releaseDismiss']) {
      const control = await page.locator('#' + id).boundingBox();
      assert.ok(control.x >= 0 && control.x + control.width <= width);
    }
    await page.locator('#releaseTitle').click();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    if (board) {
      await page.evaluate(() => scrollTo(0, 400));
      const banner = await page.locator('#releaseBanner').boundingBox();
      const mast = await page.locator('.mast').boundingBox();
      assert.ok(mast.y >= banner.y + banner.height - 1, 'sticky masthead clears the banner');
      await page.evaluate(() => scrollTo(0, 0));
    }
  }
  if (process.env.UPDATE_SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.UPDATE_SCREENSHOT_DIR, `update-${width}.png`)});
});

test('a different entry of the same date announces itself, even with a lower PR number', async t => {
  const {page, check} = await setup(t);
  const sameDay = {...loaded.latest, pr:loaded.latest.pr - 1, title:'Released the same day', summary:'Merged earlier, announced later.'};
  await check({...next, latest:sameDay});
  assert.equal(await page.locator('#releaseDetails').isVisible(), true);
  assert.equal(await page.locator('#releaseTitle').innerText(), sameDay.title);
});
