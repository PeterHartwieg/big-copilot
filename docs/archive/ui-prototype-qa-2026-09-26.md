# Targeted prototype QA — 26 September 2026

## Recommendation

Keep the round-three visual direction and move to implementation once the behavior contracts below are included in the implementation scope. Do not wait until the entire redesign is implemented to test it. Validate one complete journey with each implementation slice, then perform integration, accessibility, responsive, and real-data checks.

The prototype does not need to become a second application. Its unwired controls are coverage gaps, not production regressions. Contradictory amounts across frames do need an explicit resolution before those frames are used as implementation specifications.

## Method and scope

- Design checkout: `C:/Users/Peter/Coding_Projects/big-copilot-ui-redesign`, branch `ui-redesign-canvas`, commit `fe78579`.
- Two requested `gpt-6-sol` subagents: `discovery_qa` and `imports_qa`, both completed their assigned click-throughs and closed their own browser tabs. No design or application source was modified.
- Used local interactive HTML previews. The local server resolved `.dc.html` requests to the corresponding standalone `.html` preview so artboard links worked. It did not change page content or interaction logic.
- This was not Claude canvas Play-mode testing, real-phone testing, production game-link testing, measured contrast testing, or a human usability study.
- The previews use fixed-width artboards. Their viewport overflow is not evidence about the future application's responsive implementation.

## Findings

### 1. Selected plan or edited amount does not carry into execution instructions

**Priority: high. Resolve the behavior contract before implementation; test it as part of the first supply slice.**

Steps: open Imports → select Shop demand → open Manual instructions → open Preview in the game.

Observed: the recommendation changes from 18,740 to 11,040 units/week. Manual instructions still say 18,740. The preview opens a separate Full production frame showing 18,740. Editing the input to 15,000 and opening the preview likewise returns to 18,740.

Required behavior: selected basis and proposed amount must agree across the input, calculation explanation, manual instructions, copied text, preview, applied-result state, and checklist. An edited amount must either be previewed or explicitly rejected with an explanation. Never silently substitute the other basis's recommendation.

Shop demand also assumes changing factory running hours: its 11,040/week recommendation is below current consumption of 12,180/week. Show that dependency and link to the required factory plan. Do not imply changing the import amount alone resolves current consumption.

### 2. Phone basis selection is visual only in the tested frame

**Priority: medium. Same implementation acceptance contract as finding 1.**

Steps: PhoneImports → Shop demand → Preview in the game.

Observed: the selection changes but the amount remains 18,740 and the text remains Full production. A separate PhoneImportsDemand frame shows 11,040; its Preview link still opens the 18,740 PhoneWrite frame.

Required behavior: phone and desktop use the same plan state and rules. Static alternate frames illustrate intended states but do not demonstrate an interactive transition between them.

### 3. All tools jump is suppressed

**Priority: medium for the core discovery journey; a prototype limitation.**

Steps: Overview → All tools beside Needs attention.

Observed: no jump, hash change, or scroll movement. Manually scrolling reveals the tool directory, and its tested destination links work. Source corroboration: `kit.py`'s shared interaction script prevents default for every link beginning with `#`, including `#tools`.

Required behavior: All tools reliably scrolls to the named directory and remains available with a long findings queue. Do not copy the prototype's blanket local-anchor suppression into the application.

### 4. Some selectors and actions are intentionally incomplete

**Classification: implementation coverage, not a reason for another broad design round.**

- Demand → Florist/Midtown works; the sampled Bakery/Midtown cell remains on Demand (`href="#"`). Relevant demand cells must pass their own business type and neighbourhood into Finder.
- Prices → Pepper & Pine works; the sampled Marlow Market chip remains on Pepper & Pine (`href="#"`). Each shop selector must select the corresponding shop.
- Copy both changes produces no observed feedback or copied text in the tested preview. Implement clipboard success/failure feedback and a usable fallback.
- The one-time catch-up's Mark done control has no observed effect. Its record must remain separate from the recurring order's state.
- Phone write Apply/Close and some phone manual controls are placeholders.
- Desktop Apply → permission → applying can be traversed, but applying is a static endpoint. Done must be opened separately. This does not test real request completion or failure handling.

## Passed or clearly represented

- Finding Details expands independently from its action and distinguishes the two import fixes.
- Tool-directory links lead to Imports, factory Production, and company/shop Prices without Search once the directory is reached.
- Import → Goods flow carries Bridge Hub/Water context; Needs attention returns to Overview. Arbitrary scroll-position preservation was not established.
- Factory alert → Production selects Canal Brewery; changing the basis updates planned hours, Water input, and staffing figures.
- Demand Florist/Midtown → Finder → 14 Park Ave detail → Finder retains the demonstrated location context; Back to Demand returns to Demand.
- Recurring order and one-time catch-up are clearly separate; only the recurring amount is presented as a game-link write.
- Manual, applied, and confirmed states are visually distinct. The Done frame says the write is applied but not yet proven by refreshed data.
- The authored return frame keeps Water first and marks it applied, awaiting refresh. This is a defined target state, not proof of general state persistence.

## Implementation acceptance checks

1. **Shell and discovery:** Overview → All tools → Imports / factory hours / shop prices without Search. Verify active navigation and scope at each destination.
2. **Supply calculation and execution:** choose Full production or Shop demand, edit an amount, inspect manual/copy/write outputs, and confirm all show the same basis and amount. Include factory-hours dependencies and one-time catch-up as separate actions.
3. **Return and state:** preserve the originating finding, filters, basis, and scroll position; distinguish manual notes from successful writes and later verification. Changed recommendations invalidate stale marks appropriately.
4. **Contextual selectors:** exercise more than the demonstrated shop and demand cell so hardcoded sample routing cannot pass.
5. **Real interface validation:** keyboard navigation and focus, measured contrast, real browser text enlargement, narrower layouts, long translations, and touch behavior.
6. **Data and game-link integration:** synthetic fixtures for automated checks; stale/missing data, permissions, refused writes, changed conditions, refresh and undo behavior. Do not claim a game write or resolution from a prototype transition.

Use a brief human usability check with new and experienced players to validate actual discoverability. Agent click-throughs can find broken or contradictory paths, but do not establish how a player understands the labels.
