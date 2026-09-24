# Site pages and search: design notes

Canvas: https://claude.ai/artifact/WB6N6i3xaFJ2A1bUnBEvL3 (draft, not approved).
Generator: `build_site_search_canvas.py` writes `project/`. Never hand-edit `project/`.
The stylesheet is read from `ba_dashboard.py`'s `TEMPLATE` plus `web/map.css` and
`web/wiki.css` at build time, so a rebuild picks up the live look. The numbers are modelled
on the HART. YT save and typed into the generator. No save is read at build time.

Brief: UX audit of 24 Sep 2026, R9 (site pages with an address), R10 (board-wide search),
R11 (Ask the board). R9 and R10 ship as one feature.

## Decisions for Peter to confirm

1. **Route key.** `#site/57-fifth-avenue`, a slug of the address, not the raw key
   `ba:street_fifthavenue#57`. It is readable and unique per building. If two sites ever
   share a slug, the second gets the key-derived slug.
2. **The nav while a site page is open.** Company stays lit, because the portfolio lives
   there.
3. **Head changes.** The prev / select / next picker moves out of the site head into a crumb
   row above it. The close ✕ is gone and "‹ Portfolio" replaces it. The blocks themselves
   are unchanged.
4. **Arriving from a finding.** The back crumb names where you came from ("‹ Today") and acts
   as browser Back. The trail after it still reads Portfolio › chain › site.
5. **Chain crumb.** Factories and depots show "Factories" or the chain name as their middle
   crumb. The live portfolio files a factory under the chain it supplies, and the portfolio
   files depots under "Head office and support" today. Pick one word.
6. **Link look.** A site name looks like plain text until hovered. On hover it gets an
   underline and a tooltip, "Open its page". Only the name opens the page. The rest of a
   finding row still opens the finding's view, and the map button keeps its job.
7. **Map card and places list.** The unlabelled arrow becomes a labelled "its page" button.
8. **Search field placement.** The field sits between the nav and the clock. `/` or Ctrl+K
   opens it. Below about 1100 px it becomes an icon, and on a phone the icon opens a
   full-screen sheet. The sphere now rests between the nav and the field, so `wireSphere()`
   has to treat the field as an obstacle.
9. **Group order.** Results are grouped and the best group comes first. On a tie, your own
   sites rank a little higher and the wiki a little lower. Each group shows 4 results on
   desktop and 3 on a phone, then "n more".
10. **Synonyms.** A synonym match shows a small `≈ hire` chip beside the real name. The
    synonym list lives in the index (see Porting). "break even" goes to the Portfolio with
    the plain note that there is no break-even figure yet.
11. **Search empty state.** It shows the seven questions and the last three places you
    opened.
12. **No results.** The sphere looks left and right, then a "?" appears. Three ways on: a
    near word, "Browse the wiki", and "Tell us what you looked for", which is the existing
    Bugs and feedback link.
13. **Ask the board.** One row of text links sits under Next moves: seven questions, with no
    `/` hint in the row. The dot rolls to the question under the pointer. After the first
    question has been used, the row folds into an "Ask the board /" button in the Next moves
    head, which opens search on its empty state. The collapse is stored under
    `ba_dash_ask_used`.
14. **Where the questions land** (all existing views, lit with the site panel's lighting
    rule):
    - Why did profit move? → Company › Results, the portfolio sorted by Wk / wk.
    - Where should I open next? → Map › Find a location.
    - Is my factory fed? → Supply › Checks › Feed the factories. After R8 this could land on
      the one factory with a finding instead.
    - Whom should I hire? → Staffing on the shop the Optimize staffing card picks. After R14
      it becomes the company-wide Staff list.
    - Are my prices right? → Wiki › the guide for your biggest shop type › Prices in your
      save.
    - What should I import this week? → Supply › Orders › Change checklist.
    - What am I playing on? → Company › Milestones, with the settings lit. After R15 it
      goes to wherever the settings move.
15. **Landing strip.** On arrival, a strip reading "You asked: …" sits on top with "‹ Back to
    Today" and "Ask another". The answer block is outlined and tagged "the answer", and the
    rest is dimmed.
16. **Phone rules the canvas assumes.** These are not in the board yet: KPI tiles 2×2 (R5), a
    finding row with the site on its own line, stacked duos, and sideways scrolling inside
    the hour grid, the day plan, the lines table and the shelves table. The site panel has
    had no phone layout until now.
17. **Finding titles carry the item variant**, for example "Fabric (Expensive)". That is R2;
    the canvas assumes it has landed.

## Porting map

All anchors are in `ba_dashboard.py` unless noted. Find them by anchor, not by line number.

### R9: site pages with an address

- **Routing:** `pageFromHash(`, `openHash(` and the `hashchange` listener learn
  `site/<slug>`. `openSite(key, scroll, finding)` pushes `#site/<slug>`, and `closeSite()`
  goes back to `#company`. Boot calls `openHash` as it does now, so a reload reopens the
  site.
- **One page at a time:** `showSub(` sweeps `[data-sub]`. While `siteOpen`, it also hides
  `secDaily`, `secRhythm` and `secPortfolio`. `drawSite(` already owns `#secDetail`.
  `SEC_PAGE.secDetail` stays `["company","results"]`.
- **Head:** in `drawSite(`, the `.sitehead` aside (`#sitePick`, `#siteClose`) moves into a
  new `.ss-crumbs` nav rendered above `.sitehead`. `drawSitePicker(` renders into it
  unchanged. `spHomePanel` gets the same crumb row.
- **Arrival:** `goToAlert(` already passes the finding id. It also sets a "came from"
  label for the crumb (Today, Checks and so on).
- **Links:** one helper, `siteLink(b)` (unique name; `siteKey` and `siteTab` exist), next to
  `mapButton` (`web/map.js`). Where it goes:
  - `drawAlerts(` `.site`: `finding-link` → `siteLink`; synthetic sites stay plain text.
  - `drawStock(` shop, depot and factory cells.
  - `drawFlowDetail(` header.
  - `drawPortfolio(` rows: the click sets the hash.
  - The `drawSite(` sub-line: "supplied from".
  - The factory Inputs "From" column.
  - `web/map.js`: the card's `.go2` gets a label, and the places list and the finder's
    "(you)" rows get links.
- **Tests:** `tests/navigation.test.cjs` needs cases for the new route. Anchor-slicing tests
  near `openSite` and `showSub` need to follow the move.

### R10: search

- **Markup:** a `.ss-q` button in the `TEMPLATE` masthead between `#nav` and `#clock`, and a
  palette `<dialog>` hung off `<body>` (the `#tip` / `#alertPop` rule: never inside a
  section).
- **Script:** one block in the board script. Every top-level name starts with `search` or
  `ss`, unique across the board, `map.js` and `wiki.js`. The index is built on first open
  from data already on the page:
  - Pages and views: `PAGES`, `SUBS`, `SEC_PAGE`, plus a hand-kept synonym table next to
    `ALERT_GROUPS`.
  - Sites: `D.businesses`.
  - Products: `D.products`, `D.supply.factories` needs and `D.supply.idle`.
  - Finding kinds: `ALERT_GROUPS` and `ALERT_LINKS`, with live counts from `D.alerts` and
    `D.minor`.
  - Find-a-location presets: `premises().demand` types (`web/map.js`).
  - Wiki: the `wikiIndex(` data from `loadWikiData()`, so the wiki group appears once it has
    loaded.
- **Matching:** exactly `search()` / `_score()` in the generator. The live artboard runs the
  same code in JS.
- **Keys:** `/` and Ctrl+K on `document`, ignored while focus is in a field. Arrow keys,
  Enter and Esc are handled inside the dialog. Opening an entry reuses `reveal(`,
  `openSite(`, `showPage(` and `showWikiRoute(`.
- **New classes:** `.ss-q`, `.ss-kbd`, `.ss-pal`, `.ss-scrim`, `.ss-in`, `.ss-res`, `.ss-grp`,
  `.ss-gh`, `.ss-row`, `.ss-side`, `.ss-go`, `.ss-tag`, `.ss-dot`, `.ss-syn`, `.ss-more`,
  `.ss-foot`, `.ss-say`, `.ss-q2`, `.ss-hint`, `.ss-none`, `.ss-ball`, `.ss-chip`,
  `.ss-sheet`, `.ss-cancel`, `.ss-back`. Copy them from `SS_CSS`.

### R11: Ask the board

- **Markup:** `.ss-ask` after `.moves` in `#secMoves`. When collapsed, `.ss-askmini` goes in
  the `#secMoves` sechead aside.
- **Script:** each question maps to `{sec, into, sub}` and reuses `reveal(secId, "push",
  into)`, plus a `.ss-asked` strip above the page and an `.ss-lit` / `.ss-dim` pair on the
  target. The strip clears on the next navigation.
- **New classes:** `.ss-ask`, `.ss-asklead`, `.ss-aq`, `.ss-roll`, `.ss-askmini`,
  `.ss-asked`, `.ss-lit`, `.ss-dim`.

### Shared

- New classes also used by R9: `.ss-crumbs`, `.ss-crumb`, `.ss-trail`, `.ss-pick`, `.ss-sl`.
  Canvas-only classes, not to be ported: `.ss-addr`, `.ss-snips`, `.ss-snip`, `.ss-cap`,
  `.ss-lead`, `.ss-flow`, `.ss-node`, `.ss-wire`, `.ss-detail`, `.ss-card`, `.ss-places`,
  `.ss-tipdemo`, `.ss-pagego` (the map card button can reuse this).
- **Payload:** none. Everything above reads keys that already exist.
- **Changelog:** one entry for R9 and R10 together, "every site has a page; search the
  board". R11 counts as part of the same feature.
