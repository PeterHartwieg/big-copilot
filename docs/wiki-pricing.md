# Wiki pricing

Business guides show prices from the loaded save, grouped by neighbourhood.
Each matching player-operated shop has its own configured price for every
primary or secondary product/service. Matching uses business-type and item
identifiers. Missing prices say “Not set”; explicit zero displays $0.00.
Shops with no known neighbourhood stay visible in an “Unknown neighbourhood”
group. Vacant leases are excluded. The older product-page sales figure is
labelled “Average sold price”.

The “Lowest market price” column reconstructs the observed minimum used by
MarketInsider. It includes player shops and other business types selling the
same item, excludes temporarily closed or unnamed businesses and nonpositive
prices, and keeps neighbourhoods separate. Prices retain cents. No private
prices are written into the public reference catalogue.

This deliberately small implementation withholds market prices when the save
contains an active type 3 or 4 supplier event for that item,
because the game's rival eligibility then depends on supplier/shortage logic
we have not reproduced. Expired, future, stopped and duration-less events do
not block prices; neither do event types 5/6 or events with no item. The first
day of an active supplier event is conservatively withheld too, although the
game skips it in the shelf check. An unmapped eligible seller also withholds that item's
market prices. If no seller qualifies, the game uses a fallback based on asset
prices, neighbourhood price indices and monopoly; we show “Unavailable” with
an explanation until those inputs are verified. Your configured prices still
display in these cases. MarketInsider also caches its values, so a freshly
reconstructed minimum may differ from an older display in the running game.

The eligibility rules were read from `ItemHelper.GetLowestMarketPrice` and
`PlayerItemPurchaser.GetShelfFillState` in the installed `BigAmbitions.dll`
(SHA-256 `c19ac9cb362a491d6956c00a3a38581cfe2608479813c2e597c8a811d292377d`).
`MarketDemandScrollerController.LoadDemands` calls that price helper when
building the MarketInsider table. Outside supplier events, the shelf helper
returns positive availability; player businesses bypass its availability
check. Follow-up inspection of `MarketEvent.IsActive` confirmed the day window
(`startDay <= day < startDay + durationInDays`, unless stopped), and
`ProductMarketHelper.IsProductInMarketEvent` / `GetMarketEvent` confirmed exact
event-type matching and exclusion of empty item names. These prices are
comparisons, not recommended prices or profit claims.

Verification: `tests/test_wiki_prices.py`, pricing cases in
`tests/wiki-guides.test.cjs`, and the desktop/mobile pricing case in
`tests/wiki-browser.test.cjs`. A live game UI comparison remains outstanding;
do not describe this as verified identical to the running display.
