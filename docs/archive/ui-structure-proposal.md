# Big Copilot: proposed structure and feature migration

26 September 2026 · Design brief. Section 12 (27 September 2026) records what the implemented board does with each capability and finding.

This is the current recommendation following the UI/UX audit and Peter's two clarifications: most users do not use Search, and **Needs attention is the product's main selling point and belongs at the top**. It supersedes the earlier task-first conversation sketch. Nothing is approved for removal.

## 1. Product promise and organizing principle

Big Copilot notices what is going wrong in a player's company, explains why, and helps them fix it. Its primary journey is:

**Notice → understand → review a change → make the change → check the result.**

The main dashboard should demonstrate this promise immediately. Permanent task entry points teach players what else the board can do. They do not take visual precedence over Needs attention.

Use three connected ways into the same information:

1. **Problem:** Needs attention takes the player to an affected setting with the evidence already selected.
2. **Task:** a visible action, such as Calculate import amounts, opens the workflow with an explicit scope.
3. **Place:** a business page brings together the state of one shop, office, warehouse or factory, with links to those same workflows.

These are alternative entry points, not three separate implementations of a calculation. Each workflow has one primary home. Search accelerates all three, but no core workflow depends on it.

## 2. The navigation

| Main destination | Question it answers | Proposed local views |
| --- | --- | --- |
| **Overview** | What needs my attention, and what can I do next? | Needs attention first; visible task groups below; no extra overview tabs |
| **Businesses** | How is the company performing, and what is happening at this business? | Results; Products & prices; Standards; Milestones |
| **Supply** | What must I order, deliver or produce to keep things running? | Changes; Imports; Deliveries; Production; Goods flow |
| **Staffing** | Who should work where and when, and what do they need? | Schedules; Staff needs; Payroll |
| **Expansion** | What should I open or build next? | Demand; Find a location; Plan a factory |

**City map** and **Game guide** remain plainly labeled reference destinations. Preferences, Help & feedback, What's new, project links and any future retired-feature catalogue are secondary utilities. Save/company selection, source state and Update remain in the application header rather than moving into Preferences.

The desktop side navigation in the sketch is a direction worth designing, not a fixed visual specification. The designer may compare a sidebar with an evolution of the current masthead navigation. Both must retain these responsibilities, explicit labels and an attention-first overview. At small widths, show all five main destinations in an accessible compact layout; do not make search or an unlabeled hamburger their only discovery route.

### Local navigation has one organizing principle

- Supply's local navigation describes tasks. **Shops, Warehouses and Factories become scope filters and grouping labels**, not a second competing row of primary tabs. A selected business is visible in the page's scope control.
- The first entry into Supply opens Changes. Selecting Imports always opens Imports, rather than whatever object currently has the most changes. A specific task link explicitly chooses its view; generic area entry may restore a visible previous state if testing supports it.
- The home of a selected business remains its business page. A link out to its delivery plan keeps the business selected, and Back restores the business page and position.
- Do not make each homepage action a new page. Several actions can open the same local view with the appropriate section or filter selected.

## 3. Overview: exact hierarchy

### Header and company context

Keep the wordmark and playful brand detail, company/save selector, game day, source freshness, Update and optional search. Immediately below, compact profit, revenue, cash and net-worth/fixed-cost context may occupy one restrained strip. This strip must not become a wall of metric cards above the main product promise.

### Needs attention: first major block

Give it the strongest content hierarchy and enough first-screen space to show useful findings. A new user should immediately understand: **the board has checked this company and has specific work to help with**.

Each finding should communicate, in this order:

| Part | Example purpose |
| --- | --- |
| Actionable headline | Raise the Water import order |
| Affected place/item | Bridge Hub · Water · factory supply |
| Evidence | The order covers less than the coming week's use |
| Consequence or deadline, when known | Runs out before the next delivery |
| Primary action | Review import amount |

Use existing evidence. Do not invent a deadline, guaranteed financial saving, global health score, or cash impact where only quantities/hours are known. Keep product variants intact. Different time bases must be labeled, and should not be summed into one impressive-looking total.

Group only when the relationship is supported. A site's four missing amenities can become a useful parent with four explicit fixes. Distinct upstream and downstream supply failures can be linked but must not be declared one root cause merely because they involve the same product. A grouped row must make it obvious that more than one setting is involved.

Retain severity, materiality, finding-kind controls, below-threshold findings and switched-off findings. Rename the icon-only tune entry to a discoverable label such as Customize checks. Keep a visible statement of what is omitted and why.

**Do not cap the hero to two attractive example findings.** Design both a small queue and a large one. A recommended starting rule is to show all critical cause groups, then a short initial set of remaining actionable findings with explicit counts and Expand all. Keep existing ranking semantics unless a separate product decision changes them. Give users a clear path to the complete list, without a tiny internally scrolling panel. Expanded long lists may push the task directory down; persistent navigation and a clearly labeled jump to the task directory keep it reachable. Urgency takes precedence.

The healthy state is still this product's signature: what was checked, the snapshot date, what remains below the threshold or switched off, and any checks waiting for data. Say “No urgent issues found in this snapshot” when accurate. Do not imply the company is fully healthy because the filtered list is empty.

### Permanent task groups below

| Group | Visible task links | Destination |
| --- | --- | --- |
| Supply | Calculate import amounts | Supply → Imports |
| Supply | Set delivery targets | Supply → Deliveries |
| Supply | Plan factory running hours | Supply → Production |
| Supply | Trace goods through the company | Supply → Goods flow |
| Staffing | Build shop schedules | Staffing → Schedules |
| Staffing | See whom to hire | Staffing → Staff needs, hiring view |
| Staffing | Resolve staff demands | Staffing → Staff needs, demands view |
| Businesses | Compare business profits | Businesses → Results |
| Businesses | Check prices and product sales | Businesses → Products & prices |
| Businesses | Improve customer satisfaction | Businesses → Standards |
| Expansion | Find a suitable location | Expansion → Find a location |
| Expansion | Plan a new factory | Expansion → Plan a factory |
| Expansion | Explore market demand | Expansion → Demand |

These groups replace the separate Next moves and auto-collapsing Ask the board presentations. Keep their useful shortcuts and destination behavior. Avoid retaining all three presentations on the same page.

Group order and labels stay stable. Counts describe the current save without reordering the whole page. With no factories, factory actions remain recognizable and open an honest prerequisite explanation with a link to planning; they must not claim there are factory results. Further specialist options remain visible in their area, not in an unstructured All tools drawer.

## 4. Complete the attention journey

### Arrival

A finding opens the exact task, place and product, with the relevant row or block exposed. The destination names the reason for arrival in a compact strip: “From Needs attention · Water at Bridge Hub.” This strip includes a return route. Do not drop the player on an area landing page and ask them to locate the issue again.

### Explanation and review

Present the current setting, proposed setting, units, expected consequence and basis. Explanations belong beside the decision. Put derivation detail behind an accessible disclosure; neither a tooltip nor hover animation should be the only way to understand an essential condition.

### Execution paths

- **Save-file/manual:** show the game setting and destination, let the user copy relevant changes, and mark their own progress. A local tick is “Marked done by you,” not game confirmation.
- **Game link:** preview only supported writes. Current write families include import amounts, shop and office scheduling, hiring/moves, and missing uniforms. Show refusals, uncovered amounts, changed conditions, permission waiting and the actual undo scope. Hiring has no undo. Do not invent writes for delivery routes, factory hours, purchases or every recommendation.
- **Check again:** reread the game or ask for a newer save. Only updated data that supports the claim can mark the issue resolved. A successful write can be acknowledged while outcome verification remains pending.

Afterward, keep the result understandable and offer Back to Needs attention. A Next finding action is an optional queue-navigation improvement, not an existing capability assumed complete. Preserve reading position, filters and selection through refresh. Don't suddenly reorder the queue under the pointer. A changed recommendation invalidates an old manual mark where the current semantics require it.

## 5. Responsibilities inside each area

### Businesses

**Results** includes the company chart, weekday interpretation, chain/site comparison, company costs outside sites, cash/debt context and company history. Make “Company results” explicit so a financial-reporting task does not get lost behind the word Businesses.

**Products & prices** combines an entry to company product sales with a route to live prices at a selected business. Reference prices, the save's observed prices, averages and recommendations must retain their different meanings. The current wiki guide can supply the detailed view; a new pricing optimizer is not part of the redesign.

**Standards** is the current Operations comparison made recognizable: satisfaction, promotion/marketing, amenities and uniform gaps. Show those subjects under the label. A business's own page holds its evidence and relevant actions.

**Milestones** retains career goals, types run, rival takeovers, diplomas and lifetime totals. It gets a secondary local view, not a prominent Overview card and not removal by default.

**Business pages** are shared contexts. Use only sections applicable to that kind of site: shop/office results, customers, shelves/fees, standards and people; depot stock and destinations; factory machines and inputs. Do not clone the full supply planner and staff planner here. Show useful summaries and explicit links to the same full workflow, carrying site scope. Existing home detail remains reachable from the map until a separate consolidation is approved.

### Supply

**Changes** is the existing cross-company checklist given a proper visible home: outstanding changes, source sites, units, grouped causes, copy remaining and local notes. It has links to the four task views. Its count is not the same as the attention count: margin improvements, lowering excessive targets and manual progress have different semantics. A copied checklist may cover several task types; an Apply action must state its supported subset.

**Imports** contains warehouse and direct-factory import contracts, fixed weekly quantities, Smart Delivery targets, timing, cover, catch-up needs, editable proposed values, supplier limits and preview/apply. Import mode and delivery ordering stay explicit. One-time catch-up and recurring orders are separate decisions.

**Deliveries** contains shop top-ups, warehouse-to-warehouse supply, factory inputs, repeated wholesale contracts, absent routes, stock that is not routed, stalled movement and excessive delivery targets. Group by destination; show source and recurrence. For a blocked route, Goods flow is a contextual secondary action. A supplier shortfall takes the player to Imports with context preserved.

**Production** contains existing factory lines, current output/hours, planned running hours, required inputs, unnamed recipe recovery, Produce up to context, worker requirements and wage impact. The sizing basis is named: Full production (24/7 rated output) or Shop demand. Current staffed output is a separate observation. Show assumptions consistently across imports, deliveries, factory hours and copied output. Don't silently reset a model while the player follows a finding.

Factory running hours and the workers they require form one Supply workflow. **Staffing links to it**, retaining the factory selection. The first redesign does not invent per-person factory schedule assignment if today's data only provides line hours and worker requirements.

**Goods flow** retains the current desktop diagram and the newer responsive chain/focused-site view. Make it a named destination. Keep a selected site/product while switching between the graph and its matching rows. Annotate any extra filtering or interaction proposed by the designer as new design work, rather than pretending it is already supported.

### Staffing

**Schedules** starts with a recognizable choice of business and useful existing plan status, then opens the current shop or office scheduling workflow. Shop planning includes customer-hour evidence, existing/proposed comparison, Cover/Demand plan, full-cover measurement mode, entry ticks and eligible writes. Office scheduling adds available planned hours without replacing existing entries; keep its distinct rules and write checks. Provide a clearly labeled Factory staffing link to Supply → Production.

**Staff needs** is the single home for current-main hiring: open places by role, same-role spare and bench netting, candidate filters and picks, mass and Quick hire, people with no hours, review/confirm and later re-read. Company-wide demands stay company-wide. Keep the existing `hrModel`/`hrRequest` rules, including permitted same-role moves and affected source sites; do not invent a broader optimizer. Link shop and office schedules to Schedules and factory line hours to Production.

**Payroll** retains role totals, current-rate versus booked wages, satisfaction and cost context. Link to the sites that explain differences. Site crew detail remains part of the shared business context and is reachable here.

### Expansion

**Demand** holds business-type demand, What I sell, Not yet, office demand, market movers, waves and supplier shortages. Supplier warnings and active-business exposures should link back into operations; they must not become expansion-only information.

**Find a location** hosts the existing map-backed finder and all its filters: building/business type, district, area, capacity, traffic, layout, rental/takeover/sale mode, saved searches and floor plans. Rent/deposit estimates retain their qualifications. City map exposes the same finder, not a separate ranking algorithm.

**Plan a factory** gives Plan a chain a prospective identity, retaining machine choices, ingredients, company target, observed prices, existing shop use and export surplus. Keep its current full-production assumptions explicit. Do not let a new visual label imply this can plan arbitrary new shop demand or automatically create an end-to-end network. Link recipes to the Game guide and current operations to Supply.

### Reference, preferences and access

City map remains a spatial overview. Game guide retains the wiki's catalogue, guides, checklists, products, suppliers, fixtures, recipes, Yours sections and external/static links. Operational data can be entered through task pages and linked back to the same guide. Mark the distinction between game reference and this save's observations.

Save handling, permission recovery and live status remain in the shell. Theme, game names, available UI language, optional game text and history controls have a consistent preferences home with contextual recovery links. Source freshness cannot be replaced by an online-count badge. Preserve CLI/static-export behavior; community and write controls appear only where supported.

## 6. Feature-by-feature migration map

Every one of the audit's 105 capability IDs appears once below. Seven H-series rows account for capabilities added by PR #121, for **112 mapped capabilities** at the reconciled baseline. “Shared” means one workflow with multiple entry points. “Consolidate” changes presentation, not the underlying calculation. “Secondary” remains supported. These are proposed destinations, not assertions that all combined views already exist.


### Entry and discovery

| ID | Existing capability | Proposed home | Migration rule |
| --- | --- | --- | --- |
| E01 | Choose/drop save folder, landing | Shell → Open save | Keep folder/drop entry and newest-save explanation. |
| E02 | Choose/drop one save, landing | Shell → Open save → One file | Keep deliberate snapshot selection and fallback. |
| E03 | Link to running game, landing/source controls | Shell → Link to game | Keep connection setup and supported-write explanation. |
| E04 | Character/save picker | Shell → Company/save selector | Always visible; changing scope clears incompatible selections. |
| E05 | Resume remembered source and permission recovery | Shell → Source status/recovery | Retain remembered-source resume and explicit permission recovery. |
| E06 | Follow changes, manual Update and fresh/stale status | Shell → Source status and Update | Show fresh/stale/reading states independently of online presence. |
| E07 | Platform-specific save path and Copy | Shell → Open save → Save-location help | Retain platform paths and Copy, also reachable from Help. |
| E08 | Wiki without a save | Game guide, including no-save entry | Keep usable independently of a company. |
| E09 | Optional game text / game-name language | Preferences → Game names / Game text | Separate name language from UI language; missing-text recovery stays contextual. |
| E10 | History retention and Forget history | Preferences → History | Retain retention/forget controls and consequence explanation. |
| E11 | Six top-level pages and remembered subviews | Shell → Proposed main/local navigation | Replace page grouping; retain explicit routes and visible remembered state. |
| E12 | Site URLs, breadcrumbs, Back/Forward, site picker | Shared business context + route history | Preserve site identity, Back/Forward and return-to-origin behavior. |
| E13 | Global search, synonyms, grouped results, recents | Shell → Optional Search | Keep existing index; normal navigation must be sufficient. |
| E14 | Search keyboard shortcuts and map shortcuts | Search shortcuts + contextual map buttons | Keep expert accelerators with visible equivalents. |
| E15 | Ask the board's seven question links | Overview → Permanent task groups | Consolidate question routes; retire the disappearing row presentation only. |
| E16 | Next moves cards | Overview → Permanent task groups | Merge Next moves entry points rather than adding a duplicate launcher. |
| E17 | New badges and news strip | Shell/contextual New badge + What's new | Keep announcements secondary and link to permanent destinations. |
| E18 | Difficulty settings comparison | Shell → Game context/difficulty | Keep context chip and comparison; also reachable from Preferences. |

### Company and dashboard

| ID | Existing capability | Proposed home | Migration rule |
| --- | --- | --- | --- |
| C01 | Profit, revenue, cash and net-worth/fixed-cost tiles, Today | Overview → Compact company strip | Retain all four metric roles; Needs attention is first major block. |
| C02 | Cash versus earned profit, debt note and history | Businesses → Results → Company finances | Overview cash summary links here; preserve debt/history limitations. |
| C03 | Needs attention, severity and materiality | Overview → Needs attention | Prominent primary experience; all findings still available. |
| C04 | Finding-kind switches, below-threshold and disabled groups | Overview → Needs attention → Customize checks | Keep materiality, below-threshold and off-kind disclosure in context. |
| C05 | Daily/rolling result chart and series controls | Businesses → Results | Keep company daily/rolling chart and series controls. |
| C06 | By weekday company chart and site comparison | Businesses → Results → By weekday | Retain site comparison and insufficient-history state. |
| C07 | Portfolio by chain, site profit/cost/margin and trends | Businesses → Results → Business/chain comparison | Keep sortable portfolio and site drill-down. |
| C08 | Portfolio Operations, satisfaction and promotion | Businesses → Standards | Rename the Operations entry; expose satisfaction and promotion subjects. |
| C09 | Company costs outside sites | Businesses → Results → Company costs | Preserve costs outside sites and reconciliation. |
| C10 | Company Products, top/all and aggregate sales | Businesses → Products & prices → Sales | Retain top/all, aggregates and seller drill-down. |
| C11 | Product-level weekday peaks | Businesses → Products & prices → Product evidence | Share weekday evidence with Supply delivery sizing. |
| C12 | Payroll by role, costs and satisfaction | Staffing → Payroll | Keep rate/booked distinction; Results and business costs link here. |
| C13 | Milestones: business types, rivals, goals and diplomas | Businesses → Milestones | Supported secondary local view; no retirement assumed. |
| C14 | Lifetime goods/taxes/buildings totals | Businesses → Milestones → Career totals | Keep lifetime totals; context links for financial/property figures. |

### Supply

| ID | Existing capability | Proposed home | Migration rule |
| --- | --- | --- | --- |
| S01 | Shops / Warehouses / Factories tabs | Supply → Scope control and object groups | Move object tabs to scope/grouping; task views become primary local navigation. |
| S02 | Needs a change / Everything | Supply task views → Attention/all filter | Keep filtering, visible scope and distinct empty states. |
| S03 | Cross-tab change checklist and counts | Supply → Changes | Canonical cross-view checklist; Overview links to it. |
| S04 | Per-row ticks, clear ticks, character persistence | Supply → Changes and matching task rows | One set of local progress notes per character; not game verification. |
| S05 | Copy remaining and copy fallback | Supply → Changes → Copy remaining | Retain fallback, units, model and destinations in copied output. |
| S06 | Editable import Set to amount and reset | Supply → Imports → Proposed amount | Keep override/reset and show recommendation versus chosen value. |
| S07 | Weekly import quantities and supplier contracts | Supply → Imports | Combine warehouse and direct-factory import entry points. |
| S08 | Smart Delivery stock targets and delivery ordering | Supply → Imports → Contract details | Keep fixed quantity versus stock-target semantics and supplier order. |
| S09 | Warehouse stock cover, next arrival, run-out and catch-up | Supply → Imports → Cover and timing | Shared stock evidence also accessible from business detail/Deliveries. |
| S10 | Shop daily top-ups and peak-day pressure | Supply → Deliveries → Shop destination | Keep peak-day use, pressure and daily target. |
| S11 | Repeating wholesale deliveries | Supply → Deliveries → Wholesale contract | Retain weekly mode; no depot prerequisite. |
| S12 | Depot-to-depot and route-fed warehouse supply | Supply → Deliveries → Warehouse destination | Retain second-tier source/destination relationships. |
| S13 | Factory inputs, shared materials and no-depot inputs | Supply → Production → Inputs | Link to exact Deliveries or Imports fix; shared input evidence. |
| S14 | Actual factory hours/output versus rated output | Supply → Production → Lines | Show current hours/output separately from rated/planned values. |
| S15 | Demand sizing versus 24/7 | Supply → Planning basis, shared across affected views | Full production versus Shop demand; explicit scope/persistence. |
| S16 | Staffing for factory lines, hires and wage effect | Supply → Production → Factory staffing | Staffing links to this same line-hours/people/wages plan. |
| S17 | Unknown recipe identification | Supply → Production → Identify recipe | Only affected lines need recovery; business page links here. |
| S18 | Idle stock and high top-up recommendations | Supply → Deliveries → Stock/target review | Inputs/imports link here or retain contextual summaries; distinguish causes. |
| S19 | Not-routed, paused and stalled diagnostics | Supply → Deliveries / Imports by cause | Paused contract in Imports; missing/stalled route in Deliveries; Goods flow for evidence. |
| S20 | List/diagram presentation switch | Supply → Goods flow, plus contextual Table/Goods flow links | Named navigation destination replaces reliance on icon-only mode. |
| S21 | Desktop goods-flow graph | Supply → Goods flow, desktop | Retain graph and selected-context links to rows. |
| S22 | Responsive vertical flow and focused-site view | Supply → Goods flow, narrow screens | Keep responsive chain/focus behavior already in newer source. |
| S23 | Grouping idle rows, collapsing sites and sorting | Supply → Relevant task tables | Retain grouping, sort, disclosed hidden counts and target expansion. |
| S24 | Shared supply status words and explanations | Shared supply evidence component | One status vocabulary across Overview, Supply and site summaries. |
| S25 | Apply imports through game link | Supply → Imports → Preview/apply | Only supported import writes; do not imply all checklist changes are writable. |
| S26 | Import preview, caps, refused/uncovered amounts and undo | Shared write dialog → Import operation | Preserve caps, refusals, uncovered quantities, refresh and actual undo scope. |

### Business detail and staffing

| ID | Existing capability | Proposed home | Migration rule |
| --- | --- | --- | --- |
| B01 | Site summary, trading readiness and local findings | Businesses → Selected business → Summary | Shared context from every finding/task; readiness and local findings remain. |
| B02 | Profit chart, costs and weekly rhythm | Businesses → Selected business → Results | Keep historical profit, cost and weekday evidence. |
| B03 | Satisfaction, amenities and uniforms | Businesses → Selected business → Standards | Keep amenity and uniform requirements, grouped without erasing fixes. |
| B04 | Promotion, marketing and demand-wave exposure | Businesses → Selected business → Promotion | Link to Standards comparison and Expansion's wave detail. |
| B05 | Customers by hour and limiting station/staffing | Businesses → Selected business → Customers by hour | Staffing uses the same evidence; building capacity alone stays neutral. |
| B06 | Overstaffed-hours evidence | Staffing → Schedules → Selected business evidence | Business page links to shared overstaffing evidence and assumptions. |
| B07 | Shop staffing plans, day copying, existing/proposed comparison | Staffing → Schedules → Selected shop | One plan; business page and Overview link to it. |
| B08 | Cover/Demand plan and Full cover 24/7 measurement test | Staffing → Schedules → Planning/measurement mode | Retain Cover/Demand and full-cover measurement purpose/readiness. |
| B09 | Assign/hire recommendations and unmet schedule demands | Staffing → Staff needs, plus schedule prerequisites | Keep people counts and assignment before hiring; no global optimizer claim. |
| B10 | Staffing checklist and ticks | Staffing → Schedules → Plan progress | Retain per-plan notes; align terminology with Supply, not a new universal checklist. |
| B11 | Write shop staffing, preview and undo | Staffing → Schedules → Preview/apply | Keep supported shop write, constraints, reread and undo. |
| B12 | Crew, role grouping, employee demands and quit warnings | Businesses → Selected business → People | Staff needs and Payroll link into the same crew evidence. |
| B13 | Set missing uniforms via game link | Businesses → Standards → Uniform action | Local finding offers same supported write; no duplicate implementation. |
| B14 | Shop shelves, prices, stock and office fees | Businesses → Selected business → Products/fees | Shared sales/prices entry; Supply links to local stock evidence. |
| B15 | Depot stock rail and sites fed | Businesses → Selected warehouse → Stock and destinations | Keep local rail/summary; full changes in Supply with site scope. |
| B16 | Factory machines, inputs and recipe selection | Businesses → Selected factory → Lines and inputs | Keep current-state overview; Production owns full planning and identification. |
| B17 | Home detail: rent, area and rent per area | City map → Selected home | Keep existing detail pending a separately approved map-card consolidation. |

### PR #121 staffing and hiring delta

| ID | Current-main capability | Proposed home | Migration rule |
| --- | --- | --- | --- |
| H01 | Open places by role with bench and spare-staff netting | Staffing → Staff needs | Retain the existing per-role model and same-role cross-site moves; disclose affected source sites. |
| H02 | Candidate catalogue, filters and individual picks | Staffing → Staff needs | Keep offer, expiration, skill, wage and changed-candidate checks. |
| H03 | Mass hire and Quick hire at any site | Staffing → Staff needs | Reuse the same request/review engine and capability gate. |
| H04 | Hire/move preview, confirm, refusal, partial result and re-read | Staffing → Staff needs | Preserve `/write/hire`, compare-and-set checks and the absence of undo; a click is not proof of application. |
| H05 | Staff with no hours evidence | Staffing → Staff needs; selected business → People | Show it even when hiring need is zero, with links to the relevant planner. |
| H06 | Office planning and additive schedule writes | Staffing → Schedules | Preserve existing entries, refuse unreadable entries, and retain office participation in multi-site write. |
| H07 | Factory and source-site effects of hire requests | Staff needs → Supply → Production and affected sites | Retain factory/source-site schedule semantics, displaced or empty hours, and current drivers/cleaners. |

### Growth

| ID | Existing capability | Proposed home | Migration rule |
| --- | --- | --- | --- |
| G01 | Market demand by business type and neighbourhood | Expansion → Demand → By business type | Retain neighbourhood comparison, including offices. |
| G02 | What I sell / Not yet product demand | Expansion → Demand → What I sell / Not yet | Keep distinct assortment and expansion questions; Products links here. |
| G03 | Movers: demand changes, waves and supplier shortages | Expansion → Demand → Market changes | Relevant supplier shortages also link from Supply; wave exposure from business detail. |
| G04 | Demand cell to location finder | Expansion → Demand → Find a location | Carry type/district selection into the single finder. |
| G05 | Plan a chain, machine counts and export surplus | Expansion → Plan a factory | Preserve prospective production model, machine counts and export surplus. |
| G06 | Planned ingredients, company target and observed costs | Expansion → Plan a factory → Ingredients and costs | Same plan, explicit model/observed-price coverage; link to current imports. |

### Map and premises

| ID | Existing capability | Proposed home | Migration rule |
| --- | --- | --- | --- |
| M01 | City map, address search, layers and navigation | City map | Keep layers, address search, owned/rented buildings and navigation. |
| M02 | Building cards and map overlays from other pages | Shared location overlay/building card | Preserve map context without abandoning the active task. |
| M03 | Find a location ranking | Expansion → Find a location | City map launches the same map-backed workflow. |
| M04 | Rent/takeover/sale modes and eligibility | Expansion → Find a location → Availability mode | Retain rent/takeover/sale and eligibility; no merged scoring claim. |
| M05 | Type, district, area, building-capacity and traffic filters | Expansion → Find a location → Filters | Keep all filters with legible scope; advanced controls in a named disclosure. |
| M06 | Floor plans and layout filter | Finder / City map → Building card and layout filter | One floor-plan source and building identity. |
| M07 | Saved finder searches | Expansion → Find a location → Saved searches | Keep named saved filter/sort presets and persistence semantics. |
| M08 | Rent/deposit estimates and building ownership | Finder/building detail → Costs and ownership | Preserve estimates, confidence limitations and rental/purchase differences. |

### Wiki and knowledge

| ID | Existing capability | Proposed home | Migration rule |
| --- | --- | --- | --- |
| W01 | Wiki categories, pages and search | Game guide → Browse/search | Retain catalogue and internal search as an additional path. |
| W02 | Business guides and setup checklists | Game guide → Business guide → Setup | Retain checklists as personal notes; Expansion links to relevant guide. |
| W03 | Product fixtures, suppliers, recipes and recipe flows | Game guide → Products, fixtures, suppliers and recipes | Supply/Expansion use contextual links to this same reference. |
| W04 | Yours and Prices in your save | Businesses → Products & prices → Selected guide context | Game guide retains Yours/Prices sections as a second entry to shared data. |
| W05 | Static searchable wiki pages and direct links | Public/static wiki URLs | Keep routes, search-engine access and no-save behavior. |

### Preferences and community

| ID | Existing capability | Proposed home | Migration rule |
| --- | --- | --- | --- |
| P01 | Theme/system preference and reduced-motion behavior | Preferences → Appearance | Keep theme/system and reduced-motion support throughout. |
| P02 | Interface language support in newer source | Preferences → Interface language | Reflect actual available translations; distinct from Game names. |
| P03 | Changelog, new-feature discovery and updates | What's new + contextual release notice | Keep current routes and feature badges; don't depend on them for discoverability. |
| P04 | Community feature ballot | Help & feedback → Feature requests | Existing ballot; future retirement lifecycle only when justified. |
| P05 | Approximate online count | Secondary community/footer area | Preserve approximate presence if retained; never substitute for save freshness. |
| P06 | Feedback/support links | Help & feedback + contextual task feedback | Make asking for help possible where confusion occurs. |
| P07 | Donation, social, source, game and legal links | Footer/project utilities | Keep donation, social, source and legal links plainly accessible. |
| P08 | Interactive brand spheres and coin effects | Brand/masthead and contextual playful interactions | Preserve recognizable sphere/coin personality; avoid competing with critical findings. |

### Local access

| ID | Existing capability | Proposed home | Migration rule |
| --- | --- | --- | --- |
| L01 | CLI-generated local dashboard | Local CLI → Shared dashboard shell | Same core navigation; static/data-source limits remain explicit. |
| L02 | CLI watch mode and game-link source | Local CLI watch/game → Shared source status | Retain supported source modes; no browser-only dependency for core tasks. |
| L03 | CLI history backfill | Local CLI → History backfill | Retain documented local capability; don't imply a browser control exists. |

## 7. Every finding still has a destination

All 31 current finding kinds remain represented. Overview is the common entry; this table names the initial destination for review. The condition determines the fix, so a destination may cross-link to another area.

| Finding kind | Review destination and handoff |
| --- | --- |
| Not trading yet | Business page → readiness; explicit links for staffing, stock, prices and delivery prerequisites |
| Vacant leases | Businesses → Results → company/site costs; map and property detail |
| Losing money | Business page → results and costs; distinguish a payment-day effect |
| Nobody staffed | Shop/office staff evidence → eligible schedule; factory → Supply Production |
| Low satisfaction | Business page → Standards and relevant causes |
| Promotion below cap | Business page → Promotion; Standards comparison for multiple sites |
| Uniforms / locker | Business page → uniforms; installation instruction or supported uniform write |
| No customer bathroom | Business page → amenities, bathroom requirement |
| Bathroom has no privacy | Business page → amenities, stall/door requirement |
| No customer sink | Business page → amenities, sink requirement |
| No music playing | Business page → amenities, music requirement |
| Interior design too low | Business page → amenities, interior requirement |
| Staff demands | Staffing → Staff needs, selected business/person or role group |
| Insurance / happy boss | Staffing → Staff needs, company-wide requirement |
| Demand wave ending | Business page → exposure and baseline; Expansion Demand → relevant wave |
| Revenue trend | Business page → results/weekday evidence |
| No distribution plan | Supply → Deliveries, selected item/destination |
| Outsells its top-up | Supply → Deliveries, target and peak-day evidence |
| Import paused | Supply → Imports, exact contract and alternatives |
| Factory inputs | Supply → Production, selected input; handoff to its import/delivery fix |
| Unnamed factory line | Supply → Production, recipe identification |
| Machine with no recipe | Supply → Production, affected machine and recipe reference |
| Import shortfall | Supply → Imports, arrival timing and catch-up; route-fed cases → Deliveries |
| Depot top-up too low | Supply → Deliveries, selected source and depot |
| Wholesale delivery too low | Supply → Deliveries, weekly wholesale contract |
| Weekly order too small | Supply → Imports, standing order |
| At capacity | Business page → customer hours and actual limiting station/staffing; building capacity alone is not a fix |
| Overstaffed hours | Staffing → Schedules, selected business and evidence |
| Idle stock | Supply → Deliveries, stock/use evidence; related import or production setting where applicable |
| Not routed | Supply → Deliveries, missing route; Goods flow as contextual evidence |
| Top-up target too high | Supply → Deliveries, proposed lower target and basis |

## 8. Preserve the product's design and playfulness

The earlier conversation sketch tested structure only. Its plain system typography and box-heavy composition are not the visual brief.

The current shipped template in `ba_dashboard.py` is the visual authority: Archivo for interface type; IBM Plex Mono for values, small labels and technical rhythm; near-black green-tinted dark surfaces and pale warm light surfaces; green accents; thin rules; compact editorial sections; graphs, stock-cover rails, hours grids, status marks and direct evidence. Use both current palettes.

Retain the green wordmark dot/sphere identity and a deliberate place for the existing playful interactions. Motion can make relationships and state changes understandable: a flow, a selected business, a delivery path, a completed write. Subtle hover response, the checklist's truck, game-link signal and optional coin/sphere interaction are references. Do not remove personality as a shortcut to a tidier structure. Do not turn every warning into a bouncing mascot or add rewards for merely ticking an unverified action. Reduced motion, keyboard and touch get complete equivalents; useful information never requires catching an animation.

Reference files to inspect locally, in this order:

1. `ba_dashboard.py`: `TEMPLATE`, root tokens, masthead, `drawAlerts`, `drawSupplyStrip`, site-page and `gw*` write-dialog sections.
2. `web/map.css`, `web/wiki.css`, `web/community.css`, `build_web.py` landing/source styles.
3. `mockup/revamp/big-copilot-board.html` and its generator: broader visual language.
4. `mockup/site-panel/build_site_canvas.py`: customer evidence, staffing, site-specific visual grammar.
5. `mockup/write-dialogs/build_write_canvas.py` and `NOTES.md`: contextual before/after and the signal wire.
6. `mockup/goods-flow-phone/build_goods_flow_canvas.py` and `NOTES.md`: responsive flow concept already reflected in newer source.
7. `mockup/find-location/build_finder_canvas.py`, `mockup/map-revamp/big-copilot-map.html`, `mockup/wiki-revamp/big-copilot-wiki.html`: finder, map and guide references.

Older canvases contain draft or historical behavior. Verify current capabilities from source/docs and label new proposals. Do not import private real-save datasets from mockups into a design handoff; use synthetic data and fictional names.

## 9. Retirement policy for this redesign

The redesign preserves capabilities while consolidating their homes. Keep milestones, home detail, optional playful interactions and community utilities available at their mapped destinations. They are not automatically retired because the initial audit called them candidates. Peter's request to preserve playfulness particularly supersedes treating decorative interactions as an immediate removal target.

If a later decision retires a capability, use Help & feedback → Retired features, with its purpose, reason, replacement, date and Request its return. An old link lands on this explanation. Reuse the feature-voting framework with an explicit restoration request; do not add a top-level Archive. Show this state as a future contingency in the design, with no invented retirement or votes.

## 10. What is layout work and what is new product work?

| Scope | Examples | Designer obligation |
| --- | --- | --- |
| Existing capability, new label or route | Needs attention, import amounts, existing schedules, finder, wiki, graphs | Show a recognizable destination and preserve its behavior |
| Consolidated presentation | Businesses Products & prices; Staffing landing; task-focused Supply; shared business summaries | Show where each current datum/action lands; do not imply a new calculation |
| Proposed interaction needing implementation | Queue return state, optional Next finding, consistent progress language, task-to-view migration | Annotate as proposed; show failure and stale-data states |
| Outside this redesign | New financial forecasts, universal auto-fix, company-wide optimizer, arbitrary writes, new pricing engine | Do not make these appear as working product capabilities |

No new outcome can be derived merely by rearranging a screen. The designer should call out any missing evidence needed for their proposed UI.

## 11. Designer delivery and acceptance

The companion [designer prompt](ui-designer-prompt.md) is ready to copy. Design the whole navigation map, then concentrate visual fidelity on the Overview and the complete supply-fix journey. Produce representative detailed pages and annotated frames for remaining mapped capabilities; don't substitute a beautiful homepage for the destination work.

Review against these conditions:

- At 1440×900 and on a phone, the first substantive section clearly demonstrates Needs attention and a useful next action.
- Long/critical and healthy/insufficient-data states preserve honesty and don't turn the hero into a decorative score.
- All 112 mapped capability IDs and 31 finding kinds remain accounted for. Two entry points open the same underlying workflow where specified.
- A user can locate imports, factory hours, staffing, prices and premises through visible labels without Search.
- Each reviewed finding retains its site/item, basis, units, origin and return path.
- Manual notes, applied writes and verified outcomes look distinct. Unsupported operations are not presented as automated fixes.
- Main and local navigation do not change meaning between company stages, screen sizes or repeated visits.
- Existing deep links and static/wiki access have a migration destination; a moved feature is not called retired.
- Light/dark, keyboard, touch, reduced motion, longer translated labels, missing history and older game/mod data have designed states.
- The result still looks and feels like Big Copilot, including its deliberate playfulness.

## 12. Coverage at the end of the migration (chunk 3, 27 September 2026)

Every capability of the ledger above, and every finding kind, with the destination it has in the
implemented board and the evidence that it works there. **Destination** is where the reader finds
it now (a route, and the block on it). **Evidence** names the automated test that exercises it
(`tests/…`), or "kept" where the chunk left the code and its existing tests unchanged. **Change**
records an intentional behavior change; "–" is none. Nothing is retired. Agent tests show that a
route and its state work; they are not proof that players find it (see the chunk-3 handoff,
"Not verified").

Updated 28 September 2026 for the declutter rounds and the sidebar ([ui-declutter.md](ui-declutter.md)):
the masthead and its rows became a sidebar with one ··· menu at its foot (on the hosted page the
save-source menu, which also holds What's new, Preferences and Help & feedback), theme and
language live in the footer only, and the Game guide is called the Wiki again. The rows below
name those places.

### Entry and discovery

| ID | Destination | Evidence | Change |
| --- | --- | --- | --- |
| E01 | Web landing: Choose the folder, drop | kept; `tests/save_location.test.cjs`, `tests/resume.test.cjs` | – |
| E02 | Web landing: one save file | kept; `tests/resume.test.cjs` | – |
| E03 | Web landing and source menu: Link to the game | kept; `tests/game_link.test.cjs` | – |
| E04 | Sidebar foot ··· → save source (save picker; the company name no longer opens it) | `tests/save_picker.test.cjs`, `tests/restore.test.cjs` | the ··· is the one way in (declutter S5) |
| E05 | Source strip: remembered source, Choose the folder again | kept; `tests/resume.test.cjs` | – |
| E06 | Live dot on the sidebar clock; Update at the sidebar foot; the source strip a warning bar only while something is wrong | `tests/calm_refresh.test.cjs`, `tests/restore.test.cjs` | Update moved to the sidebar foot |
| E07 | Landing "Where is my save?"; source menu help; Help & feedback › Where is my save? (web) | `tests/save_location.test.cjs`; Help sheet: `tests/businesses_expansion.test.cjs` | Help & feedback opens the source menu's save help |
| E08 | Wiki with no save (`#wiki`, landing Browse the wiki) | kept; `tests/wiki*.test.cjs` | named Wiki again |
| E09 | Footer › Language; Preferences › Game text (web) | Preferences sheet: `tests/businesses_expansion.test.cjs`; picker: `tests/i18n_*.test.cjs` | Language lives in the footer only (declutter X5) |
| E10 | Preferences › History: Forget history (web), market_history.json and --backfill (CLI); Company finances › History since | `tests/businesses_expansion.test.cjs` (finances, sheet rows) | – |
| E11 | Sidebar: five areas with the open one's views, City map, Wiki; folds to a rail (views then on top of the page) | `tests/navigation.test.cjs`, `tests/shell_routes.test.cjs` | the masthead and its rows became the sidebar |
| E12 | `#site/<slug>`, crumbs, site picker, Back/Forward, `nxRoute` | `tests/shell_routes.test.cjs`, `tests/findability.test.cjs`, `tests/businesses_expansion.test.cjs` | a business's page leads to its planners and back (`spActs()`) |
| E13 | Sidebar Search (the rail's icon; in the phone's drawer), / and Ctrl+K, Help › Search | `tests/search.test.cjs` | – |
| E14 | `/`, Ctrl+K; map's own buttons | `tests/search.test.cjs`, `tests/map.test.cjs` | – |
| E15 | Overview › All tools (the seven questions stay the palette's empty state) | `tests/today_layout.test.cjs`, `tests/search.test.cjs` | – (chunk 1) |
| E16 | Overview › All tools | `tests/today_layout.test.cjs` | – (chunk 1) |
| E17 | New badges; news strip; ··· › What's new; Help › What's new | `tests/news.test.cjs`, `tests/release.test.cjs` | – |
| E18 | Difficulty chip (sidebar clock ≥1501 px, else the footer), Preferences › Game context | `tests/milestones.test.cjs`, `tests/fold_views.test.cjs` | also in Preferences |

### Company and dashboard

| ID | Destination | Evidence | Change |
| --- | --- | --- | --- |
| C01 | Overview company strip | `tests/today_layout.test.cjs` | – (chunk 1) |
| C02 | Businesses › Results › Company finances (`secFinance`): cash on hand and what it did against profit, loans and their daily cost, history since | `tests/businesses_expansion.test.cjs` | new block; the Overview cash tile's note is kept |
| C03 | Overview › Needs attention | `tests/shell_routes.test.cjs`, `tests/today_layout.test.cjs` | – (chunk 1) |
| C04 | Needs attention › Customize checks; Preferences › Checks | `tests/today_layout.test.cjs`; `tests/businesses_expansion.test.cjs` | also in Preferences |
| C05 | Businesses › Results › Company results chart (30 days, All, series) | kept; `tests/layout.test.cjs`, `tests/calm_refresh.test.cjs` | heading "Company results" |
| C06 | Company results › By weekday, with the sites' comparison | kept; `tests/test_weekday_window.py`, `tests/map.test.cjs` | – |
| C07 | Results › Portfolio (by chain, sortable, site drill-down) | kept; `tests/findability.test.cjs`, `tests/hostile_names.test.cjs` | – |
| C08 | Businesses › Standards: subjects, Business by business (`stdTable()`), portfolio in Operations | `tests/businesses_expansion.test.cjs`, `tests/shell_routes.test.cjs` | new comparison table |
| C09 | Results › Portfolio › Company costs outside sites | kept; `tests/layout.test.cjs` | – |
| C10 | Products & prices › Sales across the company (top / all) | kept; `tests/businesses_expansion.test.cjs` (heading) | heading renamed |
| C11 | Sales across the company › Peaks column and notes | kept | – |
| C12 | Staffing › Payroll; linked from Company finances | `tests/businesses_expansion.test.cjs`, chunk 2's Payroll tests | link from Results |
| C13 | Businesses › Milestones › Career goals | `tests/milestones.test.cjs`, `tests/businesses_expansion.test.cjs` | bars instead of a checklist |
| C14 | Milestones › Career totals (goods, taxes, buildings, a link to the City map) | same | tiles |

### Supply (chunk 2, kept)

| ID | Destination | Evidence | Change |
| --- | --- | --- | --- |
| S01–S26 | Supply › Changes, Imports, Deliveries, Production, Goods flow, as chunk 2 left them | `tests/progress.test.cjs`, `tests/import_*.test.cjs`, `tests/flow_chain.test.cjs`, `tests/order_checklist.test.cjs`, `tests/game_link_write.test.cjs` | S21: a redraw keeps the picture's sideways scroll, the legend stays in view (`tests/flow_chain.test.cjs`) |

### Business detail and staffing

| ID | Destination | Evidence | Change |
| --- | --- | --- | --- |
| B01 | A business's page: head, trading lamp and checks, its findings, tiles; the ways to its planners | `tests/site_panel.test.cjs`, `tests/businesses_expansion.test.cjs` | header actions (`spActs()`) |
| B02 | Page › Profit chart, cost bar, Its week | kept; `tests/site_panel.test.cjs` | – |
| B03 | Page › Satisfaction (lamps, locker, uniforms); Standards comparison | `tests/site_panel.test.cjs`, `tests/businesses_expansion.test.cjs` | – |
| B04 | Page › Promotion (with the wave); Standards; Demand's market changes | kept; `tests/site_panel.test.cjs` | – |
| B05 | Page › Customers by hour, ceilings; building capacity neutral | kept; `tests/site_panel.test.cjs` | – |
| B06–B11 | Staffing › Schedules (the one planner) and Staff needs | `tests/roster.test.cjs` (migrated to Schedules), `tests/game_link_write.test.cjs`, `tests/staff_hire.test.cjs` | the business's page carries a summary (`#sp-sched`) and a link, not a second planner |
| B12 | Page › Crew (people, roles, demands, quit warnings) | kept; `tests/site_panel.test.cjs`, `tests/job_demands.test.cjs` | – |
| B13 | Standards › Uniforms (the write), page › Satisfaction, the finding; progress Applied / Confirmed / Not confirmed | `tests/businesses_expansion.test.cjs`, `tests/game_link_write.test.cjs` | uniform progress records (`docs/archive/ui-progress-postconditions.md`) |
| B14 | Page › Shelves or Fees; Products & prices at the business | `tests/site_panel.test.cjs`, `tests/businesses_expansion.test.cjs`, `tests/shell_routes.test.cjs` | prices compared on Products & prices |
| B15 | Depot page › Stock, Feeds, Crew; Imports and Deliveries from its head | kept; `tests/site_panel.test.cjs` | header actions |
| B16 | Factory page › Lines, Inputs, Crew; Production from its head | kept; `tests/site_panel.test.cjs` | "staffed", not "rostered" |
| B17 | City map › a home's card → its page (`spHomePanel()`) | kept; `tests/map.test.cjs` | – |
| H01–H07 | Staffing › Staff needs, Schedules (offices), Production, as chunk 2 left them | `tests/staff_hire.test.cjs` (office writes now opened on Schedules) | H06: the office planner is drawn on Schedules only |

### Growth

| ID | Destination | Evidence | Change |
| --- | --- | --- | --- |
| G01 | Expansion › Demand › By type (offices in their band) | kept; `tests/test_market_offices.py`, `tests/finder.test.cjs` | – |
| G02 | Demand › What I sell, Not yet | kept | – |
| G03 | Demand › market changes chips | kept | – |
| G04 | A Demand cell → Find a location, its type and neighbourhood, an arrival naming them; Back to the cell | `tests/businesses_expansion.test.cjs`, `tests/finder.test.cjs` | through `openRoute()` with an arrival; the cell kept on Demand's entry |
| G05 | Expansion › Plan a factory | kept; `tests/test_plan_orders.py`, `tests/test_plan_regressions.py` | – |
| G06 | Plan a factory › Ingredients | kept | – |

### Map and premises

| ID | Destination | Evidence | Change |
| --- | --- | --- | --- |
| M01 | City map (always the plain map), heading, layers, search | `tests/map.test.cjs`, `tests/businesses_expansion.test.cjs` | `#map` switches the finder off |
| M02 | Map buttons and the location dialog | kept; `tests/map.test.cjs` | – |
| M03 | Expansion › Find a location | `tests/finder.test.cjs`, `tests/businesses_expansion.test.cjs` | the switch is a visit of its own |
| M04 | Finder › Show: to rent, to take over, for sale | kept; `tests/finder.test.cjs` | – |
| M05 | Finder › Kind, Type, Where, Size, Capacity, Traffic | kept; `tests/finder.test.cjs` | filters kept per visit (`nxFs`) |
| M06 | Finder › Layout, the card's floor plan | kept; `tests/finder.test.cjs`, `tests/test_floor_plans.py` | – |
| M07 | Finder › Saved | kept; `tests/finder.test.cjs` | – |
| M08 | Finder card › rent and deposit estimates, ownership | kept; `tests/finder.test.cjs` | – |

### Wiki and knowledge

| ID | Destination | Evidence | Change |
| --- | --- | --- | --- |
| W01 | Wiki › categories, search | kept; `tests/wiki*.test.cjs` | named Wiki again |
| W02 | Guide › business guides, setup checklists; Find a location's "setup guide" | kept; `tests/businesses_expansion.test.cjs` | linked from the finder |
| W03 | Guide › products, fixtures, suppliers, recipes | kept | – |
| W04 | Guide › Prices in your save; Products & prices links to it | kept; `tests/businesses_expansion.test.cjs` | – |
| W05 | `/wiki/…` static pages, sitemap, robots | kept; `tests/test_wiki_pages.py` | – |

### Preferences and community

| ID | Destination | Evidence | Change |
| --- | --- | --- | --- |
| P01 | Footer › Theme (motion follows the system) | `tests/businesses_expansion.test.cjs` | theme lives in the footer only (declutter X5) |
| P02 | Footer › Language | `tests/businesses_expansion.test.cjs`, `tests/i18n_*.test.cjs` | in the footer only (declutter X5) |
| P03 | ··· › What's new, Help › What's new, footer Changelog, New badges, update banner | `tests/businesses_expansion.test.cjs`, `tests/update.test.cjs` | – |
| P04 | Help › Feature requests (web), footer vote card | `tests/businesses_expansion.test.cjs`; `npm run test:community` (unchanged files) | – |
| P05 | Live dot's online count on the sidebar clock (web) | kept; `tests/community-browser.test.cjs` | – |
| P06 | Help › Bugs and feedback; footer | `tests/businesses_expansion.test.cjs` | – |
| P07 | Help › The project; footer | `tests/businesses_expansion.test.cjs`, `tests/test_footer.py` | – |
| P08 | Wordmark dot, sphere, coins | kept; `tests/search.test.cjs` (sphere) | – |

### Local access

| ID | Destination | Evidence | Change |
| --- | --- | --- | --- |
| L01 | `dashboard.html` from the CLI | every CLI-target Node test | – |
| L02 | `--watch`, `--game`; Preferences › Local board | kept; `tests/test_watch_game.py` | named in Preferences |
| L03 | `--backfill`; Preferences › History and › Local board | kept; `tests/test_cli_target.py`, `tests/test_history_store.py` | named in Preferences |

### The 31 finding kinds

Every kind's route is `FINDING_ROUTES` (`tests/shell_routes.test.cjs` asserts all 31 route to a
real view, and `tests/alert_kinds.test.cjs` and `tests/navigation.test.cjs` hold the tables to
each other). The landings of the ten Businesses and Expansion kinds are final since chunk 3:

| Kind | Final landing | Evidence |
| --- | --- | --- |
| `notrading`, `loss`, `trend`, `atcap` | the business's page (tiles, profit, hours); its planners one click away in its head; building capacity stays a neutral reading | `tests/shell_routes.test.cjs`, `tests/site_panel.test.cjs` |
| `vacant` | Results › Portfolio | `tests/findability.test.cjs` |
| `satisfaction`, `bathroom`, `toiletprivacy`, `sink`, `music`, `interior` | the business's page, standards block, the amenity lit; Standards compares every business | `tests/site_panel.test.cjs`, `tests/businesses_expansion.test.cjs` |
| `promotion` | Businesses › Standards | `tests/shell_routes.test.cjs` |
| `uniform` | the page's standards block; the uniform write there and on Standards; its progress beside the finding | `tests/businesses_expansion.test.cjs` |
| `hype` | Expansion › Demand, the wave among the market changes | `tests/alert_kinds.test.cjs` |
| the other 17 (Supply, Staffing) | as chunk 2 left them | chunk 2's tests |
