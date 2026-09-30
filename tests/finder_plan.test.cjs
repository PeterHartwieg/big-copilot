/* The finder embedded in a plan (Expansion › Open a store, step 2 "Where"):
   CityMapView with options.plan. It is always on, fixed to the plan's type,
   lists premises to rent, stores nothing, leaves the history entry alone, and
   its card hands the picked building to the plan. The City map page's own
   finder never notices it. The premises payload is synthetic. */
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
const HK = ['ba:street_broadwaystreet#1', 'ba:street_broadwaystreet#2', 'ba:street_firstavenue#1', 'ba:street_firstavenue#10', 'ba:street_firstavenue#11'];
const MT = ['ba:street_broadwaystreet#10', 'ba:street_broadwaystreet#11', 'ba:street_broadwaystreet#13'];
const CLOTHES = 'ba:businesstype_clothingstore', COFFEE = 'ba:businesstype_coffeeshop', LAW = 'ba:businesstype_lawfirm';
const hoodKey = name => `ba:neighborhood_${name.toLowerCase().replace(/[^a-z]/g, '')}`;
const HK_HOOD = hoodKey("Hell's Kitchen"), MT_HOOD = hoodKey('Midtown');
const site = (key, over) => {
  const b = {key, address: at(key).address, hood: hoodKey(at(key).hood), type: 'retail',
    size: 'C', m2: 225, traffic: 50, cap: 30, rent: 100, status: 'vacant', occupant: null, ...over};
  return {deposit: b.rent == null ? null : b.rent * 6, ...b};
};
/* Three vacant shops, a rival, one of yours and a vacant office. */
const PREMISES = {
  buildings: [
    site(HK[0], {traffic: 60, rent: 140, owner: 'city'}),   // clothing 46, coffee 24
    site(MT[0], {traffic: 50, m2: 285, cap: 40, rent: 300}), // clothing 25, coffee 45
    site(MT[1], {traffic: 20, m2: 120, cap: 15, rent: 60}),  // clothing 10, coffee 18
    site(HK[1], {traffic: 80, rent: 180, status: 'rival', owner: 'rival', ownerRival: 7, occupantRival: 3,
      occupant: {name: 'Bean There', type: 'Coffee Shop', typeSlug: COFFEE}}),
    site(MT[2], {status: 'mine', owner: 'you', occupant: {name: 'HART. Gym', type: 'Gym', typeSlug: 'ba:businesstype_gym'}}),
    site(HK[4], {type: 'office', size: 'J', m2: 180, cap: 10, rent: 90, traffic: 45}),
  ],
  forSale: [{key: HK[0], address: at(HK[0]).address, hood: HK_HOOD, type: 'retail', size: 'C', m2: 225, price: 750000}],
  demand: {
    [HK_HOOD]: [
      {slug: CLOTHES, type: 'Clothing Store', demand: 77, providers: 2, mine: false, category: 'retail'},
      {slug: COFFEE, type: 'Coffee Shop', demand: 40, providers: 1, mine: false, category: 'retail'},
      {slug: LAW, type: 'Law Firm', demand: 60, providers: 0, mine: false, category: 'office'},
    ],
    [MT_HOOD]: [
      {slug: CLOTHES, type: 'Clothing Store', demand: 50, providers: 3, mine: false, category: 'retail'},
      {slug: COFFEE, type: 'Coffee Shop', demand: 90, providers: 1, mine: false, category: 'retail'},
    ],
  },
  rivals: 12, rivalNames: {},
  rent: {constant: 30, rates: {}, officeFactor: 1.033, check: {leases: 3, worst: 0.003},
    deposit: {factors: {lease: 62.84, warehouse: 93.61}, check: {deposits: 6, worst: 0.004}}},
  caps: {retail: {C: 30}, office: {J: 10}},
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

/* A board with the premises payload, every localStorage write and history
   write recorded, and a plan's finder on a host of its own. */
async function fixture({character = 'plan-a', preset = {cat: 'retail', type: CLOTHES, hoods: [HK_HOOD]}, stored = null} = {}){
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**', r => r.abort());
  await page.goto(url);
  await page.evaluate(({premises, character, stored}) => {
    window.__writes = [];
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v){ window.__writes.push(String(k)); return set.call(this, k, v); };
    for(const fn of ['replaceState', 'pushState']){
      const orig = history[fn].bind(history);
      history[fn] = (st, ...rest) => { window.__writes.push(`history.${fn}:${JSON.stringify(st)}`); return orig(st, ...rest); };
    }
    // The character's own finder filters, which a plan must never pick up.
    if(stored) localStorage.setItem(`ba_finder_v1:${character}`, JSON.stringify(stored));
    window.__writes = [];
    D = {meta: {character, day: 20, save: 'Plan'}, businesses: [], alerts: [], minor: {rows: []},
      supply: {shops: []}, daily: [], premises, market: {hoods: [], rows: [], types: [], offices: []}};
    refreshCityMaps();
  }, {premises: PREMISES, character, stored});
  const state = await page.evaluate(() => JSON.stringify(history.state));
  await page.evaluate(preset => {
    const host = document.createElement('div');
    host.id = 'planHost';
    host.style.cssText = 'position:fixed;left:0;top:0;width:1300px;z-index:1000;background:var(--ground)';
    document.body.appendChild(host);
    window.__planned = [];
    window.__plan = new CityMapView(host, {plan: {preset, onPlan: key => window.__planned.push(key), label: () => 'Plan it here'}});
    return window.__plan.ready;
  }, preset);
  await page.locator('#planHost .place.fr').first().waitFor();
  return {page, errors, state};
}
const rowKeys = page => page.$$eval('#planHost .place.fr', rows => rows.map(r => r.dataset.pick));
const finderWrites = page => page.evaluate(() => window.__writes.filter(w => /ba_finder|^history\./.test(w)));

test('a plan finder opens on the plan: its type fixed, its neighbourhood, premises to rent', async () => {
  const {page, errors} = await fixture();
  try{
    // On from the start, with the panel and no way to switch it off.
    assert.equal(await page.locator('#planHost.city-map.finder.fplan').count(), 1);
    assert.equal(await page.locator('#planHost .places').isVisible(), true);
    assert.equal(await page.locator('#planHost [data-f="tog"]').count(), 0);
    assert.equal(await page.locator('#planHost .map-head').count(), 0);
    assert.equal(await page.locator('#planHost [data-action="full"]').count(), 0);
    // The type is a chip naming it, not a control; no kind, no saved searches.
    assert.deepEqual(await page.$$eval('#planHost .filters .frow:not([hidden]) .lab', l => l.map(x => x.textContent)),
      ['Type', 'Show', 'Where', 'Size', 'Capacity', 'Traffic']);
    assert.equal(await page.locator('#planHost .fchip.cat').count(), 0);
    assert.equal(await page.locator('#planHost select[data-f="type"]').count(), 0);
    assert.equal(await page.locator('#planHost .fsaved').count(), 0);
    assert.equal(await page.locator('#planHost .fplan-type').textContent(), 'Clothing Store');
    assert.equal(await page.locator('#planHost .fplan-note').textContent(), 'from the plan');
    // Only premises to rent are a new store.
    assert.deepEqual(await page.$$eval('#planHost .fchip.show', c => c.map(x => [x.dataset.show, x.classList.contains('on')])), [['rent', true]]);
    // The plan's neighbourhood alone, scored on the plan's type.
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    assert.deepEqual(await page.$$eval('#planHost .fchip.hd', c => c.map(x => [x.dataset.h, x.classList.contains('on')])),
      [[HK_HOOD, true], [MT_HOOD, false]]);
    // The neighbourhoods, the sort and the limits stay the reader's to change.
    await page.locator(`#planHost .fchip.hd[data-h="${MT_HOOD}"]`).click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    assert.deepEqual(await page.$$eval('#planHost .place.fr .v.sc', v => v.map(x => x.textContent)), ['46', '25', '10']);
    await page.locator('#planHost .fhead [data-s="traffic"]').click();
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0], MT[1]]);
    await page.locator('#planHost .fhead [data-s="m2"]').click();
    assert.deepEqual(await rowKeys(page), [MT[0], HK[0], MT[1]]);
    await page.locator('#planHost input[data-f="minTraffic"]').fill('30');
    assert.deepEqual(await rowKeys(page), [MT[0], HK[0]]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a picked row opens its card with the plan\'s button, which hands the building to the plan', async () => {
  const {page, errors} = await fixture({preset: {cat: 'retail', type: CLOTHES, hoods: null}});
  try{
    await page.locator(`#planHost .place[data-pick="${MT[0]}"]`).click();
    await page.locator('#planHost .site.in').waitFor();
    const card = page.locator('#planHost .site');
    // Rent, deposit and capacity are among the card's facts.
    const facts = await card.locator('.facts span').allTextContents();
    for(const want of ['Building capacity40', 'Est. rent / day$300', 'Deposit$1,800']) assert.ok(facts.includes(want), `${want} in ${facts}`);
    const go = card.locator('[data-action="plan"]');
    assert.equal(await go.isVisible(), true);
    assert.equal(await go.textContent(), 'Plan it here');
    assert.equal(await go.getAttribute('class'), 'os-cta sm fplan-go');
    // The card leads nowhere off the plan: no site page, no Demand row.
    assert.equal(await card.locator('.go2').isVisible(), false);
    assert.equal(await card.locator('.mf-grow').count(), 0);
    assert.equal(await card.locator('h3 a').count(), 0);
    await go.click();
    assert.deepEqual(await page.evaluate(() => window.__planned), [MT[0]]);
    // A building the plan cannot open in has no button: a rival, or your own.
    for(const key of [HK[1], MT[2]]){
      await page.evaluate(key => window.__plan.select(key), key);
      await page.waitForFunction(key => window.__plan.selected === key && document.querySelector('#planHost .site.in'), key);
      assert.equal(await go.isVisible(), false, key);
      assert.equal(await card.locator('a.ss-sl').count(), 0, key);
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('planFor asks the plan\'s new question from the top; the same question keeps the reader\'s place', async () => {
  const {page, errors} = await fixture({preset: {cat: 'retail', type: CLOTHES, hoods: null}});
  try{
    await page.locator(`#planHost .place[data-pick="${HK[0]}"]`).click();
    await page.locator('#planHost .site.in').waitFor();
    await page.locator('#planHost input[data-f="minM2"]').fill('200');
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0]]);
    // The same plan drawn again: its filters and pick stay.
    await page.evaluate(() => window.__plan.planFor({cat: 'retail', type: 'ba:businesstype_clothingstore', hoods: null}));
    await page.evaluate(() => window.__plan.ready);
    assert.equal(await page.evaluate(() => window.__plan.selected), HK[0]);
    assert.deepEqual(await rowKeys(page), [HK[0], MT[0]]);
    // Another type: nothing picked, no limits left over, ranked for the new type.
    await page.evaluate(coffee => window.__plan.planFor({cat: 'retail', type: coffee, hoods: null}), COFFEE);
    await page.waitForFunction(() => document.querySelector('#planHost .fplan-type').textContent === 'Coffee Shop');
    assert.equal(await page.evaluate(() => window.__plan.selected), null);
    assert.equal(await page.locator('#planHost .site').isVisible(), false);
    assert.deepEqual(await rowKeys(page), [MT[0], HK[0], MT[1]]);
    assert.deepEqual(await page.$$eval('#planHost .place.fr .v.sc', v => v.map(x => x.textContent)), ['45', '24', '18']);
    assert.equal(await page.locator('#planHost input[data-f="minM2"]').inputValue(), '0');
    assert.equal(await page.locator('#planHost .places .list').evaluate(l => l.scrollTop), 0);
    // An office plan lists offices.
    await page.evaluate(law => window.__plan.planFor({cat: 'office', type: law, hoods: null}), LAW);
    await page.waitForFunction(() => document.querySelector('#planHost .fplan-type').textContent === 'Law Firm');
    assert.deepEqual(await rowKeys(page), [HK[4]]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a plan finder stores nothing and never touches the history entry', async () => {
  const stored = {cat: 'office', type: LAW, show: 'takeover', hoods: [MT_HOOD], layouts: [], minM2: 500, maxM2: 0,
    minCap: 0, maxCap: 0, minTraffic: 0, sort: 'traffic', sortPicked: true};
  const {page, errors, state} = await fixture({stored});
  try{
    // The character's stored filters are the City map's, not the plan's.
    assert.equal(await page.locator('#planHost .fplan-type').textContent(), 'Clothing Store');
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    assert.equal(await page.locator('#planHost input[data-f="minM2"]').inputValue(), '0');
    await page.locator(`#planHost .fchip.hd[data-h="${MT_HOOD}"]`).click();
    await page.locator('#planHost .fhead [data-s="cap"]').click();
    await page.locator('#planHost input[data-f="maxCap"]').fill('35');
    await page.locator(`#planHost .place[data-pick="${HK[0]}"]`).click();
    await page.locator('#planHost .site.in').waitFor();
    await page.locator('#planHost .site [data-action="plan"]').click();
    await page.locator('#planHost .site [data-action="close"]').click();
    await page.evaluate(coffee => window.__plan.planFor({cat: 'retail', type: coffee, hoods: null}), COFFEE);
    await page.evaluate(() => { refreshCityMaps(); return window.__plan.ready; });
    assert.deepEqual(await finderWrites(page), []);
    assert.equal(await page.evaluate(() => JSON.stringify(history.state)), state);
    assert.deepEqual(await page.evaluate(k => JSON.parse(localStorage.getItem(k)), 'ba_finder_v1:plan-a'), stored);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('the City map page\'s finder and a plan\'s finder never see each other', async () => {
  const {page, errors} = await fixture();
  try{
    await page.evaluate(() => showPage('map'));
    await page.locator('#cityMapPage .map-canvas').waitFor();
    await page.waitForFunction(() => document.querySelector('#cityMapPage .map-canvas')?.getAttribute('viewBox'));
    await page.evaluate(() => { document.getElementById('planHost').style.display = 'none'; });
    await page.locator('#cityMapPage .fswitch .ibtn').click();
    await page.locator('#cityMapPage .place.fr').first().waitFor();
    // The page opens on its own defaults, not on the plan's question.
    assert.deepEqual(await page.evaluate(() => [cityMapPage.fs.cat, cityMapPage.fs.type, cityMapPage.fs.hoods]), ['retail', '', null]);
    assert.deepEqual(await page.$$eval('#cityMapPage .place.fr', r => r.map(x => x.dataset.pick)), [HK[0], MT[0], MT[1]]);
    assert.equal(await page.locator('#cityMapPage .fplan-type').count(), 0);
    assert.equal(await page.locator('#cityMapPage .fplan-go').count(), 1);
    await page.locator('#cityMapPage .fchip.cat[data-cat="office"]').click();
    await page.locator(`#cityMapPage .place[data-pick="${HK[4]}"]`).click();
    await page.locator('#cityMapPage .site.in').waitFor();
    // The page's card has no plan to hand anything to.
    assert.equal(await page.locator('#cityMapPage .site .fplan-go').isVisible(), false);
    // The page remembers its own, as it always has.
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ba_finder_v1:plan-a')).cat), 'office');
    // The plan's question is where the plan left it.
    assert.deepEqual(await page.evaluate(() => [window.__plan.fs.cat, window.__plan.fs.type, window.__plan.fs.hoods, window.__plan.fs.on]),
      ['retail', CLOTHES, [HK_HOOD], true]);
    await page.evaluate(() => { document.getElementById('planHost').style.display = ''; window.__plan.planFor(window.__plan.planning.preset); return window.__plan.ready; });
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a new character keeps the plan\'s question; a plan whose host is gone is let go', async () => {
  const {page, errors} = await fixture();
  try{
    await page.locator(`#planHost .place[data-pick="${HK[0]}"]`).click();
    await page.locator('#planHost .site.in').waitFor();
    await page.evaluate(() => { D = {...D, meta: {...D.meta, character: 'plan-b'}}; refreshCityMaps(); });
    await page.waitForFunction(() => window.__plan.selected === null);
    assert.deepEqual(await page.evaluate(() => [window.__plan.fs.cat, window.__plan.fs.type, window.__plan.fs.hoods, window.__plan.fs.on]),
      ['retail', CLOTHES, [HK_HOOD], true]);
    assert.deepEqual(await rowKeys(page), [HK[0]]);
    // The board drew the host away: the next refresh drops the view.
    await page.evaluate(() => { document.getElementById('planHost').remove(); refreshCityMaps(); });
    assert.equal(await page.evaluate(() => mapViews.has(window.__plan)), false);
    assert.deepEqual(await finderWrites(page), []);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
