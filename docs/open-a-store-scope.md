# Open a new store and time to break even: scope

28 September 2026. Agreed with Peter in conversation. "Time to break even" is the last idea on
the community ballot (`server/features.json`, id `break-even-time`). It grows into a guided
**Expansion › Open a new store** flow. The factory counterpart is issue #172, not part of this.

## The flow (phases 2 to 4)

A new view under Expansion, beside Demand, Find a location and Plan a factory:

1. **Pick what to open**: a fitting demand from the Demand grid, or a business type chosen directly.
2. **Suggest a location**: Find a location, filtered to that type (`web/map.js`).
3. **Investment**: a shopping list grouped by store, with the stores as map pins, for
   self-installation; or the installation firm's price. It is a toggle, and the deposit always counts.
4. **Break-even indication** for that selection: investment ÷ expected daily profit. The expected
   profit comes from the game's own rules (see "Expected profit" below), not from the player's other
   shops. It is shown as a range, with an after-tax figure, and with an optional financing panel.
5. **Checklist until the store can open.** It ticks itself from the save where it can: required
   furniture placed, every customer demand met, staff covering the opening hours, uniforms set,
   marketing running, logistics set up. Quick buttons: hire from the Headhunter list (mod `hire`
   write), assign uniforms (mod `uniforms` write), set up marketing (a parallel session builds
   the write, branch `marketing-write`), and logistics setup, which links to Plan a factory. It
   links there today and to issue #172's factory flow later. Without the game link, a button
   becomes a short in-game instruction.
6. **After opening: ROI monitoring.** The plan is kept per character, like the finder's saved
   searches. When a save shows a business at the chosen address, the plan attaches to it.

Never suggest opening a store because another is at building capacity (AGENTS.md). The flow
starts only when the player opens it.

## Phase 1: break-even core (closes the ballot)

For every business the player runs:

- **Investment** = furniture + interior + deposit.
  - Furniture: Σ `ItemInstance.priceOnPurchase` over the site's `itemInstances`. Use the item's
    default price when it is 0 or missing, as the game's `GetWorth` does. Stacked children are
    top-level instances too; `stackedItems` entries only reference them.
  - Deposit: `BuildingRegistration.lastDeposit`. Peter decided the deposit counts, although the
    game refunds it on termination.
  - Install mode is a player toggle, remembered per character:
    - **Installation firm**: + 586 × m² of the building (the m² is `ba_buildings.json` `m`).
      Walls and floors cost nothing.
    - **Self-installation**: + the price of every paid wall and floor material on the site
      (the `interiorDesigns` material slots, priced by `InteriorMaterialPreset.price`).
    - Where the save's transaction log still holds the site's `ba:transaction_interiorinstallation`
      (about 7 days), it shows what really happened. That transaction's `transactionData` carries
      the address as text, e.g. "4 3rd Avenue".
- **Profit so far**: Σ `TotalProfit` over `financialSummaries[].businessIncomeStatements` for the
  site. That covers 60 days and includes rent paid before the opening day.
- **Break-even day**: the first day that profit so far ≥ investment.
  - Exact when the lease's first statement is inside the 60-day window.
  - Otherwise "by day d at the latest" if the window alone reaches it, else unknown.
  - Rent paid while a lease stood empty before the save's record is not counted, so a
    business opened inside the record can break even a day or two early on paper.
  - Remember a reached day in the board's history (`History`, `market_history.json`), so it
    survives after the window moves on.
  - Opening day = `creationDay`.
  - Board text: "Break even on day X, Y days after opening".
- **Forward estimate**: (investment − profit so far) ÷ average daily profit over recent finished
  trading days. When profit is ≤ 0, say it is not paying back at the current profit.
- **Chains**: judge payback per chain (`_chains()`). Shops fed by the player's own factories show
  almost no cost of goods, so a shop's own payback flatters it. A chain's investment and profit
  are the sums over its sites, factories and depots included.
- **Where it shows**: a column on Businesses › Results (the portfolio table, per chain and per
  site), and a row in the site panel. The search synonym "break even" (`nav.search.portfolio.breakeven`,
  `tests/search.test.cjs`) now points at it.
- **Item price table**:
  - A new owner-only generator reads the installed game's Addressables bundles with UnityPy,
    like `make_demand_curves.py`.
  - It writes `Item.defaultMarketPrice` and the `type` flags per item from
    `defaultlocalgroup_assets_items_*.bundle`, plus `InteriorMaterialPreset.{uuid, type, price,
    canBePurchased}` from `..._interiormaterialpresets_*.bundle`.
  - It is shipped to `web/py/` and fetched by `web/worker.js`, loaded lazily (AGENTS.md trap).
  - Add it to the generated-files table, and to the game-update check, because prices change
    between builds.
- **Ballot**: remove `break-even-time` from `server/features.json` and update
  `docs/community-features.md`. The vote dialog already handles an empty list.
- **Changelog**: an entry, since this is a new feature.

## Game rules (read from the game on 28 September 2026, validated on real saves)

Full notes and a 791-item price list are local only, in `research/break-even-2026-09-28/` in the
main checkout. The research folder is gitignored.

- **Installation firm bill** = 586 × m² + Σ `Item.defaultMarketPrice` of the layout's items − trade-in.
  - The trade-in is `sellingMultiplier` × worth of what was in the building, stock included.
    `sellingMultiplier` is Easy 0.8, Normal 0.75, Hard 0.5, or the Custom value.
  - Materials are free. Stock is never charged.
  - Sources: `InteriorInstallationFirmContract.GetInstallationPrice`,
    `InteriorInstallationFirmHelper.GetInstallationFee`.
  - Reproduces six real installs to the coin.
- **Self-installation**: items at the default price (vendors hold no furniture prices of their own),
  plus 250 per furniture delivery contract, plus each changed wall or floor slot at its material
  price. No designer fee.
- **Deposit** = ceil(daily rent × 60), 90 for warehouses (`BuildingTypeData.daysToCalculateDeposit`),
  plus the empty building's default items. Refunded on termination.
- **Interior-design demand** is met when the material score ≥ the neighbourhood's
  `minimumInteriorScore`.
  - Midtown's minimum is 50; every other neighbourhood's is 0.
  - Score = floor((min(Σ paid material price ÷ elements, 100) + 100 × paid slots ÷ all slots) ÷ 2).
  - Furniture does not count.
  - Cheapest self-painted route to 50: C1 2,775 and M1 9,190 (grass floors at 5, walls at 30).
  - Element counts are known for 13 layouts; the rest come from the floor-plan bundles.
- **A 100% outfitted store** has:
  - the type's required items (the Wiki's "To open" list);
  - one item per customer demand the type makes: loudspeaker 80 (music), chair 100 (seating),
    sink 220, toilet 380, toilet stall 2,100 (privacy), uniform locker 1,950;
  - the Midtown decor where it applies;
  - tills sized so their customers per hour cover the building capacity;
  - shelving copied from the player's own site of that type and layout, else one display per product.
  - The game itself asks for only one of each required item.
- **Demands per type**: `BusinessType.customerDemandSets`. Each customer carries a demand with
  chance = neighbourhood weight (Midtown 0.9 … Industry City 0.1) × the demand's weight. The
  table is in the research notes.

## Open

- Which gym items give distinct workout types (the gym's variety demand).
- Wall counts for layouts not seen in a save.

## Release and decisions (28 September 2026, later)

- **One release.** Phase 1 does not ship alone. PR #175 stays a draft, and phases 2 to 4 are built on
  branch `break-even-core`. It releases as one update, after PR #174 (the marketing write, mod 0.4.0)
  has shipped, so the marketing button works on day one.
- **The canvas is approved as designed:** https://claude.ai/artifact/BEGQSRsuicrWSpGFsRd4mo (generator
  and NOTES.md on branch `open-store-canvas`, `mockup/open-store/`). The financing panel is new, so
  design it in the canvas's style inside the break-even step.
- **Financing is for planned stores only.** The game books loans to the company, not to a shop.
- **Walls and floors:** Peter believes the installation firm charges for materials. The game code and
  all six real bills say it does not. Peter can confirm in game by changing a blueprint's wall
  material and seeing whether the quote moves. If it does, add materials to firm mode.

## Expected profit (phase 2)

Full rules, sources and validation are in `research/break-even-2026-09-28/PROFIT_MODEL.md`, with
`PROFIT_GAME_RULES.md` and `PROFIT_COSTS.md` beside it. That folder is in the main checkout and
gitignored. Put the rules you implement into `docs/dashboard-reference.md`.

- **Cost of goods:** always the import cost: wholesale price × the save's daily price index × the
  difficulty's price multiplier × any purchasing-agent discount. Never the income statement's
  resources, which are near zero for shops the player's own factories supply.
- **Price:** the highest price every customer accepts, i.e. the default price (or a cheaper rival's)
  × the neighbourhood index, +0.3 with a monopoly.
- **Arrivals per open hour:** ceil(min(C × promo × dayMult × hourMult, C)).
  - C is the size's customer capacity for games started at build 2847 or later.
  - promo = baseCustomerPromotionMultiplier + 0.75 × promotion/100.
  - Pick the best of the 64 marketing combinations automatically.
  - One helper, `_initial_customers(build_at_start, size_cap, type_slug, sqm, products)`, as on
    branch `arrival-ceiling` (which moves the staffing assistant's `_arrival_ceiling()` onto it);
    the plan calls it through `_plan_initial()`.
  - Offices start from the building's customer capacity whatever build the game started on:
    every office in the saves checked on 29 September 2026 bills at the rate that gives, a game
    started on build 2701 among them.
- **Units bought:** units per product = arrivals × sales ratio × neighbourhood demand × satisfaction ×
  the type's factor × the acceptance at that price. Neighbourhood demand falls with the number of
  shops selling the product, and the new shop counts itself, so it also lowers demand at the
  player's own shops in that neighbourhood. Show that.
- **Wages:** the staffing assistant's cost for the predicted hour grid, with the structural formula
  as a fallback. Rent comes from `_rent_estimate`, marketing from the chosen mix.
- **What the board shows:**
  - profit × [0.80, 1.05], and the break-even range that follows;
  - a separate after-tax line (taxPercentage from the difficulty);
  - "your shops of this type earn x% of this", where the player runs that type, as a line and not a
    correction.
- **Validation:** 108 real shops across 4 characters. With each shop's own prices, the median
  actual ÷ model is 0.97, and 70% fall within ±15%. Offices are within about 5%.
  - The board's own model with its planner defaults (`check_profit_model.py`, 29 September 2026,
    each store measured from its first day with sales): on saves without game-changing mods and
    stores open 14 days or more, 55 shops at a median of 0.98 (p25 0.88, p75 1.03, p90 1.16,
    65% within ±15%, 89% within ±30%) and 4 offices at 0.97 on their own staffing; stores in
    their first 14 days, held to the ramp (research RAMP.md), 7 at 0.98; the modded save's 38
    shops at 0.83.
- **Not modelled:** cinemas and theatres come out 2 to 4 times too high, so show them as investment
  only, with no profit estimate. Shelf space per product is also open.

## Financing (phase 2, break-even step)

Full rules are in `research/break-even-2026-09-28/LOANS.md`.

- **Lenders** (`BankSettings`):
  - Vantander Bank: 12% a year over 4 game-years, at most $2,000,000 per bank.
  - Jensen Capital: 20% a year over 2 game-years, at most $40,000.
  - A game-year is `daysPerYear` days (60 in every save). The minimum loan is $500.
- **Interest** is flat on the original amount: floor(L × rate × bankInterestMultiplier / 100 /
  daysPerYear) a day. It does not fall as the loan is repaid. The multiplier is 0.7 on Easy and
  Normal, 1.3 on Hard, or the Custom value.
- **Repayment** is max(5, floor(L / term days)) a day. Both are charged at midnight. Early payoff
  carries no penalty.
- **The most you can borrow** is the lower of two limits:
  - the bank's cap minus what you owe it;
  - max(cash + investments + assets, ¼ × the last 7 days' average daily profit × the term) minus
    everything you owe.
- **What the panel shows:**
  - an amount (up to the investment and that limit) and a lender;
  - the cash needed upfront;
  - the daily repayment + interest against the expected daily profit;
  - the total interest over the term, and with early payoff;
  - the break-even day with and without the loan, side by side.

## Checklist buttons (phase 3)

- **Hire:** the mod's `hire` write.
- **Uniforms:** the mod's `uniforms` write.
- **Marketing:** PR #174's write. Build against its contract in `docs/game-link-api.md` on branch
  `marketing-write` until it merges; the button shows only when the game link lists that write.
- **Logistics:** a link to Plan a factory, and later to issue #172's flow.
- **Without the game link:** each button is a short in-game instruction.
