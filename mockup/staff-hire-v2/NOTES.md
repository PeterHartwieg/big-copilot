# Staff page, second version: design notes

Canvas: https://claude.ai/artifact/5oAjDxydxpEWJPs3GCHsS7 (Design type). Generator:
`build_staff_v2_canvas.py`. Never hand-edit `project/`. `--preview` writes plain HTML to
`_preview/` (both themes) for screenshots; do not commit `_preview/`. The first canvas stays in
`mockup/staff-hire/` for reference.

Issue #89, PR #121. Peter could not read the first built page ("TO MOVE", gibberish "?"
hovers, "Leave within a day", pills and text everywhere, no visible way to hire). Round 1 of
this canvas offered two layouts; round 2 applies his answers:

1. **Order panel kept**, and the copy cut hard: no paragraph anywhere on the overview; every
   row and label is a number or a few words.
2. **Quick hire** added: "let me quickly grab 5 more HR managers, skill 100%, without Gold
   insurance → done", for any site. It replaces the Headquarters and warehouses table.
3. **Change picks** stays a panel over the page.
4. **Part-time is left out by default for shop roles.**

Every name is invented; the numbers follow his save (42 hires over 3 roles, 2 reassigned, 1 Gym
Trainer with no candidates, 1,542 candidates, 249 expiring, +$11,178 a day).

## Artboards

- **A · Overview** (`Main.dc.html`). Left: "Open places", the filter bar, one table (Role · Open ·
  Own staff · New hires · Stays open · Wages/day · Change picks), the reassign line under its
  role, one line of candidate facts. Right: "When you hire" (Reassign 2 · Hire 42 · Stays open 1 ·
  Added wages), the green button, then the Quick hire card. Payroll apart at the foot.
- **B · Change picks** (Security Guard): panel over the page; Part-time pre-ticked.
- **Q · Quick hire**: empty, filled with a live match count, matches opened, confirm, done.
- **C · Review and confirm**: ready, done, partial (applications expired), refused (MyEmployees).
- **D · Not linked, mod too old**: only the button is off; the fix sits under it.
- **E · Phone** and **E2 · Phone quick hire**.

Both themes: the `dark` Tweak on every artboard.

## Decisions

1. **One path, one button.** Table on the left, "When you hire" plus "Review and hire 42" on the
   right, sticky. Under the button: "Picked for you. You confirm next."
2. **Information is numbers; actions are buttons.** Controls on the overview: the three filter
   dropdowns, the Reassign checkbox, Change picks, the green button, the Quick hire form.
3. **No paragraphs, no "?"** on the overview. The only full sentence left anywhere is in the
   dialogs (what the game said, no undo).
4. **Default filter: Part-time left out for shop roles**, none for office roles. The overview
   bar shows "Leave out who asks for: Part-time" with one small line under it, "Part-time is left
   out for shop roles only." In Change picks for a shop role the scope reads "Filters for: all
   shop roles / Security Guard only".
5. **Quick hire** (replaces the HQ and warehouse table):
   - Fields: Role · At (any site: HQ, warehouse, office, factory, shop) · How many (stepper) ·
     Skill at least · Leave out who asks for (the same dropdown as the page's).
   - Live result: "7 match · the best 5 are picked", which opens to the 5 names, skill, wage.
     Picking rule as the planned hires: most skilled first, equal skill to the lower wage.
   - Button says the count: "Hire 5". Fewer matches than asked: the button drops to the match
     count ("Hire 3") and the line says "only 3 match" (not drawn).
   - Confirm: the game is asked first (dry run), the 5 names, "No hours yet: set them in the
     game." (the board plans no hours here), "No undo." Done: "5 hired", with Hire more / Close.
   - At a site with a staffing plan (a shop), a quick hire gets hours from the plan like any
     other hire; at HQ and warehouses they join with no hours, as shipped.
   - It sits under the order panel: visible without scrolling, but after the main button.
6. **Option A (three steps) dropped**; the artboard is removed from the canvas.
7. **Payroll** keeps both wage figures as two plain rows ("Wages a day", "Booked yesterday"),
   with no explanation line.

## Wording, every label

| Where | Round 0 (shipped) | Now |
| --- | --- | --- |
| Page intro | What every planned site still needs, filled from your headhunters' candidates. Spare people move first; … | none (title "Staff" only) |
| Link state | Game linked / Save file (with hovers) | Game linked · Save file · game not linked · Mod 0.2.0 · too old to hire |
| Section | Hire (with "?") | Open places |
| Filter row | Leave out anyone who asks for [20 chips] / And keep: Skill at least, Wage at most | [Leave out who asks for: Part-time ▾] [Skill at least: any ▾] [Wage at most: any ▾] · 1,198 match |
| Filter default note | – | Part-time is left out for shop roles only. |
| Demand popover | chips with hovers "N candidates ask for it. Click to leave them out." | Leave out anyone asking for: [checkbox list with counts] · All 20 demands · Clear |
| Table header | (role lines, no header) | Role · Open · Own staff · New hires · Stays open · Wages/day |
| Role cell | Hire 20 Security Guard · Clothing store ×4 · site chips | Security Guard · 4 shops (Lawyer · Park Avenue 88 · new) |
| New hires cell | 20 of 20 picked · 431 found · 367 pass | 20 · 81% · $28/h |
| Role button | Candidates › | Change picks › |
| No candidates | 0 of 1 picked · 1 short | No candidates |
| Move block | Move first (?) · Move 2 Security Guard · given no hours in 7th Avenue 3's plan | Reassign 2 · 7th Avenue 3 (no hours) → Wall Street 9 [✓ Reassign] |
| Candidate facts | Candidates tile · 249 leave the list within a day | 1,542 candidates · 249 expire within 24 h |
| Tiles | To hire / TO MOVE / Wage bill added / Candidates | panel "When you hire": Reassign 2 (7th Avenue 3 → Wall Street 9) · Hire 42 (22 Lawyers · 20 Security Guards) · Stays open 1 (Gym Trainer: no candidates) · Added wages +$11,178/day |
| Main button | Review [42] (in a bottom bar) | Review and hire 42 |
| Button note | Nothing changes until you confirm on the next step. The game is asked first. | Picked for you. You confirm next. |
| HQ and warehouses | Not planned (?) table: Found · Best skill · Wage/h · Leave within a day · Candidates › | gone: Quick hire |
| Quick hire | – | Quick hire · any site · Role · At · How many · Skill at least · Leave out who asks for · "Pick a role and a site to see who matches." · "7 match · the best 5 are picked" · Hire 5 |
| Quick confirm | – | Hire 5 HR Managers · Halden HQ · Madison Avenue 200 · The game can take all 5 · Hire / Role / Wages · No hours yet: set them in the game. · No undo. · Back · Hire 5 |
| Quick done | – | Done · 5 hired · "5 HR Managers now work at Halden HQ, with no hours." · No undo. To let someone go, use MyEmployees in the game. · Hire more · Close |
| Change picks title | Candidates drawer | Security Guard · 20 new hires · 5th Avenue 12 (6), … |
| Change picks counts | 20 of 20 picked · 367 pass · 64 left out by your filters | 389 match · 42 left out · Picked 20 of 20 · Next best 369 more |
| Filter scope | Every role / Security Guard only + a sentence | Filters for: all shop roles / Security Guard only |
| Candidate columns | Pick · Candidate · Security Guard · Also · Wage/h · Asks for · Leaves in (?) · Goes to | Pick · Candidate · Skill · Wage/h · Goes to · Asks for · Expires in |
| Unmet demand | red/green chips with hovers | orange text with the reason: "Coffee Machine (none at Wall Street 9)"; legend "site lacks it" |
| Sheet foot | – | Picked 20 of 20 · Added wages · Reset to automatic · Done |
| Not linked | Hiring goes through the game (3 steps + a sentence) | Link the game to hire: 1 Subscribe to Big Copilot Link (Steam Workshop) 2 Load this company in the game 3 Link from the start screen |
| Mod too old | Update the Big Copilot Link mod to 0.3.0 to hire from here. | Update Big Copilot Link to 0.3.0 · You have 0.2.0. Restart the game, then link again. |
| Dialog title / button | Hire 42, move 2 | Hire 42 and reassign 2 |
| Dialog lead | Filled dots are hires, hollow ones people moved in, … | Who goes where. Open a site to see each person and the days they work. |
| Partial | 2 candidates left the headhunter's list … | 2 applications expired before the game reached them. |
| No undo | Hires cannot be undone. Moves and hours can be changed in the game later. | Hiring cannot be undone. To let someone go later, fire them in the MyEmployees app in the game. |
| Payroll | Payroll (?) · N people · $/day at today's rates · booked yesterday · chips | Current staff · Payroll · People · Wages a day · Booked yesterday · Satisfaction · Unhappy · Absent today |

Vocabulary: "reassign", never "move"; "expire", never "leave the list"; "open" / "stays open",
never "short"; "match", never "pass".

## Peter's decisions on top of the canvas (25 Sep 2026)

1. **Order panel layout**, minimal text: numbers and a few words; no paragraphs, no "?" hovers,
   no pills.
2. **Change picks** is a panel over the page.
3. **Quick hire** replaces the Headquarters and warehouses table: Role · At (any site: HQ,
   warehouse, office, factory, shop) · How many · Skill at least · Leave out who asks for. Live
   match count; the best N are picked automatically (the list opens on demand). Fewer matches
   than asked: the button drops to the match count ("Hire 3") and the line says how many short.
   No wage field. Same `/write/hire` call; no mod change.
4. **Quick hire hours**: at a shop (or any site with a staffing plan) people get hours from that
   site's plan, the plan's open hours for that role, by the same mechanism as planned hires'
   `hireWeeks`. No open hours for that role in the plan, or no plan at the site (HQ,
   warehouse): assigned with no hours.
5. **Default demand filter**: Part-time left out for every role hired into a shop, pre-selected
   in the dropdown, with the one short line saying so.
6. **Wording**: the table above, exactly.
7. **Also fixed**: the `#staff` hash (and search) open Company > Staff; the hash used to land on
   Today (`PAGE_ALIASES` had no `staff`).

## Still open

Nothing. Answered on 25 Sep 2026:

- Quick hire at a shop: hours from the plan's open hours for that role; none when there are
  none (decision 4).
- Fewer than asked: "Hire 3", with how many short (decision 3).
- Wage filter in Quick hire: not added (decision 3).
- Part-time default: every role hired into a shop, not only Customer Service and Cleaning
  (decision 5).

## Porting note

New classes are `hs-` prefixed; they replace the shipped `hr-` page styles (the `hr-` model
functions stay). The dialogs keep the write dialogs' `gw-` shell. The board's `.role` styles
Payroll rows and `.sub` is display:block board-wide, so the table uses `hs-rn` and `hs-subrow`;
the step counter is `hs-num`. "Change picks" replaces `hrDrawer()` and `hrBrowseHtml()`;
`hrTiles()` becomes the "When you hire" panel; `hrBar()` goes; `hrMovesHtml()` becomes the line
under its role; `hrFiltersHtml()` becomes the dropdown bar; `hrFoundHtml()` and the hand-pick
path become Quick hire, on the same hire call the hand picks use today.
