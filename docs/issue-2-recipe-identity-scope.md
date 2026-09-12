# Issue #2: name factory lines immediately

Smaller design implemented locally, 12 September 2026. In-game verification is still required before release.

## The change

A 62-entry `RECIPE_ITEMS` dictionary in `ba_dashboard.py` maps `selectedRecipeId` to product ID. It names factory lines before their first delivery.

**Keep all existing rates, ingredients and calculations.** The table only identifies the product. Game text still supplies its name and recipe quantities.

## Verify first

The [Companion table](https://github.com/tiagovitorin/BigAmbitionsCompanion/blob/5db2e6a07145db9b19239efddc63c101be7346d6/data/normalized/recipes.json) contains all 30 recipe IDs in the day-190 save. Its extractor preserves game IDs, but the published data has no extraction build number. Coverage does not prove the names are right.

These mappings remain **unverified in-game**:

| Recipe ID | Table says | Current board says |
| --- | --- | --- |
| `XMndnWD5o0SgWbgdUecVw==` | Martini | Whisky |
| `6FwXLAY4S0qEWikfkkX5iQ==` | Whisky | Martini |
| `buvcJRWqukKvDtwZVXyR6g==` | Headphones | Smartwatch 2 |
| `mFpiOPcgFUKtjFu2TYBUCg==` | Smartwatch 2 | Smartphone 2 (paired guess) |

There are also paired disagreements involving other electronics and Cigar/Cigarette. Board guesses cannot verify the table.

**Easiest check:** use a disposable copy of the company. Save, explicitly change one machine's recipe in-game, then save again. Compare the same machine's ID across the two saves to see which recipe token changed. Repeat for the disputed products. This avoids matching list positions or waiting for deliveries.

The local implementation uses this pinned table for review; no deployment has been made. Verify these mappings before release. If reliable checks show it is wrong, drop this source.

## Implemented rules

- Usable table identity → table name. Otherwise → compatible saved hand name, then the existing picker. Missing recipe text or a workstation mismatch makes a table identity unusable.
- Automatic delivery-based guessing and learned-name lookup are removed.
- Old history and browser-local names are preserved. They cannot override a usable table identity.
- Existing recipe help text remains required. No new names-without-quantities mode.
- Inputs use the existing calculations, even before deliveries. Missing warehouse routes stay explicit.
- A simple “Recipe table” label explains the source; no migration or notification system.
- Known IDs continue working on newer builds under the existing unchecked-build notice. Unknown IDs need a manual choice until the dictionary is updated.

## Implementation

One dictionary and a small resolver in `ba_dashboard.py`, plus updates to factory rows and manual naming. No generator, JSON loader, extra worker fetch, or new build policy. The existing web build automatically copies and stamps the Python module.

The pinned source is linked above; Companion's README says MIT, but its repository has no LICENSE file. Updating the table means reviewing the source changes, verifying changed mappings, editing the dictionary and rebuilding the web copy.

## Done when

- The disputed identities have independent in-game evidence.
- A new line is named and its inputs appear before any delivery.
- Existing quantities remain unchanged; shared inputs and machines count once.
- Old names cannot override a usable table identity; unresolved IDs use manual naming. With no recipe help text available, existing behavior is retained.
- Desktop and browser agree, including after a table update.
- Relevant tests and `check_saves.py` pass. Post-change save check: 25 supported saves passed, 40 skipped, zero failures.

README/Mac work and product-grouped shipments are excluded. Table quantities and the discovered lowercase-`x` ingredient-parser bug are separate work.

Local validation after review fixes: 27 Python tests, 15 Node logic tests, 12 browser/layout and resume tests passed; all 7 generated web layout tests also passed. Regressions cover manual recovery from unusable table entries, combined machine-count labels and unique producing-site labels. The earlier real Pyodide worker check matched desktop factory data exactly on the day-190 save (46 machines, zero unnamed). These check code behavior, not the in-game mapping evidence.
