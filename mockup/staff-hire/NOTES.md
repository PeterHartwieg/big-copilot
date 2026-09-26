# Staff page (mass hire): design notes

Canvas: https://claude.ai/artifact/DmH1wQnG58khjVYu4JgimJ (Design type). Generator:
`build_staff_canvas.py` (named like its siblings; `build_canvas.py` would shadow the revamp
module it imports). Never hand-edit `project/`. `--preview` writes plain HTML to `_preview/`
(both themes) for Playwright screenshots; do not commit `_preview/`.

Issue #89, as Peter reshaped it on 25 Sep 2026: Company › Staff replaces Payroll and becomes
a mass-hire tool. Hiring goes through the Big Copilot Link mod; the candidates are in the save
(`GameInstance.CandidateEmployeeInstances`). Every name in the canvas is invented.

## Artboards

1. **Staff page**: tiles (to hire, to move, wage bill added, candidates), Move first, Hire (one
   line a role, summed over every planned site), Not planned (HQ and warehouses: what the
   headhunters found), the action bar, then Payroll as it was.
2. **Candidates, two options**: A, a drawer under the role's line; B, a Candidates view with a
   role rail and one table. Both run the same auto-pick live (demand chips, two sliders, tick
   and untick).
3. **Review and confirm**: the dry run, then who goes where site by site (one open, with each
   person's days), the places nobody fills, one confirm.
4. **After the confirm**: working, done, partial (candidates expired), refused (MyEmployees open).
5. **Game not linked**: everything readable from the save; Review is disabled, with how to link.
6. **Phone**: role cards and a bottom action bar.

## Decisions made without Peter

1. **Role names are the game's** ("Customer Service", not "Cashier"). A line reads "Hire 14
   Customer Service", with its site kinds beside it ("4 Electronics stores · 1 Clothing store")
   and one chip a site with its count. A site opened without staff carries a blue `new` tag
   and is planned with the default (full cover 24/7 for a shop, the office default for an office).
2. **Moves come first and are opt-out.** Each move is a row with a checkbox, from → to and the
   people. Unticking one means those places get hired instead.
3. **Filters are company-wide by default**, above the role lines: "Leave out anyone who asks
   for" as toggle chips with counts, plus minimum skill and maximum wage sliders. Full-time and
   part-time are demands in the game already, so they are chips, not a separate control.
4. **The board also checks demands against the target site** (never shown as a filter Peter
   has to set): a green tick means the site meets it or the plan can hold it ("No night
   shifts": the plan keeps them off nights), red means no site does ("Gold Health Insurance"
   with no Gold partnership). A red demand is never auto-picked. A demand that only some sites
   meet (Coffee Machine) steers the person to those sites.
5. **Auto-pick**: most skilled first, a tie to the lower wage, only into a site with a place
   left whose demands fit. Unticking someone lets the next best in (the count stays at the
   need); ticking an extra person over-picks and says "over the plan".
6. **A role that cannot be filled says so**: the bar is hatched for the short places ("3 of 5
   picked · 2 short"), the tile says it, and the review names the site, role and hours left
   uncovered. It stays on the page afterwards.
7. **HQ and warehouses propose nothing**: a table of what the headhunters found (count, best
   skill, wage range, leaving within a day) with a Candidates button for picking by hand.
8. **One confirm, labelled with what it does**: "Hire 34, move 3". The foot says hires cannot be
   undone. Done has **no Undo**, unlike every other write, and says where to let someone go
   (MyEmployees).
9. **Partial result**: the game hires everyone still on the list; the ones who left are struck
   through, their places stay open, and "Pick 2 more" re-opens the review for those places only.
10. **Not linked**: the plan, moves, filters and picks all work from the save, so the list can
    be prepared; "hours left" is marked as of the save. Review is disabled (dashed, plug icon).
11. Wording follows the staffing vocabulary: hours and days, people, no "roster", "shift" or
    "post" except where a demand's own game text says "shift".

## Recommendation

**Option A (drawer).** The decision Peter makes is per role and in the context of its need, and
A keeps the need, the sites and the picks in one place without leaving the page. B is better
for browsing a large pool, so keep its table as what the HQ and warehouse "Candidates" buttons
open, and for "Show all 158 who pass".

## Open questions for Peter

1. **Option A or B** for candidates (recommend A, above).
2. **Filters per role?** Drawn company-wide with a "Every role / Customer Service only" switch in
   the drawer. Enough, or should every line carry its own set?
3. **Demand checks**: how far should the board judge demands against a site (equipment in the
   building, cleanliness, HR partnerships, schedule demands against the plan)? The canvas assumes
   all of them. The minimum is schedule demands and insurance.
4. **Moves**: should a move ever cross roles (a Cleaning surplus who also has Customer Service
   skill), or only the same role, as drawn?
5. **Sites the board does not plan (HQ, warehouses)**: pick by hand only, as drawn, or should
   warehouses get a simple "one per station" need?
6. **Which site gets the best people** when one role spans several sites? Drawn in site order;
   the alternative is the busiest site first.
7. **Working state**: does the combined mod endpoint hire 30+ people inside one main-thread
   walk (instant), or does it need progress? Drawn as an indeterminate bar.
8. **Stale candidates from a save**: keep the not-linked page fully interactive, or show the
   needs only?

## Porting note

Every new class is `hr-` prefixed (unused on the board today). The dialog reuses the write
dialogs' `gw-` shell as shipped (`gw-dlg`, `gw-verdict`, `gw-w`, `gw-tiles`, `gw-call`, `gw-no`,
`gw-b`, `gw-hint`). The page reuses the board's `sechead`, `sstats`/`sstat`, `seg`, `chip`,
`person`, `roles`/`role`, `hood`. The auto-pick in the canvas script (`pick(pool)`) is the
reference for the port's picking rules; the Python `pick()` in the generator mirrors it.

| Canvas component | Classes | Replaces |
| --- | --- | --- |
| Page head, link state | `hr-sub`, `hr-head`, `hr-linked` | `drawPayroll()`'s `sechead("Payroll")`; Company subnav item `payroll` → `staff` |
| Tiles | `sstats hr-tiles` | none |
| Moves | `hr-moves`, `hr-move`, `hr-route`, `hr-st`, `hr-new`, `hr-cb` | none |
| Filters | `hr-filters`, `hr-frow`, `hr-flab`, `hr-dem`, `hr-range`, `hr-scope` | none |
| Role lines | `hr-needs`, `hr-need`, `hr-code`, `hr-nm`, `hr-sites`, `hr-pool`, `hr-cost`, `hr-open` | none |
| Candidates | `hr-drawer`, `hr-dnote`, `hr-count`, `hr-cands`, `hr-sk`, `hr-d`, `hr-exp`, `hr-to` | none |
| Option B | `hr-split`, `hr-rail`, `hr-rlist`, `hr-rbtn`, `hr-tbar`, `hr-search` | none |
| Not planned | `hr-found` (a board table) | none |
| Action bar | `hr-bar` | none |
| Payroll | `hr-pay`, `hr-rate`, board `roles` | `drawPayroll()` body, kept |
| Review dialog | `gw-dlg hr-wide`, `hr-dsites`, `hr-dsite`, `hr-dhead`, `hr-dots`, `hr-dpeople`, `hr-dp`, `hr-wk` | new write kind |
| After | `hr-prog`, `hr-struck`, `hr-lock` | none |
| Not linked | `hr-nolink`, `hr-stale` | none |
| Phone | `hr-phone`, `hr-pcard`, `hr-pmove`, `hr-pbar` | none |
