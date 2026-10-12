"""Generates the Real estate canvas: project/*.dc.html and project/canvas.json.

The new sixth area of the board, Real estate, with its two views (My buildings, Buy a building), the
bulk rent write through the Big Copilot Link mod, the two findings, and the Payback column the finder's
For sale list gains. Scope and settled decisions: research/real-estate-2026-10-12/PLAN.md (local, not in
the repository); the game's rules: rules.md beside it. Design decisions and porting notes: NOTES.md here.

Like mockup/supply-roles, the generator takes the board's REAL stylesheet out of template/board.html
(web/map.css spliced in where the board splices it), so the sidebar, tables, findings, write buttons and
the write dialog are the shipped classes. Every class added here carries the re- prefix.

The numbers are Peter's day-329 save (data.json, written by make_data.py). The addresses are the game's
own map; no company or person is named.

The canvas is published at https://claude.ai/artifact/8aqqSHKSDYp5WGDqgvgkTV (republish with that `url`, `root` = a
scratchpad copy holding project/, as the Artifact tool refuses a root inside a worktree). Its Finder artboard links the
map image uploaded to the canvas's asset store (MAP_BLOB); the previews carry img/ inline.

Never hand-edit project/: change this and rerun. `--preview` also writes plain HTML copies into _preview/
(both themes) for screenshots; do not commit _preview/.
"""
from __future__ import annotations

import base64
import html
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE / "project"
REPO = HERE.parent.parent
CREATED_AT = "2026-10-12T19:00:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
DATA = json.loads((HERE / "data.json").read_text(encoding="utf-8"))
DAY = DATA["day"]
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def board_css() -> str:
    """The board's own stylesheet: template/board.html's <style>, web/map.css where the board splices it."""
    src = (REPO / "template" / "board.html").read_text(encoding="utf-8")
    s = src.index("<style>") + len("<style>")
    e = src.index("</style>", s)
    mapcss = (REPO / "web" / "map.css").read_text(encoding="utf-8")
    return src[s:e].replace("/*__MAP_CSS__*/", mapcss).replace("/*__WIKI_CSS__*/", "")


# --------------------------------------------------------------------------
# the feature's own stylesheet, all under re-
# --------------------------------------------------------------------------
RE_CSS = r"""
html,body{margin:0}
.re-board{position:relative;overflow:hidden}
.re-board .sd{height:100%}
.re-board .orb{opacity:1}
.re-board svg.re-i{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}

/* the control row: the bulk write, what it is worth, the modded-rent note */
.re-ctl{display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;min-height:52px}
.re-worth{font:500 12.5px/1 "IBM Plex Mono",monospace;color:var(--accent)}
.re-worth small{font-size:11.5px;color:var(--ink-3);margin-left:6px}
.re-mod{display:inline-flex;align-items:center;gap:7px;margin-left:auto;font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.re-mod b{display:inline-grid;place-items:center;height:20px;padding:0 7px;border-radius:5px;background:color-mix(in srgb,var(--info) 16%,transparent);color:var(--info);font-weight:600}

/* My buildings */
#pageEstate .re-t{table-layout:auto}
#pageEstate .re-t td{vertical-align:middle;padding-top:9px;padding-bottom:9px}
#pageEstate .re-t thead th{white-space:nowrap}
#pageEstate .re-t thead th.on{color:var(--ink)}
#pageEstate .re-t td.tg{width:30px;padding-right:0}
#pageEstate .re-t tr.re-row{cursor:pointer}
#pageEstate .re-t td.bd{min-width:230px}
.re-bd{display:flex;align-items:center;gap:8px}
.re-bd b{font-weight:600;font-size:13.5px;color:var(--ink)}
.re-bd .map-shortcut{opacity:0;transition:opacity .15s}
.re-bt .re-bd .map-shortcut{opacity:.6}
tr:hover .re-bd .map-shortcut,.re-show .re-bd .map-shortcut{opacity:1}
.re-sub{display:block;margin:3px 0 0 32px;font:400 11.5px/1.3 Archivo,sans-serif;color:var(--ink-3)}
.re-occ{display:inline-flex;align-items:center;gap:8px}
.re-occ i{position:relative;display:block;width:46px;height:5px;border-radius:3px;background:var(--rule);overflow:hidden}
.re-occ i b{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--ink-3)}
.re-occ i b.full{background:var(--accent)}
.re-occ span{min-width:34px;text-align:right}
.re-k{display:block;margin-top:3px;font-size:10.5px;color:var(--warn)}
.re-k.dim{color:var(--ink-3)}
.re-pend{display:inline-flex;align-items:center;gap:5px}
.re-pend s{color:var(--ink-3)}
.re-pend svg{width:11px;height:11px;stroke:var(--accent);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.re-pend b{color:var(--ink);font-weight:500}
.re-best{color:var(--ink)}
.re-gain{color:var(--accent);font-weight:500}
.re-gain.q{color:var(--ink-3);font-weight:400}
.re-gain.neg{color:var(--ink-2)}
.re-set{color:var(--ink-3);font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.04em}
.re-pb{color:var(--ink-2)}
#pageEstate .re-t td.act{width:1%;padding-left:4px}
#pageEstate .re-t td.act .gw-btn{height:28px;padding:0 10px 0 8px;font-size:12px}
.re-risk{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:2px 7px;border-radius:4px;background:#f0913a22;color:var(--warn);font:500 10.5px/1.4 "IBM Plex Mono",monospace;white-space:nowrap;cursor:help}
.re-risk svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2}
#pageEstate .re-t tfoot td{border-bottom:0;border-top:1px solid var(--rule);padding-top:12px;font-family:"IBM Plex Mono",monospace;font-weight:500;color:var(--ink)}
#pageEstate .re-t tfoot td.l{font-size:12.5px}
#pageEstate .re-t tfoot td small{display:block;margin-top:3px;font-size:11px;font-weight:400;color:var(--ink-3)}
#pageEstate .re-t tr.re-lit > td{background:color-mix(in srgb,var(--accent) 7%,transparent)}
#pageEstate .re-t tr.re-lit > td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
#pageEstate .re-t tr.re-lit.re-row:hover > td{background:color-mix(in srgb,var(--accent) 11%,transparent)}
.re-tog{width:22px;height:22px;border-radius:50%;border:1px solid var(--rule);display:grid;place-items:center;color:var(--ink-3);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.re-tog svg{width:10px;height:10px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
tr.re-opened .re-tog{transform:rotate(90deg);color:var(--ink)}
#pageEstate .re-t tr.re-opened > td{border-bottom-color:transparent;background:var(--surface)}
#pageEstate .re-t tr.re-det > td{padding:0 0 16px;background:var(--surface);border-bottom:1px solid var(--rule)}
#pageEstate .re-t tr.re-det:hover{background:none}
#pageEstate tr.re-hide{display:none}
.re-dt{display:flex;flex-direction:column;gap:6px;max-width:700px;padding:6px 18px 0 48px;font-family:Archivo,sans-serif;white-space:normal;text-align:left}
.re-spark{display:block;width:100%;height:auto;overflow:visible}
.re-spark .ax{stroke:var(--rule);stroke-width:1}
.re-spark .full{stroke:var(--rule);stroke-dasharray:2 3}
.re-spark .ln{fill:none;stroke:var(--ink-2);stroke-width:1.6;stroke-linejoin:round}
.re-spark .ar{fill:color-mix(in srgb,var(--ink-3) 14%,transparent);stroke:none}
.re-spark .pj{fill:none;stroke:var(--accent);stroke-width:1.6;stroke-dasharray:4 4}
.re-spark .wl{stroke:var(--warn);stroke-width:2;stroke-dasharray:2 3}
.re-spark .sep{stroke:var(--rule);stroke-width:1}
.re-spark .now{fill:var(--ink)}
.re-spark .end{fill:var(--accent)}
.re-spark text{font:500 9.5px "IBM Plex Mono",monospace;fill:var(--ink-3)}
.re-spark text.a{fill:var(--accent)}
.re-spark text.w{fill:var(--warn)}
.re-facts{margin:0;font-size:12.5px;line-height:1.7;color:var(--ink-2);white-space:nowrap}
.re-facts b{font:500 12.5px "IBM Plex Mono",monospace;color:var(--ink)}
.re-facts .sep{margin:0 8px;color:var(--rule)}
.re-facts em{font-style:normal;color:var(--accent)}
.re-more{display:flex;gap:14px;align-items:center;margin:12px 0 0 4px;font-size:12.5px;color:var(--ink-3)}
.re-more button{border:0;background:none;padding:0;color:var(--ink-2);font:500 12.5px/1 Archivo,sans-serif;cursor:pointer;border-bottom:1px solid var(--rule)}
.re-more button:hover{color:var(--ink);border-color:var(--ink-3)}

/* Buy a building: the head line, the tax panel, the list */
.re-head{display:inline-flex;align-items:baseline;gap:7px;font-size:13px;color:var(--ink-2)}
.re-head b{font:500 13px "IBM Plex Mono",monospace;color:var(--ink)}
.re-tax{position:relative;margin-top:18px;padding:18px 20px 16px;border:1px solid var(--rule);border-radius:14px;background:var(--surface);
  display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:8px 40px}
.re-tax.re-litbox{border-color:color-mix(in srgb,var(--accent) 60%,transparent);box-shadow:0 0 0 3px var(--accent-soft)}
.re-tax h3{display:flex;align-items:center;gap:10px;margin:0;font-size:15px;font-weight:600}
.re-tax h3 svg{width:17px;height:17px;stroke:var(--ink-2);fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.re-cd{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:11px;background:var(--raised);font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.re-cd.hot{background:#f0913a22;color:var(--warn)}
.re-eq{display:flex;align-items:baseline;flex-wrap:nowrap;gap:6px 12px;margin:16px 0 0;white-space:nowrap}
.re-eq .v{font:500 24px/1 "IBM Plex Mono",monospace;letter-spacing:-.02em;color:var(--ink)}
.re-eq .v.g{color:var(--accent)}
.re-eq .lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.re-eq svg{width:18px;height:18px;stroke:var(--ink-3);fill:none;stroke-width:1.8;align-self:center}
.re-meter{margin:18px 0 0}
.re-mbar{position:relative;height:10px;border-radius:5px;background:var(--rule-soft);box-shadow:inset 0 0 0 1px var(--rule)}
.re-mbar i{position:absolute;top:0;bottom:0;left:0;border-radius:5px}
.re-mbar i.cash{background:color-mix(in srgb,var(--accent) 22%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 55%,transparent)}
.re-mbar i.sp{background:var(--accent)}
.re-mbar u{position:absolute;top:-5px;bottom:-5px;width:2px;background:var(--ink);border-radius:1px}
.re-mlab{position:relative;height:30px;margin-top:6px;font:500 11px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3)}
.re-mlab span{position:absolute;top:0;white-space:nowrap}
.re-mlab span b{color:var(--ink);font-weight:500}
.re-mlab span.r{right:0;text-align:right}
.re-mlab span.lim{color:var(--accent)}
.re-mlab span.lim b{color:var(--accent)}
.re-left{display:flex;gap:26px;margin-top:6px}
.re-left div{display:flex;flex-direction:column;gap:6px}
.re-left .lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.re-left .v{font:500 15px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.re-picks{align-self:start;margin-top:2px}
.re-picks .lab{display:flex;justify-content:space-between;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);padding-bottom:9px;border-bottom:1px solid var(--rule)}
.re-pick{display:grid;grid-template-columns:minmax(0,1fr) auto 26px;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--rule-soft)}
.re-pick .re-bd b{font-size:13.5px}
.re-pick .p{font:500 13px "IBM Plex Mono",monospace;color:var(--ink)}
.re-pick .re-sub{margin-left:32px}
.re-pick .map-shortcut{opacity:1}
.re-pick.sum{border-bottom:0;font:500 12.5px "IBM Plex Mono",monospace;color:var(--ink-3)}
.re-pick.sum .p{color:var(--ink)}
.re-gh{display:flex;align-items:baseline;gap:14px;margin:30px 0 0;padding-bottom:10px}
.re-gh h3{margin:0;font-size:15px;font-weight:600}
.re-gh .n{font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
#pageEstate .re-bt td{vertical-align:middle;padding-top:9px;padding-bottom:9px}
#pageEstate .re-bt tr.re-dim > td{opacity:.42}
#pageEstate .re-bt tr.re-dim:hover > td{opacity:.75}
.re-you{display:inline-flex;align-items:center;gap:6px;margin:4px 0 0 32px;padding:2px 7px;border-radius:4px;background:color-mix(in srgb,var(--info) 16%,transparent);color:var(--info);font:500 10.5px/1.4 "IBM Plex Mono",monospace}
.re-you svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:1.9}
.re-no{color:var(--ink-3);font-family:Archivo,sans-serif;font-size:12.5px}
.re-ded{display:inline-block;margin-left:6px;color:var(--ink-3)}

.re-sic{display:inline-grid;place-items:center;width:20px;height:20px;color:var(--ink-3)}
.re-sic svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
/* static tooltip, the board's #tip drawn in place */
.re-tip{position:absolute;z-index:5;background:var(--tip-bg);color:var(--tip-ink);padding:7px 10px;border-radius:5px;font:400 12px/1.4 Archivo,sans-serif;max-width:300px;width:max-content;box-shadow:0 8px 24px -10px #0008}
.re-tip::before{content:"";position:absolute;top:-5px;left:var(--ax,20px);width:10px;height:10px;background:var(--tip-bg);transform:rotate(45deg)}
.re-tip.up::before{top:auto;bottom:-5px}
.re-hov{outline:2px solid color-mix(in srgb,var(--accent) 55%,transparent);outline-offset:2px;border-radius:4px}

/* the write dialogs, drawn open in place */
.re-stage{display:flex;align-items:flex-start;gap:56px;padding:56px 64px 64px}
.re-col{display:flex;flex-direction:column;gap:16px;width:480px;flex:none}
.re-state{display:flex;align-items:baseline;gap:10px;font:500 11px/1.3 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}
.re-state b{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1px solid var(--rule);color:var(--ink-2);letter-spacing:0}
.re-state span{text-transform:none;letter-spacing:0;font-family:Archivo,sans-serif;font-size:13px;color:var(--ink-2)}
.re-board .gw-dlg{display:flex;flex-direction:column;position:relative;max-height:none}
.re-board .gw-dlg .gw-body{overflow:hidden}
.re-board .gw-body{display:flex;flex-direction:column;gap:14px;padding:16px 20px 4px;min-height:0}
.re-board .gw-fix:empty{display:none}
.re-board .gw-foot{display:flex;align-items:center;gap:8px;padding:14px 20px 18px;flex:none}
.re-board .gw-gap{flex:1}
.re-fade{position:relative;max-height:340px;overflow:hidden}
.re-fade::after{content:"";position:absolute;left:0;right:0;bottom:0;height:56px;background:linear-gradient(transparent,var(--surface));pointer-events:none}
.re-gwk{display:inline-flex;align-items:center;gap:6px;font-family:"IBM Plex Mono",monospace;font-size:12px}
.re-gwk s{color:var(--ink-3)}
.re-gwk b{color:var(--ink);font-weight:500}
.re-gwk svg{width:11px;height:11px;stroke:var(--accent);fill:none;stroke-width:2}
.gw-shop .c.re-plus{color:var(--accent);font-size:12px}
.re-tick{color:var(--accent)}
.re-board #gwToast{position:absolute;left:auto;right:28px;bottom:24px;transform:none}
.re-boardnote{flex:none;height:36px;padding:0 24px;background:var(--surface);border-bottom:1px solid var(--rule-soft);display:flex;gap:10px;align-items:center;font:500 11px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3)}

/* the sidebar artboard: three sidebars side by side */
.re-sides{display:flex;gap:56px;padding:56px 64px;height:100%;box-sizing:border-box}
.re-side{display:flex;flex-direction:column;gap:14px}
.re-side .frame{position:relative;width:260px;height:780px;border:1px solid var(--rule-soft);border-radius:12px;overflow:hidden}
.re-side .frame.rail{width:76px}
.re-side .frame .sd{position:absolute;inset:0;height:100%}
.re-new{position:relative;border-radius:8px;box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 55%,transparent)}

/* finder For sale: the Payback column */
.fhead.sale.re-pbc,.place.fr.sale.re-pbc{grid-template-columns:26px 1fr 58px 44px 66px 64px}
.place.fr.sale .v.pb{color:var(--ink)}
.re-fx{display:grid;grid-template-columns:575px minmax(0,1fr);gap:0;height:716px;border:1px solid var(--rule-soft);border-radius:14px;background:var(--ground)}
.re-fx > img{border-radius:14px 0 0 14px}
.re-fx > img{display:block;width:575px;height:716px}
.re-fx .places{position:relative;max-height:none;overflow:visible;border-left:1px solid var(--rule-soft)}
.re-fx .places .list{max-height:462px;overflow:hidden}
"""

# --------------------------------------------------------------------------
# icons: the board's stroke set (template/board.js)
# --------------------------------------------------------------------------
I = {
    "estate": '<path d="M3 11.5 12 4l9 7.5"></path><path d="M5.5 9.5V20h13V9.5"></path><path d="M10 20v-5.5h4V20"></path>',
    "tag": '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.1 7.1a1 1 0 0 1-1.4 0z"></path><circle cx="8" cy="8" r="1.5"></circle>',
    "building": '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"></path><path d="M14 10h5a1 1 0 0 1 1 1v10M4 21h17M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1"></path>',
    "crate": '<path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z"></path><path d="M3.5 8.5 12 13l8.5-4.5M12 13v8"></path>',
    "crew": '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><circle cx="17" cy="9" r="2.5"></circle><path d="M15.5 14.5a5 5 0 0 1 6 5"></path>',
    "growth": '<path d="M4 18 10 12l4 4 6-7"></path><path d="M15 9h5v5"></path>',
    "sun": '<circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"></path>',
    "map": '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"></path><circle cx="12" cy="10" r="2"></circle>',
    "wiki": '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"></path><path d="M4 20.5V5.5M20 18v3H6.5"></path><path d="M9 8h7M9 11.5h5"></path>',
    "chev": '<path d="M9 6l6 6-6 6"></path>',
    "right": '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    "down": '<path d="M6 9l6 6 6-6"></path>',
    "alert": '<path d="M12 4l9 16H3z"></path><path d="M12 10v4.5M12 17.5v.01"></path>',
    "calendar": '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
    "key": '<circle cx="8" cy="14" r="4"></circle><path d="M11 11l9-8M16 6.5l3 3"></path>',
    "sort": '<path d="M12 5v14M6 13l6 6 6-6"></path>',
    "info": '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5M12 8v.01"></path>',
    "clock": '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3.5 2"></path>',
    "tick": '<path d="M5 12.5l4.5 4.5L19 7"></path>',
    "close": '<path d="M6 6l12 12M18 6L6 18"></path>',
    "undo": '<path d="M9 14L4 9l5-5"></path><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"></path>',
    "game": '<path d="M7 8.5h10a4.5 4.5 0 0 1 4.4 5.4l-.6 2.9a2.2 2.2 0 0 1-3.8 1L15 15.5H9l-2 2.3a2.2 2.2 0 0 1-3.8-1l-.6-2.9A4.5 4.5 0 0 1 7 8.5z"></path><path d="M8.5 11.5v3M7 13h3M15.5 12.3v.01M17.3 13.8v.01"></path>',
    "plug": '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"></path>',
    "more": '<circle cx="6" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="18" cy="12" r="1.4"></circle>',
    "panel": '<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><path d="M9 4.5v15"></path>',
    "lens": '<circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path>',
    "pin": '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"></path><circle cx="12" cy="10" r="2.2"></circle>',
    "back": '<path d="M15 6l-6 6 6 6"></path>',
}


def svg(name: str, cls: str = "re-i") -> str:
    c = f' class="{cls}"' if cls else ""
    return f'<svg{c} viewBox="0 0 24 24" aria-hidden="true">{I[name]}</svg>'


def esc(t: str) -> str:
    return html.escape(t, quote=True)


def n(v: float) -> str:
    return f"{v:,.0f}"


def usd(v: float, sign: bool = False) -> str:
    s = "−" if v < 0 else ("+" if sign and v > 0 else "")
    return f"{s}${abs(v):,.0f}"


def usd_m(v: float) -> str:
    s = "−" if v < 0 else ""
    v = abs(v)
    return s + (f"${v / 1e6:,.1f}M" if v < 1e9 else f"${v / 1e9:,.2f}bn")


def p2(v: float) -> str:
    return f"{v:.2f}"


HOODS = {"GD": ("garmentdistrict", "Garment District"), "HK": ("hellskitchen", "Hell's Kitchen"), "IC": ("industrycity", "Industry City"),
         "LM": ("lowermanhattan", "Lower Manhattan"), "MT": ("midtown", "Midtown"), "MH": ("murrayhill", "Murray Hill"), "HA": ("thehamptons", "The Hamptons")}
TYPES = {"retail": "Retail", "office": "Office", "residential": "Residential", "warehouse": "Warehouse", "cinema": "Cinema", "theater": "Theater"}


def hood(code: str) -> str:
    return f'<span class="hood" data-hood-color="ba:neighborhood_{HOODS[code][0]}">{code}</span>'


def mapbtn(addr: str) -> str:
    return (f'<button type="button" class="map-shortcut" aria-label="Show {esc(addr)} on map" title="Show on map">'
            f'{svg("map", "")}</button>')


def gw_btn(label: str, count: str = "", alt: bool = False, off: str = "", icon: str = "plug") -> str:
    if off:
        return (f'<button type="button" class="gw-btn off" aria-disabled="true" data-tip="{esc(off)}">{svg(icon, "")}'
                f'<span class="gw-l">{label}</span>{f"<span class=n>{count}</span>" if count else ""}</button>')
    return (f'<button type="button" class="gw-btn{" alt" if alt else ""}"><span class="gw-mw" aria-hidden="true"><i></i><b></b></span>'
            f'<span class="gw-l">{label}</span>{f"<span class=n>{count}</span>" if count else ""}</button>')


# --------------------------------------------------------------------------
# page chrome: the shipped sidebar (PR #169) with the sixth area
# --------------------------------------------------------------------------
AREAS = [("overview", "Overview", "sun"), ("businesses", "Businesses", "building"), ("supply", "Supply", "crate"),
         ("staffing", "Staffing", "crew"), ("expansion", "Expansion", "growth"), ("estate", "Real estate", "estate")]
VIEWS = {"estate": [("buildings", "My buildings"), ("buy", "Buy a building")],
         "expansion": [("demand", "Demand"), ("finder", "Find a location"), ("open", "Open a store"), ("factory", "Plan a factory")]}


def sidebar(area: str = "estate", view: str = "buildings", counts: dict | None = None, crit: int = 2, new: bool = False,
            hour: str = "21:46", day: int = DAY, lit_new: bool = False) -> str:
    counts = counts or {}
    rows = []
    for aid, lab, ic in AREAS:
        on = aid == area
        cls = ' class="on sd-open" aria-current="page"' if on and aid in VIEWS else (' class="on" aria-current="page"' if on else "")
        extra = f'<span class="nx-n">{crit}</span>' if aid == "overview" and crit else ""
        cv = "" if aid == "overview" else f'<svg class="nx-i sd-cv" viewBox="0 0 24 24" aria-hidden="true">{I["chev"]}</svg>'
        ring = ' style="box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 55%,transparent)"' if lit_new and aid == "estate" else ""
        rows.append(f'<a href="#{aid}" data-id="{aid}"{cls}{ring}>{svg(ic, "")}<span>{lab}</span>{extra}{cv}</a>')
        if on and aid in VIEWS:
            local = "".join(
                f'<a href="#{aid}/{k}"{" class=on aria-current=page" if k == view else ""}>{v}'
                f'{f"<small>{counts[k]}</small>" if counts.get(k) else ""}'
                f'{"<span class=feature-new>New</span>" if new and aid == "estate" else ""}</a>' for k, v in VIEWS[aid])
            rows.append(f'<nav class="nx-local" id="localNav" aria-label="{lab} views">{local}</nav>')
    wd = WEEKDAYS[(day - 1) % 7]
    return f"""<nav class="sd" id="mast" aria-label="Main">
  <div class="sd-in" id="sdIn">
    <div class="sd-head" id="sdHead"><div class="brand" id="brand"><span class="wordmark" id="title">Recover #1</span><span class="dot"></span></div>
    <div class="orb" aria-hidden="true" style="height:36px;width:36px;left:187px;top:26px"><i></i><u></u></div></div>
    <button type="button" class="ss-q" id="ssField" aria-label="Search the board"><span class="ss-lens">{svg("lens", "")}</span><span class="ss-ql">Search the board</span><span class="ss-kbd" aria-hidden="true">/</span></button>
    <div class="sd-areas" id="nav">{"".join(rows)}</div>
    <div class="sd-refs" id="navRefs" role="group" aria-label="Reference"><a href="#map">{svg("map", "")}<span>City map</span></a><a href="#wiki">{svg("wiki", "")}<span>Wiki</span></a></div>
    <div class="sd-foot">
      <div class="clock tr" id="clock"><b>Day {day}<i>·</i>{wd} {hour}</b><small>YEAR 6</small></div>
      <div class="sd-row" id="sdRow">
        <button type="button" class="sd-ib" aria-label="More">{svg("more", "")}</button>
        <button type="button" class="sd-ib sd-tog" aria-label="Collapse the sidebar"><svg class="nx-i" viewBox="0 0 24 24" aria-hidden="true">{I["panel"]}</svg></button>
      </div>
    </div>
  </div>
</nav>"""


def page(body: str, ctl: str = "", view: str = "buildings", counts: dict | None = None, arrive: str = "", area: str = "estate",
         host: str = "pageEstate", day: int = DAY, hour: str = "21:46", crit: int = 2) -> str:
    counts = counts if counts is not None else {"buildings": FLAGGED}
    arr = (f'<div class="nx-arrive" id="arrive" role="status"><button type="button" class="nx-back">{svg("back", "")}'
           f'<span>Needs attention</span></button><span>{arrive}</span></div>') if arrive else ""
    row = f'<div class="nx-localrow" id="localRow"><div class="nx-ctl" id="viewCtl" style="flex:1"><div class="re-ctl" style="flex:1">{ctl}</div></div></div>' if ctl else ""
    return f"""<div class="sd-app" id="sdApp" style="height:100%">
{sidebar(area, view, counts, day=day, hour=hour, crit=crit, new=True)}
<div class="wrap">
  {row}{arr}
  <div class="page" id="{host}"><section class="sec rv in">{body}</section></div>
</div>
</div>"""


# --------------------------------------------------------------------------
# My buildings
# --------------------------------------------------------------------------
OWNED = [o for o in DATA["owned"] if not o["villa"]]
VILLAS = [o for o in DATA["owned"] if o["villa"]]
FLAGGED = sum(o["flag"] for o in OWNED)
GAIN = sum(o["gain"] for o in OWNED if o["flag"])
NOW = sum(o["now"] for o in OWNED)
FULL = sum(o["full"] for o in OWNED)


def occ_cell(o: dict) -> str:
    w = max(0, min(100, o["occ"]))
    return (f'<span class="re-occ"><i><b class="{"full" if w >= 100 else ""}" style="width:{w}%"></b></i>'
            f'<span>{w}%</span></span>')


def price_cell(o: dict, pending: float | None = None, days: int = 7) -> str:
    if pending is not None:
        return (f'<span class="re-pend"><s>{p2(o["price"])}</s>{svg("right", "")}<b>{p2(pending)}</b></span>'
                f'<span class="re-k dim">in {days} days</span>')
    k = o["price"] / o["market"]
    sub = f'<span class="re-k">{(k - 1) * 100:+.0f}% over market</span>' if k >= 1.005 else ""
    return f'{p2(o["price"])}{sub}'


def gain_cell(o: dict, pending: bool = False, mult: float = 1) -> str:
    g = o["gain"] * mult
    if pending:
        return f'<span class="re-gain q">{usd(g, True)}</span><span class="re-k dim">set</span>'
    if o["risk"]:
        tip = ("At or above market rent while full: on 7% of days tenants move out. "
               f"{p2(o['best'])}, one cent under market, keeps it full.")
        return (f'<span class="re-gain neg">{usd(g, True)}</span><span class="re-risk" data-tip="{esc(tip)}" tabindex="0">'
                f'{svg("alert", "")}move-out risk</span>')
    if not o["flag"]:
        return f'<span class="re-gain q">{usd(g, True) if round(g) else "—"}</span>'
    return f'<span class="re-gain">{usd(g, True)}</span>'


def facts(o: dict, pending: float | None = None, mult: float = 1) -> str:
    sep = '<span class="sep">·</span>'
    parts = [f'Market rent <b>{o["market"]:.3f}</b> a m²',
             f'bought for <b>{usd(o["paid"])}</b> on day {o["day"]}']
    if pending is not None:
        parts.append(f'<b>{p2(pending)}</b> applies in 7 days, on day {DAY + 7}')
    if o["fill"]:
        parts.append(f'<em>fills in about {o["fill"]} days</em> at {p2(o["best"])}' if o["flag"] or pending is not None
                     else f'fills in about {o["fill"]} days')
    else:
        parts.append("full")
    return f'<p class="re-facts">{sep.join(parts)}</p>'


def spark(o: dict, pending: bool = True) -> str:
    """61 days of occupancy to today; then, on its own scale, the 7-day wait and the fill at the best price (dashed)."""
    hist = o["hist"] or [o["occ"]]
    past = len(hist)
    fut = (7 + o["fill"]) if (o["flag"] or pending) and o["fill"] else 0
    W, H, top, bot = 640, 104, 14, 80
    x0, xn = 6, 400 if fut else 590
    x = lambda i: x0 + i * (xn - x0) / max(past - 1, 1)
    xf = lambda d: xn + d * (590 - xn) / max(fut, 1)
    y = lambda v: bot - (bot - top) * v / 100
    pts = " ".join(f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(hist))
    area = f"{x(0):.1f},{bot} {pts} {x(past - 1):.1f},{bot}"
    first = DAY - past
    out = [f'<svg class="re-spark" viewBox="0 0 {W} {H}" role="img" aria-label="Occupancy, the last {past} days">',
           f'<line class="full" x1="{x0}" x2="590" y1="{y(100):.1f}" y2="{y(100):.1f}"></line>',
           f'<line class="ax" x1="{x0}" x2="590" y1="{bot}" y2="{bot}"></line>',
           f'<text x="598" y="{y(100) + 3:.1f}">100%</text><text x="598" y="{bot + 3}">0</text>',
           f'<polygon class="ar" points="{area}"></polygon><polyline class="ln" points="{pts}"></polyline>']
    nx, ny = x(past - 1), y(hist[-1])
    if fut:
        wx = xf(7)
        out.append(f'<line class="sep" x1="{nx:.1f}" x2="{nx:.1f}" y1="{top - 6}" y2="{bot + 4}"></line>')
        out.append(f'<line class="wl" x1="{nx:.1f}" x2="{wx:.1f}" y1="{ny:.1f}" y2="{ny:.1f}"></line>')
        out.append(f'<polyline class="pj" points="{wx:.1f},{ny:.1f} {xf(fut):.1f},{y(100):.1f}"></polyline>')
        out.append(f'<circle class="end" cx="{xf(fut):.1f}" cy="{y(100):.1f}" r="3"></circle>')
        out.append(f'<text class="w" x="{nx + 4:.1f}" y="{bot + 16}">7-day wait</text>')
        out.append(f'<text class="a" x="{xf(fut):.1f}" y="{bot + 16}" text-anchor="end">full \u2248 day {DAY + 7 + o["fill"]}</text>')
        out.append(f'<text x="{nx - 4:.1f}" y="{bot + 16}" text-anchor="end">today</text>')
    else:
        out.append(f'<text x="{nx:.1f}" y="{bot + 16}" text-anchor="end">today</text>')
    out.append(f'<circle class="now" cx="{nx:.1f}" cy="{ny:.1f}" r="3.2"></circle>')
    out.append(f'<text x="{x0}" y="{bot + 16}">day {first}</text>')
    out.append(f'<text x="{nx - 6:.1f}" y="{ny - 8:.1f}" text-anchor="end" style="fill:var(--ink)">{hist[-1]}%</text>')
    out.append("</svg>")
    return "".join(out)


def owned_row(o: dict, i: int, linked: bool = True, opened: bool = False, lit: bool = False, pending: float | None = None,
              mult: float = 1, hide: bool = False) -> str:
    cls = ["re-row"] + (["re-opened"] if opened else []) + (["re-lit"] if lit else []) + (["re-hide"] if hide else [])
    act = gw_btn("Set") if linked and o["flag"] and pending is None else ""
    now, full = o["now"] * mult, o["full"] * mult
    sub = f'{HOODS[o["hood"]][1]} · {TYPES[o["type"]]}'
    pb = round(o["payback"] / mult) if o["payback"] else None
    row = (f'<tr class="{" ".join(cls)}" data-re="{i}"><td class="tg"><span class="re-tog">{svg("chev", "")}</span></td>'
           f'<td class="l bd"><span class="re-bd">{hood(o["hood"])}<b>{esc(o["address"])}</b>{mapbtn(o["address"])}</span>'
           f'<span class="re-sub">{sub}</span></td>'
           f'<td>{n(o["sqm"])}</td><td>{occ_cell(o)}</td><td>{price_cell(o, pending)}</td><td>{usd(now)}</td>'
           f'<td class="re-best">{p2(o["best"])}</td><td>{gain_cell(o, pending is not None, mult)}</td>'
           f'<td class="re-pb">{n(pb)} d</td><td class="act">{act}</td></tr>')
    det = (f'<tr class="re-det{"" if opened else " re-hide"}" data-rex="{i}"><td colspan="10"><div class="re-dt">'
           f'<div>{spark(o, pending is not None)}</div><div>{facts(o, pending, mult)}</div></div></td></tr>')
    return row + det


def owned_table(rows: list[dict], linked: bool = True, show: int = 12, opened: tuple = (), lit_flagged: bool = False,
                pending: dict | None = None, mult: float = 1, show_all: bool = False) -> str:
    pending = pending or {}
    head = ('<thead><tr><th></th><th class="l">Building</th><th>m²</th><th>Occupancy</th>'
            '<th data-tip="Rent a m² a day; a new price waits 7 days in the game">Price / m²</th><th>Income / day</th>'
            '<th data-tip="The highest cent under market rent: nobody moves out, and the building fills to 100%">Best price</th>'
            f'<th class="on" data-i="7">Gain / day{svg("sort", "sort")}</th>'
            '<th data-tip="The price you paid, over a day\'s rent at the best price, full, less property tax">Payback</th><th></th></tr></thead>')
    body = []
    for i, o in enumerate(rows):
        hide = (not show_all) and i >= show
        body.append(owned_row(o, i, linked, o["address"] in opened, lit_flagged and o["flag"], pending.get(o["address"]), mult, hide))
    occ = sum(o["occ"] * o["sqm"] for o in rows) / sum(o["sqm"] for o in rows)
    foot = (f'<tfoot><tr><td></td><td class="l">{len(rows)} buildings<small>+ {len(VILLAS)} villas, no rent income</small></td>'
            f'<td>{n(sum(o["sqm"] for o in rows))}</td><td>{occ:.0f}%</td><td></td><td>{usd(NOW * mult)}<small>full {usd(FULL * mult)}</small></td><td></td>'
            f'<td class="re-gain">{usd(GAIN * mult, True)}</td><td></td><td></td></tr></tfoot>')
    off = sum(o["flag"] for o in rows[show:])
    off_rest = "" if pending or not off else f", {off} of them off their best price"
    more = "" if show_all or len(rows) <= show else (
        f'<div class="re-more"><button type="button" data-re-all>Show all {len(rows)}</button>'
        f'<span>{len(rows) - show} more{off_rest}</span></div>')
    return f'<div class="scrollx"><table class="re-t">{head}<tbody>{"".join(body)}</tbody>{foot}</table></div>{more}'


def owned_ctl(linked: bool = True, mod: str = "", mult: float = 1, done: bool = False, old_mod: bool = False) -> str:
    if old_mod:
        btn = gw_btn("Set best prices", str(FLAGGED), off="Update the Big Copilot Link mod to set rent from here (version 0.6.0 or later)")
    elif done:
        btn = ""
    else:
        btn = gw_btn("Set best prices", str(FLAGGED)) if linked else ""
    worth = "" if done else (f'<span class="re-worth">{usd(GAIN * mult, True)} a day'
                             f'<small>once full</small></span>')
    m = f'<span class="re-mod" data-tip="Your rent income is 5 times what the game\'s own rules pay: a mod. Measured from yesterday\'s rent income at every building with a steady price." tabindex="0"><b>Rent ×5</b>measured from yesterday\'s income</span>' if mod else ""
    return btn + worth + m


def board_buildings() -> str:
    return page(owned_table(OWNED), owned_ctl())


def board_open() -> str:
    return page(owned_table(OWNED, opened=("4 Ocean Crest Road", "6 Ocean Crest Road"), show=12), owned_ctl())


def board_modded() -> str:
    return page(owned_table(OWNED, mult=5, show=10), owned_ctl(mod="x5", mult=5))


def board_after() -> str:
    pend = {o["address"]: o["best"] for o in OWNED if o["flag"]}
    toast = (f'<div id="gwToast" role="status"><span class="ic" aria-hidden="true">{svg("tick", "")}</span><span class="t">'
             f'Best prices set at {FLAGGED} buildings<small>They apply on day {DAY + 7}</small></span>'
             f'<button type="button" class="gw-b undo">{svg("undo", "")}<span>Undo</span></button>'
             f'<button type="button" class="gw-x" aria-label="Dismiss">{svg("close", "")}</button></div>')
    rows = sorted(OWNED, key=lambda o: -o["gain"])
    body = owned_table(rows, pending=pend, opened=("7 Seventh Avenue",), show=9)
    return page(body, owned_ctl(done=True), counts={}) + toast


def board_nolink() -> str:
    return page(owned_table(OWNED, linked=False, show=10), owned_ctl(linked=False))


# --------------------------------------------------------------------------
# the write dialog: Set best prices
# --------------------------------------------------------------------------
def wire(state: str) -> str:
    return (f'<span class="gw-w {state}" aria-hidden="true"><span class="a"></span><span class="ln"></span>'
            f'<i class="p"></i><i class="p"></i><i class="p"></i><span class="g">{svg("game", "")}</span></span>')


def dialog(title: str, where: str, verdict: str, body: str, foot: str, state: str = "ask", meta: str = "Sun 21:46") -> str:
    m = f'<span class="gw-meta">{meta}</span>' if meta else ""
    return f"""<div class="gw-dlg" role="dialog" aria-label="{esc(title)}">
<div class="gw-head"><span class="gw-kind" aria-hidden="true">{svg("tag", "")}</span><div><h2>{title}</h2><div class="gw-where">{where}</div></div>
<button type="button" class="gw-x" aria-label="Close">{svg("close", "")}</button></div>
<div class="gw-verdict">{wire(state)}<span>{verdict}</span>{m}</div>
<div class="gw-body">{body}</div>
<div class="gw-foot">{foot}</div>
</div>"""


def b(label: str, kind: str = "ghost", icon: str = "") -> str:
    ic = svg(icon, "go" if icon == "right" else "") if icon else ""
    lead = ic if icon in ("undo",) else ""
    tail = "" if lead else ic
    return f'<button type="button" class="gw-b {kind}">{lead}<span>{label}</span>{tail}</button>'


def dlg_row(o: dict, done: bool = False) -> str:
    tick = f'<span class="re-tick">{svg("tick", "")}</span>' if done else ""
    read = f'Occupancy {o["occ"]}% now · fills in about {o["fill"]} days' if o["fill"] else "Full · keeps every tenant"
    return (f'<div class="gw-shop gw-mkrow" tabindex="0" data-read="{esc(read)}"><div class="nm">{hood(o["hood"])}<span>{esc(o["address"])}</span>{tick}</div>'
            f'<span class="c re-plus">{usd(o["gain"], True)}/day</span>'
            f'<span class="gw-mk"><span class="re-gwk"><s>{p2(o["price"])}</s>{svg("right", "")}<b>{p2(o["best"])}</b></span> a m²</span></div>')


def tally(k: int) -> str:
    fl = flagged()
    return (f'<div class="gw-tally"><div><span class="gw-lab">Rent now, a day</span><span class="gw-big dim">{usd(sum(o["now"] for o in fl))}</span></div>'
            f'<div><span class="gw-lab">Once full, a day</span><span class="gw-big">{usd(sum(o["now"] + o["gain"] for o in fl))}</span></div>'
            f'<div><span class="gw-lab">Buildings</span><span class="gw-big dim">{k}</span></div></div>')


WAIT_NOTE = ('<div class="gw-call info"><span class="gw-i">' + svg("clock", "") + '</span><div>Each price applies after the game\'s '
             '<b>7-day wait</b>, on day ' + str(DAY + 7) + '. The buildings then fill over the weeks after; the gain is what they earn once full.</div></div>')


def flagged() -> list[dict]:
    return [o for o in OWNED if o["flag"]]


def dlg_ready() -> str:
    rows = "".join(dlg_row(o) for o in flagged()[:9])
    body = (tally(FLAGGED) + WAIT_NOTE + f'<div data-readzone><div class="re-fade"><div class="gw-shops">{rows}</div></div>'
            f'<div class="gw-read sp-readout">&nbsp;</div></div>')
    foot = f'<span class="gw-hint">Nothing changes until you apply</span>{b("Cancel")}{b(f"Set {FLAGGED} prices", "go", "right")}'
    return dialog(f"Set best prices at {FLAGGED} buildings", "", f"<b>The game will set {FLAGGED} prices</b>", body, foot)


def dlg_done() -> str:
    rows = "".join(dlg_row(o, True) for o in flagged()[:5])
    body = (f'<div class="gw-ok"><span class="ic">{svg("tick", "")}</span><p><b>{FLAGGED} prices wait in the game.</b> '
            f'They apply on day {DAY + 7}; occupancy climbs from then.</p></div>'
            f'<div class="gw-reread done">{svg("tick", "")}<span>The board shows the game as it now stands</span></div>'
            f'<div class="re-fade" style="max-height:230px"><div class="gw-shops">{rows}</div></div>')
    foot = f'<span class="gw-hint">Undo puts back all {FLAGGED} prices at once.</span>{b("Undo", "", "undo")}{b("Close", "go")}'
    return dialog(f"Set best prices at {FLAGGED} buildings", "", "<b>Done in the game</b>", body, foot, "ok", "Sun 21:47")


def dlg_one() -> str:
    o = next(x for x in OWNED if x["address"] == "22 Fourth Avenue")
    body = (f'<div class="gw-tally"><div><span class="gw-lab">Now, a day</span><span class="gw-big dim">{usd(o["now"])}</span></div>'
            f'<div><span class="gw-lab">Full, a day</span><span class="gw-big">{usd(o["full"])}</span></div>'
            f'<div><span class="gw-lab">Price / m²</span><span class="gw-big dim" style="font-size:22px">{p2(o["price"])} → {p2(o["best"])}</span></div></div>'
            + '<div class="gw-call info"><span class="gw-i">' + svg("clock", "") + '</span><div>The price applies after the game\'s '
            f'<b>7-day wait</b>, on day {DAY + 7}. The building then fills in about {o["fill"]} days; nobody moves out at this price.</div></div>')
    foot = f'<span class="gw-hint">Nothing changes until you apply</span>{b("Cancel")}{b("Set the price", "go", "right")}'
    where = f'{hood(o["hood"])}<span>{o["address"]}</span>'
    return dialog("Set the best price", where, "<b>The game will set 1 price</b>", body, foot)


def dlg_notlinked() -> str:
    body = ('<p class="gw-said gw-neg">The board is no longer linked to the same game. Nothing was sent.</p>'
            '<p class="gw-sub">Load the city in the game, or switch the board to it, then try again.</p>')
    foot = f'{b("Close")}<span class="gw-gap"></span>'
    return dialog(f"Set best prices at {FLAGGED} buildings", "", "<b>Not linked</b>", body, foot, "no")


def col(k: str, label: str, content: str) -> str:
    return f'<div class="re-col"><div class="re-state"><b>{k}</b><span>{label}</span></div>{content}</div>'


def board_dialogs() -> str:
    return ('<div class="re-stage">'
            + col("1", f"Set best prices, from the view's button: {FLAGGED} changes, largest gain first", dlg_ready())
            + col("2", "Applied", dlg_done())
            + col("3", "One row's Set", dlg_one())
            + col("4", "The link dropped before apply", dlg_notlinked())
            + "</div>")


def board_link_states() -> str:
    """Without the link no write button exists; with a mod older than 0.6.0 the button says why it is off."""
    a = page(owned_table(OWNED, linked=False, show=6), owned_ctl(linked=False))
    c = page(owned_table(OWNED, linked=False, show=6), owned_ctl(old_mod=True))
    def half(label: str, inner: str) -> str:
        return (f'<div style="display:flex;flex-direction:column;height:50%;border-bottom:1px solid var(--rule)">'
                f'<div class="re-boardnote">{label}</div><div style="flex:1;min-height:0;position:relative">{inner}</div></div>')
    return half("No game link: no write button; the best price is the figure to copy in BizMan", a) + half("Linked, but the mod is older than 0.6.0", c)


# --------------------------------------------------------------------------
# Buy a building
# --------------------------------------------------------------------------
BUY = DATA["buy"]
TAX = DATA["tax"]
CASH = DATA["cash"]
PAYBACKS = sorted(x["payback"] for x in BUY if x["payback"])
MEDIAN_PB = PAYBACKS[len(PAYBACKS) // 2]


def round_to(v: int, k: int) -> int:
    return int(k * round(v / k))


def buy_row(x: dict, hide: bool = False) -> str:
    dim = x["price"] > CASH
    tip = f' data-tip="{usd(x["price"] - CASH)} more than your cash"' if dim else ""
    sub = f'{HOODS[x["hood"]][1]} · {TYPES[x["type"]]} · {n(x["sqm"])} m²'
    if not x["listed"]:
        sub += " · not listed, offer 1% over market value"
    you = (f'<span class="re-you" data-tip="You run {esc(x["biz"] or "a business")} here: buying it ends the rent you pay">'
           f'{svg("key", "")}You rent here · saves {usd(x["saves"])}/day</span>') if x["saves"] else ""
    inc = f'<span class="re-no">No rent income</span>' if x["villa"] else usd(x["income"])
    pb = "—" if not x["payback"] else f'{n(x["payback"])} d'
    cls = " ".join(c for c in ["re-dim" if dim else "", "re-hide" if hide else ""] if c)
    return (f'<tr class="{cls}"{tip}><td class="l bd"><span class="re-bd">{hood(x["hood"])}<b>{esc(x["address"])}</b>{mapbtn(x["address"])}</span>'
            f'<span class="re-sub">{sub}</span>{you}</td>'
            f'<td>{usd(x["price"])}</td><td>{inc}</td><td>{pb}</td></tr>')


def buy_table(rows: list[dict], sort: str = "price", show: int = 10) -> str:
    on = lambda k: (' class="on" data-dir="desc"' if False else ' class="on"') if sort == k else ""
    arrow = svg("sort", "sort")
    head = (f'<thead><tr><th class="l">Building</th><th{on("price")} data-i="1">Price{arrow if sort == "price" else ""}</th>'
            f'<th data-tip="A day\'s rent at the best price, once full">Rent / day</th>'
            f'<th{on("payback")} data-i="3" data-tip="The price over a day\'s rent at the best price, full, plus any rent it saves you, less property tax">Payback{arrow if sort == "payback" else ""}</th></tr></thead>')
    body = "".join(buy_row(x, i >= show) for i, x in enumerate(rows))
    more = (f'<div class="re-more"><button type="button" data-re-all>Show all {n(len(rows))}</button>'
            f'<span>{sum(1 for x in rows if x["price"] <= CASH)} within your cash</span></div>')
    return f'<div class="scrollx"><table class="re-t re-bt">{head}<tbody>{body}</tbody></table></div>{more}'


def tax_panel(day: int = DAY, lit: bool = False) -> str:
    picks = [next(x for x in BUY if x["key"] == k) for k in TAX["pick"]]
    left = TAX["taxDay"] - day
    cd = f'<span class="re-cd{" hot" if left <= 1 else ""}">{svg("calendar", "")}day {TAX["taxDay"]} · {"tomorrow" if left == 1 else f"in {left} days"}</span>'
    base, cash, spend = TAX["base"], TAX["cash"], TAX["spend"]
    top = max(base, cash)
    pc = lambda v: f"{100 * v / top:.2f}%"
    meter = (f'<div class="re-meter"><div class="re-mbar"><i class="cash" style="width:{pc(cash)}"></i><i class="sp" style="width:{pc(spend)}"></i>'
             f'<u style="left:{pc(cash)}"></u></div><div class="re-mlab">'
             f'<span class="lim" style="left:0">your cash <b>{usd_m(cash)}</b> · the limit</span>'
             f'<span class="r">projected taxable sales <b>{usd_m(base)}</b></span></div></div>')
    tip = ("A retail, office, cinema, theater or warehouse building bought before the day-360 midnight is deducted in full "
           "from this year's taxable sales. Sales so far are scaled to the whole year; the figure firms up on the last day. "
           "Spending past the taxable sales saves nothing.")
    rows = "".join(f'<div class="re-pick"><div><span class="re-bd">{hood(x["hood"])}<b>{esc(x["address"])}</b></span>'
                   f'<span class="re-sub">{TYPES[x["type"]]} · {n(x["sqm"])} m²</span></div><span class="p">{usd(x["price"])}</span>{mapbtn(x["address"])}</div>'
                   for x in picks)
    rows += f'<div class="re-pick sum"><span>{len(picks)} buildings</span><span class="p">{usd(spend)}</span><span></span></div>'
    return f"""<div class="re-tax{" re-litbox" if lit else ""}" id="reTax">
<div>
  <h3>{svg("calendar", "")}Before tax day {cd}<span class="why" data-tip="{esc(tip)}" tabindex="0"><i>?</i></span></h3>
  <div class="re-eq"><span class="lab">Spend</span><span class="v">{usd(spend)}</span>{svg("right", "")}<span class="lab">tax</span><span class="v g">{usd(-TAX["saves"])}</span><span class="lab">at {TAX["rate"]}%</span></div>
  {meter}
  <div class="re-left"><div><span class="lab">Cash left</span><span class="v">{usd(TAX["left"])}</span></div></div>
</div>
<div class="re-picks"><div class="lab"><span>Buy these</span><span>Price</span></div>{rows}</div>
</div>"""


def buy_ctl(sort: str = "price") -> str:
    return (f'<span class="seg" role="group" aria-label="Sort by"><a href="#"{" class=on" if sort == "price" else ""}>Price</a>'
            f'<a href="#"{" class=on" if sort == "payback" else ""}>Payback</a></span>' + head_line())


def head_line() -> str:
    return (f'<span class="re-head">Every building pays back in about <b>{n(round_to(MEDIAN_PB, 50))} days</b> at the best price</span>')


def by_payback() -> list[dict]:
    return sorted(BUY, key=lambda x: (x["payback"] is None, x["payback"] or 0))


def board_buy() -> str:
    body = tax_panel() + f'<div class="re-gh"><h3>For sale</h3><span class="n">{n(len(BUY))}</span></div>' + buy_table(BUY)
    return page(body, buy_ctl(), view="buy")


def board_buy_payback() -> str:
    body = tax_panel() + f'<div class="re-gh"><h3>For sale</h3><span class="n">{n(len(BUY))}</span></div>' + buy_table(by_payback(), "payback")
    return page(body, buy_ctl("payback"), view="buy")


# --------------------------------------------------------------------------
# Needs attention: the two findings, and where they land
# --------------------------------------------------------------------------
def finding(sev: str, site: str, what: str, tip: str, vz: str, act: str, act_tip: str, pri: bool = False, det: str | None = None, now: str = "",
            lit: bool = False) -> str:
    detb = (f'<button type="button" class="nx-btn sm ghost ov-det" aria-expanded="{"true" if det else "false"}"><span>Details</span>'
            f'<svg class="nx-i" viewBox="0 0 24 24" aria-hidden="true">{I["down"]}</svg></button>') if det is not None else '<span class="ov-det-none"></span>'
    x = f'<div class="ov-x" role="region">{det}</div>' if det else ""
    nw = f'<span class="ov-now">{now}</span>' if now else ""
    ring = ' style="box-shadow:inset 3px 0 0 var(--accent);background:color-mix(in srgb,var(--accent) 6%,transparent)"' if lit else ""
    return f"""<div class="find {sev} ov-f"{ring}>
    <span class="mark" tabindex="0"></span>
    <div class="ov-t"><span class="ov-l1"><span class="site">{site}</span>
    <button type="button" class="what" data-tip="{esc(tip)}">{what}</button></span>{nw}</div>
    <div class="ov-vz">{vz}</div>
    {detb}
    <span class="ov-ac"><a class="nx-btn{" pri" if pri else ""} ov-act" href="#" data-tip="{esc(act_tip)}">{act}{svg("right", "")}</a></span>
    <span class="go">{svg("right", "")}</span>{x}
    </div>"""


def cmp(a: tuple, b_: tuple) -> str:
    top = max(a[1], b_[1])
    return (f'<div class="ov-cmp" role="img"><span>{a[0]}</span><span class="bar"><i style="width:{100 * a[1] / top:.1f}%"></i></span><span class="n">{n(a[1])}</span>'
            f'<span>{b_[0]}</span><span class="bar"><i class="w" style="width:{100 * b_[1] / top:.1f}%"></i></span><span class="n">{n(b_[1])}</span></div>')


def estate_site(label: str = "Real estate") -> str:
    return f'<span class="re-sic">{svg("estate", "")}</span><a class="ss-sl" href="#">{label}</a>'


def rent_finding(lit: bool = False, open_: bool = False) -> str:
    top = flagged()[:3]
    det = ('<div><span class="lab">Largest</span>' + "".join(
        f'<p class="ov-plan"><span class="sb-chg"><s>{p2(o["price"])}</s><span class="to">{svg("right", "")}</span><b>{p2(o["best"])}</b><small>a m²</small></span> '
        f'<span>{o["address"]} · {usd(o["gain"], True)}/day</span></p>' for o in top) + f'<p class="ov-plan quiet">and {FLAGGED - 3} more</p></div>') if open_ else None
    return finding("opp", estate_site(), f"{FLAGGED} buildings priced off their best rent · {usd(GAIN, True)}/day",
                   "Rent price. Buildings priced over market rent lose tenants; one cent under keeps them and fills to 100%. "
                   "The gain comes after the game's 7-day wait and the weeks the buildings take to fill.",
                   cmp(("Rent now a day", NOW), ("At best prices", NOW + GAIN)), "Review rent prices", "Opens Real estate › My buildings",
                   det=det if open_ else "", lit=lit)


def tax_finding() -> str:
    return finding("watch", estate_site("Buy a building"),
                   f"Tax day tomorrow: buy {len(TAX['pick'])} buildings for {usd_m(TAX['spend'])}, tax {usd_m(-TAX['saves'])}",
                   "Before tax day. Retail, office, cinema, theater and warehouse purchases are deducted in full from this year's taxable "
                   "sales, until the day-360 midnight.",
                   "", "Review the buildings", "Opens Real estate › Buy a building", pri=True,
                   now=f"cash {usd_m(CASH)} · the limit · {usd(TAX['left'])} left after")


def board_attention() -> str:
    ov = f"""<div id="alertHead"><div class="ov-head"><h2 id="ovTitle">Needs attention</h2><span class="why" tabindex="0"><i>?</i></span>
<button type="button" class="sev crit" aria-pressed="true"><i></i>2<span>critical</span></button><button type="button" class="sev watch" aria-pressed="true"><i></i>2<span>warnings</span></button><button type="button" class="sev opp" aria-pressed="true"><i></i>12<span>opportunities</span></button>
<div class="aside"><button type="button" class="nx-btn sm ghost">Customize checks</button></div></div></div>
<div class="finds" id="alerts">
<div class="ov-band crit">Critical</div>
{finding("crit", '<span class="hood" data-hood-color="ba:neighborhood_midtown">MT</span><a class="ss-sl" href="#">HART.&amp;Partners</a>', "Lost $37,524 yesterday", "Losing money.", "", "Review results", "Opens Businesses › Results", pri=True)}
<div class="ov-band watch">Warnings</div>
<div style="position:relative">{tax_finding()}<span class="re-new" style="position:absolute;inset:0;pointer-events:none"></span></div>
{finding("watch", '<span class="hood" data-hood-color="ba:neighborhood_garmentdistrict">GD</span><a class="ss-sl" href="#">Import Hub</a>', "9 factory inputs are not fed as the machines need", "Factory inputs.", "", "Review factory input", "Opens Supply › Production", det="")}
<div class="ov-band opp">Opportunities</div>
<div style="position:relative">{rent_finding(open_=True)}<span class="re-new" style="position:absolute;inset:0;pointer-events:none"></span></div>
{finding("opp", '<span class="hood" data-hood-color="ba:neighborhood_thehamptons">HA</span><a class="ss-sl" href="#">Adelphos Theater</a>', "4,139 Paper Bag held with nothing moving out", "Idle stock.", "", "Review idle stock", "Opens Supply › Deliveries", det="")}
{finding("opp", '<span class="hood" data-hood-color="ba:neighborhood_midtown">MT</span><a class="ss-sl" href="#">Living Dreams Theater</a>', "3,263 Paper Bag held with nothing moving out", "Idle stock.", "", "Review idle stock", "Opens Supply › Deliveries", det="")}
</div>"""
    return page(f'<div class="page" style="margin-top:-12px"><section class="sec rv in" id="alertSection" style="margin-top:28px">{ov}</section></div>',
                area="overview", view="", counts={}, host="pageToday", day=TAX["taxDay"] - 1, hour="08:10")


def board_land_rent() -> str:
    return page(owned_table(OWNED, lit_flagged=True, show=FLAGGED + 2), owned_ctl(),
                arrive=f"<b>{FLAGGED} buildings priced off their best rent</b>")


def board_land_tax() -> str:
    body = tax_panel(TAX["taxDay"] - 1, lit=True) + f'<div class="re-gh"><h3>For sale</h3><span class="n">{n(len(BUY))}</span></div>' + buy_table(BUY, show=5)
    return page(body, buy_ctl(), view="buy", counts={"buildings": FLAGGED, "buy": 1},
                arrive=f"<b>Tax day tomorrow: buy {len(TAX['pick'])} buildings</b>", day=TAX["taxDay"] - 1, hour="08:10")


# --------------------------------------------------------------------------
# the sidebar
# --------------------------------------------------------------------------
def board_sidebar() -> str:
    def frame(inner: str, label: str, rail: bool = False) -> str:
        return f'<div class="re-side"><div class="re-state"><span>{label}</span></div><div class="frame{" rail" if rail else ""}">{inner}</div></div>'
    closed = sidebar(area="overview", view="", lit_new=True)
    opened = sidebar(area="estate", view="buildings", counts={"buildings": FLAGGED}, new=True)
    eve = sidebar(area="estate", view="buy", counts={"buildings": FLAGGED, "buy": 1}, day=TAX["taxDay"] - 1, hour="08:10")
    return ('<div class="re-sides">'
            + frame(closed, "On the Overview: the sixth area")
            + frame(opened, f"Real estate open: {FLAGGED} to set, both views New")
            + frame(eve, "Day 359, the last day before tax day")
            + '</div>')


# --------------------------------------------------------------------------
# Find a location › For sale
# --------------------------------------------------------------------------
MAP_BLOB = "/_blob/53058c8f950b544c47725758cc9d36b8"  # img/map-dark.jpg, uploaded to the canvas's asset store


def img(name: str) -> str:
    """The canvas links the uploaded map; the previews carry it inline."""
    if name == "map-canvas.jpg":
        return MAP_BLOB
    return "data:image/jpeg;base64," + base64.b64encode((HERE / "img" / name).read_bytes()).decode()


SALE_TIP = ("Whole buildings for sale, with the rent they earn at the best price once full. "
            f"Payback is about {n(round_to(MEDIAN_PB, 50))} days for every one of them, so the list is cheapest first.")


def finder(sort: str = "price", theme: str = "dark", tip: bool = False) -> str:
    rows = [x for x in BUY if x["listed"] and x["type"] == "retail"]
    rows = sorted(rows, key=(lambda x: x["price"]) if sort == "price" else (lambda x: x["payback"] or 9e9))[:12]
    hd = lambda k, lab: f'<span data-s="{k}"{" class=on" if sort == k else ""} tabindex="0">{lab}</span>'
    head = f'<div class="fhead sale re-pbc"><span></span><span>Address</span><span>Type</span><span>m²</span>{hd("price", "Price")}{hd("payback", "Payback")}</div>'
    body = "".join(
        f'<button type="button" class="place fr sale re-pbc">{hood(x["hood"])}<span class="nm">{esc(x["address"])}<small><span class="lp-tag">{x["layout"]}</span>{HOODS[x["hood"]][1]}</small></span>'
        f'<span class="v t">Retail</span><span class="v">{x["unit"]}</span><span class="v">{usd_m(x["price"])}</span><span class="v pb">{n(x["payback"])} d</span></button>'
        for x in rows)
    chips = "".join(f'<button type="button" class="fchip cat{" on" if c == "Retail" else ""}">{c}</button>' for c in ["Retail", "Office", "Warehouse", "Cinema", "Theater"])
    hoods = "".join(f'<button type="button" class="fchip hd on" data-hood-color="ba:neighborhood_{v[0]}">{k}</button>' for k, v in HOODS.items())
    tipbox = (f'<div class="re-tip" style="left:200px;top:120px;--ax:124px">{esc(SALE_TIP)}</div>') if tip else ""
    panel = f"""<aside class="places fonly" style="position:relative"><div class="filters fonly">
<div class="frow"><span class="lab">Kind</span>{chips}</div>
<div class="frow"><span class="lab">Show</span><button type="button" class="fchip show">Available<b>189</b></button><button type="button" class="fchip show">To take over<b>72</b></button><button type="button" class="fchip show on{" re-hov" if tip else ""}" data-tip="{esc(SALE_TIP)}">For sale<b>220</b></button><span class="why" tabindex="0"><i>?</i></span></div>
<div class="frow"><span class="lab">Where</span>{hoods}</div>
<div class="frow"><span class="lab">Size</span><label class="fchip num">min<input type="number" value="0"><b>m²</b></label><label class="fchip num">max<input type="number" value="0"><b>m²</b></label></div>
<div class="frow"><span class="lab">Traffic</span><label class="fchip num">min<input type="number" value="0"></label></div>
</div><div class="list">{head}{body}</div>{tipbox}</aside>"""
    return f'<div class="re-fx"><img src="{img("map-" + theme + ".jpg")}" alt="The city map with the buildings for sale lit">{panel}</div>'


def board_finder(theme: str = "dark") -> str:
    def blk(label: str, inner: str) -> str:
        return f'<div style="display:flex;flex-direction:column;gap:12px"><div class="re-state"><span>{label}</span></div>{inner}</div>'
    body = ('<div style="display:grid;grid-template-columns:1fr;gap:40px;padding-top:28px">'
            + blk("For sale, cheapest first (the default), and the new tip on the For sale chip", finder("price", theme, tip=True))
            + blk("Sorted by Payback: click the column head", finder("payback", theme))
            + "</div>")
    return page(f'<div class="page" style="margin-top:-30px">{body}</div>', area="expansion", view="finder", counts={}, host="pageMap")


# --------------------------------------------------------------------------
# behaviour every artboard carries
# --------------------------------------------------------------------------
WIRE = r"""
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a) e.preventDefault(); });
    $$('tr.re-row').forEach(tr => tr.addEventListener('click', e => {
      if (e.target.closest('a, button')) return;
      const det = tr.parentElement.querySelector(`tr[data-rex="${tr.dataset.re}"]`); if (!det) return;
      const on = det.classList.contains('re-hide'); det.classList.toggle('re-hide', !on); tr.classList.toggle('re-opened', on);
    }));
    $$('[data-re-all]').forEach(b => b.addEventListener('click', () => {
      const t = b.closest('.re-more').previousElementSibling.querySelector('table');
      $$('tbody > tr.re-hide', t).forEach(r => { if (!r.matches('[data-rex]')) r.classList.remove('re-hide'); });
      b.closest('.re-more').remove();
    }));
    $$('[data-readzone]').forEach(zone => {
      const out = zone.querySelector('.sp-readout'); if (!out) return; const rest = out.innerHTML;
      $$('[data-read]', zone).forEach(el => el.addEventListener('mouseenter', () => { out.textContent = el.dataset.read; }));
      zone.addEventListener('mouseleave', () => { out.innerHTML = rest; });
    });
"""

LOGIC = ("class Component extends DCLogic {\n"
         "  renderVals() { const dark = this.props.dark ?? true;\n"
         "    try { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); } catch (e) {}\n"
         "    return { theme: dark ? 'dark' : 'light' }; }\n"
         "  componentDidMount() {" + WIRE + "  }\n}")

PAGE = """<!doctype html>
<html lang="en" data-theme="dark">
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
<div class="re-board" data-theme="{{theme}}" style="width: __W__px; height: __H__px; background: var(--ground); color: var(--ink);">
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
<html lang="en" data-theme="__THEME__"><head><meta charset="utf-8"><title>__TITLE__</title>
<link rel="stylesheet" href="__FONTS__"><style>__CSS__</style></head>
<body><div class="re-board" style="width: __W__px; height: __H__px; background: var(--ground); color: var(--ink);">
__BODY__
</div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""

W = 1440
# file, title, builder, width, height (heights measured from the previews)
BOARDS = [
    ("Sidebar.dc.html", "1 · Sidebar: the sixth area, Real estate", board_sidebar, 1100, 900),
    ("Main.dc.html", "2 · My buildings", board_buildings, W, 1030),
    ("Opened.dc.html", "3 · My buildings: rows opened in place", board_open, W, 1330),
    ("Modded.dc.html", "2b · My buildings: a save with rent ×5 (a mod)", board_modded, W, 900),
    ("After.dc.html", "2c · My buildings: after Set best prices", board_after, W, 1180),
    ("Dialogs.dc.html", "4 · Set best prices: the write dialog", board_dialogs, 64 * 2 + 4 * 480 + 3 * 56, 900),
    ("LinkStates.dc.html", "4b · Without the link, and with an older mod", board_link_states, W, 1500),
    ("Buy.dc.html", "5 · Buy a building", board_buy, W, 1130),
    ("BuyPayback.dc.html", "5b · Buy a building, sorted by Payback", board_buy_payback, W, 1370),
    ("Attention.dc.html", "6 · Needs attention, day 359", board_attention, W, 820),
    ("LandRent.dc.html", "6b · The rent finding's landing", board_land_rent, W, 2370),
    ("LandTax.dc.html", "6c · The tax-eve finding's landing", board_land_tax, W, 880),
    ("Finder.dc.html", "7 · Find a location › For sale: Payback", board_finder, W, 1760),
]
TIPS = {
    "Sidebar.dc.html": "Real estate is the sixth area, after Expansion. Its views carry the board's to-do count: My buildings counts the buildings off their best price; Buy a building counts only on the last day before tax day.",
    "Main.dc.html": f"Sorted by gain, largest first; 12 shown, then Show all. Click any row to open it. Set best prices writes all {FLAGGED} through the game link; Set does one. The three full buildings at or over market (move-out risk) sit at the end of the flagged rows: Show all, then hover the chip.",
    "Opened.dc.html": "A row opened: 61 days of occupancy, then (dashed) the 7-day wait and the fill at the best price. One facts line beside it.",
    "Modded.dc.html": "Illustrative: Peter's save is vanilla, so these are his numbers ×5. The only new thing on screen is the quiet Rent ×5 note, right of the button; hover it.",
    "After.dc.html": "After the write: each new price waits beside the old one with its days to go, the gain greys to 'set', the button goes, and the Undo strip holds the write.",
    "Dialogs.dc.html": "The shipped write-dialog language (the wire, the tally, one row a building). Hover a row in 1: the line under the list says its occupancy and fill time.",
    "LinkStates.dc.html": "No link: no write button anywhere, as on the rest of the board; the best price is the figure to copy in BizMan. An older mod: the button stays, dashed, with the plug and the reason.",
    "Buy.dc.html": "One head line instead of a payback ranking. Before tax day: cash is the limit here, two listed buildings come to $924 under it. The list is cheapest first; dimmed rows cost more than your cash (hover one).",
    "BuyPayback.dc.html": "Payback sort: the buildings you rent in lead, since buying one also ends the rent you pay there.",
    "Attention.dc.html": "Day 359. The tax-eve finding (a warning, it is gone tomorrow) and the grouped rent finding (an opportunity, Details open) are outlined.",
    "LandRent.dc.html": "Landing from the rent finding: the arrive strip, every flagged row lit, the three move-out risks last among them (hover their chip).",
    "LandTax.dc.html": "Landing from the tax-eve finding: the panel lit, the countdown amber, Buy a building carries 1.",
    "Finder.dc.html": "The For sale list gains Payback, and Price / Payback sort by their column heads, as the other lists do. The tip on the For sale chip is new (drawn open in the first).",
}


def css() -> str:
    return board_css() + RE_CSS


def build(preview: bool = False) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    style = css()
    boards, order, notes = {}, [], {}
    layout = {"Sidebar.dc.html": (0, 0), "Main.dc.html": (1300, 0), "Opened.dc.html": (2940, 0), "Modded.dc.html": (1300, 1700),
              "After.dc.html": (2940, 1700), "Dialogs.dc.html": (4580, 0), "LinkStates.dc.html": (4580, 1400),
              "Buy.dc.html": (0, 3400), "BuyPayback.dc.html": (1640, 3400), "Attention.dc.html": (3280, 3400),
              "LandRent.dc.html": (4920, 3400), "LandTax.dc.html": (6560, 3400), "Finder.dc.html": (0, 5100)}
    for name_, title, builder, w, h in BOARDS:
        for theme in (("dark", "light") if preview else ("dark",)):
            body = builder(theme) if builder is board_finder else builder()
            if theme == "dark":
                cbody = builder("canvas") if builder is board_finder else body
                props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"}, "$preview": {"width": w, "height": h}}
                page_ = (PAGE.replace("__TITLE__", "Real estate: " + esc(title)).replace("__FONTS__", FONTS.replace("&", "&amp;"))
                         .replace("__CSS__", style).replace("__W__", str(w)).replace("__H__", str(h))
                         .replace("__BODY__", cbody)
                         .replace("__PROPS__", json.dumps(props, separators=(",", ":"), ensure_ascii=False).replace("'", "&#39;"))
                         .replace("__LOGIC__", LOGIC))
                (ROOT / name_).write_text(page_, encoding="utf-8", newline="\n")
            if preview:
                out = HERE / "_preview"
                out.mkdir(exist_ok=True)
                (out / f"{name_.split('.')[0]}-{theme}.html").write_text(
                    PREVIEW.replace("__TITLE__", esc(title)).replace("__FONTS__", FONTS.replace("&", "&amp;")).replace("__CSS__", style)
                    .replace("__THEME__", theme).replace("__W__", str(w)).replace("__H__", str(h))
                    .replace("__BODY__", body).replace("__WIRE__", WIRE),
                    encoding="utf-8", newline="\n")
        bx, by = layout[name_]
        boards[name_] = {"x": bx, "y": by, "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name_)
        notes["try-" + name_.split(".")[0].lower()] = {"x": bx, "y": by - 230, "w": 620, "maxH": 190, "text": TIPS[name_]}
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Real Estate", "launch": {"view": "canvas"},
             "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards")


if __name__ == "__main__":
    build("--preview" in sys.argv)
