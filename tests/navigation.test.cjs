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
  const entries = ['#today'];
  let position = 0;
  const listeners = {};
  const elements = new Map();
  let chartDraws = 0, wikiVisits = 0, sitePanels = 0;
  const $ = id => {
    if (!elements.has(id)) elements.set(id, {hidden:false, innerHTML:'', addEventListener(type, fn){this[type] = fn;}});
    return elements.get(id);
  };
  const location = {hash:'#today'};
  const context = vm.createContext({$, location, D: data,
    history:{
      replaceState(_, __, hash){entries[position] = location.hash = hash;},
      pushState(_, __, hash){entries.splice(++position); entries.push(location.hash = hash);},
    },
    localStorage:{getItem(key){return saved[key] ?? null;}, setItem(){}},
    document:{querySelectorAll(){return [];}, body:{classList:{add(){}, remove(){}}}},
    window:{scrollY:0, addEventListener(type, fn){listeners[type] = fn;}},
    drawChart(){chartDraws++;}, wireReveal(){}, requestAnimationFrame(){}, inkHome(){}, icon(){return '';},
    showCityMap(){}, showWikiRoute(){wikiVisits++;}, wireTips(){}, drawSite(){sitePanels++;},
  });
  vm.runInContext(source.slice(source.indexOf('const SEC_PAGE ='), source.indexOf('/* The business a finding')), context);
  vm.runInContext(source.slice(source.indexOf('const featureDiscovery ='), source.indexOf('/* --- changelog dialog')), context);
  vm.runInContext(source.slice(source.indexOf('const PAGES ='), source.indexOf('/* --- which kinds of finding')), context);
  let booted = false;
  const load = () => {
    if (booted) return;
    booted = true;
    context.renderAll = context.wireNav = context.wireCoin = context.wireSphere = () => {};
    vm.runInContext(BOOT, context);
  };
  return {context, entries, $, charts(){return chartDraws;}, wikiVisits(){return wikiVisits;},
    sitePanels(){return sitePanels;},
    boot(){ load(); context.boot(); },
    shell(){ load(); context.bootShell(); },
    move(delta){
      position = Math.max(0, Math.min(entries.length - 1, position + delta));
      location.hash = entries[position];
      listeners.hashchange();
    },
    page(){return vm.runInContext('page', context);},
    sub(id){return vm.runInContext(`sub.${id}`, context);},
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
