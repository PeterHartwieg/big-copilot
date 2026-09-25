// Supply › Goods flow on a narrow screen (#148): under 950 px of box the
// diagram is the chain, stages down the page in the order the goods travel;
// wider boxes keep the four-column picture. The board runs on the synthetic
// R8 fixture (tests/fixtures/r8_supply.json), reshaped per test; never a save.
// Install Playwright and its Chromium browser to run; NODE_PATH may point at
// an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const FIXTURE = path.join(root, 'tests', 'fixtures', 'r8_supply.json');
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
let browser, html;
before(async () => {
  if(process.env.BOARD_TARGET === 'web') html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  else {
    const result = spawnSync(process.env.PYTHON || 'python', ['-c',
      'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
    {cwd: root, maxBuffer: 8 * 1024 * 1024});
    assert.equal(result.status, 0, result.stderr?.toString());
    html = result.stdout.toString();
  }
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

/* Supply's Shops tab as the diagram, drawn from `data` at `width`. */
async function board(t, data, width){
  const page = await browser.newPage({viewport: {width, height: 1000}});
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await page.route('https://**', route => route.abort());
  await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
  await page.goto('http://board.test/');
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.evaluate(data => {
    D = data; sbWhich = 'all'; sbViewOn = 'diagram'; sub.supply = 'shops';
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    drawSupplyStrip(); drawShopsTab(); drawWarehousesTab(); drawFactoriesTab(); wireAll();
    drawFlow();
  }, data);
  return page;
}
const state = page => page.evaluate(() => ({
  chain: !document.getElementById('flowChain').hidden,
  svg: getComputedStyle(document.getElementById('flow')).display !== 'none',
  svgNodes: document.querySelectorAll('#flow .node').length,
  rails: [...document.querySelectorAll('#flowChain .sb-fc-rail')].map(r => r.textContent),
  cards: [...document.querySelectorAll('#flowChain .sb-fc-band [data-fc-card]')].map(c => c.dataset.fcCard),
  pipes: [...document.querySelectorAll('#flowChain .sb-fc-pipes path[data-a]')].map(p => ({a: p.dataset.a, b: p.dataset.b, cls: p.getAttribute('class'), lane: p.dataset.lane})),
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));
/* A depot feeding `k` shops, fed by one pier: the shop count decides the fold. */
function depotWith(k){
  const data = fixture();
  const g = data.supply.graph;
  const depot = g.nodes.find(n => n.id === 'dist#6');
  const shops = Array.from({length: k}, (_, i) => ({...g.nodes.find(n => n.id === 'shop#3'), id: `extra#${i}`, name: `[X${i}] Shop ${i}`, tag: `X${i}`, site: null, items: []}));
  g.nodes = [g.nodes[0], depot, ...shops];
  g.links = [{from: 'import:pier', to: 'dist#6', perDay: 500, items: 1, cadence: 'weekly', paused: false, arrives: 30},
    ...shops.map((s, i) => ({from: 'dist#6', to: s.id, perDay: 10 + i, items: 1, cadence: 'daily', paused: false, arrives: null}))];
  return data;
}

test('the chain orders the stages as the goods travel: the hub between the pier and the factory', async t => {
  const page = await board(t, fixture(), 390);
  const s = await state(page);
  assert.equal(s.chain, true);
  assert.equal(s.svg, false, 'the picture waits hidden');
  assert.deepEqual(s.rails, ['Importers', 'Depots', 'Factories', 'Depots', 'Shops']);
  assert.deepEqual(s.cards, ['import:pier', 'hub#1', 'factory#2', 'dist#6', 'shop#3', 'shop#4']);
  // Every link is a pipe, the one that skips a stage too, and the weekly import is dashed.
  assert.equal(s.pipes.length, 6);
  assert.match(s.pipes.find(p => p.a === 'import:pier').cls, /weekly/);
  assert.ok(s.pipes.every(p => !/lit|warn|bad/.test(p.cls)), 'nothing is lit before a tap');
  assert.ok(s.overflow <= 0, `Supply scrolls sideways by ${s.overflow}px`);
  // Readable: a card is at least 88 px wide and its name at body size.
  const sizes = await page.$$eval('#flowChain .sb-fc-band .sb-fc-node', ns => ns.map(n => [n.getBoundingClientRect().width,
    parseFloat(getComputedStyle(n.querySelector('.sb-fc-nm')).fontSize), n.getBoundingClientRect().height]));
  sizes.forEach(([w, f, h]) => { assert.ok(w >= 88, `card ${w}px`); assert.ok(f >= 12, `name ${f}px`); assert.ok(h >= 44, `tap ${h}px`); });
  // The legend says what a tap does.
  assert.equal(await page.locator('#sbFlowBox .sb-fc-leg-tap').isVisible(), true);
  assert.equal(await page.locator('#sbFlowBox .sb-fc-leg-click').isVisible(), false);
});

test('a portrait tablet gets the chain too, wider cards; a desktop box keeps the picture', async t => {
  const tablet = await board(t, fixture(), 768);
  const s = await state(tablet);
  assert.equal(s.chain, true);
  assert.equal(await tablet.evaluate(() => document.getElementById('sbFlowBox').classList.contains('sb-fc-wide')), true);
  const wide = await tablet.$eval('#flowChain [data-fc-card="import:pier"]', n => n.getBoundingClientRect().width);
  assert.ok(wide > 170 && wide <= 190, `tablet card ${wide}px`);
  assert.ok(s.overflow <= 0);

  const desk = await board(t, fixture(), 1280);
  const d = await state(desk);
  assert.equal(d.chain, false);
  assert.equal(d.svg, true);
  assert.equal(d.svgNodes, 7, 'every node, the shop no pipe reaches too');
  assert.ok(await desk.evaluate(() => document.getElementById('sbFlowBox').getBoundingClientRect().width) >= 950);
  assert.equal(await desk.evaluate(() => document.getElementById('flowChain').innerHTML), '');
  // The window narrowing past the breakpoint redraws the chain, and back.
  await desk.setViewportSize({width: 600, height: 1000});
  await desk.waitForFunction(() => !document.getElementById('flowChain').hidden);
  assert.equal((await state(desk)).cards.length, 6);
  await desk.setViewportSize({width: 1280, height: 1000});
  await desk.waitForFunction(() => document.getElementById('flowChain').hidden);
  assert.equal((await state(desk)).svgNodes, 7);
});

test('a depot\'s shops fold into one card from four up, which lists them on a tap', async t => {
  const three = await board(t, depotWith(3), 390);
  assert.deepEqual((await state(three)).cards, ['import:pier', 'dist#6', 'extra#0', 'extra#1', 'extra#2']);
  const four = await board(t, depotWith(4), 390);
  const s = await state(four);
  assert.deepEqual(s.cards, ['import:pier', 'dist#6', 'g:dist#6']);
  const group = four.locator('#flowChain [data-fc-group="g:dist#6"]');
  assert.match(await group.textContent(), /4/);
  assert.match(await group.textContent(), /46 a day/);
  assert.equal(await group.getAttribute('aria-expanded'), 'false');
  await group.click();
  assert.equal(await four.locator('#flowChain [data-fc-group="g:dist#6"]').getAttribute('aria-expanded'), 'true');
  assert.equal(await four.locator('#flowChain .sb-fc-rows .sb-fc-r').count(), 4);
  assert.match((await state(four)).pipes.find(p => p.b === 'g:dist#6').cls, /lit/, 'the open group\'s pipe is lit');
  // A shop in the list follows that shop.
  await four.locator('#flowChain .sb-fc-r[data-fc-id="extra#2"]').click();
  assert.equal(await four.evaluate(() => flowPickId), 'extra#2');
  assert.match(await four.locator('#flowChain .sb-fc-where').textContent(), /Following Shop 2/);
});

test('shops no pipe reaches share one line at the bottom', async t => {
  const page = await board(t, fixture(), 390);
  const line = page.locator('#flowChain [data-fc-group="unfed"]');
  assert.match(await line.textContent(), /1 shop no pipe reaches/);
  assert.match(await line.textContent(), /Gym/);
  assert.equal((await state(page)).cards.includes('gym#5'), false, 'not a stage of its own');
  await line.click();
  assert.equal(await page.locator('#flowChain [data-fc-rows="unfed"] .sb-fc-r[data-fc-id="gym#5"]').count(), 1);
  assert.match(await page.locator('#flowChain [data-fc-rows="unfed"]').textContent(), /No pipe reaches these/);
});

test('no pipe at all: the box says so and links the wiki, at any width', async t => {
  for(const [width, keep] of [[390, false], [1280, false], [390, true], [1280, true]]){
    const data = fixture();
    // No site at all, or one stocked shop no delivery plan reaches.
    data.supply.graph = {nodes: keep ? data.supply.graph.nodes.filter(n => n.id === 'shop#3') : [], links: []};
    const page = await board(t, data, width);
    assert.equal(await page.locator('#sbFlowBox').isVisible(), true, `${width}: the box stays`);
    assert.match(await page.locator('#flowChain').textContent(), /No goods move between your sites yet/);
    assert.equal(await page.locator('#flowChain a.sb-fc-btn').getAttribute('href'), '#wiki/importers-overview');
    assert.equal(await page.locator('#sbFlowBox .sb-flowleg').isVisible(), false);
  }
});

test('following a site: in above, out below, the pipe carrying its problem coloured', async t => {
  const data = fixture();
  const g = data.supply.graph;
  // The factory's own facts: which product is worst, and one it is fine on.
  const hub = g.links.find(l => l.from === 'hub#1' && l.to === 'factory#2');
  const page = await board(t, data, 390);
  const facts = await page.evaluate(() => {
    const n = D.supply.graph.nodes.find(n => n.id === 'factory#2');
    return n.items.map((it, i) => ({slug: it.slug, lvl: flowFacts(n)[i].lvl, st: flowFacts(n)[i].st}));
  });
  const sick = facts.find(f => f.lvl === 'critical') || facts.find(f => f.lvl === 'warn');
  const well = facts.find(f => f.lvl !== 'critical' && f.lvl !== 'warn');
  assert.ok(sick && well, JSON.stringify(facts));
  const pipeInto = async slugs => {
    await page.evaluate(([slugs]) => {
      D.supply.graph.links.find(l => l.from === 'hub#1' && l.to === 'factory#2').slugs = slugs;
      flowFocus('factory#2');
    }, [slugs]);
    return (await state(page)).pipes.find(p => p.a === 'in:hub#1');
  };
  assert.ok(hub);
  const bad = await pipeInto([sick.slug]);
  assert.match(bad.cls, sick.lvl === 'critical' ? /\bbad\b/ : /\bwarn\b/);
  assert.match(await page.locator('#flowChain [data-fc-card="in:hub#1"]').textContent(), new RegExp(`${sick.st === 'noplan' ? 'no plan' : sick.st}`));
  const fine = await pipeInto([well.slug]);
  assert.match(fine.cls, /\blit\b/);
  assert.doesNotMatch(fine.cls, /warn|bad/);
  const s = await state(page);
  assert.deepEqual(s.rails, ['Comes in', 'Here', 'Goes out']);
  assert.deepEqual(s.cards, ['in:hub#1', 'here', 'out:shop#3', 'out:shop#4', 'out:dist#6']);
  assert.equal(await page.locator('#sbFlowBox .sb-flowleg').isVisible(), false);
  // Its facts in words.
  assert.match(await page.locator('#flowChain .sb-fc-why').textContent(), /Worth a look/);
  // The crumb goes back to the whole chain.
  await page.locator('#flowChain [data-fc-back]').click();
  assert.equal(await page.evaluate(() => flowPickId), null);
  assert.equal((await state(page)).rails[0], 'Importers');
});

test('a tap gives the rows and the site page; a vanished site drops the focus', async t => {
  const page = await board(t, fixture(), 390);
  await page.locator('#flowChain .sb-fc-look [data-fc-id="factory#2"]').click();
  const rows = page.locator('#flowChain [data-fc-open="factory#2"]');
  const n = await page.evaluate(() => D.supply.graph.nodes.find(n => n.id === 'factory#2').items.length);
  assert.equal((await rows.textContent()).trim(), `Its ${n} rows`);
  assert.equal(await page.locator('#flowChain [data-fc-site]').count(), 1);
  await rows.click();
  assert.equal(await page.evaluate(() => [sbViewMode(), sub.supply].join()), 'list,factories');
  assert.equal(await page.locator('#secFactories .sb-obj.lit').count(), 1);

  const again = await board(t, fixture(), 390);
  await again.locator('#flowChain .sb-fc-band [data-fc-id="dist#6"]').click();
  const key = await again.evaluate(() => D.businesses[5].key);
  // The board opens a site page through openSite(); the harness only records the call.
  await again.evaluate(() => { window.__opened = []; openSite = key => { window.__opened.push(key); return true; }; });
  await again.locator(`#flowChain [data-fc-site="${key}"]`).click();
  assert.deepEqual(await again.evaluate(() => window.__opened), [key]);

  const gone = await board(t, fixture(), 390);
  await gone.evaluate(() => { flowFocus('shop#4'); D.supply.graph.nodes = D.supply.graph.nodes.filter(n => n.id !== 'shop#4');
    D.supply.graph.links = D.supply.graph.links.filter(l => l.to !== 'shop#4'); drawFlow(); });
  assert.equal(await gone.evaluate(() => flowPickId), null);
  assert.equal((await state(gone)).rails[0], 'Importers');
});

test('a long Japanese site name stays inside its card, two lines at most', async t => {
  const data = fixture();
  data.supply.graph.nodes.find(n => n.id === 'factory#2').name = '[FB] ハート物流センター新宿三丁目倉庫第二工場ハート物流センター新宿三丁目倉庫';
  const page = await board(t, data, 390);
  const nm = await page.$eval('#flowChain [data-fc-card="factory#2"] .sb-fc-nm', el => {
    const card = el.closest('.sb-fc-node').getBoundingClientRect(), r = el.getBoundingClientRect();
    return {over: r.right - card.right, lines: Math.round(r.height / parseFloat(getComputedStyle(el).lineHeight))};
  });
  assert.ok(nm.over <= 0, `runs ${nm.over}px past its card`);
  assert.ok(nm.lines <= 2, `${nm.lines} lines`);
  assert.ok((await state(page)).overflow <= 0);
});

/* A round trip: the hub feeds the factory and takes its output back, and
   feeds the shops. */
function roundTrip(){
  const data = fixture();
  const g = data.supply.graph;
  g.nodes = g.nodes.filter(n => ['import:pier', 'hub#1', 'factory#2', 'shop#3', 'shop#4'].includes(n.id));
  const f = g.nodes.find(n => n.id === 'factory#2');
  g.links = [
    {from: 'import:pier', to: 'hub#1', perDay: 4200, items: 2, slugs: ['flour', 'milk'], cadence: 'weekly', paused: false, arrives: 34},
    {from: 'hub#1', to: 'factory#2', perDay: 1720, items: 2, slugs: f.items.map(i => i.slug), cadence: 'daily', paused: false, arrives: null},
    {from: 'factory#2', to: 'hub#1', perDay: 900, items: 1, slugs: ['cake'], cadence: 'daily', paused: false, arrives: null},
    {from: 'hub#1', to: 'shop#3', perDay: 300, items: 1, slugs: ['cake'], cadence: 'daily', paused: false, arrives: null},
    {from: 'hub#1', to: 'shop#4', perDay: 30, items: 1, slugs: ['cake'], cadence: 'daily', paused: false, arrives: null},
  ];
  return data;
}

test('a depot that feeds a factory and takes its output back stays above the shops, and the way back is drawn', async t => {
  const page = await board(t, roundTrip(), 390);
  const s = await state(page);
  assert.deepEqual(s.rails, ['Importers', 'Depots', 'Factories', 'Shops']);
  assert.deepEqual(s.cards, ['import:pier', 'hub#1', 'factory#2', 'shop#3', 'shop#4']);
  assert.equal(s.pipes.length, 5, 'every link is a pipe, the one back up too');
  const back = s.pipes.find(p => p.a === 'factory#2' && p.b === 'hub#1');
  assert.match(back.cls, /\bback\b/);
  // The hub's pipes to the shops skip the factory band down the left lane;
  // the way back has its own lane, so the two never read as one line.
  const skip = s.pipes.filter(p => p.a === 'hub#1' && p.b.startsWith('shop#'));
  assert.ok(skip.length && skip.every(p => p.lane), JSON.stringify(skip));
  skip.forEach(p => assert.notEqual(p.lane, back.lane));
  assert.equal(await page.locator('#flowChain .sb-fc-pipes path.back[marker-end]').count(), 1, 'an arrowhead says which way');
});

test("which link of a round trip is the way back does not depend on the save's site order", async t => {
  const data = roundTrip();
  const g = data.supply.graph;
  // The factory listed before the hub, and a second importer straight to it.
  const f = g.nodes.find(n => n.id === 'factory#2');
  g.nodes = [g.nodes[0], f, ...g.nodes.filter(n => n !== f && n !== g.nodes[0])];
  g.links.push({from: 'import:pier', to: 'factory#2', perDay: 100, items: 1, slugs: ['milk'], cadence: 'weekly', paused: false, arrives: 34});
  const page = await board(t, data, 390);
  const s = await state(page);
  assert.deepEqual(s.rails, ['Importers', 'Depots', 'Factories', 'Shops']);
  assert.match(s.pipes.find(p => p.a === 'factory#2' && p.b === 'hub#1').cls, /\bback\b/);
});

test('a depot no importer fills keeps its place above its factory in a round trip', async t => {
  // Filled by a wholesale contract or by hand: no pier on the diagram.
  const data = roundTrip();
  const g = data.supply.graph;
  g.nodes = g.nodes.filter(n => n.id !== 'import:pier');
  g.links = g.links.filter(l => l.from !== 'import:pier');
  for(const order of ['hub first', 'factory first']){
    if(order === 'factory first') g.nodes = [g.nodes.find(n => n.id === 'factory#2'), ...g.nodes.filter(n => n.id !== 'factory#2')];
    const page = await board(t, data, 390);
    const s = await state(page);
    assert.deepEqual(s.rails, ['Depots', 'Factories', 'Shops'], order);
    assert.match(s.pipes.find(p => p.a === 'factory#2' && p.b === 'hub#1').cls, /\bback\b/, order);
    // A fixed-size arrowhead, whatever the pipe's width.
    assert.equal(await page.$eval('#flowChain marker[id^="sbFcArrow-"]', m => m.getAttribute('markerUnits')), 'userSpaceOnUse');
  }
});

/* A factory in round trips with `k` depots, the first also feeding a shop. */
function roundTrips(k){
  const data = fixture();
  const base = data.supply.graph.nodes;
  const hub = base.find(n => n.id === 'hub#1'), f = base.find(n => n.id === 'factory#2'), shop = base.find(n => n.id === 'shop#3');
  const depots = Array.from({length: k}, (_, i) => i ? {...hub, id: `dep#${i}`, name: `[D${i}] Depot ${i}`, tag: `D${i}`, site: null, items: []} : hub);
  const link = (from, to, perDay) => ({from, to, perDay, items: 1, cadence: 'daily', paused: false, arrives: null});
  data.supply.graph = {nodes: [f, ...depots, shop],
    links: [...depots.flatMap(d => [link(d.id, 'factory#2', 500), link('factory#2', d.id, 300)]), link('hub#1', 'shop#3', 200)]};
  return data;
}

test('a return is always the way back: a hand-stocked hub beside an importer to the factory', async t => {
  for(const factoryFirst of [false, true]){
    const data = roundTrip();
    const g = data.supply.graph;
    // The hub is stocked by hand; the pier imports straight to the factory.
    g.links = g.links.filter(l => l.from !== 'import:pier');
    g.links.push({from: 'import:pier', to: 'factory#2', perDay: 100, items: 1, slugs: ['milk'], cadence: 'weekly', paused: false, arrives: 34});
    if(factoryFirst) g.nodes = [g.nodes.find(n => n.id === 'factory#2'), ...g.nodes.filter(n => n.id !== 'factory#2')];
    const page = await board(t, data, 390);
    const s = await state(page);
    assert.deepEqual(s.rails, ['Importers', 'Depots', 'Factories', 'Shops'], `factory first: ${factoryFirst}`);
    assert.match(s.pipes.find(p => p.a === 'factory#2' && p.b === 'hub#1').cls, /\bback\b/);
  }
});

test('a factory in round trips with two depots sits below both, both returns drawn back', async t => {
  const page = await board(t, roundTrips(2), 390);
  const s = await state(page);
  assert.deepEqual(s.rails, ['Depots', 'Factories', 'Shops']);
  assert.deepEqual(s.cards.slice(0, 3).sort(), ['dep#1', 'factory#2', 'hub#1']);
  assert.equal(s.cards[2], 'factory#2');
  const backs = s.pipes.filter(p => p.a === 'factory#2');
  assert.equal(backs.length, 2);
  backs.forEach(p => assert.match(p.cls, /\bback\b/));
});

test('two factories supplying each other: only one of the pair is the way back', async t => {
  const data = roundTrip();
  const g = data.supply.graph;
  const f = g.nodes.find(n => n.id === 'factory#2');
  g.nodes.push({...f, id: 'factory#9', name: '[FX] Factory X', tag: 'FX', site: null, items: []});
  const link = (from, to) => ({from, to, perDay: 200, items: 1, slugs: ['cake'], cadence: 'daily', paused: false, arrives: null});
  g.links.push(link('factory#2', 'factory#9'), link('factory#9', 'factory#2'));
  const page = await board(t, data, 390);
  const s = await state(page);
  const pair = s.pipes.filter(p => p.a.startsWith('factory#') && p.b.startsWith('factory#'));
  assert.equal(pair.length, 2);
  assert.equal(pair.filter(p => /\bback\b/.test(p.cls)).length, 1, JSON.stringify(pair));
  assert.match(s.pipes.find(p => p.a === 'factory#2' && p.b === 'hub#1').cls, /\bback\b/);
});

test('every pipe back up has a lane of its own, and a paused one a red arrow', async t => {
  const data = roundTrips(4);
  data.supply.graph.links.find(l => l.from === 'factory#2' && l.to === 'dep#2').paused = true;
  const page = await board(t, data, 390);
  const s = await state(page);
  const backs = s.pipes.filter(p => /\bback\b/.test(p.cls));
  assert.equal(backs.length, 4);
  assert.equal(new Set(backs.map(p => p.lane)).size, 4, JSON.stringify(backs.map(p => p.lane)));
  assert.equal(await page.$eval('#flowChain path[data-b="dep#2"][data-a="factory#2"]', p => p.getAttribute('marker-end')), 'url(#sbFcArrow-bad)');
  assert.ok((await state(page)).overflow <= 0);
});

test('a way back leaving the last stage has room under it', async t => {
  const data = roundTrip();
  // A shop cannot send, so the last stage here is the factories: no shops.
  const g = data.supply.graph;
  g.nodes = g.nodes.filter(n => n.kind !== 'shop');
  g.links = g.links.filter(l => !l.to.startsWith('shop#'));
  const page = await board(t, data, 390);
  const pad = await page.$eval('#flowChain .sb-fc-chain', el => parseFloat(getComputedStyle(el).paddingBottom));
  assert.equal(pad, 36);
});

test('a factory fed by its own depot shows the depot in and out, each with its own pipe', async t => {
  const page = await board(t, roundTrip(), 390);
  await page.evaluate(() => flowFocus('factory#2'));
  const s = await state(page);
  assert.deepEqual(s.cards, ['in:hub#1', 'here', 'out:hub#1']);
  assert.deepEqual(s.pipes.map(p => [p.a, p.b]), [['in:hub#1', 'here'], ['here', 'out:hub#1']]);
  // The in-pipe carries the factory's inputs, so it is the one coloured.
  assert.match(s.pipes[0].cls, /\b(bad|warn)\b/);
  // Both copies follow the real site.
  assert.deepEqual(await page.$$eval('#flowChain [data-fc-id="hub#1"]', els => els.length), 2);
});

test('a factory on no pipe sits with the factories, not after the shops', async t => {
  const data = roundTrip();
  const g = data.supply.graph;
  g.nodes = g.nodes.filter(n => n.id !== 'factory#2').concat([{...fixture().supply.graph.nodes.find(n => n.id === 'factory#2'), id: 'lone#9', name: 'Lone Factory'}]);
  g.links = g.links.filter(l => l.from !== 'factory#2' && l.to !== 'factory#2');
  const page = await board(t, data, 390);
  const s = await state(page);
  assert.deepEqual(s.rails, ['Importers', 'Factories', 'Depots', 'Shops']);
  assert.equal(s.cards[1], 'lone#9');
});

test('a site followed on the chain does not dim the picture the box grows into', async t => {
  const page = await board(t, fixture(), 600);
  await page.evaluate(() => { flowFocus('factory#2'); flowOpenGroup = 'unfed'; });
  await page.setViewportSize({width: 1280, height: 1000});
  await page.waitForFunction(() => document.getElementById('flowChain').hidden);
  assert.equal(await page.evaluate(() => flowPickId), null);
  assert.equal(await page.locator('#flow .node.faded').count(), 0);
});

test('a live refresh keeps the site followed and the open group, and lays the pipes again', async t => {
  const page = await board(t, depotWith(4), 390);
  await page.evaluate(() => { showPage('supply'); sbViewOn = 'diagram'; showSub('supply', 'shops'); });
  await page.locator('#flowChain [data-fc-group="g:dist#6"]').click();
  /* A live refresh: fresh data, and the Supply rows of PAGE_DRAWS run the
     calm way renderCalm() runs them (the fixture is Supply's payload only, so
     the whole renderAll() would stop at the masthead). The old markup,
     marked here, is replaced. */
  const refresh = () => page.evaluate(() => {
    document.querySelector('#flowChain .sb-fc-chain').dataset.old = '1';
    D = JSON.parse(JSON.stringify(D));
    rvCalm = true;
    try{ PAGE_DRAWS.filter(r => r[0] && r[0].split(' ').includes('supply/shops')).forEach(r => r[1]()); }
    finally{ rvCalm = false; }
    return !document.querySelector('#flowChain [data-old]');
  });
  assert.equal(await refresh(), true, 'the chain was drawn again');
  assert.equal(await page.locator('#flowChain [data-fc-group="g:dist#6"]').getAttribute('aria-expanded'), 'true');
  assert.equal((await state(page)).pipes.length, 2, 'the pier to the depot, the depot to its group');
  await page.evaluate(() => flowFocus('dist#6'));
  assert.equal(await refresh(), true);
  assert.equal(await page.evaluate(() => flowPickId), 'dist#6');
  assert.match(await page.locator('#flowChain .sb-fc-where').textContent(), /Following Cake Distr\./);
  assert.ok((await state(page)).pipes.length >= 2);
});
