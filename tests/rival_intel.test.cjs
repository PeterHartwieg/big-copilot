// Expansion › Rivals (docs/rival-intel-scope.md): the board's page over the
// rivalIntel section. The CLI board of a committed snapshot company, with a
// synthetic rivalIntel of two rivals put in its place, so the page is tested
// on its own shape and not on what the extraction makes of a save: the
// picker's order, the top product, your price beside its, a shop opening to
// its products, the history filter, and the wait while the section is
// worked out. Install Playwright and its Chromium browser to run; NODE_PATH
// may point at an existing installation.
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./_page.cjs');
const {en} = require('./_i18n.cjs');

const browser = H.suiteBrowser();
const fixture = path.join(__dirname, 'fixtures/payload_snapshot/data_day40.json');

const NAMES = {
  'ba:itemname_burger': 'Burger', 'ba:itemname_soda': 'Soda', 'ba:itemname_coffee': 'Coffee',
};
const RIVAL_INTEL = {
  day: 40,
  rivals: [
    {number: 4, name: 'Northwind Retail', weekly: 52000, shops: 2, buildings: 1, top: 'ba:itemname_burger',
      products: [
        {item: 'ba:itemname_burger', revenueShare: 60, marginShare: 45, revenue: 900, margin: 400, shops: 2,
          price: 5.5, yourPrice: 4.75, defended: false},
        {item: 'ba:itemname_soda', revenueShare: 40, marginShare: 55, revenue: 600, margin: 250, shops: 1,
          price: 2.25, yourPrice: null, defended: true},
      ],
      sites: [
        {address: '12 Harbor Street', hood: 'ba:neighborhood_midtown', type: 'ba:businesstype_fastfoodrestaurant',
          name: 'Northwind Burgers', opened: 31, daily: 1100,
          products: [{item: 'ba:itemname_burger', revenueShare: 70, marginShare: 60, revenue: 770, margin: 330,
            price: 5.5, yourPrice: 4.75, defended: false},
          {item: 'ba:itemname_soda', revenueShare: 30, marginShare: 40, revenue: 330, margin: 120, price: 2.25, yourPrice: null, defended: true}]},
        {address: '3 Tenth Avenue', hood: 'ba:neighborhood_midtown', type: 'ba:businesstype_fastfoodrestaurant',
          name: 'Northwind Express', opened: 35, daily: 400,
          products: [{item: 'ba:itemname_burger', revenueShare: 100, marginShare: 100, revenue: 400, margin: 200,
            price: 5.5, yourPrice: 4.75, defended: false}]},
      ]},
    {number: 9, name: null, weekly: 30000, shops: 1, buildings: 0, top: 'ba:itemname_coffee',
      products: [{item: 'ba:itemname_coffee', revenueShare: 100, marginShare: 100, revenue: null, margin: null, shops: 1,
        price: 3, yourPrice: 2.5, defended: false}],
      sites: [{address: '8 Bowery', hood: 'ba:neighborhood_midtown', type: 'ba:businesstype_coffeeshop',
        name: 'Bean There', opened: 20, daily: 600,
        products: [{item: 'ba:itemname_coffee', revenueShare: 100, marginShare: 100, revenue: null, margin: null,
          price: 3, yourPrice: 2.5, defended: false}]}]},
  ],
  events: [
    {day: 40, kind: 'opened', rival: 4, rivalName: 'Northwind Retail', business: 'Northwind Express',
      type: 'ba:businesstype_fastfoodrestaurant', address: '3 Tenth Avenue', hood: 'ba:neighborhood_midtown'},
    {day: 38, kind: 'closed', rival: 9, rivalName: null, business: 'Bean Gone',
      type: 'ba:businesstype_coffeeshop', address: '1 Bowery', hood: 'ba:neighborhood_midtown'},
    {day: 31, kind: 'opened', rival: 4, rivalName: 'Northwind Retail', business: 'Northwind Burgers',
      type: 'ba:businesstype_fastfoodrestaurant', address: '12 Harbor Street', hood: 'ba:neighborhood_midtown'},
  ],
};

/* The section is known to the board whether or not this checkout's Python
   declares it yet; the page then reads it as any other. */
const declare = `if(!OD_SECTIONS.rivalIntel) OD_SECTIONS.rivalIntel = {keys: ["rivalIntel"], needs: []};`;

async function board(t){
  const {page} = await H.openPage(t, await browser(), {
    html: H.boardHtml(fixture), hash: '#expansion/rivals', viewport: {width: 1280, height: 1000}, reducedMotion: 'reduce',
  });
  await page.evaluate(`${declare}
    Object.assign(D.names = D.names || {}, ${JSON.stringify(NAMES)});
    D.rivalIntel = ${JSON.stringify(RIVAL_INTEL)};
    openRoute("expansion/rivals"); drawRivals(); wireAll();`);
  return page;
}

const productRows = page => page.locator('#secRivals > .scrollx .rv-t tbody tr');

test('the picker follows the leaderboard and the first rival is chosen', async t => {
  const page = await board(t);
  assert.equal(await page.evaluate(() => route), 'expansion/rivals');
  assert.equal(await page.locator('#secRivals').isVisible(), true);
  const who = page.locator('#secRivals .rv-who');
  assert.equal(await who.count(), 2);
  const first = await who.nth(0).innerText(), second = await who.nth(1).innerText();
  assert.match(first, /Northwind Retail/);
  assert.ok(first.includes(en('gr.rivals.weekly', {w: 52000})), first);
  assert.ok(first.includes(en('gr.rivals.shops', {n: 2})) && first.includes(en('gr.rivals.buildings', {n: 1})), first);
  assert.ok(second.includes(en('gr.rivals.n', {n: 9})), 'a rival with no name is Rival N');
  assert.equal(await who.nth(0).getAttribute('aria-pressed'), 'true');
  assert.equal(await who.nth(1).getAttribute('aria-pressed'), 'false');
});

test('products run highest revenue first, the top one marked, with your price beside its', async t => {
  const page = await board(t);
  const rows = productRows(page);
  assert.equal(await rows.count(), 2);
  assert.deepEqual(await rows.evaluateAll(rs => rs.map(r => r.dataset.rvItem)), ['ba:itemname_burger', 'ba:itemname_soda']);
  const top = await rows.nth(0).innerText();
  assert.match(top, /Burger/);
  assert.ok(top.includes(en('gr.rivals.top')), 'the top row says where a price cut hurts most');
  assert.ok(!(await rows.nth(1).innerText()).includes(en('gr.rivals.top')), 'only the top row');
  assert.equal(await rows.nth(0).locator('td').nth(3).innerText(), '$900');
  assert.equal(await rows.nth(0).locator('.rv-yours').innerText(), en('gr.rivals.price', {p: 4.75}));
  assert.equal(await rows.nth(1).locator('.rv-yours').innerText(), '—', 'a product you do not sell');
  assert.ok((await rows.nth(1).innerText()).includes(en('gr.rivals.defended')));
  assert.equal(await rows.nth(0).locator('.rv-bar i').getAttribute('style'), 'width:60.0%');
});

test('picking the other rival redraws its products, and unknown dollars stay blank', async t => {
  const page = await board(t);
  await page.locator('#secRivals .rv-who').nth(1).click();
  assert.equal(await page.locator('#secRivals .rv-who').nth(1).getAttribute('aria-pressed'), 'true');
  const rows = productRows(page);
  assert.equal(await rows.count(), 1);
  assert.match(await rows.nth(0).innerText(), /Coffee/);
  assert.equal(await rows.nth(0).locator('td').nth(3).innerText(), '—');
  assert.equal(await rows.nth(0).locator('.rv-yours').innerText(), en('gr.rivals.price', {p: 2.5}));
});

test('shops are collapsed, and one opens to its own products', async t => {
  const page = await board(t);
  const sites = page.locator('#secRivals .rv-site');
  assert.equal(await sites.count(), 2);
  assert.equal(await sites.nth(0).evaluate(d => d.open), false);
  assert.match(await sites.nth(0).locator('summary').innerText(), /Northwind Burgers/);
  await sites.nth(0).locator('summary').click();
  await page.waitForFunction(() => document.querySelector('#secRivals .rv-site .rv-t'));
  const inner = sites.nth(0).locator('.rv-t tbody tr');
  assert.equal(await inner.count(), 2);
  assert.equal(await inner.nth(0).locator('.rv-yours').innerText(), en('gr.rivals.price', {p: 4.75}));
  // Kept open across a redraw.
  await page.evaluate(() => drawRivals());
  assert.equal(await page.locator('#secRivals .rv-site').nth(0).evaluate(d => d.open), true);
});

test('the history is newest first and filters to the chosen rival', async t => {
  const page = await board(t);
  const items = page.locator('#secRivals .rv-log li');
  assert.equal(await items.count(), 3);
  assert.deepEqual(await items.evaluateAll(ls => ls.map(l => l.dataset.rvEvent)), ['opened', 'closed', 'opened']);
  assert.ok((await items.nth(0).innerText()).includes(en('gr.rivals.day', {d: 40})));
  assert.ok((await items.nth(1).innerText()).includes(en('gr.rivals.n', {n: 9})));
  await page.locator('#secRivals [data-rv-hist="one"]').click();
  assert.equal(await items.count(), 2);
  assert.deepEqual(await items.evaluateAll(ls => ls.map(l => l.dataset.rvOf)), ['4', '4']);
  await page.locator('#secRivals .rv-who').nth(1).click();
  assert.equal(await items.count(), 1, 'the filter follows the rival picked');
  assert.match(await items.nth(0).innerText(), /Bean Gone/);
  await page.locator('#secRivals [data-rv-hist="all"]').click();
  assert.equal(await items.count(), 3);
});

test('while the section is worked out the page waits, then draws it', async t => {
  const stub = `<script>
    window.riAsked = [];
    window.LEDGER_SOURCE = {label: 'Live', data: async () => null, name: async () => null, watch() {},
      section: (name, gen) => new Promise(resolve => { riAsked.push(name);
        window.riRelease = () => resolve({sections: {rivalIntel: {rivalIntel: ${JSON.stringify(RIVAL_INTEL)}}}}); })};
    </script>`;
  const {page} = await H.openPage(t, await browser(), {html: H.boardHtml(fixture).replace('<title>', stub + '<title>'),
    viewport: {width: 1280, height: 1000}, reducedMotion: 'reduce'});
  await page.evaluate(`${declare}
    Object.assign(D.names = D.names || {}, ${JSON.stringify(NAMES)});
    const en = D[GN_SRC] || D, gen = Symbol.for("bigcopilot.build");
    delete en.rivalIntel; delete D.rivalIntel; en[gen] = 7; D[gen] = 7;
    openRoute("expansion/rivals");`);
  await page.waitForFunction(() => window.riAsked.includes('rivalIntel'));
  const wait = page.locator('#secRivals .od-wait');
  assert.equal(await wait.count(), 1);
  assert.equal(await wait.innerText(), en('nav.od.rivalIntel'));
  assert.equal(await page.locator('#secRivals .rv-who').count(), 0, 'nothing is drawn as if there were no rivals');
  await page.evaluate(() => window.riRelease());
  await page.waitForFunction(() => document.querySelectorAll('#secRivals .rv-who').length === 2);
  assert.equal(await page.locator('#secRivals .od-wait').count(), 0);
});

test('a share outside 0–100 is printed as it is, with only its bar held to the box', async t => {
  const page = await board(t);
  await page.evaluate(() => {
    const p = D.rivalIntel.rivals[0].products;
    p[0].marginShare = 133.3; p[1].marginShare = -33.3;
    p[0].revenueShare = 120; p[1].revenueShare = -20;
    drawRivals();
  });
  const rows = productRows(page);
  assert.equal(await rows.nth(0).locator('td').nth(2).innerText(), en('gr.rivals.pct', {p: 133.3}));
  assert.equal(await rows.nth(1).locator('td').nth(2).innerText(), en('gr.rivals.pct', {p: -33.3}));
  assert.ok((await rows.nth(0).innerText()).includes(en('gr.rivals.pct', {p: 120})));
  assert.equal(await rows.nth(0).locator('.rv-bar i').getAttribute('style'), 'width:100.0%');
  assert.equal(await rows.nth(1).locator('.rv-bar i').getAttribute('style'), 'width:0.0%');
});

test('a withheld company total and a shop the save cannot split say so, not that nothing sells', async t => {
  const page = await board(t);
  await page.evaluate(() => {
    const r = D.rivalIntel.rivals[0];
    r.products = []; r.top = null; r.sites[1].products = [];
    drawRivals();
  });
  const empty = page.locator('#secRivals > .rv-empty');
  assert.equal(await empty.innerText(), `${en('gr.rivals.withheld')} ${en('gr.rivals.withheld.open')}`);
  const sites = page.locator('#secRivals .rv-site');
  await sites.nth(1).locator('summary').click();
  await page.waitForFunction(() => document.querySelectorAll('#secRivals .rv-site')[1].querySelector('.rv-empty'));
  assert.equal(await sites.nth(1).locator('.rv-empty').innerText(), en('gr.rivals.unknownSplit'));
  // The other shop still shows your price on its own rows.
  await sites.nth(0).locator('summary').click();
  await page.waitForFunction(() => document.querySelector('#secRivals .rv-site .rv-t'));
  assert.equal(await sites.nth(0).locator('.rv-yours').first().innerText(), en('gr.rivals.price', {p: 4.75}));
});

test('picking a rival or a history filter keeps the keyboard focus on that control', async t => {
  const page = await board(t);
  await page.locator('#secRivals .rv-who').nth(1).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.rvRival), '9');
  await page.locator('#secRivals [data-rv-hist="one"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.rvHist), 'one');
});

test('a rival with no shops says so once, not that its split is missing', async t => {
  const page = await board(t);
  await page.evaluate(() => {
    const r = D.rivalIntel.rivals[1];
    r.sites = []; r.products = []; r.shops = 0; r.top = null;
    drawRivals();
  });
  await page.locator('#secRivals .rv-who').nth(1).click();
  const empty = page.locator('#secRivals > .rv-empty');
  assert.equal(await empty.count(), 1);
  assert.equal(await empty.innerText(), en('gr.rivals.noShops'));
  assert.equal(await page.locator('#secRivals .rv-h').count(), 0);
});

test('a save with no rivals has no filter to a rival', async t => {
  const page = await board(t);
  await page.evaluate(() => { D.rivalIntel.rivals = []; drawRivals(); });
  assert.equal(await page.locator('#secRivals [data-rv-hist]').count(), 0);
  assert.equal(await page.locator('#secRivals .rv-log li').count(), 3);
});
