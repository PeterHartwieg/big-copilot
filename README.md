# Big Ambitions Ledger

A progress board built straight from your Big Ambitions save file. No mods, nothing
injected into the game. It reads the save on disk and builds a single HTML page.

The tool only ever reads your saves. It never writes to them.

## Where the saves are

On Windows:

```
%USERPROFILE%\AppData\LocalLow\Hovgaard Games\Big Ambitions\SaveGames\Big Ambitions\<characterId>\
```

On macOS:

```
~/Library/Application Support/Hovgaard Games/Big Ambitions/SaveGames/Big Ambitions/<characterId>/
```

Each character has its own folder, because each character is a different generated city
and a different company. The game writes a `Recover ...hsg` autosave every five minutes
while you play, so there is almost always a recent save to read.

## Two ways to use it

### In the browser

Open the page at `<the page URL>` and drop a save on it.

The board is built inside the browser. The same Python that runs locally runs in a Web
Worker through Pyodide, so the save never leaves your machine. Nothing is uploaded.
The Python runtime is about 6 MB, fetched once from a CDN and cached after that.

Pick the game's `en.json` once, from:

```
<game folder>\Big Ambitions_Data\StreamingAssets\locale\en.json
```

That gives the board product names, recipes and station capacities. It is remembered in
the browser, so you only choose it the first time.

Sixty days of demand and cash history are kept in the browser's localStorage, separately
per character. The *forget history* link clears it.

It works in any current browser. Watching a save folder for live updates is planned for
a later release; for now the browser page is drop a file, get a board.

### From source

Requires Python 3.10 or newer. No third-party packages.

```bash
python ba_dashboard.py
```

That picks the most recently written `.hsg` anywhere under the default save folder and
writes `dashboard.html` next to the script. Open that file in a browser.

The file it read is printed on the command line and shown in the page footer, so you
always know which snapshot you are looking at. Re-running mid-session gives you an
up-to-date board.

Pass a `.hsg` file or a folder as the positional argument to choose the save yourself.
Given a folder, it takes the newest save inside it.

```bash
python ba_dashboard.py "path/to/My Company.hsg" -o board.html
python ba_dashboard.py "path/to/SaveGames/Big Ambitions/<characterId>"
```

The default folder is the Windows one, so on macOS or Linux pass the save folder as the
positional argument.

## Keep it live while you play

```bash
python ba_dashboard.py --watch
```

This serves the board at `http://127.0.0.1:8770` and opens it. Leave it running on a
second monitor. It checks the save folder every 5 seconds and rebuilds only when the
game has actually written a new save, so in practice it refreshes once per autosave.

The open page updates **in place**. Your scroll position, the tab you are on and any
column sort all survive a refresh. A pulsing *Live* dot next to the date confirms it is
connected; it turns grey and reads *Not live* if the server goes away.

| Flag | Default | What it does |
| --- | --- | --- |
| `-o`, `--out` | `dashboard.html` | Where to write the page. |
| `--port` | `8770` | Port for the local server. Bound to `127.0.0.1` only, so nothing on your network can reach it. |
| `--interval` | `5` | Seconds between save-file checks. This is a `stat` call, not a parse. |
| `--no-open` | off | Skip opening a browser on start. |
| `--backfill` | off | Seed demand history from this character's other saves first. |

`Ctrl+C` stops it.

### What it costs

A rebuild takes about **1.5 seconds on one core** and peaks near 230 MB, which it
releases straight away; the watcher idles at roughly 33 MB. Since it only rebuilds when
a new save lands, that averages out to well under 1% of a single core. There is no GPU
work at all.

The watcher also drops itself to **below-normal priority** on start, so Windows always
hands the game a core ahead of it. The rebuild can never cause a frame hitch. The
startup banner tells you whether that succeeded.

Nothing is ever written to your save files. The tool only reads them.

## Game builds

Every number on the board was checked against game build **3674**.

Saves from builds older than **3540** are refused with a message saying so. The game
changed its save format before that, and the fields the board relies on are not there.
Load the save in a current build of the game and save again to bring it forward.

The save format is reverse-engineered, so a game update can move or rename a field. When
that happens the tool prints one sentence naming the field, the game build the save came
from and the build the tool was checked on, and the last good board stays on screen.
That sentence is the whole bug report: paste it into a GitHub issue.

## Game text

Product names, business names, recipes and station capacities all come from the game's
own English locale file, `en.json`. In the browser you pick it once. Locally the tool
looks in the default Steam path; if the game is installed somewhere else, point
`DEFAULT_LOCALE` in `ba_save.py` at your `StreamingAssets/locale/en.json`.

Without it the board still builds, but names fall back to tidied-up slugs, the masthead
reads *Game text: not loaded*, and recipes and station capacities are unknown, so the
views that rest on them cannot be worked out.

## Neighbourhood badges

Neighbourhood badges come from a `[XX]` prefix you put in your own business names, for
example `[MT] Grocery 38 1st Av`. The prefixes the board knows are listed in
`NEIGHBOURHOODS` in `ba_dashboard.py`; add one there if you start using a new one. A
business with no prefix simply gets no badge.

## What's on the board

The board is five pages behind one bar, and shows one page at a time. **Today** is
the daily check; the other four are places you go on purpose. Which page you were
on, and which view inside it, is remembered on the device and mirrored in the URL
hash, so a live refresh and a reopened tab both land where you left off.

- **Today**: four tiles and the *Needs attention* list, nothing else. Profit yesterday
  with its seven-day average and trend, revenue with customers served, cash on hand
  with where the profit went, and the daily fixed-cost base (rent plus payroll). Net
  worth takes the fourth tile whenever the game reports it again. Bank debt only
  appears, in the cash tile, when there is some. Site and staff counts sit in the
  masthead. Sparklines cover the last 61 days.
- **Needs attention**: only what you can act on, each line with a number and a deadline
  where one exists. Below the list, a count of everything too small to be worth a line.
  *Filter kinds* chooses which kinds of finding make the list; every *details ›* link
  opens the page and view the finding is spelt out on and scrolls to it.
- **Results**: the company, then its chains, then one site.
  - *Daily result*: a seven-day rolling profit line over the daily ones. Daily profit
    swings by a million between a weekend and a Tuesday purely because that is when the
    week's goods are paid for, so the rolling line is the one that says whether trading
    moved. Click a legend entry to add or drop a line.
  - *Weekly rhythm*: one sentence when most sites share a peak day; the weekday bars
    and the site-by-site table each wait behind a button.
  - *Portfolio*: grouped by chain, with each chain's combined revenue, cost and margin
    on one line and its sites folded underneath. A week-on-week revenue column sits
    beside yesterday's takings. Every column sorts. Click a chain to open it, then a
    site to open its detail.
  - *Business detail*: nothing until a site is opened from the portfolio or a finding;
    then that site alone, with its profit history, cost breakdown, crew and shelves, and
    an hour-by-hour grid of the week showing customers against the capacity that was
    actually on shift. A picker in its header moves between sites, support sites in
    their own group, and *close* puts it away.
- **Supply**: the logistics round, one view at a time.
  - *Orders to set*: the weekly import order per depot and the daily top-up per factory,
    opening on the ones that need a change.
  - *Stock checks*: the five questions your logistics actually raise. Each view opens
    with a one-line verdict and then lists only the rows that break it.
  - *How goods move*: the chain drawn as a flow diagram, with importers, factories,
    depots and shops, and line width for daily volume. Click a site for what it holds
    against what it has to cover.
- **Growth**: planning, one view at a time.
  - *Where to expand*: one ranked list of shops already turning people away and gaps in
    the demand grid, measured evidence above inferred. The top five show; the rest are
    a click away.
  - *Market demand*: what is rising, what your suppliers are short of, and a demand
    grid by neighbourhood covering both what you sell and what you don't.
  - *Plan a chain*: machines run flat out, so the answer is the weekly raw material
    bill. Set the machines per line and get the delivery that keeps them fed, plus what
    the shops absorb and what is left over to export.
- **Company**: the reference tables, being products, payroll, milestones and house
  rules. There is no debt page; loans cap at $2M, which is beside the point at this
  stage.

## What counts as a finding

A board that reports the same nine things every day is a board you stop reading. Three
rules decide what makes the list.

**It has to be worth money.** Anything with a dollar figure on it has to clear half a
percent of your seven-day average daily profit, with a $500 floor for when profit is
near zero. Below that it is counted at the foot of the panel with its total, never
dropped and never read out. Two vacant leases at $548 a day are 0.05% of a day's
trading; they are a line item, not an alarm. A site that cannot trade at all is never
counted away, whatever it costs.

Stock is priced as a rate so it can be compared with a day's profit: the value of what
is standing still, spread over how long it would take to sell. Raw materials carry no
retail price, so there is no honest figure to gate them by. Those stay on the list with
their units, which is the only claim the data supports.

**One cause is one line.** Three or more findings of the same shape at one site collapse
into a counted line with the worst of them underneath. Six shops holding a thousand
cupcakes each is not six findings, it is one top-up target set too high, and it reads as
the action: *lower the target*. A site that opened this week with no staff, no stock or
no delivery plan is one line naming all of it, not a separate loss alert and a separate
staffing alert for the same empty shop.

**It has to be news.** An order that exactly matched last week's consumption is a
correctly sized order. What the board asks instead is whether the standing order covers
the *next* week, walked day by day at each weekday's own rate, and only an order that
falls more than 5% short of that becomes a line. Factories run their books negative by
design and their takings arrive in batches, so neither their red line nor a jump in their
weekly total is reported. A shop whose week is up because it is riding its own hype wave
is the line above it said twice.

What is on the list is what moves the number:

- **Hype exposure.** What each running wave is carrying, per wave, with the days left and
  a baseline: *Industry City hype on 5 lines ends tomorrow; that store does $286k/day
  under it against $146k for the no-hype Hamptons store.* The baseline is the same shop's
  own trading before the wave landed where the history reaches back that far, otherwise
  the same kind of shop somewhere no wave is running. Where neither exists the board says
  there is no baseline rather than inventing one.
- **Week on week per site.** Any trading site whose seven-day revenue moved more than 15%
  against the seven days before it, with both figures. Sites open under two weeks have no
  previous week to be compared with and are left out.
- **Real supply shortfalls.** A shelf that outsells its top-up, a depot that cannot reach
  its next import, an order too small for the week it has to cover, a paused import.
- **Shops at their ceiling, and counters standing idle.** Both come out of the hourly grid
  described below, and both carry the money they are worth.
- **Promotion left on the table.** A shop's promotion is the foot traffic its address
  comes with plus what its marketing campaigns add, held at 100%. The address cannot be
  changed, so any shop selling something is either at the 100% cap or at 100% marketing.
  Anything else is campaigns not bought, and the shops it applies to read as one line with
  each one's shortfall. The three figures sit side by side in the Portfolio's Operations
  view, which is where the finding's *details ›* link lands.

## The weekly rhythm

Demand is not flat across the week, so a seven-day average hides the thing you actually
plan around. Every weekday is scored against a normal day: 100 is ordinary, 116 means
that weekday runs 16% busier. A supermarket chain might read roughly Wed 80 / Sat 115, a
cinema Mon 83 / Sat 113, while a food factory runs the other way and peaks Monday.

It appears in five places: the chain view with its own section, a per-site week in each
business tab, the Products table, and, most usefully, inside all three supply-chain
calculations, which is where it changes decisions rather than just describing them.
Stock needs follow the peak day, not the average one, and the size of a weekly order is
judged against the week ahead charged day by day at each weekday's own rate.

Its own section is one sentence when there is one pattern to report, such as *8 sites
peak Saturday, +30 to +41 points between their best and worst day; Factory - Food peaks
Monday*, with the nine-row table a click away. Nine rows saying the same thing is a
sentence, not a table.

In the Products table the weekday peak only gets a column when at least half the rows
have one; below that it moves into the row's own tooltip, since a column that is empty
two rows in three is not a column.

### Why some rows say "not enough history"

The figures are worth nothing if they are really measuring something else, so each
series has to earn its profile:

- **Growth is divided out first.** Revenue in a growing company can grow tenfold over the
  sample. A plain weekday average would rank later weekdays higher purely because they
  happened later, so every day is divided by a centred seven-day mean before anything is
  compared.
- **Level shifts are rejected.** A shop opening or a hype spike moves the whole level at
  once. Where neighbouring baselines jump by more than about 60%, no profile is reported.
- **The pattern has to clear its own error bars.** The gap between the best and worst
  weekday must beat the uncertainty in those averages, scaled by how many weeks each one
  rests on. Two observations of a Tuesday say very little; eight say a good deal.

That last test is what keeps the numbers honest. One electronics range briefly showed a
231-point "weekly cycle" that was really sales stepping from 70 a day to 1,700 when a
hype wave landed, on days that happened to fall on a weekend. It no longer reports a
cycle. Groceries and the cinema survive all three tests, and their product-level figures
agree with the site-level ones computed from a far longer history, which is the useful
cross-check.

Chain footfall rests on up to 2 weeks of order history; site revenue on up to 8 weeks of
financial summaries. The number of weeks behind each figure is shown next to it.

## The shop's week, hour by hour

A daily total cannot tell you that a shop is turning people away at eight in the morning
and paying three people to stand about at two. The save can: every business keeps an
`hourReports` list, being twenty-four readings of customers per day for the last sixteen
days, and a `scheduleDays` roster saying who was posted where and when. Put them in one
grid and three lines meet.

- **Customers** are measured, averaged over however many weeks that weekday has. A
  weekday resting on fewer than two weeks is starred and left out of the findings.
- **Registers** are the capacity that was actually staffed. Each work shift names the
  exact counter the employee was posted to, so the figure is the sum of the counters
  manned in that hour, not the number of staff times a guess. Two people rostered on one
  counter count that counter once.
- **The door cap** is the building's own `customerCapacity`: 30 for the small
  supermarkets, 75 for the big ones and the electronics stores, 100 for the cinema. It is
  a per-hour limit, not a daily total.

Effective capacity is the smallest of these, and the useful finding is *which* one binds.
Every hour at 95% or more of it is an hour at the ceiling; the grid outlines those in red,
and hours with capacity doing nothing in blue.

Only furniture whose help text says it is an *employee station* requiring Customer Service
counts towards register capacity: checkout counters at 30 an hour, cash registers at 20,
concessions stand registers and ticket booths at 50. Fridges, freezers and shelves carry a
Customer Capacity figure too and are deliberately not summed. They hold products, they do
not serve a queue.

### What the roster actually says

Two fields needed working out, and both were settled against data rather than assumed.

**`workShifts.type`** is not work-versus-break. Across every shift in a large save, type 0
appears with exactly one kind of furniture, the cleaning station, and exactly one skill,
Cleaning. Type 1 covers everything else: checkout counters, cash registers, projection
booths, security lockers, assembly machines, office laptops. So type 0 is a roaming
cleaning duty and type 1 is a post at a named station, and only type 1 shifts on a service
counter count towards register capacity. As a check on the parse, summing each employee's
shift hours reproduces their `assignedWeeklyHours` exactly, for all 253 of them.

**`scheduleDays.day`** runs 1 to 7 and maps straight onto the game day: `day % 7`, with 7
standing in for Sunday's 0. So 1 is Monday and 7 is Sunday. Two things confirm it. Rival
businesses keep weekday/weekend opening hours, one common pattern being 9-16 on days 1 to
5 and 9-21 on days 6 and 7, which only makes sense if 6 and 7 are the weekend. And
correlating rostered customer-service hours per schedule day against measured customers
per weekday gives +0.96 for this alignment, against +0.60 for the next best rotation.

### The two findings

**At the ceiling.** Hours at 95% of effective capacity, with the binding limit named. If
the door cap is at or below the staffed register capacity the building is the limit, and
the answer is a bigger site or a second shop, so that finding is routed into *Where to
expand* as well. If staffed capacity is below the counters installed, staffing is the
limit. Otherwise it is the counters themselves.

The money on this line is what is measurably flowing *through* those hours: hours at the
ceiling, times the cap, times revenue per customer. **What is being turned away above the
ceiling is not in the save at all.** The game records the customers who came in, not the
ones who did not. The board gives the throughput and stops there rather than inventing a
lost-sales figure.

**Capacity standing idle.** Three or more hours in a row where staffed register capacity
is more than twice the customers and at least two people are on. Here the money *is*
measurable: the surplus staff-hours at that site's service wage, which is what
rescheduling them would save.

Both are grouped before they are shown. Six shops hitting the same 30/h ceiling in the
same hours is one line about six shops.

A hype wave arriving at a shop already within 10% of its ceiling is added to that wave's
line rather than raised separately, because it is the same event. Where pricing is
handled by pricing staff, capacity is the only lever the wave leaves open, and it comes
with the wave's end date attached.

## Where to expand

Two kinds of evidence answer the same question, so they share one ranked list. A shop
turning people away at its door cap is a measured fact with hours and dollars against it.
A gap in the by-type demand grid is an inference about a shop that does not exist yet.
Measured always ranks above inferred, and every line says which it is.

## Plan a chain

**The number that has to be right is the weekly raw material.** Two facts set the shape
of this. A workstation runs flat out around the clock, so a line's output is fixed by how
many machines sit on it and never by what the shops happen to want. And whatever the
shops do not take is exported rather than wasted. So there is no such thing as
over-production to plan around, only an ingredient order that either keeps the machines
fed for the week or does not.

Set the machines on each line in the table, say how many shops are taking the output and
what one shop sells, and the section answers: how much each line makes a week, what the
shops absorb, what is left for export, and, the part that matters, the exact delivery
the whole plant eats in a week, per ingredient, with the cash figure beside it.

Sizing the order on demand instead would stop the lines mid-week. Fifteen machines across
a supermarket range turn out 546,000 units a week and need **856,800 units of raw
material** to do it, costing about **$73,650**; seven supermarkets take 178,605 of that
and the remaining 370,902 is export. Order the 178,605 the shelves want and the factory
is idle by Wednesday.

Lines that cannot keep up with the shelves are called out so they can be given another
machine. On the default range Bottle of Wine is the one, running at 50 an hour against
250 for Apples.

None of it is written down here. The 62 recipes come from the game's own help text,
`help_recipes_*_content`, which lists the required workstation, the raw ingredients per
hour and the maximum production rate, and the seven workstations from
`help_factory_workstation_*_content`, which says which machines make one up and which
recipes it can run. A patch that changes a recipe changes this section with it.

The arithmetic runs in the browser so the sliders are instant; Python only ships the
parsed tables across.

### Does the model match the factories you already run?

It does, to within a rounding error. Take the ingredient draw the supply section already
measures at each factory and solve for the production that would explain it through the
recipes. At **Factory - Food** all fifteen ingredients come out inside 0.1%, thirteen of
them exact to the unit, for a solved output of 11,679 Soda, 11,643 Energy Drink, 9,600
Fresh Food, 9,600 Frozen Food, 5,829 Slushie, 4,800 Popcorn, 4,685 Cotton Candy and 1,164
Bottle of Wine a day. At **Electronics Fac** all ten land inside 0.1% likewise. Every
intermediate turned out to be imported rather than made. Dough, Butter, Cheese and the
rest have no recipe at all, so there was no second-tier chain to unpick.

The machine sizing holds up too. Feeding those solved outputs back through the rated
hourly rates asks for six workstations of each kind at an average day's rate, which is
exactly what both factories have installed. The planner then adds the peak-day margin and
asks for seven, which is the honest reading of it: the plant as it stands is sized for an
ordinary day, not a Saturday.

### Why some rows have no price

The save carries no importer price list. `importPartnerships.products` holds an item, an
amount, a last-week figure and a warehouse, and nothing about money; there is none in
`rivalStates` either. What the save does hold is what you paid: yesterday's goods cost,
line by line, against the units drawn that day. Dividing one by the other gives a real
unit price for every material this company already buys, and the section names the day it
came from.

For anything you do not buy there is no honest price, so those rows show quantities and
say so. The cash figure states its own coverage: *one week of stock costs $X across the 12
of 22 ingredients this company already buys*. Estimating the other ten would be inventing
a price list.

## The portfolio, by chain

A shop, the depot that fills it and the factory behind that depot are one trading
operation. Read apart they are nonsense: an electronics shop books a 98% margin because
its goods arrive at no cost to it, while the factory that made them runs at -80%. So each
chain leads with one line, being its combined revenue, every cost, and the margin the
whole operation actually runs at, and its sites fold underneath it.

Membership comes out of your logistics plans, not a table written here. A chain is named
by the kind of shop at the end of it, and each warehouse and factory joins the kind of
shop it mostly feeds: follow its plans downstream, count where the goods actually end up,
and let the majority decide. That is why a food factory sits with the supermarkets even
though it also sends soda to the electronics depot, and why a cinema is its own chain
rather than a supermarket that happens to share a warehouse.

Where a chain's total includes money taken from outside the company, such as a factory
shipping to a pier, the chain line says so and names the amount, because that is not what
the shops took over the counter. An electronics chain might read $1.48M of revenue
against $652k of cost for $824k of profit, with $348k of that revenue being the factory's
export rather than counter sales.

The week-on-week column is blank for a site open under two weeks, and for a chain where
any of its earners is. A comparison that spans a shop's opening measures the opening.

## The business detail

One site at a time, and none until you ask: a site opens from its row in the Portfolio,
from a finding's *details ›* link, or from the picker in the detail's own header. Trading
sites lead that picker; anything not taking money, such as warehouses, head office, or a
shop that opened yesterday, sits in a *Support sites* group below them, because a
warehouse has no customers, no basket and no shelves worth reading. The detail shows that
site alone: the eight headline numbers, a 30-day profit chart, its own weekly rhythm,
yesterday's costs line by line, who works there by role and what they cost, and every
shelf with its price, sales rate, stock, delivery target and pressure.

Neighbourhood demand lives in the Market demand view rather than being repeated per
site, and customer scores stay in the Portfolio's Operations view.

The open site is held by address rather than by position, so a live refresh that
re-sorts the roster by profit leaves you on the same shop.

## How goods move

Four columns, being importers, factories, depots and shops, with a line for every real
link in your logistics and import plans. Line width is units per day, solid lines are the
daily distribution round, dashed lines the weekly import, an amber dot marks a site with
an order running tight, and a red dot one whose order cannot cover its own cycle. A site
earns a node by being on a plan or by holding something worth drawing; head office
keeping a dozen paper bags in a drawer is not a depot.

Clicking a site dims everything it does not touch and opens its detail: what comes in
and where from, what goes out and to whom, and a per-product table of **on hand** against
**needs before next refill** against **what the refill brings**.

Two different windows are being compared there, so both are named rather than merged.
A shelf is refilled every morning, so it is judged on one peak day. A depot is refilled
weekly, so its order is judged against a full week, which is why an order of 13,000 can
read short beside a five-day need of 11,014: the week takes 13,293. The verdict column
always states the figure it used, and by how much it misses.

### Close enough counts as covered

Consumption is measured from play, not read off a label, so two figures within a
rounding error of each other are the same figure. A weekly need of 17,003 against an
order of 17,000 is not a finding. The verdict has three states rather than two:

| Gap | Reads as |
| --- | --- |
| within 1% (or 5 units) | **covered**, the difference is measurement noise |
| 1-5% under | **tight**, worth knowing, not worth acting on today |
| more than 5% under | **order too small**, the order cannot cover its own cycle |

The same tolerance applies to shelf pressure, so a shop selling 100.2% of its top-up on
its peak day is not reported as running dry.

It applies to the walk to the next import too. An order sized to what you actually
consume will always look as though it empties a few hours before the next drop. That is
the design working, not a finding. A holding that misses its delivery by less than half a
day, or by less than 5% of the week the order covers, reads as **tight**: a chip in the
table, not a line in Needs attention. Only a real gap becomes an alert.

## The supply chain view

Goods move on two clocks: the logistics manager tops every shop up to a per-item target
each morning, and imports land once a week. So "days of stock left" is the wrong
question, because a shelf that empties overnight is fine if it refills at dawn. The three
views ask the questions that matter instead:

- **Before the drop**: does the *busiest* day of the week outrun tomorrow morning's
  top-up? A flat average would under-provision a Saturday, so the pressure figure is the
  peak-day rate against the target in your logistics plan. Both the average and the peak
  are shown.
- **Before the import**: will each holding reach the next delivery? The delivery day
  comes from your import partnerships (`nextDeliveryDay`), so nothing is guessed about
  the calendar. Rather than dividing stock by an average, it walks the actual days ahead
  and charges each one its own weekday rate, since three days that land on a weekend eat
  more than three ordinary ones, and reports the weekday the stock runs out on. **Today is
  charged only for the hours it has left.** A save taken at 23:00 has one hour of that
  day's selling still to come, and the stock on the shelf already reflects the other
  twenty-three; charging a whole day would count Saturday twice and report a warehouse
  running dry that has more than enough. Both sides of the comparison are counted from
  now: the delivery lands at the start of its day, so a Saturday-night save with a Monday
  import has 1.04 days to cover, not 2.
- **Idle stock**: goods held far beyond what flows through them, including anything
  with no outflow at all, shown against the top-up target that put it there. A factory
  input is the exception: the machines neither sell nor ship it, so what the morning
  round brings in is what yesterday used, and a holding smaller than two rounds' worth
  (1,020 fabric against 23,040 arriving a day) is the end-of-day buffer that keeps the
  line running, not a pile. Output that nothing collects still counts.

Depots and factories reached by a paused import are flagged separately, since those
drain with nothing scheduled to refill them.

Two more views turn the same log on the factories themselves:

- **Factory lines**: every assembly machine in every factory, the recipe it runs, and
  what that makes a day, being machines times the recipe's rated hourly output times 24,
  because a workstation runs round the clock (the log shows four tobacco machines at 100
  an hour drawing exactly 9,600 a day). Against that, what actually leaves the factory,
  what is held, and the top-up targets carrying it out. A line that makes more than leaves
  and has three days of output piled up is called out.
- A machine runs only while a factory worker is posted to it. The roster the game keeps
  (`scheduleDays[].workShifts`, each shift posted to one machine) gives every machine its
  staffed hours out of 168, and the **Staffed** column shows the share with the hours
  nobody is on it: *#6 off Mon 12-16, 20-24; Wed 4-8...*. A wine machine rostered 144 of
  168 hours draws 86% of its grapes, which is how the model was checked. Needs are still
  stated at the full 24-hour rate, since that is what the set-up is for; an input that
  arrives short by exactly the roster's share reads as *understaffed*, not as a logistics
  fault, and every machine not staffed round the clock is one line in the alerts with the
  hours to fill and the output not made.
- **Feed the factories**: the delta the set-up screen never shows. Each input a factory
  eats, per day and per week, beside the daily top-up that brings it, what arrived over
  the last week, and the weekly import order at the depot behind it, summed across every
  factory drawing on that depot. The change column says what to move and by how much: a
  top-up below the day's need (35,000 sugar for a 36,000 line runs the machines 23 hours,
  which is exactly why soda, energy drink and slushie ship at 96-98%), an input on no plan
  at all, an import order short of what the factories eat, or an input that is planned
  and stocked at the depot but not being drawn.

The save stores each machine's recipe only as an opaque id, so the recipe is read from
the flow: two machines rated 60 an hour that ship 2,880 garments a day are the
cheap-clothing line. A line whose output never leaves the factory is named from what it
eats instead, so 960 cigar paper a day is two machines at 20 an hour and nothing else on
that workstation, after the lines already named have had their share taken off. Twin
lines with the same machine count are certain as a pair and marked *paired*; a line named
only from the product held is marked *likely*; an id named once is remembered in
`market_history.json`, so a line that stops for want of an input keeps its name. A line
nothing can name is listed as such, with what the top-up plan suggests it was set up for
and which of its inputs never arrive.

That last case is the one that matters most, being a line set up before its ingredients
flow, which is exactly when the delta is worth knowing, and it is the one the flow cannot
settle. So an unidentified line carries a picker: say what it runs, and its needs join
the feed view at once (machines times the recipe's hourly draw times 24) with the same
verdicts, worked out on the page from the recipes the planner already carries. The name is
kept in the browser; on the live board it is also sent to the watcher, which stores it in
`market_history.json` and rebuilds, so the alerts follow. A line named this way is marked
*named by you*, with a x to forget it. A line stopped for want of one input says so, and
its other inputs read as *waiting* rather than as a problem of their own; an input that is
planned and stocked at the depot but arrived not at all in a week says that too.

Each view opens with its verdict in one line, such as *143 shelves clear their top-up;
tightest Energy Drink at the Midtown supermarket, 74% on a Saturday*, and then lists only
the rows that break it: a shelf above 85% pressure, a holding that misses its import, an
order that cannot cover its week. A toggle shows all of them. Reading 143 rows to learn
that 143 rows are fine is not reading.

The **weekly order** column is judged against what the coming week actually takes, not
against what last week took. You order once a week and top up daily; an order that
matched last week's draw exactly is the order working. Only one that falls short of the
week ahead, walked day by day through the weekday profile, is a finding.

**Uses / day** for a depot is measured, not inferred from the order. Every site keeps
the game's own log of its last sixty delivery transactions (`deliveryTransactions`);
the units a logistics round carried out, averaged over the days it ran, are the draw
as it happened. That is the only figure that sees a factory: tobacco leaves the import
depot at 9,600 a day and comes back as cigarettes, and neither is ever sold by the depot.
Where the log is too short (fewer than three rounds) the shops down the chain are
summed instead, and only when nothing has moved at all does last week's order stand in,
shown as *est.*, and never judged, because an order cut from 103,600 to 70,000 is a
change of mind, not a shortfall. A depot that feeds machines rather than shelves is also
walked at a flat daily rate: the machines take the same on a Saturday as on a Tuesday.

## The logistics set-up view

Two tables, one per number a logistics manager is set with.

- **Weekly import orders, per depot**: every material the depot ships, consolidated.
  What all the factories drawing on it eat in a week (from their lines, machines times
  recipe draw times 24 times 7), what else leaves for the shops (measured from the
  delivery log), the total, the order as it stands, and the order to set, rounded up to
  the hundred. Materials a factory line needs that no depot's plan carries are listed at
  the foot: those need a top-up added on some depot and an import there.
- **Daily top-ups, per factory**: every material each factory eats a day, the lines that
  eat it (with machine counts), the top-up now on the plan feeding it, and the top-up to
  set. A top-up below the day's need starves the machines before midnight; one far above
  it is only cash on a shelf, and is marked as such without alarm.

Both are built from the factory lines as the board reads them, or as you named them, so
a line named a moment ago is already in the totals. The section opens on *Needs a change*,
showing only the orders that are short, tight or missing and the top-ups below the day's
need or not arriving, and *Everything* shows the full set-up.

## The market demand view

- **Movers**: hype waves the game has flagged (demand up for a fixed run of days),
  supplier shortages, and demand that has actually moved against the stored history. All
  three are grouped: one wave across five products in a neighbourhood is one line, one
  product short at three suppliers is one line, and demand moves group by neighbourhood
  and by the kind of shop that sells them, so seven electronics lines sliding thirty
  points in Lower Manhattan is one event, not seven. Where one of your own shops of that
  same kind opened inside the trend window, the line says so. Your new shop absorbing
  unmet demand looks exactly like the market cooling, and it is not.
- **The best openings** the grid implies are ranked the way the decision is made, being
  how much of the type's range is in strong demand there, then how few rivals, then how
  loud, and shown in *Where to expand* rather than here, alongside the shops already at
  their ceiling. Business types with fewer than three products are left out of the grid
  entirely; a cell reading `1/1` describes one product, not a shop worth opening.
- **The grid**: demand 0-100 per product per neighbourhood, shaded by strength, with
  the number of rival sellers under each figure. A green underline means you sell it
  there. Four views: *By business type*, *What I sell*, *Not selling yet* (ranked by
  strongest unserved demand, so it doubles as a shortlist of what to offer next), and
  *Everything*.

### Grouped by business type

Opening a shop commits you to its whole range, so one product being wanted is not a
reason to build. The default view rolls demand up by business type and asks how much of
that type's range a neighbourhood wants at once: a cell reads `7/8`, meaning seven of a
bookstore's eight products are in strong demand there, with the average score and the
average number of rivals beneath it.

The product list for each business type is learned from the city itself. Every rival
shop in the save carries its type and its price list, so the catalogue comes from around
200 real businesses across 41 types rather than a hand-written table.

A type with one or two products is dropped from this view. A cell reading `1/1` says
nothing about whether a shop is worth opening there, it just says the one product it
tracks is wanted, and five such types were crowding out the fourteen that mean something.
The count of what was left out is printed above the grid.

The other views remain for stocking decisions in shops you already own: *What I sell*,
*Not selling yet*, and *Everything*. The old flat *Openings* ranking was dropped. It
answered the per-product question that *Not selling yet* already covers in grid form, and
*Where to expand* answers the expansion question better.

## What the save does not remember

The save stores only today: today's demand, today's cash, today's net worth. Anything
that compares one day with another has to be remembered somewhere else, so the board
keeps its own record, up to 60 days, kept separately per character, because each
character is a different generated city and a different company. Locally that record is
`market_history.json`; in the browser it is localStorage.

Two records live side by side under each character:

| Record | What it holds | What it is for |
| --- | --- | --- |
| `days` | a demand snapshot per game day | the market trend, compared against roughly a week back |
| `ledger` | cash, net worth and that day's profit | net worth week on week, and cash against profit |

Both are keyed by the game day, so rebuilding twice on the same day updates the entry
rather than adding a second one. The watcher rebuilds on every new save, so this fills
itself in as you play.

Cash and profit are not the same claim. Profit says what trading earned; cash says what
is left after paying for the next shop and the next week's stock. The gap between them is
the number worth seeing, as in *9 days: profit $11.2M, cash +$6.4M, so $4.8M went into
set-up and stock*, and it needs at least two readings to exist at all. Until then the
tiles say so rather than showing a figure.

To start with a populated history instead of an empty one:

```bash
python ba_dashboard.py --backfill
```

That reads every other save in the same character's folder and merges both records in.
It only ever adds; nothing is deleted, and re-running is harmless. This is a local-run
option; the browser page has no equivalent yet.

## Reading the numbers

A few figures are derived rather than stored, and it is worth knowing how:

- **Pressure** is a shop's daily sales over the daily top-up target for that product.
  At 100% a day of selling drains the whole delivery, so the shelf is empty before the
  next one. Products on no distribution plan fall back to plain days-of-cover, and only
  count if the shop actually holds stock of them. A cinema ticket is issued, not stocked.
- **Days left** at a depot divides the holding by daily use. On delivery day itself the
  figure is shown without a verdict: holdings are meant to be at their weekly low.
- **Spend per visit** is yesterday's revenue over yesterday's customer count. The game's
  `customerCapacity` is how many shoppers fit inside at once, not a daily total, so it
  is deliberately not shown as a utilisation percentage.
- **Cost centres**, meaning head office, warehouses and factories, are not flagged for
  losing money, and their week-on-week takings are not reported either. Most of what a
  factory makes leaves as goods for the shops rather than as sales, so its books run
  negative by design, and what it does sell arrives in batches on the purchase calendar
  rather than as trading. Their supply risks are still reported: a factory running out of
  raw materials is a real problem, a factory running a red line is not.
- **A factory's own sales** are real, external money, not an internal transfer. Goods
  moving from a factory to your own depot are booked at no cost on either side. The
  depot books no revenue and the shop books no goods cost, which is why an electronics
  shop shows a 98% margin. What a factory does book as revenue is what it ships to a
  pier, which is a sale to someone outside the company. You can see the difference in the
  daily statements: the factory books nothing at all on days when it makes no shipment,
  while the shops keep selling half a million. The chain line names the export amount
  separately for exactly this reason.
- **Materiality** is half a percent of the seven-day average daily profit, with a $500
  floor. Anything cheaper than that is counted at the foot of the alert panel rather than
  read out as a line.
- **Neighbourhood badges** come from the `[XX]` prefix you put in your business names.
  Add a new prefix to `NEIGHBOURHOODS` in `ba_dashboard.py` if you start using one.

## Files

| File | What it does |
| --- | --- |
| `ba_save.py` | Reads the `.hsg` format, being gzip around an Easy Save 3 binary stream. The format notes are in the module docstring. |
| `ba_dashboard.py` | Pulls the numbers out of a parsed save and renders the HTML. |
| `build_web.py` | Assembles `web/` from the same template the local server uses. Run `python build_web.py` after changing either Python file. |
| `web/` | The static site. `index.html` is generated; `app.js` and `worker.js` are kept by hand; `py/` holds the copies of the two Python files the worker fetches. |
| `check_saves.py` | Parses and extracts every save under the save root and prints a table, plus spot-checks of known numbers. Run `python check_saves.py [folder]`. |
| `wrangler.jsonc` | Assets-only Cloudflare Worker config. `npx wrangler deploy` publishes `web/`. |
| `dashboard.html` | The generated page from a local run. Overwritten each time. |
| `market_history.json` | Rolling demand snapshots and the cash/net-worth ledger, per character, from local runs. Safe to delete; it rebuilds, but the accumulated trend history is lost, so back it up rather than deleting it. |
| `LICENSE` | MIT. |

## Contributing, and reporting a save that will not build

The save format is reverse-engineered from the game's own files, so a game update can
break it. If a save is refused or the board fails to build, open a GitHub issue with:

- The one sentence the tool printed. It names the field, the game build the save came
  from and the build the board was checked on, which is most of the diagnosis.
- Whether you were in the browser or running from source.
- The game build number, if the message did not carry it.

Please do not attach a save file to a public issue unless you are happy for it to be
public. A save holds your whole company.

Before sending a change, run `python check_saves.py` over your own save folder. It parses
and extracts every save it finds and prints a table, which catches a parse that succeeds
while producing plausible wrong figures. If you touched `ba_save.py` or `ba_dashboard.py`,
run `python build_web.py` so the browser copies match.

## Licence

MIT. See `LICENSE`.
