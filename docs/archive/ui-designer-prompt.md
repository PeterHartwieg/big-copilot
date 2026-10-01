# Copy-ready designer prompt

Use the text below as the designer's task. Supply this file and `docs/archive/ui-structure-proposal.md`, plus repository access or the named visual references. The structure proposal maps all 105 existing capabilities and all 31 finding kinds. The earlier conversation sketch is a structure experiment, not a visual reference to reproduce.

---

You are designing the next UI/UX of **Big Copilot**, a companion dashboard for the game **Big Ambitions**. Create real, high-fidelity mockups and an interactive prototype in the product's current design language. This is a design task: do not implement the production redesign, remove capabilities, commit, push or deploy it.

## Product intent

Big Copilot's strongest differentiator is **Needs attention**: it inspects the player's company, highlights problems, explains them and helps the player fix them. It should feel like a capable copilot. Both newcomers and experienced players currently ask for features that already exist, especially around supply. Most users do not use Search.

The redesign must make the product's capabilities recognizable from the main dashboard while strengthening its problem-to-fix journey:

**Notice → understand → review a change → make the change → check the result.**

**Needs attention belongs at the top.** It is the first major content block and the visual center of gravity. A compact company/source header and small metric strip may precede it; a feature catalogue, oversized KPI wall or promotional panel must not displace it. Task discovery follows and remains easy to reach.

## Inspect the product before drawing

Read `docs/archive/ui-structure-proposal.md` in full. It is the authoritative proposed feature map, including shared ownership and what requires new implementation. Use `docs/archive/ui-ux-audit-2026-09.md` for supporting observations, not to override the later attention-first decision.

Inspect the currently running UI if available and these local references:

- `ba_dashboard.py`: `TEMPLATE`, root theme tokens, masthead, `drawAlerts`, `drawSupplyStrip`, site-page visuals and the `gw*` write-dialog code. This is the shipped visual authority.
- `web/map.css`, `web/wiki.css`, `web/community.css`, and `build_web.py` landing/source controls.
- `mockup/revamp/big-copilot-board.html` and `mockup/revamp/build_canvas.py`.
- `mockup/site-panel/build_site_canvas.py`.
- `mockup/write-dialogs/build_write_canvas.py` and `mockup/write-dialogs/NOTES.md`.
- `mockup/goods-flow-phone/build_goods_flow_canvas.py` and its `NOTES.md`.
- `mockup/find-location/build_finder_canvas.py`, `mockup/map-revamp/big-copilot-map.html`, and `mockup/wiki-revamp/big-copilot-wiki.html`.

Older canvases contain historical/draft behavior. Check capabilities against the current source, `docs/dashboard-reference.md` and `docs/game-link-api.md`. The audited baseline is locally available `origin/main` at `09c5c32`; the original main checkout was older. Identify the revision you inspect so a stale checkout does not become the design baseline. No need to modify either checkout.

Use synthetic data and fictional company names. Do not copy real-save datasets from existing design folders into mockups or external services. If you cannot access a visual reference, identify the missing reference rather than inventing what the current product looks like.

## Preserve its identity

Use **Archivo** for interface text and **IBM Plex Mono** for numbers, compact labels and supporting detail. Reuse both current palettes, thin rules, compact editorial sections, neighborhood badges, meaningful small diagrams, stock-cover rails, hours grids and direct visual evidence.

Current dark tokens include ground `#0d100f`, surface `#151917`, ink `#e9ece6`, accent `#43c07a`; light equivalents include ground `#eef0ea`, surface `#fdfdfb`, ink `#15181a`, accent `#00703a`. Read complete semantic tokens from source, including warnings/errors and contrasting text. These are starting values, not permission to use illegible secondary text.

Preserve the green wordmark dot/spheres, deliberate playful interactions, and purposeful motion. Draw on the existing checklist truck, flow relationships, subtle interactive responses and game-link signal wire. Reserve space for personality without obscuring the source, navigation or findings. Keep optional sphere/coin interactions as intentional brand details unless presenting a clearly labeled alternative. Do not erase them merely to make the product more corporate.

Avoid a generic admin template, a card around every number, oversized empty tiles, a new mascot/chatbot, ornamental charts and gamified celebration of unverified fixes. Show the reduced-motion equivalent of each important motion. Keyboard and touch must expose the same information as hover.

## Proposed structure

Design five main destinations:

1. **Overview** — Needs attention first, followed by persistent task groups.
2. **Businesses** — Results, Products & prices, Standards, Milestones; shared detail pages for shops, offices, warehouses and factories. Company finances are explicitly part of Results.
3. **Supply** — Changes, Imports, Deliveries, Production, Goods flow. Shops/warehouses/factories are scope filters and groups, not a competing primary tab hierarchy.
4. **Staffing** — Schedules, Staff needs, Payroll. It links to the same factory-hours/worker plan owned by Supply → Production.
5. **Expansion** — Demand, Find a location, Plan a factory.

Keep **City map** and **Game guide** as plainly named reference destinations. Preferences, What's new, Help & feedback and project links are secondary. Company/save selection, current source, freshness and Update remain in the shell.

Explore one recommended desktop navigation treatment and one credible alternative: a persistent sidebar versus an evolution of the current masthead are useful candidates. Both must preserve the structure and attention-first hierarchy. Choose a recommendation and explain the space/discovery tradeoff. Do not deliver only navigation alternatives; take the recommended direction through the real task screens.

Below Needs attention, visibly expose these stable task groups:

- **Supply:** Calculate import amounts; Set delivery targets; Plan factory running hours; Trace goods through the company.
- **Staffing:** Build shop schedules; See whom to hire; Resolve staff demands.
- **Businesses:** Compare business profits; Check prices and product sales; Improve customer satisfaction.
- **Expansion:** Find a suitable location; Plan a new factory; Explore market demand.

These replace the separate Next moves and disappearing Ask the board presentations. They open existing task views with context, not 13 standalone mini-apps. Keep labels and positions stable; changing issue counts should not rearrange the whole dashboard. Search is optional and must not be required to find any of these tasks.

## Needs attention and resolution

Design actionable findings with the affected business/product, consequence, trustworthy quantity or amount, deadline where available, and a named action such as Review import amount. Use actual available evidence. Group related fixes without losing distinct causes or required settings. Preserve severity, materiality, switched-off kinds and below-threshold findings, with a visible Customize checks entry.

Design a high-volume state as well as a neat small queue. Do not hide critical problems merely to fit three cards. The initial proposal shows all critical cause groups plus a short set of other actionable findings, with explicit counts and access to everything. Keep the list readable without a small nested scrollbar. A long expanded list may push tools down, so provide a visible jump and persistent area navigation.

A finding must land on its exact task, business, item and evidence—not on a generic category page. Keep “From Needs attention” context, a return path and the previous list position. Show current → proposed values with units, model and the exact game setting to change. Preserve state through refresh and avoid moving the row while the user is interacting with it.

Clearly distinguish:

- Suggested change.
- Marked done by the player, using local notes.
- Applied through the game link, if supported and accepted.
- Confirmed from refreshed data, when that conclusion is supported.

Manual users can copy changes and mark their progress. Current game-link writes cover **import amounts, shop staffing plans and missing uniforms**. Do not offer a universal Fix everything button or imply automated routing, hiring, purchases, factory schedules or pricing. Include preview, waiting for in-game permission, refusal/changed conditions, applying, rereading, success and actual undo scope.

## Boundaries that matter

- Supply's Full production model means 24/7 rated output; Shop demand is a different planning basis. Current staffed production is a separate observation. Keep the basis visible wherever it changes a recommendation.
- Fixed weekly imports and Smart Delivery stock targets need different units and explanations. Urgent catch-up purchases and recurring settings are separate actions.
- A factory's planned line hours and worker requirement are one shared workflow. Staffing provides another entrance; don't invent an employee-level factory assignment optimizer.
- Businesses and the Game guide may both link to live pricing evidence; this does not create an automatic pricing optimizer.
- Expansion plans future production. Supply manages existing operations. Plan a factory retains the present calculation's assumptions and limitations.
- The location finder is one map-backed tool, reachable from Expansion and City map.
- Shop schedules are not automatically available for every office/business type merely because staffing evidence exists there.
- Milestones and lifetime totals remain in a secondary Businesses view. Home detail, recovery, accessibility/preferences and CLI capabilities remain accounted for. Nothing is retired in this redesign by default.
- A future Retired features catalogue belongs under Help & feedback with reason, replacement and Request its return. Show it only as an annotated contingency, without fabricated retired features or votes.

Use “building capacity,” “staffing,” “scheduling,” people counts and actual station names. Avoid the old internal vocabulary in UI copy. Being at building capacity is normal and must not produce advice to open a second or larger location. Product variants and business names must remain identifiable.

## Deliverables

Create an editable, connected set of mockups. Include a sitemap and a feature coverage sheet referencing all IDs in the structure proposal. Distinguish existing functionality, regrouped presentation and genuinely new interaction work.

Take these screens to high fidelity:

1. **Overview:** Needs attention first, company/source context, persistent task groups and proposed navigation.
2. **Supply → Changes:** the cross-company checklist, explicit scope, local progress and copy behavior.
3. **Supply → Imports:** a specific problem with timing, units, current/proposed values and execution paths.
4. **Supply → Production:** current versus planned hours, named sizing basis, input requirements and the shared factory staffing plan.
5. **Staffing → Schedules:** business selection and one actual shop plan, with evidence and prerequisites.
6. **Businesses:** Results and one business detail; show how Products & prices and Standards remain discoverable.
7. **Expansion → Find a location:** demand context, map/list, filters and a floor-plan detail; show onward routes to Demand and Plan a factory.
8. **Write review and result:** import preview through application/reread, refusal and undo.

Provide annotated supporting frames for Deliveries, Goods flow, Staff needs, Payroll, Products & prices, Standards, Milestones, Demand, Plan a factory, Game guide, City map, Preferences and the no-save entry. Each must show its real responsibilities and onward routes. Do not use empty placeholder pages to claim feature coverage.

Connect at least these flows:

- Needs attention → import shortage → evidence and proposed amount → manual copy/progress OR supported preview/apply → refreshed result → return to the queue.
- Overview's factory-hours action → select planning basis → understand required hours/people → reach the same plan from Staffing.
- Find a location → inspect premises/floor plan → return with filters preserved.
- Overview's pricing task → selected business's pricing evidence, without relying on Search.

Design these states across the relevant frames: many findings including critical ones; no urgent findings but optional/disabled checks; insufficient history; no factories; missing recipe identification; no save; stale or failed refresh retaining the last good board; unsupported/older mod; refused write; long names and translated labels.

Use 1440×900 for the main desktop views and check the layout at approximately 1024 px, 768 px and 390 px. Give Overview and the import-fix journey detailed phone designs and both light/dark treatments. Show representative keyboard focus and reduced-motion states. Do not scale down desktop diagrams into illegibility; preserve the newer responsive supply-chain approach.

Provide a short rationale for hierarchy, navigation, shared workflows and motion. Identify deliberate compromises and any new data or backend requirement. Keep the recommendation concrete enough that implementation can follow it without rediscovering where existing features belong.

## Acceptance

The first screen must communicate “Here is what needs fixing, and here is how I help.” A user must also be able to recognize imports, partial-day factory planning, staffing, pricing and premises tools through visible labels. Every capability in the map needs a home; each finding needs a contextual resolution route; important restrictions must remain visible; and the design must retain Big Copilot's recognizable visual craft and playfulness.
