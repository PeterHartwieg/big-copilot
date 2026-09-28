"""Generates the Expansion > Open a new store canvas: project/*.dc.html and project/canvas.json.

The flow and the game rules are docs/open-a-store-scope.md (branch break-even-core): pick what to
open, pick where, the investment (installation firm or self-installation), a break-even
indication, the checklist until opening, ROI monitoring after it, and the phase 1 surfaces
(Businesses > Results column, the site panel row, the install toggle). Decisions and open
questions are NOTES.md beside this file.

The board's stylesheet comes from mockup/revamp/build_canvas.py so the palette and type never
drift; the shipped sidebar (variant B, PR #169) is redrawn here under os- classes, as is
everything else this canvas adds. Item prices are the game's `Item.defaultMarketPrice` (build of
28 Sep 2026), vendors and their addresses come from web/wiki-data.json, building positions from
web/maps/locations.json. The company, its sites and its numbers are invented.

The city map is an uploaded asset (MAP_URL): web/maps/map-background.svg rendered at 4/3 and
cropped to the mainland region's bounds from locations.json. `--preview` writes plain HTML into
_preview/ (both themes) for screenshots and expects a local copy of that crop as
_preview/map.jpg; do not commit _preview/. Never hand-edit project/: change this and rerun.

Published at https://claude.ai/artifact/BEGQSRsuicrWSpGFsRd4mo.
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
from build_write_canvas import P as GW_P  # noqa: E402
from build_site_canvas import P as SP_P  # noqa: E402

CREATED_AT = "2026-09-28T16:00:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
MAP_URL = "/_blob/e83bf48b5cdb69b000f379427aa27df0"
MAINLAND = (585.706943, 142.56, 1066.346114, 1036.8)  # locations.json regions[mainland].bounds

# --------------------------------------------------------------------------
# icons: path fragments only, wrapped by svg()
# --------------------------------------------------------------------------
P = {**{k: re.sub(r"^<svg[^>]*>|</svg>$", "", v) for k, v in ICON.items()}, **SP_P, **GW_P,
     "search": '<circle cx="11" cy="11" r="6.5"></circle><path d="M20 20l-4.2-4.2"></path>',
     "map": '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"></path><path d="M9 4v14M15 6v14"></path>',
     "wiki": '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"></path><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"></path>',
     "side": '<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><path d="M9 4.5v15"></path>',
     "store": '<path d="M4 10v10h16V10"></path><path d="M3 10l2-6h14l2 6"></path><path d="M3 10c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"></path><path d="M10 20v-5h4v5"></path>',
     "back": '<path d="M19 12H5M11 6l-6 6 6 6"></path>',
     "cart": '<path d="M3 4h2l2.4 11h10.2L20 8H7"></path><circle cx="9" cy="19" r="1.4"></circle><circle cx="17" cy="19" r="1.4"></circle>',
     "megaphone": '<path d="M3 10v4h3l6 4V6L6 10z"></path><path d="M16 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"></path>',
     "factory": '<path d="M3 21V10l6 4V10l6 4V6h6v15z"></path><path d="M7 17h2M12 17h2M17 17h2"></path>',
     "paint": '<rect x="4" y="3" width="14" height="6" rx="1.5"></rect><path d="M18 6h2v5h-8v3"></path><rect x="10.5" y="14" width="3" height="7" rx="1"></rect>',
     "flag": '<path d="M5 21V4"></path><path d="M5 4h11l-2 4 2 4H5"></path>',
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


# --------------------------------------------------------------------------
# the stylesheet: everything this canvas adds is os-
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
# the company: every name invented, the game's own streets and vendors
# --------------------------------------------------------------------------
COMPANY = "Brightwater"
DAY = "Day 142 · Wed 10:12"
LOC = {b["address"]: b for b in json.loads((REPO / "web/maps/locations.json").read_text(encoding="utf-8"))["buildings"]}
TAG = {"Garment District": "GD", "Hell's Kitchen": "HK", "Industry City": "IC", "Lower Manhattan": "LM", "Midtown": "MT",
       "Murray Hill": "MH", "The Hamptons": "HA"}

NEW = {"addr": "18 Second Avenue", "hood": "Midtown", "size": "C1", "m2": 225, "cap": 30, "rent": 402}
FEE = 586 * NEW["m2"]                     # 131,850
DEPOSIT = 60 * NEW["rent"]                # 24,120
DELIVERY = 250
PAINT = 225 * 5 + 55 * 30                 # 2,775: grass floors and 30-price walls to a score of 50 on a C1

# item, price, qty, why-group, reason tag (kind, text), vendor key
ITEMS = [
    ("Stack of Shopping Baskets", 200, 1, "req", ("req", "Required"), "pederson"),
    ("Checkout Counter", 2300, 1, "req", ("req", "Point of sale"), "pederson"),
    ("JayBeeel Loudspeaker (Small)", 80, 1, "dem", ("dem", "Music"), "ika"),
    ("Uniform Locker", 1950, 1, "dem", ("dem", "Uniforms"), "pederson"),
    ("Toilet", 380, 1, "dem", ("dem", "Toilet"), "ika"),
    ("Bathroom Stall", 2100, 1, "dem", ("dem", "Privacy"), "essentials"),
    ("Sink", 220, 1, "dem", ("dem", "Sink"), "ika"),
    ("Checkout Counter", 2300, 1, "cap", ("cap", "2nd till"), "pederson"),
    ("Drinks Shelf", 850, 12, "shelf", ("", "Whisky"), "essentials"),
    ("Wine Shelf", 1570, 8, "shelf", ("", "Bottle of Wine"), "essentials"),
    ("Tobacco Shelf (Large)", 1895, 4, "shelf", ("", "Cigar, Cigarette"), "essentials"),
    ("Drinks Fridge (Large)", 2200, 10, "shelf", ("", "Beer"), "essentials"),
    ("Storage Shelf", 1200, 8, "shelf", ("", "Stock"), "pederson"),
]
ITEMS_TOTAL = sum(p * q for _, p, q, *_ in ITEMS)          # 71,470
ITEM_COUNT = sum(q for _, _, q, *_ in ITEMS)                # 50
VENDORS = {  # web/wiki-data.json: who sells each item, and where
    "essentials": ("A", "Essentials Appliances", "16 Eleventh Street"),
    "pederson": ("B", "AJ Pederson & Son", "13 Fifth Avenue"),
    "ika": ("C", "Ika Bohag", "50 Fourth Street"),
}
FIRM = FEE + ITEMS_TOTAL + DEPOSIT                          # 227,440
SELF = ITEMS_TOTAL + DELIVERY * len(VENDORS) + PAINT + DEPOSIT  # 99,115

# the player's own liquor stores: what the estimate learns from (last 7 finished days)
OWN = [("36 Fifth Avenue", "Garment District", "C1", 7120), ("14 First Avenue", "Hell's Kitchen", "C1", 9860),
       ("8 Sixth Avenue", "Murray Hill", "C1", 6410)]
EXPECT = round(sum(v for *_, v in OWN) / len(OWN))           # 7,797
DAYS_FIRM = -(-FIRM // EXPECT)                              # 30
DAYS_SELF = -(-SELF // EXPECT)                              # 13

HOODS = ["Garment District", "Hell's Kitchen", "Industry City", "Lower Manhattan", "Midtown", "Murray Hill", "The Hamptons"]
HOOD_HEAD = ["Garment", "Hell's K.", "Industry", "Lower Man.", "Midtown", "Murray H.", "Hamptons"]


def hood(name: str) -> str:
    return f'<span class="hood">{TAG[name]}</span>'


def pos(addr: str) -> tuple[float, float]:
    x, y = LOC[addr]["anchor"]
    bx, by, bw, bh = MAINLAND
    return (x - bx) / bw * 100, (y - by) / bh * 100


def pin(addr: str, label: str, cls: str = "", note: str = "") -> str:
    left, top = pos(addr)
    em = f"<em>{esc(note)}</em>" if note else ""
    return (f'<span class="os-pin {cls}" style="left:{left:.2f}%;top:{top:.2f}%"><b>{label}</b><i></i>{em}</span>')


def city(pins: str, zoom: bool = True) -> str:
    z = '<span class="zoom" aria-hidden="true"><span>+</span><span>−</span></span>' if zoom else ""
    return f'<div class="os-map"><img src="{MAP_URL}" alt="Manhattan">{pins}{z}</div>'


# --------------------------------------------------------------------------
# chrome: the sidebar and the controls row
# --------------------------------------------------------------------------
AREAS = [("overview", "Overview", "today"), ("businesses", "Businesses", "company"), ("supply", "Supply", "supply"),
         ("staffing", "Staffing", "people"), ("expansion", "Expansion", "growth")]
VIEWS = {"businesses": [("results", "Results"), ("prices", "Products & prices"), ("standards", "Standards"), ("milestones", "Milestones")],
         "expansion": [("demand", "Demand"), ("finder", "Find a location"), ("open", "Open a store"), ("factory", "Plan a factory")]}


def sidebar(area: str, view: str, day: str = DAY) -> str:
    rows = []
    for key, label, icon in AREAS:
        badge = '<span class="os-n">3</span>' if key == "overview" else ""
        cv = "" if key == area or key == "overview" else svg("chev", "cv")
        rows.append(f'<a class="{"open" if key == area else ""}" href="#">{svg(icon)}<span>{label}</span>{badge}{cv}</a>')
        if key == area and key in VIEWS:
            new = '<span class="os-new">NEW</span>'
            vs = "".join(f'<a class="{"on" if k == view else ""}" href="#">{v}{new if k == "open" else ""}</a>'
                         for k, v in VIEWS[key])
            rows.append(f'<div class="os-views">{vs}</div>')
    return f"""<nav class="os-sd" aria-label="Main">
  <div class="os-sdh"><div class="brand"><span class="wordmark">{COMPANY}</span><span class="dot"></span></div><span class="os-orb" aria-hidden="true"></span></div>
  <div class="os-q">{svg("search")}<span>Search the board</span><kbd>/</kbd></div>
  <div class="os-areas">{"".join(rows)}</div>
  <div class="os-refs"><a href="#">{svg("map")}<span>City map</span></a><a href="#">{svg("wiki")}<span>Wiki</span></a></div>
  <div class="os-sdf"><div class="os-clock"><b>{day}</b><small>YEAR 2</small></div>
    <div class="os-sdrow"><button type="button" class="os-ib" aria-label="More">{svg("more")}</button><button type="button" class="os-ib r" aria-label="Collapse the sidebar">{svg("side")}</button></div></div>
</nav>"""


STEPS = ["What", "Where", "Investment", "Break even", "Until opening", "Open"]
STEP_FILES = ["Main.dc.html", "Location.dc.html", "Investment.dc.html", "BreakEven.dc.html", "Checklist.dc.html", "AfterOpening.dc.html"]


def steps(on: int) -> str:
    out = []
    for i, (s, f) in enumerate(zip(STEPS, STEP_FILES)):
        cls = "on" if i == on else ("done" if i < on else "")
        mark = svg("tick") if i < on else str(i + 1)
        if i:
            out.append('<span class="sep"></span>')
        out.append(f'<a class="{cls}" href="{f}"><i>{mark}</i>{s}</a>')
    return f'<nav class="os-steps" aria-label="Open a store">{"".join(out)}</nav>'


def planpick(label: str = "Liquor Store") -> str:
    return f'<span class="os-planpick">Plan <b>{label}</b>{svg("chev")}</span>'


def ctl_open(on: int, pick: str = "Liquor Store") -> str:
    return f'<div class="os-ctl">{steps(on)}<div class="aside">{planpick(pick)}</div></div>'


def planbar(where: bool = True, inv: str = "firm", be: bool = True, stage: str = "") -> str:
    w = (f'<b>{NEW["addr"]}</b><small>{NEW["hood"]} · {NEW["size"]} · {NEW["m2"]} m² · rent {money(NEW["rent"])}/day</small>' if where
         else '<b class="dim">Not picked yet</b><small>Liquor Store, any neighbourhood</small>')
    if inv == "none":
        i = '<b class="dim">–</b><small>after the location</small>'
    else:
        total, how = (FIRM, "Installation firm") if inv == "firm" else (SELF, "Self-installation")
        i = f'<b class="m">{money(total)}</b><small>{how} · deposit included</small>'
    days = DAYS_FIRM if inv == "firm" else DAYS_SELF
    b = (f'<b class="m">~{days} days</b><small>after opening · at {money(EXPECT)}/day</small>' if be and inv != "none"
         else '<b class="dim">–</b><small>after the investment</small>')
    if stage:
        b = stage
    return (f'<div class="os-pb"><div><span class="os-lab">Open</span><b>Liquor Store</b><small>Demand in Midtown 94</small></div>'
            f'<div><span class="os-lab">Where</span>{w}</div><div><span class="os-lab">Investment</span>{i}</div>'
            f'<div><span class="os-lab">Break even</span>{b}</div></div>')


def page(area: str, view: str, body: str, day: str = DAY) -> str:
    return f'<div class="os-app">{sidebar(area, view, day)}<main class="os-main">{body}</main></div>'


def score_bg(v: int) -> str:
    pct = max(8, min(78, round((v - 40) / 60 * 70 + 8)))
    return f"background:color-mix(in srgb,var(--accent) {pct}%,var(--surface))"


# --------------------------------------------------------------------------
# 1 · what to open
# --------------------------------------------------------------------------
TOP_DEMAND = [("Liquor Store", "Midtown", 94, 1, "3 elsewhere"), ("Bookstore", "Murray Hill", 99, 0, ""),
              ("Florist", "Lower Manhattan", 100, 0, ""), ("Coffee Shop", "Lower Manhattan", 100, 0, "1 elsewhere"),
              ("Jewelry Store", "Hell's Kitchen", 91, 1, ""), ("Gym", "The Hamptons", 100, 0, "")]
TYPES = [("Bookstore", 2), ("Clothing Store", 0), ("Coffee Shop", 1), ("Electronics Store", 0), ("Fast Food Restaurant", 0),
         ("Florist", 0), ("Fruit And Vegetable Store", 0), ("Gift Shop", 0), ("Gym", 0), ("Hairdresser", 0), ("Jewelry Store", 0),
         ("Liquor Store", 3), ("Nightclub", 0), ("Supermarket", 0), ("Cinema", 0)]
OFFICES = ["Law Firm", "Graphic Designer", "Web Development Agency", "Event Planning Agency", "Travel Agency"]


def start() -> str:
    rows = "".join(
        f'<tr><td class="l"><b>{t}</b><span class="sub">{("You run " + mine) if mine else "You run none"}</span></td>'
        f'<td class="l">{hood(h)} <span class="os-dim" style="font-size:12.5px">{h}</span></td>'
        f'<td><span class="sc" style="{score_bg(s)}">{s}</span></td><td>{r}</td>'
        f'<td class="go"><a href="{"Location.dc.html" if i == 0 else "#"}" aria-label="Plan a {t} in {h}">{svg("chev")}</a></td></tr>'
        for i, (t, h, s, r, mine) in enumerate(TOP_DEMAND))
    types = "".join(f'<a class="os-type" href="#">{t}{f"<small>{n}</small>" if n else ""}</a>' for t, n in TYPES)
    offices = "".join(f'<a class="os-type" href="#">{t}</a>' for t in OFFICES)
    plans = f"""
<div class="os-plans">
  <a class="os-plan" href="Checklist.dc.html"><span><b>Liquor Store</b><small>18 Second Avenue · Midtown</small></span>
    <span><span class="os-lab">Until opening</span><span class="os-meter w" style="--w:29%"><i></i></span></span>
    <span class="v">2 of 7</span><span class="v">{money(FIRM)}</span>{svg("chev")}</a>
  <a class="os-plan" href="#"><span><b>Bookstore</b><small>Murray Hill · no location yet</small></span>
    <span><span class="os-lab">Where</span><span class="os-meter" style="--w:17%"><i></i></span></span>
    <span class="v os-dim">–</span><span class="v os-dim">–</span>{svg("chev")}</a>
  <a class="os-plan" href="AfterOpening.dc.html"><span><b>Coffee Shop</b><small>9 Third Street · Lower Manhattan · opened day 121</small></span>
    <span><span class="os-lab">Paying back</span><span class="os-meter" style="--w:64%"><i></i></span></span>
    <span class="v">64%</span><span class="v">$96,840</span>{svg("chev")}</a>
</div>"""
    return f"""{ctl_open(0, "New plan")}
<div class="os-two" style="margin-top:28px">
  <section class="os-card">
    <h3>From demand</h3>
    <table class="os-dl"><thead><tr><th class="l">Type</th><th class="l">Where</th><th>Demand</th><th>Rivals</th><th></th></tr></thead>
    <tbody>{rows}</tbody></table>
    <p style="margin:12px 0 0"><a class="os-link" href="DemandCell.dc.html">Demand grid</a></p>
  </section>
  <section class="os-card">
    <h3>Or pick a type</h3>
    <div class="os-types">{types}</div>
    <div class="os-sub">Offices</div>
    <div class="os-types">{offices}</div>
  </section>
</div>
<div class="os-h"><h2>Your plans</h2><span class="c">3</span></div>
{plans}"""


# --------------------------------------------------------------------------
# 1b · from the Demand grid
# --------------------------------------------------------------------------
GRID = [("Bookstore", "6 products", [83, 100, 67, 83, 83, 99, 83], []),
        ("Coffee Shop", "5 products", [72, 100, 86, 100, 72, 86, 85], [3]),
        ("Florist", "2 products", [62, 79, 62, 100, 84, 84, 84], []),
        ("Hairdresser", "4 products", [75, 75, 100, 70, 70, 70, 76], []),
        ("Nightclub", "5 products", [88, 100, 80, 86, 69, 74, 60], []),
        ("Liquor Store", "5 products · you run 3", [85, 82, 77, 80, 94, 80, 71], [0, 1, 5]),
        ("Fruit And Vegetable Store", "6 products", [94, 86, 86, 85, 62, 67, 76], []),
        ("Fast Food Restaurant", "8 products", [63, 91, 80, 83, 63, 75, 74], []),
        ("Gift Shop", "3 products", [72, 71, 67, 91, 81, 80, 85], []),
        ("Clothing Store", "8 products", [77, 77, 77, 87, 55, 55, 67], []),
        ("Supermarket", "5 products", [67, 75, 72, 72, 64, 60, 69], []),
        ("Jewelry Store", "4 products", [58, 91, 64, 70, 52, 62, 66], [])]


def demand_cell() -> str:
    head = '<span></span>' + "".join(f'<span class="h{" hl" if i == 4 else ""}">{h}</span>' for i, h in enumerate(HOOD_HEAD))
    cells = []
    for t, sub, vals, mine in GRID:
        cells.append(f'<span class="r{" hl" if t == "Liquor Store" else ""}">{t}<small>{sub} · <a href="#">Wiki page ›</a></small></span>')
        for i, v in enumerate(vals):
            cls = "cell" + (" mine" if i in mine else "") + (" picked" if t == "Liquor Store" and i == 4 else "")
            cells.append(f'<span class="{cls}" style="{score_bg(v)}">{v}</span>')
    pop = f"""<div class="os-pop" style="right:calc((100% - 225px) / 7 + 5px);top:300px" role="dialog" aria-label="Liquor Store in Midtown">
  <h4>Liquor Store · Midtown</h4>
  <div class="fx"><div><span class="os-lab">Demand</span><b>94</b></div><div><span class="os-lab">Rivals</span><b>1</b></div><div><span class="os-lab">To rent</span><b>7</b></div></div>
  <div class="acts"><a class="os-cta" href="Location.dc.html">{svg("store")}Open a store here</a><a class="os-btn" href="#">{svg("pin")}Find a location</a></div>
</div>"""
    return f"""<div class="os-ctl"><nav class="os-seg" aria-label="Demand views"><a class="on" href="#">By type</a><a href="#">What I sell</a><a href="#">Not yet</a></nav></div>
<div class="os-grid"><div class="heat">{head}{"".join(cells)}</div>{pop}</div>"""


# --------------------------------------------------------------------------
# 2 · where: the finder, filtered to the type
# --------------------------------------------------------------------------
FINDS = [("18 Second Avenue", "C1", 71, 42, 94, 225, 30, 402), ("35 First Avenue", "C2", 70, 44, 94, 225, 30, 413),
         ("19 First Avenue", "C1", 69, 44, 94, 225, 30, 413), ("37 Fifth Avenue", "C1", 66, 48, 88, 225, 30, 179),
         ("12 Second Avenue", "C2", 64, 72, 82, 225, 30, 337), ("54 Fifth Avenue", "D2", 61, 40, 88, 285, 40, 203),
         ("7 Seventh Street", "C1", 58, 32, 94, 225, 30, 346)]


def location() -> str:
    pins = "".join(pin(a, str(i + 1), "dim") for i, (a, *_) in enumerate(FINDS) if i) + pin(FINDS[0][0], "1")
    rows = []
    for i, (a, lay, sc, tr, dem, m2, cap, rent) in enumerate(FINDS):
        h = LOC[a]["hood"]
        rows.append(f'<tr class="{"pick" if i == 0 else ""}"><td class="l os-mono" style="white-space:nowrap">{i + 1} {hood(h)}</td>'
                    f'<td class="l"><b>{a}</b><small>{lay} · best fit: Liquor Store</small></td>'
                    f'<td><span class="sc" style="{score_bg(sc + 25)}">{sc}</span></td><td>{tr}</td><td>{dem}</td><td>{m2}</td><td>{cap}</td><td>{money(rent * 61)}</td></tr>')
        if i == 0:
            rows.append(f"""<tr class="more"><td></td><td colspan="7"><div class="os-pick"><div class="fx">
<span>Rent<b>{money(rent)}/day</b></span><span>Deposit<b>{money(DEPOSIT)}</b></span><span>Capacity<b>{cap}/h</b></span></div>
<a class="os-cta sm" href="Investment.dc.html">Plan here{svg("right")}</a></div></td></tr>""")
    hoods = "".join(f'<span class="os-ch{" on" if t in ("MT", "MH", "HK") else ""}">{t}</span>' for t in ("GD", "HK", "IC", "LM", "MT", "MH", "HA"))
    return f"""{ctl_open(1)}
{planbar(where=False, inv="none", be=False)}
<div class="os-finder">
  {city(pins)}
  <div class="os-fp">
    <div class="os-fr"><span>Type</span><div class="row"><span class="os-ch on set">Liquor Store</span><span class="os-dim" style="font-size:12px">from the plan</span></div></div>
    <div class="os-fr"><span>Show</span><div class="row"><span class="os-ch on">To rent 23</span><span class="os-ch">To take over 6</span><span class="os-ch">For sale 11</span></div></div>
    <div class="os-fr"><span>Where</span><div class="row">{hoods}</div></div>
    <div class="os-fr"><span>Size</span><div class="row"><span class="os-ch">min 200 m²</span><span class="os-ch">max –</span></div></div>
    <table class="os-ft"><thead><tr><th class="l">#</th><th class="l">Address</th><th>Score</th><th>Traffic</th><th>Demand</th><th>m²</th><th>Cap</th><th>Upfront</th></tr></thead>
    <tbody>{"".join(rows)}</tbody></table>
  </div>
</div>"""


# --------------------------------------------------------------------------
# 3 · investment: installation firm, self-installation
# --------------------------------------------------------------------------
GROUPS = [("req", "Required to open", "the Wiki's “To open” list"),
          ("dem", "Customer demands", "Midtown: each asked by 90% × its weight"),
          ("cap", "Building capacity", "2 tills for 30 customers an hour"),
          ("shelf", "Shelves and fridges", "as at 36 Fifth Avenue, same layout C1")]


def tag(kind: str, text: str) -> str:
    return f'<span class="os-tag {kind}">{esc(text)}</span>'


def toggle(mode: str) -> str:
    f = "on" if mode == "firm" else ""
    s = "on" if mode == "self" else ""
    return (f'<nav class="os-seg big" aria-label="Interior"><a class="{f}" href="Investment.dc.html">Installation firm <b>{money(FIRM)}</b></a>'
            f'<a class="{s}" href="InvestmentSelf.dc.html">Self-installation <b>{money(SELF)}</b></a></nav>')


def toolbar(mode: str) -> str:
    return (f'<div class="os-toolbar">{toggle(mode)}<div class="aside"><span>100% outfitted</span><b>{ITEM_COUNT} items</b>'
            f'<span>Items</span><b>{money(ITEMS_TOTAL)}</b></div></div>')


def investment() -> str:
    body = []
    body.append(f'<tr class="grp"><td colspan="5">Installation firm<b>{money(FEE)}</b></td></tr>')
    body.append(f'<tr><td class="l">Installation fee<span class="sub">586 × {NEW["m2"]} m²</span></td><td class="w"></td><td></td><td></td><td>{money(FEE)}</td></tr>')
    body.append('<tr><td class="l">Walls and floors<span class="sub">Midtown asks for an interior score of 50: met</span></td>'
                f'<td class="w">{tag("dem", "Interior")}</td><td></td><td></td><td class="free">free</td></tr>')
    for key, title, note in GROUPS:
        its = [it for it in ITEMS if it[3] == key]
        sub = sum(p * q for _, p, q, *_ in its)
        body.append(f'<tr class="grp"><td colspan="5">{title}<span>{note}</span><b>{money(sub)}</b></td></tr>')
        for n, p, q, _, (k, why), _v in its:
            body.append(f'<tr><td class="l">{n}</td><td class="w">{tag(k, why)}</td><td>{q}</td><td>{money(p)}</td><td>{money(p * q)}</td></tr>')
    body.append(f'<tr class="grp"><td colspan="5">Deposit<span>refunded when the lease ends</span><b>{money(DEPOSIT)}</b></td></tr>')
    body.append(f'<tr><td class="l">60 days of rent<span class="sub">60 × {money(NEW["rent"])}</span></td><td class="w"></td><td></td><td></td><td>{money(DEPOSIT)}</td></tr>')
    return f"""{ctl_open(2)}
{planbar(inv="firm")}
{toolbar("firm")}
<table class="os-inv"><thead><tr><th class="l">Item</th><th class="l">Why</th><th>Qty</th><th>Each</th><th>Total</th></tr></thead>
<tbody>{"".join(body)}</tbody>
<tfoot><tr><td class="l">Investment</td><td></td><td></td><td></td><td>{money(FIRM)}</td></tr></tfoot></table>"""


def investment_self() -> str:
    cards = []
    for key, (letter, name, addr) in VENDORS.items():
        its = [it for it in ITEMS if it[5] == key]
        sub = sum(p * q for _, p, q, *_ in its) + DELIVERY
        rows = "".join(f'<tr><td class="l">{q} × {n}</td><td class="w">{tag(k, why)}</td><td>{money(p * q)}</td></tr>'
                       for n, p, q, _, (k, why), _v in its)
        h = LOC[addr]["hood"]
        cards.append(f"""<div class="os-store"><div class="os-sh"><span class="k">{letter}</span><span><b>{name}</b><small>{addr} · {h}</small></span><span class="t">{money(sub)}</span></div>
<table><tbody>{rows}<tr class="del"><td class="l">Delivery</td><td class="w"></td><td>{money(DELIVERY)}</td></tr></tbody></table></div>""")
    paint = f"""<div class="os-store"><div class="os-sh"><span class="k p">{svg("paint", "os-ico")}</span><span><b>Walls and floors</b><small>Interior Designer · Midtown asks for a score of 50</small></span><span class="t">{money(PAINT)}</span></div>
<table><tbody><tr><td class="l">225 floor tiles, the $5 floor</td><td class="w">{tag("dem", "Interior")}</td><td>{money(225 * 5)}</td></tr>
<tr><td class="l">55 wall slots, the $30 walls</td><td class="w">{tag("dem", "Interior")}</td><td>{money(55 * 30)}</td></tr></tbody></table></div>"""
    dep = f"""<div class="os-store"><div class="os-sh"><span class="k p">{svg("key", "os-ico")}</span><span><b>Deposit</b><small>60 × {money(NEW["rent"])} rent · refunded when the lease ends</small></span><span class="t">{money(DEPOSIT)}</span></div></div>"""
    pins = "".join(pin(a, l, "store") for l, _, a in VENDORS.values()) + pin(NEW["addr"], "NEW", "new", NEW["addr"])
    legend = "".join(f'<div><i>{l}</i><span>{n}</span><b>{money(sum(p * q for _, p, q, *_r, v in ITEMS if v == k) + DELIVERY)}</b></div>'
                     for k, (l, n, _a) in VENDORS.items())
    legend += f'<div><i class="n">NEW</i><span>{NEW["addr"]}</span><b></b></div>'
    return f"""{ctl_open(2)}
{planbar(inv="self")}
{toolbar("self")}
<div class="os-self">
  <div>{"".join(cards)}{paint}{dep}
    <div class="os-total"><span>Investment</span><small>{ITEM_COUNT} items · {len(VENDORS)} deliveries · walls and floors · deposit</small><b>{money(SELF)}</b></div></div>
  <div>{city(pins, zoom=False)}<div class="os-maplist">{legend}</div></div>
</div>"""


# --------------------------------------------------------------------------
# 4 · break even
# --------------------------------------------------------------------------
def be_chart(w: int = 560, h: int = 262) -> str:
    x0, y0, x1, y1 = 52, 16, w - 16, h - 40
    dmax, vmax = 40, 320_000
    X = lambda d: x0 + (x1 - x0) * d / dmax  # noqa: E731
    Y = lambda v: y1 - (y1 - y0) * v / vmax  # noqa: E731
    g = []
    for v in range(0, vmax + 1, 80_000):
        g.append(f'<line class="grid" x1="{x0}" x2="{x1}" y1="{Y(v):.1f}" y2="{Y(v):.1f}"></line>'
                 f'<text x="{x0 - 8}" y="{Y(v) + 3.5:.1f}" text-anchor="end">{"$0" if v == 0 else f"${v // 1000}k"}</text>')
    for d in range(0, dmax + 1, 10):
        g.append(f'<text x="{X(d):.1f}" y="{y1 + 18}" text-anchor="middle">{d}</text>')
    line = f'M{X(0):.1f},{Y(0):.1f} L{X(dmax):.1f},{Y(EXPECT * dmax):.1f}'
    area = line + f' L{X(dmax):.1f},{Y(0):.1f} Z'
    df, ds = FIRM / EXPECT, SELF / EXPECT
    return f"""<svg class="os-chart" viewBox="0 0 {w} {h}" role="img" aria-label="Profit so far against the investment">
{"".join(g)}
<line class="ax" x1="{x0}" x2="{x1}" y1="{y1}" y2="{y1}"></line>
<path class="area" d="{area}"></path>
<line class="inv" x1="{x0}" x2="{x1}" y1="{Y(FIRM):.1f}" y2="{Y(FIRM):.1f}"></line>
<line class="inv2" x1="{x0}" x2="{x1}" y1="{Y(SELF):.1f}" y2="{Y(SELF):.1f}"></line>
<text class="lbl w" x="{x0 + 6}" y="{Y(FIRM) - 7:.1f}">Installation firm {money(FIRM)}</text>
<text class="lbl i" x="{x0 + 6}" y="{Y(SELF) - 7:.1f}">Self-installation {money(SELF)}</text>
<path class="line" d="{line}"></path>
<circle class="hit" cx="{X(df):.1f}" cy="{Y(FIRM):.1f}" r="5"></circle>
<circle class="hit" cx="{X(ds):.1f}" cy="{Y(SELF):.1f}" r="5"></circle>
<text class="lbl" x="{X(df) + 9:.1f}" y="{Y(FIRM) + 16:.1f}">day {DAYS_FIRM}</text>
<text class="lbl" x="{X(ds) + 9:.1f}" y="{Y(SELF) + 16:.1f}">day {DAYS_SELF}</text>
<text x="{x1}" y="{y1 + 34}" text-anchor="end">days after opening</text>
</svg>"""


def break_even() -> str:
    mx = max(v for *_, v in OWN)
    sites = "".join(f'<div class="os-site"><span><b>{a}</b><small>{hood(h)} {lay}</small></span>'
                    f'<span class="bar"><i style="width:{v / mx * 100:.0f}%"></i></span><span class="v">{money(v)}</span></div>'
                    for a, h, lay, v in OWN)
    return f"""{ctl_open(3)}
{planbar(inv="firm")}
<div class="os-be">
  <section class="os-card">
    <div class="os-big"><div><span class="os-lab">Installation firm</span><b>{DAYS_FIRM}<small>days</small></b></div>
      <div class="alt"><span class="os-lab">Self-installation</span><b>{DAYS_SELF}<small>days</small></b></div></div>
    {be_chart()}
  </section>
  <section class="os-card">
    <h3>Expected profit a day</h3>
    <div class="os-sites">{sites}
      <div class="os-site avg"><span><b>Your liquor stores</b><small>average, last 7 days</small></span><span></span><span class="v">{money(EXPECT)}</span></div></div>
  </section>
</div>
<div class="os-state"><b>NO LIQUOR STORE YET</b><span>The same plan for a company that runs none.</span></div>
<div class="os-none">
  <div><span class="os-lab">Installation firm</span><b>{money(FIRM)}</b><small>investment</small></div>
  <div><span class="os-lab">Self-installation</span><b>{money(SELF)}</b><small>investment</small></div>
  <div><span class="os-lab">Break even</span><b class="dim">No estimate</b><small>none of your sites is a liquor store</small></div>
</div>"""


# --------------------------------------------------------------------------
# 5 · until opening: the checklist
# --------------------------------------------------------------------------
def ck(state: str, icon: str, title: str, sub: str, act: str, p: int = 0) -> str:
    st = svg("tick") if state == "done" else ""
    style = f' style="--p:{p}%"' if state == "part" else ""
    return (f'<div class="os-ck {state}"{style}><span class="st">{st}</span><span class="ic">{svg(icon)}</span>'
            f'<span class="tx"><b>{title}</b><small>{sub}</small></span><span class="act">{act}</span></div>')


def ingame(text: str) -> str:
    return f'<span class="os-ingame">{svg("game")}<span>{text}</span></span>'


def checklist(linked: bool = True) -> str:
    when = lambda d: f'<span class="when">{d}</span>'  # noqa: E731
    if linked:
        staff = f'<a class="os-cta sm" href="#">{svg("hire")}Hire 11</a>'
        uni = f'<a class="os-cta sm" href="#">{svg("shirt")}Assign uniforms</a>'
        mkt = f'<a class="os-cta sm" href="#">{svg("megaphone")}Set up marketing</a>'
    else:
        staff = ingame("<b>MyEmployees</b> on your phone: hire 8 Customer Service and 3 Cleaning from your headhunters' candidates, at 18 Second Avenue.")
        uni = ingame("<b>BizMan › 18 Second Avenue › Uniforms</b>: set one for Customer Service and one for Cleaning.")
        mkt = ingame("<b>BizMan › Marketing</b>: start a campaign for 18 Second Avenue.")
    rows = "".join([
        ck("done", "key", "Lease", "18 Second Avenue rented, deposit paid", when("day 144")),
        ck("done", "shelves", "Furniture", f"All {ITEM_COUNT} items placed by the installation firm · required 3 of 3", when("day 145")),
        ck("", "people", "Staff for the opening hours",
           "0 of 11 people · Customer Service 8, Cleaning 3 · open 24/7 · <span class=\"ok\">38 and 12 candidates</span>", staff),
        ck("", "shirt", "Uniforms", "None set for Customer Service or Cleaning", uni),
        ck("part", "heart", "Customer demands", "5 of 6 met · <span class=\"w\">Uniforms</span> · interior score 62 of 50", "", 83),
        ck("", "megaphone", "Marketing", "No campaign for 18 Second Avenue", mkt),
        ck("", "truck", "Logistics", "Beer, Bottle of Wine, Cigar, Cigarette, Whisky: nothing delivers here yet",
           f'<a class="os-btn" href="#">{svg("factory")}Plan a factory{svg("chev")}</a>'),
    ])
    live = ('<span class="os-live"><i></i>Game linked</span>' if linked
            else '<span class="os-live off"><i></i>Save file · game not linked</span>')
    gate = "" if linked else (f'<div class="os-gate">{svg("plug", "os-ico")}<span><b>Link the game</b> and these become buttons.</span>'
                              f'<a class="os-btn" href="#">How to link</a></div>')
    return f"""{ctl_open(4)}
{planbar(inv="firm")}
<div class="os-prog"><h2>Until opening</h2><span class="m" style="--w:29%"><i></i></span><span class="c">2 of 7</span>
  <div class="aside">{live}<span>from the save · day 146, 10:12</span></div></div>
<div class="os-cks">{rows}</div>
{gate}"""


# --------------------------------------------------------------------------
# 6 · after opening: ROI on the attached store
# --------------------------------------------------------------------------
OPENED, TODAY_ROI = 147, 168
DAILY = [2350, 4180, 5620, 6400, 7050, 7610, 8020, 8360, 8110, 8540, 8790, 8420, 8680, 8950, 9120, 8870, 9040, 8760, 9210, 9060, 8930]
SO_FAR = sum(DAILY)
RECENT = round(sum(DAILY[-7:]) / 7)
LEFT = FIRM - SO_FAR
FC_DAYS = len(DAILY) + -(-LEFT // RECENT)


def roi_chart(w: int = 900, h: int = 282) -> str:
    x0, y0, x1, y1 = 60, 18, w - 18, h - 42
    dmax, vmax = 40, 320_000
    X = lambda d: x0 + (x1 - x0) * d / dmax  # noqa: E731
    Y = lambda v: y1 - (y1 - y0) * v / vmax  # noqa: E731
    g = []
    for v in range(0, vmax + 1, 80_000):
        g.append(f'<line class="grid" x1="{x0}" x2="{x1}" y1="{Y(v):.1f}" y2="{Y(v):.1f}"></line>'
                 f'<text x="{x0 - 8}" y="{Y(v) + 3.5:.1f}" text-anchor="end">{"$0" if v == 0 else f"${v // 1000}k"}</text>')
    for d in range(0, dmax + 1, 5):
        g.append(f'<text x="{X(d):.1f}" y="{y1 + 18}" text-anchor="middle">{d}</text>')
    pts, run = [f"{X(0):.1f},{Y(0):.1f}"], 0
    for i, p in enumerate(DAILY):
        run += p
        pts.append(f"{X(i + 1):.1f},{Y(run):.1f}")
    bars = "".join(f'<rect class="os-dbar" x="{X(i + .6):.1f}" y="{Y(p * 6):.1f}" width="{(x1 - x0) / dmax * .8:.1f}" height="{Y(0) - Y(p * 6):.1f}"></rect>'
                   for i, p in enumerate(DAILY))
    fc = f'M{X(len(DAILY)):.1f},{Y(SO_FAR):.1f} L{X(FC_DAYS):.1f},{Y(FIRM):.1f}'
    plan = f'M{X(0):.1f},{Y(0):.1f} L{X(dmax):.1f},{Y(EXPECT * dmax):.1f}'
    return f"""<svg class="os-chart" viewBox="0 0 {w} {h}" role="img" aria-label="Profit so far against the plan">
{"".join(g)}{bars}
<line class="ax" x1="{x0}" x2="{x1}" y1="{y1}" y2="{y1}"></line>
<line class="inv" x1="{x0}" x2="{x1}" y1="{Y(FIRM):.1f}" y2="{Y(FIRM):.1f}"></line>
<text class="lbl w" x="{x0 + 6}" y="{Y(FIRM) - 7:.1f}">Invested {money(FIRM)}</text>
<path class="plan" d="{plan}"></path>
<text class="lbl i" x="{X(36):.1f}" y="{Y(EXPECT * 36) - 10:.1f}" text-anchor="end">plan {money(EXPECT)}/day</text>
<polyline class="line" points="{" ".join(pts)}"></polyline>
<path class="plan" style="stroke:var(--accent);opacity:.7" d="{fc}"></path>
<line class="today" x1="{X(len(DAILY)):.1f}" x2="{X(len(DAILY)):.1f}" y1="{y0}" y2="{y1}"></line>
<text class="lbl" x="{X(len(DAILY)) + 6:.1f}" y="{y0 + 10}">today, day {len(DAILY)}</text>
<circle class="hit" cx="{X(FC_DAYS):.1f}" cy="{Y(FIRM):.1f}" r="5"></circle>
<text class="lbl" x="{X(FC_DAYS) + 9:.1f}" y="{Y(FIRM) + 16:.1f}">day {FC_DAYS}</text>
<text x="{x1}" y="{y1 + 34}" text-anchor="end">days after opening</text>
</svg>"""


def after_opening() -> str:
    paid = SO_FAR / FIRM * 100
    stage = f'<b class="m">day {OPENED + FC_DAYS}</b><small>{FC_DAYS} days after opening · plan {DAYS_FIRM}</small>'
    return f"""{ctl_open(5)}
{planbar(inv="firm", stage=stage)}
<div class="os-roi">
  <div class="kpi"><span class="lab">Invested</span><span class="v">{money(FIRM)}</span><span class="sub">as planned</span></div>
  <div class="kpi"><span class="lab">Profit so far</span><span class="v pos">{money(SO_FAR)}</span><span class="sub">{len(DAILY)} days · <small>since day {OPENED}</small></span></div>
  <div class="kpi"><span class="lab">Paid back</span><span class="v">{paid:.0f}%</span><span class="os-meter" style="--w:{paid:.0f}%"><i></i></span></div>
  <div class="kpi"><span class="lab">Break even</span><span class="v">{FC_DAYS - len(DAILY)} <small class="os-dim" style="font-size:13px">days to go</small></span><span class="sub">about day {OPENED + FC_DAYS}</span></div>
</div>
<section class="os-card" style="margin-top:18px">{roi_chart()}</section>
<div class="os-h"><h2>Plan and now</h2></div>
<table class="os-pvsa"><thead><tr><th class="l"></th><th>Plan</th><th>Now</th><th>Difference</th></tr></thead><tbody>
<tr><td class="l">Investment</td><td>{money(FIRM)}</td><td>{money(FIRM)}</td><td>–</td></tr>
<tr><td class="l">Profit a day<span class="sub">last 7 days</span></td><td>{money(EXPECT)}</td><td>{money(RECENT)}</td><td class="d">{money(RECENT - EXPECT, True)}</td></tr>
<tr><td class="l">Break even</td><td>{DAYS_FIRM} days after opening</td><td>{FC_DAYS} days after opening</td><td class="d">{FC_DAYS - DAYS_FIRM} day{"s" if abs(FC_DAYS - DAYS_FIRM) != 1 else ""}</td></tr>
</tbody></table>
<div class="os-state"><b>PAID BACK</b><span>The same plan once profit so far passes the investment.</span></div>
<div class="os-done"><span class="ic">{svg("tick")}</span><span><b>Break even on day {OPENED + FC_DAYS}, {FC_DAYS} days after opening</b><br>Plan {DAYS_FIRM} days. The site page keeps the row; the plan is done.</span>
<a class="os-btn" href="SitePanel.dc.html">Site page{svg("chev")}</a></div>"""


# --------------------------------------------------------------------------
# 7 · phase 1: Results, the site page, the row's states
# --------------------------------------------------------------------------
def be_cell(kind: str, big: str, small: str = "", meter: int | None = None) -> str:
    m = f'<span class="os-meter" style="--w:{meter}%"><i></i></span>' if meter is not None else ""
    s = f"<small>{small}</small>" if small else ""
    return f'<td class="be"><b class="{kind}">{big}</b>{s}{m}</td>'


PORT = [
    ("chain", "Brightwater Spirits", "3 shops, 1 warehouse", 1_046_200, 702_100, 695_520, be_cell("ok", "Day 118", "57 days after the first opening")),
    ("kid", "36 Fifth Avenue", "Garment District · opened day 61", 352_800, 213_600, 200_770, be_cell("ok", "Day 92", "31 days after opening")),
    ("kid", "14 First Avenue", "Hell's Kitchen · opened day 88", 431_900, 295_800, 211_290, be_cell("ok", "Day 113", "25 days after opening")),
    ("kid", "8 Sixth Avenue", "Murray Hill · opened day 118", 261_500, 192_300, 199_690, be_cell("w", "10 days to go", "about day 152 · 70% paid back", 70)),
    ("kid", "Brightwater Depot", "4 Tenth Street · warehouse", 0, 400, 83_770, be_cell("dim", "With the chain", "a warehouse books no sales")),
    ("chain", "Brightwater Books", "2 shops", 318_400, 96_900, 238_560, be_cell("w", "18 days to go", "about day 160 · 76% paid back", 76)),
    ("kid", "3 Sixth Street", "Midtown · opened day 30", 287_100, 109_500, 131_430, be_cell("ok", "By day 97 at the latest", "opened before the save's 60 days")),
    ("kid", "17 Fifth Street", "Murray Hill · opened day 125", 31_300, -12_600, 107_130, be_cell("bad", "Not paying back", "at −$420 a day")),
    ("chain", "Brightwater Wear", "1 shop", 402_700, 141_300, 214_050, be_cell("dim", "Unknown", "opened day 12, before the save's 60 days")),
]


def results() -> str:
    rows = []
    for kind, name, sub, rev, prof, inv, be in PORT:
        margin = f"{prof / rev * 100:.1f}%" if rev else "–"
        chev = f'<span class="chev">{svg("chev")}</span>' if kind == "chain" else ""
        pc = "pos" if prof > 0 else "neg"
        rows.append(f'<tr class="{kind}{" open" if kind == "chain" and name != "Brightwater Wear" else ""}">'
                    f'<td class="l">{chev}<b>{name}</b><span class="sub">{sub}</span></td>'
                    f'<td>{money(rev) if rev else "–"}</td><td class="{pc}">{money(prof)}</td><td>{margin}</td><td>{money(inv)}</td>{be}</tr>')
    return f"""<div class="os-ctl"><nav class="os-seg" aria-label="Period"><a class="on" href="#">30 days</a><a href="#">All</a><a href="#">By weekday</a></nav>
  <div class="aside"><span class="os-lab">Interior</span><nav class="os-seg" aria-label="Interior counted as"><a class="on" href="#">Installation firm</a><a href="#">Self-installation</a></nav></div></div>
<div class="os-h"><h2>Portfolio</h2><span class="why"><i>?</i></span></div>
<table class="os-port"><thead><tr><th class="l">Business</th><th>Revenue</th><th>Profit</th><th>Margin</th><th>Invested</th><th class="l">Break even</th></tr></thead>
<tbody>{"".join(rows)}</tbody></table>
"""


def row(mk: str, icon: str, text: str, amt: str, lit: bool = False) -> str:
    return (f'<div class="os-row{" lit" if lit else ""}"><span class="mk {mk}"></span>{svg(icon)}<span class="t">{text}</span>'
            f'<span class="a">{amt}</span><span class="go">{svg("chev")}</span></div>')


def site_panel() -> str:
    kpis = """<div class="os-kpis">
  <div class="kpi"><span class="lab">Revenue yesterday</span><span class="v">$11,940</span><span class="row"><span class="chip ok">+4%</span></span></div>
  <div class="kpi"><span class="lab">Customers</span><span class="v">412</span><span class="sub">$28.98/visit</span></div>
  <div class="kpi"><span class="lab">Profit</span><span class="v pos">$7,120</span><span class="sub">59.6% margin</span></div>
  <div class="kpi"><span class="lab">Building capacity</span><span class="v">30<small class="os-dim" style="font-size:13px"> /h</small></span><span class="sub">2 tills</span></div>
</div>"""
    rows = (row("", "hours", "Has 38 staffed hours a week more than its customers need", '$1,140<small>/day wages</small>')
            + row("ok", "flag", "Break even on day 92, 31 days after opening", '$200,770<small>invested</small>', lit=True))
    return f"""<div class="os-ctl"><nav class="os-seg" aria-label="Period"><a class="on" href="#">30 days</a><a href="#">All</a><a href="#">By weekday</a></nav></div>
<div class="os-shead"><a class="crumb" href="Results.dc.html">{svg("back")}Portfolio</a><span class="ch">Brightwater Spirits ›</span></div>
<div class="os-stitle"><span class="bullet">GD</span><div><h1>Brightwater Spirits</h1>
  <p>Liquor Store · 36 Fifth Avenue · Garment District · opened day 61</p></div>
  <div class="aside"><a class="os-btn" href="#">{svg("hours")}Schedule</a><a class="os-btn" href="#">{svg("truck")}Deliveries</a><a class="os-btn" href="#">{svg("tag")}Prices</a></div></div>
<div class="os-rows">{rows}</div>
{kpis}"""


def site_states() -> str:
    def blk(label: str, r: str) -> str:
        return f'<div class="st">{label}</div><div class="os-rows">{r}</div>'
    return f"""<div class="os-states">
<div><h1>The site page's break-even row</h1><p class="lead">One row under the site's name, in the list its findings use. Green once reached.</p></div>
{blk("REACHED, EXACT", row("ok", "flag", "Break even on day 92, 31 days after opening", "$200,770<small>invested</small>"))}
{blk("REACHED, FIRST DAYS OUTSIDE THE SAVE", row("ok", "flag", "Break even by day 97 at the latest <small>opened day 30, before the save's 60 days</small>", "$131,430<small>invested</small>"))}
{blk("NOT YET", row("info", "flag", "Break even in 10 days, about day 152", '70% paid back<span class="os-meter" style="--w:70%"><i></i></span>'))}
{blk("LOSING MONEY", row("neg", "flag", "Not paying back at the current profit", '<span class="neg">−$420</span><small>/day profit</small>'))}
{blk("UNKNOWN", row("dim", "flag", "Break even not known <small>opened day 12, before the save's 60 days</small>", "$214,050<small>invested</small>"))}
</div>"""


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
<div class="board os {{theme}}" style="width: __W__px; height: __H__px;">
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
<body><div class="board os __THEME__" style="width: __W__px; height: __H__px;">
__BODY__
</div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""

W = 1280
# file, title, builder, width, height, row
BOARDS = [
    ("Main.dc.html", "1 · What to open", lambda: page("expansion", "open", start()), W, 900, 0),
    ("DemandCell.dc.html", "1b · From the Demand grid", lambda: page("expansion", "demand", demand_cell()), W, 760, 0),
    ("Location.dc.html", "2 · Where: Find a location, filtered", lambda: page("expansion", "open", location()), W, 940, 0),
    ("Investment.dc.html", "3 · Investment: installation firm", lambda: page("expansion", "open", investment()), W, 1310, 1),
    ("InvestmentSelf.dc.html", "3b · Investment: self-installation", lambda: page("expansion", "open", investment_self()), W, 1420, 1),
    ("BreakEven.dc.html", "4 · Break even", lambda: page("expansion", "open", break_even()), W, 780, 1),
    ("Checklist.dc.html", "5 · Until opening · game linked", lambda: page("expansion", "open", checklist(True), "Day 146 · Sat 10:12"), W, 800, 2),
    ("ChecklistNoLink.dc.html", "5b · Until opening · not linked", lambda: page("expansion", "open", checklist(False), "Day 146 · Sat 10:12"), W, 900, 2),
    ("AfterOpening.dc.html", "6 · After opening: paying back", lambda: page("expansion", "open", after_opening(), f"Day {TODAY_ROI} · Sun 09:40"), W, 1090, 2),
    ("Results.dc.html", "7 · Businesses › Results: break-even column and the interior toggle", lambda: page("businesses", "results", results()), W, 820, 3),
    ("SitePanel.dc.html", "7b · Site page: the break-even row", lambda: page("businesses", "results", site_panel()), W, 720, 3),
    ("SiteStates.dc.html", "7c · The row's states", site_states, 900, 640, 3),
]

ROW_TITLES = ["Open a store: what and where", "The investment and its break even", "Until opening, and after", "Phase 1: break-even core"]


def css(theme: str) -> str:
    base = BOARD_CSS.replace("@import url('" + FONTS + "');", "")
    base = base.replace("body{margin:0;background:#0d100f}", "body{margin:0;background:" + ("#eef0ea" if theme == "light" else "#0d100f") + "}")
    return base + OS_CSS


def layout() -> dict:
    """Rows of artboards, 80 px apart, 120 px plus a title between rows."""
    rows: dict[int, list] = {}
    for b in BOARDS:
        rows.setdefault(b[5], []).append(b)
    pos, y = {}, 0
    for r in sorted(rows):
        x = 0
        for name_, _t, _b, w, h, _r in rows[r]:
            pos[name_] = (x, y)
            x += w + 80
        y += max(b[4] for b in rows[r]) + 120 + 300
    return pos


def build(preview: bool = False) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    boards, order, notes = {}, [], {}
    pos = layout()
    for name_, title, builder, w, h, _row in BOARDS:
        body = builder()
        props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"}, "$preview": {"width": w, "height": h}}
        page_ = (PAGE.replace("__TITLE__", "Open a store: " + title).replace("__FONTS__", FONTS.replace("&", "&amp;"))
                 .replace("__CSS__", css("dark")).replace("__W__", str(w)).replace("__H__", str(h))
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
                    .replace("__THEME__", theme).replace("__W__", str(w)).replace("__H__", str(h))
                    .replace("__BODY__", body.replace(MAP_URL, "map.jpg")).replace("__WIRE__", WIRE),
                    encoding="utf-8", newline="\n")
        bx, by = pos[name_]
        boards[name_] = {"x": bx, "y": by, "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name_)
    for r, text in enumerate(ROW_TITLES):
        first = next(b for b in BOARDS if b[5] == r)
        notes[f"row{r}"] = {"x": 0, "y": pos[first[0]][1] - 240, "text": text, "kind": "title1", "maxW": 3 * (W + 80)}
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Open a new store", "launch": {"view": "canvas"},
             "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards;", f"firm {FIRM:,} self {SELF:,} items {ITEMS_TOTAL:,} ({ITEM_COUNT}) expect {EXPECT:,} "
          f"days {DAYS_FIRM}/{DAYS_SELF}; roi so far {SO_FAR:,} recent {RECENT:,} forecast {FC_DAYS}")


if __name__ == "__main__":
    build("--preview" in sys.argv)
