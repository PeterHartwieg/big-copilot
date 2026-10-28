# Office scheduling decision — issue #503

Status: Peter approved the opt-in plan on 28 October 2026. Refs #503.

The missing office option is an explicit Big Copilot planning choice, not an
established restriction on office scheduling in the game. The investigation below records the original behavior; the implementation now
adds the approved alternative.

## Evidence

- `ba_dashboard.py`, `_staffing()`: retail plans include `fullCover` and
  `openCover`. `template/board.js`, `spOffersOpen()` and `spRosterBlock()` expose
  the eligible alternatives.
- `ba_dashboard.py`, `_office_site_plan()`: offices receive one plan from
  `_office_need()`, with `_office_runs()` as the fallback for unmeasured hours.
  There is no office `openCover` alternative. `spOfficeRoster()` renders this
  single plan, and `gwRosterPlan()` selects it for game-link writes.
- `docs/dashboard-reference.md`, "An office's demand plan", explicitly records
  no office full-cover test or hand-over and Peter's 10 October 2026 decision.
  `_office_runs()` and `docs/archive/staff-hire-plan.md`, section 2.4, attribute
  the fallback to Peter's 25 September decision: some computers around the clock,
  all on weekdays 08–22, half on weekends, clipped to saved opening hours.
- `docs/archive/staffing-assistant-scope.md`, section 9, records the game's
  `CustomerEntriesCalculatorOffice.GetCustomersByHour` formula and an example
  with customers at 03:00. That is demand evidence, not an office-hours ban.
- `mod/BigCopilotLink/Scripts/ScheduleWrite.cs`, `CheckPost()` and schedule
  validation, enforce employee/station eligibility and shared scheduling rules;
  the explicit business exclusion is headquarters. They do not enforce the
  board's office default as a game rule.
- `_office_site_plan()` also checks `_mod_office_fallback_issue()` before using
  unmeasured demand with mods. That separate safeguard does not create an
  every-open-hour office alternative.

The report has no save or technical attachment. The installed game was not
inspected or changed. These findings explain the missing choice in the current
code; they do not establish which office or mod state the reporter had.

## Reproduction and validation

A synthetic call to `_office_runs(10, [[[0, 24]] for _ in range(7)], 50)` returns
10 computers with 3 always on: 3 staffed at Monday 00:00, 10 at Monday 12:00,
and 5 at Sunday 12:00, despite every hour being open.

`npm run test:python -- tests.test_office_staffing tests.test_office_demand`
assembles the site and passes all 46 tests. Existing tests cover office demand,
nighttime capacity and the distinction between demand and the fallback.

## Decision and implementation

Peter chose an opt-in **Every open hour** office plan, keeping the existing plan
as the default. The selector appears in an office's Staffing block on its
schedule under Staffing → Schedules (also reached from its business page's
Schedule button), beside **Demand plan** (or
**Office default** when there is no usable history).

The alternative staffs each installed computer during every saved open hour,
including weekends and nights, just as retail's alternative covers installed
stations. It does not infer extra opening hours or cap the workstation count by
building capacity. Cleaning and other duties remain in place, and employee and
station requirements still apply. An office with no saved open hours offers no
alternative. Existing mod-compatibility blocks remain in force.

Selection is remembered per company and site in this browser. The schedule
review and Staff needs use the same selection, including its own hiring weeks
and station/employee indices. The alternative can reuse unassigned people the
default already reserves; additional gaps become hiring weeks which Staff needs
can fill from the remaining pool. Merely offering the alternative does not
reserve extra people from another site's default plan.

Regression coverage: `tests/test_office_open_hours.py` and
`tests/office_open_hours.test.cjs`, using synthetic saves only.
