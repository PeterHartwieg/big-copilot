# Open a factory: design notes

Canvas: https://claude.ai/artifact/HVNSkyctB3YTsfTGCDoLWu (Design type). Generator:
`build_canvas.py`; never hand-edit `project/`. `--preview` writes plain HTML to `_preview/`
(both themes) and wants local map crops there as `_preview/map.jpg` (Manhattan) and
`_preview/ic.jpg` (Industry City, `web/maps/full-map.png` cropped to the inset's bounds);
`_preview/` is ignored.

Issue #172, round 1, 1 Oct 2026, for Peter's review. Nothing is built. The sibling is the
shipped Open a store flow (`drawOpenStore()`, `os*`, `_open_store()`); its canvas is
`mockup/open-store/` on branch `open-store-canvas` (e8802364). This canvas reuses its
stylesheet unchanged (the shipped board kept the `os-` names), its six-step controls row, plan
strip, investment toggle, financing panel, checklist rows and ROI view. What only a factory
needs is `ff-`.

## Artboards

Every page is 1280 px wide with the shipped sidebar. Each has a `dark` Tweak.

| File | Shows |
| --- | --- |
| `Main` · 0 A | **Expansion › Open a factory** as its own view (NEW). "What your shops buy that a factory can make": per product the chain sells, sold and imported a week, machines sized to the chain, what they cost, what they save a day, and the days the machines take to pay back. Your factory plans. |
| `EntryB` · 0b B | The alternative: one view, **Open a site**, with a Store / Factory switch above the steps. |
| `Links` · 0c | The ways in: the store checklist's Logistics row (today Plan a factory; with this, "Depot deliveries" when the depot already imports the goods, and "Open a factory"), Plan a factory gains "Open this factory", the Overview task list gains a line. |
| `Recipe` · 1 | The lines with steppers (Whisky ×2, Wine ×1, Beer bought in), made a week against what the shops take (surplus / short chips), raw material a week per input, saves a week. The kit's machines and price. The surplus note (send it to a pier). The chain as a strip: factory → depot → river → shops. |
| `NoDepot` · 1b | No depot yet: a factory delivers only to depots and piers, so the plan adds one (deposit, pallet shelves, a Vord Courier D500). |
| `Location` · 2 | Find a location in plan mode: warehouse buildings, near your depot, Industry City map with the depot (D) and the two vendors (A, B). Columns: vehicles, rent, deposit, to the depot. Facts strip: every factory rents a warehouse building, ~90 days' deposit, no interior asked, distance only inside one region. |
| `LocationFar` · 2b | The pick is across the river (3 Twelfth Street, Lower Manhattan): the strip draws the river twice, a Manhattan map shows the pick and the shops, a warning card. |
| `Investment` · 3 | Self-installation (the default here): Factory Supply Depot (3 kits, 12 pallet shelves, delivery), General US Trucks (Freight Truck T1, needs a 95% driver), walls and floors $0, deposit. Industry City map with A, B, NEW and D. |
| `InvestmentFirm` · 3b | Installation firm: 586 × 1,292 m² = $757,112, more than the machines; the callout says what self-installation saves. The truck is bought by you either way. |
| `BreakEven` · 4 | **A** what the factory adds (investment ÷ the chain's extra profit a day, with the store flow's 0.8–1.05 band and both install modes) beside the itemised "Added to Brightwater Spirits a day"; **B** the chain as one, as `_chains()`/`_payback()` compute it; the financing panel. |
| `BreakEvenStates` · 4b | Chain not paid back yet (B: day 176 without, 187 with); bigger than the chain (one clothing line for two stores loses $1,080 a day before wages); nothing to replace (no estimate). |
| `Checklist` · 5 | Until production, game linked, in three groups: the site (lease, machines, recipes, truck), people (staff for the machines **Hire 12**, headquarters **Hire 1**), goods (raw material contract, weekly amounts **Set 5 amounts**, delivery plan, the depot's imports **Lower 2 amounts**, uniforms not needed). Manual steps carry an "in the game" tag and an in-game instruction even when linked. |
| `ChecklistNoLink` · 5b | The same without the link: every button becomes an instruction; one strip says which steps the link can never do. |
| `Hire` · 5c, 5d | The two quick buttons' dialogs in the write-dialogs language: Staff this factory (hire with the week written) and Weekly amounts (imports, starts the contract). |
| `Running` · 6 | Producing for 16 days: invested, added so far, paid back, days to go; cumulative chart against the plan line; output against plan per line; plan and now; the paid-back end state. |
| `RunningBelow` · 6b | Output below plan: Workstation 2 unstaffed on Sundays (**Staff Sunday**), Barley ordered short (**Set Barley to 33,600**); break even slips 12 days. |
| `Results` · 7 | Businesses › Results: the chain row with the factory and depot as kids (factory's break-even cell = A), and the chain's history (the factory's "Break even on day 210"). |

## Numbers (synthetic company, the game's rules and prices)

- Brightwater Spirits: 4 liquor stores (36 Fifth Avenue, 14 First Avenue, 8 Sixth Avenue,
  18 Second Avenue) and Brightwater Depot (6 24th Street, Industry City). Sales a day invented:
  Whisky 1,850, Beer 2,600, Wine 1,240, Cigar 1,040, Cigarettes 1,400.
- Recipes (`web/wiki-data.json`): Whisky 50/h from Barley 100, Water 50, Yeast 50; Wine 50/h
  from Grapes 100, Sugar 50, Yeast 50; Beer 50/h from five inputs at 50; Cigar and Cigarettes
  100/h on the Consumer Goods Workstation.
- Kits (`ba_item_prices.json`): Bottled Goods = Food Assembly 60,000 + Bottling 27,500 +
  Industrial Blending 45,000 = 132,500; Consumer Goods = 240,000 + 145,000 = 385,000. Pallet
  Shelf 2,500 (60 boxes). Freight Truck T1 98,000, Vord Courier D500 72,500.
- Wholesale (`ba_store_rules.json` `w`): Whisky 8, Wine 5.80, Beer 2, raw 0.01–0.35.
- Plan: 3 kits, 25,200 made a week, raw $14,784 a week, 11 workers (504 machine-hours ÷ 50,
  the board's own rule), 1 driver.
- 4 22nd Street, I3, 1,292 m², rent $388, deposit $36,320 (`_rent_estimate`,
  `_deposit_estimate` = rent × 93.61, the warehouse factor).
- Self $562,070 = 427,500 items + 250 delivery + 98,000 truck + 36,320 deposit. Firm
  $1,318,932 = 757,112 fee + items + truck + deposit.
- Added a day $17,372 = 21,760 imports replaced − 2,112 raw − 1,296 workers − 192 driver
  − 400 HQ − 388 rent → 33 days (31–41) self, 76 firm. Loan $280,000 at Vantander: 392 + 1,166
  a day, own cash back in 18 days.

## Decisions taken

1. **Same skeleton as the store flow**: six steps (What · Where · Investment · Break even ·
   Until production · Running), the four-cell plan strip (Make · Where · Investment · Break
   even), the plan picker, saved plans per character.
2. **Step 1 starts from the chain, not from a product list.** The start page ranks what the
   player's shops buy that a factory can make, by how fast the machines pay for themselves.
   Products none of the shops sell show with no estimate.
3. **Machines sized to the chain's peak day** (Plan a factory's own rule), with an Average day
   switch. Machines run flat out, so raw material and the surplus follow from the count. The
   surplus has one honest outlet the game offers: a pier in the factory's delivery plan.
4. **Every factory rents a warehouse building** (`types.factory.b = "warehouse"`), so the
   issue's "factory building vs warehouse with a 90-day deposit" does not exist: every
   factory pays the warehouse deposit. The canvas says so once, in the facts strip.
5. **Distance is drawn only inside one region.** Industry City and Manhattan are separate
   insets with their own scales (`full-map.png`: "Insets use independent scales"), and the
   board has no road graph. Inside Industry City the column is a relative bar with "close" /
   "farther"; across the river it says "over the river" and warns.
6. **Self-installation is the default for a factory**: the firm's 586/m² on 1,292 m² is more
   than the machines. The toggle still carries both totals.
7. **The truck is part of the investment** in both modes (the game requires one vehicle; the
   firm places none).
8. **Break even A is the headline**: the factory's investment against what it adds to the
   chain a day, itemised. B (the chain as one, `_payback()`'s chain row) sits under it,
   because for a chain that has already paid back it only says "stays paid back".
9. **Checklist in three groups** (the site, people, goods). Quick buttons only where a write
   exists: `hire` (factory workers and the driver with their week; the HQ Purchasing Agent
   through Quick hire) and `imports` (weekly amounts once the contract exists; lowering the
   depot's own Whisky and Wine imports after the first delivery). Machines, recipes, signing
   the contract, the delivery plan and the truck are marked "in the game" in both states.
   Uniforms show as not needed; marketing is left out.
10. **After opening, "added" is measured** as the chain's profit a day now less its last 7 days
    before production started. Output against plan per line, with the two causes the board
    already knows (unstaffed machine-hours, raw material ordered short) as rows with their
    write buttons.
11. **The break-even day lands in the chain's history** on Businesses › Results; the factory's
    kid row shows A's day.

## Open questions for Peter

1. **Entry: A or B?** Its own view under Expansion (A, `Main`), or Open a store becomes Open a
   site with a Store / Factory switch (B, `EntryB`).
2. **Break even: A or B as the headline?** A (what the factory adds) is the useful number for
   the decision; B is what Results shows today for a chain.
3. **Does distance cost anything in the game?** The Wiki says drivers deliver unseen at 02:00
   and factory plans ship at 08:00. If distance is free, drop the column and keep only "near
   the vendors you drive to". If not, the board needs a road scale per region.
4. **Wages assumed**: factory worker $18/h, driver $16/h, HQ staff $35/h. The port reads
   `SkillData.baseHourlyWage` as offices do (`PLAN_OFFICE_WAGES`).
5. **Imports priced at wholesale × today's index**; is a Purchasing Agent's discount on raw
   material worth modelling (it is for the store flow's goods)?
6. **Pallet shelves**: 12 is a placeholder. Size them to two days of raw material and output
   once the units per box are known.
7. **Does a size I floor hold 3 workstations?** `web/maps/floor-plans.json` has the shells; a
   fit check could place the kits. Not drawn.
8. **Surplus to a pier**: export prices are not in the save (MarketInsider). Show the surplus
   as worth nothing, or ask the player for a price?
9. **Should `_payback()` count vehicles?** Today `setup_cost()` counts furniture only, so the
   truck would be in the plan but not in Results' Invested.

## Porting plan

**Python, `ba_dashboard.py`**

- New `_open_factory(save, names, businesses, chains, premises, plan)` beside `_open_store()`,
  payload key `openFactory`:
  - per chain (`_chains()`), the products its shops sell that a recipe makes: sold a day,
    wholesale, recipe, kit;
  - per depot, what it imports (for "Depot deliveries" and the no-depot state);
  - candidate buildings: `_premises()` rows with `t == "warehouse"`, with `vehicles` (H 1,
    I/P/Q 2) and `region` from `locations.json`;
  - HQ facts: free Logistics Managers, free Purchasing Agents, free computer workstations.
- Reuse `_recipes()`, `_workstations()`, `_ingredient_prices()` and `_plan()` (`D.plan`) for
  the lines; `setup_cost()` unchanged for the shopping list (machines and shelves are items).
  Add vehicle prices from `ba_store_rules.json` `vehicles`.
- `_payback()`: a cost-centre row gets an `added` figure (chain profit a day after its opening
  less the 7 days before), and the factory's own outcome from it, so Results can show A's day.
  Remember the reached day in `History` as for sites. Document both in
  `docs/dashboard-reference.md`.
- `make_store_rules.py`: furniture vendors already cover Factory Supply Depot; add vehicle
  vendors (General US Trucks) if the trucks get map pins.

**Board script (TEMPLATE)**

- New `of*` functions mirroring `os*`: `ofLoad/ofSave` (`ba_open_factory_v1:<character>`),
  `ofCtlHtml`, `ofStripHtml`, `ofWhatHtml` (the ranking), `ofLinesHtml` (steppers; reuse
  `planDraw()`'s arithmetic, `planOrder()`), `ofInvestHtml` (reuse `osStores()`, `osToolbar()`,
  `osWhy()` with new tags), `ofBreakHtml` (reuse `osChart()`, `osBreakDay()`, `osRange()`,
  `osFinHtml()`/`osLoan*()` unchanged), `ofUntilRows` (reuse `osAct()`, `osIngame()`, the
  `os-ck` rows), `ofRoiHtml` (reuse `osRoiChart()`, `osRoiTable()`).
- Write buttons: `hrReview({scope:"site"})` for the factory (the staffing assistant's factory
  rules already plan 12-hour entries); Quick hire for the HQ agent; `gwImports()` for the
  contract's amounts and the depot's own lines.
- If A (own view): route `expansion/openfactory`, `VIEW_NEW`, `PAGE_DRAWS` row, navigation
  tables (`tests/navigation.test.cjs`), search synonym. If B: a kind switch at the top of
  `secOpen`, plans keyed by kind.
- Store checklist: `osCkLogistics()` gains "Open a factory" (`data-os-route`) and "Depot
  deliveries" when a depot imports the products.
- Plan a factory: an "Open this factory" button in `#secPlan` that seeds a plan with the
  current machine counts. Overview: one `ov-task` line.

**`web/map.js`**

- `options.plan` with `cat: "warehouse"`, a "Near" anchor (the depot) and a distance cell that
  returns null across regions; the map switches to the Industry City inset.

**Other**

- `docs/architecture.md` registries (view, payload key), `docs/dashboard-reference.md`
  ("Open a factory"), changelog entry (a new feature), i18n keys for every new string.
- Tests: `tests/test_open_factory.py` (synthetic fixtures), `tests/open_factory.test.cjs`, and
  the slice anchors for the new `of*` block.
