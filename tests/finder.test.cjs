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
const MT = ['ba:street_broadwaystreet#10', 'ba:street_broadwaystreet#11', 'ba:street_broadwaystreet#13', 'ba:street_broadwaystreet#3', 'ba:street_broadwaystreet#4', 'ba:street_broadwaystreet#5', 'ba:street_broadwaystreet#6'];
const CLOTHES = 'ba:businesstype_clothingstore', COFFEE = 'ba:businesstype_coffeeshop', LAW = 'ba:businesstype_lawfirm';
const CINEMA = 'ba:businesstype_cinema';
/* A business name is the player's or a rival's own text, so one of them is markup. */
const HOSTILE = '<img src=x onerror=window.__x=1>';
const HK_NAME = "Hell's Kitchen";
/* The payload names a neighbourhood by the game's key; the exported map data
   by its English name, which is the key's id with the spaces and marks put in. */
const hoodKey = name => `ba:neighborhood_${name.toLowerCase().replace(/[^a-z]/g, '')}`;
const HK_HOOD = hoodKey(HK_NAME), MT_HOOD = hoodKey('Midtown');

/* The deposit is what signing costs on the day; it follows the rent unless a
   row names its own, and a building with no rent estimate has none either. */
const site = (key, over) => {
  const b = {key, address: at(key).address, hood: hoodKey(at(key).hood), type: 'retail',
    size: 'C', m2: 225, traffic: 50, cap: 30, rent: 100, status: 'vacant', occupant: null, ...over};
  return {deposit: b.rent == null ? null : b.rent * 6, ...b};
};
/* Six buildings: three vacant shops, a rival coffee shop worth buying out, a
   rival clothing store that only exists to be counted, a flat and an office. */
const PREMISES = {
  buildings: [
    site(HK[0], {traffic: 60, rent: 140, owner: 'city'}),                                    // score 46 on clothing 77
    site(MT[0], {traffic: 50, m2: 285, cap: 40, rent: 300}),                  // score 45 on coffee 90
    site(MT[1], {traffic: 20, m2: 120, cap: 15, rent: 60}),                   // score 18
    site(HK[1], {traffic: 80, rent: 180, status: 'rival', owner: 'rival', ownerRival: 7, occupantRival: 3,
      occupant: {name: 'Bean There', type: 'Coffee Shop', typeSlug: COFFEE}}), // score 62 on clothing 77
    // Company 9 has opened a business, so the save knows what it is called.
    site(HK[2], {status: 'rival', owner: 'rival', ownerRival: 9, occupantRival: 9,
      occupant: {name: HOSTILE, type: 'Clothing Store', typeSlug: CLOTHES}}),
    site(HK[3], {type: 'residential', size: 'B', m2: 90, cap: null, rent: null, status: 'unavailable'}),
    // A bank is occupied by the game itself: never to rent, never to take over.
    site(MT[4], {traffic: 95, status: 'service', owner: 'city',
      occupant: {name: 'First City Bank', type: 'Bank', typeSlug: 'ba:businesstype_bank'}}),
    site(HK[4], {type: 'office', size: 'J', m2: 180, cap: 10, rent: 90, traffic: 45}), // score 27 on law 60
    // Two cinemas: a size letter whose auditoriums differ carries a range, and
    // Midtown has no cinema reading at all, so that row can never be scored.
    site(HK[5], {type: 'cinema', size: 'S', m2: 1200, cap: [100, 150], rent: 900, traffic: 64}),
    site(MT[3], {type: 'cinema', size: 'S', m2: 1200, cap: [100, 150], rent: null, traffic: 70}),
    // One of yours, in a building you bought.
    // A hospital: occupied, named, and never available whoever asks.
    site(MT[6], {type: 'special', size: 'M', m2: 2000, cap: null, rent: null, traffic: 40,
      status: 'unavailable', owner: 'city',
      occupant: {name: 'St Jude Hospital', type: 'Hospital', typeSlug: 'ba:businesstype_hospital'}}),
    site(MT[5], {status: 'mine', owner: 'you',
      occupant: {name: 'HART. Gym', type: 'Gym', typeSlug: 'ba:businesstype_gym'}}),
  ],
  forSale: [
    {key: MT[2], address: at(MT[2]).address, hood: MT_HOOD, type: 'retail', size: 'M', m2: 1000, price: 4200000},
    // A tower on a mature save runs past a billion.
    {key: MT[3], address: at(MT[3]).address, hood: MT_HOOD, type: 'cinema', size: 'S', m2: 1200, price: 5584228352},
    {key: HK[0], address: at(HK[0]).address, hood: HK_HOOD, type: 'retail', size: 'C', m2: 225, price: 750000},
  ],
  demand: {
    [HK_HOOD]: [
      {slug: CLOTHES, type: 'Clothing Store', demand: 77, providers: 2, mine: false, category: 'retail'},
      {slug: COFFEE, type: 'Coffee Shop', demand: 40, providers: 1, mine: false, category: 'retail'},
      {slug: LAW, type: 'Law Firm', demand: 60, providers: 0, mine: false, category: 'office'},
      {slug: CINEMA, type: 'Cinema', demand: 50, providers: 0, mine: false, category: 'cinema'},
    ],
    [MT_HOOD]: [
      {slug: CLOTHES, type: 'Clothing Store', demand: 50, providers: 3, mine: false, category: 'retail'},
      {slug: COFFEE, type: 'Coffee Shop', demand: 90, providers: 1, mine: false, category: 'retail'},
    ],
  },
  rivals: 12,
  rivalNames: {9: 'Amanda Mason'},
  rent: {constant: 30, rates: {}, officeFactor: 1.033, check: {leases: 3, worst: 0.003},
    deposit: {factors: {lease: 62.84, warehouse: 93.61}, check: {deposits: 6, worst: 0.004}}},
  caps: {retail: {C: 30, D: 40, M: 75}, office: {J: 10}, cinema: {S: [100, 150]}, theater: {R: [150, 200]}},
};
const MARKET = {
  hoods: [HK_HOOD, MT_HOOD], rows: [], trendDays: 0, movers: [], hype: [], noOffices: [], catalogue: {},
  types: [{type: 'Clothing Store', slug: CLOTHES, products: 2, mine: false, peak: 77, cells: [
    {hood: HK_HOOD, demand: 77, count: 2, providers: 2, sell: 0, here: false},
    {hood: MT_HOOD, demand: 50, count: 2, providers: 3, sell: 0, here: false}]}],
  offices: [{type: 'Law Firm', slug: LAW, fees: ['Legal advice'], mine: false, peak: 60, cells: [
    {hood: HK_HOOD, demand: 60, providers: 0, hype: null, delta: null, here: false}, null]}],
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
      '/maps/map-background.svg': ['map-background.svg', 'image/svg+xml'],
      '/maps/floor-plans.json': ['floor-plans.json', 'application/json']};
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
  require('./_payload_contract.cjs').assertPayloadShape(await page.evaluate(() => D), 'finder');
  return {page, errors};
}
async function openMap(page){
  await page.evaluate(() => showPage('map'));
  await page.locator('#cityMapPage .map-canvas').waitFor();
  await page.waitForFunction(() => document.querySelector('#cityMapPage .map-canvas')?.getAttribute('viewBox'));
}
const chip = '#cityMapPage .fswitch .ibtn';
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
    assert.deepEqual(await facts(page),
      ['OwnerThe city', 'RenterNobody', 'Retail C225 m²', 'Foot traffic60', 'Building capacity30',
       'Est. rent / day$140', 'Deposit$840']);
    assert.equal(await page.locator('#cityMapPage .site .fit').isVisible(), false);
    // A rival's building names the business and its type.
    await page.evaluate(key => cityMapPage.select(key), HK[1]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .st').textContent.startsWith('Rival'));
    assert.equal(await page.locator('#cityMapPage .site .st').textContent(), 'Rival: Bean There · Coffee Shop');
    // A flat is neither vacant nor rentable, and carries no rent estimate.
    await page.evaluate(key => cityMapPage.select(key), HK[3]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .st').textContent === 'Residential');
    assert.deepEqual(await facts(page),
      ['Owner—', 'RenterNobody', 'Residential B90 m²', 'Foot traffic50', 'Building capacity—',
       'Est. rent / day—', 'Deposit—']);
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
    assert.equal((await page.locator(`${chip} > span:not(.feature-new)`).innerText()).trim(), 'Find a location');
    assert.equal(await page.getByRole('button', {name: 'Find a location', exact: true}).count(), 1);
    assert.equal(await page.locator(chip).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#cityMapPage .map-head').isVisible(), true);
    assert.equal(await page.locator('#cityMapPage .filters').isVisible(), false);
    assert.equal(await page.locator('#cityMapPage .places').isVisible(), false);
    await turnOn(page);
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
      ['Kind', 'Type', 'Show', 'Where', 'Size', 'Capacity', 'Traffic', 'Layout', 'Saved']);
    // The "ranked by…" line is gone; the formula lives in the ? alone.
    assert.equal(await page.locator('#cityMapPage .fnote').count(), 0);
    assert.match(await page.locator('#cityMapPage .filters .why').getAttribute('data-tip'), /÷ 100/);
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

test('the defaults are visibly chosen on first open, and nothing is ever dimmed', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    const state = await page.$$eval('#cityMapPage .filters .fchip', chips =>
      chips.map(c => ({what: c.dataset.cat || c.dataset.show || c.dataset.h || c.querySelector('input')?.dataset.f,
        on: c.classList.contains('on'), opacity: getComputedStyle(c).opacity})));
    const on = state.filter(s => s.on).map(s => s.what).sort();
    assert.deepEqual(on, [HK_HOOD, MT_HOOD, 'rent', 'retail'].sort());
    // "Any type" is the default, so the type picker reads as unchosen.
    assert.equal(await page.locator('#cityMapPage .fsel.on').count(), 0);
    assert.equal(await page.locator('#cityMapPage .fsel select').inputValue(), '');
    // Outlined is "not chosen", filled is "chosen"; no control is ever faded.
    assert.deepEqual([...new Set(state.map(s => s.opacity))], ['1']);
    assert.deepEqual([...new Set(await page.$$eval('#cityMapPage .filters .fchip, #cityMapPage .fsel select',
      c => c.map(x => getComputedStyle(x).borderTopWidth)))], ['1px']);
    // The picker hides the native caret and draws the board's own chevron.
    assert.equal(await page.locator('#cityMapPage .fsel select').evaluate(s => getComputedStyle(s).appearance), 'none');
    assert.equal(await page.locator('#cityMapPage .fsel .fchev svg').count(), 1);
    assert.equal(await page.locator('#cityMapPage .fsel select').evaluate(s => s.offsetHeight), 26);
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
    await page.locator('#cityMapPage .fhead [data-s="deposit"]').click();
    assert.deepEqual(await rowKeys(page), [MT[1], HK[0], MT[0]]);
    // Every column reads best-first; a second click on the same one goes back
    // to the order the category ranks by rather than turning it upside down.
    await page.locator('#cityMapPage .fhead [data-s="deposit"]').click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    assert.equal(await page.locator('#cityMapPage .fhead span.on').textContent(), 'Score');
    assert.equal(await page.locator('#cityMapPage .fhead span.up').count(), 0);
    // A click leaves no focus ring behind on the header it landed on.
    assert.equal(await page.locator('#cityMapPage .fhead [data-s="traffic"]').evaluate(h => {
      h.focus(); return getComputedStyle(h).outlineStyle; }), 'none');
    // The card in finder mode reads score, traffic and demand, and the rivals line.
    await pick(page, HK[0]);
    assert.deepEqual(await page.$$eval('#cityMapPage .site .num b', b => b.map(x => x.textContent)), ['46', '60', '77']);
    assert.equal(await page.locator('#cityMapPage .site .fit').textContent(), "Clothing Store in Hell's Kitchen");
    // Two sentences, both built from the payload: what the neighbourhood wants
    // most of this category, what else it wants, and the arithmetic.
    assert.equal(await page.locator('#cityMapPage .site .why').textContent(),
      "Clothing Store is the strongest retail demand in Hell's Kitchen at 77, with 1 rival Clothing Store there;"
      + " next: Coffee Shop 40. Score 46 = traffic 60 × demand 77 ÷ 100.");
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
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), 'Nothing matches.');
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
    assert.match(await page.locator(`#cityMapPage .place[data-pick="${HK[1]}"]`).textContent(), /· 1 rival/);
    assert.match(await page.locator(`#cityMapPage .place[data-pick="${HK[2]}"]`).textContent(), /· 0 rivals/);
    await pick(page, HK[2]);
    assert.match(await page.locator('#cityMapPage .site .why').textContent(), /with 0 rival Clothing Stores there/);
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

test('for sale is a plain list, cheapest first, and the neighbourhood chips still apply', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    await page.locator('#cityMapPage .place.fr.sale').first().waitFor();
    // Kind still applies: the cinema on the list is not a retail building.
    assert.deepEqual(await rowKeys(page), [HK[0], MT[2]]);
    assert.equal(await page.locator('#cityMapPage .fchip.show[data-show="sale"] b').textContent(), '2');
    assert.equal(await page.locator('#cityMapPage .fhead.sale').count(), 1);
    assert.equal(await page.locator('#cityMapPage .place.fr.sale .v.sc').count(), 0);  // never scored
    assert.equal(await page.locator('#cityMapPage .fhead.sale span.on').count(), 0);   // one order, no sort arrow
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr.sale > :last-child', v => v.map(x => x.textContent)),
      ['$750k', '$4.20M']);
    // A price past a billion says so rather than counting in thousands of millions.
    await page.locator('#cityMapPage .fchip.cat[data-cat="cinema"]').click();
    assert.deepEqual(await rowKeys(page), [MT[3]]);
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr.sale > :last-child', v => v.map(x => x.textContent)),
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
  const context = await browser.newContext();
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
      assert.equal(await again.locator('#cityMapPage .fchip.cat.on').textContent(), 'Office');
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
      assert.equal(await again.locator('#cityMapPage .fchip.cat.on').textContent(), 'Retail');
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

const saved = '#cityMapPage .fsaved';
const savedNames = page => page.$$eval('#cityMapPage .fsaved [data-saved]', c => c.map(x => x.textContent));
async function saveAs(page, name){
  await page.locator(`${saved} [data-f="save"]`).click();
  await page.locator(`${saved} [data-f="name"]`).fill(name);
  await page.locator(`${saved} [data-f="name"]`).press('Enter');
}

test('a saved search comes back in one click, for every character and after a reload', async () => {
  const context = await browser.newContext();
  const {page, errors} = await fixture(context);
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage .fchip.cat[data-cat="office"]').click();
    await page.locator('#cityMapPage .fchip.num input[data-f="minCap"]').fill('5');
    await page.locator(`#cityMapPage .fchip.hd[data-h="${MT_HOOD}"]`).click();
    // The name on offer says what the search looks for.
    await page.locator(`${saved} [data-f="save"]`).click();
    assert.match(await page.locator(`${saved} [data-f="name"]`).inputValue(), /^Office · /);
    await page.locator(`${saved} [data-f="name"]`).fill('Small offices');
    await page.locator(`${saved} [data-f="name"]`).press('Enter');
    assert.deepEqual(await savedNames(page), ['Small offices']);
    const mine = page.locator(`${saved} [data-saved="Small offices"]`);
    assert.equal(await mine.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.saved), 'Small offices');
    assert.match(await mine.getAttribute('data-tip'), /^Office · To rent · .+ · capacity ≥ 5 · by score$/);
    // Any change to the filters, and the chip is no longer what is on screen.
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    assert.equal(await mine.getAttribute('aria-pressed'), 'false');
    await mine.click();
    assert.equal(await page.locator('#cityMapPage .fchip.cat.on').textContent(), 'Office');
    assert.equal(await page.locator('#cityMapPage .fchip.num input[data-f="minCap"]').inputValue(), '5');
    assert.deepEqual(await rowKeys(page), [HK[4]]);
    // Another character keeps its own filters and shares the saved searches.
    await page.evaluate(() => { D.meta.character = 'finder-b'; refreshCityMaps(); });
    await turnOn(page);
    assert.equal(await page.locator('#cityMapPage .fchip.cat.on').textContent(), 'Retail');
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
  const context = await browser.newContext();
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
  const context = await browser.newContext();
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
  const context = await browser.newContext();
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
      assert.equal(await again.locator('#cityMapPage .fchip.cat.on').textContent(), 'Warehouse');
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
    assert.match(await page.locator(`${saved} [data-saved="Third"]`).getAttribute('data-tip'), /by traffic$/);
    assert.match(await page.locator(`${saved} [data-saved="First"]`).getAttribute('data-tip'), /by score$/);
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
    assert.equal(await page.locator('#cityMapPage .fchip.cat.on').textContent(), 'Office');
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

test('a search saved on the for-sale list has no sort to give and takes none away', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    // Save while reading the sale list, with the ranked lists on their own order.
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    await saveAs(page, 'On sale');
    // Now sort the ranked list by traffic and go back to the sale list: the same
    // visible filters, so the chip is lit whatever the hidden sort is.
    await page.locator('#cityMapPage .fchip.show[data-show="rent"]').click();
    await page.locator('#cityMapPage .fhead [data-s="traffic"]').click();
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    assert.equal(await page.locator(`${saved} [data-saved="On sale"]`).getAttribute('aria-pressed'), 'true');
    // Applying it changes nothing a sale list cannot show, so the sort survives.
    await page.locator(`${saved} [data-saved="On sale"]`).click();
    await page.locator('#cityMapPage .fchip.show[data-show="rent"]').click();
    assert.equal(await page.locator('#cityMapPage .fhead span.on').textContent(), 'Traffic');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('two names that differ in case alone are two searches, each saved and deleted on its own', async () => {
  const context = await browser.newContext();
  const {page} = await fixture(context);
  try{
    await page.evaluate(() => localStorage.setItem('ba_finder_saved_v1', JSON.stringify([
      {name: 'Offices', filters: {cat: 'office'}}, {name: 'offices', filters: {cat: 'cinema'}}])));
    const {page: again, errors} = await fixture(context);
    try{
      await openMap(again); await turnOn(again);
      // Each chip applies its own search, not its twin in another case.
      await again.locator(`${saved} [data-saved="offices"]`).click();
      assert.equal(await again.locator('#cityMapPage .fchip.cat.on').textContent(), 'Cinema');
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
  const context = await browser.newContext();
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
    assert.match(on.tip, /Delete one to save a new name/);
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
    const warning = () => page.locator('#tip').evaluate(t => t.classList.contains('on') && /Eight searches at most/.test(t.textContent));
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
  const context = await browser.newContext();
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
  const context = await browser.newContext();
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

test('the Today card counts the vacant retail units and names the best-trafficked one', async () => {
  const {page, errors} = await fixture();
  try{
    await page.evaluate(() => { drawFindLocation(); wireCards(); });
    assert.equal(await page.locator('#findLocationCard .soon').textContent(), '3 VACANT');
    assert.equal(await page.locator('#findLocationCard .what').textContent(),
      `3 vacant retail units right now. Best foot traffic: ${at(HK[0]).address}, Hell's Kitchen (60).`);
    await page.locator('#findLocationCard').click();
    await page.locator('#cityMapPage .place.fr').first().waitFor();
    assert.equal(await page.evaluate(() => page), 'map');
    assert.equal(await page.locator('#cityMapPage .fchip.cat.on').textContent(), 'Retail');
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
    assert.doesNotMatch(await page.locator('#findLocationCard .what').textContent(), /\d/);
    await openMap(page);
    assert.equal(await page.locator(chip).count(), 0);
    assert.equal(await page.locator('#cityMapPage .layers.moff, #cityMapPage .layers').first().isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('both ends of the door cap judge a range by its smallest variant', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    const cap = end => page.locator(`#cityMapPage .fchip.num input[data-f="${end}Cap"]`);
    await page.locator('#cityMapPage .fchip.cat[data-cat="cinema"]').click();
    assert.deepEqual(await rowKeys(page), [HK[5], MT[3]]);
    // 100 to 150 seats clears a minimum of 100 and fails one of 125.
    await cap('min').fill('100');
    assert.equal(await page.locator('#cityMapPage .place.fr').count(), 2);
    await cap('min').fill('125');
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), 'Nothing matches.');
    // The maximum mirrors it: 100 to 150 fits under 120, not under 90.
    await cap('min').fill('0');
    await cap('max').fill('120');
    assert.equal(await page.locator('#cityMapPage .place.fr').count(), 2);
    await cap('max').fill('90');
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), 'Nothing matches.');
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
    await page.locator('#cityMapPage .fchip.cat[data-cat="cinema"]').click();
    // Midtown has no cinema demand and no rent estimate: unscored, unpriced.
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
    assert.equal(await page.locator('#cityMapPage .fhead span.on').textContent(), 'Upfront');
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
    assert.equal(await page.locator('#cityMapPage .fchip.show.on').textContent(), 'To rent3');
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
      'Rival: <img src=x onerror=window.__x=1> · Clothing Store');
    assert.equal(await page.locator('#cityMapPage .site img').count(), 0);
    assert.equal(await page.evaluate(() => window.__x), undefined);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the money column is what signing costs, with the rent behind it', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    assert.equal(await page.locator('#cityMapPage .fhead [data-s="deposit"]').textContent(), 'Upfront');
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr .dep', v => v.map(x => x.textContent)),
      ['$840', '$1,800', '$360']);
    assert.equal(await page.locator(`#cityMapPage .place[data-pick="${HK[0]}"] .dep`).getAttribute('data-tip'),
      'Estimated deposit, about 63 days of rent; est. rent $140/day.');
    await page.locator('#cityMapPage .fhead [data-s="deposit"]').click();
    assert.deepEqual(await rowKeys(page), [MT[1], HK[0], MT[0]]);
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
      'No deposit estimate for this building.');
    await pick(page, HK[0]);
    assert.deepEqual((await facts(page)).slice(-1), ['Deposit—']);
    assert.doesNotMatch(await page.locator('#cityMapPage .filters .why').getAttribute('data-tip'), /Deposits matched/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the rent tooltip reports how the estimate did against your own leases', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    assert.match(await page.locator('#cityMapPage .filters .why').getAttribute('data-tip'),
      /matches your 3 current leases within 0\.3%\. Deposits matched your 6 within 0\.4%\./);
    // No lease of your own, nothing to check it against.
    await page.evaluate(() => { D.premises.rent.check = {leases: 0, worst: 0}; refreshCityMaps(); });
    assert.match(await page.locator('#cityMapPage .filters .why').getAttribute('data-tip'),
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
    assert.deepEqual(shown, ['#', '', 'Address', 'Score', 'Upfront']);
    const nm = await page.locator(`#cityMapPage .place.fr .nm`).first().boundingBox();
    assert.ok(nm.width > 120, `address column starved at ${nm.width}px`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false);
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
      ['To rent3', 'To take over2', 'For sale2']);
    assert.equal(await chosen().count(), 1);
    assert.match(await chosen().textContent(), /^To rent/);
    await page.locator('#cityMapPage .fchip.show[data-show="takeover"]').click();
    assert.equal(await chosen().count(), 1);
    assert.match(await chosen().textContent(), /^To take over/);
    assert.deepEqual(await rowKeys(page), [HK[1], HK[2]]);   // rivals only, no vacancies
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    assert.equal(await chosen().count(), 1);
    assert.equal(await page.locator('#cityMapPage .fhead.sale').count(), 1);
    // Clicking the chosen one again leaves it chosen: one list is always open.
    await page.locator('#cityMapPage .fchip.show[data-show="sale"]').click();
    assert.equal(await chosen().count(), 1);
    assert.match(await chosen().textContent(), /^For sale/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a state saved when availability was two switches opens the list it was reading', async () => {
  const context = await browser.newContext();
  const {page} = await fixture(context);
  try{
    await page.evaluate(() => localStorage.setItem('ba_finder_v1:finder-a',
      JSON.stringify({cat: 'retail', type: '', vac: false, buy: true, sale: false, hoods: null,
        minCap: 0, maxCap: 0, minTraffic: 0, sort: 'score', dir: -1})));
    const {page: again} = await fixture(context);
    try{
      await openMap(again); await turnOn(again);
      assert.match(await again.locator('#cityMapPage .fchip.show.on').textContent(), /^To take over/);
      assert.deepEqual(await again.$$eval('#cityMapPage .place.fr', r => r.map(x => x.dataset.pick)), [HK[1], HK[2]]);
      // The old keys do not travel on into the next save.
      const kept = await again.evaluate(() => JSON.parse(localStorage.getItem('ba_finder_v1:finder-a')));
      assert.equal(kept.show, 'takeover');
      assert.deepEqual([kept.vac, kept.buy, kept.sale, kept.on], [undefined, undefined, undefined, undefined]);
    } finally { await again.close(); }
  } finally { await page.close(); await context.close(); }
});

test('a sort saved before picks were recorded counts as picked unless it is the default', async () => {
  const context = await browser.newContext();
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
    assert.equal(await page.locator('#cityMapPage .site .st').textContent(), 'Game service · First City Bank · Bank');
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
      ['#', '', 'Address', 'Score', 'Traffic', 'Demand', 'm²', 'Cap', 'Upfront']);
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr .cap', v => v.map(x => x.textContent)),
      ['30', '40', '15']);
    await page.locator('#cityMapPage .fhead [data-s="cap"]').click();
    assert.deepEqual(await rowKeys(page), [MT[0], HK[0], MT[1]]);   // 40, 30, 15
    await page.locator('#cityMapPage .fhead [data-s="cap"]').click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);   // back to score
    // A range shows both ends and sorts on the lower one.
    await page.locator('#cityMapPage .fchip.cat[data-cat="cinema"]').click();
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr .cap', v => v.map(x => x.textContent)),
      ['100–150', '100–150']);
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
    assert.equal(await page.locator(`#cityMapPage .place[data-pick="${HK[0]}"] small`).textContent(), `${HK_NAME} · 1 rival`);
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
      ['#', '', 'Address', 'm²', 'Traffic', '', 'Cap', 'Upfront']);
    assert.equal(await page.locator('#cityMapPage .place.fr.wh').count(), 1);
    assert.equal(await page.locator('#cityMapPage .place.fr .m2').count(), 0);
    assert.equal(await page.locator('#cityMapPage .place.fr small').textContent(), 'Midtown');
    await page.locator('#cityMapPage .fchip.num input[data-f="maxM2"]').fill('1000');
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), 'Nothing matches.');
    await page.locator('#cityMapPage .fchip.num input[data-f="maxM2"]').fill('0');
    // Its floor-area order is its own default: the shops go back to their score.
    const sorted = () => page.locator('#cityMapPage .fhead span.on').textContent();
    assert.equal(await sorted(), 'm²');
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    assert.equal(await sorted(), 'Score');
    // A column the player chose, though, travels between categories.
    await page.locator('#cityMapPage .fhead [data-s="traffic"]').click();
    await page.locator('#cityMapPage .fchip.cat[data-cat="warehouse"]').click();
    assert.equal(await sorted(), 'Traffic');
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
    assert.equal(await sorted(), 'Score');
    await page.locator('#cityMapPage .fchip.cat[data-cat="warehouse"]').click();
    assert.equal(await sorted(), 'm²');
    await page.locator('#cityMapPage .fchip.cat[data-cat="retail"]').click();
    assert.equal(await sorted(), 'Score');
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
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts').textContent.includes('Owner'));
    assert.equal(await row('Owner').textContent(), 'OwnerRival company 7');
    assert.equal(await row('Renter').textContent(), 'RenterBean There · Coffee Shop (rival company 3)');
    assert.match(await page.locator('#cityMapPage .site .facts [data-tip]').first().getAttribute('data-tip'),
      /names a rival company once it has opened a business/);
    // One it has named: the name, and no number to explain.
    await page.evaluate(key => cityMapPage.select(key), HK[2]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts').textContent.includes('Amanda Mason'));
    assert.equal(await row('Owner').textContent(), 'OwnerAmanda Mason');
    assert.equal(await row('Renter').textContent(),
      'Renter<img src=x onerror=window.__x=1> · Clothing Store (Amanda Mason)');
    assert.equal(await page.locator('#cityMapPage .site .facts [data-tip]').count(), 0);
    assert.equal(await page.locator('#cityMapPage .site img').count(), 0);
    assert.equal(await page.evaluate(() => window.__x), undefined);
    // The game's own, and your own.
    await page.evaluate(key => cityMapPage.select(key), MT[4]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts').textContent.includes('First City Bank'));
    assert.equal(await row('Owner').textContent(), 'OwnerThe city');
    assert.equal(await row('Renter').textContent(), 'RenterFirst City Bank · Bank (game service)');
    await page.evaluate(key => cityMapPage.select(key), MT[5]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts').textContent.includes('HART. Gym'));
    assert.equal(await row('Owner').textContent(), 'OwnerYou');
    assert.equal(await row('Renter').textContent(), 'RenterHART. Gym (you)');
    // Once the save carries the business, its name is a way to its own page.
    await page.evaluate(key => {
      D.businesses = [{key, name: 'HART. Gym', address: '5 Test Street', status: 'retail', type: 'Gym'}];
      refreshCityMaps(); cityMapPage.select(key);
    }, MT[5]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts a.ss-sl'));
    assert.equal(await row('Renter').locator('a.ss-sl').getAttribute('href'), '#site/broadwaystreet-5');
    assert.equal(await row('Renter').textContent(), 'RenterHART. Gym (you)');
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
    assert.doesNotMatch(unnamed, /rival company/);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('choosing a type says where that type ranks in the neighbourhood', async () => {
  const {page, errors} = await fixture();
  try{
    await openMap(page); await turnOn(page);
    await page.locator('#cityMapPage [data-f="type"]').selectOption(COFFEE);
    await pick(page, HK[0]);
    assert.equal(await page.locator('#cityMapPage .site .fit').textContent(), "Coffee Shop in Hell's Kitchen");
    // Coffee is the weaker of the two retail readings Hell's Kitchen carries.
    assert.equal(await page.locator('#cityMapPage .site .why').textContent(),
      "Coffee Shop demand in Hell's Kitchen is 40 (2 of 2 retail types here), with 1 rival Coffee Shop"
      + " in the neighbourhood. Score 24 = traffic 60 × demand 40 ÷ 100.");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('an occupied building names its occupant even when nobody can take it', async () => {
  const {page, errors} = await fixture();
  const row = label => page.locator('#cityMapPage .site .facts .wide').filter({hasText: label});
  try{
    await openMap(page);
    await page.evaluate(key => cityMapPage.select(key), MT[6]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts').textContent.includes('Owner'));
    assert.equal(await page.locator('#cityMapPage .site .st').textContent(), 'Not for rent');
    assert.equal(await row('Renter').textContent(), 'RenterSt Jude Hospital · Hospital');
    // An empty one really is nobody's.
    await page.evaluate(key => cityMapPage.select(key), HK[0]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts').textContent.includes('Nobody'));
    assert.equal(await row('Renter').textContent(), 'RenterNobody');
    // A home you rent has no business in it, but it is not nobody's either.
    await page.evaluate(key => cityMapPage.select(key), MT[5]);
    await page.waitForFunction(() => document.querySelector('#cityMapPage .site .facts').textContent.includes('HART. Gym'));
    assert.equal(await row('Renter').textContent(), 'RenterHART. Gym (you)');
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
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), 'Nothing matches.');
    await page.locator('#cityMapPage .fchip.num input[data-f="minTraffic"]').fill('50');
    assert.deepEqual(await rowKeys(page), [HK[0]]);   // MT[2] has no building row to read
    await page.locator('#cityMapPage .fchip.num input[data-f="minTraffic"]').fill('0');
    // The door cap reads the building behind the listing, both ends.
    await cap('min').fill('30');
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    await cap('max').fill('20');
    assert.equal(await page.locator('#cityMapPage .places .empty').textContent(), 'Nothing matches.');
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
    assert.equal(await sorted(), 'Score');
    await head('traffic').focus();
    await page.keyboard.press('Enter');
    assert.equal(await sorted(), 'Traffic');
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    // Space is the other key a button answers to, and the page does not scroll.
    await head('deposit').focus();
    await page.keyboard.press(' ');
    assert.equal(await sorted(), 'Upfront');
    assert.deepEqual(await rowKeys(page), [MT[1], HK[0], MT[0]]);
    // A second press on the same header goes back to the default, as a click does.
    await head('deposit').focus();
    await page.keyboard.press('Enter');
    assert.equal(await sorted(), 'Score');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a Growth cell opens the finder on its own type and neighbourhood', async () => {
  const {page, errors} = await fixture();
  try{
    await page.evaluate(() => { showPage('growth'); drawMarket(); wireHeat(); });
    await page.locator(`#market .cell[data-slug="${CLOTHES}"][data-hood="${HK_HOOD}"]`).click();
    await page.locator('#cityMapPage .place.fr').first().waitFor();
    // The cell is on a hidden page now, so the keyboard lands on the first result.
    await page.waitForFunction(() => document.activeElement?.matches('#cityMapPage .place.fr'));
    assert.equal(await page.locator('#cityMapPage .fchip.cat.on').textContent(), 'Retail');
    assert.equal(await page.locator('#cityMapPage [data-f="type"]').inputValue(), CLOTHES);
    assert.deepEqual(await rowKeys(page), [HK[0]]);   // Midtown is switched off
    // An office row asks for office buildings instead, and the keyboard does
    // what the mouse does.
    await page.evaluate(() => showPage('growth'));
    await page.locator(`#market .cell[data-slug="${LAW}"]`).first().focus();
    await page.keyboard.press('Enter');
    await page.locator('#cityMapPage .place.fr').first().waitFor();
    assert.equal(await page.locator('#cityMapPage .fchip.cat.on').textContent(), 'Office');
    assert.deepEqual(await rowKeys(page), [HK[4]]);
    // Nothing is drawn under the grid any more.
    assert.equal(await page.locator('#cellDetail').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

/* Enough vacant shops in Hell's Kitchen that the preset's list still scrolls.
   On a wide map the list is the scroller; on a narrow one it is the whole
   panel, with the filters above the results. */
async function scrolledFinderToGrowthCell(width, scroller){
  const extra = geometry.buildings.filter(b => b.hood === HK_NAME && b.path && !HK.includes(b.key))
    .slice(0, 30).map(b => site(b.key, {traffic: 30}));
  assert.equal(extra.length, 30);
  const {page, errors} = await fixture(null, {premises: {...PREMISES, buildings: [...PREMISES.buildings, ...extra]}});
  try{
    await page.setViewportSize({width, height: 600});
    await openMap(page); await turnOn(page);
    await page.$eval(scroller, el => { el.scrollTop = el.scrollHeight; });
    const before = await page.$eval(scroller, el => el.scrollTop);
    assert.ok(before > 0, 'the panel scrolls');
    await page.evaluate(() => { showPage('growth'); drawMarket(); wireHeat(); });
    await page.locator(`#market .cell[data-slug="${CLOTHES}"][data-hood="${HK_HOOD}"]`).click();
    await page.waitForFunction(() => document.activeElement?.matches('#cityMapPage .place.fr'));
    // The panel's scroll comes to rest: the same for three frames in a row.
    await page.evaluate(() => { window.panelRest = null; });
    await page.waitForFunction(sel => {
      const y = document.querySelector(sel).scrollTop, mark = window.panelRest;
      window.panelRest = {y, frames: mark && mark.y === y ? mark.frames + 1 : 0};
      return window.panelRest.frames >= 3;
    }, scroller, {polling: 'raf'});
    assert.ok(await page.$eval(scroller, el => el.scrollTop) < before, 'the panel went back up');
    const [first, box, isFirst] = await page.evaluate(sel => {
      const el = document.activeElement.getBoundingClientRect(), panel = document.querySelector(sel).getBoundingClientRect();
      return [{top: el.top, bottom: el.bottom}, {top: Math.max(panel.top, 0), bottom: Math.min(panel.bottom, innerHeight)},
        document.activeElement === document.querySelector('#cityMapPage .place.fr')];
    }, scroller);
    assert.equal(isFirst, true);
    assert.ok(first.top >= box.top - 1 && first.bottom <= box.bottom + 1,
      `the focused first result (${first.top}-${first.bottom}) is inside the visible panel (${box.top}-${box.bottom})`);
    assert.ok(await page.locator('#cityMapPage .place.fr').count() > 10);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
}
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
    assert.match(await back.getAttribute('data-tip'), /Clothing Store in every neighbourhood, on Growth › Demand/);
    // From the product views too: the link switches the grid back to By type.
    await page.evaluate(() => showPage('growth'));
    await page.locator('#marketTools a[data-id="mine"]').click();
    assert.equal(await page.locator('#marketTools a.on').textContent(), 'What I sell');
    await page.evaluate(() => showPage('map'));
    // A live refresh repaints the card and the link keeps the focus.
    await back.focus();
    await page.evaluate(() => refreshCityMaps());
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('mf-grow')), true);
    await back.click();
    assert.equal(await page.locator('#pageGrowth').isVisible(), true);
    assert.equal(await page.evaluate(() => marketView), 'types');
    assert.equal(await page.locator('#marketTools a.on').textContent(), 'By type');
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

test('a row the demand figure leads back to clears the sticky masthead', async () => {
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
      document.getElementById('mast').getBoundingClientRect().bottom], `#market .r[data-slug="${LAW}"]`);
    assert.ok(top >= mast, `row top ${top} is under the masthead (${mast})`);
    assert.ok(await page.evaluate(() => scrollY) > 0, 'the page scrolled');
    // The focus follows, to the office row's cell that opens the finder.
    assert.equal(await page.evaluate(() => document.activeElement?.matches('#market .cell[role=button][data-r="1"]')), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

/* Floor plans (issue #70): the game's own layout for each building. The plans
   are the committed web/maps/floor-plans.json; the rows name their layout, the
   Layout filter lists by it, and a picked building shows its plan in its card. */
const PLANNED = {...PREMISES, buildings: PREMISES.buildings.map(b =>
  b.key === HK[0] ? {...b, layout: 'C1'} : b.key === HK[1] ? {...b, layout: 'C2'}
  : b.key === MT[0] ? {...b, layout: 'D2', size: 'D'} : b.key === HK[4] ? {...b, layout: 'J1'}
  : b.type === 'retail' || b.type === 'office' ? {...b, layout: null} : b)};
const tags = page => page.$$eval('#cityMapPage .place.fr', rows => rows.map(r => r.querySelector('.lp-tag')?.textContent || ''));
const layChips = page => page.$$eval('#cityMapPage .fchip.flay', c => c.map(x => `${x.textContent}${x.getAttribute('aria-pressed') === 'true' ? '*' : ''}`));
const layChip = code => `#cityMapPage .fchip.flay[data-flay="${code}"]`;
const plan = '#cityMapPage .site .lp-plan';

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
    // Cinemas have no layouts: no row for them.
    await page.locator('#cityMapPage .fchip.cat[data-cat="cinema"]').click();
    assert.equal(await page.locator('#cityMapPage .frow.flayout').isVisible(), false);
    assert.deepEqual(await tags(page), ['', '']);
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
    assert.match(await page.evaluate(() => cityMapPage.savedTip(finderSaved()[0])), /layout C1/);
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
    assert.match(await page.locator(`${plan} .lp-planhead`).textContent(), /^LayoutC11 entrance\d+ m$/);
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
    assert.doesNotMatch(await page.evaluate(() => cityMapPage.savedTip(finderSaved()[0])), /layout/);
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
