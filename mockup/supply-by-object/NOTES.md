# Supply by object: notes for Peter

Canvas: https://claude.ai/artifact/RDRP5zWzzu9WgKHidzTei8 (generator `build_supply_canvas.py`;
never hand-edit `project/`). This is R13 of the UX audit of 24 Sep 2026, drawn with R8 (one
verdict per supply fact), and revised after your review the same day. Nothing is ported yet.

## What the canvas shows

- Supply has three tabs, one per object: **Shops** (every shelf against tomorrow's round),
  **Warehouses** (every depot, second tier included) and **Factories** (lines, their hours,
  Factory inputs, then Staffing for factory lines). Each opens on **Needs a change**, with
  **Everything** beside it and the list/diagram pair for Goods flow.
- The change checklist is a tick at the head of each row. The figure to type sits in the
  column that holds the setting, as `now → set`. One strip under the tabs counts ticks
  across all tabs and keeps **Copy remaining** and the reset. Each tab badge counts what is
  left to type there.
- Every row has one status word with a one-line reason, the same word Today, the site page
  and Goods flow use.
- Idle rows fold into one group per site (Import Hub: 12 lines) or per cause (paper-bag
  top-ups at 3 jewelry shops). A click opens the group.
- **Sizing** is the player's switch on the Factories tab, remembered per device:
  - **24/7** (today's behaviour): lines, their inputs and the imports behind them are sized
    for rated output, round the clock.
  - **Demand**: sized for what the shops at the end of each chain use.
- **One margin per chain**: 12%, applied once from import to sale and never per hop, rounded
  up to 100. It applies to the weekly import and to the daily factory top-up that follows it.
  Hovering Uses / week or Eats / day shows the chain: end demand along the routes, one
  margin, then the order.
- **Plan a chain** can order ahead for a factory still being built. While the plan is saved,
  Supply shows its inputs as *new* ("ordered ahead · plan: …").

## Your decisions (24 Sep 2026)

1. Goods flow is **option A**, a diagram view on each tab. The option B artboard stays on the
   canvas, marked not chosen.
2. Sizing is a player's choice, **24/7** or **Demand**, remembered per device.
   - In Demand, a shop downstream that has traded under a week gets a straight-line
     extrapolation through its days. The factory block names it and says the figures
     "may still be ramping". On this save that is [GD] and [MH] HART. Jewelry, open 6 days,
     downstream of Factory Jewelry.
3. The margin is calculated once over the full chain, and daily factory top-ups follow it.
4. "Tight" stays one word: covers the use but not the margin. The nine words (covered,
   tight, short, no plan, paused, stalled, idle, made here, new) and "Idle stock" are
   approved.
5. Idle rows are grouped and open on a click.
6. The "Run shorter?" hint is replaced by **Staffing for factory lines**. Per factory it
   shows the hours each line should run for the chosen sizing, the factory workers to add or
   cut, the wage effect, and a link to the factory's page.
7. Approved:
   - Idle rows with a figure to type get a tick.
   - Only a line with too few hours is a change; cutting hours stays a suggestion.
8. Plan a chain orders ahead for a half-built factory (from the coordinator):
   - The steppers set the finished layout. Placed machines with no recipe or nobody posted
     count as built, not running ("12 planned · 5 placed · 2 running").
   - **Save as plan** turns the Company targets into the orders on Supply now, so the next
     Monday's import lands as the factory opens. It is kept per character on the device.
   - A one-line first fill covers the days before that Monday.
   - While the plan is saved, its inputs read *new* instead of idle, not drawn or too big.
     The plan clears itself once every planned machine runs, or on Remove.

## New calls for you

1. **Demand sizing and the imports.** The switch sits on Factories, but it also sizes the
   Import Hub levels and the daily top-ups. On this save Demand turns Warehouses from 7
   changes to 2 and Factories from 6 to 1. Is one switch for the whole chain right, and
   should Warehouses show the switch too? It currently shows only a "24/7" tag.
2. **Who counts as "under a week".** Fewer than 7 days trading, so [MT] HART. Jewelry at
   exactly 7 days is not flagged. Should the extrapolation read the next week's average
   (drawn: about 96 and 90 a day) or day 7's value?
3. **The staffing model.**
   - One factory worker covers about 6 machine-hours a day (42 a week, shifts of 12 hours at
     most), paid this save's $211 a day. Confirm, or let the port read shifts from the
     roster.
   - Demand sizing proposes cutting 17 of 62 factory workers (−$3,590 a day). Should the
     card also show the shortest safe roster per line (which hours), as the shops' Staffing
     does?
4. **The plan's own sizing.** Plan a chain sizes at 24/7, since no shop sells smartwatches
   yet. Under Demand, a plan for a range with no shops would size to zero. The canvas
   assumes a plan always uses 24/7.
5. **The first fill.** It is sized as the finished layout's use from the opening day to the
   import, minus what the depot holds, then rounded up. It assumes the factory opens Friday.
   Should the player set the opening day, or should it be read from the placed machines?

## Seeded states

The figures are from HART. YT, day 73. Six states are seeded so every verdict shows:

- [LM] HART. Jewelry, Jewelry (Cheap): Friday peak 162 (real 126).
- Clothing Distr., Paper Bag top-up 2,000 (real 5,000).
- Factory Jewelry, Jewelry (Cheap): rostered 12 h a day (real 24). Factory Jewelry has 6
  workers on the canvas; the save has 8.
- Factory Jewelry, Uncut Gems (Expensive): top-up 600 (real 750).
- Import Hub, Uncut Gems (Expensive): Smart Delivery level 4,800 (real 5,100).
- The plan: Factory Electronics at 12 machines, 5 placed (real 2 placed, 2 running).

Also:
- The second-tier depots' draw is the sum of their shops' sales. `depotOther` carries the
  same-day netting defect from the supply audit, so it is not used.
- The ramping shops are real.
- The electronics levels at Import Hub are real too: they are what an order placed ahead
  looks like today, which the board currently calls idle.

## What disappears compared with today

Each row below either moves or goes; nothing is dropped silently.

| Today | In the canvas |
| --- | --- |
| Orders sub-tab: Change checklist | Tick column plus the one strip (progress, Copy remaining, reset) |
| Orders: Weekly imports table | Import rows on Warehouses. *Order now* and *Set order to* become Order / top-up (`now → [box]`); *Used / week* becomes *Uses / week* (end demand, one chain margin). The thin day-cover line under *At depot* is replaced by the 7-day rail |
| Orders: Daily top-ups table | Factory inputs on Factories, now sized with the chain margin (today: no margin) |
| Checklist group by site with per-item reason paragraphs | Object blocks; the reason is the status line, the long form a tooltip. Shops are a flat table with a Shop column |
| Checklist kinds "Before the next delivery" (+N once) and "Check the delivery route" | Stay as row states: `+N once` in the setting cell; status *stalled* |
| Loose rows "Choose a supplying depot" | A "No depot" block on Warehouses (not drawn: none on this save) |
| "N recipes to name" link | The unnamed rows on Factories, same `linepick` select (none on this save) |
| Checks sub-tab and its 5 views | Before the drop → Shops; Before the import → Warehouses; Idle stock → status *idle*, grouped per site in the owning tab; Factory lines and Feed the factories → Factories |
| **One list of all idle holdings across sites** | **Lost as a single list.** The groups per site, plus Everything and sorting by Status, bring them together per tab |
| Factory lines: *Top-up out* and export columns | Moved into the line's sub-line (not drawn) |
| Feed the factories: *Import / week* and "all factories" need | Lives on the Import Hub row; the input row links there |
| Goods flow tab and *Held against need* | A diagram view on each tab (option A); a click on a site opens its rows, lit |
| "Stock checks" heading, per-view `?` notes | One verdict sentence per tab |
| Today's static "Plan imports" card | Should show a live count and open the tab with the most changes (R15) |
| Plan a chain: Company target as a figure to copy by hand | The same target, and with **Save as plan** it becomes the order on Supply |

## Porting map

Anchors are in `ba_dashboard.py` unless noted. Land it after R8 and the supply-audit fixes
(`supply-audit-fixes`).

### Python (payload)

- **Verdict (R8).** One `status` per (site, item), `{word, why, tip}`, on every row of
  `D.supply.shops`, `D.supply.imports`, `D.supply.idle` and the factory `needs`, computed in
  `_supply()` / `_factories()`. Line status goes on `lines`. *Tight* covers "covers the use,
  not the margin". *New* covers under 3 days of log and planned inputs.
- **Depots.** A new `D.supply.depots` holds every depot line, first and second tier: on
  hand, draw/day by destination (supply-audit defect 1), busiest day, the sender and its
  top-up target, uses/week, status.
- **Route demand, both sizings.** For each item at each importing depot and each factory
  input:
  - `demand247`: rated line output.
  - `demandShops`: the sum of end-shop sales along the logistics routes.
  - A breakdown `useParts: [{site, via, perDay, basis: "sales"|"rated"|"extrapolated"}]`.
  - One-off stock fills excluded.
  - One chain margin (a module constant, 12) applied once. The import level and the daily
    top-up are each their own route demand × (1 + margin), rounded up to 100.
  - `importSetting()`'s `total` and the top-up `raiseTarget` take the figure for the chosen
    sizing. The board picks between the two sets in JS, so switching needs no re-extract.
- **Ramping shops.** For each shop with fewer than 7 days trading, `ramp: {days, perDay,
  projected}` from a least-squares line through its daily sales in the `orderHistory` rows
  `_business()` already reads (plain arithmetic, no fitting library). Each factory row gets
  `rampingShops: [{siteKey, days}]` for the shops in its downstream chain.
- **Factory lines.** Add `needHours247` = 24 and `needHoursDemand` = ceil(demand × (1 +
  margin) ÷ (rate × machines)), plus `hoursDay` = hoursWeek / 7 and the `produceUpTo` limit
  (supply-audit defect 3).
- **Factory staffing (new; the staffing assistant covers shops only).** Per factory:
  - `workers` (factory workers now) and `wage` (from `staffCost`, drivers excluded).
  - Per line, hours now and needed for each sizing.
  - `workersNeeded` = ceil(Σ machines × hours × 7 ÷ 42), a model to confirm (call 3).
  - A later step could reuse the shops' shift builder for which hours to post. The factory
    roster already comes through `_factories()` walking `scheduleDays`.
- **Plan placement state.** Per factory site:
  - Machines placed, by recipe or workstation.
  - Running = a recipe and someone posted at some hour.
  - `_factories()` already has `unnamed`, `idle` and `gaps`; count placed vs running from
    the same walk.

### Board script

- **Tabs.** `SUPPLY_VIEWS`, `drawStock()`, `drawLogistics()` and the `#importPlan`,
  `#topupPlan` and `#stock` hosts become three tab builders. `supplyHead()`,
  `supplySorted()`, `supplySortNote()` and `wireSupplySort()` (PR #34) are kept per table;
  `supplyLocation()` becomes the object block.
- **Checklist.** `buildOrderChecklist()` stays the single source of change rows and keys.
  `drawOrderChecklist()` becomes the strip. `orderChecklistText()`, `reconcileOrderMarks()`,
  `importSetting()`, `impSetEdits()` and `impSetKeep()` stay.
- **Groups.** A group row carries `data-kids`; its rows `data-kid`. A click toggles them.
  Ticks inside a closed group still count.
- **Sizing switch.** `factorySizing` in `"247"|"demand"`, read on load. Every sized figure
  (import levels, top-ups, line hours, verdicts, staffing card) reads the chosen set. The
  checklist keys include the proposed figure, so switching sizing gives new rows, and old
  ticks reconcile away as they do today.
- **Staffing for factory lines.** A new block under the factory objects on the Factories tab.
  "Staffing on its page ›" opens the factory's site page (`openSite()`), where a matching
  Staffing block would follow later (not drawn).
- **Goods flow (option A).** `drawFlow()` renders inside the active tab when the diagram
  view is on. A node click switches back to the list, opens that object and lights it.
  `drawFlowDetail()` goes. The `SUBS.supply` items become shops, warehouses, factories.
- **Findings.** `SEC_PAGE` gets the new section ids in place of `secLogistics`, `secStock`
  and `secFlow`. `ALERT_LINKS` routes as follows:
  - shortfall, order, paused → warehouses
  - outruns, unplanned → shops
  - dead, target → the tab of the site's kind
  - feed, staff, unnamed, unset → factories

  `goToAlert()` sets the tab, switches to Everything when the row is not a change, opens the
  object and any group holding the row, adds `.sb-arrived` and shows the crumb.
- **Plan a chain.** `drawPlan()` gains:
  - The **Built at** factory picker (existing factories plus "a new factory").
  - The placed/running squares from the plan placement state.
  - **Save as plan**, which stores `{factory, type, counts, targets, savedDay}`. Supply's
    builders then treat those inputs as planned: status *new*, reason "ordered ahead · plan:
    …", and the target raise as a change row.
  - The first fill: (opening day → next import) × the finished layout's daily use − depot
    stock, rounded up to 100. It is one checklist row of kind "Before the next delivery".
  - The plan clears when the placement walk shows every planned machine running.
- **Site pages.** The depot and factory blocks of `drawSite()` read the same `status`.
- **CSS.** The `sb-` classes from `SB_CSS`, plus the live `sp-rail`, `sp-m`, `sp-zz` and
  `sp-dot`. `order-*` goes once the checklist markup is gone.

### localStorage

- `ba_order_marks_v1:<character>`: keep the key and the internal `kind` strings, so the ticks
  carry over without migration.
- `ba_import_set_v2:<character>` and `ba_line_names`: unchanged.
- `ba_dash_supply` (remembered sub-view) maps old values to new ones: `orders` → the tab with
  the most changes, `checks` → shops, `map` → warehouses with the diagram on.
- New:
  - `ba_dash_supply_view` (list or diagram).
  - `ba_dash_factory_sizing` (`"247"` default, or `"demand"`): per device, as Peter asked,
    not per character.
  - `ba_dash_plans:<character>` (the saved plans).

### Tests likely affected

- Rewritten: `tests/import_routes.test.cjs`, `tests/import_setto.test.cjs` and
  `tests/supply_sort.test.cjs` (they use `#importPlan`, `#topupPlan`, `#stock`,
  `drawLogistics`, `drawStock`, `stockView`).
- Anchors to update: `tests/navigation.test.cjs` (`secStock`, `secLogistics`, `secFlow`),
  `tests/alert_kinds.test.cjs` (ALERT_LINKS views), `tests/site_panel.test.cjs` (depot and
  factory rows).
- Kept: `tests/order_checklist.test.cjs` (pure).
- Plan a chain: `tests/test_plan_orders.py` (`planOrder`) changes with the chain margin and
  the plan state.
- Python: `tests/test_import_routes.py`, `tests/test_import_catch_up.py`,
  `tests/test_line_order.py`.
- New tests:
  - The status field (one word per fact on every reader).
  - The route-demand sum (one-off fills excluded, one margin per chain, not per hop).
  - Both sizings.
  - The ramp extrapolation (a shop at 6 days is flagged, one at 7 is not).
  - Factory `workersNeeded`.
  - Second-tier depot rows.
  - The plan (placed vs running, *new* while saved, clearing when all run, the first fill).
