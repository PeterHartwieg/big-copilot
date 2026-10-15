// The page's landmarks and its one h1 (issue #355): the board's page column is
// its <main>, the sidebar and the footer stay outside it, and an h1 a screen
// reader finds names the place on screen as the lit tabs do. The board is the
// CLI page rendered from the synthetic day-47 payload snapshot
// (tests/fixtures/payload_snapshot/, never a real save); the landing's markup
// is read from the built web page. Install Playwright and its Chromium browser
// to run; NODE_PATH may point at an existing installation.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {en} = require('./_i18n.cjs');
const fs = require('node:fs');
const path = require('node:path');
const {suiteBrowser, renderBoard, openPage, ROOT} = require('./_page.cjs');

const browser = suiteBrowser();

async function board(t, hash) {
  const html = renderBoard('tests/fixtures/payload_snapshot/data_day47_history.json');
  const {page} = await openPage(t, await browser(), {html, url: 'https://lm.test/', hash, reducedMotion: 'reduce'});
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  return page;
}
const h1s = page => page.getByRole('heading', {level: 1}).allInnerTexts();

test('the page column is the one main landmark; the sidebar and the footer are outside it', async t => {
  const page = await board(t, '#overview');
  assert.equal(await page.getByRole('main').count(), 1);
  const where = await page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      pages: [...document.querySelectorAll('.page')].every(p => main.contains(p)),
      nav: main.contains(document.getElementById('mast')),
      foot: !!document.querySelector('.sitefoot') && main.contains(document.querySelector('.sitefoot')),
      phone: main.contains(document.getElementById('phoneNav')),
    };
  });
  assert.deepEqual(where, {pages: true, nav: false, foot: false, phone: false});
});

test('one h1, inside main, names the place on screen and follows the route', async t => {
  const page = await board(t, '#overview');
  assert.deepEqual(await h1s(page), [en('nav.area.overview')]);
  assert.equal(await page.locator('main h1#pageTitle').count(), 1);
  // Out of sight: the lit tabs already show it, and the layout does not move.
  const box = await page.locator('#pageTitle').boundingBox();
  assert.ok(box.width <= 1 && box.height <= 1, JSON.stringify(box));
  await page.evaluate(() => { location.hash = '#supply/imports'; });
  await page.waitForFunction(was => document.getElementById('pageTitle').textContent !== was, en('nav.area.overview'));
  assert.deepEqual(await h1s(page), [en('nav.path', {area: en('nav.area.supply'), view: await page.evaluate(() => routeViewLabel('supply/imports'))})]);
});

test('the web landing is the main landmark until the board shows, its wordmark the h1', () => {
  const web = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');
  assert.match(web, /<section class="landing" id="landing" role="main">/);
  assert.match(web, /<span class="wordmark" role="heading" aria-level="1">Big Copilot<\/span>/);
});
