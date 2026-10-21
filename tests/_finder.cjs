/* Shared setup for the finder suites (tests/finder*.test.cjs, not finder_plan):
   the synthetic premises payload, the served board, the browser and the page
   helpers. Each suite that requires it gets its own server and browser. Not a
   test file itself: the leading underscore keeps it out of the tests/*.test.cjs
   glob. */
const {before, after} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
const {boardHtml, launch, abortExternal, collectErrors} = require('./_page.cjs');
const root = path.join(__dirname, '..');
const geometry = JSON.parse(fs.readFileSync(path.join(root, 'web/maps/locations.json')));
const at = key => geometry.buildings.find(b => b.key === key);
/* Two neighbourhoods with geometry, so a pick has a footprint to glide to. */
const HK = ['ba:street_broadwaystreet#1', 'ba:street_broadwaystreet#2', 'ba:street_firstavenue#1', 'ba:street_firstavenue#10', 'ba:street_firstavenue#11', 'ba:street_firstavenue#12'];
const MT = ['ba:street_broadwaystreet#10', 'ba:street_broadwaystreet#11', 'ba:street_broadwaystreet#13', 'ba:street_broadwaystreet#3', 'ba:street_broadwaystreet#4', 'ba:street_broadwaystreet#5', 'ba:street_broadwaystreet#6'];
const CLOTHES = 'ba:businesstype_clothingstore', COFFEE = 'ba:businesstype_coffeeshop', LAW = 'ba:businesstype_lawfirm';
const THEATER = 'ba:businesstype_theater';
const CINEMA_AT = 'ba:street_thirdavenue#15';
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
    // Two theaters, each reading its own layout's number (an R1 200, an R3
    // 150; issue #159), and Midtown has no theater reading at all, so that row
    // can never be scored.
    site(HK[5], {type: 'theater', size: 'R', m2: 1200, cap: 200, rent: 900, traffic: 64}),
    site(MT[3], {type: 'theater', size: 'R', m2: 1200, cap: 150, rent: null, traffic: 70}),
    // A cinema reads its own layout's number, never a range (15 Third Avenue, S3).
    site(CINEMA_AT, {type: 'cinema', size: 'S', m2: 1200, cap: 100, rent: 800, traffic: 55}),
    // One of yours, in a building you bought.
    // A hospital: occupied, named, and never available whoever asks.
    site(MT[6], {type: 'special', size: 'M', m2: 2000, cap: null, rent: null, traffic: 40,
      status: 'unavailable', owner: 'city',
      occupant: {name: 'St Jude Hospital', type: 'Hospital', typeSlug: 'ba:businesstype_hospital'}}),
    site(MT[5], {status: 'mine', owner: 'you',
      occupant: {name: 'HART. Gym', type: 'Gym', typeSlug: 'ba:businesstype_gym'}}),
  ],
  forSale: [
    {key: MT[2], address: at(MT[2]).address, hood: MT_HOOD, type: 'retail', size: 'M', m2: 1000, price: 4200000, payback: 1778},
    // A tower on a mature save runs past a billion.
    {key: MT[3], address: at(MT[3]).address, hood: MT_HOOD, type: 'theater', size: 'R', m2: 1200, price: 5584228352, payback: 1826},
    {key: HK[0], address: at(HK[0]).address, hood: HK_HOOD, type: 'retail', size: 'C', m2: 225, price: 750000, payback: null},
  ],
  demand: {
    [HK_HOOD]: [
      {slug: CLOTHES, type: 'Clothing Store', demand: 77, providers: 2, mine: false, category: 'retail'},
      {slug: COFFEE, type: 'Coffee Shop', demand: 40, providers: 1, mine: false, category: 'retail'},
      {slug: LAW, type: 'Law Firm', demand: 60, providers: 0, mine: false, category: 'office'},
      {slug: THEATER, type: 'Theater', demand: 50, providers: 0, mine: false, category: 'theater'},
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
  caps: {retail: {C: 30, D: 40, M: 75}, office: {J: 10}, cinema: {S1: 150, S2: 125, S3: 100}, theater: {R1: 200, R2: 175, R3: 150}},
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
  html = Buffer.from(boardHtml());
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
  browser = await launch();
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

/* A board with the premises payload and nothing the finder does not read. */
async function fixture(context, {premises = PREMISES, character = 'finder-a'} = {}){
  const page = await (context || browser).newPage({viewport: {width: 1440, height: 1000}});
  const errors = collectErrors(page);
  await abortExternal(page);
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

const saved = '#cityMapPage .fsaved';
const savedNames = page => page.$$eval('#cityMapPage .fsaved [data-saved]', c => c.map(x => x.textContent));
async function saveAs(page, name){
  await page.locator(`${saved} [data-f="save"]`).click();
  await page.locator(`${saved} [data-f="name"]`).fill(name);
  await page.locator(`${saved} [data-f="name"]`).press('Enter');
}

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
    await page.locator('#demCellPop [data-dem-go="find"]').click();
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

/* Floor plans (issue #70): the game's own layout for each building. The plans
   are the committed web/maps/floor-plans.json; the rows name their layout, the
   Layout filter lists by it, and a picked building shows its plan in its card. */
const PLANNED = {...PREMISES, buildings: PREMISES.buildings.map(b =>
  b.key === HK[0] ? {...b, layout: 'C1'} : b.key === HK[1] ? {...b, layout: 'C2'}
  : b.key === MT[0] ? {...b, layout: 'D2', size: 'D'} : b.key === HK[4] ? {...b, layout: 'J1'}
  : b.key === HK[5] ? {...b, layout: 'R1'} : b.key === MT[3] ? {...b, layout: 'R3'}
  : b.key === CINEMA_AT ? {...b, layout: 'S3'}
  : b.type === 'retail' || b.type === 'office' ? {...b, layout: null} : b)};
const tags = page => page.$$eval('#cityMapPage .place.fr', rows => rows.map(r => r.querySelector('.lp-tag')?.textContent || ''));
const layoutToggle = '#cityMapPage [data-f="layouts"]';
const layoutOption = code => `#mapLayoutPop [data-flay="${code}"]`;
async function openLayouts(page){
  if(await page.locator(layoutToggle).getAttribute('aria-expanded') !== 'true') await page.locator(layoutToggle).click();
}
async function layoutOptions(page){
  await openLayouts(page);
  return page.$$eval('#mapLayoutPop [data-flay]', cs => cs.map(c => `${c.dataset.flay}${c.getAttribute('aria-pressed') === 'true' ? '*' : ''}`));
}
async function pickLayout(page, code){
  await openLayouts(page);
  await page.locator(layoutOption(code)).click();
}
const plan = '#cityMapPage .site .lp-plan';

module.exports = {assert, en, enRe, fs, path, http, spawnSync, chromium, root, geometry, at, HK, MT, CLOTHES, COFFEE, LAW, THEATER, CINEMA_AT, HOSTILE, HK_NAME, hoodKey, HK_HOOD, MT_HOOD, site, PREMISES, MARKET, fixture, openMap, chip, turnOn, pick, rowKeys, facts, saved, savedNames, saveAs, scrolledFinderToGrowthCell, PLANNED, tags, layoutToggle, layoutOption, openLayouts, layoutOptions, pickLayout, plan,
  get browser(){ return browser; },
  get server(){ return server; },
  get url(){ return url; },
  get html(){ return html; },
};
