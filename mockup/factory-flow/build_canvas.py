"""Generates the Expansion > Plan a factory canvas (issue #172): project/*.dc.html and project/canvas.json.

The factory counterpart of the shipped Open a store flow (`drawOpenStore()` and the `os*`
functions in ba_dashboard.py, docs/open-a-store-scope.md): what to make, where, the investment
(and an optional loan), the checklist until production runs, and output against plan after it.
Peter decided against a break-even figure for factories (1 Oct 2026). Decisions, open questions and the porting plan are NOTES.md beside this file.

The board's stylesheet comes from mockup/revamp/build_canvas.py, the write dialogs' from
mockup/write-dialogs/build_write_canvas.py, so the palette, type and the game-link language never
drift. The store flow's own canvas stylesheet (os- classes, branch open-store-canvas, commit
e8802364) is copied in below unchanged, because the shipped board kept those class names: the
factory flow is drawn in the store flow's parts. Everything only the factory needs is ff-.

Game facts: recipes and workstations from web/wiki-data.json (the game's help pages), machine and
furniture prices `Item.defaultMarketPrice` from ba_item_prices.json, wholesale prices, vendors,
vehicles and banks from ba_store_rules.json, buildings, rents and deposits from ba_buildings.json
through `_rent_estimate()` / `_deposit_estimate()`, positions from web/maps/locations.json. The
company, its sites, sales, cash, wages and history are invented.

Two uploaded map assets: MAP_URL is the Manhattan crop the store canvas used; IC_URL is
web/maps/full-map.png cropped to the Industry City inset's bounds (locations.json regions). The
map's insets have their own scales, so no distance is measured across them. `--preview` writes
plain HTML into _preview/ (both themes) and expects local copies as _preview/map.jpg and
_preview/ic.jpg; do not commit _preview/. Never hand-edit project/: change this and rerun.

Published at https://claude.ai/artifact/HVNSkyctB3YTsfTGCDoLWu.
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE / "project"
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "revamp"))
sys.path.insert(0, str(HERE.parent / "write-dialogs"))
sys.path.insert(0, str(HERE.parent / "site-panel"))
from build_canvas import CSS as BOARD_CSS, ICON  # noqa: E402
import build_write_canvas as gw  # noqa: E402
from build_site_canvas import P as SP_P  # noqa: E402

CREATED_AT = "2026-10-01T12:00:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
MAP_URL = "/_blob/44427ce1e0f35462021999606a89258a"
IC_URL = "/_blob/a8ee365856a2c2ee93a7111323805dbb"
MAINLAND = (585.706943, 142.56, 1066.346114, 1036.8)  # locations.json regions[mainland].bounds
IC_BOUNDS = (60.48, 145.014545, 449.28, 571.810909)  # regions[industry-city].bounds

# --------------------------------------------------------------------------
# icons: path fragments only, wrapped by svg()
# --------------------------------------------------------------------------
P = {**{k: re.sub(r"^<svg[^>]*>|</svg>$", "", v) for k, v in ICON.items()}, **SP_P, **gw.P,
     "search": '<circle cx="11" cy="11" r="6.5"></circle><path d="M20 20l-4.2-4.2"></path>',
     "map": '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"></path><path d="M9 4v14M15 6v14"></path>',
     "wiki": '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"></path><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"></path>',
     "side": '<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><path d="M9 4.5v15"></path>',
     "store": '<path d="M4 10v10h16V10"></path><path d="M3 10l2-6h14l2 6"></path><path d="M3 10c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"></path><path d="M10 20v-5h4v5"></path>',
     "cart": '<path d="M3 4h2l2.4 11h10.2L20 8H7"></path><circle cx="9" cy="19" r="1.4"></circle><circle cx="17" cy="19" r="1.4"></circle>',
     "factory": '<path d="M3 21V10l6 4V10l6 4V6h6v15z"></path><path d="M7 17h2M12 17h2M17 17h2"></path>',
     "flag": '<path d="M5 21V4"></path><path d="M5 4h11l-2 4 2 4H5"></path>',
     "minus": '<path d="M6 12h12"></path>',
     "ship": '<path d="M3 15l2 5h14l2-5z"></path><path d="M6 15V9h12v6M12 9V4M9 6h6"></path>',
     "bridge": '<path d="M2 16h20M4 16V9M20 16V9M4 9c4 5 12 5 16 0"></path><path d="M8 16v-3.5M12 16v-2.5M16 16v-3.5"></path>',
     "desk": '<rect x="3" y="5" width="18" height="11" rx="1.5"></rect><path d="M8 20h8M12 16v4"></path>',
     }


def svg(name: str, cls: str = "") -> str:
    c = f' class="{cls}"' if cls else ""
    return f'<svg{c} viewBox="0 0 24 24" aria-hidden="true">{P[name]}</svg>'


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def money(v: float, sign: bool = False) -> str:
    s = f"${abs(v):,.0f}"
    if v < 0:
        return "−" + s
    return ("+" + s) if sign else s


def n(v: float) -> str:
    return f"{v:,.0f}"


# --------------------------------------------------------------------------
# the store flow's stylesheet, as its canvas drew it (os-)
# --------------------------------------------------------------------------
OS_CSS = r"""
/* the redesign's tokens on top of the revamp's */
.board{--ink-3:#808a84;--neg-soft:#ff625722;--warn-soft:#f0913a22;--info-soft:#6ea8ff1f;--on-accent:#08130d}
.board.light{--ink-3:#636c71;--warn:#b34d00;--neg-soft:#cc2a201a;--warn-soft:#b34d001a;--info-soft:#2a5ea81a;--on-accent:#ffffff}
.board.os{min-width:0;min-height:0;padding:0;overflow:hidden}
.os svg{flex:none}
.os-i svg,.os-ico{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}

/* the shipped sidebar, variant B ------------------------------------------------ */
.os-app{display:grid;grid-template-columns:256px minmax(0,1fr);height:100%}
.os-sd{display:flex;flex-direction:column;height:100%;padding:22px 14px 16px;border-right:1px solid var(--rule);background:var(--ground)}
.os-sdh{position:relative;display:flex;align-items:flex-start;height:62px;padding:6px 8px 0;border-bottom:1px solid var(--rule)}
.os-sdh .brand{align-items:center}
.os-sdh .wordmark{font-size:21px}
.os-sdh .dot{width:8px;height:8px;align-self:flex-end;margin-bottom:5px}
.os-orb{position:absolute;right:4px;top:0;width:36px;height:36px;border-radius:50%;background:radial-gradient(circle at 34% 30%,#9be8b8,#3aa865 52%,#17532f 100%);box-shadow:0 6px 18px #43c07a33}
.os-q{display:flex;align-items:center;gap:9px;height:36px;margin:14px 0 6px;padding:0 7px 0 10px;border:1px solid var(--rule);border-radius:8px;background:var(--surface);color:var(--ink-2);font-size:13px}
.os-q svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round}
.os-q kbd{margin-left:auto;font:500 11px/1 "IBM Plex Mono",monospace;padding:3px 6px;border:1px solid var(--rule);border-radius:5px;color:var(--ink-3)}
.os-areas{display:flex;flex-direction:column;gap:1px;margin-top:8px}
.os-areas>a{display:flex;align-items:center;gap:10px;min-height:38px;padding:0 10px;border-radius:8px;color:var(--ink-2);font-size:14px;font-weight:500;text-decoration:none}
.os-areas>a:hover{color:var(--ink);background:var(--surface)}
.os-areas>a>svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.os-areas>a.open{color:var(--ink)}
.os-areas>a .cv{margin-left:auto;width:13px;height:13px;stroke:var(--ink-3);stroke-width:2}
.os-n{margin-left:auto;font:600 10.5px/1 "IBM Plex Mono",monospace;padding:3px 6px;border-radius:9px;background:var(--neg);color:#fff}
.os-views{display:flex;flex-direction:column;gap:1px;margin:2px 0 6px 19px;padding-left:12px;border-left:1px solid var(--rule)}
.os-views a{display:flex;align-items:center;gap:8px;height:31px;padding:0 10px;border-radius:6px;color:var(--ink-2);font-size:13.5px;font-weight:500;text-decoration:none}
.os-views a:hover{color:var(--ink);background:var(--surface)}
.os-views a.on{background:var(--ink);color:var(--ground)}
.os-new{margin-left:auto;font:600 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;padding:3px 5px;border-radius:4px;background:var(--accent-soft);color:var(--accent)}
.os-views a.on .os-new{background:var(--ground);color:var(--accent)}
.os-refs{display:flex;flex-direction:column;gap:1px;margin-top:12px;padding-top:12px;border-top:1px solid var(--rule-soft)}
.os-refs a{display:flex;align-items:center;gap:10px;min-height:34px;padding:0 10px;border-radius:8px;color:var(--ink-2);font-size:13.5px;font-weight:500;text-decoration:none}
.os-refs a svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.os-sdf{margin-top:auto;padding-top:14px;border-top:1px solid var(--rule)}
.os-clock{padding:0 8px}
.os-clock b{display:block;font:500 14.5px/1.2 "IBM Plex Mono",monospace}
.os-clock small{display:block;margin-top:4px;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;color:var(--ink-3)}
.os-sdrow{display:flex;gap:8px;margin-top:12px}
.os-ib{display:inline-grid;place-items:center;width:36px;height:36px;padding:0;border:1px solid var(--rule);border-radius:8px;background:var(--surface);color:var(--ink-2);cursor:pointer}
.os-ib svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.os-ib.r{margin-left:auto}

/* the page beside it ------------------------------------------------------------------ */
.os-main{min-width:0;padding:0 40px 56px;overflow:hidden}
.os-ctl{display:flex;align-items:center;flex-wrap:wrap;gap:10px 16px;min-height:58px;border-bottom:1px solid var(--rule-soft)}
.os-ctl .aside{margin-left:auto;display:flex;align-items:center;gap:10px}
.os-lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.os-seg{display:inline-flex;padding:3px;gap:2px;border:1px solid var(--rule);border-radius:9px;background:var(--surface)}
.os-seg a{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 12px;border-radius:6px;color:var(--ink-2);font-size:12.5px;font-weight:500;text-decoration:none;white-space:nowrap}
.os-seg a:hover{color:var(--ink)}
.os-seg a.on{background:var(--ink);color:var(--ground)}
.os-seg a b{font:500 12px/1 "IBM Plex Mono",monospace}
.os-seg.big a{height:40px;padding:0 16px;font-size:13.5px}
.os-seg.big a b{font-size:13.5px}
.os-seg.big a small{font:500 11px/1 "IBM Plex Mono",monospace;opacity:.7}

/* the six steps --------------------------------------------------------------------------- */
.os-steps{display:flex;align-items:center;gap:2px}
.os-steps a{display:flex;align-items:center;gap:8px;height:34px;padding:0 12px 0 6px;border-radius:17px;color:var(--ink-3);font-size:13px;font-weight:500;text-decoration:none;white-space:nowrap}
.os-steps a:hover{color:var(--ink)}
.os-steps a i{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1px solid var(--rule);font:600 11px/1 "IBM Plex Mono",monospace;font-style:normal}
.os-steps a i svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.os-steps a.done{color:var(--ink-2)}
.os-steps a.done i{background:var(--accent-soft);border-color:transparent;color:var(--accent)}
.os-steps a.on{background:var(--surface);color:var(--ink);box-shadow:inset 0 0 0 1px var(--rule)}
.os-steps a.on i{background:var(--ink);border-color:var(--ink);color:var(--ground)}
.os-steps .sep{width:10px;height:1px;background:var(--rule)}
.os-planpick{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 10px 0 12px;border:1px solid var(--rule);border-radius:9px;background:var(--surface);color:var(--ink-2);font-size:12.5px;white-space:nowrap}
.os-planpick b{color:var(--ink);font-weight:600}
.os-planpick svg{width:12px;height:12px;stroke:var(--ink-3);fill:none;stroke-width:2;transform:rotate(90deg)}

/* the plan, one strip -------------------------------------------------------------------- */
.os-pb{display:grid;grid-template-columns:1fr 1.5fr 1.15fr 1.15fr;margin-top:22px;border:1px solid var(--rule-soft);border-radius:12px;background:var(--surface)}
.os-pb>div{display:flex;flex-direction:column;gap:6px;min-width:0;padding:13px 16px 12px;border-left:1px solid var(--rule-soft)}
.os-pb>div:first-child{border-left:0}
.os-pb b{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.os-pb b.m{font:500 17px/1.1 "IBM Plex Mono",monospace;letter-spacing:-.01em}
.os-pb small{font-size:12px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.os-pb .dim{color:var(--ink-3);font-weight:500}

/* buttons ---------------------------------------------------------------------------------- */
.os-cta{display:inline-flex;align-items:center;justify-content:center;gap:9px;height:40px;padding:0 16px;border-radius:10px;border:1px solid var(--accent);background:var(--accent);color:var(--on-accent);font:600 13.5px/1 Archivo,sans-serif;text-decoration:none;white-space:nowrap;cursor:pointer}
.os-cta:hover{filter:brightness(1.08);color:var(--on-accent)}
.os-cta svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.os-cta.sm{height:34px;padding:0 13px;font-size:12.5px;border-radius:9px}
.os-btn{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:9px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);font:500 12.5px/1 Archivo,sans-serif;text-decoration:none;white-space:nowrap;cursor:pointer}
.os-btn:hover{border-color:var(--ink-3);color:var(--ink)}
.os-btn svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.os-btn.q{border-color:transparent;background:none;color:var(--ink-2)}
.os-link{color:var(--ink-2);text-decoration:none;border-bottom:1px solid var(--rule);font-size:12.5px}
.os-link:hover{color:var(--ink);border-color:var(--ink-3)}

/* cards and headings ------------------------------------------------------------------------ */
.os-h{display:flex;align-items:center;gap:12px;margin:34px 0 14px}
.os-h h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em}
.os-h .c{font:500 12.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.os-h .aside{margin-left:auto;display:flex;align-items:center;gap:10px}
.os-card{padding:18px 20px;border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft)}
.os-card h3{margin:0 0 12px;font-size:14.5px;font-weight:600}
.os-two{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:24px;align-items:start}
.hood.mt,.hood.hk,.hood.mh,.hood.gd,.hood.lm,.hood.ha,.hood.ic{color:var(--ink-2)}
.os-tag{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 7px;border-radius:5px;background:var(--raised);border:1px solid var(--rule-soft);color:var(--ink-2);font:500 11.5px/1 Archivo,sans-serif;white-space:nowrap}
.os-tag svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.os-tag.dem{background:var(--info-soft);border-color:transparent;color:var(--info)}
.os-tag.req{background:var(--accent-soft);border-color:transparent;color:var(--accent)}
.os-tag.cap{background:var(--warn-soft);border-color:transparent;color:var(--warn)}
.os-mono{font-family:"IBM Plex Mono",monospace}
.os-dim{color:var(--ink-3)}

/* step 1: what -------------------------------------------------------------------------------- */
.os-dl td{padding:11px 10px}
.os-dl td.l b{display:block;font-weight:600;color:var(--ink)}
.os-dl .sc{display:inline-grid;place-items:center;width:40px;height:26px;border-radius:6px;font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.os-dl td.go{width:1%;padding-right:2px}
.os-dl td.go a{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:8px;border:1px solid var(--rule);color:var(--ink-2)}
.os-dl td.go a svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.os-types{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.os-type{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 12px;border-radius:9px;border:1px solid var(--rule-soft);background:var(--ground);color:var(--ink);font-size:13px;font-weight:500;text-decoration:none}
.os-type:hover{border-color:var(--ink-3);color:var(--ink)}
.os-type small{margin-left:auto;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--accent)}
.os-sub{margin:16px 0 8px;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.os-plans{display:flex;flex-direction:column;border-top:1px solid var(--rule)}
.os-plan{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1.2fr) 130px 120px 20px;gap:16px;align-items:center;min-height:62px;padding:8px 6px;border-bottom:1px solid var(--rule-soft);color:inherit;text-decoration:none}
.os-plan:hover{background:var(--surface);color:inherit}
.os-plan b{display:block;font-size:14px;font-weight:600}
.os-plan small{display:block;margin-top:3px;font-size:12px;color:var(--ink-3)}
.os-plan .v{font:500 13px/1.3 "IBM Plex Mono",monospace;text-align:right}
.os-plan>svg{width:14px;height:14px;stroke:var(--ink-3);fill:none;stroke-width:2}
.os-meter{display:block;height:4px;margin-top:7px;border-radius:2px;background:var(--rule);overflow:hidden}
.os-meter i{display:block;height:100%;width:var(--w);background:var(--accent);border-radius:2px}
.os-meter.w i{background:var(--warn)}

/* the Demand grid with a picked cell --------------------------------------------------------------- */
.os-grid{position:relative;margin-top:26px}
.os-grid .heat{grid-template-columns:190px repeat(7,minmax(0,1fr));gap:5px}
.os-grid .cell{height:40px;cursor:pointer}
.os-grid .cell.mine{outline:1.5px solid var(--accent);outline-offset:-1.5px}
.os-grid .cell.picked{outline:2px solid var(--ink);outline-offset:-2px;transform:scale(1.06);z-index:2;box-shadow:0 10px 30px #0008}
.os-grid .r a{color:var(--ink-3);text-decoration:none;border-bottom:1px solid var(--rule)}
.os-pop{position:absolute;z-index:5;width:300px;padding:16px;border-radius:12px;background:var(--surface);border:1px solid var(--rule);box-shadow:0 24px 60px -18px #000d}
.light .os-pop{box-shadow:0 24px 60px -24px #1a1f1c77}
.os-pop::before{content:"";position:absolute;right:146px;top:-7px;width:12px;height:12px;background:var(--surface);border-left:1px solid var(--rule);border-top:1px solid var(--rule);transform:rotate(45deg)}
.os-pop h4{margin:0;font-size:15px;font-weight:600}
.os-pop .fx{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0 14px}
.os-pop .fx div{display:flex;flex-direction:column;gap:5px}
.os-pop .fx b{font:500 16px/1 "IBM Plex Mono",monospace}
.os-pop .acts{display:flex;flex-direction:column;gap:8px}
.os-pop .acts .os-cta,.os-pop .acts .os-btn{justify-content:center}

/* step 2: where (the finder, filtered) ------------------------------------------------------------------ */
.os-finder{display:grid;grid-template-columns:minmax(0,1fr) 540px;gap:18px;margin-top:22px;padding:16px;border-radius:14px;border:1px solid var(--rule-soft);background:color-mix(in srgb,var(--surface) 55%,transparent)}
.os-map{position:relative;align-self:start;border-radius:10px;overflow:hidden;border:1px solid var(--rule-soft);background:#0d100f}
.os-map img{display:block;width:100%;height:auto}
.os-map .zoom{position:absolute;right:10px;bottom:10px;display:flex;flex-direction:column;gap:6px}
.os-map .zoom span{display:grid;place-items:center;width:30px;height:30px;border-radius:7px;background:#151917;border:1px solid #262c28;color:#9aa39d;font:500 15px/1 Archivo,sans-serif}
.os-pin{position:absolute;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;pointer-events:none}
.os-pin b{display:grid;place-items:center;min-width:22px;height:22px;padding:0 5px;border-radius:11px;background:#43c07a;color:#08130d;font:600 11px/1 "IBM Plex Mono",monospace;box-shadow:0 0 0 3px #0d100fcc}
.os-pin i{width:2px;height:8px;background:#43c07a}
.os-pin.dim b{background:#262c28;color:#e9ece6;box-shadow:0 0 0 2px #0d100fcc}
.os-pin.dim i{background:#6b756f}
.os-pin.store b{background:#6ea8ff;color:#0d100f}
.os-pin.store i{background:#6ea8ff}
.os-pin.new b{background:#e9ece6;color:#0d100f;letter-spacing:.08em;font-size:10px}
.os-pin.new i{background:#e9ece6}
.os-pin em{margin-top:3px;padding:2px 6px;border-radius:4px;background:#0d100fdd;color:#e9ece6;font:500 10.5px/1.2 Archivo,sans-serif;font-style:normal;white-space:nowrap}
.os-fp{display:flex;flex-direction:column;min-width:0}
.os-fr{display:grid;grid-template-columns:78px minmax(0,1fr);gap:10px;align-items:center;min-height:34px}
.os-fr>span:first-child{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.os-fr .row{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.os-ch{display:inline-flex;align-items:center;gap:6px;height:27px;padding:0 9px;border-radius:6px;border:1px solid var(--rule);color:var(--ink-2);font:500 12px/1 "IBM Plex Mono",monospace;white-space:nowrap}
.os-ch.on{border-color:color-mix(in srgb,var(--accent) 55%,transparent);background:var(--accent-soft);color:var(--ink)}
.os-ch.set{font-family:Archivo,sans-serif;font-weight:600;font-size:12.5px}
.os-ch svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:1.8}
.os-ft{margin-top:10px;border-top:1px solid var(--rule)}
.os-ft th,.os-ft td{padding:8px 6px;font-size:12.5px}
.os-ft td.l b{display:block;font-weight:600;font-size:13px}
.os-ft td.l small{display:block;margin-top:2px;font-size:11.5px;color:var(--ink-3)}
.os-ft .sc{display:inline-grid;place-items:center;width:36px;height:24px;border-radius:5px;font:600 12px/1 "IBM Plex Mono",monospace}
.os-ft tr.pick td{background:color-mix(in srgb,var(--accent) 7%,transparent)}
.os-ft tr.pick td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
.os-ft tr.more td{padding:4px 6px 14px;border-bottom:1px solid var(--rule)}
.os-pick{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:10px;background:var(--ground);border:1px solid var(--rule-soft);font-family:Archivo,sans-serif;white-space:normal}
.os-pick .fx{display:flex;gap:18px;font-size:12px;color:var(--ink-3)}
.os-pick .fx b{display:block;margin-top:4px;font:500 13.5px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.os-pick .os-cta{margin-left:auto}

/* step 3: investment ------------------------------------------------------------------------------------ */
.os-toolbar{display:flex;align-items:center;gap:16px;margin-top:26px}
.os-toolbar .aside{margin-left:auto;display:flex;align-items:center;gap:14px;font-size:12.5px;color:var(--ink-3)}
.os-toolbar .aside b{font:500 13px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.os-inv{margin-top:16px}
.os-inv th,.os-inv td{padding:9px 12px}
.os-inv td.l{font-size:13.5px}
.os-inv td.w{text-align:left;font-family:Archivo,sans-serif}
.os-inv td .sub{margin-top:2px}
.os-inv tr.grp td{padding:14px 12px 7px;background:none;border-bottom:1px solid var(--rule);font:500 10.5px/1.3 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.os-inv tr.grp td span{margin-left:10px;letter-spacing:0;text-transform:none;font-family:Archivo,sans-serif;font-size:12px;color:var(--ink-3)}
.os-inv tr.grp td b{float:right;letter-spacing:0;color:var(--ink-2);font-weight:500}
.os-inv td.free{color:var(--accent)}
.os-inv tfoot td{padding:14px 12px;font-size:15px}
.os-inv tfoot td.l{font-family:Archivo,sans-serif;font-weight:600}
.os-self{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:24px;align-items:start;margin-top:16px}
.os-store{border:1px solid var(--rule-soft);border-radius:12px;background:var(--surface);overflow:hidden}
.os-store+.os-store{margin-top:14px}
.os-sh{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--rule-soft)}
.os-sh .k{display:grid;place-items:center;width:26px;height:26px;border-radius:13px;background:#6ea8ff;color:#0d100f;font:600 12px/1 "IBM Plex Mono",monospace}
.os-sh .k.p{background:var(--ink-2);color:var(--ground)}
.os-sh b{font-size:14px;font-weight:600}
.os-sh small{display:block;margin-top:2px;font-size:12px;color:var(--ink-3)}
.os-sh .t{margin-left:auto;font:500 15px/1 "IBM Plex Mono",monospace}
.os-store table th,.os-store table td{padding:7px 16px;font-size:12.5px}
.os-store table td.w{text-align:left;font-family:Archivo,sans-serif}
.os-store table tr.del td{color:var(--ink-3)}
.os-total{display:flex;align-items:baseline;gap:14px;margin-top:18px;padding:16px;border-radius:12px;border:1px solid var(--rule);background:var(--surface)}
.os-total b{margin-left:auto;font:500 22px/1 "IBM Plex Mono",monospace}
.os-total span{font-size:14px;font-weight:600}
.os-total small{font-size:12px;color:var(--ink-3)}
.os-maplist{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.os-maplist div{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:10px;align-items:center;font-size:12.5px;color:var(--ink-2)}
.os-maplist i{display:grid;place-items:center;width:20px;height:20px;border-radius:10px;background:#6ea8ff;color:#0d100f;font:600 10.5px/1 "IBM Plex Mono",monospace;font-style:normal}
.os-maplist i.n{background:var(--ink);color:var(--ground);font-size:8.5px}
.os-maplist b{font:500 12.5px/1 "IBM Plex Mono",monospace;color:var(--ink)}

/* step 4: break even -------------------------------------------------------------------------------------- */
.os-be{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:22px;margin-top:22px;align-items:start}
.os-big{display:flex;gap:28px;margin-bottom:12px}
.os-big div{display:flex;flex-direction:column;gap:6px}
.os-big b{font:500 30px/1 "IBM Plex Mono",monospace;letter-spacing:-.02em}
.os-big b small{font-size:13px;color:var(--ink-3);letter-spacing:0;margin-left:4px}
.os-big .alt b{color:var(--ink-2)}
.os-chart{display:block;width:100%;height:auto;overflow:visible}
.os-chart text{font:500 10.5px "IBM Plex Mono",monospace;fill:var(--ink-3)}
.os-chart .ax{stroke:var(--rule);stroke-width:1}
.os-chart .grid{stroke:var(--rule-soft);stroke-width:1}
.os-chart .line{fill:none;stroke:var(--accent);stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}
.os-chart .plan{fill:none;stroke:var(--ink-3);stroke-width:1.6;stroke-dasharray:5 5}
.os-chart .inv{stroke:var(--warn);stroke-width:1.5;stroke-dasharray:3 4}
.os-chart .inv2{stroke:var(--ink-2);stroke-width:1.5;stroke-dasharray:3 4}
.os-chart .area{fill:var(--accent);opacity:.08}
.os-chart .hit{fill:var(--ground);stroke:var(--accent);stroke-width:2}
.os-chart .lbl{fill:var(--ink);font-size:11.5px}
.os-chart .lbl.w{fill:var(--warn)}
.os-chart .lbl.i{fill:var(--ink-2)}
.os-chart .today{stroke:var(--ink-2);stroke-width:1}
.os-chart .os-dbar{fill:var(--accent);opacity:.3}
.os-sites{display:flex;flex-direction:column}
.os-site{display:grid;grid-template-columns:minmax(0,1fr) 110px 76px;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--rule-soft);font-size:13px}
.os-site b{display:block;font-weight:600}
.os-site small{display:block;margin-top:2px;font-size:11.5px;color:var(--ink-3)}
.os-site .bar{width:100%;margin:0}
.os-site .v{font:500 13px/1 "IBM Plex Mono",monospace;text-align:right}
.os-site.avg{border-bottom:0;padding-top:12px}
.os-site.avg .v{font-size:15px;color:var(--accent)}
.os-state{display:flex;align-items:baseline;gap:12px;margin:44px 0 12px}
.os-state b{font:600 11px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;color:var(--accent)}
.os-state span{font-size:13px;color:var(--ink-2)}
.os-none{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px dashed var(--rule);border-radius:12px}
.os-none>div{display:flex;flex-direction:column;gap:7px;padding:16px 18px;border-left:1px dashed var(--rule)}
.os-none>div:first-child{border-left:0}
.os-none b{font:500 20px/1.1 "IBM Plex Mono",monospace}
.os-none b.dim{color:var(--ink-3);font-family:Archivo,sans-serif;font-size:15px;font-weight:600}
.os-none small{font-size:12px;color:var(--ink-3)}

/* step 5: until opening ---------------------------------------------------------------------------------------- */
.os-prog{display:flex;align-items:center;gap:14px;margin-top:26px}
.os-prog h2{margin:0;font-size:17px;font-weight:600}
.os-prog .m{flex:0 0 180px;height:6px;border-radius:3px;background:var(--rule);overflow:hidden}
.os-prog .m i{display:block;height:100%;width:var(--w);background:var(--accent);border-radius:3px}
.os-prog .c{font:500 13px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.os-prog .aside{margin-left:auto;display:flex;align-items:center;gap:14px;font-size:12.5px;color:var(--ink-3)}
.os-live{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-2);white-space:nowrap}
.os-live i{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.os-live.off i{background:var(--ink-3);box-shadow:0 0 0 4px color-mix(in srgb,var(--ink-3) 20%,transparent)}
.os-cks{display:flex;flex-direction:column;margin-top:14px;border-top:1px solid var(--rule)}
.os-ck{display:grid;grid-template-columns:30px 34px minmax(0,1fr) auto;gap:14px;align-items:center;min-height:68px;padding:10px 4px;border-bottom:1px solid var(--rule-soft)}
.os-ck .st{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;border:1.5px solid var(--rule)}
.os-ck .st svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.os-ck.done .st{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.os-ck.part .st{border-color:var(--warn);background:conic-gradient(var(--warn) 0 var(--p),transparent var(--p) 100%)}
.os-ck .ic{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--raised);color:var(--ink-2)}
.os-ck .ic svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.os-ck.done .ic{color:var(--ink-3)}
.os-ck .tx b{display:block;font-size:14px;font-weight:600}
.os-ck.done .tx b{color:var(--ink-2);font-weight:500}
.os-ck .tx small{display:block;margin-top:3px;font-size:12.5px;color:var(--ink-3);line-height:1.4}
.os-ck .tx small .w{color:var(--warn)}
.os-ck .tx small .ok{color:var(--accent)}
.os-ck .act{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.os-ck .when{font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.os-ingame{display:flex;align-items:flex-start;gap:9px;max-width:360px;padding:9px 12px;border-radius:9px;border:1px dashed var(--rule);font-size:12.5px;line-height:1.45;color:var(--ink-2);text-align:left}
.os-ingame svg{width:15px;height:15px;margin-top:1px;stroke:var(--ink-3);fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.os-ingame b{color:var(--ink);font-weight:600}
.os-gate{display:flex;align-items:center;gap:12px;margin-top:18px;padding:12px 14px;border-radius:10px;border:1px dashed var(--rule);font-size:12.5px;color:var(--ink-2)}
.os-gate b{color:var(--ink);font-weight:600}
.os-gate .os-btn{margin-left:auto}

/* step 6: after opening ------------------------------------------------------------------------------------------ */
.os-roi{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:22px}
.os-roi .kpi .v{font-size:25px}
.os-roi .kpi .sub small{color:var(--ink-3)}
.os-pvsa th,.os-pvsa td{padding:10px 12px}
.os-pvsa td.d{color:var(--accent)}
.os-pvsa td.dn{color:var(--warn)}
.os-done{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);background:color-mix(in srgb,var(--accent) 7%,transparent);font-size:13px;color:var(--ink-2)}
.os-done .ic{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--accent);color:var(--on-accent)}
.os-done .ic svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.os-done b{color:var(--ink);font-weight:600;font-size:14px}
.os-done .os-btn{margin-left:auto}

/* phase 1: Results, the site page ----------------------------------------------------------------------------------- */
.os-port{margin-top:8px}
.os-port th,.os-port td{padding:11px 12px}
.os-port td.l .sub{margin-top:3px}
.os-port tr.chain td{border-bottom:1px solid var(--rule-soft)}
.os-port tr.chain td.l b{font-weight:600}
.os-port tr.kid td.l{padding-left:40px}
.os-port tr.kid td.l b{font-weight:500}
.os-port td.be{text-align:left;font-family:Archivo,sans-serif;white-space:nowrap}
.os-port td.be b{display:block;font:500 13.5px/1.2 "IBM Plex Mono",monospace;color:var(--ink)}
.os-port td.be b.ok{color:var(--accent)}
.os-port td.be b.w{color:var(--warn)}
.os-port td.be b.bad{color:var(--neg)}
.os-port td.be b.dim{color:var(--ink-3)}
.os-port td.be small{display:block;margin-top:3px;font-size:11.5px;color:var(--ink-3)}
.os-port td.be .os-meter{width:120px}
.os-port .chev svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.os-port tr.kid{display:table-row}
.os-crop{margin-top:10px;font-size:12px;color:var(--ink-3)}
.os-shead{display:flex;align-items:center;gap:14px;margin-top:22px}
.os-shead .crumb{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px 0 9px;border-radius:9px;border:1px solid var(--rule);background:var(--surface);color:var(--ink);font-size:13px;text-decoration:none}
.os-shead .crumb svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2}
.os-shead .ch{color:var(--ink-2);font-size:13px}
.os-stitle{display:flex;align-items:center;gap:16px;margin-top:22px}
.os-stitle .bullet{width:42px;height:42px;font-size:12px;color:var(--on-accent)}
.os-stitle h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em}
.os-stitle p{margin:4px 0 0;font-size:13px;color:var(--ink-2)}
.os-stitle .aside{margin-left:auto;display:flex;gap:8px}
.os-rows{margin-top:20px;border-top:1px solid var(--rule)}
.os-row{display:grid;grid-template-columns:22px 26px minmax(0,1fr) auto 22px;gap:12px;align-items:center;min-height:50px;padding:6px 4px;border-bottom:1px solid var(--rule)}
.os-row .mk{width:8px;height:8px;border-radius:50%;justify-self:center;background:var(--warn)}
.os-row .mk.ok{background:var(--accent)}
.os-row .mk.info{background:var(--info)}
.os-row .mk.neg{background:var(--neg)}
.os-row .mk.dim{background:var(--ink-3)}
.os-row>svg{width:16px;height:16px;stroke:var(--ink-3);fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.os-row .t{font-size:14px;font-weight:600}
.os-row .t small{margin-left:8px;font-size:12.5px;font-weight:400;color:var(--ink-3)}
.os-row .a{font:500 13.5px/1.2 "IBM Plex Mono",monospace;text-align:right}
.os-row .a small{display:block;font-size:10.5px;color:var(--ink-3);letter-spacing:.04em}
.os-row .a .os-meter{width:120px;margin:5px 0 0 auto}
.os-row .a.neg{color:var(--neg)}
.os-row .go svg{width:14px;height:14px;stroke:var(--ink-3);fill:none;stroke-width:2}
.os-row.lit{background:color-mix(in srgb,var(--accent) 6%,transparent)}
.os-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:22px}
.os-kpis .kpi .v{font-size:25px}
.os-states{display:flex;flex-direction:column;gap:18px;padding:40px 48px}
.os-states h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.015em}
.os-states .lead{margin:6px 0 0;font-size:13.5px;color:var(--ink-2)}
.os-states .os-rows{margin-top:10px}
.os-states .st{font:600 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;color:var(--accent);margin-bottom:-12px}
"""


# --------------------------------------------------------------------------
# what only the factory flow adds (ff-)
# --------------------------------------------------------------------------
FF_CSS = r"""
.os-views a .os-new{margin-left:auto}
.feature-new{display:inline-block;flex:none;margin-left:auto;padding:2px 5px;border-radius:4px;background:var(--accent-soft);color:var(--accent);font:600 9px/1.2 "IBM Plex Mono",monospace;letter-spacing:.04em;text-transform:uppercase;vertical-align:middle}
.os-views a.on .feature-new{background:var(--ground)}
.os-pb>div.ff-run{border-left:1px dashed var(--rule);background:color-mix(in srgb,var(--ground) 60%,transparent);border-radius:0 12px 12px 0}
.os-pb>div.ff-run small{white-space:normal;overflow:visible}
.ff-wk{font-size:12px;color:var(--ink-3);margin-left:2px}
.ff-ab{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:6px;background:var(--ink);color:var(--ground);font:600 11.5px/1 "IBM Plex Mono",monospace}
.ff-abh{display:flex;align-items:center;gap:10px;margin:0 0 12px}
.ff-abh b{font-size:14.5px;font-weight:600}
.ff-abh small{font-size:12px;color:var(--ink-3)}

/* step 1: what to make ------------------------------------------------------------- */
.ff-make th,.ff-make td{padding:11px 8px}
.ff-make td.l b{display:block;font-weight:600;color:var(--ink)}
.ff-make td .sub{margin-top:2px}
.ff-make tr.pick td{background:color-mix(in srgb,var(--accent) 7%,transparent)}
.ff-make tr.pick td:first-child{box-shadow:inset 3px 0 0 var(--accent)}
.ff-make tr.none td{color:var(--ink-3)}
.ff-make td.go{width:1%;padding-right:2px}
.ff-make td.go a{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:8px;border:1px solid var(--rule);color:var(--ink-2)}
.ff-make td.go a svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ff-days{display:inline-flex;align-items:center;gap:8px;justify-content:flex-end}
.ff-days i{display:block;width:44px;height:5px;border-radius:3px;background:var(--rule);overflow:hidden}
.ff-days i::before{content:"";display:block;height:100%;width:var(--w);background:var(--accent)}
.ff-days.w i::before{background:var(--warn)}
.ff-step{display:inline-flex;align-items:center;gap:0;border:1px solid var(--rule);border-radius:8px;background:var(--ground);overflow:hidden}
.ff-step button{display:grid;place-items:center;width:28px;height:28px;border:0;background:none;color:var(--ink-2);cursor:pointer}
.ff-step button:hover{color:var(--ink);background:var(--raised)}
.ff-step button svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round}
.ff-step b{min-width:26px;text-align:center;font:500 13.5px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.ff-chip{display:inline-flex;align-items:center;gap:5px;height:21px;padding:0 7px;border-radius:5px;font:500 11.5px/1 "IBM Plex Mono",monospace;white-space:nowrap}
.ff-chip.plus{background:var(--info-soft);color:var(--info)}
.ff-chip.short{background:var(--warn-soft);color:var(--warn)}
.ff-chip.ok{background:var(--accent-soft);color:var(--accent)}
.ff-chip.dim{background:var(--raised);color:var(--ink-3)}
.ff-chip svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2}
.ff-mats{display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end}
.ff-mat{display:inline-flex;align-items:baseline;gap:5px;height:22px;padding:0 8px;border-radius:5px;border:1px solid var(--rule-soft);background:var(--ground);font-size:12px;color:var(--ink-2);white-space:nowrap;align-items:center}
.ff-mat b{font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink)}
.ff-lines td{padding:12px 10px;vertical-align:middle}
.ff-lines td.l b{display:block;font-weight:600;font-size:14px}
.ff-lines tr.off td{color:var(--ink-3)}
.ff-lines tr.off td.l b{color:var(--ink-2);font-weight:500}
.ff-lines tfoot td{padding:13px 10px;font-size:14px}
.ff-lines tfoot td.l{font-family:Archivo,sans-serif;font-weight:600}
.ff-kit{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;margin-top:12px;padding:12px 14px;border-radius:10px;border:1px solid var(--rule-soft);background:var(--surface);font-size:12.5px;color:var(--ink-2)}
.ff-kit b{color:var(--ink);font-weight:600}
.ff-kit .m{font-family:"IBM Plex Mono",monospace;color:var(--ink)}
.ff-kit .aside{margin-left:auto}
.ff-note{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:12px;align-items:center;margin-top:16px;padding:13px 16px;border-radius:12px;border:1px solid var(--rule);background:var(--surface);font-size:13px;line-height:1.45;color:var(--ink-2)}
.ff-note>svg{width:18px;height:18px;stroke:var(--info);fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ff-note.warn{border-color:color-mix(in srgb,var(--warn) 45%,transparent);background:color-mix(in srgb,var(--warn) 6%,var(--surface))}
.ff-note.warn>svg{stroke:var(--warn)}
.ff-note.neg{border-color:color-mix(in srgb,var(--neg) 45%,transparent);background:color-mix(in srgb,var(--neg) 6%,var(--surface))}
.ff-note.neg>svg{stroke:var(--neg)}
.ff-note b{color:var(--ink);font-weight:600}

/* the chain as a strip: factory, depot, shops ---------------------------------------------- */
.ff-flow{display:grid;grid-template-columns:auto 34px auto 34px 1fr auto 1fr;align-items:center;gap:0;margin-top:16px;padding:14px 16px;border-radius:12px;border:1px solid var(--rule-soft);background:var(--surface)}
.ff-node{display:flex;align-items:center;gap:10px;min-width:0}
.ff-node .ic{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--raised);color:var(--ink-2)}
.ff-node .ic svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ff-node.new .ic{background:var(--accent);color:var(--on-accent)}
.ff-node.miss .ic{background:none;border:1.5px dashed var(--warn);color:var(--warn)}
.ff-node b{display:block;font-size:13px;font-weight:600;white-space:nowrap}
.ff-node small{display:block;margin-top:2px;font-size:11.5px;color:var(--ink-3);white-space:nowrap}
.ff-arrow{height:2px;margin:0 6px;background:repeating-linear-gradient(90deg,var(--ink-3) 0 4px,transparent 4px 8px);position:relative}
.ff-arrow::after{content:"";position:absolute;right:-2px;top:-4px;border:5px solid transparent;border-left-color:var(--ink-3);border-right:0}
.ff-river{display:flex;flex-direction:column;align-items:center;gap:4px;padding:0 14px;color:var(--info);font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.ff-river svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.ff-shops{display:flex;flex-wrap:wrap;gap:5px}
.ff-shops span{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border-radius:6px;background:var(--raised);font-size:12px;color:var(--ink-2);white-space:nowrap}
.ff-shops span .hood{height:16px;min-width:20px;font-size:9px}

/* step 2: where -------------------------------------------------------------------------- */
.ff-finder{display:grid;grid-template-columns:360px minmax(0,1fr);gap:18px;margin-top:18px;padding:16px;border-radius:14px;border:1px solid var(--rule-soft);background:color-mix(in srgb,var(--surface) 55%,transparent)}
.os-ft td .ff-dist{font-size:12px}
.ff-dist{display:inline-flex;align-items:center;gap:7px;justify-content:flex-end;white-space:nowrap}
.ff-dist i{display:block;width:44px;height:4px;border-radius:2px;background:var(--rule);overflow:hidden}
.ff-dist i::before{content:"";display:block;height:100%;width:var(--w);background:var(--ink-3)}
.ff-dist.far{color:var(--warn)}
.ff-dist.far svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8}
.os-pin.dep b{background:#e9ece6;color:#0d100f}
.os-pin.dep i{background:#e9ece6}
.os-pin.warn b{background:#f0913a;color:#0d100f}
.os-pin.warn i{background:#f0913a}
.os-pin.fac b{background:#43c07a;color:#08130d;font-size:10px;letter-spacing:.06em}
.ff-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin-top:12px;border:1px solid var(--rule-soft);border-radius:10px;background:var(--ground)}
.ff-facts>div{display:flex;flex-direction:column;gap:5px;padding:11px 13px;border-left:1px solid var(--rule-soft)}
.ff-facts>div:first-child{border-left:0}
.ff-facts b{font:500 14px/1.1 "IBM Plex Mono",monospace}
.ff-facts small{font-size:11.5px;color:var(--ink-3);line-height:1.35}

/* step 3: investment extras ---------------------------------------------------------------- */
.ff-free td{color:var(--ink-3)}
.os-store table td.w .os-tag+.os-tag{margin-left:4px}
.ff-callout{display:flex;align-items:center;gap:12px;margin-top:14px;padding:12px 14px;border-radius:10px;background:var(--warn-soft);color:var(--ink-2);font-size:13px}
.ff-callout b{color:var(--ink);font-weight:600}
.ff-callout svg{width:17px;height:17px;stroke:var(--warn);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.ff-fee{display:flex;align-items:flex-end;gap:3px;height:80px;margin-top:4px}
.ff-fee i{display:block;width:34px;border-radius:4px 4px 0 0;background:var(--ink-3)}
.ff-fee i.f{background:var(--warn)}

/* the itemised day, the financing panel -------------------------------------------------------- */
.ff-gain{width:100%}
.ff-gain td{padding:8px 4px;font-size:13px}
.ff-gain td.l{color:var(--ink-2)}
.ff-gain td.l small{display:block;margin-top:2px;font-size:11.5px;color:var(--ink-3)}
.ff-gain td.v{text-align:right;font:500 13px/1 "IBM Plex Mono",monospace;white-space:nowrap}
.ff-gain td.v.p{color:var(--accent)}
.ff-gain td.v.n{color:var(--ink-2)}
.ff-gain tr.tot td{border-top:1px solid var(--rule);padding-top:12px;font-size:14px;color:var(--ink);font-weight:600}
.ff-gain tr.tot td.v{font-size:16px;color:var(--accent)}
.ff-chainrow{display:grid;grid-template-columns:minmax(0,1fr) 120px 120px 150px;gap:14px;align-items:center;padding:11px 0;border-bottom:1px solid var(--rule-soft);font-size:13px}
.ff-chainrow.h{padding:0 0 8px;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.ff-chainrow b{font-weight:600}
.ff-chainrow small{display:block;margin-top:2px;font-size:11.5px;color:var(--ink-3)}
.ff-chainrow .v{font:500 13px/1.2 "IBM Plex Mono",monospace;text-align:right}
.ff-chainrow .v.ok{color:var(--accent)}
.ff-chainrow .v.w{color:var(--warn)}
.ff-fin{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:12px}
.ff-fin div{display:flex;flex-direction:column;gap:5px}
.ff-fin b{font:500 15px/1.1 "IBM Plex Mono",monospace}
.ff-fin small{font-size:11.5px;color:var(--ink-3)}
.ff-sw{display:inline-flex;align-items:center;gap:9px;font-size:13px;color:var(--ink)}
.ff-sw i{position:relative;width:34px;height:20px;border-radius:10px;background:var(--accent)}
.ff-sw i::after{content:"";position:absolute;right:3px;top:3px;width:14px;height:14px;border-radius:50%;background:var(--on-accent)}
.ff-states{display:flex;flex-direction:column;gap:30px;margin-top:6px}

/* step 5: the checklist's manual steps ----------------------------------------------------------- */
.ff-hand{display:inline-flex;align-items:center;gap:6px;height:20px;padding:0 7px;border-radius:5px;border:1px dashed var(--rule);font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);white-space:nowrap}
.os-ck .tx b .ff-hand{margin-left:8px;vertical-align:2px}
.os-ck.skip .st{border-style:dashed}
.os-ck.skip .tx b{color:var(--ink-3);font-weight:500}
.os-ck .act{flex-wrap:wrap}
.os-ck.later .tx small .lt{color:var(--info)}
.ff-sub{margin:26px 0 0;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.ff-sub+.os-cks{margin-top:8px}

/* the dialog artboard -------------------------------------------------------------------------- */
.ff-dlgs{display:flex;gap:48px;align-items:flex-start;padding:30px 48px 48px}
.ff-dlgs .gw-col{width:480px}
.ff-sites{display:flex;flex-direction:column;gap:10px}
.ff-site{border:1px solid var(--rule-soft);border-radius:10px;background:var(--ground);overflow:hidden}
.ff-site>div:first-child{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--rule-soft);font-size:12.5px;font-weight:600}
.ff-site>div:first-child small{margin-left:auto;font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);font-weight:500}
.ff-site .hood{height:17px;min-width:20px;font-size:9px}
.ff-hr{display:grid;grid-template-columns:minmax(0,1fr) 60px 70px;gap:10px;align-items:center;padding:8px 12px;font-size:12.5px;color:var(--ink-2)}
.ff-hr+.ff-hr{border-top:1px solid var(--rule-soft)}
.ff-hr b{color:var(--ink);font-weight:600}
.ff-hr small{display:block;margin-top:2px;font-size:11.5px;color:var(--ink-3)}
.ff-hr .v{font:500 12.5px/1 "IBM Plex Mono",monospace;text-align:right;color:var(--ink)}
.ff-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;padding:10px 12px 12px}
.ff-week span{display:flex;flex-direction:column;align-items:center;gap:4px;font:500 10px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.ff-week i{display:block;width:100%;height:28px;border-radius:4px;background:linear-gradient(to top,var(--accent) var(--h),var(--raised) var(--h))}
.ff-amts{width:100%}
.ff-amts td{padding:7px 4px;font-size:12.5px}
.ff-amts td.l{color:var(--ink)}
.ff-amts td.v{text-align:right;font:500 12.5px/1 "IBM Plex Mono",monospace}
.ff-amts td.was{color:var(--ink-3);text-decoration:line-through}

/* step 6: running ---------------------------------------------------------------------------------- */
.ff-out td{padding:11px 12px}
.ff-out td.l b{display:block;font-weight:600}
.ff-out td .ff-meter{display:block;width:110px;height:5px;margin:6px 0 0 auto;border-radius:3px;background:var(--rule);overflow:hidden}
.ff-out td .ff-meter i{display:block;height:100%;width:var(--w);background:var(--accent)}
.ff-out td .ff-meter.w i{background:var(--warn)}
.ff-out td.w{color:var(--warn)}
.ff-why{display:flex;flex-direction:column;margin-top:12px;border-top:1px solid var(--rule)}
.ff-why>div{display:grid;grid-template-columns:22px 26px minmax(0,1fr) auto;gap:12px;align-items:center;min-height:54px;padding:6px 4px;border-bottom:1px solid var(--rule-soft)}
.ff-why .mk{width:8px;height:8px;border-radius:50%;justify-self:center;background:var(--warn)}
.ff-why>div>svg{width:16px;height:16px;stroke:var(--ink-3);fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ff-why .t{font-size:14px;font-weight:600}
.ff-why .t small{display:block;margin-top:3px;font-size:12.5px;font-weight:400;color:var(--ink-3)}
.ff-hist{display:flex;flex-direction:column;margin-top:10px;border-left:2px solid var(--rule);padding-left:16px;gap:12px}
.ff-hist div{position:relative;font-size:13px;color:var(--ink-2)}
.ff-hist div::before{content:"";position:absolute;left:-22px;top:4px;width:10px;height:10px;border-radius:50%;background:var(--surface);border:2px solid var(--ink-3)}
.ff-hist div.ok::before{background:var(--accent);border-color:var(--accent)}
.ff-hist b{color:var(--ink);font-weight:600}
.ff-hist .d{font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);margin-right:8px}

/* entry and links ------------------------------------------------------------------------------------ */
.ff-links{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:26px;padding:34px 40px}
.ff-links h2{margin:0 0 4px;font-size:15px;font-weight:600}
.ff-links p.lead{margin:0 0 14px;font-size:12.5px;color:var(--ink-3)}
.ff-frame{border:1px solid var(--rule);border-radius:14px;background:var(--ground);padding:6px 20px 20px;overflow:hidden}
.ff-frame .os-ck{border-bottom:0}
.ff-hl{border-radius:10px;box-shadow:0 0 0 2px var(--accent);background:color-mix(in srgb,var(--accent) 5%,transparent)}
.ff-mini{display:flex;flex-direction:column;gap:6px}
.ff-mini .os-ctl{min-height:50px}
.ff-planhead{display:flex;align-items:center;gap:12px;margin-top:14px}
.ff-planhead h3{margin:0;font-size:17px;font-weight:600}
.ff-planhead .aside{margin-left:auto;display:flex;gap:8px;align-items:center}
.ff-ghost{opacity:.45;pointer-events:none}
.ff-kind{display:inline-flex;padding:3px;gap:2px;border:1px solid var(--rule);border-radius:10px;background:var(--surface)}
.ff-kind a{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:7px;color:var(--ink-2);font-size:13.5px;font-weight:500;text-decoration:none}
.ff-kind a svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ff-kind a.on{background:var(--ink);color:var(--ground)}
.ff-pick{gap:10px 12px;border-bottom:0;min-height:54px}
.ff-pick .ff-kind a{height:30px;font-size:12.5px}
.ff-now{display:flex;align-items:center;gap:14px;margin-top:16px;padding:12px 16px;border-radius:12px;border:1px solid var(--rule-soft);background:var(--surface);font-size:13px;color:var(--ink-2)}
.ff-now b{color:var(--ink);font-weight:600}
.ff-now .ic{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:var(--accent);color:var(--on-accent)}
.ff-now .ic svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.ff-now .aside{margin-left:auto;display:flex;gap:16px}
.ff-delta{font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--accent);margin-left:6px}
.ff-ing td{padding:9px 10px}
.ff-ing td.l b{font-weight:600}
"""

# the write dialogs' stylesheet, minus its blanket `.board svg` rule (it would size every chart)
GW_CSS = re.sub(r"\.board svg\{[^}]*\}", ".gw-dlg svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}", gw.GW_CSS)

# --------------------------------------------------------------------------
# the company: every name and figure invented, the game's own streets, recipes and prices
# --------------------------------------------------------------------------
COMPANY = "Brightwater"
CHAIN = "Brightwater Spirits"
DAY = "Day 168 · Tue 09:20"
LOC = {b["address"]: b for b in json.loads((REPO / "web/maps/locations.json").read_text(encoding="utf-8"))["buildings"]}
TAG = {"Garment District": "GD", "Hell's Kitchen": "HK", "Industry City": "IC", "Lower Manhattan": "LM", "Midtown": "MT",
       "Murray Hill": "MH", "The Hamptons": "HA"}

# the chain the factory joins: four liquor stores and a depot (sales a day: whisky, beer, wine, cigar, cigarette)
SHOPS = [("36 Fifth Avenue", "Garment District", (430, 610, 300, 250, 330)),
         ("14 First Avenue", "Hell's Kitchen", (560, 790, 360, 300, 420)),
         ("8 Sixth Avenue", "Murray Hill", (380, 540, 260, 220, 300)),
         ("18 Second Avenue", "Midtown", (480, 660, 320, 270, 350))]
SOLD = [sum(s[2][i] for s in SHOPS) for i in range(5)]   # 1,850 · 2,600 · 1,240 · 1,040 · 1,400 a day
DEPOT = {"name": "Brightwater Depot", "addr": "6 24th Street", "hood": "Industry City", "size": "I3"}

# the game's recipes (web/wiki-data.json): per machine-hour, and the workstation kit's machines
WS = {
    "bottled": ("Bottled Goods Workstation", [("Food Assembly Machine", 60_000), ("Bottling Machine", 27_500), ("Industrial Blending Machine", 45_000)]),
    "consumer": ("Consumer Goods Workstation", [("Consumer Goods Assembly Machine", 240_000), ("Laser Cutting Machine", 145_000)]),
}
KIT = {k: sum(p for _, p in ms) for k, (_, ms) in WS.items()}       # 132,500 · 385,000
WHOLESALE = {"Whisky": 8, "Beer": 2, "Bottle of Wine": 5.8, "Cigar": 3.6, "Pack of Cigarettes": 3.2}
RAW_PRICE = {"Barley": 0.24, "Water": 0.01, "Yeast": 0.01, "Grapes": 0.35, "Sugar": 0.05, "Hops": 0.02,
             "Carbon Dioxide": 0.01, "Tobacco": 0.5, "Cigar Paper": 1, "Cigarette Paper": 0.5}
RECIPES = {  # product: workstation, made an hour, raw an hour
    "Whisky": ("bottled", 50, [("Barley", 100), ("Water", 50), ("Yeast", 50)]),
    "Bottle of Wine": ("bottled", 50, [("Grapes", 100), ("Sugar", 50), ("Yeast", 50)]),
    "Beer": ("bottled", 50, [("Barley", 50), ("Carbon Dioxide", 50), ("Hops", 50), ("Water", 50), ("Yeast", 50)]),
    "Cigar": ("consumer", 100, [("Cigar Paper", 20), ("Tobacco", 100)]),
    "Pack of Cigarettes": ("consumer", 100, [("Cigarette Paper", 20), ("Tobacco", 100)]),
}
SOLD_BY = dict(zip(["Whisky", "Beer", "Bottle of Wine", "Cigar", "Pack of Cigarettes"], SOLD))


# What the game charges and pays (ItemHelper.GetWholesalePrice, ProductMarketHelper.GetProductExportPrice):
# an import costs Item.wholesalePrice × the product's importPriceIndex (ProductMarketEntry, 1 when the
# product has none, as raw materials do) × gameVariables.marketPriceMultiplier; an export pays that
# × gameVariables.exportMultiplier. Normal's multipliers; the indexes are invented for the canvas.
MARKET, EXPORT_MULT = 0.7, 0.65
# _open_store(): the best purchasing agent's skill sets the import discount (1 − 0.25 × skill / 100);
# a company with none is planned at skill 100. Brightwater's best agent (invented): skill 100.
AGENT = ("Ana Kerr", 100)
DISCOUNT = 1 - 0.25 * AGENT[1] / 100                       # 0.75
RAW_FACTOR = MARKET * DISCOUNT
INDEX = {"Whisky": 0.96, "Bottle of Wine": 1.08, "Beer": 1.0, "Cigar": 1.0, "Pack of Cigarettes": 1.0}


def import_price(product: str) -> float:
    return WHOLESALE[product] * INDEX.get(product, 1.0) * MARKET * DISCOUNT


def export_price(product: str) -> float:
    """A pier pays the undiscounted wholesale price × export price: the agent's discount is on buying."""
    return WHOLESALE[product] * INDEX.get(product, 1.0) * MARKET * EXPORT_MULT


def raw_unit(product: str) -> float:
    _, rate, raw = RECIPES[product]
    return sum(q * RAW_PRICE[m] * RAW_FACTOR for m, q in raw) / rate


def machines_for(product: str) -> int:
    rate = RECIPES[product][1] * 24
    return max(1, -(-SOLD_BY[product] // rate))


def saves_a_day(product: str, k: int) -> float:
    """What k machines save the shops a day: imports they no longer buy, less the raw material the
    machines eat running flat out (they always do). The surplus is valued apart, as an export."""
    made = RECIPES[product][1] * 24 * k
    used = min(made, SOLD_BY[product])
    return used * import_price(product) - made * raw_unit(product)


# the plan: Whisky on 2 workstations, Bottle of Wine on 1
LINES = [("Whisky", 2), ("Bottle of Wine", 1), ("Beer", 0)]
KITS = sum(k for _, k in LINES)                                                    # 3
MADE_DAY = {p: RECIPES[p][1] * 24 * k for p, k in LINES}                           # 2,400 · 1,200 · 0
USED_DAY = {p: min(MADE_DAY[p], SOLD_BY[p]) for p, _ in LINES}                     # 1,850 · 1,200
SURPLUS_WK = (MADE_DAY["Whisky"] - SOLD_BY["Whisky"]) * 7                          # 3,850
SHORT_WK = (SOLD_BY["Bottle of Wine"] - MADE_DAY["Bottle of Wine"]) * 7            # 280
RAW_WK: dict[str, int] = {}
for p, k in LINES:
    for m, q in RECIPES[p][2]:
        if k:
            RAW_WK[m] = RAW_WK.get(m, 0) + q * 24 * 7 * k                           # Barley 33,600 · Water 16,800 · Yeast 25,200 · Grapes 16,800 · Sugar 8,400
RAW_COST_WK = sum(v * RAW_PRICE[m] * RAW_FACTOR for m, v in RAW_WK.items())      # 7,762
EXPORT_EACH = export_price("Whisky")                                               # 3.49
EXPORT_WK = SURPLUS_WK * EXPORT_EACH                                               # 13,453

# the staff the plan needs (the board's rule: machine-hours a week ÷ 50, rounded up)
MACHINE_H = KITS * 168                                    # 504 h a week
WORKERS = -(-MACHINE_H // 50)                             # 11
DRIVER_H = 84
BASE_WAGE = {"factoryworker": 12, "deliverydriver": 18, "purchasingagent": 30}   # SkillData.baseHourlyWage
SALARY = 0.7                                                                     # Normal's employeeHourlySalaryMultiplier
HOURLY = {k: v * (1 + 1.05 ** 100 / 100) * SALARY for k, v in BASE_WAGE.items()}  # 19.45 · 29.17 · 48.62
DRIVER_PAID_H = 5.7 * 7                                   # the game pays a delivery driver a flat 5.7 h a day
AGENT_H = 40                                              # the new Purchasing Agent's week at headquarters (assumed)
WAGES_WK = {"workers": MACHINE_H * HOURLY["factoryworker"], "driver": DRIVER_PAID_H * HOURLY["deliverydriver"],
            "agent": AGENT_H * HOURLY["purchasingagent"]}


def run_cell(raw: float, wages: float, rent: float) -> str:
    """The Running costs cell: a week of raw material, wages and rent; never part of the investment."""
    tot = raw + wages + rent
    parts = f"raw {money(raw)} · wages {money(wages)}" + (f" · rent {money(rent)}" if rent else "")
    return (f'<b class="m">{money(tot)}<span class="ff-wk">/week</span></b><small>{parts}</small>'
            f'<small>not in the investment</small>')


NEW = {"addr": "4 22nd Street", "hood": "Industry City", "size": "I3", "m2": 1292, "veh": 2, "rent": 388, "deposit": 36_320}
FEE = 586 * NEW["m2"]                                      # 757,112
DELIVERY = 250
TRUCK = ("Freight Truck T1", 98_000)
SHELVES = ("Pallet Shelf", 2_500, 12)
ITEMS = [(m, p, KITS) for m, p in WS["bottled"][1]] + [(SHELVES[0], SHELVES[1], SHELVES[2])]
ITEMS_TOTAL = sum(p * q for _, p, q in ITEMS)              # 427,500
SELF = ITEMS_TOTAL + DELIVERY + TRUCK[1] + NEW["deposit"]  # 562,070
FIRM = FEE + ITEMS_TOTAL + TRUCK[1] + NEW["deposit"]       # 1,318,932
CHAIN_DAY = 31_224                                         # the chain's profit a day before the factory

# no depot yet: the plan adds one next to the factory
DEPOT_NEW = {"addr": "6 24th Street", "rent": 366, "deposit": 34_260}
VAN = ("Vord Courier D500", 72_500)
DEPOT_SHELVES = 8
DEPOT_TOTAL = DEPOT_NEW["deposit"] + DEPOT_SHELVES * SHELVES[1] + VAN[1]   # 126,760

# the loan, on the store flow's rules (osLoan): Vantander Bank 12% over 4 game-years of 60 days, Normal ×0.7
LOAN = 280_000
LOAN_INT = int(LOAN * 12 * 0.7 / 100 / 60)                 # 392 a day
LOAN_REPAY = max(5, LOAN // 240)                           # 1,166 a day
LOAN_DAYS = -(-LOAN // LOAN_REPAY)

# after: production started day 176, today day 192 (made a day, both lines together)
STARTED, TODAY = 176, 192
MADE = [1900, 2900, 3250, 3330, 3380, 3400, 3410, 3420, 3410, 3420, 3420, 3410, 3420, 3420, 3410, 3420]
MADE_LOW = [1700, 2600, 2900, 2980, 3010, 3030, 1830, 3030, 3030, 3020, 3030, 3030, 3030, 1830, 3030, 3030]

# candidate buildings: every factory rents a warehouse building (types.factory.b = "warehouse").
# address, layout, m², vehicles, rent, deposit (_rent_estimate, _deposit_estimate = rent × 93.61)
FINDS = [("4 22nd Street", "I3", 1292, 2, 388, 36_320), ("8 22nd Street", "I3", 1292, 2, 402, 37_630),
         ("1 22nd Street", "I3", 1292, 2, 410, 38_380), ("5 23rd Street", "I3", 1292, 2, 410, 38_380),
         ("6 24th Street", "I3", 1292, 2, 366, 34_260), ("1 25th Street", "P2", 2184, 2, 618, 57_850),
         ("8 25th Street", "Q2", 2610, 2, 739, 69_180), ("3 Twelfth Street", "H1", 690, 1, 171, 16_010),
         ("8 Twelfth Street", "H1", 690, 1, 201, 18_820), ("51 Second Street", "H1", 690, 1, 223, 20_880)]
FINDS = sorted([f for f in FINDS if f[0] != DEPOT["addr"]], key=lambda f: f[4])
VENDORS = {"fsd": ("A", "Factory Supply Depot", "2 25th Street"), "trucks": ("B", "General US Trucks", "1 Seventh Avenue")}


def hood(name: str) -> str:
    return f'<span class="hood">{TAG[name]}</span>'


def pos(addr: str) -> tuple[float, float]:
    x, y = LOC[addr]["anchor"]
    bx, by, bw, bh = IC_BOUNDS if LOC[addr]["region"] == "industry-city" else MAINLAND
    return (x - bx) / bw * 100, (y - by) / bh * 100


def pin(addr: str, label: str, cls: str = "", note: str = "") -> str:
    left, top = pos(addr)
    em = f"<em>{esc(note)}</em>" if note else ""
    return f'<span class="os-pin {cls}" style="left:{left:.2f}%;top:{top:.2f}%"><b>{label}</b><i></i>{em}</span>'


def city(pins: str, ic: bool = True, zoom: bool = True) -> str:
    z = '<span class="zoom" aria-hidden="true"><span>+</span><span>−</span></span>' if zoom else ""
    src, alt = (IC_URL, "Industry City") if ic else (MAP_URL, "Manhattan")
    return f'<div class="os-map"><img src="{src}" alt="{alt}">{pins}{z}</div>'


# --------------------------------------------------------------------------
# chrome: the sidebar and the controls row
# --------------------------------------------------------------------------
AREAS = [("overview", "Overview", "today"), ("businesses", "Businesses", "company"), ("supply", "Supply", "supply"),
         ("staffing", "Staffing", "people"), ("expansion", "Expansion", "growth")]
VIEWS_A = [("demand", "Demand"), ("finder", "Find a location"), ("open", "Open a store"), ("factory", "Plan a factory")]
# the board's feature badge (docs/contributing.md, "New feature badges"): VIEW_NEW["expansion/factory"]
FEATURE_NEW = '<span class="feature-new" data-new-feature="factory-flow">New</span>'
VIEWS_BIZ = [("results", "Results"), ("prices", "Products & prices"), ("standards", "Standards"), ("milestones", "Milestones")]


def sidebar(area: str, view: str, day: str = DAY, views=None) -> str:
    rows = []
    for key, label, icon in AREAS:
        badge = '<span class="os-n">3</span>' if key == "overview" else ""
        cv = "" if key == area or key == "overview" else svg("chev", "cv")
        rows.append(f'<a class="{"open" if key == area else ""}" href="#">{svg(icon)}<span>{label}</span>{badge}{cv}</a>')
        if key == area:
            vs = views or (VIEWS_A if key == "expansion" else VIEWS_BIZ)
            rows.append('<div class="os-views">' + "".join(
                f'<a class="{"on" if k == view else ""}" href="#">{v}{FEATURE_NEW if k == "factory" else ""}</a>'
                for k, v in vs) + "</div>")
    return f"""<nav class="os-sd" aria-label="Main">
  <div class="os-sdh"><div class="brand"><span class="wordmark">{COMPANY}</span><span class="dot"></span></div><span class="os-orb" aria-hidden="true"></span></div>
  <div class="os-q">{svg("search")}<span>Search the board</span><kbd>/</kbd></div>
  <div class="os-areas">{"".join(rows)}</div>
  <div class="os-refs"><a href="#">{svg("map")}<span>City map</span></a><a href="#">{svg("wiki")}<span>Wiki</span></a></div>
  <div class="os-sdf"><div class="os-clock"><b>{day}</b><small>YEAR 3</small></div>
    <div class="os-sdrow"><button type="button" class="os-ib" aria-label="More">{svg("more")}</button><button type="button" class="os-ib r" aria-label="Collapse the sidebar">{svg("side")}</button></div></div>
</nav>"""


STEPS = ["What", "Where", "Investment", "Until production", "Running"]
STEP_FILES = ["Recipe.dc.html", "Location.dc.html", "Investment.dc.html", "Checklist.dc.html", "Running.dc.html"]
GROW_FILES = ["GrowWhat.dc.html", "GrowWhat.dc.html", "GrowInvestment.dc.html", "GrowChecklist.dc.html", "GrowRunning.dc.html"]


def steps(on: int, owned: bool = False) -> str:
    out = []
    files = GROW_FILES if owned else STEP_FILES
    for i, (s_, f) in enumerate(zip(STEPS, files)):
        skip = owned and i == 1
        cls = "on" if i == on else ("done" if i < on or skip else "")
        mark = svg("tick") if i < on or skip else str(i + 1)
        label = f'{NEW["addr"]} <small style="opacity:.7">yours</small>' if skip else s_
        if i:
            out.append('<span class="sep"></span>')
        out.append(f'<a class="{cls}" href="{f}"{" title=\"Not needed: the factory is already rented\"" if skip else ""}><i>{mark}</i>{label}</a>')
    return f'<nav class="os-steps" aria-label="Plan a factory, step by step">{"".join(out)}</nav>'


def planpick(label: str = "Whisky and Wine") -> str:
    return f'<span class="os-planpick">Plan <b>{label}</b>{svg("chev")}</span>'


def pickers(target: str = "new", type_: str = "Liquor Store") -> str:
    types = "".join(f'<a class="{"on" if t == type_ else ""}" href="#">{t}</a>' for t in ("Liquor Store", "Bookstore"))
    fac = "" if target == "none" else f'<a class="{"on" if target == "owned" else ""}" href="GrowWhat.dc.html">{svg("factory")}{NEW["addr"]}</a>'
    return (f'<div class="os-ctl ff-pick"><span class="os-lab">Shops</span><nav class="os-seg" aria-label="Shops to supply">{types}</nav>'
            f'<span class="os-planpick">Another type{svg("chev")}</span>'
            f'<span class="os-lab" style="margin-left:14px">For</span><nav class="ff-kind" aria-label="What the plan is for">'
            f'<a class="{"on" if target in ("new", "none") else ""}" href="Main.dc.html">{svg("plus")}New factory</a>{fac}</nav></div>')


def ctl(on: int, pick: str = "Whisky and Wine", target: str = "none") -> str:
    owned = target == "owned"
    return pickers(target) + f'<div class="os-ctl">{steps(on, owned)}<div class="aside">{planpick("Beer at 4 22nd Street" if owned else pick)}</div></div>'


def planbar(where: bool = True, inv: str = "self", make: str = "") -> str:
    m = make or '<b>Whisky ×2 · Wine ×1</b><small>3 Bottled Goods Workstations · Brightwater Spirits</small>'
    w = (f'<b>{NEW["addr"]}</b><small>{NEW["hood"]} · {NEW["size"]} · {n(NEW["m2"])} m² · rent {money(NEW["rent"])}/day</small>' if where
         else '<b class="dim">Not picked yet</b><small>a warehouse building, any size</small>')
    if inv == "none":
        i = '<b class="dim">–</b><small>after the location</small>'
    else:
        total, how = (FIRM, "Installation firm") if inv == "firm" else (SELF, "Self-installation")
        i = f'<b class="m">{money(total)}</b><small>{how} · one-off, upfront</small>'
    raw = run_cell(RAW_COST_WK, sum(WAGES_WK.values()), NEW["rent"] * 7)
    return (f'<div class="os-pb"><div><span class="os-lab">Make</span>{m}</div>'
            f'<div><span class="os-lab">Where</span>{w}</div><div><span class="os-lab">Investment</span>{i}</div>'
            f'<div class="ff-run"><span class="os-lab">Running costs</span>{raw}</div></div>')


def page(area: str, view: str, body: str, day: str = DAY, views=None) -> str:
    return f'<div class="os-app">{sidebar(area, view, day, views)}<main class="os-main">{body}</main></div>'


def tag(kind: str, text: str) -> str:
    return f'<span class="os-tag {kind}">{esc(text)}</span>'


def flow(depot: str = "have", far: bool = False) -> str:
    fac = (f'<div class="ff-node new"><span class="ic">{svg("factory")}</span><span><b>{"3 Twelfth Street" if far else NEW["addr"]}</b>'
           f'<small>new factory · {"Lower Manhattan" if far else "Industry City"}</small></span></div>')
    if depot == "none":
        dep = f'<div class="ff-node miss"><span class="ic">{svg("crate")}</span><span><b>A depot</b><small>none yet · the plan adds one</small></span></div>'
    else:
        dep = f'<div class="ff-node"><span class="ic">{svg("crate")}</span><span><b>{DEPOT["name"]}</b><small>{DEPOT["addr"]} · Industry City</small></span></div>'
    river = (f'<div class="ff-river">{svg("bridge")}river</div>', "auto")
    arrow = ('<span class="ff-arrow"></span>', "34px")
    shops = ('<div class="ff-shops">' + "".join(f'<span>{hood(h)}{a}</span>' for a, h, _ in SHOPS) + "</div>", "1fr")
    parts = ([(fac, "auto"), river, arrow, (dep, "auto"), arrow, river, shops] if far
             else [(fac, "auto"), arrow, (dep, "auto"), arrow, river, shops])
    cols = " ".join(c for _, c in parts)
    return f'<div class="ff-flow" style="grid-template-columns:{cols}">{"".join(h for h, _ in parts)}</div>'


# --------------------------------------------------------------------------
# 0 · where it lives: its own view under Expansion
# --------------------------------------------------------------------------
MAKE_ROWS = ["Whisky", "Bottle of Wine", "Beer", "Pack of Cigarettes", "Cigar"]


def make_table(pick: str = "") -> str:
    rows = []
    for p in sorted(MAKE_ROWS, key=lambda q: -saves_a_day(q, machines_for(q))):
        ws, rate, _ = RECIPES[p]
        k = machines_for(p)
        kit = KIT[ws] * k
        save = saves_a_day(p, k)
        left = RECIPES[p][1] * 24 * k - SOLD_BY[p]
        chip = f'<span class="ff-chip plus">+{n(left * 7)}</span>' if left > 0 else '<span class="ff-chip ok">all used</span>'
        cls = "pick" if p in pick.split("|") else ""
        rows.append(f'<tr class="{cls}"><td class="l"><b>{p}</b><span class="sub">{WS[ws][0]} · {rate}/h each</span></td>'
                    f'<td>{n(SOLD_BY[p] * 7)}</td><td>{money(SOLD_BY[p] * 7 * import_price(p))}</td><td>{k}</td><td>{money(kit)}</td>'
                    f'<td>{chip}</td><td>{money(save)}</td>'
                    f'<td class="go"><a href="Recipe.dc.html" aria-label="Plan {p}">{svg("chev")}</a></td></tr>')
    rows.append('<tr class="none"><td class="l"><b>Margarita, Martini</b><span class="sub">Bottled Goods Workstation · your shops sell none yet</span></td>'
                '<td>–</td><td>–</td><td>–</td><td>–</td><td>–</td><td>–</td><td></td></tr>')
    return (f'<table class="ff-make"><thead><tr><th class="l">Product</th><th>Sold / wk</th><th>Imports / wk</th><th>Machines</th>'
            f'<th>They cost</th><th>Surplus / wk</th><th>Saves / day</th><th></th></tr></thead><tbody>{"".join(rows)}</tbody></table>')


def plans_list() -> str:
    return f"""<div class="os-plans">
  <a class="os-plan" href="Checklist.dc.html"><span><b>Whisky and Wine</b><small>4 22nd Street · Industry City · for Brightwater Spirits</small></span>
    <span><span class="os-lab">Until production</span><span class="os-meter w" style="--w:20%"><i></i></span></span>
    <span class="v">2 of 10</span><span class="v">{money(SELF)}</span>{svg("chev")}</a>
  <a class="os-plan" href="#"><span><b>Novel</b><small>no location yet · for Brightwater Books</small></span>
    <span><span class="os-lab">Where</span><span class="os-meter" style="--w:17%"><i></i></span></span>
    <span class="v os-dim">–</span><span class="v os-dim">–</span>{svg("chev")}</a>
</div>"""


def start() -> str:
    return f"""{ctl(0, "New plan")}
<section class="os-card" style="margin-top:22px">
  <div class="ff-planhead" style="margin-top:0"><h3>What your liquor stores buy that a factory can make</h3>
    <div class="aside"><span class="os-dim" style="font-size:12.5px">Brightwater Spirits · 4 shops</span></div></div>
  <p class="os-dim" style="margin:6px 0 10px;font-size:12.5px">Your last 7 days of sales. Machines are sized to the peak day; the saving is the imports they replace, less the raw material they eat, both at import prices less {1 - DISCOUNT:.0%} for {AGENT[0]}, your best Purchasing Agent (skill {AGENT[1]}%).</p>
  {make_table()}
</section>
<div class="os-h"><h2>Your factory plans</h2><span class="c">2</span></div>
{plans_list()}"""


def links() -> str:
    store_row = gw_free_ck("", "truck", "Logistics", "Nothing delivers here yet · <span class=\"ok\">Brightwater Depot imports all five</span>",
                           f'<a class="os-btn" href="#">Depot deliveries{svg("chev")}</a><a class="os-btn" href="Main.dc.html">{svg("factory")}Plan a factory{svg("chev")}</a>')
    ways = [("Overview", "Plan a new factory", "the task list, unchanged", "Main.dc.html"),
            ("Expansion › Demand", "Plan a chain", "a type's row: the view opens on that type", "Main.dc.html"),
            ("Wiki › a business type", "Plan a factory", "the button opens the view on that type", "Main.dc.html"),
            ("Supply › Production", "Plan a factory", "a factory's lines: the view opens on that factory", "GrowWhat.dc.html"),
            ("Find a location", "Plan a factory", "the finder's context strip", "Main.dc.html"),
            ("Search", "new factory, plan a chain, open a factory", "one entry, Plan a factory", "Main.dc.html")]
    rows = "".join(f'<a class="os-plan" style="grid-template-columns:200px minmax(0,1fr) 20px" href="{h}"><span><b>{w}</b></span>'
                   f'<span><b style="font-weight:500">{b}</b><small>{why}</small></span>{svg("chev")}</a>' for w, b, why, h in ways)
    return f"""<div class="ff-links">
  <div><h2>One menu point: Plan a factory</h2><p class="lead">Expansion keeps four views. Plan a factory is now the whole flow: the planner is its first step.</p>
    <div class="ff-frame" style="padding:14px 18px">
      <div class="os-views" style="margin:0;padding-left:12px"><a href="#">Demand</a><a href="#">Find a location</a><a href="#">Open a store</a><a class="on" href="#">Plan a factory</a></div></div>
    <h2 style="margin-top:26px">From the store flow's checklist</h2><p class="lead">Open a store › Until opening › Logistics: the same button, now into step 1 with the store's type picked.</p>
    <div class="ff-frame ff-hl"><div class="os-cks" style="border-top:0">{store_row}</div></div></div>
  <div><h2>Every other way in</h2><p class="lead">All of them open the same route; the ones that know a factory open it on that factory.</p>
    <div class="os-plans">{rows}</div></div>
</div>"""


def gw_free_ck(state: str, icon: str, title: str, sub: str, act: str, p: int = 0, cls: str = "") -> str:
    st = svg("tick") if state == "done" else ""
    style = f' style="--p:{p}%"' if state == "part" else ""
    return (f'<div class="os-ck {state} {cls}"{style}><span class="st">{st}</span><span class="ic">{svg(icon)}</span>'
            f'<span class="tx"><b>{title}</b><small>{sub}</small></span><span class="act">{act}</span></div>')


ck = gw_free_ck


# --------------------------------------------------------------------------
# 1 · what: the product lines
# --------------------------------------------------------------------------
def stepper(k: int) -> str:
    return (f'<span class="ff-step"><button type="button" aria-label="One fewer">{svg("minus")}</button><b>{k}</b>'
            f'<button type="button" aria-label="One more">{svg("plus")}</button></span>')


def lines_table() -> str:
    rows = []
    for p, k in LINES:
        ws, rate, raw = RECIPES[p]
        if not k:
            rows.append(f'<tr class="off"><td class="l"><b>{p}</b><span class="sub">{WS[ws][0]} · {rate}/h</span></td><td>{stepper(0)}</td>'
                        f'<td>–</td><td><span class="ff-chip dim">bought in</span></td><td><span class="os-dim">–</span></td>'
                        f'<td class="os-dim">{money(saves_a_day(p, machines_for(p)) * 7)}<span class="sub">with {machines_for(p)}</span></td></tr>')
            continue
        made = MADE_DAY[p] * 7
        sold = SOLD_BY[p] * 7
        diff = made - sold
        chip = (f'<span class="ff-chip plus">+{n(diff)} surplus</span>' if diff > 0
                else f'<span class="ff-chip short">{n(diff)} short</span>')
        mats = "".join(f'<span class="ff-mat">{m}<b>{n(q * 24 * 7 * k)}</b></span>' for m, q in raw)
        rows.append(f'<tr><td class="l"><b>{p}</b><span class="sub">{WS[ws][0]} · {rate}/h each</span></td><td>{stepper(k)}</td>'
                    f'<td>{n(made)}</td><td><span class="sub" style="margin:0 0 4px">shops take {n(sold)}</span>{chip}</td>'
                    f'<td><div class="ff-mats">{mats}</div></td><td>{money(saves_a_day(p, k) * 7)}</td></tr>')
    tot_save = sum(saves_a_day(p, k) * 7 for p, k in LINES if k)
    return (f'<table class="ff-lines"><thead><tr><th class="l">Product</th><th>Machines</th><th>Made / week</th><th>Supplies</th>'
            f'<th>Raw material / week</th><th>Saves / week</th></tr></thead><tbody>{"".join(rows)}</tbody>'
            f'<tfoot><tr><td class="l">{KITS} workstations</td><td></td><td>{n(sum(MADE_DAY.values()) * 7)}</td><td></td>'
            f'<td>{money(RAW_COST_WK)}</td><td>{money(tot_save)}</td></tr></tfoot></table>')


def recipe() -> str:
    kit = " + ".join(f"{m} {money(p)}" for m, p in WS["bottled"][1])
    return f"""{ctl(0)}
{planbar(where=False, inv="none")}
<div class="os-h"><h2>Lines</h2><span class="c">Brightwater Spirits · 4 liquor stores</span>
  <div class="aside"><span class="os-lab">Size to</span><nav class="os-seg"><a href="#">Peak day</a><a href="#">Average day</a><a class="on" href="#">Custom</a></nav>
  <span class="os-dim" style="font-size:12px">peak day: Wine ×2</span></div></div>
{lines_table()}
<p class="os-dim" style="font-size:12px;margin:10px 0 0">At import prices: wholesale × today's price index × public prices {MARKET}, less {1 - DISCOUNT:.0%} for {AGENT[0]}, your best Purchasing Agent (skill {AGENT[1]}%).</p>
<div class="ff-kit">{svg("gear", "os-ico")}<span><b>One Bottled Goods Workstation</b> = {kit} = <span class="m">{money(KIT["bottled"])}</span></span>
  <span class="aside">Factory Supply Depot · 2 25th Street</span></div>
<div class="os-rows" style="margin-top:14px"><div class="os-row"><span class="mk"></span>{svg("alert")}<span class="t">Bottle of Wine stays short<small>1 machine makes {n(MADE_DAY["Bottle of Wine"] * 7)} a week; your shops take {n(SOLD_BY["Bottle of Wine"] * 7)}. The rest keeps coming from United Ocean Import.</small></span><span class="a">{n(-SHORT_WK)}<small>A WEEK</small></span><span></span></div></div>
<div class="ff-note">{svg("ship")}<span><b>{n(SURPLUS_WK)} Whisky a week more than your shops take, worth {money(EXPORT_WK)} as an export.</b>
  A pier pays ${EXPORT_EACH:.2f} each today: wholesale $8 × Whisky's price index {INDEX["Whisky"]:.2f} × public prices {MARKET} × export price {EXPORT_MULT}.
  Each week's exports pull the index down, by a quarter of what you export over the importer's weekly cap.</span><a class="os-btn q" href="#">Whisky at the piers{svg("chev")}</a></div>
{flow()}
<div style="display:flex;justify-content:flex-end;margin-top:18px"><a class="os-cta" href="Location.dc.html">Where{svg("right")}</a></div>"""


def no_depot() -> str:
    return f"""{ctl(0, "Whisky and Wine")}
{planbar(where=False, inv="none")}
<div class="ff-note warn">{svg("crate")}<span><b>No depot yet.</b> Your liquor stores are stocked by hand from wholesalers. To supply these shops, the
  factory needs a depot, so this plan adds one: a warehouse building, pallet shelves to receive, a van and a driver, and a Logistics Manager for its delivery plan.</span>
  <a class="os-btn" href="#">Without a depot</a></div>
{flow("none")}
<div class="os-h"><h2>What the depot adds</h2><span class="c">step 3 counts it</span></div>
<table class="os-inv" style="margin-top:0"><thead><tr><th class="l">Item</th><th class="l">Why</th><th>Qty</th><th>Each</th><th>Total</th></tr></thead><tbody>
<tr class="grp"><td colspan="5">Depot<span>beside the factory: {DEPOT_NEW["addr"]}, Industry City, I3</span><b>{money(DEPOT_TOTAL)}</b></td></tr>
<tr><td class="l">Deposit<span class="sub">about 90 days of rent ({money(DEPOT_NEW["rent"])}/day) with the building's own fittings</span></td><td class="w"></td><td></td><td></td><td>{money(DEPOT_NEW["deposit"])}</td></tr>
<tr><td class="l">Pallet Shelf</td><td class="w">{tag("req", "Receives deliveries")}</td><td>{DEPOT_SHELVES}</td><td>{money(SHELVES[1])}</td><td>{money(DEPOT_SHELVES * SHELVES[1])}</td></tr>
<tr><td class="l">{VAN[0]}</td><td class="w">{tag("req", "One vehicle")} {tag("", "up to 6 stops: your 4 shops")}</td><td>1</td><td>{money(VAN[1])}</td><td>{money(VAN[1])}</td></tr>
</tbody><tfoot><tr><td class="l">Factory and depot</td><td></td><td></td><td></td><td>{money(SELF + DEPOT_TOTAL)}</td></tr></tfoot></table>
<p class="os-dim" style="font-size:12.5px;margin-top:10px">Only one-off costs count here. The depot's rent ({money(DEPOT_NEW["rent"])}/day) and its driver are running costs, outside the investment. The depot belongs to the chain like the factory does.</p>"""


GROW = [("Whisky", 2, 2), ("Bottle of Wine", 1, 1), ("Beer", 0, 2)]   # product, machines now, planned


def grow_lines() -> str:
    rows = []
    for p, now, k in GROW:
        ws, rate, raw = RECIPES[p]
        made = rate * 24 * 7 * k
        sold = SOLD_BY[p] * 7
        diff = made - sold
        chip = (f'<span class="ff-chip plus">+{n(diff)} surplus</span>' if diff > 0 else f'<span class="ff-chip short">{n(diff)} short</span>')
        delta = f'<span class="ff-delta">{k - now:+d}</span>' if k != now else '<span class="ff-delta" style="color:var(--ink-3)">as now</span>'
        mats = "".join(f'<span class="ff-mat">{m}<b>{n(q * 24 * 7 * k)}</b></span>' for m, q in raw)
        rows.append(f'<tr><td class="l"><b>{p}</b><span class="sub">{WS[ws][0]} · {now} running</span></td><td>{stepper(k)}{delta}</td>'
                    f'<td>{n(made)}</td><td><span class="sub" style="margin:0 0 4px">shops take {n(sold)}</span>{chip}</td>'
                    f'<td><div class="ff-mats">{mats}</div></td></tr>')
    return (f'<table class="ff-lines"><thead><tr><th class="l">Product</th><th>Machines</th><th>Made / week</th><th>Supplies</th>'
            f'<th>Raw material / week</th></tr></thead><tbody>{"".join(rows)}</tbody></table>')


def grow_ingredients() -> str:
    now_wk, plan_wk, used = {}, {}, {}
    for p, now, k in GROW:
        for m, q in RECIPES[p][2]:
            now_wk[m] = now_wk.get(m, 0) + q * 168 * now
            plan_wk[m] = plan_wk.get(m, 0) + q * 168 * k
            if k:
                used.setdefault(m, []).append(p.replace("Bottle of ", ""))
    rows, tot = [], 0
    for m in sorted(plan_wk, key=lambda x: -plan_wk[x]):
        if not plan_wk[m]:
            continue
        on = now_wk[m]
        ch = plan_wk[m] - on
        cash = plan_wk[m] * RAW_PRICE[m] * RAW_FACTOR
        tot += cash
        chg = (f'<span class="ff-delta">+{n(ch)}</span>' if ch else '<span class="os-dim">–</span>')
        tag_ = '' if on else ' <span class="ff-chip short">not ordered</span>'
        rows.append(f'<tr><td class="l"><b>{m}</b>{tag_}</td><td class="l os-dim">{", ".join(used[m])}</td><td>{n(plan_wk[m])}</td>'
                    f'<td>{n(on)}</td><td>{chg}</td><td>{money(cash)}</td></tr>')
    return (f'<table class="os-inv ff-ing" style="margin-top:0"><thead><tr><th class="l">Ingredient</th><th class="l">Used by</th><th>Company target</th>'
            f'<th>On order now</th><th>Change</th><th>Cash / week</th></tr></thead><tbody>{"".join(rows)}</tbody>'
            f'<tfoot><tr><td class="l">Total</td><td></td><td></td><td></td><td></td><td>{money(tot)}</td></tr></tfoot></table>')


GROW_ADDED = sum(k - now for _p, now, k in GROW)                     # 2 workstations
GROW_SHELVES = 4
GROW_ITEMS = [(m, p_, GROW_ADDED) for m, p_ in WS["bottled"][1]] + [(SHELVES[0], SHELVES[1], GROW_SHELVES)]
GROW_TOTAL = sum(p_ * q for _m, p_, q in GROW_ITEMS) + DELIVERY        # 275,250
GROW_FIRM = FEE + sum(p_ * q for _m, p_, q in GROW_ITEMS)               # the firm prices the whole floor again
GROW_WORKERS = -(-(MACHINE_H + GROW_ADDED * 168) // 50) - WORKERS     # 6


def grow_raw_week() -> float:
    tot = 0.0
    for p_, _now, k in GROW:
        for m, q in RECIPES[p_][2]:
            tot += q * 168 * k * RAW_PRICE[m] * RAW_FACTOR
    return tot


def grow_bar(stage: str = "") -> str:
    inv = (f'<b class="m">{money(GROW_TOTAL)}</b><small>new machines only · one-off</small>' if stage != "what"
           else '<b class="dim">–</b><small>after the lines</small>')
    return (f'<div class="os-pb"><div><span class="os-lab">Make</span><b>Beer ×2 added</b><small>Whisky ×2 · Wine ×1 as now</small></div>'
            f'<div><span class="os-lab">Where</span><b>{NEW["addr"]}</b><small>yours since day {FACTORY_OPENED} · nothing to rent</small></div>'
            f'<div><span class="os-lab">Investment</span>{inv}</div>'
            f'<div class="ff-run"><span class="os-lab">Running costs added</span>{run_cell(grow_raw_week() - RAW_COST_WK, GROW_ADDED * 168 * HOURLY["factoryworker"], 0)}</div></div>')


def grow_what() -> str:
    short = SOLD_BY["Beer"] * 7 - 2 * 50 * 168
    return f"""{ctl(0, target="owned")}
{grow_bar("what")}
<div class="os-h"><h2>Lines</h2><span class="c">{NEW["addr"]} · producing since day {STARTED}</span>
  <div class="aside"><span class="os-lab">Size to</span><nav class="os-seg"><a href="#">As now</a><a href="#">Peak day</a><a class="on" href="#">Custom</a></nav></div></div>
{grow_lines()}
<div class="os-rows" style="margin-top:14px"><div class="os-row"><span class="mk"></span>{svg("alert")}<span class="t">Beer stays short<small>2 machines make {n(2 * 50 * 168)} a week; your shops take {n(SOLD_BY["Beer"] * 7)}. The rest keeps coming from United Ocean Import.</small></span><span class="a">{n(-short)}<small>A WEEK</small></span><span></span></div></div>
<div class="os-h"><h2>Ingredients</h2><span class="c">order ahead · all your factories</span></div>
{grow_ingredients()}
<p class="os-dim" style="font-size:12px;margin:10px 0 0">At import prices: wholesale × today's price index × public prices {MARKET}, less {1 - DISCOUNT:.0%} for {AGENT[0]}, your best Purchasing Agent (skill {AGENT[1]}%).</p>
<div style="display:flex;justify-content:flex-end;margin-top:18px"><a class="os-cta" href="GrowInvestment.dc.html">Investment{svg("right")}</a></div>"""


def grow_invest() -> str:
    a = VENDORS["fsd"]
    rows = "".join(f'<tr><td class="l">{q} × {m}</td><td class="w">{tag("req", "Workstation") if m != SHELVES[0] else tag("req", "Holds stock")}</td><td>{money(p_ * q)}</td></tr>'
                   for m, p_, q in GROW_ITEMS)
    tog = (f'<div class="os-toolbar"><nav class="os-seg big" aria-label="Interior"><a href="#">Installation firm <b>{money(GROW_FIRM)}</b></a>'
           f'<a class="on" href="#">Self-installation <b>{money(GROW_TOTAL)}</b></a></nav>'
           f'<div class="aside"><span>Added</span><b>{sum(q for *_x, q in GROW_ITEMS)} items</b></div></div>')
    pins = pin(a[2], "A", "store") + pin(NEW["addr"], "4", "new", NEW["addr"])
    return f"""{ctl(2, target="owned")}
{grow_bar()}
{tog}
<div class="os-self">
  <div><div class="os-store"><div class="os-sh"><span class="k">{a[0]}</span><span><b>{a[1]}</b><small>{a[2]} · Industry City</small></span><span class="t">{money(GROW_TOTAL)}</span></div>
<table><tbody>{rows}<tr class="del"><td class="l">Delivery</td><td class="w"></td><td>{money(DELIVERY)}</td></tr></tbody></table></div>
    <div class="ff-callout" style="background:var(--raised)">{svg("key")}<span><b>Nothing else to pay.</b> The lease, the deposit and the {TRUCK[0]} are there already;
      the installation firm would charge for the whole floor again ({money(FEE)}).</span></div>
    <div class="os-total"><span>Investment</span><small>one-off, upfront · the new machines and shelves · 1 delivery</small><b>{money(GROW_TOTAL)}</b></div></div>
  <div>{city(pins, zoom=False)}</div>
</div>"""


def grow_until() -> str:
    btn = lambda icon, label: f'<a class="os-cta sm" href="Hire.dc.html">{svg(icon)}{label}</a>'  # noqa: E731
    rows = "".join([
        ck("", "gear", f"Machines {hand()}", f"{GROW_ADDED} new workstations, {GROW_SHELVES} pallet shelves · room on the floor: check in the game",
           ingame(f"Place them at {NEW['addr']}, each production machine against its Food Assembly Machine.")),
        ck("", "list", f"Recipes {hand()}", "Beer on workstations 4 and 5", ingame(f"<b>BizMan › {NEW['addr']} › Production</b>: pick Beer.")),
        ck("", "people", "Staff for the new machines", f"{GROW_ADDED * 168} machine-hours a week more · {GROW_WORKERS} Factory Workers · <span class=\"ok\">19 candidates</span>",
           btn("hire", f"Hire {GROW_WORKERS}")),
        ck("", "ship", f"New ingredients on the contract {hand()}", "Hops and Carbon Dioxide are not on the Aquatic Bay Cargo contract yet",
           ingame("At <b>8 Pier</b>, add Hops and Carbon Dioxide to the factory's contract.")),
        ck("later", "crate", "Weekly amounts", "<span class=\"lt\">once both are on the contract</span> · Barley, Water and Yeast up, Hops and Carbon Dioxide new",
           btn("crate", "Set 5 amounts")),
        ck("", "route", f"Delivery plan {hand()}", f"Add Beer, up to 16,800, to {NEW['addr']} → {DEPOT['name']}",
           ingame("<b>BizMan › Logistics</b>: add Beer to the factory's plan.")),
        ck("later", "crate", "The depot's imports", "<span class=\"lt\">after the first delivery</span> · Beer still comes from United Ocean Import",
           '<a class="os-btn" href="#">' + svg("crate") + "Lower 1 amount</a>"),
    ])
    return f"""{ctl(3, target="owned")}
{grow_bar()}
<div class="os-prog"><h2>Until production</h2><span class="m" style="--w:0%"><i></i></span><span class="c">0 of 7</span>
  <div class="aside"><span class="os-live"><i></i>Game linked</span><span>only what the change needs</span></div></div>
<div class="os-cks">{rows}</div>"""


def grow_running() -> str:
    lines = [("Whisky", "Workstations 1 and 2", 2400, 2280, 1850), ("Bottle of Wine", "Workstation 3", 1200, 1140, 1140),
             ("Beer", "Workstations 4 and 5 · new", 2400, 2160, 2160)]
    out = []
    for p_, sub, plan, made, ship in lines:
        pct = made / plan * 100
        out.append(f'<tr><td class="l"><b>{p_}</b><span class="sub">{sub}</span></td><td>{n(plan)}</td>'
                   f'<td>{n(made)} <small class="os-dim">{pct:.0f}%</small><span class="ff-meter" style="--w:{pct:.0f}%"><i></i></span></td><td>{n(ship)}</td></tr>')
    table = (f'<table class="ff-out"><thead><tr><th class="l">Line</th><th>Plan</th><th>Made</th><th>To the depot</th></tr></thead>'
             f'<tbody>{"".join(out)}</tbody></table>')
    plan_day = sum(l_[2] for l_ in lines)
    daily = [3420, 3410, 3420, 4300, 5310, 5520, 5560, 5570, 5580, 5570]
    week = sum(daily[-7:])
    exp_wk = (2280 - SOLD_BY["Whisky"]) * 7
    return f"""{ctl(4, target="owned")}
{grow_bar()}
<div class="os-roi">
  <div class="kpi"><span class="lab">Made a week</span><span class="v">{n(week)}</span><span class="sub">new plan {n(plan_day * 7)} · {week / (plan_day * 7) * 100:.0f}%</span></div>
  <div class="kpi"><span class="lab">To the depot</span><span class="v">{n((1850 + 1140 + 2160) * 7)}</span><span class="sub">a week · the shops take {n((SOLD_BY["Whisky"] + SOLD_BY["Bottle of Wine"] + SOLD_BY["Beer"]) * 7)}</span></div>
  <div class="kpi"><span class="lab">Exported</span><span class="v">{money(exp_wk * EXPORT_EACH)}</span><span class="sub">{n(exp_wk)} Whisky a week at ${EXPORT_EACH:.2f}</span></div>
  <div class="kpi"><span class="lab">Raw material</span><span class="v">{money(grow_raw_week() * 0.97)}</span><span class="sub">a week · new plan {money(grow_raw_week())}</span></div>
</div>
<div class="os-two" style="margin-top:18px;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)">
  <section class="os-card"><h3>Made a day</h3>{made_chart(daily, 460, 250, plan_day, 8000)}
    <p class="os-dim" style="font-size:11.5px;margin:6px 0 0">The Beer line started on day 4 of this chart; the plan line is the new plan.</p></section>
  <section class="os-card"><h3>Output against the new plan</h3>{table}
    <p class="os-dim" style="font-size:11.5px;margin:10px 0 0">A day, last 7 days. Beer stays 1,400 a week short of the shops, as planned.</p></section>
</div>"""


# --------------------------------------------------------------------------
# 2 · where
# --------------------------------------------------------------------------
def location() -> str:
    pins = (pin(VENDORS["fsd"][2], "A", "store") + pin(VENDORS["trucks"][2], "B", "store")
            + "".join(pin(a, str(i + 1), "" if a == NEW["addr"] else "dim") for i, (a, *_r) in enumerate(FINDS)
                      if LOC[a]["region"] == "industry-city"))
    rows = []
    for i, (a, lay, m2, veh, rent, dep) in enumerate(FINDS):
        h = LOC[a]["hood"]
        rows.append(f'<tr class="{"pick" if a == NEW["addr"] else ""}"><td class="l os-mono" style="white-space:nowrap">{i + 1} {hood(h)}</td>'
                    f'<td class="l"><b>{a}</b><small>{lay} · {n(m2)} m²</small></td><td>{veh}</td>'
                    f'<td>{money(rent)}</td><td>{money(dep)}</td><td>{money(rent * 7)}</td></tr>')
        if a == NEW["addr"]:
            more = (f'<div class="os-pick"><div class="fx"><span>Rent<b>{money(rent)}/day</b></span><span>Deposit<b>{money(dep)}</b></span>'
                    f'<span>Vehicles<b>{veh}</b></span><span>Floor<b>{n(m2)} m²</b></span></div>'
                    f'<a class="os-cta sm" href="Investment.dc.html">Plan here{svg("right")}</a></div>')
            rows.append(f'<tr class="more"><td></td><td colspan="5">{more}</td></tr>')
    hoods = "".join(f'<span class="os-ch on">{t}</span>' for t in ("GD", "HK", "IC", "LM", "MT", "MH", "HA"))
    sizes = '<span class="os-ch">min –</span><span class="os-ch">max –</span>'
    note = (f'<div class="ff-facts"><div><span class="os-lab">Building</span><b>Warehouse</b><small>every factory rents one</small></div>'
            f'<div><span class="os-lab">Deposit</span><b>~90 days</b><small>of rent, as for a depot</small></div>'
            f'<div><span class="os-lab">Vehicles</span><b>H 1 · I–Q 2</b><small>one parking slot per truck</small></div>'
            f'<div><span class="os-lab">Not counted</span><b>distance</b><small>deliveries cost nothing by distance</small></div></div>')
    return f"""{ctl(1)}
{planbar(where=False, inv="none")}
<div class="ff-finder">
  <div>{city(pins)}<p class="os-dim" style="font-size:11.5px;margin:6px 0 0">Industry City. Rows 1 to 3 are in Manhattan; the map shows the district of the row you pick.</p></div>
  <div class="os-fp">
    <div class="os-fr"><span>Type</span><div class="row"><span class="os-ch on set">Factory</span><span class="os-dim" style="font-size:12px">warehouse buildings, from the plan</span></div></div>
    <div class="os-fr"><span>Show</span><div class="row"><span class="os-ch on">To rent 52</span><span class="os-ch">For sale 9</span></div></div>
    <div class="os-fr"><span>Size</span><div class="row">{sizes}<span class="os-dim" style="font-size:12px">every size, H to Q</span></div></div>
    <div class="os-fr"><span>Where</span><div class="row">{hoods}</div></div>
    <table class="os-ft"><thead><tr><th class="l">#</th><th class="l">Address</th><th>Vehicles</th><th>Rent</th><th>Deposit</th><th>Rent / week</th></tr></thead>
    <tbody>{"".join(rows)}</tbody></table>
    {note}
  </div>
</div>"""


# --------------------------------------------------------------------------
# 3 · investment
# --------------------------------------------------------------------------
def toggle(mode: str) -> str:
    f = "on" if mode == "firm" else ""
    s = "on" if mode == "self" else ""
    return (f'<nav class="os-seg big" aria-label="Interior"><a class="{f}" href="InvestmentFirm.dc.html">Installation firm <b>{money(FIRM)}</b></a>'
            f'<a class="{s}" href="Investment.dc.html">Self-installation <b>{money(SELF)}</b></a></nav>')


def toolbar(mode: str) -> str:
    return (f'<div class="os-toolbar">{toggle(mode)}<div class="aside"><span>Ready to produce</span><b>{sum(q for *_x, q in ITEMS)} items · 1 truck</b>'
            f'<span>Items</span><b>{money(ITEMS_TOTAL)}</b></div></div>')


def item_rows(fmt: str = "self") -> str:
    out = []
    for m, p, q in ITEMS:
        why = tag("req", "Workstation") if m != SHELVES[0] else tag("req", "Holds stock")
        if fmt == "self":
            out.append(f'<tr><td class="l">{q} × {m}</td><td class="w">{why}</td><td>{money(p * q)}</td></tr>')
        else:
            out.append(f'<tr><td class="l">{m}</td><td class="w">{why}</td><td>{q}</td><td>{money(p)}</td><td>{money(p * q)}</td></tr>')
    return "".join(out)


def investment_self() -> str:
    a, b = VENDORS["fsd"], VENDORS["trucks"]
    cards = f"""<div class="os-store"><div class="os-sh"><span class="k">{a[0]}</span><span><b>{a[1]}</b><small>{a[2]} · Industry City</small></span><span class="t">{money(ITEMS_TOTAL + DELIVERY)}</span></div>
<table><tbody>{item_rows()}<tr class="del"><td class="l">Delivery</td><td class="w"></td><td>{money(DELIVERY)}</td></tr></tbody></table></div>
<div class="os-store"><div class="os-sh"><span class="k">{b[0]}</span><span><b>{b[1]}</b><small>{b[2]} · Industry City · you drive it in</small></span><span class="t">{money(TRUCK[1])}</span></div>
<table><tbody><tr><td class="l">1 × {TRUCK[0]}</td><td class="w">{tag("req", "One vehicle to deliver")} {tag("cap", "Driver at 95% skill")}</td><td>{money(TRUCK[1])}</td></tr></tbody></table></div>
<div class="os-store"><div class="os-sh"><span class="k p">{svg("interior", "os-ico")}</span><span><b>Walls and floors</b><small>Industry City asks for no interior score, and no customer comes in</small></span><span class="t">$0</span></div></div>
<div class="os-store"><div class="os-sh"><span class="k p">{svg("key", "os-ico")}</span><span><b>Deposit</b><small>about 90 days of rent ({money(NEW["rent"])}/day) with the building's own fittings · refunded when the lease ends</small></span><span class="t">{money(NEW["deposit"])}</span></div></div>"""
    pins = (pin(a[2], "A", "store") + pin(b[2], "B", "store") + pin(NEW["addr"], "NEW", "new", NEW["addr"]) + pin(DEPOT["addr"], "D", "dep"))
    legend = (f'<div><i>A</i><span>{a[1]}</span><b>{money(ITEMS_TOTAL + DELIVERY)}</b></div><div><i>B</i><span>{b[1]}</span><b>{money(TRUCK[1])}</b></div>'
              f'<div><i class="n">NEW</i><span>{NEW["addr"]}</span><b></b></div><div><i class="n" style="background:#e9ece6;color:#0d100f">D</i><span>{DEPOT["name"]}</span><b></b></div>')
    return f"""{ctl(2)}
{planbar(inv="self")}
{toolbar("self")}
<div class="os-self">
  <div>{cards}
    <div class="os-total"><span>Investment</span><small>one-off, upfront · {sum(q for *_x, q in ITEMS)} items · 1 delivery · a truck · deposit</small><b>{money(SELF)}</b></div></div>
  <div>{city(pins, zoom=False)}<div class="os-maplist">{legend}</div>
    <p class="os-dim" style="font-size:12px;margin-top:12px">Everything is bought in Industry City, a few streets from the factory.</p></div>
</div>{finance()}"""


def investment_firm() -> str:
    body = [f'<tr class="grp"><td colspan="5">Installation firm<span>the fee is per square metre of floor, whatever goes on it</span><b>{money(FEE)}</b></td></tr>',
            f'<tr><td class="l">Installation fee<span class="sub">586 × {n(NEW["m2"])} m²</span></td><td class="w"></td><td></td><td></td><td>{money(FEE)}</td></tr>',
            '<tr><td class="l">Walls and floors<span class="sub">none asked in Industry City</span></td><td class="w"></td><td></td><td></td><td class="free">free</td></tr>',
            f'<tr class="grp"><td colspan="5">Production<span>3 Bottled Goods Workstations and storage</span><b>{money(ITEMS_TOTAL)}</b></td></tr>',
            item_rows("firm"),
            f'<tr class="grp"><td colspan="5">Bought by you either way<span>the firm places no vehicle</span><b>{money(TRUCK[1])}</b></td></tr>',
            f'<tr><td class="l">{TRUCK[0]}<span class="sub">General US Trucks · 1 Seventh Avenue</span></td><td class="w">{tag("req", "One vehicle to deliver")}</td><td>1</td><td>{money(TRUCK[1])}</td><td>{money(TRUCK[1])}</td></tr>',
            f'<tr class="grp"><td colspan="5">Deposit<span>refunded when the lease ends</span><b>{money(NEW["deposit"])}</b></td></tr>',
            f'<tr><td class="l">About 90 days of rent<span class="sub">{money(NEW["rent"])}/day, with the building\'s own fittings</span></td><td class="w"></td><td></td><td></td><td>{money(NEW["deposit"])}</td></tr>']
    return f"""{ctl(2)}
{planbar(inv="firm")}
{toolbar("firm")}
<div class="ff-callout">{svg("alert")}<span><b>The fee alone is {money(FEE)}</b>, more than the machines: a factory floor is {n(NEW["m2"])} m², a shop's 225.
  Self-installation saves {money(FIRM - SELF)} here.</span></div>
<table class="os-inv"><thead><tr><th class="l">Item</th><th class="l">Why</th><th>Qty</th><th>Each</th><th>Total</th></tr></thead>
<tbody>{"".join(body)}</tbody>
<tfoot><tr><td class="l">Investment<span class="sub">one-off, upfront</span></td><td></td><td></td><td></td><td>{money(FIRM)}</td></tr></tfoot></table>"""


def finance() -> str:
    return f"""<section class="os-card" style="margin-top:18px">
  <div class="ff-planhead" style="margin-top:0"><h3 style="font-size:14.5px">Financing</h3><span class="ff-sw"><i></i>Borrow part of it</span>
    <div class="aside"><nav class="os-seg"><a class="on" href="#">Vantander Bank <b>12%</b></a><a href="#">Jensen Capital <b>20%</b></a></nav>
    <span class="os-dim" style="font-size:12.5px">lends you up to $2,000,000 now</span></div></div>
  <div class="ff-fin"><div><span class="os-lab">Borrow</span><b>{money(LOAN)}</b><small>of {money(SELF)}</small></div>
    <div><span class="os-lab">Cash upfront</span><b>{money(SELF - LOAN)}</b><small>the rest of the investment</small></div>
    <div><span class="os-lab">Repaid a day</span><b>{money(LOAN_INT + LOAN_REPAY)}</b><small>{money(LOAN_REPAY)} back + {money(LOAN_INT)} interest</small></div>
    <div><span class="os-lab">Interest</span><b>{money(LOAN_INT * LOAN_DAYS)}</b><small>over {LOAN_DAYS} days · less if paid off early</small></div></div>
</section>"""


# --------------------------------------------------------------------------
# 4 · until production: the checklist
# --------------------------------------------------------------------------
def ingame(text: str) -> str:
    return f'<span class="os-ingame">{svg("game")}<span>{text}</span></span>'


def hand() -> str:
    return '<span class="ff-hand">in the game</span>'


def checklist(linked: bool = True) -> str:
    when = lambda d: f'<span class="when">{d}</span>'  # noqa: E731
    btn = lambda icon, label, href="Hire.dc.html": f'<a class="os-cta sm" href="{href}">{svg(icon)}{label}</a>'  # noqa: E731
    if linked:
        staff = btn("hire", f"Hire {WORKERS + 1}")
        hq = btn("hire", "Hire 1")
        amounts = btn("crate", "Set 5 amounts", "Hire.dc.html")
        depot = f'<a class="os-btn" href="#">{svg("crate")}Lower 2 amounts</a>'
    else:
        staff = ingame(f"<b>MyEmployees</b> on your phone: hire {WORKERS} Factory Workers and 1 Delivery Driver (95% skill or more) for {NEW['addr']}, then their week in <b>BizMan › Schedule</b>.")
        hq = ingame("<b>MyEmployees</b>: hire a Purchasing Agent for headquarters and give them a computer workstation.")
        amounts = ingame("<b>BizMan › Imports › Aquatic Bay Cargo</b>: Barley 33,600, Grapes 16,800, Yeast 25,200, Water 16,800, Sugar 8,400 a week.")
        depot = ingame("<b>BizMan › Imports</b> at Brightwater Depot: lower Whisky and Bottle of Wine once the factory delivers.")
    setup = "".join([
        ck("done", "key", "Lease", f"{NEW['addr']} rented, deposit {money(NEW['deposit'])} paid", when("day 170")),
        ck("part", "gear", f"Machines {hand()}", "2 of 3 workstations complete · <span class=\"w\">Workstation 3 has no Industrial Blending Machine</span>",
           ingame(f"Place it against the Food Assembly Machine at {NEW['addr']}."), 67),
        ck("", "list", f"Recipes {hand()}", "Whisky on workstations 1 and 2, Bottle of Wine on 3 · none set",
           ingame(f"<b>BizMan › {NEW['addr']} › Production</b>: pick each workstation's recipe.")),
        ck("done", "truck", "Truck", f"{TRUCK[0]} parked at {NEW['addr']}", when("day 171")),
        ck("", "key", f"Driver on the truck {hand()}", f"The {TRUCK[0]} has no driver assigned",
           ingame(f"<b>BizMan › {NEW['addr']} › Vehicles</b>: assign the Delivery Driver to the {TRUCK[0]}, once hired.")),
    ])
    people = "".join([
        ck("", "people", "Staff for the machines", f"0 of {WORKERS} Factory Workers · {MACHINE_H} h a week, 3 machines around the clock · 1 Delivery Driver at 95% skill or more · "
           "<span class=\"ok\">23 and 4 candidates</span>", staff),
        ck("part", "desk", "Headquarters", "Logistics Manager: Mia Park is free · <span class=\"w\">no Purchasing Agent free for a new contract</span>", hq, 50),
    ])
    goods = "".join([
        ck("", "ship", f"Raw material contract {hand()}", "Aquatic Bay Cargo, 8 Pier: Barley, Grapes, Sugar, Water, Yeast · no contract yet",
           ingame("Go to <b>8 Pier</b> with your Purchasing Agent and sign a contract for the factory.")),
        ck("later", "crate", "Weekly amounts", "<span class=\"lt\">once the contract exists</span> · the plan's amounts, Smart Delivery off", amounts),
        ck("", "route", f"Delivery plan {hand()}", f"{NEW['addr']} → {DEPOT['name']}: Whisky up to 16,800, Bottle of Wine up to 8,400 · 08:00 daily",
           ingame("<b>BizMan › Logistics</b>: Mia Park's plan for the factory. The depot needs pallet shelves free to receive.")),
        ck("later", "crate", "The depot's imports", "<span class=\"lt\">after the first delivery</span> · Whisky and Bottle of Wine still come from United Ocean Import", depot),
        ck("skip", "shirt", "Uniforms", "Not needed: no customer comes into a factory", ""),
    ])
    live = ('<span class="os-live"><i></i>Game linked</span>' if linked else '<span class="os-live off"><i></i>Save file · game not linked</span>')
    gate = "" if linked else (f'<div class="os-gate">{svg("plug", "os-ico")}<span><b>Link the game</b> and staff and amounts become buttons. '
                              'Machines, recipes, contracts and delivery plans stay in the game: the link has no write for them.</span>'
                              '<a class="os-btn" href="#">How to link</a></div>')
    return f"""{ctl(3)}
{planbar(inv="self")}
<div class="os-prog"><h2>Until production</h2><span class="m" style="--w:20%"><i></i></span><span class="c">2 of 10</span>
  <div class="aside">{live}<span>from the save · day 171, 14:05</span></div></div>
<div class="ff-sub">The site</div><div class="os-cks">{setup}</div>
<div class="ff-sub">People</div><div class="os-cks">{people}</div>
<div class="ff-sub">Goods in and out</div><div class="os-cks">{goods}</div>
{gate}"""


def hire_dialogs() -> str:
    week = "".join(f'<span><i style="--h:100%"></i>{d}</span>' for d in ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])
    sites = f"""<div class="ff-sites">
<div class="ff-site"><div>{hood("Industry City")}{NEW["addr"]} · factory<small>3 machines · 24/7</small></div>
  <div class="ff-hr"><span><b>{WORKERS} Factory Workers</b><small>skill 85–100% · best first, equal skill to the lower wage</small></span><span class="v">{MACHINE_H} h</span><span class="v">{n(WORKERS)}</span></div>
  <div class="ff-hr"><span><b>1 Delivery Driver</b><small>96% · qualified for the {TRUCK[0]} (95%)</small></span><span class="v">{DRIVER_H} h</span><span class="v">1</span></div>
  <div class="ff-week">{week}</div></div>
</div>"""
    hire = gw.dialog("hire", "Staff this factory", gw.where("IC", f"{NEW['addr']} · factory"),
                     gw.verdict("ok", f"<b>The game agrees</b>: {WORKERS + 1} hires and their week", "dry run · 14:05"),
                     sites + gw.call("info", "clock", "Each machine gets two 12-hour entries a day, placed around the workers' own wishes."),
                     gw.hint("Undo stays until your next hire") + gw.btn("Cancel", "ghost") + gw.btn("Hire", "go", "right", str(WORKERS + 1)))
    amts = [("Barley", 0, 33_600), ("Grapes", 0, 16_800), ("Yeast", 0, 25_200), ("Water", 0, 16_800), ("Sugar", 0, 8_400)]
    rows = "".join(f'<tr><td class="l">{m}</td><td class="v was">{n(a)}</td><td class="v">{n(b)}</td><td class="v">{money(b * RAW_PRICE[m] * RAW_FACTOR)}</td></tr>' for m, a, b in amts)
    body = (f'<table class="ff-amts"><thead><tr><th class="l">Raw material</th><th>Now</th><th>A week</th><th>Cost</th></tr></thead><tbody>{rows}'
            f'<tr><td class="l"><b>Next delivery</b></td><td></td><td></td><td class="v"><b>{money(RAW_COST_WK)}</b></td></tr></tbody></table>'
            + gw.call("info", "truck", f"Arrives at the factory every Monday, at import prices less {1 - DISCOUNT:.0%} for {AGENT[0]} (skill {AGENT[1]}%). The contract starts with the write (Repeating on)."))
    imp = gw.dialog("crate", "Weekly amounts", gw.where("IC", f"Aquatic Bay Cargo → {NEW['addr']}"),
                    gw.verdict("ok", "<b>The game agrees</b>: 5 amounts, contract started", "orders close Sun 20:00 · in 4 d"),
                    body, gw.hint("Nothing changes until you apply") + gw.btn("Cancel", "ghost") + gw.btn("Set 5 amounts", "go", "right"))
    return f"""<div class="gw-top" style="padding:40px 48px 0"><h1>Quick buttons: the game link's own writes</h1>
<p>Staff for the machines (hire, with the week written; the Headquarters row's Hire 1 is the shipped Quick hire) and the contract's weekly amounts (imports). The imports write sets amounts on a contract that exists; signing it stays in the game.</p></div>
<div class="ff-dlgs">{gw.col("5c", "Staff this factory · hire", hire)}{gw.col("5d", "Weekly amounts · imports", imp)}</div>"""


# --------------------------------------------------------------------------
# 5 · running: output against plan, and what goes to a pier
# --------------------------------------------------------------------------


def output_table(low: bool = False) -> str:
    rows = [("Whisky", "Workstations 1 and 2", 2400, 1890 if low else 2280, 1850),
            ("Bottle of Wine", "Workstation 3", 1200, 1140, 1140)]
    out = []
    for p, sub, plan, made, ship in rows:
        pct = made / plan * 100
        w = pct < 90
        out.append(f'<tr><td class="l"><b>{p}</b><span class="sub">{sub}</span></td><td>{n(plan)}</td>'
                   f'<td class="{"w" if w else ""}">{n(made)} <small class="os-dim">{pct:.0f}%</small><span class="ff-meter{" w" if w else ""}" style="--w:{pct:.0f}%"><i></i></span></td>'
                   f'<td>{n(ship)}</td></tr>')
    return (f'<table class="ff-out"><thead><tr><th class="l">Line</th><th>Plan</th><th>Made</th><th>To the depot</th></tr></thead>'
            f'<tbody>{"".join(out)}</tbody></table>')


def made_chart(daily: list, w: int = 560, h: int = 260, plan: int | None = None, vmax: int = 4000) -> str:
    x0, y0, x1, y1 = 52, 18, w - 16, h - 40
    dmax = len(daily)
    plan = plan or sum(MADE_DAY.values())
    X = lambda d: x0 + (x1 - x0) * d / dmax  # noqa: E731
    Y = lambda v: y1 - (y1 - y0) * v / vmax  # noqa: E731
    g = []
    for v in range(0, vmax + 1, vmax // 4):
        g.append(f'<line class="grid" x1="{x0}" x2="{x1}" y1="{Y(v):.1f}" y2="{Y(v):.1f}"></line>'
                 f'<text x="{x0 - 8}" y="{Y(v) + 3.5:.1f}" text-anchor="end">{n(v)}</text>')
    for d in range(0, dmax + 1, 4 if dmax > 10 else 2):
        g.append(f'<text x="{X(d):.1f}" y="{y1 + 18}" text-anchor="middle">{d}</text>')
    bw = (x1 - x0) / dmax * .7
    bars = "".join(f'<rect class="os-dbar" style="opacity:{.55 if v >= plan * .9 else .3}" x="{X(i) + bw * .2:.1f}" y="{Y(v):.1f}" width="{bw:.1f}" height="{Y(0) - Y(v):.1f}"></rect>'
                   for i, v in enumerate(daily))
    return f"""<svg class="os-chart" viewBox="0 0 {w} {h}" role="img" aria-label="Made a day against the plan">
{"".join(g)}{bars}
<line class="ax" x1="{x0}" x2="{x1}" y1="{y1}" y2="{y1}"></line>
<line class="inv" x1="{x0}" x2="{x1}" y1="{Y(plan):.1f}" y2="{Y(plan):.1f}"></line>
<text class="lbl w" x="{x0 + 6}" y="{Y(plan) - 7:.1f}">plan {n(plan)} a day</text>
<text x="{x1}" y="{y1 + 34}" text-anchor="end">days since production started · all lines</text>
</svg>"""


def running(low: bool = False) -> str:
    daily = MADE_LOW if low else MADE
    week = sum(daily[-7:])
    plan_wk = sum(MADE_DAY.values()) * 7
    whisky = 1890 if low else 2280
    exp_wk = max(0, whisky - SOLD_BY["Whisky"]) * 7
    raw_wk = RAW_COST_WK * (0.84 if low else 1.0)
    why = ""
    if low:
        why = f"""<div class="os-h"><h2>Why output is below plan</h2><span class="c">2</span></div>
<div class="ff-why">
  <div><span class="mk"></span>{svg("people")}<span class="t">Workstation 2 has nobody on Sundays<small>144 of 168 h staffed: 1,200 Whisky fewer each Sunday</small></span><a class="os-cta sm" href="Hire.dc.html">{svg("hire")}Staff Sunday</a></div>
  <div><span class="mk"></span>{svg("ship")}<span class="t">Barley arrives short<small>28,000 a week ordered from Aquatic Bay Cargo; the machines eat 33,600</small></span><a class="os-cta sm" href="Hire.dc.html">{svg("crate")}Set Barley to 33,600</a></div>
</div>"""
    return f"""{ctl(4, target="new")}
{planbar(inv="self")}
<div class="os-roi">
  <div class="kpi"><span class="lab">Made a week</span><span class="v{" neg" if low else ""}">{n(week)}</span><span class="sub">plan {n(plan_wk)} · {week / plan_wk * 100:.0f}%</span></div>
  <div class="kpi"><span class="lab">To the depot</span><span class="v">{n((1850 + 1140) * 7)}</span><span class="sub">a week · the shops take {n((SOLD_BY["Whisky"] + SOLD_BY["Bottle of Wine"]) * 7)}</span></div>
  <div class="kpi"><span class="lab">Exported</span><span class="v">{money(exp_wk * EXPORT_EACH)}</span><span class="sub">{n(exp_wk)} Whisky a week at ${EXPORT_EACH:.2f}</span></div>
  <div class="kpi"><span class="lab">Raw material</span><span class="v">{money(raw_wk)}</span><span class="sub">a week · plan {money(RAW_COST_WK)}</span></div>
</div>
<div class="os-two" style="margin-top:18px;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)">
  <section class="os-card"><h3>Made a day</h3>{made_chart(daily, 460, 250)}</section>
  <section class="os-card"><h3>Output against plan</h3>{output_table(low)}
    <p class="os-dim" style="font-size:11.5px;margin:10px 0 0">A day, last 7 days. A worker's skill sets the share of the rate a machine reaches.</p></section>
</div>
{why}"""


# --------------------------------------------------------------------------
# 6 · Businesses › Results: the factory in its chain
# --------------------------------------------------------------------------
def be_cell(kind: str, big: str, small: str = "", meter: int | None = None) -> str:
    m = f'<span class="os-meter" style="--w:{meter}%"><i></i></span>' if meter is not None else ""
    s = f"<small>{small}</small>" if small else ""
    return f'<td class="be"><b class="{kind}">{big}</b>{s}{m}</td>'


FACTORY_OPENED = 170   # the lease (creationDay); production from STARTED


def results() -> str:
    # the shops' goods bill fell when the factory began delivering, so their profit rose
    kids = [
        ("kid", "36 Fifth Avenue", "Garment District · opened day 61", 12_010, 200_770, be_cell("ok", "Day 92", "31 days after opening")),
        ("kid", "14 First Avenue", "Hell's Kitchen · opened day 88", 16_640, 211_290, be_cell("ok", "Day 113", "25 days after opening")),
        ("kid", "8 Sixth Avenue", "Murray Hill · opened day 118", 10_980, 199_690, be_cell("ok", "Day 146", "28 days after opening")),
        ("kid", "18 Second Avenue", "Midtown · opened day 147", 13_874, 99_115, be_cell("ok", "Day 159", "12 days after opening")),
        ("kid", DEPOT["name"], f"{DEPOT['addr']} · depot", -980, 83_770, be_cell("dim", "Cost centre", "counted in the chain")),
        ("kid", NEW["addr"], f"factory · opened day {FACTORY_OPENED}, producing since {STARTED}", -4_060, SELF - DELIVERY,
         be_cell("dim", "Cost centre", "counted in the chain")),
    ]
    port = [("chain", CHAIN, "4 shops, 1 depot, 1 factory", sum(k[3] for k in kids), sum(k[4] for k in kids),
             be_cell("ok", f"Day {FACTORY_OPENED}", "as shipped: no earlier than the newest member's opening"))] + kids
    rows = []
    for kind, name, sub, prof, inv, be in port:
        chev = f'<span class="chev">{svg("chev")}</span>' if kind == "chain" else ""
        rows.append(f'<tr class="{kind}{" open" if kind == "chain" else ""}"><td class="l">{chev}<b>{name}</b><span class="sub">{sub}</span></td>'
                    f'<td class="{"pos" if prof > 0 else "neg"}">{money(prof)}</td><td>{money(inv)}</td>{be}</tr>')
    return f"""<div class="os-ctl"><nav class="os-seg" aria-label="Period"><a class="on" href="#">30 days</a><a href="#">All</a><a href="#">By weekday</a></nav>
  <div class="aside"><span class="os-lab">Interior</span><nav class="os-seg" aria-label="Interior counted as"><a href="#">Installation firm</a><a class="on" href="#">Self-installation</a></nav></div></div>
<div class="os-h"><h2>Portfolio</h2></div>
<table class="os-port"><thead><tr><th class="l">Business</th><th>Profit a day</th><th>Invested</th><th class="l">Break even</th></tr></thead>
<tbody>{"".join(rows)}</tbody></table>
"""


# --------------------------------------------------------------------------
# artboards
# --------------------------------------------------------------------------
WIRE = r"""
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && (a.getAttribute('href') || '#').charAt(0) === '#') e.preventDefault(); });
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
<div class="board os __EXTRA__ {{theme}}" style="width: __W__px; height: __H__px;">
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
<body><div class="board os __EXTRA__ __THEME__" style="width: __W__px; height: __H__px;">
__BODY__
</div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""

W = 1280
E = "expansion"
# file, title, builder, width, height, row, extra root class
BOARDS = [
    ("Main.dc.html", "0 · Expansion › Plan a factory: no factory yet", lambda: page(E, "factory", start()), W, 960, 0, ""),
    ("Links.dc.html", "0b · One menu point, and every way in", links, W, 700, 0, ""),
    ("Recipe.dc.html", "1 · What: the lines, a custom count left short", lambda: page(E, "factory", recipe()), W, 1100, 1, ""),
    ("NoDepot.dc.html", "1b · What: no depot yet, the plan adds one", lambda: page(E, "factory", no_depot()), W, 860, 1, ""),
    ("Location.dc.html", "2 · Where: warehouse buildings with room for the machines", lambda: page(E, "factory", location()), W, 1180, 1, ""),
    ("Investment.dc.html", "3 · Investment: self-installation, and the loan", lambda: page(E, "factory", investment_self()), W, 1360, 2, ""),
    ("InvestmentFirm.dc.html", "3b · Investment: installation firm", lambda: page(E, "factory", investment_firm()), W, 1000, 2, ""),
    ("Checklist.dc.html", "4 · Until production · game linked", lambda: page(E, "factory", checklist(True), "Day 171 · Fri 14:05"), W, 1450, 3, ""),
    ("ChecklistNoLink.dc.html", "4b · Until production · not linked", lambda: page(E, "factory", checklist(False), "Day 171 · Fri 14:05"), W, 1560, 3, ""),
    ("Hire.dc.html", "4c, 4d · The quick buttons' dialogs", hire_dialogs, 1120, 900, 3, "gw-board"),
    ("Running.dc.html", "5 · Running: output against plan", lambda: page(E, "factory", running(), f"Day {TODAY} · Sun 09:40"), W, 900, 4, ""),
    ("RunningBelow.dc.html", "5b · Running: output below plan", lambda: page(E, "factory", running(True), f"Day {TODAY} · Sun 09:40"), W, 1080, 4, ""),
    ("Results.dc.html", "6 · Businesses › Results: the factory in its chain", lambda: page("businesses", "results", results(), f"Day {TODAY} · Sun 09:40"), W, 820, 4, ""),
    ("GrowWhat.dc.html", "A1 · Your factory: what (Where is done, it is yours)", lambda: page(E, "factory", grow_what(), "Day 230 · Mon 10:00"), W, 1240, 5, ""),
    ("GrowInvestment.dc.html", "A3 · Your factory: only the new machines", lambda: page(E, "factory", grow_invest(), "Day 230 · Mon 10:00"), W, 900, 5, ""),
    ("GrowChecklist.dc.html", "A4 · Your factory: only what the change needs", lambda: page(E, "factory", grow_until(), "Day 232 · Wed 11:00"), W, 1000, 5, ""),
    ("GrowRunning.dc.html", "A5 · Your factory: output against the new plan", lambda: page(E, "factory", grow_running(), "Day 244 · Mon 09:00"), W, 900, 5, ""),
]

ROW_TITLES = ["Plan a factory: one view, new or owned", "What to make, and where", "The investment",
              "Until production runs", "Running", "The same steps for a factory you own"]


def css(theme: str) -> str:
    base = BOARD_CSS.replace("@import url('" + FONTS + "');", "")
    base = base.replace("body{margin:0;background:#0d100f}", "body{margin:0;background:" + ("#eef0ea" if theme == "light" else "#0d100f") + "}")
    return base + OS_CSS + GW_CSS + FF_CSS


def layout() -> dict:
    rows: dict[int, list] = {}
    for b in BOARDS:
        rows.setdefault(b[5], []).append(b)
    pos_, y = {}, 0
    for r in sorted(rows):
        x = 0
        for name_, _t, _b, w, h, _r, _e in rows[r]:
            pos_[name_] = (x, y)
            x += w + 80
        y += max(b[4] for b in rows[r]) + 120 + 300
    return pos_


def build(preview: bool = False) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    boards, order, notes = {}, [], {}
    where = layout()
    for name_, title, builder, w, h, _row, extra in BOARDS:
        body = builder()
        props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"}, "$preview": {"width": w, "height": h}}
        page_ = (PAGE.replace("__TITLE__", "Plan a factory: " + title).replace("__FONTS__", FONTS.replace("&", "&amp;"))
                 .replace("__CSS__", css("dark")).replace("__W__", str(w)).replace("__H__", str(h)).replace("__EXTRA__", extra)
                 .replace("__BODY__", body)
                 .replace("__PROPS__", json.dumps(props, separators=(",", ":"), ensure_ascii=False).replace("'", "&#39;"))
                 .replace("__LOGIC__", LOGIC))
        (ROOT / name_).write_text(page_, encoding="utf-8", newline="\n")
        if preview:
            out = HERE / "_preview"
            out.mkdir(exist_ok=True)
            for theme in ("", "light"):
                (out / f"{name_.split('.')[0]}{'-light' if theme else ''}.html").write_text(
                    PREVIEW.replace("__TITLE__", title).replace("__FONTS__", FONTS.replace("&", "&amp;")).replace("__CSS__", css(theme or "dark"))
                    .replace("__THEME__", theme).replace("__EXTRA__", extra).replace("__W__", str(w)).replace("__H__", str(h))
                    .replace("__BODY__", body.replace(MAP_URL, "map.jpg").replace(IC_URL, "ic.jpg")).replace("__WIRE__", WIRE),
                    encoding="utf-8", newline="\n")
        bx, by = where[name_]
        boards[name_] = {"x": bx, "y": by, "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name_)
    for r, text in enumerate(ROW_TITLES):
        first = next(b for b in BOARDS if b[5] == r)
        notes[f"row{r}"] = {"x": 0, "y": where[first[0]][1] - 240, "text": text, "kind": "title1", "maxW": 4 * (W + 80)}
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Plan a factory", "launch": {"view": "canvas"},
             "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards;", f"self {SELF:,} firm {FIRM:,} items {ITEMS_TOTAL:,}; raw {RAW_COST_WK:,.0f}/wk {RAW_WK}; "
          f"workers {WORKERS}; wages {sum(WAGES_WK.values()):,.0f}/wk; export {EXPORT_EACH:.2f} each, {EXPORT_WK:,.0f}/wk; loan {LOAN_INT}+{LOAN_REPAY}/day")


if __name__ == "__main__":
    build("--preview" in sys.argv)
