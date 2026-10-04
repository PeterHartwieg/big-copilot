// Register independent language groups with the same fixtures and assertions.
const {test, before} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {layoutFixture} = require('./_i18n_layout.cjs');
const WEB = path.join(__dirname, '..', 'web');

function expansionTests(languages){
  const fixture = layoutFixture();
  const {site} = fixture;
  let TABLE, PAYLOAD;
  before(async () => { ({TABLE, PAYLOAD} = await fixture.start()); });

  /* Long saved names must fit even in English; the pseudo-locale sweep only compares
     the extra space pseudo text takes. Use synthetic fixtures only. */
  function expansionStress({long = true} = {}){
    const payload = structuredClone(PAYLOAD);
    const address = long ? '123 International Manufacturing ' + 'Supercalifragilisticexpialidociousboulevard'.repeat(4) : '12 Road';
    const shop = payload.premises.buildings.find(b => b.type === 'retail');
    shop.address = address + ' Retail';
    const business = payload.businesses.find(b => b.key === shop.key);
    business.address = shop.address;
    business.opened = 12;
    // The fixture has recipes and store rules but no trading catalogue. Build
    // just this shop's main factory products from those facts, not a snapshot.
    const recipes = new Set(payload.plan.recipes.map(r => r.slug));
    const products = payload.openStore.types[business.typeSlug].products
      .filter(([slug, weight]) => weight === 1 && recipes.has(slug)).map(([slug]) => slug);
    assert.ok(products.length, 'the synthetic retail shop must have a main product with a factory recipe');
    payload.plan.catalogue = {[business.typeSlug]: {type: business.type, products, extra: []}};
    // An unowned type keeps the Shops select present alongside the For row.
    const other = Object.entries(payload.openStore.types).find(([type, facts]) =>
      type !== business.typeSlug && facts.products.some(([slug, weight]) => weight === 1 && recipes.has(slug)));
    assert.ok(other, 'the synthetic store rules must have another factory-supplied type for the Shops select');
    const [otherType, facts] = other;
    payload.plan.catalogue[otherType] = {type: payload.names[otherType], extra: [],
      products: facts.products.filter(([slug, weight]) => weight === 1 && recipes.has(slug)).map(([slug]) => slug)};
    payload.plan.own = {[business.typeSlug]: {shops: 1,
      perDay: Object.fromEntries(products.map(slug => [slug, 30]))}};
    const depot = payload.businesses.find(b => b.typeSlug === 'ba:businesstype_warehouse');
    if(long) depot.name = 'International raw materials ' + 'Supercalifragilisticexpialidociousdepot'.repeat(4);
    const recipe = payload.plan.recipes.find(r => r.slug === products[0]);
    const ingredients = recipe.ingredients.map(i => ({slug: i.slug, item: i.item || payload.names[i.slug], perWeek: 1000, arrives: 100}));
    assert.ok(ingredients.length, 'the factory recipe must consume raw material');
    payload.openFactory.sites[depot.key].imports = ingredients.map(i => [i.slug, true]);
    const factory = {...structuredClone(depot), key: 'mobile-factory', name: 'Mobile factory',
      address: address + ' Factory', type: 'Factory', typeSlug: 'ba:businesstype_factory'};
    payload.supply.factories.sites.push({s: payload.businesses.length, name: factory.name,
      lines: [{slug: products[0], item: recipe.item, machines: 2, atRoster: 100, hoursWeek: 168, fullWeek: 168, missing: []}],
      unnamed: [], needs: ingredients, machines: 2, targets: {}, arrivals: {}});
    payload.businesses.push(factory);
    payload.supply.graph.links.push({from: depot.key, to: factory.key, slugs: ingredients.map(i => i.slug)});
    const warehouse = payload.premises.buildings.find(b => b.key === depot.key);
    payload.premises.buildings.push({...structuredClone(warehouse), key: factory.key,
      address: factory.address, occupant: {name: factory.name, type: factory.type, typeSlug: factory.typeSlug}});
    return payload;
  }

  async function expansionSeed(page){
    await page.evaluate(() => {
      const shop = premises().buildings.find(b => b.type === 'retail');
      const type = D.businesses.find(b => b.key === shop.key).typeSlug;
      localStorage.setItem(osStore(), JSON.stringify({plans: [{id: 'mobile-store', type,
        key: shop.key, hood: shop.hood, step: 'what', opened: 12}], current: 'mobile-store'}));
      osPlansFor = null; osLoad();
      const factory = ofOwned().find(f => f.key === 'mobile-factory');
      if(!factory) throw new Error('the synthetic mobile-factory must be available to the planner');
      const product = ((D.plan.catalogue[type] || {}).products || [])[0];
      if(!product) throw new Error('the synthetic factory catalogue must contain a product');
      const counts = {[product]: 2};
      const plans = [
        {id: 'mobile-new', type, key: factory.key, counts, step: 'what'},
        {id: 'mobile-owned', type, site: factory.key, counts, step: 'what'}];
      localStorage.setItem(ofStore(), JSON.stringify({plans, current: 'mobile-new'}));
      ofPlansFor = null; ofLoad();
      SOURCE.link = () => ({writes: ['imports']});
      drawOpenStore(); drawPlan();
    });
  }

  async function expansionWidth(page, label, failures){
    // Measure the whole page, including controls hoisted outside the section.
    // Move off controls so a transient hover tip is not part of the view.
    await page.mouse.move(0, 0);
    await page.evaluate(async () => {
      document.querySelectorAll('section').forEach(s => s.classList.add('measured'));
      window.scrollTo(0, 0);
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const got = await page.evaluate(() => {
      // District names extend beyond the map on purpose. Hide only these
      // while measuring, so clipped finder headers and filters still fail.
      const labels = [...document.querySelectorAll('.os-finder .dlabel')];
      const displays = labels.map(el => el.style.display);
      labels.forEach(el => { el.style.display = 'none'; });
      const root = document.documentElement, width = root.clientWidth, scroll = root.scrollWidth;
      // Hidden/clip containers must not conceal content even when the whole
      // page fits. Map viewports intentionally crop geometry and labels;
      // progress/meter tracks intentionally crop their proportional fill.
      // Hoisted headings remain as visually hidden screen-reader labels.
      const deliberateClip = '#secOpen > .nx-sr, #secPlanFlow > .nx-sr, #viewCtl [data-view-ctl] .nx-sr, '
        + '.os-finder .map-canvas, .os-mini, .os-meter, .os-prog .m, .ff-meter';
      const clipped = [...document.querySelectorAll(
        '#viewCtl [data-view-ctl]:not([hidden]), #viewCtl [data-view-ctl]:not([hidden]) *, '
        + '#secOpen, #secOpen *, #secPlan, #secPlan *, #secPlanFlow, #secPlanFlow *, #osBody, #osBody *, #ofBody, #ofBody *'
      )].filter(el => {
        if(!el.getClientRects().length || !el.clientWidth || el.matches(deliberateClip)) return false;
        const style = getComputedStyle(el);
        if(style.visibility === 'hidden' || !['hidden', 'clip'].includes(style.overflowX)) return false;
        if(style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap') return false;
        return el.scrollWidth > el.clientWidth + 1;
      }).map(el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : '.' + (el.getAttribute('class') || '').split(' ').join('.')} scrollWidth=${el.scrollWidth} > clientWidth=${el.clientWidth} "${el.textContent.trim().slice(0, 70)}"`);
      // Check local content boxes even when the page itself does not scroll.
      // Exclusions: the map/finder (its filters still have the clipping check),
      // SVG geometry, proportional meters, hoisted
      // screen-reader labels, native select/input internals, intentional
      // one-line ellipsis, and descendants of horizontal scrolling tables.
      // Only elements with text of their own are measured, and only their
      // right edge: a text-less wrapper counts through page scroll and the
      // clip check.
      const planner = '#viewCtl [data-view-ctl]:not([hidden]), #viewCtl [data-view-ctl]:not([hidden]) *, '
        + '#secOpen, #secOpen *, #secPlan, #secPlan *, #secPlanFlow, #secPlanFlow *';
      const local = [];
      const box = el => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return r.right - parseFloat(s.borderRightWidth || 0) - parseFloat(s.paddingRight || 0);
      };
      const cell = el => {
        const s = getComputedStyle(el), p = el.parentElement && getComputedStyle(el.parentElement);
        return s.display !== 'contents' && (s.display !== 'inline' || /grid|flex/.test(p?.display || ''));
      };
      for(const el of document.querySelectorAll(planner)){
        if(!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
        if(el.closest(deliberateClip + ', .os-finder, svg, select, input, .feature-new')) continue;
        let excluded = false;
        for(let p = el; p && p !== document.body; p = p.parentElement){
          const s = getComputedStyle(p);
          if(s.textOverflow === 'ellipsis' && s.whiteSpace === 'nowrap') excluded = true;
          if(p !== el && ['auto', 'scroll'].includes(s.overflowX)) excluded = true;
        }
        if(excluded) continue;
        const nodes = [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
        if(!nodes.length && !['nowrap', 'pre'].includes(getComputedStyle(el).whiteSpace)) continue;
        let host = el.parentElement;
        while(host && !cell(host)) host = host.parentElement;
        if(!host) continue;
        const edges = [el.getBoundingClientRect().right - box(host)];
        const textHost = cell(el) ? el : host;
        for(const node of nodes){
          // Collapsible spaces at a wrapped line's end can hang beyond the
          // content box. Measure visible runs, including unbroken tokens.
          const range = document.createRange();
          for(const run of node.textContent.matchAll(/\S+/g)){
            range.setStart(node, run.index); range.setEnd(node, run.index + run[0].length);
            for(const r of range.getClientRects()) edges.push(r.right - box(textHost));
          }
        }
        const excess = Math.max(...edges);
        if(excess > 1) local.push(`${el.tagName.toLowerCase()}.${el.className} in .${textHost.className} +${excess.toFixed(1)}px "${el.textContent.trim().slice(0, 60)}"`);
      }
      const restoreLabels = () => labels.forEach((el, i) => { el.style.display = displays[i]; });
      if(scroll <= width + 1){ restoreLabels(); return {width, scroll, clipped, local}; }
      const right = el => {
        const edges = [el.getBoundingClientRect().right];
        if(getComputedStyle(el).overflowX !== 'visible') return edges[0];
        // A long word can extend beyond its parent's otherwise fitting box.
        for(const node of el.childNodes) if(node.nodeType === Node.TEXT_NODE){
          const range = document.createRange(); range.selectNodeContents(node);
          edges.push(range.getBoundingClientRect().right);
        }
        return Math.max(...edges);
      };
      const past = [...document.querySelectorAll('body *')].filter(el => {
        if(!el.getClientRects().length || right(el) <= width + 1) return false;
        for(let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement){
          if(getComputedStyle(parent).overflowX !== 'visible') return false;
        }
        return true;
      }).map(el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : '.' + (el.getAttribute('class') || '').split(' ').join('.')} right=${Math.round(right(el))} in .${el.parentElement.getAttribute('class') || ''} "${el.textContent.trim().slice(0, 50)}"`);
      restoreLabels();
      return {width, scroll, past, clipped, local};
    });
    if(got.local.length) failures.push(`${label}: outside containing box: ${got.local.join(', ')}`);
    if(got.clipped.length) failures.push(`${label}: clipped content: ${got.clipped.join(', ')}`);
    if(got.scroll > got.width + 1) failures.push(`${label}: scrollWidth ${got.scroll} > clientWidth ${got.width}; ${got.past.join(', ')}`);
  }

  for(const lang of languages){
    test(`Expansion fits phones with long plans and factory addresses: ${lang}`, async t => {
      const ui = lang === 'en' ? '' : lang === 'pseudo' ? 'de' : lang;
      const {page, errors, fetched} = await site(t, {ui, width: 360, payload: expansionStress(), pseudoTable: lang === 'pseudo'});
      assert.equal(await page.evaluate(() => ttLang), ui || 'en');
      if(ui){
        assert.ok(fetched.some(p => p.startsWith(`/i18n/${ui}.json?`)), 'the requested table was fetched');
        const expected = lang === 'pseudo' ? TABLE : JSON.parse(fs.readFileSync(path.join(WEB, 'i18n', `${ui}.json`), 'utf8'));
        assert.equal(await page.evaluate(() => tt('gr.os.step.what', 'What')), expected['gr.os.step.what']);
      }
      await expansionSeed(page);
      // Cover both sides of the phone breakpoint and the narrow desktop
      // checklist. Four repeats make the unbroken tokens wider than any phone
      // under either platform's fonts; local-box checks also catch overlap.
      const widths = lang === 'en' ? [360, 620, 621, 790, 1101, 1280]
        : lang === 'pseudo' ? [360, 790, 1280] : lang === 'ru' ? [360, 1101] : [360];
      for(const width of widths) await t.test(`${width}px`, async () => {
        await page.setViewportSize({width, height: 900});
        // Let the board's resize handlers reposition the sidebar and hoisted
        // controls before changing views. Both planners redraw on openRoute().
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const failures = [];
        await page.evaluate(() => openRoute('expansion/open'));
        assert.ok((await page.locator('[data-os-plan] option').last().textContent()).length > 60, 'the saved store plan has a long name');
        if(width <= 620){
          const gap = await page.locator('#osCtl .os-planpick').evaluate(label => {
            const select = label.querySelector('select').getBoundingClientRect();
            const chevron = label.querySelector('svg').getBoundingClientRect();
            return chevron.right - select.right;
          });
          assert.ok(Math.abs(gap) <= 1, `the plan select must reach its chevron (gap ${gap}px)`);
        }
        for(const step of ['what', 'where', 'investment', 'breakeven', 'opening', 'open']){
          assert.equal(await page.evaluate(step => osStepReady(step, osPlan()), step), true, `${step} is reachable`);
          await page.locator(`#osCtl [data-os-step="${step}"]`).click();
          assert.equal(await page.evaluate(() => osStep), step);
          if(step === 'what') assert.ok(await page.locator('#osBody .os-plans').isVisible(), 'Your plans is shown');
          if(step === 'where') await page.locator('#osFinderMap .map-canvas').waitFor();
          if(step === 'investment'){
            for(const mode of ['firm', 'self']){
              await page.locator(`[data-os-mode="${mode}"]`).click();
              await expansionWidth(page, `${lang} ${width}px open/${step}/${mode}`, failures);
            }
          }else await expansionWidth(page, `${lang} ${width}px open/${step}`, failures);
        }
        await page.evaluate(() => openRoute('expansion/factory'));
        assert.ok((await page.locator('[data-of-plan] option').last().textContent()).length > 60);
        for(const id of ['mobile-new', 'mobile-owned']){
          await page.locator('[data-of-plan]').selectOption(id);
          assert.equal(await page.evaluate(() => ofTarget()), id === 'mobile-new' ? 'new' : 'mobile-factory');
          for(const step of ['what', 'where', 'investment', 'until', 'running']){
            if(id === 'mobile-owned' && step === 'where') continue; // Already rented.
            assert.equal(await page.evaluate(step => ofStepReady(step), step), true, `${id}/${step} is reachable`);
            await page.locator(`#ofCtl [data-of-step="${step}"]`).click();
            assert.equal(await page.evaluate(() => ofStep), step);
            if(step === 'running'){
              const action = page.locator('#ofBody .ff-why [data-of-write="imports"]');
              assert.ok(await action.isVisible(), 'the linked raw-material depot action is rendered');
              assert.ok(await action.evaluate(el => el.getBoundingClientRect().height > 34), 'the small named action grows beyond 34px to hold its wrapped text');
            }
            if(step === 'what') assert.ok(await page.locator('#ofBody .os-plans').isVisible(), 'factory plans are shown');
            if(step === 'where') await page.locator('#ofFinderMap .map-canvas').waitFor();
            if(step === 'investment'){
              for(const mode of ['firm', 'self']){
                await page.locator(`[data-of-mode="${mode}"]`).click();
                await expansionWidth(page, `${lang} ${width}px factory/${id}/${step}/${mode}`, failures);
              }
            }else await expansionWidth(page, `${lang} ${width}px factory/${id}/${step}`, failures);
          }
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(failures, [], failures.join('\n'));
      });
    });
  }

  return {site, expansionStress, expansionSeed, expansionWidth};
}

module.exports = {expansionTests};
