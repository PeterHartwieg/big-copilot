// Expansion › Open a store, step 6: after opening -- what the plan keeps, the
// payback against the plan, plans as history -- and the investment carried
// through renting and opening. Setup and helpers are tests/_open_store.cjs;
// the plan steps before it are tests/open_store.test.cjs.
const {test} = require('node:test');
const H = require('./_open_store.cjs');
const {assert, en, enRe, textRe, path, ROOT, LIQ, MID, SITE, board, strip, money, planned, running, rows, until, line, opened, linked, FULL, OPENED, traded, openedPlan, tiles, pvsa, pvRow, goOpen} = H;

test('opened headquarters compares its investment and keeps running costs without payback or sales claims', async t => {
  const page = await board(t, {hq: true});
  await H.plannedHq(page);
  await opened(page, {key: H.HQ_SITE, typeSlug: H.HQ, type: 'Headquarters', status: 'hq', opened: OPENED,
    hasTraded: false, revenue: 0, staff: 2});
  await page.evaluate(key => {
    const snap = osPlan().snap;
    D.payback.sites[key] = {costCentre: true, cost: {...snap.inv, materials: snap.inv.decor}, profit: -5000};
    drawOpenStore();
  }, H.HQ_SITE);
  await goOpen(page);
  const text = await page.locator('#osBody').innerText();
  assert.match(text, /Running cost[\s\S]*\$700\/week in rent/i);
  assert.match(text, /Plan and now[\s\S]*Furniture[\s\S]*Deposit/);
  assert.doesNotMatch(text, /Profit a day|Paid back|No day with sales|no payback for|Days to break even/);
  assert.equal(await page.locator('#osBody svg.os-chart, #osBody .os-roi').count(), 0);
  assert.equal(await page.locator('#osBody [data-os-results]').count(), 0);
  await page.locator('#osCtl [data-os-plan]').selectOption('');
  assert.match(await page.locator('#osBody .os-plan').innerText(), /Headquarters[\s\S]*Open/);
  assert.doesNotMatch(await page.locator('#osBody .os-plan').innerText(), /paid back/);
});

for(const mode of ['self', 'firm']) test(`an untouched default loan for an existing lease survives reload and opening (${mode})`, async t => {
  const page = await board(t);
  await page.evaluate(key => { const b = osBuilding(key); b.status = 'mine'; b.occupant = null; }, SITE);
  await planned(page);
  await page.locator(`[data-os-mode="${mode}"]`).click();
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  await page.locator('#osFin [data-os-fin-on]').check();
  const displayed = +(await page.locator('[data-os-fin-amount]').inputValue());
  assert.ok(displayed > 0);
  await page.evaluate(() => { osPlansFor = null; osLoad(); drawOpenStore(); });
  assert.equal(+(await page.locator('[data-os-fin-amount]').inputValue()), displayed);
  await opened(page, {opened: OPENED}, FULL);
  await traded(page, {daily: [500], state: 'togo', extra: {days: 30}});
  await goOpen(page);
  const recorded = await page.locator('.os-roiloan .os-finfacts > div').first().locator('b').innerText();
  assert.equal(money(recorded), displayed, 'after-opening loan matches the untouched field');
  await page.evaluate(() => { delete osPlan().snap; drawOpenStore(); });
  const legacy = await page.locator('.os-roiloan .os-finfacts > div').first().locator('b').innerText();
  assert.equal(money(legacy), displayed, 'the legacy investment-only fallback uses remaining cash too');
});

for(const alreadyHeld of [false, true]) test(`historical investment retains the deposit through renting, reload and opening (${alreadyHeld ? 'existing lease' : 'new lease'})`, async t => {
  const page = await board(t);
  const expected = await page.evaluate(({key, type, held}) => {
    const b = osBuilding(key), estimate = osEstimate({type}, b);
    if(held){ b.status = 'mine'; b.occupant = null; }
    return {deposit: estimate.inv.deposit, firm: estimate.inv.firm, days: estimate.days};
  }, {key: SITE, type: LIQ, held: alreadyHeld});
  await planned(page);
  const result = await page.evaluate(() => {
    const p = osPlan(), b = osBuilding(p.key);
    b.status = 'mine'; b.occupant = null;
    osSnapTake(p); osSave();
    osPlansFor = null; osLoad();
    return {snap: osPlan().snap, remaining: osInvestment(osPlan(), b)};
  });
  assert.equal(result.remaining.deposit, 0, 'no second deposit to fund');
  assert.equal(result.snap.inv.deposit, expected.deposit, 'historical investment includes the deposit');
  assert.equal(result.snap.inv.firm, Math.round(expected.firm));
  assert.deepEqual(result.snap.days, expected.days, 'historical payback uses the same total investment');
  await opened(page, {opened: OPENED}, FULL);
  await traded(page, {daily: [500], state: 'togo', extra: {days: 30}});
  await goOpen(page);
  const deposit = await pvRow(page, en('gr.os.inv.deposit'));
  assert.equal(deposit[1], deposit[2]);
  assert.equal(deposit[3], '–', 'the prior deposit is not an overrun');
  assert.match(await page.locator('#osBody').innerText(), /including deposits paid before this plan/);
});

test('once the planned store stands at the address the plan keeps what it said and its opening day, and the Open step unlocks', async t => {
  const page = await board(t);
  await planned(page);
  const snap = await page.evaluate(() => JSON.stringify(osPlan().snap));
  const est = await page.evaluate(() => { const p = osPlan(), e = osEstimate(p, osBuilding(p.key)); return {firm: e.inv.firm, profit: Math.round(e.profit), day0: Math.round(e.day(0))}; });
  assert.deepEqual(JSON.parse(snap).inv.firm, Math.round(est.firm));
  assert.equal(JSON.parse(snap).profit, est.profit);
  assert.equal(JSON.parse(snap).curve[0], est.day0, 'the opening day is ramped as the plan drew it');
  assert.equal(await page.locator('#osCtl [data-os-step="open"]').isDisabled(), true);
  await opened(page, {opened: OPENED}, FULL);
  assert.equal(await page.evaluate(() => osPlan().opened), OPENED, 'the store the plan attached to');
  // A rival that lowers the price the plan was made at no longer moves it.
  await page.evaluate(() => { Object.values(osFacts().market).forEach(m => { if(m.p) m.p *= 0.5; }); osBest = new Map(); drawOpenStore(); });
  assert.equal(await page.evaluate(() => JSON.stringify(osPlan().snap)), snap, 'frozen once the store opened');
  assert.equal(await page.locator('#osCtl [data-os-step="open"]').isDisabled(), false);
  assert.equal(await page.locator('#osCtl [data-os-step="open"]').getAttribute('data-tip'), null);
  // Until opening hands over to the payback.
  await page.locator('#osCtl [data-os-step="opening"]').click();
  await page.locator('#osBody .os-links [data-os-step="open"]').click();
  await page.waitForFunction(() => osStep === 'open');
  // Step 6's strip says what and where only; the tiles carry the numbers.
  assert.deepEqual((await strip(page)).map(c => c.split(' ')[0]), [en('gr.os.strip.open'), en('gr.os.strip.whereLab')].map(s => s.toUpperCase().split(' ')[0]));
  const kept = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem(osStore())).plans[0]; return {snap: osSnapClean(p.snap), opened: p.opened}; });
  assert.deepEqual(kept, {snap: JSON.parse(snap), opened: OPENED});
});

test("premises rented and set up before the plan picked them keep their figures; a new pick drops the last place's", async t => {
  const page = await board(t);
  await planned(page);
  /* One of your own shops turned into a liquor store that has never sold: a
     lease signed and the place set up before the plan picked it. */
  const moved = await page.evaluate(site => {
    const p = osPlan();
    const b = premises().buildings.find(x => x.key !== site && x.type === 'retail' && x.status === 'mine' && osOutfit(p, x));
    Object.assign(D.businesses.find(x => x.key === b.key), {typeSlug: p.type, status: 'retail', hasTraded: false, revenue: 0, opened: 46, lines: []});
    delete (D.payback.sites || {})[b.key];
    const before = JSON.stringify(p.snap);
    osPick(b.key);
    return {key: b.key, before, after: JSON.stringify(p.snap), want: JSON.stringify(osSnapOf(p, b)), opened: p.opened, step: osStep,
      store: JSON.parse(JSON.stringify(D.businesses.find(x => x.key === b.key)))};
  }, SITE);
  assert.ok(moved.key);
  assert.notEqual(moved.after, 'null', 'its figures are kept at the pick');
  assert.equal(moved.after, moved.want, "and they are this place's, not the last one's");
  assert.equal(moved.opened, 46, 'the plan follows the store that stands there');
  assert.equal(moved.step, 'investment');
  // Back to the empty shop: nothing of the unsold store is kept.
  const back = await page.evaluate(site => { const p = osPlan(); osPick(site);
    return {opened: p.opened, snap: JSON.stringify(p.snap), want: JSON.stringify(osSnapOf(p, osBuilding(site)))}; }, SITE);
  assert.equal(back.opened, null);
  assert.equal(back.snap, back.want);
  // A plan whose store has sold is its record: another pick is a new plan of
  // the type there, and the record stays where it was.
  const kept = await page.evaluate(({key, site}) => { const p = osPlan(); osPick(key);
    // It sold, then closed: the plan remembers the sale with no store or payback row left.
    Object.assign(D.businesses.find(x => x.key === key), {hasTraded: true, revenue: 500}); drawOpenStore();
    D.businesses = D.businesses.filter(x => x.key !== key); delete (D.payback.sites || {})[key];
    const before = JSON.stringify([p.key, p.snap, p.opened]), n = osPlans.length;
    osPick(site);
    return {before, after: JSON.stringify([p.key, p.snap, p.opened]), added: osPlans.length - n, now: osPlan().key, fresh: osPlan() !== p, type: osPlan().type === p.type};
  }, {key: moved.key, site: SITE});
  assert.equal(kept.after, kept.before);
  assert.deepEqual([kept.added, kept.now, kept.fresh, kept.type], [1, SITE, true, true]);
  // One that closed before it ever sold has no record: it starts over at the new place.
  const restart = await page.evaluate(({key, site, store}) => { D.businesses.push(store); osPick(key); const p = osPlan();
    const attached = p.opened;
    D.businesses = D.businesses.filter(x => x.key !== key);
    osPick(site); return {attached, same: osPlan() === p, key: p.key, opened: p.opened}; }, {key: moved.key, site: SITE, store: moved.store});
  assert.equal(restart.attached, 46);
  delete restart.attached;
  assert.deepEqual(restart, {same: true, key: SITE, opened: null});
});

test('plans kept before the sold mark: one whose store opened is a record, one that never opened is not', async t => {
  const page = await board(t);
  const got = await page.evaluate(({site, liq}) => {
    const plan = (id, opened) => ({id, type: liq, hood: null, key: 'ba:street_closed#1', mode: null, finance: {on: false, amount: null, bank: null},
      step: 'investment', made: 10, snap: null, opened, paid: false});
    localStorage.setItem(osStore(), JSON.stringify({plans: [plan('old', 20), plan('new', null)]}));
    osPlansFor = null; osLoad();
    const sold = osPlans.map(p => [p.id, p.sold]);
    // The opened one: another place is a new plan, the record stays as it was.
    osCur = 'old'; osPick(site);
    const old = osPlans.find(p => p.id === 'old');
    const first = {current: osPlan().id !== 'old', key: old.key, opened: old.opened};
    // The one that never opened moves to the new place.
    osCur = 'new'; osPick(site);
    return {sold, first, moved: [osPlan().id, osPlan().key]};
  }, {site: SITE, liq: LIQ});
  assert.deepEqual(got.sold, [['old', true], ['new', false]]);
  assert.deepEqual(got.first, {current: true, key: 'ba:street_closed#1', opened: 20});
  assert.deepEqual(got.moved, ['new', SITE]);
});

test('just opened with no sales: invested, nothing earned, no day to go yet', async t => {
  const page = await board(t);
  await openedPlan(page, {hasTraded: false, revenue: 0});
  const {inv} = await traded(page, {state: 'unknown'});
  await goOpen(page);
  const k = await tiles(page);
  assert.match(k[0], new RegExp(enRe('gr.os.roi.invested').source + ' ' + ('$' + inv.toLocaleString('en-US')).replace(/[$]/g, '\\$&') + ' ' + enRe('gr.os.roi.asPlanned').source, 'i'));
  assert.match(k[1], new RegExp([textRe('gr.os.roi.soFar', {}).source, '-\\$400', textRe('gr.os.roi.days', {n: 1}).source, '\u00b7', textRe('gr.os.roi.since', {n: 30}).source].join(" "), 'i'));
  assert.match(k[2], new RegExp([textRe('gr.os.roi.paid', {}).source, '0%'].join(" "), 'i'));
  assert.match(k[3], new RegExp([textRe('gr.os.strip.beLab', {}).source, '\u2013', textRe('gr.os.roi.unknown', {}).source].join(" "), 'i'));
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.noSales', {}, {}));
  const r = await pvsa(page);
  assert.deepEqual(r.map(x => x[0].split(' ')[0]), ['gr.os.roi.furn', 'gr.os.inv.fee', 'gr.os.inv.deposit', 'gr.os.inv.total', 'gr.os.roi.day', 'gr.os.roi.be'].map(k => en(k).split(' ')[0]));
  assert.equal(r[4][2], '–', 'no recent profit before a sale');
  // The plan's profit and days are single figures, the range on hover.
  assert.match(r[4][1], /^\$[\d,]+$/);
  assert.match(await page.locator('#osBody .os-pvsa .os-rng').first().getAttribute('data-tip'), /^\$[\d,]+–\$[\d,]+$/);
  // The links: the site's page, the Payback column and the checklist, in one row.
  const links = await page.locator('#osBody .os-links > *').allInnerTexts();
  assert.equal(links.length, 3);
  assert.match(links[2], textRe('gr.os.roi.until', {of: 7}, {anchor: 'full'}));
  // Pins the wording: the retired checklist sentence must not come back.
  assert.equal(await page.locator('#osBody p', {hasText: 'on the checklist until opening'}).count(), 0);
});

test('trading and paying back: profit so far, the share paid back, days to go against the plan and its ramp', async t => {
  const page = await board(t);
  await openedPlan(page);
  const snap = await page.evaluate(() => osPlan().snap);
  const day = Math.round(snap.inv.firm / 40);
  const daily = Array.from({length: 16}, (_, i) => i < 2 ? Math.round(day * 0.6) : day);
  const {inv, profit, rate} = await traded(page, {daily, state: 'togo', extra: {days: 25}});
  await goOpen(page);
  const k = await tiles(page);
  assert.match(k[1], new RegExp([enRe('gr.os.roi.soFar').source, '\\$' + profit.toLocaleString('en-US'), enRe('gr.os.roi.days', {n: 17}).source, '\u00b7', enRe('gr.os.roi.since', {n: 30}).source].join(' '), 'i'));
  assert.match(k[2], new RegExp(enRe('gr.os.roi.paid').source + ' ' + Math.floor(profit / inv * 100) + '%', 'i'));
  assert.match(k[3], new RegExp([textRe('gr.os.strip.beLab', {}).source, '25', textRe('gr.os.roi.togo', {n: 25}).source, textRe('gr.os.roi.about', {n: 71}).source].join(" "), 'i'));
  assert.equal(await page.locator('#osBody .os-roi .os-meter').getAttribute('style'), `--w:${(profit / inv * 100).toFixed(1)}%`);
  // The chart: the running total, a bar a day, the investment, the plan's line and the way on,
  // its points in days after opening as the axis says (the calendar day is the tile's).
  const chart = page.locator('#osBody svg.os-chart');
  assert.equal(await chart.locator('.os-dbar').count(), 17);
  assert.equal(await chart.locator('polyline.plan').count(), 1);
  assert.equal(await chart.locator('line.fc').count(), 1);
  // Day 46 is 16 days after opening; 25 days to go lands 41 days after it, as the tile's day 71.
  assert.match(await chart.textContent(), textRe('gr.os.roi.chart.today', {after: en('gr.os.roi.chart.after', {n: 16})}, {}));
  assert.match(await chart.textContent(), textRe('gr.os.roi.chart.after', {n: 41}, {}));
  assert.doesNotMatch(await chart.textContent(), textRe('gr.os.be.day', {n: 71}, {}));
  const mid = Math.round(snap.profit * (0.8 + 1.05) / 2);
  const ramp = Math.round(snap.curve.slice(0, 5).reduce((a, b) => a + b, 0) * (0.8 + 1.05) / 2);
  const row = await pvRow(page, en('gr.os.roi.day'));
  assert.equal(money(row[1]), mid);
  assert.equal(row[2], '$' + Math.round(rate).toLocaleString('en-US'));
  // The first five days with sales against the plan's ramped first days.
  const first = daily.slice(0, 5).reduce((a, b) => a + b, 0);
  assert.deepEqual((await pvRow(page, en('gr.os.roi.ramp', {n: 5}))).slice(1, 3), ['$' + ramp.toLocaleString('en-US'), '$' + first.toLocaleString('en-US')]);
  // Days to break even, counted as the plan counts them: the first day with sales is day 1.
  assert.match((await pvRow(page, en('gr.os.roi.be')))[2], textRe('gr.os.roi.aboutDays', {n: 41}, {anchor: 'full'}));
});

test('a forecast past the chart\'s edge is cut at it, and the chart keeps its own days', async t => {
  const page = await board(t);
  await openedPlan(page);
  await traded(page, {daily: Array(16).fill(100), state: 'togo', extra: {days: 5000}});
  await goOpen(page);
  const fc = page.locator('#osBody svg.os-chart line.fc');
  assert.equal(await fc.count(), 1);
  const x2 = +(await fc.getAttribute('x2'));
  assert.ok(x2 <= 900 - 18 + 0.5, `the forecast stops at the chart's right edge (${x2})`);
  assert.equal(await page.locator('#osBody svg.os-chart circle.hit').count(), 0, 'no break-even point off the chart');
  assert.match((await tiles(page))[3], new RegExp(['5,000', textRe('gr.os.roi.togo', {n: 5000}).source].join(" "), 'i'));
});

test('paid back: the day it broke even, the plan beside it, and the way to the site page and the Payback column', async t => {
  const page = await board(t);
  await openedPlan(page);
  const snap = await page.evaluate(() => osPlan().snap);
  const day = Math.ceil(snap.inv.firm / 8);
  await traded(page, {daily: Array(16).fill(day), state: 'reached', extra: {day: 39, after: 9}});
  await goOpen(page);
  const k = await tiles(page);
  assert.match(k[2], new RegExp([textRe('gr.os.roi.paid', {}).source, '100%'].join(" "), 'i'));
  assert.match(k[3], new RegExp([textRe('gr.os.strip.beLab', {}).source, textRe('gr.os.be.day', {n: 39}).source, textRe('gr.os.roi.after', {n: 9}).source].join(" "), 'i'));
  assert.match(await page.locator('#osBody svg.os-chart').textContent(), new RegExp('(?:^|\\D)' + textRe('gr.os.roi.chart.after', {n: 9}).source), 'the chart\'s point says what the tile says');
  const done = page.locator('#osBody .os-done');
  assert.match(await done.innerText(), new RegExp([textRe('co.payback.reached', {day: 39, n: 9}).source, textRe('gr.os.roi.done.plan', {}).source].join("[\\s\\S]*"), 'i'));
  assert.equal(await page.locator('#osBody .os-links').count(), 0, 'the done strip carries the links');
  assert.match((await pvRow(page, en('gr.os.roi.be')))[2], textRe('gr.os.roi.days', {n: 9}, {anchor: 'full'}));
  assert.equal(await page.evaluate(() => osPlan().paid), true);
  // Listed as open and paid back.
  await page.locator('#osCtl select[data-os-plan]').selectOption('');
  assert.match(await page.locator('#osBody .os-plan').innerText(), new RegExp('Liquor Store\\s*' + enRe('gr.os.plans.open').source + '[\\s\\S]*' + enRe('gr.os.stage.paid').source, 'i'));
  assert.match(await page.locator('#osCtl select[data-os-plan] option').nth(1).textContent(), enRe('gr.os.plan.nameOpen', {type: 'Liquor Store', address: '9 Broadway Street'}));
  await page.locator('#osBody [data-os-open]').click();
  await page.waitForFunction(() => osStep === 'open');
  await page.locator('#osBody .os-done [data-os-results]').click();
  await page.waitForFunction(() => page === 'company' && view === 'pnl');
  assert.equal(await page.locator('#secPortfolio').isVisible(), true);
  await page.evaluate(() => openRoute('expansion/open'));
  await page.locator('#osBody .os-done [data-os-site]').click();
  await page.waitForFunction(site => siteOpen && siteKey === site, SITE);
});

test('the figures follow the install mode Results and the site page use; the plan keeps its own, labelled', async t => {
  const page = await board(t);
  await openedPlan(page);
  const snap = await page.evaluate(() => osPlan().snap);
  // Paid back on self-installation, days to go on the firm's price.
  await page.evaluate(({site, snap}) => { D.payback.sites[site] = {costCentre: false, cost: {furniture: snap.inv.furniture, materials: 0, fee: snap.inv.fee, deposit: snap.inv.deposit,
    firm: snap.inv.firm, self: snap.inv.furniture + snap.inv.deposit}, exact: true, opened: 30, since: 30, profit: snap.inv.firm / 2, rate: 1000,
    days: [[30, snap.inv.firm / 2, 10]], before: 0, firm: {state: 'togo', days: 300}, self: {state: 'reached', day: 30, after: 0}}; }, {site: SITE, snap});
  await page.evaluate(() => { osPlan().mode = 'firm'; paybackSetMode('self'); drawOpenStore(); });
  await goOpen(page);
  const k = await tiles(page);
  assert.match(k[0], new RegExp(enRe('gr.os.roi.invested').source + ' ' + ('$' + Math.round(snap.inv.furniture + snap.inv.deposit).toLocaleString('en-US')).replace(/[$]/g, '\\$&') + ' ' + enRe('gr.os.inv.self').source, 'i'));
  assert.match(k[3], new RegExp([textRe('gr.os.strip.beLab', {}).source, textRe('gr.os.be.day', {n: 30}).source].join(" "), 'i'));
  const head = await page.$$eval('#osBody .os-pvsa thead th', ths => ths.map(th => th.innerText.trim()));
  assert.match(head[1], textRe('gr.os.roi.col.planMode', {mode: en('gr.os.inv.firm')}, {flags: 'i'}));
  assert.match(head[2], textRe('gr.os.roi.col.nowMode', {mode: en('gr.os.inv.self')}, {flags: 'i'}));
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.modes', {plan: en('gr.os.inv.firm'), now: en('gr.os.inv.self')}, {}));
  assert.equal((await pvRow(page, en('gr.os.inv.total')))[3], '', 'no difference across two modes');
  // The site's page says the same.
  await page.locator('#osBody .os-done [data-os-site]').click();
  await page.waitForFunction(site => siteOpen && siteKey === site, SITE);
  await page.locator('.sp-pay').first().waitFor();
  assert.match(await page.locator('.sp-pay').first().innerText(), new RegExp([textRe('sp.payback.line', {what: en('co.payback.reached', {day: 30, n: 0})}).source].join(" "), 'i'));
});

test('past the record\'s reach: profit is the record\'s, the share unknown, unless break even was reached', async t => {
  const page = await board(t);
  await openedPlan(page);
  await traded(page, {daily: Array(16).fill(1000), state: 'window', row: {exact: false, days: undefined, before: undefined, since: 40}});
  await page.evaluate(site => { const r = D.payback.sites[site]; delete r.days; delete r.before; drawOpenStore(); }, SITE);
  await goOpen(page);
  let k = await tiles(page);
  assert.match(k[1], new RegExp([textRe('gr.os.roi.record', {}).source, textRe('gr.os.roi.record.sub', {n: 40}).source].join(" .* "), 'i'));
  assert.match(k[2], new RegExp([textRe('gr.os.roi.paid', {}).source, '\u2013', textRe('gr.os.roi.paid.unknown', {}).source].join(" "), 'i'));
  assert.equal(await page.locator('#osBody svg.os-chart').count(), 0);
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.old', {}, {}));
  // Seen from its opening once, but the days between are lost.
  await page.evaluate(site => { D.payback.sites[site].rolled = true; drawOpenStore(); }, SITE);
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.rolled', {}, {}));
  assert.doesNotMatch(await page.locator('#osBody').innerText(), textRe('gr.os.roi.old', {}, {}));
  // A remembered break even: 100%, and the paid-back strip.
  await page.evaluate(site => { const r = D.payback.sites[site]; r.firm = r.self = {state: 'reached', day: 40, after: 10, kept: true}; drawOpenStore(); }, SITE);
  k = await tiles(page);
  assert.match(k[2], new RegExp([textRe('gr.os.roi.paid', {}).source, '100%'].join(" "), 'i'));
  assert.equal(await page.locator('#osBody .os-done').count(), 1);
});

test('a store that closed, or another in its place, leaves the plan as history attached to nothing', async t => {
  const page = await board(t);
  await openedPlan(page);
  await traded(page, {daily: Array(16).fill(1000), state: 'togo', extra: {days: 50}});
  await goOpen(page);
  const snap = await page.evaluate(() => JSON.stringify(osPlan().snap));
  // Closed: nothing at the address.
  await page.evaluate(site => { D.businesses.find(b => b.key === site).status = 'vacant'; drawOpenStore(); }, SITE);
  assert.match(await page.locator('#osBody .os-state').innerText(), new RegExp([textRe('gr.os.roi.closed', {}).source, textRe('gr.os.roi.closedText', {type: 'liquor store', day: 30}).source].join("\\s*"), 'i'));
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.closedNow', {address: '9 Broadway Street'}, {}));
  assert.equal(await page.locator('#osBody .os-roi').count(), 0);
  assert.equal(await page.evaluate(() => JSON.stringify(osPlan().snap)), snap, 'the plan\'s figures are never taken again');
  // Another type in its place.
  await page.evaluate(site => { Object.assign(D.businesses.find(b => b.key === site), {status: 'retail', typeSlug: 'ba:businesstype_giftshop', type: 'Gift Shop', opened: 44}); drawOpenStore(); }, SITE);
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.replaced', {address: '9 Broadway Street', type: 'Gift Shop', day: 44}, {}));
  assert.equal(await page.evaluate(() => JSON.stringify(osPlan().snap)), snap);
  // The same type again, opened later: a new business, not this plan's.
  await page.evaluate(site => { Object.assign(D.businesses.find(b => b.key === site), {typeSlug: 'ba:businesstype_liquorstore', type: 'Liquor Store', opened: 45}); drawOpenStore(); }, SITE);
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.replaced', {type: 'Liquor Store', day: 45}, {}));
  assert.equal(await page.locator('#osBody .os-roi').count(), 0);
  // Listed as closed.
  await page.locator('#osCtl select[data-os-plan]').selectOption('');
  assert.match(await page.locator('#osBody .os-plan').innerText(), enRe('gr.os.stage.closed'));
  assert.match(await page.locator('#osCtl select[data-os-plan] option').nth(1).textContent(), textRe('gr.os.plan.nameClosed', {}, {anchor: 'full'}));
});

test('opened plans are history: twelve of them leave room for new plans, across a reload', async t => {
  const context = await H.browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  const page = await board(t, {context});
  await page.evaluate(() => {
    const plans = [];
    for(let i = 0; i < 12; i++) plans.push({id: `h${i}`, type: 'ba:businesstype_liquorstore', hood: null, key: `ba:street_gone#${i}`, mode: 'firm',
      finance: {on: false}, step: 'open', made: 1, opened: 5 + i, paid: i % 2 === 0});
    for(let i = 0; i < 12; i++) plans.push({id: `u${i}`, type: 'ba:businesstype_liquorstore', hood: null, key: null, mode: null,
      finance: {on: false}, step: 'where', made: 1});
    localStorage.setItem(osStore(), JSON.stringify({plans, current: null}));
  });
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  await page.evaluate(() => openRoute('expansion/open'));
  assert.equal(await page.evaluate(() => osPlans.length), 24, 'a reload keeps twelve of each');
  // A thirteenth unfinished plan pushes out the oldest unfinished one, never history.
  await page.locator('#osBody .os-type[data-os-new="ba:businesstype_giftshop"]').click();
  const ids = await page.evaluate(() => osPlans.map(p => p.id));
  assert.equal(ids.length, 24);
  assert.equal(ids.filter(id => /^h/.test(id)).length, 12);
  assert.ok(!ids.includes('u11'));
  // History past its own limit drops the oldest paid-back plan first.
  const capped = await page.evaluate(() => osCapPlans(Array.from({length: 26}, (_, i) => ({id: `x${i}`, opened: 1, paid: i === 3 || i === 20}))).map(p => p.id));
  assert.equal(capped.length, 24);
  assert.ok(!capped.includes('x20') && !capped.includes('x3'));
});

test('not paying back, with the planned loan beside what the bank is owed in all', async t => {
  const page = await board(t);
  const bankKey = await page.evaluate(() => osFacts().finance.banks.find(b => b.id === 'VantanderBankSettings').key);
  await openedPlan(page);
  await page.evaluate(() => { const p = osPlan(); p.finance = {on: true, amount: 20000, bank: 'VantanderBankSettings'}; osSave(); });
  await traded(page, {daily: Array(16).fill(-150), state: 'never'});
  await goOpen(page);
  const k = await tiles(page);
  assert.match(k[1], new RegExp([textRe('gr.os.roi.soFar', {}).source, '-\\$2,800'].join(" "), 'i'));
  assert.match(k[3], new RegExp([textRe('gr.os.strip.beLab', {}).source, textRe('gr.os.roi.never', {}).source, textRe('gr.os.roi.never.sub', {}).source].join(" "), 'i'));
  assert.match(await page.locator('#osBody .os-state').innerText(), new RegExp([textRe('gr.os.roi.notPaying', {}).source, textRe('gr.os.roi.never.note', {w: '-$150'}).source].join("\\s*"), 'i'));
  let loan = await page.locator('#osBody .os-roiloan').innerText();
  assert.match(loan, new RegExp([textRe('gr.os.roi.loan.plan', {}).source, '\\$20,000', textRe('gr.os.roi.loan.plan.sub', {r: '$83', i: '$28', n: 241}).source].join("[\\s\\S]*"), 'i'));
  assert.match(loan, new RegExp([textRe('gr.os.roi.loan.owed', {bank: 'Vantander Bank'}).source, '\u2013', textRe('gr.os.roi.loan.nothing', {}).source].join("\\s*"), 'i'));
  // Two loans at the bank: their total, said as the bank's, not this store's.
  await page.evaluate(key => { D.loans.push({bank: 'Vantander', key, total: 20000, remaining: 4000, repaid: 80, dailyPayment: 83, dailyInterest: 28},
    {bank: 'Vantander', key, total: 20000, remaining: 15000, repaid: 25, dailyPayment: 83, dailyInterest: 28}); drawOpenStore(); }, bankKey);
  loan = await page.locator('#osBody .os-roiloan').innerText();
  assert.match(loan, new RegExp([textRe('gr.os.roi.loan.owed', {bank: 'Vantander Bank'}).source, '\\$19,000', textRe('gr.os.roi.loan.owed.sub', {n: 2}).source].join("\\s*"), 'i'));
  assert.match(loan, new RegExp([textRe('gr.os.roi.loan.daily', {}).source, '\\$222', textRe('gr.os.roi.loan.daily.sub2', {r: '$166', i: '$56'}).source].join("\\s*"), 'i'));
});

test('a save from before the opening leaves the plan unopened, not closed; a closed plan\'s checklist writes nothing', async t => {
  const page = await board(t);
  await openedPlan(page);
  await traded(page, {daily: Array(16).fill(1000), state: 'togo', extra: {days: 50}});
  assert.equal(await page.evaluate(() => osPlan().opened), OPENED);
  // An older save: day 25, the store not there yet.
  await page.evaluate(site => { D.meta.day = 25; D.businesses = D.businesses.filter(b => b.key !== site); drawOpenStore(); }, SITE);
  assert.equal(await page.evaluate(() => osClosed(osPlan())), false);
  assert.equal(await page.locator('#osCtl [data-os-step="open"]').isDisabled(), true);
  assert.equal(await page.evaluate(() => osPlan().opened), OPENED, 'nothing rewritten');
  // Back to a later save where a new liquor store replaced it: Until opening says so and has no writes.
  await page.evaluate(({site, opened}) => { D.meta.day = 47; D.businesses.push(Object.assign({}, D.businesses[0], {key: site, status: 'retail', typeSlug: 'ba:businesstype_liquorstore',
    type: 'Liquor Store', opened: opened + 10, staff: 0, stationShifts: 0, campaigns: []})); drawOpenStore(); }, {site: SITE, opened: OPENED});
  await linked(page);
  await page.locator('#osCtl [data-os-step="opening"]').click();
  assert.match(await page.locator('#osBody').innerText(), enRe('gr.os.roi.closed'));
  assert.equal(await page.locator('#osBody [data-os-write]').count(), 0);
  assert.equal(await page.evaluate(() => { const b = document.createElement('button'); b.dataset.osWrite = 'marketing'; document.querySelector('#osBody').append(b); b.click();
    return document.querySelectorAll('dialog.gw-dlg[open]').length; }), 0);
});

test('a store that opened since the last visit is history before the cap counts, on a reload and from a Demand cell', async t => {
  const context = await H.browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
  t.after(() => context.close());
  const page = await board(t, {context});
  const keys = await page.evaluate(() => D.businesses.filter(b => b.status !== 'vacant' && b.typeSlug).slice(0, 12).map(b => [b.key, b.typeSlug]));
  assert.ok(keys.length >= 1);
  await page.evaluate(keys => {
    const plans = [];
    for(let i = 0; i < 12; i++){ const [key, type] = keys[i % keys.length];
      plans.push({id: `o${i}`, type, hood: null, key, mode: 'firm', finance: {on: false}, step: 'opening', made: 1}); }
    plans.push({id: 'u0', type: 'ba:businesstype_liquorstore', hood: null, key: null, mode: null, finance: {on: false}, step: 'where', made: 1});
    localStorage.setItem(osStore(), JSON.stringify({plans, current: null}));
  }, keys);
  await page.reload();
  await page.waitForFunction(() => typeof hasData === 'function' && hasData());
  await page.evaluate(() => { osPlansFor = null; osLoad(); });
  // The openings the save showed are kept in storage by the load itself.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem(osStore())).plans);
  assert.ok(stored.filter(p => /^o/.test(p.id)).every(p => Number.isFinite(p.opened)), JSON.stringify(stored.map(p => [p.id, p.opened])));
  await page.evaluate(() => osStart('ba:businesstype_giftshop', 'ba:neighborhood_midtown'));
  const ids = await page.evaluate(() => osPlans.map(p => p.id));
  assert.equal(ids.length, 14, 'twelve stores that opened are history, and a new plan still finds room');
  assert.ok(ids.includes('u0'));
});

test('step 4: the one figure the headline gives is the day the chart marks', async t => {
  const page = await board(t);
  await planned(page);
  await page.locator('#osCtl [data-os-step="breakeven"]').click();
  await page.waitForFunction(() => osStep === 'breakeven');
  const head = (await page.locator('#osBody .os-big > div').first().locator('b').innerText()).trim();
  assert.match(head, textRe('gr.os.days', {n: await page.evaluate(() => { const p = osPlan(), e = osEstimate(p, osBuilding(p.key)); return e.days[osMode(p)].mid; })}, {anchor: 'full'}));
  const labels = await page.$$eval('#osBody svg.os-chart text.lbl', ts => ts.map(t => t.textContent));
  assert.ok(labels.includes(head), `${head} among ${labels.join(' | ')}`);
  const mid = await page.evaluate(() => { const p = osPlan(), e = osEstimate(p, osBuilding(p.key)); return e.days[osMode(p)]; });
  assert.ok(mid.low <= mid.mid && mid.mid <= mid.high);
});

test('a cost centre\'s row is no payback; a plan kept before its figures were compares the investment only', async t => {
  const page = await board(t);
  await openedPlan(page);
  await traded(page, {daily: Array(16).fill(500), state: 'togo', extra: {days: 300}});
  await goOpen(page);
  await page.evaluate(() => { delete osPlan().snap; osBuilding(osPlan().key).status = 'mine'; drawOpenStore(); });
  assert.match(await page.locator('#osBody').innerText(), enRe('gr.os.roi.live2'));
  assert.deepEqual((await pvsa(page)).map(r => r[0].split(' ')[0]), ['gr.os.roi.furn', 'gr.os.inv.fee', 'gr.os.inv.deposit', 'gr.os.inv.total'].map(k => en(k).split(' ')[0]));
  const deposit = await pvRow(page, en('gr.os.inv.deposit'));
  assert.equal(deposit[1], deposit[2], 'legacy plans compare the full deposit too');
  assert.equal(deposit[3], '–');
  // A store that has a vehicle of its own since: a row of its own, no plan figure.
  await page.evaluate(site => { const c = D.payback.sites[site].cost; c.vehicles = 98000; c.firm += 98000; drawOpenStore(); }, SITE);
  const vehicles = await pvRow(page, en('gr.os.roi.vehicles'));
  assert.ok(vehicles, 'a Vehicles row');
  // Its difference is against the plan's none, so the rows' differences
  // still add up to the total's.
  assert.deepEqual(vehicles.slice(-3), ['–', '$98,000', await page.evaluate(() => osSigned(98000))]);
  await page.evaluate(site => { D.payback.sites[site] = {costCentre: true, cost: {firm: 1, self: 1}, exact: true, opened: 30, profit: -5}; drawOpenStore(); }, SITE);
  assert.match(await page.locator('#osBody').innerText(), textRe('gr.os.roi.norow', {address: '9 Broadway Street'}, {}));
});

test('a real _payback() row from a payload snapshot draws in step 6', async t => {
  const page = await board(t);
  await openedPlan(page, {opened: 3});
  const real = JSON.parse(require('node:fs').readFileSync(path.join(ROOT, 'tests/fixtures/payload_snapshot/data_day40.json'), 'utf8')).payback.sites['ba:street_broadwaystreet#19'];
  assert.ok(real.days && real.days.length, 'the snapshot carries the days');
  await page.evaluate(({site, real}) => { D.payback.sites[site] = real; osPlan().opened = null; drawOpenStore(); }, {site: SITE, real});
  await goOpen(page);
  const k = await tiles(page);
  assert.match(k[0], new RegExp(enRe('gr.os.roi.invested').source + ' ' + ('$' + Math.round(real.cost.firm).toLocaleString('en-US')).replace(/[$]/g, '\\$&'), 'i'));
  assert.match(k[1], new RegExp(enRe('gr.os.roi.soFar').source + ' \\$' + Math.round(real.profit).toLocaleString('en-US'), 'i'));
  assert.match(k[3], new RegExp(real.firm.days.toLocaleString('en-US') + ' ' + enRe('gr.os.roi.togo', {n: real.firm.days}).source));
  assert.equal(await page.locator('#osBody svg.os-chart .os-dbar').count(), Math.min(real.days.length, 9999));
});


// Adapter checks live in the real browser; calculation-only tests import the model.
test('a repeated store question resumes its plan and a full list preserves selected buildings', async t => {
  const page = await board(t);
  const result = await page.evaluate(([type, hood]) => {
    osPlans = []; osCur = null;
    const first = osNew(type, hood);
    const repeated = osNew(type, hood);
    const elsewhere = osNew(type, 'elsewhere');
    osPlans = Array.from({length: 12}, (_, i) => ({id: 'p' + i, type, hood: null,
      key: 'b' + i, finance: {}, step: 'investment'}));
    const before = JSON.stringify(osPlans);
    const full = osNew(type, hood);
    const intact = JSON.stringify(osPlans) === before;
    osPlans[5].key = null;
    const made = osNew(type, hood);
    return {first: first.id, repeated: repeated.id, elsewhere: elsewhere.id, full,
      intact, count: osPlans.length, displaced: osPlans.some(p => p.id === 'p5'), finance: made.finance};
  }, [LIQ, MID]);
  assert.equal(result.repeated, result.first);
  assert.notEqual(result.elsewhere, result.first);
  assert.equal(result.full, null);
  assert.equal(result.intact, true);
  assert.equal(result.count, 12);
  assert.equal(result.displaced, false);
  assert.equal(result.finance.amount, null);
});

test('venues retain investment and explain why profit cannot be estimated', async t => {
  const page = await board(t);
  const result = await page.evaluate(() => {
    D.openStore.types.C = {cat: 'cinema', model: null, products: [],
      layouts: {S: {lines: [], furniture: 1000, fee: 500}}};
    const b = {key: 'venue', hood: 'H', size: 'S', layout: null, deposit: 100, m2: 900, cap: 100};
    premises().buildings.push(b);
    const plan = {type: 'C', key: b.key, mode: 'firm'};
    const est = osEstimate(plan, b);
    document.querySelector('#osBody').innerHTML = osBreakHtml(plan);
    return {firm: est.inv.firm, none: est.none, text: document.querySelector('#osBody').textContent};
  });
  assert.equal(result.firm, 1600);
  assert.match(result.none, enRe('gr.os.none.venue'));
  assert.match(result.text, enRe('gr.os.none.venue'));
});

test('quick payback renders investment labels on opposite chart edges', async t => {
  const page = await board(t);
  const labels = await page.evaluate(() => {
    const m = {revenue: 12000, cogs: 2000, wages: 500, rent: 200, marketing: 300, profit: 9000};
    const est = {profit: m.profit, inv: {firm: 12000, self: 10000}, day: k => osCore().dayProfit(m, null, k)};
    document.querySelector('#osBody').innerHTML = osChart(est, 'firm');
    return ['w', 'i'].map(cls => {
      const label = document.querySelector('#osBody svg text.lbl.' + cls);
      return label && {anchor: label.getAttribute('text-anchor'), text: label.textContent};
    });
  });
  assert.ok(labels.every(Boolean), 'both investment labels rendered');
  assert.notEqual(labels[0].anchor === 'end', labels[1].anchor === 'end');
});

test('an estimate reuses its calculation API for repeated simulated days', async t => {
  const page = await board(t);
  await planned(page);
  const result = await page.evaluate(() => {
    const originalCreate = OpenStoreModel.create;
    let creates = 0;
    OpenStoreModel.create = inputs => { creates++; return originalCreate(inputs); };
    try {
      const plan = osPlan(), building = osBuilding(plan.key);
      const warm = osEstimate(plan, building), reused = osEstimate({...plan}, {...building});
      const warmCreates = creates;
      D.openStore = {...D.openStore}; // a replacement payload must rebuild its model and estimate
      const estimate = osEstimate(plan, building), before = creates;
      const values = Array.from({length: 20000}, (_, k) => estimate.day(k));
      return {warmCreates, reused: warm === reused, replaced: warm !== estimate,
        before, after: creates, finite: values.every(Number.isFinite)};
    } finally { OpenStoreModel.create = originalCreate; }
  });
  assert.equal(result.warmCreates, 0);
  assert.equal(result.reused, true);
  assert.equal(result.replaced, true);
  assert.equal(result.before, 1);
  assert.equal(result.after, result.before);
  assert.equal(result.finite, true);
});
