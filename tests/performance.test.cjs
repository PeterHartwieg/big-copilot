const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8');
let browser, html;
before(async () => {
  const rendered = spawnSync(process.env.PYTHON || 'python', ['-c',
    'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
  {cwd:root, maxBuffer:4*1024*1024});
  assert.equal(rendered.status, 0, rendered.stderr.toString());
  html = rendered.stdout.toString();
  browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

async function fixture(t, landing = false, reducedMotion = 'no-preference', width = 1600) {
  const context = await browser.newContext({viewport:{width, height:1000}, reducedMotion});
  t.after(() => context.close());
  await context.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.animationCalls = 0;
    window.requestAnimationFrame = callback => raf(t => { animationCalls++; callback(t); });
    window.Worker = class { postMessage(){} terminate(){} };
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'performance.test') return route.abort();
    const content = url.pathname === '/' ? (landing ? fs.readFileSync(path.join(root, 'web/index.html'), 'utf8') : html)
      : url.pathname === '/app.js' ? app : '';
    return route.fulfill({contentType:url.pathname === '/' ? 'text/html' : 'application/javascript', body:content});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto('http://performance.test/');
  if (!landing) await page.evaluate(() => { $('title').textContent = 'Test company'; wireSphere(); });
  return page;
}

async function idleFrames(page) {
  // Observe a fixed interval after the entrance/easing has finished.
  await page.waitForTimeout(3500);
  const before = await page.evaluate(() => animationCalls);
  await page.waitForTimeout(300);
  return (await page.evaluate(() => animationCalls)) - before;
}

for (const landing of [false, true]) {
  for (const motion of ['no-preference', 'reduce']) {
    test(`${landing ? 'landing' : 'dashboard'} animation sleeps at rest (${motion})`, async t => {
      const page = await fixture(t, landing, motion);
      assert.equal(await idleFrames(page), 0, 'settled decoration must not keep requesting frames');
      if (motion === 'reduce') return;
      const orb = page.locator(landing ? '#lgOrb' : '#orb');
      const transform = await orb.evaluate(el => el.style.transform);
      await page.mouse.move(120, 260);
      await page.waitForTimeout(400);
      assert.notEqual(await orb.evaluate(el => el.style.transform), transform, 'pointer movement wakes the ball');
      assert.equal(await idleFrames(page), 0, 'pointer easing goes back to sleep');
    });
  }
}

test('dashboard motion wakes for new balls and scrolling, and pauses while hidden', async t => {
  const page = await fixture(t);
  assert.equal(await idleFrames(page), 0);
  await page.locator('.wordmark').click();
  assert.equal(await page.locator('.mast .orb').count(), 2);
  assert.equal(await idleFrames(page), 0, 'a new ball settles');
  const before = await page.locator('#orb').evaluate(el => el.style.transform);
  await page.evaluate(() => {
    document.body.style.minHeight = '3000px';
    window.scrollTo(0, 100);
  });
  await page.waitForTimeout(200);
  assert.notEqual(await page.locator('#orb').evaluate(el => el.style.transform), before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable:true, value:true});
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new MouseEvent('mousemove', {clientX:100, clientY:300}));
  });
  const hiddenFrames = await page.evaluate(() => animationCalls);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => animationCalls), hiddenFrames);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await idleFrames(page), 0, 'returning to the tab settles again');
});

test('folder timer and visibility wake cannot overlap an unfinished scan', async () => {
  const source = app.slice(app.indexOf('  async function checkFolder()'), app.indexOf('  function armWatch()'));
  let release, scans = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const context = vm.createContext({
    document:{hidden:false}, dirHandle:{async queryPermission(){return 'granted';}},
    busy:false, attempt:null, readerError:null, watchChecking:false, sourceGen:0,
    async scanHandle(){scans++; await gate; return [];},
    async refreshSaveMenu(){return '';}, chooseFrom(){return {};},
    stopWatch(){}, syncWatchBtn(){}, lastCheck:null,
  });
  vm.runInContext(source, context);
  const first = context.checkFolder();
  await new Promise(resolve => setImmediate(resolve));
  const second = context.checkFolder();
  await new Promise(resolve => setImmediate(resolve));
  release();
  await Promise.all([first, second]);
  assert.equal(scans, 1, 'only one directory scan in flight');
  await context.checkFolder();
  assert.equal(scans, 2, 'the next check still works');
  context.document.hidden = true;
  await context.checkFolder();
  assert.equal(scans, 2, 'hidden tabs defer automatic save work');
  context.document.hidden = false;
  context.scanHandle = async () => { throw new Error('Folder temporarily unavailable'); };
  await context.checkFolder();
  context.scanHandle = async () => { scans++; return []; };
  await context.checkFolder();
  assert.equal(scans, 3, 'a failed scan releases its lock');
});
