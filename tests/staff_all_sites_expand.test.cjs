'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_page.cjs');
const {en, textRe} = require('./_i18n.cjs');
const browser = H.suiteBrowser();
const CS = 'ba:skill_customerservice';

// Synthetic only: ordinary scheduled people are absent from hiring.people,
// which names only spare/unassigned employees. Current and planned weeks use
// the same indexed people/stations tables as extract() on an actual save.
function company(mods) {
  const d = structuredClone(require('./fixtures/payload_snapshot/link.json'));
  const base = d.businesses[0];
  d.mods = mods;
  d.names[CS] = 'Customer Service';
  d.businesses = [0, 1, 2].map(i => ({...base,
    key: `ba:street_secondavenue#${10 + i}`, name: `Test site ${i + 1}`, shiftPrint: '01234567'}));
  d.staffing = d.businesses.map((b, i) => ({key: b.key, name: b.name,
    stations: [{id: `register-${i}`, skill: CS}],
    roles: [{skill: CS, label: 'Customer Service', stations: [0]}],
    people: [0, 1, 2].map(p => ({id: `employee-${i}-${p}`, name: `Person ${i + 1} ${p + 1}`})),
    shifts: [1, 2, 3].map(day => ({d: day, s: 0, f: 0, t: 6, p: 0}))
      .concat([1, 2, 3].map(day => ({d: day, s: 0, f: 6, t: 18, p: 1})))
      .concat([{d: 4, s: 0, f: 8, t: 16, p: 2}]),
    current: {list: [1, 2].map(day => ({d: day, s: 0, f: 0, t: 12, p: 0}))
      .concat([3, 4, 5].map(day => ({d: day, s: 0, f: 0, t: 12, p: 1})))
      .concat([{d: 6, s: 0, f: 0, t: 2, p: 1}, {d: 0, s: 0, f: 8, t: 16, p: 2}])}}));
  d.hiring = {...d.hiring, people: {}, bench: [], sites: d.businesses.map(b => ({
    key: b.key, name: b.name, kind: 'shop', planned: true, accepts: [CS],
    plans: {demand: {spare: [], bench: [], hireWeeks: []}}}))};
  // A person whose metadata is also present in another plan's spare pool.
  d.hiring.people['employee-0-2'] = {name: 'Person 1 3', site: d.businesses[0].key,
    skills: [{skill: CS, level: 87}], wage: 23.5};
  d.factoryStaffing = {}; d.officeStaffing = []; d.candidates = [];
  return d;
}

for (const [label, mods, old] of [['vanilla', {}], ['EE detected', {economyExpansion: {settled: 34}}],
  ['other mods, EE absent', {retailExpansion: {renovated: 1}}], ['older link, separate weeks', {}, true]]) {
  test(`Staff all sites expands existing staff and the sent week (${label})`, async t => {
    const html = H.boardHtml().replace('<script>', `<script>
      window.LEDGER_SOURCE = {label: 'Live', data: async () => null, watch() {},
        link: () => ({writes: ['hire', 'schedule'], features: ${JSON.stringify(old ? [] : ['hire.reschedule'])}, day: 34}),
        write: async (kind, body, opts) => ({body: {ok: true, kind, dryRun: opts.dryRun,
          sites: body.sites, hired: [], moved: [], skipped: [], rows: []}})};
    </script><script>`);
    const {page} = await H.openPage(t, await browser(), {html});
    await H.loadPayload(page, company(mods));
    await page.evaluate(() => { bindHireReview(); hrReview(); });
    const dlg = page.locator('dialog.gw-dlg');
    await page.waitForFunction(() => gwOpen?.dataset.phase === 'ready');
    assert.equal(await dlg.locator('.hr-dsite').count(), 3);
    for (let i = 0; i < 3; i++) {
      const site = dlg.locator('.hr-dsite').nth(i);
      assert.match(await site.locator('.c').first().textContent(), new RegExp(en('co.hire.c.week')));
      assert.match(await site.locator('.cst').textContent(), /\+\$0/);
      await site.locator('[data-hr-site]').click();
      const rows = site.locator('.hr-dp:not(.hd)');
      assert.equal(await rows.count(), 3, 'one detail row per planned employee, including existing staff');
      for (let p = 0; p < 3; p++) {
        const row = rows.nth(p), name = `Person ${i + 1} ${p + 1}`, hours = [18, 36, 8][p];
        assert.equal(await row.locator('.who b').textContent(), name);
        assert.equal(await row.locator('.r').textContent(), 'Customer Service');
        assert.equal(await row.locator('span.m').last().textContent(), `${hours} h`);
        assert.equal(await row.locator('span.m').nth(0).textContent(), i === 0 && p === 2 ? '87%' : '–');
        assert.equal(await row.locator('span.m').nth(1).textContent(), i === 0 && p === 2 ? '$23.5' : en('co.mod.wageNotQuoted'));
        assert.equal(await row.locator('.hr-wk i.on').count(), p === 2 ? 1 : 3);
        const slots = await page.evaluate(({i, p}) => {
          const S = hrLast.m.sites[i];
          return hrSentPeople(hrLast.req, S).find(x => x.id === `employee-${i}-${p}`).slots;
        }, {i, p});
        assert.deepEqual(slots.map(s => [s.d, s.f, s.t]), p === 2 ? [[4, 8, 16]]
          : [1, 2, 3].map(d => [d, p === 0 ? 0 : 6, p === 0 ? 6 : 18]));
        if (p < 2) assert.match(await dlg.textContent(), textRe('co.hire.fewer.one', {
          name, site: `Test site ${i + 1}`, now: [24, 38][p], h: hours}));
      }
    }
  });
}
