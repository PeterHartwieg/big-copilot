# Office scheduling decision — issue #503

Status: awaiting Peter's product decision. Refs #503.

The missing office option is an explicit Big Copilot planning choice, not an
established restriction on office scheduling in the game. No implementation or
UI copy is changed by this investigation.

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

## Decision requested

Should offices offer an explicit plan to staff every usable computer during
every saved open hour, alongside their existing demand plan?

1. **Recommended: add an opt-in office open-hours plan.** Keep demand planning as
   the default and preserve saved opening hours. Show hiring/cost implications,
   respect employee and station constraints, and preserve cleaning/other duties.
   Decide whether usable computers should be capped at building capacity before
   implementation. This addresses the reporter's missing choice without making
   higher staffing the default.
2. **Keep the existing single office plan and explain it.** Add a translated
   sentence saying Big Copilot uses office demand with a default for unmeasured
   hours and does not currently offer the retail open-hours alternative. Describe
   it as a planner limitation, never as a game restriction.

Adding the alternative affects planning, hiring, selection/persistence and game
writes; it is not just a hidden button to enable. Making that choice would
supersede the recorded scope, so this PR deliberately implements neither option.
