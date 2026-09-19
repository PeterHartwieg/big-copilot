// The footer's theme control, against the actual generated page.
//
// The point of the control is what a real browser does with it: an attribute on
// <html>, a remembered choice, and above all no flash of the wrong palette on the
// next visit. None of that survives a stubbed DOM, so these run in Playwright.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');

const FILES = new Set(['/index.html', '/app.js', '/worker.js', '/community.js', '/community.css',
  '/maps/locations.json', '/maps/map-background.svg', '/wiki-data.json']);

/* The page, served from web/ with nothing else reachable. colorScheme is the
   operating system's setting, which "auto" follows and a choice overrides. */
async function open(t, {colorScheme = 'dark'} = {}) {
  const browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, colorScheme});
  const page = await context.newPage();
  page.setDefaultTimeout(0);
  page.setDefaultNavigationTimeout(0);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const name = url.pathname === '/' ? '/index.html' : url.pathname;
    if (url.hostname !== 'theme.test' || !FILES.has(name)) return route.abort();
    return route.fulfill({path: path.join(__dirname, '../web', name)});
  });
  await page.goto('http://theme.test/');
  return {page, errors};
}

const ground = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const attr = page => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const press = (page, mode) => page.locator(`.sf-landing [data-theme-set="${mode}"]`).click();

test('a chosen theme wins over the system setting, and auto gives it back', async t => {
  const {page, errors} = await open(t, {colorScheme: 'dark'});
  const dark = await ground(page);
  assert.equal(await attr(page), null, 'nothing is remembered on a first visit');

  await press(page, 'light');
  assert.equal(await attr(page), 'light');
  const light = await ground(page);
  assert.notEqual(light, dark, 'the palette actually changed');
  // Native widgets have to come along, or a light page keeps dark scrollbars.
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light');

  await press(page, 'dark');
  assert.equal(await attr(page), 'dark');
  assert.equal(await ground(page), dark);

  await press(page, 'auto');
  assert.equal(await attr(page), null, 'auto removes the attribute rather than naming a theme');
  assert.equal(await ground(page), dark, 'and so follows the system setting again');
  assert.deepEqual(errors, []);
});

test('the choice survives a reload without a flash of the system palette', async t => {
  const {page, errors} = await open(t, {colorScheme: 'dark'});
  await press(page, 'light');
  const light = await ground(page);

  // The head's inline script has to win the race against the first paint, and
  // the board's own script at the end of the body is far too late to count. So
  // record who set the attribute first, synchronously, and whether the body had
  // been parsed yet: only a script in the head runs with document.body still
  // null. Anything asynchronous here (readystatechange, a MutationObserver) is
  // delivered after parsing and would pass even with no head script at all.
  // Patched on the prototype, not on documentElement: an init script runs before
  // the document has an <html> at all, so reaching for it there throws.
  await page.addInitScript(() => {
    const setAttribute = Element.prototype.setAttribute;
    window.firstThemeWrite = null;
    Element.prototype.setAttribute = function (name, value) {
      if (name === 'data-theme' && this === document.documentElement && !window.firstThemeWrite) {
        window.firstThemeWrite = {value, beforeBody: document.body === null};
      }
      return setAttribute.call(this, name, value);
    };
  });
  await page.reload();

  assert.equal(await attr(page), 'light', 'the choice is remembered');
  assert.equal(await ground(page), light);
  assert.deepEqual(await page.evaluate(() => window.firstThemeWrite),
    {value: 'light', beforeBody: true},
    'the remembered theme is applied from the head, before the body exists to paint');
  assert.deepEqual(errors, []);
});

test('both footers carry the control and agree on what is pressed', async t => {
  const {page} = await open(t);
  // The landing's footer and the board's are both in the page until the board
  // replaces the landing; a choice made in one has to show in the other.
  assert.equal(await page.locator('[data-theme-set="light"]').count(), 2);
  await press(page, 'light');
  assert.equal(await page.locator('[data-theme-set][aria-pressed="true"]').count(), 2);
  assert.deepEqual(
    await page.locator('[data-theme-set][aria-pressed="true"]').evaluateAll(els => els.map(e => e.dataset.themeSet)),
    ['light', 'light']);
});

test('a blocked localStorage still switches the theme for this page', async t => {
  const {page, errors} = await open(t);
  // Private windows and blocked site data make the accessor itself throw; the
  // theme must still change, and only remembering it may be lost.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {get() { throw new Error('blocked'); }});
  });
  await page.reload();
  await press(page, 'light');
  assert.equal(await attr(page), 'light');
  assert.deepEqual(errors, []);
});
