# Contributing

For setup, see the [README](../README.md). File paths below are relative to the repository root.

## Files

| File | What it does |
| --- | --- |
| `ba_save.py` | Reads the `.hsg` format, being gzip around an Easy Save 3 binary stream. The format notes are in the module docstring. |
| `ba_dashboard.py` | Pulls the numbers out of a parsed save and renders the HTML. |
| `build_web.py` | Assembles `web/` from the same template the local server uses. Run `python build_web.py` after changing either Python file. |
| `web/` | The static site. `index.html` is generated; `app.js` and `worker.js` are kept by hand; `py/` holds the copies of the two Python files the worker fetches. |
| `web/map.js`, `web/map.css` | Shared map/overlay code, embedded by `render()` into browser and local output. |
| `web/maps/locations.json`, `web/maps/map-background.svg` | Generated address hit geometry and zoomable background. The approved poster exports remain unchanged. |
| `export_map.py` | Builds runtime assets from approved canonical geometry, its recipe and the poster SVG. Extraction snapshots are retained privately. |
| `check_saves.py` | Parses and extracts every save under the save root and prints a table, plus spot-checks of known numbers. Run `python check_saves.py [folder]`. |
| `wrangler.jsonc` | Assets-only Cloudflare Worker config. `npx wrangler deploy` publishes `web/`. |
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
while producing plausible wrong figures. If you touched `ba_save.py` or `ba_dashboard.py`,
run `python build_web.py` so the browser copies match.

Run `python -m unittest discover -s tests` for the portable planner regressions.
These require Node.js for the embedded JavaScript checks and do not need a save file.

The UI regressions also run in a real browser. Install the test-only dependencies
with `npm install --no-save --package-lock=false playwright` and
`npx playwright install chromium`, then run `node --test tests/*.test.cjs`.
Alternatively, set `PLAYWRIGHT_CHANNEL=msedge` or `chrome` to use an installed browser.
Set `BOARD_TARGET=web` to check the generated browser page after rebuilding it.
The layout fixtures are synthetic; no game or save is needed. They cover desktop
table sizing, crowded planner controls, keyboard access to downtime, and scrolling
inside tables on narrow screens.

Keep layout changes in the shared template in `ba_dashboard.py`: let section
controls wrap, let text cells grow and wrap while keeping amounts intact, and put
lengthy per-machine detail behind a disclosure. Do not reintroduce a fixed board
width or use an unbroken note to size a metric column. Issue #7's screenshots show
why both the shared layout and the displayed content need regression coverage.


## Changelog

For every merged PR, add one entry to `web/changelog.json` with its PR number,
merge date (`YYYY-MM-DD`), a short title and a plain-language summary of what
changed for the player. Include fixes and documentation changes; omit review
process details. Run `python build_web.py` to include the entry in the footer
changelog on both the landing screen and the dashboard. Entries appear newest
first and link to their PR; reading them does not require GitHub access.

## Deployment baseline

`python build_web.py` also generates `web/version.json` with the same content
fingerprint embedded in the page and the latest changelog entry. Deploy the whole
`web/` directory together. Rebuilding identical inputs keeps the same version;
shell, Python, map and changelog changes update it.

Open browser tabs check this small, uncached file once a minute while visible,
and on return to the tab or reconnection. A different version shows a compact
top banner with Reload and Dismiss. The latest changelog title expands to its
summary only when it is new or changed relative to the loaded page. Dismissal
lasts for that version in that tab (with an in-memory fallback if storage is
blocked); a later version can notify again. Reload is always manual and uses
the existing save restoration flow. Single-file imports may need selecting
again. Existing tabs from before this feature need one manual reload first.

Before deploying, run `git fetch origin` and
`git merge-base --is-ancestor origin/main HEAD` from the release checkout; stop
if the second command fails. Check the previous release for changes that have
not reached main yet, and preserve them too. Build and test that checkout, then
deploy with its explicit `--config` path. A passing suite on an older feature
branch does not establish that newer live features are preserved.

Verify the generated page on the live domain after deployment, including the
map's layer chips, rented homes and interactive ball, plus the feature being
released. The map code is embedded in `index.html`, so checking the standalone
`map.js` file alone is insufficient.

Run `node --test tests/release.test.cjs` before deploying; set `RELEASE_URL` to
`https://bigcopilot.com/` and run it again afterwards. It checks the generated
page's map controls, ball interaction and persistent feature badges together.

## New feature badges

New user-facing features get a small `New` badge on their navigation link or
entry button until the player first opens them. Reuse the shared
`featureDiscovery` helper in `ba_dashboard.py`; keep a stable feature ID across
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
do not reset the Changelog feature badge. Rebuild with `python build_web.py`.

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

Run `python build_web.py` after map UI or asset changes. Browser and local watch
views load the same runtime assets lazily; standalone HTML embeds them so opening
it through `file://` works. A standalone file is therefore larger than the browser
shell. The watch server allowlists the two runtime asset routes.
The decoded background and a 3600-pixel bitmap are shared by both viewers.
Dragging and zooming use the bitmap with animation-frame updates; after movement
settles, the original SVG returns for sharp detail. Filters only update overlays.

Map regressions: `node --test tests/map.test.cjs` and
`python -m unittest discover -s tests -p test_map_assets.py`. Use the browser channel
setting above if Playwright's bundled Chromium is absent. The separate private
map-pipeline tests need the map development environment and its geometry libraries.
