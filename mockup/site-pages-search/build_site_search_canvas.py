"""Generates the "Site pages and search" canvas: project/*.dc.html and project/canvas.json.

The brief is the UX audit of 24 Sep 2026 (research/ux-audit-2026-09-24/ux-audit.md), R9, R10
and R11: every site gets a page with an address, the board gets one search field, and Today
gets a quiet row of questions.

The stylesheet is the live board's own: the <style> block of ba_dashboard.py's TEMPLATE with
web/map.css and web/wiki.css spliced in, exactly as render() does, so an artboard looks like
the board on the day it is built. Only the theme switch is rewritten (the board keys it on
<html>, an artboard on its own root) and the phone media rules are copied under .phone so a
390 px artboard is laid out as a phone whatever width the canvas draws it at. Everything new
carries the ss- prefix.

The canvas is published at https://claude.ai/artifact/WB6N6i3xaFJ2A1bUnBEvL3.

The numbers are modelled on a real save and typed in here; nothing reads a save at build
time. Never hand-edit project/: change this and rerun.

    python build_site_search_canvas.py                 # writes project/
    python build_site_search_canvas.py --out DIR       # writes DIR/project/ instead
    python build_site_search_canvas.py --preview DIR   # also plain HTML copies, both themes
"""
from __future__ import annotations

import html
import json
import math
import random
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
REPO = HERE.parent.parent
sys.path.insert(0, str(HERE.parent / "site-panel"))
from build_site_canvas import P, profit_chart, week_bars  # noqa: E402

CREATED_AT = "2026-09-24T16:00:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"

# --------------------------------------------------------------------------
# the live stylesheet
# --------------------------------------------------------------------------
LIGHT = ('--ground:#eef0ea;--surface:#fdfdfb;--raised:#f3f4ef;--ink:#15181a;--ink-2:#5b6469;--ink-3:#8b9499;'
         '--rule:#d2d6cd;--rule-soft:#e0e3da;--accent:#00703a;--accent-soft:#00703a1f;--on-accent:#ffffff;'
         '--pos:#00703a;--neg:#cc2a20;--warn:#c25400;--info:#2a5ea8;--tip-bg:#15181a;--tip-ink:#f3f4ef;--shadow:0 1px 2px #15181a0f')
DARK = ('--ground:#0d100f;--surface:#151917;--raised:#1c211e;--ink:#e9ece6;--ink-2:#9aa39d;--ink-3:#6b756f;'
        '--rule:#262c28;--rule-soft:#1e2320;--accent:#43c07a;--accent-soft:#43c07a26;--on-accent:#08130d;'
        '--pos:#43c07a;--neg:#ff6257;--warn:#f0913a;--info:#6ea8ff;--tip-bg:#e9ece6;--tip-ink:#0d100f;--shadow:0 1px 2px #00000059')


def _block(text: str, start: int) -> int:
    """The index just past the brace block that opens at or after `start`."""
    depth, k = 0, text.index("{", start)
    while True:
        c = text[k]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return k + 1
        k += 1


def _split_selectors(sel: str) -> list[str]:
    out, depth, cur = [], 0, ""
    for c in sel:
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        if c == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += c
    out.append(cur)
    return [s.strip() for s in out if s.strip()]


def _scope_rules(body: str, scope: str) -> str:
    """Every rule in `body` with `scope` put in front of each of its selectors."""
    out, k = [], 0
    while True:
        j = body.find("{", k)
        if j < 0:
            break
        sel = body[k:j].strip()
        end = _block(body, j)
        decls = body[j + 1:end - 1]
        if sel.startswith("@"):
            k = end
            continue
        sels = []
        for s in _split_selectors(sel):
            s = re.sub(r"^(:root|html|body)\b", "", s).strip()
            sels.append(f"{scope} {s}".strip())
        out.append(",".join(sels) + "{" + decls + "}")
        k = end
    return "\n".join(out)


def live_css() -> str:
    """ba_dashboard.py's stylesheet, with map.css and wiki.css where render() puts them."""
    src = (REPO / "ba_dashboard.py").read_text(encoding="utf-8")
    t = src.index('TEMPLATE = r"""')
    a = src.index("<style>", t) + len("<style>")
    b = src.index("</style>", a)
    css = src[a:b]
    css = css.replace("/*__MAP_CSS__*/", (REPO / "web" / "map.css").read_text(encoding="utf-8"))
    css = css.replace("/*__WIKI_CSS__*/", (REPO / "web" / "wiki.css").read_text(encoding="utf-8"))
    return css


def themed(css: str) -> str:
    """The theme follows the artboard's own root, not <html> and not the system."""
    css = css.replace(':root:not([data-theme="dark"])', ".board.light")
    css = css.replace(':root[data-theme="light"]', ".board.light")
    # phone rules, copied under .phone so a phone artboard is a phone at any drawn width
    phone = []
    for m in re.finditer(r"@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)\s*\{", css):
        if int(m.group(1)) >= 390:
            end = _block(css, m.start())
            inner = css[css.index("{", m.start()) + 1:end - 1]
            phone.append(_scope_rules(inner, ".board.phone"))
    return (css + "\n/* ---- canvas: the phone rules again, under .phone ---- */\n" + "\n".join(phone)
            + "\n/* ---- canvas: an artboard is its own page ---- */\n"
            + f".board{{{DARK};color-scheme:dark;background:var(--ground);color:var(--ink);font-family:Archivo,\"Helvetica Neue\",Arial,sans-serif;"
              "font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased;position:relative;overflow:hidden;box-sizing:border-box}\n"
            + f".board.light{{{LIGHT};color-scheme:light}}\n"
            + ".board section{content-visibility:visible}\n.board .rv{opacity:1;transform:none}\n"
            + ".board.desk .wrap{width:calc(100% - 72px)}\n.board.phone .wrap{width:calc(100% - 32px)}\n")


# --------------------------------------------------------------------------
# everything this canvas adds, all under ss-
# --------------------------------------------------------------------------
SS_CSS = r"""
body{margin:0}
.board svg:where([aria-hidden]){stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ss-i{display:inline-grid;place-items:center;flex:none}
.ss-i svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}

/* the address this artboard sits at: a caption on the canvas, not browser chrome */
.ss-addr{display:flex;align-items:center;gap:10px;height:34px;padding:0 36px;border-bottom:1px dashed var(--rule);background:var(--raised);font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.ss-addr small{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;border:1px solid var(--rule);border-radius:3px;padding:3px 5px}
.ss-addr b{color:var(--accent);font-weight:500}
.board.phone .ss-addr{padding:0 16px;font-size:11px}

/* R10 the field in the masthead ------------------------------------------------ */
.mast .ss-q{margin-left:auto;display:flex;align-items:center;gap:9px;width:236px;height:38px;padding:0 7px 0 12px;box-sizing:border-box;border:1px solid var(--rule);border-radius:9px;background:var(--surface);color:var(--ink-3);font:inherit;font-size:13px;text-align:left;cursor:text;transition:border-color .15s,color .15s,box-shadow .2s;position:relative;z-index:7}
.mast .ss-q .ss-ql{flex:1;white-space:nowrap}
.mast .ss-q:hover{border-color:var(--ink-3);color:var(--ink-2)}
.mast .ss-q:hover .ss-lens{animation:ss-peek .6s ease-in-out}
.mast .ss-q.on{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);color:var(--ink)}
@keyframes ss-peek{30%{transform:translate(-2px,-1px) rotate(-12deg)}70%{transform:translate(2px,1px) rotate(8deg)}}
.mast .ss-q + .clock{margin-left:0}
.ss-kbd{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border:1px solid var(--rule);border-bottom-width:2px;border-radius:5px;background:var(--raised);font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2);flex:none}
.ss-qbtn{margin-left:auto;width:36px;height:36px;border-radius:9px}
.board.phone .mast .ss-q{display:none}
.board.desk .mast .ss-qbtn{display:none}

/* R10 the palette ---------------------------------------------------------------- */
.ss-scrim{position:absolute;inset:0;z-index:20;background:color-mix(in srgb,var(--ground) 55%,transparent);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.ss-pal{position:absolute;z-index:21;top:136px;left:50%;transform:translateX(-50%);width:700px;border-radius:14px;border:1px solid var(--rule);background:var(--surface);box-shadow:0 30px 90px #0000006b;overflow:hidden;animation:ss-drop .35s cubic-bezier(.2,.9,.3,1.2)}
@keyframes ss-drop{from{opacity:0;transform:translate(-50%,-10px) scale(.98)}}
.ss-in{display:flex;align-items:center;gap:12px;height:60px;padding:0 16px 0 18px;border-bottom:1px solid var(--rule)}
.ss-in .ss-lens{color:var(--accent)}
.ss-in .ss-lens svg{width:19px;height:19px}
.ss-in input{flex:1;min-width:0;border:0;outline:none;background:none;color:var(--ink);font:500 17px/1 Archivo,sans-serif;caret-color:var(--accent)}
.ss-in input::placeholder{color:var(--ink-3);font-weight:400}
.ss-count{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.ss-res{max-height:720px;overflow:auto;padding:6px 0 8px;scrollbar-width:thin;scrollbar-color:var(--rule) transparent}
.ss-grp{padding:4px 0}
.ss-gh{display:flex;align-items:center;gap:8px;padding:10px 20px 6px;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.ss-gh em{font-style:normal;margin-left:auto;letter-spacing:.04em;text-transform:none}
.ss-row{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:0 13px;align-items:center;min-height:48px;padding:5px 16px 5px 18px;box-sizing:border-box;text-decoration:none;color:inherit;cursor:pointer;position:relative}
.ss-row:hover{background:color-mix(in srgb,var(--raised) 60%,transparent);color:inherit}
.ss-row.on{background:var(--raised)}
.ss-row .ic{width:30px;height:30px;border-radius:8px;background:var(--raised);display:grid;place-items:center;color:var(--ink-2);transition:transform .3s cubic-bezier(.34,1.56,.64,1),color .2s,background .2s}
.ss-row .ic svg{width:15px;height:15px}
.ss-row .ic.hood{font:600 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.06em;border:1px solid var(--rule);width:30px;height:24px;min-width:0;border-radius:5px}
.ss-row.on .ic{color:var(--accent);background:var(--surface);transform:rotate(-8deg) scale(1.06)}
.ss-row.on .ic.hood{transform:none;color:var(--ink)}
.ss-row .t{display:block;font-size:14px;font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ss-row .p{display:block;margin-top:2px;font:400 11.5px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ss-row mark{background:var(--accent-soft);color:var(--accent);border-radius:3px;padding:0 1px;margin:0 -1px}
.ss-side{display:flex;align-items:center;gap:8px}
.ss-side .map-shortcut{margin:0}
.ss-go{display:none;align-items:center;gap:6px;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.ss-row.on .ss-go{display:inline-flex}
.ss-row.on .ss-tag{display:none}
.ss-tag{font:500 10.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.ss-dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:5px;vertical-align:1px}
.ss-dot.watch{background:var(--warn)}.ss-dot.crit{background:var(--neg)}.ss-dot.opp{background:var(--accent)}.ss-dot.off{background:none;box-shadow:inset 0 0 0 1.5px var(--ink-3)}
.ss-syn{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:2px 6px;border:1px dashed var(--rule);border-radius:4px;font:500 10px/1.3 "IBM Plex Mono",monospace;color:var(--ink-2);vertical-align:1px}
.ss-syn b{color:var(--accent);font-weight:500}
.ss-more{display:block;padding:6px 20px 8px 61px;font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);text-decoration:none}
.ss-more:hover{color:var(--ink)}
.ss-foot{display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px;padding:11px 18px;border-top:1px solid var(--rule);font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.ss-foot span{display:inline-flex;align-items:center;gap:6px}
.ss-foot .ss-say{margin-left:auto;color:var(--ink-2);max-width:330px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.ss-foot .ss-say b{color:var(--accent);font-weight:500}

/* the palette's empty state: the questions, then where you have been */
.ss-q2 .ic{border-radius:50%;background:var(--accent-soft);color:var(--accent);font:600 13px/1 "IBM Plex Mono",monospace}
.ss-q2 .t{font-weight:500}
.ss-q2:hover .ic,.ss-q2.on .ic{animation:ss-hop .5s cubic-bezier(.34,1.56,.64,1)}
@keyframes ss-hop{40%{transform:translateY(-4px) rotate(-10deg)}}
.ss-hint{padding:10px 20px 4px;font-size:12.5px;color:var(--ink-3)}
.ss-hint b{color:var(--ink-2);font-weight:500}

/* nothing found: the sphere looks for it, then shrugs */
.ss-none{display:grid;justify-items:center;gap:10px;padding:34px 30px 22px;text-align:center}
.ss-none p{margin:0;font-size:14px;color:var(--ink-2);max-width:460px}
.ss-none p b{color:var(--ink);font-weight:600}
.ss-ball{position:relative;width:46px;height:46px;animation:ss-look 2.8s ease-in-out infinite}
.ss-ball i{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 30%,#d9ffe8 0%,#7fe3a8 14%,var(--accent) 38%,#146b3c 78%,#0b3d23 100%);box-shadow:inset -7px -10px 16px #00000066}
.ss-ball::after{content:"?";position:absolute;right:-16px;top:-12px;font:600 16px/1 "IBM Plex Mono",monospace;color:var(--ink-3);animation:ss-q 2.8s ease-in-out infinite}
@keyframes ss-look{0%,100%{transform:translateX(-26px) rotate(-40deg)}45%,55%{transform:translateX(26px) rotate(40deg)}}
@keyframes ss-q{0%,40%{opacity:0}55%,90%{opacity:1}}
.ss-sugg{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:6px}
.ss-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border:1px solid var(--rule);border-radius:999px;background:var(--surface);font-size:12.5px;color:var(--ink-2);text-decoration:none;transition:border-color .15s,color .15s,transform .2s}
.ss-chip:hover{border-color:var(--accent);color:var(--ink);transform:translateY(-2px)}
.ss-chip mark{background:none;color:var(--accent)}

/* R10 on a phone: the palette is the whole screen ------------------------------------ */
.ss-sheet{position:absolute;inset:0;z-index:21;background:var(--ground);display:flex;flex-direction:column}
.ss-sheet .ss-in{height:64px;padding:0 12px 0 8px;gap:8px}
.ss-sheet .ss-in input{font-size:17px}
.ss-sheet .ss-res{max-height:none;flex:1;padding-bottom:20px}
.ss-sheet .ss-row{min-height:56px;padding:6px 14px 6px 16px;gap:0 12px}
.ss-sheet .ss-gh{padding:14px 16px 6px}
.ss-sheet .ss-more{padding-left:58px}
.ss-cancel{border:0;background:none;color:var(--accent);font:500 14px/1 Archivo,sans-serif;padding:12px 6px;cursor:pointer}
.ss-back{width:40px;height:40px;border:0;background:none;color:var(--ink-2);display:grid;place-items:center;border-radius:8px}
.ss-back svg{width:20px;height:20px}

/* R9 a site's page: a crumb back to the portfolio, the picker beside it ---------------- */
.ss-crumbs{display:flex;align-items:center;flex-wrap:wrap;gap:10px 14px;margin-top:28px}
.ss-crumb{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 13px 0 9px;box-sizing:border-box;border:1px solid var(--rule);border-radius:8px;background:var(--surface);font-size:12.5px;font-weight:500;color:var(--ink-2);text-decoration:none;transition:color .15s,border-color .15s}
.ss-crumb .ss-i{transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.ss-crumb:hover{color:var(--ink);border-color:var(--ink-3)}
.ss-crumb:hover .ss-i{transform:translateX(-3px)}
.ss-crumb.from{border-color:color-mix(in srgb,var(--accent) 55%,var(--rule));color:var(--ink)}
.ss-crumb.from .ss-i{color:var(--accent)}
.ss-trail{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-3)}
.ss-trail a{color:var(--ink-2);text-decoration:none;border-bottom:1px solid var(--rule)}
.ss-trail a:hover{color:var(--ink);border-color:var(--ink-3)}
.ss-trail i{font-style:normal;opacity:.6}
.ss-crumbs .seg{margin-left:auto}
#sitePanel .sitehead{margin-top:22px}
.ss-pick{display:flex;align-items:center;gap:6px;margin-left:auto}
.ss-pick .ibtn{width:34px;height:34px}
.board.phone .ss-crumbs{position:sticky;top:64px;z-index:4;background:var(--ground);margin:0 -16px;padding:10px 16px;border-bottom:1px solid var(--rule-soft);gap:8px;flex-wrap:nowrap}
.board.phone .ss-crumbs .ss-crumb{padding:0 11px 0 7px}
.board.phone .ss-pick{flex:1;min-width:0}
.board.phone .ss-pick select.sitepick{flex:1;min-width:0;max-width:none;height:34px;border-radius:8px;padding:0 10px}

/* R9 a site's name, wherever it appears, is a way to its page ------------------------------ */
.ss-sl{color:inherit;text-decoration:none;border-bottom:1px solid transparent;transition:border-color .15s,color .15s}
.ss-sl:hover,.ss-sl.hov{color:var(--ink);border-bottom-color:var(--ink-3)}
.find .site .ss-sl{min-width:0;overflow:hidden;text-overflow:ellipsis}
.ss-tipdemo{position:absolute;z-index:9;background:var(--tip-bg);color:var(--tip-ink);padding:7px 10px;border-radius:5px;font:400 12px/1.4 Archivo,sans-serif;white-space:nowrap;pointer-events:none}
.ss-tipdemo b{font:500 11px/1 "IBM Plex Mono",monospace}

/* the links board: each snippet in its own frame with a caption ------------------------------ */
.ss-snips{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:34px 40px;margin-top:34px}
.ss-snip{position:relative}
.ss-snip.wide{grid-column:1/-1}
.ss-cap{display:flex;align-items:center;gap:10px;margin:0 0 12px;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.ss-cap b{color:var(--ink);font-weight:500}
.ss-cap::after{content:"";flex:1;border-top:1px solid var(--rule-soft)}
.ss-lead{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.ss-lead + p{margin:6px 0 0;color:var(--ink-2);max-width:760px}
.ss-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:30px;align-items:center;position:relative}
.ss-node{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--rule);border-radius:7px;background:var(--surface);font-size:12.5px;position:relative;z-index:1}
.ss-node small{display:block;font:400 10.5px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3)}
.ss-node.on{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.ss-node .hood{min-width:22px;height:18px}
.ss-wire{position:absolute;inset:0;width:100%;height:100%;z-index:0;overflow:visible}
.ss-detail{margin-top:18px;padding-top:14px;border-top:1px solid var(--rule-soft)}
.ss-detail h3{margin:0;font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px}
.ss-pagego{display:inline-flex;align-items:center;gap:5px;margin-left:auto;font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-2);text-decoration:none;padding:6px 9px;border:1px solid var(--rule);border-radius:6px;transition:color .15s,border-color .15s}
.ss-pagego:hover,.ss-pagego.hov{color:var(--accent);border-color:var(--accent)}
.ss-pagego .ss-i svg{width:13px;height:13px}
.ss-card{position:relative;width:300px;border-radius:10px;border:1px solid var(--rule);background:var(--surface);box-shadow:0 12px 40px #0005;padding:14px 16px}
.ss-card h3{margin:0;font-size:16px;font-weight:600}
.ss-card .sub{margin-top:4px;font-size:12px;color:var(--ink-2)}
.ss-card .nums{display:flex;gap:18px;margin-top:12px}
.ss-card .num b{display:block;font:500 17px/1.2 "IBM Plex Mono",monospace}
.ss-card .num span{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.ss-card .ss-pagego{position:absolute;right:12px;bottom:12px}
.ss-places{border:1px solid var(--rule);border-radius:10px;background:var(--surface);overflow:hidden}
.ss-places .place{cursor:default}
.ss-places .place .nm small{max-height:16px;opacity:1;margin-top:1px}
.ss-places .ss-pagego{padding:5px 7px}

/* R11 Ask the board: one quiet row under Next moves ------------------------------------------------ */
.ss-ask{position:relative;display:flex;align-items:center;flex-wrap:wrap;gap:10px 22px;margin-top:26px;padding:14px 0 16px;border-top:1px solid var(--rule-soft)}
.ss-asklead{flex:none;white-space:nowrap;display:inline-flex;align-items:center;gap:8px;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.ss-asklead i{width:9px;height:9px;border-radius:50%;background:var(--accent);display:inline-block;animation:ss-idle 3.2s ease-in-out infinite}
@keyframes ss-idle{0%,80%,100%{transform:none}85%{transform:translateY(-5px)}90%{transform:none}94%{transform:translateY(-2px)}}
.ss-aq{position:relative;font-size:13.5px;color:var(--ink-2);text-decoration:none;padding:4px 0;border-bottom:1px solid var(--rule);transition:color .15s,border-color .15s}
.ss-aq:hover,.ss-aq.hov{color:var(--ink);border-bottom-color:var(--accent)}
.ss-aq::after{content:"\2192";display:inline-block;margin-left:5px;opacity:0;transform:translateX(-4px);transition:opacity .15s,transform .2s;color:var(--accent)}
.ss-aq:hover::after,.ss-aq.hov::after{opacity:1;transform:none}
.ss-aq.hov::before{content:"";position:absolute;left:50%;top:-13px;width:9px;height:9px;margin-left:-4px;border-radius:50%;background:var(--accent);animation:ss-idle 3.2s ease-in-out infinite}
.ss-ask:hover .ss-aq.hov::before{display:none}
.ss-roll{position:absolute;left:0;top:4px;width:9px;height:9px;border-radius:50%;background:var(--accent);opacity:0;pointer-events:none;transition:transform .45s cubic-bezier(.34,1.4,.64,1),opacity .2s}
.ss-ask:hover .ss-roll{opacity:1}
.ss-askkey{margin-left:auto;display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-3)}
.board.phone .ss-ask{flex-wrap:nowrap;overflow-x:auto;margin:22px -16px 0;padding:14px 16px 16px;gap:10px;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 88%,transparent)}
.board.phone .ss-ask .ss-aq{flex:none;white-space:nowrap;border:1px solid var(--rule);border-radius:999px;padding:8px 13px;background:var(--surface)}
.board.phone .ss-askkey{display:none}
.ss-askmini{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 8px 0 11px;border:1px solid var(--rule);border-radius:7px;background:var(--surface);font:500 12.5px/1 Archivo,sans-serif;color:var(--ink-2);text-decoration:none;transition:color .15s,border-color .15s}
.ss-askmini i{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.ss-askmini:hover{color:var(--ink);border-color:var(--ink-3)}

/* R11 where a question lands: the question stays in view, the answer is lit ----------------------------- */
.ss-asked{display:flex;align-items:center;flex-wrap:wrap;gap:10px 14px;margin-top:22px;padding:12px 14px 12px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--accent) 45%,var(--rule));background:color-mix(in srgb,var(--accent-soft) 60%,var(--surface))}
.ss-asked .ic{width:28px;height:28px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;font:600 14px/1 "IBM Plex Mono",monospace}
.ss-asked b{font-size:14.5px;font-weight:600}
.ss-asked small{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3);letter-spacing:.04em}
.ss-asked .go{margin-left:auto;display:flex;gap:14px;align-items:center}
.ss-asked .go a{font-size:12.5px;color:var(--ink-2);text-decoration:none;border-bottom:1px solid var(--rule)}
.ss-asked .go a:hover{color:var(--ink)}
.ss-lit{position:relative;outline:1px solid var(--accent);outline-offset:12px;border-radius:6px}
.ss-lit::before{content:"the answer";position:absolute;top:-24px;right:-8px;padding:3px 7px;border-radius:4px;background:var(--accent);color:var(--on-accent);font:600 9.5px/1 "IBM Plex Mono",monospace;letter-spacing:.1em;text-transform:uppercase}
.ss-dim{opacity:.32}
.ss-lit .rules span{animation:ss-glint 2.4s ease-in-out infinite;animation-delay:calc(var(--k)*90ms)}
@keyframes ss-glint{0%,70%,100%{box-shadow:none}80%{box-shadow:0 0 0 3px var(--accent-soft)}}

/* phone: the board's own phone rules are not all written yet; these are the ones this canvas assumes */
.board.phone .kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:22px}
.board.phone .kpi{padding:14px 14px 12px}
.board.phone .kpi .v{font-size:21px}
.board.phone .kpi .row{flex-wrap:wrap;gap:6px}
.board.phone .find{grid-template-columns:18px minmax(0,1fr) auto 20px;gap:2px 10px;padding:12px 0}
.board.phone .find .site{grid-column:2/4;grid-row:1}
.board.phone .find .what{grid-column:2/3;grid-row:2;font-size:13.5px}
.board.phone .find .amt{grid-column:3;grid-row:2}
.board.phone .find .mark{grid-row:1/3}
.board.phone .find .go{grid-column:4;grid-row:1/3}
.board.phone .moves{grid-template-columns:1fr;gap:12px}
.board.phone .move{padding:16px}
.board.phone .sstats{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.board.phone .duo{grid-template-columns:1fr!important;gap:0}
.board.phone .duo > section{margin-top:40px}
.board.phone .sitehead{flex-wrap:wrap;gap:12px}
.board.phone .sitehead h2{font-size:20px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 0}
.board.phone .sp-rank{margin-left:10px}
.board.phone .sp-std{gap:18px}
.board.phone .sp-lamps{margin-left:0}
.board.phone .chartbox.ss-scroll{overflow-x:auto}
.board.phone .chartbox.ss-scroll > .hours{min-width:620px}
.board.phone .sp-lines{min-width:760px}
.board.phone .sp-find{grid-template-columns:18px 24px minmax(0,1fr) auto 18px;gap:0 8px}
.board.phone .sp-ba{gap:18px 26px}
.board.phone .sp-typed{margin-left:0}
.board.phone .sp-steps .sp-nowplan{margin-left:0!important}
.board.phone .sp-rrow{grid-template-columns:1fr auto;gap:4px 12px}
.board.phone .sp-rrow .sp-dots{grid-column:1/-1;grid-row:2}
.board.phone table{font-size:12.5px}
.board.phone #sp-shelves table{min-width:640px}
.board.phone #sp-shelves td.l{white-space:nowrap}
.board.phone .sp-daytabs a{padding:6px 8px}
.board.phone .sp-rrow .sp-rcount{grid-column:2;grid-row:1}
.board.phone .find .site{grid-column:2/3}
.board.phone .find .more{grid-column:2/4;grid-row:3}
.board .sp-eqb .t b,.board .sp-promo i{transform:none}
@media (prefers-reduced-motion:reduce){.board *{animation:none!important;transition:none!important}}
"""

# --------------------------------------------------------------------------
# icons (stroke, 24 grid): the site panel's set plus what this canvas needs
# --------------------------------------------------------------------------
ICONS = dict(P)
ICONS.update({
    "search": '<circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path>',
    "map": '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"></path><circle cx="12" cy="10" r="2"></circle>',
    "company": '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"></path><path d="M14 10h5a1 1 0 0 1 1 1v10M4 21h17M8 8h2M8 12h2M8 16h2M17 14h1M17 18h1"></path>',
    "wiki": '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"></path><path d="M4 20.5V5.5M20 18v3H6.5"></path><path d="M9 8h7M9 11.5h5"></path>',
    "back": '<path d="M15 6l-6 6 6 6"></path>',
    "enter": '<path d="M20 5v6a3 3 0 0 1-3 3H5"></path><path d="M9 10l-4 4 4 4"></path>',
    "tune": '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"></path><circle cx="16" cy="7" r="2"></circle><circle cx="10" cy="17" r="2"></circle>',
    "go": '<path d="M5 12h14M13 6l6 6-6 6"></path>',
    "page": '<rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h5"></path>',
    "cal": '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4M8 14h3M13 14h3M8 18h3"></path>',
    "people": '<circle cx="9" cy="8" r="3.500"></circle><path d="M2.500 20a6.500 6.500 0 0 1 13 0"></path><circle cx="17" cy="9" r="2.500"></circle><path d="M15.500 14.500a5 5 0 0 1 6 5"></path>',
    "flag": '<path d="M5 21V4M5 4h11l-2 4 2 4H5"></path>',
    "recent": '<path d="M3 12a9 9 0 1 0 3-6.700"></path><path d="M3 4v5h5"></path><path d="M12 8v4l3 2"></path>',
    "dice": '<rect x="4" y="4" width="16" height="16" rx="3"></rect><circle cx="9" cy="9" r="1"></circle><circle cx="15" cy="15" r="1"></circle><circle cx="15" cy="9" r="1"></circle><circle cx="9" cy="15" r="1"></circle>',
    "cart": '<path d="M3 4h2l2.500 11h10.500l2-8H6.500"></path><circle cx="9" cy="19" r="1.500"></circle><circle cx="17" cy="19" r="1.500"></circle>',
    "cash": '<rect x="3" y="6" width="18" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.500"></circle><path d="M6 9v.01M18 15v.01"></path>',
    "warehouse": '<path d="M3 21V9l9-5 9 5v12"></path><path d="M7 21v-8h10v8M7 17h10"></path>',
    "factory": '<path d="M3 21V11l5 3V11l5 3V7l8 4v10z"></path><path d="M7 18h2M12 18h2M17 18h2"></path>',
    "office": '<rect x="5" y="3" width="14" height="18" rx="1.500"></rect><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M11 21v-3h2v3"></path>',
    "gym": '<path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"></path>',
    "shop": '<path d="M4 9l1.500-5h13L20 9M4 9h16v11H4zM4 9a2.700 2.700 0 0 0 5.300 0 2.700 2.700 0 0 0 5.400 0 2.700 2.700 0 0 0 5.300 0"></path><path d="M10 20v-5h4v5"></path>',
    "gem": '<path d="M6 4h12l3 5-9 11L3 9z"></path><path d="M3 9h18M9 4l3 16M15 4l-3 16"></path>',
    "hq": '<path d="M4 21V8l8-5 8 5v13"></path><path d="M9 21v-6h6v6M8 10h2M14 10h2"></path>',
    "kinds": '<circle cx="6" cy="7" r="1.500"></circle><circle cx="6" cy="12" r="1.500"></circle><circle cx="6" cy="17" r="1.500"></circle><path d="M10 7h9M10 12h9M10 17h6"></path>',
})


def svg(name: str, hidden: bool = True) -> str:
    return f'<svg viewBox="0 0 24 24"{" aria-hidden=\"true\"" if hidden else ""}>{ICONS[name]}</svg>'


def ic(name: str) -> str:
    return f'<span class="ss-i">{svg(name)}</span>'


def spi(name: str) -> str:
    return f'<span class="sp-i">{svg(name)}</span>'


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def mapbtn(name: str) -> str:
    return (f'<button type="button" class="map-shortcut" aria-label="Show {esc(name)} on the map" title="Show on map">'
            f'{svg("map")}</button>')


def slug(address: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", address.lower()).strip("-")


def sitelink(name: str, address: str, cls: str = "") -> str:
    """A site's name, anywhere on the board: its own page, one click away."""
    return f'<a class="ss-sl {cls}" href="#site/{slug(address)}" data-tip="Open its page">{esc(name)}</a>'


# --------------------------------------------------------------------------
# the company, modelled on a real save (day 73, 26 sites) and typed in by hand
# --------------------------------------------------------------------------
# code, name, type, status, address, neighbourhood, profit yesterday
SITES = [
    ("LM", "HART. Clothing", "Clothing Store", "retail", "57 Fifth Avenue", "Lower Manhattan", 171194),
    ("MT", "HART. Clothing", "Clothing Store", "retail", "20 Second Avenue", "Midtown", 170330),
    ("MH", "HART. Clothing", "Clothing Store", "retail", "12 Sixth Avenue", "Murray Hill", 163728),
    ("MT", "HART. Jewelry", "Jewelry Store", "retail", "30 Second Avenue", "Midtown", 150177),
    ("HK", "HART. Clothing", "Clothing Store", "retail", "12 Second Avenue", "Hell's Kitchen", 132038),
    ("HA", "HART. Jewelry", "Jewelry Store", "retail", "2 Ocean Crest Road", "The Hamptons", 119197),
    ("HA", "HART. Clothing", "Clothing Store", "retail", "4 Ocean Crest Road", "The Hamptons", 119185),
    ("IC", "HART. Clothing", "Clothing Store", "retail", "3 Ninth Avenue", "Industry City", 118564),
    ("HK", "HART. &Partners", "Law Firm", "office", "10 Second Avenue", "Hell's Kitchen", 116672),
    ("LM", "HART. Jewelry", "Jewelry Store", "retail", "51 Fourth Avenue", "Lower Manhattan", 92451),
    ("IC", "HART. Jewelry", "Jewelry Store", "retail", "2 Tenth Avenue", "Industry City", 90705),
    ("HK", "HART. Jewelry", "Jewelry Store", "retail", "3 Second Avenue", "Hell's Kitchen", 70456),
    ("GD", "HART. Clothing", "Clothing Store", "retail", "18 Fifth Avenue", "Garment District", 69402),
    ("GD", "HART. Jewelry", "Jewelry Store", "retail", "30 Fifth Avenue", "Garment District", 63661),
    ("MH", "HART. Jewelry", "Jewelry Store", "retail", "37 Fifth Avenue", "Murray Hill", 60013),
    ("MH", "HART. Fittness", "Gym", "retail", "46 Fifth Avenue", "Murray Hill", 9861),
    ("GD", "HART. Fitness", "Gym", "retail", "24 Fifth Avenue", "Garment District", 9271),
    ("HK", "HART. Fitness", "Gym", "retail", "2 Second Avenue", "Hell's Kitchen", 8141),
    ("HK", "HART. Event", "Event Planning Agency", "office", "13 Third Avenue", "Hell's Kitchen", 5864),
    ("GD", "Clothing Distr.", "Warehouse", "depot", "51 Second Street", "Garment District", -524),
    ("GD", "Jewelry Distrib.", "Warehouse", "depot", "49 Second Street", "Garment District", -590),
    ("GD", "Import Hub", "Warehouse", "depot", "3 Fifth Avenue", "Garment District", -1267),
    ("MH", "HART. Group HQ", "Headquarters", "depot", "17 Seventh Street", "Murray Hill", -27159),
    ("IC", "Factory Electronics", "Factory", "factory", "11 22nd Street", "Industry City", -65942),
    ("IC", "Factory Clothing", "Factory", "factory", "6 24th Street", "Industry City", -145743),
    ("IC", "Factory Jewelry", "Factory", "factory", "8 22nd Street", "Industry City", -209805),
]
SITE_ICON = {"Clothing Store": "shop", "Jewelry Store": "gem", "Gym": "gym", "Law Firm": "office", "Event Planning Agency": "office",
             "Warehouse": "warehouse", "Headquarters": "hq", "Factory": "factory"}
# a name shared by several sites is told apart by its neighbourhood, as the picker does
_names = [s[1] for s in SITES]


def short(site: tuple) -> str:
    return f"{site[1]} · {site[5]}" if _names.count(site[1]) > 1 else site[1]


def site_of(name: str, hood: str = "") -> tuple:
    return next(s for s in SITES if s[1] == name and (not hood or s[5] == hood))


# --------------------------------------------------------------------------
# the search index: one list, matched the same way in Python (for the drawn
# states) and in the live artboard's script
# --------------------------------------------------------------------------
GROUP_BIAS = {"sites": 10, "wiki": -15}
GROUPS = [("views", "Pages & views"), ("sites", "Sites"), ("products", "Products"), ("kinds", "Finding kinds"),
          ("finder", "Find a location"), ("wiki", "Wiki")]


def entry(g, t, p, icon, syn=(), kw=(), tag="", dot="", hood="", mapname="", land=""):
    return {"g": g, "t": t, "p": p, "ic": icon, "syn": list(syn), "kw": list(kw), "tag": tag, "dot": dot,
            "hood": hood, "map": mapname, "land": land or ("Company › Products · " + t if g == "products" else p)}


VIEWS = [
    entry("views", "Needs attention", "Today", "today", ["problems", "alerts", "warnings", "findings", "to do"], tag="14 today"),
    entry("views", "Next moves", "Today", "today", ["tools", "what next"]),
    entry("views", "Cash on hand", "Today · $1.89M owed on loans", "cash", ["debt", "loans", "money", "owe", "bank", "cash"], land="Today › Cash on hand, debt shown"),
    entry("views", "Daily result", "Company › Results", "profit", ["profit", "revenue", "chart", "income", "why did profit move"]),
    entry("views", "Portfolio", "Company › Results · profit and loss by chain", "company", ["sites", "chains", "margin", "break even", "payback", "losing money"]),
    entry("views", "Portfolio · Operations", "Company › Results · satisfaction, promotion, traffic", "company", ["satisfaction", "promotion", "foot traffic", "marketing", "security"]),
    entry("views", "Weekly rhythm", "Company › Results", "week", ["weekday", "busiest day", "peak day"]),
    entry("views", "Products", "Company › Products · 39 sold", "shelves", ["sales", "units", "total sales", "best sellers", "what sells"]),
    entry("views", "Payroll", "Company › Payroll · 529 people", "people", ["wages", "salary", "salaries", "employees", "headcount", "staff"]),
    entry("views", "Milestones · Game settings", "Company › Milestones · Custom, 10 harder", "flag", ["difficulty", "settings", "house rules", "custom", "tax rate", "what am i playing on"]),
    entry("views", "Change checklist", "Supply › Orders", "cal", ["orders", "what to type", "import plan", "checklist"]),
    entry("views", "Weekly imports", "Supply › Orders", "truck", ["import", "importer", "contracts", "weekly order", "what should i import"]),
    entry("views", "Daily top-ups", "Supply › Orders", "route", ["top-up", "distribution", "logistics", "delivery plan"], kw=["fabric", "uncut gems"]),
    entry("views", "Before the drop", "Supply › Checks · shop shelves", "shelves", ["shelves", "run out", "stock out", "empty shelf"]),
    entry("views", "Before the import", "Supply › Checks · warehouse stock", "warehouse", ["warehouse", "depot", "cover", "second-tier"]),
    entry("views", "Idle stock", "Supply › Checks", "crate", ["dead stock", "not moving", "overstock", "too much stock"]),
    entry("views", "Factory lines", "Supply › Checks · machines and staffed hours", "gear", ["machines", "recipes", "24/7", "staffed hours"]),
    entry("views", "Feed the factories", "Supply › Checks · 2 Fabric inputs short", "pipe", ["inputs", "ingredients", "fed", "factory inputs", "is my factory fed"], kw=["fabric", "uncut gems"], dot="watch"),
    entry("views", "Goods flow", "Supply › Goods flow", "route", ["diagram", "supply chain", "routes", "pipes"]),
    entry("views", "Market demand", "Growth › Demand", "growth", ["demand", "hype", "waves", "neighbourhood"]),
    entry("views", "Plan a chain", "Growth › Plan a chain", "growth", ["new factory", "recipe plan", "expand"]),
    entry("views", "Find a location", "Map · 185 vacant", "pin", ["rent", "premises", "building", "floor size", "m²", "vacant", "where should i open", "size"]),
    entry("views", "Map", "Map · 883 addresses", "map", ["city", "address", "where is"]),
    entry("views", "Staffing", "each shop's page · first: [GD] HART. Clothing", "roster", ["hire", "hiring", "schedule", "shifts", "roster", "bizman", "overstaffed", "whom should i hire"], tag="9 shops ready", land="[GD] HART. Clothing › Staffing"),
    entry("views", "Crew", "each site's page · who works there, what they want", "crew", ["hire", "demands", "quit", "people"]),
    entry("views", "Prices in your save", "Wiki › Clothing Store guide", "tag", ["prices", "pricing", "market price", "too expensive", "are my prices right"]),
    entry("views", "Changelog", "footer · what is new", "list", ["new", "updates", "release notes"]),
]

SITE_ENTRIES = [entry("sites", short(s), f"{s[2]} · {s[4]}", SITE_ICON[s[2]], kw=[s[4], s[5], s[2]] + (["eats Fabric (Expensive) and Fabric (Cheap)"] if s[1] == "Factory Clothing" else []),
                      hood=s[0], mapname=short(s), dot="watch" if s[1] in ("Factory Clothing", "Factory Jewelry", "HART. &Partners") else "",
                      land=f"#site/{slug(s[4])}") for s in SITES]
for e in SITE_ENTRIES:
    if e["t"] == "Factory Clothing":
        e["p"] = "Factory · 6 24th Street · eats Fabric (Expensive) and (Cheap)"

PRODUCTS = [
    entry("products", "Fabric (Expensive)", "Input · Factory Clothing eats 11,520/day · 6,612 arrive", "pipe", dot="watch", land="Factory Clothing › Inputs"),
    entry("products", "Fabric (Cheap)", "Input · Factory Clothing eats 11,520/day · 7,770 arrive", "pipe", dot="watch", land="Factory Clothing › Inputs"),
    entry("products", "Cut Fabric (Classic Expensive)", "Made in Factory Clothing", "gear"),
    entry("products", "Cut Fabric (Modern Expensive)", "Made in Factory Clothing", "gear"),
    entry("products", "Cut Fabric (Classic Cheap)", "Made in Factory Clothing", "gear"),
    entry("products", "Cut Fabric (Modern Cheap)", "Made in Factory Clothing", "gear"),
    entry("products", "Jewelry (Expensive)", "Sold in 14 shops · 270 a day · $542k", "gem"),
    entry("products", "Jewelry (Cheap)", "Sold in 14 shops · 929 a day · $225k", "gem"),
    entry("products", "Clothing (Modern Expensive Female)", "Sold in 7 shops · 770 a day", "shop"),
    entry("products", "Clothing (Classic Cheap Male)", "Sold in 6 shops · 875 a day", "shop"),
    entry("products", "Gym Cover Charge", "Sold in 3 gyms · 1,146 a day", "gym"),
    entry("products", "Energy Drink", "Sold in 3 gyms · 554 a day · 4,000 idle at Import Hub", "crate"),
    entry("products", "Soda Can", "Sold in 3 gyms · 369 a day", "crate"),
    entry("products", "Paper Bag", "In 14 shops · top-up 31x what they use", "crate", dot="opp"),
    entry("products", "Metal Band", "Input · 5,000 idle at Jewelry Distrib.", "pipe", dot="opp"),
    entry("products", "Uncut Gems (Cheap)", "Input · Factory Jewelry eats 1,440/day · 897 arrive", "pipe", dot="watch"),
    entry("products", "Lawyer Fee (Hourly)", "Billed at HART. &Partners · 402 hours a day", "office"),
]

KINDS = [
    ("notrading", "Not trading yet", "", "Site page"), ("vacant", "Vacant leases", "", "Company › Portfolio"),
    ("loss", "Losing money", "", "Site page"), ("staff", "Nobody on shift", "", "Supply › Checks › Factory lines"),
    ("satisfaction", "Low satisfaction", "", "Site page"), ("promotion", "Promotion below cap", "", "Portfolio › Operations"),
    ("uniform", "Uniforms / locker", "", "Site page"), ("bathroom", "No customer bathroom", "", "Site page"),
    ("toiletprivacy", "Bathroom has no privacy", "", "Site page"), ("sink", "No customer sink", "", "Site page"),
    ("music", "No music playing", "", "Site page"), ("interior", "Interior design too low", "", "Site page"),
    ("jobdemand", "Staff demands", "1 today", "Site page › Crew"), ("companydemand", "Insurance / happy boss", "1 today", "Company › Payroll"),
    ("hype", "Demand wave ending", "", "Growth › Demand"), ("unplanned", "No distribution plan", "6 smaller", "Supply › Checks › Before the drop"),
    ("outruns", "Outsells its top-up", "", "Supply › Checks › Before the drop"), ("paused", "Import paused", "", "Supply › Checks › Before the import"),
    ("shortfall", "Import shortfall", "", "Supply › Checks › Before the import"), ("order", "Weekly order too small", "", "Supply › Checks › Before the import"),
    ("feed", "Factory inputs", "4 today", "Supply › Checks › Feed the factories"), ("unnamed", "Unnamed factory line", "", "Supply › Checks › Factory lines"),
    ("unset", "Machine with no recipe", "", "Supply › Checks › Factory lines"), ("atcap", "At capacity", "switched off · 3", "Site page › Hours"),
    ("idlestaff", "Overstaffed hours", "switched off · 15", "Site page › Hours"), ("dead", "Stock not moving", "4 today", "Supply › Checks › Idle stock"),
    ("target", "Top-up target too high", "3 today", "Supply › Checks › Idle stock"), ("trend", "Revenue trend", "", "Site page › Profit"),
]
KIND_SYN = {"feed": ["fed", "inputs", "ingredients", "starved"], "atcap": ["capacity", "full", "ceiling", "door cap", "turned away"],
            "idlestaff": ["overstaffed", "idle staff", "too many staff", "hire"], "staff": ["unstaffed", "no staff", "hire"],
            "jobdemand": ["demands", "unhappy staff", "quit", "hire"], "companydemand": ["insurance", "health insurance", "hr manager"],
            "dead": ["dead stock", "idle stock"], "target": ["overstock"], "hype": ["wave", "hype"], "loss": ["loss", "losing"]}
KIND_ENTRIES = []
for gid, label, tag, lands in KINDS:
    dot = "off" if tag.startswith("switched") else "watch" if gid in ("feed", "jobdemand", "companydemand") else "opp" if tag else ""
    KIND_ENTRIES.append(entry("kinds", label, f"lands on {lands}", "kinds", KIND_SYN.get(gid, []),
                              kw=["fabric", "uncut gems"] if gid == "feed" else [], tag=tag, dot=dot, land=lands))

FINDER = [("Clothing Store", "shop", "Hell's Kitchen · demand 88"), ("Jewelry Store", "gem", "The Hamptons · demand 81"),
          ("Gym", "gym", "Garment District · demand 71"), ("Law Firm", "office", "Midtown · demand 64"),
          ("Coffee Shop", "cart", "Murray Hill · demand 77"), ("Fast Food Restaurant", "cart", "Midtown · demand 92"),
          ("Supermarket", "cart", "Industry City · demand 69"), ("Florist", "shop", "The Hamptons · demand 58"),
          ("Hairdresser", "shop", "Lower Manhattan · demand 62"), ("Electronics Store", "shop", "Midtown · demand 74"),
          ("Liquor Store", "shop", "Hell's Kitchen · demand 55"), ("Nightclub", "shop", "Lower Manhattan · demand 49")]
FINDER_ENTRIES = [entry("finder", f"Open {'an' if t[0] in 'AEIOU' else 'a'} {t}", f"best fit: {why}", icon, ["new shop", "open", "expand"],
                        land=f"Map › Find a location · {t}") for t, icon, why in FINDER]
FINDER_ENTRIES.append(entry("finder", "Rent a warehouse", "Map › Find a location · Warehouse · by m²", "warehouse", ["depot", "storage", "floor size"]))

WIKI = [("Fabric (Cheap)", "Factory Ingredients"), ("Fabric (Expensive)", "Factory Ingredients"), ("Cut Fabric (Classic Cheap)", "Factory Recipes"),
        ("Gym", "Business Types"), ("Gym Trainer", "Employee Types"), ("Gym Cover Charge", "Goods and Services"), ("Gym Lockers", "Furniture"),
        ("Gym Mat", "Furniture"), ("Clothing Store", "Business Types"), ("Jewelry Store", "Business Types"), ("Law Firm", "Business Types"),
        ("MyEmployees App", "Employee Management"), ("Employee Schedule", "Employee Management"), ("Demands Overview", "Employee Management"),
        ("Employee Health Insurance", "Employee Management"), ("Headhunter", "Employee Types"), ("HR Manager", "Employee Types"),
        ("Loans / Investments", "Finance"), ("IRS / Taxes", "Finance"), ("EconoView App", "Finance"), ("Sizes / Types", "Building Management"),
        ("Customer Capacity", "Building Management"), ("Customer Satisfaction", "Building Management"), ("Marketing / Traffic", "Building Management"),
        ("Security / Theft", "Building Management"), ("Factory Worker", "Employee Types"), ("Logistics Manager", "Employee Types"),
        ("Purchasing Agent", "Employee Types"), ("Uncut Gems (Cheap)", "Factory Ingredients"), ("Metal Band", "Factory Ingredients"),
        ("How rent works", "Big Copilot topics")]
WIKI_SYN = {"MyEmployees App": ["hire", "hiring", "fire"], "Headhunter": ["hire", "recruit"], "Employee Schedule": ["schedule", "shifts"],
            "Loans / Investments": ["debt", "loan", "interest"], "Sizes / Types": ["floor size", "m²", "building size"],
            "IRS / Taxes": ["tax"], "How rent works": ["rent", "break even"], "Customer Capacity": ["capacity", "door cap"]}
WIKI_ENTRIES = [entry("wiki", t, f"Wiki › {c}", "wiki", WIKI_SYN.get(t, []), land=f"Wiki › {t}") for t, c in WIKI]

INDEX = VIEWS + SITE_ENTRIES + PRODUCTS + KIND_ENTRIES + FINDER_ENTRIES + WIKI_ENTRIES

QUESTIONS = [
    ("Why did profit move?", "profit", "Company › Results · the portfolio sorted by week on week", "Company"),
    ("Where should I open next?", "pin", "Map › Find a location · ranked by demand", "Map"),
    ("Is my factory fed?", "pipe", "Supply › Checks › Feed the factories", "Supply"),
    ("Whom should I hire?", "roster", "Staffing on [GD] HART. Clothing · hiring lines", "Site"),
    ("Are my prices right?", "tag", "Wiki › Clothing Store › Prices in your save", "Wiki"),
    ("What should I import this week?", "truck", "Supply › Orders › Change checklist", "Supply"),
    ("What am I playing on?", "flag", "Company › Milestones · game settings", "Company"),
]


def _score(e: dict, q: str) -> tuple[int, str, str]:
    """(score, where the match is: t/p/syn, the synonym matched)."""
    t, p = e["t"].lower(), e["p"].lower()
    if t.startswith(q):
        return 100, "t", ""
    if re.search(r"(^|[\s(·/-])" + re.escape(q), t):
        return 85, "t", ""
    if q in t:
        return 60, "t", ""
    for s in e["syn"]:
        if s.startswith(q) or (len(q) >= 4 and q in s):
            return 70, "syn", s
    if e["g"] == "sites" and any(k.lower().startswith(q) for k in e["kw"]):
        return 75, "p", ""
    if len(q) >= 3 and (re.search(r"(^|[\s(·/-])" + re.escape(q), p) or any(k.lower().startswith(q) for k in e["kw"])):
        return 40, "p", ""
    return 0, "", ""


def search(q: str, per: int = 4) -> list[tuple[str, list, int]]:
    """Grouped hits, best group first; each group keeps its best `per`."""
    q = q.strip().lower()
    out = []
    for gid, _ in GROUPS:
        hits = []
        for e in INDEX:
            if e["g"] != gid:
                continue
            s, where, syn = _score(e, q)
            if s:
                hits.append((s, e, where, syn))
        hits.sort(key=lambda h: -h[0])
        if hits:
            out.append((gid, hits[:per], len(hits)))
    order = [g for g, _ in GROUPS]
    # your own sites lead a tie, the wiki is reference and waits
    out.sort(key=lambda g: (-(g[1][0][0] + GROUP_BIAS.get(g[0], 0)), order.index(g[0])))
    return out


def mark(text: str, q: str, word_start: bool = False) -> str:
    """The text with the first match of q marked; always escaped."""
    low = text.lower()
    k = -1
    if word_start:
        m = re.search(r"(^|[\s(·/-])" + re.escape(q), low)
        k = m.start() + len(m.group(1)) if m else -1
    if k < 0:
        k = low.find(q)
    if k < 0 or not q:
        return esc(text)
    return esc(text[:k]) + "<mark>" + esc(text[k:k + len(q)]) + "</mark>" + esc(text[k + len(q):])


def result_row(e: dict, q: str, where: str, syn: str, on: bool = False) -> str:
    title = mark(e["t"], q) if where == "t" else esc(e["t"])
    sub = mark(e["p"], q, word_start=True) if where == "p" else esc(e["p"])
    if where == "syn":
        title += f'<span class="ss-syn" title="the word you typed; the board calls it {esc(e["t"])}"><b>≈</b> {mark(syn, q)}</span>'
    icon = (f'<span class="ic hood">{e["hood"]}</span>' if e["hood"] else f'<span class="ic">{svg(e["ic"])}</span>')
    side = ""
    if e["tag"] or e["dot"]:
        side += f'<span class="ss-tag">{f"<i class=\"ss-dot {e["dot"]}\"></i>" if e["dot"] else ""}{esc(e["tag"])}</span>'
    if e["map"]:
        side += mapbtn(e["map"])
    side += f'<span class="ss-go">{ic("enter")}open</span>'
    return (f'<a class="ss-row{" on" if on else ""}" href="#" data-land="{esc(e["land"])}">{icon}'
            f'<span><span class="t">{title}</span><span class="p">{sub}</span></span><span class="ss-side">{side}</span></a>')


def results_html(q: str, per: int = 4) -> tuple[str, int]:
    groups = search(q, per)
    total = sum(n for _, _, n in groups)
    names = dict(GROUPS)
    body = ""
    first = True
    for gid, hits, n in groups:
        body += f'<div class="ss-grp"><div class="ss-gh">{names[gid]}<em>{n if n <= per else f"{per} of {n}"}</em></div>'
        for s, e, where, syn in hits:
            body += result_row(e, q, where, syn, on=first)
            first = False
        if n > per:
            body += f'<a class="ss-more" href="#">{n - per} more {names[gid].lower()} ›</a>'
        body += "</div>"
    return body, total


def question_rows(on: int = 0) -> str:
    rows = ""
    for k, (qq, icon, lands, _) in enumerate(QUESTIONS):
        rows += (f'<a class="ss-row ss-q2{" on" if k == on else ""}" href="#" data-land="{esc(lands)}"><span class="ic">?</span>'
                 f'<span><span class="t">{esc(qq)}</span><span class="p">{esc(lands)}</span></span>'
                 f'<span class="ss-side"><span class="ss-go">{ic("enter")}open</span></span></a>')
    return rows


def recent_rows() -> str:
    rec = [SITE_ENTRIES[0], VIEWS[17], WIKI_ENTRIES[-1]]
    return "".join(result_row(e, "", "", "") for e in rec)


def foot(say: str = "") -> str:
    return (f'<div class="ss-foot"><span><span class="ss-kbd">↑</span><span class="ss-kbd">↓</span>move</span>'
            f'<span><span class="ss-kbd">↵</span>open</span><span><span class="ss-kbd">⇧↵</span>on the map</span>'
            f'<span><span class="ss-kbd">esc</span>close</span>{f"<span class=\"ss-say\">{say}</span>" if say else ""}</div>')


def palette(q: str, state: str = "results") -> str:
    """The palette over the board. state: empty | results | none."""
    count = ""
    if state == "empty":
        res = (f'<div class="ss-grp"><div class="ss-gh">Ask the board</div>{question_rows()}</div>'
               f'<div class="ss-grp"><div class="ss-gh">Where you were</div>{recent_rows()}</div>'
               '<p class="ss-hint">Type a site, a product, a finding, a page, or a word the game uses: <b>hire</b>, <b>debt</b>, <b>difficulty</b>.</p>')
        say = ""
    elif state == "none":
        res = f"""<div class="ss-none"><div class="ss-ball"><i></i></div>
<p>Nothing on the board or in the wiki is called <b>{esc(q)}</b>.</p>
<div class="ss-sugg"><a class="ss-chip" href="#">{ic("search")}<span>Did you mean <mark>yeast</mark>?</span></a>
<a class="ss-chip" href="#">{ic("wiki")}Browse the wiki</a><a class="ss-chip" href="#">{ic("flag")}Tell us what you looked for</a></div></div>
<div class="ss-grp"><div class="ss-gh">Or ask the board</div>{question_rows(on=-1)}</div>"""
        say = ""
        count = '<span class="ss-count">0 found</span>'
    else:
        res, total = results_html(q)
        top = search(q)[0][1][0][1]
        say = f'↵ opens <b>{esc(top["land"])}</b>'
        count = f'<span class="ss-count">{total} found</span>'
    value = f' value="{esc(q)}"' if q else ""
    return f"""<div class="ss-scrim"></div>
<div class="ss-pal" role="dialog" aria-label="Search the board">
  <div class="ss-in"><span class="ss-i ss-lens">{svg("search")}</span><input type="search" aria-label="Search the board" placeholder="Search sites, products, findings, pages and the wiki"{value}>{count}<span class="ss-kbd">esc</span></div>
  <div class="ss-res">{res}</div>
  {foot(say)}
</div>"""


def sheet(q: str) -> str:
    """The palette on a phone: the whole screen."""
    res, total = results_html(q, per=3)
    return f"""<div class="ss-sheet" role="dialog" aria-label="Search the board">
  <div class="ss-in"><button type="button" class="ss-back" aria-label="Close search">{svg("back")}</button><input type="search" aria-label="Search the board" value="{esc(q)}"><span class="ss-count">{total}</span><button type="button" class="ss-cancel">Cancel</button></div>
  <div class="ss-res">{res}</div>
</div>"""


# --------------------------------------------------------------------------
# the masthead
# --------------------------------------------------------------------------
NAV = [("today", "Today", "today"), ("company", "Company", "company"), ("supply", "Supply", "supply"),
       ("growth", "Growth", "growth"), ("map", "Map", "map"), ("wiki", "Wiki", "wiki")]


def masthead(active: str, phone: bool = False, searching: bool = False) -> str:
    links = "".join(f'<a href="#{k}" class="{"on" if k == active else ""}">{svg(icon, hidden=False)}<span>{label}</span></a>' for k, label, icon in NAV)
    orb = "" if phone else '<div class="orb live" aria-hidden="true" style="left:768px;top:4px;transform:scale(.8)"><i></i><u></u></div>'
    field = (f'<button type="button" class="ss-q{" on" if searching else ""}" aria-label="Search the board (/ or Ctrl+K)">'
             f'<span class="ss-i ss-lens">{svg("search")}</span><span class="ss-ql">Search the board</span><span class="ss-kbd">/</span></button>'
             f'<button type="button" class="ibtn ss-qbtn" aria-label="Search the board">{svg("search")}</button>')
    return f"""<header class="mast">
  <div class="brand"><span class="wordmark">HART. YT</span><span class="dot"></span></div>
  <nav class="nav" aria-label="Board pages">{links}<i class="ink"></i></nav>
  {field}
  <div class="clock tr"><b>Day 73<i>·</i>Wed 11:13</b><small>YEAR 2 · 26 SITES · 529 STAFF</small></div>
  {orb}
</header>"""


def addr(hash_: str) -> str:
    return f'<div class="ss-addr"><small>address</small><span>bigcopilot.com/<b>{esc(hash_)}</b></span></div>'


# --------------------------------------------------------------------------
# a site's page: the live blocks, placed on their own route
# --------------------------------------------------------------------------
def picker(site: tuple, phone: bool) -> str:
    """The existing prev / select / next, moved from the head into the crumb row."""
    k = SITES.index(site)
    prev, nxt = SITES[k - 1] if k else None, SITES[k + 1] if k < len(SITES) - 1 else None
    trading = [s for s in SITES if s[3] in ("retail", "office")]
    support = [s for s in SITES if s[3] not in ("retail", "office")]
    # the open site leads, so the select shows it without relying on `selected` surviving the canvas runtime
    opts = f'<option selected="">{esc(short(site))}</option>'
    opts += "".join(f'<option>{esc(short(s))}</option>' for s in trading if s != site)
    opts += '<optgroup label="Support sites">' + "".join(f'<option>{esc(short(s))}</option>' for s in support if s != site) + "</optgroup>"
    sel = f'<select class="sitepick" aria-label="Which site">{opts}</select>'
    if phone:
        name = lambda s: esc(short(s)) if s else "none"
        return (f'<div class="ss-pick"><a href="#" class="ibtn" aria-label="Previous site: {name(prev)}">{svg("back")}</a>{sel}'
                f'<a href="#" class="ibtn" aria-label="Next site: {name(nxt)}">{svg("chev")}</a></div>')
    step = lambda s: f'<span><a href="#site/{slug(s[4])}">{esc(short(s))}</a>{mapbtn(short(s))}</span>' if s else ""
    return f'<span class="seg">{step(prev)}{sel}{step(nxt)}</span>'


def crumbs(site: tuple, chain: str, came_from: str = "", phone: bool = False) -> str:
    back = (f'<a class="ss-crumb from" href="#today">{ic("back")}{came_from}</a>' if came_from
            else f'<a class="ss-crumb" href="#company">{ic("back")}Portfolio</a>')
    trail = ""
    if not phone:
        trail = (f'<span class="ss-trail">{"<a href=\"#company\">Portfolio</a><i>›</i>" if came_from else ""}'
                 f'<a href="#company">{esc(chain)}</a><i>›</i><span>{esc(short(site))}</span></span>')
    return f'<nav class="ss-crumbs" aria-label="Where this page sits">{back}{trail}{picker(site, phone)}</nav>'


def sitehead(site: tuple, sub: str, marks: str = "") -> str:
    code, name = site[0], site[1]
    return f"""<div class="sitehead">
  <span class="bullet">{code}</span>
  <div><h2>{esc(name)}{mapbtn(short(site))}{marks}</h2><span class="sub">{sub}</span></div>
</div>"""


def rank(place: int, of: int) -> str:
    ladder = "".join(f'<i class="{"me" if k == place - 1 else ""}" style="--t:{1 - k / (of - 1):.2f};--k:{k}"></i>' for k in range(of))
    return (f'<span class="sp-rank{" top" if place <= 3 else ""}" data-tip="2nd of the 19 sites that trade, by profit over the last 7 days">'
            f'<span>{place}<small>/{of}</small></span><span class="ladder">{ladder}</span></span>')


def spfind(sev: str, icon: str, block: str, what: str, more: str, amt: str, small: str, arrived: bool = False, hit: str = "") -> str:
    return (f'<a class="sp-find {sev}{" arrived" if arrived else ""}" href="#" data-ev="{block}"{f" data-hit=\"{hit}\"" if hit else ""}>'
            f'<span class="mark"></span><span class="ev sp-i">{svg(icon)}</span><span class="what">{what}</span>'
            f'<span class="amt">{amt}<small>{small}</small></span><span class="go">{svg("down")}</span><span class="more">{more}</span></a>')


def sechead(icon: str, title: str, why: bool = True, quiet: str = "", aside: str = "", cls: str = "") -> str:
    return (f'<div class="sechead"><span class="sp-ico {cls}">{svg(icon)}</span><h2>{title}</h2>'
            + ('<span class="why" tabindex="0"><i>?</i></span>' if why else "")
            + (f'<span class="quiet">{quiet}</span>' if quiet else "") + (f'<div class="aside">{aside}</div>' if aside else "") + "</div>")


SMALL = 'style="font-size:12px;color:var(--ink-3);margin-left:6px"'


def spark(vals: list[float], day0: int, unit: str, tone: str = "") -> str:
    lo, hi = min(vals), max(vals)
    bars = "".join(f'<i class="{"l" if k >= len(vals) - 7 else ""}" style="--v:{25 + (v - lo) / ((hi - lo) or 1) * 75:.0f}%" '
                   f'data-read="day {day0 + k} &lt;b&gt;{unit}{v:,.0f}&lt;/b&gt;"></i>' for k, v in enumerate(vals))
    return f'<div data-readzone=""><div class="sp-spark {tone}">{bars}</div><div class="sp-tread sp-readout"></div></div>'


def costbar(parts: list[tuple], total: float) -> str:
    shade = {"Goods": 62, "Wages": 46, "Rent": 32, "Marketing": 24, "Theft": 18}
    segs = "".join(f'<i class="{"p" if l == "Profit" else ""}" style="flex:{v / total:.4f} 0 0;--k:{shade.get(l, 40)}%" data-read="{l} &lt;b&gt;${v:,.0f}&lt;/b&gt;"></i>' for l, v in parts)
    return f'<div data-readzone=""><div class="sp-cost">{segs}</div><div class="sp-tread sp-readout"></div></div>'


def hours_grid(seed: int) -> str:
    """A 24-hour clothing store: busy afternoons, a big Saturday, counters on through empty nights."""
    random.seed(seed)
    DN = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    g = "<div></div>" + "".join(f'<div class="hh">{h if h % 3 == 0 else ""}</div>' for h in range(24))
    for d in range(7):
        g += f'<div class="dd{" now" if d == 2 else ""}">{DN[d]}</div>'
        for h in range(24):
            base = 3 + 26 * math.exp(-((h - 14.5) ** 2) / 14) + (9 if d == 5 else 4 if d in (4, 6) else 0) * math.exp(-((h - 15) ** 2) / 10)
            v = max(1, base + random.uniform(-2, 2))
            a = 6 + v / 36 * 70
            slack = h < 8 or h >= 21
            g += f'<div class="hc{" slack" if slack else ""}" style="background:color-mix(in oklab, var(--accent) {a:.0f}%, var(--surface))"></div>'
    return f'<div class="hours">{g}</div>'


FIRST = ["Ada", "Ben", "Cora", "Dale", "Edie", "Fern", "Gus", "Hana", "Ivan", "June", "Kurt", "Lola", "Milo", "Nell", "Otto", "Pam",
         "Quinn", "Rosa", "Stan", "Tara", "Uri", "Vera", "Walt", "Xena", "Yara", "Zeke"]
LAST = ["Abbott", "Baker", "Castro", "Dunn", "Ellis", "Frost", "Gomez", "Hale", "Irwin", "Jordan", "Keane", "Lowe", "Marsh", "Nolan", "Ortiz",
        "Price", "Quade", "Reyes", "Stone", "Tran", "Upton", "Vance", "Wells", "Young"]


def people(n: int, seed: int) -> list[str]:
    random.seed(seed)
    return [f"{random.choice(FIRST)} {random.choice(LAST)}" for _ in range(n)]


def staffing(site: tuple) -> str:
    """The Staffing block as the board draws it today (demand plan, Monday)."""
    rows = ('<div class="sp-grow sp-needrow" style="min-height:0;margin:0"><span></span>'
            + "".join(f'<div class="hh" style="grid-column:{h + 2}">{h if h % 3 == 0 else ""}</div>' for h in range(24)) + "</div>")
    need = [1] * 8 + [2] * 5 + [3] * 3 + [2] * 4 + [1] * 4
    day = '<div class="sp-day sp-on" data-d="1"><div class="sp-grow sp-needrow"><span class="lab">' + spi("person") + "</span>"
    day += "".join(f'<i class="sp-need " style="grid-column:{h + 2};--n:{n}"></i>' for h, n in enumerate(need)) + "</div>"
    names = people(12, 3)
    plan = [("CR1", [(0, 12, names[0]), (12, 24, names[1])]), ("CR2", [(8, 20, names[2])]), ("CR3", [(13, 16, names[3])]), ("CR4", []),
            ("CS1", [(0, 12, names[4]), (12, 24, names[5])]), ("CS2", [(0, 12, names[6]), (12, 24, names[7])]),
            ("SG1", [(0, 12, names[8]), (12, 24, names[9])])]
    for lab, shifts in plan:
        day += f'<div class="sp-grow"><span class="lab">{lab}</span>'
        day += "".join(f'<i class="sp-frag" style="grid-column:{a + 2}/{a + 4};--k:{k}"></i>' for k, a in enumerate(range(0, 24, 4)))
        for a, b, who in shifts:
            day += (f'<button type="button" class="sp-shift" style="grid-column:{a + 2}/{b + 2}"><span class="sp-i sp-tick">{svg("tick")}</span>'
                    f'<span class="sp-lbl">{who}</span><small>{a:02d}–{b:02d}</small></button>')
        day += "</div>"
    day += "</div>"
    tabs = "".join(f'<a href="#" class="{"sp-on" if d == "MON" else ""}">{d}</a>' for d in ("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"))
    dots = lambda n, cls="": "".join(f'<i class="sp-dot {cls}"></i>' for _ in range(n))
    return f"""<section class="sec" data-block="roster" id="sp-roster" data-readzone="">
  {sechead("roster", "Staffing", quiet=esc(short(site)))}
  <div class="sp-pick"><span class="seg sp-plans" role="group" aria-label="Plan"><a href="#" class="sp-on">Demand plan</a><a href="#">Full cover 24/7</a></span></div>
  <div class="sp-ba">
    <div><span class="lab">Hours / week</span><div class="v">{spi("list")}<s>1176 h</s>770<small style="font-size:12px;color:var(--ink-3)"> h</small><small style="font-size:12px;color:var(--ink-3)"><s>389</s> 69 entries</small></div></div>
    <div><span class="lab">Wages / week</span><div class="v">{spi("coin")}<s>$51k</s>$32k</div></div>
    <div><span class="lab">Overstaffed hours</span><div class="v" style="font-size:14px">9<small style="color:var(--ink-3)">/ 25.7 h</small><span class="sp-meter"><i style="--w:35%"></i></span></div></div>
    <div class="sp-typed"><span class="sp-ring" style="--p:0"></span><span><b class="sp-count">0</b> of 69 copied</span></div>
  </div>
  <div class="sp-steps"><button type="button" class="sp-step"><span class="sp-box">{svg("tick")}</span>Clear entire schedule<small>BizMan › Schedule</small></button><span class="seg sp-nowplan" style="margin-left:auto"><a href="#">now</a><a href="#" class="sp-on">plan</a></span><span class="seg sp-daytabs">{tabs}</span></div>
  <div class="chartbox sp-gantt">{rows}{day}</div>
  <div class="sp-hc"><span><span class="sp-code">CS</span><span class="sp-dots">{dots(8)}</span>8 · 6 spare</span><span><span class="sp-code">CL</span><span class="sp-dots">{dots(5)}</span>5 · 3 spare</span><span><span class="sp-code">SG</span><span class="sp-dots">{dots(2)}</span>2 · 2 spare</span></div>
  <div class="sp-read sp-readout">Hover an entry</div>
</section>"""


def crewrows(roles: list[tuple], seed: int) -> str:
    out = ""
    for code, role, n, off, pay in roles:
        dots = "".join(f'<i class="sp-dot{" off" if k < off else ""}" style="--k:{k}"></i>' for k in range(n))
        out += (f'<div class="sp-rrow"><button type="button" class="sp-rbtn" aria-expanded="false"><i>{code}</i>{role}{spi("chev")}</button>'
                f'<span class="sp-dots">{dots}</span><span class="sp-rcount"><b>{n}</b>{f" · {off} off" if off else ""} · ${pay:,}/day</span></div>')
    return f'<div data-readzone=""><div class="sp-roster">{out}</div><div class="sp-read sp-readout">Hover a dot</div></div>'


def shop_page(phone: bool = False) -> str:
    site = SITES[0]
    depot = site_of("Clothing Distr.")
    sub = (f'Clothing Store · 57 Fifth Avenue · Lower Manhattan · opened day 15 · supplied from '
           f'{sitelink("Clothing Distr.", depot[4])}{mapbtn("Clothing Distr.")}')
    marks = f'<span class="sp-lamp" data-tip="Trading"></span>{rank(2, 19)}'
    rev = [176812, 202108, 109198, 210459, 210509, 188985, 182169, 151746, 179484, 206852, 224561, 217812, 197192, 184970]
    cus = [394, 460, 286, 468, 479, 415, 393, 340, 388, 453, 488, 478, 414, 385]
    shelves = [("Clothing (Classic Expensive Female)", "$190.07", 201, "Sat 237", "$38,204", 500, 47, 461),
               ("Clothing (Classic Expensive Male)", "$190.07", 199, "Sat 235", "$37,851", 500, 47, 460),
               ("Clothing (Modern Expensive Female)", "$197.86", 202, "Sat 238", "$39,996", 500, 48, 396),
               ("Clothing (Modern Expensive Male)", "$197.86", 200, "Sat 236", "$39,657", 500, 47, 394),
               ("Jewelry (Cheap)", "$249.27", 44, "Sat 52", "$10,968", 300, 17, 272),
               ("Jewelry (Expensive)", "$1,978.65", 14, "Sat 17", "$27,984", 300, 6, 285)]
    srows = "".join(f'<tr><td class="l">{p}<span class="sub">{pr}</span></td><td>{s}</td><td>{b}</td><td>{r}</td><td>{t}</td>'
                    f'<td class="gauge"><i><b style="--w:{g}%"></b></i>{g}%</td><td>{h}</td></tr>' for p, pr, s, b, r, t, g, h in shelves)
    vals = [180000 + 22000 * math.sin(k / 2.3) + (-38000 if k == 18 else 0) + 900 * (k % 4) for k in range(30)]
    week = [-2, -8, -18, -4, 0, 18, 14]
    scroll = " ss-scroll" if phone else ""
    return f"""{crumbs(site, "Clothing Stores", phone=phone)}
<div id="sitePanel">
{sitehead(site, sub, marks)}
<div class="sp-finds">{spfind("opp", "hours", "hours", "Runs 4 counters 00:00-24:00 on a Wednesday for 15 customers an hour", "64 staff-hours a week that buy nothing", "$430", "/day wages")}{spfind("watch", "magnet", "pull", "Lower Manhattan hype on 1 lines has 3 days left", "It does $184,970/day under it against $199,414 for its own 7 days before day 62.", "$0", "/day revenue", hit="wave")}</div>
<div class="sstats" data-block="tiles" id="sp-tiles">
  <div class="sstat"><span class="lab">Revenue yesterday</span><div class="v">$184,970<span class="chip dim">{svg("trend_up")}+6%</span></div>{spark(rev, 59, "$", "up")}</div>
  <div class="sstat"><span class="lab">Customers</span><div class="v">385<small {SMALL}>$480.44/visit</small></div>{spark(cus, 59, "")}</div>
  <div class="sstat"><span class="lab">Profit</span><div class="v pos">$171,194<small {SMALL}>92.6% margin</small></div>{costbar([("Goods", 69), ("Wages", 7251), ("Rent", 453), ("Marketing", 6000), ("Theft", 3), ("Profit", 171194)], 184970)}</div>
  <div class="sstat"><span class="lab">Building capacity</span><div class="v">75<small {SMALL}>/h · 0 h/wk at the ceiling</small></div><div class="sp-ceil">{spi("door")}{spi("counter")}{spi("person")}</div></div>
</div>
<div class="duo sec" style="grid-template-columns:3fr 2fr">
  <section data-block="standards" id="sp-standards" data-readzone="">
    {sechead("standards", "Standards")}
    <div class="sp-std"><div class="sp-big">100<small>%</small></div><div class="sp-eq"><span class="th"></span>{"".join(f'<div class="sp-eqb"><span class="t"><b style="--v:100%"></b></span>{spi(i)}</div>' for i in ("person", "tag", "sparkle", "building"))}</div>
    <div class="sp-lamps"><div class="sp-lamprow">{"".join(f'<span class="sp-lampb ok {n}" role="img" aria-label="{n}">{svg(i)}</span>' for n, i in (("bathroom", "toilet"), ("toiletprivacy", "door"), ("sink", "sink"), ("music", "music"), ("interior", "interior")))}</div><div class="sp-lamprow"><span class="sp-lampb ok locker" role="img" aria-label="Uniform locker">{svg("locker")}</span></div></div></div>
    <div class="sp-read sp-readout">5 asked · <b>0 unmet</b></div>
  </section>
  <section data-block="pull" id="sp-pull" data-readzone="">
    {sechead("magnet", "Pull", cls="magnet")}
    <div class="sp-promorow"><div class="sp-promo"><i class="tr" style="width:43%"></i><i class="mk" style="width:57%"></i><u></u><u></u><u></u></div><div class="sp-big" style="font-size:26px">100<small>/100</small></div></div>
    <div class="sp-minis"><span>{spi("shield")}70%</span><span>{spi("person")}75</span></div>
    <div class="sp-wave" data-el="wave">{spi("wave")}<div class="sp-wavebar"><i class="base" style="width:86%"></i><i class="lift" style="width:14%"></i></div><span><span class="sp-pips"><i class="on"></i><i class="on"></i><i class="on"></i><i></i><i></i><i></i><i></i></span>&nbsp; 3d</span></div>
    <div class="sp-read sp-readout">&nbsp;</div>
  </section>
</div>
<section class="sec" data-block="hours" id="sp-hours">
  {sechead("hours", "Hours")}
  <div class="chartbox{scroll}" data-readzone="">{hours_grid(5)}<div class="sp-read sp-readout">Hover an hour</div></div>
  <div class="sp-hchips"><span class="sp-hchip idle"><i class="sp-sw"></i>{spi("counter")}<b>4 on</b> 00:00–24:00 a Wednesday · $430/day of wages</span></div>
</section>
{staffing(site)}
<div class="duo sec" style="grid-template-columns:1fr 2fr">
  <section data-block="crew" id="sp-crew">
    {sechead("crew", "Crew", quiet="26 people · $7,251/day")}
    {crewrows([("CL", "Cleaning", 8, 3, 1683), ("CS", "Customer Service", 14, 0, 4511), ("SG", "Security Guard", 4, 0, 1057)], 4)}
  </section>
  <section data-block="shelves" id="sp-shelves">
    {sechead("shelves", "Shelves", why=False, quiet="before tomorrow's top-up")}
    <div class="scrollx"><table><thead><tr><th>Product</th><th>Sells / day</th><th>Busiest</th><th>Revenue / day</th><th>Top-up</th><th>Pressure</th><th>On hand</th></tr></thead><tbody>{srows}</tbody></table></div>
    <p class="quiet" style="margin:12px 0 0"><a class="link" href="#">show 5 more: bags, drinks, odds and ends</a></p>
  </section>
</div>
<div class="duo sec">
  <section data-block="profit" id="sp-profit" data-readzone="">
    {sechead("profit", "Profit, last 30 days", why=False, aside='<span class="chip dim">' + svg("trend_up") + '+6%</span>')}
    <div class="chartbox">{profit_chart(vals, 43)}<div class="sp-read sp-readout"><b>$180,871</b>/day over the last 7 against <b>$169,984</b>/day the week before</div></div>
  </section>
  <section data-block="week" id="sp-week">
    {sechead("week", "Its week", why=False, quiet="peaks Saturday, 36 points between best and worst")}
    <div class="chartbox" style="padding-bottom:16px">{week_now(week_bars(week), 2)}</div>
  </section>
</div>
</div>"""


def week_now(markup: str, day: int) -> str:
    """The helper marks Sunday as today; the save's today is a Wednesday."""
    parts = markup.replace('class="wd now"', 'class="wd"').split('class="wd"')
    return "".join(q + ('class="wd now"' if k == day else 'class="wd"') for k, q in enumerate(parts[:-1])) + parts[-1]


def factory_page(phone: bool = False) -> str:
    site = site_of("Factory Clothing")
    hub = site_of("Import Hub")
    sub = "Factory · 6 24th Street · Industry City · opened day 18"
    lines = [("Clothing (Classic Expensive Female)", "#4 #12", 2, 827, 1737), ("Clothing (Modern Expensive Female)", "#3 #10", 2, 827, 1716),
             ("Clothing (Modern Expensive Male)", "#2 #11", 2, 827, 1736), ("Clothing (Classic Expensive Male)", "#5 #9", 2, 825, 1730),
             ("Clothing (Classic Cheap Female)", "#1", 1, 914, 1638), ("Clothing (Modern Cheap Male)", "#8", 1, 917, 1629),
             ("Clothing (Classic Cheap Male)", "#6", 1, 913, 1630), ("Clothing (Modern Cheap Female)", "#7", 1, 912, 1630)]
    lrows = ('<div class="sp-line sp-head"><span>Line</span><span>Machines</span><span></span><span class="sp-n">Makes / day</span>'
             '<span class="sp-n">Ships / day</span><span class="sp-n">On hand</span></div>')
    for k, (item, ws, m, ships, hand) in enumerate(lines):
        mach = "".join(f'<span class="sp-m" style="--h:100%">{svg("gear")}</span>' for _ in range(m))
        lrows += (f'<div class="sp-line" data-line="{k}"><div>{item}<span class="sub">Clothing Workstation · {ws}</span></div>'
                  f'<div class="sp-mach">{mach}</div><div class="sp-belt"></div><div class="sp-n">1,440<small>of 1,440 rated</small></div>'
                  f'<div class="sp-n">{ships:,}</div><div class="sp-n">{hand:,}</div></div>')
    frm = f'{sitelink("Import Hub", hub[4])}'
    irows = (f'<tr class="sp-hit"><td class="l">Fabric (Expensive)</td><td>11,520</td><td>11,600</td><td>6,612</td><td>7,280</td><td class="l" style="color:var(--ink-2)">{frm}</td></tr>'
             f'<tr><td class="l">Fabric (Cheap)</td><td>11,520</td><td>11,600</td><td>7,770</td><td>7,280</td><td class="l" style="color:var(--ink-2)">{frm}</td></tr>')
    return f"""{crumbs(site, "Factories", came_from="Today", phone=phone)}
<div id="sitePanel" class="sp-focus">
{sitehead(site, sub)}
<div class="sp-finds">{spfind("watch", "pipe", "inputs", "Fabric (Expensive)", "Arrives at 6,612/day against 11,520 needed while Import Hub holds 65,354: the line is not drawing it.", "11,520", "/day needed", arrived=True)}{spfind("watch", "pipe", "inputs", "Fabric (Cheap)", "Arrives at 7,770/day against 11,520 needed while Import Hub holds 63,824: the line is not drawing it.", "11,520", "/day needed")}</div>
<div class="sstats" data-block="tiles" id="sp-tiles">
  <div class="sstat"><span class="lab">Machines</span><div class="v">12<small {SMALL}>· 12 running</small></div></div>
  <div class="sstat"><span class="lab">Made / day</span><div class="v">11,520<small {SMALL}>of 11,520 rated</small></div><div class="sp-meter"><i style="--w:100%"></i></div></div>
  <div class="sstat"><span class="lab">Shipped / day</span><div class="v">6,962</div><div class="sp-meter"><i style="--w:60%"></i></div></div>
  <div class="sstat"><span class="lab">Cost / day</span><div class="v">$145,743</div>{costbar([("Goods", 134878), ("Wages", 10500), ("Rent", 365)], 145743)}</div>
</div>
<section class="sec" data-block="lines" id="sp-lines" data-readzone="">
  {sechead("gear", "Lines")}
  <div class="scrollx"><div class="sp-lines">{lrows}</div></div>
  <div class="sp-read sp-readout">Hover a machine</div>
</section>
<section class="sec sp-lit" data-block="inputs" id="sp-inputs" data-readzone="">
  {sechead("pipe", "Inputs")}
  <div class="scrollx"><table><thead><tr><th>Input</th><th>Eats / day</th><th>Top-up</th><th>Arrived / day</th><th>On hand</th><th class="l">From</th></tr></thead><tbody>{irows}</tbody></table></div>
  <div class="sp-read sp-readout"><b>6,612</b>/day arrives; the line is <b>not drawing it</b></div>
</section>
<section class="sec" data-block="crew" id="sp-crew">
  {sechead("crew", "Crew", quiet="49 people · $10,449/day")}
  {crewrows([("DD", "Delivery Driver", 1, 0, 302), ("FW", "Factory Worker", 48, 0, 10146)], 9)}
</section>
</div>"""


# --------------------------------------------------------------------------
# Today
# --------------------------------------------------------------------------
def kspark(vals: list[float]) -> str:
    lo, hi = min(vals), max(vals)
    n = len(vals)
    pts = " ".join(f"{k / (n - 1) * 300:.1f},{30 - (v - lo) / ((hi - lo) or 1) * 26:.1f}" for k, v in enumerate(vals))
    return (f'<div class="spark"><svg viewBox="0 0 300 34" preserveAspectRatio="none"><polygon class="area" points="0,34 {pts} 300,34"></polygon>'
            f'<polyline points="{pts}"></polyline></svg><span class="scrub"></span></div>')


def kpis() -> str:
    prof = [21, 25, 36, 29, 56, 10, 72, 97, 223, 324, 247, 263, 254, 274, 306, 254, 370, 360, 439, 577, 531, 433, 548, 614, 803, 698, 670, 701, 811, 827,
            535, 355, 463, 681, 748, 1030, 963, 1050, 850, 776, 1100, 1410, 1380, 1410, 1400, 1268]
    rev = [31, 37, 80, 81, 130, 37, 219, 266, 401, 505, 340, 456, 489, 522, 410, 616, 602, 696, 800, 632, 746, 707, 881, 978, 977, 1060, 1090, 967, 1090, 1230,
           1130, 1080, 1160, 1070, 1200, 1380, 1430, 1530, 1500, 1560, 1590, 1530, 1610, 1940, 2010, 2000, 2050, 1983]
    cost = [6, 9, 23, 35, 60, 13, 105, 136, 120, 25, 123, 124, 124, 29, 31, 128, 134, 137, 42, 143, 148, 161, 165, 75, 181, 180, 185, 80, 191, 195, 196,
            93, 205, 211, 219, 231, 125, 239, 242, 208]
    return f"""<div class="kpis">
  <div class="kpi"><span class="lab">Profit yesterday</span><span class="v">$1,268,481</span><div class="row"><span class="chip ok">▲ 2%</span><span class="sub">vs 7-day</span></div>{kspark(prof)}</div>
  <div class="kpi"><span class="lab">Revenue yesterday</span><span class="v">$1,983,581</span><div class="row"><span class="chip dim">4,616</span><span class="sub">customers</span></div>{kspark(rev)}</div>
  <div class="kpi"><span class="lab">Cash on hand</span><span class="v">$3,667,464</span><div class="row"><span class="chip dim">$8.73M profit</span><span class="sub">no cash history</span></div></div>
  <div class="kpi"><span class="lab">Fixed cost / day</span><span class="v">$207,883</span><div class="row"><span class="chip dim">rent $11k</span><span class="sub">payroll $196k</span></div>{kspark(cost)}</div>
</div>"""


# sev, site name, neighbourhood (to tell namesakes apart), what, amount, small, more
TODAY_FINDS = [
    ("watch", "HART. &Partners", "", "6 staff with unmet demands", "6", "staff", "Stump Mesh Office Chair for 3 (important), Multipurpose Chair for 2, Mouse Pad for 1"),
    ("watch", None, "", "5 staff with demands only you can meet", "5", "staff", "Bronze Health Insurance for 3, Gold for 1, Silver for 1"),
    ("watch", "Factory Clothing", "", "Fabric (Expensive)", "11,520", "/day needed", "Arrives at 6,612/day against 11,520 needed while Import Hub holds 65,354"),
    ("watch", "Factory Clothing", "", "Fabric (Cheap)", "11,520", "/day needed", "Arrives at 7,770/day against 11,520 needed while Import Hub holds 63,824"),
    ("watch", "Factory Jewelry", "", "Uncut Gems (Cheap)", "1,440", "/day needed", "Arrives at 897/day against 1,440 needed while Import Hub holds 8,200"),
    ("watch", "Factory Jewelry", "", "Uncut Gems (Expensive)", "720", "/day needed", "Arrives at 488/day against 720 needed while Import Hub holds 4,342"),
    ("opp", "Jewelry Distrib.", "", "5,000 Metal Band held with nothing moving out", "", "", ""),
    ("opp", "Import Hub", "", "4,000 Energy Drink held with nothing moving out", "", "", ""),
    ("opp", "Import Hub", "", "3,000 Soda Can held with nothing moving out", "", "", ""),
    ("opp", "Factory Electronics", "", "10 products are held with nothing moving out", "10", "findings", "largest Capacitors: 20,520 held with nothing moving out"),
    ("opp", "Import Hub", "", "572,160 units of Battery, Capacitors, Copper Clad Laminate", "572,160", "units", "and 7 more across 1 site is 6 weeks of supply"),
    ("opp", "HART. Jewelry", "Midtown", "Paper Bag top-up target of 4,500 is 31x daily sales in 1 shop", "31x", "daily sales", "lower the target"),
    ("opp", None, "2 shops", "Paper Bag top-up target of 2,500 is 31x daily sales in 2 shops", "31x", "daily sales", "lower the target"),
]


def find_row(f: tuple, hover: bool = False) -> str:
    sev, name, hood, what, amt, small, more = f
    if name:
        s = site_of(name, hood)
        site = (f'<span class="site"><span class="hood">{s[0]}</span>{sitelink(name, s[4], "hov" if hover else "")}{mapbtn(short(s))}</span>')
    else:
        site = f'<span class="site">{"Company" if not hood else hood}</span>'
    return (f'<div class="find {sev}"><span class="mark" data-tip="Silence this finding"></span>{site}<span class="what">{what}</span>'
            f'<span class="amt">{amt}{f"<small>{small}</small>" if small else ""}</span><span class="go">{svg("go")}</span>'
            + (f'<span class="more">{more}</span>' if more else "") + "</div>")


def alerts(n: int, hover: int = -1) -> str:
    head = (f'<div class="sechead"><h2>Needs attention</h2><span class="why" tabindex="0"><i>?</i></span><div class="aside">'
            f'<span class="sev crit"><i></i>0</span><span class="sev watch"><i></i>6</span><span class="sev opp"><i></i>7</span>'
            f'<button type="button" class="ibtn tr" aria-label="Which kinds make the list">{svg("tune")}</button></div></div>')
    rows = "".join(find_row(f, hover=k == hover) for k, f in enumerate(TODAY_FINDS[:n]))
    more = f"{len(TODAY_FINDS) - n} more · " if n < len(TODAY_FINDS) else ""
    return (f'<section class="sec" id="alertSection">{head}<div class="finds">{rows}</div>'
            f'<p class="quiet" style="margin:12px 0 0">{more}19 smaller · $139,088/day · 18 switched off &nbsp;<a class="link" href="#">show</a></p></section>')


def moves(collapsed: bool = False) -> str:
    aside = (f'<div class="aside"><a class="ss-askmini" href="#" aria-label="Ask the board (press /)"><i></i>Ask the board<span class="ss-kbd">/</span></a></div>'
             if collapsed else "")
    return f"""<section class="sec" id="secMoves">
  <div class="sechead"><h2>Next moves</h2><span class="why" tabindex="0"><i>?</i></span>{aside}</div>
  <div class="moves">
    <a class="move" href="#"><span class="soon">CHECKLIST</span><span class="ic">{svg("cal")}</span><b>Plan imports</b><span class="what">Plan weekly orders and get a checklist of settings to enter in-game.</span><span class="go">Opens the change checklist</span></a>
    <a class="move" href="#"><span class="soon live">DATA COMPLETE</span><span class="ic">{svg("people")}</span><b>Optimize staffing</b><span class="what">Demand data complete at [GD] HART. Clothing and 8 more: switch to the demand plan.</span><span class="go">Opens [GD] HART. Clothing › Staffing</span></a>
    <a class="move" href="#"><span class="soon live">185 VACANT</span><span class="ic">{svg("pin")}</span><b>Find a location</b><span class="what">185 vacant retail units right now. Best foot traffic: 30 Seventh Avenue, The Hamptons (52).</span><span class="go">Opens the finder on the map</span></a>
  </div>
</section>"""


def ask_strip(hover: int = -1) -> str:
    qs = "".join(f'<a class="ss-aq{" hov" if k == hover else ""}" href="#" data-k="{k}">{esc(q)}</a>' for k, (q, *_rest) in enumerate(QUESTIONS))
    return (f'<nav class="ss-ask" aria-label="Ask the board"><span class="ss-asklead"><i></i>Ask the board</span>{qs}'
            f'<span class="ss-roll"></span></nav>')


def today_body(n: int = 13, ask: str = "strip", hover_q: int = -1, hover_find: int = -1) -> str:
    return (f'<div class="page">{kpis()}{alerts(n, hover_find)}{moves(collapsed=ask == "mini")}'
            + (ask_strip(hover_q) if ask == "strip" else "") + "</div>")


# --------------------------------------------------------------------------
# the artboards
# --------------------------------------------------------------------------
def b_shop() -> str:
    return addr("#site/57-fifth-avenue") + '<div class="wrap">' + masthead("company") + shop_page() + "</div>"


def b_factory() -> str:
    return addr("#site/6-24th-street") + '<div class="wrap">' + masthead("company") + factory_page() + "</div>"


def b_shop_phone() -> str:
    return addr("#site/57-fifth-avenue") + '<div class="wrap">' + masthead("company", phone=True) + shop_page(phone=True) + "</div>"


def b_factory_phone() -> str:
    return addr("#site/6-24th-street") + '<div class="wrap">' + masthead("company", phone=True) + factory_page(phone=True) + "</div>"


def b_links() -> str:
    """Every name of a site, wherever the board prints it, opens that site's page."""
    today = "".join(find_row(f, hover=k == 1) for k, f in enumerate([TODAY_FINDS[0], TODAY_FINDS[2], TODAY_FINDS[6], TODAY_FINDS[12]]))
    chk = ""
    for s, item, sells, busy in ((site_of("HART. Fittness"), "Energy Drink", 214, "Sun 227"), (site_of("HART. Fitness", "Garment District"), "Soda Can", 124, "Sun 131"),
                                 (site_of("HART. Jewelry", "Lower Manhattan"), "Jewelry (Cheap)", 61, "Fri 72")):
        chk += (f'<tr><td class="l"><span class="hood">{s[0]}</span>&nbsp; {sitelink(short(s), s[4])}{mapbtn(short(s))}<span class="sub" style="padding-left:34px">{s[2]}</span></td>'
                f'<td class="l">{item}</td><td>{sells}</td><td>{busy}</td><td>—</td><td><span class="chip bad">no plan</span></td></tr>')
    wires = ('<svg class="ss-wire" viewBox="0 0 600 150" preserveAspectRatio="none" aria-hidden="true">'
             '<path d="M180 40 C 210 40, 190 75, 220 75" stroke="var(--rule)" stroke-width="1.5" fill="none" stroke-dasharray="5 4"></path>'
             '<path d="M180 110 C 210 110, 190 75, 220 75" stroke="var(--rule)" stroke-width="1.5" fill="none" stroke-dasharray="5 4"></path>'
             '<path d="M380 75 C 405 75, 395 40, 420 40" stroke="var(--accent)" stroke-width="2" fill="none"></path>'
             '<path d="M380 75 C 405 75, 395 110, 420 110" stroke="var(--accent)" stroke-width="2" fill="none"></path></svg>')
    node = lambda code, name, held, on=False: (f'<div class="ss-node{" on" if on else ""}">{f'<span class="hood">{code}</span>' if code else ""}<span>{name}<small>{held}</small></span></div>')
    flow = f"""<div class="chartbox" style="padding:22px 24px"><div class="ss-flow">{wires}
  <div style="display:grid;gap:40px">{node("", "7 Pier", "Weekly import")}{node("", "1 Pier", "Weekly import")}</div>
  <div>{node("IC", "Factory Clothing", "33,006 held", on=True)}</div>
  <div style="display:grid;gap:40px">{node("GD", "Clothing Distr.", "13,653 held")}{node("GD", "Import Hub", "750,709 held")}</div></div>
  <div class="ss-detail"><h3><span class="hood">IC</span>{sitelink("Factory Clothing", "6 24th Street")}{mapbtn("Factory Clothing")}<a class="ss-pagego hov" href="#site/6-24th-street">{ic("page")}its page</a></h3>
  <p class="quiet" style="margin:6px 0 0">Comes in: Fabric (Expensive) and Fabric (Cheap) from Import Hub. Goes out: 8 lines of clothing to Clothing Distr.</p></div></div>"""
    mine = ""
    for s in (SITES[0], SITES[9], site_of("Clothing Distr.")):
        mine += (f'<div class="place"><span class="mark"></span><span class="hood">{s[0]}</span><span class="nm">{sitelink(short(s), s[4])}<small>{s[2]} · {s[4]}</small></span>'
                 f'<a class="ss-pagego" href="#site/{slug(s[4])}" aria-label="Open its page">{ic("page")}</a></div>')
    card = f"""<div class="ss-card"><h3>{sitelink("HART. Clothing", "57 Fifth Avenue")}</h3><div class="sub"><span class="hood">LM</span>57 Fifth Avenue · Clothing Store</div>
  <div class="nums"><div class="num"><b class="pos">$171,194</b><span>profit</span></div><div class="num"><b>$453</b><span>rent / day</span></div><div class="num"><b>26</b><span>staff</span></div></div>
  <p class="quiet" style="margin:12px 0 0;padding-right:90px">2 findings</p><a class="ss-pagego" href="#site/57-fifth-avenue">{ic("page")}its page</a></div>"""
    port = ""
    for s in SITES[:3]:
        port += (f'<tr><td class="l"><span class="hood">{s[0]}</span>&nbsp; {sitelink(short(s), s[4])} <span class="chev">{svg("chev")}</span>{mapbtn(short(s))}'
                 f'<span class="sub">{s[2]} · {s[4]}</span></td><td>${s[6]:,}</td></tr>')
    tip = '<span class="ss-tipdemo" style="left:64px;top:126px">Open its page · <b>#site/6-24th-street</b></span>'
    return addr("#today · #supply/checks · #map") + f"""<div class="wrap">{masthead("today")}
<div style="margin-top:36px"><h2 class="ss-lead">Every name of a site is a way to its page</h2>
<p>The name opens the site's page; the map button beside it still opens the map; the rest of a row still goes where it went. A name reads as plain text until the pointer is on it.</p></div>
<div class="ss-snips">
  <div class="ss-snip wide"><div class="ss-cap"><b>Today</b> · Needs attention</div>{tip}<div class="finds">{today}</div></div>
  <div class="ss-snip"><div class="ss-cap"><b>Supply › Checks</b> · Before the drop</div><div class="scrollx"><table><thead><tr><th>Shop</th><th class="l">Product</th><th>Sells / day</th><th>Busiest</th><th>Top-up</th><th>Pressure</th></tr></thead><tbody>{chk}</tbody></table></div></div>
  <div class="ss-snip"><div class="ss-cap"><b>Supply › Goods flow</b> · a site picked</div>{flow}</div>
  <div class="ss-snip"><div class="ss-cap"><b>Map</b> · your businesses, and a card</div><div style="display:grid;grid-template-columns:1fr 300px;gap:24px;align-items:start"><div class="ss-places">{mine}</div>{card}</div></div>
  <div class="ss-snip"><div class="ss-cap"><b>Company › Portfolio</b> · a row now goes to the address</div><table><thead><tr><th>Business</th><th>Profit</th></tr></thead><tbody>{port}</tbody></table></div>
</div></div>"""


def b_pal_empty() -> str:
    return '<div class="wrap">' + masthead("today", searching=True) + today_body(9, ask="mini") + "</div>" + palette("", "empty")


def b_pal_fab() -> str:
    return '<div class="wrap">' + masthead("today", searching=True) + today_body(9, ask="mini") + "</div>" + palette("fab")


def b_pal_hire() -> str:
    return '<div class="wrap">' + masthead("company", searching=True) + '<div class="page">' + kpis() + alerts(9) + "</div></div>" + palette("hire")


def b_pal_none() -> str:
    return '<div class="wrap">' + masthead("supply", searching=True) + '<div class="page">' + kpis() + alerts(9) + "</div></div>" + palette("zeppelin", "none")


def b_pal_phone() -> str:
    return '<div class="wrap">' + masthead("today", phone=True) + today_body(4) + "</div>" + sheet("gym")


def b_pal_live() -> str:
    """Every entry is in the markup; the script only hides, orders and marks them."""
    names = dict(GROUPS)
    groups = ""
    for gid, _ in GROUPS:
        rows = "".join(result_row(e, "", "", "").replace('class="ss-row"', f'class="ss-row" data-t="{esc(e["t"])}" data-p="{esc(e["p"])}" '
                                                                           f'data-syn="{esc("|".join(e["syn"]))}" data-kw="{esc("|".join(e["kw"]))}"', 1)
                       for e in INDEX if e["g"] == gid)
        groups += f'<div class="ss-grp" data-g="{gid}" hidden=""><div class="ss-gh">{names[gid]}<em></em></div>{rows}</div>'
    empty = (f'<div class="ss-empty"><div class="ss-grp"><div class="ss-gh">Ask the board</div>{question_rows()}</div>'
             f'<div class="ss-grp"><div class="ss-gh">Where you were</div>{recent_rows()}</div>'
             '<p class="ss-hint">Try <b>fab</b>, <b>hire</b>, <b>gym</b>, <b>debt</b>, <b>difficulty</b>, <b>floor size</b> or <b>break even</b>.</p></div>')
    none = (f'<div class="ss-none" hidden=""><div class="ss-ball"><i></i></div><p>Nothing on the board or in the wiki is called <b class="ss-echo"></b>.</p>'
            f'<div class="ss-sugg"><a class="ss-chip" href="#">{ic("wiki")}Browse the wiki</a><a class="ss-chip" href="#">{ic("flag")}Tell us what you looked for</a></div></div>')
    pal = f"""<div class="ss-scrim"></div>
<div class="ss-pal" role="dialog" aria-label="Search the board">
  <div class="ss-in"><span class="ss-i ss-lens">{svg("search")}</span><input type="search" id="ssLive" aria-label="Search the board" placeholder="Search sites, products, findings, pages and the wiki" autocomplete="off"><span class="ss-count"></span><span class="ss-kbd">esc</span></div>
  <div class="ss-res">{empty}{groups}{none}</div>
  {foot('type, then <b>↑ ↓ ↵</b>')}
</div>"""
    return '<div class="wrap">' + masthead("today", searching=True) + today_body(9, ask="mini") + "</div>" + pal


def b_today_ask() -> str:
    return '<div class="wrap">' + masthead("today") + today_body(13, ask="strip", hover_q=2) + "</div>"


def b_today_used() -> str:
    return '<div class="wrap">' + masthead("today") + today_body(6, ask="mini") + "</div>"


def b_ask_landing() -> str:
    rules = [("Public prices", "×1.3"), ("Employee hourly salary", "×1.3"), ("Bank interest", "×1.3"), ("Rival attacks", "×1.5"),
             ("Base customer promotion", "×0.1"), ("Export price", "×0.1"), ("Resale value", "×0.5"), ("Wholesale urgent fee", "×2"),
             ("Importer urgent fee", "×2"), ("Tax rate", "51%")]
    chips = "".join(f'<span style="--k:{k}">{n}<b>{v}</b></span>' for k, (n, v) in enumerate(rules))
    miles = [("Every business type run", "5 / 24", False), ("Every building owned", "0 / 885", False), ("Rivals taken over", "0 / 4", False),
             ("Personal goals done", "44 done", False), ("Diplomas earned", "5 / 5", True)]
    mrows = "".join(f'<div class="mile{" done" if d else ""}"><span class="box">{svg("tick")}</span>{n}<span class="c">{c}</span></div>' for n, c, d in miles)
    return addr("#secGoals") + f"""<div class="wrap">{masthead("company")}
<div class="page">
<div class="ss-asked"><span class="ic">?</span><span><small>YOU ASKED</small><br><b>What am I playing on?</b></span><span class="quiet">Company › Milestones · the game settings are lit below</span>
  <span class="go"><a href="#today">‹ Back to Today</a><a href="#">Ask another</a></span></div>
<div class="sechead subhead"><nav class="seg" aria-label="Company views"><a href="#">Results</a><a href="#">Products</a><a href="#">Payroll</a><a href="#" class="on">Milestones</a></nav></div>
<section class="sec">
  <div class="sechead"><h2>Milestones</h2><span class="why" tabindex="0"><i>?</i></span><span class="quiet">career totals · playing on custom settings, 10 settings harder than Normal, started on $0</span></div>
  <div class="miles ss-dim">{mrows}</div>
  <p class="quiet ss-dim">321,449 goods produced · $0 in tax paid</p>
  <div class="ss-lit" style="margin-top:30px"><p style="margin:0;font-size:13.5px"><b>Custom</b> <span class="quiet">· 10 settings harder than Normal, none easier · started on $0</span></p><div class="rules">{chips}</div></div>
</section>
</div></div>"""


def b_today_phone() -> str:
    return '<div class="wrap">' + masthead("today", phone=True) + today_body(5, ask="strip") + "</div>"


# --------------------------------------------------------------------------
# behaviour: every part does nothing where its elements are absent
# --------------------------------------------------------------------------
WIRE = r"""
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && (a.getAttribute('href') || '#').charAt(0) === '#') e.preventDefault(); });

    // the nav underline sits under the page you are on
    const nav = $('.nav');
    if (nav) { const ink = (a) => { if (!a) return; const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect();
        nav.style.setProperty('--nx', (r.left - n.left) + 'px'); nav.style.setProperty('--nw', r.width + 'px'); };
      const home = () => ink($('a.on', nav));
      $$('a', nav).forEach(a => a.addEventListener('mouseenter', () => ink(a))); nav.addEventListener('mouseleave', home);
      setTimeout(home, 60); setTimeout(home, 700); }

    // whatever is under the pointer reads out on the line kept for it
    $$('[data-readzone]').forEach(zone => { const out = $('.sp-readout', zone); if (!out) return; const rest = out.innerHTML;
      $$('[data-read]', zone).forEach(el => el.addEventListener('mouseenter', () => { out.innerHTML = el.dataset.read; }));
      zone.addEventListener('mouseleave', () => { out.innerHTML = rest; }); });

    // a finding lights the block that holds its evidence
    const panel = $('#sitePanel');
    $$('.sp-find').forEach(f => { const blk = $('[data-block="' + f.dataset.ev + '"]');
      f.addEventListener('mouseenter', () => { if (!panel) return; $$('.sp-lit', panel).forEach(x => x.classList.remove('sp-lit')); panel.classList.add('sp-focus'); if (blk) blk.classList.add('sp-lit'); });
      f.addEventListener('click', () => { if (blk) blk.scrollIntoView({ behavior: 'smooth', block: 'center' }); }); });

    // Ask the board: the dot rolls to the question under the pointer
    $$('.ss-ask').forEach(strip => { const ball = $('.ss-roll', strip); if (!ball) return;
      $$('.ss-aq', strip).forEach(q => q.addEventListener('mouseenter', () => {
        const r = q.getBoundingClientRect(), s = strip.getBoundingClientRect();
        ball.style.transform = 'translate(' + (r.left - s.left + r.width / 2 - 4) + 'px,' + (r.top - s.top - 16) + 'px) rotate(' + Math.round(r.left) + 'deg)'; })); });

    // the palette: the arrow keys move the lit row inside the field's own handler
    $$('.ss-pal, .ss-sheet').forEach(pal => {
      const rows = () => $$('.ss-row', pal).filter(r => !r.closest('[hidden]') && r.offsetParent !== null);
      const say = $('.ss-say', pal);
      const light = (r) => { $$('.ss-row.on', pal).forEach(x => x.classList.remove('on')); if (r) { r.classList.add('on'); r.scrollIntoView({ block: 'nearest' });
        if (say && r.dataset.land) say.innerHTML = '↵ opens <b>' + r.dataset.land.replace(/</g, '&lt;') + '</b>'; } };
      $$('.ss-row', pal).forEach(r => r.addEventListener('mouseenter', () => light(r)));
      const input = $('input', pal);
      if (!input) return;
      input.addEventListener('keydown', (e) => {
        const list = rows(), at = list.indexOf($('.ss-row.on', pal));
        if (e.key === 'ArrowDown') { e.preventDefault(); light(list[Math.min(list.length - 1, at + 1)]); }
        if (e.key === 'ArrowUp') { e.preventDefault(); light(list[Math.max(0, at - 1)]); }
        if (e.key === 'Enter') { e.preventDefault(); const r = $('.ss-row.on', pal); if (r && say) { say.innerHTML = 'opening <b>' + (r.dataset.land || '').replace(/</g, '&lt;') + '</b> …'; pal.classList.add('ss-go-now'); } }
        if (e.key === 'Escape') { input.value = ''; input.dispatchEvent(new Event('input')); } });
    });

    // the live palette: the same matching as the generator's search()
    const live = $('#ssLive');
    if (live) {
      const pal = live.closest('.ss-pal'), res = $('.ss-res', pal), count = $('.ss-count', pal);
      const empty = $('.ss-empty', pal), none = $('.ss-none', pal), echo = $('.ss-echo', pal);
      const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const rx = (q) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const markText = (t, q, ws) => { const low = t.toLowerCase(); let k = -1;
        if (ws) { const m = new RegExp('(^|[\\s(·/-])' + rx(q)).exec(low); if (m) k = m.index + m[1].length; }
        if (k < 0) k = low.indexOf(q); if (k < 0 || !q) return esc(t);
        return esc(t.slice(0, k)) + '<mark>' + esc(t.slice(k, k + q.length)) + '</mark>' + esc(t.slice(k + q.length)); };
      const score = (row, q) => { const t = row.dataset.t.toLowerCase(), p = row.dataset.p.toLowerCase();
        const syn = row.dataset.syn ? row.dataset.syn.split('|') : [], kw = row.dataset.kw ? row.dataset.kw.split('|') : [];
        if (t.startsWith(q)) return [100, 't'];
        if (new RegExp('(^|[\\s(·/-])' + rx(q)).test(t)) return [85, 't'];
        if (t.includes(q)) return [60, 't'];
        for (const s of syn) if (s.startsWith(q) || (q.length >= 4 && s.includes(q))) return [70, 'syn', s];
        if (row.closest('[data-g="sites"]') && kw.some(k => k.toLowerCase().startsWith(q))) return [75, 'p'];
        if (q.length >= 3 && (new RegExp('(^|[\\s(·/-])' + rx(q)).test(p) || kw.some(k => k.toLowerCase().startsWith(q)))) return [40, 'p'];
        return [0]; };
      const order = ['views', 'sites', 'products', 'kinds', 'finder', 'wiki'], bias = { sites: 10, wiki: -15 };
      const run = () => {
        const q = live.value.trim().toLowerCase(); let total = 0; const shown = [];
        $$('.ss-grp[data-g]', res).forEach(g => {
          const hits = [];
          $$('.ss-row', g).forEach(r => { const [s, where, syn] = q ? score(r, q) : [0];
            const t = $('.t', r), p = $('.p', r);
            t.innerHTML = where === 't' ? markText(r.dataset.t, q) : esc(r.dataset.t);
            if (where === 'syn') t.innerHTML += '<span class="ss-syn"><b>≈</b> ' + markText(syn, q) + '</span>';
            p.innerHTML = where === 'p' ? markText(r.dataset.p, q, true) : esc(r.dataset.p);
            r.hidden = true; if (s) hits.push([s, r]); });
          hits.sort((a, b) => b[0] - a[0]);
          hits.forEach(([s, r], k) => { g.appendChild(r); r.hidden = k >= 4; });
          const more = $('.ss-more', g); if (more) more.remove();
          if (hits.length > 4) { const m = document.createElement('a'); m.className = 'ss-more'; m.href = '#'; m.textContent = (hits.length - 4) + ' more ›'; g.appendChild(m); }
          $('.ss-gh em', g).textContent = hits.length > 4 ? '4 of ' + hits.length : (hits.length || '');
          g.hidden = !hits.length; total += hits.length; if (hits.length) shown.push([hits[0][0] + (bias[g.dataset.g] || 0), order.indexOf(g.dataset.g), g]); });
        shown.sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, , g]) => res.insertBefore(g, none));
        empty.hidden = !!q; none.hidden = !q || total > 0; if (echo) echo.textContent = live.value.trim();
        count.textContent = q ? total + ' found' : '';
        const say = $('.ss-say', pal); if (say) say.innerHTML = total ? '' : (q ? 'nothing to open' : 'type, then <b>↑ ↓ ↵</b>');
        $$('.ss-row.on', pal).forEach(x => x.classList.remove('on'));
        const first = $$('.ss-row', res).find(r => !r.hidden && !r.closest('[hidden]')); if (first) first.dispatchEvent(new Event('mouseenter'));
      };
      live.addEventListener('input', run);
      setTimeout(() => { try { live.focus({ preventScroll: true }); } catch (e) {} }, 300);
      run();
    }
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
<div class="board {{theme}} __KIND__" style="width: __W__px; height: __H__px;">
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
<body style="margin:0;background:#888"><div class="board __THEME__ __KIND__" style="width:__W__px;min-height:__H__px">
__BODY__
</div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""

D, PH = 1440, 390
# file, title, builder, width, height, row, note
BOARDS = [
    ("Main.dc.html", "R9 · Shop page at its own address", b_shop, D, 2760, 0,
     "The site page on its own route, #site/57-fifth-avenue, opened from the portfolio. Company stays lit in the nav. The chart, rhythm and portfolio are gone while it is up; ‹ Portfolio goes back to them, and the prev / select / next picker moved out of the head into the crumb row. The blocks below are the live panel, unchanged. A reload keeps it open. The supplier in the sub-line is a link to its own page now."),
    ("SiteFactory.dc.html", "R9 · Factory page, arrived from a finding", b_factory, D, 1780, 0,
     "Arrived from Today's 'Fabric (Expensive)' row. The back crumb names where you came from (‹ Today, browser Back), the trail still names the portfolio. The finding opens as .arrived, Inputs is lit and the other blocks dim, as the site-panel canvas has it; 'From: Import Hub' is a link to the warehouse's page."),
    ("SitePhone.dc.html", "R9 · Shop page, phone", b_shop_phone, PH, 4480, 0,
     "On a phone the crumb row sticks under the masthead: ‹ Portfolio, then the picker as ‹ select ›. Tiles pair up, the two-column blocks stack, the hour grid and the day plan scroll sideways inside their own box, never the page."),
    ("SiteFactoryPhone.dc.html", "R9 · Factory page, phone, arrived", b_factory_phone, PH, 2180, 0,
     "The same arrival on a phone. The lines table keeps a readable width and scrolls inside its box."),
    ("SiteLinks.dc.html", "R9 · Every site name is a link", b_links, D, 1260, 0,
     "Where names become links: Today's finding rows (the row still opens its details, the name opens the page, the map button stays), Supply › Checks rows, the Goods flow node you picked, the map's own list and card, and the portfolio row. Hover shows the address the link goes to."),
    ("PaletteEmpty.dc.html", "R10 · Search, empty: the questions", b_pal_empty, D, 1060, 1,
     "The field sits in the masthead between the nav and the clock; / or Ctrl+K opens it anywhere. Empty, it offers the Ask-the-board questions and the last three places you opened, so it is useful before a word is typed."),
    ("PaletteFab.dc.html", "R10 · Search, typing 'fab'", b_pal_fab, D, 1060, 1,
     "Grouped, best group first, the lit row answers Enter. Fabric (Expensive) is a product, and also why Factory Clothing (it eats Fabric) and Feed the factories (2 Fabric inputs short) come up: a match in the second line is marked where it is. Amber dots are live findings; the map button on a site row works as it does elsewhere."),
    ("PaletteHire.dc.html", "R10 · Search, a synonym: 'hire'", b_pal_hire, D, 1060, 1,
     "The game has no 'hire' page, so the words players use reach the view that answers them, and the row says so: hire → Staffing. The same for debt → Cash on hand, difficulty → Game settings, prices → Prices in your save, floor size → Find a location, break even → Portfolio."),
    ("PaletteNone.dc.html", "R10 · Search, nothing found", b_pal_none, D, 1060, 1,
     "Nothing on the board or in the wiki: the sphere looks left and right and shrugs. A near word, the wiki, and a way to tell us what was missing; the questions stay under it."),
    ("PalettePhone.dc.html", "R10 · Search on a phone, 'gym'", b_pal_phone, PH, 844, 1,
     "On a phone the masthead's search button opens a full-screen sheet: the field on top with Cancel, rows 56 px tall, three a group."),
    ("PaletteLive.dc.html", "R10 · Search, working", b_pal_live, D, 1060, 1,
     "This one works: type anything (try fab, hire, gym, debt, difficulty, floor size, break even, zeppelin). Arrow keys move the lit row, Enter shows where it would open, Esc clears. The index and the matching are the generator's own, so the drawn states and this one agree."),
    ("TodayAsk.dc.html", "R11 · Ask the board on Today", b_today_ask, D, 1700, 2,
     "One quiet row under Next moves, not a card grid: seven questions as links, each landing on the view that answers it with the answer lit. The green dot rolls to the question under the pointer. The row goes away after the first question is used (next artboard)."),
    ("TodayUsed.dc.html", "R11 · After first use", b_today_used, D, 1200, 2,
     "Once a question has been used, the row folds into one button in the Next moves head. It opens search on its empty state, which holds the same questions."),
    ("AskLanding.dc.html", "R11 · Where a question lands", b_ask_landing, D, 800, 2,
     "'What am I playing on?' lands on Company › Milestones with the game settings lit and the rest dimmed. The question stays in a strip on top with the way back, so the player knows why they are here."),
    ("TodayPhone.dc.html", "R11 · Today on a phone", b_today_phone, PH, 1900, 2,
     "On a phone the questions are one row of pills that scrolls sideways. The search button in the masthead is the palette's way in."),
]
ROW_TITLES = ["R9 · Every site has a page, with an address", "R10 · One search for the whole board", "R11 · Ask the board"]


def css(theme: str) -> str:
    return themed(live_css()) + SS_CSS


def build(out_root: Path, preview: Path | None = None) -> None:
    root = out_root / "project"
    root.mkdir(parents=True, exist_ok=True)
    style = css("dark")
    boards, order, notes = {}, [], {}
    rows: dict[int, list] = {}
    for b in BOARDS:
        rows.setdefault(b[5], []).append(b)
    y = 0
    for r in sorted(rows):
        x = 0
        notes[f"row{r}"] = {"x": 0, "y": y - 560, "text": ROW_TITLES[r], "kind": "title1", "maxW": 4000}
        for name, title, builder, w, h, _, note in rows[r]:
            body = builder()
            kind = "phone" if w < 800 else "desk"
            props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"}, "$preview": {"width": w, "height": h}}
            page = (PAGE.replace("__TITLE__", "Big Copilot: " + title).replace("__FONTS__", FONTS.replace("&", "&amp;"))
                    .replace("__CSS__", style).replace("__KIND__", kind).replace("__W__", str(w)).replace("__H__", str(h))
                    .replace("__BODY__", body).replace("__PROPS__", json.dumps(props, separators=(",", ":"), ensure_ascii=False).replace("'", "&#39;"))
                    .replace("__LOGIC__", LOGIC))
            (root / name).write_text(page, encoding="utf-8", newline="\n")
            if preview:
                preview.mkdir(parents=True, exist_ok=True)
                for theme in ("dark", "light"):
                    (preview / f"{name.split('.')[0]}-{theme}.html").write_text(
                        PREVIEW.replace("__TITLE__", title).replace("__FONTS__", FONTS.replace("&", "&amp;")).replace("__CSS__", style)
                        .replace("__THEME__", theme).replace("__KIND__", kind).replace("__W__", str(w)).replace("__H__", str(h))
                        .replace("__BODY__", body).replace("__WIRE__", WIRE), encoding="utf-8", newline="\n")
            boards[name] = {"x": x, "y": y, "w": w, "h": h, "title": title, "is_interactive": True}
            order.append(name)
            notes["try-" + name.split(".")[0].lower()] = {"x": x, "y": y - 330, "w": min(560, w), "maxH": 250, "text": note}
            x += w + 120
        y += max(b[4] for b in rows[r]) + 820
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Site pages and search",
             "launch": {"view": "canvas"}, "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (root / "canvas.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards to", root)


if __name__ == "__main__":
    args = sys.argv[1:]
    out = Path(args[args.index("--out") + 1]) if "--out" in args else HERE
    prev = Path(args[args.index("--preview") + 1]) if "--preview" in args else None
    build(out, prev)
