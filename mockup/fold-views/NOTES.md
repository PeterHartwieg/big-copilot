# Fold the low-value views (R15)

Canvas: https://claude.ai/artifact/BKCrqkVgjx214GUop3DENp

Source: UX audit R15, 24 Sep 2026 (`research/ux-audit-2026-09-24/ux-audit.md`, sections 1, 2.1,
2.3, 3.2). The generator is `build_fold_canvas.py`; `project/` is its output. It reads the live
board's stylesheet out of `TEMPLATE` in `ba_dashboard.py` (plus `web/map.css` and
`web/wiki.css`, as `render()` splices them in), so the artboards look like the board as it is
on the day you run it. Numbers are modelled on a day-73 save and rounded.

Nothing here is approved. Get Peter's go before any port.

## Decisions for Peter

1. **By weekday: one option in the chart's existing switch** (`30 days · All · By weekday`)
   rather than a second switch. It is absent when no series clears the test. Fine?
2. **Default series** in By weekday: Revenue, then Profit. Customers gets a chip only once the
   chain's footfall clears the test (on this save it has 2 weeks and does not). The old section
   opened on Customers, which is why it said "not enough history" while Revenue had 8 weeks.
3. **Window for the company's weekday.** It reads all 8 weeks, most of them from before the
   clothing shops opened, so it peaks Friday (+16, Sunday −18). Over the last 4 weeks the same
   series reads Friday +7, Saturday +5, much closer to the shops' own Saturday. The canvas keeps
   8 weeks and names it on the series line. Should it read the last 4 weeks instead?
4. **Type chips replace "site by site".** One chip per business type, each with its sites' peak
   days (`Clothing Stores SAT×5 SUN×2`); a click opens the old table for that type only.
5. **Plan imports: option A (live count) or B (drop the card).** I recommend A. B would hide
   this save's one change (Metal Band, Smart Delivery stock at Import Hub) from Today, because
   it is not a finding. The four states in A: `1 TO CHANGE`, `4 TO CHANGE`, `ALL TICKED`,
   `ALL SET`. The first two are green like the siblings' counts; the last two are the quiet
   dashed badge.
6. **"Every building owned 0 / 885"**: it becomes "0 buildings owned" in the totals line
   (drawn), or goes entirely.
7. **Where the difficulty lives**: the masthead's build line (placement 1), the footer stamp
   (placement 2), or both. The masthead's clock is hidden under 500 px, so placement 1 alone is
   invisible on a phone. I recommend the masthead on desktop plus the footer on phones. The web
   site's footer has no file name (the source strip has it), so there the chip sits beside
   "Game build".
8. **The chip's words**: `CUSTOM · 10 HARDER` (with `· 1 EASIER` when some settings are easier;
   `NORMAL`, `EASY` or `HARD` for an untouched preset). Should Normal show a chip at all?
9. **The popover's sliders**: one per setting, Normal as a tick and this game as a dot, with
   right always harder. The three settings where lower is harder (Base customer promotion,
   Export price, Resale value) are flipped. Keep them, or show plain numbers?
10. **Proposal only (Row 5)**: Company in three tabs, Results · Products · Staff (R14). The
    career checklist moves into the difficulty popover, retitled "This game". Only if R14 goes
    ahead.

## What would be removed (every visible cut)

Weekly rhythm (Company › Results)
- The "Weekly rhythm" section and its heading.
- Its sentence "Not enough history to separate a weekly cycle from noise." The option is
  absent instead.
- The separate Customers / Revenue / Profit switch. It becomes the chart's legend chips in By
  weekday, and a series that fails the test gets no chip.
- The "site by site" link. It becomes the type chips; the table stays, one type at a time.
- The ? note's verdict sentence ("12 sites clear the noise test"). The type chips show it.
  Today's and yesterday's weekday reading moves to the tooltip on the series line.

Peaks (site page, Products): nothing is removed. Three labels change:
- The site page's "Its week" gains a series line: "This shop's revenue · 3 weeks".
- The Products "Peaks" header becomes "Peaks · units". Its tooltip and the cell tooltips say
  "units sold across N stores, last 2 weeks".
- The company chart names its own series: "Company revenue · every site · 8 weeks".

Plan imports (Today › Next moves)
- A: the sentence "Plan weekly orders and get a checklist of settings to enter in-game." and
  the `CHECKLIST` badge.
- B: the whole card, and its sentence in the Next moves ?.

Milestones (Company › Milestones)
- The "Every building owned 0 / 885" row (see decision 6).
- The ten difficulty chips (they move to the popover).
- The head's "playing on custom settings, 10 settings harder than Normal, started on $0" (moves
  to the popover).
- The ? about presets (its sense moves to the popover's first line).
- Proposal only: the Milestones tab itself.

## Porting map

Anchors are function names or strings in `ba_dashboard.py` unless noted.

### 1. By weekday (no payload change except products' weeks)

- `drawChart()`: the `seg($("chartTools"), [[30,"30 days"],[0,"All"]], …)` list gains
  `["wd","By weekday"]` when `D.rhythm.revenue || D.rhythm.profit || D.rhythm.customers`.
  With `chartWindow === "wd"` the box draws the series line, `weekHtml()`, the series chips
  and the type chips instead of the SVG. Keep the axis code untouched for the other two.
- Reuse `weekHtml()`, `miniWeek()`, `weeksOf()`, `RHYTHM_VIEWS` (its notes become the series
  line), and the `swingy` grouping in `drawRhythm()`, now by `b.type` for the chips.
- Remove `#secRhythm` from `TEMPLATE`, `drawRhythm()` from the draw list, the `secRhythm`
  entry in the section → page map (`secRhythm:["company","results"]`), and `rhythmView` /
  `showRhythmSites` in favour of the chart's own state. Any `ALERT_LINKS` or deep link to
  `#secRhythm` should land on `#secDaily`.
- Site page: the `sechead("Its week", …)` in `drawSite()` gains the series line inside its
  chartbox, `weeksOf(b.rhythm)` weeks.
- Products: `drawProducts()` header and `peakTip()`. The weeks need a payload field:
  `_product_rhythm()` → `{"weeks": min n}`, copied onto each product beside `peak` / `swing`
  in `extract()` (the `beat = product_rhythm.get(…)` loop). Add a Python test.
- CSS: `fv-basis`, `fv-top`, `fv-legend`, `fv-types`, `fv-type`, `fv-sites` (rename or keep
  the prefix; classes are global).
- Tests: `tests/navigation.test.cjs` (lists `#secRhythm`); fixtures with `rhythm: null` in
  `tests/office_site.test.cjs` and `tests/site_panel.test.cjs` stay valid. New: a chart test
  that `By weekday` is absent when every profile is null, and that a null series gets no chip.
- `docs/dashboard-reference.md` (Weekly rhythm entry) and `docs/architecture.md` (the
  `rhythm` payload key's reader).

### 2. Plan imports card (option A)

- `buildOrderChecklist()` today runs only inside `drawLogistics()`. Lift the row build into one
  function that both `drawLogistics()` and a new `drawPlanImports()` (beside
  `drawFindLocation()` / `drawOptimizeStaffing()`) call. The count is rows minus the marks in
  `orderMarkCache` / `ba_order_marks_v1:<character>`, the same sum as the checklist's
  `N to do`, so the two cannot disagree.
- `TEMPLATE`: `#planImportsCard` keeps its markup; its badge and `.what` get filled like the
  siblings (`soon live` for a count, plain `soon` for ALL TICKED / ALL SET).
- Tests: `tests/import_setto.test.cjs` builds checklist rows and should follow any lift. New:
  the card's count equals the checklist's `to do` for the same rows and marks.
- Option B instead: drop `#planImportsCard`, its `wireCards()` listener, the sentence in the
  Next moves ?, and give `.moves` two columns.

### 3. Difficulty chip and Milestones

- `drawGoals()`: drop the "Every building owned" `ofAll` row, push `buildingsOwned` into the
  totals line, drop the `quiet` difficulty text, the `why` and the `.rules` chips.
  `tests/milestones.test.cjs` asserts exactly those (the head and one chip per setting): move
  its assertions to the new popover builder.
- New `drawDifficulty()` from `D.meta.houseRules` (`label`, `harder`, `easier`,
  `startingMoney`, `rules[]` with `value`, `normal`, `unit`, `lean`, `what`). No payload change;
  `lean` already says harder or easier, so the slider needs no table of its own.
- Placement 1: `drawMast()` puts the chip in the clock's flags line (the `flags` array
  beside `BUILD … UNCHECKED`), always, not only when there is a flag. Placement 2:
  `drawFooter()` (`#footBuild`) and the footer markup builder that emits `footBuild`
  (the `file_slot` / `footBuild` lines near the top of the file).
- The popover hangs off `<body>` with `position:fixed`, placed against its chip, like
  `#alertPop` (AGENTS.md trap: a popover inside a section is clipped). Esc and an outside click
  close it; the chip is a real `<button aria-expanded>`.

## Canvas mechanics

- Tweaks per artboard: `dark` (theme) and `marks` (the dashed goes / moves / new outlines and
  the "Says:" lines, which are review aids, not design).
- Interactive: the Daily result switch, the Revenue / Profit chips, the type chips, weekday
  hover read-outs, the difficulty chip (click toggles the popover), tooltips.
- Phone artboards assume R5's fixes (Next moves stacked); the phone masthead is the live one.
