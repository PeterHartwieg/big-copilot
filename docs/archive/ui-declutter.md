# UI declutter pass (27 September 2026)

Peter's board-wide declutter, done after the three redesign chunks were merged. It only
removes or merges things; no new design. Three rules:

1. Text that restates what the layout, a control, a heading or a column already shows goes.
   Numbers, states, warnings, action labels and anything the layout does not show stay. A
   sentence that is truly non-obvious may become a hover tip. Quoted game text stays.
2. One control row per view, and no control that duplicates a tab, a filter or a count.
3. The source strip, when all is well, is Update and ··· alone. It stays loud when something
   is wrong.

The audit behind it is
`C:/Users/Peter/.codex/handoffs/big-copilot-ui-redesign-2026-09-26/execution/declutter-audit/audit.md`,
121 items with ids (G, S, L, O, BV, BP, U, T, E, M, X). Every item is done. Where the audit
offered alternatives, its first proposal was taken, except for Peter's decisions:

| Item | Peter's decision |
| --- | --- |
| E5 | The City map keeps its Find a location toggle |
| O13 | All tools stays |
| O11 | All tools' jump button goes |
| S8 | The CLI footer keeps its file line |
| S6 | "{n} online" stays; nothing shows when the count is unavailable |
| M2 | The Game guide's "game files of {date}" chip moves into a tooltip |
| X5 | Theme and language live in the footer only; Preferences loses them |
| S5 | The chevron beside the company name goes; ··· is the one way in |

The wording fixes of the final review (old place names, and the scheduling words AGENTS.md
rules out) were done in the same pass; they are listed at the end.

## Screenshots

At 1440 × 1000, light theme, reduced motion, Edge. They are from the synthetic `expanded.hsg`
fixture of the final QA run, not from a real save. They are kept in the session scratchpad,
outside the repository:
`C:/Users/Peter/AppData/Local/Temp/claude/C--Users-Peter--codex-worktrees-ui-redesign-chunk3-Big-Ambitions/738bea7b-01ee-4472-ba72-e1053d73ea39/scratchpad/dc/shots/`
(below, `shots/`).

| Build | Before (`3e6f160`) | After (this pass) |
| --- | --- | --- |
| Hosted web page, `expanded.hsg` picked | `shots/before-web/` | `shots/after-web/` |
| CLI board, `expanded.html` | `shots/before-cli/` | `shots/after-cli/` |

Each folder uses the same file names, so a pair is the same name in the two folders. For
example, `shots/before-web/07-supply_imports.png` against `shots/after-web/07-supply_imports.png`.
The file for each page is named in its section below. The text of every view is under
`dc/text/<folder>/`.

## Every page

### G · Patterns the whole board shared

- **G1, section subtitles and lead lines.** Removed:
  - `map.head.finder` "Premises ranked for the business you want to open, with rent, deposit
    and floor plan."
  - `map.head.map` "Your businesses, the buildings you own and the homes you rent, on the
    game's map."
  - `co.std.sub2`, `co.sched.sub.pick`, `co.needs.sub.one`, `sb.del.lead`,
    `co.pay.quiet.links`, `co.goals.quiet2`, `co.fin.quiet`, `sb.staff.quiet.plan`,
    `sp.sched.quiet`, `sp.sched.quiet.office`, `sp.shelf.quiet`.
  - Quick hire's "any site".
- **G2, eyebrow labels.** Removed as visible text: the area's name before each row of views
  (`paintLocal()`), SCOPE (`sb.scope`), PLAN FOR (`sb.basis.lab`), FOLLOWING, EVERY IMPORT
  LINE (`sb.imp.all`), the business pages' "Sizing" (a CSS `::before`), PRICES AT, WHEN YOU
  HIRE, WHERE TO FIND THEM and UNIFORM. They stay as `aria-label`s where they label a control.
  CURRENT STAFF went with its block (T8).
- **G3, "fine" pills.** Removed:
  - "Suggested" (`pgPill()` default);
  - "covered" on shelves and stock rows;
  - "as is" on Plan a factory's ingredients;
  - "nothing to change" (`sbCount()`, `sb.obj.none`, `sb.wh.flat`, `sb.fac.flat*`, now
    `sb.wh.flat2`, `sb.fac.flat2` without the clause);
  - "nobody off today".
  A row with no pill reads as fine.
- **G4, a status word plus its sentence.** In Supply's Status column the sentence is now the
  word's tip (`sbStatus()`). The row's own cells say what to change.
- **G5, the basis on every figure.** Removed:
  - "Planned for {basis}" on the Imports card;
  - Uses / week's basis in site headers;
  - the "full" chip;
  - the basis after a line's status;
  - "Full production:" before the staffing totals;
  - the Plan a factory card;
  - each import line's basis in the write preview.
  A basis is now said only where a figure is on the other basis than the switch shows. That
  covers a player's figure typed on the other basis (the card, Details, the copy, the write
  preview) and the Why heading.
- **G6, an echoed figure.** A finding row's figure column is blank when its number is already
  in the sentence beside it (`ovEcho()`), on the Overview and on business pages. For example,
  "1 staff" beside "1 staff with unmet demands", or "64%" beside "at 64.0%". Figures that add
  something stay (money a day, the bars, a rate).
- **G7, links that repeat a tab.** Removed; each is listed under its page.
- **G8, how-to hints.** Removed:
  - "Hover a role" and "Hover a shop for its roles";
  - "click to open" (twice);
  - "Click a site to follow its goods" (two of three; the legend keeps it);
  - "Pick a role and a site to see who matches.";
  - "Nothing changes until you apply." and "…allow it and then apply.".
  "Written all together, or not at all." now shows only for two or more changes.
- **G9, a heading that repeats the lit tab.** Kept for screen readers only (`.nx-sr`, and
  `sechead(…, {sr: true})`):
  - Staff needs, Payroll, Plan a factory, Find a location, City map, Standards;
  - Company results, Market demand, Shop and office schedules;
  - Products & prices' "Prices at {shop}".
  A heading's "?" tip stays where it was.

### Source strip, masthead, footer (S) — `00-landing.png`, `30-source_menu.png`, the top of every web page

- **S1.** In the ok state the strip is `[Update] [···]` only (`.strip.calm`; its words stay in
  the markup, out of sight).
  - The company, "Up to date", the file or autosave line, the game's day, "game link",
    "built in 0.4 s" and "watching" no longer show.
  - The source goes into the ··· menu under Save source as one line (`#menuSrcLine`,
    `app.menu.src.folder` / `.file` / `.link`), for example "One save file · expanded saved
    27 Sept, 16:25".
  - The day stays on the masthead clock (S7, option a).
  - "built in" is gone.
  - "watching" is the Watch button's own label.
- **S2.** While a board is being read, only the progress bar shows. "Folder remembered" on the
  landing keeps its words.
- **S3.** An Update that finds nothing new ("No newer state from the game") is silent: it is an
  ok state.
- **S4.** The ··· menu's hint sentence (`app.menu.hint`) is removed.
- **S5.** The chevron beside the company name (`#mastCo`, `wireCompanySwitch()`) is removed.
- **S6.** "Online count unavailable" is not shown; the online line hides (`comm.online.none` is
  no longer written). "{n} online" stays.
- **S7.** "7 SITES · 6 STAFF" is removed from the masthead clock. YEAR and the difficulty chip
  stay.
- **S8.** Kept: the CLI footer's file line.
- **S9.** The CLI's LIVE label is gone when all is well; the dot alone remains. "Stale" and
  "Not live" still speak.
- **X5 on the menu.** The Game text chip and Forget history leave the ··· menu for Preferences.
  Their controls stay in the page, hidden, for Preferences to drive. The menu's tip is now
  "Change folder · one file · watch the game" (`app.menu.tip2`).

### Landing (L) — `00-landing.png`

- **L1.** The drop box no longer takes a click (no `role="button"`, no tab stop, no click
  handler). "Choose the folder" is the one button that opens the picker. Dropping still works.
- **L2.** "the newest .hsg in it opens" (`land.drop.sub`) is removed; the box's tip says it
  (`land.drop.title2`).
- **L3.** The footer's "Where saves live" link is removed from the landing.

### Overview (O) — `01-overview.png`

- **O1.** The band headings are plain dividers: "Critical", "Warnings", "Opportunities"
  (`today.band.*2`). The filter chips hold the counts.
- **O2.** "Checked 7 businesses at day 47, 14:30" is removed.
- **O3.** "Your changes: n of m recorded or applied" shows only once a change is marked or
  applied.
- **O4.** The small-caps kind tag after each headline is removed. The kind and its definition
  are the headline's tip. The "new" marker stays on a row that is new.
- **O5.** The figure column follows G6.
- **O6.** In Details, "What the board read" is removed.
- **O7.** In Details, "Kind of finding" is removed.
- **O8.** In Details, "Where it is fixed" is removed. "Opens {path}" is the action button's tip
  (`today.det.opens2`).
- **O9.** In Details, the "{site}'s page" link is removed.
- **O10.** In Details, "The game link can set these uniforms after a preview." is removed.
- **Details itself.** It keeps the proposed change and the extra links. A row with neither has
  no Details button.
- **O11.** The "All tools" jump button is removed from the head and from the slim sticky bar.
- **O12.** All tools rows keep their badges; each row's sentence is its tip.
- **O13.** Kept: All tools.
- **O14.** The empty list's second sentence is removed (`today.alerts.none.sub2`).
- **O15.** The Customize checks panel's lead is now the button's tip
  (`today.kinds.toggle2`).
- **Arrival strip (X13).** "You came from" and the kind name are removed. The strip reads
  "‹ Needs attention  Gift (Cheap) · HART. Overflow Depot · 3 of 8 critical".

### Businesses views (BV) — `02-businesses_results.png` to `05-businesses_milestones.png`

- **BV1.** Under History since, "kept beside the board, in market_history.json" (CLI) and "kept
  in this browser: Preferences › History" (web) are removed. The web page keeps its "History
  controls" link.
- **BV2.** The Portfolio's "Profit & loss | Operations" toggle is removed: Results shows Profit
  & loss and Standards shows Operations.
- **BV3.** "No cash history yet" is shortened (`co.fin.cash.none2`); the rest is its tip.
- **BV4.** "Wages in detail: Staffing › Payroll." is removed.
- **BV5.** The PRICES AT eyebrow and the heading "Prices at {shop}" are removed (the heading stays
  for screen readers). The badges, the guide link and "Its shelves, on its page" stay.
- **BV6.** "by revenue a day, last 7 days" is removed; the "?" tip already says it.
- **BV7.** The explanatory foot paragraph is removed; each clause is its column header's tip
  (`co.prices.tip.*`). An office gets billed-hours words: the fee's takings over the hours
  billed. This also fixes the office footnote the final QA flagged.
- **BV8.** "above the lowest", "at the lowest" and "below the lowest" are removed. "no price"
  stays.
- **BV9.** Standards cards read "at {sites}" under the big number (`co.std.at2`).
- **BV10.** The legend reads "not scored yet"; its explanation is the tip.
- **BV11.** Satisfaction and Promotion are removed from the Operations table on Standards;
  Standards' own table has them.
- **BV12.** "booked in the company costs, day by day" under Taxes paid is removed.

### Business pages (BP) — `19-` to `25-site_*.png`

- **BP1.** The Shelves and Fees heads lose "Compare with market prices ›". The Schedule block
  loses "Open its week in Staffing › Schedules". The header buttons stay.
- **BP2.** The Schedule block's "1 staffing finding" pill is removed.
- **BP3.** Crew with nobody says "Nobody assigned." once, not "no people" as well.
- **BP4.** "24 people in 3 roles · nobody off today" is removed. "Off today · {name}" stays when
  someone is off.
- **BP5.** A block's read-out line is not drawn when a finding row on the page says the same
  thing. This covers the Thinnest line (a finding on that item), "Making nothing" (a no-recipe
  finding), the Inputs read-out (a feed finding) and the idle-staff chip (an overstaffed-hours
  finding).
- **BP6.** "Nothing here is drawn down" is removed.
- **BP7.** The building-capacity tile loses "· 14 h/wk at the ceiling", and an office's tile
  loses "· n h/wk full". The worst-hour line loses "· at the ceiling". "at building capacity"
  stays on a busiest hour.
- **BP8.** Its week loses "peaks {day}, {n} points between best and worst".
- **BP9.** A vacant lease shows its header and nothing else, with no "opened day n".
- **BP10.** A new shop that the not-trading finding speaks for loses its empty Crew, Shelves,
  Schedule, Profit and Its week blocks. "day n of 14" shows once, on the revenue tile.
- **BP11.** The readiness icons by a new shop's title are removed while its not-trading
  finding row is on the page.
- **BP12.** An empty Thinnest tile, an empty Feeds tile and an empty Feeds block are removed.
- **BP13.** A depot's Sizing switch shows only where one of its lines moves with the basis
  (`spBasisMoves()`). A factory's Inputs keep it.
- **BP14.** The Feeds heading loses its rate.
- **BP15.** A stock row loses the chip after the name when its order cell carries the paused
  or short chip.
- **BP16.** An office's "1 of 1 staffed" is removed from the hour grid's lead and from the
  Schedule block; the Desks block keeps it.
- **BP17.** Rent / week is removed; Rent / day stays.
- **BP18.** The breadcrumb's last segment (the page title) is kept for screen readers only.

### Supply (U) — `06-supply_changes.png` to `10-supply_flow.png`

- **U1.** Each view has one row: `[scope ▾] [Needs a change | Everything] [Full production |
  Shop demand]`.
  - The SCOPE and PLAN FOR eyebrows, the boxed basis bar and `sbBasisWhat()`'s sentence are
    removed.
  - "See it as goods flow" is removed.
  - Each basis is its option's tip; Shop demand's gives the margin, "plus 15%"
    (`sb.size.tip.dem.pct`).
- **U2.** The basis switch shows only where the company has a factory line
  (`szMatters()`).
- **U3.** Goods flow:
  - the "Table | Goods flow" toggle is removed;
  - the FOLLOWING eyebrow and the two hint lines are removed (the legend keeps "Click a site
    to follow its goods");
  - the followed site's chip shows only when a site is followed.
- **U4.** Production's hour tiles lose their sub-lines and the outline that mirrored the
  switch.
- **U5.** The Lines and Factory inputs sub-titles are removed; the tables' first headers say
  it. Deliveries' groups are "Shops" and "Warehouses"; what each holds is its tip.
- **U6.** The verdict lines lose the counts the row of views and the Status column already
  give: "n settings fall short", "…inside the margin", short hours, short inputs, hires and
  "(factory staffing below)". The counts said nowhere else stay (with room, idle, stalled,
  new).
- **U7.** Changes' groups lose their counts and "Open {view}" links.
- **U8.** "Why n here and m on the Overview?" is the "of n" counter's tip.
- **U9.** Copy remaining loses its count.
- **U10.** The Imports card loses "the weekly order" and the status tag in its head; the step's
  title says it.
- **U11.** With one import to change, the card's "Preview in the game" is the only apply
  button. With several, the toolbar's stays too.
- **U12.** The order cell loses "↑ raise" and "add"; the arrow shows it. A paused line keeps its
  action chip ("resume import").
- **U13.** "Import amounts and paused imports are on Imports." is removed from Deliveries.
  Production's "Their own imports are on Imports" is removed too.
- **U14.** "n more shelves / lines are fine · Everything" is removed; Everything in the row
  lists them.
- **U15.** A line's status sentence is its tip, with no basis suffix.
- **U16.** "the machines stand idle" is removed.
- **U17.** Factory staffing loses "hire n: the week needs m". Its totals show only for two
  factories or more ("All factories:").
- **U18.** Factory staffing keeps "The game link does not write factory hours or hires here…";
  "Whom to hire: Staff needs" is removed.
- **U19.** Factory inputs are Production's only. Deliveries lists shops and warehouses, and its
  scope offers those two.
- **U20.** The Imports card's "Mark done by you" buttons are removed. Each change keeps its
  tick, on its row of Changes.

### Staffing (T) — `11-staffing_schedules.png` to `13-staffing_payroll.png`

- **T1.** The Staffing block's heading loses the business name; the detail's own title has it.
- **T2.** Staff needs loses its "Schedules · Payroll" links.
- **T3.** The planner's read-out waits for an entry to be pointed at. The role strip loses
  "hire n". The head and the task say the week.
- **T4.** "Save file · game not linked" and "Game linked" are removed. "Mod n · too old to hire"
  stays.
- **T5.** "0 candidates" and "0 match" are hidden. Stays open keeps its number, without the
  per-role list. Where to find them loses "no candidates".
- **T6.** The Open places table loses its Total row; the order panel beside it holds the
  totals.
- **T7.** Where to find them loses "n more needed". It keeps "n more left out by your filters".
- **T8.** Staff needs no longer draws Payroll (`hrPayroll()` is removed).
- **T9.** Quick hire takes the page's own filters: skill at least, wage at most, and Leave out
  who asks for, with part-time left out at a shop only. Its own two controls are removed.
- **T10.** "Part-time is left out for shop roles only." is the filter's tip.
- **T11.** Payroll's tiles lose their sub-lines. "no statement yet" stays.
- **T12.** Payroll's footer links are removed.

### Expansion (E) — `14-expansion_demand.png` to `16-expansion_factory.png`

- **E1.** The sort sentences ("Ranked by each type's best neighbourhood", "Sorted by demand in
  {hood}…", "Strongest unserved demand first") are removed. The sorted neighbourhood header
  is lit and carries an arrow (↓ or ↑), and the sentence is its tip. "usual order" and "Trend
  history starts building from today" stay.
- **E2.** Demand rows lose "Plan a factory ›".
- **E4.** Find a location loses its three cards under the map. The arrival strip goes back to
  Demand with the type's row ringed.
- **E5.** Kept: the City map's Find a location toggle.
- **E6.** "no recipe in the game: bought in" under a product is removed; the row's note stays.
- **E7.** When every product is bought in, the tiles, the Ingredients block and the sentence
  are hidden. This also removes the sentence with blank numbers from audit section 15.
- **E8.** The summary is one figure: "Above what your shops sell today, n units a week are
  surplus for export." (`gr.plan.surplus`). "n lines do not keep up with the shelves" is
  removed; the Supplies cell is red.
- **E9.** "a week at most, Smart Delivery" under every row becomes a short "Smart", and the
  words are the On order now header's tip. The footnote is the Company target header's tip.

### City map and Game guide (M) — `17-map.png`, `18-wiki.png`

- **M2.** The "game files of {date}" and "save build n" chips are removed. They are now
  sentences in the search box's "?" tip.
- **M3.** The badge legend is removed from the guide's index; the article pages have the
  badges.

### Search, menus, sheets, dialogs (X) — `26-sheet_prefs.png` to `30-source_menu.png`

- **X1.** Search's hint line is removed. The examples join the placeholder: "Search sites,
  products, findings, pages and the wiki: hire, debt, difficulty" (`nav.search.placeholder2`).
- **X2.** The foot's "↵ opens …" and each row's "↵ open" are removed. The lit row's own line says
  where it goes.
- **X3.** The key legend's "esc close" is removed; the field's esc chip stays.
- **X4.** The ··· menu's "Search the board" is removed on the desktop. It stays in the phone's
  menu.
- **X5.** Preferences loses Appearance (theme and the motion note) and Language; they are the
  footer's. The CLI's History row no longer repeats `--backfill`, which Local board shows.
- **X6.** Help & feedback keeps "Can't find something?" with Bugs and feedback, and on the CLI
  the ballot note. Removed:
  - Search the board and "Where is my save?";
  - What's new;
  - the vote button;
  - The project and its links.
  The footer, the masthead and the ··· menu carry these.
- **X7.** The leads "Theme and motion.", "Which findings reach Needs attention.", "What the
  numbers are played on.", "The Python version, on your own computer." and "Vote on what Big
  Copilot gets next." are removed.
- **X8.** "Reduced motion is on…" is removed, with Appearance.
- **X9.** Write dialogs keep the headline, "Nothing was changed." or "Nothing was sent.", and
  the fix. The sentence that repeated the headline is removed (moved, refused, busy, not
  approved, not allowed, no answer).
- **X10.** After a write: "Done in the game", the line's ✓ and Undo. The lead ("1 amount set in
  the game.") and "The board shows the game as it now stands" are kept for screen readers
  only, and a failed re-read still shows. The "Undo stays…" foot is removed; the toast after
  Close says it.
- **X11.** The imports legend shows only the kinds in the write. "1 depot" in the head is
  removed (two or more are still counted). The uniforms lead shows only when a role is kept
  (`sp.gw.uni.keptlead`). "the only one in your game" is removed.
- **X12.** "What's changed in Big Copilot." under Changelog is removed.
- **X13.** See the arrival strip, under Overview.

## Wording fixes (final review, Fable SHOULD 2 and astra LOW)

These keys keep their names; their English changed:

- **Places.**
  - Search's landings: "Businesses › Standards", "Expansion › Demand", "Businesses ›
    Results", "Overview", "Expansion › Find a location · …", "Game guide › …", "Staffing ›
    Schedules · {site}".
  - The Game guide's search group and recent label; the guide's crumb.
  - The profit tile's tip.
  - `co.outside.profit.tip`.
  - `web/map.js`: "on Expansion › Demand", "Sites with a finding in Needs attention".
  - `web/wiki.js` and `tools/wiki_sample.json`: "Open Plan a factory…".
  - The hidden view navs' labels.
- **Banned words.**
  - "Write this schedule to the game" (`sp.gw.sch.one`).
  - "Write the schedule again then…".
  - "No hours here after this".
  - "nobody scheduled".
  - "move them to a site with the hours / days".
  - "someone is scheduled on it".
  - Refusals: "Someone's hours are not whole hours…", "Someone would work two places at
    once".
  - The uniform finding (`f.uniform.gaps`): "every role staffed at a station here" (the
    payload snapshot `link.json` moves with it).
  - The English-only hire review: "hours the plan does not own", "stretches of hours", "clears
    their hours".

## Keys

- **New keys** (as they appear above):
  - `app.menu.src.*`, `app.menu.tip2`, `co.fin.cash.none2` and `.tip`, `co.prices.tip.*`;
  - `co.std.at2`, `co.std.leg.unk2` and `.tip`, `gr.ing.col.onOrder.tip`,
    `gr.ing.col.target.tip`, `gr.ing.smart.short`, `gr.plan.surplus`;
  - `land.drop.title2`, `nav.px.hist.cli2`, `nav.search.placeholder2`;
  - `sb.del.*2` and `.tip`, `sb.fac.flat2`, `sb.fac.imports.n`, `sb.wh.flat2`;
  - `sb.size.tip.cap`, `sb.size.tip.dem(.pct)`, `sb.staff.tot.all`, `sb.staff.write2`,
    `sb.line.*2`;
  - `sp.gw.uni.keptlead`, `sp.tile.cap2`, `today.band.*2`, `today.alerts.none.sub2`,
    `today.det.opens2`, `today.kinds.toggle2`;
  - `wiki.stamp.*.said`, and the final fixes' `sb.*` keys.
- **Removed keys** stay in `i18n/*.json` as orphans (`python tools/i18n.py status` counts them).
- **Translations.** German, Spanish, French, Portuguese and Russian were drafted for every new
  and reworded key by gpt-6-sol (`import-draft --model gpt-6-sol`, marked for review). The
  result is 0 missing, 0 stale and 0 mismatched in all five.

## Tests

- Tests that asserted removed text now assert the structure or what remains. For example: the
  Status tip holds the sentence; there is no Total row; the order panel's totals; the
  header's Prices button; the read-out after arriving from a finding.
- No behaviour lost its coverage. Where a control was removed:
  - its behaviour is tested through the one that remains: marks on Changes rows; Back and
    the strip for Goods flow and the finder; the footer's theme switch and changelog; the
    page filters for Quick hire;
  - or the test asserts the control is gone.
- New assertions:
  - `ovEcho()`;
  - the Changes preview repaints after a mark;
  - an office's price tips;
  - the depot's empty blocks;
  - the verdicts' kept counts.

## Round 2: one row of controls (27 September 2026)

Peter, on the after screenshot of Supply › Imports: five rows of menus above the content, and
a subtitle. They were the news strip, the masthead, the area tabs, a row holding only Update and
···, the view tabs, the control row, and then "0 of 7 lines reach their next delivery with room."
Three rules for every area:

1. **Update and ··· live in the masthead, beside Search.**
   - The row they sat on is gone (`#mastSrc`, placed by `place()` in `web/app.js`).
   - The source strip is a full-width warning bar, shown only while something is wrong (its bad
     state). It keeps the recovery actions: Choose the folder again, Get the mod, Reload app.
   - A read in progress is the Update button, busy (a thin bar under it; still under reduced
     motion).
   - On a narrow screen the ··· menu hangs across the window under the masthead.
2. **The view tabs and the view's controls share one row.** The tabs are on the left and the
   controls on the right; below about 1100 px the controls take a line of their own under the
   tabs.
   - How: a view marks its control row with `data-view-ctl="<route>"`, and `ctlHoist()` moves it
     into `#viewCtl` beside `#localNav` while that route is on screen. A comment keeps its place,
     and it goes back when the route changes.
   - A view that draws itself again releases its old copy first (`ctlRelease()`), so no id is
     ever in the page twice; a `MutationObserver` hoists the new one.
   - The Supply handlers (`[data-sb-mode]`, `select[data-sb-scope]`, `[data-sbf-unfollow]`) and
     the CSS of the controls are no longer tied to `#pageSupply` or `#pageCompany`.
   - The controls in the row:

     | View | Controls in the row |
     | --- | --- |
     | Supply › Changes, Imports, Deliveries, Production | scope, Needs a change \| Everything, Full production \| Shop demand (each where the view has it) |
     | Supply › Goods flow | the followed site's chip, when one is followed |
     | Businesses › Results | the chart's window (30 days, All, By weekday) and its "?" |
     | Businesses › Products & prices | the business chips |
     | Staffing › Payroll | the satisfaction and trouble chips, and the "?" |
     | Expansion › Demand | By type \| What I sell \| Not yet, "usual order", and the "?" |
     | Expansion › Plan a factory | the type picker, the setup guide link, and the "?" |

   - Views with no control row (Standards, Milestones, Schedules, Staff needs, Find a location)
     show their tabs alone.
3. **No summary line under the controls.**
   - Supply's verdicts are removed as lines ("0 of 7 lines reach their next delivery with
     room.", Deliveries' two group notes, Production's verdict). Their words are the view tab's
     tip (`viewTip()`); the rows and their Status column show the state.
   - A landing's crumb ("from Needs attention · … ×") and an empty view's "No shelf or
     second-tier warehouse is on a delivery plan yet." still show.
   - Plan a factory's "n products of m bought in · also sells … as services" is the type
     picker's tip.

Left as they were: the news strip and the masthead's clock.

Screenshots, at 1440 light, of every page: `shots/after2-web/` and `shots/after2-cli/`, with the
same file names as the folders above. For example, `shots/after2-web/07-supply_imports.png`
shows the masthead, the area tabs, one row of tabs and controls, then the review card.

Tests:

- `shell_routes`: "a view shares one row with its tabs…" checks, on both targets:
  - the controls in `#viewCtl` on one line with the tabs at 1440;
  - no summary line, and the tab's tip;
  - the row following the route, a control working where it stands, and a redraw replacing the
    old row.
- `restore`: "on the board Update and ··· sit in the masthead beside Search…": their order in
  the masthead, no strip row while all is well, and the menu opening.
- **Moved:** tests that found a control inside its section now find it in the row; tests that
  read a verdict line read the tab's tip.

## Sidebar (27 September 2026)

Round 2 left three rows of navigation over every page: the masthead, the area tabs and a row of
tabs and controls. Peter asked for a sidebar instead, and chose variant B of the navigation
canvas (<https://claude.ai/artifact/AJjoC3UAJVEc3W5ttVQchk>: frames ImportsB, OverviewB, B at
1100 px, B dark; generator `mockup/nav-layout/build_nav_canvas.py` in the redesign checkout).

What moved:

| Element | Before | Now |
| --- | --- | --- |
| Company name, dot, sphere | masthead | the sidebar's head; the balls rest on its rule, at the right end |
| Search | masthead field, or its icon | a row of its own under the head; the icon on the rail |
| The five areas | a row of tabs | the sidebar; the open area's views under it, with their counts; the others a chevron |
| The views (Changes 14, Imports 7 …) | a row under the areas | under their area in the sidebar |
| The view's controls | beside the views | the top of the page, alone; nothing when the view has none |
| City map, Game guide (New) | masthead | the sidebar, under the areas |
| Clock | masthead | the sidebar's foot |
| Update and ··· | masthead | the sidebar's foot, beside the fold button; one ··· |
| News strip | above everything | the same, the full width above the sidebar |
| Footer | under the page | the same, under the page beside the sidebar |

The one ··· holds the save source (its status line, Choose save folder, Link to the game, One
save file, Where is my save?) and then What's new, Preferences and Help & feedback. On the local
server page, which has no save source, it holds the last three. The loud warning bar of the save
source still appears, at the top of the page, only while something is wrong.

Folding: the fold button at the sidebar's foot makes it a 64 px rail and back. The rail has the
sphere, Search, the areas, the references, a short clock (D47 · 14:30 · YEAR 1), Update and ···.
The choice is kept on the device (`localStorage` `ba_dash_sidebar`); if storage is refused it
lasts the visit. With no choice made, a window 1100 px wide or less starts on the rail. On the
rail the views return to the top of the page, left of the controls, which go to a second line
on the right when they do not fit. There is no fold on scroll.

The canvas's open questions, as decided: only the open area's views are shown; the rail falls
back to the row of views on top, with no pop-outs on hover; the Overview has nothing under it in
the sidebar; the sidebar's foot has no save-source line (it is in ···); the news strip spans the
full width.

What the canvas did not show, and how it was decided:

- **The fold button** is the last button in the foot's row, with a panel icon. Its name and tip
  say Collapse the sidebar or Expand the sidebar.
- **The difficulty chip.** At 1501 px and wider it ends the clock's last line in the full
  sidebar, and wraps under the year when it does not fit. On the rail and at 1500 px and under it
  is the footer's.
- **The sphere** rolls left along the head's rule as the page scrolls, as far as the rule is free.
  It rolled right in the masthead. The rail's head holds one ball. Clicking the name still rolls
  out up to three.
- **The sidebar's height.** It is the window's height less the news strip while the strip is in
  view, so its foot is on screen from the start (`sdFit()`).
- **A phone (560 px and under).** The sidebar is a drawer, opened by the bottom bar's Map & more
  (which opened a menu before). The day and Search are in the drawer. The views sit at the top of
  the page as on the rail. A place picked, the scrim or Escape closes it.
- **Hover names on the rail.** Each icon says its name on hover (its `data-tip`); the names stay
  in the links for screen readers.
- **Two tables beside the sidebar.** A 1280 px window leaves the page about 950 px. The Goods
  flow picture now gives way to the phone's chain below a 900 px box, where it was 950 px, so a
  1280 px window keeps the picture. Production's line names keep 220 px. The ingredients table's
  heads and names wrap.
- **The CLI's foot** has no Update: the local server page refreshes on its own.

Code: the markup is `<nav class="sd" id="mast">` in `div.sd-app` (the ids of the old masthead's
parts are kept: `#nav`, `#navRefs`, `#clock`, `#orb`, `#navMore`), and the board script's
"the sidebar: full, a rail, or a phone's drawer" section (`sdLayout()`, `sdSet()`,
`sdPlaceViews()`, `sdDrawer()`, `sdFit()`). The web page's Update and ··· are placed by
`place()` in `web/app.js`, and its ··· takes the utilities in through `nxMenuInto()`.
[architecture.md](../architecture.md), "The sidebar", has the rest. The routes, their aliases and
their history are unchanged: the sidebar only renders them.

Tests:

- **New in `shell_routes`:**
  - "the full sidebar holds the open area's views…": the views under Supply, the chevrons, the
    controls alone on top, the summary as the view's tip, the sidebar ahead of the page for the
    keyboard, the Overview and Milestones starting with their content;
  - "the fold button makes the sidebar a rail and back…": the rail, its hover names, the views
    back on top on one line, remembered through a reload;
  - "a window of 1100 px or less starts on the rail…": the default, a stored choice winning, and
    the fold working with storage refused;
  - "the sidebar's ··· opens beside it…".
- **New in `restore`:** "on the board Update and one ··· sit at the sidebar foot…" checks that
  one ··· holds the save source and then the utilities, and that a utility opens its sheet.
- **Moved:**
  - tests that measured the masthead (the sphere, the search control, the clock and its chip,
    the update banner and the news strip) measure the sidebar;
  - tests on a phone open the drawer first;
  - layout tests that assumed the page took the whole window allow for the sidebar (`layout`,
    `chart_hover`, `site_panel`, `flow_chain`'s 1366 case with the sidebar folded).

Screenshots of every page, at 1440 light and dark and at 1100 light:
`shots/after3-web/{1440-light,1440-dark,1100-light}/` and
`shots/after3-cli/{1440-light,1440-dark,1100-light}/`, with the same file names as above.

## Round 4: Peter's testing on his own saves (28 September 2026)

Peter used the hosted build on his own saves (Costy Co day 191, HART. YT) and sent sixteen notes.
Two final reviews ran on `81d2210`: Fable 5.1 reviewed the code and gpt-6-astra did QA. Every
note was reproduced on renders of those two saves, which stay outside the repository.

| # | Note | What changed |
| --- | --- | --- |
| A1 | Unstyled dropdowns (Imports' Whole company) | Every select that wore the browser's own arrow now has the board's look: no native chrome, a quiet chevron, the board's font, border and colours. This covers Supply's scope, Plan a factory's type, the recipe pickers and the landing's save-folder select. Native lists follow the theme's `color-scheme` |
| A2 | "Copy the change" | Gone from the import card; Manual instructions says the same, and Changes keeps Copy remaining |
| A3 | Goods flow: drag and zoom like the map | The picture is a camera on its viewBox, as the City map's is. Drag moves it, the wheel or + and − zoom it (pinch too), and ⌂ shows the whole chain. On the stage the arrow keys move, + and − zoom, and 0 fits. A redraw keeps the camera, and a newly followed site is centred at a readable size. The sideways scroll and its 0.8 floor are gone. `flowFit()`, `flowZoom()`, `flowWirePan()` |
| A4 | "The game link does not write factory hours or hires here" | Removed, with the other notes that restate an absent button: "by hand; no game-link write" on Changes rows and the card's purchase, and "Not written by the game link." in the manual steps |
| A5 | Headers on two lines (Makes / day) | Column heads never wrap. The Supply tables take tighter cells and a 130 px status column, so Imports fits beside the full sidebar at 1440 px and Deliveries and Production at 1280. What still cannot fit (Imports at 1280) scrolls inside its box, and so does the ingredients table in a longer language |
| A6 | "Full production vs Shop demand seems to not change anything" | See below |
| A7 | "staff-hours that buy nothing", "Customers by hour, on its page" | The finding reads "{site} has 214 staffed hours a week more than its customers need: …, at 3 customers an hour". The link labels read "See customers by hour", "Open its shelves" and "Open its fees". At capacity reads "…, with $X/day of sales in those hours. Cash registers are the limit; the fix is …". "Ask for nobody" is now "need nobody" |
| A8 | "Demand data complete: switch to the demand plan" on the demand plan | Shown only beside Full cover 24/7, the plan it hands over from |
| A9 | "0 of 67 copied" | The schedule block's ring and count are gone (the ticks and "clear ticks" stay), as are Changes' "0 of n recorded or applied" and the Overview's "Your changes" line, which said the same |
| A10 | Staff needs: two headlines | "Open places" is gone; the filters under Whom to hire say what the table is |
| A11 | The roles table cut off | The panel goes under the table when the section is narrower than 1080 px (a container query, since the sidebar takes its share) |
| A12 | "Where the books part from the rates" | "Sites whose wages yesterday differ from today's rates", each row "paid $X yesterday · $Y at today's rates" |
| A13 | "Trend history starts building from today" | Removed (Demand's note and the empty movers line) |
| A14 | Plan a factory | The sentence under the products is gone (the Supplies cells and the Made tile's tip say it). The ingredients' cost sentence is gone too: the Total row is the cost, and where prices come from is the Cash / week head's tip. The Change column hides when no row has a change |
| A15 | "Game guide" | Called the Wiki again: sidebar, search, links, crumbs, tips, docs and translations. The Demand and Plan a factory links read "Wiki page". Routes and aliases are unchanged |
| A16 | The Ask strip | × puts it away and leaves the reader on the answer's page |

**A6, what the basis changes.** Full production against Shop demand changes only figures that come
from a factory line: factory-input imports, a line's hours and output, and factory staffing. On
Costy Co the shops use nearly everything the factories make. Under Needs a change the two bases
give the same Changes, Imports and Production, word for word. Under Everything, Imports moves
uses/week by under 1% (2,452,800 against 2,443,068) and Production moves makes/day as little. On
HART. YT, Imports and Production change a lot (909,655 against 408,209 uses a week, 42 against
28 factory workers). Its Changes are the same under both, because its changes are shop imports
and deliveries, and shop demand never makes "fewer hours would do" a change. Nothing is computed
wrong. The switch showed wherever the company had a factory line, whether or not it changed
anything. Now each view builds its body the other way too and compares the text; the switch shows
only where they differ, for the view as filtered (mode, scope): `sbBasisDiffers()`. `sbData()`
keeps one cache per basis, so the second build costs nothing twice. On Costy Co the switch now
shows on Imports and Production under Everything only; on HART. YT on Imports and Production
under both modes.

Review items done in the same round:
- main merged (Korean, the news strip, the unmeasured-routes hotfix);
- the changelog entry describes the sidebar;
- the flaky uniforms test waits for its text, and the navigation slice no longer ends on a line
  ending;
- a stored "full" holds only wider than 1100 px, so a window snapped to half the screen gets the
  rail (unfolding there lasts the visit);
- the landing's save-folder box has a **More help** link that opens the save help;
- `docs/dashboard-reference.md` and the ledger (`docs/archive/ui-structure-proposal.md` §12) describe the
  sidebar, the footer and the one menu, and the reference uses no roster or shift words outside
  code names and the game's own text;
- Fable's NITs:
  - "the masthead says" and "shifts" in the hire dialog are reworded;
  - the discarded values are gone with their computations;
  - so are `ssFitMast()`, `growthPlanLink()`, `.nx-co`, the Quick hire skill handler and the
    second `.nx-sr`;
  - in the phone's drawer one Escape closes the menu and a second the drawer;
  - the phone bar is labelled "Places".

Not done: the Quick hire branches of the demand popover (`hrPop.target === "quick"`) are
unreachable but woven through the hiring code, and were left rather than risk it.

Screenshots of the touched views, 1440 light: `shots/after4-web/`.
