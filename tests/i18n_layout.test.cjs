// The pseudo-locale sweep: every string of Big Copilot's own text, 40% longer,
// accented and in brackets, on the real page, at six widths, over every page,
// view and site panel. docs/architecture.md, "UI text".
//
// The table is built from the English catalogue (tools/i18n.py extract) and
// served as web/i18n/de.json, so it reaches the board through the same
// ?ui=de switch, loader and ttPayload() a real German table does. It fails on
// - page-level horizontal scroll, and a button, chip, segment, table header or
//   tile label wider than its box, that the pseudo text causes (each view is
//   measured in English first, so a pre-existing overflow is not blamed on it);
// - visible text outside brackets in an area marked converted: English that
//   bypassed tt() or msg(). Names, numbers and the save's own words are
//   ignored. CONVERTED is empty until the first area's pull request adds it.
// The fixture board is tests/game_names_fixture.py's synthetic company, wired
// as extract() wires it. Install Playwright and its Chromium browser to run;
// NODE_PATH may point at an existing installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const WIDTHS = [360, 768, 1280, 1500, 1501, 1920];
/* Converted areas: key prefix -> the selector of the markup that area owns.
   A conversion pull request adds its row; from then on English left on
   screen there fails the sweep. */
const CONVERTED = {
  /* The masthead's own lines: its live dot's word is community.js's. */
  nav: '#nav, #companyNav, #supplyNav, #growthNav, #clock > b, #clock > small:not(.fv-diffline), #clock .flag, '
    + '#clock .fv-diff, #ssField, .ss-ask, #ssAskMini',
  foot: '.sitefoot',
  /* A finding's headline and its detail, on Today and in the site panel. */
  f: '.find .what, .find .more, .sp-find .what, .sp-find .more',
  /* The map's own controls and the finder's; the card's facts and fit line
     carry names and layout codes, so only its numbers' labels and its link. */
  map: '#cityMapPage .map-head .layers, #cityMapPage .fswitch, #cityMapPage .filters .lab, #cityMapPage .fchip.cat, '
    + '#cityMapPage .fchip.show, #cityMapPage .fchip.num, #cityMapPage .fnew, #cityMapPage .fhead, #cityMapPage .places .empty, '
    + '#cityMapPage .site .nums, #cityMapPage .site .go2',
};
const MEASURED = 'button, .chip, .seg a, th, .tile .lab';

/* The pseudo text: accents on the letters, 40% longer, in brackets; the
   placeholders and game-name tokens untouched, so the page fills them. */
const ACCENT = {a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Å', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', c: 'ç', n: 'ñ', s: 'š', y: 'ý'};
function pseudo(en){
  const parts = String(en).split(/(\{[^{}]+\}|⟦[^⟧]*⟧)/);
  const text = parts.map((p, i) => i % 2 ? p : p.replace(/[A-Za-z]/g, ch => ACCENT[ch] || ch)).join('');
  const letters = String(en).replace(/\{[^{}]+\}/g, '').length;
  return `[${text}${'·'.repeat(Math.ceil(letters * 0.4))}]`;
}

let browser, TABLE, PAYLOAD;
before(async () => {
  const cat = spawnSync(process.env.PYTHON || 'python', [path.join('tools', 'i18n.py'), 'extract'],
    {cwd: ROOT, maxBuffer: 16 * 1024 * 1024});
  assert.equal(cat.status, 0, cat.stderr.toString());
  const english = JSON.parse(cat.stdout.toString('utf8'));
  TABLE = Object.fromEntries(Object.entries(english).map(([k, v]) => [k, pseudo(v)]));
  const fix = spawnSync(process.env.PYTHON || 'python', ['-c', `
import json, sys
from ba_dashboard import _wire_msgs
from tests.game_names_fixture import fixture
sys.stdout.buffer.write(json.dumps(_wire_msgs(fixture()["payload"]), ensure_ascii=False).encode("utf-8"))`],
  {cwd: ROOT, maxBuffer: 64 * 1024 * 1024});
  assert.equal(fix.status, 0, fix.stderr.toString());
  PAYLOAD = JSON.parse(fix.stdout.toString('utf8'));
  ({chromium} = require('playwright'));
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

/* web/index.html served from web/, the pseudo table standing in for German. */
async function site(t, {ui = '', width = 1280, payload = PAYLOAD} = {}){
  const context = await browser.newContext({viewport: {width, height: 900}, locale: 'en-US', reducedMotion: 'reduce'});
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [], fetched = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if(url.hostname !== 'i18n.test') return route.abort();
    const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    if(name.startsWith('/i18n/')) fetched.push(url.pathname + url.search);
    if(name === '/i18n/de.json') return route.fulfill({contentType: 'application/json', body: JSON.stringify(TABLE)});
    const file = path.join(WEB, name);
    if(!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({path: file});
  });
  await page.goto(`http://i18n.test/${ui ? `?ui=${ui}` : ''}`);
  if(ui) await page.waitForFunction(() => ttLang === 'de');
  await page.evaluate(raw => { document.body.classList.add('has-board'); takeData(raw); boot(); }, payload);
  return {page, errors, fetched};
}

test('?ui=de reaches the board: Python\'s messages in the table, and their English still read', async t => {
  const {page, errors, fetched} = await site(t, {ui: 'de'});
  const stamp = await page.evaluate(() => window.LEDGER_BUILD);
  assert.ok(stamp);
  assert.deepEqual(fetched, [`/i18n/de.json?v=${stamp}`]);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'de');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('tt-wait')), false);
  const staff = await page.evaluate(() => {
    const row = D.alerts.find(a => a.group === 'staff');
    return [row.text, enOf(row, 'text'), dataEn().alerts.find(a => a.group === 'staff').text];
  });
  assert.deepEqual(staff, [TABLE['f.staff.none'], 'No staff assigned', 'No staff assigned']);
  assert.ok((await page.locator('#alertSection').innerText()).includes('[Nó štáff áššígñéd'));
  // The board code that reads Python's words reads them through enOf(), so a
  // translated row keeps its amount and its cap chip.
  const read = await page.evaluate(() => {
    const wire = {text: ['f.staff.none', {}], limit: ['f.staff.none', {}]};
    const row = ttPayload({group: 'order', text: 'Coffee is 1,500 short of its week', i18n: wire});
    const cap = ttPayload({limit: 'the building', i18n: wire});
    return [row.text !== enOf(row, 'text'), findingAmount(row), cap.limit !== 'the building', spLimitShow(cap, {})];
  });
  assert.deepEqual(read, [true, '1,500<small>units short</small>', true, 'door']);
  // Numbers follow the UI language, on the board and in tt(); back in English, en-US again.
  assert.deepEqual(await page.evaluate(() => [NUM_LOCALE, fmt(1234.4), tt('f.x', '{n:,}', {n: 1234})]),
    ['de-DE', '$1.234', '1.234']);
  assert.deepEqual(await page.evaluate(() => { ttSetTable('en', null);
    return [NUM_LOCALE, fmt(1234.4), document.documentElement.lang, D.alerts.find(a => a.group === 'staff').text]; }),
    ['en-US', '$1,234', 'en', 'No staff assigned']);
  assert.deepEqual(errors, []);
});

test('a cap chip keys on the English limit, whatever language its words are in', async t => {
  const payload = JSON.parse(JSON.stringify(PAYLOAD));
  const findings = payload.hourFindings.filter(f => f.limit);
  assert.ok(findings.length, 'the fixture has capped hours');
  findings.forEach(f => { f.i18n = {...(f.i18n || {}), limit: ['f.staff.none', {}]}; });
  const chips = async ui => {
    const {page, errors} = await site(t, {ui, payload});
    const got = await page.evaluate(key => {
      openSite(key, false);
      const chips = [...document.querySelectorAll('#sitePanel .sp-hchip.cap')].map(e =>
        [e.dataset.limit, e.dataset.show, e.classList.contains('sp-bcap'), e.querySelectorAll('svg').length]);
      // The ceiling strip lights the door, counter or person each limit names.
      const ceiling = [...document.querySelectorAll('#sitePanel .sp-ceil > span')].map(e => e.className);
      return {chips, ceiling};
    }, findings[0].key);
    assert.deepEqual(errors, []);
    return got;
  };
  const en = await chips(''), de = await chips('de');
  assert.ok(en.chips.length);
  assert.ok(en.ceiling.some(c => c.split(" ").includes("on")), `the fixture lights part of the ceiling: ${JSON.stringify(en.ceiling)}`);
  assert.deepEqual(de, en);
});

test('with no ?ui the page asks for no table and shows the English', async t => {
  const {page, errors, fetched} = await site(t);
  assert.deepEqual(fetched, []);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.equal(await page.evaluate(() => D.alerts.find(a => a.group === 'staff').text), 'No staff assigned');
  assert.equal(await page.evaluate(() => NUM_LOCALE), 'en-US');
  assert.match(await page.locator('#alertSection').innerText(), /No staff assigned/);
  assert.deepEqual(errors, []);
});

/* Every page, every view, and one site panel of each business. */
async function views(page){
  return page.evaluate(() => {
    const out = [];
    PAGES.forEach(p => {
      if(SUBS[p.id]) SUBS[p.id].items.forEach(([id]) => out.push([p.id, id, null]));
      else out.push([p.id, null, null]);
    });
    (D.businesses || []).forEach(b => out.push(['company', 'results', b.key]));
    // The map with the finder on, its first result's card open.
    if(D.premises) out.push(['map', 'finder', null]);
    return out;
  });
}
async function show(page, [pageId, sub, site]){
  await page.evaluate(async ([pageId, sub, site]) => {
    showPage(pageId, false);
    /* The map draws once its geometry has loaded. */
    if(pageId === 'map' && typeof cityMapPage !== 'undefined' && cityMapPage){
      await cityMapPage.ready;
      if(sub === 'finder'){
        openFinder({});
        await cityMapPage.ready;
        const first = document.querySelector('#cityMapPage .place.fr');
        if(first) await cityMapPage.select(first.dataset.pick, false);
      }
    } else if(sub) showSub(pageId, sub);
    if(site) openSite(site, false);
  }, [pageId, sub, site]);
  await page.waitForTimeout(50);
}
/* What overflows on screen, and the visible English in converted areas. */
async function measure(page){
  return page.evaluate(([sel, converted]) => {
    const root = document.documentElement;
    const shown = el => el.offsetParent !== null || el.getClientRects().length > 0;
    /* A New badge hangs off its control's edge on purpose (the search icon's
       does), so its words are left out of what an overflow is known by. */
    const own = el => [...el.querySelectorAll('.feature-new')].reduce((s, b) => s.replace(b.textContent, ''), el.textContent);
    const over = [...document.querySelectorAll(sel)]
      .filter(el => shown(el) && el.scrollWidth > el.clientWidth + 1)
      .map(el => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}: ${own(el).trim().slice(0, 40)}`);
    const english = [];
    for(const [area, where] of Object.entries(converted)){
      document.querySelectorAll(where).forEach(host => {
        const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        for(let n = walk.nextNode(); n; n = walk.nextNode()){
          if(!n.parentElement || !shown(n.parentElement)) continue;
          /* A name (Big Copilot, YouTube, the studio) is marked translate="no". */
          if(n.parentElement.closest('[translate="no"]')) continue;
          /* A finding's sentence is cut into headline and detail, so its
             brackets can open in one text node and close in the next; and a
             message nests others (a list, a weekday, a finding's detail),
             so brackets nest. Matched pairs go innermost first; what is left
             before a lone "]" opened earlier, and after a lone "[" closes later. */
          let outside = n.textContent;
          for(let was = ''; was !== outside;){ was = outside; outside = outside.replace(/\[[^\[\]]*\]/g, ''); }
          outside = outside.replace(/^[^]*\]/, '').replace(/\[[^]*$/, '').replace(/[\d\s.,:;$%+\-–—×·/()!?%'"‹›…#]+/g, '');
          if(outside.length > 1) english.push(`${area}: ${n.textContent.trim().slice(0, 60)}`);
        }
      });
    }
    return {scroll: root.scrollWidth > root.clientWidth + 1, over, english};
  }, [MEASURED, CONVERTED]);
}

test('the pseudo-locale fits at every width, on every page, view and site panel', async t => {
  for(const width of WIDTHS){
    const en = await site(t, {width});
    const xx = await site(t, {ui: 'de', width});
    for(const view of await views(xx.page)){
      await show(en.page, view);
      await show(xx.page, view);
      const before = await measure(en.page), now = await measure(xx.page);
      const where = `${width}px ${view.filter(Boolean).join(' › ')}`;
      assert.ok(!now.scroll || before.scroll, `${where}: the page scrolls sideways`);
      const fresh = now.over.filter(o => o.includes('[') && !before.over.includes(o));
      assert.deepEqual(fresh, [], `${where}: text wider than its box`);
      assert.deepEqual(now.english, [], `${where}: English in a converted area`);
    }
    assert.deepEqual(xx.errors, [], `${width}px`);
  }
});
