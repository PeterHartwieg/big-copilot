// bodyPopover() and popFit() in template/board.js, on their own: the lifecycle
// every body-level popover shares (#demCellPop, #pcPop, #fvDiffPop, #alertPop)
// and the list placement #pcPop and #gnPop share. The two functions come from
// the board script loaded whole (tests/_board.cjs) and run on a bare page in
// Chromium, with real events and real layout; each popover's own behaviour on
// the board is in its suite (finder_layout, plan_extra, open_factory,
// fold_views, search, businesses_expansion). Browser test: install Playwright
// and its Chromium browser to run; NODE_PATH may point at an existing
// Playwright installation.
'use strict';

const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {loadBoard} = require('./_board.cjs');

// The real functions, as the board script defines them. Each reaches only the
// page's document and window and the board's hideTip(), which the page below
// stands in for.
const board = loadBoard();
const HELPER = [board.bodyPopover, board.popFit].map(String).join('\n');

const PAGE = `<!doctype html><meta charset="utf-8">
<style>
  body{margin:0;height:3000px}
  #a{position:absolute;left:100px;top:200px;width:80px;height:24px}
  #t2{position:absolute;left:300px;top:200px}
  .pop{position:fixed;width:200px;height:150px;overflow:auto}
  .pop .inner{height:600px}
  .pop:not(.on).cls{display:none}
  .list{position:fixed;width:160px;overflow:auto}
  .list div{height:30px}
</style>
<button id="a" class="tog">anchor</button><button id="t2" class="tog">other toggle</button>
<button id="else">elsewhere</button>
<script>
  window.tipHides = 0;
  function hideTip(){ tipHides++; }
  ${HELPER}
  window.log = [];
  window.anchorEl = document.getElementById("a");
  window.make = (extra = {}) => {
    const p = bodyPopover({id: "p" + Math.random().toString(36).slice(2), className: "pop" + (extra.onClass ? " cls" : ""),
      focusable: true, anchor: () => anchorEl,
      place: () => log.push("place"), onClose: r => log.push("close:" + r), ...extra});
    p.el.innerHTML = '<button class="in">in</button><div class="inner"></div>';
    return p;
  };
</script>`;

let browser;
before(async () => { browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL}); });
after(async () => { await browser?.close(); });

async function page(t, viewport = {width: 800, height: 600}){
  const p = await browser.newPage({viewport});
  t.after(() => p.close());
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await p.setContent(PAGE);
  return p;
}

test('open shows it at body level, marks its anchor and places it', async t => {
  const p = await page(t);
  const r = await p.evaluate(() => {
    const pop = make();
    const before = {hidden: pop.el.hidden, open: pop.isOpen(), parent: pop.el.parentElement === document.body, role: pop.el.getAttribute('role'), tab: pop.el.tabIndex};
    pop.open();
    return {before, hidden: pop.el.hidden, open: pop.isOpen(), expanded: anchorEl.getAttribute('aria-expanded'), log};
  });
  assert.deepEqual(r.before, {hidden: true, open: false, parent: true, role: 'dialog', tab: -1});
  assert.equal(r.hidden, false);
  assert.equal(r.open, true);
  assert.equal(r.expanded, 'true');
  assert.deepEqual(r.log, ['place']);
});

test('a press outside closes it without moving focus; one on it, its anchor or a toggle does not', async t => {
  const p = await page(t);
  await p.evaluate(() => { window.pop = make({toggles: '.tog'}); pop.open(); });
  await p.locator('.pop .in').dispatchEvent('mousedown');
  await p.locator('#a').dispatchEvent('mousedown');
  await p.locator('#t2').dispatchEvent('mousedown');
  assert.equal(await p.evaluate(() => pop.isOpen()), true, 'inside, the anchor and a toggle are not outside');
  await p.evaluate(() => document.getElementById('else').focus());
  await p.locator('#else').dispatchEvent('mousedown');
  const r = await p.evaluate(() => ({open: pop.isOpen(), focus: document.activeElement.id, log, a: anchorEl.getAttribute('aria-expanded'), t2: document.getElementById('t2').getAttribute('aria-expanded')}));
  assert.equal(r.open, false);
  assert.equal(r.focus, 'else', 'focus stays where the press put it');
  assert.deepEqual(r.log, ['place', 'close:false']);
  assert.equal(r.a, 'false');
  assert.equal(r.t2, 'false', 'every toggle reads closed');
});

test('Escape closes it, hands focus back to the anchor and puts the tooltip away', async t => {
  const p = await page(t);
  await p.evaluate(() => { window.pop = make(); pop.open(); pop.el.querySelector('.in').focus(); });
  const prevented = await p.evaluate(() => {
    let seen = null;
    document.addEventListener('keydown', e => { seen = e.defaultPrevented; });
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    return seen;
  });
  const r = await p.evaluate(() => ({open: pop.isOpen(), focus: document.activeElement.id, tips: tipHides, log}));
  assert.equal(r.open, false);
  assert.equal(r.focus, 'a');
  assert.equal(r.tips, 1);
  assert.deepEqual(r.log, ['place', 'close:true']);
  assert.equal(prevented, false, 'the key keeps its default unless escPrevent');
  // Closed, Escape is not its business.
  await p.keyboard.press('Escape');
  assert.deepEqual(await p.evaluate(() => log), ['place', 'close:true']);
});

test('escPrevent takes the Escape key\'s default', async t => {
  const p = await page(t);
  const prevented = await p.evaluate(() => {
    window.pop = make({escPrevent: true}); pop.open();
    let seen = null;
    document.addEventListener('keydown', e => { seen = e.defaultPrevented; });
    document.body.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    return seen;
  });
  assert.equal(prevented, true);
});

test('focus goes back only to an anchor still on screen', async t => {
  const p = await page(t);
  const r = await p.evaluate(() => {
    const pop = make(); pop.open();
    pop.el.querySelector('.in').focus();
    anchorEl.style.display = 'none';
    pop.close(true);
    return {focus: document.activeElement.className, tips: tipHides};
  });
  assert.equal(r.focus, 'in', 'a hidden anchor takes no focus (the element just closed still holds it)');
  assert.equal(r.tips, 0);
});

test('focusScroll lets the returned focus scroll the anchor into view', async t => {
  const p = await page(t);
  const r = await p.evaluate(() => {
    anchorEl.style.top = '2500px';
    const a = make(), b = make({focusScroll: true});
    a.open(); a.close(true);
    const kept = scrollY;
    document.activeElement.blur();
    b.open(); b.close(true);
    return {kept, after: scrollY};
  });
  assert.equal(r.kept, 0, 'by default the page does not move');
  assert.ok(r.after > 0, 'with focusScroll it does');
});

test('a resize places it again, or closes it with resize: "close"', async t => {
  const p = await page(t);
  await p.evaluate(() => { window.a = make(); window.b = make({resize: 'close', onClose: r => log.push('b:' + r)}); a.open(); b.open(); log.length = 0; });
  await p.setViewportSize({width: 700, height: 500});
  await p.waitForFunction(() => log.length >= 2);
  const r = await p.evaluate(() => ({a: a.isOpen(), b: b.isOpen(), log}));
  assert.equal(r.a, true);
  assert.equal(r.b, false);
  assert.ok(r.log.includes('place'));
  assert.ok(r.log.includes('b:false'));
});

test('the page scrolling places it again; its own list scrolling does not', async t => {
  const p = await page(t);
  await p.evaluate(() => { window.pop = make(); pop.open(); log.length = 0; });
  await p.evaluate(() => {
    pop.el.addEventListener('scroll', () => { window.ownScrolls = (window.ownScrolls || 0) + 1; });
    pop.el.scrollTop = 100;
  });
  await p.waitForFunction(() => window.ownScrolls > 0);
  assert.deepEqual(await p.evaluate(() => log), [], 'its own scroll');
  await p.evaluate(() => window.scrollTo(0, 300));
  await p.waitForFunction(() => log.length > 0);
  assert.deepEqual(await p.evaluate(() => [...new Set(log)]), ['place']);
  // Closed, nothing is placed.
  await p.evaluate(() => { pop.close(false); log.length = 0; window.scrollTo(0, 0); });
  await p.waitForTimeout(50);
  assert.deepEqual(await p.evaluate(() => log), []);
});

test('onClass shows it by a class and leaves the hidden attribute alone', async t => {
  const p = await page(t);
  const r = await p.evaluate(() => {
    const pop = make({onClass: 'on'});
    const was = {hidden: pop.el.hidden, open: pop.isOpen()};
    pop.open();
    const opened = {on: pop.el.classList.contains('on'), hidden: pop.el.hidden, open: pop.isOpen()};
    pop.close(false);
    return {was, opened, closed: {on: pop.el.classList.contains('on'), open: pop.isOpen()}};
  });
  assert.deepEqual(r.was, {hidden: false, open: false});
  assert.deepEqual(r.opened, {on: true, hidden: false, open: true});
  assert.deepEqual(r.closed, {on: false, open: false});
});

test('two popovers open at once each close on one Escape, as before the helper', async t => {
  const p = await page(t);
  const r = await p.evaluate(() => {
    const a = make(), b = make({onClass: 'on'});
    a.open(); b.open();
    document.body.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    return [a.isOpen(), b.isOpen()];
  });
  assert.deepEqual(r, [false, false]);
});

/* popFit(): an anchor at `top` in a 600 px window, a list of `rows` 30 px rows. */
async function fit(p, {top, rows, gap = 8, scroll = 0}){
  return p.evaluate(({top, rows, gap, scroll}) => {
    const el = document.createElement('div');
    el.className = 'list';
    el.innerHTML = '<div></div>'.repeat(rows);
    document.body.appendChild(el);
    const at = {left: 100, right: 180, top, bottom: top + 24, width: 80, height: 24};
    popFit(el, at, gap);
    // Scrolled, then placed again (the page scrolled).
    if(scroll){ el.scrollTop = scroll; popFit(el, at, gap); }
    const r = el.getBoundingClientRect();
    const out = {top: r.top, bottom: r.bottom, left: r.left, height: r.height, scroll: el.scrollTop};
    el.remove();
    return out;
  }, {top, rows, gap, scroll});
}

test('popFit: under the anchor while the list fits there', async t => {
  const p = await page(t);
  const r = await fit(p, {top: 100, rows: 5});
  assert.equal(r.top, 132);
  assert.equal(r.height, 150);
  assert.equal(r.left, 100);
});

test('popFit: above the anchor when only there is room', async t => {
  const p = await page(t);
  const r = await fit(p, {top: 500, rows: 5, gap: 6});
  assert.equal(r.bottom, 494);
  assert.equal(r.height, 150);
});

test('popFit: on the roomier side, its rows scrolling, never out of the window', async t => {
  const p = await page(t);
  const down = await fit(p, {top: 150, rows: 40});
  assert.equal(down.top, 182);
  assert.equal(down.bottom, 588, 'down to the window\'s 12 px margin');
  const up = await fit(p, {top: 400, rows: 40});
  assert.equal(up.top, 12);
  assert.equal(up.bottom, 392);

  // The rows stay where they were scrolled.
  const kept = await fit(p, {top: 150, rows: 40, scroll: 200});
  assert.equal(kept.scroll, 200);
});

test('popFit: in a window too short for either side it keeps 120 px and stays inside the window', async t => {
  const p = await page(t, {width: 800, height: 200});
  const r = await fit(p, {top: 80, rows: 40});
  assert.equal(r.height, 120);
  assert.equal(r.bottom, 188);
});

test('popFit: its left edge on the anchor\'s, clamped into the window', async t => {
  const p = await page(t);
  const r = await p.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'list';
    el.innerHTML = '<div></div>';
    document.body.appendChild(el);
    popFit(el, {left: 760, right: 790, top: 100, bottom: 124, width: 30, height: 24}, 8);
    return {left: el.getBoundingClientRect().left, vw: document.documentElement.clientWidth};
  });
  assert.equal(r.left, r.vw - 160 - 12);
});
