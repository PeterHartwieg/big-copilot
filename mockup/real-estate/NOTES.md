# Real estate: design notes

Canvas: https://claude.ai/artifact/8aqqSHKSDYp5WGDqgvgkTV ("Big Copilot Real Estate", Design type). Generator:
`build_canvas.py`; never hand-edit `project/`. `--preview` writes plain HTML to `_preview/` (both themes) for
Playwright shots; do not commit `_preview/`. The Artifact tool refuses a root inside a worktree: republish from a
scratchpad copy of `project/`.

Scope and every settled decision: `research/real-estate-2026-10-12/PLAN.md`; game rules: `rules.md` beside it (both
local, gitignored). The numbers are Peter's day-329 save, written to `data.json` by `make_data.py` (owner only: it
reads the board payload, the research rows and the bundle's building table from the scratchpad). The stylesheet is
the shipped one, cut out of `template/board.html` with `web/map.css` spliced in; every new class carries `re-`.

## Artboards

| # | File | What it shows |
|---|---|---|
| 1 | Sidebar | The sixth area under Expansion; open with its two views (count + New); day 359 with Buy a building carrying 1 |
| 2 | Main | My buildings: 52 rows sorted by gain, 12 shown, Show all; Set best prices (31) and +$93,256 a day in the view's control row; per-row Set; totals |
| 2b | Modded | Same with Economy Expansion ×5 (illustrative: his save is vanilla) and the quiet "Rent ×5 measured from yesterday's income" note |
| 2c | After | After the write: old → new price "in 7 days", gain greyed "set", button gone, the Undo strip |
| 3 | Opened | Two rows opened in place: 61-day occupancy line, the 7-day wait and the fill (dashed) to "full ≈ day N", one facts line |
| 4 | Dialogs | The write dialog: ready (tally, wait note, one row a building), applied, one row's Set, link dropped |
| 4b | LinkStates | No link: no write button anywhere; mod older than 0.6.0: the button dashed with the plug and the reason |
| 5 | Buy | Before tax day panel, then For sale by Price (default), 10 rows + Show all 689, dimmed beyond cash |
| 5b | BuyPayback | Payback sort: the buildings you rent in lead, tagged "You rent here · saves $X/day" |
| 6 | Attention | Overview on day 359 with both findings (outlined): tax eve (warning) and the grouped rent finding (opportunity, Details open) |
| 6b | LandRent | The rent finding's landing: arrive strip, every flagged row lit |
| 6c | LandTax | The tax-eve finding's landing: panel lit, countdown amber "tomorrow" |
| 7 | Finder | Find a location › For sale with the Payback column, Price/Payback sort by column head, the new chip tip |

## Design decisions I made (for veto)

1. **Sidebar:** Real estate is the sixth area, after Expansion, icon a house outline. Its views use the board's
   existing to-do count: My buildings shows the buildings off their best price (31); Buy a building shows 1 only on
   the last day before tax day. Both views carry New until opened (`VIEW_NEW`). No count on the area row (only
   Overview carries one today).
2. **The bulk button lives in the view's control row** (as Supply's write buttons do), with the gain beside it as
   "+$93,256 a day once full". No head line or summary under it.
3. **My buildings columns:** Building (hood chip, address, map shortcut on hover; hood name and type underneath), m²,
   Occupancy (number + small bar, green when full), Price / m² (with "+20% over market" in amber when at or above
   market), Income / day, Best price, Gain / day (sorted, arrow), Payback, Set. Payback is on the price paid, at the
   best price, full, net of property tax, so it reads ~1,780 days for nearly all (honest, and the plan wants it).
4. **Flagged rows first, by gain; the three full buildings at/over market follow them** with a "move-out risk" chip
   and their small negative gain (e.g. 24 Twelfth Street −$29). Unflagged rows after, gain in grey or "—".
5. **Two Hamptons villas** are not rows: the totals line says "+ 2 villas, no rent income".
6. **Totals row:** buildings, m², weighted occupancy, income now with "full $368,780" under it, total gain.
7. **Row opened:** the line shows 61 days of occupancy to today, then on its own scale (separated by a thin
   divider) an amber dotted 7-day wait and a green dashed fill to 100% ending "full ≈ day 421". No projection for a
   building that is not flagged; its facts line still says "fills in about N days". Facts line: market rent, bought
   for $ on day N, (pending) "applies in 7 days, on day 336", fills in about N days at the best price.
8. **Pending price** shows as "~~13.47~~ → 11.22 / in 7 days" in the price cell; its gain greys with "set" and its
   Set button goes. A pending price is never re-offered (plan).
9. **Modded rent:** a quiet chip at the right end of the control row ("Rent ×5" + "measured from yesterday's
   income"), tip explains. Nothing on a vanilla save.
10. **Dialog** (shipped `gw-` language, a price-tag icon): title "Set best prices at 31 buildings"; verdict "The game
    will set 31 prices"; a tally of the changed buildings only (rent now a day → once full a day, buildings); one
    info line on the 7-day wait and the weeks of filling; a row per building (old → new a m², +$/day), hover reads out
    occupancy and fill time; foot "Nothing changes until you apply" · Cancel · "Set 31 prices". Done: "31 prices wait
    in the game. They apply on day 336", Undo puts back all at once. One row's Set: "Set the best price" with the
    building under the title. Toast after closing: "Best prices set at 31 buildings · They apply on day 336 · Undo".
11. **No link:** as everywhere on the board, no write button exists; the best price column is what to copy in
    BizMan. A mod without the `rent` capability: the button stays, dashed, plug icon, tip "Update the Big Copilot
    Link mod … 0.6.0". Link dropped mid-dialog: the shared "Not linked" failure.
12. **Buy a building:** the payback sentence sits in the control row beside the Price / Payback switch ("Every
    building pays back in about 1,800 days at the best price"), not as a line under it.
13. **Before tax day panel** (top of the view): title + countdown chip (amber on the last day) + "?" tip with the
    rule; "Spend $31,891,894 → tax −$16,264,866 at 51%"; a meter of projected taxable sales ($99.9M) with your cash
    ($31.9M) marked and labelled "the limit" (the bound side is green; when the base binds, that label moves to it);
    cash left $924; right: "Buy these" with each building, price and Show on map, and the sum.
14. **For sale list:** Building (hood, address, map shortcut always visible here; sub: hood · type · total m², or
    "not listed, offer 1% over market value" for a rented-in unlisted building), Price, Rent / day (best price,
    full), Payback. Dimmed past cash with the tip "$X more than your cash". "You rent here · saves $X/day" is a blue
    tag under the address. Villas: "No rent income", payback "—". Show all line adds "349 within your cash".
15. **Findings:** the rent finding is an **opportunity**, site slot "Real estate" with the house icon, text
    "31 buildings priced off their best rent · +$93,256/day", bars rent now vs at best prices, Details lists the three
    largest changes "and 28 more", action "Review rent prices". The tax-eve finding is a **warning** (it expires
    tomorrow), text "Tax day tomorrow: buy 2 buildings for $31.9M, tax −$16.3M", second line "cash $31.9M · the
    limit · $924 left after", primary action "Review the buildings".
16. **Landings:** the board's arrive strip ("Needs attention" back + the finding's words); rent: every flagged row
    lit with the accent bar; tax: the panel outlined.
17. **Finder:** For sale gains a Payback column; Price and Payback sort by clicking their heads, as the ranked lists
    do (no extra control). New chip tip: "Whole buildings for sale, with the rent they earn at the best price once
    full. Payback is about 1,800 days for every one of them, so the list is cheapest first."
18. No Real estate card in Overview's All tools: the sidebar and the two findings are enough (a fifth card breaks
    the four-across grid).

## Data facts the canvas surfaced (for slice 2)

- **Gain of a building already under market** is only the cents up to the best price, not the fill: it fills on its
  own (nobody moves out). Counting the fill flagged 9 Twelfth Street (4.35 vs market 4.368, 62% and rising) at
  +$4,412/day for a one-cent change. With the fix: 31 flagged, +$93,256/day (the research's 118k counted those
  fills). The canvas uses the fixed rule; `make_data.py` has it in one line.
- The finder's For sale m² column is the business unit (75 for an A1), while Buy a building shows the building's
  total m² (what earns rent). Left as it is in the finder; say if it should switch.
- Payback in Buy a building spans 1,524–1,818 days; the 55 rented-in buildings are the only real spread (warehouses
  with high rent per m²).
- Before tax day on his save: target = cash (31.9M < base 99.9M); best subset is 2 listed retail buildings in
  Industry City summing to $924 under cash (5 21st Street $25,184,610 + 25 21st Street $6,707,284).

## Porting notes, by plan slice

- **Slice 3 (board):** `AREAS` gains `{id:"estate", icon:"estate", views from VIEW_META "estate/…"}`; two VIEW_META rows
  (`estate/buildings` section `secEstate`, `estate/buy` section `secBuy`, needs `realEstate`); `routeCount` for
  `estate/buildings` = flagged not pending, `estate/buy` = 1 on tax eve; `VIEW_NEW` both; `PAGE_DRAWS` row; a new
  `pageEstate` host. Tables are the global `table` styles plus `re-` classes (CSS from `RE_CSS` here, scoped under
  `#pageEstate`). Row open/close is the `sr-` pattern from Plans & contracts (`tr.re-row` → `tr.re-det`). Sparkline
  is one inline SVG from `realEstate.owned[].hist` (occupancy per day) plus `fill`. Sort switch on Buy is the `.seg`
  control; table sort arrows are the board's `thead th[data-i]` with `svg.sort`. Show on map = `.map-shortcut` with
  `data-map-key`. The tax panel is one block, hidden when the base is 0 or sales stay under $150k.
- **Findings:** kinds `rentprice` (opp, grouped, `ov-cmp` bars, Details = top 3) and `taxeve` (watch); both need rows
  in the finding-kind tables (`tests/alert_kinds.test.cjs`) and the Registries checklist. Site slot: a house icon +
  "Real estate"/"Buy a building" link instead of a hood chip (new small `re-sic` span).
- **Slice 4 (write):** the dialog is a `gwConfirm` spec like marketing's: `kind:"rent"`, icon `tag` (new `GW_P` path,
  in `I` here), `draw` = tally + `gw-call info` + `gw-shops` rows (`gw-mkrow`, `.c` = +$/day, `.gw-mk` = old → new),
  `applyLabel` "Set N prices", `done` text, undo hint. The button is `gwButton("rent", …)`, so no-link and old-mod
  states come for free.
- **Finder (`web/map.js`):** `.fhead.sale` / `.place.fr.sale` gain a sixth column (`re-pbc` grid here: 26px 1fr 58px
  44px 66px 64px); sale heads get `data-s` for price/payback; `savedKey` keeps the sort for sale searches now; new
  `map.show.sale.tip` text.

## Open questions

None that block the port. Two calls above are worth a glance: the gain rule for under-market buildings (data facts,
first bullet), and the tax-eve finding as a warning rather than an opportunity (decision 15).
