# Big Copilot redesign: design notes

Canvas: https://claude.ai/artifact/3SHd8qiXKbKqsYPoz5vv2h (Design type, 60 artboards, 5 pages).
Generator: `build_redesign_canvas.py` with `kit.py` and the `boards_*.py` modules. Rerun it
and never hand-edit `project/`. `--preview` writes plain HTML into `_preview/` for Playwright
screenshots (not committed). Publish from a scratchpad copy of `project/`.

Baseline inspected: `origin/main` at `09c5c32` (PR #155), in the ui-ux-audit worktree. The
brief is `docs/ui-structure-proposal.md` there; `coverage_data.json` is its 105 IDs and 31
finding kinds, parsed from that file. The current board was rendered from the synthetic
`tests/fixtures/payload_snapshot/data_day47_history.json` for the visual baseline. All
companies, names and numbers on the canvas are made up (Marlow Trading, Juniper & Co); the
city map is a drawn stand-in, not the private map geometry.

## Pages

1. Structure: Sitemap, Coverage (every ID and kind, existing / regrouped / new work, and
   the frame), Rationale, NavCompare, the masthead alternative, Motion.
2. Overview: first screen 1440 × 900, whole page dark and light, all 17 findings,
   Customize checks, no urgent findings, shop-only company, failed refresh, German labels
   and long names, keyboard focus with reduced motion, 1024, 768, phone dark and light.
3. Supply fix journey: Changes, Imports (from a finding), the write (preview, permission,
   applying, done), return to the queue, applied / marked / confirmed, refused (lock
   window), over the cap, conditions changed, older mod, Production, no factories, phone
   imports dark/light, phone write sheet.
4. Staffing, Businesses, Expansion: Schedules, Results, a business page, business pages
   by kind, Products & prices (company, then one shop), Find a location and its building.
5. Supporting: Deliveries, Goods flow, Staff needs, Payroll, Standards, Milestones,
   Demand, Plan a factory, Game guide, City map, Preferences, Help & feedback (Retired
   features as a contingency), the no-save entry.

Play mode links: Main → Review import amount → Imports → Preview in the game → Apply →
Allowed in game → Done → Back to Needs attention (OverviewReturn). Manual path: Imports →
Mark done by you. Main's factory action → Production (toggle Plan for). Schedules →
Canal Brewery → Production. Main's "Check prices and product sales" → Prices → the florist
→ PricesShop. Demand's Florist × Midtown cell → Finder → Floor plan and costs → Results
(filters kept).

## Decisions made without Peter

1. **Sidebar navigation on desktop** (240 px, 208 at 1024); the evolved masthead is the
   alternative and becomes the 768 layout (labelled tab row); phones get a labelled bottom
   bar with all five destinations plus "Map & more". The active area's local views show
   in the sidebar, so Imports, Production and Schedules are visible words.
2. **Company strip, not tiles**: one line of four figures with sparklines.
3. **Critical rows are rich** (place, item, kind, headline verb, evidence in numbers,
   consequence chip, a small evidence picture, a named action, what the game link can do);
   **warnings are one line** with a named action. All critical cause groups always show;
   the rest shows 5 and counts the remainder ("Show all 17").
4. **Right rail**: what the board checked, and your changes with the four marks. Moves
   under the list below 1200 px.
5. **Four marks**, one vocabulary everywhere: Suggested (dashed), Marked done by you,
   Applied through game link (blue), Confirmed from refreshed data (green). A row keeps
   its place when its mark changes.
6. **Imports split recurring from one-time**: the weekly order (editable, reset, cap,
   game path, lock-window time) beside the catch-up bought by hand (urgent fee, not
   written). Smart Delivery shows "in stock", fixed amounts "a week", with tank and truck
   icons.
7. **Plan for** replaces "Size lines for 24/7 | Demand" with "Full production | Shop
   demand", on Imports, Production and the copied checklist, and shows what the other
   basis would say ("Shop demand would suggest 11,040").
8. **Production owns factory staffing**: tiles (machine-hours, workers, wages, 12 h cap),
   shifts per machine with names and dashed hires. Staffing lists factories as links here.
9. **Prices are comparisons**: Products & prices picks a shop first; the page says there is
   no pricing model.
10. **Secondary text contrast**: dark ink-3 #808a84 (was #6b756f), light ink-3 #636c71 (was
    #8b9499), light warn #b34d00 (was #c25400). The others are the shipped tokens.
11. **Brand**: the dot pays coins, the sphere rolls from the dot onto the page head's rule,
    three on wordmark clicks and the fourth gulps one, the checklist truck drives its road,
    the wire on every write. The landing keeps a sphere on its own shelf. Reduced motion
    has a still form for each (Motion sheet).

## New data or backend needs

- A deadline per finding where the model has one (supply rows know the run-out day and
  hour; the finding does not carry it) and an action id per finding kind.
- A local resolution record per finding (marked-done time, applied-write stamp);
  "confirmed" compares the next payload. A changed recommendation clears an old mark.
- Plan for kept per company: `SIZING_KEY` keyed by character.
- Goods flow's product filter needs product slugs on graph links (#148, decision 7).
- Nothing for the navigation itself: old hashes map to new routes (Sitemap footer).

## Open questions for Peter

1. Sidebar (recommended) or the evolved masthead on desktop?
2. The right rail beside Needs attention: keep it, or give the list the full width?
3. "Next finding" on the arrival strip is drawn as proposed. Worth building?
4. Five warnings before "Show all": the right number?
5. Accept the three token changes for secondary text?
6. The German frame translates the shell and main actions only; the i18n pass decides the
   rest.

## Porting order

Shell and routes; Overview (Needs attention rows, task directory, replacing Next moves and
Ask the board); Supply local views over today's tabs with scope and Plan for; the arrival
strip and return; the four marks; Staffing and Businesses landings; Expansion. New classes
keep the `nx-` prefix (the canvas hit `.st`, `.ring` and `.sw` collisions on the way).

## Round 2 (after the design review, 26 Sep 2026)

Page "Round 2 · after review" (the canvas opens on it) redraws five screens from
`boards_r2.py`; round 1 stays for comparison. The review's direction was taken as given:

- **Shell:** the refined masthead (five destinations, City map, Game guide, source and clock)
  with a persistent local row inside each area. `R2OverviewSidebar` is the same content and
  type scale with a slim sidebar, for the comparison the review asked for.
- **Overview:** one compact summary per critical finding (where and what · what matters now ·
  one picture · one action), the first one expanded (weekly amounts by basis, who goes
  without, ways to fix). No right rail: "Checked 14 businesses ▾" and "Your changes ▾" are
  one line. "All tools" sits beside the heading and in the sticky condensed bar of a long
  queue (`R2OverviewLong`). Four tool panels with small working pictures.
- **Imports:** 8,400 → 18,740 units a week as the lead, labelled "Planned for full
  production", on one scale with today's draw and the 1 Pier cap. One action bar: the state
  pill, the game-link preview and "Mark done by you" as alternatives; "Why this amount?",
  "Set it in the game" and Copy open on demand (`R2ImportsOpen`). The one-time catch-up is
  a separate dashed strip.
- **Changes:** the truck on a longer road, rows lead with product and site, then current →
  proposed with the unit, where it is set and one state pill. Copy preview and the count
  explanation open on demand.
- **Business page:** one heading, mini bars for revenue and customers, a segmented profit
  bar, peak customers against capacity, named amenity lamps.
- **Phone:** one context line, one selected finding with its rail and the only filled
  action, Supply views as pills with a visible continuation button.

Before/after sheets (`BA*`) hold matched crops (uploaded assets, ids in `assets.json`) and
what was removed, what became visual and where deferred detail lives. On-page words of the
main area, measured the same way on both: Overview 639 → 307, Imports 378 → 156, Changes
421 → 132, business page 201 → 130, phone Overview 270 → 130, phone Imports 97 → 56.

Also fixed in round 1 frames: Production no longer puts named people on machine bars (it
shows scheduling blocks and counts people), "Post factory workers" and "Longest shift" are
gone, and the design notes inside Goods flow, Finder, Production and the arrival strip
moved to canvas notes.

Not yet checked: the canvas in Play mode, real phone browsers, text enlargement, contrast
by measurement, and a quick user check of the three review tasks.

## Round 3 (26 Sep 2026): interactions made explicit, carried across every screen

The canvas is now one design in the masthead treatment (`screens.py`); round 1 lives in git
history and on the History page as matched crops. Page order: Overview, Supply fix journey,
Staffing/Businesses/Expansion, References and utilities, Structure and journeys, History.

- **Details per finding**: a labelled Details control with a turning chevron, closed by
  default, so all critical summaries are visible; Review import stays the separate action.
  `OverviewDetails` shows one open.
- **Two fixes, two problems**: "Prevent the recurring shortage: increase the weekly order"
  and "Cover the gap until Monday: buy approximately 3,050 units now" are numbered fixes in
  the finding's details and two side-by-side sections on Imports, each with its own actions;
  only the first can be written by the game link. The gap is bracketed on the stock rail.
- **Three kinds of done**: Marked by you is an outlined neutral tick, Applied · awaiting
  refresh is blue, Confirmed is solid green (tick and pill).
- **Labels restored**: phone severity words, "Live · updated 14s ago", "Manual instructions"
  instead of "Set it in game", machine names on the factory hours strip, Service / Pricing /
  Cleanliness / Facility under the satisfaction bars.
- **Plan for switches in place**: Imports carries both bases; toggling moves the amount,
  its label and the scale's planned marker (`ImportsDemand`). Shop demand explains why
  today's draw is higher than the plan.
- **Journeys**: open a finding, follow its supply connection (Goods flow following Water),
  change the planning basis, return to the queue; storyboarded on `Journeys` and drawn at
  1024, on a phone and with text at 130% (CSS zoom on a 300 px layout).
- Every other screen renders through `screens.app2()` with the masthead and local row;
  explanatory paragraphs that described the design were removed or cut to one line.

Checked in a real browser (Playwright, previews): every frame for markup balance and
overflow; Overview, Imports, Changes, business page, Production, Goods flow, Journeys, the
1024 and 768 Overview, 1024 Imports, phone Overview with Details, phone Imports and both
130% frames by screenshot. That pass caught the 1024 Imports showing the full-production
amount under Shop demand, the 1024 masthead colliding with the sphere, the 130% phone top
bar clipping, a stray closing tag in Goods flow and the checklist count losing its size.
Not checked: Play mode in the canvas itself, real phones, measured contrast.

## Implementation handoff (26 Sep 2026)

Peter: keep the current visual direction and move into implementation. The prototype's
remaining placeholders do not need to be implemented in the canvas. The four requirements
below are binding for the port; each says what the canvas shows and what it does not.

### H1 · One basis, one amount, everywhere

The selected planning basis (Full production / Shop demand) and the amount for a change
(the suggestion, or the player's edit) come from one record per change. Every surface that
names the change reads that record and never recomputes on its own:

- the lead amount, its "Planned for …" label and the scale's planned marker (Imports);
- "Why this amount?" (the arithmetic and its basis in the heading);
- the manual instructions (the Amount to type);
- copied text: Imports' Copy, Changes' Copy remaining and its preview (each line names the
  basis, as today's copied output names the model);
- the write preview's before → after, and the undo text after the write;
- the finding's Details on the Overview and the change's row on Changes.

Switching the basis recalculates the suggestion. A player-edited amount is kept (today's
rule: kept per character, depot and material until reset or until the game's figure
moves) and shown with the new suggestion beside it and "Reset to N". A write sends exactly
the amount on screen and the preview names the basis it was planned on.

Acceptance: switch the basis, edit the amount, then open Why, Manual instructions, Copy and
Preview in the game: all show the same number and the same basis.

Canvas status: the Imports basis switch keeps the amount, label, scale, Why and manual
instructions consistent (`Imports`, `ImportsDemand`). Editing the amount is not wired, and
the copied text and the write preview frames are drawn for full production only.

### H2 · Shop demand names the factory hours it needs

A recommendation sized on Shop demand that assumes a factory line runs different hours from
now must say so where the amount is: the factory, the line and machines, current hours →
required hours, what happens if the hours stay as they are, and a link to Supply ›
Production with that factory selected. The same dependency appears as its own step in the
manual instructions and the copied text, and as its own, non-writable row on Changes; the
game link never implies it changes factory hours. The same rule applies under Full
production when the plan assumes staffed hours the factory does not have (Beer 4 idle).

Canvas status: `ImportsDemand` shows the dependency beside 11,040 (Canal Brewery's four Beer
machines at 13 h a day, now 24 · 24 · 12 · 0 h) and as step 3 of the manual instructions;
`PhoneImportsDemand` carries the same sentence. Changes does not yet draw the dependent row.

### H3 · Returning keeps the finding, the filters and the place

Leaving Needs attention for a task and coming back (the arrival strip's back button,
browser Back, or Back to Needs attention after a write) restores:

- the originating finding, scrolled into view and outlined for a moment, with its new mark
  (Marked by you, Applied · awaiting refresh);
- the list as it was: order, severity filters, "Show more" state and which Details were
  open; nothing reorders while the page is open, and findings that arrived with a refresh
  are announced rather than inserted above the player's place;
- the scroll position.

If the finding has left the list after a refresh, land at its former place with a status
line saying why (confirmed, below the line, switched off). The destination keeps its own
state on Back too: Supply scope, Plan for, Needs a change / Everything; Find a location's
filters, sort and saved search; Schedules' business and day. The route carries the finding
id and the filters (as `#site/…` routes do today), so reload and Forward work.

Canvas status: `OverviewReturn` shows the finding kept in place and marked; filters, open
Details and scroll restoration are not demonstrated. `FinderDetail` → Results shows kept
finder filters as a label only.

### H4 · What in the prototype works, and what only looks like it does

**Working in Play (inside the artboard):** Details / Hide on every finding (Overview, phone);
Show more / Show fewer; the Plan for switch on Imports and on Production; Why this amount? /
Manual instructions (one shared panel); Preview the copied text on Changes; ticking a
Suggested row on Changes (it becomes Marked by you, the truck and count move); the All tools
and Needs attention jumps; the wordmark dot's coins, the sphere's entrance, squish and the
wordmark's extra spheres; the dark and reduced-motion tweaks.

**Linked (opens another artboard that shows the result):** every masthead destination and
local-row view; finding actions (Review import, Plan factory hours, Resolve staff demand,
Open readiness) and warning actions; tool-panel tasks; the arrival strip's back button;
Follow the supply route → GoodsFlow; the separate fix → Production; Preview in the game →
WritePreview → Apply → WritePermission → Allowed in game → WriteDone → Back to Needs
attention → OverviewReturn (Close → ImportsApplied); Mark done by you on the weekly order →
ImportsMarked; Customize checks → Customize; Florist × Midtown on Demand → Finder → Floor plan
and costs → FinderDetail → Results → Finder; on the phone, Review import → PhoneImports →
Preview in the game → PhoneWrite.

**Illustrative states (drawn, not reached by an interaction):** WriteApplying (the apply in
progress), WriteRefused, WriteOverCap, WriteChanged, WriteOldMod, ImportsConfirmed (what a
later refresh shows), OverviewLong (the queue scrolled, sticky bar), OverviewCalm,
OverviewShopOnly, OverviewStale, OverviewNames, OverviewFocus, ProductionNone, the 1024, 768,
phone and 130% text frames, ImportsManual (the panel already open), and the chosen positions
of segmented controls whose content does not change.

**Unwired controls (look real, do nothing):** severity filter chips; "Checked 14 businesses"
and "Your changes" disclosures; the switches, $ line, Reset and Done in Customize checks; the
company/save chevron, Update, the ··· menu and Search; every Copy button; Mark done on the
gap until Monday and on the phone; Clear my marks; Apply 2 import amounts (opens the
single-import preview); Undo; editing any amount field; Try again and Open a save file;
Needs a change / Everything, 30 days / All / By weekday and Profit & loss / Satisfaction
(selection only); Find a location's filters, saved searches, list rows and map zoom;
Schedules' business list, Demand plan / Full cover, now / plan and day tabs; shop chips on
Products & prices other than the florist; the phone's Plan for switch (its two states are
separate frames), its Supply view pills beyond Imports and its Why / Manual buttons; the
Stitch Yard recipe picker; every control on Preferences, Help & feedback and the no-save
entry.

The port should treat only the first two groups as specified behaviour; the illustrative
states are specified appearance, and the unwired controls are specified placement and
wording only.
