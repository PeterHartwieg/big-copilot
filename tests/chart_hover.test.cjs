// The daily chart's crosshair reads the day under the pointer (issue #79). The
// chart draws into a fixed 1140-wide viewBox, centred at 1:1 in a wider box, so
// on a wide screen the empty margins beside the plot must read no day, and a
// pointer over a bar must read that bar's day. Synthetic fixtures only.
// Browser regressions: install Playwright and its Chromium browser to run.
// NODE_PATH may point at an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const {chromium} = require('playwright');

let browser;
let html;
before(async () => {
  const result = spawnSync(process.env.PYTHON || 'python', ['-c',
    'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
  {cwd: path.join(__dirname, '..'), maxBuffer: 4 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8')
    : result.stdout.toString();
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

// Forty days from day 30 unless told otherwise; the chart's default window
// shows the last 30 (40 to 69).
async function board(t, width, days = 40) {
  const page = await browser.newPage({viewport: {width, height: 1000}});
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await page.route('https://**', route => route.abort());
  await page.route('https://chart.test/', route =>
    route.fulfill({contentType: 'text/html; charset=utf-8', body: html}));
  await page.goto('https://chart.test/', {waitUntil: 'load'});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.evaluate(days => {
    document.body.classList.add('has-board');
    const daily = Array.from({length: days}, (_, i) => ({day: 30 + i, profit: 1000 + 50 * (i % 7), profit7: 1100,
      revenue: 3000, cogs: 1000, wages: 500, business: 1000, loans: 0, insurance: 0, homes: 0, parking: 0}));
    D = {meta: {save: 'Fixture', day: 70, hour: 11, minute: 13, build: 3682, verifiedBuild: 3682, source: 'fixture.hsg',
      saved: 'today', generated: 'now'}, kpi: {businesses: 1, employees: 2, vacant: 0},
      daily, rhythm: {recent: {}}, businesses: [], products: []};
    showPage('company', false, 'none'); showSub('company', 'results');
    drawChart(); wireAll();
    document.querySelectorAll('section').forEach(s => s.classList.add('measured'));
  }, days);
  require('./_payload_contract.cjs').assertPayloadShape(await page.evaluate(() => D), 'chart_hover');
  await page.locator('#dailyBox svg').scrollIntoViewIfNeeded();
  return page;
}

// The bars' centres on screen, from their own boxes, the svg's box, and where
// viewBox x = 20 (the y axis labels, left of the first bar) lands on screen.
const geometry = page => page.evaluate(() => {
  const svg = document.querySelector('#dailyBox svg');
  const axis = new DOMPoint(20, 130).matrixTransform(svg.getScreenCTM());
  const bars = [...svg.querySelectorAll('g[data-series] rect')].map(r => {
    const b = r.getBoundingClientRect(); return {x: b.left + b.width / 2, y: b.top + b.height / 2};
  });
  const s = svg.getBoundingClientRect();
  return {bars, left: s.left, right: s.right, top: s.top, height: s.height, axisX: axis.x};
});
const read = page => page.locator('#dailyBox .readout').evaluate(el => el.textContent.replace(/\s+/g, ' ').trim());
const crosshairX = page => page.locator('#dailyBox .xh line').evaluate(el => +el.getAttribute('x1'));
const missed = page => page.locator('#dailyBox .chartbox').evaluate(el => el.classList.contains('chart-miss'));

async function hoverDay(page, at, day) {
  await page.mouse.move(at.x, at.y);
  assert.match(await read(page), new RegExp(`^Day ${day} `), `the pointer over day ${day} reads it`);
  assert.equal(await missed(page), false, 'the crosshair shows');
}

async function hoverMiss(page, x, y, last) {
  await page.mouse.move(x, y);
  assert.equal(await missed(page), true, `no crosshair at x=${x}`);
  assert.match(await read(page), new RegExp(`^Day ${last} `), 'the read-out goes back to the last day');
}

test('a wide chart reads the bar under the pointer and nothing in its margins', async t => {
  const page = await board(t, 2440);
  const g = await geometry(page);
  assert.ok(g.right - g.left > 2200, `the chart box is wide (${g.right - g.left}px)`);
  assert.equal(g.bars.length, 30);
  // The plot is centred at 1:1, so there is a broad empty margin each side.
  assert.ok(g.bars[0].x - g.left > 500, 'the plot sits in the middle of the box');

  await hoverDay(page, g.bars[0], 40);
  await hoverDay(page, g.bars[15], 55);
  await hoverDay(page, g.bars[29], 69);

  const midY = g.top + g.height / 2;
  for (const x of [g.left + 40, g.bars[0].x - 200, g.axisX, g.bars[29].x + 200, g.right - 40]) {
    await hoverDay(page, g.bars[15], 55);
    await hoverMiss(page, x, midY, 69);
  }
  // Back on the plot, the crosshair returns.
  await hoverDay(page, g.bars[7], 47);
  // Leaving the chart ends on the last day, as leaving through a margin does.
  await page.mouse.move(g.bars[7].x, g.top - 300);
  assert.match(await read(page), /^Day 69 /);
});

test('a narrow chart reads the bar under the pointer as before', async t => {
  const page = await board(t, 900);
  const g = await geometry(page);
  assert.ok(g.right - g.left < 1140, `the chart box is narrow (${g.right - g.left}px)`);
  await hoverDay(page, g.bars[0], 40);
  await hoverDay(page, g.bars[15], 55);
  await hoverDay(page, g.bars[29], 69);
  // The crosshair sits on the bar it reads, in viewBox units.
  const xs = JSON.parse(await page.locator('#dailyBox .chartbox').getAttribute('data-xs'));
  assert.equal(await crosshairX(page), xs[29]);
  await hoverMiss(page, g.axisX, g.top + g.height / 2, 69);
});

test('a lone day reads only under its own bar', async t => {
  const page = await board(t, 1280, 1);
  const g = await geometry(page);
  assert.equal(g.bars.length, 1);
  await hoverDay(page, g.bars[0], 30);
  const midY = g.top + g.height / 2;
  for (const x of [g.bars[0].x - 200, g.bars[0].x + 200, g.axisX]) {
    await hoverDay(page, g.bars[0], 30);
    await hoverMiss(page, x, midY, 30);
  }
});
