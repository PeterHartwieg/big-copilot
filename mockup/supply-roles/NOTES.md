# Supply › Plans & contracts: design notes

Canvas: https://claude.ai/artifact/Jr4kSCLZhxqQkWQ7Kv3yuZ (Design type). Generator:
`build_supply_roles_canvas.py`. Never hand-edit `project/`. `--preview` writes plain HTML to
`_preview/` (both themes) for screenshots; do not commit `_preview/` (not in `.gitignore`;
`project/` is). The Artifact tool refuses a root inside the worktree: publish from a scratchpad
copy of `project/`. Like `mockup/secondary-products`, the generator reads the board's real
stylesheet from `template/board.html`; new classes are `sr-` (unused on the board).

Peter, 10 Oct 2026: every Logistics Manager's and Purchasing Agent's configuration in one view.
All names are invented (company BRIGHTWELL); the shape follows three real saves: 12 managers
(5 factory plans), 0–16 destinations, 8 contracts of 13–18 products, 122 product lines.

## Artboards

- **A · Main**: the view, every row closed. Two groups: Logistics Managers (warehouse plans,
  then factory plans), Purchasing Agents.
- **B1 · OpenManager**: Rosa Duvall's 16-destination plan opened (8 shown, "Show all 16"),
  stop 3 opened to its 10 stock targets.
- **B2 · OpenAgent**: Mara Okafor's 18-product contract opened (10 shown, "Show all 18").
- **C · Problems**: every flag at once; Thread Depot's plan opened at the vehicle cut.
- **D1 · Empty**, **D2 · Small** (1 manager, opened by default; 2 agents, one a one-off).
- **E · Links**: links out (site page, map, Goods flow, Deliveries/Imports rows) and in (Goods
  flow card, Imports/Deliveries heads, site page Feeds, the arrival with its crumb). New links
  are outlined green.

All artboards are interactive (rows and stops open, Show all) and have the `dark` Tweak.

## Decisions

1. **A new Supply view, second in the list**: Changes · **Plans & contracts** · Imports ·
   Deliveries · Production · Goods flow. Route `supply/roles`, section `secRoles`. The local nav
   badge counts flags (as the other views count changes).
2. **Two tables, one row per role**, never one block per site: 20 rows compare at a glance.
   Rows keep game order (plan list order, contract list order). Managers are split by source
   kind with a part row that carries the time: "From warehouses · daily 02:00", "From factories
   · daily 08:00". So no time column. Managers with no plan go under a "No plan" part.
3. **Details on demand**: a row opens in place to its list. A plan: the vehicles line, then the
   destinations in delivery order, 8 shown, "Show all N". A stop opens to its stock targets
   table (Product · Stock target · On hand · Sells / day · Status); over 8 targets it splits into
   two side-by-side columns. A contract: the importer line, then its products, 10 shown. In a
   contract, "To" is printed only when it changes from the row above.
4. **The closed row is numbers**: destinations as "13 of 16" over a cell strip (one cell per
   location the vehicles reach, red past it), stock-target count, where it delivers summarised
   by brand with ×count (shops) or by name (depots), and status chips. A clean row's status
   cell is empty.
5. **A single manager opens by default** (small company). Nothing else opens by itself.
6. **Toolbar**: the scope select only (whole company, all warehouses, all factories, one site),
   as the other Supply views. A site keeps the plans and contracts that touch it as source or
   destination. No "Needs a change / Everything" switch: the view is the overview. Hidden in
   the empty state.
7. **Empty state**: two dashed cards, "No Logistics Manager yet" / "No Purchasing Agent yet",
   one line each on where the game sets them.

## Data per field

New payload key: **`supply.roles`** = `{managers: [...], agents: [...]}`. Built from the save,
before `_supply_plans()` merges competing targets. Fields marked *existing* are read from keys
the payload already has.

| On screen | Save field | Payload |
| --- | --- | --- |
| Manager name, skill | `logisticsManagerPlans[].assignedEmployeeId` → `EmployeeInstances[]` (name, `ba:skill_logisticsmanager`) | new `managers[].who`, `.skill` |
| From | plan `targetAddress` (the pick-up site), `isFactory` | new `managers[].src` (site key), `.factory` |
| Daily at | fixed by the game: warehouse 02:00, factory 08:00 | constant in the board |
| Destinations, in order | plan `destinations[].deliveryTargetAddress` | new `managers[].dests[].site` |
| Stock targets | `destinations[].stockTargets[]` (`itemName`, `targetAmount`), as set | new `managers[].dests[].targets` |
| On hand, sells / day of a target | | *existing* `supply.shops` rows |
| Vehicles, locations | source building `vehicleSlots[]` (`vehicleInstanceId`, `employeeDriverId`) + vehicle type | new `managers[].vehicles[]` `{type, driver}`; table `VEHICLE_LOCATIONS`; *existing* `openFactory.sites` has type + has-driver for factories/depots only |
| Idle manager | `Entities.LogisticsManager` employee in no plan | new `managers[]` with `src: null` |
| Site with no manager | warehouse/factory that is no plan's source | new `managers[]` with `who: null` |
| Agent name, skill, discount | `importPartnerships[].employeeInstanceId` → `EmployeeInstances[]`; discount 25% × skill/100 | new `agents[].who`, `.skill` |
| Importer | `importAddress` | new `agents[].pier` (the board's `names.addr`, "3 Pier") |
| Smart Delivery / weekly amount, one-off, urgent | `isTarget`, `isRepeatingOrder`, `isUrgentOrder` | new `agents[].smart`, `.repeating`, `.urgent` |
| Paused | `isActive` false | new `agents[].active` (*existing* per line in `supply.imports.contracts`) |
| Next delivery | `nextDeliveryDay` | new `agents[].next` |
| Products, To, amount, last week | `products[]` `itemName`, `assignedWarehouse`, `amount`, `amountOrderedLastWeek` | new `agents[].products[]`, **including those with no warehouse** (today `_supply_imports()` drops them) |
| Uses / week of a product | | *existing* `supply.imports` row |
| Idle agent | `Entities.PurchasingAgent` employee on no contract | new `agents[]` with `pier: null` |
| Short chips | existing findings | *existing* finding rows (`shortfall`, `topup`, `outruns`, `order`/`feed`, `paused`), matched by site + item |

## Flags and their rules

| Chip | Where | Rule | Class |
| --- | --- | --- | --- |
| `N over vehicles` | manager row | destinations > reach; reach = Σ locations of the source's vehicles **with a driver** (Freight Truck T1 8, Vord Courier D500 6, Vord V150 4, Mersaidi Dash 4, UMC Nunavut 4) | bad |
| `No delivery` + dashed cut "the vehicles reach N locations" | stops past reach | index ≥ reach, in delivery order | bad |
| `No destinations` | manager row | plan with 0 destinations | warn |
| `No plan` | manager row | Logistics Manager employee in no plan | warn |
| `No Logistics Manager` | row for the site | factory with lines and no plan: bad; warehouse holding stock and no plan: idle (blue) | bad / idle |
| `No stock targets` | stop, and counted on the row | destination with an empty `stockTargets` | warn |
| `<item> short` / `N short` | stop / manager row | an existing Deliveries finding on that destination and item; links to its row | bad |
| `Paused` | agent row | `isActive` false; bad when the `paused` finding fires (still needed), else warn | bad / warn |
| `No agent` | agent row | `employeeInstanceId` null, not found, or `isBeingReplaced`/`isReplaced` (as `ImportWrite.NoAgent()`) | bad |
| `No warehouse` / `N with no warehouse` | product / agent row | `assignedWarehouse` empty | warn |
| `No contract` | agent row | Purchasing Agent employee on no contract | warn |
| `short` / `N short` | product / agent row | an existing Imports finding (`order`, `feed`, `shortfall`) on that depot and item | bad |

Not drawn: the skill limit on destinations (the skill → count table is unknown); the column
shows skill % only. A vehicle with no driver shows as a dashed "no driver 0" chip in the
vehicles line.

## Wording

| Where | Text |
| --- | --- |
| Nav / view | Plans & contracts |
| Group heads | Logistics Managers · 12 managers · 67 destinations · 572 stock targets; Purchasing Agents · 8 agents · 8 contracts · 122 products · Mon 08:00 arrival |
| Manager columns | Logistics Manager · From · Destinations · Stock targets · Delivers to · Status |
| Part rows | From warehouses · daily 02:00 / From factories · daily 08:00 / No plan |
| Under a name | skill 100% / skill 100% · −25% on prices |
| Destinations cell | 13 of 16 (tip: "13 destinations; the vehicles here reach 16 locations") |
| Vehicles line | Vehicles at Harbor Depot · Freight Truck T1 · Kai Rasmus 8 · = 16 locations · daily 02:00 · Follow in Goods flow |
| Stop columns | Destination, in delivery order · Stock targets · Tops up to · Status |
| Agent columns | Purchasing Agent · Importer · Delivery · Products · To · Status |
| Delivery cell | Smart Delivery / Weekly amount, sub "one-off" or "urgent" |
| Contract line | 3 Pier Mon 08:00 · Smart Delivery tops each warehouse up to its level · order by Sunday 20:00 |
| Product columns | Product · To · Keeps in stock (or Amount a week) · Arrived last week · Uses / week · Status |
| Empty | No Logistics Manager yet · Delivery plans are set in BizMan › Logistics. / No Purchasing Agent yet · Import contracts are set at an importer. |
| Show all | Show all 16 destinations · 8 more / Show all 18 products · 8 more |

No "roster", "shift", "post", "door cap".

## Cross-links

Out: a site name → its site page; the map pin → City map; the route icon / "Follow in Goods
flow" → `supply/flow` following that site (`flowPickId`); a short chip → `sbLand()` on the
Deliveries or Imports row; "Imports ›" on a product (shown on hover) → `sbLand("imports", s, slug)`.

In (new): Goods flow's followed site gets a **Delivered by** card (and **Sends** for a depot or
factory with its own plan) beside "Changes on its route"; Imports' depot head turns the pier
names and "Rosa Duvall's plan" into links; Deliveries' "each morning from Harbor Depot" links
the plan; the site page's Feeds head gets "Rosa Duvall's plan · 02:00 ›". Each lands here with
the row lit and opened, the stop opened, and the `sb-crumb` back ("from Goods flow ×").

## Open questions for Peter

1. View name: **Plans & contracts**? Alternatives: "Who moves what", "Logistics", "Managers &
   agents".
2. Position second, after Changes, or last after Goods flow?
3. Importers named by pier ("3 Pier", as Imports does today) or by the game's importer name
   (Jet Cargo, Seaside Internationals …), or both?
4. Does a contract with no agent still deliver in the game? It is flagged bad on the
   assumption it does not.
5. A warehouse with stock and no plan: flag it (blue, as drawn) or leave it silent, since a
   second-tier depot may only store?
6. Show the wage per person, or keep that on Staffing › Payroll (drawn without)?
7. Keep game order, or sort flagged rows first?
8. Sort a stop's stock targets by target (drawn) or in the game's order?

## Review round 1 (Opus 5.5, 10 Oct 2026): NOT yet applied to the canvas

Paused here at Peter's request. Apply these in the next session before showing the canvas as final.

- MUST: stock targets past row 12 are hidden with no way to show them (`target_table(show=12)`); real
  stops have up to 33. Show all once a stop is open, or add "Show all N".
- "Paused" must exclude finished one-offs: paused = `isActive` false and `isRepeatingOrder` true.
- Draw each contract's real next delivery (`nextDeliveryDay`), not a constant "Mon 08:00".
- Factory plans can deliver to piers (export). HubSpoke has 4 factory -> pier stops (targets 5,000-10,000).
  Draw pier stops; they are exports, not shops.
- The destination cap is skill AND vehicles (game help: skill, vehicle slots, vehicle type). The skill table
  and which stops get cut are unverified: read them from the game DLL before porting, or soften "13 of 16" /
  the dashed cut / "No delivery".
- Empty state: the game menus are "Logistics Managers" and "Purchasing Agents", not "BizMan › Logistics".
- Factory with no Logistics Manager: flag only when something downstream needs its output.
- Nav badge: count only the new role-level flags, not the existing Imports/Deliveries findings.
- Restating text: drop the Smart Delivery explanation (keep the Sunday 20:00 deadline), "· daily 02:00" on the
  vehicles line, and one of the three marks for the over-capacity fault.
- Depot stops: column "Uses / day", not "Sells / day".
- Nits: "One-time delivery" not "one-off"; check the game's label for the target ("Minimum stock amount" /
  "Deliver up to"); one importer kind per contract (retail vs factory raw goods); the Links "Delivered by" card
  lists 3 of 5 sources; Day 333 is a Thursday, not Fri; keep each finding's own label instead of "<item> short";
  unseated managers/agents ("Only seated ... can be accessed") unhandled; don't repeat "skill 100% · −25%" on
  every row.
