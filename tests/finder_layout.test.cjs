/* Find a location from a Growth › Demand cell and back, and the Layout filter
   with the card's floor plan. Setup and the synthetic premises payload are
   tests/_finder.cjs. */
const {test} = require('node:test');
const H = require('./_finder.cjs');
const {assert, en, enRe, path, at, HK, MT, CLOTHES, COFFEE, LAW, CINEMA_AT, HK_HOOD, fixture, openMap, chip, turnOn, pick, rowKeys, facts, saved, scrolledFinderToGrowthCell, PLANNED, tags, layChips, layChip, plan} = H;

test('a Growth cell opens its popover, whose Find a location opens the finder on its own type and neighbourhood', async () => {
  const {page, errors} = await fixture();
  try{
    await page.evaluate(() => { showPage('growth'); drawMarket(); wireHeat(); });
    const clothes = page.locator(`#market .cell[data-slug="${CLOTHES}"][data-hood="${HK_HOOD}"]`);
    await clothes.click();
    // The popover names the cell and its facts; with no store rules in the
    // payload it offers the finder alone. Esc closes it, back on the cell.
    const pop = page.locator('#demCellPop');
    assert.equal(await pop.isVisible(), true);
    assert.match(await pop.innerText(), new RegExp("Clothing Store \u00b7 Hell's Kitchen[\\s\\S]*" + [enRe('gr.pop.demand').source, enRe('gr.pop.rivals').source, enRe('map.show.available').source].join('[\\s\\S]*'), 'i'));
    assert.equal(await pop.locator('[data-dem-go="open"]').count(), 0);
    assert.equal(await clothes.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.demGo), 'find');
    await page.keyboard.press('Escape');
    assert.equal(await pop.isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.hood), HK_HOOD);
    await clothes.click();
    await pop.locator('[data-dem-go="find"]').click();
    await page.locator('#cityMapPage .place.fr').first().waitFor();
    // The cell is on a hidden page now, so the keyboard lands on the first result.
    await page.waitForFunction(() => document.activeElement?.matches('#cityMapPage .place.fr'));
    assert.equal(await page.locator('#cityMapPage .fchip.cat.on').textContent(), en('map.kind.retail'));
    assert.equal(await page.locator('#cityMapPage [data-f="type"]').inputValue(), CLOTHES);
    assert.deepEqual(await rowKeys(page), [HK[0]]);   // Midtown is switched off
    // An office row asks for office buildings instead, and the keyboard does
    // what the mouse does.
    await page.evaluate(() => showPage('growth'));
    await page.locator(`#market .cell[data-slug="${LAW}"]`).first().focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');   // the popover's Find a location, which has the focus
    await page.locator('#cityMapPage .place.fr').first().waitFor();
    assert.equal(await page.locator('#cityMapPage .fchip.cat.on').textContent(), en('map.kind.office'));
    assert.deepEqual(await rowKeys(page), [HK[4]]);
    // Nothing is drawn under the grid any more.
    assert.equal(await page.locator('#cellDetail').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
test('a Growth cell opens the finder at the top of its list, however far it was scrolled', async () => {
  await scrolledFinderToGrowthCell(1440, '#cityMapPage .places .list');
});
test('on a narrow map the panel goes back up and the focused first result is in view', async () => {
  await scrolledFinderToGrowthCell(760, '#cityMapPage .places');
});

test('a finder the player left while it loaded never reaches for the focus', async () => {
  const {page, errors} = await fixture();
  try{
    await page.evaluate(() => { showPage('growth'); drawMarket(); wireHeat(); });
    // A hidden page cannot take the focus anyway, so the spy counts the tries.
    await page.evaluate(async () => {
      window.focusTries = 0;
      const focus = HTMLElement.prototype.focus;
      HTMLElement.prototype.focus = function(...args){
        if(this.closest('#cityMapPage')) window.focusTries++;
        return focus.apply(this, args);
      };
      // Leave for Today before the map has loaded, then let it finish.
      document.querySelector('#market .cell[role=button]').click();
      document.querySelector('#demCellPop [data-dem-go="find"]').click();
      showPage('today');
      await cityMapPage.ready;
      await new Promise(r => setTimeout(r, 50));
    });
    assert.equal(await page.evaluate(() => window.focusTries), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a cell with no reading is no button and opens nothing', async () => {
  const {page, errors} = await fixture();
  try{
    await page.evaluate(() => { showPage('growth'); drawMarket(); wireHeat(); });
    // The Law Firm has no reading in Midtown.
    const none = page.locator('#market .cell.none');
    assert.equal(await none.count(), 1);
    assert.equal(await none.getAttribute('role'), null);
    await none.click();
    assert.equal(await page.locator('#pageGrowth').isVisible(), true);
    assert.equal(await page.locator('#cityMapPage .place.fr').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("the finder's demand figure leads back to that type's Growth row", async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage [data-f="type"]').selectOption(CLOTHES);
    await pick(page, HK[0]);
    const back = page.locator('#cityMapPage .site .mf-grow');
    assert.equal((await back.locator('b').textContent()).trim(), '77');
    assert.match(await back.getAttribute('data-tip'), enRe('map.demand.tip', {type: 'Clothing Store'}, {}));
    // From the product views too: the link switches the grid back to By type.
    await page.evaluate(() => showPage('growth'));
    await page.locator('#marketTools a[data-id="mine"]').click();
    assert.equal(await page.locator('#marketTools a.on').textContent(), en('gr.view.mine'));
    await page.evaluate(() => showPage('map'));
    // A live refresh repaints the card and the link keeps the focus.
    await back.focus();
    await page.evaluate(() => refreshCityMaps());
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('mf-grow')), true);
    await back.click();
    assert.equal(await page.locator('#pageGrowth').isVisible(), true);
    assert.equal(await page.evaluate(() => marketView), 'types');
    assert.equal(await page.locator('#marketTools a.on').textContent(), en('gr.view.types'));
    const row = page.locator(`#market .r[data-slug="${CLOTHES}"]`);
    assert.match(await row.getAttribute('class'), /\bmk-arrive\b/);
    const r = await row.getAttribute('data-r');
    const ringed = await page.$$eval(`#market .cell[data-r="${r}"]`, cs => cs.every(c => c.classList.contains('mk-arrive')));
    assert.equal(ringed, true);
    assert.equal(await page.locator('#market .mk-arrive').count(), 3);   // the label and its two cells
    // The keyboard lands on the row's first cell that opens the finder.
    assert.equal(await page.evaluate(() => document.activeElement?.matches('#market .cell[role=button][data-r="0"][data-c="0"]')), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a row the demand figure leads back to clears whatever stays at the top of the window', async () => {
  const {page, errors} = await fixture();
  try{
    await page.setViewportSize({width: 1440, height: 500});
    await page.evaluate(() => { document.body.style.paddingBottom = '3000px'; });   // room to scroll the row up
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.cat[data-cat="office"]').click();
    await pick(page, HK[4]);
    await page.locator('#cityMapPage .site .mf-grow').click();
    // The Law Firm is the second row, so the page has to scroll to it.
    const row = page.locator(`#market .r[data-slug="${LAW}"]`);
    assert.equal(await row.getAttribute('data-r'), '1');
    // settleScroll keeps the row in place for a few frames: wait for the page
    // to have scrolled and then held still for three frames in a row.
    await page.evaluate(() => { window.pageRest = null; });
    await page.waitForFunction(sel => {
      const now = `${scrollY} ${Math.round(document.querySelector(sel).getBoundingClientRect().top)}`, mark = window.pageRest;
      window.pageRest = {now, frames: mark && mark.now === now ? mark.frames + 1 : 0};
      return scrollY > 0 && window.pageRest.frames >= 3;
    }, `#market .r[data-slug="${LAW}"]`, {polling: 'raf'});
    const [top, mast] = await page.evaluate(sel => [document.querySelector(sel).getBoundingClientRect().top,
      nxTopLine()], `#market .r[data-slug="${LAW}"]`);
    assert.ok(top >= mast, `row top ${top} is under the top line (${mast})`);
    assert.ok(await page.evaluate(() => scrollY) > 0, 'the page scrolled');
    // The focus follows, to the office row's cell that opens the finder.
    assert.equal(await page.evaluate(() => document.activeElement?.matches('#market .cell[role=button][data-r="1"]')), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the Layout filter offers the kind\'s layout keys and lists by them', async () => {
  const {page, errors} = await fixture(null, {premises: PLANNED});
  try{
    await openMap(page); await turnOn(page);
    // The list reads [HK0 C1, MT0 D2, MT1 with no layout]: a row with no layout has no tag.
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    assert.deepEqual(await tags(page), ['C1', 'D2', '']);
    // Every retail layout the city's buildings have, none lit: no filter.
    assert.deepEqual(await layChips(page), ['C1', 'C2', 'D2']);
    await page.locator(layChip('C1')).click();
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    assert.deepEqual(await layChips(page), ['C1*', 'C2', 'D2']);
    // Several at once, and with the other filters.
    await page.locator(layChip('D2')).click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0]]);
    await page.locator(`#cityMapPage .fchip.hd[data-h="${HK_HOOD}"]`).click();
    assert.deepEqual(await rowKeys(page), [MT[0]]);
    await page.locator(`#cityMapPage .fchip.hd[data-h="${HK_HOOD}"]`).click();
    await page.locator(layChip('C1')).click(); await page.locator(layChip('D2')).click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    // A layout belongs to its kind: another kind starts with none lit. Here
    // the offices have one layout only, which is nothing to choose between.
    await page.locator(layChip('C1')).click();
    await page.locator('#cityMapPage .fchip.cat[data-cat="office"]').click();
    assert.equal(await page.locator('#cityMapPage .frow.flayout').isVisible(), false);
    assert.deepEqual(await rowKeys(page), [HK[4]]);
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    assert.deepEqual(await layChips(page), ['C1', 'C2', 'D2']);
    // Theatre layouts can now be filtered just like shop layouts (issue #244).
    await page.locator('#cityMapPage .fchip.cat[data-cat="theater"]').click();
    assert.deepEqual(await layChips(page), ['R1', 'R3']);
    assert.deepEqual(await tags(page), ['R1', 'R3']);
    await page.locator(layChip('R1')).click();
    assert.deepEqual(await rowKeys(page), [HK[5]]);
    // The map has no dock and no plan switch: the stage is the map's.
    assert.equal(await page.locator('#cityMapPage .lp-dock, #cityMapPage .lp-seg, #cityMapPage .lp-tile').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the Layout filter is kept, saved with a search and cleared by a preset', async () => {
  const {page, errors} = await fixture(null, {premises: PLANNED});
  try{
    await openMap(page); await turnOn(page);
    await page.locator(layChip('C1')).click();
    // Kept with the other filters for the character.
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ba_finder_v1:finder-a')).layouts), ['C1']);
    // A saved search carries it and brings it back.
    await page.evaluate(() => cityMapPage.saveSearch('Corner shops'));
    assert.match(await page.evaluate(() => cityMapPage.savedTip(finderSaved()[0])), enRe('map.saved.tip.layout', {codes: 'C1'}, {}));
    await page.locator(layChip('C1')).click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    await page.evaluate(() => cityMapPage.applySaved('Corner shops'));
    await page.waitForFunction(() => document.querySelectorAll('#cityMapPage .place.fr').length === 1);
    assert.deepEqual(await layChips(page), ['C1*', 'C2', 'D2']);
    // A preset (Today's card, a Growth cell) is a fresh question.
    await page.evaluate(() => openFinder({cat: 'retail'}));
    await page.waitForFunction(() => document.querySelectorAll('#cityMapPage .place.fr').length === 3);
    assert.deepEqual(await layChips(page), ['C1', 'C2', 'D2']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a picked building shows its floor plan in its card; one with none shows none', async () => {
  const {page, errors} = await fixture(null, {premises: PLANNED});
  try{
    await openMap(page);
    // Finder off: any building with a layout.
    await page.evaluate(key => cityMapPage.select(key), HK[0]);
    await page.locator(`${plan} .lp-svg`).waitFor();
    assert.match(await page.locator(`${plan} .lp-planhead`).textContent(), new RegExp('^' + enRe('map.row.layout').source + 'C1' + enRe('map.plan.doors', {n: 1}).source + enRe('map.plan.metres', {n: /\d+/}).source + '$'));
    const card = await page.locator('#cityMapPage .site').boundingBox(), stage = await page.locator('#cityMapPage [data-stage]').boundingBox();
    const svg = await page.locator(`${plan} .lp-svg`).boundingBox();
    assert.ok(svg.x >= card.x && svg.x + svg.width <= card.x + card.width, 'the plan keeps inside the card');
    assert.ok(svg.height <= 161, `the plan is at most 160 px tall: ${svg.height}`);
    assert.ok(card.y >= stage.y && card.y + card.height <= stage.y + stage.height + 1, 'the card stays on the stage');
    // Finder on, a row with no layout: no plan block at all.
    await turnOn(page);
    await pick(page, MT[1]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .lp-plan').hidden);
    assert.equal(await page.locator(plan).isVisible(), false);
    await pick(page, MT[0]);
    await page.locator(`${plan} .lp-svg`).waitFor();
    assert.match(await page.locator(`${plan} .lp-planhead`).textContent(), /D2/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('cinema and theatre cards show the shipped auditorium floor plans', async () => {
  const {page, errors} = await fixture(null, {premises: PLANNED});
  try{
    await openMap(page); await turnOn(page);
    for(const [kind, key, code] of [['theater', HK[5], 'R1'], ['theater', MT[3], 'R3'], ['cinema', CINEMA_AT, 'S3']]){
      await page.locator(`#cityMapPage .fchip.cat[data-cat="${kind}"]`).click();
      await pick(page, key);
      await page.locator(`${plan} .lp-svg`).waitFor();
      assert.match(await page.locator(`${plan} .lp-planhead`).textContent(), new RegExp(code));
      assert.ok(await page.locator(`${plan} .lp-svg path`).count() > 0);
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('on a phone the card\'s plan fits the card and the card fits the map', async () => {
  const {page, errors} = await fixture(null, {premises: PLANNED});
  try{
    await page.setViewportSize({width: 390, height: 844});
    await openMap(page); await turnOn(page);
    await pick(page, HK[0]);
    await page.locator(`${plan} .lp-svg`).waitFor();
    // The card has come to rest: the same box for three frames in a row.
    await page.evaluate(() => { window.cardRest = null; });
    await page.waitForFunction(() => {
      const r = document.querySelector('#cityMapPage .site').getBoundingClientRect(), mark = window.cardRest;
      const now = [r.x, r.y, r.width, r.height].map(Math.round).join(' ');
      window.cardRest = {now, frames: mark && mark.now === now ? mark.frames + 1 : 0};
      return window.cardRest.frames >= 3;
    }, null, {polling: 'raf'});
    const card = await page.locator('#cityMapPage .site').boundingBox(), stage = await page.locator('#cityMapPage [data-stage]').boundingBox();
    const svg = await page.locator(`${plan} .lp-svg`).boundingBox();
    assert.ok(card.x >= stage.x && card.x + card.width <= stage.x + stage.width + 1, `card ${JSON.stringify(card)} stage ${JSON.stringify(stage)}`);
    assert.ok(card.y >= stage.y && card.y + card.height <= stage.y + stage.height + 1, `card ${JSON.stringify(card)} stage ${JSON.stringify(stage)}`);
    assert.ok(svg.width <= card.width, 'the plan keeps inside the card');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('Layout chips pick to filter, keep the focus, and all lit or none lit is no filter', async () => {
  const {page, errors} = await fixture(null, {premises: PLANNED});
  try{
    await openMap(page); await turnOn(page);
    await page.locator(layChip('C1')).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.flay), 'C1');
    assert.equal(await page.locator(layChip('C1')).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    // All three lit stay lit, the one just clicked with them, and list every
    // building, the one with no layout included.
    await page.locator(layChip('C2')).click();
    await page.locator(layChip('D2')).click();
    assert.deepEqual(await layChips(page), ['C1*', 'C2*', 'D2*']);
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    // Unlighting one filters again, to the two still lit.
    await page.locator(layChip('C2')).click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0]]);
    await page.locator(layChip('C1')).click();
    assert.deepEqual(await rowKeys(page), [MT[0]]);
    // Clearing the last lit chip leaves none lit and the full list.
    await page.locator(layChip('D2')).click();
    assert.deepEqual(await layChips(page), ['C1', 'C2', 'D2']);
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a search saved before the Layout filter still matches and clears it', async () => {
  const {page, errors} = await fixture(null, {premises: PLANNED});
  try{
    await openMap(page); await turnOn(page);
    await page.evaluate(() => finderKeepSaved([{name: 'Old', filters: {cat: 'retail', type: '', show: 'rent', hoods: null,
      minM2: 0, maxM2: 0, minCap: 0, maxCap: 0, minTraffic: 0, sort: 'score', sortPicked: false}}]));
    await page.evaluate(() => cityMapPage.update());
    // Nothing chosen: the old search is the one on screen.
    assert.equal(await page.locator('#cityMapPage .fsaved-list .fchip.on').textContent(), 'Old');
    await page.locator(layChip('C1')).click();
    assert.equal(await page.locator('#cityMapPage .fsaved-list .fchip.on').count(), 0);
    await page.locator('#cityMapPage .fsaved-list [data-saved="Old"]').click();
    assert.deepEqual(await layChips(page), ['C1', 'C2', 'D2']);
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a live refresh leaves the card\'s plan as it is', async () => {
  const {page, errors} = await fixture(null, {premises: PLANNED});
  try{
    await openMap(page); await turnOn(page);
    await pick(page, HK[0]);
    await page.locator(`${plan} .lp-svg`).waitFor();
    await page.evaluate(() => { document.querySelector('#cityMapPage .site .lp-svg').dataset.marker = '1'; });
    await page.evaluate(() => { D = {...D}; refreshCityMaps(); cityMapPage.update(); });
    assert.equal(await page.locator(`${plan} .lp-svg[data-marker]`).count(), 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('on a short phone the card scrolls inside the map and its close button stays in reach', async () => {
  const {page, errors} = await fixture(null, {premises: PLANNED});
  try{
    await page.setViewportSize({width: 390, height: 600});
    await openMap(page); await turnOn(page);
    await pick(page, HK[0]);
    await page.locator(`${plan} .lp-svg`).waitFor();
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site').classList.contains('lp-scroll'));
    const stage = await page.locator('#cityMapPage [data-stage]').boundingBox();
    let card = await page.locator('#cityMapPage .site').boundingBox();
    assert.ok(card.y >= stage.y && card.y + card.height <= stage.y + stage.height + 1, `card ${JSON.stringify(card)} stage ${JSON.stringify(stage)}`);
    // Scrolled down to the plan, the close button is still on the card and on top.
    await page.evaluate(() => { const c = document.querySelector('#cityMapPage .site'); c.scrollTop = c.scrollHeight; });
    await page.waitForTimeout(100);
    card = await page.locator('#cityMapPage .site').boundingBox();
    const x = await page.locator('#cityMapPage .site .x').boundingBox();
    assert.ok(x.y >= card.y && x.y + x.height <= card.y + card.height, `close ${JSON.stringify(x)} card ${JSON.stringify(card)}`);
    assert.equal(await page.evaluate(({x, y}) => !!document.elementFromPoint(x, y)?.closest('.site .x'), {x: x.x + x.width / 2, y: x.y + x.height / 2}), true);
    await page.locator('#cityMapPage .site .x').click();
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site').hidden);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a card whose plan shrinks to fit the stage does not scroll', async () => {
  const {page, errors} = await fixture(null, {premises: PLANNED});
  try{
    // A phone tall enough that the card fits once the plan gives up some of
    // its 160 px, but not all of it: find that height from the card itself.
    await page.setViewportSize({width: 390, height: 900});
    await openMap(page); await turnOn(page);
    await pick(page, HK[0]);
    await page.locator(`${plan} .lp-svg`).waitFor();
    const planHeight = () => page.evaluate(() => { const v = cityMapPage; v.rect = null; v.placeCard();
      return document.querySelector('#cityMapPage .site .lp-svg').getBoundingClientRect().height; });
    let h = 0;
    for(let height = 900; height <= 1800 && !(h > 95 && h < 155); height += 20){
      await page.setViewportSize({width: 390, height});
      h = await planHeight();
    }
    assert.ok(h > 95 && h < 155, `no phone height shrinks the plan into 90-160 px: ${h}`);
    assert.equal(await page.locator('#cityMapPage .site').evaluate(c => c.classList.contains('lp-scroll')), false);
    const card = await page.locator('#cityMapPage .site').boundingBox(), stage = await page.locator('#cityMapPage [data-stage]').boundingBox();
    assert.ok(card.y + card.height <= stage.y + stage.height + 1, `card ${JSON.stringify(card)} stage ${JSON.stringify(stage)}`);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a search saved with a layout matches a save whose kind has only that one', async () => {
  const {page, errors} = await fixture(null, {premises: PLANNED});
  try{
    await openMap(page); await turnOn(page);
    // Saved where offices had several layouts; here they have J1 only, which
    // is no filter, so the search is the one on screen and names no layout.
    await page.evaluate(() => finderKeepSaved([{name: 'Offices', filters: {cat: 'office', type: '', show: 'rent', hoods: null,
      layouts: ['J1'], minM2: 0, maxM2: 0, minCap: 0, maxCap: 0, minTraffic: 0, sort: 'score', sortPicked: false}}]));
    await page.locator('#cityMapPage .fchip.cat[data-cat="office"]').click();
    assert.equal(await page.locator('#cityMapPage .fsaved-list .fchip.on').textContent(), 'Offices');
    assert.doesNotMatch(await page.evaluate(() => cityMapPage.savedTip(finderSaved()[0])), enRe('map.saved.tip.layout', {}, {}));
    await page.locator('#cityMapPage .fsaved-list [data-saved="Offices"]').click();
    assert.deepEqual(await rowKeys(page), [HK[4]]);
    assert.equal(await page.locator('#cityMapPage .fsaved-list .fchip.on').textContent(), 'Offices');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a live refresh leaves the Type list alone unless its types changed', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage [data-f="type"]').selectOption(COFFEE);
    // Replacing the options would close the list under an open pointer.
    const same = await page.evaluate(() => {
      const first = document.querySelector('#cityMapPage [data-f="type"] option');
      D = {...D}; refreshCityMaps();
      const select = document.querySelector('#cityMapPage [data-f="type"]');
      return select.querySelector('option') === first && select.value;
    });
    assert.equal(same, COFFEE);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
