/* The guides: one page per customer-facing business, drawn from the payload's
   own record for that business and nothing else.

   The fixture here is synthetic and deliberately awkward — a shop whose range
   is half other people's products, a hairdresser that sells services and one
   thing on a shelf, an office with neither, a supermarket too wide to draw at
   once, and a product that names a recipe page this build does not have. The
   real payload arrives from the extraction; these hold whatever it carries.

    node --test tests/wiki-guides.test.cjs
*/
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const WIKI = fs.readFileSync(path.join(__dirname, '..', 'web', 'wiki.js'), 'utf8');
/* web/i18n.js runs ahead of wiki.js on the page: the Wiki's own words go
   through its tt(). */
const I18N = fs.readFileSync(path.join(__dirname, '..', 'web', 'i18n.js'), 'utf8');
/* The board's neighbourhood tables, as render() writes them in: keyed by the
   game's key, the words looked up only to be shown. */
const HOOD_EN = {midtown: 'Midtown', hellskitchen: "Hell's Kitchen", murrayhill: 'Murray Hill',
  lowermanhattan: 'Lower Manhattan', garmentdistrict: 'Garment District', industrycity: 'Industry City',
  thehamptons: 'The Hamptons'};
const HOOD_TAGS = Object.fromEntries(Object.entries({midtown: 'MT', hellskitchen: 'HK', murrayhill: 'MH',
  lowermanhattan: 'LM', garmentdistrict: 'GD', industrycity: 'IC', thehamptons: 'HA'})
  .map(([id, tag]) => [`ba:neighborhood_${id}`, tag]));
const hoodName = key => HOOD_EN[String(key || '').replace(/^ba:neighborhood_/, '')] || String(key || '').replace(/^ba:neighborhood_/, '');


/* --- the fixture --------------------------------------------------------- */

const PEDERSON = 'ba:street_fifthavenue#13';
const BLUESTONE = 'ba:street_pier#4';
const DEPOT = 'ba:street_twentyfifthstreet#2';
const ANDERSON = 'ba:street_fifthavenue#16';
const SALON = 'ba:street_broadwaystreet#7';

const SUPPLIERS = {
  [PEDERSON]: {name: 'AJ Pederson & Son', street: '13 Fifth Avenue', hood: 'ba:neighborhood_garmentdistrict',
    kind: 'Furniture vendor', size: 'M', area: 1000, traffic: 45},
  [BLUESTONE]: {name: 'Bluestone Imports', street: '4 Pier', hood: 'ba:neighborhood_murrayhill',
    kind: 'Importer - retail inventory', size: 'H', area: 690, traffic: 18},
  [DEPOT]: {name: 'Factory Supply Depot', street: '2 Twenty-fifth Street', hood: 'ba:neighborhood_industrycity',
    kind: 'Factory machine vendor', size: 'M', area: 1000, traffic: 37},
  [ANDERSON]: {name: 'Anderson Recruitment Corp.', street: '16 Fifth Avenue', hood: 'ba:neighborhood_thehamptons',
    kind: 'Recruitment', size: 'C', area: 225, traffic: 50},
  [SALON]: {name: 'Salon Supplies Co.', street: '7 Broadway Street', hood: 'ba:neighborhood_midtown',
    kind: 'Furniture vendor', size: 'S', area: 400, traffic: 30},
};

/* A coffee shop: two products of its own, two more it also carries, one recipe
   shared by two of them, another workstation for the third, and a fourth that
   names a recipe page this build no longer has. */
const COFFEE = {
  SOURCES: {sourceDate: '2026-09-10', files: []},
  SUPPLIERS,
  WHOLESALERS: [{name: 'Hudson Wholesale', street: '13 Twelfth Street', hood: 'ba:neighborhood_lowermanhattan'}],
  FIXTURES: {
    coffeemachine: {name: 'Coffee Machine', sells: ['coffee', 'tea'], customers: 25, vendors: [PEDERSON],
      capacity: [{label: 'Coffee', value: 200, unit: 'units'}, {label: 'Cold drinks', value: 120, unit: 'units'}],
      station: 'Customer Service', needs: ['Paper Cup'], mount: null},
    cakestand: {name: 'Cake Stand', sells: ['cake'], customers: null, vendors: [PEDERSON], station: null,
      needs: null, mount: null, capacity: [{label: 'Cakes', value: 60, unit: 'units'}]},
  },
  PRODUCTS: {
    coffee: {name: 'Coffee', slug: 'ba:itemname_coffee', rank: 'primary', kind: 'product',
      pageId: 'products-coffee', alsoSoldBy: ['Restaurants'], fixtures: ['coffeemachine'],
      wholesale: true, importers: [BLUESTONE], recipe: 'brew', recipes: ['brew']},
    tea: {name: 'Tea', slug: 'ba:itemname_tea', rank: 'primary', kind: 'product', pageId: null,
      alsoSoldBy: [], fixtures: ['coffeemachine'], wholesale: true, importers: [], recipes: ['brew']},
    cake: {name: 'Cake', slug: 'ba:itemname_cake', rank: 'additional', kind: 'product', pageId: null,
      alsoSoldBy: ['Bakeries'], fixtures: ['cakestand'], wholesale: false, importers: [BLUESTONE],
      recipes: ['bake'], fixtureCapacities: {cakestand: [{label: 'Cakes', value: 60, unit: 'units'}]}},
    mug: {name: 'Mug', slug: 'ba:itemname_mug', rank: 'additional', kind: 'product', pageId: null,
      alsoSoldBy: [], fixtures: [], wholesale: null, importers: [], recipes: ['engrave']},
  },
  RECIPES: {
    brew: {name: 'Brew Recipe', workstation: 'Beverage Workstation', workstationKey: 'beverage',
      pageId: 'recipes-brew', inputs: [{item: 'Coffee Beans', per: 40, from: [BLUESTONE]}],
      out: {item: 'Coffee', per: 100}},
    bake: {name: 'Bake Recipe', workstation: 'Bakery Workstation', workstationKey: 'bakery',
      pageId: 'recipes-bake', inputs: [{item: 'Flour', per: 20, from: []}],
      out: {item: 'Cake', per: 30}},
  },
  WORKSTATIONS: {
    beverage: {name: 'Beverage Workstation', src: 'help_beverage', assembly: 'Beverage Assembly Machine',
      production: ['Grinder'], vendors: [DEPOT], runs: ['Coffee', 'Tea']},
    bakery: {name: 'Bakery Workstation', src: 'help_bakery', assembly: 'Bakery Assembly Machine',
      production: ['Oven'], vendors: [DEPOT], runs: ['Cake']},
  },
  BUSINESS: {slug: 'businesstypes-coffeeshop', name: 'Coffee Shop', nameSrc: 'ba:businesstype_coffeeshop',
    building: 'Retail', serving: 'Served', skills: ['Customer Service'], hiring: [ANDERSON],
    primary: ['coffee', 'tea'], secondary: ['cake', 'mug'], extras: [],
    lede: 'A coffee shop serves what it brews.',
    notes: [{text: 'Cakes come from the [Bakery](businesstypes-bakery) range.', src: 'help_x'}],
    requirements: {src: 'help_x', raw: ['[Coffee Machine](furniture-coffeemachine)',
      'At least one product to sell'], note: 'kept as written'}},
  RETAIL_SIZES: [{code: 'A1', area: 75, customers: 15}, {code: 'M1', area: 1000, customers: 75}],
  GAPS: [{what: 'Cake rate', detail: 'help_recipes_bake_content gives no rate for one input.'}],
};

/* A hairdresser: its own range is services, and the one thing on a shelf is
   carried on the side. The requirement lines are the shapes the game's own help
   really writes — the file's bullet marker still on them, an alternative inside
   one line, and each service repeating what the business page already asks for.
   The two chairs have no record of their own here, as they have none in the
   payload this was written against. */
const HAIR = {
  SOURCES: {sourceDate: '2026-09-10', files: []},
  SUPPLIERS,
  WHOLESALERS: [],
  FIXTURES: {
    cashregister: {name: 'Cash Register', sells: [], customers: 20, vendors: [PEDERSON],
      station: 'Customer Service', needs: ['Paper Bag'], mount: null,
      capacity: [{label: 'Products', value: 1000, unit: 'units'}]},
    shelf: {name: 'Hairdresser Shelf', sells: ['haircare'], customers: 20, vendors: [PEDERSON],
      station: null, needs: null, mount: null, capacity: [{label: 'Products', value: 100, unit: 'units'}]},
    headwash: {name: 'Hairdresser Head Wash', sells: [], customers: 10, vendors: [SALON],
      station: 'Hair Stylist', needs: null, mount: null, capacity: []},
  },
  PRODUCTS: {
    haircut: {name: 'Hair Cutting Fee', slug: 'ba:itemname_haircut', rank: 'primary', kind: 'fee',
      pageId: 'products-haircut', alsoSoldBy: [], fixtures: [], wholesale: null, importers: [],
      recipes: [], automatic: false,
      requirementsRaw: ['* [Hairdresser Chair](furniture-chair) or [Hairdresser Chair (Modern)](furniture-chairmodern)',
        '* [Hair Stylist](skill-hairstylist)',
        '* [Hair Care Product](products-haircare)']},
    colouring: {name: 'Hair Chemical / Color Fee', slug: 'ba:itemname_colouring', rank: 'primary', kind: 'fee',
      pageId: null, alsoSoldBy: [], fixtures: [], wholesale: null, importers: [], recipes: [],
      automatic: true,
      requirementsRaw: ['* [Hairdresser Chair](furniture-chair) or [Hairdresser Chair (Modern)](furniture-chairmodern)',
        '* [Hair Stylist](skill-hairstylist)']},
    haircare: {name: 'Hair Care Product', slug: 'ba:itemname_haircare', rank: 'additional', kind: 'product',
      pageId: null, alsoSoldBy: ['Supermarkets'], fixtures: ['shelf'], wholesale: true, importers: [],
      recipes: []},
  },
  RECIPES: {},
  WORKSTATIONS: {},
  BUSINESS: {slug: 'businesstypes-hairdresser', name: 'Hairdresser', nameSrc: 'ba:businesstype_hairdresser',
    building: 'Retail', serving: 'Employee-served', skills: ['Hair Stylist', 'Cleaning'], hiring: ANDERSON,
    primary: ['haircut', 'colouring'], secondary: ['haircare'], extras: [], lede: null, notes: [],
    requirements: {src: 'help_h', raw: [
      '* [Cash Register](furniture-cashregister)',
      '* [Hairdresser Shelf](furniture-shelf)',
      '* [Hairdresser Chair](furniture-chair) or [Hairdresser Chair (Modern)](furniture-chairmodern)',
      '* [Hairdresser Head Wash](furniture-headwash)',
      '* [Hair Care Product](products-haircare)']}},
  RETAIL_SIZES: [{code: 'A1', area: 75, customers: 15}],
  GAPS: [],
};

/* An office: one fee, no shelves, no recipes, and no retail sizes to borrow. */
const LAW = {
  SOURCES: {sourceDate: '2026-09-10', files: []},
  SUPPLIERS: {[ANDERSON]: SUPPLIERS[ANDERSON], [PEDERSON]: SUPPLIERS[PEDERSON]},
  WHOLESALERS: [],
  FIXTURES: {
    // The workstation the office page requires is a component of other pieces,
    // so its own page names no vendor of its own.
    computerworkstation: {name: 'Computer Workstation', sells: [], customers: null, vendors: [],
      station: null, needs: null, mount: null, capacity: []},
    toilet: {name: 'Toilet', sells: [], customers: null, vendors: [PEDERSON], station: null,
      needs: null, mount: null, capacity: []},
  },
  PRODUCTS: {
    legalfee: {name: 'Lawyer Fee (Hourly)', slug: 'ba:itemname_legalfee', rank: 'primary', kind: 'fee',
      pageId: null, alsoSoldBy: [], fixtures: [], wholesale: null, importers: [], recipes: [],
      automatic: true,
      // The employee the fee names is the skill the business page already lists,
      // under the longer label the fee's own page uses.
      requirementsRaw: ['* [Computer Workstation](furniture-computerworkstation)',
        '* [Lawyer Employee](skill-lawyer)']},
  },
  RECIPES: {}, WORKSTATIONS: {},
  BUSINESS: {slug: 'businesstypes-lawfirm', name: 'Law Firm', nameSrc: 'ba:businesstype_lawfirm',
    building: 'Office', serving: 'Digital customers', skills: ['Lawyer', 'Cleaning'], hiring: [ANDERSON],
    primary: ['legalfee'], secondary: [], extras: [], lede: null, notes: [],
    requirements: {src: 'help_l', raw: ['* [Computer Workstation](furniture-computerworkstation)']}},
  RETAIL_SIZES: [],
  GAPS: [],
};

/* A supermarket: too wide for three lanes, so the graph asks which product. */
const WIDE_NAMES = ['Apples', 'Bread', 'Cheese', 'Dates', 'Eggs', 'Flour', 'Grapes', 'Honey'];
const WIDE = {
  SOURCES: {sourceDate: '2026-09-10', files: []},
  SUPPLIERS, WHOLESALERS: [{name: 'Hudson Wholesale', street: '13 Twelfth Street', hood: 'ba:neighborhood_lowermanhattan'}],
  FIXTURES: {rack: {name: 'Produce Rack', sells: [], customers: 12, vendors: [PEDERSON], station: null,
    needs: null, mount: null, capacity: [{label: 'Products', value: 150, unit: 'units'}]}},
  PRODUCTS: Object.fromEntries(WIDE_NAMES.map(name => [name.toLowerCase(), {
    name, slug: `ba:itemname_${name.toLowerCase()}`, rank: 'primary', kind: 'product', pageId: null,
    alsoSoldBy: [], fixtures: ['rack'], wholesale: true, importers: [BLUESTONE], recipes: []}])),
  RECIPES: {}, WORKSTATIONS: {},
  BUSINESS: {slug: 'businesstypes-supermarket', name: 'Supermarket', nameSrc: 'ba:businesstype_supermarket',
    building: 'Retail', serving: 'Self-serving', skills: [], hiring: [],
    primary: WIDE_NAMES.map(n => n.toLowerCase()), secondary: [], extras: [], lede: null, notes: [],
    requirements: {src: 'help_s', raw: []}},
  RETAIL_SIZES: [], GAPS: [],
};

/* A gym: a requirement that points at a group of furniture rather than at one
   piece, a staffing station that is not a till, and more equipment than a
   checklist can usefully hold at once. */
const MACHINES = ['Treadmill', 'Rowing Machine', 'Bench Press', 'Leg Press', 'Cable Tower',
  'Spin Bike', 'Squat Rack', 'Dumbbell Rack'];
const GYM = {
  SOURCES: {sourceDate: '2026-09-10', files: []},
  SUPPLIERS, WHOLESALERS: [],
  FIXTURES: {
    cashregister: {name: 'Cash Register', sells: [], customers: 20, vendors: [PEDERSON],
      station: 'Customer Service', needs: ['Paper Bag'], mount: null, group: 'furniture-itemgrouppointofsale',
      capacity: [{label: 'Products', value: 1000, unit: 'units'}]},
    checkoutcounter: {name: 'Checkout Counter', sells: [], customers: 30, vendors: [PEDERSON],
      station: 'Customer Service', needs: null, mount: null, groups: ['itemgrouppointofsale'],
      capacity: [{label: 'Products', value: 1000, unit: 'units'}]},
    // A station that is not a point of sale: it takes an employee, not a sale.
    trainerdesk: {name: 'Trainer Desk', sells: [], customers: 4, vendors: [SALON], station: 'Fitness',
      needs: null, mount: null, capacity: []},
    ...Object.fromEntries(MACHINES.map((name, i) => [`machine${i}`, {name, sells: [], customers: null,
      vendors: [SALON], station: null, needs: null, mount: null, capacity: []}])),
  },
  PRODUCTS: {
    cover: {name: 'Cover Charge', slug: 'ba:itemname_cover', rank: 'primary', kind: 'fee', pageId: null,
      alsoSoldBy: [], fixtures: [], wholesale: null, importers: [], recipes: [], automatic: true,
      requirementsRaw: []},
  },
  RECIPES: {}, WORKSTATIONS: {},
  BUSINESS: {slug: 'businesstypes-gym', name: 'Gym', nameSrc: 'ba:businesstype_gym',
    building: 'Retail', serving: 'Self-serving', skills: ['Fitness'], hiring: [ANDERSON],
    primary: ['cover'], secondary: [], extras: [], lede: null, notes: [],
    requirements: {src: 'help_g', raw: ['* [Point of Sales](furniture-itemgrouppointofsale)']}},
  RETAIL_SIZES: [], GAPS: [],
};

const PAGES = [
  {id: 'businesstypes-coffeeshop', categoryId: 'common_business_types', title: 'Coffee Shop',
    body: 'A **Coffee Shop** operates out of retail buildings.\n\nThe business requires the following furniture to function:\n\n* [Coffee Machine](furniture-coffeemachine)'},
  {id: 'businesstypes-hairdresser', categoryId: 'common_business_types', title: 'Hairdresser',
    body: 'A **Hairdresser** operates out of retail buildings.'},
  {id: 'businesstypes-lawfirm', categoryId: 'common_business_types', title: 'Law Firm',
    body: 'A **Law Firm** operates out of office buildings.'},
  {id: 'businesstypes-supermarket', categoryId: 'common_business_types', title: 'Supermarket',
    body: 'A **Supermarket** operates out of retail buildings.'},
  {id: 'businesstypes-gym', categoryId: 'common_business_types', title: 'Gym',
    body: 'A **Gym** operates out of retail buildings.'},
  {id: 'businesstypes-bakery', categoryId: 'common_business_types', title: 'Bakery', body: 'Bread.'},
  {id: 'furniture-itemgrouppointofsale', categoryId: 'common_furniture', title: 'Point of Sales', body: 'Tills.'},
  {id: 'products-coffee', categoryId: 'common_sellable_products', title: 'Coffee', body: 'Hot.'},
  {id: 'products-haircut', categoryId: 'common_sellable_products', title: 'Haircut', body: 'Short.'},
  {id: 'furniture-chair', categoryId: 'common_furniture', title: 'Hairdresser Chair', body: 'Sit.'},
  {id: 'furniture-chairmodern', categoryId: 'common_furniture', title: 'Hairdresser Chair (Modern)', body: 'Sit.'},
  {id: 'products-haircare', categoryId: 'common_sellable_products', title: 'Hair Care Product', body: 'Foam.'},
];

const DATA = {
  schemaVersion: 1,
  categories: [{id: 'common_business_types', label: 'Business Types', count: 5,
    pageIds: PAGES.filter(p => p.id.startsWith('businesstypes-')).map(p => p.id)}],
  pages: PAGES,
  guides: {
    'businesstypes-coffeeshop': COFFEE,
    'businesstypes-hairdresser': HAIR,
    'businesstypes-lawfirm': LAW,
    'businesstypes-supermarket': WIDE,
    'businesstypes-gym': GYM,
  },
  provenance: {sourceDate: '2026-09-10', saveBuildNumber: null, files: []},
};

/* --- the board around it ------------------------------------------------- */

function element(id) {
  return {
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
}

function wiki({data = DATA, save = null} = {}) {
  const root = element('wikiRoot');
  const nodes = new Map([['wikiRoot', root]]);
  const drawn = [];
  const context = vm.createContext({
    D: save, page: 'wiki', planType: null, planCounts: {}, REDUCED: false, console,
    $: id => nodes.get(id) || null,
    $$: () => [],
    attr: s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
    icon: name => `<svg data-icon="${name}"></svg>`,
    fmt: n => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US'),
    num: (n, opts) => Number(n).toLocaleString('en-US', opts),
    hasData: () => !!context.D,
    showPage(id){ drawn.push(['page', id]); },
    showSub(id, view){ drawn.push(['sub', id, view]); },
    drawPlan(){ drawn.push(['plan', context.planType]); },
    wireTips(){}, wireReveal(){}, hideTip(){},
    HOOD_TAGS, hoodName,
    requestAnimationFrame(){}, cancelAnimationFrame(){}, setTimeout(){},
    history: {replaceState(){}},
    matchMedia: () => ({matches: false, addEventListener(){}}),
    CSS: {escape: s => s},
    document: {addEventListener(){}, body: {classList: {add(){}, remove(){}}}, activeElement: null},
    window: {LEDGER_BUILD: 'stamp', addEventListener(){}, scrollY: 0, scrollTo(){}},
    fetch: async () => ({ok: true, status: 200, json: async () => data}),
  });
  context.window.window = context.window;
  vm.runInContext(I18N, context);
  vm.runInContext(WIKI, context);
  return {
    context, root, drawn,
    call: expr => vm.runInContext(expr, context),
    async load(hash) {
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
    click(selector, dataset) {
      root.fire('click', {target: {closest: sel => sel === selector ? {dataset} : null}});
      return root.innerHTML;
    },
  };
}

/* The slice of a page under one heading, so a claim can be pinned to the
   section that makes it. */
function section(html, heading) {
  const at = html.indexOf(`<h2>${heading}</h2>`);
  if (at < 0) return '';
  const next = html.indexOf('<section class="sec">', at);
  return next < 0 ? html.slice(at) : html.slice(at, next);
}
const headings = html => [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map(m => m[1]);
/* What a reader actually sees: the words between the tags, with everything
   inside a tag — a label for a screen reader, a note, a href — left out. */
const visible = html => String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
/* The row a square belongs to: the kind is on the row, the id on the square. */
function row(html, id) {
  const at = html.indexOf(`data-tick="${id}"`);
  if (at < 0) return '';
  const from = html.lastIndexOf('<div class="wk-item', at);
  return from < 0 ? '' : html.slice(from, html.indexOf('</div>', at) + 6);
}

/* --- every business gets the same page ----------------------------------- */

test('each business is drawn from its own guide, and never from another one\'s', async () => {
  const w = wiki();
  const coffee = await w.load('wiki/businesstypes-coffeeshop');
  assert.match(coffee, /<h1>Coffee Shop<\/h1>/);
  assert.match(coffee, /Coffee Machine/);
  // Nothing from the business next door: not its products, not its suppliers.
  assert.doesNotMatch(coffee, /Hairdresser|Hair Care|Salon Supplies|Legal Fee/);

  const hair = await w.go('wiki/businesstypes-hairdresser');
  assert.match(hair, /<h1>Hairdresser<\/h1>/);
  assert.match(hair, /Salon Supplies Co\./);
  assert.doesNotMatch(hair, /Coffee|Cake|Bakery Workstation/);

  // And the payload itself is untouched by the visit: a guide is read, never
  // written over the one the build shipped first.
  assert.equal(w.call('wikiData.sample'), null);
  assert.equal(w.call('Object.keys(wikiData.guides).length'), 5);
});

test('a page with no guide behind it is still the reader', async () => {
  const w = wiki();
  const html = await w.load('wiki/products-coffee');
  assert.deepEqual(headings(html), ['Yours']);
  assert.match(html, /class="wk-read rv"/);
  assert.doesNotMatch(html, /<h2>To open<\/h2>/);
});

/* --- what a shop also carries -------------------------------------------- */

test('everything a shop carries is a card, its own range and the rest alike', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-coffeeshop');
  const own = section(html, 'Sells');
  const also = section(html, 'Also sells');
  assert.match(own, /<h3>.*Coffee<\/a>|<h3>Coffee<\/h3>/s, 'its own range');
  assert.match(own, /Tea/);
  assert.doesNotMatch(own, /Cake|Mug/);
  // The side range is a section of cards of the same make, not a list of links.
  assert.match(also, /class="wk-card rv"/);
  assert.match(also, /Cake/);
  assert.match(also, /Mug/);
  assert.match(also, /<dt>Goes on<\/dt>/, 'the same three facts as the main range');
  assert.match(also, /<dt>Comes from<\/dt>/);
  assert.match(also, /also carried/, 'and it says which range it belongs to');
  assert.equal((html.match(/class="wk-card rv"/g) || []).length, 4, 'four products, four cards');
});

test('the recipes of the side range are on the page too, in their own section', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-coffeeshop');
  assert.ok(headings(html).includes('Make it'));
  assert.ok(headings(html).includes('Also make'));
  const rest = section(html, 'Also make');
  assert.match(rest, /Bake Recipe|Bakery Workstation/, 'the side range keeps its recipe');
  assert.match(rest, /30<small>\/h<\/small>/);
  assert.doesNotMatch(section(html, 'Make it'), /Bakery Workstation/);
});

test('a recipe two products share is drawn once and names them both', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-coffeeshop');
  const ours = section(html, 'Make it');
  assert.equal((ours.match(/Beverage Workstation/g) || []).length, 1, 'one flow, not one per product');
  assert.match(ours, /class="wk-for"/);
  assert.match(ours, /Coffee<b>primary<\/b>/);
  assert.match(ours, /Tea<b>primary<\/b>/);
});

test('each recipe runs on its own workstation, not on a single assumed one', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-coffeeshop');
  assert.match(section(html, 'Make it'), /Beverage Workstation/);
  assert.match(section(html, 'Also make'), /Bakery Workstation/);
  const model = w.call('wikiGraphModel(wikiOffers(wikiActive).filter(o => o.kind !== "fee"), wikiActive)');
  const stations = model.nodes.source.filter(n => n.sub === 'your factory').map(n => n.name);
  assert.equal([...stations].sort().join(' · '), 'Bakery Workstation · Beverage Workstation');
});

test('a recipe page this build has lost is a gap on the page, not a silence', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-coffeeshop');
  const rest = section(html, 'Also make');
  assert.match(rest, /Recipe page missing/);
  assert.match(rest, /class="chip bad"/, 'and it wears the gap badge');
  assert.match(rest, /Mug/, 'named by the product that points at it');
  assert.doesNotMatch(html, /null|undefined|NaN/);
});

/* --- services ------------------------------------------------------------- */

test('a service card carries what the help says it depends on, and no shelf', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-hairdresser');
  const services = section(html, 'Services');
  assert.match(services, /Hair Cutting Fee/);
  assert.match(services, /Hair Chemical \/ Color Fee/);
  // The dependency lines keep the help's own wording, alternatives included,
  // and the links in them reach the pages this build has. Every line the source
  // gives is here, whether or not the setup list repeats it.
  assert.match(services, /Hairdresser Chair<\/a> or <a class="wk-link"[^>]*>Hairdresser Chair \(Modern\)/);
  assert.match(services, /Hair Stylist/);
  assert.match(services, /Hair Care Product/);
  assert.equal((services.match(/class="wk-need"/g) || []).length, 5, 'three lines and two');
  // The file's own bullet marker is the file's, not a word the card shows.
  assert.doesNotMatch(services, /class="wk-need">\s*\*/);
  assert.doesNotMatch(services, /&gt;\s*\*|>\* /);
  // A fee is charged, not stocked.
  assert.doesNotMatch(services, /Any wholesaler|No wholesaler listed|Wholesale not stated/);
  assert.doesNotMatch(services, /<dt>Goes on<\/dt>/);
  assert.doesNotMatch(services, /Your factory/);
});

test('a fee is called automatic only where its own page says so', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-hairdresser');
  const services = section(html, 'Services');
  const colouring = services.slice(services.indexOf('Hair Chemical'));
  assert.match(colouring, /Automatic/);
  const haircut = services.slice(services.indexOf('Hair Cutting Fee'), services.indexOf('Hair Chemical'));
  assert.doesNotMatch(haircut, /Automatic/);
});

test('a shop of services still shows the goods it carries, as cards', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-hairdresser');
  const also = section(html, 'Also sells');
  assert.match(also, /Hair Care Product/);
  assert.match(also, /Hairdresser Shelf<b>100<\/b>/, 'with its shelf and its capacity');
  assert.match(section(html, 'Fits together'), /Hair Care Product/);
});

/* --- the opening checklist, against the shapes the help really writes -------- */

test('the alternatives a requirement offers are kept, on the card they belong to', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-hairdresser');
  const open = section(html, 'To open');
  const kit = open.slice(open.indexOf('<h3>Fixtures</h3>'), open.indexOf('<h3>Stock</h3>'));
  const stock = open.slice(open.indexOf('<h3>Stock</h3>'), open.indexOf('<h3>People</h3>'));
  // One line, both chairs, the help's own "or" — and it is equipment, however
  // little the payload knows about either chair.
  assert.match(kit, /Hairdresser Chair<\/a> or <a class="wk-link"[^>]*>Hairdresser Chair \(Modern\)/);
  assert.match(kit, /class="wk-item req"/, 'the page requires it, so the square is filled');
  assert.equal((visible(open).match(/Hairdresser Chair \(Modern\)/g) || []).length, 1, 'named once, not twice');
  assert.doesNotMatch(stock, /Hairdresser Chair/, 'furniture is never stock');
  // The product the business page requires is in stock, once.
  assert.equal((visible(stock).match(/Hair Care Product/g) || []).length, 1);
  // The skill the services ask for is the skill the business page lists, once.
  const people = open.slice(open.indexOf('<h3>People</h3>'));
  assert.equal((visible(people).match(/Hair Stylist/g) || []).length, 1);
});

test('the file\'s own bullet marker never reaches the reader', async () => {
  const w = wiki();
  for (const id of ['businesstypes-hairdresser', 'businesstypes-lawfirm', 'businesstypes-gym']) {
    const html = await w.go(`wiki/${id}`);
    const text = html.replace(/<[^>]*>/g, ' ');
    assert.doesNotMatch(text, /(^|\s)\*\s+\w/, `${id}: a source bullet marker in the reading`);
    assert.doesNotMatch(html, /<strong>\*/, id);
  }
});

test('an office repeats neither its workstation nor its lawyer', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-lawfirm');
  const open = section(html, 'To open');
  // The fee asks for the workstation the business page already requires.
  assert.equal((visible(open).match(/Computer Workstation/g) || []).length, 1);
  const people = open.slice(open.indexOf('<h3>People</h3>'));
  assert.match(people, /Lawyer/);
  assert.doesNotMatch(visible(people), /Lawyer Employee/, 'the longer label is the same person');
  assert.equal((people.match(/data-tick=/g) || []).length, 2, 'the two skills the page lists');
  // And the service card still carries every line the source gives it.
  const services = section(html, 'Services');
  assert.match(services, /Computer Workstation/);
  assert.match(services, /Lawyer Employee/);
});

test('a service requirement the business page does not name is kept, and placed', async () => {
  const data = JSON.parse(JSON.stringify(DATA));
  // The caption these rows wear is authored beside the payload.
  data.COPY = {conditionalRequirements: 'Before adding these products'};
  const law = data.guides['businesstypes-lawfirm'];
  law.PRODUCTS.legalfee.requirementsRaw = [
    // Richer than the business page's line: a second piece it does not offer.
    '* [Computer Workstation](furniture-computerworkstation) or [Standing Desk](furniture-standingdesk)',
    '* [Notary Stamp](products-notarystamp)',
    '* [Paralegal](skill-paralegal)',
  ];
  const w = wiki({data});
  const open = section(await w.load('wiki/businesstypes-lawfirm'), 'To open');
  const kit = open.slice(open.indexOf('<h3>Fixtures</h3>'), open.indexOf('<h3>Stock</h3>'));
  const stock = open.slice(open.indexOf('<h3>Stock</h3>'), open.indexOf('<h3>People</h3>'));
  const people = open.slice(open.indexOf('<h3>People</h3>'));
  assert.match(kit, /Standing Desk/, 'an alternative the business page does not offer is equipment');
  assert.match(kit, /Before adding these products/, 'and it says whose requirement it is');
  assert.doesNotMatch(stock, /Standing Desk/);
  assert.match(stock, /Notary Stamp/);
  assert.match(people, /Paralegal/);
  // The alternative is one line, not two things to buy.
  assert.equal((kit.match(/data-tick="[^"]*:need-/g) || []).length, 1);
  assert.match(kit, /Computer Workstation<\/a> or <a class="wk-link"[^>]*>Standing Desk|Computer Workstation or Standing Desk/);
});

/* --- who does the hiring ----------------------------------------------------- */
/* The payload gathers a business's recruiters from the help pages of all its
   skills at once. That list says which agencies this business's skills name
   between them, and nothing about which agency takes which skill. */

test('recruiters are named once for the business, not once per skill', async () => {
  const data = JSON.parse(JSON.stringify(DATA));
  data.COPY = {recruitmentTitle: 'Recruitment', recruitmentHint: 'Recruiters named by this business.'};
  const hair = data.guides['businesstypes-hairdresser'];
  hair.SUPPLIERS[SALON] = {...SUPPLIERS[SALON], name: 'Style Recruitment', kind: 'Recruitment'};
  hair.BUSINESS.hiring = [ANDERSON, SALON];
  const w = wiki({data});
  const open = section(await w.load('wiki/businesstypes-hairdresser'), 'To open');
  const people = open.slice(open.indexOf('<h3>People</h3>'));
  // Each agency once, under one label, however many skills the business lists.
  assert.match(people, /class="wk-sub"[^>]*>Recruitment</);
  assert.equal((visible(people).match(/Anderson Recruitment Corp\./g) || []).length, 1);
  assert.equal((visible(people).match(/Style Recruitment/g) || []).length, 1);
  assert.equal((people.match(/data-tick=/g) || []).length, 2, 'the skills are the things to do');
  // No skill claims an agency of its own, and none says where it is hired.
  assert.doesNotMatch(people, /Hair Stylist<\/strong>\s*<span class="wk-m">[^<]*Recruitment/);
  assert.doesNotMatch(people, /Hired at/);
  // The glance tile names them without assigning them either.
  const tile = (await w.go('wiki/businesstypes-hairdresser')).match(/data-tip="([^"]*)"[^>]*>\s*<span class="lab">Staff skills/);
  assert.ok(tile && /Recruitment: Anderson Recruitment Corp\., 16 Fifth Avenue; Style Recruitment/.test(tile[1]), tile && tile[1]);
  assert.ok(tile && !/Hired at/.test(tile[1]));
});

test('one agency is still one agency, and a mapping the payload verifies is used', async () => {
  const w = wiki();
  const open = section(await w.load('wiki/businesstypes-lawfirm'), 'To open');
  const people = open.slice(open.indexOf('<h3>People</h3>'));
  assert.equal((visible(people).match(/Anderson Recruitment Corp\./g) || []).length, 1);
  assert.match(people, /16 Fifth Avenue/);

  // Where the payload says which agency hires which skill, the skill can say so.
  const data = JSON.parse(JSON.stringify(DATA));
  const law = data.guides['businesstypes-lawfirm'];
  law.SUPPLIERS[SALON] = {...SUPPLIERS[SALON], name: 'Bar Association Hiring', kind: 'Recruitment'};
  law.BUSINESS.hiring = [ANDERSON, SALON];
  law.BUSINESS.hiringBySkill = {Lawyer: [SALON], Cleaning: [ANDERSON]};
  const told = wiki({data});
  const open2 = section(await told.load('wiki/businesstypes-lawfirm'), 'To open');
  const people2 = open2.slice(open2.indexOf('<h3>People</h3>'));
  const lawyer = people2.slice(people2.indexOf('Lawyer'), people2.indexOf('Cleaning'));
  assert.match(lawyer, /Bar Association Hiring/);
  assert.doesNotMatch(lawyer, /Anderson/);
  assert.doesNotMatch(people2, /class="wk-sub"/, 'the aggregate list is not repeated under it');
});

test('a requirement names the page it links to, not whatever name it contains', async () => {
  /* The shape the office pages really have: the workstation is a piece of its
     own, and a Computer is one of the components an office can also hold. One
     name contains the other; the link does not. */
  const data = JSON.parse(JSON.stringify(DATA));
  const law = data.guides['businesstypes-lawfirm'];
  law.FIXTURES.computerworkstation.pageId = 'furniture-computerworkstation';
  law.FIXTURES.computer = {name: 'Computer', sells: [], customers: null, vendors: [PEDERSON],
    station: null, needs: null, mount: null, capacity: [], pageId: 'furniture-computer',
    group: ['computergroup']};
  law.FIXTURES.laptop = {name: 'Laptop', sells: [], customers: null, vendors: [PEDERSON],
    station: null, needs: null, mount: null, capacity: [], pageId: 'furniture-laptop',
    group: ['computergroup']};
  const w = wiki({data});
  const open = section(await w.load('wiki/businesstypes-lawfirm'), 'To open');
  const kit = open.slice(open.indexOf('<h3>Fixtures</h3>'));
  const workstation = row(kit, 'businesstypes-lawfirm:req-computerworkstation');
  assert.match(workstation, /^<div class="wk-item req"/, 'the piece its own link names');
  assert.doesNotMatch(visible(workstation), /·\s*Computer\b/, 'and not the component whose name it contains');
  assert.doesNotMatch(kit, /data-tick="[^"]*:req-computerworkstation\+/, 'nothing else joined that requirement');
  // Nothing asked for the Computer, so it is still one of the suggestions.
  assert.match(kit, /data-tick="businesstypes-lawfirm:fix-computer"/);
  assert.match(kit, /data-tick="businesstypes-lawfirm:fix-laptop"/);
});

test('a group requirement still names every piece the payload puts in it', async () => {
  const data = JSON.parse(JSON.stringify(DATA));
  const law = data.guides['businesstypes-lawfirm'];
  law.BUSINESS.requirements.raw.push('* [Bathrooms](furniture-bathrooms)');
  law.FIXTURES.toiletstall = {name: 'Bathroom Stall', sells: [], customers: null, vendors: [PEDERSON],
    station: null, needs: null, mount: null, capacity: [], group: ['bathrooms']};
  law.FIXTURES.toilet.group = ['bathrooms'];
  const w = wiki({data});
  const open = section(await w.load('wiki/businesstypes-lawfirm'), 'To open');
  const kit = open.slice(open.indexOf('<h3>Fixtures</h3>'));
  // The square is keyed to the pieces the group resolved to, in payload order.
  const id = /data-tick="(businesstypes-lawfirm:req-(?:toilet\+toiletstall|toiletstall\+toilet))"/.exec(kit);
  assert.ok(id, kit.slice(0, 400));
  const bathrooms = row(kit, id[1]);
  assert.match(bathrooms, /^<div class="wk-item req"/);
  assert.match(visible(bathrooms), /Bathroom Stall · Toilet|Toilet · Bathroom Stall/,
    'both members, under the one requirement');
  assert.doesNotMatch(kit, /data-tick="businesstypes-lawfirm:fix-toilet"/, 'and neither is listed again');
  assert.doesNotMatch(kit, /data-tick="businesstypes-lawfirm:fix-toiletstall"/);
});

/* The shape the office pages really ship. The workstation the business page
   requires names its own parts in one sentence of prose, each part pointing at
   one of the game's furniture groups, and every component page carries that
   same sentence back. The business page's own bullets name no desk, no chair
   and no computer, and there are more components than the short list shows. */
const DESKS = ['Standard Office Desk', 'Executive Office Desk (Left)', 'Executive Office Desk (Right)'];
const CHAIRS = ['Gaming Chair', 'Office Chair', 'Regular Chair', 'Multipurpose Chair',
  'Sommerhus Arm Chair', 'Gammel Arm Chair', 'James Lawns Chair', 'Stump Mesh Office Chair'];
const MACHINES_PC = ['Computer', 'Laptop', 'ZanaMan Computer', 'Basic Gaming PC Setup'];
const WORKSTATION_LINE = 'It requires a [Desk](furniture-deskgroup) and a [Chair](furniture-chairgroup)'
  + ' and a [Computer](furniture-computergroup)';
function office(line = WORKSTATION_LINE) {
  const data = JSON.parse(JSON.stringify(DATA));
  const law = data.guides['businesstypes-lawfirm'];
  law.FIXTURES.computerworkstation.pageId = 'furniture-computerworkstation';
  law.FIXTURES.computerworkstation.requirementsRaw = [
    '* [Computer Workstation](furniture-computerworkstation)', '* [Lawyer Employee](skill-lawyer)', line];
  const piece = (name, group) => ({name, sells: [], customers: null, vendors: [PEDERSON], station: null,
    needs: null, mount: null, capacity: [], groups: [group], requirementsRaw: [line],
    pageId: `furniture-${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`});
  DESKS.forEach((name, i) => { law.FIXTURES[`desk${i}`] = piece(name, 'deskgroup'); });
  CHAIRS.forEach((name, i) => { law.FIXTURES[`chair${i}`] = piece(name, 'chairgroup'); });
  MACHINES_PC.forEach((name, i) => { law.FIXTURES[`pc${i}`] = piece(name, 'computergroup'); });
  // The groups the sentence points at are pages of their own, as they are in
  // the shipped payload: "Desk Options", "Chair Options", "Computer Options".
  [['furniture-deskgroup', 'Desk Options'], ['furniture-chairgroup', 'Chair Options'],
    ['furniture-computergroup', 'Computer Options']].forEach(([id, title]) =>
    data.pages.push({id, categoryId: 'common_furniture', title, body: 'The pieces that count as one.'}));
  return {data, law};
}
/* The equipment card alone: the rows this fix is about are all inside it. */
function kitOf(html) {
  const open = section(html, 'To open');
  const at = open.indexOf('<h3>Fixtures</h3>');
  const kit = open.slice(at);
  const end = kit.indexOf('<h3>', 4);
  return end < 0 ? kit : kit.slice(0, end);
}

test('what the required piece needs in turn is a requirement, not a suggestion', async () => {
  const {data} = office();
  const w = wiki({data});
  const kit = kitOf(await w.load('wiki/businesstypes-lawfirm'));
  // Three requirements out of one sentence, because the sentence says "and".
  const linked = [...kit.matchAll(/data-tick="businesstypes-lawfirm:(fix-need-[^"]+)"/g)].map(m => m[1]);
  assert.equal(linked.length, 3, kit);
  for (const id of linked) assert.match(row(kit, `businesstypes-lawfirm:${id}`), /^<div class="wk-item req"/,
    'a filled square: the help says it is required');
  assert.match(kit, /class="wk-sub"[^>]*>Equipment and service requirements</,
    'under the caption for what another page requires');
  // Each row is the help's own word for the group, still pointing at the group's
  // own page, with the pieces the payload puts in that group named under it.
  const desk = row(kit, `businesstypes-lawfirm:fix-need-${['desk0', 'desk1', 'desk2'].join('+')}`);
  assert.match(desk, /<a class="wk-link"[^>]*>Desk<\/a>/);
  assert.match(visible(desk), /Standard Office Desk · Executive Office Desk/,
    'the alternatives the payload puts in that group');
  // The sentence that asked for it is the note on the row, whole.
  assert.match(desk, /Computer Workstation requires this on its own help page/);
  // And no component is a suggestion, or behind the control that hides the tail.
  assert.doesNotMatch(kit, /data-wiki-fix/);
  for (const key of ['desk0', 'chair0', 'pc0', 'pc3'])
    assert.doesNotMatch(kit, new RegExp(`data-tick="businesstypes-lawfirm:fix-${key}"`));
  // The one piece nothing asked for is still where the suggestions are.
  assert.match(kit.slice(kit.indexOf('Additional equipment')), /data-tick="businesstypes-lawfirm:fix-toilet"/);
});

test('every computer choice is on the page before anything is expanded', async () => {
  const {data} = office();
  const w = wiki({data});
  const kit = kitOf(await w.load('wiki/businesstypes-lawfirm'));
  // The defect this replaces put all four behind "Show all 15".
  for (const name of MACHINES_PC) assert.match(visible(kit), new RegExp(name.replace(/[()]/g, '\\$&')),
    `${name} is not on the opening list`);
  assert.doesNotMatch(kit, /Show all/);
});

test('an "or" inside the sentence is one requirement with two answers', async () => {
  const {data} = office('It requires a [Desk](furniture-deskgroup) and a [Chair](furniture-chairgroup)'
    + ' or a [Computer](furniture-computergroup)');
  const w = wiki({data});
  const kit = kitOf(await w.load('wiki/businesstypes-lawfirm'));
  const linked = [...kit.matchAll(/data-tick="businesstypes-lawfirm:(fix-need-[^"]+)"/g)].map(m => m[1]);
  assert.equal(linked.length, 2, 'the "and" cuts the line; the "or" does not');
  // The clause the help wrote with a choice in it is kept as the help wrote it.
  const both = row(kit, `businesstypes-lawfirm:${linked[1]}`);
  assert.match(visible(both), /Chair or a Computer/);
  assert.match(both, /<a class="wk-link"/, 'and it keeps the help\'s own links');
});

test('a linked requirement the business page already names is not said twice', async () => {
  const {data, law} = office();
  // The bathrooms shape: the group is one bullet on the business page, and both
  // members carry that same bullet back from their own pages.
  law.BUSINESS.requirements.raw.push('* [Bathrooms](furniture-bathrooms)');
  law.FIXTURES.toiletstall = {name: 'Bathroom Stall', sells: [], customers: null, vendors: [PEDERSON],
    station: null, needs: null, mount: null, capacity: [], groups: ['bathrooms'],
    requirementsRaw: ['* [Bathrooms](furniture-bathrooms)']};
  law.FIXTURES.toilet.groups = ['bathrooms'];
  law.FIXTURES.toilet.requirementsRaw = ['* [Bathrooms](furniture-bathrooms)'];
  const w = wiki({data});
  const kit = kitOf(await w.load('wiki/businesstypes-lawfirm'));
  assert.equal((visible(kit).match(/Bathroom Stall/g) || []).length, 1, 'one row, under the business page');
  const linked = [...kit.matchAll(/data-tick="businesstypes-lawfirm:(fix-need-[^"]+)"/g)].map(m => m[1]);
  assert.equal(linked.length, 3, 'the workstation\'s three, and nothing for the bathrooms');
  // A skill named on the same equipment page is still the People card's line.
  assert.doesNotMatch(kit, /Lawyer/);
});

test('a requirement the help gives no link for is still read by its words', async () => {
  const w = wiki();
  // The Gift Shop page writes this one as plain text, with no link to follow.
  const open = section(await w.load('wiki/businesstypes-gym'), 'To open');
  assert.match(open, /Point of Sales/);
  assert.match(open, /Cash Register <b>20<\/b>\/h · Checkout Counter <b>30<\/b>\/h/, 'the group it names');
  const told = wiki({data: {...DATA, guides: {...DATA.guides, 'businesstypes-gym': {...GYM,
    BUSINESS: {...GYM.BUSINESS, requirements: {src: 'help_g', raw: ['A Cash Register of some kind']}}}}}});
  const plain = section(await told.load('wiki/businesstypes-gym'), 'To open');
  assert.match(plain, /data-tick="businesstypes-gym:req-cashregister"/, 'the words are all there is to go on');
});

test('a requirement that points at a group names the pieces the payload puts in it', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-gym');
  const open = section(html, 'To open');
  // The game's own group of tills: both members are named under the one line.
  assert.match(open, /Point of Sales/);
  assert.match(open, /Cash Register <b>20<\/b>\/h · Checkout Counter <b>30<\/b>\/h/);
  // And neither is listed again as a suggestion.
  assert.doesNotMatch(open, /data-tick="businesstypes-gym:fix-cashregister"/);
  assert.doesNotMatch(open, /data-tick="businesstypes-gym:fix-checkoutcounter"/);
  // A station that takes an employee is not a till: it stays a suggestion.
  assert.match(open, /data-tick="businesstypes-gym:fix-trainerdesk"/);
});

test('with no group behind it, the requirement stands on its own words', async () => {
  const bare = JSON.parse(JSON.stringify(DATA));
  Object.values(bare.guides['businesstypes-gym'].FIXTURES).forEach(f => { delete f.group; delete f.groups; });
  const w = wiki({data: bare});
  const open = section(await w.load('wiki/businesstypes-gym'), 'To open');
  assert.match(open, /Point of Sales/, 'the line the help wrote');
  assert.doesNotMatch(open, /Cash Register <b>20<\/b>\/h ·/, 'and no guess at which equipment it means');
  // Nothing disappears for want of that answer: both are still equipment here.
  assert.match(open, /data-tick="businesstypes-gym:fix-cashregister"/);
  assert.match(open, /data-tick="businesstypes-gym:fix-checkoutcounter"/);
});

test('a long tail of equipment waits behind one control', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-gym');
  const shown = (html.match(/data-tick="businesstypes-gym:fix-/g) || []).length;
  assert.equal(shown, 6, 'a practical list, not every machine in the catalogue');
  assert.match(html, /data-wiki-fix>Show all 9</);
  const all = w.click('[data-wiki-fix]', {});
  assert.equal((all.match(/data-tick="businesstypes-gym:fix-/g) || []).length, 9);
  // And the tail is forgotten when the reader moves on.
  await w.go('wiki/businesstypes-coffeeshop');
  const back = await w.go('wiki/businesstypes-gym');
  assert.match(back, /data-wiki-fix>Show all 9</);
});

test('no link ever sits inside a checkbox', async () => {
  const w = wiki();
  for (const id of ['businesstypes-hairdresser', 'businesstypes-coffeeshop', 'businesstypes-gym']) {
    const html = await w.go(`wiki/${id}`);
    for (const button of html.match(/<button[\s\S]*?<\/button>/g) || [])
      assert.doesNotMatch(button, /<a\s/, `${id}: a control inside a control`);
    // The links the help wrote are still on the page, beside the square.
    if (id === 'businesstypes-hairdresser')
      assert.match(section(html, 'To open'), /<a class="wk-link"/);
  }
});

/* --- only the sections a business has ------------------------------------- */

test('an office is drawn without shelves, recipes or a graph it has no use for', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-lawfirm');
  const seen = headings(html);
  assert.deepEqual(seen, ['To open', 'Services', 'Where to go', 'Yours', 'Prices in your save', 'Source']);
  assert.ok(!seen.includes('Sells') && !seen.includes('Fits together') && !seen.includes('Make it'));
  // No retail size codes borrowed from a shop that has them.
  assert.doesNotMatch(html, /A1|M1/);
  assert.match(html, /<span class="v t">Office<\/span>/);
  // The room, the equipment its page names and the people; an office stocks
  // nothing, so there is no card for stock.
  assert.match(html, /<h3>The room<\/h3>/);
  assert.match(html, /<h3>Fixtures<\/h3>/);
  assert.match(html, /<h3>People<\/h3>/);
  assert.doesNotMatch(html, /<h3>Stock<\/h3>/);
});

/* --- a range too wide for three lanes ------------------------------------- */

test('a wide range asks which product to draw, and the cards keep them all', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-supermarket');
  assert.match(html, /class="wk-picker"/);
  assert.equal((html.match(/class="wk-tab/g) || []).length, 8, 'one chip per product');
  assert.equal((html.match(/class="wk-card rv"/g) || []).length, 8, 'and every product still has a card');
  const graph = section(html, 'Fits together');
  assert.match(graph, /data-node="p:apples"/);
  assert.doesNotMatch(graph, /data-node="p:bread"/, 'one product at a time');

  const after = w.click('[data-focus]', {focus: 'bread'});
  const moved = section(after, 'Fits together');
  assert.match(moved, /data-node="p:bread"/);
  assert.doesNotMatch(moved, /data-node="p:apples"/);
  assert.match(moved, /class="wk-tab on" data-focus="bread"/);
});

test('a narrow range is drawn whole, with no chooser in the way', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-coffeeshop');
  assert.doesNotMatch(html, /class="wk-picker"/);
  const graph = section(html, 'Fits together');
  for (const key of ['coffee', 'tea', 'cake', 'mug'])
    assert.match(graph, new RegExp(`data-node="p:${key}"`), key);
});

/* --- state that must not follow you across --------------------------------- */

test('a tick belongs to the business it was made on', async () => {
  const w = wiki();
  const coffee = await w.load('wiki/businesstypes-coffeeshop');
  assert.match(coffee, /data-tick="businesstypes-coffeeshop:room"/);
  w.call('wikiTicked.add("businesstypes-coffeeshop:room")');
  const hair = await w.go('wiki/businesstypes-hairdresser');
  assert.match(hair, /data-tick="businesstypes-hairdresser:room"/);
  assert.match(hair, /data-tick="businesstypes-hairdresser:room"\s*\n?\s*[^>]*/);
  assert.doesNotMatch(hair, /aria-checked="true"/, 'another shop\'s room is not ticked here');
  const back = await w.go('wiki/businesstypes-coffeeshop');
  assert.match(back, /data-tick="businesstypes-coffeeshop:room"\n?[^>]*/);
  assert.match(back.slice(back.indexOf('<h3>The room</h3>')), /aria-checked="true"/, 'and it is still ticked there');
});

test('the graph lets go of everything when the page changes', async () => {
  const w = wiki();
  await w.load('wiki/businesstypes-supermarket');
  w.click('[data-focus]', {focus: 'cheese'});
  w.call('wikiPick("p:cheese")');
  assert.equal(w.call('wikiPicked'), 'p:cheese');
  await w.go('wiki/businesstypes-coffeeshop');
  assert.equal(w.call('wikiPicked'), null);
  assert.equal(w.call('wikiFocus'), '');
});

/* --- the hand-off to the planner -------------------------------------------- */

test('the planner control sits with a business\'s own range, never with the rest', async () => {
  const save = {businesses: [], products: [], market: {rows: []},
    plan: {catalogue: {'ba:businesstype_coffeeshop': {}, 'ba:businesstype_hairdresser': {}}}};
  const w = wiki({save});
  const slot = element('wikiPlanSlot');
  w.context.$ = id => (id === 'wikiRoot' ? w.root : id === 'wikiPlanSlot' ? slot : null);
  const coffee = await w.load('wiki/businesstypes-coffeeshop');
  // Its own recipes carry the control; the side range's section never does.
  assert.match(section(coffee, 'Make it'), /id="wikiPlanSlot"/);
  assert.doesNotMatch(section(coffee, 'Also make'), /id="wikiPlanSlot"/);
  assert.doesNotMatch(section(coffee, 'Also sells'), /id="wikiPlanSlot"/);
  assert.equal((coffee.match(/id="wikiPlanSlot"/g) || []).length, 1);
  assert.match(slot.innerHTML, /data-wiki-plan/);
  assert.match(slot.innerHTML, /Open the Growth planner with Coffee Shop selected/);

  // With no recipes of its own the control goes with the range itself.
  const hair = await w.go('wiki/businesstypes-hairdresser');
  assert.match(section(hair, 'Services'), /id="wikiPlanSlot"/);
  assert.equal((hair.match(/id="wikiPlanSlot"/g) || []).length, 1);

  // And the key it hands over is this business's, not the last one's.
  assert.equal(w.call('wikiPlanChain()'), true);
  assert.equal(w.context.planType, 'ba:businesstype_hairdresser');
});

test('a business the save\'s planner has never heard of offers no button', async () => {
  const w = wiki({save: {businesses: [], products: [], market: {rows: []}, plan: {catalogue: {}}}});
  const slot = element('wikiPlanSlot');
  w.context.$ = id => (id === 'wikiRoot' ? w.root : id === 'wikiPlanSlot' ? slot : null);
  await w.load('wiki/businesstypes-coffeeshop');
  assert.doesNotMatch(slot.innerHTML, /<button/);
  assert.match(slot.innerHTML, /Not in this save&#39;s catalogue|Not in this save's catalogue/);
});

/* --- the addresses, the gaps and the words ---------------------------------- */

test('only the suppliers this business needs are on its page, with their roles', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-coffeeshop');
  const places = section(html, 'Where to go');
  assert.match(places, /AJ Pederson &amp; Son[\s\S]*?fixtures/);
  assert.match(places, /Bluestone Imports/);
  assert.match(places, /Factory Supply Depot[\s\S]*?machines/, 'the workstations name their vendors');
  assert.match(places, /Anderson Recruitment Corp\.[\s\S]*?people/);
  assert.doesNotMatch(places, /Salon Supplies/, 'the hairdresser\'s vendor belongs to the hairdresser');
  // One of a thing is counted as one, here as everywhere.
  assert.match(places, /1 wholesaler</);
  assert.doesNotMatch(places, /1 wholesalers|1 vendors/);
});

test('a guide\'s gaps and its own words are its own', async () => {
  const w = wiki();
  const coffee = await w.load('wiki/businesstypes-coffeeshop');
  assert.match(section(coffee, 'Source'), /Cake rate/);
  assert.match(coffee, /<i><\/i>1 gap</, 'one of them, counted as one');
  assert.doesNotMatch(coffee, /1 gaps/);
  // The key the extraction recorded reads as words out here.
  assert.doesNotMatch(coffee, /help_recipes_bake_content/);
  const hair = await w.go('wiki/businesstypes-hairdresser');
  assert.doesNotMatch(section(hair, 'Source'), /Cake rate/);
});

test('the authored opening line and notes are shown as they arrived', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-coffeeshop');
  assert.match(html, /<p class="wk-lede rv">A coffee shop serves what it brews\.<\/p>/);
  assert.match(html, /class="wk-notes rv"/);
  assert.match(html, /Cakes come from the <a class="wk-link" href="#wiki\/businesstypes-bakery">Bakery<\/a> range/);

  // With none authored, the page counts what the help says about the range and
  // writes nothing else.
  const hair = await w.go('wiki/businesstypes-hairdresser');
  assert.match(hair, /<p class="wk-lede rv"><\/p>/, 'no range of goods of its own, so no sentence about one');
});

test('the labels the payload carries are the ones the page wears', async () => {
  const w = wiki({data: {...DATA, COPY: {primaryTitle: 'On the shelves', secondaryTitle: 'Also on the shelves',
    servicesTitle: 'What it charges for', primaryRecipesTitle: 'Making it'}}});
  const html = await w.load('wiki/businesstypes-coffeeshop');
  assert.ok(headings(html).includes('On the shelves'));
  assert.ok(headings(html).includes('Also on the shelves'));
  assert.ok(headings(html).includes('Making it'));
  const hair = await w.go('wiki/businesstypes-hairdresser');
  assert.ok(headings(hair).includes('What it charges for'));
});

/* --- the catalogue this checkout has, once it carries guides ---------------- */
/* web/wiki-data.json is built from an installed game and arrives with the
   extraction, so this holds whatever it carries: nothing while it carries no
   guide, and every business it does describe once it does. */
test('pricing uses configured values and stable IDs, including secondary products', async () => {
  const save = {meta:{day:190}, businesses:[
    {name:'Coffee <One>', type:'Localized name', typeSlug:COFFEE.BUSINESS.nameSrc,
      neighbourhood:'ba:neighborhood_midtown', lines:[
        {slug:'ba:itemname_coffee', configuredPrice:205.20},
        {slug:'ba:itemname_tea', configuredPrice:0},
        {slug:'ba:itemname_cake', configuredPrice:8.75},
      ]},
    {name:'Coffee Two', typeSlug:COFFEE.BUSINESS.nameSrc, neighbourhood:'ba:neighborhood_midtown',
      lines:[{slug:'ba:itemname_coffee', configuredPrice:6.50}]},
    {name:'Other type', type:'Coffee Shop', typeSlug:'other', neighbourhood:'ba:neighborhood_midtown',
      lines:[{slug:'ba:itemname_coffee', configuredPrice:999.99}]},
  ], products:[{item:'Coffee', slug:'ba:itemname_coffee', price:111.11, stores:1, units:2}], market:{rows:[
    {slug:'ba:itemname_coffee', cells:[{hood:'ba:neighborhood_midtown',marketPrice:4.25}, {hood:'ba:neighborhood_murrayhill',marketPrice:3.10}]},
    {slug:'ba:itemname_cake', cells:[{hood:'ba:neighborhood_midtown',marketPrice:null,marketPriceNote:'Supply-event pricing unavailable'}]},
  ]}};
  const w = wiki({save});
  const html = section(await w.load('wiki/businesstypes-coffeeshop'), 'Prices in your save');
  assert.match(html, /save day 190/);
  assert.match(html, /Coffee &lt;One&gt;: <b>\$205\.20/);
  assert.match(html, /Coffee Two: <b>\$6\.50/);
  assert.match(html, /\$0\.00/);
  assert.match(html, /\$8\.75/);
  assert.match(html, /\$4\.25/);
  assert.match(html, /\$3\.10/);
  assert.match(html, /Not set/);
  assert.match(html, /Supply-event pricing unavailable/);
  assert.doesNotMatch(html, /999\.99|111\.11|<One>/);
  const midtown = html.split('<summary>Murray Hill</summary>')[0];
  assert.doesNotMatch(midtown, /\$3\.10/);
});

test('the range sold in your shops is matched by the item key, never by its name', async () => {
  // A second item that shares the name "Coffee" is not the guide's coffee.
  const w = wiki({save: {meta: {day: 9}, businesses: [], market: {rows: []}, products: [
    {item: 'Coffee', slug: 'ba:itemname_coffee', price: 3, stores: 1, units: 2},
    {item: 'Coffee', slug: 'ba:itemname_coffeebeans', price: 3, stores: 1, units: 2}]}});
  const html = await w.load('wiki/businesstypes-coffeeshop');
  assert.match(html, /Its range, sold/);
  assert.match(html, /Coffee moved in your shops yesterday\./);
  assert.doesNotMatch(html, /Coffee, Coffee moved/);
});

test('pricing retains unlocated and closed shops, excludes vacant leases, and handles old payloads', async () => {
  const w = wiki({save:{meta:{day:10}, businesses:[
    {name:'Unlocated',typeSlug:COFFEE.BUSINESS.nameSrc,status:'retail',neighbourhood:'',lines:[
      {slug:'ba:itemname_coffee',configuredPrice:12.34}, {slug:'ba:itemname_tea',configuredPrice:null},
      {slug:'ba:itemname_cake',configuredPrice:0}, {slug:'ba:itemname_mug',price:9.99}]},
    {name:'Closed Coffee',typeSlug:COFFEE.BUSINESS.nameSrc,status:'retail',neighbourhood:'ba:neighborhood_midtown',temporarilyClosed:true,
      lines:[{slug:'ba:itemname_coffee',configuredPrice:3.25}]},
    {name:'Vacant lease',typeSlug:COFFEE.BUSINESS.nameSrc,status:'vacant',neighbourhood:'ba:neighborhood_midtown',
      lines:[{slug:'ba:itemname_coffee',configuredPrice:999.99}]},
  ],market:{rows:[]}}});
  const html = section(await w.load('wiki/businesstypes-coffeeshop'), 'Prices in your save');
  assert.match(html, /Unknown neighbourhood/);
  assert.match(html, /Unlocated: <b>\$12\.34/);
  assert.match(html, /Unlocated: <b>Not set/);
  assert.match(html, /Unlocated: <b>\$0\.00/);
  assert.match(html, /Unlocated: <b>Unavailable/);
  assert.match(html, /Closed Coffee: <b>\$3\.25/);
  assert.doesNotMatch(html, /Vacant lease|999\.99|9\.99/);
  assert.match(w.root.innerHTML, /Businesses of this type in your company: Unlocated, Closed Coffee/);
});

test('pricing works before owning a business, for services, and clears with saves', async () => {
  const w = wiki({save:{meta:{day:8}, businesses:[], market:{rows:[
    {slug:'ba:itemname_haircut', cells:[{hood:'ba:neighborhood_midtown',marketPrice:20.50}]},
  ]}}});
  let html = section(await w.load('wiki/businesstypes-hairdresser'), 'Prices in your save');
  assert.match(html, /Hair Cutting Fee/);
  assert.match(html, /\$20\.50/);
  assert.match(html, /No matching shop/);
  html = section(await w.go('wiki/businesstypes-coffeeshop'), 'Prices in your save');
  assert.doesNotMatch(html, /\$20\.50/);
  w.context.D = {meta:{day:9}, businesses:[], market:{rows:[]}};
  w.call('drawWiki()');
  assert.doesNotMatch(section(w.root.innerHTML, 'Prices in your save'), /\$20\.50/);
  w.context.D = null;
  w.call('drawWiki()');
  html = section(w.root.innerHTML, 'Prices in your save');
  assert.match(html, /Open a save/);
  assert.doesNotMatch(html, /\$\d/);
});

const REAL = path.join(__dirname, '..', 'web', 'wiki-data.json');
const real = fs.existsSync(REAL) ? JSON.parse(fs.readFileSync(REAL, 'utf8')) : null;
const guided = real && real.guides && Object.keys(real.guides).length ? real : null;

test('every guide the shipped catalogue carries draws a whole page', {skip: !guided}, async () => {
  const w = wiki({data: guided});
  const names = Object.values(guided.guides).map(g => (g.BUSINESS || {}).name).filter(Boolean);
  const trouble = [];
  for (const id of Object.keys(guided.guides)) {
    const html = await w.go(`wiki/${id}`);
    const name = (guided.guides[id].BUSINESS || {}).name || '';
    const text = html.replace(/<[^>]*>/g, '');
    if (!html.includes(`<h1>${name}`)) trouble.push([id, 'no title']);
    if (/\bundefined\b|\bNaN\b|>null</.test(html)) trouble.push([id, 'a value that is not a value']);
    if (/help_[a-z_:]+_content|ba:[a-z]+_[a-z0-9]+/.test(text)) trouble.push([id, 'a source key in the reading']);
    if (!headings(html).includes('To open')) trouble.push([id, 'no setup']);
    if (!headings(html).includes('Source')) trouble.push([id, 'no source']);
    // A business's page names no other business's own range.
    for (const other of names)
      if (other !== name && html.includes(`<h1>${other}<`)) trouble.push([id, `drew ${other}`]);
  }
  assert.deepEqual(trouble, []);
});

/* --- capacities ------------------------------------------------------------- */

test('a shelf that counts two kinds of goods shows both rows, never the larger', async () => {
  const w = wiki();
  const html = await w.load('wiki/businesstypes-coffeeshop');
  const own = section(html, 'Sells');
  // Tea's own line cannot be told from the fixture page's two, so both labelled
  // rows are shown rather than one number standing for both.
  const tea = own.slice(own.indexOf('<h3>Tea'), own.indexOf('</dl>', own.indexOf('<h3>Tea')));
  assert.match(tea, /Coffee 200 · Cold drinks 120/);
  assert.doesNotMatch(tea, /Coffee Machine<b>200<\/b>/, 'the larger row is never taken for the product\'s own');
  // Where a row is labelled with the product itself, that row is its own.
  const coffee = own.slice(own.indexOf('<h3>'), own.indexOf('<h3>Tea'));
  assert.match(coffee, /Coffee Machine<b>200<\/b>/);
  // And where the extraction settled it, the number it settled on is shown.
  const also = section(html, 'Also sells');
  assert.match(also, /Cake Stand<b>60<\/b>/);
});
