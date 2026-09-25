# Supporting a new game build

What to check, change and rebuild when Big Ambitions ships a new build, so the board can
say it was checked against it. This is the game-update checklist that comments in
`ba_dashboard.py` refer to.

Status: current. Written from the build 3680 and 3682 bumps (commits c286408 and
92c3ef8, described at the end). The scripts live in `tools/game_update/`; its README has
one line per script. Run every command from the repository root.

## The short version

1. Find the build number and read the patch notes.
2. Hash the game's text files to see whether the help text changed.
3. Run the static checks: save fields, presets, building capacity, the game tables.
4. Rebuild against the new install and read what changed.
5. Load and save a game once in the new build, then run `check_saves.py` on that save.
6. Bump `VERIFIED_BUILD` and the README line, fix any pinned test, run the tests.

A bump that changes nothing else is a compatibility bump. It gets no changelog entry.

## 1. What changed

**The build number.** The game's own build number (3682, not Steam's build id) shows in
two places:

- The Steam news feed. Its titles name the build, for example "Big Ambitions Build 3682 -
  Hotfix". No login is needed:
  `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1331550&count=6&maxlength=0`.
  The patch notes are the `contents` field of each item. steamdb.info refuses scripted
  requests and the Steam announcements page fetches empty, so use the API.
- `Player.log`, once the game has been started after the update. On Windows it is
  `%USERPROFILE%\AppData\LocalLow\Hovgaard Games\Big Ambitions\Player.log`, and the line
  reads `Loaded Big Ambitions (Build 3682)`. The install itself has no readable version
  string.

Steam's own build id is in `steamapps/appmanifest_1331550.acf` (`"buildid"`). The wiki
build records the one it last read as `provenance.steam.buildId` in `web/wiki-data.json`.
A new Steam build id tells you the install changed, not which game build it is.

**Did the help text change?** Steam rewrites nearly every file on an update, so file dates
say nothing. Hash `en.json` and `helpstructure.json` instead, and compare with the hashes
the committed `web/wiki-data.json` recorded at the last rebuild:

```
python -c "import hashlib, json, os, ba_save; loc = ba_save.find_game_locale(); sa = os.path.dirname(os.path.dirname(loc)); prov = json.load(open('web/wiki-data.json', encoding='utf-8'))['provenance']['sources']; [print(name, hashlib.sha256(open(path, 'rb').read()).hexdigest() == prov[key]['sha256']) for name, key, path in (('en.json', 'locale', loc), ('helpstructure.json', 'helpStructure', os.path.join(sa, 'helpstructure.json')))]"
```

`False` means that file changed. Build 3680 and build 3682 both changed `en.json` only.

The game has to be detected for everything below. `python -c "import ba_save;
print(ba_save.find_game_locale())"` prints the `en.json` it found. If it prints `None`,
set `BA_LOCALE` to the install's `StreamingAssets/locale/en.json` (see the Environment
section of `AGENTS.md`).

## 2. Static checks

These need only the installed game and saves from the previous build, so they can run the
day the patch lands.

### Save fields

The save is the game's own objects, serialized by field name, so a renamed field breaks
the reader. Collect the field names the newest saves hold, then look each one up in the
new build's assemblies:

```
python tools/game_update/savekeys.py keys.json
powershell -File tools/game_update/dllfields.ps1 -KeysPath keys.json -OutPath fields.txt
```

Keep `keys.json` and `fields.txt` outside the repository, for example in a scratch folder.
`savekeys.py` reads the newest save of up to four character folders at `VERIFIED_BUILD` or
later. In `fields.txt`:

- `NOFIELD` is a field the save holds that the type no longer has: a rename or a removal.
  Find the new name in the assembly, then check whether `ba_save.py` or `ba_dashboard.py`
  reads the old one.
- `NOTYPE` and `NOASM` are a type or an assembly that moved.
- `NEWFIELD?` is a field no save holds yet. It is informational. The reader parses unknown
  fields, so a new one needs no change unless the board should read it. Build 3680 added
  `shouldUpdateDirtSpotsThatAffects`, a `Nullable<Boolean>`, which parsed without changes.

No `NOFIELD`, `NOTYPE` or `NOASM` line means the save shape the board reads is intact.

### Difficulty presets

The Easy, Normal and Hard presets are `DifficultySetting` assets in
`Big Ambitions_Data/sharedassets1.assets`. `HOUSE_RULES` in `ba_dashboard.py` holds
Normal's value for each setting, and `PRESETS` in `tests/test_house_rules.py` holds all
three.

```
python tools/game_update/presets.py
```

The real rows are the three in `sharedassets1.assets` with slots 1 to 3; the byte pattern
also matches some unrelated data. At builds 3675, 3680 and 3682 they read:

| | Money | Tax | Market | Salary | Interest | Rivals | Base customers | Wholesale urgent | Importer urgent | Export | Selling |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Easy (1) | 15000 | 2% | 0.7 | 0.5 | 0.7 | 0.7 | 0.75 | 0.1 | 0.5 | 0.8 | 0.8 |
| Normal (2) | 10000 | 5% | 0.7 | 0.7 | 0.7 | 1.0 | 0.55 | 0.2 | 0.75 | 0.65 | 0.75 |
| Hard (3) | 4200 | 30% | 1.3 | 1.0 | 1.3 | 1.2 | 0.5 | 0.3 | 1.0 | 0.5 | 0.5 |

If a value changed, update `HOUSE_RULES` (Normal) and `PRESETS` in the test. Older games
keep the values they started with, so the board always reads the settings off the save and
only uses these to say what is harder or easier than Normal. The save's `difficulty` field
is the game's `Difficulty` enum in `HGExtensions.dll`: 0 Custom, 1 Easy, 2 Normal, 3 Hard,
mirrored by `DIFFICULTY_SLOTS`. A new preset slot shows as "Unknown" until it is added
there.

A new custom-game slider shows up as a new `main_menu_custom_*` key in `en.json`, with a
`_tooltip` key beside it. `HOUSE_RULES` paraphrases those tooltips, so read a changed
tooltip against its row too. Build 3680 added the Resale value slider
(`main_menu_custom_game_selling_multiplier`) for the existing `sellingMultiplier` setting.

### Building capacity

The customer capacity each building size allows is parsed from the game's help page
`help_building_types_content` by `_door_caps()`. `FALLBACK_CAPS` is the same table, used
only when there is no game text at all. Check that the new help page still yields it:

```
python -c "from ba_save import Names, load_locale; from ba_dashboard import FALLBACK_CAPS, _door_caps; caps = _door_caps(Names(load_locale())); print(caps == FALLBACK_CAPS or caps)"
```

`True` means unchanged. Anything else prints the new table: update `FALLBACK_CAPS` and its
comment, and check `CAPS_HELP` in `tests/test_premises.py`, which is the page as build 3675
wrote it.

### The game tables

Three tables in `ba_dashboard.py` were read by hand from the game's Addressables bundles
under `Big Ambitions_Data/StreamingAssets/aa/StandaloneWindows64/`. No help page carries
them, and no test can see the game change them:

| Table | Bundle | Fields | What it decides |
| --- | --- | --- | --- |
| `DEMANDS_NOT_MADE` | `defaultlocalgroup_assets_businesstypes_*` | `businessTypeName`, `customerDemandSets[].type` | the amenity and uniform demands a retail type's customers never make, so the board does not warn about them |
| `STATION_SKILLS` | `defaultlocalgroup_assets_items_*` | `itemName`, `suitableSkills`, in order | which uniform a worker at each station owes |
| `JOB_DEMANDS` | `defaultlocalgroup_assets_jobdemands_*` | `demandName`, `priority`, `itemNames`, and the hour, day and minimum fields | the rules behind the unmet staff demand warnings |

The rules each `JOB_DEMANDS` kind repeats (`Fulfilled()` in
`Entities.Employee.JobDemands.Requirements`) are in `BigAmbitions.dll`, not in a bundle.

`tools/game_update/bundles.py` re-reads the three bundles and prints one line per
difference. It needs UnityPy, which is an owner-side dependency installed outside the
repository, the same way `make_demand_curves.py` asks for it:

```
py -m pip install --target <scratch folder outside this repo> UnityPy
set PYTHONPATH=<that folder>
python tools/game_update/bundles.py
```

It ends with a count, `0 difference(s)` when all three match. Its `note:` lines list
demands a type makes beyond the six the board models (seating, workout variety); they are
expected. It compares `JOB_DEMANDS` names, priorities and item lists only. When a demand
changes, read the rest of its fields (`betweenHours`, `shiftPeriod`, `daysWorkingPerWeek`,
`freeDays`, `minimumCleanlinessPercentage`, `minimumPlayerHappiness`,
`healthInsurancePlan`) by eye.

When a table changes, update it, the build number its comment cites, and its pinned test
(see [Pinned tests](#pinned-tests)).

The arrival curves in `ba_demand_curves.json` come from the same bundles. With UnityPy on
`PYTHONPATH`, run `python make_demand_curves.py` and then `git diff --stat
ba_demand_curves.json`. No diff means the curves did not change. If they did, the file is
the change: commit it and rebuild.

### Values measured from saves

A few numbers were fitted to real saves rather than read from a file, so a patch can move
them without any file saying so:

- the rent formula (`RENT_RATES`, `RENT_TRAFFIC_OFFSET`, `RENT_OFFICE_FACTOR`) and the
  deposit factors (`DEPOSIT_FACTORS`), fitted at build 3675. Check them in step 4.
- `OFFICE_POST_RATE`, one office customer per professional per hour, measured on a law
  firm at build 3680. Re-measure it only when the patch notes touch offices.

## 3. Rebuild against the new install

```
python build_web.py
python tools/game_update/textdiff.py
```

`build_web.py` needs the installed game, and refuses the bundled text. It regenerates
`web/py/gametext.json` and `web/wiki-data.json` from the new `en.json` and
`helpstructure.json`, then `web/index.html`, `web/version.json` and the `web/py/` copies.

A line diff of `web/wiki-data.json` runs to hundreds of lines for one changed fact.
`textdiff.py` compares both files with `HEAD` by key and by page instead, and prints the
first difference inside each. It leaves out what every rebuild changes: the per-guide
`SOURCES` and the Steam build id the guides quote. `0 change(s) outside provenance` means
the game text the board ships did not change.

Read each change:

- Most are content, such as a product sold in one more shop. They need nothing but the
  rebuild.
- A help page whose wording changed may no longer parse. `tools/build_wiki_data.py` and
  the parsers in `ba_dashboard.py` read the help text by its phrasing. In 3680 the fixture
  pages switched "Requires:" to "Must be placed on one of the following:", which
  `build_wiki_data.py` already read as a `mount`. The pinned tests below catch the
  parsers that feed the board; the wiki tests catch the rest.
- A new recipe, station or building size changes a pinned count.

`textdiff.py --rev A --to B` compares two commits, which is how the worked examples below
were read.

## 4. Check a real save

Load a game in the new build and save it once, or wait for an autosave. Loading alone only
migrates the save in memory; no `.hsg` at the new build exists until the game writes one.
Then:

```
python check_saves.py
```

It parses, extracts and renders every save under the save root (pass another folder as an
argument, `-v` for tracebacks), then spot-checks the newest save against its raw fields.
It writes nothing. The exit code is 1 if a save at or above `MIN_BUILD` failed or a
spot-check failed. The newest save must be one from the new build.

Then check the rent fit on that save:

```
python -c "from ba_save import Names, load_locale, load_save; from ba_dashboard import SAVE_ROOT, extract; from check_saves import find_saves; rent = extract(load_save(find_saves(SAVE_ROOT)[-1]), Names(load_locale()))['premises']['rent']; print(rent['check'], rent['deposit']['check'])"
```

This is the payload's `premises.rent.check`, which the Map page's location finder also
states under its rent estimate. `leases` is how many current leases the formula was
compared with and `worst` the largest relative miss (0.0097 is 0.97%). At build 3682 it
was under 1% off on every current lease, and under 2% on the deposits. A jump to several
percent means the patch rebalanced rents: refit `RENT_RATES` against current leases.

## 5. Bump the build

- `VERIFIED_BUILD` in `ba_dashboard.py`. It is the build the board says it was checked
  against. A save from a newer build shows a `BUILD N UNCHECKED` flag in the masthead, and
  a save that fails to extract says the game has probably changed its save format. The
  landing page footer states it as "Game build N", `check_saves.py` prints it, and the
  CLI prints "board checked on N".
- The README line `Checked against game build **N**.`
- Comments and docs that cite a build for something you re-read, where the fact still
  holds. For 3680 that was the `PRESETS` comment in `tests/test_house_rules.py`, then the
  `FALLBACK_CAPS` comment and the building capacity table in `docs/dashboard-reference.md`.
  Leave a comment that cites the build a fact was measured on (the rent fit at 3675) until
  it is measured again. The 3682 bump moved no comment at all, which is also fine.
- `MIN_BUILD` stays. It moves only when the board starts relying on a field older saves
  lack.
- No `web/changelog.json` entry. A compatibility bump is neither a feature nor a new
  capability; see the Changelog section of `docs/contributing.md`.

Then run `python build_web.py` again, because `VERIFIED_BUILD` is baked into the landing
page and `web/py/ba_dashboard.py`.

**The game link mod** is versioned apart from the board. Two places name the game build it
was checked on: `Made for game build N` in `mod/workshop/description.bbcode`, and the
heading `The game members it uses (build N)` in `mod/BigCopilotLink/README.md`, whose
table lists every game member the mod calls. Move them only after checking those members
still exist in the new build (by reflection, as in [Reading the game's code](#reading-the-games-code)),
or after rebuilding the mod. The mod is built only in the modding SDK's Unity project, and
a Workshop upload sets **Target Build** to the build it was built against; see the mod's
README. In the 3682 bump the board moved first; the mod's text followed with its next
release.

## Pinned tests

These tests pin counts or tables that a content change breaks on purpose, so a patch
cannot change them silently. When one fails after a rebuild, check the game first, then
update the table and the test together.

| Test | What it pins | Breaks when |
| --- | --- | --- |
| `tests/test_uniform_alerts.py` | `test_every_retail_type_was_checked_against_the_games_own_table`: the sixteen `RETAIL_TYPES` whose demands were read, and `DEMANDS_NOT_MADE` only naming them. `test_the_station_table_holds_every_station_the_game_has`: `len(STATION_SKILLS) == 33`. `test_only_the_desk_stations_list_more_than_one_skill`: `OFFICE_SKILLS` and its order | a retail type is added, or a station is added to the table |
| `tests/test_job_demands.py` | `test_every_demand_the_game_ships_has_a_known_kind_and_priority`: `len(JOB_DEMANDS) == 35` (the 35 `JobDemand` assets), and each kind and priority | a demand is added or removed |
| `tests/test_recipe_identity.py` | `test_bundled_catalogue_covers_the_pinned_identity_table`: `len(RECIPE_ITEMS) == 62`, and the same items as the recipes in the shipped `web/py/gametext.json` | the rebuilt game text gains or loses a recipe |
| `tests/test_stations.py` | `test_every_station_with_a_customer_capacity_is_in_the_shipped_table`: the 17 serving stations, each with its skill and rate, from the shipped game text | a station, its skill or its customer capacity changes in the help text |
| `tests/test_house_rules.py` | `PRESETS`, the three stock presets | a preset changes (only if you update `PRESETS` from `presets.py`) |
| `tests/test_premises.py` | `CAPS_HELP`, the building types help page as build 3675 wrote it, and `FALLBACK_CAPS` matching it | `FALLBACK_CAPS` changes |
| `tests/fold_views.test.cjs` | the fixture board's `meta.build` and `meta.verifiedBuild` (both 3682), and `FLAGS.build` (3683), one above, which draws the `BUILD N UNCHECKED` flag in the masthead layout tests | nothing in a bump: these are literals, not `VERIFIED_BUILD`. If you move the fixture to the new build, keep `FLAGS.build` above it |

`tests/search.test.cjs` and `tests/chart_hover.test.cjs` set the same 3682 literals in
their fixtures, and `tests/fixtures/r8_supply.json` still says 3680. None of them reads
`VERIFIED_BUILD`, so none needs to move.

## 6. Run the tests

A bump edits `ba_dashboard.py` and regenerates the wiki data, so run the extraction row
and the wiki row of "Finishing a change" in `AGENTS.md`:

```
python -m unittest discover -s tests
node --test --test-concurrency=2 tests/wiki*.test.cjs
python build_web.py
python build_web.py --check
```

If you changed something the board shows, such as a house rule's wording, also run
`node --test --test-concurrency=2 tests/*.test.cjs`. `--test-concurrency=2` keeps the
browser suites from saturating the machine.

Releasing is the usual deploy in the Deployment baseline section of
`docs/contributing.md`, including `tests/release.test.cjs` against the live domain.

## Reading the game's code

Some answers are only in the game's assemblies under `Big Ambitions_Data/Managed/`. With
no dotnet SDK, Windows PowerShell 5.1 can read them by reflection, as `dllfields.ps1` does:

- `[Reflection.Assembly]::LoadFrom("<Managed>\BigAmbitions.dll")`. `LoadFrom` finds the
  other assemblies in the same folder by itself. Do not add an `AssemblyResolve`
  scriptblock; it overflows the stack.
- `GetTypes()` throws `ReflectionTypeLoadException` on types that reference Unity
  assemblies it cannot load. Catch it and use the exception's `.Types`, skipping nulls.
- Enums, fields and method signatures come straight from the types. For a method's body,
  `GetMethodBody().GetILAsByteArray()` gives the IL, which you decode with a table built
  from `[Reflection.Emit.OpCodes]`.
- With `powershell -File`, an array parameter arrives as one comma-separated string.

The `Difficulty` enum is in `HGExtensions.dll`; almost everything else is in
`BigAmbitions.dll`.

## Worked examples

### Build 3680, "Patch 2" (commit c286408)

Steam build id 25343755. The patch notes ran to about 90 lines.

What the checks found:

- `en.json` changed, `helpstructure.json` did not.
- No save field was missing. The 3680 save gained `shouldUpdateDirtSpotsThatAffects`,
  which parsed without changes.
- Presets and building capacity were unchanged, and the rent fit held on current leases.
- The patch added a Resale value slider with its own tooltip.
- A 3680 save passed `check_saves.py`.

What the commit changed:

- `ba_dashboard.py`: `VERIFIED_BUILD` 3675 to 3680. The `HOUSE_RULES` comment no longer
  calls "Resale value" the board's own name, and the `sellingMultiplier` row now
  paraphrases the game's new tooltip.
- `README.md`: the build line.
- `tests/test_house_rules.py`: the `PRESETS` comment names builds 3675 and 3680.
- Rebuilt `web/py/gametext.json`, `web/wiki-data.json`, `web/index.html`,
  `web/py/ba_dashboard.py` and `web/version.json`. `textdiff.py --rev c286408~1 --to
  c286408` shows what the new text brought: the Gift Shop sells Noize Boss Earbuds,
  "Flatbed Spawner" became "Flatbed", four counter appliances say they mount on cabinets,
  and Global Harvest Traders sells plastic.

A follow-up commit, 4cc67f3, reworded the same Resale value note and moved the
`FALLBACK_CAPS` comment and the building capacity table in `docs/dashboard-reference.md`
to "builds 3675 and 3680". No changelog entry for either.

### Build 3682, hotfix (commit 92c3ef8)

Steam build id 25482473. Each step, and what it gives against the 3682 install:

1. The news feed title "Big Ambitions Build 3682 - Hotfix" and the `Player.log` line
   `Loaded Big Ambitions (Build 3682)` give the build.
2. The hashes: `en.json` changed, `helpstructure.json` did not.
3. `savekeys.py` and `dllfields.ps1`: no `NOFIELD`, `NOTYPE` or `NOASM`, only
   `NEWFIELD?` lines. `presets.py`: the table above, unchanged. The building capacity
   check prints `True`. `bundles.py` reports 0 differences, and `make_demand_curves.py`
   writes the committed `ba_demand_curves.json` byte for byte. (These two were added to
   the checklist after the bump; they come out clean on 3682.)
4. `python build_web.py`, then `textdiff.py --rev 92c3ef8~1 --to 92c3ef8`:
   `web/py/gametext.json` identical, and one wiki change, the Glass page listing Global
   Harvest Traders as an importer.
5. The game was loaded and saved once, and `check_saves.py` passed on the 3682 save. The
   rent check reads under 1% off.
6. `VERIFIED_BUILD` 3680 to 3682 in `ba_dashboard.py`, the README line to 3682, then
   `python build_web.py` again, then the tests.

The commit touched `README.md`, `ba_dashboard.py`, `web/index.html`,
`web/py/ba_dashboard.py`, `web/version.json` and `web/wiki-data.json`, nothing else. No
pinned test moved, no comment changed, and there was no changelog entry. The mod's
description and README moved to 3682 later, with the mod's own 0.2.0 release.
