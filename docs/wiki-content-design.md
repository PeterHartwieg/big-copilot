# Wiki content and presentation

A first slice of game reference inside Big Copilot, taken directly from the
installed game rather than from any published wiki. This document is the
content design: what is in the game files, how trustworthy each field is, how
it should read on the page, and what has to happen when the game patches.

This is the original content research and design proposal. The approved canvas
is now `mockup/wiki-revamp/big-copilot-wiki.html`; the implemented Wiki lives in
`web/wiki.js` and `web/wiki.css`. The prototype inventory and limitations below
describe that earlier research, not the current implementation. See
[wiki-data-pipeline.md](wiki-data-pipeline.md) for the current build contract.

- **Extracted** 13 September 2026.
- **Sample** the Gift Shop page and everything it reaches: three products, six
  fixtures, three recipes, one workstation, eleven suppliers.
- **Scope** content and presentation only. Extraction infrastructure and the
  navigation change belong to another agent.

## 1. What is actually in there

`StreamingAssets/helpstructure.json` is the game's own table of contents, and
it is the honest measure of how big this could get.

| Category | Pages | In this sample |
| --- | --- | --- |
| Furniture | 522 | 8 |
| Products | 76 | 4 |
| Factory recipes | 62 | 3 |
| Factory ingredients | 61 | 5 |
| Business types | 24 | 3 |
| Employee types | 21 | 2 |
| Vehicles | 19 | 0 |
| Wholesalers & importers | 17 | 6 |
| Factory machines | 17 | 3 |
| Buildings | 10 | 2 |
| General | 9 | 0 |
| Employee management | 7 | 0 |
| Rivals | 4 | 0 |
| Finance | 3 | 0 |
| **Total** | **852 entries, 851 distinct slugs** | **36** |

Each entry is a slug plus a localizor prefix. The prefix resolves in
`locale/en.json` to a title key and a `help_<prefix>_content` key holding
Markdown-ish body text. **All 851 slugs resolve to both a title and a body** —
there are no empty pages. One slug, `furniture-consoletable`, is listed twice.

Three findings that shape the design more than the page count does.

**The help text is a link graph, not a set of articles.** Bodies carry
`[Label](slug)` links, 556 distinct targets across the corpus. Five of those
targets are not page slugs at all — `common_exercise` (used 17 times),
`common_accessories` (5), `common_watchtv`, `common_playcomputer`,
`common_readbooks` — so a renderer has to degrade a dead link to plain text
rather than throw. The other 551 resolve. That graph is the reason this
material suits cards and diagrams: the relationships are already in the data,
they just come out flattened into bullet lists.

**Every address link resolves against the table Big Copilot already ships.**
Help writes suppliers as `[AJ Pederson & Son](address:13 5a)`. There are 63
distinct label/address pairs, and all 63 match a row in `ba_buildings.json`
once `5a` is expanded to `fifthavenue`, `11s` to `eleventhstreet`, and `bw`,
`tur`, `pier` are special-cased. So every supplier on a wiki page can carry a
neighbourhood badge, a size code, a floor area and a traffic index, and can
open the existing map overlay — with no new data and no new geometry work.

**The corpus is not clean.** `address:13 5a` and `address: 13 5a` both appear.
The same pier is "JetCargo Imports" and "Jet Cargo Imports"; "Halcyon Fairway"
is also spelt "Haylcon Fairway". `help_ba:itemname_productdisplaystandtiered_content`
opens `**Product Capacity: 40` and never closes the bold.
`helpstructure.json` is not strict JSON: two trailing commas before a closing
bracket, at lines 636 and one other. A parser that assumes tidy input will
either crash or silently drop a category.

## 2. Provenance, and the three tiers a reader must be able to tell apart

Every fact on a wiki page belongs to exactly one of these. The prototype gives
each a badge, and the badges appear in a legend at the top of the page.

| Tier | Badge | What it means | Example |
| --- | --- | --- | --- |
| Game help | `game help` (blue) | The game's own F1 page says so. A claim about the game, not a measurement of it. | "Customers are self-serving" |
| Asset-checked | `asset-checked` (green) | Confirmed in a second game file, or agreed by both directions of the same file. | Rounded Shelf appears 10 times in the shipped M1 rival gift shop |
| Big Copilot | `Big Copilot` (amber) | Our model or our reading, with the evidence named. | A workstation runs 24 h/day |
| Your save | `your save` (dashed) | Only knowable once a save is open. Never shipped as a value. | Demand for cheap gifts in Midtown |
| Gap | `gap` (red) | The inspected sources do not establish the value. | A sample product's wholesale price |

The distinction is not decorative. Two examples from this sample where it
changes what a reader should believe:

- The help page for **Product Panel** says it can hold Cheap Gift *or*
  Umbrella. All three shipped gift shop layouts — 16 panels between them —
  are set to Umbrella and never to a gift. The help list is what is *allowed*;
  it is not what is *normal*, and the page has to say which it is showing.
- The help page for **Gift Shop** lists three requirements. A fourth is one
  click away: `help_ba:itemname_cashregister_content` says every point of sale
  needs Paper Bags to function. That is a real requirement that the business
  type's own page omits, and it is the single most useful thing on the page.
  It is an *authored* finding — it comes from joining two pages — so it reads
  as a Big Copilot note, not as a game-help bullet.

### Source files

| File | Bytes | sha256 | Modified |
| --- | --- | --- | --- |
| `StreamingAssets/locale/en.json` | 819,793 | `6a000d35aa4fafc4da0449ddc6596e1da2faeb1eac3fd62f2ef09aa740c28f77` | 2026-09-03T05:47:40Z |
| `StreamingAssets/helpstructure.json` | 104,483 | `3cc581d1f52800a8b3dcf7bec8e9bcbc92c661095d56924488e61c91b71a0cf4` | 2026-09-01T20:28:31Z |
| `.../BusinessLayouts/GiftShop/M1/GiftShopRivals.json` | 515,994 | `678f0146d6ce8dea8fbc92d457ba162278e9f99bb689f5d9a81f5c6423ce294c` | 2026-08-28T17:10:28Z |
| `.../BusinessLayouts/GiftShop/D3/GolfAreaGiftShop.json` | 282,041 | `64034d3c664bd00d7b4564a0ad512dfdf1ad9b19d84c748a5e64a1baaa573cdf` | 2026-08-28T17:10:28Z |
| `.../BusinessLayouts/GiftShop/D3/TennisAreaGiftShop.json` | 273,060 | `418dab8ad7526ba7fd4c784f67ba4c376eb52360afa79829b1a501f9d7c7b1e1` | 2026-08-28T17:10:28Z |

`en.json` holds 6,036 keys.

### Build metadata, and what it is not

| What | Value | Read from |
| --- | --- | --- |
| Product | Hovgaard Games / Big Ambitions | `Big Ambitions_Data/app.info` |
| Unity engine | 2022.3.62f2 | version string in `Big Ambitions_Data/globalgamemanagers` |
| Steam app / depot build | app `1331550`, buildid `25231854` | `steamapps/appmanifest_1331550.acf` |
| Save build number | **not observed** | no save was read; shipped layouts have their own authored build numbers |

**The Steam buildid is not the game build number.** It is a depot revision
counter that changes for reasons unrelated to game versioning, and it is not
comparable with the build a save reports — the number `ba_dashboard.py` tracks
as `MIN_BUILD = 3540` and `VERIFIED_BUILD = 3675`. Nothing should print them
side by side or infer one from the other. The install carries no readable game
version, so an extraction cannot self-report which build it belongs to; only
file hashes can.

## 3. What the sample says

### Gift Shop
`help_ba:businesstype_giftshop_content`

Retail building. Customers self-serve. Required: a Stack of Shopping Baskets,
a Point of Sales, and at least one product. Primary range is Gift (Cheap),
Gift (Expensive), Umbrella; it may additionally carry eight products that
belong to other types' main ranges. Staff skills: Customer Service, Cleaning.

`_type_catalogue_from_help` in `ba_dashboard.py` already reads exactly this
block and already drops the "can additionally sell" list, for the same reason
the wiki should keep it behind a disclosure: those products' fixtures,
suppliers and recipes are documented on the pages that own them.

### The three products

| | Gift (Cheap) | Gift (Expensive) | Umbrella |
| --- | --- | --- | --- |
| Goes on | Rounded Shelf (300), Product Panel (100) | Rounded Shelf (300) | Product Panel (100) |
| Wholesale | yes, all six | **no** | yes, all six |
| Import | Bluestone Imports, 4 Pier | Bluestone Imports, 4 Pier | Bluestone Imports, 4 Pier |
| Recipe | Gift (Cheap) Recipe | Gift (Expensive) Recipe | Umbrella Recipe |
| Also sold by | Florist, Bookstore | Florist | Florist, Bookstore |

This is the one place a table earns its keep: three items compared on five
identical axes, where the interesting cell is the single **no**. Everything
else on the page reads better as cards.

Both directions of `en.json` agree. Rounded Shelf and Product Panel are the
only furniture pages in the whole file whose "can be used to sell" block names
a cheap gift, which is exactly what the product page claims. Gift (Expensive)
is absent from the wholesaler product list, which agrees with its own page
saying nothing about wholesale.

### Fixtures

| Fixture | Holds | Customers/h | From |
| --- | --- | --- | --- |
| Rounded Shelf | 300 gifts / 100 flowers | 15 | AJ Pederson & Son only |
| Product Panel | 100 | 10 | AJ Pederson & Son only |
| Stack of Shopping Baskets | — | 30 | four appliance vendors |
| Cash Register | 1,000 | 20 | four appliance vendors |
| Checkout Counter (L/R) | 1,000 | 30 | Pederson, Hampton |
| Storage Shelf | 16 boxes | — | five vendors |

The Cash Register must sit on cabinets or a cocktail bar; the counters stand
alone. Both need Paper Bags. Customer capacity here is the same field
`ba_dashboard.py` already sums into register capacity for the hour-by-hour
grid, and the numbers match what it reads from saves — 30 for a checkout
counter, 20 for a register.

### Recipes

All three run on a Consumer Goods Workstation, which is a Consumer Goods
Assembly Machine plus a Laser Cutting Machine, both from Factory Supply Depot
at 2 25th Street. The same workstation runs twelve recipes, so one line covers
the whole gift shop range.

| Recipe | Per hour in | Per hour out |
| --- | --- | --- |
| Gift (Cheap) | 50 Clay | 100 |
| Gift (Expensive) | 100 Glass, 250 Plastic, 100 Water | 100 |
| Umbrella | 50 Plastic, 100 Metal Wire | 100 |

Ingredient importers: Clay and Metal Wire from Global Harvest Traders (9 Pier),
Glass and Plastic from Maritime Freight Line (7 Pier), Water from Aquatic Bay
Cargo (8 Pier) or Global Harvest Traders.

The per-day figures the prototype shows behind a disclosure — 1,200 clay in,
2,400 gifts out — are **derived**, the game's hourly rate times 24, and are
labelled as Big Copilot's model. The game files state a "Max Production Rate
Per Hour" and say nothing about duty cycle. The 24 comes from measured factory
draw at two of Peter's factories, where every ingredient landed within 0.1% of
it, and it is already the basis of *Plan a chain*.

### Cross-check that came free

`help_building_types_content` gives floor area and customer capacity per size
code. Every one of the 17 code letters that appears in both that table and
`ba_buildings.json` agrees on floor area exactly — A 75, C 225, D 285, H 690,
I 1292, M 1000, Q 2610, T 8496, and the rest. Its retail customer capacities
(C1/C2 30, M1 75) also match the values `dashboard-reference.md` records as
measured from saves. Three independent sources agreeing is worth saying out
loud on the page, because it is the strongest evidence in the whole sample.

Four letters in `ba_buildings.json` — BOAT, E, G, O — have no entry in the help
table at all. E is every wholesaler (1,887 m²), G and O are 2,000 and 660 m².

## 4. How it should read

The material is a link graph flattened into bullet lists. Re-presenting the
bullet lists as bullet lists adds nothing; the value is in restoring the shape.
Six moves, in the order a reader needs them.

**Lead with the decision, not the definition.** The Gift Shop page opens with
one sentence that names the thing that actually shapes a plan: two of the three
products are on every wholesaler's list and the third is not, so the shop opens
without an import contract but cannot carry its premium line without one. That
is authored. It is not in any single help page — it comes from noticing that
Gift (Expensive) is missing from the wholesaler list — and it is exactly the
kind of reading a wiki is for.

**Four glance tiles, then stop.** Building type, serving model, range size,
staff skills. Same tile shape as the board's KPIs, so the page reads as the
same product.

**Group the checklist by when you do it,** not by what the help page happens to
list. The room, the fixtures, the stock, the people. Four small cards, filled
squares for required, hollow for optional, and each line carries where to buy
it. The Paper Bag note sits directly under the checklist as a Big Copilot note,
because it is the one thing the reader will otherwise get wrong.

**One card per product, five facts each.** Goes on / comes from / also sold by,
then source keys behind a disclosure. Capacity travels inside the fixture pill
with its unit — "Rounded Shelf · holds 300" — so the reader never has to hold
a second table in their head.

**Draw the relationship that the bullets hide.** Product → fixture → supply, as
three columns with curved connectors. Picking any node dims everything it does
not touch and writes the same information into a status line, so the diagram is
never the only channel. Solid lines are "goes on"; dashed lines are "comes
from" and pass behind the middle column, because supply reaches a product
without touching its shelf. On a phone the columns stack and the lines are
dropped — the status line carries it instead.

**Recipes as a flow, left to right.** Ingredients with their per-hour rate and
the importer that carries each, an arrow, the workstation, an arrow, the
output. Three of these read faster than one table with nine rows.

Everything optional is a native `<details>`: source keys, per-day arithmetic,
the workstation build, the eight side products, the full Bluestone catalogue,
the six wholesalers — nine disclosures, eight of them closed at rest (the
ninth is the contents rail, open on desktop), all keyboard-accessible for free
because they are native elements.

### What stays a table

Only three things: the three-product comparison above, retail size codes, and
build metadata. All three are genuinely tabular — identical axes, short cells,
scanned rather than read. Everything else became a card, a flow or a diagram.

## 5. Auto-generated versus authored

The split matters because one side survives a patch untouched and the other
does not.

**Auto-generate — roughly 90% of the page.** Business requirements, primary and
additional ranges, staff skills, product fixture lists, fixture capacities and
customer capacities, vendor and importer lists, wholesaler catalogues, recipe
inputs/outputs/workstations, workstation composition, size-code tables, and
every address badge. All of it is regular enough to parse with the regex family
`ba_dashboard.py` already has: `_recipes`, `_workstations`, `_service_stations`
and `_type_catalogue_from_help` between them already cover recipes, machines,
station capacities and business ranges. The wiki needs one more pass over the
product and furniture pages, plus the address resolver described in §1.

**Author — the rest, and it is the reason to have a wiki at all.**

- The one-sentence lede per page.
- Checklist grouping and ordering. The game lists requirements; the grouping
  into room / fixtures / stock / people is a judgement.
- Cross-page findings, such as the Paper Bag dependency.
- Help-versus-runtime observations, such as the Product Panel one.
- Which facts are worth a diagram and which are a footnote.

**Never invent numbers the inspected sources do not establish.** The Gift Shop
sample does not establish rent, furniture purchase costs, or wholesale/import
prices. Other help pages do contain money figures, including vehicle prices.
Profit and margins in the Yours panel must come from the opened save; recipe
daily totals are a clearly labelled calculation from the help's hourly ceiling.

## 6. Keeping it honest across patches

A wiki that quietly shows last patch's numbers is worse than no wiki. Four
rules, three of which reuse machinery the board already has.

**Hash every source file at extraction time and ship the hashes.** They are
already in the data file and already on the page. A hash mismatch on a later
extraction is the signal that something changed. Keep Steam depot revisions,
authored layout builds and a save's build number separate; none establishes
that all help text has been verified against runtime behaviour.

**Diff structurally, not textually.** Compare the extracted objects between two
extractions: recipe rates, capacities, requirement lists, supplier lists, page
inventory. A prose reword should not raise anything; a rate change from 50 to
60 clay should. The diff is the release note for the wiki.

**Carry the extraction date and the checked-against build on the page.** The
board already prints "board checked on build 3675" using `VERIFIED_BUILD`. The
wiki should print the same kind of line, sourced the same way — from a save the
extraction was checked against, not from the installation. When a loaded save
reports a build newer than the wiki's, say so on the page rather than staying
silent. The board already does this for its own figures; the wiring exists.

**Fail loudly, and per field.** If a page's parse comes back short — a
capacity that no longer matches its regex, a supplier address that no longer
resolves — that field shows a `gap` badge and says the source stopped
producing it. It must not fall back to the previously extracted value, because
a stale number that looks fresh is the failure this whole section exists to
prevent. Dropping a whole page for one bad field is the opposite mistake; the
rest of the page is still good.

Authored text is the part that cannot be checked by hash. Each authored block
should record which source keys it was written against, so a structural diff
touching one of those keys flags the prose for review. The prototype's data
file already keeps authored strings next to the keys they came from.

## 7. Fitting the board

The prototype's masthead shows the proposed nav — Today, Company, Supply,
Growth, Map, Wiki — with only Wiki live. That proposal is not this agent's to
implement; it is drawn so the page can be judged in context.

Two joins to existing board machinery, both drawn as labelled placeholders
rather than as links that go nowhere:

- **Map.** Every supplier address resolves to a building, so the existing
  location overlay — the small map button already beside building references —
  works here unchanged.
- **Planner.** A recipe flow should be able to hand its ingredient list to
  *Plan a chain*, which already models machines × rate × 24 and already knows
  the company's standing import orders.

And one panel that only fills in with a save open, kept visually separate from
everything else on the page: demand per neighbourhood, whether you already sell
it, unit cost for materials you buy, rival seller counts. The join key is the
product slug, which `market_history.json` already stores per character — the
sample character's stored day 190 carries all 21 gift and umbrella demand rows,
so this is a real join, not a hoped-for one. At rest the slots show an em dash
and a sentence saying what would fill them. They never show a placeholder
number.

## 8. Gaps, recorded not filled

1. **Prices.** None anywhere in `en.json`. Nothing on a wiki page can carry a
   money figure without a loaded save.
2. **Weekly delivery limits.** The help says every importer and wholesaler caps
   each item per week, resetting Monday 08:00, and never gives a number.
3. **Rated rate is a ceiling.** Nothing in the files says what a line achieves
   in practice, or what happens when an input runs out mid-hour.
4. **Customer capacity by size code is ambiguous.** `C1` is 30 customers as
   retail and 8 as office in the same help table, and `ba_buildings.json`
   stores only the letter, so it cannot tell C1 from C2 either.
5. **Five help links point nowhere** (§1). The renderer must degrade.
6. **Malformed markdown and inconsistent names** in the source (§1).
7. **Which build this is.** Not readable from the installation (§2).
Seven of these are on the page as a `gap` list. The eighth is a per-supplier
flag rather than a corpus-wide gap:

8. **One address badge to spot-check.** `ba_buildings.json` places 4 Pier —
   Bluestone Imports — in Murray Hill, while 7, 8 and 9 Pier are Lower
   Manhattan. Possibly correct, possibly a row to fix. Flagged on the page
   rather than quietly shown.

## 9. Implemented presentation

The approved canvas is `mockup/wiki-revamp/big-copilot-wiki.html`. Its generator
uses the historical sample in `mockup/wiki/wiki-data.js`. Production uses the
separate generated `web/wiki-data.json`, rebuilt from the installed game by
`tools/build_wiki_data.py`; it does not read the mockup's frozen sample.

`web/wiki.js` and `web/wiki.css` implement the category shelf, search, linked
help reader and visual Gift Shop guide. All 851 distinct menu pages are
browsable. Gift Shop has the richer authored arrangement: glance tiles, a setup
checklist, product cards, a selectable relationship graph, recipe flows,
supplier map links and save-specific information. Other articles use the help
reader. The graph follows the current primary range and compatible fixtures.

The shared top navigation is Today, Company, Supply, Growth, Map and Wiki.
Results is the first Company view, followed by Products, Payroll and
Milestones. Existing Results and section bookmarks still work. Supply's former
Map view is labelled Goods flow, keeping its existing saved view identifier.

The Wiki opens without a save from the landing page or a direct bookmark.
The other pages become available once a save is loaded. Local watch mode serves
the same public catalogue; standalone HTML embeds it for offline reading.

Verification is in `tests/wiki.test.cjs`, `tests/wiki-browser.test.cjs`,
`tests/navigation.test.cjs` and `tests/test_wiki_*.py`. Coverage includes corpus
rendering and links, truthful unknowns, keyboard controls, graph resizing and
reduced motion, supplier map focus, mobile light/dark layouts, source-change
propagation, deterministic builds and preserving the last good payload after
a failed extraction. Full real-device and screen-reader testing remain outside
that coverage.

The hosted Wiki is a snapshot. A game update is reflected when the site is
rebuilt from the updated installation; a visitor's game files are not monitored.
Help text can itself lag the game's runtime behaviour. See
[the pipeline contract](wiki-data-pipeline.md) for source hashes, dates, build
identifiers and the distinction between game help, placements and calculations.
