# Big Copilot — feedback on the first redesign canvas

Reviewed 26 September 2026. Designer branch: `ui-redesign-canvas`, commit `4617830`. Canvas: `mockup/ui-redesign/project/`. Current-product comparison: the audited `09c5c32` source rendered with the synthetic payload fixture. This is design feedback, not a production change or a usability-test result.

## Overall assessment

The proposed organization is worth keeping. Needs attention leads; Supply has understandable destinations; actions lead into specific workflows. The visual treatment needs another pass before we extend it across all screens.

The problem is not simply the number of words. Too many kinds of information compete at the same level: the problem, its evidence, the calculation, implementation limitations, data provenance, navigation guidance, and design rationale. The reader must separate these before acting. Small grey text and repeated monospaced explanations make that effort feel heavier.

The existing UI has its own discovery problems, but it gives data distinctive visual forms: large numbers with useful miniature charts, satisfaction instruments, amenity icons, hours grids, stock rails, and the checklist truck. The redesign retains several ingredients while reducing their visual role. A sphere above a dense interface cannot carry all the personality.

Preserve the five destinations, Needs attention first, explicit task names, return context, and the distinction between manually recorded, game-applied, and verified changes. Rework how much appears at once and how information is represented.

## 1. Recompose Needs attention around a quick decision

**Frames: Main, OverviewFull, OverviewLight, PhoneOverview. Highest priority.**

The first desktop import finding presents a location/product/kind line, imperative headline, order explanation, deadline chip, consequence sentence, stock rail, related-finding link, action button, game-link explanation, and manual catch-up note. The next finding repeats that level of detail. With a navigation column and right rail, the useful center becomes narrow and vertically expensive. Task discovery is pushed far down the page.

Use a compact summary for every critical issue, with one selected finding expanded when needed. Keep every critical summary in the queue; reducing explanations must not hide critical findings behind a count.

A default finding should answer:

- **Where and what?** Water · Bridge Hub.
- **What matters now?** Runs out Sat, about 14:00.
- **What should I do?** Review import.

One small visual can carry the supporting evidence: a stock-cover rail with a clearly marked delivery. The expanded state can hold the weekly demand, calculation basis, affected businesses, related fixes, and write/manual options. Do not repeat the site and product in both a metadata line and a full-sentence title when they are already clear.

Suggested default treatment, using the canvas's example data:

> **Water · Bridge Hub** — Runs out Sat ~14:00  
> [stock cover → shortfall → Monday delivery]  **Review import →**

The expanded finding and Imports page should clearly distinguish **current draw** from **planned full production**. The canvas moves from 12,180/week in the Overview explanation to an 18,740/week recommendation in Imports. Those can reflect different assumptions, but the change of basis needs to be visible next to the quantities.

Explore roughly 80–110 px for an ordinary desktop summary as a design target, not a hard limit for long translations or complex cases. Use stronger type and fewer lines; do not achieve compactness by shrinking text.

## 2. Remove the permanent right-hand explanation rail

**Frames: Overview variants, Imports, Changes.**

On Overview, “What the board checked” repeats the businesses, supply lines, staff, checks, and snapshot already stated below Needs attention. Remove this duplicate panel. Keep a short source/check status with a labeled disclosure for details. Failed refresh, missing data, and disabled checks must remain noticeable when relevant.

Move “Your changes” to a compact activity entry that opens recent changes. An actively pending or failed game write may need a visible status, but completed history does not need equal space with urgent findings.

On Imports, “Where this change stands,” “Change it yourself,” and “Let the game link set it” create another permanent text column. Bring the active status and action to the recommendation itself. Put status explanations and copy previews behind explicit controls.

This gives the important evidence room without increasing page height.

## 3. Remove design commentary from the product

**Frames: Overview, GoodsFlow, Production, Finder, and related variants.**

These are actual examples that should become canvas annotations rather than interface text:

| Current text | Requested treatment |
| --- | --- |
| “Critical findings are never folded away” | Demonstrate it through the queue; remove the sentence. |
| “Ranked by materiality, as today” | Remove. If ordering needs an explanation, use an optional “How these are ranked” disclosure. |
| “The same thirteen tasks, in the same places, every visit. Counts follow the save.” | Remove. Stable placement should be experienced. |
| “PRODUCT FILTER · NEW WORK” and “PROPOSED” | Put these in notes outside the artboard. |
| “one plan · also opens from Staffing” | Remove the badge; demonstrate the shared destination through the prototype. |
| The Goods flow sentence referencing the shipped phone view and issue #148 | Keep it in implementation notes. |
| Finder's general warning about building capacity | Remove from the default introduction; retain accurate capacity labels and appropriate contextual guidance. |

Do not remove information needed to choose safely: units, plan basis, relevant deadlines, limitations of a particular write, and uncertainty still belong at the decision point.

## 4. Restore the existing visual language beyond its colors

**Frames: all, especially Overview, Results, BusinessDetail.**

Use the shipped site page as a visual reference for expressive, useful data. The current product's revenue/customer mini charts, segmented profit bar, satisfaction bars with targets, and amenity symbols are more characterful than a label plus a small explanatory paragraph.

- Keep Archivo for sentences, actions, and navigation. Reserve IBM Plex Mono for numbers, units, times, and brief technical labels. Multi-line monospaced prose should be exceptional.
- Give a selected finding, key quantity, or important diagram a clear visual lead. Much of the new screen currently has similar small type and subdued contrast.
- Preserve compact summary metrics above Needs attention, but give their numbers and relevant trends enough weight to be read at a glance. Do not restore a giant metric wall.
- Bring back meaningful surface contrast, not a box around every sentence. Group related evidence on a shared surface and let the rest breathe.
- Use existing semantic colors for warning, loss, success, and information. Playfulness does not require a new rainbow palette.
- Improve contrast by design and verify it in implementation. Do not revert the proposed secondary-text improvements merely to match an older hex value.

BusinessDetail is one of the strongest new frames: satisfaction bars, amenity icons, and the customer heatmap do real explanatory work. Even there, the new summary tiles could recover the small history and composition graphics from the existing UI, and the business name need not be repeated as two consecutive large headings.

## 5. Make task discovery look inviting and useful

**Frames: OverviewFull and phone Overview.**

The four task groups preserve the right content, but currently read like a compact sitemap. They need a more recognizable visual presence and a route to them that remains available when the attention queue is long.

Use four compact task panels with visible action labels and one purposeful small illustration per group:

- **Supply:** importer → warehouse → shop, using the existing goods-flow vocabulary.
- **Staffing:** a small coverage grid with an uncovered interval.
- **Businesses:** a small profit comparison with satisfaction indicators.
- **Expansion:** a location pin and simple floor-plan outline.

Keep all relevant task names visible; the graphics must not replace labels, and the panels must not become four oversized marketing cards. Show counts only when they help choose an action. Avoid a second sentence under every action by default.

Keep this area after Needs attention. Retain a clearly named “Explore tools” or “All tools” jump near the attention heading, with a stable target. Do not rely on Search, a hover menu, or a link only at the end of a long queue.

## 6. Simplify the supply screens around the setting being changed

**Frames: Changes, Imports, Production, PhoneImports.**

**Changes:** keep the checklist truck and grouped tasks. A row should lead with the product/site, then current → proposed amount and unit, then its state. Avoid repeating the entire recommendation in a sentence, a numerical comparison, and the large copy preview on the right. Open the preview on demand; keep Copy remaining easy to find. Explain why checklist and finding counts differ only when requested, not as a permanent paragraph above the work.

**Imports:** make the recurring change the visual center: **8,400 → 18,740 units/week**, labeled with its selected planning basis. Retain the stock-cover rail and make the delivery/shortfall relationship easier to see. Show the separate **one-time catch-up: ~3,050 units** as a secondary, clearly manual action. Keep price/cap/deadline details beside the decisions they constrain. Put the arithmetic under “Why this amount?” and manual game instructions under an explicit “Set it in the game” control.

**Production:** keep the current-versus-planned hours grids. Place the selected basis beside the main comparison, then output, inputs, workers, and wages in that reading order. Replace the explanatory banner with a short basis description and optional details. Factory hours remain a manual game action.

The Imports status rail also needs a conceptual correction: manual marking and game-link application are alternative ways to act, not mandatory consecutive steps. Show the current state and its relevant next step, with history available. Preserve the distinction between “Marked by you,” “Applied · awaiting refresh,” and “Confirmed from refreshed data.”

## 7. Reconsider the navigation treatment before polishing every screen

**Frames: Main, OverviewMasthead, NavCompare, Schedules, Finder.**

The sidebar makes local views explicit, which is useful. However, it also repeats the company name in the wordmark and picker, adds another Overview/Needs attention/What it can do hierarchy, and combines with right-side panels to make the product feel like an administrative console.

My preferred next direction is to refine **OverviewMasthead**, because it is closer to the current product's broad, open layout. Keep the five main destinations and add a persistent, labeled local row inside Supply and the other areas. Imports, Deliveries, Production, and Goods flow must stay directly visible within Supply.

Compare that with a slimmer sidebar version after removing the right rail. Use the same content and type scale in both so the comparison is fair. Choose based on available working space and how easily a player can find Imports, factory hours, and prices without Search. Sidebar versus masthead is a design judgment to validate, not a reason to change the information architecture.

Schedules and Finder especially need space: each already has a local selector/filter column. Avoid turning them into three narrow control columns surrounding a small workspace.

## 8. Put playfulness into the work, not only the header

**Frames: Overview, Changes, Imports, GoodsFlow, Motion.**

Keep the sphere, dot, coins, truck, and game-link wire. The motion sheet shows that these were considered; the issue is that their presence does not change the dense reading experience elsewhere.

Use modest, purposeful responses: a stock rail can reveal the next delivery when focused; selecting a supply item can illuminate its route; the checklist truck can advance when a checklist entry is recorded; the game-link wire can show a request and its response. Use the existing tactile behavior for buttons, selected rows, and tiny charts.

Do not make important information depend on animation or hover. Keep complete static, keyboard, and touch equivalents. A checked item is still only a recorded action until refreshed data verifies it; motion must not imply otherwise. Avoid a new mascot, confetti, or decorative mini charts with no meaning.

The target is an interface that already feels attractive and readable in a still screenshot, then rewards interaction.

## 9. Give mobile its own density pass

**Frames: PhoneOverview, PhoneImports, PhoneWrite.**

The phone Overview spends a substantial part of its opening on company/source context and metrics, then stacks large green buttons for every critical finding. This recreates the long-reading problem vertically.

Keep context compact. Use short finding summaries with clear, labeled actions; expand evidence for the selected item. Give only the selected action the strongest filled treatment while other actions remain obvious and touch-sized. All critical summaries remain available, with an explicit tool-directory jump near the heading.

In PhoneImports, the local tab row cuts off “Goods flow.” Make overflow discoverable with a visible continuation cue and horizontal movement, or use a clearly labeled view selector that exposes every view. Keep the current Supply view and return-to-attention path clear.

Test the five primary destinations plus Map & more at a real phone viewport, including long translations and text enlargement. The authored fixed-width frames alone do not establish responsive behavior.

## 10. Correct capability promises before the next handoff

The Production mockup places named people on machine time bars and says the plan is arranged around workers' demands. The current feature map explicitly excludes a new per-person factory scheduler. Replace those named assignments with supported staffing requirements and scheduling blocks, or mark that proposal as separate new scope outside the product artboard.

Use the project's UI vocabulary: **staffing, scheduling, hours, people**. The mockup currently includes “Post factory workers” and “Longest shift.” Revise these to concrete actions and hour-based labels.

Keep the game-link boundaries explicit at the point of action: imports, supported shop staffing, and uniforms can be written; do not suggest that all fixes can be applied automatically.

## Requested next delivery

Refine five representative screens before revising all 60 artboards:

1. Overview in dark and light, with four critical summaries and visible access to task discovery; include one expanded finding and a long-queue state.
2. Imports, with an unmistakable recurring amount, separate catch-up, current/planned basis, and one clear next action.
3. Changes, with the truck, concise comparisons, and distinct recording/application/verification states.
4. BusinessDetail, extending its stronger visual treatment and restoring meaningful miniature data graphics.
5. Phone Overview and the phone import flow, with concise summaries and discoverable local navigation.

Include a before/after crop for each and a short annotation stating what was removed, what became visual, and where deferred detail now lives. Keep those annotations outside the product UI.

As a working target, cut roughly one third of the always-visible explanatory prose on Overview and Imports through removing repetition and moving calculation detail to explicit disclosures. This is not a quota for deleting essential evidence or an instruction to reduce font size.

Review the result with these concrete tasks: identify the most urgent issue and its next action; find import amounts, factory hours, and shop prices without Search; distinguish a manual note from a verified fix. A quick user check is still needed before treating improved discoverability as proven.

## Review coverage and limits

Visually inspected local HTML previews of Main, OverviewFull, OverviewLight, OverviewMasthead, Imports, Production, Changes, Results, BusinessDetail, GoodsFlow, Schedules, Finder, WritePreview, PhoneOverview, PhoneImports, and Motion. Compared the current Today, Supply, and site page rendered from synthetic fixture data. Read relevant generator source and the designer's notes.

This review focuses on visual composition, copy, feature promises, and navigation presentation. It is not an exhaustive check of all 60 frames, all prototype links, animation quality, contrast compliance, or actual phone-browser behavior. Differences in company data mean screen density comparisons are qualitative rather than controlled word-count measurements.
