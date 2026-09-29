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
- Rule: a row never reads done unless the save proves it; otherwise it is a to-do with
  "check in the game". The seven rows are to-dos until a business of the planned type stands
  at the address (`osOpenedAt`); a business of another type gets a note (`osOtherType`).
- Staff (`osCkStaff`) reads `hrModel().sites`. No hours (`site.noHours` or no variant) is a
  to-do. With nothing to hire it is done only when somebody is hired and, on a demand plan,
  the shop has sales. Hire weeks that move people offer "Hire n · move m" (the full review
  for this site, `hrReview({site})`); with no candidate the row points at a headhunter.
- Uniforms: done when the type asks for none, or staff have station hours
  (`stationShifts > 0`) and no uniform gap. Customer demands cover every demand of the type:
  seating from `built.seating`, workout variety and unknown demands stay unchecked (an
  in-game check, never done).
- Marketing is done when `marketingOn` (the enabled campaigns) is not empty. The write sends
  that set as `was` (PR #174's compare-and-set) and omits `expect` without a character and
  company.
- Logistics: an office is done ("No deliveries needed"). A shop is set up when every product
  in its lines that the type sells (products the type lists, not services) has a route
  (`osRoutes`: a logistics link to the site, or a `supply.shops` delivery). This compares the
  shop's own lines, not the full product list, so a product never put on a shelf is not asked for.
- Furniture: `required_placed` takes `cachedAvailableProducts`; a product requirement (a
  hairdresser's shelf with hair-care products) is met by availability or a display holding it.
- The marketing write is built against PR #174's contract (`POST /write/marketing`, body
  `{dryRun, expect, sites: [{address, on, was}]}`); it carries its own `expect` because
  `SOURCE.write` adds one only for `uniforms`. Its refusals `no_promotion`, `no_agency`,
  `no_contact` and `agency_closed` have `nav.dlg.refuse.*` texts.
- **How to link** opens the footer's game-link page (`a[data-visit-feature="game-link"]`) in
  a new tab; when that link is missing the strip says to find Big Copilot Link on the Steam
  Workshop (`osLinkHint`).
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

`tests/open_store.test.cjs` (step 5, 22 tests) covers the step bar, the to-do rows before
a business, ticking, a half-done store, zero-need and no-hours staff, the real `hrModel` over
the payload's `hiring.sites` (Hire count and the scoped review through `hrReview` and
`hrRequest`), Hire and Assign uniforms clicks, moves, headhunter, link off/on/missing write,
uniforms without shifts, seating and workout variety, office logistics, a different-type
business, and the marketing wire (`dryRun`, `was`, no `expect`) and a running campaign.
`check_saves.py`: 32 supported saves OK, 0 failed.
