// Findability: the cross-links from the thing on screen to the page that
// answers the next question about it, the membership line under a Portfolio
// chain, and the read-out each site block opens on before anything is pointed
// at. Install Playwright and its Chromium browser to run; NODE_PATH may point
// at an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const {chromium} = require('playwright');

let browser;
let html;
before(async () => {
  const result = spawnSync(process.env.PYTHON || 'python', ['-c',
    'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
  {cwd: path.join(__dirname, '..'), maxBuffer: 4 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8')
    : result.stdout.toString();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

const KEY = 'ba:street_secondavenue#10';
const OTHER = 'ba:street_broadway#2';
// Tokens are a one-to-one encoding of the item's own label, as the panel spells them.
const tok = s => 'sp-' + s.replace(/[^A-Za-z0-9-]/g, c => '_' + c.codePointAt(0).toString(16) + '_');

// A board with two gift shops and whatever else the test adds. `shop` and
// `peer` override the two sites, `extra` appends more.
async function board(o = {}) {
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
  await page.route('https://**', route => route.abort());
  await page.route('https://findability.test/', route =>
    route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await page.goto('https://findability.test/', {waitUntil: 'load'});
  await page.evaluate(o => {
    document.body.classList.add('has-board');
    const shop = {
      key: 'ba:street_secondavenue#10', status: 'retail', name: 'HART. Gifts', code: 'HK',
      type: 'Gift Shop', typeSlug: 'ba:businesstype_giftshop', address: '10 Second Avenue',
      neighbourhood: "Hell's Kitchen", opened: 3, revenue: 900, customers: 30, basket: 30, profit: 200,
      margin: 22.2, cogs: 0, wages: 300, rent: 100, marketing: 0, theft: 0, licensing: 0,
      staff: 2, staffCost: 300, crew: [{role: 'Customer service', count: 2, daily: 300, absent: 0}],
      people: [], lines: [], series: [], rhythm: null, peakDay: null, swing: 0,
      staffDemands: [], quitWarnings: 0, daysOpen: 9,
      satisfaction: {overall: 74, service: 88, pricing: 71, cleanliness: 62, facility: 79},
      amenities: {bathroom: true, toiletprivacy: false, sink: true, music: false, interior: true},
      missingUniformLocker: false, uniformGaps: [],
      traffic: 41, marketingIndex: 31, security: 85, capacity: 40,
    };
    const other = {...shop, key: 'ba:street_broadway#2', name: 'HART. Other', revenue: 500};
    D = {
      meta: {character: 'xl-fixture', day: 29}, rhythm: null, daily: [],
      plan: null,
      supply: Object.assign({day: 29, shops: [], imports: [], idle: [], factories: {sites: []}}, o.supply || {}),
      hours: o.hours || [], hourFindings: [], trends: [], hypeExposure: [],
      alerts: [], minor: {rows: []}, homes: [], chains: o.chains || [], products: o.products || [],
      businesses: [Object.assign(shop, o.shop || {}), Object.assign(other, o.peer || {}), ...(o.extra || [])],
    };
    siteKey = shop.key; siteOpen = true; spArrived = null; spFindsAll = false; showAllShelves = false;
    showPage('company');
    drawSite();
  }, o);
  return page;
}
const readOf = (page, block) => page.locator(`#sitePanel [data-block="${block}"] .sp-readout`).first().innerText();

// One hour a day, noon, with six customers against three of capacity: at the ceiling.
const grid = (office, staffedAt) => {
  const rows = () => Array.from({length: 24}, (_, h) => h === 12 ? staffedAt : 0);
  return [{
    key: KEY, name: 'HART. Gifts', office, postRate: 1,
    customers: Array.from({length: 7}, (_, wd) => Array.from({length: 24}, (_, h) =>
      h === 12 ? 6 : h === 15 && wd === 6 ? 2 : 0)),
    weeks: [2, 2, 2, 2, 2, 2, 2], thin: Array(7).fill(false),
    staffed: Array.from({length: 7}, rows), onShift: Array.from({length: 7}, rows),
    effective: Array.from({length: 7}, rows),
    door: 50, cap: 50, counters: 3, stationCount: 4, basket: 30, peak: 6, capHours: 7,
  }];
};

// --- default read-outs -------------------------------------------------------

test('a shop block reads out its most telling cell before anything is pointed at', async () => {
  const page = await board({hours: grid(false, 3)});
  try {
    // The hour grid opens on the busiest hour spent at the ceiling, Monday first.
    assert.match(await page.locator('#hourRead').innerText(), /^Worst hour · Monday 12:00 6 customers · .* · at the ceiling$/);
    assert.equal(await readOf(page, 'pull'), 'Foot traffic 41 + marketing 31 · 28 short of the cap');
    // Nothing on the page asks to be hovered any more.
    assert.doesNotMatch(await page.locator('#sitePanel').innerText(), /Hover an? /);
    // A pointer replaces the line; leaving the block puts the reading back.
    await page.hover('#sp-hours .hc[data-read*="Saturday 15:00"]');
    assert.match(await page.locator('#hourRead').innerText(), /^Saturday 15:00 2 customers/);
    await page.mouse.move(2, 2);
    assert.match(await page.locator('#hourRead').innerText(), /^Worst hour · Monday 12:00/);
    await page.hover('#sp-pull .sp-minis span');
    assert.equal(await readOf(page, 'pull'), 'Security 85%');
    await page.mouse.move(2, 2);
    assert.match(await readOf(page, 'pull'), /^Foot traffic 41/);
  } finally { await page.close(); }
});

test('an office reads out its lowest standard, and a big crew who is off', async () => {
  const people = Array.from({length: 14}, (_, i) =>
    ({name: `Person ${i}`, role: i < 7 ? 'Lawyer' : 'Cleaner', absent: i % 5 === 1, daily: 100}));
  const page = await board({shop: {status: 'office', type: 'Law Firm', people}});
  try {
    assert.equal(await readOf(page, 'standards'), 'Lowest · Cleanliness 62%');
    // Persons 1, 6 and 11 are off: two named, the third counted.
    assert.equal(await page.locator('#sp-crew .sp-readout').innerText(), 'Off today · Person 1, Person 6 and 1 more');
  } finally { await page.close(); }
});

const DEPOT = {
  status: 'support', type: 'Warehouse', name: 'HART. Depot', revenue: 0, customers: 0,
  basket: null, profit: -400, margin: null, lines: [
    {item: 'Soda', slug: 'soda', units: 2100, rate: 0, price: 1, revenue: 0, soldPerDay: 0},
  ],
};
const importRow = (over = {}) => Object.assign({
  s: 0, item: 'Soda', slug: 'soda', stock: 2100, perDay: 1150, basis: 'shipped',
  peakDay: 'Friday', peakPerDay: 1300, cover: 1.8, stockCover: 1.8, daysOnHand: 1.8,
  runsOut: 'Tuesday', weekly: 8000, lastWeek: 8000, weekNeed: 8050, orderFit: 'ok',
  coverFit: 'short', due: 4, shortBy: 2.2, catchUp: 2400, coverageUntil: 33, paused: false,
  arrives: 33, from: 'Acme', level: 'critical', reason: 'shortfall',
}, over);

test('a depot reads out its thinnest line', async () => {
  const page = await board({shop: DEPOT, supply: {imports: [
    importRow({item: 'Chips', slug: 'chips', cover: 9, coverFit: 'ok', runsOut: null}), importRow()]}});
  try {
    assert.match(await readOf(page, 'stock'), /^Thinnest · Soda · Runs dry Tuesday, the truck lands /);
  } finally { await page.close(); }
});

const FACTORY_SITE = {
  s: 0, machines: 4, targets: {}, known: true, arrivals: {},
  lines: [
    {rid: 'r1', item: 'Burger', slug: 'burger', missing: [], workstation: 'Food Workstation',
     slots: [1, 2], machines: 2, rate: 200, makes: 9600, ships: 9480, stock: 2100,
     toCity: 0, toPier: 0, basis: 'match', piling: false, atRoster: 9600,
     hoursWeek: 336, fullWeek: 336, gaps: []},
    {rid: 'r2', item: 'Bottle of Wine', slug: 'wine', missing: [],
     workstation: 'Bottled Goods Workstation', slots: [3], machines: 1, rate: 50, makes: 1200,
     ships: 470, stock: 9400, toCity: 0, toPier: 0, basis: 'match', piling: true,
     atRoster: 1029, hoursWeek: 144, fullWeek: 168,
     gaps: [{slot: 3, hours: 144, off: 'on Sundays'}]},
  ],
  unnamed: [
    {rid: null, workstation: 'Bottled Goods Workstation', slots: [5], machines: 1, idle: true,
     candidates: [], hoursWeek: 168, fullWeek: 168, gaps: []},
  ],
  needs: [
    {item: 'Grapes', slug: 'grapes', perDay: 2400, perWeek: 16800, lines: ['Bottle of Wine'],
     target: 2400, raiseTarget: null, dailyNeed: 2400, arrives: 2380, known: true, stock: 3000,
     from: 1, directImport: false, stalled: false, waitingOn: [], importWeekly: null,
     depotNeed: 16800, staffedShare: 1, madeAt: [], depotStock: 900, status: 'ok', level: 'ok'},
    {item: 'Ground Beef', slug: 'gb', perDay: 9600, perWeek: 67200, lines: ['Burger'],
     target: 8000, raiseTarget: 9600, dailyNeed: 9600, arrives: 1900, known: true, stock: 1900,
     from: 1, directImport: false, stalled: false, waitingOn: [], importWeekly: null,
     depotNeed: 67200, staffedShare: 1, madeAt: [], depotStock: 4000, status: 'target', level: 'critical'},
  ],
};
const FACTORY = {...DEPOT, name: 'HART. Works', type: 'Factory',
                 lines: [{item: 'Burger', slug: 'burger', units: 2100, rate: 0, price: 1, revenue: 0, soldPerDay: 0}]};
const factories = site => ({sites: [site], machines: 4, unnamed: 1, character: 'xl-fixture',
                            aliases: {}, depots: {}, depotOther: {}});

test('a factory reads out the machine that makes nothing, else the least staffed, and its worst input', async () => {
  let page = await board({shop: FACTORY, supply: {factories: factories(FACTORY_SITE)}});
  try {
    assert.equal(await readOf(page, 'lines'), 'Making nothing · Machine 5 is staffed and rented with no recipe');
    assert.equal(await readOf(page, 'inputs'), 'Ground Beef · Tops up to 8,000, the machines eat 9,600');
  } finally { await page.close(); }
  page = await board({shop: FACTORY, supply: {factories: factories({...FACTORY_SITE, unnamed: [],
    needs: [FACTORY_SITE.needs[0]]})}});
  try {
    assert.equal(await readOf(page, 'lines'),
      'Least staffed · Bottle of Wine · Machine 3 · 144 of 168 h rostered: nobody on it on Sundays');
    assert.equal(await readOf(page, 'inputs'), 'Every input arrives in step');
  } finally { await page.close(); }
});

// --- cross-links -------------------------------------------------------------

test('the Shelves and Fees heads link to the guide, landing on Prices in your save', async () => {
  let page = await board();
  try {
    const link = page.locator('#sp-shelves .sechead .xl-guide');
    assert.equal(await link.innerText(), 'Compare with market prices ›');
    assert.equal(await link.getAttribute('href'), '#wiki/businesstypes-giftshop/prices');
    // Following it opens the Wiki page on that route.
    await link.click();
    await page.waitForFunction(() => page === 'wiki');
    assert.match(await page.evaluate(() => location.hash), /^#wiki\/businesstypes-giftshop\/prices$/);
  } finally { await page.close(); }
  page = await board({shop: {status: 'office', type: 'Law Firm', typeSlug: 'ba:businesstype_lawfirm'}});
  try {
    assert.equal(await page.locator('#sp-shelves .xl-guide').getAttribute('href'), '#wiki/businesstypes-lawfirm/prices');
  } finally { await page.close(); }
  // A site whose type the save does not name gets no link rather than a dead one.
  page = await board({shop: {typeSlug: null}});
  try {
    assert.equal(await page.locator('#sp-shelves .xl-guide').count(), 0);
  } finally { await page.close(); }
});

test('a Growth type row and the Plan a chain type link to the setup guide', async () => {
  const page = await board();
  try {
    const rows = await page.evaluate(() => {
      const cell = {hood: 'Midtown', demand: 50, count: 1, providers: 1, here: false};
      return [
        typeRow({type: 'Cinema', slug: 'ba:businesstype_cinema', products: 1, mine: false, cells: [cell]}, 0, ['Midtown']),
        officeRow({type: 'Law Firm', slug: 'ba:businesstype_lawfirm', fees: ['Lawyer Fee'], mine: true, cells: [cell]},
          1, ['Midtown'], 0, []),
      ];
    });
    assert.match(rows[0], /<small>1 product · <a class="link xl-guide" href="#wiki\/businesstypes-cinema">Setup guide ›<\/a><\/small>/);
    assert.match(rows[1], /<small>Lawyer Fee · you run one · <a class="link xl-guide" href="#wiki\/businesstypes-lawfirm">Setup guide ›<\/a><\/small>/);
    await page.evaluate(() => {
      D.plan = {catalogue: {'ba:businesstype_gym': {type: 'Gym', products: ['ba:itemname_proteinbar'], services: []}},
                own: {}, workstations: {}, sources: {}, prices: {}, recipes: []};
      planType = 'ba:businesstype_gym';
      drawPlan();
    });
    assert.equal(await page.locator('#planPicker .xl-guide').getAttribute('href'), '#wiki/businesstypes-gym');
  } finally { await page.close(); }
});

test('a Products row opens the store that sells the most of it, Shelves lit', async () => {
  const line = (item, slug, revenue) => ({item, slug, revenue, rate: 5, units: 40, price: 30, soldPerDay: 5});
  const page = await board({
    shop: {lines: [line('Cheap Gift', 'cheapgift', 100), line('Paper Bag', 'bag', 2), line('Mug', 'mug', 400)]},
    peer: {lines: [line('Cheap Gift', 'cheapgift', 300)]},
    products: [
      {item: 'Cheap Gift', revenue: 400, units: 10, week: 70, stock: 80, stores: 2, price: 40, peak: null},
      {item: 'Paper Bag', revenue: 2, units: 5, week: 35, stock: 40, stores: 1, price: 0.4, peak: null},
    ],
  });
  try {
    await page.evaluate(() => { siteOpen = false; drawSite(); showSub('company', 'products'); drawProducts(); });
    const link = page.locator('#secProducts .xl-sells', {hasText: 'Cheap Gift'});
    assert.equal(await link.getAttribute('data-tip'), 'Open HART. Other, the store that sells the most of it, one of 2');
    // The link's seller is not the bar's scale: every bar has a real width.
    assert.deepEqual(await page.$$eval('#secProducts .bar i', bars => bars.map(i => i.style.width)), ['100%', '1%']);
    await link.click();
    assert.equal(await page.evaluate(() => [page, sub.company, siteOpen, siteKey].join(' ')),
                 `company results true ${OTHER}`);
    assert.equal(await page.locator('#sp-shelves.xl-arrived').count(), 1);
    assert.equal(await page.locator(`#sp-shelves tr[data-el~="${tok('s-cheapgift')}"].sp-hit`).count(), 1);
    // A bag sits among the folded odds and ends, so the fold opens for it.
    await page.evaluate(() => { showSub('company', 'products'); });
    await page.locator('#secProducts .xl-sells', {hasText: 'Paper Bag'}).click();
    assert.equal(await page.evaluate(() => [siteKey, showAllShelves].join(' ')), `${KEY} true`);
    assert.equal(await page.locator(`#sp-shelves tr[data-el~="${tok('s-bag')}"].sp-hit`).count(), 1);
  } finally { await page.close(); }
});

test('a product stocked but not sold yet still opens a store that stocks it', async () => {
  const line = (item, slug, revenue, units) => ({item, slug, revenue, rate: 0, units, price: 30, soldPerDay: 0});
  const page = await board({
    shop: {lines: [line('Mug', 'mug', 400, 20), line('New Gift', 'newgift', 0, 10)]},
    peer: {lines: [line('New Gift', 'newgift', 0, 60)]},
    products: [
      {item: 'Mug', revenue: 400, units: 10, week: 70, stock: 20, stores: 1, price: 40, peak: null},
      {item: 'New Gift', revenue: 0, units: 0, week: 0, stock: 70, stores: 0, price: 0, peak: null},
    ],
  });
  try {
    await page.evaluate(() => { siteOpen = false; drawSite(); showSub('company', 'products'); drawProducts(); });
    const link = page.locator('#secProducts .xl-sells', {hasText: 'New Gift'});
    assert.equal(await link.getAttribute('data-tip'), 'Open HART. Other, which stocks it; no store sold any yesterday');
    assert.deepEqual(await page.$$eval('#secProducts .bar i', bars => bars.map(i => i.style.width)), ['100%', '0%']);
    await link.click();
    assert.equal(await page.evaluate(() => [siteOpen, siteKey].join(' ')), `true ${OTHER}`);
    assert.equal(await page.locator(`#sp-shelves tr[data-el~="${tok('s-newgift')}"].sp-hit`).count(), 1);
  } finally { await page.close(); }
});

test('a depot or factory holding a product is never where its Products row lands', async () => {
  const line = (item, slug, revenue, units) => ({item, slug, revenue, rate: 0, units, price: 30, soldPerDay: 0});
  const product = {item: 'New Gift', revenue: 0, units: 0, week: 0, stock: 5000, stores: 0, price: 0, peak: null};
  // The depot holds far more than the shop; the shop is still the one with Shelves.
  let page = await board({
    shop: {lines: [line('New Gift', 'newgift', 0, 10)]},
    extra: [{...DEPOT, key: 'd1', name: 'HART. Depot', lines: [line('New Gift', 'newgift', 0, 4000)]},
            {...DEPOT, key: 'f1', status: 'overhead', name: 'HART. Works', lines: [line('New Gift', 'newgift', 0, 900)]}],
    products: [product],
  });
  try {
    await page.evaluate(() => { siteOpen = false; drawSite(); showSub('company', 'products'); drawProducts(); });
    await page.locator('#secProducts .xl-sells', {hasText: 'New Gift'}).click();
    assert.equal(await page.evaluate(() => siteKey), KEY);
    assert.equal(await page.locator(`#sp-shelves tr[data-el~="${tok('s-newgift')}"].sp-hit`).count(), 1);
  } finally { await page.close(); }
  // Only a depot holds it: no store to open, so the product is not a link.
  page = await board({
    extra: [{...DEPOT, key: 'd1', name: 'HART. Depot', lines: [line('New Gift', 'newgift', 0, 4000)]}],
    products: [product],
  });
  try {
    await page.evaluate(() => { siteOpen = false; drawSite(); showSub('company', 'products'); drawProducts(); });
    assert.equal(await page.locator('#secProducts .xl-sells').count(), 0);
    assert.match(await page.locator('#secProducts tbody').innerText(), /New Gift/);
  } finally { await page.close(); }
});

// --- the Portfolio --------------------------------------------------------------

test('a chain row says what it is made of, not only how many sites', async () => {
  const page = await board({
    extra: [
      {key: 'w1', status: 'overhead', name: 'HART. Depot', type: 'Warehouse', lines: [], series: [], crew: []},
      {key: 'f1', status: 'support', name: 'HART. Works', type: 'Factory', lines: [], series: [], crew: []},
      {key: 'f2', status: 'support', name: 'HART. Works 2', type: 'Factory', lines: [], series: [], crew: []},
      {key: 'hq', status: 'overhead', name: 'HART. HQ', type: 'Headquarters', lines: [], series: [], crew: []},
    ],
    supply: {factories: {sites: [{s: 3, lines: []}, {s: 4, lines: []}]}},
  });
  try {
    const words = await page.evaluate(() => [
      xlMembers({count: 5, sites: [D.businesses[0].key, 'w1', 'f1', D.businesses[1].key, 'f2']}),
      xlMembers({count: 1, sites: ['hq']}),
      xlMembers({count: 1, sites: [D.businesses[0].key]}),
      xlMembers({count: 2, sites: ['gone', 'lost']}),
    ]);
    assert.deepEqual(words, ['2 shops, 2 factories, 1 warehouse', '1 headquarters', '1 shop', '2 sites']);
  } finally { await page.close(); }
});
