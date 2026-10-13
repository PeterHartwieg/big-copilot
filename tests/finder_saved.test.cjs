/* Find a location, saved searches and the for-sale sort: saving, naming,
   restoring and deleting a search, and the sale list's own sort. Setup and
   the synthetic premises payload are tests/_finder.cjs. */
const {test} = require('node:test');
const H = require('./_finder.cjs');
const {assert, en, enRe, at, HK, MT, HK_NAME, HK_HOOD, MT_HOOD, PREMISES, fixture, openMap, chip, turnOn, pick, rowKeys, saved, savedNames, saveAs} = H;

test('a saved search comes back in one click, for every character and after a reload', async () => {
  const context = await H.browser.newContext();
  const {page, errors} = await fixture(context);
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.cat[data-cat="office"]').click();
    await page.locator('#cityMapPage .fchip.num input[data-f="minCap"]').fill('5');
    await page.locator(`#cityMapPage .fchip.hd[data-h="${MT_HOOD}"]`).click();
    // The name on offer says what the search looks for.
    await page.locator(`${saved} [data-f="save"]`).click();
    assert.match(await page.locator(`${saved} [data-f="name"]`).inputValue(), new RegExp('^' + enRe('map.kind.office').source + ' \u00b7 '));
    await page.locator(`${saved} [data-f="name"]`).fill('Small offices');
    await page.locator(`${saved} [data-f="name"]`).press('Enter');
    assert.deepEqual(await savedNames(page), ['Small offices']);
    const mine = page.locator(`${saved} [data-saved="Small offices"]`);
    assert.equal(await mine.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.saved), 'Small offices');
    assert.match(await mine.getAttribute('data-tip'), new RegExp('^' + [enRe('map.kind.office').source, enRe('map.show.available').source, '.+', enRe('map.range.cap.min', {lo: 5}).source, enRe('map.saved.tip.sort', {sort: en('map.sortname.score')}).source].join(' \u00b7 ') + '$'));
    // Any change to the filters, and the chip is no longer what is on screen.
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    assert.equal(await mine.getAttribute('aria-pressed'), 'false');
    await mine.click();
    assert.equal(await page.locator('#cityMapPage .fchip.cat.on').textContent(), en('map.kind.office'));
    assert.equal(await page.locator('#cityMapPage .fchip.num input[data-f="minCap"]').inputValue(), '5');
    assert.deepEqual(await rowKeys(page), [HK[4]]);
    // Another character keeps its own filters and shares the saved searches.
    await page.evaluate(() => { D.meta.character = 'finder-b'; refreshCityMaps(); });
    await turnOn(page);
    assert.equal(await page.locator('#cityMapPage .fchip.cat.on').textContent(), en('map.kind.retail'));
    await page.locator(`${saved} [data-saved="Small offices"]`).click();
    assert.deepEqual(await rowKeys(page), [HK[4]]);
    const {page: again} = await fixture(context);
    try{
      await openMap(again); await turnOn(again);
      assert.deepEqual(await savedNames(again), ['Small offices']);
    } finally { await again.close(); }
    assert.deepEqual(errors, []);
  } finally { await page.close(); await context.close(); }
});

test('a name already taken is replaced, the offered name never replaces one, and each chip deletes its own', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await saveAs(page, 'Shops');
    await page.locator('#cityMapPage .fchip.cat[data-cat="office"]').click();
    await saveAs(page, 'shops');
    // One search, under the new spelling, holding the new filters.
    assert.deepEqual(await savedNames(page), ['shops']);
    assert.equal(await page.locator(`${saved} [data-saved="shops"]`).getAttribute('aria-pressed'), 'true');
    // Taking the offered name twice keeps both.
    for(let i = 0; i < 2; i++){
      await page.locator(`${saved} [data-f="save"]`).click();
      await page.locator(`${saved} [data-f="name"]`).press('Enter');
    }
    assert.deepEqual(await savedNames(page), ['shops', 'Office', 'Office 2']);
    // Escape drops the name and hands the focus back to Save.
    await page.locator(`${saved} [data-f="save"]`).click();
    await page.locator(`${saved} [data-f="name"]`).fill('Never');
    await page.locator(`${saved} [data-f="name"]`).press('Escape');
    assert.deepEqual(await savedNames(page), ['shops', 'Office', 'Office 2']);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.f), 'save');
    // A delete from the keyboard leaves the focus in the row.
    await page.locator(`${saved} [data-unsave="Office"]`).focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await savedNames(page), ['shops', 'Office 2']);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.saved), 'shops');
    assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('ba_finder_saved_v1')))).map(s => s.name),
      ['shops', 'Office 2']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a saved search is read against this save: what it does not know falls away', async () => {
  const context = await H.browser.newContext();
  const {page} = await fixture(context);
  try{
    await page.evaluate(mt => localStorage.setItem('ba_finder_saved_v1', JSON.stringify([
      {name: 'Elsewhere', filters: {cat: 'retail', show: 'rent', hoods: [mt, 'ba:neighborhood_nowhere'],
        minCap: 'lots', maxCap: -5, sort: 'score', extra: 1}},
      {name: 'No filters'}, 'junk'])), MT_HOOD);
    const {page: again, errors} = await fixture(context);
    try{
      await openMap(again); await turnOn(again);
      assert.deepEqual(await savedNames(again), ['Elsewhere']);
      await again.locator(`${saved} [data-saved="Elsewhere"]`).click();
      assert.deepEqual(await rowKeys(again), [MT[0], MT[1]]);
      assert.equal(await again.locator(`#cityMapPage .fchip.hd[data-h="${HK_HOOD}"]`).getAttribute('aria-pressed'), 'false');
      assert.equal(await again.locator('#cityMapPage .fchip.num input[data-f="minCap"]').inputValue(), '0');
      assert.equal(await again.locator(`${saved} [data-saved="Elsewhere"]`).getAttribute('aria-pressed'), 'true');
      assert.deepEqual(errors, []);
    } finally { await again.close(); }
  } finally { await page.close(); await context.close(); }
});

test('neighbourhoods stored by their English name read back as the game key they name', async () => {
  const context = await H.browser.newContext();
  const {page} = await fixture(context);
  try{
    // What the finder stored before it kept neighbourhoods by key.
    await page.evaluate(name => {
      localStorage.setItem('ba_finder_saved_v1', JSON.stringify([
        {name: 'Old', filters: {cat: 'retail', show: 'rent', hoods: ['Midtown', 'Nowhere'], sort: 'score'}}]));
      localStorage.setItem('ba_finder_v1:finder-a', JSON.stringify({cat: 'retail', type: '', show: 'rent',
        hoods: [name], minCap: 0, maxCap: 0, minTraffic: 0, sort: 'score'}));
    }, HK_NAME);
    const {page: again, errors} = await fixture(context);
    try{
      await openMap(again); await turnOn(again);
      // The filters kept for the character: Hell's Kitchen alone.
      assert.equal(await again.locator(`#cityMapPage .fchip.hd[data-h="${HK_HOOD}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await again.locator(`#cityMapPage .fchip.hd[data-h="${MT_HOOD}"]`).getAttribute('aria-pressed'), 'false');
      // The saved search: Midtown, and a name no neighbourhood has falls away.
      await again.locator(`${saved} [data-saved="Old"]`).click();
      assert.deepEqual(await rowKeys(again), [MT[0], MT[1]]);
      // Written back in keys, once, so the old names are gone from storage.
      assert.deepEqual(await again.evaluate(() => JSON.parse(localStorage.getItem('ba_finder_saved_v1'))[0].filters.hoods),
        [MT_HOOD]);
      assert.deepEqual(errors, []);
    } finally { await again.close(); }
  } finally { await page.close(); await context.close(); }
});

test('a search this save cannot honour in full still reads as the one on screen', async () => {
  const context = await H.browser.newContext();
  const {page} = await fixture(context);
  try{
    // A type this save has no demand for, a sort its category cannot show, and a
    // minimum with no end to it: all three fall back, and the chip still fills.
    await page.evaluate(() => localStorage.setItem('ba_finder_saved_v1', JSON.stringify([
      {name: 'Stale', filters: {cat: 'warehouse', type: 'ba:businesstype_gone', sort: 'score',
        sortPicked: true, minTraffic: 'Infinity'}}])));
    const {page: again, errors} = await fixture(context);
    try{
      await openMap(again); await turnOn(again);
      await again.locator(`${saved} [data-saved="Stale"]`).click();
      assert.equal(await again.locator('#cityMapPage .fchip.cat.on').textContent(), en('map.kind.warehouse'));
      assert.equal(await again.locator('#cityMapPage .fhead span.on').textContent(), 'm²');
      assert.equal(await again.locator('#cityMapPage .fchip.num input[data-f="minTraffic"]').inputValue(), '0');
      assert.equal(await again.locator(`${saved} [data-saved="Stale"]`).getAttribute('aria-pressed'), 'true');
      assert.deepEqual(errors, []);
    } finally { await again.close(); }
  } finally { await page.close(); await context.close(); }
});

test('two searches with the same filters are told apart by the one you pick', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await saveAs(page, 'First');
    await saveAs(page, 'Second');
    const pressed = () => page.$$eval(`${saved} [data-saved]`, c => c.map(x => x.getAttribute('aria-pressed')));
    assert.deepEqual(await pressed(), ['false', 'true']);
    await page.locator(`${saved} [data-saved="First"]`).click();
    assert.deepEqual(await pressed(), ['true', 'false']);
    // Their tooltips differ once their sorts do.
    await page.locator('#cityMapPage .fhead [data-s="traffic"]').click();
    await saveAs(page, 'Third');
    assert.match(await page.locator(`${saved} [data-saved="Third"]`).getAttribute('data-tip'), new RegExp(enRe('map.saved.tip.sort', {sort: en('map.sortname.traffic')}).source + '$'));
    assert.match(await page.locator(`${saved} [data-saved="First"]`).getAttribute('data-tip'), enRe('map.saved.tip.sort', {sort: en('map.sortname.score')}, {}));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the name field waits for Save or Enter, whatever else is pressed meanwhile', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.cat[data-cat="office"]').click();
    await saveAs(page, 'Offices');
    await saveAs(page, 'Spare');
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    await page.locator(`${saved} [data-f="save"]`).click();
    await page.locator(`${saved} [data-f="name"]`).fill('Shops');
    // A chip, a delete and the map are all pressed while the field is open: each
    // does its own job at once, nothing is saved, and the field stays as it was.
    await page.locator(`${saved} [data-saved="Offices"]`).click();
    assert.equal(await page.locator('#cityMapPage .fchip.cat.on').textContent(), en('map.kind.office'));
    await page.locator(`${saved} [data-unsave="Spare"]`).click();
    await page.locator('#cityMapPage [data-stage]').click({position: {x: 320, y: 260}});
    assert.deepEqual(await savedNames(page), ['Offices']);
    assert.equal(await page.locator(`${saved} [data-f="name"]`).inputValue(), 'Shops');
    // Save keeps the name for what is on screen now, and leaves the focus on Save.
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    await page.locator(`${saved} [data-f="save"]`).click();
    assert.deepEqual(await savedNames(page), ['Offices', 'Shops']);
    assert.equal(await page.locator(`${saved} [data-f="name"]`).isVisible(), false);
    assert.equal(await page.locator(`${saved} [data-saved="Shops"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.f), 'save');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the x drops a name, and an empty name saves nothing', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    const cancel = page.locator(`${saved} [data-f="cancel"]`);
    assert.equal(await cancel.isVisible(), false);
    await page.locator(`${saved} [data-f="save"]`).click();
    await page.locator(`${saved} [data-f="name"]`).fill('Dropped');
    await cancel.click();
    assert.equal(await page.locator(`${saved} [data-f="name"]`).isVisible(), false);
    assert.equal(await cancel.isVisible(), false);
    // Opened again, the field offers a fresh name rather than the dropped one.
    await page.locator(`${saved} [data-f="save"]`).click();
    assert.notEqual(await page.locator(`${saved} [data-f="name"]`).inputValue(), 'Dropped');
    await page.locator(`${saved} [data-f="name"]`).fill('   ');
    await page.locator(`${saved} [data-f="save"]`).click();
    assert.deepEqual(await savedNames(page), []);
    assert.equal(await page.locator(`${saved} [data-f="name"]`).isVisible(), false);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a sale search restores its own sort and leaves the ranked sort alone', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    // Save while reading the sale list, with the ranked lists on their own order.
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    await saveAs(page, 'On sale');
    await page.locator('#cityMapPage .fhead [data-s="payback"]').click();
    await saveAs(page, 'By payback');
    assert.match(await page.locator(`${saved} [data-saved="By payback"]`).getAttribute('data-tip'), enRe('map.saved.tip.payback'));
    assert.doesNotMatch(await page.locator(`${saved} [data-saved="On sale"]`).getAttribute('data-tip'), enRe('map.saved.tip.payback'));
    assert.equal(await page.locator(`${saved} [data-saved="On sale"]`).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => finderSaved()[1].filters.saleSort), 'payback');
    // Now sort the ranked list by traffic and go back to the sale list: the same
    // visible filters, so the chip is lit whatever the hidden sort is.
    await page.locator('#cityMapPage .fchip.show[data-show="rent"]').click();
    await page.locator('#cityMapPage .fhead [data-s="traffic"]').click();
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    assert.equal(await page.locator(`${saved} [data-saved="By payback"]`).getAttribute('aria-pressed'), 'true');
    // Applying it changes nothing a sale list cannot show, so the sort survives.
    await page.locator(`${saved} [data-saved="On sale"]`).click();
    assert.equal(await page.locator('#cityMapPage .fhead.sale span.on').textContent(), en('map.col.price'));
    await page.locator(`${saved} [data-saved="By payback"]`).click();
    assert.equal(await page.locator('#cityMapPage .fhead.sale span.on').textContent(), en('map.col.payback'));
    await page.locator('#cityMapPage .fchip.show[data-show="rent"]').click();
    assert.equal(await page.locator('#cityMapPage .fhead span.on').textContent(), en('map.col.traffic'));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('two names that differ in case alone are two searches, each saved and deleted on its own', async () => {
  const context = await H.browser.newContext();
  const {page} = await fixture(context);
  try{
    await page.evaluate(() => localStorage.setItem('ba_finder_saved_v1', JSON.stringify([
      {name: 'Offices', filters: {cat: 'office'}}, {name: 'offices', filters: {cat: 'cinema'}}])));
    const {page: again, errors} = await fixture(context);
    try{
      await openMap(again); await turnOn(again);
      // Each chip applies its own search, not its twin in another case.
      await again.locator(`${saved} [data-saved="offices"]`).click();
      assert.equal(await again.locator('#cityMapPage .fchip.cat.on').textContent(), en('map.kind.cinema'));
      // Saving under the exact name replaces that one, never the other case.
      await again.locator('#cityMapPage .fchip.cat[data-cat="warehouse"]').click();
      await saveAs(again, 'offices');
      const stored = () => again.evaluate(() => JSON.parse(localStorage.getItem('ba_finder_saved_v1'))
        .map(s => `${s.name}:${s.filters.cat}`));
      assert.deepEqual(await stored(), ['Offices:office', 'offices:warehouse']);
      // And a delete takes the one it was pressed on.
      await again.locator(`${saved} [data-unsave="offices"]`).click();
      assert.deepEqual(await stored(), ['Offices:office']);
      assert.deepEqual(errors, []);
    } finally { await again.close(); }
  } finally { await page.close(); await context.close(); }
});

test('the eighth search saved with the mouse hands the focus to its chip', async () => {
  const context = await H.browser.newContext();
  const {page} = await fixture(context);
  try{
    await page.evaluate(() => localStorage.setItem('ba_finder_saved_v1', JSON.stringify(
      Array.from({length: 7}, (_, i) => ({name: `S${i + 1}`, filters: {cat: 'office', minTraffic: i + 1}})))));
    const {page: again, errors} = await fixture(context);
    try{
      await openMap(again); await turnOn(again);
      await again.locator(`${saved} [data-f="save"]`).click();
      await again.locator(`${saved} [data-f="name"]`).fill('Eighth');
      await again.locator(`${saved} [data-f="save"]`).click();
      assert.equal((await savedNames(again)).length, 8);
      assert.equal(await again.locator(`${saved} [data-f="save"]`).isVisible(), false);
      // The hidden Save must not keep the focus, or Enter would open a ninth.
      assert.equal(await again.evaluate(() => document.activeElement?.dataset.saved), 'Eighth');
      await again.keyboard.press('Enter');
      assert.equal(await again.locator(`${saved} [data-f="name"]`).isVisible(), false);
      assert.deepEqual(errors, []);
    } finally { await again.close(); }
  } finally { await page.close(); await context.close(); }
});

test('a field open on a full row says so for exactly as long as it is true', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    const field = page.locator(`${saved} .fname`), input = page.locator(`${saved} [data-f="name"]`);
    const warned = async () => ({full: await field.evaluate(f => f.classList.contains('full')),
      tip: await field.getAttribute('data-tip'), invalid: await input.getAttribute('aria-invalid')});
    const quiet = {full: false, tip: null, invalid: null};
    const fill = count => page.evaluate(n => {
      const list = JSON.stringify(Array.from({length: n}, (_, i) => ({name: `T${i + 1}`, filters: {cat: 'office'}})));
      localStorage.setItem('ba_finder_saved_v1', list);
      window.dispatchEvent(new StorageEvent('storage', {key: 'ba_finder_saved_v1', newValue: list}));
    }, count);
    await page.locator(`${saved} [data-f="save"]`).click();
    await input.fill('Too late');
    // Keep the pointer off the panel: a hovered chip opens tooltips of its own.
    await page.mouse.move(2, 2);
    assert.deepEqual(await warned(), quiet);
    // Another tab takes the last place: the open field warns straight away.
    await fill(8);
    const on = await warned();
    assert.equal(on.full, true);
    assert.match(on.tip, enRe('map.saved.full', {}, {}));
    assert.equal(on.invalid, 'true');
    // Enter does not save, keeps the name, and shows the reason to a keyboard user.
    await input.press('Enter');
    assert.equal((await savedNames(page)).length, 8);
    assert.equal(await input.inputValue(), 'Too late');
    assert.equal(await page.locator('#tip').evaluate(t => t.classList.contains('on') && t.textContent), on.tip);
    // Deleting one makes room, and the warning ends with it, before any retry.
    await page.locator(`${saved} [data-unsave="T1"]`).click();
    assert.deepEqual(await warned(), quiet);
    await input.press('Enter');
    assert.ok((await savedNames(page)).includes('Too late'));
    assert.deepEqual(await warned(), quiet);
    // Refused again, then another tab deletes one while the focus stays put: the
    // warning and its tooltip both go, though nothing on this page moved.
    await fill(7);
    await page.locator(`${saved} [data-f="save"]`).click();
    await input.fill('Too late again');
    // The pointer is parked off the panel, so a chip redrawn under it cannot
    // open its own tooltip and stand in for the one under test.
    await page.mouse.move(2, 2);
    const warning = () => page.locator('#tip').evaluate((t, source) => t.classList.contains('on') && new RegExp(source).test(t.textContent), enRe('map.saved.full').source);
    await fill(8);
    await input.press('Enter');
    assert.equal(await warning(), true);
    await fill(7);
    assert.deepEqual(await warned(), quiet);
    assert.equal(await warning(), false);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.f), 'name');
    // On a full row a name already saved, in any case, is a replacement, not a
    // problem: no warning, and Enter replaces that search.
    await fill(8);
    assert.equal((await warned()).full, true);
    await input.fill('t3');
    assert.deepEqual(await warned(), quiet);
    await input.press('Enter');
    assert.equal((await savedNames(page)).length, 8);
    assert.ok((await savedNames(page)).includes('t3'));
    // Closed on a full row, a field opened later carries no trace of the warning.
    await fill(7);
    await page.locator(`${saved} [data-f="save"]`).click();
    await fill(8);
    assert.equal((await warned()).invalid, 'true');
    await input.press('Escape');
    assert.deepEqual(await warned(), quiet);
    await fill(7);
    await page.locator(`${saved} [data-f="save"]`).click();
    assert.deepEqual(await warned(), quiet);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('eight saved searches fill the row, and Save steps aside until one goes', async () => {
  const context = await H.browser.newContext();
  const {page} = await fixture(context);
  try{
    await page.evaluate(() => localStorage.setItem('ba_finder_saved_v1', JSON.stringify(
      Array.from({length: 8}, (_, i) => ({name: `S${i + 1}`, filters: {cat: 'retail', minTraffic: i * 10}})))));
    const {page: again} = await fixture(context);
    try{
      await openMap(again); await turnOn(again);
      assert.equal((await savedNames(again)).length, 8);
      assert.equal(await again.locator(`${saved} [data-f="save"]`).isVisible(), false);
      await again.locator(`${saved} [data-unsave="S3"]`).click();
      assert.equal(await again.locator(`${saved} [data-f="save"]`).isVisible(), true);
    } finally { await again.close(); }
  } finally { await page.close(); await context.close(); }
});

test("a half-typed name survives a live refresh and another tab's saves", async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator(`${saved} [data-f="save"]`).click();
    await page.locator(`${saved} [data-f="name"]`).fill('Half');
    await page.evaluate(() => refreshCityMaps());
    assert.equal(await page.locator(`${saved} [data-f="name"]`).inputValue(), 'Half');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.f), 'name');
    // Another tab saves a search: the browser tells this one through the storage
    // event, the chips follow, and the name typed so far stays where it is.
    await page.evaluate(() => {
      const list = JSON.stringify([{name: 'From the other tab', filters: {cat: 'office'}}]);
      localStorage.setItem('ba_finder_saved_v1', list);
      window.dispatchEvent(new StorageEvent('storage', {key: 'ba_finder_saved_v1', newValue: list}));
    });
    assert.deepEqual(await savedNames(page), ['From the other tab']);
    assert.equal(await page.locator(`${saved} [data-f="name"]`).inputValue(), 'Half');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.f), 'name');
    await page.keyboard.press('End');
    await page.keyboard.type('way');
    await page.keyboard.press('Enter');
    assert.deepEqual(await savedNames(page), ['From the other tab', 'Halfway']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('saving works for the session when the browser refuses to store', async () => {
  const context = await H.browser.newContext();
  await context.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value){
      if(key === 'ba_finder_saved_v1') throw new Error('QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  const {page, errors} = await fixture(context);
  try{
    await openMap(page); await turnOn(page);
    await saveAs(page, 'Kept');
    await saveAs(page, 'Gone');
    await page.locator(`${saved} [data-unsave="Gone"]`).click();
    assert.deepEqual(await savedNames(page), ['Kept']);
    assert.equal(await page.evaluate(() => localStorage.getItem('ba_finder_saved_v1')), null);
    assert.deepEqual(errors, []);
  } finally { await page.close(); await context.close(); }
});


test('sale heads sort by payback with null last and price ties, independently of ranked heads', async () => {
  const premises = {...PREMISES, forSale: [
    {...PREMISES.forSale[0], payback: 1778},
    {...PREMISES.forSale[2], payback: null},
    {key: MT[0], address: at(MT[0]).address, hood: MT_HOOD, type: 'retail', m2: 285, price: 900000, payback: 1778},
    {key: MT[1], address: at(MT[1]).address, hood: MT_HOOD, type: 'retail', m2: 120, price: 1000000, payback: 1524},
  ]};
  const {page, errors} = await fixture(null, {premises});
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fhead [data-s="traffic"]').click();
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    const head = page.locator('#cityMapPage .fhead [data-s="payback"]');
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1], MT[2]]);
    await head.click();
    assert.deepEqual(await rowKeys(page), [MT[1], MT[0], MT[2], HK[0]]);
    assert.equal(await page.locator('#cityMapPage .fhead.sale span.on').textContent(), en('map.col.payback'));
    assert.equal(await head.getAttribute('data-tip'), en('map.col.payback.tip2'));
    assert.deepEqual(await page.evaluate(() => [cityMapPage.fs.sort, cityMapPage.fs.sortPicked]), ['traffic', true]);
    await head.click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1], MT[2]]);
    assert.equal(await page.locator('#cityMapPage .fhead.sale span.on').textContent(), en('map.col.price'));
    await head.focus(); await head.press('Enter');
    assert.deepEqual(await rowKeys(page), [MT[1], MT[0], MT[2], HK[0]]);
    await head.focus(); await head.press('Space');
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1], MT[2]]);
    await head.click();
    await page.locator('#cityMapPage .fhead [data-s="price"]').click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1], MT[2]]);
    await head.click();
    await page.locator('#cityMapPage .fchip.show[data-show="rent"]').click();
    await page.locator('#cityMapPage .fhead [data-s="m2"]').click();
    assert.equal(await page.evaluate(() => cityMapPage.fs.saleSort), 'payback');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the sale chip reads the rounded median at paint time and omits payback without data', async () => {
  const {page} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    const chip = page.locator('#cityMapPage .fchip.show[data-show="sale"]');
    assert.equal(await chip.getAttribute('data-tip'), en('map.show.sale.tip2') + ' ' + en('map.show.sale.tip.payback3', {n: 1800}));
    // Under the Payback sort the tip makes no claim about the order.
    await chip.click();
    await page.locator('#cityMapPage .fhead [data-s="payback"]').click();
    assert.equal(await page.locator('#cityMapPage .fhead [data-s="payback"]').getAttribute('class'), 'on');
    assert.equal(await chip.getAttribute('data-tip'), en('map.show.sale.tip2') + ' ' + en('map.show.sale.tip.payback3', {n: 1800}));
    assert.doesNotMatch(await chip.getAttribute('data-tip'), /cheapest/i);
    await page.evaluate(() => { D.premises.forSale.forEach(s => s.payback = 1576); cityMapPage.update(); });
    assert.equal(await chip.getAttribute('data-tip'), en('map.show.sale.tip2') + ' ' + en('map.show.sale.tip.payback3', {n: 1600}));
    await page.evaluate(() => { D.premises.forSale.forEach(s => s.payback = null); cityMapPage.update(); });
    assert.equal(await chip.getAttribute('data-tip'), en('map.show.sale.tip2'));
    assert.equal(await page.evaluate(() => { D.premises = null; return MAP_WORDS.showSaleTip; }), en('map.show.sale.tip2'));
  } finally { await page.close(); }
});

test('sale sort defaults, validation, storage and saved identities follow the visible list', async () => {
  const {page} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    assert.deepEqual(await page.evaluate(() => {
      const v = cityMapPage, f = {...v.fs, show: 'sale'};
      return [finderDefaults().saleSort, finderPick({...f, saleSort: 'unknown'}).saleSort,
        v.savedFilters({filters: {...f, saleSort: undefined}}).saleSort,
        v.savedFilters({filters: {...f, saleSort: 'unknown'}}).saleSort,
        v.savedKey({...f, saleSort: 'price'}) !== v.savedKey({...f, saleSort: 'payback'}),
        v.savedKey({...f, saleSort: 'payback', sort: 'traffic'}) === v.savedKey({...f, saleSort: 'payback', sort: 'score'}),
        v.savedKey({...f, show: 'rent', saleSort: 'price'}) === v.savedKey({...f, show: 'rent', saleSort: 'payback'})];
    }), ['price', 'price', 'price', 'price', true, true, true]);
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    await page.locator('#cityMapPage .fhead [data-s="payback"]').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(cityMapPage.finderStore())).saleSort), 'payback');
    assert.deepEqual(await page.evaluate(() => {
      const v = cityMapPage, store = v.finderStore();
      v.fsCharacter = null; v.loadFinder(); const kept = v.fs.saleSort;
      localStorage.setItem(store, JSON.stringify({saleSort: 'unknown'}));
      v.fsCharacter = null; v.loadFinder(); const invalid = v.fs.saleSort;
      v.fs.saleSort = 'payback'; v.setFinder();
      return [kept, invalid, v.fs.saleSort];
    }), ['payback', 'price', 'price']);
    // A ranked search, applied, leaves the For sale order as the player left it.
    assert.equal(await page.evaluate(() => {
      const v = cityMapPage;
      v.saveSearch('Ranked'); finderKeepSaved(finderSaved().map(s => s.name === 'Ranked' ? {...s, filters: {...s.filters, show: 'rent', saleSort: 'price'}} : s));
      v.fs.saleSort = 'payback'; v.applySaved('Ranked');
      return v.fs.saleSort;
    }), 'payback');
  } finally { await page.close(); }
});
