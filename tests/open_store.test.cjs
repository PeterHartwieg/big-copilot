// Expansion › Open a store (docs/dashboard-reference.md, "Open a store"): the four
// steps a plan walks -- what, where, the investment, break even -- the Demand
// cell's way in, the plans kept per character, and the financing panel. Step 5,
// the checklist until opening, is tests/open_store_checklist.test.cjs; step 6,
// after opening, is tests/open_store_opened.test.cjs. The board is the CLI page
// rendered from the synthetic day-47 payload snapshot
// (tests/fixtures/payload_snapshot/, never a real save; setup in
// tests/_open_store.cjs). Its one rival shop in Midtown (9 Broadway Street, an
// M1) is the building a plan picks; the test frees it first, as the save has no
// empty shop. Install Playwright and its Chromium browser to run; NODE_PATH may
// point at an existing installation.
const {test} = require('node:test');
const H = require('./_open_store.cjs');
const {assert, en, textEn, textRe, LIQ, MID, SITE, board, steps, strip, money, planned, opened, FULL, OPENED} = H;

test('headquarters finds offices and prices a default outfit and weekly rent without a profit model', async t => {
  const page = await board(t, {hq: true});
  await page.locator(`#osBody .os-type[data-os-new="${H.HQ}"]`).click();
  await page.locator('#osFinderMap .place.fr').first().waitFor();
  assert.equal(await page.locator('#osFinderMap .fplan-type').textContent(), 'Headquarters');
  assert.deepEqual(await page.evaluate(() => [osFinder.fs.cat, osFinder.fs.type]), ['office', H.HQ]);
  const candidates = await page.$$eval('#osFinderMap .place.fr', rs => rs.map(r => r.dataset.pick));
  assert.equal(candidates.length, 2);
  assert.deepEqual(await page.evaluate(keys => keys.map(k => osBuilding(k).type), candidates), ['office', 'office']);
  await page.locator(`#osFinderMap .place[data-pick="${H.HQ_SITE}"]`).click();
  await page.locator('#osFinderMap .site [data-action="plan"]').click();
  const cost = await page.evaluate(() => osInvestment(osPlan(), osBuilding(osPlan().key)));
  assert.equal(cost.furniture, 9150);
  assert.equal(cost.items, 15);
  assert.equal(cost.deposit, 6000);
  assert.equal(cost.firm, 9150 + 285 * 586 + 6000);
  assert.equal(cost.self, 9150 + cost.delivery + cost.decor + 6000);
  assert.match(await page.locator('#osBody').innerText(), /5 workstations by default/);
  for(const role of ['Purchasing Agent', 'Logistics Manager', 'HR Manager', 'Headhunter', 'Pricing Manager'])
    assert.ok((await page.locator('#osBody').innerText()).includes(role), role);
  for(const mode of ['firm', 'self']){
    await page.locator(`[data-os-mode="${mode}"]`).click();
    assert.match(await page.locator('#osBody').innerText(), /Computer[\s\S]*Armchair[\s\S]*Office Desk/);
    assert.match(await page.locator('#osBody').innerText(), /\$700\/week in rent/);
    assert.match((await strip(page))[3], /Running cost[\s\S]*\$700\/week in rent/i);
    const quantities = await page.evaluate(() => osOutfit(osPlan(), osBuilding(osPlan().key)).lines.map(l => l[1]));
    assert.deepEqual(quantities, [5, 5, 5]);
  }
  assert.match(await page.locator('#osCtl [data-os-step="breakeven"]').innerText(), /Running cost$/);
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  const text = await page.locator('#osBody').innerText();
  assert.match(text, /Wages are extra and depend on whom you hire and their hours/);
  assert.match(text, /Headquarters has no sales income or break-even/);
  assert.equal(await page.locator('#osBody svg.os-chart, #osFin').count(), 0);
  const estimate = await page.evaluate(() => {
    const p = osPlan(), b = osBuilding(p.key), e = osEstimate(p, b);
    return {model: osModel(p.type, b), profit: e.profit ?? null, days: e.days ?? null, snap: p.snap};
  });
  assert.deepEqual([estimate.model, estimate.profit, estimate.days], [null, null, null]);
  assert.equal(estimate.snap.profit, null);
  assert.equal(estimate.snap.days, null);
  await page.evaluate(() => { osPlansFor = null; osLoad(); drawOpenStore(); });
  assert.equal(await page.evaluate(() => osPlan().type), H.HQ);
  assert.equal(await page.evaluate(() => osStep), 'breakeven');
  // A missing rent is unknown, never a promise of free headquarters.
  await page.evaluate(() => { osBuilding(osPlan().key).rent = null; drawOpenStore(); });
  assert.match(await page.locator('#osBody').innerText(), /Rent is unavailable/);
  assert.doesNotMatch(await page.locator('#osBody').innerText(), /\$0\/week/);
});

test('headquarters can use an empty office already rented without a second deposit', async t => {
  const page = await board(t, {hq: true});
  await page.evaluate(key => { const b = osBuilding(key); b.status = 'mine'; b.occupant = null; }, H.HQ_SITE);
  await H.plannedHq(page);
  assert.equal(await page.evaluate(() => osInvestment(osPlan(), osBuilding(osPlan().key)).deposit), 0);
  assert.match(await page.locator('#osBody').innerText(), /no additional rental deposit/);
  assert.match((await strip(page))[3], /\$700\/week in rent/);
});

test('an empty rented shop is suggested and its investment has no second deposit', async t => {
  const page = await board(t);
  const before = await page.evaluate(({key, type}) => {
    const b = osBuilding(key), inv = osInvestment({type}, b);
    b.status = 'mine'; b.occupant = null;
    return {deposit: inv.deposit, self: inv.self, firm: inv.firm, rent: b.rent};
  }, {key: SITE, type: LIQ});
  await page.locator(`#osBody .os-type[data-os-new="${LIQ}"]`).click();
  const row = page.locator(`#osFinderMap .place[data-pick="${SITE}"]`);
  await row.waitFor();
  assert.match(await row.innerText(), /Already rented/);
  assert.equal(await row.locator('.dep').innerText(), '$0');
  await row.click();
  await page.locator('#osFinderMap .site [data-action="plan"]').click();
  await page.waitForFunction(() => osStep === 'investment');
  const after = await page.evaluate(() => ({inv: osInvestment(osPlan(), osBuilding(osPlan().key)),
    rent: osBuilding(osPlan().key).rent}));
  assert.equal(after.inv.deposit, 0);
  assert.equal(after.inv.self, before.self - before.deposit);
  assert.equal(after.inv.firm, before.firm - before.deposit);
  assert.equal(after.rent, before.rent);
  assert.match(await page.locator('#osBody').innerText(), /no additional rental deposit/);
  for(const mode of ['self', 'firm']){
    await page.locator(`[data-os-mode="${mode}"]`).click();
    assert.match(await page.locator('#osStrip').innerText(), /Already rented/);
    assert.doesNotMatch(await page.locator('#osStrip').innerText(), /deposit included/);
    if(mode === 'self') assert.doesNotMatch(await page.locator('#osBody .os-total small').innerText(), /deposit/);
  }
});

test('the view is Expansion\'s, New until opened, and starts on What with its six steps', async t => {
  const page = await board(t, {hash: '#expansion/demand'});
  await page.evaluate(() => featureDiscovery.asOf(featureDiscovery.since['open-store']));
  const tab = page.locator('#localNav a[data-route="expansion/open"]');
  assert.equal(await tab.locator('.feature-new').isVisible(), true, 'New until the view is opened');
  assert.deepEqual(await page.$$eval('#localNav a[data-route]', as => as.map(a => a.dataset.route)),
    ['expansion/demand', 'expansion/finder', 'expansion/open', 'expansion/factory', 'expansion/rivals']);
  await tab.click();
  await page.waitForFunction(() => route === 'expansion/open');
  assert.equal(await page.locator('#localNav a[data-route="expansion/open"] .feature-new').isVisible(), false);
  assert.equal(await page.locator('#secOpen').isVisible(), true);
  // The steps and the plan picker stand beside the view's tabs.
  assert.equal(await page.locator('#viewCtl #osCtl').count(), 1);
  assert.deepEqual(await steps(page), [['what', 'on', false], ['where', '', true], ['investment', '', true],
    ['breakeven', '', true], ['opening', '', true], ['open', '', true]]);
  // From demand: the neighbourhoods with the most demand where the player has no such shop yet.
  const rows = await page.$$eval('#osBody .os-dl tbody tr', trs => trs.map(tr => tr.innerText.replace(/\s+/g, ' ')));
  assert.ok(rows.length >= 3);
  const scores = await page.$$eval('#osBody .os-dl .sc', cs => cs.map(c => +c.textContent));
  assert.deepEqual(scores, scores.slice().sort((a, b) => b - a), 'strongest demand first');
  // Midtown's liquor store is the player's own, so Midtown is not offered for it.
  assert.ok(!rows.some(r => /Liquor Store .*Midtown/.test(r)), rows.join(' | '));
  // Or a type: every shop the rules know, offices apart; the count is how many the player runs.
  assert.match(await page.locator('#osBody .os-type', {hasText: 'Liquor Store'}).innerText(), /Liquor Store\s*1/);
  assert.equal(await page.locator('#osBody .os-h').count(), 0, 'no plans yet');
});

test('a Demand cell\'s Open a store here starts a plan for its type and neighbourhood on Where', async t => {
  const page = await board(t, {hash: '#expansion/demand'});
  await page.locator(`#market .cell[data-slug="${LIQ}"][data-hood="${MID}"]`).click();
  const pop = page.locator('#demCellPop');
  assert.match(await pop.innerText(), /Liquor Store · Midtown/);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.demGo), 'open');
  await pop.locator('[data-dem-go="open"]').click();
  await page.waitForFunction(() => route === 'expansion/open' && osStep === 'where');
  assert.equal(await pop.isVisible(), false);
  const s = await strip(page);
  assert.match(s[0], new RegExp('Liquor Store ' + textRe('gr.os.strip.demand', {hood: 'Midtown', n: 68}).source));
  assert.match(s[1], textRe('gr.os.strip.nowhere', {}, {}));
  // The finder is fixed to the plan's type, Midtown only, and lists the building.
  await page.locator('#osFinderMap .place.fr').first().waitFor();
  assert.equal(await page.locator('#osFinderMap .fplan-type').textContent(), 'Liquor Store');
  assert.deepEqual(await page.$$eval('#osFinderMap .place.fr', r => r.map(x => x.dataset.pick)), [SITE]);
  // The way back is Demand.
  assert.match(await page.locator('#arrive').innerText(), textRe('gr.arrive.cell', {type: 'Liquor Store', hood: 'Midtown'}, {}));
});

test('Plan here opens the investment: one table by reason for the firm, a list by store for self-installation', async t => {
  const page = await board(t);
  await planned(page);
  const inv = await page.evaluate(() => osInvestment(osPlan(), osBuilding(osPlan().key)));
  const b = await page.evaluate(site => premises().buildings.find(x => x.key === site), SITE);
  // The firm charges 586 a square metre, every item at its default price, and the deposit.
  assert.equal(inv.fee, 586 * b.m2);
  assert.equal(inv.firm, inv.furniture + inv.fee + b.deposit);
  const groups = await page.$$eval('#osBody .os-inv tr.grp td', tds => tds.map(td => td.firstChild.textContent.trim()));
  assert.deepEqual(groups.filter(g => g !== en('gr.os.grp.dem') && g !== en('gr.os.grp.cap')),
    [en('gr.os.inv.firm'), en('gr.os.grp.shelf'), en('gr.os.inv.deposit')]);
  assert.ok(groups.includes(en('gr.os.grp.dem')), 'a liquor store asks for music, uniforms and a toilet');
  // Midtown asks for an interior score: the firm lays the walls and floors free.
  assert.match(await page.locator('#osBody .os-inv td.free').locator('xpath=..').innerText(), textRe('gr.os.inv.walls.met', {hood: 'Midtown', n: 50}, {}));
  assert.equal(money(await page.locator('#osBody .os-inv tfoot td').last().textContent()), Math.round(inv.firm));
  assert.equal(money((await strip(page))[2]), Math.round(inv.firm));
  assert.deepEqual((await steps(page)).map(s => s[1]), ['done', 'done', 'on', '', '', '']);
  // Self-installation: the items by store, a delivery each, the walls and floors Midtown asks for, the deposit.
  await page.locator('#osBody [data-os-mode="self"]').click();
  const cards = page.locator('#osBody .os-store');
  assert.ok(await cards.count() >= 3);
  assert.match(await page.locator('#osBody .os-store', {hasText: en('gr.os.inv.walls')}).innerText(), textRe('gr.os.self.walls.sub', {hood: 'Midtown', n: 50}, {}));
  assert.equal(money(await page.locator('#osBody .os-total b').textContent()), Math.round(inv.self));
  assert.equal(inv.self, inv.furniture + inv.delivery + inv.decor + b.deposit);
  assert.match((await strip(page))[2], textRe('gr.os.strip.self', {}, {}));
  // The choice is the plan's, and the portfolio's too (paybackMode()).
  assert.equal(await page.evaluate(() => [osPlan().mode, paybackMode()].join()), 'self,self');
});

test('Include optional items: off by default and as before; on, its group counts in both totals and the break even, kept per viewer', async t => {
  const page = await board(t);
  await planned(page);
  const now = () => page.evaluate(() => { const p = osPlan(), b = osBuilding(p.key); return {inv: osInvestment(p, b), out: osOutfit(p, b)}; });
  const off = await now();
  const opt = off.out.opt;
  // A liquor store takes a Cleaning station and can be robbed: the locker and a camera.
  assert.deepEqual(opt.filter(l => !Array.isArray(l[3])).map(l => [l[0], l[3]]), [['ba:itemname_cleaningstation', 'cleaning'],
    ['ba:itemname_securityguardlocker', 'security'], ['ba:itemname_securitycamera', 'security']]);
  assert.equal(off.out.lines.some(l => l[2] === 'opt'), false);
  assert.equal(await page.locator('#osBody [data-os-opt]').isChecked(), false);
  assert.equal(await page.locator('#osBody .os-inv tr.grp', {hasText: en('gr.os.grp.opt')}).count(), 0);
  // The caption names the kinds this store gets: a liquor store all three.
  assert.equal(await page.locator('#osBody .os-optbar .quiet').innerText(), en('gr.os.opt.adds',
    {items: [en('gr.os.opt.kind.cleaning'), en('gr.os.opt.kind.security'), en('gr.os.opt.kind.also')].join(', ')}));
  assert.deepEqual(await page.evaluate(() => osOptKinds([['x', 1, 'opt', 'cleaning']])), [en('gr.os.opt.kind.cleaning')]);

  await page.locator('#osBody [data-os-opt]').check();
  await page.waitForFunction(() => osOptional() === true);
  const on = await now();
  assert.equal(on.inv.furniture, off.inv.furniture + off.out.optFurniture);
  assert.equal(on.inv.firm, off.inv.firm + off.out.optFurniture);
  assert.equal(on.inv.items, off.inv.items + opt.reduce((n, l) => n + l[1], 0));
  assert.equal(await page.locator('#osBody .os-inv tr.grp', {hasText: en('gr.os.grp.opt')}).count(), 1);
  assert.equal(await page.locator('#osBody .os-inv .os-tag.opt').count(), opt.length);
  assert.equal(money(await page.locator('#osBody .os-inv tfoot td').last().textContent()), Math.round(on.inv.firm));
  assert.match(await page.locator('#osBody .os-optbar').innerText(), textRe('gr.os.opt.on', {}, {}));
  assert.equal(await page.evaluate(() => localStorage.getItem('ba_dash_os_optional')), '1');
  // Self-installation buys them too, each tagged optional.
  await page.locator('#osBody [data-os-mode="self"]').click();
  assert.equal(money(await page.locator('#osBody .os-total b').textContent()), Math.round(on.inv.self));
  assert.equal(on.inv.self, off.inv.self + off.out.optFurniture + on.inv.delivery - off.inv.delivery);
  assert.equal(await page.locator('#osBody .os-store .os-tag.opt').count(), opt.length);
  // The break even counts them, and says so.
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  await page.waitForFunction(() => osStep === 'breakeven');
  assert.ok((await page.locator('#osBody .os-note').allInnerTexts()).includes(en('gr.os.be.opt')));
  assert.equal(await page.evaluate(() => { const p = osPlan(); return osEstimate(p, osBuilding(p.key)).inv.self; }), on.inv.self);

  // Kept across a reload, and off again is the list as it was.
  await page.reload({waitUntil: 'load'});
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  assert.equal(await page.evaluate(() => osOptional()), true);
  await page.evaluate(site => { premises().buildings.find(b => b.key === site).status = 'vacant'; }, SITE);
  await page.locator('#osCtl [data-os-step="investment"]').click();
  await page.waitForFunction(() => osStep === 'investment');
  await page.locator('#osBody [data-os-opt]').uncheck();
  await page.waitForFunction(() => osOptional() === false);
  assert.deepEqual((await now()).inv, off.inv);
});

test('the plan\'s kept figures follow the optional switch until the store opens, then stay as they were', async t => {
  const page = await board(t);
  await planned(page);
  const firm = () => page.evaluate(() => osPlan().snap.inv.firm);
  const days = () => page.evaluate(() => JSON.stringify(osPlan().snap.days));
  const off = await firm(), offDays = await days();
  const extra = await page.evaluate(() => { const p = osPlan(), b = osBuilding(p.key); return osOutfit(p, b).optFurniture; });
  assert.ok(extra > 0);
  await page.locator('#osBody [data-os-opt]').check();
  await page.waitForFunction(() => osOptional() === true);
  assert.equal(await firm(), Math.round(off + extra));
  assert.notEqual(await days(), offDays, 'break even moves with the investment');
  await page.locator('#osBody [data-os-opt]').uncheck();
  await page.waitForFunction(() => osOptional() === false);
  assert.equal(await firm(), off);
  assert.equal(await days(), offDays);
  // On when the store opens: that figure is kept, whatever the switch says later.
  await page.locator('#osBody [data-os-opt]').check();
  await page.waitForFunction(() => osOptional() === true);
  await opened(page, {opened: OPENED}, FULL);
  assert.equal(await firm(), Math.round(off + extra));
  await page.evaluate(() => { osSetOptional(false); drawOpenStore(); });
  assert.equal(await firm(), Math.round(off + extra), 'frozen once the store opened');
});

test('Break even shows both install modes from the game\'s rules, a range, tax, your own shop and a loan', async t => {
  const page = await board(t);
  await planned(page);
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  await page.waitForFunction(() => osStep === 'breakeven');
  const est = await page.evaluate(() => { const p = osPlan(); const e = osEstimate(p, osBuilding(p.key));
    return {profit: e.profit, firm: e.days.firm, self: e.days.self, mix: e.model.mix}; });
  assert.ok(est.profit > 0, 'the rules give the Midtown liquor store a profit');
  assert.ok(est.firm.low <= est.firm.high && est.self.high <= est.firm.high);
  const big = await page.$$eval('#osBody .os-big > div', ds => ds.map(d => d.textContent.replace(/\s+/g, ' ')));
  assert.match(big[0], textRe('gr.os.inv.firm', {}, {flags: 'i'}));
  assert.match(big[1], textRe('gr.os.inv.self', {}, {flags: 'i'}));
  assert.equal(await page.locator('#osBody svg.os-chart').count(), 1);
  const notes = await page.locator('#osBody .os-note').allInnerTexts();
  assert.match(notes[0], textRe('gr.os.be.mid', {}, {anchor: 'full'}));
  // The range behind the single figure is on hover.
  assert.match(await page.locator('#osBody .os-note .os-rng').first().getAttribute('data-tip'), /^\$[\d,]+–\$[\d,]+$/);
  assert.match(notes[1], textRe('gr.os.be.tax', {n: 5}, {anchor: 'full'}));
  // After tax is the shown figure (the range's middle) less the tax, not the top of the range.
  const taxed = await page.evaluate(() => { const plan = osPlan(), est = osEstimate(plan, osBuilding(plan.key));
    return fmt(est.profit * OS_MID * (1 - osFacts().game.tax / 100)); });
  assert.equal(notes[1], textEn('gr.os.be.tax', {n: 5, w: taxed}));
  assert.equal(await page.locator('#osBody .os-ownc h3').innerText(), en('gr.os.own.title', {n: 1}));
  // The player's own liquor store against the same rules, as a line and its own card.
  assert.ok(notes.some(n => textRe('gr.os.be.own', {n: 1}, {}).test(n)), notes.join('\n'));
  assert.equal(await page.locator('#osBody .os-ownc .os-site').count(), 1);
  // Financing: off until asked for; then the amount moves only the figures.
  assert.match(await page.locator('#osFin').innerText(), textRe('gr.os.fin.off', {}, {}));
  await page.locator('#osFin [data-os-fin-on]').check();
  const facts = page.locator('#osFinFacts > div');
  assert.equal(await facts.count(), 4);
  await page.locator('#osFin [data-os-fin-amount]').fill('20000');
  await page.waitForFunction(() => osPlan().finance.amount === 20000);
  const loan = await page.evaluate(() => { const bank = osFacts().finance.banks.find(b => b.id === 'VantanderBankSettings');
    return osLoan(20000, bank); });
  // Flat interest, floor(20,000 x 12% x 0.7 / 100 / 60) = 28 a day; 83 repaid over 241 days.
  assert.deepEqual([loan.interest, loan.repay, loan.days], [28, 83, 241]);
  assert.match(await facts.nth(1).innerText(), new RegExp("\\$111[\\s\\S]*" + textRe('gr.os.fin.daily.sub', {r: '$83', i: '$28'}).source));
  assert.match(await facts.nth(2).innerText(), new RegExp([textRe('gr.os.fin.interest.early', {n: 241}).source, textRe('gr.os.fin.interest.term', {n: 241}).source].join('|')));
});

test('plans are kept per character: a reload opens the plan where it was left, and a plan can be deleted', async t => {
  const context = await H.browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  const page = await board(t, {context});
  await planned(page);
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  await page.evaluate(site => { premises().buildings.find(b => b.key === site).status = 'vacant'; }, SITE);
  await page.evaluate(() => openRoute('expansion/open'));
  await page.waitForFunction(() => osStep === 'breakeven');
  assert.match(await page.locator('#osCtl select[data-os-plan] option:checked').textContent(), /Liquor Store · 9 Broadway Street/);
  // Another character's board has its own plans.
  const stored = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ba_open_store_v1:')));
  assert.deepEqual(stored, [`ba_open_store_v1:${await page.evaluate(() => D.meta.character)}`]);
  // New plan: What again, with the plan in Your plans; deleting it empties the list.
  await page.locator('#osCtl select[data-os-plan]').selectOption('');
  await page.waitForFunction(() => osStep === 'what');
  assert.equal(await page.locator('#osBody .os-plan').count(), 1);
  assert.match(await page.locator('#osBody .os-plan').innerText(), /Liquor Store[\s\S]*9 Broadway Street · Midtown/);
  await page.locator('#osBody [data-os-drop]').click();
  assert.equal(await page.locator('#osBody .os-plan').count(), 0);
});

test('an office is planned by the office rules: fee-hours from its capacity, its staff by the hour', async t => {
  const page = await board(t);
  const m = await page.evaluate(() => {
    const t = {cat: 'office', model: 'office', products: [['ba:itemname_hourlylawyerfee', 1]], days: Array(7).fill(2),
      hours: Array(24).fill(2), wage: 50, initial: {K1: 50}, layouts: {}};
    D.openStore.types['ba:businesstype_lawfirm'] = t;
    D.openStore.market['ba:itemname_hourlylawyerfee'] = {p: 225, r: 1, d: 1, s: 1, opt: 3, cost: 0,
      hoods: {'ba:neighborhood_midtown': [0, 0, null]}};
    return osModel('ba:businesstype_lawfirm', {hood: 'ba:neighborhood_midtown', cap: 50, m2: 660, layout: 'K1', traffic: 0, rent: 0}, {sat: 100});
  });
  // Every hour brings more clients than the 50 computers: the day shift bills
  // 50 an hour, the 3 around the clock bill the rest.
  assert.equal(m.office, true);
  assert.equal(m.customers, (14 * 50 + 10 * 3) * 5 / 7 + (14 * 25 + 10 * 3) * 2 / 7);
  assert.equal(m.cogs, 0);
  assert.ok(m.wages > 0 && m.revenue > m.wages);
});

test('the loan amount: past the limit the field snaps to it, and 0 stays 0 across a redraw and a reload', async t => {
  const context = await H.browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  const page = await board(t, {context});
  await planned(page);
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  await page.locator('#osFin [data-os-fin-on]').check();
  await page.locator('#osFin [data-os-bank="JensenCapitalSettings"]').click();
  const field = page.locator('#osFin [data-os-fin-amount]');
  const limit = await page.evaluate(() => Math.min(osLoanLimit(osFacts().finance.banks.find(b => b.id === 'JensenCapitalSettings')),
    Math.floor(osInvestment(osPlan(), osBuilding(osPlan().key)).firm)));
  await field.fill('9999999');
  assert.equal(+(await field.inputValue()), limit, 'the field says the loan the figures use');
  assert.ok((await page.locator('#osFinFacts').innerText()).includes(en('gr.os.fin.upfront.sub', {w: '$' + limit.toLocaleString('en-US')})));
  await field.fill('0');
  assert.equal(await page.evaluate(() => osPlan().finance.amount), 0);
  await page.locator('#osCtl [data-os-step="investment"]').click();
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  assert.equal(await page.locator('#osFin [data-os-fin-amount]').inputValue(), '0', 'a redraw keeps 0');
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  await page.evaluate(() => openRoute('expansion/open'));
  await page.waitForFunction(() => osStep === 'breakeven');
  assert.equal(await page.locator('#osFin [data-os-fin-amount]').inputValue(), '0', 'and so does a reload');
});

test('the shopping list combines required capacity stations without changing the outfit or vendor allocation', async t => {
  const page = await board(t);
  await planned(page);
  const result = await page.evaluate(() => {
    const b = osBuilding(osPlan().key), F = osFacts();
    const chair = 'test:hairdresserchair', till = 'test:register', speaker = 'test:speaker';
    F.items[chair] = {p: 500, v: ['test:salon']};
    F.items[till] = {p: 200, v: ['test:salon']};
    F.items[speaker] = {p: 100, v: ['test:audio']};
    F.vendors['test:salon'] = {n: 'Salon supplier'};
    F.vendors['test:audio'] = {n: 'Audio supplier'};
    const out = {lines: [[chair, 1, 'req', 'hairdresserchair'], [chair, 3, 'cap', 'capacity'],
      [till, 1, 'req', 'pointofsales'], [till, 1, 'cap', 'capacity'],
      [speaker, 1, 'dem', 'music'], [chair, 1, 'opt', 'security']], furniture: 3000};
    const before = JSON.stringify(out), stores = osStores(out);
    const inv = {fee: 0, deposit: 0, firm: 3000, self: 3000, items: 8};
    const read = html => {
      const host = document.createElement('div'); host.innerHTML = html;
      return [...host.querySelectorAll('tbody tr')].filter(tr => tr.querySelector('.os-tag')).map(tr => ({
        cells: [...tr.cells].map(td => td.textContent), tags: [...tr.querySelectorAll('.os-tag')].map(x => x.textContent)}));
    };
    const firm = read(osFirmHtml(b, out, inv)), self = read(osSelfHtml(b, out, inv));
    const lines = osShoppingLines(out.lines);
    return {firm, self, lines, unchanged: before === JSON.stringify(out), stores, afterStores: osStores(out),
      unmerged: osShoppingLines([[chair, 1, 'req', 'hairdresserchair'], [speaker, 2, 'cap', 'capacity']]),
      mount: (() => { const host = document.createElement('div');
        host.innerHTML = osShoppingTags(osShoppingLines([['test:desk', 1, 'req', 'mount'], ['test:desk', 3, 'cap', 'mount']])[0]);
        return [...host.querySelectorAll('.os-tag')].map(x => x.textContent); })()};
  });
  assert.equal(result.unchanged, true);
  assert.deepEqual(result.afterStores, result.stores);
  assert.deepEqual(result.stores.map(s => s.lines), [[0, 1, 2, 3, 5], [4]]);
  assert.equal(result.lines.reduce((n, l) => n + l[1], 0), 8);
  assert.equal(result.lines.reduce((n, l) => n + l[1] * ({'test:hairdresserchair': 500, 'test:register': 200, 'test:speaker': 100}[l[0]]), 0), 3000);
  assert.deepEqual(result.unmerged.map(l => l[2]), ['req', 'cap']);
  assert.deepEqual(result.mount, [en('gr.os.why.mount'), en('gr.os.why.req')], 'a merged mount keeps a Required tag');
  for(const mode of ['firm', 'self']){
    const rows = result[mode].filter(r => !r.tags.includes(en('gr.os.why.interior')));
    assert.equal(rows.length, 4, mode);
    const chair = rows.find(r => r.tags.includes(en('gr.os.why.cap')) && r.tags.includes(en('gr.os.why.req')));
    const till = rows.find(r => r.tags.includes(en('gr.os.why.pos')));
    assert.ok(chair, mode + ' retains the opening requirement');
    assert.deepEqual(till.tags, [en('gr.os.why.cap'), en('gr.os.why.pos')]);
    assert.equal(money(chair.cells.at(-1)), 2000);
    assert.equal(money(till.cells.at(-1)), 400);
    if(mode === 'firm'){
      assert.equal(chair.cells[2], '4'); assert.equal(till.cells[2], '2');
    }else{
      assert.match(chair.cells[0], /^4 × /); assert.match(till.cells[0], /^2 × /);
    }
    assert.equal(rows.filter(r => r.tags.includes(en('gr.os.why.security'))).length, 1, 'optional row stays separate');
  }
});
