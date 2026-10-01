# UI/UX audit and feature decisions

Date: 26 September 2026. Status: proposal, not an approved removal list.

**Latest direction:** Peter confirmed Needs attention as the leading product differentiator and requested preservation of the current design language and playfulness. The [structure and migration proposal](ui-structure-proposal.md) supersedes the earlier layout experiment below and maps all 105 capabilities and 31 finding kinds. The [designer prompt](ui-designer-prompt.md) is the current handoff. No feature removal is approved.

## Recommendation

Start with supply discoverability and consolidate overlapping presentations before retiring calculations. The owner's feedback is that both new and experienced users request capabilities that already exist, particularly around supply. That establishes a discovery problem; it does not establish that the underlying capabilities are unwanted.

The interface makes the player translate a task into a place: imports into Warehouses, factory hours into Factories, a prospective factory into Growth, and recipes into Wiki. It then asks them to understand filters, presentation modes and sizing assumptions. All of those distinctions can be valid, but the interface needs to teach them where the task starts.

Update after the owner's follow-up: most users do not use search. Treat this as a reason to test a different overall structure, rather than retaining the six-page navigation as a constraint. Make the overview a stable, visible directory of player tasks. Search remains an optional accelerator. Adding an Archive, a Tools page and another navigation hierarchy at once would make the diagnosis harder.

## Follow-up proposal: discovery from the overview

This supersedes the earlier recommendation to preserve all six top-level destinations for the first experiment. It is a structural hypothesis to test, not an implemented redesign.

The main dashboard should answer three questions in a small amount of space: how is the company doing, what can I do here, and what needs my attention? Today currently emphasizes the first and third. Task entry points should remain visible even when there are no findings, and should not disappear after one use.

### Navigation and responsibility

| Proposed destination | Primary responsibility | Existing capabilities brought together |
| --- | --- | --- |
| Overview | Orient the user; expose tasks and urgent work | Today's summary, a bounded attention list, persistent task areas replacing Next moves/Ask the board as separate competing systems |
| Businesses | Compare performance and inspect an individual business | Company results, portfolio, product sales, prices, satisfaction and site pages |
| Supply | Keep existing operations supplied | Imports, delivery targets, factory running hours, inputs and goods flow |
| Staffing | Plan people and working hours | Shop schedules, hiring needs, staff demands and payroll; a cross-link to the same factory staffing plan used by Supply |
| Expansion | Plan a business that does not yet exist | Market demand, location finder and new-factory planning |
| City map (reference) | Spatial inspection | City layers, buildings and location overlays; cross-links to the same location finder |
| Game guide (reference) | Learn the game and inspect reference data | Wiki, recipes, fixtures and suppliers; contextual links from operational tools |

The proposal promotes Staffing and gives live prices a business-facing entry. Finance stays explicit under Businesses, with company profit and costs visible; the name must be tested against users looking for financial reports. Payroll is reachable under Staffing as well as from cost detail. Map and Wiki remain available as reference destinations, rather than being removed. Milestones, preferences, support and future retirement records stay in appropriate secondary homes.

Use a persistent side navigation on desktop to make room for these labels. On narrow screens, preserve visible operational destinations in a wrapping navigation or another tested accessible layout; do not solve space by hiding every route behind a menu.

### What the overview exposes

Show four stable task groups, with their actual actions visible:

- **Supply:** calculate import amounts; set delivery targets; plan factory running hours; trace goods through the company.
- **Staffing:** build shop schedules; see whom to hire; resolve staff demands.
- **Businesses:** compare business profits; check prices and product sales; improve customer satisfaction.
- **Expansion:** find a suitable location; plan a new factory; explore market demand.

These are links to existing jobs, not 13 new applications or independent calculations. A task with two sensible starting points uses one underlying workflow. Factory staffing remains available from Supply and Staffing; location finding from Expansion and Map; recipe help from Supply and the Game guide.

Needs attention is the first major content block, after restrained company/source context. Permanent task groups follow. Critical findings must not be arbitrarily hidden to fit a tidy overview. A visible jump and persistent area navigation keep tasks reachable when the list expands. Counts may change but task-group order and labels should stay stable. This replaces the previous suggestion to place findings beside or beneath the task directory.

For a shop-only company, keep future factory tasks discoverable and explain their prerequisites when opened. Do not imply current factory results exist. Test whether a short “For factories” qualifier is enough; avoid silently removing entire feature families. Preserve the same task routes for returning users with more complex saves.

### Scope and tradeoffs

This is larger than renaming Today or adding cards above unchanged navigation. New area homes must collect the relevant existing entry points and retain old site/section links. If a homepage link opens a different area, its destination should explain the relationship. Each destination must offer a recognizable onward task and a return path.

The cost is more visible links and potentially more repeated entry points. Limit the overview to these task groups, concise labels and a bounded attention summary. Retire the overlapping Next moves and auto-collapsing Ask the board presentation when this replaces them; do not stack all three systems. Search can remain available without being the expected route.

The clickable conversation sketch demonstrates grouping and navigation only. Its numbers are illustrative, and its destination summaries are not production screens or working calculators. Some grouped landing experiences, especially Staffing, require implementation beyond routing a link.

### Validation

Start participants on the overview and ask for supply amounts, partial-day factory planning, a staffing plan and a suitable premises without suggesting search or a destination name. Observe their first click and whether they recognize that the capability exists. Let them naturally use any available controls, but separately assess whether visible navigation works without search. Test both a shop-only and a factory company, and returning users as well as newcomers.

A separate test must validate the task after arrival: a successful first click does not prove that the calculation or plan is understandable. Compare overview discoverability and destination usability separately before judging features for retirement.

## Evidence and limits

- The starting checkout is on `main` at `42852f3` (PR #117), behind the locally available `origin/main` at `09c5c32` (PR #155). Source findings were checked against the latter in this audit's separate worktree. No fetch, commit, push or deployment was performed.
- Inspected the live landing screen at bigcopilot.com. Its exact deployed commit was not established. Opening the wiki did not complete during this inspection; this is an observation of the session, not a diagnosed product defect.
- Rendered the newer source locally using `tests/fixtures/payload_snapshot/data_day47_history.json`. `tests/test_payload_snapshot.py` identifies this as a synthetic company. Inspected Today, Supply's initial factory view, the desktop diagram and search in the browser. No private save was loaded.
- The inventory additionally uses navigation registries, drawing functions, the browser shell, map/wiki source, and the architecture and dashboard reference documents. This is a source-backed feature audit with a focused runtime walkthrough, not a completed usability study or an accessibility certification.
- No feature-level usage, completion rates, maintenance-cost measurements or verbatim support-request sample was available. Every usefulness decision below is provisional. “Specialist” and “occasional” describe the task, not measured popularity.
- The newer source already has the responsive goods-flow chain view. Do not propose that feature as missing. It also contains English/German UI translation infrastructure, while the public ballot still lists multilingual support; availability and scope need reconciling before announcing anything.

Source anchors are more durable than line numbers. The principal anchors are `PAGES`, `SUBS`, `SS_VIEWS`, `SS_QUESTIONS`, `ALERT_GROUPS`, `drawSupplyStrip`, `sbPaintTools`, `supplyFact`, `drawFactoryStaffing` and `drawPlan` in [ba_dashboard.py](../../ba_dashboard.py); finder methods in [web/map.js](../../web/map.js); guide and pricing functions in [web/wiki.js](../../web/wiki.js); and source handling in [web/app.js](../../web/app.js).

## Findings, in priority order

### 1. Supply tasks do not have stable, explicit entry points

**Observed:** The synthetic board opened Supply on Factories, which had the most outstanding changes. Its three tabs were Shops, Warehouses and Factories. The main checklist covered four changes across all three tabs. Today called the entry point “Plan imports.” Source confirms both the automatic tab selection and the wider scope of the checklist.

**Risk:** A player looking for delivery amounts may not interpret “imports” as their task. A returning user may reach a different tab with a different save and mistake that for a feature moving or disappearing. A count of all changes above one object's table also needs explicit scope.

**Proposal:** Rename the Today action to “Review supply changes,” with “Imports, deliveries and factory hours” beneath it. Keep object tabs, but add persistent task links within Supply: “Import amounts,” “Delivery targets,” “Factory hours,” and “Trace goods.” These open the existing relevant views; they should not create four more tools. For a cross-company task, show a scope chooser or a visible current scope rather than silently selecting a different business.

Evidence: `paintPlanImports`, `drawSupplyStrip`, `sbUpdateStrip`, `ssChecklist`, `SUBS.supply`.

### 2. Discovery controls are themselves hard to discover

**Observed:** At the inspected desktop width, Search was a magnifying-glass button. The list/diagram control showed two icons. Search for **supply chain** returned one result: **Goods flow**. Search for **factory not running 24/7** returned zero results, despite the factory-sizing capability. **delivery** found a finding kind, two wiki entries and Daily top-ups.

**Risk:** Users have to know a tool's wording before they can find it. The zero-result message, “Nothing on the board or in the wiki is called…,” answers a naming question rather than helping solve the task. “Supply chain” is broader than a diagram.

**Proposal:** Label the switch “Table / Goods flow.” Give Search visible “Find a tool or answer” wording where space permits. Extend the existing index with task phrases collected from actual feedback, including routes to sizing and factory hours. For broad terms, show a small set of relevant actions instead of equating the term with one representation. No AI assistant is needed to do this.

Evidence: `sbPaintTools`, `SS_VIEWS`, `ssRender`, browser searches above. Search already supports synonyms, finding kinds, products, sites, wiki pages and keyboard shortcuts; retain that investment.

### 3. Planning assumptions are easy to confuse with current operations

**Verified in source and partially in the browser:** Supply defaults to 24/7 sizing. Demand sizing uses downstream shop use and the chain margin. The choice is stored per device, across characters. The factory view does explain the selected assumption in a sentence. Separately, Growth's Plan a chain models rated 24-hour production. A factory's own detail presents current staffed output and rated output.

**Risk:** “My factory runs part of the day” can mean “inspect its actual production,” “calculate hours for my shops,” or “plan a new factory.” These need different answers. Demand sizing is not simply another name for the current schedule. A recommendation to hire more people under 24/7 assumptions can look wrong for the player's intended operation.

**Proposal:** Keep the explanatory sentence and make the model a persistent part of every affected recommendation and copied checklist: “Plan for: full production / shop demand.” Show current hours alongside recommended hours. Test per-company persistence. Do not silently change the calculation default as part of a label fix.

Evidence: `SIZING_KEY`, `sizing`, `SZ_SWITCH_TIP`, `drawFactoriesTab`, `drawFactoryStaffing`, `drawPlan`, factory site detail.

### 4. A filtered exception list can look like the complete feature

**Verified:** Supply starts with Needs a change; Everything is alongside it. Healthy rows can be omitted or represented by a quiet summary. Rows and groups also collapse. Direct finding links already expand and reveal their target, which is good behavior to retain.

**Risk:** Someone exploring what the board can do sees only what currently needs action. No row, no applicable data and no supported feature can look alike. Diagram mode also replaces the table, while the surrounding checklist remains.

**Proposal:** Preserve the useful default, but expose scope: “Showing items needing attention · View all supply items,” with accurate counts when available. Empty states should distinguish “No changes recommended,” “No factories in this save,” “Waiting for trading history,” and “Cannot evaluate this line.” Keep the main actions reachable in each state.

Evidence: `sbWhich`, `sbWorth`, `sbFlat`, `sbObject`, `sbAfterDraw`, `sbPlaceFlow`.

### 5. Task guidance disappears before it has taught the whole product

**Verified:** Today has three Next moves cards and seven Ask the board questions. After a question is used, the question row folds into an Ask the board button. The questions remain in Search's empty state.

**Observed:** In the synthetic company, Today listed 17 findings above Next moves. This demonstrates the possible ordering pressure; it is not an estimate of a typical player's alert count.

**Updated proposal:** Keep Needs attention first and a stable task directory immediately after it, with persistent navigation and a visible jump for long lists. Do not treat one use as mastery. Keep task names, order and general homes stable while counts reflect the current company. Group related amenity findings without losing the individual fixes.

Evidence: `SS_ASK_KEY`, `ssAskPaint`, `ssAskMount`, `secMoves`, `drawAlerts`.

### 6. Several places answer parts of the same question

Examples: existing factory inputs on Supply and the factory page; proposed inputs in Plan a chain; recipes in Wiki; company payroll versus site staffing; company product totals versus live prices in a wiki guide.

**Proposal:** Give each task one primary home. Other contexts should offer a useful summary and a named link to that home. Keep context-specific evidence where it helps explain a recommendation; remove duplicated controls before removing the underlying capability. Make “inspect existing operation,” “plan a change,” and “read game rules” explicit.

Evidence: `SP_BLOCKS`, `SS_VIEWS`, `drawPlan`, `drawProducts`, `drawPayroll`, `wikiGuideRecipes`, `wikiPrices`.

### 7. Manual notes and changes applied to the game need distinct status

**Verified:** The checklist says “typed in”; ticks are local notes. Its help explains that. The link mod supports applying selected imports, shop staffing and uniforms, with preview and undo. It does not turn every recommendation into an automatic write. Copy remaining is still useful for file users and unsupported actions.

**Proposal:** Make execution states visible on the row: “Suggested,” “Marked done by you,” “Applied through game link,” and “Confirmed by refreshed game data,” only when the corresponding evidence exists. State which actions can be applied. Keep preview and undo adjacent to the action; do not count them as optional clutter.

Evidence: `drawSupplyStrip`, `sbTick`, `gwImportPlan`, `gwImports`, `gwRosterButtons`, `gwUniformButtons`, [game-link-api.md](../game-link-api.md).

## Decision method

Review a feature against six questions:

1. What player decision or task does it support?
2. Who needs it, at what stage of the game, and how consequential is failure?
3. Can the player find it using their own words and expected starting point?
4. Does it give an actionable answer with understandable assumptions?
5. Does another feature already perform the same job adequately?
6. What maintenance, testing and interface complexity does it add?

Use observed task outcomes, support examples and maintenance history to answer these. Do not invent a numerical value score from impressions. Usage must be interpreted against eligibility: players without factories cannot demonstrate demand for factory tools. Rare recovery actions can still be essential.

Decisions used below:

- **Keep:** clear job; retain and verify usability.
- **Promote:** useful job with a weak route; improve discovery before judging demand.
- **Merge:** preserve the job through an existing surface; reduce competing presentations.
- **Secondary:** supported and searchable, with less default prominence.
- **Candidate:** investigate retirement; do not remove without evidence and a transition.

## Feature decision register

This inventory covers user-facing capabilities and distinct decisions, rather than every table column, button or implementation helper. Filters with the same job are grouped; the finding-kind checklist below enumerates every current finding kind separately. All decisions are proposals. Source-backed existence does not prove player value.

### Entry, navigation and discovery

| ID | Capability and current home | Proposed decision | Usefulness question / concrete change |
| --- | --- | --- | --- |
| E01 | Choose/drop save folder, landing | Keep | Core recurring entry; explain newest-save selection and updating. |
| E02 | Choose/drop one save, landing | Keep | Essential fallback and deliberate historical inspection; keep secondary to the main entry. |
| E03 | Link to running game, landing/source controls | Keep | Reduces repeated loading; say what the mod enables before installation. |
| E04 | Character/save picker | Keep | Does a user always know which company's data and which day they are viewing? |
| E05 | Resume remembered source and permission recovery | Keep | Recovery has value even if infrequent; identify the next successful action. |
| E06 | Follow changes, manual Update and fresh/stale status | Keep | Distinguish connection status from the age of the displayed save. |
| E07 | Platform-specific save path and Copy | Keep | Helps new users complete setup; collapse it after setup succeeds. |
| E08 | Wiki without a save | Keep | Independent useful entry; show the kinds of answers it offers. |
| E09 | Optional game text / game-name language | Secondary | Explain that item names and whole-interface translation have different scopes. |
| E10 | History retention and Forget history | Secondary | Keep deliberate data control and explain loss of trend history. |
| E11 | Six top-level pages and remembered subviews | Merge | Map into the proposed five main destinations plus reference utilities; preserve explicit routes and make saved state apparent. |
| E12 | Site URLs, breadcrumbs, Back/Forward, site picker | Keep | Core orientation and shareable support answers; preserve routes through changes. |
| E13 | Global search, synonyms, grouped results, recents | Secondary | Retain as an accelerator; task discovery must succeed from visible navigation. |
| E14 | Search keyboard shortcuts and map shortcuts | Secondary | Expert accelerators, with equivalent visible controls. |
| E15 | Ask the board's seven question links | Promote | Retain a stable task directory; one use should not hide all examples. |
| E16 | Next moves cards | Merge | Keep useful task launchers; align with the same task directory and labels. |
| E17 | New badges and news strip | Secondary | Can users find a capability after its badge expires? Never make the announcement its only route. |
| E18 | Difficulty settings comparison | Secondary | Useful context for interpreting numbers; keep searchable and near settings/build information. |

### Today and company

| ID | Capability and current home | Proposed decision | Usefulness question / concrete change |
| --- | --- | --- | --- |
| C01 | Profit, revenue, cash and net-worth/fixed-cost tiles, Today | Keep | Each should answer a different question, with period and freshness visible. |
| C02 | Cash versus earned profit, debt note and history | Keep | Explain where money went; label unavailable history clearly. |
| C03 | Needs attention, severity and materiality | Keep | Does each line lead to an actual fix? Avoid many symptoms of one cause dominating the page. |
| C04 | Finding-kind switches, below-threshold and disabled groups | Secondary | Preserve control and visibility of omitted findings; group the settings by task. |
| C05 | Daily/rolling result chart and series controls | Keep | Helps distinguish trading changes from payment timing; lead with the useful default. |
| C06 | By weekday company chart and site comparison | Secondary | Useful for interpreting the week; assess whether both presentations lead to decisions. |
| C07 | Portfolio by chain, site profit/cost/margin and trends | Keep | Primary “which business needs work?” comparison. |
| C08 | Portfolio Operations, satisfaction and promotion | Promote | Discoverable from business performance; “Operations” needs a short description. |
| C09 | Company costs outside sites | Keep | Necessary reconciliation; expand detail on demand. |
| C10 | Company Products, top/all and aggregate sales | Secondary | Keep if users use it for assortment or supply decisions; improve links to affected businesses. |
| C11 | Product-level weekday peaks | Merge | Put the evidence near stock-sizing decisions; test whether a dedicated column earns its space. |
| C12 | Payroll by role, costs and satisfaction | Merge | Place beside staff problems and staffing entry points; do not imply it is a company-wide staff planner. |
| C13 | Milestones: business types, rivals, goals and diplomas | Candidate | Distinct completionist job, weak operational relevance; first move to a supported secondary home and test demand. |
| C14 | Lifetime goods/taxes/buildings totals | Candidate | Keep any figure needed elsewhere; ask whether displaying the totals changes a decision. |

### Supply — highest-priority review

| ID | Capability and current home | Proposed decision | Usefulness question / concrete change |
| --- | --- | --- | --- |
| S01 | Shops / Warehouses / Factories tabs | Merge | Retain as scope filters/object groups within the proposed task-focused Supply views. |
| S02 | Needs a change / Everything | Keep | Explicitly disclose filtering and what the empty state means. |
| S03 | Cross-tab change checklist and counts | Promote | State company-wide scope; offer a clear path to all remaining changes. |
| S04 | Per-row ticks, clear ticks, character persistence | Keep | Valuable for manual work; visibly distinguish notes from game confirmation. |
| S05 | Copy remaining and copy fallback | Keep | Portable execution aid for file users; include units, model and destination. |
| S06 | Editable import Set to amount and reset | Keep | Allow intentional overrides with the recommendation and reason visible. |
| S07 | Weekly import quantities and supplier contracts | Promote | Give “Import amounts” a named entry; make the game setting to change unambiguous. |
| S08 | Smart Delivery stock targets and delivery ordering | Keep | Different semantics from fixed weekly quantities; show that difference at the input. |
| S09 | Warehouse stock cover, next arrival, run-out and catch-up | Keep | Core timing decision; distinguish an urgent one-off purchase from a standing order. |
| S10 | Shop daily top-ups and peak-day pressure | Promote | “Delivery targets” should lead here without requiring the term top-up. |
| S11 | Repeating wholesale deliveries | Keep | Essential alternative for companies without depots; don't imply warehouse ownership is required. |
| S12 | Depot-to-depot and route-fed warehouse supply | Keep | Specialist but central for larger companies; judge against eligible companies. |
| S13 | Factory inputs, shared materials and no-depot inputs | Keep | Make the upstream fix and its destination visible beside the shortage. |
| S14 | Actual factory hours/output versus rated output | Keep | Separately label current behavior and planning assumptions. |
| S15 | Demand sizing versus 24/7 | Promote | Direct route for “run factories only as much as my shops need”; preserve explicit model choice. |
| S16 | Staffing for factory lines, hires and wage effect | Promote | Give it an anchor and a task link; avoid relying on “below” at the bottom of long tables. |
| S17 | Unknown recipe identification | Secondary | Necessary recovery; reveal only for affected lines, with the consequence of not resolving them. |
| S18 | Idle stock and high top-up recommendations | Keep | Separate stock with no use from excess stock that still has demand. |
| S19 | Not-routed, paused and stalled diagnostics | Keep | Preserve distinct causes because the fixes differ; explain each in ordinary task language. |
| S20 | List/diagram presentation switch | Promote | Use visible “Table / Goods flow” labels. |
| S21 | Desktop goods-flow graph | Keep | Diagnose relationships; test whether the user can follow the problematic product, not just visit a site. |
| S22 | Responsive vertical flow and focused-site view | Keep | Already implemented in newer source; test phone/tablet tasks before further redesign. |
| S23 | Grouping idle rows, collapsing sites and sorting | Keep | Reduces repeated reading; show hidden counts and expand correct groups on arrival. |
| S24 | Shared supply status words and explanations | Keep | Preserve consistent verdicts; show the action before specialized terminology. |
| S25 | Apply imports through game link | Promote | Put applicability beside the manual workflow; don't suggest all delivery changes are writable. |
| S26 | Import preview, caps, refused/uncovered amounts and undo | Keep | Necessary to understand and correct execution; do not hide merely to simplify the screen. |

### Business detail and staffing

| ID | Capability and current home | Proposed decision | Usefulness question / concrete change |
| --- | --- | --- | --- |
| B01 | Site summary, trading readiness and local findings | Keep | Primary home for diagnosing one business; retain a route back to the original task. |
| B02 | Profit chart, costs and weekly rhythm | Keep | Start with the explanation of the change, then detailed evidence. |
| B03 | Satisfaction, amenities and uniforms | Keep | Group related setup fixes while retaining individual requirements. |
| B04 | Promotion, marketing and demand-wave exposure | Keep | Separate an actionable gap from a temporary market condition. |
| B05 | Customers by hour and limiting station/staffing | Keep | Clear value for diagnosing lost service; building capacity itself is normal, not a reason to expand. |
| B06 | Overstaffed-hours evidence | Keep | Show uncertainty and evidence; distinct from a promise that all shown wages can be saved. |
| B07 | Shop staffing plans, day copying, existing/proposed comparison | Promote | A permanent staffing route should supplement the Today card's choice of one shop. |
| B08 | Cover/Demand plan and Full cover 24/7 measurement test | Keep | Explain purpose and data readiness before the user changes opening hours or staffing. |
| B09 | Assign/hire recommendations and unmet schedule demands | Keep | Count people and name stations; prioritize unresolved prerequisites. |
| B10 | Staffing checklist and ticks | Merge | Share completion language with Supply, while keeping distinct local plans. |
| B11 | Write shop staffing, preview and undo | Keep | Useful execution path with explicit scope and refreshed confirmation. |
| B12 | Crew, role grouping, employee demands and quit warnings | Keep | Consequential even when infrequent; keep visible from both staffing and Payroll. |
| B13 | Set missing uniforms via game link | Keep | Clear bounded task; expose from the corresponding finding. |
| B14 | Shop shelves, prices, stock and office fees | Keep | Local evidence; link to the canonical supply/pricing action. |
| B15 | Depot stock rail and sites fed | Merge | Retain the site summary; reuse Supply detail/actions rather than maintaining two competing workflows. |
| B16 | Factory machines, inputs and recipe selection | Merge | Retain the site's current-state summary; route planning changes to Supply. |
| B17 | Home detail: rent, area and rent per area | Candidate | Is a separate page better than its existing map card? Consolidate first; preserve rent in company costs. |

### Growth, map and knowledge

| ID | Capability and current home | Proposed decision | Usefulness question / concrete change |
| --- | --- | --- | --- |
| G01 | Market demand by business type and neighbourhood | Keep | Distinct expansion decision; explain that demand is not guaranteed profit. |
| G02 | What I sell / Not yet product demand | Keep | Assortment and expansion differ; label the intended task of each view. |
| G03 | Movers: demand changes, waves and supplier shortages | Secondary | Preserve consequential shortages; group related movements and link to affected operations. |
| G04 | Demand cell to location finder | Promote | Strong contextual route; make the action apparent before a click. |
| G05 | Plan a chain, machine counts and export surplus | Secondary | Keep as “Plan a new factory”; retirement requires evidence that Supply can answer this prospective job. |
| G06 | Planned ingredients, company target and observed costs | Merge | One plan with inputs and explicit assumptions; link to existing imports without implying automatic application. |
| M01 | City map, address search, layers and navigation | Keep | Primary spatial reference; don't make it the only home for an analytical tool. |
| M02 | Building cards and map overlays from other pages | Keep | Useful context with low interruption; preserve return focus and current work. |
| M03 | Find a location ranking | Promote | Keep its Today entry and expose it alongside expansion planning. |
| M04 | Rent/takeover/sale modes and eligibility | Keep | Distinct decisions; label why a building is or is not available. |
| M05 | Type, district, area, building-capacity and traffic filters | Keep | Lead with common filters; secondary filters remain accessible and searchable. |
| M06 | Floor plans and layout filter | Keep | Prevents costly unsuitable choices; visually connect layout names and plans. |
| M07 | Saved finder searches | Secondary | Repeat-user convenience; assess use after basic finding succeeds. |
| M08 | Rent/deposit estimates and building ownership | Keep | Material planning information; preserve estimate labels and purchase/rent distinction. |
| W01 | Wiki categories, pages and search | Keep | Distinct reference job; surface from relevant tasks. |
| W02 | Business guides and setup checklists | Keep | Helpful preparation; ticks must remain visibly personal notes. |
| W03 | Product fixtures, suppliers, recipes and recipe flows | Keep | Reference information needed by supply tasks; avoid building a duplicate recipe catalogue elsewhere. |
| W04 | Yours and Prices in your save | Promote | Live pricing belongs in a recognizable pricing route as well as the guide. |
| W05 | Static searchable wiki pages and direct links | Keep | Supports discovery outside the app and durable support answers. |

### Preferences, community and local tools

| ID | Capability and current home | Proposed decision | Usefulness question / concrete change |
| --- | --- | --- | --- |
| P01 | Theme/system preference and reduced-motion behavior | Keep | Preferences and access needs; keep out of the main task flow. |
| P02 | Interface language support in newer source | Keep | Verify exposed scope and deployment; do not conflate it with Game names or a completed multilingual roadmap. |
| P03 | Changelog, new-feature discovery and updates | Secondary | Useful orientation, especially after moves; link each change to its current home. |
| P04 | Community feature ballot | Keep | Consolidate proposed and retired requests in one system with explicit states. |
| P05 | Approximate online count | Candidate | Does social presence justify its space and service cost? Do not let it obscure source freshness. |
| P06 | Feedback/support links | Promote | Contextual “Can't find what you need?” should accept the user's task wording. |
| P07 | Donation, social, source, game and legal links | Secondary | Put task help first and group secondary links compactly; legal links remain reachable. |
| P08 | Interactive brand spheres and coin effects | Keep | Preserve deliberate brand playfulness, with space, reduced motion and no obstruction of important work. |
| L01 | CLI-generated local dashboard | Keep | Different access mode, not main navigation clutter; needs its own user-demand assessment before retirement. |
| L02 | CLI watch mode and game-link source | Keep | Supports ongoing local use; preserve parity where practical. |
| L03 | CLI history backfill | Secondary | Specialist history recovery; infrequency alone cannot establish low value. |

### All current finding kinds

All 31 entries in `ALERT_GROUPS` were included. The proposal is to consolidate presentation, not to erase distinct causes. Defaults are the newer source's defaults, not measured user preferences.

| Finding | Current default | Proposed treatment and usefulness test |
| --- | --- | --- |
| Not trading yet | On | Keep; combine the site's readiness failures into a clear setup task. |
| Vacant leases | On | Keep; actionable wasted rent when material. |
| Losing money | On | Keep; distinguish a normal payment day from persistent trouble. |
| Nobody staffed | On | Keep; lead directly to the correct business or machine. |
| Low satisfaction | On | Keep summary; avoid repeating every cause as equally prominent noise. |
| Promotion below cap | On | Keep; show the campaign action and relevant limits. |
| Uniforms / locker | On | Keep; locker first, uniforms second, apply when supported. |
| No customer bathroom | On | Merge under a site's amenities task; preserve the fix. |
| Bathroom has no privacy | On | Merge under amenities; preserve the distinct stall/door requirement. |
| No customer sink | On | Merge under amenities; preserve the requirement. |
| No music playing | On | Merge under amenities; preserve business-type applicability. |
| Interior design too low | On | Merge under amenities; preserve the score and target. |
| Staff demands | On | Keep; distinguish prerequisites, preferences and quit urgency. |
| Insurance / happy boss | On | Keep at company scope; don't send users to a site-only fix. |
| Demand wave ending | Off | Secondary forecast; retain opt-in and contextual evidence. |
| Revenue trend | On | Keep; separate positive information from changes requiring action. |
| No distribution plan | On | Keep; link to the exact product and destination. |
| Outsells its top-up | On | Keep; name the peak and the target to change. |
| Import paused | On | Keep; distinguish intentional pauses and alternate routes. |
| Factory inputs | On | Keep; show whether the fix is upstream import or local delivery. |
| Unnamed factory line | On | Keep as incomplete-data recovery, not a claim the factory is broken. |
| Machine with no recipe | On | Keep when staffed/rented capacity is wasted. |
| Import shortfall | On | Keep; distinguish imminent run-out from the future standing order. |
| Depot top-up too low | On | Keep; route-fed depots need a different fix from import-fed depots. |
| Wholesale delivery too low | On | Keep; essential early-game supply path. |
| Weekly order too small | On | Keep; link to the standing order and its week. |
| At capacity | On | Clarify wording to staff/workstation service limits; being at building capacity alone is not a problem. |
| Overstaffed hours | Off | Keep contextual, opt-in on Today; validate assumptions before encouraging cuts. |
| Idle stock | On | Keep; distinguish no downstream use from harmless working inventory. |
| Not routed | On | Keep; show the potential destination and missing connection. |
| Top-up target too high | On | Keep as an optimization; lower urgency than interrupted supply. |

## A concrete supply-first experiment

Use the existing Supply page as the primary home. This is a proposal to prototype, not a request to add all of these as extra permanent rows.

```text
SUPPLY
Review supply changes
Imports, deliveries and factory hours for this company

Import amounts · Delivery targets · Factory hours · Trace goods

Shops | Warehouses | Factories
Items needing attention | All items           Table | Goods flow

Plan for: Full production | Shop demand
[plain-language explanation of the selected assumption]

[remaining changes across the company]   Copy remaining
[Apply supported changes, when game link permits it]

For each change:
  What needs attention, where, and when
  Current setting → suggested setting, with units
  Why this amount; what assumption it uses
  Where to change it in the game
  Manual note / link application / refreshed confirmation
```

The plan selector appears only where it affects the content; do not make a shop-only company answer factory questions. Existing object tabs remain a secondary route for inspecting one place. “Trace goods” must open goods flow with visible site/product context. Recipe reference links and “Plan a new factory” connect to their existing homes.

The first implementation slice should be smaller than this sketch: labels, explicit filters/model scope, stable task links, and task search aliases. Test that before changing the page hierarchy or building a company-wide staffing surface.

## Archive and bring-back voting

The archive idea is useful as a reversible retirement process, but cannot substitute for finding out whether people can discover a tool.

### Separate three states

| State | What users can do | Maintenance commitment |
| --- | --- | --- |
| Supported specialist tool | Open and use it from its task/context and search | Still correct, tested and maintained; reduced prominence is not retirement. |
| Retiring | Use it during a stated transition; see replacement/reason; explain dependence | Continue support during the published transition. |
| Retired feature | See its description, former task, replacement and status; request a return | Historical record, not an indefinitely runnable old calculator. |

Use “Retired features” for the third state. “Archive” can imply the old feature still works. If it remains runnable, it still costs maintenance and must not silently use outdated game rules.

### Proposed user journey

1. An old URL or search for a retired tool opens a clear explanation, never a dead end.
2. The page says what job it performed, why it was retired, the retirement date, and the replacement if there is one. A small historical screenshot or example is enough to identify it.
3. Offer **Request its return** and an optional **What task can you no longer complete?** response. When the replacement is adequate, route the user directly to it. Do not call a renamed or moved tool retired.
4. Show **Under review**, **Planned**, **Restored**, or **Not planned**, with a short explanation. Do not promise an automatic restoration at a vote threshold.
5. When restored, link to its current home and carry the decision history forward. Restoring a useful task need not restore its former page design.

A link in the existing feature-voting dialog plus Search is sufficient to start. Adding a seventh top-level Archive destination would give retired functions more navigation weight than they deserve.

### Reuse the ballot carefully

The current implementation has a static feature registry in `server/features.json`, a voting dialog in `web/community.js`, and a Worker/D1 backend. Per the current implementation/docs, voting is limited by connection IP through feature-specific identifiers; it is not a count of distinct people. Removing an item from the registry causes its vote rows to be deleted by cleanup. Stable IDs matter.

Extend this model only after the first retirement is justified. Use an explicit lifecycle state and a separate restoration request identity; do not reuse a former new-feature vote total as evidence that users now want restoration. Display the vote's purpose and the period it covers. Keep listing and cleanup behavior consistent with the intended retention policy. Do not simply leave removed registry entries hidden and assume vote history will survive.

Optional written task feedback would be a new data flow. A smaller first version can reuse the existing support channel without building account management, comments, notifications or a public discussion board. Users must actively choose to send feedback; no save content is needed.

Restoration decisions should combine concrete blocked tasks, the availability of a replacement, eligible users' interest and maintenance cost. Raw vote totals alone favor visible tools and vocal groups; a rare tool can be essential to a small cohort. Equally, no votes can mean nobody found the archive.

### Initial candidates, in order of caution

1. **Brand sphere/coin interactions:** withdrawn as an immediate retirement candidate following Peter's explicit request to preserve playfulness; retain deliberate optional interactions and evaluate their placement.
2. **Online count:** candidate to remove from the working dashboard if it has no useful role; preserve clear source/freshness status.
3. **Separate home detail page:** likely consolidate into its map card, preserving rental information.
4. **Milestones and lifetime totals:** first reduce prominence; interview completionist players before retiring them.
5. **Duplicated depot/factory presentations:** merge the action workflow while keeping contextual summaries. This is consolidation, not a vote to remove supply.

**Do not currently nominate** demand sizing, imports, factory staffing, recipes, goods flow, recovery controls or Plan a chain for retirement solely because their audiences are narrower or they are poorly discovered. Plan a chain needs a clearer prospective-planning identity before its value can be judged.

## Validation and decisions still needed

### Gather feedback in task language

For the next missing-feature reports, record the user's exact request, experience level, relevant game setup, where they first looked, whether the existing feature solved their actual problem, and the final route. A support response that merely proves a page exists is not evidence that the request was satisfied.

Keep three distinct classifications: **cannot find**, **found but cannot understand/use**, and **capability genuinely missing**. Use these to update search and navigation, not just documentation.

### Test real tasks without teaching the route

Recruit a small initial mix of new and experienced users, including shop-only companies and factory/depot operators. Start with roughly 6–8 sessions as qualitative diagnosis, not a representative vote. Let participants use their own save locally if they choose; collecting a save is unnecessary. Include normal laptop, narrow/phone and keyboard operation.

| Task prompt | What success demonstrates |
| --- | --- |
| A shop will run out tomorrow. Find the setting to change and the amount. | Shortage → correct delivery/import action; understands urgent versus recurring fix. |
| Your factories should only supply what your shops use. Work out the required running hours. | Discovers Demand sizing and factory staffing, understands the model. |
| Goods exist in a warehouse, but a shop isn't receiving them. Investigate. | Finds route diagnosis/flow and distinguishes missing plan from insufficient quantity. |
| Find a healthy supply item and inspect its stock. | Understands the filter and can reach full inventory. |
| Set next week's import quantities, then tell us what has changed in the game. | Finds quantities and execution path; distinguishes notes from verified changes. |
| Estimate inputs for a factory you have not built. | Finds prospective planning rather than changing current supply assumptions. |
| Check prices and staffing at a named shop. | Finds site/context-specific tools rather than an arbitrary business. |
| Find a suitable premises and inspect its floor plan. | Connects demand, eligibility, building layout and cost. |
| Return to a tool after navigation changes. | Old route, search terms and relocation explanation still work. |
| Find a retired feature and explain what Request its return means. | Archive communicates availability and avoids a false release promise. |

Record unaided first click, wrong turns, whether help was needed, completion, and whether the user can explain the result. Time-to-find is diagnostic, not a forced time limit. Record incomplete tasks separately from completed ones so fast abandonment never looks like improvement.

### Compare the smallest prototype with the current UI

Use the same task definitions and comparable company states; avoid teaching everyone the old route immediately before testing the new one. Set acceptance criteria before the comparison. A reasonable initial product target is at least 80% unaided success on the three core supply tasks, with no material decline for experienced users. That is a proposed target, not an established industry benchmark or a statistically meaningful result from a handful of sessions.

No passive telemetry is necessary to start. If later considered, measure eligibility, feature exposure, task starts and confirmed completion separately, with an explicit privacy design. Existing presence/vote counts cannot answer usefulness questions.

### Suggested sequence

1. **Immediate:** collect concrete supply requests and prototype clearer task links, labels, search coverage and model/filter visibility.
2. **Next:** compare task success; consolidate repeated workflows and keep contextual summaries.
3. **Then:** assess the smaller set of retirement candidates with their affected users and actual maintenance cost.
4. **Only with a justified retirement:** add the modest retired-feature record and restoration ballot, preserve old routes, publish a transition and revisit based on blocked tasks.

Do not begin with deletion, a large new feature directory, or a second voting system. The decision register is ready for review, but removals and a production redesign still require product decisions and implementation work.
