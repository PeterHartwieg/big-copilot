/* Find a location: the site card's facts, the finder mode on the map page, and
   the two entry points that switch it on. The premises payload is synthetic so
   the numbers below are the rule, not one save's readings. */
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const geometry = JSON.parse(fs.readFileSync(path.join(root, 'web/maps/locations.json')));
const at = key => geometry.buildings.find(b => b.key === key);
/* Two neighbourhoods with geometry, so a pick has a footprint to glide to. */
const HK = ['ba:street_broadwaystreet#1', 'ba:street_broadwaystreet#2', 'ba:street_firstavenue#1', 'ba:street_firstavenue#10', 'ba:street_firstavenue#11', 'ba:street_firstavenue#12'];
const MT = ['ba:street_broadwaystreet#10', 'ba:street_broadwaystreet#11', 'ba:street_broadwaystreet#13', 'ba:street_broadwaystreet#3'];
const CLOTHES = 'ba:businesstype_clothingstore', COFFEE = 'ba:businesstype_coffeeshop', LAW = 'ba:businesstype_lawfirm';
const CINEMA = 'ba:businesstype_cinema';
/* A business name is the player's or a rival's own text, so one of them is markup. */
const HOSTILE = '<img src=x onerror=window.__x=1>';

const site = (key, over) => ({key, address: at(key).address, hood: at(key).hood, type: 'retail',
  size: 'C', m2: 225, traffic: 50, cap: 30, rent: 100, status: 'vacant', occupant: null, ...over});
/* Six buildings: three vacant shops, a rival coffee shop worth buying out, a
   rival clothing store that only exists to be counted, a flat and an office. */
const PREMISES = {
  buildings: [
    site(HK[0], {traffic: 60, rent: 140}),                                    // score 46 on clothing 77
    site(MT[0], {traffic: 50, m2: 285, cap: 40, rent: 300}),                  // score 45 on coffee 90
    site(MT[1], {traffic: 20, m2: 120, cap: 15, rent: 60}),                   // score 18
    site(HK[1], {traffic: 80, rent: 180, status: 'rival',
      occupant: {name: 'Bean There', type: 'Coffee Shop', typeSlug: COFFEE}}), // score 62 on clothing 77
    site(HK[2], {status: 'rival', occupant: {name: HOSTILE, type: 'Clothing Store', typeSlug: CLOTHES}}),
    site(HK[3], {type: 'residential', size: 'B', m2: 90, cap: null, rent: null, status: 'unavailable'}),
    site(HK[4], {type: 'office', size: 'J', m2: 180, cap: 10, rent: 90, traffic: 45}), // score 27 on law 60
    // Two cinemas: a size letter whose auditoriums differ carries a range, and
    // Midtown has no cinema reading at all, so that row can never be scored.
    site(HK[5], {type: 'cinema', size: 'S', m2: 1200, cap: [100, 150], rent: 900, traffic: 64}),
    site(MT[3], {type: 'cinema', size: 'S', m2: 1200, cap: [100, 150], rent: null, traffic: 70}),
  ],
  forSale: [
    {key: MT[2], address: at(MT[2]).address, hood: 'Midtown', type: 'retail', size: 'M', m2: 1000, price: 4200000},
    {key: HK[0], address: at(HK[0]).address, hood: "Hell's Kitchen", type: 'retail', size: 'C', m2: 225, price: 750000},
  ],
  demand: {
    "Hell's Kitchen": [
      {slug: CLOTHES, type: 'Clothing Store', demand: 77, providers: 2, mine: false, category: 'retail'},
      {slug: COFFEE, type: 'Coffee Shop', demand: 40, providers: 1, mine: false, category: 'retail'},
      {slug: LAW, type: 'Law Firm', demand: 60, providers: 0, mine: false, category: 'office'},
      {slug: CINEMA, type: 'Cinema', demand: 50, providers: 0, mine: false, category: 'cinema'},
    ],
    Midtown: [
      {slug: CLOTHES, type: 'Clothing Store', demand: 50, providers: 3, mine: false, category: 'retail'},
      {slug: COFFEE, type: 'Coffee Shop', demand: 90, providers: 1, mine: false, category: 'retail'},
    ],
  },
  rent: {constant: 30, rates: {}, officeFactor: 1.033, check: {leases: 3, worst: 0.003}},
  caps: {retail: {C: 30, D: 40, M: 75}, office: {J: 10}, cinema: {S: [100, 150]}, theater: {R: [150, 200]}},
};
const MARKET = {
  hoods: ["Hell's Kitchen", 'Midtown'], rows: [], trendDays: 0, movers: [], hype: [], noOffices: [], catalogue: {},
  types: [{type: 'Clothing Store', slug: CLOTHES, products: 2, mine: false, peak: 77, cells: [
    {hood: "Hell's Kitchen", demand: 77, count: 2, providers: 2, sell: 0, here: false},
    {hood: 'Midtown', demand: 50, count: 2, providers: 3, sell: 0, here: false}]}],
  offices: [{type: 'Law Firm', slug: LAW, fees: ['Legal advice'], mine: false, peak: 60, cells: [
    {hood: "Hell's Kitchen", demand: 60, providers: 0, hype: null, delta: null, here: false}, null]}],
};

let browser, server, url, html;
before(async () => {
  const rendered = spawnSync(process.env.PYTHON || 'python',
    ['-c', 'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
    {cwd: root, maxBuffer: 4 * 1024 * 1024});
  assert.equal(rendered.status, 0, rendered.stderr.toString()); html = rendered.stdout;
  server = http.createServer((req, res) => {
    const route = req.url.split('?')[0];
    const files = {'/maps/locations.json': ['locations.json', 'application/json'],
      '/maps/map-background.svg': ['map-background.svg', 'image/svg+xml']};
    if(files[route]){ res.setHeader('Content-Type', files[route][1]); res.end(fs.readFileSync(path.join(root, 'web/maps', files[route][0]))); }
    else { res.setHeader('Content-Type', 'text/html'); res.end(html); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

/* A board with the premises payload and nothing the finder does not read. */
async function fixture(context, {premises = PREMISES, character = 'finder-a'} = {}){
  const page = await (context || browser).newPage({viewport: {width: 1440, height: 1000}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**', r => r.abort());
  await page.goto(url);
  await page.evaluate(({premises, character, market}) => {
    D = {meta: {character, day: 20, save: 'Finder'}, businesses: [], alerts: [], minor: {rows: []},
      supply: {shops: []}, daily: [], premises, market};
    refreshCityMaps();
  }, {premises, character, market: MARKET});
  return {page, errors};
}
async function openMap(page){
  await page.evaluate(() => showPage('map'));
  await page.locator('#cityMapPage .map-canvas').waitFor();
  await page.waitForFunction(() => document.querySelector('#cityMapPage .map-canvas')?.getAttribute('viewBox'));
}
const chip = '#cityMapPage .sev.fc.tog';
async function turnOn(page){
  await page.locator(chip).click();
  await page.locator('#cityMapPage .place.fr').first().waitFor();
}
async function pick(page, key){
  await page.locator(`#cityMapPage .place[data-pick="${key}"]`).click();
  await page.locator('#cityMapPage .site.in').waitFor();
}
const rowKeys = page => page.$$eval('#cityMapPage .place.fr', rows => rows.map(r => r.dataset.pick));
const facts = page => page.$$eval('#cityMapPage .site .facts span', s => s.map(x => x.textContent));

test('any address carries its facts: what it is, what it costs and whether it is free', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page);
    // A vacant shop, with the finder still off.
    await page.evaluate(key => cityMapPage.select(key), HK[0]);
    await page.locator('#cityMapPage .site.in').waitFor();
    assert.equal(await page.locator('#cityMapPage .site .st').textContent(), 'Vacant · for rent');
    assert.deepEqual(await facts(page), ['Retail C225 m²', 'Foot traffic60', 'Door cap30', 'Est. rent$140']);
    assert.equal(await page.locator('#cityMapPage .site .fit').isVisible(), false);
    // A rival's building names the business and its type.
    await page.evaluate(key => cityMapPage.select(key), HK[1]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .st').textContent.startsWith('Rival'));
    assert.equal(await page.locator('#cityMapPage .site .st').textContent(), 'Rival: Bean There · Coffee Shop');
    // A flat is neither vacant nor rentable, and carries no rent estimate.
    await page.evaluate(key => cityMapPage.select(key), HK[3]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .st').textContent === 'Residential');
    assert.deepEqual(await facts(page), ['Residential B90 m²', 'Foot traffic50', 'Door cap—', 'Est. rent—']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the chip swaps the layer chips and search for the finder filters', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page);
    assert.equal(await page.locator('#cityMapPage .layers.moff').isVisible(), true);
    assert.equal(await page.locator('#cityMapPage .seg.cat').isVisible(), false);
    assert.equal(await page.locator('#cityMapPage .frow').isVisible(), false);
    await turnOn(page);
    assert.equal(await page.locator('#cityMapPage .layers.moff').isVisible(), false);
    assert.equal(await page.locator('#cityMapPage [data-control="search"]').isVisible(), false);
    assert.equal(await page.locator('#cityMapPage .seg.cat').isVisible(), true);
    assert.equal(await page.locator('#cityMapPage .frow').isVisible(), true);
    assert.match(await page.locator('#cityMapPage .fnote').textContent(), /not by profit/);
    // Seven neighbourhoods are on the map; only the two with premises get chips.
    assert.equal(await page.locator('#cityMapPage .sev.fc.hd').count(), 2);
    // Candidates are the only highlighted footprints.
    assert.equal(await page.locator('#cityMapPage .location.fp.cand').count(), 3);
    await page.locator(chip).click();
    assert.equal(await page.locator('#cityMapPage .layers.moff').isVisible(), true);
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
    assert.match(await first.textContent(), /best fit: Clothing Store/);
    const line = await first.locator('.nm small').evaluate(el => {
      const s = getComputedStyle(el);
      return {maxHeight: s.maxHeight, opacity: s.opacity, height: el.getBoundingClientRect().height};
    });
    assert.equal(line.maxHeight, 'none');
    assert.equal(line.opacity, '1');
    assert.ok(line.height > 8, `subtitle collapsed at ${line.height}px`);
    await page.locator('#cityMapPage .fhead [data-s="rent"]').click();
    assert.deepEqual(await rowKeys(page), [MT[0], HK[0], MT[1]]);
    await page.locator('#cityMapPage .fhead [data-s="rent"]').click();  // a second click flips it
    assert.deepEqual(await rowKeys(page), [MT[1], HK[0], MT[0]]);
    // The card in finder mode reads score, traffic and demand, and the rivals line.
    await page.locator('#cityMapPage .fhead [data-s="score"]').click();
    await pick(page, HK[0]);
    assert.deepEqual(await page.$$eval('#cityMapPage .site .num b', b => b.map(x => x.textContent)), ['46', '60', '77']);
    assert.equal(await page.locator('#cityMapPage .site .fit').textContent(),
      "Clothing Store · demand 77 · 1 rival in Hell's Kitchen");
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
    await page.locator('#cityMapPage .sev.fc.hd[data-h="Midtown"]').click();
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    // A minimum on traffic empties it entirely.
    await page.locator('#cityMapPage .srch.mini input[data-f="minTraffic"]').fill('70');
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), 'Nothing matches.');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('buy-out rows join the list in their own colour and name the occupant', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .sev.fc.av[data-av="buy"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#cityMapPage .place.fr').length === 5);
    assert.deepEqual((await rowKeys(page)).slice(0, 2), [HK[1], HK[0]]);
    assert.match(await page.locator(`#cityMapPage .place[data-pick="${HK[1]}"]`).textContent(), /Bean There · Coffee Shop/);
    // The one clothing rival in Hell's Kitchen counts for every row but its own.
    assert.match(await page.locator(`#cityMapPage .place[data-pick="${HK[0]}"]`).textContent(), /· 1 rival/);
    assert.match(await page.locator(`#cityMapPage .place[data-pick="${HK[2]}"]`).textContent(), /· 0 rivals/);
    await pick(page, HK[2]);
    assert.match(await page.locator('#cityMapPage .site .fit').textContent(), /· 0 rivals in Hell's Kitchen/);
    assert.equal(await page.locator(`#cityMapPage .location.fp[data-location="${HK[1]}"]`).evaluate(p => p.classList.contains('buy')), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('an office category ranks office buildings on the office band', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .seg.cat a[data-cat="office"]').click();
    assert.deepEqual(await rowKeys(page), [HK[4]]);
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr .v.sc', v => v.map(x => x.textContent)), ['27']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('for sale is a plain list, cheapest first, and the neighbourhood chips still apply', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage [data-f="sale"]').click();
    await page.locator('#cityMapPage .place.fr.sale').first().waitFor();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[2]]);
    assert.equal(await page.locator('#cityMapPage .fhead.sale').count(), 1);
    assert.equal(await page.locator('#cityMapPage .place.fr.sale .v.sc').count(), 0);  // never scored
    assert.equal(await page.locator('#cityMapPage .fhead.sale span.on').count(), 0);   // one order, no sort arrow
    // A listing lights its own footprint, green rather than buy-out amber, and
    // clicking either one opens its card.
    assert.equal(await page.locator('#cityMapPage .location.fp.cand').count(), 2);
    assert.equal(await page.locator('#cityMapPage .location.fp.buy').count(), 0);
    await pick(page, MT[2]);
    assert.equal(await page.locator('#cityMapPage .site h3').textContent(), at(MT[2]).address);
    await page.locator('#cityMapPage .sev.fc.hd[data-h="Midtown"]').click();
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    assert.equal(await page.locator('#cityMapPage .location.fp.cand').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the chip and the filters come back with the character', async () => {
  const context = await browser.newContext();
  const {page} = await fixture(context);
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .seg.cat a[data-cat="office"]').click();
    await page.locator('#cityMapPage .srch.mini input[data-f="minCap"]').fill('5');
    await page.locator('#cityMapPage .sev.fc.hd[data-h="Midtown"]').click();
    const {page: again} = await fixture(context);
    try{
      await openMap(again);
      assert.equal(await again.locator('#cityMapPage .seg.cat').isVisible(), true);
      assert.equal(await again.locator('#cityMapPage .seg.cat a.on').textContent(), 'Office');
      assert.equal(await again.locator('#cityMapPage .srch.mini input[data-f="minCap"]').inputValue(), '5');
      assert.equal(await again.locator('#cityMapPage .sev.fc.hd[data-h="Midtown"]').evaluate(c => c.classList.contains('off')), true);
      // A different character starts from the defaults, never another company's.
      await again.evaluate(() => { D.meta.character = 'finder-b'; refreshCityMaps(); });
      assert.equal(await again.locator('#cityMapPage .seg.cat').isVisible(), false);
      assert.equal(await again.locator('#cityMapPage .layers.moff').isVisible(), true);
    } finally { await again.close(); }
  } finally { await page.close(); await context.close(); }
});

test('the Today card counts the vacant retail units and names the best-trafficked one', async () => {
  const {page, errors} = await fixture();
  try{
    await page.evaluate(() => { drawFindLocation(); wireCards(); });
    assert.equal(await page.locator('#findLocationCard .soon').textContent(), '3 VACANT');
    assert.equal(await page.locator('#findLocationCard > span:last-child').textContent(),
      `3 vacant retail units right now. Best foot traffic: ${at(HK[0]).address}, Hell's Kitchen (60).`);
    await page.locator('#findLocationCard').click();
    await page.locator('#cityMapPage .place.fr').first().waitFor();
    assert.equal(await page.evaluate(() => page), 'map');
    assert.equal(await page.locator('#cityMapPage .seg.cat a.on').textContent(), 'Retail');
    assert.equal(await page.locator('#cityMapPage [data-f="type"]').inputValue(), '');
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a board built before premises keeps the card and the plain map', async () => {
  const {page, errors} = await fixture(null, {premises: null});
  try{
    await page.evaluate(() => { drawFindLocation(); wireCards(); });
    assert.equal(await page.locator('#findLocationCard .soon').textContent(), 'SOON');
    assert.doesNotMatch(await page.locator('#findLocationCard > span:last-child').textContent(), /\d/);
    await openMap(page);
    assert.equal(await page.locator(chip).count(), 0);
    assert.equal(await page.locator('#cityMapPage .layers.moff, #cityMapPage .layers').first().isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a minimum door cap judges a range by its smallest variant', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .seg.cat a[data-cat="cinema"]').click();
    assert.deepEqual(await rowKeys(page), [HK[5], MT[3]]);
    // 100 to 150 seats clears a minimum of 100 and fails one of 125.
    await page.locator('#cityMapPage .srch.mini input[data-f="minCap"]').fill('100');
    assert.equal(await page.locator('#cityMapPage .place.fr').count(), 2);
    await page.locator('#cityMapPage .srch.mini input[data-f="minCap"]').fill('125');
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), 'Nothing matches.');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a row with nothing to sort on stays at the bottom whichever way the column points', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .seg.cat a[data-cat="cinema"]').click();
    // Midtown has no cinema demand and no rent estimate: unscored, unpriced.
    assert.deepEqual(await rowKeys(page), [HK[5], MT[3]]);
    await page.locator('#cityMapPage .fhead [data-s="score"]').click();   // flip to ascending
    assert.deepEqual(await rowKeys(page), [HK[5], MT[3]]);
    await page.locator('#cityMapPage .fhead [data-s="rent"]').click();
    assert.deepEqual(await rowKeys(page), [HK[5], MT[3]]);
    await page.locator('#cityMapPage .fhead [data-s="rent"]').click();
    assert.deepEqual(await rowKeys(page), [HK[5], MT[3]]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a preset lands on the column its category ranks by, not on the last sort', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fhead [data-s="rent"]').click();
    assert.equal(await page.locator('#cityMapPage .fhead span.on').textContent(), 'Est. rent');
    // A stale buy-out-only view with a minimum on it would contradict the count
    // the card advertises, so the preset clears both.
    await page.locator('#cityMapPage .sev.fc.av[data-av="vac"]').click();
    await page.locator('#cityMapPage .sev.fc.av[data-av="buy"]').click();
    await page.locator('#cityMapPage .srch.mini input[data-f="minTraffic"]').fill('75');
    await page.evaluate(() => { cityMapPage.showAll = true; showPage('today'); drawFindLocation(); wireCards(); });
    await page.locator('#findLocationCard').click();
    await page.waitForFunction(() => document.querySelector('#cityMapPage .fhead span.on')?.textContent === 'Score');
    assert.equal(await page.evaluate(() => cityMapPage.showAll), false);  // the +N expansion does not survive a preset
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    assert.equal(await page.locator('#cityMapPage .fhead span.on.up').count(), 0);  // highest first
    assert.equal(await page.locator('#cityMapPage .sev.fc.av[data-av="vac"]').evaluate(c => c.classList.contains('off')), false);
    assert.equal(await page.locator('#cityMapPage .sev.fc.av[data-av="buy"]').evaluate(c => c.classList.contains('off')), true);
    assert.equal(await page.locator('#cityMapPage .srch.mini input[data-f="minTraffic"]').inputValue(), '0');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("a rival's own text is text, in the list and on the card", async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .sev.fc.av[data-av="buy"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#cityMapPage .place.fr').length === 5);
    const row = page.locator(`#cityMapPage .place[data-pick="${HK[2]}"]`);
    assert.match(await row.textContent(), /<img src=x onerror=window\.__x=1> · Clothing Store/);
    assert.equal(await row.locator('img').count(), 0);
    await pick(page, HK[2]);
    assert.equal(await page.locator('#cityMapPage .site .st').textContent(),
      'Rival: <img src=x onerror=window.__x=1> · Clothing Store');
    assert.equal(await page.locator('#cityMapPage .site img').count(), 0);
    assert.equal(await page.evaluate(() => window.__x), undefined);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the rent tooltip reports how the estimate did against your own leases', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    assert.match(await page.locator('#cityMapPage .why.fonly').getAttribute('data-tip'),
      /matches your 3 current leases within 0\.3%/);
    // No lease of your own, nothing to check it against.
    await page.evaluate(() => { D.premises.rent.check = {leases: 0, worst: 0}; refreshCityMaps(); });
    assert.match(await page.locator('#cityMapPage .why.fonly').getAttribute('data-tip'),
      /no current lease to check against/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('on a phone the address keeps its room and the numbers stay on the card', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.setViewportSize({width: 360, height: 800});
    await page.waitForTimeout(300);
    const shown = await page.$$eval('#cityMapPage .fhead:not(.sale) span',
      s => s.filter(x => x.offsetParent !== null).map(x => x.textContent));
    assert.deepEqual(shown, ['#', '', 'Address', 'Score', 'Est. rent']);
    const nm = await page.locator(`#cityMapPage .place.fr .nm`).first().boundingBox();
    assert.ok(nm.width > 120, `address column starved at ${nm.width}px`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
    // The card is still the place every number lives.
    await pick(page, HK[0]);
    assert.deepEqual(await page.$$eval('#cityMapPage .site .num b', b => b.map(x => x.textContent)), ['46', '60', '77']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a Growth cell opens the finder on its own type and neighbourhood', async () => {
  const {page, errors} = await fixture();
  try{
    await page.evaluate(() => { showPage('growth'); drawMarket(); wireHeat(); });
    await page.locator(`#market .cell[data-slug="${CLOTHES}"][data-hood="Hell\\'s Kitchen"]`).click();
    assert.match(await page.locator('#cellDetail').textContent(), /find premises/);
    await page.locator('#cellDetail .link.pin').click();
    await page.locator('#cityMapPage .place.fr').first().waitFor();
    assert.equal(await page.locator('#cityMapPage .seg.cat a.on').textContent(), 'Retail');
    assert.equal(await page.locator('#cityMapPage [data-f="type"]').inputValue(), CLOTHES);
    assert.deepEqual(await rowKeys(page), [HK[0]]);   // Midtown is switched off
    // An office row asks for office buildings instead.
    await page.evaluate(() => showPage('growth'));
    await page.locator(`#market .cell[data-slug="${LAW}"]`).click();
    await page.locator('#cellDetail .link.pin').click();
    await page.locator('#cityMapPage .place.fr').first().waitFor();
    assert.equal(await page.locator('#cityMapPage .seg.cat a.on').textContent(), 'Office');
    assert.deepEqual(await rowKeys(page), [HK[4]]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
