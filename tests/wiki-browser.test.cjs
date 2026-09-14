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

async function fixture(t, {hash='', width=1280, theme='dark', motion='reduce', changeData} = {}) {
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
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if(url.hostname !== 'wiki.test') return route.abort();
    if(url.pathname.startsWith('/api/')) return route.fulfill({contentType:'application/json',body:JSON.stringify({features:[],online:0})});
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const target = path.resolve(root, name);
    if(!target.startsWith(root + path.sep) || !fs.existsSync(target)) return route.abort();
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

test('a selected graph survives resizing and parks its ball after clearing', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop', motion:'no-preference'});
  const product = page.getByRole('button', {name:'Gift (Cheap)',exact:true});
  await product.click();
  await page.waitForFunction(() => document.querySelectorAll('#wikiGraph path.lit').length === 5);
  await page.setViewportSize({width:1100,height:900});
  await page.waitForFunction(() => document.querySelectorAll('#wikiGraph path.lit').length === 5);
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
      overflow:document.documentElement.scrollWidth > innerWidth,
      rows:[...document.querySelectorAll('#nav a[data-id]')].map(el=>Math.round(el.getBoundingClientRect().top)),
    }));
    assert.equal(geometry.overflow, false, `${width}px ${theme} overflow`);
    assert.equal(new Set(geometry.rows).size, 1, `${width}px ${theme} nav wraps`);
    await page.getByRole('button', {name:'Gift (Cheap)',exact:true}).click();
    assert.equal(await page.locator('#wikiGraph .wk-wires path').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('unknown recipe output and wholesale availability stay unknown', async t => {
  const {page, errors} = await fixture(t, {hash:'#wiki/businesstypes-giftshop',changeData:data=>{
    data.sample.PRODUCTS.cheapgift.wholesale = null;
    data.sample.RECIPES.cheapgiftrecipe.out.per = null;
  }});
  await page.getByRole('heading', {name:'Gift Shop',exact:true,level:1}).waitFor();
  const card = page.locator('.wk-card').filter({has:page.getByRole('heading',{name:'Gift (Cheap)',exact:true})});
  assert.doesNotMatch(await card.innerText(), /No wholesaler|cannot/i);
  assert.doesNotMatch(await page.locator('#wikiRoot').innerText(), /\b0\/(?:h|day)\b/);
  assert.deepEqual(errors, []);
});
