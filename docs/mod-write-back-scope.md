# Game link write-back: scope

Written 22 September 2026. Step 2 of `docs/mod-link-scope.md`, widened from the roster alone
to three writes: default uniforms, weekly import amounts and the staffing roster. Game facts
were read from build 3680's `BigAmbitions.dll` IL on 22 September 2026 and are quoted with
the method they come from. Nothing here is implemented. Peter settled the open decisions the same day (section 8);
implementation starts 23 September 2026.

---

## 1. The shape, in one paragraph

Reading stays as it is: the mod serves the save bytes, `extract()` is the only extractor.
Each write is one small JSON endpoint that takes the change the board proposes, validates it
on the Unity main thread against the same rules the game's own UI enforces, applies it with
the same calls the UI makes, answers with the state as it now stands, and triggers a refresh
so the board rebuilds from the written state. Every write has a dry run that answers the
same verdict without applying, and every write carries what the page believed the current
value was, so a game that moved on since the last refresh refuses rather than overwrites.

## 2. Shared plumbing (all three writes need it)

**Mod**

- `LinkHttpServer` gains `POST /write/uniforms`, `/write/imports`, `/write/schedule`. Body is
  JSON, `Content-Type: application/json`, so the browser preflights: add `Authorization,
  Content-Type` to `Access-Control-Allow-Headers`. A small JSON reader is needed (the mod has
  only `JsonWriter`); Unity's `JsonUtility` cannot read the nested shapes, so hand-roll a
  reader the size of `JsonWriter` (~150 lines).
- **Pairing code** (decided in step 1): six characters, generated per game launch, shown in
  the mod's options panel with a "Copy code" button; the page sends `Authorization: Bearer
  <code>`. Wrong or missing → `401 {"error":"not_paired"}`. Reads stay code-free.
- **Dry run**: `{"dryRun": true, ...}` runs every check and returns the per-row verdict and
  the clamped values, applies nothing. The page calls it when the confirm dialog opens, so the
  dialog shows what the game will accept, including values only the game knows (importer caps,
  preset names).
- **Compare-and-set**: each row carries `expect`, the value the page read from the bytes
  (current amount, current uniform id, a fingerprint of the site's current shifts). A mismatch
  answers `409 {"error":"changed", "rows": [...]}`; the page refreshes and re-plans.
- **Threading**: the write runs through `MainThreadDispatcher.RunOnMainThread`, like
  `/refresh`. It must not run while the worker-thread walk is in flight (the walk would read
  half-mutated lists): if `SaveService.Busy`, the main thread holds the write until the walk
  publishes, bounded by the handler's three-second wait, else `503 {"error":"busy"}` and the
  page retries. Refuse while `SaveGameManager.SavingGameInProgress`.
- **After a write**: `SaveGameManager.MarkChange()` (the UI calls it after every edit), an
  in-game notification ("Big Copilot updated <what> at <business>"), and a refresh that may
  pass the fifteen-second window (never an in-flight one), as the building-load trigger does.
  No game save, as decided in step 1.
- **Undo** (decided): the mod keeps the before-state of the last write of each
  kind in memory for the city session; `POST /write/undo {"kind": ...}` restores it when the
  target still holds what the write left. Costs little because the before-state is already
  captured for the answer. The page shows "Undo" on the confirmation until the next write of
  that kind or the end of the city session. For imports the before-state includes each
  contract's `isActive`, `isRepeatingOrder` and plan-order position.
- `/health` gains `"writes": ["uniforms", "imports", "schedule"]` and `"paired": bool` (whether
  this request carried the right code; false for code-free polls). Additive, so
  `schemaVersion` stays 1; the page shows a write button only when its kind is listed, and an
  "update the mod" hint when the linked mod lists none.

**Page (`web/app.js` + board script)**

- One `gameWrite(kind, body, {dryRun})` in `web/app.js` beside `linkFetch`, reusing its
  address-space fallback; the board calls it through the same bridge the board uses for
  refresh. It owns the pairing prompt (asked once, kept in `sessionStorage`, never
  `localStorage`: the code is per launch anyway).
- One confirm dialog component: title, a before → after table, the dry-run verdicts, the
  game's own wording where it has one, Apply / Cancel. After Apply: the answer's state shows
  at once, then the rebuild from the refreshed bytes replaces it.
- A refusal fails loudly (decided): the dialog names the rule, the object and the fix, in
  the game's own words where it has them ("Orders for Monday's delivery closed Sunday 20:00;
  they reopen Monday 08:00"). Nothing is queued in the mod to run later.
- Buttons are disabled with a reason, never hidden, when linked mode is on: "Link to the game
  to apply this", "Enter the pairing code", "Orders for Monday closed Sunday 20:00". Outside
  linked mode the existing checklists stay as they are.

**Mock and tests**

- `tools/game_link_mock.py` implements the three endpoints against the save it serves:
  validates against the bytes, records applied writes, answers the post-write state, and
  `--refuse-write <error>` exercises the page's refusals. It does not rewrite the save, so
  read-after-write is checked only in game.
- `tests/game_link_write.test.cjs` (dialog, disabled reasons, pairing prompt, 409 re-plan)
  and `tests/test_game_link_mock.py` additions. The contract goes into
  `docs/game-link-api.md` in the same commit as the mod.

## 3. Uniforms

**What the game does** (`SetUpUniformsWindow`, BizMan → business → Settings):

- The window shows only when the building holds an item tagged `isuniformlocker`
  (`ShouldShowWindow`). No locker, no uniforms: the board's `missingUniformLocker` alert
  already covers it and the mod cannot place furniture.
- Skills offered: the business type's `employeePrimarySkills` plus the building type's
  `requiredBuildingSkills` (`SetSkillNameDropdownOptions`).
- Uniforms offered: every `GameInstance.employeePresets`, by `name`. **Every save on this
  machine holds exactly one, "Default"**, so a "simple" set is "Default" on each missing skill.
- Selecting one (`OnUniformDropdownOptionSelected`): `registration.uniformsBySkill[skill] =
  preset.id`, then `CustomerDemandHelper.ReloadCachedFulfilled(address)`,
  `BuildingManager.Instance.onUniformChanged.Invoke(skill, id)`,
  `GameEvent.Invoke("ba:gameevent_employeeuniformassigned")`. The reload clears the warning at
  once instead of at midnight.

**Endpoint**: `POST /write/uniforms {"sites": [{"address": {...}, "skills": ["ba:skill_…"],
"presetId": null}], "dryRun": bool}`. `presetId` null means "Default", else the first preset.
Per site the mod checks: rented by the player, business type not `ba:businesstype_empty`
(`UniformLockerController.CanAssignUniforms`), a locker present, each skill in the window's
list, the skill has no uniform yet (**never overwrite a player's choice**). Dry run answers
the preset list so the dialog can offer a choice.

**Board**: the amenity alert "No staff uniforms set" and the site panel get "Set Default
uniforms" (one site); the alert group gets "Set for all N shops". The payload needs the raw
skill ids next to the labels: `_uniform_gaps()` returns labels only today, so add
`uniformGapSkills`. The write fills **every skill in the store's uniform list that has no
uniform yet** (decided), not only the roles on shift, so the warning cannot return when the
roster changes; a skill the player already dressed is never touched.

Smallest of the three, so it is the tracer bullet for the plumbing.

## 4. Imports

**What the game does** (`PurchasingAgentPlanUI`, `PurchasingAgentProductModel`,
`DeliveryHelper`, `ImportPartnership`, `PurchasingAgentsPlanList`):

- One `ImportPartnership` per purchasing-agent contract with one importer:
  `employeeInstanceId` (the agent), `nextDeliveryDay`, `isActive`, `isTarget`,
  `isRepeatingOrder`, `isUrgentOrder`, and `products[]` with `itemName`, `amount`,
  `assignedWarehouse`, `amountOrderedThisWeek`, `amountOrderedLastWeek`. The save omits fields
  at their default, so a missing `isTarget` is false.
- **Smart Delivery is `isTarget`** (the plan screen's toggle, `OnAutoStockToggleValueChanged`;
  locale `bizman_purchasingagents_smart_delivery_description`: the agent keeps the entered
  amount in the warehouse). It exists on import contracts, not only at wholesalers. With it
  on, `amount` is a stock level and a delivery brings
  `max(0, amount - CountResourcesInPallets(warehouse, item))` (`GetAmountToBuy`); with it off,
  `amount` itself arrives. This is the mode Peter plays in.
- Deliveries run on Monday (`GetNextDeliveryDay`, `SetNextDeliveryDay`). After a delivery
  `isActive = isRepeatingOrder`, so a contract without Repeating switches itself off after one
  delivery: some "paused" contracts are finished one-offs, not a player's pause.
- **Lock window: Sunday 20:00 to Monday 08:00** (`DeliveryHelper.IsLockPeriod`).
  `CanModifyContract(nextDeliveryDay)` is false inside it for the imminent Monday's delivery;
  the game says "You cannot modify this delivery because it is already in progress" and shows
  the deadline as "Order must be placed by Day N, 20:00".
- The amount field is editable only while the contract is stopped (`SetData`:
  `interactable = !isContractActive`). Changing an active contract in the UI is Cancel (needs
  `CanModifyContract`), edit, Start (`nextDeliveryDay = GetNextDeliveryDay()`, the same Monday
  outside the lock window). Start refuses a contract with no amounts or a product with no
  warehouse. The mod does the net of that: set `amount`, set `isActive`, recompute
  `nextDeliveryDay` the way Start does, clear `isUrgentOrder` as Cancel does.
- **Delivery order is the game's own priority.** `DoAllDeliveries` walks
  `GameInstance.importPartnerships` in list order, grouped by importer (a group's place is its
  first contract's place). That list is the one the player drags to reorder at a headquarters
  (`PurchasingAgentsPlanList.OnPlanReordered` moves the entry in `importPartnerships`).
- **Importer cap**: each importer caps an item per week across all the player's contracts
  with it, urgent orders included (locale `bizman_import_limit_tooltip`). At delivery each
  product is clamped to
  `max(0, GetMaxOrderAmountPerImporter(item) - GetItemAmountOrderedThisWeek(importer, item))`,
  unless `gameVariables.disableWholesaleAndImportLimits` or `ShouldLimitImporterMaxAmount` is
  false (bags never capped; factory ingredients not capped at a raw-materials importer).
  Because the walk is in list order, the first contract with an importer uses the cap first.
  Cap and unit price live in the items bundle, not the save, so the board learns both from the
  dry run.
- A product in a backorder market event is skipped. A missing or replaced purchasing agent,
  or too little cash, at delivery **deactivates the contract** with a phone message; no space
  at the warehouse refunds.

**What the board proposes.** For a Smart Delivery contract: the stock the depot should hold on
Monday morning to run everything it feeds at full capacity for a week (the factory lines'
full-rate inputs plus the shops' measured draw, what "Used / week" already sums), rounded up
to a hundred. It is not re-tuned to last week's demand, so a small demand shift changes
nothing in game; the target moves only when capacity does (a new line, a new shop). For a
plain contract it stays the weekly amount the table suggests today.

**Priority when several contracts bring one item to one depot.** The game already has one, the
plan order, and the cap makes it matter: the first contract fills up to its importer's cap,
the next tops up. The board shows those contracts as a ranked list under the item, in the
game's order, with unit price and cap from the dry run, and proposes:

- *Smart Delivery*: the same target on every contract in the ranking. The first delivers what
  its cap allows, the next sees the stock that already arrived (verify, section 7) and brings
  only the rest, so a backup importer costs nothing in a week the first one covers.
- *Plain amounts*: fill in rank order, each up to its cap, until the week is covered.
- Default ranking: cheapest unit price first. The player can drag to reorder; a changed
  ranking is written as the new plan order (`importPartnerships` reordered the way
  `OnPlanReordered` does, moving only the contracts in that ranking).

**Reactivation.** A write may switch a stopped contract back on (Peter, 22 September 2026: a
paused contract still pays its purchasing agent, so it is meant to be used). The dialog says
so per contract, shows the next delivery's cost from the dry run (`NextDeliveryTotal`)
against cash, and switches Repeating on with it, because a stopped contract may be a finished
one-off and a planned supply is a weekly one.

**Endpoint**: `POST /write/imports {"contracts": [{"id", "activate": bool, "products":
[{"itemName", "warehouse": {address}, "amount", "expect": <current amount>}]}], "order":
[<contract ids, new relative order>] | null, "dryRun": bool}`. All or nothing. Refusals fail
loudly, by name, with the fix: `locked` (reopens Monday 08:00), `no_agent` (assign a
purchasing agent at the headquarters), `no_warehouse`, `backorder`, `not_found`, `changed`,
`screen_open` (the BizMan plan screen is open on that contract). A plain amount above the cap
answers `over_cap: <max>` in the dry run; Apply takes only values the dry run accepted.

**Board**: the "Weekly imports" table (`$("importPlan")`, today Material | Used / week |
Order now | Set order to | At depot) becomes, per depot:

| Material | Used / week | Arrived last week | Set in game | Set to (editable) | At depot |
| --- | --- | --- | --- | --- | --- |

- *Arrived last week*: the sum of `amountOrderedLastWeek` over the depot's contracts, the
  "total imports" figure, and the one that shows the cap cutting an order short.
- *Set in game*: the contract amount, labelled "keep N in stock" for Smart Delivery and
  "N a week" otherwise, so the two are never read as the same number.
- *Set to*: a number input prefilled with the proposal, adjustable, with a reset link; edits
  kept per character, depot and item in `localStorage` until written or reset. A row whose
  input differs from *Set in game* is marked changed. An item with two or more contracts
  expands into its ranked list.
- One "Apply N changes in game" button per depot and one for the section: dry run, dialog,
  apply, undo.
- Outside linked mode the inputs still work and feed the existing "Plan imports" checklist.

**Prerequisite fix, independent of the mod**: `_supply()` never reads `isTarget`, so a Smart
Delivery contract's stock level is counted as a weekly delivery and the covered / tight /
short fit is judged against the wrong number. Read it; for Smart Delivery the week's supply
is `max(0, target - stock left on Monday)` and the fit question becomes "does the target cover
a full-capacity week?". Peter plays with it, so this ships first.

## 5. Staffing roster

`docs/mod-link-scope.md` section 5 holds the endpoint as scoped on 22 September 2026 (still
right in outline): `POST /write/schedule`, replace one business's seven days of
`workShifts`, opening hours untouched, the grid's rules re-checked (12-hour shift, one person
per station and hour, one shift per person and hour, station skill via
`ScheduleHelper.HasSkillForWorkstation`), then per affected employee
`UpdateWeeklyHoursAndDays`, `UpdateAssignedWorkStationItems`, `UnAssignWork` + to-do when left
with nothing, then `BusinessSecurityHelper.UpdateSecurityLevel`, `UpdateHQPlans` at an HQ,
`MarkChange()`. Refused while the BizMan schedule is open on that business.

Changes since that section was written:

- **The plan is unchanged; the write takes what the game can hold** (decided). The planner
  keeps its pool (the site's staff, the unassigned bench and new hires, as since PR #59), so
  the plan stays the optimum. Assigning people to a business stays the player's job, so the
  write sends only the shifts of people already assigned to the site. The shifts that belong
  to bench people and to hires stay empty in game, and the write comes with a warning: "Add
  4 people to fill this plan: assign Ana, Ben (bench) and hire 2 Customer Service. 96 h a
  week stay empty until then." After the player assigns and hires, the next refresh plans
  them in as the site's own staff and a second write fills the holes.
- `expect` is a fingerprint of the site's current shifts as the bytes had them (sorted
  `(day, from, to, employeeId, itemInstanceId, type)` hashed); the mod computes the same from
  live state.
- Also check the 14-hour overworked day (`ScheduleHelper.GetOverworkedDays`) as a warning,
  not a refusal, since the grid allows it.
- `WorkShiftType` per station: verify it matches `GetWorkShiftType` (cleaning stations get
  Cleaning, 0; the rest Default, 1), step-1 verification 4.

**Board**: "Write this roster to the game" on the roster view per site, and "all planned
sites" on the Staffing page. The dialog shows shifts removed and added per day and names
anyone left with no shift (the game unassigns their work and adds a to-do). The add-people
warning sits on the button's confirmation and stays on the roster until the plan is filled,
so a partial write is never shown as complete coverage.

**Full-cover mode for a new business** (Peter, 22 September 2026). A new shop has no
measured demand, so today its plan covers cleaning and security only and leaves the
registers alone. The new mode is a demand test: staff every employee station every hour,
24/7, with the fewest people, run it for two weeks, then switch to the demand plan.

- *Need curve*: every station of every role, all 168 hours. Everything else is the existing
  placer: 12-hour shifts, the 14-hour day, the 50-hour ceiling, the 30-hour floor, day counts,
  one business per person, cleaning never given to a server. Minimising people at full cover
  is the placer's first rank already; a station open 168 h needs at least four people
  (168 / 50), so a two-register shop with one cleaning station needs at least eleven.
- *Opening hours*: an hour the shop is closed is an hour the test never measures, so the
  full-cover write also opens every day 0 to 24 (one `openingHourSlot`, `isOpen` true),
  shown in the dialog as its own line with an opt-out. This is the one write that touches
  opening hours; the demand plan still leaves them alone.
- *When it is offered*: on a shop with fewer than `HOUR_WEEKS_THIN` (2) measured weeks, as the
  roster's other choice beside the cover-only plan, and at any time on request.
- *Hand-over*: the board counts the full-cover days from the hour reports. Once two measured
  weeks exist, the Today card and the roster say "Demand test done: switch to the demand
  plan", which is the existing demand plan and write. Hours at the door cap during the test
  are still censored by the door, not by staff, and the need curve already treats them so.
- *Payload*: `fullCover` beside the demand plan on every retail site (same shape as the plan,
  plus `openAllHours`), so the page switches between them without re-planning. About one more
  plan per new site; the planner runs in ~25 ms per site.

## 6. Order of work

The mod builds only on the Mac and every mod release is a Workshop update, so the mod ships
**once, as 0.2.0, with all three endpoints**; the page ships in three PRs, each gated on
`/health.writes`, so a page that lands first shows nothing new.

1. **Board-only prep, no mod**: the `isTarget` (Smart Delivery) read fix and the full-capacity
   target proposal; the new imports table with the editable *Set to* feeding the checklist;
   `uniformGapSkills`; the full-cover plan for new shops and its two-week hand-over; the
   add-people count per plan. Useful on its own (full cover can be typed in by hand, as the
   demand plan is today); deployable before the mod.
2. **Mod plumbing + uniforms**: JSON reader, pairing code, dry run, compare-and-set, write
   dispatch, post-write refresh, `/write/uniforms`; page `gameWrite`, pairing prompt, dialog,
   uniform buttons; mock + tests. Built into `ModsLocal` and tried in game, not released.
3. **Imports write**: `/write/imports` + page apply, ranking, reactivation. In-game check across
   the lock window, a capped item with a backup contract, and a reactivated one-off.
4. **Schedule write**: `/write/schedule` (shifts, plus opening hours for full cover) + page
   apply for both plans. In-game check per step-1 verification 4: write, open the BizMan
   schedule, compare; and a partial write whose holes a second write fills after a hire.
5. **Release**: mod 0.2.0 to the Workshop, site deploy, changelog entry (a new capability).

Rough size: mod ~700 lines C# (plumbing 250, uniforms 80, imports 150, schedule 250); page
~500 lines plus three test files; mock ~200 lines.

## 7. To verify before building

Items 1, 4, 6 and 8 were checked on 23 September 2026 (build 3680, reflection and IL); the rest
are still open.

1. **Visibility (checked).** Public: `CustomerDemandHelper.ReloadCachedFulfilled(Address |
   BuildingRegistration)`, `BuildingManager.onUniformChanged` (instance; `BuildingManager.Instance`
   comes from its `InstanceBehavior<T>` base), `DeliveryHelper.CanModifyContract`,
   `GetNextDeliveryDay`, `ShouldLimitImporterMaxAmount`, `IsLockPeriod`,
   `AreWholesaleAndImportLimitsDisabled`, `GetNextLockPeriodStart`,
   `ImportPartnership.GetItemAmountOrderedThisWeek`, `GetImportProductTotalPrice`,
   `NextDeliveryTotal`, `PurchasingAgentInstance`, `ImportProduct.Price`,
   `BigAmbitions.Items.Item.maxOrderAmountPerImporter` (assembly `BigAmbitions.Items`),
   `ScheduleHelper.HasSkillForWorkstation`, `Business`, `GetOverworkedDays`, `UpdateHQPlans`,
   `IsHeadquarters`, `EmployeeInstance.UpdateWeeklyHoursAndDays`, `UpdateAssignedWorkStationItems`,
   `UnAssignWork`, `AddTodoTask(TodoTaskType, bool)`, `IsAssignedToAnyWorkShift`,
   `HasAnySkillWithTag`, `BusinessSecurityHelper.UpdateSecurityLevel`,
   `BizManBusiness.UpdateSecurityInfo`, `TasksUI.forceCheckForCompletedTodoTasks`,
   `GameEvent.Invoke`, `SaveGameManager.MarkChange`, `GameInstance.employeePresets` and
   `importPartnerships`, `EmployeeHelper.GetEmployeeById`, `Notifications.Show` / `ShowError`,
   `BuildingHelper.CountResourcesInPallets`, `ProductMarketHelper.IsProductInMarketEvent`,
   `ScheduleDay.isOpen` / `openingHourSlots`, `WorkShift.type`.
   Private, so reflection or a re-implementation: `ImportPartnership.GetMaxOrderAmountPerImporter`
   (the item's `maxOrderAmountPerImporter`, times 0.66 rounded while the item is in a shortage
   market event, type 3), `ScheduleHelper.UpdateEmployeeAfterWorkShiftChange` (bound to the open
   BizMan business; re-implement), `PurchasingAgentPlanUI._currentImportPartnership`,
   `PurchasingAgentsPlanList.OnPlanReordered` (re-implement: Remove and Insert in
   `importPartnerships`).
   The exact sequence after a shift change (`UpdateEmployeeAfterWorkShiftChange(emp, true)`):
   `UpdateWeeklyHoursAndDays(scheduleDays)`; `UpdateAssignedWorkStationItems()`; when the employee
   has a skill tagged `affectssecurity`, `BusinessSecurityHelper.UpdateSecurityLevel(registration)`
   and `BizManBusiness.UpdateSecurityInfo()` (only where a BizMan business object exists); when
   `!IsAssignedToAnyWorkShift()`, `UnAssignWork()` and `AddTodoTask(5, true)`; at an HQ
   `UpdateHQPlans(null)`; `UIs.tasksUI.forceCheckForCompletedTodoTasks = true`; `MarkChange()`.
2. How the mod tells that a BizMan screen is open on a given business or contract
   (`ScheduleHelper.Business`, `PurchasingAgentPlanUI._currentImportPartnership`). Open.
3. That `onUniformChanged` re-dresses staff already in the loaded building, or that nothing
   visible needs it. Open.
4. **Weekday numbering (checked).** Game day 1 is a Monday; `IsLockPeriod` treats 7 as Sunday.
5. Smart Delivery with a backup contract. `DoDeliveries` computes `GetAmountToBuy` for all of one
   contract's products, then delivers them in the same call through
   `ItemHelper.DeliverCargoToBuilding`, synchronously, and contracts run one after another. So a
   later contract should see the earlier one's cargo if `DeliverCargoToBuilding` puts it on pallets
   at once. Likely; confirm in game with two contracts on one item. The board already assumes it
   (`_import_drop()`).
6. **Price (checked).** Per unit, `ImportProduct.Price` times `ImportPartnership.GetDiscount`; urgent
   orders times `DeliveryHelper.GetImporterUrgentFeeMultiplier`. `NextDeliveryTotal` is public.
7. The saves on this Windows machine predate build 3680 in places (one contract carries a
   `minimumOrder` field the class no longer has). The Smart Delivery fix was validated on Peter's
   newest save on 23 September 2026 (all 8 import lines are Smart Delivery).
8. **Opening hours (checked).** `ScheduleDayButton.OnOpenToggleChange` refuses at a headquarters
   (`bizman_schedule_cannot_toggle_open`), otherwise sets `isOpen` and runs the post-change updates
   for that day's employees. The hour toggles only edit `openingHourSlots` (merge, split, sort): no
   cost and no rule. Opening 0 to 24 is `isOpen = true` with one slot `{0, 24}`, followed by the
   shift write's per-employee updates.

## 8. Decisions (settled by Peter, 22 September 2026)

1. **Uniforms**: fill every skill in the store's uniform list with no uniform yet; never
   overwrite one the player set.
2. **Several contracts for one item at one depot**: a priority system. It is the game's own
   plan order, cheapest first by default and reorderable on the board (section 4).
3. **Paused contracts**: a write may reactivate one. A paused contract still pays its
   purchasing agent, so it is meant to be used.
4. **Lock window**: refuse and fail loudly with the reopen time; no queued writes.
5. **Staff assignment**: the player's job. The plan still uses bench people and hires; the
   write fills what the assigned staff can and warns how many people to add.
6. **Undo**: yes, the last write of each kind.
7. **Smart Delivery**: Peter's default. Set the stock level that runs everything at full
   capacity and let the agent restock to it, rather than chasing weekly demand. The board
   models it and the write sets it (section 4).
8. **New businesses**: a full-cover 24/7 plan with the fewest people, as a two-week demand
   test, then the demand plan. The write also opens every day 0 to 24, with an opt-out in the
   dialog (confirmed by Peter).

## 9. Status and hand-over (23 September 2026)

**Step 1 (board only) is shipped.** PR #76 (imports) and the staffing PR that carries this section
are live on bigcopilot.com. The mod is unchanged: still 0.1.0, Workshop item 3806322395, read only.
Steps 2 to 5 of section 6 are next; they are mod work plus the page buttons.

**Rules settled after sections 5 and 8 were written.** These supersede the text above where they
differ:

- Full cover means 100%: every serving station staffed every hour the shop is open. The full-cover
  plan opens 0 to 24 every day, with an opt-out in the dialog.
- There is no demand-test clock. Demand data is complete 9 finished days after the shop's first
  customer (the first `orderHistory` day with an hour report), open days or not, consecutive or not.
  The game files no hour report for an open hour with 0 customers, so every hour and weekday without
  a report counts as 0 demand. A shop with complete data gets the full demand plan even with fewer
  than `HOUR_WEEKS_THIN` weeks.
- "Demand data complete: switch to the demand plan" shows when the data is complete, every serving
  station is staffed every hour the shop is open now, and the demand plan asks for fewer serving
  hours than that.
- The plan still places unassigned staff and hires (`addPeople`). The schedule write sends only the
  entries of people assigned to the site and says how many people to add; a second write fills the
  holes once the player has assigned or hired them.
- No reordering on the board (Peter, 23 September 2026). The game delivers grouped by importer, a
  group placed by its first contract in the whole plan, so moving one contract within a line often
  cannot be expressed without moving that importer's deliveries of other items too. The board shows a
  line's contracts read-only in delivery order; the plan order is set at the headquarters in game. The
  mod keeps `order` in `/write/imports` for later.
- Plain contracts on one line split cap-aware (Peter, 23 September 2026): one budget per importer and
  item across the whole write, walked in the game's delivery order; demand the caps leave is shown
  before Apply. A Smart Delivery contract ahead in that order is named in the dialog, not budgeted.
- No pairing code (Peter, 23 September 2026, after trying it in game: a code every launch is too
  annoying). The first write from a browser shows the game's own confirm popup; the player approves
  once per browser, remembered across launches (game-link-api.md, "Approving a browser"). This
  replaces section 2's pairing code and sessionStorage.
- Schedule writes are refused at a headquarters (its shifts follow the day's opening slot on every
  open day, and unassigning people there clears plans and import agents).
- Offices get a default plan of their own (a board branch, not the mod): computers staffed 24/7 = 3
  in a 50-capacity building, proportionally fewer in smaller ones (at least 1); every computer 8 to 22
  on weekdays; half the computers 8 to 22 on weekends. The game's office demand formula is exact
  (`docs/staffing-assistant-scope.md`), so an exact office plan can follow.

**What the page already sends the writes.** `supply.imports[]` and `supply.factories.depots` rows
carry `smart`, `target`, `plainAfter`, `plainBefore`, `levelName`, `levelId` and `contracts[]`
(`order` = index in `importPartnerships`, `id`, importer, `smart`, `amount`, `active`, `repeating`,
`agent`) in delivery order; the Set to box value is the figure to write. Businesses carry
`uniformGapSkills` (raw skill ids). Each retail site carries the demand plan and `fullCover` (with
`openAllHours`, `addPeople`), shifts as `{wd, station (itemInstances id), from, to, employee,
kind}` via the compressed rows `_shift_row()` writes.

**Still open from section 7:** item 2 (telling a BizMan screen is open on the target), item 3
(`onUniformChanged` re-dressing), item 5 (a backup Smart Delivery contract sees the first one's
cargo; the board already assumes it).

**Tooling.** Game IL and reflection: `research/il_dump.py Type.Method ...` (dnfile/dncil from
`research/probe-deps`), `research/reflect_types.ps1 -Pattern <regex>` and
`research/member_visibility.ps1` in the main folder (local, not committed). The mod builds only on
the Mac (mod README; SSH and headless Unity build notes in the game-link memory). Review panel:
Opus 5.5 subagent + gpt-6-sol through `codex exec` (Codex CLI 0.156.1 or later); Grok was out of
usage balance on 23 September.

## 10. Status and hand-over (24 September 2026)

**Steps 2 to 4 are built and almost done**, on branch `write-back` (worktree
`C:/Users/Peter/Coding_Projects/big-copilot-write-back`). Nothing is pushed and there is no PR yet.
The wire contract is `docs/game-link-api.md` "### Writes"; this section supersedes section 9 where
the two differ.

**What is on the branch**

- Mod 0.2.0 (`mod/BigCopilotLink/`), review-green: write endpoints for uniforms, imports and schedule,
  plus undo and dry runs. It is built on the Mac with `research/macbuild-write-back.sh` in the main checkout (local): scp the
  Scripts, Locales and manifest, run a headless Unity build, fetch new `.meta` files back, then
  restore the Mac checkout. The DLL is installed in Windows `ModsLocal/BigCopilotLink`, with the
  Workshop copy disabled by Peter for testing.
- **No pairing code** (Peter, 23 Sep: a code every launch was too annoying). The first write from a
  browser shows the game's own confirm popup (`HudConfirm`). The approval is remembered per browser,
  as a hash in PlayerPrefs `BigCopilotLink.approved`, and the options panel has "Forget approved
  browsers". Two edge cases were declined in review: the map opened and closed within one pump tick,
  and the race between first use and approval.
- Page (`web/app.js`, the board script): the write dialogs ported from the canvas
  (`mockup/write-dialogs`, approved by Peter), the approval inside the write's own dialog, the
  uniforms buttons (in-place re-asks, "Leave it out"), imports Apply with a cap-aware plain split
  (no board reorder, per Peter), and the schedule write for one shop or a run of shops. The mock
  (`tools/game_link_mock.py`) speaks the whole contract.
- Peter's in-game test on 24 Sep found three things. Changing the preset refreshed the whole dialog
  (fixed: re-asks now update in place). After an undo, uniforms and schedule should be re-doable
  (fixed: see the open work below).

**Open work, in order**

1. **Undo gate** (commit b35d546). After an undo the dialog shows "Undone in the game" and a disabled
   "Set/Apply/Write again". The button should unlock only once the board has read the game after the
   undo. gpt-6-sol's review found two MUST-FIX races, and Opus's review of the same commit may not
   have landed. The fix to build: web/app.js tags every board build with the moment its `/save`
   fetch started (or a fetch sequence number). The gate opens only on a build whose fetch started
   after the undo answer arrived, instead of comparing stamps. gpt-6-sol's findings are saved in
   `research/write-back-handover/undo-gate-r7-sol.md`, and Opus's in `undo-gate-r7-opus.md`, which adds a mod fix: stamps must never repeat within one second ("last + 1", as the mock does). The earlier review briefs are beside them
   (`review_*.md`). It keeps re-checking on every build
   until the player clicks, and closes again on a source or company switch. The stamp should be
   committed (`lastLinkStamp`) only after the board accepts a build. Then run a scoped review round.
2. **Narrow supply fix: redo it literally.** Peter chose "only remove the phantom: goods a factory
   forwards to a depot that then uses none of them don't count". The branch's gross in/out model went
   broader than that, and review round 2 found two more MUST-FIXes: a factory, then a depot, then a
   consuming factory; and a same-day import mixed with a top-up. Saved in
   `research/write-back-handover/supply-narrow-r2-sol.md` in the main checkout. Next: keep the base
   net model of main and change only this. When a factory's same-day outflow of an item goes to a
   depot whose draw of that item is nil (a stock-target fill nothing uses, as Factory Jewelry to
   Jewelry Distrib., Metal Band 5,000), don't let it pull the factory's intake down. Nothing else
   should differ from base. Paper Bag's Monday undercount can stay: its 25,000 level covers it.
   The current work is on branch `supply-narrow` (worktree
   `C:/Users/Peter/Coding_Projects/big-copilot-supply-narrow`, from main 92c3ef8). It uses gross
   in/out flows per site instead of per-day net figures. On Peter's save, Metal Band's Used / week is
   15,120 + 0 (it was 20,200) and Paper Bag's is 19,530. Review round 2 is on its latest commit.
   Finish the review, then PR, merge and deploy the site (the wrong suggestion is live), then merge
   main into `write-back` (generated files: take either side and rebuild). The demand-based supply
   model (10-15% margin) belongs to the separate UX orchestration session, as part of R8. The branch
   `supply-audit-fixes` is reference only.
3. **Game build 3682**: re-verify, with `research/il_dump.py`, the private members the mod reads by
   reflection. The mod README's game-API table lists them: `HudConfirmUi._onConfirmAction`,
   `container`, `showInFullMenu`, `PurchasingAgentPlanUI._currentImportPartnership`, and the
   `ScheduleHelper` / `BizManSchedule` members.
4. **Peter's final in-game test** of the whole flow: approve, the three writes, undo and re-do,
   restart without asking again. Serve the page with launch config `write-back-web` on
   http://localhost:8792.
5. **Release**: a changelog entry (a new capability, docs/contributing.md), the PR, merge, Peter
   uploads mod 0.2.0 through the in-game Mod Creator (mod README "Publish to the Workshop"), then the
   site deploy. The page gates writes on `/health.writes`, so a deploy before the upload shows
   nothing new.

**Review panel**: one Opus 5.5 subagent (Plan type, read-only) plus gpt-6-sol through
`codex exec -m gpt-6-sol -s read-only "<brief>" </dev/null`, with the brief written to a file and
scoped to one commit. Go on until neither reports a MUST-FIX or SHOULD-FIX. If a rule keeps drawing
findings round after round, simplify the rule; the undo's re-ask went through three designs.
Workers: Opus 5.5 subagents with explicit file ownership and a hard no-delete rule (no rm, git
clean/restore/checkout/stash). A worker once tried to delete something unexpected and Peter stopped
it.
