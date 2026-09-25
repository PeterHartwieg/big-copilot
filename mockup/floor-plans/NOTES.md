# Floor plans in the finder (issue #70): design notes

Canvas: https://claude.ai/artifact/QFNRZLS49MUh1t7jCN7uKF (Design type). Generator:
`build_canvas.py`; never hand-edit `project/`. `--preview` writes plain HTML to `_preview/`
(both themes) for screenshots in a browser.

Inputs: `plans/*.png` are the 24 finder layouts rendered from the game's own layout prefabs
(`research/floor-plans/` in the main checkout, 24 px a metre). `make_plans.py` turns them
into `plans.json`: one SVG path of merged rectangles for each colour, plus a count of doors
on the outside wall and of bays. `project/stage.jpg` is the map backdrop, rendered from
`web/maps/map-background.svg` by `render_backdrop.cjs`. Sample rows are vacant retail in
Murray Hill and the Garment District from `mockup/find-location/data.json` (HART. YT, day
20). Which version each address has is a stable hash, because no shipped file has `v` yet.

## Peter's decisions (25 Sep 2026)

These settle the open questions below; where they disagree with the rest of this
file, they win.

1. **Comparing: option B**, the layout shelf: all of the kind's layouts at one scale,
   the hovered row's layout lit, and a click on a tile filters the list to that layout.
2. **Phone: 4A**, a Map / Plan switch in the map window.
3. **Orientation: as stored.** The plans are shown in the prefab's own frame, not turned
   to the street, with no street marker.
4. **Card details:** keep the loading bay count. Drop the outline in metres and drop the
   door swing lines.
5. **Vector plans in board colours** (theme-aware), not screenshots.

## As ported (branch floor-plans)

- Generator: `make_floor_plans.py` at the repo root (owner-side, UnityPy) replaces
  `make_plans.py` + `research/floor-plans/render_plans.py` for the shipped file,
  `web/maps/floor-plans.json`. It draws from the prefabs directly, one plan a structure
  (21, keyed `C2`, with a `kinds` table), not one a kind and layout (24).
  `make_plans.py` and `plans.json` here still feed this canvas only.
- Versions: `make_buildings.py --versions` reads `BuildingVersion` into
  `ba_buildings.json` as `v`; `_premises()` carries `layout` for retail, office and
  warehouse rows.
- Door swings: the door leaves (door meshes lower than 2.8 m, drawn standing open) are
  left out; the opening in the wall module stays.
- The grey block in H3 (and one in I3) is `SM_Negative Space Loading Dock`, a sunken
  dock about 24 × 7.3 m and 1.9 m deep. It is drawn as a bay, so every warehouse's bay
  count still equals its loading doors.
- The shelf replaces the single card, as on the canvas. The card's details (Picked /
  Hovered, code, kind and size, address, m², cap, entrances or loading bays, the `?`
  legend) sit in a line above the tiles, so there is one dock, not two. Tiles say
  "N listed" rather than "N here". Warehouses wrap onto two rows of six.
- The phone's Map / Plan switch sits bottom-left of the map window, not top-right, so it
  never covers the site card's close button.
- Bays are the ground showing through, so the legend says "gaps in the floor" rather
  than naming a colour that differs by theme.
- A `New` badge (id `floor-plans`) sits on the Find a location switch until it is used.

## Simplified after release (Peter, 25 Sep 2026)

The dock took too much of the map. It is gone, with the shelf, the hover lighting and the
Map / Plan switch. A picked building's plan now sits in its site card, under the facts:
one plan with its layout code and entrances (loading bays for a warehouse), scaled to the
card's width and at most 160 px tall. Find a location gained a Layout filter: a chip for
each layout key of the kind, several at once, saved with the other filters.

## The idea in one line

The empty map area left of the panel gets one docked card, bottom-left, that shows the plan
of whatever row you hover and falls back to the one you picked. It sits in the same place for
every row, so scanning the list reads like flipping pages.

## Decisions made without Peter

1. **Vector, not screenshots.** The renders have five flat colours and no anti-aliasing, so
   each becomes a single path of rectangles. All 24 plans come to 67 KB of JSON in total.
   Screenshots are 176 KB of PNG and cannot follow the theme. The plans use the board's own
   tokens: floor is ink at 15% over the surface, walls `--ink-2`, windows `--info`, doors
   `--accent`, and bays show `--ground` through. This replaces owner step 2 of the triage
   comment (24 hand-made screenshots). Step 1, adding `v` to `ba_buildings.json`, is still
   needed.
2. **Docked bottom-left, 442 × 214, the same place every time.** When a row is picked, the
   map pans the footprint to a fixed spot above the card (about 205, 205 in the stage), so
   the site card opens beside it and never overlaps the plan card. This changes the pan
   target in `web/map.js`: today the building is centred on the stage.
3. **Hover previews, the pick stays.** Hovering a row swaps the card to that row, shown with
   a hollow dot and "Hovered". Leaving the list brings the picked row back, with a filled dot
   and "Picked". The map does not pan on hover; only the footprint lights, as it does today.
4. **What the card says:** the layout code (large, mono), then kind and size, the address,
   and three numbers: m², cap and entrances. m² and cap are the game's figures for the size,
   the same ones the row shows. Entrances are doors on the outside wall; warehouses show
   loading doors instead. It also has a scale bar and the outline in metres. The legend is a
   `?` tooltip on the card and is not drawn on it.
5. **One scale rule.** Each plan fits its box but is capped at 10 px a metre, so an A1 is
   never drawn as big as an M1. The scale bar is the first of 1, 2, 5, 10, 20 or 50 m that is
   at least 36 px long.
6. **Layout tag in each row.** The code (C1, A2…) starts the row's second line. A row with no
   plan has no tag.
7. **No plan means no card**, with no placeholder and no "no image" text. A hover on a row
   with no plan leaves the picked plan in place, so there is no empty flash. Cinemas and
   theatres always look like this, because they are outside the 24 layouts.
8. **Phones have no hover.** The map window gets a Map / Plan switch once a row is picked
   (4A, recommended), so the plan uses the same window the desktop uses. 4B opens the plan
   inside the picked row instead; it takes list height but keeps the map visible.
9. The map stays dark in both themes, as it does today, and the cards follow the theme. The
   canvas `dark` toggle switches every artboard.

## Artboard 2: comparing. Two options; I recommend B

- **A · Pin plans side by side.** "Pin to compare" on the card. Up to three pinned plans sit
  in a tray at one shared scale, with the hovered or picked plan in a dashed slot at the end.
  Pinned rows show a pin after the address. It compares specific candidates, but adds pin
  state, a tray lifecycle and a limit of three.
- **B · The kind's layouts on a shelf (recommended).** A kind has only 6 retail, 6 office or
  12 warehouse layouts, so the dock shows all of them at one scale. The hovered row's layout
  lights up, the picked one is filled, and each tile says how many listed rows have it.
  Clicking a tile keeps only that layout in the list (a "Layout C2 ×" chip appears in the
  filters), which gives the player a filter they did not have before. The numbers are
  already compared in the list's columns; the shelf compares the shapes. It needs no new
  state beyond a filter, and it teaches all the layouts at a glance. Warehouses wrap onto two
  rows of six.

B can replace the single card or sit under it. On the canvas it replaces it. If Peter wants
both, the card goes above the shelf, and the site card area gets tight at a 720 px stage.

## Open questions for Peter

1. **Compare: A, B, or neither** for a first release? (Recommendation: B, with the single card
   from artboard 1 dropped in favour of the shelf, or both if the height allows.)
2. **Phone: 4A (Map / Plan switch) or 4B (plan in the row)?** (Recommendation: 4A.)
3. **Orientation.** The plans are in the prefab's own frame, which is unverified against the
   street. Retail fronts (glass and door) already face down. K1's door is on its right-hand
   wall. Should the card show plans as stored, or turned so the entrance wall faces down? A
   check on three buildings in game would settle whether the entrance wall is the street
   side. (Recommendation: as stored first, with no street marker.)
4. **m² vs outline.** The card shows the game's m² (D = 285) next to the outline in metres
   (D2 = 23.6 × 15.6 m, about 368 m² outside the walls). Keep both, or drop the outline to
   avoid "that is not 285"?
5. **Warehouse bays.** Holes with no floor and the unnamed grey blocks both sit where a truck
   would stand, and their count always equals the loading doors. The card shows loading
   doors only, and bays appear only on the reference sheet. Is "bays" worth a number on the
   card once it is verified in game?
6. **Door swings** are drawn as thin accent lines. Keep them (they show which way doors
   open) or strip them for a quieter plan?
7. **Versions.** Office C1, C2 and D2 are the same structures as retail C1, C2 and D2. Nothing
   changes on the card, but the owner step can store one file for each structure (21), not
   one for each kind and layout (24).

## Porting note

- Build step: `make_plans.py`'s logic moves next to the other owner-only exporters (it needs
  the renders, and those need the game). It writes one small JSON of paths, which is shipped
  in `web/` and loaded lazily the first time the finder shows a plan. Keys are `<size><v>`,
  with a per-kind alias table. `_premises()` carries `layout` ("C2") for each building once
  `v` exists in `ba_buildings.json`.
- Every class here is `lp-` prefixed, and nothing on the board uses `lp-` yet. Two helpers
  borrow board classes: `.why` (the `?` badge, scoped as `.lp-why`) and `.hood`. The row tag
  is `.lp-tag` inside `.nm small`. The plan paths use single-letter classes (`.f .b .w .n
  .d`) scoped under `.lp-svg`; keep that scope.
- The dock hangs inside `.stage`, not in a `section`, so the `content-visibility` clipping
  trap does not apply. The stage already has `overflow:hidden`, and the dock sits inside it.
- A new top-level name in `web/map.js` must be unique across map.js, wiki.js and the board
  script (see AGENTS.md "Traps").
