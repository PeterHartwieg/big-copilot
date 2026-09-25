# Game update checks

Scripts for checking Big Copilot against a new Big Ambitions build. The runbook that
says when to run each one, and what to do with the result, is
[docs/game-update.md](../../docs/game-update.md). Run them from the repository root.
None of them writes to the repository, and nothing here has a test: run a script against
the installed game to check it. Give output files a path in a scratch folder outside the
repository, never the repository root.

- `savekeys.py <scratch>/keys.json [--root DIR] [--min-build N] [--saves N]`: lists every
  `$type` and field name in the newest save of up to four character folders at
  `VERIFIED_BUILD` or later, as JSON. The save root defaults to `SAVE_ROOT` in
  `ba_dashboard.py`. The JSON holds names only, but what it prints on the way names the
  character folders and save files, so never paste that output into an issue.
- `dllfields.ps1 -KeysPath <scratch>/keys.json -OutPath <scratch>/fields.txt [-ManagedDir DIR]`: checks those
  fields against the installed game's `Managed/*.dll` by reflection (Windows PowerShell
  5.1). `NOFIELD` lines are renamed or removed save fields. The folder defaults to the one
  beside `BA_LOCALE`'s en.json; without `BA_LOCALE` it tries only the default Steam library.
- `presets.py [--data-dir DIR]`: prints the Easy, Normal and Hard difficulty presets from
  `sharedassets1.assets`, for `HOUSE_RULES` and `tests/test_house_rules.py`.
- `caps.py`: checks that the installed game's building types help page (never the
  bundled copy) still parses into the building capacity table. It prints the row counts
  and the page's other bold lines, and exits non-zero with a message when the game or the
  page is missing, a category yields no rows, or the table differs from `FALLBACK_CAPS`.
- `bundles.py`: compares `DEMANDS_NOT_MADE`, `STATION_SKILLS` and `JOB_DEMANDS` with the
  game's Addressables bundles, and reports any business type the board does not know.
  Needs UnityPy on `PYTHONPATH`, as `make_demand_curves.py` does:
  `python -m pip install --target <scratch> UnityPy`, then `$env:PYTHONPATH = '<scratch>'`
  in PowerShell or `export PYTHONPATH=<scratch>` in bash.
- `textdiff.py [--rev REV] [--to REV]`: after `python build_web.py`, lists what changed in
  `web/py/gametext.json` and `web/wiki-data.json` by key and page, not by line.

`presets.py`, `caps.py` and `bundles.py` find the game the way the board does:
`BA_LOCALE`, then `ba_save.find_game_locale()`.
