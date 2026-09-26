"""Structure sheets: the sitemap, the coverage sheet, the rationale, the navigation
comparison and the motion/focus sheet."""
from __future__ import annotations

import json
from pathlib import Path

from kit import ROUTE, btn, chip, cover, esc, gwbtn, hood, hours, ic, mw, state
import boards_overview as ov

HERE = Path(__file__).parent

CSS = """
.ss{padding:48px 56px 56px}
.ss h1{font-size:34px;font-weight:800;letter-spacing:-.035em}
.ss .sub{margin-top:8px;font-size:14px;color:var(--ink-2);max-width:980px;line-height:1.55}
.ss .sub b{color:var(--ink);font-weight:600}
.sm-shell{display:flex;align-items:center;gap:10px;margin-top:26px;padding:12px 16px;border-radius:12px;border:1px solid var(--rule);background:var(--surface);flex-wrap:wrap}
.sm-shell .lab{margin-right:6px}
.sm-shell span.b{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:7px;background:var(--ground);border:1px solid var(--rule-soft);font-size:12.5px}
.sm-shell span.b .i{width:14px;height:14px;color:var(--ink-3)}
.sm-cols{position:relative;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px;margin-top:22px}
.sm-col{display:flex;flex-direction:column;gap:8px}
.sm-a{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:11px;background:var(--accent-soft);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent)}
.sm-a b{font-size:16px}
.sm-a .i{color:var(--accent);width:19px;height:19px}
.sm-q{font-size:12px;color:var(--ink-3);line-height:1.4;padding:0 2px 4px}
.sm-v{position:relative;display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:9px;border:1px solid var(--rule-soft);background:var(--surface)}
.sm-v b{font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:6px}
.sm-v small{font-size:11.5px;color:var(--ink-3);line-height:1.4}
.sm-v .sh{display:inline-flex;align-items:center;gap:5px;margin-top:4px;font:500 10.5px/1.3 "IBM Plex Mono",monospace;color:var(--info)}
.sm-v .sh .i{width:12px;height:12px}
.sm-v.first{border-color:color-mix(in srgb,var(--neg) 45%,var(--rule))}
.sm-refs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:22px}
.sm-g{border-top:1px solid var(--rule);padding-top:10px}
.sm-g .lab{display:block;margin-bottom:8px}
.cv-leg{display:flex;gap:16px;align-items:center;margin-top:18px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-2)}
.cv-sec{margin-top:26px}
.cv-sec h2{font-size:17px;font-weight:600;display:flex;align-items:center;gap:10px;padding-bottom:8px;border-bottom:1px solid var(--rule)}
.cv-sec h2 small{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.cv-t{width:100%;border-collapse:collapse;font-size:12px}
.cv-t td{padding:6px 8px;border-bottom:1px solid var(--rule-soft);vertical-align:top;line-height:1.35}
.cv-t td.id{font:600 11px/1.35 "IBM Plex Mono",monospace;color:var(--ink-2);width:44px}
.cv-t td.cap{width:30%}
.cv-t td.home{width:27%;color:var(--ink-2)}
.cv-t td.fr{font:500 10.5px/1.35 "IBM Plex Mono",monospace;color:var(--accent);width:17%}
.cv-t td.tg{width:90px}
.cv-2{display:grid;grid-template-columns:1fr 1fr;gap:0 32px}
.ra{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 40px;margin-top:28px}
.ra section h2{font-size:18px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:10px}
.ra section h2 .i{color:var(--accent)}
.ra section p,.ra section li{font-size:13.5px;color:var(--ink-2);line-height:1.55}
.ra section ul{margin:6px 0 0;padding-left:18px}
.ra section li{margin-bottom:4px}
.ra section b{color:var(--ink);font-weight:600}
.nc{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:24px}
.nc .shot{position:relative;width:100%;height:320px;border-radius:12px;border:1px solid var(--rule);overflow:hidden;background:var(--ground)}
.nc .shot > div{position:absolute;left:0;top:0;width:1440px;height:900px;transform:scale(.4375);transform-origin:0 0;pointer-events:none}
.nc h2{font-size:18px;font-weight:600;margin:14px 0 6px;display:flex;align-items:center;gap:10px}
.nc ul{margin:0;padding-left:18px;font-size:13px;color:var(--ink-2);line-height:1.55}
.nc ul b{color:var(--ink)}
.mt{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:24px}
.mt .c{border:1px solid var(--rule-soft);border-radius:12px;background:var(--surface);padding:16px;display:flex;flex-direction:column;gap:10px}
.mt .c h3{font-size:14.5px;font-weight:600;display:flex;align-items:center;gap:8px}
.mt .c .demo{height:92px;border-radius:9px;background:var(--ground);border:1px solid var(--rule-soft);position:relative;display:flex;align-items:center;justify-content:center;gap:16px;overflow:hidden}
.mt .c p{font-size:12.5px;color:var(--ink-2);line-height:1.5}
.mt .c p b{color:var(--ink);font-weight:600}
.mt .c .rmq{font:500 11px/1.45 "IBM Plex Mono",monospace;color:var(--ink-3);border-top:1px dashed var(--rule);padding-top:8px}
@keyframes st-roll{0%{transform:translate(-120px,-10px) scale(.2)}70%{transform:translate(6px,0) scale(1)}100%{transform:none}}
.st-orb{width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 34% 30%,#b8f5cf 0,#5fd894 22%,#2f9e63 58%,#135c37 100%);animation:st-roll 2.2s cubic-bezier(.22,.8,.3,1) infinite alternate}
.board.rm .st-orb{animation:none}
@keyframes st-truck{from{left:6%}to{left:70%}}
.st-road{position:relative;width:80%;height:30px}
.st-road::before{content:"";position:absolute;left:0;right:0;top:20px;border-top:1.5px dashed var(--rule)}
.st-road span{position:absolute;top:0;left:6%;animation:st-truck 2.6s ease-in-out infinite alternate}
.st-road span .i{width:22px;height:22px}
"""


# --------------------------------------------------------------------------
# sitemap
# --------------------------------------------------------------------------
SITE = [
    ("overview", "Overview", "What needs my attention, and what can I do next?", [
        ("Needs attention", "Critical cause groups in full, the rest counted; Customize checks; below-line and off kinds disclosed", "", True),
        ("Task directory", "4 stable groups, 13 tasks; each opens its view with a scope", "replaces Next moves and Ask the board", False),
        ("Company strip", "Profit, revenue, cash, net worth; links to Company results", "", False)]),
    ("businesses", "Businesses", "How is the company doing, and what is happening at this business?", [
        ("Results", "Company results: chart, by weekday, finances, cash and debt, chains, costs outside sites", "", False),
        ("Products &amp; prices", "Company sales; a shop's prices against the market", "shares evidence with the Game guide", False),
        ("Standards", "Satisfaction, promotion, amenities, uniforms, shop against shop", "uniform write", False),
        ("Milestones", "Goals, types run, rivals, diplomas, career totals", "secondary", False),
        ("Business page", "Shop, office, warehouse, factory: summary, local findings, evidence, links out", "shared context for every finding", False)]),
    ("supply", "Supply", "What must I order, deliver or produce to keep things running?", [
        ("Changes", "The company-wide checklist: ticks, copy remaining, apply the supported subset", "", False),
        ("Imports", "Weekly amounts, Smart Delivery stock, cover and catch-up, caps, preview and apply", "import write", False),
        ("Deliveries", "Top-ups, wholesale, depot to depot, inputs, routes, idle stock, high targets", "", False),
        ("Production", "Lines, current and planned hours, basis, inputs, recipe naming, factory staffing", "Staffing links here", False),
        ("Goods flow", "The graph on desktop, the chain on a phone; a followed site", "", False)]),
    ("staffing", "Staffing", "Who should work where and when, and what do they need?", [
        ("Schedules", "Pick a shop; Demand or Full cover plan; evidence; prerequisites; ticks; write", "schedule write · factories → Production", False),
        ("Staff needs", "Assign before hire, unmet demands, company-wide demands, quit warnings", "", False),
        ("Payroll", "Role totals, rate against booked wages, satisfaction", "Results links here", False)]),
    ("expansion", "Expansion", "What should I open or build next?", [
        ("Demand", "By type and neighbourhood, What I sell, Not yet, offices, market changes", "a cell opens the finder", False),
        ("Find a location", "The one map-backed finder: filters, saved searches, floor plans, costs", "also from City map", False),
        ("Plan a factory", "A factory you do not run yet: machines, ingredients, costs, export surplus", "full-production model", False)]),
]


def sitemap() -> str:
    cols = ""
    for key, name, q, views in SITE:
        vs = "".join(f'<div class="sm-v{" first" if f else ""}"><b>{v}</b><small>{d}</small>{f"<span class=sh>{ic("link")}{s}</span>" if s else ""}</div>' for v, d, s, f in views)
        cols += f'<div class="sm-col"><a class="sm-a" href="{ROUTE[key]}">{ic(key)}<b>{name}</b></a><p class="sm-q">{q}</p>{vs}</div>'
    return f"""
<div class="ss">
  <h1>Where everything lives</h1>
  <p class="sub">Five destinations answer five questions. <b>City map</b> and <b>Game guide</b> stay plainly named references. The shell keeps company, source and Update in view on every page. Search accelerates all of it and is never the only way in.</p>
  <div class="sm-shell"><span class="lab">Shell, always</span>
    <span class="b">{ic("folder")}Company / save selector</span><span class="b">{ic("refresh")}Source: live, following, one file, stale, failed</span><span class="b">{ic("refresh")}Update</span>
    <span class="b">{ic("clock")}Game day and time · difficulty</span><span class="b">{ic("search")}Find a tool or answer (optional)</span><span class="b">{ic("coin")}Wordmark dot, sphere and coins</span></div>
  <div class="sm-cols">{cols}</div>
  <div class="sm-refs">
    <div class="sm-g"><span class="lab">Reference</span><div class="sm-v"><b>{ic("map")}City map</b><small>Layers, address search, building cards, a home's card; launches the same finder</small></div>
      <div class="sm-v" style="margin-top:8px"><b>{ic("guide")}Game guide</b><small>Catalogue, business guides and checklists, products, suppliers, recipes, Prices in your save; works with no save; static public pages</small></div></div>
    <div class="sm-g"><span class="lab">Utilities</span><div class="sm-v"><b>{ic("prefs")}Preferences</b><small>Theme, motion, interface language, game names and text, history, checks, game context, CLI notes</small></div>
      <div class="sm-v" style="margin-top:8px"><b>{ic("news")}What's new</b><small>Changelog, New badges point at permanent homes</small></div></div>
    <div class="sm-g"><span class="lab">Help &amp; feedback</span><div class="sm-v"><b>{ic("help")}Help, feature ballot, project links</b><small>Support, source, social, legal, approximate online count</small></div>
      <div class="sm-v" style="margin-top:8px;border-style:dashed"><b>{ic("archive")}Retired features</b><small>Contingency only: nothing is retired by this redesign</small></div></div>
    <div class="sm-g"><span class="lab">Shared workflows · one home each</span>
      <div class="sm-v"><small><strong style="color:var(--ink)">Factory hours + workers</strong> live in Supply › Production; Staffing › Schedules and Staff needs link in with the factory selected.</small></div>
      <div class="sm-v" style="margin-top:8px"><small><strong style="color:var(--ink)">Find a location</strong> lives in Expansion; City map and Demand open it with context. <strong style="color:var(--ink)">Prices</strong> live in Products &amp; prices; the Game guide shows the same numbers beside the reference.</small></div></div>
  </div>
  <p class="sub" style="margin-top:22px;font-size:12.5px">Old routes: #today → Overview · #company/results → Businesses › Results · #company/products → Products &amp; prices · #company/payroll → Staffing › Payroll · #company/milestones → Milestones · #supply/shops|warehouses|factories → Supply with that scope · #growth/market → Demand · #growth/plan → Plan a factory · #map, #wiki, #site/… unchanged.</p>
</div>"""


# --------------------------------------------------------------------------
# coverage: every capability ID and every finding kind
# --------------------------------------------------------------------------
# status: ex = existing capability with a new home or label; rg = regrouped presentation;
# nw = new interaction work. frame = the artboard that shows it.
COVER = {
    "E01": ("ex", "NoSave"), "E02": ("ex", "NoSave"), "E03": ("ex", "NoSave"), "E04": ("ex", "Main · sidebar"), "E05": ("ex", "OverviewStale"),
    "E06": ("ex", "Main · sidebar, OverviewStale"), "E07": ("ex", "NoSave"), "E08": ("ex", "Guide, NoSave"), "E09": ("ex", "Preferences"),
    "E10": ("ex", "Preferences"), "E11": ("rg", "Sitemap, NavCompare"), "E12": ("rg", "BusinessDetail · crumbs"), "E13": ("ex", "Main · sidebar"),
    "E14": ("ex", "Motion"), "E15": ("rg", "Main · task directory"), "E16": ("rg", "Main · task directory"), "E17": ("ex", "Help, sidebar"),
    "E18": ("ex", "Preferences, clock chip"),
    "C01": ("rg", "Main · company strip"), "C02": ("ex", "Results · finances"), "C03": ("ex", "Main"), "C04": ("rg", "Customize"),
    "C05": ("ex", "Results"), "C06": ("ex", "Results · By weekday"), "C07": ("ex", "Results"), "C08": ("rg", "Standards"),
    "C09": ("ex", "Results"), "C10": ("ex", "Prices"), "C11": ("rg", "Prices"), "C12": ("ex", "Payroll"), "C13": ("ex", "Milestones"),
    "C14": ("ex", "Milestones"),
    "S01": ("rg", "Changes · scope"), "S02": ("ex", "Changes, Imports"), "S03": ("rg", "Changes"), "S04": ("nw", "Changes · four marks"),
    "S05": ("ex", "Changes"), "S06": ("ex", "Imports"), "S07": ("rg", "Imports"), "S08": ("ex", "Imports · Soda Can"), "S09": ("ex", "Imports"),
    "S10": ("ex", "Deliveries"), "S11": ("ex", "Deliveries"), "S12": ("ex", "Deliveries"), "S13": ("ex", "Production"), "S14": ("ex", "Production"),
    "S15": ("rg", "Production, Imports · Plan for"), "S16": ("rg", "Production · staffing"), "S17": ("ex", "Production · Stitch Yard"),
    "S18": ("ex", "Deliveries"), "S19": ("ex", "Deliveries"), "S20": ("rg", "GoodsFlow"), "S21": ("ex", "GoodsFlow"), "S22": ("ex", "GoodsFlow · note"),
    "S23": ("ex", "Changes, Deliveries"), "S24": ("ex", "Deliveries, Imports"), "S25": ("ex", "Imports, WritePreview"), "S26": ("ex", "Write* frames"),
    "B01": ("ex", "BusinessDetail"), "B02": ("ex", "BusinessDetail"), "B03": ("ex", "BusinessDetail, Standards"), "B04": ("ex", "BusinessDetail"),
    "B05": ("ex", "BusinessDetail"), "B06": ("ex", "Schedules"), "B07": ("ex", "Schedules"), "B08": ("ex", "Schedules"), "B09": ("ex", "StaffNeeds, Schedules"),
    "B10": ("rg", "Schedules · entries typed"), "B11": ("ex", "Schedules"), "B12": ("ex", "BusinessDetail, StaffNeeds"), "B13": ("ex", "Standards"),
    "B14": ("ex", "BusinessDetail"), "B15": ("rg", "BusinessKinds"), "B16": ("rg", "BusinessKinds"), "B17": ("ex", "CityMap"),
    "G01": ("ex", "Demand"), "G02": ("ex", "Demand"), "G03": ("ex", "Demand"), "G04": ("ex", "Demand → Finder"), "G05": ("rg", "PlanFactory"),
    "G06": ("ex", "PlanFactory"),
    "M01": ("ex", "CityMap"), "M02": ("ex", "CityMap, Finder"), "M03": ("ex", "Finder"), "M04": ("ex", "Finder"), "M05": ("ex", "Finder"),
    "M06": ("ex", "Finder, FinderDetail"), "M07": ("ex", "Finder"), "M08": ("ex", "FinderDetail"),
    "W01": ("ex", "Guide"), "W02": ("ex", "Guide"), "W03": ("ex", "Guide"), "W04": ("rg", "PricesShop, Guide"), "W05": ("ex", "Sitemap · routes"),
    "P01": ("ex", "Preferences, Motion"), "P02": ("ex", "Preferences, OverviewLong"), "P03": ("ex", "Help"), "P04": ("ex", "Help"), "P05": ("ex", "Help"),
    "P06": ("ex", "Help"), "P07": ("ex", "Help"), "P08": ("ex", "Motion, every page"),
    "L01": ("ex", "Preferences · CLI"), "L02": ("ex", "Preferences · CLI"), "L03": ("ex", "Preferences · CLI"),
}
KIND_FRAMES = {
    "Not trading yet": "Main row 4 → BusinessDetail", "Vacant leases": "Results", "Losing money": "Results, BusinessDetail",
    "Nobody staffed": "Main row 2 → Production; Schedules", "Low satisfaction": "Standards", "Promotion below cap": "BusinessDetail, Standards",
    "Uniforms / locker": "Standards (write)", "No customer bathroom": "Standards", "Bathroom has no privacy": "Standards", "No customer sink": "Standards",
    "No music playing": "Standards", "Interior design too low": "Standards, BusinessDetail", "Staff demands": "Main row 3 → StaffNeeds",
    "Insurance / happy boss": "StaffNeeds · company-wide", "Demand wave ending": "Customize (off) · Demand", "Revenue trend": "Main opportunities",
    "No distribution plan": "Deliveries", "Outsells its top-up": "Deliveries", "Import paused": "Imports", "Factory inputs": "Production",
    "Unnamed factory line": "Production", "Machine with no recipe": "Production", "Import shortfall": "Main row 1 → Imports",
    "Depot top-up too low": "Deliveries", "Wholesale delivery too low": "Deliveries, OverviewShopOnly", "Weekly order too small": "Imports",
    "At capacity": "BusinessDetail, Schedules", "Overstaffed hours": "Customize (off) · Schedules", "Idle stock": "Deliveries",
    "Not routed": "Deliveries, GoodsFlow", "Top-up target too high": "Deliveries",
}
TAGS = {"ex": '<span class="nx-tag ex">existing</span>', "rg": '<span class="nx-tag rg">regrouped</span>', "nw": '<span class="nx-tag nw">new work</span>'}


def coverage() -> str:
    data = json.loads((HERE / "coverage_data.json").read_text(encoding="utf-8"))
    secs, cur = [], None
    for sec, cid, cap, home, rule in data["ids"]:
        if sec != cur:
            secs.append([sec, []])
            cur = sec
        secs[-1][1].append((cid, cap, home))
    counts = {"ex": 0, "rg": 0, "nw": 0}
    blocks = []
    for sec, rows in secs:
        tr = ""
        for cid, cap, home in rows:
            st_, fr = COVER[cid]
            counts[st_] += 1
            tr += f'<tr><td class="id">{cid}</td><td class="cap">{cap}</td><td class="home">{home}</td><td class="tg">{TAGS[st_]}</td><td class="fr">{fr}</td></tr>'
        blocks.append(f'<div class="cv-sec"><h2>{sec}<small>{len(rows)}</small></h2><table class="cv-t">{tr}</table></div>')
    krows = [f'<tr><td class="cap">{k}</td><td class="home">{d}</td><td class="fr">{KIND_FRAMES[k.strip()]}</td></tr>' for k, d in data["kinds"]]
    new = [("From Needs attention strip, return with position", "Imports, Production, OverviewReturn"), ("Next finding (optional queue navigation)", "Imports · marked proposed"),
           ("Four marks: suggested, marked done, applied, confirmed", "Changes, Imports*, Main rail"), ("Critical groups never folded; counted remainder; jump to tasks", "Main, OverviewMany"),
           ("Plan for kept per company, visible wherever it changes a figure", "Imports, Production, Changes"), ("Goods flow product filter", "GoodsFlow"),
           ("Task directory counts with honest prerequisites", "Main, OverviewShopOnly"), ("Retired features record (contingency)", "Help")]
    nw = "".join(f'<tr><td class="cap">{a}</td><td class="fr">{b}</td></tr>' for a, b in new)
    return f"""
<div class="ss">
  <h1>Feature coverage</h1>
  <p class="sub">All <b>105 capability IDs</b> and all <b>31 finding kinds</b> from the structure proposal, with where each lands and the frame that shows it. Nothing is retired. <b>{counts["ex"]}</b> keep their behaviour in a new home or label, <b>{counts["rg"]}</b> are regrouped presentation over the same calculation, <b>{counts["nw"]}</b> needs new interaction work.</p>
  <div class="cv-leg">{TAGS["ex"]}same capability, new home or label{TAGS["rg"]}regrouped presentation, same calculation{TAGS["nw"]}new interaction work</div>
  <div class="cv-2"><div>{"".join(blocks[:3])}</div>
  <div>{"".join(blocks[3:])}
  <div class="cv-sec"><h2>New interaction work<small>not in the ID list</small></h2><table class="cv-t">{nw}</table></div></div></div>
  <div class="cv-sec"><h2>All 31 finding kinds · where a finding lands<small>31</small></h2><div class="cv-2"><table class="cv-t">{"".join(krows[:16])}</table><table class="cv-t">{"".join(krows[16:])}</table></div></div>
</div>"""


# --------------------------------------------------------------------------
# rationale
# --------------------------------------------------------------------------
def rationale() -> str:
    return f"""
<div class="ss">
  <h1>Why it is built this way</h1>
  <p class="sub">The first screen says <b>"here is what needs fixing, and here is how I help"</b>. Everything else is a place you can see from there.</p>
  <div class="ra">
    <section><h2>{ic("overview")}Hierarchy</h2>
      <p>Needs attention is the largest type on the page and starts inside the first 300 px, after one quiet line of company numbers (no tiles). Critical cause groups are shown in full, each with place and item, evidence in numbers, a consequence or deadline where the save supports one, a small evidence picture (cover rail, hours) and one named action. Warnings are one line each, still with a named action. The rest is counted, never hidden: "Show all 17", below-the-line, switched-off and waiting-for-data lines stay under the list.</p>
      <p style="margin-top:8px">The task directory follows with four groups and thirteen tasks whose labels and order never change; counts change. A jump link and the sidebar keep it one click away when the list grows.</p></section>
    <section><h2>{ic("list")}Navigation: sidebar, recommended</h2>
      <p><b>Sidebar:</b> 240 px buys room for five labelled destinations, their local views (Imports and Production are visible words, not tabs you must first open), counts, the company and source block with Update, and room for longer translations. It shows where you are while a long findings list scrolls.</p>
      <p style="margin-top:8px"><b>Masthead evolved:</b> full width for tables and the map, closest to today, but local views need a second row, source moves to a strip, and German labels crowd the row by 1300 px. Chosen for tablets (768) as a labelled tab row; phones get a labelled bottom bar with all five destinations.</p></section>
    <section><h2>{ic("link")}Shared workflows</h2>
      <ul><li><b>Problem, task, place</b> are three doors to one workflow. A finding opens its exact view with the business and item selected and a "From Needs attention" strip that returns to the same row.</li>
      <li><b>Factory hours and the workers they need</b> are one plan in Supply › Production. Staffing lists factories and links there; there is no second planner and no per-person factory optimiser.</li>
      <li><b>Plan for</b> (Full production or Shop demand) is named wherever it changes a figure: imports, inputs, hours, the copied checklist.</li>
      <li><b>One finder</b> from Expansion, City map and a Demand cell. <b>Prices</b> in Products &amp; prices, echoed by the Game guide.</li></ul></section>
    <section><h2>{ic("motion")}Motion and personality</h2>
      <p>Kept: the dot that pays coins, the sphere rolling out of it onto the page head's rule (three on repeated clicks, the fourth gulps one), the checklist truck driving the dashed road as ticks land, the game-link wire, icons that tilt on hover. Added only where motion explains: the arrival strip slides from above; hovering a linked finding lights its partner. Every motion has a still form (Motion sheet); no celebration for an unverified tick.</p></section>
    <section><h2>{ic("warn")}Deliberate compromises</h2>
      <ul><li>Critical rows are tall; on a very bad day four fill the first screen and warnings start below the fold. Urgency wins.</li>
      <li>The right rail (what was checked, your changes) moves under the list below 1200 px.</li>
      <li>Prices stay comparisons; the page says so instead of recommending a price.</li>
      <li>Goods flow's product filter is new work; the graph itself is unchanged.</li>
      <li>Secondary text tokens are adjusted for contrast: dark ink-3 #808a84, light ink-3 #636c71, light warn #b34d00.</li></ul></section>
    <section><h2>{ic("gear")}New data and backend needs</h2>
      <ul><li><b>None for the navigation.</b> Existing hashes map to new routes (Sitemap).</li>
      <li>Finding rows need a <b>deadline field</b> where the model has one (run-out day and hour exist in supply rows; expose on the finding), and a named action id per kind.</li>
      <li>A local <b>resolution record</b> per finding: marked-done time, applied-write stamp; "confirmed" is derived by comparing the next payload.</li>
      <li><b>Plan for per company</b>: SIZING_KEY becomes keyed by character.</li>
      <li>Goods flow product filter needs product slugs on graph links (issue #148, decision 7).</li>
      <li>Retired features: a lifecycle state in server/features.json only if one is ever retired.</li></ul></section>
  </div>
  <div class="ra" style="margin-top:26px"><section><h2>{ic("chev")}Suggested port order</h2>
    <p>1 Shell and routes (sidebar, tablet tabs, phone bar, hash aliases). 2 Overview: Needs attention rows and task directory, replacing Next moves and Ask the board. 3 Supply local views over today's tabs, with scope and Plan for. 4 Arrival strip and return. 5 Four marks. 6 Staffing and Businesses landings. 7 Expansion. Each step ships alone.</p></section>
    <section><h2>{ic("eye")}What to test first</h2><p>Unaided first click from the Overview for: import amounts, partial-day factory hours, a shop schedule, prices at a named shop, a premises with its floor plan; shop-only and factory companies; newcomers and returning players.</p></section></div>
</div>"""


# --------------------------------------------------------------------------
# navigation comparison
# --------------------------------------------------------------------------
def nav_compare() -> str:
    side = ov.overview().replace('<div class="orb" aria-hidden="true"><u></u></div>', '<div class="orb" aria-hidden="true" style="right:300px"><u></u></div>')
    mast = ov.overview_masthead().replace('<div class="orb" aria-hidden="true"><u></u></div>', '<div class="orb" aria-hidden="true" style="right:330px;bottom:0"><u></u></div>')
    return f"""
<div class="ss">
  <h1>Navigation: two treatments, one structure</h1>
  <p class="sub">Both keep the five destinations, the two references and Needs attention first. The sidebar is recommended for desktop; the masthead carries on as the tablet layout.</p>
  <div class="nc">
    <div><div class="shot"><div class="board">{side}</div></div>
      <h2>{chip("ok", "recommended")}Persistent sidebar</h2>
      <ul><li><b>Discovery:</b> local views are words on screen (Imports, Production, Schedules) with counts.</li>
      <li><b>Context:</b> company, source, freshness and Update sit together, top left, on every page.</li>
      <li><b>Space:</b> costs 240 px; tables still get 1,120 px at 1440. Narrows to 208 px at 1024.</li>
      <li><b>Language:</b> "Braucht Aufmerksamkeit" and "Einstellungen" fit without shrinking (OverviewLong).</li>
      <li><b>Personality:</b> the dot stays on the wordmark; the sphere rolls onto the page head's rule.</li></ul></div>
    <div><div class="shot"><div class="board">{mast}</div></div>
      <h2>{chip("dim", "alternative")}Evolved masthead</h2>
      <ul><li><b>Discovery:</b> five labels plus City map and Game guide in one row; local views need a second row per area.</li>
      <li><b>Context:</b> company and source move to a strip under the masthead: one more band before Needs attention.</li>
      <li><b>Space:</b> full width for the map and wide tables; the most familiar to current players.</li>
      <li><b>Language:</b> German labels run out of row at about 1,300 px and must collapse to icons.</li>
      <li><b>Personality:</b> the sphere keeps today's shelf exactly.</li></ul></div>
  </div>
</div>"""


# --------------------------------------------------------------------------
# motion, focus, touch
# --------------------------------------------------------------------------
def motion() -> str:
    cards = [
        ("The sphere", f'<span class="st-orb"></span>', "Rolls out of the wordmark's dot onto the page head's rule when the board opens; squishes and rings when clicked; a click on the wordmark adds one, up to three, and the fourth gulps one. Never covers the clock or a finding.",
         "Reduced: sits on the rule from the start; a click squishes without the ring."),
        ("Coins from the dot", f'<span class="dot" style="width:12px;height:12px;border-radius:50%;background:var(--accent)"></span><span class="mono dim" style="font-size:12px">14 coins fall</span>', "Clicking the dot spins it like a coin and pays out a small shower.",
         "Reduced: one spin, no shower. The dot is a button with a name, reachable by Tab."),
        ("The checklist truck", f'<div class="st-road"><span>{ic("truck")}</span></div>', "The truck drives the dashed road to the share of changes you have ticked; the road behind it turns green.",
         "Reduced: the truck and the green line jump to the new position. The count '3 of 9 done' says the same in words."),
        ("The game-link wire", f'<span class="gw-w ask"><i class="a"></i><i class="ln"></i><i class="p"></i><i class="p"></i><i class="p"></i><span class="g">{ic("game")}</span></span><span class="gw-w ok"><i class="a"></i><i class="ln"></i><span class="g">{ic("game")}</span></span><span class="gw-w no"><i class="a"></i><i class="ln"></i><span class="g">{ic("game")}</span></span>',
         "Blue packets ask, solid green agrees or is done, broken red refuses, amber waits or the game moved on, grey is busy.", "Reduced: packets stand still; every state also has its sentence ('Waiting for you in the game', 'The game refused')."),
        ("Arrival from a finding", f'<div class="nx-from" style="margin:0;width:88%"><span class="back">{ic("back")}Back</span><span class="what">From <b>Water at Bridge Hub</b></span></div>', "The arrival strip slides in once, so you see why this page opened; the matching row is outlined.",
         "Reduced: the strip is simply there. Focus moves to the selected row's heading for keyboard and screen reader users."),
        ("Linked findings", f'<div style="width:88%;display:flex;flex-direction:column;gap:6px"><div style="height:18px;border-radius:4px;background:var(--surface);box-shadow:inset 3px 0 0 var(--info)"></div><div style="height:18px;border-radius:4px;background:var(--info-soft);box-shadow:inset 3px 0 0 var(--info)"></div></div>', "Hovering or focusing an upstream import shortfall lights the factory input it starves, without merging them.",
         "No motion to reduce; on touch the 'Linked' button scrolls to and outlines the partner."),
    ]
    cc = "".join(f'<div class="c"><h3>{t}</h3><div class="demo">{d}</div><p>{p}</p><p class="rmq">{r}</p></div>' for t, d, p, r in cards)
    focus = f"""
<div class="mt" style="grid-template-columns:repeat(3,minmax(0,1fr))">
  <div class="c"><h3>{ic("keyboard")}Keyboard: a finding</h3><div class="demo" style="justify-content:flex-start;padding:0 16px">{btn("Review import amount", "go", "#", icon_end="go").replace('class="nx-btn go"', 'class="nx-btn go" style="outline:2px solid var(--accent);outline-offset:3px"')}</div>
    <p>Tab order: severity filters, Customize checks, then each finding's action, then its secondary links. Enter opens the view with the row selected.</p></div>
  <div class="c"><h3>{ic("keyboard")}Keyboard: a tick and a switch</h3><div class="demo"><button class="nx-tick" type="button" style="outline:2px solid var(--accent);outline-offset:3px">{ic("tick")}</button><div class="seg"><button class="on" type="button" style="outline:2px solid var(--accent);outline-offset:2px">Full production</button><button type="button">Shop demand</button></div></div>
    <p>Ticks are buttons with aria-pressed; Plan for is a pair of pressed buttons. Space toggles; the change is announced ("Suggested amount now 11,040").</p></div>
  <div class="c"><h3>{ic("hand")}Touch: nothing lives only on hover</h3><div class="demo"><span class="why" style="width:28px;height:28px;font-size:14px">?</span><span class="mono dim" style="font-size:12px">44 px targets on phones</span></div>
    <p>Evidence and consequence are always printed, never hover-revealed. "?" marks open on tap and focus. Hover-lit linking has a Linked button.</p></div>
</div>"""
    return f"""
<div class="ss">
  <h1>Motion, focus and touch</h1>
  <p class="sub">Each motion explains a relation or a change of state, or is a brand touch that never blocks work. Each has a still equivalent; turn on the <b>reduced</b> tweak on any artboard to see them.</p>
  <div class="mt">{cc}</div>
  {focus}
</div>"""


NOTES = {
    "n-struct": ("structure", 0, 0, "Start here: the sitemap, then the coverage sheet (every ID and finding kind with its frame and whether it is existing, regrouped or new work), then the rationale."),
    "n-nav": ("structure", 1, 0, "Sidebar recommended at 1024 and wider; the evolved masthead is the alternative and becomes the tablet layout. Phones get a labelled bottom bar."),
}
