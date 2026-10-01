# UI redesign, chunk 1: handoff

26 September 2026 · implementation owner: Opus 5.5 (`claude-opus-5-5`) · branch
`codex/ui-redesign-shell`, checkpoint `4e8e745` plus the uncommitted merge of `origin/main`
at `ca69a81` (PR #121, Staff hiring) and the chunk-1 correction pass. The merge was left
uncommitted for the coordinator; the nine resolved conflict files were staged by the implementer.

Chunk 1 is the shell, the navigation, the Overview, All tools and the route layer. It is not
the whole redesign: chunks 2 (Supply and Staffing presentation) and 3 (Businesses, Expansion,
references, preferences, translations) are still to come. Every route has an interim host,
listed in [ui-route-migration.md](ui-route-migration.md).

## What chunk 1 does

- **Masthead**: Overview, Businesses, Supply, Staffing and Expansion, then City map and Game
  guide as references. The area's views are a row under it (`#localNav`), with a count where
  there is something to do. Above 1280 px it is one row with the sphere; narrower it is two rows
  with the sphere on the top row (smaller balls, `nxFitMast()`); on a phone it is the brand,
  the day and the source dot, with a bottom bar.
- **Routes**: every place is a route (`ROUTES`), and old hashes, sections and remembered
  views still land (`ROUTE_ALIASES`, `PAGE_ALIASES`, `SEC_PAGE`, `SEC_MOVED`). A site's page
  keeps `#site/<slug>` and remembers the route it was opened under (`nxRoute`).
- **Overview**: Needs attention first, in a stable order that a refresh appends to and
  announces. Critical rows are open, five more show, then "Show N more". Severity switches,
  Details panes, and a return to the row the reader left from (`nxOv`), with focus. On a phone
  the four figures fold into one line (Profit, Cash, Day, All figures). All tools lists the
  thirteen tasks in four groups, with live counts.
- **Arrival**: a finding or a task says why the reader is here (`#arrive`, which takes focus),
  with a way back that is the browser's Back where it can be.
- **Staffing** (new host `#pageStaffing`): Schedules, Staff needs (the staff demands, then
  main's Staff page unchanged: hiring, candidates, Quick hire, the hire write with no undo)
  and Payroll.
- **Findings**: all 31 kinds have a route and an action (`FINDING_ROUTES`); the landing is
  still `ALERT_LINKS`.

## The merge with PR #121

- Main's Staff page (`secStaff`) moved from Company to Staffing › Staff needs, after the staff
  demands (`secNeeds`). The page itself, its CSS, its payload keys and its write code are main's,
  unchanged. So are the mod, the mock and the wire contract.
- Payroll is its own view again (`drawPayroll`, `secPayroll`); main's Staff page keeps its
  short Payroll summary at its foot.
- `#staff`, `#secStaff` and a remembered Company › Staff open Staff needs. `#payroll`,
  `#secPayroll` and a remembered Company › Payroll open Payroll. The remembered Company view
  is migrated once to `ba_dash_staffing` and `ba_dash_route`.
- The Staff page's "open this site's staffing" keeps the site's page under Staffing ›
  Schedules. Its stale check finds its `PAGE_DRAWS` row by function.
- Search: "Hiring" (main's Staff entry) is under Staffing › Staff needs and answers "hire",
  "staff" and "candidates"; Payroll is its own entry.
- The PR #121 ledger rows H01–H07 are recorded in
  [ui-route-migration.md](ui-route-migration.md#pr-121-staffing-and-hiring-rows-h01h07). Chunk 1
  gives each a route and leaves main's presentation and writes as merged. Their final
  presentation is chunk 2's.

## The correction pass (chunk1-corrections.txt)

| # | Correction | Where |
| --- | --- | --- |
| 1 | A site's page keeps the route and the local view it was opened from through Back, Forward and a reload | `showPage()` route stickiness for the same site, `nxRoute`; `tests/shell_routes.test.cjs` (two shops from Products & prices, Schedules, a wholesale finding) |
| 2 | Promotion lands on Businesses › Standards | `reveal()` takes the route's view when the section's `data-sub` holds it; `routeStdWas` gives Results its portfolio view back |
| 3 | Exact shortfall keys | `/^f\.shortfall\.route(\.|$)/` |
| 4 | Find a location without a preset keeps the reader's filters | `showFinder()` in `web/map.js`; the route's `after` |
| 5 | List or Diagram moves the route between the tab's view and Goods flow | the switch calls `routeSync()` |
| 6 | Overview order, departure snapshots, rows under the list, `#today`, filtered folds | `openRoute()` ranks once on a fresh visit; `showPage()` snapshots every departure; `ovRows()`; `ROUTE_ALIASES.today`; `#alerts.ov-sev` |
| 7 | Critical and Staff needs counts follow a refresh made elsewhere | `drawShellCounts()`, a `""` `PAGE_DRAWS` row |
| 8 | Office staffing lands on real evidence; factory staff stays Production without supply facts | `nxStaffInto()`, `ovAtFactory()` |
| 9 | "No shifts to plan yet" | "Nothing to schedule yet" (`co.sched.nothing`); architecture doc updated |
| 10 | Phone attention first | `#ovCtx` line, tiles behind All figures, compact source strip |
| 11 | Long names and 130% text at 320 and 390 px | wrap rules on the finding rows, masthead, footer and tool illustrations |
| 12 | Focus on arrival and return | `#arrive` focus; `ovArrive()` focuses the row's action, the gone-row line or the tools heading |
| 13 | Unpressed severity switches are active controls | no opacity; outline and hollow dot, struck-through label |
| 14 | A loss is negative in figure and line | `ov-neg` on the tile |
| 15 | Day and source on a phone; the sphere on desktop and tablet | phone masthead shows the day and live dot; two-row shelf (`SIZES_TWO`, `fitShelf()`) |
| 16 | 64.0% is 64, not 0 | the finding's own number first (`i18n.text[1].n`, `.promotion`), then a decimal-aware match |

The optional review point (Results must not inherit Standards' Operations view) is done
(`routeStdWas`). `tests/release.test.cjs` uses the reference links (`#navRefs`). A finding
that opens a site's page shows one arrival strip above the page's own breadcrumb, not a second
crumb.

The first full Node run after the pass found three masthead defects, fixed since:

- The masthead was fitted a frame late (`nxFitSoon` from a ResizeObserver), so it could be
  drawn and measured unfitted; the observer fits it at once, before paint, as main's
  `ssFitMast()` did (`tests/fold_views.test.cjs`).
- The sphere's shelf was re-measured only on a window resize, so a masthead that changed rows
  left a ball marked as having no room (`tests/search.test.cjs`, the sphere test).
  `nxFitMast()` now fires `nxfit`, and the shelf re-measures, resizing its balls for one row or
  two. `tests/fold_views.test.cjs` measures the ball's room from the brand in two rows.
- The search field narrowed to its 180 px floor even when its words needed more (a longer
  translation, `tests/i18n_layout.test.cjs` at 1920 px on the map); it now steps down to its
  icon instead.

The final screenshots found one more: at 1440 px the places and references leave 81 px, short of
the full ball's 92, so the desktop showed no sphere. A shelf a little short now takes smaller
balls, down to three-fifths (`scaleShelf()`); 1440 px shows a 53 px ball, and 1280, 1366, 1600
and 1920 px are unchanged.

## Commands

```sh
# the synthetic demo (no real save)
python tests/save_fixtures.py demo.hsg 47
python ba_dashboard.py demo.hsg -o demo.html --no-open     # CLI board; open demo.html#overview
python build_web.py                                           # web/ from the sources (needs the game)
python build_web.py --check                                   # without the game
# the hosted board: serve web/ on 127.0.0.1 and pick demo.hsg with "Open one file"

# tests (Edge where Playwright's Chromium is not installed)
PLAYWRIGHT_CHANNEL=msedge node --test --test-concurrency=2 tests/shell_routes.test.cjs tests/navigation.test.cjs tests/staff_hire.test.cjs
python -m unittest discover -s tests
PLAYWRIGHT_CHANNEL=msedge node --test --test-concurrency=2 tests/*.test.cjs
```

Demo paths worth clicking: the Overview's first critical finding and Back; All tools › See whom
to hire; Staffing › Schedules › an office's Open staffing; a promotion finding, then
Businesses › Results; Supply's List or Diagram switch and a reload; `#payroll`, `#staff`,
`#today` typed into the address bar.

## Results

Windows, Edge (`PLAYWRIGHT_CHANNEL=msedge`), `--test-concurrency=2`, on the merged source.
Runs in order, including the ones that did not pass; the last four rows are the final source's:

| Run | Result |
| --- | --- |
| Full Python, first (`py_full`) | 1351 tests, OK, 1 skipped; before the last masthead fixes and the CSS marker removal |
| Full Node, first (`node_full`) | 1179 tests: 1173 pass, 5 fail, 1 skipped. The failures led to the three masthead fixes above and the i18n harness permission; all five pass since |
| Full Python, second (`py_full2`) | 1351 tests: **2 failures**, 1 skipped. `test_web_fresh.test_repository_is_fresh` and `test_wiki_pages…test_build_web_check_reports_the_pages` ran while `ba_dashboard.py` had just been edited (the stray `=======` removed) and `web/` was being rebuilt. After the rebuild both modules pass (33 tests, OK) and `build_web.py --check` reports `web/ is up to date` |
| Full Node, second (`node_full2`) | 1179 tests: 1178 pass, **0 fail**, 1 skipped, on the rebuilt output after the marker removal |
| `BOARD_TARGET=web`, 16 files, first (`node_web`) | 401 tests: 356 pass, **45 fail**; not accepted. See below |
| Full Python, third (`py_full3`), after every source change | 1351 tests, OK, 1 skipped; `build_web.py --check`: up to date |
| `BOARD_TARGET=web`, 16 files, after the harness fixes (`node_web2`) | 401 tests, 401 pass |
| The six edited test files on the CLI target | 222 tests, 222 pass |
| Masthead suites after the 1440 px sphere fix | CLI target 150/150 (sphere, search, fold_views, i18n_layout, navigation, today_layout); web target 97/97 (search, fold_views, today_layout, shell_routes) |
| **Final, on the final source**: `build_web.py --check` | `web/ is up to date` |
| **Final**: full Python (`py_full4`) | 1351 tests, OK, 1 skipped |
| **Final**: full Node (`node_full4`) | 1179 tests: 1178 pass, 0 fail, 1 skipped |
| **Final**: `BOARD_TARGET=web`, the 16 files that read it (`node_web4`) | 401 tests: 401 pass, 0 fail |

**The web-target failures were the test harnesses, not the built app.** Four harnesses gave
the built `web/index.html` none of its own files. flow_chain and roster answered every request
(`app.js`, `community.js`, the fonts) with the HTML page (`SyntaxError: Unexpected token '<'`),
and search aborted them, so the wiki data never loaded. shell_routes, new in chunk 1, refused
the web target outright. The pre-redesign base's web build fails flow_chain and the roster bar
test the same way under its own harness. Each harness now serves `web/`'s real files beside the
page under `BOARD_TARGET=web`, and the CLI target is unchanged. shell_routes gives the web build
the day-47 payload through `takeData()`/`boot()` on every load, reloads included. Two test-side
facts surfaced once the web build really loaded its map and landing:
- The search fixture's `premises` lacked `forSale`, which every real payload has
  (`_premises()`), and the web map's card falls back to it while its locations load; the fixture
  now carries `forSale: []`.
- The web build shows its landing until the board is entered (`enterBoard()`), so the sphere
  test enters the board on the web target.

No product code was changed for any harness.

Coverage for main's new surface in these runs: `tests/staff_hire.test.cjs` (59 tests: netting,
picks, Quick hire, the hire and move request for a shop, a factory and an office, opened on
Staffing › Staff needs), `tests/game_link_write.test.cjs` (the schedule writes and the hire
write's client), `tests/test_game_link_mock.py` (`/write/hire`), `tests/office_site.test.cjs`
(also on the web target), `tests/test_staff_hire.py` and `tests/test_staffing.py`.

Screenshots (synthetic day-47 save, reduced motion) are in
`C:/Users/Peter/.codex/handoffs/big-copilot-ui-redesign-2026-09-26/execution/chunk1-final-shots/`,
with the numbers in its `measurements.txt`:

- Desktop 1440 px, light and dark: the Overview, Supply › Imports, Staffing › Staff needs,
  Staffing › Payroll and Businesses › Standards; one masthead row, the sphere on its shelf.
- Tablet 1024 and 800 px, light and dark: the Overview. The stylesheet gives the masthead two
  rows there, with the sphere on the top row (`measurements.txt`'s `mastRows` counts only
  `nx-wrap`, the class for a desktop row that overflows, so it reads 1).
- Phone 390 px, light and dark: the company line (Profit, Cash, Day, All figures), and the
  first critical action at y 496–540 above the bottom bar at 783. The same with one severity
  switch off: unpressed switches contrast 5.27:1 (light) and 7.38:1 (dark) at full opacity;
  pressed ones 17.5:1 and 14.9:1.
- 1280 px pointer navigation: the wordmark clicked three times (extra balls), then every area
  and reference clicked with the mouse. Each lands on its route (`#businesses` →
  `businesses/results`, `#supply` → `supply/changes`, `#staffing` → `staffing/schedules`,
  `#expansion` → `expansion/demand`, `#map`, `#wiki`), with no page error.
- Long company and business names at 320 and 390 px, plain, CSS zoom 1.3 and every font at
  130%: nothing wider than the window, nothing overflowing, no page error.
- The hosted board (`web/` served on 127.0.0.1, the save picked with "Open one file"): the
  landing and the loaded board on desktop and phone. On the phone the source strip is one line
  and the first critical action is on the first screen.

## Acceptance pass, review round 2 (26 Sep 2026)

After the independent code review, visual QA and functional QA of `a847704`
(`execution/c1-final-code-review`, `c1-final-visual-qa`, `c1-final-functional-qa`):

| # | Finding | Fix | Regression test |
| --- | --- | --- | --- |
| 1 | MUST: the shell stylesheet's comment opener had moved to just before `</style>`, so the dark theme dropped `--neg-soft`, `--warn-soft`, `--info-soft` and `--ink-3` (my merge script had read the banner's `=======` as a conflict marker; no other line was lost) | Opener back in place, the stray copy removed, `web/` rebuilt | `tests/test_css_integrity.py` walks every stylesheet in order (orphan `*/`, unclosed `/*`, conflict markers) and fails on `a847704`; `tests/shell_routes.test.cjs`, "the dark theme keeps the shell's own colours…", reads the computed variables in Edge |
| 2 | Schedules summarised the demand plan while the shop showed full cover | `spShownRow()` is the one plan choice for the shop's Staffing, its write and Schedules; a plan pick marks Schedules stale (`nxSchedStale()`) | `tests/roster.test.cjs`, "Staffing › Schedules summarises the plan the shop shows…" |
| 3 | `#staff` opened Staff needs at the top | `ROUTE_ALIAS_INTO` lands it on `#secStaff`; `#secStaff`, `#payroll`, `#secPayroll` and the remembered views unchanged | shell_routes, "#staff lands on the hiring block…" |
| 4 | The finder switch left the route behind | `routeFor()` reads the switch; the switch calls `routeSync()`; City map reached with the finder left on is Find a location | shell_routes, "the finder switch moves the page…, both ways" |
| 5 | "Whom should I hire?" opened a shop under Businesses › Results | Lands on Staffing › Staff needs at the hiring block; the strip remembers where it was asked (a site's page included) and goes Back there with the browser's Back | shell_routes, "\"Whom should I hire?\" lands on Staff needs' hiring block…"; the search tests on the old answer now assert the new one, with their checks (tag not clipped, lit and dimmed blocks, strip placement, live refresh, landing taken down, way back) kept |
| 6 | 320 x 568 (CLI and hosted) and 390 x 844 at 130%: the first critical action under the bar | On a phone: rows read headline, action, then evidence (the DOM keeps the evidence first for screen readers); a tighter head, with Customize checks as its icon; the day and source dot on one line; the company line without the day; what the board checked under the list; the news in two short lines; an action's words wrap inside its button | shell_routes, "on a 320 x 568 phone, and at 130% on 390 x 844…"; the Edge screenshots below |
| 7 | Schedules was titled "Shop schedules" | "Shop and office schedules", its line naming the office default; an office with a plan shows its staffed computers | shell_routes, "Staffing › Schedules is named for shops and offices…" |
| 8 | Dark kind labels at 4.01:1 | Fixed by 1 (`--ink-3` #808a84) | the dark-theme test asserts >= 4.5:1 on the ground and on a surface |
| 9 | The finder's picked building was lost on a reload | Kept on the history entry (`nxPick`); a reload or Back picks it again where the results still hold it, and drops it where they do not | shell_routes, "the building picked in Find a location comes back after a reload…" |

Found on the way: switching the finder on now shows Expansion's row of views, which moved the
list lower. On a short phone a tapped result's card then opened above the window
(`tests/finder.test.cjs`, "on a short phone the card scrolls…"). A result picked from the list
on a narrow page now brings the map back under the masthead.

Results (Windows, Edge, `--test-concurrency=2`). The last TEMPLATE CSS change was the padding
on Schedules' highlighted row. The finishing gate was run again on the source after it (`web/`
rebuilt first):

| Run | Result |
| --- | --- |
| Earlier, before the padding change: full Python `py_full5`, full Node `node_full5`, web `node_web5` | 1354 OK (1 skipped); 1187: 1186 pass, 0 fail, 1 skipped; 409/409 |
| **Final gate**: `python build_web.py` then `--check` | `web/ is up to date` |
| **Final gate**: full Python (`py_full6`) | 1354 tests, OK, 1 skipped |
| **Final gate**: full Node (`node_full6`) | 1187 tests: 1186 pass, 0 fail, 1 skipped |
| **Final gate**: `BOARD_TARGET=web`, the 16 files (`node_web6`) | 409 tests: 408 pass, **1 fail**. See below |
| After the test fix: `BOARD_TARGET=web`, the 16 files (`node_web7`) | 409 tests, 409 pass, 0 fail |
| After the test fix: `tests/search.test.cjs` on the CLI target | 54 tests, 54 pass, 0 fail |

The `node_web6` failure was the search test "the sphere rests between the places and the
references…". It failed in about a third of focused runs on the web target and never on the
CLI target. Its diagnostic: `page.click('.wordmark')` resolved to two elements and clicked the
first, the hosted landing's own wordmark, which is hidden once the board is entered. The test's
web-target harness enters the board without the landing ever being removed, so the landing's
hidden copy was still in the page to be found. This was test ambiguity, not a product fault:
`app.js` removes the landing on entering a real board, for exactly this reason.

Removing the landing by hand in the harness was tried and dropped. Those focused runs
(`/tmp/c1/sph_*.log`, all web target) logged `Failed to execute 'appendChild' on 'Node':
parameter 1 is not of type 'Node'.` The stacks put it at `place` (`web/app.js:486`) and
`paintStrip` (`web/app.js:385`). `place()` moves `#srcStrip`, `#srcNote` and `#help` out of the
landing once the board is on, and with the landing already gone they are `null`. In the product
the landing is removed only at the end of `place()`, after those moves.

Reproduced deliberately with a throwaway copy of the test: 6 of 6 web runs logged these errors,
and the test failed in 5. Without the removal the committed test was clean: 10/10 web and 10/10
CLI, with the `page.errors` assertion kept. The CLI page does not load `app.js`, so the CLI
target cannot raise it. It was an artefact of the discarded harness step, not a sphere or
refresh race. The fix scopes the test's two wordmark clicks to the board's masthead
(`.wrap .mast .wordmark`). Every sphere, rest and layout assertion is unchanged. Focused after
the fix: 8/8 on the web target, 1/1 on the CLI target.

Two targeted runs failed on the way and were fixed before the full runs:
- 10 of 353: eight search tests still asserted the old hiring answer, today_layout's 390 px test
  expected "Day" in the company line, and the finder card test found the map above the window.
- Then the finder card test alone, which found the map under the sticky masthead.

Screenshots and measurements, rendered in Edge from the synthetic day-47 save (the CLI render,
and the built `web/` served on 127.0.0.1 with the save loaded through Pyodide), are in
`C:/Users/Peter/.codex/handoffs/big-copilot-ui-redesign-2026-09-26/execution/chunk1-review2-shots/`:

- `phone_*` and `phone-first-view.txt`: the first critical action (top–bottom y) against the
  bottom bar's top.

  | View | Action | Bar |
  | --- | --- | --- |
  | CLI 320 x 568 | 343–387 | 507 |
  | CLI 390 x 844 | 349–393 | 783 |
  | CLI 390 x 844 at 130% | 524–581 | 765 |
  | Hosted 320 x 568 | 454–498 | 507 |
  | Hosted 390 x 844 | 445–489 | 783 |
  | Hosted 390 x 844 at 130% | 687–744 | 765 |

  None scrolls sideways, and none has a page error. The hosted board keeps its news strip, its
  source strip (Up to date, Update, the menu) and the day with the source dot.
- `desktop_*`, `tablet*`, `phone_390_*` light and dark, `pointer_1280_*`, `long_*`, `web_*`
  and `measurements.txt`:
  - The sphere is at 1440, 1024 and 800 px.
  - Every masthead link lands at 1280 px after three wordmark clicks.
  - Long names at 320 and 390 px, plain, zoomed and at 130% text, overflow nothing.
  - Unpressed severity switches measure 5.27:1 (light) and 7.38:1 (dark).
- `schedules-*`, `staff-alias-1440-dark`, `ask-hire-390-dark` and `routes.txt`: the renamed
  Schedules page, `#staff` landing on the hiring block, and the hiring question's landing with
  its way back.

Files changed in this round:
- `ba_dashboard.py`: CSS, the route layer, Schedules, the hiring question, the Overview's phone
  layout.
- `web/map.js`: the finder switch, the pick on the history entry, a narrow pick bringing the
  map into view.
- `build_web.py`: the news strip on a phone with a board.
- Tests: `tests/test_css_integrity.py` (new), `tests/shell_routes.test.cjs`,
  `tests/roster.test.cjs`, `tests/search.test.cjs`, `tests/today_layout.test.cjs`.
- Docs: `docs/archive/ui-route-migration.md`, `docs/architecture.md` and this file.
- Generated by the build: `web/index.html`, `web/py/ba_dashboard.py`, `web/version.json` and
  `web/i18n/de.json` (which ships only the keys in use).

### State at the handover (26 Sep 2026)

- **Candidate:** the working tree on `codex/ui-redesign-shell` over local merge commit `a847704`,
  uncommitted, for the coordinator's snapshot.
  - Modified: `ba_dashboard.py`, `build_web.py`, `web/map.js`, `tests/shell_routes.test.cjs`,
    `tests/roster.test.cjs`, `tests/search.test.cjs`, `tests/today_layout.test.cjs`,
    `docs/archive/ui-route-migration.md`, `docs/architecture.md`, this file.
  - New: `tests/test_css_integrity.py`.
  - Generated by the build: `web/index.html`, `web/py/ba_dashboard.py`, `web/version.json`,
    `web/i18n/de.json`.
- **Screenshots:** `…/execution/chunk1-review2-shots/`, including
  `schedules-litrow-{390,1440}-dark.png` and `-390-light.png`. There the highlighted row's
  content starts 9 px after its 3 px accent bar.
- **Review:** all nine findings of the code review, visual QA and functional QA of `a847704` are
  addressed above. No independent re-review of this candidate has run yet. It is not accepted;
  the redesign is not finished, and chunks 2 and 3 have not started.
- **Not done here:** no commit, merge, push or deploy.

## Known limitations and what is deferred

- **Interim hosts.** Every route below the Overview still shows its old page or tab
  ([ui-route-migration.md](ui-route-migration.md), "Interim target"). Supply's task views are the
  Shops, Warehouses and Factories tabs under a Scope label; a business's page is still the
  Company site panel; Find a location is still the City map's finder mode. Chunks 2 and 3
  replace those presentations, never the route ids.
- **Staff needs is two pages stacked.** The staff demands (`secNeeds`) and main's Staff page
  (`secStaff`) each keep their own heading, and the Staff page keeps its own short Payroll
  summary beside the Payroll view. H01–H07 are reachable and unchanged. Merging them into one
  Staff needs presentation is chunk 2.
- **Offices on Schedules** count the office default's staffed computers; their hour grid,
  the plan's week and its write stay on the office's own page.
- **The phone's first screen** fits a critical finding and its action above the bar at
  320 x 568, including the hosted board with its news and source strip, by a small margin
  (9 px in the hosted board). A much longer company name, or a larger system text size on top
  of that, can push the action just under the bar; it is then one short scroll away. On a phone
  the news sentence is cut to one line on screen (a screen reader reads it whole), and the line
  about what the board checked sits under the list.
- **Search.** Typing "staff" lights "Staffing for factory lines" first; Hiring is in the list
  and first for "hire" and "hiring".
- **Translations.** New shell text goes through `tt()`/`data-tt` with English fallbacks, no
  hard-coded English. `i18n/de.json` keeps both sides' merged entries but has none of the new
  shell keys yet, so a German board shows the shell in English; completing it is chunk 3.
  Main's Staff page is English-only as it shipped.
- **Preferences, help and the footer** are where they were; moving them is chunk 3.
- **The structure proposal's ledger** is not annotated in this checkout: the coordinator
  amended it (H01–H07) in the integration checkout, so chunk 1's access parity for those rows
  is recorded in the route table instead.
- **Environment.** The suites ran on Windows with Edge (`PLAYWRIGHT_CHANNEL=msedge`), as
  Playwright's own Chromium is not installed here. The i18n_layout test "a change of language
  writes the strip's file line again…" had failed here before chunk 1 too. The cause: Edge's
  Local Network Access holds the test page's request to the game link on `127.0.0.1` for a
  prompt nobody answers, so the test times out. It passes in 1.1 s once the permission is
  granted, so its `shell()` harness now grants `local-network-access` (ignored by a browser
  without it). How the hosted game link meets that permission in a real browser is main's
  behaviour, untouched by chunk 1 and not verified here.

## Recheck fixes after `a09d162` (26 Sep 2026)

Three items from the rechecks of `a09d162` (`execution/c1-recheck-code`, `c1-recheck-code-sol`,
`c1-recheck-functional`). Everything else those reports rechecked was confirmed fixed.

| Item | Fix | Test |
| --- | --- | --- |
| Finder pick against history (both Sol reports): a pick was lost after area re-entry and a reload, and Back could show a later pick under an earlier entry | The history entry is the pick's source of truth. `showFinder(mode)` now gets the route's history mode. A new visit (area row, masthead, a task without a preset) takes the pick on screen onto its entry. Back, Forward and a reload show the entry's own `nxPick` where the results still hold it, even with another building picked, and no pick where the entry has none or its building has left the results. That is what a plain reload of the same entry shows | `tests/shell_routes.test.cjs`: "two visits to Find a location keep their own picks through Back and Forward" (card, pressed row, `history.state`); "a pick carried into Find a location by the masthead survives a reload of that visit". Both fail against `a09d162`'s `web/map.js` and pass now. The synthetic save has one rival, so the first test adds a second one at runtime |
| Ask strip Back after a re-pick (Opus report): "Back to Overview" landed on the first price guide | A pick on the strip replaces the answer's own history entry (`ssRepick`, `location.replace` in `ssHash`), so the question is one visit and Back is one step | `tests/search.test.cjs`, "answers for each kind of shop": the re-pick adds no visit, and Back reaches the Overview |
| Office line plural (Opus nit) | The plural follows the computers it counts: "Office default: {s} of {n} computers staffed", with `n` the office's computers. The key has no German entry yet, so nothing else to align | covered by the Schedules tests |

Left for later chunks, as the brief says: City map against finder history (`#map` while the finder
is on), and the phone Tab order in finding rows. Phone widths are optional from now on (a PC
game), so none of this round is phone-only work.

Validation on this working tree (Windows, Edge, `--test-concurrency=2`, normal priority):

| Run | Result |
| --- | --- |
| `python build_web.py`, then `--check` | `web/ is up to date` |
| finder, map, shell_routes, search, navigation (CLI target) | 229/229 (navigation + map 83, finder 67, shell_routes 25, search 54) |
| shell_routes, search (`BOARD_TARGET=web`) | 79/79 (shell_routes 25, search 54) |
| `python -m unittest tests.test_css_integrity tests.test_doc_registries` | 6 tests, OK |

Changed in this round:
- Source: `ba_dashboard.py`, `web/map.js`.
- Tests: `tests/shell_routes.test.cjs`, `tests/search.test.cjs`.
- Docs: `docs/archive/ui-route-migration.md`, `docs/architecture.md`, this file.
- Generated: `web/index.html`, `web/py/ba_dashboard.py`, `web/version.json`.

Nothing is committed; the coordinator commits.
