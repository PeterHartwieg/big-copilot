# Architecture

How a save becomes a board, through either front door. Read this before you change how
Python data reaches the page, add a key to the payload, add a page, or add a template
placeholder. For where files live and what to run afterwards, see [AGENTS.md](../AGENTS.md).
For every table a new finding kind, view, payload key, finder filter, footer link or news
item has to be added to, see [Registries](#registries).

Code is located by search anchor, not line number.

## The two front doors

```mermaid
flowchart TD
  save([".hsg save file"])

  subgraph local["Local CLI — python ba_dashboard.py"]
    direction TB
    save --> load["load_save() · ba_save.py"]
    load --> extract["extract(save, names, history_path)"]
    extract --> payload["the payload dict"]
    payload --> renderL["render(data)"]
    renderL --> out(["dashboard.html"])
    extract -.->|"--watch"| watch["watch() · Board + BoardHandler"]
    watch --> routes["GET /data.json · GET /stamp · POST /name"]
  end

  subgraph web["Browser — bigcopilot.com"]
    direction TB
    bw["build_web.py main()"] --> ri["release_info() · build stamp + newest changelog entry"]
    ri --> ph["page_html(release) · builds the head, fills BEFORE_SCRIPT"]
    chk["build_web.py --check · check()"] -.->|"reuses both"| ri
    ph --> renderW["render(None, live=True, banner=BANNER, before_script=…, head=…)"]
    renderW --> index(["web/index.html + web/py/ + web/version.json"])
    index --> app["web/app.js — landing screen, save picking, owns the worker"]
    app -->|"postMessage build / name"| wk["web/worker.js — Pyodide"]
    wk --> bb["browser_build() → JSON string"]
    bb --> app
    app -->|"window.LEDGER_SOURCE"| board["the board script — let D"]
  end

  routes -->|"the board's default SOURCE polls these"| board
  payload -->|"embedded as /*__DATA__*/"| board
```

Both doors run the same `extract()` and the same `TEMPLATE`. Only the wrapper differs:
locally `main()` calls `load_save()` and `render(data)`; in the browser `web/worker.js` calls
`browser_build()`, which does the same work on Pyodide's virtual filesystem and returns
JSON. A third source feeds either door: the Big Copilot Link mod serves the running
game's own save bytes on loopback HTTP ([game-link-api.md](game-link-api.md)), and
`--game` on the CLI or "Link to the game" in the browser takes the bytes from there.
Those bytes are a normal `.hsg`, so nothing downstream knows where they came from.

## The payload contract

Every top-level key of the dict `extract()` returns, what produces it, and which functions
read it.

**Reader convention.** A reader is a function whose *own body* references `D.<key>` —
`D?.<key>` and `D["<key>"]` included, as is destructuring off `D`. A reference inside an
anonymous callback is credited to the nearest enclosing named function; a nested named
helper is written `outer/inner`, and a callback stored on an object literal is written by
its property path. Functions that only receive the data from a caller are not listed, so
this column is where to look when you change a key's shape — not a complete call graph.

| Key | Produced by | Read by |
| --- | --- | --- |
| `meta` | `extract()` inline, with `_city_date()` and `_difficulty()` | `drawMast`, `drawWeekday`, `drawSite`, `sbData`, `drawSupplyStrip`, `drawFactoriesTab`, `drawFooter`, `fvOpenDiff`, `drawDifficulty`; `web/map.js` `refreshCityMaps`; `web/wiki.js` `wikiGuidePrices` |
| `kpi` | `extract()` inline, with `_net_worth()` | `drawMast`, `drawKpis` |
| `daily` | `_daily_series()`, plus the rolling `profit7` added in `extract()` | `drawChart`, `drawKpis`, `drawKpis/hist` |
| `businesses` | `_business()` per rented non-residential building | `drawPortfolio`, `drawSitePicker`, `openSite`, `siteKeys`, `drawSite`, `drawWeekday`, `supplyChecklistRows` and its locals `lineOf`, `held`, `label`, `factoryView/held`, `alertSite`, `nameUses`, the tab drawers `drawShopsTab`, `drawWarehousesTab`, `drawFactoriesTab` and their row helpers (`sbObject`, `sbDepotRow`, `sbLineRow`, `sbInputRow`, `sbTabOf`), and `drawFactoryStaffing`; `web/map.js` `mapBusinesses`; `web/wiki.js` `wikiOwn`, `wikiGuideOwn`, `wikiGuidePrices` |
| `ownedBuildings` | `_owned_buildings()` | `web/map.js` only: `CityMapView.update`, `openLocationMap` |
| `homes` | `_homes()`, with `m` and `hood` from `load_buildings()` | `spHome`, `siteKeys`; `web/map.js` `CityMapView.update`, `openLocationMap` |
| `products` | `_products()`, with `peak`/`swing`/`weeks` from `_product_rhythm()` | `drawProducts`; `web/wiki.js` `wikiOwn`, `wikiGuideOwn` |
| `staff` | `_staff_summary()` | `drawKpis`, `drawPayroll` |
| `loans` | `_loans()` | `drawKpis`, and the `SS_VIEWS` `cash` entry's `live()` |
| `supply` | `_supply()`; its `facts` from `_supply_facts()`, each fact's status word from `_supply_status()`; `margin` and `roundTo` are `SUPPLY_MARGIN` and `SUPPLY_ROUND_TO` | `supplyChecklistRows`, `sbData`, the tab drawers `drawShopsTab`, `drawWarehousesTab`, `drawFactoriesTab` (with `sbDepotRows`, `sbTabOf`, `sbNodeOpen`), `drawSite`, `drawFlow`, `flowLayout`, `factoryView`; `web/map.js` `refreshCityMaps`. `supply.facts` only through `supplyFact()` (below), and `supply.idle` only through `idleRows()`, which keeps the rows idle under the sizing on screen (`modes`) with their `dem` laid over. `supply.wholesaleShops` (the shops a repeating wholesale contract delivers to) has no board reader: `_alerts()` counts it as a delivery plan |
| `rhythm` | `_chain_rhythm()`; its `recent` key holds the same three series over the last `RHYTHM_RECENT_DAYS` (28) calendar days before the last finished day, which the chart draws, while the full-length ones feed `_supply()` | `weekdaySeries` (which `drawChart` asks), `drawSite` |
| `market` | `_market()`; its `catalogue` key is popped out and handed to `_plan()` | `drawMovers`, `drawMarket`; `web/wiki.js` `wikiOwn`, `wikiGuidePrices` |
| `premises` | `_premises()`, with `_premises_status()`, `_premises_demand()`, `_rent_estimate()`, `_deposit_estimate()`, `_deposit_check()`, `_door_caps()`, `_rival_numbers()`, `_rival_names()` | `drawFindLocation`, `finderPreset`, `wireCards`; `web/map.js` `premises` |
| `chains` | `_chains()` | `drawPortfolio`, `siteCrumbs` |
| `trends` | `_site_trends()` | `indexTrends` |
| `hypeExposure` | `_hype_exposure()`; `extract()` also passes the same list to `_alerts()`, where the `hype` findings come from | `spHypeRow` (a `const` arrow function, called from `spPull()` for the site panel's Promotion block) |
| `hours` | `_hourly()`, the sites with hour reports behind them | `drawSite` |
| `hourFindings` | `_hour_findings()` | `drawSite` |
| `staffing` | `_staffing()`, with `_plan_site()`, `_need_curve()`, `_arrival_ceiling()`, `_cut_run()`, `_bridge_troughs()`, `_hires_for()`, `_plan_people()`, `_current_roster()`, `_index_table()`, `_shift_row()` | `drawSite` through `spRosterBlock`, and `drawOptimizeStaffing` for the Next-moves card |
| `factoryStaffing` | `_factory_staffing()`, once per sizing (`{cap, dem}`), with `_factory_site_plan()`, `_factory_run_start()` and the shop placer `_place_week()`; its hours come from each factory line's `needHours`, `hoursNow` and `_posts` (the machines' ids, set by `_line_hours()` in `_factories()` on each line and on each unnamed line with a recipe, and taken off the payload here, by the line's place in its list) | `drawFactoryStaffing`, through `drawFactoriesTab` |
| `plan` | `_plan()`; its `prices`, `priceFrom` and `priceDay` from `_ingredient_prices()` | `drawPlan`, `planDraw`, `indexPlan`, `factoryView`, `factoryCounts`, `planTypes`, `defaultRate`, `itemName`; `web/wiki.js` `wikiCanPlan` |
| `names` | `_game_names()`: every `NAME_PREFIXES` key of `names.locale` but the `_description`s, plus `HOOD_LABEL` for a neighbourhood the text lacks | `itemName`, `gameName` (and through it `hoodName`), `englishName` (from the English payload), `localiseNames` |
| `skillNames` | `extract()` inline, every skill in `STATION_SKILLS` through `names.label()` | `gwSkillName` |
| `cashFlow` | `_cash_flow()` | `drawKpis` |
| `ledgerDays` | `extract()` inline, `len(ledger)` | no reader — but see below |
| `alerts` | `_alerts()`, its `lines`, with factory lines sized 24/7 | `alertLines()`, which `drawAlerts`, `kindCounts` and `web/map.js` `mapFindings` ask |
| `minor` | `_alerts()`, its `minor`, sized 24/7 | `alertLines()` |
| `alertsDemand` | `_alerts(..., "dem")`, a second pass over the same `supply.facts` with factory lines sized on demand: `{lines, minor}`, the shape of `alerts` and `minor` | `alertLines()`, when the sizing switch reads Demand |
| `goals` | `_goals()` | `drawGoals` |

Four indirect routes an agent would otherwise miss:

- The Supply page's change checklist has one source. `supplyChecklistRows()` gathers the rows
  from `supply`, `businesses` and the plan, `sbData()` caches them with the player's ticks,
  and `drawSupplyStrip()` (the strip under the tabs, Today's Plan imports card, the tab
  badges) and the three tab drawers all read `sbData()` rather than the payload. Change a
  shape in `supply` or `businesses` and it is `supplyChecklistRows()` you have to follow;
  it also fills `gwImportRows`, which the game link's write-back reads.
- The whole location finder reads `premises` through one accessor,
  `const premises = () => D?.premises || null` in `web/map.js`. Every `CityMapView` method
  that ranks, filters or describes a building goes through it, so that one line is the seam
  to follow when the key's shape changes.
- Every supply verdict on the board reads `supply.facts` through one accessor,
  `supplyFact(s, slug)`: the fact for a site index and an item, its 24/7 fields with the
  fact's `dem` laid over them when the sizing switch reads Demand. The three Supply tabs, the checklist, Goods
  flow and the site page all ask it, so none of them computes a verdict of its own; the
  Python twin is `_supply_fact()`, which the findings use. The findings themselves come
  twice, `alerts`/`minor` and `alertsDemand`, and `alertLines()` picks the pair by the same
  switch. A fact's figures (`use`, `need`, `have`, `setTo`, `lower`) are a week's where
  `cad` is weekly (an import or a wholesale delivery brings the item: a depot line, a
  factory input imported direct, a factory's own contract under `import`, a shelf on a
  wholesale contract) and a day's otherwise (a daily top-up brings it: a shelf, a depot
  fed only by a route from your own site, a factory input topped up each morning);
  `parts` is on a week's facts only. The board reads the unit through `szWeekly()`,
  `szDaily()` and `szWeekOf()`. Every (`st`, `why`) pair `_supply_status()` can send
  has a line in `SZ_WHY`; `named` and `unjudged` are the board's own, for a row Python
  has not judged. `tests/fixtures/r8_supply.json` is the board's synthetic payload, and
  `tests/test_supply_facts.py` holds its keys, units and reasons to what `extract()`
  sends.
- The site panel and the map cards are filled from data already in hand, so they do not
  appear above.

One key has no reader: `ledgerDays`. The *key* is unread, but the `ledger` it counts is
what `_cash_flow()` reads. The history write and `history.ledger()` both have to stay.

`hypeExposure` is read: do not delete it. `spHypeRow` draws the site panel's promotion row
from it.

`_hourly()` returns every trading site and flags each `reported`. `extract()` passes the
whole list to `_staffing()` and only the reported ones to the `hours` key and
`_hour_findings()`, so a shop too new to have been measured is planned — its cleaning and
security cover and its hiring lines do not wait on a measurement — without the hour grid
starting to draw an empty week for it.

A site the planner cannot plan still gets a row, `{key, name, typeSlug, failed: true}`
and nothing else, so the page can say so rather than leave a hole where a shop was; a row
without `failed` is a whole plan. Each site is planned against its own copy of the week and
of the bench, written back only once its row is built, so a site that falls over leaves no
phantom hours behind for the next one to hire around.

A `factoryStaffing` row is one factory in one sizing, `{key, s, name, lines, headcount,
wageDay, delta}` and, where it counts them, `unnamedMachines`: `lines` (each line's `slug`,
`item`, `machines`, `hoursNow`, the `hours` it needs a day, the run `from`/`to` and its
`cuts` into shifts of at most 12 hours; a line on a recipe the board cannot name has
`unnamed: true` and `slug` null, all 24 hours sized 24/7 and its hours now sized for
demand), `headcount` (`needed` machine-hours a week, `min`, `have`, `spare`, `hire`, for the
Factory Worker role), `wageDay` (the mean day's wage of the factory's factory workers) and
`delta` (`workers` is `hire - spare`, `perDay` that times `wageDay`). The placer's own
tables (`stations`, `people`, `shifts`, `placed`, `shortHours`) stay in Python:
`_factory_staffing(..., detail=True)` keeps them for the tests. A factory the placer falls
over on is `{key, s, name, failed: true}`. Its lines carry the matching verdict themselves:
`status`/`why`/`level` sized 24/7 (`short` with why `hours`, judged on the week of the
least-rostered machine, or `covered`) and the same under `dem` sized for demand, where more
hours than needed adds `lower`, a suggestion rather than a change; `hoursNow` is that
machine's week in whole hours a day and `thinDay` (`{day, hours}`) the weekday with fewest
hours where it is under that; `demBasis` is `none` where nothing is drawn and Demand also
sizes the line at 24. `supply.factories.sites[]` counts `running` machines (a recipe and
somebody posted) beside the placed ones (`machines`).

A `staffing` row carries two lookup tables, `stations` and `people`, and every row under it
points into them by index rather than repeating an id: `s` a station, `p` a person or null.
A save's ids are 24 characters of base64 and a fragmented site has hundreds of shift rows
between `shifts` and `current.list`, so on the reference save the tables take the key from
210 KB to 90 KB. Those two lists, and only those two, use short keys — `d` weekday, `f` and
`t` the hours a shift runs from and to, `k` the kind of duty, left off entirely on an
ordinary serving shift. `roles[].stations` holds indices into the same `stations` table.

The board reads all of it in one place, `spRosterBlock()` in `drawSite()`, which is reached
only for a `retail` site — an office, a depot, a factory and a home have no row. It builds
its rows through `spRosterRows()`, and the rest of the block is small pure helpers next to
it: `spRosterMeasured()` (does any hour have a basis other than `none`), `spSameDays()`
(which weekday is a copy of which), `spOpenAt()` (are the doors open that hour),
`spNeedAt()` (the need strip's height and its least certain basis for one hour),
`spTickId()`/`spTicksRead()`/`spTicksWrite()`/`spTyped()` (the player's own ticks, in
`localStorage` under `ba_dash_roster:<site key>`, every access wrapped because a browser
may refuse), and `spRosterCounts()`. `drawOptimizeStaffing()` reads the same key for the
Next-moves card, through `spBestRoster()`.

`shifts` carries the lines nobody at the site may legally work as well as the ones somebody
can be put on: same row, `p: null`. The page draws those dashed and cannot tick them.
`spRosterCounts()` returns `{plan, tickable, staffed, hire, now, nowCover, fragments,
coverFragments}`. `staffed` is every drawn line with somebody on it: the new-shop note
counts its entries from it, and `spBestRoster()` scores and sizes the Next-moves card on it.
The progress ring counts `spTickableRows()` instead, as `c.tickable` and `data-tickable`,
which `spRosterBlock()` works out once for the retally to read back. `now` and `fragments`
describe the schedule already in the game, and `nowCover` and `coverFragments` its cleaning
and security half, which is all a cover-only plan replaces. `spDrawn()` is the single rule
for what reaches the page, shared by `spRosterRows()` and the counts, so the two cannot
drift.

A tick's id is the line the player typed — weekday, station id, `f`, `t`, person id — not
the payload's indices, which are renumbered whenever the tables are rebuilt. It is a JSON
array rather than a joined string, because an id is a string out of a save and may contain
whatever separator was picked; and a line whose station or person the save gives no id to
is drawn but not tickable, because there would be nothing to tell it from the next such
line. `spTickId()` returns null for one of those, and `spTickable()` keeps it out of the
counts. That is the
whole invalidation: a plan that changes any part of a line changes its id, the tick stops
matching and the next write drops it. Nothing is migrated; an old-format tick simply never
matches again.

One ceiling and one role: a capped hour's cell carries `data-caps`, a space-separated list
of `<kind>:<skill>` tokens (`door` alone for the building), and a cap chip's `data-show`
carries the same tokens, worked back out of the finding's own words by `spLimitShow()` and
`spLimitRole()`. Hovering a chip lights the cells holding *every* token it names. Keying on
the kind alone let two findings of one kind on two different roles light each other's
hours, and a tie between people and posts light neither's.

The payload crosses the worker boundary as a JSON string: `browser_build()` returns
`json.dumps(data)`. `render(data)` calls `json.dumps` too, so a value that is not
JSON-serialisable breaks **both** doors, not just the browser.

The payload is also meant to be identical across runs of the same save. Set iteration order
follows Python's per-process hash seed, so anywhere a set decides the order of something
that reaches the payload, sort it through `_in_order()` — which puts `None` last, because
real saves hold items with no name. Business lines, factory `arrivals` and `depotOther`
already go through it.

Game names are words; the game's keys are identities. Every payload row that shows an
item, a business type, a skill or a neighbourhood carries its key beside the name
(`slug`, `typeSlug`, `skill`, and a neighbourhood's `hood` or `neighbourhood` *is* its key,
`ba:neighborhood_<id>`), and the page joins, stores and matches on the key only: a name is
looked up to be shown (`gameName()`, `hoodName()`, `itemName()`). The building table
stores the bare `<id>` as `h`; `hood_key()` makes the key. Python's own English sentences
and the few English tables it wrote by name (`RENT_RATES`, the demand history's snapshot
keys) read the English name through `HOOD_LABEL`, and stay as they are.

The footer's **Game names** (site only) shows those names in another of the game's
languages. Python still writes English; the page lays a table over the payload once,
when a board arrives and when the choice changes: `takeData(raw)` sets
`D = localiseNames(raw)`, a copy of the English payload with its names swapped, which
carries the English payload along unenumerated (`dataEn()`). Every draw then reads `D`
as before, and a join inside the payload holds because both sides were swapped alike.
The swap is `gnWalk()`: a name beside its key (`GN_PAIRS`: `item`/`type`/`name`/`demand`
beside `slug`, `type`/`sub` beside `typeSlug` (never `name`, which beside a type is a
business the player or a rival named), `label`/`role` beside `skill`, `label` beside
`demand`, `where` beside `hood`, `workstation` beside `workstationKey`; `GN_LISTS` for parallel lists; any string under a `ba:` key) is
swapped only while it still reads as that key's English name, and `gnUnkeyed()` takes
the few fields Python sends with no key, by the kind of name each holds. Every string
passes `gnString()` on the way, the one place a name inside a sentence is swapped.
Python writes such a name as a token, `tok(key, english)` → U+27E6 `key|English`
U+27E7 (the findings, their summaries, an hour grid's `limit` and `fix`), and
`gnString()` reads it as the table's word or else the English it carries; `plain()`
turns a token back into its English for Python's own reading. Only text that reaches
the page carries one: an alert's `subject` and so its id, the history files and
anything sent to the game stay plain English. A name Python pluralises or lowercases
("the projection booths", "3 gift shops", a chain's "Gift Shops") cannot be a token and
stays English. A board handed to the page anywhere but `takeData()` would show the
tokens raw, which is why every door goes through it. A key the table lacks stays English. `setGameNames(lang)` fetches
`web/names/<lang>.json` with the build stamp and redraws the whole board through
`renderCalm(false)`, the path another save takes; Python never runs again. A join
between a swapped name and Python's English prose (`spLimitRole()`) asks
`englishName(key)` as well. The wiki swaps only what it shows, through `wikiName(key,
english)`, because its matching against the help's own words needs the English.

## UI text

Big Copilot's own words can be shown in another language; German is the first. The
game's names are a separate layer (the footer's Game names, above), and the two meet only
where a sentence holds a name.

**The English stays at the call site, beside a key.** Nothing is looked up in English:

| Where | How |
| --- | --- |
| A script (board script, `web/*.js`) | `tt("sp.tile.size", "Size")`, `tt("f.x", "{n:,} units short", {n})`, `tt("f.m", {one: "{n} machine", other: "{n} machines"}, {n})` |
| Markup (`TEMPLATE`, `BANNER`, `footer_html()`) | `<span data-tt="nav.today">Today</span>`; `data-tt-title`, `data-tt-aria-label`, `data-tt-placeholder` and `data-tt-tip` (for `data-tip`) name the key beside the attribute they fill |
| Python (`ba_dashboard.py`) | `msg("f.loss", "Lost {w:$} yesterday", w=abs(b["profit"]))` |

With no table loaded every one of these gives its English, so an English page is byte for
byte what it was: `tests/i18n_layout.test.cjs` checks the page asks for no table without
`?ui`, and a conversion proves its own English unchanged.

**Keys** are `<area>.<thing>[.<part>]`. The area names the page, and the pull request that
owns it; they are the CSS prefixes: `nav`, `land`, `app`, `foot`, `today`, `f` (findings),
`co`, `sp` (site panel), `sb` (supply), `gr`, `map`, `wiki`, `comm`, `upd`, and `day` for the
weekday names in `web/i18n.js`. `AREAS` in `tools/i18n.py` is the list. A key never ends in
`_one`, `_other` or another plural category: the catalogue writes plurals that way.

**Placeholders** are `{name}` with a small spec that `tt()` and `msg()` both implement. Each
spec writes, in English, exactly what the code it replaces wrote on that side
(`tests/i18n_runtime.test.cjs` against the board's `num()`, `fmt()`, `compact()` and
`toFixed()`; `tests/test_i18n_msg.py` against the f-strings, fractional and negative
values included):

| Spec | English in a script (`tt`) | English in Python (`msg`) | German |
| --- | --- | --- | --- |
| `{x}` | `String(x)` | `f"{x}"` | decimal comma, up to 3 decimals, no grouping |
| `{x:,}` | `num(x)`: grouped, up to 3 decimals, `-1,234.5` | `f"{x:,}"`: `-1,234.5`; a float keeps every digit `repr` shows | `-1.234,5` |
| `{x:.1f}` (any digit) | `num(x, {min = max = 1 decimal, no grouping})`, as `x.toFixed(1)` | `f"{x:.1f}"` | `3,5` |
| `{x:,.0f}` (any digit) | `num(x, {min = max = 0 decimals})` | `f"{x:,.0f}"` | `1.234` |
| `{w:$}` | `fmt(w)`: `-$1,234` | `"-$" + f"{abs(w):,.0f}"` for a negative, `$1,234` otherwise | `-$1.234` |
| `{w:$c}` | `compact(w)`: `$3.57M`, `$751k` | the same, halves rounded up as `Math.round` does | `$3,57M` |
| `{d:day}` | `Monday` for 1 (0 is Sunday) | the same | the table's `day.1` |

The two sides differ only where the old code did: a float with more than three decimals
(`{x:,}`), and a tie at an exact half (Python rounds half to even, `Intl` away from zero).

Numbers follow the UI language: English is always en-US. `tt()` formats through the
board's `num()` once it exists, and through `Intl` in `ttNumLocale()` before it does (the
landing). A param `{m: [key, params, english]}` is a nested message; a script nests by
passing another `tt()` as the param instead.

**Game names** travel as params holding the usual token (`tok()`), so the translation
decides where the name stands and `gnString()` writes it in the names language. The
translator's rule: no article or case ending before a `{name}`, because a name cannot be
declined. Put it after a colon or in apposition ("{item}: läuft 3,5 Tage vor der Lieferung
leer"). Where Python pluralises a name today, pass the count and let the key say it.

**Never build a sentence out of pieces.** `tt("a", "Lost") + " " + fmt(w)` cannot be
translated: word order is the translation's. One key per sentence, with its numbers and
names as params.

### How it runs

- `web/i18n.js` is spliced by `render()` into a `<script>` at the end of the head, at
  `/*__I18N_SCRIPT__*/`: after the stylesheets, so the browser finds those first, and
  before the landing, the board and every other script but the theme's, so `app.js`, `update.js`,
  `community.js`, the board script, `map.js`, `wiki.js` and the local `dashboard.html` can
  all call `tt()`. Its top-level names start `tt`/`TT_`, or are `tApply`, `enOf`,
  `setUiLocale` and `setUiLang`.
- The site's table is `web/i18n/<lang>.json`, fetched with the build stamp
  (`window.LEDGER_BUILD`, which `page_html()` now sets in the head for that reason). Until
  the footer picker ships, the only switch is the developer flag `?ui=de`, which is not
  remembered. While it loads, `html.tt-wait` hides the page for at most 400 ms. A table
  with no keys (the German is empty until its translation lands) counts as English,
  numbers included.
  `document.documentElement.lang` follows the UI language.
- The CLI's `--lang de` carries `web/i18n/de.json` in the page (`cli_ui_table()`, filling
  `/*__UI_TABLE__*/null` inside `web/i18n.js`) when that table is not empty, as it carries
  the names.
- `ttSetTable(lang, table)` puts a table in force, refills the markup (`tApply()`, which
  keeps the English it replaced) and calls every `ttOnChange()` listener. The board's
  listener sets `NUM_LOCALE = ttNumLocale()` (en-US for English, de-DE for German), so
  `num()` and everything built on it follows, then calls `gnRedraw()`:
  `D = localiseNames(D)` and `renderCalm(false)`, the path a names switch takes.
  `NUM_LOCALE` also starts at `ttNumLocale()`, so a `--lang de` page draws German numbers
  from the first frame. `setUiLocale(lang)` sets `<html lang>` and returns the same locale.

### Python's sentences

`msg(key, en, **p)` returns a `Msg`: a `str` whose value is the English sentence Python
always wrote, carrying `.key` and `.p`. Every Python reader and test sees the English as
before. At the end of `extract()`, `_wire_msgs()` walks the payload once and, for every
field holding a `Msg`, adds `row["i18n"][field] = [key, params]` (numbers raw, names as
tokens, a nested `Msg` as `{"m": [key, params, english]}`).

A message that opens a sentence cannot be capitalised by slicing (`limit[:1].upper() +
limit[1:]` is a plain `str`). A cap finding's limit goes through `_cap_first(limit)`
instead: it gives the same English and stays a message, through a sentence-initial key of
its own for the limits that start lower case (`sp.py.limit.staffing.first`, "Staffing";
`registers` and `workstations` likewise), and by capitalising only the first part of a
join. A new lower-case word that can open a sentence gets its `.first` key there.

Words Python makes out of a game name in English (a station's lowered plural,
"projection booths"; "another projection booth") cannot be tokens, because a token
cannot be pluralised or declined. Such a message keeps the English word as its param
and carries the name beside it as a token param as well: `stations` / `station`
plus `station_name` (`⟦ba:itemname_projectionbooth|Projection Booth⟧`) in
`sp.py.limit.station`, `sp.py.noun.station` and `sp.py.fix.role.post`, and `item_name`
in `sp.py.factory.station`. The English template uses the English param; a translation
uses the token ("noch eine Station: {station_name}") and gets the game's own name.
`_sp_station_noun()` builds the noun this way; the grid's `role.noun` stays a plain
`str`, because the page compares it against a limit's English.

What a translation may name is what its calls pass. `extract` records, per key, the
param names of every call site (`msg()`'s keyword arguments; the keys of the object
literal a `tt()` call passes, or none when it passes nothing), and `extract --params`
prints them. Where every call's names can be read, `fits()` lets a translation use any
of them, keeping the English's spec for the params the English prints. It still has to
use every param its English prints, with two exceptions: a passed token param stands in
for its English word (`X_name` for `X`, `station_name` for `stations`), and a `one` or
`zero` plural form may leave out `{n}` ("ein Laden"). A placeholder no call passes, or an
English param left out otherwise, makes it a mismatch, which `ship` drops. Where one
call's names cannot be read (`**said`, a variable, a spread, a computed key) the
translation is held to its English's own placeholders, no more and no fewer, as
before. Plural categories are checked either way.

Concatenating or `.replace()`-ing a `Msg` gives a plain `str`: that row then has no
`i18n` entry and stays English on every page. The loss is visible, not wrong, and the
per-area coverage in `tests/test_i18n_msg.py` (`CONVERTED`) catches it for a converted
area. Ids, `subject`, the history, anything sent to the game and CLI output never use
`msg()`; Python stays English inside.

On the page, `localiseNames()` hands its fresh copy to `ttPayload()`, which, while a table
is loaded, swaps each field its row's `i18n` names and keeps the English it showed on the
row under a symbol key (so `{...row}` copies keep it, and JSON and `Object.keys()` never
see it). **Code that reads Python's words reads `enOf(row, field)`**: the English,
whatever the page shows. `findingAmount()`, `spLimitShow()` (and through it
`spLimitRole()`), the site panel's cap chips (`limitEn()` in `drawSite()`: the
`"the building"` tests, `capSentence`, `spLimitIcons()` and `data-limit`) and its ceiling
strip (`spBindingLimits()`, which `spCeiling()` reads) do; `splitFinding()` only looks for its two English sentence shapes while
the row is shown in English, and its generic cut (`:`, `;`, `. `, the comma within
`HEADLINE_MAX`) works in any language, so a translation puts its headline first and the
detail after `: ` or `; `. Any other comparison against Python's English has to move to
`enOf()` in the pull request that converts its sentence.

### The catalogue and the translations

| File | Role |
| --- | --- |
| `i18n/de.json` | The German, hand-reviewed: flat, `"key": "text"`, plurals as `key_one`/`key_other` |
| `i18n/de.base.json` | The English each German string was translated from, per key. Staleness is measured against it; `python tools/i18n.py accept de [key …]` records it |
| `web/i18n/de.json` | Generated by `python build_web.py` (`tools/i18n.py ship`): `i18n/de.json` minus orphans, placeholder mismatches (a placeholder its calls do not pass; see [Python's sentences](#pythons-sentences)) and stale keys (whose English changed since `de.base.json` recorded it, or was never recorded), which show English until redone and `accept`ed. In `STAMP_INPUTS`, and compared by `--check` |
| `tools/i18n.py` | `extract` (the English catalogue, read off the call sites: a JS lexer over the scripts, an HTML parser over the markup, `ast` over `msg(`), `extract --params` (the params each key's calls pass), `status [--strict]`, `ship`, `accept`, `glossary`, `draft-sheet` |

No English catalogue is committed: it would conflict on every English edit. `extract` builds
it on demand and fails on a key with two English defaults, or a call whose key or English is
not a literal (or holds `${}`). A missing, stale or orphaned translation never fails the
build or the tests: the page falls back to English per key, so an English edit elsewhere
never breaks anybody. `status --strict` fails on them, for a translation pull request.

`glossary de --out <path>` and `draft-sheet de --out <path>` read the installed game's
`en.json` and `de.json` for the game's own words (address form: du, as the game's German
uses). That text is the game's, so both refuse a path inside this checkout (with or
without its `.git`) or inside any other git work tree.

### Converting an area

1. Take the area's prefix (the table above) and the files it owns; nobody else writes keys
   under it.
2. Scripts: wrap each visible string, `tt("sp.tile.size", "Size")`; sentences with numbers
   or names become one key with params. Markup: `data-tt` on the innermost element that
   holds only the words, `data-tt-title` and friends beside attributes. Python: the
   f-string becomes `msg("f.thing", "…{n:,}…", n=…)` with the same English, and any board
   code that parses that sentence reads `enOf(row, field)`. Pick each spec from the old
   code, so the English stays byte for byte:

   | Old code | Template |
   | --- | --- |
   | `${x}` in a script, `f"{x}"` | `{x}` |
   | `num(x)`, `f"{x:,}"` | `{x:,}` |
   | `x.toFixed(1)`, `f"{x:.1f}"` | `{x:.1f}` |
   | `num(x, {minimumFractionDigits: 2, maximumFractionDigits: 2})`, `f"{x:,.2f}"` | `{x:,.2f}` |
   | `num(Math.round(x))` | `{x:,.0f}` for a value that is never an exact half; otherwise round in the caller and pass the whole number as `{x:,}` |
   | `fmt(x)`, `f"${abs(x):,.0f}"`, or `f"${x:,.0f}"` with `x` never negative | `{x:$}` |
   | `f"${x:,.0f}"` where `x` can be negative (writes `$-1,234`) | `${x:,.0f}`: a literal dollar before the placeholder |
   | `compact(x)` / `money(x)` | `{x:$c}` |
   | `WEEKDAY_NAMES[d]`, `WEEKDAYS[d]` | `{d:day}` |
   | a game name, `tok(key, name)` | `{item}` with the token as the param |

   A list joined with `", ".join(...)` in Python becomes `_msg_list(items)`: a nested
   `f.list` ("{a}, {b}") per comma and `f.list.last` for the final pair, both "{a}, {b}" in
   English, so a translation can end the list with its "and" ("a, b und c").
3. Prove the English unchanged: the area's existing tests pass untouched, and a fixture
   board rendered before and after shows the same text.
4. Add the area to `CONVERTED` in `tests/test_i18n_msg.py` (Python fields) and in
   `tests/i18n_layout.test.cjs` (its selector), so English that bypasses `tt()` fails from
   then on.
5. Run the i18n tests and `python build_web.py`. `python tools/i18n.py status de` lists the
   new keys as missing, which is expected until the German is drafted.

## Template placeholders

`TEMPLATE` carries seventeen tokens. All seventeen are substituted by `render()`, but the
text for three of them is supplied by the caller.

| Token | Filled with |
| --- | --- |
| `__TITLE__` | `render()`: `<save name> · Big Copilot`, HTML-escaped because the save name is the player's own text; plain `Big Copilot` when there is no data |
| `/*__DATA__*/null` | `render()`: the `extract()` payload as JSON with `</` escaped, or `null` for the browser build |
| `/*__LIVE__*/false` | `render()`: `true` when called with `live=True` |
| `<!--__BANNER__-->` | `render()`'s `banner=` argument. `build_web.py` passes its `BANNER` (the landing screen); the local page passes nothing |
| `<!--__BEFORE_SCRIPT__-->` | `render()`'s `before_script=` argument. `page_html()` passes a filled-in `BEFORE_SCRIPT`; the local page passes nothing |
| `<!--__CHANGELOG__-->` | `render()`, from `web/changelog.json`, newest first |
| `<!--__FOOTER__-->` | `render()`, from `footer_html(site=...)`. The same function fills the landing's footer inside `BANNER`, so the two cannot drift; `render()`'s `site=` argument decides whether the legal links ride along, and only `build_web.py` passes it |
| `/*__MAP_CSS__*/` | `render()`, from `web/map.css` |
| `/*__MAP_SCRIPT__*/` | `render()`, from `web/map.js` |
| `/*__MAP_PAYLOAD__*/` | `render()`, from `web/maps/locations.json` plus the base64 background — only for a standalone export (`data`, not `live`, not `map_external`) |
| `/*__WIKI_CSS__*/` | `render()`, from `web/wiki.css` if present |
| `/*__WIKI_SCRIPT__*/` | `render()`, from `web/wiki.js` if present |
| `/*__WIKI_PAYLOAD__*/` | `render()`, from `web/wiki-data.json`; skipped when `live=True`, because the hosted build fetches it with the build stamp instead |
| `/*__HOOD_TAGS__*/{}` | `render()`, from `HOOD_TAG` — one neighbourhood-tag table shared by the board and the wiki, keyed by the game's neighbourhood key |
| `/*__HOOD_NAMES__*/{}` | `render()`, from `HOOD_LABEL` — each neighbourhood's English name by the same key: `hoodName()`'s fallback and `hoodKeyOf()`'s way back from a stored name |
| `/*__NAMES__*/null` | `render()`'s `names=` argument, `{lang, names}` from `cli_names()` for `--lang`; `null` elsewhere, where the site fetches `web/names/<lang>.json` instead |
| `/*__I18N_SCRIPT__*/` | `render()`, from `web/i18n.js`, in a `<script>` of its own at the end of the head, after the stylesheets and before the landing and every script but the theme's ([UI text](#ui-text)). Spliced last, at the first marker only, so no other placeholder runs over it |

`web/i18n.js` carries one more, `/*__UI_TABLE__*/null`, which `render()` fills before the
splice from its `ui=` argument: `{lang, table}` from `cli_ui_table()` for `--lang`, `null`
elsewhere, where the site fetches `web/i18n/<lang>.json` instead.

Only the wiki files are optional. `render()` reads them through `optional_asset()`, so a
checkout without `web/wiki.js` still renders a whole board and the Wiki tab is left out of
the navigation (`PAGES` tests for `showWikiRoute`). `web/map.js` and `web/map.css` are
opened directly: delete either and `render()` raises.

`build_web.py` has a second, private set of tokens — `__STAMP__`, `__RELEASE__`,
`__UPDATE_SCRIPT__`, `__BUILD__`, `__ICON_FOLDER__`, `__ICON_LINK__`, `__ICON_MORE__`.
Those are substituted inside `BANNER` and `BEFORE_SCRIPT` before either string reaches
`render()`, so they never appear in `TEMPLATE`. `BANNER` also carries the template's own
`<!--__FOOTER__-->`, which `build_web.py` fills with `footer_html(landing=True, site=True)`.

## Assembly order of `web/index.html`

`main()` prepares `web/`, then hands off: `release_info()` returns the build stamp and the
newest changelog entry, and `page_html(release)` returns the whole page. `main()` itself
never touches the head or `BEFORE_SCRIPT`.

What `page_html()` produces, top of the file down:

1. `<!doctype html>` then `<meta charset="utf-8">`, both emitted by `render()` before the
   template, so the page runs in standards mode.
2. The head `page_html()` builds, in this order: the viewport tag, `window.LEDGER_BUILD`
   (the stamp, set here rather than in `BEFORE_SCRIPT` because `web/i18n.js`, in the
   template's head, fetches a UI table with it) and the `web/community.css` link stamped
   with the release version. There is no analytics
   script, and Cloudflare's automatic Web Analytics injection is switched off for the
   domain, because the privacy notice says the site runs none. `page_html()` then swaps the
   template's Google Fonts links for `web/fonts/fonts.css`, stamped the same way.
3. `TEMPLATE`, whose head scripts are the theme and `web/i18n.js`, with the landing screen
   (`BANNER`) substituted into its `<!--__BANNER__-->` slot: the release banner, the drop
   zone, the save-location help and the footer.
4. `BEFORE_SCRIPT`, filled in by `page_html()` with the stamp, the release JSON and the
   inlined `web/update.js`, in its slot just ahead of the board's own script:
   `window.LEDGER_RELEASE`, `update.js`, `app.js?v=<stamp>`, `community.js?v=<stamp>`.
5. The board script, the last `<script>` block of `TEMPLATE`.

Before any of that, `main()` refreshes `web/wiki-data.json`, copies `ba_save.py`,
`ba_dashboard.py`, `ba_buildings.json` and `ba_demand_curves.json` into `web/py/`, and
writes `web/py/gametext.json` and `web/names/<lang>.json` (`write_name_tables()`) from the installed locale — everything `stamp()` hashes has to be in place before
`release_info()` runs. `main()` then writes `web/index.html` and `web/version.json`.

`ships()` decides what of the locale travels in `gametext.json`, and nothing else does. It
keeps the display names (`NAME_PREFIXES`: items, business types, neighbourhoods,
workstations, skills, and job demands with their descriptions), the `recipes_*` keys and the `help_recipes_*_content` pages, the
workstation help pages (every key under `help_factory_workstation_`), the business-type help
pages, the item help pages whose body contains `Customer Capacity` or `employee station`
(which is how cleaning, computer and security stations travel),
`help_ba:itemname_computergroup_content` (the computers an office puts staff on;
`COMPUTER_GROUP_HELP` in `ba_dashboard.py`), and `help_building_types_content`, which is
where the premises table gets its size-code-to-building-capacity mapping. A page the
analysis needs but `ships()` does not keep is simply absent in the browser, with no error — so adding a lookup means adding its key here and rebuilding.

`python build_web.py --check` calls `check()`, which reuses the same `release_info()` and
`page_html()` and compares their output against what is committed under `web/`. That is why
it needs no installed game: it re-derives the page from the sources and the committed
`gametext.json`, `wiki-data.json` and `web/names/` rather than rebuilding them. `stamp()` normalises CRLF
to LF for everything except the `.svg` background, so a Windows checkout is not stale by
itself.

### The seam: `window.LEDGER_SOURCE`

The board script does not know which door it is behind. It reads
`const SOURCE = window.LEDGER_SOURCE || { ... }`, and the fallback is the local watch
server, with four members: `label` ("Live"), `data()` fetches the `data.json` route,
`name()` POSTs to `name`, and `watch()` polls `stamp` every 15 seconds and pulls fresh
numbers only when the stamp moves.

`web/app.js` sets `window.LEDGER_SOURCE` before the board script runs. It has seven
members. Four satisfy the same contract: `label`, `data()` resolves to a fresh data object
(by posting a `build` message to the worker), `name(rid, slug)` records a factory-line name
and resolves to the data that follows, and `watch(h)` keeps the callbacks `changed(data)`,
`stale(why)` and `lost()`. Three exist only in the browser: `link()` describes the game
link (its writes and character) when one is up, `write(kind, body, opts)` sends a write to
the game, and `refresh()` reads the source again. The board checks
`typeof SOURCE.link === "function"` (and the same for `refresh`) before it calls either, so
the local page runs without them.

The bytes behind `data()` can come from the game link as well as from a folder handle or a
file: when the player has linked the page to the running game, `app.js` fetches
the save from the Big Copilot Link mod on the player's own loopback
([game-link-api.md](game-link-api.md)) and hands the worker the same kind of `File`.

What that does and does not change. On the hosted site the save itself never leaves the
tab: `LEDGER_SOURCE` replaces the three watch-server routes, so nothing about the save is
fetched or posted — unless the player has linked the page to the running game, in which
case `app.js` fetches the bytes from that mod on the player's own machine, and to nowhere
else. The page still uses the network for its own assets, all same-origin.
The static ones are versioned, so a deploy busts their caches: `web/map.js` fetches
`maps/locations.json` with the build stamp and the background image with its own content
hash, `web/wiki.js` fetches `wiki-data.json` with the build stamp, and the board fetches
`names/<lang>.json` with it when a language is picked, and `web/i18n.js` fetches
`i18n/<lang>.json` with it for a UI language. The dynamic ones
carry no version, because the whole point is to see the current state: `web/update.js`
polls `version.json` with `cache: "no-store"`, and `web/community.js` calls
`/api/community/*`. Nothing comes from another origin: `TEMPLATE` links Google Fonts for
the local `dashboard.html`, but `build_web.py` swaps those links for the site's own copies
in `web/fonts/`, so the privacy notice (`web/privacy.html`) can name Cloudflare as the
only party that sees a request. `tests/test_privacy_promises.py` holds the site to that.

Order matters. `BEFORE_SCRIPT` must stay ahead of the board script, or the board falls back
to fetching `data.json` from a site that has no such route.

## Pages

`const PAGES =` in the board script lists the top-level pages; `SUBS` lists the views inside
three of them. Each page is a `div.page` that `showPage()` unhides.

| Page (`id`) | Host element | Drawn by |
| --- | --- | --- |
| Today (`today`) | `pageToday` | `drawKpis` (`#kpis`), `drawAlerts` (`#alertSection`), `drawFindLocation` and `drawOptimizeStaffing` (each card's live count, its sentence about this save and the line naming where it goes); the "Plan imports" card is painted by `paintPlanImports` from `drawSupplyStrip` (the change checklist's strip on Supply, drawn on Today too), with `planImportsState()` counting the same rows and ticks as the checklist |
| Company (`company`) | `pageCompany` | one view at a time — see below |
| Supply (`supply`) | `pageSupply` | one tab at a time — see below |
| Growth (`growth`) | `pageGrowth` | one view at a time — see below |
| Map (`map`) | `pageMap` | `showCityMap` / `refreshCityMaps` in `web/map.js`, which also hosts the location finder as a mode of the page — `openFinder()` switches it on, and `CityMapView` ranks the `premises` rows beside the map |
| Wiki (`wiki`) | `pageWiki` | `wikiVisit` → `showWikiRoute` in `web/wiki.js`; the entry is omitted when `showWikiRoute` is undefined |

Company's views:

| View | Section | Drawn by |
| --- | --- | --- |
| Results | `secDaily` (its By weekday option, `drawWeekday`, replaced the Weekly rhythm section; an old `#secRhythm` link lands here through `SEC_MOVED`), `secPortfolio`, `secDetail` | `drawChart`, `drawPortfolio`, `drawSitePicker` + `drawSite` |
| Products | `secProducts` | `drawProducts` |
| Payroll | `secPayroll` | `drawPayroll` |
| Milestones | `secGoals` | `drawGoals`; the difficulty is not here but a chip at the end of the clock's last line at 1501 px and over (`drawMast`) and, at 1500 px and under, the footer stamp (`drawFooter`, `#footDiff`), built by `fvDiffChip()`, with a body-level popover (`#fvDiffPop`) from `drawDifficulty()` |

Supply's views are three tabs, one per object (R13):

| View | Section | Drawn by |
| --- | --- | --- |
| Shops | `secShops` | `drawShopsTab`: every shelf against tomorrow morning's round |
| Warehouses | `secWarehouses` | `drawWarehousesTab`: every depot, second tier included, with each import line's Set to box (`sbImportCtx()`); a factory input no depot brings is its "No depot" block |
| Factories | `secFactories` | `drawFactoriesTab`: each factory's lines and their hours, its factory inputs and its own imports, then `drawFactoryStaffing()` from `factoryStaffing[sizing]` |

Above the three, `#sbStrip` is the one change checklist (`drawSupplyStrip()`): the done
count, Copy remaining and the reset, over the rows of every tab. It also paints each tab's
badge (`sbBadge()`, through `SUBS.supply.badge`) and Today's Plan imports card, so its
`PAGE_DRAWS` row is tagged for Today and all three tabs. Every tab reads the same rows
through `sbData()`: `supplyChecklistRows()` gathers the facts into the rows each table shows
and hands them to `buildOrderChecklist()`, the single source of what to change (it also
leaves `gwImportRows` for the game link's write-back); the result is kept per board, sizing
and browser-side change (`sbStamp`). A table row carries the tick for the checklist rows about
its site and item (`sbChk()`); any row no table claims is listed under "Other changes" on its
tab, so every change is tickable. A site's tab is `sbTabOf()`: a shop's Shops, a factory's
Factories, every other site's Warehouses.

Needs a change and Everything (`sbWhich`, in memory) and list or diagram (`sbViewMode()`,
`ba_dash_supply_view`) sit in the subhead. The goods-flow diagram is a view of the tab on
screen: `sbPlaceFlow()` moves the one `svg#flow` into that tab's `.sb-diag`, and a click on a
site (`sbNodeOpen()`) goes back to the list on that site's rows. A finding's link, the search
and a diagram click land through `sbLand()`: the tab, Everything where the row is no change, its
group opened, `[data-sb-at]` lit, and a crumb back. Supply's old views still resolve: a
remembered `ba_dash_supply` of `checks` opens Shops, `map` Warehouses with the diagram on, and
`orders` (or none) the tab with the most still to type (`SUPPLY_WAS`, `supplyAuto`); the old
`#secLogistics`, `#secStock` and `#secFlow` links reach their tab through `SEC_PAGE` and
`SEC_MOVED`.

Growth's views:

| View | Section | Drawn by |
| --- | --- | --- |
| Demand | `secMarket` | `drawMovers` (`#movers`) and `drawMarket` (`#market`) |
| Plan a chain | `secPlan`, `secIngredients` | `drawPlan` |

Outside the pages, `drawMast` and `drawFooter` own the masthead and footer, and
`indexTrends` builds the lookup the other draws use. `renderAll()` calls those itself and
works through `PAGE_DRAWS` for the rest, one row per draw function, tagged with the views
(`"today"`, `"company/payroll"`) whose markup it writes, or `""` for a row drawn on every
refresh. `PAGE_ALIASES` keeps old hashes such as `#results` working after a page became a
view.

A live refresh of the same company enters through `renderCalm()`, which also runs the
entrance animations the rebuild started to their end, so nothing slides in again. Only the
board is settled, the search palette with it since a refresh rebuilds its list: an open
dialog and the game-link write toast are left alone. It draws
only the rows tagged for the view on screen, plus the `""` rows, and marks the rest in
`pageStale`; `drawStale()`, called from `showPage()` and `showSub()`, draws them as their
view opens. A row that throws there stays in `pageStale` and is tried again on the next
visit; the page still opens, the other rows due on it still draw, and the Live dot shows
Stale until that row draws or the next board arrives. The first boot and another company
or save draw every row.

Adding a page means: a `div.page` in the markup, an entry in `PAGES` (with `newFeature` if
it deserves a badge — see [contributing.md](contributing.md)) and in `ICON`, a `SEC_PAGE`
row for each of its sections, an `SS_VIEWS` entry so search finds it, and a `PAGE_DRAWS`
row for its draw function. A new view needs its `SUBS` item as well. The full checklist,
with the test that guards each table, is under [Registries](#registries). Tag the row with every
view whose DOM it writes; if other code reads state it computes from another page, tag it
`""` so it is drawn on every refresh. A wrong tag shows old numbers until the next full
redraw. A row calls its function by name, `() => drawX()`, not `drawX` itself, so a test
that stubs `window.drawX` is the one the row runs.

### Routes

The hash is the board's address bar, and `pageFromHash()` / `openHash()` read it. A hash
is one of:

| Hash | Opens |
| --- | --- |
| `#today`, `#company`, … | a page (`PAGES`), on the view it was last left on |
| `#results` | an old page name, through `PAGE_ALIASES`, on the view that replaced it |
| `#secPortfolio`, `#secStock`, … | a section: its page and view (`SEC_PAGE`), scrolled to it by `reveal()` |
| `#wiki/<page>` | a wiki route, handed whole to `showWikiRoute()` in `web/wiki.js` |
| `#site/<slug>` | one site's own page, for example `#site/fifthavenue-57` |

A site's page is the site panel (`drawSite()` in `#secDetail`) shown on its own on Company:
while it is up, `#pageCompany` carries `ss-siteup` and the rest of Results and the Company
views step aside. The slug is the site's key and nothing else, by one reversible rule,
`siteSlugOf(key)`: the `ba:street_` head every key has is dropped, `a-z` and `0-9` stay, `#`
(between the street and the number) is written `-`, and every other character — a literal `-`
and capitals included — is percent-encoded as UTF-8 in lower-case hex. So
`ba:street_fifthavenue#57` is `fifthavenue-57` and `ba:street_a-1` is `a%2d1`; a key without
that head would start `%x`, which no headed key's slug can (`x` is no hex digit), and the bare
head `ba:street_`, whose rest writes nothing, is `%x` alone, which no unheaded key (never empty)
can be. An empty slug is no site on either side. `siteKeyOf(slug)` is the inverse of every
slug `siteSlugOf` writes; other spellings (capitals, upper-case hex, needless escapes) read
back too. `siteBySlug()` is that plus a check that the save holds the key (`siteKeys()`: every
business and home). Two keys never share a slug, and no other site decides a site's slug, so a
site has the same address in every save that holds it. The hash is never passed through
`decodeURIComponent()` first: the slug's escapes are the key's own. A browser may show such
escapes decoded in its address bar, but real keys are lower-case letters, digits and one `#`,
so they never produce one. A site with an empty key has no address and opens under `#company`
as before. `siteSyncAddress()` only trades any other spelling that reads back to the open
site's key (capitals, upper-case hex, needless escapes) for the canonical one, replacing the
entry and keeping its state.

**`siteHref(key)`** is the one way to link to a site: it returns `#site/<slug>`, or `""` for a
site the board cannot address. `siteLink(b)` in `web/map.js` wraps a site's name in that link
(`.ss-sl`), and a capture-phase listener, `siteLinkClick()`, turns a plain click on any
`a[href^="#site/"]` into `openSite()`. It does not stop the click, so anything that closes on a
click elsewhere still hears it; a row a name sits in (a finding, a portfolio row, the picker,
the map card's "its page") asks `inSiteLink(e)` and leaves that click alone. A finding row's
own control is its sentence, a `<button class="what">` labelled by a hidden copy of the site's
name and its own text, so every finding is reached from the keyboard; a silenced row is
`inert`. A modified click is left to the browser and opens the address in a new tab.

A plain click on a site's name records where it was clicked, as a finding, a search and a
question do: the crumb reads "‹ Today", "‹ Shops" or "‹ Map", or names the other site's page
the name sat on, and that is the browser's Back. Two places keep the portfolio as the way back:
the Portfolio's own names and a site page's picker. The crumb row's own "‹ OtherSite" link is
left to `wireSiteCrumbs()` and goes Back rather than opening a new visit. The map's
"its page" (its link and the card's Details action, through `siteOpenOver()`) follows the same
rule when no palette is open; a map card opened from a Portfolio row therefore reads
"‹ Results", the view the card was opened on, rather than "‹ Portfolio".

`openSite(key, scroll, finding, historyMode, cameFrom)` writes the address, `closeSite(chain)`
goes back to the portfolio (to one chain's row, given a chain), and `siteShut()` takes the page
down without going anywhere. `showPage()` takes it down for any page but Company; the nav, a
non-site hash, `reveal()` of any section but `secDetail`, and a Company view other than Results
take it down themselves. Arriving from a finding (`goToAlert()` passes its id) records where
the reader came from in `siteFrom`, and in the history entry's state as `ssFrom`, so the crumb
above the site head reads "‹ Today" and acts as Back, through Back, Forward and a reload too. A
search or a question does the same: `ssOpenSite()`, and `siteOpenOver()` for a site opened from
the map over the open palette, pass `cameFrom`. From another site's page, `siteHereFrom()`
makes that site the way back ("‹ HART. Clothing", its own address), which is where Back goes,
since the palette adds no visit of its own. The site already on screen, opened again, keeps the
way back it had, and an Ask landing's "Back" does what the crumb does. The entry's state is
merged, never replaced: `siteHistoryState()` keeps whatever else a replaced entry carries, and
a new entry starts with only `ssFrom`. An address that answers nothing — a site given up, a
link from another save — lands on the portfolio and replaces the hash with `#company`; so does
a save of another character arriving under an open site's page (`siteFor` against
`siteCharacter()`), which drops the crumb's way back and the lit finding with it.

## Registries

A registry is a table kept by hand that a new thing has to be added to. Nothing generates
them, and a missing row often fails quietly: a finding that goes nowhere when clicked, a
view search cannot find. Each checklist below names the anchor to grep, what goes in it,
and the test that covers the table ("none" means no test reads it). Most of those tests
check the entries that exist today, so none of them fails yet when a new entry is
missing; Change C of issue #100 adds those checks. Until then, extend the covering test
for the new entry. Rows marked
*only if* apply to some entries, not all. All anchors are in `ba_dashboard.py` unless a row
says otherwise; "board script" means the last `<script>` block of its `TEMPLATE`.

### A finding kind

| Anchor | What goes in it | Test that covers it |
| --- | --- | --- |
| The inputs of `def _alerts(` (called twice in `extract()`): `businesses`, `supply`, `trends`, `hype`, `hours`, `grids`; it also takes `chains` but never reads it | Where the finding's numbers come from. A business's single fields (`revenue`, `profit`, `theft`) are its last day only; its `series`, built in the `series.append(` loop of `def _business(`, holds up to 30 days, and `_site_trends()` shows how to sum a week from it. A new per-day figure goes into that loop | the kind's own Python test |
| `note(` in `def _alerts(`, or `_finding(` in one of the `_*_notes` helpers (`_shelf_notes`, `_import_notes`, `_idle_notes`, `_feed_notes`, `_staff_notes`, `_unnamed_notes`) | The finding itself, with its group id | the kind's own Python test, such as `tests/test_routed_supply.py` |
| The hand-built business dicts the tests pass to `_alerts()`: `def stub(` in `tests/test_site_panel_fields.py` (shared with `tests/test_hype_alerts.py`); `def business(` in `tests/test_idle_week.py` (reused by `tests/idle_week_fixture.py` for `tests/site_panel.test.cjs`); `def businesses(self)` on `Company` in `tests/test_supply_facts.py`; `ImportRoutesTests.build()` in `tests/test_import_routes.py`, whose businesses `tests/test_smart_delivery.py` passes on; and the `business()` inside `depot_supply()` in `tests/test_routed_supply.py`, wrapped in `SupplyOnly`, which a `for b in businesses` loop sees as empty but an index `businesses[s]` still reaches. None has `series`; only businesses built by the real `_business()` do | Read a new field with `.get()` and a default, or add it to every one of these, or those tests break | `tests/test_site_panel_fields.py`, `tests/test_hype_alerts.py`, `tests/test_idle_week.py`, `tests/site_panel.test.cjs`, `tests/test_supply_facts.py`, `tests/test_import_routes.py`, `tests/test_smart_delivery.py`, `tests/test_routed_supply.py` |
| `AMENITY_DEMANDS = {` | *Only if* it is an amenity kind: `slug: (group, text)` | `tests/test_uniform_alerts.py`, "test_an_empty_cache_means_every_demand_failed" |
| `ALERT_UNITS = {` | *Only if* its `worth` is money: the unit, such as `"/day rent"` | none |
| `SUMMARIES = {`, and `WORST_FIRST =` for mixed severities | *Only if* three or more at one site should merge into one counted line | none; a missing entry just stops the merge |
| `def _condense(` | *Only if* the kind merges and a field of its own must survive the merge. A merged row is built fresh: it keeps `group`, the key the rows were merged on; from the worst row it keeps `level`, `site`, `siteKey`, `detail` (that row's `text`) and `ev` when present; `text` is the `SUMMARIES` line, `worth` the sum of the rows' non-null worths (or `None` when there are none), `unit` from `ALERT_UNITS`, `id` a new `_alert_id("summary", …)`, and `always` is true if any row's is. Every other field is dropped. Every row, merged or not, also loses `rank` and `subject`, and `always` once the materiality gate has used it | none |
| `const ALERT_GROUPS = [` (board script) | `{id, label, note, on}`. The settings panel, `kindLabel`, `kindCounts`, search and the map's `kindOff` all read it. Keep a noisy kind `on: false` | `tests/alert_kinds.test.cjs`, "At capacity is on by default" and the per-kind tests |
| `const ALERT_DEFAULTS_V1 =` (board script) | Never add to it: it is the frozen migration of old settings | `tests/alert_kinds.test.cjs`, "a stored whole map keeps only …" |
| `const ALERT_LINKS = {` (board script) | Where a click lands: `{sec, tab?, site?, port?}`, where `tab` is a Supply tab (`shops`, `warehouses`, `factories`) or `"site"` for the tab of the site's own kind. Without it `goToAlert()` does nothing | `tests/alert_kinds.test.cjs` per-kind tests and "the supply kinds land on the Supply tab of their object"; `tests/job_demands.test.cjs`, "both demand findings can be filtered and link somewhere" |
| `const ALERT_SITE_PICK = {` (board script) | *Only if* the kind is company-wide, with no site of its own | `tests/job_demands.test.cjs` |
| `const ALERT_LANDS_ON_ROW = new Set(` (board script) | *Only if* the finding is about one shelf, stock or input row | none |
| `const ALERT_EVIDENCE = {` (board script) | The site panel block it lights, `{block, hit?}` | `tests/site_panel.test.cjs`, "the findings here are the ones about this site, and each lights its block" |
| `const SP_EVIDENCE_KIND = {`, `const SP_EVIDENCE_HIT = {` (board script) | *Only if* a depot or factory keeps it in another block, or the hit depends on the site | `tests/alert_kinds.test.cjs` for the first; none for the second |
| `function findingAmount(` (board script) | *Only if* the generic number patterns miss its amount | `tests/alert_kinds.test.cjs`, `tests/job_demands.test.cjs` |
| `const SS_KIND_SYN = {` (board script) | The players' own words for it, for search | `tests/search.test.cjs`, "the index holds every group …" |
| `function ssKindLands(` (board script) | *Only if* the kind's `ALERT_LINKS` entry has no `site`, no `tab` and no `port`, and its `sec` is not `secMarket` or `secPortfolio` (a finding that lands on Payroll or Milestones, say); every other kind already lands where it should | none |
| "What counts as a finding" in `docs/dashboard-reference.md` | The player-facing description | none |

The map colours a finding by its `level` and `kindOff()`, so `web/map.js` needs nothing.
Today `vacant` has no `ALERT_EVIDENCE` entry, most kinds have no `SS_KIND_SYN` entry and
`ALERT_UNITS` holds only the money kinds, so a completeness test has to allow for those.

### A view or a page

| Anchor | What goes in it | Test that covers it |
| --- | --- | --- |
| The markup: `<div class="page" id="page…">` for a page, or `<section class="sec rv" id="sec…" data-sub="…">` inside its page for a view; a page with views also gets its `<nav class="seg" id="…Nav">` | The host element | the navigation tests, indirectly |
| `const PAGES = [` (board script) | *Only for a page*: `{id, label, host, newFeature?}` | `tests/navigation.test.cjs`, "the top row is Today, Company, Supply, Growth, Map, Wiki" |
| `const ICON = {` (board script) | *Only for a page*: its nav icon, keyed by page id | none |
| `const SUBS = {` (board script) | *Only for a view*: its `[id, label, section]` item; a new page with views needs the whole entry | `tests/navigation.test.cjs`, "Company carries Results, Products, Payroll and Milestones" |
| `const SEC_PAGE = {` (board script) | `secX: [page, view]` for every section. Without it `reveal()`, the sub-nav and `pageFromHash()` fail | `tests/navigation.test.cjs`, "every Company section deep link opens the view that holds it"; `tests/alert_kinds.test.cjs`, "the supply kinds land on the Supply tab of their object" |
| `const PAGE_DRAWS = [` (board script) | `["page/view", () => drawX()]`, tagged with every view whose markup it writes | `tests/calm_refresh.test.cjs`, "a refresh on Today draws Today …" |
| `const SS_VIEWS = [` (board script) | `{id, t, p, ic, syn, go}`, so search can open it | `tests/search.test.cjs`, "the index holds every group …" |
| `function showPage(` (board script) | *Only if* the page loads or draws when shown, as the Map does | none |
| `const SB_SEC =`, `const SB_LABEL =`, `const SB_TAB_ICON =` (board script) | *Only for* a new Supply tab: its section, label and icon, keyed by the tab id. Also its `supply` item in `SUBS`; its draw function in `drawSupplyTab()`'s dispatch map (a missing tab draws Shops); `sbTabOf()`, which sorts a site onto a tab; and the tab-keyed objects in `sbData()` (`byTab`), `sbUpdateStrip()` (`sbLeft`) and `ssIdleTab()`; and the tab list in `ssTopupTab()` | `tests/navigation.test.cjs`, "Supply is three tabs, one per object"; `tests/import_routes.test.cjs` |
| `const PAGE_ALIASES =`, `const SEC_MOVED =` (board script) | *Only when* renaming or moving an old page or section | `tests/navigation.test.cjs` |
| `const quietRender =` in `tests/search.test.cjs` | A new draw function, in the list the test stubs | that test |
| `tests/milestones.test.cjs` | Nothing, but mind its four slices, which it runs in a VM: `const fmt =` to `const compact =`, `const attr =` to `/* Tooltips are plain text`, `const plural =` to `/* A rival per dot`, and `function drawGoals(){` to `/* Next moves: the Plan imports card`. A function declared inside one is harmless; a top-level statement there runs in the test, and moving or rewording a start or end anchor breaks the slice | that test |
| The `later()` change in `const MOVED =` in `tests/calm_refresh.test.cjs` | *Only if* the view should prove it redraws on a refresh: the fixture save is `tests/es3_fixture.py`'s `link_company()`, whose lists are often empty (`"Loans": []`), so `later()` has to add the data the view shows | `tests/calm_refresh.test.cjs` |

### A payload key

Nothing between `extract()` and the board filters keys: `browser_build()`, `render()`, the
watch server, `web/worker.js` and `web/app.js` all pass the whole dict through.

| Anchor | What goes in it | Test that covers it |
| --- | --- | --- |
| The `return {` at the end of `def extract(` | `"key": _producer(...)`. It must be JSON-serialisable, with any set ordered through `_in_order()` | only JSON-serialisability: `tests/test_supply_facts.py`, "test_the_payload_carries_the_facts_and_both_passes_of_findings" |
| The payload table in [The payload contract](#the-payload-contract) | A row that follows the reader convention | none |
| The reader, `D.<key>`, in the board script, `web/map.js` or `web/wiki.js` | A reader that survives a missing key (fall back to an empty value), because many Node tests build a partial `D` | indirect |
| `class History:` and the `history.ledger(` / `history.write()` lines in `extract()` | *Only if* the value has to persist between saves | none |

### A finder filter

All in `web/map.js`, covered by `tests/finder.test.cjs`. `saveFinder()` and `loadFinder()`
keep the filters per character in `localStorage`, under `finderStore()`'s
`FINDER_KEY:<character>`. Two things are not stored: the on/off switch, `fs.on` (every load
opens the plain map), and the floor-plan layout pick, `layoutPick`, which a preset or a
saved search clears. The layout pick does not follow the checklist below. Saved searches
are a separate list under `FINDER_SAVED_KEY`.

| Anchor | What goes in it | Test that covers it |
| --- | --- | --- |
| `const finderDefaults = () =>` | The key and its "no limit" default. `finderPick`, `saveFinder`, `resetCharacter` and `savedKey` follow it | "the defaults are visibly chosen on first open …" |
| `setFinder(preset = {}){` | The key in the reset literal | "a preset lands on the column its category ranks by …" |
| `loadFinder(){` | Usually nothing; a retired key goes on its `delete this.fs.` line | "the filters come back with the character …" |
| `finderPanel(){` and `const MAP_WORDS = {` | A `row('rowLabel', …)` control with `data-f="<key>"`; its words are `MAP_WORDS` getters over `tt("map.…")`, which a language switch writes again in place | "the switch is in the map window; every filter lives in the panel" |
| `wireFinder(){`, `paintControls(){` | Nothing for a numeric chip; a new kind of control needs its handler and read-back here | "floor area is a column that sorts, and a filter on every list" |
| `finderRows(){` and `saleRows(){` | The predicate; `const finderFits = (v, lo, hi) =>` for a range | "a type filter re-scores every row …", "the for-sale list answers to the filters still on screen" |
| `savedFilters(s){` | Validation of the stored value | "a saved search is read against this save …" |
| `savedTip(s){` and `function finderRange(` | Its part of a saved search's summary | none for most filters |
| `sortKeys(`, `function finderSortName(`, `finderList(`, and the grid columns in `web/map.css` | *Only if* it is also a sortable column | "the Cap column sits between m² and Upfront …" |
| `def _premises(` in `ba_dashboard.py`, and the fixtures in `tests/finder.test.cjs` | *Only if* it needs a new field on each row | `tests/test_premises.py` (exact row dicts) |
| `function ssFinder(` and the `openFinder({…})` callers (board script), and `function finderPreset(`, which turns a Growth › Demand cell into a preset for `openFinder(go, true)` | *Only if* a caller should preset it | `tests/search.test.cjs`; `tests/finder.test.cjs`, "a Growth cell opens the finder on its own type and neighbourhood" |

A new filter is a user-facing change, so it also gets a `web/changelog.json` entry.

### A footer link

| Anchor | What goes in it | Test that covers it |
| --- | --- | --- |
| The URL constants (`REPO_URL =` to `GAME_MAKER_URL =`) | `NEW_URL = "…"`. Never put a URL in `web/*.js` | `tests/test_privacy_promises.py`, "test_scripts_fetch_only_from_this_site" |
| `def footer_html(` | `{_sf_out(URL, "Label", icon, title=, feature=)}` in its column. One function fills both the board and the landing screen | `tests/test_footer.py`, "test_the_two_homes_do_not_share_an_id"; `tests/restore.test.cjs`, "the board footer offers the game, the channel and the Discord …" (exact link counts) |
| Section 7, "External links and donations", in `web/privacy.html` | The provider's name in its list | none |
| `feature=` on `_sf_out` | *Only for* a New badge; see [contributing.md](contributing.md) | none |

Then `python build_web.py`.

### A news item

| Anchor | What goes in it | Test that covers it |
| --- | --- | --- |
| `<aside class="news-strip" id="newsStrip" data-news-id="…">` in `BANNER` in `build_web.py` | A new `data-news-id`, so it shows again to anyone who dismissed the last one; the `.news-copy` text; the `#newsLink` href, which is written out rather than taken from `WORKSHOP_URL` | `tests/news.test.cjs`, "the strip shows on first load with its text, Workshop link and named Dismiss" |
| `.news-strip{` in `BANNER`'s `<style>` | *Only for* a layout change | `tests/news.test.cjs`, the "stack without overlap" tests |
| `/* One-time news strip (#newsStrip in build_web.py)` in `web/update.js` | Nothing; it shows and dismisses the strip, remembered under `bc_news_dismissed` | `tests/news.test.cjs`, "Dismiss hides the strip …" |

`tests/news.test.cjs` reads the built `web/index.html`, so run `python build_web.py` before it.

## Pyodide

`web/worker.js` is a **module worker** — some embedders refuse a cross-origin
`importScripts` but allow a dynamic `import`. Pyodide is pinned to **314.0.6** and served
from this site, out of `web/pyodide/v314.0.6/`, so no visitor's IP address reaches a CDN.
With no `loadPackage` call, `loadPyodide` needs five files: `pyodide.mjs`,
`pyodide.asm.mjs`, `pyodide.asm.wasm`, `python_stdlib.zip` and `pyodide-lock.json`, plus
Pyodide's `LICENSE` (MPL-2.0) beside them. They are committed, not fetched at deploy time,
because a deploy from a checkout that lacks them would remove them from the site.
`web/_headers` caches the versioned folder as immutable. To upgrade, download the same
files from `https://cdn.jsdelivr.net/pyodide/v<version>/full/` into a new version folder,
change `PYODIDE_VERSION` in `web/worker.js`, and delete the old folder.

Everything else it fetches is same-origin, from `web/py/`, carrying the page's build stamp:

- `ba_save.py` and `ba_dashboard.py` — a failed fetch throws and the worker never becomes
  ready.
- `gametext.json`, `ba_buildings.json` and `ba_demand_curves.json` — written into the
  virtual filesystem only when the fetch succeeds, so a build missing one still boots and
  degrades instead: without the curves the board states no arrival ceiling, and every number
  it does state still comes off the measured hour grid.

On top of those, the worker writes at runtime: the save bytes under `/save`, the player's
optional `en.json` and the history JSON under `/data`, and Python itself writes a
`<history>.character` sidecar. Nothing else exists on that filesystem — which is why
`ba_dashboard` must not open a file at import time. See the trap in
[AGENTS.md](../AGENTS.md).

Two entry points, both called through `py.runPython` with paths interpolated as JSON:

- `browser_build(save_path, locale_path, history_path, names_path)` — parse, extract, and
  return the payload as a JSON string. It also writes `<history_path>.character` so a later
  name can be filed under the right company without reparsing the save.
- `browser_name(history_path, rid, slug)` — record a factory-line name; the worker then
  rebuilds from the save already in the filesystem.

Two traps:

- `JSON.stringify(null)` produces JavaScript's `null`, which Python does not know. When you
  interpolate a nullable argument into a `runPython` string, emit `None` yourself — see how
  `pySlug` is built before `browser_name`.
- `FS.utime` takes **milliseconds**, the same unit the browser's `File.lastModified` gives.
  The board's "saved" stamp reads that modification time, so getting the unit wrong shows a
  save from 1970.

## Community API

`server/worker.mjs` is a dependency-free Cloudflare Worker serving three routes —
`POST /api/community/presence`, `POST /api/community/vote`, `GET /api/community/features` —
backed by D1 (`migrations/0001_community.sql`) and a curated `server/features.json`. It
lives outside `web/` on purpose: `web/worker.js` is the in-browser Python worker and must
stay independent of it. `wrangler.jsonc` serves `web/` as static assets and runs the Worker
first only for `/api/*`. The page side is `web/community.js` and `web/community.css`, which
only the browser build includes. Setup, secrets and the release steps:
[community-features.md](community-features.md).

## Wiki pipeline

`tools/build_wiki_data.py` reads the installed game — the shipped locale, the help menu's
table of contents, `ba_buildings.json` and the shipped business layouts — plus two
hand-authored files beside it, and writes `web/wiki-data.json`.

The two authored inputs do different jobs. `tools/wiki_sample.json` holds wording the
builder fills with facts (labels, notes, the gap sentences). `tools/wiki_topics.json` holds
whole articles — "How rent works" is the first — which travel through as the payload's
`topics`: they are the one part of the file the game does not write, so each carries its own
provenance line saying what it was checked against. Both are stamp inputs, so editing either
changes the build stamp.

The game-read page records are one per **unique help-page slug that has content**, in menu
order, not one per help-menu entry. `build_pages()` drops two kinds of entry and reports both rather
than swallowing them: a duplicate of an already emitted slug (the shipped file has one such
double entry, whose second prefix is unreachable through that slug), and a page whose body
the locale does not carry, since a record with no body would be an empty page rather than a
fact. The order of those two tests matters: a slug is only recorded as seen once it has been
emitted, so a later entry for a slug whose earlier one had no content is kept, not counted a
duplicate. Alongside the pages the payload carries the worked example, a guide per
customer-facing business type, and the `topics`.

For the game-read pages and the `wiki_sample.json` fill, no number is invented: what the game
does not state stays `null`, and any sentence whose facts cannot be filled is left out rather
than guessed. The hand-written `topics` are the exception by design (the rent article carries
fitted district rates) and say so in their own provenance lines. `build_web.py` calls
`write_public_wiki` before stamping, so the site always ships the payload its pages were
built against. Details:
[wiki-data-pipeline.md](wiki-data-pipeline.md).
