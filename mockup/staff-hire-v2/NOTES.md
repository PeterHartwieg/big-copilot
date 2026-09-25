# Staff page, second version: design notes

Canvas: https://claude.ai/artifact/5oAjDxydxpEWJPs3GCHsS7 (Design type). Generator:
`build_staff_v2_canvas.py`. Never hand-edit `project/`. `--preview` writes plain HTML to
`_preview/` (both themes) for screenshots; do not commit `_preview/`. The first canvas stays in
`mockup/staff-hire/` for reference.

Issue #89, PR #121. Peter tried the built page and could not read it: "TO MOVE" did not say who or
why, the "?" hovers read as gibberish, "Leave within a day" meant nothing, there were pills and
text everywhere with no structure, and he could not find how to hire (the only action, "Review",
sat in a bar under a long wall of demand chips; everything was pre-picked without saying so).
The capability stays as shipped; only the presentation changes. Every name is invented; the
numbers follow his save (42 hires over 3 roles, 2 reassigned, 1 Gym Trainer short, 1,542
candidates, 249 expiring, +$11,178 a day).

## Artboards

- **A2 · Option B, the order panel (recommended)**: `Main.dc.html`. Left: one table, a row a
  role, read left to right as the path: open places, from your staff, new hires, stays open,
  wages, **Change picks**. The reassignment is a line under its role with one checkbox. Right: a
  sticky panel, "What happens when you hire", with the three numbers, the wages and the one
  button.
- **A1 · Option A, three steps**: `OptionA.dc.html`. A summary box at the top with the button,
  then numbered steps in the order they happen: 1 Reassign staff who have no hours, 2 Hire new
  staff, 3 Headquarters and warehouses (optional).
- **B · Change picks**: a sheet over the page for one role: who was picked, the next best, the
  one filter control (shown open), and "Apply these filters to all roles / this role only".
- **C · Review and confirm**: ready (one site open), done, partial (2 applications expired
  meanwhile), refused (MyEmployees open).
- **D · Not linked, mod too old**: the page still works from the save; only the button is
  disabled, and the panel says exactly what to do.
- **E · Phone**: summary card, roles as rows, the rest collapsed, the button in a bar at the bottom.

Both themes: the `dark` Tweak on every artboard.

## What changed, and why

1. **One path, one button.** The page reads what is open → who fills it (your own staff first,
   then new hires) → one green button, "Review and hire 42". In B the button is always on screen;
   in A it is at the top. Beside it: "The picks are made for you and you can change any of them.
   Nothing happens until you confirm on the next screen."
2. **Information is text and numbers; actions are buttons.** Only four kinds of control remain on
   the page: the filter control, the reassign checkbox, "Change picks" / "Pick by hand", and the
   green button. Nothing that looks like a button is information.
3. **No pills.** The 20 demand chips are one dropdown, "Leave out who asks for: nobody"
   (a list with counts in a popover). Site chips are plain text: "5th Avenue 12 (6), Bleecker
   Street 40 (5), …". Candidate demands are comma-separated text; a demand the site does not meet
   is orange, with the reason in words.
4. **No "?" at all.** Each old hover is rewritten as a visible sentence where it is needed, or
   removed (table below).
5. **Tiles are gone.** Four tiles with notes and hovers become the summary (three lines) plus two
   plain facts: candidates, applications expiring.
6. **Payroll is set apart** under a rule and a "Current staff" label, at the foot.

## Recommendation

**Option B.** It separates information (left) from the decision (right) in space, keeps the
button in view however long the tables get, and shows the reassignment inside the role it
belongs to, so "2 from your staff + 20 new = 22" reads on one row. Option A tells the story in
order but pushes the reassignment and the hires into separate sections and needs a sticky copy
of the button once the summary scrolls away. On phone both become E.

## Wording, every label

| Where | Was | Now |
| --- | --- | --- |
| Page intro | What every planned site still needs, filled from your headhunters' candidates. Spare people move first; the rest are hired, placed and given their hours in one go. | Fill the open places in your staffing plans. People are picked for you: check them, change any you like, then hire them all at once. |
| Link state | Game linked (hover: Big Copilot Link is on: …) / Save file | Game linked · Reading a save file · game not linked · Game linked · mod 0.2.0 is too old to hire |
| Tile "To hire" | To hire · 42 of 43 needed · 1 Gym Trainer short (hover) | Hire 42 · 22 Lawyers, 20 Security Guards, at 5 sites |
| Tile "To move" | TO MOVE · 2 people (hover: People moved to a site that needs their role, …) | Reassign 2 · Security Guards with no hours at 7th Avenue 3 go to Wall Street 9 |
| Short | 1 Gym Trainer short | Stays open 1 · Gym Trainer at Canal Street 5: no candidates yet |
| Tile "Wage bill added" | Wage bill added · +$11,178 a day (hover: wage × hours ÷ 7) | Added wages +$11,178/day · Wages after hiring $107,588/day |
| Tile "Candidates" | Candidates · 1,542 found · 249 leave the list within a day (hover: leaves 168 h after found) | Candidates 1,542 · found by your headhunters. Applications expiring 249 · within 24 hours. They then leave the list |
| Section "Move first" | Move first (hover: A site whose plan gives someone no hours gives them to …) | B: a line under the role: "Lena Castell and Vera Zeller have no hours in 7th Avenue 3's plan. They move to Wall Street 9 instead of 2 new hires." [✓ Reassign them]. A: step 1 "Reassign staff who have no hours" with that sentence and "Nobody new is paid for those 2 places. Untick someone to leave them where they are; their place at Wall Street 9 is then hired instead." |
| Move row | Move 2 Security Guard · given no hours in 7th Avenue 3's plan | (as above) |
| Fixed move | Assign 3 unassigned · already in this site's plan: they get their hours there | Assign 3 staff who work nowhere yet: Wall Street 9's plan already counts on them (not drawn: no such case in the save) |
| Section "Hire" | Hire (hover: Each line sums what every site with a staffing plan …) | B: "Open places and who fills them" + "One row a role, over every site with a staffing plan. Your own staff with no hours fill a place first; the rest are new hires, picked for you: the most skilled who pass the filters, equal skill to the lower wage." A: "Hire new staff" + the same rule |
| Role line | Hire 20 Security Guard · Clothing store ×4 · chips · bar · "20 of 20 picked · 431 found · 367 pass" | Security Guard · 4 Halden Wear shops: 5th Avenue 12 (6), … · Open places 22 · From your staff 2 · New hires 20 (avg 81% · $28/h) · Wages/day +$3,336 |
| Pick bar hover | Picked against what the sites need. Hatched: places nobody who passes your filters can fill. | removed (the Stays open column says it) |
| Role button | Candidates › | Change picks › |
| No candidates | 0 of 1 picked · 1 short | No candidates yet (orange) |
| New site tag | new (hover: Opened since the last save with staff: planned with the default) | "new office" / "new shop" tag; the review says "new shop: open 24/7, full cover" / "new office: the default office hours" |
| Filter row label | Leave out anyone who asks for [20 chips] / And keep: Skill at least, Wage at most | Who can be picked: [Leave out who asks for: nobody ▾] [Skill at least: any ▾] [Wage at most: any ▾] · 1,198 can be picked |
| Demand chip hover | Full-time: 301 candidates ask for it. Click to leave them out. | Popover: "Tick a demand to leave out every candidate who asks for it. The number is how many ask." |
| Filter note | A demand a site cannot meet is only a warning: it never stops a pick. | In Change picks: "Orange marks a demand their site does not meet; they can still be hired." |
| Filter scope | Every role / Security Guard only · "The company's filters: change them here for every role, or give this role its own" | Apply these filters to: ( ) all roles ( ) Security Guard only |
| Drawer note | Most skilled first; a tie goes to the lower wage. Untick someone and the next best who passes takes the place. | Picked for you: the most skilled who pass the filters, equal skill to the lower wage. Untick someone and the next best takes the place. Tick someone else to add them. |
| Drawer counts | 20 of 20 picked · 367 pass · 64 left out by your filters | Picked 20 of 20 · 367 can be picked · 64 left out |
| Candidate columns | Pick · Candidate · Security Guard · Also · Wage/h · Asks for · Leaves in (hover) · Goes to | Pick · Candidate · Security skill · Wage/h · Goes to · Asks for · Application expires ("in 5 h", "in 3 days"). "Also" dropped |
| Demand chip in a row (ok) | ✓ Full-time (hover: Fits the hours they get) | Full-time |
| Demand chip (site lacks it) | ✗ Coffee Machine (hover: Not met at Wall Street 9, met at another site) | Coffee Machine (none at Wall Street 9), orange |
| Demand chip (hours break it) | hover: The hours they get break it: the next plan re-plans with them | No night shifts (the plan gives them 22:00–04:00 on Fri), orange |
| Demand chip (no site) | hover: Not met at any site / Not met: settled company-wide | Gold Health Insurance (no HR Manager has Gold), orange |
| Over-picking | over the plan | "21 of 20 · 1 over the plan"; "Goes to" says "no hours: pick a site" |
| Show more | Show all 367 who pass · Show the 64 left out | Show all 347 · Show the 64 left out by the filters |
| Section "Not planned" | Not planned (hover: The board plans no hours for headquarters or warehouses …) · "headquarters and warehouses · what the headhunters found" | Headquarters and warehouses · optional · "Big Copilot plans no hours for these, so it picks nobody here. Hire by hand if you need someone: they join with no hours, and you set them in the game." |
| Not-planned columns | Role · Works at · Found · Best skill · Wage/h · Leave within a day · Candidates › | Role · Works at · Candidates · Best skill · Wage/h · Expire within 24 h · Pick by hand › (0 found: "none found", no button) |
| Idle candidates | N more candidates are in roles no site of yours uses. | 344 more candidates are for roles none of your sites use. |
| Action bar hint | Nothing changes until you confirm on the next step. The game is asked first. | The picks are made for you and you can change any of them. Nothing happens until you confirm on the next screen. |
| Main button | Review (count badge) | Review and hire 42 |
| Not linked | Hiring goes through the game (3 steps) · "Everything here is read from your save: the plan, the moves and the picks work the same, and hours left are as of the save." | Hiring goes through the game. 1 Subscribe to Big Copilot Link on the Steam Workshop. 2 Start Big Ambitions and load this company. 3 Link the game from Big Copilot's start screen. "Until then you can check and change the picks here; they are read from your save." Expiring gets ", as of the save". |
| Mod too old | Update the Big Copilot Link mod to 0.3.0 to hire from here. | Update Big Copilot Link to hire. You have 0.2.0; hiring needs 0.3.0. Steam updates Workshop items when the game restarts: quit Big Ambitions, start it again, and link again. |
| Dialog title / button | Hire 42, move 2 | Hire 42 and reassign 2 |
| Dialog subline | 6 sites · hours from each site's plan | 6 sites · everyone gets hours from their site's plan |
| Dialog tiles | Hire · Move · Wage bill | Hire · Reassign · Added wages |
| Dialog lead | Filled dots are hires, hollow ones people moved in, dashed ones places nobody fills. Open a site for each person's days and hours. | Who goes where. Open a site to see each person and the days they work. (Dots dropped: each site says "4 new · 2 reassigned in", "2 reassigned out", "1 place stays open".) |
| Person sub | hired / moved from 7th Avenue 3 | new hire / reassigned from 7th Avenue 3 |
| Gap call | Wall Street 9: 2 Security Guard places stay empty, 84 hours a week. … | Canal Street 5 keeps 1 Gym Trainer place open (40 hours a week): your headhunters have found no Gym Trainers. |
| Demand call | N people ask for something their site does not give (marked on the Staff page). It never stops a hire; the next plan works with it. | 2 people ask for something their site does not meet (marked orange in Change picks). They are hired anyway. |
| No undo | Hires cannot be undone. Moves and hours can be changed in the game later. | Hiring cannot be undone. To let someone go later, fire them in the MyEmployees app in the game. Foot: "Nothing happens until you click the green button." |
| Done | 42 hired, 2 moved · "No undo. To let someone go, use MyEmployees in the game." | 42 hired, 2 reassigned · "No undo. To let someone go, fire them in MyEmployees in the game." |
| Partial | 2 candidates left the headhunter's list before the game reached them. | 2 applications expired before the game reached them. |
| Refused | Close the MyEmployees app on your phone in the game, then try again. | Close the MyEmployees app on your in-game phone, then try again. "Nobody was hired or reassigned. Your picks are kept." |
| Payroll ? | At today's rates: each person's hourly wage times … (hover, with sites that differ) | Visible facts (people, wages a day at today's rates, booked yesterday, satisfaction, unhappy, absent) and one line: "Today's rate is each person's hourly wage × their weekly hours ÷ 7. Booked is what yesterday's statements recorded; the two differ when hours changed during the day." The per-site differences are dropped. |
| Payroll chips | 81% · 14 unhappy · 3 out (chips) | rows in the facts list |

Vocabulary: "reassign" replaces "move" everywhere; "applications expire" replaces "leave the
list"; "open places" / "stays open" replaces "short" and "needed"; "can be picked" replaces
"pass". Still no "roster", "shift" or "post" except inside the game's own demand names.

## Open questions for Peter

1. **Option B (order panel) or A (three steps)?** Recommend B.
2. **Reassignment inside the role row (B) or as its own step (A)?** B assumes a reassignment is
   always within one role, as shipped.
3. **Filters open by default?** Drawn company-wide with nobody left out. Should Full-time or
   Part-time be left out by default for shops, or keep "nobody"?
4. **Change picks as a sheet over the page** (drawn) or a full page with a Back link?
5. **Headquarters and warehouses**: a full table (drawn) or collapsed to one line
   ("7 roles · pick by hand") on desktop too, as on the phone?
6. **Payroll's two wage figures**: keep both (drawn) or show only today's rate here, with the
   booked figure on Results?

## Porting note

New classes are `hs-` prefixed; they replace the shipped `hr-` page styles (the `hr-` model
functions stay). The dialog keeps the write dialogs' `gw-` shell. The board's `.role` class
styles Payroll's rows, so table cells must not use it (`hs-rn`), and `.sub` is display:block
board-wide (`hs-subrow`). "Change picks" replaces both the drawer and the browse table:
`hrDrawer()` and `hrBrowseHtml()` become one sheet; "Pick by hand" opens the same sheet for an
unplanned role. `hrTiles()` becomes the order panel; `hrBar()` goes; `hrMovesHtml()` becomes the
line under its role; `hrFiltersHtml()` becomes the dropdown bar.
