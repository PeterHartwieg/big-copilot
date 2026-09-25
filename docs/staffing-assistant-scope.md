# Optimize staffing: technical scope

Status: retail staffing shipped (PR #58, 19 September 2026, reworked in PRs #59 and #61);
offices and factories are still deferred. Kept in place because `ba_dashboard.py` cites it.
Wording on the board follows the vocabulary rules in AGENTS.md, not this document.

Written 19 September 2026. Scopes the third **Next moves** card, which has read
`SOON` since the revamp: *"Shifts from the hour grid: registers, door caps and
who is off today."*

Decisions taken, 19 September 2026. All of them are settled; section 10 records
them rather than asking.

- **Retail sites only** in v1. Offices and factories are deferred, and what is
  lost by deferring them is stated under *Deferred*.
- **Clear and re-enter**: the plan replaces a site's whole schedule rather than
  patching it. This is load-bearing — see *Cleaning* and *Non-register stations*.
- **Tier 1 + 2**: the demand work and the roster builder, not opening hours.
- **The UI is a separate session.** This document stops at the payload contract
  and says nothing about layout. Where a number has to be qualified on screen,
  it says which flag carries the qualification, not how it is drawn.
- **The station-table fix ships first, as its own PR** (section 3).
- **Cleaning and security get full opening-hour cover**, not a derived need.
- **The staff pool is everyone assigned to the site plus the unassigned bench.**
- **Hiring is a per-site total**, not a per-slot line.
- **Slack is capped at 10% over need**, and troughs are bridged greedily inside
  that budget.

Everything under *The rules* and *What retail actually is* was read from build
3680 (`BigAmbitions.dll`, the Addressables bundles, the shipped locale) or
measured on `HART. YT`, and is quoted with its source.

---

## 1. The problem

The board diagnoses staffing and never prescribes. `atcap` names the hours that
turn people away and which ceiling binds; `idlestaff` names the overstaffed
window; `staff` names a site with nobody on; `jobdemand` names whose demands go
unmet. None of them says what roster to enter instead, and the player is left in
front of a seven-day drag-and-drop grid.

The game's own answer is poor. Auto-fill needs an HR manager, warns it "may
produce more fragmented schedule", and on `HART. YT` produces:

| Retail site | Station shifts/wk | Cleaning shifts/wk | 2-hour fragments |
| --- | --- | --- | --- |
| Second Avenue 12, clothing store | 125 | 57 | 147 of 182 |
| Ninth Avenue 3, clothing store | 125 | 57 | 147 of 182 |
| Ocean Crest Road 4, clothing store | 125 | 57 | 147 of 182 |
| Fifth Avenue 57, clothing store | 72 | 36 | 7 of 108 |
| Second Avenue 2 / Fifth Avenue 24 / Fifth Avenue 46, gyms | 49 | 28 | 0 of 77 |

Three of the seven retail sites are four-fifths two-hour fragments. A 12-hour
roster for a three-station 24-hour shop is **42 shifts a week**, against 182.

---

## 2. The rules

Read from `BigAmbitions.dll` at build 3680 unless marked otherwise. These bound
any roster the board may suggest.

| Rule | Value | Source |
| --- | --- | --- |
| Longest single shift | **12 hours** | `ScheduleHelper.ShiftLengthCap`, `ScheduleAutoFiller.MaxEmployeeHoursPerDay`; corroborated — no shift in `HART. YT` exceeds 12 |
| Overworked, raises sickness | **more than 14 h in a day** | `ScheduleHelper.GetOverworkedDays` |
| Weekly hours, full-time | 30–50 | `JOB_DEMANDS`, already in `ba_dashboard.py` |
| Weekly hours, part-time | 10–30 | same |
| Days a week | exactly 4 or exactly 5, when demanded | same |
| Blackout windows | mornings 6–10, afternoons 14–16, evenings 18–22, nights 22–24 and 0–4 | same; the test is **any overlap** with a shift on an open day of that employee's own building |
| Free weekends | no shift on days 6 or 7 | same |
| One person per station per hour | yes | `ScheduleAutoFiller.AddMaxOneEmployeePerWorkstationConstraint` |
| One shift per person per hour | yes | `AddMaxOneShiftPerEmployeeConstraint` |
| Station needs a matching skill | yes | `STATION_SKILLS`, already in `ba_dashboard.py` |
| Cleaning shifts | type 0, unbound from opening hours, may run to 24 | `ScheduleHelper.CalculateEndingHour` |
| Dragging a name onto a station | defaults the shift to **the end of the opening slot** | same |

Two consequences:

- **12 divides a 24-hour day exactly twice.** Every open day on `HART. YT` is a
  single contiguous slot (74 open days, one `openingHourSlot` each), and most are
  `0–24`. Two shifts per station per day is the whole answer there, and the game
  will not accept anything longer.
- **The fragmentation is auto-fill's, not the UI's.** A human entering the
  board's plan by hand gets long shifts almost for free, because the default drag
  already runs to the end of opening hours.

### What the player types into

BizMan › the business › **Schedule**. One day at a time: rows are workstations,
columns hours, drag a name onto a row and adjust the ends. Per day there is
**Copy schedule**, **Paste schedule**, **Paste schedule to all days** and
**Clear schedule**; per business, **Clear entire schedule**.

So the atom of instruction is *day, station, hours, person* — one line. Where two
days are identical the instruction can be "copy Monday, paste, swap these two"
instead of reprinting the day. **Paste-to-all-days is rarely usable**: it copies
the people too, and nobody can legally work seven twelve-hour days.

---

## 3. What "retail" actually is

This is the correction that most changes the shape of the work. **A retail site
is not a row of cash registers.**

Every serving station's help page names its required skill and its throughput in
one sentence, and the locale the board already ships carries all of them:

| Station | Skill | Customers/hour |
| --- | --- | --- |
| Cash register | Customer Service | 20 |
| Checkout counter left/right | Customer Service | 30 |
| Coat check left/right, concessions register, ticket booth | Customer Service | 50 |
| Fitness planning board | Gym Trainer | 20 |
| Hairdresser chair / modern | Hair Stylist | 5 |
| Hairdresser headwash | Hair Stylist | 10 |
| DJ booth | DJ | 50 |
| Projection booth | Projectionist | 25 |
| Costume / lighting / sound booth | Stage Crew | 100 |
| Dressing room | Actor | 80 |
| Security guard locker | Security Guard | — (no queue) |
| Cleaning station | Cleaning | — (no queue) |

19 employee stations, 17 with a throughput. `_service_stations()` today filters
on `"Customer Service" in station`, so it sees seven of them. That is why a gym
has `staffed == 0` on every hour of its grid: its three fitness planning boards
are invisible, `_capped_cells()` skips it because `effective` is falsy, and
`idlestaff` skips it because `onShift` is zero. **Gyms, hairdressers, theatres
and nightclubs get no staffing findings at all today.**

### PR 1: the station table

**Decided: this ships on its own, before the roster builder.** It is a bug fix in
extraction, it is user-facing on its own — four business types start getting
`atcap` and `idlestaff` findings that they have never had — and it leaves the
staffing branch a clean base to start from.

- `_service_stations()` returns `{item: (skill, rate)}` for any employee station
  with a Customer Capacity, rather than filtering to Customer Service.
- `_serves()` becomes per-station — does this person hold the skill *this
  station* requires — rather than one global `SERVICE_SKILL`.
- `_hourly()`'s `staffed` grid becomes **per skill group**, not one total.
- Multi-role types resolve as a **minimum across roles**.

That last point is where the model has to be careful. A clothing store has one
role and its capacity is the sum of its manned registers. A theatre has four
(ticket booth, projection, stage crew, dressing room) and a customer passes
through all of them, so the site's throughput is the minimum across roles, and
the sum only within a role. It degrades to today's behaviour for every
single-role type, which is most of them.

The `atcap` `limit` and `fix` strings fork per role here too: "another counter"
is wrong for a gym, and the existing office fork is the precedent.

### PR 1 also carries issue #51

[#51, "Overstaffed filter"](https://github.com/PeterHartwieg/big-copilot/issues/51)
(fragtzack, 19 Sep 2026): *"On the Today screen: Filters of Needs Attention
section: 'Overstaffed filter' continues to show regardless of setting."*

Confirmed, and it is a real bug rather than a disagreement with the demotion
design. `drawAlerts()` filters `D.alerts` through `kindOn`, but the smaller list
it builds is `D.minor.rows.concat(D.alerts.filter(not kindOn))` — **`D.minor.rows`
is never filtered by `alertGroupPrefs` at all.** Every finding that fell below the
materiality gate therefore ignores its own switch, in both directions.

On `HART. YT` (gate $1,879/day):

| Group | In the list | In the smaller list |
| --- | --- | --- |
| `atcap` | 2 | 0 |
| `idlestaff` | 0 | **1** |
| `jobdemand` | 2 | 0 |
| `hype` | 0 | 2 |
| `unplanned` | 1 | 0 |

So `atcap`'s switch visibly works — its two findings move between the lists — and
`idlestaff`'s does nothing whatsoever, because its single finding is below the
gate and sits in the bottom list either way, gaining and losing a dim chip. That
is exactly the asymmetry the reporter noticed, and it is why they named the
overstaffed filter specifically.

**Why it belongs in PR 1 rather than a fix of its own:** PR 1 multiplies the
population of these two groups. Gyms, hairdressers, theatres and nightclubs start
producing `atcap` and `idlestaff` findings for the first time, and a fair number
of them will be small — a gym's spare trainer-hours are worth less than a
clothing store's — so they land below the gate, where the switch is inert.
Shipping the station table without #51 makes the bug louder on exactly the sites
PR 1 adds.

**The fix** is to give both lists one gate. Extract the partition out of
`drawAlerts()` — it is DOM-free and currently untestable, and no test covers the
kind switches at all today:

```
partitionFindings(alerts, minorRows, prefs) -> {list, smaller}
```

`node --test tests/alert_kinds.test.cjs`, on the source-slicing pattern the other
`.cjs` tests use. Note the `AGENTS.md` trap: a new slice anchor is a new thing a
test pins, so the comment above the function is load-bearing once it exists.

**Decided: off means demoted, said out loud.** The "nothing is dropped" rule
stands and no defaults change. What changes is that the board stops pretending
the switch did nothing:

- `partitionFindings` returns `{list, smaller, off}` — `smaller` is the
  below-gate rows plus the switched-off above-gate rows, `off` counts the rows in
  `smaller` whose kind is switched off, from either source.
- The count line carries it: `3 smaller · $410/day · 1 switched off`.
- Within `smaller`, switched-off rows sort **after** the gate rows. That gives a
  below-gate finding a visible response to its own switch for the first time — it
  moves to the bottom of the list instead of only swapping a chip in and out.

Note what this does not do, deliberately: **the row the reporter sees still
shows.** A below-gate `idlestaff` finding stays on screen whether its kind is on
or off, because the gate put it there and the gate is about money, not kinds. The
complaint is answered by making the state legible, not by hiding the row. If #51
comes back, that is the design speaking and the reply is the count line.

### Cleaning and security: full opening-hour cover

Cleaning shifts are 28 of 77 at a gym and 57 of 182 at a clothing store. Under
**clear and re-enter** they are wiped along with everything else, and cleanliness
feeds both `satisfaction.cleanliness` and the `CleanWorkplace` job demand
(`cleanliness >= 80`, `_cleanliness()` already computes it). Security guard
lockers are the same shape: shifts, no throughput, no demand curve, and they set
the building's security level.

There is no readable rule for how many cleaning hours buy how much cleanliness —
`maxCleaningHours` lives on `SchedulePartition`, computed by the auto-filler, not
stored — so a derived need is not available.

**Decided: both get one person per station for every open hour**, cut the same
way as serving stations. Measured on `HART. YT`:

| | Now | Full cover |
| --- | --- | --- |
| Cleaning, all seven retail sites | 168 h/wk per station | **identical** |
| Security, Fifth Avenue 57 (4 guards) | 168 h/wk | identical |
| Security, Second Avenue 12 / Ninth Avenue 3 (2 lockers each, **no guards**) | 0 | 336 h/wk each |
| Security, Ocean Crest Road 4 (1 locker, **no guards**) | 0 | 168 h/wk |

So **cleaning cover is free** — every site already runs it, and the only change
is 57 fragments becoming 14 shifts. **Security cover is not**: three sites hold
lockers nobody staffs, and the plan will ask for five hires and ~840 staff-hours
a week to fill them. That is a defensible reading of an idle locker, but it is
the one place in this scope where the plan recommends real new spending, and the
page has to say so rather than folding it into a shift count.

A `nocleaning` demand still keeps that person off cleaning shifts.

---

## 4. Demand: what can honestly be derived

### The game's arrival model, and its limits

`CustomerEntriesCalculatorRetail.GetCustomersByHour`, in full:

```
ceil( min( initial x promotionMultiplier x dayMultiplier x hourMultiplier,
           registration.customerCapacity ) )
```

- `initial` = largest `productSalesRatio` among the shop's
  `cachedAvailableProducts` that are **primary** for its type (`impact >= 1.0`),
  times the building's square metres (`BusinessHelper.GetMaxHcpsqmForRegistration`;
  this branch applies from `buildNumberAtStart >= 2847` — `HART. YT` is 3675)
- `promotionMultiplier` = `gameVariables.baseCustomerPromotionMultiplier + 0.75 x promotion.total / 100`
- `dayMultiplier`, `hourMultiplier` = per-business-type curves
  (`dayFactorMultipliers`, `hourlyFactorMultipliers`)

Every term is in the save except the two curves and `productSalesRatio`, both
readable from the Addressables bundles (44 types carry curves, 791 items carry a
ratio).

**It is an upper bound on arrivals, not the demand.** Checked against measured
hour reports on `HART. YT`: the gyms land close (26 measured against a ceiling of
30) but the clothing stores sit at a quarter of it (7 against 30). The gap is
`AddProductsToCustomersEntriesList`, which drops an arrival with nothing it wants
to buy — a function of per-product neighbourhood demand, stock, price and
satisfaction. Reproducing that is a different project.

> **Retail sizing stays on the measured hour grid.** The arrival ceiling is
> carried for exactly two jobs: bounding a censored hour from above, and
> answering "how much more could there be" — never as a target.

### The need curve

Per site, per weekday `wd`, per open hour `h`, per skill role:

| Case | Test | Need |
| --- | --- | --- |
| **measured** | not `thin[wd]`, not in `_capped_cells` | `customers[wd][h]` |
| **censored** | in `_capped_cells` — measured came within `AT_CAP` of what was available | `effective[wd][h]` plus one station's throughput, bounded by the arrival ceiling, the door cap and the stations installed |
| **scaled** | `thin[wd]` or no reports, but another weekday is measured | the measured day's need x `dayMultiplier(wd) / dayMultiplier(wd')` |
| **none** | no measured weekday at all | no recommendation; the site is too new |

Each cell carries its case, so the UI session can decide how to qualify a
censored or scaled number. The board must never present a censored hour as a
target: the honest sentence there is "measured at the ceiling — this adds one
station; re-check next week."

Stations to man = the smallest set of that role's stations whose throughputs sum
to the need, largest first. People needed that hour = that count, one per station.

---

## 5. The roster builder

### What it optimises for, in order

1. **Cover** — every hour a station is needed has a qualified person on it.
2. **Fewest lines to type** — longest legal shifts, fewest distinct shifts, days
   made identical wherever the hour targets allow.
3. **No unmet demand** — nobody in their own blackout window; weekly hours inside
   their band; 4- or 5-day weeks honoured; weekends free where demanded.
4. **Cost** — of the rosters satisfying the above, the cheapest in wages.

2 and 4 pull against each other: rounding a one-hour dip up to keep a shift whole
costs wages. **Decided: slack is capped at 10% of the week's required
station-hours per site**, and the price is carried anyway (`slack.hours`,
`slack.cost`) so the player can see what the whole shifts cost.

### The staff pool

**Decided: everyone with `assignedAddress` at the site, plus the unassigned
bench** — anyone hired and not yet posted anywhere. `CandidateEmployeeInstances`
(293 on `HART. YT`) are *not* staff and stay out; those are hires, and hiring is
a headcount line, not a roster entry.

Drawing on the bench costs the checklist an extra step, because the Schedule tab
only lists staff already assigned to that business: *"MyEmployees › assign Dana
Reyes to Ocean Crest Road 4"* has to come before her shift lines. `fromBench` on
the shift row carries it. `HART. YT` has an empty bench, so this matters for
other players rather than for testing against the reference save.

### The algorithm

The game solves this with an OR-Tools CP-SAT solver, nine seconds a partition. We
have Pyodide and no solver, so this is a constructive heuristic — which is
tractable precisely because the objective is long uniform shifts.

**a. Per-station cover.** For role `r` on day `wd`, station index `k` is needed on
every hour where `need_r[wd][h] >= k+1`. Demand is near-unimodal, so this is
usually one contiguous run.

**Bridging troughs, decided:** no fixed width. Collect every gap between two runs
of the same station, sort by cost ascending (gap hours x that role's wage), and
bridge greedily until the site's 10% slack budget is spent. Cheapest troughs
first, so a 1-hour lunch dip is always bought before a 4-hour dead afternoon, and
there is no constant to defend. Ties break on the earlier gap, so the result does
not move between runs.

**b. Cut.** Split each run of length `L` into `ceil(L / 12)` shifts, as equal as
possible: `L <= 12` is one shift, `L = 24` is two twelves, anything between is
`ceil(L/2)` and `floor(L/2)`. Deterministic, no search.

**c. Headcount, before anybody is placed.** Total station-hours for the week
divided by the band gives the answer the player most wants:
`ceil(total / 50)` is the fewest people who can cover it on full-time contracts,
`floor(total / 30)` the most who can all still get a legal full-time week. A site
with 21 Customer Service staff and 336 station-hours needs 7; the other 14 cannot
be given a legal week no matter how the shifts fall.

**And the headcount is the objective, not a note beside the plan.** An employee
is posted to one building, so nobody's thirty hours can be made up next door:
`ceil(total / 50)` people on full weeks is the whole aim, and the rest are people
to post elsewhere. `headcount.spare` counts them — the people this site holds and
gives no shift at all — read off the finished plan rather than as `have - min`,
because the plan needs a person more than `min` wherever a day's cap or a demand
splits the week, and the number beside the roster has to be the roster's.

**Decided: one summary line per role per site**, not a line per uncovered slot —
*"hire 3 more Customer Service to fill this plan"*, *"2 security guards, for two
lockers nobody staffs"*, *"14 Customer Service here have no hours in this plan"*.
Hiring and firing are cheap in this game; the detail the player needs is the
total, not which Tuesday is short. Nothing is matched across sites — moving
people between branches is a chain-wide problem and stays out of v1.

**d. Place, most-constrained-first.** For each shift slot compute the set of
eligible people (right skill for that station, free that day and hour, no blackout
overlap, band not already exhausted, day count not exceeded). Fill slots in
ascending order of how many people are eligible — the classic minimum-remaining-
values order, and the reason it works: **someone demanding "no afternoon shifts"
has only `18–06` on a 24-hour site, so they take the night shift before the
unconstrained staff do.** Placing them last is what makes a schedule
unsatisfiable.

Tie-breaks within a slot, in the player's own order of priority:

1. **Already on this roster.** One more name is one more person the site owes
   thirty hours to, so nobody new is started while somebody already on it can
   legally take the slot. Which name gets started matters as much as how many,
   so two keys settle that: **the least flexible person first** — counted
   against this site's own roles, so the only person who can work the cleaning
   station is not spent on a register while that station turns into hiring
   lines — and then **the most room left in their band**, so a part-timer does
   not start a week one full-timer could carry alone. Both used to fall through
   to the employee id, and a locker read `hire 4` or `hire 3` depending on who
   the save happened to list first.
2. **Whose minimum is still at stake, emptiest week first.** A full-timer under
   thirty goes before a part-timer already past their ten, and two people under
   theirs rise towards it together rather than one being stranded. Levelling
   across *everybody* — which is what "furthest below their minimum" did before
   — gave nine full-timers 18 hours each and nine failed demands where 168
   station-hours are four full weeks.
3. **Then the other demands**: a day they are not already on, for somebody short
   of a four- or five-day week. The rest are not ranked at all — blackout
   windows, free weekends and cleaning are tested in step d's eligibility and
   never traded away.
4. **Then the longest shifts**, which need no rank: step b already cuts the
   fewest shifts a run allows, and the 14-hour day is an eligibility test.

Then continuity — already on that station on an adjacent day, so there are fewer
distinct names to type — the site's own staff before a bench member, lower wage,
employee id. The last one is not cosmetic: a roster that reshuffles names between
two runs of the same save is unusable, because the player is halfway through
typing it.

**d2. Settle what the fill leaves owing, in hours and then in days.**

*The hours.* Filling a week one person at a time leaves the remainder on whoever
was rostered last: 168 station-hours in twelve-hour pieces come out 48, 48, 48
and 24, and that 24 is a full-time demand failed by six hours. It is the same
fourteen lines with a name moved, so one shift comes off the fullest week and it
is 48, 48, 36, 36. Where whole shifts cannot do it — 60 station-hours will not
give two people thirty each in twelve-hour pieces — one shift is cut instead,
and it is 30 and 30 over six lines.

*The days.* `fourdaysweek` and `fivedaysweek` ask to be assigned **exactly** that
many days: `DaysWorkingPerWeek.Fulfilled()` fails on `!=`, not on `>`, so three
days breaks a four-day demand as surely as five does. Four twelve-hour days is 48
hours and fits; five is 60 and does not, so on a site open long enough to cut
twelve-hour shifts a five-day week cannot be built out of them at all. Rather
than fail the demand, a day is **shared**: the person takes the tail of somebody
else's shift on a day they were not working, and that somebody keeps the head, so
no day is ever moved off a donor who needs it.

**It is an exchange, not a gift**, because in the ordinary case neither side has
anything spare. Somebody on four twelve-hour days is at 48 hours with two to
spare, and the hours pass above leaves everybody else sitting exactly *on* their
floor, so a rule that asked donors for spare hours found none. Instead the taker
hands a piece of a day they are keeping to the donor, and takes the new day in
return: giving the hours straight back is the one trade that needs neither of them
to have room going in. Seven twelve-hour days cannot give two people five days
each without sharing three of them, which is ten lines instead of seven: the third
priority paying for the second.

The donor is asked first for that reason, but they cannot always take the hours —
a guard has no use for a register's — so **any other person already working here,
and not still owed days themselves**, may take the compensation instead. That
branch was removed once, on a measurement that turned out to be a property of the
generator rather than of the code: on shops built for the shape it serves, two
registers and long doors and a crew of five-day contracts, dropping it costs three
day demands a thousand shops.

**A week can also change hands entire.** Which name gets started is settled before
anybody has an hour, so the rank can only compare contracts and wages there; on a
site holding one week's work that lets a cheaper person with no hours demand take
all of it while a full-timer beside them is reported 0 of 30. After the hours are
settled, such a week is handed over whole — but only where every line is one the
taker may work and the total lands inside their band and meets their day count, so
the shop with too few hours to fill a band keeps its own answer. The giver may
hold a day count they were meeting, and lose it: an *Important* demand spent to
settle a *Critical* one, and refusing the trade costs more hours demands than it
saves day demands. It is one move, not a trade: the whole week changes hands, and
what follows about legs and copies belongs to the day exchange above. Their hours barely move; only
the shape of the week does. Both legs are tried against copies of the two weeks
and written only if the whole exchange is legal, so a day that turns out not to
fit costs nothing: handing the hours over first and finding out afterwards left
the week a line shorter and the demand no nearer met. The weekly ceiling is the
one rule not asked leg by leg — an exchange moves hours both ways, so a donor
sitting on their ceiling would be refused the very compensation that makes room
for them — and it is checked on the finished weeks instead.

**The hours are settled the same way, and all at once.** Moving whatever a donor
could spare and seeing how far it got left people with a scrap of a line *and* a
failed demand: 60 pieces under four hours across 400 shops, and in 43 of them the
person was still short at the end of it. So one person's whole sequence of moves
is planned against copies and written only if it actually reaches their floor.

Four rules keep all of it honest. Only somebody **already on this roster** is
topped up — giving hours to somebody the plan used for nothing would add a name,
and a name is another person owed thirty hours. Nobody ends an exchange under
their own minimum, over their ceiling or past their day count, and no donor ever
loses a day their own demand asks for, so no shortfall is traded for another. **A
day is never bought with a scrap**: `MIN_SPLIT`, four hours, at both ends of any
shift the day pass cuts, and a demand that could only be met with less is
reported unmet instead. The hours pass is the one place that may go below it, and
only downwards to what is still owed: the hours band is the game's *Critical*
demand where a day count is merely *Important*, so a week left two hours short
fails something worse than a short line. It takes four hours even where fewer
would do, wherever the donor can spare them. And a week that cannot be made up at all is left alone: 56 station-hours
will not give two people thirty each however the shifts move.

**e. Report the residue, never break a demand.** Slots with no eligible person
roll up into the role's hiring total (step c), never into a violated demand. A
person left below their band's minimum is reported (`shortHours`), because that
is a real `jobdemand` warning the player is about to earn. **The answer forks on
whether they work here at all**, and the page has to say which: somebody the plan
gives *nothing* is a person to post to a site that has the hours, or to let go,
because this one has no week for them; somebody on a *partial* week is covering
hours that would go uncovered if they were moved, and the honest line is that
there is nothing left here to give them. Telling the player to move or fire the
second kind is advice that costs them the cover they have.

**f. Cleaning and security.** One person per station for every open hour, cut the
same way, placed **after** the serving stations so neither ever steals a person
from a queue. Their hours count towards the placed person's weekly band like any
other shift.

**Decided: a customer service employee is never put on a cleaning station.** The
game allows it and the board's own model says it works, so this is the one rule in
the placer that is a policy rather than a game rule, and it is named as such in
`_can_work()`. A register standing empty while the person who could be on it mops
costs more than a cleaner's wage. Cleaning that only servers could do becomes a
hiring line instead, which is the honest answer: hire a cleaner. `headcount.have`
counts the same way, or the line would read "3 here" beside a plan that hires two.
The locker is not covered by the rule — a guard shift is a post, not a roaming
duty — and `nocleaning`, the game's own demand, is separate and still enforced.

### Cost

Trivial in Pyodide: ~7 retail sites x 7 days x 24 hours x ~20 eligible staff.

---

## 6. Data

### One new generated, committed file

Follows the `ba_buildings.json` pattern — owner runs the generator against the
installed game, the result is committed, the board ships it.

| File | Holds | From |
| --- | --- | --- |
| `ba_demand_curves.json` | per business type: `dayFactorMultipliers`, `hourlyFactorMultipliers`; per product: `productSalesRatio` | `defaultlocalgroup_assets_businesstypes_*.bundle`, `..._items_*.bundle`, read with UnityPy |

44 types x ~13 rows plus 791 ratios — well under the buildings table. UnityPy is
an owner-side dependency only, as with `export_map.py`.

This makes a **fifth** file the Pyodide worker fetches from `web/py/`
(`ba_save.py`, `ba_dashboard.py`, `gametext.json`, `ba_buildings.json`, and this).
`web/worker.js`, `build_web.py` and the "nothing else is on the virtual
filesystem" note in `AGENTS.md` all need updating, and it must be read lazily
inside a function, as `load_buildings()` is.

### Already extracted, needs no new reading

The hour grid and its `thin`/`weeks`/`effective`/`door` flags, counter
throughputs, door caps, station inventory per site, crew with skills, levels and
wages, `JOB_DEMANDS` with priorities, `assignedAddress`, opening hours,
satisfaction, promotion, per-hood demand, `_cleanliness()`.

### Needs lifting out of a local

`_hourly()` builds `here = {itemInstanceId: rate}` and throws it away. The planner
needs the station list itself — id, item name, skill, rate — and the per-weekday
opening slot, neither of which reaches the payload today.

### Payload contract

One new key, `staffing`, a list of one row per planned retail site. Sketch, for
the UI session to accept or reject; names are the part that matters.

```
{ key, name, typeSlug,
  open:      [[start, end] | null per weekday],
  roles:     [{skill, label, stations:[{id, name, rate}]}],
  need:      {skill: [[n per hour] per weekday]},
  basis:     {skill: [["measured"|"censored"|"scaled"|"none"] per weekday]},
  ceiling:   [[n per hour] per weekday],
  shifts:    [{wd, station, skill, from, to, employee, name, hours,
               kind: "serve"|"clean"|"security", fromBench}],
  headcount: {skill: {needed, min, max, have, spare, hire}},
  shortHours:[{employee, name, hours, min}],
  placed:    [{employee, name, demand, wd, from, to}],   // demand-driven placements
  bench:     [{employee, name, skill}],                  // needs a MyEmployees step first
  slack:     {hours, cost, budget},
  cost:      {weekly, current},
  current:   {shifts, fragments, cleaning, security} }
```

`placed` is the row that answers the original ask directly: who has a schedule
demand, and where the plan put them because of it.

---

## 7. What the design has to respect

Properties of the data, not preferences. Getting one wrong produces a plan that
lies.

- **A censored hour is not a target.** Only `basis == "measured"` may be stated as
  a number to aim at.
- **A thin weekday has no answer of its own.** It is either scaled from a measured
  day through the day curve, or it gets nothing.
- **A site with nobody assigned cannot be rostered.** `assignedAddress` binds an
  employee to one building; the plan cannot borrow from next door, and the honest
  output is a hiring line.
- **Not everyone has a contract demand.** 225 of 227 on `HART. YT` demand
  full-time, but a person without an hours demand has no band and the plan must
  not invent one: they are never reported short. Full time's 50 hours still cap
  what the plan hands them, because filling one person before starting the next
  has to stop somewhere — uncapped, the one cleaner at a shop open around the
  clock was given 84 hours, twelve a day for seven days.
- **Multi-role types are a minimum, not a sum** (section 3).
- **Determinism.** Iterate sets through `_in_order()`, break every tie explicitly.
- **Clearing wipes more than registers.** Security guard lockers and cleaning
  stations carry shifts too; the plan has to reproduce them or the player loses
  security and cleanliness without being told.
- **The words fork.** Registers, chairs, boards and booths are not
  interchangeable in a sentence; `drawSite()` already forks on `office` and this
  forks per role.

---

## 8. Tests

| Covers | Where |
| --- | --- |
| Station table now reads every employee station with a Customer Capacity, keyed by skill; row count pinned | extend `tests/test_uniform_alerts.py`'s neighbour, or a new `tests/test_stations.py` |
| Need curve: measured / censored / scaled / none on a synthetic grid | `tests/test_staffing.py` |
| Cut: run lengths 1…24 produce the expected shift lengths, none over 12 | same |
| Placement: no produced shift violates any `JOB_DEMANDS` rule — property test over a synthetic roster with every demand kind present | same |
| Determinism: the same fixture twice gives byte-identical `shifts` | same |
| Headcount arithmetic against a hand-worked fixture | same |
| The new curves file is present and shaped | `tests/test_map_assets.py` pattern |
| Multi-role minimum on a synthetic theatre | `tests/test_staffing.py` |

Then `python -m unittest discover -s tests`, `node --test tests/*.test.cjs`,
`python build_web.py`.

---

## 9. Deferred, and what it costs

**Offices.** `CustomerEntriesCalculatorOffice.GetCustomersByHour` is
`min(ceil(initial x satisfactionMultiplier x promotionMultiplier x dayMultiplier
x hourMultiplier x neighbourhoodDemand/100 - 0.2), workers on shift at a
computer)`, with `satisfactionMultiplier = 1 + (satisfaction.overall - 50)/100`.
There is no product filter, so **every term is available and nothing is
censored**. Worked for the Second Avenue 10 law firm (660 m², ratio 1.0,
satisfaction 100, promotion 100, hood demand 66): the ceiling is 800 billable
hours at 10:00 on a weekday, 767 at 14:00, 56 on Saturday midday and **9 at
03:00**. The door cap is 50 and there are 51 computers, so by day the building
binds and every computer is worth staffing — but past the ninth lawyer at 3 a.m.
nobody bills anything. That is an exact per-hour optimum, and deferring offices
defers the only place the board could state one. The machinery (curves file,
need curve, cutter, placer) is shared, so adding them later is small.

**Factories.** Already modelled — `STAFF_HOURS = 168`, `_factories()` records
hours covered and off-hours per machine, and the target is "cover all 168 unless
the feed cannot keep up", with the feed number already computed for the `feed`
alert. It is also the worst offender on `HART. YT`: 497 shifts a week on eight
machines, 400 of them two hours, against 112 for a 12-hour roster. Cheapest
follow-up of the three.

**Opening hours.** The same curves say when a site is worth opening at all. A
24-hour shop whose 00–06 ceiling is a handful of customers an hour is paying four
staff-shifts a week for it. A bigger lever than rostering those hours well, but it
changes a site's whole shape.

**Cleaning and security as models.** Covered, not derived (section 3). If the
dirt-accumulation model is ever read out of the game, full cover becomes the
fallback rather than the rule, and cleaning hours become another need curve.

---

## 10. Decisions

Settled 19 September 2026. Nothing here is open.

| Question | Decision |
| --- | --- |
| The station-table fix | **Its own PR first**, including the multi-role minimum (section 3) |
| Cleaning shifts | **Full opening-hour cover.** Already what every retail site runs, so it costs nothing; 57 fragments become 14 shifts |
| Security lockers | **Full opening-hour cover.** Costs five hires and ~840 staff-hours a week on `HART. YT`, at three sites holding lockers with no guards |
| Staff pool | **Assigned to the site, plus the unassigned bench.** Bench placements need a MyEmployees step in the checklist; candidates are not staff |
| Hiring | **One total per role per site** — "hire 3 Customer Service to fill this plan". No per-slot lines, no cross-site matching |
| Slack | **Capped at 10%** of the week's required station-hours, priced anyway |
| Trough bridging | **Greedy inside the slack budget**, cheapest gaps first. No width constant |
| Issue #51, what "off" means | **Demoted, said out loud** — no defaults change, the count line reads "1 switched off", switched-off rows sort to the bottom of the smaller list. Ships in PR 1 |

Nothing is open. Three things the UI session inherits rather than decides: which
flag qualifies a censored or scaled number (`basis`), that the security hiring
line has to read as new spending rather than as a shift count, and the wording of
the "switched off" count line from #51.

### Build order

1. **PR 1** — the station table, per-role `staffed`, the multi-role minimum, the
   per-role `atcap` wording, **and issue #51**. No new data file, no new payload
   key. `tests/alert_kinds.test.cjs` is new.
2. **PR 2** — `ba_demand_curves.json` and its generator, the need curve with its
   four bases, the arrival ceiling as a bound.
3. **PR 3** — the roster builder, the `staffing` payload key, the checklist rows.

PR 2 has no user-visible output of its own on retail, so it may fold into PR 3 if
the review rounds would otherwise stall on a file nothing reads yet.

---

## Traps

From `AGENTS.md`, both of which apply:

- CSS classes are global across every page; a new class needs a feature prefix or
  a scope under its page's root class.
- `section{content-visibility:auto}` clips absolutely positioned children; a
  popover belongs on `<body>` with `position:fixed`.

And one from this feature: **never print the arrival ceiling as demand.** It
over-predicts served customers by up to four times on a clothing store. A
confident wrong number that tells the player to hire is the worst outcome
available here.
