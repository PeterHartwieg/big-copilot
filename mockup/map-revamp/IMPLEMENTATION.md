# Porting the map redesign

Make the live Map page (`web/map.js`, `web/map.css`, `#pageMap` and `#locationMapDialog`
in the `ba_dashboard.py` template) match the approved canvas:
https://claude.ai/code/artifact/0544aaed-beda-410d-9cb1-5b70bc7c838c

The spec is `mockup/map-revamp/build_map_canvas.py`: `CSS` is the stylesheet, `SCRIPT` the
behaviour, `map_markup()` the markup. Read it first. Ignore `MapSplit.dc.html` and
`big-copilot-map.html`. To see an artboard at full size, strip `<x-dc>`/`<helmet>`, stub
`class DCLogic{}`, call `new Component().componentDidMount()` on load, serve with
`web-test`; delete the test page afterwards.

## Rules

1. Copy the generator's class names and values into `map.css`; delete old rules that lose
   their markup (toolbar, `.map-layout`, `.map-side`, `.map-results`, `.map-detail`,
   `.map-mobile-tabs`).
2. Keep the existing SVG `viewBox` camera, bitmap swap while dragging, region clip, pointer
   and pinch handling, load cache, `mapButton()` shortcuts and the capture-phase click.
   Add one HTML layer over the SVG (ball, district labels, card) positioned by a
   `proj(x, y)` that inverts `point()`.
3. Keep accessibility and state handling: list rows stay buttons with `aria-pressed`,
   `aria-live` on the card, `Escape` and focus return on the dialog, character reset, retry
   on failed load, coarse-pointer targets.
4. After Python edits: `check_saves.py`, `build_web.py`, restart the watcher. Test renders
   go to `web/test-*.html` and are deleted.
5. No sentences on the page. Explanations live in the `?` tooltip. Icons are inline SVG.
6. `#pageMap` needs `content-visibility:visible; contain:none` or tooltips clip.

## Steps

1. **Artwork.** Remove the baked orb: drop `brand_orb` from `mockup/maps/style.json` and
   rebuild, or delete the single `<image>` element from `map-background.svg` in
   `export_map.py`. Update the hash in `tests/test_map_assets.py`.
2. **Header.** `.sechead` with four `.sev.lay` chips (mine green, own blue, findings amber,
   every address hollow and off), the `?`, and `.srch` with the live count. Layers are a
   union, deduped, then searched. Bind the chips in `CityMapView`, not the board's `sevOff`.
3. **Stage.** 720 px (560 in the dialog), fitted to the width minus 316 px when the panel is
   present. Footprints: `.fp .mine .owned .dim .hot .sel`; stage class `all` for outlines.
   `.pip` dots at footprint centres, `r = 4.5/scale`, shown only when `zoomed`
   (box narrower than city/1.9) and the findings layer is on. District labels as HTML
   `.dlabel`, hidden when zoomed. `.zoomer`: `+`, `−`, house (`reset()`), 332 px from the
   right when the panel is present. Camera glides 700 ms on picks and the house button;
   reduced motion jumps.
4. **Panel.** `.places` floating over the right 300 px, list only: `.place` rows with mark,
   hood tag, name (no `[XX]`), profit; address and type unfold on hover or pick. First 80
   rows then `+N`; empty is "Nothing here.". Hovering a row sets `.hot` on its footprint.
5. **Card.** `.site` beside the footprint (40 px right, 34 px up, flipped before the panel,
   clamped inside the stage): name, hood tag + address + type, three mono numbers,
   findings as dot + the board's short headline + amount, `×`, and the arrow that calls
   `openSite()`. Opens after the glide; closes on `×` or an empty-map click. Content per
   case as `fillCard()` in the generator.
6. **Ball.** `.shadow` + `.ball` in the HTML layer, state `{x:880, y:542, size:170}` in
   viewBox units, painted every `drawView()` and in a light loop for breathing and the
   pointer highlight; size in pixels is `size × scale`. Click: squish, ring, then
   `window.__consumeBalls(cx, cy, onEach)` when it exists and returns true, else spin and
   coins. Add `__consumeBalls` to `wireSphere()` in the template as in the generator's
   `GULP`: splice all balls out, fly each to the point staggered 140 ms, remove, call
   `onEach`, which grows the ball 8 % up to 230. The stage ignores pointerdown inside
   `.places, .site, .zoomer, .ball`.
7. **Dialog.** 1080 px, title `name · address`, close `.ibtn`; overlay view built with no
   header and no panel, card open on the requested key.
8. **Phone.** Keep today's under-760 px behaviour with the panel below the stage. Show Peter
   a screenshot before doing more.
9. **Tests.** Rewrite `tests/map.test.cjs` to the new hooks and add: layers add up and dim;
   dots only when zoomed; ball rect inside the park at three zooms; card never over the
   panel; ball click removes every `.orb` and grows, or drops coins without error; dialog
   has no chips, panel or crumb; both themes; reduced motion.
10. **Ship.** Tests, `build_web.py`, compare a Costco render with the canvas at 1440 px,
    reviews, docs (`docs/dashboard-reference.md`, README), `npx wrangler deploy`, check for
    stray files.

## Ask Peter

Phone layout; whether the artwork's printed title block stays; whether every address
lists all 883 rows or caps at 80.

## Done

Live page and `Main.dc.html` look the same at 1440 px apart from data; the ball stays in
the park at every zoom and swallows the masthead balls; no sentence on the page; both
themes and the tests pass; the deploy lists no strays.
