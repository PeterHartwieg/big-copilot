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
async function board(t) {
  const context = await browser.newContext({viewport: {width: 1280, height: 2400}});
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await context.route('https://**', route => route.abort());
  await context.route('https://calm.test/', route =>
    route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await page.goto('https://calm.test/', {waitUntil: 'load'});
  await page.evaluate(() => { document.body.classList.add('has-board'); });
  await deliver(page);
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

  await page.evaluate(() => { showPage('supply'); showSub('supply', 'shops'); });
  await settle(page);
  const supply = await refresh(page, '#secShops > *');
  assert.ok(supply.rebuilt, 'the refresh rebuilt the Shops tab');
  assert.deepEqual(supply.now, still);
  assert.deepEqual(supply.later, still);
});

test('what a refresh redraws on a view out of sight is there on the way back', async t => {
  const page = await board(t);
  // Payroll has been seen: its role cards arrived.
  await page.evaluate(() => { showPage('company'); showSub('company', 'payroll'); });
  await settle(page);
  assert.ok(await page.locator('#secPayroll .role.rv.in').count() > 0, 'the fixture has role cards');
  await page.evaluate(() => showPage('today'));
  await settle(page);
  await page.evaluate(() => { window.calmOld = document.querySelector('#secPayroll .role'); });
  await deliver(page);
  await page.evaluate(() => showPage('company'));
  assert.ok(await page.evaluate(() => window.calmOld !== document.querySelector('#secPayroll .role')),
    'the refresh rebuilt the role cards');
  assert.deepEqual(await motion(page), still);
});

test('going somewhere new and opening a site still arrive', async t => {
  const page = await board(t);
  await settle(page);
  await deliver(page);
  // A page not visited yet: its sections slide in.
  await page.evaluate(() => { showPage('supply'); showSub('supply', 'warehouses'); });
  const supply = await motion(page);
  assert.ok(supply.moving.some(m => /^opacity on section#secWarehouses\.sec\.rv\.sb-tab\.in$/.test(m)), supply.moving.join('\n'));
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
  // Every view seen once, Company last on Payroll and Supply on Shops.
  await page.evaluate(() => {
    for (const [p, v] of [['growth', 'market'], ['supply', 'warehouses'], ['supply', 'shops'], ['company', 'results'], ['company', 'payroll']]) {
      showPage(p); showSub(p, v);
    }
  });
  await page.click('#nav a[data-id="today"]');
  await settle(page);
  // Blocks of each page as they stand now, to tell a redraw from none.
  const mark = () => page.evaluate(() => {
    window.calmOld = {kpis: '#kpis > *', payroll: '#secPayroll > *', portfolio: '#portfolio tbody',
      stock: '#secShops > *', market: '#market > *'};
    for (const k in calmOld) calmOld[k] = document.querySelector(calmOld[k]);
  });
  const standing = () => page.evaluate(() =>
    Object.fromEntries(Object.entries(calmOld).map(([k, el]) => [k, !!el && el.isConnected])));
  await mark();
  assert.match(await page.locator('#secPayroll').textContent(), /\b3 people\b/);

  // (a) The refresh redraws Today and leaves the other pages' markup alone.
  await deliver(page, later);
  assert.match(await page.locator('#kpis').innerText(), /25,000/, 'Today has the new cash');
  assert.deepEqual(await standing(), {kpis: false, payroll: true, portfolio: true, stock: true, market: true});
  assert.match(await page.locator('#secPayroll').textContent(), /\b3 people\b/, 'Payroll waits for its visit');

  // (b) By the nav: Company opens on Payroll, drawn for the new numbers.
  await page.click('#nav a[data-id="company"]');
  assert.match(await page.locator('#secPayroll').textContent(), /\b4 people\b/);
  assert.deepEqual(await motion(page), still, 'a view seen before comes back already arrived');
  let [shown, redrawn] = await asRedrawn(page);
  assert.equal(shown, redrawn);
  await page.click('#nav a[data-id="today"]');

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
  await page.click('#nav a[data-id="today"]');
  await mark();
  await deliver(page, later);
  assert.equal((await standing()).stock, true);
  await page.goBack();
  await page.waitForFunction(() => page === 'supply');
  assert.equal((await standing()).stock, false, 'the Shops tab was drawn on the way back');
  [shown, redrawn] = await asRedrawn(page);
  assert.equal(shown, redrawn);

  // A site opened from a finding on Today: its page, and the portfolio under it.
  await page.click('#nav a[data-id="today"]');
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
  await page.click('#nav a[data-id="today"]');
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
  await page.click('#nav a[data-id="company"]');
  const chain = page.locator('#portfolio tr.chain').first();
  await chain.click();
  assert.equal(await chain.evaluate(tr => tr.classList.contains('open')), true, 'one click opens the chain');
  await chain.click();
  assert.equal(await chain.evaluate(tr => tr.classList.contains('open')), false, 'and one closes it');
  // Today, drawn on its visit: a severity counter hides its findings, once.
  await deliver(page);
  await page.click('#nav a[data-id="today"]');
  const sev = page.locator('#alertHead .sev[data-kind]').first();
  await sev.click();
  assert.equal(await sev.evaluate(s => s.classList.contains('off')), true);
  await sev.click();
  assert.equal(await sev.evaluate(s => s.classList.contains('off')), false);
});

test('a draw that throws on the way in leaves the view out of date, not the reader stuck', async t => {
  const page = await board(t);
  await page.evaluate(() => { showPage('company'); showSub('company', 'payroll'); showPage('today'); });
  await deliver(page, later);
  const stale = () => page.evaluate(() => [...pageStale].some(row => /drawPayroll/.test(String(row[1]))));
  assert.equal(await stale(), true, 'Payroll waits for its visit');
  const messages = [];
  page.on('console', m => { if (m.type() === 'error') messages.push(m.text()); });
  await page.evaluate(() => {
    window.calmDraw = window.drawPayroll;
    window.drawPayroll = () => { throw new Error('payroll broke'); };
  });
  await page.click('#nav a[data-id="company"]');
  assert.equal(await page.evaluate(() => page), 'company', 'the nav click still opens Company');
  assert.equal(await page.locator('#pageCompany').isHidden(), false);
  assert.equal(await page.locator('#pageToday').isHidden(), true);
  assert.equal(await stale(), true, 'the view is still out of date');
  assert.ok(messages.some(m => /payroll broke/.test(m)), messages.join('\n'));
  assert.match(await page.locator('#secPayroll').textContent(), /\b3 people\b/);
  // The view shows the save before; the Live dot says so.
  assert.deepEqual(await liveDot(page), {stale: true, says: 'Stale', why: 'payroll broke'});

  await page.evaluate(() => { window.drawPayroll = window.calmDraw; });
  await page.click('#nav a[data-id="today"]');
  await page.click('#nav a[data-id="company"]');
  assert.equal(await stale(), false);
  assert.match(await page.locator('#secPayroll').textContent(), /\b4 people\b/, 'drawn on the next visit');
  assert.deepEqual(await liveDot(page), {stale: false, says: 'LIVE', why: ''});
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
  assert.deepEqual(await liveDot(page), {stale: true, says: 'Stale', why: 'portfolio broke'});

  // A rebuild that fails meanwhile holds the dot on its own: the row drawing
  // at last does not clear it, the source's next good read does.
  await page.evaluate(() => {
    window.calmWatch.stale('rebuild broke');
    window.drawPortfolio = window.calmDraw;
    showSub('company', 'products');
    showSub('company', 'results');
  });
  assert.deepEqual(await due(), []);
  assert.deepEqual(await liveDot(page), {stale: true, says: 'Stale', why: 'rebuild broke'});
  await page.evaluate(() => window.calmWatch.stale(''));
  assert.deepEqual(await liveDot(page), {stale: false, says: 'LIVE', why: ''});

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
  assert.deepEqual(await liveDot(page), {stale: false, says: 'LIVE', why: ''});
});

test('a render keeps a Stale mark on the fresh dot, and a lost source replaces it', async t => {
  const page = await board(t);
  await page.evaluate(() => { window.calmWatch.stale('rebuild broke'); renderCalm(); });
  assert.deepEqual(await liveDot(page), {stale: true, says: 'Stale', why: 'rebuild broke'});
  await page.evaluate(() => window.calmWatch.lost());
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
