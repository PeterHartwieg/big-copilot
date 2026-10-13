// The game link's writes: the game's approval (asked, kept, dropped, waited
// out) and how the page reads each answer to a dry run or an apply. Setup and
// helpers are tests/_game_link_write.cjs.
const {test} = require('node:test');
const H = require('./_game_link_write.cjs');
const {assert, en, enRe, APPROVAL, ORIGIN, GIFTS, BARE, configure, applied, linked, button, passOn, holdRefresh, dialog, pair, WAITING, ready, kept, until} = H;

for (const [outcome, said] of [['deny', en('nav.dlg.say.notallowed')], ['expire', en('nav.dlg.say.noanswergame')],
                                ['popup_open', en('nav.dlg.pair.popup')]]) {
  test(`the game\'s approval: ${outcome}`, async (t) => {
    const page = await linked(t);
    await configure({pair: outcome});
    await button(page, GIFTS).click();
    await dialog(page).getByText(said, {exact: true}).waitFor();
    assert.equal(await pair(page).count(), 0);
    assert.equal(await kept(page), null);
    // Ask again asks the game once more.
    await configure({pair: 'approve'});
    await dialog(page).locator('[data-gw-again]').click();
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
  await dialog(page).getByText(en("nav.dlg.say.notallowed"), {exact: true}).waitFor();
  await dialog(page).locator('[data-gw-again]').click();
  await dialog(page).getByText(en("nav.dlg.say.notallowed"), {exact: true}).waitFor();
  await dialog(page).locator('[data-gw-again]').click();
  // A wait after a denial is never waited out on its own, however short.
  await dialog(page).getByText(en("nav.dlg.throttled.text", {"n":3})).waitFor();
  const again = dialog(page).locator('[data-gw-again]');
  assert.equal(await again.isDisabled(), true);
  const sent = asks.length;
  // Ask again comes back once the wait has run out.
  await page.waitForFunction(() => {
    const b = document.querySelector('dialog.gw-dlg [data-gw-again]');
    return b && !b.disabled;
  });
  assert.equal(asks.length, sent, 'no request of its own while the player waits');
  assert.equal(await again.isEnabled(), true, 'Ask again comes back once the wait has run out');
  await configure({pair: 'approve'});
  await again.click();
  await ready(page);
});
test('the game\'s approval: a long wait on a request still open is said, not waited out', async (t) => {
  const page = await linked(t);
  await page.route(`${H.mockUrl}/pair/request`, (route) => route.fulfill({status: 429,
    json: {error: 'throttled', retryAfter: 50}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await dialog(page).getByText(en("nav.dlg.throttled.text", {"n":50})).waitFor();
  assert.equal(await dialog(page).locator('[data-gw-again]').isDisabled(), true);
});
test('the game\'s approval: a game that does not take the request', async (t) => {
  const page = await linked(t);
  await configure({pair: 'busy'});
  await button(page, GIFTS).click();
  await dialog(page).getByText(en("nav.dlg.nottaken.text")).waitFor();
  assert.equal(await kept(page), null);
});

test('the game\'s approval: a site the mod does not take, and a request the game forgot', async (t) => {
  const page = await linked(t);
  await page.route(`${H.mockUrl}/pair/request`, (route) => route.fulfill({status: 403,
    json: {error: 'origin_not_allowed'}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await dialog(page).getByText(en("nav.dlg.origin.text")).waitFor();
  await dialog(page).locator('.gw-foot').getByRole('button', {name: en("nav.dlg.close")}).click();
  await page.unroute(`${H.mockUrl}/pair/request`);
  await page.route(`${H.mockUrl}/pair/status**`, (route) => route.fulfill({status: 404,
    json: {error: 'not_found'}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await dialog(page).getByText(en("nav.dlg.say.noanswergame"), {exact: true}).waitFor();
});

test('the game\'s approval: approved, but the one answer with the token was lost', async (t) => {
  const page = await linked(t);
  await page.route(`${H.mockUrl}/pair/status**`, (route) => route.fulfill({status: 200,
    json: {state: 'approved'}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await dialog(page).getByText(en("nav.dlg.lost.text")).waitFor();
  assert.equal(await kept(page), null);
});
test('cancelling the wait sends nothing more, and the next ask picks the open question up', async (t) => {
  const page = await linked(t, {clock: true});
  await configure({pairDelay: 60});
  const sent = [];
  page.on('request', (req) => sent.push(new URL(req.url()).pathname));
  await button(page, GIFTS).click();
  await pair(page).getByText(WAITING).waitFor();
  await pair(page).getByRole('button', {name: en("nav.dlg.cancel")}).click();
  await dialog(page).getByText(en("nav.dlg.say.notapproved"), {exact: true}).waitFor();
  const at = sent.length;
  // A negative check: run three virtual seconds, past the one-second
  // pair-status poll, so any timer left behind by the Cancel fires. A request
  // reaches the 'request' listener a moment after it is sent, so give the
  // events a short real settle before looking.
  await page.clock.runFor(3000);
  await page.waitForTimeout(300);
  assert.deepEqual(sent.slice(at).filter((p) => p.startsWith('/write/') || p.startsWith('/pair/')), [],
    'no write and no further look at the request');
  assert.equal((await applied()).length, 0);
  // The game's question is still open: asking again waits on it, not a second one.
  await dialog(page).locator('[data-gw-again]').click();
  await pair(page).getByText(en("nav.dlg.waiting.open")).waitFor();
  await configure({pairDelay: 0});
  await ready(page);
  assert.equal(sent.filter((p) => p === '/pair/request').length, 1);
});

test('a Cancel before the game has answered the request still leaves the question to resume', async (t) => {
  const page = await linked(t);
  await configure({pairDelay: 60});
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route(`${H.mockUrl}/pair/request`, async (route) => {
    const res = await route.fetch();
    await held;
    await passOn(route, res);
  });
  const asks = [];
  page.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks.push(1); });
  await button(page, GIFTS).click();
  await pair(page).getByText(en("nav.dlg.say.asking")).waitFor();
  await pair(page).getByRole('button', {name: en("nav.dlg.cancel")}).click();
  await dialog(page).getByText(en("nav.dlg.say.notapproved"), {exact: true}).waitFor();
  release();
  await page.waitForTimeout(300);
  await dialog(page).locator('[data-gw-again]').click();
  await pair(page).getByText(en("nav.dlg.waiting.open")).waitFor();
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
  await dialog(page).getByText(en("nav.dlg.notlinked.text")).waitFor();
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
    await dialog(page).getByRole('button', {name: en("nav.dlg.cancel")}).click();
    await dialog(page).waitFor({state: 'detached'});
  }
  assert.equal(asks.length, 1, 'asked once, not once per write');
});

test('a short wait on the game is waited out once, a second is said', async (t) => {
  const page = await linked(t);
  let refusals = 0;
  await page.route(`${H.mockUrl}/pair/request`, (route) => (refusals++ < 1
    ? route.fulfill({status: 429, json: {error: 'throttled', retryAfter: 1}, headers: {'Access-Control-Allow-Origin': ORIGIN}})
    : route.continue()));
  await button(page, GIFTS).click();
  await pair(page).getByText(enRe('nav.dlg.retry.text', {n:1})).waitFor();
  await ready(page);
  // Refused twice in one ask, on a page with no approval: the second wait is the player's.
  const other = await linked(t);
  await other.route(`${H.mockUrl}/pair/request`, (route) => route.fulfill({status: 429,
    json: {error: 'throttled', retryAfter: 1}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  let asks = 0;
  other.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks++; });
  await button(other, GIFTS).click();
  await dialog(other).getByText(en("nav.dlg.throttled.text", {"n":1})).waitFor();
  assert.equal(asks, 2);
});

test('a question the game never answers ends with its own deadline', async (t) => {
  const page = await linked(t);
  await page.route(`${H.mockUrl}/pair/request`, (route) => route.fulfill({status: 202,
    json: {requestId: 'x', expiresIn: 1}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await page.route(`${H.mockUrl}/pair/status**`, (route) => route.fulfill({status: 200,
    json: {state: 'pending'}, headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await button(page, GIFTS).click();
  await pair(page).getByText(WAITING).waitFor();
  await dialog(page).getByText(en("nav.dlg.say.noanswergame"), {exact: true}).waitFor({timeout: 12000});
});

test('a 401 drops only the approval that was sent, and another tab\'s newer one is tried before the game is asked', async (t) => {
  const page = await linked(t, {stored: {link: H.mockUrl, token: 'sentAndRefused'}});
  await configure({pairDelay: 60, tokens: {newer: ORIGIN}});
  let first = true;
  await page.route(`${H.mockUrl}/write/uniforms`, async (route) => {
    if (route.request().method() !== 'POST' || !first) return route.continue();
    first = false;
    // Another tab stored a newer approval while this write was on its way.
    await page.evaluate(({key, link}) => localStorage.setItem(key, JSON.stringify({[link]: 'newer'})),
      {key: APPROVAL, link: H.mockUrl});
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
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("nav.dlg.notpaired.text")).waitFor({timeout: 15000});
  assert.equal(asks, 1);
  assert.equal((await applied()).length, 0);
});

test('the game\'s approval: after 30 s the dialog asks whether the game can be seen, and its clock runs on', async (t) => {
  const page = await linked(t, {clock: true});
  await configure({pairDelay: 60});
  // This scenario tests the dialog's elapsed time. Keep the status reply in
  // the browser's clock domain: advancing virtual seconds can otherwise
  // abort a real HTTP poll before the mock gets any wall-clock time to answer.
  await page.evaluate(base => {
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => String(input?.url || input).startsWith(base + '/pair/status?')
      ? Promise.resolve(new Response(JSON.stringify({state: 'pending'}), {headers: {'Content-Type': 'application/json'}}))
      : realFetch(input, init);
  }, H.mockUrl);
  await button(page, GIFTS).click();
  await pair(page).getByText(WAITING).waitFor();
  const cancel = pair(page).locator('.gw-foot').getByRole('button', {name: en("nav.dlg.cancel")});
  await cancel.focus();
  // Freeze after setup so assertion polling cannot hide a late prompt.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  // Run every interval tick: fastForward skips recurring callbacks and models
  // a suspended tab, not the continuously visible approval clock tested here.
  await page.clock.runFor(20000);
  assert.equal(await pair(page).getByText(en("nav.dlg.say.still")).isVisible(), false);
  await page.clock.runFor(11000);
  assert.equal(await pair(page).getByText(en("nav.dlg.say.still")).isVisible(), true);
  assert.equal(await pair(page).getByText(en("nav.dlg.quiet.lead")).isVisible(), true);
  // The keyboard stays on Cancel through the repaint.
  assert.equal(await page.evaluate(() => document.activeElement.dataset.gwB), en('nav.dlg.cancel'));
  const meta = pair(page).locator('.gw-meta');
  const before = await meta.textContent();
  // The clock keeps going without waiting another real second.
  await page.clock.runFor(1000);
  assert.notEqual(await meta.textContent(), before, 'the clock keeps going');
  await cancel.click();
});

test('an approval the game keeps turning down is asked for once per click', async (t) => {
  const page = await linked(t, {approved: true});
  await configure({rejectTokens: true});
  const asks = [];
  page.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks.push(req.url()); });
  await button(page, GIFTS).click();
  await dialog(page).getByText(en("nav.dlg.notpaired.text")).waitFor();
  assert.equal(asks.length, 1, 'one re-ask, then it ends');
});

test('a 401, the game\'s approval, a busy game and a 401 again ask the game once', async (t) => {
  const page = await linked(t, {stored: {link: H.mockUrl, token: 'forgottenByTheGame'}});
  // The kept approval is turned down; the new one meets a busy game, then is
  // turned down too: the write asked for it itself, so it asks no second time.
  const answers = [[401, {error: 'not_paired'}], [503, {error: 'busy'}], [401, {error: 'not_paired'}]];
  await page.route(`${H.mockUrl}/write/uniforms`, (route) => {
    if (route.request().method() !== 'POST' || !answers.length) return route.continue();
    const [status, json] = answers.shift();
    return route.fulfill({status, json, headers: {'Access-Control-Allow-Origin': ORIGIN}});
  });
  let asks = 0;
  page.on('request', (req) => { if (req.url().endsWith('/pair/request')) asks++; });
  await button(page, GIFTS).click();
  await dialog(page).getByText(en("nav.dlg.notpaired.text")).waitFor({timeout: 15000});
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
  await dialog(page).locator('[data-gw-b="apply"]').click();
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
  await page.route(`${H.mockUrl}/pair/status**`, async (route) => {
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
  await dialog(page).getByText(en("nav.dlg.notlinked.text")).waitFor();
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
  await page.route(`${H.mockUrl}/health`, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({response: res, json: Object.assign(body, {company: 'Other Co', stamp: `${body.stamp}-other`})});
  });
  await page.route(`${H.mockUrl}/save`, (route) => {
    const headers = Object.assign({}, route.request().headers());
    delete headers['if-none-match'];
    return route.continue({headers});
  });
  await page.evaluate(() => { LEDGER_SOURCE.refresh(); });
  await dialog(page).getByText(en("nav.dlg.notlinked.text")).waitFor({timeout: 15000});
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
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await pair(page).getByText(WAITING).waitFor();
  await dryRuns;  // asked afresh, for the player to review
  await ready(page);
  assert.equal(applies, 1);
  assert.equal((await applied()).length, 0);
  await configure({refuseWrite: null});
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  assert.equal(applies, 2);
});
test('a game that moved on answers 409 changed, and the dialog offers a refresh', async (t) => {
  const page = await linked(t, {approved: true});
  await configure({refuseWrite: 'changed'});
  await button(page, GIFTS).click();
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("nav.dlg.say.moved"), {exact: true}).waitFor();
  const refresh = page.waitForRequest((req) => req.url().endsWith('/refresh') && req.method() === 'POST');
  await dialog(page).getByRole('button', {name: en('nav.dlg.refresh')}).click();
  await refresh;  // Update asked the game for its current state
  await dialog(page).waitFor({state: 'detached'});
  assert.equal((await applied()).length, 0);
});

test('uniforms name the save they were planned from; another one loaded since answers changed', async (t) => {
  const page = await linked(t, {approved: true});
  const sent = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/write/uniforms') && req.method() === 'POST') sent.push(JSON.parse(req.postData()));
  });
  await button(page, GIFTS).click();
  await ready(page);
  // The game loads another of the character's saves; the board has not read it yet.
  await configure({company: 'Other Co'});
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("nav.dlg.say.moved"), {exact: true}).waitFor();
  assert.deepEqual(sent.map((body) => [body.dryRun, body.expect]),
    [[true, {character: 'default', company: 'Link Co'}], [false, {character: 'default', company: 'Link Co'}]]);
  assert.equal((await applied()).length, 0);
});

test('a refusal names the rule, the shop and the fix, and Apply stays off', async (t) => {
  const page = await linked(t, {approved: true});
  // The shop with no locker, asked for directly: the dry run already refuses.
  await page.evaluate((key) => gwUniforms([key]), BARE);
  // One red card a rule: the rule, the shop as a chip, the fix on its own line.
  const refusal = dialog(page).locator('.gw-no');
  await refusal.getByText(en('nav.dlg.refuse.nolocker.rule') + '.').waitFor();
  assert.equal(await refusal.count(), 1);
  assert.deepEqual(await refusal.locator('.gw-chip').allInnerTexts(), ['HART. Bare']);
  assert.equal(await refusal.locator('.fix').innerText(), en("nav.dlg.refuse.nolocker.fix"));
  assert.match(await dialog(page).locator('.gw-verdict').innerText(), enRe("nav.dlg.say.refuses"));
  assert.equal(await dialog(page).locator('[data-gw-b="apply"]').isDisabled(), true);
  await dialog(page).locator('.gw-foot').getByRole('button', {name: en("nav.dlg.close")}).click();
  // A schedule answer's own refusal is read from siteError, and a 409's leading row is not said twice.
  const said = await page.evaluate(() => [
    gwRefusals({kind: 'schedule', object: () => 'HART. Gifts'}, {siteError: 'headquarters', rows: []}),
    gwRefusals({kind: 'schedule', object: () => 'HART. Gifts'}, {siteError: 'headquarters', rows: [{error: 'headquarters'}]}),
  ]);
  for (const html of said) {
    assert.equal((html.match(/class="gw-no"/g) || []).length, 1);
    assert.match(html, enRe("nav.dlg.refuse.hq.rule"));
  }
  // And an apply the game refuses after a clean dry run.
  await configure({refuseWrite: 'cannot_write:placement'});
  await button(page, GIFTS).click();
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en('nav.dlg.cannot.placement.text') + '. ' + en('nav.dlg.unchanged')).waitFor();
  await configure({refuseWrite: null});
  await dialog(page).getByRole('button', {name: en('nav.dlg.tryagain')}).click();
  await ready(page);
  assert.equal((await applied()).length, 0);
});

test('a busy game is retried a second apart, three times, then named', async (t) => {
  const page = await linked(t, {approved: true});
  await configure({busyWrites: 2});
  await button(page, GIFTS).click();
  await ready(page, 10000);
  await dialog(page).getByRole('button', {name: en("nav.dlg.cancel")}).click();
  await configure({busyWrites: 5});
  await button(page, GIFTS).click();
  await dialog(page).getByText(en("nav.dlg.say.busy"), {exact: true}).waitFor({timeout: 10000});
  // One try and three retries spent four of the five busy answers.
  assert.equal((await configure({})).busyWrites, 1);
  await dialog(page).getByRole('button', {name: en('nav.dlg.tryagain')}).click();
  await ready(page, 10000);
});

test('an apply that gets no answer is not sent again: the board reads the game, then asks afresh', async (t) => {
  const page = await linked(t, {approved: true});
  // The apply reaches nothing; the dry runs go through.
  let applies = 0;
  await page.route(`${H.mockUrl}/write/uniforms`, (route) => {
    if (JSON.parse(route.request().postData() || '{}').dryRun) return route.continue();
    applies++;
    return route.abort();
  });
  const refresh = page.waitForRequest((req) => req.url().endsWith('/refresh') && req.method() === 'POST');
  const release = await holdRefresh(page);
  await button(page, GIFTS).click();
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("nav.dlg.uncertain.text")).waitFor();
  await release();
  await refresh;  // the board asks the game for its state first
  await ready(page, 20000);
  assert.equal(await dialog(page).locator('[data-gw-b="apply"]').isEnabled(), true);
  assert.equal(applies, 1, 'never sent twice on its own');
  assert.equal((await applied()).length, 0);
  assert.equal(await page.locator('#gwToast').count(), 0);
});

test('an apply whose answer cannot be read is uncertain too', async (t) => {
  const page = await linked(t, {approved: true});
  let applies = 0;
  await page.route(`${H.mockUrl}/write/uniforms`, async (route) => {
    if (JSON.parse(route.request().postData() || '{}').dryRun) return route.continue();
    applies++;
    const res = await route.fetch();  // applied in the mock, then the answer is garbled
    return route.fulfill({response: res, body: '{"ok": tr'});
  });
  const release = await holdRefresh(page);
  await button(page, GIFTS).click();
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("nav.dlg.uncertain.text")).waitFor();
  await release();
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
  await page.route(`${H.mockUrl}/save`, async (route) => {
    saves++;
    const res = await route.fetch().catch(() => null);  // the page may be gone
    if (!res) return;
    if (saves === 1) await held;  // the read after the apply, still under way
    // The test ends once the second read is asked for, before its answer.
    await passOn(route, res);
  });
  await button(page, GIFTS).click();
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  const until = async (test, ms) => {
    const end = Date.now() + ms;
    while (!test() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50));
  };
  await until(() => saves >= 1, 8000);
  await dialog(page).locator('[data-gw-b="undo"]').click();
  await dialog(page).getByText(en("sp.gw.uni.undone", {"n":1})).waitFor();
  assert.equal(saves, 1, 'the first read still holds');
  release();
  await until(() => saves >= 2, 8000);
  assert.equal(saves, 2, 'the undo is read as soon as the first read is done');
});
