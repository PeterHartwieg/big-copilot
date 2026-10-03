# Contributing

For setup, see the [README](../README.md). File paths below are relative to the repository root.

## Files

| File | What it does |
| --- | --- |
| `ba_save.py` | Reads the `.hsg` format, being gzip around an Easy Save 3 binary stream. The format notes are in the module docstring. |
| `ba_dashboard.py` | Pulls the numbers out of a parsed save and renders the HTML from `template/board.html` and `template/board.js`. |
| `template/board.html` | The board's markup and CSS, with the placeholders `render()` fills in. |
| `template/board.js` | The board script, spliced into the last `<script>` block of `board.html` (`/*__BOARD_SCRIPT__*/`). A branch from before the split: [Template placeholders](architecture.md#template-placeholders). |
| `build_web.py` | Assembles `web/` from the same template the local server uses. `python build_web.py --assemble` writes the code-derived site without the game; it is gitignored, so run it before the tests and before looking at the site locally. The full `python build_web.py` also rebuilds the committed game-derived files and needs the game. |
| `web/` | The static site. `index.html` is assembled and not committed; `app.js` and `worker.js` are kept by hand; `py/` holds the copies of the Python files and data the worker fetches ([The static site](architecture.md#pyodide)). |
| `web/map.js`, `web/map.css` | Shared map/overlay code, embedded by `render()` into browser and local output. |
| `web/maps/locations.json`, `web/maps/map-background.svg` | Generated address hit geometry and zoomable background. The approved poster exports remain unchanged. |
| `export_map.py` | Builds runtime assets from approved canonical geometry, its recipe and the poster SVG. Extraction snapshots are retained privately. |
| `web/maps/floor-plans.json`, `make_floor_plans.py` | The finder's floor plans, one for each building layout, drawn from the installed game's building shells. |
| `check_saves.py` | Parses and extracts every save under the save root and prints a table, plus spot-checks of known numbers. Run `python check_saves.py [folder]`. |
| `tools/payload_diff.py` | Proves a refactor leaves the payload alone over every save on the machine: `dump research/<name>` on main and on the branch, then `compare` the two; it exits 1 on any difference. The dumps hold save contents, so they go under the gitignored `research/` and are never committed. |
| `wrangler.jsonc` | Cloudflare assets and community Worker config. `npm run deploy` assembles `web/` and publishes it with the server ([Deployment baseline](#deployment-baseline)). |
| `server/`, `migrations/` | Community presence/voting API, curated feature list, and D1 schema. Server code stays outside public assets. |
| `web/community.js`, `web/community.css` | Hosted-site community controls; included by the browser build only. |
| `web/wiki.js`, `web/wiki.css` | Wiki navigation, readers and visual business guides, including primary and secondary products. |
| `web/i18n.js`, `tools/i18n.py`, `i18n/` | Big Copilot's own text in other languages: `tt()` and the table loader, the catalogue tool, and the translations (German first). `web/i18n/` is assembled from `i18n/` by `python build_web.py --assemble` and not committed. |
| `tools/build_wiki_data.py`, `web/wiki-data.json` | Build the public Wiki catalogue from the installed game's help. The browser build refreshes this before calculating its cache version. |
| `dashboard.html` | The generated page from a local run. Overwritten each time. |
| `market_history.json` | Rolling demand snapshots and the cash/net-worth ledger, per character, from local runs. Safe to delete; it rebuilds, but the accumulated trend history is lost, so back it up rather than deleting it. |
| `LICENSE` | MIT. |

## Contributing, and reporting a save that will not build

The save format is reverse-engineered from the game's own files, so a game update can
break it. If a save is refused or the board fails to build, open a GitHub issue with:

- The one sentence the tool printed. It names the field, the game build the save came
  from and the build the board was checked on, which is most of the diagnosis.
- Whether you were in the browser or running from source.
- The game build number, if the message did not carry it.

Please do not attach a save file to a public issue unless you are happy for it to be
public. A save holds your whole company.

Before sending a change, run `python check_saves.py` over your own save folder. It parses
and extracts every save it finds and prints a table, which catches a parse that succeeds
while producing plausible wrong figures.

The code-derived site under `web/` (`index.html`, `version.json`, the `web/py/` copies,
`web/i18n/`, the static wiki pages, `sitemap.xml`, `robots.txt`) is not committed.
`python build_web.py --assemble` writes it from the committed sources without the installed
game; run it before the tests, since many of them read the built page. `python build_web.py
--check` confirms that `web/` matches the sources, and `tests/test_web_fresh.py` runs the same
check. The game-derived files (`web/py/gametext.json`, `web/wiki-data.json`, `web/names/`)
are committed; a change that reaches them, such as to the wiki generator or to how
`ba_dashboard.py` builds the name tables, needs the full `python build_web.py` with the game,
and the rebuilt files are committed with it.

Install Python 3 and Node.js 24, then run `npm ci` and
`npx playwright install chromium` (on Linux, use `--with-deps` if system browser
libraries are missing). Run `npm run verify` for the complete CI gate: assembly,
Python unittest discovery, all Node suites with concurrency 2, the optimized
hosted-page suites, the Worker dry-run, and the assembled-file check. The runner
restores readable assembly before the final freshness check. It needs no game, real saves or production credentials,
and works in a dirty development checkout. Each failure stops later stages.

Except for the standalone Worker check, Python is selected from `PYTHON`, then
`python3`, `python` or the Windows `py`
launcher. An explicit invalid `PYTHON` fails without falling back. Set `PYTHON` to
an executable path, without command arguments; paths with spaces are supported.
The resolved interpreter is passed to every child, including the Node suites.

Focused commands also assemble first:

- `npm test` runs all Node suites; `npm test -- tests/map.test.cjs` selects a suite
  (multiple filenames and quoted `*` filename patterns are accepted). Focused
  `npm test` accepts filenames/patterns, not raw Node test flags.
  `npm test -- --shard=1/4` reproduces one CI shard using Node's native file
  sharding over the complete, sorted suite list. The four shards cover every
  file once, including newly added suites. Sharding cannot be combined with
  focused filenames; `npm test` and `npm run verify` still run the full list.
- `npm run test:python` runs Python discovery;
  `npm run test:python -- tests.test_premises` selects a module. Arguments after
  `--` are passed to unittest, including discovery options.
- `npm run test:optimized` assembles, optimizes the hosted page, runs CI’s hosted
  suites with `BOARD_TARGET=web` and concurrency 2, then restores readable assembly
  on success. If optimization or a hosted test fails, later stages stop; run
  `npm run verify:assemble` to restore readable output before inspecting it.
- `npm run test:community` runs the community API and browser suites.
- `npm run check:worker` checks the Worker bundle without publishing it.
- `npm run verify:assemble` assembles only; `npm run verify:check` checks the
  existing assembly without rebuilding it.

CI uses GitHub-hosted Ubuntu runners: four Node shards (concurrency 2 each),
the optimized hosted-page suites and Worker dry-run in a fifth Node lane,
and independent Python and assembly-freshness jobs. All lanes run in parallel;
the stable `Node suites` check requires every Node lane to succeed, and a failed
lane does not cancel its siblings. Browser installation needs only Chromium's
headless shell. CI additionally requires assembly to leave no committed changes
or untracked files. Local verification does not require
a clean working tree. Worktrees can reuse installed dependencies by setting
`NODE_PATH` to the canonical checkout’s `node_modules` instead of running `npm ci`
again; this also supplies Wrangler for the dry-run and esbuild for the optimizer.

The UI regressions run in a real browser. Set `PLAYWRIGHT_CHANNEL=msedge` or
`chrome` to use an installed browser instead of downloaded Chromium.
Set `BOARD_TARGET=web` to check the generated browser page after rebuilding it.
The layout fixtures are synthetic; no game or save is needed. They cover desktop
table sizing, crowded planner controls, keyboard access to downtime, and scrolling
inside tables on narrow screens.

Community checks use real local D1 via Miniflare and browser fixtures with synthetic
identities. Run `npm run test:community`, and
`npm run check:worker` to validate the deployment bundle without publishing it.
See [Community features](community-features.md) for database/secret setup and the
first production release steps. No live API credentials are needed for tests.

Keep layout changes in the shared template, `template/board.html` and `template/board.js`: let section
controls wrap, let text cells grow and wrap while keeping amounts intact, and put
lengthy per-machine detail behind a disclosure. Do not reintroduce a fixed board
width or use an unbroken note to size a metric column. Issue #7's screenshots show
why both the shared layout and the displayed content need regression coverage.

## Adding text to the page

Every word Big Copilot writes itself goes through a key, so it can be translated: the
call forms, keys, placeholders and the one-key-per-sentence rule are in
[UI text](architecture.md#ui-text). After adding or changing such text, run
`python build_web.py --assemble`, then `python -m unittest discover -s tests -p "test_i18n*.py"`
and `node --test tests/i18n_*.test.cjs`. The German for a new key comes later, from a translation pass;
until then the page shows the English.

## Changelog

Add an entry to `web/changelog.json` only for a new feature or a new
user-facing capability. A change that adds neither gets no entry and is not
announced to players: refactors, tooling, tests, documentation, build changes
and internal fixes all stay out of the changelog. An entry carries its PR
number, merge date (`YYYY-MM-DD`), a short title and a plain-language summary
of what changed for the player. `python build_web.py --assemble` (and so the next
deploy) includes the entry in the footer changelog on both the landing screen and the
dashboard.
Entries appear newest first and link to their PR; reading them does not require
GitHub access.

## Deployment baseline

`python build_web.py --assemble` also writes `web/version.json` with the same content
fingerprint embedded in the page and the latest changelog entry. Deploy the whole
`web/` directory together, which `npm run deploy` does. Rebuilding identical inputs keeps the same version;
shell, Python, map and changelog changes update it.

Open browser tabs check this small, uncached file once a minute while visible,
and on return to the tab or reconnection. A different version shows a compact
top banner with Reload and Dismiss. The latest changelog title expands to its
summary only when it is new or changed relative to the loaded page. Dismissal
lasts for that version in that tab (with an in-memory fallback if storage is
blocked); a later version can notify again. Reload is always manual and uses
the existing save restoration flow. Single-file imports may need selecting
again. Existing tabs from before this feature need one manual reload first.

Deploy with `npm run deploy` from an up-to-date main checkout (`tools/deploy.mjs`); it
also accepts a branch that contains origin/main. It refuses a working tree with any
modified, staged or untracked file, runs `git fetch origin`
and stops unless `git merge-base --is-ancestor origin/main HEAD` passes, runs
`python build_web.py --assemble` and stops if that changed a committed file, runs
`python build_web.py --check`, minifies the generated page's inline JavaScript
through `tools/optimize_web.mjs`, and then runs `wrangler deploy --config wrangler.jsonc`.
The transform uses the existing esbuild dependency, preserves shared global names
and escapes inline script terminators; blocks with HTML comment openers keep their
original escaping. Its source and esbuild’s lock entry in `package-lock.json` are
build stamp inputs. Python assembly stays independent of Node: `--assemble` restores the
readable output, which is what `--check` compares. Run `node tools/optimize_web.mjs`
after assembly to preview the deployment artifact locally; assemble again before
running tests or `--check`. `npm run test:optimized` manages this sequence and
runs the same optimized hosted-page checks as CI.
`tests/csp.test.cjs` serves the optimized page with real Pyodide,
map, guide and game-link loading, and `tests/optimize_web.test.cjs` guards script
boundaries and shared globals.
Arguments after `--` go to wrangler: `npm run deploy -- --dry-run` does everything but the
upload. Never deploy with a bare `npx wrangler deploy`: the code-derived files under `web/`
are not committed, so without the assemble step it publishes whatever an earlier
assemble left there, or nothing. Check the previous release for changes that have
not reached main yet, and preserve them too. A passing suite on an older feature
branch does not establish that newer live features are preserved.

Verify the generated page on the live domain after deployment, including the
map's layer chips, rented homes and interactive ball, plus the feature being
released. The map code is embedded in `index.html`, so checking the standalone
`map.js` file alone is insufficient.

Run `node --test tests/release.test.cjs` before deploying, after `python build_web.py --assemble`; set `RELEASE_URL` to
`https://bigcopilot.com/` and run it again afterwards. It checks the generated
page's map controls, ball interaction and persistent feature badges together.

## New feature badges

New user-facing features get a small `New` badge on their navigation link or
entry button until the player first opens them. Reuse the shared
`featureDiscovery` helper in `template/board.html`; keep a stable feature ID across
releases so routine updates do not reannounce an already visited feature.

For a top-level page, add `newFeature: "your-feature-id"` to its `PAGES` entry;
navigation renders the badge and records the visit automatically, including
direct links and restored pages. For other entry buttons, add
`<span class="feature-new" data-new-feature="your-feature-id" hidden>New</span>`
and call `featureDiscovery.visit('your-feature-id')` after opening the feature.
Call `featureDiscovery.refresh()` after inserting badges dynamically. Reuse the
same ID on all entry points so their badges disappear together.

Visits are stored per browser under `ba_dash_feature_seen:<id>`, independently
of the loaded save. If storage is unavailable, dismissal lasts for the current
page session. Map and Changelog are the first examples; new changelog entries
do not reset the Changelog feature badge. Assemble with `python build_web.py --assemble` to see them.

## Map assets

`python export_map.py --geometry PATH/geometry.json --recipe PATH/recipe.json`
exports `web/maps/locations.json` and `map-background.svg` against the approved
`web/maps/full-map.svg`. Use the corresponding canonical snapshot and recipe;
never hand-trace or independently edit the overlay coordinates. The exporter reads
the SVG's actual panel clip rectangles, checks matching aspect ratios and address
coverage, and records source/background hashes. It moves poster district labels
into screen-sized overlay text so they cannot obscure buildings when zoomed in.
The original PNG/SVG remain unchanged. All snapshot paths are explicit inputs;
no player save or installed-game access is required for this export.

Run `python build_web.py --assemble` after map UI or asset changes. Browser and local watch
views load the same runtime assets lazily; standalone HTML embeds them so opening
it through `file://` works. A standalone file is therefore larger than the browser
shell. The watch server allowlists the three runtime asset routes.
The decoded background and a 3600-pixel bitmap are shared by both viewers.
Dragging and zooming use the bitmap with animation-frame updates; after movement
settles, the original SVG returns for sharp detail. Filters only update overlays.

### Floor plans

The finder shows each building's layout: its size code plus its version ("C2"),
which is how the game picks the interior. Both steps are owner-side and need the
installed game and UnityPy
(`py -m pip install --target <scratch folder outside the repo> UnityPy`, then put
that folder on `PYTHONPATH`):

1. `python make_buildings.py --versions` writes each building's version into
   `ba_buildings.json` as `v`, from the game's buildings bundle. It stops if the
   game and the table disagree on a building's type or size.
2. `python make_floor_plans.py` draws one plan for each layout the retail, office
   and warehouse buildings use (21 at build 3680; an office C1, C2 or D2 is the
   same shell as a shop's) into `web/maps/floor-plans.json`, about 55 KB.

Rerun both after a game update that adds a building or a layout, then
`python build_web.py`, which refuses a plan set that misses a layout the table
uses. The plans are shown as the game stores them, not turned to the street.

Map regressions: `node --test tests/map.test.cjs` and
`python -m unittest discover -s tests -p test_map_assets.py`. Use the browser channel
setting above if Playwright's bundled Chromium is absent. The separate private
map-pipeline tests need the map development environment and its geometry libraries.
