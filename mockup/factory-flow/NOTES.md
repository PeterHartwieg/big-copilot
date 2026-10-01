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
   across-the-river state. The location step ranks by rent, every size and neighbourhood
   shown (decision 13); it shows vehicles (parking slots: H 1, I to Q 2, one truck each) and the
   deposit.
6. **Export prices from the game's own rule** (below): the surplus is valued as an export.
7. **One menu point**: the factory flow and today's Plan a factory are one view, **Plan a
   factory** (next section).
8. **The For picker sits above the steps**, as drawn.
9. **A factory the player runs goes through the same five steps**: Where is ticked and named
   after the building ("4 22nd Street · yours"); Investment lists only the new machines and
   shelves (no lease, deposit or truck; the installation firm would price the whole floor
   again); Until production lists only what the change needs; Running compares output with the
   new plan. The Ingredients order-ahead table sits in step 1.
10. **Plan a factory gets the New badge** for the release (below).
11. **Investment is the fixed, one-off upfront cost only**: machines and furniture at list
    price, the installation fee (firm) or the furniture delivery (self-installation), the
    deposit, vehicles. No raw material or stock, wages, rent beyond the deposit, import costs
    or first-weeks buffer. The drawn totals already held only one-off items, so no figure
    changed: $542,070 self and $1,298,932 firm for a new factory, $272,750 and $1,029,612 for
    the owned-factory addition, $668,830 with a new depot, loan $280,000 with $262,070 cash
    upfront. What changed is the separation: the plan strip's fourth cell is now **Running
    costs** (raw material a week, marked "not in the investment", set apart with a dashed
    edge), every investment total says "one-off, upfront", the loan's day figure reads "Repaid
    a day", and the no-depot step says the depot's rent and driver are running costs.
12. **Vehicles are investment**, in the plan and in Results: a business's own vehicles count
    at their purchase price plus their delivery, if one was paid. Results' Invested for the
    factory is $541,820 (furniture $407,500 + deposit $36,320 + Freight Truck T1 $98,000; the
    plan's $250 furniture delivery is a plan figure the save does not show), and the chain's
    total includes it. No "proposed" marker.
13. **Size is the player's call.** Even a small warehouse can be made to work, so the Where
    step neither filters out small buildings nor judges whether the machines fit. It lists every
    warehouse size, H (690 m², 1 vehicle) to Q (2,610 m², 2 vehicles), with floor, vehicle slots,
    rent and deposit as facts, ranked by rent, in every neighbourhood. The finder's own Size
    filter (min / max) is there for the player to set, defaulting to all.
14. **Purchasing Agent discount on imports and raw material**, exactly as `_open_store()`
    applies it to goods: × (1 − 0.25 × the best Purchasing Agent's skill / 100), a company with
    none planned at skill 100 ("most players use a highly skilled agent"). Brightwater's best
    agent is skill 100, so 25% off. It applies to buying (raw material, the imports the factory
    replaces), not to what a pier pays for exports. Said in one line where prices are used
    ("At import prices: … less 25% for Ana Kerr, your best Purchasing Agent (skill 100%)").
15. **Running costs a week = raw material + wages + rent**, shown in the plan strip's Running
    costs cell with its breakdown, never in the investment.
    - Wages are the game's own: `SkillData.baseHourlyWage` × (1 + 1.05^skill / 100) ×
      `employeeHourlySalaryMultiplier` (research `PROFIT_COSTS.md` C1), at skill 100 as the
      store flow plans its staff, Normal 0.7. Bases: Factory Worker 12, Delivery Driver 18,
      Purchasing Agent 30 → $19.45, $29.17, $48.62 an hour.
    - Paid hours: the machines' 504 h a week; a driver is paid a flat 5.7 h a day (the game's
      rule); the new Purchasing Agent 40 h a week at headquarters (an assumption: the HQ's
      week is the player's).
    - Rent is included: the board treats rent as a running cost (the store flow's profit model
      subtracts wages, rent and marketing), and nothing else in the plan counts it.
    - An owned factory shows only what the change adds: the added raw material and the new
      workers' wages, no rent.
16. **Pallet shelves sized from the game's storage**: a week of raw material (a plain import
    contract delivers once a week) plus two days of output (the factory ships daily at 08:00).
    The board has no storage rule of its own (`docs/dashboard-reference.md`: "Storage and
    transport limits are not modelled"), so this is the canvas's rule.
    - A Pallet Shelf holds 60 boxes (the game's help page, `furniture-palletshelf` in
      `web/wiki-data.json`; no Pallet Shelf in Peter's saves holds more than 60 cargo
      instances; a Storage Shelf holds 16).
    - A box holds `Item.boxSize` units (a field of the game's `Item`, `research/headhunter/
      il_all.txt`). Read off the saves as the fullest box seen: Whisky, Bottle of Wine, Beer
      300; Barley, Water, Yeast, Grapes, Hops, Carbon Dioxide 500; Sugar 1,500. Not read from
      the bundle (UnityPy is not installed here); the porting step reads it there.
    - New factory: 193 boxes of raw material + 24 of output = 217 boxes → 4 shelves (was 12):
      $10,000 instead of $30,000. Owned factory with Beer ×2: 401 boxes → 7 shelves, so 3 more
      (was 4): $7,500 instead of $10,000.
    - The depot in the no-depot artboard keeps its 8 shelves as drawn; a depot's storage follows
      its own imports, not the factory plan.

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
- **For: a factory you own** (`GrowWhat`, `GrowInvestment`, `GrowChecklist`, `GrowRunning`):
  the same steps. Step 1 starts the lines at the machines running there ("as now"), the
  steppers show the change (+2), the shortage row as above, then today's **Ingredients** table
  (order ahead: company target, on order now, change, cash a week) across all your factories.
  Step 2 is ticked and reads "4 22nd Street · yours". Step 3 is the new machines and shelves
  only ($272,750; the firm would charge $757,112 for the floor again). Step 4 is the change's
  own rows: machines and recipes in the game, Hire 6, Hops and Carbon Dioxide onto the contract
  in the game, Set 5 amounts, Beer onto the delivery plan in the game, then the depot's Beer
  import lowered. Step 5 compares output with the new plan, Beer's ramp-up included.

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

## Artboards (17)

Every page is 1280 px wide with the shipped sidebar. Each has a `dark` Tweak.

| File | Shows |
| --- | --- |
| `Main` · 0 | Expansion › Plan a factory, For: New factory, a player with no factory. What the chain's shops buy that a factory can make, sorted by what it saves a day: sold and imported a week, machines sized to the peak day, what they cost, the surplus a week, saves a day. Your factory plans. |
| `Links` · 0b | The one menu point in the sidebar; the store checklist's button (same label, into step 1); every other way in and where it lands. |
| `Recipe` · 1 | The lines with steppers, sizing on Custom (peak day: Wine ×2); made a week against what the shops take; raw material a week; saves a week. The shortage finding row (decision 4). The surplus valued as an export with its formula. The chain as a strip. |
| `NoDepot` · 1b | No depot yet: to supply these shops the factory needs a depot, so the plan adds one. |
| `Location` · 2 | Warehouse buildings of every size and neighbourhood, ranked by rent (H in Manhattan first): vehicles, rent, deposit, rent a week. Facts strip: warehouse building, ~90 days' deposit, vehicles per size, distance not counted. |
| `Investment` · 3 | Self-installation (default), the shopping list by store with map pins, the total, then the financing panel. |
| `InvestmentFirm` · 3b | Installation firm: 586 × 1,292 m² is more than the machines. |
| `Checklist` · 4 | Until production, linked: the site, people, goods; quick buttons only for `hire` and `imports`; manual steps tagged "in the game". |
| `ChecklistNoLink` · 4b | The same without the link. |
| `Hire` · 4c, 4d | The hire and weekly-amounts dialogs in the write-dialogs language. |
| `Running` · 5 | Made a week against plan, shipped to the depot against what the shops take, exported (value), raw material; made a day against the plan line; output per line. |
| `RunningBelow` · 5b | Output below plan, with its two causes and their write buttons. |
| `GrowWhat` · A1 | For: 4 22nd Street. Step 1: lines as now with the change (Beer +2), the shortage row, the Ingredients order-ahead table; step 2 ticked as "yours". |
| `GrowInvestment` · A3 | Only the new machines and shelves; nothing else to pay. |
| `GrowChecklist` · A4 | Only what the change needs, with Hire 6 and Set 5 amounts. |
| `GrowRunning` · A5 | Output against the new plan, Beer's ramp-up in the daily chart. |
| `Results` · 6 | Businesses › Results with the factory as a cost centre in its chain; Invested counts its truck. |

## Numbers (synthetic company, the game's rules and prices)

- Brightwater Spirits: 4 liquor stores and Brightwater Depot (6 24th Street). Sales a day
  invented: Whisky 1,850, Beer 2,600, Wine 1,240, Cigar 1,040, Cigarettes 1,400. Price
  indexes invented: Whisky 0.96, Wine 1.08, others 1.00. Normal difficulty.
- Recipes (`web/wiki-data.json`), kits and prices (`ba_item_prices.json`), wholesale
  (`ba_store_rules.json`) as before. Plan: Whisky ×2, Wine ×1, 25,200 made a week, 11 workers
  (504 machine-hours ÷ 50), 1 driver, 1 new Purchasing Agent.
- Running costs a week $23,387: raw material $7,762 (wholesale × 0.7 × 0.75; was $10,349
  before the discount), wages $12,909 (workers $9,801, driver $1,164, agent $1,945), rent
  $2,716. Owned-factory addition: $9,092 (raw $2,558, wages $6,534).
- Start page, saves a day (was → now): Whisky $9,106 → $6,829, Wine $4,160 → $3,120, Beer
  $2,909 → $2,182, Cigarettes $2,128 → $1,596, Cigar $1,445 → $1,084. Lines, saves a week:
  Whisky $63,739 → $47,804, Wine $32,364 → $24,273.
- Surplus 3,850 Whisky a week × $3.49 ($8 × 0.96 × 0.7 × 0.65) = $13,453 a week.
- 4 22nd Street, I3, 1,292 m², rent $388, deposit $36,320. Self $542,070 = 407,500 items +
  250 delivery + 98,000 truck + 36,320 deposit. Firm $1,298,932.
- Loan $280,000 at Vantander: 392 interest + 1,166 back a day, $94,472 interest over 241 days.
- Results: shops 12,010 + 16,640 + 10,980 + 13,874, depot −980, factory −4,060 = $48,464 a day;
  Invested 200,770 + 211,290 + 199,690 + 99,115 + 83,770 + 541,820 = $1,336,455.

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

None left: every question on this canvas has been answered (decisions 8 to 16).

## Porting plan

**One view: what happens to Plan a factory**

- Keep the route `expansion/factory`, its host `["growth","plan"]`, the label
  `nav.view.factory` "Plan a factory" and the legacy alias `growth/plan`. No new route, no new
  route (the New badge is below).
- `secPlan` stays the view's section; add `secPlanFlow` (the steps, plan strip and step bodies)
  beside it in `SEC_PAGE` (`["growth","plan"]`). `secIngredients` stays and shows only for an
  owned-factory target (it already hides in the store flow, `tests/open_store.test.cjs` 307–315).
- `drawPlan()` gains the two pickers (it already builds the type picker; the For picker is new,
  from `factoryView().sites`) and draws the five steps for both targets through the `of*`
  bodies. For an owned factory: step 1 seeds the lines from that factory's machines
  (`factoryCounts()` narrowed to one site) and shows the Ingredients table; step 2 is marked
  done with the building's address; step 3 prices only the added items (`osStores()` over the
  difference); step 4 builds only the change's rows (added machine-hours → hire, ingredients not
  on the factory's contract → in game, amounts → `gwImports()`, the products new to the delivery
  plan → in game); step 5 compares with the new plan. `planDraw()` keeps its arithmetic.
- **New badge:** add `"expansion/factory": "factory-flow"` to `VIEW_NEW` (`paintLocal()` then
  renders `<span class="feature-new" data-new-feature="factory-flow">`); put the same ID on the
  Overview's "Plan a new factory" task and the store checklist's Plan a factory button so all
  badges clear together (`docs/contributing.md`, "New feature badges"); call
  `featureDiscovery.visit("factory-flow")` when the view opens. A new ID, not "open-store", so
  players who saw Open a store still get it. Drop it from `VIEW_NEW` a release or two later.
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
- `_payback()`: the factory stays a cost centre (no break-even of its own).
- **Vehicles in the investment** (decision 12): `setup_cost()` gains a `vehicles` part, and
  `firm` and `self` include it. `_site_setup()` passes each business's own vehicles: the
  save's `VehicleInstances` that belong to that business (the field tying a vehicle to its
  warehouse or factory slot is to be read off a save; a vehicle no business holds, such as the
  player's own car, counts nowhere), priced by `vehicleTypeName` through
  `ba_store_rules.json` `vehicles` (the table `_open_store()`'s loan wealth already uses), plus a
  vehicle delivery where the transaction log shows one. `_payback()` sums it like the other
  parts, so a chain's Invested and break-even day include its depots' and factories' trucks.
  - Effect on existing figures: every chain with a depot or factory that owns a vehicle shows a
    higher Invested and, where not yet paid back, a later break-even day; shops rarely own one.
    A remembered break-even day stays (`_payback_row` keeps a reached day while the cost moves
    by 1% or less; more than that re-judges it, so note it in the changelog entry).
  - Tests and snapshots that move: `tests/fixtures/payload_snapshot/*.json` (regenerate with
    `python tests/test_payload_snapshot.py --update` and review the `payback` diff),
    `tests/test_payback.py` (add a case with a vehicle), `tests/payback.test.cjs` (the
    Invested column), `tests/test_open_store.py` and `tests/open_store.test.cjs` where they
    assert a cost breakdown; `docs/dashboard-reference.md` (Payback) and
    `docs/open-a-store-scope.md` ("Investment = furniture + interior + deposit").
- `docs/dashboard-reference.md` "Plan a factory": the For picker, the export price rule.

**Board script (TEMPLATE)**

- `of*` functions mirroring `os*`: `ofLoad/ofSave` (`ba_open_factory_v1:<character>`),
  `ofCtlHtml` (five steps), `ofStripHtml`, `ofWhatHtml`, the shortage row, `ofInvestHtml` (reuse
  `osStores()`, `osToolbar()`, `osWhy()`), the financing panel through `osLoan()`/`osLoanLimit()`,
  `ofUntilRows` and the owned-factory change rows (reuse `osAct()`, `osIngame()`, the `os-ck`
  rows), `ofRunHtml`.
- The investment sum (`ofInvestment()`, like `osInvestment()`) takes only one-off items:
  furniture (`setup_cost()` items), fee or delivery, deposit, vehicles. Running costs (raw
  material from the plan's lines, wages, rent) are a separate figure for the plan strip and
  Running, never added to it, and the loan is sized on the investment alone.
- Prices: `_open_factory()` takes `agent` and the discount from the same lines `_open_store()`
  uses (best `ba:skill_purchasingagent` level, default 100; `discount = 1 − 0.25 × agent / 100`);
  import and raw prices carry it, export prices do not.
- Wages: a `SKILL_BASE_WAGES` table read from the skills bundle (`SkillData.baseHourlyWage`) by
  `make_store_rules.py` (today only `PLAN_WAGES` and `PLAN_OFFICE_WAGES` are hand-kept), the
  board's `(1 + 1.05^100 / 100) × wages` factor as `osOfficeModel()` uses it; drivers at the
  game's flat 5.7 h a day; HQ staff the plan adds at the HQ's scheduled hours.
- Storage: `make_store_rules.py` adds `Item.boxSize` per product and ingredient and the
  shelves' box capacity (`ba:itemtag_isbusinessstorage` items: Pallet Shelf 60, Storage Shelf
  16) to `ba_store_rules.json`; the plan sizes shelves to a week of ingredients and two days of
  output, and an owned factory's addition subtracts the shelves already placed there.
- Write buttons: `hrReview({scope:"site"})` for the factory, Quick hire for the HQ agent,
  `gwImports()` for amounts and the depot's own lines.

**`web/map.js`**

- `options.plan` with `cat: "warehouse"`, no size preset (the existing Size filter stays the
  player's, empty by default) and no fit check; the map shows the inset of the picked row's
  region (Industry City or Manhattan).

**Other**

- A changelog entry, i18n keys, `tests/test_open_factory.py` (synthetic fixtures; the export
  price rule), `tests/open_factory.test.cjs`, slice anchors for the `of*` block.
