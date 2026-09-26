# Goods flow on a phone: design notes

Issue #148 (UX audit U1). Supply's diagram view draws `svg#flow` (`drawFlow()` in the
`TEMPLATE` board script) as a 1,184-unit artboard scaled to its box. On a 390 px phone that is
about 294 px wide: labels a few pixels tall, nodes too small to tap.

Canvas: https://claude.ai/artifact/E9vHwuVKdao6mRKa8oPQ57. The generator is
`build_goods_flow_canvas.py`; rerun it and never hand-edit `project/`. `--preview` writes plain
HTML copies into `_preview/` (both themes).

The company on the artboards is HART. YT on day 80, read from that save's supply graph: 2
importers, Import Hub, 3 factories, 3 distribution depots, 19 shops on a morning round and 4
that no pipe reaches. The stalled Metal Band at Factory Jewelry is staged from the audit's Feed
the factories screenshot of the same save. The small company and the empty state are made up.

## The three directions

**Recommended: the chain.** The four columns turn into stages from top to bottom, in the
order the goods travel. A rotated label on the left names each stage, and the pipes run
between the stages as they do on desktop (dashed for the weekly import, width by volume). A
card is 100 to 170 px wide, tall enough to tap, and names its site in 12.5 px type. When a
depot feeds four or more shops, they fold into one group card per depot ("7 Clothing shops ·
8,952 a day"). Tapping it lists them under the band. Tapping a site follows it: what comes in
sits above it, what goes out sits below, each neighbour card carries its pipe's units a day,
and the facts worth a look are written out in words. A "worth a look" strip at the top gives
each flagged site one tap. Artboards: Main, ChainGroup, ChainFocus, ChainDepot, ChainUnfed,
ChainSmall, ChainEmpty, ChainTablet.

**A: pan and zoom.** Keeps the desktop picture and adds pinch, drag and + / − / fit
buttons, with a sheet for the tapped site. Fitted it is the 294 px problem again. It only
becomes readable at about 90 %, where one column and a half fit, so following a pipe from an
importer to a shop takes four or five drags. The Import Hub's pipes run backwards to the
factories, which is hard to follow through a small window. Artboards: PanFit, PanZoom.

**B: site list.** Every site in a list by stage, with "from" and "to" under each. Tapping one
lists its connections with units a day. It is readable, but it repeats what Supply's List view
already is, and it loses the only thing the diagram adds, the shape of the chain. Artboards:
ListOverview, ListOpen.

## Why the chain

- Nothing needs zooming. Every name, figure and flag is at body size at 390 px. Every card and
  chip is a 44 px target.
- It keeps what the diagram is for: the shape of the chain and which pipe feeds what. A phone
  scrolls down easily and sideways badly, so the stages go down the page.
- Flow order makes the Import Hub readable. On desktop it sits in the Depots column and its
  pipes run back to the factories. In the chain it sits between the importers and the
  factories, where its goods go.
- A tap follows the site instead of leaving the diagram. On desktop a click opens the site's
  rows in the list (`sbNodeOpen()`). On a phone, being able to walk the chain is worth more,
  and the rows are one button away ("Its 6 rows").
- Problems read in words ("1 stalled", "Metal Band: Import Hub holds 11,640, yet 1,471 of the
  2,160 the machines need a day arrive (68%). It isn't reaching the factory."), not as a 4 px
  dot.
- It scales to a tablet. At 768 px the same chain has wider cards (ChainTablet). The desktop
  picture only reads at about 0.8 scale and up, which needs a box about 950 px wide.

Desktop is unchanged.

## Decisions for Peter

1. **Direction.** The chain (recommended), A pan and zoom, or B site list.
2. **Stage order.** Flow order puts the Import Hub between the importers and the factories,
   so Depots appears twice. The alternative is fixed type order (Importers, Factories, Depots,
   Shops) as on desktop, where the Hub's pipes would run upward.
3. **What a tap does.** Follow the site, with "Its N rows" and "Site page" buttons
   (recommended). The alternative is opening the rows at once, as desktop does.
4. **Grouping threshold.** A depot feeding 4 or more shops folds them into a group card;
   3 or fewer stay separate cards (ChainSmall).
5. **Shops no pipe reaches.** The save has 3 gyms and Evil Genius on the diagram with no
   pipe in. The chain gathers them in one dashed card, "4 shops no pipe reaches". Is that the
   wording, and should they be on the diagram at all?
6. **Breakpoint.** Draw the chain whenever the diagram's box is narrower than about 950 px
   (phones and portrait tablets). Wider boxes keep the desktop picture.
7. **Colouring the problem pipe** (amber in ChainFocus). The graph's links carry a product
   count, not the products. To colour the exact pipe, `_supply()` would add the slugs to each
   link (a payload change). Without that, the chain colours a pipe only when it is the site's
   only inbound one. The dot and the words work either way.
8. **Empty state copy.** Today the diagram box is simply hidden when there are no nodes.
   ChainEmpty proposes "No goods move between your sites yet" plus a line and a wiki link.

## Porting map

Board script (`TEMPLATE` in `ba_dashboard.py`):

- `drawFlow()`: when `#sbFlowBox` is narrower than the breakpoint, hide `svg#flow` and fill a
  new sibling `div#flowChain` instead. Leave `svg#flow` in the DOM: `sbPlaceFlow()`,
  `sbFill()` and several tests move and count the one svg. The PAGE_DRAWS row that calls
  `drawFlow()` stays as it is. Redraw when the width crosses the breakpoint (a
  `matchMedia` listener).
- New `flowStages(graph)`: rank each node by its longest path from a source over
  `graph.links`. Put unlinked shops in the "no pipe reaches" group and unlinked non-shops at
  the end of their type's stage. Group a depot's shops from 4 up. Break ties explicitly, the
  way `_chains()` does (AGENTS.md traps).
- New `drawFlowChain()` for the overview and `drawFlowFocus(id)` for one site. Reuse
  `flowFacts()`, `flowCountText()`, `szCount()`, `flowSub()`, `shortText()` and the
  `sb.flow.*` keys. New strings get `sb.flow.chain.*` keys through `tt()`.
- Focus state: reuse `flowPickId`, which already survives redraws and is dropped when the node
  disappears (`applyFlow()`). A chain card sets it; the "Whole chain" crumb clears it.
- Wiring in `bindFlow()`: `.sb-fc-node[data-id]` sets the focus, `[data-sb-fc-group]` opens a
  group, "Its N rows" calls `sbNodeOpen(id)` and "Site page" calls `openSite(key)`.
- The legend is the `.sb-flowleg` markup. At phone width its last span says "Tap a site to
  follow its goods".

CSS: new classes use the prefix `sb-fc-` (Supply flow chain), scoped under `#pageSupply`, as
the other `sb-` classes are. The canvas's `gf-` classes map one to one: `gf-node` becomes
`sb-fc-node`, `gf-band` becomes `sb-fc-band`, and so on. Its `gf-d` dot shows why the board's
global `.dot` (the wordmark's dot) must never be reused.

Python: nothing, unless decision 7 adds `slugs` to each link in the `graph` built in
`_supply()`. That follows the payload-key checklist in `docs/architecture.md` (Registries).

Tests:

- New `tests/flow_chain.test.cjs`: stage ranks (the Hub between importers and factories),
  grouping at 4, the no-pipe group, focus in and out, and `flowPickId` dropped for a vanished
  node. It slices `drawFlowChain`/`flowStages` out of the template as the other Node tests do.
- `tests/import_routes.test.cjs` counts `#flow` and clicks `#flow .node[data-id]`: keep those
  on a desktop viewport and add one phone-viewport case that taps a chain card and reaches
  the rows through "Its N rows".
- `tests/hostile_names.test.cjs` and `tests/game_names.test.cjs` check names inside flow boxes.
  Add the chain card (a Japanese name clamps to two lines, a `<bc-xss>` tag is escaped).
- `tests/layout.test.cjs`: no horizontal scroll on Supply at 390 px with the diagram on.
- Then `python -m unittest discover -s tests`, `node --test tests/*.test.cjs` and
  `python build_web.py`, per AGENTS.md for a `TEMPLATE` change.
