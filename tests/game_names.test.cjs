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
  const opts = LANGS.map(value => ({dataset: {value}, textContent: value, getAttribute: () => value}));
  const picker = {dataset: {value: 'en'}, querySelectorAll: sel => sel === '.gn-opts [data-value]' ? opts : [],
    querySelector: () => null, addEventListener(){}};
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
  // A name beside a type key is a business somebody named: one called
  // "Warehouse" keeps its name, though the type beside it is swapped.
  context.__raw = {names: en.names, businesses: [
    {name: 'Warehouse', type: 'Warehouse', typeSlug: 'ba:businesstype_warehouse'}],
    staffing: [{key: 'k', name: 'Warehouse', typeSlug: 'ba:businesstype_warehouse', failed: true}]};
  const named = run('localiseNames(__raw)');
  assert.deepEqual([named.businesses[0].name, named.businesses[0].type, named.staffing[0].name],
    ['Warehouse', 'Lagerhaus', 'Warehouse']);
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
  assert.deepEqual(await page.$$eval('[data-gn-pick]', els => els.map(e => e.dataset.value)), ['de', 'de']);
  const again = await site(t, {context});
  await again.page.waitForFunction(() => gnLang === 'de');
  assert.equal(await again.page.locator('.gn-offer').count(), 0);
  const english = await site(t, {locale: 'en-GB'});
  await english.page.waitForTimeout(200);
  assert.equal(await english.page.locator('.gn-offer').count(), 0);
});

/* The footer's picker: a button and a listbox hung off <body>. `choose` opens
   it with a click and clicks the language's row. */
const picker = (page, where = '.sf-landing') => page.locator(`${where} [data-gn-pick]`);
async function choose(page, lang, where){
  await picker(page, where).locator('.gn-btn').click();
  await page.locator(`#gnPop [role="option"][data-value="${lang}"]`).click();
}
const popState = page => page.evaluate(() => {
  const pop = document.getElementById('gnPop'), act = pop && pop.getAttribute('aria-activedescendant');
  return {open: !!pop && !pop.hidden, active: act ? document.getElementById(act).dataset.value : null,
    focus: document.activeElement === pop ? 'list' : document.activeElement.className};
});

test('the footer picker is kept across visits, and picking in it closes the offer', async t => {
  const {page, errors, context} = await site(t, {locale: 'fr-FR'});
  await page.locator('.gn-offer').waitFor();
  await choose(page, 'de');
  await page.waitForFunction(() => gnLang === 'de');
  assert.equal(await page.locator('.gn-offer').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('ba_dash_names')), 'de');
  assert.equal(await picker(page).locator('.gn-cur').textContent(), 'Deutsch');
  assert.equal((await popState(page)).open, false);
  const again = await site(t, {context});
  await again.page.waitForFunction(() => gnLang === 'de');
  assert.equal(await picker(again.page).getAttribute('data-value'), 'de');
  assert.equal(await picker(again.page).locator('.gn-cur').getAttribute('lang'), 'de');
  await choose(again.page, 'en');
  await again.page.waitForFunction(() => gnLang === 'en');
  assert.equal(await again.page.evaluate(() => localStorage.getItem('ba_dash_names')), 'en');
  assert.deepEqual(errors, []);
});

test('the picker is a listbox button: every choice listed, the current one marked', async t => {
  const {page, errors} = await site(t);
  const btn = picker(page).locator('.gn-btn');
  assert.equal(await btn.getAttribute('aria-haspopup'), 'listbox');
  assert.equal(await btn.getAttribute('aria-expanded'), 'false');
  // Named by the column's head and the language it shows.
  assert.equal(await page.evaluate(() => {
    const b = document.querySelector('.sf-landing .gn-btn');
    return b.getAttribute('aria-labelledby').split(' ').map(id => document.getElementById(id).textContent.trim()).join(' ');
  }), 'Game names English');
  await btn.click();
  assert.equal(await btn.getAttribute('aria-expanded'), 'true');
  const pop = page.locator('#gnPop');
  assert.equal(await pop.getAttribute('role'), 'listbox');
  assert.equal(await pop.getAttribute('aria-labelledby'), 'gnHeadL');
  // Hung off <body>, not inside the footer, and fixed against the button.
  assert.equal(await page.evaluate(() => document.getElementById('gnPop').parentElement === document.body), true);
  assert.equal(await pop.evaluate(e => getComputedStyle(e).position), 'fixed');
  const rows = await pop.locator('[role="option"]').evaluateAll(els => els.map(e => [e.dataset.value, e.getAttribute('lang'), e.textContent]));
  assert.deepEqual(rows.map(r => r[0]), LANGS);
  assert.deepEqual(rows.find(r => r[0] === 'ja'), ['ja', 'ja', '日本語']);
  assert.deepEqual(await pop.locator('[aria-selected="true"]').evaluateAll(els => els.map(e => e.dataset.value)), ['en']);
  // 22 rows scroll inside a list that stays within the window.
  const box = await pop.evaluate(e => ({sh: e.scrollHeight, ch: e.clientHeight, top: e.getBoundingClientRect().top,
    bottom: e.getBoundingClientRect().bottom, vh: innerHeight}));
  assert.ok(box.sh > box.ch, JSON.stringify(box));
  assert.ok(box.top >= 0 && box.bottom <= box.vh, JSON.stringify(box));
  // A click outside closes it, and picks nothing.
  await page.locator('.sf-landing .sf-gn .sf-head').click();
  assert.equal((await popState(page)).open, false);
  assert.equal(await btn.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => gnLang), 'en');
  assert.deepEqual(errors, []);
});

test('the picker works from the keyboard alone', async t => {
  const {page, errors} = await site(t);
  const btn = picker(page).locator('.gn-btn');
  await btn.focus();
  // Escape closes and hands focus back to the button.
  await page.keyboard.press('Enter');
  assert.deepEqual(await popState(page), {open: true, active: 'en', focus: 'list'});
  await page.keyboard.press('Escape');
  assert.deepEqual(await popState(page), {open: false, active: null, focus: 'gn-btn'});
  // The arrows open it too, and move; Home and End go to the ends.
  await page.keyboard.press('ArrowDown');
  assert.deepEqual(await popState(page), {open: true, active: 'en', focus: 'list'});
  await page.keyboard.press('ArrowDown');
  assert.equal((await popState(page)).active, 'cs');
  await page.keyboard.press('End');
  assert.equal((await popState(page)).active, 'zh-tw');
  // The last row is scrolled into view.
  assert.ok(await page.evaluate(() => {
    const pop = document.getElementById('gnPop'), row = pop.querySelector('.gn-on');
    const a = pop.getBoundingClientRect(), b = row.getBoundingClientRect();
    return b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
  }));
  await page.keyboard.press('ArrowDown');
  assert.equal((await popState(page)).active, 'zh-tw');
  await page.keyboard.press('Home');
  assert.equal((await popState(page)).active, 'en');
  await page.keyboard.press('ArrowUp');
  assert.equal((await popState(page)).active, 'en');
  // Type-ahead: the first row starting with the letters typed.
  await page.keyboard.type('de');
  assert.equal((await popState(page)).active, 'de');
  await page.waitForTimeout(600);
  await page.keyboard.type('p');
  assert.equal((await popState(page)).active, 'pl');
  await page.keyboard.type('p');
  assert.equal((await popState(page)).active, 'pt');
  await page.waitForTimeout(600);
  // Enter picks, closes and hands focus back; the names switch and are kept.
  await page.keyboard.type('deu');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => gnLang === 'de');
  assert.deepEqual(await popState(page), {open: false, active: null, focus: 'gn-btn'});
  assert.equal(await page.evaluate(() => localStorage.getItem('ba_dash_names')), 'de');
  assert.equal(await btn.locator('.gn-cur').textContent(), 'Deutsch');
  // Space picks too, and the button it hands focus back to stays shut.
  await page.keyboard.press('Space');
  assert.equal((await popState(page)).active, 'de');
  await page.keyboard.press('Home');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => gnLang === 'en');
  assert.deepEqual(await popState(page), {open: false, active: null, focus: 'gn-btn'});
  assert.equal(await page.evaluate(() => localStorage.getItem('ba_dash_names')), 'en');
  // Tab closes the list without picking.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  assert.equal((await popState(page)).open, false);
  assert.equal(await page.evaluate(() => gnLang), 'en');
  assert.deepEqual(errors, []);
});

test('near the foot of the window the list opens above its button, inside a phone screen', async t => {
  const {page, errors} = await site(t, {width: 375, height: 700});
  const btn = picker(page).locator('.gn-btn');
  await btn.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const b = document.querySelector('.sf-landing .gn-btn').getBoundingClientRect();
    scrollBy(0, b.bottom - innerHeight + 20);
  });
  await btn.click();
  const [b, p] = await page.evaluate(() => [document.querySelector('.sf-landing .gn-btn'), document.getElementById('gnPop')]
    .map(e => { const r = e.getBoundingClientRect(); return {top: r.top, bottom: r.bottom, left: r.left, right: r.right}; }));
  assert.ok(p.bottom <= b.top, JSON.stringify({b, p}));
  assert.ok(p.top >= 0 && p.left >= 0 && p.right <= 375, JSON.stringify(p));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});

test('a switch redraws the board already open, from the English it holds', async t => {
  const {page, errors} = await site(t);
  await boardOn(page);
  await page.evaluate(() => showPage('company'));
  const english = await page.evaluate(() => document.querySelector('#pageCompany').textContent);
  assert.ok(english.includes('Gift Shop'));
  await choose(page, 'de', '.sitefoot:not(.sf-landing)');
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
  // The goods-flow diagram is a view of Supply's tabs: the depot's tab, drawn as the diagram.
  await page.evaluate(() => { showPage('supply'); sbViewOn = 'diagram'; showSub('supply', 'warehouses'); drawSupplyTab('warehouses'); wireAll(); });
  // On screen, so the widths below are measured and not a hidden svg's zeros.
  assert.ok(await page.evaluate(() => document.querySelector('#flow').getBoundingClientRect().width > 0));
  const boxes = await page.$$eval('#flow .node, .flow .node', nodes => nodes.map(g => {
    const r = g.querySelector('rect').getBBox();
    return [...g.querySelectorAll('text')].map(t => ({text: t.textContent, over: t.getBBox().x + t.getBBox().width - (r.x + r.width)}));
  }).flat());
  const jp = boxes.filter(b => /[぀-ヿ一-鿿]/.test(b.text));
  assert.ok(jp.length >= 2, JSON.stringify(boxes));
  jp.forEach(b => assert.ok(b.over <= 0, `${b.text} runs ${b.over.toFixed(1)}px past its box`));
  // The type line carries its whole name as a title, and a cut says so.
  const titles = await page.$$eval('#flow .node text.s title', ts => ts.map(t => t.textContent));
  assert.ok(titles.includes(ja['ba:businesstype_warehouse']), JSON.stringify(titles));
  assert.equal(await page.evaluate(() => shortText('Fruit and Vegetable Store', 21, true)), 'Fruit and Vegetable\u2026');
  assert.equal(await page.evaluate(() => shortText('Electronics Store', 21, true)), 'Electronics Store');

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
          /* A raw game key is a name the page failed to look up. */
          if(/[⟦⟧]|\bba:(itemname|businesstype|skill|neighborhood|factoryworkstationtype|jobdemand)_/.test(n.data))
            seen.push(`${where}: text ${n.data.trim().slice(0, 80)}`);
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
    /* Supply's tabs, each in both lists, as the diagram, in both sizings. */
    showPage('supply');
    for(const mode of ['cap', 'dem']) for(const which of ['changes', 'all']) for(const view of ['list', 'diagram']){
      sizing = mode; sbWhich = which; sbViewOn = view;
      for(const [tab] of SUBS.supply.items){
        showSub('supply', tab); drawSupplyTab(tab); wireAll(); await wait();
        look(`supply/${tab} ${mode} ${which} ${view}`);
      }
    }
    sizing = 'cap'; sbWhich = 'changes'; sbViewOn = 'list';
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

/* A headline is cut at a comma or a bracket of words; a mark inside a game
   name is part of the name, in whatever language it is shown. The findings
   are the real builders', naming the game's own German for its flowers and a
   dress whose name holds commas. */
test('a finding is never cut inside a game name, in German as in English', async t => {
  const {page, errors} = await site(t);
  await boardOn(page);
  const heads = () => page.evaluate(cuts => localiseNames({names: dataEn().names, cuts}).cuts
    .map(a => splitFinding(a).what), FIX.cuts);
  const english = await heads();
  assert.deepEqual(english.slice(0, 3), [
    'Flower (Cheap) sells 1,000 on a Saturday against a 200 top-up',
    'Clothing (Classic Cheap Female) sells 1,000 on a Saturday against a 200 top-up',
    'Flower (Expensive) sells 1,000 on a Saturday against a 200 top-up']);
  await page.evaluate(async () => { await setGameNames('de'); });
  const [cheap, dress, dear, target] = await heads();
  assert.ok(cheap.startsWith('Blume (günstig)'), cheap);
  assert.ok(dear.startsWith('Blume (teuer)'), dear);
  assert.ok(dress.startsWith('Kleidung (klassisch, günstig, Damen)'), dress);
  // One name with commas before "top-up target of" is not a list of names.
  assert.ok(target.startsWith('Kleidung (klassisch, günstig, Damen) top-up target'), target);
  assert.deepEqual(errors, []);
});

/* The wiki names what it shows in the language picked, by the key beside each
   name: staff skills, the recipe's inputs, output and workstation, and the
   types a product is also sold by. */
test('a wiki guide names its skills, recipes and sellers in the language picked', async t => {
  const {page, errors} = await site(t);
  const wiki = JSON.parse(fs.readFileSync(path.join(WEB, 'wiki-data.json'), 'utf8'));
  const g = wiki.guides['businesstypes-florist'];
  const recipe = Object.values(g.RECIPES)[0];
  const product = Object.values(g.PRODUCTS).find(p => (p.alsoSoldByKeys || []).length);
  await page.evaluate(async () => { await setGameNames('de'); BigCopilotBoard.browseWiki(); location.hash = '#wiki/businesstypes-florist'; });
  await page.locator('#pageWiki h1').filter({hasText: FIX.de['ba:businesstype_florist']}).waitFor();
  const text = await page.locator('#pageWiki').textContent();
  const tips = await page.$$eval('#pageWiki [data-tip]', els => els.map(e => e.dataset.tip).join('\n'));
  // The help's own page, quoted below the guide, stays English prose; the
  // guide's staff tile and its checklist name the skill in German.
  const staff = await page.$$eval('#pageWiki .wk-tiles .kpi, #pageWiki .wk-item strong',
    els => els.map(e => e.textContent).join(' | '));
  assert.ok(staff.includes('Kundendienst'), staff);
  assert.ok(!/Customer Service/i.test(staff), staff);
  assert.ok(tips.includes('Kundendienst and'), 'the staff tile tip');
  for(const key of [recipe.inputs[0].slug, recipe.out.slug, `ba:factoryworkstationtype_${recipe.workstationKey}`,
    ...product.alsoSoldByKeys])
    assert.ok(text.includes(FIX.de[key]), `${key}: ${FIX.de[key]}`);
  assert.deepEqual(errors, []);
});

/* A factory line standing still names what it waits for: the line's missing
   inputs, and each input's waitingOn, with their keys beside them. */
test('a stalled line names the inputs it waits for in the language picked', async t => {
  const {page} = await site(t);
  await boardOn(page);
  await page.evaluate(async () => { await setGameNames('de'); });
  const said = await page.evaluate(({line, needs}) => {
    const L = localiseNames({names: dataEn().names, line, needs});
    return {missing: L.line.missing, says: L.needs.map(r => szSays({st: 'stalled', why: 'waiting'}, r, 'Depot'))};
  }, FIX.stalled);
  assert.deepEqual(said.missing, [FIX.de['ba:itemname_water'], FIX.de['ba:itemname_sugar']]);
  assert.ok(said.says[0].endsWith(`for want of ${FIX.de['ba:itemname_sugar']}`), said.says[0]);
  assert.ok(said.says[1].endsWith(`for want of ${FIX.de['ba:itemname_water']}`), said.says[1]);
});

/* The help's own article links a page by its game name: shown in the language
   picked, and linked as before. */
test('a link in the help that names its page reads in the language picked', async t => {
  const {page} = await site(t);
  await page.evaluate(async () => { await setGameNames('de'); BigCopilotBoard.browseWiki(); location.hash = '#wiki/businesstypes-florist'; });
  await page.locator('#pageWiki h1').filter({hasText: FIX.de['ba:businesstype_florist']}).waitFor();
  const links = await page.$$eval('#pageWiki .wk-read a.wk-link, #pageWiki .wk-read .wk-link', els => els.map(e => e.textContent));
  assert.ok(links.includes('Blume (günstig)'), links.join(' | '));
  assert.ok(links.includes('Kundendienst'), links.join(' | '));
  // A tip names the recipe's machines in the language picked too.
  const tips = await page.$$eval('#pageWiki [data-tip]', els => els.map(e => e.dataset.tip).join('\n'));
  assert.ok(tips.includes(FIX.de['ba:itemname_hydroponicplanter']), 'the production machine in the tip');
  // A variant bracket with no space before it still ends the kind's name.
  assert.equal(await page.evaluate(() => wikiFixKind({name: '의류 랙(사선형)', src: ''})), '의류 랙');
});

test('a requirement stated on the fixture page names the fixture in the language picked', async t => {
  const {page} = await site(t);
  await page.evaluate(async () => { await setGameNames('de'); BigCopilotBoard.browseWiki(); location.hash = '#wiki/businesstypes-eventplanningagency'; });
  await page.locator('#pageWiki h1').filter({hasText: FIX.de['ba:businesstype_eventplanningagency']}).waitFor();
  const tips = await page.$$eval('#pageWiki [data-tip]', els => els.map(e => e.dataset.tip)
    .filter(t => /requires this on its own help page/.test(t)));
  assert.ok(tips.length, 'the guide has a requirement stated on a fixture page');
  assert.ok(tips.every(t => / \(DE\) requires this/.test(t)), tips.join(' | '));
});

/* What a fixture consumes, stated on the fixture's own page: the row and its
   tip name both the fixture and what it needs in the language picked. */
test('a fixture that needs stock names both in the language picked', async t => {
  const {page} = await site(t);
  await page.evaluate(async () => { await setGameNames('de'); BigCopilotBoard.browseWiki(); location.hash = '#wiki/businesstypes-giftshop'; });
  await page.locator('#pageWiki h1').filter({hasText: 'Geschenkeladen'}).waitFor();
  const register = FIX.de['ba:itemname_cashregister'];
  const tips = await page.$$eval('#pageWiki [data-tip]', els => els.map(e => e.dataset.tip));
  assert.ok(tips.some(t => t.startsWith(`${register} requires Papiertüte, according to its help page.`)), tips.join(' | '));
  const rows = await page.$$eval('#pageWiki .wk-item strong', els => els.map(e => e.textContent));
  assert.ok(rows.includes('Papiertüte'), rows.join(' | '));
});

test('the board search lists a wiki page under its name as shown, and finds it by the English', async t => {
  const {page} = await site(t);
  await boardOn(page);
  // The wiki's catalogue loads with its first visit.
  await page.evaluate(() => showPage('wiki'));
  await page.waitForFunction(() => typeof wikiData !== 'undefined' && wikiData && wikiData.search);
  await page.evaluate(async () => { await setGameNames('de'); });
  const wiki = q => page.evaluate(q => (ssSearch(q, ssBuild()).find(g => g.g === 'wiki') || {hits: []})
    .hits.map(h => [h.e.id, h.e.t]), q);
  const page_ = 'wiki:businesstypes-giftshop';
  assert.deepEqual((await wiki('geschenkeladen')).find(([id]) => id === page_), [page_, 'Geschenkeladen']);
  assert.ok((await wiki('gift shop')).some(([id]) => id === page_));
});

test('a wiki category lists its pages in the order of the names shown', async t => {
  const {page} = await site(t);
  const listed = async () => {
    await page.evaluate(() => { location.hash = '#wiki/c/common_business_types'; });
    await page.waitForTimeout(150);
    return page.$$eval('#pageWiki .wk-hit .wk-what', els => els.map(e => e.textContent));
  };
  await page.evaluate(() => BigCopilotBoard.browseWiki());
  await page.evaluate(() => { wikiShowAll = true; });
  await page.evaluate(async () => { await setGameNames('de'); });
  const german = await listed();
  assert.ok(german.includes('Lagerhaus'), german.join(', '));
  const sorted = await page.evaluate(names => names.slice().sort(gnCompare), german);
  assert.deepEqual(german, sorted);
  await page.evaluate(async () => { await setGameNames('en'); });
  const english = await listed();
  assert.deepEqual(english, await page.evaluate(names => names.slice().sort(gnCompare), english));
  assert.ok(english.indexOf('Warehouse') > english.indexOf('Gift Shop'));
});

test('a chain says what it is made of in English words, whatever the names are shown in', async t => {
  const {page} = await site(t);
  await boardOn(page);
  await page.evaluate(async () => { await setGameNames('de'); });
  const said = await page.evaluate(() => D.chains.map(c => xlMembers(c)));
  assert.ok(said.some(s => /\b1 warehouse\b/.test(s)), said.join(' | '));
  assert.ok(!said.some(s => /lagerhaus/i.test(s)), said.join(' | '));
});
