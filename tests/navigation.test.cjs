const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'ba_dashboard.py'), 'utf8');

/* The boot slice starts at the shell, so the no-save path comes with it. */
const BOOT = source.slice(source.indexOf('let shellOnly = false;'),
  source.indexOf('/* A page written with its numbers'));

function board({saved = {}, data = {}} = {}) {
  const entries = ['#today'], states = [null];
  let position = 0;
  const listeners = {}, captured = {};
  const elements = new Map();
  let chartDraws = 0, wikiVisits = 0, sitePanels = 0;
  const $ = id => {
    if (!elements.has(id)) elements.set(id, {hidden:false, innerHTML:'', addEventListener(type, fn){this[type] = fn;}});
    return elements.get(id);
  };
  const location = {hash:'#today'};
  const context = vm.createContext({$, location, D: data,
    history:{
      get state(){return states[position];},
      replaceState(state, __, hash){entries[position] = location.hash = hash; states[position] = state ?? null;},
      pushState(state, __, hash){
        entries.splice(++position); states.splice(position);
        entries.push(location.hash = hash); states.push(state ?? null);
      },
      back(){move(-1);},
    },
    localStorage:{getItem(key){return saved[key] ?? null;}, setItem(){}},
    document:{querySelectorAll(){return [];}, body:{classList:{add(){}, remove(){}}},
              addEventListener(type, fn, capture){if (capture) captured[type] = fn;}},
    window:{scrollY:0, addEventListener(type, fn){listeners[type] = fn;}},
    drawChart(){chartDraws++;}, wireReveal(){}, requestAnimationFrame(){}, inkHome(){}, icon(){return '';},
    showCityMap(){}, showWikiRoute(){wikiVisits++;}, wireTips(){}, drawSite(){sitePanels++;},
    drawPortfolio(){}, CSS:{escape: s => s},
    spEsc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    attr: s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
  });
  /* The site state the board declares with its site panel, which no slice
     below carries. */
  vm.runInContext(`let siteKey = null, siteTab = -1, siteOpen = false, spFindsAll = false, spArrived = null;
    const openChains = new Set();
    const spHome = key => key === null ? null : (D.homes || []).find(h => h.key === key) || null;`, context);
  function move(delta){
    position = Math.max(0, Math.min(entries.length - 1, position + delta));
    location.hash = entries[position];
    listeners.hashchange();
  }
  vm.runInContext(source.slice(source.indexOf('const SEC_PAGE ='), source.indexOf('/* The business a finding')), context);
  vm.runInContext(source.slice(source.indexOf('const featureDiscovery ='), source.indexOf('/* --- changelog dialog')), context);
  vm.runInContext(source.slice(source.indexOf('const PAGES ='), source.indexOf('/* --- which kinds of finding')), context);
  /* The crumb row above a site's head, and its clicks. */
  vm.runInContext(source.slice(source.indexOf('const SS_BACK ='), source.indexOf("/* The site's page stands on its own")), context);
  let booted = false;
  const load = () => {
    if (booted) return;
    booted = true;
    context.renderAll = context.wireNav = context.wireCoin = context.wireSphere = () => {};
    vm.runInContext(BOOT, context);
  };
  return {context, entries, states, $, charts(){return chartDraws;}, wikiVisits(){return wikiVisits;},
    sitePanels(){return sitePanels;},
    boot(){ load(); context.boot(); },
    shell(){ load(); context.bootShell(); },
    move,
    /* A plain or modified click caught by the board's capture listener. */
    click(href, mods = {}){
      const e = {button: 0, ...mods, prevented: false, stopped: false,
        target:{closest: sel => sel.includes('#site/') && href.startsWith('#site/') ? {getAttribute: () => href} : null},
        preventDefault(){this.prevented = true;}, stopImmediatePropagation(){this.stopped = true;}};
      captured.click(e);
      return e;
    },
    page(){return vm.runInContext('page', context);},
    sub(id){return vm.runInContext(`sub.${id}`, context);},
    site(){return vm.runInContext('siteOpen ? siteKey : null', context);},
    from(){return vm.runInContext('siteFrom', context);},
  };
}

test('the top row is Today, Company, Supply, Growth, Map, Wiki', () => {
  const b = board();
  assert.deepEqual([...vm.runInContext('PAGES.map(p => p.label)', b.context)],
    ['Today', 'Company', 'Supply', 'Growth', 'Map', 'Wiki']);
  assert.ok(!vm.runInContext('PAGES.some(p => p.id === "results")', b.context),
    'Results is a view inside Company now, not a page of its own');
  assert.match(b.$('nav').innerHTML, /data-id="wiki"/);
  assert.match(b.$('nav').innerHTML, /data-id="company"/);
});

test('Company carries Results, Products, Payroll and Milestones', () => {
  const b = board();
  const items = vm.runInContext('SUBS.company.items', b.context);
  assert.deepEqual([...items].map(([, label]) => label), ['Results', 'Products', 'Payroll', 'Milestones']);
  assert.deepEqual([...items].map(([, , anchor]) => anchor), ['secDaily', 'secProducts', 'secPayroll', 'secGoals']);
  assert.equal(vm.runInContext('SUBS.company.start', b.context), 'results');
  b.context.showSub('company', 'payroll');
  assert.match(b.$('companyNav').innerHTML, /href="#secPayroll" data-id="payroll" class="on"/);
});

test('the site panel decides its own visibility when a Company view arrives', () => {
  const b = board();
  const before = b.sitePanels();
  b.context.showSub('company', 'results');
  assert.ok(b.sitePanels() > before,
    'the panel is asked again, so an empty one is not left on screen by the view sweep');
});

test('a Today finding opens Company on Results, and Back returns to Today', () => {
  const b = board();
  b.context.reveal('secDetail');
  assert.equal(b.page(), 'company');
  assert.equal(b.sub('company'), 'results');
  b.move(-1);
  assert.equal(b.page(), 'today');
  b.move(1);
  assert.equal(b.page(), 'company');
});

test('every Company section deep link opens the view that holds it', () => {
  for (const [hash, view] of [['#secDaily','results'], ['#secRhythm','results'], ['#secPortfolio','results'],
                              ['#secProducts','products'], ['#secPayroll','payroll'], ['#secGoals','milestones']]) {
    const b = board();
    b.context.location.hash = hash;
    b.boot();
    assert.equal(b.page(), 'company', hash);
    assert.equal(b.sub('company'), view, hash);
    assert.equal(b.context.location.hash, hash, 'the deep link survives the normalising replace');
  }
});

test('the old #results hash still opens Company on its Results view', () => {
  const b = board();
  b.context.location.hash = '#results';
  b.boot();
  assert.equal(b.page(), 'company');
  assert.equal(b.sub('company'), 'results');
});

/* The view Company was last left on is remembered, so an old link has to say
   which view it means — not just which page. */
test('#results opens Results even when Company was last left on another view', () => {
  for (const saved of ['products', 'payroll', 'milestones']) {
    const b = board({saved: {ba_dash_company: saved}});
    assert.equal(b.sub('company'), saved, 'the remembered view is where Company would open');
    b.context.location.hash = '#results';
    b.boot();
    assert.equal(b.page(), 'company', saved);
    assert.equal(b.sub('company'), 'results', `#results must win over a remembered ${saved}`);
  }
});

test('#results typed into the address bar of an open board does the same', () => {
  const b = board({saved: {ba_dash_company: 'products'}});
  b.boot();
  b.context.history.pushState(null, '', '#results');
  b.move(0);
  assert.equal(b.page(), 'company');
  assert.equal(b.sub('company'), 'results');
  assert.equal(b.context.location.hash, '#results', 'and the link the reader followed is left as it was');
  b.move(-1);
  assert.equal(b.page(), 'today', 'Back still walks out of it');
});

test('the Results chart is drawn once its container is on screen, and only then', () => {
  const b = board();
  const before = b.charts();
  b.context.showPage('company');
  assert.ok(b.charts() > before, 'Company opens on Results, whose chart needs measuring');
  const after = b.charts();
  b.context.showSub('company', 'products');
  assert.equal(b.charts(), after, 'switching away from Results does not redraw it');
  b.context.showSub('company', 'results');
  assert.ok(b.charts() > after, 'coming back redraws the chart that measured nothing while hidden');
});

test('Supply keeps the stored id of its flow view under a clearer name', () => {
  const b = board({saved:{ba_dash_supply:'map'}});
  assert.equal(b.sub('supply'), 'map', 'a view remembered from an earlier release still resolves');
  b.context.showSub('supply', 'orders');
  assert.match(b.$('supplyNav').innerHTML, /href="#secFlow" data-id="map"/);
  assert.match(b.$('supplyNav').innerHTML, />Goods flow</);
  assert.doesNotMatch(b.$('supplyNav').innerHTML, />Map</);
});

test('top menu preserves the sequence through Back and Forward without duplicates', () => {
  const b = board();
  for (const id of ['company', 'supply', 'supply']) {
    b.$('nav').click({preventDefault(){}, target:{closest(){return {dataset:{id}};}}});
  }
  assert.deepEqual(b.entries, ['#today', '#company', '#supply']);
  b.move(-1); assert.equal(b.page(), 'company');
  b.move(-1); assert.equal(b.page(), 'today');
  b.move(1); assert.equal(b.page(), 'company');
  b.move(1); assert.equal(b.page(), 'supply');
  assert.equal(b.entries.length, 3);
});

test('startup normalises the current entry without creating an extra visit', () => {
  const b = board();
  b.context.location.hash = '';
  b.boot();
  assert.deepEqual(b.entries, ['#today']);
  b.context.showPage('company');
  b.move(-1);
  assert.equal(b.page(), 'today');
});

test('replaying a section hash keeps that history entry intact', () => {
  const b = board();
  b.context.history.pushState(null, '', '#secStock');
  b.move(0);
  assert.equal(b.page(), 'supply');
  assert.equal(b.context.location.hash, '#secStock');
  assert.deepEqual(b.entries, ['#today', '#secStock']);
  b.move(-1);
  assert.equal(b.page(), 'today');
});

for (const [pageId, view, anchor, nav] of [
  ['supply','orders','secLogistics','supplyNav'], ['supply','checks','secStock','supplyNav'],
  ['growth','market','secMarket','growthNav'], ['growth','plan','secPlan','growthNav'],
  ['company','products','secProducts','companyNav'], ['company','payroll','secPayroll','companyNav'],
  ['company','milestones','secGoals','companyNav'],
]) test(`modified-click destination boots ${pageId}/${view}`, () => {
  const b = board();
  b.context.showSub(pageId, view);
  assert.ok(b.$(nav).innerHTML.includes(`href="#${anchor}" data-id="${view}"`));
  let prevented = false;
  b.$(nav).click({ctrlKey:true, preventDefault(){prevented = true;}, target:{closest(){return {dataset:{id:view}};}}});
  assert.equal(prevented, false);
  b.context.location.hash = '#' + anchor;
  b.boot();
  assert.equal(b.page(), pageId);
  assert.equal(b.sub(pageId), view);
});

/* --- the wiki's own routes -------------------------------------------- */

test('a wiki page hash opens the Wiki and is handed to the module intact', () => {
  const b = board();
  b.context.location.hash = '#wiki/businesstypes-giftshop';
  b.boot();
  assert.equal(b.page(), 'wiki');
  assert.equal(b.context.location.hash, '#wiki/businesstypes-giftshop', 'the page being read survives a reload');
  assert.ok(b.wikiVisits() > 0, 'the module is told which route to draw');
});

test('moving between wiki pages never leaves the Wiki tab', () => {
  const b = board();
  b.context.history.pushState(null, '', '#wiki/products-cheapgift');
  b.move(0);
  assert.equal(b.page(), 'wiki');
  const visits = b.wikiVisits();
  b.context.history.pushState(null, '', '#wiki/c/help_products');
  b.move(0);
  assert.equal(b.page(), 'wiki');
  assert.ok(b.wikiVisits() > visits);
  b.move(-1);
  assert.equal(b.page(), 'wiki', 'Back walks the wiki\'s own routes');
});

test('clicking the Wiki tab from a page inside it goes back to the shelf', () => {
  const b = board();
  b.context.history.pushState(null, '', '#wiki/products-umbrella');
  b.move(0);
  b.$('nav').click({preventDefault(){}, target:{closest(){return {dataset:{id:'wiki'}};}}});
  assert.equal(b.context.location.hash, '#wiki');
});

/* --- the board with no save ------------------------------------------- */

test('with no save the board opens on the Wiki and says the rest needs one', () => {
  const seen = [];
  const b = board({data:null});
  b.context.document.querySelectorAll = () => [{
    dataset:{id:'today'}, classList:{toggle(cls, on){seen.push([cls, on]);}}, setAttribute(){}, removeAttribute(){},
  }];
  b.shell();
  assert.equal(b.page(), 'wiki');
  assert.equal(b.context.location.hash, '#wiki');
  assert.ok(b.wikiVisits() > 0);
  assert.ok(seen.some(([cls, on]) => cls === 'off' && on === true), 'a page that needs a save is marked as such');
});

test('with no save a click on another tab does not open an empty page', () => {
  const b = board({data:null});
  b.shell();
  b.$('nav').click({preventDefault(){}, target:{closest(){return {dataset:{id:'company'}};}}});
  assert.equal(b.page(), 'wiki');
  b.$('nav').click({preventDefault(){}, target:{closest(){return {dataset:{id:'wiki'}};}}});
  assert.equal(b.page(), 'wiki');
});

test('with no save a hash typed for another page does not open it either', () => {
  const b = board({data:null});
  b.shell();
  for (const hash of ['#company', '#secDaily', '#results', '#today']) {
    b.context.history.pushState(null, '', hash);
    b.move(0);
    assert.equal(b.page(), 'wiki', `${hash} has nothing behind it without a save`);
  }
  b.context.history.pushState(null, '', '#wiki/products-cheapgift');
  b.move(0);
  assert.equal(b.page(), 'wiki', 'and the wiki\'s own routes still work');
  assert.ok(b.wikiVisits() > 0);
});

test('a save arriving while the wiki is open leaves the reader where they are', () => {
  const b = board({data:null});
  b.shell();
  b.context.history.pushState(null, '', '#wiki/businesstypes-giftshop');
  b.move(0);
  assert.equal(b.page(), 'wiki');
  const entries = b.entries.length;
  b.context.D = {};              // the first delivery
  b.boot();
  assert.equal(b.page(), 'wiki', 'the numbers arrive behind the page being read');
  assert.equal(b.context.location.hash, '#wiki/businesstypes-giftshop');
  assert.equal(b.entries.length, entries, 'and no visit is added for it');
  assert.equal(vm.runInContext('shellOnly', b.context), false);
});

/* --- a site's own page (#site/<address>) --------------------------------- */

const SHOP = 'ba:street_fifthavenue#57', DEPOT = 'ba:street_secondstreet#51', FLAT = 'ba:street_broadway#13';
const sites = () => ({
  businesses: [
    {key: SHOP, name: 'HART. Clothing', address: '57 Fifth Avenue', status: 'retail'},
    {key: DEPOT, name: 'Clothing Distr.', address: '51 Second Street', status: 'depot'},
  ],
  homes: [{key: FLAT, address: '13 Broadway Street'}],
  chains: [{name: 'Clothing Stores', sites: [SHOP, DEPOT]}],
});

test('a site opens at its address, on Company, with Results under it', () => {
  const b = board({data: sites()});
  b.boot();
  assert.equal(b.context.siteHref(SHOP), '#site/57-fifth-avenue');
  assert.equal(b.context.siteHref(FLAT), '#site/13-broadway-street', 'a home has an address too');
  assert.ok(b.context.openSite(SHOP));
  assert.equal(b.context.location.hash, '#site/57-fifth-avenue');
  assert.equal(b.page(), 'company');
  assert.equal(b.sub('company'), 'results');
  assert.equal(b.site(), SHOP);
  assert.deepEqual(b.entries, ['#today', '#site/57-fifth-avenue']);
  assert.equal(b.context.openSite('ba:street_nowhere#1'), false, 'a key the save does not hold opens nothing');
});

test("a reload of a site's address reopens that site", () => {
  const b = board({data: sites()});
  b.context.location.hash = '#site/51-second-street';
  b.boot();
  assert.equal(b.page(), 'company');
  assert.equal(b.site(), DEPOT);
  assert.equal(b.context.location.hash, '#site/51-second-street', 'boot leaves the address as it was');
  assert.equal(b.entries.length, 1, 'and adds no visit');
});

test('Back and Forward walk between sites and out to the page before', () => {
  const b = board({data: sites()});
  b.boot();
  b.context.openSite(SHOP);
  b.context.openSite(DEPOT);
  assert.deepEqual(b.entries, ['#today', '#site/57-fifth-avenue', '#site/51-second-street']);
  b.move(-1);
  assert.equal(b.site(), SHOP);
  b.move(-1);
  assert.equal(b.page(), 'today');
  assert.equal(b.site(), null, 'leaving the address takes the site page down');
  b.move(1);
  assert.equal(b.site(), SHOP);
  b.move(1);
  assert.equal(b.site(), DEPOT);
  assert.equal(b.entries.length, 3, 'replaying history adds no visit');
});

test('Company in the nav, and a Company hash, are the portfolio again', () => {
  const b = board({data: sites()});
  b.boot();
  b.context.openSite(SHOP);
  b.$('nav').click({preventDefault(){}, target:{closest(){return {dataset:{id:'company'}};}}});
  assert.equal(b.site(), null);
  assert.equal(b.context.location.hash, '#company');
  b.move(-1);
  assert.equal(b.site(), SHOP);
  b.context.showSub('company', 'products');
  assert.equal(b.site(), null, 'another Company view takes it down too');
});

test('an address that answers nothing lands on the portfolio and says so', () => {
  const b = board({data: sites(), saved: {ba_dash_company: 'payroll'}});
  b.context.location.hash = '#site/99-nowhere-street';
  b.boot();
  assert.equal(b.page(), 'company');
  assert.equal(b.sub('company'), 'results');
  assert.equal(b.site(), null);
  assert.equal(b.context.location.hash, '#company');
  b.context.history.pushState(null, '', '#site/also-nowhere');
  b.move(0);
  assert.equal(b.site(), null);
  assert.equal(b.context.location.hash, '#company', 'typed into an open board too');
});

test('every site gets its own address: namesakes at one address, and none at all', () => {
  const data = sites();
  data.businesses.push(
    {key: 'ba:street_fifthavenue#57b', name: 'Second at 57', address: '57 Fifth Avenue', status: 'retail'},
    {key: 'ba:street_ninthavenue#3', name: 'No address', address: '', status: 'retail'},
    {key: '', name: 'No key', address: '', status: 'retail'});
  const b = board({data});
  b.boot();
  const hrefs = data.businesses.map(x => b.context.siteHref(x.key));
  // A shared address belongs to neither site: both take their key's slug.
  assert.deepEqual(hrefs, ['#site/fifthavenue-57', '#site/51-second-street',
    '#site/fifthavenue-57b', '#site/ninthavenue-3', '']);
  assert.equal(new Set(hrefs).size, hrefs.length, 'no two sites share an address');
  b.context.history.pushState(null, '', '#site/fifthavenue-57b');
  b.move(0);
  assert.equal(b.site(), 'ba:street_fifthavenue#57b', 'the second site at an address opens itself, not its namesake');
  // The bare shared address still opens one of them, the same one every time:
  // the building's own key before a unit's.
  assert.equal(b.context.siteBySlug('57-fifth-avenue'), SHOP);
  b.context.D.businesses = data.businesses.slice().reverse();
  assert.equal(b.context.siteBySlug('57-fifth-avenue'), SHOP, 'whatever the order');
});

test("a namesake's address does not hang on the order of the list, or on the other staying", () => {
  const pair = () => [
    {key: SHOP, name: 'HART. Clothing', address: '57 Fifth Avenue', status: 'retail'},
    {key: 'ba:street_fifthavenue#57b', name: 'Second at 57', address: '57 Fifth Avenue', status: 'retail'}];
  const b = board({data: {businesses: pair(), homes: []}});
  b.boot();
  const before = [SHOP, 'ba:street_fifthavenue#57b'].map(k => b.context.siteHref(k));
  b.context.D.businesses = pair().reverse();
  assert.deepEqual([SHOP, 'ba:street_fifthavenue#57b'].map(k => b.context.siteHref(k)), before);
  // The first goes: the second has its address to itself, and the link
  // written while it was shared still opens it.
  b.context.D.businesses = pair().slice(1);
  assert.equal(b.context.siteHref('ba:street_fifthavenue#57b'), '#site/57-fifth-avenue');
  b.context.history.pushState(null, '', before[1]);
  b.move(0);
  assert.equal(b.site(), 'ba:street_fifthavenue#57b');
});

test("no address takes another site's key slug, whatever the order", () => {
  // "Mainstreet 5" comes out as mainstreet-5, which is also the slug of the
  // key ba:street_mainstreet#5 -- a different site.
  const x = {key: 'ba:street_mainstreet#5', name: 'X', address: '5 Main Street', status: 'retail'};
  const y = {key: 'ba:street_elm#1', name: 'Y', address: 'Mainstreet 5', status: 'retail'};
  for (const businesses of [[x, y], [y, x]]) {
    const b = board({data: {businesses, homes: []}});
    b.boot();
    assert.equal(b.context.siteHref(x.key), '#site/5-main-street');
    assert.equal(b.context.siteHref(y.key), '#site/elm-1', 'Y shows its key slug, not the one X owns');
    assert.equal(b.context.siteBySlug('mainstreet-5'), x.key, "X's key slug always opens X");
    assert.equal(b.context.siteBySlug('elm-1'), y.key);
  }
});

test('two keys that slug the same are told apart, whatever the order', () => {
  const p = {key: 'ba:street_a#1', name: 'P', address: '', status: 'retail'};
  const q = {key: 'ba:street_a-1', name: 'Q', address: '', status: 'retail'};
  const seen = [[p, q], [q, p]].map(businesses => {
    const b = board({data: {businesses, homes: []}});
    b.boot();
    const hrefs = [p, q].map(x => b.context.siteHref(x.key));
    assert.notEqual(hrefs[0], hrefs[1]);
    hrefs.forEach((h, i) => assert.equal(b.context.siteBySlug(h.slice(6)), [p, q][i].key));
    return hrefs.join(' ');
  });
  assert.equal(seen[0], seen[1]);
});

test('a history entry keeps what others stored on it; a new one starts clean', () => {
  const b = board({data: sites()});
  b.states[0] = {wiki: 'scroll'};
  b.context.location.hash = '#site/99-nowhere-street';
  b.boot();
  assert.equal(b.context.location.hash, '#company');
  assert.deepEqual({...b.states[0]}, {wiki: 'scroll'}, 'replacing the entry keeps its state');
  b.context.openSite(SHOP, false, 'a1');
  assert.deepEqual(Object.keys(b.states[1]), ['ssFrom'], 'a new entry carries only the way back');
});

test('arriving from a finding names the page it was on, through Back, Forward and a reload', () => {
  const b = board({data: sites()});
  b.boot();
  b.context.openSite(SHOP, false, 'a1');
  assert.deepEqual({...b.from()}, {label: 'Today', hash: '#today'});
  assert.deepEqual({...b.states[1].ssFrom}, {label: 'Today', hash: '#today'}, 'the entry carries it');
  b.move(-1); b.move(1);
  assert.deepEqual({...b.from()}, {label: 'Today', hash: '#today'});
  // A reload replays the same entry.
  const again = board({data: sites()});
  again.context.location.hash = '#site/57-fifth-avenue';
  again.states[0] = {ssFrom: {label: 'Today', hash: '#today'}};
  again.boot();
  assert.equal(again.from().label, 'Today');
  // Anywhere else a finding is clicked: the view's own word.
  b.context.showSub('supply', 'checks'); b.context.showPage('supply');
  b.context.openSite(DEPOT, false, 'a2');
  assert.deepEqual({...b.from()}, {label: 'Checks', hash: '#supply'});
  // The picker, a name or a portfolio row is no finding: back to the portfolio.
  b.context.openSite(SHOP);
  assert.equal(b.from(), null);
});

test('the crumb leads back where the reader came from, else to the portfolio', () => {
  const b = board({data: sites()});
  b.boot();
  b.context.openSite(SHOP, false, 'a1');
  const html = b.context.siteCrumbs(SHOP, 'HART. Clothing', true);
  assert.match(html, /<a class="ss-crumb from" href="#today" data-ss="back">.*Today<\/a>/);
  assert.match(html, /data-ss="portfolio">Portfolio<\/a><i>›<\/i><a href="#secPortfolio" data-ss="chain" data-chain="Clothing Stores">/);
  assert.match(html, /<div class="ss-pick" id="sitePick">/);
  // Clicking it is the browser's own Back.
  const nav = {};
  b.context.q = () => nav;
  b.context.wireSiteCrumbs();
  nav.onclick({button: 0, preventDefault(){}, target:{closest: () => ({dataset:{ss:'back'}, getAttribute: () => '#today'})}});
  assert.equal(b.page(), 'today');
  assert.equal(b.site(), null);
  assert.deepEqual(b.entries, ['#today', '#site/57-fifth-avenue'], 'Back, not a new visit');
  // Without a finding the crumb is the portfolio, and a home is in no picker.
  b.context.openSite(FLAT);
  const home = b.context.siteCrumbs(FLAT, '13 Broadway Street', false);
  assert.match(home, /<a class="ss-crumb" href="#secPortfolio" data-ss="portfolio">.*Portfolio<\/a>/);
  assert.doesNotMatch(home, /sitePick|data-ss="chain"/);
});

test("a site's name opens its page; a modified click is left to the browser", () => {
  /* The rows a name sits in skip a click inside it (inSiteLink); that is
     tests/findability.test.cjs. */
  const b = board({data: sites()});
  b.boot();
  const plain = b.click('#site/51-second-street');
  assert.ok(plain.prevented, 'the page opens here, not by the browser');
  assert.ok(!plain.stopped, 'the click still travels on: a popover closing on a click elsewhere hears it');
  assert.equal(b.site(), DEPOT);
  assert.equal(b.context.location.hash, '#site/51-second-street');
  b.move(-1);
  const tab = b.click('#site/57-fifth-avenue', {ctrlKey: true});
  assert.ok(!tab.stopped && !tab.prevented, 'a new tab opens at the address');
  assert.equal(b.site(), null);
});
