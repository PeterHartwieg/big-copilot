// A factory line's use against what it makes (issue #145): the Sold / day
// column, the production status ("short: needs N more machines") and the
// ingredient status, each its own chip, on Supply › Production and on the
// factory page. Runs on the synthetic R8 fixture (tests/fixtures/r8_supply.json),
// never a save.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {en, enRe} = require('./_i18n.cjs');
// The column heads and status words, from the catalogue (tests/_i18n.cjs).
const SOLD = en('sb.col.sold'), MAKES = en('sb.col.makes'), SHIPS = en('sb.col.ships');
const MORE1 = en('sb.word.short.machines', {n: 1});
const ORDER = en('sb.word.short.order'), HOURS = en('sb.word.short.hours');
const root = path.join(__dirname, '..');
const FIXTURE = path.join(root, 'tests', 'fixtures', 'r8_supply.json');
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
let browser, html;
before(async () => {
  if(process.env.BOARD_TARGET === 'web') html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  else {
    const result = spawnSync(process.env.PYTHON || 'python',
      ['-c', 'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
      {cwd: root, maxBuffer: 16 * 1024 * 1024});
    assert.equal(result.status, 0, result.stderr?.toString());
    html = result.stdout.toString();
  }
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => { await browser?.close(); });

/* Supply › Production drawn from `data`, under `which` (all or changes). */
async function board(data, {which = 'all', mode = 'cap'} = {}){
  require('./_payload_contract.cjs').assertPayloadShape(data, 'factory_use');
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}});
  await page.route('https://**', route => route.abort());
  await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
  await page.goto('http://board.test/');
  await page.evaluate(([data, which, mode]) => {
    D = data; sizing = mode; sbWhich = which; sbMode.imports = sbMode.deliveries = sbMode.production = which;
    supplySort = {}; sbSelOff = true; sbSel = null; sub.supply = 'production';
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    drawSupplyStrip(); drawProductionView(); wireAll();
  }, [data, which, mode]);
  return page;
}
const LINES = '#secProduction [data-sb-table="factory-lines"]';
const heads = page => page.$$eval(`${LINES} thead th`, ths => ths.map(th => th.textContent.trim()));
/* A line row's cells by header, and its status chips: word and tip. */
const line = (page, slug) => page.$eval(`${LINES} tr[data-slug="${slug}"]`, (tr, sel) => {
  const names = [...document.querySelector(`${sel} thead tr`).cells].map(th => th.textContent.trim());
  const cells = Object.fromEntries([...tr.cells].map((c, i) => [names[i], c.textContent.replace(/\s+/g, ' ').trim()]));
  const chips = [...tr.querySelectorAll('td.st .sb-v')].map(v => ({word: v.textContent.trim(), tip: v.dataset.tip || '', cls: v.className}));
  return {cells, chips};
}, LINES);

/* The bread line short of a machine: its shops sell 1,000 a day, 1,150 with
   the margin, and two machines make 960 round the clock. */
function shortOfMachines(data){
  const bread = data.supply.factories.sites[0].lines.find(l => l.slug === 'bread');
  Object.assign(bread, {soldDay: 1000, needDay: 1150,
    production: {status: 'short', level: 'critical', more: 1, makesWith: 1440}});
  return data;
}

test('Sold / day sits beside Makes and Ships, from soldDay, on both pages', async () => {
  const page = await board(fixture());
  try {
    const cols = await heads(page);
    const at = cols.indexOf(SOLD);
    assert.ok(at > cols.indexOf(MAKES) && at < cols.indexOf(SHIPS), cols.join(' | '));
    assert.equal((await line(page, 'cake')).cells[SOLD], '170');
    assert.equal((await line(page, 'bread')).cells[SOLD], '826');
    assert.match(await page.$eval(`${LINES} thead th:nth-child(${at + 1})`, th => th.dataset.tip || th.title || th.innerHTML),
      enRe('sb.col.sold.tip'));
    // The factory page draws the same column.
    const panel = await page.evaluate(() => {
      const el = document.createElement('div');
      el.innerHTML = spLines(D.supply.factories.sites[0]);
      const head = [...el.querySelectorAll('.sp-head span')].map(s => s.textContent.trim());
      const rows = [...el.querySelectorAll('.sp-line:not(.sp-head)')].map(r => [...r.children].map(c => c.textContent.trim()));
      return {head, rows};
    });
    const sold = panel.head.indexOf(en('sp.lines.col.sold'));
    assert.ok(sold > panel.head.indexOf(en('sp.lines.col.makes')), panel.head.join(' | '));
    assert.equal(panel.rows[0][sold], '170');
  } finally { await page.close(); }
});

test('a line short of production reads short with the machine count, and is counted', async () => {
  for(const which of ['all', 'changes']){
    const page = await board(shortOfMachines(fixture()), {which});
    try {
      const bread = await line(page, 'bread');
      const prod = bread.chips.find(c => enRe('sb.word.short.machines').test(c.word));
      assert.ok(prod, JSON.stringify(bread.chips));
      assert.equal(prod.word, MORE1);
      assert.match(prod.cls, /\bbad\b/);
      assert.match(prod.tip, enRe('sb.line.machines.tip', {n: 1, makes: 1440, need: 1150}));
      assert.match(bread.cells[SOLD], new RegExp('^1,000 ?' + enRe('sb.line.needDay', {n: 1150}).source + '$'));
      // Its hours are covered, but a covered chip beside short reads as a
      // contradiction: the production chip stands alone.
      assert.ok(!bread.chips.some(c => c.word === en('sb.word.covered')), JSON.stringify(bread.chips));
      // No chip on a factory row reads a bare "short".
      assert.ok(!bread.chips.some(c => c.word === en('sb.word.short')), JSON.stringify(bread.chips));
      // The view's verdict (its tab's tip) counts the line.
      assert.match(await page.evaluate(() => viewTips['supply/production'] || ''),
        enRe('sb.fac.machines', {n: 1}));
    } finally { await page.close(); }
  }
  // Both sizings read it: what is sold does not depend on the basis.
  const dem = await board(shortOfMachines(fixture()), {mode: 'dem'});
  try {
    assert.ok((await line(dem, 'bread')).chips.some(c => c.word === MORE1));
  } finally { await dem.close(); }
  // An hours problem that is short still shows beside it.
  const data = shortOfMachines(fixture());
  Object.assign(data.supply.factories.sites[0].lines.find(l => l.slug === 'bread'), {status: 'short', why: 'hours', level: 'warn', hoursNow: 12});
  const both = await board(data);
  try {
    const words = (await line(both, 'bread')).chips.map(c => c.word);
    assert.ok(words.includes(HOURS) && words.includes(MORE1), words.join(' | '));
  } finally { await both.close(); }
});

test('a factory with a line critically short of machines opens, and its head says so', async () => {
  // Nothing else to read: every input covered, the cake's hours covered, so
  // there is no change to type and no other critical row.
  const data = shortOfMachines(fixture());
  for(const fact of Object.values(data.supply.facts['1'])){
    if(fact.st === 'made') continue;
    Object.assign(fact, {st: 'covered', why: null, lvl: 'ok', setTo: null});
    delete fact.dem;
  }
  Object.assign(data.supply.factories.sites[0].lines.find(l => l.slug === 'cake'),
    {status: 'covered', why: null, level: 'ok', hoursNow: 24, hoursWeek: 336, gaps: []});
  const page = await board(data, {which: 'changes'});
  try {
    const obj = await page.$eval('#secProduction details.sb-obj', d => ({
      open: d.open, head: d.querySelector('summary').textContent.replace(/\s+/g, ' ')}));
    assert.ok(obj.open, JSON.stringify(obj));
    assert.match(obj.head, enRe('sb.fac.machines.chip', {n: 1}));
    // The head's chip has a tip of its own, counting the lines.
    assert.match(await page.$eval('#secProduction details.sb-obj summary .sb-v', v => v.dataset.tip),
      enRe('sb.fac.machines.chip.tip', {n: 1}, {anchor: 'start'}));
  } finally { await page.close(); }
});

test('the factory page and the head name the line furthest short of machines: critical first', async () => {
  // Cake comes first in the list and has more machines to add, but only the
  // margin is past it (warn); Bread, second, is critical, so Bread is named.
  const data = shortOfMachines(fixture());
  const site = data.supply.factories.sites[0];
  assert.equal(site.lines[0].slug, 'cake');
  Object.assign(site.lines[0], {soldDay: 900, needDay: 1035,
    production: {status: 'short', level: 'warn', more: 3, makesWith: 1200}});
  site.needs.find(n => n.slug === 'flour').item = 'Flour & Salt';
  Object.assign(data.supply.facts['1'].flour, {st: 'short', why: 'order', lvl: 'critical', cad: 'weekly'});
  const page = await board(data);
  try {
    const got = await page.evaluate(orderShort => {
      const site = D.supply.factories.sites[0];
      const el = document.createElement('div');
      el.innerHTML = spLines(site);
      const row = [...el.querySelectorAll('.sp-line:not(.sp-head)')].find(r => r.textContent.includes('Bread'));
      const order = [...row.querySelectorAll('.chip')].find(c => c.textContent.trim() === orderShort);
      return {read: spLinesRead(site), tip: order.dataset.tip,
        head: sbProdWorst(sbData().f.sites[0].lines.map(l => ({...l, prod: sbProdFact(l)}))).item};
    }, ORDER);
    assert.match(got.read, enRe('sp.lines.machines', {item: 'Bread', n: 1, need: '1,150'}));
    assert.equal(got.head, 'Bread');
    // The head's chip takes the critical line's colour.
    assert.match(await page.$eval('#secProduction details.sb-obj summary .sb-v', v => v.className), /\bbad\b/);
    assert.equal(got.tip, en('sb.line.inputs.tip', {items: 'Flour & Salt'}));
  } finally { await page.close(); }
});

test('an order short and a production short on one line are two separate statuses', async () => {
  const data = shortOfMachines(fixture());
  // Flour, which the bread line eats, comes on an import order that does not
  // bring the week it has to cover.
  Object.assign(data.supply.facts['1'].flour, {st: 'short', why: 'order', lvl: 'critical', cad: 'weekly'});
  delete data.supply.facts['1'].flour.dem;
  const page = await board(data);
  try {
    const bread = await line(page, 'bread');
    const words = bread.chips.map(c => c.word);
    assert.ok(words.includes(MORE1), words.join(' | '));
    assert.ok(words.includes(ORDER), words.join(' | '));
    const order = bread.chips.find(c => c.word === ORDER);
    assert.match(order.tip, enRe('sb.line.inputs.tip', {items: 'Flour'}));
    // The input's own row names its subject too.
    const flour = await page.$eval('#secProduction [data-sb-table="factory-inputs"] tr[data-slug="flour"] td.st .sb-v', v => v.textContent.trim());
    assert.equal(flour, ORDER);
    // The factory page shows the same two chips on the line.
    const chips = await page.evaluate(() => {
      const el = document.createElement('div');
      el.innerHTML = spLines(D.supply.factories.sites[0]);
      const row = [...el.querySelectorAll('.sp-line:not(.sp-head)')].find(r => r.textContent.includes('Bread'));
      return [...row.querySelectorAll('.chip')].map(c => c.textContent.trim());
    });
    assert.deepEqual(chips, [MORE1, ORDER]);
  } finally { await page.close(); }
});
