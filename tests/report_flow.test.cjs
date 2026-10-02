// The bug report form in the built page: a failed read offers it, it keeps the
// failed save and the whole traceback, sends only what is ticked, and points to
// the Discord channel when the API cannot take the report. The real
// web/index.html, web/app.js and web/report.js run against a stand-in reader
// and a stubbed /api/report; nothing reaches GitHub. Run
// `python build_web.py --assemble` first.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {en} = require('./_i18n.cjs');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const files = {
  '/': ['text/html', read('web/index.html')],
  '/app.js': ['application/javascript', read('web/app.js')],
  '/report.js': ['application/javascript', read('web/report.js')],
  '/report.css': ['text/css', read('web/report.css')],
};
const SAVE = Buffer.from([31, 139, 8, 0, 0x42, 0x43, 0x44, 0x45]);
const SAVE_NAME = 'Alice Smith-live.hsg';
const TRACE = `Traceback (most recent call last):\n  File "/ba_dashboard.py", line 4120, in _staffing\n    rows = held["${SAVE_NAME}"]\nKeyError: '${SAVE_NAME}'\nprivate-trace-sentinel`;

let browser;
before(async () => { browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL}); });
after(async () => { await browser?.close(); });

async function setup(t, {api = 'created', delay = 0, width = 1280, height = 900} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  await context.addInitScript(() => {
    localStorage.setItem('ledger_history', 'private-history-sentinel');
    // A page that draws from the fixture's thin payload (as restore.test.cjs does).
    localStorage.setItem('ba_dash_page', 'supply');
    localStorage.setItem('ba_dash_supply', 'shops');
    localStorage.setItem('ledger_link_approval', '{"x":"private-approval-sentinel"}');
    window.fixture = {messages: []};
    window.Worker = class {
      constructor() { fixture.worker = this; }
      postMessage(msg) {
        fixture.messages.push(msg);
        // The reader's copy of the failed save, and its game build.
        // The reader's copy of the save it holds, or (asked for the build) the
        // failed save's game build.
        if (msg.kind === 'held') setTimeout(() => this.onmessage({data: {kind: 'held', id: msg.id,
          bytes: msg.build ? null : new Uint8Array([9, 9, 9]).buffer, build: msg.build ? 3682 : null, name: fixture.lastName}}));
        if (msg.kind === 'build') fixture.lastName = msg.name;
      }
      terminate() {}
    };
  });
  const posts = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'report.test') return route.abort();
    if (url.pathname === '/api/report') {
      const request = route.request();
      posts.push({type: request.headers()['content-type'], body: request.postDataBuffer()});
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (api === 'created') return route.fulfill({status: 201, contentType: 'application/json', body: JSON.stringify({issue: {number: 42, url: 'https://github.com/PeterHartwieg/big-copilot/issues/42'}})});
      if (api === 'unavailable') return route.fulfill({status: 503, contentType: 'application/json', body: '{"error":"Service unavailable"}'});
      return route.abort();
    }
    const file = files[url.pathname];
    if (!file) return route.abort();
    return route.fulfill({contentType: file[0], body: file[1]});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.goto('http://report.test/');
  await page.evaluate(() => fixture.worker.onmessage({data: {kind: 'progress', stage: 'ready'}}));
  return {page, posts};
}

// A save chosen as one file, whose read fails in the reader.
async function failRead(page) {
  await page.setInputFiles('#savePick', {name: SAVE_NAME, mimeType: 'application/octet-stream', buffer: SAVE});
  await page.waitForFunction(() => fixture.messages.some((m) => m.kind === 'build'));
  await page.evaluate(({trace, name}) => {
    const msg = fixture.messages.find((m) => m.kind === 'build');
    fixture.worker.onmessage({data: {kind: 'failed', id: msg.id, error: `'${name}'`, trace, bytes: msg.bytes}});
  }, {trace: TRACE, name: SAVE_NAME});
  await page.locator('#reportBtn').waitFor({state: 'visible'});
}

async function partsOf(post) {
  const form = await new Response(post.body, {headers: {'content-type': post.type}}).formData();
  const out = {};
  for (const [name, value] of form) out[name] = typeof value === 'string' ? value : Buffer.from(await value.arrayBuffer());
  return out;
}

test('a failed read offers the form, which sends the failed save and the traceback only when ticked', async (t) => {
  const {page, posts} = await setup(t);
  await failRead(page);
  await page.locator('#reportBtn').click();
  const dialog = page.locator('.br-dialog[open]');
  await dialog.waitFor();
  assert.equal(await page.locator('#brTitle').innerText(), en('br.title'));
  assert.equal(await page.locator('#brPublic').innerText(), en('br.text.public'));
  assert.equal(await page.locator('#brSave').isChecked(), false);
  assert.equal(await page.locator('#brDetails').isChecked(), false);
  await page.waitForFunction(() => !document.getElementById('brSave').disabled);
  await page.locator('#brText').fill('The board stopped while reading.');
  await page.locator('#brSave').check();
  await page.locator('#brDetails').check();
  // The preview shows the public part, the game build the reader found included.
  await page.locator('.br-preview summary').click();
  await page.waitForFunction(() => /3682/.test(document.querySelector('.br-preview-list').textContent));
  assert.doesNotMatch(await page.locator('.br-preview-list').innerText(), /Alice|Smith/);
  await page.locator('.br-foot .primary').click();
  const link = page.locator('.br-status a');
  await link.waitFor();
  assert.equal(await link.getAttribute('href'), 'https://github.com/PeterHartwieg/big-copilot/issues/42');
  assert.equal(await page.locator('.br-foot .primary').isHidden(), true, 'one report per open');

  assert.equal(posts.length, 1);
  const parts = await partsOf(posts[0]);
  assert.deepEqual(Object.keys(parts).sort(), ['details', 'report', 'save']);
  assert.deepEqual(parts.save, SAVE, 'the bytes the page read, kept from the failed build');
  const report = JSON.parse(parts.report);
  assert.deepEqual(Object.keys(report).sort(), ['browser', 'error', 'gameBuild', 'siteBuild', 'source', 'text']);
  assert.equal(report.source, 'file');
  assert.equal(report.gameBuild, 3682);
  assert.equal(report.siteBuild, await page.evaluate(() => window.LEDGER_BUILD));
  assert.equal(report.error, 'KeyError in _staffing (ba_dashboard.py line 4120)', 'the class and the place, never the message');
  assert.doesNotMatch(parts.report, /Alice|Smith|private-trace-sentinel/);
  const details = JSON.parse(parts.details);
  assert.equal(details.trace, TRACE);
  assert.deepEqual(Object.keys(details.settings).sort(), ['language', 'platform', 'theme']);
  assert.doesNotMatch(parts.details, /private-history-sentinel|private-approval-sentinel/);
});

test('unticked boxes send the text alone, and a 503 points to the Discord channel', async (t) => {
  const {page, posts} = await setup(t, {api: 'unavailable'});
  await failRead(page);
  await page.locator('#reportBtn').click();
  await page.locator('.br-dialog[open]').waitFor();
  await page.locator('#brText').fill('It broke.');
  await page.locator('.br-foot .primary').click();
  const away = page.locator('.br-status a');
  await away.waitFor();
  const discord = await page.locator('.sitefoot a[data-sf-feedback]').first().getAttribute('href');
  assert.equal(await away.getAttribute('href'), discord);
  assert.match(await page.locator('.br-status').innerText(), new RegExp(en('br.fail').replace(/\./g, '\\.')));
  assert.equal(await page.locator('.br-foot .primary').isEnabled(), true, 'the player can try again');
  const parts = await partsOf(posts[0]);
  assert.deepEqual(Object.keys(parts), ['report']);
  assert.equal(JSON.parse(parts.report).error, undefined, 'no error line without the details');
});

test('the footer opens the form on the landing, where no save can be attached', async (t) => {
  const {page, posts} = await setup(t, {api: 'offline'});
  const control = page.locator('.sitefoot [data-bug-report]').first();
  assert.equal(await control.innerText(), en('foot.report'));
  await control.click();
  await page.locator('.br-dialog[open]').waitFor();
  await page.waitForFunction(() => document.getElementById('brSaveHint').textContent.length > 0
    && !/…/.test(document.getElementById('brSaveHint').textContent));
  assert.equal(await page.locator('#brSave').isDisabled(), true);
  assert.equal(await page.locator('#brSaveHint').innerText(), en('br.save.none'));
  assert.equal(await page.locator('.br-err').isHidden(), true, 'no error to show');
  // An empty text is not sent.
  await page.locator('.br-foot .primary').click();
  assert.equal(await page.locator('.br-status').innerText(), en('br.empty'));
  // Control characters alone are empty too: the Worker would drop them.
  await page.locator('#brText').fill('\u0001\u0002');
  await page.locator('.br-foot .primary').click();
  assert.equal(await page.locator('.br-status').innerText(), en('br.empty'));
  assert.equal(posts.length, 0);
  // A network failure says so too.
  await page.locator('#brText').fill('A wrong number on the Today page.');
  await page.locator('.br-foot .primary').click();
  await page.locator('.br-status a').waitFor();
  assert.equal(JSON.parse((await partsOf(posts[0])).report).source, 'none');
  // Escape closes it and gives the focus back.
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.br-dialog[open]').count(), 0);
  assert.equal(await control.evaluate((el) => el === document.activeElement), true);
});

test('on a working board the footer and Help & feedback attach the board\'s save from the reader', async (t) => {
  const {page, posts} = await setup(t);
  await page.setInputFiles('#savePick', {name: SAVE_NAME, mimeType: 'application/octet-stream', buffer: SAVE});
  await page.waitForFunction(() => fixture.messages.some((m) => m.kind === 'build'));
  await page.evaluate(() => {
    const msg = fixture.messages.find((m) => m.kind === 'build');
    fixture.worker.onmessage({data: {kind: 'built', id: msg.id, history: '', data: JSON.stringify({meta: {save: 'Alice Co', build: 3690}, kpi: {}, daily: []})}});
  });
  await page.waitForFunction(() => document.body.classList.contains('has-board'));
  assert.equal(await page.locator('#reportBtn').isHidden(), true, 'all well: the strip offers nothing');
  assert.match(await page.evaluate(() => pxHelpHtml()), /data-bug-report/, 'Help & feedback copies the footer control');
  await page.locator('.wrap > .sitefoot [data-bug-report]').click();
  await page.locator('.br-dialog[open]').waitFor();
  await page.waitForFunction(() => !document.getElementById('brSave').disabled);
  await page.locator('#brText').fill('A wrong number.');
  await page.locator('#brSave').check();
  await page.locator('.br-foot .primary').click();
  await page.locator('.br-status a').waitFor();
  const parts = await partsOf(posts[0]);
  assert.deepEqual(parts.save, Buffer.from([9, 9, 9]));
  assert.equal(JSON.parse(parts.report).gameBuild, 3690, 'the board\'s own game build, no second parse');
  assert.equal(await page.evaluate(() => fixture.messages.filter((m) => m.kind === 'held').map((m) => m.build).join()), 'false');
});

test('when the board cannot draw a save the reader read, the form attaches the reader\'s copy', async (t) => {
  const {page, posts} = await setup(t);
  await page.setInputFiles('#savePick', {name: SAVE_NAME, mimeType: 'application/octet-stream', buffer: SAVE});
  await page.waitForFunction(() => fixture.messages.some((m) => m.kind === 'build'));
  // A payload the board throws on (no kpi): the read worked, the drawing did not.
  await page.evaluate(() => {
    const msg = fixture.messages.find((m) => m.kind === 'build');
    fixture.worker.onmessage({data: {kind: 'built', id: msg.id, history: '', data: JSON.stringify({meta: {save: 'Alice Co', build: 3690}, daily: []})}});
  });
  await page.locator('#reportBtn').waitFor({state: 'visible'});
  await page.locator('#reportBtn').click();
  await page.locator('.br-dialog[open]').waitFor();
  await page.waitForFunction(() => !document.getElementById('brSave').disabled);
  await page.locator('#brText').fill('The board went blank.');
  await page.locator('#brSave').check();
  await page.locator('#brDetails').check();
  await page.locator('.br-foot .primary').click();
  await page.locator('.br-status a').waitFor();
  const parts = await partsOf(posts[0]);
  assert.deepEqual(parts.save, Buffer.from([9, 9, 9]), 'the copy the reader holds');
  const report = JSON.parse(parts.report);
  assert.equal(report.gameBuild, 3690, 'from what the reader answered');
  assert.equal(report.error, 'TypeError', 'a script error is named by its class alone');
  assert.match(JSON.parse(parts.details).trace, /report\.test|at /, 'the script error\'s stack stays private');
});

test('a send in flight keeps the form open and sends only what it was sent with', async (t) => {
  // The stub answers after a second, so the checks below run while the send is out.
  const {page, posts} = await setup(t, {delay: 1000});
  await failRead(page);
  await page.locator('#reportBtn').click();
  await page.locator('.br-dialog[open]').waitFor();
  await page.waitForFunction(() => !document.getElementById('brSave').disabled);
  await page.locator('#brText').fill('First.');
  await page.locator('.br-foot .primary').click();
  // While it is out, neither Cancel nor Escape closes the form.
  assert.equal(await page.locator('.br-foot .btn2:not(.primary)').isDisabled(), true);
  await page.keyboard.press('Escape');
  await page.locator('.br-status a').waitFor();
  assert.equal(await page.locator('.br-dialog[open]').count(), 1);
  assert.deepEqual(Object.keys(await partsOf(posts[0])), ['report'], 'unticked, so nothing else');
  // Closing lets go of what the form held.
  await page.locator('.br-foot .btn2:not(.primary)').click();
  assert.equal(await page.locator('.br-dialog[open]').count(), 0);
});

test('a reader answer that will not decode still leaves the save with the reader for the form', async (t) => {
  const {page, posts} = await setup(t);
  await page.setInputFiles('#savePick', {name: SAVE_NAME, mimeType: 'application/octet-stream', buffer: SAVE});
  await page.waitForFunction(() => fixture.messages.some((m) => m.kind === 'build'));
  // Python can write NaN, which JSON.parse refuses.
  await page.evaluate(() => {
    const msg = fixture.messages.find((m) => m.kind === 'build');
    fixture.worker.onmessage({data: {kind: 'built', id: msg.id, history: '', data: '{"meta":{"save":"x"},"kpi":NaN}'}});
  });
  await page.locator('#reportBtn').waitFor({state: 'visible'});
  await page.locator('#reportBtn').click();
  await page.locator('.br-dialog[open]').waitFor();
  await page.waitForFunction(() => !document.getElementById('brSave').disabled);
  await page.locator('#brText').fill('Nothing showed.');
  await page.locator('#brSave').check();
  await page.locator('.br-foot .primary').click();
  await page.locator('.br-status a').waitFor();
  const parts = await partsOf(posts[0]);
  assert.deepEqual(parts.save, Buffer.from([9, 9, 9]));
  assert.equal(JSON.parse(parts.report).gameBuild, 3682, 'read again by the reader');
});

test('on a phone the answer is scrolled into view above the sticky buttons', async (t) => {
  for (const api of ['created', 'unavailable']) {
    const {page} = await setup(t, {api, width: 375, height: 667});
    await failRead(page);
    await page.locator('#reportBtn').click();
    await page.locator('.br-dialog[open]').waitFor();
    await page.locator('#brText').fill('It broke.');
    await page.locator('.br-foot .primary').click();
    const link = page.locator('.br-status a');
    await link.waitFor();
    await page.waitForTimeout(50);
    const [a, foot, dialog] = await Promise.all([link.boundingBox(), page.locator('.br-foot').boundingBox(), page.locator('.br-dialog').boundingBox()]);
    assert.ok(a.y + a.height <= foot.y + 1, `${api}: the link (${a.y}+${a.height}) ends above the buttons (${foot.y})`);
    assert.ok(a.y >= dialog.y, `${api}: the link is inside the dialog's view`);
  }
});
