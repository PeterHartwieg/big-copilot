# Porting the revamp into the real board

A plan for a fresh session. Goal: the live board (`ba_dashboard.py` template, plus the
`web/` shell) looks and behaves like the design canvas, as close to pixel-for-pixel as the
real data allows. Peter approved the canvas on 11 Sep 2026 after four rounds of review.

## Sources of truth

| What | Where |
| --- | --- |
| The approved design, interactive | https://claude.ai/code/artifact/d6b41fc1-edd5-4337-ad14-e6cff430a33b |
| The generator, the single place the CSS and script live | `mockup/revamp/build_canvas.py` |
| One artboard per view, generated from it | `mockup/revamp/*.dc.html` (14 files) |
| The board being replaced | `ba_dashboard.py`, `TEMPLATE` from line ~4356 (CSS) and ~5004 (JS) |
| The web shell around it | `build_web.py` (landing + source strip markup and `lg-` CSS), `web/app.js` |

Read `build_canvas.py` top to bottom before touching anything: the `CSS` string is the
stylesheet to reproduce, `SCRIPT` is the interaction spec, and each `def <page>()` is the
markup for one view with the exact class names. Do not read `big-copilot-board.html`
(2 MB of editor code) and do not read the alternates (`AltPaper`, `AltPanel`): they are
unchosen directions.

To look at an artboard in a browser at full size, convert it to a plain page. The trick
used during the design rounds, run from `mockup/revamp/`:

```bash
mkdir -p preview && python -c "
import re,glob
for f in glob.glob('*.dc.html'):
    s=open(f,encoding='utf-8').read()
    helmet=re.search(r'<helmet>(.*?)</helmet>',s,re.S).group(1)
    body=re.search(r'</helmet>\s*(.*?)\s*</x-dc>',s,re.S).group(1).replace('{{theme}}','dark')
    m=re.search(r'<script data-dc-script[^>]*>(.*?)</script>',s,re.S); js=m.group(1) if m else ''
    open('preview/'+f.replace('.dc.html','.html'),'w',encoding='utf-8').write('<!doctype html><html><head><meta charset=\"utf-8\">'+helmet+'</head><body>'+body+'<script>class DCLogic{constructor(p){this.props=p}}\n'+js+'\nif(typeof Component!=\"undefined\"){const c=new Component({dark:true});c.componentDidMount&&c.componentDidMount();}</script></body></html>')
"
```

Serve the project root with the `web-test` launch config (port 8790) and open
`/mockup/revamp/preview/<Name>.html`. Delete `preview/` when done; it must not be committed
or deployed. Replace `dark:true` with `dark:false` to see the light palette.

## What the design changes, in one screen

- Same tokens as today (Archivo, IBM Plex Mono, the green accent, both palettes) but a new
  composition: a 100 px masthead with a sliding nav underline and a static clock, one page at
  a time as before, sub-views as a segmented control, sections that reveal on entry.
- Every explanatory sentence moves behind a `?` mark whose note opens to its right. No
  `.head p` notes under headings any more.
- Findings are a severity dot, a site pill, a short verb phrase and a number. The detail
  sentence unfolds on hover. The three severity counts are the filter. The dot on a row
  silences that finding.
- Tables keep their columns but lose the card border: hairline rows on the ground, mono
  numerals, group rows for depots, thin gauges under "at depot" and "pressure" figures.
- A "Next moves" row on Today with three cards marked SOON (Plan imports, Optimize staffing,
  Find a location). They are placeholders for features that do not exist yet; they link
  nowhere.
- The sphere: the brand dot grown up. It rolls out of the wordmark onto the masthead rule,
  sits past the nav, watches the pointer, squishes on click, rolls along its shelf on scroll.
- "Where to expand" is gone from Growth. Growth is Demand and Plan a chain.
- Plan a chain has no sliders: each line has a machine stepper, and the export surplus is
  computed from the shops the player already owns.

## Ground rules for the port

1. **The generator's CSS is the spec.** Copy class names and values verbatim into the
   template's `<style>`; do not restyle old class names to look similar. Old rules that no
   longer have markup are deleted, not kept "just in case". The old `.card`, `.head p`,
   `.alert i` stripe, `.pages` bar, `.subnav` and `.chip.neutral` go away.
2. **Keep the data and the decisions.** Every number, threshold, verdict and sort that the
   board computes today stays. The redesign changes how things are shown, never what is
   shown or when a finding fires. `_alerts`, `_supply`, `_factories`, `_market`, `_plan` in
   Python are untouched except where a view needs a field it does not have yet (below).
3. **Keep what the mockup could not show.** Table sorting by header, the site picker,
   `show all` toggles, `--watch` live reloads, the Update/More strip, alert-kind settings in
   `localStorage`, line naming for factories, `content-visibility` on off-screen sections:
   all stay, restyled.
4. **Both front doors.** `dashboard.html` (standalone) and `web/index.html` (Pyodide) share
   the template; the landing and the source strip live in `build_web.py` and `web/app.js`.
   After any Python edit: `python check_saves.py`, then `python build_web.py`, then restart
   Peter's `--watch` process. Render test pages as `web/test-*.html` and delete them.
5. **Light palette is a tweak on the canvas, a media query here.** Every artboard has a
   `dark` toggle; the CSS defines `.board.light` overrides. In the template the same values
   go under `@media (prefers-color-scheme:light)` and `:root[data-theme="light"]` as today.
   Check both.
6. **Tooltips and containment.** The template sets `section{content-visibility:auto}`,
   which implies paint containment: an absolutely positioned `[data-tip]::after` inside a
   section is clipped to that section. Either render tooltips into one body-level layer
   (recommended: a single `#tip` element positioned from the hovered element's rect, the
   way the chart tip already works) or set `content-visibility:visible; contain:none` on
   sections that carry `?` marks, as `#secFlow` already does for its dropdown. Decide once,
   apply everywhere.
7. **Sticky masthead needs `overflow:clip`, never `overflow:hidden`,** on any ancestor;
   hidden makes that ancestor the scroll container and sticky stops working (found and
   fixed on the canvas).
8. **Links.** The canvas defines `a{color}` and `a:hover{color}` because its format
   requires it; that leaked green into buttons and rows until `.btn:hover` and
   `.find:hover` set their own colour. In the template, do not add a global `a:hover`
   colour; style links by class.
9. **No emoji, no dingbats as icons.** Inline stroke SVG from the `ICON` dict in the
   generator. The only glyphs allowed in text are ▲ ▼ inside chips and the ? in its circle.

## Where each artboard lands

Work page by page, in this order, each step ending with a screenshot comparison against
the artboard preview at 1440 px wide.

### 0. Skeleton: tokens, masthead, nav, pages (`Main.dc.html` masthead, `SCRIPT` nav block)

- Replace the `<style>` block's variables and base with the generator's `.board` tokens
  (keep them on `:root` as today), `body` type, `.wrap{width:min(1180px,calc(100% - 80px))}`.
- `drawMast()` builds the new `.mast`: `.brand` (wordmark + `#dot`), `.nav` with the five
  icon+label links and the `.ink` underline, `.clock` with the tooltip. The `mast-meta`
  block (sites, staff) collapses into the clock's `small` line as in the mockup.
- `showPage()` toggles `.on` on nav links instead of `aria-pressed` on `.pages button`;
  the sliding underline follows the pointer and returns home (`SCRIPT`: "nav underline").
- `showSub()` renders a `.seg` segmented control per page in place of `.subnav`.
- Sections get `class="sec rv"`; the reveal observer from `SCRIPT` runs once after each
  `renderAll()` (mark already-revealed sections so a re-render does not replay it).
- `drawFooter()` becomes the three-span `.foot` line.
- Check: Today at 1440 px, light and dark, against `preview/Main.html` top half.

### 1. The sphere (`SCRIPT`: "the sphere is the dot grown up")

- `<div class="orb"><i></i><u></u></div>` inside `.mast`, after the clock. Port the CSS
  block "the sphere" and the script block verbatim; the only project-specific bit is where
  it rests (`#nav` right edge + 56) and its run limit (`.clock` left edge - 28).
- The entrance plays on boot only, not on every re-render: guard with a module flag.
- **The flock (easter egg).** Clicking the wordmark text (not the dot) rolls another ball
  out of the dot onto the shelf: sizes 100, 72, 54 px with a 12 px gap, the shelf starting
  40 px past the nav so three clear the clock. On the fourth click the first ball gulps its
  neighbour (the neighbour slides into it and shrinks, the eater squishes), the rest shift
  left, and a new ball rolls out. All balls roll together on scroll; the run limit is
  measured from the rightmost one. Port `spawn`, `eat`, `makeBall` and `enter` from
  `SCRIPT` as they are; clicks are ignored while any ball is mid-animation.
- `prefers-reduced-motion`: skip the entrance and the roll, place it at rest.
- Landing variant (step 9) is 360 px and rests beside the drop zone.

### 2. Today (`Main.dc.html`)

- `drawKpis()`: `.kpis` grid of `.kpi` tiles: `.lab`, `.v`, a `.row` with one `.chip` and a
  `.sub`, then `.spark` with `data-vals` for the pointer read-out. Sparkline markup is the
  generator's `spark()` (polygon area + polyline + `.pt` + `.scrub`), not the current
  `sparkline()`. The chips: profit vs 7-day (`ok`/`bad` by sign), customers (`dim`), cash
  week delta (`bad`/`ok`), rent (`dim`). The tooltip text on each chip is the sentence the
  tile used to print.
- `drawAlerts()`: `.sechead` with title, `?` (the threshold sentence), three `.sev` counters
  with `data-kind` = `crit|watch|opp` mapped from the alert levels (`critical`→crit,
  `warn`→watch, else opp), and the `.ibtn` tune button that opens the kinds panel.
  Rows are `<a class="find {kind}">` with `.mark`, `.site` (`.hood` neighbourhood code +
  short site name via `shortName()`), `.what` (the alert's headline, already short in
  `_alerts`; where a headline is a long sentence, split at the first colon or semicolon
  and move the rest into `.more`), `.amt` + `small` unit, `.go` arrow, `.more` detail.
  `goToAlert()` stays on the row click; the `.mark` click silences (new
  `localStorage` key `ba_dash_silenced` holding alert ids; add a stable id per alert in
  `_alerts` if one does not exist) and shows the `#silenced` undo line.
- Minor findings line: `.quiet` sentence + `.link` show, replacing `.minor`.
- New section "Next moves": three `.move` cards with the SOON tag; static markup, tilt
  from `SCRIPT`. A fourth dashed `.move.add` is not in the final design; omit.
- Check against `preview/Main.html`, then hover states: tile spotlight + scrub, row
  unfold, mark scale, sev filtering, silence + undo, card tilt, coin burst on `#dot`.

### 3. Today: filter kinds (`FilterKinds.dc.html`)

- `buildAlertSettingsPanel()` renders the `.pop` popover (title, one `.kind` row per alert
  group with `.sw` switch and "n today" count, reset link, Done). Anchor it under the tune
  button, close on outside click. Keeps `ALERT_SETTINGS_KEY`.

### 4. Results (`Results.dc.html`, `SiteDetail.dc.html`)

- `drawChart()`: `.chartbox.chart` with the `.readout` line above the SVG (default text =
  last day), series in `<g data-series>` groups, the `.xh` crosshair group, and `.legend`
  chips that toggle groups. Delete the floating `.tip`. Y axis labels via `money()` style
  compact formatting (`$3.57M`, `$751k`).
- `drawRhythm()`: `.week` of seven `.wd` columns; bar above or below the midline by sign,
  the value in an ink pill at the bar's tip, weekday name spelled out on hover, `now`
  column outlined. The "site by site" table stays behind the `.link` in the `.aside`.
- `drawPortfolio()`: `tr.chain` rows with the SVG chevron and `tr.kid` rows shown by
  toggling `show` (replaces `openChains` rendering; keep the set for persistence). Sort
  arrows stay in `thead th`.
- `drawSite()`: `.sitehead` (bullet, name, sub line, site picker as a `.seg`, close as
  `.ibtn`), four `.sstat` tiles, `.hours` grid (24 × 7 `.hc` cells, `cap` class where the
  hour is at the door cap, `data-read` sentence) with the `#hourRead` line, then the
  `.duo` of Crew (`.person` pills, `off` for absent) and Shelves table with pressure gauges.
  The mini charts of today's `drawSite()` move under the shelves if they still earn their
  place; ask Peter if unsure, do not drop silently.

### 5. Supply (`Supply.dc.html`, `SupplyChecks.dc.html`, `SupplyMap.dc.html`)

- `drawLogistics()`: `.sechead` with the "Needs a change / Everything" `.seg`, then
  "Weekly imports" with a red `.chip` count, the `?`, and the table with `tr.grp` depot rows,
  `td[data-now][data-to]` for the raise roll-up, `.set` target + `.up` chip, `td.gauge`
  depot cell (`low` when under a day). Daily top-ups collapse to one line with the
  `.check` when all are covered, else the table as today.
- `drawStock()`: the five stock views become the `.seg` in the `.aside`; the verdict
  becomes the `.quiet` line with the `.check`; pressure column gets the gauge.
- `drawFlow()`: keep `flowLayout()`; render nodes as `g.node[data-id]` with the hood pill,
  pipes as `path.pipe.{weekly|daily}#pipeN[data-a][data-b]`, one `circle.cargo` per pipe
  with `animateMotion` + `mpath`, warning dots as before. Node click = `flowPick` (dim the
  rest, light its pipes), pipe hover = cargo. `drawFlowDetail()` stays below the map.
  Legend moves into the `?`.

### 6. Growth (`Growth.dc.html`, `GrowthPlan.dc.html`)

- Remove `drawExpansion()` and `#secExpand`; keep `_expansion` in Python only if another
  view reads it (the hour-cap finding on Today still does).
- `drawMarket()`: `.waves` chips for hype and shortage (up/down icon, place, lines, days
  left), then the `.heat` grid: `.h` column headers with `data-c`, `.r` row labels with
  `data-r`, `.cell` with `data-r`/`data-c`/`data-tip`, the rival dots in `.rv2`, `mine`
  outline where the player sells; `#cellDetail` line under it. Shade by
  `color-mix(in oklab, var(--accent) N%, var(--surface))` as in `shade()`. The three market
  views become the `.seg`. `drawMovers()` content is the `.waves` row.
- `drawPlan()` / `paintPlan()`: the `.seg` of business types in the `.aside`, three
  `.planstat` tiles, the table of `tr.line[data-m][data-rate][data-ing]` with the
  `.step` (−, count, +, machine squares), made/week, "supplies N shops", raw material with
  bold quantities, and the `.planline` sentence using the player's real shop count and
  measured per-shop sales. `planCounts` already holds per-line machine counts: reuse it.
  Drop `planRate` and `planShops` inputs.
- **Ingredients table** (second section on the same artboard): one row per raw material,
  summed over every line that uses it (Sugar = Energy Drink + Ice Cream, Russet Potatoes =
  Fresh Food + Frozen Food), columns Ingredient · Used by · Per day · Per week · Weekly
  order (the week rounded up to the hundred, `_ceil_hundred`), sorted by weekly use.
  It recomputes on every stepper click and the rows whose figure changed flash once
  (`tr.bump`). Per-unit ingredient factors come from the recipe pages the board already
  parses (`_recipes`, `RECIPE_BY` in the template); the mockup's `data-ing="name:factor"`
  is that same data flattened. This table is what Peter sizes the factory's import
  orders from, so its numbers must match what `drawLogistics()` would later show for the
  same machines.

### 7. Company (`Company.dc.html`)

- `drawProducts()`: revenue bar inline in the cell, peaks column green when set.
- `drawPayroll()`: satisfaction and absent as chips with tooltips; `.role` rows with the
  bar and the daily cost on hover.
- `drawGoals()`: `.mile` checklist (done boxes filled) and the house rules as `.rules`
  chips with the explanation in a tooltip. The click-to-tick is a mockup; do not port it.

### 8. Source strip (`SourceStates.dc.html`)

- In `build_web.py` + `app.js`: the `#sourceRow` becomes a `.strip` with `.st` (led +
  state + `.file` mono), `.right` with `.btn2` Update and the `.ibtn` More menu. Four
  states as drawn: up to date, reading (progress bar, Update disabled), could not read
  (red led, recovery button first), folder remembered. Replace the `lg-btn` family where
  the strip uses it; leave the More menu's panel styling in place.

### 9. Landing (`Landing.dc.html`)

- `build_web.py` template: `.landing` with the wordmark + `#dot`, the one sentence, the
  `.drop` zone (folder that opens on hover and on `dragover`), the `.btn` folder picker
  with the "or one save file" link, the footer line. The sphere enters from the dot and
  rests beside the drop zone. Game-text chip and the save-location help go under the
  "Where saves live" link.

### 10. Finish

- `python check_saves.py`, `python build_web.py`, restart the watcher, `git diff --stat`.
- Screenshot every page in both palettes against its preview; list remaining differences
  with a reason for each (data-driven vs design).
- Peter's review routine before pushing: a Grok 4.6 review plus an Opus subagent.
- Deploy is `npx wrangler deploy` from the project folder, Peter's call.

## Python fields the views need that may not exist yet

Check each before assuming; add in `extract()`/helpers if missing:

- a stable `id` per alert (for silencing) and a `unit` for the amount (`/day rent`,
  `orders`, `/week`)
- neighbourhood code per business for the `.hood` pill (exists as `code` on bullets)
- per-depot "days of use on hand" for the gauge (`at depot ÷ daily use`)
- per-shelf pressure as a number (exists in stock rows as a percentage string; keep a
  numeric field)
- hours-at-cap per site and cap value for the site detail tile (from `_hourly`)
- the player's shop count per business type and the measured per-shop sales for Plan a
  chain (`planFor()` already derives `perShop`; expose the count)

## What not to port

- The alternates page and the sticky notes on the canvas.
- Milestone click-to-tick, source strip Update timer, the `.move.add` card.
- The `dark` tweak mechanism; the template already follows the system palette.

## Suggested session opening

"Read `mockup/revamp/IMPLEMENTATION.md` and `mockup/revamp/build_canvas.py`, build the
previews, open `preview/Main.html` next to the current `dashboard.html`, then start at
step 0. Work on a branch called `revamp`, one commit per step, screenshots at each step."
