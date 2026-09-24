# Supply by object: notes for Peter

Canvas: https://claude.ai/artifact/RDRP5zWzzu9WgKHidzTei8 (generator `build_supply_canvas.py`;
never hand-edit `project/`). This is R13 of the UX audit of 24 Sep 2026, drawn with R8 (one
verdict per supply fact) and the vocabulary you approved. Nothing is ported yet.

## What the canvas proposes

- Supply has three tabs, one per object: **Shops** (every shelf against tomorrow's round),
  **Warehouses** (every depot, second tier included) and **Factories** (lines, their hours,
  Factory inputs). Each opens on **Needs a change**. **Everything** lists all rows.
- The change checklist is a tick at the head of each row. The figure to type sits in the
  column that holds the setting (Daily top-up, Order / top-up, Hours a day), as `now → set`.
  One strip under the tabs counts ticks across all three tabs (a truck drives to the
  warehouse), keeps **Copy remaining** and the reset, and each tab badge counts what is left
  to type there.
- Every row has one status word with a one-line reason. The same word is used on Today, on
  the site page and in Goods flow (artboard *One word per supply fact*).
- Weekly orders are demand-based: what the ends of the routes use (shop sales, other depots'
  draw, factory lines), summed along the routes to the importing depot, with one-off stock
  fills left out, plus a 12% margin, rounded up to 100. Hovering **Uses / week** lists the
  sites behind the figure (Paper Bag: 7 clothing shops via Clothing Distr., 7 jewelry shops
  via Jewelry Distrib.).

## Decisions for you

1. **Goods flow: A or B.** A makes it a diagram view of the tab you are on (a list/diagram
   pair beside Needs a change); clicking a site opens its rows, lit. B keeps it as a fourth
   tab, and its node detail becomes that object's own rows instead of *Held against need*.
2. **Rated or measured factory use (open).** Uses / week counts factory lines at their rated
   24/7 rate, tagged `rated`. At that rate, Fabric ×2, Metal Band and Uncut Gems (Cheap)
   cover their use but not the margin, so they read *tight* with a figure to raise. At
   measured use (fabric is about 46k and 54k a week, not 80,640) they would read *covered*.
3. **Margin.** The canvas uses one 12% for every line, rounded up to 100. Should the daily
   rounds get a margin too? The canvas sizes them to the busiest day, rounded up, with no
   margin, as the board does today.
4. **Tight has a second meaning.** It now also covers "covers the use, not the margin".
   Keep one word, or add a separate one?
5. **Idle rows with a figure count as changes.** Examples: the paper-bag top-ups at three
   jewelry shops (31 days of sales, set 1,200/700) and Metal Band at Jewelry Distrib.
   (5,000 → 0). Idle rows with nothing to type have no tick (the gym drinks at Import Hub,
   the 10 electronics levels). Is that the line you want?
6. **Factory hours.** "Needs N h a day" is what ships ÷ the line's rate. Only a line with
   too few hours gets a row and a tick (Jewelry (Cheap), 12 → 15 h). Overstaffing is one
   quiet "Run shorter?" strip (9 lines, about $4,000/day of wages, a rough estimate).
   Planning is still 24/7 by design unless you say otherwise.
7. **Vocabulary (R8).** Nine words: covered, tight, short, no plan, paused, stalled, idle,
   made here, new. *Stalled* replaces *not drawn*. *New* is for fewer than 3 days of log.
8. **Idle stock** is the one name for the view, the finding kind (today *Stock not moving*
   and *Top-up target too high*) and the status word *idle*. Please confirm.
9. **Tab badges** count settings to type, not advisories. A tab with none shows a tick.
10. **Crumb from a finding.** An arrival from Today lights the row and its object and shows
    "from Today · <kind>" with a clear button. Keep it, or light the row only?

## What disappears compared with today

Each row below either moves or goes; nothing is dropped silently.

| Today | In the canvas |
| --- | --- |
| Orders sub-tab: Change checklist | Tick column plus the one strip (progress, Copy remaining, reset) |
| Orders: Weekly imports table | Import rows on Warehouses. *Order now* and *Set order to* merge into Order / top-up (`now → [box]`); *Used / week* becomes *Uses / week*. The thin day-cover line under *At depot* is replaced by the 7-day rail |
| Orders: Daily top-ups table | Factory inputs on Factories |
| Checklist group by site with per-item reason paragraphs | Object blocks on Warehouses/Factories; the reason is the status line, the long form a tooltip. Shops are a flat table with a Shop column |
| Checklist kinds "Before the next delivery" (+N once) and "Check the delivery route" | Stay as row states: `+2,400 once` in the setting cell; status *stalled* |
| Loose rows "Choose a supplying depot" | A "No depot" block on Warehouses (not drawn: none on this save) |
| "N recipes to name" link | The unnamed rows on Factories, same `linepick` select (none on this save) |
| Checks sub-tab and its 5 views | Before the drop → Shops; Before the import → Warehouses; Idle stock → status *idle* in the owning tab; Factory lines and Feed the factories → Factories |
| **One list of all idle holdings across sites** | **Lost as a single list.** Everything plus sorting by Status brings the idle rows together per tab. Say if you want a filter chip for it |
| Factory lines: *Top-up out* and export columns | Moved into the line's sub-line (not drawn) |
| Feed the factories: *Import / week* and "all factories" need | Lives on the Import Hub row; the input row links there |
| Goods flow: *Held against need* with its own verdicts | Option A: gone (the node opens the tab rows). Option B: the node detail is the object's rows, the same words |
| "Stock checks" heading, per-view `?` notes | One verdict sentence per tab |
| Today's static "Plan imports" card | Should show a live count and open the tab with the most changes (R15) |

## Seeded states

The figures are from HART. YT, day 73. Five states are seeded so every verdict shows:

- [LM] HART. Jewelry, Jewelry (Cheap): Friday peak 162 (real 126).
- Clothing Distr., Paper Bag top-up 2,000 (real 5,000).
- Factory Jewelry, Jewelry (Cheap): rostered 12 h a day (real 24).
- Factory Jewelry, Uncut Gems (Expensive): top-up 600 (real 750).
- Import Hub, Uncut Gems (Expensive): Smart Delivery level 4,800 (real 5,100).

The second-tier depots' draw is the sum of their shops' sales. `depotOther` carries the
same-day netting defect from the supply audit, so it is not used.

## Porting map

Anchors are in `ba_dashboard.py` unless noted. Land it after R8 and the supply-audit fixes
(`supply-audit-fixes`).

**Python (payload).**
- R8: one `status` per (site, item), `{word, why, tip}`, on every row of `D.supply.shops`,
  `D.supply.imports`, `D.supply.idle` and the factory `needs`, computed in `_supply()` /
  `_factories()`. Line status goes on `lines`.
- A new `D.supply.depots` holds every depot line, first and second tier: on hand, draw/day
  (by destination, the supply-audit defect 1 fix), busiest day, the sender and its top-up
  target, uses/week, status. Today `imports` only covers depots with an import (#78).
- Uses / week per import line: the sum of end demand along the routes, one-off fills
  excluded, plus a breakdown `useParts: [{site, via, perWeek, basis: "sales"|"rated"}]`
  and the margin. `importSetting()`'s `total` becomes this figure.
- Factory lines: `needHours` = ceil(ships/day ÷ (rate × machines)), `hoursDay` =
  hoursWeek/7, and the `produceUpTo` limit (supply-audit defect 3).

**Board script.**
- `SUPPLY_VIEWS`, `drawStock()`, `drawLogistics()` and the `#importPlan`, `#topupPlan` and
  `#stock` hosts are replaced by three tab builders: shops, warehouses, factories.
  `supplyHead()`, `supplySorted()`, `supplySortNote()` and `wireSupplySort()` (PR #34) are
  reused per table. `supplyLocation()` becomes the object block.
- `buildOrderChecklist()` stays the single source of change rows and keys; a row is ticked by
  its key. `drawOrderChecklist()` becomes the strip (progress, copy, reset).
  `orderChecklistText()`, `reconcileOrderMarks()`, `importSetting()`, `impSetEdits()` and
  `impSetKeep()` stay.
- `SUBS.supply` items become shops, warehouses, factories (plus flow in option B).
  `SEC_PAGE` gains the new section ids in place of `secLogistics`, `secStock` and `secFlow`.
- `ALERT_LINKS` routes as follows:
  - shortfall, order, paused → warehouses
  - outruns, unplanned → shops
  - dead, target → the tab of the site's kind
  - feed, staff, unnamed, unset → factories

  `goToAlert()` sets the tab, switches to Everything when the row is not a change, opens
  the object, adds `.sb-arrived` and shows the crumb. `stockView` and `showAllStock` go.
- `drawFlow()` and `drawFlowDetail()` depend on option A or B. In both, the detail is built
  from the tab's row renderer.
- The site page's depot and factory blocks (`drawSite()`) read the same `status`.
- CSS: the `sb-` classes from `SB_CSS`, plus the live `sp-rail`, `sp-m` and `sp-zz`.
  `order-*` goes once the checklist markup is gone.

**localStorage.**
- `ba_order_marks_v1:<character>`: keep the key and the internal `kind` strings so the ticks
  carry over without migration. If a kind is renamed, map the old key's first element.
- `ba_import_set_v2:<character>` (typed Set to figures) and `ba_line_names`: unchanged.
- `ba_dash_supply` (remembered sub-view) maps old values to new ones: `orders` → the tab
  with the most changes, `checks` → shops, `map` → flow (B) or warehouses plus the diagram
  (A).
- The diagram toggle, if A: optional `ba_dash_supply_view`. Needs a change / Everything
  stays unpersisted, as `logisticsView` is today.

**Tests likely affected.**
- Rewritten: `tests/import_routes.test.cjs`, `tests/import_setto.test.cjs` and
  `tests/supply_sort.test.cjs` (they use `#importPlan`, `#topupPlan`, `#stock`,
  `drawLogistics`, `drawStock`, `stockView`).
- Anchors to update: `tests/navigation.test.cjs` (`secStock`, `secLogistics`, `secFlow`),
  `tests/alert_kinds.test.cjs` (ALERT_LINKS views), `tests/site_panel.test.cjs` (depot and
  factory rows).
- Should hold as they are: `tests/order_checklist.test.cjs` (`buildOrderChecklist`,
  `importSetting`, both pure).
- Python: `tests/test_import_routes.py`, `tests/test_plan_orders.py`,
  `tests/test_import_catch_up.py`, `tests/test_line_order.py`.
- New: a test for the status field (one word per fact, the same on every reader), the
  route-demand sum (one-off fills excluded) and the second-tier depot rows.
