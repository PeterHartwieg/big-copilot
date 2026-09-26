// The Roster block on a shop's page: the week the board would type into BizMan,
// drawn from the `staffing` payload key.
//
// Nothing here invents a payload. Every row comes out of the real planner:
// tests/roster_fixture.py builds eight synthetic saves and runs `_staffing()`
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
    address: '12 Second Avenue', neighbourhood: 'ba:neighborhood_hellskitchen',
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
  require('./_payload_contract.cjs').assertPayloadShape(await page.evaluate(() => D), 'roster');
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
  // Nobody may be given more than full time's 50 hours, so one guard covers
  // four of the locker's seven days and the other ten twelve-hour lines are
  // hires. The cleaning station has two people on it -- CLEAN1 and the bench
  // member -- so eight of its days are covered and six lines are hires.
  assert.equal(open.length, 16, 'the cover nobody left here may work');
  assert.deepEqual(
    [open.filter(s => s.k === 'security').length, open.filter(s => s.k === 'clean').length],
    [10, 6]);
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
    // Filling one person's week before starting the next keeps most of the
    // week identical -- Tuesday to Friday are Monday again -- and only the
    // tail differs, where the first people run out of hours.
    assert.deepEqual(same.slice(2), [1, 1, 1, 1, null]);
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
    // `nowCover` is the cleaning and security part of what is in the game:
    // nothing here, because this shop's scraps are all on the registers, and
    // so none of them is a cover fragment either.
    assert.deepEqual(counts, {plan: 42, tickable: 26, staffed: 26, hire: 16,
      now: 42, nowCover: 0, fragments: 42, coverFragments: 0});
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

test('a day the doors never open says so rather than reporting a measurement', async () => {
  const page = await shop('shut');
  try {
    // Sunday is shut, not measured at nothing: the strip has no cell and its
    // label says which of the two it is.
    const sun = page.locator('#sp-roster .sp-day[data-d="0"] .sp-needrow');
    assert.equal(await sun.locator('.sp-need').count(), 0);
    assert.equal(await sun.locator('.lab').getAttribute('data-read'),
      'The doors do not open on Sunday');
  } finally { await page.close(); }
});

test('the need strip stops at the doors, and the shut hours are marked in every lane', async () => {
  // `shut` opens 08-12 and 14-20: the hour in the middle is the doors closed,
  // not trade dipping. The planner counts it as no customers, since the game
  // files no report for it; a need carried there anyway must still not draw.
  const page = await shop('shut', row => {
    row.need['ba:skill_customerservice'][1][12] = 1;
    row.basis['ba:skill_customerservice'][1][12] = 'measured';
  });
  try {
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
    // One step names everybody to add first, the bench member among them.
    const add = page.locator('#sp-roster .sp-step.sp-add');
    assert.equal(await add.locator(`[data-p="${bench}"]`).count(), 1);
    assert.match(await add.innerText(), /assign BENCH \(unassigned\)/);
  } finally { await page.close(); }
});

test('a line nobody can be given is a dashed anticipated hire, and cannot be ticked', async () => {
  const page = await shop('full');
  try {
    const hire = page.locator(mon + '.sp-shift.sp-hire');
    assert.equal(await hire.count(), 1);
    assert.equal(await hire.evaluate(el => el.tagName), 'SPAN', 'nothing to type yet');
    // It is part of the week, drawn in its own hours, and carries no name
    // because there is nobody on it yet.
    assert.match(await hire.innerText(), /^to hire/);
    assert.match(await hire.getAttribute('data-read'), /nobody to work it/);
    assert.match(await hire.getAttribute('data-read'), /no one here can take them/);
    assert.equal(await page.locator('#sp-roster .sp-shift.sp-hire').count(), 16);
  } finally { await page.close(); }
});

test('a shift pointing at nobody real is dropped, never drawn as a hire', async () => {
  // `p: 99` means the row cannot be read. Drawing it dashed would tell the
  // player nobody may work an hour somebody probably does.
  const page = await shop('full', row => {
    row.shifts.push({d: 1, s: 0, f: 0, t: 4, p: 99});
  });
  try {
    assert.equal(await page.locator('#sp-roster .sp-shift.sp-hire').count(), 16);
    assert.equal(await page.locator(mon + '.sp-shift[style*="grid-column:2/6"]').count(), 0);
  } finally { await page.close(); }
});


test('the tile, the ring and the card all size the same week', async () => {
  // 42 lines, sixteen of them waiting on a hire. The tile used to render 42
  // struck through against 42 while the ring beside it counted the lines
  // somebody can be put on, and the card called that no saving at all.
  const page = await shop('full');
  try {
    const tile = page.locator('#sp-roster .sp-ba > div').first();
    // The hours are the week; the blocks beside them are the dragging.
    const hours = await page.evaluate(() => {
      const row = D.staffing[0], drawn = row.shifts.filter(s => spDrawn(row, s));
      const on = s => s.p !== null && s.p !== undefined;
      return [spHoursOf(row.current.list), spHoursOf(drawn.filter(on)),
              spHoursOf(drawn.filter(s => !on(s)))];
    });
    const shown = (await tile.innerText()).replace(/\s+/g, '').trim();
    const posts = await page.evaluate(() => spPlanPosts(D.staffing[0]));
    assert.ok(shown.includes(`${hours[0]}h${hours[1]}h4226entries`), shown);
    assert.ok(shown.endsWith(`+${posts}tohire`), shown);
    assert.equal(await tile.locator('.sp-v s, .v s').first().innerText(),
      `${hours[0]} h`, 'struck through');
    assert.match(await tile.getAttribute('data-read'), new RegExp(
      `<b>${hours[1]} h</b> in 26 entries, against <b>${hours[0]} h</b> in 42 entries today`));
    assert.match(await tile.getAttribute('data-read'), new RegExp(
      `${posts} people to hire for the 16 entries drawn without a name, at 30 hours a week or more each`));
    assert.match(await page.locator('#sp-roster .sp-typed').innerText(), /0 of 26 copied/);
    const badge = await page.evaluate(() => {
      drawOptimizeStaffing();
      return $('optimizeStaffingCard').querySelector('.soon').textContent;
    });
    assert.equal(badge, '\u221216 ENTRIES', '42 scraps become 26 entries and the hires');
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
  // 42 lines, sixteen of them hiring lines: 26 to type. Counting the ring
  // against one denominator and the words against another put "26 of 42" next
  // to a full ring.
  const page = await shop('full');
  try {
    assert.equal(await page.locator('#sp-roster').getAttribute('data-tickable'), '26');
    assert.match(await page.locator('#sp-roster .sp-typed').innerText(), /0 of 26 copied/);
    const ticked = await page.evaluate(() => {
      $$('#sp-roster button.sp-shift').forEach(b => b.click());
      const ring = q('#sp-roster .sp-ring');
      return [q('#sp-roster .sp-count').textContent,
        q('#sp-roster .sp-typed').textContent, ring.style.getPropertyValue('--p')];
    });
    assert.equal(ticked[0], '26');
    assert.match(ticked[1], /26 of 26 copied/);
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
    assert.deepEqual(shown, ['0', '25', 0], 'nothing is marked done, and nothing claims to be');
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
    assert.match(await guard.getAttribute('data-read'), /new wages.*nobody covers this locker today/);
    // "Customer Service" and "Cleaning station" are both CS: the codes on the
    // line have to stay apart or the shop looks like it has two of one role.
    const codes = await page.$$eval('#sp-roster .sp-hc .sp-code', cs => cs.map(c => c.textContent));
    assert.equal(new Set(codes).size, codes.length, codes.join(','));
  } finally { await page.close(); }
});

test('a bench member is counted off every role they hold, not just the first', async () => {
  // BENCH holds cleaning and security, and `headcount.have` counts them under
  // both. Taking them off under one showed them as somebody already here under
  // the other. (Not customer service: a customer service employee is never put
  // on a cleaning station, so that pair is no longer two usable roles.)
  const page = await shop('full');
  try {
    assert.deepEqual(ROWS.full.bench[0].skills.length, 2);
    const rows = await page.$$eval('#sp-roster .sp-hc > span',
      els => els.filter(e => e.querySelector('.sp-code')).map(e => [
        e.querySelector('.sp-code').textContent,
        e.querySelectorAll('.sp-dot').length,
        e.querySelectorAll('.sp-dot.sp-bench').length]));
    const cleaning = rows.find(r => r[0] === 'CLE');
    // 'Cleaning station' and 'Customer Service' both code to CS, so those two
    // take the three-letter fallback; the locker keeps its initials.
    const security = rows.find(r => r[0] === 'SG');
    assert.deepEqual(cleaning.slice(1), [4, 1], 'have 2, one of them the bench, plus 2 to hire');
    assert.deepEqual(security.slice(1), [5, 1], 'have 2, the same bench member, plus 3 to hire');
  } finally { await page.close(); }
});

test('only the first few people the plan would leave short are named', async () => {
  const page = await shop('full');
  try {
    const text = await page.locator('#sp-roster .sp-hc').innerText();
    // Two counters hold 168 hours, which is four full weeks: the full-timers
    // left over get nothing here rather than a share of somebody else's week,
    // because none of them can make the rest up at another shop. Five of them
    // is more than the three the line has room for.
    assert.equal(ROWS.full.shortHours.length, 5);
    assert.match(text, /0\/30 h/);
    assert.match(text, /9 spare/, 'and the role counts them all');
    assert.match(text, /\+2 more/, 'five short, three named');
  } finally { await page.close(); }
});

test('a day count the plan cannot meet is named the same way', async () => {
  // The planner meets the `full` row's four-day demand, so the days chip is
  // drawn from a row that says one went unmet: the block's job is to draw the
  // payload it is handed, whichever way the plan fell.
  const page = await shop('full', row => {
    row.shortDays = [{p: 1, days: 3, want: 4}];
  });
  try {
    const text = await page.locator('#sp-roster .sp-hc').innerText();
    assert.match(text, /3\/4 days/);
    const read = await page.locator('#sp-roster .sp-hc .sp-new[data-p="1"]').getAttribute('data-read');
    assert.match(read, /the game counts exactly that/);
    assert.doesNotMatch(read, /no days/, 'three days is not none');
  } finally { await page.close(); }
});

test('the now/plan toggle swaps the plan for the fragments the game holds', async () => {
  const page = await shop('full');
  try {
    assert.equal(await page.locator(mon + '.sp-frag').count(), 6, 'six two-hour scraps');
    await page.evaluate(() => q('#sp-roster .sp-nowplan a[data-view="now"]').click());
    assert.match(await page.locator('#sp-roster .sp-gantt').getAttribute('class'), /sp-now/);
    // The tile carries both weeks either way round, and the toggle changes
    // neither: 42 blocks today, struck through, against 26 to drag in.
    const tile = (await page.locator('#sp-roster .sp-ba > div').first().innerText())
      .replace(/\s+/g, '');
    assert.ok(tile.includes('4226entries'), tile);
    assert.match(await page.locator('#sp-roster .sp-nowplan a.sp-on').innerText(), /now/);
  } finally { await page.close(); }
});

// The two segmented controls stretch to the height of the steps beside them,
// and the step naming who to add runs to two lines. Their labels stood at the
// top of the stretched pills: every one of them sits in its pill's middle.
test('the now/plan and day tabs centre their labels beside a two-line step', async () => {
  const page = await shop('pinned');
  try {
    // Laid out, not just drawn: the page the panel lives on is shown.
    await page.evaluate(() => { showPage('company'); drawSite(); });
    const pills = await page.$$eval('#sp-roster .sp-nowplan a, #sp-roster .sp-daytabs a', els => els.map(a => {
      const box = a.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(a.lastChild);
      const text = range.getBoundingClientRect();
      return {label: a.textContent, on: a.classList.contains('sp-on'), height: box.height,
              shown: box.height > 0, off: (text.top + text.height / 2) - (box.top + box.height / 2)};
    }).filter(p => p.shown));
    const step = await page.locator('#sp-roster .sp-step.sp-add').evaluate(el => el.getBoundingClientRect().height);
    assert.ok(step > 40, `the add step runs to two lines (${step}px)`);
    assert.ok(pills.some(p => p.height > 36), 'the pills beside it are stretched past their own height');
    for (const p of pills) assert.ok(Math.abs(p.off) <= 1, `${p.label} sits ${p.off.toFixed(1)}px off its pill's middle`);
    assert.deepEqual(pills.filter(p => p.on).map(p => p.label), ['plan', 'MON']);
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
  // Whoever the fixture happens to put on Sunday: a hard-coded index moves
  // the moment the fixture's crew changes, and the test then waits for a bar
  // that was never drawn.
  const who = ROWS.full.shifts.find(s => s.d === 0 && s.p !== null).p;
  const page = await shop('full', row => { row.people[who].name = '<script>bad</script>'; });
  try {
    const bar = page.locator(`#sp-roster .sp-day[data-d="0"] .sp-shift[data-p="${who}"]`);
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
      const staffed = JSON.parse(counts).staffed;
      assert.ok(drawn > ticky, `${what}: every bar is still drawn`);
      assert.equal(ticky, tickable, `${what}: the ring counts the buttons`);
      assert.match(typed, new RegExp(`0 of ${tickable} copied`), what);
      /* The week is the lines with somebody on them; the ring is the narrower
         set the board can mark, and the line beside it says so. */
      assert.ok(staffed > tickable, `${what}: a line to type that cannot be ticked`);
      assert.ok(tile.includes('42' + staffed + 'entries'), `${what}: ${tile}`);
      assert.equal(JSON.parse(counts).hire, 16, `${what}: the hires are unchanged`);
      assert.match(await page.locator('#sp-roster .sp-typed').getAttribute('data-read'),
        new RegExp(`The ring counts the ${tickable} entries the board can mark`), what);
      // And the card sizes the same week the block does.
      const badge = await page.evaluate(() => {
        drawOptimizeStaffing();
        return $('optimizeStaffingCard').querySelector('.soon').textContent;
      });
      assert.equal(badge, `\u2212${42 - staffed} ENTRIES`, what);
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
    assert.equal(await page.locator('#sp-roster button.sp-shift').count(), 26);
    await page.evaluate(s => q(s).click(), mon + 'button.sp-shift');
    assert.equal(await page.locator('#sp-roster .sp-count').innerText(), '1');
  } finally { await page.close(); }
});

// --- the states the payload can be in ---------------------------------------

test('an unmeasured shop with cover to type gets the whole block, not the empty state', async () => {
  const page = await shop('cover');
  try {
    // Two cleaners, four days each: eight lines to type and six to hire for,
    // because a 24-hour cleaning station is 168 hours and nobody is given more
    // than 50 of them.
    assert.equal(await page.locator('#sp-roster button.sp-shift').count(), 8);
    assert.equal(await page.locator('#sp-roster .sp-daytabs a').count(), 7);
    assert.equal(await page.locator('#sp-roster .sp-nowplan a').count(), 2);
    // Before an entry is pointed at, the line reads out what the week asks for.
    assert.equal(await page.locator('#sp-roster .sp-read.sp-readout').innerText(),
      'Cover · 96 h to set in 8 entries · 2 to hire');
    // Two more cleaners to hire, and no locker here, so nothing is marked as
    // new spending: the hiring line is the only thing the cover week needs.
    assert.match(await page.locator('#sp-roster .sp-hc').innerText(), /hire 2/);
    assert.equal(await page.locator('#sp-roster .sp-hc .sp-new').count(), 0);
  } finally { await page.close(); }
});

test('an unmeasured need strip is empty, and the note above it says why', async () => {
  const page = await shop('cover');
  try {
    assert.equal(await page.locator('#sp-roster .sp-need').count(), 0, 'no bar is a guess');
    assert.equal(await page.locator('#sp-roster .sp-grow.sp-needrow.sp-unmeas').count(), 7);
    const note = page.locator('#sp-roster .sp-note');
    assert.equal(await note.count(), 1);
    assert.match(await note.innerText(), /New shop/);
    assert.match(await note.innerText(), /cleaning and security cover only/);
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

test('a shop with nothing at all to schedule gets the empty state', async () => {
  const page = await shop('cover', row => { row.shifts = []; });
  try {
    assert.equal(await page.locator('#sp-roster .sp-shift').count(), 0);
    assert.equal(await page.locator('#sp-roster .sp-read').innerText(), 'Nothing to schedule');
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

// --- a shop with no hours of its own ----------------------------------------
// The state the whole feature is most easily wrong in: the plan is cleaning and
// security cover, the serving shifts in the game are not in it, and every
// number and instruction on the block has to know the difference.

test('the note says how new the shop is, what the plan covers, and what not to clear', async () => {
  const page = await shop('fresh');
  try {
    const note = page.locator('#sp-roster .sp-note');
    const text = await note.innerText();
    assert.match(text, /New shop/);
    // Straight out of the planner: opened five days ago, and not one hour
    // report filed yet.
    assert.match(text, /Open 5 days, no hour reports on file/);
    assert.match(text, /arrives 9 days after its first customer, closed days included \(Demand data: 0 of 9 days\)/);
    assert.match(text, /Demand data: 0 of 9 days\. Until then the plan is cleaning and security only/);
    assert.match(text, /2 reports of that same weekday/);
    assert.match(text, /cleaning and security cover only/);
    // 56 shifts in the game, 28 of them cleaning: the other 28 are the ones
    // nothing here can put back.
    assert.match(text, /Do not clear the whole schedule/);
    assert.match(text, /28 serving entries/);
    assert.equal(await page.locator('#sp-roster .sp-note.sp-care').count(), 1);
    const steps = await page.locator('#sp-roster .sp-step').evaluateAll(
      b => b.map(x => x.innerText.replace(/\s+/g, ' ')));
    // Hiring first, because a shift cannot be entered for somebody who has not
    // been hired, and there is a schedule here to lose in the meantime.
    assert.match(steps[0], /^Add 1 person to fill this plan: hire 1 Security Guard/);
    assert.match(steps[1], /^Clear the cleaning and security hours/);
    assert.match(steps[1], /leave the rest$/);
  } finally { await page.close(); }
});

test('a new shop draws its fortnight off the hour grid, and nothing without one', async () => {
  const page = await shop('fresh');
  try {
    // The harness hands the page no hour grid, so the note counts in words alone.
    assert.equal(await page.locator('#sp-roster .sp-wk').count(), 0);
    const drawn = await page.evaluate(() => {
      // Sunday first, as the grid keeps them: Monday read, Tuesday half way.
      D.hours = [{key: D.staffing[0].key, weeks: [0, 2, 1, 0, 0, 0, 0]}];
      // The block alone: a grid of nothing but `weeks` is not one the Hours
      // block above it could draw.
      const box = document.createElement('div');
      box.innerHTML = spRosterBlock(D.businesses[0]);
      return {
        days: $$('.sp-wk > span', box).map(d => [d.className, $$('i.on', d).length]),
        words: q('.sp-wk', box).dataset.tip,
      };
    });
    assert.deepEqual(drawn.days.slice(0, 2), [['full', 2], ['', 1]]);
    assert.deepEqual(drawn.days.slice(2), Array(5).fill(['', 0]));
    assert.match(drawn.words, /^1 of 7 weekdays at 2 reports/);
    // The warning is its own row, not the tail of a paragraph.
    assert.match(await page.locator('#sp-roster .sp-nwarn').innerText(), /^Do not clear the whole schedule/);
  } finally { await page.close(); }
});

test('with nothing scheduled yet the note says there is nothing to lose', async () => {
  const page = await shop('cover');
  try {
    const text = await page.locator('#sp-roster .sp-note').innerText();
    assert.match(text, /nothing to lose by clearing/);
    assert.doesNotMatch(text, /Do not clear/);
    assert.equal(await page.locator('#sp-roster .sp-note.sp-care').count(), 0);
    assert.match(await page.locator('#sp-roster .sp-step').first().innerText(),
      /^Clear entire schedule/);
  } finally { await page.close(); }
});

test('a schedule of nothing but cover can be cleared, and the note says so', async () => {
  const page = await shop('fresh', row => {
    // The same shop with its register scraps never typed: everything in the
    // game here is cleaning, which this plan does replace.
    row.current.list = row.current.list.filter(s => s.k);
    row.current.shifts = row.current.list.length;
  });
  try {
    const text = await page.locator('#sp-roster .sp-note').innerText();
    assert.match(text, /clearing it loses nothing this week does not put back/);
    assert.doesNotMatch(text, /Nothing is scheduled here yet/);
    assert.doesNotMatch(text, /Do not clear/);
  } finally { await page.close(); }
});

test('a measured shop whose hours ask for nobody is still a cover-only plan', async () => {
  const page = await shop('quiet');
  try {
    // Two weeks of reports, every hour of them zero customers: the basis is
    // `measured` throughout, and the planner still cuts no serving shift.
    const state = await page.evaluate(() => ({
      measured: spRosterMeasured(D.staffing[0]),
      cover: spCoverOnly(D.staffing[0]),
      serving: D.staffing[0].shifts.filter(s => !s.k).length,
    }));
    assert.deepEqual(state, {measured: true, cover: true, serving: 0});
    // So the block behaves as it does on a shop with no hours at all: it does
    // not offer to clear a schedule it cannot rebuild.
    const note = page.locator('#sp-roster .sp-note');
    assert.equal(await note.count(), 1);
    assert.match(await note.innerText(), /Cover only/);
    assert.match(await note.innerText(), /ask for nobody on its serving stations/);
    assert.doesNotMatch(await note.innerText(), /days after its first customer/);
    assert.match(await note.innerText(), /Do not clear the whole schedule/);
    const steps = await page.locator('#sp-roster .sp-step').evaluateAll(
      b => b.map(x => x.innerText.replace(/\s+/g, ' ')));
    assert.ok(steps.some(s => /^Clear the cleaning and security hours/.test(s)), steps.join(' | '));
    assert.equal(await page.locator('#sp-roster .sp-ba > div').first()
      .locator('.lab').innerText(), 'Cover hours / week');
    const tabs = await page.locator('#sp-roster .sp-daytabs a')
      .evaluateAll(a => a.map(x => x.dataset.read));
    assert.ok(tabs.some(r => /Copy schedule pastes the whole day/.test(r)));
    assert.ok(!tabs.some(r => /copy schedule, paste schedule/.test(r)));
  } finally { await page.close(); }
});

test('the Today card sizes that shop on its cover shifts, and names the reason', async () => {
  /* Its own hours are covered in the game and its data is complete, so the
     planner would also say to switch; that line comes first on the card, and
     this test is about the line under it. */
  const page = await shop('quiet', row => { row.demandDataComplete = false; });
  try {
    const shown = await page.evaluate(() => {
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return {what: card.querySelector('.what').textContent,
        counts: spRosterCounts(D.staffing[0])};
    });
    const {now, nowCover, tickable} = shown.counts;
    // Half the schedule is serving scraps the plan replaces none of.
    assert.ok(now > nowCover && nowCover > 0);
    assert.match(shown.what, new RegExp(
      `${nowCover} cleaning and security entries become ${tickable}`));
    assert.doesNotMatch(shown.what, new RegExp(`${now} entries become`));
    // And this shop has been measured: it is not waiting for a fortnight it
    // has already had.
    assert.match(shown.what, /its measured hours ask for nobody at the registers/);
    assert.doesNotMatch(shown.what, /wait on the shop\u2019s first measured week/);
  } finally { await page.close(); }
});

test('the waiting chip on that shop does not tell them to wait either', async () => {
  const page = await shop('quiet');
  try {
    const short = await page.evaluate(() => D.staffing[0].shortHours);
    assert.equal(short.length, 1);
    assert.equal(short[0].planned, false, 'a full-time cashier the plan cannot use');
    const hc = page.locator('#sp-roster .sp-hc');
    assert.match(await hc.innerText(), /1 with no week in this plan/);
    assert.doesNotMatch(await hc.innerText(), /first measured week/);
    const reads = await hc.locator('.sp-new').evaluateAll(els => els.map(e => e.dataset.read));
    const group = reads.find(r => /no role it could plan/.test(r)) || "";
    assert.match(group, /ask for nobody on the stations they could work/);
    assert.doesNotMatch(group, /waits on the shop\u2019s first measured one/);
  } finally { await page.close(); }
});

test('a week that is all anticipated hires does not bless clearing the cover there is', async () => {
  const page = await shop('nobody');
  try {
    const counts = await page.evaluate(() => spRosterCounts(D.staffing[0]));
    // Cover in the game, done by the one person the plan may not put on it,
    // and not a line anybody can be entered on.
    assert.equal(counts.tickable, 0);
    assert.ok(counts.hire > 0 && counts.nowCover > 0);
    assert.equal(counts.now, counts.nowCover, 'nothing here but cover');
    const steps = await page.locator('#sp-roster .sp-step').evaluateAll(
      b => b.map(x => x.innerText.replace(/\s+/g, ' ')));
    /* People, not bars: fourteen twelve-hour cleaning shifts are four people,
       and the headcount line below says so. */
    const posts = await page.evaluate(() => Object.values(D.staffing[0].headcount)
      .reduce((n, h) => n + h.hire, 0));
    assert.ok(posts > 0 && posts < counts.hire, `${posts} of ${counts.hire}`);
    assert.match(steps[0], new RegExp(`^Add ${posts} people to fill this plan: hire ${posts} Cleaning`));
    assert.ok(!steps.some(s => /^Clear/.test(s)), steps.join(' | '));
    const note = await page.locator('#sp-roster .sp-note').innerText();
    assert.match(note, /Hire before you clear/);
    assert.doesNotMatch(note, /nothing to lose by clearing/);
    assert.doesNotMatch(note, /loses nothing this week does not put back/);
    // And the tiles offer no saving either, on this shop as on the other.
    assert.equal(await page.locator('#sp-roster .sp-ba > div').first().locator('s').count(), 0);
    assert.equal(await page.locator('#sp-roster .sp-ba > div').nth(1).locator('s').count(), 0);
  } finally { await page.close(); }
});

test('a cover bill the row does not carry is left unsaid, not rendered as NaN', async () => {
  const page = await shop('fresh', row => {
    // A row from a board built before the field existed. It must not fall back
    // to the whole schedule's bill, and it must not print $NaN either.
    delete row.cost.currentCover;
  });
  try {
    const wages = page.locator('#sp-roster .sp-ba > div').nth(1);
    const shown = await wages.locator('.v').innerText();
    assert.doesNotMatch(shown, /NaN/);
    assert.equal(await wages.locator('s').count(), 0, 'nothing to strike through');
    const read = await wages.getAttribute('data-read');
    assert.doesNotMatch(read, /NaN/);
    assert.match(read, /not in this board's figures/);
    assert.doesNotMatch(read, /the same bill either way/);
  } finally { await page.close(); }
});

test('a measured shop gets its name in the heading and no note at all', async () => {
  const page = await shop('full');
  try {
    assert.equal(await page.locator('#sp-roster .sp-note').count(), 0);
    assert.match(await page.locator('#sp-roster .sechead .quiet').innerText(), /HART\. Test 12/,
      'the shop the block is about, at the top of it');
    // What the block is for stays a hover away, on the heading's own note.
    const why = await page.locator('#sp-roster .sechead [data-tip]').getAttribute('data-tip');
    assert.match(why, /BizMan \u203a Schedule/);
    assert.match(why, /change nothing in the save/);
  } finally { await page.close(); }
});

test('the tiles on a cover-only plan compare cover with cover', async () => {
  const page = await shop('fresh');
  try {
    const tiles = page.locator('#sp-roster .sp-ba > div');
    assert.equal(await tiles.nth(0).locator('.lab').innerText(), 'Cover hours / week');
    // 28 cleaning blocks in the game against 12 to drag in, not the 56 the
    // whole schedule holds.
    assert.equal(await tiles.nth(0).locator('.v small s').innerText(), '28');
    const read = await tiles.nth(0).getAttribute('data-read');
    assert.match(read, /^Cleaning and security hours to set for the week/);
    // The scraps counted are the ones on the side the plan replaces: 28
    // cleaning pieces of two hours, not the 56 the whole schedule holds.
    const counts = await page.evaluate(() => spRosterCounts(D.staffing[0]));
    assert.equal(counts.coverFragments, 28);
    assert.equal(counts.fragments, 56);
    assert.match(read, /28 of them two hours long/);
    assert.match(read, /28 serving entries in the game are not in this plan/);
    const wages = await tiles.nth(1).getAttribute('data-read');
    assert.match(wages, /for the cleaning and security hours as they stand/);
    assert.match(wages, /28 serving entries in the game are not in this plan/);
  } finally { await page.close(); }
});

test('a measured shop still compares the whole schedule', async () => {
  const page = await shop('full');
  try {
    const tile = page.locator('#sp-roster .sp-ba > div').first();
    assert.equal(await tile.locator('.lab').innerText(), 'Hours / week');
    const counts = await page.evaluate(() => spRosterCounts(D.staffing[0]));
    assert.equal(await tile.locator('.v small s').innerText(), String(counts.now));
    assert.match(await tile.getAttribute('data-read'), /^Hours to set for the week/);
    assert.doesNotMatch(await tile.getAttribute('data-read'), /not in this plan/);
  } finally { await page.close(); }
});

test('a figure the plan does not change is not struck through against itself', async () => {
  const page = await shop('fresh', row => {
    // The same cover hours re-cut cost the same wages, which is the real case
    // on a busy shop: what the plan saves there is typing, not money.
    row.cost = {weekly: row.cost.currentCover, current: row.cost.current,
      currentCover: row.cost.currentCover};
  });
  try {
    const wages = page.locator('#sp-roster .sp-ba > div').nth(1);
    assert.equal(await wages.locator('s').count(), 0);
    assert.match(await wages.getAttribute('data-read'), /the same bill either way/);
  } finally { await page.close(); }
});

test('two bills that only round to the same figure are not the same bill', async () => {
  const page = await shop('fresh', row => {
    // money() rounds to whole thousands, so both of these read "$2k" and the
    // strike-through goes; the sentence about them must not.
    row.cost = {weekly: 2400, current: row.cost.current, currentCover: 1600};
  });
  try {
    const wages = page.locator('#sp-roster .sp-ba > div').nth(1);
    // Both read "$2k", and the strike-through is still drawn: no strike is how
    // this tile says two figures match, and these do not.
    assert.equal(await wages.locator('s').innerText(), '$2k');
    assert.equal(await wages.locator('.v').innerText(), '$2k$2k');
    assert.doesNotMatch(await wages.getAttribute('data-read'), /the same bill either way/);
    assert.match(await wages.getAttribute('data-read'), /\$1,600/);
    assert.match(await wages.getAttribute('data-read'), /\$2,400/);
  } finally { await page.close(); }
});

test('a cover-only plan does not offer to let the shop\u2019s cashiers go', async () => {
  // Everybody on this shop is full time, so the planner writes both kinds of
  // short week itself: three cashiers with nothing, and the second cleaner
  // with what was left of the cover.
  const page = await shop('fresh');
  try {
    const hc = page.locator('#sp-roster .sp-hc');
    const text = await hc.innerText();
    const short = await page.evaluate(() => D.staffing[0].shortHours);
    assert.equal(short.filter(r => r.planned === false).length, 3);
    assert.equal(short.filter(r => r.planned === true).length, 1);
    // The cashiers are not named, offered around or let go: one chip, and the
    // reason is the board's, not theirs.
    assert.match(text, /3 waiting on the shop's first measured week/);
    assert.doesNotMatch(text, /S0 0\/30 h/);
    /* Read by what they say rather than by position: the headcount line's own
       entries wear the same class when a locker is new spending. */
    const reads = await hc.locator('.sp-new').evaluateAll(
      els => els.map(e => e.dataset.read));
    const group = reads.find(r => /no role it could plan/.test(r)) || "";
    assert.ok(group, 'the waiting chip is there');
    assert.match(group, /Nothing to do about it here/);
    assert.doesNotMatch(group, /let them go/);
    assert.match(group, /S0, S1, S2/, 'and it still names who');
    // The cleaner keeps the chip that tells the player what to do.
    assert.match(text, /CLEAN2 8\/30 h/);
    assert.ok(reads.some(r => /their demand asks for 30/.test(r)),
      'and the cleaner keeps the answer the player can act on');
  } finally { await page.close(); }
});

test('more people to hire than the hours would pay full weeks says why', async () => {
  const page = await shop('weekend');
  try {
    // The planner's own numbers: 48 station-hours are one full week, but they
    // come as two twelve-hour entries on each of two days, and nobody may work
    // both of a day's, so they take two people.
    const h = await page.evaluate(() => D.staffing[0].headcount['ba:skill_cleaning']);
    assert.deepEqual([h.min, h.max, h.hire], [1, 1, 2]);
    const read = await page.locator('#sp-roster .sp-hc > span').first().getAttribute('data-read');
    assert.match(read, /2 to hire/);
    assert.match(read, /nobody may work more than twelve hours in a day/);
  } finally { await page.close(); }
});

test('a role with fewer full weeks in it than people does not read backwards', async () => {
  const page = await shop('fresh');
  try {
    // 56 hours of cleaning: two people, because nobody may work more than 50,
    // and a full week for only one of them. The planner really writes min 2
    // with max 1 here.
    const h = await page.evaluate(() => D.staffing[0].headcount['ba:skill_cleaning']);
    assert.deepEqual([h.min, h.max], [2, 1]);
    const read = await page.locator('#sp-roster .sp-hc > span').first().getAttribute('data-read');
    assert.match(read, /takes 2 people, with a full week for 1 of them/);
    assert.doesNotMatch(read, /2 to 1/);
    // And the hiring clause stays quiet here: the band has just said it.
    assert.doesNotMatch(read, /more people than those hours would pay/);
  } finally { await page.close(); }
});

test('an unfilled line is named as a line, and priced as nothing it can price', async () => {
  const page = await shop('fresh', row => { row.cost = Object.assign({}, row.cost, {weekly: 0}); });
  try {
    const tiles = page.locator('#sp-roster .sp-ba > div');
    const hire = (await page.evaluate(() => spRosterCounts(D.staffing[0]))).hire;
    assert.ok(hire > 0);
    const posts = await page.evaluate(() => spPlanPosts(D.staffing[0]));
    assert.ok(posts > 0);
    assert.match(await tiles.nth(0).innerText(), new RegExp(`[+]${posts} to hire`));
    // The plan prices nobody, so it quotes nothing rather than a confident $0.
    assert.match(await tiles.nth(1).locator('.v').innerText(), /\u2014$/);
    assert.equal(await tiles.nth(1).locator('.v s').innerText(), '$1k');
    assert.match(await tiles.nth(1).getAttribute('data-read'),
      /1 person still to hire is not priced/);
  } finally { await page.close(); }
});

test('a day with nobody on it is not offered for copying, whatever the rest of the week has', async () => {
  const page = await shop('full', row => {
    /* Tuesday and Wednesday with nobody on them: the planner writes a line
       with `p: null` wherever nobody here may legally work it, and a day of
       them is a day with nothing to copy, in a week that has plenty. */
    row.shifts = row.shifts.map(s => s.d === 2 || s.d === 3
      ? Object.assign({}, s, {p: null}) : s);
  });
  try {
    const days = await page.evaluate(() => HOUR_ROWS.map(wd => ({
      wd,
      staffed: spRosterRows(D.staffing[0], D.staffing[0].shifts)[wd]
        .some(shifts => shifts.some(s => s.p !== null && s.p !== undefined)),
      dash: !!q(`#sp-roster .sp-daytabs a[data-day="${wd}"] u`),
      read: q(`#sp-roster .sp-daytabs a[data-day="${wd}"]`).dataset.read,
    })));
    assert.ok(days.some(d => d.staffed) && days.some(d => !d.staffed),
      JSON.stringify(days.map(d => d.staffed)));
    for(const d of days){
      if(d.dash) assert.ok(d.staffed, `${d.wd} offers a copy of nobody: ${d.read}`);
      if(!d.staffed) assert.doesNotMatch(d.read, /copy schedule, paste schedule/);
    }
  } finally { await page.close(); }
});

test('a repeated day on a cover-only plan is not offered as copy and paste', async () => {
  const page = await shop('fresh');
  try {
    const reads = await page.locator('#sp-roster .sp-daytabs a')
      .evaluateAll(tabs => tabs.map(a => a.dataset.read));
    const repeats = reads.filter(r => /the same cover as/.test(r));
    assert.ok(repeats.length, 'the fixture does repeat a day');
    // And no dash either: the mark is the offer of the paste.
    assert.equal(await page.locator('#sp-roster .sp-daytabs a u').count(), 0);
    for(const r of repeats){
      // BizMan pastes the whole day, and the serving shifts this shop keeps
      // are in that day: the shortcut would undo the warning above the grid.
      assert.match(r, /Copy schedule pastes the whole day/);
      assert.doesNotMatch(r, /copy schedule, paste schedule/);
    }
  } finally { await page.close(); }
});

test('a measured shop still gets the copy-and-paste shortcut', async () => {
  const page = await shop('full');
  try {
    const reads = await page.locator('#sp-roster .sp-daytabs a')
      .evaluateAll(tabs => tabs.map(a => a.dataset.read));
    assert.ok(reads.some(r => /copy schedule, paste schedule/.test(r)));
  } finally { await page.close(); }
});

test('lines the board cannot mark are still lines to enter, everywhere it counts them', async () => {
  const page = await shop('fresh', row => {
    // A station the save gives no id to: the bars are drawn and worth typing,
    // and nothing can be ticked against them.
    row.stations = row.stations.map(s => Object.assign({}, s, {id: ""}));
  });
  try {
    const counts = await page.evaluate(() => spRosterCounts(D.staffing[0]));
    assert.equal(counts.tickable, 0, 'nothing the board can mark');
    assert.ok(counts.staffed > 0, 'and a week to type all the same');
    // The note counts the week, not the ticks, and does not call it all hires.
    const note = await page.locator('#sp-roster .sp-note').innerText();
    assert.match(note, new RegExp(`cover only: ${counts.staffed} entries`));
    assert.doesNotMatch(note, /every one of them waiting on a hire/);
    assert.doesNotMatch(note, /Hire before you clear/);
    // The tile counts the same week, and its saving is a real one.
    const tile = page.locator('#sp-roster .sp-ba > div').first();
    assert.match(await tile.innerText(), new RegExp(`${counts.nowCover} ${counts.staffed} entries`));
    assert.equal(await tile.locator('.v small s').innerText(), String(counts.nowCover));
    // And the ring says why it counts fewer.
    assert.match(await page.locator('#sp-roster .sp-typed').innerText(), /0 of 0 copied/);
    assert.match(await page.locator('#sp-roster .sp-typed').getAttribute('data-read'),
      /entries to set that it cannot/);
  } finally { await page.close(); }
});

test('a shop with serving shifts and no line to enter is told to hire, not to clear', async () => {
  // The cashier on the till as well as the mop: serving shifts the plan keeps,
  // over cover it cannot type yet, straight out of the planner.
  const page = await shop('halfmop');
  try {
    const counts = await page.evaluate(() => spRosterCounts(D.staffing[0]));
    assert.equal(counts.staffed, 0);
    const kept = counts.now - counts.nowCover;
    assert.ok(kept > 0, 'serving shifts the plan keeps');
    const note = await page.locator('#sp-roster .sp-note').innerText();
    // The dangerous sentence is the one that used to win here.
    assert.match(note, /Hire before you clear/);
    assert.doesNotMatch(note, /delete the cleaning and security hours and drag these in/);
    // And it still says what happens to the serving hours.
    assert.match(note, new RegExp(`${kept} serving entries in the game are not in this plan either`));
    // Nor is any day offered for pasting over them -- and a day with nobody on
    // it is not "the same as" another one "people and all" either.
    assert.equal(await page.locator('#sp-roster .sp-daytabs a u').count(), 0);
    const tabs = await page.locator('#sp-roster .sp-daytabs a')
      .evaluateAll(a => a.map(x => x.dataset.read));
    for(const read of tabs.filter(r => /the same cover as/.test(r)))
      assert.doesNotMatch(read, /people and all/);
    assert.equal(await page.locator('#sp-roster .sp-note.sp-care').count(), 1);
    const steps = await page.locator('#sp-roster .sp-step').evaluateAll(
      b => b.map(x => x.innerText.replace(/\s+/g, ' ')));
    assert.ok(!steps.some(s => /^Clear/.test(s)), steps.join(' | '));
    // Nor do the tiles offer the saving the note is warning against.
    assert.equal(await page.locator('#sp-roster .sp-ba > div').first().locator('s').count(), 0);
    assert.equal(await page.locator('#sp-roster .sp-ba > div').nth(1).locator('s').count(), 0);
  } finally { await page.close(); }
});

test('a weekday of its own that could not be read says so, on a shop that was', async () => {
  const page = await shop('quiet', row => {
    /* Measured everywhere but Wednesday, whose own basis the day curve could
       not scale: the shop has been read and this weekday has not. */
    Object.values(row.basis).forEach(days => { days[3] = days[3].map(() => 'none'); });
  });
  try {
    // By weekday, not by the order the tabs run in.
    const reads = await page.evaluate(() => [0, 1, 2, 3, 4, 5, 6].map(
      wd => q(`#sp-roster .sp-day[data-d="${wd}"] .sp-needrow .lab`).dataset.read));
    assert.match(reads[3], /Not enough hour reports to read this weekday yet/);
    for(const wd of [1, 2, 4, 5, 6, 0]) assert.match(reads[wd], /Measured, and these hours ask for nobody/);
  } finally { await page.close(); }
});

test('a weekday read off another one does not claim to have been measured itself', async () => {
  const page = await shop('quiet', row => {
    // A thin weekday the day curve did scale: its hours are a reading of
    // another weekday, which is not the same as a reading of this one.
    Object.values(row.basis).forEach(days => { days[3] = days[3].map(() => 'scaled'); });
  });
  try {
    const read = await page.evaluate(
      () => q('#sp-roster .sp-day[data-d="3"] .sp-needrow .lab').dataset.read);
    assert.match(read, /Read off the best measured weekday through the game's day curve/);
    assert.doesNotMatch(read, /^Measured/);
  } finally { await page.close(); }
});

test('the need strip on a shop measured at nothing says so, lane by lane', async () => {
  const page = await shop('quiet');
  try {
    // Open all week and measured all fortnight, and not one hour of it asks
    // for anybody: every lane keeps its dashed baseline and says which it is.
    assert.equal(await page.locator('#sp-roster .sp-grow.sp-needrow.sp-unmeas').count(), 7);
    assert.equal(await page.locator('#sp-roster .sp-need').count(), 0);
    const reads = await page.locator('#sp-roster .sp-day .sp-needrow .lab')
      .evaluateAll(els => els.map(e => e.dataset.read));
    assert.equal(reads.length, 7);
    for(const r of reads){
      assert.match(r, /Measured, and these hours ask for nobody/);
      assert.doesNotMatch(r, /Not enough hour reports/);
    }
  } finally { await page.close(); }
});

test('a bar too narrow for both keeps its hours and loses the name', async () => {
  // The two-slot weekday: an 08-12 bar is four columns of a phone's grid, and
  // a name and an hour range together do not fit in it.
  const page = await shop('shut');
  try {
    await page.setViewportSize({width: 400, height: 900});
    /* Nothing inside a page the harness never opened has a width. drawChart()
       is stubbed for the same reason as in the landing test: no history. */
    await page.evaluate(() => { drawChart = () => {}; showPage('company'); });
    const bar = page.locator('#sp-roster .sp-day.sp-on button.sp-shift').first();
    const box = await bar.evaluate(el => ({
      wide: el.clientWidth,
      hours: el.querySelector('small').getBoundingClientRect().width,
      label: el.querySelector('.sp-lbl').getBoundingClientRect().width,
      wants: el.querySelector('.sp-lbl').scrollWidth,
      text: el.querySelector('small').textContent,
    }));
    // Narrow enough that the CSS has to do the work: the name's own text is
    // wider than the room left once the hours have theirs.
    assert.ok(box.wide > 0 && box.wide < 200, `a narrow bar: ${JSON.stringify(box)}`);
    assert.ok(box.wants > box.label, `the name is being cut: ${JSON.stringify(box)}`);
    // The hours survive whole; the name gives way around them.
    assert.ok(box.hours > 20, `the hours are what the player types: ${JSON.stringify(box)}`);
    assert.match(box.text, /^\d\d\u2013\d\d$/);
    assert.ok(box.label + box.hours <= box.wide + 1, JSON.stringify(box));
  } finally { await page.close(); }
});

test('a row that predates the cover count has it worked out rather than called none', async () => {
  const page = await shop('fresh', row => { delete row.current.coverFragments; });
  try {
    const counts = await page.evaluate(() => spRosterCounts(D.staffing[0]));
    assert.equal(counts.coverFragments, 28, 'read off the list the row still carries');
    assert.match(await page.locator('#sp-roster .sp-ba > div').first().getAttribute('data-read'),
      /28 of them two hours long/);
  } finally { await page.close(); }
});

test('a row that says nothing about the shop\u2019s age does not call it new', async () => {
  const page = await shop('fresh', row => { row.measure = {days: 0, need: 2, open: null}; });
  try {
    const note = await page.locator('#sp-roster .sp-note').innerText();
    assert.match(note, /Not measured/);
    assert.doesNotMatch(note, /New shop/);
    assert.doesNotMatch(note, /Open /);
  } finally { await page.close(); }
});

// --- reaching the block, and reading it without a pointer -------------------

test('the Optimize staffing card lands on the Roster itself', async () => {
  const page = await shop('full');
  try {
    await page.evaluate(() => {
      /* The harness hands the page one site and no company history, and
         showPage() draws the Results chart off that history on the way
         through. The chart is not what this is about. */
      drawChart = () => {};
      drawOptimizeStaffing();
      wireCards();
      $('optimizeStaffingCard').click();
    });
    // The scroll's end state: the Roster near the top of the window, and
    // still there over three frames in a row.
    await page.waitForFunction(() => {
      const top = Math.round(q('#sp-roster').getBoundingClientRect().top);
      const mark = window.rosterLanding;
      window.rosterLanding = {top, frames: mark && mark.top === top ? mark.frames + 1 : 0};
      return top >= 0 && top < 200 && window.rosterLanding.frames >= 3;
    }, null, {polling: 'raf'});
    const where = await page.evaluate(() => {
      return {top: Math.round(q('#sp-roster').getBoundingClientRect().top),
        arrived: q('#sp-roster').classList.contains('sp-arrived'),
        page: [...document.querySelectorAll('.page')].filter(p => !p.hidden).map(p => p.id)};
    });
    assert.deepEqual(where.page, ['pageCompany']);
    // At the top of the window, under the sticky head, rather than wherever
    // the sections above it were estimated to end.
    assert.ok(where.top >= 0 && where.top < 200, `the Roster landed at ${where.top}`);
    assert.ok(where.arrived, 'and says it has been arrived at');
  } finally { await page.close(); }
});

test('the read-out answers a keyboard as well as a pointer', async () => {
  const page = await shop('full');
  try {
    await page.evaluate(() => {
      /* The panel is drawn into a page the harness never opens, and nothing
         inside a hidden page can take focus. drawChart() is stubbed for the
         same reason as in the landing test: no history to draw. */
      drawChart = () => {};
      showPage('company');
      wireSiteReads();
    });
    const tile = page.locator('#sp-roster .sp-ba > div[data-read]').first();
    await tile.focus();
    assert.match(await page.locator('#sp-roster .sp-readout').innerText(),
      /Hours to set for the week/);
  } finally { await page.close(); }
});

// --- the Next moves card ----------------------------------------------------

test('the Optimize staffing card opens the shop with most work to save', async () => {
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
      return [card.querySelector('.soon').textContent, card.querySelector('.what').textContent, card.dataset.site];
    });
    assert.equal(shown[0], '−174 ENTRIES');
    assert.match(shown[1], /Big saving: 200 entries become 26, and 5 people to hire\./);
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
        card.querySelector('.what').textContent, card.dataset.site,
        JSON.stringify(rows.map(r => spRosterCounts(r).tickable))];
    }, [a, b]);
    assert.equal(shown[3], '[70,70]', 'both plans are 70 blocks to drag in');
    assert.equal(shown[0], '\u221230 ENTRIES');
    assert.match(shown[1], /shop-a: 100 entries become 70, and 5 people to hire\./);
    assert.equal(shown[2], 'shop-a', 'not shop-b, which saves ten');
  } finally { await page.close(); }
});


test('the card scores the saving on the lines somebody can be put on', async () => {
  const page = await shop('full');
  try {
    const shown = await page.evaluate(() => {
      // One shop, 42 planned lines, 16 of them waiting on a hire, against 42
      // scraps in the game. The honest saving is 42 to 26.
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return [card.querySelector('.soon').textContent, card.querySelector('.what').textContent,
];
    });
    assert.equal(shown[0], '−16 ENTRIES');
    assert.match(shown[1], /42 entries become 26, and 5 people to hire\./);
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
      return [card.querySelector('.soon').textContent, card.querySelector('.what').textContent,
        spPlanHours(D.staffing[0])];
    });
    assert.equal(shown[0], `${shown[2]} HOURS`, 'the hours somebody can be put on');
    assert.match(shown[1], new RegExp(
      `a week of ${shown[2]} hours to set, in 26 entries, and 5 people to hire[.]`));
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
      return [card.querySelector('.soon').textContent, card.querySelector('.what').textContent,
        card.dataset.site, spPlanHours(D.staffing[1])];
    });
    assert.equal(shown[0], `${shown[3]} HOURS`);
    assert.match(shown[1], new RegExp(
      `Big shop: a week of ${shown[3]} hours to set, in 26 entries, and 5 people to hire[.]`));
    assert.doesNotMatch(shown[1], /measured/);
    assert.equal(shown[2], 'b');
  } finally { await page.close(); }
});

test('a plan nobody can be put on yet is still sized as a plan', async () => {
  const page = await shop('nobody');
  try {
    const shown = await page.evaluate(() => {
      const counts = spRosterCounts(D.staffing[0]);
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return {counts, badge: card.querySelector('.soon').textContent,
        what: card.querySelector('.what').textContent,
        hours: spPlanHours(D.staffing[0])};
    });
    // Nobody here may clean, so every block the planner drew waits on a hire.
    assert.equal(shown.counts.tickable, 0);
    assert.ok(shown.counts.hire > 0);
    assert.equal(shown.badge, `${shown.hours} HOURS`);
    assert.match(shown.what, new RegExp(
      `a week of ${shown.hours} cleaning and security hours to set, in ${shown.counts.hire} entries, every one of them waiting on a hire`));
    assert.doesNotMatch(shown.what, /week of 0/);
  } finally { await page.close(); }
});

test('a saving nobody could set is not offered as one', async () => {
  // The fixture's own cover scraps, and not one block of the plan that can be
  // dragged in: "56 entries become 0" is a shop left uncovered, not a week saved.
  const page = await shop('nobody');
  try {
    const shown = await page.evaluate(() => {
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return [card.querySelector('.soon').textContent, card.querySelector('.what').textContent,
        spRosterCounts(D.staffing[0]).nowCover];
    });
    assert.ok(shown[2] > 0, 'there is cover in the game to lose');
    assert.doesNotMatch(shown[0], /ENTRIES/);
    assert.match(shown[0], /HOURS$/);
    assert.doesNotMatch(shown[1], /become 0/);
  } finally { await page.close(); }
});

test('the Today card sizes a cover-only plan on the cover blocks alone', async () => {
  const page = await shop('fresh');
  try {
    const shown = await page.evaluate(() => {
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return {counts: spRosterCounts(D.staffing[0]),
        badge: card.querySelector('.soon').textContent,
        what: card.querySelector('.what').textContent,
        go: card.querySelector('.go').textContent};
    });
    const {now, nowCover, tickable} = shown.counts;
    // 56 blocks in the game, 28 of them cover, and 12 to drag in: the card
    // is about the 28, because the other 28 are the ones it cannot replace.
    assert.ok(now > nowCover && nowCover > tickable, JSON.stringify(shown.counts));
    assert.equal(shown.badge, `\u2212${nowCover - tickable} ENTRIES`);
    assert.match(shown.what, new RegExp(
      `${nowCover} cleaning and security entries become ${tickable}`));
    assert.doesNotMatch(shown.what, new RegExp(`${now} entries become`));
    assert.match(shown.what, /registers wait on the shop\u2019s first measured week/);
    assert.match(shown.go, /\u203a Staffing$/);
  } finally { await page.close(); }
});

test('a plan half of which waits on hires says what to delete and what to leave', async () => {
  const page = await shop('fresh');
  try {
    const counts = await page.evaluate(() => spRosterCounts(D.staffing[0]));
    assert.ok(counts.staffed > 0 && counts.hire > 0, JSON.stringify(counts));
    const note = await page.locator('#sp-roster .sp-note').innerText();
    // Not "delete the cleaning and security hours and drag these in": half of
    // "these" is dashed, and the hours under them would stand bare.
    assert.match(note, /Delete the cleaning and security hours the solid entries replace/);
    assert.match(note, new RegExp(`leave what is under the ${counts.hire} dashed ${counts.hire === 1 ? 'entry' : 'entries'}`));
    assert.doesNotMatch(note, /drag these in instead/);
  } finally { await page.close(); }
});

test('a week with hires in it says so on the card as well as in the block', async () => {
  const page = await shop('full');
  try {
    const shown = await page.evaluate(() => {
      const counts = spRosterCounts(D.staffing[0]);
      drawOptimizeStaffing();
      return {counts, posts: spPlanPosts(D.staffing[0]),
        what: $('optimizeStaffingCard').querySelector('.what').textContent};
    });
    // 26 entries to set and five people still to find: a card that stopped at
    // 26 would describe a week the player cannot finish.
    assert.ok(shown.counts.staffed > 0 && shown.counts.hire > 0 && shown.posts > 0);
    assert.match(shown.what, new RegExp(
      `become ${shown.counts.staffed}, and ${shown.posts} people to hire`));
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

// --- the two plans: the demand test, its hand-over, and who to add first -----

const pickText = page => page.locator('#sp-roster .sp-plans a')
  .evaluateAll(a => a.map(x => [x.textContent, x.classList.contains('sp-on')]));

test('a new shop offers cover only or the demand test, and remembers the pick', async () => {
  const page = await shop('newshop');
  try {
    // Cover only is the default, and it is what the note under it describes.
    assert.deepEqual(await pickText(page), [['Cover only', true], ['Full cover 24/7', false]]);
    assert.equal(await page.locator('#sp-roster .sp-note').count(), 1);
    assert.equal(await page.locator(mon + '.sp-shift:not(.sp-clean):not(.sp-security)').count(), 0);
    assert.match(await page.locator('#sp-roster .sp-note').innerText(), /Full cover 24\/7, above, is that week/);
    await page.evaluate(() => q('#sp-roster [data-plan="full"]').click());
    assert.deepEqual(await pickText(page), [['Cover only', false], ['Full cover 24/7', true]]);
    // The test: both registers every hour, the doors opened first, and the
    // one line that says what it is for.
    assert.equal(await page.locator('#sp-roster .sp-note').count(), 0);
    const regs = await page.locator(mon + '.sp-shift:not(.sp-clean):not(.sp-security)')
      .evaluateAll(b => b.map(x => x.style.gridColumn));
    assert.equal(regs.length, 4, 'two registers, two twelve-hour entries each');
    const steps = await page.locator('#sp-roster .sp-step').evaluateAll(
      b => b.map(x => x.innerText.replace(/\s+/g, ' ')));
    assert.match(steps[0], /^Open every day 0 to 24/);
    assert.match(await page.locator('#sp-roster .sp-pickwhy').innerText(),
      /^Run it until 9 days after the shop's first customer, then switch to the demand plan\. Demand data: 0 of 9 days\.$/);
    assert.equal(await page.locator('#sp-roster .sp-progress').innerText(), 'Demand data: 0 of 9 days.');
    assert.match(await page.locator('#sp-roster .sp-needrow .lab').first().getAttribute('data-read'),
      /Every station, every hour/);
    // The payload carries no need for the test; the strip is read off the
    // station list: both registers, every hour of the day.
    assert.equal(ROWS.newshop.fullCover.need, undefined);
    const strip = await page.locator(mon + '.sp-need')
      .evaluateAll(n => n.map(x => x.style.getPropertyValue('--n')));
    assert.deepEqual(strip, Array(24).fill('2'));
    // Its own hours, headcount and wages, in the tiles the demand plan uses.
    const hoursTile = await page.locator('#sp-roster .sp-ba > div').first().innerText();
    const full = ROWS.newshop.fullCover;
    const staffedHours = full.shifts.filter(s => s.p !== null).reduce((n, s) => n + s.t - s.f, 0);
    assert.match(hoursTile, new RegExp(`${staffedHours}`));
    assert.equal(await page.evaluate(k => localStorage.getItem('ba_dash_plan:roster-fixture:' + k), KEY), 'full');
    // The pick survives the next draw, and going back forgets it.
    await page.evaluate(() => drawSite());
    assert.deepEqual(await pickText(page), [['Cover only', false], ['Full cover 24/7', true]]);
    await page.evaluate(() => q('#sp-roster [data-plan="demand"]').click());
    assert.deepEqual(await pickText(page), [['Cover only', true], ['Full cover 24/7', false]]);
    assert.equal(await page.evaluate(k => localStorage.getItem('ba_dash_plan:roster-fixture:' + k), KEY), null);
  } finally { await page.close(); }
});

test('a measured shop names its plan the demand plan and offers the test beside it', async () => {
  const page = await shop('full');
  try {
    assert.deepEqual(await pickText(page), [['Demand plan', true], ['Full cover 24/7', false]]);
    assert.equal(await page.locator('#sp-roster .sp-pickwhy').count(), 0);
    assert.equal(await page.locator('#sp-roster .sp-handover').count(), 0);
    // Already open around the clock, so there are no doors to open.
    await page.evaluate(() => q('#sp-roster [data-plan="full"]').click());
    const steps = await page.locator('#sp-roster .sp-step').evaluateAll(
      b => b.map(x => x.innerText.replace(/\s+/g, ' ')));
    assert.ok(!steps.some(s => /^Open every day/.test(s)), steps.join(' | '));
  } finally { await page.close(); }
});

test('each plan keeps its own ticks', async () => {
  const page = await shop('newshop');
  try {
    await page.evaluate(() => q('#sp-roster [data-plan="full"]').click());
    await page.evaluate(s => q(s).click(), mon + 'button.sp-shift');
    assert.equal(await page.locator('#sp-roster .sp-count').innerText(), '1');
    assert.ok(await page.evaluate(k => localStorage.getItem('ba_dash_roster:full:roster-fixture:' + k), KEY));
    await page.evaluate(() => q('#sp-roster [data-plan="demand"]').click());
    assert.equal(await page.locator('#sp-roster .sp-count').innerText(), '0');
  } finally { await page.close(); }
});

test('the pick works without storage of any kind', async () => {
  const page = await shop('newshop', null, () => {
    Object.defineProperty(window, 'localStorage',
      {get(){ throw new Error('site data blocked'); }});
  });
  try {
    assert.deepEqual(await pickText(page), [['Cover only', true], ['Full cover 24/7', false]]);
    // Nothing can be stored, and the pick still holds for as long as the page.
    await page.evaluate(() => q('#sp-roster [data-plan="full"]').click());
    assert.equal(await page.locator('#sp-roster').count(), 1);
    assert.deepEqual(await pickText(page), [['Cover only', false], ['Full cover 24/7', true]]);
    await page.evaluate(() => drawSite());
    assert.deepEqual(await pickText(page), [['Cover only', false], ['Full cover 24/7', true]]);
  } finally { await page.close(); }
});

test('the pick belongs to one company: another character on the same map starts fresh', async () => {
  const page = await shop('newshop');
  try {
    await page.evaluate(() => q('#sp-roster [data-plan="full"]').click());
    assert.deepEqual(await pickText(page), [['Cover only', false], ['Full cover 24/7', true]]);
    // Every character plays the same map, so the same address is another
    // company's shop there.
    await page.evaluate(() => { D.meta.character = 'someone-else'; drawSite(); });
    assert.deepEqual(await pickText(page), [['Cover only', true], ['Full cover 24/7', false]]);
    assert.equal(await page.evaluate(k => localStorage.getItem('ba_dash_plan:someone-else:' + k), KEY), null);
    await page.evaluate(() => { D.meta.character = 'roster-fixture'; drawSite(); });
    assert.deepEqual(await pickText(page), [['Cover only', false], ['Full cover 24/7', true]]);
  } finally { await page.close(); }
});

test('a browser that reads storage but refuses to write it still switches on the click', async () => {
  const page = await shop('newshop', null, () => {
    Storage.prototype.setItem = function(){ throw new Error('quota'); };
  });
  try {
    await page.evaluate(() => q('#sp-roster [data-plan="full"]').click());
    assert.deepEqual(await pickText(page), [['Cover only', false], ['Full cover 24/7', true]]);
  } finally { await page.close(); }
});

test('one step names everybody to add, and the hours that wait on them', async () => {
  const page = await shop('newshop');
  try {
    await page.evaluate(() => q('#sp-roster [data-plan="full"]').click());
    const add = ROWS.newshop.fullCover.addPeople;
    const step = page.locator('#sp-roster .sp-step.sp-add');
    assert.equal(await step.count(), 1);
    const text = (await step.innerText()).replace(/\s+/g, ' ');
    assert.match(text, new RegExp(`^Add ${add.people} people to fill this plan: assign BENCH \\(unassigned\\) and hire ${
      add.hire.map(h => `${h.people} ${h.role}`).join(', ')}`));
    assert.match(await step.getAttribute('data-tip'), new RegExp(`^${add.hoursUncovered} h a week stay empty until they are added`));
    // No second, competing line: the old per-person bench steps are gone.
    assert.equal(await page.locator('#sp-roster .sp-step[data-p]').count(), 0);
    assert.equal(await page.locator('#sp-roster .sp-step').filter({hasText: /^Hire /}).count(), 0);
  } finally { await page.close(); }
});

test('a plan with nobody to add has no add step', async () => {
  const page = await shop('handover');
  try {
    assert.deepEqual(ROWS.handover.addPeople.people, 0);
    assert.equal(await page.locator('#sp-roster .sp-step.sp-add').count(), 0);
  } finally { await page.close(); }
});

test('complete demand data on full cover says so on the block and on the Today card', async () => {
  const page = await shop('handover');
  try {
    assert.equal(ROWS.handover.demandDataComplete, true);
    const line = page.locator('#sp-roster .sp-handover');
    assert.equal(await line.innerText(), 'Demand data complete: switch to the demand plan');
    // On the test's own view the line is the way back.
    await page.evaluate(() => q('#sp-roster .sp-plans [data-plan="full"]').click());
    assert.equal(await page.locator('#sp-roster .sp-pickwhy').count(), 0, 'one line, not two');
    await page.evaluate(() => q('#sp-roster .sp-handover [data-plan="demand"]').click());
    assert.deepEqual(await pickText(page), [['Demand plan', true], ['Full cover 24/7', false]]);
    const card = await page.evaluate(() => {
      drawOptimizeStaffing();
      const c = $('optimizeStaffingCard');
      return [c.querySelector('.what').textContent, c.dataset.site];
    });
    assert.equal(card[0], 'Demand data complete at HART. Test 12: switch to the demand plan.');
    assert.equal(card[1], KEY);
  } finally { await page.close(); }
});

test("the progress line counts the days since the shop's first customer", async () => {
  const page = await shop('newshop', row => { row.fullCover.daysMeasured = 5; });
  try {
    await page.evaluate(() => q('#sp-roster [data-plan="full"]').click());
    assert.equal(await page.locator('#sp-roster .sp-progress').innerText(),
      'Demand data: 5 of 9 days.');
    // Not on the other view, and not once the data is complete.
    await page.evaluate(() => q('#sp-roster [data-plan="demand"]').click());
    assert.equal(await page.locator('#sp-roster .sp-progress').count(), 0);
  } finally { await page.close(); }
  const done = await shop('handover');
  try {
    await done.evaluate(() => q('#sp-roster .sp-plans [data-plan="full"]').click());
    assert.equal(await done.locator('#sp-roster .sp-progress').count(), 0);
  } finally { await done.close(); }
});

test('complete data with no hand-over says why, in one line', async () => {
  // The demand plan wants every station every hour as well: nothing to switch to.
  const same = await shop('handover', row => {
    row.demandDataComplete = false;
    row.shifts = JSON.parse(JSON.stringify(row.fullCover.shifts));
  });
  try {
    await same.evaluate(() => q('#sp-roster .sp-plans [data-plan="full"]').click());
    assert.equal(await same.locator('#sp-roster .sp-pickwhy').innerText(),
      'The demand plan also needs every station every hour: keep this staffing.');
    assert.equal(await same.locator('#sp-roster .sp-progress').count(), 0);
    assert.equal(await same.locator('#sp-roster .sp-handover').count(), 0);
  } finally { await same.close(); }
  // Nine days since first open, but not on full cover in the game.
  const off = await shop('handover', row => {
    row.demandDataComplete = false;
    row.fullCover.inGame = false;
  });
  try {
    await off.evaluate(() => q('#sp-roster .sp-plans [data-plan="full"]').click());
    assert.equal(await off.locator('#sp-roster .sp-pickwhy').innerText(),
      'Demand data complete, as staffed: an empty station may have turned customers away.');
  } finally { await off.close(); }
});

test('open hours no report has measured are named in one line and marked on the strip', async () => {
  // `quiet` was measured at night and now opens 8 to 20: its day hours are
  // counted as no customers until reports arrive.
  const page = await shop('quiet');
  try {
    const line = page.locator('#sp-roster .sp-unmline');
    assert.equal(await line.count(), 1);
    assert.equal(await line.innerText(), 'No customers on file: every day 8-20. Counted as none.');
    assert.equal(await page.locator(mon + '.sp-unmh').count(), 12);
    // The test staffs every hour anyway: not on its view.
    await page.evaluate(() => q('#sp-roster [data-plan="full"]').click());
    assert.equal(await page.locator('#sp-roster .sp-unmline').count(), 0);
    assert.equal(await page.locator(mon + '.sp-unmh').count(), 0);
  } finally { await page.close(); }
  // `shut` was measured in the hours it opens now: nothing to name.
  const none = await shop('shut');
  try {
    assert.equal(await none.locator('#sp-roster .sp-unmline').count(), 0);
  } finally { await none.close(); }
});

test('the line names the weekdays, and weekdays with the same hours share an entry', async () => {
  const page = await shop('quiet', row => {
    row.unmeasured = [[], [22, 23, 0, 1], [22, 23, 0, 1], [], [], [0, 7], []];
  });
  try {
    assert.equal(await page.locator('#sp-roster .sp-unmline').innerText(),
      'No customers on file: Mon, Tue 0-2, 22-24; Fri 0-1, 7-8. Counted as none.');
  } finally { await page.close(); }
  // Hours that hold every day may run across midnight.
  const every = await shop('quiet', row => { row.unmeasured = Array(7).fill([22, 23, 0, 1]); });
  try {
    assert.equal(await every.locator('#sp-roster .sp-unmline').innerText(),
      'No customers on file: every day 22-2. Counted as none.');
  } finally { await every.close(); }
});

test('a shorter day busy all its hours has nothing to switch to', async () => {
  // Open 8 to 22, both registers staffed all of it, complete data: the demand
  // plan is its full cover of those hours, not less than the 24/7 test.
  const page = await shop('partday');
  try {
    assert.equal(ROWS.partday.demandDataComplete, false);
    assert.equal(ROWS.partday.fullCover.inGame, true);
    await page.evaluate(() => q('#sp-roster [data-plan="full"]').click());
    assert.equal(await page.locator('#sp-roster .sp-pickwhy').innerText(),
      'The demand plan also needs every station every hour: keep this staffing.');
    const card = await page.evaluate(() => {
      drawOptimizeStaffing();
      return $('optimizeStaffingCard').querySelector('.what').textContent;
    });
    assert.doesNotMatch(card, /Demand data complete/);
  } finally { await page.close(); }
});

test('hours read as the player reads them, runs joined across midnight', async () => {
  const page = await shop('full');
  try {
    const got = await page.evaluate(() => [
      spHourRanges([22, 23, 0, 1, 2, 3, 4, 5, 6, 7]),
      spHourRanges([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]),
      spHourRanges([0, 1, 5, 20, 21, 22, 23]),
      spHourRanges([...Array(24).keys()]),
      spHourRanges([]),
    ]);
    assert.deepEqual(got, ['22-8', '8-20', '5-6, 20-2', '0-24', '']);
    // Within one weekday a run does not cross midnight.
    const day = await page.evaluate(() => [
      spHourRanges([0, 1, 22, 23], false), spHourRanges([22, 23, 0, 1, 2, 3, 4, 5, 6, 7], false)]);
    assert.deepEqual(day, ['0-2, 22-24', '0-8, 22-24']);
  } finally { await page.close(); }
});

test('no hand-over line on a shop whose demand data is not complete', async () => {
  for(const which of ['full', 'newshop']){
    const page = await shop(which);
    try {
      assert.equal(ROWS[which].demandDataComplete, false, which);
      assert.equal(await page.locator('#sp-roster .sp-handover').count(), 0, which);
      const card = await page.evaluate(() => {
        drawOptimizeStaffing();
        return $('optimizeStaffingCard').querySelector('.what').textContent;
      });
      assert.doesNotMatch(card, /Demand data complete/, which);
    } finally { await page.close(); }
  }
});
