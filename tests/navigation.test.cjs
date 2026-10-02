const {test} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'template', 'board.js'), 'utf8');
// The markup, and the page's earlier script that defines featureDiscovery.
const markup = fs.readFileSync(path.join(__dirname, '..', 'template', 'board.html'), 'utf8');
const {between} = require('./_slice.cjs');

/* The boot slice starts at the shell, so the no-save path comes with it. */
const BOOT = between(source, 'let shellOnly = false;', '/* A page written with its numbers');

function board({saved = {}, data = {}} = {}) {
  if (data) require('./_payload_contract.cjs').assertPayloadShape(data, 'navigation');
  const entries = ['#today'], states = [null];
  let position = 0;
  const listeners = {}, captured = {};
  const elements = new Map();
  let chartDraws = 0, wikiVisits = 0, sitePanels = 0;
  const $ = id => {
    if (!elements.has(id)) elements.set(id, {hidden:false, innerHTML:'', attributes:{}, addEventListener(type, fn){this[type] = fn;},
      setAttribute(name, value){this.attributes[name] = String(value);}, removeAttribute(name){delete this.attributes[name];}});
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
    localStorage:{getItem(key){return saved[key] ?? null;}, setItem(key, value){saved[key] = String(value);}},
    document:{querySelectorAll(){return [];}, body:{classList:{add(){}, remove(){}}},
              addEventListener(type, fn, capture){if (capture) captured[type] = fn;}},
    window:{scrollY:0, addEventListener(type, fn){listeners[type] = fn;}},
    drawChart(){chartDraws++;}, wireReveal(){}, requestAnimationFrame(){}, inkHome(){}, icon(){return '';},
    showCityMap(){}, showWikiRoute(){wikiVisits++;}, wireTips(){}, drawSite(){sitePanels++;},
    drawPortfolio(){}, CSS:{escape: s => s}, shortName: b => b.name,
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
  /* web/i18n.js runs ahead of the board script on the page: the tabs' labels
     are read through its tt(). */
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'i18n.js'), 'utf8'), context);
  /* The guarded localStorage helpers, declared near the top of the script. */
  vm.runInContext(between(source, '/* localStorage, every access guarded', 'const el = '), context);
  vm.runInContext(between(source, 'const SEC_PAGE =', '/* The business a finding'), context);
  vm.runInContext(between(markup, 'const featureDiscovery =', '/* --- changelog dialog'), context);
  vm.runInContext(between(source, 'const PAGES =', '/* --- which kinds of finding'), context);
  /* The crumb row above a site's head, and its clicks. */
  vm.runInContext(between(source, 'const SS_BACK =', "/* The site's page stands on its own"), context);
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
    /* A click on a place in the masthead: its link is what closest() finds. */
    nav(id, ref = 'nav'){
      $(ref).click({button: 0, preventDefault(){}, target:{closest: sel => sel.includes('a[data-id]') ? {dataset:{id}} : null}});
    },
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

/* The redesign's sidebar (docs/architecture.md, "The sidebar"): five destinations,
   then the two references, then the foot's ···. The pages behind them are
   hosts, which keep their ids. */
test('the sidebar is Overview, Businesses, Supply, Staffing, Expansion, then City map and Wiki', () => {
  const b = board();
  assert.deepEqual([...vm.runInContext('AREAS.map(a => a.label)', b.context)],
    ["overview", "businesses", "supply", "staffing", "expansion"].map(k => en("nav.area." + k)));
  assert.deepEqual([...vm.runInContext('REFS.map(r => r.label)', b.context)], [en("nav.ref.map"), en("nav.ref.wiki2")]);
  assert.ok(!vm.runInContext('PAGES.some(p => p.id === "results")', b.context),
    'Results is a view inside Businesses, not a page of its own');
  for (const id of ['overview', 'businesses', 'supply', 'staffing', 'expansion'])
    assert.match(b.$('nav').innerHTML, new RegExp(`data-id="${id}"`));
  assert.match(b.$('navRefs').innerHTML, /data-id="map"/);
  assert.match(b.$('navRefs').innerHTML, /data-id="wiki"/);
  // The utilities are the foot's ···, after the references, inside the sidebar.
  const side = between(markup, '<nav class="sd" id="mast"', '<div class="wrap">');
  assert.ok(side.indexOf('id="navRefs"') < side.indexOf('class="sd-foot"')
    && side.indexOf('class="sd-foot"') < side.indexOf('id="navMore"'), 'the utilities menu sits in the foot, after the references');
  assert.doesNotMatch(b.$('navRefs').innerHTML, /navMore/);
  assert.match(b.$('phoneNav').innerHTML, /data-id="staffing"[\s\S]*id="phoneMore"/, 'a phone has all five places and Map & more');
});

test('Businesses carries Results, Products & prices, Standards and Milestones; Staffing its three views', () => {
  const b = board();
  const items = vm.runInContext('SUBS.company.items', b.context);
  assert.deepEqual([...items].map(([, label]) => label), [en("nav.view.results"), en("nav.view.prices"), en("nav.view.standards"), en("nav.view.milestones")]);
  assert.deepEqual([...items].map(([, , anchor]) => anchor), ['secDaily', 'secProducts', 'secStandards', 'secGoals']);
  assert.equal(vm.runInContext('SUBS.company.start', b.context), 'results');
  const staffing = vm.runInContext('SUBS.staffing.items', b.context);
  assert.deepEqual([...staffing].map(([, label]) => label), [en("nav.view.schedules"), en("nav.view.needs"), en("nav.view.payroll")]);
  assert.deepEqual([...staffing].map(([, , anchor]) => anchor), ['secSchedules', 'secStaff', 'secPayroll'],
    'Staff needs is anchored on the hiring page (issue #89)');
  b.context.showSub('staffing', 'payroll');
  assert.match(b.$('staffingNav').innerHTML, /href="#secPayroll" data-id="payroll" class="on"/);
});

/* Main folded Payroll into its Company › Staff page (issue #89); the redesign
   keeps both as Staffing views. An old hash, an old section link and a
   remembered view each open the one it named. */
test('the old #payroll hash, #secPayroll and a remembered Payroll open Staffing › Payroll', () => {
  for (const hash of ['#payroll', '#secPayroll']) {
    const b = board({data: sites()});
    b.context.location.hash = hash;
    b.boot();
    assert.equal(b.page(), 'staffing', hash);
    assert.equal(b.sub('staffing'), 'payroll', hash);
    assert.equal(vm.runInContext('route', b.context), 'staffing/payroll', hash);
  }
  const saved = {ba_dash_company: 'payroll', ba_dash_page: 'company'};
  const b = board({saved});
  assert.equal(b.sub('company'), 'results', 'Company has no Payroll view any more');
  assert.equal(saved.ba_dash_staffing, 'payroll', 'the remembered view moves to Staffing');
  assert.equal(saved.ba_dash_route, 'staffing/payroll', 'and a board opened with no hash opens it');
});

/* Staff was a Company view on main: its name, its section and a remembered
   Staff open Staffing › Staff needs, whose second half is that page. */
test('the #staff hash, #secStaff and a remembered Staff open Staffing › Staff needs', () => {
  for (const hash of ['#staff', '#secStaff']) {
    const b = board({data: sites()});
    b.context.location.hash = hash;
    b.boot();
    assert.equal(b.page(), 'staffing', hash);
    assert.equal(b.sub('staffing'), 'needs', hash);
    assert.equal(vm.runInContext('route', b.context), 'staffing/needs', hash);
  }
  assert.equal(vm.runInContext('pageFromHash("staff")', board().context), 'staffing');
  const saved = {ba_dash_company: 'staff'};
  board({saved});
  assert.equal(saved.ba_dash_staffing, 'needs');
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
  for (const [hash, pageId, view] of [['#secDaily','company','results'], ['#secPortfolio','company','results'],
                              ['#secProducts','company','products'], ['#secStaff','staffing','needs'],
                              ['#secPayroll','staffing','payroll'], ['#secGoals','company','milestones']]) {
    const b = board();
    b.context.location.hash = hash;
    b.boot();
    assert.equal(b.page(), pageId, hash);
    assert.equal(b.sub(pageId), view, hash);
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
  for (const saved of ['products', 'standards', 'milestones']) {
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

test('Supply is five task views; shops, warehouses and factories are their scope', () => {
  const b = board();
  const items = vm.runInContext('SUBS.supply.items', b.context);
  assert.deepEqual([...items].map(([k, label, anchor]) => [k, label, anchor]),
    [['changes', en("nav.view.changes"), 'secChanges'], ['imports', en("nav.view.imports"), 'secImports'], ['deliveries', en("nav.view.deliveries"), 'secDeliveries'],
     ['production', en("nav.view.production"), 'secProduction'], ['flow', en("nav.view.flow"), 'secFlow']]);
  b.context.showSub('supply', 'production');
  assert.match(b.$('supplyNav').innerHTML, /href="#secProduction" data-id="production" class="on">/);
});

test('a Supply view remembered from before the redesign opens the view that took its place', () => {
  const remembered = saved => { const b = board({saved}); return {sub: b.sub('supply'), kept: saved.ba_dash_supply}; };
  // The R13 tabs: Shops is Deliveries, Warehouses Imports, Factories Production.
  assert.deepEqual(remembered({ba_dash_supply: 'shops'}), {sub: 'deliveries', kept: 'deliveries'});
  assert.deepEqual(remembered({ba_dash_supply: 'warehouses'}), {sub: 'imports', kept: 'imports'});
  assert.deepEqual(remembered({ba_dash_supply: 'factories'}), {sub: 'production', kept: 'production'});
  // A tab left with the diagram on is Goods flow.
  assert.equal(remembered({ba_dash_supply: 'warehouses', ba_dash_supply_view: 'diagram'}).sub, 'flow');
  // Before R13: Checks, Goods flow and Orders.
  assert.equal(remembered({ba_dash_supply: 'checks'}).sub, 'deliveries');
  assert.equal(remembered({ba_dash_supply: 'map'}).sub, 'flow');
  assert.equal(remembered({ba_dash_supply: 'orders'}).sub, 'changes');
  // Nothing remembered: Changes, the area's first view.
  assert.equal(remembered({}).sub, 'changes');
});

test('top menu preserves the sequence through Back and Forward without duplicates', () => {
  const b = board();
  for (const id of ['businesses', 'supply', 'supply']) b.nav(id);
  assert.deepEqual(b.entries, ['#today', '#businesses/results', '#supply/changes'],
    'each place writes its route; the first visit to Supply opens Changes');
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
  assert.deepEqual(b.entries, ['#overview']);
  b.context.showPage('company');
  b.move(-1);
  assert.equal(b.page(), 'today');
});

test('replaying a section hash keeps that history entry intact', () => {
  const b = board();
  b.context.history.pushState(null, '', '#secStock');
  b.move(0);
  assert.equal(b.page(), 'supply');
  assert.equal(b.sub('supply'), 'deliveries', 'an old Checks link opens the view that took its place');
  assert.equal(b.context.location.hash, '#secStock');
  assert.deepEqual(b.entries, ['#today', '#secStock']);
  b.move(-1);
  assert.equal(b.page(), 'today');
});

for (const [pageId, view, anchor, nav] of [
  ['supply','changes','secChanges','supplyNav'], ['supply','imports','secImports','supplyNav'],
  ['supply','deliveries','secDeliveries','supplyNav'], ['supply','production','secProduction','supplyNav'],
  ['supply','flow','secFlow','supplyNav'],
  ['growth','market','secMarket','growthNav'], ['growth','plan','secPlan','growthNav'],
  ['company','products','secProducts','companyNav'], ['staffing','payroll','secPayroll','staffingNav'],
  ['company','milestones','secGoals','companyNav'], ['company','standards','secStandards','companyNav'],
  ['staffing','schedules','secSchedules','staffingNav'], ['staffing','needs','secStaff','staffingNav'],
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
  b.nav('wiki', 'navRefs');
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
  b.nav('businesses');
  assert.equal(b.page(), 'wiki');
  b.nav('wiki', 'navRefs');
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
  b.nav('businesses');
  assert.equal(b.site(), null);
  assert.equal(b.context.location.hash, '#businesses/results');
  b.move(-1);
  assert.equal(b.site(), SHOP);
  b.context.showSub('company', 'products');
  assert.equal(b.site(), null, 'another Company view takes it down too');
});

test('an address that answers nothing lands on the portfolio and says so', () => {
  const b = board({data: sites(), saved: {ba_dash_company: 'staff'}});
  b.context.location.hash = '#site/nowhere-1';
  b.boot();
  assert.equal(b.page(), 'company');
  assert.equal(b.sub('company'), 'results');
  assert.equal(b.site(), null);
  assert.equal(b.context.location.hash, '#businesses/results');
  b.context.history.pushState(null, '', '#site/nowhere-2');
  b.move(0);
  assert.equal(b.site(), null);
  assert.equal(b.context.location.hash, '#businesses/results', 'typed into an open board too');
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
  assert.equal(b.context.location.hash, '#businesses/results');
  assert.deepEqual({...b.states[0]}, {wiki: 'scroll'}, 'replacing the entry keeps its state');
  b.context.openSite(SHOP, false, 'a1');
  assert.deepEqual(Object.keys(b.states[1]), ['ssFrom'], 'a new entry carries only the way back');
});

test('arriving from a finding names the page it was on, through Back, Forward and a reload', () => {
  const b = board({data: sites()});
  b.boot();
  b.context.openSite(SHOP, false, 'a1');
  assert.deepEqual({...b.from()}, {label: en("nav.from.overview"), hash: '#today'});
  assert.deepEqual({...b.states[1].ssFrom}, {label: en("nav.from.overview"), hash: '#today'}, 'the entry carries it');
  b.move(-1); b.move(1);
  assert.deepEqual({...b.from()}, {label: en("nav.from.overview"), hash: '#today'});
  // A reload replays the same entry.
  const again = board({data: sites()});
  again.context.location.hash = '#site/fifthavenue-57';
  again.states[0] = {ssFrom: {label: en("nav.from.overview"), hash: "#today"}};
  again.boot();
  assert.equal(again.from().label, en("nav.from.overview"));
  // Anywhere else a finding is clicked: the view's own word.
  b.context.showSub('supply', 'imports'); b.context.showPage('supply');
  b.context.openSite(DEPOT, false, 'a2');
  assert.deepEqual({...b.from()}, {label: en("nav.view.imports"), hash: '#supply/imports'},
    'a Supply view is named as itself');
  // The picker, a name or a portfolio row is no finding: back to the portfolio.
  b.context.openSite(SHOP);
  assert.equal(b.from(), null);
});

test('the crumb leads back where the reader came from, else to the portfolio', () => {
  const b = board({data: sites()});
  b.boot();
  b.context.openSite(SHOP, false, 'a1');
  const html = b.context.siteCrumbs(SHOP, 'HART. Clothing', true);
  assert.match(html, new RegExp('<a class="ss-crumb from" href="#today" data-ss="back">.*' + enRe("nav.from.overview").source + '</a>'));
  assert.match(html, new RegExp('data-ss="portfolio">' + enRe("sp.crumb.portfolio").source + '</a><i>›</i><a href="#secPortfolio" data-ss="chain" data-chain="Clothing Stores">'));
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
  assert.match(home, new RegExp('<a class="ss-crumb" href="#secPortfolio" data-ss="portfolio">.*' + enRe("sp.crumb.portfolio").source + '</a>'));
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
  assert.deepEqual({...b.from()}, {label: en("nav.from.overview"), hash: '#today'});
  assert.deepEqual({...b.states[1].ssFrom}, {label: en("nav.from.overview"), hash: '#today'});
  // A home opens the same way.
  b.move(-1);
  assert.ok(b.context.openSite(FLAT, true, null, 'push', true));
  assert.equal(b.from().label, en("nav.from.overview"));
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
  assert.equal(b.from().label, en("nav.from.overview"));
  // Its name, the picker's own entry, or a search for it.
  b.context.openSite(SHOP);
  assert.equal(b.from().label, en("nav.from.overview"));
  b.context.openSite(SHOP, true, null, 'push', true);
  assert.equal(b.from().label, en("nav.from.overview"));
  // Another site is somewhere new.
  b.context.openSite(DEPOT);
  assert.equal(b.from(), null);
});

test("from one site's page, a search's site leads back to the first, where Back goes", () => {
  const b = board({data: sites()});
  b.boot();
  assert.equal(b.context.siteHereFrom(), true, 'on Today the page itself is the way back');
  b.context.openSite(SHOP);
  b.context.openSite(DEPOT, true, null, 'push', b.context.siteHereFrom());
  assert.deepEqual({...b.from()}, {label: 'HART. Clothing', hash: '#site/fifthavenue-57'});
  assert.deepEqual({...b.states[2].ssFrom}, {label: 'HART. Clothing', hash: '#site/fifthavenue-57'});
  b.move(-1);
  assert.equal(b.site(), SHOP);
});

/* Issue #100 Change C: a view is a row in SUBS, SEC_PAGE and PAGE_DRAWS
   (docs/architecture.md, Registries, "A view or a page"). A view without its
   SEC_PAGE row cannot be revealed or deep-linked; one without a PAGE_DRAWS
   tag is never redrawn by a live refresh. */
test('every view in SUBS has its SEC_PAGE row and a PAGE_DRAWS tag', () => {
  const b = board();
  const got = JSON.parse(vm.runInContext(`JSON.stringify({
    subs: Object.entries(SUBS).map(([p, s]) => [p, s.items.map(([id, , sec]) => [id, sec])]),
    secPage: SEC_PAGE, tags: PAGE_DRAWS.map(([tag]) => tag)})`, b.context));
  const tagged = new Set(got.tags.flatMap(t => t.split(' ')));
  const missing = [];
  for (const [pageId, views] of got.subs) for (const [view, sec] of views) {
    const row = got.secPage[sec];
    if (!row) missing.push(`${sec} has no SEC_PAGE row`);
    else if (row[0] !== pageId || row[1] !== view)
      missing.push(`SEC_PAGE.${sec} is ${JSON.stringify(row)}, not ["${pageId}","${view}"]`);
    if (!tagged.has(`${pageId}/${view}`)) missing.push(`no PAGE_DRAWS row is tagged ${pageId}/${view}`);
  }
  assert.deepEqual(missing, []);
});

test('every PAGE_DRAWS tag names a real page or view', () => {
  const b = board();
  const got = JSON.parse(vm.runInContext(`JSON.stringify({
    pages: PAGES.map(p => p.id),
    subs: Object.fromEntries(Object.entries(SUBS).map(([p, s]) => [p, s.items.map(([id]) => id)])),
    tags: PAGE_DRAWS.map(([tag]) => tag)})`, b.context));
  const real = new Set();
  for (const p of got.pages) {
    if (got.subs[p]) got.subs[p].forEach(v => real.add(`${p}/${v}`));
    else real.add(p);  // a page without views is drawn under its own id
  }
  // "" is the documented tag for a row a live refresh always draws.
  const bad = got.tags.flatMap(t => t === '' ? [] : t.split(' ')).filter(t => !real.has(t));
  assert.deepEqual(bad, [], `PAGE_DRAWS tags that name no page or view: ${bad.join(', ')}`);
  // And every page with views is in PAGES.
  assert.deepEqual(Object.keys(got.subs).filter(p => !got.pages.includes(p)), []);
});
