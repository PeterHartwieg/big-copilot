"""Overview: Needs attention first, the task directory below, in every state and width."""
from __future__ import annotations

from kit import (hrow, ROUTE, app, btn, chip, cover, esc, gwbtn, hood, hours, ic, mw, sidebar, spark, state, top)

# --------------------------------------------------------------------------
# the company strip: four roles, one quiet line
# --------------------------------------------------------------------------
KPIS = [
    ("Profit yesterday", "-$1,240", "vs 7-day +$2,310", [4, 5, 3, 6, 5, 7, 6, 5, 8, 7, 6, 2], True),
    ("Revenue yesterday", "$38,920", "4,812 customers", [5, 6, 5, 7, 6, 8, 7, 7, 9, 8, 8, 7], False),
    ("Cash on hand", "$212,400", "+$9,800 this week · $120k owed", [3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9], False),
    ("Net worth", "$1.84M", "day 76 reading", [5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 8], False),
]


def kpis(narrow: bool = False) -> str:
    cells = "".join(
        f'<div class="nx-kpi"><span class="lab">{l}</span><span class="v">{v}</span>{spark(p, n)}<span class="s">{s}</span></div>'
        for l, v, s, p, n in KPIS)
    return (f'<div class="nx-kpis">{cells}<div class="more"><a class="link" href="{ROUTE["businesses/results"]}">Company results</a></div></div>')


# --------------------------------------------------------------------------
# the findings (synthetic; every kind named is a real ALERT_GROUPS kind)
# --------------------------------------------------------------------------
def crit_rows(states: dict | None = None) -> list[str]:
    states = states or {}
    rows = []
    # 1 · import shortfall, linked (not merged) to the factory input below it
    rows.append(f"""
<article class="nx-f crit" data-id="imp" data-link="feed" tabindex="-1">
  <span class="mark" aria-label="Critical"></span>
  <div class="bd">
    <div class="where">{hood("IC")}<b>Bridge Hub</b><span class="sep">·</span><span class="item">Water</span><span class="sep">·</span><span class="k">Import shortfall</span></div>
    <h3>Raise the Water import at Bridge Hub</h3>
    <p class="ev">Weekly order <b>8,400</b> from 1 Pier, Mondays · the coming week takes <b>12,180</b> at today's draw</p>
    <div class="cons">{chip("bad", "Runs dry Sat ~14:00", "clock")}<span>2 days before Monday's import · Canal Brewery's Beer line and 2 grocery shelves go without</span></div>
    <div class="viz" style="width:330px">{cover(["", "", "", "half", "dry", "", ""], ["WED", "THU", "FRI", "SAT", "SUN", "MON", "TUE"], truck=5)}</div>
    <button class="linked" type="button">{ic("link")}Linked, not the same fix: Canal Brewery's Water top-up (below)</button>
  </div>
  <div class="act">
    {btn("Review import amount", "go", ROUTE["supply/imports"], icon_end="go")}
    <span class="alt">{mw()}The game link can set the weekly amount</span>
    <span class="alt">{ic("hand")}Catch-up: buy 3,050 by hand, separately</span>
    {states.get("imp", "")}
  </div>
</article>""")
    # 2 · nobody staffed on a factory machine
    rows.append(f"""
<article class="nx-f crit" data-id="staff">
  <span class="mark" aria-label="Critical"></span>
  <div class="bd">
    <div class="where">{hood("IC")}<b>Canal Brewery</b><span class="sep">·</span><span class="item">Beer machine 4</span><span class="sep">·</span><span class="k">Nobody staffed</span></div>
    <h3>Staff Beer machine 4 at Canal Brewery</h3>
    <p class="ev">Staffed <b>0</b> of 168 h this week · the Beer line makes <b>1,500</b> of its rated <b>2,400</b> a day</p>
    <div class="cons">{chip("dim", "Plan for: Full production")}<span>Shop demand would need 13 h a day per machine instead: pick the basis first</span></div>
    <div class="viz" style="width:330px;display:flex;flex-direction:column;gap:3px">{hrow("M1", hours(range(24)))}{hrow("M2", hours(range(24)))}{hrow("M3", hours(range(6, 18)))}{hrow("M4", hours([], gap=set(range(24))))}</div>
  </div>
  <div class="act">
    {btn("Plan factory running hours", "go", ROUTE["supply/production"], icon_end="go")}
    <span class="alt">{ic("hand")}Factory hours are set in the game; no write</span>
    {states.get("staff", "")}
  </div>
</article>""")
    # 3 · a staff demand with a quit warning
    rows.append(f"""
<article class="nx-f crit" data-id="quit">
  <span class="mark" aria-label="Critical"></span>
  <div class="bd">
    <div class="where">{hood("HK")}<b>Vale Liquor</b><span class="sep">·</span><span class="item">Ana Reyes, Customer Service</span><span class="sep">·</span><span class="k">Staff demands</span></div>
    <h3>Give Ana Reyes free weekends at Vale Liquor</h3>
    <p class="ev">Wants free weekends · scheduled <b>Sat 10–18</b> and <b>Sun 10–18</b> · unhappy for <b>4</b> days</p>
    <div class="cons">{chip("bad", "May quit")}<span>She is 1 of 2 people on the Cash register here</span></div>
  </div>
  <div class="act">
    {btn("Resolve staff demand", "go", ROUTE["staffing/needs"], icon_end="go")}
    <a class="link" href="{ROUTE["staffing/schedules"]}">Vale Liquor's schedule</a>
  </div>
</article>""")
    # 4 · not trading yet: one parent, the distinct fixes kept
    rows.append(f"""
<article class="nx-f crit" data-id="ready">
  <span class="mark" aria-label="Critical"></span>
  <div class="bd">
    <div class="where">{hood("LM")}<b>Harbor Gifts</b><span class="sep">·</span><span class="item">opened day 81</span><span class="sep">·</span><span class="k">Not trading yet</span></div>
    <h3>Get Harbor Gifts trading: 2 settings missing</h3>
    <div class="kids">
      <div>{ic("tag")}<span>Set prices on 3 products: Gift (Cheap), Gift (Luxury), Umbrella</span><small>prices</small></div>
      <div>{ic("staffing")}<span>Schedule the Cash register and the Cleaning station</span><small>nobody scheduled</small></div>
    </div>
  </div>
  <div class="act">
    {btn("Open readiness", "go", "BusinessDetail.dc.html", icon_end="go")}
    <span class="alt">{ic("list")}Two separate fixes, kept apart</span>
  </div>
</article>""")
    return rows


WARN = [
    # sev, id, hood, site, headline, evidence, amt, amt_sub, action, route, extra
    ("watch", "am", "MT", "Juniper Books", "4 amenity fixes", "bathroom privacy · sink · music · interior design 62 of 75", "4", "fixes", "Review amenities", "businesses/standards", ""),
    ("watch", "feed", "IC", "Canal Brewery", "Water top-up covers 12 h of a 24 h line", "top-up 1,200 from Bridge Hub · the line eats 2,400 a day", "12 h", "a day covered", "Review factory input", "supply/production", "imp"),
    ("watch", "wh", "LM", "Harbor Gifts", "Gift (Cheap) wholesale delivery too low", "brings 450 a week · the shelf sells 600", "600", "/week used", "Review wholesale delivery", "supply/deliveries", ""),
    ("watch", "uni", "HK", "Vale Liquor", "2 roles have no uniform", "Customer Service · Cleaning · a uniform locker is installed", "2", "roles", "Set missing uniforms", "businesses/standards", "write"),
    ("watch", "ord", "GD", "Garment Depot", "Fabric (Cheap) weekly order too small", "5,000 a week from 7 Pier · the week takes 6,300", "6,300", "/week", "Review import amount", "supply/imports", "write"),
    ("watch", "nr", "GD", "Garment Depot", "Clothing (Cheap) is not routed", "3,000 held, no plan sends it on · 2 shops sell 180 a day", "3,000", "held", "Review routes", "supply/deliveries", ""),
    ("watch", "np", "MT", "Marlow Market", "Umbrella is on no distribution plan", "sells 21 a day · nothing tops the shelf up", "21", "/day", "Set delivery target", "supply/deliveries", ""),
    ("watch", "un", "IC", "Stitch Yard", "A factory line the board cannot name", "2 machines · draws Fabric (Cheap) · ships nothing yet", "2", "machines", "Identify recipe", "supply/production", ""),
    ("watch", "cap", "MH", "Pepper &amp; Pine Florist", "Cash register staffing is the limit, 17–19 daily", "20 of 20 served an hour · another Cash register person on those hours", "$410", "/day through it", "Review staffing", "staffing/schedules", ""),
    ("watch", "sat", "HK", "Corner Brew Coffee", "Customer satisfaction at 71%", "asked 14 · music and interior unmet", "71%", "satisfied", "Review satisfaction", "businesses/standards", ""),
    ("watch", "pro", "HK", "Marlow Market", "Promotes at 80% of the 100% cap", "foot traffic 60 + marketing 20 · campaigns left to run", "80%", "promotion", "Review promotion", "businesses/standards", ""),
]
OPP = [
    ("opp", "tgt", "MT", "Marlow Market", "Soda Can top-up target far above sales", "target 1,400 · busiest day sells 260", "1,400", "target", "Review lower target", "supply/deliveries", "mine"),
    ("opp", "trd", "HK", "Corner Brew Coffee", "Week up 22% on the week before", "$9,120 against $7,470", "+22%", "week on week", "See its results", "businesses/results", ""),
]


def crow(r) -> str:
    sev, rid, hd, site, what, ev, amt, sub, act, route, extra = r
    link = f' data-link="{extra}"' if extra and extra not in ("write", "mine") else ""
    st = ""
    if extra == "mine":
        st = f'<span style="grid-column:3/4;margin-top:4px">{state("mine", "Marked done by you · 09:12")}</span>'
    to = f'{mw() if extra == "write" else ""}{act}{ic("go")}'
    return (f'<a class="nx-r {sev}" data-id="{rid}"{link} href="{ROUTE[route]}">'
            f'<span class="mark"></span><span class="site">{hood(hd)}<span>{site}</span></span>'
            f'<span class="w"><b>{what}</b><small>{ev}</small></span>'
            f'<span class="amt">{amt}<small>{sub}</small></span><span class="to">{to}</span></a>')


def omit(short: bool = False) -> str:
    return f"""
<div class="nx-omit">
  <div>{ic("eyeoff")}<span><b>3 below the $500/day line</b> · $620/day together</span><button class="link" type="button">Show them</button></div>
  <div>{ic("prefs")}<span><b>Switched off:</b> Demand wave ending (1), Overstaffed hours (2)</span><a class="link" href="Customize.dc.html">Customize checks</a></div>
  {"" if short else f'<div>{ic("clock")}<span><b>Waiting for data:</b> Revenue trend at Harbor Gifts and Tide Tea, open under 7 trading days</span></div>'}
</div>"""


def att_head(crit="4", warn="11", opp="2", checked=True) -> str:
    chk = ('<p class="checked">Checked <b>14 businesses</b>, <b>212 supply lines</b> and <b>96 staff</b> '
           '<span class="mono">· snapshot day 83, Wed 09:40 · 29 of 31 checks on</span></p>') if checked else ""
    return f"""
<div class="nx-atthead" id="att">
  <div class="t"><h2>Needs attention</h2>{chk}</div>
  <div class="aside">
    <button class="sev crit" type="button" aria-pressed="true"><i></i>{crit}<span>critical</span></button>
    <button class="sev watch" type="button" aria-pressed="true"><i></i>{warn}<span>warnings</span></button>
    <button class="sev opp" type="button" aria-pressed="true"><i></i>{opp}<span>opportunities</span></button>
    <a class="nx-btn sm ghost" href="Customize.dc.html">{ic("prefs")}Customize checks</a>
  </div>
</div>"""


def rail(compact: bool = False) -> str:
    return f"""
<aside class="nx-rail" aria-label="This snapshot and your changes">
  <div class="nx-box">
    <h4>{ic("eye")}What the board checked</h4>
    <div class="nx-checked">
      <span>Businesses</span><b>14</b><span>Supply lines</span><b>212</b><span>Staff and their demands</span><b>96</b>
      <span>Checks switched on</span><b>29 / 31</b><span>Snapshot</span><b>day 83 09:40</b>
    </div>
    <p class="quiet" style="margin-top:10px">Read from the game link. The next read comes with the game's autosave or <b style="color:var(--ink-2);font-weight:500">Update</b>.</p>
  </div>
  <div class="nx-box">
    <h4>{ic("list")}Your changes<span class="aside"><a class="link" href="{ROUTE["supply/changes"]}">Checklist</a></span></h4>
    <div class="nx-prog">
      <div class="it"><b>Uniforms at Corner Brew Coffee</b>{state("link")}<small>09:31 · waiting for the next read to confirm the warning clears.</small></div>
      <div class="it"><b>Soda Can target at Marlow Market</b>{state("mine")}<small>09:12 · your note. The board has not seen it in the game yet.</small></div>
      <div class="it"><b>Water top-up at Marlow Market HK</b>{state("conf", "Confirmed from refreshed data")}<small>Day 83 09:40 · the refreshed save shows the shelf clears its busiest day.</small></div>
    </div>
  </div>
</aside>"""


TASKS = [
    ("supply", "Supply", "supply/changes", "9 changes", [
        ("Calculate import amounts", "2 depots · 2 need a change", "2", "w", "supply/imports"),
        ("Set delivery targets", "38 shelves · 4 to look at", "4", "w", "supply/deliveries"),
        ("Plan factory running hours", "2 factories · plan for full or shop demand", "", "", "supply/production"),
        ("Trace goods through the company", "21 sites · importers to shelves", "", "", "supply/flow")]),
    ("staffing", "Staffing", "staffing/schedules", "", [
        ("Build shop schedules", "11 shops · 2 plans differ from the game", "2", "w", "staffing/schedules"),
        ("See whom to hire", "hire 1 · assign 2 people first", "1", "", "staffing/needs"),
        ("Resolve staff demands", "3 demands · 1 may quit", "3", "b", "staffing/needs")]),
    ("businesses", "Businesses", "businesses/results", "", [
        ("Compare business profits", "14 businesses · company results", "", "", "businesses/results"),
        ("Check prices and product sales", "46 products · prices shop by shop", "", "", "businesses/products"),
        ("Improve customer satisfaction", "3 shops under 80%", "3", "w", "businesses/standards")]),
    ("expansion", "Expansion", "expansion/demand", "", [
        ("Find a suitable location", "12 vacant retail units · map and list", "", "", "expansion/finder"),
        ("Plan a new factory", "machines, inputs and costs", "", "", "expansion/plan"),
        ("Explore market demand", "7 neighbourhoods · 4 movers", "", "", "expansion/demand")]),
]


def tasks(no_factory: bool = False, cols: int = 4) -> str:
    groups = []
    for key, name, route, note, items in TASKS:
        rows = []
        for lab, sub, c, cc, r in items:
            pre = no_factory and lab == "Plan factory running hours"
            if pre:
                sub, c, cc = "No factories yet · what it needs, and Plan a factory", "", ""
            if no_factory and lab == "Calculate import amounts":
                sub = "No warehouses yet · wholesale deliveries instead"
            if no_factory and lab == "Trace goods through the company":
                sub = "5 shops · wholesale to shelves"
            cnt = f'<span class="c {cc}">{c}</span>' if c else '<span class="c"></span>'
            rows.append(f'<a class="nx-task{" pre" if pre else ""}" href="{ROUTE[r]}"><b>{lab}</b>{cnt}{ic("go")}<small>{sub}</small></a>')
        groups.append(f'<div class="nx-tg"><div class="gh"><span class="ic">{ic(key)}</span><b>{name}</b>'
                      f'<a href="{ROUTE[route]}">{"Open"}{ic("chev")}</a></div>{"".join(rows)}</div>')
    style = "" if cols == 4 else ' style="grid-template-columns:repeat(2,minmax(0,1fr))"'
    return f'<div class="nx-tasks" id="tasks"{style}>{"".join(groups)}</div>'


def tasks_head() -> str:
    return f"""
<div class="nx-sechead" style="margin-top:44px;margin-bottom:0;padding-bottom:12px">
  <h2>What Big Copilot can do for Marlow Trading</h2>
  <span class="quiet">The same thirteen tasks, in the same places, every visit. Counts follow the save.</span>
  <div class="aside"><button class="nx-search" type="button" style="width:auto">{ic("search")}Prefer typing? Find a tool<kbd>Ctrl K</kbd></button></div>
</div>"""


def queue(expanded: bool = False, states: dict | None = None) -> str:
    crit = "".join(crit_rows(states))
    first = WARN[:5]
    rest = WARN[5:]
    band_c = f'<div class="nx-band"><span class="lab crit">Critical · all 4 cause groups</span><span class="quiet">Critical findings are never folded away</span></div>'
    band_w = (f'<div class="nx-band"><span class="lab watch">Other actionable</span><span class="n">'
              f'{"11 warnings · 2 opportunities" if expanded else "5 of 11 warnings shown"}</span>'
              f'<span class="quiet">Ranked by materiality, as today</span></div>')
    more_rows = "".join(crow(r) for r in rest) + "".join(crow(r) for r in OPP)
    if expanded:
        body = band_c + crit + band_w + "".join(crow(r) for r in first) + more_rows
        more = f'<div class="nx-more"><button class="nx-btn sm" type="button">{ic("chevu")}Show fewer</button><a class="nx-jump" href="#tasks">{ic("chevd")}Jump to tasks</a></div>'
    else:
        body = band_c + crit + band_w + "".join(crow(r) for r in first)
        body += f'<div data-pane="more" hidden>{more_rows}</div>'
        more = (f'<div class="nx-more"><button class="nx-btn sm" type="button" data-open="more" aria-expanded="false">{ic("chevd")}'
                f'<span data-when="Show fewer" data-was="Show all 17: 6 more warnings, 2 opportunities">Show all 17: 6 more warnings, 2 opportunities</span></button>'
                f'<a class="nx-jump" href="#tasks">{ic("chevd")}Jump to tasks</a></div>')
    return f'<div class="nx-q" role="list" aria-label="Findings">{body}</div>{more}{omit()}'


def overview_body(expanded=False, states=None, rail_on=True) -> str:
    q = queue(expanded, states)
    grid = f'<div class="nx-attgrid"><div>{q}</div>{rail()}</div>' if rail_on else q
    return kpis() + f'<section class="nx-att" aria-labelledby="att">{att_head()}{grid}</section>' + tasks_head() + tasks()


def overview(expanded=False) -> str:
    return app("overview", "attention", "Overview", overview_body(expanded))


# --------------------------------------------------------------------------
# the other states of the same page
# --------------------------------------------------------------------------
def overview_calm() -> str:
    """No urgent findings: the healthy state still says what was checked and left out."""
    body = kpis() + f"""
<section class="nx-att">
  {att_head("0", "0", "1")}
  <div class="nx-attgrid"><div>
    <div class="nx-band"><span class="lab" style="color:var(--accent)">No urgent issues found in this snapshot</span><span class="quiet">Day 83, Wed 09:40 · game link</span></div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border-bottom:1px solid var(--rule-soft)">
      <div style="padding:16px 18px 16px 0;border-right:1px solid var(--rule-soft)"><span class="lab">Supply</span><p style="margin-top:8px;font-size:13.5px">Every shelf clears tomorrow's round; both depots reach Monday's import.</p><p class="quiet" style="margin-top:6px">38 shelves · 212 lines</p></div>
      <div style="padding:16px 18px;border-right:1px solid var(--rule-soft)"><span class="lab">Staffing</span><p style="margin-top:8px;font-size:13.5px">Nobody unstaffed; no staff demand unmet.</p><p class="quiet" style="margin-top:6px">96 people · 11 shops</p></div>
      <div style="padding:16px 0 16px 18px"><span class="lab">Businesses</span><p style="margin-top:8px;font-size:13.5px">All shops at or above 80% satisfaction.</p><p class="quiet" style="margin-top:6px">14 businesses</p></div>
    </div>
    {crow(OPP[0])}
    <div class="nx-omit">
      <div>{ic("eyeoff")}<span><b>2 below the $500/day line</b> · Umbrella at Marlow Market, a slow shelf at Harbor Gifts</span><button class="link" type="button">Show them</button></div>
      <div>{ic("prefs")}<span><b>Switched off:</b> Demand wave ending (1 wave with 3 days left), Overstaffed hours (4 shops)</span><a class="link" href="Customize.dc.html">Customize checks</a></div>
      <div>{ic("clock")}<span><b>Waiting for data:</b> Revenue trend and the weekday view need 14 trading days; you have 9.</span></div>
      <div>{ic("warn")}<span><b>Cannot check:</b> 1 factory line whose recipe the board cannot name</span><a class="link" href="{ROUTE["supply/production"]}">Identify recipe</a></div>
    </div>
  </div>{rail()}</div>
</section>""" + tasks_head() + tasks()
    return app("overview", "attention", "Overview", body, counts={"supply": ("1", "")})


def overview_shop_only() -> str:
    """A young, shop-only company: factory tasks stay visible and honest."""
    k = kpis().replace("-$1,240", "$840").replace("$38,920", "$6,410").replace("$212,400", "$18,300").replace("$1.84M", "$96,000")
    body = k + f"""
<section class="nx-att">
  {att_head("1", "2", "0").replace("14 businesses", "5 businesses").replace("212 supply lines", "31 supply lines").replace("96 staff", "13 staff")}
  <div class="nx-attgrid"><div>
    <div class="nx-band"><span class="lab crit">Critical · 1 cause group</span></div>
    <article class="nx-f crit">
      <span class="mark"></span>
      <div class="bd">
        <div class="where">{hood("MH")}<b>Tide Tea</b><span class="sep">·</span><span class="item">Tea (Green)</span><span class="sep">·</span><span class="k">Wholesale delivery too low</span></div>
        <h3>Raise Tide Tea's weekly wholesale delivery of Tea (Green)</h3>
        <p class="ev">Brings <b>300</b> each Thursday · the shelf sells <b>52</b> a day, <b>364</b> a week</p>
        <div class="cons">{chip("bad", "Empty from Tue", "clock")}<span>2 days before Thursday's delivery</span></div>
        <div class="viz" style="width:330px">{cover(["", "", "", "", "", "dry", "dry"], ["THU", "FRI", "SAT", "SUN", "MON", "TUE", "WED"], truck=None)}</div>
      </div>
      <div class="act">{btn("Review wholesale delivery", "go", ROUTE["supply/deliveries"], icon_end="go")}<span class="alt">{ic("hand")}Set in the wholesale store's contract; no write</span></div>
    </article>
    {crow(("watch", "x", "MH", "Tide Tea", "Customer satisfaction at 74%", "no music playing · interior 40 of 55", "74%", "satisfied", "Review satisfaction", "businesses/standards", ""))}
    {crow(("watch", "y", "LM", "Juniper Books", "Cash register staffing is the limit, 12–14", "10 of 10 served an hour", "$95", "/day through it", "Review staffing", "staffing/schedules", ""))}
    {omit(True)}
  </div>{rail()}</div>
</section>""" + tasks_head().replace("Marlow Trading", "Juniper &amp; Co") + tasks(no_factory=True)
    return app("overview", "attention", "Overview", body, counts={"overview": ("1", "crit")}).replace("Marlow Trading", "Juniper &amp; Co")


def overview_stale() -> str:
    """The source failed: the last good board stays, dated, with the way back."""
    banner = f"""
<div role="status" style="margin-top:16px;display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;border:1px solid color-mix(in srgb,var(--warn) 45%,transparent);background:var(--warn-soft)">
  {ic("warn", style="color:var(--warn)")}
  <span style="font-size:13px"><b>Showing the last good board, day 83 09:40.</b> <span style="color:var(--ink-2)">The game link stopped answering 40 s ago. Nothing below is newer than that.</span></span>
  <span style="margin-left:auto;display:flex;gap:8px">{btn("Try again", "sm", icon="refresh")}{btn("Open a save file instead", "sm ghost", "NoSave.dc.html")}</span>
</div>"""
    body = banner + overview_body()
    return (f'<div class="nx-app">{sidebar("overview", "attention", "fail")}'
            f'<main class="nx-main">{top("Overview")}{body}</main></div>')


def overview_focus() -> str:
    """Keyboard focus on a finding's action, reduced motion on (the tweak shows it)."""
    b = overview_body()
    b = b.replace(f'<a class="nx-btn go" href="{ROUTE["supply/imports"]}">', f'<a class="nx-btn go" style="outline:2px solid var(--accent);outline-offset:3px" href="{ROUTE["supply/imports"]}">', 1)
    return app("overview", "attention", "Overview", b)


# --------------------------------------------------------------------------
# 1024 and 768: the same order, re-flowed
# --------------------------------------------------------------------------
BP1024 = """
.bp1024 .nx-app{grid-template-columns:208px minmax(0,1fr)}
.bp1024 .nx-side{padding-left:14px}
.bp1024 .wordmark{font-size:19px;max-width:160px}
.bp1024 .nx-main{padding:0 28px 48px 28px}
.bp1024 .nx-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}
.bp1024 .nx-kpis .more{display:none}
.bp1024 .nx-kpi{grid-template-columns:minmax(0,1fr);padding-right:10px;margin-right:10px}
.bp1024 .nx-kpi svg{display:none}
.bp1024 .nx-kpi .v small{display:none}
.bp1024 .nx-atthead{flex-wrap:wrap}
.bp1024 .nx-atthead .aside{margin-left:0}
.bp1024 .nx-attgrid{grid-template-columns:minmax(0,1fr)}
.bp1024 .nx-rail{display:grid;grid-template-columns:1fr 1fr}
.bp1024 .nx-f{grid-template-columns:14px minmax(0,1fr) 176px}
.bp1024 .nx-r{grid-template-columns:14px 150px minmax(0,1fr) 150px}
.bp1024 .nx-r .amt{display:none}
.bp1024 .nx-tasks{grid-template-columns:repeat(2,minmax(0,1fr))!important}
.bp1024 .nx-tg:nth-child(2){border-right:0}
.bp1024 .nx-tg:nth-child(3){padding-left:0;border-top:1px solid var(--rule-soft)}
.bp1024 .nx-tg:nth-child(4){border-top:1px solid var(--rule-soft)}
.bp1024 .nx-sechead .aside{display:none}
.bp1024 .clock small .fv-diff{display:none}
"""

TAB = """
.nx-ttop{display:flex;align-items:center;gap:14px;height:64px;padding:0 24px;position:relative}
.nx-ttop .wordmark{font-size:23px;max-width:210px}
.nx-ttop .nx-src{display:flex;align-items:center;gap:8px;margin-left:8px}
.nx-ttop .clock{margin-left:auto}
.nx-tnav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr)) auto;gap:2px;padding:0 24px;border-bottom:1px solid var(--rule);position:relative}
.nx-tnav a{display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 4px 10px;color:var(--ink-2);font-size:12.5px;font-weight:500;position:relative}
.nx-tnav a .i{width:19px;height:19px}
.nx-tnav a.on{color:var(--ink)}
.nx-tnav a.on::after{content:"";position:absolute;left:18%;right:18%;bottom:-1px;height:2px;border-radius:2px;background:var(--accent)}
.nx-tnav a .n{position:absolute;top:5px;left:calc(50% + 8px);font:600 9.5px/1 "IBM Plex Mono",monospace;padding:2px 5px;border-radius:8px;background:var(--neg);color:#fff}
.nx-tnav .more{flex-direction:row;gap:6px;padding:0 6px 0 14px;border-left:1px solid var(--rule-soft);margin:8px 0;font-size:12.5px;color:var(--ink-3)}
.bp768 .nx-body{padding:0 24px 40px}
.bp768 .nx-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
.bp768 .nx-kpis .more{display:none}
.bp768 .nx-kpi{margin-right:14px;padding-right:14px}
.bp768 .nx-kpi:nth-child(2){border-right:0}
.bp768 .nx-kpi .v small{display:none}
.bp768 .nx-atthead{flex-wrap:wrap}
.bp768 .nx-atthead .aside{margin-left:0}
.bp768 .nx-attgrid{grid-template-columns:minmax(0,1fr)}
.bp768 .nx-rail{display:grid;grid-template-columns:1fr 1fr}
.bp768 .nx-f{grid-template-columns:14px minmax(0,1fr)}
.bp768 .nx-f .act{grid-column:2;flex-direction:row;flex-wrap:wrap;align-items:center;padding-top:10px}
.bp768 .nx-f .act .nx-btn{flex:none}
.bp768 .nx-r{grid-template-columns:14px minmax(0,1fr) auto;grid-template-rows:auto auto;row-gap:4px}
.bp768 .nx-r .site{grid-column:2}
.bp768 .nx-r .w{grid-column:2}
.bp768 .nx-r .amt{display:none}
.bp768 .nx-r .to{grid-column:3;grid-row:1/3}
.bp768 .nx-tasks{grid-template-columns:repeat(2,minmax(0,1fr))!important}
.bp768 .nx-tg:nth-child(2){border-right:0}
.bp768 .nx-tg:nth-child(3){padding-left:0;border-top:1px solid var(--rule-soft)}
.bp768 .nx-tg:nth-child(4){border-top:1px solid var(--rule-soft)}
.bp768 .nx-sechead .aside{display:none}
"""


def tablet_shell(active: str, body: str, sub_tabs: str = "") -> str:
    items = []
    for key, label in [("overview", "Overview"), ("businesses", "Businesses"), ("supply", "Supply"), ("staffing", "Staffing"), ("expansion", "Expansion")]:
        n = '<span class="n">4</span>' if key == "overview" else ""
        items.append(f'<a class="{"on" if key == active else ""}" href="{ROUTE[key]}">{ic(key)}<span>{label}</span>{n}</a>')
    return f"""
<header class="nx-ttop nx-ptop">
  <div class="nx-brand"><span class="wordmark" id="wm">Marlow Trading</span><span class="dot" id="dot" role="button" tabindex="0" aria-label="Brand dot"></span></div>
  <div class="nx-src"><span class="st live" style="color:var(--accent);display:flex;align-items:center;gap:6px;font:500 11px/1 'IBM Plex Mono',monospace;letter-spacing:.08em"><b style="width:7px;height:7px;border-radius:50%;background:currentColor"></b>LIVE · 14 S</span><button class="ibtn" type="button" aria-label="Update now">{ic("refresh")}</button></div>
  <div class="clock"><b>Day 83<i>·</i>Wed 09:40</b><small>YEAR 2 · 14 SITES</small></div>
  <div class="orb" aria-hidden="true" style="width:44px;height:44px"><u></u></div>
</header>
<nav class="nx-tnav" aria-label="Main">{"".join(items)}<a class="more" href="#" aria-haspopup="menu">{ic("map")}Map · Guide · More</a></nav>
{sub_tabs}
<div class="nx-body">{body}</div>"""


def overview_1024() -> str:
    body = kpis() + f'<section class="nx-att">{att_head()}<div class="nx-attgrid"><div>{queue()}</div>{rail()}</div></section>' + tasks_head() + tasks(cols=2)
    return f'<div class="bp1024" style="height:100%">{app("overview", "attention", "Overview", body)}</div>'


def overview_768() -> str:
    body = kpis() + f'<section class="nx-att">{att_head()}<div class="nx-attgrid"><div>{queue()}</div>{rail()}</div></section>' + tasks_head() + tasks(cols=2)
    return f'<div class="bp768" style="height:100%">{tablet_shell("overview", body)}</div>'


# --------------------------------------------------------------------------
# phone, 390
# --------------------------------------------------------------------------
PHONE = """
.ph{position:relative;height:100%;display:flex;flex-direction:column;background:var(--ground)}
.ph-top{position:relative;display:flex;align-items:center;gap:10px;height:58px;padding:0 16px;border-bottom:1px solid var(--rule)}
.ph-top .wordmark{font-size:21px;max-width:170px}
.ph-top .src{margin-left:auto;display:flex;align-items:center;gap:6px;font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--accent);letter-spacing:.06em}
.ph-top .src b{width:7px;height:7px;border-radius:50%;background:currentColor}
.ph-top .ibtn{width:40px;height:40px;border-radius:10px}
.ph-body{flex:1;overflow:hidden;padding:0 16px 96px}
.ph-tabs{position:absolute;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));height:74px;padding:6px 4px 14px;border-top:1px solid var(--rule);background:color-mix(in srgb,var(--ground) 92%,transparent);backdrop-filter:blur(8px);z-index:8}
.ph-tabs a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:10px;color:var(--ink-3);font-size:10.5px;font-weight:500;position:relative;min-height:48px}
.ph-tabs a .i{width:20px;height:20px}
.ph-tabs a.on{color:var(--accent);background:var(--accent-soft)}
.ph-tabs a .n{position:absolute;top:2px;left:calc(50% + 6px);font:600 9px/1 "IBM Plex Mono",monospace;padding:2px 4px;border-radius:7px;background:var(--neg);color:#fff}
.ph-co{display:flex;align-items:center;gap:8px;padding:10px 0;font:500 11px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3)}
.ph-co b{font-family:Archivo,sans-serif;font-size:12.5px;color:var(--ink-2);font-weight:500}
.ph-kp{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--rule-soft);border-radius:10px;overflow:hidden;border:1px solid var(--rule-soft)}
.ph-kp > div{background:var(--surface);padding:9px 11px;display:flex;flex-direction:column;gap:3px}
.ph-kp .lab{font-size:9.5px}
.ph-kp .v{font:500 16px/1.1 "IBM Plex Mono",monospace}
.ph-h{display:flex;align-items:flex-end;gap:10px;margin:22px 0 4px}
.ph-h h2{font-size:25px;font-weight:700;letter-spacing:-.03em;line-height:1}
.ph-h .nx-jump{margin-left:auto;padding:4px 9px;font-size:12px}
.ph-chk{font-size:12px;color:var(--ink-2);margin-bottom:10px}
.ph-sev{display:flex;gap:4px;margin:4px 0 6px;flex-wrap:wrap}
.ph-sev .sev{padding:8px 9px;min-height:36px}
.ph-f{display:flex;flex-direction:column;gap:7px;padding:14px 0;border-bottom:1px solid var(--rule-soft)}
.ph-f .where{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:12px;color:var(--ink-2)}
.ph-f .where .mk{width:8px;height:8px;border-radius:50%;background:var(--neg);box-shadow:0 0 0 3px var(--neg-soft)}
.ph-f .where .mk.w{background:var(--warn);box-shadow:none}
.ph-f .where .k{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.ph-f h3{font-size:15.5px;font-weight:600;line-height:1.3}
.ph-f .ev{font:400 12px/1.5 "IBM Plex Mono",monospace;color:var(--ink-2)}
.ph-f .ev b{color:var(--ink);font-weight:500}
.ph-f .nx-btn{height:44px;border-radius:10px;font-size:13.5px}
.ph-f .alt{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-3)}
.ph-r{display:grid;grid-template-columns:10px minmax(0,1fr) 16px;gap:4px 10px;align-items:center;padding:11px 0;border-bottom:1px solid var(--rule-soft);min-height:56px}
.ph-r .mk{width:7px;height:7px;border-radius:50%;background:var(--warn)}
.ph-r .w{display:flex;flex-direction:column;gap:3px;min-width:0}
.ph-r .w small{font-size:11.5px;color:var(--ink-3);display:flex;gap:6px;align-items:center}
.ph-r .w b{font-size:13.5px;font-weight:600;line-height:1.3}
.ph-r .w em{font-style:normal;font-size:12px;font-weight:600;color:var(--accent)}
.ph-r > .i{color:var(--ink-3);width:15px;height:15px}
.ph-tg{margin-top:14px;border-top:1px solid var(--rule)}
.ph-tg .gh{display:flex;align-items:center;gap:9px;padding:12px 0 4px}
.ph-tg .gh .ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)}
.ph-tg .gh b{font-size:15px}
.ph-tg a.t{display:grid;grid-template-columns:minmax(0,1fr) auto 14px;gap:2px 8px;align-items:center;min-height:48px;padding:6px 0;border-bottom:1px solid var(--rule-soft)}
.ph-tg a.t b{font-size:13.5px;font-weight:600}
.ph-tg a.t small{grid-column:1/2;font:400 11px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3)}
.ph-tg a.t .c{grid-row:1/3;grid-column:2;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--warn)}
.ph-tg a.t > .i{grid-row:1/3;grid-column:3;width:14px;height:14px;color:var(--ink-3)}
.ph .orb{bottom:auto;top:13px}
"""


def phone_shell(active: str, body: str) -> str:
    tabs = []
    for key, label in [("overview", "Overview"), ("businesses", "Businesses"), ("supply", "Supply"), ("staffing", "Staffing"), ("expansion", "Expansion")]:
        n = '<span class="n">4</span>' if key == "overview" else ""
        tabs.append(f'<a class="{"on" if key == active else ""}" href="{ROUTE[key]}">{ic(key)}<span>{label}</span>{n}</a>')
    tabs.append(f'<a href="#" aria-haspopup="menu">{ic("map")}<span>Map &amp; more</span></a>')
    return f"""
<div class="ph">
  <header class="ph-top nx-ptop">
    <div class="nx-brand"><span class="wordmark" id="wm">Marlow Trading</span><span class="dot" id="dot" role="button" tabindex="0" aria-label="Brand dot"></span></div>
    <span class="src"><b></b>LIVE</span>
    <button class="ibtn" type="button" aria-label="Update now">{ic("refresh")}</button>
  </header>
  <div class="ph-body">{body}</div>
  <nav class="ph-tabs" aria-label="Main">{"".join(tabs)}</nav>
</div>"""


def phone_overview() -> str:
    crit = f"""
<article class="ph-f">
  <div class="where"><span class="mk"></span>{hood("IC")}<span>Bridge Hub · <b style="color:var(--ink)">Water</b></span><span class="k">Import shortfall</span></div>
  <h3>Raise the Water import at Bridge Hub</h3>
  <p class="ev">Order <b>8,400</b> a week · the week takes <b>12,180</b></p>
  <div>{chip("bad", "Runs dry Sat ~14:00", "clock")}</div>
  <div style="margin:2px 0 2px">{cover(["", "", "", "half", "dry", "", ""], ["W", "T", "F", "S", "S", "M", "T"], truck=5)}</div>
  {btn("Review import amount", "go wide", ROUTE["supply/imports"] if False else "PhoneImports.dc.html", icon_end="go")}
  <span class="alt">{mw()}The game link can set the weekly amount</span>
</article>
<article class="ph-f">
  <div class="where"><span class="mk"></span>{hood("IC")}<span>Canal Brewery · <b style="color:var(--ink)">Beer machine 4</b></span><span class="k">Nobody staffed</span></div>
  <h3>Staff Beer machine 4 at Canal Brewery</h3>
  <p class="ev">0 of 168 h · line makes <b>1,500</b> of <b>2,400</b> a day</p>
  {btn("Plan factory running hours", "go wide", ROUTE["supply/production"], icon_end="go")}
</article>
<article class="ph-f">
  <div class="where"><span class="mk"></span>{hood("HK")}<span>Vale Liquor · <b style="color:var(--ink)">Ana Reyes</b></span><span class="k">Staff demands</span></div>
  <h3>Give Ana Reyes free weekends</h3>
  <p class="ev">Scheduled Sat and Sun 10–18 · {"<b style='color:var(--neg)'>may quit</b>"}</p>
  {btn("Resolve staff demand", "go wide", ROUTE["staffing/needs"], icon_end="go")}
</article>
<article class="ph-f">
  <div class="where"><span class="mk"></span>{hood("LM")}<span>Harbor Gifts</span><span class="k">Not trading yet</span></div>
  <h3>Get Harbor Gifts trading: 2 settings missing</h3>
  <p class="ev">Prices on 3 products · nobody scheduled</p>
  {btn("Open readiness", "go wide", "BusinessDetail.dc.html", icon_end="go")}
</article>"""
    warns = "".join(
        f'<a class="ph-r" href="{ROUTE[r[9]]}"><span class="mk"></span><span class="w"><small>{hood(r[2])}{r[3]}</small><b>{r[4]}</b><em>{r[8]}</em></span>{ic("chev")}</a>'
        for r in WARN[:3])
    groups = ""
    for key, name, route, note, items in TASKS:
        rows = "".join(f'<a class="t" href="{ROUTE[r]}"><b>{lab}</b><span class="c">{c}</span>{ic("go")}<small>{sub}</small></a>' for lab, sub, c, cc, r in items)
        groups += f'<div class="ph-tg"><div class="gh"><span class="ic">{ic(key)}</span><b>{name}</b></div>{rows}</div>'
    body = f"""
<div class="ph-co"><b>Marlow Trading</b>· Day 83 · Wed 09:40 · game link 14 s</div>
<div class="ph-kp">
  <div><span class="lab">Profit yesterday</span><span class="v neg">-$1,240</span></div>
  <div><span class="lab">Revenue</span><span class="v">$38,920</span></div>
  <div><span class="lab">Cash</span><span class="v">$212,400</span></div>
  <div><span class="lab">Net worth</span><span class="v">$1.84M</span></div>
</div>
<div class="ph-h" id="att"><h2>Needs attention</h2><a class="nx-jump" href="#tasks">{ic("chevd")}Tasks</a></div>
<p class="ph-chk">Checked 14 businesses, 212 supply lines and 96 staff · day 83 09:40</p>
<div class="ph-sev"><button class="sev crit" type="button"><i></i>4<span>critical</span></button><button class="sev watch" type="button"><i></i>11<span>warnings</span></button><button class="sev opp" type="button"><i></i>2</button><a class="nx-btn sm ghost" href="Customize.dc.html" style="margin-left:auto;height:36px">{ic("prefs")}Checks</a></div>
<div class="nx-band" style="padding-top:6px"><span class="lab crit">Critical · all 4</span></div>
{crit}
<div class="nx-band"><span class="lab watch">Other actionable · 3 of 13</span></div>
{warns}
<button class="nx-btn wide" type="button" style="height:44px;margin-top:12px">Show all 17 findings</button>
<div class="nx-omit" style="font-size:12px"><div>{ic("eyeoff")}<span>3 below the $500/day line · 3 switched off</span></div></div>
<h2 id="tasks" style="font-size:19px;font-weight:600;margin-top:28px">What Big Copilot can do</h2>
{groups}"""
    return phone_shell("overview", body)


# --------------------------------------------------------------------------
# the alternative navigation: the current masthead, evolved
# --------------------------------------------------------------------------
def overview_masthead() -> str:
    nav = "".join(f'<a class="{"on" if k == "overview" else ""}" href="{ROUTE[k]}">{ic(k)}{l}{"<span class=n>4</span>" if k == "overview" else ""}</a>'
                  for k, l, _ in [(a, b, c) for a, b, c in __import__("kit").AREAS])
    body = kpis() + f'<section class="nx-att">{att_head()}<div class="nx-attgrid"><div>{queue()}</div>{rail()}</div></section>' + tasks_head() + tasks()
    return f"""
<header class="nx-mast">
  <div class="nx-brand"><span class="wordmark" id="wm">Marlow Trading</span><span class="dot" id="dot" role="button" tabindex="0" aria-label="Brand dot"></span></div>
  <nav class="nav" aria-label="Main">{nav}</nav>
  <div class="refs"><a href="{ROUTE["map"]}">{ic("map")}City map</a><a href="{ROUTE["guide"]}">{ic("guide")}Game guide</a></div>
  <div class="clock"><b>Day 83<i>·</i>Wed 09:40</b><small>YEAR 2 · 14 SITES · 96 STAFF</small></div>
  <div class="orb" aria-hidden="true"><u></u></div>
</header>
<div class="nx-strip">
  <span class="co">{ic("folder")}<b>Marlow Trading</b><span class="quiet">Year 2 · autosave 3</span>{ic("chevd")}</span><span class="sep"></span>
  <span class="co" style="color:var(--accent);font:500 11px/1 'IBM Plex Mono',monospace;letter-spacing:.08em">● GAME LINK · LIVE · 14 S</span>
  <button class="ibtn" type="button" aria-label="Update now" style="width:28px;height:28px">{ic("refresh")}</button>
  <span style="margin-left:auto;display:flex;gap:6px;align-items:center">
    <button class="nx-search" type="button" style="width:220px">{ic("search")}Find a tool or answer<kbd>Ctrl K</kbd></button>
    <a class="ibtn" href="{ROUTE["prefs"]}" aria-label="Preferences">{ic("prefs")}</a><a class="ibtn" href="{ROUTE["help"]}" aria-label="Help and feedback">{ic("help")}</a>
  </span>
</div>
<main class="nx-main" style="padding:0 44px 60px">{body}</main>"""


# --------------------------------------------------------------------------
# Customize checks: every kind, grouped by task, defaults marked
# --------------------------------------------------------------------------
KINDS = {
    "Supply": [("Import shortfall", 1), ("Weekly order too small", 1), ("Import paused", 1), ("Factory inputs", 1), ("Depot top-up too low", 1),
               ("Wholesale delivery too low", 1), ("No distribution plan", 1), ("Outsells its top-up", 1), ("Not routed", 1), ("Idle stock", 1),
               ("Top-up target too high", 1), ("Unnamed factory line", 1), ("Machine with no recipe", 1)],
    "Staffing": [("Nobody staffed", 1), ("Staff demands", 1), ("Insurance / happy boss", 1), ("At capacity", 1), ("Overstaffed hours", 0)],
    "Businesses and standards": [("Not trading yet", 1), ("Vacant leases", 1), ("Losing money", 1), ("Revenue trend", 1), ("Low satisfaction", 1),
                                 ("Promotion below cap", 1), ("Uniforms / locker", 1), ("No customer bathroom", 1), ("Bathroom has no privacy", 1),
                                 ("No customer sink", 1), ("No music playing", 1), ("Interior design too low", 1)],
    "Market signals": [("Demand wave ending", 0)],
}
CUST_CSS = """
.cz-scrim{position:absolute;inset:0;background:#000a;z-index:20}
.board.light .cz-scrim{background:#15181a55}
.cz{position:absolute;top:0;right:0;bottom:0;width:560px;z-index:21;background:var(--surface);border-left:1px solid var(--rule);box-shadow:var(--shadow);display:flex;flex-direction:column}
.cz-h{display:flex;align-items:center;gap:12px;padding:22px 24px 14px;border-bottom:1px solid var(--rule-soft)}
.cz-h h2{font-size:19px;font-weight:600}
.cz-b{padding:6px 24px 20px;overflow:hidden;flex:1;display:flex;flex-direction:column;gap:14px}
.cz-mat{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;background:var(--ground);font-size:13px}
.cz-mat input{width:86px;height:32px;border-radius:7px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);font:500 13px/1 "IBM Plex Mono",monospace;padding:0 8px;text-align:right}
.cz-g h3{font-size:12px;font-weight:500;font-family:"IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);padding:6px 0;border-bottom:1px solid var(--rule)}
.cz-l{display:grid;grid-template-columns:1fr 1fr;column-gap:18px}
.cz-k{display:flex;align-items:center;gap:10px;min-height:32px;border-bottom:1px solid var(--rule-soft);font-size:12.5px}
.cz-k small{margin-left:auto;font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.cz-k small.w{color:var(--warn)}
.nx-sw{position:relative;width:30px;height:17px;border-radius:9px;background:var(--rule);flex:none;border:0;padding:0;cursor:pointer}
.nx-sw::after{content:"";position:absolute;left:2px;top:2px;width:13px;height:13px;border-radius:50%;background:var(--ink-2);transition:transform .2s}
.nx-sw.on{background:var(--accent)}.nx-sw.on::after{transform:translateX(13px);background:var(--on-accent)}
.nx-sw{position:relative;width:30px;height:17px;border-radius:9px;background:var(--rule);flex:none;border:0;padding:0;cursor:pointer}
.nx-sw::after{content:"";position:absolute;left:2px;top:2px;width:13px;height:13px;border-radius:50%;background:var(--ink-2);transition:transform .2s}
.nx-sw.on{background:var(--accent)}.nx-sw.on::after{transform:translateX(13px);background:var(--on-accent)}
.cz-f{display:flex;align-items:center;gap:10px;padding:14px 24px;border-top:1px solid var(--rule-soft)}
"""


def customize() -> str:
    counts = {"Idle stock": "", "Overstaffed hours": "2 hidden", "Demand wave ending": "1 hidden", "Import shortfall": "1 now"}
    groups = ""
    for g, ks in KINDS.items():
        items = "".join(f'<div class="cz-k"><button class="nx-sw{" on" if on else ""}" type="button" role="switch" aria-checked="{"true" if on else "false"}" aria-label="{k}"></button>'
                        f'<span>{k}</span><small class="{"w" if "hidden" in counts.get(k, "") else ""}">{counts.get(k, "") or ("off by default" if not on else "")}</small></div>' for k, on in ks)
        groups += f'<div class="cz-g"><h3>{g}</h3><div class="cz-l">{items}</div></div>'
    panel = f"""
<div class="cz-scrim"></div>
<div class="cz" role="dialog" aria-modal="true" aria-labelledby="czh">
  <div class="cz-h">{ic("prefs")}<h2 id="czh">Customize checks</h2><span class="quiet">Kept in this browser, for every company</span><button class="gw-x" type="button" style="margin-left:auto" aria-label="Close">{ic("x")}</button></div>
  <div class="cz-b">
    <div class="cz-mat">{ic("coin")}<span>Hide findings worth less than</span><input value="500" aria-label="Materiality line, dollars a day"><span class="quiet">$ a day · 3 below it now</span></div>
    {groups}
    <p class="quiet">Switched-off kinds and findings below the line are still counted under Needs attention, with a Show link. Nothing is deleted.</p>
  </div>
  <div class="cz-f"><button class="link" type="button">Reset to defaults</button><span style="margin-left:auto"></span>{btn("Done", "go")}</div>
</div>"""
    return app("overview", "attention", "Overview", overview_body()) + panel


def overview_long() -> str:
    """German interface labels and long names: nothing truncates away the meaning."""
    b = app("overview", "attention", "Übersicht", overview_body())
    pairs = [(">Overview<", ">Übersicht<"), (">Businesses<", ">Unternehmen<"), (">Supply<", ">Versorgung<"), (">Staffing<", ">Personal<"),
             (">Expansion<", ">Expansion<"), (">Needs attention<", ">Braucht Aufmerksamkeit<"), (">What it can do<", ">Was es kann<"),
             (">City map<", ">Stadtplan<"), (">Game guide<", ">Spielführer<"), ("Find a tool or answer", "Werkzeug oder Antwort finden"),
             (">Preferences<", ">Einstellungen<"), (">What's new<", ">Neuigkeiten<"), (">Help &amp; feedback<", ">Hilfe und Feedback<"),
             ("Needs attention</h2>", "Braucht Aufmerksamkeit</h2>"), ("Review import amount", "Importmenge prüfen"),
             ("Plan factory running hours", "Laufzeiten der Fabrik planen"), ("Resolve staff demand", "Mitarbeiterwunsch lösen"),
             ("Open readiness", "Betriebsbereitschaft öffnen"), ("Customize checks", "Prüfungen anpassen"),
             ("Marlow Trading", "Marlow &amp; Vandersloot Handelsgesellschaft"), ("Bridge Hub", "Bridge Hub Zentrallager Industry City"),
             ("Critical · all 4 cause groups", "Kritisch · alle 4 Ursachengruppen"), (">Reference<", ">Nachschlagen<")]
    for a, c in pairs:
        b = b.replace(a, c)
    return b
