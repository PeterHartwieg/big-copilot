# Open a store, phase 2: handover (29 Sep 2026)

## Done
- Phase 1 (payback) and phase 2 (Expansion › Open a store, steps 1–4) on branch `break-even-core`, PR #175 (draft).
- Python: `# --- open a store` in `ba_dashboard.py` (after `_payback()`), payload key `openStore`. `_plan_initial()` goes through
  `_initial_customers()`, which sits before `_arrival_ceiling()` with the same name, signature and text as branch
  `arrival-ceiling` (df11550). `_arrival_ceiling()` itself is main's: when that branch merges, it takes its own version.
  A trial merge of df11550 gives one conflict, just before `def _arrival_ceiling(`: take that branch's side (drop
  this branch's copy of the helper); `tests.test_staffing` and `tests.test_open_store` pass on the result.
- Board: `drawOpenStore()` and the `os*` functions (section `/* --- Expansion › Open a store`), markup `#secOpen`,
  registrations (SUBS, AREAS, ROUTES, HOST_ROUTES, routeViewLabel, SEC_PAGE, PAGE_DRAWS, SS_VIEWS, wireAll), the New badge
  (`VIEW_NEW` in `paintLocal()`), the news strip (`BANNER`), the os- CSS from the canvas, the Demand cell popover (`demCellPop()`).
- `web/map.js`: the finder's plan mode (`options.plan`, `planFor()`, the card's Plan here).
- Office model (`osOfficeModel()`): clients from the building's capacity, computers staffed by the office default.
- Tests: `tests/test_open_store.py`, `tests/open_store.test.cjs`, `tests/finder_plan.test.cjs`; cell clicks in
  `tests/finder.test.cjs` and `tests/businesses_expansion.test.cjs` go through the popover. Snapshots updated.
- Docs: architecture (payload row, Growth views), ui-route-migration, dashboard-reference "Open a store", AGENTS.md; changelog
  entry for PR 175 describes phases 1 and 2.
- Validation: `python check_profit_model.py` (see dashboard-reference for the numbers).

## Review round 1 (29 Sep 2026)
- `make_store_rules.py`: `m` is a list of groups (one per placement requirement); `wt`, each gym machine's workout type
  from the prefab bundle's controllers; `vehicles`, motor vehicle prices. Boat prices are hard-coded (`BOAT_PRICES`, from
  `BoatTypes..cctor`).
- Outfit: one mount per group, from the station's own store where it sells one; copied shelving plus fallback displays for
  products it does not hold; a gym's five workout types; cinemas and theatres planned by size (`plan_layout()`).
- Model: first days ramp and first-seller hype (`osDayProfit()`, `osBreakDay()`, research RAMP.md); `_own_shops()` from
  the first day with sales; price reference from shops that stock the item, the player's included; cannibalisation on
  every product; borrowing limit with vehicles, boats and the tutorial floor.
- The fixture's loan sits at 1 Broadway Street, no bank, so both banks show 0 owed there while the total is 29,900; real
  saves' loans name the banks' addresses (checked).
- `check_profit_model.py`: headline on unmodded saves (`HARMLESS_MODS`) and stores open 14+ days; young stores against the
  ramp.

## Next
1. Phase 3: the checklist until opening (step 5) and its buttons (hire, uniforms, marketing after PR #174, logistics).
2. Phase 4: after opening, the plan attaches to the site at its address (step 6).
3. Wages from the staffing assistant's hour grid instead of the structural formula.

## Decisions
- Toilet + privacy demands: one toilet stall (it is a toilet and carries the privacy tag); a plain toilet beside it could fail privacy.
- Fallback displays: per product the type sells, enough of its cheapest display to cover building capacity.
- Items limited to those whose designer tags name the type (`bt`).
- Wages: the structural formula. Events (hype, backorder) left out of the steady state. Purchasing agent: best on staff, else 100.
- Model sells the full range (validation: primary-only gives median 1.07, ±15% 36%).
- Offices: initial = building capacity for every build (measured on every office in the saves); staffing = the office default;
  a cleaner every open hour. The validation runs own offices on their own staffing grid.
- The embedded finder shows only buildings to rent; Plan here shows on a vacant building of the plan's kind.
- UI text keys live under `gr.os.*` (the catalogue's areas are fixed; Expansion is `gr`).
- Inner cards are `div.os-card`, not `section`: `section{content-visibility:auto}` would skip their rendering off screen.
