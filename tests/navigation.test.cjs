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
        target:{closest: sel => sel.includes('#site/') && href.startsWith('#site/') ? {getAttribute: () => href, closest: () => null} : null},
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
  for (const [hash, view] of [['#secDaily','results'], ['#secPortfolio','results'],
                              ['#secProducts','products'], ['#secPayroll','payroll'], ['#secGoals','milestones']]) {
    const b = board();
    b.context.location.hash = hash;
    b.boot();
    assert.equal(b.page(), 'company', hash);
    assert.equal(b.sub('company'), view, hash);
    assert.equal(b.context.location.hash, hash, 'the deep link survives the normalising replace');
  }
});

/* Weekly rhythm is Daily result's By weekday now: a link saved to the old
   section still opens Results, and lands on the chart that took its place. */
test('an old #secRhythm link lands on Daily result', () => {
  const b = board();
  b.context.location.hash = '#secRhythm';
  b.boot();
  assert.equal(b.page(), 'company');
  assert.equal(b.sub('company'), 'results');
  // Followed from the page, as a clicked link or a typed hash is.
  b.context.showPage('today');
  const asked = [];
  const $ = b.context.$;
  b.context.$ = id => { asked.push(id); return $(id); };
  b.context.openHash('secRhythm', 'none');
  assert.equal(b.page(), 'company');
  assert.equal(b.sub('company'), 'results');
  assert.ok(asked.includes('secDaily'), 'reveal() looks for the section that replaced it');
  assert.ok(!asked.includes('secRhythm'));
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

/* --- a site's own page (#site/<slug>) ------------------------------------ */

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
  assert.equal(b.context.siteHref(SHOP), '#site/fifthavenue-57');
  assert.equal(b.context.siteHref(FLAT), '#site/broadway-13', 'a home has an address too');
  assert.ok(b.context.openSite(SHOP));
  assert.equal(b.context.location.hash, '#site/fifthavenue-57');
  assert.equal(b.page(), 'company');
  assert.equal(b.sub('company'), 'results');
  assert.equal(b.site(), SHOP);
  assert.deepEqual(b.entries, ['#today', '#site/fifthavenue-57']);
  assert.equal(b.context.openSite('ba:street_nowhere#1'), false, 'a key the save does not hold opens nothing');
});

test("a reload of a site's address reopens that site", () => {
  const b = board({data: sites()});
  b.context.location.hash = '#site/secondstreet-51';
  b.boot();
  assert.equal(b.page(), 'company');
  assert.equal(b.site(), DEPOT);
  assert.equal(b.context.location.hash, '#site/secondstreet-51', 'boot leaves the address as it was');
  assert.equal(b.entries.length, 1, 'and adds no visit');
});

test('Back and Forward walk between sites and out to the page before', () => {
  const b = board({data: sites()});
  b.boot();
  b.context.openSite(SHOP);
  b.context.openSite(DEPOT);
  assert.deepEqual(b.entries, ['#today', '#site/fifthavenue-57', '#site/secondstreet-51']);
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
  b.context.location.hash = '#site/nowhere-1';
  b.boot();
  assert.equal(b.page(), 'company');
  assert.equal(b.sub('company'), 'results');
  assert.equal(b.site(), null);
  assert.equal(b.context.location.hash, '#company');
  b.context.history.pushState(null, '', '#site/nowhere-2');
  b.move(0);
  assert.equal(b.site(), null);
  assert.equal(b.context.location.hash, '#company', 'typed into an open board too');
});

test('a slug is the key alone, written readably', () => {
  const b = board({data: sites()});
  b.boot();
  for (const [key, slug] of [[SHOP, 'fifthavenue-57'], [DEPOT, 'secondstreet-51'],
                             ['ba:street_24thstreet#6', '24thstreet-6']])
    assert.equal(b.context.siteSlugOf(key), slug);
  assert.equal(b.context.siteSlugOf(''), '', 'a site with no key has no address');
  assert.equal(b.context.siteKeyOf(''), null, 'and an empty slug is no site');
  // A site whose key is the bare head is still reachable, at "%x".
  b.context.D.businesses = [...b.context.D.businesses, {key: 'ba:street_', name: 'Bare', address: '', status: 'retail'}];
  assert.equal(b.context.siteHref('ba:street_'), '#site/%x');
  assert.equal(b.context.siteBySlug('%X'), 'ba:street_');
});

test('two keys never share a slug, and every slug reads back to its key', () => {
  const b = board({data: sites()});
  b.boot();
  const keys = ['ba:street_a#1', 'ba:street_a-1', 'ba:street_a-1-k8lvph', 'ba:street_a%2d1', 'ba:street_a%1',
    'ba:street_a 1', 'ba:street_a_1', 'ba:street_A#1', 'ba:street_é#1', 'ba:street_e\u0301#1', 'ba:street_東京#1',
    'ba:street_😀#1', 'ba:street_', 'ba:street_#', 'ba:street_%x', 'a#1', '%x', 'x:street_a#1', 'ba:street',
    'ba:street_a#1#', 'ba:street_a##1'];
  const slugs = keys.map(k => b.context.siteSlugOf(k));
  assert.equal(new Set(slugs).size, keys.length, `injective: ${slugs.join(' ')}`);
  slugs.forEach((slug, i) => {
    assert.match(slug, /^[a-z0-9%-]+$/, `${keys[i]} writes a slug, of only a-z, 0-9, "-" and escapes`);
    assert.equal(b.context.siteKeyOf(slug), keys[i], `${keys[i]} reads back from ${slug}`);
  });
  assert.equal(b.context.siteSlugOf('ba:street_a-1'), 'a%2d1', 'a literal "-" is escaped, "#" is the dash');
  assert.equal(b.context.siteSlugOf('ba:street_'), '%x', 'the bare head has a slug of its own');
  assert.equal(b.context.siteKeyOf('%x'), 'ba:street_');
  assert.equal(b.context.siteSlugOf('x'), '%xx', 'which no key without the head can take');
  assert.equal(b.context.siteKeyOf('a%zz'), null, 'a broken escape is no slug');
  assert.equal(b.context.siteKeyOf('a%ff'), null, 'nor is a byte that is no UTF-8');
});

test('a site keeps its slug whatever else the save holds', () => {
  const b = board({data: sites()});
  b.boot();
  const mine = () => b.context.siteHref(SHOP);
  const before = mine();
  const D = b.context.D;
  D.businesses = [...D.businesses,
    {key: 'ba:street_fifthavenue#57b', name: 'Same address', address: '57 Fifth Avenue', status: 'retail'},
    {key: 'ba:street_elm#1', name: 'Its address is the other key', address: 'Fifthavenue 57', status: 'retail'}];
  assert.equal(mine(), before, 'sites arriving change nothing');
  D.businesses = D.businesses.slice().reverse();
  assert.equal(mine(), before, 'nor does their order');
  D.businesses = D.businesses.filter(x => x.key === SHOP);
  assert.equal(mine(), before, 'nor sites leaving');
  assert.equal(b.context.siteHref('ba:street_elm#1'), '', 'a site the save no longer holds has no address');
  assert.equal(b.context.siteBySlug('elm-1'), null);
});

test('capitals are only another spelling of the same address', () => {
  const b = board({data: sites()});
  b.boot();
  assert.equal(b.context.siteBySlug('FifthAvenue-57'), SHOP);
  assert.equal(b.context.siteKeyOf('A%2D1'), 'ba:street_a-1', 'upper-case hex reads the same');
  b.context.history.pushState(null, '', '#site/FIFTHAVENUE-57');
  b.move(0);
  assert.equal(b.site(), SHOP);
});

test('a history entry keeps what others stored on it; a new one starts clean', () => {
  const b = board({data: sites()});
  b.states[0] = {wiki: 'scroll'};
  b.context.location.hash = '#site/nowhere-1';
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
  again.context.location.hash = '#site/fifthavenue-57';
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
  assert.deepEqual(b.entries, ['#today', '#site/fifthavenue-57'], 'Back, not a new visit');
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
  const plain = b.click('#site/secondstreet-51');
  assert.ok(plain.prevented, 'the page opens here, not by the browser');
  assert.ok(!plain.stopped, 'the click still travels on: a popover closing on a click elsewhere hears it');
  assert.equal(b.site(), DEPOT);
  assert.equal(b.context.location.hash, '#site/secondstreet-51');
  b.move(-1);
  const tab = b.click('#site/fifthavenue-57', {ctrlKey: true});
  assert.ok(!tab.stopped && !tab.prevented, 'a new tab opens at the address');
  assert.equal(b.site(), null);
});

test('a search or a question that opens a site names where it was asked from, as a finding does', () => {
  const b = board({data: sites()});
  b.boot();
  // ssOpenSite() passes cameFrom: no finding, and still a way back.
  b.context.openSite(SHOP, true, null, 'push', true);
  assert.deepEqual({...b.from()}, {label: 'Today', hash: '#today'});
  assert.deepEqual({...b.states[1].ssFrom}, {label: 'Today', hash: '#today'});
  // A home opens the same way.
  b.move(-1);
  assert.ok(b.context.openSite(FLAT, true, null, 'push', true));
  assert.equal(b.from().label, 'Today');
  // From one site's page to another there is nothing new to go back to.
  b.context.openSite(SHOP, true, null, 'push', true);
  assert.equal(b.from(), null);
});

test("an old Weekly rhythm link takes an open site's page down and opens Results", () => {
  const b = board({data: sites()});
  b.boot();
  b.context.openSite(SHOP);
  b.context.history.pushState(null, '', '#secRhythm');
  b.move(0);
  assert.equal(b.site(), null);
  assert.equal(b.page(), 'company');
  assert.equal(b.sub('company'), 'results');
});

test('the site on screen, opened again, keeps its way back', () => {
  const b = board({data: sites()});
  b.boot();
  b.context.openSite(SHOP, false, 'a1');
  assert.equal(b.from().label, 'Today');
  // Its name, the picker's own entry, or a search for it.
  b.context.openSite(SHOP);
  assert.equal(b.from().label, 'Today');
  b.context.openSite(SHOP, true, null, 'push', true);
  assert.equal(b.from().label, 'Today');
  // Another site is somewhere new.
  b.context.openSite(DEPOT);
  assert.equal(b.from(), null);
});
