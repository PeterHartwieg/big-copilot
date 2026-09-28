# Open a new store: design notes

Canvas: https://claude.ai/artifact/BEGQSRsuicrWSpGFsRd4mo (Design type). Generator:
`build_open_store_canvas.py`. Never hand-edit `project/`. `--preview` writes plain HTML to
`_preview/` (both themes) and wants the map crop there as `_preview/map.jpg`; `_preview/` is
ignored. The contract is `docs/open-a-store-scope.md` on branch `break-even-core`.

Round 1, 28 Sep 2026, for Peter's review. Nothing is built.

## Artboards

Every page is 1280 px wide with the shipped sidebar (variant B) at full width. Each artboard
has a `dark` Tweak for the light theme.

| File | Shows |
| --- | --- |
| `Main` · 1 What to open | The new view **Expansion › Open a store**, empty. The top demand cells ("From demand"), a grid of business types with how many you run ("Or pick a type"), offices apart, and **Your plans** (one per stage: until opening, still choosing a location, paying back). |
| `DemandCell` · 1b | Expansion › Demand with Liquor Store × Midtown picked. The cell's popover gains **Open a store here** above the existing Find a location. |
| `Location` · 2 Where | Find a location embedded in the flow. The type is fixed to the plan's type, hoods preselected from demand. The picked row opens to rent, deposit and capacity, and **Plan here**. |
| `Investment` · 3 | Installation firm. The toggle carries both totals. One table grouped by reason: firm fee (586 × 225 m²), walls and floors free, required to open, customer demands, building capacity, shelves and fridges copied from your own site of the same layout, deposit. Each item has a reason tag. |
| `InvestmentSelf` · 3b | Self-installation. The shopping list by store (A, B, C), each with its address, items, reason tags and the $250 delivery. Walls and floors are there only because Midtown asks for an interior score of 50. Then the deposit and the total. Beside it the city map with the three stores and the new site pinned at their real addresses. |
| `BreakEven` · 4 | Days to break even for both install modes, the cumulative-profit line crossing both investments, and the expected profit a day from your three liquor stores. Under it the state for a company with no liquor store: both investments, "No estimate". |
| `Checklist` · 5 | Until opening, game linked: 2 of 7, ticks from the save. Lease, furniture, staff for the opening hours (**Hire 11**), uniforms (**Assign uniforms**), customer demands (auto, 5 of 6), marketing (**Set up marketing**), logistics (**Plan a factory ›**). |
| `ChecklistNoLink` · 5b | The same without the game link. Each write button becomes an in-game instruction; Plan a factory stays, since it is the board's own. One strip at the foot: link the game and these become buttons. |
| `AfterOpening` · 6 | The plan attached to the site that opened at 18 Second Avenue, day 21 of trading: invested, profit so far, % paid back, days to go. Chart: cumulative profit and daily bars against the plan line and the investment. Plan and now table. Under it, the paid-back end state that hands over to the site page. |
| `Results` · 7 | Businesses › Results portfolio with **Invested** and **Break even** columns, per chain and per site, and the **Interior: Installation firm / Self-installation** toggle in the controls row. Every break-even state appears once. |
| `SitePanel` · 7b | A liquor store's page: the break-even row sits in the list under the name, beside the site's findings. |
| `SiteStates` · 7c | The row's five states: exact, "by day d at the latest", days to go with % paid back, not paying back at the current profit, unknown. |

## Numbers (synthetic, game rules)

- New site: 18 Second Avenue, Midtown, C1, 225 m², capacity 30/h, rent $402/day (the game's
  building and its rent from `mockup/find-location/data.json`).
- Items: 50 at `Item.defaultMarketPrice` = $71,470. Required: baskets 200, checkout counter
  2,300. Demands: loudspeaker (small) 80, uniform locker 1,950, toilet 380, bathroom stall 2,100,
  sink 220. Capacity: a second counter 2,300. Shelving: 12 Drinks Shelf, 8 Wine Shelf,
  4 Tobacco Shelf (Large), 10 Drinks Fridge (Large), 8 Storage Shelf.
- Firm: 131,850 + 71,470 + deposit 24,120 = **$227,440**. Self: 71,470 + 3 × 250 + walls and
  floors 2,775 + 24,120 = **$99,115**.
- Expected profit: the average of the three own liquor stores over the last 7 days, $7,797.
  Break even ≈ 30 days (firm) and 13 days (self).
- Vendors and their addresses are the game's (`web/wiki-data.json`): Essentials Appliances
  16 Eleventh Street, AJ Pederson & Son 13 Fifth Avenue, Ika Bohag 50 Fourth Street. Pins sit
  at `web/maps/locations.json` anchors.

## Design calls for Peter

1. **Where the view sits.** Expansion gets a fourth view, *Open a store*, between Find a
   location and Plan a factory, with a NEW badge. The view's start page lists saved plans per
   character.
2. **Six steps in the controls row** (What · Where · Investment · Break even · Until opening ·
   Open), each clickable, plus a plan picker. Under them, one **plan strip** (Open / Where /
   Investment / Break even) that stays on every step and changes as the plan fills in.
3. **Investment as one table grouped by reason** for the firm, and **grouped by store** for
   self-installation, with the reason as a tag on each item: green for required, blue for a
   customer demand, orange for building capacity, grey for the product a shelf holds. The
   toggle shows both totals, so the choice is made on the toggle itself.
4. **Shelving comes from your own site of the same type and layout** and says so in the group
   header. With no such site the plan falls back to one display per product (not drawn).
5. **Expected profit = plain average of your sites of that type, last 7 finished days.**
   Alternatives: only the same layout, or scaled by building capacity or by neighbourhood
   (Midtown carries more demands). The break-even step shows both install modes at once.
6. **Checklist order** follows what the player does first: lease, furniture, staff, uniforms,
   customer demands (auto, no button), marketing, logistics. Customer demands is partial when
   one demand is missing. Staff counts people, not hours: "0 of 11 people · Customer Service
   8, Cleaning 3 · open 24/7" (the new-shop default).
7. **Without the link** the write buttons turn into dashed in-game instruction boxes in the
   same place; the step is never hidden.
8. **After opening**: the plan attaches to the site at its address and the stepper reaches Open.
   Once paid back, the plan is done and hands the row to the site page. The chart keeps the
   plan line so the gap between plan and now is visible.
9. **Phase 1, Results**: two new columns, *Invested* and *Break even* (day, and a sub-line in
   plain words). The chain row's day is the chain's own payback. A warehouse reads "With the
   chain". The interior toggle sits at the right of the controls row, labelled "Interior".
10. **Phase 1, site page**: the break-even row uses the findings list's row (mark, icon, one
    sentence, figure on the right) and is lit green once reached. It is not a new KPI tile.

## Open questions

1. **Results at 1280 px.** The shipped portfolio already has nine figure columns (Revenue,
   Wk/wk, Goods, Wages, Rent, Marketing, Theft, Profit, Margin). The artboard leaves the cost
   columns out, so it does not show whether two more fit. Choices: drop Invested into the
   break-even cell's sub-line, scroll sideways, or fold the costs.
2. **In-game paths for the no-link instructions** (MyEmployees for hiring, BizMan › site ›
   Uniforms, BizMan › Marketing) are placeholders and need checking in the game.
3. **Tills sized to building capacity**: the per-till customers per hour comes from
   `Item.addedCustomersPerHour`, not read yet. "2 tills for 30 customers an hour" is assumed.
4. **Deposit's default items** (the empty building's layout, charged with the deposit) are left
   out of the deposit line. Include them?
5. **Delivery**: self-installation counts one $250 delivery contract per store. Should it offer
   carrying the items yourself, which costs nothing?
6. **Paint and flooring** show the cheapest route to a score of 50 (the $5 floor, $30 walls).
   The wall count per layout is known for 13 layouts only.
7. **Chain versus site payback** when the chain's shops are fed by your own factory. The plan's
   expected profit takes the shops' own profit, which flatters them (scope, "Chains"). Keep it,
   or use the chain's profit per shop?
8. **Marketing write** depends on the `marketing-write` branch; the button is drawn as if it
   ships.
