// The Roster block on a shop's page: the week the board would type into
// BizMan, drawn from the `staffing` payload key. The fixture below is the shape
// _staffing() really emits -- two lookup tables and indices into them, `d`/`s`/
// `f`/`t`/`p` rows with `k` left off a serving shift, need and basis per role
// per weekday per hour, and `d` counting from Sunday the way the hour grid does.
// Install Playwright and its Chromium browser to run; NODE_PATH may point at an
// existing Playwright installation.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const {chromium} = require('playwright');

let browser;
let html;
let server;
let origin;
before(async () => {
  const result = spawnSync(process.env.PYTHON || 'python', ['-c',
    'from ba_dashboard import render; import sys; sys.stdout.buffer.write(render(None).encode("utf-8"))'],
  {cwd: path.join(__dirname, '..'), maxBuffer: 8 * 1024 * 1024});
  assert.equal(result.status, 0, result.stderr?.toString());
  html = process.env.BOARD_TARGET === 'web'
    ? fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8')
    : result.stdout.toString();
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
// Two serving counters, two cleaning stations and a security locker, the way a
// clothing store's row lists them: `rate` only on the serving furniture.
const STATIONS = [
  {id: '2b5pu3YfNkeAVC62rbzlHg==', name: 'Checkout Counter (Left)', skill: 'ba:skill_customerservice', rate: 30},
  {id: '7KraD2I1fUaDDqqI4Rgx1g==', name: 'Checkout Counter (Left)', skill: 'ba:skill_customerservice', rate: 30},
  {id: 'VQai7JD3rUaz3MqE2FydEg==', name: 'Cleaning Station', skill: 'ba:skill_cleaning', rate: null},
  {id: 'hJPB1aS0y0yNhYRynVb8gQ==', name: 'Security Guard Locker', skill: 'ba:skill_securityguard', rate: null},
];
const PEOPLE = [
  {id: 'aqhwlUosekmKHWy5hqvgag==', name: 'Bill Burnett'},
  {id: 'QgsZzr4z1UCmhqlSZOqR9w==', name: 'Connie White'},
  {id: 'fM7PSQ4gwUitPLcW59z+w==', name: 'Mia Cho'},
  {id: 'HcWX7TMw0Eym590rKnnrzA==', name: 'Dana Reyes'},
  {id: 'opXYnCAIm0CybxjL1dgvEQ==', name: '<script>bad</script>'},
];
const SERVE = 'ba:skill_customerservice';
// Sunday is 0. Monday and Tuesday are cut identically, Wednesday is scaled off
// them, Thursday's afternoon was measured at the ceiling, and Sunday is shut.
const hours = fill => Array.from({length: 24}, (_, h) => fill(h));
const need = wd => wd === 0 ? hours(() => 0) : hours(h => h >= 8 && h < 20 ? (h >= 12 && h < 16 ? 2 : 1) : 0);
const basis = wd => wd === 0 ? hours(() => 'none')
  : wd === 3 ? hours(() => 'scaled')
    : wd === 4 ? hours(h => h >= 12 && h < 16 ? 'censored' : 'measured')
      : hours(() => 'measured');

function shifts(){
  const out = [];
  for(let d = 1; d <= 6; d++){
    // Monday (1) and Tuesday (2) get the same two people at the same counters.
    const early = d === 1 || d === 2 ? 0 : d;
    out.push({d, s: 0, f: 8, t: 20, p: early % 5});
    out.push({d, s: 2, f: 8, t: 20, p: 1, k: 'clean'});
    if(d === 1 || d === 2) out.push({d, s: 1, f: 12, t: 16, p: 3});
    // Saturday's second counter is a line nobody can legally work.
    if(d === 6) out.push({d, s: 1, f: 12, t: 16, p: null});
    // A row pointing at furniture this site does not have, which a save can
    // hold and the block must drop rather than draw against the wrong station.
    if(d === 5) out.push({d, s: 9, f: 8, t: 12, p: 0});
  }
  return out;
}
// Today's schedule, in two-hour scraps: the "now" side of the toggle.
function current(){
  const out = [];
  for(let d = 1; d <= 6; d++)
    for(let f = 8; f < 20; f += 2) out.push({d, s: 0, f, t: f + 2, p: 0});
  return out;
}

function row(over = {}){
  return Object.assign({
    key: KEY,
    name: '[HK] HART. Clothing',
    typeSlug: 'ba:businesstype_clothingstore',
    open: Array.from({length: 7}, (_, wd) => wd === 0 ? [] : wd === 5 ? [[8, 12], [14, 20]] : [[8, 20]]),
    stations: STATIONS,
    people: PEOPLE,
    roles: [{skill: SERVE, label: 'Customer Service', stations: [0, 1]}],
    need: {[SERVE]: Array.from({length: 7}, (_, wd) => need(wd))},
    basis: {[SERVE]: Array.from({length: 7}, (_, wd) => basis(wd))},
    ceiling: Array.from({length: 7}, () => hours(() => 75)),
    shifts: shifts(),
    headcount: {
      'ba:skill_cleaning': {kind: 'clean', needed: 72, min: 2, max: 3, have: 1, spare: 0, hire: 0, hireHours: 0},
      [SERVE]: {kind: 'serve', needed: 84, min: 2, max: 4, have: 4, spare: 1, hire: 1, hireHours: 4},
      'ba:skill_securityguard': {kind: 'security', needed: 72, min: 2, max: 3, have: 0, spare: 0, hire: 2, hireHours: 72},
    },
    shortHours: [{p: 3, hours: 8.0, min: 30}, {p: 2, hours: 24.0, min: 30},
      {p: 4, hours: 25.0, min: 30}, {p: 1, hours: 26.0, min: 30}],
    shortDays: [{p: 3, days: 2, want: 4}],
    placed: [{p: 3, demand: 'ba:jobdemand_noafternoons', label: 'No afternoon shifts', wd: 1, from: 12, to: 16}],
    bench: [{p: 3, skill: SERVE}],
    slack: {hours: 6.0, cost: 240.5, budget: 12.0},
    cost: {weekly: 18000.5, current: 24000.25},
    current: {shifts: 72, fragments: 72, cleaning: 0, security: 0, list: current()},
  }, over);
}

// The three clothing stores on the reference save look like this: no hour
// reports at all, so no serving shifts, but two cleaning stations covered every
// open hour -- 14 shifts against a schedule of 182 two-hour scraps. There is no
// `serve` entry in `headcount` either, because nothing was planned for it.
const NONE = Array.from({length: 7}, () => Array(24).fill('none'));
function coverOnly(){
  const out = [];
  for(let d = 0; d < 7; d++){
    out.push({d, s: 2, f: 0, t: 12, p: 1, k: 'clean'});
    out.push({d, s: 2, f: 12, t: 24, p: 0, k: 'clean'});
  }
  return {
    basis: {[SERVE]: NONE},
    need: {[SERVE]: Array.from({length: 7}, () => Array(24).fill(0))},
    shifts: out,
    placed: [], bench: [], shortDays: [],
    headcount: {
      'ba:skill_cleaning': {kind: 'clean', needed: 168, min: 4, max: 5, have: 12, spare: 8, hire: 0, hireHours: 0},
      'ba:skill_securityguard': {kind: 'security', needed: 168, min: 4, max: 5, have: 0, spare: 0, hire: 4, hireHours: 120},
    },
    current: {shifts: 182, fragments: 147, cleaning: 57, security: 0, list: current()},
  };
}

// The business the panel opens, with a Crew list overlapping the roster's.
function business(){
  return {
    key: KEY, status: 'retail', name: '[HK] HART. Clothing', code: 'HK', type: 'Clothing Store',
    address: '12 Second Avenue', neighbourhood: "Hell's Kitchen",
    opened: 12, revenue: 3491, customers: 90, basket: 38.79, profit: 1200, margin: 34.4,
    cogs: 100, wages: 2000, rent: 291, marketing: 0, theft: 0, licensing: 0,
    staff: 2, staffCost: 400, uniformGaps: [], crew: [{role: 'Cashier', count: 2, daily: 400, absent: 0}],
    people: [{name: 'Bill Burnett', role: 'Cashier', absent: false, daily: 200},
      {name: 'Dana Reyes', role: 'Cashier', absent: false, daily: 200}],
    lines: [], series: [], rhythm: null, peakDay: null, swing: 0, daysOpen: 40,
  };
}

async function shop(over = {}, boot){
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
  }, [[row(over)], business()]);
  return page;
}

const block = page => page.locator('#sp-roster');

// --- the shapes, without a page between them and the assertion ---------------

test('a shift row lands on its own station and weekday, and a stray one is dropped', async () => {
  const page = await shop();
  try {
    const rows = await page.evaluate(() => {
      const r = spRosterRow('ba:street_secondavenue#12');
      return spRosterRows(r, r.shifts).map(day => day.map(shifts => shifts.map(s => `${s.f}-${s.t}`)));
    });
    // Sunday is shut, Monday has a counter, a cleaning station and the bench
    // shift, and the row pointing at station 9 on Friday reached nothing.
    assert.deepEqual(rows[0], [[], [], [], []]);
    assert.deepEqual(rows[1], [['8-20'], ['12-16'], ['8-20'], []]);
    assert.deepEqual(rows[5], [['8-20'], [], ['8-20'], []]);
    assert.equal(rows.flat(2).length, 15, 'the stray row is not drawn anywhere');
  } finally { await page.close(); }
});

test('a day identical to an earlier one is named as its copy, and an empty day is nobody\'s', async () => {
  const page = await shop();
  try {
    const same = await page.evaluate(() => {
      const r = spRosterRow('ba:street_secondavenue#12');
      return spSameDays(spRosterRows(r, r.shifts));
    });
    assert.equal(same[0], null, 'Sunday is shut, not a copy of anything');
    assert.equal(same[1], null, 'Monday is the first of its kind');
    assert.equal(same[2], 1, 'Tuesday is Monday again, people and all');
    assert.equal(same[3], null, 'Wednesday has a different person on the counter');
  } finally { await page.close(); }
});

test('a day matching in hours but not in people is not a copy', async () => {
  const page = await shop();
  try {
    const same = await page.evaluate(() => {
      const r = spRosterRow('ba:street_secondavenue#12');
      const days = spRosterRows(r, r.shifts);
      // Tuesday, with one shift handed to somebody else: the same hours at the
      // same stations, which is what "copy schedule" would get wrong.
      days[2][0][0] = Object.assign({}, days[2][0][0], {p: 4});
      return spSameDays(days);
    });
    assert.equal(same[2], null);
  } finally { await page.close(); }
});

test('only the plan\'s own shifts count as typed', async () => {
  const page = await shop();
  try {
    const counted = await page.evaluate(() => {
      const r = spRosterRow('ba:street_secondavenue#12');
      const ticks = new Set([spTickId(r.shifts[0]), '3-0-9', 'nonsense']);
      return [spTyped(r.shifts, ticks), r.shifts.length];
    });
    assert.deepEqual(counted, [1, 16], 'two ticks match nothing in this plan');
  } finally { await page.close(); }
});

test('the counts are the plan against what the schedule holds today', async () => {
  const page = await shop();
  try {
    const counts = await page.evaluate(() => spRosterCounts(spRosterRow('ba:street_secondavenue#12')));
    assert.deepEqual(counts, {plan: 16, now: 72, fragments: 72});
  } finally { await page.close(); }
});

test('a week of nothing but thin days has no measured hour to plan from', async () => {
  const page = await shop();
  try {
    const answers = await page.evaluate(() => {
      const none = Array.from({length: 7}, () => Array(24).fill('none'));
      const r = spRosterRow('ba:street_secondavenue#12');
      return [
        spRosterMeasured(r),
        spRosterMeasured(Object.assign({}, r, {basis: {'ba:skill_customerservice': none}})),
        spRosterMeasured({key: 'x', name: 'x', failed: true}),
        spRosterMeasured(null),
      ];
    });
    assert.deepEqual(answers, [true, false, false, false]);
  } finally { await page.close(); }
});

// --- the block --------------------------------------------------------------

test('the need strip says what each basis is, and never calls a censored hour a target', async () => {
  const page = await shop();
  try {
    const reads = await page.evaluate(() => {
      const day = q('#sp-roster .sp-day[data-d="4"] .sp-grow.need');
      return [...day.querySelectorAll('.sp-need')].map(i => [i.className, i.dataset.read]);
    });
    const censored = reads.find(([, r]) => /13:00/.test(r));
    assert.match(censored[0], /\bc\b/, 'a censored hour is hatched');
    assert.match(censored[1], /measured at the ceiling.*floor, not a target/);
    const measured = reads.find(([, r]) => /09:00/.test(r));
    assert.doesNotMatch(measured[0], /\bc\b|\bs\b/);
    assert.match(measured[1], / · measured$/);
    const scaled = await page.evaluate(() =>
      q('#sp-roster .sp-day[data-d="3"] .sp-need').className);
    assert.match(scaled, /\bs\b/, 'a scaled weekday is outlined');
    // A shut day draws no bar at all: an unknown is never a zero.
    assert.equal(await page.locator('#sp-roster .sp-day[data-d="0"] .sp-need').count(), 0);
  } finally { await page.close(); }
});

test('a shift bar wears its kind, its pin and the bench mark', async () => {
  const page = await shop();
  try {
    const mon = '#sp-roster .sp-day[data-d="1"] ';
    const cleaning = await page.locator(mon + '.sp-shift.clean').first();
    assert.match(await cleaning.getAttribute('data-read'), /Cleaning Station/);
    // Dana Reyes is on the bench and her Monday shift answers her demand, so
    // she carries both marks and the read-out says which is which.
    const dana = page.locator(mon + '.sp-shift[data-p="3"]');
    assert.equal(await dana.locator('.pin').count(), 1);
    const read = await dana.getAttribute('data-read');
    assert.match(read, /No afternoon shifts: the plan works around it/);
    assert.equal(await page.locator('#sp-roster .sp-step[data-p="3"]').count(), 1,
      'the bench needs a MyEmployees step of its own');
  } finally { await page.close(); }
});

test('a line nobody can be given is a dashed hire, and cannot be ticked', async () => {
  const page = await shop();
  try {
    const hire = page.locator('#sp-roster .sp-day[data-d="6"] .sp-shift.hire');
    assert.equal(await hire.count(), 1);
    assert.equal(await hire.evaluate(el => el.tagName), 'SPAN', 'nothing to type yet');
    assert.match(await hire.getAttribute('data-read'), /nobody to give it to/);
  } finally { await page.close(); }
});

test('a day that is an earlier day again is marked as its copy', async () => {
  const page = await shop();
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
  const page = await shop();
  try {
    const guard = page.locator('#sp-roster .sp-hc .new').first();
    assert.match(await guard.innerText(), /\+72 h\/wk/);
    assert.match(await guard.getAttribute('data-read'), /new spending.*nobody covers this locker today/);
    // Customer Service and Cleaning Station are both "CS": the codes on the
    // line have to stay apart or the shop looks like it has two of one role.
    const codes = await page.$$eval('#sp-roster .sp-hc .code', cs => cs.map(c => c.textContent));
    assert.equal(new Set(codes).size, codes.length, codes.join(','));
  } finally { await page.close(); }
});

test('the bench is counted apart from the people already here', async () => {
  const page = await shop();
  try {
    const serve = await page.$eval('#sp-roster .sp-hc > span:nth-child(2)',
      el => [el.querySelectorAll('.sp-dot').length,
        el.querySelectorAll('.sp-dot.bench').length,
        el.querySelectorAll('.sp-dot.hire').length, el.textContent]);
    // have 4, one of them off the bench, plus a hiring line.
    assert.deepEqual(serve.slice(0, 3), [5, 1, 1]);
    assert.match(serve[3], /3 · 1 bench · hire 1/);
  } finally { await page.close(); }
});

test('only the first few people the plan would leave short are named', async () => {
  const page = await shop();
  try {
    const text = await page.locator('#sp-roster .sp-hc').innerText();
    assert.match(text, /Dana Reyes\s+8\/30 h/);
    assert.match(text, /\+1 more/, 'four short, three shown');
    assert.match(text, /Dana Reyes\s+2\/4 days/);
  } finally { await page.close(); }
});

test('the now/plan toggle swaps the plan for the fragments the game holds', async () => {
  const page = await shop();
  try {
    const mon = '#sp-roster .sp-day[data-d="1"] ';
    assert.equal(await page.locator(mon + '.sp-frag').count(), 6, 'six two-hour scraps');
    await page.evaluate(() => q('#sp-roster .sp-nowplan a[data-view="now"]').click());
    assert.match(await page.locator('#sp-roster .sp-gantt').getAttribute('class'), /\bnow\b/);
    assert.match(await page.locator('#sp-roster .sp-ba').innerText(), /108?\s|72/);
  } finally { await page.close(); }
});

test('hovering a shift lights that person everywhere they are named', async () => {
  const page = await shop();
  try {
    await page.evaluate(() => q('#sp-roster .sp-day[data-d="1"] .sp-shift[data-p="3"]')
      .dispatchEvent(new MouseEvent('mouseover', {bubbles: true})));
    const lit = await page.$$eval('#sitePanel .sp-me', els => els.map(e => e.className));
    // The shift, the bench step, both demand chips, and her Crew pill.
    assert.ok(lit.length >= 4, lit.join(' | '));
    assert.ok(lit.some(c => /person/.test(c)), 'the Crew pill too');
  } finally { await page.close(); }
});

test('a name held by two people is not tied to a roster person at all', async () => {
  const page = await shop();
  try {
    const both = await page.evaluate(() => {
      const b = D.businesses[0];
      b.people = [{name: 'Dana Reyes', role: 'Cashier', absent: false, daily: 200},
        {name: 'Dana Reyes', role: 'Cleaner', absent: false, daily: 200}];
      drawSite();
      return $$('#sp-crew .person[data-p]').length;
    });
    assert.equal(both, 0, 'an ambiguous name lights nobody');
  } finally { await page.close(); }
});

test('a name out of the save is text on the bar, never markup', async () => {
  const page = await shop();
  try {
    const bar = page.locator('#sp-roster .sp-day[data-d="4"] .sp-shift').first();
    assert.match(await bar.innerText(), /<script>bad<\/script>/);
    assert.equal(await page.locator('#sp-roster script').count(), 0);
  } finally { await page.close(); }
});

test('a tick is kept per site and survives the next draw', async () => {
  const page = await shop();
  try {
    const first = '#sp-roster .sp-day[data-d="1"] button.sp-shift';
    const bar = page.locator(first).first();
    await page.evaluate(s => q(s).click(), first);
    assert.match(await bar.getAttribute('class'), /\bdone\b/);
    assert.equal(await page.locator('#sp-roster .sp-count').innerText(), '1');
    const stored = await page.evaluate(() => localStorage.getItem('ba_dash_roster:ba:street_secondavenue#12'));
    assert.match(stored, /"1-0-8"/);
    await page.evaluate(() => drawSite());
    assert.match(await bar.getAttribute('class'), /\bdone\b/, 'the tick came back');
    await page.evaluate(() => q('#sp-roster .sp-clear').click());
    assert.equal(await page.locator('#sp-roster .sp-shift.done').count(), 0);
    assert.equal(await page.evaluate(
      () => localStorage.getItem('ba_dash_roster:ba:street_secondavenue#12')), null);
  } finally { await page.close(); }
});

test('the block draws and ticks without storage of any kind', async () => {
  // The single case the try/catch is for: a browser that throws on every
  // localStorage access. The plan is still there and still clickable.
  const page = await shop({}, () => {
    Object.defineProperty(window, 'localStorage',
      {get(){ throw new Error('site data blocked'); }});
  });
  try {
    assert.equal(await page.locator('#sp-roster button.sp-shift').count(), 14);
    await page.evaluate(() => q('#sp-roster .sp-day[data-d="1"] button.sp-shift').click());
    assert.equal(await page.locator('#sp-roster .sp-count').innerText(), '1');
  } finally { await page.close(); }
});

// --- the states the payload can be in ---------------------------------------

test('an unmeasured shop with cover to type gets the whole block, not the empty state', async () => {
  const page = await shop(coverOnly());
  try {
    // The point of the block for these shops: 182 scraps become 14 shifts, and
    // every one of them is a line to type and tick.
    assert.equal(await page.locator('#sp-roster button.sp-shift').count(), 14);
    assert.match(await page.locator('#sp-roster .sp-ba').innerText(), /182/);
    assert.equal(await page.locator('#sp-roster .sp-count').innerText(), '0');
    assert.equal(await page.locator('#sp-roster .sp-daytabs a').count(), 7);
    assert.equal(await page.locator('#sp-roster .sp-nowplan a').count(), 2);
    assert.equal(await page.locator('#sp-roster .sp-read.sp-readout').innerText(), 'Hover a shift');
    // The security locker nobody staffs is still money not being spent yet.
    assert.match(await page.locator('#sp-roster .sp-hc').innerText(), /\+120 h\/wk/);
  } finally { await page.close(); }
});

test('an unmeasured need strip is empty and says so in two words, inventing no number', async () => {
  const page = await shop(coverOnly());
  try {
    assert.equal(await page.locator('#sp-roster .sp-need').count(), 0, 'no bar is a guess');
    assert.equal(await page.locator('#sp-roster .sp-grow.need.unmeas').count(), 7);
    const chip = page.locator('#sp-roster .sp-hchip.unmeas');
    assert.equal(await chip.innerText(), 'Not measured');
    assert.match(await chip.getAttribute('data-tip'), /two weeks of hour reports/);
    // The serving counters keep their rows, with nothing in them.
    const mon = '#sp-roster .sp-day[data-d="1"] ';
    assert.equal(await page.locator(mon + '.sp-grow').count(), 5, 'the strip and four stations');
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
  const page = await shop({basis: {[SERVE]: NONE}, shifts: []});
  try {
    assert.equal(await page.locator('#sp-roster .sp-shift').count(), 0);
    assert.equal(await page.locator('#sp-roster .sp-read').innerText(), 'Nothing to roster');
    assert.equal(await page.locator('#sp-roster .sp-daytabs').count(), 0);
    assert.match(await page.locator('#sp-roster .sechead .why').getAttribute('data-tip'),
      /arrival ceiling over-predicts a shop like this fourfold/);
    assert.equal(await page.locator('#sp-roster .sp-gantt .sp-grow').count(), 4,
      'the stations are still named');
  } finally { await page.close(); }
});

test('a site the planner could not plan says so rather than leaving a hole', async () => {
  const page = await shop({}, null);
  try {
    await page.evaluate(() => {
      D.staffing = [{key: 'ba:street_secondavenue#12', name: '[HK] HART. Clothing', typeSlug: 'x', failed: true}];
      drawSite();
    });
    assert.equal(await page.locator('#sp-roster .sp-read').innerText(), 'Plan unavailable');
    assert.match(await page.locator('#sp-roster .sechead .why').getAttribute('data-tip'),
      /could not be read.*Nothing else on the board is affected/);
  } finally { await page.close(); }
});

test('a shop with no row at all draws the block and throws nothing', async () => {
  const page = await shop({}, null);
  try {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => { D.staffing = []; drawSite(); });
    assert.equal(await block(page).count(), 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('a row of nothing but edges still draws', async () => {
  const page = await shop({}, null);
  try {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => {
      const r = D.staffing[0];
      Object.assign(r, {
        shifts: [{d: 9, s: 0, f: 0, t: 4, p: 0}, {d: 1, s: -1, f: 0, t: 4, p: 99},
          {d: 1, s: 0, f: 0, t: 4, p: null}],
        people: [], stations: [], roles: [], bench: [], placed: [],
        shortHours: [], shortDays: [], headcount: {},
        open: Array.from({length: 7}, () => []),
        current: {shifts: 0, fragments: 0, cleaning: 0, security: 0, list: []},
        slack: {}, cost: {},
      });
      drawSite();
    });
    assert.equal(await block(page).count(), 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('forty stations and sixty people draw without falling over', async () => {
  const page = await shop({}, null);
  try {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const rows = await page.evaluate(() => {
      const r = D.staffing[0];
      r.stations = Array.from({length: 40}, (_, k) => (
        {id: 's' + k, name: 'Checkout Counter', skill: 'ba:skill_customerservice', rate: 30}));
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

test('a weekday with two opening slots is drawn, and the shut hour between them stays empty', async () => {
  const page = await shop();
  try {
    // Friday (5) opens 08-12 and 14-20, and nothing is rostered into 12-14.
    const bars = await page.$$eval('#sp-roster .sp-day[data-d="5"] .sp-shift',
      els => els.map(e => e.getAttribute('style')));
    assert.ok(bars.length, 'Friday is planned');
    assert.equal(await page.locator('#sp-roster .sp-day[data-d="0"].shut').count(), 0);
    assert.ok(await page.locator('#sp-roster .sp-day[data-d="0"] .sp-grow.shut').count() > 0,
      'Sunday is shut all day');
  } finally { await page.close(); }
});

// --- the Next moves card ----------------------------------------------------

test('the Optimize staffing card opens the roster with most typing to save', async () => {
  const page = await shop({}, null);
  try {
    const shown = await page.evaluate(() => {
      const none = Array.from({length: 7}, () => Array(24).fill('none'));
      D.staffing = [
        Object.assign({}, D.staffing[0], {key: 'a', name: 'Small saving',
          current: Object.assign({}, D.staffing[0].current, {shifts: 25})}),
        Object.assign({}, D.staffing[0], {key: 'b', name: 'Big saving'}),
        Object.assign({}, D.staffing[0], {key: 'c', name: 'Cannot be planned', failed: true}),
        // Nothing to roster at all: no saving to offer, however many shifts
        // the schedule holds.
        Object.assign({}, D.staffing[0], {key: 'd', name: 'Nothing planned', shifts: []}),
      ];
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return [card.querySelector('.soon').textContent, card.lastElementChild.textContent, card.dataset.site];
    });
    assert.equal(shown[0], '−56 LINES');
    assert.match(shown[1], /Big saving: 72 shifts become 16\./);
    assert.equal(shown[2], 'b');
  } finally { await page.close(); }
});

test('an unmeasured shop is exactly the one the card should offer', async () => {
  const page = await shop({}, null);
  try {
    // Cover shifts alone, but 182 scraps down to 14 is the biggest week of
    // typing the board can save anybody.
    const shown = await page.evaluate(cover => {
      D.staffing = [Object.assign({}, D.staffing[0], {key: 'measured', name: 'Measured shop'}),
        Object.assign({}, D.staffing[0], cover, {key: 'new', name: 'Brand new shop'})];
      drawOptimizeStaffing();
      const card = $('optimizeStaffingCard');
      return [card.querySelector('.soon').textContent, card.dataset.site];
    }, coverOnly());
    assert.equal(shown[0], '−168 LINES');
    assert.equal(shown[1], 'new');
  } finally { await page.close(); }
});

test('the card says nothing it cannot know before the payload carries a plan', async () => {
  const page = await shop({}, null);
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
