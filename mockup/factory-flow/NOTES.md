# Open a factory: design notes

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

1. **Entry: its own view**, Expansion › Open a factory. The single "Open a site" view with a
   Store / Factory switch is dropped.
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

## Artboards (13)

Every page is 1280 px wide with the shipped sidebar. Each has a `dark` Tweak.

| File | Shows |
| --- | --- |
| `Main` · 0 | Expansion › Open a factory (NEW). What the chain's shops buy that a factory can make, sorted by what it saves a day: sold and imported a week, machines sized to the peak day, what they cost, the surplus a week, saves a day. Your factory plans. |
| `Links` · 0b | The ways in: the store checklist's Logistics row, Plan a factory's "Open this factory", the Overview task list. |
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

**Python, `ba_dashboard.py`**

- New `_open_factory(save, names, businesses, chains, premises)` beside `_open_store()`,
  payload key `openFactory`:
  - per chain (`_chains()`), the products its shops sell that a recipe makes: sold a day,
    `import_price` and `export_price` per product (wholesale × `importPriceIndex` ×
    `marketPriceMultiplier`, × `exportMultiplier` for exports), recipe, kit;
  - per depot, what it imports (for the store checklist's link and the no-depot state);
  - candidate buildings: `_premises()` rows with `t == "warehouse"`, with `vehicles`
    (H 1, I/P/Q 2);
  - HQ facts: free Logistics Managers and Purchasing Agents, free computer workstations.
- Reuse `_recipes()`, `_workstations()`, `_plan()` (`D.plan`); `setup_cost()` unchanged for the
  shopping list; vehicle prices from `ba_store_rules.json` `vehicles`.
- `make_store_rules.py`: add `Item.maxOrderAmountPerImporter` per product, so the index drop
  from exports can be sized.
- `_payback()` unchanged: the factory stays a cost centre.
- `docs/dashboard-reference.md` "Open a factory": the export price rule and the index drop.

**Board script (TEMPLATE)**

- New `of*` functions mirroring `os*`: `ofLoad/ofSave` (`ba_open_factory_v1:<character>`),
  `ofCtlHtml` (five steps), `ofStripHtml`, `ofWhatHtml`, `ofLinesHtml` (steppers on
  `planDraw()`'s arithmetic; the shortage row when a custom count leaves the shops short),
  `ofInvestHtml` (reuse `osStores()`, `osToolbar()`, `osWhy()`), the financing panel through
  `osLoan()`/`osLoanLimit()` without `osLoanDays()`, `ofUntilRows` (reuse `osAct()`,
  `osIngame()`, the `os-ck` rows), `ofRunHtml` (output against plan, exports, raw material).
- Write buttons: `hrReview({scope:"site"})` for the factory, Quick hire for the HQ agent,
  `gwImports()` for the contract's amounts and the depot's own lines.
- Route `expansion/openfactory`, `VIEW_NEW`, a `PAGE_DRAWS` row, the navigation tables
  (`tests/navigation.test.cjs`), a search synonym.
- Store checklist: `osCkLogistics()` gains "Open a factory" and "Depot deliveries". Plan a
  factory gains "Open this factory". Overview: one `ov-task` line.

**`web/map.js`**

- `options.plan` with `cat: "warehouse"` and a minimum size; no distance anchor; the map
  switches to the Industry City inset.

**Other**

- `docs/architecture.md` registries (view, payload key), a changelog entry, i18n keys.
- Tests: `tests/test_open_factory.py` (synthetic fixtures; the export price rule),
  `tests/open_factory.test.cjs`, slice anchors for the `of*` block.
