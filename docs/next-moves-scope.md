# Next moves: feature scope and player research

Research date: 11 September 2026. Proposal for discussion, not an implementation commitment.

## Recommendation

Keep the three decisions, but make the first releases narrower and more concrete:

1. **Plan imports**: a complete list of order and replenishment changes to enter in-game.
2. **Fix staffing**: explain uncovered shifts and unnecessary coverage, then propose feasible changes.
3. **Find a location**: compare actual premises for a chosen business, with evidence behind the shortlist.

The best additional cards are **Check storage**, **Trim marketing**, and **Clear surplus**. They extend the board's existing supply and performance analysis. **Prepare to open** is a useful later onboarding workflow. Employee demands should initially sit inside staffing rather than create a second employee dashboard.

The product contract stays the one in README: local, read-only save analysis. Every workflow ends in advice the player can apply in-game and verify with the next save. “Set every manager in one pass” currently sounds like direct game control; replace that promise with a grouped change list.

## What exists today

The three placeholder cards live in `ba_dashboard.py`, in the HTML template under `secMoves` (around line 5138). `web/index.html` is generated; a later implementation should change the source template and rebuild through `build_web.py`.

| Card | Existing foundation | Actual missing work |
| --- | --- | --- |
| Plan imports | `_supply`, `_factories`, and the Supply / Orders to set view already calculate import coverage, daily targets, factory inputs and weekday variation. | Turn recommendations into one coherent, editable plan with current/proposed values and a checklist, and account for physical constraints where validated. |
| Optimize staffing | `_staff` reads wages, weekly hours, skill, absence and a complaint flag. `_hourly` reads scheduled customer-service station coverage and hourly customer history; `_hour_findings` flags bottlenecks and idle coverage. | Preserve employee/shift detail for planning, validate preferences and constraints, and extend the service model to businesses with multiple required roles. |
| Find a location | `_market` and `_expansion` identify business/neighbourhood opportunities and existing shops at their building cap. `ba_buildings.json` maps addresses to neighbourhood, type, size, area and traffic. | A verified live catalogue of availability, rent, capacity, eligibility and restrictions, joined to those opportunities. The static table alone cannot tell us a building is free. |

Two calculation limits matter: the hourly view applies the current roster to historical customer observations, so it does not prove what staffing was in place on each past day. Also, customers served at a cap are a lower bound on demand; they do not reveal the exact number turned away.

## Recent player evidence

Target window: 14 August–11 September 2026, with emphasis on the period after the 1.0 launch. This is a qualitative scan of public Reddit threads and Steam discussions, not a representative survey or a measured comparison of forum activity. Search sometimes surfaced old threads with recent replies; those are not counted as new recent complaints. Vote counts below are approximate snapshots of the retrieved pages, not unique affected-player counts.

| Evidence | Player problem | Product implication |
| --- | --- | --- |
| [Staffing a large hair salon, 6 Sep](https://www.reddit.com/r/bigambitions/comments/1w993ha/picked_this_up_a_few_days_ago_and_played_20_hrs/) — about 30 upvotes | Hiring, day/night preferences and days off require too many menus. Replies disagree about how well auto-scheduling solves gaps. | Strong support for a staffing audit, filters and a proposed roster. Explain existing HR/headhunter delegation before recommending more manual work. |
| [Employee happiness demands, 30 Aug](https://www.reddit.com/r/bigambitions/comments/1w2sibd/after_many_many_hours_playing/) — about 48 upvotes; [another demands complaint, 7 Sep](https://www.reddit.com/r/bigambitions/comments/1wa0o37/what_is_wrong_with_these_people/) — about 47 | Repetitive employee requests become burdensome at scale. | Group shared causes by site and show missing delegation, if the save supports it. A companion can organize fixes, but cannot change the game's demands system. |
| [Warehouse delivery to business, 6 Sep](https://www.reddit.com/r/bigambitions/comments/1w92owd/warehouse_delivery_to_business/) | Storage warnings and unexplained inventory changes leave the player unsure whether targets, capacity or a bug are responsible. The author revised their initial mod diagnosis. | Add physical storage checks and explain where goods sit. Do not present this report as a confirmed game bug or claim one snapshot can explain missing stock. |
| [Headquarters scheduling, 2 Sep](https://www.reddit.com/r/bigambitions/comments/1w5gs8d/headquarters_schedule/) | Assigned staff cannot be scheduled because the workstation setup is incomplete; the player later reports fixing it. | A readiness check could distinguish no employee, no usable workstation and no scheduled coverage. Workstation validity needs validation first. |
| [Competition and neighbourhood profit, 4 Sep](https://www.reddit.com/r/bigambitions/comments/1w7bzup/i_really_underestimated_how_powerful_being/) — about 55 upvotes | Players discover how much competitor presence and temporary trends change results. This is a discovery thread rather than a complaint. | Location comparisons should show competing sellers, own nearby supply and hype separately. These anecdotes do not establish a profit formula. |
| [Updated 1.0 figures and surplus goods, 11 Sep](https://www.reddit.com/r/bigambitions/comments/1wdb71t/big_ambitions_is_absolute_crack_but_i_have_a_few/) | A player wants current factory/logistics figures and a way to handle excess production without depressing export prices. | Show the supported game build and compare producing less with exporting excess. Treat comments about production limits as a mechanic to verify. |
| [Primary versus additional products, Steam, discussion active 10–11 Sep](https://steamcommunity.com/app/1331550/discussions/0/525387040750092950/) | Players are unsure why a specialist shop differs from a broad shop selling the same goods. Several replies explicitly offer interpretations, not measured rules. | Keep primary and optional ranges visible in location planning; do not treat every seller as an equivalent competitor or turn forum guesses into demand coefficients. |

Two especially relevant supplementary threads are [how much each store can hold](https://www.reddit.com/r/bigambitions/comments/1vmotvx/better_way_to_know_how_much_each_store_can_hold/) and [overspending on marketing](https://www.reddit.com/r/bigambitions/comments/1vne8kj/til_ive_been_overspending_on_marketing/). They directly request storage visibility and explain confusion about promotion. The retrieved Reddit pages expose inconsistent relative ages/crawl metadata, so their exact publication dates are unverified; they support feature fit, not the dated recency claim.

I also inspected the Steam discussion index and pinned suggestions thread. The pinned thread defaults to old comments; those were excluded from recent evidence. Reddit supplied the clearest dated recurring themes in this scan. Discord and private discussions were not reviewed.

## 1. Plan imports

**Decision:** What should I change before the next delivery so my shops and factories remain supplied?

**Card copy:** “Set next week's orders and daily top-ups from expected sales, stock on hand and delivery dates.”

**First release:** Open Supply / Orders to set, extended into a plan grouped by warehouse and, where mapped, purchasing agent. Show product, current setting, proposed setting, difference, delivery day, expected lowest stock and the reason for change. Keep recurring weekly orders distinct from a one-off catch-up requirement. Show daily shop targets alongside their supplying orders so fixing one does not leave the other short.

Allow a clearly labelled buffer and a current-roster versus expanded-production scenario. Recalculate in the browser. End with a copyable checklist using the game's units and setting names; checking a row means the player marked it done, while a newer save can confirm the actual setting.

**Calculation boundaries:** Weekly imports cover the sum of consumption over their delivery cycle, including stock and arrivals. Peak-day demand informs daily replenishment; multiplying the busiest day by seven is not the default weekly order. Current production must respect verified operating hours and output limits. Full-rate production remains an explicit scenario. Unknown storage or supplier limits must appear as unchecked constraints, not a guarantee that the plan will fit.

**Later:** Alternative suppliers, delivery timing scenarios and storage-aware planning after their mechanics are validated. No automatic manager changes or save editing.

**Done when:** A player can make one complete pass through affected settings, see why each changed, and verify them on reload. Validate weekday peaks, partial days, existing stock, paused orders, duplicate routes and factory/shop flows without counting consumption twice.

**Relative effort:** Medium; most arithmetic already exists. New physical-constraint modelling is separate work.

## 2. Fix staffing

**Decision:** Which shifts should I change, and do I actually need more people?

**Card copy:** “Find uncovered shifts and spare coverage, then see which staffing changes fit your team.”

**First release:** A company-wide list of sites needing attention, opening into a weekly coverage grid with the limiting resource named: building, register, required specialist or absent employee. Provide filters by business, role, skill, absence and complaint status. Keep current absence separate from normal weekly scheduling. Show wage implications in dollars and coverage changes in hours, without promising exact recovered revenue.

Start with customer-service/register businesses, where the current model exists. Suggest moving or shortening a shift only when validated constraints allow it. If the model cannot validate an employee assignment, recommend the required role and hours rather than invent a feasible named roster.

**Required next slice:** Multi-role businesses, especially salons, plus factories. The strongest recent staffing example is a salon; a cashier-only release must label its coverage and must not advertise that complaint as solved. Map every required station and role before claiming full-site coverage.

**Data gate:** The current extraction has a complaint boolean, not a validated model of preferred hours, days off, maximum shifts, replacement cover or demand deadlines. Inspect and verify those fields before a named schedule optimizer. Retain stable employee IDs, assignments and shift intervals. Account for cross-midnight shifts, overlapping assignments, station duplication and training where supported.

**Later:** Named roster proposals with locked shifts and a choice between lower wages and extra cover. Group common employee demands and surface missing HR/headhunter assignments after those relationships are verified. Avoid expanding into a full company-wide scheduling solver in the first release.

**Done when:** Every suggested edit explains the affected hours, capacity and wages; no supported constraint is violated; a building cap never generates a hiring recommendation. Low-history sites get a limited audit rather than a confident demand forecast.

**Relative effort:** Medium for the audit; high for constrained roster generation and multiple service roles.

## 3. Find a location

**Decision:** Which premises should I inspect for this business, or should I expand an existing site instead?

**Card copy:** “Compare premises for your next business by demand, competition, rent and customer capacity.”

**First release:** Choose a business type, optional neighbourhood and budget; show a short ranked list and compare up to three addresses. Each row explains its demand evidence, primary versus optional products, competing providers, own existing presence, traffic, verified door cap, rent and availability. Mark temporary hype separately from longer-running demand. Link an existing capped business into the same workflow as a relocation case.

Rank eligible premises transparently using visible factors. Keep strong measured evidence for an existing site distinct from inferred opportunity for an unopened one. Budget comparisons should say whether they cover rent only or include a user-entered fit-out estimate. Do not manufacture precise expected profit, payback or competitor-response probabilities.

**Data gate:** Verify live vacant/occupied state, owner restrictions, usable business types, rent and customer capacity from saves. The bundled map provides geography and size, not all these facts. Where availability cannot be verified, label the address “Check in-game”; an unavailable catalogue should fall back to the existing neighbourhood opportunity view. Do not call unknown buildings “free.”

**Later:** Buying a rival, supply-network capacity implications and a richer relocation scenario. No property purchase action.

**Done when:** Every shortlisted property is either verified eligible or explicitly needs checking; each ranking has a legible reason; own competing shops and hype are visible. Test restricted, occupied, unknown and modded addresses.

**Relative effort:** Medium to high, mostly determined by the property-data investigation.

## Additional cards in the same style

These are proposed product responses to the evidence, not features directly specified by forum consensus.

| Card and copy | Minimum useful scope | Foundation and open questions | Priority |
| --- | --- | --- | --- |
| **Check storage** — “See what each shop can hold and which delivery targets will overfill it.” | Per-site/product displays, held units, targets and shared backroom capacity; identify the target or storage change to inspect. | Stock and targets exist. Need validated display capacities, box sizes, partial-box rules and shared shelf allocation. Do not allocate the same free shelf space to every product. | Highest new-feature fit; start with a data investigation. |
| **Trim marketing** — “Find campaigns you can cut while keeping promotion at its ceiling.” | Flag potentially redundant promotion; compare current versus proposed campaign combinations and show cost savings only where known. | Traffic, marketing index, promotion and expense already exist. Current findings identify under-promotion. Exact cuts need individual campaign costs/contributions and rules. Clipped totals alone cannot identify a removable campaign. | Good candidate for a small early improvement. |
| **Clear surplus** — “Reserve what your shops need, then compare producing less with exporting the rest.” | Calculate stock reserved through the next replenishment; show remaining units and scenarios at observed prices. | Factory inputs, flows and stock exist. Verify production limits, export destinations, pricing and difficulty effects. Export-price response is unknown; a current-price scenario is not a guaranteed return. | After import planning, sharing the same forecast. |
| **Prepare to open** — “Check staff, stations, stock and deliveries before your first trading day.” | One readiness list grouped by new site, with failed or unknown requirements and links to the relevant views. | Existing new-site findings and amenity checks can be reused. Validate usable workstations and prerequisites; unknown is different from ready. | Later; strong onboarding fit, less new analytical work. |

Requests for more life simulation, new business types and fewer happiness chores recur too. Those are principally changes to the game itself. A companion challenge tracker could add goals, but it is a weaker fit than solving decisions the save already exposes.

## Delivery order and presentation

Ship the import workflow first because the engine and destination view already exist. In parallel as a workstream, investigate storage capacity and staffing constraints; these are the biggest feasibility unknowns. The next substantial release should be staffing, with the multi-role limitation made explicit. Build property shortlisting once live eligibility is proven. Marketing trimming can be a smaller intervening release if campaign data is straightforward.

Keep Today compact: three contextual entry cards, not an ever-growing grid of promises. Put further workflows in their relevant Supply, Growth or Company view, with an optional “More tools” entry if needed. Reuse the current action-led language, restrained icon treatment and progressive disclosure. A click should open a useful workflow with one verdict, a list of changes and supporting evidence on demand. Use “Planned” for uncommitted concepts; reserve “Soon” for work actually scheduled.

For this scoping pass, only this document was added. No production UI, calculations or deployment were changed.

## Implementation progress — 11 September 2026

The subsequent implementation starts with two separate changes:

- Wording hotfix (`b950f4b`): the import card promises a checklist of settings to
  enter in-game, replacing the implication that it can configure managers.
- First import feature increment: the card opens Supply / Orders and expands a
  grouped checklist built from existing recommendations. It includes current and
  proposed amounts, factory input assumptions, known shop-route top-ups, paused
  imports and pre-delivery supply gaps. Players can mark progress per character
  and copy remaining actions. Marking a row never changes the saved figures.
  The old animation that pretended an order was set has been removed.

This increment is a checklist, not the complete planner described above. It does
not calculate custom buffers, alternate delivery scenarios, storage capacity or
current-roster factory consumption. Unknown factory recipes are called out, and
products with no known shop delivery route are excluded from automatic top-up
recommendations because they may be made on demand. Supplier/manager mapping and
explicit confirmation of applied settings from newer saves remain later work.

Next slice: distinguish recurring consumption from one-off catch-up quantities
using the existing delivery dates and stock walk. Then add a buffer control with
clear effects on each setting. Validate current-roster production and output
limits before offering those as alternatives to full-rate factory quantities.
