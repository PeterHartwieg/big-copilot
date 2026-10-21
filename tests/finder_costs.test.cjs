/* The two purchases share an address, never a price: synthetic listings and
   businesses overlap here, including unknown, zero and stale valuations. */
const {test} = require('node:test');
const H = require('./_finder.cjs');
const {UI_LANGS} = require('./_i18n.cjs');
const {assert, en, fs, path, root, HK, MT, PREMISES, fixture, openMap, turnOn, rowKeys} = H;
const listing = (key, price) => ({...PREMISES.buildings.find(b => b.key === key), price, payback:1000});
const combined = () => ({...PREMISES, forSale:[...PREMISES.forSale, listing(HK[1], 1250000), listing(HK[2], 0)]});
const mode = (page, show) => page.locator(`#cityMapPage [data-show="${show}"]`).click();
const sort = (page, key) => page.locator(`#cityMapPage .fhead [data-s="${key}"]`).click();
const row = (page, key) => page.locator(`#cityMapPage .place[data-pick="${key}"]`);

test('takeover rows join building prices by address and refresh missing listings without turning them into zero', async () => {
  const {page, errors} = await fixture(null, {premises:combined()});
  try{
    await openMap(page); await turnOn(page); await mode(page, 'takeover');
    assert.deepEqual(await row(page, HK[1]).locator('.fr-takeover-price, .fr-building-price').allTextContents(), ['$375k', '$1.25M']);
    assert.deepEqual(await row(page, HK[2]).locator('.fr-takeover-price, .fr-building-price').allTextContents(), ['$125k', '$0']);
    await sort(page, 'buildingPrice');
    assert.deepEqual(await rowKeys(page), [HK[2], HK[1]]);
    await H.pick(page, HK[1]);
    assert.equal(await page.locator('#cityMapPage .fr-building-fact b').textContent(), '$1,250,000');
    await page.locator('#cityMapPage .fr-building-fact').focus();
    assert.equal(await page.locator('#tip').textContent(), en('map.buildingPrice.listed'));
    await page.evaluate(key => {
      D.premises.forSale = D.premises.forSale.filter(s => s.key !== key);
      refreshCityMaps();
    }, HK[2]);
    assert.deepEqual(await rowKeys(page), [HK[1], HK[2]]);
    assert.equal(await row(page, HK[2]).locator('.fr-building-price').textContent(), '—');
    assert.equal(await row(page, HK[2]).locator('.fr-building-price').getAttribute('data-tip'), en('map.buildingPrice.unlisted'));
    await H.pick(page, HK[2]);
    assert.equal(await page.locator('#cityMapPage .fr-building-fact b').textContent(), '—');
    await mode(page, 'rent');
    assert.equal(await page.locator('#cityMapPage .fr-building-price').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('each purchase list saves its own cost sort and restores both columns after reload', async () => {
  const context = await H.browser.newContext(), premises = combined();
  const {page, errors} = await fixture(context, {premises});
  try{
    await openMap(page); await turnOn(page); await mode(page, 'takeover');
    await sort(page, 'buildingPrice'); await H.saveAs(page, 'Building deals');
    await mode(page, 'sale'); await sort(page, 'takeoverPrice');
    assert.deepEqual(await rowKeys(page), [HK[2], HK[1], HK[0], MT[2]]);
    assert.deepEqual(await row(page, HK[1]).locator('.fr-takeover-price, .fr-building-price').allTextContents(), ['$375k', '$1.25M']);
    await H.saveAs(page, 'Business deals');
    assert.match(await page.locator(`${H.saved} [data-saved="Business deals"]`).getAttribute('data-tip'), /estimated takeover price/);
    await mode(page, 'rent');
    await page.locator(`${H.saved} [data-saved="Building deals"]`).click();
    assert.equal(await page.evaluate(() => cityMapPage.fs.sort), 'buildingPrice');
    assert.deepEqual(await rowKeys(page), [HK[2], HK[1]]);
    await page.locator(`${H.saved} [data-saved="Business deals"]`).click();
    const again = await fixture(context, {premises});
    try{
      await openMap(again.page); await turnOn(again.page);
      assert.equal(await again.page.evaluate(() => cityMapPage.fs.saleSort), 'takeoverPrice');
      assert.deepEqual(await rowKeys(again.page), [HK[2], HK[1], HK[0], MT[2]]);
      await mode(again.page, 'takeover');
      assert.equal(await again.page.evaluate(() => cityMapPage.fs.sort), 'buildingPrice');
      assert.deepEqual(await rowKeys(again.page), [HK[2], HK[1]]);
      assert.deepEqual(again.errors, []);
    } finally { await again.page.close(); }
    assert.deepEqual(errors, []);
  } finally { await page.close(); await context.close(); }
});

test('sale takeover sorting keeps zero first and unknown or ineligible businesses last', async () => {
  const premises = combined();
  premises.buildings = premises.buildings.map(b => ({...b, takeoverPrice:b.key === HK[1] ? null : 0}));
  const {page, errors} = await fixture(null, {premises});
  try{
    await openMap(page); await turnOn(page); await mode(page, 'sale'); await sort(page, 'takeoverPrice');
    assert.deepEqual(await rowKeys(page), [HK[2], HK[0], HK[1], MT[2]]);
    assert.deepEqual(await page.locator('#cityMapPage .fr-takeover-price').allTextContents(), ['$0', '—', '—', '—']);
    assert.equal(await row(page, HK[0]).locator('.fr-takeover-price').getAttribute('data-tip'), en('map.takeover.noRival'));
    assert.equal(await row(page, HK[1]).locator('.fr-takeover-price').getAttribute('data-tip'), en('map.takeover.unknown'));
    assert.equal(await row(page, MT[2]).locator('.fr-takeover-price').getAttribute('data-tip'), en('map.takeover.noData'));
    await sort(page, 'takeoverPrice');
    assert.equal(await page.evaluate(() => cityMapPage.fs.saleSort), 'price');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('both cost columns fit together on phones, tablets and desktop in every UI language', async () => {
  const premises = combined();
  premises.buildings = premises.buildings.map(b => ({...b, takeoverPrice:5584228352}));
  premises.forSale = premises.forSale.map(s => ({...s, price:5584228352}));
  const {page, errors} = await fixture(null, {premises});
  try{
    await openMap(page); await turnOn(page);
    // Linux reserves scrollbar space; exercise the same budget on platforms
    // whose scrollbars otherwise overlay the page and the results panel.
    await page.addStyleTag({content:'html, .places {scrollbar-gutter:stable} ::-webkit-scrollbar{width:15px}'});
    // macOS can still overlay the root scrollbar despite its stable gutter.
    // Reserve the same 15px that Linux subtracts from the document viewport.
    await page.evaluate(() => {
      if(document.documentElement.clientWidth === innerWidth) document.documentElement.style.paddingRight = '15px';
    });
    for(const show of ['takeover', 'sale']){
      await mode(page, show);
      await H.pick(page, HK[1]);
      for(const width of [320, 390, 600, 700, 1024, 1440]){
        await page.setViewportSize({width, height:1000});
        for(const lang of UI_LANGS){
          const table = lang === 'en' ? null : JSON.parse(fs.readFileSync(path.join(root, `web/i18n/${lang}.json`)));
          await page.evaluate(({lang, table}) => { ttSetTable(lang, table); cityMapPage.update(); }, {lang, table});
          const costs = row(page, HK[1]).locator('.fr-takeover-price, .fr-building-price');
          const boxes = await costs.evaluateAll(els => els.map(el => {
            const r = el.getBoundingClientRect();
            return {left:r.left, right:r.right, top:r.top, width:r.width, scroll:el.scrollWidth, client:el.clientWidth, screen:innerWidth};
          }));
          assert.equal(boxes.length, 2);
          for(const b of boxes){
            assert.ok(b.width > 0 && b.right <= b.screen && b.scroll <= b.client + 1, `${show}, ${lang}, ${width}: ${JSON.stringify(b)}`);
          }
          assert.equal(boxes[0].top, boxes[1].top, 'prices stay on the same row');
          assert.ok(boxes[0].right <= boxes[1].left, 'price columns do not overlap');
          const headers = page.locator(`#cityMapPage .fhead [data-s="takeoverPrice"], #cityMapPage .fhead [data-s="${show === 'sale' ? 'price' : 'buildingPrice'}"]`);
          assert.equal(await headers.count(), 2);
          assert.ok(await headers.evaluateAll(els => els.every(el => el.getBoundingClientRect().width > 0 && el.scrollWidth <= el.clientWidth + 1)), 'headers fit');
          const addressWidth = (await row(page, HK[1]).locator('.nm').boundingBox()).width;
          assert.ok(addressWidth >= 100, `${show}, ${lang}, ${width}: address remains readable at ${addressWidth}px`);
          if(width <= 600){
            assert.ok(await row(page, HK[1]).evaluate(el => el.classList.contains('on')
              && el.querySelector('.nm').getBoundingClientRect().left >= el.getBoundingClientRect().left + 5), 'selected address clears the accent bar');
          }
        }
      }
    }
    // A warehouse omits one of the ranked columns, but keeps both purchases.
    await page.evaluate(key => {
      D.premises.buildings.find(b => b.key === key).type = 'warehouse';
      cityMapPage.fs.cat = 'warehouse'; cityMapPage.fs.show = 'takeover'; cityMapPage.update();
    }, HK[1]);
    await page.setViewportSize({width:390, height:844});
    assert.equal(await row(page, HK[1]).locator('.fr-building-price').isVisible(), true);
    assert.equal(await row(page, HK[1]).locator('.fr-takeover-price').isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('purchase panels leave map controls and selected building cards accessible, including fullscreen', async () => {
  const {page, errors} = await fixture(null, {premises:combined()});
  try{
    await openMap(page); await turnOn(page);
    for(const show of ['takeover', 'sale']){
      await mode(page, show);
      for(const fullscreen of [false, true]){
        if(fullscreen){
          await page.locator('#cityMapPage [data-action="full"]').click();
          await page.waitForFunction(() => !!document.fullscreenElement);
        }
        await H.pick(page, HK[1]);
        const bounds = await page.evaluate(() => {
          const root = document.querySelector('#cityMapPage');
          const panel = root.querySelector('.places').getBoundingClientRect();
          const card = root.querySelector('.site').getBoundingClientRect();
          const zoom = root.querySelector('.zoomer').getBoundingClientRect();
          return {panelLeft:panel.left, cardRight:card.right, zoomRight:zoom.right,
            freeRight:cityMapPage.stageRect().left + cityMapPage.freeWidth()};
        });
        assert.ok(bounds.cardRight < bounds.panelLeft, JSON.stringify(bounds));
        assert.ok(bounds.zoomRight < bounds.panelLeft, JSON.stringify(bounds));
        assert.ok(Math.abs(bounds.freeRight - bounds.panelLeft) < 1, JSON.stringify(bounds));
        await page.locator('#cityMapPage [data-action="in"]').click();
        await page.locator('#cityMapPage [data-action="close"]').click();
        if(fullscreen){ await page.evaluate(() => document.exitFullscreen()); }
      }
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
