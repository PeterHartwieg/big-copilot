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
.jy{margin-top:26px}
.jy h2{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:600;margin-bottom:12px}
.jy h2 .n{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--ink);color:var(--ground);font:600 12px/1 "IBM Plex Mono",monospace}
.jy-row{display:flex;align-items:flex-start;gap:14px}
.jy-f{margin:0;display:flex;flex-direction:column;gap:8px;width:400px}
.jy-shot{position:relative;width:400px;height:250px;border-radius:10px;border:1px solid var(--rule);overflow:hidden;background:var(--ground)}
.jy-shot > .board{position:absolute;left:0;top:0;width:1440px;height:900px;transform:scale(.2778);transform-origin:0 0;pointer-events:none}
.jy-f figcaption{font-size:13px;color:var(--ink-2);line-height:1.4}
.jy-f figcaption b{display:block;font:600 11px/1.4 "IBM Plex Mono",monospace;color:var(--accent);letter-spacing:.04em}
.jy-a{align-self:center;margin-top:-40px;color:var(--ink-3)}
.jy-a .i{width:22px;height:22px}
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
    "E01": ("ex", "NoSave"), "E02": ("ex", "NoSave"), "E03": ("ex", "NoSave"), "E04": ("ex", "Main · masthead"), "E05": ("ex", "OverviewStale"),
    "E06": ("ex", "Main · masthead, OverviewStale"), "E07": ("ex", "NoSave"), "E08": ("ex", "Guide, NoSave"), "E09": ("ex", "Preferences"),
    "E10": ("ex", "Preferences"), "E11": ("rg", "Sitemap, NavCompare"), "E12": ("rg", "BusinessDetail · crumbs"), "E13": ("ex", "Main · masthead ⋯"),
    "E14": ("ex", "Motion"), "E15": ("rg", "Main · task directory"), "E16": ("rg", "Main · task directory"), "E17": ("ex", "Help, masthead ⋯"),
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
    "P01": ("ex", "Preferences, Motion"), "P02": ("ex", "Preferences, OverviewNames"), "P03": ("ex", "Help"), "P04": ("ex", "Help"), "P05": ("ex", "Help"),
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
    new = [("Details on each finding, collapsed by default", "Main, OverviewDetails"), ("From Needs attention strip, return with position", "Imports, Production, OverviewReturn"),
           ("Four marks: suggested, marked done, applied, confirmed", "Changes, Imports*, Main rail"), ("Critical groups never folded; counted remainder; All tools from the heading and a sticky bar", "Main, OverviewLong"),
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
  <p class="sub">The first screen says <b>"here is what needs fixing, and here is how I help"</b>. Everything else is a labelled place you can reach from there.</p>
  <div class="ra">
    <section><h2>{ic("overview")}Hierarchy</h2>
      <p>Needs attention starts under one line of company numbers. Every critical finding is a summary: where and what, what matters now, one labelled picture, a <b>Details</b> control and one named action. Details are closed by default, so the whole queue is visible and the player chooses what to open. Warnings are one line each. The rest is counted under the list, never hidden.</p>
      <p style="margin-top:8px">All tools sits beside the heading and in a sticky bar when the queue is long: four panels, thirteen tasks, labels that never move.</p></section>
    <section><h2>{ic("list")}Navigation: the masthead</h2>
      <p>The masthead keeps the current product's open layout and full width for tables and the map. Five labelled destinations, City map and Game guide, the source and clock; a persistent local row inside each area makes Imports, Production, Schedules and Prices visible words. At 768 it becomes two rows; phones get a labelled bottom bar. The slim sidebar with the same content is kept on NavCompare as the alternative.</p></section>
    <section><h2>{ic("link")}Fixes are named for the problem they solve</h2>
      <ul><li><b>Prevent the recurring shortage</b> (the weekly order) and <b>cover the gap until Monday</b> (a one-time purchase) are two fixes side by side, with their own actions.</li>
      <li>Only the weekly amount can be written by the game link; the gap is bought by hand.</li>
      <li><b>Plan for</b> is named beside every figure it changes; switching it redraws the amount and its scale.</li>
      <li>Factory hours and the workers they need are one plan in Supply › Production; Staffing links to it.</li></ul></section>
    <section><h2>{ic("tick")}Three kinds of done</h2>
      <p><b>Marked by you</b>: an outlined neutral tick, a note in this browser. <b>Applied · awaiting refresh</b>: blue, the game took the write. <b>Confirmed</b>: solid green, only when a newer read shows the problem gone. Rows keep their place when their mark changes.</p></section>
    <section><h2>{ic("motion")}Motion and personality</h2>
      <p>The dot pays coins, the sphere rolls from the dot onto the masthead rule, the checklist truck drives as marks land, the wire shows each request and answer, and the tool panels carry small working pictures. Details slide open; the Plan for switch redraws in place. Each has a still form (Motion).</p></section>
    <section><h2>{ic("gear")}New data and backend needs</h2>
      <ul><li>A deadline per finding where the model has one, and an action id per finding kind.</li>
      <li>A local resolution record per finding; confirmation compares the next payload.</li>
      <li>Plan for kept per company (SIZING_KEY by character).</li>
      <li>The catch-up amount on the finding (the depot page computes it today).</li>
      <li>Product slugs on goods-flow links for the followed route (#148, decision 7).</li></ul></section>
  </div>
  <div class="ra" style="margin-top:26px"><section><h2>{ic("warn")}Deliberate compromises</h2>
    <p>Critical summaries are about 84 px; four fill most of the first screen on a bad day. The satisfaction parts and machine rows carry short labels rather than icons alone. Prices stay comparisons. Secondary text tokens are adjusted for contrast (dark #808a84, light #636c71, light warn #b34d00).</p></section>
    <section><h2>{ic("eye")}What to test first</h2><p>Unaided: the most urgent issue and its next action; import amounts, factory hours and shop prices without Search; telling a manual note from a verified fix. Then the four journeys at 1024, on a phone and with larger text.</p></section></div>
</div>"""


# --------------------------------------------------------------------------
# navigation comparison
# --------------------------------------------------------------------------
def nav_compare() -> str:
    import screens
    mast = screens.overview().replace('<div class="orb" aria-hidden="true"><u></u></div>', '<div class="orb" aria-hidden="true" style="right:300px"><u></u></div>')
    side = screens.overview_sidebar().replace('<div class="orb" aria-hidden="true"><u></u></div>', '<div class="orb" aria-hidden="true" style="right:300px"><u></u></div>')
    return f"""
<div class="ss">
  <h1>Navigation: two treatments, one structure</h1>
  <p class="sub">Same content and type scale in both. The masthead is recommended; the slim sidebar stays as the alternative.</p>
  <div class="nc">
    <div><div class="shot"><div class="board">{mast}</div></div>
      <h2>{chip("ok", "recommended")}Masthead with a local row</h2>
      <ul><li><b>Space:</b> the full width for queues, tables and the map; Schedules and Find a location keep two columns, not three.</li>
      <li><b>Discovery:</b> five labelled places and a persistent local row (Changes · Imports · Deliveries · Production · Goods flow).</li>
      <li><b>Continuity:</b> closest to today's board, and the sphere keeps its shelf.</li>
      <li><b>Cost:</b> German labels need the 1024 compact row; references drop their icons there.</li></ul></div>
    <div><div class="shot"><div class="board">{side}</div></div>
      <h2>{chip("dim", "alternative")}Slim sidebar</h2>
      <ul><li><b>Space:</b> 196 px less for the work; the queue's picture column narrows to 240 px.</li>
      <li><b>Discovery:</b> the five places are always in one column; local views still need a row in the page.</li>
      <li><b>Continuity:</b> reads more like an admin console.</li>
      <li><b>Benefit:</b> room for long translated labels without a compact mode.</li></ul></div>
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
        ("Details on a finding", f'<span class="r3-det" aria-expanded="true" style="pointer-events:none">Hide{ic("chevd")}</span><div style="width:48%;display:flex;flex-direction:column;gap:5px"><i style="height:8px;border-radius:3px;background:var(--rule)"></i><i style="height:8px;width:70%;border-radius:3px;background:var(--rule)"></i></div>', "The panel slides open under its summary and the chevron turns; the summary joins the panel's surface. The action button stays separate.",
         "Reduced: opens at once. The button is a real disclosure (aria-expanded, aria-controls); Enter and Space open it."),
        ("Changing Plan for", f'<div class="seg"><button class="on" type="button">Full production</button><button type="button">Shop demand</button></div><span class="mono" style="font-size:18px">18,740</span>', "The amount, its label and the scale's planned marker move to the new basis; the order now and today's draw stay put, so the change reads as a comparison.",
         "Reduced: the values swap without movement; the new basis is announced (Planned for shop demand, 11,040 a week)."),
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


def journeys() -> str:
    import screens, boards_supply as sp, boards_more as mo
    def thumb(markup, frame, cap):
        return (f'<figure class="jy-f"><div class="jy-shot"><div class="board">{markup}</div></div>'
                f'<figcaption><b>{frame}</b>{cap}</figcaption></figure>')
    arrow = f'<span class="jy-a">{ic("go")}</span>'
    rows = [
        ("Open a finding", [(screens.overview(), "Main", "All critical summaries, details closed"),
                            (screens.overview(True), "OverviewDetails", "Details on Water: amounts by basis, who goes without, the two fixes"),
                            (screens.imports(), "Imports", "Review import opens the setting, the finding named in the arrival strip")]),
        ("Follow its supply connection", [(screens.overview(True), "OverviewDetails", "Follow the supply route"),
                                          (mo.goods_flow(), "GoodsFlow", "1 Pier → Bridge Hub → Canal Brewery lit; the short input in amber"),
                                          (sp.production(), "Production", "The Water top-up on Canal Brewery, its separate fix")]),
        ("Change the planning basis", [(screens.imports(), "Imports", "Planned for full production: 18,740 a week"),
                                       (screens.imports(full=False), "ImportsDemand", "Shop demand: 11,040; today's draw is higher, and says why"),
                                       (sp.production(), "Production", "The same switch redraws hours, inputs, people and wages")]),
        ("Return to the queue", [(screens.imports(), "Imports", "Preview in the game"),
                                 (sp.write_frame("done"), "WriteDone", "Applied; confirmed only after a newer read"),
                                 (screens.overview_return(), "OverviewReturn", "Same place, same order, the row marked Applied")]),
    ]
    body = "".join(f'<section class="jy"><h2><span class="n">{k + 1}</span>{t}</h2><div class="jy-row">{arrow.join(thumb(*x) for x in xs)}</div></section>' for k, (t, xs) in enumerate(rows))
    return f"""
<div class="ss">
  <h1>Four journeys</h1>
  <p class="sub">Each step is an artboard; play them from <b>Main</b>. The same journeys are drawn at 1024 (Overview1024, Imports1024), on a phone (PhoneOverviewDetails, PhoneImports, PhoneImportsDemand, PhoneWrite) and with text at 130% (PhoneLargeText, PhoneImportsLargeText).</p>
  {body}
</div>"""


NOTES = {
    "n-struct": ("structure", 0, 0, "Start here: the sitemap, then the coverage sheet (every ID and finding kind with its frame and whether it is existing, regrouped or new work), then the rationale."),
    "n-nav": ("structure", 1, 0, "Sidebar recommended at 1024 and wider; the evolved masthead is the alternative and becomes the tablet layout. Phones get a labelled bottom bar."),
}
