# UI redesign: routes, aliases and interim targets

26 September 2026 · Established by chunk 1 of the [implementation plan](ui-implementation-plan.md).
The route ids below are fixed. Chunks 2 and 3 replace what a route shows, never its id or its
aliases. Code: `ROUTES`, `AREAS`, `REFS` and `HOST_ROUTES` in the board script
(`ba_dashboard.py`, section "the shell's routes"), and `FINDING_ROUTES` beside `ALERT_LINKS`.

## How the shell works

- **A route is the address.** `#overview`, `#supply/imports`, `#staffing/needs` and so on. The
  masthead lights the route's area and the row under it lights its view. Browser Back, Forward and
  a reload replay the route.
- **A host is what draws it today.** The old pages (`PAGES`: `today`, `company`, `supply`,
  `staffing`, `growth`, `map`, `wiki`) and their views (`SUBS`) are now hosts. Their DOM ids and
  `PAGE_DRAWS` tags are unchanged, so lazy and stale drawing and calm refresh work as before. The
  new `staffing` host (`#pageStaffing`) holds Schedules, Staff needs and Payroll.
- **A site's page keeps its address**, `#site/<slug>`. It stands under whichever route opened it:
  Businesses by default, or for example Staffing › Schedules when a schedule was opened from there.
  That route is stored in the history entry as `nxRoute`, so Back, Forward and a reload keep it.
- **Arrival.** A finding's action or a task in All tools stores why the reader came in the new
  entry's state (`nxArr`: what, position, way back). The strip under the area's row shows it with
  a way back. The Overview's own state when it was left (filters, "Show N more", open Details,
  the row and its screen position) is stored on the Overview's entry (`nxOv`). Returning through
  the strip is the browser's Back when the Overview is the entry right behind. Otherwise it is a
  new visit given that state. Either way the row is scrolled to where it stood and outlined for a
  moment. A row gone with the latest numbers is reported, not faked.
- **Area entry.** A click on an area opens the view last shown in it during this visit, or its
  first view. The first view of Supply is Changes. An explicit task or finding always opens its
  own view.
- **Supply scope.** The Shops / Warehouses / Factories tabs remain, labelled *Scope*. A Supply
  route names the scopes it is read on (`scopes`). Changes and Goods flow keep their route on any
  scope. Imports is read on Warehouses and Factories, Deliveries on Shops and Warehouses,
  Production on Factories. Picking another scope switches the route in place. Chunk 2 turns this
  into the final scope control.

## Canonical routes and their interim targets

| Route | Area › view | Interim target (chunk 1) | Scope, filter or row exposed | Final presentation |
| --- | --- | --- | --- | --- |
| `overview` | Overview | `today` host: `#kpis`, `#alertSection` (redrawn), `#secMoves` (All tools) | Needs attention first; critical rows expanded, 5 more, then "Show N more" | Chunk 1 (final) |
| `businesses/results` | Businesses › Results | `company/results`: `secDaily`, `secPortfolio`, site pages `secDetail` | Portfolio P&L; a site's page when one is open | Chunk 3 |
| `businesses/prices` | Businesses › Products & prices | `company/products`: new `secPrices` (a shop's shelves, price guides) and `secProducts` | Each shop opens its own page on `#sp-shelves`; each owned type opens its guide's prices | Chunk 3 |
| `businesses/standards` | Businesses › Standards | `company/standards`: new `secStandards` (four subjects), then `secPortfolio` in Operations | Portfolio switched to Operations; a subject opens the first business on its block | Chunk 3 |
| `businesses/milestones` | Businesses › Milestones | `company/milestones`: `secGoals` | – | Chunk 3 |
| `supply/changes` | Supply › Changes | `supply` host, list mode, the tab with the most still to type; lands on `#sbStrip` (the checklist) | Change checklist with Copy remaining and ticks | Chunk 2 |
| `supply/imports` | Supply › Imports | `supply/warehouses` (Weekly imports, Set to boxes); factory-own contracts on the Factories scope | Scope Warehouses or Factories; a finding lights its row (`sbLand`) | Chunk 2 |
| `supply/deliveries` | Supply › Deliveries | `supply/shops` (shelves, top-ups, wholesale); depot top-ups on the Warehouses scope | Scope Shops or Warehouses; a finding lights its row | Chunk 2 |
| `supply/production` | Supply › Production | `supply/factories` (lines, hours, inputs, `#sbStaff` factory staffing) | Scope Factories | Chunk 2 |
| `supply/flow` | Supply › Goods flow | The tab on screen in diagram mode (`svg#flow`, `#flowChain` when narrow) | The scope on screen | Chunk 2 |
| `staffing/schedules` | Staffing › Schedules | new `secSchedules`: every shop and office with its plan's state; each opens its page on `#sp-roster`. Factories open Supply › Production | The shop a task or search named is lit (`schedPick`) | Chunk 2 |
| `staffing/needs` | Staffing › Staff needs | new `secNeeds`: staff demands (`#nxDemands`) and hiring for plans (`#nxHire`); each opens the crew or the schedule | – | Chunk 2 |
| `staffing/payroll` | Staffing › Payroll | `staffing/payroll`: `secPayroll` (moved from Company) | – | Chunk 2 |
| `expansion/demand` | Expansion › Demand | `growth/market`: `secMarket` | – | Chunk 3 |
| `expansion/finder` | Expansion › Find a location | `map` host with the finder on (`openFinder()`, retail by default or the cell's preset) | Finder filters and saved searches as before | Chunk 3 |
| `expansion/factory` | Expansion › Plan a factory | `growth/plan`: `secPlan`, `secIngredients` | – | Chunk 3 |
| `map` | City map (reference) | `map` host | Finder as the reader left it | Chunk 3 |
| `wiki` | Game guide (reference) | `wiki` host; `#wiki/<page>` is still the wiki's own route | – | Chunk 3 |
| `#site/<slug>` | a business's page | `company/results` + `secDetail` | Under the route that opened it (`nxRoute`) | Chunk 3 |

## Old addresses that still land

| Old hash | Lands on |
| --- | --- |
| `#today` | `overview` (the hash is kept as typed) |
| `#company`, `#results` | `businesses/results` |
| `#growth` | `expansion/demand` (or Plan a factory if that was the Growth view last used) |
| `#supply` | the Supply area entry: `supply/changes` on the first visit |
| `#businesses`, `#staffing`, `#expansion`, `#overview` | the area's entry |
| `#guide` | `wiki` |
| `#secDaily`, `#secPortfolio`, `#secDetail`, `#secRhythm` | Businesses › Results (`SEC_PAGE`, `SEC_MOVED`) |
| `#secProducts` | Businesses › Products & prices |
| `#secGoals` | Businesses › Milestones |
| `#secPayroll` | Staffing › Payroll (moved from Company) |
| `#secShops`, `#secStock` | Supply › Deliveries (Shops scope) |
| `#secWarehouses`, `#secLogistics`, `#secFlow` | Supply › Imports (Warehouses scope) |
| `#secFactories` | Supply › Production |
| `#secMarket` / `#secPlan`, `#secIngredients` | Expansion › Demand / Plan a factory |
| `#alertSection`, `#secMoves` | Overview |
| `#site/<slug>`, `#wiki/<page>` | unchanged contracts |

A remembered `ba_dash_page` still works. A load with no hash opens the route last shown
(`ba_dash_route`).

## Every finding kind's route

The action button names the fix. The route is the final home from
[the structure proposal](ui-structure-proposal.md#7-every-finding-still-has-a-destination). The
landing is today's `ALERT_LINKS` / `ALERT_EVIDENCE`, which is the interim target.

| Kind (`group`) | Action | Route | Interim landing |
| --- | --- | --- | --- |
| `notrading` | Open readiness | `businesses/results` | its page, tiles block |
| `vacant` | Review costs | `businesses/results` | `secPortfolio` |
| `loss` | Review results | `businesses/results` | its page, tiles block |
| `trend` | Review results | `businesses/results` | its page, profit block |
| `atcap` | Review customer hours | `businesses/results` | its page, hours block |
| `staff` at a factory | Plan factory hours | `supply/production` | Factories scope, the machine's row |
| `staff` at a shop or office | Review schedule | `staffing/schedules` | its page, `#sp-roster` (was the Factories tab, which had no row for it) |
| `idlestaff` | Review schedule | `staffing/schedules` | its page, hours block, idle hours lit |
| `satisfaction` | Review satisfaction | `businesses/standards` | its page, standards block |
| `promotion` | Review promotion | `businesses/standards` | portfolio in Operations |
| `uniform` | Review uniforms | `businesses/standards` | its page, standards block; game-link uniform write in the row unchanged |
| `bathroom`, `toiletprivacy`, `sink`, `music`, `interior` | Review amenities | `businesses/standards` | its page, standards block, the amenity lit |
| `jobdemand` | Resolve staff demand | `staffing/needs` | its page, crew block |
| `companydemand` | Resolve staff demand | `staffing/needs` | the site that shows it most (`ALERT_SITE_PICK`), crew block; else Payroll |
| `hype` | Review demand wave | `expansion/demand` | `secMarket` |
| `unplanned`, `outruns` | Review delivery | `supply/deliveries` | Shops scope, the shelf's row |
| `topup` | Review delivery | `supply/deliveries` | the depot's page, stock row |
| `wholesale` | Review delivery | `supply/deliveries` | its page, shelves or stock row |
| `target` | Review target | `supply/deliveries` | the site's scope, its row |
| `dead` | Review idle stock | `supply/deliveries` | the site's scope, its row |
| `notrouted` | Review routes | `supply/deliveries` | the site's scope, its row |
| `shortfall` | Review import | `supply/imports` (route-fed: `supply/deliveries`) | the site's scope, its row |
| `order`, `paused` | Review import | `supply/imports` | the site's scope, its row |
| `feed` | Review factory input | `supply/production` | Factories scope, the input's row |
| `unnamed`, `unset` | Identify recipe | `supply/production` | Factories scope |

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
| Staffing | See whom to hire | `staffing/needs`, at `#nxHire` | – |
| Staffing | Resolve staff demands | `staffing/needs`, at `#nxDemands` | staff-demand findings |
| Businesses | Compare business profits | `businesses/results` | – |
| Businesses | Check prices and product sales | `businesses/prices` | – |
| Businesses | Improve customer satisfaction | `businesses/standards` | standards findings |
| Expansion | Find a suitable location (`#findLocationCard`) | `expansion/finder`, retail | vacant units (`drawFindLocation`) |
| Expansion | Plan a new factory | `expansion/factory` | – |
| Expansion | Explore market demand | `expansion/demand` | – |

Next moves and the Ask the board row are gone from the Overview (E15, E16). Their three live
cards are rows here under the same ids. The seven questions are still the search palette's
empty state.

## Adding a route

Add it to `ROUTES` (and its view to its area in `AREAS`), a `HOST_ROUTES` entry if a host view
shows it by default, `routeViewLabel()`, and this table. A new host section still follows
[Registries](architecture.md#registries). `tests/navigation.test.cjs` and
`tests/shell_routes.test.cjs` hold the tables to each other.
