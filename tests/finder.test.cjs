/* Find a location: the site card's facts, the finder mode on the map page, its
   lists, filters and columns, and the Today card. Saved searches and sale
   sorting are tests/finder_saved.test.cjs; the Growth cell's way in and the
   Layout filter with its floor plans are tests/finder_layout.test.cjs. The
   premises payload (tests/_finder.cjs) is synthetic so the numbers below are
   the rule, not one save's readings. */
const {test} = require('node:test');
const H = require('./_finder.cjs');
const {UI_LANGS} = require('./_i18n.cjs');
const {assert, en, enRe, fs, path, root, geometry, at, HK, MT, COFFEE, HK_NAME, HK_HOOD, MT_HOOD, site, PREMISES, fixture, openMap, chip, turnOn, pick, rowKeys, facts, saved, plan} = H;

test('ordinary map facts retain deposit estimates and unknown deposits for player premises', async () => {
  const {page} = await fixture();
  try{
    await openMap(page);
    for(const deposit of [840, null]){
      await page.evaluate(({key, deposit}) => {
        const b = premises().buildings.find(b => b.key === key);
        Object.assign(b, {status: 'mine', deposit, occupant: {name: 'Existing shop', type: 'Coffee Shop'}});
        cityMapPage.select(key);
      }, {key: HK[0], deposit});
      assert.ok((await facts(page)).includes(en('map.fact.deposit') + (deposit === null ? '—' : '$840')));
    }
  } finally { await page.close(); }
});

test('any address carries its facts: what it is, what it costs and whether it is free', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page);
    // A vacant shop, with the finder still off.
    await page.evaluate(key => cityMapPage.select(key), HK[0]);
    await page.locator('#cityMapPage .site.in').waitFor();
    assert.equal(await page.locator('#cityMapPage .site .st').textContent(), en('map.status.vacant'));
    assert.deepEqual(await facts(page),
      [en('map.fact.owner', {}) + en('map.owner.city', {}), en('map.fact.renter', {}) + en('map.renter.none', {}), en('map.kind.retail') + ' C' + en('map.fact.m2', {n: 225}), en('map.fact.traffic') + '60', en('map.fact.cap') + '30',
       en('map.fact.rent') + '$140', en('map.fact.deposit') + '$840']);
    assert.equal(await page.locator('#cityMapPage .site .fit').isVisible(), false);
    // A rival's building names the business and its type.
    await page.evaluate(key => cityMapPage.select(key), HK[1]);
    await page.waitForFunction(text => document.querySelector('#cityMapPage .site .st').textContent === text, en('map.status.rival', {name: 'Bean There', type: 'Coffee Shop'}));
    assert.equal(await page.locator('#cityMapPage .site .st').textContent(), en('map.status.rival', {name: 'Bean There', type: 'Coffee Shop'}));
    // A flat is neither vacant nor rentable, and carries no rent estimate.
    await page.evaluate(key => cityMapPage.select(key), HK[3]);
    await page.waitForFunction(text => document.querySelector('#cityMapPage .site .st').textContent === text, en('map.status.residential'));
    assert.deepEqual(await facts(page),
      [en('map.fact.owner', {}) + '\u2014', en('map.fact.renter', {}) + en('map.renter.none', {}), en('map.kind.residential') + ' B' + en('map.fact.m2', {n: 90}), en('map.fact.traffic') + '50', en('map.fact.cap') + '—',
       en('map.fact.rent') + '—', en('map.fact.deposit') + '—']);
    // The card takes its two letters from the board's own table, not from the
    // neighbourhood's initials, so it reads the same as the list's rows.
    await page.evaluate(key => cityMapPage.select(key), MT[0]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .sub .hood').textContent === 'MT');
    await turnOn(page);
    assert.equal(await page.locator('#cityMapPage .site .sub .hood').textContent(),
      await page.locator(`#cityMapPage .place[data-pick="${MT[0]}"] .hood`).textContent());
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the switch is in the map window; every filter lives in the panel', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page);
    // The switch sits inside the stage with the zoom buttons, in the same
    // button, and is on screen whether the finder is on or off.
    assert.equal(await page.locator('#cityMapPage [data-stage] .fswitch .ibtn').count(), 1);
    assert.equal(await page.locator(chip).isVisible(), true);
    // A chip with its name on it, not a bare pin that only a tooltip names.
    // The New badge beside the name is not part of it (it is aria-hidden).
    assert.equal((await page.locator(`${chip} > span:not(.feature-new)`).innerText()).trim(), en('map.finder.name'));
    assert.equal(await page.getByRole('button', {name: en('map.finder.name'), exact: true}).count(), 1);
    assert.equal(await page.locator(chip).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#cityMapPage .map-head').isVisible(), true);
    assert.equal(await page.locator('#cityMapPage .filters').isVisible(), false);
    assert.equal(await page.locator('#cityMapPage .places').isVisible(), false);
    await turnOn(page);
    const selected = await page.$$eval('#cityMapPage .filters .fchip.on', chips =>
      chips.map(c => c.dataset.cat || c.dataset.show || c.dataset.h).sort());
    assert.deepEqual(selected, [HK_HOOD, MT_HOOD, 'rent', 'retail'].sort());
    assert.equal(await page.locator('#cityMapPage .fsel select').inputValue(), '');
    assert.equal(await page.locator(chip).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#cityMapPage .places').isVisible(), true);
    // The plain map's whole header steps aside; the filters sit in the panel,
    // above its own results.
    assert.equal(await page.locator('#cityMapPage .map-head').isVisible(), false);
    assert.equal(await page.locator('#cityMapPage [data-control="search"]').isVisible(), false);
    assert.equal(await page.locator('#cityMapPage .places .filters').isVisible(), true);
    assert.equal(await page.locator('#cityMapPage .places .filters').evaluate(
      f => f.nextElementSibling.classList.contains('list')), true);
    assert.deepEqual(await page.$$eval('#cityMapPage .filters .lab', l => l.map(x => x.textContent)),
      ['kind', 'type', 'show', 'where', 'size', 'cap', 'traffic', 'layout', 'saved'].map(k => en('map.row.' + k)));
    // The "ranked by…" line is gone; the formula lives in the ? alone.
    assert.equal(await page.locator('#cityMapPage .fnote').count(), 0);
    assert.match(await page.locator('#cityMapPage .filters .why').getAttribute('data-tip'), enRe('map.finder.why', {}, {}));
    // Seven neighbourhoods are on the map; only the two with premises get chips.
    assert.equal(await page.locator('#cityMapPage .fchip.hd').count(), 2);
    // Candidates are the only highlighted footprints.
    assert.equal(await page.locator('#cityMapPage .location.fp.cand').count(), 3);
    await page.locator(chip).click();
    assert.equal(await page.locator('#cityMapPage .map-head').isVisible(), true);
    assert.equal(await page.locator('#cityMapPage .filters').isVisible(), false);
    // The whole panel goes with it: the map has the stage to itself.
    assert.equal(await page.locator('#cityMapPage .places').isVisible(), false);
    assert.equal(await page.locator('#cityMapPage [data-stage].panel').count(), 0);
    assert.equal(await page.locator('#cityMapPage .location.fp.cand').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('rows rank by score, and a header click re-sorts them', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr .v.sc', v => v.map(x => x.textContent)), ['46', '45', '18']);
    // Each row names the neighbourhood's strongest type while "any type"
    // stands, and says so without waiting for a hover.
    const first = page.locator('#cityMapPage .place.fr').first();
    assert.match(await first.textContent(), enRe('map.list.bestfit', {type: 'Clothing Store'}, {}));
    const line = await first.locator('.nm small').evaluate(el => {
      const s = getComputedStyle(el);
      return {maxHeight: s.maxHeight, opacity: s.opacity, height: el.getBoundingClientRect().height};
    });
    assert.equal(line.maxHeight, 'none');
    assert.equal(line.opacity, '1');
    assert.ok(line.height > 8, `subtitle collapsed at ${line.height}px`);
    await page.locator('#cityMapPage .fhead [data-s="deposit"]').click();
    assert.deepEqual(await rowKeys(page), [MT[1], HK[0], MT[0]]);
    // Every column reads best-first; a second click on the same one goes back
    // to the order the category ranks by rather than turning it upside down.
    await page.locator('#cityMapPage .fhead [data-s="deposit"]').click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    assert.equal(await page.locator('#cityMapPage .fhead span.on').textContent(), en('map.col.score'));
    assert.equal(await page.locator('#cityMapPage .fhead span.up').count(), 0);
    // A click leaves no focus ring behind on the header it landed on.
    assert.equal(await page.locator('#cityMapPage .fhead [data-s="traffic"]').evaluate(h => {
      h.focus(); return getComputedStyle(h).outlineStyle; }), 'none');
    // The card in finder mode reads score, traffic and demand, and the rivals line.
    await pick(page, HK[0]);
    assert.deepEqual(await page.$$eval('#cityMapPage .site .num b', b => b.map(x => x.textContent)), ['46', '60', '77']);
    assert.equal(await page.locator('#cityMapPage .site .fit').textContent(), en('map.fit.in', {type: 'Clothing Store', hood: HK_NAME}).replace(/<[^>]*>/g, ''));
    // Two sentences, both built from the payload: what the neighbourhood wants
    // most of this category, what else it wants, and the arithmetic.
    assert.equal(await page.locator('#cityMapPage .site .why').textContent(),
      en('map.why.best.next', {type: 'Clothing Store', kind: en('map.kindw.retail'), hood: HK_NAME, d: 77, rivals: en('map.why.rivals', {n: 1, type: 'Clothing Store'}), next: 'Coffee Shop 40'}) + ' ' + en('map.why.score', {s: 46, t: 60, d: 77}));
    // With the panel open the card keeps clear of it.
    assert.equal(await page.evaluate(() => {
      const c = document.querySelector('#cityMapPage .site').getBoundingClientRect();
      const p = document.querySelector('#cityMapPage .places').getBoundingClientRect();
      return c.right <= p.left + 1;
    }), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the table shades its numbers and the rank says what taking the place means', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    // The score column carries the shading; more score, more accent behind it.
    const shades = await page.$$eval('#cityMapPage .place.fr .v.sc',
      v => v.map(x => getComputedStyle(x).backgroundColor));
    assert.equal(shades.length, 3);
    assert.equal(new Set(shades).size, 3, `scores share a shade: ${shades}`);
    const alpha = await page.$$eval('#cityMapPage .place.fr .v.sh', v => v.map(x => !!x.style.background));
    assert.equal(alpha.filter(Boolean).length, 9);   // score, traffic and demand on all three rows
    assert.equal(await page.$$eval('#cityMapPage .place.fr > :last-child',
      v => v.filter(x => x.style.background).length), 0);  // rent is never shaded
    // A dot per row: green for a vacant floor, amber for a rival to buy out.
    assert.equal(await page.locator('#cityMapPage .place.fr .rk i').count(), 3);
    assert.equal(await page.locator('#cityMapPage .place.fr.buy').count(), 0);
    const vacant = await page.locator('#cityMapPage .place.fr .rk i').first()
      .evaluate(i => getComputedStyle(i).backgroundColor);
    await page.locator('#cityMapPage .fchip.show[data-show="takeover"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#cityMapPage .place.fr').length === 2);
    assert.equal(await page.locator('#cityMapPage .place.fr.buy .rk i').count(), 2);
    const rival = await page.locator('#cityMapPage .place.fr.buy .rk i').first()
      .evaluate(i => getComputedStyle(i).backgroundColor);
    assert.notEqual(vacant, rival);
    // For-sale rows are not candidates and carry no dot.
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    await page.locator('#cityMapPage .place.fr.sale').first().waitFor();
    assert.equal(await page.locator('#cityMapPage .place.fr .rk').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a type filter re-scores every row, and a neighbourhood chip drops one', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage [data-f="type"]').selectOption(COFFEE);
    // Hell's Kitchen wants coffee far less than clothes, so Midtown leads.
    assert.deepEqual(await rowKeys(page), [MT[0], HK[0], MT[1]]);
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr .v.sc', v => v.map(x => x.textContent)), ['45', '24', '18']);
    await page.locator(`#cityMapPage .fchip.hd[data-h="${MT_HOOD}"]`).click();
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    // A minimum on traffic empties it entirely.
    await page.locator('#cityMapPage .fchip.num input[data-f="minTraffic"]').fill('70');
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), en('map.list.empty'));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the take-over list is rival businesses, named by their occupant', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.show[data-show="takeover"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#cityMapPage .place.fr').length === 2);
    assert.deepEqual(await rowKeys(page), [HK[1], HK[2]]);
    assert.match(await page.locator(`#cityMapPage .place[data-pick="${HK[1]}"]`).textContent(), /Bean There · Coffee Shop/);
    // The one clothing rival in Hell's Kitchen counts for every row but its own.
    assert.match(await page.locator(`#cityMapPage .place[data-pick="${HK[1]}"]`).textContent(), enRe('map.list.rivals', {n: 1}, {}));
    assert.match(await page.locator(`#cityMapPage .place[data-pick="${HK[2]}"]`).textContent(), enRe('map.list.rivals', {n: 0}, {}));
    await pick(page, HK[2]);
    assert.match(await page.locator('#cityMapPage .site .why').textContent(), enRe('map.why.rivals', {n: 0, type: 'Clothing Store'}, {}));
    assert.equal(await page.locator(`#cityMapPage .location.fp[data-location="${HK[1]}"]`).evaluate(p => p.classList.contains('buy')), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('an office category ranks office buildings on the office band', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.cat[data-cat="office"]').click();
    assert.deepEqual(await rowKeys(page), [HK[4]]);
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr .v.sc', v => v.map(x => x.textContent)), ['27']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('takeover prices sort cheapest first, persist in saved searches and leave rentals with deposits', async () => {
  const context = await H.browser.newContext();
  const {page, errors} = await fixture(context);
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage [data-show="takeover"]').click();
    const header = page.locator('#cityMapPage .fhead [data-s="takeoverPrice"]');
    assert.equal(await header.textContent(), en('map.col.takeoverPrice'));
    assert.equal(await page.locator('#cityMapPage .fhead [data-s="deposit"]').count(), 0);
    assert.deepEqual(await page.locator('#cityMapPage .fr-takeover-price').allTextContents(), ['$375k', '$125k']);
    await header.focus(); await page.keyboard.press('Enter');
    assert.deepEqual(await rowKeys(page), [HK[2], HK[1]]);
    await H.saveAs(page, 'Affordable takeovers');
    await page.locator('#cityMapPage [data-show="rent"]').click();
    assert.equal(await page.locator('#cityMapPage .fr-takeover-price').count(), 0);
    assert.equal(await page.locator('#cityMapPage .fhead [data-s="deposit"]').count(), 1);
    await page.locator(`${saved} [data-saved="Affordable takeovers"]`).click();
    assert.deepEqual(await rowKeys(page), [HK[2], HK[1]]);
    assert.equal(await page.evaluate(() => cityMapPage.fs.sort), 'takeoverPrice');
    const again = await fixture(context);
    try{
      await openMap(again.page); await turnOn(again.page);
      assert.equal(await again.page.evaluate(() => cityMapPage.fs.show), 'takeover');
      assert.deepEqual(await rowKeys(again.page), [HK[2], HK[1]]);
      assert.equal(await again.page.locator('#cityMapPage .fhead [data-s="takeoverPrice"].on').count(), 1);
      assert.deepEqual(again.errors, []);
    } finally { await again.page.close(); }
    await pick(page, HK[1]);
    assert.ok((await facts(page)).includes(en('map.col.takeoverPrice') + '$375,000'));
    const note = page.locator('#cityMapPage .site .facts > [data-tip]');
    assert.equal(await note.getAttribute('tabindex'), '0');
    await note.focus();
    assert.equal(await page.locator('#tip').textContent(), en('map.takeover.estimate') + ' ' + en('map.takeover.estimate.offer'));
    assert.deepEqual(errors, []);
  } finally { await page.close(); await context.close(); }
});

for(const [show, cost] of [['takeover', 'takeoverPrice'], ['rent', 'deposit']]){
  test(`${show} cost order survives sale listings, saved searches and a reload`, async () => {
    const context = await H.browser.newContext();
    const {page, errors} = await fixture(context);
    try{
      await openMap(page); await turnOn(page);
      await page.locator(`#cityMapPage [data-show="${show}"]`).click();
      await page.locator(`#cityMapPage .fhead [data-s="${cost}"]`).click();
      const ranked = await rowKeys(page);
      await page.locator('#cityMapPage [data-show="sale"]').click();
      assert.equal(await page.evaluate(() => cityMapPage.fs.sort), cost);
      await page.locator('#cityMapPage .fhead [data-s="payback"]').click();
      await H.saveAs(page, 'Sale prices');
      await page.locator(`#cityMapPage [data-show="${show}"]`).click();
      assert.deepEqual(await rowKeys(page), ranked);
      assert.equal(await page.locator(`#cityMapPage .fhead [data-s="${cost}"].on`).count(), 1);
      await page.locator(`${saved} [data-saved="Sale prices"]`).click();
      assert.equal(await page.evaluate(() => cityMapPage.fs.sort), cost);
      const again = await fixture(context);
      try{
        await openMap(again.page); await turnOn(again.page);
        assert.equal(await again.page.evaluate(() => cityMapPage.fs.show), 'sale');
        assert.equal(await again.page.evaluate(() => cityMapPage.fs.saleSort), 'payback');
        await again.page.locator(`#cityMapPage [data-show="${show}"]`).click();
        assert.deepEqual(await rowKeys(again.page), ranked);
        assert.equal(await again.page.locator(`#cityMapPage .fhead [data-s="${cost}"].on`).count(), 1);
        assert.deepEqual(again.errors, []);
      } finally { await again.page.close(); }
      assert.deepEqual(errors, []);
    } finally { await page.close(); await context.close(); }
  });
}

test('unknown takeover prices sort last and remain distinct from zero and building asking prices', async () => {
  const buildings = PREMISES.buildings.map(b => b.key === HK[1] ? {...b, takeoverPrice: null}
    : b.key === HK[2] ? {...b, takeoverPrice: 0} : b);
  const {page, errors} = await fixture(null, {premises: {...PREMISES, buildings}});
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage [data-show="takeover"]').click();
    await page.locator('#cityMapPage .fhead [data-s="takeoverPrice"]').click();
    assert.deepEqual(await rowKeys(page), [HK[2], HK[1]]);
    assert.deepEqual(await page.locator('#cityMapPage .fr-takeover-price').allTextContents(), ['$0', '—']);
    assert.equal(await page.locator(`#cityMapPage [data-pick="${HK[1]}"] .fr-takeover-price`).getAttribute('data-tip'), en('map.takeover.unknown'));
    await page.locator('#cityMapPage [data-show="sale"]').click();
    assert.equal(await page.locator('#cityMapPage .fhead [data-s="price"]').count(), 1);
    assert.equal(await page.locator('#cityMapPage .fr-takeover-price').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('takeover price stays visible on a phone and formats billion-dollar valuations', async () => {
  const buildings = PREMISES.buildings.map(b => b.key === HK[1] ? {...b, takeoverPrice: 5584228352} : b);
  const {page, errors} = await fixture(null, {premises: {...PREMISES, buildings}});
  try{
    await page.setViewportSize({width:390, height:844});
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage [data-show="takeover"]').click();
    const header = page.locator('#cityMapPage .fhead [data-s="takeoverPrice"]');
    await header.scrollIntoViewIfNeeded();
    assert.equal(await header.isVisible(), true);
    const price = page.locator(`#cityMapPage [data-pick="${HK[1]}"] .fr-takeover-price`);
    assert.equal(await price.textContent(), '$5.58bn');
    assert.equal(await price.isVisible(), true);
    assert.ok(await price.evaluate(el => el.getBoundingClientRect().right <= innerWidth));
    assert.ok(await header.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    for(const width of [390, 700, 1440]){
      await page.setViewportSize({width, height:844});
      for(const lang of UI_LANGS){
        const table = lang === 'en' ? null
          : JSON.parse(fs.readFileSync(path.join(root, `web/i18n/${lang}.json`), 'utf8'));
        await page.evaluate(({lang, table}) => {
          ttSetTable(lang, table); cityMapPage.update();
        }, {lang, table});
        assert.ok(await price.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${lang} at ${width}: currency fits its column`);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('rival warehouses explain that the game has no takeover valuation for them', async () => {
  const buildings = PREMISES.buildings.map(b => b.key === HK[1]
    ? {...b, type:'warehouse', takeoverPrice:null} : b);
  const {page, errors} = await fixture(null, {premises:{...PREMISES, buildings}});
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage [data-show="takeover"]').click();
    await page.locator('#cityMapPage .fchip.cat[data-cat="warehouse"]').click();
    assert.equal(await page.locator('#cityMapPage .fr-takeover-price').textContent(), '—');
    assert.equal(await page.locator('#cityMapPage .fr-takeover-price').getAttribute('data-tip'), en('map.takeover.unsupported'));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('for sale is a plain list, cheapest first, and the neighbourhood chips still apply', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    await page.locator('#cityMapPage .place.fr.sale').first().waitFor();
    // Kind still applies: the theater on the list is not a retail building.
    assert.deepEqual(await rowKeys(page), [HK[0], MT[2]]);
    assert.equal(await page.locator('#cityMapPage .fchip.show[data-show="sale"] b').textContent(), '2');
    assert.equal(await page.locator('#cityMapPage .fhead.sale').count(), 1);
    assert.equal(await page.locator('#cityMapPage .place.fr.sale .v.sc').count(), 0);  // never scored
    assert.equal(await page.locator('#cityMapPage .fhead.sale span.on').textContent(), en('map.col.price'));
    assert.equal(await page.locator('#cityMapPage .fhead.sale span').count(), 6);
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr.sale .v.pb', v => v.map(x => x.textContent)), ['—', en('map.payback.days', {n: '1,778'})]);
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr.sale > :nth-child(5)', v => v.map(x => x.textContent)),
      ['$750k', '$4.20M']);
    // A price past a billion says so rather than counting in thousands of millions.
    await page.locator('#cityMapPage .fchip.cat[data-cat="theater"]').click();
    assert.deepEqual(await rowKeys(page), [MT[3]]);
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr.sale > :nth-child(5)', v => v.map(x => x.textContent)),
      ['$5.58bn']);
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    // A listing lights its own footprint, green rather than buy-out amber, and
    // clicking either one opens its card.
    assert.equal(await page.locator('#cityMapPage .location.fp.cand').count(), 2);
    assert.equal(await page.locator('#cityMapPage .location.fp.buy').count(), 0);
    await pick(page, MT[2]);
    assert.equal(await page.locator('#cityMapPage .site h3').textContent(), at(MT[2]).address);
    await page.locator(`#cityMapPage .fchip.hd[data-h="${MT_HOOD}"]`).click();
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    assert.equal(await page.locator('#cityMapPage .location.fp.cand').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the filters come back with the character; the switch lasts only the session', async () => {
  const context = await H.browser.newContext();
  const {page} = await fixture(context);
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.cat[data-cat="office"]').click();
    await page.locator('#cityMapPage .fchip.num input[data-f="minCap"]').fill('5');
    await page.locator('#cityMapPage .fchip.num input[data-f="maxCap"]').fill('60');
    await page.locator('#cityMapPage .fchip.num input[data-f="maxM2"]').fill('300');
    await page.locator(`#cityMapPage .fchip.hd[data-h="${MT_HOOD}"]`).click();
    const {page: again} = await fixture(context);
    try{
      // A new load opens the plain map, however the last session left the switch.
      await openMap(again);
      assert.equal(await again.locator('#cityMapPage .filters').isVisible(), false);
      assert.equal(await again.locator('#cityMapPage .map-head').isVisible(), true);
      assert.equal(await again.locator(chip).getAttribute('aria-pressed'), 'false');
      // Every filter, though, is where it was left.
      await again.locator(chip).click();
      await again.locator('#cityMapPage .place.fr').first().waitFor();
      assert.equal(await again.locator('#cityMapPage .filters').isVisible(), true);
      assert.equal(await again.locator('#cityMapPage .fchip.cat.on').textContent(), en('map.kind.office'));
      assert.equal(await again.locator('#cityMapPage .fchip.num input[data-f="minCap"]').inputValue(), '5');
      assert.equal(await again.locator('#cityMapPage .fchip.num input[data-f="maxCap"]').inputValue(), '60');
      assert.equal(await again.locator('#cityMapPage .fchip.num input[data-f="maxM2"]').inputValue(), '300');
      // A minimum that is set shows as set, like any other chosen control.
      assert.equal(await again.locator('#cityMapPage .fchip.num.on input[data-f="minCap"]').count(), 1);
      assert.equal(await again.locator(`#cityMapPage .fchip.hd[data-h="${MT_HOOD}"]`).evaluate(c => c.classList.contains('on')), false);
      assert.equal(await again.locator(`#cityMapPage .fchip.hd[data-h="${HK_HOOD}"]`).evaluate(c => c.classList.contains('on')), true);
      // A different character starts from the defaults, never another company's.
      await again.evaluate(() => { D.meta.character = 'finder-b'; refreshCityMaps(); });
      assert.equal(await again.locator('#cityMapPage .filters').isVisible(), false);
      assert.equal(await again.locator('#cityMapPage .map-head').isVisible(), true);
      await again.locator(chip).click();
      await again.locator('#cityMapPage .place.fr').first().waitFor();
      assert.equal(await again.locator('#cityMapPage .fchip.cat.on').textContent(), en('map.kind.retail'));
      assert.equal(await again.locator('#cityMapPage .fchip.num input[data-f="minCap"]').inputValue(), '0');
      assert.equal(await again.locator('#cityMapPage .fchip.num input[data-f="maxCap"]').inputValue(), '0');
      assert.equal(await again.locator('#cityMapPage .fchip.num input[data-f="maxM2"]').inputValue(), '0');
    } finally { await again.close(); }
  } finally { await page.close(); await context.close(); }
});

test('the finder stays as the player left it across pages', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    assert.equal(await page.locator('#cityMapPage .filters').isVisible(), true);
    // Away and back: the list is still up, so the player does not ask twice.
    await page.evaluate(() => { showPage('today'); showPage('supply'); showPage('map'); });
    assert.equal(await page.locator('#cityMapPage .filters').isVisible(), true);
    assert.equal(await page.locator(chip).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#cityMapPage .map-head').isVisible(), false);
    assert.ok((await rowKeys(page)).length > 0);
    // Switched off, the plain map is what comes back.
    await page.locator(chip).click();
    await page.evaluate(() => { showPage('today'); showPage('map'); });
    assert.equal(await page.locator('#cityMapPage .filters').isVisible(), false);
    assert.equal(await page.locator(chip).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#cityMapPage .map-head').isVisible(), true);
    // The two entry points still open it on.
    await page.evaluate(() => { showPage('today'); drawFindLocation(); wireCards(); });
    await page.locator('#findLocationCard').click();
    await page.locator('#cityMapPage .place.fr').first().waitFor();
    assert.equal(await page.locator('#cityMapPage .filters').isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the Today card counts the vacant retail units and names the best-trafficked one', async () => {
  const {page, errors} = await fixture();
  try{
    await page.evaluate(() => { drawFindLocation(); wireCards(); });
    assert.equal(await page.locator('#findLocationCard .soon').textContent(), en('today.moves.find.badge', {n: 3}));
    assert.equal(await page.locator('#findLocationCard .what').textContent(),
      en('today.moves.find.what', {n: 3, address: at(HK[0]).address, hood: HK_NAME, traffic: 60}));
    await page.locator('#findLocationCard').click();
    await page.locator('#cityMapPage .place.fr').first().waitFor();
    assert.equal(await page.evaluate(() => page), 'map');
    assert.equal(await page.locator('#cityMapPage .fchip.cat.on').textContent(), en('map.kind.retail'));
    assert.equal(await page.locator('#cityMapPage [data-f="type"]').inputValue(), '');
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a board built before premises keeps the card and the plain map', async () => {
  const {page, errors} = await fixture(null, {premises: null});
  try{
    await page.evaluate(() => { drawFindLocation(); wireCards(); });
    assert.equal(await page.locator('#findLocationCard .soon').textContent(), en('today.moves.soon'));
    assert.doesNotMatch(await page.locator('#findLocationCard .what').textContent(), /\d/);
    await openMap(page);
    assert.equal(await page.locator(chip).count(), 0);
    assert.equal(await page.locator('#cityMapPage .layers.moff, #cityMapPage .layers').first().isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('both ends of the door cap judge a theatre by its own layout', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    const cap = end => page.locator(`#cityMapPage .fchip.num input[data-f="${end}Cap"]`);
    await page.locator('#cityMapPage .fchip.cat[data-cat="theater"]').click();
    assert.deepEqual(await rowKeys(page), [HK[5], MT[3]]);
    // The R1's 200 and the R3's 150 both clear a minimum of 150; only the
    // R1 clears 175.
    await cap('min').fill('150');
    assert.equal(await page.locator('#cityMapPage .place.fr').count(), 2);
    await cap('min').fill('175');
    assert.deepEqual(await rowKeys(page), [HK[5]]);
    // The maximum mirrors it: the R3 fits under 170, neither under 140.
    await cap('min').fill('0');
    await cap('max').fill('170');
    assert.deepEqual(await rowKeys(page), [MT[3]]);
    await cap('max').fill('140');
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), en('map.list.empty'));
    // A plain cap is judged as itself: the 40-seat shop is out above 30.
    await cap('max').fill('0');
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    await cap('max').fill('30');
    assert.deepEqual(await rowKeys(page), [HK[0], MT[1]]);   // MT[0] seats 40
    // Empty is no limit, and both ends can bracket a size at once.
    await cap('max').fill('');
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    await cap('min').fill('20');
    await cap('max').fill('35');
    assert.deepEqual(await rowKeys(page), [HK[0]]);          // 30, between 20 and 35
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a row with nothing to sort on stays at the bottom whichever way the column points', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.cat[data-cat="theater"]').click();
    // Midtown has no theater demand and no rent estimate: unscored, unpriced.
    assert.deepEqual(await rowKeys(page), [HK[5], MT[3]]);
    await page.locator('#cityMapPage .fhead [data-s="deposit"]').click();
    assert.deepEqual(await rowKeys(page), [HK[5], MT[3]]);
    await page.locator('#cityMapPage .fhead [data-s="deposit"]').click();   // back to the default
    assert.deepEqual(await rowKeys(page), [HK[5], MT[3]]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a preset lands on the column its category ranks by, not on the last sort', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fhead [data-s="deposit"]').click();
    assert.equal(await page.locator('#cityMapPage .fhead span.on').textContent(), en('map.col.upfront'));
    // A stale buy-out-only view with a minimum on it would contradict the count
    // the card advertises, so the preset clears both.
    await page.locator('#cityMapPage .fchip.show[data-show="takeover"]').click();
    await page.locator('#cityMapPage .fchip.num input[data-f="minTraffic"]').fill('75');
    await page.locator('#cityMapPage .fchip.num input[data-f="maxCap"]').fill('12');
    await page.locator('#cityMapPage .fchip.num input[data-f="minM2"]').fill('250');
    await page.evaluate(() => { cityMapPage.showAll = true; showPage('today'); drawFindLocation(); wireCards(); });
    await page.locator('#findLocationCard').click();
    await page.waitForFunction(() => document.querySelector('#cityMapPage .fhead span.on')?.textContent === 'Score');
    assert.equal(await page.evaluate(() => cityMapPage.showAll), false);  // the +N expansion does not survive a preset
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    assert.equal(await page.locator('#cityMapPage .fhead span.on.up').count(), 0);  // highest first
    assert.equal(await page.locator('#cityMapPage .fchip.show.on').textContent(), en('map.show.available') + '3');
    assert.equal(await page.locator('#cityMapPage .fchip.num input[data-f="minTraffic"]').inputValue(), '0');
    assert.equal(await page.locator('#cityMapPage .fchip.num input[data-f="maxCap"]').inputValue(), '0');
    assert.equal(await page.locator('#cityMapPage .fchip.num input[data-f="minM2"]').inputValue(), '0');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("a rival's own text is text, in the list and on the card", async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.show[data-show="takeover"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#cityMapPage .place.fr').length === 2);
    const row = page.locator(`#cityMapPage .place[data-pick="${HK[2]}"]`);
    assert.match(await row.textContent(), /<img src=x onerror=window\.__x=1> · Clothing Store/);
    assert.equal(await row.locator('img').count(), 0);
    await pick(page, HK[2]);
    assert.equal(await page.locator('#cityMapPage .site .st').textContent(),
      en('map.status.rival', {name: '<img src=x onerror=window.__x=1>', type: 'Clothing Store'}));
    assert.equal(await page.locator('#cityMapPage .site img').count(), 0);
    assert.equal(await page.evaluate(() => window.__x), undefined);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the money column is what signing costs, with the rent behind it', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    assert.equal(await page.locator('#cityMapPage .fhead [data-s="deposit"]').textContent(), en('map.col.upfront'));
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr .dep', v => v.map(x => x.textContent)),
      ['$840', '$1,800', '$360']);
    assert.equal(await page.locator(`#cityMapPage .place[data-pick="${HK[0]}"] .dep`).getAttribute('data-tip'),
      'Estimated deposit, about 63 days of rent; est. rent $140/day.');
    await page.locator('#cityMapPage .fhead [data-s="deposit"]').click();
    assert.deepEqual(await rowKeys(page), [MT[1], HK[0], MT[0]]);
    assert.match(await page.locator('#cityMapPage .filters .why').getAttribute('data-tip'),
      new RegExp(enRe('map.rent.check', {n: 3, p: 0.3}).source + ' ' + enRe('map.rent.deposits', {n: 6, p: 0.4}).source));
    // No lease of your own, nothing to check it against.
    await page.evaluate(() => { D.premises.rent.check = {leases: 0, worst: 0}; refreshCityMaps(); });
    assert.match(await page.locator('#cityMapPage .filters .why').getAttribute('data-tip'),
      enRe('map.rent.nocheck', {}, {}));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a payload with no deposits says so rather than inventing one', async () => {
  const bare = {...PREMISES, buildings: PREMISES.buildings.map(b => ({...b, deposit: undefined})),
    rent: {...PREMISES.rent, deposit: undefined}};
  const {page, errors} = await fixture(null, {premises: bare});
  try{
    await openMap(page); await turnOn(page);
    assert.deepEqual([...new Set(await page.$$eval('#cityMapPage .place.fr .dep', v => v.map(x => x.textContent)))], ['—']);
    assert.equal(await page.locator(`#cityMapPage .place[data-pick="${HK[0]}"] .dep`).getAttribute('data-tip'),
      en('map.deposit.none'));
    await pick(page, HK[0]);
    assert.deepEqual((await facts(page)).slice(-1), [en('map.fact.deposit') + '—']);
    assert.doesNotMatch(await page.locator('#cityMapPage .filters .why').getAttribute('data-tip'), enRe('map.rent.deposits', {}, {}));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('on a phone the address keeps its room and capacity is visible in the row', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.setViewportSize({width: 375, height: 800});
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#cityMapPage .places')).position === 'static');
    const shown = await page.$$eval('#cityMapPage .fhead:not(.sale) span',
      s => s.filter(x => x.offsetParent !== null).map(x => x.textContent));
    assert.deepEqual(shown, ['#', '', 'Address', 'Score', 'Upfront']);
    const nm = await page.locator(`#cityMapPage .place.fr .nm`).first().boundingBox();
    assert.ok(nm.width > 120, `address column starved at ${nm.width}px`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
    const capacity = page.locator(`#cityMapPage .place[data-pick="${HK[0]}"] .fr-phone-fact`);
    assert.equal(await capacity.innerText(), en('map.fr.phone.cap', {n: '30'}));
    assert.equal(await capacity.isVisible(), true);
    const columns = await page.evaluate(() => {
      const head = [...document.querySelectorAll('#cityMapPage .fhead > span')].filter(e => e.offsetParent);
      const row = [...document.querySelector('#cityMapPage .place.fr').children].filter(e => e.offsetParent);
      return head.map((e, i) => Math.abs(e.getBoundingClientRect().right - row[i].getBoundingClientRect().right));
    });
    assert.ok(columns.every(delta => delta < 1), `header alignment: ${columns}`);
    await page.setViewportSize({width: 1440, height: 1000});
    assert.equal(await capacity.isVisible(), false);
    assert.equal(await page.locator('#cityMapPage .fhead [data-s="cap"]').isVisible(), true);
    await page.locator('#cityMapPage .fhead [data-s="cap"]').click();
    assert.equal(await page.locator('#cityMapPage .fhead [data-s="cap"]').getAttribute('class'), 'on');
    await page.setViewportSize({width: 375, height: 800});
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#cityMapPage .places')).position === 'static');
    // The panel flows under the map rather than floating over it.
    assert.equal(await page.locator('#cityMapPage .places').evaluate(e => getComputedStyle(e).position), 'static');
    // The card is still the place every number lives.
    await pick(page, HK[0]);
    assert.deepEqual(await page.$$eval('#cityMapPage .site .num b', b => b.map(x => x.textContent)), ['46', '60', '77']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the Show row is one choice, and picking one drops the others', async () => {
  const {page, errors} = await fixture();
  const chosen = () => page.locator('#cityMapPage .fchip.show.on');
  try{
    await openMap(page); await turnOn(page);
    assert.deepEqual(await page.$$eval('#cityMapPage .fchip.show', c => c.map(x => x.textContent)),
      [en('map.show.available') + '3', en('map.show.takeover') + '2', 'For sale2']);
    assert.equal(await chosen().count(), 1);
    assert.match(await chosen().textContent(), enRe('map.show.available', {}, {anchor: 'start'}));
    await page.locator('#cityMapPage .fchip.show[data-show="takeover"]').click();
    assert.equal(await chosen().count(), 1);
    assert.match(await chosen().textContent(), enRe('map.show.takeover', {}, {anchor: 'start'}));
    assert.deepEqual(await rowKeys(page), [HK[1], HK[2]]);   // rivals only, no vacancies
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    assert.equal(await chosen().count(), 1);
    assert.equal(await page.locator('#cityMapPage .fhead.sale').count(), 1);
    // Clicking the chosen one again leaves it chosen: one list is always open.
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    assert.equal(await chosen().count(), 1);
    assert.match(await chosen().textContent(), enRe('map.show.sale', {}, {anchor: 'start'}));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a state saved when availability was two switches opens the list it was reading', async () => {
  const context = await H.browser.newContext();
  const {page} = await fixture(context);
  try{
    await page.evaluate(() => localStorage.setItem('ba_finder_v1:finder-a',
      JSON.stringify({cat: 'retail', type: '', vac: false, buy: true, sale: false, hoods: null,
        minCap: 0, maxCap: 0, minTraffic: 0, sort: 'score', dir: -1})));
    const {page: again} = await fixture(context);
    try{
      await openMap(again); await turnOn(again);
      assert.match(await again.locator('#cityMapPage .fchip.show.on').textContent(), enRe('map.show.takeover', {}, {anchor: 'start'}));
      assert.deepEqual(await again.$$eval('#cityMapPage .place.fr', r => r.map(x => x.dataset.pick)), [HK[1], HK[2]]);
      // The old keys do not travel on into the next save.
      const kept = await again.evaluate(() => JSON.parse(localStorage.getItem('ba_finder_v1:finder-a')));
      assert.equal(kept.show, 'takeover');
      assert.deepEqual([kept.vac, kept.buy, kept.sale, kept.on], [undefined, undefined, undefined, undefined]);
    } finally { await again.close(); }
  } finally { await page.close(); await context.close(); }
});

test('a sort saved before picks were recorded counts as picked unless it is the default', async () => {
  const context = await H.browser.newContext();
  const {page} = await fixture(context);
  const save = state => page.evaluate(s => localStorage.setItem('ba_finder_v1:finder-a', JSON.stringify(s)), state);
  try{
    for(const [sort, back] of [['m2', 'm²'], ['score', 'Score']]){
      await save({cat: 'retail', type: '', show: 'rent', hoods: null, sort});
      const {page: again, errors} = await fixture(context);
      const sorted = () => again.locator('#cityMapPage .fhead span.on').textContent();
      try{
        await openMap(again); await turnOn(again);
        // Through the warehouses and back: a picked m² survives it, the
        // shops' own score comes back as itself.
        await again.locator('#cityMapPage .fchip.cat[data-cat="warehouse"]').click();
        assert.equal(await sorted(), 'm²');
        await again.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
        assert.equal(await sorted(), back);
        assert.deepEqual(errors, []);
      } finally { await again.close(); }
    }
  } finally { await page.close(); await context.close(); }
});

test("a game service is occupied by the game: never to rent, never to take over", async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    // It out-traffics every candidate, and still never appears in either list.
    assert.equal((await rowKeys(page)).includes(MT[4]), false);
    await page.locator('#cityMapPage .fchip.show[data-show="takeover"]').click();
    assert.equal((await rowKeys(page)).includes(MT[4]), false);
    assert.equal(await page.locator(`#cityMapPage .location.fp[data-location="${MT[4]}"]`)
      .evaluate(p => p.classList.contains('cand')), false);
    // Its card says what it is, in the grey of a place you cannot have.
    await page.evaluate(key => cityMapPage.select(key), MT[4]);
    await page.locator('#cityMapPage .site.in').waitFor();
    assert.equal(await page.locator('#cityMapPage .site .st').textContent(), en('map.status.service', {name: 'First City Bank', type: 'Bank'}));
    assert.equal(await page.locator('#cityMapPage .site .st').evaluate(s => s.className), 'st na');
    assert.equal(await page.locator('#cityMapPage .site .fit').isVisible(), false);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the Cap column sits between m² and Upfront and sorts on what it can promise', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    assert.deepEqual(await page.$$eval('#cityMapPage .fhead span', h => h.map(x => x.textContent)),
      ['#', '', en('map.col.address'), en('map.col.score'), en('map.col.traffic'), en('map.col.demand'), en('map.unit.m2'), en('map.col.cap'), en('map.col.upfront')]);
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr .cap', v => v.map(x => x.textContent)),
      ['30', '40', '15']);
    await page.locator('#cityMapPage .fhead [data-s="cap"]').click();
    assert.deepEqual(await rowKeys(page), [MT[0], HK[0], MT[1]]);   // 40, 30, 15
    await page.locator('#cityMapPage .fhead [data-s="cap"]').click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);   // back to score
    // A theatre shows its own layout's one number, never a range.
    await page.locator('#cityMapPage .fchip.cat[data-cat="theater"]').click();
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr .cap', v => v.map(x => x.textContent)),
      ['200', '150']);
    // A cinema shows its own layout's one number.
    await page.locator('#cityMapPage .fchip.cat[data-cat="cinema"]').click();
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr .cap', v => v.map(x => x.textContent)),
      ['100']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('floor area is a column that sorts, and a filter on every list', async () => {
  const {page, errors} = await fixture();
  const m2 = end => page.locator(`#cityMapPage .fchip.num input[data-f="${end}M2"]`);
  try{
    await openMap(page); await turnOn(page);
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr .m2', v => v.map(x => x.textContent)),
      ['225', '285', '120']);
    // Shown plain, like the cap: a bigger floor is not a better one for every business.
    assert.equal(await page.$$eval('#cityMapPage .place.fr .m2', v => v.filter(x => x.style.background).length), 0);
    await page.locator('#cityMapPage .fhead [data-s="m2"]').click();
    assert.deepEqual(await rowKeys(page), [MT[0], HK[0], MT[1]]);   // 285, 225, 120
    await page.locator('#cityMapPage .fhead [data-s="m2"]').click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);   // back to score
    // Either end alone, or both bracketing a size; empty is no limit.
    await m2('min').fill('200');
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0]]);
    await m2('max').fill('250');
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    assert.equal(await page.locator('#cityMapPage .fchip.num.on input[data-f="maxM2"]').count(), 1);
    await m2('min').fill('');
    assert.deepEqual(await rowKeys(page), [HK[0], MT[1]]);
    await m2('max').fill('0');
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    // With a type chosen the columns already carry the area and the cap, so
    // the second line names the neighbourhood instead of repeating them.
    await page.locator('#cityMapPage [data-f="type"]').selectOption(COFFEE);
    assert.equal(await page.locator(`#cityMapPage .place[data-pick="${HK[0]}"] small`).textContent(), `${HK_NAME} \u00b7 ${en('map.list.rivals', {n: 1})}`);
    // A listing is judged on its own floor area.
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    await page.locator('#cityMapPage .place.fr.sale').first().waitFor();
    await m2('min').fill('500');
    assert.deepEqual(await rowKeys(page), [MT[2]]);   // 1,000 m²; the 225 m² shop is out
    await m2('min').fill('0');
    await m2('max').fill('500');
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('phone finder facts fit warehouse, factory planning and sale rows', async () => {
  const WH = geometry.buildings.find(b => b.hood === 'Midtown' && ![...HK, ...MT].includes(b.key)).key;
  const premises = {...PREMISES, buildings: [...PREMISES.buildings,
    site(WH, {type: 'warehouse', size: 'E', m2: 1887, cap: null, rent: 140, traffic: 30})]};
  const {page, errors} = await fixture(null, {premises});
  const fits = async root => {
    const metrics = await page.locator(root).evaluate(host => {
      const head = [...host.querySelector('.fhead').children].filter(e => e.offsetParent);
      const row = [...host.querySelector('.place.fr').children].filter(e => e.offsetParent);
      return {address: host.querySelector('.place.fr .nm').getBoundingClientRect().width,
        aligned: head.length === row.length && head.every((e, i) =>
          Math.abs(e.getBoundingClientRect().right - row[i].getBoundingClientRect().right) < 1)};
    });
    assert.ok(metrics.address > 120, `address room: ${metrics.address}`);
    assert.ok(metrics.aligned, 'header and rows align');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
  };
  try{
    await openMap(page); await turnOn(page);
    await page.setViewportSize({width: 375, height: 800});
    await page.locator('#cityMapPage .fchip.cat[data-cat="theater"]').click();
    assert.equal(await page.locator('#cityMapPage .place.fr .fr-phone-fact').first().innerText(), en('map.fr.phone.cap', {n: '200'}));
    await fits('#cityMapPage');
    await page.locator('#cityMapPage .fchip.cat[data-cat="warehouse"]').click();
    assert.equal(await page.locator('#cityMapPage .place.fr.wh .fr-phone-fact').count(), 0);
    await fits('#cityMapPage');
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    assert.equal(await page.locator(`#cityMapPage .place.fr.sale[data-pick="${HK[0]}"] .fr-phone-fact`).innerText(), en('map.fr.phone.cap', {n: '30'}));
    await fits('#cityMapPage');
    await page.evaluate(async () => {
      const host = document.createElement('div'); host.id = 'factoryPhone';
      document.getElementById('cityMapPage').appendChild(host);
      window.__factoryPhone = new CityMapView(host, {plan: {preset: {cat: 'warehouse', hoods: null}}});
      await window.__factoryPhone.ready;
    });
    await page.locator('#factoryPhone .place.fr.wh.fpw').first().waitFor();
    assert.equal(await page.locator('#factoryPhone .fr-phone-fact').innerText(), en('map.fr.phone.rent', {n: '$140'}));
    await fits('#factoryPhone');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('phone finder facts use a complete translated line in every language', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page);
    for(const lang of UI_LANGS.filter(l => l !== 'en')){
      const table = JSON.parse(fs.readFileSync(path.join(root, `web/i18n/${lang}.json`)));
      assert.ok(table['map.fr.phone.cap'], `${lang}: capacity line shipped`);
      assert.ok(table['map.fr.phone.rent'], `${lang}: rent line shipped`);
      const lines = await page.evaluate(({lang, table}) => {
        ttSetTable(lang, table);
        return [cityMapPage.finderPhoneFact({cap: 200}),
          cityMapPage.finderPhoneFact({rent: 140}, true),
          cityMapPage.finderPhoneFact({rent: null}, true)];
      }, {lang, table});
      for(const [i, key, n] of [[0, 'map.fr.phone.cap', '200'], [1, 'map.fr.phone.rent', '$140'], [2, 'map.fr.phone.rent', '—']]){
        // The line is HTML-escaped: Italian's "dell'edificio" reads dell&#39;edificio.
        const line = table[key].replace('{n}', n).replace(/[&<>"']/g, c =>
          ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
        assert.equal(lines[i], `<span class="fr-phone-fact">${line}</span>`, lang);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a warehouse ranks by floor area and has no second m² column', async () => {
  const WH = geometry.buildings.find(b => b.hood === 'Midtown' && ![...HK, ...MT].includes(b.key)).key;
  const premises = {...PREMISES, buildings: [...PREMISES.buildings,
    site(WH, {type: 'warehouse', size: 'E', m2: 1887, cap: null, traffic: 30})]};
  const {page, errors} = await fixture(null, {premises});
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.cat[data-cat="warehouse"]').click();
    assert.deepEqual(await rowKeys(page), [WH]);
    assert.deepEqual(await page.$$eval('#cityMapPage .fhead.wh span', h => h.map(x => x.textContent)),
      ['#', '', en('map.col.address'), en('map.unit.m2'), en('map.col.traffic'), '', en('map.col.cap'), en('map.col.upfront')]);
    assert.equal(await page.locator('#cityMapPage .place.fr.wh').count(), 1);
    assert.equal(await page.locator('#cityMapPage .place.fr .m2').count(), 0);
    assert.equal(await page.locator('#cityMapPage .place.fr small').textContent(), 'Midtown');
    await page.locator('#cityMapPage .fchip.num input[data-f="maxM2"]').fill('1000');
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), en('map.list.empty'));
    await page.locator('#cityMapPage .fchip.num input[data-f="maxM2"]').fill('0');
    // Its floor-area order is its own default: the shops go back to their score.
    const sorted = () => page.locator('#cityMapPage .fhead span.on').textContent();
    assert.equal(await sorted(), 'm²');
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    assert.equal(await sorted(), en('map.col.score'));
    // A column the player chose, though, travels between categories.
    await page.locator('#cityMapPage .fhead [data-s="traffic"]').click();
    await page.locator('#cityMapPage .fchip.cat[data-cat="warehouse"]').click();
    assert.equal(await sorted(), en('map.col.traffic'));
    // Even m², which is the warehouse's own default: chosen in the shops, it
    // survives a pass through the warehouses and back.
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    await page.locator('#cityMapPage .fhead [data-s="m2"]').click();
    await page.locator('#cityMapPage .fchip.cat[data-cat="warehouse"]').click();
    assert.equal(await sorted(), 'm²');
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    assert.equal(await sorted(), 'm²');
    // A second click hands the order back to the category, and then it is the
    // category's again wherever the player goes.
    await page.locator('#cityMapPage .fhead [data-s="m2"]').click();
    assert.equal(await sorted(), en('map.col.score'));
    await page.locator('#cityMapPage .fchip.cat[data-cat="warehouse"]').click();
    assert.equal(await sorted(), 'm²');
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    assert.equal(await sorted(), en('map.col.score'));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the card says who owns the place and who trades from it', async () => {
  const {page, errors} = await fixture();
  const row = label => page.locator(`#cityMapPage .site .facts .wide`).filter({hasText: label});
  try{
    await openMap(page);
    // A rival company the save has not named yet: the number, and why it is a number.
    await page.evaluate(key => cityMapPage.select(key), HK[1]);
    await page.waitForFunction(text => document.querySelector('#cityMapPage .site .facts').textContent.includes(text), en('map.fact.owner'));
    assert.equal(await row(en('map.fact.owner')).textContent(), en('map.fact.owner', {}) + en('map.rival.co.n', {n: 7}));
    assert.equal(await row(en('map.fact.renter')).textContent(), en('map.fact.renter', {}) + en('map.renter.rival', {name: 'Bean There', type: 'Coffee Shop', company: en('map.rival.co.inline.n', {n: 3})}));
    assert.match(await page.locator('#cityMapPage .site .facts [data-tip]').first().getAttribute('data-tip'),
      enRe('map.rival.tip', {}, {}));
    // One it has named: the name, and no number to explain.
    await page.evaluate(key => cityMapPage.select(key), HK[2]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts').textContent.includes('Amanda Mason'));
    assert.equal(await row(en('map.fact.owner')).textContent(), en('map.fact.owner', {}) + 'Amanda Mason');
    assert.equal(await row(en('map.fact.renter')).textContent(),
      en('map.fact.renter', {}) + en('map.renter.rival', {name: '<img src=x onerror=window.__x=1>', type: 'Clothing Store', company: 'Amanda Mason'}));
    assert.equal(await row(en('map.fact.owner')).locator('[data-tip]').count(), 0);
    assert.equal(await row(en('map.fact.renter')).locator('[data-tip]').count(), 0);
    assert.equal(await page.locator('#cityMapPage .site img').count(), 0);
    assert.equal(await page.evaluate(() => window.__x), undefined);
    // The game's own, and your own.
    await page.evaluate(key => cityMapPage.select(key), MT[4]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts').textContent.includes('First City Bank'));
    assert.equal(await row(en('map.fact.owner')).textContent(), en('map.fact.owner', {}) + en('map.owner.city', {}));
    assert.equal(await row(en('map.fact.renter')).textContent(), en('map.fact.renter', {}) + en('map.renter.service', {name: 'First City Bank', type: 'Bank'}));
    await page.evaluate(key => cityMapPage.select(key), MT[5]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts').textContent.includes('HART. Gym'));
    assert.equal(await row(en('map.fact.owner')).textContent(), en('map.fact.owner', {}) + en('map.owner.you', {}));
    assert.equal(await row(en('map.fact.renter')).textContent(), en('map.fact.renter', {}) + en('map.renter.mine', {name: 'HART. Gym'}));
    // Once the save carries the business, its name is a way to its own page.
    await page.evaluate(key => {
      D.businesses = [{key, name: 'HART. Gym', address: '5 Test Street', status: 'retail', type: 'Gym'}];
      refreshCityMaps(); cityMapPage.select(key);
    }, MT[5]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts a.ss-sl'));
    assert.equal(await row(en('map.fact.renter')).locator('a.ss-sl').getAttribute('href'), '#site/broadwaystreet-5');
    assert.equal(await row(en('map.fact.renter')).textContent(), en('map.fact.renter', {}) + en('map.renter.mine', {name: 'HART. Gym'}));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a take-over row names the company behind the business when the save knows it', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.show[data-show="takeover"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#cityMapPage .place.fr').length === 2);
    assert.match(await page.locator(`#cityMapPage .place[data-pick="${HK[2]}"] small`).textContent(),
      /· Clothing Store · Amanda Mason ·/);
    // The unnamed one keeps its business and type alone, with no number to read.
    const unnamed = await page.locator(`#cityMapPage .place[data-pick="${HK[1]}"] small`).textContent();
    assert.match(unnamed, /^Bean There · Coffee Shop ·/);
    assert.doesNotMatch(unnamed, enRe('map.rival.co.inline', {}, {}));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('choosing a type says where that type ranks in the neighbourhood', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage [data-f="type"]').selectOption(COFFEE);
    await pick(page, HK[0]);
    assert.equal(await page.locator('#cityMapPage .site .fit').textContent(), en('map.fit.in', {type: 'Coffee Shop', hood: HK_NAME}).replace(/<[^>]*>/g, ''));
    // Coffee is the weaker of the two retail readings Hell's Kitchen carries.
    assert.equal(await page.locator('#cityMapPage .site .why').textContent(),
      en('map.why.type', {type: 'Coffee Shop', hood: HK_NAME, d: 40, rank: en('map.why.rank', {r: 2, n: 2, kind: en('map.kindw.retail')}), rivals: en('map.why.rivals', {n: 1, type: 'Coffee Shop'})}) + ' ' + en('map.why.score', {s: 24, t: 60, d: 40}));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('an occupied building names its occupant even when nobody can take it', async () => {
  const {page, errors} = await fixture();
  const row = label => page.locator('#cityMapPage .site .facts .wide').filter({hasText: label});
  try{
    await openMap(page);
    await page.evaluate(key => cityMapPage.select(key), MT[6]);
    await page.waitForFunction(text => document.querySelector('#cityMapPage .site .facts').textContent.includes(text), en('map.fact.owner'));
    assert.equal(await page.locator('#cityMapPage .site .st').textContent(), en('map.status.na'));
    assert.equal(await row(en('map.fact.renter')).textContent(), en('map.fact.renter', {}) + 'St Jude Hospital \u00b7 Hospital');
    // An empty one really is nobody's.
    await page.evaluate(key => cityMapPage.select(key), HK[0]);
    await page.waitForFunction(text => document.querySelector('#cityMapPage .site .facts').textContent.includes(text), en('map.renter.none'));
    assert.equal(await row(en('map.fact.renter')).textContent(), en('map.fact.renter', {}) + en('map.renter.none', {}));
    // A home you rent has no business in it, but it is not nobody's either.
    await page.evaluate(key => cityMapPage.select(key), MT[5]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts').textContent.includes('HART. Gym'));
    assert.equal(await row(en('map.fact.renter')).textContent(), en('map.fact.renter', {}) + en('map.renter.mine', {name: 'HART. Gym'}));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the for-sale list answers to the filters still on screen', async () => {
  const {page, errors} = await fixture();
  const cap = end => page.locator(`#cityMapPage .fchip.num input[data-f="${end}Cap"]`);
  try{
    await openMap(page); await turnOn(page);
    // A business type means nothing when you are buying the building itself.
    assert.equal(await page.locator('#cityMapPage .frow.ftype').isVisible(), true);
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    await page.locator('#cityMapPage .place.fr.sale').first().waitFor();
    assert.equal(await page.locator('#cityMapPage .frow.ftype').isVisible(), false);
    assert.deepEqual(await rowKeys(page), [HK[0], MT[2]]);
    // Traffic drops the quieter address; 60 stays, 85 does not exist here.
    await page.locator('#cityMapPage .fchip.num input[data-f="minTraffic"]').fill('70');
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), en('map.list.empty'));
    await page.locator('#cityMapPage .fchip.num input[data-f="minTraffic"]').fill('50');
    assert.deepEqual(await rowKeys(page), [HK[0]]);   // MT[2] has no building row to read
    await page.locator('#cityMapPage .fchip.num input[data-f="minTraffic"]').fill('0');
    // The door cap reads the building behind the listing, both ends.
    await cap('min').fill('30');
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    await cap('max').fill('20');
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), en('map.list.empty'));
    await cap('min').fill('0'); await cap('max').fill('0');
    assert.deepEqual(await rowKeys(page), [HK[0], MT[2]]);
    // Leaving the view brings the type picker back.
    await page.locator('#cityMapPage .fchip.show[data-show="rent"]').click();
    assert.equal(await page.locator('#cityMapPage .frow.ftype').isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a column header sorts from the keyboard as well as the mouse', async () => {
  const {page, errors} = await fixture();
  const head = k => page.locator(`#cityMapPage .fhead [data-s="${k}"]`);
  const sorted = () => page.locator('#cityMapPage .fhead span.on').textContent();
  try{
    await openMap(page); await turnOn(page);
    assert.equal(await sorted(), en('map.col.score'));
    await head('traffic').focus();
    await page.keyboard.press('Enter');
    assert.equal(await sorted(), en('map.col.traffic'));
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    // Space is the other key a button answers to, and the page does not scroll.
    await head('deposit').focus();
    await page.keyboard.press(' ');
    assert.equal(await sorted(), en('map.col.upfront'));
    assert.deepEqual(await rowKeys(page), [MT[1], HK[0], MT[0]]);
    // A second press on the same header goes back to the default, as a click does.
    await head('deposit').focus();
    await page.keyboard.press('Enter');
    assert.equal(await sorted(), en('map.col.score'));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
