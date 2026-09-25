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
  land: '#welcomeLede, #drop, #entryRow, .lg-wiki, #saveLocation, #srcSlot, #help',
  app: '#srcStrip, #srcNote, #srcMenu, #live em',
  upd: '#releaseBanner, #newsStrip',
  comm: '.community-dialog',
};
/* Text that is not Big Copilot's own words even inside a converted area:
   paths and file names in code, the save's own words (the strip's file line,
   the save menu's character names, the trigger that names the character, and
   an entry's detail, which ends in a date), the changelog entry the update
   banner opens to, and the feature list the community API sends. The save
   menu's entries themselves are checked: the shell fixture's saves are all
   autosaves, whose titles are ours ("Autosave 3"). */
const UNTRANSLATED = 'code, #srcMeta, #releaseDetails, .save-current, .save-group-label, .save-option-meta, .community-card h3, .community-card p';
const MEASURED = 'button, .chip, .seg a, th, .tile .lab';

/* The pseudo text: accents on the letters, 40% longer, in brackets; the
   placeholders and game-name tokens untouched, so the page fills them. The
   few tags a sentence may hold (<b>, <code>, <a>) stay tags, and each run of
   text between them gets its own brackets, as each is its own text node. */
const ACCENT = {a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Å', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', c: 'ç', n: 'ñ', s: 'š', y: 'ý'};
const TAG = /(<\/?(?:b|code|a)>)/;
function pseudo(en){
  const runs = String(en).split(TAG);
  const last = runs.length - 1;
  return runs.map((run, r) => {
    if(r % 2) return run;
    if(!run && r !== last) return run;
    const parts = run.split(/(\{[^{}]+\}|⟦[^⟧]*⟧)/);
    const text = parts.map((p, i) => i % 2 ? p : p.replace(/[A-Za-z]/g, ch => ACCENT[ch] || ch)).join('');
    const letters = (r === last ? runs.filter((x, i) => i % 2 === 0).join('') : run).replace(/\{[^{}]+\}/g, '').length;
    return `[${text}${r === last ? '·'.repeat(Math.ceil(letters * 0.4)) : ''}]`;
  }).join('');
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
    return out;
  });
}
async function show(page, [pageId, sub, site]){
  await page.evaluate(([pageId, sub, site]) => {
    showPage(pageId, false);
    if(sub) showSub(pageId, sub);
    if(site) openSite(site, false);
  }, [pageId, sub, site]);
  await page.waitForTimeout(50);
}
/* What overflows on screen, and the visible English in converted areas. */
async function measure(page){
  return page.evaluate(([sel, converted, skip]) => {
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
          if(!n.parentElement || !shown(n.parentElement) || n.parentElement.closest(skip)) continue;
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
  }, [MEASURED, CONVERTED, UNTRANSLATED]);
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

/* The landing and the shell around the board, as a player reaches them:
   app.js with a stand-in for the reader, the folder handle and IndexedDB
   (so no Python runs), a newer version.json (so the update banner shows)
   and the community API. `remembered` starts from a folder chosen on an
   earlier visit, which the page reopens and builds the fixture board from. */
const LINK_HEALTH = {schemaVersion: 1, stamp: 's1', busy: false, company: 'Costy Co', character: 'alice',
  day: 12, hour: 9, minute: 5, refreshedAt: '2026-09-25T09:05:00Z', writes: []};
async function shell(t, {ui = '', width = 1280, remembered = false, permission = 'granted', held = false} = {}){
  const context = await browser.newContext({viewport: {width, height: 900}, locale: 'en-US', reducedMotion: 'reduce'});
  t.after(() => context.close());
  await context.addInitScript(({remembered, permission, held}) => {
    // `held`: the first read of a save waits for readSave(fail), which lets
    // it go on or fail it the way a file the game rewrote meanwhile does.
    let hold = held ? new Promise(resolve => { window.readSave = resolve; }) : null;
    const file = (name, time) => {
      const value = new File(['save'], name, {lastModified: time});
      value.arrayBuffer = async () => {
        if(hold){
          window.reading = true;
          const fail = await hold;
          hold = null;
          if(fail) throw new DOMException('The file changed', 'NotReadableError');
        }
        return new ArrayBuffer(8);
      };
      return {kind: 'file', name, getFile: async () => value};
    };
    const folder = (name, entries) => ({name, kind: 'directory',
      async queryPermission(){ return permission; }, async requestPermission(){ return 'granted'; },
      async *values(){ yield* entries; }});
    const meta = {kind: 'file', name: 'Recover #4.hsg.meta', getFile: async () => ({name: 'Recover #4.hsg.meta', lastModified: 1,
      async text(){ return JSON.stringify({characterData: {name: 'Alice'}, day: 4, isRecoverSave: true}); }})};
    const handle = folder('Saves', [folder('alice', [file('Recover #4.hsg', 1000), file('Recover #3.hsg', 2000), meta]),
      folder('bob', [file('Recover #1.hsg', 500)])]);
    window.showDirectoryPicker = async () => handle;
    const db = {close(){}, transaction(){
      return {objectStore: () => ({get(){
        const req = {};
        setTimeout(() => { req.result = remembered ? handle : null; req.onsuccess?.(); });
        return req;
      }, put(){}})};
    }};
    window.indexedDB.open = () => { const req = {}; setTimeout(() => { req.result = db; req.onsuccess?.(); }); return req; };
    window.Worker = class { constructor(){ window.reader = this; this.messages = []; } postMessage(m){ this.messages.push(m); } terminate(){} };
  }, {remembered, permission, held});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const json = (route, body) => route.fulfill({contentType: 'application/json', body: JSON.stringify(body)});
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    // The Big Copilot Link mod on its default port, for the linked strip.
    if(url.host === '127.0.0.1:8322' && url.pathname === '/health') return json(route, LINK_HEALTH);
    if(url.host === '127.0.0.1:8322' && url.pathname === '/save')
      return route.fulfill({body: 'save', headers: {'X-Game-Link-Stamp': LINK_HEALTH.stamp, 'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'X-Game-Link-Stamp'}});
    if(url.hostname !== 'i18n.test' || url.pathname.startsWith('/fonts/')) return route.abort();
    if(url.pathname === '/version.json')
      return json(route, {version: 'ffffffffff', latest: {pr: 1, date: '2999-01-01', title: 'A newer page', summary: 'What changed.'}});
    if(url.pathname === '/api/community/presence') return json(route, {count: 12, nextHeartbeatIn: 300});
    if(url.pathname === '/api/community/features') return json(route, {features: [
      {id: 'a', title: 'A feature', description: 'What it does.', votes: 1},
      {id: 'b', title: 'Another feature', description: 'What that does.', votes: 12, voted: true}]});
    if(url.pathname === '/i18n/de.json') return json(route, TABLE);
    const file = path.join(WEB, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if(!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({path: file});
  });
  await page.goto(`http://i18n.test/${ui ? `?ui=${ui}` : ''}`);
  if(ui) await page.waitForFunction(() => ttLang === 'de');
  await page.waitForFunction(() => !document.getElementById('releaseBanner').hidden);
  if(remembered && permission === 'granted' && !held){
    await page.waitForFunction(() => window.reader && window.reader.messages.length > 0);
    await page.evaluate(raw => {
      const m = window.reader.messages[0];
      window.reader.onmessage({data: {kind: 'built', id: m.id, history: '', data: JSON.stringify(raw)}});
    }, PAYLOAD);
    await page.waitForFunction(() => document.body.classList.contains('has-board'));
  }
  return {page, errors};
}

/* What a player sees of the landing and the shell, one view at a time. */
const SHELL_VIEWS = {
  landing: async page => { await page.evaluate(() => { document.getElementById('help').open = true; }); },
  menu: async page => {
    await page.evaluate(() => { document.getElementById('menuBtn').click(); document.getElementById('help').open = true; });
    await page.evaluate(() => document.querySelector('.save-trigger').click());
  },
  vote: async page => {
    await page.evaluate(() => document.querySelector('[data-community-open]').click());
    await page.waitForSelector('.community-vote');
  },
};

test('the pseudo-locale fits the landing and the shell at every width', async t => {
  for(const width of WIDTHS){
    for(const remembered of [false, true]){
      const en = await shell(t, {width, remembered});
      const xx = await shell(t, {ui: 'de', width, remembered});
      for(const [name, open] of Object.entries(SHELL_VIEWS)){
        if((name === 'landing') === remembered) continue;
        await open(en.page);
        await open(xx.page);
        const before = await measure(en.page), now = await measure(xx.page);
        const where = `${width}px ${name}`;
        assert.ok(!now.scroll || before.scroll, `${where}: the page scrolls sideways`);
        const fresh = now.over.filter(o => o.includes('[') && !before.over.includes(o));
        assert.deepEqual(fresh, [], `${where}: text wider than its box`);
        assert.deepEqual(now.english, [], `${where}: English in a converted area`);
      }
      assert.deepEqual(en.errors, [], `${width}px, English`);
      assert.deepEqual(xx.errors, [], `${width}px`);
    }
  }
});

test('a change of language rewrites the save menu that was built before it, and back', async t => {
  const {page, errors} = await shell(t, {remembered: true});
  await SHELL_VIEWS.menu(page);
  const menu = () => page.evaluate(() => ({
    titles: [...document.querySelectorAll('.save-option-title')].map(el => el.textContent),
    days: [...document.querySelectorAll('.save-option-meta')].map(el => el.textContent.split(' · ')[0]).filter(s => /\d/.test(s) && !/:/.test(s)),
    trigger: document.querySelector('.save-trigger').getAttribute('aria-label'),
  }));
  const english = await menu();
  assert.deepEqual(english.titles.slice(0, 2), ['Newest save anywhere', 'Newest for this character']);
  assert.ok(english.titles.includes('Autosave 4'), english.titles.join(' | '));
  assert.ok(english.days.includes('Day 4'), english.days.join(' | '));
  assert.match(english.trigger, /^Which save to read: /);
  await page.evaluate(table => ttSetTable('de', table), TABLE);
  const pseudo = await menu();
  assert.equal(pseudo.titles.length, english.titles.length);
  for(const title of pseudo.titles) assert.match(title, /^\[.*\]$/, `untranslated entry: ${title}`);
  assert.ok(pseudo.days.length && pseudo.days.every(d => /^\[.*\]$/.test(d)), pseudo.days.join(' | '));
  assert.match(pseudo.trigger, /^\[/);
  await page.evaluate(() => ttSetTable('en', null));
  assert.deepEqual(await menu(), english);
  assert.deepEqual(errors, []);
});

test('a change of language says the strip\'s headline and note again, and a param never becomes markup', async t => {
  const {page, errors} = await shell(t, {remembered: true});
  await page.evaluate(() => document.getElementById('forgetHistory').click());
  const strip = () => page.evaluate(() => [document.getElementById('srcStatus').textContent, document.getElementById('srcNote').textContent]);
  const english = await strip();
  assert.deepEqual(english, ['Up to date', 'History forgotten. The next save starts a fresh record.']);
  // The build number reaches a sentence with markup as a param.
  await page.evaluate(() => { document.getElementById('lgHelpAutosave').dataset.build = '<b>x</b><a>y</a><img src=x>&amp;'; });
  await page.evaluate(table => ttSetTable('de', table), TABLE);
  for(const text of await strip()) assert.match(text, /^\[.*\]$/, text);
  // The sentence has no tags of its own, so any element in it came from the param.
  const help = await page.evaluate(() => {
    const el = document.getElementById('lgHelpAutosave');
    return {tags: el.querySelectorAll('*').length, text: el.textContent};
  });
  assert.equal(help.tags, 0);
  assert.ok(help.text.includes('<b>x</b><a>y</a><img src=x>&amp;'), help.text);
  await page.evaluate(() => ttSetTable('en', null));
  assert.deepEqual(await strip(), english);
  assert.deepEqual(errors, []);
});

test('a change of language writes the strip\'s file line again, for a save and for the game link', async t => {
  const {page, errors} = await shell(t, {remembered: true});
  const meta = () => page.locator('#srcMeta').textContent();
  const folder = await meta();
  assert.match(folder, / · autosave from .* · built in \d+\.\d s · watching$/);
  await page.evaluate(table => ttSetTable('de', table), TABLE);
  const pseudo = await meta();
  assert.match(pseudo, /\[áútóšávé fróm .*\] · \[búílt íñ \d+,\d š·+\] · \[wátçhíñg·+\]$/, pseudo);
  await page.evaluate(() => ttSetTable('en', null));
  assert.equal(await meta(), folder);
  // Linked to the game: the line names the game's day and the link.
  await page.evaluate(() => document.getElementById('linkBtn').click());
  await page.waitForFunction(() => window.reader.messages.length > 1);
  await page.evaluate(raw => {
    const m = window.reader.messages.at(-1);
    window.reader.onmessage({data: {kind: 'built', id: m.id, history: '', data: JSON.stringify(raw)}});
  }, PAYLOAD);
  await page.waitForFunction(() => / · game link · /.test(document.getElementById('srcMeta').textContent));
  const linked = await meta();
  assert.match(linked, /^Costy Co · day 12, 09:05 · game link · built in /);
  await page.evaluate(table => ttSetTable('de', table), TABLE);
  assert.match(await meta(), /^Costy Co · \[dáý 12, 09:05·+\] · \[gámé líñk·+\] · \[búílt íñ /);
  await page.evaluate(() => ttSetTable('en', null));
  assert.equal(await meta(), linked);
  assert.deepEqual(errors, []);
});

/* A build that fails while another is asked for: the strip says why, in
   words, and the build asked for meanwhile still runs. The second request is
   the game's en.json, chosen while the first build is under way. */
const EN_JSON = {name: 'en.json', mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({'ba:neighborhood_global': 'Global', menu_options_others_language: 'Language'}))};
async function askAgain(page){
  await page.setInputFiles('#localePick', EN_JSON);
  await page.waitForFunction(() => !!localStorage.getItem('ledger_locale'));
}
const stripText = page => page.evaluate(() => [document.getElementById('srcStatus').textContent, document.getElementById('srcMeta').textContent]);
/* Everything the strip's headline says from now on: the failure is said and
   then replaced at once by the queued build's "Reading …". */
const listen = page => page.evaluate(() => {
  const el = document.getElementById('srcStatus');
  window.heard = [];
  new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(n => window.heard.push(n.textContent))))
    .observe(el, {childList: true});
});
const heard = page => page.evaluate(() => window.heard);

test('a save the game rewrote mid-read says so, and the build asked for meanwhile still runs', async t => {
  const {page, errors} = await shell(t, {remembered: true, held: true});
  await page.waitForFunction(() => window.reading);
  await askAgain(page);
  await listen(page);
  await page.evaluate(() => window.readSave(true));
  // The failed read never reached the reader; the one asked for meanwhile does.
  await page.waitForFunction(() => window.reader.messages.length === 1);
  assert.ok((await heard(page)).includes('Could not read the save: the game has rewritten this file since it was chosen'),
    (await heard(page)).join(' | '));
  assert.deepEqual(errors, []);
});

test('a reader that answers nonsense says so, and the build asked for meanwhile still runs', async t => {
  const {page, errors} = await shell(t, {remembered: true, permission: 'granted', held: true});
  await page.evaluate(() => window.readSave(false));
  await page.waitForFunction(() => window.reader && window.reader.messages.length === 1);
  await askAgain(page);
  await listen(page);
  await page.evaluate(() => { const m = window.reader.messages[0]; window.reader.onmessage({data: {kind: 'nonsense', id: m.id}}); });
  await page.waitForFunction(() => window.reader.messages.length === 2);
  assert.ok((await heard(page)).includes('Could not read the save: Invalid reader response'), (await heard(page)).join(' | '));
  // The queued build fails the same way, and stays on screen: in a new
  // language it is said again from the error's own words.
  await page.evaluate(() => { const m = window.reader.messages[1]; window.reader.onmessage({data: {kind: 'nonsense', id: m.id}}); });
  await page.waitForFunction(() => document.getElementById('srcStatus').textContent === 'Could not read the save: Invalid reader response');
  await page.evaluate(table => ttSetTable('de', table), TABLE);
  assert.match((await stripText(page))[0], /^\[.*\]: \[Íñválíd réádér réšpóñšé·+\]$/);
  assert.deepEqual(errors, []);
});

test('a folder named like a word of the page keeps its name in every language', async t => {
  // The remembered folder is named "Saves", which is also the save menu's
  // label (app.pick.list); waiting for a click, the strip names the folder.
  const {page, errors} = await shell(t, {remembered: true, permission: 'prompt'});
  const strip = () => page.evaluate(() => [document.getElementById('srcStatus').textContent, document.getElementById('srcMeta').textContent]);
  await page.waitForFunction(() => document.getElementById('srcMeta').textContent === 'Saves');
  assert.deepEqual(await strip(), ['Folder remembered', 'Saves']);
  await page.evaluate(table => ttSetTable('de', table), TABLE);
  const [head, folder] = await strip();
  assert.match(head, /^\[.*\]$/);
  assert.equal(folder, 'Saves');
  assert.deepEqual(errors, []);
});

test('the landing\'s sentences with markup are the markup\'s English when no table is loaded', async t => {
  const {page, errors} = await shell(t);
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const markup = await page.evaluate(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return ['lgHelpFolder', 'lgHelpFind', 'lgHelpAutosave', 'lgHelpLinked', 'localeOther']
      .map(id => [id, doc.getElementById(id).innerHTML, document.getElementById(id).innerHTML]);
  }, html);
  for(const [id, before, now] of markup) assert.equal(now, before, id);
  assert.deepEqual(errors, []);
});
