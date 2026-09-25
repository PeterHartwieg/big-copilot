// Exercise the generated site and its real app lifecycle with no save/runtime.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..', 'web');
let browser;
before(async () => { browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL}); });
after(async () => { await browser?.close(); });

/* The page the browser is given is the generated one with the wiki's own two
   files swapped for the ones in the tree, so a change to web/wiki.js or
   web/wiki.css is exercised here before the build that will carry it. The
   generated file is never written to; only the copy served to this browser. */
function currentPage() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const swap = (text, head, tail, replacement) => {
    for (const end of [tail.replace(/\n/g, '\r\n'), tail]) {
      const a = text.indexOf(head);
      const b = a < 0 ? -1 : text.indexOf(end, a);
      if (a >= 0 && b > 0) return text.slice(0, a) + replacement + text.slice(b + end.length);
    }
    throw new Error('the generated page no longer embeds the wiki the way this test splices it');
  };
  let out = swap(html, '.wiki{margin-top:28px}', '#nav a .feature-new{display:none!important}\n}',
    fs.readFileSync(path.join(root, 'wiki.css'), 'utf8').trim());
  return swap(out, "/* The Wiki page: the game's own help", 'ready: () => wikiStatus === "ready",\n};',
    fs.readFileSync(path.join(root, 'wiki.js'), 'utf8').trim());
}

async function fixture(t, {hash='', width=1280, theme='dark', motion='reduce', changeData, holdData} = {}) {
  const context = await browser.newContext({viewport:{width,height:900}, colorScheme:theme, reducedMotion:motion});
  t.after(() => context.close());
  await context.addInitScript(() => {
    // The Wiki never requests analysis. Keep unrelated Python startup offline.
    window.Worker = class { postMessage() {} terminate() {} };
    window.showDirectoryPicker = undefined;
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if(holdData && url.pathname === '/wiki-data.json') await holdData;
    if(url.hostname !== 'wiki.test') return route.abort();
    if(url.pathname.startsWith('/api/')) return route.fulfill({contentType:'application/json',body:JSON.stringify({features:[],online:0})});
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const target = path.resolve(root, name);
    if(!target.startsWith(root + path.sep) || !fs.existsSync(target)) return route.abort();
    if(name === 'index.html') return route.fulfill({contentType:'text/html',body:currentPage()});
    if(name === 'wiki-data.json' && changeData) {
      const data = JSON.parse(fs.readFileSync(target, 'utf8'));
      changeData(data);
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    }
    return route.fulfill({path:target});
  });
  await page.goto('http://wiki.test/' + hash);
  return {page, errors};
}

async function openFromLanding(page) {
  await page.getByRole('button', {name:'Browse the wiki',exact:true}).click();
  await page.getByRole('searchbox', {name:'Search the wiki'}).waitFor();
}

test('the landing Wiki entry is visible with and without reduced motion', async t => {
  for(const motion of ['reduce','no-preference']) {
    const {page, errors} = await fixture(t, {motion});
    await page.waitForFunction(() => {
      const entry = document.querySelector('.lg-wiki');
      return entry && Number(getComputedStyle(entry).opacity) > .99;
    });
    await openFromLanding(page);
    assert.deepEqual(errors, []);
  }
});

test('a cold Wiki article link and reload work without a save', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop'});
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  assert.equal(await page.locator('#landing').count(), 0);
  assert.equal(await page.locator('#nav a[data-id]').count(), 6);
  await page.reload();
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  assert.match(page.url(), /#wiki\/businesstypes-giftshop$/);
  assert.deepEqual(errors, []);
});

test('a link into Prices in your save lands on that section, and only once', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop/prices'});
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  // The shelves' "Compare with market prices" lands here: the section's head
  // at the top of the window, under the sticky masthead, not the guide's top.
  await page.waitForFunction(() => {
    const el = document.getElementById('wk-prices');
    return el && scrollY > 0 && Math.abs(el.getBoundingClientRect().top) < 260;
  });
  assert.match(await page.locator('#wk-prices h2').innerText(), /Prices in your save/);
  assert.match(page.url(), /#wiki\/businesstypes-giftshop\/prices$/);
  // A redraw afterwards leaves the reader where they have scrolled to.
  await page.evaluate(() => { scrollTo(0, 0); drawWiki(); });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => scrollY), 0);
  assert.deepEqual(errors, []);
});

test('the same section link followed again, after leaving the Wiki, lands again', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop/prices'});
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  const landed = () => page.waitForFunction(() => {
    const el = document.getElementById('wk-prices');
    return el && scrollY > 0 && Math.abs(el.getBoundingClientRect().top) < 260;
  });
  await landed();
  // Off to another page, then the shelves' link again: the route is the one
  // the Wiki still holds, and it has to land all the same.
  await page.evaluate(() => { showPage('today'); scrollTo(0, 0); });
  assert.equal(await page.evaluate(() => [page, scrollY].join(' ')), 'today 0');
  await page.evaluate(() => { location.hash = '#wiki/businesstypes-giftshop/prices'; });
  await page.waitForFunction(() => page === 'wiki');
  await landed();
  // A redraw while the Wiki is up still leaves the reader where they are.
  await page.evaluate(() => { scrollTo(0, 0); drawWiki(); wikiVisit(); });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => scrollY), 0);
  assert.deepEqual(errors, []);
});

/* Back and Forward follow the one rule too: coming into the Wiki, or onto
   another route inside it, lands on the route's section. */
const landedOnPrices = page => page.waitForFunction(() => {
  const el = document.getElementById('wk-prices');
  return el && scrollY > 0 && Math.abs(el.getBoundingClientRect().top) < 260;
});

// A landing scrolls for a few frames while the sections above it paint;
// the reader's own scroll waits for that, or the landing would undo it. The
// landing (settleScroll()) stops once its target holds still for a frame, so
// the end state is a scroll position and a page height unchanged for three
// frames in a row.
const settled = page => page.evaluate(() => { window.wikiSettle = null; }).then(() => page.waitForFunction(() => {
  const now = `${scrollY} ${document.documentElement.scrollHeight}`, mark = window.wikiSettle;
  window.wikiSettle = {now, frames: mark && mark.now === now ? mark.frames + 1 : 0};
  return window.wikiSettle.frames >= 3;
}, null, {polling: 'raf'}));

test('Back and Forward onto a prices entry land on Prices, and a plain guide starts at its top', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop'});
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  await page.evaluate(() => { location.hash = '#wiki/businesstypes-giftshop/prices'; });
  await landedOnPrices(page);
  // Each step below starts from the top, so the browser's own restoration of
  // the entry's scroll position cannot pass for a landing.
  await settled(page);
  await page.evaluate(() => { scrollTo(0, 0); showPage('today'); });
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => page === 'wiki');
  await landedOnPrices(page);
  assert.match(page.url(), /#wiki\/businesstypes-giftshop\/prices$/);
  // Another guide, then Back: another route, so it lands on Prices again.
  await settled(page);
  await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => { location.hash = '#wiki/businesstypes-bookstore'; });
  await page.getByRole('heading', {name:'Bookstore',exact:true,level:1}).waitFor();
  await page.evaluate(() => history.back());
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  await landedOnPrices(page);
  // Forward to the other guide, which names no section: its top.
  await page.evaluate(() => history.forward());
  await page.getByRole('heading', {name:'Bookstore',exact:true,level:1}).waitFor();
  // From the Prices landing (scrolled down) to the guide's top.
  await page.waitForFunction(() => scrollY === 0);
  await settled(page);
  assert.equal(await page.evaluate(() => scrollY), 0);
  // Back to Prices, Back again to the plain guide entry, then Forward: Prices.
  await page.evaluate(() => history.back());
  await landedOnPrices(page);
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => location.hash === '#wiki/businesstypes-giftshop');
  await settled(page);
  await page.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => history.forward());
  await page.waitForFunction(() => location.hash === '#wiki/businesstypes-giftshop/prices');
  await landedOnPrices(page);
  // A redraw of the route on screen does not land again.
  await settled(page);
  await page.evaluate(() => { scrollTo(0, 0); drawWiki(); wikiVisit(); });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => scrollY), 0);
  assert.deepEqual(errors, []);
});

test('a guide with no section, come back to from another page, starts at its top each time', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop'});
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  for (let visit = 0; visit < 2; visit++) {
    // A long Today, read well down, and then the same guide again.
    await page.evaluate(() => {
      showPage('today');
      document.getElementById('pageToday').style.minHeight = '5000px';
      scrollTo(0, 1500);
    });
    assert.equal(await page.evaluate(() => scrollY), 1500);
    await page.evaluate(() => { location.hash = '#wiki/businesstypes-giftshop'; });
    await page.waitForFunction(() => page === 'wiki');
    // From 1500 down Today to the guide's top, and staying there.
    await page.waitForFunction(() => scrollY === 0);
    await settled(page);
    assert.equal(await page.evaluate(() => scrollY), 0, `visit ${visit + 1}`);
  }
  assert.deepEqual(errors, []);
});

test('a landing still waiting for the catalogue is dropped when the reader moves on', async t => {
  let release;
  const holdData = new Promise(r => { release = r; });
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop/prices', holdData});
  // Before the catalogue is in, the reader follows a link to another guide.
  await page.waitForFunction(() => page === 'wiki');
  await page.evaluate(() => { location.hash = '#wiki/businesstypes-bookstore'; });
  await page.waitForFunction(() => location.hash === '#wiki/businesstypes-bookstore');
  release();
  await page.getByRole('heading', {name:'Bookstore',exact:true,level:1}).waitFor();
  await settled(page);
  // Its own top, not the Prices section the first link asked for.
  assert.equal(await page.evaluate(() => scrollY), 0);
  assert.deepEqual(errors, []);
});

test('Back to the same guide with no section drops a landing still waiting for the catalogue', async t => {
  let release;
  const holdData = new Promise(r => { release = r; });
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop', holdData});
  await page.waitForFunction(() => page === 'wiki');
  // The prices link, then Back to the guide itself, all before the catalogue is in.
  await page.evaluate(() => { location.hash = '#wiki/businesstypes-giftshop/prices'; });
  // The Wiki has taken the route and holds the landing, waiting for the data.
  await page.waitForFunction(() => wikiRoute.section === 'prices' && wikiLanding === 'prices');
  assert.equal(await page.evaluate(() => wikiStatus), 'loading');
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => location.hash === '#wiki/businesstypes-giftshop' && wikiRoute.section === '');
  // Back on the sectionless route, the waiting landing is gone before the data is in.
  assert.equal(await page.evaluate(() => wikiLanding), '');
  release();
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  await settled(page);
  assert.equal(await page.evaluate(() => scrollY), 0);
  assert.deepEqual(errors, []);
});

test('a page without the section a link names starts at its top, not where the last page was', async t => {
  // The same help page before and after, so only entering the Wiki moves the scroll.
  const {page, errors} = await fixture(t, {hash:'#wiki/general-energy'});
  await page.getByRole('heading', {name:'Energy',exact:true,level:1}).waitFor();
  // A long Today read well down, and a Wiki tall enough to keep that scroll.
  await page.evaluate(() => {
    document.getElementById('pageWiki').style.minHeight = '6000px';
    showPage('today');
    document.getElementById('pageToday').style.minHeight = '5000px';
    scrollTo(0, 1500);
  });
  assert.equal(await page.evaluate(() => scrollY), 1500);
  // A help page has no Prices in your save.
  await page.evaluate(() => { location.hash = '#wiki/general-energy/prices'; });
  await page.getByRole('heading', {name:'Energy',exact:true,level:1}).waitFor();
  await settled(page);
  assert.equal(await page.locator('#wk-prices').count(), 0);
  assert.equal(await page.evaluate(() => scrollY), 0);
  assert.deepEqual(errors, []);
});

test('search keeps focus when cleared and preserves mid-query edits', async t => {
  const {page, errors} = await fixture(t);
  await openFromLanding(page);
  const search = page.getByRole('searchbox', {name:'Search the wiki'});
  await search.fill('gift');
  await search.press('Home');
  await search.press('ArrowRight');
  await search.press('x');
  assert.equal(await search.inputValue(), 'gxift');
  assert.equal(await search.evaluate(el => el.selectionStart), 2);
  await search.fill('');
  assert.equal(await search.evaluate(el => document.activeElement === el), true);
  await search.press('u');
  assert.equal(await search.inputValue(), 'u');
  assert.deepEqual(errors, []);
});

/* The node in the graph's own product lane, never the chooser chip above it
   that carries the same name once a range is too wide to draw at once. */
function graphNode(page, name) {
  return page.locator('#wikiGraph').getByRole('button', {name, exact:true});
}
/* How many wires that node really has, read from the graph the page drew. */
async function wires(page, name) {
  return page.evaluate(label => {
    const graph = document.getElementById('wikiGraph');
    const node = [...graph.querySelectorAll('.wk-node')]
      .find(n => n.querySelector('span').textContent === label);
    const edges = JSON.parse(graph.dataset.edges || '[]');
    return edges.filter(e => e[0] === node.dataset.node || e[1] === node.dataset.node).length;
  }, name);
}

test('a selected graph survives resizing and parks its ball after clearing', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop', motion:'no-preference'});
  const product = graphNode(page, 'Gift (Cheap)');
  await product.waitFor();
  const lines = await wires(page, 'Gift (Cheap)');
  assert.ok(lines > 1, 'the product really is wired to shelves and supply');
  await product.click();
  await page.waitForFunction(n => document.querySelectorAll('#wikiGraph path.lit').length === n, lines);
  await page.setViewportSize({width:1100,height:900});
  await page.waitForFunction(n => document.querySelectorAll('#wikiGraph path.lit').length === n, lines);
  assert.equal(await product.getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', {name:'Let go of the picked node',exact:true}).click();
  assert.equal(await product.getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#wikiGraph .wk-ball').isVisible(), true);
  assert.deepEqual(errors, []);
});

test('supplier pin opens its real address and Escape restores focus', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop'});
  const pin = page.getByRole('button', {name:'Show 13 Fifth Avenue on map',exact:true});
  await pin.click();
  const dialog = page.getByRole('dialog', {name:'Location map',exact:true});
  await dialog.waitFor();
  assert.match(await dialog.innerText(), /13 Fifth Avenue/);
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), false);
  assert.equal(await pin.evaluate(el => document.activeElement === el), true);
  assert.deepEqual(errors, []);
});

test('phone layouts fit in dark and light, with a single row of nav icons', async t => {
  for(const width of [320,390]) for(const theme of ['dark','light']) {
    const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop',width,theme});
    await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
    const geometry = await page.evaluate(() => ({
      overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth,
      rows:[...document.querySelectorAll('#nav a[data-id]')].map(el=>Math.round(el.getBoundingClientRect().top)),
    }));
    assert.equal(geometry.overflow, false, `${width}px ${theme} overflow`);
    assert.equal(new Set(geometry.rows).size, 1, `${width}px ${theme} nav wraps`);
    await graphNode(page, 'Gift (Cheap)').click();
    assert.equal(await page.locator('#wikiGraph .wk-wires path').count(), 0);
    assert.equal(await graphNode(page, 'Gift (Cheap)').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(errors, []);
    await page.close();
  }
});

/* A guide for a business the shipped payload does not carry one for yet, built
   out of the records it does carry so every address, fixture and recipe on it
   is real. The extraction will supply the real ones; this is the shape. */
function addGuides(data) {
  const s = data.sample;
  const product = (key, over) => ({...s.PRODUCTS[key], ...over});
  data.guides = {
    'businesstypes-florist': {
      ...s,
      PRODUCTS: {
        cheapgift: product('cheapgift', {rank:'primary'}),
        umbrella: product('umbrella', {rank:'additional'}),
        delivery: {name:'Delivery Fee', rank:'additional', kind:'fee', automatic:true, pageId:null,
          alsoSoldBy:[], fixtures:[], wholesale:null, importers:[], recipes:[],
          requirementsRaw:['A van, bought at [Gift Shops](businesstypes-giftshop)',
            'An employee with the Customer Service skill']},
      },
      BUSINESS: {...s.BUSINESS, slug:'businesstypes-florist', name:'Florist',
        nameSrc:'ba:businesstype_florist', primary:['cheapgift'], secondary:['umbrella','delivery'],
        extras:[], lede:'A florist sells what it arranges.', notes:[]},
    },
    'businesstypes-supermarket': {
      ...s,
      PRODUCTS: Object.fromEntries([1,2,3,4,5,6,7,8].map(n =>
        [`row${n}`, product('cheapgift', {name:`Aisle ${n}`, rank:'primary', recipes:[], recipe:null})])),
      BUSINESS: {...s.BUSINESS, slug:'businesstypes-supermarket', name:'Supermarket',
        nameSrc:'ba:businesstype_supermarket', primary:[1,2,3,4,5,6,7,8].map(n => `row${n}`),
        secondary:[], extras:[], lede:null, notes:[]},
    },
  };
}

test('a guide draws its services and its side range as cards of the same make', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-florist', changeData:addGuides});
  await page.getByRole('heading', {name:'Florist',exact:true,level:1}).waitFor();
  const seen = await page.locator('#wikiRoot h2').allTextContents();
  assert.deepEqual(seen, ['To open', 'Sells', 'Services', 'Also sells', 'Fits together',
    'Make it', 'Also make', 'Where to go', 'Yours', 'Prices in your save', 'Source']);
  assert.equal(await page.locator('.wk-card').count(), 3, 'a card each for both ranges and the fee');
  // The square is the control, and the row it belongs to answers to it.
  const square = page.locator('.wk-item .wk-tick').first();
  await square.click();
  assert.equal(await square.getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('.wk-item.done').count(), 1);
  await square.click();
  assert.equal(await page.locator('.wk-item.done').count(), 0);
  const service = page.locator('.wk-card.svc');
  assert.match(await service.innerText(), /Delivery Fee[\s\S]*Automatic[\s\S]*A van/);
  // A service's dependency keeps the help's own link, and it goes somewhere.
  await service.getByRole('link', {name:'Gift Shops',exact:true}).click();
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  assert.deepEqual(errors, []);
});

test('a wide range is chosen one product at a time, and the cards keep them all', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-supermarket', changeData:addGuides,
    motion:'no-preference'});
  await page.getByRole('heading', {name:'Supermarket',exact:true,level:1}).waitFor();
  assert.equal(await page.locator('.wk-card').count(), 8);
  assert.equal(await page.locator('#wikiGraph .wk-lane').first().locator('.wk-node').count(), 1);
  const third = page.locator('.wk-tab', {hasText:'Aisle 3'});
  await third.click();
  assert.equal(await third.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#wikiGraph [data-node="p:row3"]').count(), 1);
  assert.equal(await page.locator('#wikiGraph [data-node="p:row1"]').count(), 0);
  // The lanes are still a picture: the wires are drawn for the product held.
  await page.waitForFunction(() => document.querySelectorAll('#wikiGraph path').length > 0);
  assert.deepEqual(errors, []);
});

/* The same synthetic guides, with a real page below the graph: one recipe flow
   per product, which is what a phone has to scroll past when the chooser redraws
   the guide. This is the shape the mobile jump was found on. */
function addTallGuides(data) {
  addGuides(data);
  const s = data.sample;
  const guide = data.guides['businesstypes-supermarket'];
  const base = s.RECIPES[s.PRODUCTS.cheapgift.recipe];
  guide.RECIPES = {...s.RECIPES};
  Object.values(guide.PRODUCTS).forEach((product, i) => {
    guide.RECIPES[`make${i}`] = {...base, name: `Recipe for ${product.name}`, pageId: null,
      out: {...base.out, item: product.name}};
    product.recipes = [`make${i}`];
    product.recipe = `make${i}`;
  });
}
/* A guide with more equipment than the opening list shows, so there is a tail
   to expand: the office and the larger shops all carry one. */
function addLongEquipment(data) {
  addGuides(data);
  const s = data.sample;
  const guide = data.guides['businesstypes-florist'];
  const spare = s.FIXTURES.storageshelf;
  guide.FIXTURES = {...s.FIXTURES};
  for (let i = 1; i <= 8; i++) guide.FIXTURES[`crate${i}`] = {...spare, name: `Storage Crate ${i}`};
}
/* Where a thing sits on the screen, and how far down the page the reader is. */
function placed(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return {top: box.top, bottom: box.bottom, view: innerHeight, down: window.scrollY};
  }, selector);
}
/* What the keyboard is on, in terms a failure message can be read from. */
function holding(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return {tag: 'NONE'};
    const box = el.getBoundingClientRect();
    return {tag: el.tagName, focus: el.dataset ? el.dataset.focus : undefined,
      tick: el.dataset ? el.dataset.tick : undefined, label: el.getAttribute('aria-label'),
      href: el.getAttribute('href'), inNav: !!el.closest('#nav'),
      inKit: !!el.closest('.wk-group'), top: box.top, view: innerHeight};
  });
}

test('choosing another product on a phone keeps the chooser, the graph and the focus', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-supermarket', width:390,
    changeData:addTallGuides});
  await page.getByRole('heading', {name:'Supermarket',exact:true,level:1}).waitFor();
  // The reader is at the graph, with a page of recipes below it.
  await page.locator('.wk-picker').scrollIntoViewIfNeeded();
  for (const [from, to] of [['Aisle 1','Aisle 3'], ['Aisle 3','Aisle 6']]) {
    const key = `row${to.split(' ')[1]}`;
    const chosen = page.locator('.wk-tab', {hasText:to});
    assert.equal(await page.locator('.wk-tab.on').evaluate(el => el.textContent), from);
    const before = await placed(page, '.wk-picker');
    await chosen.focus();
    await page.keyboard.press('Enter');
    await page.locator(`#wikiGraph [data-node="p:${key}"]`).waitFor();
    // The control the reader pressed is still the control the reader is on.
    const now = await holding(page);
    assert.equal(now.tag, 'BUTTON', `focus fell to ${now.tag} after choosing ${to}`);
    assert.equal(now.inNav, false, 'and not back at the top of the navigation');
    assert.equal(now.focus, key, JSON.stringify(now));
    assert.equal(await chosen.getAttribute('aria-pressed'), 'true');
    // The chooser has not moved under them, and the graph it redrew is in view.
    const after = await placed(page, '.wk-picker');
    assert.ok(Math.abs(after.top - before.top) <= 2,
      `the chooser moved ${Math.round(after.top - before.top)}px on the screen`);
    const graph = await placed(page, '#wikiGraph');
    assert.ok(graph.top < graph.view && graph.bottom > 0,
      `the graph is off the screen: ${JSON.stringify(graph)}`);
  }
  assert.deepEqual(errors, []);
});

test('expanding the equipment on a phone hands the keyboard the first piece it revealed', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-florist', width:390,
    changeData:addLongEquipment});
  await page.getByRole('heading', {name:'Florist',exact:true,level:1}).waitFor();
  const more = page.locator('[data-wiki-fix]');
  await more.scrollIntoViewIfNeeded();
  const before = await placed(page, '[data-wiki-fix]');
  const hidden = await page.locator('.wk-item .wk-tick').count();
  await more.focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-wiki-more]').waitFor();
  assert.ok(await page.locator('.wk-item .wk-tick').count() > hidden, 'the tail really was revealed');
  // The control has gone, so the keyboard is on the first piece it uncovered.
  const now = await holding(page);
  assert.equal(now.tag, 'BUTTON', `focus fell to ${now.tag}`);
  assert.equal(now.inNav, false, 'and not back at the top of the navigation');
  assert.equal(now.inKit, true, 'and not somewhere else on the page');
  assert.equal(await page.locator('[data-wiki-more]').evaluate(el => document.activeElement === el), true);
  // It stands where the control stood, on the screen and in the tab order.
  assert.ok(Math.abs(now.top - before.top) <= 2,
    `the list jumped ${Math.round(now.top - before.top)}px on the screen`);
  assert.ok(now.top >= 0 && now.top < now.view, `the revealed piece is off the screen: ${now.top}`);
  await page.keyboard.press('Tab');
  const next = await holding(page);
  assert.equal(next.inNav, false, 'the next tab is not the top of the navigation');
  assert.equal(next.inKit, true, 'it is the next piece of equipment');
  assert.deepEqual(errors, []);
});

test('a guide fits the phone, services, side range and all', async t => {
  for(const width of [320,390]) for(const theme of ['dark','light']) {
    const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-florist',width,theme,changeData:addGuides});
    await page.getByRole('heading', {name:'Florist',exact:true,level:1}).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `${width}px ${theme} overflow`);
    assert.equal(await page.locator('.wk-card.svc').isVisible(), true);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

/* The catalogue this build ships, read from the file the page itself fetches:
   the shapes the game's own help really writes, in a real browser. It is built
   from an installed game, so a checkout without one skips these. */
const SHIPPED = path.join(root, 'wiki-data.json');
const shipped = fs.existsSync(SHIPPED) ? JSON.parse(fs.readFileSync(SHIPPED, 'utf8')) : null;
const guided = shipped && shipped.guides ? Object.entries(shipped.guides)
  .map(([id, guide]) => [id, (guide.BUSINESS || {}).name]).filter(pair => pair[1]) : [];

test('the real source shapes read as lines, not as file markers', {skip: !guided.length}, async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-hairdresser'});
  await page.getByRole('heading', {name:'Hairdresser',exact:true,level:1}).waitFor();
  const open = page.locator('.wk-groups');
  const text = await open.innerText();
  // No bullet the help file wrote, no furniture among the stock, nothing twice.
  assert.doesNotMatch(text, /(^|\s)\*\s+\w/m, 'a source bullet marker in the checklist');
  const card = name => open.locator('.wk-group').filter({has:page.getByRole('heading',{name,exact:true,level:3})});
  assert.doesNotMatch(await card('Stock and consumables').innerText(), /Hairdresser Chair/);
  assert.match(await card('Equipment').innerText(), /Hairdresser Chair or Hairdresser Chair \(Modern\)/);
  assert.equal((await card('People').innerText()).match(/Hair Stylist/g).length, 1);
  // The service cards still carry every line the source gives them.
  const service = page.locator('.wk-card.svc').first();
  assert.equal(await service.locator('.wk-need').count(), 3);
  assert.doesNotMatch(await service.innerText(), /(^|\s)\*\s+\w/m);
  // The links in those lines are links, and they are not inside the checkbox.
  assert.equal(await page.locator('.wk-item .wk-tick a').count(), 0);
  assert.ok(await page.locator('.wk-item a.wk-link').count() > 0);
  assert.deepEqual(errors, []);
});

/* The office guides this build really ships: the workstation's own page asks
   for a desk, a chair and a computer, and each of those is a requirement with
   its own alternatives rather than a suggestion behind a control. */
test('an office shows what its workstation needs, on a phone and at a desk',
  {skip: !guided.some(([id]) => id === 'businesstypes-lawfirm')}, async t => {
    for(const width of [320, 1280]) {
      const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-lawfirm', width});
      await page.getByRole('heading', {name:'Law Firm',exact:true,level:1}).waitFor();
      const kit = page.locator('.wk-group').filter({
        has:page.getByRole('heading', {name:'Equipment', exact:true, level:3})});
      const text = (await kit.evaluate(el => el.textContent)).replace(/\s+/g, ' ');
      assert.match(text, /Equipment and service requirements/, `${width}px: no caption for them`);
      // A computer is on the opening list, not behind "Show all".
      assert.match(text, /Computer.*(Laptop|ZanaMan Computer)/, `${width}px: ${text}`);
      assert.equal(await kit.locator('[data-wiki-fix]').count(), 0, 'nothing of the workstation is hidden');
      // Each of the three is a filled square, and none of them a suggestion.
      assert.equal(await kit.locator('.wk-item.req [data-tick*=":fix-need-"]').count(), 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false,
        `${width}px pushes the page sideways`);
      assert.deepEqual(errors, []);
      await page.close();
    }
  });

test('every guide this build ships draws a page of its own', {skip: !guided.length}, async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki'});
  await page.getByRole('searchbox', {name:'Search the wiki'}).waitFor();
  const trouble = [];
  for(const [id, name] of guided) {
    await page.evaluate(hash => { location.hash = hash; }, `#wiki/${id}`);
    // The page that was asked for, not whichever one was on screen before it.
    await page.getByRole('heading', {name, exact:true, level:1}).waitFor();
    /* The whole page, not only the part above the fold: the board leaves its
       sections to the browser's own content-visibility, so a section further
       down has laid out but has no innerText until it is reached. */
    const text = await page.locator('#wikiRoot').evaluate(el => el.textContent.replace(/\s+/g, ' '));
    if(/(^|\s)\*\s+\w/m.test(text)) trouble.push([id, 'source bullet marker']);
    if(/\bundefined\b|\bNaN\b/.test(text)) trouble.push([id, 'a value that is not a value']);
    if(/\b1 (gaps|wholesalers|vendors|recipes)\b/.test(text)) trouble.push([id, 'one of a thing, counted as many']);
    if(/help_[a-z_:]+_content|ba:[a-z]+_[a-z0-9]+/.test(text)) trouble.push([id, 'a source key in the reading']);
    if(!/To open/.test(text)) trouble.push([id, 'no setup']);
  }
  assert.deepEqual(trouble, []);
  assert.deepEqual(errors, []);
});

/* Where the help counts two kinds of goods on one shelf, the pill carries both
   labelled rows. It has to fold inside its card: a number cut off at the card's
   edge is a number the reader cannot check, and the largest of the two is never
   picked in its place. */
async function spill(page) {
  return page.evaluate(() => {
    const over = [];
    for(const card of document.querySelectorAll('.wk-card')) {
      const box = card.getBoundingClientRect();
      for(const pill of card.querySelectorAll('.wk-pill')) {
        const r = pill.getBoundingClientRect();
        if(r.right > box.right - 1 || r.left < box.left - 1 || pill.scrollWidth > pill.clientWidth + 1)
          over.push(pill.textContent.replace(/\s+/g, ' ').trim().slice(0, 60));
      }
    }
    return {over, sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth};
  });
}

test('a pill with two labelled capacities folds inside its card at every width', {skip: !guided.length},
  async t => {
    // The longest capacity text this build carries, and the one the audit found.
    for(const [id, width] of [['businesstypes-bookstore',1440], ['businesstypes-bookstore',390],
      ['businesstypes-bookstore',320], ['businesstypes-giftshop',1440], ['businesstypes-giftshop',320]]) {
      const {page, errors} = await fixture(t, {hash:`#wiki/${id}`, width});
      await page.locator('#wikiRoot h1').waitFor();
      await page.evaluate(() => document.querySelectorAll('section').forEach(s => s.classList.add('measured')));
      const {over, sideways} = await spill(page);
      assert.deepEqual(over, [], `${id} at ${width}px`);
      assert.equal(sideways, false, `${id} at ${width}px pushes the page sideways`);
      // And both rows really are there to read, not one of them dropped.
      if(id === 'businesstypes-bookstore') {
        const card = page.locator('.wk-card').filter({hasText:'Picture Book & Youth Novel'}).first();
        const text = await card.evaluate(el => el.textContent.replace(/\s+/g, ' '));
        assert.match(text, /Picture Book & Youth Novel 270 · Novel, Technical Manual, Motivational Book, Limited Edition Book 180/);
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  });

test('a capacity longer than any the payload carries still folds inside its card', async t => {
  const rows = [
    {label:'Picture Book, Youth Novel, Annual and Almanac', value:270, unit:'units'},
    {label:'Novel, Technical Manual, Motivational Book, Limited Edition Book', value:180, unit:'units'},
    {label:'Everything else the shelf will take, counted together', value:90, unit:'units'},
  ];
  for(const width of [320, 1440]) {
    const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop', width, changeData:data=>{
      const guide = (data.guides || {})['businesstypes-giftshop'] || data.sample;
      const product = guide.PRODUCTS.cheapgift;
      const key = product.fixtures[0];
      guide.FIXTURES[key].capacity = rows;
      // Nothing settles which row is this product's, so the card shows them all.
      if(product.fixtureCapacities) delete product.fixtureCapacities[key];
    }});
    await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
    await page.evaluate(() => document.querySelectorAll('section').forEach(s => s.classList.add('measured')));
    const {over, sideways} = await spill(page);
    assert.deepEqual(over, [], `${width}px`);
    assert.equal(sideways, false, `${width}px pushes the page sideways`);
    const card = page.locator('.wk-card').filter({has:page.getByRole('heading',{name:'Gift (Cheap)',exact:true})});
    const text = await card.evaluate(el => el.textContent.replace(/\s+/g, ' '));
    for(const row of rows) assert.match(text, new RegExp(`${row.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ${row.value}`));
    assert.doesNotMatch(text, /Rounded Shelf270|Rounded Shelf<b>270/, 'and no single number stands for the lot');
    assert.deepEqual(errors, []);
    await page.close();
  }
});

/* What the page does with a figure the help does not give. The guide is the
   record the route actually reads, so that is the one the test unsettles. */
test('unknown recipe output and wholesale availability stay unknown', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop',changeData:data=>{
    const guide = (data.guides || {})['businesstypes-giftshop'] || data.sample;
    guide.PRODUCTS.cheapgift.wholesale = null;
    const recipe = guide.RECIPES[(guide.PRODUCTS.cheapgift.recipes || [])[0]
      || guide.PRODUCTS.cheapgift.recipe];
    recipe.out.per = null;
  }});
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  const card = page.locator('.wk-card').filter({has:page.getByRole('heading',{name:'Gift (Cheap)',exact:true})});
  assert.match(await card.innerText(), /Wholesale not stated/, 'unknown is said, not guessed');
  assert.doesNotMatch(await card.innerText(), /No wholesaler|cannot/i);
  assert.doesNotMatch(await page.locator('#wikiRoot').innerText(), /\b0\/(?:h|day)\b/);
  assert.deepEqual(errors, []);
});

/* A build whose payload carries only the one worked example still draws it. */
test('save pricing is readable at desktop and phone widths and clears with the save', async t => {
  for(const width of [320, 1280]) {
    const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop', width});
    await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
    await page.evaluate(() => {
      D = {meta:{day:190}, businesses:[{name:'My Gifts', typeSlug:'ba:businesstype_giftshop',
        neighbourhood:'ba:neighborhood_midtown', lines:[{slug:'ba:itemname_cheapgift', configuredPrice:30.27}]}],
        market:{rows:[{slug:'ba:itemname_cheapgift', cells:[{hood:'ba:neighborhood_midtown',marketPrice:25.63}]}]}};
      drawWiki();
    });
    require('./_payload_contract.cjs').assertPayloadShape(await page.evaluate(() => D), 'wiki-browser');
    const section = page.locator('section').filter({has:page.getByRole('heading',{name:'Prices in your save',exact:true})});
    await section.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.wk-prices'))
      .some(el => el.innerText.includes('My Gifts: $30.27')));
    if(process.env.WIKI_PRICING_QA_DIR) await section.screenshot({path:path.join(process.env.WIKI_PRICING_QA_DIR, `pricing-${width}.png`)});
    assert.match(await section.innerText(), /My Gifts: \$30\.27/);
    assert.match(await section.innerText(), /\$25\.63/);
    assert.match(await section.innerText(), /Not set/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    const marketCell = section.locator('tbody tr').first().locator('td').last();
    assert.equal(await marketCell.evaluate(el => el.getBoundingClientRect().right <= innerWidth), true);
    const disclosure = section.locator('details').first();
    await disclosure.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await disclosure.getAttribute('open'), null);
    await page.keyboard.press('Enter');
    assert.notEqual(await disclosure.getAttribute('open'), null);
    await page.evaluate(() => { D = null; drawWiki(); });
    await page.waitForFunction(() => document.querySelector('#wikiRoot').innerText.includes('Open a save to see your configured prices'));
    assert.match(await section.innerText(), /Open a save/);
    assert.doesNotMatch(await section.innerText(), /\$\d/);
    assert.deepEqual(errors, []);
  }
});

test('a payload with no guides falls back to the sample it does carry', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop',changeData:data=>{
    delete data.guides;
    data.sample.PRODUCTS.cheapgift.wholesale = null;
  }});
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  await page.getByRole('heading', {name:'To open',exact:true,level:2}).waitFor();
  const card = page.locator('.wk-card').filter({has:page.getByRole('heading',{name:'Gift (Cheap)',exact:true})});
  assert.match(await card.innerText(), /Wholesale not stated/);
  assert.deepEqual(errors, []);
});

/* A live refresh (a new save, every 30 s while watching) draws the same guide
   again: what the reader opened, closed and focused stays as it was. */
test('a live refresh keeps the open sections and the focus', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop'});
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  await page.evaluate(() => {
    D = {meta:{day:190}, businesses:[{name:'My Gifts', typeSlug:'ba:businesstype_giftshop',
      neighbourhood:'ba:neighborhood_midtown', lines:[{slug:'ba:itemname_cheapgift', configuredPrice:30.27}]}],
      market:{rows:[{slug:'ba:itemname_cheapgift', cells:[{hood:'ba:neighborhood_midtown',marketPrice:25.63},
        {hood:'ba:neighborhood_hellskitchen',marketPrice:24.10}]}]}};
    drawWiki();
  });
  const prices = page.locator('details.wk-prices');
  assert.equal(await prices.count(), 2);
  await prices.nth(0).locator('summary').click();   // closes the one open by default
  await prices.nth(1).locator('summary').click();   // opens the second
  await prices.nth(1).locator('summary').focus();
  const state = () => page.evaluate(() => ({
    open: Array.from(document.querySelectorAll('details.wk-prices')).map(d => d.open),
    focus: document.activeElement?.textContent.trim()}));
  const before = await state();
  assert.deepEqual(before.open, [false, true]);
  await page.evaluate(() => { D = {...D, meta:{day:191}}; wikiVisit(); });
  assert.deepEqual(await state(), before);
  assert.match(await page.locator('#wikiRoot').innerText(), /save day 191/);
  assert.deepEqual(errors, []);
});
