// The game link's writes: the schedule write, hires, uniforms from a business
// page, the Changes page's bulk import and the rent write. Setup and helpers
// are tests/_game_link_write.cjs.
const {test} = require('node:test');
const H = require('./_game_link_write.cjs');
const {assert, en, enRe, textEn, textRe, ORIGIN, GIFTS, configure, applied, linked, button, holdSave, dialog, pair, ready, kept, supply, setTo, ANA, BEN, REGISTER, CLEAN, GIFTS_ADDRESS, withRosters, followPrints, dryRunOf, roster, HIRE, WRITES_WITH_HIRE, hireBody, sourceWrite, RENT_ITEM} = H;

test('schedule: the roster is written with only the people working here, and undone', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS);
  await block.getByText(en("sp.gw.sch.empty", {"h":24,"n":2})).waitFor();
  await block.locator('[data-gw="schedule"]').click();
  await ready(page);
  await dialog(page).locator('.gw-plan', {hasText: en('sp.pick.demand')}).waitFor();
  // Three figures now → after, the week as a pair of bars a day, the people as pills.
  assert.deepEqual(await dialog(page).locator('.gw-tile .v').allTextContents(),
    ['from 2 to 1', 'from 24 to 12', '1']);
  await dialog(page).getByText(textEn('sp.gw.add', {n:2, who:en('sp.add.both', {assign:'Dee Lund', hire:en('sp.add.hireone', {n:1, role:'Cleaning'})}), h:24})).waitFor();
  assert.deepEqual(await dialog(page).locator('.gw-box.gw-warn .person').allTextContents(), ['DLDee Lund' + en('sp.gw.add.unassigned'), '1 \u00d7 Cleaning' + en('sp.gw.add.tohire')]);
  const left = dialog(page).locator('.gw-box', {hasText: textEn("sp.gw.left.head")});
  assert.deepEqual(await left.locator('.person').allTextContents(), ['ASAna SilvaCleaning']);
  const days = await dialog(page).locator('.gw-wd .gw-sr').allTextContents();
  assert.deepEqual(days.filter((d) => new RegExp('^(?:' + [1,2,0].map(d => enRe('sp.gw.week.said', {d}).source).join('|') + ')').test(d)),
    [[1,1,12,1,12], [2,0,0,0,0], [0,1,12,0,0]].map(([d, was, wasH, now, nowH]) => en('sp.gw.week.said', {d, was:en('sp.n.entries', {n:was}), wasH, now:en('sp.n.entries', {n:now}), nowH})));
  await followPrints(page, GIFTS);
  const builds = await page.evaluate(() => window.builds);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.sch.said", {"shop":"HART. Gifts","n":1,"was":2})).waitFor();
  await dialog(page).getByText(new RegExp(['sp.gw.sch.stillempty', 'sp.gw.sch.doneempty'].map(k => textRe(k, {h:24, n:2}).source).join('|'))).first().waitFor();
  // The board has read the write: its print is the game's new one.
  await page.waitForFunction(({n, key}) => window.builds > n && D.businesses.find((b) => b.key === key).shiftPrint !== '9c98d93a',
    {n: builds, key: GIFTS});
  // Recorded from the write's answer, and confirmed by the board read after it,
  // which holds the week's new print.
  assert.deepEqual(await page.evaluate((key) => pgOfFamily('schedule').map((r) => [r.state, r.target.site, r.expect.print === D.businesses.find((b) => b.key === key).shiftPrint]), GIFTS),
    [['confirmed', GIFTS, true]]);
  const writes = await applied();
  // Neither Dee's entry (not assigned here yet) nor the hire's goes to the game.
  assert.deepEqual(writes[0].body, {dryRun: false, address: GIFTS_ADDRESS, expect: '9c98d93a', openAllHours: false,
    days: [{d: 1, shifts: [{f: 8, t: 20, employeeId: BEN, itemInstanceId: REGISTER}]}]});
  // Undone: Write again waits while the board shows the write's bytes (or older),
  // and asks the game from the board read after the undo. That read is held here.
  const release = await holdSave(page);
  await dialog(page).locator('[data-gw-b="undo"]').click();
  await dialog(page).getByText(en("sp.gw.sch.undone", {"shop":"HART. Gifts"})).waitFor();
  const again = dialog(page).locator('[data-gw-b="again"]');
  assert.equal(await again.isDisabled(), true);
  assert.equal(await again.getAttribute('title'), en("nav.dlg.rereading"));
  assert.deepEqual((await applied()).map((w) => w.kind), ['schedule', 'undo']);
  // The undo takes the write's record back.
  assert.equal(await page.evaluate(() => pgOfFamily('schedule').length), 0);
  release();
  await page.waitForFunction(() => { const b = document.querySelector('dialog.gw-dlg .gw-foot [data-gw-b="again"]'); return b && !b.disabled; });
  assert.equal(await page.evaluate((key) => D.businesses.find((b) => b.key === key).shiftPrint, GIFTS), '9c98d93a');
  const reask = dryRunOf(page, 'schedule');
  await again.click();
  assert.equal(JSON.parse((await reask).postData()).expect, '9c98d93a', 'the print of the board read after the undo');
  await ready(page);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.sch.said", {"shop":"HART. Gifts","n":1,"was":2})).waitFor();
  assert.deepEqual((await applied()).map((w) => w.kind), ['schedule', 'undo', 'schedule']);
});

test('schedule: a board read that fails after an undo offers a refresh, and the re-do waits for it', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  await followPrints(page, GIFTS);
  const block = await roster(page, GIFTS);
  await block.locator('[data-gw="schedule"]').click();
  await ready(page);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.sch.said", {"shop":"HART. Gifts","n":1,"was":2})).waitFor();
  await page.waitForFunction((key) => D.businesses.find((b) => b.key === key).shiftPrint !== '9c98d93a', GIFTS);
  // The save is not served after the undo: the board's follow read gives up.
  await page.route(`${H.mockUrl}/save`, (route) => route.fulfill({status: 500, json: {error: 'broken'},
    headers: {'Access-Control-Allow-Origin': ORIGIN}}));
  await dialog(page).locator('[data-gw-b="undo"]').click();
  await dialog(page).getByText(en("sp.gw.sch.undone", {"shop":"HART. Gifts"})).waitFor();
  await dialog(page).getByRole('button', {name: en('nav.dlg.refresh')}).waitFor({timeout: 20000});
  assert.equal(await dialog(page).locator('[data-gw-b="again"]').isDisabled(), true, 'never on stale bytes');
  // Served again, a refresh brings the board up to date and the re-do on.
  await page.unroute(`${H.mockUrl}/save`);
  await dialog(page).getByRole('button', {name: en('nav.dlg.refresh')}).click();
  await page.waitForFunction(() => { const b = document.querySelector('dialog.gw-dlg .gw-foot [data-gw-b="again"]'); return b && !b.disabled; }, null, {timeout: 20000});
  assert.equal(await dialog(page).getByRole('button', {name: en('nav.dlg.refresh')}).count(), 0);
  // The game changes between the undo and the re-do: the dry run says so, and the way on is a refresh.
  await page.route(`${H.mockUrl}/write/schedule`, (route) => route.fulfill({status: 200, headers: {'Access-Control-Allow-Origin': ORIGIN},
    json: {ok: false, kind: 'schedule', dryRun: true, business: 'HART. Gifts', siteError: 'changed', rows: [],
           before: {shifts: 2, print: 'x'}, after: {shifts: 1, print: 'y'}, removed: 2, added: 1, leftWithout: [], warnings: []}}));
  await dialog(page).locator('[data-gw-b="again"]').click();
  await ready(page);
  await dialog(page).getByRole('button', {name: en('nav.dlg.refresh')}).waitFor();
  assert.equal(await dialog(page).locator('[data-gw-b="apply"]').count(), 0);
});

test('schedule: Write again from a board that has not caught up with the undo: the game answers changed, nothing is written', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  // The board follows the write, but not its undo: every board built after
  // the undo still shows the write's print.
  await followPrints(page, GIFTS, {undo: false});
  const block = await roster(page, GIFTS);
  await block.locator('[data-gw="schedule"]').click();
  await ready(page);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.sch.said", {"shop":"HART. Gifts","n":1,"was":2})).waitFor();
  await page.waitForFunction((key) => D.businesses.find((b) => b.key === key).shiftPrint !== '9c98d93a', GIFTS);
  await dialog(page).locator('[data-gw-b="undo"]').click();
  await dialog(page).getByText(en("sp.gw.sch.undone", {"shop":"HART. Gifts"})).waitFor();
  await page.waitForFunction(() => { const b = document.querySelector('dialog.gw-dlg .gw-foot [data-gw-b="again"]'); return b && !b.disabled; }, null, {timeout: 20000});
  const stale = await page.evaluate((key) => D.businesses.find((b) => b.key === key).shiftPrint, GIFTS);
  assert.notEqual(stale, '9c98d93a', 'the board still shows the write');
  const reask = dryRunOf(page, 'schedule');
  await dialog(page).locator('[data-gw-b="again"]').click();
  assert.equal(JSON.parse((await reask).postData()).expect, stale);
  // The game holds the undone week: the dry run answers changed, and the way on is a refresh.
  await ready(page);
  await dialog(page).getByRole('button', {name: en('nav.dlg.refresh')}).waitFor();
  assert.equal(await dialog(page).locator('[data-gw-b="apply"]').count(), 0);
  const refresh = page.waitForRequest((req) => req.url().endsWith('/refresh') && req.method() === 'POST');
  await dialog(page).getByRole('button', {name: en('nav.dlg.refresh')}).click();
  await refresh;
  assert.deepEqual((await applied()).map((w) => w.kind), ['schedule', 'undo'], 'nothing written from the stale board');
});

test('schedule: a full-cover week undone and written again opens the hours again', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  await followPrints(page, GIFTS);
  const block = await roster(page, GIFTS, 'full');
  await block.locator('[data-gw="schedule"]').click();
  await ready(page);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(enRe("sp.gw.sch.said.open", {"shop":"HART. Gifts","n":2,"was":2}, {"anchor":"full"})).waitFor();
  assert.equal((await applied())[0].body.openAllHours, true);
  // The board reads the write: the shop is open around the clock now.
  await page.waitForFunction((key) => D.staffing.find((r) => r.key === key).fullCover.openNow === true, GIFTS);
  await dialog(page).locator('[data-gw-b="undo"]').click();
  await dialog(page).locator('[data-gw-b="again"]').waitFor();
  const reask = dryRunOf(page, 'schedule');
  await dialog(page).locator('[data-gw-b="again"]').click();
  assert.equal(JSON.parse((await reask).postData()).openAllHours, true, 'the board read after the undo: shut again');
  await ready(page);
});

test('schedule: full cover opens every day 0 to 24, unless the player opts out', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  const block = await roster(page, GIFTS, 'full');
  await block.locator('[data-gw="schedule"]').click();
  const open = dialog(page).locator('[data-gw-open]');
  await open.waitFor();
  assert.equal(await open.getAttribute('aria-checked'), 'true');
  await dialog(page).locator('.gw-plan', {hasText: en('sp.pick.full')}).waitFor();
  // The click flips the switch once: the Filter kinds switches' handler leaves
  // it alone, so it shows and says what will be sent (#107).
  assert.deepEqual(await open.evaluate((el) => {
    el.click();
    return [el.classList.contains('on'), el.getAttribute('aria-checked')];
  }), [false, 'false']);
  // The game is asked again, without the opening hours.
  await page.locator('dialog.gw-dlg[data-phase="ready"] [role="switch"][aria-checked="false"]').waitFor();
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(enRe("sp.gw.sch.said", {"shop":"HART. Gifts","n":2,"was":2}, {"anchor":"full"})).waitFor();
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
});

test('schedule: a game that moved on answers 409 changed', async (t) => {
  const page = await linked(t, {approved: true, data: withRosters()});
  await configure({refuseWrite: 'changed'});
  const block = await roster(page, GIFTS);
  await block.locator('[data-gw="schedule"]').click();
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("nav.dlg.say.moved"), {exact: true}).waitFor();
  assert.equal(await dialog(page).getByRole('button', {name: en('nav.dlg.refresh')}).count(), 1);
  assert.equal((await applied()).length, 0);
});

test('schedule: a cover-only plan keeps the serving entries in the game', async (t) => {
  const data = JSON.parse(withRosters());
  const gifts = data.staffing.find((r) => r.key === GIFTS);
  // This fixture deliberately represents the legacy cover-only contract;
  // confirmed-zero demand plans instead replace serving entries (office_demand.test.cjs).
  gifts.demandBased = false;
  gifts.shifts = [{d: 3, s: 0, f: 0, t: 12, p: 0, k: 'clean'}];
  Object.assign(gifts, {bench: [], addPeople: {assign: [], hire: [], people: 0, hoursUncovered: 0}});
  const page = await linked(t, {approved: true, data: JSON.stringify(data)});
  const block = await roster(page, GIFTS);
  await block.locator('[data-gw="schedule"]').click();
  await dialog(page).locator('.gw-plan', {hasText: en("sp.gw.plan.cover")}).waitFor();
  await dialog(page).getByText(en("sp.gw.sch.kept", {"n":1})).waitFor();
  // Entries: the one written and the one kept, against the two now.
  assert.equal(await dialog(page).locator('.gw-tile .v').first().textContent(), '2');
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(enRe("sp.gw.sch.said", {"shop":"HART. Gifts","n":2,"was":2}, {"anchor":"start"})).waitFor();
  assert.deepEqual((await applied())[0].body.days, [
    {d: 1, shifts: [{f: 8, t: 20, employeeId: ANA, itemInstanceId: REGISTER}]},
    {d: 3, shifts: [{f: 0, t: 12, employeeId: ANA, itemInstanceId: CLEAN}]}]);
});

test('hire: a dry run and an apply through the page, which then reads the game again, and one undo', async (t) => {
  const page = await linked(t, {writes: WRITES_WITH_HIRE, approved: true});
  // The board hears what the mod can do beyond its kinds.
  assert.deepEqual(await page.evaluate(() => window.LEDGER_SOURCE.link().features), ['hire.reschedule', 'hire.undo', 'rent.undo']);
  const dry = await sourceWrite(page, 'hire', hireBody(), true);
  assert.equal(dry.status, 200);
  assert.equal(dry.error, null);
  assert.equal(dry.body.kind, 'hire');
  assert.equal(dry.body.ok, true);
  assert.deepEqual(dry.body.hired.map((h) => h.name), ['Ida Nord', 'Oskar Lind']);
  assert.deepEqual(dry.body.moved.map((m) => [m.name, m.from, m.to]), [['Ben Ode', 'HART. Gifts', 'HART. Corner']]);
  assert.equal(dry.body.wageAdded, 48.5);
  assert.deepEqual(await applied(), []);
  const builds = await page.evaluate(() => window.builds);
  const done = await sourceWrite(page, 'hire', hireBody(), false);
  assert.equal(done.status, 200);
  assert.equal(done.error, null);
  assert.equal(typeof done.body.stamp, 'string');
  assert.deepEqual((await applied()).map((w) => w.kind), ['hire']);
  // The board follows the stamp the apply moved, as after any write.
  await page.waitForFunction((n) => window.builds > n, builds);
  // Mod 0.4.0 (the mock's features by default): the whole call is undone,
  // Ida and Oskar back among the candidates and Ben back at Gifts.
  const undo = await sourceWrite(page, 'undo', {kind: 'hire'}, false);
  assert.deepEqual([undo.status, undo.error, undo.body.kind, undo.body.undo], [200, null, 'hire', true]);
  assert.deepEqual(undo.body.hired.map((h) => h.candidateId).sort(), [HIRE.ida, HIRE.oskar].sort());
  assert.deepEqual(undo.body.moved.map((m) => [m.name, m.from, m.to]), [['Ben Ode', 'HART. Corner', 'HART. Gifts']]);
  assert.deepEqual((await applied()).map((w) => w.kind), ['hire', 'undo']);
  const again = await sourceWrite(page, 'undo', {kind: 'hire'}, false);
  assert.deepEqual([again.status, again.error], [409, 'nothing_to_undo']);
});

test('hire: a mod before 0.4.0 lists no features, and has no undo for a hire', async (t) => {
  const page = await linked(t, {writes: WRITES_WITH_HIRE, approved: true});
  await configure({features: []});
  const done = await sourceWrite(page, 'hire', hireBody(), false);
  assert.equal(done.status, 200);
  const undo = await sourceWrite(page, 'undo', {kind: 'hire'}, false);
  assert.deepEqual([undo.status, undo.error], [409, 'no_undo']);
});

test('hire: MyEmployees open blocks the dry run and refuses the apply, which the page reads', async (t) => {
  const page = await linked(t, {writes: WRITES_WITH_HIRE, approved: true});
  await configure({myEmployees: true});
  const dry = await sourceWrite(page, 'hire', hireBody(), true);
  assert.deepEqual([dry.status, dry.error, dry.body.ok, dry.body.blocked], [200, null, false, 'myemployees']);
  const refused = await sourceWrite(page, 'hire', hireBody(), false);
  assert.deepEqual([refused.status, refused.error, refused.body.reason], [409, 'cannot_write', 'myemployees']);
  assert.deepEqual(await applied(), []);
});

test('hire: a candidate gone since the bytes is skipped, and the rest applies', async (t) => {
  const page = await linked(t, {writes: WRITES_WITH_HIRE, approved: true});
  await configure({hireGone: [HIRE.oskar]});
  const dry = await sourceWrite(page, 'hire', hireBody(), true);
  assert.equal(dry.body.ok, true);
  assert.deepEqual(dry.body.skipped, [{candidateId: HIRE.oskar, name: 'Oskar Lind', reason: 'gone', hoursDropped: 12}]);
  const done = await sourceWrite(page, 'hire', hireBody(), false);
  assert.deepEqual([done.status, done.body.hired.map((h) => h.candidateId)], [200, [HIRE.ida]]);
});

test('hire: a refused row answers 409 with its scope, and nothing is written', async (t) => {
  const page = await linked(t, {writes: WRITES_WITH_HIRE, approved: true});
  const body = hireBody();
  body.hires[0].expect.wage = 25;  // the game's wage moved on
  const dry = await sourceWrite(page, 'hire', body, true);
  assert.equal(dry.body.ok, false);
  assert.deepEqual(dry.body.rows.filter((r) => r.scope === 'hire'), [{scope: 'hire', id: HIRE.ida, error: 'changed'}]);
  const refused = await sourceWrite(page, 'hire', body, false);
  assert.deepEqual([refused.status, refused.error], [409, 'changed']);
  assert.deepEqual(await applied(), []);
});

/* Chunk 3, round 1 (Opus S3): the uniform write made from a business's own
   page, through the real dialog: its progress stands beside the write there,
   and on Standards; the board the game gives after the write, with the role
   dressed, confirms it; an undo takes the record back. */
test('uniforms from a business page: the progress stands beside the write, there and on Standards, and an undo takes it back', async (t) => {
  const page = await linked(t, {approved: true});
  await page.evaluate((k) => { openSite(k); }, GIFTS);
  // The game's board after the write: the role has its uniform.
  await page.evaluate((k) => {
    const d = JSON.parse(window.baseData);
    const b = d.businesses.find((x) => x.key === k);
    b.uniformGapSkills = []; b.uniformGaps = [];
    window.buildData = JSON.stringify(d);
  }, GIFTS);
  await page.locator('#sp-standards [data-gw="uniforms"]').first().click();
  await ready(page);
  await dialog(page).locator('[data-gw-b="apply"]').click();
  await dialog(page).getByText(en("sp.gw.uni.done.one", {preset:"Default", n:1, shop:"HART. Gifts"})).waitFor();
  assert.notEqual(await page.evaluate((k) => pgUniformState(k), GIFTS), null, 'recorded from the answer');
  await dialog(page).locator('.gw-foot').getByRole('button', {name: en("nav.dlg.close")}).click();
  await page.waitForFunction((k) => (pgUniformState(k) || {}).state === 'confirmed', GIFTS);
  await page.locator('#sp-standards .sp-unipg').getByText(new RegExp(enRe('sb.st.confirmed.day').source.replace('.+?', '\\d+'))).waitFor();
  await page.evaluate(() => openRoute('businesses/standards'));
  // Standards was only just shown: wait for its row to be laid out and read.
  await page.locator(`#secStandards tr[data-std-row="${GIFTS}"] .nx-st`).getByText(new RegExp(enRe('sb.st.confirmed.day').source.replace('.+?', '\\d+'))).waitFor();
  // Undo, from the strip: the record goes.
  await page.locator('#gwToast').locator('[data-gw-undo]').click();
  await dialog(page).getByText(en("sp.gw.uni.undone", {"n":1})).waitFor();
  assert.equal(await page.evaluate((k) => pgUniformState(k), GIFTS), null);
});

/* Final review (astra2 LOW): Changes' bulk Apply follows the scope, as its
   list and Copy do. */
test('Changes: the bulk import Apply follows the scope; a scope with no import line has none', async (t) => {
  const page = await linked(t, {approved: true});
  // A figure to write at the depot: one import line, and no shop holds any.
  await supply(page);
  await setTo(page, 'Paperbag', 4200);
  await page.evaluate(() => openRoute('supply/changes'));
  const btn = () => page.evaluate(() => {
    const b = document.querySelector('#secChanges [data-gw="imports"]');
    return b ? {depot: b.dataset.gwDepot, label: b.querySelector('.gw-l').textContent} : null;
  });
  const all = await btn();
  assert.ok(all && all.depot === '', 'the whole company: every import line');
  await page.evaluate(() => { sbScope.changes = 'shops'; drawChangesView(); wireAll(); });
  assert.equal(await btn(), null, 'All shops holds no import line, so no Apply');
  const depot = await page.evaluate(() => gwImportLines(null)[0].depot.key);
  await page.evaluate((k) => { sbScope.changes = `site:${k}`; drawChangesView(); wireAll(); }, depot);
  const one = await btn();
  assert.equal(one.depot, depot, 'one site: its own lines');
  await page.evaluate(() => { sbScope.changes = 'all'; drawChangesView(); wireAll(); });
});

test('rent: the link names the kind and its undo; a write carries the same-save guard and its items as given', async (t) => {
  const page = await linked(t, {writes: [...WRITES_WITH_HIRE, 'marketing', 'rent'], approved: true});
  const link = await page.evaluate(() => window.LEDGER_SOURCE.link());
  assert.ok(link.writes.includes('rent'));
  assert.ok(link.features.includes('rent.undo'));
  const sent = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/write/rent') && req.method() === 'POST') sent.push(JSON.parse(req.postData()));
  });
  const dry = await sourceWrite(page, 'rent', {items: [RENT_ITEM]}, true);
  assert.equal(dry.status, 200);
  assert.equal(dry.error, null);
  assert.equal(dry.body.kind, 'rent');
  assert.equal(dry.body.ok, false);
  assert.deepEqual(dry.body.rows.map((r) => [r.address, r.error, r.set]), [[RENT_ITEM.address, 'not_owned', false]]);
  assert.deepEqual(sent, [{items: [RENT_ITEM], expect: {character: 'default', company: 'Link Co'}, dryRun: true}]);
  // An apply is refused as the dry run said, and nothing is written.
  const apply = await sourceWrite(page, 'rent', {items: [RENT_ITEM]}, false);
  assert.equal(apply.status, 409);
  assert.equal(apply.error, 'refused');
  assert.equal((await applied()).length, 0);
  // Nothing to undo yet.
  const undo = await sourceWrite(page, 'undo', {kind: 'rent'}, false);
  assert.deepEqual([undo.status, undo.error], [409, 'nothing_to_undo']);
});

test('rent: a mod without the kind leaves it out of the link', async (t) => {
  const page = await linked(t, {writes: WRITES_WITH_HIRE, approved: true});
  assert.equal((await page.evaluate(() => window.LEDGER_SOURCE.link().writes)).includes('rent'), false);
});
