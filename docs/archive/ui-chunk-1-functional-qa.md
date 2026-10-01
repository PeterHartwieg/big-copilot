# Independent functional QA — chunk 1 candidate 356af7b

26 September 2026. Read-only review of `C:/Users/Peter/.codex/worktrees/ui-redesign-review/Big Ambitions` using headless Edge/Playwright. All data was synthetic. The candidate stayed clean (`git status --short` empty); all scripts, fixtures, logs, and screenshots are in this directory.

## Verdict

Two route defects need correction before chunk 1 meets its route contract. Core navigation, queue restoration, old links, no-save guide, and the browser-hosted synthetic load otherwise worked in this review.

### F1 — Site landings discard their originating view (Major)

**Reproduce:** Load `cli.html` from the day-47 synthetic payload. From Overview choose **Check prices and product sales**, then select either HART. Spirits or HART. Gifts under “Prices at a shop.” The site page opens at its Shelves block, but the active view and in-memory route are **Businesses › Results**, although the entry was **Businesses › Products & prices**. The two shops show different products (Beer versus Umbrella/Gift (Cheap)), so this is not a sample-specific route.

The same mechanism affects finding actions. Expand the warnings and choose **Review delivery** on the Gift (Cheap) wholesale finding: its action href is `#supply/deliveries`, but the site page opens under **Businesses › Results**. A synthetic depot top-up finding similarly loses `supply/deliveries`, and a synthetic shop “Nobody staffed” finding loses `staffing/schedules`. The relevant existing site block does open; the incorrect active destination breaks the promised task/scope context. The history entry retains `nxRoute=businesses/prices` for a price card, but the immediate route is Results; after Forward/reload the in-memory route recovers while the local navigation still highlights Results. Back returns to the originating page.

**Expected:** A site page opened by a task or finding remains under that route, as specified by `docs/archive/ui-route-migration.md` (“A site's page keeps its address” and “stands under whichever route opened it”). The route's area/view must remain active on Back/Forward and reload.

**Cause:** `routeOpenSite()` supplies the route, and `openSite()` initially applies it. Then `ssOpenSite()` calls `xlArrive()` at `ba_dashboard.py:26755`; `xlArrive()` calls `reveal("secDetail", "push", sel)` at `ba_dashboard.py:21429`. This repeats `showPage()` after `routeNext` was consumed, replacing the route with `businesses/results`. A runtime trace in `route-trace.js` shows the first `showPage` leaves `businesses/prices` intact and the second changes it to Results.

**Evidence:** `prices.json`, `journeys.json`, `matrix.json`, `wholesale-wrong-route.png`, `route-trace.js`. The route matrix covers all 31 finding kinds with synthetic rows; shop staff, top-up, and wholesale are the affected site-landing examples. `price-history.json` records Back/Forward/reload for a price card.

### F2 — Promotion action opens Results instead of Standards (Moderate)

**Reproduce:** On the populated day-47 Overview, expand warnings and click **Review promotion** for HART. Gifts. The action advertises `#businesses/standards`, but the address and active view become `#businesses/results` / Results. The portfolio is switched to Operations, so promotion evidence is present, yet the stated final route is not selected.

**Expected:** The finding opens Businesses › Standards and exposes the promotion comparison, per `docs/archive/ui-route-migration.md`.

**Cause:** `ALERT_LINKS.promotion` at `ba_dashboard.py:17707` reveals `secPortfolio`, mapped to Results. `reveal()` selects that host view, so `routeNext = businesses/standards` is rejected by `routeAccepts()`.

**Evidence:** `promotion-wrong-route.png`, `journeys.json`, `matrix.json`.

## Coverage and passing behavior

- **13/13 All tools tasks:** clicked from rendered Overview without Search. Each reached its named route and showed an “All tools / You came from …” strip. Imports, Deliveries, Production, Goods flow, Schedules, Staff needs, Payroll, Results, Prices, Standards, factory planning, Demand, and Finder displayed their mapped interim content. Finder was rerun with local map assets and showed its filters and saved-search control. Evidence: `journeys.json`, `finder.png`.
- **31/31 finding kinds:** exercised a synthetic route matrix through actual DOM action clicks. Two normally disabled kinds, hype and idlestaff, were enabled for the matrix. Five route mismatches appeared: the four cases covered by F1/F2 plus company-wide staff demand falling back to Payroll without a representative site, which `docs/archive/ui-route-migration.md` expressly permits. The populated day-47 fixture also supplied 17 real extracted findings across 12 kinds; Promotion and wholesale reproduced there. Matrix-only rows do not establish that every exact product/contract row is lit for data absent from that fixture. Evidence: `matrix.json`, `journeys.json`.
- **History and return:** an expanded warning list with open Details and a severity filter survived Back, Forward, and reload. From a lower warning at 1,343 px scroll, the arrival strip's return restored the row at the same viewport position and kept Details open. Removing that finding in a newer synthetic snapshot yielded “The finding you left from is no longer on the list with the latest numbers.” Evidence: `journeys.json`, `return.json`, `return-restored.png`, `return-gone.png`.
- **Long queue and refresh:** 65 critical rows were all present. The sticky jump appeared after scrolling; keyboard focus moved to the All tools heading. A new critical finding was appended after existing rows on refresh and announced, preserving the old first/last order. The phone-width (390 px), reduced-motion keyboard test exposed all five main destinations, had no horizontal overflow, and Enter on All tools moved focus correctly. Evidence: `long-queue-sticky.png`, `states.json`, `phone-imports.png`.
- **Aliases and no-save:** 15 old page/section/site/wiki hashes resolved in a rendered page. With `render(None)`, main data pages were disabled and Game guide opened without a save. Evidence: `journeys.json`, `no-save-guide.png`.
- **Browser-hosted path:** a synthetic `.hsg` loaded through the built `web/index.html` and local Pyodide worker into a populated Overview; Imports then opened with its arrival strip. A single 404 was an uninspected ancillary request and did not affect the journey. Evidence: `webhost.json`, `web-loaded.png`, `synthetic.hsg`.
- **Company/missing data:** replacing the snapshot with a second synthetic character/name produced only that company's finding, with no previous rows. Empty Overview reported no urgent issue and explained unavailable game-text checks; a severity-filtered empty view stated that findings were hidden. Evidence: `states.json`, `filtered.png`.

## Limits

I did not run the full suite or test real saves, game-link writes, a physical phone, or every precise finding evidence row. The company-switch check replaced the board payload in a CLI-rendered browser page; it did not test separate browser save files or persisted progress/preferences. Static CLI pages cannot exercise the live source's stale signal; the browser-hosted smoke used a successful load only. These do not change the two reproduced route findings.

