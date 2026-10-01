// Browser regressions: install Playwright and its Chromium browser to run.
// NODE_PATH may point at an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {en, enRe} = require('./_i18n.cjs');
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

async function board(width) {
  const page = await browser.newPage({viewport: {width, height: 1100}});
  // Keep layout deterministic and independent of the font CDN.
  await page.route('https://**', route => route.abort());
  await page.setContent(html, {waitUntil: 'load'});
  await page.evaluate(() => document.body.classList.add('has-board'));
  await page.emulateMedia({reducedMotion: 'reduce'});
  return page;
}

async function factory(page) {
  await page.evaluate(() => {
    const off = 'Mon 12-24; Tue 12-24; Wed 12-24; Thu 12-24; Fri 12-24; Sat 12-24; Sun 12-24';
    const line = {item: 'Clothing (Classic Expensive Male)', slug: 'clothing', basis: 'table',
      workstation: 'Clothing Workstation', slots: [7, 8, 9, 10], machines: 4, rate: 30,
      hoursWeek: 336, fullWeek: 672, gaps: [7, 8, 9, 10].map(slot => ({slot, hours: 84, off})),
      makes: 2880, atRoster: 1440, ships: 1440, stock: 12345, toCity: 1234, toPier: 500};
    D = {meta: {character: 'layout-fixture', locale: true},
      businesses: [{key: 'f0', name: 'Z-Clothing Factory', type: 'Factory', status: 'support', lines: []}],
      supply: {shops: [], idle: [], imports: [], facts: {}, graph: {nodes: [], links: []},
        factories: {sites: [{s: 0, machines: 4, lines: [line], unnamed: [], needs: []}], machines: 4, unnamed: 0}}};
    sbWhich = 'all'; sbMode.production = 'all'; sub.supply = 'production';
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = el.id !== 'secProduction'; });
    document.querySelector('#secProduction').classList.add('measured');
    drawSupplyStrip(); drawProductionView();
  });
  require('./_payload_contract.cjs').assertPayloadShape(await page.evaluate(() => D), 'layout');
}
const LINES = '#secProduction [data-sb-table="factory-lines"] table';

test('table lines show their source and unresolved recipes offer a picker', async () => {
  const page = await board(1280);
  try {
    await factory(page);
    await page.evaluate(() => {
      const f = D.supply.factories;
      f.sites[0].unnamed = [{rid: 'future-id', workstation: 'Clothing Workstation',
        slots: [11], machines: 1, idle: false, hoursWeek: 0, fullWeek: 168, gaps: [],
        candidates: [{slug: 'clothing', item: 'Clothing (Classic Expensive Male)'}]}];
      f.unnamed = 1;
      sbStamp++; drawSupplyStrip(); drawProductionView();
    });
    assert.equal(await page.locator('.linepick').count(), 1);
    assert.equal(await page.locator('.linepick').getAttribute('data-rid'), 'future-id');
    assert.match(await page.locator('#secProduction').innerText(), enRe('sb.line.table'));
    // Pins the wording: obsolete recipe inference terminology must stay absent.
    assert.doesNotMatch(await page.locator('#secProduction').innerText(), /paired|earlier build|named from what they eat/);
    assert.equal(await page.locator('.unname').count(), 0);
  } finally {
    await page.close();
  }
});

test("a factory input's label counts all machines making the same product", async () => {
  const page = await board(1280);
  try {
    await factory(page);
    await page.evaluate(() => {
      const site = D.supply.factories.sites[0];
      site.lines = [{...site.lines[0], machines: 2},
        {...site.lines[0], machines: 3, basis: 'you'}];
      D.supply.factories.machines = 5;
      site.needs = [{item: 'Fabric', slug: 'fabric', lines: [site.lines[0].item], lineSlugs: [site.lines[0].slug],
        perDay: 1200, perWeek: 8400, target: 0, from: null, known: false,
        importWeekly: null, depotNeed: 0, depotStock: 0, status: 'noplan', level: 'critical'}];
      // Python's verdict on the input: on no plan, with the top-up to set.
      D.supply.facts = {[site.s]: {fabric: {st: 'noplan', why: null, lvl: 'critical', role: 'input', cad: 'daily',
        use: 1200, need: 1380, have: 0, setTo: 1380, parts: {lines: 8400, sites: 0, route: 0}}}};
      sbStamp++; drawSupplyStrip(); drawProductionView();
    });
    for (const selector of ['#secProduction [data-sb-table="factory-inputs"]']) {
      assert.match(await page.locator(selector).textContent(), /Clothing \(Classic Expensive Male\) ×5/);
      assert.doesNotMatch(await page.locator(selector).textContent(), /×[23]/);
    }
  } finally { await page.close(); }
});

test('factory metrics fit at desktop widths without crushing line names', async () => {
  for (const width of [1280, 1655, 1920]) {
    const page = await board(width);
    try {
      await factory(page);
      const sizes = await page.evaluate(() => {
        const table = document.querySelector('#secProduction [data-sb-table="factory-lines"] table');
        return {viewport: innerWidth, wrap: document.querySelector('.wrap').clientWidth, side: document.getElementById('mast').offsetWidth,
          table: table.getBoundingClientRect().width, container: table.parentElement.clientWidth,
          line: table.rows[1].cells[1].getBoundingClientRect().width,
          rowHeight: table.rows[1].getBoundingClientRect().height};
      });
      assert.ok(sizes.table <= sizes.container + 1, JSON.stringify(sizes));
      assert.ok(sizes.line >= 220, JSON.stringify(sizes));
      // A column head never takes two lines (Peter's testing, A5).
      const wrapped = await page.evaluate(sel => [...document.querySelectorAll(`${sel} thead th`)].filter(th => {
        const r = document.createRange(); r.selectNodeContents(th);
        return new Set([...r.getClientRects()].filter(x => x.width > 1).map(x => Math.round(x.top))).size > 1;
      }).map(th => th.textContent.trim()), LINES);
      assert.deepEqual(wrapped, [], `${width}px`);
      assert.ok(sizes.rowHeight < 150, JSON.stringify(sizes));
      // The page takes the window beside the sidebar.
      assert.ok(sizes.wrap >= width - sizes.side - 100, JSON.stringify(sizes));
    } finally { await page.close(); }
  }
});

test('planner controls wrap without squeezing the title or overflowing the page', async () => {
  for (const width of [390, 768, 1280, 1655, 1920]) {
    const page = await board(width);
    try {
      await page.evaluate(() => {
        const types = ['Bookstore', 'Cinema', 'Clothing Store', 'Coffee Shop', 'Electronics Store',
          'Fast Food Restaurant', 'Gift Shop', 'Gym', 'Hairdresser', 'Jewelry Store',
          'Liquor Store', 'Nightclub', 'Supermarket'];
        document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageGrowth'; });
        document.querySelectorAll('#pageGrowth section').forEach(el => { el.hidden = el.id !== 'secPlan'; });
        document.querySelector('#secPlan').classList.add('measured');
        document.querySelector('#planNote').textContent = 'also sells Gym Cover Charge as services, which no line makes or stocks';
        document.querySelector('#planPicker').innerHTML = '<span class="seg" id="planTypes"></span>'
          + '<span class="field" style="margin:0"><select aria-label="Another business type"><option>Another type…</option></select></span>';
        seg(document.querySelector('#planTypes'), types.map(x => [x, x]), () => 'Gym', () => {}, () => {});
      });
      const sizes = await page.evaluate(() => {
        const header = document.querySelector('#secPlan > .sechead');
        const title = header.querySelector('h2');
        return {width: innerWidth, titleHeight: title.clientHeight,
          controls: document.querySelector('#planPicker').getBoundingClientRect().right,
          header: header.getBoundingClientRect().right};
      });
      assert.ok(sizes.titleHeight < 30, JSON.stringify(sizes));
      assert.ok(sizes.controls <= sizes.header + 1, JSON.stringify(sizes));
    } finally { await page.close(); }
  }
});

test('each machine says its rostered hours and the hours nobody is on it, escaped', async () => {
  const page = await board(1280);
  try {
    await factory(page);
    const reads = await page.$$eval(`${LINES} .sp-m`, ms => ms.map(m => m.dataset.read));
    assert.equal(reads.length, 4);
    assert.match(reads[0], enRe('sp.mach.read.off2', {slot: 7, hours: 84, of: 168, off: 'Mon 12-24'}, {anchor: 'start'}));
    await page.evaluate(() => {
      D.supply.factories.sites[0].lines[0].gaps[0].off = '<img src=x onerror="alert(1)">';
      sbStamp++; drawSupplyStrip(); drawProductionView();
    });
    const read = await page.$eval(`${LINES} .sp-m`, m => m.dataset.read);
    assert.match(read, /&lt;img src=x/);
    assert.doesNotMatch(read, /<img/);
    const fits = await page.evaluate(sel => {
      const table = document.querySelector(sel);
      return table.getBoundingClientRect().width <= table.parentElement.clientWidth + 1;
    }, LINES);
    assert.ok(fits);
  } finally { await page.close(); }
});

test('narrow screens can scroll the factory table inside its own container', async () => {
  const page = await board(390);
  try {
    await factory(page);
    const sizes = await page.evaluate(() => {
      const container = document.querySelector('#secProduction [data-sb-table="factory-lines"] table').parentElement;
      container.scrollLeft = 10000;
      return {width: container.clientWidth, scroll: container.scrollLeft, right: container.getBoundingClientRect().right};
    });
    assert.ok(sizes.width <= 390 && sizes.right <= 390, JSON.stringify(sizes));
    assert.ok(sizes.scroll > 0, JSON.stringify(sizes));
  } finally { await page.close(); }
});
