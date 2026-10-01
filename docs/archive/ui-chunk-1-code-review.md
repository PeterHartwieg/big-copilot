# Chunk 1 candidate 1: independent Opus code review

Candidate: `356af7b`; base: `888992e`. Requested and responding model verified as `claude-opus-5-5`. Review completed successfully. This is a source review: the CLI read-only command allowlist denied scratch/browser commands, so the reviewer did not runtime-verify its findings. Separate functional and visual QA agents test the rendered candidate. No application edits were made by the reviewer.

I don't recommend accepting chunk 1 candidate 1 at 356af7b yet. I found three must-fix defects, all small, and seven should-fix issues.

**Scope and limits:** I read AGENTS.md, the implementation plan, the route migration doc, the architecture views and registries sections, all of `git diff 888992e HEAD` and the new call paths it reaches (sbLand, ssOpenSite/openSite/xlArrive, reveal, the hashchange/openHash flow, openFinder/setFinder, renderCalm/renderAll and the i18n tooling). I did no runtime testing. The permission mode denied `node`, so I could not run a Playwright check, and every finding below comes from reading the source. I did not look at the implementer's live checkout, other reviewers' reports or the design canvas. The diff has no untracked files and no Python extraction changes. The escaping of save data in the new markup looks correct: names go through `spEsc`/`attr`, and history-state values are checked before use.

## Must-fix

**M1. Opening Find a location from anywhere but a task or a Demand cell wipes the reader's finder filters.**
- **Where:** `ba_dashboard.py:25262` (`ROUTES["expansion/finder"].after`), `web/map.js:740-751` (`setFinder`), `web/map.js:1690-1702`.
- **Cause:** `after()` calls `openFinder({cat:"retail", type:"", hoods:null})` on every `openRoute`: browser Back/Forward, a reload on `#expansion/finder`, a boot with that route remembered, the Expansion masthead click when Finder was the last view, and the area row's Find a location link. `o.fromFinder` is never set anywhere, so nothing skips it.
- **Effect:** `setFinder` resets category, type, districts, layouts, size, capacity, traffic, `show` and sort, clears the selection, then `saveFinder()` stores the reset. A Demand cell's preset (its type and district) is lost on Back then Forward. This breaks both the route doc ("Finder filters and saved searches as before") and the plan's Back/Forward requirement.
- **Fix:** apply a preset only when the caller passes one. Otherwise show the map with the finder switched on and the filters untouched, for example a map.js entry that only sets `fs.on = true`.
- **Test:** set office, a district and a size range; go Overview, then Back; `cityMapPage.fs` is unchanged. Repeat with a reload on `#expansion/finder`, and with Demand cell → Overview → Back.

**M2. A promotion finding lands on Businesses › Results, not Standards.**
- **Where:** `ALERT_LINKS.promotion` at `:17707` → `reveal("secPortfolio")`; `SEC_PAGE.secPortfolio` is `["company","results"]` at `:17717`; route choice in `showPage` at `:25564-25566`.
- **Cause:** `routeNext` is `businesses/standards`, but `routeAccepts` rejects it because `sub.company` is `"results"`. The route falls back to `businesses/results`.
- **Effect:** the finding's Details says "Review promotion opens Businesses › Standards", but Results is the view that lights up.
- **Fix:** land promotion with `showSub("company","standards")` before revealing `secPortfolio`, which that view already shows via `data-sub="results standards"`. Alternatively, let `reveal` accept a section whose `data-sub` includes the requested view.
- **Test:** `goToAlert(promotion)` gives `route === "businesses/standards"` and the Standards link lit in `#localNav`.

**M3. The route-fed shortfall check also catches the import-short shortfall.**
- **Where:** `:18161`, `/^f\.shortfall\.route/`.
- **Cause:** the pattern also matches `f.shortfall.routed` (`ba_dashboard.py:11709`), which is the not-covered case: "…days before {arrives}'s import ({rate}/day beyond the {routed}/day a route brings)". Its fix is the import.
- **Effect:** that finding gets "Review delivery" and the Supply › Deliveries route. The landing is still the warehouse import row, and Warehouses is a valid scope for Deliveries, so the wrong view is lit.
- **Fix:** `/^f\.shortfall\.route(\.|$)/`.
- **Test:** `findingRoute` with key `f.shortfall.routed` gives `supply/imports`; with `f.shortfall.route` and `f.shortfall.route.paused` it gives `supply/deliveries`.

## Should-fix

**S1. Supply's List/Diagram toggle leaves the route behind.**
- **Where:** `:22891` (`sbPaintTools`): the setter doesn't call `routeSync()`.
- **Trigger:** switching Imports to Diagram keeps `#supply/imports` with Imports lit, and a reload brings back the list. Switching Goods flow to List keeps "Goods flow" lit. The next scope click then jumps to a different route.
- **Fix:** call `routeSync()` after a mode change when `page === "supply"`.

**S2. After a masthead visit to the Overview, the next live refresh re-ranks the list silently.**
- **Where:** `:25402` calls `ovForget()` on the push visit without redrawing.
- **Cause:** `ovOrder` stays null until the next `drawAlerts`. The next same-company refresh therefore runs `ovArrange` with `known = null`: a full re-rank, no "new" markers, no announcement.
- **Why it matters:** masthead → Overview is the most common return, and refreshes are frequent in watch and game-link mode. The plan requires stable order plus an announcement for new rows.
- **Fix:** redraw, or re-rank, right after `ovForget()` when the Overview is shown.
- **Test:** in `calm_refresh`, click Overview in the masthead, deliver a payload with an added finding; it appears at the end of its group with `.ov-new` and `#ovNews` shows.

**S3. Returning to a below-threshold or switched-off finding says it is gone.**
- **Where:** `ovSnapshot` and `ovArrive` (`:18282`, `:18298`) look only in `#alerts .find`.
- **Trigger:** rows in `#alertMinor` are bound through `bindFindingRows`, so they go through `ovFollow`. On return, "The finding you left from is no longer on the list…" is shown even though the row is on screen, and the position is not restored.
- **Fix:** include `#alertMinor .find[data-id]` in both lookups.

**S4. Masthead and local-nav counts go stale while the reader is away from the Overview.**
- **Cause:** `ovCritBadge` runs only inside `drawAlerts`, which is tagged `"today"` and so drawn lazily. `paintLocal` is not called from `renderAll`.
- **Effect:** during a same-company refresh on Supply or Staffing, the masthead "N critical" badge (on every page) and the "Staff needs" count keep their old values.
- **Fix:** add a `""` PAGE_DRAWS row that computes these counts cheaply and repaints them.

**S5. Back can reuse an outdated Overview snapshot.**
- **Cause:** `nxOv` is written only when a finding or task is followed.
- **Trigger:** follow finding A, come back, change the filters or open "Show more", leave through the masthead, press Back. The old filters come back, row A is outlined again at its old position, or the "gone" notice appears.
- **Fix:** snapshot on every departure from the Overview (in `showPage` when `from === "today"`), or drop `focus` once it has been used.

**S6. Office staffing lands on nothing.**
- **Cause:** only retail sites draw `#sp-roster` (`:21927`).
- **Trigger:** a `staff` finding at an office (`:17811`) and Schedules' "Open staffing" for an office (`:24845`) both land at the top of the office page with no ring.
- **Fix:** for offices, use the crew block (`ALERT_EVIDENCE.staff` → `#sp-crew`).

**S7. Banned word in new UI text.**
- `co.sched.empty` "No shifts to plan yet" (`:24835`) breaks the AGENTS.md vocabulary rule ("No 'roster', 'shift' or 'post'"). Something like "Nothing to schedule yet" fits.

## Missing regression coverage and docs

- `docs/archive/ui-route-migration.md` cites `tests/shell_routes.test.cjs`, which does not exist in this snapshot.
- Nothing checks that:
  - `FINDING_ROUTES` covers every `ALERT_GROUPS` id and names a real `ROUTES` entry;
  - each kind's landing ends on its route or the documented fallback (this would have caught M2 and M3);
  - the finder keeps its filters across Back, reload and area re-entry (M1);
  - the List/Diagram toggle syncs the route (S1);
  - order stays stable across a masthead visit followed by a refresh (S2).
- `docs/architecture.md` (the pages and views tables, the PAGE_DRAWS example `"company/payroll"`, the Registries SUBS row) still describes Today, Company › Payroll and Next moves.

## Optional

- An old `#today` entry reached by Back goes through `showPage` rather than `openRoute`, so `ovArrive` never runs and the Overview's state isn't restored. Resolving `today` through the overview route while keeping the typed hash would fix it.
- "Show N more" folds rows before the severity filters apply. Filtering to opportunities only can leave an empty list with only "Show 9 more" and no filtered notice.
- Opening Standards sets `view = "ops"`, so Results' portfolio stays on Operations afterwards.
- A Supply landing shows both the `sb-crumb` and the arrival strip, two ways back.
- The Ask-the-board "staff" question opens the site page under Businesses, while the search's Schedules entry uses Staffing.
- `ovAtFactory` depends on `D.supply`. Without it, a factory's `staff` finding goes to the schedule route and lands at the page top.
- Several existing keys changed their English (`today.crumb`, `today.alerts.none`, `nav.search.*`). The i18n tooling now treats those German translations as stale and shows English, so German is mixed until the chunk-3 translation pass. That's expected, but note it for acceptance.
