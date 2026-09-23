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
// the tab; `data` is the payload every build answers, the fixture's by default.
async function linked(t, {writes = ['uniforms', 'imports', 'schedule'], code = null, link = true, data = payload} = {}) {
  await configure({reset: true, refuseWrite: null, busyWrites: 0, writes});
  const context = await browser.newContext({viewport: {width: 1280, height: 1000}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  await context.addInitScript(({data, code}) => {
    window.builds = 0;
    window.Worker = class {
      postMessage(msg) {
        if (msg.kind !== 'build') return;
        window.builds++;
        queueMicrotask(() => this.onmessage({data: {id: msg.id, kind: 'built', history: '{}', data}}));
      }
      terminate() {}
    };
    if (code) sessionStorage.setItem('ledger_pair', code);
  }, {data, code});
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
  assert.match(await row.nth(1).innerText(), /Cleaning\s+Set\s+Unchanged\s+already has a uniform; left as it is/,
    'a role already dressed is shown and left alone');
  assert.equal((await applied()).length, 0, 'the dry run wrote nothing');
  const builds = await page.evaluate(() => window.builds);
  await dialog(page).getByRole('button', {name: 'Set uniforms'}).click();
  await dialog(page).getByText('Default uniform set for 1 role at 1 shop.').waitFor();
  const writes = await applied();
  assert.equal(writes.length, 1);
  // skills null: every skill the shop's Uniforms window offers.
  assert.deepEqual(writes[0].body.sites, [{address: {street: 'ba:street_secondavenue', number: 10},
    skills: null, presetId: null}]);
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
  assert.deepEqual([...new Set(await dialog(page).locator('tbody td:first-child').allInnerTexts())], ['HART. Gifts', 'HART. Corner']);
  await dialog(page).getByRole('button', {name: 'Set uniforms'}).click();
  await dialog(page).getByText('Default uniform set for 2 roles at 2 shops.').waitFor();
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Close'}).click();
  const strip = page.locator('#gwToast');
  await strip.getByText('Default uniform set for 2 roles at 2 shops.').waitFor();
  await strip.getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: 2 roles back to no uniform.').waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['uniforms', 'undo']);
});

test('an apply that changes nothing says so and offers no undo', async (t) => {
  const page = await linked(t, {code: CODE});
  for (const expected of ['Default uniform set for 1 role at 1 shop.', 'Nothing to set: every role already has a uniform.']) {
    await button(page, GIFTS).click();
    await dialog(page).getByRole('button', {name: 'Set uniforms'}).click();
    await dialog(page).getByText(expected).waitFor();
    if (expected.startsWith('Nothing')) break;
    await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Close'}).click();
    await dialog(page).waitFor({state: 'detached'});
  }
  assert.equal(await dialog(page).getByRole('button', {name: 'Undo'}).count(), 0);
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Close'}).click();
  await dialog(page).waitFor({state: 'detached'});
  assert.equal(await page.locator('#gwToast').count(), 0, 'the kind has nothing left to undo');
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
  // A schedule answer's own refusal is read from siteError, and a 409's leading row is not said twice.
  const said = await page.evaluate(() => [
    gwRefusals({kind: 'schedule', object: () => 'HART. Gifts'}, {siteError: 'headquarters', rows: []}),
    gwRefusals({kind: 'schedule', object: () => 'HART. Gifts'}, {siteError: 'headquarters', rows: [{error: 'headquarters'}]}),
  ]);
  for (const html of said) {
    assert.equal((html.match(/<li>/g) || []).length, 1);
    assert.match(html, /A headquarters' schedule is not written from here/);
  }
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

test('an apply that gets no answer is not sent again: the board reads the game, then asks afresh', async (t) => {
  const page = await linked(t, {code: CODE});
  // The apply reaches nothing; the dry runs go through.
  let applies = 0;
  await page.route(`${mockUrl}/write/uniforms`, (route) => {
    if (JSON.parse(route.request().postData() || '{}').dryRun) return route.continue();
    applies++;
    return route.abort();
  });
  const refresh = page.waitForRequest((req) => req.url().endsWith('/refresh') && req.method() === 'POST');
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: 'Set uniforms'}).click();
  await dialog(page).getByText('The game did not answer, so this may or may not have been applied.').waitFor();
  await refresh;  // the board asks the game for its state first
  await dialog(page).getByText('Sets the Default uniform').waitFor({timeout: 20000});
  assert.equal(await dialog(page).getByRole('button', {name: 'Set uniforms'}).isEnabled(), true);
  assert.equal(applies, 1, 'never sent twice on its own');
  assert.equal((await applied()).length, 0);
  assert.equal(await page.locator('#gwToast').count(), 0);
});

test('an apply whose answer cannot be read is uncertain too', async (t) => {
  const page = await linked(t, {code: CODE});
  let applies = 0;
  await page.route(`${mockUrl}/write/uniforms`, async (route) => {
    if (JSON.parse(route.request().postData() || '{}').dryRun) return route.continue();
    applies++;
    const res = await route.fetch();  // applied in the mock, then the answer is garbled
    return route.fulfill({response: res, body: '{"ok": tr'});
  });
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: 'Set uniforms'}).click();
  await dialog(page).getByText('The game did not answer, so this may or may not have been applied.').waitFor();
  await dialog(page).getByText('Sets the Default uniform').waitFor({timeout: 20000});
  assert.equal(applies, 1);
  // The fresh dry run shows what the game now holds: the role is dressed.
  await dialog(page).getByText('already has a uniform; left as it is').first().waitFor();
});

test('an undo right after an apply is read once the read under way is done', async (t) => {
  const page = await linked(t, {code: CODE});
  let saves = 0, release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(`${mockUrl}/save`, async (route) => {
    saves++;
    const res = await route.fetch();
    if (saves === 1) await held;  // the read after the apply, still under way
    await route.fulfill({response: res});
  });
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: 'Set uniforms'}).click();
  await dialog(page).getByText('Default uniform set for 1 role at 1 shop.').waitFor();
  const until = async (test, ms) => {
    const end = Date.now() + ms;
    while (!test() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50));
  };
  await until(() => saves >= 1, 8000);
  await dialog(page).getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: 1 role back to no uniform.').waitFor();
  assert.equal(saves, 1, 'the first read still holds');
  release();
  await until(() => saves >= 2, 8000);
  assert.equal(saves, 2, 'the undo is read as soon as the first read is done');
});
test('an apply answering ok false, or for another kind, is uncertain and sent once each', async (t) => {
  const page = await linked(t, {code: CODE});
  let applies = 0, answer = {ok: false, kind: 'uniforms', dryRun: false, stamp: 'x', rows: []};
  await page.route(`${mockUrl}/write/uniforms`, (route) => {
    if (JSON.parse(route.request().postData() || '{}').dryRun) return route.continue();
    applies++;
    return route.fulfill({status: 200, json: answer, headers: {'Access-Control-Allow-Origin': ORIGIN}});
  });
  await button(page, GIFTS).click();
  for (const wrong of [{ok: false, kind: 'uniforms'}, {ok: true, kind: 'imports'}]) {
    answer = {...wrong, dryRun: false, stamp: 'x', rows: []};
    const sent = applies;
    await dialog(page).getByRole('button', {name: 'Set uniforms'}).click();
    await dialog(page).getByText('The game did not answer, so this may or may not have been applied.').waitFor();
    await dialog(page).getByRole('button', {name: 'Set uniforms'}).waitFor({timeout: 30000});
    assert.equal(applies, sent + 1, JSON.stringify(wrong));
  }
});

test('a dry run answering for another kind cannot be read', async (t) => {
  const page = await linked(t, {code: CODE});
  await page.route(`${mockUrl}/write/uniforms`, (route) => route.fulfill({status: 200,
    json: {ok: true, kind: 'schedule', dryRun: true, rows: []}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await dialog(page).getByText("The game's answer could not be read.").waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: 'Try again'}).count(), 1);
});

test('Apply clicked twice sends one write', async (t) => {
  const page = await linked(t, {code: CODE});
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: 'Set uniforms'}).waitFor();
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('dialog.gw-dlg .gw-foot button')].find((b) => b.textContent === 'Set uniforms');
    btn.click(); btn.click();
  });
  await dialog(page).getByText('Default uniform set for 1 role at 1 shop.').waitFor();
  assert.equal((await applied()).length, 1);
});

test('names from the game are shown as text, never as markup', async (t) => {
  const page = await linked(t, {code: CODE});
  const hostile = '<img src=x onerror="window.pwned=1">';
  await page.route(`${mockUrl}/write/uniforms`, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.presets = [{id: 'P1', name: hostile}, {id: 'P2', name: 'Plain'}];
    (body.rows || []).forEach((r) => { r.presetName = hostile; r.business = hostile; });
    await route.fulfill({response: res, json: body});
  });
  await button(page, GIFTS).click();
  await dialog(page).getByText(`Sets the ${hostile} uniform`).waitFor();
  assert.equal(await dialog(page).locator('img').count(), 0);
  assert.equal(await page.evaluate(() => window.pwned), undefined);
});

/* --- imports -------------------------------------------------------------- */
const DEPOT_ADDRESS = {street: 'ba:street_pier', number: 9};
async function supply(page) {
  await page.evaluate(() => { showPage('supply'); logisticsView = 'all'; drawLogistics(); wireAll(); });
  return page.locator('#importPlan');
}
const importRow = (page, text) => page.locator('#importPlan tbody tr', {hasText: text});
async function setTo(page, text, value) {
  const box = importRow(page, text).locator('input[data-imp]');
  await box.fill(String(value));
  await box.press('Enter');
  await page.waitForFunction(({text, value}) => [...document.querySelectorAll('#importPlan tbody tr')]
    .some((tr) => tr.textContent.includes(text) && tr.classList.contains('imp-changed')
      && tr.querySelector('input[data-imp]').value === String(value)), {text, value});
}
const applyImports = (page) => page.locator('#importPlan [data-gw="imports"]');

test('imports: the Set to figure is written, and undone', async (t) => {
  const page = await linked(t, {code: CODE});
  const plan = await supply(page);
  assert.equal(await plan.locator('[data-gw="imports"]').count(), 0, 'nothing to apply yet');
  await setTo(page, 'Paperbag', 4200);
  assert.equal(await applyImports(page).textContent(), 'Apply 1 change in game');
  await applyImports(page).click();
  await dialog(page).getByText('Sets these amounts in the purchasing agents\' plans.').waitFor();
  const cells = await dialog(page).locator('tbody tr').first().locator('td').allInnerTexts();
  assert.equal(cells[0], '1 Pier');
  assert.match(cells[1], /^Paperbag\s+HART\. Depot$/);
  assert.match(cells[2], /^3,800\s+in stock$/);
  assert.match(cells[3], /^4,200\s+in stock$/);
  assert.equal(cells[4], 'no cap');
  await dialog(page).getByRole('button', {name: 'Apply in game'}).click();
  await dialog(page).getByText('1 amount set in the game.').waitFor();
  const writes = await applied();
  assert.deepEqual(writes[0].body, {dryRun: false, contracts: [{id: 'CONTRACTone', activate: false,
    products: [{itemName: 'ba:itemname_paperbag', warehouse: DEPOT_ADDRESS, amount: 4200, expect: 3800}]}]});
  await dialog(page).getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: the imports are back as they were.').waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['imports', 'undo']);
});

test('imports: inside the lock window the dry run refuses, in the game\'s words', async (t) => {
  const page = await linked(t, {code: CODE});
  await configure({day: 35, hour: 21});  // Sunday 21:00, the contract delivers Monday, day 36
  await supply(page);
  await setTo(page, 'Paperbag', 4200);
  await applyImports(page).click();
  const refusal = dialog(page).locator('.gw-refusals li');
  await refusal.waitFor();
  assert.match(await refusal.innerText(),
    /^1 Pier: Orders for Monday's delivery closed Sunday 20:00; they reopen Monday 08:00\.\s*That is day 36: try again then\.$/);
  assert.equal(await dialog(page).getByRole('button', {name: 'Apply in game'}).isDisabled(), true);
});

test('imports: the ranked list is the game\'s order, read only, and a write sends no order', async (t) => {
  const page = await linked(t, {code: CODE});
  await supply(page);
  const list = importRow(page, 'Paperbag').locator('.imp-contracts');
  // textContent: a section off screen skips its rendering, and innerText with it.
  assert.match(await list.textContent(),
    /1\. 1 Pier · keeps 3,800 in stock.*2\. 2 Pier · 0 a week · paused.*In delivery order, set at the headquarters in game/);
  assert.equal(await list.locator('button').count(), 0);
  await setTo(page, 'Paperbag', 4200);
  await applyImports(page).click();
  // A Smart Delivery write sets the level alone; it says the plain contract stays.
  await dialog(page).getByText('The plain contract for Paperbag at HART. Depot (2 Pier) is left as it is: the level counts what it brings.').waitFor();
  await dialog(page).getByRole('button', {name: 'Apply in game'}).click();
  await dialog(page).getByText('1 amount set in the game.').waitFor();
  assert.equal('order' in (await applied())[0].body, false);
});

test('imports: Apply sends only what the dry run judged', async (t) => {
  const page = await linked(t, {code: CODE});
  await supply(page);
  await setTo(page, 'Paperbag', 4200);
  await applyImports(page).click();
  await dialog(page).getByRole('button', {name: 'Apply in game'}).waitFor();
  // The figure moves under the open dialog, as a re-read board would move it.
  await page.evaluate(() => {
    const r = gwImportRows.find((x) => x.slug === 'ba:itemname_paperbag');
    impSetKeep(r.impId, {value: 4300, inGame: 3800});
    drawLogistics();
  });
  await dialog(page).getByRole('button', {name: 'Apply in game'}).click();
  await dialog(page).locator('tbody tr').first().getByText('4,300').waitFor();
  assert.equal((await applied()).length, 0, 'asked again, not applied');
  await dialog(page).getByRole('button', {name: 'Apply in game'}).click();
  await dialog(page).getByText('1 amount set in the game.').waitFor();
  assert.equal((await applied())[0].body.contracts[0].products[0].amount, 4300);
});
test('imports: a stopped contract is started, with its next delivery against cash; what the cap leaves is said', async (t) => {
  const page = await linked(t, {code: CODE});
  await configure({importTerms: {CONTRACTthree: {unitPrice: 2.5, cap: 400}}});
  await supply(page);
  await setTo(page, 'Candle', 600);
  await applyImports(page).click();
  // The first dry run names the cap; the write is made again within it, and the rest is said.
  await dialog(page).getByText('200 a week of Candle at HART. Depot not covered: the importers\' caps are reached.').waitFor();
  assert.match(await dialog(page).locator('tbody tr').first().innerText(), /400\s+a week/);
  assert.equal(await dialog(page).getByRole('button', {name: 'Apply in game'}).isEnabled(), true);
  await dialog(page).getByRole('button', {name: 'Cancel'}).click();
  await configure({importTerms: {CONTRACTthree: {unitPrice: 2.5, cap: 1000}}});
  await applyImports(page).click();
  await dialog(page).getByText('3 Pier is stopped: this starts it again, with Repeating on. Its next delivery, on day 36, costs $1,500, against $10,000 in cash.').waitFor();
  assert.equal(await dialog(page).getByText(/not covered/).count(), 0);
  assert.match(await dialog(page).locator('tbody tr').first().innerText(), /started, Repeating on/);
  await dialog(page).getByRole('button', {name: 'Apply in game'}).click();
  await dialog(page).getByText('1 amount set, 1 contract started in the game.').waitFor();
  assert.deepEqual((await applied())[0].body.contracts, [{id: 'CONTRACTthree', activate: true,
    products: [{itemName: 'ba:itemname_candle', warehouse: DEPOT_ADDRESS, amount: 600, expect: 500}]}]);
});
test('imports: plain amounts take one cap budget per importer, in the game\'s delivery order', async (t) => {
  const page = await linked(t, {code: CODE});
  const got = await page.evaluate(() => {
    const saved = gwImportRows;
    const [gifts, corner, depot] = [D.businesses[0].key, D.businesses[1].key, D.businesses[3].key];
    const line = (s, value, contracts, smart = false, changed = true) => ({s, slug: 'ba:itemname_x', item: 'X', value, smart,
      changed, paused: false, total: value, impId: `x${s}`, contracts});
    const c = (id, importer, group, order, amount, {active = true, product = 0, smart = false} = {}) =>
      ({id, importer, group, order, product, amount, active, smart, agent: true});
    const run = (rows) => {
      gwImportRows = rows;
      return gwImportPlan(null).filter((l) => !l.r.smart).map((l) => ({at: l.depot.key,
        set: l.contracts.map(({c, amount}) => [c.id, amount]), uncovered: l.uncovered,
        ahead: l.smartAhead.map((e) => e.c.id)}));
    };
    gwTerms.clear();
    gwTerms.set(`A|ba:itemname_x|${depot}`, {cap: 1000, orderedThisWeek: 0, max: null});
    // Importer P allows 1,000 a week. A delivers first and takes 800 at the
    // depot, B at the shop the 200 left, Q's C (stopped, so started) the rest.
    // D, stopped and given nothing, is not written at all. S, P's Smart
    // Delivery contract, orders ahead and is named, not counted.
    const smartLine = line(1, 900, [c('S', 'P', 0, 0, 900, {smart: true})], true, false);
    const shared = run([smartLine, line(3, 800, [c('A', 'P', 0, 1, 500)]),
                        line(0, 600, [c('B', 'P', 0, 3, 400), c('C', 'Q', 4, 4, 0, {active: false}),
                                      c('D', 'P', 0, 5, 300, {active: false})])]);
    // With nobody after B, the cap leaves 400 of the shop's week uncovered.
    const capped = run([line(3, 800, [c('A', 'P', 0, 1, 500)]), line(0, 600, [c('B', 'P', 0, 3, 400)])]);
    // Defensive: the game holds one product per importer and item, but should a
    // contract hold the item for two depots, its first product takes the
    // budget first.
    gwTerms.set(`E|ba:itemname_x|${depot}`, {cap: 500, orderedThisWeek: 0, max: null});
    const twice = run([line(3, 400, [c('E', 'P', 0, 0, 300)]), line(0, 400, [c('E', 'P', 0, 0, 300, {product: 1})])]);
    // A stopped contract started by one line writes all its products here, 0 included.
    const started = run([line(3, 400, [c('F', 'Q', 0, 0, 300, {active: false})]),
                         line(0, 0, [c('F', 'Q', 0, 0, 300, {active: false, product: 1})])]);
    // A running contract the walk would zero keeps its 300, but with the cap
    // spent ahead of it that counts for nothing: the gap stays the line's.
    gwTerms.set(`A|ba:itemname_x|${depot}`, {cap: 500, orderedThisWeek: 0, max: null});
    const kept = run([line(3, 500, [c('A', 'P', 0, 1, 400)]), line(0, 200, [c('G', 'P', 0, 2, 300)])]);
    gwImportRows = saved; gwTerms.clear();
    return {shared, capped, twice, started, kept, depot, gifts};
  });
  assert.deepEqual(got.shared, [{at: got.depot, set: [['A', 800]], uncovered: 0, ahead: ['S']},
                                {at: got.gifts, set: [['B', 200], ['C', 400]], uncovered: 0, ahead: ['S']}]);
  assert.deepEqual(got.capped, [{at: got.depot, set: [['A', 800]], uncovered: 0, ahead: []},
                                {at: got.gifts, set: [['B', 200]], uncovered: 400, ahead: []}]);
  assert.deepEqual(got.twice, [{at: got.depot, set: [['E', 400]], uncovered: 0, ahead: []},
                               {at: got.gifts, set: [['E', 100]], uncovered: 300, ahead: []}]);
  assert.deepEqual(got.kept, [{at: got.depot, set: [['A', 500]], uncovered: 0, ahead: []},
                              {at: got.gifts, set: [], uncovered: 200, ahead: []}]);
  assert.deepEqual(got.started, [{at: got.depot, set: [['F', 400]], uncovered: 0, ahead: []},
                                 {at: got.gifts, set: [['F', 0]], uncovered: 0, ahead: []}]);
});

test('imports: a week the caps leave short with nothing to write is said, and not counted', async (t) => {
  const page = await linked(t, {code: CODE});
  await configure({importTerms: {CONTRACTthree: {unitPrice: 2.5, cap: 0}}});
  await supply(page);
  await setTo(page, 'Candle', 600);
  await applyImports(page).click();
  await dialog(page).getByText('Nothing to write. 600 a week of Candle at HART. Depot not covered: the importers\' caps are reached.').waitFor();
  await dialog(page).getByRole('button', {name: 'Close'}).last().click();
  await page.evaluate(() => { drawLogistics(); wireAll(); });
  assert.equal(await applyImports(page).count(), 0);
  // The row keeps the reason once the cap is known.
  assert.equal(await importRow(page, 'Candle').locator('.gw-short').textContent(),
    "600 a week not covered: the importers' caps are reached.");
  assert.equal((await applied()).length, 0);
});
/* --- the schedule --------------------------------------------------------- */
const ANA = 'AAAAemployeeAAAAAAAAAAAA', BEN = 'BBBBemployeeBBBBBBBBBBBB', DEE = 'DDDDemployeeDDDDDDDDDDDD';
const REGISTER = 'REGISTERaaaaaaaaaaaaaa==ue', CLEAN = 'CLEANcccccccccccccccccc==ue';
const CORNER = 'ba:street_broadway#2';
const GIFTS_ADDRESS = {street: 'ba:street_secondavenue', number: 10};
/* The fixture's shops have no measured week, so the plans are laid in here:
   at the Gifts shop Ben on the register on Monday, Dee from the bench on
   Tuesday and a cleaning hire; its full cover Ana and Ben on the register all
   Monday. At the Corner, Cy on Wednesday. */
function withRosters({hq = false} = {}) {
  const d = JSON.parse(payload);
  const gifts = d.staffing.find((r) => r.key === GIFTS);
  Object.assign(gifts, {
    stations: [{id: CLEAN, name: 'Cleaning station', skill: 'ba:skill_cleaning', rate: null},
               {id: REGISTER, name: 'Register', skill: 'ba:skill_customerservice', rate: 20}],
    people: [{id: ANA, name: 'Ana Silva'}, {id: BEN, name: 'Ben Ode'}, {id: DEE, name: 'Dee Lund'}],
    roles: [{skill: 'ba:skill_customerservice', label: 'Customer service', stations: [1]}],
    shifts: [{d: 1, s: 1, f: 8, t: 20, p: 1}, {d: 2, s: 1, f: 8, t: 20, p: 2}, {d: 2, s: 0, f: 8, t: 20, p: null, k: 'clean'}],
    bench: [{p: 2, skill: 'ba:skill_customerservice', skills: ['ba:skill_customerservice']}],
    addPeople: {assign: [{id: DEE, name: 'Dee Lund', skill: 'ba:skill_customerservice', role: 'Customer service', p: 2}],
                hire: [{skill: 'ba:skill_cleaning', role: 'Cleaning', people: 1}], people: 2, hoursUncovered: 24},
    headcount: {},
    current: {shifts: 2, fragments: 0, coverFragments: 0, cleaning: 1, security: 0,
              list: [{d: 0, s: 0, f: 0, t: 12, p: 0, k: 'clean'}, {d: 1, s: 1, f: 8, t: 20, p: 0}]},
  });
  Object.assign(gifts.fullCover, {shifts: [{d: 1, s: 1, f: 0, t: 12, p: 0}, {d: 1, s: 1, f: 12, t: 24, p: 1}],
    bench: [], headcount: {}, openNow: false, addPeople: {assign: [], hire: [], people: 0, hoursUncovered: 0}});
  const corner = d.staffing.find((r) => r.key === CORNER);
  Object.assign(corner, {shifts: [{d: 3, s: 1, f: 8, t: 20, p: 0}], headcount: {}});
  if (hq) d.businesses.find((b) => b.key === GIFTS).typeSlug = 'ba:businesstype_headquarters';
  return JSON.stringify(d);
}
async function roster(page, key, plan = 'demand') {
  await page.evaluate(({key, plan}) => { spPlanWrite(key, plan); openSite(key); showPage('company'); }, {key, plan});
  return page.locator('#sp-roster');
}

test('schedule: the roster is written with only the people working here, and undone', async (t) => {
  const page = await linked(t, {code: CODE, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.getByText('24 h a week stay empty until 2 people are added').waitFor();
  await block.getByRole('button', {name: 'Write this roster to the game'}).click();
  await dialog(page).getByText('Replaces every entry of the week at HART. Gifts with the demand plan: 1 entry for the people working here.').waitFor();
  await dialog(page).getByText('Add 2 people to fill this plan: assign Dee Lund (unassigned) and hire 1 Cleaning; 24 h a week stay empty until then.').waitFor();
  await dialog(page).getByText('No shift here after this: Ana Silva.').waitFor();
  const days = await dialog(page).locator('tbody tr').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()));
  assert.deepEqual(days.filter((d) => /^(Monday|Tuesday|Sunday)/.test(d)),
    ['Monday 1 entry 12 h 1 entry 12 h', 'Tuesday none none', 'Sunday 1 entry 12 h none']);
  await dialog(page).getByRole('button', {name: 'Write schedule'}).click();
  await dialog(page).getByText('HART. Gifts: 1 entry set in place of 2. 24 h a week stay empty until you add 2 people; write it again then.').waitFor();
  const writes = await applied();
  // Neither Dee's entry (not assigned here yet) nor the hire's goes to the game.
  assert.deepEqual(writes[0].body, {dryRun: false, address: GIFTS_ADDRESS, expect: '9c98d93a', openAllHours: false,
    days: [{d: 1, shifts: [{f: 8, t: 20, employeeId: BEN, itemInstanceId: REGISTER}]}]});
  await dialog(page).getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: the schedule at HART. Gifts is back as it was.').waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['schedule', 'undo']);
});

test('schedule: full cover opens every day 0 to 24, unless the player opts out', async (t) => {
  const page = await linked(t, {code: CODE, data: withRosters()});
  const block = await roster(page, GIFTS, 'full');
  await block.getByRole('button', {name: 'Write this roster to the game'}).click();
  const open = dialog(page).getByRole('checkbox', {name: /Also open every day 0 to 24/});
  await open.waitFor();
  assert.equal(await open.isChecked(), true);
  await open.uncheck();
  await dialog(page).getByRole('checkbox', {name: /Also open every day 0 to 24/}).waitFor();
  assert.equal(await dialog(page).getByRole('checkbox', {name: /Also open/}).isChecked(), false);
  await dialog(page).getByRole('button', {name: 'Write schedule'}).click();
  await dialog(page).getByText(/^HART\. Gifts: 2 entries set in place of 2\.$/).waitFor();
  const body = (await applied())[0].body;
  assert.equal(body.openAllHours, false);
  assert.deepEqual(body.days, [{d: 1, shifts: [{f: 0, t: 12, employeeId: ANA, itemInstanceId: REGISTER},
    {f: 12, t: 24, employeeId: BEN, itemInstanceId: REGISTER}]}]);
});

test('schedule: never offered at a headquarters', async (t) => {
  const page = await linked(t, {code: CODE, data: withRosters({hq: true})});
  const block = await roster(page, GIFTS);
  await block.waitFor();
  assert.equal(await block.locator('[data-gw]').count(), 0);
  assert.equal(await page.evaluate((key) => gwRosterPlan(key), GIFTS), null);
  assert.deepEqual(await page.evaluate(() => gwScheduleSites()), [CORNER]);
});

test('schedule: a game that moved on answers 409 changed', async (t) => {
  const page = await linked(t, {code: CODE, data: withRosters()});
  await configure({refuseWrite: 'changed'});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write this roster to the game'}).click();
  await dialog(page).getByRole('button', {name: 'Write schedule'}).click();
  await dialog(page).getByText('The game has moved on since this board was read. Nothing was changed.').waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: 'Refresh the board'}).count(), 1);
  assert.equal((await applied()).length, 0);
});

test('schedule: every planned shop, one after another', async (t) => {
  const page = await linked(t, {code: CODE, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write all 2 planned sites'}).click();
  await dialog(page).getByRole('heading', {name: 'Schedule at HART. Corner (1 of 2)'}).waitFor();
  await dialog(page).getByRole('button', {name: 'Write schedule'}).click();
  await dialog(page).getByText('HART. Corner: 1 entry set in place of 1.').waitFor();
  await dialog(page).getByRole('button', {name: 'Next shop (2 of 2)'}).click();
  await dialog(page).getByRole('heading', {name: 'Schedule at HART. Gifts (2 of 2)'}).waitFor();
  await dialog(page).getByRole('button', {name: 'Write schedule'}).click();
  await dialog(page).getByText(/^HART\. Gifts: 1 entry set in place of 2\./).waitFor();
  const writes = await applied();
  assert.deepEqual(writes.map((w) => w.body.address), [{street: 'ba:street_broadway', number: 2}, GIFTS_ADDRESS]);
  assert.deepEqual(writes[0].body.days, [{d: 3, shifts: [{f: 8, t: 20, employeeId: 'CCCCemployeeCCCCCCCCCCCC',
    itemInstanceId: 'REGISTERaaaaaaaaaaaaaa==ay'}]}]);
});

test('schedule: a shop can be skipped, and one the game already holds is left out', async (t) => {
  const page = await linked(t, {code: CODE, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write all 2 planned sites'}).click();
  await dialog(page).getByRole('heading', {name: 'Schedule at HART. Corner (1 of 2)'}).waitFor();
  await dialog(page).getByRole('button', {name: 'Skip this shop'}).click();
  await dialog(page).getByRole('heading', {name: 'Schedule at HART. Gifts (2 of 2)'}).waitFor();
  await dialog(page).getByRole('button', {name: 'Cancel'}).click();
  assert.equal((await applied()).length, 0);
  // The Corner's game schedule made the plan: it drops out of "all".
  const left = await page.evaluate((corner) => {
    const row = D.staffing.find((r) => r.key === corner);
    row.current.list = [{d: 3, s: 1, f: 8, t: 20, p: 0}];
    return gwScheduleSites();
  }, CORNER);
  assert.deepEqual(left, [GIFTS]);
});

test('schedule: a cover-only plan keeps the serving entries in the game', async (t) => {
  const data = JSON.parse(withRosters());
  const gifts = data.staffing.find((r) => r.key === GIFTS);
  gifts.shifts = [{d: 3, s: 0, f: 0, t: 12, p: 0, k: 'clean'}];
  Object.assign(gifts, {bench: [], addPeople: {assign: [], hire: [], people: 0, hoursUncovered: 0}});
  const page = await linked(t, {code: CODE, data: JSON.stringify(data)});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write this roster to the game'}).click();
  await dialog(page).getByText('Replaces every entry of the week at HART. Gifts with the cleaning and security plan: 1 entry for the people working here, and the 1 serving entry in the game as they stand.').waitFor();
  await dialog(page).getByRole('button', {name: 'Write schedule'}).click();
  await dialog(page).getByText(/^HART\. Gifts: 2 entries set in place of 2\./).waitFor();
  assert.deepEqual((await applied())[0].body.days, [
    {d: 1, shifts: [{f: 8, t: 20, employeeId: ANA, itemInstanceId: REGISTER}]},
    {d: 3, shifts: [{f: 0, t: 12, employeeId: ANA, itemInstanceId: CLEAN}]}]);
});
