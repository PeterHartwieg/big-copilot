// The Roster block on a shop's page: the week the board would type into BizMan,
// drawn from the `staffing` payload key.
//
// Nothing here invents a payload. Every row comes out of the real planner:
// tests/roster_fixture.py builds four synthetic saves and runs `_staffing()`
// over them, and this suite runs that module once and reads the rows off its
// stdout. A hand-written fixture drifts from what the Python emits — a
// `current.shifts` that does not match `current.list`, a `hireHours` that is
// not `hire * 30`, a `p: null` the planner never wrote — and a block that
// passes on those is not known to work on anything.
//
// Install Playwright and its Chromium browser to run; NODE_PATH may point at an
// existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const {chromium} = require('playwright');

const ROOT = path.join(__dirname, '..');
const PYTHON = process.env.PYTHON || 'python';

let browser;
let html;
let server;
let origin;
let ROWS;

before(async () => {
  const board = spawnSync(PYTHON, ['-c',
    'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
  {cwd: ROOT, maxBuffer: 8 * 1024 * 1024});
  assert.equal(board.status, 0, board.stderr?.toString());
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8')
    : board.stdout.toString();

  const fixture = spawnSync(PYTHON, ['-m', 'tests.roster_fixture'],
    {cwd: ROOT, maxBuffer: 16 * 1024 * 1024});
  assert.equal(fixture.status, 0, fixture.stderr?.toString());
  ROWS = JSON.parse(fixture.stdout.toString());

  // localStorage needs a real origin: a page set from a string is opaque and
  // every read and write there throws, which is the one case the ticks must
  // survive but not the case being tested.
  server = http.createServer((req, res) => {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    res.end(html);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL});
});
after(async () => {
  await browser?.close();
  await new Promise(r => server.close(r));
});

const KEY = 'ba:street_secondavenue#12';
const copy = row => JSON.parse(JSON.stringify(row));

// The business the panel opens. Its Crew list overlaps the roster's people by
// name, which is the only thing the two lists share.
function business(){
  return {
    key: KEY, status: 'retail', name: 'HART. Test 12', code: 'HK', type: 'Clothing Store',
    address: '12 Second Avenue', neighbourhood: "Hell's Kitchen",
    opened: 12, revenue: 3491, customers: 90, basket: 38.79, profit: 1200, margin: 34.4,
    cogs: 100, wages: 2000, rent: 291, marketing: 0, theft: 0, licensing: 0,
    staff: 2, staffCost: 400, uniformGaps: [], crew: [{role: 'Cashier', count: 2, daily: 400, absent: 0}],
    people: [{name: 'FULL1', role: 'Cashier', absent: false, daily: 200},
      {name: 'BENCH', role: 'Cashier', absent: false, daily: 200}],
    lines: [], series: [], rhythm: null, peakDay: null, swing: 0, daysOpen: 40,
  };
}

/** Open the site panel on one of the planner's rows, optionally edited first. */
async function shop(which = 'full', edit, boot){
  const row = copy(ROWS[which]);
  if(edit) edit(row);
  const page = await browser.newPage({viewport: {width: 1440, height: 1200}});
  await page.route('https://**', r => r.abort());
  await page.goto(origin, {waitUntil: 'load'});
  if(boot) await page.evaluate(boot);
  await page.evaluate(([staffing, b]) => {
    document.body.classList.add('has-board');
    D = {
      meta: {character: 'roster-fixture', day: 41},
      rhythm: null,
      supply: {shops: []},
      businesses: [b],
      hours: [],
      hourFindings: [],
      staffing,
    };
    siteKey = b.key; siteOpen = true;
    drawSite();
  }, [[row], business()]);
  return page;
}


/** One of the planner's rows resized: `staffed` lines somebody can be put on,
 *  `hire` lines waiting on somebody being hired, and `now` shifts in the game.
 *  Every row is a clone of one the planner really wrote, re-stamped onto a
 *  weekday so the lines stay distinct, and `current.shifts` is counted off
 *  `current.list` rather than asserted beside it. */
function sized(name, {staffed, hire, now}){
  const row = copy(ROWS.full);
  const posts = ROWS.full.stations;
  const staffedRows = ROWS.full.shifts.filter(x => x.p !== null);
  const hireRows = ROWS.full.shifts.filter(x => x.p === null);
  const nowRows = ROWS.full.current.list;
  /* Asking for more lines than the planner wrote means going round its week
     again, and a second lap that changed nothing would hand back the lines it
     already gave -- one tick for two rows, which is not a week anybody could
     type. So each lap is the same week at its own copy of the furniture: a
     bigger shop, with the hours, the weekdays and the people left exactly as
     the planner set them. */
  const laps = Math.max(
    Math.ceil(staffed / staffedRows.length),
    hire ? Math.ceil(hire / hireRows.length) : 0,
    Math.ceil(now / nowRows.length));
  row.stations = [].concat(...Array.from({length: laps}, (_, lap) =>
    posts.map(st => Object.assign({}, st, {id: lap ? `${st.id}#${lap}` : st.id}))));
  const cycle = (from, n) => Array.from({length: n}, (_, k) => Object.assign(
    {}, from[k % from.length],
    {s: from[k % from.length].s + Math.floor(k / from.length) * posts.length}));
  row.key = name;
  row.name = name;
  row.shifts = cycle(staffedRows, staffed).concat(cycle(hireRows, hire));
  row.current.list = cycle(nowRows, now);
  row.current.shifts = row.current.list.length;
  row.current.fragments = row.current.list.length;
  return row;
}
const list0 = row => row.shifts.concat(row.current.list);
const lineIds = list => list.map(s => `${s.d}|${s.s}|${s.f}|${s.t}|${s.p}`);


const mon = '#sp-roster .sp-day[data-d="1"] ';

// --- what the planner actually emits ----------------------------------------

test('the planner writes the hiring lines the block draws', () => {
  // The whole block rests on this: if `shifts` never carried a `p: null` row,
  // every dashed bar below would be testing a shape that cannot happen.
  const open = ROWS.full.shifts.filter(s => s.p === null);
  assert.equal(open.length, 7, 'one uncovered locker shift a day');
  assert.ok(open.every(s => s.k === 'security'));
  // And the fixtures are internally consistent, which a hand-made one is not.
  for(const [name, row] of Object.entries(ROWS)){
    assert.equal(row.current.shifts, row.current.list.length, name);
    for(const h of Object.values(row.headcount))
      assert.equal(h.hireHours, h.hire * 30, `${name} ${h.kind}`);
    for(const s of row.shifts){
      assert.ok(row.stations[s.s], `${name}: station ${s.s}`);
      assert.ok(s.p === null || row.people[s.p], `${name}: person ${s.p}`);
    }
  }
});

// --- the shapes, without a page between them and the assertion ---------------

test('a shift row lands on its own station and weekday, and a stray one is dropped', async () => {
  const page = await shop('full', row => {
    // A save can hold a row pointing at furniture or a person the tables do
    // not have; neither may be drawn against the wrong one.
    row.shifts.push({d: 1, s: 99, f: 8, t: 12, p: 0});
    row.shifts.push({d: 1, s: 0, f: 0, t: 4, p: 99});
    row.shifts.push({d: 9, s: 0, f: 0, t: 4, p: 0});
  });
  try {
    const rows = await page.evaluate(key => {
      const r = spRosterRow(key);
      return spRosterRows(r, r.shifts).map(day => day.map(sh => sh.map(s => `${s.f}-${s.t}`)));
    }, KEY);
    assert.deepEqual(rows[1], [['8-20'], ['8-20'], ['0-12', '12-24'], ['0-12', '12-24']]);
    assert.equal(rows.flat(2).length, 42, 'the three stray rows are drawn nowhere');
  } finally { await page.close(); }
});

test('a day identical to an earlier one is named as its copy, and an empty day is nobody\'s', async () => {
  // `shut` is the same week six times over with Sunday closed.
  const page = await shop('shut');
  try {
    const same = await page.evaluate(key => {
      const r = spRosterRow(key);
      return spSameDays(spRosterRows(r, r.shifts));
    }, KEY);
    assert.equal(same[0], null, 'Sunday is shut, not a copy of anything');
    assert.equal(same[1], null, 'Monday is the first of its kind');
    assert.deepEqual(same.slice(2), [1, 1, 1, 1, 1], 'Tuesday to Saturday are Monday again');
  } finally { await page.close(); }
});

test('a day matching in hours but not in people is not a copy', async () => {
  const page = await shop('shut');
  try {
    const same = await page.evaluate(key => {
      const r = spRosterRow(key);
      const days = spRosterRows(r, r.shifts);
      // Tuesday, with one shift handed to somebody else: the same hours at the
      // same stations, which is what "copy schedule" would get wrong.
      days[2][0][0] = Object.assign({}, days[2][0][0], {p: 1});
      return spSameDays(days);
    }, KEY);
    assert.equal(same[2], null);
    assert.equal(same[3], 1, 'the rest still are');
  } finally { await page.close(); }
});

test('only the lines somebody can be put on count as typed', async () => {
  const page = await shop('full');
  try {
    const counted = await page.evaluate(key => {
      const r = spRosterRow(key);
      const hire = r.shifts.find(s => s.p === null);
      const real = r.shifts.find(s => s.p !== null);
      const ticks = new Set([spTickId(r, hire), spTickId(r, real), 'nothing|like|a|line']);
      return [spTyped(r, spTickableRows(r), ticks), r.shifts.length];
    }, KEY);
    assert.deepEqual(counted, [1, 42], 'the hiring line and the stale tick count for nothing');
  } finally { await page.close(); }
});

test('the counts are the plan against what the schedule holds today', async () => {
  const page = await shop('full');
  try {
    const counts = await page.evaluate(key => spRosterCounts(spRosterRow(key)), KEY);
    assert.deepEqual(counts, {plan: 42, tickable: 35, hire: 7, now: 42, fragments: 42});
  } finally { await page.close(); }
});

test('a week of nothing but thin days has no measured hour to plan from', async () => {
  const page = await shop('full');
  try {
    // The never-measured shop is handed in beside the measured one rather
    // than read off `D.staffing`, which holds only the row the page opened.
    const answers = await page.evaluate(([key, cover]) => [
      spRosterMeasured(spRosterRow(key)),
      spRosterMeasured(cover),
      spRosterMeasured({key: 'x', name: 'x', failed: true}),
      spRosterMeasured(null),
    ], [KEY, copy(ROWS.cover)]);
    assert.deepEqual(answers, [true, false, false, false]);
  } finally { await page.close(); }
});

test('the never-measured row really is all `none`', () => {
  const basis = ROWS.cover.basis['ba:skill_customerservice'];
  assert.deepEqual([...new Set(basis.flat())], ['none']);
  assert.ok(ROWS.cover.shifts.length, 'and it still has cover to type');
});

// --- the need strip ----------------------------------------------------------

test('the need strip says what each basis is, and never calls a censored hour a target', async () => {
  // `full` runs one register against a queue it cannot serve, so its busy
  // hours came back censored on their own. The scaled case needs a thin
  // weekday, which one registration cannot have beside a measured one, so
  // Wednesday's basis is rewritten to the other value the Python emits.
  const page = await shop('full', row => {
    row.basis['ba:skill_customerservice'][3] =
      row.basis['ba:skill_customerservice'][3].map(() => 'scaled');
  });
  try {
    const reads = await page.evaluate(() =>
      [...document.querySelectorAll('#sp-roster .sp-day[data-d="1"] .sp-need')]
        .map(i => [i.className, i.dataset.read]));
    const censored = reads.find(([cls]) => /sp-cens/.test(cls));
    assert.ok(censored, reads.map(r => r[0]).join('|'));
    assert.match(censored[1], /measured at the ceiling.*floor, not a target/);
    const scaled = await page.locator('#sp-roster .sp-day[data-d="3"] .sp-need').first();
    assert.match(await scaled.getAttribute('class'), /sp-scaled/);
    assert.match(await scaled.getAttribute('data-read'), /scaled from the best measured day/);
  } finally { await page.close(); }
});

test('a measured hour says so, and is the only basis drawn plain', async () => {
  // `pinned` runs both registers, so its busy hours never reach the ceiling
  // and every one of them is a plain measured bar.
  const page = await shop('pinned');
  try {
    const reads = await page.$$eval('#sp-roster .sp-day[data-d="1"] .sp-need',
      els => els.map(i => [i.className, i.dataset.read]));
    assert.ok(reads.length, 'the busy hours are drawn');
    assert.ok(reads.every(([cls]) => !/sp-cens|sp-scaled/.test(cls)), 'none of them is a guess');
    assert.match(reads[0][1], / · measured$/);
    assert.match(reads[0][1], /2 stations/);
  } finally { await page.close(); }
});

test('the need strip stops at the doors, and the shut hours are marked in every lane', async () => {
  // `shut` opens 08-12 and 14-20: the hour in the middle is the doors closed,
  // not trade dipping, and the need curve still carries a number for it.
  const page = await shop('shut');
  try {
    assert.equal(ROWS.shut.need['ba:skill_customerservice'][1][12], 1,
      'the payload does ask for somebody at 12:00');
    const columns = await page.$$eval(mon + '.sp-need',
      els => els.map(e => e.style.gridColumn));
    assert.ok(columns.length, 'the open hours are still drawn');
    assert.ok(!columns.includes('14') && !columns.includes('15'),
      `12:00 and 13:00 are shut: ${columns.join(',')}`);
    // And the lanes say so rather than painting the whole day as trading.
    const shut = await page.$$eval(mon + '.sp-grow:nth-child(2) .sp-closed',
      els => els.map(e => e.style.gridColumn));
    assert.deepEqual(shut, ['2 / 10', '14 / 16', '22 / 26'],
      'before 08:00, 12:00-14:00, and after 20:00');
    assert.ok(await page.locator('#sp-roster .sp-day[data-d="0"] .sp-grow.sp-shut').count() > 0,
      'Sunday is shut all day');
  } finally { await page.close(); }
});

// --- the bars ----------------------------------------------------------------

test('a shift bar wears its kind, its pin and the bench mark', async () => {
  const page = await shop('pinned');
  try {
    const cleaning = page.locator(mon + '.sp-shift.sp-clean').first();
    assert.match(await cleaning.getAttribute('data-read'), /Cleaning station/);
    assert.equal(await page.locator(mon + '.sp-shift.sp-security').count(), 1);
    // PART1 wants a four-day week, so every shift they are given is one the
    // plan placed because of it.
    const part = ROWS.pinned.people.findIndex(p => p.name === 'PART1');
    const bar = page.locator(`${mon}.sp-shift[data-p="${part}"]`);
    assert.equal(await bar.locator('.sp-pin').count(), 1);
    assert.match(await bar.getAttribute('data-read'), /the plan works around it/);
    // BENCH is not this shop's yet, so their bar and a MyEmployees step say so.
    const bench = ROWS.pinned.bench[0].p;
    assert.match(await page.locator(`${mon}.sp-shift[data-p="${bench}"]`).getAttribute('data-read'),
      /from the bench.*assign them here in MyEmployees first/);
    assert.equal(await page.locator(`#sp-roster .sp-step[data-p="${bench}"]`).count(), 1);
  } finally { await page.close(); }
});

test('a line nobody can be given is a dashed hire, and cannot be ticked', async () => {
  const page = await shop('full');
  try {
    const hire = page.locator(mon + '.sp-shift.sp-hire');
    assert.equal(await hire.count(), 1);
    assert.equal(await hire.evaluate(el => el.tagName), 'SPAN', 'nothing to type yet');
    assert.match(await hire.getAttribute('data-read'), /nobody to give it to/);
    assert.equal(await page.locator('#sp-roster .sp-shift.sp-hire').count(), 7);
  } finally { await page.close(); }
});

test('a shift pointing at nobody real is dropped, never drawn as a hire', async () => {
  // `p: 99` means the row cannot be read. Drawing it dashed would tell the
  // player nobody may work an hour somebody probably does.
  const page = await shop('full', row => {
    row.shifts.push({d: 1, s: 0, f: 0, t: 4, p: 99});
  });
  try {
    assert.equal(await page.locator('#sp-roster .sp-shift.sp-hire').count(), 7);
    assert.equal(await page.locator(mon + '.sp-shift[style*="grid-column:2/6"]').count(), 0);
  } finally { await page.close(); }
});


test('the tile, the ring and the card all size the same week', async () => {
  // 42 lines, seven of them waiting on a hire. The tile used to render 42
  // struck through against 42 while the ring beside it counted 35, and the
  // card called that no saving at all.
  const page = await shop('full');
  try {
    const tile = page.locator('#sp-roster .sp-ba > div').first();
    const shown = (await tile.innerText()).replace(/\s+/g, '').trim();
    assert.match(shown, /4235\+7hire/, shown);
    assert.equal(await tile.locator('.sp-v s, .v s').innerText(), '42', 'struck through');
    assert.match(await tile.getAttribute('data-read'),
      /against <b>35<\/b> · 7 more lines the plan wants and has nobody for, waiting on a hire/);
    assert.match(await page.locator('#sp-roster .sp-typed').innerText(), /0 of 35 typed/);
    const badge = await page.evaluate(() => {
      drawOptimizeStaffing();
      return $('optimizeStaffingCard').querySelector('.soon').textContent;
    });
    assert.equal(badge, '\u22127 LINES', '42 scraps become 35 lines and one hire');
  } finally { await page.close(); }
});

test('a shop with nothing to hire names no hiring lines on the tile', async () => {
  const page = await shop('shut');
  try {
    const tile = page.locator('#sp-roster .sp-ba > div').first();
    assert.doesNotMatch(await tile.innerText(), /hire/);
    assert.doesNotMatch(await tile.getAttribute('data-read'), /waiting on a hire/);
  } finally { await page.close(); }
});

test('the progress counts one set of lines, on the first draw and after a tick', async () => {
  // 42 lines, seven of them hiring lines: 35 to type. Counting the ring
  // against one denominator and the words against another put "35 of 42" next
  // to a full ring.
  const page = await shop('full');
  try {
    assert.equal(await page.locator('#sp-roster').getAttribute('data-tickable'), '35');
    assert.match(await page.locator('#sp-roster .sp-typed').innerText(), /0 of 35 typed/);
    const ticked = await page.evaluate(() => {
      $$('#sp-roster button.sp-shift').forEach(b => b.click());
      const ring = q('#sp-roster .sp-ring');
      return [q('#sp-roster .sp-count').textContent,
        q('#sp-roster .sp-typed').textContent, ring.style.getPropertyValue('--p')];
    });
    assert.equal(ticked[0], '35');
    assert.match(ticked[1], /35 of 35 typed/);
    assert.equal(ticked[2], '100');
  } finally { await page.close(); }
});

test('a tick kept from a plan that has changed does not count', async () => {
  const page = await shop('full');
  try {
    const shown = await page.evaluate(key => {
      // Tick a line, then have the planner give it to nobody.
      const r = spRosterRow(key);
      const real = r.shifts.find(s => s.p !== null && s.k === 'security');
      localStorage.setItem('ba_dash_roster:' + key, JSON.stringify([spTickId(r, real)]));
      real.p = null;
      drawSite();
      return [q('#sp-roster .sp-count').textContent,
        q('#sp-roster').dataset.tickable, $$('#sp-roster .sp-shift.sp-done').length];
    }, KEY);
    assert.deepEqual(shown, ['0', '34', 0], 'nothing is marked done, and nothing claims to be');
  } finally { await page.close(); }
});

// --- the rest of the block ---------------------------------------------------

test('a day that is an earlier day again is marked as its copy', async () => {
  const page = await shop('shut');
  try {
    const tabs = await page.$$eval('#sp-roster .sp-daytabs a',
      as => as.map(a => [a.dataset.day, a.querySelector('u') ? 'copy' : 'own', a.dataset.read]));
    const tue = tabs.find(t => t[0] === '2');
    assert.equal(tue[1], 'copy');
    assert.match(tue[2], /the same as Monday, people and all: copy schedule, paste schedule/);
    assert.equal(tabs.find(t => t[0] === '1')[1], 'own');
  } finally { await page.close(); }
});

test('a security locker nobody staffs is shown as new spending, in hours it can price', async () => {
  const page = await shop('full');
  try {
    const guard = page.locator('#sp-roster .sp-hc .sp-new').first();
    assert.match(await guard.innerText(), /\+90 h\/wk/);
    assert.match(await guard.getAttribute('data-read'), /new spending.*nobody covers this locker today/);
    // "Customer Service" and "Cleaning station" are both CS: the codes on the
    // line have to stay apart or the shop looks like it has two of one role.
    const codes = await page.$$eval('#sp-roster .sp-hc .sp-code', cs => cs.map(c => c.textContent));
    assert.equal(new Set(codes).size, codes.length, codes.join(','));
  } finally { await page.close(); }
});

test('a bench member is counted off every role they hold, not just the first', async () => {
  // BENCH holds cleaning and customer service, and `headcount.have` counts
  // them under both. Taking them off under one showed them as somebody
  // already here under the other.
  const page = await shop('full');
  try {
    assert.deepEqual(ROWS.full.bench[0].skills.length, 2);
    const rows = await page.$$eval('#sp-roster .sp-hc > span',
      els => els.filter(e => e.querySelector('.sp-code')).map(e => [
        e.querySelector('.sp-code').textContent,
        e.querySelectorAll('.sp-dot').length,
        e.querySelectorAll('.sp-dot.sp-bench').length]));
    const cleaning = rows.find(r => r[0] === 'CLE');
    const serving = rows.find(r => r[0] === 'CUS');
    assert.deepEqual(cleaning.slice(1), [4, 1], 'have 2, one of them the bench, plus 2 to hire');
    assert.deepEqual(serving.slice(1), [11, 1], 'have 11, one of them the same bench member');
  } finally { await page.close(); }
});

test('only the first few people the plan would leave short are named', async () => {
  const page = await shop('full');
  try {
    const text = await page.locator('#sp-roster .sp-hc').innerText();
    assert.equal(ROWS.full.shortHours.length, 4);
    assert.match(text, /24\/30 h/);
    assert.match(text, /\+1 more/, 'four short, three shown');
    assert.match(text, /PART1\s+0\/4 days/);
  } finally { await page.close(); }
});

test('the now/plan toggle swaps the plan for the fragments the game holds', async () => {
  const page = await shop('full');
  try {
    assert.equal(await page.locator(mon + '.sp-frag').count(), 6, 'six two-hour scraps');
    await page.evaluate(() => q('#sp-roster .sp-nowplan a[data-view="now"]').click());
    assert.match(await page.locator('#sp-roster .sp-gantt').getAttribute('class'), /sp-now/);
    // The tile carries both weeks either way round, and the toggle changes
    // neither: 42 scraps today, struck through, against 35 lines to enter.
    const tile = (await page.locator('#sp-roster .sp-ba > div').first().innerText())
      .replace(/\s+/g, '');
    assert.match(tile, /4235\+7hire/, tile);
    assert.match(await page.locator('#sp-roster .sp-nowplan a.sp-on').innerText(), /now/);
  } finally { await page.close(); }
});

test('hovering a shift lights that person everywhere they are named', async () => {
  const page = await shop('full');
  try {
    const p = ROWS.full.people.findIndex(x => x.name === 'FULL1');
    await page.evaluate(sel => q(sel).dispatchEvent(new MouseEvent('mouseover', {bubbles: true})),
      `#sp-roster .sp-shift[data-p="${p}"]`);
    const lit = await page.$$eval('#sitePanel .sp-me', els => els.map(e => e.className));
    assert.ok(lit.length >= 2, lit.join(' | '));
    assert.ok(lit.some(c => /person/.test(c)), 'the Crew pill too');
  } finally { await page.close(); }
});

test('a name held by two people is not tied to a roster person at all', async () => {
  const page = await shop('full');
  try {
    const both = await page.evaluate(() => {
      D.businesses[0].people = [{name: 'FULL1', role: 'Cashier', absent: false, daily: 200},
        {name: 'FULL1', role: 'Cleaner', absent: false, daily: 200}];
      drawSite();
      return $$('#sp-crew .person[data-p]').length;
    });
    assert.equal(both, 0, 'an ambiguous name lights nobody');
  } finally { await page.close(); }
});

test('a name out of the save is text on the bar, never markup', async () => {
  const page = await shop('full', row => { row.people[3].name = '<script>bad</script>'; });
  try {
    const bar = page.locator('#sp-roster .sp-day[data-d="0"] .sp-shift[data-p="3"]');
    assert.match(await bar.innerText(), /<script>bad<\/script>/);
    assert.equal(await page.locator('#sp-roster script').count(), 0);
  } finally { await page.close(); }
});


// Tick one line, change one thing about it, and see whether the tick follows.
// `edit` is given the row and the line and mutates the plan in place.
async function reticked(edit){
  const page = await shop('full');
  try {
    return await page.evaluate(([key, body]) => {
      const r = spRosterRow(key);
      const line = spTickableRows(r).find(s => s.k === undefined);
      localStorage.setItem('ba_dash_roster:' + key, JSON.stringify([spTickId(r, line)]));
      drawSite();
      const before = $$('#sp-roster .sp-shift.sp-done').length;
      // eslint-disable-next-line no-new-func
      new Function('row', 'line', body)(r, line);
      drawSite();
      return [before, $$('#sp-roster .sp-shift.sp-done').length,
        q('#sp-roster .sp-count').textContent];
    }, [KEY, edit]);
  } finally { await page.close(); }
}

test('a tick does not follow the line to somebody else', async () => {
  // sol's case, halved: the same station at the same hours, handed over.
  assert.deepEqual(await reticked(
    'line.p = row.people.findIndex((_, k) => k !== line.p);'),
    [1, 0, '0'], 'a shift somebody else works is not the shift that was typed');
});

test('a tick does not follow the line to a different length', async () => {
  // The other half: the same person at the same station, kept two hours
  // longer. The id used to be weekday-station-start, so this opened done.
  assert.deepEqual(await reticked('line.t = line.t + 2;'),
    [1, 0, '0'], 'a longer shift is a different line to type');
});

test('a tick does not follow the line to another weekday or another hour', async () => {
  assert.deepEqual(await reticked('line.d = (line.d + 1) % 7;'), [1, 0, '0']);
  assert.deepEqual(await reticked('line.f = line.f + 1;'), [1, 0, '0']);
});

test('a tick survives the people table being renumbered', async () => {
  // Hiring one more cashier renumbers everybody after them. The line the
  // player typed has not changed, so neither has its tick.
  assert.deepEqual(await reticked(`
    row.people.unshift({id: 'newhire', name: 'AARON NEW'});
    row.shifts.forEach(s => { if(s.p !== null) s.p += 1; });
    row.bench.forEach(b => { b.p += 1; });
    row.shortHours.forEach(x => { x.p += 1; });
    row.shortDays.forEach(x => { x.p += 1; });
  `), [1, 1, '1'], 'the same line is still ticked');
});

test('a tick survives the stations table being renumbered', async () => {
  // And buying one more register moves every station index after it.
  assert.deepEqual(await reticked(`
    row.stations.unshift({id: 'newpost', name: 'Cash register',
      skill: 'ba:skill_customerservice', rate: 20});
    row.shifts.forEach(s => { s.s += 1; });
    row.current.list.forEach(s => { s.s += 1; });
    row.roles.forEach(x => { x.stations = x.stations.map(k => k + 1); });
  `), [1, 1, '1'], 'the same line is still ticked');
});


test('two different lines never share one tick', async () => {
  // A joined id is ambiguous about where one part ends: an item whose id
  // happens to contain the separator can produce the same text as a different
  // line, and ticking one would tick the other on the next draw.
  const page = await shop('full', row => {
    row.stations[0].id = 'x|8';
    row.stations[1].id = 'x';
    row.people[0].id = 'y';
    row.people[1].id = '10|y';
  });
  try {
    const ids = await page.evaluate(key => {
      const r = spRosterRow(key);
      return [spTickId(r, {d: 1, s: 0, f: 9, t: 10, p: 0}),
        spTickId(r, {d: 1, s: 1, f: 8, t: 9, p: 1})];
    }, KEY);
    assert.notEqual(ids[0], ids[1], ids.join(' === '));
    // And the page agrees: ticking one line leaves the other alone.
    const marked = await page.evaluate(() => {
      const bars = $$('#sp-roster button.sp-shift');
      bars[0].click();
      drawSite();
      return $$('#sp-roster .sp-shift.sp-done').length;
    });
    assert.equal(marked, 1);
  } finally { await page.close(); }
});

test('a line whose station or person the save does not name cannot be ticked', async () => {
  // Two of those would share one empty id. The bars still show, because the
  // hours are real and worth typing; they just carry no tick.
  for(const [what, edit] of [
    ['station', row => { row.stations[0].id = null; }],
    ['person', row => { row.people[3].id = ''; }],
  ]){
    const page = await shop('full', edit);
    try {
      const state = await page.evaluate(() => {
        const sec = q('#sp-roster');
        const drawn = $$('.sp-shift', sec).length;
        const ticky = $$('button.sp-shift', sec).length;
        return [drawn, ticky, +sec.dataset.tickable,
          q('.sp-typed', sec).textContent.replace(/\s+/g, ' ').trim(),
          q('.sp-ba > div', sec).innerText.replace(/\s+/g, ''),
          JSON.stringify(spRosterCounts(D.staffing[0]))];
      });
      const [drawn, ticky, tickable, typed, tile, counts] = state;
      assert.ok(drawn > ticky, `${what}: every bar is still drawn`);
      assert.equal(ticky, tickable, `${what}: the ring counts the buttons`);
      assert.match(typed, new RegExp(`0 of ${tickable} typed`), what);
      assert.ok(tile.includes(tickable + '+7hire'), `${what}: ${tile}`);
      assert.equal(JSON.parse(counts).tickable, tickable, what);
      assert.equal(JSON.parse(counts).hire, 7, `${what}: the hires are unchanged`);
      // And the card sizes the same week the block does.
      const badge = await page.evaluate(() => {
        drawOptimizeStaffing();
        return $('optimizeStaffingCard').querySelector('.soon').textContent;
      });
      assert.equal(badge, `\u2212${42 - tickable} LINES`, what);
      assert.match(
        await page.locator('#sp-roster .sp-shift:not(button):not(.sp-hire)')
          .first().getAttribute('data-read'),
        /no id to tick against/);
    } finally { await page.close(); }
  }
});


test('a tick is kept per site and survives the next draw', async () => {
  const page = await shop('full');
  try {
    const first = mon + 'button.sp-shift';
    const bar = page.locator(first).first();
    await page.evaluate(s => q(s).click(), first);
    assert.match(await bar.getAttribute('class'), /sp-done/);
    assert.equal(await page.locator('#sp-roster .sp-count').innerText(), '1');
    const stored = await page.evaluate(k => localStorage.getItem('ba_dash_roster:' + k), KEY);
    assert.match(stored, /\[1,/, 'the weekday, then the station and person by id');
    await page.evaluate(() => drawSite());
    assert.match(await bar.getAttribute('class'), /sp-done/, 'the tick came back');
    await page.evaluate(() => q('#sp-roster .sp-clear').click());
    assert.equal(await page.locator('#sp-roster .sp-shift.sp-done').count(), 0);
    assert.equal(await page.evaluate(k => localStorage.getItem('ba_dash_roster:' + k), KEY), null);
  } finally { await page.close(); }
});

test('the block draws and ticks without storage of any kind', async () => {
  // The single case the try/catch is for: a browser that throws on every
  // localStorage access. The plan is still there and still clickable.
  const page = await shop('full', null, () => {
    Object.defineProperty(window, 'localStorage',
      {get(){ throw new Error('site data blocked'); }});
  });
  try {
    assert.equal(await page.locator('#sp-roster button.sp-shift').count(), 35);
    await page.evaluate(s => q(s).click(), mon + 'button.sp-shift');
    assert.equal(await page.locator('#sp-roster .sp-count').innerText(), '1');
  } finally { await page.close(); }
});

// --- the states the payload can be in ---------------------------------------

test('an unmeasured shop with cover to type gets the whole block, not the empty state', async () => {
  const page = await shop('cover');
  try {
    assert.equal(await page.locator('#sp-roster button.sp-shift').count(), 14);
    assert.equal(await page.locator('#sp-roster .sp-daytabs a').count(), 7);
    assert.equal(await page.locator('#sp-roster .sp-nowplan a').count(), 2);
    assert.equal(await page.locator('#sp-roster .sp-read.sp-readout').innerText(), 'Hover a shift');
    // Two more cleaners to hire, and no locker here, so nothing is marked as
    // new spending: the hiring line is the only thing the cover week needs.
    assert.match(await page.locator('#sp-roster .sp-hc').innerText(), /hire 2/);
    assert.equal(await page.locator('#sp-roster .sp-hc .sp-new').count(), 0);
  } finally { await page.close(); }
});

test('an unmeasured need strip is empty and says so in two words, inventing no number', async () => {
  const page = await shop('cover');
  try {
    assert.equal(await page.locator('#sp-roster .sp-need').count(), 0, 'no bar is a guess');
    assert.equal(await page.locator('#sp-roster .sp-grow.sp-needrow.sp-unmeas').count(), 7);
    const chip = page.locator('#sp-roster .sp-hchip.sp-unmeas');
    assert.equal(await chip.innerText(), 'Not measured');
    assert.match(await chip.getAttribute('data-tip'), /two weeks of hour reports/);
    assert.equal(await page.locator(mon + '.sp-grow').count(), 4, 'the strip and three stations');
    assert.equal(await page.locator(mon + '.sp-grow:nth-child(2) .sp-shift').count(), 0);
    // _staffing() writes 0 alongside every `none`, so this cannot arrive from a
    // save; the strip refuses a number it has no basis for even so, because a
    // drawn bar is a claim the shop was measured.
    const drawn = await page.evaluate(() => {
      D.staffing[0].need['ba:skill_customerservice'] =
        Array.from({length: 7}, () => Array(24).fill(3));
      drawSite();
      return $$('#sp-roster .sp-need').length;
    });
    assert.equal(drawn, 0);
  } finally { await page.close(); }
});

test('a shop with nothing at all to roster gets the empty state', async () => {
  const page = await shop('cover', row => { row.shifts = []; });
  try {
    assert.equal(await page.locator('#sp-roster .sp-shift').count(), 0);
    assert.equal(await page.locator('#sp-roster .sp-read').innerText(), 'Nothing to roster');
    assert.equal(await page.locator('#sp-roster .sp-daytabs').count(), 0);
    assert.match(await page.locator('#sp-roster .sechead .why').getAttribute('data-tip'),
      /arrival ceiling over-predicts a shop like this fourfold/);
    assert.equal(await page.locator('#sp-roster .sp-gantt .sp-grow').count(), 3,
      'the stations are still named');
  } finally { await page.close(); }
});

test('a site the planner could not plan says so rather than leaving a hole', async () => {
  const page = await shop('full');
  try {
    await page.evaluate(k => {
      D.staffing = [{key: k, name: 'HART. Test 12', typeSlug: 'x', failed: true}];
      drawSite();
    }, KEY);
    assert.equal(await page.locator('#sp-roster .sp-read').innerText(), 'Plan unavailable');
    assert.match(await page.locator('#sp-roster .sechead .why').getAttribute('data-tip'),
      /could not be read.*Nothing else on the board is affected/);
  } finally { await page.close(); }
});

test('a shop with no row at all draws the block and throws nothing', async () => {
  const page = await shop('full');
  try {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => { D.staffing = []; drawSite(); });
    assert.equal(await page.locator('#sp-roster').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a row of nothing but edges still draws, and opens on a day', async () => {
  const page = await shop('full');
  try {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const tabs = await page.evaluate(() => {
      const r = D.staffing[0];
      // Every row unreadable, so nothing is drawn anywhere: the tabs still
      // have to open on a day rather than on none of them.
      Object.assign(r, {
        shifts: [{d: 9, s: 0, f: 0, t: 4, p: 0}, {d: 1, s: -1, f: 0, t: 4, p: 99}],
        open: Array.from({length: 7}, () => []),
        current: {shifts: 0, fragments: 0, cleaning: 0, security: 0, list: []},
      });
      drawSite();
      return [$$('#sp-roster .sp-daytabs a.sp-on').length, $$('#sp-roster .sp-day.sp-on').length];
    });
    assert.deepEqual(tabs, [1, 1]);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('forty stations and sixty people draw without falling over', async () => {
  const page = await shop('full');
  try {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const rows = await page.evaluate(() => {
      const r = D.staffing[0];
      r.stations = Array.from({length: 40}, (_, k) => (
        {id: 's' + k, name: 'Cash register', skill: 'ba:skill_customerservice', rate: 30}));
      r.people = Array.from({length: 60}, (_, k) => ({id: 'p' + k, name: 'Person ' + k}));
      r.roles = [{skill: 'ba:skill_customerservice', label: 'Customer Service',
        stations: r.stations.map((_, k) => k)}];
      r.shifts = r.stations.map((_, s) => ({d: 1, s, f: 8, t: 20, p: s % 60}));
      drawSite();
      return $$('#sp-roster .sp-day[data-d="1"] .sp-grow').length;
    });
    assert.equal(rows, 41, 'the need strip and forty stations');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

// --- the Next moves card ----------------------------------------------------

test('the Optimize staffing card opens the roster with most typing to save', async () => {
  const page = await shop('full');
  try {
    const shown = await page.evaluate(() => {
      const base = D.staffing[0];
      D.staffing = [
        Object.assign({}, base, {key: 'a', name: 'Small saving',
          current: Object.assign({}, base.current, {shifts: 45})}),
        Object.assign({}, base, {key: 'b', name: 'Big saving',
          current: Object.assign({}, base.current, {shifts: 200})}),
        Object.assign({}, base, {key: 'c', name: 'Cannot be planned', failed: true}),
        Object.assign({}, base, {key: 'd', name: 'Nothing planned', shifts: []}),
      ];
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return [card.querySelector('.soon').textContent, card.lastElementChild.textContent, card.dataset.site];
    });
    assert.equal(shown[0], '−165 LINES');
    assert.match(shown[1], /Big saving: 200 shifts become 35\./);
    assert.equal(shown[2], 'b');
  } finally { await page.close(); }
});


test('the card measures a saving in lines to enter, not in lines the plan drew', async () => {
  // grok's pair. A is 100 scraps against 70 lines to enter and 30 posts to
  // hire for; B is 80 against 70 with nobody to hire. Counting the hiring
  // lines in makes A look like no saving at all and sends the player to B,
  // which saves a third as much typing.
  const page = await shop('full');
  try {
    const a = sized('shop-a', {staffed: 70, hire: 30, now: 100});
    const b = sized('shop-b', {staffed: 70, hire: 0, now: 80});
    // The rows are what they claim to be before anything is asserted about
    // the card that reads them.
    for(const [row, hire] of [[a, 30], [b, 0]]){
      assert.equal(row.current.shifts, row.current.list.length);
      assert.equal(row.shifts.filter(s => s.p === null).length, hire);
      assert.equal(row.shifts.filter(s => s.p !== null).length, 70);
      // No line may be another line over again: a duplicate would be one tick
      // for two rows, which is not a week any planner could write.
      for(const list of [row.shifts, row.current.list]){
        const ids = lineIds(list);
        assert.equal(new Set(ids).size, ids.length,
          `${row.name}: ${ids.length - new Set(ids).size} repeated lines`);
      }
      for(const s of list0(row)) assert.ok(s.t - s.f <= 12 && s.t <= 24 && s.f >= 0, row.name);
    }
    const shown = await page.evaluate(rows => {
      D.staffing = rows;
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return [card.querySelector('.soon').textContent,
        card.lastElementChild.textContent, card.dataset.site,
        JSON.stringify(rows.map(r => spRosterCounts(r).tickable))];
    }, [a, b]);
    assert.equal(shown[3], '[70,70]', 'both plans are 70 lines to enter');
    assert.equal(shown[0], '\u221230 LINES');
    assert.match(shown[1], /shop-a: 100 shifts become 70\./);
    assert.equal(shown[2], 'shop-a', 'not shop-b, which saves ten');
  } finally { await page.close(); }
});


test('the card scores the saving on the lines somebody can be put on', async () => {
  const page = await shop('full');
  try {
    const shown = await page.evaluate(() => {
      // One shop, 42 planned lines, 7 of them waiting on a hire, against 42
      // scraps in the game. The honest saving is 42 to 35.
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return [card.querySelector('.soon').textContent, card.lastElementChild.textContent,
];
    });
    assert.equal(shown[0], '−7 LINES');
    assert.match(shown[1], /42 shifts become 35\./);
    assert.doesNotMatch(shown[1], /become 42/);
  } finally { await page.close(); }
});

test('the card sizes a plan with nothing to save on the same week', async () => {
  const page = await shop('full');
  try {
    const shown = await page.evaluate(() => {
      D.staffing[0].current = {shifts: 0, fragments: 0, cleaning: 0, security: 0, list: []};
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return [card.querySelector('.soon').textContent, card.lastElementChild.textContent];
    });
    assert.equal(shown[0], '35 SHIFTS', 'not 42: seven of those cannot be entered yet');
    assert.match(shown[1], /a week of 35 shifts to enter\./);
  } finally { await page.close(); }
});

test('a player who never opened BizMan is offered the plan, not told they are unmeasured', async () => {
  // An empty in-game schedule saves no lines, but the plan is still the point
  // of the card, and "no shop has been measured long enough" is false twice.
  const page = await shop('full');
  try {
    const shown = await page.evaluate(() => {
      const base = D.staffing[0];
      const empty = {shifts: 0, fragments: 0, cleaning: 0, security: 0, list: []};
      D.staffing = [
        Object.assign({}, base, {key: 'a', name: 'Small shop', current: empty,
          shifts: base.shifts.slice(0, 10)}),
        Object.assign({}, base, {key: 'b', name: 'Big shop', current: empty}),
      ];
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return [card.querySelector('.soon').textContent, card.lastElementChild.textContent, card.dataset.site];
    });
    assert.equal(shown[0], '35 SHIFTS');
    assert.match(shown[1], /Big shop: a week of 35 shifts to enter\./);
    assert.doesNotMatch(shown[1], /measured/);
    assert.equal(shown[2], 'b');
  } finally { await page.close(); }
});

test('a card with nothing to open stops pointing at the site it used to', async () => {
  const page = await shop('full');
  try {
    const shown = await page.evaluate(() => {
      drawOptimizeStaffing();
      const was = $('optimizeStaffingCard').dataset.site;
      // A live reload onto a save whose only shop cannot be planned.
      D.staffing = [{key: 'x', name: 'Broken', typeSlug: 'y', failed: true}];
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return [was, card.querySelector('.soon').textContent, card.dataset.site];
    });
    assert.equal(shown[0], KEY);
    assert.equal(shown[1], 'NO PLAN');
    assert.equal(shown[2], undefined, 'and it no longer opens the old site');
  } finally { await page.close(); }
});

test('the card says nothing it cannot know before the payload carries a plan', async () => {
  const page = await shop('full');
  try {
    const shown = await page.evaluate(() => {
      delete D.staffing;
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return [card.querySelector('.soon').textContent, card.dataset.site];
    });
    assert.equal(shown[0], 'SOON');
    assert.equal(shown[1], undefined);
  } finally { await page.close(); }
});
