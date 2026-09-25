// The one-time news strip under the update banner (NEWS in web/update.js).
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
  await page.addInitScript(blockStorage => {
    window.Worker = class {postMessage(){} terminate(){}};
    if (blockStorage) Object.defineProperty(window, 'localStorage', {get(){throw Error('Blocked');}});
  }, !!options.blockStorage);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'news.test') return route.abort();
    if (url.pathname === '/') return route.fulfill({contentType:'text/html', body:html});
    if (url.pathname === '/app.js') return route.fulfill({contentType:'text/javascript', body:fs.readFileSync(path.join(web, 'app.js'), 'utf8')});
    if (url.pathname === '/version.json') return route.fulfill({contentType:'application/json', body:JSON.stringify(options.release || loaded)});
    return route.abort();
  });
  await page.goto('https://news.test/');
  return page;
}

test('the strip shows on first load with its text, Workshop link and named Dismiss', async t => {
  const page = await setup(t);
  const strip = page.getByRole('complementary', {name:'News'});
  assert.equal(await strip.isVisible(), true);
  assert.match(await strip.innerText(), /Big Copilot Link 0\.2\.0 lets the board make changes in your game/);
  const link = page.getByRole('link', {name:'Get the mod on the Steam Workshop'});
  assert.equal(await link.getAttribute('href'), 'https://steamcommunity.com/sharedfiles/filedetails/?id=3806322395');
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.match(await link.getAttribute('rel'), /noopener/);
  assert.equal(await page.getByRole('button', {name:'Dismiss this news'}).isVisible(), true);
});

test('Dismiss hides the strip and it stays hidden after reload; a new id shows again', async t => {
  const page = await setup(t);
  await page.getByRole('button', {name:'Dismiss this news'}).click();
  assert.equal(await page.locator('#newsStrip').isVisible(), false);
  await page.reload();
  assert.equal(await page.locator('#newsStrip').isVisible(), false);
  await page.evaluate(() => localStorage.setItem('bc_news_dismissed', 'an-older-announcement'));
  await page.reload();
  assert.equal(await page.locator('#newsStrip').isVisible(), true);
});

test('with storage blocked the strip still dismisses for the page', async t => {
  const page = await setup(t, {blockStorage:true});
  assert.equal(await page.locator('#newsStrip').isVisible(), true);
  await page.getByRole('button', {name:'Dismiss this news'}).click();
  assert.equal(await page.locator('#newsStrip').isVisible(), false);
});

for (const width of [390, 1280]) test(`strip and update banner stack without overlap at ${width}px in both themes`, async t => {
  const page = await setup(t, {width, release:next});
  await page.locator('#releaseBanner').waitFor({state:'visible'});
  for (const theme of ['light', 'dark']) for (const board of [false, true]) {
    await page.evaluate(({theme, board}) => {
      document.documentElement.dataset.theme = theme;
      document.body.classList.toggle('has-board', board);
      scrollTo(0, 0);
    }, {theme, board});
    const release = await page.locator('#releaseBanner').boundingBox();
    const news = await page.locator('#newsStrip').boundingBox();
    assert.ok(news.y >= release.y + release.height - 0.5, 'the strip sits below the update banner');
    assert.ok(news.x >= 0 && news.x + news.width <= width);
    for (const sel of ['#newsLink', '#newsDismiss']) {
      const box = await page.locator(sel).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, sel + ' fits the width');
      assert.ok(box.y >= news.y && box.y + box.height <= news.y + news.height + 0.5, sel + ' stays inside the strip');
    }
    const next = await page.locator(board ? '.mast' : '#landing').boundingBox();
    assert.ok(next.y >= news.y + news.height - 0.5, 'the page starts below the strip');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.getBoundingClientRect().width), true, 'no sideways scroll');
  }
});

test('landing screenshots with the strip', {skip:!process.env.NEWS_SCREENSHOT_DIR}, async t => {
  for (const width of [390, 1280]) {
    const page = await setup(t, {width});
    await page.locator('#newsStrip').waitFor({state:'visible'});
    await page.screenshot({path:path.join(process.env.NEWS_SCREENSHOT_DIR, `news-${width}.png`)});
  }
});
