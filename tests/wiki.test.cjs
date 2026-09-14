/* The wiki module, run the way the board runs it: web/wiki.js is evaluated in a
   context that stubs the handful of board helpers it shares ($, attr, icon,
   fmt, wireTips, the map's loader), so the routing, the search, the rendering
   of the game's own markdown and the save-side strip are all exercised against
   the real source rather than a copy of it.

   The fixture is the shape agreed for web/wiki-data.json: schemaVersion 1,
   categories, pages, and the verified sample the authored page is drawn from.
   It is written here, so these tests hold with or without the real file.

    node --test tests/wiki.test.cjs
*/
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const WIKI = fs.readFileSync(path.join(__dirname, '..', 'web', 'wiki.js'), 'utf8');
const LOCATIONS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'web', 'maps', 'locations.json'), 'utf8'));

/* --- the fixture -------------------------------------------------------- */

/* The bodies carry the shapes the real help writes: a requirements list in the
   page's own words, links to pages that exist and to slugs that do not, an
   address, and one bold that never closes. */
const GIFT_BODY = `**Gift Shop** businesses operate out of retail buildings.

Some items can be ordered from [Wholesalers](wholesalers-locations); the rest from [Importers](importers-contract).

The business requires the following furniture to function:

* [Stack of Shopping Baskets](furniture-stackofshoppingbaskets)
* [Point of Sales](furniture-itemgrouppointofsale)
* At least one product to sell (see below)

Employees with the following skills can be assigned:
* [Customer Service](common_exercise)

**Product Capacity: 40`;

const CHEAP_BODY = `**Gift (Cheap)** is sold from [Gift Shops](businesstypes-giftshop).

The product can be imported from the following locations:
* [Bluestone Imports](address: 4 pier)`;

/* Supplier keys are the city's own building keys, as the extraction emits them. */
const PEDERSON = 'ba:street_fifthavenue#13';
const BLUESTONE = 'ba:street_pier#4';
const HARVEST = 'ba:street_pier#9';
const DEPOT = 'ba:street_twentyfifthstreet#2';
const ANDERSON = 'ba:street_fifthavenue#16';

const SAMPLE = {
  SOURCES: {extracted: '2026-09-03', files: [{path: 'Big Ambitions_Data/StreamingAssets/locale/en.json', note: '6,036 keys.'}],
    build: [{label: 'Steam app / depot build', value: 'app 1331550, buildid 25231854',
      where: 'steamapps/appmanifest_1331550.acf', certain: true,
      caveat: "Steam's depot build id. It is not the build number a save carries."}]},
  CATEGORIES: [],
  SUPPLIERS: {
    [PEDERSON]: {name: 'AJ Pederson & Son', raw: 'address:13 5a', street: '13 Fifth Avenue', hood: 'Garment District',
      kind: 'Furniture vendor', size: 'M', area: 1000, traffic: 45},
    [BLUESTONE]: {name: 'Bluestone Imports', raw: 'address: 4 pier', street: '4 Pier', hood: 'Murray Hill',
      kind: 'Importer - retail inventory', size: 'H', area: 690, traffic: 18,
      flag: 'The building table puts 4 Pier in Murray Hill while 7, 8 and 9 Pier are Lower Manhattan.'},
    [HARVEST]: {name: 'Global Harvest Traders', raw: 'address: 9 pier', street: '9 Pier', hood: 'Lower Manhattan',
      kind: 'Importer - factory raw goods', size: 'H', area: 690, traffic: 18},
    [DEPOT]: {name: 'Factory Supply Depot', raw: 'address:2 25s', street: '2 Twenty-fifth Street', hood: 'Industry City',
      kind: 'Factory machine vendor', size: 'M', area: 1000, traffic: 37},
    [ANDERSON]: {name: 'Anderson Recruitment Corp.', raw: 'address: 16 5a', street: '16 Fifth Avenue',
      hood: 'The Hamptons', kind: 'Recruitment', size: 'C', area: 225, traffic: 50},
  },
  WHOLESALERS: [{name: 'Hudson Wholesale', street: '13 Twelfth Street', hood: 'Lower Manhattan'},
                {name: 'Metro Wholesale', street: '18 First Street', hood: "Hell's Kitchen"}],
  FIXTURES: {
    roundedshelf: {name: 'Rounded Shelf', sells: ['cheapgift'], customers: 15, vendors: [PEDERSON],
      capacity: [{label: 'Gifts', value: 300, unit: 'units'}], station: null, needs: null, mount: null,
      observed: '10 in GiftShopRivals (M1), 4 in GolfAreaGiftShop (D3).'},
    stackofshoppingbaskets: {name: 'Stack Of Shopping Baskets', sells: [], capacity: [], customers: 30,
      vendors: [PEDERSON], station: null, needs: null, mount: null,
      observed: '3 in GiftShopRivals (M1), 2 in GolfAreaGiftShop (D3).'},
    cashregister: {name: 'Cash Register', sells: [], customers: 20, station: 'Customer Service', needs: ['Paper Bag'],
      mount: 'Cabinets, Cocktail Bar or Cocktail Bar (Wooden)', vendors: [PEDERSON],
      capacity: [{label: 'Products', value: 1000, unit: 'units'}],
      observed: '4 in GiftShopRivals (M1), 2 in GolfAreaGiftShop (D3).'},
    storageshelf: {name: 'Storage Shelf', sells: [], customers: null, vendors: [PEDERSON], station: null,
      needs: null, mount: null, capacity: [{label: 'Boxes', value: 16, unit: 'boxes'}],
      observed: '12 in GiftShopRivals (M1), 2 in GolfAreaGiftShop (D3).'},
  },
  PRODUCTS: {
    cheapgift: {name: 'Gift (Cheap)', rank: 'primary', alsoSoldBy: ['Florists'], fixtures: ['roundedshelf'],
      wholesale: true, importers: [BLUESTONE], recipe: 'cheapgiftrecipe',
      crosscheck: 'Rounded Shelf is the furniture page naming this product. Named on the wholesaler product list.'},
    expensivegift: {name: 'Gift (Expensive)', rank: 'primary', alsoSoldBy: [], fixtures: ['roundedshelf'],
      wholesale: false, importers: [BLUESTONE], recipe: null,
      crosscheck: 'Rounded Shelf is the only furniture page naming this product. Absent from the wholesaler product list.'},
  },
  RECIPES: {
    cheapgiftrecipe: {name: 'Gift (Cheap) Recipe', workstation: 'Consumer Goods Workstation',
      inputs: [{item: 'Clay', per: 50, from: [HARVEST]}], out: {item: 'Gift (Cheap)', per: 100}},
  },
  WORKSTATION: {name: 'Consumer Goods Workstation', assembly: 'Consumer Goods Assembly Machine',
    production: ['Laser Cutting Machine'], vendor: DEPOT, runs: ['Gifts (Cheap)', 'Umbrella']},
  BUSINESS: {slug: 'businesstypes-giftshop', name: 'Gift Shop', nameSrc: 'ba:businesstype_giftshop',
    building: 'Retail', serving: 'Self-serving', skills: ['Customer Service', 'Cleaning'], hiring: ANDERSON,
    primary: ['cheapgift', 'expensivegift'], extras: ['Soda Can', 'Picture Book']},
  RETAIL_SIZES: [{code: 'A1', area: 75, customers: 15}, {code: 'M1', area: 1000, customers: 75}],
  GAPS: [{what: 'Prices', detail: 'No furniture, product or business page carries a price. The only prices in the help are vehicle pages.'},
         {what: 'Weekly delivery limits', detail: 'The help says every wholesaler caps each item per week and resets Monday 08:00, but never gives a number.'}],
};

const DATA = {
  schemaVersion: 1,
  // The game's own category keys, stored in the help menu's order, which is not
  // the order the shelf leads with.
  categories: [
    {id: 'help_general', label: 'General', count: 1, pageIds: ['general-movement']},
    {id: 'help_importers', label: 'Wholesale / Import', count: 1, pageIds: ['wholesalers-locations']},
    {id: 'common_business_types', label: 'Business Types', count: 2, pageIds: ['businesstypes-giftshop', 'businesstypes-florist']},
    {id: 'common_sellable_products', label: 'Goods and Services', count: 2, pageIds: ['products-cheapgift', 'products-giftwrap']},
  ],
  pages: [
    {id: 'general-movement', categoryId: 'help_general', title: 'Basic Character Control', body: 'Your character **moves** with WASD.'},
    {id: 'wholesalers-locations', categoryId: 'help_importers', title: 'Wholesale Locations',
      body: 'Wholesalers are found at [Hudson Wholesale](address:13 12s).'},
    {id: 'businesstypes-giftshop', categoryId: 'common_business_types', title: 'Gift Shop', body: GIFT_BODY,
      sourceKey: 'help_ba:businesstype_giftshop_content'},
    {id: 'businesstypes-florist', categoryId: 'common_business_types', title: 'Florist',
      body: 'A **Florist** sells [Gift (Cheap)](products-cheapgift).'},
    {id: 'products-cheapgift', categoryId: 'common_sellable_products', title: 'Gift (Cheap)', body: CHEAP_BODY},
    // A page whose title is hostile on purpose: the source text is data.
    {id: 'products-giftwrap', title: '<img src=x onerror="alert(1)">Gift Wrap',
      body: 'Sold by [Gift Shops](businesstypes-giftshop) and <b>nobody</b> else.\n\nSee [Exercise](common_exercise).'},
  ],
  sample: SAMPLE,
  // The date is the newest source modification time, and the save build is not
  // knowable from an installation, so the extraction states it as null.
  provenance: {extracted: '2026-09-03', saveBuildNumber: null,
    steam: {buildId: '25231854', appId: '1331550'},
    files: [{path: 'Big Ambitions_Data/StreamingAssets/helpstructure.json', note: '14 categories.'}]},
};
const CATEGORY_COUNT = DATA.categories.length;

/* --- the board around it ------------------------------------------------ */

function element(id) {
  const node = {
    id, innerHTML: '', hidden: false, value: '', dataset: {}, isConnected: true,
    style: {setProperty(){}}, children: [],
    classList: {_: new Set(), add(c){this._.add(c);}, remove(c){this._.delete(c);},
      toggle(c, on){ if(on === undefined) on = !this._.has(c); on ? this._.add(c) : this._.delete(c); return on; },
      contains(c){return this._.has(c);}},
    listeners: {},
    addEventListener(type, fn){ (this.listeners[type] = this.listeners[type] || []).push(fn); },
    fire(type, event){ (this.listeners[type] || []).forEach(fn => fn(event)); },
    setAttribute(){}, removeAttribute(){}, focus(){}, setSelectionRange(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return {top:0, left:0, right:0, bottom:0, width:0, height:0}; },
  };
  return node;
}

function wiki({data = DATA, fetchImpl, save = null} = {}) {
  const root = element('wikiRoot');
  const nodes = new Map([['wikiRoot', root]]);
  const drawn = [];
  const fetched = [];
  const scrolled = [];
  const tipsDropped = [];
  const context = vm.createContext({
    D: save,
    page: 'wiki',
    planType: null, planCounts: {},
    REDUCED: false,
    console,
    $: id => nodes.get(id) || null,
    $$: () => [],
    attr: s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
    icon: name => `<svg data-icon="${name}"></svg>`,
    fmt: n => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US'),
    hasData: () => !!context.D,
    showPage(id){ drawn.push(['page', id]); },
    showSub(id, view){ drawn.push(['sub', id, view]); },
    drawPlan(){ drawn.push(['plan', context.planType]); },
    wireTips(){}, wireReveal(){},
    hideTip(){ tipsDropped.push(1); },
    // The board's own neighbourhood tags, as render() writes them in.
    HOOD_TAGS: {"Midtown": "MT", "Hell's Kitchen": "HK", "Murray Hill": "MH", "Lower Manhattan": "LM",
      "Garment District": "GD", "Industry City": "IC", "The Hamptons": "HA"},
    requestAnimationFrame(){}, cancelAnimationFrame(){}, setTimeout(){},
    history: {replaceState(){}},
    matchMedia: () => ({matches: false, addEventListener(){}}),
    CSS: {escape: s => s},
    document: {addEventListener(){}, body: {classList: {add(){}, remove(){}}}, activeElement: null},
    window: {LEDGER_BUILD: 'stamp1', addEventListener(){}, scrollY: 0, scrollTo(x, y){ scrolled.push([x, y]); }},
    fetch: fetchImpl || (async (url) => {
      fetched.push(url);
      return {ok: true, status: 200, json: async () => data};
    }),
  });
  context.window.window = context.window;
  vm.runInContext(WIKI, context);
  const call = (expr) => vm.runInContext(expr, context);
  return {
    context, root, drawn, fetched, scrolled, tipsDropped, call,
    run: (fn) => vm.runInContext(`(${fn})()`, context),
    async load(hash = 'wiki') {
      vm.runInContext(`showWikiRoute(${JSON.stringify(hash)})`, context);
      await new Promise(r => setImmediate(r));
      await new Promise(r => setImmediate(r));
      return root.innerHTML;
    },
    async go(hash) {
      vm.runInContext(`showWikiRoute(${JSON.stringify(hash)})`, context);
      await new Promise(r => setImmediate(r));
      return root.innerHTML;
    },
  };
}

/* --- routes -------------------------------------------------------------- */

test('every wiki route survives the trip through the hash and back', () => {
  const w = wiki();
  const trips = [
    ['wiki', {kind: 'home', id: '', query: ''}],
    ['#wiki', {kind: 'home', id: '', query: ''}],
    ['wiki/businesstypes-giftshop', {kind: 'page', id: 'businesstypes-giftshop', query: ''}],
    ['wiki/c/common_sellable_products', {kind: 'category', id: 'common_sellable_products', query: ''}],
    ['wiki/q/gift%20shop', {kind: 'home', id: '', query: 'gift shop'}],
  ];
  for (const [hash, want] of trips) {
    const got = w.call(`wikiParse(${JSON.stringify(hash)})`);
    assert.deepEqual({kind: got.kind, id: got.id, query: got.query}, want, hash);
  }
  assert.equal(w.call(`wikiHref({kind:"page", id:"products-cheapgift"})`), '#wiki/products-cheapgift');
  assert.equal(w.call(`wikiHref({kind:"category", id:"help_products"})`), '#wiki/c/help_products');
  // A half-typed escape is a route that does not exist, not an exception.
  assert.doesNotThrow(() => w.call(`wikiParse("wiki/%E0%A4%A")`));
  assert.equal(w.call(`wikiParse("wiki/%")`).kind, 'page');
  assert.equal(w.call(`wikiParse("wiki/q/%E0")`).query, '%E0');
  assert.equal(w.call(`wikiHref({kind:"home", query:"gift shop"})`), '#wiki/q/gift%20shop');
  assert.equal(w.call(`wikiHref({kind:"home", query:""})`), '#wiki');
});

test('opening another page starts at its own top, however far down its link was', async () => {
  const w = wiki();
  await w.load('wiki');
  w.context.window.scrollY = 900;
  await w.go('wiki/products-cheapgift');
  assert.deepEqual(w.scrolled, [[0, 0]]);
  // Typing in the search is not a new page, so the reader is left where they are.
  w.root.fire('input', {target: {closest: sel => sel === '#wikiSearch' ? {value: 'gift'} : null}});
  assert.equal(w.scrolled.length, 1);
});

test('the catalogue is fetched once, with the build stamp on it', async () => {
  const w = wiki();
  await w.load('wiki');
  assert.deepEqual(w.fetched, ['wiki-data.json?v=stamp1']);
  await w.go('wiki/products-cheapgift');
  await w.go('wiki');
  assert.equal(w.fetched.length, 1, 'moving around the wiki does not fetch it again');
});

/* --- failure, and the way out of it ------------------------------------- */

test('a catalogue that will not load says so and offers a retry that works', async () => {
  let attempts = 0;
  const w = wiki({fetchImpl: async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('network down');
    return {ok: true, status: 200, json: async () => DATA};
  }});
  const failed = await w.load('wiki');
  assert.match(failed, /could not be opened/);
  assert.match(failed, /network down/);
  assert.match(failed, /data-wiki-retry/);
  assert.doesNotMatch(failed, /undefined/);
  // The retry is the button the reader can actually see.
  w.root.fire('click', {target: {closest: sel => sel === '[data-wiki-retry]' ? {} : null}});
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  assert.equal(attempts, 2);
  assert.match(w.root.innerHTML, /Business Types/);
});

test('a catalogue this build does not understand is refused rather than half-drawn', async () => {
  const w = wiki({data: {schemaVersion: 99, pages: [{id: 'x', title: 'X', body: ''}]}});
  const html = await w.load('wiki');
  assert.match(html, /does not understand/);
  const empty = wiki({data: {schemaVersion: 1, pages: [], categories: []}});
  assert.match(await empty.load('wiki'), /carries no pages/);
});

test('a page the catalogue does not have is a said-so, not a dead link', async () => {
  const w = wiki();
  const html = await w.load('wiki/not-a-page');
  assert.match(html, /Not here/);
  assert.match(html, /No page called/);
  assert.match(html, /href="#wiki"/);
});

/* --- search -------------------------------------------------------------- */

test('search ranks a name that starts with the words above one that contains them', async () => {
  const w = wiki();
  await w.load('wiki');
  const ids = query => [...w.call(`wikiFind(${JSON.stringify(query)})`)].map(h => h.id);
  // Gift (Cheap) and Gift Shop both open with the word, alphabetically; Gift
  // Wrap's title opens with something else, so it comes after both.
  assert.deepEqual(ids('gift'), ['products-cheapgift', 'businesstypes-giftshop', 'products-giftwrap']);
  assert.deepEqual(ids('GIFT'), ids('gift'), 'case is not a filter');
  assert.deepEqual(ids(''), [], 'an empty search finds nothing, rather than everything');
  assert.deepEqual(ids('nothing called this'), []);
});

test('a search finds pages by their category too', async () => {
  const w = wiki();
  await w.load('wiki');
  const hits = w.call('wikiFind("business types")').map(h => h.id);
  assert.ok(hits.includes('businesstypes-florist'), 'the Florist is found through its category');
});

test('searching draws the rows, counts them and dims the categories that hold none', async () => {
  const w = wiki();
  await w.load('wiki/q/florist');
  const html = w.root.innerHTML;
  assert.match(html, /href="#wiki\/businesstypes-florist"/);
  assert.match(html, /<em>Florist<\/em>/i, 'the matched letters are marked');
  assert.match(html, /<span class="wk-cnt">1<\/span>/, 'the count is the number of pages found');
  assert.match(html, /class="wk-cat rv" href="#wiki\/c\/common_business_types"/, 'the category holding the hit stays lit');
  assert.match(html, /class="wk-cat rv off" href="#wiki\/c\/common_sellable_products"[^>]*tabindex="-1"/,
    'the one that holds none steps back and out of the tab order');
});

test('typing into the search rewrites the route without filling the Back button', async () => {
  let pushes = 0, replaces = 0;
  const w = wiki();
  w.context.history = {pushState(){pushes++;}, replaceState(){replaces++;}};
  await w.load('wiki');
  w.root.fire('input', {target: {closest: sel => sel === '#wikiSearch' ? {value: 'gift'} : null}});
  assert.equal(pushes, 0, 'a keystroke is not a visit');
  assert.equal(replaces, 1);
  assert.match(w.root.innerHTML, /href="#wiki\/businesstypes-giftshop"/);
});

/* A search box that behaves like one: the caret is where the reader put it. */
function searching(w) {
  const field = {value: '', selectionStart: 0, selectionEnd: 0, focused: false,
    focus(){ this.focused = true; w.context.document.activeElement = this; },
    setSelectionRange(a, b){ this.selectionStart = a; this.selectionEnd = b; },
    closest(sel){ return sel === '#wikiSearch' ? this : null; }};
  // $ hands the module this field wherever it asks for the search.
  const inner = w.context.$;
  w.context.$ = id => (id === 'wikiSearch' ? field : inner(id));
  return field;
}

test('the caret survives a redraw, including when the last letter is cleared', async () => {
  const w = wiki();
  await w.load('wiki');
  const field = searching(w);
  field.value = 'gift';
  field.focused = true;
  w.context.document.activeElement = field;
  field.selectionStart = field.selectionEnd = 2;   // the reader is editing mid-string
  w.root.fire('input', {target: field});
  assert.equal(field.focused, true, 'the field keeps the focus it had');
  assert.deepEqual([field.selectionStart, field.selectionEnd], [2, 2], 'and the caret stays where it was');

  field.value = '';
  field.selectionStart = field.selectionEnd = 0;
  w.root.fire('input', {target: field});
  assert.equal(field.focused, true, 'clearing the last letter does not feel like the control died');
});

test('a click on Show all leaves the search alone', async () => {
  const w = wiki();
  await w.load('wiki/q/gift');
  const field = searching(w);
  field.value = 'gift';
  w.context.document.activeElement = null;      // the reader clicked a button, not the field
  w.root.fire('click', {target: {closest: sel => sel === '[data-wiki-all]' ? {} : null}});
  assert.equal(field.focused, false, 'focus is not stolen from whatever the reader clicked');
});

test('a redraw lets go of a note whose carrier it is about to remove', async () => {
  const w = wiki();
  await w.load('wiki');
  const before = w.tipsDropped.length;
  await w.go('wiki/businesstypes-giftshop');
  assert.ok(w.tipsDropped.length > before, 'the tip layer is told before the page under it changes');
});

test('a long result list is cut, and the reader can ask for all of it', async () => {
  const many = {...DATA, pages: Array.from({length: 40}, (_, i) => ({
    id: `products-thing${i}`, categoryId: 'common_sellable_products', title: `Thing ${i}`, body: 'A thing.'})) };
  const w = wiki({data: many});
  await w.load('wiki/q/thing');
  assert.equal((w.root.innerHTML.match(/class="wk-hit"/g) || []).length, 10);
  assert.match(w.root.innerHTML, /Show all 40/);
  w.root.fire('click', {target: {closest: sel => sel === '[data-wiki-all]' ? {} : null}});
  assert.equal((w.root.innerHTML.match(/class="wk-hit"/g) || []).length, 40);
});

/* --- categories ---------------------------------------------------------- */

test('a category lists the pages this build actually holds', async () => {
  const w = wiki();
  const html = await w.load('wiki/c/common_business_types');
  assert.match(html, /Business Types/, 'the game\'s own name for it');
  assert.match(html, /href="#wiki\/businesstypes-giftshop"/);
  assert.match(html, /href="#wiki\/businesstypes-florist"/);
  assert.doesNotMatch(html, /href="#wiki\/products-cheapgift"/, 'and nothing from another category');
  assert.match(html, /2 pages/);
});

test('the shelf leads with what a player reaches for, keeping the file\'s ids and counts', async () => {
  const w = wiki();
  const html = await w.load('wiki');
  const order = [...html.matchAll(/href="#wiki\/c\/([a-z_]+)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['common_business_types', 'common_sellable_products', 'help_importers', 'help_general'],
    'business types first and general last, whatever order the help menu stores');
  // The one label the game writes as a file path reads as a shelf here; the
  // rest keep the game's own words.
  assert.match(html, /<b>Wholesalers &amp; importers<\/b>/);
  assert.match(html, /<b>Goods and Services<\/b>/);
  assert.match(html, /<b>Business Types<\/b>/);
  assert.equal((html.match(/class="wk-cat rv"/g) || []).length, CATEGORY_COUNT);
});

test('a page that only its category names still lands in that category', async () => {
  const w = wiki();
  await w.load('wiki');
  const page = w.call('wikiData.byId.get("products-giftwrap")');
  assert.equal(page.categoryId, 'common_sellable_products', 'the category list fills in what the page left out');
});

/* --- the game's own markdown -------------------------------------------- */

test('a link to a page this build has becomes a link; one it has not stays words', async () => {
  const w = wiki();
  const florist = await w.load('wiki/businesstypes-florist');
  assert.match(florist, /<a class="wk-link" href="#wiki\/products-cheapgift">Gift \(Cheap\)<\/a>/);
  const gift = await w.go('wiki/businesstypes-giftshop');
  assert.match(gift, /href="#wiki\/wholesalers-locations"/, 'a slug this build does have is a link');
  assert.doesNotMatch(gift, /href="#wiki\/furniture-stackofshoppingbaskets"/,
    'a slug the help points at but this build has no page for is not offered as one');
  assert.match(gift, /Stack of Shopping Baskets/, 'the words it was wearing are still there');
});

test('help text is rendered as data: no markup, no scripts, no strange links', async () => {
  const w = wiki();
  const html = await w.load('wiki/products-giftwrap');
  assert.doesNotMatch(html, /<img src=x/, 'a title that is markup is escaped');
  assert.match(html, /&lt;img src=x onerror=/);
  assert.doesNotMatch(html, /alert\(1\)"/);
  assert.match(html, /&lt;b&gt;nobody&lt;\/b&gt;/, 'markup inside the body is escaped too');
  // common_exercise is one of the help's own dangling links: it degrades.
  assert.doesNotMatch(html, /href="#wiki\/common_exercise"/);
  assert.match(html, /See Exercise\./);
});

test('a hostile link target can never become a href', () => {
  const w = wiki();
  const out = w.call(`wikiInline('[click](javascript:alert(1)) and [x](" onmouseover=alert(2) ")', {})`);
  assert.doesNotMatch(out, /href/);
  assert.doesNotMatch(out, /javascript:/);
  assert.doesNotMatch(out, /onmouseover/);
  assert.match(out, /click/);
});

test('bullets, label lines and a bold that never closes all survive', () => {
  const w = wiki();
  const blocks = w.call(`wikiBlocks(${JSON.stringify(GIFT_BODY)})`);
  const kinds = blocks.map(b => b.kind);
  assert.ok(kinds.includes('ul'), 'the furniture list is a list');
  assert.ok(kinds.includes('h'), 'the line that titles it is a heading');
  const html = w.call(`wikiBody(${JSON.stringify(GIFT_BODY)}, {})`);
  assert.match(html, /<ul class="wk-list">/);
  assert.match(html, /<h3 class="wk-lab">Product Capacity: 40<\/h3>|\*\*Product Capacity: 40/,
    'an unclosed bold stays the characters the game wrote');
  assert.doesNotMatch(html, /<b>Product Capacity: 40/);
  assert.match(html, /<b>Gift Shop<\/b>/, 'a bold that does close is a bold');
});

test('the game bolds whole sentences, links and all, and the links still work', async () => {
  const w = wiki();
  await w.load('wiki');
  const out = w.call(`wikiInline('**[Gift Shops](businesstypes-giftshop) and more**:', {})`);
  assert.match(out, /<b><a class="wk-link" href="#wiki\/businesstypes-giftshop">Gift Shops<\/a> and more<\/b>/);
  assert.doesNotMatch(out, /\]\(/, 'nothing of the markdown is left showing');
});

/* --- addresses and the city map ----------------------------------------- */

test('every way the help writes an address resolves to one building key', () => {
  const w = wiki();
  const cases = [
    ['13 5a', 'ba:street_fifthavenue#13'],
    ['13 5th Avenue', 'ba:street_fifthavenue#13'],
    ['13 Fifth Avenue', 'ba:street_fifthavenue#13'],
    ['16 11s', 'ba:street_eleventhstreet#16'],
    ['2 25th Street', 'ba:street_twentyfifthstreet#2'],
    ['4 Pier', 'ba:street_pier#4'],
    ['4 pier', 'ba:street_pier#4'],
    // The two streets the help shortens by name rather than by number.
    ['5 bw', 'ba:street_broadwaystreet#5'],
    ['15 Broadway Street', 'ba:street_broadwaystreet#15'],
    ['1 tur', 'ba:street_hamptonsturnpike#1'],
  ];
  for (const [address, key] of cases)
    assert.equal(w.call(`wikiAddressKey(${JSON.stringify(address)})`), key, address);
  for (const junk of ['', 'Somewhere', '13', 'address: 4 pier', '99 99th Boulevard'])
    assert.equal(w.call(`wikiAddressKey(${JSON.stringify(junk)})`), null, junk);
});

test('the keys the sample resolves to are real buildings on the shipped map', () => {
  const w = wiki();
  const known = new Set(LOCATIONS.buildings.map(b => b.key));
  for (const supplier of Object.values(SAMPLE.SUPPLIERS)) {
    const key = w.call(`wikiAddressKey(${JSON.stringify(supplier.street)})`);
    assert.ok(key, `${supplier.name} has no key`);
    assert.ok(known.has(key), `${supplier.name} (${supplier.street}) resolved to ${key}, which is not on the map`);
  }
});

test('an address becomes a pin only once the map confirms the building', async () => {
  const w = wiki();
  const marks = [
    {dataset: {addr: '13 5th Avenue'}, isConnected: true, insertAdjacentHTML(_, html){ this.html = html; }},
    {dataset: {addr: 'Nowhere At All'}, isConnected: true, insertAdjacentHTML(_, html){ this.html = html; }},
  ];
  w.root.querySelectorAll = () => marks;
  w.context.loadCityMap = async () => ({byKey: new Map([['ba:street_fifthavenue#13',
    {key: 'ba:street_fifthavenue#13', address: '13 Fifth Avenue', hood: 'Garment District'}]])});
  w.context.mapButton = (key, label) => `<button data-map-key="${key}" aria-label="Show ${label} on map"></button>`;
  w.run('wikiPins');
  await new Promise(r => setImmediate(r));
  assert.match(marks[0].html, /data-map-key="ba:street_fifthavenue#13"/,
    'a confirmed address opens the map through the board\'s own shortcut');
  assert.equal(marks[1].html, undefined, 'an address the map does not know gets no control at all');
});

test('with no map data at all the addresses still read', async () => {
  const w = wiki();
  const mark = {dataset: {addr: '13 5th Avenue'}, isConnected: true, insertAdjacentHTML(){ throw new Error('no'); }};
  w.root.querySelectorAll = () => [mark];
  w.context.loadCityMap = async () => { throw new Error('map is missing'); };
  w.context.mapButton = () => '';
  w.run('wikiPins');
  await new Promise(r => setImmediate(r));
  assert.ok(true, 'a map that will not load does not take the page down with it');
});

/* --- the real catalogue, when this checkout has one ---------------------- */
/* web/wiki-data.json is built from an installed game, so it is not in every
   checkout. Where it is, every page it carries goes through the reader here:
   the corpus is the only place the game's own oddities all show up at once. */

const REAL = path.join(__dirname, '..', 'web', 'wiki-data.json');
const real = fs.existsSync(REAL) ? JSON.parse(fs.readFileSync(REAL, 'utf8')) : null;

test('every page of the shipped catalogue renders without leaking its source', {skip: !real}, async () => {
  const w = wiki({data: real});
  await w.load('wiki');
  const trouble = [];
  for (const page of real.pages) {
    const html = w.call(`wikiBody(wikiData.byId.get(${JSON.stringify(page.id)}).body, {id:${JSON.stringify(page.id)}})`);
    const text = html.replace(/<[^>]*>/g, '');
    if (/<(?!\/?(b|ul|li|p|h3|a|span|br)\b)/.test(html)) trouble.push([page.id, 'unexpected markup']);
    if (/\]\(/.test(text)) trouble.push([page.id, 'a link the reader did not render']);
    if (/javascript:|onerror=|onclick=/i.test(html)) trouble.push([page.id, 'something that could run']);
    // Locale keys and file names are evidence, not reading: they live behind
    // the disclosure, never in the page's own words.
    if (/help_[a-z_:]+_content|ba:[a-z]+_[a-z0-9]+/.test(text)) trouble.push([page.id, 'a source key in the reading']);
  }
  assert.deepEqual(trouble, []);
});

test('every address the shipped catalogue links to is a building on the map', {skip: !real}, () => {
  const w = wiki({data: real});
  const known = new Set(LOCATIONS.buildings.map(b => b.key));
  const raw = new Set();
  for (const page of real.pages)
    for (const match of page.body.matchAll(/\]\(address:\s*([^)\n]*)\)/g)) raw.add(match[1].trim());
  const unresolved = [...raw].filter(address => {
    const key = w.call(`wikiAddressKey(${JSON.stringify(address)})`);
    return !key || !known.has(key);
  });
  assert.deepEqual(unresolved, [], 'an address that resolves to nothing would be a pin that goes nowhere');
  assert.ok(raw.size > 20, 'and the corpus really does carry addresses');
  // The extraction resolves the sample's suppliers itself; the two agree.
  for (const [key, supplier] of Object.entries(real.sample.SUPPLIERS))
    assert.equal(w.call(`wikiAddressKey(${JSON.stringify(supplier.street)})`), key, supplier.name);
});

/* --- the authored page --------------------------------------------------- */

test('the verified business is drawn as the design draws it', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-giftshop');
  for (const heading of ['To open', 'Sells', 'Fits together', 'Make it', 'Where to go', 'Yours', 'Source'])
    assert.match(html, new RegExp(`<h2>${heading}</h2>`), heading);
  assert.match(html, /Gift Shop/);
  assert.equal((html.match(/class="wk-group rv"/g) || []).length, 4, 'the room, fixtures, stock and people');
  assert.match(html, /1 of its 2 products can be ordered from any wholesaler/);
  assert.match(html, /100<small>\/h<\/small>/);
  assert.match(html, /2,400\/day/, 'the day figure is the hourly maximum times 24');
  assert.match(html, /The game&#39;s own words|The game's own words/, 'the help text itself is still readable');
});

test('the page claims help, and claims a second file only for what was read in one', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-giftshop');
  // The fixtures were counted in the shops the game ships, so that much is a
  // second kind of file — and the chip says exactly that much.
  assert.match(html, /<i><\/i>fixtures counted in shipped shops</);
  assert.doesNotMatch(html, /Every claim on this page/, 'no blanket claim over the whole page');
  assert.match(html, /class="chip help"[^>]*><i><\/i>game help</);
  // Two help pages agreeing is help agreeing with itself, and says so.
  assert.match(html, /class="chip help"[^>]*>.{0,400}read both ways/s);
  assert.doesNotMatch(html, /checked both ways/);

  const bare = wiki({data: {...DATA, sample: {...SAMPLE,
    FIXTURES: Object.fromEntries(Object.entries(SAMPLE.FIXTURES).map(([k, f]) => [k, {...f, observed: null}])),
    PRODUCTS: Object.fromEntries(Object.entries(SAMPLE.PRODUCTS).map(([k, p]) => [k, {...p, crosscheck: null}]))}}});
  const plain = await bare.load('wiki/businesstypes-giftshop');
  assert.doesNotMatch(plain, /counted in shipped shops/, 'nothing counted, nothing claimed');
  assert.doesNotMatch(plain, /read both ways/);
  assert.doesNotMatch(plain, /class="chip ok"/, 'and no green badge anywhere on it');
});

test('the checklist fills a square only where the business page itself requires it', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-giftshop');
  // Its own words, from its own requirements list.
  assert.match(html, /class="wk-item req"[^>]*data-tick="req-stackofshoppingbaskets"/s);
  assert.match(html, /Point of Sales/, 'in the page\'s own wording, not ours');
  assert.match(html, /At least one product to sell/);
  // A shelf the business page never mentions is a suggestion, not a rule.
  assert.match(html, /class="wk-item" [^>]*data-tick="fix-roundedshelf"/s);
  assert.doesNotMatch(html, /class="wk-item req"[^>]*data-tick="fix-roundedshelf"/s);

  const quiet = wiki({data: {...DATA, pages: DATA.pages.map(p => p.id === 'businesstypes-giftshop'
    ? {...p, body: '**Gift Shop** businesses operate out of retail buildings.'} : p)}});
  const html2 = await quiet.load('wiki/businesstypes-giftshop');
  assert.doesNotMatch(html2, /data-tick="req-/, 'a page that requires nothing fills no squares');
  assert.match(html2, /data-tick="fix-roundedshelf"/, 'the suggestions are still there');

  // Where the extraction states the requirements itself, that list wins over
  // the page text this reader would otherwise parse.
  const told = wiki({data: {...DATA, sample: {...SAMPLE, BUSINESS: {...SAMPLE.BUSINESS,
    requirements: ['A Cash Register', {name: 'Rounded Shelf'}]}}}});
  const html3 = await told.load('wiki/businesstypes-giftshop');
  assert.match(html3, /class="wk-item req"[^>]*data-tick="req-cashregister"/s);
  assert.match(html3, /class="wk-item req"[^>]*data-tick="req-roundedshelf"/s);
  assert.doesNotMatch(html3, /data-tick="req-stackofshoppingbaskets"/,
    'the page text is not consulted once the extraction has answered');
});

test('the Paper Bags catch is marked only while the business page really omits it', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-giftshop');
  assert.match(html, /Paper Bags/, 'the till\'s own page names them');
  assert.match(html, /wk-catch/, 'and this page does not, so it is marked');
  assert.match(html, /does not mention them at all/);

  const told = wiki({data: {...DATA, pages: DATA.pages.map(p => p.id === 'businesstypes-giftshop'
    ? {...p, body: p.body.replace('* At least one product to sell (see below)',
        '* At least one product to sell (see below)\n* [Paper Bag](products-paperbag)')} : p)}});
  const html2 = await told.load('wiki/businesstypes-giftshop');
  assert.doesNotMatch(html2, /wk-catch/, 'a page that does name them is not accused of leaving them out');
  assert.doesNotMatch(html2, /does not mention them at all/);
});

test('wholesale is three states, and only one of them is a claim', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-giftshop');
  assert.match(html, /Any wholesaler/);
  assert.match(html, /wk-pill no[^>]*>No wholesaler listed/);
  assert.match(html, /That is the help being silent, not a rule in the game/);
  assert.match(html, /<b>Gift \(Expensive\) is on no wholesaler's list\.<\/b>/);
  assert.doesNotMatch(html, /products? cannot|cannot be ordered|cannot buy/,
    'an absence in the help is never written up as a prohibition');

  const unsure = wiki({data: {...DATA, sample: {...SAMPLE, PRODUCTS: {...SAMPLE.PRODUCTS,
    expensivegift: {...SAMPLE.PRODUCTS.expensivegift, wholesale: null}}}}});
  const html2 = await unsure.load('wiki/businesstypes-giftshop');
  assert.match(html2, /Wholesale not stated/);
  assert.doesNotMatch(html2, /No wholesaler listed/, 'unknown never becomes a no');
  assert.doesNotMatch(html2, /wk-pill no/);
  assert.match(html2, /the help does not say either way/);
});

test('a recipe with no stated rate shows no rate, and no day figure derived from one', async () => {
  const w = wiki({data: {...DATA, sample: {...SAMPLE, RECIPES: {cheapgiftrecipe: {
    ...SAMPLE.RECIPES.cheapgiftrecipe,
    inputs: [{item: 'Clay', per: null, from: [HARVEST]}],
    out: {item: 'Gift (Cheap)', per: null}}}}}});
  const html = await w.load('wiki/businesstypes-giftshop');
  assert.match(html, /rate not stated/);
  assert.doesNotMatch(html, /0<small>\/h<\/small>/, 'no invented zero');
  assert.doesNotMatch(html, /0\/day/);
  assert.doesNotMatch(html, /null|undefined|NaN/);
  assert.match(html, /<b class="none">—<\/b>/);
});

test('a fixture with no stated capacity shows none, rather than an empty number', async () => {
  const w = wiki({data: {...DATA, sample: {...SAMPLE, FIXTURES: {...SAMPLE.FIXTURES,
    roundedshelf: {...SAMPLE.FIXTURES.roundedshelf, capacity: [], customers: null}}}}});
  const html = await w.load('wiki/businesstypes-giftshop');
  const shelf = html.slice(html.indexOf('data-tick="fix-roundedshelf"'), html.indexOf('data-tick="fix-storageshelf"'));
  assert.match(shelf, /Rounded Shelf/);
  assert.doesNotMatch(shelf, /holds <b>/, 'no capacity stated, none shown');
  assert.doesNotMatch(html, /<b><\/b>/);
  assert.doesNotMatch(html, /null|undefined|NaN/);
  // What the shipped shops hold was still counted, so that much is still said.
  assert.match(html, /Counted in the shops the game ships/);

  const silent = wiki({data: {...DATA, sample: {...SAMPLE, FIXTURES: {...SAMPLE.FIXTURES,
    roundedshelf: {name: 'Rounded Shelf', sells: ['cheapgift'], vendors: [PEDERSON]}}}}});
  const bare = await silent.load('wiki/businesstypes-giftshop');
  assert.match(bare, /Its help page gives no numbers for this one/);
  assert.doesNotMatch(bare, /null|undefined|NaN/);
});

test('a place wears the board\'s own two letters and keeps its house number', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-giftshop');
  // The Hamptons is HA everywhere else on the board, and so it is here.
  assert.match(html, /<span class="hood" data-tip="The Hamptons">HA<\/span>/);
  assert.doesNotMatch(html, />TH</, 'not initials of our own invention');
  // 4 Pier and 9 Pier are different buildings: the number is the address.
  assert.match(html, /Bluestone Imports<b>4 Pier<\/b>/);
  assert.doesNotMatch(html, /<b>Pier<\/b>/);
  assert.match(html, /data-map-id="ba:street_pier#4"/, 'and the pin goes to that one');

  const nowhere = wiki({data: {...DATA, sample: {...SAMPLE, SUPPLIERS: Object.fromEntries(
    Object.entries(SAMPLE.SUPPLIERS).map(([k, s]) => [k, {...s, hood: 'Somewhere Else'}]))}}});
  const html2 = await nowhere.load('wiki/businesstypes-giftshop');
  assert.doesNotMatch(html2, /class="hood"/, 'a neighbourhood the board does not name wears no pill');
});

test('the weekly-limit note is the extraction\'s own, not lore typed into the page', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-giftshop');
  assert.match(html, /caps each item per week and resets Monday 08:00/, 'quoted from the gap the file records');
  assert.doesNotMatch(html, /Sunday 20:00/, 'nothing the extraction did not say');

  // Detailed gap notes stay under Source, with readable names instead of keys.
  const keyed = wiki({data: {...DATA, sample: {...SAMPLE, GAPS: [{what: 'Weekly delivery limits',
    detail: 'help_wholesalers_weeklylimits_content says every wholesaler caps each item per week.'}]}}});
  const html3 = await keyed.load('wiki/businesstypes-giftshop');
  const where = html3.slice(html3.indexOf('<h2>Where to go</h2>'), html3.indexOf('<h2>Yours</h2>'));
  assert.doesNotMatch(where, /help_wholesalers|caps each item per week/);
  const source = html3.slice(html3.indexOf('<h2>Source</h2>'));
  assert.doesNotMatch(source, /help_wholesalers/);
  assert.match(source, /the help's own page says every wholesaler caps each item per week/);

  const quiet = wiki({data: {...DATA, sample: {...SAMPLE, GAPS: []}}});
  const html2 = await quiet.load('wiki/businesstypes-giftshop');
  assert.doesNotMatch(html2, /Monday 08:00/, 'no gap recorded, no claim made');
});

test('the day figure is named as an assumption, not as a measurement', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-giftshop');
  assert.match(html, /maximum hourly rate times 24/);
  assert.match(html, /assumes the line runs all day, uninterrupted and at full rate/);
  assert.doesNotMatch(html, /never idles/);
  assert.doesNotMatch(html, /measured factory draw/);
});

test('no page claims the game files carry no prices anywhere', async () => {
  const w = wiki();
  for (const hash of ['wiki', 'wiki/businesstypes-giftshop', 'wiki/products-cheapgift']) {
    const html = await w.go(hash);
    assert.doesNotMatch(html, /no prices anywhere/i, hash);
    assert.doesNotMatch(html, /carries no price/i, hash);
  }
});

test('the stamp dates the game files and names a build only as a save build', async () => {
  const w = wiki();
  const html = await w.load('wiki');
  assert.match(html, /game files of 2026-09-03/);
  assert.doesNotMatch(html, /build 3675/, 'the mockup\'s number is not a fact about this install');
  assert.doesNotMatch(html, /25231854/, 'Steam\'s depot id is not the save build');
  assert.doesNotMatch(html, /save build/, 'this catalogue states none, so none is shown');

  const known = wiki({data: {...DATA, provenance: {...DATA.provenance, saveBuildNumber: 3675}}});
  const html2 = await known.load('wiki');
  assert.match(html2, /save build 3,?675/);
  assert.match(html2, /The build number a save reports/);
});

test('a page the sample does not cover is a reader, not the authored layout', async () => {
  const w = wiki();
  const html = await w.load('wiki/products-cheapgift');
  assert.doesNotMatch(html, /<h2>To open<\/h2>/);
  assert.match(html, /class="wk-read rv"/);
  assert.match(html, /Gift \(Cheap\)/);
  assert.match(html, /href="#wiki\/businesstypes-giftshop"/, 'its links reach the pages that exist');
  assert.match(html, /Where this page comes from/);
});

test('the relation graph wires products to fixtures and to their supply', async () => {
  const w = wiki();
  await w.load('wiki/businesstypes-giftshop');
  const model = w.call(`wikiGraphModel([
    {key:"cheapgift", ...wikiData.sample.PRODUCTS.cheapgift},
    {key:"expensivegift", ...wikiData.sample.PRODUCTS.expensivegift}])`);
  const edges = model.edges.map(e => e.join('|'));
  assert.ok(edges.includes('p:cheapgift|f:roundedshelf|on'), 'a product sits on its fixture');
  assert.ok(edges.includes(`p:cheapgift|s:${BLUESTONE}|hop`), 'and reaches its importer behind the shelves');
  assert.ok(edges.includes('p:cheapgift|s:wholesale|hop'));
  assert.ok(!edges.includes('p:expensivegift|s:wholesale|hop'),
    'the product with no wholesaler has no line to one');
  assert.equal(model.nodes.product.length, 2);
  assert.ok(model.nodes.source.some(n => n.id === 's:station'), 'and the factory is a source like any other');
});

/* A graph the module can drive: three lanes of nodes, the paths a redraw would
   make, a foot with the seat the ball waits in, and the ball itself. */
function fakeGraph(w, edges) {
  const graph = element('wikiGraph');
  graph.dataset.edges = JSON.stringify(edges);
  graph.getBoundingClientRect = () => ({top: 0, left: 0, right: 900, bottom: 400, width: 900, height: 400});
  const ids = [...new Set(edges.flatMap(e => [e[0], e[1]]))];
  const nodes = ids.map(id => {
    const n = element(id); n.dataset.node = id; n.querySelector = () => ({textContent: id}); return n;
  });
  const sampled = [];
  const makePaths = () => edges.map(([a, b, kind]) => {
    const p = element('path');
    p.dataset.a = a; p.dataset.b = b;
    if (kind === 'hop') p.classList.add('hop');
    p.getTotalLength = () => 100;
    p.getPointAtLength = at => { sampled.push([`${a}->${b}`, at]); return {x: at, y: 10}; };
    return p;
  });
  let paths = makePaths();
  const ball = element('ball'), shadow = element('shadow'), say = element('say');
  const foot = element('foot');
  foot.getBoundingClientRect = () => ({top: 350, left: 0, right: 900, bottom: 390, width: 900, height: 40});
  const park = element('park');
  park.getBoundingClientRect = () => ({top: 350, left: 800, right: 852, bottom: 390, width: 52, height: 40});
  const letgo = element('letgo');
  const svg = element('svg');
  graph.querySelector = sel => ({'.wk-say': say, '.wk-ball': ball, '.wk-shadow': shadow, '.wk-graphfoot': foot,
    '.wk-park': park, '.wk-wires': svg, '[data-wiki-letgo]': letgo})[sel] || null;
  w.context.$ = id => (id === 'wikiGraph' ? graph : id === 'wikiRoot' ? w.root : null);
  w.context.$$ = sel => sel === '.wk-node' ? nodes
    : sel === 'path' ? paths
    : sel === 'path.lit' ? paths.filter(p => p.classList.contains('lit'))
    : [];
  return {graph, nodes, ball, shadow, say, letgo, sampled,
    paths: () => paths,
    /* What a resize does: fresh path elements in place of the old ones. */
    rebuild(){ paths.forEach(p => { p.isConnected = false; }); paths = makePaths(); },
  };
}

test('picking a node lights its own lines and nothing else', async () => {
  const w = wiki();
  await w.load('wiki/businesstypes-giftshop');
  const g = fakeGraph(w, [['p:a', 'f:b', 'on'], ['p:a', 's:c', 'hop'], ['p:d', 'f:b', 'on']]);
  w.call('wikiPick("p:a")');
  assert.ok(g.graph.classList.contains('picked'));
  assert.deepEqual(g.nodes.map(n => n.classList.contains('lit')), [true, true, true, false]);
  assert.deepEqual(g.paths().map(p => p.classList.contains('lit')), [true, true, false]);
  assert.match(g.say.textContent, /2 links/);
  assert.equal(g.letgo.hidden, false, 'and the way to let go is offered');
  w.call('wikiPick(null)');
  assert.ok(!g.graph.classList.contains('picked'));
  assert.equal(g.say.textContent, '');
  assert.equal(g.letgo.hidden, true);
});

test('a resize redraws the wires and the pick survives it', async () => {
  const w = wiki();
  await w.load('wiki/businesstypes-giftshop');
  const g = fakeGraph(w, [['p:a', 'f:b', 'on'], ['p:a', 's:c', 'hop']]);
  w.call('wikiPick("p:a")');
  assert.deepEqual(g.paths().map(p => p.classList.contains('lit')), [true, true]);
  g.rebuild();                       // the layout changed; these are new paths
  assert.deepEqual(g.paths().map(p => p.classList.contains('lit')), [false, false]);
  w.call('wikiWires()');
  assert.deepEqual(g.paths().map(p => p.classList.contains('lit')), [true, true],
    'the fresh wires are lit from the pick, not left cold until the next click');
  assert.equal(w.call('wikiPicked'), 'p:a');
});

test('the ball rides supply into the product first, then the product onto its shelf', async () => {
  const frames = [];
  const w = wiki();
  w.context.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
  await w.load('wiki/businesstypes-giftshop');
  const g = fakeGraph(w, [['p:a', 'f:b', 'on'], ['p:a', 's:c', 'hop']]);
  w.call('wikiPick("p:a")');
  assert.ok(frames.length, 'the ball is running');
  frames[frames.length - 1](0);
  const [leg, at] = g.sampled[0];
  assert.equal(leg, 'p:a->s:c', 'the dashed supply line is ridden first');
  assert.equal(at, 100, 'and from the supplier end, so the goods travel into the product');
  g.sampled.length = 0;
  frames[frames.length - 1](5000);   // past the end of that leg
  assert.equal(g.sampled[0][1], 0, 'it arrives at the product');
  frames[frames.length - 1](5001);
  assert.equal(g.sampled[1][0], 'p:a->f:b', 'and only then goes on to the shelf');
  assert.equal(g.sampled[1][1], 0, 'that one is ridden the way it is drawn');
});

test('with nothing picked the ball parks on the rule instead of vanishing', async () => {
  const w = wiki();
  await w.load('wiki/businesstypes-giftshop');
  const g = fakeGraph(w, [['p:a', 'f:b', 'on']]);
  w.call('wikiPick(null)');
  assert.equal(g.ball.hidden, false, 'it is still there');
  assert.equal(g.ball.style.transform, 'translate(804.0px,328.0px)', 'sitting in its seat on the rule');
  assert.equal(g.shadow.hidden, false);
});

test('with motion turned down the ball stays parked and no frame is asked for', async () => {
  const frames = [];
  const w = wiki();
  w.context.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
  w.context.REDUCED = true;
  await w.load('wiki/businesstypes-giftshop');
  const g = fakeGraph(w, [['p:a', 'f:b', 'on'], ['p:a', 's:c', 'hop']]);
  frames.length = 0;
  w.call('wikiPick("p:a")');
  assert.equal(frames.length, 0, 'nothing is animated');
  assert.equal(g.ball.hidden, false, 'and the ball is parked, not hidden');
  assert.match(g.ball.style.transform, /^translate\(/);
});

test('the ball stops when the wiki is no longer the page on screen', async () => {
  const frames = [];
  const w = wiki();
  w.context.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
  await w.load('wiki/businesstypes-giftshop');
  fakeGraph(w, [['p:a', 's:c', 'hop']]);
  w.call('wikiPick("p:a")');
  const before = frames.length;
  w.context.page = 'today';
  frames[frames.length - 1](0);
  assert.equal(frames.length, before, 'no further frame is asked for once the page has gone');
});

/* --- the strip a save fills --------------------------------------------- */

test('with no save open the page says what it would show, and shows no number', async () => {
  const w = wiki();
  const html = await w.load('wiki/products-cheapgift');
  assert.match(html, /no save open/);
  assert.match(html, /Open a save/);
  assert.doesNotMatch(html, /wk-slot/, 'and invents nothing to fill the strip with');
});

test('with a save open the strip is that save\'s own numbers, matched by name', async () => {
  const w = wiki({save: {
    products: [{item: 'Gift (Cheap)', revenue: 500, units: 40, week: 280, stock: 100, stores: 2, price: 12.5}],
    businesses: [{name: 'Gifts R Us', type: 'Gift Shop', key: 'k1'}],
    market: {rows: [{item: 'Gift (Cheap)', cells: [{hood: 'Midtown', demand: 72}, {hood: 'Hamptons', demand: 30}]}]},
  }});
  const html = await w.load('wiki/products-cheapgift');
  assert.match(html, /from your save/);
  assert.match(html, /72 in Midtown/, 'demand comes from the save\'s own snapshot');
  assert.match(html, /2 shops/);
  assert.match(html, /\$12\.50/, 'a unit price is written out rather than rounded into a lie');
  assert.doesNotMatch(html, /\$13</);
});

test('a save that says nothing about this page leaves the strip empty and says why', async () => {
  const w = wiki({save: {products: [], businesses: [], market: {rows: []}}});
  const html = await w.load('wiki/products-cheapgift');
  assert.match(html, /Nothing in the open save matches this page/);
});

/* --- the hand-off to Growth ---------------------------------------------- */

test('the Growth hand-off really selects the range when the planner has it', async () => {
  const w = wiki({save: {plan: {catalogue: {'ba:businesstype_giftshop': {type: 'Gift Shop', products: ['x']}}},
    products: [], businesses: [], market: {rows: []}}});
  await w.load('wiki/businesstypes-giftshop');
  assert.equal(w.call('wikiCanPlan()'), true);
  assert.equal(w.call('wikiPlanChain()'), true);
  assert.equal(w.context.planType, 'ba:businesstype_giftshop');
  assert.deepEqual(w.drawn, [['sub', 'growth', 'plan'], ['page', 'growth'], ['plan', 'ba:businesstype_giftshop']]);
});

test('with no save the hand-off is a sentence, never a button that does nothing', async () => {
  const w = wiki();
  const slot = element('wikiPlanSlot');
  w.context.$ = id => (id === 'wikiRoot' ? w.root : id === 'wikiPlanSlot' ? slot : null);
  await w.load('wiki/businesstypes-giftshop');
  assert.equal(w.call('wikiCanPlan()'), false);
  assert.doesNotMatch(slot.innerHTML, /<button/);
  assert.match(slot.innerHTML, /Open a save to plan this range/);
  assert.equal(w.call('wikiPlanChain()'), false, 'and asking anyway changes nothing');
  assert.deepEqual(w.drawn, []);
});

test('a save whose catalogue lacks the type says that, rather than offering the button', async () => {
  const w = wiki({save: {plan: {catalogue: {}}, products: [], businesses: [], market: {rows: []}}});
  const slot = element('wikiPlanSlot');
  w.context.$ = id => (id === 'wikiRoot' ? w.root : id === 'wikiPlanSlot' ? slot : null);
  await w.load('wiki/businesstypes-giftshop');
  assert.doesNotMatch(slot.innerHTML, /<button/);
  assert.match(slot.innerHTML, /Not in this save's catalogue|Not in this save&#39;s catalogue/);
});

/* --- the squares you tick ------------------------------------------------ */

test('a setup square is a real checkbox, and each card keeps its own score', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-giftshop');
  assert.match(html, /role="checkbox"/, 'the square answers to the keyboard like a checkbox');
  assert.match(html, /aria-checked="false"/);
  assert.match(html, /<b>0\/\d<\/b>/, 'and its card opens with an empty score');

  const items = ['stock-one', 'stock-bag'].map(id => {
    const item = element(id);
    item.dataset.tick = id;
    item.checked = 'false';
    item.setAttribute = (name, value) => { if (name === 'aria-checked') item.checked = value; };
    return item;
  });
  const bar = element('ph');
  bar.style = {setProperty(name, value){ bar.done = value; }};
  const score = {textContent: ''};
  const group = element('group');
  group.querySelector = sel => (sel === '.wk-ph' ? bar : sel === 'b' ? score : null);
  bar.querySelector = () => score;
  w.context.$$ = sel => (sel === '.wk-group' ? [group] : sel === '[data-tick]' ? items : []);

  w.context.tickTarget = items[1];
  w.call('wikiTick(tickTarget)');
  assert.equal(items[1].checked, 'true');
  assert.ok(items[1].classList.contains('done'));
  assert.equal(score.textContent, '1/2');
  assert.equal(bar.done, 0.5);
  w.call('wikiTick(tickTarget)');
  assert.equal(items[1].checked, 'false', 'and ticking it again lets it go');
  assert.equal(score.textContent, '0/2');
});
