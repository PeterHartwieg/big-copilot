# Find a location: scope and implementation contract

Status: archived. Shipped as PR #28 (15 September 2026), with follow-ups in PRs #32 and #34.
The finder now lives in `web/map.js`; see [docs/architecture.md](../architecture.md).

Scoped 15 September 2026 with Peter after a grilling session. This document is the
contract for the implementation agents; the decisions here are settled and are not
to be reopened by workers. Build number and save used for validation: HART. YT
(character GP36Brwp, day 16 and again day 20) plus 50 more leases from two older characters.

## The decision the feature serves

"Which available premises are best right now?", either for any business type or for
one chosen retail, office, cinema or theater type. The answer is a ranking by
neighbourhood demand and foot traffic. It is **not** a profitability ranking and the
page says so in one line above the list: a clothing store out-earns a coffee shop
regardless of demand, and the feature does not try to model that.

## Facts verified in saves (do not re-verify, do not contradict)

- `BuildingRegistrations` lists every building in the city (885), not just the
  player's. Per building: `AvailableForRent`, `RentedByPlayer`, `RentPerDay`,
  `businessTypeName`, `BusinessName`, `customerCapacity`, `buildingOwnerRivalId`,
  `businessOwnerRivalId`, `takeoverOfferAcceptRate`, `creationDay`.
- **Vacancy is exact.** Every empty retail and office building carries
  `AvailableForRent = true` (checked on day 16 and day 20 of HART. YT, where the
  vacant count went from 19 to 176 as rivals closed). The only empty-but-unavailable buildings are residential
  and warehouses. Never infer vacancy from anything else. Peter's QA on 15 September
  briefly questioned this when day 20 of HART. YT listed 176 vacant retail units
  including every Hamptons unit; an ownership-based rule was tried and reverted the
  same day, because the in-game map showed those ownerless units as rentable and
  Peter confirmed the flag is the rule: something in that save had put many
  buildings on the market at once.
- **Rent is not stored for a vacant building** (`RentPerDay` is 0). It is computed
  by the game and matches this formula for every non-residential lease across three
  characters (48 leases, worst residual 0.6%, integer rounding):

      rent_per_day = m2 × (30 + traffic_index) × district_rate × (1.033 if office building)

  District rates fitted from those leases:

  | District | Rate |
  | --- | --- |
  | Midtown | 0.02482 |
  | Hell's Kitchen | 0.01468 |
  | Murray Hill | 0.01020 |
  | Garment District | 0.00734 |
  | Lower Manhattan | 0.00621 |
  | The Hamptons | 0.00568 |
  | Industry City | 0.00566 |

  Residential leases do not follow the formula; residential rent is not estimated.
  The Companion project's `estimated_daily_rent` is wrong by orders of magnitude and
  must not be used.
- **Deposit** ("Kaution", added after QA on 15 September): the transaction log's
  `ba:transaction_deposit` entries show the signing deposit is about 62.8 × the daily
  rent for retail, office, cinema and theater buildings and 93.6 × for warehouses
  (fitted on 21 lease deposits, worst deviation 4%; identical buildings have asked
  slightly different deposits, so a few per cent is the floor). Entries above 300 × the
  rent are building purchases and below 30 × are not lease deposits. The finder shows
  the estimate as "Upfront"; the card shows both rent per day and deposit.
- **Door cap is not stored for a vacant building** (`customerCapacity` is 0). The
  game's help page `help_building_types_content` gives customer capacity per size
  code; the player's shops match it (225 m² retail = 30, 285 m² = 40, 1000 m² = 75,
  office J = 10) with one known exception: office K is listed as 50 while Peter's
  law firm in a K building shows 20 in the save. The table is what the game publishes; the
  page lists cinema S as 150/125/100 and theater R as 200/175/150 by variant, so
  those show as a range. The page is not in `gametext.json` yet; ship a fallback. The same size letter means a different capacity
  in an office building than in a retail one, so the lookup key is
  (building type, size letter). Rival shops in the save often show a lower
  `customerCapacity` than the table; the table is the number the player gets.
- `ba_buildings.json` rows: `s` street slug, `n` number, `h` neighbourhood display
  name, `t` building type (`retail`, `office`, `warehouse`, `residential`,
  `special`, `cinema`, `theater`), `z` size letter, `m` m², `x` traffic index
  (10 to 84). `z` maps 1:1 to `m`.
- `buildingsForSale` (31 on day 16, 572 on day 20 in HART. YT; the list grows, so the for-sale table needs a sort and a neighbourhood filter): `address {streetName, streetNumber}`,
  `buildingPrice`, `squareMeters`, `acceptOfferRate`. Joins to the static table by
  street slug and number.
- `takeoverOfferAcceptRate` is 0 for every rival until the player makes an offer.
  The takeover price is not in the save. The feature never shows or estimates one.
- Hype: `marketEvents` of type 2 raise the game's current demand. The feature uses
  the game's current demand as it stands and never mentions hype.
- Type demand per neighbourhood is the Market grid's existing average over the
  type's primary products (`_market()` → `types` rows, per-cell `demand`, plus the
  offices band). Reuse it; do not compute a second one.

## Eligibility (Peter's in-game rule)

| Business category | Building type `t` |
| --- | --- |
| Retail types (everything in the Market grid that is not an office type, cinema or theater) | `retail` |
| Office types (`OFFICE_TYPES`: law firm, travel agency, event planning, graphic design, web development) | `office` |
| Warehouse or factory | `warehouse` (one class; no score, sorted by size) |
| Cinema | `cinema` |
| Theater | `theater` |
| `special` and `residential` buildings | never candidates |

## Score and columns

- `score = traffic × type_demand ÷ 100`, shown as an integer. Two published terms,
  both values the game itself shows. One tooltip: "Foot traffic scaled by how much
  of this type's demand the neighbourhood has. Rent, rivals and capacity are shown
  but do not change the score."
- In "any type" mode each row uses the neighbourhood's highest type demand and names
  that type ("best fit: Coffee shop"). Every building in a neighbourhood therefore
  shares the best-fit type; traffic separates them. That is accepted.
- Columns, every one sortable by clicking the header: score (default sort, desc),
  traffic, type demand, estimated rent per day, door cap, same-type rivals in the
  neighbourhood (count; the player's own shops of that type counted separately),
  size in m², neighbourhood. Buy-out rows add the occupant (rival business name and
  type). Warehouse rows have no score, demand or cap.
- Rent is labelled "est. rent"; its tooltip says it is fitted to observed leases and
  matched the player's own leases within the measured deviation (the payload carries
  the live check against the player's current leases).

## Filters (persist per character in browser storage, like the import checklist)

Category (retail / office / warehouse / cinema / theater); type within category or
"any"; availability (vacant, buy-out, both; default vacant); neighbourhoods
(multi-select, default all); minimum door cap; minimum traffic.

"For sale" is a separate plain table reached from the same panel: address,
neighbourhood, building type, m², asking price. No score.

## Where it lives

- A toggle on the city map page turns the finder on. Hidden by default. While on,
  the finder panel's filters replace the map's layer chips and search; candidates are
  the only highlighted footprints; the ranked list is the side list; clicking a row
  or a footprint selects both; the player's own shops stay drawn faintly. Off, the
  map is exactly what it is today. The toggle lasts the session: it stays on across
  pages, and a new load opens the plain map with the filters where they were left.
- Independently of the finder, the site card for **any** address shows: building
  type, size and m², door cap (when the table has one), traffic, availability
  (vacant / rented by a rival business: name and type / yours / not rentable),
  est. rent for non-residential buildings.
- Entry points: the Today "Find a location" card (no longer SOON) shows a live line
  such as "19 vacant retail units · best by traffic: 12 Fifth Avenue, Hell's
  Kitchen" and opens the map with the finder on. A Growth grid cell (type ×
  neighbourhood) opens the map with the finder on and that type and neighbourhood
  preset.

## Out of scope (decided)

Side-by-side compare, demand history or trend, rival strength, takeover price,
scoring buildings for sale, per-type minimum sizes, residential rent.

A relocation flow from capped shops was listed here too; it was dropped on 24 Sep 2026,
because the game does not work that way.

## Payload contract (Python → page)

`extract()` gains one key, `premises`:

```
premises: {
  buildings: [            # all 885, sorted by key; the map card reads this too
    { key, address, hood, type, size, m2, traffic,
      cap,                # int, [min, max] when the letter's variants differ (cinema S, theater R), or null
      rent,               # est. $/day, int, null for residential
      status,             # "vacant" | "rival" | "mine" | "unavailable"
      occupant }          # {name, type, typeSlug} for "rival" and "mine", else null
  ],
  forSale: [ { key, address, hood, type, size, m2, price } ],
  demand: { hood: [ { slug, type, demand, providers, mine, category } ] },
                          # per neighbourhood, from the market types rows;
                          # category ∈ retail|office|cinema|theater
  rent: { constant: 30, rates: {hood: rate}, officeFactor: 1.033,
          check: { leases, worst } },   # worst relative deviation vs the
                                         # player's current non-residential leases
  caps: { retail: {letter: cap}, office: {letter: cap}, cinema: {letter: [min,max]}, theater: {...} }
}
```

`key` is `site_key()` (`streetSlug#number`), the same key the map uses. `hood` is the
display name from `ba_buildings.json`. `status` "unavailable" covers residential,
special and empty-but-not-available buildings. The page computes score, best fit,
rival counts and the Today line from this; Python does no ranking.

## Work split and ownership

| Worker | Owns | Does |
| --- | --- | --- |
| A (Opus 5) | `ba_dashboard.py` above `def render(`, `tests/test_premises.py`, `docs/dashboard-reference.md` | `_premises()` extraction, rent estimate and live check, door-cap table from the help page with a shipped fallback, for-sale join, demand-by-hood reshaping, unit tests on a fake save, run `check_saves.py`. |
| Coordinator | `docs/find-a-location-scope.md`, `mockup/find-location/` | Claude Design canvas of the finder panel, list, card and Today card before B starts. |
| B (Opus 5) | `ba_dashboard.py` TEMPLATE string only, `web/map.js`, `web/map.css`, `tests/map.test.cjs`, `tests/finder.test.cjs` | Finder mode, filters, list, score, card fields, Today card line, Growth cell link, persistence, tests. Runs after A and the canvas. |
| C (Opus 5) | wiki data pipeline files for one new article, its test | "How rent works" wiki entry: formula, the seven district rates, office factor, fitted date and build, note that a patch can rebalance it. |
| Reviews | read-only | Grok 4.6 and gpt-5.6-sol on the full diff; every should-fix is fixed before QA. |

Rules for workers: keep it simple, no new abstractions beyond what the feature needs,
no timeouts on commands, do not commit, do not touch files outside your ownership,
do not reopen decisions in this document. Run `python build_web.py` only if you own
the template (B); A and C leave `web/` alone except where their ownership says.

## Done when

Python tests and Node tests pass; `check_saves.py` passes on every readable save;
a rendered page from HART. YT shows the finder with every vacant retail unit the save reports (19 on day 16, 176 on day 20: the count moves as the game runs, so tests assert the rule, not the number), est. rent
on every non-residential card, the Today line, and the Growth link; both reviewers'
should-fix findings are closed; Peter has the QA render and the canvas link.

## Deviations recorded at review (15 September 2026)

- The ranked list shows four sortable numeric columns (score, traffic, demand, est.
  rent). Door cap, rival count and m² sit in the row's second line and on the card,
  not as their own columns: the side panel is 440 px wide and more columns starved
  the address. Sorting by those three is therefore not offered in the first release.
- The for-sale list carries the neighbourhood as the two-letter code column plus the
  full name under the address, not as a separate sortable column.

## Floor area, from player feedback after launch (15 September 2026)

- Floor area in m² is now a sortable column between demand and door cap, and a Size row
  (min and max m²) filters both the ranked list and the for-sale list. Together with the
  door-cap and upfront columns that shipped, this replaces the first deviation above.
- The panel is 45 px wider (485 px) so the address keeps its width. The warehouse list
  already ranks by m², so it keeps its narrower grid with no second m² column.
- When a row has no occupant and no best-fit type to show, its second line gives the full
  neighbourhood name, where it used to repeat the m² and cap figures the columns now show.

## Saved searches and the switch, from player feedback (15 September 2026)

- The switch lasts the session. It stays on across pages and a new load opens the plain
  map. This reverses the QA-round-three rule that the Map tab always opened plain: a
  player had to click the switch again after every trip to another page.
- A Saved row closes the filter block. Each saved search is a chip, filled while its
  filters and sort are the ones on screen, with its own × to delete it. Save opens a name
  field beside it that suggests a name no search holds yet. Save again, or Enter, keeps
  the name for the filters on screen at that moment; the × beside Save, or Escape in the
  field, drops it; an empty name saves nothing. Anything else pressed while the field is open does its
  own job and leaves the field as it is: saving on leaving the field was tried in review
  and dropped, because the departure arrives before the click it belongs to and the
  redraw swallowed that click. Saving under a name already taken replaces that search.
  Up to eight searches; at eight, Save steps aside until one is deleted.
- Saved searches are shared by every character (`ba_finder_saved_v1`), because the city
  and its neighbourhoods are the same in every save; each character still keeps its own
  working filters. The list is held in memory and written through to storage, so a browser
  that refuses storage keeps the session's searches; other tabs' changes arrive through the
  storage event. A search is read against the save it is applied to: a neighbourhood, type
  or sort the save cannot honour falls back as the live filters would, and a number that is
  not a finite one means no limit. A search saved on the for-sale list carries no sort.
- On a phone the filters alone outgrew the panel's 45 dvh and left the list a few pixels,
  so there the panel scrolls as one piece, with the results following the filters.

