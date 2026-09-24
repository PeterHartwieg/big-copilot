"""Generates the fold-views canvas: project/*.dc.html and project/canvas.json.

UX audit recommendation R15 (research/ux-audit-2026-09-24, outside the repo): fold or
retire three low-value views, drawn as before -> after pairs.

1. Company > Weekly rhythm folds into the Daily result chart as a "By weekday" option,
   which is absent when no series clears the weekly-cycle test; every weekday chart
   names the series it reads, so the company, a site's "Its week" and Products' "Peaks"
   stop seeming to disagree.
2. Today's static "Plan imports" card gets a live count (option A) or goes (option B).
3. Milestones keeps the career checklist; "Every building owned 0 / 885" becomes a
   running total; the difficulty chips move to the masthead's build line or the
   footer stamp, behind one chip with a popover.
Plus one proposal, not a decision: Company in three tabs.

The stylesheet is the live board's own: the <style> block of TEMPLATE in ba_dashboard.py,
read at build time, with the theme tokens re-keyed from :root[data-theme] to a .board
class so the canvas's "dark" tweak can switch them. Every class added here carries the
fv- prefix the port will need anyway. Numbers are modelled on a day-73 save (26 sites,
529 staff) and rounded; they illustrate shapes, not one reconciled save.

The canvas is published at https://claude.ai/artifact/BKCrqkVgjx214GUop3DENp.
Never hand-edit project/: change this and rerun.
  python build_fold_canvas.py                  writes project/
  python build_fold_canvas.py --preview DIR    also writes plain HTML copies into DIR
                                               (dark, light) for checking in a browser
"""
from __future__ import annotations

import html
import json
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE / "project"
REPO = HERE.parent.parent
CREATED_AT = "2026-09-24T12:00:00Z"
FONTS = ("https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800"
         "&family=IBM+Plex+Mono:wght@400;500;600&display=swap")


# --------------------------------------------------------------------------
# the live board's stylesheet, re-keyed for an artboard
# --------------------------------------------------------------------------
def _drop_block(css: str, start: str) -> str:
    """Remove the brace block that begins at `start` (an at-rule and its body)."""
    i = css.find(start)
    if i < 0:
        return css
    depth, j = 0, css.index("{", i)
    while True:
        if css[j] == "{":
            depth += 1
        elif css[j] == "}":
            depth -= 1
            if depth == 0:
                return css[:i] + css[j + 1:]
        j += 1


def board_css() -> str:
    src = (REPO / "ba_dashboard.py").read_text(encoding="utf-8")
    tpl = src[src.index('TEMPLATE = r"""'):]
    css = tpl[tpl.index("<style>") + len("<style>"):tpl.index("</style>")]
    # render() splices the map's and the wiki's stylesheets in; so does the canvas,
    # because both carry rules for the whole board (the phone masthead among them).
    css = (css.replace("/*__MAP_CSS__*/", (REPO / "web" / "map.css").read_text(encoding="utf-8"))
              .replace("/*__WIKI_CSS__*/", (REPO / "web" / "wiki.css").read_text(encoding="utf-8")))
    # The canvas decides the theme through its own tweak, never the viewer's system.
    while "@media (prefers-color-scheme:light){" in css:
        css = _drop_block(css, "@media (prefers-color-scheme:light){")
    css = css.replace(':root[data-theme="light"]', ".board.light")
    return css


FV_CSS = r"""
/* ===== the artboard's frame ================================================ */
body{margin:0;background:#0d100f}
.board{position:relative;overflow:hidden;background:var(--ground);color:var(--ink);
  font-family:Archivo,"Helvetica Neue",Arial,sans-serif;font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased}
.board.light{color-scheme:light}
section{content-visibility:visible}
.board .wrap{padding-bottom:40px}
.board .orb{opacity:1}
.fv-phone .orb{display:none}

/* ===== review marks: what goes, what moves, what is new (the "marks" tweak) = */
.fv-marks [data-fv]{position:relative;outline:2px dashed var(--fv-c);outline-offset:8px;border-radius:6px}
.fv-marks [data-fv]::after{content:attr(data-fv);position:absolute;top:-19px;right:-4px;z-index:9;
  font:600 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;
  color:var(--fv-c);background:var(--ground);padding:3px 6px;border-radius:3px;white-space:nowrap}
[data-fv]{--fv-c:var(--info)}
[data-fv^="goes"]{--fv-c:var(--neg)}
[data-fv^="new"]{--fv-c:var(--accent)}
.fv-marks .fv-l[data-fv]::after{right:auto;left:-4px}
.fv-marks .fv-b[data-fv]::after{top:auto;bottom:-20px}
.board:not(.fv-marks) .fv-say{display:none}
.fv-state{margin:36px 0 12px;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}

/* ===== 1 · the weekday lens inside the Daily result chart ==================== */
.fv-pane{display:none}.fv-pane.on{display:block}
.fv-top{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;min-height:22px;margin-bottom:6px}
.fv-top .readout{margin:0;flex-wrap:wrap}
.fv-basis{display:inline-flex;align-items:center;gap:8px;font:500 12px/1.3 "IBM Plex Mono",monospace;color:var(--ink-2);cursor:default}
.fv-basis b{color:var(--ink);font-weight:500}
.fv-basis .dot{width:7px;height:7px;border-radius:50%;background:var(--fv-s,var(--accent));flex:none}
.fv-week .week{height:190px}
.fv-week .wd{cursor:default}
.fv-legend{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}
.fv-legend .legend{margin:0}
.fv-legend .quiet{margin-left:auto;font-size:12px}
.fv-types{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--rule-soft)}
.fv-types .lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-right:4px}
.fv-type{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:0 10px;border-radius:6px;border:1px solid var(--rule);
  background:none;color:var(--ink-2);font:500 12.5px Archivo,sans-serif;cursor:pointer;transition:border-color .15s,color .15s,transform .2s}
.fv-type:hover{color:var(--ink);border-color:var(--ink-3);transform:translateY(-1px)}
.fv-type[aria-expanded="true"]{color:var(--ink);border-color:var(--ink);background:var(--raised)}
.fv-type b{font:600 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;color:var(--accent)}
.fv-type b i{font-style:normal;color:var(--ink-3);font-weight:500;margin-left:3px}
.fv-type.none b{color:var(--ink-3);font-weight:500;letter-spacing:.02em}
.fv-sites{margin-top:18px}
.fv-sites[hidden]{display:none}
.fv-wd-read{min-height:18px}
.fv-phone .fv-week .week{gap:4px;height:170px}
.fv-phone .wd .n{font-size:10px;padding:3px 5px}
.fv-phone .fv-types .lab{width:100%;margin-bottom:2px}
.fv-phone .chartbox{padding:12px 12px 12px}
.fv-phone .readout{justify-content:flex-start;gap:10px}

/* where a peak is named: three places, side by side ------------------------- */
.fv-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;align-items:start;margin-top:36px}
.fv-where{display:flex;align-items:center;gap:8px;margin-bottom:14px;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.fv-where svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.fv-three .week{height:150px;gap:6px}
.fv-three table{font-size:12.5px}
.fv-three th,.fv-three td{padding:8px 8px}
.fv-three .fv-top{margin-bottom:2px}
.fv-say{margin:14px 0 0;font:500 12px/1.5 "IBM Plex Mono",monospace;color:var(--ink-2)}
.fv-say b{color:var(--ink);font-weight:500}

/* ===== 2 · Next moves ======================================================== */
.fv-moves2{grid-template-columns:repeat(2,minmax(0,1fr))}
.fv-phone .moves{grid-template-columns:1fr;gap:12px}
.move .what b{font-size:inherit;font-weight:600;color:var(--ink)}

/* ===== 3 · the difficulty chip and its popover =============================== */
.fv-diff{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;cursor:pointer;
  font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:0;color:var(--ink-2);
  padding:3px 7px;border-radius:4px;border:1px solid var(--rule);background:var(--surface);transition:color .15s,border-color .15s}
.fv-diff:hover,.fv-diff[aria-expanded="true"]{color:var(--ink);border-color:var(--ink-3)}
.fv-diff:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.fv-diff svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;flex:none;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.fv-diff:hover svg{transform:rotate(-12deg) scale(1.15)}
.fv-diff .hard{color:var(--warn)}
.clock small.fv-diffline{margin-top:6px}
.clock small.fv-diffline::before{display:none}
.sf-legal .fv-diff{font-size:11px;letter-spacing:.04em;padding:4px 8px}

.fv-pop{position:absolute;z-index:60;width:470px;padding:18px 20px 12px;border-radius:12px;background:var(--surface);border:1px solid var(--rule);
  box-shadow:0 20px 60px #0007;opacity:0;visibility:hidden;transform:translateY(-6px);
  transition:opacity .16s ease,transform .16s cubic-bezier(.2,.7,.2,1),visibility .16s}
.board.light .fv-pop{box-shadow:0 18px 50px #15181a22}
.fv-pop.on{opacity:1;visibility:visible;transform:none}
.fv-pop.fv-up{transform:translateY(6px)}.fv-pop.fv-up.on{transform:none}
.fv-pop h3{margin:0;font-size:15px;font-weight:600;display:flex;align-items:center;gap:10px}
.fv-pop h3 .chip{margin-left:auto}
.fv-pop p{margin:4px 0 12px;color:var(--ink-3);font-size:12.5px}
.fv-rules{display:flex;flex-direction:column}
.fv-rule{display:grid;grid-template-columns:minmax(0,1fr) 84px 92px;gap:14px;align-items:center;padding:8px 0;border-top:1px solid var(--rule-soft);cursor:default}
.fv-rule .n{font-size:13px;font-weight:500}
.fv-rule .n small{display:block;font-size:11px;color:var(--ink-3);font-weight:400;line-height:1.35;margin-top:1px}
.fv-rule .v{font:500 13px/1 "IBM Plex Mono",monospace;text-align:right}
.fv-rule .v small{display:block;white-space:nowrap;font-size:10px;color:var(--ink-3);margin-top:4px}
/* one slider a setting, like the game's own: Normal is the hollow tick, this
   game the knob; right is always harder */
.fv-slide{position:relative;height:14px}
.fv-slide::before{content:"";position:absolute;left:0;right:0;top:6px;height:2px;border-radius:2px;background:var(--rule)}
.fv-slide .nm{position:absolute;top:2px;width:2px;height:10px;margin-left:-1px;background:var(--ink-3);border-radius:1px}
.fv-slide .me{position:absolute;top:2px;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:var(--warn);
  transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.fv-slide .me.easy{background:var(--accent)}
.fv-slide .run{position:absolute;top:6px;height:2px;background:var(--warn);opacity:.55;border-radius:2px}
.fv-slide .run.easy{background:var(--accent)}
.fv-rule:hover .fv-slide .me{transform:scale(1.35)}
.fv-popfoot{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:6px;padding-top:10px;border-top:1px solid var(--rule-soft);font:500 10.5px/1.4 "IBM Plex Mono",monospace;color:var(--ink-3)}
.fv-popfoot .lg{display:inline-flex;align-items:center;gap:6px}
.fv-popfoot .lg i{display:inline-block;width:2px;height:10px;background:var(--ink-3);border-radius:1px}
.fv-popfoot .lg u{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--warn);text-decoration:none}
.fv-career{margin:6px 0 4px;padding-top:12px;border-top:1px solid var(--rule)}
.fv-career h4{margin:0 0 6px;font-size:13px;font-weight:600}
.fv-career .mile{padding:7px 0;font-size:13px}
.fv-phone .fv-sites th:nth-child(n+4),.fv-phone .fv-sites td:nth-child(n+4),.fv-phone .fv-sites .sub{display:none}
.fv-phone .fv-pop{left:0!important;right:0!important;width:auto!important}
.fv-phone .fv-rule{grid-template-columns:minmax(0,1fr) 64px 84px;gap:10px}

/* ===== proposal: Company in three tabs ========================================= */
.fv-tabs-row{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.fv-tabs-row .quiet{font-size:12px}
.fv-strike{text-decoration:line-through;opacity:.55}

/* tooltips: one fixed element, as the board's #tip */
#tip{position:absolute}
"""


# --------------------------------------------------------------------------
# icons (the board's own strokes)
# --------------------------------------------------------------------------
SV = {
    "today": '<circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"></path>',
    "company": '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"></path><path d="M14 10h5a1 1 0 0 1 1 1v10M4 21h17M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1"></path>',
    "supply": '<path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z"></path><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8"></path>',
    "growth": '<path d="M4 18 10 12l4 4 6-7"></path><path d="M15 9h5v5"></path>',
    "map": '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"></path><circle cx="12" cy="10" r="2"></circle>',
    "wiki": '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"></path><path d="M4 20.5V5.5M20 18v3H6.5"></path><path d="M9 8h7M9 11.5h5"></path>',
    "calendar": '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4M8 14h3M13 14h3M8 18h3"></path>',
    "people": '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M15.5 14.5a5 5 0 0 1 6 5"></path>',
    "pin": '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"></path><circle cx="12" cy="10" r="2.2"></circle>',
    "tick": '<path d="M5 12.5l4.5 4.5L19 7"></path>',
    "chev": '<path d="M9 6l6 6-6 6"></path>',
    "sliders": '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"></path><circle cx="16" cy="7" r="2"></circle><circle cx="10" cy="17" r="2"></circle>',
    "week": '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
    "tag": '<path d="M3 12V4h8l10 10-8 8z"></path><path d="M7.5 8.5v.01"></path>',
    "heart": '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"></path>',
    "ext": '<path d="M8 16l8-8M9.5 8H16v6.5"></path>',
    "monitor": '<rect x="3" y="4.5" width="18" height="12" rx="2"></rect><path d="M9 20.5h6M12 16.5v4"></path>',
    "sun": '<circle cx="12" cy="12" r="3.8"></circle><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"></path>',
    "moon": '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z"></path>',
    "yt": '<rect x="2.5" y="5.5" width="19" height="13" rx="4"></rect><path d="M10.2 9.4l4.4 2.6-4.4 2.6z"></path>',
    "bubble": '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z"></path>',
    "discord": '<path d="M7.4 18.4 5.6 9.3c-.2-1.2.5-2.3 1.7-2.6A16.4 16.4 0 0 1 12 6.1c1.6 0 3.2.2 4.7.6 1.2.3 1.9 1.4 1.7 2.6l-1.8 9.1a10.6 10.6 0 0 1-2.8 1.3l-.8-1.5c-.7.1-1.3.1-2 0l-.8 1.5a10.6 10.6 0 0 1-2.8-1.3z"></path><path d="M9.7 12.4v.5M14.3 12.4v.5"></path>',
}


def svg(name: str, extra: str = "") -> str:
    return f'<svg viewBox="0 0 24 24" aria-hidden="true"{extra}>{SV[name]}</svg>'


def esc(text: str) -> str:
    return html.escape(text, quote=True)


# --------------------------------------------------------------------------
# the save the numbers are modelled on (rounded)
# --------------------------------------------------------------------------
DAY, CLOCK, WEEKDAY_NOW = 73, "Wed 11:13", 2          # day 73 is a Wednesday
FIRST_DAY = 36                                         # the arrays below run day 36..72, $k
PROFIT_K = [370, 361, 360, 439, 577, 566, 531, 497, 433, 411, 548, 614, 557, 803, 698, 670, 667, 701, 811,
            827, 814, 535, 355, 463, 681, 748, 1029, 963, 1050, 850, 776, 1102, 1406, 1377, 1408, 1398, 1268]
REVENUE_K = [616, 599, 602, 696, 800, 663, 632, 746, 710, 707, 881, 978, 838, 977, 1056, 1089, 967, 1090, 1227,
             1125, 1082, 1158, 1074, 1203, 1377, 1427, 1532, 1501, 1557, 1593, 1528, 1607, 1937, 2009, 2000, 2052, 1984]
DN = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
DF = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
# weekday profiles: % of a normal day, and the thinnest weekday's weeks of history
PROFILES = {
    "revenue": ([106, 101, 95, 105, 116, 87, 82], 8),
    "profit": ([102, 85, 80, 99, 121, 104, 96], 8),
    "customers": (None, 2),   # the chain's footfall fails the test on this save
}
CLOTHING = [  # hood, name, address, weekday profile, weeks
    ("LM", "HART. Clothing", "57 Fifth Avenue", [98, 92, 82, 96, 100, 118, 114], 6),
    ("HK", "HART. Clothing", "12 Second Avenue", [93, 85, 83, 92, 112, 120, 111], 4),
    ("MT", "HART. Clothing", "20 Second Avenue", [98, 93, 82, 95, 105, 121, 112], 3),
    ("HA", "HART. Clothing", "4 Ocean Crest Road", [100, 92, 84, 90, 111, 120, 106], 5),
    ("MH", "HART. Clothing", "12 Sixth Avenue", [91, 98, 88, 96, 107, 118, 105], 3),
    ("IC", "HART. Clothing", "3 Ninth Avenue", [98, 88, 86, 95, 115, 103, 118], 4),
    ("GD", "HART. Clothing", "18 Fifth Avenue", [89, 91, 86, 93, 112, 116, 117], 3),
]
TYPES = [  # business type, [(weekday, sites peaking there)], sites of the type
    ("Clothing Stores", [("SAT", 5), ("SUN", 2)], 7),
    ("Gyms", [("SUN", 3)], 3),
    ("Law Firm", [("MON", 1)], 1),
    ("Event Planning Agency", [("THU", 1)], 1),
    ("Jewelry Stores", [], 7),
]
PORTFOLIO = [
    ("Clothing Stores", "9 sites · supplied from Import Hub", "$1,007,619", "+1%", "-$135,252", "-$46,119", "-$4,115", "-$23,950", "-$10", "$798,173", "79.2%"),
    ("Jewelry Stores", "11 sites", "$699,672", "—", "-$271,625", "-$40,539", "-$4,952", "-$13,500", "–", "$369,057", "52.7%"),
    ("Law Firms", "1 site", "$214,891", "0%", "$0", "-$94,679", "-$1,040", "-$2,500", "–", "$116,672", "54.3%"),
    ("Gyms", "3 sites", "$39,676", "+0%", "-$1,003", "-$8,140", "-$560", "-$2,700", "–", "$27,272", "68.7%"),
    ("Event Planning Agencies", "1 site", "$21,722", "+1%", "$0", "-$14,370", "-$389", "-$1,100", "–", "$5,864", "27.0%"),
    ("Head office and support", "1 site", "$0", "—", "$0", "-$26,757", "-$402", "$0", "–", "-$27,159", "—"),
]
PRODUCTS = [  # item, revenue/day, units/day, units/week, avg price, stores, peak, swing
    ("Jewelry (Expensive)", "$542,370", "270", "1,909", "$2,008.78", 14, None, 0),
    ("Jewelry (Cheap)", "$225,493", "929", "6,503", "$242.73", 14, None, 0),
    ("Lawyer Fee (Hourly)", "$155,766", "402", "2,811", "$387.48", 1, "Monday", 143),
    ("Clothing (Modern Expensive Female)", "$153,974", "770", "5,385", "$199.97", 7, "Saturday", 37),
    ("Clothing (Modern Expensive Male)", "$153,375", "766", "5,364", "$200.23", 7, "Saturday", 35),
]
RULES = [  # name, what, this game, Normal, unit
    ("Public prices", "cost of wholesale and imported goods, hospital fees and the like", 1.3, 0.7, "×"),
    ("Employee hourly salary", "what staff cost an hour", 1.3, 0.7, "×"),
    ("Bank interest", "interest on loans and investments", 1.3, 0.7, "×"),
    ("Rival attacks", "severity of rival attacks; 0 switches them off entirely", 1.5, 1.0, "×"),
    ("Base customer promotion", "base level of customers without traffic or marketing", 0.1, 0.55, "×"),
    ("Export price", "what exporters pay for factory-made goods", 0.1, 0.65, "×"),
    ("Resale value", "share of an item's or vehicle's value received when selling it", 0.5, 0.75, "×"),
    ("Wholesale urgent fee", "surcharge for rushing a wholesale order", 2.0, 0.2, "×"),
    ("Importer urgent fee", "surcharge for rushing an import", 2.0, 0.75, "×"),
    ("Tax rate", "annual rate from the IRS", 51, 5, "%"),
]
# the settings where a lower number makes the game harder
LOWER_IS_HARDER = {"Base customer promotion", "Export price", "Resale value"}


def fmt_k(v: float) -> str:
    return f"${v / 1000:.2f}M" if v >= 1000 else f"${v:.0f}k"


# --------------------------------------------------------------------------
# shared pieces, in the board's own markup
# --------------------------------------------------------------------------
NAV = [("today", "Today"), ("company", "Company"), ("supply", "Supply"), ("growth", "Growth"), ("map", "Map"), ("wiki", "Wiki")]


def masthead(active: str, flags: str = "", phone: bool = False) -> str:
    items = "".join(
        f'<a href="#{k}" class="{"on" if k == active else ""}">{svg(k)}<span>{label}</span>'
        + ('<span class="feature-new">New</span>' if k in ("map", "wiki") and not phone else "") + "</a>"
        for k, label in NAV)
    return f"""
  <header class="mast" id="mast">
    <div class="brand"><span class="wordmark">HART. YT</span><span class="dot"></span></div>
    <nav class="nav" id="nav" aria-label="Board pages">{items}<i class="ink"></i></nav>
    <div class="clock tr" data-tip="Game time when the save was written: Year 2, day 13 of 60. Day 1 was a Monday."><b>Day {DAY}<i>·</i>{CLOCK}</b><small>YEAR 2 · 26 SITES · 529 STAFF</small>{flags}</div>
    <div class="orb live" aria-hidden="true" style="left:884px;top:0;transform:translate(-17px,-20px)"><i></i><u></u></div>
  </header>"""


def why(text: str) -> str:
    return f'<span class="why" data-tip="{esc(text)}" tabindex="0"><i>?</i></span>'


def sechead(title: str, tip: str = "", quiet: str = "", aside: str = "") -> str:
    return (f'<div class="sechead"><h2>{title}</h2>' + (why(tip) if tip else "")
            + (f'<span class="quiet">{quiet}</span>' if quiet else "")
            + (f'<div class="aside">{aside}</div>' if aside else "") + "</div>")


def seg(items: list[tuple], on: str, attr: str = "") -> str:
    return (f'<span class="seg"{attr}>' + "".join(
        f'<a href="#" data-id="{k}" class="{"on" if k == on else ""}">{label}</a>' for k, label in items) + "</span>")


def subnav(active: str, tabs=("Results", "Products", "Payroll", "Milestones")) -> str:
    return ('<div class="sechead subhead"><nav class="seg" aria-label="Company views">'
            + "".join(f'<a href="#" class="{"on" if t == active else ""}">{t}</a>' for t in tabs) + "</nav></div>")


# ---- the Daily result chart, drawn as drawChart() draws it -------------------
def daily_svg() -> str:
    W, L, R, T, B, H = 1140, 56, 12, 16, 28, 260
    days = list(range(FIRST_DAY + 7, DAY))                  # the last 30 finished days
    net = PROFIT_K[7:]
    rev = REVENUE_K[7:]
    avg = [sum(PROFIT_K[i + 1:i + 8]) / 7 for i in range(len(net))]
    top = 2000.0
    y = lambda v: T + (H - T - B) * (1 - v / top)
    xs = [L + i * (W - L - R) / (len(days) - 1) for i in range(len(days))]
    out = []
    for tick in range(0, 2001, 500):
        label = "$0" if not tick else fmt_k(tick)
        out.append(f'<line x1="{L}" x2="{W - R}" y1="{y(tick):.1f}" y2="{y(tick):.1f}" stroke="var(--rule-soft)"></line>'
                   f'<text x="46" y="{y(tick) + 4:.1f}" text-anchor="end" font-size="10" font-family="IBM Plex Mono" fill="var(--ink-3)">{label}</text>')
    out.append('<g data-series="avg"><polyline points="' + " ".join(f"{x:.1f},{y(v):.1f}" for x, v in zip(xs, avg))
               + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"></polyline></g>')
    out.append('<g data-series="net">' + "".join(
        f'<rect x="{x - 6:.1f}" y="{y(v):.1f}" width="12" height="{y(0) - y(v):.1f}" rx="2" fill="var(--ink-3)" opacity=".45"></rect>'
        for x, v in zip(xs, net)) + "</g>")
    out.append('<g data-series="revenue" class="off"><polyline points="' + " ".join(f"{x:.1f},{y(v):.1f}" for x, v in zip(xs, rev))
               + '" fill="none" stroke="var(--info)" stroke-width="1.6" stroke-linejoin="round"></polyline></g>')
    for i in range(0, len(days), 3):
        out.append(f'<text x="{xs[i]:.1f}" y="252" text-anchor="middle" font-size="10" font-family="IBM Plex Mono" fill="var(--ink-3)">{days[i]}</text>')
    out.append(f'<text x="{xs[-1]:.1f}" y="252" text-anchor="middle" font-size="10" font-family="IBM Plex Mono" fill="var(--ink-3)">{days[-1]}</text>')
    return f'<svg viewBox="0 0 {W} {H}" style="width:100%;height:{H}px;overflow:visible">{"".join(out)}</svg>'


DAILY_READ = '<i></i>Day 72 <b>$1.27M</b> net <b>$1.25M</b> 7-day <b>$1.98M</b> revenue'
DAILY_LEGEND = ('<div class="legend"><a class="on" data-series="avg" href="#"><i style="background:var(--accent)"></i>7-day profit</a>'
                '<a class="on" data-series="net" href="#"><i style="background:var(--ink-3)"></i>Net profit</a>'
                '<a data-series="revenue" href="#"><i style="background:var(--info)"></i>Revenue</a>'
                '<a data-series="goods" href="#"><i style="background:var(--warn)"></i>Goods</a>'
                '<a data-series="wages" href="#"><i style="background:var(--ink-2)"></i>Wages</a></div>')
DAILY_TIP = "Daily profit follows the purchase calendar, so the 7-day line is the trend. Day 43 to 72. Click a legend chip to add or drop a line."


def week_bars(profile: list[int], weeks: int, today: int | None = WEEKDAY_NOW, what: str = "a normal day") -> str:
    """weekHtml(): seven columns either side of a midline; the pill shows on hover."""
    span = max(max(abs(v - 100) for v in profile), 12)
    cols = []
    for k, v in enumerate(profile):
        off = v - 100
        up = off >= 0
        side = "bottom" if up else "top"
        h = max(2, round(min(abs(off) / span, 1) * 44))
        read = f"{DF[k]} <b>{v}%</b> of {what} · from {weeks} weeks"
        cols.append(f'<div class="wd{" now" if k == today else ""}" data-read="{esc(read)}"><div class="track">'
                    f'<i class="bar2{"" if up else " down"}" style="height:{h}px;{side}:50%"></i>'
                    f'<span class="n" style="{side}:calc(50% + {h + 8}px)">{"+" if off > 0 else ""}{off} pts</span>'
                    f'</div><span class="d"><span>{DN[k]}</span><b>{DF[k]}</b></span></div>')
    return f'<div class="week">{"".join(cols)}</div>'


def mini_week(profile: list[int], weeks: int) -> str:
    span = max(max(abs(v - 100) for v in profile), 12)
    rects = "".join(
        f'<rect x="{i * 20 + 4}" y="{(14 - max(1, abs(v - 100) / span * 12)) if v >= 100 else 14:.1f}" width="12" '
        f'height="{max(1, abs(v - 100) / span * 12):.1f}" rx="1.5" fill="{"var(--accent)" if v >= 100 else "var(--warn)"}"></rect>'
        for i, v in enumerate(profile))
    return (f'<svg viewBox="0 0 140 28" style="width:140px;height:28px" aria-hidden="true">'
            f'<line x1="0" x2="140" y1="14" y2="14" stroke="var(--rule)"></line>{rects}</svg>')


def peak_of(profile: list[int]) -> tuple[str, int, str, int]:
    hi = max(range(7), key=lambda k: profile[k])
    lo = min(range(7), key=lambda k: profile[k])
    return DF[hi], profile[hi] - 100, DF[lo], profile[lo] - 100


def sites_table(rows) -> str:
    body = "".join(
        f'<tr><td class="l"><span class="hood">{hood}</span>&nbsp; {name}<span class="sub">Clothing Store · {addr}</span></td>'
        f'<td class="l">{peak_of(p)[0]}</td><td>{max(p) - min(p)} pts</td><td>{w} wks</td><td class="l">{mini_week(p, w)}</td></tr>'
        for hood, name, addr, p, w in rows)
    return ('<table><thead><tr><th class="l">Business</th><th class="l">Peaks</th><th>Swing</th><th>History</th>'
            f'<th class="l" style="width:34%">Across the week</th></tr></thead><tbody>{body}</tbody></table>')


BASIS = {
    "revenue": ("var(--info)", "Company revenue", "every site"),
    "profit": ("var(--accent)", "Company profit", "every site"),
}


def weekday_pane(series: str, on: bool, phone: bool = False) -> str:
    profile, weeks = PROFILES[series]
    colour, what, scope = BASIS[series]
    hi, hv, lo, lv = peak_of(profile)
    rest = f'Peaks <b>{hi}</b> +{hv} · lowest <b>{lo}</b> {lv}'
    return (f'<div class="fv-pane fv-series{" on" if on else ""}" data-series-pane="{series}" data-readzone>'
            f'<div class="fv-top"><span class="fv-basis" style="--fv-s:{colour}" data-tip="{esc(what + " against a normal day, from " + str(weeks) + " weeks of daily results. Today is Wednesday, normally -5%. Yesterday was Tuesday, normally +1%.")}">'
            f'<span class="dot"></span><b>{what}</b> · {scope} · {weeks} weeks</span>'
            f'<span class="readout fv-wd-read fv-readout">{rest}</span></div>'
            f'<div class="fv-week">{week_bars(profile, weeks)}</div></div>')


def types_row(open_type: str = "Clothing Stores", phone: bool = False) -> str:
    chips = []
    for name, peaks, n in TYPES:
        if peaks:
            days = " ".join(f'{d}{f"<i>×{c}</i>" if n > 1 else ""}' for d, c in peaks)
            tip = f"{name}: " + ", ".join(f"{c} of {n} peak {DF[DN.index(d)]}" for d, c in peaks) + ", each from its own revenue."
            chips.append(f'<button type="button" class="fv-type" data-type="{esc(name)}" aria-expanded="{"true" if name == open_type else "false"}" data-tip="{esc(tip)}">{name} <b>{days}</b></button>')
        else:
            chips.append(f'<button type="button" class="fv-type none" data-type="{esc(name)}" aria-expanded="false" data-tip="{esc(name + ": no site has enough history to separate a weekly cycle from noise yet.")}">{name} <b>no cycle yet</b></button>')
    return f'<div class="fv-types"><span class="lab">Each type’s own week</span>{"".join(chips)}</div>'


def daily_section(mode: str, fail: bool = False, phone: bool = False, mark_new: bool = True) -> str:
    """mode: 'day' (by date) or 'weekday'. fail: no series clears the weekly-cycle test."""
    opts = [("30", "30 days"), ("0", "All")] + ([] if fail else [("wd", "By weekday")])
    on = "wd" if mode == "weekday" else "30"
    tools = seg(opts, on, ' data-fv-seg="daily"')
    if mark_new and not fail:
        tools = f'<span data-fv="new · By weekday" style="display:inline-flex">{tools}</span>'
    head = sechead("Daily result", DAILY_TIP, aside=tools)
    day_pane = (f'<div class="fv-pane fv-mode{" on" if mode == "day" else ""}" data-mode="day">'
                f'<div class="readout">{DAILY_READ}</div>{daily_svg()}{DAILY_LEGEND}</div>')
    wd = ""
    if not fail:
        legend = ('<div class="fv-legend"><div class="legend" data-fv-series>'
                  '<a class="on" data-pick="revenue" href="#"><i style="background:var(--info)"></i>Revenue</a>'
                  '<a data-pick="profit" href="#"><i style="background:var(--accent)"></i>Profit</a></div></div>')
        wd = (f'<div class="fv-pane fv-mode{" on" if mode == "weekday" else ""}" data-mode="wd">'
              + weekday_pane("revenue", True, phone) + weekday_pane("profit", False, phone) + legend
              + (f'<div class="fv-l" data-fv="moves · was “site by site”">{types_row()}</div>' if mark_new else types_row())
              + "</div>")
    box = f'<div class="chartbox chart">{day_pane}{wd}</div>'
    sites = ""
    if not fail:
        sites = (f'<div class="fv-sites" data-sites-for="Clothing Stores"{"" if mode == "weekday" else " hidden"}>'
                 + sites_table(CLOTHING) + "</div>")
    return f'<section class="sec rv in" id="secDaily">{head}{box}{sites}</section>'


def rhythm_before() -> str:
    tools = seg([("customers", "Customers"), ("revenue", "Revenue"), ("profit", "Profit")], "customers")
    head = sechead("Weekly rhythm", "Footfall across every shop against a normal day. 12 sites clear the noise test. Today is Wednesday, normally -5%. Yesterday was Tuesday, normally +1%.",
                   aside=tools + '<a class="link" href="#">site by site</a>')
    return (f'<section class="sec rv in" id="secRhythm" data-fv="goes · the whole section">{head}'
            '<p class="quiet">Not enough history to separate a weekly cycle from noise.</p></section>')


def portfolio(rows: int = 6) -> str:
    head = sechead("Portfolio", "A chain is its shops plus the warehouse and factory that mostly supply them.",
                   aside=seg([("pl", "Profit &amp; loss"), ("ops", "Operations")], "pl"))
    cols = ["Business", "Revenue", "Wk / wk", "Goods", "Wages", "Rent", "Marketing", "Theft", "Profit", "Margin"]
    th = "".join(f'<th{" class=\"l\"" if i == 0 else ""}>{c}</th>' for i, c in enumerate(cols))
    body = ""
    for name, sub, *vals in PORTFOLIO[:rows]:
        tds = ""
        for i, v in enumerate(vals):
            cls = ""
            if i == 1 and v.startswith("+"):
                cls = "pos"
            if i == 7:
                cls = "neg" if v.startswith("-") else "pos"
            tds += f'<td class="{cls}">{v}</td>'
        body += (f'<tr class="chain"><td class="l"><span class="chev">{svg("chev", " style=\"width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2\"")}</span>'
                 f'{name}<span class="sub">{sub}</span></td>{tds}</tr>')
    foot = ('<tfoot><tr><td class="l">26 sites</td><td>$1,983,581</td><td></td><td>-$407,880</td><td>-$230,603</td><td>-$11,458</td>'
            '<td>-$43,750</td><td>-$10</td><td class="pos">$1,289,879</td><td></td></tr></tfoot>')
    return (f'<section class="sec rv in" id="secPortfolio">{head}<div style="overflow-x:auto"><table id="portfolio">'
            f'<thead><tr>{th}</tr></thead><tbody>{body}</tbody>{foot}</table></div></section>')


# ---- footer -------------------------------------------------------------------
def footer(legal_extra: str = "") -> str:
    ext = f'<svg class="sf-ic sf-ext" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">{SV["ext"]}</svg>'
    ic = lambda n: f'<svg class="sf-ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">{SV[n]}</svg>'
    return f"""
<footer class="sitefoot">
  <div class="sf-in">
    <div class="sf-rule"><span class="sf-orb"></span></div>
    <div class="sf-cards">
      <div class="sf-card">
        <div class="sf-card-head">
          <span class="sf-badge"><svg class="sf-ic sf-beat" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">{SV["heart"]}</svg></span>
          <div class="sf-card-copy"><span class="sf-card-title">Support the project</span>
            <span class="sf-card-note">A small thank-you keeps this and future Big Ambitions projects going.</span></div>
        </div>
        <a class="sf-cta sf-line" href="#">{ic("heart")}Donate via PayPal</a>
      </div>
    </div>
    <div class="sf-cols">
      <nav class="sf-nav" aria-label="About Big Copilot">
        <div class="sf-col"><h2 class="sf-head">Big Copilot</h2>
          <button type="button" class="sf-link sf-btn">Changelog<span class="feature-new">New</span></button>
          <a class="sf-link" href="#">Game link mod<span class="feature-new">New</span>{ext}</a>
          <a class="sf-link" href="#">Bugs and feedback{ext}</a>
          <a class="sf-link" href="#">Source code{ext}</a></div>
        <div class="sf-col"><h2 class="sf-head">Follow</h2>
          <a class="sf-link" href="#">{ic("yt")}YouTube{ext}</a>
          <a class="sf-link" href="#">{ic("bubble")}r/bigambitions{ext}</a>
          <a class="sf-link" href="#">{ic("discord")}Discord{ext}</a></div>
        <div class="sf-col"><h2 class="sf-head">Big Ambitions · official</h2>
          <a class="sf-link" href="#">Steam store page{ext}</a>
          <a class="sf-link" href="#">Hovgaard Games{ext}</a></div>
      </nav>
      <div class="sf-col sf-theme"><h2 class="sf-head">Theme</h2>
        <div class="sf-seg" role="group" aria-label="Theme">
          <button type="button" class="sf-segbtn" aria-pressed="true" aria-label="Match system">{ic("monitor")}</button>
          <button type="button" class="sf-segbtn" aria-pressed="false" aria-label="Light">{ic("sun")}</button>
          <button type="button" class="sf-segbtn" aria-pressed="false" aria-label="Dark">{ic("moon")}</button>
        </div></div>
    </div>
    <div class="sf-base">
      <div class="sf-who"><span class="sf-mark"><span class="sf-dot"></span>Big Copilot</span>
        <span class="sf-said">Fan-made companion for Big Ambitions. Not affiliated with, endorsed by or supported by Hovgaard Games.</span></div>
      <div class="sf-legal"><span class="sf-meta" data-tip="Board built 24 Sep 2026, 09:32">hart.hsg · saved 24 Sep 2026, 09:31</span><span class="sf-meta">Game build 3682</span>{legal_extra}</div>
    </div>
  </div>
</footer>"""


# ---- the difficulty ------------------------------------------------------------
def setting(unit: str, v: float) -> str:
    return f"{v:g}%" if unit == "%" else f"×{v:g}"


def slider(name: str, v: float, normal: float) -> str:
    harder = (v < normal) if name in LOWER_IS_HARDER else (v > normal)
    reach = min(46.0, abs(math.log(v / normal)) * 18)
    me = 50 + (reach if harder else -reach)
    lo, hi = sorted((50.0, me))
    cls = "" if harder else " easy"
    return (f'<span class="fv-slide" aria-hidden="true"><span class="run{cls}" style="left:{lo:.0f}%;width:{hi - lo:.0f}%"></span>'
            f'<span class="nm" style="left:50%"></span><span class="me{cls}" style="left:{me:.0f}%"></span></span>')


DIFF_TIP = "Custom difficulty: 10 settings harder than Normal. Click for each one."


def diff_chip(foot: bool = False, pop_id: str = "fvDiffPop", open_: bool = True) -> str:
    label = "Custom · 10 harder" if foot else "CUSTOM · 10 HARDER"
    return (f'<button type="button" class="fv-diff" data-pop="{pop_id}" aria-expanded="{"true" if open_ else "false"}" '
            f'aria-controls="{pop_id}" data-tip="{esc(DIFF_TIP)}">{svg("sliders")}<span>{label}</span></button>')


def diff_pop(pop_id: str = "fvDiffPop", style: str = "", up: bool = False, open_: bool = True, career: bool = False) -> str:
    rows = "".join(
        f'<div class="fv-rule" data-tip="{esc(what[0].upper() + what[1:] + ". Normal is " + setting(u, n) + ", so this game is harder.")}">'
        f'<span class="n">{name}<small>{what}</small></span>{slider(name, v, n)}'
        f'<span class="v">{setting(u, v)}<small>Normal {setting(u, n)}</small></span></div>'
        for name, what, v, n, u in RULES)
    extra = ""
    if career:
        extra = ('<div class="fv-career"><h4>Career</h4><div class="miles">'
                 + "".join(f'<div class="mile{" done" if d else ""}"><span class="box">{svg("tick")}</span>{t}<span class="c">{c}</span></div>'
                           for t, c, d in MILES)
                 + '</div><p class="quiet" style="margin:8px 0 0">321,449 goods produced · $0 in tax paid · 0 buildings owned</p></div>')
    title = "This game" if career else "Custom difficulty"
    return (f'<div class="fv-pop{" fv-up" if up else ""}{" on" if open_ else ""}" id="{pop_id}" role="dialog" aria-label="{title}" style="{style}">'
            f'<h3>{title} <span class="chip warn">{"Custom · " if career else ""}10 harder</span></h3>'
            f'<p>Every setting that differs from the game’s Normal preset. Started with $0.</p>'
            f'<div class="fv-rules">{rows}</div>{extra}'
            f'<div class="fv-popfoot"><span class="lg"><i></i> Normal <u></u> this game</span><span>right is harder</span></div></div>')


MILES = [("Every business type run", "5 / 24", False), ("Rivals taken over", "0 / 4", False),
         ("Personal goals done", "44 done", False), ("Diplomas earned", "5 / 5", True)]
MILES_BEFORE = [("Every business type run", "5 / 24", False), ("Every building owned", "0 / 885", False),
                ("Rivals taken over", "0 / 4", False), ("Personal goals done", "44 done", False), ("Diplomas earned", "5 / 5", True)]


def miles_html(rows, cut_building: bool = False) -> str:
    out = []
    for t, c, d in rows:
        row = f'<div class="mile{" done" if d else ""}"><span class="box">{svg("tick")}</span>{t}<span class="c">{c}</span></div>'
        if cut_building and t == "Every building owned":
            row = f'<div class="fv-b" data-fv="goes · becomes a total">{row}</div>'
        out.append(row)
    return f'<div class="miles">{"".join(out)}</div>'


def rules_chips() -> str:
    return ('<div class="rules">' + "".join(
        f'<span data-tip="{esc(what[0].upper() + what[1:] + ". Normal is " + setting(u, n) + ", so this game is harder.")}" tabindex="0">{name}<b>{setting(u, v)}</b></span>'
        for name, what, v, n, u in RULES) + "</div>")


# ---- Next moves -------------------------------------------------------------------
def move(card_id: str, badge: str, live: bool, icon: str, title: str, what: str, go: str, mark: str = "") -> str:
    card = (f'<a class="move rv in" href="#" id="{card_id}"{' style="flex:1"' if mark else ""}><span class="soon{" live" if live else ""}">{badge}</span>'
            f'<span class="ic">{svg(icon)}</span><b>{title}</b><span class="what">{what}</span><span class="go">{go}</span></a>')
    return f'<div data-fv="{mark}" style="display:flex;flex-direction:column">{card}</div>' if mark else card


STAFF_CARD = ("optimizeStaffingCard", "DATA COMPLETE", True, "people", "Optimize staffing",
              "Demand data complete at [GD] HART. Clothing and 8 more: switch to the demand plan.",
              "Opens [GD] HART. Clothing › Staffing")
FIND_CARD = ("findLocationCard", "185 VACANT", True, "pin", "Find a location",
             "185 vacant retail units right now. Best foot traffic: 30 Seventh Avenue, The Hamptons (52).",
             "Opens the finder on the map")
MOVES_TIP_BEFORE = ("Tools for the decisions you make each week, each one opening the page that does the work. Plan imports opens the "
                    "change checklist on Supply; Optimize staffing opens Staffing on the shop with the most work to save, a week to copy "
                    "into BizMan › Schedule; Find a location opens the finder on the Map.")
MOVES_TIP_DROPPED = ("Tools for the decisions you make each week, each one opening the page that does the work. Optimize staffing opens "
                     "Staffing on the shop with the most work to save, a week to copy into BizMan › Schedule; Find a location opens the finder on the Map.")
PLAN_STATES = [  # badge, live, sentence
    ("1 TO CHANGE", True, "<b>Metal Band</b> at Import Hub: Smart Delivery stock 15,200 → 20,200."),
    ("4 TO CHANGE", True, "<b>4 settings</b> at Import Hub and Jewelry Distrib., starting with Metal Band."),
    ("ALL TICKED", False, "You ticked all 4. A change the game has taken leaves the list with the next save."),
    ("ALL SET", False, "Every import and top-up covers its week."),
]


def plan_card(state: int, mark: str = "") -> str:
    badge, live, text = PLAN_STATES[state]
    return move("planImportsCard", badge, live, "calendar", "Plan imports", text, "Opens the change checklist", mark)


def moves(cards: list[str], tip: str, two: bool = False) -> str:
    return (f'<section class="sec rv in" id="secMoves">{sechead("Next moves", tip)}'
            f'<div class="moves{" fv-moves2" if two else ""}">{"".join(cards)}</div></section>')


def findings_tail() -> str:
    """The last rows of Needs attention, so the cards sit where they sit on Today."""
    rows = [("opp", "GD", "Import Hub", "572,160 units of Battery, Capacitors, Copper Clad Laminate", "572,160", "units"),
            ("opp", "", "2 shops", "Paper Bag top-up target of 2,500 is 31x daily sales in 2 shops", "31x", "daily sales")]
    body = "".join(
        f'<a class="find {sev}" href="#"><span class="mark"></span><span class="site">'
        + (f'<span class="hood">{hood}</span>' if hood else "") + f'{site}</span><span class="what">{what}</span>'
        f'<span class="amt">{amt}<small>{small}</small></span><span class="go">{svg("chev")}</span></a>'
        for sev, hood, site, what, amt, small in rows)
    return (f'<section class="sec rv in" id="alertSection" style="margin-top:28px"><div class="finds">{body}</div>'
            '<p class="quiet" style="margin:12px 0 0">19 smaller · $139,088/day · 18 switched off <a class="link" href="#">show</a></p></section>')


# --------------------------------------------------------------------------
# the artboards
# --------------------------------------------------------------------------
def rhythm_before_board() -> str:
    return masthead("company") + subnav("Results") + daily_section("day", fail=True, mark_new=False) + rhythm_before() + portfolio()


def rhythm_after_weekday() -> str:
    return masthead("company") + subnav("Results") + daily_section("weekday") + portfolio()


def rhythm_after_day() -> str:
    return masthead("company") + subnav("Results") + daily_section("day") + portfolio()


def rhythm_no_cycle() -> str:
    return (masthead("company") + subnav("Results")
            + '<p class="fv-state">When no series clears the weekly-cycle test: no By weekday, no sentence</p>'
            + daily_section("day", fail=True).replace('class="sec rv in"', 'class="rv in"') + portfolio(3))


def rhythm_phone() -> str:
    sec = daily_section("weekday", phone=True)
    return masthead("company", phone=True) + subnav("Results") + sec


# ---- the three places a peak is named -----------------------------------------
PRODUCTS_TIP_BEFORE = ("Revenue and units are yesterday summed over every store that sells the line; units a week is the last seven days, "
                       "and stores is how many carry it. Peaks names the weekday that sells best and the points between best and worst day.")


def products_table(after: bool) -> str:
    rows = ""
    for item, rev, units, week, price, stores, peak, swing in PRODUCTS:
        tip = (f"Units sold across {stores} store{'s' if stores > 1 else ''}, last 2 weeks: peaks {peak}, {swing} points between best and worst day"
               if after and peak else f"Peaks {peak}, {swing} points between best and worst day" if peak
               else "No weekly cycle clears the noise test")
        rows += (f'<tr><td class="l">{item}</td><td>{units}</td><td>{stores}</td>'
                 f'<td class="{"pos" if peak else ""}" data-tip="{esc(tip)}">{f"{peak[:3]} +{swing}" if peak else "—"}</td></tr>')
    th_peak = ('<th data-tip="The weekday each product sells most units, across every store that carries it, from the last 2 weeks">Peaks · units</th>'
               if after else "<th>Peaks</th>")
    return (f'<table><thead><tr><th class="l">Product</th><th>Units / day</th><th>Stores</th>{th_peak}</tr></thead>'
            f'<tbody>{rows}</tbody></table>')


def where(icon: str, text: str) -> str:
    return f'<div class="fv-where">{svg(icon)}{text}</div>'


def peaks_before() -> str:
    mt = CLOTHING[2]
    c1 = (where("company", "Company › Results › Weekly rhythm")
          + sechead("Weekly rhythm", aside=seg([("c", "Customers"), ("r", "Revenue"), ("p", "Profit")], "c"))
          + '<p class="quiet">Not enough history to separate a weekly cycle from noise.</p>'
          + '<p class="fv-say">Says: <b>no weekly cycle</b></p>')
    c2 = (where("week", "Site page › [MT] HART. Clothing › Its week")
          + sechead("Its week", quiet="peaks Saturday, 39 points between best and worst")
          + f'<div class="chartbox" style="padding-bottom:16px">{week_bars(mt[3], mt[4], what="a normal day here")}</div>'
          + '<p class="fv-say">Says: <b>Saturday</b></p>')
    c3 = (where("tag", "Company › Products")
          + sechead("Products", PRODUCTS_TIP_BEFORE, quiet="by revenue yesterday") + products_table(False)
          + '<p class="fv-say">Says: <b>Saturday</b> for clothes, <b>Monday</b> for the law firm</p>')
    return masthead("company") + f'<div class="fv-three"><div>{c1}</div><div>{c2}</div><div>{c3}</div></div>'


def peaks_after() -> str:
    mt = CLOTHING[2]
    p, w = PROFILES["revenue"]
    hi, hv, lo, lv = peak_of(p)
    c1 = (where("company", "Company › Results › Daily result › By weekday")
          + sechead("Daily result", aside=seg([("30", "30 days"), ("0", "All"), ("wd", "By weekday")], "wd"))
          + '<div class="chartbox" data-readzone>'
          + f'<div class="fv-top"><span class="fv-basis" data-fv="new · names its series" style="--fv-s:var(--info)"><span class="dot"></span><b>Company revenue</b> · every site · {w} weeks</span></div>'
          + f'<div class="fv-week">{week_bars(p, w)}</div>'
          + '<div class="fv-types" style="margin-top:8px"><span class="lab">Each type’s own week</span>'
          + '<span class="fv-type">Clothing Stores <b>SAT<i>×5</i> SUN<i>×2</i></b></span><span class="fv-type">Law Firm <b>MON</b></span></div></div>'
          + f'<p class="fv-say">Says: <b>{hi}</b>, for the whole company over {w} weeks, most of them before the clothing shops opened; the shops’ own Saturday sits beside it</p>')
    c2 = (where("week", "Site page › [MT] HART. Clothing › Its week")
          + sechead("Its week", quiet="peaks Saturday, 39 points between best and worst")
          + '<div class="chartbox" style="padding-bottom:16px" data-readzone>'
          + f'<div class="fv-top"><span class="fv-basis" data-fv="new · names its series" style="--fv-s:var(--info)"><span class="dot"></span><b>This shop’s revenue</b> · {mt[4]} weeks</span></div>'
          + f'{week_bars(mt[3], mt[4], what="a normal day here")}</div>'
          + '<p class="fv-say">Says: <b>Saturday</b>, for this shop</p>')
    c3 = (where("tag", "Company › Products")
          + sechead("Products", PRODUCTS_TIP_BEFORE.replace("Peaks names the weekday that sells best",
                                                             "Peaks names the weekday that sells the most units, from the last 2 weeks,"),
                    quiet="by revenue yesterday")
          + f'<div data-fv="new · header says units">{products_table(True)}</div>'
          + '<p class="fv-say">Says: <b>Saturday</b> for clothes, in units sold</p>')
    return masthead("company") + f'<div class="fv-three"><div>{c1}</div><div>{c2}</div><div>{c3}</div></div>'


# ---- Next moves --------------------------------------------------------------------
def moves_before() -> str:
    before = move("planImportsCard", "CHECKLIST", False, "calendar", "Plan imports",
                  "Plan weekly orders and get a checklist of settings to enter in-game.", "Opens the change checklist",
                  "goes · static text and badge")
    return masthead("today") + findings_tail() + moves([before, move(*STAFF_CARD), move(*FIND_CARD)], MOVES_TIP_BEFORE) + footer()


def moves_count() -> str:
    states = "".join(plan_card(k) for k in (1, 2, 3))
    return (masthead("today") + findings_tail()
            + moves([plan_card(0, "new · live count"), move(*STAFF_CARD), move(*FIND_CARD)], MOVES_TIP_BEFORE)
            + '<p class="fv-state">The same card, other days</p>'
            + f'<div class="moves">{states}</div>' + footer())


def moves_dropped() -> str:
    return (masthead("today") + findings_tail()
            + f'<div data-fv="goes · Plan imports card">'
            + moves([move(*STAFF_CARD), move(*FIND_CARD)], MOVES_TIP_DROPPED, two=True) + "</div>" + footer())


def moves_phone() -> str:
    return masthead("today", phone=True) + moves([plan_card(0), move(*STAFF_CARD), move(*FIND_CARD)], MOVES_TIP_BEFORE)


# ---- Milestones and the difficulty ---------------------------------------------------
GOALS_TIP = ("Easy, Normal and Hard are the game's presets, and a custom game sets each slider itself. The house rules below are "
             "the settings that differ from Normal; hover one for Normal's value.")


def milestones_before() -> str:
    head = ('<div data-fv="moves · to the difficulty chip">'
            + sechead("Milestones", GOALS_TIP, quiet="career totals · playing on custom settings, 10 settings harder than Normal, started on $0")
            + "</div>")
    return (masthead("company") + subnav("Milestones")
            + f'<section class="sec rv in" id="secGoals">{head}{miles_html(MILES_BEFORE, cut_building=True)}'
            + '<p class="quiet">321,449 goods produced · $0 in tax paid</p>'
            + f'<div data-fv="moves · to the difficulty chip">{rules_chips()}</div></section>' + footer())


def goals_after(mark: bool = True) -> str:
    owned = '<span data-fv="new · was a goal" style="display:inline-block">0 buildings owned</span>' if mark else "0 buildings owned"
    return (f'<section class="sec rv in" id="secGoals">{sechead("Milestones", quiet="career totals")}{miles_html(MILES)}'
            f'<p class="quiet"><span>321,449 goods produced · $0 in tax paid · </span>{owned}</p></section>')


def milestones_after() -> str:
    return masthead("company") + subnav("Milestones") + goals_after() + footer()


def diff_mast() -> str:
    flags = f'<small class="fv-diffline"><span class="fv-b" data-fv="new · the chip" style="display:inline-block">{diff_chip()}</span></small>'
    pop = diff_pop(style="right:0;top:118px")
    return (masthead("today", flags=flags)
            + '<div class="kpis" style="margin-top:36px;opacity:.35">'
            + "".join(f'<div class="kpi"><span class="lab">{l}</span><span class="v">{v}</span></div>'
                      for l, v in (("Profit yesterday", "$1,268,481"), ("Revenue yesterday", "$1,983,581"),
                                   ("Cash on hand", "$3,667,464"), ("Fixed cost / day", "$207,883")))
            + "</div>" + pop)


def diff_foot() -> str:
    chip = f'<span data-fv="new · the chip" style="display:inline-flex">{diff_chip(foot=True)}</span>'
    pop = diff_pop(style="right:0;bottom:92px", up=True)
    return masthead("company") + subnav("Milestones") + goals_after(False) + footer(chip) + pop


def diff_phone() -> str:
    pop = diff_pop(style="bottom:120px", up=True)
    return masthead("today", phone=True) + footer(diff_chip(foot=True)) + pop


def company_tabs() -> str:
    flags = f'<small class="fv-diffline">{diff_chip()}</small>'
    pop = diff_pop(style="right:0;top:118px", career=True)
    tabs = ('<div class="sechead subhead fv-tabs-row"><nav class="seg" aria-label="Company views">'
            '<a href="#" class="on">Results</a><a href="#">Products</a><a href="#" data-fv="new · R14 Staff">Staff</a></nav>'
            '<span class="quiet">was: Results · Products · Payroll · <span class="fv-strike">Milestones</span></span></div>')
    return masthead("company", flags=flags) + tabs + daily_section("day", mark_new=False) + pop


# --------------------------------------------------------------------------
# behaviour: every artboard carries all of it; each part is inert where its
# elements are absent
# --------------------------------------------------------------------------
WIRE = r"""
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const board = $('.board');
    if (!board || board.dataset.wired) return; board.dataset.wired = '1';
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && (a.getAttribute('href') || '#').charAt(0) === '#') e.preventDefault(); });

    // the nav underline sits under the page you are on
    const nav = $('#nav');
    const ink = () => { const a = $('a.on', nav); if (!nav || !a) return; const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect();
      nav.style.setProperty('--nx', (r.left - n.left) + 'px'); nav.style.setProperty('--nw', r.width + 'px'); };
    setTimeout(ink, 60); setTimeout(ink, 700);

    // tooltips: one element, placed under the hovered [data-tip], as wireTips() does
    const tip = $('#tip');
    $$('[data-tip]').forEach(el => {
      el.addEventListener('mouseenter', () => { if (!tip) return; tip.textContent = el.dataset.tip;
        const r = el.getBoundingClientRect(), b = board.getBoundingClientRect();
        let x = r.left - b.left, y = r.bottom - b.top + 8;
        tip.classList.add('on'); const w = tip.offsetWidth, h = tip.offsetHeight;
        if (x + w > b.width - 12) x = Math.max(12, r.right - b.left - w);
        if (y + h > b.height - 8) y = r.top - b.top - h - 8;
        tip.style.left = x + 'px'; tip.style.top = y + 'px'; });
      el.addEventListener('mouseleave', () => tip && tip.classList.remove('on'));
    });

    // Daily result: 30 days / All / By weekday
    $$('[data-fv-seg="daily"] a').forEach(a => a.addEventListener('click', () => {
      const sec = a.closest('section') || board;
      $$('[data-fv-seg="daily"] a', sec).forEach(x => x.classList.toggle('on', x === a));
      const wd = a.dataset.id === 'wd';
      $$('.fv-mode', sec).forEach(p => p.classList.toggle('on', (p.dataset.mode === 'wd') === wd));
      const sites = $('.fv-sites', sec); if (sites) sites.hidden = !wd || !$('.fv-type[aria-expanded="true"]', sec);
    }));
    // the weekday lens reads one series at a time
    $$('[data-fv-series] a').forEach(a => a.addEventListener('click', () => {
      const sec = a.closest('section') || board;
      $$('[data-fv-series] a', sec).forEach(x => x.classList.toggle('on', x === a));
      $$('.fv-series', sec).forEach(p => p.classList.toggle('on', p.dataset.seriesPane === a.dataset.pick));
    }));
    // the daily legend adds and drops lines
    $$('.legend a[data-series]').forEach(a => a.addEventListener('click', () => {
      const g = $('g[data-series="' + a.dataset.series + '"]', a.closest('.chartbox')); if (!g) return;
      a.classList.toggle('on'); g.classList.toggle('off', !a.classList.contains('on'));
    }));
    // a type opens its sites; only clothing has a table on the canvas
    $$('button.fv-type').forEach(b => b.addEventListener('click', () => {
      const sec = b.closest('section') || board, open = b.getAttribute('aria-expanded') !== 'true';
      $$('button.fv-type', sec).forEach(x => x.setAttribute('aria-expanded', 'false'));
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      const sites = $('.fv-sites', sec); if (sites) sites.hidden = !(open && b.dataset.type === 'Clothing Stores');
    }));
    // a weekday reads out on the line reserved for it
    $$('[data-readzone]').forEach(zone => {
      const out = $('.fv-readout', zone); if (!out) return; const rest = out.innerHTML;
      $$('[data-read]', zone).forEach(el => el.addEventListener('mouseenter', () => { out.innerHTML = el.dataset.read; }));
      zone.addEventListener('mouseleave', () => { out.innerHTML = rest; });
    });
    // the difficulty chip opens its popover; a click elsewhere closes it
    $$('.fv-diff').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation(); const pop = document.getElementById(b.dataset.pop); if (!pop) return;
      const on = !pop.classList.contains('on'); pop.classList.toggle('on', on); b.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (tip) tip.classList.remove('on');
    }));
    document.addEventListener('click', (e) => { if (e.target.closest('.fv-pop')) return;
      $$('.fv-pop.on').forEach(p => { p.classList.remove('on'); $$('[data-pop="' + p.id + '"]').forEach(b => b.setAttribute('aria-expanded', 'false')); }); });
"""

LOGIC = ("class Component extends DCLogic {\n"
         "  renderVals() { return { theme: (this.props.dark ?? true) ? 'dark' : 'light', marks: (this.props.marks ?? true) ? 'fv-marks' : '' }; }\n"
         "  componentDidMount() { setTimeout(() => {" + WIRE + "  }, 0); }\n}")

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>__TITLE__</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="__FONTS__">
<style>__CSS__</style>
</helmet>
<div class="board {{theme}} {{marks}}__EXTRA__" style="width: __W__px; height: __H__px;">
<div class="wrap">__BODY__
</div>
<div id="tip" role="tooltip"></div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='__PROPS__'>
__LOGIC__
</script>
</body>
</html>
"""

PREVIEW = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__TITLE__</title>
<link rel="stylesheet" href="__FONTS__"><style>__CSS__</style></head>
<body><div class="board __THEME__ fv-marks__EXTRA__" style="width:__W__px;min-height:__H__px"><div class="wrap">__BODY__
</div><div id="tip" role="tooltip"></div></div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""

D, P = 1440, 390
# file, title, builder, width, height, row, column
BOARDS = [
    ("RhythmBefore.dc.html", "Before · Company › Results", rhythm_before_board, D, 1290, 0, 0),
    ("Main.dc.html", "After · By weekday", rhythm_after_weekday, D, 1630, 0, 1),
    ("RhythmAfterDay.dc.html", "After · by day, the default", rhythm_after_day, D, 1180, 0, 2),
    ("RhythmNoCycle.dc.html", "After · no cycle yet", rhythm_no_cycle, D, 1040, 0, 3),
    ("RhythmPhone.dc.html", "After · phone", rhythm_phone, P, 1100, 0, 4),
    ("PeaksBefore.dc.html", "Before · three places name a peak", peaks_before, D, 560, 1, 0),
    ("PeaksAfter.dc.html", "After · each names its series", peaks_after, D, 650, 1, 1),
    ("MovesBefore.dc.html", "Before · Today › Next moves", moves_before, D, 1060, 2, 0),
    ("MovesCount.dc.html", "Option A · a live count", moves_count, D, 1310, 2, 1),
    ("MovesDropped.dc.html", "Option B · the card goes", moves_dropped, D, 1040, 2, 2),
    ("MovesPhone.dc.html", "Option A · phone", moves_phone, P, 840, 2, 3),
    ("MilestonesBefore.dc.html", "Before · Company › Milestones", milestones_before, D, 1040, 3, 0),
    ("MilestonesAfter.dc.html", "After · Milestones", milestones_after, D, 940, 3, 1),
    ("DiffMast.dc.html", "Placement 1 · masthead build line", diff_mast, D, 850, 3, 2),
    ("DiffFoot.dc.html", "Placement 2 · footer stamp", diff_foot, D, 940, 3, 3),
    ("DiffPhone.dc.html", "Placement 2 · phone", diff_phone, P, 1160, 3, 4),
    ("CompanyTabs.dc.html", "Proposal · Company in three tabs", company_tabs, D, 1080, 4, 0),
]
ROW_TITLES = [
    "1 · Weekly rhythm folds into Daily result",
    "1b · Where a peak is named",
    "2 · The Plan imports card",
    "3 · Milestones, and where the difficulty lives",
    "Proposal, not a decision · Company in three tabs",
]
STICKIES = [
    ("Removed: the Weekly rhythm section and its heading; its sentence \"Not enough history to separate a weekly cycle from noise\" "
     "(the By weekday option is simply absent until a series clears the test); the separate Customers / Revenue / Profit switch "
     "(now the chart's legend chips; a series that fails the test gets no chip). Moved: \"site by site\" becomes the type chips "
     "under the bars, each opening the same table for its type; today's and yesterday's weekday reading moves into the ? on the "
     "series line. Kept: the bars, pills, today's outline, the table."),
    ("Nothing removed here: labels only. Every weekday chart says which series and how many weeks it reads, so Friday (company "
     "revenue over 8 weeks, most of them before the clothing shops opened), Saturday (one shop's revenue over 3 weeks) and "
     "Sat +37 (clothes, in units) stop looking like three answers to one question. The type chips on the company chart show the shops' own Saturday beside the company's Friday."),
    ("Option A removes: the static sentence \"Plan weekly orders and get a checklist of settings to enter in-game.\" and the "
     "CHECKLIST badge; the card now says the first change and counts what is left, like its two siblings. Option B removes: the "
     "whole Plan imports card, and its sentence in the Next moves ?; Supply › Orders is unchanged. Caution for B: this save's one "
     "change (Metal Band, Smart Delivery stock) is not a Today finding, so B would hide it from Today."),
    ("Removed from Milestones: \"Every building owned 0 / 885\" as a goal (it becomes \"0 buildings owned\" in the totals line, "
     "or goes entirely: your call); the ten difficulty chips; the head's \"playing on custom settings, 10 settings harder than "
     "Normal, started on $0\"; the ? about presets. All but the buildings move into the difficulty chip's popover. On a phone the "
     "masthead's clock is hidden (under 500 px), so placement 1 needs the footer as its phone fallback."),
    ("A proposal only. After the folds, Milestones is four rows and a line. It could join the difficulty popover as \"Career\", "
     "and Payroll become Staff (R14), leaving Results · Products · Staff. Removes the Milestones tab; nothing else."),
]
TIPS = {
    "Main.dc.html": "Try it: 30 days / All / By weekday switches the chart; Revenue and Profit pick the series; a type chip opens that type's sites. Hover a weekday: it reads out on the series line.",
    "DiffMast.dc.html": "Hover the chip for the one-line tooltip; click it to open and close the detail. Hover a setting for its tooltip.",
}


def css(theme: str) -> str:
    base = board_css() + FV_CSS
    if theme == "light":
        base = base.replace("body{margin:0;background:#0d100f}", "body{margin:0;background:#eef0ea}")
    return base


def build(preview_dir: str | None = None) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    boards, order, notes = {}, [], {}
    col_x: dict[tuple, int] = {}
    row_h = {}
    for name, title, builder, w, h, row, col in BOARDS:
        row_h[row] = max(row_h.get(row, 0), h)
    row_y, y = {}, 0
    for row in sorted(row_h):
        row_y[row] = y
        y += row_h[row] + 420
    for name, title, builder, w, h, row, col in BOARDS:
        x = 0
        for n2, _, _, w2, _, r2, c2 in BOARDS:
            if r2 == row and c2 < col:
                x += w2 + 120
        body = builder()
        extra = " fv-phone" if w == P else ""
        props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"},
                 "marks": {"editor": "boolean", "default": True, "section": "Review"},
                 "$preview": {"width": w, "height": h}}
        page = (PAGE.replace("__TITLE__", "Fold views: " + title).replace("__FONTS__", FONTS.replace("&", "&amp;"))
                .replace("__CSS__", css("dark")).replace("__W__", str(w)).replace("__H__", str(h)).replace("__EXTRA__", extra)
                .replace("__BODY__", body).replace("__PROPS__", json.dumps(props, separators=(",", ":"), ensure_ascii=False))
                .replace("__LOGIC__", LOGIC))
        (ROOT / name).write_text(page, encoding="utf-8", newline="\n")
        if preview_dir:
            out = Path(preview_dir)
            out.mkdir(parents=True, exist_ok=True)
            for theme in ("dark", "light"):
                (out / f"{name.split('.')[0]}-{theme}.html").write_text(
                    PREVIEW.replace("__TITLE__", title).replace("__FONTS__", FONTS.replace("&", "&amp;")).replace("__CSS__", css(theme))
                    .replace("__THEME__", theme).replace("__EXTRA__", extra).replace("__W__", str(w)).replace("__H__", str(h))
                    .replace("__BODY__", body).replace("__WIRE__", WIRE),
                    encoding="utf-8", newline="\n")
        boards[name] = {"x": x, "y": row_y[row], "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name)
    for row, text in enumerate(ROW_TITLES):
        width = sum(w + 120 for _, _, _, w, _, r, _ in BOARDS if r == row) - 120
        notes[f"row{row}"] = {"x": 0, "y": row_y[row] - 300, "text": text, "kind": "title1", "maxW": width}
        notes[f"removed{row}"] = {"x": -700, "y": row_y[row], "w": 580, "maxH": 520, "text": STICKIES[row],
                                  "fill": "purple" if row == 4 else "orange"}
    for name, text in TIPS.items():
        b = boards[name]
        notes["try-" + name.split(".")[0].lower()] = {"x": b["x"], "y": b["y"] + b["h"] + 40, "w": 560, "maxH": 160, "text": text, "fill": "green"}
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Fold low-value views",
             "launch": {"view": "canvas"}, "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards")


if __name__ == "__main__":
    args = sys.argv[1:]
    build(args[args.index("--preview") + 1] if "--preview" in args else None)
