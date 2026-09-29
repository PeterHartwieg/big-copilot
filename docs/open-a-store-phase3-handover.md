# Open a store, phase 3: the checklist until opening

Branch `open-store-phase3`, off `break-even-core`. Step 5 of Expansion › Open a store, from
artboard 6 of the canvas. Step 6 (payback after opening) is still the phase 4 placeholder.

## What is built

- **Step 5, "Until opening"**, enabled once a plan has a building. `Open` stays disabled
  with the tooltip `gr.os.step.payback`.
- **Seven rows**: Lease, Furniture, Staff for the opening hours, Uniforms, Customer demands,
  Marketing, Logistics (`osUntilRows()`, `osCk*()` in the board script). Before the save
  shows a business at the plan's address every row is a to-do; after that each row ticks from
  the save. A header shows "n of 7", a progress bar, "Game linked / Save file · game not
  linked" and the save's day and time.
- **Buttons** (`osAct`): Hire N (`hrReview({only})`, the Staff page's dialog told the roles
  and counts the plan needs), Assign uniforms (`gwUniforms`), Set up marketing
  (`osMarketingWrite`, its own `gwConfirm`), Plan a factory (routes to `expansion/factory`).
- **No link, or a write missing from the link's `writes`**: the button becomes a dashed
  in-game instruction box (`os-ingame`). Without a link a foot strip (`os-gate`) says "Link
  the game and these become buttons." with **How to link**. With a link and one write
  missing only that row's box appears and there is no strip.
- **Extraction** (Python, done in the earlier commits): `openStore.built[siteKey] =
  {placed, req: [[name, need, have], ...]}` from the save (`required_placed`,
  `_placed_items`, `_opened_stores`); tests in `tests/test_open_store.py`; the payload
  snapshots and the `docs/architecture.md` row are updated.

## Decisions

- Lease is done when any `D.businesses` record has the plan's key. "Opened" (rows tick from
  the save) means that record's status is not `vacant`.
- Staff comes from `hrModel().sites` (hires per skill); Uniforms is done when the type asks
  for none; Customer demands combine `amenities` / `missingAmenities` with the uniforms row;
  Marketing is running when `marketingIndex > 0` or `marketing > 0`; Logistics counts a
  supply fact of status `noplan` / `paused` as unplanned.
- The marketing write is built against PR #174's contract (`POST /write/marketing`, body
  `{dryRun, expect, sites: [{address, on, was: []}]}`); it carries its own `expect` because
  `SOURCE.write` adds one only for `uniforms`. Its refusals `no_promotion`, `no_agency`,
  `no_contact` and `agency_closed` have `nav.dlg.refuse.*` texts.
- **How to link** opens the footer's game-link page (`a[data-visit-feature="game-link"]`) in
  a new tab.
- Vocabulary follows AGENTS.md: staffing and hours, named stations, no "roster/shift/post".
- Changelog: no new entry. Open a store is one feature and its entry (PR #175) already
  exists; phase 3 completes it.

## Open items

- The in-game paths in the instruction boxes ("MyEmployees on your phone", "BizMan ›
  address › Uniforms", "BizMan › Marketing") are placeholders and need a check in the game.
- This branch's mock (`tools/game_link_mock.py`) has no `marketing` write, so the tests stub
  `SOURCE.link` and `SOURCE.write`. The marketing write has not run against the real mod.
- Merging with PR #174 will likely conflict textually in `GW_REFUSE`, `GW_FIXABLE` and
  `GW_P` (I added `no_contact` and `agency_closed`, the `marketing` refusals and a
  `megaphone` glyph). Keep both sides' entries; the keys should not clash.
- "missing A shelf holding a product it sells": the required-item name keeps its capital.
- Wages still use the structural formula (phase 2 follow-up 3).

## How to verify

```
python -m unittest tests.test_open_store tests.test_doc_registries
node --test --test-concurrency=2 tests/open_store.test.cjs tests/finder_plan.test.cjs tests/navigation.test.cjs
python -m unittest discover -s tests -p "test_i18n*.py"
node --test tests/i18n_*.test.cjs
python build_web.py && python build_web.py --check
python check_saves.py
```

`tests/open_store.test.cjs` (last nine tests) covers the step bar, the to-do rows, the
ticking from a pushed business, a half-done store, link off, link on, a write missing, the
marketing dialog's wire body and refusal, and a running campaign.
`check_saves.py`: 32 supported saves OK, 0 failed.
