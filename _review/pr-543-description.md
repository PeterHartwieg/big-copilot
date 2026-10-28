Offices can now opt into **Every open hour** under Staffing → Schedules (also reached through the business page's Schedule button). The existing demand/default plan remains selected until the player chooses the alternative, and the choice persists per company and site.

The new plan covers each installed computer during saved opening hours, including nights/weekends, without extending opening hours. It preserves cleaning and other duties, respects employee/station constraints, and supplies its own hiring weeks to Staff needs and both schedule/hiring writes. Offering it does not reserve additional bench staff from other sites' default plans. No saved open hours means no alternative; existing mod-compatibility blocks remain in force.

Validation:
- 166 focused Python tests passed (office, hiring, mod safeguards, sections and browser build); additional office invariance tests pass.
- 25 staffing oracle/keep-current/exchange tests passed, including the new alternative in the synthetic office sweep.
- 20 focused snapshot/registry/release tests and 54 Python i18n tests passed. Snapshot regeneration produced no diff.
- New browser/VM suite: 6 tests pass for the actual Schedules toggle, reload persistence, default/reset/company isolation, hiring coverage and request construction. Existing staffing/on-demand/global-name/office-demand suites: 205 other tests passed.
- 164 Node i18n/game-link schedule/worker tests passed. Browser tests used installed Edge. Desktop/mobile renders inspected; no office-block overflow at 390px.
- CI caught an idle-hours-summary regression when hiring metadata is absent; reproduced it locally, fixed it and added a regression. All 43 checklist/office tests pass after the fix.
- `git diff --check` passed. Full CI passed on ca8590ae: Python, all six Node shards, optimized hosted-page smoke tests, Worker bundle and assembly/freshness. [CI run](https://github.com/PeterHartwieg/big-copilot/actions/runs/40645084028).

Review: inspected planner-state isolation, independent table indices, retained duties, unreadable-entry guards and all office selection/write branches. No review model was invoked.

Peter approved the opt-in plan; no open product questions. Like retail's equivalent, this covers installed workstations rather than capping their count at building capacity. Refs #503.



