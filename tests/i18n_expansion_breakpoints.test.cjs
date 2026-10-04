// Sample planner breakpoints and stress long content; retain focused overflow regressions.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {expansionTests} = require('./_i18n_expansion.cjs');
const {site, expansionStress, expansionSeed, expansionWidth} = expansionTests(['en', 'pseudo']);

test('the containing-box check catches each long-name overflow whatever the font', async t => {
  const {page, errors} = await site(t, {width: 790, payload: expansionStress()});
  await expansionSeed(page);
  // Put back one unguarded rule at a time on the rendered page, then run
  // the same detector used by every language and width. The four-repeat saved token is
  // far wider than these cells, so a platform's font margin cannot hide it.
  const cases = [
    ['named imports action', 'factory', 'running', 630,
      '.os-btn,.os-cta{max-width:none;height:34px;min-height:0;white-space:nowrap;overflow-wrap:normal}.os-cta{height:40px}.os-cta.sm{height:34px}.ff-why>div{grid-template-columns:14px 18px minmax(0,1fr) auto}.ff-why>div>span{min-width:auto;max-width:none}'],
    ['Your plans address', 'open', 'what', 790, '.os-plango{min-width:auto;overflow-wrap:normal}'],
    ['in-game instructions', 'factory', 'until', 790, '.os-ingame{min-width:auto;overflow-wrap:normal}.os-ingame>span{min-width:auto}'],
    ['checklist detail', 'factory', 'until', 790, '.os-ck .tx small{overflow-wrap:normal}'],
    ['map legend address', 'factory', 'investment', 790, '.os-maplist span{min-width:auto;overflow-wrap:normal}'],
    // Wide letter-spacing stands in for the wider Linux font that showed this in CI.
    ['strip label', 'open', 'breakeven', 360, '.os-lab{letter-spacing:.9em}.os-pb .os-lab{min-width:auto;overflow-wrap:normal}'],
  ];
  for(const [name, planner, step, width, old] of cases){
    await page.setViewportSize({width, height: 900});
    await page.evaluate(([planner, step]) => {
      openRoute(`expansion/${planner}`);
      if(planner === 'factory') ofGo(step);
      else { osStep = step; drawOpenStore(); }
    }, [planner, step]);
    if(step === 'investment') await page.locator('[data-of-mode="self"]').click();
    const passing = [];
    await expansionWidth(page, name, passing);
    assert.deepEqual(passing, [], `${name}: current rules fit`);
    const rollback = await page.addStyleTag({content: old});
    const failing = [];
    await expansionWidth(page, name, failing);
    await rollback.evaluate(el => el.remove());
    assert.ok(failing.some(f => f.includes('outside containing box')), `${name}: restored rules must fail local-box checks`);
    t.diagnostic(`${name}: restored rules detected; ${failing[0].slice(0, 220)}`);
  }
  assert.deepEqual(errors, []);
});
