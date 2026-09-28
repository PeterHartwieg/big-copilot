# Open a store, phase 2: handover (WIP, 28 Sep 2026)

## Done
- `make_store_rules.py` → `ba_store_rules.json` (+ `web/py/` copy): products, furniture (cph `c`, holds `h`, tags `x`, mounts `m`, vendors `v`, type tags `bt`), types, hoods, banks, vendors. Wired in `build_web.py`, `web/worker.js`, AGENTS.md, docs/game-update.md, docs/architecture.md, the worker/stamp tests.
- `ba_dashboard.py` Python, section `# --- open a store` (after `_payback()`): `load_store_rules()`, `initial_customers()` (shared with `_arrival_ceiling()`), `demand_with()`, `optimal_providers()`, `decor_route()`, `outfit_lines()`, `_layout_slots()`, `_copied_shelving()`, `_store_market()`, `_own_shops()`, `_own_sales()`, `_finance_facts()`, `_open_store()`; payload key `openStore` wired in `extract()` (premises now computed before the return dict).
- Profit model validated in JS (`docs/open-a-store-phase2-wip/val.cjs` over payloads from `dump.py`): 102 real shops, actual/model median 0.958, p25 0.76, p75 1.00, p90 1.08, ±15% 55%, ±30% 78% (research B: 0.95 / 0.79 / 0.99 / 1.06 / 60% / 79%). Needs the type's full product range, not primary only.

## Half-done
- Board script: `docs/open-a-store-phase2-wip/open_store_board.js` holds the whole view (plans in localStorage, `osModel`, `osBestModel`, `osOwnRatio`, `osCannibal`, loans, steps 1–4, `drawOpenStore`, `wireOpenStore`). NOT yet inserted into `TEMPLATE` in `ba_dashboard.py`. Offices: `osEstimate` calls `osBestModel`, which returns null for `model: "office"` (office formula not written).

## Next
1. Insert the JS into the board script (before `/* --- plan a chain`), add markup `<section class="sec rv" id="secOpen" data-sub="open">` with `#osCtl` (data-view-ctl="expansion/open"), `#osStrip`, `#osBody`, `#osWhere > #osFinderMap` between secMarket and secPlan; register SUBS growth item, AREAS views, ROUTES `expansion/open` (+HOST_ROUTES, routeViewLabel), SEC_PAGE, PAGE_DRAWS `["growth/open", () => drawOpenStore()]`, SS_VIEWS, `wireOpenStore()` in `wireAll`, New badge (`open-store`) in `paintLocal`, news strip in `build_web.py` BANNER.
2. `web/map.js`: CityMapView `options.plan` mode (`planFor(preset)`, no persistence in `finderStore()`/`loadFinder()`, type row fixed, "Plan here" button in the card calling `plan.onPlan(key)`).
3. Port the canvas's os- CSS (canvas generator on branch `open-store-canvas`, `OS_CSS`) into `TEMPLATE`; Demand-cell popover (`#osCellPop` on body, position:fixed; "Open a store here" + "Find a location"), updating tests/finder.test.cjs and tests/businesses_expansion.test.cjs cell clicks; Python tests (synthetic) for outfit_lines/decor_route/_open_store; Playwright test of the steps; payload snapshots (`python tests/test_payload_snapshot.py --update`); docs (architecture payload row, dashboard-reference rules); changelog; `python build_web.py`.

## Decisions
- Toilet + privacy demands: one toilet stall (it is a toilet and carries the privacy tag); a plain toilet beside it could fail privacy.
- Fallback displays: per product the type sells, enough of its cheapest display to cover building capacity (one display caps the shop at its rate).
- Items limited to those whose designer tags name the type (`bt`) — keeps cinema registers and bar shelves out of a liquor store.
- Wages: the structural formula (staffing assistant not wired). Events (hype, backorder) left out of the steady state. Purchasing agent: best on staff, else 100.
- Model sells the full range (validation: primary-only gives median 1.07, ±15% 36%).

## Verify
`python dump.py` (in the wip folder, paths inside) then `node val.cjs open_store_board.js`; `python -m unittest discover -s tests`; `python build_web.py --check`.
