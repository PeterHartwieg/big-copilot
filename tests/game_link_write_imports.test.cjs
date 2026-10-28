// The game link's writes: the imports write (Set to, caps, Smart Delivery,
// lock windows), the fixed strip and dialog on a phone, and Try again. Setup
// and helpers are tests/_game_link_write.cjs.
const {test} = require('node:test');
const H = require('./_game_link_write.cjs');
const {assert, en, enRe, textEn, textRe, TOKEN, ORIGIN, GIFTS, configure, applied, linked, button, holdSave, dialog, pair, WAITING, ready, DEPOT_ADDRESS, supply, importRow, setTo, applyImports, drawnPayload, footOnScreen, withRosters, dryRunOf, roster} = H;

test('imports: the Set to figure is written, and undone', async (t) => {
  const page = await linked(t, {approved: true});
  const plan = await supply(page);
  assert.equal(await plan.locator('[data-gw="imports"]').count(), 0, 'nothing to apply yet');
  await setTo(page, 'Paperbag', 4200);
  // The button wears the count; its name says it whole.
  assert.equal(await applyImports(page).getAttribute('aria-label'), en('sb.apply.name', {label:en('sb.apply.all'), n:1}));
  assert.equal(await applyImports(page).locator('.n').textContent(), '1');
  await applyImports(page).click();
  await ready(page);
  // Every write names its site: one depot's changes name the depot.
  assert.match(await dialog(page).locator('.gw-where').textContent(), /HART\. Depot/);
  // A card a material under its depot: now → after, the contracts as pills.
  assert.match(await dialog(page).locator('.gw-depot').textContent(), /HART\. Depot/);
  const line = dialog(page).locator('.gw-line', {hasText: 'Paperbag'});
  assert.equal(await line.count(), 1);
  assert.match(await line.locator('.gw-num').textContent(), new RegExp('^' + enRe('sp.gw.tile.from').source + ' 3,800 ' + enRe('sp.gw.tile.to').source + ' 4,200' + enRe('sb.unit.stock').source + '$'));
  assert.deepEqual(await line.locator('.gw-imp').allTextContents(), ['1. 1Jet Cargo Imports', '2. Seaside Internationals' + en('sb.gw.stopped') + en('sb.gw.noAgent')]);
  assert.match(await dialog(page).locator('.gw-verdict').textContent(), enRe("sb.gw.takes.one"));
  // The board the link reads after the write holds what it wrote.
  await page.evaluate(() => {
    const d = JSON.parse(window.baseData);
    Object.values(d.supply.factories.depots).forEach((l) => ((l['ba:itemname_paperbag'] || {}).contracts || [])
      .forEach((c) => { if (c.id === 'CONTRACTone') c.amount = 4200; }));
    window.buildData = JSON.stringify(d);
  });
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sb.gw.done", {parts:en("sb.gw.done.set", {n:1}, {cap: true})})).waitFor();
  const writes = await applied();
  assert.deepEqual(writes[0].body, {dryRun: false, contracts: [{id: 'CONTRACTone', activate: false,
    products: [{itemName: 'ba:itemname_paperbag', warehouse: DEPOT_ADDRESS, amount: 4200, expect: 3800}]}]});
  // The write that went through is recorded with what the game said it holds,
  // and confirmed by the board read after it.
  assert.deepEqual(await page.evaluate(() => pgOfFamily('imports').map((r) => [r.expect.contracts, r.expect.value, r.rowKeys.length])),
    [[[{id: 'CONTRACTone', amount: 4200, activate: false}], 4200, 1]]);
  await page.waitForFunction(() => (pgOfFamily('imports')[0] || {}).state === 'confirmed');
  await dialog(page).locator('[data-gw-b="undo"]').click();
  await dialog(page).getByText(en("sb.gw.undone")).waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['imports', 'undo']);
  // The undo takes the record back.
  assert.equal(await page.evaluate(() => pgOfFamily('imports').length), 0);
});

/* The preview names the plan each line's figure was made for, as the card and
   the copied text do: the basis on screen for a suggestion, the player's own
   basis for a typed figure, whatever is on screen when the preview opens. */
test('imports: the preview names each line\'s planning basis, under both bases', async (t) => {
  const d = JSON.parse(H.payload);
  const [, lines] = Object.entries(d.supply.facts).find(([, l]) => l['ba:itemname_paperbag']);
  Object.assign(lines['ba:itemname_paperbag'], {st: 'short', why: 'order', lvl: 'critical', setTo: 4370});
  const page = await linked(t, {approved: true, data: JSON.stringify(d)});
  const basisOf = async () => {
    await applyImports(page).click();
    await ready(page);
    const line = dialog(page).locator('.gw-line', {hasText: 'Paperbag'});
    await line.waitFor();
    const said = await line.locator('.gw-basis').count() ? await line.locator('.gw-basis').textContent() : null;
    await dialog(page).getByRole('button', {name: en("nav.dlg.cancel")}).click();
    await page.waitForFunction(() => !document.querySelector('dialog.gw-dlg[open]'));
    return said;
  };
  const basis = async (mode) => { await page.evaluate((m) => { sizing = m; szPick(m); }, mode); await supply(page); };
  await supply(page);
  // The basis on screen is the switch's to say: a line names its basis only
  // where it is the other one (declutter G5).
  assert.equal(await basisOf(), null);
  await basis('dem');
  assert.equal(await basisOf(), null);
  // Typed under shop demand, the figure keeps it on the other basis, and says so there.
  await setTo(page, 'Paperbag', 4200);
  assert.equal(await basisOf(), null);
  await basis('cap');
  assert.equal(await basisOf(), en("sb.gw.basis.own", {basis:en("sb.basis.dem.low")}));
});

test("imports: the figure written is the fact's, with no figure typed", async (t) => {
  // Python sizes the week with the chain's margin, rounded up to ten; the board
  // offers that figure in the box and writes it as it stands.
  const d = JSON.parse(H.payload);
  const [, lines] = Object.entries(d.supply.facts).find(([, l]) => l['ba:itemname_paperbag']);
  Object.assign(lines['ba:itemname_paperbag'], {st: 'short', why: 'order', lvl: 'critical', setTo: 4370});
  const page = await linked(t, {approved: true, data: JSON.stringify(d)});
  await supply(page);
  assert.equal(await importRow(page, 'Paperbag').locator('input[data-imp]').inputValue(), '4370');
  await applyImports(page).click();
  await ready(page);
  assert.match(await dialog(page).locator('.gw-line', {hasText: 'Paperbag'}).locator('.gw-num').textContent(),
    new RegExp('^' + enRe('sp.gw.tile.from').source + ' 3,800 ' + enRe('sp.gw.tile.to').source + ' 4,370' + enRe('sb.unit.stock').source + '$'));
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sb.gw.done", {parts:en("sb.gw.done.set", {n:1}, {cap: true})})).waitFor();
  assert.equal((await applied())[0].body.contracts[0].products[0].amount, 4370);
});

test('imports: the figure written is the one extraction worked out, the margin and the rounding its own', async (t) => {
  const d = drawnPayload();
  const s = d.businesses.findIndex((b) => b.name === 'HART. Depot');
  const fact = d.supply.facts[s]['ba:itemname_paperbag'];
  // HART. Gifts sells 800 a day, which the depot tops up against a 3,800
  // level: Python calls it short and sizes it.
  assert.equal(fact.st, 'short');
  assert.ok(Number.isFinite(fact.setTo) && fact.setTo > 3800, JSON.stringify(fact));
  const page = await linked(t, {approved: true, data: JSON.stringify(d)});
  await supply(page);
  assert.equal(await importRow(page, 'Paperbag').locator('input[data-imp]').inputValue(), String(fact.setTo));
  await applyImports(page).click();
  await ready(page);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sb.gw.done", {parts:en("sb.gw.done.set", {n:1}, {cap: true})})).waitFor();
  assert.equal((await applied())[0].body.contracts[0].products[0].amount, fact.setTo);
});

test('imports: a product the cap leaves nothing keeps its amount beside one the contract still writes', async (t) => {
  const page = await linked(t, {approved: true});
  const got = await page.evaluate(() => {
    const saved = gwImportRows;
    const depot = D.businesses[3].key;
    const m = (slug, product, amount) => ({id: 'M', importer: 'P', group: 0, order: 0, product, amount,
      active: true, smart: false, agent: true});
    const row = (slug, item, value, contract) => ({s: 3, slug, item, value, smart: false, changed: true,
      paused: false, total: value, impId: `m${slug}`, contracts: [contract]});
    gwTerms.clear();
    // The importer allows no more X this week, and Y as much as it likes.
    gwTerms.set(`M|ba:itemname_x|${depot}`, {cap: 0, orderedThisWeek: 0, max: null});
    gwImportRows = [row('ba:itemname_x', 'X', 300, m('ba:itemname_x', 0, 200)),
                    row('ba:itemname_y', 'Y', 500, m('ba:itemname_y', 1, 100))];
    const plan = gwImportPlan(null).map((l) => ({item: l.r.item,
      set: l.contracts.map(({c, amount}) => [c.id, amount]), uncovered: l.uncovered}));
    gwImportRows = saved; gwTerms.clear();
    return plan;
  });
  // X is not written down to 0: it keeps its 200, and its 300 stay uncovered.
  assert.deepEqual(got, [{item: 'X', set: [], uncovered: 300}, {item: 'Y', set: [['M', 500]], uncovered: 0}]);
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
  await page.route(`${H.mockUrl}/write/imports`, follow);
  await page.route(`${H.mockUrl}/write/undo`, follow);
  await supply(page);
  await setTo(page, 'Paperbag', 4200);
  await applyImports(page).click();
  await ready(page);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sb.gw.done", {parts:en("sb.gw.done.set", {n:1}, {cap: true})})).waitFor();
  // The board reads the write: the contract holds 4,200.
  await page.waitForFunction(() => gwImportRows.some((r) => r.contracts.some((c) => c.id === 'CONTRACTone' && c.amount === 4200)));
  const release = await holdSave(page);
  await dialog(page).locator('[data-gw-b="undo"]').click();
  await dialog(page).getByText(en("sb.gw.undone")).waitFor();
  assert.equal(await dialog(page).locator('[data-gw-b="again"]').isDisabled(), true);
  release();
  await page.waitForFunction(() => gwImportRows.some((r) => r.contracts.some((c) => c.id === 'CONTRACTone' && c.amount === 3800)));
  const reask = dryRunOf(page, 'imports');
  await dialog(page).locator('[data-gw-b="again"]').click();
  const products = JSON.parse((await reask).postData()).contracts[0].products;
  assert.deepEqual(products.map((x) => [x.itemName, x.amount, x.expect]), [['ba:itemname_paperbag', 4200, 3800]]);
  await ready(page);
  assert.equal(await dialog(page).locator('[data-gw-b="apply"]').isEnabled(), true);
});

test('imports: inside the lock window the dry run refuses, in the game\'s words', async (t) => {
  const page = await linked(t, {approved: true});
  await configure({day: 35, hour: 21});  // Sunday 21:00, the contract delivers Monday, day 36
  await supply(page);
  await setTo(page, 'Paperbag', 4200);
  await applyImports(page).click();
  const refusal = dialog(page).locator('.gw-no');
  await refusal.waitFor();
  assert.equal(await refusal.locator('.rule').textContent(), en('nav.dlg.refuse.locked.rule') + '.');
  assert.deepEqual(await refusal.locator('.gw-chip').allTextContents(), ['Jet Cargo Imports · Paperbag']);
  assert.equal(await refusal.locator('.fix').textContent(), en("nav.dlg.refuse.locked.day", {"day":36}));
  assert.equal(await refusal.locator('.gw-lock .cells i.x').count(), 12, 'the window drawn, Sunday 20:00 to Monday 08:00');
  assert.equal(await dialog(page).locator('.gw-line.dim').count(), 1, 'the line waits with it');
  assert.equal(await dialog(page).locator('[data-gw-b="apply"]').isDisabled(), true);
  // Asked again from here, once the game takes it.
  await configure({day: 36, hour: 9});
  await dialog(page).getByRole('button', {name: en('nav.dlg.tryagain')}).click();
  await ready(page);
  assert.equal(await dialog(page).locator('[data-gw-b="apply"]').isEnabled(), true);
});

/* --- a write or an undo the game could not take now: Try again ------------ */
test('an undo the game cannot take now is offered again, and goes through', async (t) => {
  const page = await linked(t, {approved: true});
  await button(page, GIFTS).click();
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  await configure({refuseWrite: 'cannot_write:other'});
  await dialog(page).locator('[data-gw-b="undo"]').click();
  await dialog(page).getByText(en('nav.dlg.cannot.other.text') + '.', {exact: false}).waitFor();
  await configure({refuseWrite: null});
  await dialog(page).getByRole('button', {name: en('nav.dlg.tryagain')}).click();
  await dialog(page).getByText(en("sp.gw.uni.undone", {"n":1})).waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['uniforms', 'undo']);
});

test('imports: an undo refused while a BizMan screen is open is offered again, and goes through', async (t) => {
  const page = await linked(t, {approved: true});
  await supply(page);
  await setTo(page, 'Paperbag', 4200);
  await applyImports(page).click();
  await ready(page);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sb.gw.done", {parts:en("sb.gw.done.set", {n:1}, {cap: true})})).waitFor();
  await configure({refuseWrite: 'refused:screen_open'});
  await dialog(page).locator('[data-gw-b="undo"]').click();
  await page.locator('dialog.gw-dlg[data-phase="failed"]').waitFor();
  assert.match(await dialog(page).locator('.gw-verdict').textContent(), enRe("nav.dlg.say.refuses"));
  await configure({refuseWrite: null});
  await dialog(page).getByRole('button', {name: en('nav.dlg.tryagain')}).click();
  await dialog(page).getByText(en("sb.gw.undone")).waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['imports', 'undo']);
});

test('imports: an apply refused while a BizMan screen is open, and a refused dry run, are offered again', async (t) => {
  const page = await linked(t, {approved: true});
  await supply(page);
  await setTo(page, 'Paperbag', 4200);
  await applyImports(page).click();
  await ready(page);
  await configure({refuseWrite: 'refused:screen_open'});
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("nav.dlg.refuse.screen.fix")).waitFor();
  await configure({refuseWrite: null});
  await dialog(page).getByRole('button', {name: en('nav.dlg.tryagain')}).click();
  await ready(page);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sb.gw.done", {parts:en("sb.gw.done.set", {n:1}, {cap: true})})).waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['imports']);
});
for (const viewport of [{width: 390, height: 500}, {width: 740, height: 360}]) {
  test(`on a short screen (${viewport.width}×${viewport.height}) the foot stays whole: refused, approval, undone`, async (t) => {
    const page = await linked(t, {data: withRosters(), viewport});
    await configure({pairDelay: 60});
    await button(page, GIFTS).click();
    await pair(page).getByText(WAITING).waitFor();
    assert.equal(await footOnScreen(page), true, 'approval');
    await dialog(page).evaluate((d) => d.close());
    await configure({pairDelay: 0.25, tokens: {[TOKEN]: ORIGIN}});
    await page.evaluate(({link, token}) => localStorage.setItem('ledger_link_approval', JSON.stringify({[link]: token})), {link: H.mockUrl, token: TOKEN});
    const block = await roster(page, GIFTS);
    await block.locator('[data-gw="schedule"]').click();
    await ready(page);
    await configure({refuseWrite: 'refused:screen_open'});
    await dialog(page).locator('[data-gw-b="apply"]').click();
    await page.locator('dialog.gw-dlg[data-phase="failed"]').waitFor();
    assert.equal(await footOnScreen(page), true, 'refused');
    await configure({refuseWrite: null});
    await dialog(page).getByRole('button', {name: en('nav.dlg.tryagain')}).click();
    await ready(page);
    await dialog(page).locator('[data-gw-b="apply"]').click();
    await dialog(page).getByText(enRe("sp.gw.sch.said", {"shop":"HART. Gifts","n":1,"was":2}, {"anchor":"start"})).waitFor();
    await dialog(page).locator('.gw-foot [data-gw-b="undo"]').click();
    await dialog(page).getByText(en("sp.gw.sch.undone", {"shop":"HART. Gifts"})).waitFor();
    assert.equal(await footOnScreen(page), true, 'undone');
  });
}

test('the fixed strip: the read-again line turns done there', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.locator('[data-gw="schedule"]').click();
  await ready(page);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(enRe("sp.gw.sch.said", {"shop":"HART. Gifts","n":1,"was":2}, {"anchor":"start"})).waitFor();
  await dialog(page).locator('.gw-fix .gw-reread.done', {hasText: en("nav.dlg.reread.done")}).waitFor({timeout: 20000});
});

test('schedule: on a phone, what decides the next step stays in view; only the rows scroll', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters(), viewport: {width: 390, height: 700}});
  const block = await roster(page, GIFTS);
  await block.locator('[data-gw="schedule"]').click();
  await ready(page);
  // The add-people note sits in the fixed strip, the week in the body.
  await dialog(page).locator('.gw-fix .gw-box.gw-warn', {hasText: textEn('sp.gw.add', {n:2}).split(':')[0]}).waitFor();
  assert.equal(await dialog(page).locator('.gw-body .gw-week').count(), 1);
  await configure({refuseWrite: 'refused:screen_open'});
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await page.locator('dialog.gw-dlg[data-phase="failed"]').waitFor();
  await configure({refuseWrite: null});
  // The refusal alone is fixed; the add-people note opens the scrolling body; the way on is in the foot.
  assert.equal(await dialog(page).locator('.gw-fix .gw-no').count(), 1);
  assert.equal(await dialog(page).locator('.gw-fix > :not(.gw-no)').count(), 0, 'only the refusal is fixed');
  assert.equal(await dialog(page).locator('.gw-body > :first-child').evaluate((e) => e.matches('.gw-box.gw-warn')), true);
  assert.equal(await dialog(page).locator('.gw-body .gw-no, .gw-body .gw-b').count(), 0, 'no refusal or button in the rows');
  assert.equal(await dialog(page).locator('.gw-foot').getByRole('button', {name: en('nav.dlg.tryagain')}).count(), 1);
  const m = await dialog(page).evaluate((d) => {
    const box = (s) => d.querySelector(s).getBoundingClientRect();
    const b = d.querySelector('.gw-body');
    return {foot: box('.gw-foot').bottom, view: innerHeight, body: b.clientHeight, rows: b.scrollHeight};
  });
  assert.ok(m.foot <= m.view, 'the foot is on screen');
  assert.ok(m.body >= 180, `the body keeps room (${m.body} px)`);
  assert.ok(m.rows > m.body, 'the rows scroll');
});

test('Try again only when every error the game names can be fixed in the game', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  assert.deepEqual(await page.evaluate(() => [
    gwFixable({rows: [{error: 'not_assigned'}]}),
    gwFixable({rows: [{error: 'not_assigned'}, {error: 'bad_hours'}]}),
    gwFixable({siteError: 'screen_open', rows: [{error: 'screen_open'}]}),
    gwFixable({rows: [{error: 'locked', products: [{error: 'over_cap'}]}]}),
    gwFixable({rows: [{error: 'no_skill'}]}),
    gwFixable({rows: []}),
  ]), [true, false, true, false, false, false]);
  const block = await roster(page, GIFTS);
  await block.locator('[data-gw="schedule"]').click();
  await ready(page);
  await page.route(`${H.mockUrl}/write/schedule`, (route) => (JSON.parse(route.request().postData() || '{}').dryRun ? route.continue()
    : route.fulfill({status: 409, headers: {'Access-Control-Allow-Origin': ORIGIN},
      json: {error: 'refused', rows: [{d: 1, i: 0, error: 'not_assigned'}, {d: 1, i: 1, error: 'bad_hours'}]}})));
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await page.locator('dialog.gw-dlg[data-phase="failed"]').waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: en('nav.dlg.tryagain')}).count(), 0);
});

test('schedule: a refusal the game cannot be talked out of (bad_hours) offers no Try again', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.locator('[data-gw="schedule"]').click();
  await ready(page);
  await configure({refuseWrite: 'refused:bad_hours'});
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await page.locator('dialog.gw-dlg[data-phase="failed"]').waitFor();
  await dialog(page).getByText(en("nav.dlg.refuse.badhours.rule")).waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: en('nav.dlg.tryagain')}).count(), 0);
  assert.equal(await dialog(page).locator('.gw-foot').getByRole('button', {name: en("nav.dlg.close")}).count(), 1);
  assert.deepEqual(await applied(), []);
});

test('imports: the ranked list is the game\'s order, read only, and a write sends no order', async (t) => {
  const page = await linked(t, {approved: true});
  await supply(page);
  const list = importRow(page, 'Paperbag').locator('.imp-contracts');
  // textContent: a section off screen skips its rendering, and innerText with it.
  assert.match(await list.textContent(),
    /1\. Jet Cargo Imports · keeps 3,800 in stock.*2\. Seaside Internationals · 0 a week · paused/);
  assert.match(await list.getAttribute('data-tip'), enRe("sb.imp.order"));
  // The contract whose level the box sets stands out.
  assert.equal(await list.locator('.imp-lvl').textContent(), '1. Jet Cargo Imports \u00b7 ' + en('sb.imp.keeps', {n:3800}));
  assert.equal(await list.locator('button').count(), 0);
  await setTo(page, 'Paperbag', 4200);
  await applyImports(page).click();
  // A Smart Delivery write sets the level alone; it says the plain contract stays.
  await dialog(page).locator('.gw-line', {hasText: 'Paperbag'})
    .getByText(en("sb.gw.plain", {"list":"Seaside Internationals","n":1})).waitFor();
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sb.gw.done", {parts:en("sb.gw.done.set", {n:1}, {cap: true})})).waitFor();
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
    impSetKeep(r.impId, {value: 4300, inGame: 3800, basis: 'cap'});
    drawSupplyStrip(); drawImportsView();
  });
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).locator('.gw-line .gw-num', {hasText: '4,300'}).waitFor();
  assert.equal((await applied()).length, 0, 'asked again, not applied');
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sb.gw.done", {parts:en("sb.gw.done.set", {n:1}, {cap: true})})).waitFor();
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
  await candle.locator('.gw-call.gw-neg', {hasText: textEn("sb.gw.unc.bold", {n:200, why:en("sb.gw.unc.caps")})}).waitFor();
  assert.match(await candle.locator('.gw-num').textContent(), new RegExp(enRe('sp.gw.tile.to').source + ' 400' + enRe('sb.unit.week').source + '$'));
  assert.equal(await candle.locator('.gw-lvl u.cap').textContent(), en('sb.gw.cap', {n:400}));
  assert.equal(await dialog(page).locator('[data-gw-b="apply"]').isEnabled(), true);
  await dialog(page).getByRole('button', {name: en("nav.dlg.cancel")}).click();
  // The capped dialog is gone before the next one opens: its own "United Ocean Import is
  // stopped." line (at 400, $1,000) must not pass for the new one's.
  await dialog(page).waitFor({state: 'detached'});
  await configure({importTerms: {CONTRACTthree: {unitPrice: 2.5, cap: 1000}}});
  await applyImports(page).click();
  const restart = dialog(page).locator('.gw-line', {hasText: 'Candle'}).locator('.gw-call', {hasText: 'United Ocean Import is stopped.'});
  // The game's answer to the full 600: its bill, not a stale capped one.
  await restart.filter({hasText: textRe("sb.gw.bill", {next:en("sb.gw.next.day", {day:36}), total:1500})}).waitFor();
  assert.match(await restart.textContent(), new RegExp(textRe('sb.gw.stoppedRow').source + '.*' + textRe('sb.gw.bill.of', {next:en('sb.gw.next.day', {day:36}), total:1500, cash:10000}).source));
  assert.equal(await dialog(page).getByText(textRe("sb.gw.unc.bold")).count(), 0);
  assert.equal(await dialog(page).locator('.gw-imp.stopped', {hasText: 'United Ocean Import'}).count(), 1);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sb.gw.done", {parts:en("sb.gw.done.set", {n:1}, {cap: true}) + ", " + en("sb.gw.done.started", {n:1})})).waitFor();
  assert.deepEqual((await applied())[0].body.contracts, [{id: 'CONTRACTthree', activate: true,
    products: [{itemName: 'ba:itemname_candle', warehouse: DEPOT_ADDRESS, amount: 600, expect: 500}]}]);
});
test('imports: plain amounts take one cap budget per importer, in the game\'s delivery order', async (t) => {
  const page = await linked(t, {approved: true});
  const got = await page.evaluate(() => {
    const saved = gwImportRows;
    const [gifts, depot] = [D.businesses[0].key, D.businesses[3].key];
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
  assert.ok(got.keptWords.some((w) => textRe('sb.gw.kept', {n:300, reason:en('sb.gw.kept.cap')}).test(w)),
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
  assert.equal((got.lead.match(enRe("sb.gw.ahead", {} , {"flags":"g"})) || []).length, 1);
  assert.match(got.lead, enRe("sb.gw.ahead", {"who":"P","item":"Z","depot":"HART. Bare","n":300}));
  assert.deepEqual(got.words, [[true, 'caps'], [true, 'smartAgent']]);
  assert.match(got.lead2, new RegExp('<b>Q<\\/b>.*' + enRe('sb.gw.kept', {who:'P', n:300, reason:en('sb.gw.kept.never')}).source));
  assert.match(got.lead2, new RegExp('<b>W<\\/b>.*' + enRe('sb.gw.unc.smartAgent').source.replace(/^n/, 'N')));
  assert.doesNotMatch(got.lead2, textRe("sb.gw.unc.bold"));
});

test('imports: a week the caps leave short with nothing to write is said, and not counted', async (t) => {
  const page = await linked(t, {approved: true});
  await configure({importTerms: {CONTRACTthree: {unitPrice: 2.5, cap: 0}}});
  await supply(page);
  await setTo(page, 'Candle', 600);
  await applyImports(page).click();
  await dialog(page).getByText(en("sb.gw.nothing.why", {why:textEn("sb.gw.unc.at", {n:600, item:"Candle", depot:"HART. Depot", why:en("sb.gw.unc.caps")})})).waitFor();
  await dialog(page).getByRole('button', {name: en("nav.dlg.close")}).last().click();
  await page.evaluate(() => { drawSupplyStrip(); drawImportsView(); wireAll(); });
  assert.equal(await applyImports(page).count(), 0);
  // The row keeps the reason once the cap is known.
  assert.equal(await importRow(page, 'Candle').locator('.gw-short').textContent(),
    textEn("sb.gw.unc.bold", {n:600, why:en("sb.gw.unc.caps")}));
  assert.equal((await applied()).length, 0);
});
