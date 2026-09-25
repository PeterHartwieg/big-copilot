# Game update checks

Scripts for checking Big Copilot against a new Big Ambitions build. The runbook that
says when to run each one, and what to do with the result, is
[docs/game-update.md](../../docs/game-update.md). Run them from the repository root.
None of them writes to the repository.

- `savekeys.py OUT.json [--root DIR] [--min-build N] [--saves N]`: lists every `$type`
  and field name in the newest save of up to four character folders at `VERIFIED_BUILD`
  or later, as JSON. The save root defaults to `SAVE_ROOT` in `ba_dashboard.py`.
- `dllfields.ps1 -KeysPath OUT.json -OutPath FIELDS.txt [-ManagedDir DIR]`: checks those
  fields against the installed game's `Managed/*.dll` by reflection (Windows PowerShell
  5.1). `NOFIELD` lines are renamed or removed save fields. The folder defaults to the one
  beside `BA_LOCALE`'s en.json, else the usual Steam install.
- `presets.py [--data-dir DIR]`: prints the Easy, Normal and Hard difficulty presets from
  `sharedassets1.assets`, for `HOUSE_RULES` and `tests/test_house_rules.py`.
- `bundles.py`: compares `DEMANDS_NOT_MADE`, `STATION_SKILLS` and `JOB_DEMANDS` with the
  game's Addressables bundles. Needs UnityPy on `PYTHONPATH`, as `make_demand_curves.py`
  does.
- `textdiff.py [--rev REV] [--to REV]`: after `python build_web.py`, lists what changed in
  `web/py/gametext.json` and `web/wiki-data.json` by key and page, not by line.

`presets.py` and `bundles.py` find the game the way the board does: `BA_LOCALE`, then
`ba_save.find_game_locale()`.
