// Expansion › Open a store, step 5: the checklist until opening -- lease, staff,
// uniforms, deliveries, marketing -- and the game-link buttons on its rows.
// Setup and helpers are tests/_open_store.cjs; the plan steps before it are
// tests/open_store.test.cjs.
const {test} = require('node:test');
const H = require('./_open_store.cjs');
const {assert, en, enRe, textRe, path, LIQ, SITE, board, steps, money, planned, MKPLAN, running, LINK, rows, until, line, opened, linked, routed, wanted, FULL, HIRES, SHORT6, hiring, realHiring, spy, traded} = H;

test('a redraw of every page (a language switch) keeps Plan a factory\'s Ingredients off Open a store', async t => {
  const page = await board(t);
  await planned(page);
  /* A type with a product a factory line can make, so Plan a factory shows Ingredients. */
  const made = await page.evaluate(() => { indexPlan(); return planTypes().find(k => D.plan.catalogue[k].products.some(p => RECIPE_BY[p])) || null; });
  assert.ok(made, 'the fixture plans something to make');
  await page.evaluate(k => { planType = k; planCounts = {}; openRoute('expansion/factory'); renderCalm(false); }, made);
  const onFactory = await page.evaluate(() => $('secIngredients').hidden);
  assert.equal(onFactory, false, 'Plan a factory has ingredients to show here');
  await page.evaluate(() => openRoute('expansion/open'));
  await page.evaluate(() => renderCalm(false));
  assert.equal(await page.evaluate(() => route), 'expansion/open');
  assert.equal(await page.locator('#secIngredients').isVisible(), false);
  await page.evaluate(() => openRoute('expansion/factory'));
  await page.evaluate(() => renderCalm(false));
  assert.equal(await page.evaluate(() => $('secIngredients').hidden), onFactory, 'Plan a factory shows it as before');
});

test('an unbuilt store opens its checklist with every task pending and links to logistics', async t => {
  const page = await board(t);
  await planned(page);
  assert.equal(await page.locator('#osCtl [data-os-step="opening"]').isDisabled(), false);
  await page.locator('#osCtl [data-os-step="opening"]').click();
  await page.waitForFunction(() => osStep === 'opening');
  assert.equal(await page.locator('#osCtl [data-os-step="open"]').isDisabled(), true);
  assert.match(await page.locator('#osCtl [data-os-step="open"]').getAttribute('data-tip'), textRe('gr.os.step.payback', {}, {}));
  assert.equal(await page.locator('#osBody .os-prog h2').textContent(), en('gr.os.ck.title'));
  const r = await rows(page);
  assert.deepEqual(r.map(x => [x.title, x.state]), [[en('gr.os.ck.lease'), 'todo'], [en('gr.os.ck.furn'), 'todo'], [en('gr.os.ck.staff'), 'todo'],
    [en('gr.os.ck.uni'), 'todo'], [en('gr.os.ck.dem'), 'todo'], [en('gr.os.ck.mk'), 'todo'], [en('gr.os.ck.log'), 'todo']]);
  assert.deepEqual(r.map(x => x.act), ['', '', '', '', '', '', en('gr.os.ck.log.go')]);
  assert.match(await page.locator('#osBody .os-prog').innerText(), textRe('gr.os.ck.count', {n: 0, of: 7}, {}));
  const states = await page.evaluate(() => {
    const T = osFacts().types, plain = Object.keys(T).find(k => !T[k].demands.some(d => d[0] === 'employeeuniforms')), office = Object.keys(T).find(k => T[k].model === 'office');
    return [plain, office].filter(Boolean).map(type => { const plan = {type, key: 'ba:street_nowhere#1'}, uni = osCkUniforms(plan, null);
      return [type, uni.state, osCkDemands(plan, null, uni).state, osCkLogistics(plan, null).state, osCkStaff(plan, null).state, osCkMarketing(plan, null, null).state]; });
  });
  assert.ok(states.length >= 1);
  for (const s of states) assert.deepEqual(s.slice(1), ['todo', 'todo', 'todo', 'todo', 'todo'], s[0]);
  /* Into Plan a factory's step 1, on the store's type and a new factory (#172). */
  await page.locator('#osBody [data-of-goto="new"]').first().click();
  await page.waitForFunction(() => route === 'expansion/factory');
  assert.deepEqual(await page.evaluate(() => [planType, planTarget, ofStep]), [LIQ, 'new', 'what']);
});

test('a half-done store shows missing work and completes when the save catches up', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 2, stationShifts: 3, uniformGaps: ['Customer Service', 'Cleaning'], missingAmenities: ['ba:customerdemand_music'],
    amenities: {bathroom: true, interior: true, music: false, sink: false, toiletprivacy: true}},
    {placed: 3, req: [['anyprimaryproduct', 1, 0], ['pointofsales', 1, 1]], seating: false});
  await hiring(page);
  await routed(page, (await wanted(page)).slice(0, 1));
  const r = await rows(page);
  assert.equal(r[0].state, 'done');
  assert.equal(r[1].state, 'part');
  assert.equal(r[3].state, 'todo');
  assert.equal(r[4].state, 'part');
  assert.equal(r[6].state, 'part');
  assert.match(r[6].sub, textRe('gr.os.ck.log.part', {}, {}));
  // A later save completes the same store; no second browser boot is needed.
  await page.evaluate(({site, built, campaigns}) => {
    Object.assign(D.businesses.find(b => b.key === site), {staff: 3, stationShifts: 5,
      campaigns, uniformGaps: [], missingAmenities: [],
      amenities: {bathroom: true, interior: true, music: true, sink: true, toiletprivacy: true}});
    D.openStore.built[site] = built;
  }, {site: SITE, built: FULL, campaigns: running('SmallInternet')});
  await hiring(page, {...HIRES, weeks: []});
  await routed(page, await wanted(page));
  assert.deepEqual((await rows(page)).map(x => x.state), ['done', 'done', 'done', 'done', 'done', 'done', 'done']);
  assert.match(await page.locator('#osBody .os-prog').innerText(), textRe('gr.os.ck.count', {n: 7, of: 7}, {}));
});

test('staff never ticks without opening hours or verified cover', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 4, stationShifts: 5}, FULL);
  /* a shop the game opens no hour: the model has no plan for it */
  await hiring(page, {planned: true, variant: null, site: {noHours: true}, weeks: []});
  let r = await rows(page);
  assert.equal(r[2].state, 'todo');
  assert.match(r[2].sub, textRe('gr.os.ck.staff.nohours', {}, {}));
  /* a shop that has never traded, on a demand plan with no hire weeks */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.revenue = 0; b.customers = 0; b.hasTraded = false; });
  await hiring(page, {planned: true, variant: 'demand', weeks: []});
  r = await rows(page);
  assert.equal(r[2].state, 'todo');
  assert.match(r[2].sub, textRe('gr.os.ck.staff.unsized', {}, {}));
  /* nobody hired and nothing to hire */
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).staff = 0; });
  await hiring(page, {...HIRES, weeks: []});
  assert.equal((await rows(page))[2].state, 'todo');
  /* the same shop once it trades and is covered */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.staff = 4; b.revenue = 900; b.customers = 60; b.hasTraded = true; });
  await hiring(page, {planned: true, variant: 'demand', weeks: []});
  assert.equal((await rows(page))[2].state, 'done');
});

test('staff needs hours on the schedule and nobody left without them, and "has traded" is the history, not the last day', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 4, stationShifts: 0}, FULL);
  await hiring(page, {...HIRES, weeks: []});
  let r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, textRe('gr.os.ck.staff.idle', {n: 4}, {}));
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).stationShifts = 6; });
  await hiring(page, {...HIRES, weeks: []});
  assert.equal((await rows(page))[2].state, 'done');
  /* people assigned to the shop with no hours in the plan mode it uses: its own text, not "no hours scheduled yet" */
  const gap = {hours: 12, roles: [{skill: 'ba:skill_cleaning', idle: 1}]};
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'shop', unstaffed: {demand: gap}}});
  r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, textRe('gr.os.ck.staff.nohours2', {have: 4, n: 1}, {}));
  assert.doesNotMatch(r.sub, textRe('gr.os.ck.staff.idle', {}, {}));
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'shop', unstaffed: {demand: {hours: 3, roles: [{skill: 'ba:skill_cleaning', idle: 2}, {skill: 'ba:skill_securityguard', idle: 1}]}}}});
  assert.match((await rows(page))[2].sub, textRe('gr.os.ck.staff.nohours2', {n: 3}, {}));
  /* a gap in the plan mode the site does not use blocks nothing: the shop is on the demand plan, the gap is the full one */
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'shop', unstaffed: {full: gap}}});
  assert.equal((await rows(page))[2].state, 'done');
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'office', unstaffed: {office: gap}}});
  assert.match((await rows(page))[2].sub, textRe('gr.os.ck.staff.nohours2', {n: 1}, {}));
  await hiring(page, {...HIRES, weeks: [], site: {kind: 'office', unstaffed: {demand: gap}}});
  assert.equal((await rows(page))[2].state, 'done');
  /* a night-time shop whose last statement is empty has still traded */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); Object.assign(b, {revenue: 0, customers: 0, hasTraded: true}); });
  await hiring(page, {planned: true, variant: 'demand', weeks: []});
  assert.equal((await rows(page))[2].state, 'done');
});

test('through the real hiring model: no hours stays a to-do, and hires are counted from the payload', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 0, stationShifts: 0}, FULL);
  await realHiring(page, {noHours: true});
  assert.equal((await rows(page))[2].state, 'todo');
  assert.match((await rows(page))[2].sub, textRe('gr.os.ck.staff.nohours', {}, {}));
  await page.evaluate(() => { D.hiring.sites = D.hiring.sites.filter(s => s.key !== osPlan().key); });
  const weeks = await realHiring(page);
  await linked(page);
  const staff = (await rows(page))[2];
  assert.equal(staff.state, 'todo');
  assert.match(staff.act, enRe('sp.gw.staff'));
  /* The button is the site panel's Staff this site: the same count of people it hires here. */
  assert.equal(await page.evaluate(k => hrSitePeople(k), SITE), weeks);
});

test('Staff this site opens the Staff page\'s review for this site only, through hrReview and hrRequest', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2}, FULL);
  const weeks = await realHiring(page);
  await linked(page);
  await spy(page);
  await page.locator('#osBody [data-os-write="hire"]').click();
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.waitFor();
  await page.waitForFunction(() => window.__writes.length > 0);
  const sent = await page.evaluate(() => window.__writes[0]);
  assert.equal(sent.kind, 'hire');
  assert.equal(sent.dryRun, true);
  assert.equal(sent.body.hires.length, weeks);
  assert.deepEqual([...new Set(sent.body.hires.map(h => h.address.street + '#' + h.address.number))], ['ba:street_broadwaystreet#9']);
  assert.deepEqual(sent.body.sites.map(s => s.address), [{street: 'ba:street_broadwaystreet', number: 9}]);
  assert.match(await dlg.locator('h2').innerText(), textRe('co.hire.title.site', {}, {anchor: 'start'}));
  assert.deepEqual(await page.evaluate(() => hrLast.o), {scope: 'site', site: SITE});
  assert.equal(await dlg.locator('.hr-dsite').count(), 1);
});

test('Staff this site sends hrReview the plan\'s site, and Assign uniforms sends gwUniforms the key', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2, uniformGaps: ['Customer Service']}, FULL);
  await hiring(page);
  await linked(page);
  await page.evaluate(() => { window.__calls = []; window.hrReview = o => window.__calls.push(['hire', o]); window.gwUniforms = k => window.__calls.push(['uniforms', k]); });
  await page.locator('#osBody [data-os-write="hire"]').click();
  await page.locator('#osBody [data-os-write="uniforms"]').click();
  const calls = await page.evaluate(() => window.__calls);
  assert.deepEqual(calls[0], ['hire', {scope: 'site', site: SITE}]);
  assert.deepEqual(calls[1], ['uniforms', [SITE]]);
});

test('weeks filled by moving people offer the full staff review, or a way to do it in the game', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2}, FULL);
  const moveHires = {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', 'move'], ['ba:skill_customerservice', 'hire']]};
  await hiring(page, moveHires);
  assert.match((await rows(page))[2].act, new RegExp([textRe('gr.os.ck.staff.ingame.move', {moves: '1 Cleaning'}).source,
    textRe('gr.os.ck.staff.ingame.mixed', {moves: '1 Cleaning'}).source].join('|'), 'i'));
  await linked(page);
  assert.equal((await page.locator('#osBody [data-os-write="hire"]').innerText()).trim(), en('sp.gw.staff'));
  await page.evaluate(() => { window.__calls = []; window.hrReview = o => window.__calls.push(o); });
  await page.locator('#osBody [data-os-write="hire"]').click();
  assert.deepEqual(await page.evaluate(() => window.__calls), [{scope: 'site', site: SITE}]);
});

test('a week too short for a hire is hours left open, not a place: no "1 more", no headhunter, and the row stays pending', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 2, stationShifts: 3}, FULL);
  /* main's six-hour remainder (tests/staff_hire.test.cjs): Customer Service, 6 h on one day, band "short" */
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_customerservice', null, SHORT6]]});
  let r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, new RegExp(textRe('gr.os.ck.staff.count', {n: 2}).source + ' \u00b7 ' + textRe('co.hire.role.toofew', {h: 6}).source));
  assert.doesNotMatch(r.sub, new RegExp([textRe('gr.os.ck.staff.need', {}).source, textRe('gr.os.ck.staff.nocand', {}).source].join('|')));
  assert.doesNotMatch(r.act, textRe('gr.os.ck.staff.headhunter', {}, {}));
  /* beside a real place, the short hours are said apart and not counted */
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', 'hire'], ['ba:skill_customerservice', null, SHORT6]]});
  r = (await rows(page))[2];
  assert.match(r.sub, new RegExp(textRe('gr.os.ck.staff.need', {have: 2, total: 3, need: 1, roles: '1 Cleaning'}).source + '[^\u00b7]*\u00b7 ' + textRe('co.hire.role.toofew', {h: 6}).source));
  assert.doesNotMatch(r.sub, textRe('gr.os.ck.staff.nocand', {}, {}));
  /* a planned reassign onto the short week is not the hours worked: pending, with Staff this site */
  await linked(page);
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_customerservice', 'move', SHORT6]]});
  r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.doesNotMatch(r.sub, textRe('co.hire.role.toofew', {}, {}));
  assert.equal((await page.locator('#osBody [data-os-write="hire"]').innerText()).trim(), en('sp.gw.staff'));
  /* without the link, the step that clears it is the move, not the schedule */
  await linked(page, null);
  r = (await rows(page))[2];
  assert.match(r.act, textRe('gr.os.ck.staff.ingame.move', {moves: '1 Customer Service'}, {}));
  assert.doesNotMatch(r.act, textRe('gr.os.ck.staff.ingame.week', {}, {}));
  /* beside a regular hire, the step names both the hire and the short week's move */
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', 'hire'], ['ba:skill_customerservice', 'move', SHORT6]]});
  r = (await rows(page))[2];
  assert.match(r.act, textRe('gr.os.ck.staff.ingame.mixed', {roles: '1 Cleaning', moves: '1 Customer Service'}, {}));
  assert.match(r.sub, textRe('gr.os.ck.staff.need', {need: 1, roles: '1 Cleaning'}, {}));
  assert.doesNotMatch(r.sub, /Customer Service/);
  /* a padded week with no hours is no short week */
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_customerservice', null, {band: 'short', hours: 0, days: 0, slots: []}]]});
  assert.equal((await rows(page))[2].state, 'done');
  /* a later save where the week is worked: the plan has no short week left */
  await hiring(page, {planned: true, variant: 'open', weeks: []});
  assert.equal((await rows(page))[2].state, 'done');
});

test('every pending path names the short week\'s planned hire or move in the game, and the schedule where hours are missing', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 0, stationShifts: 0}, FULL);
  const GAP = {kind: 'shop', unstaffed: {demand: {hours: 12, roles: [{skill: 'ba:skill_cleaning', idle: 1}]}}};
  const cases = [
    {name: 'need > 0', biz: {staff: 1, stationShifts: 2}, weeks: [['ba:skill_cleaning', 'hire']], text: textRe('gr.os.ck.staff.need', {have: 1, total: 2}, {}), schedule: false},
    {name: 'nobody hired', biz: {staff: 0, stationShifts: 0}, weeks: [], text: textRe('gr.os.ck.staff.nobody', {}, {}), schedule: false},
    {name: 'nobody hired, bench', biz: {staff: 0, stationShifts: 0}, weeks: [], bench: 2, text: textRe('gr.os.ck.staff.benchonly', {n: 2}, {anchor: 'full'}), schedule: false},
    {name: 'need > 0, bench', biz: {staff: 1, stationShifts: 2}, weeks: [['ba:skill_cleaning', 'hire']], bench: 1, text: new RegExp('^' + textRe('gr.os.ck.staff.need', {have: 1, total: 3}).source + '.* \u00b7 ' + textRe('gr.os.ck.staff.bench', {n: 1}).source), p: '33%', schedule: false},
    {name: 'covered, bench', biz: {staff: 2, stationShifts: 3}, weeks: [], bench: 1, text: new RegExp('^' + textRe('gr.os.ck.staff.count', {n: 2}).source + ' \u00b7 ' + textRe('gr.os.ck.staff.bench', {n: 1}).source + '$'), schedule: false},
    /* the schedule step is for the people the plan uses: a spare alone gets none */
    {name: 'no hours, only a spare', biz: {staff: 1, stationShifts: 0, staffIdle: ['sp1']}, weeks: [], text: textRe('gr.os.ck.staff.count', {n: 1}, {anchor: 'full'}), schedule: false},
    {name: 'no hours, one used and a spare', biz: {staff: 2, stationShifts: 0, staffIdle: ['sp1']}, weeks: [], text: textRe('gr.os.ck.staff.idle', {}, {}), schedule: true},
    {name: 'no hours scheduled', biz: {staff: 2, stationShifts: 0, staffIdle: []}, weeks: [], text: textRe('gr.os.ck.staff.idle', {}, {}), schedule: true},
    {name: 'has no hours', biz: {staff: 2, stationShifts: 3}, weeks: [], site: GAP, text: textRe('gr.os.ck.staff.nohours2', {n: 1}, {}), schedule: true},
    {name: 'covered, short only', biz: {staff: 2, stationShifts: 3, staffIdle: []}, weeks: [], text: textRe('gr.os.ck.staff.count', {n: 2}, {anchor: 'full'}), schedule: false},
  ];
  for (const who of ['hire', 'move']) {
    for (const c of cases) {
      await page.evaluate(biz => { Object.assign(D.businesses.find(x => x.key === osPlan().key), biz); }, c.biz);
      await hiring(page, {planned: true, variant: 'open', site: c.site, bench: c.bench, weeks: [...c.weeks, ['ba:skill_customerservice', who, SHORT6]]});
      const r = (await rows(page))[2];
      const label = `${c.name}, short week ${who}`;
      assert.equal(r.state, c.name.startsWith('need > 0') ? 'part' : 'todo', label);
      assert.match(r.sub, c.text, label);
      if(c.p) assert.equal(r.p, c.p, label);
      assert.match(r.act, who === 'hire' ? textRe('gr.os.ck.staff.ingame', {roles: c.weeks.length ? '1 Cleaning, 1 Customer Service' : '1 Customer Service'}) : new RegExp([textRe('gr.os.ck.staff.ingame.move', {moves: '1 Customer Service'}).source, textRe('gr.os.ck.staff.ingame.mixed', {moves: '1 Customer Service'}).source].join('|')), label);
      if(c.bench) assert.match(r.act, textRe('gr.os.ck.staff.ingame.bench', {n: c.bench}), label);
      else assert.doesNotMatch(r.act, textRe('gr.os.ck.staff.ingame.bench', {}, {}), label);
      assert[c.schedule ? 'match' : 'doesNotMatch'](r.act, textRe('gr.os.ck.staff.ingame.week', {}, {}), label);
    }
  }
});

test('a bench person the plan counts on keeps a covered shop pending, with no short week to do it', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 2, stationShifts: 3}, FULL);
  await hiring(page, {planned: true, variant: 'open', weeks: [], bench: 1});
  const r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, new RegExp('^' + textRe('gr.os.ck.staff.count', {n: 2}).source + ' \u00b7 ' + textRe('gr.os.ck.staff.bench', {n: 1}).source + '$'));
  await hiring(page, {planned: true, variant: 'open', weeks: [], bench: 0});
  const done = (await rows(page))[2];
  assert.equal(done.state, 'done');
  assert.match(done.sub, textRe('gr.os.ck.staff.done', {}, {}));
});

test('a demand plan before any sales: somebody hired early is not "on staff" and done, but waits for the sizing', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 0, staffIdle: ['sp1'], revenue: 0, customers: 0, hasTraded: false}, FULL);
  await hiring(page, {planned: true, variant: 'demand', weeks: []});
  const r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, textRe('gr.os.ck.staff.unsized', {n: 1}, {anchor: 'full'}));
});

test('linked, with nothing for Staff this site to do, the row still says the step in the game', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 2, stationShifts: 3}, FULL);
  await linked(page);
  await hiring(page, {planned: true, variant: 'open', work: 0, weeks: [['ba:skill_customerservice', null, SHORT6]]});
  const r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.equal(await page.locator('#osBody [data-os-write="hire"]').count(), 0);
  assert.match(r.act, textRe('gr.os.ck.staff.ingame.week', {}, {}));
});

test('scheduling only: staff without hours get Staff this site linked, and the BizMan › Schedule step without the link', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 3, stationShifts: 0}, FULL);
  await hiring(page, {...HIRES, weeks: [], work: 1});
  let r = (await rows(page))[2];
  assert.match(r.sub, textRe('gr.os.ck.staff.idle', {}, {}));
  assert.match(r.act, textRe('gr.os.ck.staff.ingame.week', {}, {}));
  await linked(page);
  await page.evaluate(() => { window.__calls = []; window.hrReview = o => window.__calls.push(o); });
  assert.equal((await page.locator('#osBody [data-os-write="hire"]').innerText()).trim(), en('sp.gw.staff'));
  await page.locator('#osBody [data-os-write="hire"]').click();
  assert.deepEqual(await page.evaluate(() => window.__calls), [{scope: 'site', site: SITE}]);
  /* the plan's own people with no hours in the week: the same */
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).stationShifts = 4; });
  await hiring(page, {...HIRES, weeks: [], work: 1, site: {kind: 'shop', unstaffed: {demand: {hours: 12, roles: [{skill: 'ba:skill_cleaning', idle: 1}]}}}});
  r = (await rows(page))[2];
  assert.match(r.sub, textRe('gr.os.ck.staff.nohours2', {n: 1}, {}));
  assert.equal(await page.locator('#osBody [data-os-write="hire"]').count(), 1);
  /* nothing for the action to do: no button */
  await hiring(page, {...HIRES, weeks: [], work: 0, site: {kind: 'shop', unstaffed: {demand: {hours: 12, roles: [{skill: 'ba:skill_cleaning', idle: 1}]}}}});
  assert.equal(await page.locator('#osBody [data-os-write="hire"]').count(), 0);
});

test('nobody hired yet but the plan assigns bench people: Staff this site is offered', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 0, stationShifts: 0}, FULL);
  await linked(page);
  await hiring(page, {planned: true, variant: 'demand', weeks: [], work: 2});
  const r = (await rows(page))[2];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, enRe('gr.os.ck.staff.nobody'));
  assert.equal((await page.locator('#osBody [data-os-write="hire"]').innerText()).trim(), en('sp.gw.staff'));
});

test('an open place beside a hire: the hire is the step, and the headhunter hint stays with the button', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2}, FULL);
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', null], ['ba:skill_customerservice', 'hire']]});
  let r = (await rows(page))[2];
  assert.match(r.sub, textRe('gr.os.ck.staff.nocand', {n: 1}, {}));
  assert.doesNotMatch(r.act, new RegExp([textRe('gr.os.ck.staff.ingame.move', {}).source, textRe('gr.os.ck.staff.ingame.mixed', {}).source].join('|'), 'i'));
  assert.match(r.act, textRe('gr.os.ck.staff.ingame', {roles: '1 Customer Service'}, {}));
  await linked(page);
  r = (await rows(page))[2];
  assert.match(r.act, enRe('sp.gw.staff'));
  assert.match(r.act, textRe('gr.os.ck.staff.headhunter', {roles: '1 Cleaning'}, {}));
  /* with no link, both steps: the hire and the headhunter for the open place only */
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', null], ['ba:skill_customerservice', 'hire'], ['ba:skill_customerservice', 'hire']]});
  await linked(page, null);
  r = (await rows(page))[2];
  assert.match(r.act, textRe('gr.os.ck.staff.ingame', {roles: '2 Customer Service'}, {}));
  assert.match(r.act, textRe('gr.os.ck.staff.headhunter', {roles: '1 Cleaning'}, {}));
  assert.doesNotMatch(r.act, textRe('gr.os.ck.staff.headhunter', {roles: '1 Customer Service'}, {}));
});

test('spare people the plan gives no week are left out of "n of m" and the progress bar', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 3, stationShifts: 2, staffIdle: ['spare1', 'spare2']}, FULL);
  await hiring(page);
  const r = (await rows(page))[2];
  assert.match(r.sub, textRe('gr.os.ck.staff.need', {have: 1, total: 5, need: 4}, {anchor: 'start'}));
  assert.equal(r.p, '20%');
  assert.doesNotMatch(r.sub, new RegExp([textRe('gr.os.ck.staff.nohours2', {}).source, textRe('gr.os.ck.staff.idle', {}).source, 'spare'].join('|'), 'i'));
});

test('the real staff gate offers Staff this site for a bench move with no hires', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 0, stationShifts: 0}, FULL);
  await realHiring(page, {demand: true, candidates: false});
  // The plan counts on one unassigned person, with nobody to hire.
  await page.evaluate(site => {
    D.hiring.bench = ['BENCH1'];
    D.hiring.people.BENCH1 = {name: 'Bo Bench', skills: [{skill: 'ba:skill_cleaning', level: 55}],
      wage: 17, site: null, hours: 0, demands: []};
    D.hiring.sites.find(s => s.key === site).plans.demand.bench = ['BENCH1'];
    hrSiteMemo = null;
  }, SITE);
  await linked(page);
  const body = await page.evaluate(site => hrRequest(hrMemoModel(), {mode: 'both', site, one: true}).body, SITE);
  assert.deepEqual(body.hires, []);
  assert.deepEqual(body.moves, [{employeeId: 'BENCH1', from: null,
    to: {street: 'ba:street_broadwaystreet', number: 9}}]);
  assert.ok(await page.evaluate(site => osStaffWork(site) > 0, SITE));
  const staff = (await rows(page))[2];
  assert.equal(staff.state, 'todo');
  assert.match(staff.sub, textRe('gr.os.ck.staff.benchonly', {n: 1}, {anchor: 'full'}));
  assert.equal(staff.act, en('sp.gw.staff'));
  await page.evaluate(() => { window.__calls = []; window.hrReview = o => window.__calls.push(o); });
  await page.locator('#osBody .os-ck').nth(2).locator('[data-os-write="hire"]').click();
  assert.deepEqual(await page.evaluate(() => window.__calls), [{scope: 'site', site: SITE}]);
});

test('nobody to hire says to ask a headhunter', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2}, FULL);
  await hiring(page, {planned: true, variant: 'open', weeks: [['ba:skill_cleaning', null], ['ba:skill_customerservice', null]]});
  await linked(page);
  const staff = (await rows(page))[2];
  assert.match(staff.act, textRe('gr.os.ck.staff.headhunter', {}, {}));
  assert.equal(await page.locator('#osBody [data-os-write="hire"]').count(), 0);
});

test('store instructions become buttons only for writes the linked mod supports', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 2, uniformGaps: ['Customer Service']}, FULL);
  await hiring(page);
  assert.equal(await page.locator('#osBody [data-os-write]').count(), 0);
  assert.equal(await page.locator('#osBody .os-ck .os-ingame', {hasNotText: textRe('gr.os.ck.staff.headhunter', {}, {})}).count(), 3);
  assert.match(await page.locator('#osBody .os-gate').innerText(), textRe('gr.os.ck.gate', {}, {}));
  assert.equal(await page.locator('#osBody [data-os-howlink]').count(), 1);
  await linked(page);
  assert.equal(await page.locator('#osBody .os-ck .os-ingame', {hasNotText: textRe('gr.os.ck.staff.headhunter', {}, {})}).count(), 0);
  assert.equal(await page.locator('#osBody .os-gate').count(), 0);
  assert.deepEqual(await page.$$eval('#osBody [data-os-write]', bs => bs.map(b => [b.dataset.osWrite, b.innerText.trim()])),
    [['hire', en('sp.gw.staff')], ['uniforms', en('gr.os.ck.uni.assign')], ['marketing', en('sp.gw.mk.title')]]);
  await linked(page, {...LINK, writes: ['hire', 'uniforms']});
  assert.deepEqual(await page.$$eval('#osBody [data-os-write]', bs => bs.map(b => b.dataset.osWrite)), ['hire', 'uniforms']);
  assert.equal(await page.locator('#osBody .os-ck .os-ingame', {hasNotText: textRe('gr.os.ck.staff.headhunter', {}, {})}).count(), 1);
  assert.equal(await page.locator('#osBody .os-gate').count(), 0);
});

test('How to link opens the game link\'s page, and says where to look when the footer link is missing', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1}, FULL);
  await page.evaluate(() => { const a = document.querySelector('a[data-visit-feature="game-link"]'); if(a) a.remove(); });
  await page.locator('#osBody [data-os-howlink]').click();
  assert.match(await page.locator('#osBody .os-gate').innerText(), textRe('gr.os.ck.gate.hint', {}, {}));
});

test('uniforms wait for hours: staff with no station shifts is a to-do, and only shifts and no gaps make it done', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 3, stationShifts: 0}, FULL);
  let r = await rows(page);
  assert.equal(r[3].state, 'todo');
  assert.match(r[3].sub, enRe('gr.os.ck.uni.noshifts'));
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).stationShifts = 4; drawOpenStore(); });
  assert.equal((await rows(page))[3].state, 'done');
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).staff = 0; drawOpenStore(); });
  assert.equal((await rows(page))[3].state, 'todo');
});

test('a coffee shop without chairs does not meet its seating demand; a gym\'s workout variety is checked in the game', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 2, stationShifts: 3}, FULL);
  const out = await page.evaluate(() => {
    const T = osFacts().types, key = osPlan().key, opened = osOpenedAt(osPlan());
    const seat = Object.keys(T).find(k => T[k].demands.some(d => d[0] === 'seating')), gym = Object.keys(T).find(k => T[k].demands.some(d => d[0] === 'workoutvariety'));
    const ask = (type, built) => { D.openStore.built[key] = built; const plan = {type, key}; const uni = osCkUniforms(plan, opened); const r = osCkDemands(plan, opened, uni); return {state: r.state, sub: r.sub.replace(/<[^>]+>/g, ''), act: r.act.replace(/<[^>]+>/g, '')}; };
    const met = {bathroom: true, interior: true, music: true, sink: true, toiletprivacy: true};
    Object.assign(opened, {amenities: met, missingAmenities: [], uniformGaps: []});
    return {seat: seat && [ask(seat, {placed: 9, req: [], seating: false}), ask(seat, {placed: 9, req: [], seating: true})], gym: gym && ask(gym, {placed: 9, req: [], seating: true})};
  });
  assert.ok(out.seat, 'a type asks for seating');
  assert.notEqual(out.seat[0].state, 'done');
  assert.match(out.seat[0].sub, textRe('gr.os.ck.dem.part', {items: en('gr.os.ck.dem.seating')}, {}));
  assert.match(out.seat[1].sub, new RegExp(['gr.os.ck.dem.done', 'gr.os.ck.dem.check', 'gr.os.ck.dem.part'].map(k => textRe(k).source).join('|')));
  assert.ok(out.gym, 'a type asks for workout variety');
  assert.notEqual(out.gym.state, 'done');
  assert.match(out.gym.sub, enRe('gr.os.ck.dem.variety'));
  assert.match(out.gym.act, textRe('gr.os.ck.dem.ingame', {items: en('gr.os.ck.dem.variety')}, {}));
});

test('an office needs no deliveries, before opening too and with no factory button', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 1}, FULL);
  const out = await page.evaluate(() => { const T = osFacts().types, type = 'ba:businesstype_testoffice', b = osOpenedAt(osPlan());
    T[type] = {cat: 'office', model: 'office', products: [], demands: []};
    const ask = (plan, biz) => { const r = osCkLogistics(plan, biz); return {state: r.state, sub: r.sub.replace(/<[^>]+>/g, ''), ok: /class="ok"/.test(r.sub), act: r.act}; };
    return {opened: ask({type, key: b.key}, b), vacant: ask({type, key: 'ba:street_nowhere#1'}, null)}; });
  assert.equal(out.opened.state, 'done');
  assert.match(out.opened.sub, textRe('gr.os.ck.log.office', {}, {}));
  assert.equal(out.vacant.state, 'todo');
  assert.match(out.vacant.sub, textRe('gr.os.ck.log.office.todo'));
  assert.ok(!out.vacant.ok, 'a to-do row has no green text');
  assert.ok(out.opened.ok, 'an opened office says it in green');
  assert.equal(out.vacant.act, '');
});

test('a shop needs a route for every product it sells, from a stock target or a wholesale contract, not a supply status', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 1}, FULL);
  const all = await wanted(page);
  assert.ok(all.length >= 2, 'the type sells several products');
  /* a shop whose products are only "covered" in the supply facts has no route */
  await page.evaluate(() => { D.supply.facts[D.businesses.length - 1] = {'ba:itemname_beer': {st: 'covered'}, 'ba:itemname_whisky': {st: 'covered'}}; drawOpenStore(); });
  let r = (await rows(page))[6];
  assert.equal(r.state, 'todo');
  assert.match(r.act, enRe('gr.os.ck.log.go'));
  /* a product the shop stocks but has not sold yet counts as much as one it sells: the pairs are not tied to sales rows */
  await routed(page, [all[0]]);
  r = (await rows(page))[6];
  assert.equal(r.state, 'part');
  assert.match(r.sub, textRe('gr.os.ck.log.part', {}, {}));
  await routed(page, all.slice(1));
  assert.equal((await rows(page))[6].state, 'done');
});

test('a product with a zero stock target is not routed, and nothing in D.supply.routed for it means no delivery', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 1}, FULL);
  const all = await wanted(page);
  await routed(page, all.slice(1));
  const r = (await rows(page))[6];
  assert.equal(r.state, 'part');
  assert.ok(r.sub.includes(await page.evaluate(p => itemName(p), all[0])), r.sub);
  assert.match(r.act, enRe('gr.os.ck.log.go'));
});

test('a link on the graph is not a route: only a stock target or a wholesale contract is', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 1}, FULL);
  const all = await wanted(page);
  await page.evaluate(({site, slugs}) => { D.supply.graph.links.push({from: 'import:ba:street_pier#1', to: site, slugs, cadence: 'daily', paused: false}); drawOpenStore(); }, {site: SITE, slugs: all});
  assert.equal((await rows(page))[6].state, 'todo');
});

test('a different business at the address is named, and the rows wait for the planned one', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 3, typeSlug: 'ba:businesstype_bakery', type: 'Bakery', stationShifts: 2}, FULL);
  const r = await rows(page);
  assert.equal(r[0].state, 'todo');
  assert.match(r[0].sub, textRe('gr.os.ck.lease.rented', {}, {anchor: 'start'}));
  assert.deepEqual(r.slice(1).map(x => x.state), ['todo', 'todo', 'todo', 'todo', 'todo', 'todo']);
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.ck.othertype', {type: 'Bakery'}, {}));
});

test('a rented address with nothing opened there yet leaves the lease a to-do', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {status: 'vacant', staff: 0});
  const r = await rows(page);
  assert.equal(r[0].state, 'todo');
  assert.match(r[0].sub, textRe('gr.os.ck.lease.vacant', {}, {anchor: 'start'}));
  assert.match(await page.locator('#osBody .os-prog').innerText(), textRe('gr.os.ck.count', {n: 0, of: 7}, {}));
  /* once a business of the planned type stands there, the lease ticks */
  await page.evaluate(() => { D.businesses.find(x => x.key === osPlan().key).status = 'retail'; drawOpenStore(); });
  assert.equal((await rows(page))[0].state, 'done');
});

test('Set the cheapest mix opens the site panel\'s marketing write for the plan\'s store, and explains a refusal', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1}, FULL);
  await linked(page);
  const r = (await rows(page))[5];
  assert.equal(r.state, 'todo');
  assert.match(r.sub, new RegExp(textRe('gr.os.ck.mk.none').source + ' \u00b7 ' + textRe('sp.mk.line', {mix: en('gr.os.mk.smallinternet'), cost: 100, p: 100}).source, 'i'));
  await page.evaluate(() => { window.__writes = [];
    SOURCE.write = async (kind, body, o) => { window.__writes.push({kind, body, dryRun: o && o.dryRun});
      return {body: {ok: false, rows: [{error: 'no_contact', agency: {name: 'CityAds', address: {street: 'ba:street_secondavenue', number: 5}}, opens: null, address: body.sites[0].address}]}}; }; });
  await page.locator('#osBody [data-os-write="marketing"]').click();
  const dlg = page.locator('dialog.gw-dlg');
  await dlg.waitFor();
  await page.waitForFunction(() => window.__writes.length > 0);
  const sent = await page.evaluate(() => window.__writes[0]);
  assert.equal(sent.kind, 'marketing');
  assert.equal(sent.dryRun, true);
  assert.deepEqual(sent.body.sites, [{address: {street: 'ba:street_broadwaystreet', number: 9}, on: ['SmallInternet'], was: [], prediction: {dailyCost: 100, marketing: 40, total: 100}}]);
  assert.equal(await dlg.locator('h2').innerText(), en('sp.gw.mk.title'));
  assert.match(await dlg.innerText(), textRe('nav.dlg.refuse.nocontact.rule', {agency: 'CityAds'}, {}));
});

test('a mix that waits on an agency says why and its button does nothing; without the write it says what to switch in BizMan', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, marketingPlan: {...MKPLAN, agencies: ['ba:street_nowhere#1']}}, FULL);
  await linked(page);
  const r = (await rows(page))[5];
  assert.match(r.sub, textRe('sp.mk.why.none', {}, {}));
  const btn = page.locator('#osBody [data-os-write="marketing"]');
  assert.equal(await btn.getAttribute('aria-disabled'), 'true');
  await btn.click({force: true});
  assert.equal(await page.locator('dialog.gw-dlg[open]').count(), 0);
  await linked(page, {...LINK, writes: ['hire', 'uniforms']});
  assert.match((await rows(page))[5].act, textRe('sp.mk.hand.visit', {types: en('gr.os.mk.smallinternet')}, {flags: 'i'}));
});

test('no agency in the phone yet: the row says which to visit, with no button', async t => {
  const page = await board(t);
  await until(page);
  await page.evaluate(() => { D.marketingAgencies = [{key: 'ba:street_secondavenue#5', name: 'CityAds', address: '5 Second Avenue', contact: false, types: ['SmallInternet'], hours: []}]; });
  await opened(page, {staff: 1, marketingPlan: {...MKPLAN, on: null, visit: ['ba:street_secondavenue#5']}}, FULL);
  await linked(page);
  const r = (await rows(page))[5];
  assert.equal(r.state, 'todo');
  assert.match(r.act, textRe('sp.mk.novisit2', {agencies: 'CityAds (5 Second Avenue)'}, {}));
  assert.equal(await page.locator('#osBody [data-os-write="marketing"]').count(), 0);
});

test('a running campaign, from the save\'s enabled set, leaves the marketing row done with no button; so does a mix of none', async t => {
  const page = await board(t);
  await until(page);
  await linked(page);
  await opened(page, {staff: 1, marketing: 0, campaigns: running('MediumInternet')}, FULL);
  const r = await rows(page);
  assert.equal(r[5].state, 'done');
  assert.equal(r[5].act, '');
  /* money spent last week is no proof: with no campaign enabled the row is a to-do */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.campaigns[0].enabled = false; b.marketing = 350; b.marketingIndex = 20; drawOpenStore(); });
  assert.equal((await rows(page))[5].state, 'todo');
  /* promotion already full without a campaign: nothing to start */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.marketingPlan = {...b.marketingPlan, on: [], costPlan: 0, promotionPlan: 100}; drawOpenStore(); });
  const done = (await rows(page))[5];
  assert.equal(done.state, 'done');
  assert.match(done.sub, textRe('gr.os.ck.mk.unneeded', {}, {}));
});

test('a mix of no campaigns says none would raise promotion; a missing switch is set up, an unvisited agency named', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, marketingPlan: {...MKPLAN, on: [], promotionPlan: 80}}, FULL);
  await linked(page);
  let r = (await rows(page))[5];
  assert.equal(r.state, 'done');
  assert.match(r.sub, enRe('gr.os.ck.mk.useless'));
  assert.doesNotMatch(r.act, textRe('gr.os.ck.mk.ingame', {}, {}));
  assert.equal(await page.locator('#osBody [data-os-write="marketing"]').count(), 0);
  /* a switch BizMan lacks: the site panel's set-up, through gwMarketing's setup mode */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.marketingPlan = {...b.marketingPlan, needsSetup: true}; window.__mk = [];
    window.gwMarketing = (keys, mode) => window.__mk.push([keys, mode]); drawOpenStore(); });
  r = (await rows(page))[5];
  assert.equal(r.state, 'todo');
  const before = await page.evaluate(() => [osPlan().mode, paybackMode()]);
  await page.locator('#osBody [data-os-write="marketing"]').click();
  assert.deepEqual(await page.evaluate(() => window.__mk), [[[SITE], 'setup']]);
  assert.deepEqual(await page.evaluate(() => [osPlan().mode, paybackMode()]), before, 'the set-up is not the install-mode toggle');
  /* without the write the set-up is optional, promotion unchanged: done */
  await linked(page, {...LINK, writes: ['hire', 'uniforms']});
  assert.equal((await rows(page))[5].state, 'done');
  await linked(page);
  /* an agency not visited yet may sell a better mix */
  await page.evaluate(() => { D.marketingAgencies = [{key: 'ba:street_secondavenue#5', name: 'CityAds', address: '5 Second Avenue', contact: false, types: ['SmallInternet'], hours: []}];
    const b = D.businesses.find(x => x.key === osPlan().key); b.marketingPlan = {...b.marketingPlan, needsSetup: false, visit: ['ba:street_secondavenue#5']}; drawOpenStore(); });
  r = (await rows(page))[5];
  assert.equal(r.state, 'todo');
  assert.match(r.act, textRe('sp.mk.better2', {agencies: 'CityAds (5 Second Avenue)'}, {}));
  assert.doesNotMatch(r.sub, textRe('gr.os.ck.mk.useless', {}, {}));
  assert.match(r.sub, textRe('gr.os.ck.mk.none', {}, {}));
  /* a switch to set up and an agency to visit: the button, and the visit hint after it */
  await page.evaluate(() => { const b = D.businesses.find(x => x.key === osPlan().key); b.marketingPlan = {...b.marketingPlan, needsSetup: true}; drawOpenStore(); });
  r = (await rows(page))[5];
  assert.match(r.sub, textRe('gr.os.ck.mk.none', {}, {}));
  assert.doesNotMatch(r.sub, textRe('gr.os.ck.mk.useless', {}, {}));
  assert.equal(await page.locator('#osBody [data-os-write="marketing"]').count(), 1);
  assert.match(r.act, textRe('sp.mk.better2', {agencies: 'CityAds (5 Second Avenue)'}, {}));
  /* linked, but a mod without the marketing write: the set-up is optional, the better mix still needs the visit */
  await linked(page, {...LINK, writes: ['hire', 'uniforms']});
  r = (await rows(page))[5];
  assert.equal(r.state, 'todo');
  assert.equal(await page.locator('#osBody [data-os-write="marketing"]').count(), 0);
  assert.match(r.act, textRe('sp.mk.better2', {agencies: 'CityAds (5 Second Avenue)'}, {}));
});

test('an unmet hairdresser shelf is named in words, not by its id', async t => {
  const page = await board(t);
  await until(page);
  await opened(page, {staff: 1, stationShifts: 1}, {placed: 20, req: [['shelfwithhaircareproducts', 1, 0]], seating: false});
  const r = (await rows(page))[1];
  assert.match(r.sub, textRe('gr.os.ck.furn.part', {items: en('gr.os.ck.furn.haircare')}, {}));
  assert.doesNotMatch(r.sub, /Shelfwithhaircareproducts/i);
});
