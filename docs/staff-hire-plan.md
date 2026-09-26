# Staff page: mass hire (issue #89), plan and contracts

Written 25 Sep 2026 from Peter's decisions and the approved canvas
(https://claude.ai/artifact/DmH1wQnG58khjVYu4JgimJ, generator
`mockup/staff-hire/build_staff_canvas.py`, notes `mockup/staff-hire/NOTES.md`). This file is
what the parallel workers build against. Where it and the canvas notes differ, this file wins;
the differences are listed in section 1.

Company › Payroll becomes **Staff**: for every site the board plans, the people it still needs,
filled first by moving spare staff, then from the headhunters' candidates, then one confirm that
hires, assigns and writes the week through the Big Copilot Link mod. One release: payload, page,
mock, mod 0.3.0, Workshop update.

## 1. Decisions this plan carries

Peter's (25 Sep 2026):

- Covers every site. Headcount is proposed only where the board plans staffing: shops, offices
  (new office plan, section 2.4), factories. Headquarters and warehouses list what the
  headhunters found, picked by hand.
- A site opened without staff is planned with the default: full cover 24/7 for a shop, the
  office default for an office.
- Surplus people move between sites before anyone is hired; moves stay within one role.
- Each line is a role and a count. Company-wide demand filters, with a per-role override in the
  drawer. Auto-pick takes the highest skill; the player can untick and tick.
- A candidate's demand that the target site does not meet is a **site warning, not a hiring
  decision**: it never stops auto-pick. This overrides canvas note decision 4 ("a red demand is
  never auto-picked") and its steering of Coffee Machine people to the sites that have one.
- The best people go to sites in list order.
- Candidates in a drawer under each role (canvas option A). Option B's table is what the
  HQ/warehouse Candidates buttons open, and "Show all N who pass".
- Apply = review (who goes where, their days, the added wage bill) + one confirm. No undo.
- Old Payroll content stays at the bottom of the page.

Designer defaults kept: the working state is an indeterminate bar; the not-linked page is fully
interactive with "hours left" marked as of the save; wording follows the staffing vocabulary
(hours, days, people; no roster, shift or post outside a demand's own game text).

Decided here (not blockers, flagged for review):

- **Every site the call touches has its week replaced by the plan the page shows**, exactly as
  "Write this week to the game" does today. That includes a move's source site when the person
  moved has shifts there now (the game's move clears their shifts anyway; writing the source's
  plan keeps it covered). The review lists each such site with shifts removed and added.
- `hoursUntilExpiring` is not a compare-and-set value: it falls every game hour, so an exact
  expect would refuse any call made an hour after the save. The candidate's presence in the
  game's list is the check (`gone`), and its wage is the compare-and-set (`changed`).

## 2. Payload contract (extraction worker)

Two new top-level keys, `candidates` and `hiring`, plus fields on existing rows. The existing
`staff` key (`_staff_summary`, Payroll) keeps its name and shape. Everything is built in
`extract()` and its `_` helpers; nothing is read at import time (AGENTS.md trap). Anything
whose order reaches the payload goes through `_in_order()`, ties broken explicitly.

Privacy: candidate names are save data like employee names. They are in the payload, stay in
the browser (the Pyodide build never sends them anywhere) and never reach the community API,
logs or tests. Test fixtures use invented names only.

### 2.1 One reader for a character, both save layouts

New `_character(save, instance) -> dict` returns `{"name", "ageDays", "skills": [...]}` from
`instance.characterData` when present, else from the instance's own top-level `name`,
`ageInDays`, `skills` (older saves). `_staff()` switches to it (today it reads `characterData`
only and shows `?` on older saves), and `_candidates()` uses it. Test both layouts.

### 2.2 `candidates`

From `GameInstance.CandidateEmployeeInstances` (absent key: `[]`). Drop entries with
`hired` or `declined` true. One row per candidate, ordered by top skill level descending, then
wage ascending, then id:

```json
{"id": "<EmployeeInstance.id>",
 "name": "Ada Brandt",
 "age": 34,
 "skill": "ba:skill_customerservice",
 "level": 88,
 "skills": [{"skill": "ba:skill_customerservice", "level": 88}, {"skill": "ba:skill_cleaning", "level": 31}],
 "wage": 26.5,
 "demands": ["ba:jobdemand_noweekends"],
 "hoursLeft": 71,
 "source": "headhunter"}
```

- `skill`/`level` is the top skill, rounded as `_staff()` does; `skills` all of them, highest first.
- `wage` is `hourlyWage` via `money()`; `demands` the `demands` list as the save holds it (0-3
  `ba:jobdemand_*` slugs, `_in_order()`).
- `hoursLeft` is `candidateInfo.hoursUntilExpiring` as of the save (candidates leave at 0; 168 h
  from arrival).
- `source`: `"headhunter"` when `candidateInfo.sourceHeadhunterId` is set, `"jobboard"` when
  `fromJobBoard`, `"agency"` when `sourceAddress` is set, else `"other"`.
- Size: about 1,600 candidates in a late save, roughly 250 KB of JSON. Acceptable; if the test
  save shows more, drop `skills` below the second entry.

### 2.3 `hiring`

```json
{"sites": [<site>], "bench": [<employeeId>], "demandKinds": {"<slug>": "schedule" | "site" | "company"},
 "company": {"<slug>": true | false}}
```

A `<site>` for every business the player runs (the `businesses` order):

```json
{"key": "<business key>", "name": "…", "kind": "shop" | "office" | "factory" | "hq" | "warehouse",
 "address": {"street": "ba:street_…", "number": 12},
 "planned": true, "new": false,
 "accepts": ["ba:skill_customerservice", "ba:skill_cleaning"],
 "plans": {"<variant>": {"hireWeeks": [<hireWeek>], "spare": ["<employeeId>"], "bench": ["<employeeId>"]}},
 "facts": {"ba:jobdemand_coffeemachine": true}}
```

- `planned` is true for shops, offices, factories; false for `hq` and `warehouse` (candidates only;
  `plans` is `{}`).
- `new` is true when no employee is assigned to the site. A new shop's Staff page variant is
  `full`, whatever the roster's stored pick (see 3.2).
- `accepts` is the game's assign check (`AssignToBusinessAndHireMassAction`): the business
  type's `employeePrimarySkills`, plus cleaning when it `NeedsCleaning`, security when it has the
  `allowtheft` tag, delivery driver when the building type has `requiredBuildingSkills`. The mod
  refuses a hire whose candidate has none of these (`no_skill`); the board never proposes one.
- `plans` is keyed by variant: a shop has `demand` and, where `spOffersFull` holds, `full`; a
  factory `cap` and `dem` (the two `factoryStaffing` sizings); an office `office`. The plan
  itself (shifts, headcount) stays where it is today (`staffing`, `factoryStaffing`, new
  `officeStaffing`); `plans` carries only what hiring needs on top:
  - `hireWeeks`: the packing `_hires_for()` already computes, exposed. One entry per
    hypothetical hire:
    ```json
    {"skill": "ba:skill_customerservice", "hours": 44, "days": 4,
     "slots": [{"shift": 17, "d": 1, "f": 8, "t": 20, "station": "<itemInstanceId>"}]}
    ```
    `shift` is the index of that open entry (`p: null`) in the plan row's `shifts`, so the page
    can put a person's id on it. `sum(len(hireWeeks) for skill) == headcount[skill].hire` for every
    skill; a test pins it.
  - `spare`: ids of the site's own staff that this variant gives no hours (the plan's
    "N could go"), in `_in_order()` order. Factories: the same idea as `headcount.spare`, now with
    ids.
  - `bench`: the unassigned people this variant already counts on (`addPeople.assign` ids).
- `facts`: for site-level demands (`demandKinds[slug] == "site"`, e.g. coffee machine,
  cleanliness), whether this site meets it, from the table `_job_demands()` already uses. A
  demand the table does not know is left out (no guess), as there.
- `bench`: every unassigned employee id.
- `demandKinds` classifies every slug the demand table knows: `schedule` (no nights, no
  weekends, part-time, full-time, four-day week, no morning/evening, no cleaning shifts: judged by
  the page against the hire week the person gets), `site` (judged by `facts`), `company` (health
  insurance tiers, happy boss: judged once by `company`).
- `shiftPrint` is already on every business row (`businesses[].shiftPrint`); the hire write's
  per-site `expect` uses it. The extraction worker makes sure factories and offices carry it too.

### 2.4 New plans the page needs

- **Factories** (on main since PR #114): `factoryStaffing[sizing]` rows. The payload row has no
  `shifts` today (only `detail=True` keeps them). Add `shifts` in the shop row's shape
  (`_shift_row`) with station item ids, and `print`-compatible fields, so a factory's week can be
  written. The Staff page uses the sizing the Supply switch shows.
- **Offices** (no planner on main): new `officeStaffing`, built like `_factory_staffing()`: the
  shop placer over a synthetic grid, one role (the office's professional skill from
  `STATION_SKILLS`, the computer post), one station per computer. **Peter's office default
  (25 Sep 2026):** an office at 24/7 needs 3 people per computer at 50 capacity, proportionally
  fewer below that, minimum 1; weekdays every computer staffed 8-22; weekends half the computers
  8-22. Same 12 h shift, 14 h day, 50 h week, 30 h floor rules, same `headcount`/`addPeople`/
  `hireWeeks` fields. **As a formula**, for every office with C computers and door capacity
  `cap` (the building's `customerCapacity`, the office grid's `door`):
  - `N24 = min(C, max(1, round(3 * cap / 50)))` computers (half rounds up) are staffed
    00-24 every day;
  - on weekdays (Mon-Fri) every computer is staffed 08-22;
  - on weekends `ceil(C / 2)` computers are staffed 08-22, the N24 always-on ones counting
    among them (computers are taken in station order, so the always-on ones come first);
  - an hour the office is shut in the save is left out (the write never changes opening
    hours): an office open 09-17 gets every staffed computer 09-17 only, always-on ones
    included, and a closed day gets nobody. An office whose save holds no opening hours at
    all is not clipped.
- Shops: nothing new beyond `hireWeeks`, `spare`, `bench` on both variants.

### 2.4a As built (extraction worker, 25 Sep 2026)

Where the build differs from or adds to 2.1-2.4; the board worker reads these too.

- **`hiring.people`** (new): `{<employeeId>: {name, skills: [{skill, level}], wage, site,
  hours, demands}}` for everybody a site's `spare` or `bench`, or the top-level `bench`,
  names. The page needs a moved or bench person's skills, level and wage and had no other
  source (`staff` is only a summary). `site` is the business key or null.
- `candidates`: `level` and each `skills[].level` are whole numbers; `age` is in the game's
  years, `ageInDays // gameVariables.daysPerYear` (60 on every save here; retirement is at
  67 such years), null without the field. `demands` is sorted.
- **Size**: 1,590 candidates on the late test save are 453 KB of compact JSON (the full
  payload 2.25 MB), not 250 KB. No candidate holds more than two skills, so the "drop
  `skills` below the second" fallback saves nothing; left as is for the integrator.
- The older character layout (name/skills on the instance) exists only in saves of builds
  1714-1718, far below `MIN_BUILD`, where skill names are integers. `_character()` reads it
  anyway; nothing supported depends on it.
- `plans.full` is present only where the board's `spOffersFull` holds (a station to staff);
  a failed shop row gives `plans: {}`.
- `hireWeeks` within a role: fullest first. A role's `hire` equals its weeks by
  construction; an empty week (`slots: []`) pads it if `min - have` ever exceeds the
  packing, which the arithmetic rules out and no save showed.
- `spare` counts only people usable in a role the plan staffs, so an unmeasured shop's
  cashiers are never offered as moves.
- `facts` covers every `site` demand: `building` and `clean` as `_job_demands()` judges
  them, and `desk` (classed `site`, not listed in 2.3) as "the site holds such an item
  anywhere", since a hire has no desk yet.
- `company`: insurance tiers are met when some HR manager plan with a manager in place
  offers that tier or better; a happy boss is `Happiness >= 50`.
- `accepts` is the table `ASSIGN_SKILLS`, read from the businesstypes and buildingtypes
  bundles at build 3682 (retail, office, cinema and theatre buildings need cleaning;
  warehouses need nothing; no building requires a driver). Gym and hairdresser list
  security among their own primary skills.
- Sites: vacant rows and `businesstype_empty` are left out; a distribution centre counts as
  a warehouse.
- **Factory rows** now ship `stations`, `people`, `shifts` and `addPeople` (`placed` and
  `shortHours` stay test-only).
- **The office default as built** (`_office_runs()`, `_office_always_on()`): the formula in
  2.4, for every office. The row says `alwaysOn` (N24). Offices draw on the unassigned
  people no shop plan (either variant) counts on, in office order. `officeStaffing` rows
  are described in `docs/architecture.md`.

### 2.4b After Peter's in-game test (26 September 2026)

- **Every open hour is staffed, never an hour more** (Peter, 26 September 2026: "Staff
  the hours it's open, never change opening"). The Staff page never uses full cover and
  every hire request sends `openAllHours: false`. Every shop that full cover is offered at
  and that opens some hour gets `openCover` (`_open_need()`), placed beside full cover
  with its bench draws recorded like full cover's (`_bench_claimed()` reads it too):
  without complete data, the demand curve with every open hour whose basis is `none`
  staffed in full (`complete` false), and it is the site's only plan, `open`; with
  complete data, full cover of the hours the shop opens (`complete` true), taken where the
  player runs full cover, else `demand`. A shop the game opens no hour gets no plan
  (`noHours`), and the page says to set its opening hours first. A report-less hour at a
  shop with complete data is still nobody came (the 23 September rule).
- **Desk demands at a site with no plan** (headquarters, warehouse): `stations` lists the
  desk demands each furniture group's root meets; with no week the page says "met at a
  desk here: seat them there". Within a tier of the placement rank (already given hours,
  or not), the office's own person whose desk demand a station meets comes first; never
  somebody from the bench over the site's own, and only where the site's desks are known.
- **Hires get full weeks.** `_spread_residue()` moves the open shifts off the day they
  pile up on by swapping days with staff who are off that day, until no more than
  `ceil(hours / 50)` run at one hour; `_fill_hire_weeks()` then tops up a hire under 30
  hours with whole shifts from staff above their floor. Neither takes anybody under
  `_hire_floor()`: their hours demand's floor and the hours the game has them on now
  (`people[].now`, `assignedWeeklyHours`). The law firm went from 22 one-day hires to 7
  of 35 to 49 hours.
- **`fewer`** on each plan: the site's own people the week gives fewer hours than now;
  the review names them for the sites whose week it replaces.
- **Desk and chair demands are per station** (`station` in `demandKinds`): the site's
  `stations` lists the demands each station's furniture group meets
  (`_station_groups()`, the game's `assignedWorkStationItems`), and the page judges them
  against the stations a person's week is on. `facts` no longer carries them.
- **Health insurance** is a person's own HR plan, and a hire joins none: `company` says
  `"plan"` where some HR manager's plan offers the tier, and the page warns "add them to
  an HR plan that offers it".
- **Where to find them** (under the roles table): for each role places stay open in, how
  many more are needed, how many candidates there are (or that the filters leave them all
  out), and where people come from: a Headhunter at the headquarters recruiting the role,
  or the game's Recruitment Agency; a headhunter already recruiting it is said
  (`hiring.recruiting`, from `headhunterPlans`).
- **Staff with no hours** (Peter's live game, 26 September 2026): a shop's `unstaffed`
  (`{demand, full}`, the plans its Staffing block writes, read as that block picks them;
  shops only, since an office has no Staffing block) is, per role, weekday and hour, the site's own people the plan puts on
  the role less everybody on its stations in the game's week (never below none), in roles
  where some of them (not in training, with some of their own planned hours unstaffed)
  have no hours at the site at all, from
  `UNSTAFFED_MIN_HOURS` (8) a week. It shows when nothing needs hiring too. A small box under the roles table names each such
  site, the hours and the idle people, and links to the site's Staffing, whose write puts
  the week in. Nobody is hired for those hours, so the order does not count them.
- **Styled option lists**: a Staff select opens the page's own list (`#hsSelPop`, where the
  pointer is a mouse) instead of the system's; the select stays the control.

### 2.5 Tests (extraction)

New `tests/test_staff_hire.py`, synthetic saves only: both character layouts for `_staff` and
`_candidates`; hired/declined dropped; ordering and ties; `hireWeeks` count equals
`headcount.hire` for shop demand, shop full, factory both sizings, office; every slot's `shift`
points at a `p: null` entry with the same day and hours; `spare` excludes anyone with hours;
`accepts` for a shop with and without cleaning/security; HQ and warehouse `planned` false with
empty `plans`; `officeStaffing` covers every computer every open hour; payload stable under
two `PYTHONHASHSEED` values.

## 3. The page (board worker)

### 3.1 Navigation

- `SUBS.company` item `payroll` becomes `staff` ("Staff"), section `secStaff`
  (`data-sub="staff"`), `SEC_PAGE` updated, `PAGE_DRAWS` row `"company/staff"` replacing
  `"company/payroll"` (calm refresh: the page redraws only when shown).
- `PAGE_ALIASES` gains `payroll: ["company", "staff"]`; a remembered sub-view `payroll` maps to
  `staff`. Old links and the `companydemand` finding land on Staff.
- Search entry: `id: "staff"`, "Company › Staff", synonyms keep wages, salary, payroll,
  headcount, employees, and add hire, hiring, candidates, headhunter.
- Tests that anchor on Payroll move with it: `tests/navigation.test.cjs`,
  `tests/calm_refresh.test.cjs`, `tests/today_layout.test.cjs`, `tests/search.test.cjs`,
  `tests/job_demands.test.cjs`, and the Payroll reference in `tests/test_staffing.py` (this one is
  the board worker's, not the extraction worker's).

### 3.2 What the page computes (JS, deterministic)

For each planned site, the variant: a shop that is `new` uses `full`; otherwise the roster's own
pick (`spPlanRead`, demand unless the player picked full); factories the Supply sizing; offices
`office`. Needs per role = that variant's `hireWeeks` for the role.

Netting, in this order, per role:

1. Bench people the plan already counts on are assigned at their site (they already have their
   week in the plan).
2. Moves: a `spare` person at one site fills a hire week at another site in the same role
   (`accepts` must hold at the target). Spares are taken in site list order, targets in site
   list order; each move takes the target's first unfilled hire week. Moves are rows with a
   checkbox, ticked by default; unticking one returns that week to hiring.
3. Hires: the remaining hire weeks, filled by auto-pick.

Auto-pick (the reference is the canvas's `pick(pool)`, changed as section 1 says):

- Pool per role: candidates whose `skills` include the role's skill, and who pass the filters.
- Filters: company-wide "leave out anyone who asks for" demand chips (with counts), minimum skill,
  maximum wage; the drawer's scope switch ("Every role / <role> only") gives a role its own set.
  Filters live in `localStorage` per character, wrapped in try/catch.
- Order: level of the role's skill descending, wage ascending, id ascending.
- Sites in list order; within a site, hire weeks in payload order. A candidate takes the first
  unfilled week whose schedule demands it meets; if none of the site's weeks fits, the first
  unfilled week, with a warning. Site and company demands never block; they become warnings on
  the person and the site chip (red: not met anywhere; amber: not met at this site).
- Unticking frees the week for the next best; ticking an extra person over-picks and says "over
  the plan" (placed at the first site with a week in that role, sharing it: no shifts, assign only).
- A role with fewer passing candidates than weeks shows the hatched short part and "N short".

HQ and warehouses: the "Not planned" table (role, where, found, best skill, wage range, leaving
within a day) with a Candidates button opening option B's table; a tick there assigns the person
to the chosen HQ/warehouse with no week (assign only).

### 3.3 The write the page sends

On Review: a dry run of `POST /write/hire` (section 4), then the review dialog (reusing the
`gw-` shell and `gwConfirm`, with `changed: () => false` since there is no undo): tiles (hire,
move, sites, added wage bill), who goes where site by site with each person's days, the places
nobody fills, sites whose week is rewritten (shifts removed/added), warnings, one confirm
labelled "Hire N, move M". Wage bill added = sum over hires of `wage * hireWeek.hours / 7` a day.

Each touched site's `days` is built as `gwRosterPlan` builds a schedule write today, with the
plan's open entries now carrying the id of the person put on that hire week (candidate id,
moved or bench employee id). Hire weeks left unfilled stay empty, as now. A full-cover shop sends
`openAllHours: true`. HQ and warehouse targets send `days: null` (assign only).

States after confirm: working (indeterminate bar), done (no Undo; "to let someone go, use
MyEmployees in the game"), partial (the `gone` candidates struck through; their weeks stay open;
"Pick N more" re-opens the review for those weeks only after the refresh), refused (each code in
4.4 with its fix), not linked (everything computed from the save; Review disabled with how to
link). Review is disabled unless `/health.writes` includes `"hire"`, with "Update the mod to
0.3.0" when it does not.

After review round 1 (25 Sep 2026): the write replaces all seven days, so a factory's or an
office's `days` also keeps the live shifts on stations its plan does not staff (drivers,
cleaners; factory rows now carry `current`), the plan winning where one overlaps it; a move
source whose week is not rewritten gets a "Hours left empty" line from the answer's
`moved[].shiftsCleared`; a spare moves only in a role it is spare in (`plan.spareSkills`);
nobody in training (`hiring.people[].training`) is moved or assigned, and a plan's bench entries
are written only for people this call assigns; "Not planned" opens the HQ/warehouse hand pick
even for a skill a planned site hires; a body over 2 MiB (the mod's hire cap) is named before
anything is sent.

Second design (25 Sep 2026, mockup/staff-hire-v2): the page is an "Open places" table and a
"When you hire" panel with one button; Change picks opens one role over the page; the "Not
planned" table and the hand pick are replaced by Quick hire (any role, any site, the best N
matches, plan hours at a planned site, none at HQ/warehouses) on the same `/write/hire` call;
Part-time is left out by default for shop roles. The page's classes are `hs-`.

New classes are `hr-`; `web/app.js` needs no change for a new kind (`gameWrite`, `wellFormed`
are generic); the board's `GW_DOES`, `GW_NOUN`, `GW_REFUSE` tables get the `hire` entries.

### 3.4 Tests (board)

New `tests/staff_hire.test.cjs` (Playwright, hand-made payload fixture in the section 2 shape):
netting order (bench, moves, hires), auto-pick order and ties, filters and per-role override,
site demand mismatch warns but still picks, short roles, over-pick, the request body built for a
shop (demand and full), a factory, an office, an HQ assign-only, and a move with its source site
rewritten; the review dialog from a dry-run answer; partial, refused and not-linked states;
Review disabled without `"hire"` in `writes`; phone width without sideways scroll; calm refresh
does not redraw Staff while hidden. Plus the moved Payroll anchors.

## 4. Wire contract: `POST /write/hire`

Additive, like 0.2.0's writes: `/health` lists `"hire"` in `writes`, `schemaVersion` stays 1, the
clients gate on `writes`. Nothing else in the contract changes, so no schemaVersion bump and no
one-commit bump across mod and clients; the doc and the mock still land together (section 5,
worker B), and the mod follows the doc.

Everything in "Every write" in `docs/game-link-api.md` holds (token, 256 KiB, dry run,
threading, busy, cannot_write, MarkChange, notification, refresh, `stamp`), except where this
section says otherwise.

### 4.1 Request

```json
{"dryRun": true,
 "sites": [{"address": {"street": "ba:street_secondavenue", "number": 12},
            "expect": "9f86d081",
            "openAllHours": false,
            "days": [{"d": 1, "shifts": [{"f": 8, "t": 20, "employeeId": "…", "itemInstanceId": "…"}]}]},
           {"address": {"street": "ba:street_bleecker", "number": 40}, "expect": null, "days": null}],
 "hires": [{"candidateId": "…", "address": {"street": "ba:street_secondavenue", "number": 12},
            "expect": {"wage": 26.5}, "seenHoursLeft": 71}],
 "moves": [{"employeeId": "…", "from": {"street": "…", "number": 7},
            "to": {"street": "ba:street_secondavenue", "number": 12}}]}
```

- `hires[]`: a candidate hired and assigned to `address`. `expect.wage` is the candidate's
  `hourlyWage` as the bytes had it. `seenHoursLeft` is informational (the mod answers the live
  value).
- `moves[]`: an employee assigned to `to`. `from` is where the bytes had them, `null` for an
  unassigned (bench) employee; it is the move's compare-and-set.
- `sites[]`: every address named by a hire or move target, plus every move source whose week the
  page rewrites. `days` has `/write/schedule`'s shape and rules and replaces the site's week;
  `expect` is its shift print. `days: null` means assign only, week untouched, and `expect` is
  then ignored (must be null). A target named by a hire or move with no `sites` entry is
  `400 bad_request`.
- Shifts may name people the same call hires or moves in; they count as assigned there.
- The same candidate or employee twice, or one site twice, is `400 bad_request`.

### 4.2 Order the mod applies (one main-thread walk)

1. All checks (4.4) for every row. A dry run stops here.
2. Moves, the game's `AssignBusinessMassAction` path: `UnassignEmployeeFromAllWorkshifts`
   (clears their shifts and driver slot, adds the game's to-do), `ReloadCachedFulfilled` at the
   old and new business, set `assignedAddress`.
3. Hires, the game's `AssignToBusinessAndHireMassAction` path: set `assignedAddress`, then
   `EmployeeHelper.HireCandidate(candidate)`. It keeps the same `EmployeeInstance` (same `id`),
   removes it from `CandidateEmployeeInstances`, clears `candidateInfo`, sets `dayHired`, finishes
   a pending salary negotiation as accepted, adds the to-do, fires `ba:gameevent_employeehired`.
4. Each `sites[]` entry with `days`: the schedule write's apply, unchanged (per-employee updates,
   security level, opening hours when `openAllHours`).
5. `MarkChange()`, one notification ("Big Copilot hired 34 and moved 3"), refresh. The `schedule`
   kind's undo is cleared for every site this call wrote.

### 4.3 Partial result

A candidate who has left the game's list since the bytes (expired, hired or discarded in the
phone) is `gone`. `gone` never refuses: the apply skips that hire, drops every shift naming
them from their site's `days` (those hours stay empty), and applies the rest. Every other error
refuses the whole call, as for every write. The dry run reports `gone` the same way, so the
review can say it before the confirm.

### 4.4 Answer

```json
{"ok": true, "kind": "hire", "dryRun": true, "stamp": "…",
 "hired": [{"candidateId": "…", "name": "Ada Brandt", "business": "Costy Co 2", "wage": 26.5, "hoursLeft": 70}],
 "moved": [{"employeeId": "…", "name": "…", "from": "Costy Co 5", "to": "Costy Co 2", "shiftsCleared": 4}],
 "skipped": [{"candidateId": "…", "name": "…", "reason": "gone", "hoursDropped": 44}],
 "sites": [{"address": {}, "business": "Costy Co 2", "before": {"shifts": 84, "print": "…"},
            "after": {"shifts": 90, "print": "…"}, "removed": 84, "added": 90, "openedHours": false,
            "leftWithout": [], "warnings": [], "siteError": null}],
 "wageAdded": 1243.5,
 "rows": []}
```

- `hired`/`moved` are what the call did (a dry run: would do). `wageAdded` is the live sum of
  `hourlyWage` of the hires (per hour; the page turns it into a day).
- `sites[]` has the schedule write's answer fields per site; assign-only sites answer
  `before`/`after` null.
- `rows` (as in `409 refused`/`changed` and a dry run with `ok` false), each
  `{"scope": "hire" | "move" | "site" | "shift", "id" | "address", "d"?, "i"?, "error"}`:
  - hire: `not_found` (never was a candidate: a bad id), `changed` (wage differs; the page
    refreshes and re-plans), `no_skill` (none of the business's `accepts`).
  - move: `not_found`, `changed` (not at `from` any more), `in_training` (the game's move
    refuses it), `no_skill`.
  - site: `not_found`, `not_rented`, `no_business` (`ba:businesstype_empty`, which the game's
    filter excludes), `screen_open` (BizMan schedule open on it, or an auto-fill running),
    `headquarters` (`days` not null at an HQ), `changed` (print).
  - shift: the schedule write's (`not_assigned`, `no_station`, `no_skill`, `bad_hours`,
    `overlap_person`, `overlap_station`), judged as if the call's moves and hires had happened.
- `409 {"error": "cannot_write", "reason": "myemployees"}`: the MyEmployees app is open in the
  phone (its candidate list or mass actions would go stale). Unlike `saving`, a dry run reports
  it too: `200`, `ok` false, `blocked: "myemployees"`, so the review says "Close MyEmployees in
  the game" before the confirm.
- `POST /write/undo {"kind": "hire"}` answers `409 {"error": "no_undo"}`.
- The approval popup's text (`Locales/en.json`) names hiring among what the board may change.

## 5. Worker split

Branch `staff-hire`, one worktree per worker branched from it, merged back in order. Ownership
is by file, and inside `ba_dashboard.py` by anchor region (AGENTS.md table); no worker edits
another's region. Generated `web/` files are not committed by workers A-C; the integrator runs
`python build_web.py` once after the merges (a conflict in a generated file is resolved by that
rebuild).

| Worker | Owns | Builds | Depends on |
| --- | --- | --- | --- |
| **B. Contract** (first, small) | `docs/game-link-api.md` (new `POST /write/hire` section, `writes` list, endpoints list), `docs/mod-write-back-scope.md` (new section: hire and move, game facts from `research/headhunter/`), `tools/game_link_mock.py`, `tests/test_game_link_mock.py`, `tests/game_link_write.test.cjs` (hire cases only) | The mock serves `hire` from the save on disk: candidates, moves, sites with the schedule checker it already has, `gone` (a `--hire-gone <id>` option or a mock control), `myemployees` (a mock control), `no_undo` | this plan |
| **A. Extraction** | `ba_dashboard.py` from the top to `TEMPLATE = r"""` (not `def main(` and after), `ba_save.py` if needed, new `tests/test_staff_hire.py`, `docs/architecture.md` (payload keys `candidates`, `hiring`, `officeStaffing`; the Staff page), `docs/dashboard-reference.md` (Staff) | Section 2 | this plan |
| **C. Board** | `TEMPLATE` in `ba_dashboard.py` (markup, CSS, board script), new `tests/staff_hire.test.cjs`, the Payroll-anchored tests in 3.1 | Section 3 against a fixture in the section 2 shape; then against A's real payload and B's mock | A's shape (this plan), B's mock for the live test |
| **D. Mod** | `mod/BigCopilotLink/**` (new `Scripts/HireWrite.cs`; `WriteService.cs` `Kinds` and the `Prepare` switch; `LinkHttpServer.cs` `WriteKind` and `EndpointsJson`; `Locales/en.json`; `LinkMod.Version` and `ModManifest.asset` `Version` to `0.3.0`; `README.md` tables, the health example, a 0.3.0 in-game checklist), `mod/workshop/description.bbcode` ("New in 0.3.0") | Section 4 in C#, reusing `ScheduleWrite`'s parse, `CheckShifts` and apply with an "assigned in this call" set. Cannot compile here: written by an agent, built by Peter | B's doc |
| **Integrator** | `web/` (rebuild), `web/changelog.json`, merge commits | Merges B, A, C, D; rebuild; full suites; reviews; QA | all |

Order: B lands first (it fixes the contract every other worker reads). A, C and D then run in
parallel. C starts from a hand-made fixture and switches to A's payload when A lands. D can be
built by Peter as soon as it is written; it does not wait for A or C.

Details for D:

- Detect MyEmployees open: `UIs.Instance.fullMenu.myEmployees` (`isActiveAndEnabled` on its
  GameObject, or the phone's current app if there is such a field). Unverified; D names what it
  chose and Peter checks it (step 4 below).
- Reuse the game's own helpers rather than copying their bodies: `EmployeeHelper.HireCandidate`,
  and for moves the same calls `AssignBusinessMassAction` makes. The candidate is found by id in
  `CandidateEmployeeInstances`, the employee by `EmployeeHelper.GetEmployeeById`.
- `ScheduleWrite.CheckPost` refuses `not_assigned` from live `assignedAddress`; `HireWrite`
  passes the call's own assignments in, so a shift naming someone hired or moved in the same call
  passes. `/write/schedule` itself is unchanged.

### What Peter does on the Mac (mod 0.3.0)

1. Pull the branch, open the SDK's Unity project, build as in `mod/BigCopilotLink/README.md`.
2. `curl http://127.0.0.1:8322/health`: `modVersion` `0.3.0`, `writes` includes `"hire"`.
3. With the board on the mock's scenarios passed (integrator's QA), in the game:
   1. Dry run then apply two hires into one shop: both in MyEmployees at that shop, gone from the
      candidate list, their shifts in the BizMan schedule, one notification, board refreshes.
      Note whether the game's "no shifts" to-do clears after the schedule part.
   2. Open MyEmployees, press Review: refused "Close MyEmployees". Close it, retry: works.
   3. Discard a candidate in the phone after the dry run, then confirm: partial, that one skipped,
      the rest hired, their hours left empty; the site's row counts only who was hired. Wait for
      the board to re-read the game, press "Pick N more", confirm: the replacement is hired and
      the site's week is written with them on the open hours (the mock cannot show this: its
      `/save` keeps serving the original bytes after an apply).
   4. A move of a spare from one shop to another: gone from the source's schedule, working at the
      target; try one in training: refused.
   5. BizMan schedule open on a target shop: `screen_open`.
   6. A factory hire with its week (the first factory schedule write ever: check machines take
      the shifts) and an office hire.
   7. An HR manager hired into the HQ: assigned, no shifts written.
   8. 30+ hires in one call: note any hitch (answers whether "working" needs progress).
   9. Save, reload: hires persist with `dayHired`; badge counts right.
4. Publish 0.3.0 to the Workshop (README "Publish to the Workshop"), then the site deploy.

## 6. Tests, gates, release

Per worker, from AGENTS.md "Finishing a change", Node capped
(`node --test --test-concurrency=2`, BelowNormal priority):

- A: `python -m unittest discover -s tests`, then `python build_web.py` (or `--check`).
- B: `python -m unittest tests.test_game_link_mock tests.test_watch_game` and
  `node --test tests/game_link.test.cjs tests/game_link_write.test.cjs`.
- C: `python -m unittest discover -s tests` and `node --test tests/*.test.cjs`, then
  `python build_web.py`.
- D: nothing runs here; a reviewer reads it against the doc and the IL in
  `research/headhunter/`.

Integration: every suite above on the merged branch, then:

1. Review rounds (panel: one Opus, one Grok 4.6, one gpt-6-sol), scoped to the diff, until no
   SHOULD-FIX; triage by real-player likelihood, drop contrived edge cases.
2. Live-browser QA (gpt-6-astra) against the mock: every state of section 3.3, phone width,
   both themes, a real save's render screenshot before shipping (names never leave the machine).
3. Peter's in-game checks (section 5).
4. PR, merge, deploy the site and publish Workshop 0.3.0 the same day. The board gates Review on
   `writes`, so a page deployed before the mod update is safe.

Changelog (integrator, one entry, with the PR number):

> **Hire and place staff for every site at once.** Company › Payroll is now Staff. It adds up
> what each shop, office and factory still needs by role, moves spare people between sites
> first, and picks the most skilled of your headhunters' candidates, with filters for the
> demands you want to avoid. One confirm hires them, puts them at their sites and writes their
> hours, through the Big Copilot Link mod 0.3.0. Hires cannot be undone.

## 7. Open risks, and what still needs Peter

Questions (blocking only where said):

1. **The office default: answered** (25 Sep 2026): Peter's office default in section 2.4.
2. **Moving someone with shifts: answered.** A person can only belong to one business in the game,
   so a move always takes them off the source site; the source site's week is rewritten without
   them (the game's own UnassignEmployeeFromAllWorkshifts does this) and the review shows it. Only
   people the source site's plan does not need (spare) are offered as moves.

Risks:

- The MyEmployees detection is unverified (step 3.2 on the Mac is the check).
- No factory or office week has been written through the mod before (step 3.6).
- The hire week a candidate gets is the planner's hypothetical week with no demands; a person
  with schedule demands may get a week that breaks one. The page warns; the next plan (after the
  refresh) re-plans with the real people, and the roster's own write can fix it.
- Candidates that expire between the save and the confirm: `gone` handles it; the review shows
  "leaves within a day" from the save's `hoursLeft`, which can be up to the save's age out of date
  when not linked.
- Payload size grows by ~250 KB on a late save; the calm-refresh path must not redraw Staff while
  hidden (PAGE_DRAWS row).
- `ba_dashboard.py` is shared by A and C by region; a merge conflict there means one of them left
  its region.
