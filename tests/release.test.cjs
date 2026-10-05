// Exercise the actual generated page, or RELEASE_URL after deployment.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {en} = require('./_i18n.cjs');
const path = require('node:path');
const {chromium} = require('playwright');

test('the deployed page opens the map and wiki and remembers dismissed badges', async () => {
  const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.setDefaultTimeout(0);
    page.setDefaultNavigationTimeout(0);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = process.env.RELEASE_URL || 'http://release.test/';
    if(!process.env.RELEASE_URL) {
      const files = new Set(['/index.html','/app.js','/worker.js','/community.js','/community.css','/maps/locations.json','/maps/map-background.svg','/wiki-data.json']);
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if(url.hostname === 'release.test' && url.pathname === '/api/community/features') return route.fulfill({contentType:'application/json',body:JSON.stringify({features:[]})});
        const name = url.pathname === '/' ? '/index.html' : url.pathname;
        if(url.hostname !== 'release.test' || !files.has(name)) return route.abort();
        return route.fulfill({path:path.join(__dirname,'../web',name)});
      });
    }
    await page.goto(base);
    assert.equal(await page.locator('#linkBtn').isVisible(), true);
    // A dismissal must start with a badge that was actually shown.
    assert.equal(await page.locator('#linkBtn [data-new-feature="game-link"]').isVisible(), true);
    // Linking reaches no game here; using the entry point is what counts.
    await page.locator('#linkBtn').click();
    assert.equal(await page.locator('[data-new-feature="game-link"]:not([hidden])').count(),0);
    await page.locator('#landing [data-community-open]').click();
    assert.equal(await page.locator('.community-dialog').evaluate(d => d.open),true);
    assert.equal(await page.locator('[data-community-open] [data-new-feature="feature-requests"]:not([hidden])').count(),2);
    await page.locator('.community-dialog summary').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-new-feature="feature-requests"]')].every(el=>el.hidden));
    await page.keyboard.press('Escape');
    await page.locator('#landing [data-changelog]').click();
    assert.equal(await page.locator('#changelogDialog').evaluate(d => d.open),true);
    assert.equal(await page.locator('[data-new-feature="changelog"]:not([hidden])').count(),0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      document.body.classList.add('has-board');
      D = {meta:{character:'release-fixture',day:1},businesses:[],homes:[],alerts:[],minor:{rows:[]}};
    });
    require('./_payload_contract.cjs').assertPayloadShape(await page.evaluate(() => D), 'release');
    // Opening the search palette is the search's visit.
    await page.evaluate(() => { ssOpen(); ssClose(); });
    assert.equal(await page.locator('[data-new-feature="board-search"]:not([hidden])').count(),0);
    // Opening Plan a factory is the factory flow's visit (its route's after()).
    await page.evaluate(() => featureDiscovery.visit("factory-flow"));
    assert.equal(await page.locator('[data-new-feature="factory-flow"]:not([hidden])').count(),0);
    await page.locator('#navRefs a[data-id="map"]').click();
    await page.evaluate(() => cityMapPage.ready);
    assert.equal(await page.locator('#cityMapPage .lay[data-l="home"]').count(),1);
    // The plain map has no side panel: the list belongs to Find a location.
    assert.equal(await page.locator('#cityMapPage .places').count(),1);
    assert.equal(await page.locator('#cityMapPage .places').isVisible(),false);
    assert.equal(await page.locator('[data-new-feature="map"]:not([hidden])').count(),0);
    await page.locator('#navRefs a[data-id="wiki"]').click();
    await page.getByRole('searchbox', {name: en('wiki.search.aria')}).waitFor();
    assert.equal(await page.locator('[data-new-feature="wiki"]:not([hidden])').count(),0);
    await page.evaluate(() => {
      D.businesses = [{name:'Release Gifts',typeSlug:'ba:businesstype_giftshop',status:'retail',
        neighbourhood:'ba:neighborhood_midtown',lines:[{slug:'ba:itemname_cheapgift',configuredPrice:30.27}]}];
      D.market = {rows:[{slug:'ba:itemname_cheapgift',cells:[{hood:'ba:neighborhood_midtown',marketPrice:25.63}]}]};
      window.BigCopilotWiki.route('wiki/businesstypes-giftshop');
    });
    await page.getByRole('heading', {name:en("wiki.prices.title"),exact:true}).waitFor();
    const prices = await page.locator('.wk-prices').first().textContent();
    assert.match(prices, /Release Gifts: \$30\.27/);
    assert.match(prices, /\$25\.63/);
    // The new topic carries its own badges; meeting it dismisses them like the rest.
    await page.evaluate(() => window.BigCopilotWiki.route('wiki/topic%2Fhow-rent-works'));
    await page.getByRole('heading', {name:'How rent works'}).waitFor();
    await page.reload();
    for (const feature of ['game-link', 'community-voting', 'feature-requests', 'board-search', 'factory-flow',
      'map', 'wiki', 'changelog', 'wiki-topic-how-rent-works']) {
      assert.equal(await page.locator(`[data-new-feature="${feature}"]:not([hidden])`).count(), 0);
    }
    assert.deepEqual(errors,[]);
  } finally {
    await browser.close();
  }
});
