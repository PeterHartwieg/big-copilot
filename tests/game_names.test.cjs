// Game names in the player's language: the seam that lays a name table over the
// English payload (localiseNames), the footer's "Game names" picker, the
// one-time offer, sorting, search, and the two tight places a longer or wider
// name would overflow. The payload and the German table come out of the real
// Python (tests/game_names_fixture.py); the Japanese is the committed
// web/names/ja.json. The seam's own tests run its source in a vm; the rest runs
// in Playwright against web/index.html, the page that carries the picker.
// Install Playwright and its Chromium browser to run; NODE_PATH may point at an
// existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const SOURCE = fs.readFileSync(path.join(ROOT, 'ba_dashboard.py'), 'utf8').replace(/\r\n/g, '\n');

let FIX;
before(() => {
  const out = spawnSync(process.env.PYTHON || 'python', ['-m', 'tests.game_names_fixture'],
    {cwd: ROOT, maxBuffer: 64 * 1024 * 1024});
  assert.equal(out.status, 0, out.stderr?.toString());
  FIX = JSON.parse(out.stdout.toString('utf8'));
});

/* --- the seam, in a vm ----------------------------------------------------
   Its source, from the board script: gameName() to gnLangAttr(). */
function seamSource(){
  const from = SOURCE.indexOf('const gameName = key =>');
  const last = SOURCE.indexOf('const gnLangAttr = ');
  assert.ok(from > 0 && last > from, 'the seam moved: update the anchors in tests/game_names.test.cjs');
  return SOURCE.slice(from, SOURCE.indexOf('\n', last) + 1);
}
const LANGS = ['en', 'cs', 'da', 'de', 'es', 'fr', 'it', 'lt', 'hu', 'nl', 'pl', 'pt', 'ro', 'fi', 'tr',
  'el', 'ru', 'uk', 'ja', 'ko', 'zh-cn', 'zh-tw'];
function seam({table = null, lang = 'de'} = {}){
  const picker = {options: LANGS.map(value => ({value, textContent: value})), dataset: {}, value: 'en',
    addEventListener(){}};
  const drawn = [];
  const context = vm.createContext({
    D: null, HOOD_NAMES: {}, page: 'today', console,
    prettySlug: s => s.replace(/^ba:[a-z]+_/, ''),
    spEsc: s => String(s), attr: s => String(s),
    hasData: () => !!context.D,
    renderCalm(lazy){ drawn.push(['calm', lazy]); },
    document: {querySelectorAll: sel => sel === '[data-gn-pick]' ? [picker] : [], querySelector: () => null},
    localStorage: {getItem: () => null, setItem(){}},
    navigator: {languages: ['en-US']}, window: {}, fetch: async () => { throw new Error('offline'); },
    Intl, Symbol,
  });
  vm.runInContext(seamSource(), context);
  const run = code => vm.runInContext(code, context);
  if(table){ context.__table = table; run(`gnTable = __table; gnLang = ${JSON.stringify(lang)};`); }
  return {context, run, drawn};
}
const clone = o => JSON.parse(JSON.stringify(o));

test('the German table swaps every game name the board shows, and nothing the player named', () => {
  const {context, run} = seam({table: FIX.de});
  const en = clone(FIX.payload);
  context.__raw = en;
  run('takeData(__raw)');
  const D = context.D, EN = en.names, de = FIX.de;
  const want = key => de[key] || EN[key];
  assert.ok(D.businesses.length >= 3);
  D.businesses.forEach((b, i) => {
    assert.equal(b.name, en.businesses[i].name, 'a business keeps the name the player gave it');
    assert.equal(b.type, want(b.typeSlug));
    (b.uniformGaps || []).forEach((g, k) => assert.equal(g, want(b.uniformGapSkills[k])));
  });
  assert.equal(D.businesses[0].type, 'Geschenkeladen');
  // A role with no key beside it: read by the kind of name it is.
  const roles = D.businesses.flatMap(b => (b.people || []).map(p => p.role));
  assert.ok(roles.length && roles.every(r => r === 'Kundendienst'), roles.join(', '));
  assert.deepEqual(D.staff.roles.map(r => r.role), ['Kundendienst']);
  Object.keys(EN).forEach(k => assert.equal(D.names[k], want(k), k));
  Object.keys(en.skillNames).forEach(k => assert.equal(D.skillNames[k], want(k), k));
  // The plan: recipes by slug, the catalogue under its type's key, items by key.
  en.plan.recipes.forEach((r, i) => {
    assert.equal(D.plan.recipes[i].item, want(r.slug));
    r.ingredients.forEach((g, j) => assert.equal(D.plan.recipes[i].ingredients[j].item, want(g.slug)));
  });
  Object.keys(en.plan.catalogue).forEach(k => assert.equal(D.plan.catalogue[k].type, want(k)));
  Object.keys(en.plan.items).forEach(k => assert.equal(D.plan.items[k], want(k)));
  // A name the German words as English is not in the table, and reads English.
  assert.equal(de[FIX.sameInGerman], undefined);
  assert.equal(D.names[FIX.sameInGerman], EN[FIX.sameInGerman]);
  // The English payload is carried along untouched.
  assert.deepEqual(clone(run('dataEn()')), FIX.payload);
  assert.equal(run('englishName("ba:businesstype_giftshop")'), 'Gift Shop');
});

/* Every place one English name shows up reads the same after the swap: any
   join between two of them (a role against a uniform gap, a recipe's input
   against the item list) holds exactly when this does. A field the seam missed
   stays English while its partner is swapped, and this fails. */
test('a name reads alike wherever it appears, so a join inside the payload still holds', () => {
  const {context, run} = seam({table: FIX.de});
  context.__raw = clone(FIX.payload);
  run('takeData(__raw)');
  const EN = FIX.payload.names;
  const owners = new Map();
  Object.entries(EN).forEach(([k, v]) => owners.set(v, (owners.get(v) || new Set()).add(k)));
  // A name two keys share can only be told apart by its key: those are
  // checked by key above, and have no one reading here.
  const one = v => owners.has(v) && owners.get(v).size === 1;
  const seen = new Map();
  const walk = (en, loc, at) => {
    if(typeof en === 'string'){
      if(at !== 'names' && one(en)) (seen.get(en) || seen.set(en, new Set()).get(en)).add(loc);
      return;
    }
    if(!en || typeof en !== 'object') return;
    if(Array.isArray(en)) return en.forEach((x, i) => walk(x, loc[i], at));
    Object.keys(en).forEach(k => walk(en[k], loc[k], k === 'names' || k === 'skillNames' ? 'names' : at));
  };
  walk(FIX.payload, context.D, '');
  assert.ok(seen.size > 20, `only ${seen.size} names in the fixture`);
  const split = [...seen].filter(([, s]) => s.size > 1).map(([en, s]) => `${en}: ${[...s].join(' | ')}`);
  assert.deepEqual(split, []);
  // The join the site panel's crew makes: a role with no uniform.
  context.D.businesses.forEach((b, i) => {
    const was = FIX.payload.businesses[i];
    (was.people || []).forEach((p, k) =>
      assert.equal((b.uniformGaps || []).includes(b.people[k].role), (was.uniformGaps || []).includes(p.role)));
  });
});

test('English is the identity, and a swapped board goes back to English whole', () => {
  const {context, run} = seam();
  context.__raw = clone(FIX.payload);
  run('takeData(__raw)');
  // Python's tokens read as the English Python wrote, and nothing else moves.
  assert.deepEqual(clone(context.D), FIX.english);
  assert.deepEqual(clone(run('dataEn()')), FIX.payload);
  context.__table = FIX.de;
  run('gnTable = __table; gnLang = "de"; D = localiseNames(D);');
  assert.equal(context.D.businesses[0].type, 'Geschenkeladen');
  // Swapping a swapped board starts from its English, never from the German.
  run('D = localiseNames(D);');
  assert.equal(context.D.businesses[0].type, 'Geschenkeladen');
  run('gnTable = null; gnLang = "en"; D = localiseNames(D);');
  assert.deepEqual(clone(context.D), FIX.english);
});

test('a name two keys share stays English where it comes without its key', () => {
  const {context, run} = seam({table: FIX.de});
  context.__de = FIX.de; context.__en = FIX.payload.names;
  const byName = run('gnByName(__de, __en, "ba:itemname_")');
  assert.equal(byName.has('Bag of Lettuce'), false);
  assert.equal(byName.get('Paper Bag'), 'Papiertüte');
  // With its key it is swapped all the same.
  context.__raw = {names: FIX.payload.names, rows: [
    {item: 'Bag of Lettuce', slug: 'ba:itemname_lettuce'}, {item: 'Bag of Lettuce', slug: 'ba:itemname_rawlettuce'}]};
  run('takeData(__raw)');
  assert.deepEqual(context.D.rows.map(r => r.item), ['Beutel mit Salat', 'Beutel Salat']);
});

test('a name written into a sentence as a token reads in the language on screen', () => {
  const {context, run} = seam({table: FIX.de});
  const said = '2 ⟦ba:skill_customerservice|Customer Service⟧ short at HART. Gifts';
  // A key the table lacks keeps the English Python wrote, not the game text's.
  const own = 'fills ⟦ba:itemname_nosuchthing|Widget⟧';
  context.__raw = {names: FIX.payload.names, alerts: [{text: said}, {text: own}]};
  run('takeData(__raw)');
  assert.equal(context.D.alerts[0].text, '2 Kundendienst short at HART. Gifts');
  assert.equal(context.D.alerts[1].text, 'fills Widget');
  run('gnTable = null; gnLang = "en"; D = localiseNames(D);');
  assert.equal(context.D.alerts[0].text, '2 Customer Service short at HART. Gifts');
  assert.equal(run('dataEn()').alerts[0].text, said);
  // The payload's own findings, from the real Python, name things this way.
  const tokens = JSON.stringify(FIX.payload).match(/⟦ba:[a-z]+_[^|⟧]+\|[^⟧]+⟧/g) || [];
  for(const kind of ['skill', 'itemname', 'neighborhood'])
    assert.ok(tokens.some(t => t.startsWith(`⟦ba:${kind}_`)), `no ${kind} token in the fixture`);
});

test('names sort by the rules of the language they are shown in', () => {
  const {run} = seam();
  const words = JSON.stringify(['Äes', 'Zeta', 'Apu']);
  // Finnish sorts Ä after Z; English reads it as an A.
  assert.deepEqual(clone(run(`${words}.slice().sort(gnCompare)`)), ['Äes', 'Apu', 'Zeta']);
  assert.deepEqual(clone(run(`gnLang = "fi"; ${words}.slice().sort(gnCompare)`)), ['Apu', 'Zeta', 'Äes']);
});

test('the browser language picks the game language the offer names', () => {
  const {run} = seam();
  const pick = list => run(`gnBrowserLang(${JSON.stringify(list)})`);
  assert.equal(pick(['de-AT', 'en']), 'de');
  assert.equal(pick(['pt-BR']), 'pt');
  assert.equal(pick(['zh-CN']), 'zh-cn');
  assert.equal(pick(['zh-Hans']), 'zh-cn');
  assert.equal(pick(['zh-Hant']), 'zh-tw');
  assert.equal(pick(['zh-TW']), 'zh-tw');
  assert.equal(pick(['zh-HK']), 'zh-tw');
  // English first: no offer, whatever follows.
  assert.equal(pick(['en-GB', 'de']), 'en');
  // A language the game lacks is passed over for the next.
  assert.equal(pick(['sv-SE', 'fr-FR']), 'fr');
  assert.equal(pick([]), 'en');
});

/* --- the page -------------------------------------------------------------- */
let chromium;
let browser;
before(async () => {
  ({chromium} = require('playwright'));
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

/* web/index.html served from web/, with the synthetic German table in place of
   the committed one. `fetched` records every names/ request. */
async function site(t, {locale = 'en-US', width = 1280, height = 900, context: given} = {}){
  const context = given || await browser.newContext({viewport: {width, height}, locale, reducedMotion: 'reduce'});
  if(!given) t.after(() => context.close());
  const page = await context.newPage();
  const errors = [], fetched = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if(url.hostname !== 'names.test') return route.abort();
    const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    if(name.startsWith('/names/')) fetched.push(url.pathname + url.search);
    if(name === '/names/de.json') return route.fulfill({contentType: 'application/json', body: JSON.stringify(FIX.de)});
    const file = path.join(WEB, name);
    if(!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({path: file});
  });
  await page.goto('http://names.test/');
  return {page, errors, fetched, context};
}
const boardOn = (page, payload = FIX.payload) => page.evaluate(raw => {
  document.body.classList.add('has-board');
  takeData(raw);
  boot();
}, payload);

test('the offer shows once, in the language the browser prefers, and a No is kept', async t => {
  const {page, errors, context} = await site(t, {locale: 'de-DE'});
  const offer = page.locator('.gn-offer');
  await offer.waitFor();
  assert.equal((await offer.locator('p').textContent()).trim(), 'Show game names in Deutsch?');
  assert.equal(await offer.locator('[lang="de"]').textContent(), 'Deutsch');
  await offer.locator('.gn-no').click();
  assert.equal(await offer.count(), 0);
  assert.equal(await page.evaluate(() => gnLang), 'en');
  const again = await site(t, {context});
  await again.page.waitForTimeout(200);
  assert.equal(await again.page.locator('.gn-offer').count(), 0);
  assert.equal(await again.page.evaluate(() => gnLang), 'en');
  assert.deepEqual(errors, []);
});

test('a Yes switches the names and is kept, and nobody reading in English is asked', async t => {
  const {page, fetched, context} = await site(t, {locale: 'de-DE'});
  await boardOn(page);
  await page.locator('.gn-offer .gn-yes').click();
  await page.waitForFunction(() => gnLang === 'de');
  const stamp = await page.evaluate(() => window.LEDGER_BUILD);
  assert.deepEqual(fetched, [`/names/de.json?v=${stamp}`]);
  assert.equal(await page.evaluate(() => D.businesses[0].type), 'Geschenkeladen');
  assert.deepEqual(await page.$$eval('[data-gn-pick]', els => els.map(e => e.value)), ['de', 'de']);
  const again = await site(t, {context});
  await again.page.waitForFunction(() => gnLang === 'de');
  assert.equal(await again.page.locator('.gn-offer').count(), 0);
  const english = await site(t, {locale: 'en-GB'});
  await english.page.waitForTimeout(200);
  assert.equal(await english.page.locator('.gn-offer').count(), 0);
});

test('the footer picker is kept across visits, and picking in it closes the offer', async t => {
  const {page, errors, context} = await site(t, {locale: 'fr-FR'});
  await page.locator('.gn-offer').waitFor();
  await page.locator('.sf-landing [data-gn-pick]').selectOption('de');
  await page.waitForFunction(() => gnLang === 'de');
  assert.equal(await page.locator('.gn-offer').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('ba_dash_names')), 'de');
  const again = await site(t, {context});
  await again.page.waitForFunction(() => gnLang === 'de');
  assert.equal(await again.page.locator('.sf-landing [data-gn-pick]').inputValue(), 'de');
  await again.page.locator('.sf-landing [data-gn-pick]').selectOption('en');
  await again.page.waitForFunction(() => gnLang === 'en');
  assert.equal(await again.page.evaluate(() => localStorage.getItem('ba_dash_names')), 'en');
  assert.deepEqual(errors, []);
});

test('a switch redraws the board already open, from the English it holds', async t => {
  const {page, errors} = await site(t);
  await boardOn(page);
  await page.evaluate(() => showPage('company'));
  const english = await page.evaluate(() => document.querySelector('#pageCompany').textContent);
  assert.ok(english.includes('Gift Shop'));
  await page.locator('.sitefoot:not(.sf-landing) [data-gn-pick]').selectOption('de');
  await page.waitForFunction(() => gnLang === 'de');
  const german = await page.evaluate(() => document.querySelector('#pageCompany').textContent);
  assert.ok(german.includes('Geschenkeladen'), 'the portfolio names the type in German');
  // A chain's name is Python's own English ("Gift Shops", a plural the game's
  // text has no word for), so it is the one place the English stays.
  assert.ok(!german.replace(/Gift Shops/g, '').includes('Gift Shop'));
  assert.deepEqual(errors, []);
});

test('search finds a game name by the German and by the English', async t => {
  const {page} = await site(t);
  await boardOn(page);
  await page.evaluate(async () => { await setGameNames('de'); });
  const sites = q => page.evaluate(q => (ssSearch(q, ssBuild()).find(g => g.g === 'sites') || {hits: []})
    .hits.map(h => h.e.id), q);
  const gifts = 'site:' + FIX.payload.businesses[0].key;
  assert.ok((await sites('geschenke')).includes(gifts));
  // "shop" is only in the English name: not in the site's own name or address.
  assert.ok((await sites('shop')).includes(gifts));
  await page.evaluate(async () => { await setGameNames('en'); });
  assert.ok(!(await sites('geschenke')).includes(gifts));
});

test('a table sorted by a name sorts in the language on screen', async t => {
  const {page} = await site(t);
  const order = lang => page.evaluate(lang => {
    gnLang = lang;
    return supplySorted([{i: 'Äes'}, {i: 'Zeta'}, {i: 'Apu'}], [['Item', r => r.i]], {col: 0, dir: 1}).map(r => r.i);
  }, lang);
  assert.deepEqual(await order('fi'), ['Apu', 'Zeta', 'Äes']);
  assert.deepEqual(await order('en'), ['Äes', 'Apu', 'Zeta']);
});

test('a Japanese goods-flow node and a German heat-grid header stay inside their boxes', async t => {
  const {page, errors} = await site(t);
  const ja = JSON.parse(fs.readFileSync(path.join(WEB, 'names', 'ja.json'), 'utf8'));
  const payload = clone(FIX.payload);
  // A player may name a site in Japanese too; the node's second line is its type.
  const depot = payload.businesses.findIndex(b => b.typeSlug === 'ba:businesstype_warehouse');
  const node = payload.supply.graph.nodes.find(n => n.id === payload.businesses[depot].key);
  node.name = payload.businesses[depot].name = 'ハート物流センター新宿三丁目倉庫';
  node.stock = 0;
  await boardOn(page, payload);
  await page.evaluate(async table => { gnTables.set('ja', Promise.resolve(table)); await setGameNames('ja'); }, ja);
  await page.evaluate(() => { showPage('supply'); showSub('supply', 'map'); });
  const boxes = await page.$$eval('#flow .node, .flow .node', nodes => nodes.map(g => {
    const r = g.querySelector('rect').getBBox();
    return [...g.querySelectorAll('text')].map(t => ({text: t.textContent, over: t.getBBox().x + t.getBBox().width - (r.x + r.width)}));
  }).flat());
  const jp = boxes.filter(b => /[぀-ヿ一-鿿]/.test(b.text));
  assert.ok(jp.length >= 2, JSON.stringify(boxes));
  jp.forEach(b => assert.ok(b.over <= 0, `${b.text} runs ${b.over.toFixed(1)}px past its box`));

  const hoods = ['ba:neighborhood_garmentdistrict', 'ba:neighborhood_hellskitchen', 'ba:neighborhood_industrycity',
    'ba:neighborhood_lowermanhattan', 'ba:neighborhood_midtown', 'ba:neighborhood_murrayhill', 'ba:neighborhood_thehamptons'];
  const cell = hood => ({hood, demand: 60, count: 1, providers: 1, sell: 0, here: false});
  payload.market = {hoods, trendDays: 0, noOffices: [], rows: [], offices: [], movers: [], hype: [], shortages: [], gaps: [],
    types: [{type: 'Gift Shop', slug: 'ba:businesstype_giftshop', products: 1, mine: false, peak: 60, cells: hoods.map(cell)}]};
  await page.evaluate(raw => { takeData(raw); }, payload);
  await page.evaluate(async () => { await setGameNames('de'); showPage('growth'); showSub('growth', 'market'); marketView = 'types'; drawMarket(); });
  const heads = await page.$$eval('#market .h[data-hood]', hs => hs.map(h => ({
    text: h.textContent, lang: h.querySelector('.mk-long')?.getAttribute('lang'),
    over: h.scrollWidth - h.clientWidth})));
  const long = heads.find(h => h.text.includes(FIX.longHoodName));
  assert.ok(long, JSON.stringify(heads));
  assert.equal(long.lang, 'de');
  heads.forEach(h => assert.ok(h.over <= 0, `${h.text} overflows by ${h.over}px`));
  assert.deepEqual(errors, []);
});

/* No token is ever seen: every page and view, every site's own page and the
   findings, in English and in German, with the fixture's findings naming
   roles, items and a neighbourhood inside their sentences. */
test('no game-name token reaches the page, in English or in German', async t => {
  const {page, errors} = await site(t);
  await boardOn(page);
  const sweep = () => page.evaluate(async () => {
    const seen = [];
    const look = where => {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      for(let n = walk.currentNode; n; n = walk.nextNode()){
        if(n.nodeType === 3){
          const host = n.parentElement;
          if(host && host.closest('script,style,template')) continue;
          if(/[⟦⟧]/.test(n.data)) seen.push(`${where}: text ${n.data.trim().slice(0, 80)}`);
        } else {
          for(const a of n.attributes) if(/[⟦⟧]/.test(a.value)) seen.push(`${where}: ${n.tagName}[${a.name}] ${a.value.slice(0, 80)}`);
        }
      }
    };
    const wait = () => new Promise(r => setTimeout(r, 30));
    for(const p of PAGES.map(p => p.id)){
      showPage(p); await wait(); look(p);
      for(const [view] of (SUBS[p] || {items: []}).items){ showSub(p, view); await wait(); look(`${p}/${view}`); }
    }
    for(const b of D.businesses){ openSite(b.key); await wait(); look(`site ${b.name}`); }
    showPage('today'); await wait();
    const index = ssBuild();
    index.forEach(e => { if(/[⟦⟧]/.test([e.t, e.p, ...(e.kw || [])].join(' '))) seen.push(`search ${e.id}`); });
    return seen;
  });
  assert.deepEqual(await sweep(), []);
  const english = await page.evaluate(() => alertLines().map(a => a.text).join('\n'));
  assert.match(english, /Garment District hype/);
  assert.match(english, /Projectionist staffing is the limit/);
  assert.match(english, /soonest Paper Bag/);
  await page.evaluate(async () => { await setGameNames('de'); });
  assert.deepEqual(await sweep(), []);
  const german = await page.evaluate(() => alertLines().map(a => a.text).join('\n'));
  assert.ok(german.includes(`${FIX.longHoodName} hype`), german);
  assert.ok(german.includes('Projectionist (DE) staffing is the limit'), german);
  assert.ok(german.includes('soonest Papiertüte'), german);
  // The composite limit still reads back to its role once it is in German, so
  // the site page's cap chip lights that role's hours.
  const shows = await page.evaluate(key => { openSite(key);
    return [...document.querySelectorAll('#sitePanel [data-show]')].map(e => e.dataset.show); }, FIX.payload.businesses[0].key);
  assert.ok(shows.some(s => s.includes('staff:ba:skill_projectionist')), JSON.stringify(shows));
  assert.deepEqual(errors, []);
});
