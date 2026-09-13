// Exercise the actual generated page, or RELEASE_URL after deployment.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');

test('release preserves the redesigned map, interactive ball and dismissible badges', async () => {
  const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.setDefaultTimeout(0);
    page.setDefaultNavigationTimeout(0);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = process.env.RELEASE_URL || 'http://release.test/';
    if(!process.env.RELEASE_URL) {
      const files = new Set(['/index.html','/app.js','/worker.js','/maps/locations.json','/maps/map-background.svg']);
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        const name = url.pathname === '/' ? '/index.html' : url.pathname;
        if(url.hostname !== 'release.test' || !files.has(name)) return route.abort();
        return route.fulfill({path:path.join(__dirname,'../web',name)});
      });
    }
    await page.goto(base);
    assert.equal(await page.locator('[data-new-feature]:not([hidden])').count(),3);
    await page.locator('#landing [data-changelog]').click();
    assert.equal(await page.locator('#changelogDialog').evaluate(d => d.open),true);
    assert.equal(await page.locator('[data-new-feature="changelog"]:not([hidden])').count(),0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      document.body.classList.add('has-board');
      D = {meta:{character:'release-fixture',day:1},businesses:[],homes:[],alerts:[],minor:{rows:[]}};
    });
    await page.locator('#nav a[data-id="map"]').click();
    await page.evaluate(() => cityMapPage.ready);
    assert.equal(await page.locator('#cityMapPage .lay').count(),5);
    assert.equal(await page.locator('#cityMapPage .lay[data-l="home"]').count(),1);
    assert.equal(await page.locator('#cityMapPage .places').count(),1);
    assert.equal(await page.locator('#cityMapPage .layer .ball').count(),1);
    assert.equal(await page.locator('[data-new-feature="map"]:not([hidden])').count(),0);
    await page.locator('#cityMapPage .layer .ball').click();
    await page.waitForFunction(() => document.querySelectorAll('body > .coin').length > 0);
    await page.reload();
    assert.equal(await page.locator('[data-new-feature]:not([hidden])').count(),0);
    assert.deepEqual(errors,[]);
  } finally {
    await browser.close();
  }
});
