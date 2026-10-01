# UI redesign, chunk 2 (Supply and Staffing): handoff

27 September 2026 · Opus 5.5 (`claude-opus-5-5`) · worktree `codex/ui-redesign-chunk2` on
`dd16dfd`, not committed. Chunk 2 of the [implementation plan](ui-implementation-plan.md); the
redesign as a whole is not complete (chunk 3 remains).

## What changed

**Supply** is five task views behind the fixed routes (`docs/archive/ui-route-migration.md`):

| Route | Section | What it shows |
| --- | --- | --- |
| `supply/changes` | `secChanges` | The one checklist, grouped Imports, Deliveries, Production; the truck's road ("N of M recorded or applied"), Copy remaining with its fallback and a preview of the copied text, Apply N import amounts (game link only), Clear my marks, the basis, and the records a later read confirmed or not |
| `supply/imports` | `secImports` | A card reviewing one import line: the recurring order (now → box, "Planned for …", Reset to N under the other basis, the scale, the factory-hours dependency, state, Preview in the game, Mark done by you) beside the one-time catch-up (its own mark, "by hand; no game-link write"); Why and Manual instructions from the same row; Copy; Follow its supply route. Then every import line: depots' and factories' own, and No depot |
| `supply/deliveries` | `secDeliveries` | By destination: shops' shelves and top-ups, second-tier warehouses (route-fed top-ups, wholesale, idle, not routed), factory inputs |
| `supply/production` | `secProduction` | Machine-hour tiles (staffed now as an observation, both bases), factories' lines, hours and inputs, factory staffing, unnamed-recipe pickers; an empty state with no factory |
| `supply/flow` | `secFlow` | The diagram (or the chain when narrow) as its own view, a followed site with its panel and the changes on its route; Table goes back to the view the reader came from |

Shops, warehouses and factories are each view's *Scope* select. Needs a change / Everything,
the scope, the reviewed line and the followed site ride on the history entry (`nxSb`), so Back,
Forward and a reload give a view back as it was. Old section ids, remembered tabs
(`SUPPLY_WAS`) and `#sbStrip` land on the view that took their place.

**One proposed-plan record.** `supplyChecklistRows()` → `buildOrderChecklist()` stays the
single source; each row now carries its view, basis, review flag and dependencies. The card,
Why, manual steps, Copy, Changes, the Overview's Details (`ovPlanHtml()`) and the game-link
write all read the same row, so the figure, basis and unit agree everywhere (tested under both
bases).

**Planning basis per company**: `ba_dash_sizing:<character>`; the old device key is a
read-only fallback. Switching keeps an edited figure, shows the basis it was set under, the
other basis's suggestion and Reset to N.

**Import figures v3** (`ba_import_set_v3:<character>`, `{value, inGame, basis}`): v2 entries
migrate with `basis: null`, shown as Needs review and kept out of every write until kept or
reset; v2 is removed only after v3 is written and reads back; refused storage keeps v2 and the
page copy.

**Three meanings of done**: Marked by you, Applied · awaiting refresh, Confirmed, with
postconditions for imports, schedules and hires in
[`docs/archive/ui-progress-postconditions.md`](ui-progress-postconditions.md). Store:
`ba_progress_v1:<character>`. Applied is only set from a successful write's answer; Confirmed
only by a later board (board counter and game clock both later) that holds the postcondition.
v1/v2 marks and schedule ticks are kept and read as Marked by you; marks survive a basis switch.

**Factory-hours dependency** under both bases: named on the card with machines, now → needed
hours and the consequence; its own step in the manual instructions and the copied text; a
non-writable "Factory run hours" row on Changes that opens Production. The game link never
writes factory hours.

**Staffing**: Schedules is a list of shops and offices (plan state and progress) beside the
chosen one's planner, the same `spRosterBlock()`/`spOfficeRoster()` and write a business's
page carries (id `schRoster`), with the pick on the history entry (`nxSch`). Staff needs is one
page: Unmet demands, the last hire or move from here with its state (no undo), then the hiring
page under "Whom to hire"; "Write their week" opens Schedules on the site. Payroll: rate and
booked tiles with their difference, roles, and the sites whose books part from their rates.
`staff` (shop/office) and `idlestaff` findings open Schedules on the business; `topup` and
`wholesale` open Deliveries on the row.

**Chunk-1 carry-overs**: the Ask strip's re-pick on the guide already open (`ssRepick`), with a
test asking "Are my prices right?" on that guide, re-picking, and Back returning to it; a
Schedules test for the office plural (one and three computers).

Supported writes kept, with their guards: imports (preview, caps, refusals, uncovered amounts,
undo), shop and office schedules (undo), hire and move (no undo), uniform (unchanged).

## Files

Source: `ba_dashboard.py`. Docs: `docs/architecture.md`, `docs/dashboard-reference.md`,
`docs/archive/ui-route-migration.md`, new `docs/archive/ui-progress-postconditions.md`, this note.
Tests: new `tests/progress.test.cjs`; migrated `alert_kinds`, `calm_refresh`, `findability`,
`flow_chain`, `game_link_write`, `game_names`, `hostile_names`, `import_routes`,
`import_setto`, `layout`, `navigation`, `order_checklist`, `restore`, `roster`, `search`,
`shell_routes`, `site_panel`, `staff_hire`, `supply_sort`, `today_layout` (`.test.cjs`).
Generated by `python build_web.py`: `web/index.html`, `web/py/ba_dashboard.py`,
`web/version.json`, `web/i18n/de.json`. `web/names/*.json`, `web/wiki/**`, `web/wiki-data.json`,
`web/sitemap.xml` and `web/robots.txt` show as modified only through CRLF line endings from the
build (`git diff --ignore-cr-at-eol` is empty); no content change.

## Validation

Run in the foreground, Edge (`PLAYWRIGHT_CHANNEL=msedge`), `--test-concurrency=2`:

| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (final source) | 1366 run, OK, 1 skipped |
| `node --test --test-concurrency=2 tests/*.test.cjs` (CLI target) | 1212 tests, 1211 pass, 0 fail, 1 skipped |
| The same, rerun on the final source for the files the last two changes touch (`import_routes`, `import_setto`, `game_link_write`, `hostile_names`, `supply_sort`, `layout`, `findability`, `i18n_layout`, `shell_routes`) | 233 tests, 233 pass |
| `tests/progress.test.cjs`, CLI and `BOARD_TARGET=web` (after its harness fix) | 10/10 each |
| `BOARD_TARGET=web` on `shell_routes`, `search`, `import_routes`, `import_setto`, `supply_sort`, `flow_chain`, `roster`, `progress` | 284 tests: 274 pass, and the 10 of `progress` that failed only on the harness serving HTML for the page's script files; after the fix, `progress` 10/10 on web |
| `python build_web.py`, then `python build_web.py --check` | exit 0, "web/ is up to date" |

One late change, the Imports scale's labels (marks close together no longer print over each
other), came in partway through the full Node run, hence the rerun above. Just before that
run: Supply's other views now learn of an import write or its undo when next shown
(`pgSupplyStale()`).

Screenshots (synthetic day-47 save, `python tests/save_fixtures.py demo.hsg 47`), light 1440
full page, dark 1440 and light/dark 1024 first screen, of every Supply and Staffing view: this
session's scratchpad `final/`. No sideways scroll and no page error at 1440 or 1024 in either
theme. Phone widths were not reviewed (optional).

## Tradeoffs and limits

- A business's own page still carries the same planner block as Schedules; chunk 3 decides
  what the business page keeps.
- A hire or move to a warehouse or a headquarters cannot be confirmed from the save (no people
  list is read there); it stays Applied and says "not in the save yet".
- The uniform write keeps its own dialog and undo; its progress entry is chunk 3's.
- Goods flow has no product filter.
- The Staff needs hiring page (main's Staff page) is still English-only text, as it shipped.
- The Imports scale merges labels of marks within a tenth of the scale into one label.
- No changelog entry (the coordinator decides at release).
- Deferred to chunk 3, untouched: City map vs Finder history; phone Tab order in finding rows.

## Round 1 fixes (27 September 2026)

Three reviews of `90a871e` (Opus code, Sol code, Sol QA) held it. Each fix below has a test that
fails on `90a871e` and passes now (checked by running the new tests on a `git archive 90a871e`
copy); the three dialog assertions of item 8 pass on both, since that path already worked and
the finding was missing coverage.

| # | Finding | Fix | Test |
| --- | --- | --- | --- |
| 1 | Sol MUST: Confirmed never arrived after a reload (`boardSeq` restarts per page load) | The company's board count `n` lives in its progress store and survives reloads (`pgBoard()` from `takeData()`); a record keeps `seq` (that count) and `load` (the page load). After a reload the game clock must also have moved on, so a save read again at the write's own minute judges nothing | `progress`: "a write made before a reload is confirmed by a later board after it; …" |
| 2 | Sol MUST: an edited import's factory-hours dependency and copied text used the basis on screen | `sbDeps()` plans on the figure's own basis (`r.basis`); the card's dependency names it ("15,500, planned for full production, assumes these hours"); the Changes hours row is the line's own only where it asks the same hours, else a row of its own that says its basis; the copied text says once that lines naming another basis keep their plan | `progress`: "a figure typed under one basis keeps it after a switch: …" |
| 3 | QA MUST: the dependency and Production's "Staffed now" used the least-staffed machine's hours for every machine | `sbMachineHours()` reads each machine's week from `gaps` (by slot; the rest run 168 h); the dependency names each machine's hours ("staffed 12 h and 0 h a day → 24 h a day each"), and the consequence is the recipe's draw per machine-hour × (staffed machine-hours − planned); the tile sums real machine-hours; the manual step and both Changes hours rows say the per-machine hours (a thin weekday is still named where there is one) | `progress`: "the factory hours an import assumes are each machine's: 12 h and 0 h at the day-47 brewery" (6,300 a week less under full production, 700 under shop demand; tile 12) |
| 4 | Opus SHOULD 1: an old record put Confirmed on a new finding for the same line | `pgStateAt()` uses the record fallback only where the site and item have no checklist row open | `progress`: "an old write's record lights a finding only where its line has no open change" (through `ovStatePill`) |
| 5 | Opus SHOULD 2: the import preview did not name the basis | Each `.gw-line` says "Planned for {basis}" or "Your figure, planned for {basis}" | `game_link_write`: "imports: the preview names each line's planning basis, under both bases" |
| 6 | Opus SHOULD 3: Supply view state rode on indexes and crossed companies | The history entry keeps sites by key (`sbSnap()`), read back by key (`sbRestore()`; an index-only entry keeps no line); `sbBoard()` moves the reviewed line and the landing by key on each board; a `site:` scope the board lacks reads as the whole company in the list and the select (`sbScopeOf()`); another company's board or entry resets scope, line, landing and followed site (`sbForget()`) | `progress`: "Supply's view state is the company's, …" and "a site gone from the company is no scope: …" |
| 7 | QA SHOULD: Goods flow drew Brewery before Hub | `flowLayout()` takes its columns from `flowStages()` (as the narrow chain does), shops last, each headed by its kind | `progress`: "Goods flow draws the chain in the order the goods travel: Pier, Hub, Brewery, shops" (day-47 save) |
| 8 | Opus LOW 2, 3, 4, NIT; QA LOW | Changes' N of M counts the rows only (confirmed records listed, not counted), as the Overview does, and Copy remaining, its count and preview follow the scope; "Checked on a later read" lists import records only; the two tips name Full production and Shop demand; Production says staffed / scheduled, not rostered / shift / posted; the real imports, schedule and hire dialogs are asserted to record (and imports and schedule confirm on the board read after), and Undo to drop | `progress`: "Changes counts what the Overview counts, …", "Production speaks the board's words: …"; `game_link_write`: the imports and schedule write tests; `staff_hire`: "Review: the dry run, …" |

Known and left (coordinator's call): Opus LOW 1, a read already in flight at Apply judged as
later in the same page load; recorded in `docs/archive/ui-progress-postconditions.md`.

Changed English: new keys for the reworded strings (`sb.dep.line.each`, `sb.card.dep.lead.basis`,
`sb.card.do.hours.each`, `sb.ck.dep.each.now`, `sb.ck.dep.one.now`, `sb.ck.staff.each.now`,
`sb.line.short.each`, `sb.line.schedule`, `sb.gw.basis`, `sb.gw.basis.own`, `sb.ck.copy.mixed`,
`sb.dep.h`); the German of the edited ones (`sb.col.eats.tip`, `sb.staff.why`,
`sb.line.rostered*`, `sb.line.short.thin`, `sb.line.atRoster`, `sb.fac.*.tip`,
`sb.col.machines.tip`, `sb.staff.line.tip`) is stale and shows English until redone.

Also changed in tests: `import_routes` (the reworded line status; the second Cake line's `gaps`
now follow its own slots, which the per-machine reading needs) and the older `progress`
dependency regexes.

Files: `ba_dashboard.py`; `docs/architecture.md`, `docs/dashboard-reference.md`,
`docs/archive/ui-progress-postconditions.md`, this note; `tests/progress.test.cjs`,
`tests/game_link_write.test.cjs`, `tests/staff_hire.test.cjs`, `tests/import_routes.test.cjs`;
generated `web/index.html`, `web/py/ba_dashboard.py`, `web/version.json`, `web/i18n/de.json`.

Validation, in the foreground, Edge, `--test-concurrency=2`, on the final source:

| Command | Result |
| --- | --- |
| `node --test` (CLI target) on `progress`, `import_routes`, `import_setto`, `supply_sort`, `flow_chain`, `roster`, `game_link_write`, `shell_routes`, `search`, `navigation`, `staff_hire`, `order_checklist`, `restore`, `calm_refresh`, `hostile_names`, `layout`, `site_panel`, `game_names`, `findability`, `alert_kinds`, `i18n_layout`, `i18n_runtime` | 773 tests, 773 pass |
| `BOARD_TARGET=web` on `progress`, `import_routes`, `shell_routes`, `search` | 140 tests, 140 pass |
| The new tests on a `git archive 90a871e` copy | 14 run: 10 fail (every fix's test), 4 pass (the dialog assertions of item 8, and one unrelated test the pattern caught) |
| `python -m unittest tests.test_css_integrity tests.test_doc_registries` | 6 tests, OK |
| `python -m unittest discover -s tests -p "test_i18n*.py"` | 35 tests, OK |
| `python build_web.py`, then `python build_web.py --check` | exit 0, "web/ is up to date" |

The full Python and Node suites were not rerun this round (CI runs them).

## Round 2 fixes (27 September 2026)

The scoped recheck of `8a58886`: Sol code READY; Opus code and Sol QA HOLD, every round-1
finding confirmed fixed. Each fix below has a test that fails on `8a58886` (run on a
`git archive 8a58886` copy, for the defect it targets) and passes now.

| # | Finding | Fix | Test |
| --- | --- | --- | --- |
| 1 | Opus SHOULD: a chain of more than four stages (a real 63-business hub-and-spoke save: importer, depot, factory, depot, factory, shops) shrank to fit the box but kept its unscaled height: ~160 px blank above and below, names at 9-10 px | The picture is always drawn 1:1; where it is wider than the box's room (`flowTooWide()`), the SVG takes its own width and the box scrolls sideways (`sb-flow-scroll`); the page does not. A resize across that line redraws (`flowWatch()`); the narrow chain is unchanged | `flow_chain`: "a six-stage chain keeps its names at full size and scrolls inside the box, with no blank band" (1280: scale 1, heads within 30 px of the top, names at the stage's 11.5 px, the box scrolls; at 2200 it fits again) |
| 2 | QA SHOULD: "{value} runs short" whenever the lines draw more than planned, without weighing the figure; Opus NIT 1: an uneven split drawing the plan's total read as a mismatch | `sbDepWords()` says how much more the lines draw at these hours, then weighs the figure against the week the depot sends at these hours (the figure's basis's week plus the lines' difference): "still covers the N a week that takes" or "runs short of the N a week that takes"; a Smart Delivery level is not weighed; machines split unevenly whose draw equals the plan's read "the machines' hours are uneven, but together they draw what {value} is planned on" | `progress`: "lines drawing more than planned: a figure that covers the draw says so, one under it runs short" (day 47, shop demand at 4 h: 700 more, 5,000 covers 2,100, 2,000 runs short) and "machines split unevenly that draw the plan's total read as uneven, …" |
| 3 | Opus LOW 1: `pgBoard()` wrote the whole store on every board, so a second tab of the same company erased the other's records | `pgSave()` merges into what is stored: another tab's records stay unless this page took them away (`gone`: undo, clear, expiry), and the count is the higher of the two; `pgBoard()` saves where this page or the store holds records | `progress`: "two tabs of one company: a board in one keeps the other's records, and an undo in one stays undone" |

Left as asked: Opus NIT 2 (the hours row's figure is the least-staffed machine's). Known: a tab
shows the other tab's new records only after a reload, and a record the other tab removed can
come back from a tab that had already loaded it.

Files: `ba_dashboard.py`; `docs/archive/ui-chunk-2-handoff.md`, `docs/archive/ui-progress-postconditions.md`,
`docs/dashboard-reference.md`; `tests/flow_chain.test.cjs`, `tests/progress.test.cjs`;
generated `web/index.html`, `web/py/ba_dashboard.py`, `web/version.json`.

Validation, in the foreground, Edge, `--test-concurrency=2`, on the final source:

| Command | Result |
| --- | --- |
| `node --test` (CLI target) on `flow_chain`, `progress`, `import_routes`, `import_setto`, `supply_sort`, `game_link_write`, `shell_routes`, `navigation` | 289 tests, 289 pass |
| `BOARD_TARGET=web` on `progress`, `flow_chain`, `import_routes` | 82 tests, 82 pass |
| The four new tests on a `git archive 8a58886` copy | 4 run, 4 fail, each on its defect |
| `python -m unittest tests.test_css_integrity tests.test_doc_registries` | 6 tests, OK |
| `python -m unittest discover -s tests -p "test_i18n*.py"` | 35 tests, OK |
| `python build_web.py`, then `python build_web.py --check` | exit 0, "web/ is up to date" |

## Round 3 fixes (27 September 2026)

The scoped recheck of `51a95c6`: Sol code READY (LOW: two-tab undo); Opus code and Sol QA HOLD.
Each fix below has a test that fails on `51a95c6` (run on a `git archive 51a95c6` copy, for the
defect it targets) and passes now.

| # | Finding | Fix | Test |
| --- | --- | --- | --- |
| 1 | Opus SHOULD 1: drawn 1:1 and scrolled the moment it was 1 px too wide, a common five-stage chain (importer, depot, factory, depot, shops) opened at 1280-1536 with its Shops out of view, and following a shop landed on a shop off screen | `flowFit()`: the picture shrinks to fit down to `FLOW_MIN_SCALE` 0.8 (the stage's 11.5 px names read 9.2 px at the floor; the review's ~10.5 px assumed 13 px names), its height shrinking with it so no blank band returns; below the floor it is drawn at full size and the box scrolls sideways, with the followed site (`flowPickId`) scrolled into view (`flowScrollToPick()`) and the edge where the picture goes on faded (`sb-flow-more-r`/`-l`, kept by a scroll listener). A resize refits without redrawing | `flow_chain`: "the five-stage fixture chain fits a 1366 box: …" (scale 0.8-1, SHOPS inside the box, no band); "a six-stage chain past the floor … faded where it goes on" (the round-2 test, to the new rule, and refit at 1900); "following a shop on a chain that scrolls brings the shop into view" |
| 2 | Opus SHOULD 2 = QA SHOULD: "still covers the N a week" added the lines' difference to Python's shop-demand week, which is below the rounded hours' draw, so 3,650-4,199 read as covering a 4,200 draw | The week at the staffed hours is the planned week beyond the lines (`use - parts.lines`) plus what every line the depot feeds with the material draws at its staffed machine-hours (`sbDeps()` now also returns those lines as `feeds`); where a rate is not known, or the fact has no `parts.lines`, only the lead sentence shows | `progress`: "lines drawing more than planned: the figure is weighed against what the staffed machines draw" (day 47 as the game's recipes make it: 50 Water a machine-hour, 4 h planned, Python's 2,250: 4,000 runs short of 4,200, 5,000 covers it, an unknown rate says only "check that 4,100 covers it"); the round-2 test's hand-set `use` is gone |
| 3 | Opus LOW 1 + Sol LOW 1: a record both tabs held, undone in one, came back from the other's next board | `pgSave()` overlays only the records this page made or judged since it loaded (`mine`); a record it only loaded that is no longer stored was taken away elsewhere and goes from this page too; the page's copy then follows the store. Unreadable storage keeps the page's copy | `progress`: "two tabs that both hold a record: an undo in one is not written back by the other's next board" |

Note on item 2: the draw is summed over every line the depot feeds with the material, the lines on
the plan's hours included, rather than falling back to the lead whenever the listed deps are not
all of those lines. With every line's staffed machine-hours and rate known, the sum is complete
either way; an unknown rate is the case that falls back.

Files: `ba_dashboard.py`; `docs/archive/ui-chunk-2-handoff.md`, `docs/archive/ui-progress-postconditions.md`,
`docs/dashboard-reference.md`; `tests/flow_chain.test.cjs`, `tests/progress.test.cjs`;
generated `web/index.html`, `web/py/ba_dashboard.py`, `web/version.json`.

Validation, in the foreground, Edge, `--test-concurrency=2`:

| Command | Result |
| --- | --- |
| `node --test` (CLI target) on `flow_chain`, `progress`, `import_routes`, `import_setto`, `supply_sort`, `game_link_write`, `shell_routes`, `navigation` | 292 tests, 292 pass |
| `BOARD_TARGET=web` on `progress`, `flow_chain`, `import_routes` (after the last build) | 85 tests, 85 pass |
| The five new or changed tests on a `git archive 51a95c6` copy | 5 run, 5 fail, each on its defect |
| `python -m unittest tests.test_css_integrity tests.test_doc_registries` | 6 tests, OK |
| `python -m unittest discover -s tests -p "test_i18n*.py"` | 35 tests, OK |
| `python build_web.py`, then `python build_web.py --check` | exit 0, "web/ is up to date" |

The CLI run preceded a one-line comment correction in `flowFit()`'s block (no code change); the
build, `--check` and the web-target run are after it.
