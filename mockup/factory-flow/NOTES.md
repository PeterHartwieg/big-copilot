# Plan a factory (open a factory): design notes

Canvas: https://claude.ai/artifact/HVNSkyctB3YTsfTGCDoLWu (Design type). Generator:
`build_canvas.py`; never hand-edit `project/`. `--preview` writes plain HTML to `_preview/`
(both themes) and wants local map crops there as `_preview/map.jpg` (Manhattan) and
`_preview/ic.jpg` (Industry City, `web/maps/full-map.png` cropped to the inset's bounds);
`_preview/` is ignored.

Issue #172. Round 1 drawn 1 Oct 2026, revised the same day after a gpt-6.1-sol review, then
cut to Peter's decisions (below). Nothing is built. The sibling is the shipped Open a store flow
(`drawOpenStore()`, `os*`, `_open_store()`); its canvas is `mockup/open-store/` on branch
`open-store-canvas` (e8802364). This canvas reuses its stylesheet unchanged (the shipped board
kept the `os-` names), its controls row, plan strip, investment toggle, financing panel,
checklist rows and finder plan mode. What only a factory needs is `ff-`.

## Peter's decisions (1 Oct 2026)

1. **Entry: its own view under Expansion.** The single "Open a site" view with a Store /
   Factory switch is dropped.
2. **No break-even for a factory for now.** The Break even step is gone (five steps: What ·
   Where · Investment · Until production · Running), and so is every payback figure: days to
   pay back on the start page, the payback KPIs, chart and "paid back" state after opening,
   the factory's break-even cell and history in Results. The **investment total and the
   financing panel stay**: the loan stands on its own (amount, cash upfront, a day while it
   runs, interest); "your own cash back in n days" is dropped because it needs a profit
   estimate.
3. **No profit band** (0.80–1.05, midpoint 0.925): no ranges, no midpoint-scaled figures.
4. **A custom machine count that leaves the shops short gets a warning**, as a finding row
   under the lines: "Bottle of Wine stays short · 1 machine makes 8,400 a week; your shops
   take 8,680. The rest keeps coming from United Ocean Import." No advice to add machines or
   sites.
5. **Distance costs nothing in the game.** No distance column, no "near the depot" filter, no
   across-the-river state. The location step filters by size (room for the workstations) and
   ranks by rent; it shows vehicles (parking slots: H 1, I to Q 2, one truck each) and the
   deposit.
6. **Export prices from the game's own rule** (below): the surplus is valued as an export.
7. **One menu point**: the factory flow and today's Plan a factory are one view, **Plan a
   factory** (next section).

## One menu point: Plan a factory

**Name: Plan a factory.** It is the view's name today (`nav.view.factory`), the Overview task
("Plan a new factory"), the store checklist's button, Supply › Production's button, the Wiki's
"Open Plan a factory with {name} selected" and the search entry; keeping it keeps every link,
translation and habit. It also covers both jobs: planning more output for a factory you run, and
planning a new one through to production. Alternatives considered: "Open a factory" (the store
flow's sibling, but it hides the owned-factory case), "Factories" (a place, not a job; the
board's Expansion views are verbs), "Plan a chain" (the old internal name; a chain also means a
store chain on Results).

**How the view reads.** Two pickers above everything: **Shops** (the planner's existing type
picker: owned types as segments, "Another type" as the dropdown) and **For** (**New factory**,
then one segment per factory you run).

- **For: New factory** (`Main`, `Recipe` … `Running`): the five steps What · Where · Investment
  · Until production · Running. Step 1 is today's planner (lines with steppers, made a week
  against what the shops take, raw material) plus the shortage row and the export value. A
  player with no factory sees only New factory in the For picker.
- **For: a factory you own** (`Grow`): no steps. The lines start at the machines running there
  ("as now"), the steppers show the change (+2), the shortage row as above, then **What the
  change needs** (the checklist rows for an addition: machines and recipes in the game, Hire n,
  new ingredients on the contract in the game, Set amounts, the delivery plan in the game), then
  today's **Ingredients** table (order ahead: company target, on order now, change, cash a week)
  across all your factories, unchanged in meaning.

Nothing Plan a factory offers today is lost: the type picker, the steppers, Made / week,
Supplies (shops / surplus / short), Raw material / week, the kit list, the services note, the
Ingredients order-ahead table (target, on order, change, cash, "not ordered", Smart, paused, no
price) and its price span all stay; the Demand grid's "Plan a chain" link, the Wiki button and
Supply › Production's button keep their targets.

## Export prices (confirmed in the game code, build on disk 1 Oct 2026)

Read from `BigAmbitions.dll` with `research/il_dump.py` (main checkout):

- `ProductMarketHelper.GetProductExportPrice(item)` =
  `ItemHelper.GetWholesalePrice(item) × gameVariables.exportMultiplier`.
- `ItemHelper.GetWholesalePrice(item)` = `Item.wholesalePrice × importPriceIndex ×
  gameVariables.marketPriceMultiplier`, where `importPriceIndex` is the product's
  `ProductMarketEntry` in the save (`productMarketEntries[].importPriceIndex`; 1 when the
  product has none, as raw materials do).
- So a pier pays wholesale × that product's index × public prices × export price. On Normal
  that is wholesale × index × 0.7 × 0.65; both multipliers are already read off the save
  (`HOUSE_RULES`). The same `GetWholesalePrice` is what imports cost, so the canvas now prices
  imports and raw material with the 0.7 too (it left it out before).
- Exports move the index: `ProductMarketHelper.UpdateMarketDemand` ends with
  `importPriceIndex = max(0.5, importPriceIndex − 0.25 × exportedThisWeek ÷
  Item.maxOrderAmountPerImporter)`, where `GetAmountExportedThisWeek` sums the factories'
  `factoryExports` and their `orderHistory` sales since Monday. The index otherwise moves
  randomly, clamped to 0.5–1.3.
- **Gap:** `Item.maxOrderAmountPerImporter` is not in the board's data (`ba_store_rules.json`
  has no field for it; `make_store_rules.py` would add it from the items bundle). The imports
  write's dry run already returns it per product as `cap`. Until it is read, the canvas says
  exports pull the index down and does not size the drop.

## Artboards (14)

Every page is 1280 px wide with the shipped sidebar. Each has a `dark` Tweak.

| File | Shows |
| --- | --- |
| `Main` · 0 | Expansion › Plan a factory, For: New factory, a player with no factory. What the chain's shops buy that a factory can make, sorted by what it saves a day: sold and imported a week, machines sized to the peak day, what they cost, the surplus a week, saves a day. Your factory plans. |
| `Grow` · 0b | Plan a factory, For: 4 22nd Street (a factory the player runs): Beer +2, the shortage row, what the change needs, the Ingredients table. |
| `Links` · 0c | The one menu point in the sidebar; the store checklist's button (same label, into step 1); every other way in and where it lands. |
| `Recipe` · 1 | The lines with steppers, sizing on Custom (peak day: Wine ×2); made a week against what the shops take; raw material a week; saves a week. The shortage finding row (decision 4). The surplus valued as an export with its formula. The chain as a strip. |
| `NoDepot` · 1b | No depot yet: to supply these shops the factory needs a depot, so the plan adds one. |
| `Location` · 2 | Warehouse buildings of size I or larger in Industry City, ranked by rent: vehicles, rent, deposit, rent a week. Facts strip: warehouse building, ~90 days' deposit, vehicles per size, distance not counted. |
| `Investment` · 3 | Self-installation (default), the shopping list by store with map pins, the total, then the financing panel. |
| `InvestmentFirm` · 3b | Installation firm: 586 × 1,292 m² is more than the machines. |
| `Checklist` · 4 | Until production, linked: the site, people, goods; quick buttons only for `hire` and `imports`; manual steps tagged "in the game". |
| `ChecklistNoLink` · 4b | The same without the link. |
| `Hire` · 4c, 4d | The hire and weekly-amounts dialogs in the write-dialogs language. |
| `Running` · 5 | Made a week against plan, shipped to the depot against what the shops take, exported (value), raw material; made a day against the plan line; output per line. |
| `RunningBelow` · 5b | Output below plan, with its two causes and their write buttons. |
| `Results` · 6 | Businesses › Results with the factory as a cost centre in its chain; Invested as `setup_cost()` counts it today. |

## Numbers (synthetic company, the game's rules and prices)

- Brightwater Spirits: 4 liquor stores and Brightwater Depot (6 24th Street). Sales a day
  invented: Whisky 1,850, Beer 2,600, Wine 1,240, Cigar 1,040, Cigarettes 1,400. Price
  indexes invented: Whisky 0.96, Wine 1.08, others 1.00. Normal difficulty.
- Recipes (`web/wiki-data.json`), kits and prices (`ba_item_prices.json`), wholesale
  (`ba_store_rules.json`) as before. Plan: Whisky ×2, Wine ×1, 25,200 made a week, raw
  $10,349 a week (wholesale × 0.7), 11 workers (504 machine-hours ÷ 50), 1 driver.
- Surplus 3,850 Whisky a week × $3.49 ($8 × 0.96 × 0.7 × 0.65) = $13,453 a week.
- 4 22nd Street, I3, 1,292 m², rent $388, deposit $36,320. Self $562,070 = 427,500 items +
  250 delivery + 98,000 truck + 36,320 deposit. Firm $1,318,932.
- Loan $280,000 at Vantander: 392 interest + 1,166 back a day, $94,472 interest over 241 days.
- Results: shops 12,010 + 16,640 + 10,980 + 13,874, depot −980, factory −4,060 = $48,464 a day.

## Other decisions taken

1. Same skeleton as the store flow: the steps, the plan strip (Make · Where · Investment · Raw
   material), the plan picker, saved plans per character.
2. Step 1 starts from the chain: what its shops buy that a recipe makes.
3. Machines sized to the peak day (Plan a factory's rule), with Average day and Custom.
4. Every factory rents a warehouse building (`types.factory.b = "warehouse"`), so every factory
   pays the warehouse deposit (~90 days).
5. Self-installation is the default; the truck is part of the investment either way.
6. Checklist in three groups; quick buttons only where a write exists (`hire`, `imports`);
   machines, recipes, signing the contract, the delivery plan, the truck and assigning the
   driver to it are in-game steps. Uniforms show as not needed.
7. After opening, the board measures output (made, shipped, exported, raw material) against the
   plan, and names the two causes it already knows (unstaffed machine-hours, raw material
   ordered short).
8. Results as shipped. One side effect to know: a chain's break-even day can never be before
   its newest member opened (`chain_window_day()`), so a paid-back chain's day moves to the
   factory's opening (day 170 here).

## Design calls for Peter (new with the merge)

1. **The For picker's place**: above the steps as drawn, or inside step 1 only (the steps then
   show for every target, greyed for an owned factory)? Drawn: above, steps only for New factory.
2. **Owned factory: where the additions go.** Drawn as one page (lines, what the change needs,
   ingredients). Alternative: the same five steps with Where skipped and Investment showing
   only the new machines. One page is shorter; the steps reuse more.
3. **Badge**: Plan a factory is an existing view, so no NEW badge is drawn. Give it one for the
   release?

## Open questions for Peter

1. **Invested and vehicles.** `setup_cost()` counts furniture and deposit ($463,820 for this
   factory); the plan's investment adds the truck and its delivery ($562,070). Should Results'
   Invested count vehicles too?
2. **Wages**: the port reads `SkillData.baseHourlyWage`, as offices do. Not needed for any
   figure the canvas shows now; needed if the plan shows running costs.
3. **Purchasing Agent discount** on raw material: model it (the store flow does for goods)?
4. **Pallet shelves**: 12 is a placeholder; size them to raw material and output once the
   units per box are known.
5. **Does a size I floor hold 3 workstations?** The size filter assumes I and up;
   `web/maps/floor-plans.json` has the shells for a fit check.

## Porting plan

**One view: what happens to Plan a factory**

- Keep the route `expansion/factory`, its host `["growth","plan"]`, the label
  `nav.view.factory` "Plan a factory" and the legacy alias `growth/plan`. No new route, no new
  `VIEW_NEW` (or a NEW badge on the existing view for one release, a changelog call).
- `secPlan` stays the view's section; add `secPlanFlow` (the steps, plan strip and step bodies)
  beside it in `SEC_PAGE` (`["growth","plan"]`). `secIngredients` stays and shows only for an
  owned-factory target (it already hides in the store flow, `tests/open_store.test.cjs` 307–315).
- `drawPlan()` gains the two pickers (it already builds the type picker; the For picker is new,
  from `factoryView().sites`) and dispatches: For = an owned factory → today's lines seeded from
  that factory's machines (`factoryCounts()` narrowed to one site), the change checklist, the
  Ingredients table; For = New factory → `drawOpenFactory()`, the `of*` step bodies.
  `planDraw()` keeps its arithmetic and is shared by both.
- `PAGE_DRAWS`: the existing `["growth/plan", () => drawPlan()]` row stays the only row; the
  flow draws from inside it.
- Navigation tables: `ROUTES`/`routeLabel` unchanged; `tests/navigation.test.cjs` row
  `['growth','plan','secPlan','growthNav']` gains `secPlanFlow` if the test lists sections;
  `tests/shell_routes.test.cjs` (`expansion/factory`) and `tests/open_store.test.cjs` (the four
  Expansion routes) stay as they are.
- Search: the existing `plan` entry keeps `openRoute("expansion/factory")`; add synonyms "open a
  factory", "new factory", "factory location", "add machines". No second entry.
- Links that point at Plan a factory keep their target and gain a preset: the store checklist's
  `osCkLogistics()` (type preset, For = New factory), Supply › Production's button (`sb.prod.plan`,
  For = that factory), the Overview task, the Demand grid's `.mk-plan[data-plan]` (type), the
  Wiki's `wikiPlanChain()` (type), the finder's `[data-fx="factory"]`. One helper,
  `openPlan({type, target})`, sets `planType` and the new `planTarget` before `openRoute()`.
- Tests that set `planType` and call `drawPlan()` (`tests/wiki.test.cjs`,
  `tests/wiki-guides.test.cjs`, `tests/import_setto.test.cjs`, `tests/hostile_names.test.cjs`,
  `tests/market.test.cjs`, `tests/layout.test.cjs` on `#planPicker`, `tests/i18n_layout.test.cjs`
  on `#secPlan, #secIngredients`) keep working if `planTarget` defaults to the first owned factory,
  else New factory, and `#planPicker` keeps its id.
- `docs/architecture.md`: the views table row "Plan a factory (`plan`)" gains `secPlanFlow`; the
  payload row `plan` gains `openFactory`.

**Python, `ba_dashboard.py`**

- New `_open_factory(save, names, businesses, chains, premises)`, payload key `openFactory`:
  - per type (the planner's catalogue), import and export price per product (wholesale ×
    `importPriceIndex` × `marketPriceMultiplier`, × `exportMultiplier` for exports);
  - per depot, what it imports (the store checklist's link and the no-depot state);
  - candidate buildings: `_premises()` rows with `t == "warehouse"`, with `vehicles`
    (H 1, I/P/Q 2);
  - HQ facts: free Logistics Managers and Purchasing Agents, free computer workstations;
  - per owned factory, which ingredients are on its import contracts (for "not on the contract
    yet").
- Reuse `_recipes()`, `_workstations()`, `_plan()` (`D.plan`); `setup_cost()` unchanged for the
  shopping list; vehicle prices from `ba_store_rules.json` `vehicles`.
- `make_store_rules.py`: add `Item.maxOrderAmountPerImporter` per product, so the index drop
  from exports can be sized.
- `_payback()` unchanged: the factory stays a cost centre.
- `docs/dashboard-reference.md` "Plan a factory": the For picker, the export price rule.

**Board script (TEMPLATE)**

- `of*` functions mirroring `os*`: `ofLoad/ofSave` (`ba_open_factory_v1:<character>`),
  `ofCtlHtml` (five steps), `ofStripHtml`, `ofWhatHtml`, the shortage row, `ofInvestHtml` (reuse
  `osStores()`, `osToolbar()`, `osWhy()`), the financing panel through `osLoan()`/`osLoanLimit()`,
  `ofUntilRows` and the owned-factory change rows (reuse `osAct()`, `osIngame()`, the `os-ck`
  rows), `ofRunHtml`.
- Write buttons: `hrReview({scope:"site"})` for the factory, Quick hire for the HQ agent,
  `gwImports()` for amounts and the depot's own lines.

**`web/map.js`**

- `options.plan` with `cat: "warehouse"` and a minimum size; the map switches to the Industry
  City inset.

**Other**

- A changelog entry, i18n keys, `tests/test_open_factory.py` (synthetic fixtures; the export
  price rule), `tests/open_factory.test.cjs`, slice anchors for the `of*` block.
