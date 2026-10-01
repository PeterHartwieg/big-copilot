# UI redesign, chunk 3 (Businesses, Expansion, references, utilities): handoff

27 September 2026 · Opus 5.5 (`claude-opus-5-5`) · worktree `codex/ui-redesign-chunk3` on
`1404213` (accepted chunks 1 and 2, with `origin/main` `a8f17d7` merged in), not committed.
Chunk 3 of the [implementation plan](ui-implementation-plan.md): every route now shows its final
presentation. The full coverage ledger is section 12 of
[the structure proposal](ui-structure-proposal.md); routes and aliases are in
[ui-route-migration.md](ui-route-migration.md).

## What changed

**Businesses**

| View | What it shows now |
| --- | --- |
| Results | "Company results" (the chart, By weekday), then **Company finances** (`secFinance`, `drawFinance()`): cash on hand and what it did against the profit the books earned over the same days, the loans' balance and their daily interest and repayment, and how far back history reaches (the save's books; the board's cash history, in the browser or `market_history.json`), with links to Payroll and Preferences › History; then the portfolio |
| Products & prices | A chip per shop and office (`data-price-pick`); the picked one's **prices beside the market's**: your price, the lowest market price in its neighbourhood (the same reconstruction as the guide's Prices in your save), the average sold price, sells a day, and "above / below / at the lowest" or "no price". Labelled *your save* and *market reconstruction*, with "Comparisons, not recommended prices". Its guide's Prices in your save and its shelves on its page one click away. The pick rides on the history entry (`nxPrice`). Then "Sales across the company" (the old Products table) |
| Standards | The four subjects, then **Business by business** (`stdTable()`): every shop and office, lowest satisfaction first; the satisfaction bar against the 80 line; promotion; an amenity lamp per demand the type makes (found, missing, not scored yet); uniforms: set, the roles without one with the **uniform write** and its **progress**, or no locker. A name opens the business on its Satisfaction block under Standards. The Operations portfolio stays below |
| Milestones | Career goals as bars (n / total), personal goals as a count; Career totals as tiles (goods produced, taxes paid, buildings owned with a link to the City map) |
| A business's page | Head actions (`spActs()`): Schedule, Deliveries, Prices for a shop; Schedule, Fees for an office; Imports, Deliveries for a depot; Production for a factory; each opens the canonical planner with the business picked or in scope, and an arrival strip back to the page. **The schedule planner is no longer drawn here**: a Schedule summary (`#sp-sched`: the plan's state, its progress, its staffing findings, "Open its week in Staffing › Schedules") replaces it. Factory read-outs say "staffed", not "rostered" |

**Expansion and references**

- **Demand → Find a location.** A cell opens the finder through the route layer with an arrival
  that names its type and neighbourhood ("Demand for Gift Shop in Lower Manhattan"); the cell is
  kept on Demand's entry (`nxDem`), so Back rings its row and focuses it. Each visit to Find a
  location keeps its own filters on its history entry (`nxFs`) beside its pick (`nxPick`): two cells'
  questions keep their own answers through Back, Forward and a reload.
- **Find a location** is headed (`#mapHead`) and has its ways on under the map (`#finderCtx`):
  the type's demand by neighbourhood (Demand with the row ringed), its setup guide, Plan a factory.
  The first result keeps the keyboard in view on a short window.
- **City map against the finder** (deferred from chunk 1): `#map` is always the plain map;
  reached with the finder on (the masthead, Back) it switches the finder off. The finder's switch
  opens the other route as a new visit, so Back undoes it.
- **Preferences and Help & feedback** are sheets over the board (`pxOpen()`), from ··· and the
  phone's Map & more, instead of a scroll to the footer. Preferences: Appearance (theme; motion
  follows the system), Language (the footer's picker, copied; the CLI says how to use `--lang`),
  Game text (web), History (Forget history on the web; `market_history.json` and `--backfill` on
  the CLI), Checks (Customize checks and the count), Game context (the difficulty chip), Local
  board. Help: Can't find something? (Search, Where is my save on the web, Bugs and feedback),
  Feature requests (the ballot where community is available), What's new (the latest entry and the
  Changelog), The project (the footer's links). Every control is the existing one; no new setting.
- **Search** gained Company finances, Preferences and Help & feedback.

**Progress: uniforms** (`docs/archive/ui-progress-postconditions.md`). The uniform write records one
record per shop dressed (`pgUniformDone()`): *Applied · awaiting refresh* from the write's answer;
*Confirmed* when a later board shows none of those roles among the shop's uniform gaps; *Not
confirmed* when one is back or the shop is gone; an undo takes the records back; a refused shop
records nothing. Shown on Standards and on the uniform finding on the Overview.

**Carried from chunk 2**

| Item | Fix | Test |
| --- | --- | --- |
| (a) A live refresh reset Goods flow's sideways scroll | The picture scrolls in its own strip (`#sbFlowScroll`); the reader's scroll is kept (`flowScrollX`) and only a newly followed site moves it (`flowScrolledFor`) | `flow_chain`: "a redraw keeps the picture scrolled where the reader left it…" |
| (b) The legend scrolled away | The legend sits outside the scrolling strip | same test |
| (c) Two tabs: an undo or clear in one was written back by the other once it had judged the record | `pgSave()` drops a record that was stored at this page's last read or write (`synced`) and is gone now, even if this page judged it since; `mine` holds only this page's changes since its last save | `progress`: "two tabs: an undo in one stands even after the other has judged the record", "…a clear in one stands…" (both fail on the old `pgSave()`) |
| (d) Stale German (and the other catalogues) after chunk 2's rewording | Every stale and missing key drafted in German, Spanish, French, Portuguese and Russian by gpt-6-sol (the project's draft model; four search keys by Opus 5.5), imported with `import-draft`, so they are marked for native review in `i18n/<lang>.ai.json`. `status`: 0 missing, 0 stale, 0 mismatch in all five | `tests/test_i18n*.py`, `tests/i18n_*.test.cjs` |
| (e) The older two-tab progress test failed intermittently on the web target | The cause was the test: it read one tab's storage right after the other tab wrote, before the browser had passed the write across. Each step now waits until the acting tab sees the other's write (`pgSees()`), and reads from the tab that wrote | `progress` two-tab tests |

**Found on the way**: the schedule planner's click handlers were bound only when a business's
page had been drawn (`wireRoster()` was called from `drawSite()` alone), so Staffing › Schedules
could be inert on a visit that never opened a business page. `wireAll()` binds them now.

## Decisions

- **A business's page summarises its week and links to Schedules** (the coordinator's "decide"):
  one planner, on Staffing › Schedules, keeps its id `#sp-roster`. `tests/roster.test.cjs` now
  draws the planner there (`schedPick()`; the four tests that need its layout open the route), with
  its assertions unchanged except two: hovering a schedule entry lights that person's entries in the planner
  (the crew pills are on the business's page now, not beside the planner), and the plan is picked
  in the planner beside Schedules' list, which follows at once, where it used to be picked on the
  business's page.
- **Prices compare, never recommend.** The lowest market price is the save's own reconstruction
  for the business's neighbourhood; no pricing model was added.
- **Standards keeps the Operations portfolio** below the new table, so customers, spend a visit,
  foot traffic, marketing and security stay one click away.
- **No Retired features section** in Help: nothing is retired, and the archive and restoration
  voting are not authorized.
- **Goods flow has no product filter**: the graph's links carry product slugs in the fixture, but a
  filter is new design work (the canvas marks it so) and was not needed for parity.

## Files

Source: `ba_dashboard.py`, `web/map.js`. Changelog: `web/changelog.json` (one entry; **its `pr` is
167, a placeholder for the real pull request number**). Translations: `i18n/{de,es,fr,pt,ru}.json`,
`.base.json`, `.ai.json`. Docs: `docs/archive/ui-chunk-3-handoff.md` (new), `docs/archive/ui-structure-proposal.md`
(section 12, the ledger), `docs/archive/ui-route-migration.md`, `docs/archive/ui-progress-postconditions.md`,
`docs/architecture.md`, `docs/dashboard-reference.md`. Tests: new `tests/businesses_expansion.test.cjs`;
changed `flow_chain`, `progress`, `roster`, `staff_hire`, `game_link_write`, `shell_routes`,
`milestones`, `site_panel`, `findability`, `layout` (`.test.cjs`). Generated by `python build_web.py`:
`web/index.html`, `web/py/ba_dashboard.py`, `web/version.json`, `web/i18n/*.json`.

## Validation

Run in the foreground from this worktree, Windows, Edge (`PLAYWRIGHT_CHANNEL=msedge`),
`--test-concurrency=2`, `NODE_PATH` at the main checkout's `node_modules`. The last three rows are
the final source's (nothing changed after them).

| Command | Result |
| --- | --- |
| First full Node run (CLI target), mid-chunk | 1251 tests: 1247 pass, **3 fail**, 1 skipped. The three (a finder test whose first result slid under a short window's edge once Find a location had a heading; a unit stub without `hasAttribute`; a progress test that changed a record without marking it as the page's) were fixed and rerun alone: pass |
| First full Python run, mid-chunk | 1370 tests, OK, 1 skipped |
| `tests/businesses_expansion.test.cjs` (new, CLI target) | 12/12 |
| The new judged two-tab tests against the old `pgSave()` | 2 fail on the old code, pass on the new |
| `python -m unittest discover -s tests -p "test_i18n*.py"`; `node --test tests/i18n_*.test.cjs` | 35 OK; 48/48 |
| `python tools/i18n.py status <lang>` for de, es, fr, pt, ru | 0 missing, 0 stale, 0 mismatch each |
| `python -m unittest tests.test_release_latest` | 3 OK |
| `BOARD_TARGET=web`, the 18 files that read it (the rebuilt `web/index.html`) | 461 tests, 461 pass |
| The hosted build (`web/` served on 127.0.0.1, the save picked with "one save file", built by Pyodide) | no page error; the no-save Game guide from the landing and at `#wiki/businesstypes-giftshop`; Preferences with the Language picker and Game text; Help & feedback; Results, Products & prices, Standards, a shop's page, the finder from a Demand cell |
| **Final**: `python build_web.py --check` | `web/ is up to date` |
| **Final**: full Node, CLI target (`node --test tests/*.test.cjs`) | **1251 tests: 1250 pass, 0 fail, 1 skipped** |
| **Final**: full Python (`python -m unittest discover -s tests`) | **1370 tests, OK, 1 skipped** |

Screenshots and the render matrix (synthetic day-47 save, `python tests/save_fixtures.py demo.hsg
47`; reduced motion): in this session's scratchpad
(`C:/Users/Peter/AppData/Local/Temp/claude/C--Users-Peter--codex-worktrees-ui-redesign-chunk3-Big-Ambitions/738bea7b-01ee-4472-ba72-e1053d73ea39/scratchpad/`):
`shots/` holds 144 renders of twelve views (Results, Products & prices, Standards, Milestones, a
shop's and a factory's page, Demand, the finder from a cell, the City map, Plan a factory,
Preferences, Help) at 1440 and 1024 px in dark and light, at 1440 and 1024 px under 130 % browser
zoom and 130 % root text, and at 390 and 320 px (dark and light); `shots/report.json` records each
one's sideways overflow, page errors and the measured contrast of the new small text (the
Standards table's quiet words, the prices' footnote and comparison tags, the finances' labels,
the finder's cards, the map heading, the sheets' notes, the Schedule summary, the goals' counts,
the arrival strip). **Result: no sideways overflow, no page error, no measured text under 4.5:1 in
any of the 144.** `hosted/` holds the hosted build's screens. Keyboard: the Preferences sheet takes
focus on open, keeps Tab inside, lets Escape close a popover before the sheet, and gives focus back
to ··· (`tests/businesses_expansion.test.cjs`); a Demand cell is a button to the keyboard and gets
focus back on return. The root text size barely changes the board, whose type is set in pixels;
browser zoom is the enlargement that reflows it, and it was measured. A CSS `zoom` injected after
load showed overflow from the masthead's underline, an artefact of mixing coordinate spaces that
real zoom does not produce.

## Not verified, and limits

- **No physical phone and no human discovery check.** Phone widths render without sideways
  overflow (320 and 390 px), but were not polished (a PC game). The plan's three discovery tasks
  (find and review an import fix, locate factory running hours, find prices for a named shop) have
  not been run with players; agent tests show that routes and state work, not that players find
  them.
- **Translations are machine drafts** (gpt-6-sol), marked for native review. Main's Staff needs
  hiring page (issue #89) is still English-only, as it shipped.
- **The CLI page has no history controls**: Preferences says where `market_history.json` is and
  names `--backfill`; Forget history exists only on the web page.
- **Company finances' cash line** needs the board's own cash history (`cashFlow`); a first save
  says so instead.
- **Two tabs** learn of each other's writes a moment after they happen; two tabs acting within that
  moment can still cross (documented in the postconditions).
- **Changelog `pr`** is a placeholder (167).

## Round 1 fixes (27 September 2026)

Three reviews of `adf1d5b` (Opus code, Sol code, Sol QA): all HOLD, no MUST-FIX. Each SHOULD below
has a test that fails on `adf1d5b` (the new tests run on a `git archive adf1d5b` copy, its own
`web/` included) and passes now.

| # | Finding | Fix | Test (fails on `adf1d5b`) |
| --- | --- | --- | --- |
| 1 | Sol + QA SHOULD: an open Preferences sheet kept the old language after a switch from its own picker | The sheet's markup is `pxRender()`; a `ttOnChange()` listener draws an open sheet again in the new language, where it was scrolled, the keyboard back on the picker's new copy (`#pxGnBtn`) or in the row it was in | `businesses_expansion`: "an open Preferences sheet is drawn again in a language picked…" (web target: the real picker, Deutsch; CLI target: the same listener fed a table) |
| 2 | Sol SHOULD: the average sold price divided the rounded daily revenue by the rounded rate ($14.30 for one $10 sale in a week; none when the rate rounds to 0) | Extraction carries `soldPrice` on each line: the takings over the units, unrounded, `None` where nothing sold; Products & prices reads it and shows "—" where the board has none (an older payload included). Payload snapshots regenerated: the only change is the new field | `tests/test_wiki_prices.py`: "sold price is takings over units unrounded"; `businesses_expansion`: the Products & prices test ($10.00, and "—") |
| 3 | Opus S1: Find a location's demand card opened Demand with an arrival whose way back was Demand itself | `routeCarry()` never carries an arrival whose `back` is the route being opened; browser Back returns to the finder, whose own strip leads to Demand | `businesses_expansion`: "Find a location keeps a picked building…" now clicks through: no strip on Demand, Back to the finder, its strip back to Demand |
| 4 | Opus S2: a Headquarters page offered Imports and Deliveries, which opened empty views and left the scope stuck | `spActs()` draws a Supply action only for a site the Supply views scope (its supply facts, and its tab: a warehouse's Imports and Deliveries, a factory's Production, a shop's Deliveries); none for a Headquarters | `businesses_expansion`: "a headquarters page offers no Supply action…" (a Headquarters added to the fixture; the warehouse and factory keep theirs; scopes untouched) |
| 5 | Opus S3: the uniform write's progress was missing on the business's page, beside the write | `spStandards()` draws `pgUniformState()`'s pill beside the write (`.sp-unipg`) | `game_link_write`: "uniforms from a business page: the progress stands beside the write…" (through the real `gwUniforms` dialog and the mock: Applied, then Confirmed by the board the game gives after, on the page and on Standards; the toast's Undo takes it back); `businesses_expansion`: the uniform test asserts the page's pill |
| 6 | Opus S4: Company finances said "cash watched from day N" for the comparison day | "cash compared with day N" (`co.fin.hist.cash2`); the reference doc says what the day is | `businesses_expansion`: the Results test |
| 7 | Sol LOW: Standards sorted offices after shops | Every shop and office together, lowest satisfaction first, the unscored last | `businesses_expansion`: the Standards test adds an office at 10%, first |
| 8 | QA LOW: "Plan a chain" on the planner's heading and Demand's row links | "Plan a factory" (`gr.plan.title2`, `gr.planLink2`) | `businesses_expansion`: "Plan a factory names itself so…"; `market` test wording updated |
| 9 | Opus L1: Forget history in Preferences gave no feedback, and the finances link focused that button | The row says "History forgotten…" (`role="status"`) after the click; `pxOpen(…, row)` focuses the row itself | `businesses_expansion`: the Preferences test (web target, where the control exists) |
| 10 | Opus L2: Supply › Changes' clear also removed uniform records | `pgClearSettled(family = "imports")` | `businesses_expansion`: the uniform test clears and keeps the record; the two-tab clear test names its family |
| 11 | Opus L3: an office on Products & prices kept the shop's column words | "Average billed price" and "Hours billed / day" for an office | `businesses_expansion`: the Products & prices test |
| 12 | Opus NITs | Search's "Daily result" is "Company results" (`nav.search.daily.title2`); a product's landing reads "Businesses › Products & prices · {item}" (`nav.search.item.sales`); the changelog counts the five places right; the dead `[data-sched-open]` handler is gone | `businesses_expansion` (search title) |
| 13 | QA NIT: "hovering a shift" in this handoff | "hovering a schedule entry" | – |

New English went to new keys; German, Spanish, French, Portuguese and Russian drafted for the six
by Opus 5.5 (`import-draft --model claude-opus-5-5`, marked for review): `status` 0 missing, 0
stale, 0 mismatch in all five.

Files: `ba_dashboard.py`; `web/changelog.json`; `i18n/{de,es,fr,pt,ru}.json`, `.base.json`,
`.ai.json`; `docs/archive/ui-chunk-3-handoff.md`, `docs/dashboard-reference.md`,
`docs/archive/ui-progress-postconditions.md`; tests `tests/businesses_expansion.test.cjs`,
`tests/game_link_write.test.cjs`, `tests/market.test.cjs`, `tests/progress.test.cjs`,
`tests/test_wiki_prices.py`, `tests/fixtures/payload_snapshot/data_day40.json`,
`data_day47_history.json`; generated `web/index.html`, `web/py/ba_dashboard.py`, `web/version.json`,
`web/i18n/*.json`.

Validation, in the foreground, Edge, `--test-concurrency=2`, on the final source:

| Command | Result |
| --- | --- |
| The new and changed tests on a `git archive adf1d5b` copy | `businesses_expansion`: 8 of its 15 tests fail (every fix's test above but L1, which only the web target exercises), 7 pass; `test_wiki_prices`: the new test errors (no `soldPrice`); `game_link_write`, the new dialog test: fails waiting for the page's pill |
| `node --test` (CLI target) on `businesses_expansion`, `progress`, `flow_chain`, `roster`, `shell_routes`, `navigation`, `search`, `site_panel`, `findability`, `i18n_*`, `game_link_write`, `market` | 543 tests, 543 pass |
| `BOARD_TARGET=web` on `businesses_expansion`, `progress`, `shell_routes` | 67 tests, 67 pass |
| `python -m unittest discover -s tests` | 1371 tests, OK, 1 skipped |
| `python -m unittest tests.test_css_integrity tests.test_doc_registries tests.test_release_latest tests.test_wiki_prices tests.test_payload_snapshot` | 26 tests, OK |
| `python -m unittest discover -s tests -p "test_i18n*.py"` | 35 tests, OK |
| `python build_web.py`, then `python build_web.py --check` | exit 0, "web/ is up to date" |

## Final fixes (27 September 2026)

Two sets of changes on `3e6f160`, which holds all three accepted chunks:

- the findings of the final reviews: Fable's generic review, and astra's two QA runs;
- Peter's declutter pass.

The declutter pass is written up page by page, with before and after screenshots, in
[`docs/archive/ui-declutter.md`](ui-declutter.md).

### Review findings

Each SHOULD has a test that fails on a `git archive 3e6f160` copy (with its own `web/`) and
passes now. The failures on `3e6f160` are the ones each fix is about:

- the hire line reads `[object Object] of 2 seen`;
- the checklist has `[24]` hours steps where `[]` is expected;
- Why's uses read `2,250` where `8,400` is expected;
- the preview keeps 3 lines where 2 remain;
- `history.length` is 2 where 3 is expected;
- Back returns MON / plan instead of SUN / now;
- `All shops` offers `Apply 1 import amount`.

| # | Finding | Fix | Test (fails on `3e6f160`) |
| --- | --- | --- | --- |
| 1 | astra2 SHOULD: an import figure typed on full production, then shop demand on screen: Why was headed "planned for full production" but computed on shop demand; Changes and the copy asked for 4 h and 24 h on the same Beer machines | Why is built from the figure's own basis (`setting.why` from `szFactFor(…, ownBasis)`): its use, margin, rounding, and "With {the basis on screen} instead". A dependency planned on the other basis that asks other hours than the basis on screen plans for the same machines (`sbDeps()` now carries `needNow`) is no step. The import's row says so (`sb.ck.dep.clash`); the card has a note (`sb.card.clash*`); the manual steps skip it. The copy's header reads "…the factory hours are this basis's" (`sb.ck.copy.mixed2`) | `progress`: "an import figure typed on full production, then shop demand on screen: Why explains full production, and the machines get one hours step" (the day-47 fixture: Why's uses 8,400, not 2,250; at most one Beer hours step, never 24 h on shop demand); "a figure typed under one basis keeps it after a switch; the hours it assumes are no step where the basis on screen plans others" (rewritten: it had asserted the conflicting step) |
| 2 | astra SHOULD: Schedules lost the day and the now / plan view on Back | `schedDay` and `schedView` are kept on the entry with the business (`nxSch`) and put back after every draw (`schedApplyView()`); another business resets them | `shell_routes`: "Schedules keeps the business, its day and its now / plan view through Back, Forward and a reload" |
| 3 | Fable SHOULD 1: Back skipped a view inside an area (a Changes row, Goods flow's "See its rows", search to another view of the area) | `reveal()` names the route (`HOST_ROUTES`) when it changes the view of the page on screen, so `showPage()` pushes an entry instead of `showSub()` replacing it | `shell_routes`: "a Changes row opens its view as a new visit: Back returns to Changes; a section of another view does the same" |
| 4 | Fable SHOULD 2 + astra LOW: old place names and banned words on screen | Every label reworded, board-wide sweep included (list in `docs/archive/ui-declutter.md`, "Wording fixes"); `f.uniform.gaps` moves the `link.json` payload snapshot | `search`, `finder`, `wiki-guides`, `game_link_write` assert the new words |
| 5 | astra LOW: "[object Object] of 2 seen" | `PG_CHECK.hire` returns `seenCount`; `pgEvaluate()` keeps `seen` for its clock | `progress`: the hire test asserts "1 of 2 seen at their sites so far" |
| 6 | astra2 LOW: the bulk Apply on Changes ignored the scope | Apply follows the scope. One site: its own lines. A kind of site holding none: no button. A kind holding some: every line, labelled "…, whole company" (`sb.cw.apply.whole*`), since each importer's cap is shared | `game_link_write` (web target): "Changes: the bulk import Apply follows the scope; a scope with no import line has none" |
| 7 | LOWs | See the list below | `progress` (preview after a mark, v2 kept), `businesses_expansion` (office price tips) |

The LOWs, in order:

- **Arrival strip from a business page.** It names the business once, on its Back button, and
  after a tab switch its way back opens the business's page, not the list.
- **The office footnote on Products & prices.** Replaced by per-column tips; an office's tips
  speak of billed hours (declutter BV7).
- **The Changes copy preview.** It repaints on every mark (`sbPaintChangesTop()`).
- **"Your changes".** It arrives from Needs attention, and the way back puts the keyboard on
  that line.
- **The version 2 import store.** It is kept after migration, for a rollback.
- **The privacy notice** names the typed import figures, the marks and the record of game-link
  writes (14 game days).
- **README and `docs/dashboard-reference.md`** describe the areas and views: Overview,
  Businesses, Supply, Staffing, Expansion (Demand, Find a location, Plan a factory), City map,
  Game guide. "Plan a chain" is gone.
- **Fable NITs:**
  - `PAGE_DRAWS` rows carry named tags (`staff`, `schedules`) instead of regexes over their
    source;
  - `pgBoard()` reads the store once;
  - the empty `{when}` of `sb.card.do.smart` is gone;
  - the dead row keydown on Changes is removed (the row's own button is the keyboard target);
  - `rec.expect.unit` is escaped;
  - the `#pageStaffing` comment is fixed;
  - `#nav` and `#phoneNav` keep one label, since CSS shows only one at a time.

### Declutter pass

All 121 audit items, with Peter's eight decisions (E5, O13, O11, S8, S6, M2, X5, S5). Section
15 of the audit:

- the vocabulary item and E7's blank numbers are fixed;
- the rest are listed as not done, below.

Tests that asserted removed text now assert the structure or what remains; none lost the
behaviour it covered (see "Tests" in `docs/archive/ui-declutter.md`).

### Translations

For every new and reworded key, drafts in German, Spanish, French, Portuguese and Russian:

- gpt-6-sol for 97 to 113 keys a language (`import-draft --model gpt-6-sol`);
- Opus 5.5 for `app.menu.tip2`.

All are marked for native review. `status` gives 0 missing, 0 stale and 0 mismatched in all
five. The removed keys are orphans.

### Files

- **Source:**
  - `ba_dashboard.py`;
  - `build_web.py`;
  - `web/app.js`, `web/community.js`, `web/community.css`;
  - `web/map.js`, `web/wiki.js`, `web/privacy.html`;
  - `tools/wiki_sample.json`.
- **Translations:** `i18n/{de,es,fr,pt,ru}.json`, `.base.json` and `.ai.json`.
- **Docs:**
  - `README.md`;
  - `docs/dashboard-reference.md`;
  - `docs/archive/ui-chunk-3-handoff.md`;
  - new: `docs/archive/ui-declutter.md`.
- **Tests:**
  - `businesses_expansion`, `calm_refresh`, `community-browser`, `findability`, `finder`;
  - `game_link_write`, `i18n_layout`, `import_routes`, `import_setto`, `map`, `market`;
  - `milestones`, `progress`, `roster`, `search`, `shell_routes`, `site_panel`;
  - `staff_hire`, `today_layout`, `wiki-guides`, `wiki` (all `.test.cjs`);
  - `tests/test_footer.py`, `tests/fixtures/payload_snapshot/link.json`.
- **Generated:**
  - `web/index.html`, `web/py/ba_dashboard.py`, `web/version.json`;
  - `web/i18n/*.json`, `web/wiki-data.json`.

### Validation

In the foreground, Edge, `--test-concurrency=2`, on the final source:

| Command | Result |
| --- | --- |
| The new tests on a `git archive 3e6f160` copy | the 7 fail as described above |
| `python build_web.py` | exit 0 |
| `python -m unittest discover -s tests` | 1371 tests, OK, 1 skipped |
| `node --test tests/*.test.cjs` (CLI target) | 1259 tests, 1258 pass, 0 fail, 1 skipped |
| `BOARD_TARGET=web`: `shell_routes`, `search`, `businesses_expansion`, `progress`, `import_routes`, `game_link_write`, `release`, `news`, `update`, `calm_refresh`, `i18n_layout` | 306 tests, 305 pass, 0 fail, 1 skipped |
| `python -m unittest tests.test_privacy_promises tests.test_footer tests.test_release_latest` | 19 tests, OK |
| `python build_web.py --check` | "web/ is up to date" |

After the last key's translation (a `web/i18n` change only), the following were rerun: the
`test_i18n*` Python tests, `tests.test_web_fresh`, the Node `i18n_catalogue` and `i18n_runtime`
tests (35 of 35), and `--check`.

### Not done

- **The news strip** still announces Big Copilot Link 0.2.0 (audit section 15, item 2). A new
  announcement is Peter's content to write; it is not a declutter.
- **Other audit section 15 items, left for Peter:**
  - the CLI title "Recover #2" from an autosave (item 4);
  - whether "→ another counter" and "another computer workstation" count as capacity advice
    (item 6);
  - the untranslated hiring block (item 7).
- **`docs/dashboard-reference.md`** still uses the scheduling words AGENTS.md rules out, in its
  technical sections. Only its navigation was rewritten, as the brief asked.
- **The status line.** Its words stay in the markup, out of sight in the ok and busy states, so
  that the page's `role="status"` and the tests that wait on "Up to date" keep working. "built
  in" is among them.
- **No commit.** The coordinator commits.
