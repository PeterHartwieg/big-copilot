# Supply › Plans & contracts: design notes

Canvas: https://claude.ai/artifact/Jr4kSCLZhxqQkWQ7Kv3yuZ (Design type). Generator:
`build_supply_roles_canvas.py`. Never hand-edit `project/`. `--preview` writes plain HTML to
`_preview/` (both themes) for screenshots; do not commit `_preview/` (not in `.gitignore`;
`project/` is). The Artifact tool refuses a root inside the worktree: publish from a scratchpad
copy of `project/`. Like `mockup/secondary-products`, the generator reads the board's real
stylesheet from `template/board.html`; new classes are `sr-` (unused on the board).

Peter, 10 Oct 2026: every Logistics Manager's and Purchasing Agent's configuration in one view.
All names are invented (company BRIGHTWELL); the shape follows three real saves: 12 managers
(5 factory plans, two with a pier export stop), 0–16 destinations, 8 contracts of 14–18
products, 122 product lines. The board's day is 333, a Thursday (day 1 is a Monday).

Round 2 (11 Oct 2026) applied the Opus review of round 1; its decisions are folded in below.

## Artboards

- **A · Main**: the view, every row closed, with the open-question markers (dashed blue `Qn`
  chips: a drawn default that is still open).
- **B1 · OpenManager**: a 16-destination plan opened (8 shown, "Show all 16"), stop 4 opened: a
  second-tier warehouse with 26 minimum stock amounts, all listed in two columns.
- **B2 · OpenAgent**: an 18-product contract opened (10 shown, "Show all 18").
- **C · Problems**: every role-level flag at once; Thread Depot's plan opened.
- **D1 · Empty**, **D2 · Small** (1 manager, opened by default; 2 agents, one a finished
  one-time delivery).
- **E · Links**: links out (site page, map, Goods flow, Deliveries/Imports rows) and in (Goods
  flow cards, Imports/Deliveries heads, site page Feeds, the arrival with its crumb). New links
  are outlined green.

All artboards are interactive (rows and stops open, Show all) and have the `dark` Tweak.

## Decisions

1. **A new Supply view**, second (default, Q2): Changes · **Plans & contracts** (default, Q1) ·
   Imports · Deliveries · Production · Goods flow. Route `supply/roles`, section `secRoles`.
2. **Nav badge counts only the new role-level flags** (table below). Existing Imports/Deliveries
   findings show on the rows but are counted on their own views.
3. **Two tables, one row per role**, in game order (default, Q7). Managers split by source kind
   with a part row carrying the time ("From warehouses · daily 02:00", "From factories · daily
   08:00"), so no time column. Managers with no plan go under a "No plan" part.
4. **Details on demand**: a row opens in place. A plan: the vehicles line, then the stops in
   delivery order, 8 shown, "Show all N". An opened stop lists **every** minimum stock amount
   (real stops reach 33): one column up to 12, two columns above. Sorted by amount (default, Q8).
   A Status column appears only when the stop has a finding. A contract: the importer line (next
   delivery and the order deadline), then its products, 10 shown, "Designated warehouse" printed
   only when it changes from the row above.
5. **Destinations and vehicles**: the cell shows the stop count with "vehicles reach N" under it.
   The game caps destinations by skill AND vehicles; the skill table and which stops get cut are
   unverified, so the board never claims a stop gets nothing. Over the reach: one chip only,
   "10 stops · vehicles reach 8", no cut line, no per-stop mark. Skill limit not drawn (default, Q9).
6. **Skill shown only where it differs** from the rest (all 100% here; "skill 85%", "skill 80% ·
   −20% on prices"). No wage (default, Q6).
7. **Pier exports**: a factory plan stop at a pier is tagged "export" and its table has one figure,
   "Deliver up to". Delivers-to reads "10 Pier export".
8. **Next delivery per contract**, from `nextDeliveryDay`: "Day 337 · Mon"; opened: "next delivery
   Day 337 · Mon 08:00 · order by Day 336 · Sun 20:00" (the deadline's weekday from day − 1). Paused,
   finished or with no agent: "—" and "no delivery coming".
9. **Importer kinds**: one kind per contract. Retail importers (3, 4, 6, 8 Pier) deliver to
   depots; raw-goods importers (1, 2, 5, 9 Pier) to factories. Importers are named by pier
   (default, Q3).
10. **Toolbar**: the scope select only, as the other Supply views. Hidden in the empty state.
11. **Empty state**: "No Logistics Manager yet · Delivery plans: BizMan › Logistics Managers" and
    "No Purchasing Agent yet · Import contracts: BizMan › Purchasing Agents".
12. **No restating**: no Smart Delivery explanation, no time on the vehicles line, no repeated skill.

## Data per field

New payload key: **`supply.roles`** = `{managers: [...], agents: [...]}`. Built from the save,
before `_supply_plans()` merges competing targets. *existing* = read from keys the payload
already has.

| On screen | Save field | Payload |
| --- | --- | --- |
| Manager name, skill | `logisticsManagerPlans[].assignedEmployeeId` → `EmployeeInstances[]` (`ba:skill_logisticsmanager`) | new `managers[].who`, `.skill` |
| From | plan `targetAddress` (pick-up site), `isFactory` | new `managers[].src`, `.factory` |
| Daily at | fixed: warehouse 02:00, factory 08:00 | constant |
| Destinations, in order | `destinations[].deliveryTargetAddress` (shop, warehouse or pier) | new `managers[].dests[].site`, `.kind` (`shop`/`wh`/`pier`) |
| Minimum stock amount / Deliver up to | `destinations[].stockTargets[]` (`itemName`, `targetAmount`), as set | new `managers[].dests[].targets` |
| On hand, sells / day (shop), uses / day (depot) | | *existing* `supply.shops` / `supply.routed` rows |
| Vehicles, locations | source building `vehicleSlots[]` (`vehicleInstanceId`, `employeeDriverId`) + type | new `managers[].vehicles[]` `{type, driver}`; table `VEHICLE_LOCATIONS` (*existing* `openFactory.sites` covers factories/depots only) |
| Not seated | the employee's workstation seat (field to confirm, Q10) | new `managers[].seated`, `agents[].seated` |
| Idle manager | `Entities.LogisticsManager` employee in no plan | new `managers[]` with `src: null` |
| Factory with no manager | factory that is no plan's source | new `managers[]` with `who: null` |
| Agent name, skill, discount | `importPartnerships[].employeeInstanceId` → `EmployeeInstances[]`; 25% × skill/100 | new `agents[].who`, `.skill` |
| Importer | `importAddress` | new `agents[].pier` (`names.addr`, "3 Pier") |
| Delivery | `isTarget`, `isRepeatingOrder`, `isUrgentOrder`, `isActive` | new `agents[].smart`, `.repeating`, `.urgent`, `.active` |
| Next delivery | `nextDeliveryDay` (weekday = `(day − 1) % 7` from Monday) | new `agents[].next` |
| Products | `products[]` `itemName`, `assignedWarehouse`, `amount`, `amountOrderedLastWeek` | new `agents[].products[]`, including those with no warehouse (today `_supply_imports()` drops them) |
| Uses / week | | *existing* `supply.imports` row |
| Idle agent | `Entities.PurchasingAgent` employee on no contract | new `agents[]` with `pier: null` |
| Finding chips | | *existing* findings, matched by site + item |

## Flags

Role-level flags (new; the only ones in the nav badge):

| Chip | Where | Rule | Class |
| --- | --- | --- | --- |
| `N stops · vehicles reach R` | manager row | stops > R; R = Σ locations of the source's vehicles with a driver (Freight Truck T1 8, Vord Courier D500 6, Vord V150 4, Mersaidi Dash 4, UMC Nunavut 4). Tip quotes the game's capacity warning | warn |
| `No destinations` | manager row | plan with 0 destinations | warn |
| `No plan` | manager row | Logistics Manager employee in no plan | warn |
| `Logistics Manager not assigned` (game text) | factory row | factory with no plan **and** something downstream needs its output (a depot or shop that sells what it makes). A warehouse with no plan stays silent (default, Q5) | bad |
| `Not seated` | manager or agent row | not seated at a Computer Workstation ("Only seated … can be accessed") (default, Q10) | warn |
| `Stop with no products` / `No products` | manager row / stop | destination with an empty `stockTargets` | warn |
| `One-time delivery` | Delivery cell, not a flag | `isRepeatingOrder` false (game text); "delivered" under it when `isActive` is false | — |
| `Purchasing Agent not assigned` (game text) | agent row | `employeeInstanceId` null, not found, or `isBeingReplaced`/`isReplaced` (`ImportWrite.NoAgent()`). The game cancels the order ("We couldn't find your Purchasing Agent …"), so Next delivery is "—" and the opened line says "no delivery coming" (default, Q4) | bad |
| `N with no designated warehouse` / `No designated warehouse` | agent row / product | `assignedWarehouse` empty (game: "One or more products has no assigned designated warehouse") | warn |
| `No contract` (game text) | agent row | Purchasing Agent employee on no contract | warn |

Paused (`isActive` false and `isRepeatingOrder` true) is not a role flag: the Delivery cell carries
"paused" under the mode, Next delivery is "—", and when the existing `paused` finding fires (still
needed) the row shows its chip "Import paused · in Imports", linked to Imports.

Existing findings (not counted here): on a stop or product, the finding's own kind label
("Outsells its top-up", "Depot top-up too low", "Top-up target too high", "Import shortfall",
"Weekly order too small", "Factory inputs"), item first on a stop ("Frozen Food · outsells its
top-up"); on the closed row one count chip, "2 in Deliveries" / "1 in Imports". Each links to
its row there (`sbLand()`).

## Wording (game text where the game has it)

| Where | Text |
| --- | --- |
| Nav / view | Plans & contracts |
| Group heads | Logistics Managers · 12 managers · 69 destinations · 593 products; Purchasing Agents · 8 agents · 8 contracts · 122 products |
| Manager columns | Logistics Manager · From · Destinations · Products · Delivers to · Status |
| Destinations cell | 13 / vehicles reach 16 |
| Vehicles line | Vehicles at Harbor Depot · Freight Truck T1 · Kai Rasmus 8 · = 16 locations · Follow in Goods flow; a slot with no driver: "Vord Courier D500 · No driver 0" (game: "No driver") |
| Stop columns | Destination, in delivery order · Products · Minimum stock amount · Status |
| Opened stop | Product · Minimum stock amount (game) · On hand · Sells / day (shop) or Uses / day (warehouse); export: Product · Deliver up to (game) |
| Agent columns | Purchasing Agent · Importer · Delivery · Next delivery · Products · To · Status |
| Delivery cell | Smart Delivery (game) / Weekly amount / One-time delivery (game) |
| Product columns | Product · Designated warehouse (game) · # target (game; Smart) or Amount a week · Previous (game) · Uses / week · Status |
| Empty | No Logistics Manager yet · Delivery plans: BizMan › Logistics Managers / No Purchasing Agent yet · Import contracts: BizMan › Purchasing Agents |
| Show all | Show all 16 destinations · 8 more / Show all 18 products · 8 more |

Game strings checked in the installed en.json (`bizman_logisticsmanagers_*`,
`bizman_purchasingagents_*`). "Minimum stock amount" vs "Deliver up to" per stop kind is read
from the key layout ("Deliver up to" sits beside "Export Price"); confirm in the DLL at the port.
No "roster", "shift", "post", "door cap".

## Cross-links

Out: a site name → its site page; the map pin → City map; the route icon / "Follow in Goods
flow" → `supply/flow` following that site (`flowPickId`); a finding chip → `sbLand()` on its
Deliveries or Imports row; "Imports ›" on a product (on hover) → `sbLand("imports", s, slug)`.

In (new): Goods flow's followed site gets a **Delivered by** card listing every source (each
contract and each plan stop that delivers to it; Harbor Depot: 3) and, for a depot or factory
with its own plan, **Sends**; Imports' depot head links the pier names and the plan;
Deliveries' "each morning from Harbor Depot" links the plan; the site page's Feeds head gets
"Rosa Duvall's plan · 02:00 ›". Each lands here with the row lit and opened, the stop opened,
and the `sb-crumb` back ("from Goods flow ×").

## Peter's answers (11 Oct 2026): these override the drawn defaults

The port follows these, not the canvas, where they differ.

1. Name **Plans & contracts**. Yes.
2. **Second** in the Supply list, after Changes. Yes.
3. Importers are named by **the game's own importer name** (Jet Cargo …), never by pier or
   address, everywhere on the board: this view, the existing Imports view and anywhere else that
   names an importer by pier today. "The address is not really something people know." The
   pier/address may stay as a quiet secondary detail only where it helps find the place (a
   tooltip). Decision 9 and the `agents[].pier` row above change accordingly.
4. A contract with no agent is **flagged as delivering nothing**. Confirmed.
5. **Flag** a warehouse that holds stock but has no plan (was: silent).
6. Wages are **left out**.
7. Rows keep the **game's order**.
8. A destination's stock targets keep the **game's order**, not sorted by amount (decision 4
   changes).
9. The manager-skill limit on destinations is **not claimed**. Show only the vehicle limit,
   worded as such.
10. **Drop "Not seated" entirely** (the flag, the `seated` payload fields). This view is about
    orders and logistics, not people.

## Open questions for Peter (answered above)

Drawn defaults carry a dashed `Qn` marker on the canvas.

1. View name: **Plans & contracts** (drawn)? Alternatives: "Who moves what", "Logistics",
   "Managers & agents".
2. Position: **second, after Changes** (drawn), or last after Goods flow?
3. Importers named **by pier** ("3 Pier", as Imports does; drawn), by the game's importer name
   (Jet Cargo …), or both?
4. Does a contract with no agent still deliver? The game's own message says no ("We couldn't find
   your Purchasing Agent … We've cancelled the order"), so it is **flagged bad with no delivery
   coming** (drawn). Confirm.
5. A warehouse holding stock with no plan: **silent** (drawn: nothing shown) or flag it? A
   second-tier depot may only store. Unmarked on the canvas on purpose: nothing is drawn to mark.
6. Wage per person: **left out** (drawn), on Staffing › Payroll.
7. Row order: **game order** (drawn) or flagged rows first?
8. A stop's minimum stock amounts: **sorted by amount** (drawn) or the game's order?
9. The skill limit on destinations: read the skill table and the cut rule from the game DLL
   before the port, or **leave it unclaimed** (drawn: only "vehicles reach N", no cut)?
10. Not seated: **flagged** as "Not seated" (drawn) once the seat field is found in the save, or
    dropped if the save does not carry it?
