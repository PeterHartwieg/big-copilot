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
// The approval the game gave this page's origin, as the tests hand it to the
// mock; the page keeps it in localStorage with the mod address it came from.
const TOKEN = 'approvedTokenForThePageAAAAAAAAAAAAAAAAAAAA';
const APPROVAL = 'ledger_link_approval';
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
    '--character', 'default', '--company', 'Link Co', '--day', '34', '--hour', '14'], {cwd: root});
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
// is left out, as a 0.1.0 mod does); `approved`: the game approved this
// browser before, so its token is kept; `stored` is an approval kept as it
// is, for the tests of a stale one; `data` is the payload every build answers,
// the fixture's by default. The mock's player answers a new request after a
// quarter of a second.
async function linked(t, {writes = ['uniforms', 'imports', 'schedule'], approved = false, stored = null, link = true,
                          data = payload} = {}) {
  await configure({reset: true, refuseWrite: null, busyWrites: 0, writes, pairDelay: 0.25, pairCooldowns: [0],
                   tokens: approved ? {[TOKEN]: ORIGIN} : {}});
  const code = approved ? {link: mockUrl, token: TOKEN} : stored;
  const context = await browser.newContext({viewport: {width: 1280, height: 1000}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  await context.addInitScript(({data, code}) => {
    window.builds = 0;
    // What the fake worker builds: the test's payload, or what a test says
    // the game holds after a write (window.buildData).
    window.baseData = data;
    window.buildData = null;
    window.Worker = class {
      postMessage(msg) {
        if (msg.kind !== 'build') return;
        window.builds++;
        // window.holdBuilds: the build is left unanswered, as a slow one is.
        if (window.holdBuilds) return;
        queueMicrotask(() => this.onmessage({data: {id: msg.id, kind: 'built', history: '{}', data: window.buildData || data}}));
      }
      terminate() {}
    };
    if (code) localStorage.setItem('ledger_link_approval', JSON.stringify({[code.link]: code.token}));
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
// Holds the board's next read of the save until the test lets it go.
async function holdSave(page) {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(`${mockUrl}/save`, async (route) => {
    const res = await route.fetch();
    await held;
    await route.fulfill({response: res});
  });
  return release;
}
const dialog = (page) => page.locator('dialog.gw-dlg');
// The game's approval is asked inside the write's own dialog, while it waits.
const pair = (page) => page.locator('dialog.gw-dlg[data-phase="approval"]');
const WAITING = 'Waiting for you in the game';
// The game's answer to the dry run, drawn: the dialog offers Apply.
const ready = (page, timeout) => page.locator('dialog.gw-dlg[data-phase="ready"]').waitFor(timeout ? {timeout} : undefined);
// Apply names what it does and counts it.
const SET = /^Set( \d+)? uniforms?$/;
// The approval kept for the mock's address: one entry per mod address.
const kept = (page) => page.evaluate(({key, link}) => (JSON.parse(localStorage.getItem(key) || '{}') || {})[link] || null,
  {key: APPROVAL, link: mockUrl});

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

test('a dry run, the game\'s approval, an apply that rebuilds the board, and undo', async (t) => {
  const page = await linked(t);
  const gifts = button(page, GIFTS);
  assert.equal(await gifts.getAttribute('aria-disabled'), null, 'enabled: the mod takes uniforms');
  const asked = page.waitForRequest((req) => req.url() === `${mockUrl}/pair/request` && req.method() === 'POST');
  await gifts.click();
  // No approval yet: the write asks the game first, and waits for the player there.
  const request = await asked;
  assert.match(JSON.parse(request.postData()).name, /^(Chrome|Edge|Firefox|Safari|Opera|A browser)( on \w+)?$/);
  await pair(page).getByText(WAITING).waitFor();
  await ready(page);
  assert.equal(typeof await kept(page), 'string');
  assert.equal(await page.evaluate(() => sessionStorage.length), 0, 'nothing in the tab\'s own storage');
  // A card a role: the one to dress, none now and Default after; the one
  // already dressed, kept.
  assert.match(await dialog(page).locator('.gw-where').innerText(), /HART\. Gifts/);
  const dress = dialog(page).locator('.gw-role.to');
  assert.equal(await dress.count(), 1);
  assert.match(await dress.textContent(), /^Customerservicenone.*Default$/);
  assert.match(await dialog(page).locator('.gw-role.kept').textContent(), /^Cleaninghas one · kept$/,
    'a role already dressed is shown and left alone');
  assert.equal(await dialog(page).getByRole('button', {name: SET}).textContent(), 'Set 1 uniform');
  assert.equal((await applied()).length, 0, 'the dry run wrote nothing');
  const builds = await page.evaluate(() => window.builds);
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('Default is on 1 role at HART. Gifts.').waitFor();
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
  // Undone: said, and the write offered again once the board has read the game after it.
  await dialog(page).getByText('Undone: 1 role back to no uniform.').waitFor();
  await dialog(page).getByRole('button', {name: 'Set again'}).click();
  await ready(page);
  assert.equal(await dialog(page).locator('.gw-role.to').count(), 1, 'the role is to dress again');
  assert.deepEqual((await applied()).map((w) => w.kind), ['uniforms', 'undo']);
  // And it can be applied again.
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('Default is on 1 role at HART. Gifts.').waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['uniforms', 'undo', 'uniforms']);
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Close'}).click();
  // The strip names the second write, and undoes it.
  const strip = page.locator('#gwToast');
  await strip.getByText('Default is on 1 role at HART. Gifts.').waitFor();
  await strip.getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: 1 role back to no uniform.').waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['uniforms', 'undo', 'uniforms', 'undo']);
});

test('an approval survives a reload, and goes only to the linked mod on this computer', async (t) => {
  const page = await linked(t);
  const sentTo = [];
  page.on('request', (req) => { if (req.headers().authorization) sentTo.push(new URL(req.url()).origin); });
  let asks = 0;
  page.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks++; });
  await button(page, GIFTS).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Cancel'}).click();
  await page.reload();  // the page opens the remembered link by itself
  await page.waitForFunction(() => document.body.classList.contains('has-board')
    && document.getElementById('srcStatus').textContent === 'Up to date');
  await button(page, GIFTS).click();
  await ready(page);
  assert.equal(asks, 1, 'asked once, not again after the reload');
  assert.ok(sentTo.length >= 2);
  assert.deepEqual([...new Set(sentTo)], [mockUrl], 'the token goes to the linked mod and nowhere else');
});

test('an approval kept for another mod address is not sent to this one', async (t) => {
  const page = await linked(t, {stored: {link: 'http://127.0.0.1:1', token: TOKEN}});
  await configure({tokens: {[TOKEN]: ORIGIN}});
  const asked = page.waitForRequest((req) => req.url().endsWith('/pair/request'));
  await button(page, GIFTS).click();
  await asked;  // asked afresh: the kept token was another mod's
  await ready(page);
  assert.notEqual(await kept(page), TOKEN);
  // The other mod's approval stays, under its own address.
  assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key))['http://127.0.0.1:1'], APPROVAL), TOKEN);
});
test('set for all shops, and undo from the strip once the dialog is closed', async (t) => {
  const page = await linked(t, {approved: true});
  const all = button(page, GIFTS, 'Set for all 2 shops');
  await all.click();
  assert.equal(await pair(page).count(), 0, 'the kept code is used, no prompt');
  await ready(page);
  // A row a shop, a small shirt a role.
  assert.deepEqual(await dialog(page).locator('.gw-shop .nm > span:last-child').allInnerTexts(), ['HART. Gifts', 'HART. Corner']);
  assert.match(await dialog(page).locator('.gw-verdict').innerText(), /The game will dress 2 roles/);
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('Default is on 2 roles at 2 shops.').waitFor();
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Close'}).click();
  const strip = page.locator('#gwToast');
  await strip.getByText('Default is on 2 roles at 2 shops.').waitFor();
  await strip.getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: 2 roles back to no uniform.').waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['uniforms', 'undo']);
});

test('uniforms at several shops: a refused shop is left out, and the rest are set without it', async (t) => {
  const page = await linked(t, {approved: true});
  const sent = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/write/uniforms') && req.method() === 'POST') sent.push(JSON.parse(req.postData()));
  });
  await page.evaluate((keys) => gwUniforms(keys), [GIFTS, BARE]);
  await ready(page);
  // The refusal is said in the shop's own row, with the way out.
  const leave = dialog(page).getByRole('button', {name: 'Leave it out: HART. Bare'});
  await leave.waitFor();
  assert.match(await dialog(page).locator('.gw-shop.bad').textContent(), /No uniform locker/);
  assert.equal(await dialog(page).getByRole('button', {name: SET}).isDisabled(), true);
  await leave.click();
  await ready(page);
  assert.equal(await dialog(page).locator('.gw-shop.out').count(), 1);
  assert.match(await dialog(page).locator('.gw-where').textContent(), /HART\. Bare left out/);
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('Default is on 1 role at HART. Gifts.').waitFor();
  const gifts = [{street: 'ba:street_secondavenue', number: 10}];
  assert.deepEqual(sent[1].sites.map((x) => x.address), gifts, 'asked again without it');
  assert.deepEqual((await applied())[0].body.sites.map((x) => x.address), gifts);
});

test('a uniform picked from the pills asks the game again with it, and the keyboard stays on the pill', async (t) => {
  const page = await linked(t, {approved: true});
  await page.route(`${mockUrl}/write/uniforms`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const res = await route.fetch();
    const body = await res.json();
    body.presets = [{id: 'P1', name: 'Default'}, {id: 'P2', name: 'Summer'}];
    // The answer for the new pick takes a moment, long enough to look at the dialog meanwhile.
    if (JSON.parse(route.request().postData()).sites[0].presetId === 'P2') await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({response: res, json: body});
  });
  await button(page, GIFTS).click();
  await ready(page);
  const asked = page.waitForRequest((req) => req.url().endsWith('/write/uniforms') && req.method() === 'POST'
    && JSON.parse(req.postData()).dryRun);
  await dialog(page).getByRole('button', {name: 'Summer'}).click();
  assert.equal(JSON.parse((await asked).postData()).sites[0].presetId, 'P2');
  // Asked in place: the drawing stays, no skeleton, the wire asks, the pill is busy, Apply waits.
  assert.equal(await dialog(page).getAttribute('data-phase'), 'asking');
  assert.equal(await dialog(page).locator('.gw-skel').count(), 0);
  assert.equal(await dialog(page).locator('.gw-role').count(), 2);
  assert.equal(await dialog(page).locator('.gw-w.ask').count(), 1);
  assert.match(await dialog(page).getByRole('button', {name: 'Summer'}).getAttribute('class'), /gw-busy/);
  assert.equal(await dialog(page).getByRole('button', {name: SET}).isDisabled(), true);
  await ready(page);
  assert.equal(await dialog(page).getByRole('button', {name: 'Summer'}).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.gwPreset), 'P2');
});

test('a role is named from the game\'s own text first, as text', async (t) => {
  const page = await linked(t, {approved: true});
  assert.equal(await page.evaluate(() => { D.skillNames = {'ba:skill_securityguard': 'Security <Guard>'}; return gwSkillName('ba:skill_securityguard'); }),
    'Security &lt;Guard&gt;');
});

test('a neighbourhood badge is the player\'s prefix as text, never markup', async (t) => {
  const page = await linked(t, {approved: true});
  assert.equal(await page.evaluate(() => hoodHtml({code: '<img src=x>'})), '<span class="hood">&lt;img src=x&gt;</span>');
});

test('an apply that changes nothing says so and offers no undo', async (t) => {
  const page = await linked(t, {approved: true});
  for (const expected of ['Default is on 1 role at HART. Gifts.', 'Nothing to set: every role already has a uniform.']) {
    await button(page, GIFTS).click();
    await dialog(page).getByRole('button', {name: SET}).click();
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
  const page = await linked(t, {approved: true});
  await page.evaluate((key) => { openSite(key); showPage('company'); }, GIFTS);
  const btn = page.locator('.gw-panel [data-gw="uniforms"]');
  assert.equal(await btn.count(), 1);
  assert.equal(await btn.getAttribute('data-gw-sites'), JSON.stringify([GIFTS]));
});

test('a mod that does not take the kind leaves the button disabled, with the reason', async (t) => {
  for (const writes of [['imports'], null]) {
    const page = await linked(t, {writes, approved: true});
    const gifts = button(page, GIFTS);
    assert.equal(await gifts.getAttribute('aria-disabled'), 'true', JSON.stringify(writes));
    assert.equal(await gifts.getAttribute('data-tip'), 'Update the Big Copilot Link mod to set uniforms from here');
    await gifts.click({force: true});
    assert.equal(await dialog(page).count(), 0, 'no dialog from a disabled button');
  }
});

test('an approval the game no longer knows is dropped and asked for again', async (t) => {
  const page = await linked(t, {stored: {link: mockUrl, token: 'forgottenByTheGame'}});
  await button(page, GIFTS).click();
  await pair(page).getByText(WAITING).waitFor();
  await ready(page);
  const approval = await kept(page);
  assert.equal(typeof approval, 'string');
  assert.notEqual(approval, 'forgottenByTheGame');
});

for (const [outcome, said] of [['deny', 'The game said no.'], ['expire', 'No answer from the game.'],
                                ['popup_open', 'Close the open question in the game first.']]) {
  test(`the game\'s approval: ${outcome}`, async (t) => {
    const page = await linked(t);
    await configure({pair: outcome});
    await button(page, GIFTS).click();
    await dialog(page).getByText(said).waitFor();
    assert.equal(await pair(page).count(), 0);
    assert.equal(await kept(page), null);
    // Ask again asks the game once more.
    await configure({pair: 'approve'});
    await dialog(page).getByRole('button', {name: 'Ask again'}).click();
    await ready(page);
  });
}
test('the game\'s approval: the wait after repeated denials is said, and Ask again waits it out', async (t) => {
  const page = await linked(t);
  // The first denial costs nothing here, the second 3 s.
  await configure({pair: 'deny', pairCooldowns: [0, 3]});
  const asks = [];
  page.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks.push(Date.now()); });
  await button(page, GIFTS).click();
  await dialog(page).getByText('The game said no.').waitFor();
  await dialog(page).getByRole('button', {name: 'Ask again'}).click();
  await dialog(page).getByText('The game said no.').waitFor();
  await dialog(page).getByRole('button', {name: 'Ask again'}).click();
  // A wait after a denial is never waited out on its own, however short.
  await dialog(page).getByText('The game asked you a moment ago. Ask again in 3 s.').waitFor();
  const again = dialog(page).getByRole('button', {name: 'Ask again'});
  assert.equal(await again.isDisabled(), true);
  const sent = asks.length;
  await page.waitForTimeout(3500);
  assert.equal(asks.length, sent, 'no request of its own while the player waits');
  assert.equal(await again.isEnabled(), true, 'Ask again comes back once the wait has run out');
  await configure({pair: 'approve'});
  await again.click();
  await ready(page);
});
test('the game\'s approval: a long wait on a request still open is said, not waited out', async (t) => {
  const page = await linked(t);
  await page.route(`${mockUrl}/pair/request`, (route) => route.fulfill({status: 429,
    json: {error: 'throttled', retryAfter: 50}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await dialog(page).getByText('The game asked you a moment ago. Ask again in 50 s.').waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: 'Ask again'}).isDisabled(), true);
});
test('the game\'s approval: a game that does not take the request', async (t) => {
  const page = await linked(t);
  await configure({pair: 'busy'});
  await button(page, GIFTS).click();
  await dialog(page).getByText('The game did not take the request. Nothing was sent.').waitFor();
  assert.equal(await kept(page), null);
});

test('the game\'s approval: a site the mod does not take, and a request the game forgot', async (t) => {
  const page = await linked(t);
  await page.route(`${mockUrl}/pair/request`, (route) => route.fulfill({status: 403,
    json: {error: 'origin_not_allowed'}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await dialog(page).getByText('The mod does not take changes from this site. Nothing was sent.').waitFor();
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Close'}).click();
  await page.unroute(`${mockUrl}/pair/request`);
  await page.route(`${mockUrl}/pair/status**`, (route) => route.fulfill({status: 404,
    json: {error: 'not_found'}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await dialog(page).getByText('No answer from the game.').waitFor();
});

test('the game\'s approval: approved, but the one answer with the token was lost', async (t) => {
  const page = await linked(t);
  await page.route(`${mockUrl}/pair/status**`, (route) => route.fulfill({status: 200,
    json: {state: 'approved'}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await dialog(page).getByText("Approved, but the game's answer was lost: click again.").waitFor();
  assert.equal(await kept(page), null);
});
test('cancelling the wait sends nothing more, and the next ask picks the open question up', async (t) => {
  const page = await linked(t);
  await configure({pairDelay: 60});
  const sent = [];
  page.on('request', (req) => sent.push(new URL(req.url()).pathname));
  await button(page, GIFTS).click();
  await pair(page).getByText(WAITING).waitFor();
  await pair(page).getByRole('button', {name: 'Cancel'}).click();
  await dialog(page).getByText('Not approved in the game, so nothing was sent.').waitFor();
  const at = sent.length;
  await page.waitForTimeout(2500);
  assert.deepEqual(sent.slice(at).filter((p) => p.startsWith('/write/') || p.startsWith('/pair/')), [],
    'no write and no further look at the request');
  assert.equal((await applied()).length, 0);
  // The game's question is still open: asking again waits on it, not a second one.
  await dialog(page).getByRole('button', {name: 'Ask again'}).click();
  await pair(page).getByText('The question is still open in the game.').waitFor();
  await configure({pairDelay: 0});
  await ready(page);
  assert.equal(sent.filter((p) => p === '/pair/request').length, 1);
});

test('a Cancel before the game has answered the request still leaves the question to resume', async (t) => {
  const page = await linked(t);
  await configure({pairDelay: 60});
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(`${mockUrl}/pair/request`, async (route) => {
    const res = await route.fetch();
    await held;
    await route.fulfill({response: res});
  });
  const asks = [];
  page.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks.push(1); });
  await button(page, GIFTS).click();
  await pair(page).getByText('Asking the game…').waitFor();
  await pair(page).getByRole('button', {name: 'Cancel'}).click();
  await dialog(page).getByText('Not approved in the game, so nothing was sent.').waitFor();
  release();
  await page.waitForTimeout(300);
  await dialog(page).getByRole('button', {name: 'Ask again'}).click();
  await pair(page).getByText('The question is still open in the game.').waitFor();
  assert.equal(asks.length, 1);
  await configure({pairDelay: 0});
  await ready(page);
});

test('a new source ends an approval still waiting, and its write', async (t) => {
  const page = await linked(t);
  await configure({pairDelay: 60});
  const writes = [];
  page.on('request', (req) => { if (new URL(req.url()).pathname.startsWith('/write/')) writes.push(req.url()); });
  await button(page, GIFTS).click();
  await pair(page).getByText(WAITING).waitFor();
  // The player reads a save from a file instead.
  await page.evaluate(() => {
    const input = document.getElementById('folderPick');
    const file = new File(['x'], 'Link Co.hsg', {lastModified: Date.now()});
    Object.defineProperty(file, 'webkitRelativePath', {value: 'Saves/abc/Link Co.hsg'});
    Object.defineProperty(input, 'files', {value: [file], configurable: true});
    input.dispatchEvent(new Event('change'));
  });
  await pair(page).waitFor({state: 'detached', timeout: 5000});
  await dialog(page).getByText('The board is no longer linked to the same game. Nothing was sent.').waitFor();
  assert.deepEqual(writes, []);
});

test('an approval the storage will not keep is kept for the page', async (t) => {
  const page = await linked(t);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); }; });
  const asks = [];
  page.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks.push(1); });
  for (let i = 0; i < 2; i++) {
    await button(page, GIFTS).click();
    await ready(page);
    await dialog(page).getByRole('button', {name: 'Cancel'}).click();
    await dialog(page).waitFor({state: 'detached'});
  }
  assert.equal(asks.length, 1, 'asked once, not once per write');
});

test('a short wait on the game is waited out once, a second is said', async (t) => {
  const page = await linked(t);
  let refusals = 0;
  await page.route(`${mockUrl}/pair/request`, (route) => (refusals++ < 1
    ? route.fulfill({status: 429, json: {error: 'throttled', retryAfter: 1}, headers: {'Access-Control-Allow-Origin': ORIGIN}})
    : route.continue()));
  await button(page, GIFTS).click();
  await pair(page).getByText('Asking again in 1 s').waitFor();
  await ready(page);
  // Refused twice in one ask, on a page with no approval: the second wait is the player's.
  const other = await linked(t);
  await other.route(`${mockUrl}/pair/request`, (route) => route.fulfill({status: 429,
    json: {error: 'throttled', retryAfter: 1}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  let asks = 0;
  other.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks++; });
  await button(other, GIFTS).click();
  await dialog(other).getByText('The game asked you a moment ago. Ask again in 1 s.').waitFor();
  assert.equal(asks, 2);
});

test('a question the game never answers ends with its own deadline', async (t) => {
  const page = await linked(t);
  await page.route(`${mockUrl}/pair/request`, (route) => route.fulfill({status: 202,
    json: {requestId: 'x', expiresIn: 1}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await page.route(`${mockUrl}/pair/status**`, (route) => route.fulfill({status: 200,
    json: {state: 'pending'}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await pair(page).getByText(WAITING).waitFor();
  await dialog(page).getByText('No answer from the game.').waitFor({timeout: 12000});
});

test('a 401 drops only the approval that was sent, and another tab\'s newer one is tried before the game is asked', async (t) => {
  const page = await linked(t, {stored: {link: mockUrl, token: 'sentAndRefused'}});
  await configure({pairDelay: 60, tokens: {newer: ORIGIN}});
  let first = true;
  await page.route(`${mockUrl}/write/uniforms`, async (route) => {
    if (route.request().method() !== 'POST' || !first) return route.continue();
    first = false;
    // Another tab stored a newer approval while this write was on its way.
    await page.evaluate(({key, link}) => localStorage.setItem(key, JSON.stringify({[link]: 'newer'})),
      {key: APPROVAL, link: mockUrl});
    await route.fulfill({status: 401, json: {error: 'not_paired'}, headers: {'Access-Control-Allow-Origin': ORIGIN}});
  });
  let asks = 0;
  page.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks++; });
  await button(page, GIFTS).click();
  await ready(page);
  assert.equal(await kept(page), 'newer');
  assert.equal(asks, 0, 'the newer approval served; the game was not asked');
});

test('one Apply click asks the game once: the dry run after it uses the approval it just gave', async (t) => {
  const page = await linked(t, {approved: true});
  await button(page, GIFTS).click();
  await ready(page);
  // The approval is gone before Apply, and the game turns down every token from here on.
  await page.evaluate((key) => localStorage.removeItem(key), APPROVAL);
  await configure({rejectTokens: true});
  let asks = 0;
  page.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks++; });
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText("The game no longer knows this browser's approval. Nothing was changed.").waitFor({timeout: 15000});
  assert.equal(asks, 1);
  assert.equal((await applied()).length, 0);
});

test('the game\'s approval: after 30 s the dialog asks whether the game can be seen, and its clock runs on', async (t) => {
  const page = await linked(t);
  await configure({pairDelay: 60});
  await button(page, GIFTS).click();
  await pair(page).getByText(WAITING).waitFor();
  const cancel = pair(page).locator('.gw-foot').getByRole('button', {name: 'Cancel'});
  await cancel.focus();
  await pair(page).getByText('Still waiting').waitFor({timeout: 40000});
  await pair(page).getByText('No answer from the game yet.').waitFor();
  // The keyboard stays on Cancel through the repaint.
  assert.equal(await page.evaluate(() => document.activeElement.dataset.gwB), 'Cancel');
  const meta = pair(page).locator('.gw-meta');
  const before = await meta.textContent();
  await page.waitForTimeout(2200);
  assert.notEqual(await meta.textContent(), before, 'the clock keeps going');
  await cancel.click();
});

test('an approval the game keeps turning down is asked for once per click', async (t) => {
  const page = await linked(t, {approved: true});
  await configure({rejectTokens: true});
  const asks = [];
  page.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks.push(req.url()); });
  await button(page, GIFTS).click();
  await dialog(page).getByText("The game no longer knows this browser's approval. Nothing was changed.").waitFor();
  assert.equal(asks.length, 1, 'one re-ask, then it ends');
});

test('a 401, the game\'s approval, a busy game and a 401 again ask the game once', async (t) => {
  const page = await linked(t, {stored: {link: mockUrl, token: 'forgottenByTheGame'}});
  // The kept approval is turned down; the new one meets a busy game, then is
  // turned down too: the write asked for it itself, so it asks no second time.
  const answers = [[401, {error: 'not_paired'}], [503, {error: 'busy'}], [401, {error: 'not_paired'}]];
  await page.route(`${mockUrl}/write/uniforms`, (route) => {
    if (route.request().method() !== 'POST' || !answers.length) return route.continue();
    const [status, json] = answers.shift();
    return route.fulfill({status, json, headers: {'Access-Control-Allow-Origin': ORIGIN}});
  });
  let asks = 0;
  page.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks++; });
  await button(page, GIFTS).click();
  await dialog(page).getByText("The game no longer knows this browser's approval. Nothing was changed.").waitFor({timeout: 15000});
  assert.equal(answers.length, 0);
  assert.equal(asks, 1, 'one question for the one click');
});

test('an approval gone between the dry run and Apply: nothing is applied, the game is asked, then the dry run again', async (t) => {
  const page = await linked(t, {approved: true});
  let applies = 0, dryRuns = 0;
  page.on('request', (req) => {
    if (!req.url().endsWith('/write/uniforms') || req.method() !== 'POST') return;
    if (JSON.parse(req.postData() || '{}').dryRun) dryRuns++; else applies++;
  });
  await button(page, GIFTS).click();
  await ready(page);
  await page.evaluate((key) => localStorage.removeItem(key), APPROVAL);
  await dialog(page).getByRole('button', {name: SET}).click();
  await pair(page).getByText(WAITING).waitFor();
  // Approved: the player reviews the game's answer afresh before anything is applied.
  await ready(page);
  assert.equal(applies, 0);
  assert.equal(dryRuns, 2);
  assert.equal((await applied()).length, 0);
});

test('a source changed between the game\'s approval and the write sends nothing', async (t) => {
  const page = await linked(t);
  const writes = [];
  page.on('request', (req) => { if (new URL(req.url()).pathname.startsWith('/write/')) writes.push(req.url()); });
  await page.route(`${mockUrl}/pair/status**`, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    // The player approves in the game, and at that moment reads a save from a file instead.
    if (body.state === 'approved') await page.evaluate(() => {
      const input = document.getElementById('folderPick');
      const file = new File(['x'], 'Link Co.hsg', {lastModified: Date.now()});
      Object.defineProperty(file, 'webkitRelativePath', {value: 'Saves/abc/Link Co.hsg'});
      Object.defineProperty(input, 'files', {value: [file], configurable: true});
      input.dispatchEvent(new Event('change'));
    });
    await route.fulfill({response: res, json: body});
  });
  await button(page, GIFTS).click();
  await dialog(page).getByText('The board is no longer linked to the same game. Nothing was sent.').waitFor();
  assert.deepEqual(writes, []);
  assert.equal(typeof await kept(page), 'string', 'the player\'s answer is kept');
});

test('another company in the same game ends an approval still waiting, and its write', async (t) => {
  const page = await linked(t);
  await configure({pairDelay: 60});
  const writes = [];
  page.on('request', (req) => { if (new URL(req.url()).pathname.startsWith('/write/')) writes.push(req.url()); });
  await button(page, GIFTS).click();
  await pair(page).getByText(WAITING).waitFor();
  // The same character, another company: the game has loaded another of its saves.
  await page.route(`${mockUrl}/health`, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({response: res, json: Object.assign(body, {company: 'Other Co', stamp: `${body.stamp}-other`})});
  });
  await page.route(`${mockUrl}/save`, (route) => {
    const headers = Object.assign({}, route.request().headers());
    delete headers['if-none-match'];
    return route.continue({headers});
  });
  await page.evaluate(() => { LEDGER_SOURCE.refresh(); });
  await dialog(page).getByText('The board is no longer linked to the same game. Nothing was sent.').waitFor({timeout: 15000});
  assert.deepEqual(writes, []);
});

test('a 401 during Apply asks for approval, then shows the game\'s answer again: the apply is not resent', async (t) => {
  const page = await linked(t, {approved: true});
  let applies = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/write/uniforms') && req.method() === 'POST' && !JSON.parse(req.postData() || '{}').dryRun) applies++;
  });
  await button(page, GIFTS).click();
  await ready(page);
  await configure({refuseWrite: 'not_paired'});
  const dryRuns = page.waitForRequest((req) => req.url().endsWith('/write/uniforms')
    && JSON.parse(req.postData() || '{}').dryRun && applies === 1);
  await dialog(page).getByRole('button', {name: SET}).click();
  await pair(page).getByText(WAITING).waitFor();
  await dryRuns;  // asked afresh, for the player to review
  await ready(page);
  assert.equal(applies, 1);
  assert.equal((await applied()).length, 0);
  await configure({refuseWrite: null});
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('Default is on 1 role at HART. Gifts.').waitFor();
  assert.equal(applies, 2);
});
test('a game that moved on answers 409 changed, and the dialog offers a refresh', async (t) => {
  const page = await linked(t, {approved: true});
  await configure({refuseWrite: 'changed'});
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('The game has moved on since this board was read. Nothing was changed.').waitFor();
  const refresh = page.waitForRequest((req) => req.url().endsWith('/refresh') && req.method() === 'POST');
  await dialog(page).getByRole('button', {name: 'Refresh the board'}).click();
  await refresh;  // Update asked the game for its current state
  await dialog(page).waitFor({state: 'detached'});
  assert.equal((await applied()).length, 0);
});

test('a refusal names the rule, the shop and the fix, and Apply stays off', async (t) => {
  const page = await linked(t, {approved: true});
  // The shop with no locker, asked for directly: the dry run already refuses.
  await page.evaluate((key) => gwUniforms([key]), BARE);
  // One red card a rule: the rule, the shop as a chip, the fix on its own line.
  const refusal = dialog(page).locator('.gw-no');
  await refusal.getByText('No uniform locker: the game sets uniforms only where one stands.').waitFor();
  assert.equal(await refusal.count(), 1);
  assert.deepEqual(await refusal.locator('.gw-chip').allInnerTexts(), ['HART. Bare']);
  assert.equal(await refusal.locator('.fix').innerText(), 'Place a uniform locker in the shop, then try again.');
  assert.match(await dialog(page).locator('.gw-verdict').innerText(), /The game refuses this/);
  assert.equal(await dialog(page).getByRole('button', {name: SET}).isDisabled(), true);
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Close'}).click();
  // A schedule answer's own refusal is read from siteError, and a 409's leading row is not said twice.
  const said = await page.evaluate(() => [
    gwRefusals({kind: 'schedule', object: () => 'HART. Gifts'}, {siteError: 'headquarters', rows: []}),
    gwRefusals({kind: 'schedule', object: () => 'HART. Gifts'}, {siteError: 'headquarters', rows: [{error: 'headquarters'}]}),
  ]);
  for (const html of said) {
    assert.equal((html.match(/class="gw-no"/g) || []).length, 1);
    assert.match(html, /A headquarters' schedule is not written from here/);
  }
  // And an apply the game refuses after a clean dry run.
  await configure({refuseWrite: 'cannot_write:placement'});
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('The game takes no changes while you are placing items. Nothing was changed.').waitFor();
  await configure({refuseWrite: null});
  await dialog(page).getByRole('button', {name: 'Try again'}).click();
  await ready(page);
  assert.equal((await applied()).length, 0);
});

test('a busy game is retried a second apart, three times, then named', async (t) => {
  const page = await linked(t, {approved: true});
  await configure({busyWrites: 2});
  await button(page, GIFTS).click();
  await ready(page, 10000);
  await dialog(page).getByRole('button', {name: 'Cancel'}).click();
  await configure({busyWrites: 5});
  await button(page, GIFTS).click();
  await dialog(page).getByText('The game stayed busy saving its state. Nothing was changed.').waitFor({timeout: 10000});
  // One try and three retries spent four of the five busy answers.
  assert.equal((await configure({})).busyWrites, 1);
  await dialog(page).getByRole('button', {name: 'Try again'}).click();
  await ready(page, 10000);
});

test('an apply that gets no answer is not sent again: the board reads the game, then asks afresh', async (t) => {
  const page = await linked(t, {approved: true});
  // The apply reaches nothing; the dry runs go through.
  let applies = 0;
  await page.route(`${mockUrl}/write/uniforms`, (route) => {
    if (JSON.parse(route.request().postData() || '{}').dryRun) return route.continue();
    applies++;
    return route.abort();
  });
  const refresh = page.waitForRequest((req) => req.url().endsWith('/refresh') && req.method() === 'POST');
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('The game did not answer, so this may or may not have been applied.').waitFor();
  await refresh;  // the board asks the game for its state first
  await ready(page, 20000);
  assert.equal(await dialog(page).getByRole('button', {name: SET}).isEnabled(), true);
  assert.equal(applies, 1, 'never sent twice on its own');
  assert.equal((await applied()).length, 0);
  assert.equal(await page.locator('#gwToast').count(), 0);
});

test('an apply whose answer cannot be read is uncertain too', async (t) => {
  const page = await linked(t, {approved: true});
  let applies = 0;
  await page.route(`${mockUrl}/write/uniforms`, async (route) => {
    if (JSON.parse(route.request().postData() || '{}').dryRun) return route.continue();
    applies++;
    const res = await route.fetch();  // applied in the mock, then the answer is garbled
    return route.fulfill({response: res, body: '{"ok": tr'});
  });
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('The game did not answer, so this may or may not have been applied.').waitFor();
  await ready(page, 20000);
  assert.equal(applies, 1);
  // The fresh dry run shows what the game now holds: the role is dressed.
  assert.equal(await dialog(page).locator('.gw-role.to').count(), 0);
  assert.equal(await dialog(page).locator('.gw-role.kept').count(), 2);
});

test('an undo right after an apply is read once the read under way is done', async (t) => {
  const page = await linked(t, {approved: true});
  let saves = 0, release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(`${mockUrl}/save`, async (route) => {
    saves++;
    const res = await route.fetch();
    if (saves === 1) await held;  // the read after the apply, still under way
    await route.fulfill({response: res});
  });
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('Default is on 1 role at HART. Gifts.').waitFor();
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

/* --- the gate after an undo: Set again once a board has been built since -- */
const until = async (test, ms) => {
  const end = Date.now() + ms;
  while (!(await test()) && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50));
};
const setAgain = (page) => dialog(page).getByRole('button', {name: 'Set again'});
const setAgainOn = (page, timeout) => page.waitForFunction(() => {
  const b = [...document.querySelectorAll('dialog.gw-dlg .gw-foot button')].find((x) => x.textContent === 'Set again');
  return b && !b.disabled;
}, null, timeout ? {timeout} : undefined);
// The watcher's check, now rather than in thirty seconds.
const watchNow = (page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const mockStamp = async () => (await (await fetch(mockUrl + '/health')).json()).stamp;

// The game loads another of the character's saves: /health and /save both
// name another company and a stamp of their own. Returns the way back.
async function otherCompany(page) {
  const health = async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({response: res, json: Object.assign(body, {company: 'Other Co', stamp: `${body.stamp}-other`})});
  };
  const save = async (route) => {
    const headers = Object.assign({}, route.request().headers());
    delete headers['if-none-match'];
    const res = await route.fetch({headers});
    const stamp = `${res.headers()['x-game-link-stamp']}-other`;
    await route.fulfill({response: res, headers: Object.assign({}, res.headers(), {'x-game-link-stamp': stamp, etag: `"${stamp}"`})});
  };
  await page.route(`${mockUrl}/health`, health);
  await page.route(`${mockUrl}/save`, save);
  return async () => { await page.unroute(`${mockUrl}/health`, health); await page.unroute(`${mockUrl}/save`, save); };
}
const NOT_LINKED = 'The board is no longer linked to the game this was undone in.';
// Apply the uniform, undo it, and wait for Set again.
async function undoneAndOpen(page) {
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('Default is on 1 role at HART. Gifts.').waitFor();
  await dialog(page).getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: 1 role back to no uniform.').waitFor();
  await setAgainOn(page, 20000);
}

test('undo gate: Set again waits for a board built after the undo, then opens', async (t) => {
  const page = await linked(t, {approved: true});
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('Default is on 1 role at HART. Gifts.').waitFor();
  await until(async () => (await page.evaluate(() => LEDGER_SOURCE.link().stamp)) === await mockStamp(), 20000);
  const release = await holdSave(page);
  await dialog(page).getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: 1 role back to no uniform.').waitFor();
  assert.equal(await setAgain(page).isDisabled(), true);
  await dialog(page).getByText('Reading the game again').waitFor();
  release();
  await setAgainOn(page, 20000);
  await dialog(page).getByText('The board shows the game as it now stands').waitFor();
});

test('undo gate: open, then a board of another company closes it again', async (t) => {
  const page = await linked(t, {approved: true});
  await undoneAndOpen(page);
  // The game loads another of the character's saves before the player clicks.
  await otherCompany(page);
  await watchNow(page);
  await dialog(page).getByText(NOT_LINKED).waitFor({timeout: 20000});
  assert.equal(await setAgain(page).isDisabled(), true);
  assert.equal(await setAgain(page).getAttribute('title'), 'The board is no longer linked to this game');
  assert.deepEqual((await applied()).map((w) => w.kind), ['uniforms', 'undo'], 'nothing asked of the game');
});

test('undo gate: open, then another source chosen closes it before any new board', async (t) => {
  const page = await linked(t, {approved: true});
  await undoneAndOpen(page);
  // A save chosen by hand, whose build never comes back.
  await page.evaluate(() => {
    window.holdBuilds = true;
    const input = document.getElementById('folderPick');
    const file = new File(['x'], 'Link Co.hsg', {lastModified: Date.now()});
    Object.defineProperty(file, 'webkitRelativePath', {value: 'Saves/abc/Link Co.hsg'});
    Object.defineProperty(input, 'files', {value: [file], configurable: true});
    input.dispatchEvent(new Event('change'));
  });
  await dialog(page).getByText(NOT_LINKED).waitFor();
  assert.equal(await setAgain(page).isDisabled(), true);
  assert.equal(await page.evaluate(() => LEDGER_SOURCE.link()), null);
});

test('a board that fails to take a build keeps the stamp behind it, and the next check reads those bytes again', async (t) => {
  const page = await linked(t, {approved: true});
  const before = await page.evaluate(() => LEDGER_SOURCE.link().stamp);
  // The board throws while it takes the bytes the apply's follow read.
  await page.evaluate(() => {
    const real = renderAll;
    let once = true;
    window.renderAll = function () { if (once) { once = false; throw new Error('the board broke once'); } return real.apply(this, arguments); };
  });
  await button(page, GIFTS).click();
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText('Default is on 1 role at HART. Gifts.').waitFor();
  await page.waitForFunction(() => document.getElementById('srcStatus').textContent.startsWith('Could not read the save'), null, {timeout: 20000});
  assert.equal(await page.evaluate(() => LEDGER_SOURCE.link().stamp), before, 'not the stamp of bytes the board did not take');
  assert.notEqual(await mockStamp(), before);
  await watchNow(page);
  await page.waitForFunction(() => document.getElementById('srcStatus').textContent === 'Up to date', null, {timeout: 20000});
  assert.equal(await page.evaluate(() => LEDGER_SOURCE.link().stamp), await mockStamp());
});
test('an apply answering ok false, or for another kind, is uncertain and sent once each', async (t) => {
  const page = await linked(t, {approved: true});
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
    await dialog(page).getByRole('button', {name: SET}).click();
    await dialog(page).getByText('The game did not answer, so this may or may not have been applied.').waitFor();
    await dialog(page).getByRole('button', {name: SET}).waitFor({timeout: 30000});
    assert.equal(applies, sent + 1, JSON.stringify(wrong));
  }
});

test('a dry run answering for another kind cannot be read', async (t) => {
  const page = await linked(t, {approved: true});
  await page.route(`${mockUrl}/write/uniforms`, (route) => route.fulfill({status: 200,
    json: {ok: true, kind: 'schedule', dryRun: true, rows: []}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await dialog(page).getByText("The game's answer could not be read.").waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: 'Try again'}).count(), 1);
});

test('Apply clicked twice sends one write', async (t) => {
  const page = await linked(t, {approved: true});
  await button(page, GIFTS).click();
  await ready(page);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('dialog.gw-dlg .gw-foot button')].find((b) => b.textContent === 'Set 1 uniform');
    btn.click(); btn.click();
  });
  await dialog(page).getByText('Default is on 1 role at HART. Gifts.').waitFor();
  assert.equal((await applied()).length, 1);
});

test('names from the game are shown as text, never as markup', async (t) => {
  const page = await linked(t, {approved: true});
  const hostile = '<img src=x onerror="window.pwned=1">';
  await page.route(`${mockUrl}/write/uniforms`, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.presets = [{id: 'P1', name: hostile}, {id: 'P2', name: 'Plain'}];
    (body.rows || []).forEach((r) => { r.presetName = hostile; r.business = hostile; });
    await route.fulfill({response: res, json: body});
  });
  await button(page, GIFTS).click();
  await ready(page);
  // The pills, the role card and its read-out line all say the name as text.
  assert.equal(await dialog(page).locator('.gw-preset', {hasText: hostile}).count(), 1);
  assert.equal(await dialog(page).locator('.gw-role.to em').textContent(), hostile);
  await dialog(page).locator('.gw-role.to').hover();
  assert.match(await dialog(page).locator('.gw-read').textContent(), /no uniform now, <img src=x onerror="window\.pwned=1"> after/);
  assert.equal(await dialog(page).locator('img').count(), 0);
  await dialog(page).getByRole('button', {name: SET}).click();
  await dialog(page).getByText(`${hostile} is on 1 role at HART. Gifts.`).waitFor();
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
  const page = await linked(t, {approved: true});
  const plan = await supply(page);
  assert.equal(await plan.locator('[data-gw="imports"]').count(), 0, 'nothing to apply yet');
  await setTo(page, 'Paperbag', 4200);
  // The button wears the count; its name says it whole.
  assert.equal(await applyImports(page).getAttribute('aria-label'), 'Apply changes in game, 1 change');
  assert.equal(await applyImports(page).locator('.n').textContent(), '1');
  await applyImports(page).click();
  await ready(page);
  // A card a material under its depot: now → after, the contracts as pills.
  assert.match(await dialog(page).locator('.gw-depot').textContent(), /HART\. Depot/);
  const line = dialog(page).locator('.gw-line', {hasText: 'Paperbag'});
  assert.equal(await line.count(), 1);
  assert.match(await line.locator('.gw-num').textContent(), /^from 3,800 to 4,200in stock$/);
  assert.deepEqual(await line.locator('.gw-imp').allTextContents(), ['1. 11 Pier', '2. 2 Pierstoppedno agent']);
  assert.match(await dialog(page).locator('.gw-verdict').textContent(), /The game takes the change/);
  await dialog(page).getByRole('button', {name: 'Apply 1 change'}).click();
  await dialog(page).getByText('1 amount set in the game.').waitFor();
  const writes = await applied();
  assert.deepEqual(writes[0].body, {dryRun: false, contracts: [{id: 'CONTRACTone', activate: false,
    products: [{itemName: 'ba:itemname_paperbag', warehouse: DEPOT_ADDRESS, amount: 4200, expect: 3800}]}]});
  await dialog(page).getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: the imports are back as they were.').waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['imports', 'undo']);
});

test('imports: after an undo, Apply again asks from the board read after it', async (t) => {
  const page = await linked(t, {approved: true});
  // The fake board holds each contract amount the game answers after a write or its undo.
  const follow = async (route) => {
    const req = route.request();
    const sent = JSON.parse(req.postData() || '{}');
    if (req.method() !== 'POST' || sent.dryRun || (sent.kind && sent.kind !== 'imports')) return route.fallback();
    const res = await route.fetch();
    const body = await res.json();
    if (res.status() === 200) await page.evaluate((rows) => {
      const d = JSON.parse(window.buildData || window.baseData);
      const walk = (o, slug) => {
        if (Array.isArray(o)) return o.forEach((x) => walk(x, slug));
        if (!o || typeof o !== 'object') return;
        rows.forEach((r) => (r.products || []).forEach((p) => { if (o.id === r.id && slug === p.itemName) o.amount = p.amount; }));
        Object.entries(o).forEach(([k, v]) => walk(v, k.startsWith('ba:itemname_') ? k : slug));
      };
      walk(d, null);
      window.buildData = JSON.stringify(d);
    }, body.rows || []);
    await route.fulfill({response: res, json: body});
  };
  await page.route(`${mockUrl}/write/imports`, follow);
  await page.route(`${mockUrl}/write/undo`, follow);
  await supply(page);
  await setTo(page, 'Paperbag', 4200);
  await applyImports(page).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Apply 1 change'}).click();
  await dialog(page).getByText('1 amount set in the game.').waitFor();
  // The board reads the write: the contract holds 4,200.
  await page.waitForFunction(() => gwImportRows.some((r) => r.contracts.some((c) => c.id === 'CONTRACTone' && c.amount === 4200)));
  const release = await holdSave(page);
  await dialog(page).getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: the imports are back as they were.').waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: 'Apply again'}).isDisabled(), true);
  release();
  await page.waitForFunction(() => gwImportRows.some((r) => r.contracts.some((c) => c.id === 'CONTRACTone' && c.amount === 3800)));
  const reask = dryRunOf(page, 'imports');
  await dialog(page).getByRole('button', {name: 'Apply again'}).click();
  const products = JSON.parse((await reask).postData()).contracts[0].products;
  assert.deepEqual(products.map((x) => [x.itemName, x.amount, x.expect]), [['ba:itemname_paperbag', 4200, 3800]]);
  await ready(page);
  assert.equal(await dialog(page).getByRole('button', {name: 'Apply 1 change'}).isEnabled(), true);
});

test('imports: inside the lock window the dry run refuses, in the game\'s words', async (t) => {
  const page = await linked(t, {approved: true});
  await configure({day: 35, hour: 21});  // Sunday 21:00, the contract delivers Monday, day 36
  await supply(page);
  await setTo(page, 'Paperbag', 4200);
  await applyImports(page).click();
  const refusal = dialog(page).locator('.gw-no');
  await refusal.waitFor();
  assert.equal(await refusal.locator('.rule').textContent(), "Orders for Monday's delivery closed Sunday 20:00; they reopen Monday 08:00.");
  assert.deepEqual(await refusal.locator('.gw-chip').allTextContents(), ['1 Pier · Paperbag']);
  assert.equal(await refusal.locator('.fix').textContent(), 'That is day 36, 08:00 game time: try again then.');
  assert.equal(await refusal.locator('.gw-lock .cells i.x').count(), 12, 'the window drawn, Sunday 20:00 to Monday 08:00');
  assert.equal(await dialog(page).locator('.gw-line.dim').count(), 1, 'the line waits with it');
  assert.equal(await dialog(page).getByRole('button', {name: 'Apply 1 change'}).isDisabled(), true);
});

test('imports: the ranked list is the game\'s order, read only, and a write sends no order', async (t) => {
  const page = await linked(t, {approved: true});
  await supply(page);
  const list = importRow(page, 'Paperbag').locator('.imp-contracts');
  // textContent: a section off screen skips its rendering, and innerText with it.
  assert.match(await list.textContent(),
    /1\. 1 Pier · keeps 3,800 in stock.*2\. 2 Pier · 0 a week · paused.*In delivery order, set at the headquarters in game/);
  assert.equal(await list.locator('button').count(), 0);
  await setTo(page, 'Paperbag', 4200);
  await applyImports(page).click();
  // A Smart Delivery write sets the level alone; it says the plain contract stays.
  await dialog(page).locator('.gw-line', {hasText: 'Paperbag'})
    .getByText('The plain contract (2 Pier) is left as it is: the level counts what it brings.').waitFor();
  await dialog(page).getByRole('button', {name: 'Apply 1 change'}).click();
  await dialog(page).getByText('1 amount set in the game.').waitFor();
  assert.equal('order' in (await applied())[0].body, false);
});

test('imports: Apply sends only what the dry run judged', async (t) => {
  const page = await linked(t, {approved: true});
  await supply(page);
  await setTo(page, 'Paperbag', 4200);
  await applyImports(page).click();
  await ready(page);
  // The figure moves under the open dialog, as a re-read board would move it.
  await page.evaluate(() => {
    const r = gwImportRows.find((x) => x.slug === 'ba:itemname_paperbag');
    impSetKeep(r.impId, {value: 4300, inGame: 3800});
    drawLogistics();
  });
  await dialog(page).getByRole('button', {name: 'Apply 1 change'}).click();
  await dialog(page).locator('.gw-line .gw-num', {hasText: '4,300'}).waitFor();
  assert.equal((await applied()).length, 0, 'asked again, not applied');
  await dialog(page).getByRole('button', {name: 'Apply 1 change'}).click();
  await dialog(page).getByText('1 amount set in the game.').waitFor();
  assert.equal((await applied())[0].body.contracts[0].products[0].amount, 4300);
});
test('imports: a stopped contract is started, with its next delivery against cash; what the cap leaves is said', async (t) => {
  const page = await linked(t, {approved: true});
  await configure({importTerms: {CONTRACTthree: {unitPrice: 2.5, cap: 400}}});
  await supply(page);
  await setTo(page, 'Candle', 600);
  await applyImports(page).click();
  // The first dry run names the cap; the write is made again within it, and the rest is said.
  const candle = dialog(page).locator('.gw-line', {hasText: 'Candle'});
  await candle.locator('.gw-call.gw-neg', {hasText: "200 a week not covered: the importers' caps are reached."}).waitFor();
  assert.match(await candle.locator('.gw-num').textContent(), /to 400a week$/);
  assert.equal(await candle.locator('.gw-lvl u.cap').textContent(), 'cap 400');
  assert.equal(await dialog(page).getByRole('button', {name: 'Apply 1 change'}).isEnabled(), true);
  await dialog(page).getByRole('button', {name: 'Cancel'}).click();
  await configure({importTerms: {CONTRACTthree: {unitPrice: 2.5, cap: 1000}}});
  await applyImports(page).click();
  const restart = dialog(page).locator('.gw-line', {hasText: 'Candle'}).locator('.gw-call', {hasText: '3 Pier is stopped.'});
  await restart.waitFor();
  assert.match(await restart.textContent(), /This starts it again, with Repeating on\..*next delivery, day 36: \$1,500 of \$10,000/);
  assert.equal(await dialog(page).getByText(/not covered/).count(), 0);
  assert.equal(await dialog(page).locator('.gw-imp.stopped', {hasText: '3 Pier'}).count(), 1);
  await dialog(page).getByRole('button', {name: 'Apply 1 change'}).click();
  await dialog(page).getByText('1 amount set, 1 contract started in the game.').waitFor();
  assert.deepEqual((await applied())[0].body.contracts, [{id: 'CONTRACTthree', activate: true,
    products: [{itemName: 'ba:itemname_candle', warehouse: DEPOT_ADDRESS, amount: 600, expect: 500}]}]);
});
test('imports: plain amounts take one cap budget per importer, in the game\'s delivery order', async (t) => {
  const page = await linked(t, {approved: true});
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
    const keptWords = gwImportPlan(null).flatMap((l) => gwLineWords(l, false));
    gwImportRows = saved; gwTerms.clear();
    return {shared, capped, twice, started, kept, keptWords, depot, gifts};
  });
  assert.deepEqual(got.shared, [{at: got.depot, set: [['A', 800]], uncovered: 0, ahead: ['S']},
                                {at: got.gifts, set: [['B', 200], ['C', 400]], uncovered: 0, ahead: ['S']}]);
  assert.deepEqual(got.capped, [{at: got.depot, set: [['A', 800]], uncovered: 0, ahead: []},
                                {at: got.gifts, set: [['B', 200]], uncovered: 400, ahead: []}]);
  assert.deepEqual(got.twice, [{at: got.depot, set: [['E', 400]], uncovered: 0, ahead: []},
                               {at: got.gifts, set: [['E', 100]], uncovered: 300, ahead: []}]);
  assert.ok(got.keptWords.some((w) => w.includes("keeps its 300 a week: its importer's cap leaves it nothing this week")),
    JSON.stringify(got.keptWords));
  assert.deepEqual(got.kept, [{at: got.depot, set: [['A', 500]], uncovered: 0, ahead: []},
                              {at: got.gifts, set: [], uncovered: 200, ahead: []}]);
  assert.deepEqual(got.started, [{at: got.depot, set: [['F', 400]], uncovered: 0, ahead: []},
                                 {at: got.gifts, set: [['F', 0]], uncovered: 0, ahead: []}]);
});

test('imports: Smart Delivery contracts the write starts, and the lines it leaves as they are', async (t) => {
  const page = await linked(t, {approved: true});
  const got = await page.evaluate(() => {
    const saved = gwImportRows;
    const row = (s, slug, value, contracts, {smart = false, changed = true} = {}) => ({s, slug, item: slug.slice(-1).toUpperCase(),
      value, smart, changed, paused: false, total: value, impId: `${s}${slug}`, contracts});
    const c = (id, importer, order, amount, {active = true, product = 0, smart = false, agent = true} = {}) =>
      ({id, importer, group: 0, order, product, amount, active, smart, agent});
    const plan = (rows) => { gwImportRows = rows; return gwImportPlan(null); };
    // What the dialog draws: every sentence about a line sits on its card.
    const said = (lines) => gwImportView(lines.filter((l) => l.contracts.length || gwNeedsWord(l)), {ok: true, rows: []}, 'ready');
    gwTerms.clear();
    // S, stopped, is started by its X line at 500: its Y line, at 0 here, is
    // written too. Its Z product, at no line here, orders ahead of B at its
    // standing 300; T, started as well, holds Z at 0 and is not named.
    const S = (product, amount) => c('S', 'P', 0, amount, {active: false, smart: true, product});
    const T = (product, amount) => c('T', 'P', 1, amount, {active: false, smart: true, product});
    const lines = plan([
      row(3, 'ba:itemname_x', 500, [S(0, 100), T(0, 100)], {smart: true}),
      row(1, 'ba:itemname_y', 0, [S(1, 200)], {smart: true}),
      row(2, 'ba:itemname_z', 0, [S(2, 300), T(1, 0)], {smart: true, changed: false}),
      row(0, 'ba:itemname_z', 400, [c('B', 'P', 5, 100)]),
      row(1, 'ba:itemname_z', 400, [c('C', 'P', 6, 100)]),
    ]);
    const smart = lines.filter((l) => l.r.smart).map((l) => l.contracts.map(({c, amount}) => [c.id, amount]));
    const ahead = lines.filter((l) => !l.r.smart).map((l) => l.smartAhead.map((e) => [e.c.id, e.level]));
    const lead = said(lines);
    // A kept contract with the week covered, and a Smart line with no agent on its contract.
    const quiet = plan([row(3, 'ba:itemname_q', 0, [c('G', 'P', 2, 300)]),
                        row(0, 'ba:itemname_w', 700, [c('H', 'P', 3, 100, {smart: true, agent: false})], {smart: true})]);
    const words = quiet.map((l) => [gwNeedsWord(l), l.cause]);
    const lead2 = said(quiet);
    gwImportRows = saved; gwTerms.clear();
    return {smart, ahead, lead, words, lead2};
  });
  assert.deepEqual(got.smart, [[['S', 500], ['T', 500]], [['S', 0]]]);
  // S is named once per item for B and C, at its standing Z level; T's 0 is not named.
  assert.deepEqual(got.ahead, [[['S', 300]], [['S', 300]]]);
  assert.equal((got.lead.match(/orders first/g) || []).length, 1);
  assert.match(got.lead, /P's Smart Delivery contract for Z at HART\. Bare orders first and can use up to 300 of the cap\./);
  assert.deepEqual(got.words, [[true, 'caps'], [true, 'smartAgent']]);
  assert.match(got.lead2, /<b>Q<\/b>.*<b>P<\/b> keeps its 300 a week: a write never stops a contract; stop it in BizMan\./);
  assert.match(got.lead2, /<b>W<\/b>.*<b>No Smart Delivery contract here has a purchasing agent<\/b>\./);
  assert.doesNotMatch(got.lead2, /not covered/);
});

test('imports: a week the caps leave short with nothing to write is said, and not counted', async (t) => {
  const page = await linked(t, {approved: true});
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
// The board's own read after a schedule write (and, unless `undo` is false,
// its undo): from then on the fake worker builds the payload with the shop's
// print as the game answered it.
async function followPrints(page, key, {undo = true} = {}) {
  const follow = async (route) => {
    const req = route.request();
    const sent = JSON.parse(req.postData() || '{}');
    if (req.method() !== 'POST' || sent.dryRun || (sent.kind && sent.kind !== 'schedule')) return route.fallback();
    const res = await route.fetch();
    const body = await res.json();
    if (res.status() === 200 && body.after && body.after.print) {
      await page.evaluate(({key, print, undo, opened}) => {
        const d = JSON.parse(window.buildData || window.baseData);
        d.businesses.find((b) => b.key === key).shiftPrint = print;
        // The opening hours a full-cover write opens, and its undo closes again.
        const full = (d.staffing.find((r) => r.key === key) || {}).fullCover;
        if (full && (undo || opened)) full.openNow = !undo;
        window.buildData = JSON.stringify(d);
      }, {key, print: body.after.print, undo: !!body.undo, opened: !!body.openedHours});
    }
    await route.fulfill({response: res, json: body});
  };
  await page.route(`${mockUrl}/write/schedule`, follow);
  if (undo) await page.route(`${mockUrl}/write/undo`, follow);
}
const dryRunOf = (page, kind) => page.waitForRequest((req) => req.url().endsWith(`/write/${kind}`) && req.method() === 'POST'
  && JSON.parse(req.postData() || '{}').dryRun === true);
async function roster(page, key, plan = 'demand') {
  await page.evaluate(({key, plan}) => { spPlanWrite(key, plan); openSite(key); showPage('company'); }, {key, plan});
  return page.locator('#sp-roster');
}

test('schedule: the roster is written with only the people working here, and undone', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.getByText('24 h a week stay empty until 2 people are added').waitFor();
  await block.getByRole('button', {name: 'Write this roster to the game'}).click();
  await ready(page);
  await dialog(page).locator('.gw-plan', {hasText: 'Demand plan'}).waitFor();
  // Three figures now → after, the week as a pair of bars a day, the people as pills.
  assert.deepEqual(await dialog(page).locator('.gw-tile .v').allTextContents(),
    ['from 2 to 1', 'from 24 to 12', '1']);
  await dialog(page).getByText('Add 2 people to fill this plan: assign Dee Lund (unassigned) and hire 1 Cleaning; 24 h a week stay empty until then.').waitFor();
  assert.deepEqual(await dialog(page).locator('.gw-box.gw-warn .person').allTextContents(), ['DLDee Lundunassigned', '1 × Cleaningto hire']);
  const left = dialog(page).locator('.gw-box', {hasText: 'No shift here after this'});
  assert.deepEqual(await left.locator('.person').allTextContents(), ['ASAna SilvaCleaning']);
  const days = await dialog(page).locator('.gw-wd .gw-sr').allTextContents();
  assert.deepEqual(days.filter((d) => /^(Monday|Tuesday|Sunday)/.test(d)),
    ['Monday: 1 entry, 12 h → 1 entry, 12 h', 'Tuesday: 0 entries, 0 h → 0 entries, 0 h', 'Sunday: 1 entry, 12 h → 0 entries, 0 h']);
  await followPrints(page, GIFTS);
  const builds = await page.evaluate(() => window.builds);
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('HART. Gifts: 1 entry set in place of 2.').waitFor();
  await dialog(page).getByText('24 h a week stay empty').waitFor();
  // The board has read the write: its print is the game's new one.
  await page.waitForFunction(({n, key}) => window.builds > n && D.businesses.find((b) => b.key === key).shiftPrint !== '9c98d93a',
    {n: builds, key: GIFTS});
  const writes = await applied();
  // Neither Dee's entry (not assigned here yet) nor the hire's goes to the game.
  assert.deepEqual(writes[0].body, {dryRun: false, address: GIFTS_ADDRESS, expect: '9c98d93a', openAllHours: false,
    days: [{d: 1, shifts: [{f: 8, t: 20, employeeId: BEN, itemInstanceId: REGISTER}]}]});
  // Undone: Write again waits while the board shows the write's bytes (or older),
  // and asks the game from the board read after the undo. That read is held here.
  const release = await holdSave(page);
  await dialog(page).getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: the schedule at HART. Gifts is back as it was.').waitFor();
  const again = dialog(page).getByRole('button', {name: 'Write again'});
  assert.equal(await again.isDisabled(), true);
  assert.equal(await again.getAttribute('title'), 'Reading the game again…');
  assert.deepEqual((await applied()).map((w) => w.kind), ['schedule', 'undo']);
  release();
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('dialog.gw-dlg .gw-foot button')].find((x) => x.textContent === 'Write again'); return b && !b.disabled; });
  assert.equal(await page.evaluate((key) => D.businesses.find((b) => b.key === key).shiftPrint, GIFTS), '9c98d93a');
  const reask = dryRunOf(page, 'schedule');
  await again.click();
  assert.equal(JSON.parse((await reask).postData()).expect, '9c98d93a', 'the print of the board read after the undo');
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('HART. Gifts: 1 entry set in place of 2.').waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['schedule', 'undo', 'schedule']);
});

test('schedule: a board read that fails after an undo offers a refresh, and the re-do waits for it', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  await followPrints(page, GIFTS);
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write this roster to the game'}).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('HART. Gifts: 1 entry set in place of 2.').waitFor();
  await page.waitForFunction((key) => D.businesses.find((b) => b.key === key).shiftPrint !== '9c98d93a', GIFTS);
  // The save is not served after the undo: the board's follow read gives up.
  await page.route(`${mockUrl}/save`, (route) => route.fulfill({status: 500, json: {error: 'broken'},
    headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await dialog(page).getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: the schedule at HART. Gifts is back as it was.').waitFor();
  await dialog(page).getByRole('button', {name: 'Refresh the board'}).waitFor({timeout: 20000});
  assert.equal(await dialog(page).getByRole('button', {name: 'Write again'}).isDisabled(), true, 'never on stale bytes');
  // Served again, a refresh brings the board up to date and the re-do on.
  await page.unroute(`${mockUrl}/save`);
  await dialog(page).getByRole('button', {name: 'Refresh the board'}).click();
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('dialog.gw-dlg .gw-foot button')].find((x) => x.textContent === 'Write again'); return b && !b.disabled; }, null, {timeout: 20000});
  assert.equal(await dialog(page).getByRole('button', {name: 'Refresh the board'}).count(), 0);
  // The game changes between the undo and the re-do: the dry run says so, and the way on is a refresh.
  await page.route(`${mockUrl}/write/schedule`, (route) => route.fulfill({status: 200, headers: {'Access-Control-Allow-Origin': ORIGIN},
    json: {ok: false, kind: 'schedule', dryRun: true, business: 'HART. Gifts', siteError: 'changed', rows: [],
           before: {shifts: 2, print: 'x'}, after: {shifts: 1, print: 'y'}, removed: 2, added: 1, leftWithout: [], warnings: []}}));
  await dialog(page).getByRole('button', {name: 'Write again'}).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Refresh the board'}).waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: 'Write the week'}).count(), 0);
});

test('schedule: Write again from a board that has not caught up with the undo: the game answers changed, nothing is written', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  // The board follows the write, but not its undo: every board built after
  // the undo still shows the write's print.
  await followPrints(page, GIFTS, {undo: false});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write this roster to the game'}).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('HART. Gifts: 1 entry set in place of 2.').waitFor();
  await page.waitForFunction((key) => D.businesses.find((b) => b.key === key).shiftPrint !== '9c98d93a', GIFTS);
  await dialog(page).getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: the schedule at HART. Gifts is back as it was.').waitFor();
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('dialog.gw-dlg .gw-foot button')].find((x) => x.textContent === 'Write again'); return b && !b.disabled; }, null, {timeout: 20000});
  const stale = await page.evaluate((key) => D.businesses.find((b) => b.key === key).shiftPrint, GIFTS);
  assert.notEqual(stale, '9c98d93a', 'the board still shows the write');
  const reask = dryRunOf(page, 'schedule');
  await dialog(page).getByRole('button', {name: 'Write again'}).click();
  assert.equal(JSON.parse((await reask).postData()).expect, stale);
  // The game holds the undone week: the dry run answers changed, and the way on is a refresh.
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Refresh the board'}).waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: 'Write the week'}).count(), 0);
  const refresh = page.waitForRequest((req) => req.url().endsWith('/refresh') && req.method() === 'POST');
  await dialog(page).getByRole('button', {name: 'Refresh the board'}).click();
  await refresh;
  assert.deepEqual((await applied()).map((w) => w.kind), ['schedule', 'undo'], 'nothing written from the stale board');
});

test('schedule: a full-cover week undone and written again opens the hours again', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  await followPrints(page, GIFTS);
  const block = await roster(page, GIFTS, 'full');
  await block.getByRole('button', {name: 'Write this roster to the game'}).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText(/^HART\. Gifts: 2 entries set in place of 2, open 0 to 24 every day\.$/).waitFor();
  assert.equal((await applied())[0].body.openAllHours, true);
  // The board reads the write: the shop is open around the clock now.
  await page.waitForFunction((key) => D.staffing.find((r) => r.key === key).fullCover.openNow === true, GIFTS);
  await dialog(page).getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByRole('button', {name: 'Write again'}).waitFor();
  const reask = dryRunOf(page, 'schedule');
  await dialog(page).getByRole('button', {name: 'Write again'}).click();
  assert.equal(JSON.parse((await reask).postData()).openAllHours, true, 'the board read after the undo: shut again');
  await ready(page);
});

test('schedule: full cover opens every day 0 to 24, unless the player opts out', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS, 'full');
  await block.getByRole('button', {name: 'Write this roster to the game'}).click();
  const open = dialog(page).getByRole('switch', {name: 'Also open every day 0 to 24'});
  await open.waitFor();
  assert.equal(await open.getAttribute('aria-checked'), 'true');
  await dialog(page).locator('.gw-plan', {hasText: 'Full cover 24/7'}).waitFor();
  await open.click();
  // The game is asked again, without the opening hours.
  await page.locator('dialog.gw-dlg[data-phase="ready"] [role="switch"][aria-checked="false"]').waitFor();
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText(/^HART\. Gifts: 2 entries set in place of 2\.$/).waitFor();
  const body = (await applied())[0].body;
  assert.equal(body.openAllHours, false);
  assert.deepEqual(body.days, [{d: 1, shifts: [{f: 0, t: 12, employeeId: ANA, itemInstanceId: REGISTER},
    {f: 12, t: 24, employeeId: BEN, itemInstanceId: REGISTER}]}]);
});

test('schedule: never offered at a headquarters', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters({hq: true})});
  const block = await roster(page, GIFTS);
  await block.waitFor();
  assert.equal(await block.locator('[data-gw]').count(), 0);
  assert.equal(await page.evaluate((key) => gwRosterPlan(key), GIFTS), null);
  assert.deepEqual(await page.evaluate(() => gwScheduleSites()), [CORNER]);
});

test('schedule: a game that moved on answers 409 changed', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  await configure({refuseWrite: 'changed'});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write this roster to the game'}).click();
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('The game has moved on since this board was read. Nothing was changed.').waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: 'Refresh the board'}).count(), 1);
  assert.equal((await applied()).length, 0);
});

test('schedule: every planned shop, one after another', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write all 2 planned sites'}).click();
  await dialog(page).getByRole('heading', {name: 'Write all 2 planned sites'}).waitFor();
  await dialog(page).locator('.gw-where', {hasText: '1 of 2 · HART. Corner'}).waitFor();
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('HART. Corner: 1 entry set in place of 1.').waitFor();
  await dialog(page).getByRole('button', {name: 'Next shop · 2 of 2'}).click();
  await dialog(page).locator('.gw-where', {hasText: '2 of 2 · HART. Gifts'}).waitFor();
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText(/^HART\. Gifts: 1 entry set in place of 2\./).waitFor();
  // On to the end of the run, which sums it up; Undo holds the last shop written.
  await dialog(page).getByRole('button', {name: 'See the run'}).click();
  await dialog(page).getByText('2 shops written.').waitFor();
  assert.equal(await dialog(page).locator('.gw-steps i.d').count(), 2);
  assert.equal(await dialog(page).getByRole('button', {name: 'Undo HART. Gifts'}).count(), 1);
  const writes = await applied();
  assert.deepEqual(writes.map((w) => w.body.address), [{street: 'ba:street_broadway', number: 2}, GIFTS_ADDRESS]);
  assert.deepEqual(writes[0].body.days, [{d: 3, shifts: [{f: 8, t: 20, employeeId: 'CCCCemployeeCCCCCCCCCCCC',
    itemInstanceId: 'REGISTERaaaaaaaaaaaaaa==ay'}]}]);
});

test('schedule: a shop can be skipped, and one the game already holds is left out', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write all 2 planned sites'}).click();
  await dialog(page).locator('.gw-where', {hasText: '1 of 2 · HART. Corner'}).waitFor();
  await dialog(page).getByRole('button', {name: 'Skip this shop'}).click();
  await dialog(page).locator('.gw-where', {hasText: '2 of 2 · HART. Gifts'}).waitFor();
  assert.equal(await dialog(page).locator('.gw-steps i.s').count(), 1, 'the skipped shop is a hollow dot');
  // A run has no Cancel: Skip goes on, and the dialog's own Close stops the run.
  await dialog(page).locator('[data-gw-close]').click();
  assert.equal((await applied()).length, 0);
  // The Corner's game schedule made the plan: it drops out of "all".
  const left = await page.evaluate((corner) => {
    const row = D.staffing.find((r) => r.key === corner);
    row.current.list = [{d: 3, s: 1, f: 8, t: 20, p: 0}];
    return gwScheduleSites();
  }, CORNER);
  assert.deepEqual(left, [GIFTS]);
});

test('schedule: a run ends with its summary when its last shop fails or is skipped, with no Undo strip under the next dialog', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS);
  // First run: every shop fails, the last one too.
  await configure({refuseWrite: 'cannot_write:placement'});
  await block.getByRole('button', {name: 'Write all 2 planned sites'}).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('The game takes no changes while you are placing items.').waitFor();
  // Going on from a failure records the shop as not written.
  await dialog(page).getByRole('button', {name: 'Next shop · 2 of 2'}).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('The game takes no changes while you are placing items.').waitFor();
  await dialog(page).getByRole('button', {name: 'See the run'}).click();
  await dialog(page).getByText('0 shops written, 2 left out.').waitFor();
  assert.deepEqual(await dialog(page).locator('.gw-run small').allTextContents(), ['not written', 'not written']);
  assert.equal(await dialog(page).locator('.gw-steps').getAttribute('aria-label'), '0 written, 2 left out, 0 to go');
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Close'}).click();
  // Second run: the first shop written, the last one skipped.
  await configure({refuseWrite: null});
  await block.getByRole('button', {name: 'Write all 2 planned sites'}).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('HART. Corner: 1 entry set in place of 1.').waitFor();
  // Any Undo strip put up while a dialog is open, even for a moment, is counted.
  await page.evaluate(() => {
    window.stripsUnderDialogs = 0;
    new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => {
      if (n.id === 'gwToast' && document.querySelector('dialog.gw-dlg[open]')) window.stripsUnderDialogs++;
    }))).observe(document.body, {childList: true});
  });
  await dialog(page).getByRole('button', {name: 'Next shop · 2 of 2'}).click();
  await dialog(page).locator('.gw-where', {hasText: '2 of 2 · HART. Gifts'}).waitFor();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Skip this shop'}).click();
  await dialog(page).getByText('All 2 seen').waitFor();
  await dialog(page).getByText('1 shop written, 1 left out.').waitFor();
  assert.equal(await page.evaluate(() => window.stripsUnderDialogs), 0, 'no Undo strip under the next shop\'s dialog, nor under the summary');
  assert.deepEqual(await dialog(page).locator('.gw-run small').allTextContents(), ['1 entry', 'skipped']);
  // Undo from the end of the run reopens that shop inside the run, ready to be written again.
  await dialog(page).getByRole('button', {name: 'Undo HART. Corner'}).click();
  await dialog(page).getByText('Undone: the schedule at HART. Corner is back as it was.').waitFor();
  assert.match(await dialog(page).locator('.gw-where').textContent(), /1 of 2 · HART\. Corner/);
  assert.deepEqual(await dialog(page).locator('.gw-steps i').evaluateAll((dots) => dots.map((d) => d.className)), ['c', 's']);
  await dialog(page).getByRole('button', {name: 'Write again'}).click();
  await ready(page);
  assert.equal(await dialog(page).getByRole('button', {name: 'Write the week'}).isEnabled(), true);
  assert.deepEqual((await applied()).map((w) => w.kind), ['schedule', 'undo']);
  // Written again, the run goes back to its end, not through the skipped shop.
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('HART. Corner: 1 entry set in place of 1.').waitFor();
  await dialog(page).getByRole('button', {name: 'See the run'}).click();
  await dialog(page).getByText('1 shop written, 1 left out.').waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: 'Undo HART. Corner'}).count(), 1);
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Close'}).click();
  await page.locator('#gwToast').waitFor();  // the dialog closed: the strip is back
});

test('schedule: Undo on a shop in the middle of a run puts it back to be written, inside the run', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write all 2 planned sites'}).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('HART. Corner: 1 entry set in place of 1.').waitFor();
  assert.deepEqual(await dialog(page).locator('.gw-steps i').evaluateAll((dots) => dots.map((d) => d.className)), ['d', '']);
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('Undone: the schedule at HART. Corner is back as it was.').waitFor();
  // Its entry is cleared: the dot is the current one again, and it can be written again or skipped.
  assert.deepEqual(await dialog(page).locator('.gw-steps i').evaluateAll((dots) => dots.map((d) => d.className)), ['c', '']);
  await dialog(page).getByRole('button', {name: 'Skip this shop'}).click();
  await dialog(page).locator('.gw-where', {hasText: '2 of 2 · HART. Gifts'}).waitFor();
  assert.deepEqual(await dialog(page).locator('.gw-steps i').evaluateAll((dots) => dots.map((d) => d.className)), ['s', 'c']);
  assert.deepEqual((await applied()).map((w) => w.kind), ['schedule', 'undo']);
});

test('schedule: an undo with no answer in a run marks the shop unknown and the run goes on; a failed one reopened from the end goes back there', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write all 2 planned sites'}).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('HART. Corner: 1 entry set in place of 1.').waitFor();
  // The undo reaches the game, but no answer comes back.
  await page.route(`${mockUrl}/write/undo`, (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('The board is up to date').waitFor({timeout: 20000});
  await dialog(page).getByRole('button', {name: 'Next shop · 2 of 2'}).click();
  await dialog(page).locator('.gw-where', {hasText: '2 of 2 · HART. Gifts'}).waitFor();
  await ready(page);
  await page.unroute(`${mockUrl}/write/undo`);
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText(/^HART\. Gifts: 1 entry set in place of 2\./).waitFor();
  await dialog(page).getByRole('button', {name: 'See the run'}).click();
  assert.deepEqual(await dialog(page).locator('.gw-run small').allTextContents(), ['unknown, see the board', '1 entry']);
  // Undo reopens the Gifts shop from the end of the run; the game refuses it now: back to the run.
  await page.route(`${mockUrl}/write/undo`, (route) => (route.request().method() === 'POST'
    ? route.fulfill({status: 409, json: {error: 'nothing_to_undo'}, headers: {'Access-Control-Allow-Origin': ORIGIN}}) : route.continue()));
  await dialog(page).getByRole('button', {name: 'Undo HART. Gifts'}).click();
  await dialog(page).getByText('There is nothing left to undo').waitFor();
  await dialog(page).getByRole('button', {name: 'Back to the run'}).click();
  await dialog(page).getByText('All 2 seen').waitFor();
  assert.deepEqual(await dialog(page).locator('.gw-run small').allTextContents(), ['unknown, see the board', '1 entry'], 'still written');
});

test('schedule: Refresh the board after an undo the game refused, in a run, reads the game and keeps the shop written', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write all 2 planned sites'}).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('HART. Corner: 1 entry set in place of 1.').waitFor();
  // The game moved on: the undo is refused, the write stays in the game.
  await page.route(`${mockUrl}/write/undo`, (route) => (route.request().method() === 'POST'
    ? route.fulfill({status: 409, json: {error: 'changed'}, headers: {'Access-Control-Allow-Origin': ORIGIN}}) : route.continue()));
  await dialog(page).locator('.gw-foot').getByRole('button', {name: 'Undo'}).click();
  await dialog(page).getByText('The game has moved on since this board was read. Nothing was changed.').waitFor();
  let asked = 0;
  page.on('request', (req) => { if (req.url().endsWith('/write/schedule') && req.method() === 'POST') asked++; });
  const refresh = page.waitForRequest((req) => req.url().endsWith('/refresh') && req.method() === 'POST');
  await dialog(page).getByRole('button', {name: 'Refresh the board'}).click();
  await refresh;
  // The dialog stays on the refusal, with the run's way on; the write is not asked about again.
  assert.equal(await dialog(page).getAttribute('data-phase'), 'failed');
  assert.equal(asked, 0);
  await dialog(page).getByRole('button', {name: 'Next shop · 2 of 2'}).click();
  await dialog(page).locator('.gw-where', {hasText: '2 of 2 · HART. Gifts'}).waitFor();
  await ready(page, 20000);
  await dialog(page).getByRole('button', {name: 'Skip this shop'}).click();
  await dialog(page).locator('.gw-run small').first().waitFor();
  const summary = await dialog(page).locator('.gw-run small').allTextContents();
  assert.notEqual(summary[0], 'skipped', 'the shop the undo left written is not recorded as skipped');
  assert.deepEqual((await applied()).map((w) => w.kind), ['schedule']);
});

test('schedule: Refresh the board inside a run keeps the run and asks the game again', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write all 2 planned sites'}).click();
  await ready(page);
  await configure({refuseWrite: 'changed'});
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText('The game has moved on since this board was read. Nothing was changed.').waitFor();
  await configure({refuseWrite: null});
  const refresh = page.waitForRequest((req) => req.url().endsWith('/refresh') && req.method() === 'POST');
  await dialog(page).getByRole('button', {name: 'Refresh the board'}).click();
  await refresh;
  await ready(page, 20000);
  assert.match(await dialog(page).locator('.gw-where').textContent(), /1 of 2 · HART\. Corner/);
  assert.equal(await dialog(page).getByRole('button', {name: 'Write the week'}).isEnabled(), true);
});

test('schedule: a cover-only plan keeps the serving entries in the game', async (t) => {
  const data = JSON.parse(withRosters());
  const gifts = data.staffing.find((r) => r.key === GIFTS);
  gifts.shifts = [{d: 3, s: 0, f: 0, t: 12, p: 0, k: 'clean'}];
  Object.assign(gifts, {bench: [], addPeople: {assign: [], hire: [], people: 0, hoursUncovered: 0}});
  const page = await linked(t, {approved: true, data: JSON.stringify(data)});
  const block = await roster(page, GIFTS);
  await block.getByRole('button', {name: 'Write this roster to the game'}).click();
  await dialog(page).locator('.gw-plan', {hasText: 'Cleaning and security'}).waitFor();
  await dialog(page).getByText('The 1 serving entry in the game stays as it stands: this plan covers cleaning and security only.').waitFor();
  // Entries: the one written and the one kept, against the two now.
  assert.equal(await dialog(page).locator('.gw-tile .v').first().textContent(), '2');
  await dialog(page).getByRole('button', {name: 'Write the week'}).click();
  await dialog(page).getByText(/^HART\. Gifts: 2 entries set in place of 2\./).waitFor();
  assert.deepEqual((await applied())[0].body.days, [
    {d: 1, shifts: [{f: 8, t: 20, employeeId: ANA, itemInstanceId: REGISTER}]},
    {d: 3, shifts: [{f: 0, t: 12, employeeId: ANA, itemInstanceId: CLEAN}]}]);
});
