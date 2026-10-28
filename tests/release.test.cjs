// Exercise the actual generated page, or RELEASE_URL after deployment.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {en} = require('./_i18n.cjs');
const path = require('node:path');
const {launch, collectErrors} = require('./_page.cjs');

// The page sets no action timeout (Pyodide can load slowly), so a wait on
// content that a site older or newer than this checkout never draws gets one.
const CONTENT_WAIT_MS = 30000;

test('the deployed page opens the map and wiki and remembers dismissed badges', async () => {
  // launch() alone: openPage() shuts out https, which RELEASE_URL needs, and
  // serveWeb() would serve all of web/ where this route allows only the page's files.
  const browser = await launch();
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.setDefaultTimeout(0);
    page.setDefaultNavigationTimeout(0);
    const errors = collectErrors(page);
    const base = process.env.RELEASE_URL || 'http://release.test/';
    if(!process.env.RELEASE_URL) {
      const files = new Set(['/index.html','/app.js','/worker.js','/community.js','/community.css','/maps/locations.json','/maps/map-background.svg','/wiki-data.min.json','/changelog.json']);
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if(url.hostname === 'release.test' && url.pathname === '/api/community/features') return route.fulfill({contentType:'application/json',body:JSON.stringify({features:[]})});
        const name = url.pathname === '/' ? '/index.html' : url.pathname;
        if(url.hostname !== 'release.test' || !(files.has(name) || /^\/assets\/(?:board-[a-f0-9]{64}\.(?:js|css)|[a-f0-9]{64}\/worker\.js)$/.test(name))) return route.abort();
        return route.fulfill({path:path.join(__dirname,'../web',name)});
      });
    }
    await page.goto(base);
    // Badges retire 45 days after their feature shipped, counted to the newest
    // changelog entry; pin that day inside every window checked here so the
    // test does not age as the changelog grows.
    await page.evaluate(() => featureDiscovery.asOf('2026-10-05'));
    assert.equal(await page.locator('#linkBtn').isVisible(), true);
    // A dismissal must start with a badge that was actually shown.
    assert.equal(await page.locator('#linkBtn [data-new-feature="game-link"]').isVisible(), true);
    // Linking reaches no game here; using the entry point is what counts.
    await page.locator('#linkBtn').click();
    assert.equal(await page.locator('[data-new-feature="game-link"]:not([hidden])').count(),0);
    await page.locator('#landing [data-community-open]').click();
    assert.equal(await page.locator('.community-dialog').evaluate(d => d.open),true);
    assert.equal(await page.locator('[data-vote-card] [data-new-feature="feature-requests"]:not([hidden])').count(),2);
    await page.locator('.community-dialog summary').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-new-feature="feature-requests"]')].every(el=>el.hidden));
    await page.keyboard.press('Escape');
    // The page ships the newest entry; opening the dialog fetches the rest (issue #328).
    assert.equal(await page.locator('#changelogDialog .changelog-entry').count(),1);
    const shipped = await page.locator('#changelogDialog .changelog-entry').evaluate(li => [li.textContent, li.querySelector('a').outerHTML]);
    await page.locator('#landing [data-changelog]').click();
    assert.equal(await page.locator('#changelogDialog').evaluate(d => d.open),true);
    const changes = require('../web/changelog.json');
    await page.waitForFunction(n => document.querySelectorAll('#changelogDialog .changelog-entry').length === n, changes.length, {timeout:CONTENT_WAIT_MS})
      .catch(error => { if(error.name !== 'TimeoutError') throw error; });
    const drawn = await page.locator('#changelogDialog .changelog-entry').count();
    // Locally the page and this require read the same file, so a mismatch is
    // the page's own fault; only against RELEASE_URL can the two differ.
    const why = !process.env.RELEASE_URL
      ? 'the local page drew the wrong count (a render, route or fetch bug)'
      : drawn < changes.length
        ? `the site at ${base} is older than this checkout (deploy first, or run without RELEASE_URL)`
        : `this checkout is older than the site at ${base} (update the checkout, or run without RELEASE_URL)`;
    // A failed fetch leaves only the shipped entry.
    const fetchFailed = drawn === 1 && changes.length > 1 ? ', or the changelog fetch failed' : '';
    assert.equal(drawn, changes.length, `changelog shows ${drawn} entries but this checkout has ${changes.length}: ${why}${fetchFailed}`);
    const first = await page.locator('#changelogDialog .changelog-entry').first();
    const newest = [...changes].sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : b.pr - a.pr)[0];
    assert.equal(await first.locator('time').getAttribute('datetime'), newest.date);
    assert.equal(await first.locator('h3').textContent(), newest.title);
    // The fetched entries are drawn as render() writes them.
    assert.deepEqual(await first.evaluate(li => [li.textContent, li.querySelector('a').outerHTML]), shipped);
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
    await page.getByRole('searchbox', {name: en('wiki.search.aria')}).waitFor({timeout:CONTENT_WAIT_MS});
    assert.equal(await page.locator('[data-new-feature="wiki"]:not([hidden])').count(),0);
    await page.evaluate(() => {
      D.businesses = [{name:'Release Gifts',typeSlug:'ba:businesstype_giftshop',status:'retail',
        neighbourhood:'ba:neighborhood_midtown',lines:[{slug:'ba:itemname_cheapgift',configuredPrice:30.27}]}];
      D.market = {rows:[{slug:'ba:itemname_cheapgift',cells:[{hood:'ba:neighborhood_midtown',marketPrice:25.63}]}]};
      window.BigCopilotWiki.route('wiki/businesstypes-giftshop');
    });
    await page.getByRole('heading', {name:en("wiki.prices.title"),exact:true}).waitFor({timeout:CONTENT_WAIT_MS});
    const prices = await page.locator('.wk-prices').first().textContent();
    assert.match(prices, /Release Gifts: \$30\.27/);
    assert.match(prices, /\$25\.63/);
    // The new topic carries its own badges; meeting it dismisses them like the rest.
    await page.evaluate(() => window.BigCopilotWiki.route('wiki/topic%2Fhow-rent-works'));
    await page.getByRole('heading', {name:'How rent works'}).waitFor({timeout:CONTENT_WAIT_MS});
    await page.reload();
    // A reload drops the pinned day: pin it again before counting. A badge can
    // also be hidden by age, so the visit itself is checked in storage too.
    await page.evaluate(() => featureDiscovery.asOf('2026-10-05'));
    for (const feature of ['game-link', 'community-voting', 'feature-requests', 'board-search', 'factory-flow',
      'map', 'wiki', 'changelog', 'wiki-topic-how-rent-works']) {
      assert.equal(await page.evaluate(id => localStorage.getItem('ba_dash_feature_seen:' + id), feature), '1', `${feature} visit remembered`);
      assert.equal(await page.locator(`[data-new-feature="${feature}"]:not([hidden])`).count(), 0);
    }
    assert.deepEqual(errors,[]);
  } finally {
    await browser.close();
  }
});
