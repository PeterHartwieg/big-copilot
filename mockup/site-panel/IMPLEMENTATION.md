# Porting the site panel

Make the live site panel (`drawSite()` and its CSS in the `ba_dashboard.py` template) match
the canvas: https://claude.ai/artifact/9FUpajdLn5KqLSricga5BA

The canvas is a draft Peter has not approved. **Get his go before PR 1.**

The spec is `mockup/site-panel/build_site_canvas.py`: `SP_CSS` is the stylesheet, `WIRE` the
behaviour, and `retail()`, `newshop()`, `office()`, `warehouse()`, `factory()`, `home()`,
`bigcrew()`, `roster_block()` the markup. Port everything it draws. The why is
`docs/site-panel-detail-scope.md`. To see an artboard at full size run the generator with
`--preview` and open `mockup/site-panel/_preview/<Board>.html` through the `web-test` launch
config; delete `_preview/` afterwards. The numbers on the canvas are invented; the shapes
are the spec.

This is a game dashboard. Where the canvas shows a state, draw it from the cheapest honest
signal the payload already has; do not build machinery to guard an edge case.

## Rules

1. Every new class keeps its `sp-` prefix (`.sw` already collided once).
2. The idle hour stays the board's `--info` ring, not the canvas's hatch; the idle chip's
   swatch matches it.
3. Tooltips go through `#tip` and `wireTips()`, not the canvas's CSS `::after`.
4. No sentences on the page: a finding's sentence is its `.more`, the rest is a `?` or the
   block's read-out line (`.sp-readout` inside `[data-readzone]`, fed by `data-read`; the
   hour grid's `#hourRead` folds into the same wiring).
5. The panel forks on a kind: `retail`, `office`, `factory` (the site has a row in
   `D.supply.factories.sites`), `depot` (any other `support` or `overhead`), `home`.

## Steps

Four PRs.

### PR 1 — the shop and office panel

1. **Wiring.** `[data-readzone]` read-outs; `data-block` on each block and `data-el` on the
   things a finding points at; `sechead` gains an `icon` option.
2. **Needs attention here.** `D.alerts` plus `D.minor.rows` filtered on `siteKey`, above
   the tiles, built from `splitFinding()` and `findingAmount()`: mark, evidence icon, what,
   amount, a down arrow, `.more`. One table beside `ALERT_LINKS`,
   `ALERT_EVIDENCE = {group: {block, hit}}`. Hover lights the block, pulses the `hit`
   elements and dims the rest; click scrolls. Top four, then "n more · show all".
   `goToAlert()` hands the finding's id to `openSite()` and that row opens `.arrived` —
   the sentence stops getting dropped on the way in.
3. **Rank.** The chip by the name: place by profit summed over the last seven entries of
   `b.series`, among sites with `status` `retail` or `office`. Ten lines of JS in
   `drawSite()`; no payload change. Under seven days of series: the dashed "–/n".
4. **Tiles.** Trend chip from this site's `D.trends` row; not `ready` → the dashed
   "day n of 14" chip from `b.daysOpen`. Fortnight sparks: revenue from `b.series`;
   customers needs a `customers` figure added to each `b.series` entry, from the
   `orderHistory` rows `_business()` already reads. The cost
   bar replaces the Profit tile's cost tooltip and is where `b.rent` shows. Red dot on a
   loss. Ceiling icons lit from the `hourFindings` `cap` row's `limit`.
5. **Standards.** `b.satisfaction` as four bars against the 80 line. Lamps: one new field,
   `b.amenities = {slug: true|false}`, written in `_business()` where `not_made` is already
   in hand (a slug the type never asks for is simply not in the dict). Lit for `true`,
   struck for `false`; **all dashed when `b.revenue` is 0** — that is the whole
   never-scored rule. Locker from `b.missingUniformLocker`, role chips and the Crew pills'
   shirt mark from `b.uniformGaps`. Offices get the bars only.
6. **Pull** (retail). `b.traffic` + `b.marketingIndex` against 100, `b.security`,
   `b.capacity`, and the wave row from `D.hypeExposure[].sites[]`; `baseline: null` draws
   the hatched bar.
7. **Hours.** The `cap` and `idle` sentences move from the `?` into chips under the grid;
   hovering one dims the other cells. `tests/office_site.test.cjs` reads that tooltip and
   the head "Customers by hour": update it with the rename to "Hours".
8. **Crew.** Demand chips with `staffDemands[].priority` as three bars, the building icon
   for `company`, the red exit chip for `quitWarnings`. Replaces the sentence
   `tests/job_demands.test.cjs` asserts; rewrite that assertion. Over `CREW_MAX` the pills
   fold into role rows, a dot a person (`bigcrew()`), from `b.people[]`.
9. **Shelves.** From the `D.supply.shops` lookup already in `drawSite()`: no target → "no
   plan" chip; `peakSold` over `target` → red Busiest and the `now → set` chip; zero on
   hand in red.
10. **Not trading.** `_alerts()` already builds a `reasons` list in its `silent` loop; also
    store the failing slugs on the business (`b.notTrading = ["stock", "plan"]`, absent
    when trading). The five lamps in JS: red if in the list, grey if it comes after a red
    one among prices → stock → shelves (the alert stops at the first of those that fails),
    green otherwise. An office draws staff and prices only.
11. **Profit and Week.** Last-7 and prev-7 bands with their averages on `miniChart()` when
    the trend is `ready`, else the dashed line; the delta chip in the head.

### PR 2 — depot and factory

12. **Depot.** Tiles; the Stock table from this site's `D.supply.imports` and
    `D.supply.idle` rows with the seven-day rail (`cover`, `runsOut`, `arrives`, `paused`);
    Feeds from `D.supply.shops` and factory `needs` rows whose `from` is this site.
13. **Factory.** Lines from the site's `D.supply.factories.sites` row: a square a machine,
    full unless the machine is in the line's `gaps`, then `hours / 168`; `unnamed` rows keep
    today's `linepick` select and `nameLine()`. Inputs from `needs`. Hovering an input
    lights `row.lines`.

### PR 3 — home

14. `openSite()` only knows `D.businesses`. Add a home branch entered from the map card;
    add `m` and `hood` to `_homes()` from `load_buildings()`. Four tiles and the drawing.
    No picker entry.

### PR 4 — roster

15. Blocked on `docs/staffing-assistant-scope.md` PR 3 and its `staffing` key.
    `roster_block()` maps one to one: `need` + `basis` → the strip (`censored` hatched,
    `scaled` outlined), `shifts` → bars by `kind`, `employee: null` → dashed hire,
    `fromBench` → the bench mark and the MyEmployees step, `placed` → the pin, `headcount`
    → the dot rows, `shortHours`, `slack`, `cost`, `current.shifts`. Day tabs link days
    whose shifts are equal. `basis: none` all week → the empty state.
    The now/plan toggle needs the current shifts, and the scope's `current` carries only
    counts: ask that PR to add `current.list` (`_factories()` and `_hourly()` already walk
    `scheduleDays`); until it exists, ship without the toggle.
    Ticks live in `localStorage` under `ba_dash_roster:<siteKey>` as a list of
    `wd-station-from` strings, with a "clear ticks" link; no invalidation.

### Each PR

Tests, `python build_web.py`, compare a `HART. YT` render with the artboard at 1440 px in
both themes, review rounds until no SHOULD-FIX, deploy. One changelog entry with PR 1;
PR 2 to 4 each add one if Peter counts them as new capability.
`docs/dashboard-reference.md` gets the new blocks with PR 1.

## UI work and mechanical work

**Mechanical** is checked by a test alone: payload fields, lookups, tables, wiring, moving
text, rewriting assertions, copying `SP_CSS` rules across verbatim. It needs the code, not
the canvas, and can go to the cheaper worker.
**UI** is judged by eye against the artboard in both themes: markup, layout, states,
hover and motion. It needs the canvas open and a render compared at 1440 px.

Within a PR, land the mechanical half first; the UI half then draws from fields that exist.

| Step | Mechanical | UI |
| --- | --- | --- |
| 1 Wiring | all of it: read-out wiring, `data-block`, `data-el`, `sechead` icon option | — |
| 2 Needs attention | the `siteKey` filter, `ALERT_EVIDENCE`, finding id through `goToAlert()` → `openSite()`, show-all toggle | the row, the lit and dimmed blocks, the pulse, the `.arrived` row |
| 3 Rank | the seven-day sum and the place | the chip and its ladder |
| 4 Tiles | `D.trends` lookup, `customers` into `b.series` (Python), binding limit from `hourFindings` | cost bar, sparks, ceiling icons, flag dot, the two chips |
| 5 Standards | `b.amenities` in `_business()` and its test | the four bars and the 80 line, lamps in three states, role chips, shirt mark |
| 6 Pull | finding this site's `hypeExposure` row | all the rest: promo bar, magnet, minis, wave row |
| 7 Hours | sentences out of the `?`, the rename, the `office_site` test update | the two chips and the cell dimming |
| 8 Crew | the `job_demands` assertion rewrite, the over-`CREW_MAX` switch | demand chips and priority bars, exit chip, role rows and dots |
| 9 Shelves | all the conditions on the existing table | — (three small chips, copied from the generator) |
| 10 Not trading | `b.notTrading` in `_alerts()`/`_business()` and its test, the red/grey/green rule | the lamps by the name, the red head lamp |
| 11 Profit and Week | the two seven-day averages | bands, average lines, dashed not-ready line, delta chip |
| 12 Depot | row lookups for Stock and Feeds, the kind fork | the seven-day rail and truck, tiles, feed bars |
| 13 Factory | row lookups, reusing `linepick`/`nameLine()`, input → lines map | machine squares and their fill, belt, idle and unnamed squares |
| 14 Home | `m` and `hood` in `_homes()`, the `openSite()` home branch, map-card entry | the drawing and the four tiles |
| 15 Roster | payload → rows mapping, equal-day detection, the `localStorage` ticks, typed count | the whole grid: need strip, shift bars by kind, hire bars, pins, tabs, headcount dots, toggle, person ↔ shift hover |
| Each PR | tests, `build_web.py`, docs, changelog | the render against the artboard, both themes |

Roughly: steps 1 and 9 are wholly mechanical; 6, 11 and 15 are mostly UI; the rest split
about evenly, with the mechanical half small.

## Tests

One new file, `tests/site_panel.test.cjs`, on the `office_site` pattern, grown per PR:

- findings filter by `siteKey`, and a finding's group lights its block
- an office draws no lamps and no Pull; a depot draws no hour grid
- a site with no revenue draws every lamp dashed and none lit
- 13 people fold into role rows, 12 stay pills
- rank is 1 for the best seven-day profit

Plus the two rewritten assertions named in steps 7 and 8, and one Python test each for
`b.amenities` (a florist has no music key) and `b.notTrading`.

## Ask Peter

- Rank denominator: his example was "1/35", every site. The canvas counts the sites that
  trade (31), because a depot books no sale and would always read last.
- Does an office have a promotion figure worth drawing? Assumed not.
- Phone: nothing is drawn under 760 px.

## Done

Each kind of site renders its artboard's blocks and no others at 1440 px, in both themes.
Arriving from a site-level finding lands on its open row with the evidence lit.
