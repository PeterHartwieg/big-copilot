# UI redesign: routes, aliases and interim targets

26 September 2026 · Established by chunk 1 of the [implementation plan](ui-implementation-plan.md),
revised the same day for the merge of PR #121 (Staff hiring) and the chunk-1 correction pass, and
on 27 September for chunk 2, which gives Supply and Staffing their final presentations, and for
chunk 3, which gives Businesses, Expansion, the City map and the Game guide theirs. Every route
below now shows its final presentation.
The route ids below are fixed. Chunks 2 and 3 replace what a route shows, never its id or its
aliases. Code: `ROUTES`, `AREAS`, `REFS` and `HOST_ROUTES` in the board script
(`ba_dashboard.py`, section "the shell's routes"), and `FINDING_ROUTES` beside `ALERT_LINKS`.

## How the shell works

- **A route is the address.** `#overview`, `#supply/imports`, `#staffing/needs` and so on. The
  sidebar lights the route's area and, under it, its view; folded to its rail (or on a phone) the
  views are a row at the top of the page instead ([architecture.md](architecture.md), "The
  sidebar"). The sidebar only renders the routes: their ids, aliases and history are as below.
  Browser Back, Forward and a reload replay the route.
- **A host is what draws it today.** The old pages (`PAGES`: `today`, `company`, `supply`,
  `staffing`, `growth`, `map`, `wiki`) and their views (`SUBS`) are now hosts. Their DOM ids and
  `PAGE_DRAWS` tags are unchanged, so lazy and stale drawing and calm refresh work as before. The
  new `staffing` host (`#pageStaffing`) holds Schedules, Staff needs and Payroll. Staff needs is
  the one home of hiring: the staff demands (`secNeeds`), then main's Staff page (`secStaff`,
  issue #89) as it shipped. Payroll stays its own view.
- **A site's page keeps its address**, `#site/<slug>`. It stands under whichever route opened it:
  Businesses by default, or for example Staffing › Schedules when a schedule was opened from there.
  That route is stored in the history entry as `nxRoute`, so Back, Forward and a reload keep it.
- **Arrival.** A finding's action or a task in All tools stores why the reader came in the new
  entry's state (`nxArr`: what, position, way back). The strip at the top of the page shows it with
  a way back. The Overview's own state when it was left (filters, "Show N more", open Details,
  the row and its screen position) is stored on the Overview's entry (`nxOv`). Returning through
  the strip is the browser's Back when the Overview is the entry right behind. Otherwise it is a
  new visit given that state. Either way the row is scrolled to where it stood and outlined for a
  moment. A row gone with the latest numbers is reported, not faked.
- **Area entry.** A click on an area opens the view last shown in it during this visit, or its
  first view. The first view of Supply is Changes. An explicit task or finding always opens its
  own view.
- **Supply scope.** Shops, warehouses and factories are no longer views: each Supply view has a
  *Scope* select (`sbScope`: the whole company, every site of a kind, or one site) and a
  Needs a change / Everything switch (`sbMode`). Both, with the reviewed import line and the
  site Goods flow follows, ride on the history entry (`nxSb`), so Back, Forward and a reload give
  a view back as it was left.

## Canonical routes and their interim targets

| Route | Area › view | Interim target (chunk 1) | Scope, filter or row exposed | Final presentation |
| --- | --- | --- | --- | --- |
| `overview` | Overview | `today` host: `#kpis`, `#alertSection` (redrawn), `#secMoves` (All tools) | Needs attention first; critical rows expanded, 5 more, then "Show N more" | Chunk 1 (final) |
| `businesses/results` | Businesses › Results | `company/results`: `secDaily` (Company results: the chart, By weekday), `secFinance` (Company finances: cash beside profit, loans, how far back history reaches; `drawFinance()`), `secPortfolio` (by chain, company costs outside sites), site pages `secDetail` | Portfolio P&L; a site's page when one is open | Chunk 3 (final) |
| `businesses/prices` | Businesses › Products & prices | `company/products`: `secPrices` (`drawPriceShops()`: a chip a shop or office, the picked one's prices beside the lowest market price in its neighbourhood and its average sold price, its guide's Prices in your save, its shelves on its page), then `secProducts` (Sales across the company) | The business on screen (`bzPriceLit`), kept on the history entry (`nxPrice`); a task's pick (`o.pick`) | Chunk 3 (final) |
| `businesses/standards` | Businesses › Standards | `company/standards`: `secStandards` (the four subjects, then Business by business: `stdTable()`, satisfaction against the 80 line, promotion, amenity lamps, uniforms with the uniform write and its progress), then `secPortfolio` in Operations | A name opens its page on `#sp-standards` under this route; Results gets its own portfolio view back | Chunk 3 (final) |
| `businesses/milestones` | Businesses › Milestones | `company/milestones`: `secGoals` (Career goals with bars, Career totals) | – | Chunk 3 (final) |
| `supply/changes` | Supply › Changes | `secChanges` (`drawChangesView`): the one change checklist, grouped Imports, Deliveries, Production, with the truck's road, Copy remaining, the copied text's preview, Apply N import amounts (game link), Clear my marks and the basis | Each row's state: Marked by you, Applied · awaiting refresh, Confirmed ([postconditions](ui-progress-postconditions.md)) | Chunk 2 (final) |
| `supply/imports` | Supply › Imports | `secImports` (`drawImportsView`): the reviewed line's card (recurring order and one-time catch-up apart, Why, manual steps, Copy, Preview in the game, the factory hours it is planned on), then every import line, depots' and factories' own | Scope; Needs a change / Everything; the reviewed line (`sbSel`); a finding lights its row and card (`sbLand`) | Chunk 2 (final) |
| `supply/deliveries` | Supply › Deliveries | `secDeliveries` (`drawDeliveriesView`): by destination: shops' shelves and top-ups, second-tier warehouses (route-fed top-ups, wholesale, idle, not routed), factory inputs | Scope; Needs a change / Everything; a finding lights its row | Chunk 2 (final) |
| `supply/production` | Supply › Production | `secProduction` (`drawProductionView`): machine-hour tiles, each factory's lines, hours and inputs, then factory staffing (`#sbStaff`) | Scope; Needs a change / Everything | Chunk 2 (final) |
| `supply/flow` | Supply › Goods flow | `secFlow` (`drawFlowView`): the picture (`svg#flow`, `#flowChain` when narrow), the site it follows and its panel; Table goes back to the view the reader came from | The followed site (`flowPickId`) | Chunk 2 (final) |
| `staffing/schedules` | Staffing › Schedules | `secSchedules` (`drawSchedules`): every shop and office in a list with its plan's state and progress, the chosen one's planner beside it (`#schDetail`: the same `spRosterBlock()` or `spOfficeRoster()`, and write, a business's page carries). An office's line counts the office default's staffed computers. Factories open Supply › Production on their scope | The business on screen (`schedLit`): a task's, a finding's, the search's or the reader's; kept on the history entry (`nxSch`) | Chunk 2 (final) |
| `staffing/needs` | Staffing › Staff needs | `secNeeds`: Unmet demands (`#nxDemands`), each opening the crew that shows it, and the last hire or move made from here with its state; then `secStaff`, main's Staff page under "Whom to hire": open places by role, candidates, Mass and Quick hire, hire and move review and write (no undo), office plans, staff with no hours ("Write their week" opens Schedules on the site), and its short current-staff summary | – | Chunk 2 (final) |
| `staffing/payroll` | Staffing › Payroll | `secPayroll` (`drawPayroll`): rate and booked tiles, roles, and the sites whose books part from their rates, each opening its crew | – | Chunk 2 (final) |
| `expansion/demand` | Expansion › Demand | `growth/market`: `secMarket` (market changes, By type / What I sell / Not yet) | A cell asks the finder its own question and is kept on Demand's entry (`nxDem`): Back or a reload rings its row and focuses the cell (`demArrive()`) | Chunk 3 (final) |
| `expansion/finder` | Expansion › Find a location | `map` host with the finder on, headed Find a location (`#mapHead`), its ways on under it (`#finderCtx`: the type's demand, its setup guide, Plan a factory). A task or a Demand cell asks a question (`openFinder(preset)`), the cell with an arrival that names its type and neighbourhood; the finder's switch on the City map is a new visit | Each visit keeps its own filters (`nxFs`, written by `saveFinder()`) and its picked building (`nxPick`): Back, Forward and a reload show the entry's own, so two cells' questions keep their own answers; a new visit keeps the filters on screen | Chunk 3 (final) |
| `expansion/open` | Expansion › Open a store | `growth/open`: `secOpen` (`drawOpenStore`): the four steps of a plan (what, where, investment, break even; until opening and open come with phases 3 and 4). A Demand cell's Open a store here starts a plan with its type and neighbourhood (`o.osType`, `o.osHood`) and an arrival back to the cell | The plans and the step on screen, per character in `localStorage` (`ba_open_store_v1:<character>`), not on the history entry | Phase 2 of docs/open-a-store-scope.md |
| `expansion/factory` | Expansion › Plan a factory | `growth/plan`: `secPlan`, `secIngredients` | – | Chunk 3 (final) |
| `map` | City map (reference) | `map` host, always with the finder off, headed City map. Reached with the finder on (the sidebar, Back from Find a location) it switches the finder off; the finder's switch opens Find a location as a new visit, and Back comes back here | – | Chunk 3 (final) |
| `wiki` | Wiki (reference; called the Game guide until 28 September 2026) | `wiki` host; `#wiki/<page>` is still the wiki's own route; opens with no save | – | Chunk 3 (final) |
| `#site/<slug>` | a business's page | `company/results` + `secDetail`: its findings, tiles, satisfaction, promotion, customers by hour, a Schedule summary (`spSchedSummary()`; the planner itself is Staffing › Schedules'), crew, shelves or fees, profit, its week; a depot's stock and feeds, a factory's lines and inputs. Its head carries the ways to its planners (`spActs()`): Schedule, Deliveries and Prices for a shop; Schedule and Fees for an office; Imports and Deliveries for a depot; Production for a factory, each with the business picked or in scope and the page as the way back | Under the route that opened it (`nxRoute`) | Chunk 3 (final) |

## Old addresses that still land

| Old hash | Lands on |
| --- | --- |
| `#today` | `overview` (`ROUTE_ALIASES`; the Overview's state is restored as on `#overview`) |
| `#payroll`, `#secPayroll` | Staffing › Payroll |
| `#staff`, `#secStaff` | Staffing › Staff needs, at the hiring page, scrolled past the staff demands (`ROUTE_ALIAS_INTO` for `#staff`, `SEC_PAGE` for `#secStaff`; both were main's Company › Staff, issue #89) |
| `#company`, `#results` | `businesses/results` |
| `#growth` | `expansion/demand` (or Plan a factory if that was the Growth view last used) |
| `#supply` | the Supply area entry: `supply/changes` on the first visit |
| `#businesses`, `#staffing`, `#expansion`, `#overview` | the area's entry |
| `#guide` | `wiki` |
| `#secDaily`, `#secPortfolio`, `#secDetail`, `#secRhythm` | Businesses › Results (`SEC_PAGE`, `SEC_MOVED`) |
| `#secProducts` | Businesses › Products & prices |
| `#secGoals` | Businesses › Milestones |
| `#secShops`, `#secStock` | Supply › Deliveries |
| `#secWarehouses`, `#secLogistics` | Supply › Imports |
| `#secFactories` | Supply › Production |
| `#secFlow` | Supply › Goods flow |
| `#sbStrip` | Supply › Changes |
| `#secMarket` / `#secPlan`, `#secIngredients` | Expansion › Demand / Plan a factory |
| `#alertSection`, `#secMoves` | Overview |
| `#site/<slug>`, `#wiki/<page>` | unchanged contracts |

A remembered `ba_dash_supply` of an old tab opens the view that took its place: `shops` and
`checks` Deliveries, `warehouses` Imports, `factories` Production, `map` Goods flow, `orders`
Changes, and any of them Goods flow where the diagram was the last mode shown (`SUPPLY_WAS`).

A remembered `ba_dash_page` still works. A load with no hash opens the route last shown
(`ba_dash_route`). A device that remembered Company on Payroll or Staff (`ba_dash_company`)
opens Staffing on Payroll or Staff needs instead, once, without overwriting a Staffing view or
a route it already remembers.

## Every finding kind's route

The action button names the fix. The route is the final home from
[the structure proposal](ui-structure-proposal.md#7-every-finding-still-has-a-destination). The
landing is `ALERT_LINKS` / `ALERT_EVIDENCE`; every landing is final since chunk 3.

| Kind (`group`) | Action | Route | Landing |
| --- | --- | --- | --- |
| `notrading` | Open readiness | `businesses/results` | its page, tiles block |
| `vacant` | Review costs | `businesses/results` | `secPortfolio` |
| `loss` | Review results | `businesses/results` | its page, tiles block |
| `trend` | Review results | `businesses/results` | its page, profit block |
| `atcap` | Review customer hours | `businesses/results` | its page, hours block |
| `staff` at a factory | Plan factory hours | `supply/production` | Production, the machine's row. A factory is known by its kind of site (`sbTabOf()`), or without the supply facts by the finding's machine (`ev.slot`) or the site's type (`ovAtFactory()`) |
| `staff` at a shop or office | Review schedule | `staffing/schedules` | Schedules with the business picked, its planner beside the list and the finding named above it |
| `idlestaff` | Review schedule | `staffing/schedules` | Schedules with the business picked; its customer hours one link away, on its page |
| `satisfaction` | Review satisfaction | `businesses/standards` | its page, standards block |
| `promotion` | Review promotion | `businesses/standards` | Standards: the subjects, the business-by-business comparison and the portfolio in Operations (`reveal()` takes the route's view when the section is on it); Results gets back the portfolio view it had |
| `uniform` | Review uniforms | `businesses/standards` | its page, standards block; the game-link uniform write in the row and on Standards, its progress pill beside the finding (chunk 3) |
| `bathroom`, `toiletprivacy`, `sink`, `music`, `interior` | Review amenities | `businesses/standards` | its page, standards block, the amenity lit |
| `jobdemand` | Resolve staff demand | `staffing/needs` | its page, crew block |
| `companydemand` | Resolve staff demand | `staffing/needs` | the site that shows it most (`ALERT_SITE_PICK`), crew block; else Staff needs (`secNeeds`) |
| `hype` | Review demand wave | `expansion/demand` | `secMarket`, the wave among the market changes; the shop's page carries its exposure (`spHypeRow`) |
| `unplanned`, `outruns` | Review delivery | `supply/deliveries` | Deliveries, the shelf's row, lit |
| `topup` | Review delivery | `supply/deliveries` | Deliveries, the depot's row, lit (the depot's page still lights its stock row from its own findings) |
| `wholesale` | Review delivery | `supply/deliveries` | Deliveries, the shop's or depot's row, lit |
| `target` | Review target | `supply/deliveries` | Deliveries, its row |
| `dead` | Review idle stock | `supply/deliveries` | Deliveries, its row (Everything where the row is no change) |
| `notrouted` | Review routes | `supply/deliveries` | Deliveries, its row |
| `shortfall` | Review import | `supply/imports`; route-fed (key `f.shortfall.route` or `f.shortfall.route.…`, nothing else): `supply/deliveries` | the route's view, its row; on Imports the line's card too |
| `order`, `paused` | Review import | `supply/imports` | Imports, the line's card and row |
| `feed` | Review factory input | `supply/production` | Production, the input's row |
| `unnamed`, `unset` | Identify recipe | `supply/production` | Production, the factory |

When a landing ends on a page the route cannot show (a factory row for a delivery kind), the
shell shows the page's own route. It never shows a route that is not on screen.

## The thirteen tasks (All tools)

| Group | Task | Route | Count beside it |
| --- | --- | --- | --- |
| Supply | Calculate import amounts (`#planImportsCard`) | `supply/imports` | the checklist's own badge (`paintPlanImports`) |
| Supply | Set delivery targets | `supply/deliveries` | delivery findings on the list |
| Supply | Plan factory running hours | `supply/production` | production findings, or "no factory yet" |
| Supply | Trace goods through the company | `supply/flow` | – |
| Staffing | Build shop schedules (`#optimizeStaffingCard`) | `staffing/schedules`, the named shop lit | the plan's badge (`drawOptimizeStaffing`) |
| Staffing | See whom to hire | `staffing/needs`, at `#secStaff` (the hiring page) | – |
| Staffing | Resolve staff demands | `staffing/needs`, at `#nxDemands` | staff-demand findings |
| Businesses | Compare business profits | `businesses/results` | – |
| Businesses | Check prices and product sales | `businesses/prices` | – |
| Businesses | Improve customer satisfaction | `businesses/standards` | standards findings |
| Expansion | Find a suitable location (`#findLocationCard`) | `expansion/finder`, retail | vacant units (`drawFindLocation`) |
| Expansion | Plan a new factory | `expansion/factory` | – |
| Expansion | Explore market demand | `expansion/demand` | – |

Next moves and the Ask the board row are gone from the Overview (E15, E16). Their three live
cards are rows here under the same ids. The seven questions are still the search palette's
empty state. "Whom should I hire?" lands on Staffing › Staff needs at the hiring page (open
places and candidates), with the answer strip's way back to where it was asked; it used to open
one shop's Staffing under Businesses › Results.

## PR #121 staffing and hiring rows (H01–H07)

The structure proposal's ledger gained seven rows for Staff hiring. Chunk 1 gives each a route
and keeps main's presentation and writes exactly as merged; chunk 2 owns their final
presentation.

| Row | Capability | Route in chunk 1 | Reached from | Chunk-1 host, unchanged from main |
| --- | --- | --- | --- | --- |
| H01 | Open places by role, bench and spare-staff netting | `staffing/needs` | Staffing's row; All tools › See whom to hire; search "Hiring"; `#staff`, `#secStaff` | `secStaff`, `drawStaff()` |
| H02 | Candidates, filters and picks | `staffing/needs` | as H01 | `secStaff` and a role's sheet of candidates (`#hsSheet`, Change picks) |
| H03 | Mass hire and Quick hire | `staffing/needs` | as H01 | `secStaff`: Mass hire over the plans, the Quick hire form (`hqModel()`) |
| H04 | Hire and move preview, confirm, refusal, partial result, re-read; no undo | `staffing/needs` | as H01 | `dialog.hr-wide` over `secStaff`, `/write/hire` (`docs/game-link-api.md`) |
| H05 | Staff with no hours | `staffing/needs`; a business's page, crew block | as H01; a staff finding | `secStaff`; `#sp-crew` |
| H06 | Office planning and additive schedule writes | `staffing/schedules` | Schedules › an office; `staff` findings at an office; the office's page, Schedule | Staffing › Schedules, `#sp-roster` (`spOfficeRoster()`; since chunk 3 the one place it is drawn), and the multi-site write |
| H07 | Factory and source-site effects of hire requests | `staffing/needs`, then `supply/production` | the hire review names the sites it changes; Schedules › Factories › Open Production | `secStaff` review; `drawFactoryStaffing()` on Supply › Production |

## Adding a route

Add it to `ROUTES` (and its view to its area in `AREAS`), a `HOST_ROUTES` entry if a host view
shows it by default, `routeViewLabel()`, and this table. A new host section still follows
[Registries](architecture.md#registries). `tests/navigation.test.cjs` and
`tests/shell_routes.test.cjs` hold the tables to each other; `tests/staff_hire.test.cjs` opens
the hiring page on its route.

## Chunk 3 (27 September 2026)

- **One planner.** A business's own page no longer draws the schedule planner. It carries a
  summary (`#sp-sched`: the plan's state and progress, its staffing findings) and "Open its week in
  Staffing › Schedules", which opens Schedules with the business picked. The planner keeps its id,
  `#sp-roster`, on Schedules (`#schDetail`); `#schRoster` is gone. A staff finding's landing on a
  site's page (`nxStaffInto()`) is `#sp-sched`, else `#sp-crew`.
- **City map against Find a location.** `#map` is always the plain map; the finder is only
  `expansion/finder`. The finder's switch opens the other route as a new visit, so Back undoes it.
- **Per-visit state:** the finder's filters (`nxFs`) beside its pick (`nxPick`); Demand's cell on
  its own entry (`nxDem`); the prices' business (`nxPrice`).
- **Utilities.** Preferences and Help & feedback are sheets over the board (`pxOpen()`), from the
  sidebar's ··· (on the hosted board, its save-source menu), no longer a scroll to the footer. Company finances links to
  Preferences' History row (`data-open-prefs`).
