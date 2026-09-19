# The site panel: what a store's page should say

Written 19 September 2026 as the input to a UI/UX design session. This is an
inventory, not a contract. It lists every fact the board warns about for one site,
says where the data already lives, and marks what the site panel shows today. The
layout is the session's to decide; nothing here is settled.

## The problem

`drawSite()` renders seven things: the head, four stat tiles, the hour grid, Crew,
Shelves (or Fees), the profit chart and the week. Fourteen of the twenty-eight
groups in `ALERT_GROUPS` are about a single site, and **eleven of them assert a fact
the panel shows nowhere**.

Two consequences, and the second is the one players hit:

- Arriving from a warning, the sentence is dropped on the way. `goToAlert()` reveals
  a section; it never carries the finding with it, and the destination never repeats
  it. See "How this meets the findings list" below.
- Opening a shop directly — from the portfolio table, the site picker or the map —
  there is no way to learn what is wrong with it at all.

## A. In the business payload, rendered nowhere

`_business()` already writes each of these onto the business row. Only `_alerts()`
reads them. Surfacing them is template work with no change to extraction.

| Fact | Warned by | Field |
| --- | --- | --- |
| Customer satisfaction: overall **and its four parts** | `satisfaction` | `b.satisfaction.overall` / `.service` / `.pricing` / `.cleanliness` / `.facility` |
| Missing customer amenities: bathroom, stall or door, sink, music, interior design | `bathroom` `toiletprivacy` `sink` `music` `interior` | `b.missingAmenities[]`, through `AMENITY_DEMANDS` |
| No uniform locker installed | `uniform` | `b.missingUniformLocker` |
| The roles on this floor with no uniform set, named | `uniform` | `b.uniformGaps[]` |
| Promotion against the 100% cap, split into foot traffic and marketing | `promotion` | `b.promotion`, `b.traffic`, `b.marketingIndex` |
| The game's priority for each unmet staff demand | `jobdemand` | `b.staffDemands[].priority` — the demand is rendered, the priority dropped |
| How many people lack something: site, company-wide, either | `jobdemand` `companydemand` | `b.staffLacking`, `b.staffLackingCompany`, `b.staffLackingAny` |
| Rent per day | `notrading` `vacant` | `b.rent` — reachable only inside the Profit tile's cost tooltip |

The amenity and uniform rows are the largest gap: six warning kinds, and a shop's
own page cannot answer any of them.

## B. In the payload under another key, needing a lookup by site

| Fact | Warned by | Source |
| --- | --- | --- |
| Revenue up or down X% week on week, last-7 against prev-7, with the day range | `trend` | `D.trends` row where `s` is the business index; also carries `key` and `ready` |
| The hype wave over this site: hood, lines, days left, its revenue under the wave against the baseline, and the share of its takings riding on it | `hype` | `D.hypeExposure[].sites[]` — per site `revenue`, `profit`, `share` |
| Which ceiling it hits (door, counters, staff, workstations), when, hours a week, dollars a day through it, **and the fix** | `atcap` | `D.hourFindings` where `kind` is `cap` |
| The overstaffed window: counters on, hours, customers an hour, spare staff-hours, dollars a day of wages | `idlestaff` | `D.hourFindings` where `kind` is `idle` |
| Shelves no plan tops up | `unplanned` | `D.supply.shops` row with no target |
| A shelf emptied before the next drop | `outruns` | `D.supply.shops`, `peakDay` and `peakSold` against `target` |
| An import paused, or a depot running dry, upstream of this shop | `paused` `shortfall` `order` | `D.supply` |

`atcap` and `idlestaff` are the sharpest case: the full sentence is already computed,
already looked up by site key in `drawSite()`, and already rendered — into the hour
grid's `?` tooltip, where it is invisible unless the reader hovers a question mark.

## C. Half-shown: the number is there, the judgement is not

| Fact | What the panel does today |
| --- | --- |
| Not trading, and which of the five reasons: no staff, no prices, no stock, N of M shelves bare, **no delivery plan** | The Shelves table says "no price" per line. There is no trading verdict, and the delivery-plan reason appears nowhere |
| Lost money yesterday | The Profit tile shows a negative figure; nothing marks it as flagged |
| Nobody assigned | Crew says "Nobody assigned" |
| Hours a week at the ceiling | The Door cap tile carries `capHours` and the grid outlines those cells, but not which limit binds or what to do about it |

## Free while the panel is open

Not warned about, in the payload, and rendered nowhere: `b.security`, `b.capacity`
(how many shoppers fit inside at once, not a daily figure) and `crew[].skill` (the
top skill level in each role).

## What the design has to respect

These are properties of the data, not preferences. Getting any of them wrong
produces a panel that lies.

- **Absence is ambiguous, and this is the hardest question in the set.**
  `missingAmenities` is derived from the game's `cachedFulfilledCustomerDemands`,
  which caches only demands it has found *fulfilled*. An absent demand has either
  failed or was never asked for here. `DEMANDS_NOT_MADE` covers the types that never
  ask — hairdressers are not asked about uniforms, florists and theaters not about
  music — so those are dropped rather than reported. But a shop too new to have been
  scored also shows every demand as absent. `_alerts()` handles that with the
  not-trading gate; a permanent block on the panel has no such gate and needs its
  own answer. **A green tick for a demand that was never scored would be a false
  all-clear.**
- **Amenities and uniforms are retail only.** `missing_amenities` is empty for any
  status but `retail`, and `uniformGaps` needs `wants_uniforms`. Offices, warehouses,
  factories and the head office have none, so the block must not sit empty on them.
- **Satisfaction is null outside retail and office**, and the warning only fires when
  the site has customers.
- **A trend needs two full weeks.** `D.trends` rows carry `ready`; a shop open under
  `TREND_MIN_DAYS` has no previous week, and its first days are a ramp. That is "no
  trend yet", not a flat one.
- **A hype baseline can be missing.** `baseline` is null when neither the shop's own
  days before the wave nor a comparable no-hype shop exist. The honest answer there
  is that we cannot say, and the panel has to be able to print it.
- **Shops and offices use different words** throughout: counters against
  workstations, shelves against fees, a visit against an hour billed. `drawSite()`
  already forks on `office`; anything new has to fork too.

## Rough shape, for the session to accept or reject

Two genuinely new blocks fall out of the inventory:

- **Standards** — satisfaction with its four parts, the missing amenities, the
  uniform locker and the roles without a uniform. Retail only.
- **Pull** — promotion against the cap, broken into foot traffic and marketing, with
  security and door capacity beside them.

Everything else belongs with something already on the page: the capacity and
staffing facts with the hour grid, the staff demands with Crew, the week-on-week
figure with the profit chart, the supply facts with the Shelves table.

Open for the session:

1. Where the two new blocks sit against the existing seven, and whether either earns
   a place above the hour grid.
2. Whether a met standard is shown at all, or only the unmet ones. The board's
   standing rules are top-N with show-all, and nothing on a page unless it changes
   whether to intervene — which argues for unmet only, with the rest behind a
   disclosure.
3. How a never-scored shop reads, given the ambiguity above.
4. Whether satisfaction's four parts are always visible or on demand.

## How this meets the findings list

A separate proposal would add a **"Needs attention here"** block at the top of the
panel: `D.alerts` and `D.minor.rows` filtered on `siteKey`, rendered with the
existing `findingRow` grammar. The two are complements and should be designed in one
pass — that block is the headline, and everything inventoried here is the evidence
behind it. Designed separately, each risks restating the other.

## Traps for whoever ports this

From `AGENTS.md`, repeated because both apply here:

- CSS classes are global across every page of the board. A new class needs a feature
  prefix or a scope under its page's root class; `.site` and `.chip` have collided
  before.
- `section{content-visibility:auto}` clips absolutely positioned children. A popover
  rendered inside a section is cut off; hang it off `<body>` with `position:fixed`,
  the way `#tip` and `#alertPop` do.

Touching the `TEMPLATE` markup means `python -m unittest discover -s tests` and
`node --test tests/*.test.cjs`, then `python build_web.py`.
