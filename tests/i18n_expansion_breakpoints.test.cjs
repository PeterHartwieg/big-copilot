// English and expanded pseudo text cover every planner breakpoint.
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

test('factory desktop pickers share a row and phone CTAs keep their sizes', async t => {
  const payload = expansionStress();
  // Keep the populated planning fixture, with ordinary saved addresses.
  for(const b of [...payload.businesses, ...payload.premises.buildings]){
    if(b.address?.startsWith('123 International')) b.address = b.key === 'mobile-factory' ? '12 Factory Road' : '10 Retail Road';
  }
  // The names fixture has no demand readings; add one synthetic cell to
  // exercise the actual Growth popover button.
  const shop = payload.premises.buildings.find(b => b.type === 'retail');
  const business = payload.businesses.find(b => b.key === shop.key);
  payload.premises.demand[shop.hood] = [{slug: business.typeSlug, type: business.type, category: 'retail', demand: 60, rivals: 1}];
  payload.market.hoods = [shop.hood];
  payload.market.types = [{slug: business.typeSlug, type: business.type, products: 1, mine: true,
    cells: [{hood: shop.hood, demand: 60, providers: 1, count: 1, here: true}]}];
  const {page, errors} = await site(t, {width: 1280, payload});
  await expansionSeed(page);
  await page.evaluate(() => openRoute('expansion/factory'));
  const placement = await page.evaluate(() => {
    const shops = document.querySelector('#viewCtl #planPicker').getBoundingClientRect();
    const target = document.querySelector('#viewCtl .ff-for').getBoundingClientRect();
    return {shops: shops.toJSON(), target: target.toJSON()};
  });
  assert.ok(placement.target.left >= placement.shops.right, 'For stays to the right of Shops at 1280px');
  assert.ok(Math.abs(placement.target.y + placement.target.height / 2 - placement.shops.y - placement.shops.height / 2) <= 1,
    'For and Shops stay on the same row at 1280px');
  await page.setViewportSize({width: 360, height: 900});
  await page.locator('#ofCtl [data-of-step="what"]').click();
  assert.equal(await page.locator('#ofBody .ff-next .os-cta').evaluate(el => el.getBoundingClientRect().height), 40);
  await page.locator('#ofCtl [data-of-step="investment"]').click();
  await page.locator('[data-of-mode="self"]').click();
  const emptyRows = await page.locator('#ofBody .os-store td.w:empty').evaluateAll(cells => cells.map(cell => {
    const row = cell.parentElement, style = getComputedStyle(row);
    // The price spans both rows: its stretched box includes an unwanted
    // gap. Compare the item box and the price's single text line instead.
    const content = Math.max(row.querySelector('td.l').getBoundingClientRect().height,
      parseFloat(getComputedStyle(row.lastElementChild).lineHeight));
    return {height: row.getBoundingClientRect().height, expected: content + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth)};
  }));
  assert.ok(emptyRows.length, 'supplier cards include rows without an explanation');
  assert.ok(emptyRows.every(row => Math.abs(row.height - row.expected) <= 1), 'empty explanations add no row gap');
  await page.evaluate(() => {
    openRoute('expansion/demand');
    const cell = [...document.querySelectorAll('#secMarket .cell[data-slug]')].find(el => osType(el.dataset.slug));
    if(!cell) throw new Error('the fixture needs a plannable Demand cell');
    demCellPop(cell);
  });
  assert.equal(await page.locator('#demCellPop .os-cta').evaluate(el => el.getBoundingClientRect().height), 40);
  assert.equal(await page.locator('#demCellPop .os-btn').evaluate(el => el.getBoundingClientRect().height), 34);
  assert.deepEqual(errors, []);
});

