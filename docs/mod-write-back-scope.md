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

1. Visibility of every game member each write calls (`IsPublic` per member, not the listing):
   `CustomerDemandHelper.ReloadCachedFulfilled`, `BuildingManager.onUniformChanged`,
   `DeliveryHelper.CanModifyContract` / `GetNextDeliveryDay` / `ShouldLimitImporterMaxAmount`,
   `ImportPartnership.GetItemAmountOrderedThisWeek`, `Item.maxOrderAmountPerImporter`,
   `ScheduleHelper.HasSkillForWorkstation`, the four post-shift-change calls. Private ones go
   through reflection as `CanSave()` does, or are re-implemented from IL.
2. How the mod tells that a BizMan screen is open on a given business or contract
   (`ScheduleHelper.Business`, `PurchasingAgentPlanUI._currentImportPartnership`).
3. That `onUniformChanged` re-dresses staff already in the loaded building, or that nothing
   visible needs it.
4. `TimeHelper.GetDayOfWeek` numbering (7 = Sunday is what `IsLockPeriod` implies).
5. Smart Delivery with a backup contract: that the second contract's `GetAmountToBuy` sees the
   stock the first delivered in the same `DoAllDeliveries` pass (delivery straight into
   pallets), else both deliver against the old stock and the backup overfills. Check in game
   with two contracts on one item, or in `DoDeliveries` IL past offset 0x180.
6. Where `NextDeliveryTotal` and the unit price come from (`GetImportProductTotalPrice`,
   discount) so the dry run reports the cost the game will charge.
7. The saves on this Windows machine predate build 3680 in places (one contract carries a
   `minimumOrder` field the class no longer has). Validate the Smart Delivery fix on Peter's
   current save.
8. Opening hours: what the game does when they change (`openingHourSlots` edits in the BizMan
   schedule, any rule or cost on 24-hour opening, what it recomputes), so the full-cover write
   calls the same things.

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
