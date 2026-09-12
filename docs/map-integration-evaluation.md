# Map integration evaluation

> Implementation update: the follow-up UI removes added map markers and severity badges; footprints remain highlighted and findings appear in the detail panel. Compact zoom controls sit inside the map. A shared bitmap is used while moving, with sharp vector detail restored when movement stops. The proposals below record the original evaluation.

12 September 2026. Proposal based on the current working tree, the shipped map,
the local map pipeline, and two local build-3675 saves: a day-1 character and a
developed day-190 company. This records the original evaluation. The first
implementation is now in the working tree: My businesses, issues, search/type/region
filters, and a focused location overlay opened from building references.
Performance, demand shading and scouting remain later increments. See
[dashboard-reference.md](dashboard-reference.md) for current behavior.

## Recommendation

Add a **Map** page shared by Results, Today and Growth. Start with **My businesses**:
locate the player's sites, identify issues, and open their existing details.
Then add product demand by district. Extend the same map
into Growth's location scouting once property facts have been validated.

User scope correction: logistics is a background calculation in the game and does
not need a geographic visualization. Supply connections, route arrows and animated
deliveries are excluded from this proposal. Existing supply analysis is unchanged.

The geography is ready for an integration prototype. Reliable prospective rent,
capacity and business eligibility remain separate gaps. These should not delay
mapping the businesses and findings the dashboard already understands.

## What is available

The shipped PNG is 3,600 × 2,922 pixels and 1.44 MB; the SVG is 7.77 MB and contains
36,182 XML elements. Gzip reduces the SVG to approximately 1.62 MB, but that does
not measure browser parsing or interaction performance. Both are presentation
exports with a title, legend, and independently positioned regional insets.

The retained canonical geometry has 883 address features: 882 footprints and one
entrance-only casino. It covers seven districts and retains building entrances,
street slugs and numbers, world X/Z geometry, and source identities. The recipe
also contains seven extracted district zones and the panel layout. Its QA passes.
Visual comparison with Voogle is still incomplete for the newer regions.

The unmapped catalogue entries are the excluded `80 Third Street` and
`1 Airport Avenue`. Unknown addresses must remain visible in lists with a missing
position explanation. Never place them at the origin.

Only PNG/SVG map assets currently ship under `web/maps/`. The extraction scripts,
recipes and research snapshots are locally retained and git-ignored. Interactive
integration needs an explicit, reproducible export of compact runtime metadata;
another developer cannot reconstruct it from the published images alone.

### Save evidence

| Observation in the developed save | Consequence |
| --- | --- |
| 39 dashboard sites across all seven districts; all 39 match map addresses | Existing site data can power the first overlay. |
| 41 `RentedByPlayer` registrations, with 39 in the business dashboard | The dashboard excludes residences. Call this layer “My businesses”; a homes layer needs separate extraction. Renting and real-estate ownership are separate facts. |
| 11 existing findings, with address keys available on site-specific findings | Reuse the dashboard's issue severity and explanation. Company-wide findings remain in the list. |
| Market rows cover 76 products and all seven districts | A selected product can color district zones using existing demand values. |
| 300 registrations have `AvailableForRent = true`; all map, and none are player-rented in this sample | A save-reported availability layer is feasible; do not infer vacancy from absence of player ownership. |
| 299 of those 300 record zero rent; all 300 record zero customer capacity | Zero is not evidence of free rent or a zero-capacity premises. Even the one positive rent needs validation as a current quote. |
| 223 registrations have a nonempty `businessOwnerRivalId`; all map | Rival locations, names and business types are present. Validate classification before presenting them as competitors for a selected product. |
| `realEstate`, `buildingsForSale`, `LastPlayerPosition` and vehicle records exist | Property holdings, sale listings and a saved player position are possible later layers, after their semantics and coordinates are checked. |

The day-1 save has no player-rented buildings but does have 81 rental-availability
flags and 350 rival-business owner IDs. An empty company must therefore get a useful
city view, with an explanation and access to places/market information. These two
saves demonstrate feasibility, not coverage of every game state or supported build.

## Where it fits in the tool

- **Map:** dedicated page, initially opening My businesses. Search by address or
  business name; filter by district and site type; offer zoom, fit results and reset.
- **Results:** “Show on map” opens the selected business. Map selection can open
  the existing business detail view and return to the same map state.
- **Today:** site-specific findings can locate their business and show the same
  finding text in map details.
- **Growth:** open the map with the relevant district and product selected.
  The future Find a location list and map share filters and selection.

Use one map component and state model. On desktop, give the map most of the page
with one compact selected-location panel and a collapsible matching list. On narrow
screens, use Map/List views with shared selection. All sites must be reachable by
keyboard through the list, and essential details must not require hover.

Keep the full-world overview for orientation. Selecting Manhattan, Industry City
or the Hamptons should expand that region into the working viewport. Preserve the
game's orientation and expose district shortcuts; do not infer compass north.
Avoid shrinking the entire poster into a dashboard card: its address text is already
too small at overview scale.

## Visualization priorities

| Priority | Layer | Basic behavior and evidence |
| --- | --- | --- |
| First release | My businesses | Highlight premises and distinguish shops, factories, warehouses, support sites and vacant player leases with symbols and labels. Join `businesses[].key` to geography; use `typeSlug` for precise classification. Keep unrelated buildings quiet. |
| First release | Issues | A small severity badge on affected sites, using existing `alerts[].siteKey` and findings. Selection shows the reason and links to its existing action/detail view. Do not turn every cost centre red because it books expenses. |
| Next | Performance | An optional color mode for site profit, preferably a mean over available recent completed days from `series`, with sample length shown. Use a zero-centred scale; show missing history distinctly. Keep support/cost-centre sites neutral or explicitly identified. |
| Next | Product demand | Color the extracted district zones for one selected product. Show demand, providers, own selling presence and remaining hype duration in details. Use a consistent demand scale and a missing-data state. Replace decorative district tints while this mode is active. |
| Scouting increment | Available premises and rivals | Show save-reported availability and rival-operated businesses in separate optional layers, filtered by district/type. Join static category, area and traffic where known; distinguish static traffic from current promotion. Do not promise eligible premises, quoted rent or product-level rivalry yet. |

My businesses plus issues should be the default. Use one primary color mode at a
time, with selection outlines and issue symbols independent of that color. Preserve
the familiar landmark palette, but provide a visibility toggle so it does not
compete with analytical overlays. The decorative park orb can also be hidden in
analysis views without changing the approved map artwork.

At low zoom, show district names and prominent company markers. Reveal business
names, street names and address detail as space permits. Do not label every rival
by default. Panning must not silently change ranking or
remove results from the linked list.

## How buildings are highlighted

Highlight the actual building footprint. Export each address's polygon from the
same canonical geometry that generated the basemap, then draw that polygon in the
interactive SVG overlay. The save selects which address gets a style; it does not
supply or approximate the building outline. This works over either the PNG or an
external SVG background without editing image pixels or guessing roof boundaries.
Use identical exported transforms for the background and overlay in each region.

Suggested initial treatment, subject to visual review on the real basemap:

| State | Appearance |
| --- | --- |
| Ordinary building | Existing neutral map appearance. |
| Player business | Shared company-accent fill at roughly 25–35% opacity and a clear 1.5–2 screen-pixel outline. Keep ownership color consistent; distinguish business types with a small symbol and detail text. |
| Hover or list focus | Increase outline contrast and show the business name/full address. Hover is supplementary; clicking or keyboard selection exposes the same information. |
| Selected building | Stronger roughly 3 screen-pixel outline, a contrast edge where necessary, and a persistent name/address label. Open one details panel. Selection remains distinguishable in every color mode. |
| Site with an issue | Small severity badge next to the site marker or label. Keep the footprint's company identity; selecting it explains the issue. |
| No footprint available | Entrance marker with an explicit explanation, as for the casino. Never invent an outline. |

At street zoom, the polygon is the primary highlight. At city zoom, retain the
polygon but add a compact fixed-screen-size marker for each player site so small
premises remain findable. Anchor it inside the footprint; expose the separately
verified entrance point when a user needs the exact door. Markers replace neither
the footprint nor its address identity. Handle crowded markers by decluttering
labels and offering zoom/list selection, without enlarging footprints over neighbors.

Keep outline widths constant on screen (`vector-effect="non-scaling-stroke"`),
and size overview markers independently of map zoom. Draw selected labels above
the highlight layer so fills cannot obscure them. Transparent hit areas may improve
selection of tiny sites, but overlapping targets must resolve to a clearly identified
site or the linked list. No pulsing or animated glow is needed.

The first visual review should include adjacent player sites, a tiny storefront,
a large factory, a highlighted special-service footprint, and selection in each
regional view. Tune opacity/contrast against the actual dark map, preserving street
labels and a visible distinction between ownership, selection and issue severity.

## Integration approach

Use a **static basemap with a small interactive SVG overlay**, generated from the
same canonical source. This fits the existing plain JavaScript/shared Python
template and does not need a real-world mapping service.

1. Extend the private pipeline with a runtime export: clean region basemaps,
   building footprints/entrance anchors, district zones, street/landmark labels,
   and a manifest containing schema version, source/build provenance, hashes and
   exact projection/view-box information. Keep extraction-only records out of the
   browser bundle. Derived assets should be reproducible from an approved snapshot.
2. Standardize each runtime address key as `streetSlug#number`, matching
   `site_key()`. The canonical pipeline currently uses a different feature-ID
   string; convert at export, using its explicit street and number fields.
   Never join on localized display names or business array indexes.
3. Render the basemap as an external SVG image inside a lightweight SVG scene;
   put selectable footprints and screen-readable markers above it. Pan and zoom
   both together. Use exported labels or zoom-dependent label groups for legibility.
   This avoids putting every decorative element into the interactive page DOM.
   Benchmark the SVG image on actual devices; use raster regional backgrounds if
   its redraw cost proves excessive. Canvas/tiles remain options if measurements
   justify them, not prerequisites.
4. Export exact panel transforms rather than guessing coordinates from the PNG.
   Unity uses X/Z and the screen's vertical axis is inverted. The poster's insets
   have independent scales, and the renderer can adjust axes for equal aspect and
   the legend. Use actual rendered transforms, or generate region assets directly
   in a documented shared coordinate frame.
5. Reuse existing dashboard JSON for business, findings and market modes.
   Add a small all-property extraction only when availability/rivals are introduced;
   `extract()` currently filters registrations to player-rented businesses.
   Use stable district identifiers for joins rather than localized labels.
6. Lazy-load static geography when Map is first opened and cache it by asset version.
   Save refresh updates overlays only. Preserve the selected address and viewport
   within a character, revalidate disappeared sites, and reset character-specific
   choices when switching characters. Show the loaded save day/time, not “live”.
7. Keep the component in the shared source workflow and package it through
   `build_web.py`. The local watch server currently serves only the dashboard/data
   routes, so it needs explicit map asset routes. Standalone HTML output also needs
   a defined strategy: embed its map metadata/assets so `file://` opening still
   works, without relying on a JSON fetch or the current working directory.

## Limits and completion checks

Demand is available at product/district level. Do not invent street-level demand,
competition radii or profit forecasts. Provider counts are not yet verified as
distinct rival shops. Business type alone does not establish a rival's precise
product range.

For the first release, verify every developed-save dashboard site maps exactly
once; corner buildings and each region's transforms;
entrance-only and unknown addresses; an empty company; map/list agreement; refresh
and character changes; keyboard/touch operation; readable zoom and narrow layouts;
and browser, local-server and standalone-file packaging. Measure load and pan/zoom
performance before choosing a more complex renderer. Run the existing relevant
navigation, save and layout checks once implementation changes behavior.

The next concrete implementation slice is **open Map → select an existing business
or issue → inspect it → open the current business details → return to Map**. It
proves the shared component, asset packaging, transforms and save join before adding
new property recommendations.

## Source locations

- `web/maps/full-map.png` and `web/maps/full-map.svg`: inspected shipped assets.
- `mockup/maps/PIPELINE.md`, `full_map.py` and the latest local full-map snapshot:
  geometry, identities, coverage, district zones and inset transforms.
- `ba_dashboard.py`: `site_key()`, `extract()`, `_business()`, `_market()`,
  `openSite()`, `PAGES`, `SUBS` and `BoardHandler`.
- `ba_save.py`: save reader, reference resolution and address decoding.
- `build_web.py` and `docs/contributing.md`: shared-source browser packaging.

No production code or save files were changed. Save inspection used
`history_path=None`; no history was written. Counts and joins above were checked
directly; this evaluation did not run UI benchmarks or in-game interaction tests.
