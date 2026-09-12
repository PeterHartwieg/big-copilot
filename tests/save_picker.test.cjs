const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
let browser;
before(async () => { browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL}); });
after(async () => { await browser?.close(); });

async function fixture(width = 1280, theme = 'dark') {
  const page = await browser.newPage({viewport:{width, height:900}});
  await page.route('https://**', route => route.abort());
  await page.route('http://save-picker.test/', route => route.fulfill({contentType:'text/html', body:html}));
  await page.goto('http://save-picker.test/');
  await page.evaluate(theme => {
    document.documentElement.dataset.theme = theme;
    window.buildRequests = [];
    // Exercise the real import/menu wiring without starting the Python reader.
    window.Worker = class {
      postMessage(message) {
        window.buildRequests.push(message.name);
        queueMicrotask(() => this.onmessage({data:{id:message.id, kind:'built', history:'{}', data:JSON.stringify({meta:{save:'Harbor & Co'}})}}));
      }
    };
  }, theme);
  await page.addScriptTag({path:path.join(root, 'web/app.js')});
  await page.evaluate(() => window.dispatchEvent(new Event('DOMContentLoaded')));
  await loadFiles(page);
  await page.locator('#menuBtn').click();
  return page;
}

async function loadFiles(page, count = 12) {
  await page.evaluate(count => {
    const files = [];
    for (let i = 0; i < count; i++) {
      const dir = i < 8 ? 'harbor' : 'avery';
      const name = i === 0 ? 'Before the big expansion.hsg' : `Recover #${i}.hsg`;
      const lastModified = Date.UTC(2026, 8, 12, 10, 30 - i * 5);
      const add = (filename, content) => {
        const file = new File([content], filename, {lastModified});
        Object.defineProperty(file, 'webkitRelativePath', {value:`Saves/${dir}/${filename}`});
        files.push(file);
      };
      add(name, 'fixture');
      add(name + '.meta', JSON.stringify({characterData:{name:dir === 'harbor' ? 'Harbor & Co' : 'Avery'}, day:142 - i, isRecoverSave:i !== 0}));
    }
    const input = document.getElementById('folderPick');
    Object.defineProperty(input, 'files', {value:files, configurable:true});
    input.dispatchEvent(new Event('change'));
  }, count);
  await page.waitForFunction(() => document.body.classList.contains('has-board') && document.getElementById('srcStatus').textContent === 'Up to date');
}

test('save picker supports keyboard selection, dismissal and the saved preference', async () => {
  const page = await fixture();
  try {
    const trigger = page.locator('.save-trigger');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('[role="option"][aria-selected="true"]').textContent(), 'Newest save anywhereFollow the latest across all characters');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ledger_pick'))), {dir:'harbor', name:''});
    await trigger.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => buildRequests.at(-1) === 'Recover #11.hsg');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ledger_pick'))), {dir:'avery', name:'Recover #11.hsg'});
    await trigger.click();
    await page.keyboard.press('Home');
    await page.keyboard.type('Before');
    assert.match(await page.evaluate(() => document.activeElement.textContent), /^Before the big expansion/);
    await page.keyboard.press('Escape');
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.ok(await page.locator('#srcMenu').evaluate(el => el.classList.contains('open')));
    assert.ok(await trigger.evaluate(el => el === document.activeElement));
    await trigger.click();
    await page.keyboard.press('Tab');
    assert.ok(await page.locator('#folderBtn').evaluate(el => el === document.activeElement));
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await trigger.click();
    await page.locator('#menuBtn').click();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  } finally { await page.close(); }
});

test('save refresh retains open-list focus and falls back when a character disappears', async () => {
  const page = await fixture();
  try {
    await page.locator('.save-trigger').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => buildRequests.at(-1) === 'Recover #11.hsg');
    await page.locator('.save-trigger').click();
    await loadFiles(page);
    assert.equal(await page.locator('.save-trigger').getAttribute('aria-expanded'), 'true');
    assert.match(await page.evaluate(() => document.activeElement.textContent), /^Autosave 11/);
    await loadFiles(page, 3);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('ledger_pick'))), {dir:'', name:''});
    assert.equal(await page.locator('[aria-selected="true"]').count(), 1);
    await loadFiles(page, 1);
    assert.equal(await page.locator('.save-picker').isVisible(), false);
  } finally { await page.close(); }
});

test('save menu fits mobile and desktop in both themes, with scrollable saves', async () => {
  for (const width of [390, 1280]) for (const theme of ['dark', 'light']) {
    const page = await fixture(width, theme);
    try {
      await page.locator('.save-trigger').click();
      const size = await page.locator('.save-options').evaluate(el => {
        const rect = el.getBoundingClientRect();
        return {left:rect.left, right:rect.right, width:innerWidth, client:el.clientHeight, scroll:el.scrollHeight,
          bg:getComputedStyle(el).backgroundColor, expected:getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()};
      });
      assert.ok(size.left >= 0 && size.right <= size.width, JSON.stringify(size));
      assert.ok(size.scroll > size.client, JSON.stringify(size));
      assert.equal(size.bg, theme === 'dark' ? 'rgb(21, 25, 23)' : 'rgb(253, 253, 251)');
      if (process.env.SAVE_PICKER_SCREENSHOT_DIR) {
        await page.screenshot({path:path.join(process.env.SAVE_PICKER_SCREENSHOT_DIR, `save-picker-${theme}-${width}.png`)});
      }
    } finally { await page.close(); }
  }
});
