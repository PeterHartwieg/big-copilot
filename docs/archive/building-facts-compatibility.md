# Building facts from the player's game

Investigation and implementation, 4 October 2026. Implemented in the isolated
`codex/mod-building-compatibility` worktree, based on `origin/main` at `626aa761`.
The sections below preserve the investigation and design rationale. Runtime capture
still requires compilation and verification in the Unity SDK on Peter's Mac.

The implementation adds `ba_facts.py`, a shared per-save resolver, RCR3/4/5 save
decoding, schema 2 Game Link capture, paired `.bcsave` import/export, and campaign
prediction checks on dry run and apply. The CLI, browser worker and deferred sections
use the same resolver. Changes in the resolved values invalidate staffing evidence.
Store-planning outfits and arrival estimates can differ between two buildings with
the same layout; unknown geometry has no substituted floor plan.

Validation: the full Python run completed 1,895 tests with one skipped. A subsequent
parser change preserving ordinary gzip diagnostics passed the focused facts, browser
build, registry and ES3 tests. The full Node run exposed stale expectations and
Windows-only test harness issues; affected suites were rerun after corrections.
The optimized hosted-page smoke test and `python build_web.py --check` pass.
Peter will have the reporter verify actual Alcware compatibility. Local acceptance
focuses on the existing setup without renovation mods; the new C# collector has not
been built or run here.

Local vanilla regression check, 4 October 2026:

- Compared three local saves from two characters against the pre-change source at
  `626aa761`, using the installed build 3682 game text. Their full extracted payloads
  are identical, apart from the deliberately excluded generation timestamp. All
  building values still equal the baseline catalogue, and no campaign plan becomes
  unavailable. Repeated with copies of the existing dashboard history: identical.
- Uploaded the latest save through the real locally served web build, running its
  actual Pyodide worker in Edge. Business results and every deferred section match
  the old extraction with the same bundled text and history settings. The site panel
  opens, ordinary saves keep snapshot export hidden, and there are no script errors.
- Opened the generated local dashboard in Edge: business results match and there
  are no script errors. Source saves and existing history were only read; all test
  outputs and history copies remain outside the repository in private scratch space.
- The game and Link were not running. This validates save-based local/browser use,
  not the new collector inside the game; SDK build/runtime validation remains separate.

Release note: `web/changelog.json`, PR #282. Live facts and portable snapshots
require Game Link 0.5; deploying the dashboard does not publish its Workshop binary.

## Finding

The renovation report is credible. The current campaign optimizer uses the original
address's floor area, while the game uses the current layout's floor area. Several
other consumers also use the original address catalogue. Correcting a displayed
capacity alone will not correct campaign recommendations.

Recommend a shared, per-save building-facts resolver, supplied with runtime facts
from Big Copilot Link and with explicit fallbacks for uploaded saves. This is a
medium change across extraction, Game Link and its clients, rather than a change
to every calculation or a redesign of the board. Supporting an arbitrary mod's
private persistence format without running the game is not possible generically.

## Evidence inspected

- [Alcware - Retail Expansion, Workshop item 3801675050](https://steamcommunity.com/workshop/filedetails/?id=3801675050).
  Downloaded successfully through the signed-in Steam client's
  `workshop_download_item 1331550 3801675050` command. Anonymous SteamCMD failed.
  Package changelog identifies version 0.9.2. The mod was not executed in the game.
- `RetailCapacityUpgrades.dll`, 158,720 bytes, SHA-256
  `29a06ba1b520204e81c2bddcc299975330152640314efd930c13e7027e6da6c4`.
- Installed game's `BigAmbitions.dll`, Steam build ID `25482473` (the build 3682
  install identified in `docs/game-update.md`). Inspected managed metadata and IL
  without executing either assembly.
- Current Python extraction, marketing optimizer, deferred sections, and the Link
  marketing-write predictor. Ran the existing optimizer with synthetic inputs.

The downloaded DLL and IL dumps are local research material outside the repository:
`C:/Users/Peter/.codex/tmp/big-copilot-mod-compat/`. No real save was inspected or
added to the repository. A renovated save and an SDK-built Link still need an
in-game check before this can be called verified compatibility.

### How Alcware persists renovations

`LayoutExperiment.PersistState` writes a string under
`GameInstance.modData["RetailCapacityUpgrades.renovations.v2"]`. Current output
starts with `RCR5:` and contains base64-encoded .NET BinaryWriter data. The current
reader also accepts RCR3, RCR4 and a legacy JSON representation. It removes the old
`RetailCapacityUpgrades.layoutExperiment.v1` key when persisting current state.

Records contain street and number, original/target size and version, original/target
area, original finishes and original rent. The string values for size are game
identifiers, not a capacity number. A decoder alone therefore still needs the
appropriate layout definitions to obtain capacity and simulation floor area.

`ApplyFields` changes the runtime `Building.BuildingSize`, `BuildingVersion` and
`totalSqm`. Crucially, `ApplyRenovationFields` sets `targetArea` to `originalArea`
and passes that original area to `ApplyFields`. The mod changes the layout while
preserving the building's recorded `totalSqm`. Treating `targetArea` as the
renovated simulation area would introduce another bug.

`Recalculate` calls `BusinessHelper.UpdateCustomerCapacity` for an established
player business. The ordinary save can therefore already contain an updated
effective business capacity. This does not establish that the reported user's
save does contain it; refresh timing and equipment still need checking.

### Three different numbers

| Meaning | Game source | Consequence |
| --- | --- | --- |
| Layout/building maximum | `Building.GetCustomerCapacity`, through `BuildingSizeData.GetCustomerCapacity(type, version)` | Must preserve exact layout version; cinema/theatre variants can differ. |
| Effective business capacity | `BuildingRegistration.customerCapacity` | `BusinessHelper.UpdateCustomerCapacity` takes the minimum of the layout maximum and applicable item capacities. It is not necessarily the building maximum. |
| Simulation floor area | `BuildingSizeHelper.GetData(building.BuildingSize).squareMeters` | Marketing uses this; `BuildingHelper.GetBuildingSquareMeters` also reads size data rather than `Building.totalSqm`. |

Do not overwrite the layout maximum with the effective business capacity, or infer
the simulation area from either capacity. Preserve `totalSqm` separately where a
property/rent calculation needs it.

### Marketing reproduction

`BuildingRegistration.GetMarketingEfficiency` calculates campaign reach divided
by the current layout's `squareMeters`, with the building-type multiplier.
`BusinessHelper.UpdatePromotion` then applies the neighbourhood's marketing
strength. The current board implements both operations correctly, but `_marketing`
gets `sqm` from the original `ba_buildings.json` row. Campaign reach/prices,
building-type multipliers and neighbourhood strengths are also bundled constants.

Synthetic example using current `marketing_plan` and `marketing_score`: retail,
50 foot traffic, Industry City (marketing strength 1), all campaign types available,
and SmallInternet initially running.

| Area supplied to optimizer | Selected campaigns | Daily cost | Predicted promotion |
| --- | --- | --- | --- |
| 75 m² | MediumInternet | $250 | 100 |
| 225 m² | SmallInternet + SmallBillboard | $600 | 100 |

Taking the 75 m² recommendation to the 225 m² premises gives marketing 18 and
promotion **68**, not 100. This demonstrates the mechanism, not the exact settings
of the user's store.

The older local checkout lacked this optimizer. Its promotion panel also rebuilt
the total incorrectly. Current `template/board.js` already prefers the saved
`b.promotion`, so that older panel issue is not a proposed fix here.

## Proposed design

### Resolve facts once for each build

Create a building-facts index keyed by the existing street-slug/number address,
owned by `Build` and shared between its core and deferred sections. Do not mutate
the process-global `load_buildings()` cache: Pyodide can load another character or
an earlier save in the same process.

Keep distinct fields for:

- Building type, neighbourhood, exact layout size and version.
- Simulation area, recorded property area, layout maximum, effective business capacity.
- Traffic and current actual rent, with estimated rent/deposit kept separately.
- Saved promotion/marketing observations and the inputs to the prediction model.
- Source and validity of each field, with a revision for calculations dependent on it.

Priority is field-specific: verified facts associated with this snapshot; an
authoritative ordinary saved value for that same meaning; a supported mod-data
adapter; then the bundled catalogue as a baseline. A saved effective capacity is
never a fallback for a missing layout maximum. Resolve dependent groups together:
do not combine an overridden layout with the old layout's area as if verified.

Use this index in `_business`/`_marketing`, `_premises`, `_cinema_capacity`,
`_plan_site`, payback and the store planner. Audit every `load_buildings()` and
`_size_cap()` consumer rather than fixing only the business card. Unknown layouts
must not display an original floor plan as the current interior. Map geometry can
remain static for existing addresses; new addresses require separate placement data.

The current `_initial_customers` already follows `buildNumberAtStart`: modern
games use the layout maximum, older games use product ratios and area. Feed it
resolved facts while preserving that distinction.

### Export runtime facts through Game Link

Add an optional, versioned facts capability. Read Unity objects on the main thread
after city/mod initialization. Export values through the game's accessors where
available, including the effective layout maximum and simulation area; do not use
an Alcware-specific branch in Link. Changes to those values by another mod or a
game update will then be observed through the same path.

Export marketing rules as well: campaign identifiers, reach and daily prices,
building-type reach multiplier, neighbourhood strength and agency offerings.
Otherwise renovated area would work but a mod changing campaign reach would still
produce incorrect advice. Existing `MarketingWrite.Predict` already reads live
size/settings and is a useful reference, but it still reproduces the formula.

Proposed transport: an immutable facts object published with the same Link
`Snapshot` as the save bytes, exposed by an additive endpoint such as
`GET /facts?stamp=<opaque stamp>`. Both web and CLI fetchers must verify the stamp,
city identity and schema before using it. Reject an unavailable/mismatched stamp;
never silently return facts for the latest save in response to an older request.
Older Link versions continue through the baseline path.

Publishing together prevents cross-refresh pairing but does not make the current
background save walk atomic. Capture metadata at the start of the refresh, check
the relevant layout/rules revision before publication, and retry when it changes.
Validate this strategy in Unity before claiming exact consistency. In particular,
do not serve a renovated layout with pre-renovation capacities or campaign state.

Pass facts explicitly into the browser worker and CLI build context. Section
caches, restore/resume caches and learned staffing history must incorporate the
facts revision. Do not silently reuse a pre-renovation learned demand model.

### Uploaded saves

An unknown mod can keep essential state only in memory or in private data that
the ordinary save does not describe. Reading the .hsg alone cannot universally
recover it. Use the same facts schema for offline support, not another model.

Recommended first portable path: export the Link save and facts together, with a
hash binding facts to the exact save bytes. Upload/folder/CLI paths can then import
that pair. Reusing yesterday's facts for a newer file must fail validation.

Embedding a namespaced facts snapshot in `modData` would make ordinary future saves
self-contained, but requires a separately verified save lifecycle: refresh before
serialization, handle mod load order and removal, and detect snapshots left stale
after Link is disabled. The existing Link watches save-completed edges; it does
not yet provide that guarantee. Do not make this the first implementation shortcut.

For existing Alcware-only saves, a small versioned adapter can decode its records
into the shared resolver. Use target layout identity plus validated layout data,
not `targetArea`, to derive simulation area. Mark that as reconstructed, reject
unsupported versions and keep all adapter code outside consumers. It covers this
mod's known persistence, not arbitrary mods; do not require one adapter per mod for
live support.

### Detect unsupported models

Before advertising a campaign plan, compare `marketing_plan().modelNow` against
the saved marketing and total for the current enabled campaigns. `_marketing`
currently does not use that check. A mismatch means the planner cannot reproduce
the current game: show the observations, explain the unavailable calculation, and
withhold its optimization/apply path until fresh compatible facts are available.

A match is not proof of full compatibility: rounding and the 100% cap can hide
wrong inputs. Do not reverse-engineer an exact area from a rounded/capped percentage.
Validate Link dry-run promotion/cost against the advertised proposal and require a
new plan when relevant facts change before apply. The current dry run reads live
settings but does not itself choose a new optimal campaign mix.

This supports mods and updates changing the exposed values. Arbitrary patches to
simulation algorithms, novel campaign behavior or inaccessible custom layouts still
need model support. Version the calculation model/capabilities separately from the
transport, report unsupported parts, and retain the game-build verification process.

## Suggested delivery slices

1. **Shared resolver and regression examples.** Preserve vanilla outputs; separate
   layout maximum from effective capacity; route existing consumers through the
   resolver. Add the marketing mismatch check. Synthetic fixtures only.
2. **Generic live facts.** Link capture/endpoint, mock, web and CLI transport,
   worker/build context, runtime marketing rules, refresh/revision validation.
   Verify in the Unity SDK and a test city with and without Alcware.
3. **Portable and existing-save support.** Export/import paired snapshots; add the
   Alcware adapter if supporting already-renovated uploads immediately is required.
4. **Further game rules.** Extend the same schema to station rates, demand curves
   or additional modded values as needed; do not imply the first slice supports
   every possible simulation modification.

Validate restored originals, two characters with different renovations at the same
address, same-size cinema/theatre versions with different maxima, missing/zero/
unsupported capacities, custom campaign values, mismatched or stale facts, unknown
layouts, older Link versions and old/new `buildNumberAtStart` branches. Compare the
same synthetic save/facts through web, CLI and Link; check deferred sections and
learned-history invalidation. Run the relevant AGENTS.md checks and rebuild generated
files. The C# implementation must be built and exercised in the Unity SDK on Peter's
Mac; it cannot be validated by building this repository alone.
