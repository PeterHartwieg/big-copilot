// The page's side of the game link's writes (docs/game-link-api.md, "Writes"),
// against the real mock: the built page and web/app.js, a synthetic company
// from tests/es3_fixture.py served by tools/game_link_mock.py, and a stub in
// place of the Pyodide worker that answers every build with that company's
// payload. Install Playwright and its Chromium browser to run; NODE_PATH may
// point at an existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawn, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.join(__dirname, '..');
const web = path.join(root, 'web');
const PYTHON = process.env.PYTHON || 'python';
const CODE = 'ABC234';
const ORIGIN = 'http://localhost:9321';
const GIFTS = 'ba:street_secondavenue#10';
const BARE = 'ba:street_fifthavenue#4';
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml'};

let browser, mock, mockUrl, payload, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'game-link-write-'));
  const save = path.join(dir, 'link.hsg'), data = path.join(dir, 'payload.json');
  const made = spawnSync(PYTHON, [path.join(root, 'tests', 'es3_fixture.py'), save, data], {cwd: root});
  assert.equal(made.status, 0, made.stderr?.toString());
  payload = fs.readFileSync(data, 'utf8');
  mock = spawn(PYTHON, ['-u', path.join(root, 'tools', 'game_link_mock.py'), save, '--port', '0',
    '--code', CODE, '--character', 'default', '--company', 'Link Co', '--day', '34', '--hour', '14'], {cwd: root});
  mockUrl = await new Promise((resolve, reject) => {
    let out = '';
    mock.stdout.on('data', (chunk) => {
      out += chunk;
      const m = /at (http:\/\/127\.0\.0\.1:\d+)\//.exec(out);
      if (m) resolve(m[1]);
    });
    mock.stderr.on('data', (chunk) => { out += chunk; });
    mock.on('exit', (code) => reject(new Error(`the mock exited (${code}): ${out}`)));
  });
  // The page is served by the test on a made-up origin, which Chrome places
  // in no address space it would prompt for; the permission prompt itself is
  // tests/game_link.test.cjs's.
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL,
    args: ['--disable-features=LocalNetworkAccessChecks']});
});
after(async () => {
  await browser?.close();
  mock?.kill();
  fs.rmSync(dir, {recursive: true, force: true});
});

async function configure(body) {
  const res = await fetch(mockUrl + '/debug/config', {method: 'POST', body: JSON.stringify(body),
    headers: {'Content-Type': 'application/json'}});
  return res.json();
}
const applied = async () => (await (await fetch(mockUrl + '/debug/writes')).json()).writes;

// The page, linked to the mock. `writes` is what /health lists (null: the key
// is left out, as a 0.1.0 mod does); `code` is a pairing code already kept in
// the tab.
async function linked(t, {writes = ['uniforms', 'imports', 'schedule'], code = null, link = true} = {}) {
  await configure({reset: true, refuseWrite: null, busyWrites: 0, writes});
  const context = await browser.newContext({viewport: {width: 1280, height: 1000}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  await context.addInitScript(({payload, code}) => {
    window.builds = 0;
    window.Worker = class {
      postMessage(msg) {
        if (msg.kind !== 'build') return;
        window.builds++;
        queueMicrotask(() => this.onmessage({data: {id: msg.id, kind: 'built', history: '{}', data: payload}}));
      }
      terminate() {}
    };
    if (code) sessionStorage.setItem('ledger_pair', code);
  }, {payload, code});
  await context.route('https://**', (route) => route.abort());
  await context.route(ORIGIN + '/**', (route) => {
    const file = path.join(web, decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || 'index.html');
    if (!file.startsWith(web) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({status: 404, body: ''});
    return route.fulfill({contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  t.after(() => assert.deepEqual(errors, [], 'no script error on the page'));
  await page.goto(`${ORIGIN}/#link=${mockUrl}`);
  if (link) {
    await page.locator('#linkBtn').click();
    await page.waitForFunction(() => document.body.classList.contains('has-board')
      && document.getElementById('srcStatus').textContent === 'Up to date');
  }
  return page;
}

const button = (page, key, label = 'Set Default uniforms') =>
  page.locator(`#alerts [data-gw="uniforms"][data-gw-sites*='${JSON.stringify(key).slice(1, -1)}']`, {hasText: label}).first();
const dialog = (page) => page.locator('dialog.gw-dlg:not(.gw-pair)');
const pair = (page) => page.locator('dialog.gw-pair');

async function pairWith(page, code) {
  await pair(page).locator('input').fill(code);
  await pair(page).getByRole('button', {name: 'Pair'}).click();
}

test('outside linked mode nothing changes: no write button anywhere', async (t) => {
  const page = await linked(t, {link: false});
  // A save read from a file: the board, and not linked.
  await page.evaluate(() => {
    const input = document.getElementById('folderPick');
    const file = new File(['x'], 'Link Co.hsg', {lastModified: Date.now()});
    Object.defineProperty(file, 'webkitRelativePath', {value: 'Saves/abc/Link Co.hsg'});
    Object.defineProperty(input, 'files', {value: [file], configurable: true});
    input.dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(() => document.body.classList.contains('has-board'));
  await page.waitForSelector('#alerts .find');
  assert.equal(await page.locator('[data-gw]').count(), 0);
});

test('a dry run, the pairing prompt, an apply that rebuilds the board, and undo', async (t) => {
  const page = await linked(t);
  const gifts = button(page, GIFTS);
  assert.equal(await gifts.getAttribute('aria-disabled'), null, 'enabled: the mod takes uniforms');
  await gifts.click();
  // No code yet: the write asks for it first, and a wrong one is caught before any write.
  await pair(page).waitFor();
  await pairWith(page, 'zzz999');
  await page.getByText('That is not the code the game shows now').waitFor();
  await pairWith(page, 'abc 234');
  await dialog(page).getByText('Sets the Default uniform').waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('ledger_pair')), CODE, 'kept for this tab');
  assert.equal(await page.evaluate(() => localStorage.getItem('ledger_pair')), null, 'and never beyond it');
  const row = dialog(page).locator('tbody tr');
  assert.deepEqual(await row.first().locator('td').allInnerTexts(), ['HART. Gifts', 'Customerservice', 'No uniform', 'Default']);
  assert.equal((await applied()).length, 0, 'the dry run wrote nothing');
  const builds = await page.evaluate(() => window.builds);
  await dialog(page).getByRole('button', {name: 'Set uniforms'}).click();
  await dialog(page).getByText('Default uniform set for 1 role at 1 shop.').waitFor();
  const writes = await applied();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].body.sites, [{address: {street: 'ba:street_secondavenue', number: 10},
    skills: ['ba:skill_customerservice'], presetId: null}]);
  assert.equal(writes[0].body.dryRun, false);
  // The stamp moved; the board reads the game again, the dialog stays.
  await page.waitForFunction((n) => window.builds > n, builds);
  assert.equal(await dialog(page).isVisible(), true);
  await dialog(page).getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: 1 role back to no uniform.').waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['uniforms', 'undo']);
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Close'}).click();
  assert.equal(await page.locator('#gwToast').count(), 0, 'nothing left to undo');
});

test('set for all shops, and undo from the strip once the dialog is closed', async (t) => {
  const page = await linked(t, {code: CODE});
  const all = button(page, GIFTS, 'Set for all 2 shops');
  await all.click();
  assert.equal(await pair(page).count(), 0, 'the kept code is used, no prompt');
  await dialog(page).getByText('Sets the Default uniform').waitFor();
  assert.deepEqual(await dialog(page).locator('tbody td:first-child').allInnerTexts(), ['HART. Gifts', 'HART. Corner']);
  await dialog(page).getByRole('button', {name: 'Set uniforms'}).click();
  await dialog(page).getByText('Default uniform set for 2 roles at 2 shops.').waitFor();
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Close'}).click();
  const strip = page.locator('#gwToast');
  await strip.getByText('Default uniform set for 2 roles at 2 shops.').waitFor();
  await strip.getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: 2 roles back to no uniform.').waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['uniforms', 'undo']);
});

test('the site panel offers the write for its one shop', async (t) => {
  const page = await linked(t, {code: CODE});
  await page.evaluate((key) => { openSite(key); showPage('company'); }, GIFTS);
  const btn = page.locator('.gw-panel [data-gw="uniforms"]');
  assert.equal(await btn.count(), 1);
  assert.equal(await btn.getAttribute('data-gw-sites'), JSON.stringify([GIFTS]));
});

test('a mod that does not take the kind leaves the button disabled, with the reason', async (t) => {
  for (const writes of [['imports'], null]) {
    const page = await linked(t, {writes, code: CODE});
    const gifts = button(page, GIFTS);
    assert.equal(await gifts.getAttribute('aria-disabled'), 'true', JSON.stringify(writes));
    assert.equal(await gifts.getAttribute('data-tip'), 'Update the Big Copilot Link mod to set uniforms from here');
    await gifts.click({force: true});
    assert.equal(await dialog(page).count(), 0, 'no dialog from a disabled button');
  }
});

test('a code the game no longer has is forgotten and asked for again', async (t) => {
  const page = await linked(t, {code: 'WRONG2'});
  await button(page, GIFTS).click();
  await pair(page).getByText("That code is no longer the game's.").waitFor();
  await pairWith(page, CODE);
  await dialog(page).getByText('Sets the Default uniform').waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('ledger_pair')), CODE);
});

test('cancelling the prompt sends nothing and says so', async (t) => {
  const page = await linked(t);
  await button(page, GIFTS).click();
  await pair(page).getByRole('button', {name: 'Cancel'}).click();
  await dialog(page).getByText('Not paired with the game, so nothing was sent.').waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: 'Try again'}).count(), 1);
});

test('a game that moved on answers 409 changed, and the dialog offers a refresh', async (t) => {
  const page = await linked(t, {code: CODE});
  await configure({refuseWrite: 'changed'});
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: 'Set uniforms'}).click();
  await dialog(page).getByText('The game has moved on since this board was read. Nothing was changed.').waitFor();
  const refresh = page.waitForRequest((req) => req.url().endsWith('/refresh') && req.method() === 'POST');
  await dialog(page).getByRole('button', {name: 'Refresh the board'}).click();
  await refresh;  // Update asked the game for its current state
  await dialog(page).waitFor({state: 'detached'});
  assert.equal((await applied()).length, 0);
});

test('a refusal names the rule, the shop and the fix, and Apply stays off', async (t) => {
  const page = await linked(t, {code: CODE});
  // The shop with no locker, asked for directly: the dry run already refuses.
  await page.evaluate((key) => gwUniforms([key]), BARE);
  await dialog(page).getByText('No uniform locker: the game sets uniforms only where one stands.').waitFor();
  const refusal = dialog(page).locator('.gw-refusals li');
  assert.match(await refusal.innerText(), /^HART\. Bare: No uniform locker/);
  assert.match(await refusal.innerText(), /Place a uniform locker in the shop, then try again\./);
  assert.equal(await dialog(page).getByRole('button', {name: 'Set uniforms'}).isDisabled(), true);
  await dialog(page).getByRole('button', {name: 'Cancel'}).click();
  // And an apply the game refuses after a clean dry run.
  await configure({refuseWrite: 'cannot_write:placement'});
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: 'Set uniforms'}).click();
  await dialog(page).getByText('The game takes no changes while you are placing items. Nothing was changed.').waitFor();
  await configure({refuseWrite: null});
  await dialog(page).getByRole('button', {name: 'Try again'}).click();
  await dialog(page).getByRole('button', {name: 'Set uniforms'}).waitFor();
  assert.equal((await applied()).length, 0);
});

test('a busy game is retried a second apart, three times, then named', async (t) => {
  const page = await linked(t, {code: CODE});
  await configure({busyWrites: 2});
  await button(page, GIFTS).click();
  await dialog(page).getByText('Sets the Default uniform').waitFor({timeout: 10000});
  await dialog(page).getByRole('button', {name: 'Cancel'}).click();
  await configure({busyWrites: 5});
  await button(page, GIFTS).click();
  await dialog(page).getByText('The game stayed busy saving its state. Nothing was changed.').waitFor({timeout: 10000});
  // One try and three retries spent four of the five busy answers.
  assert.equal((await configure({})).busyWrites, 1);
  await dialog(page).getByRole('button', {name: 'Try again'}).click();
  await dialog(page).getByText('Sets the Default uniform').waitFor({timeout: 10000});
});
