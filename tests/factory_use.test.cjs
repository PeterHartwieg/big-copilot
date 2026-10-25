// A factory line's use against what it makes (issue #145): the Sold / day
// column, the production status ("short: needs N more machines") and the
// ingredient status, each its own chip, on Supply › Production and on the
// factory page. Runs on the synthetic R8 fixture (tests/fixtures/r8_supply.json),
// never a save.
const {test, before} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {suiteBrowser, boardHtml, abortExternal} = require('./_page.cjs');
const {en, enRe} = require('./_i18n.cjs');
// The column heads and status words, from the catalogue (tests/_i18n.cjs).
const SOLD = en('sb.col.sold'), MAKES = en('sb.col.makes'), SHIPS = en('sb.col.ships');
const MORE1 = en('sb.word.short.machines', {n: 1});
const ORDER = en('sb.word.short.order'), HOURS = en('sb.word.short.hours');
const root = path.join(__dirname, '..');
const FIXTURE = path.join(root, 'tests', 'fixtures', 'r8_supply.json');
const fixture = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const browser = suiteBrowser();
let html;
before(() => { html = boardHtml(); });

/* Supply › Production drawn from `data`, under `which` (all or changes). */
async function board(data, {which = 'all', mode = 'cap'} = {}){
  require('./_payload_contract.cjs').assertPayloadShape(data, 'factory_use');
  const page = await (await browser()).newPage({viewport: {width: 1280, height: 1000}});
  await abortExternal(page);
  await page.route('http://board.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
  await page.goto('http://board.test/');
  await page.evaluate(([data, which, mode]) => {
    D = data; sizing = mode; sbWhich = which; sbMode.imports = sbMode.deliveries = sbMode.production = which;
    supplySort = {}; sbSelOff = true; sbSel = null; sub.supply = 'production';
    document.body.classList.add('has-board');
    document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
    document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = false; el.classList.add('measured'); });
    drawSupplyStrip(); drawProductionView(); wireAll();
  }, [data, which, mode]);
  return page;
}
const LINES = '#secProduction [data-sb-table="factory-lines"]';
const heads = page => page.$$eval(`${LINES} thead th`, ths => ths.map(th => th.textContent.trim()));
/* A line row's cells by header, and its status chips: word and tip. */
const line = (page, slug) => page.$eval(`${LINES} tr[data-slug="${slug}"]`, (tr, sel) => {
  const names = [...document.querySelector(`${sel} thead tr`).cells].map(th => th.textContent.trim());
  const cells = Object.fromEntries([...tr.cells].map((c, i) => [names[i], c.textContent.replace(/\s+/g, ' ').trim()]));
  const chips = [...tr.querySelectorAll('td.st .sb-v')].map(v => ({word: v.textContent.trim(), tip: v.dataset.tip || '', cls: v.className}));
  return {cells, chips};
}, LINES);

/* The bread line short of a machine: its shops sell 1,000 a day, 1,150 with
   the margin, and two machines make 960 round the clock. */
function shortOfMachines(data){
  const bread = data.supply.factories.sites[0].lines.find(l => l.slug === 'bread');
  Object.assign(bread, {soldDay: 1000, needDay: 1150,
    production: {status: 'short', level: 'critical', more: 1, makesWith: 1440}});
  return data;
}

test('Sold / day sits beside Makes and Ships, from soldDay, on both pages', async () => {
  const page = await board(fixture());
  try {
    const cols = await heads(page);
    const at = cols.indexOf(SOLD);
    assert.ok(at > cols.indexOf(MAKES) && at < cols.indexOf(SHIPS), cols.join(' | '));
    assert.equal((await line(page, 'cake')).cells[SOLD], '170');
    assert.equal((await line(page, 'bread')).cells[SOLD], '826');
    assert.match(await page.$eval(`${LINES} thead th:nth-child(${at + 1})`, th => th.dataset.tip || th.title || th.innerHTML),
      enRe('sb.col.sold.tip'));
    // The factory page draws the same column.
    const panel = await page.evaluate(() => {
      const el = document.createElement('div');
      el.innerHTML = spLines(D.supply.factories.sites[0]);
      const head = [...el.querySelectorAll('.sp-head span')].map(s => s.textContent.trim());
      const rows = [...el.querySelectorAll('.sp-line:not(.sp-head)')].map(r => [...r.children].map(c => c.textContent.trim()));
      return {head, rows};
    });
    const sold = panel.head.indexOf(en('sp.lines.col.sold'));
    assert.ok(sold > panel.head.indexOf(en('sp.lines.col.makes')), panel.head.join(' | '));
    assert.equal(panel.rows[0][sold], '170');
  } finally { await page.close(); }
});

test('a line short of production reads short with the machine count, and is counted', async () => {
  for(const which of ['all', 'changes']){
    const page = await board(shortOfMachines(fixture()), {which});
    try {
      const bread = await line(page, 'bread');
      const prod = bread.chips.find(c => enRe('sb.word.short.machines').test(c.word));
      assert.ok(prod, JSON.stringify(bread.chips));
      assert.equal(prod.word, MORE1);
      assert.match(prod.cls, /\bbad\b/);
      assert.match(prod.tip, enRe('sb.line.machines.tip', {n: 1, makes: 1440, need: 1150}));
      assert.match(bread.cells[SOLD], new RegExp('^1,000 ?' + enRe('sb.line.needDay', {n: 1150}).source + '$'));
      // Its hours are covered, but a covered chip beside short reads as a
      // contradiction: the production chip stands alone.
      assert.ok(!bread.chips.some(c => c.word === en('sb.word.covered')), JSON.stringify(bread.chips));
      // No chip on a factory row reads a bare "short".
      assert.ok(!bread.chips.some(c => c.word === en('sb.word.short')), JSON.stringify(bread.chips));
      // The view's verdict (its tab's tip) counts the line.
      assert.match(await page.evaluate(() => viewTips['supply/production'] || ''),
        enRe('sb.fac.machines', {n: 1}));
    } finally { await page.close(); }
  }
  // Both sizings read it: what is sold does not depend on the basis.
  const dem = await board(shortOfMachines(fixture()), {mode: 'dem'});
  try {
    assert.ok((await line(dem, 'bread')).chips.some(c => c.word === MORE1));
  } finally { await dem.close(); }
  // An hours problem that is short still shows beside it.
  const data = shortOfMachines(fixture());
  Object.assign(data.supply.factories.sites[0].lines.find(l => l.slug === 'bread'), {status: 'short', why: 'hours', level: 'warn', hoursNow: 12});
  const both = await board(data);
  try {
    const words = (await line(both, 'bread')).chips.map(c => c.word);
    assert.ok(words.includes(HOURS) && words.includes(MORE1), words.join(' | '));
  } finally { await both.close(); }
});

test('a line sharing its product with another factory names the link of the chain (#521)', async () => {
  // The bread line is judged on its share of what the shops past the
  // meeting factory draw; its tip names that factory and what the chain
  // makes there together against the need, from either end of the route.
  const base = fixture();
  const s = base.supply.factories.sites[0].s;
  const other = base.businesses.findIndex((b, i) => i !== s && b);
  for(const [at, from, key] of [[other, [s], 'sb.line.chain.at'], [s, [other], 'sb.line.chain.here']]){
    const data = shortOfMachines(fixture());
    Object.assign(data.supply.factories.sites[0].lines.find(l => l.slug === 'bread'),
      {chain: {at, from, makes: 1440, need: 2300}});
    const page = await board(data);
    try {
      const prod = (await line(page, 'bread')).chips.find(c => c.word === MORE1);
      assert.ok(prod, key);
      const names = await page.evaluate(([at, from]) => ({at: shortName(D.businesses[at]), from: shortName(D.businesses[from[0]])}), [at, from]);
      assert.match(prod.tip, enRe('sb.line.machines.tip', {n: 1, makes: 1440, need: 1150}));
      assert.match(prod.tip, enRe(key, {...names, makes: 1440, need: 2300}));
      // The factory page's read-out says the same link.
      const read = await page.evaluate(() => spLinesRead(D.supply.factories.sites[0]));
      assert.match(read, enRe(key, {...names, makes: 1440, need: 2300}));
    } finally { await page.close(); }
  }
});

test('unsettled demand is visible on both factory views and withholds machine advice', async () => {
  for(const which of ['all', 'changes']) for(const mode of ['cap', 'dem']){
    const data = shortOfMachines(fixture());
    const row = data.supply.factories.sites[0].lines.find(l => l.slug === 'bread');
    // Even a stale production verdict beside the flag must not become advice.
    row.demandApproximate = true;
    const page = await board(data, {which, mode});
    try {
      const bread = await line(page, 'bread');
      assert.match(Object.values(bread.cells).join(' | '), enRe('sb.line.demandApproximate'));
      assert.ok(!bread.chips.some(c => enRe('sb.word.short.machines').test(c.word)));
      assert.match(await page.locator('#secProduction').innerText(), enRe('sb.fac.demandUnsettled'));
      assert.doesNotMatch(await page.evaluate(() => viewTips['supply/production'] || ''), enRe('sb.fac.machines', {n: 1}));
      const panel = await page.evaluate(() => {
        const site = D.supply.factories.sites[0];
        const el = document.createElement('div');
        el.innerHTML = spLines(site);
        return {text: el.textContent, read: spLinesRead(site), prod: sbProdFact(site.lines.find(l => l.slug === 'bread'))};
      });
      assert.match(panel.text, enRe('sb.line.demandApproximate'));
      assert.match(panel.read, enRe('sb.line.demandUnsettled'));
      assert.equal(panel.prod, null);
      assert.doesNotMatch(panel.text, enRe('sb.word.short.machines'));
    } finally { await page.close(); }
  }
});

test('unsettled demand keeps hour and ingredient estimates without checklist or staffing advice', async () => {
  for(const which of ['all', 'changes']){
    const data = fixture(), site = data.supply.factories.sites[0];
    const bread = site.lines.find(l => l.slug === 'bread');
    Object.assign(bread, {demandApproximate: true, soldDay: 1000, needDay: 1150, hoursNow: 12,
      needHours: {cap: 24, dem: 24}, dem: {status: 'short', why: 'hours', level: 'critical', lower: 20}});
    const flour = site.needs.find(n => n.slug === 'flour');
    flour.demandApproximate = true;
    // Defend against stale verdicts on both the input and its canonical fact.
    Object.assign(data.supply.facts[String(site.s)].flour, {dem: {use: 240, need: 240,
      demandApproximate: true, st: 'short', why: 'target', lvl: 'critical', setTo: 240, lower: 167}});
    data.factoryStaffing = {dem: [{s: site.s, key: data.businesses[site.s].key,
      failed: true, unavailable: 'demandApproximate'}]};
    const page = await board(data, {which, mode: 'dem'});
    try {
      const got = await page.evaluate(() => {
        const site = D.supply.factories.sites[0], bread = site.lines.find(l => l.slug === 'bread');
        const ctx = sbData(), input = ctx.allSites.flatMap(s => s.rows).find(r => r.slug === 'flour');
        const uncertain = {...input.fact, st: 'short', setTo: 500, lower: 167};
        const raw = {...input, fact: uncertain, s: site.s, setTo: 500, use: 240, week: 1680,
          fit: 'short', catchUp: 100, shortBy: 1};
        // Cover unsourced inputs and raw one-off/import rows too: neither
        // canonical nor stale facts may manufacture an actionable checklist.
        const rawChanges = buildOrderChecklist([{s: site.s, rows: [raw]}], [raw],
          [{s: site.s, rows: [raw]}], [], [raw], D.businesses);
        const staffing = drawFactoryStaffing();
        const flour = site.needs.find(n => n.slug === 'flour');
        Object.assign(flour, {from: null, directImport: false, factoryImportSite: null});
        const settled = {...site, s: 0, lines: [], needs: [{...flour, demandApproximate: false}]};
        D.supply.factories.sites.unshift(settled);
        D.supply.facts[0] ||= {};
        D.supply.facts[0].flour = {st: 'noplan', why: 'target', lvl: 'critical', use: 100, need: 115, imp: false};
        // A settled user's fact comes first in the grouped, unsourced input.
        // Its combined week must still inherit the later user's uncertainty.
        const mixed = supplyChecklistRows();
        return {fact: sbLineFact(bread), input: input.fact, changes: ctx.rows.filter(r =>
          r.site === site.s && ['bread', 'flour'].includes(r.slug)), rawChanges,
          mixedChanges: mixed.rows.filter(r => r.slug === 'flour'),
          staffing, banner: document.querySelector('#secProduction .sb-ramp').textContent,
          tip: viewTips['supply/production']};
      });
      assert.equal(got.fact, null);
      assert.equal(got.input.use, 240);
      assert.equal(got.input.setTo, null);
      assert.equal(got.input.lower, null);
      assert.deepEqual(got.changes, []);
      assert.deepEqual(got.rawChanges, []);
      assert.deepEqual(got.mixedChanges, []);
      assert.match(got.staffing, enRe('sb.line.demandUnsettled'));
      assert.notEqual(got.banner.trim(), got.tip.trim());
      const row = await line(page, 'bread');
      assert.match(Object.values(row.cells).join(' '), /24/);
      assert.ok(!row.chips.some(c => c.word === HOURS));
      assert.doesNotMatch(Object.values(row.cells).join(' '), enRe('sb.line.fewer'));
      const input = page.locator('#secProduction [data-sb-table="factory-inputs"] tr[data-slug="flour"]');
      assert.match(await input.innerText(), /240/);
      assert.match(await input.innerText(), enRe('sb.line.demandApproximate'));
    } finally { await page.close(); }
  }
});

test('an approximate sibling adds a note without hiding a settled machine shortage', async () => {
  const data = shortOfMachines(fixture());
  data.supply.factories.sites[0].lines.find(l => l.slug === 'cake').demandApproximate = true;
  const page = await board(data);
  try {
    const read = await page.evaluate(() => spLinesRead(D.supply.factories.sites[0]));
    assert.match(read, enRe('sp.lines.machines', {item: 'Bread', n: 1, need: '1,150'}));
    assert.match(read, enRe('sb.line.demandUnsettled'));
    assert.ok((await line(page, 'bread')).chips.some(c => c.word === MORE1));
  } finally { await page.close(); }
});

test('saved import edits survive reload without deriving hours from unsettled demand', async () => {
  const {spawnSync} = require('node:child_process');
  const made = spawnSync(process.env.PYTHON || 'python', ['-m', 'tests.multistage_fixture'], {cwd: root, encoding: 'utf8'});
  assert.equal(made.status, 0, made.stderr);
  const data = JSON.parse(made.stdout);
  for(const which of ['all', 'changes']) for(const mode of ['cap', 'dem']) for(const basis of ['cap', 'dem']){
    const page = await board(data.settled, {which, mode});
    try {
      await page.evaluate(basis => {
        sizing = basis;
        for(const group of sbData().importRows) for(const r of group.rows)
          impSetKeep(r.impId, {value: 1800, inGame: r.inGame, basis});
      }, basis);
      await page.reload();
      const got = await page.evaluate(([data, which, mode]) => {
        D = data; sizing = mode; sbWhich = which;
        sbMode.imports = sbMode.deliveries = sbMode.production = which;
        sbSelOff = true; sbSel = null; sub.supply = 'production';
        const d = sbData();
        drawProductionView(); drawChangesView();
        flowPickId = D.businesses[0].key; drawFlowView();
        const imports = d.importRows.flatMap(g => g.rows);
        const manual = imports.map(r => {
          sbSel = {s: r.s, slug: r.slug};
          const el = document.createElement('div'); el.innerHTML = sbImportCard(d);
          return el.querySelector('[data-panel="manual"]').textContent;
        });
        return {rows: d.rows, imports, manual,
          text: orderChecklistText(d.rows, 'Review', sizing),
          production: document.querySelector('#secProduction').textContent,
          changes: document.querySelector('#secChanges').textContent,
          flow: document.querySelector('#sbFlowPanel').textContent};
      }, [data.fallback, which, mode]);
      assert.ok(got.imports.every(r => r.value === 1800 && r.basis === basis));
      if(basis === 'dem') assert.ok(got.imports.every(r => r.deps.length === 0));
      if(mode === 'dem'){
        if(basis === 'dem') assert.deepEqual(got.rows, []);
        else {
          assert.ok(got.rows.filter(r => r.kind === 'hours').every(r => r.dep && r.proposed === 24));
          assert.ok(got.imports.flatMap(r => r.deps).every(dep => dep.needNow === null));
        }
        assert.doesNotMatch(got.rows.map(r => r.reason).join(' '), /where shop demand plans|Reset the figure/);
        assert.match(got.flow, /approximate/i);
        if(basis === 'dem'){
          assert.doesNotMatch(got.text + got.changes, /hours\/day|Staff Beer|20\s*→\s*24/);
          assert.doesNotMatch(got.production, /20\s*→\s*24/);
          assert.match(got.production, /approximately 24 needed/);
          assert.doesNotMatch(got.manual.join(' '), /Schedule: staff/);
        }
      }
    } finally { await page.close(); }
  }
});

test('import review withholds approximate suggestions and labels use on its own saved basis', async () => {
  const {spawnSync} = require('node:child_process');
  const made = spawnSync(process.env.PYTHON || 'python', ['-m', 'tests.multistage_fixture'], {cwd: root, encoding: 'utf8'});
  assert.equal(made.status, 0, made.stderr);
  const data = JSON.parse(made.stdout);
  for(const which of ['all', 'changes']) for(const settled of [false, true])
    for(const mode of ['dem', 'cap']) for(const basis of [null, 'dem', 'cap']){
      const page = await board(data.settled, {which, mode});
      try {
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        if(basis) await page.evaluate(basis => {
          sizing = basis;
          const r = sbData().importRows[0].rows[0];
          impSetKeep(r.impId, {value: 1800, inGame: r.inGame, basis});
        }, basis);
        await page.reload();
        const got = await page.evaluate(([data, which, mode]) => {
          D = data; sizing = mode; sbMode.imports = which; sub.supply = 'imports';
          const d = sbData(), r = d.importRows[0].rows[0];
          sbSel = {s: r.s, slug: r.slug}; sbiOpen = 'why';
          drawImportsView();
          const card = document.querySelector('#sbCard');
          return {r, rows: d.rows, text: card.textContent, value: card.querySelector('.imp-in').value,
            scale: card.querySelector('.sbi-scale').textContent,
            scaleLabel: card.querySelector('.sbi-scale').getAttribute('aria-label'),
            why: [...card.querySelectorAll('.sbi-why tr')].map(tr => tr.textContent),
            manual: card.querySelector('[data-panel="manual"]').textContent};
        }, [settled ? data.settled : data.fallback, which, mode]);
        const context = JSON.stringify({which, settled, mode, basis});
        assert.equal(got.r.inGame, 100, context);
        assert.equal(got.value, String(basis ? 1800 : mode === 'cap' ? 1680 : settled ? 1350 : 100), context);
        if(basis) assert.equal(got.r.basis, basis, context);
        if(!settled){
          assert.doesNotMatch(got.text, /Shop demand (?:would suggest|suggests)|With shop demand instead/i, context);
          if(mode === 'dem' && basis) assert.match(got.text, /Reset to the game's 100/, context);
          if(mode === 'cap' && basis) assert.match(got.text, /Full production suggests 1,680/, context);
          if(mode === 'dem' && !basis) assert.match(got.text, /Full production would suggest 1,680/, context);
        } else {
          if(mode === 'dem' && basis) assert.match(got.text, /Shop demand suggests 1,350/, context);
          if(mode === 'cap' && !basis) assert.match(got.text, /Shop demand would suggest 1,350/, context);
        }
        const approximateScale = !settled && mode === 'dem';
        assert.equal(/approximate demand/i.test(got.scale), approximateScale, context);
        assert.equal(/approximate demand/i.test(got.scaleLabel), approximateScale, context);
        assert.match(got.scale, new RegExp(settled && mode === 'dem' ? '1,169' : '1,680'), context);
        const approximateWhy = !settled && (basis || mode) === 'dem';
        for(const label of ['Factory lines, a week', 'Uses a week']){
          const row = got.why.find(text => text.startsWith(label));
          assert.ok(row, context);
          assert.equal(/approximate demand/i.test(row), approximateWhy, context + row);
          assert.match(row, new RegExp(settled && (basis || mode) === 'dem' ? '1,169' : '1,680'), context);
        }
        if(!settled && basis === 'cap' && mode === 'dem'){
          assert.match(got.manual, /staff.*Beer.*24 h/i, context);
          assert.match(got.manual, /staff.*Beer.*24 h[^.]*\. Planned for full production\./i, context);
          assert.match(got.text, /Your figure, set while planning for full production/, context);
          assert.match(got.rows.filter(r => r.kind === 'hours').map(r => r.reason).join(' '), /Planned for full production/, context);
          assert.doesNotMatch(got.manual, /where shop demand plans/, context);
        }
        assert.deepEqual(errors, [], context);
      } finally { await page.close(); }
    }
});

// Bounds of the rendered text matter: a table cell or mark can exist in the
// DOM yet be completely hidden by the Review card's rounded clipping edge.
async function importCardBounds(page){
  return page.$eval('#sbCard', card => {
    const rect = el => {
      const r = el.getBoundingClientRect();
      return {left: r.left, right: r.right, top: r.top, bottom: r.bottom};
    };
    const elements = [...card.querySelectorAll('.sbi-now, .sbi-box, .sbi-box input, .sbi-fig, .sbi-why, .sbi-why td, .sbi-scale, .sbi-scale u, .sbi-scale em, .sbi-scale b')];
    const boxes = elements.map(el => ({text: el.textContent, ...rect(el)}));
    // Include each text fragment, since a constrained element can still have
    // overflowing nowrap text. Range rectangles also handle wrapped labels.
    for(const el of card.querySelectorAll('.sbi-why td, .sbi-scale em')){
      const range = document.createRange(); range.selectNodeContents(el);
      for(const r of range.getClientRects()) boxes.push({text: el.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom});
    }
    return {card: rect(card), overflow: card.scrollWidth - card.clientWidth, boxes,
      marks: [...card.querySelectorAll('.sbi-scale em')].map(el => ({text: el.textContent, ...rect(el)})),
      values: [...card.querySelectorAll('.sbi-why td:last-child')].map(el => el.textContent)};
  });
}
function assertImportCardBounds(got, context){
  assert.ok(got.boxes.length > 0, context);
  for(const box of got.boxes){
    assert.ok(box.left >= got.card.left && box.right <= got.card.right &&
      box.top >= got.card.top && box.bottom <= got.card.bottom, `${context}: clipped ${JSON.stringify(box)} in ${JSON.stringify(got.card)}`);
  }
  assert.ok(got.overflow <= 1, `${context}: horizontal overflow ${got.overflow}`);
  for(let i = 0; i < got.marks.length; i++) for(let j = i + 1; j < got.marks.length; j++){
    const a = got.marks[i], b = got.marks[j];
    assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
      `${context}: overlapping scale labels ${a.text} / ${b.text}`);
  }
}

test('import review keeps saved Demand amounts and scale marks inside narrow and wide cards', async () => {
  const {spawnSync} = require('node:child_process');
  const made = spawnSync(process.env.PYTHON || 'python', ['-m', 'tests.multistage_fixture'], {cwd: root, encoding: 'utf8'});
  assert.equal(made.status, 0, made.stderr);
  const data = JSON.parse(made.stdout);
  for(const width of [390, 480, 768, 1440]) for(const settled of [false, true]) for(const mode of ['dem', 'cap']){
    const page = await board(data.settled, {mode: 'dem'});
    try {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({width, height: 1100});
      await page.evaluate(() => {
        const r = sbData().importRows[0].rows[0];
        impSetKeep(r.impId, {value: 1800, inGame: r.inGame, basis: 'dem'});
      });
      await page.reload();
      await page.evaluate(([data, mode]) => {
        D = data; sizing = mode; sbWhich = sbMode.imports = 'all'; sub.supply = 'imports';
        const r = sbData().importRows[0].rows[0];
        sbSel = {s: r.s, slug: r.slug}; sbiOpen = 'why';
        document.body.classList.add('has-board');
        document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== 'pageSupply'; });
        document.querySelectorAll('#pageSupply section').forEach(el => { el.hidden = el.id !== 'secImports'; el.classList.add('measured'); });
        drawSupplyStrip(); drawImportsView(); wireAll();
      }, [settled ? data.settled : data.fallback, mode]);
      const context = JSON.stringify({width, settled, mode});
      const got = await importCardBounds(page);
      assertImportCardBounds(got, context);
      assert.ok(got.values.includes('1,800'), context);
      assert.equal(got.values.filter(v => v === (settled ? '1,169' : '1,680')).length, settled ? 2 : 3, context);
      assert.match(got.marks.map(m => m.text).join(' '), /planned1,800/, context);
      assert.deepEqual(errors, [], context);
    } finally { await page.close(); }
  }
});

test('import scale fits zero, equal, close, capped and reduced amounts without label collisions', async () => {
  const page = await board(fixture());
  try {
    for(const width of [390, 480, 768, 1440]) for(const [now, plan, draw, cap] of [
      [0, 0, 0, null], [100, 100, 100, 100], [1600, 1800, 1680, 1850], [1800, 100, 1680, 2000], [100, 1800, 1680, null],
    ]){
      await page.setViewportSize({width, height: 1100});
      await page.evaluate(([now, plan, draw, cap]) => {
        document.querySelector('#secProduction').innerHTML = `<div id="sbCard" class="sbi-card"><div class="sbi-sec">${
          sbiScale({inGame: now, value: plan, fact: {demandApproximate: true}}, draw, cap)}</div></div>`;
      }, [now, plan, draw, cap]);
      assertImportCardBounds(await importCardBounds(page), JSON.stringify({width, now, plan, draw, cap}));
    }
  } finally { await page.close(); }
});

test('uncertainty preserves observed staffing and distinguishes new inputs and mixed totals', async () => {
  const data = fixture(), site = data.supply.factories.sites[0];
  const bread = site.lines.find(l => l.slug === 'bread');
  bread.demandApproximate = true;
  data.supply.facts[String(site.s)].flour.dem = {use: 240, need: 240, demandApproximate: true, st: 'new', why: 'demandApproximate'};
  const page = await board(data, {mode: 'dem'});
  try {
    const got = await page.evaluate(() => {
      const site = D.supply.factories.sites[0], d = sbData();
      const node = document.createElement('div'); node.innerHTML = sbProdTiles(d.f.sites);
      const part = sbFactoryPart(d, new Set(), sbImportCtx(d), 'production', {lines: true, inputs: true});
      const stale = part.everyLine.find(r => r.slug === 'bread');
      const row = document.createElement('tbody');
      row.innerHTML = sbLineRow(d, {...stale, chk: [{kind: 'hours', proposed: 24}]}, site);
      return {read: spLinesRead(site), verdict: part.verdict, staleHours: row.querySelector('.sb-hrs').textContent,
        tiles: node.textContent};
    });
    assert.match(got.read, enRe('sp.lines.least'));
    assert.match(got.read, enRe('sb.line.demandUnsettled'));
    assert.doesNotMatch(got.verdict, /too new to judge/);
    assert.match(got.verdict, enRe('sb.fac.approxInputs', {n: 1}, {cap: true}));
    assert.match(got.tiles, /includes approximate hours/);
    assert.doesNotMatch(got.staleHours, /→/);
  } finally { await page.close(); }
});

test('a factory with a line critically short of machines opens, and its head says so', async () => {
  // Nothing else to read: every input covered, the cake's hours covered, so
  // there is no change to type and no other critical row.
  const data = shortOfMachines(fixture());
  for(const fact of Object.values(data.supply.facts['1'])){
    if(fact.st === 'made') continue;
    Object.assign(fact, {st: 'covered', why: null, lvl: 'ok', setTo: null});
    delete fact.dem;
  }
  Object.assign(data.supply.factories.sites[0].lines.find(l => l.slug === 'cake'),
    {status: 'covered', why: null, level: 'ok', hoursNow: 24, hoursWeek: 336, gaps: []});
  const page = await board(data, {which: 'changes'});
  try {
    const obj = await page.$eval('#secProduction details.sb-obj', d => ({
      open: d.open, head: d.querySelector('summary').textContent.replace(/\s+/g, ' ')}));
    assert.ok(obj.open, JSON.stringify(obj));
    assert.match(obj.head, enRe('sb.fac.machines.chip', {n: 1}));
    // The head's chip has a tip of its own, counting the lines.
    assert.match(await page.$eval('#secProduction details.sb-obj summary .sb-v', v => v.dataset.tip),
      enRe('sb.fac.machines.chip.tip', {n: 1}, {anchor: 'start'}));
  } finally { await page.close(); }
});

test('the factory page and the head name the line furthest short of machines: critical first', async () => {
  // Cake comes first in the list and has more machines to add, but only the
  // margin is past it (warn); Bread, second, is critical, so Bread is named.
  const data = shortOfMachines(fixture());
  const site = data.supply.factories.sites[0];
  assert.equal(site.lines[0].slug, 'cake');
  Object.assign(site.lines[0], {soldDay: 900, needDay: 1035,
    production: {status: 'short', level: 'warn', more: 3, makesWith: 1200}});
  site.needs.find(n => n.slug === 'flour').item = 'Flour & Salt';
  Object.assign(data.supply.facts['1'].flour, {st: 'short', why: 'order', lvl: 'critical', cad: 'weekly'});
  const page = await board(data);
  try {
    const got = await page.evaluate(orderShort => {
      const site = D.supply.factories.sites[0];
      const el = document.createElement('div');
      el.innerHTML = spLines(site);
      const row = [...el.querySelectorAll('.sp-line:not(.sp-head)')].find(r => r.textContent.includes('Bread'));
      const order = [...row.querySelectorAll('.chip')].find(c => c.textContent.trim() === orderShort);
      return {read: spLinesRead(site), tip: order.dataset.tip,
        head: sbProdWorst(sbData().f.sites[0].lines.map(l => ({...l, prod: sbProdFact(l)}))).item};
    }, ORDER);
    assert.match(got.read, enRe('sp.lines.machines', {item: 'Bread', n: 1, need: '1,150'}));
    assert.equal(got.head, 'Bread');
    // The head's chip takes the critical line's colour.
    assert.match(await page.$eval('#secProduction details.sb-obj summary .sb-v', v => v.className), /\bbad\b/);
    assert.equal(got.tip, en('sb.line.inputs.tip', {items: 'Flour & Salt'}));
  } finally { await page.close(); }
});

test('an order short and a production short on one line are two separate statuses', async () => {
  const data = shortOfMachines(fixture());
  // Flour, which the bread line eats, comes on an import order that does not
  // bring the week it has to cover.
  Object.assign(data.supply.facts['1'].flour, {st: 'short', why: 'order', lvl: 'critical', cad: 'weekly'});
  delete data.supply.facts['1'].flour.dem;
  const page = await board(data);
  try {
    const bread = await line(page, 'bread');
    const words = bread.chips.map(c => c.word);
    assert.ok(words.includes(MORE1), words.join(' | '));
    assert.ok(words.includes(ORDER), words.join(' | '));
    const order = bread.chips.find(c => c.word === ORDER);
    assert.match(order.tip, enRe('sb.line.inputs.tip', {items: 'Flour'}));
    // The input's own row names its subject too.
    const flour = await page.$eval('#secProduction [data-sb-table="factory-inputs"] tr[data-slug="flour"] td.st .sb-v', v => v.textContent.trim());
    assert.equal(flour, ORDER);
    // The factory page shows the same two chips on the line.
    const chips = await page.evaluate(() => {
      const el = document.createElement('div');
      el.innerHTML = spLines(D.supply.factories.sites[0]);
      const row = [...el.querySelectorAll('.sp-line:not(.sp-head)')].find(r => r.textContent.includes('Bread'));
      return [...row.querySelectorAll('.chip')].map(c => c.textContent.trim());
    });
    assert.deepEqual(chips, [MORE1, ORDER]);
  } finally { await page.close(); }
});

test('factory staffing repeats line hours only when the main line does not show identical figures', async () => {
  const page = await board(fixture());
  try {
    const got = await page.evaluate(() => {
      const line = {slug:'bread', item:'Bread', hoursNow:8, hours:12, from:0, machines:1, cuts:[[0,12]]};
      D.factoryStaffing = {[sizing]:[{s:1, name:'Factory', headcount:{have:1}, delta:{}, lines:[line]}]};
      const main = {s:1, slug:'bread', hoursNow:8, needHours:{[sizing]:12}, objectKey:'production|test', objectOpen:true};
      const read = shown => {
        const box=document.createElement('div'); box.innerHTML=drawFactoryStaffing(()=>true,shown);
        return {hours:box.querySelector('.sb-sln .hrs').textContent.trim(), hidden:box.querySelector('.sb-sln .hrs').hidden, blocks:box.querySelector('.shifts').textContent.trim(), context:box.querySelector('.sb-hc').textContent.trim()};
      };
      return {same:read([main]), hidden:read([]), changed:read([{...main,hoursNow:7}]), unnamed:read([{...main,unnamed:true}]), collapsed:read([{...main,objectOpen:false}]), proposed:read([{...main,chk:[{kind:'hours',proposed:10}]}])};
    });
    assert.equal(got.same.hidden,true);
    for(const state of ['hidden','changed','unnamed','collapsed','proposed']) {assert.match(got[state].hours,/12/);assert.equal(got[state].hidden,false);}
    for(const state of Object.values(got)) {assert.match(state.blocks,/12/);assert.ok(state.context);}
  } finally {await page.close();}
});

test('closing and reopening the factory details restores and suppresses only its echoed staffing hours', async () => {
  const page=await board(fixture());
  try {
    const result=await page.evaluate(() => {
      const line={slug:'bread',item:'Bread',hoursNow:8,hours:12,from:0,machines:1,cuts:[[0,12]]};
      D.factoryStaffing={[sizing]:[{s:1,name:'Factory',headcount:{have:1},delta:{},lines:[line]}]};
      const host=document.createElement('div');
      host.innerHTML='<details data-sb-obj="production|test" open><summary>Factory</summary><div>Main line</div></details>'+drawFactoryStaffing(()=>true,[{s:1,slug:'bread',hoursNow:8,needHours:{[sizing]:12},objectKey:'production|test',objectOpen:true}]);
      document.body.append(host);
      const details=host.querySelector('details'), hours=host.querySelector('.hrs');
      const initial=hours.hidden;
      details.open=false;details.dispatchEvent(new Event('toggle'));
      const closed=hours.hidden;
      details.open=true;details.dispatchEvent(new Event('toggle'));
      return {initial,closed,reopened:hours.hidden};
    });
    assert.deepEqual(result,{initial:true,closed:false,reopened:true});
  } finally {await page.close();}
});

test('mixed factory staffing rows align entries on desktop without an empty hours row on mobile', async () => {
  const page=await board(fixture());
  try {
    await page.evaluate(() => {
      const lines=[{slug:'bread',item:'Bread',hoursNow:8,hours:12,from:0,machines:1,cuts:[[0,12]]},
        {slug:'beer',item:'Beer',hoursNow:8,hours:12,from:0,machines:1,cuts:[[0,12]]}];
      D.factoryStaffing={[sizing]:[{s:1,name:'Factory',headcount:{have:1},delta:{},lines}]};
      document.querySelector('#secProduction').innerHTML=drawFactoryStaffing(()=>true,[{s:1,slug:'bread',hoursNow:8,needHours:{[sizing]:12},objectKey:'production|test',objectOpen:true}]);
    });
    const rects=()=>page.$$eval('.sb-sln',rows=>rows.map(row=>{
      const shifts=row.querySelector('.shifts').getBoundingClientRect(),name=row.querySelector('.nm').getBoundingClientRect();
      return {x:shifts.x,width:shifts.width,y:shifts.y,nameBottom:name.bottom,hoursDisplay:getComputedStyle(row.querySelector('.hrs')).display};
    }));
    const wide=await rects();
    assert.equal(wide[0].x,wide[1].x);assert.equal(wide[0].width,wide[1].width);
    assert.equal(wide[0].hoursDisplay,'grid');
    await page.setViewportSize({width:560,height:1000});
    const narrow=await rects();
    assert.equal(narrow[0].hoursDisplay,'none');
    const gap=narrow[0].y-narrow[0].nameBottom;
    assert.ok(gap>=0 && gap<=9,'only the normal grid gap remains, without overlap');
    assert.equal(narrow[0].x,narrow[1].x);assert.equal(narrow[0].width,narrow[1].width);
  } finally {await page.close();}
});
