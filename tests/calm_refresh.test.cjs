// A live refresh shows the new numbers in place: when the save moves on and
// the source hands the board a new payload through changed(), nothing on the
// page fades, slides or drives in again. Entrances still play when the reader
// causes an arrival: a page not visited yet, a site opened. The board is the
// real page from render(), its payload the real extract() of the synthetic
// company in tests/es3_fixture.py, and its source a stub that only keeps the
// callbacks the board hands to watch(). Never a real save.
// Install Playwright and its Chromium browser to run; NODE_PATH may point at
// an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {en} = require('./_i18n.cjs');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const PYTHON = process.env.PYTHON || 'python';
const GIFTS = 'ba:street_secondavenue#10';
const DEPOT = 'ba:street_pier#9';
// The host page's source, as web/app.js hands one over: the board calls
// watch() once at start-up, and every delivery after that is changed(data).
const STUB = '<script>window.LEDGER_SOURCE = {label: "Live", data: async () => null, '
  + 'name: async () => null, watch(h){ window.calmWatch = h; }};</script>';

// The same company a day on, as the game would have moved it: more cash, a
// fourth hand at the second shop and a bigger import; and another company,
// the same save under another name. Both through the real extract().
const MOVED = `
import json, os, sys
sys.path.insert(0, 'tests')
import es3_fixture as f
def build(name, change):
    company = f.link_company()
    change(company)
    save = os.path.join(sys.argv[1], name + '.hsg')
    with open(save, 'wb') as fh: fh.write(f.encode(company))
    with open(os.path.join(sys.argv[1], name + '.json'), 'w', encoding='utf-8') as fh: json.dump(f.link_payload(save), fh)
def later(c):
    c['Day'], c['Money'] = 35, 25000.0
    c['importPartnerships'][0]['products'][0]['amount'] = 4600
    c['EmployeeInstances'].append({'id': 'DDDDemployeeDDDDDDDDDDDD', 'assignedAddress': f.address('ba:street_broadway', 2),
        'characterData': {'name': 'Di Park', 'skills': [{'name': 'ba:skill_customerservice', 'value': 50.0}]}})
build('later', later)
build('other', lambda c: c.update(SaveGameName='Other Co'))
`;

let browser, html, payload, later, other;
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calm-refresh-'));
  try {
    const save = path.join(dir, 'calm.hsg'), data = path.join(dir, 'payload.json');
    const made = spawnSync(PYTHON, [path.join(root, 'tests', 'es3_fixture.py'), save, data], {cwd: root});
    assert.equal(made.status, 0, made.stderr?.toString());
    payload = fs.readFileSync(data, 'utf8');
    const moved = spawnSync(PYTHON, ['-c', MOVED, dir], {cwd: root});
    assert.equal(moved.status, 0, moved.stderr?.toString());
    later = fs.readFileSync(path.join(dir, 'later.json'), 'utf8');
    other = fs.readFileSync(path.join(dir, 'other.json'), 'utf8');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  const page = spawnSync(PYTHON, ['-c',
    'from ba_dashboard import render; import sys; '
    + 'sys.stdout.buffer.write(render(None, live=True, before_script=sys.argv[1]).encode("utf-8"))', STUB],
  {cwd: root, maxBuffer: 16 * 1024 * 1024});
  assert.equal(page.status, 0, page.stderr?.toString());
  html = page.stdout.toString();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

// The board after its first delivery. The window is tall enough to hold a
// page whole, so every block on it arrives at once rather than on scroll.
async function board(t, {hash = "", saved = {}, shell = false, eager = false, instrument = false, data = payload} = {}) {
  const context = await browser.newContext({viewport: {width: 1280, height: 2400}});
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await context.route('https://**', route => route.abort());
  await context.route('https://calm.test/', route =>
    route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await context.addInitScript(saved => {
    for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, value);
  }, saved);
  await page.goto('https://calm.test/' + hash, {waitUntil: 'load'});
  await page.evaluate(({shell, eager, instrument}) => {
    if(shell) BigCopilotBoard.browseWiki();
    window.initialDraws = [];
    if(instrument) PAGE_DRAWS.forEach(row => {
      const draw = row[1];
      row[1] = () => { initialDraws.push(row[0]); return draw(); };
    });
    if(eager){ const draw = renderAll; renderAll = () => draw(false); }
  }, {shell, eager, instrument});
  await page.evaluate(() => { document.body.classList.add('has-board'); });
  await page.evaluate(p => {
    const start = performance.now();
    window.calmWatch.changed(JSON.parse(p));
    window.initialWorkMs = performance.now() - start;
  }, data);
  return page;
}
// What the source does when the save moves on: a fresh copy of the numbers.
const deliver = (page, data = payload) => page.evaluate(p => window.calmWatch.changed(JSON.parse(p)), data);

// Finite animations and transitions running on the page on screen, and the
// blocks on it that have not arrived. Loops (a ping, a belt) are not
// entrances; the masthead's Live dot is outside the page, and says "new" on
// purpose.
const MOTION = () => {
  const host = [...document.querySelectorAll('.page')].find(p => !p.hidden);
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    + [...el.classList].map(c => '.' + c).join('');
  const moving = document.getAnimations().filter(a => {
    const el = a.effect && a.effect.target;
    const t = a.effect.getComputedTiming();
    return el && host.contains(el) && el.getClientRects().length && isFinite(t.endTime)
      && a.playState !== 'finished';
  }).map(a => `${a.animationName || a.transitionProperty} on ${name(a.effect.target)}`);
  const waiting = [...host.querySelectorAll('.rv:not(.in)')].filter(el => el.getClientRects().length).map(name);
  return {moving, waiting};
};
// Read two frames on, when the browser has started whatever the step set off.
const motion = page => page.evaluate(async M => {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return new Function(`return (${M})()`)();
}, MOTION.toString());
// Every arrival on screen has played out.
async function settle(page) {
  await page.waitForFunction(`(m => !m.moving.length && !m.waiting.length)((${MOTION})())`,
    null, {polling: 100, timeout: 8000});
}
// A refresh through changed(), read straight after it and again two frames
// later, once the browser has given the element under the pointer its hover.
async function refresh(page, probe) {
  return page.evaluate(async ([p, probe, MOTION]) => {
    const measure = new Function(`return (${MOTION})()`);
    const old = document.querySelector(probe);
    window.calmWatch.changed(JSON.parse(p));
    const now = measure();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const later = measure();
    const fresh = document.querySelector(probe);
    return {now, later, rebuilt: !!old && !!fresh && old !== fresh};
  }, [payload, probe, MOTION.toString()]);
}
const still = {moving: [], waiting: []};

test('a refresh leaves Today, an open site and Supply standing as they were', async t => {
  const page = await board(t);
  assert.equal(await page.evaluate(() => page), 'today');
  await settle(page);
  const today = await refresh(page, '#alerts .find');
  assert.ok(today.rebuilt, 'the refresh rebuilt the findings');
  assert.deepEqual(today.now, still);
  assert.deepEqual(today.later, still);

  // A shop's own page, under the pointer: its head, tiles and blocks.
  await page.evaluate(key => openSite(key, false), GIFTS);
  await settle(page);
  const box = await page.locator('#sitePanel .sitehead').boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  const shop = await refresh(page, '#sitePanel .sitehead');
  assert.ok(shop.rebuilt, 'the refresh rebuilt the site panel');
  assert.equal(await page.evaluate(() => siteOpen && siteKey), GIFTS, 'the site stays open');
  assert.deepEqual(shop.now, still);
  assert.deepEqual(shop.later, still);

  // The depot's page too: its stock block is a panel of its own kind.
  await page.evaluate(key => openSite(key, false), DEPOT);
  await settle(page);
  const depot = await refresh(page, '#sitePanel .sitehead');
  assert.ok(depot.rebuilt);
  assert.deepEqual(depot.now, still);
  assert.deepEqual(depot.later, still);

  await page.evaluate(() => { showPage('supply'); showSub('supply', 'deliveries'); });
  await settle(page);
  const supply = await refresh(page, '#secDeliveries > *');
  assert.ok(supply.rebuilt, 'the refresh rebuilt Deliveries');
  assert.deepEqual(supply.now, still);
  assert.deepEqual(supply.later, still);
});

test('what a refresh redraws on a view out of sight is there on the way back', async t => {
  const page = await board(t);
  // Staff needs has been seen: its hiring page arrived.
  await page.evaluate(() => { showPage('staffing'); showSub('staffing', 'needs'); });
  await settle(page);
  assert.ok(await page.locator('#secStaff .hs-head').count() > 0, 'the hiring page is drawn');
  assert.equal(await page.locator('#secStaff .rv:not(.in)').count(), 0, 'everything on Staff has arrived');
  await page.evaluate(() => showPage('today'));
  await settle(page);
  await page.evaluate(() => { window.calmOld = document.querySelector('#secStaff .hs-head'); });
  await deliver(page);
  await page.evaluate(() => showPage('staffing'));
  assert.ok(await page.evaluate(() => window.calmOld !== document.querySelector('#secStaff .hs-head')),
    'the refresh rebuilt the hiring page'); 
  assert.deepEqual(await motion(page), still);
});

test('going somewhere new and opening a site still arrive', async t => {
  const page = await board(t);
  await settle(page);
  await deliver(page);
  // A page not visited yet: its sections slide in.
  await page.evaluate(() => { showPage('supply'); showSub('supply', 'imports'); });
  const supply = await motion(page);
  assert.ok(supply.moving.some(m => /^opacity on section#secImports\.sec\.rv\.sb-view\.in$/.test(m)), supply.moving.join('\n'));
  await settle(page);
  // A site opened: its head and blocks arrive, staggered.
  await page.evaluate(key => openSite(key, false), GIFTS);
  const shop = await motion(page);
  assert.ok(shop.moving.some(m => /^opacity on div\.sitehead\.rv\.in$/.test(m)), shop.moving.join('\n'));
  assert.ok(shop.moving.filter(m => /^opacity on /.test(m)).length > 2, shop.moving.join('\n'));
});

// --- a refresh draws the page on screen -------------------------------------

// The page on screen, as the reader sees it once it is painted (a section
// off screen has no text until then), and the same page after a full redraw
// of the numbers it now has: the two must read the same.
const onScreen = page => page.evaluate(async () => {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const host = [...document.querySelectorAll('.page')].find(p => !p.hidden);
  return `${host.id}\n${host.innerText}`;
});
async function asRedrawn(page) {
  const shown = await onScreen(page);
  await page.evaluate(() => renderAll());
  return [shown, await onScreen(page)];
}

test('a refresh on Today draws Today; every other page waits for its visit and opens on the new numbers', async t => {
  const page = await board(t);
  // Every view seen once, Staffing last on Staff needs and Supply on Shops.
  await page.evaluate(() => {
    for (const [p, v] of [['growth', 'market'], ['supply', 'imports'], ['supply', 'deliveries'], ['company', 'results'], ['staffing', 'needs']]) {
      showPage(p); showSub(p, v);
    }
  });
  await page.click('#nav a[data-id="overview"]');
  await settle(page);
  // Blocks of each page as they stand now, to tell a redraw from none.
  const mark = () => page.evaluate(() => {
    window.calmOld = {kpis: '#kpis > *', payroll: '#secStaff > *', portfolio: '#portfolio tbody',
      stock: '#secDeliveries > *', market: '#market > *'};
    for (const k in calmOld) calmOld[k] = document.querySelector(calmOld[k]);
  });
  const standing = () => page.evaluate(() =>
    Object.fromEntries(Object.entries(calmOld).map(([k, el]) => [k, !!el && el.isConnected])));
  await mark();
  // The hiring page as drawn for the save before, marked to tell a redraw from none.
  const old = () => page.locator('#secStaff .hs-head[data-old]').count();
  await page.evaluate(() => { document.querySelector('#secStaff .hs-head').dataset.old = '1'; });

  // (a) The refresh redraws Today and leaves the other pages' markup alone.
  await deliver(page, later);
  assert.match(await page.locator('#kpis').innerText(), /25,000/, 'Today has the new cash');
  assert.deepEqual(await standing(), {kpis: false, payroll: true, portfolio: true, stock: true, market: true});
  assert.equal(await old(), 1, 'Staff waits for its visit');

  // (b) By the nav: Staffing opens on Staff needs, the view it was left on,
  // drawn for the new numbers.
  await page.click('#nav a[data-id="staffing"]');
  assert.equal(await old(), 0, 'drawn again for the new numbers');
  assert.deepEqual(await motion(page), still, 'a view seen before comes back already arrived');
  let [shown, redrawn] = await asRedrawn(page);
  assert.equal(shown, redrawn);
  await page.click('#nav a[data-id="overview"]');

  // By a section link on Today: the profit tile opens Company > Results.
  await mark();
  await deliver(page);
  assert.equal((await standing()).portfolio, true);
  await page.click('#kpis a[data-go="secDaily"]');
  assert.equal(await page.evaluate(() => viewOf(page)), 'company/results');
  assert.equal((await standing()).portfolio, false, 'the portfolio was drawn on the way in');
  [shown, redrawn] = await asRedrawn(page);
  assert.equal(shown, redrawn);

  // By Back: Supply was the page before Today.
  await page.click('#nav a[data-id="supply"]');
  await page.click('#nav a[data-id="overview"]');
  await mark();
  await deliver(page, later);
  assert.equal((await standing()).stock, true);
  await page.goBack();
  await page.waitForFunction(() => page === 'supply');
  assert.equal((await standing()).stock, false, 'the Shops tab was drawn on the way back');
  [shown, redrawn] = await asRedrawn(page);
  assert.equal(shown, redrawn);

  // A site opened from a finding on Today: its page, and the portfolio under it.
  await page.click('#nav a[data-id="overview"]');
  await mark();
  await deliver(page);
  await page.locator('#alerts .find a[href^="#site/"]').first().click();
  await page.waitForFunction(() => siteOpen);
  assert.equal((await standing()).portfolio, false);
  [shown, redrawn] = await asRedrawn(page);
  assert.equal(shown, redrawn);

  // And Today itself, after a refresh made on Supply.
  await page.click('#nav a[data-id="supply"]');
  await mark();
  await deliver(page, later);
  assert.equal((await standing()).kpis, true, 'Today waits for its visit too');
  await page.click('#nav a[data-id="overview"]');
  assert.match(await page.locator('#kpis').innerText(), /25,000/);
  [shown, redrawn] = await asRedrawn(page);
  assert.equal(shown, redrawn);

  // (c) Another company is drawn whole, at once.
  await mark();
  await deliver(page, other);
  assert.deepEqual(await standing(), {kpis: false, payroll: false, portfolio: false, stock: false, market: false});
});

test('a view drawn on its visit is wired once', async t => {
  const page = await board(t);
  await page.evaluate(() => { showPage('company'); showSub('company', 'results'); showPage('today'); });
  await deliver(page, later);
  // Drawn on the way in, after the boot and the refresh have each wired the board.
  await page.click('#nav a[data-id="businesses"]');
  const chain = page.locator('#portfolio tr.chain').first();
  await chain.click();
  assert.equal(await chain.evaluate(tr => tr.classList.contains('open')), true, 'one click opens the chain');
  await chain.click();
  assert.equal(await chain.evaluate(tr => tr.classList.contains('open')), false, 'and one closes it');
  // Today, drawn on its visit: a severity counter hides its findings, once.
  await deliver(page);
  await page.click('#nav a[data-id="overview"]');
  const sev = page.locator('#alertHead .sev[data-kind]').first();
  await sev.click();
  assert.equal(await sev.evaluate(s => s.classList.contains('off')), true);
  await sev.click();
  assert.equal(await sev.evaluate(s => s.classList.contains('off')), false);
});

test('a draw that throws on the way in leaves the view out of date, not the reader stuck', async t => {
  const page = await board(t);
  await page.evaluate(() => { showPage('staffing'); showSub('staffing', 'needs'); showPage('today'); });
  await deliver(page, later);
  const stale = () => page.evaluate(() => [...pageStale].some(row => /drawStaff/.test(String(row[1]))));
  assert.equal(await stale(), true, 'Staff waits for its visit');
  await page.evaluate(() => { const h = document.querySelector('#secStaff .hs-head'); if(h) h.dataset.old = '1'; });
  const old = () => page.locator('#secStaff .hs-head[data-old]').count();
  const messages = [];
  page.on('console', m => { if (m.type() === 'error') messages.push(m.text()); });
  await page.evaluate(() => {
    window.calmDraw = window.drawStaff;
    window.drawStaff = () => { throw new Error('payroll broke'); };
  });
  await page.click('#nav a[data-id="staffing"]');
  assert.equal(await page.evaluate(() => page), 'staffing', 'the nav click still opens Staffing');
  assert.equal(await page.locator('#pageStaffing').isHidden(), false);
  assert.equal(await page.locator('#pageToday').isHidden(), true);
  assert.equal(await stale(), true, 'the view is still out of date');
  assert.ok(messages.some(m => /payroll broke/.test(m)), messages.join('\n'));
  assert.equal(await old(), 1, 'the page still shows the save before');
  // The view shows the save before; the Live dot says so.
  assert.deepEqual(await liveDot(page), {stale: true, says: en("nav.stale.word"), why: 'payroll broke'});

  await page.evaluate(() => { window.drawStaff = window.calmDraw; });
  await page.click('#nav a[data-id="overview"]');
  await page.click('#nav a[data-id="staffing"]');
  assert.equal(await stale(), false);
  assert.equal(await old(), 0, 'drawn on the next visit');
  assert.deepEqual(await liveDot(page), {stale: false, says: '', why: ''});
});

// The masthead's Live dot: marked Stale or not, what it says, and why.
const liveDot = page => page.evaluate(() => {
  const dot = document.querySelector('#live');
  return {stale: dot.classList.contains('stale'), says: dot.querySelector('em').textContent,
          why: dot.title.replace(/^.*: /, '')};
});

test('one row that throws on a view does not keep the others from drawing, and its mark is its own', async t => {
  const page = await board(t);
  await page.evaluate(() => { showPage('company'); showSub('company', 'products'); });
  await deliver(page, later);
  const due = () => page.evaluate(() => [...pageStale].map(row => String(row[1]).match(/draw\w+/)[0])
    .filter(n => ['drawChart', 'drawPortfolio', 'drawSitePicker'].includes(n)).sort());
  assert.deepEqual(await due(), ['drawChart', 'drawPortfolio', 'drawSitePicker']);
  await page.evaluate(() => {
    window.calmDraw = window.drawPortfolio;
    window.drawPortfolio = () => { throw new Error('portfolio broke'); };
    window.calmPicked = 0;
    const picker = window.drawSitePicker;
    window.drawSitePicker = () => { window.calmPicked++; return picker(); };
    showSub('company', 'results');
  });
  assert.equal(await page.evaluate(() => calmPicked), 1, 'the site picker, due on the same view, is drawn');
  assert.deepEqual(await due(), ['drawPortfolio']);
  assert.deepEqual(await liveDot(page), {stale: true, says: en("nav.stale.word"), why: 'portfolio broke'});

  // A rebuild that fails meanwhile holds the dot on its own: the row drawing
  // at last does not clear it, the source's next good read does.
  await page.evaluate(() => {
    window.calmWatch.stale('rebuild broke');
    window.drawPortfolio = window.calmDraw;
    showSub('company', 'products');
    showSub('company', 'results');
  });
  assert.deepEqual(await due(), []);
  assert.deepEqual(await liveDot(page), {stale: true, says: en("nav.stale.word"), why: 'rebuild broke'});
  await page.evaluate(() => window.calmWatch.stale(''));
  assert.deepEqual(await liveDot(page), {stale: false, says: '', why: ''});

  // The next board clears a row's mark too; the row is tried again on its visit.
  await page.evaluate(() => {
    window.drawPortfolio = () => { throw new Error('portfolio broke'); };
    showSub('company', 'products');
  });
  await deliver(page);
  await page.evaluate(() => showSub('company', 'results'));
  assert.equal((await liveDot(page)).stale, true);
  await page.evaluate(() => { window.drawPortfolio = window.calmDraw; showSub('company', 'products'); });
  await deliver(page, later);
  assert.deepEqual(await liveDot(page), {stale: false, says: '', why: ''});
});

test('a row that throws while the board is drawn leaves the rest drawn, wired and marked Stale', async t => {
  const page = await board(t);
  const messages = [];
  page.on('console', m => { if (m.type() === 'error') messages.push(m.text()); });
  await page.evaluate(() => {
    window.calmDraw = window.drawAlerts;
    window.drawAlerts = () => { throw new Error('alerts broke'); };
    window.calmCalls = {payroll: 0, staffing: 0, wired: 0};
    const spy = (name, key) => { const f = window[name]; window[name] = (...a) => { calmCalls[key]++; return f(...a); }; };
    spy('drawStaff', 'payroll'); spy('drawOptimizeStaffing', 'staffing'); spy('wireAll', 'wired');
  });
  // Another company: every row is drawn, Today's findings first among them.
  await deliver(page, other);
  const calls = await page.evaluate(() => calmCalls);
  assert.equal(calls.payroll, 1, 'a page drawn after the row that threw');
  assert.equal(calls.staffing, 1, 'the last row');
  assert.ok(calls.wired >= 1, 'the board is wired');
  assert.equal(await page.evaluate(() => [...pageStale].some(row => /drawAlerts/.test(String(row[1])))), true,
    'the row that threw stays out of date');
  assert.ok(messages.some(m => /alerts broke/.test(m)), messages.join('\n'));
  assert.deepEqual(await liveDot(page), {stale: true, says: en("nav.stale.word"), why: 'alerts broke'});
  assert.match(await page.locator('footer').first().textContent(), /\S/, 'the footer is drawn');

  // Once it draws again, the next board clears the mark.
  await page.evaluate(() => { window.drawAlerts = window.calmDraw; });
  await deliver(page, later);
  assert.deepEqual(await liveDot(page), {stale: false, says: '', why: ''});
  assert.equal(await page.evaluate(() => [...pageStale].some(row => /drawAlerts/.test(String(row[1])))), false);
});

test('a row drawn on every page that threw is tried again on the next page opened', async t => {
  const page = await board(t);
  const messages = [];
  page.on('console', m => { if (m.type() === 'error') messages.push(m.text()); });
  await page.evaluate(() => {
    window.calmDraw = window.drawFindLocation;
    window.drawFindLocation = () => { throw new Error('finder line broke'); };
  });
  await deliver(page, later);
  assert.deepEqual(await liveDot(page), {stale: true, says: en("nav.stale.word"), why: 'finder line broke'});
  await page.evaluate(() => { window.drawFindLocation = window.calmDraw; });
  await page.click('#nav a[data-id="businesses"]');
  assert.deepEqual(await liveDot(page), {stale: false, says: '', why: ''});
  assert.equal(await page.evaluate(() => [...pageStale].some(row => /drawFindLocation/.test(String(row[1])))), false);
});

test('a refresh keeps a Set to figure being typed, and the focus on its box', async t => {
  const page = await board(t);
  // Every line shown: the depot's lines are all covered, so none would be by default.
  await page.evaluate(() => { showPage('supply'); showSub('supply', 'imports'); sbMode.imports = 'all'; drawSupplyView('imports'); wireAll(); });
  const typed = await page.evaluate(() => {
    const box = document.querySelector('#secImports input[data-imp]');
    if (!box) return null;
    box.focus();
    box.value = '1234';  // typed, not committed: no change event yet
    window.calmBox = box;
    return box.dataset.imp;
  });
  assert.ok(typed, 'the depot has a Set to box');
  await deliver(page, later);
  const now = await page.evaluate(() => {
    const el = document.activeElement;
    return {id: el.dataset.imp ?? null, value: el.value, rebuilt: el !== window.calmBox && !window.calmBox.isConnected};
  });
  assert.deepEqual(now, {id: typed, value: '1234', rebuilt: true});
  // Leaving the box keeps the figure, as it would have without the refresh.
  await page.evaluate(() => document.activeElement.blur());
  assert.equal(await page.evaluate(id => (impSetEdits().edits[id] || {}).value, typed), 1234);
  assert.match(await page.evaluate(() => localStorage.getItem(impSetEdits().key) || ''), /"value":1234/);
});

test('Enter keeps a Set to figure put back by a refresh', async t => {
  const page = await board(t);
  await page.evaluate(() => { showPage('supply'); showSub('supply', 'imports'); sbMode.imports = 'all'; drawSupplyView('imports'); wireAll(); });
  const typed = await page.evaluate(() => {
    const box = document.querySelector('#secImports input[data-imp]');
    box.focus(); box.value = '4321';
    return box.dataset.imp;
  });
  await page.evaluate(() => {
    window.calmKept = 0;
    const keep = window.impSetKeep;
    window.impSetKeep = (...a) => { calmKept++; return keep(...a); };
  });
  await deliver(page, later);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(id => (impSetEdits().edits[id] || {}).value, typed), 4321);
  // Leaving the box after Enter commits nothing twice.
  await page.evaluate(() => new Promise(r => setTimeout(r)));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  assert.equal(await page.evaluate(() => calmKept), 1, 'one commit');
});

test('a Set to figure put back by a refresh and edited again is committed once', async t => {
  const page = await board(t);
  await page.evaluate(() => { showPage('supply'); showSub('supply', 'imports'); sbMode.imports = 'all'; drawSupplyView('imports'); wireAll(); });
  const typed = await page.evaluate(() => {
    const box = document.querySelector('#secImports input[data-imp]');
    box.focus(); box.value = '432';
    window.calmKept = 0;
    const keep = window.impSetKeep;
    window.impSetKeep = (...a) => { calmKept++; return keep(...a); };
    return box.dataset.imp;
  });
  await deliver(page, later);
  await page.keyboard.press('End');
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await page.evaluate(() => new Promise(r => setTimeout(r)));
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  assert.equal(await page.evaluate(id => (impSetEdits().edits[id] || {}).value, typed), 4321);
  assert.equal(await page.evaluate(() => calmKept), 1, 'one commit');
});

test('a render keeps a Stale mark on the fresh dot, and a lost source replaces it', async t => {
  const page = await board(t);
  await page.evaluate(() => { window.calmWatch.stale('rebuild broke'); renderCalm(); });
  assert.deepEqual(await liveDot(page), {stale: true, says: en("nav.stale.word"), why: 'rebuild broke'});
  await page.evaluate(() => window.calmWatch.lost());
  // Not in the catalogue: the lost live dot writes this English itself.
  assert.deepEqual(await liveDot(page), {stale: false, says: 'Not live', why: ''});
});

test('a refresh settles the board, not an open dialog', async t => {
  const page = await board(t);
  await settle(page);
  // A game-link write dialog on screen: the refresh repaints it through its
  // gate (gwReadBack()), and the "ready again" nod it puts there plays.
  const nod = await page.evaluate(async p => {
    const dlg = document.createElement('dialog');
    dlg.className = 'gw-dlg';
    document.body.appendChild(dlg);
    dlg.showModal();
    gwOpen = dlg;
    dlg._gwGate = () => { dlg.innerHTML = '<div class="gw-w ok"><span class="g">ready</span></div>'; };
    const playing = () => document.getAnimations().filter(a => a.animationName === 'gw-nod' && dlg.contains(a.effect.target))
      .map(a => a.playState);
    window.calmWatch.changed(JSON.parse(p));
    const now = playing();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {now, later: playing()};
  }, payload);
  assert.deepEqual(nod, {now: ['running'], later: ['running']});
});

test('a refresh with the search palette open does not make its lit row hop again', async t => {
  const page = await board(t);
  await settle(page);
  await page.evaluate(() => ssOpen());
  // The palette's own drop and the first row's hop, played out: a row is lit
  // and neither animation still runs.
  await page.waitForFunction(() => ssPal.querySelectorAll('.ss-q2.on').length > 0
    && !document.getAnimations().some(a => ['ss-drop', 'ss-hop'].includes(a.animationName) && a.playState === 'running'),
  null, {polling: 50});
  const hop = await page.evaluate(async p => {
    const hopping = () => document.getAnimations()
      .filter(a => a.animationName === 'ss-hop' && a.playState === 'running').length;
    const lit = ssPal.querySelectorAll('.ss-q2.on').length, before = hopping();
    window.calmWatch.changed(JSON.parse(p));
    const now = hopping();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {lit, relit: ssPal.querySelectorAll('.ss-q2.on').length, before, now, later: hopping()};
  }, payload);
  assert.deepEqual(hop, {lit: 1, relit: 1, before: 0, now: 0, later: 0});
});


// Instrument the real registry, rather than a stubbed render: no hidden view
// may build markup before its first navigation, including remembered routes.
for(const [hash, saved, view, shell] of [
  ["", {}, "today"], ["#map", {}, "map"], ["#wiki", {}, "wiki"],
  ["#wiki/guide-prices", {}, "wiki"], ["", {}, "wiki", true],
  ["", {ba_dash_route: "staffing/payroll"}, "staffing/payroll"],
  ["#payroll", {}, "staffing/payroll"], ["#secProducts", {}, "company/products"],
  ["#secFlow", {}, "supply/flow"], ["#secMarket", {}, "growth/market"],
  ["#site/missing-99", {}, "company/results"],
  ["", {ba_dash_page: "payroll"}, "staffing/payroll"],
  ["", {ba_dash_page: "supply", ba_dash_supply: "imports"}, "supply/imports"],
  ["", {ba_dash_page: "staffing", ba_dash_staffing: "needs"}, "staffing/needs"],
  ["", {ba_dash_page: "staffing", ba_dash_staffing: "payroll"}, "staffing/payroll"],
  ["#site/secondavenue-10", {}, "company/results"],
  ...["businesses/results", "businesses/standards", "businesses/prices", "businesses/milestones",
    "supply/changes", "supply/imports", "supply/deliveries", "supply/production", "supply/flow",
    "staffing/needs", "staffing/schedules", "expansion/demand", "expansion/open", "expansion/factory"]
    .map(id => ["#" + id, {}, ({"businesses/results": "company/results", "businesses/standards": "company/standards",
      "businesses/prices": "company/products", "businesses/milestones": "company/milestones",
      "expansion/demand": "growth/market", "expansion/open": "growth/open", "expansion/factory": "growth/plan"})[id] || id]),
]) test(`first boot defers hidden draws: ${hash || JSON.stringify(saved)}${shell ? " wiki shell" : ""}`, async t => {
  const page = await board(t, {hash, saved, shell, instrument: true});
  const state = await page.evaluate(() => ({view: viewOf(page), calls: initialDraws.slice(),
    stale: PAGE_DRAWS.filter(row => row[0] && !row[0].split(" ").includes(viewOf(page)))
      .every(row => pageStale.has(row))}));
  assert.equal(state.view, view);
  assert.ok(state.calls.every(tag => !tag || tag.split(" ").includes(view)), JSON.stringify(state.calls));
  assert.equal(state.stale, true);
  // Every subsequent first visit draws its rows on the current payload, and
  // reads exactly as a full render of the same state would read.
  if(hash === "#map"){
    await page.evaluate(() => { ssOpen(); });
    assert.ok(await page.evaluate(() => ssIndex.some(row => row.g === "sites") && ssIndex.some(row => row.g === "kinds")),
      'search indexes exist without relying on initial hidden draws');
    await page.evaluate(() => ssClose());
    const views = await page.evaluate(() => [...new Set(PAGE_DRAWS.flatMap(row => row[0].split(" ")).filter(Boolean))]);
    for(const id of views.filter(id => id !== "wiki")){
      const visit = await board(t, {hash: '#map'});
      await visit.evaluate(id => {
        const [p, v] = id.split("/");
        showPage(p, false); if(v) showSub(p, v);
      }, id);
      const read = () => visit.evaluate(() => {
        document.querySelectorAll('.sec').forEach(el => el.classList.add('measured'));
        return document.querySelector('.page:not([hidden])').innerText;
      });
      const shown = await read();
      await visit.evaluate(() => renderAll());
      assert.equal(shown, await read(), `first visit ${id}`);
      await visit.context().close();
    }
  }
});


test('synthetic startup reports synchronous main-thread work and draw count', async t => {
  const data = JSON.parse(payload), originals = data.businesses.slice();
  // The real synthetic fixture's business shape, expanded to 60 businesses.
  // Preserve all its original supply/staff indexes; extra shops belong to
  // independent chains and have no new private/game-derived fields.
  while(data.businesses.length < 60){
    const i = data.businesses.length, b = structuredClone(originals[i % originals.length]);
    b.key = `synthetic:${i}`; b.name = `Synthetic business ${i}`;
    data.businesses.push(b);
    const c = structuredClone(data.chains[0]);
    c.name = b.name; c.sites = [b.key]; data.chains.push(c);
  }
  const samples = {deferred: [], eager: []}, counts = {};
  for(let round = 0; round < 5; round++) for(const eager of [false, true]){
    const page = await board(t, {hash: '#map', data: JSON.stringify(data), eager, instrument: true});
    const sample = await page.evaluate(() => ({ms: initialWorkMs, draws: initialDraws.length}));
    const key = eager ? 'eager' : 'deferred';
    samples[key].push(sample.ms); counts[key] = sample.draws;
    await page.context().close();
  }
  const median = rows => rows.slice().sort((a,b) => a-b)[Math.floor(rows.length / 2)];
  assert.ok(counts.deferred < counts.eager);
  t.diagnostic(JSON.stringify({syntheticBusinesses: data.businesses.length, route: '#map',
    samples: 5, registryDrawCalls: counts,
    synchronousDeliveryMedianMs: Object.fromEntries(Object.entries(samples).map(([k,v]) => [k, +median(v).toFixed(2)]))}));
});
