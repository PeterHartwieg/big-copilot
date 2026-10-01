# Plan a factory: Add product (issue #162)

Canvas: https://claude.ai/artifact/1umR95CFzK6HGHQB7Y5ixv (Design type). Generator:
`build_secondary_canvas.py`. Never hand-edit `project/`. `--preview` writes plain HTML to
`_preview/` (both themes); do not commit `_preview/`. The Artifact tool refuses a root inside the
worktree, so publish from a scratchpad copy of `project/`.

Unlike the older canvases, the generator reads the board's real stylesheet out of `TEMPLATE`, so
the sidebar, tiles, range and Ingredients table are the shipped classes. New classes are `pc-`
(unused on the board).

Example: an invented company with four Florists and a flower factory already running. A Florist's
main products are the two flowers. The game's list adds Soda Can 80%, Energy Drink 80%,
Umbrella 75%, Gift (Cheap) 60% and Gift (Expensive) 60%.

## Artboards

- **A · Main**: the page with Umbrella added. Its Metal Wire and Plastic show up as new orders
  under Ingredients, and the tiles and "Machines to buy" include it. It is interactive: type a
  rate, step machines, × removes the line, and Add product › Umbrella brings it back.
- **B · States**: the range alone, in four states: closed, picker open, added with a typed rate
  (40), and the picker after one add.

## Decisions for Peter to confirm

1. **Control**: a dashed "Add product · N more" button as the range's last row, not a column or
   a header control. It opens a menu titled "A Florist also sells".
2. **Weight in the picker**: the game's `i` value is shown as a percent with a small bar, under
   a column called "Weight". Its tip says "a main product is 100%". The list is sorted by
   weight. An added product stays in the list, ticked and disabled. Removing it is done with
   the × on its line, not in the menu.
3. **Rate field**: it sits in the line's Supplies cell under the coverage figure, as
   `[110] /shop/day · your estimate`. The number and the words "your estimate" are blue (info),
   and the input has a dashed underline. The tip on "your estimate" gives the reason once.
   Nothing else lectures.
4. **Default rate**: the type's measured per-shop rate times the game's weight, rounded to 10
   (150 × 0.75 → 110). The alternative is a flat figure. Peter asked for a "neutral default",
   so he should pick one.
5. **Measured beats typed**: if the player's shops of the type already sell the product, the
   line uses the measured rate and shows no field, like a main line. This is not drawn.
6. **No shops of the type**: no rate field. Supplies shows "—", as the main lines do today.
   This is not drawn.
7. **Main lines are never removable.** Only added lines get the ×.
8. **Persistence**: added products and typed rates are kept per type for the session, the same
   way `planCounts` is (proposed: also in localStorage under one key, as the finder's saved
   searches are). Changing type keeps each type's own additions.
9. **No recipe**: every secondary product in today's data has a recipe. If one ever lacks a
   recipe, it gets the existing "bought in" row.

## Porting map

- Python `_plan()` (catalogue block near `_type_catalogue_from_help`): add
  `catalogue[kind]["extra"] = [[slug, weight], ...]` from `ba_store_rules.json`
  `types[kind].i`, keeping entries with weight < 1 that are not already in `products`, sorted by
  weight. Through `load_store_rules()` lazily: never at import. `own[kind].perDay` currently
  drops anything outside `products` (`planable`), so let the `extra` slugs through as well,
  which gives decision 5. The payload snapshot and `tests/test_doc_registries` payload table
  will move.
- Board script, `/* --- plan a chain`: add state `planExtra = {type: {slug: rate|null}}`. In
  `drawPlan()`, map the lines over `products` + the added slugs. An added row gets
  `class="line pc-added"`, `data-pershop` (typed or measured) and the `.pc-x` button, and its
  Supplies cell gets `.pc-rate`. The `.pc-addrow` row goes last in the tbody. `data-products`
  counts the added lines too.
- `planDraw()`: per-line `data-pershop` overrides the host's (`wantWeek` and `peakDay` per
  line). Today every line uses the type average, so this is the one arithmetic change. The
  Made tile tip sums each line's own take instead of `wantWeek * products`.
- `bindPlan()`: handle the `.pc-add` toggle, `.pc-opt` pick, `.pc-x` remove (each redraws with
  `drawPlan()`) and `input` on `[data-pc-rate]` (store the value and call `planDraw()` only, so
  focus stays put).
- The picker popover hangs off `<body>` with `position:fixed`, as `#alertPop` does
  (`section{content-visibility:auto}` clips it otherwise). It closes on Escape and on an outside
  click.
- CSS: the `pc-*` rules in `PC_CSS`, minus the canvas-only `.pc-board` and `.pc-state*` rules.
- Text: `tt("gr.plan.add", "Add product")`, `gr.plan.addMore` ("{n} more"),
  `gr.plan.alsoSells` ("A {type} also sells"), `gr.plan.weight` and its tip,
  `gr.line.remove`, `gr.line.rateUnit` ("/shop/day"), `gr.line.rateYours` ("your estimate")
  and its tip.
- Tests: `tests/test_open_store`-style unit test for `extra`, and a Node test that adds a line,
  types a rate and checks Supplies and the Ingredients rows. Then `python build_web.py`.
