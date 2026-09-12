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
      hoursWeek: 336, fullWeek: 672, gaps: [7, 8, 9, 10].map(slot => ({slot, off})),
      makes: 2880, atRoster: 1440, ships: 1440, stock: 12345, toCity: 1234, toPier: 500};
    D = {meta: {character: 'layout-fixture'},
      businesses: [{name: 'Z-Clothing Factory', type: 'Factory', lines: []}],
      supply: {factories: {sites: [{s: 0, lines: [line], unnamed: [], needs: []}], machines: 4, unnamed: 0}}};
    stockView = 'lines';
    drawStock();
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = el.id !== 'secStock'; });
    document.querySelector('#secStock').classList.add('measured');
  });
}

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
      drawStock();
    });
    assert.equal(await page.locator('.linepick').count(), 1);
    assert.equal(await page.locator('.linepick').getAttribute('data-rid'), 'future-id');
    assert.match(await page.locator('#secStock').innerText(), /Recipe table/);
    assert.doesNotMatch(await page.locator('#secStock').innerText(), /paired|earlier build|named from what they eat/);
    assert.equal(await page.locator('.unname').count(), 0);
  } finally {
    await page.close();
  }
});

test('feed and top-up labels count all machines making the same product', async () => {
  const page = await board(1280);
  try {
    await factory(page);
    await page.evaluate(() => {
      const site = D.supply.factories.sites[0];
      site.lines = [{...site.lines[0], machines: 2},
        {...site.lines[0], machines: 3, basis: 'you'}];
      D.supply.factories.machines = 5;
      site.needs = [{item: 'Fabric', slug: 'fabric', lines: [site.lines[0].item],
        perDay: 1200, perWeek: 8400, target: 0, from: null, known: false,
        importWeekly: null, depotNeed: 0, depotStock: 0, status: 'unplanned', level: 'critical'}];
      stockView = 'feed';
      drawStock();
      drawLogistics();
    });
    for (const selector of ['#stock', '#topupPlan']) {
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
        const table = document.querySelector('#stock');
        return {viewport: innerWidth, wrap: document.querySelector('.wrap').clientWidth,
          table: table.getBoundingClientRect().width, container: table.parentElement.clientWidth,
          line: table.rows[1].cells[1].getBoundingClientRect().width,
          rowHeight: table.rows[1].getBoundingClientRect().height};
      });
      assert.ok(sizes.table <= sizes.container + 1, JSON.stringify(sizes));
      assert.ok(sizes.line >= 220, JSON.stringify(sizes));
      assert.ok(sizes.rowHeight < 150, JSON.stringify(sizes));
      assert.ok(sizes.wrap >= width - 100, JSON.stringify(sizes));
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

test('off-hours disclosure works by keyboard and keeps every machine without widening the table', async () => {
  const page = await board(1280);
  try {
    await factory(page);
    const summary = page.locator('#stock .staff-hours summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#stock details').getAttribute('open'), '');
    const details = await page.locator('#stock .staff-gaps').innerText();
    assert.match(details, /Machines #7, #8, #9, #10 off/);
    assert.equal((details.match(/Mon 12-24/g) || []).length, 1);
    const fits = await page.evaluate(() => {
      const table = document.querySelector('#stock');
      return table.getBoundingClientRect().width <= table.parentElement.clientWidth + 1;
    });
    assert.ok(fits);
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#stock details').getAttribute('open'), null);
  } finally { await page.close(); }
});

test('staffing handles full coverage, missing details, distinct schedules, and escaped text', async () => {
  const page = await board(1280);
  try {
    const rendered = await page.evaluate(() => ({
      none: staffCell({}),
      full: staffCell({fullWeek: 168, hoursWeek: 168}),
      missing: staffCell({fullWeek: 168, hoursWeek: 84}),
      mixed: staffCell({fullWeek: 168 * 5, hoursWeek: 400, gaps: [
        {slot: 1, off: 'Mon-Sun 12-24'}, {slot: 2, off: 'Tue 14-24'},
        {slot: 3, off: 'Mon-Sun 12-24'}, {slot: 4, off: 'Wed 8-24'},
        {slot: 5, off: '<img src=x onerror="alert(1)">'},
      ]}),
    }));
    assert.equal(rendered.none, '—');
    assert.match(rendered.full, /100%/);
    assert.doesNotMatch(rendered.full, /details/);
    assert.match(rendered.missing, /50%/);
    assert.match(rendered.mixed, /Machines #1, #3 off Mon-Sun 12-24/);
    assert.match(rendered.mixed, /Machine #2 off Tue 14-24/);
    assert.match(rendered.mixed, /Machine #4 off Wed 8-24/);
    assert.match(rendered.mixed, /Machine #5 off &lt;img/);
    assert.doesNotMatch(rendered.mixed, /<img/);
  } finally { await page.close(); }
});

test('narrow screens can scroll the factory table inside its own container', async () => {
  const page = await board(390);
  try {
    await factory(page);
    const sizes = await page.evaluate(() => {
      const container = document.querySelector('#stock').parentElement;
      container.scrollLeft = 10000;
      return {width: container.clientWidth, scroll: container.scrollLeft, right: container.getBoundingClientRect().right};
    });
    assert.ok(sizes.width <= 390 && sizes.right <= 390, JSON.stringify(sizes));
    assert.ok(sizes.scroll > 0, JSON.stringify(sizes));
  } finally { await page.close(); }
});
