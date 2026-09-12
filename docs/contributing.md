# Contributing

For setup, see the [README](../README.md). File paths below are relative to the repository root.

## Files

| File | What it does |
| --- | --- |
| `ba_save.py` | Reads the `.hsg` format, being gzip around an Easy Save 3 binary stream. The format notes are in the module docstring. |
| `ba_dashboard.py` | Pulls the numbers out of a parsed save and renders the HTML. |
| `build_web.py` | Assembles `web/` from the same template the local server uses. Run `python build_web.py` after changing either Python file. |
| `web/` | The static site. `index.html` is generated; `app.js` and `worker.js` are kept by hand; `py/` holds the copies of the two Python files the worker fetches. |
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
