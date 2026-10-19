# Rival intel: what each rival sells and what it has been doing

Scope for the feature list request `request-7b86f8f4dde9b97c84de5022e9007e1683d8372267ef976b94f30af76662a16e`
("라이벌 현황", rival status). The player asked for rivals' business changes, their property
purchases and demand by area. This scope builds two of those:

1. Each rival's income per product, so a player picking a price war can aim at the product
   that earns that rival the most.
2. A short log of what rivals did: shops opened, shops closed, and the buildings each rival
   owns today.

Demand by area is already Growth › Demand and the location finder; leave it alone.

## What the game does (build 3682, read from `BigAmbitions.dll`)

A rival shop's `dailyIncomes` entry is written by `CompetitionHelper.UpdateDailyValuation()`
as `GetEstimatedWeeklyIncome() / 7`. `EstimatedWeeklyIncomeHelper.GetEstimatedWeeklyIncome()`:

```
weekly = productsIncome − dailyMarketRent × 7 − weeklyWages
productsIncome = Σ GetProductBenefit(item) × customersPerWeek      (over registration.retailPrices)
GetProductBenefit(item) =
    (retailPrice − wholesalePrice) × productImpact × amount × productSalesRatio × demand × available
```

- `item` runs over the shop's `retailPrices`. A retail product counts only when the shop's
  layout set has a purchaser for it; a service product always counts.
- `productImpact` is the business type's `GetProductImpact(item)`.
- `amount` is `maxAmountPerProduct` when that is ≤ 1; above 1 it is
  `(1 + maxAmountPerProduct) / 2` for the type's primary product and 1 for the rest.
- `demand` is the neighbourhood's demand for the item ÷ 100 when the item is a demanded
  product and the building type is tagged `sellsphysicalproducts`; otherwise 1.
- `available` is `1 − days/7`, where `days` counts days of the last week a ProductShortage or
  ProductBackorder market event stopped the item (`DaysFromLastWeekThatTheItemWasNotSoldDueToMarketEvents`;
  wholesale-sourced shops look at their own neighbourhood's events, import-sourced at the
  city-wide ones; special rivals are never stopped).
- `customersPerWeek` multiplies every product alike, so it cancels out of any share.

So the split is exact, not a guess. For one shop:

- **Margin share** of product *i* = benefit_i ÷ Σ benefit.
- **Revenue share** of product *i* = the same product with `retailPrice` in place of
  `retailPrice − wholesalePrice`, over the same sum taken that way.

Dollar figures need `customersPerWeek`. Recover it as
`productsIncome ÷ Σ benefit`, where `productsIncome = latest dailyIncome × 7 + dailyMarketRent × 7 + weeklyWages`.
Market rent is `Building.GetBuildingDailyMarketRent()`; check whether the board's
`REAL_ESTATE_*` rent rule is the same function before reusing it. Wages are
`CalculateWeeklyWages(registration, layoutSet, hoursOpenPerWeek)`; read it. If either term
cannot be reproduced from what the save and `ba_store_rules.json` hold, ship shares only and
leave the dollar fields `None`. Do not approximate a term silently.

Most inputs are already committed: `ba_store_rules.json` carries each item's wholesale
price, `productSalesRatio` and demanded flag, and each business type's product impacts and
`maxAmountPerProduct` (`make_store_rules.py`). Check that it also says which product is
primary; if it does not, add it to `make_store_rules.py` and note in the PR that the owner
must re-run it with the game. The neighbourhood demand is what Growth › Demand already reads.

Special rivals can defend with `DefensiveMechanic.PriceReduction` on listed items
(`specialRivalStates[].defenseStates`, `SetItemsToIgnoreByRival()`). Flag such an item on
that rival's rows as `defended`: a price war on it meets a price cut.

The history comes from `marketEvents`: type 0 is BusinessOpened and type 1 is
BusinessClosed (enum `Entities.MarketEventType`), each with day, business name, address,
rival name and business type. The buildings a rival owns today are the registrations whose
`buildingOwnerRivalId` is that rival. `rivalStates[].numberOfBusinessesHistory` holds the
last week's count of businesses.

## Payload

A new section `rivalIntel`, computed on demand (not core: no warning reads it). Follow
`docs/architecture.md`, "Sections" and the payload-key checklist under "Registries". Shape,
fixed so the extraction and the board can be built side by side:

```
rivalIntel = {
  "day": int,
  "rivals": [                         # every company in rivalStates, leaderboard order
    {
      "number": int,                  # _rival_numbers()
      "name": str | None,             # _rival_names()
      "weekly": float,                # _rival_weekly_incomes()
      "shops": int,                   # businesses it runs today
      "buildings": int,               # buildings it owns today (buildingOwnerRivalId)
      "top": str | None,              # item name of its highest-revenue product across all shops
      "products": [                   # across all its shops, highest revenue first
        {
          "item": str,                # ba:itemname_*
          "revenueShare": float,      # % of this rival's product revenue, 0–100
          "marginShare": float,       # % of this rival's product margin, 0–100
          "revenue": float | None,    # $ a day; None when dollars cannot be reproduced
          "margin": float | None,     # $ a day
          "shops": int,               # its shops selling it
          "price": float,             # its median retail price
          "yourPrice": float | None,  # your median price for the item across your shops, None if you don't sell it
          "defended": bool            # a special rival's PriceReduction defense covers it
        }
      ],
      "sites": [                      # its shops, highest daily income first
        {
          "address": str, "hood": str, "type": str,   # business type id
          "name": str, "opened": int, "daily": float, # latest dailyIncomes entry
          "products": [ { "item", "revenueShare", "marginShare", "revenue", "margin", "price", "defended" } ]
        }
      ]
    }
  ],
  "events": [                         # newest first, at most 60
    { "day": int, "kind": "opened" | "closed", "rival": int | None, "rivalName": str | None,
      "business": str, "type": str, "address": str, "hood": str }
  ]
}
```

Names on screen go through the existing item, business-type and neighbourhood name tables;
the payload carries ids. Iterate any set through `_in_order()` and break ties explicitly.

## The board

A new page, Rivals, under the group that holds the market-facing pages (Growth). Follow the
view checklist in `docs/architecture.md`, "Registries".

- A rival picker (leaderboard order, with name or "Rival N", weekly income, shops and
  buildings).
- For the chosen rival: its products, highest revenue first, with revenue share as a bar,
  $ a day when known, its price beside yours, the number of its shops selling it, and a
  "defended" mark. The top row carries a short line saying this is where a price cut hurts
  it most. No advice beyond that.
- Its shops, collapsed by default, each expandable to the same product table.
- A history list below: opened and closed, newest first, filterable to the chosen rival or
  all rivals.
- Read the section through `odNeed()` and draw `odWaitHtml()` while it is missing.
- All text through `tt()` with new keys; prefix new CSS classes (`rv-`), and new top-level
  names must be unique across the board script, `web/map.js`, `web/wiki.js` and `web/i18n.js`.
- Follow the vocabulary rules in `AGENTS.md`.

## Docs and release

- `docs/dashboard-reference.md`: a "Rival intel" section with the formula above and its
  source names, next to "The Rivals leaderboard".
- `web/changelog.json`: one entry (rules in `docs/contributing.md`, "Changelog"), ending
  "Thank you to the player who suggested this on the feature list."
- After merge, the owner retires the request and records it in `docs/community-features.md`.

## Tests

- Python: a new `tests/test_rival_intel.py` over synthetic fixtures (`tests/save_fixtures.py`,
  `tests/es3_fixture.py`), holding the shares to a hand-worked example, the primary-product
  amount rule, the demand and availability factors, the defended flag, and the event log.
  Update the payload snapshots with `python tests/test_payload_snapshot.py --update` and
  review the diff. Run the Sections row in `AGENTS.md`.
- Node: a new `tests/rival_intel.test.cjs` on `tests/_page.cjs` that renders the page from a
  payload with two rivals and checks the order, the top product, your-price column, the
  wait state and the history filter. Then the navigation and alert-kind suites the view
  checklist names, and the i18n suites.
- Owner check before merge: run the extraction on real saves and compare one shop's shares
  against the game's own figure (the sum of the dollar column should match its
  `dailyIncomes` entry plus rent and wages).
