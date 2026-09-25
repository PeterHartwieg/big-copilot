# Project agent instructions

Big Copilot is a dashboard for Big Ambitions save files. It has two front doors over one
codebase: a local Python CLI that writes `dashboard.html`, and the static site at
bigcopilot.com, which runs the same Python in the browser through Pyodide. A small
Cloudflare Worker API adds the community features.

## Where changes go

`ba_dashboard.py` holds four separable parts in one file. Find each by its anchor, never by
line number — the file is long and the numbers drift.

| Part | Anchor |
| --- | --- |
| Extraction (save → numbers) | `def extract(` and the `_` helpers before `def render(` |
| The board's HTML, CSS and JS, stored as a Python string | `TEMPLATE = r"""`; the board script is its last `<script>` block |
| Where `web/map.js` and `web/wiki.js` are spliced in | `/*__MAP_SCRIPT__*/`, `/*__WIKI_SCRIPT__*/` |
| CLI, save catalogue and watch server | `def main(` and the functions around it |

Everything else:

- save parser: `ba_save.py`
- web build: `build_web.py`
- landing screen markup and CSS, the news strip included: `BANNER` in `build_web.py`;
  `BEFORE_SCRIPT` beside it lists the scripts loaded ahead of the board's
- browser shell behaviour (save picking, the three sources, owns the worker): `web/app.js`.
  It holds no static landing markup, but at runtime it builds the save picker and fills in
  the recover and folder buttons and the link button's New badge
- Pyodide worker: `web/worker.js`
- update banner: `web/update.js`
- map: `web/map.js`, `web/map.css`, with assets from `export_map.py`
- wiki pipeline: the `.py` files directly in `tools/` (not `tools/game_update/` or
  `tools/game_link_mock.py`), with the authored wording in `tools/wiki_sample.json` and the
  hand-written articles in `tools/wiki_topics.json`. `tools/` also holds the GLM launcher,
  `tools/Invoke-ZaiClaude.ps1`, which is nothing to do with the wiki
- static wiki pages for search engines (`/wiki/...`, the sitemap, robots.txt):
  `tools/wiki_pages.py`, from `web/wiki-data.json`
- location finder: `web/map.js` hosts it as a mode of the Map page, over the `premises`
  payload key from `_premises()` in `ba_dashboard.py`; its floor plans are
  `web/maps/floor-plans.json` from `make_floor_plans.py`, keyed by each building's
  `layout` (size code plus version)
- community API: `server/`, `migrations/`, `web/community.js`
- changelog: `web/changelog.json`
- supporting a new game build: `docs/game-update.md`, with its scripts in `tools/game_update/`
- game link: the wire contract is `docs/game-link-api.md`; the mod is `mod/BigCopilotLink/`
  (C#, built only inside the modding SDK's Unity project, never here); the mock that
  serves the contract from a save on disk is `tools/game_link_mock.py`; the clients are
  the third source in `web/app.js` and `--game` in `ba_dashboard.py`

Searching:

- A root `.ignore` hides the generated copies (`web/py/`, `web/index.html`, `web/wiki/`,
  `web/wiki-data.json`) and the design canvases from `rg`. `rg -uu` searches them too.
- `rg -n "^# -{6,}|^/\* --- " ba_dashboard.py` lists the file's section banners, a table of
  contents for both the Python and the board script.

## Names on screen and in code

The board's words and the code's ids often differ, so grep the id, not the word.

| On screen | In code |
| --- | --- |
| Staffing (a site's week of hours) | `roster`: `spRoster*` in the board script; `_staffing()` (the `staffing` payload key) and `_current_roster()` in Python |
| Idle stock | finding kind `dead` |
| Overstaffed hours | finding kind `idlestaff` |
| Demand wave ending | finding kind `hype`; the site panel's promotion row is `spHypeRow`, over the `hypeExposure` payload key |
| Satisfaction (site panel block) | block `standards` |
| Promotion (site panel block) | block `pull`, drawn by `spPull()` |
| At capacity, building capacity | finding kind `atcap`; the capacities are `_door_caps()` and `FALLBACK_CAPS` |
| Milestones | `secGoals`, drawn by `drawGoals()` |
| Staffing for factory lines | `drawFactoryStaffing()`, over the `factoryStaffing` payload key from `_factory_staffing()` |

Words the board does not use, in UI text, wiki text and docs alike (code ids keep their
names):

- Say "building capacity", not "door cap". The game's own label is "Customer capacity".
- No "roster", "shift" or "post". Say staffing or scheduling, talk in hours and days, and
  name the station (Cash register, Cleaning station, Security guard locker). Hiring is
  counted in people. The game's own demand text ("No evening shifts") is quoted as it is.
- Never advise opening a second location or a bigger site because one is at building
  capacity. Being at capacity is normal in a good setup, not a finding.

Older design docs (the `*-scope.md` files) still use "door cap" and "shift"; follow the
rule in new text and leave historical docs as they are.

## Sources and generated files

Change the source, then rebuild. After a merge conflict in a generated file, take either
side and rebuild — the rebuild is the resolution.

| Generated file(s) | Regenerated by |
| --- | --- |
| `web/index.html`, `web/version.json`, `web/py/ba_dashboard.py`, `web/py/ba_save.py`, `web/py/ba_buildings.json`, `web/py/ba_demand_curves.json` | `python build_web.py` |
| `web/py/gametext.json`, `web/wiki-data.json` | `python build_web.py`, which needs the installed game |
| `web/names/<lang>.json`, the game names in each other language the game ships | `python build_web.py`, which needs the installed game; the language list is `GAME_NAME_LANGS` in `ba_dashboard.py`, and the build stops when the game's `locale.json` disagrees with it |
| `web/wiki/**/index.html`, `web/sitemap.xml`, `web/robots.txt` | `python build_web.py`, from the committed `web/wiki-data.json` through `tools/wiki_pages.py`; `python tools/wiki_pages.py` alone needs no game |
| `web/maps/locations.json`, `web/maps/map-background.svg` | `export_map.py`, from private geometry; owner only |
| `ba_buildings.json` | `make_buildings.py`; the `v` (version) key comes from `make_buildings.py --versions`, which reads the installed game's buildings bundle with UnityPy; owner only |
| `web/maps/floor-plans.json` | `make_floor_plans.py`, which draws the building shells out of the installed game's Addressables bundles with UnityPy; owner only. `build_web.py` refuses a set that misses a layout `ba_buildings.json` uses |
| `ba_demand_curves.json` | `make_demand_curves.py`, which reads the installed game's Addressables bundles with UnityPy; owner only |
| `mockup/*/*.dc.html` and `mockup/*/canvas.json` | the `mockup/*/build_*.py` generators, such as `mockup/revamp/build_canvas.py` |
| `mockup/find-location/data.json` | `mockup/find-location/make_data.py`, which reads a real save and a session-scratchpad `hart.json` at hard-coded paths, so it does not run as committed; owner only. Every other file under `mockup/` is hand-made or owner-supplied, `mockup/ui-mockup.html` and the `city.jpg` backdrops included |
| `dashboard.html`, `market_history.json` | local runs; gitignored |

## Finishing a change

| You changed | Run |
| --- | --- |
| `ba_save.py`, `ba_dashboard.py` (extraction) | `python -m unittest discover -s tests`, then `python build_web.py`. Premises extraction is `tests/test_premises.py` |
| The `TEMPLATE` markup, CSS or board script | `python -m unittest discover -s tests` and `node --test tests/*.test.cjs`, then `python build_web.py` |
| `web/app.js`, `web/worker.js`, `web/update.js` | `node --test tests/*.test.cjs`, then `python build_web.py` |
| `build_web.py` `BANNER` or `BEFORE_SCRIPT` (landing screen, news strip) | `python build_web.py` first, since the Node tests and `tests.test_privacy_promises` read the built page; then `node --test tests/news.test.cjs tests/release.test.cjs tests/update.test.cjs` and `python -m unittest tests.test_privacy_promises tests.test_footer` |
| `web/changelog.json` | `python -m unittest tests.test_release_latest`, then `python build_web.py`: the file is a build stamp input |
| A new finding kind, view, payload key, finder filter, footer link or news item | the matching checklist in the Registries section of `docs/architecture.md`, and the tests it names |
| `web/map.js`, `web/map.css` | `node --test tests/map.test.cjs tests/finder.test.cjs` and `python -m unittest discover -s tests -p test_map_assets.py`, then `python build_web.py`. The finder lives in `web/map.js`; `tests/finder.test.cjs` also covers `drawFindLocation` in `ba_dashboard.py`, and `finderPreset`, through a Growth › Demand cell opening the finder |
| `tools/*.py` (the wiki pipeline, not `tools/game_update/` or `tools/game_link_mock.py`), `tools/wiki_sample.json`, `tools/wiki_topics.json`, `web/wiki.js`, `web/wiki.css` | `python -m unittest discover -s tests -p "test_wiki*.py"` (the hand-written articles are `tests/test_wiki_build.py`) and `node --test tests/wiki*.test.cjs`, then `python build_web.py` |
| `server/`, `migrations/` | `npm run test:community` and `npm run check:worker` |
| `web/community.js`, `web/community.css` | those two npm commands, then `python build_web.py` — both files are cache-busted by the build stamp |
| `make_buildings.py`, `make_floor_plans.py` or what they write | `python -m unittest tests.test_floor_plans tests.test_premises`, then `python build_web.py` |
| `tools/Invoke-ZaiClaude.ps1` | `python -m unittest tests.test_agent_cli` |
| `tools/game_update/` | no tests: run the script you changed against the installed game (`docs/game-update.md`) |
| `tools/game_link_mock.py`, `docs/game-link-api.md` | `python -m unittest tests.test_game_link_mock tests.test_watch_game` and `node --test tests/game_link.test.cjs`; a contract change bumps `schemaVersion` in the doc, the mock, the mod and both clients in one commit |
| `mod/BigCopilotLink/` | nothing runs here: Peter builds it in the SDK's Unity project on the Mac (its README) and checks `curl http://127.0.0.1:8322/health` |

`python build_web.py --check` verifies that `web/` matches the sources without needing the
installed game; run it when you cannot rebuild.

Changelog: only a new feature or a new user-facing capability gets an entry in
`web/changelog.json`. Mechanical changes and fixes that add neither get no entry and are
not announced to users. Format and the rest of the rule: `docs/contributing.md`.

Saves are private company data. Tests use synthetic fixtures only — never add a real save,
and never attach one to an issue.

## Environment

- `build_web.py` needs the installed game. `ba_save.find_game_locale()` detects it in the
  usual Windows, macOS and Linux Steam locations; `BA_LOCALE` names its `en.json` when it
  lives elsewhere, and has to be the copy inside the install, at
  `<game>/.../StreamingAssets/locale/en.json`, because the wiki reads `helpstructure.json`
  beside it. The build refuses the text bundled at `web/py/gametext.json`.
- A worktree without `node_modules` either points `NODE_PATH` at the canonical checkout's
  `node_modules`, or runs `npm ci` and then `npx playwright install chromium`.
- `PLAYWRIGHT_CHANNEL=msedge` (or `chrome`) uses an installed browser instead.
- The Python tests need `node` on PATH: several of them execute embedded JS.

## Traps

- CSS classes are global across every page of the board, so give a new class a feature
  prefix or scope it under its page's root class. `.site` and `.chip` have collided before.
- `web/map.js` and `web/wiki.js` are spliced into the board script and run in its global
  scope, reusing its helpers (`attr`, `icon`, `wireTips`, `ICON`, `shortName`). A new top-level
  name must be unique across all three files.
- `section{content-visibility:auto}` clips absolutely positioned children, so a popover
  rendered inside a section is cut off. Hang it off `<body>` with `position:fixed` and
  place it against its anchor, the way `#tip` and `#alertPop` do. The
  `section.measured{content-visibility:visible}` escape hatch is for the Playwright tests,
  which add `measured` to measure a section that is off screen; it is not the fix.
- Several Node tests find code by slicing the source between comment or declaration
  strings, so when you change a comment or declaration near such an anchor, update the test
  to match. In `ba_dashboard.py`: `tests/alert_kinds.test.cjs`, `tests/fold_views.test.cjs`,
  `tests/milestones.test.cjs`, `tests/navigation.test.cjs`,
  `tests/order_checklist.test.cjs`, `tests/search.test.cjs`. In `web/app.js`:
  `tests/game_link.test.cjs`, `tests/game_text.test.cjs`, `tests/performance.test.cjs`,
  `tests/resume.test.cjs`, `tests/save_location.test.cjs`. `tests/alert_kinds.test.cjs` also
  matches a fragment of the findings loop in `mapFindings()` in `web/map.js` with a regex.
  Two Python tests read `TEMPLATE` as text: `tests/test_plan_orders.py` cuts
  `function planOrder(` out of it, and `tests/test_routed_supply.py` checks the line with
  `id:"shortfall"`.
- Set iteration order follows Python's per-process hash seed, so when a set decides the
  order of anything that reaches the payload, iterate it through `_in_order()`, which sorts
  `None` last because real saves hold items with no name. When a set decides a winner
  (`most_common()`, first-wins), break the tie explicitly, as `_chains()` does.
- The Pyodide worker fetches five files from `web/py/` — `ba_save.py`, `ba_dashboard.py`,
  `gametext.json`, `ba_buildings.json`, `ba_demand_curves.json` — and at runtime writes
  the save, the player's optional `en.json` and the history; `browser_build()` writes the `.character` sidecar from
  the Python side. Nothing else is on the virtual filesystem when `ba_dashboard` is imported,
  so it must not open any other file at import time. Read it lazily, inside a function, as
  `load_buildings()`, `load_demand_curves()` and `render()` do.

## Where to read more

- Changing how Python data reaches the page, or adding a payload key, a page or a template
  placeholder → `docs/architecture.md`
- Adding a finding kind, view, payload key, finder filter, footer link or news item → the
  Registries section of `docs/architecture.md`
- Supporting a new game build → `docs/game-update.md`
- Releasing, deploying, adding a feature badge, writing a changelog entry or exporting map
  assets → `docs/contributing.md`
- Working out what a number on the board means → `docs/dashboard-reference.md`
- Touching the wiki build or its catalogue → `docs/wiki-data-pipeline.md`
- Touching presence, voting or the feature list → `docs/community-features.md`

Finished scopes and plans are in `docs/archive/`, for history only.

<!-- Planned, not yet written: docs/domain-notes.md (Big Ambitions game rules the board
     relies on), docs/agent-workflow.md (the coordinator's worktree and review loop).
     Link them here when they land. -->

## Working alongside other agents

Preserve pre-existing changes in any working directory you are given; they may be another
worker's.

Each task gets its own git worktree, branched from `origin/main`, plus explicit
non-overlapping file ownership. The worktree is removed after the merge; the main folder
stays on `main`. Edit only the files your task names.

Do not set execution timeouts or time limits for CLI commands or subagents. Let them
finish; non-terminating polling or output-yield intervals are fine.

Implementation workers run Opus 5.5 (`claude-opus-5-5`) through the normal Claude Code
login, as a subagent or as `claude -p --model claude-opus-5-5`. GLM through
`tools/Invoke-ZaiClaude.ps1` (default `glm-5.3-flash`, key fetched from 1Password at runtime)
is still available when a task asks for it. Both are covered in `docs/agent-cli.md`. Never
print or persist an API key, and never silently substitute a model. Delegate only when the
user asks.

Commit, push and deploy only when your task authorizes it.
