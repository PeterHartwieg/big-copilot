"""The current design (round 3): the masthead treatment for every screen.

Round 2 set the visual direction (boards_r2.py keeps its stylesheet and the before/after
sheets). This module is the canonical product: the shell, the Overview in all its states
and widths, Imports, Changes, the business page, the phone journey, and `app2()`, the shell
the other screen builders (boards_supply.py, boards_more.py) are rendered with.

Review points of 26 Sep 2026 carried here: an explicit Details control on each finding
(collapsed by default), the recurring fix and the gap cover named as two different fixes,
marked by you / applied / confirmed drawn as three different ticks, full labels where
abbreviations needed interpretation, and labelled small diagrams.
"""
from __future__ import annotations

import random

import kit
from kit import ROUTE, btn, chip, cover, esc, gwbtn, hood, hours, ic, mw, state
import boards_r2 as r2
import boards_overview as ov

CSS = r2.CSS + """
/* round 3 --------------------------------------------------------------------- */
.r2-src{font:500 11.5px/1 Archivo,sans-serif;letter-spacing:0;color:var(--ink-2);text-transform:none}
.r2-src b{background:var(--accent)}
.r2-src em{font-style:normal;color:var(--accent);font-weight:600}
.r2-src.stale b{background:var(--warn)}.r2-src.stale em{color:var(--warn)}
.r2-src.fail b{background:var(--neg)}.r2-src.fail em{color:var(--neg)}
.r2-mast .clock small{gap:10px}
.r3-title{display:flex;align-items:baseline;gap:14px;margin-top:22px}
.r3-title h1{font-size:26px;font-weight:700;letter-spacing:-.025em}
.r3-title .sub{font-size:13.5px;color:var(--ink-2)}

/* a finding summary with its own Details control ------------------------------ */
.r3-f{display:grid;grid-template-columns:16px minmax(0,1fr) 300px 104px 196px;gap:0 18px;align-items:center;min-height:84px;padding:12px 6px 12px 0;border-bottom:1px solid var(--rule-soft);transition:background .15s}
.r3-f:hover{background:linear-gradient(90deg,transparent,var(--surface) 10%)}
.r3-f .mark{width:10px;height:10px;border-radius:50%;background:var(--neg);box-shadow:0 0 0 4px var(--neg-soft);justify-self:center;transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
.r3-f:hover .mark{transform:scale(1.35)}
.r3-f .t{display:flex;flex-direction:column;gap:5px;min-width:0}
.r3-f .t h3{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:1.25}
.r3-f .t h3 .hood{transform:translateY(-2px)}
.r3-f .t h3 .k{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}
.r3-f .now{font-size:14px;color:var(--ink-2)}
.r3-f .now b{font-weight:600;color:var(--neg)}
.r3-f .vz{display:flex;flex-direction:column;gap:3px}
.r3-det{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--rule);background:transparent;color:var(--ink-2);font:500 13px/1 Archivo,sans-serif;cursor:pointer;white-space:nowrap}
.r3-det:hover{color:var(--ink);border-color:var(--ink-3)}
.r3-det .i{width:14px;height:14px;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.r3-det[aria-expanded="true"]{color:var(--ink);background:var(--surface);border-color:var(--ink-3)}
.r3-det[aria-expanded="true"] .i{transform:rotate(180deg)}
.r3-f .ac{display:flex;justify-content:flex-end}
.r3-f .ac .nx-btn{min-width:180px;justify-content:space-between}
.r3-f:has(+ .r3-x:not([hidden])){background:color-mix(in srgb,var(--surface) 75%,transparent);border-bottom-color:transparent;border-radius:12px 12px 0 0}
.r3-x{display:grid;grid-template-columns:1fr .9fr 1.5fr;margin:0 0 10px 34px;border:1px solid var(--rule-soft);border-top:0;border-radius:0 0 12px 12px;background:color-mix(in srgb,var(--surface) 75%,transparent)}
.r3-x > div{padding:14px 18px 16px;display:flex;flex-direction:column;gap:9px}
.r3-x > div + div{border-left:1px solid var(--rule-soft)}
.r3-x p{font-size:13px;color:var(--ink-2);line-height:1.45}
.r3-x p b{color:var(--ink);font-weight:600}
.r3-fix{display:grid;grid-template-columns:28px minmax(0,1fr);gap:4px 10px;padding:10px 12px;border-radius:10px;background:var(--ground);border:1px solid var(--rule-soft)}
.r3-fix .n{grid-row:1/3;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font:600 11.5px/1 "IBM Plex Mono",monospace;background:var(--raised);color:var(--ink)}
.r3-fix b{font-size:13.5px;font-weight:600}
.r3-fix span{font-size:12.5px;color:var(--ink-2);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.r3-fix span .v{font:600 13px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.r3-links{display:flex;flex-direction:column;gap:6px}
.r3-links a{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:var(--info)}
.r3-links a .i{width:15px;height:15px}

/* the checklist count keeps its size over the kit's own rule */
.board .r2-ck.nx-ck .cnt b{font:600 28px/1 "IBM Plex Mono",monospace}
.board .r2-ck.nx-ck .cnt b small{font-size:15px;color:var(--ink-3);font-weight:500}
.board .r2-ck.nx-ck .cnt{font:inherit}
.board .r2-ck.nx-ck .cnt b span{font:inherit;color:inherit}

/* diagram labels ---------------------------------------------------------------- */
.r3-mach{display:grid;grid-template-columns:44px minmax(0,1fr);gap:3px 8px;align-items:center}
.r3-mach span{font:500 10px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.r3-mach span.hit{color:var(--neg);font-weight:600}
.r3-mach .ax{grid-column:2;display:flex;justify-content:space-between;font:500 9px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.r3-lamp{display:flex;align-items:center;gap:6px;height:30px;padding:0 10px 0 7px;border-radius:15px;font-size:12px;font-weight:600}
.r3-lamp .i{width:15px;height:15px}
.r3-lamp.miss{border:1.5px solid color-mix(in srgb,var(--neg) 55%,transparent);background:var(--neg-soft);color:var(--neg)}
.r3-lamp.ok{border:1.5px solid color-mix(in srgb,var(--accent) 50%,transparent);background:var(--accent-soft);color:var(--accent)}
.r3-eq{display:flex;align-items:flex-end;gap:10px;position:relative;padding-top:6px}
.r3-eq .c{display:flex;flex-direction:column;align-items:center;gap:6px}
.r3-eq .c .t{position:relative;width:16px;height:64px;border-radius:4px;background:var(--raised);overflow:hidden}
.r3-eq .c .t b{position:absolute;left:0;right:0;bottom:0;border-radius:4px;background:var(--accent)}
.r3-eq .c.low .t b{background:var(--warn)}
.r3-eq .c small{font-size:10.5px;color:var(--ink-2);text-align:center;line-height:1.15;width:62px}
.r3-eq .c small em{display:block;font:500 11px/1.2 "IBM Plex Mono",monospace;font-style:normal;color:var(--ink)}
.r3-eq .c.low small em{color:var(--warn)}
.r3-eq .ln{position:absolute;left:-4px;right:-4px;top:19px;border-top:1px dashed var(--ink-3)}
.r3-eq .ln::after{content:"80";position:absolute;right:-16px;top:-7px;font:500 9.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}

/* ticks: marked by you (outlined, neutral), applied (blue), confirmed (solid green) */
.board .nx-tick.on,.board .done > .nx-tick{background:transparent;border-color:var(--ink-2);color:var(--ink-2)}
.board .nx-tick.link{border-color:var(--info);background:var(--info-soft);color:var(--info)}
.board .nx-tick.conf{border-color:var(--accent);background:var(--accent);color:var(--on-accent)}
.board .nx-state.conf{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}

/* the two fixes on Imports ------------------------------------------------------ */
.r3-two{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:0}
.r3-two > section{display:flex;flex-direction:column;padding:18px 22px 0}
.r3-two > section + section{border-left:1px solid var(--rule-soft)}
.r3-step{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600}
.r3-step .n{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font:600 12px/1 "IBM Plex Mono",monospace;background:var(--ink);color:var(--ground)}
.r3-step small{font-size:12.5px;font-weight:400;color:var(--ink-3)}
.r3-acts{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;margin:auto -22px 0;padding:12px 22px;border-top:1px solid var(--rule-soft);background:color-mix(in srgb,var(--ground) 45%,transparent)}
.r3-acts .gw-btn,.r3-acts .nx-btn{height:38px}
.r3-acts .gap{flex:1}
.r3-acts .note{font-size:12.5px;color:var(--ink-3)}
.r3-cover{font:600 30px/1 "IBM Plex Mono",monospace;letter-spacing:-.02em}
.r3-cover small{font:500 13px/1 Archivo,sans-serif;color:var(--ink-2);letter-spacing:0;margin-left:6px}
.r3-railgap{position:relative;margin-top:30px}
.r3-railgap .nx-cov .d{height:26px;border-radius:4px}
.r3-railgap .nx-cov .d .trk{top:-21px}
.r3-railgap .nx-cov .d .trk .i{width:17px;height:17px}
.r3-railgap .nx-cov .ax{font-size:10.5px;margin-top:4px}
.r3-gaplab{position:absolute;top:-24px;left:calc(3.5 / 7 * 100%);width:calc(2 / 7 * 100%);display:flex;justify-content:center;font:600 10.5px/1 "IBM Plex Mono",monospace;color:var(--neg)}
.r3-gaplab::after{content:"";position:absolute;left:0;right:0;top:14px;border-top:1.5px solid var(--neg);border-left:1.5px solid var(--neg);border-right:1.5px solid var(--neg);height:5px}
.r2-scale .m.cap span{transform:translateX(-92%);text-align:right}
.r3-open{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:14px 22px 18px;border-top:1px solid var(--rule-soft)}

/* 1024 and 768 ------------------------------------------------------------------- */
.bp1024 .r2-mast{gap:12px;padding:0 24px}
.bp1024 .r2-mast .wordmark{font-size:19px;max-width:150px}
.bp1024 .r2-nav a{padding:0 7px;font-size:13px;gap:6px}
.bp1024 .r2-nav a .i{display:none}
.bp1024 .r2-refs button{display:none}
.bp1024 .r2-refs a{font-size:12.5px;padding:0 6px}
.bp1024 .r2-refs a .i{width:14px;height:14px}
.bp1024 .r2-mast .clock b{font-size:14px}
.bp1024 .r2-main,.bp1024 .r2-local{padding-left:24px;padding-right:24px}
.bp1024 .r2-kpis{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:12px}
.bp1024 .r2-kpi:nth-child(2){border-right:0;margin-right:0}
.bp1024 .r3-f{grid-template-columns:16px minmax(0,1fr) 220px;grid-template-rows:auto auto;row-gap:10px}
.bp1024 .r3-f .vz{grid-column:3;grid-row:1}
.bp1024 .r3-f .r3-det{grid-column:2;grid-row:2;justify-self:start}
.bp1024 .r3-f .ac{grid-column:3;grid-row:2}
.bp1024 .r3-x{grid-template-columns:1fr 1fr}
.bp1024 .r3-x > div:last-child{grid-column:1/3;border-left:0;border-top:1px solid var(--rule-soft)}
.bp1024 .r2-w{grid-template-columns:16px 170px minmax(0,1fr) 180px}
.bp1024 .r2-w .amt{display:none}
.bp1024 .r2-tp{grid-template-columns:repeat(2,minmax(0,1fr))}
.bp1024 .r2-head .aside{margin-left:0}
.bp1024 .r3-two{grid-template-columns:1fr}
.bp1024 .r3-two > section + section{border-left:0;border-top:1px solid var(--rule-soft)}
.bp1024 .r2-scope .nx-basis{grid-template-columns:auto auto}
.bp1024 .r2-scope .nx-basis .txt{display:none}
.r3-tm{position:relative;display:flex;align-items:center;gap:14px;height:60px;padding:0 24px}
.r3-tm .wordmark{font-size:21px;max-width:220px}
.r3-tm .clock{margin-left:auto}
.r3-tm .clock b{font-size:14px}
.r3-tnav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr)) auto;padding:0 24px;border-bottom:1px solid var(--rule)}
.r3-tnav a{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 2px 10px;color:var(--ink-2);font-size:12.5px;font-weight:500}
.r3-tnav a .i{width:19px;height:19px}
.r3-tnav a.on{color:var(--ink)}
.r3-tnav a.on::after{content:"";position:absolute;left:20%;right:20%;bottom:-1px;height:2px;background:var(--accent);border-radius:2px}
.r3-tnav a .n{position:absolute;top:4px;left:calc(50% + 8px);font:600 9.5px/1 "IBM Plex Mono",monospace;padding:2px 5px;border-radius:8px;background:var(--neg);color:#fff}
.r3-tnav .more{flex-direction:row;gap:6px;padding:0 4px 0 14px;margin:10px 0;border-left:1px solid var(--rule-soft);color:var(--ink-3)}
.bp768 .r2-main,.bp768 .r2-local{padding-left:24px;padding-right:24px}
.bp768 .r2-local{overflow:hidden}
.bp768 .r2-kpis{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:12px}
.bp768 .r2-kpi:nth-child(2){border-right:0;margin-right:0}
.bp768 .r2-kpi svg{width:80px}
.bp768 .r2-head .aside{margin-left:0}
.bp768 .r3-f{grid-template-columns:16px minmax(0,1fr);row-gap:10px}
.bp768 .r3-f .vz{grid-column:2}
.bp768 .r3-f .r3-det{grid-column:2;justify-self:start}
.bp768 .r3-f .ac{grid-column:2;justify-content:flex-start;margin-top:-44px;margin-left:120px}
.bp768 .r3-x{grid-template-columns:1fr;margin-left:0}
.bp768 .r3-x > div + div{border-left:0;border-top:1px solid var(--rule-soft)}
.bp768 .r2-w{grid-template-columns:16px minmax(0,1fr) 170px;grid-template-rows:auto auto}
.bp768 .r2-w .site{grid-column:2}
.bp768 .r2-w b{grid-column:2}
.bp768 .r2-w .amt{display:none}
.bp768 .r2-w .to{grid-column:3;grid-row:1/3}
.bp768 .r2-tp{grid-template-columns:repeat(2,minmax(0,1fr))}
.bp768 .r2-more{flex-wrap:wrap}

/* phone ------------------------------------------------------------------------- */
.p2-top .src{font:500 11px/1.2 Archivo,sans-serif;color:var(--ink-2);text-align:right}
.p2-top .src em{font-style:normal;color:var(--accent);font-weight:600}
.p3-sev{display:flex;flex-wrap:wrap;gap:4px 2px;margin-bottom:6px}
.p3-sev .sev{min-height:36px;padding:0 8px}
.p3-row{display:flex;gap:8px;padding-left:17px;margin-top:4px}
.p3-row .go{flex:1;margin-left:0}
.p3-row .r3-det{height:44px}
.p2-f .go{margin-left:0}
.p3-x{margin:8px 0 0 17px;display:flex;flex-direction:column;gap:8px}
.p3-x .r3-fix{padding:9px 10px}
.p2-dec .r3-step{font-size:14px}
.p3-z{zoom:1.3;width:300px}
.p3-z .p2-top{gap:6px;padding:0 10px}
.p3-z .p2-top .wordmark{font-size:17px;max-width:128px}
.p3-z .p2-top .src{font-size:10px}
.p3-z .p2-top .ibtn{width:34px;height:34px}
.r2-tools{white-space:nowrap}
.p3-z .p2-h{flex-wrap:wrap}
.p3-z .p2-h h2{font-size:22px}
"""

# --------------------------------------------------------------------------
# routes: the canonical artboards
# --------------------------------------------------------------------------
R = dict(ROUTE)
R.update({"overview": "Main.dc.html", "phone": "PhoneOverview.dc.html", "phoneimports": "PhoneImports.dc.html", "phonewrite": "PhoneWrite.dc.html"})
r2.R2ROUTE.clear()
r2.R2ROUTE.update(R)
r2.LOCAL.update({
    "staffing": [("schedules", "Schedules", ""), ("needs", "Staff needs", "3"), ("payroll", "Payroll", "")],
    "expansion": [("demand", "Demand", ""), ("finder", "Find a location", ""), ("plan", "Plan a factory", "")],
})

SRC = {"live": ("", "Live", "updated 14s ago"), "stale": ("stale", "Stale", "last good read 09:40"), "fail": ("fail", "Link lost", "no answer for 40s"),
       "file": ("", "Following the save folder", "saved 09:40")}

NAV_DE = {"Overview": "Übersicht", "Businesses": "Unternehmen", "Supply": "Versorgung", "Staffing": "Personal", "Expansion": "Expansion",
          "City map": "Stadtplan", "Game guide": "Spielführer"}


def mast(active: str, company: str = "Marlow Trading", src: str = "live", de: bool = False, compact: bool = False) -> str:
    t = (lambda s: NAV_DE.get(s, s)) if de else (lambda s: s)
    nav = "".join(f'<a class="{"on" if k == active else ""}" href="{R[k]}"{" aria-current=page" if k == active else ""}>{ic(k)}{t(l)}{"<span class=n>4</span>" if k == "overview" else ""}</a>' for k, l in r2.MAIN5)
    cls, word, when = SRC[src]
    if compact:
        when = when.replace("updated ", "")
    return f"""
<header class="r2-mast nx-mast">
  <div class="nx-brand"><span class="wordmark" id="wm" title="{esc(company)}">{esc(company)}</span><span class="dot" id="dot" role="button" tabindex="0" aria-label="Brand dot: pays out coins"></span>
    <button class="r2-co" type="button" aria-label="Switch company or save">{ic("chevd")}</button></div>
  <nav class="r2-nav" aria-label="Main">{nav}</nav>
  <div class="r2-refs"><a href="{R["map"]}">{ic("map")}{"Map" if compact else t("City map")}</a><a href="{R["guide"]}">{ic("guide")}{"Guide" if compact else t("Game guide")}</a><button type="button" aria-label="Search, preferences, help and feedback">{ic("more")}</button></div>
  <div class="clock"><b>Day 83<i>·</i>Wed 09:40</b><small><span class="r2-src {cls}"><b></b><em>{word}</em>· {when}</span><button class="ibtn" type="button" aria-label="Update now" style="width:24px;height:24px">{ic("refresh", style="width:13px;height:13px")}</button></small></div>
  <div class="orb" aria-hidden="true"><u></u></div>
</header>"""


def tmast(active: str) -> str:
    """768: the masthead in two rows, the five destinations still labelled."""
    nav = "".join(f'<a class="{"on" if k == active else ""}" href="{R[k]}">{ic(k)}<span>{l}</span>{"<span class=n>4</span>" if k == "overview" else ""}</a>' for k, l in r2.MAIN5)
    return f"""
<header class="r3-tm nx-ptop"><div class="nx-brand"><span class="wordmark" id="wm">Marlow Trading</span><span class="dot" id="dot" role="button" tabindex="0" aria-label="Brand dot"></span>
  <button class="r2-co" type="button" aria-label="Switch company or save">{ic("chevd")}</button></div>
  <div class="clock"><b>Day 83<i>·</i>Wed 09:40</b><small><span class="r2-src"><b></b><em>Live</em>· updated 14s ago</span></small></div>
  <div class="orb" aria-hidden="true" style="width:40px;height:40px"><u></u></div></header>
<nav class="r3-tnav" aria-label="Main">{nav}<a class="more" href="#" aria-haspopup="menu">{ic("map")}Map · Guide · More</a></nav>"""


def local(area: str, on: str) -> str:
    return r2.local(area, on) if area in r2.LOCAL else ""


def page(active: str, body: str, sub: str = "", title: str = "", tablet: bool = False, src: str = "live", de: bool = False, company: str = "Marlow Trading", compact: bool = False) -> str:
    head = tmast(active) if tablet else mast(active, company=company, src=src, de=de, compact=compact)
    lr = local(active, sub) if active in r2.LOCAL and sub else ""
    ttl = f'<div class="r3-title"><h1>{title}</h1></div>' if title and not lr else ""
    return f'{head}{lr}<main class="r2-main">{ttl}{body}</main>'


def app2(active, sub, title, body, crumbs=None, source="live", counts=None, top_extra=""):
    """The shell the other screen builders render with (replaces kit.app)."""
    t = "" if active in r2.LOCAL else title
    return page(active, body, sub, t, src="fail" if source == "fail" else "live")


def from_strip(what: str, pos: str = "1 of 4 critical", nxt: bool = True, back: str = "Main.dc.html") -> str:
    return (f'<div class="r2-from"><a class="back" href="{back}">{ic("back")}Needs attention</a>'
            f'<span>You came from <b>{what}</b> · {pos}</span></div>')


# --------------------------------------------------------------------------
# the Overview
# --------------------------------------------------------------------------
def machines_mini() -> str:
    rows = [("Beer 1", range(24), set(), ""), ("Beer 2", range(24), set(), ""), ("Beer 3", range(6, 18), set(), ""), ("Beer 4", [], set(range(24)), "hit")]
    out = "".join(f'<span class="{c}">{n}</span>{hours(on, gap=g)}' for n, on, g, c in rows)
    return f'<div class="r3-mach" role="img" aria-label="Hours staffed each day: Beer 1 and 2 all day, Beer 3 06 to 18, Beer 4 none">{out}<div class="ax"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div></div>'


def details_btn(pane: str, opened: bool) -> str:
    return (f'<button class="r3-det" type="button" data-open="{pane}" aria-expanded="{"true" if opened else "false"}" aria-controls="{pane}">'
            f'<span data-when="Hide" data-was="Details">{"Hide" if opened else "Details"}</span>{ic("chevd")}</button>')


def f_water(opened: bool, st: str = "") -> str:
    return f"""
<article class="r3-f" data-id="imp">
  <span class="mark" aria-label="Critical"></span>
  <div class="t"><h3>{hood("IC")}Water · Bridge Hub<span class="k">Import shortfall</span></h3>
    <p class="now"><b>Runs out Sat ~14:00</b>, 2 days before Monday's delivery</p>{st}</div>
  <div class="vz">{cover(["", "", "", "half", "dry", "", ""], ["WED", "THU", "FRI", "SAT", "SUN", "MON", "TUE"], truck=5)}</div>
  {details_btn("x-imp", opened)}
  <div class="ac">{btn("Review import", "go", R["supply/imports"], icon_end="go")}</div>
</article>
<div class="r3-x" data-pane="x-imp" id="x-imp"{"" if opened else " hidden"}>
  <div><span class="lab">Weekly amount · units a week</span>
    <div class="r2-cmp">
      <span>Order now</span><span class="bar"><i style="width:44.8%;background:var(--ink-3)"></i></span><span class="n">8,400</span>
      <span>Today's draw</span><span class="bar"><i style="width:65%;background:var(--warn)"></i></span><span class="n">12,180</span>
      <span>Full production</span><span class="bar"><i style="width:100%;background:var(--accent)"></i></span><span class="n">18,740</span>
    </div></div>
  <div><span class="lab">Goes without from Sat</span>
    <div class="r2-aff"><span>{ic("factory")}Canal Brewery, Beer line</span><span>{ic("shop")}Marlow Market {hood("MT")} and {hood("HK")}</span></div>
    <div class="r3-links" style="margin-top:6px"><a href="{R["supply/flow"]}">{ic("flow")}Follow the supply route</a></div></div>
  <div><span class="lab">Two fixes, for two problems</span>
    <div class="r3-fix"><span class="n">1</span><b>Prevent the recurring shortage: increase the weekly order.</b><span>8,400 → <span class="v">18,740</span> a week · {mw()} the game link can apply it</span></div>
    <div class="r3-fix"><span class="n">2</span><b>Cover the gap until Monday: buy approximately 3,050 units now.</b><span>{ic("hand", style="width:14px;height:14px")} a one-time urgent order, by hand</span></div>
    <div class="r3-links"><a href="{R["supply/production"]}">{ic("link")}Separate fix: Canal Brewery's Water top-up</a></div></div>
</div>"""


def crit_rest() -> str:
    return f"""
<article class="r3-f">
  <span class="mark"></span>
  <div class="t"><h3>{hood("IC")}Beer machine 4 · Canal Brewery<span class="k">Nobody staffed</span></h3>
    <p class="now"><b>Idle all week</b>: 0 of 168 hours staffed</p></div>
  <div class="vz">{machines_mini()}</div>
  {details_btn("x-staff", False)}
  <div class="ac">{btn("Plan factory hours", "", R["supply/production"], icon_end="go")}</div>
</article>
<div class="r3-x" data-pane="x-staff" hidden><div><span class="lab">Output</span><p>The line makes <b>1,500</b> of its rated <b>2,400</b> a day.</p></div>
  <div><span class="lab">Depends on the basis</span><p>Full production needs 24 h a day on every machine; shop demand needs 13 h.</p></div>
  <div><span class="lab">Fix</span><div class="r3-fix"><span class="n">1</span><b>Schedule factory workers for Beer 4.</b><span>Set in the game; no game-link write</span></div></div></div>
<article class="r3-f">
  <span class="mark"></span>
  <div class="t"><h3>{hood("HK")}Ana Reyes · Vale Liquor<span class="k">Staff demands</span></h3>
    <p class="now"><b>May quit</b>: wants free weekends, scheduled Sat and Sun</p></div>
  <div class="vz"><div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px" role="img" aria-label="Her scheduled days: Monday to Friday, and Saturday and Sunday which she wants free">{"".join(f'<i style="height:14px;border-radius:2px;background:{"repeating-linear-gradient(135deg,var(--neg) 0 2px,transparent 2px 5px)" if d >= 5 else "var(--accent)"};opacity:{1 if d >= 5 else .75}"></i>' for d in range(7))}</div>
    <div class="nx-cov"><div class="ax">{"".join(f"<span>{x}</span>" for x in ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])}</div></div></div>
  {details_btn("x-quit", False)}
  <div class="ac">{btn("Resolve staff demand", "", R["staffing/needs"], icon_end="go")}</div>
</article>
<div class="r3-x" data-pane="x-quit" hidden><div><span class="lab">Unhappy for</span><p><b>4 days</b>; 1 of 2 people on the Cash register.</p></div>
  <div><span class="lab">Her week</span><p>Sat 10–18 and Sun 10–18.</p></div>
  <div><span class="lab">Fix</span><div class="r3-fix"><span class="n">1</span><b>Move her weekend hours to weekdays.</b><span>{mw()} a shop schedule can be written through the game link</span></div></div></div>
<article class="r3-f">
  <span class="mark"></span>
  <div class="t"><h3>{hood("LM")}Harbor Gifts<span class="k">Not trading yet</span></h3>
    <p class="now"><b>Closed since day 81</b>: 2 of 3 things missing</p></div>
  <div class="vz"><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="r3-lamp miss">{ic("tag")}No prices</span><span class="r3-lamp miss">{ic("staffing")}No staff</span><span class="r3-lamp ok">{ic("supply")}Stock</span></div></div>
  {details_btn("x-ready", False)}
  <div class="ac">{btn("Open readiness", "", "BusinessDetail.dc.html", icon_end="go")}</div>
</article>
<div class="r3-x" data-pane="x-ready" hidden><div><span class="lab">Prices</span><p>Gift (Cheap), Gift (Luxury), Umbrella have none.</p></div>
  <div><span class="lab">Staff</span><p>Nobody scheduled on the Cash register or the Cleaning station.</p></div>
  <div><span class="lab">Two separate fixes</span><div class="r3-fix"><span class="n">1</span><b>Set prices on 3 products.</b><span>in the game</span></div><div class="r3-fix"><span class="n">2</span><b>Schedule 2 people.</b><span>{mw()} can be written through the game link</span></div></div></div>"""


def head(checked: str = "Checked <b>14 businesses</b> at day 83, 09:40", changes: bool = True, counts=("4", "11", "2")) -> str:
    c, w, o = counts
    ch = f'<button class="r2-disc" type="button" aria-expanded="false">{ic("link")}Your changes: <span class="blue">1 applied, awaiting refresh</span>{ic("chevd")}</button>' if changes else ""
    return f"""
<div class="r2-head" id="att"><h2>Needs attention</h2>
  <button class="sev crit" type="button" aria-pressed="true"><i></i>{c}<span>critical</span></button>
  <button class="sev watch" type="button" aria-pressed="true"><i></i>{w}<span>warnings</span></button>
  <button class="sev opp" type="button" aria-pressed="true"><i></i>{o}<span>opportunities</span></button>
  <div class="aside"><a class="nx-btn sm ghost" href="Customize.dc.html">{ic("prefs")}Customize checks</a><a class="r2-tools" href="#tools">{ic("chevd")}All tools</a></div></div>
<div class="r2-meta"><button class="r2-disc" type="button" aria-expanded="false">{ic("tick")}{checked}{ic("chevd")}</button>{ch}</div>"""


def more_line(n: str = "Show 8 more: 6 warnings, 2 opportunities") -> str:
    return (f'<div class="r2-more"><button class="nx-btn sm" type="button" data-open="more3" aria-expanded="false">{ic("chevd")}<span data-when="Show fewer" data-was="{n}">{n}</span></button>'
            f'<span class="sep"></span><button class="r2-disc" type="button">{ic("eyeoff")}3 below the $500/day line</button>'
            f'<button class="r2-disc" type="button">{ic("prefs")}3 in switched-off checks</button><button class="r2-disc" type="button">{ic("clock")}2 waiting for data</button></div>'
            f'<div data-pane="more3" hidden>{"".join(r2.wrow(r) for r in r2.WARN[5:])}{"".join(r2.wrow(r, True) for r in r2.OPP)}</div>')


def overview_body(opened: bool = False, water_state: str = "", pre: str = "") -> str:
    q = (f'<div class="r2-q"><div class="r2-band"><span class="lab crit">Critical · 4</span></div>{f_water(opened, water_state)}{crit_rest()}'
         f'<div class="r2-band"><span class="lab watch">Warnings · 11</span></div>{"".join(r2.wrow(r) for r in r2.WARN[:5])}</div>{more_line()}')
    return pre + r2.kpis() + f'<section aria-labelledby="att">{head()}{q}</section><div class="r2-toolshead" id="tools"><h2>All tools</h2></div>{r2.tools()}'


def overview(opened: bool = False) -> str:
    return page("overview", overview_body(opened))


def overview_long() -> str:
    warns = "".join(r2.wrow(r) for r in r2.WARN) + "".join(r2.wrow(r, True) for r in r2.OPP)
    body = (r2.head(sticky=True) + f'<div class="r2-q" style="border-top:0">{crit_rest()}<div class="r2-band"><span class="lab watch">Warnings · 11</span></div>{warns}</div>'
            + f'<div class="r2-toolshead" id="tools"><h2>All tools</h2></div>{r2.tools()}')
    return page("overview", body)


def overview_return() -> str:
    st = f'<p style="display:flex;gap:8px;align-items:center;margin-top:2px">{state("link", "Applied through game link · 09:46")}<span class="quiet">confirmed after the next read</span></p>'
    note = (f'<div role="status" class="r2-from" style="margin-top:14px">{ic("back", style="width:15px;height:15px;color:var(--accent)")}'
            f'<span>Back where you left: <b>Water · Bridge Hub</b>, 1 of 4 critical. The list keeps its order until you leave the page.</span></div>')
    b = overview_body(False, st, pre=note)
    b = b.replace('<article class="r3-f" data-id="imp">', '<article class="r3-f" data-id="imp" style="outline:2px solid var(--accent);outline-offset:-2px;border-radius:10px">', 1)
    return page("overview", b)


def overview_calm() -> str:
    body = r2.kpis() + f"""
<section>{head(counts=("0", "0", "1"), changes=False)}
<div class="r2-q"><div class="r2-band"><span class="lab" style="color:var(--accent)">No urgent issues found in this snapshot</span></div>
  <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:1px solid var(--rule-soft)">
    <div style="padding:16px 18px 16px 0;border-right:1px solid var(--rule-soft);display:flex;gap:14px;align-items:center">{r2.ill("supply")}<div><b style="font-size:15px">Supply</b><p class="quiet" style="font-size:13px;margin-top:4px">Every shelf clears tomorrow; both depots reach Monday.</p></div></div>
    <div style="padding:16px 18px;border-right:1px solid var(--rule-soft);display:flex;gap:14px;align-items:center">{r2.ill("staffing").replace('<rect class="gap"', '<rect class="gap" style="display:none"')}<div><b style="font-size:15px">Staffing</b><p class="quiet" style="font-size:13px;margin-top:4px">Every station staffed; no demand unmet.</p></div></div>
    <div style="padding:16px 0 16px 18px;display:flex;gap:14px;align-items:center">{r2.ill("businesses")}<div><b style="font-size:15px">Businesses</b><p class="quiet" style="font-size:13px;margin-top:4px">All shops at 80% satisfaction or more.</p></div></div>
  </div>
  {r2.wrow(r2.OPP[0], True)}</div>
<div class="r2-more"><button class="r2-disc" type="button">{ic("eyeoff")}2 below the $500/day line</button><button class="r2-disc" type="button">{ic("prefs")}2 kinds switched off</button>
  <button class="r2-disc" type="button">{ic("clock")}Trends wait for 14 trading days (you have 9)</button><button class="r2-disc" type="button">{ic("warn")}1 factory line cannot be checked</button></div>
</section><div class="r2-toolshead" id="tools"><h2>All tools</h2></div>{r2.tools()}"""
    return page("overview", body)


def overview_shop_only() -> str:
    k = r2.kpis().replace("-$1,240", "$840").replace("$38,920", "$6,410").replace("$212,400", "$18,300").replace("$1.84M", "$96,000")
    tl = r2.tools().replace(
        f'<a class="t" href="{R["supply/production"]}">Plan factory running hours{ic("go")}</a>',
        f'<a class="t" href="{R["supply/production"]}" style="color:var(--ink-2)">Plan factory running hours<span class="c" style="background:transparent;color:var(--ink-3);font-weight:500">no factory yet</span>{ic("go")}</a>')
    body = k + f"""
<section>{head(checked="Checked <b>5 businesses</b> at day 21, 14:10", changes=False, counts=("1", "2", "0"))}
<div class="r2-q"><div class="r2-band"><span class="lab crit">Critical · 1</span></div>
<article class="r3-f"><span class="mark"></span>
  <div class="t"><h3>{hood("MH")}Tea (Green) · Tide Tea<span class="k">Wholesale delivery too low</span></h3><p class="now"><b>Empty from Tue</b>, 2 days before Thursday's delivery</p></div>
  <div class="vz">{cover(["", "", "", "", "", "dry", "dry"], ["THU", "FRI", "SAT", "SUN", "MON", "TUE", "WED"], truck=None)}</div>
  {details_btn("x-tea", False)}<div class="ac">{btn("Review delivery", "go", R["supply/deliveries"], icon_end="go")}</div></article>
<div class="r3-x" data-pane="x-tea" hidden><div><span class="lab">A week</span><p>Brings <b>300</b>; the shelf sells <b>364</b>.</p></div><div><span class="lab">Where</span><p>The wholesale store's weekly contract.</p></div><div><span class="lab">Fix</span><div class="r3-fix"><span class="n">1</span><b>Raise the weekly delivery to 420.</b><span>in the game</span></div></div></div>
<div class="r2-band"><span class="lab watch">Warnings · 2</span></div>
{r2.wrow(("MH", "Tide Tea", "Customer satisfaction 74%", "74%", "", "Review satisfaction", "businesses/standards", False))}
{r2.wrow(("LM", "Juniper Books", "Cash register staffing is the limit, 12–14", "$95", "/day", "Review staffing", "staffing/schedules", False))}
</div></section><div class="r2-toolshead" id="tools"><h2>All tools</h2></div>{tl}"""
    return page("overview", body, company="Juniper &amp; Co").replace("Marlow Trading", "Juniper &amp; Co")


def overview_stale() -> str:
    banner = f"""
<div role="status" style="margin-top:16px;display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;border:1px solid color-mix(in srgb,var(--warn) 45%,transparent);background:var(--warn-soft)">
  {ic("warn", style="color:var(--warn)")}<span style="font-size:13.5px"><b>Showing the last good board, day 83 09:40.</b> <span style="color:var(--ink-2)">The game link stopped answering 40s ago.</span></span>
  <span style="margin-left:auto;display:flex;gap:8px">{btn("Try again", "sm", icon="refresh")}{btn("Open a save file", "sm ghost", "NoSave.dc.html")}</span></div>"""
    return page("overview", overview_body(pre=banner), src="fail")


def overview_names() -> str:
    b = page("overview", overview_body(), de=True, company="Marlow &amp; Vandersloot Handelsgesellschaft")
    for a, c in [("Needs attention</h2>", "Braucht Aufmerksamkeit</h2>"), (">All tools<", ">Alle Werkzeuge<"), ("Customize checks", "Prüfungen anpassen"),
                 (">Review import<", ">Import prüfen<"), (">Plan factory hours<", ">Laufzeiten planen<"), (">Resolve staff demand<", ">Mitarbeiterwunsch lösen<"),
                 (">Open readiness<", ">Bereitschaft öffnen<"), ('data-was="Details">Details<', 'data-was="Details">Details<'),
                 ("Bridge Hub<span", "Bridge Hub Zentrallager Industry City<span")]:
        b = b.replace(a, c)
    return b


def overview_focus() -> str:
    b = overview()
    return b.replace('<button class="r3-det" type="button" data-open="x-imp"', '<button class="r3-det" style="outline:2px solid var(--accent);outline-offset:3px" type="button" data-open="x-imp"', 1)


def customize() -> str:
    return overview() + '<div class="cz-scrim"></div>' + ov.customize().split('<div class="cz-scrim"></div>', 1)[1]


def overview_1024(opened: bool = True) -> str:
    return f'<div class="bp1024" style="height:100%">{page("overview", overview_body(opened), compact=True)}</div>'


def overview_768() -> str:
    return f'<div class="bp768" style="height:100%">{page("overview", overview_body(True), tablet=True)}</div>'


# --------------------------------------------------------------------------
# Imports: two fixes for two problems, the basis visible
# --------------------------------------------------------------------------
def basis(full: bool = True) -> str:
    return (f'<div class="nx-basis"><span class="lab">Plan for</span><div class="seg" data-seg="basis">'
            f'<button class="{"on" if full else ""}" type="button" data-v="full" aria-pressed="{"true" if full else "false"}">Full production</button>'
            f'<button class="{"" if full else "on"}" type="button" data-v="demand" aria-pressed="{"false" if full else "true"}">Shop demand</button></div>'
            f'<span class="txt" data-when-basis="full"{"" if full else " hidden"}>Factory lines at rated output, round the clock</span>'
            f'<span class="txt" data-when-basis="demand"{" hidden" if full else ""}>Factory lines sized to shop sales + 15%</span></div>')


def recurring(full: bool, shown: bool = True) -> str:
    to, lab, pos, note = (("18,740", "full production", 93.7, "") if full else
                          ("11,040", "shop demand", 55.2, "Today's draw is higher because Canal Brewery now runs more hours than your shops need."))
    add_w = max(0, pos - 42)
    return f"""
<div data-when-basis="{"full" if full else "demand"}"{"" if full == shown else " hidden"}>
  <div class="r2-big"><span class="was">8,400</span><span class="arr">→</span><label class="to"><input value="{to}" aria-label="Weekly order of Water, units a week"><span class="u">units a week</span></label></div>
  <div class="r2-basis">{ic("factory", style="width:15px;height:15px;color:var(--accent)")}Planned for <b>{lab}</b></div>
  <div class="r2-scale" aria-label="Weekly amounts on one scale">
    <i style="left:0;width:42%;background:var(--ink-3);opacity:.6"></i><i style="left:42%;width:{add_w:.1f}%;background:var(--accent)"></i>
    <span class="m" style="left:42%"><span>order now<br>8,400</span></span>
    <span class="m low" style="left:60.9%;background:var(--warn)"><span style="color:var(--warn)">today's draw<br>12,180</span></span>
    <span class="m" style="left:{pos}%;background:var(--accent)"><span style="color:var(--accent)">planned<br>{to}</span></span>
    <span class="m cap low" style="left:100%"><span>1 Pier cap<br>20,000</span></span>
  </div>
  {f'<p style="font-size:12.5px;color:var(--ink-2);margin-top:40px">{note}</p>' if note else '<div style="height:44px"></div>'}
</div>"""


def imports_body(st: str = "sug", open_: bool = False, full: bool = True, arrived: bool = True, flow_link: bool = True) -> str:
    stp = {"sug": state("sug"), "mine": state("mine", "Marked done by you · 09:44"), "link": state("link", "Applied · awaiting refresh"), "conf": state("conf", "Confirmed · day 84")}[st]
    status = chip("bad", "short") if st != "conf" else chip("ok", "covered")
    fs = from_strip("Water · Bridge Hub, import shortfall", "1 of 4 critical") if arrived else ""
    conf = (f'<div role="status" style="margin-top:16px;display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:var(--accent-soft);border:1px solid color-mix(in srgb,var(--accent) 35%,transparent);font-size:13px">'
            f'{ic("tick", style="color:var(--accent)")}<span><b>Confirmed from refreshed data, day 84 00:10.</b> Monday brought 18,740; Bridge Hub reaches next Monday with 2,100 spare.</span></div>') if st == "conf" else ""
    rail_days = ["", "", "", "half", "dry", "", ""] if st != "conf" else [""] * 7
    return f"""
{fs}{conf}
<div class="r2-scope"><span class="nx-pick sel">{ic("warehouse")}Bridge Hub<span class="x" aria-label="Clear">{ic("x", style="width:12px;height:12px")}</span></span>
  <a class="link" href="#">All import lines</a>{f'<a class="link" href="{R["supply/flow"]}">Follow its supply route</a>' if flow_link else ""}<span style="margin-left:auto">{basis(full)}</span></div>
<section class="r2-dec" aria-labelledby="dh">
  <div class="r2-dh">{hood("IC")}<h2 id="dh">Water · Bridge Hub</h2>{status}<span class="how">{ic("truck")}Fixed weekly amount from 1 Pier, delivered Monday 08:00</span></div>
  <div class="r3-two">
    <section aria-labelledby="f1">
      <div class="r3-step" id="f1"><span class="n">1</span>Prevent the recurring shortage<small>increase the weekly order</small></div>
      {recurring(True, full)}{recurring(False, full)}
      <div class="r3-acts">{stp}{gwbtn("Preview in the game", "", "WritePreview.dc.html")}{btn("Mark done by you", "ghost", "ImportsMarked.dc.html", icon="tick")}<span class="gap"></span><span class="note">orders close Sun 20:00</span></div>
    </section>
    <section aria-labelledby="f2">
      <div class="r3-step" id="f2"><span class="n">2</span>Cover the gap until Monday<small>a one-time purchase</small></div>
      <div class="r3-railgap">{"" if st == "conf" else '<span class="r3-gaplab">gap</span>'}{cover(rail_days, ["WED", "THU", "FRI", "SAT", "SUN", "MON", "TUE"], truck=5)}</div>
      <div style="margin-top:18px"><span class="r3-cover">~3,050<small>units, bought now</small></span></div>
      <p style="font-size:12.5px;color:var(--ink-2);margin-top:8px">Runs out Sat ~14:00 · delivery Mon 08:00. An urgent order costs more and counts against Monday's cap.</p>
      <div class="r3-acts" style="margin-top:16px">{state("sug")}{btn("Mark done by you", "ghost", "#", icon="tick")}<span class="gap"></span><span class="note">{ic("hand", style="width:14px;height:14px;display:inline-block;vertical-align:-2px")} by hand; no game-link write</span></div>
    </section>
  </div>
  <div class="r2-act" style="background:transparent">
    <button class="r2-disc" type="button" data-open="why" aria-expanded="{"true" if open_ else "false"}">{ic("chevd")}Why this amount?</button>
    <button class="r2-disc" type="button" data-open="why" aria-expanded="{"true" if open_ else "false"}">{ic("list")}Manual instructions</button>
    <button class="r2-disc" type="button">{ic("copy")}Copy both changes</button>
  </div>
  <div class="r3-open" data-pane="why"{"" if open_ else " hidden"}>
    <div><span class="lab">Why 18,740 a week</span>
      <div class="r2-calc" style="margin-top:8px"><span>Canal Brewery at rated output, 2,400 a day × 7</span><b>16,800</b>
        <span>2 grocery shelves, 240 a day × 7, plus 15%</span><b>1,932</b>
        <span class="tot">Rounded up to the ten</span><b class="tot">18,740</b>
        <span>With shop demand: the brewery at 1,300 a day</span><b style="color:var(--ink-2)">11,040</b></div></div>
    <div><span class="lab">Manual instructions</span>
      <div class="r2-steps2" style="margin-top:8px"><span><i>1</i>Weekly order: <b>BizMan › Purchasing agent › 1 Pier › Water</b>, set Amount to <b>18,740</b> before Sun 20:00</span>
        <span><i>2</i>Gap: <b>BizMan › Purchasing agent › Urgent order</b>, about <b>3,050</b> Water to Bridge Hub</span></div></div>
  </div>
</section>
<div class="r2-lines">
  <div class="r2-band"><span class="lab">Other lines at Bridge Hub</span><span class="quiet" style="margin-left:auto">2 covered lines hidden · <button class="link" type="button">Show everything</button></span></div>
  <div class="r2-li">{ic("tank")}<b>Soda Can</b><span class="n">2,600<small>in stock</small></span><span class="src">Smart Delivery at 1 Pier keeps this stock level</span><span style="display:flex;justify-content:flex-end">{state("link", "Applied · awaiting refresh")}</span></div>
</div>"""


def imports(st: str = "sug", open_: bool = False, full: bool = True, arrived: bool = True) -> str:
    return page("supply", imports_body(st, open_, full, arrived), "imports")


def imports_1024() -> str:
    return f'<div class="bp1024" style="height:100%">{page("supply", imports_body(full=False), "imports", compact=True)}</div>'


# --------------------------------------------------------------------------
# Changes and the business page, with the review's corrections
# --------------------------------------------------------------------------
def changes(copy_open: bool = False) -> str:
    return r2.changes(copy_open).replace(r2.mast("supply"), mast("supply"))


def business() -> str:
    b = r2.business().replace(r2.mast("businesses"), mast("businesses"))
    old = b[b.index('<div class="r2-sat">'):b.index('</div></div>\n  <div class="r2-card"><h3>' + ic("megaphone"))]
    parts = [("Service", 88, ""), ("Pricing", 84, ""), ("Cleanliness", 63, "low"), ("Facility", 86, "")]
    eq = "".join(f'<div class="c {c}"><span class="t"><b style="height:{v}%"></b></span><small>{n}<em>{v}%</em></small></div>' for n, v, c in parts)
    lamps = "".join(f'<div class="r2-lamp {c}"><span>{ic(i)}</span><small>{t}</small></div>' for i, t, c in
                    [("door", "Bathroom", "lit"), ("lock", "Privacy", "lit"), ("sink", "Sink", "lit"), ("music", "Music", "lit"), ("brush", "Interior 48/55", "miss"), ("shirt", "Uniforms", "lit")])
    new = (f'<div style="display:flex;flex-direction:column"><div class="r2-sat" style="grid-template-columns:auto auto;align-items:end"><span class="big">86<small>%</small></span>'
           f'<div class="r3-eq" role="img" aria-label="Service 88, pricing 84, cleanliness 63, facility 86, against the 80 line"><span class="ln"></span>{eq}</div></div>'
           f'<div class="r2-lamps" style="margin-top:14px">{lamps}</div>')
    return b.replace(old, new)


# --------------------------------------------------------------------------
# phone
# --------------------------------------------------------------------------
def pshell(active: str, body: str, zoom: bool = False) -> str:
    tabs = "".join(f'<a class="{"on" if k == active else ""}" href="{R[k]}">{ic(k)}<span>{l}</span>{"<span class=n>4</span>" if k == "overview" else ""}</a>' for k, l in r2.MAIN5)
    tabs += f'<a href="#" aria-haspopup="menu">{ic("map")}<span>Map &amp; more</span></a>'
    inner = f"""
  <header class="p2-top nx-ptop"><div class="nx-brand"><span class="wordmark" id="wm">Marlow Trading</span><span class="dot" id="dot" role="button" tabindex="0" aria-label="Brand dot"></span></div>
    <span class="src"><em>Live</em><br>updated 14s ago</span><button class="ibtn" type="button" aria-label="Update now">{ic("refresh")}</button></header>
  <div class="p2-b">{body}</div>"""
    if zoom:
        inner = f'<div class="p3-z">{inner}</div>'
    return f'<div class="p2">{inner}<nav class="ph-tabs" aria-label="Main">{tabs}</nav></div>'


def pfind(title, now, action, route, pane, opened=False, sel=False, extra="", det="") -> str:
    return (f'<article class="p2-f{" sel" if sel else ""}"><div class="l1"><span class="mk"></span><b>{title}</b></div><p class="now">{now}</p>{extra}'
            f'<div class="p3-row"><a class="go" href="{route}">{action}{ic("go")}</a>{details_btn(pane, opened)}</div>'
            f'<div class="p3-x" data-pane="{pane}"{"" if opened else " hidden"}>{det}</div></article>')


def phone(opened: bool = False, zoom: bool = False) -> str:
    water_det = (f'<div class="r3-fix"><span class="n">1</span><b>Prevent the recurring shortage: increase the weekly order.</b><span>8,400 → <span class="v">18,740</span> a week</span></div>'
                 f'<div class="r3-fix"><span class="n">2</span><b>Cover the gap until Monday: buy approximately 3,050 units now.</b><span>by hand</span></div>'
                 f'<div class="r3-links"><a href="{R["supply/flow"]}">{ic("flow")}Follow the supply route</a></div>')
    crit = (pfind("Water · Bridge Hub", "<b>Runs out Sat ~14:00</b>, before Monday's delivery", "Review import", R["phoneimports"], "px-imp", opened, True,
                  f'<div class="vz">{cover(["", "", "", "half", "dry", "", ""], ["W", "T", "F", "S", "S", "M", "T"], truck=5)}</div>', water_det)
            + pfind("Beer machine 4 · Canal Brewery", "<b>Idle all week</b>, nobody staffed", "Plan factory hours", R["supply/production"], "px-staff",
                    det='<p style="font-size:13px;color:var(--ink-2)">The line makes 1,500 of 2,400 a day.</p>')
            + pfind("Ana Reyes · Vale Liquor", "<b>May quit</b>: wants free weekends", "Resolve staff demand", R["staffing/needs"], "px-quit",
                    det='<p style="font-size:13px;color:var(--ink-2)">Scheduled Sat and Sun 10–18; unhappy 4 days.</p>')
            + pfind("Harbor Gifts", "<b>Not trading</b>: no prices, no staff", "Open readiness", "BusinessDetail.dc.html", "px-ready",
                    det='<p style="font-size:13px;color:var(--ink-2)">3 products need prices; 2 stations need people.</p>'))
    warns = "".join(f'<a class="p2-w" href="{R[r[6]]}"><span class="mk"></span><span><b>{r[2]}</b><small>{r[1]}</small></span>{ic("chev")}</a>' for r in r2.WARN[:3])
    body = f"""
<div class="p2-ctx"><span>Profit <b class="neg">-$1,240</b></span><span>Cash <b>$212k</b></span><span>Day 83</span><a href="{R["businesses/results"]}" aria-label="Company results">{ic("chev")}</a></div>
<div class="p2-h"><h2>Needs attention</h2><a class="r2-tools" href="#tools">{ic("chevd")}All tools</a></div>
<div class="p3-sev"><button class="sev crit" type="button"><i></i>4<span>critical</span></button><button class="sev watch" type="button"><i></i>11<span>warnings</span></button><button class="sev opp" type="button"><i></i>2<span>opportunities</span></button></div>
{crit}
<div class="r2-band"><span class="lab watch">Warnings · 11</span><a class="nx-btn sm ghost" href="Customize.dc.html" style="margin-left:auto;height:34px">{ic("prefs")}Checks</a></div>
{warns}
<button class="nx-btn wide" type="button" style="height:44px;margin-top:12px">Show 10 more</button>
<h2 id="tools" style="font-size:20px;font-weight:700;margin-top:26px">All tools</h2>
{r2.tools("p2-tp")}"""
    return pshell("overview", body, zoom)


def phone_imports(sheet: bool = False, full: bool = True, zoom: bool = False) -> str:
    to = "18,740" if full else "11,040"
    body = f"""
<div class="r2-from" style="margin-top:12px"><a class="back" href="{R["phone"]}">{ic("back")}Needs attention</a><span>Water · Bridge Hub</span></div>
<div class="p2-views" aria-label="Supply views"><div class="row"><a href="{R["supply/changes"]}">Changes</a><a class="on" href="#">Imports</a><a href="#">Deliveries</a><a href="#">Production</a><a href="#">Goods flow</a></div>
  <span class="fade"><button type="button" aria-label="More Supply views">{ic("chev")}</button></span></div>
<div class="p2-dec">
  <div class="hd">{hood("IC")}<h2>Water · Bridge Hub</h2>{chip("bad", "short")}</div>
  <div class="sec"><div class="r3-step"><span class="n">1</span>Prevent the recurring shortage</div>
    <div class="r2-big"><span class="was">8,400</span><span class="arr">→</span><label class="to"><input value="{to}" aria-label="Weekly order"><span class="u">/ week</span></label></div>
    <div class="seg" data-seg="pb" style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr"><button class="{"on" if full else ""}" type="button" style="justify-content:center;min-height:40px">Full production</button><button class="{"" if full else "on"}" type="button" style="justify-content:center;min-height:40px">Shop demand</button></div>
    <p style="font-size:12.5px;color:var(--ink-2);margin-top:8px">{"Planned for full production. Today's draw 12,180; 1 Pier cap 20,000." if full else "Planned for shop demand. Today's draw 12,180 is higher: the brewery runs more hours than shops need."}</p>
    <div class="p2-acts" style="margin:6px -14px -12px">{gwbtn("Preview in the game", "", R["phonewrite"])}<div class="row">{btn("Mark done", "ghost", "#", icon="tick")}{btn("Manual instructions", "ghost", "#", icon="list")}</div></div></div>
  <div class="sec" style="border-top:1px solid var(--rule-soft)"><div class="r3-step"><span class="n">2</span>Cover the gap until Monday</div>
    <div class="r3-railgap" style="margin-top:26px"><span class="r3-gaplab">gap</span>{cover(["", "", "", "half", "dry", "", ""], ["W", "T", "F", "S", "S", "M", "T"], truck=5)}</div>
    <p style="margin-top:12px"><span class="r3-cover" style="font-size:24px">~3,050<small>units now, by hand</small></span></p>
    <div class="row" style="display:flex;gap:8px;margin-top:10px">{btn("Mark done", "ghost", "#", icon="tick")}{btn("Manual instructions", "ghost", "#", icon="list")}</div></div>
  <div class="sec" style="border-top:1px solid var(--rule-soft)"><button class="r2-disc" type="button" style="height:36px">{ic("chevd")}Why this amount?</button></div>
</div>"""
    b = pshell("supply", body, zoom)
    if sheet:
        wire = f'<span class="gw-w ok" aria-hidden="true"><i class="a"></i><i class="ln"></i><span class="g">{ic("game")}</span></span>'
        d = f"""
<div class="gw-dlg" role="dialog" aria-label="Set import amounts">
  <div class="gw-head"><span class="gw-kind">{ic("truck")}</span><div><h2>Set import amounts</h2><div class="gw-where">{hood("IC")}<span>Bridge Hub · 1 contract</span></div></div><button class="gw-x" type="button" aria-label="Close">{ic("x")}</button></div>
  <div class="gw-verdict">{wire}<span><b>The game would take this.</b></span><span class="gw-meta">closes Sun 20:00</span></div>
  <div class="gw-body"><div class="gw-mat"><div class="top">{ic("truck")}<b>Water</b><span class="quiet">a week</span><span class="num"><s>8,400</s><em>18,740</em></span></div>
    <div class="gw-lvl"><i class="now" style="width:42%"></i><i class="add" style="left:42%;width:51.7%"></i><i class="cap" style="left:99.6%" data-l="cap 20,000"></i></div><div class="meta" style="margin-top:14px"><span>next delivery $15,930</span></div></div>
    <p class="quiet">The gap until Monday is not part of this write: buy it by hand.</p></div>
  <div class="gw-foot"><span class="gw-hint">Only the weekly amount changes. Undo lasts until your next import change.</span><button class="gw-b ghost" type="button">Cancel</button><a class="gw-b go" href="#">Apply 1 change</a></div>
</div>"""
        b += f'<div class="sp-scrim"></div><div class="p2-sheet"><div class="grab"></div>{d}</div>'
    return b


# --------------------------------------------------------------------------
# the slim sidebar alternative, same content and type
# --------------------------------------------------------------------------
def overview_sidebar() -> str:
    side_nav = "".join(f'<a class="{"on" if k == "overview" else ""}" href="{R[k]}">{ic(k)}{l}{"<span class=n>4</span>" if k == "overview" else ""}</a>' for k, l in r2.MAIN5)
    side = f"""
<aside class="r2-side"><div class="nx-brand"><span class="wordmark" id="wm">Marlow Trading</span><span class="dot" id="dot" role="button" tabindex="0" aria-label="Brand dot"></span></div>
  {side_nav}<div class="ref"><a href="{R["map"]}">{ic("map")}City map</a><a href="{R["guide"]}">{ic("guide")}Game guide</a></div>
  <div class="foot"><a href="#">{ic("search")}Search</a><a href="{R["prefs"]}">{ic("prefs")}Preferences</a><a href="{R["help"]}">{ic("help")}Help &amp; feedback</a></div></aside>"""
    top = f"""<header class="r2-sidetop nx-top"><h1>Overview</h1>
  <div class="clock"><b>Day 83<i>·</i>Wed 09:40</b><small><span class="r2-src"><b></b><em>Live</em>· updated 14s ago</span></small></div><div class="orb" aria-hidden="true"><u></u></div></header>"""
    return f'<div class="r2-app">{side}<div>{top}<main class="r2-main">{overview_body()}</main></div></div>'


SIDE_CSS = """
.r2-app .r3-f{grid-template-columns:16px minmax(0,1fr) 240px 96px 180px}
.r2-app .r2-w{grid-template-columns:16px 170px minmax(0,1fr) 90px 170px}
.r2-app .r2-tp{grid-template-columns:repeat(2,minmax(0,1fr))}
"""
