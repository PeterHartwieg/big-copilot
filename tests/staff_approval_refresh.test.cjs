const {test} = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_page.cjs');
const {en} = require('./_i18n.cjs');
const browser = H.suiteBrowser();

async function waiting(t, oneClick = false, clock = false) {
  const html = H.renderBoard('tests/fixtures/payload_snapshot/link.json').replace('<script>', `<script>
    window.calls = [];
    window.LEDGER_SOURCE = {label: 'Live', data: async () => null, watch() {},
      section: () => new Promise(() => {}),
      write(kind, body, opts) {
        calls.push({kind, body, dryRun: opts.dryRun});
        if (calls.length > 1) return Promise.resolve({body: {ok: true}});
        return new Promise(resolve => {
          const cancel = () => { window.cancelled = true; resolve({error: 'cancelled'}); };
          opts.approval('waiting', {since: Date.now(), cancel});
          window.answer = error => {
            opts.approval(error ? 'end' : 'approved', {});
            resolve(error ? {error} : {body: {ok: true}});
          };
        });
      }};
  </script><script>`);
  const {page} = await H.openPage(t, await browser(), {html});
  if (clock) {
    await page.clock.install({time: new Date('2026-10-28T12:00:00Z')});
    await page.clock.pauseAt(new Date('2026-10-28T12:00:01Z'));
  }
  await H.loadPayload(page, require('./fixtures/payload_snapshot/link.json'));
  await page.evaluate(oneClick => {
    window.full = JSON.parse(JSON.stringify(D));
    // The shared confirm used by both staffing and hiring. The stub controls
    // the game's answer; rendering and on-demand refresh are production code.
    gwConfirm({kind: 'hire', icon: 'roster', title: 'Staff massage salon',
      needs: ['hiring'], scope: odScope(), oneClick, body: () => ({day: D.meta.day}),
      applyLabel: () => 'Apply', verdict: () => 'Checked', draw: () => ''});
  }, oneClick);
  assert.equal(await page.locator('dialog.gw-dlg').getAttribute('data-phase'), 'approval');
  return page;
}

async function refresh(page, gen = 2) {
  await page.evaluate(gen => {
    const raw = JSON.parse(JSON.stringify(full));
    raw.meta.day += gen;
    for (const name of odChain('hiring')) for (const key of OD_SECTIONS[name].keys) delete raw[key];
    Object.defineProperty(raw, OD_GEN, {value: gen});
    takeData(raw);
    odDialog();
  }, gen);
}
async function sections(page) {
  await page.evaluate(() => {
    const sections = Object.fromEntries(odChain('hiring').map(name => [name,
      Object.fromEntries(OD_SECTIONS[name].keys.map(key => [key, full[key]]))]));
    odTake(odGen(), {sections});
  });
}

for (const arriveFirst of [false, true]) {
  test(`staffing approval survives refresh; sections arrive ${arriveFirst ? 'before' : 'after'} approval`, async t => {
    const page = await waiting(t, true);
    const dlg = page.locator('dialog.gw-dlg');
    await refresh(page);
    await refresh(page, 3);
    assert.equal(await dlg.getAttribute('data-phase'), 'approval', 'refresh must keep the Allow instructions visible');
    assert.equal(await dlg.locator('.gw-scene').count(), 1);
    if (arriveFirst) await sections(page);
    assert.equal(await dlg.getAttribute('data-phase'), 'approval');
    assert.equal(await page.evaluate(() => calls.length), 1, 'no competing write while approval is pending');
    await page.evaluate(() => answer());
    if (!arriveFirst) {
      assert.equal(await dlg.getAttribute('data-phase'), 'asking');
      assert.equal(await page.evaluate(() => calls.length), 1, 'fresh sections are required');
      await sections(page);
    }
    await page.waitForFunction(() => gwOpen.dataset.phase === 'ready');
    assert.deepEqual(await page.evaluate(() => calls.map(c => c.dryRun)), [true, true]);
    assert.equal(await page.evaluate(() => calls[1].body.day), await page.evaluate(() => D.meta.day), 'recheck uses the refreshed board');
  });
}

test('approval clock and waiting guidance survive repeated staffing refreshes', async t => {
  const page = await waiting(t, false, true);
  const dlg = page.locator('dialog.gw-dlg');
  await page.clock.runFor(1000);
  assert.equal(await dlg.locator('.gw-meta').textContent(), '0:01');
  await refresh(page);
  await page.clock.runFor(28000);
  assert.equal(await dlg.locator('.gw-meta').textContent(), '0:29');
  assert.equal(await dlg.locator('.gw-scene').count(), 1);
  await refresh(page, 3);
  await page.clock.runFor(1000);
  assert.equal(await dlg.locator('.gw-verdict b').textContent(), en('nav.dlg.say.still'));
  assert.equal(await dlg.locator('.gw-meta').textContent(), '0:30');
  await page.clock.runFor(1000);
  assert.equal(await dlg.locator('.gw-meta').textContent(), '0:31', 'clock continues after the guidance changes');
  assert.equal(await dlg.getAttribute('data-phase'), 'approval');
  assert.equal(await page.evaluate(() => calls.length), 1);
});

test('staffing approval still closes and cancels when the company changes', async t => {
  const page = await waiting(t);
  await page.evaluate(() => {
    const raw = JSON.parse(JSON.stringify(full));
    raw.meta.character = 'another-character';
    takeData(raw);
    odDialog();
  });
  await page.waitForFunction(() => window.cancelled);
  assert.equal(await page.locator('dialog.gw-dlg[open]').count(), 0);
});

test('denying approval after a refresh stays refused without starting another request', async t => {
  const page = await waiting(t);
  await refresh(page);
  await page.evaluate(() => answer('denied'));
  assert.equal(await page.locator('dialog.gw-dlg').getAttribute('data-phase'), 'failed');
  await sections(page);
  assert.equal(await page.locator('dialog.gw-dlg').getAttribute('data-phase'), 'failed');
  assert.equal(await page.evaluate(() => calls.length), 1);
});

test('Cancel remains usable while a refreshed staffing section is pending', async t => {
  const page = await waiting(t);
  await refresh(page);
  await page.locator('dialog.gw-dlg .gw-foot').getByRole('button', {name: en('nav.dlg.cancel'), exact: true}).click();
  assert.equal(await page.evaluate(() => window.cancelled), true);
  assert.equal(await page.locator('dialog.gw-dlg').getAttribute('data-phase'), 'failed');
  assert.equal(await page.evaluate(() => calls.length), 1);
});
