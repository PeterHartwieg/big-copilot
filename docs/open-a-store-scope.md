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
4. **Break-even indication** for that selection: investment ÷ expected daily profit, where the
   expected profit comes from the player's own sites of the same type. Where they run none, show
   the investment only.
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

## Phase 1: break-even core (ships first, closes the ballot)

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
