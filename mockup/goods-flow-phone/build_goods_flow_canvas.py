"""Generates the goods-flow-on-a-phone canvas: project/*.dc.html and project/canvas.json.

Issue #148 (UX audit U1): Supply's diagram view, svg#flow drawn by drawFlow() in the
TEMPLATE board script of ba_dashboard.py, is a 1,184-unit artboard scaled to its box, so on a
390 px phone it shrinks to about 294 px and every label is a few pixels tall. This canvas
explores three phone presentations and recommends one; NOTES.md beside this file carries the
recommendation, the questions for Peter and the porting map.

The company on the artboards is HART. YT on day 80 (33 sites): names, hoods, stock held and
units a day are read from that save's supply graph. The problem state (Metal Band stalled at
Factory Jewelry) is staged from the UX audit's Feed the factories screenshot of the same save.

The board's own stylesheet is borrowed from mockup/revamp/build_canvas.py so the two never
drift; every class added here carries the gf- prefix the port would use.

The canvas is published at https://claude.ai/artifact/E9vHwuVKdao6mRKa8oPQ57.

Never hand-edit project/: change this and rerun. `--preview` also writes plain HTML copies
into _preview/ (both themes) for screenshots in a browser.
"""
from __future__ import annotations

import html
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE / "project"
sys.path.insert(0, str(HERE.parent / "revamp"))
from build_canvas import CSS as BOARD_CSS  # noqa: E402

CREATED_AT = "2026-09-25T16:00:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"

# --------------------------------------------------------------------------
# the canvas's own stylesheet, all under gf-
# --------------------------------------------------------------------------
GF_CSS = r"""
.board.gf-board{min-width:0;min-height:0;padding:0;overflow:hidden;background:var(--ground)}
.gf-off{display:none!important}
.board svg.i{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}

/* the phone page around the diagram: masthead, icon nav, Supply's head ------- */
.gf-page{padding:0 16px 28px}
.gf-mast{display:flex;align-items:center;justify-content:space-between;height:64px}
.gf-brand{font-size:24px;font-weight:800;letter-spacing:-.045em;line-height:1}
.gf-brand i{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--accent);margin-left:3px}
.gf-ib{width:44px;height:44px;border-radius:10px;border:1px solid var(--rule);background:var(--surface);color:var(--ink-2);display:grid;place-items:center;cursor:pointer}
.gf-nav{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;padding:2px 0 10px;border-bottom:1px solid var(--rule)}
.gf-nav a{height:40px;border-radius:9px;display:grid;place-items:center;color:var(--ink-3)}
.gf-nav a.on{background:var(--accent-soft);color:var(--accent)}
.gf-nav svg.i{width:18px;height:18px}
.gf-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px;margin-top:16px;padding:2px;border:1px solid var(--rule);border-radius:9px;background:var(--surface)}
.gf-tabs a{display:flex;align-items:center;justify-content:center;gap:6px;height:40px;border-radius:7px;font-size:12px;font-weight:500;color:var(--ink-2);text-decoration:none}
.gf-tabs a.on{background:var(--ink);color:var(--ground)}
.gf-n{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--neg);color:#fff;font:600 10px/1 "IBM Plex Mono",monospace}
.gf-n.zero{background:var(--accent-soft);color:var(--accent);padding:0}
.gf-n.zero svg.i{width:10px;height:10px;stroke-width:2.6}
.gf-tools{display:flex;align-items:center;justify-content:space-between;margin-top:10px}
.gf-seg{display:inline-flex;border:1px solid var(--rule);border-radius:9px;padding:2px;gap:2px;background:var(--surface)}
.gf-seg a{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 11px;border-radius:7px;font-size:12px;font-weight:500;color:var(--ink-2);text-decoration:none}
.gf-seg a.ico{width:40px;padding:0}
.gf-seg a.on{background:var(--ink);color:var(--ground)}
.gf-verdict{margin:18px 0 12px;font-size:13px;line-height:1.45;color:var(--ink-2)}
.gf-verdict b{color:var(--ink);font-weight:600}

/* the diagram's box ---------------------------------------------------------- */
.gf-box{border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft);padding:12px}
.gf-lab{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}

/* worth a look: the flagged sites, one tap each ------------------------------- */
.gf-look{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
.gf-look .row{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin-right:-12px;padding-right:12px}
.gf-chipb{display:inline-flex;align-items:center;gap:7px;min-height:34px;padding:0 11px 0 9px;border-radius:17px;border:1px solid var(--rule);background:var(--ground);color:var(--ink);font-size:12px;font-weight:500;text-decoration:none;white-space:nowrap}
.gf-chipb small{font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gf-chipb .d{width:8px;height:8px;border-radius:50%;background:var(--warn);flex:none}
.gf-chipb .d.bad{background:var(--neg)}
.gf-chipb:hover{border-color:var(--ink-3)}

/* the chain: stages top to bottom, a rail naming each, pipes between ---------- */
.gf-band{display:grid;grid-template-columns:16px minmax(0,1fr);gap:8px;align-items:stretch}
.gf-rail{writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;font:500 9.5px/16px "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);white-space:nowrap;border-left:1px solid var(--rule-soft)}
.gf-cards{display:flex;justify-content:center;gap:8px}
.gf-gut{display:block;margin-left:24px;overflow:visible}
.gf-gut path{fill:none;stroke:var(--ink-3);stroke-opacity:.5;stroke-linecap:round}
.gf-gut path.weekly{stroke-dasharray:5 6}
.gf-gut path.lit{stroke:var(--accent);stroke-opacity:1}
.gf-gut path.warnp{stroke:var(--warn);stroke-opacity:.95}
.gf-gut path.dim{stroke-opacity:.14}

/* a site: kind icon, hood, dot; name; what it holds or what the pipe carries -- */
.gf-node{position:relative;display:flex;flex-direction:column;gap:5px;min-height:76px;padding:9px 10px 9px;border-radius:9px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);text-decoration:none;text-align:left;font:inherit;cursor:pointer;box-sizing:border-box;transition:border-color .15s,transform .2s cubic-bezier(.34,1.56,.64,1)}
.gf-node:hover{border-color:var(--ink-3)}
.gf-node:active{transform:scale(.97)}
.gf-node:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.gf-node .top{display:flex;align-items:center;gap:6px;color:var(--ink-3)}
.gf-node .top svg.i{width:14px;height:14px}
.gf-node .hood{height:18px;min-width:22px;font-size:9.5px}
.gf-node .gf-d{margin-left:auto;width:8px;height:8px;border-radius:50%;flex:none}
.gf-node .gf-d.warn{background:var(--warn)}.gf-node .gf-d.bad{background:var(--neg)}
.gf-node .nm{font-size:12.5px;font-weight:600;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.gf-node .sub{font:400 10.5px/1.25 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gf-node .fl{font:500 10.5px/1.2 "IBM Plex Mono",monospace}
.gf-node .fl.warn{color:var(--warn)}.gf-node .fl.bad{color:var(--neg)}
.gf-node.grp .n{margin-left:auto;font:600 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.gf-node.grp .chev{display:grid;color:var(--ink-3);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.gf-node.grp .n+.chev{margin-left:2px}
.gf-node.grp .chev svg.i{width:13px;height:13px}
.gf-node.grp.open{border-color:var(--accent)}
.gf-node.grp.open .chev{transform:rotate(180deg);color:var(--accent)}
.gf-node.faded{opacity:.38}
.gf-node.here{border:1.5px solid var(--accent);background:color-mix(in srgb,var(--accent) 7%,var(--surface));min-height:0;padding:12px 14px}
.gf-node.here .nm{font-size:15px;-webkit-line-clamp:1}
.gf-node.here .sub{font-size:11px}
.gf-node.unfed{border-style:dashed;background:transparent;min-height:0;flex-direction:row;align-items:center;gap:10px;padding:10px 12px}
.gf-node.unfed .txt{display:flex;flex-direction:column;gap:3px;min-width:0}
.gf-node.unfed .gf-d{margin-left:auto}
.gf-node.unfed .fl{margin-left:auto}
.gf-node.unfed .chev{margin-left:4px}

/* a group's shops, opened under the band ------------------------------------ */
.gf-rows{margin:10px 0 0 24px;border-top:1px solid var(--rule-soft)}
.gf-rows .gf-r{display:grid;grid-template-columns:30px minmax(0,1fr) auto 10px;gap:8px;align-items:center;min-height:44px;border-bottom:1px solid var(--rule-soft);color:var(--ink);text-decoration:none;font-size:12.5px}
.gf-rows .gf-r .hood{height:18px;min-width:26px;font-size:9.5px}
.gf-rows .gf-r .v{font:500 11px/1.2 "IBM Plex Mono",monospace;color:var(--ink-2);text-align:right}
.gf-rows .gf-r .v small{display:block;font-size:10px;color:var(--ink-3)}
.gf-rows .gf-r .gf-d{width:8px;height:8px;border-radius:50%}
.gf-rows .gf-r .gf-d.warn{background:var(--warn)}.gf-rows .gf-r .gf-d.bad{background:var(--neg)}
.gf-rows .gf-r:hover{background:var(--raised)}
.gf-rows .nm2{display:flex;flex-direction:column;gap:3px}
.gf-rows .nm2 small{font:500 10.5px/1 "IBM Plex Mono",monospace}
.gf-rows .nm2 small.warn{color:var(--warn)}.gf-rows .nm2 small.bad{color:var(--neg)}
.gf-rows .head{display:flex;justify-content:space-between;gap:10px;padding:9px 0 7px;white-space:nowrap}

/* the legend under the diagram --------------------------------------------- */
.gf-leg{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:14px;font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gf-leg span{display:inline-flex;align-items:center;gap:6px}
.gf-leg u{width:20px;border-top:2px dashed var(--ink-3);display:inline-block;text-decoration:none}
.gf-leg u.d{border-top-style:solid}
.gf-leg i{width:8px;height:8px;border-radius:50%;display:inline-block}
.gf-leg .tap{flex-basis:100%;color:var(--ink-2);font-family:Archivo,sans-serif;font-size:12px}

/* following one site: the crumb back, what comes in and goes out ------------- */
.gf-crumb{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.gf-back{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px 0 8px;border-radius:18px;background:var(--accent-soft);color:var(--accent);font:500 12px/1 "IBM Plex Mono",monospace;text-decoration:none;white-space:nowrap}
.gf-back svg.i{width:14px;height:14px}
.gf-crumb .where{font-size:12px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gf-why{margin-top:14px;border-radius:10px;background:var(--ground);padding:12px 12px 12px;display:flex;flex-direction:column;gap:8px}
.gf-why .it{display:flex;align-items:baseline;gap:8px;font-size:12.5px;line-height:1.45;color:var(--ink-2)}
.gf-why .it b{color:var(--ink);font-weight:600}
.gf-why .chip{flex:none}
.gf-acts{display:flex;gap:8px;margin-top:14px}
.gf-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 14px;border-radius:10px;border:1px solid var(--rule);background:transparent;color:var(--ink);font:600 13px/1 Archivo,sans-serif;text-decoration:none;cursor:pointer;flex:1}
.gf-btn svg.i{width:15px;height:15px}
.gf-btn.go{border-color:var(--accent);color:var(--accent)}
.gf-btn:hover{border-color:var(--ink-3)}

/* the empty and small states ------------------------------------------------ */
.gf-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:34px 18px 30px;text-align:center}
.gf-empty .pic{display:flex;align-items:center;gap:6px;color:var(--ink-3)}
.gf-empty .pic span{width:34px;height:26px;border-radius:6px;border:1px dashed var(--rule)}
.gf-empty .pic u{width:26px;border-top:2px dashed var(--rule);display:inline-block}
.gf-empty b{font-size:14px;font-weight:600}
.gf-empty p{margin:0;font-size:12.5px;line-height:1.5;color:var(--ink-2);max-width:280px}

/* direction A: the desktop picture, panned and zoomed ------------------------ */
.gf-pan{position:relative;height:560px;border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft);overflow:hidden}
.gf-pan .stage{position:absolute;left:0;top:0;transform-origin:0 0}
.gf-pan .zoom{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;border:1px solid var(--rule);border-radius:10px;background:var(--surface);overflow:hidden}
.gf-pan .zoom button{width:44px;height:44px;border:0;border-bottom:1px solid var(--rule-soft);background:none;color:var(--ink-2);display:grid;place-items:center;cursor:pointer}
.gf-pan .zoom button:last-child{border-bottom:0}
.gf-pan .pct{position:absolute;left:10px;top:10px;padding:6px 9px;border-radius:7px;background:var(--ground);font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.gf-pan .hint{position:absolute;left:10px;right:64px;bottom:10px;padding:8px 10px;border-radius:8px;background:var(--ground);font-size:12px;color:var(--ink-2)}
.gf-pan .mini{position:absolute;right:10px;bottom:10px;width:92px;height:56px;border-radius:6px;border:1px solid var(--rule);background:var(--ground);overflow:hidden}
.gf-pan .mini i{position:absolute;border:1.5px solid var(--accent);border-radius:2px}
.gf-sheet{position:absolute;left:0;right:0;bottom:0;border-radius:18px 18px 0 0;background:var(--surface);border:1px solid var(--rule);border-bottom:0;padding:8px 16px 22px;box-shadow:0 -20px 50px -24px #000c}
.light .gf-sheet{box-shadow:0 -18px 44px -26px #1a1f1c66}
.gf-sheet .grab{width:38px;height:4px;border-radius:2px;background:var(--rule);margin:0 auto 12px}
.gf-sheet h3{margin:0;font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px}
.gf-sheet .meta{margin-top:4px;font-size:12px;color:var(--ink-3)}
.gf-kv{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:6px 10px;margin-top:12px;font-size:12.5px;align-items:center}
.gf-kv .k{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.gf-kv .v{font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2);text-align:right}

/* direction B: a list of sites with their connections ----------------------- */
.gf-sec{margin-top:16px}
.gf-sec:first-child{margin-top:0}
.gf-sec .gf-lab{display:flex;justify-content:space-between;padding-bottom:8px;border-bottom:1px solid var(--rule)}
.gf-li{border-bottom:1px solid var(--rule-soft)}
.gf-li>.sum{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:4px 10px;align-items:center;padding:10px 0;color:var(--ink);text-decoration:none}
.gf-li .hood{height:18px;min-width:26px;font-size:9.5px}
.gf-li .nm{font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px}
.gf-li .nm .gf-d{width:7px;height:7px;border-radius:50%}
.gf-li .nm .gf-d.warn{background:var(--warn)}.gf-li .nm .gf-d.bad{background:var(--neg)}
.gf-li .v{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3);text-align:right}
.gf-li .ft{grid-column:2/4;display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:var(--ink-3)}
.gf-li .ft b{color:var(--ink-2);font-weight:500}
.gf-li.open{background:color-mix(in srgb,var(--accent) 5%,transparent)}
.gf-conn{margin:0 0 12px 40px;display:flex;flex-direction:column;gap:2px}
.gf-conn .c{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:8px;align-items:center;min-height:38px;padding:0 8px;border-radius:7px;background:var(--ground);font-size:12px}
.gf-conn .c .v{font:500 11px/1.2 "IBM Plex Mono",monospace;color:var(--ink-2);text-align:right}
.gf-conn .c .v small{display:block;color:var(--ink-3);font-size:10px}
.gf-conn .c svg.i{width:14px;height:14px;color:var(--ink-3)}
.gf-conn .c.gf-warn{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--warn) 55%,transparent)}

/* tablet: the same chain, wider ------------------------------------------- */
.gf-tab .gf-page{padding:0 24px 28px}
.gf-tab .gf-tabs{display:inline-grid;width:auto;grid-template-columns:repeat(3,auto)}
.gf-tab .gf-tabs a{padding:0 16px}
.gf-tab .gf-head{display:flex;align-items:center;gap:12px;margin-top:16px}
.gf-tab .gf-head .gf-tabs{margin-top:0}
.gf-tab .gf-head .gf-tools{margin:0 0 0 auto;gap:10px}
@media (prefers-reduced-motion:reduce){.board *{animation:none!important;transition:none!important}}
"""

# --------------------------------------------------------------------------
# icons (stroke, 24 grid)
# --------------------------------------------------------------------------
P = {
    "search": '<circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path>',
    "sun": '<circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"></path>',
    "company": '<path d="M4 21V5l8-2v18M12 8h8v13M4 21h16M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2"></path>',
    "box": '<path d="M3.5 8 12 4l8.5 4v8L12 20l-8.5-4z"></path><path d="M3.5 8 12 12l8.5-4M12 12v8"></path>',
    "trend": '<path d="M3 17l6-6 4 4 8-8"></path><path d="M15 7h6v6"></path>',
    "map": '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"></path><path d="M9 4v14M15 6v14"></path>',
    "book": '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"></path><path d="M5 17a3 3 0 0 1 3-3h11"></path>',
    "list": '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"></path>',
    "route": '<circle cx="6" cy="6" r="2.5"></circle><circle cx="18" cy="18" r="2.5"></circle><path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5"></path>',
    "shop": '<path d="M4 9l1.5-5h13L20 9"></path><path d="M4 9h16v2a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0A2.7 2.7 0 0 1 4 11z"></path><path d="M5.5 13v7h13v-7M10 20v-4h4v4"></path>',
    "depot": '<path d="M3 20V9l9-5 9 5v11"></path><path d="M7 20v-7h10v7M7 16h10"></path>',
    "factory": '<path d="M3 20V10l5 3V10l5 3V6h4v14z"></path><path d="M17 20h4V4h-4M3 20h18"></path>',
    "ship": '<path d="M4 15l1.5 5h13L20 15z"></path><path d="M6 15V9h12v6M12 9V4M9 6h6"></path>',
    "chev": '<path d="M6 9l6 6 6-6"></path>',
    "back": '<path d="M15 6l-6 6 6 6"></path>',
    "right": '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    "tick": '<path d="M5 12.5l4.5 4.5L19 7"></path>',
    "plus": '<path d="M12 5v14M5 12h14"></path>',
    "minus": '<path d="M5 12h14"></path>',
    "fit": '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"></path>',
    "in": '<path d="M12 4v12M6 11l6 6 6-6"></path><path d="M5 20h14"></path>',
    "out": '<path d="M12 20V8M6 13l6-6 6 6"></path><path d="M5 4h14"></path>',
    "rows": '<path d="M4 6h16M4 12h16M4 18h10"></path>',
    "panel": '<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><path d="M14 4.5v15"></path>',
}
KIND_ICON = {"import": "ship", "depot": "depot", "factory": "factory", "shop": "shop"}


def svg(name: str) -> str:
    return f'<svg class="i" viewBox="0 0 24 24" aria-hidden="true">{P[name]}</svg>'


def esc(text: str) -> str:
    return html.escape(str(text), quote=True)


def n(v: float) -> str:
    return f"{v:,.0f}"


# --------------------------------------------------------------------------
# the company: HART. YT, day 80, from the save's supply graph
# --------------------------------------------------------------------------
# id: kind, name, hood, held (0 = an importer), flag level, flag words
NODES = {
    "p7": ("import", "7 Pier", "", 0, None, ""),
    "p1": ("import", "1 Pier", "", 0, None, ""),
    "hub": ("depot", "Import Hub", "GD", 824446, None, ""),
    "fcl": ("factory", "Factory Clothing", "IC", 34924, None, ""),
    "fjw": ("factory", "Factory Jewelry", "IC", 9668, "warn", "1 stalled"),
    "fel": ("factory", "Factory Electronics", "IC", 93739, None, ""),
    "dcl": ("depot", "Clothing Distr.", "GD", 14092, None, ""),
    "djw": ("depot", "Jewelry Distrib.", "GD", 10307, "warn", "1 tight, 1 idle"),
    "del": ("depot", "Electro Distr.", "GD", 4623, None, ""),
}
# (from, to, units a day, products, cadence)
LINKS = [
    ("p7", "hub", 50267, 15, "weekly"), ("p1", "hub", 2955, 3, "weekly"),
    ("hub", "fcl", 2131, 3, "daily"), ("hub", "fjw", 3650, 4, "daily"), ("hub", "fel", 1958, 13, "daily"),
    ("fcl", "dcl", 8693, 9, "daily"), ("fjw", "djw", 2071, 4, "daily"), ("fjw", "dcl", 259, 2, "daily"),
    ("fel", "djw", 266, 2, "daily"), ("fel", "del", 3136, 9, "daily"),
]
# shops by the depot whose morning round reaches them: hood, name, held, units a day, flag, words
SHOPS = {
    "dcl": ("Clothing shops", [("MT", "HART. Clothing", 9848, 1732), ("MH", "HART. Clothing", 9847, 1992),
                               ("LM", "HART. Clothing", 8866, 1273), ("GD", "HART. Clothing", 4779, 825),
                               ("HK", "HART. Clothing", 4720, 1085), ("HA", "HART. Clothing", 4717, 953),
                               ("IC", "HART. Clothing", 4709, 1092)]),
    "djw": ("Jewelry shops", [("MT", "HART. Jewelry", 5483, 592), ("IC", "HART. Jewelry", 2967, 309),
                              ("MH", "HART. Jewelry", 2945, 283), ("GD", "HART. Jewelry", 2942, 254),
                              ("HA", "HART. Jewelry", 2926, 290), ("HK", "HART. Jewelry", 2926, 281),
                              ("LM", "HART. Jewelry", 2922, 328)]),
    "del": ("Electronics shops", [("LM", "HART. Electro", 5893, 1245), ("GD", "HART. Electro", 2439, 358),
                                  ("HK", "HART. Electro", 2437, 393), ("HA", "HART. Electro", 2430, 585),
                                  ("IC", "HART. Electro", 2430, 555)]),
}
# on the diagram but reached by no pipe: the gyms and one old electronics shop
UNFED = [("GD", "HART. Fitness", 3200, None, ""), ("HK", "HART. Fitness", 3020, "warn", "1 tight"),
         ("MH", "HART. Fittness", 2047, "bad", "1 short, 1 tight"), ("HK", "Evil Genius", 1083, None, "")]

LINK = {(a, b): (v, k, c) for a, b, v, k, c in LINKS}
HEAVIEST = max(v for _, _, v, _, _ in LINKS)


def group_total(depot: str) -> int:
    return sum(s[3] for s in SHOPS[depot][1])


# --------------------------------------------------------------------------
# the phone page around the diagram
# --------------------------------------------------------------------------
def mast() -> str:
    nav = "".join(f'<a href="#" class="{"on" if k == "box" else ""}" aria-label="{t}">{svg(k)}</a>'
                  for k, t in [("sun", "Today"), ("company", "Company"), ("box", "Supply"), ("trend", "Growth"),
                               ("map", "Map"), ("book", "Wiki")])
    return (f'<div class="gf-mast"><span class="gf-brand">HART. YT<i></i></span>'
            f'<button type="button" class="gf-ib" aria-label="Search the board">{svg("search")}</button></div>'
            f'<nav class="gf-nav" aria-label="Pages">{nav}</nav>')


def tabs(on: str = "shops", counts: tuple = (5, 1, 0)) -> str:
    def badge(k):
        return f'<span class="gf-n">{k}</span>' if k else f'<span class="gf-n zero">{svg("tick")}</span>'
    t = [("shops", "Shops", badge(counts[0])), ("warehouses", "Warehouses", badge(counts[1])),
         ("factories", "Factories", badge(counts[2]))]
    return '<nav class="gf-tabs" aria-label="Supply">' + "".join(
        f'<a href="#" class="{"on" if k == on else ""}">{label}{badge}</a>' for k, label, badge in t) + "</nav>"


def tools(view: str = "diagram") -> str:
    return (f'<div class="gf-tools"><span class="gf-seg"><a href="#" class="on">Needs a change</a><a href="#">Everything</a></span>'
            f'<span class="gf-seg"><a href="#" class="ico{" on" if view == "list" else ""}" aria-label="List">{svg("list")}</a>'
            f'<a href="#" class="ico{" on" if view == "diagram" else ""}" aria-label="Diagram">{svg("route")}</a></span></div>')


VERDICT = ('<p class="gf-verdict"><b>2 shelves run short</b>; 112 of 159 shelves clear tomorrow\'s round. '
           '2 shelves cover the busiest day but not the margin.</p>')


def page(body: str, verdict: str = VERDICT, on: str = "shops", view: str = "diagram", counts: tuple = (5, 1, 0)) -> str:
    return f'<div class="gf-page">{mast()}{tabs(on, counts)}{tools(view)}{verdict}{body}</div>'


def tablet_page(body: str) -> str:
    head = f'<div class="gf-head">{tabs()}{tools()}</div>'
    return f'<div class="gf-tab"><div class="gf-page">{mast()}{head}{VERDICT}{body}</div></div>'


# --------------------------------------------------------------------------
# the chain: bands of cards, pipes between them
# --------------------------------------------------------------------------
class Card:
    def __init__(self, cid: str, kind: str, name: str, hood: str = "", sub: str = "", flag: str | None = None,
                 words: str = "", href: str = "", group: str = "", count: int = 0, open_: bool = False,
                 here: bool = False, faded: bool = False, dot: bool = True):
        self.cid, self.kind, self.name, self.hood, self.sub = cid, kind, name, hood, sub
        self.flag, self.words, self.href, self.group, self.count = flag, words, href, group, count
        self.open, self.here, self.faded, self.dot = open_, here, faded, dot

    def html(self, width: float) -> str:
        cls = "gf-node" + (" grp" if self.group else "") + (" open" if self.open else "") + (" here" if self.here else "") + (
            " faded" if self.faded else "")
        top = svg(KIND_ICON[self.kind]) + (f'<span class="hood">{self.hood}</span>' if self.hood else "")
        if self.group:
            top += f'<span class="n">{self.count}</span><span class="chev">{svg("chev")}</span>'
        elif self.flag and self.dot:
            top += f'<span class="gf-d {self.flag}" aria-hidden="true"></span>'
        inner = (f'<span class="top">{top}</span><span class="nm">{esc(self.name)}</span>'
                 f'<span class="sub">{self.sub}</span>')
        if self.words:
            inner += f'<span class="fl {self.flag}">{esc(self.words)}</span>'
        style = f'style="width:{width:.0f}px;flex:none"'
        if self.href:
            return f'<a class="{cls}" href="{self.href}" {style}>{inner}</a>'
        data = f' data-gf-group="{self.group}" aria-expanded="{"true" if self.open else "false"}"' if self.group else ""
        return f'<button type="button" class="{cls}" {style}{data}>{inner}</button>'


def node_card(cid: str, sub: str | None = None, **kw) -> Card:
    kind, name, hood, held, flag, words = NODES[cid]
    if sub is None:
        sub = "Weekly import" if kind == "import" else f"{n(held)} held"
    flag, words = kw.pop("flag", flag), kw.pop("words", words)
    return Card(cid, kind, name, hood, sub, flag, words, **kw)


def layout(cards: list[Card], width: float, max_w: float, gap: float = 8) -> tuple[float, dict]:
    k = len(cards)
    cw = min(max_w, (width - (k - 1) * gap) / k)
    left = (width - (k * cw + (k - 1) * gap)) / 2
    return cw, {c.cid: left + i * (cw + gap) + cw / 2 for i, c in enumerate(cards)}


def gutter(pipes: list[tuple], xa: dict, xb: dict, width: float, h: int = 36) -> str:
    """Pipes from the cards above (xa) to the cards below (xb): (from, to, per day, cadence, cls)."""
    outs, ins = {}, {}
    for p in pipes:
        outs.setdefault(p[0], []).append(p)
        ins.setdefault(p[1], []).append(p)
    # the ends on one card fan out a little, ordered so the pipes do not cross at the card
    def spread(group, key, xs):
        g = sorted(group, key=lambda p: xs[p[key]])
        return {id(p): (i - (len(g) - 1) / 2) * 7 for i, p in enumerate(g)}
    off_a, off_b = {}, {}
    for g in outs.values():
        off_a.update(spread(g, 1, xb))
    for g in ins.values():
        off_b.update(spread(g, 0, xa))
    paths = []
    for p in pipes:
        a, b, per_day, cadence, cls = p
        x1, x2 = xa[a] + off_a[id(p)], xb[b] + off_b[id(p)]
        w = 1 + math.sqrt(per_day / HEAVIEST) * 2.5
        paths.append(f'<path class="{cadence} {cls}" stroke-width="{w:.1f}" d="M{x1:.1f},0 C{x1:.1f},{h * .55:.1f} {x2:.1f},{h * .45:.1f} {x2:.1f},{h}"></path>')
    return (f'<svg class="gf-gut" width="{width:.0f}" height="{h}" viewBox="0 0 {width:.0f} {h}" aria-hidden="true">'
            + "".join(paths) + "</svg>")


def band(label: str, cards: list[Card], width: float, max_w: float) -> tuple[str, dict]:
    cw, xs = layout(cards, width, max_w)
    body = "".join(c.html(cw) for c in cards)
    return f'<div class="gf-band"><span class="gf-rail">{label}</span><div class="gf-cards">{body}</div></div>', xs


def shop_rows(depot: str, hidden: bool, href_first: str = "") -> str:
    title, shops = SHOPS[depot]
    rows = "".join(
        f'<a class="gf-r" href="{href_first if i == 0 and href_first else "#"}"><span class="hood">{h}</span><span>{esc(nm)}</span>'
        f'<span class="v">{n(per)} a day<small>{n(held)} held</small></span><span></span></a>'
        for i, (h, nm, held, per) in enumerate(shops))
    return (f'<div class="gf-rows{" gf-off" if hidden else ""}" data-gf-rows="{depot}">'
            f'<div class="head"><span class="gf-lab">{len(shops)} {title.lower()}</span>'
            f'<span class="gf-lab">{n(group_total(depot))} a day</span></div>{rows}</div>')


def unfed_rows(hidden: bool) -> str:
    def flag(fl, w):
        return f'<small class="{fl}">{w}</small>' if fl else ""
    rows = "".join(
        f'<a class="gf-r" href="#"><span class="hood">{h}</span><span class="nm2">{esc(nm)}{flag(fl, w)}</span>'
        f'<span class="v">{n(held)} held</span><span class="gf-d {fl or ""}"></span></a>'
        for h, nm, held, fl, w in UNFED)
    return (f'<div class="gf-rows{" gf-off" if hidden else ""}" data-gf-rows="unfed">'
            f'<div class="head"><span class="gf-lab">No pipe reaches these</span><span class="gf-lab">4 shops</span></div>{rows}</div>')


def unfed_card(open_: bool = False) -> str:
    return (f'<div style="margin:10px 0 0 24px"><button type="button" class="gf-node grp unfed{" open" if open_ else ""}" style="width:100%" '
            f'data-gf-group="unfed" aria-expanded="{"true" if open_ else "false"}">{svg("shop")}'
            f'<span class="txt"><span class="nm">4 shops no pipe reaches</span><span class="sub">3 gyms, Evil Genius</span></span>'
            f'<span class="fl bad">1 short</span><span class="chev">{svg("chev")}</span></button></div>')


def look() -> str:
    chips = [("ChainFocus.dc.html", "", "Factory Jewelry", "1 stalled"),
             ("ChainDepot.dc.html", "", "Jewelry Distrib.", "1 tight, 1 idle"),
             ("#", "bad", "MH HART. Fittness", "1 short")]
    return ('<div class="gf-look"><span class="gf-lab">3 worth a look</span><div class="row">' + "".join(
        f'<a class="gf-chipb" href="{h}"><span class="d {c}"></span>{esc(nm)}<small>{w}</small></a>' for h, c, nm, w in chips)
        + "</div></div>")


def legend() -> str:
    return ('<div class="gf-leg"><span><u></u>weekly import</span><span><u class="d"></u>morning round</span>'
            '<span><i style="background:var(--neg)"></i>short or no plan</span><span><i style="background:var(--warn)"></i>worth watching</span>'
            '<span class="tap">Tap a site to follow its goods. Tap a group to list its shops.</span></div>')


def chain(width: float, max_w: float = 170, open_group: str = "", tablet: bool = False) -> str:
    """The whole chain, stages in the order the goods travel."""
    inner = width - 24  # the rail and its gap
    b1 = [node_card("p7", href=""), node_card("p1")]
    b2 = [node_card("hub")]
    b3 = [node_card("fcl"), node_card("fjw", href="ChainFocus.dc.html"), node_card("fel")]
    b4 = [node_card("dcl"), node_card("djw", href="ChainDepot.dc.html"), node_card("del")]
    b5 = [Card(f"g-{d}", "shop", SHOPS[d][0], "", f"{n(group_total(d))} a day", group=d, count=len(SHOPS[d][1]),
               open_=open_group == d) for d in ("dcl", "djw", "del")]
    out, xs = [], []
    for label, cards in [("Importers", b1), ("Depots", b2), ("Factories", b3), ("Depots", b4), ("Shops", b5)]:
        h, x = band(label, cards, inner, max_w)
        out.append(h)
        xs.append(x)
    def pipes(pairs, cls=lambda a, b: ""):
        return [(a, b, LINK[(a, b)][0], LINK[(a, b)][2], cls(a, b)) for a, b in pairs]
    g1 = gutter(pipes([("p7", "hub"), ("p1", "hub")]), xs[0], xs[1], inner)
    g2 = gutter(pipes([("hub", "fcl"), ("hub", "fjw"), ("hub", "fel")]), xs[1], xs[2], inner)
    g3 = gutter(pipes([("fcl", "dcl"), ("fjw", "djw"), ("fjw", "dcl"), ("fel", "djw"), ("fel", "del")]), xs[2], xs[3], inner)
    g4 = gutter([(d, f"g-{d}", group_total(d), "daily", "lit" if open_group == d else "") for d in ("dcl", "djw", "del")],
                xs[3], xs[4], inner)
    rows = "".join(shop_rows(d, open_group != d) for d in ("dcl", "djw", "del"))
    return (look() + out[0] + g1 + out[1] + g2 + out[2] + g3 + out[3] + g4 + out[4] + rows
            + unfed_card(open_group == "unfed") + unfed_rows(open_group != "unfed") + legend())


def box(inner: str) -> str:
    return f'<div class="gf-box">{inner}</div>'


# --------------------------------------------------------------------------
# recommended: the chain, and following one site
# --------------------------------------------------------------------------
PHONE_W = 390 - 32 - 24  # page gutters, box padding


def chain_main() -> str:
    return page(box(chain(PHONE_W)))


def chain_group() -> str:
    return page(box(chain(PHONE_W, open_group="dcl")))


def chain_unfed() -> str:
    return page(box(chain(PHONE_W, open_group="unfed")))


def crumb(name: str, hood: str, where: str) -> str:
    return (f'<div class="gf-crumb"><a class="gf-back" href="Main.dc.html">{svg("back")}Whole chain</a>'
            f'<span class="where">{where}</span></div>')


def focus(here: Card, ins: list[tuple], outs: list[tuple], why: str, rows_label: str) -> str:
    """One site's own flow: what comes in above it, what goes out below. ins/outs: (Card, per day, cadence, cls)."""
    inner = PHONE_W - 24
    parts = []
    xs_here = {here.cid: inner / 2}
    if ins:
        h, xa = band("Comes in", [c for c, *_ in ins], inner, 170)
        parts.append(h)
        parts.append(gutter([(c.cid, here.cid, v, cad, cls) for c, v, cad, cls in ins], xa, xs_here, inner, 32))
    parts.append(f'<div class="gf-band"><span class="gf-rail">Here</span><div class="gf-cards">{here.html(inner)}</div></div>')
    if outs:
        h, xb = band("Goes out", [c for c, *_ in outs], inner, 170)
        parts.append(gutter([(here.cid, c.cid, v, cad, cls) for c, v, cad, cls in outs], xs_here, xb, inner, 32))
        parts.append(h)
    acts = (f'<div class="gf-acts"><a class="gf-btn go" href="#">{svg("rows")}{rows_label}</a>'
            f'<a class="gf-btn" href="#">{svg("panel")}Site page</a></div>')
    return "".join(parts) + why + acts


def chain_focus() -> str:
    here = node_card("fjw", sub="Factory · 9,668 held", here=True)
    ins = [(node_card("hub", sub="3,650 a day · 4 products", flag="warn", words="Metal Band stalled", dot=False), 3650, "daily", "warnp")]
    outs = [(node_card("djw", sub="2,071 a day · 4 products", flag=None, words=""), 2071, "daily", "lit"),
            (node_card("dcl", sub="259 a day · 2 products"), 259, "daily", "lit")]
    why = ('<div class="gf-why"><span class="gf-lab">Worth a look</span>'
           '<div class="it"><span class="chip warn">stalled</span><span><b>Metal Band</b>: Import Hub holds 11,640, yet 1,471 of the '
           '2,160 the machines need a day arrive (68%). It isn\'t reaching the factory.</span></div>'
           '<div class="it"><span class="chip ok">covered</span><span>Uncut Gems (Cheap), Uncut Gems (Expensive), Paper Bag</span></div></div>')
    body = crumb("Factory Jewelry", "IC", "Following Factory Jewelry") + focus(here, ins, outs, why, "Its 6 rows")
    return page(box(body), verdict=('<p class="gf-verdict"><b>1 worth watching</b>; 14 of 15 inputs are fed as the machines need.</p>'),
                on="factories")


def chain_depot() -> str:
    here = node_card("djw", sub="Warehouse · 10,307 held", here=True)
    ins = [(node_card("fjw", sub="2,071 a day · 4 products", flag=None, words=""), 2071, "daily", "lit"),
           (node_card("fel", sub="266 a day · 2 products"), 266, "daily", "lit")]
    grp = Card("g-djw", "shop", "Jewelry shops", "", "2,337 a day · 5 products", group="djw", count=7, open_=True)
    outs = [(grp, 2337, "daily", "lit")]
    why = ('<div class="gf-why"><span class="gf-lab">Worth a look</span>'
           '<div class="it"><span class="chip warn">tight</span><span><b>Jewelry (Cheap)</b>: 171 held for 948 a day; the round '
           'covers the day but not the margin.</span></div>'
           '<div class="it"><span class="chip dim">idle</span><span><b>Metal Band</b>: 5,000 held and nothing here draws it.</span></div></div>')
    rows = shop_rows("djw", False)
    body = crumb("Jewelry Distrib.", "GD", "Following Jewelry Distrib.") + focus(here, ins, outs, rows + why, "Its 6 rows")
    return page(box(body), verdict=('<p class="gf-verdict"><b>1 worth watching</b>; 5 of 6 lines clear the next import.</p>'),
                on="warehouses")


def chain_small() -> str:
    inner = PHONE_W - 24
    b1 = [Card("p3", "import", "3 Pier", "", "Weekly import")]
    b2 = [Card("dep", "depot", "HART. Depot", "MT", "6,410 held")]
    b3 = [Card("s1", "shop", "HART. Clothing", "MT", "2,180 held"), Card("s2", "shop", "HART. Clothing", "HK", "1,940 held"),
          Card("s3", "shop", "HART. Gifts", "MT", "860 held", "bad", "1 short")]
    h1, x1 = band("Importers", b1, inner, 200)
    h2, x2 = band("Depots", b2, inner, 200)
    h3, x3 = band("Shops", b3, inner, 170)
    heavy = 5200
    def gp(pairs):
        return [(a, b, v * HEAVIEST / heavy, cad, "") for a, b, v, cad in pairs]
    g1 = gutter(gp([("p3", "dep", 5200, "weekly")]), x1, x2, inner)
    g2 = gutter(gp([("dep", "s1", 1400, "daily"), ("dep", "s2", 1250, "daily"), ("dep", "s3", 380, "daily")]), x2, x3, inner)
    look_ = ('<div class="gf-look"><span class="gf-lab">1 worth a look</span><div class="row">'
             '<a class="gf-chipb" href="#"><span class="d bad"></span>MT HART. Gifts<small>1 short</small></a></div></div>')
    body = look_ + h1 + g1 + h2 + g2 + h3 + legend()
    return page(box(body), verdict='<p class="gf-verdict"><b>1 shelf runs short</b>; 17 of 18 shelves clear tomorrow\'s round.</p>', counts=(1, 0, 0))


def chain_empty() -> str:
    body = ('<div class="gf-empty"><div class="pic"><span></span><u></u><span></span><u></u><span></span></div>'
            '<b>No goods move between your sites yet</b>'
            '<p>An import contract or a logistics manager\'s delivery plan draws the first pipe here.</p>'
            f'<a class="gf-btn" href="#" style="flex:none;margin-top:6px">{svg("book")}How imports work</a></div>')
    return page(box(body), verdict='<p class="gf-verdict"><b>Nothing to type in</b>; your one shop buys its stock by hand.</p>', counts=(0, 0, 0))


def chain_tablet() -> str:
    inner = 768 - 48 - 24 - 24
    return tablet_page(box(chain(inner + 24, max_w=190, open_group="djw")))


# --------------------------------------------------------------------------
# direction A: the desktop picture, pannable and zoomable
# --------------------------------------------------------------------------
NODE_W, NODE_H, ROW_GAP, SHOP_GAP, SUB_GAP, MAP_MAX_H = 180, 44, 16, 8, 14, 900


def desk_graph():
    cols = [[("p7", "7 Pier", "", "Weekly import", None), ("p1", "1 Pier", "", "Weekly import", None)],
            [(k, NODES[k][1], NODES[k][2], f"{n(NODES[k][3])} held", NODES[k][4]) for k in ("fcl", "fjw", "fel")],
            [(k, NODES[k][1], NODES[k][2], f"{n(NODES[k][3])} held", NODES[k][4]) for k in ("dcl", "djw", "del", "hub")]]
    shops = []
    for d, (_, lst) in SHOPS.items():
        for h, nm, held, per in lst:
            shops.append((f"s-{d}-{h}", nm, h, held, None, d, per))
    for h, nm, held, fl, _w in UNFED:
        shops.append((f"u-{h}-{nm}", nm, h, held, fl, None, 0))
    shops.sort(key=lambda s: -s[3])
    cols.append([(s[0], s[1], s[2], f"{n(s[3])} held", s[4]) for s in shops])
    links = [(a, b, v, c) for a, b, v, _k, c in LINKS]
    for s in shops:
        if s[5]:
            links.append((s[5], s[0], s[6], "daily"))
    return cols, links


def desk_svg(pick: str = "") -> tuple[str, int, int]:
    cols, links = desk_graph()
    split = len(cols[3]) * (NODE_H + SHOP_GAP) + 34 > MAP_MAX_H
    col_gap = 90 if split else 136
    pitch = (NODE_H + 12) / 2 if split else NODE_H + SHOP_GAP
    def span(ci, k):
        return ((k - 1) * pitch + NODE_H if split else k * pitch - SHOP_GAP) if ci == 3 else k * (NODE_H + ROW_GAP) - ROW_GAP
    height = max(span(ci, len(c)) for ci, c in enumerate(cols)) + 34 + 8
    width = 4 * NODE_W + 3 * col_gap + (NODE_W + SUB_GAP if split else 0)
    col_x = [ci * (NODE_W + col_gap) for ci in range(4)]
    at = {}
    for ci, col in enumerate(cols):
        top = (height - 34 - span(ci, len(col))) / 2 + 34
        for ri, nd in enumerate(col):
            back = split and ci == 3 and ri % 2 == 1
            at[nd[0]] = (col_x[ci] + (NODE_W + SUB_GAP if back else 0), top + ri * (pitch if ci == 3 else NODE_H + ROW_GAP),
                         col_x[3] - 10 if back else None, nd)
    touched = {pick} | {b for a, b, *_ in links if a == pick} | {a for a, b, *_ in links if b == pick} if pick else set()
    heavy = max(l[2] for l in links)
    heads = "".join(f'<text class="col" x="{col_x[i]}" y="22">{t}</text>' for i, t in enumerate(["IMPORTERS", "FACTORIES", "DEPOTS", "SHOPS"]))
    pipes = []
    for a, b, v, cad in links:
        ax, ay, _, _ = at[a]
        bx, by, corr, _ = at[b]
        fwd = bx > ax
        x1, y1 = ax + (NODE_W if fwd else 0), ay + NODE_H / 2
        x2, y2 = bx + (0 if fwd else NODE_W), by + NODE_H / 2
        xc = corr if fwd and corr is not None else x2
        mid = (x1 + xc) / 2
        w = 1 + math.sqrt(v / heavy) * 2.5
        cls = "pipe " + cad + ((" lit" if a == pick or b == pick else " dim") if pick else "")
        tail = f" L{x2},{y2}" if xc != x2 else ""
        pipes.append(f'<path class="{cls}" stroke-width="{w:.1f}" d="M{x1},{y1} C{mid},{y1} {mid},{y2} {xc},{y2}{tail}"></path>')
    boxes, dots = [], []
    for x, y, _, nd in at.values():
        cid, name, hood, sub, flag = nd
        tx = x + (44 if hood else 12)
        cls = "node" + ((" on" if cid == pick else "" if cid in touched else " faded") if pick else "")
        hood_svg = (f'<rect x="{x + 10}" y="{y + 13}" width="24" height="18" rx="3" fill="var(--raised)" stroke="var(--rule)"></rect>'
                    f'<text x="{x + 22}" y="{y + 26}" text-anchor="middle" class="s" style="font-weight:600;fill:var(--ink-2)">{hood}</text>') if hood else ""
        boxes.append(f'<g class="{cls}"><rect x="{x}" y="{y}" width="{NODE_W}" height="{NODE_H}" rx="7"></rect>{hood_svg}'
                     f'<text x="{tx}" y="{y + 19}">{esc(name)}</text><text class="s" x="{tx}" y="{y + 34}">{sub}</text></g>')
        if flag:
            dots.append(f'<circle class="{"badd" if flag == "bad" else "warnd"}" cx="{x + NODE_W - 10}" cy="{y + 10}" r="4"></circle>')
    body = heads + "".join(pipes) + "".join(boxes) + "".join(dots)
    return (f'<svg class="flow" width="{width}" height="{height:.0f}" viewBox="0 0 {width} {height:.0f}">{body}</svg>',
            width, int(height))


def pan_fit() -> str:
    s, w, h = desk_svg()
    scale = 356 / w
    stage = f'<div class="stage" style="transform:translate(0px,{(560 - h * scale) / 2:.0f}px) scale({scale:.3f})">{s}</div>'
    ctrl = (f'<div class="zoom"><button type="button" aria-label="Zoom in">{svg("plus")}</button>'
            f'<button type="button" aria-label="Zoom out">{svg("minus")}</button><button type="button" aria-label="Fit">{svg("fit")}</button></div>')
    body = (f'<div class="gf-pan">{stage}<span class="pct">{scale * 100:.0f}%</span>{ctrl}'
            f'<span class="hint">Pinch or use + to read it; drag to move around.</span></div>')
    return page(body)


def pan_zoom() -> str:
    s, w, h = desk_svg(pick="fjw")
    # the factory column and the depots at 90 %, the pick in the middle
    scale = .9
    tx, ty = -(1 * (180 + 90) - 30) * scale, -(h / 2 - 140) * scale
    stage = f'<div class="stage" style="transform:translate({tx:.0f}px,{ty:.0f}px) scale({scale})">{s}</div>'
    ctrl = (f'<div class="zoom"><button type="button" aria-label="Zoom in">{svg("plus")}</button>'
            f'<button type="button" aria-label="Zoom out">{svg("minus")}</button><button type="button" aria-label="Fit">{svg("fit")}</button></div>')
    sheet = ('<div class="gf-sheet"><div class="grab"></div>'
             '<h3><span class="hood">IC</span>Factory Jewelry<span class="chip warn" style="margin-left:auto">1 stalled</span></h3>'
             '<div class="meta">Factory · 9,668 held</div>'
             '<div class="gf-kv"><span class="k">In</span><span>Import Hub</span><span class="v">3,650 a day</span>'
             '<span class="k">Out</span><span>Jewelry Distrib.</span><span class="v">2,071 a day</span>'
             '<span class="k"></span><span>Clothing Distr.</span><span class="v">259 a day</span></div>'
             f'<div class="gf-acts"><a class="gf-btn go" href="#">{svg("rows")}Its 6 rows</a></div></div>')
    body = f'<div class="gf-pan" style="height:640px">{stage}<span class="pct">90%</span>{ctrl}{sheet}</div>'
    return page(body)


# --------------------------------------------------------------------------
# direction B: every site in a list, with where its goods come from and go
# --------------------------------------------------------------------------
def li(hood: str, name: str, flag: str | None, value: str, frm: str, to: str, open_: bool = False, conn: str = "") -> str:
    dot = f'<span class="gf-d {flag}"></span>' if flag else ""
    ft = (f'<span class="ft">{f"<span>from <b>{frm}</b></span>" if frm else ""}{f"<span>to <b>{to}</b></span>" if to else ""}</span>')
    return (f'<div class="gf-li{" open" if open_ else ""}"><a class="sum" href="#"><span class="hood">{hood or "—"}</span>'
            f'<span class="nm">{esc(name)}{dot}</span><span class="v">{value}</span>{ft}</a>{conn}</div>')


def conn(rows: list[tuple]) -> str:
    return '<div class="gf-conn">' + "".join(
        f'<div class="c{" gf-warn" if w else ""}">{svg(ic)}<span>{esc(nm)}{f" <span class=\'chip warn\'>{w}</span>" if w else ""}</span>'
        f'<span class="v">{v}<small>{sub}</small></span></div>' for ic, nm, v, sub, w in rows) + "</div>"


def list_view(open_fjw: bool) -> str:
    fjw_conn = conn([("in", "Import Hub", "3,650 a day", "4 products · morning round", "stalled"),
                     ("out", "Jewelry Distrib.", "2,071 a day", "4 products", ""),
                     ("out", "Clothing Distr.", "259 a day", "2 products", "")]) if open_fjw else ""
    secs = [
        ("Importers", "2", [li("", "7 Pier", None, "50,267 a day", "", "Import Hub"), li("", "1 Pier", None, "2,955 a day", "", "Import Hub")]),
        ("Factories", "3", [li("IC", "Factory Clothing", None, "34,924 held", "Import Hub", "Clothing Distr."),
                            li("IC", "Factory Jewelry", "warn", "9,668 held", "Import Hub", "Jewelry Distrib., Clothing Distr.", open_fjw, fjw_conn),
                            li("IC", "Factory Electronics", None, "93,739 held", "Import Hub", "Electro Distr., Jewelry Distrib.")]),
        ("Depots", "4", [li("GD", "Import Hub", None, "824,446 held", "7 Pier, 1 Pier", "3 factories"),
                         li("GD", "Clothing Distr.", None, "14,092 held", "Factory Clothing, Factory Jewelry", "7 Clothing shops"),
                         li("GD", "Jewelry Distrib.", "warn", "10,307 held", "Factory Jewelry, Factory Electronics", "7 Jewelry shops"),
                         li("GD", "Electro Distr.", None, "4,623 held", "Factory Electronics", "5 Electronics shops")]),
        ("Shops", "23", [li("MT", "HART. Clothing", None, "9,848 held", "Clothing Distr.", ""),
                         li("MH", "HART. Clothing", None, "9,847 held", "Clothing Distr.", ""),
                         li("LM", "HART. Clothing", None, "8,866 held", "Clothing Distr.", ""),
                         li("LM", "HART. Electro", None, "5,893 held", "Electro Distr.", "")]),
    ]
    inner = "".join(f'<div class="gf-sec"><div class="gf-lab"><span>{t}</span><span>{c}</span></div>{"".join(rows)}</div>' for t, c, rows in secs)
    return page(box(inner))


def list_overview() -> str:
    return list_view(False)


def list_open() -> str:
    return list_view(True)


# --------------------------------------------------------------------------
# behaviour: a group card opens its shops, and lights its pipe
# --------------------------------------------------------------------------
WIRE = r"""
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && (a.getAttribute('href') || '#').charAt(0) === '#') e.preventDefault(); });
    $$('button[data-gf-group]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.gfGroup, open = b.getAttribute('aria-expanded') !== 'true';
      $$('button[data-gf-group]').forEach(x => { x.setAttribute('aria-expanded', 'false'); x.classList.remove('open'); });
      $$('[data-gf-rows]').forEach(r => r.classList.add('gf-off'));
      if (open) { b.setAttribute('aria-expanded', 'true'); b.classList.add('open');
        $$('[data-gf-rows="' + id + '"]').forEach(r => r.classList.remove('gf-off')); }
    }));
"""

LOGIC = ("class Component extends DCLogic {\n"
         "  renderVals() { return { theme: (this.props.dark ?? true) ? 'dark' : 'light' }; }\n"
         "  componentDidMount() {" + WIRE + "  }\n}")

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
<div class="board gf-board {{theme}}" style="width: __W__px; height: __H__px;">
__BODY__
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='__PROPS__'>
__LOGIC__
</script>
</body>
</html>
"""

PREVIEW = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>__TITLE__</title>
<link rel="stylesheet" href="__FONTS__"><style>__CSS__</style></head>
<body><div class="board gf-board __THEME__" style="width: __W__px; min-height: 100px;">
__BODY__
</div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""

# file, title, builder, width, height, row (heights measured from the previews in both themes)
BOARDS = [
    ("Main.dc.html", "Chain · overview", chain_main, 390, 1160, "rec"),
    ("ChainGroup.dc.html", "Chain · a group of shops open", chain_group, 390, 1510, "rec"),
    ("ChainFocus.dc.html", "Chain · following a factory (stalled input)", chain_focus, 390, 980, "rec"),
    ("ChainDepot.dc.html", "Chain · following a depot", chain_depot, 390, 1270, "rec"),
    ("ChainUnfed.dc.html", "Chain · shops no pipe reaches", chain_unfed, 390, 1380, "rec"),
    ("ChainSmall.dc.html", "Chain · a small company", chain_small, 390, 844, "edge"),
    ("ChainEmpty.dc.html", "Chain · nothing moves yet", chain_empty, 390, 844, "edge"),
    ("ChainTablet.dc.html", "Chain · tablet, 768 px", chain_tablet, 768, 1370, "edge"),
    ("PanFit.dc.html", "A · pan and zoom, fitted", pan_fit, 390, 890, "alt"),
    ("PanZoom.dc.html", "A · pan and zoom, a site tapped", pan_zoom, 390, 970, "alt"),
    ("ListOverview.dc.html", "B · site list", list_overview, 390, 1410, "alt"),
    ("ListOpen.dc.html", "B · site list, one site open", list_open, 390, 1540, "alt"),
]

TIPS = {
    "Main.dc.html": "Recommended. The four columns turn into stages top to bottom, in the order goods travel. Tap a shop group to list its shops; Factory Jewelry and Jewelry Distrib. open their own flow (Play mode).",
    "ChainFocus.dc.html": "Following one site: what comes in above, what goes out below, each pipe's units a day on the neighbour's card. The amber pipe is the input that isn't reaching the factory.",
    "ChainSmall.dc.html": "A depot feeding three shops or fewer shows them as cards; groups start at four.",
    "PanFit.dc.html": "Direction A keeps the desktop picture and adds pinch, drag and + / − / fit. Fitted it is the 294 px problem again; readable only at 90 % and up, one column at a time.",
    "ListOverview.dc.html": "Direction B: every site in a list with 'from' and 'to'. Readable, but it repeats the Supply list view and loses the picture of the chain.",
}

ROWS = {"rec": "Recommended: the chain, stages top to bottom", "edge": "The chain: edges and tablet",
        "alt": "Alternatives: A pan and zoom, B site list"}


def css(theme: str) -> str:
    base = BOARD_CSS.replace("@import url('" + FONTS + "');", "")
    base = base.replace("body{margin:0;background:#0d100f}", "body{margin:0;background:" + ("#eef0ea" if theme == "light" else "#0d100f") + "}")
    return base + GF_CSS


def build(preview: bool = False) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    boards, order, notes = {}, [], {}
    row_y = {"rec": 0, "edge": 2100, "alt": 4100}
    row_x = {k: 0 for k in row_y}
    for name, title, builder, w, h, row in BOARDS:
        body = builder()
        props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"}, "$preview": {"width": w, "height": h}}
        page_ = (PAGE.replace("__TITLE__", "Goods flow: " + title).replace("__FONTS__", FONTS.replace("&", "&amp;"))
                 .replace("__CSS__", css("dark")).replace("__W__", str(w)).replace("__H__", str(h))
                 .replace("__BODY__", body)
                 .replace("__PROPS__", json.dumps(props, separators=(",", ":"), ensure_ascii=False).replace("'", "&#39;"))
                 .replace("__LOGIC__", LOGIC))
        (ROOT / name).write_text(page_, encoding="utf-8", newline="\n")
        if preview:
            out = HERE / "_preview"
            out.mkdir(exist_ok=True)
            for theme in ("", "light"):
                (out / f"{name.split('.')[0]}{'-light' if theme else ''}.html").write_text(
                    PREVIEW.replace("__TITLE__", title).replace("__FONTS__", FONTS.replace("&", "&amp;")).replace("__CSS__", css(theme or "dark"))
                    .replace("__THEME__", theme).replace("__W__", str(w)).replace("__BODY__", body).replace("__WIRE__", WIRE),
                    encoding="utf-8", newline="\n")
        bx, by = row_x[row], row_y[row]
        row_x[row] += w + 80
        boards[name] = {"x": bx, "y": by, "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name)
        if name in TIPS:
            notes["try-" + name.split(".")[0].lower()] = {"x": bx, "y": by - 230, "w": 390 if w <= 390 else 560, "maxH": 170,
                                                          "text": TIPS[name]}
    for row, text in ROWS.items():
        notes["row-" + row] = {"x": 0, "y": row_y[row] - 560, "text": text, "kind": "title1", "maxW": max(row_x[row] - 80, 1200)}
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Goods Flow on a Phone",
             "launch": {"view": "canvas"}, "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards")


if __name__ == "__main__":
    build("--preview" in sys.argv)
