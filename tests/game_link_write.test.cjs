// The page's side of the game link's writes (docs/game-link-api.md, "Writes"),
// against the real mock: the built page and web/app.js, a synthetic company
// from tests/es3_fixture.py served by tools/game_link_mock.py, and a stub in
// place of the Pyodide worker that answers every build with that company's
// payload (setup in tests/_game_link_write.cjs). This file holds the uniform
// writes, the dialog and the undo gate; the game's approval and apply answers
// are tests/game_link_write_approval.test.cjs, imports
// tests/game_link_write_imports.test.cjs, and schedules, hires and rent
// tests/game_link_write_schedule.test.cjs. Install Playwright and its Chromium
// browser to run; NODE_PATH may point at an existing Playwright installation.
const {test} = require('node:test');
const H = require('./_game_link_write.cjs');
const {assert, en, enRe, textRe, TOKEN, APPROVAL, ORIGIN, GIFTS, BARE, configure, applied, linked, button, passOn, holdSave, holdRefresh, dialog, pair, WAITING, ready, kept, until, setAgain, setAgainOn, watchNow, mockStamp, otherCompany, NOT_LINKED, undoneAndOpen} = H;

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
  const asked = page.waitForRequest((req) => req.url() === `${H.mockUrl}/pair/request` && req.method() === 'POST');
  await gifts.click();
  // No approval yet: the write asks the game first, and waits for the player there.
  const request = await asked;
  // Not in the catalogue: linkClientName() writes this English itself.
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
  assert.match(await dress.textContent(), new RegExp('^Customerservice' + enRe('sp.gw.role.none').source + '.*' + enRe("sp.gw.uni.default").source + "$"));
  assert.match(await dialog(page).locator('.gw-role.kept').textContent(), new RegExp('^Cleaning' + enRe('sp.gw.role.kept').source + '$'),
    'a role already dressed is shown and left alone');
  assert.equal(await dialog(page).locator('[data-gw-b="apply"]').textContent(), en("sp.gw.uni.apply", {"n":1}));
  assert.equal((await applied()).length, 0, 'the dry run wrote nothing');
  const builds = await page.evaluate(() => window.builds);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  const writes = await applied();
  assert.equal(writes.length, 1);
  // skills null: every skill the shop's Uniforms window offers.
  assert.deepEqual(writes[0].body.sites, [{address: {street: 'ba:street_secondavenue', number: 10},
    skills: null, presetId: null}]);
  assert.equal(writes[0].body.dryRun, false);
  // The stamp moved; the board reads the game again, the dialog stays.
  await page.waitForFunction((n) => window.builds > n, builds);
  assert.equal(await dialog(page).isVisible(), true);
  await dialog(page).locator('[data-gw-b="undo"]').click();
  // Undone: said, and the write offered again once the board has read the game after it.
  await dialog(page).getByText(en("sp.gw.uni.undone", {"n":1})).waitFor();
  await dialog(page).locator('[data-gw-b="again"]').click();
  await ready(page);
  assert.equal(await dialog(page).locator('.gw-role.to').count(), 1, 'the role is to dress again');
  assert.deepEqual((await applied()).map((w) => w.kind), ['uniforms', 'undo']);
  // And it can be applied again.
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['uniforms', 'undo', 'uniforms']);
  await dialog(page).locator('.gw-foot').getByRole('button', {name: en("nav.dlg.close")}).click();
  // The strip names the second write, and undoes it.
  const strip = page.locator('#gwToast');
  await strip.getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  await strip.locator('[data-gw-undo]').click();
  await dialog(page).getByText(en("sp.gw.uni.undone", {"n":1})).waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['uniforms', 'undo', 'uniforms', 'undo']);
});

test('the page behind an open write dialog holds still, and scrolls again once it closes', async (t) => {
  const page = await linked(t, {approved: true});
  const overflow = () => page.evaluate(() => getComputedStyle(document.documentElement).overflowY);
  assert.equal(await overflow(), 'visible');
  await button(page, GIFTS).click();
  await ready(page);
  assert.equal(await overflow(), 'hidden');
  assert.equal(await dialog(page).locator('.gw-body').evaluate((b) => getComputedStyle(b).overscrollBehaviorY), 'contain');
  await dialog(page).getByRole('button', {name: en("nav.dlg.cancel")}).click();
  await page.waitForFunction(() => getComputedStyle(document.documentElement).overflowY === 'visible');
});

test('an approval survives a reload, and goes only to the linked mod on this computer', async (t) => {
  const page = await linked(t);
  const sentTo = [];
  page.on('request', (req) => { if (req.headers().authorization) sentTo.push(new URL(req.url()).origin); });
  let asks = 0;
  page.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks++; });
  await button(page, GIFTS).click();
  await ready(page);
  await dialog(page).getByRole('button', {name: en("nav.dlg.cancel")}).click();
  await page.reload();  // the page opens the remembered link by itself
  await page.waitForFunction(current => document.body.classList.contains('has-board')
    && document.getElementById('srcStatus').textContent === current, en('app.state.current'));
  await button(page, GIFTS).click();
  await ready(page);
  assert.equal(asks, 1, 'asked once, not again after the reload');
  assert.ok(sentTo.length >= 2);
  assert.deepEqual([...new Set(sentTo)], [H.mockUrl], 'the token goes to the linked mod and nowhere else');
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
  const all = button(page, GIFTS, en('sp.gw.uni.all', {n:2}));
  await all.click();
  assert.equal(await pair(page).count(), 0, 'the kept code is used, no prompt');
  await ready(page);
  // A row a shop, a small shirt a role.
  assert.deepEqual(await dialog(page).locator('.gw-shop .nm > span:last-child').allInnerTexts(), ['HART. Gifts', 'HART. Corner']);
  assert.match(await dialog(page).locator('.gw-verdict').innerText(), enRe("sp.gw.uni.dress", {"n":2}));
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.uni.done.many", {"preset":"Default","n":2,"shops":2})).waitFor();
  await dialog(page).locator('.gw-foot').getByRole('button', {name: en("nav.dlg.close")}).click();
  const strip = page.locator('#gwToast');
  await strip.getByText(en("sp.gw.uni.done.many", {"preset":"Default","n":2,"shops":2})).waitFor();
  // A redraw keeps the same strip, so a keyboard user on Undo stays there (#107).
  assert.equal(await page.evaluate(() => {
    const undo = document.querySelector('#gwToast [data-gw-undo]');
    undo.focus();
    wireAll();
    return document.activeElement === undo && document.querySelector('#gwToast [data-gw-undo]') === undo;
  }), true);
  await strip.locator('[data-gw-undo]').click();
  await dialog(page).getByText(en("sp.gw.uni.undone", {"n":2})).waitFor();
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
  const leave = dialog(page).locator('[data-gw-leave="' + BARE + '"]');
  await leave.waitFor();
  assert.match(await dialog(page).locator('.gw-shop.bad').textContent(), enRe("nav.dlg.refuse.nolocker.rule"));
  assert.equal(await dialog(page).locator('[data-gw-b="apply"]').isDisabled(), true);
  await leave.click();
  await ready(page);
  assert.equal(await dialog(page).locator('.gw-shop.out').count(), 1);
  assert.match(await dialog(page).locator('.gw-where').textContent(), enRe("sp.gw.uni.leftout", {"names":"HART. Bare"}));
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  const gifts = [{street: 'ba:street_secondavenue', number: 10}];
  assert.deepEqual(sent[1].sites.map((x) => x.address), gifts, 'asked again without it');
  assert.deepEqual((await applied())[0].body.sites.map((x) => x.address), gifts);
});

test('a uniform picked from the pills asks the game again with it, and the keyboard stays on the pill', async (t) => {
  const page = await linked(t, {approved: true});
  await page.route(`${H.mockUrl}/write/uniforms`, async (route) => {
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
  assert.equal(await dialog(page).locator('[data-gw-b="apply"]').isDisabled(), true);
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
  for (const expected of [en('sp.gw.uni.done.one', {preset:'Default', n:1, shop:'HART. Gifts'}), en('sp.gw.uni.none')]) {
    await button(page, GIFTS).click();
    await dialog(page).locator('[data-gw-b="apply"]').click();
    await dialog(page).getByText(expected).waitFor();
    if (expected === en('sp.gw.uni.none')) break;
    await dialog(page).locator('.gw-foot').getByRole('button', {name: en("nav.dlg.close")}).click();
    await dialog(page).waitFor({state: 'detached'});
  }
  assert.equal(await dialog(page).locator('[data-gw-b="undo"]').count(), 0);
  await dialog(page).locator('.gw-foot').getByRole('button', {name: en("nav.dlg.close")}).click();
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

/* Where the Overview's uniform buttons sit: inside their own finding row,
   clear of the row's text, its Details and its action, and never pushing the
   page sideways, on a desktop and on a phone. Measured at rest and again with
   the row's Details open, reached from the keyboard. */
test('the uniform buttons sit inside their finding row, clear of its text, at 1440 and 390 px', async (t) => {
  for (const width of [1440, 390]) {
    const page = await linked(t, {approved: true, viewport: {width, height: 900}});
    await page.evaluate(() => showPage('today'));
    await button(page, GIFTS, en('sp.gw.uni.all', {n:2})).waitFor();
    const measure = () => page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const meets = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      const rows = [...document.querySelectorAll('#alertSection .find')].filter((row) => row.querySelector('.gw-find'));
      const bad = [];
      for (const row of rows) {
        const r = box(row);
        const text = [...row.querySelectorAll(':scope > .mark, :scope .ov-t .site, :scope .ov-t .what, :scope .ov-t .ov-k, :scope .ov-now, '
          + ':scope > .ov-vz, :scope > .ov-det, :scope > .ov-ac, :scope > .ov-x')]
          .filter((el) => { const b = box(el); return b.width > 0 && b.height > 0; });
        for (const btn of row.querySelectorAll('.gw-find .gw-btn')) {
          const b = box(btn), name = btn.textContent.trim();
          if (b.left < r.left - 0.5 || b.right > r.right + 0.5 || b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5)
            bad.push(`${name}: outside its row`);
          for (const el of text) if (meets(b, box(el))) bad.push(`${name}: over .${el.className}`);
        }
        const btns = [...row.querySelectorAll('.gw-find .gw-btn')];
        btns.forEach((a, i) => btns.slice(i + 1).forEach((c) => { if (meets(box(a), box(c)))
          bad.push(`${a.textContent.trim()} and ${c.textContent.trim()} overlap`); }));
      }
      const html = document.documentElement;
      return {rows: rows.length, buttons: rows.reduce((n, row) => n + row.querySelectorAll('.gw-find .gw-btn').length, 0),
              bad, sideways: html.scrollWidth > html.clientWidth};
    });
    const rest = await measure();
    assert.ok(rest.rows >= 2 && rest.buttons >= 3, `${width}px: ${JSON.stringify(rest)}`);
    assert.deepEqual(rest.bad, [], `${width}px at rest`);
    assert.equal(rest.sideways, false, `${width}px: the page scrolls sideways`);
    // The uniform rows have nothing for Details to add: the buttons are the
    // change and the sentence is the finding (declutter O6-O10), so no Details.
    assert.equal(await button(page, GIFTS).evaluate((b) => !!b.closest('.find').querySelector('.ov-det')), false,
      `${width}px: no empty Details`);
  }
});

test('a mod that does not take the kind leaves the button disabled, with the reason', async (t) => {
  for (const writes of [['imports'], null]) {
    const page = await linked(t, {writes, approved: true});
    const gifts = button(page, GIFTS);
    assert.equal(await gifts.getAttribute('aria-disabled'), 'true', JSON.stringify(writes));
    assert.equal(await gifts.getAttribute('data-tip'), en("nav.dlg.mod.uniforms"));
    await gifts.click({force: true});
    assert.equal(await dialog(page).count(), 0, 'no dialog from a disabled button');
  }
});

test('an approval the game no longer knows is dropped and asked for again', async (t) => {
  const page = await linked(t, {stored: {link: H.mockUrl, token: 'forgottenByTheGame'}});
  await button(page, GIFTS).click();
  await pair(page).getByText(WAITING).waitFor();
  await ready(page);
  const approval = await kept(page);
  assert.equal(typeof approval, 'string');
  assert.notEqual(approval, 'forgottenByTheGame');
});

test('undo gate: Set again waits for a board built after the undo, then opens', async (t) => {
  const page = await linked(t, {approved: true});
  await button(page, GIFTS).click();
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  await until(async () => (await page.evaluate(() => LEDGER_SOURCE.link().stamp)) === await mockStamp(), 20000);
  const release = await holdSave(page);
  await dialog(page).locator('[data-gw-b="undo"]').click();
  await dialog(page).getByText(en("sp.gw.uni.undone", {"n":1})).waitFor();
  assert.equal(await setAgain(page).isDisabled(), true);
  await dialog(page).getByText(en("nav.dlg.reread.now")).waitFor();
  release();
  await setAgainOn(page, 20000);
  await dialog(page).getByText(en("nav.dlg.reread.done")).waitFor();
});

test('undo gate: a board built from the undo\'s state before its answer is handled opens it', async (t) => {
  const page = await linked(t, {approved: true});
  await button(page, GIFTS).click();
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  await until(async () => (await page.evaluate(() => LEDGER_SOURCE.link().stamp)) === await mockStamp(), 20000);
  // The undo's answer is held; the game has refreshed already, and the
  // watcher builds its bytes before the answer comes in.
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(`${H.mockUrl}/write/undo`, async (route) => {
    const res = await route.fetch();
    await held;
    await passOn(route, res);
  });
  const builds = await page.evaluate(() => window.builds);
  await dialog(page).locator('[data-gw-b="undo"]').click();
  await until(async () => (await applied()).length === 2, 8000);
  await watchNow(page);
  await page.waitForFunction((n) => window.builds > n, builds);
  const built = await page.evaluate(() => window.builds);
  release();
  await dialog(page).getByText(en("sp.gw.uni.undone", {"n":1})).waitFor();
  // The follow finds the board already current: no build, and the gate opens.
  await setAgainOn(page, 20000);
  assert.equal(await page.evaluate(() => window.builds), built, 'no second build of the same bytes');
});

test('undo gate: a board built with nothing new to say leaves Set again, and the focus on it, as it was', async (t) => {
  const page = await linked(t, {approved: true});
  await undoneAndOpen(page);
  await setAgain(page).focus();
  await setAgain(page).evaluate((b) => { b.dataset.kept = 'yes'; });
  // The game refreshes on its own: a new stamp, the same company, another board built.
  const health = async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({response: res, json: Object.assign(body, {stamp: `${body.stamp}-again`})});
  };
  const save = async (route) => {
    const headers = Object.assign({}, route.request().headers());
    delete headers['if-none-match'];
    const res = await route.fetch({headers});
    const stamp = `${res.headers()['x-game-link-stamp']}-again`;
    await route.fulfill({response: res, headers: Object.assign({}, res.headers(), {'x-game-link-stamp': stamp, etag: `"${stamp}"`})});
  };
  await page.route(`${H.mockUrl}/health`, health);
  await page.route(`${H.mockUrl}/save`, save);
  const builds = await page.evaluate(() => window.builds);
  await watchNow(page);
  await page.waitForFunction((n) => window.builds > n, builds);
  assert.equal(await setAgain(page).getAttribute('data-kept'), 'yes', 'the same button: the dialog was not drawn again');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.kept), 'yes');
});

test('undo gate: open, then a board of another company closes it again', async (t) => {
  const page = await linked(t, {approved: true});
  await undoneAndOpen(page);
  // The game loads another of the character's saves before the player clicks.
  await otherCompany(page);
  await watchNow(page);
  await dialog(page).getByText(NOT_LINKED).waitFor({timeout: 20000});
  assert.equal(await setAgain(page).isDisabled(), true);
  assert.equal(await setAgain(page).getAttribute('title'), en("nav.dlg.unlinked"));
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
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  await page.waitForFunction(expected => document.getElementById('srcStatus').textContent.startsWith(expected), en('app.build.failed'), {timeout: 20000});
  assert.equal(await page.evaluate(() => LEDGER_SOURCE.link().stamp), before, 'not the stamp of bytes the board did not take');
  assert.notEqual(await mockStamp(), before);
  await watchNow(page);
  await page.waitForFunction(current => document.getElementById('srcStatus').textContent === current, en('app.state.current'), {timeout: 20000});
  assert.equal(await page.evaluate(() => LEDGER_SOURCE.link().stamp), await mockStamp());
});
test('an apply answering ok false, or for another kind, is uncertain and sent once each', async (t) => {
  const page = await linked(t, {approved: true});
  let applies = 0, answer = {ok: false, kind: 'uniforms', dryRun: false, stamp: 'x', rows: []};
  await page.route(`${H.mockUrl}/write/uniforms`, (route) => {
    if (JSON.parse(route.request().postData() || '{}').dryRun) return route.continue();
    applies++;
    return route.fulfill({status: 200, json: answer, headers: {'Access-Control-Allow-Origin': ORIGIN}});
  });
  await button(page, GIFTS).click();
  for (const wrong of [{ok: false, kind: 'uniforms'}, {ok: true, kind: 'imports'}]) {
    answer = {...wrong, dryRun: false, stamp: 'x', rows: []};
    const sent = applies;
    const release = await holdRefresh(page);
    await dialog(page).locator('[data-gw-b="apply"]').click();
    await dialog(page).getByText(en("nav.dlg.uncertain.text")).waitFor();
    await release();
    await dialog(page).locator('[data-gw-b="apply"]').waitFor({timeout: 30000});
    assert.equal(applies, sent + 1, JSON.stringify(wrong));
  }
});

test('a dry run answering for another kind cannot be read', async (t) => {
  const page = await linked(t, {approved: true});
  await page.route(`${H.mockUrl}/write/uniforms`, (route) => route.fulfill({status: 200,
    json: {ok: true, kind: 'schedule', dryRun: true, rows: []}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await dialog(page).getByText(en('app.link.write.unread')).waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: en('nav.dlg.tryagain')}).count(), 1);
});

test('Apply clicked twice sends one write', async (t) => {
  const page = await linked(t, {approved: true});
  await button(page, GIFTS).click();
  await ready(page);
  await page.evaluate(() => {
    const btn = document.querySelector('dialog.gw-dlg .gw-foot [data-gw-b="apply"]');
    btn.click(); btn.click();
  });
  await dialog(page).getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  assert.equal((await applied()).length, 1);
});

test('names from the game are shown as text, never as markup', async (t) => {
  const page = await linked(t, {approved: true});
  const hostile = '<img src=x onerror="window.pwned=1">';
  await page.route(`${H.mockUrl}/write/uniforms`, async (route) => {
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
  assert.match(await dialog(page).locator('.gw-read').textContent(), textRe('sp.gw.role.to.read', {preset:hostile}));
  assert.equal(await dialog(page).locator('img').count(), 0);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(`${hostile} is on 1 role at HART. Gifts.`).waitFor();
  assert.equal(await dialog(page).locator('img').count(), 0);
  assert.equal(await page.evaluate(() => window.pwned), undefined);
});
