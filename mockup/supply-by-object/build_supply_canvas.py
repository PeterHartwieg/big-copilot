"""Generates the Supply-by-object canvas: project/*.dc.html and project/canvas.json.

The brief is R13 of the UX audit (research/ux-audit-2026-09-24/ux-audit.md, outside the
repo): Supply regrouped by the thing it is about (Shops, Warehouses, Factories) instead of
by check, the change checklist folded into those same rows as a tick column, and one
verdict word per supply fact (R8). NOTES.md beside this file holds the decisions and the
porting map.

The board's own stylesheet comes from mockup/revamp/build_canvas.py and the site panel's
from mockup/site-panel/build_site_canvas.py, both of which the live board already carries,
so the rail, the machine squares and the tick look the same here as on a depot or factory
page. Every class added here carries the sb- prefix. The figures are typed in below: they
are modelled on the HART. YT save of day 73, with five states seeded so every verdict
shows (NOTES.md lists them). Nothing is read from a save at build time.

Never hand-edit project/: change this and rerun. `--preview DIR` also writes plain HTML
copies (dark and light) into DIR for checking in a browser; keep DIR outside the repo.
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
sys.path.insert(0, str(HERE.parent / "site-panel"))
from build_canvas import CSS as BOARD_CSS  # noqa: E402
from build_site_canvas import SP_CSS, P as SP_ICONS  # noqa: E402

CREATED_AT = "2026-09-24T12:00:00Z"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"

# --------------------------------------------------------------------------
# the page's own additions, all under sb-
# --------------------------------------------------------------------------
SB_CSS = r"""
.board{min-height:0}
.board.phone{min-width:0}
.feature-new{display:inline-block;flex:none;margin-left:6px;padding:2px 5px;border-radius:4px;background:var(--accent-soft);color:var(--accent);font:600 9px/1.2 "IBM Plex Mono",monospace;letter-spacing:.04em;text-transform:uppercase;vertical-align:middle}
.sb-i{display:inline-grid;place-items:center;flex:none}
.sb-i svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
button{font:inherit;color:inherit}

/* the three objects, with what each still needs ------------------------------ */
.sb-sub{display:flex;align-items:center;gap:14px;margin-top:28px}
.sb-sub .aside{margin-left:auto;display:flex;gap:10px;align-items:center}
.sb-tabs a{display:inline-flex;align-items:center;gap:8px;padding:7px 12px 7px 11px}
.sb-tabs a svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.sb-tabs a:hover svg{transform:translateY(-2px) rotate(-8deg)}
.sb-n{display:inline-grid;place-items:center;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:var(--neg);color:#fff;font:600 10.5px/1 "IBM Plex Mono",monospace;transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.sb-n.bump{transform:scale(1.35)}
.sb-n.zero{background:var(--accent-soft);color:var(--accent);padding:0}
.sb-n.zero svg{width:11px;height:11px;stroke-width:2.6}
.seg a.on .sb-n.zero{background:var(--accent);color:var(--ground)}
.sb-view a{display:inline-grid;place-items:center;width:34px;padding:6px 0}
.sb-view a svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}

/* the checklist, now one line for the whole page: a road, a truck, a copy ------ */
.sb-tray{display:flex;align-items:center;gap:16px;margin-top:18px;padding:9px 10px 9px 16px;border:1px solid var(--rule-soft);border-radius:10px;background:var(--surface)}
.sb-tray .lab{font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);white-space:nowrap}
.sb-tray .txt{font:500 12.5px/1.2 "IBM Plex Mono",monospace;color:var(--ink-2);white-space:nowrap}
.sb-tray .txt b{color:var(--ink);font-weight:500}
.sb-road{position:relative;flex:1;min-width:120px;height:26px}
.sb-road::before{content:"";position:absolute;left:0;right:22px;top:17px;border-top:2px dashed var(--rule)}
.sb-road>i{position:absolute;left:0;top:17px;height:2px;background:var(--accent);border-radius:2px;width:calc((100% - 22px) * var(--p));transition:width .7s cubic-bezier(.2,.7,.2,1)}
.sb-road .trk{position:absolute;top:2px;left:calc((100% - 22px) * var(--p) - 10px);color:var(--ink);transition:left .7s cubic-bezier(.34,1.56,.64,1)}
.sb-road .trk svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.sb-road .home{position:absolute;right:0;top:3px;color:var(--ink-3)}
.sb-road .home svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.sb-tray:hover .sb-road .trk svg{animation:sp-drive .45s ease-in-out infinite}
.sb-tray.done .sb-road .trk{color:var(--accent)}
.sb-tray.done .sb-road .home{color:var(--accent);animation:sb-honk .6s ease-in-out 2}
@keyframes sb-honk{30%{transform:translateY(-4px) rotate(-8deg)}60%{transform:translateY(0) rotate(6deg)}}
.sb-tray .btn2 small{font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sb-tray .btn2.copied{border-color:var(--accent);color:var(--accent)}
.sb-tabdots{display:flex;gap:10px;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sb-tabdots span{display:inline-flex;align-items:center;gap:5px}
.sb-tabdots svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

/* the one line that says what the tab found ------------------------------------ */
.sb-verdict{display:flex;align-items:baseline;gap:10px;margin:22px 0 14px;font-size:13.5px;color:var(--ink-2);flex-wrap:wrap}
.sb-verdict b{color:var(--ink);font-weight:600}
.sb-verdict .check{flex:none;align-self:center}
.sb-crumb{display:inline-flex;align-items:center;gap:6px;margin-left:auto;padding:3px 4px 3px 10px;border-radius:14px;background:var(--accent-soft);color:var(--accent);font:500 11.5px/1 "IBM Plex Mono",monospace;white-space:nowrap}
.sb-crumb button{width:20px;height:20px;border:0;border-radius:50%;background:none;color:inherit;display:grid;place-items:center;cursor:pointer}
.sb-crumb button:hover{background:var(--accent-soft)}
.sb-crumb svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round}

/* rows: a tick, the object, its numbers, the setting to type, one word ------------ */
.sb-t{table-layout:auto}
.sb-t.fixed{table-layout:fixed}
.sb-t td.nm,.sb-t th.nm{white-space:normal}
.sb-t td{vertical-align:middle}
.sb-t th.sb-tk,.sb-t td.sb-tk{width:34px;padding-left:6px;padding-right:0}
.sb-t td.st{white-space:normal;min-width:190px;max-width:290px;text-align:left}
.sb-t td.nm{white-space:normal}
.sb-t tr.sb-ev{display:none}
.board.sb-every .sb-t tr.sb-ev{display:table-row;animation:rowin .3s ease}
.board.sb-every .sb-only{display:none}
.board:not(.sb-every) .sb-evonly{display:none}
.sb-t tr.sb-kid{display:none}
.sb-t.open-kids tr.sb-kid{display:table-row;animation:rowin .3s ease}
.sb-t tr.sb-edge td{border-top:1px dashed var(--rule)}
.sb-t tr.sb-edge ~ tr.sb-edge td{border-top-style:none}
.sb-t tr.sb-lit td{background:var(--accent-soft)}
.sb-t tr.sb-arrived td{background:var(--surface)}
.sb-t tr.sb-arrived td.sb-tk{box-shadow:inset 3px 0 0 var(--accent)}
.sb-t tr.sb-arrived .sb-v{animation:sb-ping 1.6s ease-out infinite}
@keyframes sb-ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--info) 55%,transparent)}100%{box-shadow:0 0 0 9px transparent}}
.sb-t tr.sb-done td:not(.sb-tk){opacity:.42}
.sb-t tr.sb-done .sb-chg b{text-decoration:line-through;text-decoration-thickness:1.5px}
.sb-t th button.supply-sort{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.sb-t th button.supply-sort:hover{color:var(--ink)}
.sb-t th button.supply-sort:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
.sb-t th[data-dir] button{color:var(--ink)}
.sb-t th .arr{display:inline-block;width:8px;opacity:0}
.sb-t th[data-dir] .arr{opacity:1}
.sb-t th[data-dir="desc"] .arr::before{content:"\2193"}
.sb-t th[data-dir="asc"] .arr::before{content:"\2191"}
.sb-more{display:flex;gap:14px;align-items:center;margin:12px 0 0;font-size:12.5px;color:var(--ink-3)}

/* the tick: same as the checklist's, now at the head of the row ------------------ */
.sb-tick{width:22px;height:22px;border-radius:50%;border:1px solid var(--ink-3);background:none;display:grid;place-items:center;color:var(--sp-on,#08130d);cursor:pointer;padding:0;transition:transform .25s cubic-bezier(.34,1.56,.64,1),background .2s,border-color .2s}
.sb-tick svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:24;stroke-dashoffset:24;transition:stroke-dashoffset .28s ease}
.sb-tick:hover{border-color:var(--accent);transform:scale(1.12)}
.sb-tick:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.sb-done .sb-tick{background:var(--accent);border-color:var(--accent)}
.sb-done .sb-tick svg{stroke-dashoffset:0}
.sb-done .sb-tick{animation:pop .4s cubic-bezier(.34,1.56,.64,1)}

/* the setting, where the change is typed: now, arrow, set --------------------- */
.sb-chg{display:inline-flex;align-items:baseline;gap:6px;white-space:nowrap}
.sb-chg s{color:var(--ink-3);text-decoration:none}
.sb-chg .to{color:var(--ink-3);display:inline-grid;align-self:center}
.sb-chg .to svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.sb-chg b{color:var(--accent);font-weight:600}
.sb-chg small{font-size:10.5px;color:var(--ink-3)}
.sb-uses{border-bottom:1px dotted var(--ink-3);cursor:help}
.sb-rated{display:inline-block;margin-left:6px;padding:0 5px;border-radius:3px;box-shadow:inset 0 0 0 1px var(--warn);color:var(--warn);font:500 9.5px/1.6 "IBM Plex Mono",monospace;letter-spacing:.04em;vertical-align:1px;cursor:help}
.sb-in{width:70px;padding:3px 6px;border:1px solid var(--rule);border-radius:5px;background:var(--ground);color:var(--accent);font:600 13.5px/1.3 "IBM Plex Mono",monospace;text-align:right}
.sb-in:hover{border-color:var(--ink-3)}
.sb-in:focus{outline:2px solid var(--accent);outline-offset:1px}
td .sub.r{text-align:right}

/* one word per fact ------------------------------------------------------------ */
.sb-v{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:4px;font:500 11px/1.5 "IBM Plex Mono",monospace;letter-spacing:.02em;white-space:nowrap;cursor:default}
.sb-v svg{width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.sb-v.ok{background:var(--accent-soft);color:var(--accent)}
.sb-v.warn{background:#f0913a22;color:var(--warn)}
.sb-v.bad{background:#ff625722;color:var(--neg)}
.sb-v.plan{box-shadow:inset 0 0 0 1px var(--neg);color:var(--neg);background:none}
.sb-v.idle{background:color-mix(in srgb,var(--info) 16%,transparent);color:var(--info)}
.sb-v.new{box-shadow:inset 0 0 0 1px var(--rule);color:var(--ink-3);background:none}
.sb-v.made{background:var(--raised);color:var(--ink-2)}
.sb-why{display:block;margin-top:4px;font:400 12px/1.35 Archivo,sans-serif;color:var(--ink-3)}
.sb-why a{color:var(--ink-2);border-bottom:1px solid var(--rule);text-decoration:none}
.sb-why a:hover{color:var(--ink)}
tr:hover .sb-v.idle svg{animation:sp-zz 1.2s ease-in-out infinite}
tr:hover .sb-v.bad svg,tr:hover .sb-v.plan svg{animation:sp-wiggle .5s ease-in-out}

/* a site's name is a way to its page, the pin a way to the map ---------------- */
.sb-site{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.sb-site a.nm{color:var(--ink);text-decoration:none;border-bottom:1px solid transparent;transition:border-color .15s}
.sb-site a.nm:hover{border-bottom-color:var(--ink-3)}
.sb-map{width:22px;height:22px;border-radius:5px;border:1px solid var(--rule);background:var(--surface);display:grid;place-items:center;color:var(--ink-3);cursor:pointer;padding:0}
.sb-map:hover{color:var(--ink);border-color:var(--ink-3)}
.sb-map svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

/* a pressure gauge for a daily round, the week's rail for a weekly import ------- */
.sb-g{display:inline-flex;align-items:center;gap:8px}
.sb-g .tr{position:relative;width:64px;height:4px;border-radius:3px;background:var(--rule);overflow:visible}
.sb-g .tr i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--accent);width:min(100%,var(--w))}
.sb-g .tr u{position:absolute;left:calc(var(--m,100%) - 1.5px);top:-3px;height:10px;border-right:1.5px solid var(--ink-3)}
.sb-g.bad .tr u{border-right-color:var(--ink)}
.sb-g.warn .tr i{background:var(--warn)}.sb-g.bad .tr i{background:var(--neg)}
.sb-g b{font-weight:500;min-width:34px;text-align:right}
.sb-g.bad b{color:var(--neg)}
.sb-g.none .tr{background:none;border:1px dashed var(--neg);height:6px;box-sizing:border-box}
.sb-rail .sp-rail{grid-template-columns:repeat(7,14px);gap:2px}
.sb-rail .sp-rail .trk{left:calc(var(--d)*16px - 1px)}
.sb-rail .sp-rail .trk svg{width:14px;height:14px}
.sb-days{display:inline-grid;grid-template-columns:repeat(7,14px);gap:2px;text-align:center;font:500 9px/1 "IBM Plex Mono",monospace;color:var(--ink-3);letter-spacing:0}
.sb-days b{font-weight:500}.sb-days b.now{color:var(--ink)}

/* a warehouse or factory: one head, its rows under it ------------------------- */
.sb-obj{margin-top:18px;border-top:1px solid var(--rule)}
.sb-obj>summary{list-style:none;display:grid;grid-template-columns:auto minmax(0,1fr) auto auto 28px;gap:18px;align-items:center;padding:14px 4px 14px 0;cursor:pointer}
.sb-obj>summary::-webkit-details-marker{display:none}
.sb-obj .ic{width:34px;height:34px;border-radius:9px;background:var(--raised);display:grid;place-items:center;color:var(--ink-2);transition:transform .3s cubic-bezier(.34,1.56,.64,1),color .2s}
.sb-obj .ic svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.sb-obj>summary:hover .ic{color:var(--accent);transform:rotate(-8deg) scale(1.06)}
.sb-obj.fac>summary:hover .ic svg{animation:sp-spin 2.4s linear infinite}
.sb-obj .who{display:flex;flex-direction:column;gap:4px;min-width:0}
.sb-obj .who .sb-site{font-size:15px;font-weight:600}
.sb-obj .who .sb-site .go{font:500 11.5px/1 Archivo,sans-serif;color:var(--ink-3);text-decoration:none;margin-left:4px}
.sb-obj .who .sb-site .go:hover{color:var(--accent)}
.sb-obj .how{font-size:12.5px;color:var(--ink-3);display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center}
.sb-obj .how span{display:inline-flex;align-items:center;gap:6px}
.sb-obj .how b{color:var(--ink-2);font-weight:500}
.sb-obj .how em{font-style:normal}
.sb-obj .how .sb-i svg{width:13px;height:13px}
.sb-stats{display:flex;gap:26px}
.sb-stat{display:flex;flex-direction:column;gap:6px;text-align:right;cursor:default}
.sb-stat .lab{font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.sb-stat .v{font:500 17px/1 "IBM Plex Mono",monospace;letter-spacing:-.01em}
.sb-stat .v small{font-size:11px;color:var(--ink-3);margin-left:4px;letter-spacing:0}
.sb-stat.take .v{color:var(--ink)}
.sb-obj .cnt{font:500 11.5px/1 "IBM Plex Mono",monospace;color:var(--ink-3);white-space:nowrap}
.sb-obj .cnt.red{color:var(--neg)}
.sb-obj .tog{width:26px;height:26px;border-radius:50%;border:1px solid var(--rule);display:grid;place-items:center;color:var(--ink-3);transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.sb-obj .tog svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.sb-obj[open] .tog{transform:rotate(90deg)}
.sb-obj>.body{padding:0 0 10px 52px}
.sb-obj.lit{outline:1px solid var(--accent);outline-offset:6px;border-radius:6px}
.sb-part{margin:14px 0 6px;font:500 10.5px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);display:flex;gap:10px;align-items:center}
.sb-part .why{text-transform:none;letter-spacing:0}
.sb-clear{display:flex;align-items:center;gap:10px;padding:12px 0;font-size:13px;color:var(--ink-3);border-bottom:1px solid var(--rule-soft)}
.sb-clear .check{flex:none}
.sb-flat{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:18px;align-items:center;padding:13px 4px 13px 0;border-top:1px solid var(--rule);font-size:13px;color:var(--ink-3)}
.sb-flat .ic{width:34px;height:34px;border-radius:9px;background:var(--raised);display:grid;place-items:center;color:var(--ink-3)}
.sb-flat .ic svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.sb-flat .sb-site{font-size:14px;font-weight:600;color:var(--ink-2)}
.sb-flat .sb-site a.nm{color:var(--ink-2)}

/* bundle rows: one cause, one line -------------------------------------------- */
.sb-kids{display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:1px 7px;border-radius:10px;border:1px solid var(--rule);background:none;color:var(--ink-2);font:500 11px/1.5 "IBM Plex Mono",monospace;cursor:pointer}
.sb-kids:hover{border-color:var(--ink-3);color:var(--ink)}
.sb-kids svg{width:10px;height:10px;stroke:currentColor;fill:none;stroke-width:2.2;transition:transform .25s}
.open-kids .sb-kids svg{transform:rotate(90deg)}
tr.sb-kid td.nm{padding-left:26px;color:var(--ink-2)}

/* a factory's day: one cell an hour; staffed, needed, spare -------------------- */
.sb-day{display:inline-grid;grid-template-columns:repeat(24,5px);gap:1px;height:14px;vertical-align:middle;cursor:default}
.sb-day i{display:block;border-radius:1px;background:var(--rule-soft)}
.sb-day i.on{background:var(--accent)}
.sb-day i.slack{background:repeating-linear-gradient(135deg,var(--accent) 0 1.5px,transparent 1.5px 3.5px);opacity:.75}
.sb-day i.miss{background:none;box-shadow:inset 0 0 0 1px var(--neg)}
tr:hover .sb-day i.on{animation:sb-tick 1.2s steps(1) infinite;animation-delay:calc(var(--k)*50ms)}
@keyframes sb-tick{50%{filter:brightness(1.35)}}
.sb-hrs{display:flex;flex-direction:column;gap:5px;align-items:flex-start}
.sb-hrs .n{font:500 12px/1 "IBM Plex Mono",monospace;color:var(--ink-2)}
.sb-hrs .n b{color:var(--ink);font-weight:500}
.sb-t .sp-mach{gap:4px}
.sb-t .sp-m{width:24px;height:24px;border-radius:6px}
.sb-t .sp-m svg{width:13px;height:13px}
.sb-t tr:hover .sp-m svg{animation:sp-spin 2.4s linear infinite}

/* an idea, not a fault: a quiet strip ------------------------------------------- */
.sb-hint{display:flex;align-items:center;gap:14px;margin-top:22px;padding:12px 16px;border-radius:10px;border:1px dashed var(--rule);font-size:13px;color:var(--ink-2)}
.sb-hint b{color:var(--ink);font-weight:600}
.sb-hint .ic{width:30px;height:30px;border-radius:50%;background:color-mix(in srgb,var(--info) 16%,transparent);color:var(--info);display:grid;place-items:center;flex:none;transition:transform .5s cubic-bezier(.34,1.56,.64,1)}
.sb-hint .ic svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sb-hint:hover .ic{transform:rotate(-25deg)}
.sb-hint .link{margin-left:auto;white-space:nowrap}

/* nothing to change: a shelf that is fine -------------------------------------- */
.sb-empty{display:grid;grid-template-columns:260px 1fr;gap:36px;align-items:center;margin-top:30px;padding:26px 30px;border-radius:12px;background:var(--surface);border:1px solid var(--rule-soft)}
.sb-empty h3{margin:0 0 8px;font-size:20px;font-weight:600;letter-spacing:-.015em}
.sb-empty p{margin:0 0 16px;font-size:13.5px;color:var(--ink-2);max-width:560px}
.sb-empty p b{color:var(--ink);font-weight:500}
.sb-empty svg.art{width:100%;height:auto;overflow:visible;cursor:default}
.sb-empty .art .shelf{stroke:var(--rule);stroke-width:2;fill:none}
.sb-empty .art .box{fill:var(--raised);stroke:var(--ink-3);stroke-width:1.2;transition:transform .45s cubic-bezier(.34,1.56,.64,1)}
.sb-empty .art .box.g{fill:var(--accent-soft);stroke:var(--accent)}
.sb-empty:hover .art .box{transform:translateY(-3px)}
.sb-empty:hover .art .box:nth-of-type(2n){transform:translateY(-5px) rotate(-2deg)}
.sb-empty .art .van{transition:transform 1.4s cubic-bezier(.2,.7,.2,1)}
.sb-empty:hover .art .van{transform:translateX(34px)}
.sb-empty .art .van path,.sb-empty .art .van circle{stroke:var(--ink-2);stroke-width:1.6;fill:var(--surface)}
.sb-empty .art .tickc{fill:var(--accent)}
.sb-empty .art .tickp{stroke:var(--sp-on,#08130d);stroke-width:2.4;fill:none;stroke-linecap:round;stroke-linejoin:round}

/* goods flow ------------------------------------------------------------------ */
.sb-flowbox{margin-top:8px;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft);padding:14px 20px 12px}
.sb-flowbox svg{width:100%;height:auto;display:block}
.sb-flowbox .flow .node{cursor:pointer}
.flow .sb-dot{stroke:var(--surface);stroke-width:2}
.flow .sb-dot.bad{fill:var(--neg)}.flow .sb-dot.warn{fill:var(--warn)}.flow .sb-dot.idle{fill:var(--info)}.flow .sb-dot.ok{fill:var(--accent)}
.flow .pipe.noplan{stroke:var(--neg);stroke-opacity:.8;stroke-dasharray:3 6}
.flow .pipe.noplan:hover{stroke-dasharray:3 6}
.flow .plab{font:500 10px "IBM Plex Mono",monospace;fill:var(--ink-3)}
.flow .plab.bad{fill:var(--neg)}
.flow .node.sb-on rect{stroke:var(--accent);stroke-width:1.5}
.sb-flowleg{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:10px;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sb-flowleg span{display:inline-flex;align-items:center;gap:7px}
.sb-flowleg i{width:9px;height:9px;border-radius:50%;display:inline-block}
.sb-flowleg u{width:22px;border-top:2px dashed var(--ink-3);display:inline-block;text-decoration:none}
.sb-flowleg u.d{border-top-style:solid}
.board:not(.sb-diag) .sb-diagonly{display:none}
.board.sb-diag .sb-listonly{display:none}
.sb-detail{margin-top:26px}
.sb-detail .head{display:flex;align-items:center;gap:12px;margin-bottom:6px}
.sb-detail .head h3{margin:0;font-size:16px;font-weight:600}
.sb-io{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:6px 0 4px}

/* one word, everywhere (R8) ---------------------------------------------------- */
.sb-voc{display:grid;grid-template-columns:380px minmax(0,1fr);gap:44px;margin-top:34px;align-items:start}
.sb-words{display:flex;flex-direction:column;border-top:1px solid var(--rule)}
.sb-word{display:grid;grid-template-columns:96px 1fr;gap:14px;align-items:baseline;padding:11px 0;border-bottom:1px solid var(--rule-soft);font-size:13px;color:var(--ink-2)}
.sb-word b{color:var(--ink);font-weight:500}
.sb-word small{display:block;margin-top:3px;font-size:11.5px;color:var(--ink-3)}
.sb-where{display:flex;flex-direction:column;gap:16px}
.sb-place{padding:14px 16px 12px;border-radius:10px;background:var(--surface);border:1px solid var(--rule-soft)}
.sb-place .tag{display:inline-flex;align-items:center;gap:7px;margin-bottom:10px;font:500 10px/1 "IBM Plex Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.sb-place .tag svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sb-place .find{padding:6px 6px 6px 0;border-bottom:none}
.sb-place table{font-size:13px}
.sb-place td,.sb-place th{padding:7px 10px}
.sb-place td.l{white-space:normal}
.sb-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.sb-place{min-width:0}
.sb-place .sb-t td.st{min-width:0}
.sb-quiet{display:flex;align-items:center;gap:10px;padding:10px 0;color:var(--ink-3);font-size:12.5px}
.sb-quiet .dash{width:30px;border-top:1px dashed var(--rule)}
.sb-node{display:inline-flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;border:1px solid var(--rule);background:var(--ground);font-size:12.5px}
.sb-node .d{width:9px;height:9px;border-radius:50%}
.sb-node small{font:400 10.5px "IBM Plex Mono",monospace;color:var(--ink-3)}

/* phone ---------------------------------------------------------------------- */
.phone .wrap{width:calc(100% - 32px)}
.phone .mast{height:auto;flex-wrap:wrap;gap:12px 10px;padding:16px 0 10px;position:static}
.phone .wordmark{font-size:22px}
.phone .clock{margin-left:auto}
.phone .clock b{font-size:13px}
.phone .clock small{font-size:9.5px}
.phone .nav{order:3;width:100%;margin:0;justify-content:space-between}
.phone .nav a{padding:9px 11px}
.phone .nav a span,.phone .nav .feature-new{display:none}
.phone .nav a.on{background:var(--raised)}
.phone .sb-sub{flex-direction:column;align-items:stretch;gap:10px;margin-top:16px}
.phone .sb-sub .aside{margin-left:0}
.phone .sb-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.phone .sb-tabs a{justify-content:center;padding:9px 4px;font-size:12px;gap:6px}
.phone .sb-tray{flex-wrap:wrap;gap:10px 12px;padding:10px 12px}
.phone .sb-tray .lab{display:none}
.phone .sb-road{flex:1 1 100%;order:3}
.phone .sb-tray .btn2{margin-left:auto}
.phone .sb-tray .why{display:none}
.phone .sb-tray .btn2 small{display:none}
.phone .sb-sub .aside{display:block}
.phone .sb-mode{display:grid;grid-template-columns:1fr 1fr;width:100%;box-sizing:border-box}
.phone p.more3{margin:10px 0 0;padding:0 0 12px 42px;font-size:12px;color:var(--ink-3);border-bottom:1px solid var(--rule-soft)}
.phone .sb-mode a{text-align:center}
.phone .sb-verdict{font-size:13px;margin:16px 0 8px}
.sb-grp{display:flex;align-items:center;gap:10px;margin-top:18px;padding:10px 0 8px;border-bottom:1px solid var(--rule)}
.sb-grp .sb-site{font-weight:600;font-size:14px}
.sb-grp .cnt{margin-left:auto;font:500 11px/1 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sb-grp + .how{margin:0;font-size:12px;color:var(--ink-3);padding:8px 0 2px}
.sb-card{display:grid;grid-template-columns:34px 1fr;gap:4px 8px;padding:14px 0;border-bottom:1px solid var(--rule-soft)}
.sb-card .sb-tick{margin-top:1px;width:26px;height:26px}
.sb-card .top{display:flex;align-items:center;gap:8px;justify-content:space-between}
.sb-card .top b{font-weight:600;font-size:14px}
.sb-card .sb-why{margin-top:5px}
.sb-card .facts{grid-column:2;display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;font:500 11.5px/1.3 "IBM Plex Mono",monospace;color:var(--ink-3)}
.sb-card .facts b{color:var(--ink-2);font-weight:500}
.sb-card .set{grid-column:2;display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:10px;padding:9px 10px;border-radius:8px;background:var(--surface);font:500 13px/1.2 "IBM Plex Mono",monospace}
.sb-card .set .where{font:400 11.5px/1.3 Archivo,sans-serif;color:var(--ink-3);text-align:right}
.sb-card.sb-done>*:not(.sb-tick){opacity:.42}
.sb-card.sb-done .sb-chg b{text-decoration:line-through}
.sb-card.sb-ev{display:none}
.board.sb-every .sb-card.sb-ev{display:grid}

@media (prefers-reduced-motion:reduce){.board *{animation:none!important;transition:none!important}.rv{opacity:1;transform:none}}
"""

# --------------------------------------------------------------------------
# icons (stroke, 24 grid): the site panel's, plus a few
# --------------------------------------------------------------------------
P = dict(SP_ICONS)
P.update({
    "store": '<path d="M4 10v10h16V10"></path><path d="M3 10l2-6h14l2 6"></path><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"></path><path d="M10 20v-5h4v5"></path>',
    "factory": '<path d="M3 21V11l6 3.500V11l6 3.500V5h5v16z"></path><path d="M7 18h2M12 18h2M16.500 9v.01"></path>',
    "ship": '<path d="M4 15l1.500 5h13L20 15z"></path><path d="M6 15V9h12v6M12 9V4M9 6h6"></path>',
    "copy": '<rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"></path>',
    "refresh": '<path d="M20 12a8 8 0 1 1-2.300-5.700"></path><path d="M20 4v5h-5"></path>',
    "flow": '<circle cx="5" cy="6" r="2"></circle><circle cx="5" cy="18" r="2"></circle><circle cx="19" cy="12" r="2"></circle><path d="M7 6h3a3 3 0 0 1 3 3v0a3 3 0 0 0 3 3h1M7 18h3a3 3 0 0 0 3-3v0a3 3 0 0 1 3-3"></path>',
    "rows": '<path d="M4 6h16M4 12h16M4 18h16"></path>',
    "warehouse": '<path d="M3 21V9l9-5 9 5v12"></path><path d="M7 21v-8h10v8M7 17h10"></path>',
    "moon": '<path d="M20 14.500A8 8 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z"></path>',
    "zz": '<path d="M5 7h5l-5 6h5M13 11h6l-6 7h6"></path>',
    "noplan": '<path d="M4 12h4M12 12h1M17 12h3"></path><path d="M4 7l16 10"></path>',
    "hub": '<rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M9 9h6v6H9z"></path>',
    "pause2": '<path d="M9 6v12M15 6v12"></path>',
    "clock2": '<circle cx="12" cy="12" r="8.500"></circle><path d="M12 7v5l3.500 2"></path>',
    "map": '<path d="M9 4 3 6.500v13.500L9 17.500l6 2.500 6-2.500V4l-6 2.500z"></path><path d="M9 4v13.500M15 6.500V20"></path>',
    "x": '<path d="M6 6l12 12M18 6L6 18"></path>',
    "wiki": '<rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M9 7h6M9 11h6M9 15h4"></path>',
})


def svg(name: str) -> str:
    return f'<svg viewBox="0 0 24 24" aria-hidden="true">{P[name]}</svg>'


def ic(name: str) -> str:
    return f'<span class="sb-i">{svg(name)}</span>'


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def n(v) -> str:
    return f"{v:,}" if isinstance(v, int) else str(v)


# --------------------------------------------------------------------------
# the vocabulary: one word per supply fact (R8). Class, icon.
# --------------------------------------------------------------------------
WORDS = {
    "covered": ("ok", "tick"),
    "tight": ("warn", "clock2"),
    "short": ("bad", "down"),
    "no plan": ("plan", "noplan"),
    "paused": ("bad", "pause2"),
    "stalled": ("warn", "route"),
    "idle": ("idle", "zz"),
    "made here": ("made", "gear"),
    "new": ("new", "sparkle"),
}


def v(word: str, why: str = "", tip: str = "") -> str:
    cls, icon = WORDS[word]
    t = f' data-tip="{esc(tip)}"' if tip else ""
    return f'<span class="sb-v {cls}"{t}>{svg(icon)}{word}</span>' + (f'<span class="sb-why">{why}</span>' if why else "")


def chg(now, new, unit: str = "", where: str = "") -> str:
    """The setting as the game holds it, and what to type. No `new`: just the setting."""
    if new is None:
        body = f'{n(now) if now is not None else "—"}'
        if unit:
            body += f'<small style="margin-left:5px;font-size:10.5px;color:var(--ink-3)">{unit}</small>'
    else:
        body = (f'<span class="sb-chg"><s>{n(now) if now is not None else "—"}</s><span class="to">{svg("right")}</span>'
                f'<b>{n(new)}</b>{f"<small>{unit}</small>" if unit else ""}</span>')
    return body + (f'<span class="sub r">{where}</span>' if where else "")


def tick(label: str, done: bool = False) -> str:
    return (f'<button type="button" class="sb-tick" aria-pressed="{"true" if done else "false"}" '
            f'aria-label="{esc(label)}" data-tip="Tick once it is typed in the game">{svg("tick")}</button>')


def site(code: str, name: str, big: bool = False, go: bool = False) -> str:
    return (f'<span class="sb-site">{f"<span class=\"hood\">{code}</span>" if code else ""}'
            f'<a class="nm" href="#" data-tip="Open its page">{esc(name)}</a>'
            f'<button type="button" class="sb-map" aria-label="Show {esc(name)} on the map" data-tip="Show on the map">{svg("map")}</button>'
            + ('<a class="go" href="#">page ›</a>' if go else "") + '</span>')


def gauge(pct: int | None, cls: str = "") -> str:
    """Busiest day against the round that refills it: past the tick mark it runs dry."""
    if pct is None:
        return '<span class="sb-g none" data-tip="Nothing refills it, so there is nothing to measure against"><span class="tr"></span><b>—</b></span>'
    m = f";--m:{100 / pct * 100:.0f}%" if pct > 100 else ""
    return (f'<span class="sb-g {cls}" style="--w:{min(pct, 100)}%{m}" data-tip="The busiest day takes {pct}% of what the round brings; the mark is the round">'
            f'<span class="tr"><i></i><u></u></span><b>{pct}%</b></span>')


DAYS = "WTFSSMT"


def rail(cover: float | None, truck: int | None = 5, dead: bool = False) -> str:
    """A week from today, a cell a day: covered green, dry hatched red, the truck on import day."""
    if dead:
        return '<span class="sb-rail"><span class="sp-rail">' + "<i></i>" * 7 + '</span> <span class="sp-zz">zzz</span></span>'
    cells = ""
    for k in range(7):
        if cover is not None and k < cover:
            cls = "c"
        elif truck is not None and k >= truck:
            cls = "c"
        elif cover is not None and truck is not None and k < truck:
            cls = "d"
        else:
            cls = ""
        cells += f'<i class="{cls}"></i>'
    trk = "" if truck is None else f'<span class="trk" style="--d:{truck}">{svg("truck")}</span>'
    return f'<span class="sb-rail"><span class="sp-rail">{cells}{trk}</span></span>'


def days_head() -> str:
    return '<span class="sb-days">' + "".join(f'<b class="{"now" if k == 0 else ""}">{d}</b>' for k, d in enumerate(DAYS)) + "</span>"


def day_strip(staffed: int, need: int, tip: str) -> str:
    on = min(staffed, need)
    cells = "".join(f'<i class="on" style="--k:{k}"></i>' for k in range(on))
    if staffed > need:
        cells += '<i class="slack"></i>' * (staffed - need)
    elif need > staffed:
        cells += '<i class="miss"></i>' * (need - staffed)
    cells += "<i></i>" * (24 - max(staffed, need))
    return f'<span class="sb-day" data-tip="{esc(tip)}">{cells}</span>'


def machines(share: float, count: int, tip: str) -> str:
    sq = "".join(f'<span class="sp-m" style="--h:{share * 100:.0f}%" data-tip="{esc(tip)}">{svg("gear")}</span>' for _ in range(count))
    return f'<div class="sp-mach">{sq}</div>'


# --------------------------------------------------------------------------
# a sortable table; the first column is the tick
# --------------------------------------------------------------------------
def table(cols: list[tuple], rows: list[dict], tid: str, widths: list | None = None) -> str:
    """cols: (label, align, sortable, tip). rows: {cells: [(html, sortvalue)], cls, key}."""
    head = '<th class="sb-tk" aria-label="Typed in"></th>'
    for k, (label, align, sortable, tip, *_) in enumerate(cols):
        t = f' data-tip="{esc(tip)}"' if tip else ""
        cls = f' class="{align}"' if align else ""
        inner = (f'<button type="button" class="supply-sort">{label}<span class="arr"></span></button>' if sortable else label)
        head += f'<th{cls}{t}{f" data-col=\"{k}\"" if sortable else ""}>{inner}</th>'
    body = ""
    for r in rows:
        tds = f'<td class="sb-tk">{r.get("tick", "")}</td>'
        for k, (cell, sv) in enumerate(r["cells"]):
            align = cols[k][1]
            extra = cols[k][4] if len(cols[k]) > 4 else ""
            cls = " ".join(x for x in (align, extra) if x)
            tds += f'<td{f" class=\"{cls}\"" if cls else ""}{"" if sv is None else f" data-v=\"{esc(str(sv))}\""}>{cell}</td>'
        attrs = f' class="{r.get("cls", "")}"' if r.get("cls") else ""
        attrs += f' data-chg="{r["key"]}"' if r.get("key") else ""
        attrs += f' data-kid="{r["kid"]}"' if r.get("kid") else ""
        body += f"<tr{attrs}>{tds}</tr>"
    cg = ""
    if widths:
        cg = '<colgroup><col style="width:34px">' + "".join(f'<col{f" style=\"width:{w}px\"" if w else ""}>' for w in widths) + "</colgroup>"
    return f'<div class="scrollx"><table class="sb-t{" fixed" if widths else ""}" id="{tid}">{cg}<thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


# --------------------------------------------------------------------------
# the masthead and the page head
# --------------------------------------------------------------------------
NAV = [("today", "Today", ""), ("building", "Company", ""), ("supply", "Supply", ""), ("growth", "Growth", ""),
       ("map", "Map", "NEW"), ("wiki", "Wiki", "NEW")]


def masthead() -> str:
    items = "".join(f'<a class="{"on" if key == "supply" else ""}" href="#">{svg(key)}<span>{label}</span>'
                    f'{f"<em class=\"feature-new\">{new}</em>" if new else ""}</a>' for key, label, new in NAV)
    return f"""
<header class="mast">
  <div class="brand"><span class="wordmark">HART. YT</span><span class="dot"></span></div>
  <nav class="nav" id="nav">{items}<i class="ink"></i></nav>
  <div class="clock" data-tip="Game time when the save was written. Day 1 was a Monday."><b>Day 73<i>·</i>Wed 11:13</b><small>YEAR 2 · 26 SITES · 529 STAFF</small></div>
</header>"""


TABS = [("Shops", "store", "Shops.dc.html"), ("Warehouses", "warehouse", "Warehouses.dc.html"),
        ("Factories", "factory", "Factories.dc.html")]
FLOW_TAB = ("Goods flow", "flow", "FlowTab.dc.html")
# the ticks still to type, per tab, for this state of the canvas
LEFT = {"Shops": 10, "Warehouses": 7, "Factories": 2}


def subhead(active: str, every: bool = False, left: dict | None = None, fourth: bool = False, diagram: bool | None = None,
            tabs_only: bool = False) -> str:
    left = LEFT if left is None else left
    tabs = ""
    for label, icon, href in TABS + ([FLOW_TAB] if fourth else []):
        k = left.get(label)
        badge = ""
        if k is not None:
            badge = (f'<span class="sb-n zero" data-tip="Nothing to change">{svg("tick")}</span>' if k == 0
                     else f'<span class="sb-n" data-tab="{label}" data-tip="{k} change{"s" if k != 1 else ""} to type in">{k}</span>')
        tabs += f'<a class="{"on" if label == active else ""}" href="{href}">{svg(icon)}<span>{label}</span>{badge}</a>'
    tools = "" if tabs_only else (
        f'<span class="seg sb-mode" aria-label="Which rows to list"><a class="{"" if every else "on"}" href="#" data-mode="changes">Needs a change</a>'
        f'<a class="{"on" if every else ""}" href="#" data-mode="all">Everything</a></span>')
    if diagram is not None:
        tools += (f'<span class="seg sb-view" aria-label="List or diagram"><a class="{"" if diagram else "on"}" href="#" data-view="list" '
                  f'aria-label="List" data-tip="List">{svg("rows")}</a><a class="{"on" if diagram else ""}" href="#" data-view="diagram" '
                  f'aria-label="Diagram" data-tip="How the goods move">{svg("flow")}</a></span>')
    return f'<div class="sb-sub"><nav class="seg sb-tabs" aria-label="Supply">{tabs}</nav><div class="aside">{tools}</div></div>'


def tray(done: int, total: int, here_total: int = 0) -> str:
    """One checklist for the whole page. `done` counts ticks on every tab; the artboard's own
    ticks are counted live on top of the ticks other tabs hold (data-other)."""
    p = done / total if total else 1
    left = total - done
    return f"""
<div class="sb-tray{" done" if total and not left else ""}" data-total="{total}" data-other="{done}" style="--p:{p:.3f}">
  <span class="lab">Change checklist</span>
  <span class="txt"><b class="d">{done}</b> of {total} typed in</span>
  <span class="sb-road" aria-hidden="true"><i></i><span class="trk">{svg("truck")}</span><span class="home">{svg("warehouse")}</span></span>
  <span class="why" data-tip="Tick a row once you have typed its setting in the game. Ticks are your own notes, kept on this device per character; a row goes once a newer save shows the change. Amounts are units, not boxes." tabindex="0"><i>?</i></span>
  <button type="button" class="btn2 sb-copy"{" disabled" if not left else ""}>{svg("copy")}<span>Copy remaining</span><small class="l">{left}</small></button>
  <button type="button" class="ibtn sb-reset" aria-label="Clear your ticks" data-tip="Clear your ticks">{svg("refresh")}</button>
</div>"""


def verdict(text: str, calm: bool = False, crumb: str = "") -> str:
    mark = f'<span class="check">{svg("tick")}</span>' if calm else ""
    c = (f'<span class="sb-crumb">{crumb}<button type="button" aria-label="Back to all rows" data-crumb>{svg("x")}</button></span>' if crumb else "")
    return f'<p class="sb-verdict">{mark}<span>{text}</span>{c}</p>'


def more(shown: int, total: int, label: str) -> str:
    return (f'<p class="sb-more"><span class="sb-only">{total - shown} more {label} are fine &nbsp;<a class="link" href="#" data-mode="all">Everything</a></span>'
            f'<span class="sb-evonly">Sorted by what needs a change · click a heading to sort</span></p>')


# --------------------------------------------------------------------------
# SHOPS: every shelf, judged against tomorrow morning's round
# --------------------------------------------------------------------------
SHOP_COLS = [("Shop", "l", True, ""), ("Product", "l", True, "", "nm"), ("Sells / day", "", True, ""),
             ("Busiest day", "", True, ""), ("On hand", "", True, ""),
             ("Pressure", "", True, "How much of the round the busiest day takes. Past the mark the shelf runs dry before the next morning."),
             ("Daily top-up", "", True, "What the warehouse brings each morning. With a change, the figure to type in its delivery plan."),
             ("Status", "l", True, "", "st")]

SHOP_W = [210, 170, 80, 90, 80, 110, 160, None]
# (code, shop, item, sells, peakday, peak, onhand, pressure, now, new, where, word, why, tip, done)
IDLE_DRINK = {"Energy Drink": "4,000", "Soda Can": "3,000"}
SHOP_CHANGES = [
    ("MH", "HART. Fittness", "Energy Drink", 214, "Sun", 227, 1013, None, None, 300, "plan from Import Hub", "no plan",
     'nothing refills it; <a href="Warehouses.dc.html">Import Hub holds 4,000 idle</a>', "No delivery plan brings this to the shelf. Import Hub holds 4,000 Energy Drink that nothing draws.", True),
    ("MH", "HART. Fittness", "Soda Can", 123, "Sun", 130, 1114, None, None, 200, "plan from Import Hub", "no plan",
     'nothing refills it; <a href="Warehouses.dc.html">Import Hub holds 3,000 idle</a>', "", True),
    ("GD", "HART. Fitness", "Energy Drink", 173, "Sun", 183, 1644, None, None, 200, "plan from Import Hub", "no plan",
     "nothing refills it", "", False),
    ("GD", "HART. Fitness", "Soda Can", 124, "Sun", 131, 1210, None, None, 200, "plan from Import Hub", "no plan", "nothing refills it", "", False),
    ("HK", "HART. Fitness", "Energy Drink", 167, "Sun", 180, 1680, None, None, 200, "plan from Import Hub", "no plan", "nothing refills it", "", False),
    ("HK", "HART. Fitness", "Soda Can", 122, "Sun", 132, 1275, None, None, 200, "plan from Import Hub", "no plan", "nothing refills it", "", False),
    ("LM", "HART. Jewelry", "Jewelry (Cheap)", 109, "Fri", 162, 128, 108, 150, 200, "from Jewelry Distrib.", "short",
     "Fridays sell 162; the round brings 150", "The shelf empties on Fridays before the next morning's round.", False),
    ("MT", "HART. Jewelry", "Paper Bag", 145, "Fri", 169, 4455, 4, 4500, 1200, "from Jewelry Distrib.", "idle",
     "the top-up holds 31 days of sales", "Paper Bag top-up target of 4,500 is 31 times daily sales; a week's worth is 1,200.", False),
    ("MH", "HART. Jewelry", "Paper Bag", 80, "Fri", 92, 2473, 4, 2500, 700, "from Jewelry Distrib.", "idle", "the top-up holds 31 days of sales", "", False),
    ("GD", "HART. Jewelry", "Paper Bag", 84, "Fri", 98, 2479, 4, 2500, 700, "from Jewelry Distrib.", "idle", "the top-up holds 30 days of sales", "", False),
]
# fine, shown under Everything (a slice of the 100; the real page shows them all)
SHOP_FINE = [
    ("HA", "HART. Jewelry", "Jewelry (Cheap)", 104, "Fri", 121, 129, 81, 150),
    ("HK", "HART. Jewelry", "Jewelry (Cheap)", 102, "Fri", 118, 129, 79, 150),
    ("IC", "HART. Jewelry", "Jewelry (Cheap)", 114, "Fri", 132, 149, 78, 170),
    ("HK", "HART. Clothing", "Clothing (Modern Cheap Female)", 129, "Sat", 154, 221, 62, 250),
    ("IC", "HART. Clothing", "Clothing (Classic Cheap Female)", 130, "Sun", 154, 223, 62, 250),
    ("GD", "HART. Jewelry", "Jewelry (Cheap)", 78, "Fri", 91, 149, 53, 170),
    ("LM", "HART. Clothing", "Clothing (Modern Expensive Female)", 202, "Sat", 238, 461, 48, 500),
    ("MT", "HART. Jewelry", "Jewelry (Cheap)", 143, "Fri", 166, 297, 47, 350),
    ("HA", "HART. Clothing", "Clothing (Classic Cheap Male)", 96, "Sat", 115, 230, 46, 250),
    ("MH", "HART. Clothing", "Clothing (Classic Cheap Female)", 227, "Sat", 268, 657, 38, 700),
    ("MT", "HART. Clothing", "Clothing (Classic Cheap Male)", 198, "Sat", 240, 661, 34, 700),
    ("LM", "HART. Clothing", "Paper Bag", 421, "Sat", 497, 3420, 14, 3500),
]


def shop_rows(done_keys: set, fine_edge: int = 0) -> list[dict]:
    rows = []
    for k, (code, shop, item, sells, pday, peak, hand, pres, now, new, where, word, why, tip, done) in enumerate(SHOP_CHANGES):
        key = f"s{k}"
        g = gauge(pres, "bad" if word == "short" else "") if word != "idle" else gauge(pres)
        rows.append({"key": key, "cls": "sb-done" if key in done_keys else "",
                     "tick": tick(f"{item} at {shop}: typed in", key in done_keys),
                     "cells": [(site(code, shop), f"{shop} {code}"), (item, item), (n(sells), sells), (f"{pday} {n(peak)}", peak),
                               (n(hand), hand), (g, pres if pres is not None else 999),
                               (chg(now, new, "/day", where), new), (v(word, why, tip), f"0{word}")]})
    for k, (code, shop, item, sells, pday, peak, hand, pres, top) in enumerate(SHOP_FINE):
        edge = k < fine_edge
        rows.append({"cls": ("sb-edge" if edge else "sb-ev"),
                     "cells": [(site(code, shop), f"{shop} {code}"), (item, item), (n(sells), sells), (f"{pday} {n(peak)}", peak),
                               (n(hand), hand), (gauge(pres), pres), (chg(top, None, "", ""), top),
                               (v("covered", f"{DAYN[pday]} take {pres}% of the round"), "9covered")]})
    return rows


DAYN = {"Mon": "Mondays", "Tue": "Tuesdays", "Wed": "Wednesdays", "Thu": "Thursdays", "Fri": "Fridays", "Sat": "Saturdays", "Sun": "Sundays"}


def shops(done_keys: set) -> str:
    left = LEFT["Shops"] - len(done_keys)
    total_done = len(done_keys)
    return f"""
{subhead("Shops", left={**LEFT, "Shops": left})}
{tray(total_done, 19)}
{verdict("<b>6 shelves have no plan and 1 runs short on Fridays</b>; 90 of 100 clear tomorrow's round. 3 hold a month of paper bags.")}
{table(SHOP_COLS, shop_rows(done_keys), "shopsT", SHOP_W)}
{more(10, 100, "shelves")}
"""


def shops_empty() -> str:
    left = {"Shops": 0, "Warehouses": 7, "Factories": 2}
    edge = [r for r in shop_rows(set(), fine_edge=3) if "sb-edge" in r.get("cls", "")]
    art = f"""<svg class="art" viewBox="0 0 260 150" role="img" aria-label="A stocked shelf and a delivery van">
  <path class="shelf" d="M20 40h150M20 84h150M20 128h150M24 20v112M166 20v112"></path>
  <rect class="box g" x="32" y="22" width="26" height="18" rx="2"></rect><rect class="box" x="62" y="26" width="22" height="14" rx="2"></rect><rect class="box g" x="88" y="20" width="30" height="20" rx="2"></rect><rect class="box" x="122" y="24" width="24" height="16" rx="2"></rect>
  <rect class="box" x="30" y="66" width="30" height="18" rx="2"></rect><rect class="box g" x="64" y="62" width="24" height="22" rx="2"></rect><rect class="box" x="92" y="68" width="26" height="16" rx="2"></rect><rect class="box g" x="122" y="64" width="30" height="20" rx="2"></rect>
  <rect class="box g" x="34" y="108" width="24" height="20" rx="2"></rect><rect class="box" x="62" y="112" width="30" height="16" rx="2"></rect><rect class="box g" x="96" y="106" width="26" height="22" rx="2"></rect><rect class="box" x="126" y="110" width="22" height="18" rx="2"></rect>
  <g class="van"><path d="M178 104h46v24h-46z"></path><path d="M224 112h14l8 9v7h-22z"></path><circle cx="190" cy="131" r="5"></circle><circle cx="234" cy="131" r="5"></circle></g>
  <circle class="tickc" cx="200" cy="38" r="17"></circle><path class="tickp" d="M192 38.500l5.500 5.500 10-11"></path>
</svg>"""
    return f"""
{subhead("Shops", left=left)}
{tray(0, 9)}
<div class="sb-empty rv">
  {art}
  <div>
    <h3>Every shelf reaches tomorrow's round</h3>
    <p>All <b>100 shelves</b> in 17 shops are on a plan and clear their top-up. The three closest to the edge are below; nothing needs a change.</p>
    <a class="btn2" href="#" data-mode="all">{svg("rows")}<span>See all 100 shelves</span></a>
  </div>
</div>
<p class="sb-part" style="margin-top:30px">Closest to the edge</p>
{table(SHOP_COLS, edge, "emptyT", SHOP_W)}
"""


# --------------------------------------------------------------------------
# WAREHOUSES: every depot, first tier or second
# --------------------------------------------------------------------------
WH_COLS = [("Product", "l", True, "", "nm"), ("On hand", "", True, ""), ("Draw / day", "", True, "What leaves each day: the logistics rounds out of here"),
           ("Busiest", "", True, ""),
           ("Cover", "l", False, "A weekly import: the week from today, a cell a day, the truck on import day. A daily round: the busiest day against what the round brings."),
           ("Order / top-up", "", True, "The setting that refills this line: the import contract, or the delivery plan of the site that sends it. With a change, the figure to type."),
           ("Uses / week", "", True, "What the ends of the routes use in a week: shop sales, other depots' draw and factory lines, summed along the logistics routes to here. One-off stock fills are not counted. Hover a figure for the sites behind it."),
           ("Status", "l", True, "", "st")]


WH_W = [180, 75, 80, 95, 125, 200, 120, None]
MARGIN = 12


def uses(val: str, parts: list[str], rated: bool = False) -> str:
    """What a week uses at the ends of the routes, with the sites behind it on hover."""
    tip = "Uses a week, summed up the logistics routes. " + " · ".join(parts)
    tag = ('<span class="sb-rated" data-tip="Open decision: factory lines are counted at their rated 24/7 rate here, '
           'not at what they measurably use. Peter has not settled which.">rated</span>') if rated else ""
    return f'<span class="sb-uses" data-tip="{esc(tip)}">{val}</span>{tag}'


def order(now: int, use: int | None, new: int | None, pier: str) -> str:
    """A Smart Delivery level: now, and the figure to type (use + margin, rounded up), in a box."""
    cell = chg(now, new, "" if new else "in stock")
    if new:
        cell = cell.replace(f"<b>{n(new)}</b>", f'<input class="sb-in" value="{n(new)}" aria-label="Smart Delivery stock to set">')
    how = f"{n(use)} + {MARGIN}% · " if (use and new) else "Smart Delivery · "
    return cell + f'<span class="sub r">{how}{pier}</span>'


def wh_row(item, hand, draw, busy, cover, setting, week, word, why, tip="", key=None, cls="", done=False, kids=None, kid=None, wv=None):
    r = {"cells": [(item + (f'<button type="button" class="sb-kids" data-kids="{kids[0]}">{svg("chev")}+{kids[1]}</button>' if kids else ""), item),
                   (hand, _num(hand)), (draw, _num(draw)), (busy, _num(busy)), (cover, None), (setting, None), (week, wv if wv is not None else _num(week)),
                   (v(word, why, tip), word)], "cls": cls}
    if key:
        r["key"] = key
        r["tick"] = tick(f"{item}: typed in", done)
        if done:
            r["cls"] = (cls + " sb-done").strip()
    if kid:
        r["kid"] = kid
    return r


def _num(s) -> float | None:
    s = str(s).split("<")[0].replace(",", "").replace("—", "").strip()
    for part in s.split():
        try:
            return float(part)
        except ValueError:
            continue
    return None


def warehouses(arrived: bool = True, every: bool = False) -> str:
    ELEC = [("Resistors", "127,900", "3,086", "151,300"), ("Transistors", "127,900", "3,086", "151,300"), ("Speaker", "50,960", "1,234", "60,500"),
            ("Integrated Circuits", "42,400", "1,029", "50,500"), ("Microphone", "33,700", "829", "40,400"),
            ("Copper Clad Laminate", "20,800", "514", "25,300"), ("Battery", "16,300", "429", "20,200"), ("Plastic", "14,350", "343", "16,900"),
            ("Glass", "9,950", "243", "11,800")]
    R = "Factory lines at their rated rate, 24 hours a day, 7 days"
    hub = [
        wh_row("Uncut Gems (Expensive)", "4,342", "488", "488", rail(8.9, 5), order(4800, 5040, 5700, "7 Pier"),
               uses("5,040", ["Factory Jewelry: Jewelry (Expensive), 1 machine × 30 an hour × 24 h × 7 = 5,040", R], rated=True),
               "short", "uses 5,040 a week; the level brings 4,800",
               "Holdings reach Monday's import, but the Smart Delivery level refills less than a week of what the jewelry line uses.", key="w0", wv=5040),
        wh_row("Fabric (Cheap)", "63,824", "7,770", "7,770", rail(8.2, 5), order(80700, 80640, 90400, "7 Pier"),
               uses("80,640", ["Factory Clothing: 4 cheap lines, 4 machines × 60 an hour × 24 h × 7 = 80,640", R], rated=True),
               "tight", "covers the 80,640 a week it uses, not the 12% margin", key="w3", wv=80640),
        wh_row("Fabric (Expensive)", "65,354", "6,612", "6,612", rail(9.9, 5), order(80700, 80640, 90400, "7 Pier"),
               uses("80,640", ["Factory Clothing: 4 expensive lines, 8 machines × 30 an hour × 24 h × 7 = 80,640", R], rated=True),
               "tight", "covers the 80,640 a week it uses, not the 12% margin", key="w4", wv=80640),
        wh_row("Metal Band", "12,442", "1,644", "1,644", rail(7.6, 5), order(15200, 15120, 17000, "7 Pier"),
               uses("15,120", ["Factory Jewelry: Jewelry (Expensive) 30 an hour and Jewelry (Cheap) 60 an hour, × 24 h × 7 = 15,120",
                               "Not counted: the one-off 5,000 filled into Jewelry Distrib. on days 66 to 68", R], rated=True),
               "tight", "covers the 15,120 a week it uses, not the 12% margin", key="w5", wv=15120),
        wh_row("Uncut Gems (Cheap)", "8,200", "897", "897", rail(9.1, 5), order(10200, 10080, 11300, "7 Pier"),
               uses("10,080", ["Factory Jewelry: Jewelry (Cheap), 1 machine × 60 an hour × 24 h × 7 = 10,080 (rostered 12 h today)", R], rated=True),
               "tight", "covers the 10,080 a week it uses, not the 12% margin", key="w6", wv=10080),
        wh_row("Energy Drink", "4,000", "—", "—", rail(None, None, dead=True), order(4000, None, None, "1 Pier"), "—", "idle",
               'nothing draws it; <a href="Shops.dc.html">3 gyms sell 554 a day with no plan</a>'),
        wh_row("Soda Can", "3,000", "—", "—", rail(None, None, dead=True), order(3000, None, None, "1 Pier"), "—", "idle",
               'nothing draws it; <a href="Shops.dc.html">the same gyms sell 369 a day</a>'),
        wh_row("Capacitors", "127,900", "3,086", "3,086", rail(41, 5), order(151300, 20160, None, "7 Pier"),
               uses("20,160", ["Factory Electronics: 2 smartwatch lines, 2 machines × 2 capacitors × 30 an hour × 24 h × 7 = 20,160", R], rated=True), "idle",
               "10 electronics parts hold 6 weeks: 572,160 units", "Smart Delivery keeps these at levels 5 to 7 times what a week uses.", kids=("elec", 9), wv=20160),
    ]
    for item, hand, draw, lvl in ELEC:
        hub.append(wh_row(item, hand, draw, draw, rail(41, 5), chg(int(lvl.replace(",", "")), None, "in stock", ""), "—", "idle", "", cls="sb-kid", kid="elec"))
    hub += [
        wh_row("Paper Bag", "17,387", "2,790", "Fri 3,236", rail(6.3, 5), order(25000, 20300, None, "1 Pier"),
               uses("20,300", ["7 clothing shops 14,970 · via Clothing Distr. ← Factory Clothing ← here",
                               "7 jewelry shops 5,330 · via Jewelry Distrib. ← Factory Jewelry ← here",
                               "The factories only pass bags on, so they add nothing of their own"]),
               "covered", "uses 20,300 a week; the level holds that and 12% more", cls="sb-edge", wv=20300),
    ]
    clo = [
        wh_row("Paper Bag", "2,997", "2,139", "Sat 2,540", gauge(127, "bad"), chg(2000, 2600, "/day", "round from Factory Clothing"), "14,970", "short",
               "Saturdays draw 2,540; Factory Clothing's round brings 2,000",
               "The 7 clothing shops draw more bags on a Saturday than the morning round leaves here.", key="w1"),
        wh_row("Clothing (Classic Cheap Female)", "1,170", "872", "Sat 1,030", gauge(52), chg(2000, None, "/day", "from Factory Clothing"), "6,100", "covered", "", cls="sb-ev"),
        wh_row("Clothing (Modern Cheap Male)", "1,166", "876", "Sat 1,035", gauge(52), chg(2000, None, "/day", ""), "6,130", "covered", "", cls="sb-ev"),
        wh_row("Clothing (Classic Expensive Female)", "1,256", "767", "Sat 905", gauge(45), chg(2000, None, "/day", ""), "5,370", "covered", "", cls="sb-ev"),
        wh_row("Jewelry (Cheap)", "100", "205", "Sat 242", gauge(24), chg(1000, None, "/day", "from Factory Jewelry"), "1,440", "covered", "", cls="sb-ev"),
    ]
    jew = [
        wh_row("Metal Band", "5,000", "—", "—", '<span class="sp-zz">zzz</span>',
               chg(5000, 0, "", "Factory Jewelry's plan"), "—", "idle", "nothing here uses it; Factory Jewelry keeps 5,000 here",
               "A raw material routed to a warehouse where no line and no shop uses it: the target on that route is almost certainly a slip.",
               key="w2", cls="sb-arrived" if arrived else ""),
        wh_row("Jewelry (Cheap)", "152", "724", "Fri 840", gauge(84), chg(1000, None, "/day", "from Factory Jewelry"), "5,070", "covered",
               "Fridays take 84% of the round", cls="sb-edge"),
        wh_row("Jewelry (Expensive)", "750", "210", "Fri 244", gauge(24), chg(1000, None, "/day", ""), "1,470", "covered", "", cls="sb-ev"),
        wh_row("Paper Bag", "4,107", "762", "Fri 885", gauge(18), chg(5000, None, "/day", ""), "5,330", "covered", "", cls="sb-ev"),
        wh_row("ZanaMan Smartwatch", "148", "—", "—", '<span class="sp-zz">new</span>', chg(300, None, "/day", "from Factory Electronics"), "—", "new",
               "first delivery day 73; no shop sells it yet", cls="sb-ev"),
    ]

    def block(icon, code, name, how, stats, rows, tid, cnt, open_=True, lit=False):
        cc = f'<span class="cnt red">{cnt}</span>' if cnt and "to change" in cnt else f'<span class="cnt">{cnt}</span>'
        return f"""
<details class="sb-obj{" lit" if lit else ""}" data-obj="{tid}"{" open" if open_ else ""}>
  <summary><span class="ic">{svg(icon)}</span>
    <span class="who">{site(code, name, go=True)}<span class="how">{how}</span></span>
    <span class="sb-stats">{stats}</span>{cc}<span class="tog">{svg("chev")}</span></summary>
  <div class="body">{table(WH_COLS, rows, tid, WH_W)}</div>
</details>"""

    def stat(lab, val, small="", tip="", cls=""):
        return f'<span class="sb-stat {cls}"{f" data-tip=\"{esc(tip)}\"" if tip else ""}><span class="lab">{lab}</span><span class="v">{val}{f"<small>{small}</small>" if small else ""}</span></span>'

    hub_how = (f'<span>{ic("ship")}<em>weekly from <b>7 Pier</b> and <b>1 Pier</b>, Monday · 4.5 days</em></span>'
               f'<span>{ic("right")}<em>feeds 3 factories</em></span>')
    clo_how = (f'<span>{ic("truck")}<em>each morning from <b>Factory Clothing</b> and <b>Factory Jewelry</b></em></span>'
               f'<span>{ic("right")}<em>feeds 7 clothing shops</em></span>')
    jew_how = (f'<span>{ic("truck")}<em>each morning from <b>Factory Jewelry</b> and <b>Factory Electronics</b></em></span>'
               f'<span>{ic("right")}<em>feeds 7 jewelry shops</em></span>')
    crumb = "from Today · Idle stock" if arrived else ""
    return f"""
{subhead("Warehouses", every=every, left={**LEFT, "Shops": 8})}
{tray(2, 19)}
{verdict("<b>2 settings fall short and 4 import levels sit inside their 12% margin</b>; 29 of 35 lines reach their next delivery with room. <b>7,000 drinks and 5,000 Metal Band sit idle</b>.", crumb=crumb)}
<div class="sb-listonly">
{block("warehouse", "GD", "Clothing Distr.", clo_how, stat("On the floor", "13,653") + stat("Takes / day", "8,973", "Sat 10,590", "What the rounds into here have to bring, and on its busiest day", "take"), clo, "whClo", "1 to change")}
{block("warehouse", "GD", "Jewelry Distrib.", jew_how, stat("On the floor", "10,307") + stat("Takes / day", "1,696", "Fri 1,970", "", "take"), jew, "whJew", "1 to change", lit=arrived)}
{block("warehouse", "GD", "Import Hub", hub_how, stat("On the floor", "750,709") + stat("Uses / week", "321,000", "rated", "What a week uses along every route out of here, factory lines at their rated rate: what the two import contracts have to bring, before the margin", "take"), hub, "whHub", "5 to change")}
</div>
"""


# --------------------------------------------------------------------------
# FACTORIES: lines, their hours, their inputs
# --------------------------------------------------------------------------
LINE_COLS = [("Line", "l", True, "", "nm"), ("Machines", "l", False, "A square a machine, filled by the share of the day someone is posted to it"),
             ("Hours a day", "l", True, "A cell an hour. Solid: staffed and needed. Hatched: staffed but more than what ships needs. Red outline: needed and not staffed. Need = what ships a day ÷ the line's rate."),
             ("Makes / day", "", True, "At the hours it is staffed"), ("Ships / day", "", True, ""), ("Held", "", True, "Output on the factory's shelves, against its Produce up to limit"),
             ("Status", "l", True, "", "st")]
INPUT_COLS = [("Factory input", "l", True, "", "nm"), ("Eats / day", "", True, "At the hours the lines that eat it are staffed"), ("On hand", "", True, ""),
              ("Arrived / day", "", True, ""), ("Daily top-up", "", True, "What the round brings each morning. With a change, the figure to type in the sending site's plan."),
              ("Status", "l", True, "", "st")]


LINE_W = [250, 90, 150, 110, 80, 90, None]
INPUT_W = [250, 100, 90, 100, 170, None]


def line_row(item, ws, count, staffed, need, makes, ships, held, word, why, tip="", key=None, cls="", done=False, set_hours=None):
    share = staffed / 24
    mtip = f"{staffed} of 24 hours a day someone is posted here"
    hours = (f'<span class="sb-hrs">{day_strip(staffed, need, f"Staffed {staffed} h, needs {need} h a day for what ships")}'
             + (f'<span class="n">{chg(staffed, set_hours, "h")}</span>' if set_hours else f'<span class="n"><b>{staffed} h</b> · needs {need}</span>')
             + "</span>")
    r = {"cells": [(f'{item}<span class="sub">{ws}</span>', item), (machines(share, count, mtip), None), (hours, staffed - need),
                   (makes, _num(makes)), (ships, _num(ships)), (held, _num(held)), (v(word, why, tip), word)], "cls": cls}
    if key:
        r["key"] = key
        r["tick"] = tick(f"{item}: hours set", done)
    return r


def input_row(item, eats, hand, arrived, top, word, why, tip="", key=None, cls=""):
    r = {"cells": [(item, item), (eats, _num(eats)), (hand, _num(hand)), (arrived, _num(arrived)), (top, None), (v(word, why, tip), word)], "cls": cls}
    if key:
        r["key"] = key
        r["tick"] = tick(f"{item}: typed in")
    return r


def factories(every: bool = False) -> str:
    ev = "" if every else "sb-ev"
    jl = [
        line_row("Jewelry (Cheap)", "Jewelry Workstation · #2 · 60 an hour", 1, 12, 15, "720<span class=\"sub\">of 1,440 at 24 h</span>", "897",
                 "540<span class=\"sub\">3 days left</span>", "short", "ships 897 a day; 12 hours make 720",
                 "The shelf behind this line shrinks by about 180 a day. Post a worker to machine #2 for 15 hours a day.", key="f0", set_hours=15),
        line_row("Jewelry (Expensive)", "Jewelry Workstation · #1 · 30 an hour", 1, 24, 14, "720", "411", "902<span class=\"sub\">of 1,000</span>", "covered",
                 "needs 14 of its 24 hours", cls=ev),
    ]
    ji = [
        input_row("Uncut Gems (Expensive)", "720", "480", "488", chg(600, 800, "/day", "from Import Hub"), "short",
                  "tops up 600; the machine eats 720 a day", "At 24 hours the expensive line eats 720 gems a day; the morning round brings 600.", key="f1"),
        input_row("Uncut Gems (Cheap)", "720<span class=\"sub\">at 12 h</span>", "960", "897", chg(1500, None, "/day", "from Import Hub"), "covered", "2 days on the floor", cls=ev),
        input_row("Metal Band", "1,440", "1,390", "1,644", chg(2200, None, "/day", "from Import Hub"), "covered", "", cls=ev),
    ]
    CL = [("Clothing (Classic Expensive Female)", "#4 #12", 2, 30, 14, 1440, 827, 1737), ("Clothing (Modern Expensive Female)", "#3 #10", 2, 30, 14, 1440, 827, 1716),
          ("Clothing (Modern Expensive Male)", "#2 #11", 2, 30, 14, 1440, 827, 1736), ("Clothing (Classic Expensive Male)", "#5 #9", 2, 30, 14, 1440, 825, 1730),
          ("Clothing (Classic Cheap Female)", "#1", 1, 60, 16, 1440, 914, 1638), ("Clothing (Modern Cheap Male)", "#8", 1, 60, 16, 1440, 917, 1629),
          ("Clothing (Classic Cheap Male)", "#6", 1, 60, 16, 1440, 913, 1630), ("Clothing (Modern Cheap Female)", "#7", 1, 60, 16, 1440, 912, 1630)]
    cl = [line_row(item, f"Clothing Workstation · {slots} · {rate} an hour", m, 24, need, n(mk), n(sh), f'{n(hd)}<span class="sub">of 2,000</span>', "covered",
                   f"needs {need} of its 24 hours") for item, slots, m, rate, need, mk, sh, hd in CL]
    ci = [input_row("Fabric (Expensive)", "11,520", "7,280", "6,612", chg(11600, None, "/day", "from Import Hub"), "covered",
                    "the lines stop at Produce up to 2,000, so they draw 6,612",
                    "Every clothing machine has Produce up to switched on. Once 2,000 of its garment sit on the shelves it stops, so it eats only what ships."),
          input_row("Fabric (Cheap)", "11,520", "7,280", "7,770", chg(11600, None, "/day", "from Import Hub"), "covered",
                    "the lines stop at Produce up to 2,000, so they draw 7,770")]
    el = [line_row("ZanaMan Smartwatch", "Electronics Workstation · #1 · 30 an hour", 1, 24, 24, "720", "0", "269<span class=\"sub\">of 500</span>", "new",
                   "first run day 72; no shop sells it yet"),
          line_row("Arty Fish Smartwatch", "Electronics Workstation · #2 · 30 an hour", 1, 24, 24, "720", "0", "270<span class=\"sub\">of 500</span>", "new",
                   "first run day 72")]
    ei = [input_row("Capacitors", "2,880", "20,520", "—", chg(21600, None, "/day", "from Import Hub"), "new", "first top-up day 72; judged from day 76"),
          input_row("Resistors · Transistors · 7 more", "1,440–2,880", "58,600", "—", "—", "new", "first top-up day 72")]

    def block(code, name, how, stats, parts, cnt, open_=True):
        cc = f'<span class="cnt red">{cnt}</span>' if "to change" in cnt else f'<span class="cnt">{cnt}</span>'
        return f"""
<details class="sb-obj fac"{" open" if open_ else ""}>
  <summary><span class="ic">{svg("gear")}</span>
    <span class="who">{site(code, name, go=True)}<span class="how">{how}</span></span>
    <span class="sb-stats">{stats}</span>{cc}<span class="tog">{svg("chev")}</span></summary>
  <div class="body">{parts}</div>
</details>"""

    def stat(lab, val, small="", tip=""):
        return f'<span class="sb-stat"{f" data-tip=\"{esc(tip)}\"" if tip else ""}><span class="lab">{lab}</span><span class="v">{val}{f"<small>{small}</small>" if small else ""}</span></span>'

    jparts = (f'<p class="sb-part">Lines</p>{table(LINE_COLS, jl, "facJl", LINE_W)}'
              f'<p class="sb-part">Factory inputs</p>{table(INPUT_COLS, ji, "facJi", INPUT_W)}')
    if every:
        cparts = (f'<p class="sb-part">Lines</p>{table(LINE_COLS, cl, "facCl", LINE_W)}<p class="sb-part">Factory inputs</p>{table(INPUT_COLS, ci, "facCi", INPUT_W)}')
        eparts = (f'<p class="sb-part">Lines</p>{table(LINE_COLS, el, "facEl", LINE_W)}<p class="sb-part">Factory inputs</p>{table(INPUT_COLS, ei, "facEi", INPUT_W)}')
        rest = (block("IC", "Factory Clothing", f'<span>{ic("truck")}<em>each morning from <b>Import Hub</b></em></span><span>{ic("right")}<em>ships to Clothing Distr.</em></span>',
                      stat("Machines", "12", "all 24 h") + stat("Staffed", "288", "h a day"), cparts, "all covered")
                + block("IC", "Factory Electronics", f'<span>{ic("truck")}<em>each morning from <b>Import Hub</b></em></span><span>{ic("right")}<em>ships to Jewelry Distrib.</em></span>',
                        stat("Machines", "2", "since day 72") + stat("Staffed", "48", "h a day"), eparts, "new"))
    else:
        rest = f"""
<div class="sb-flat"><span class="ic">{svg("gear")}</span><span>{site("IC", "Factory Clothing")} &nbsp; 8 lines and 2 factory inputs, all covered</span><span class="check">{svg("tick")}</span></div>
<div class="sb-flat"><span class="ic">{svg("gear")}</span><span>{site("IC", "Factory Electronics")} &nbsp; 2 lines and 10 inputs, too new to judge until day 76</span>{v("new")}</div>"""
    hint = f"""
<div class="sb-hint"><span class="ic">{svg("moon")}</span>
  <span><b>Run shorter?</b> 9 lines keep up with what ships on 14 to 16 hours a day. Rostering them to that would free about <b>$4,000 a day</b> of factory wages.</span>
  <a class="link" href="FactoriesAll.dc.html">See their hours</a></div>"""
    return f"""
{subhead("Factories", every=every, left={**LEFT, "Shops": 8})}
{tray(2, 19)}
{verdict("<b>1 line is short of its hours and 1 factory input tops up short</b>; 13 of 16 machines keep up with what ships, 2 are too new to judge.")}
{block("IC", "Factory Jewelry", f'<span>{ic("truck")}<em>each morning from <b>Import Hub</b></em></span><span>{ic("right")}<em>ships to Jewelry Distrib. and Clothing Distr.</em></span>',
       stat("Machines", "2", "1 short of hours") + stat("Staffed", "36", "h a day", "Hours a day someone is posted to a machine, all lines together"), jparts, "2 to change")}
{rest}
{"" if every else hint}
"""


# --------------------------------------------------------------------------
# GOODS FLOW: the same objects as a diagram
# --------------------------------------------------------------------------
NODES = {  # id: (x, y, name, sub, dot)
    "p7": (20, 150, "7 Pier", "weekly · Monday", ""),
    "p1": (20, 240, "1 Pier", "weekly · Monday", ""),
    "hub": (228, 195, "Import Hub", "750,709 held", "idle"),
    "fc": (436, 60, "Factory Clothing", "33,006 held", ""),
    "fj": (436, 195, "Factory Jewelry", "9,272 held", "bad"),
    "fe": (436, 330, "Factory Electronics", "91,559 held", ""),
    "cd": (644, 100, "Clothing Distr.", "13,653 held", "bad"),
    "jd": (644, 280, "Jewelry Distrib.", "10,307 held", "idle"),
    "sc": (852, 60, "7 clothing shops", "8,973 a day", ""),
    "sj": (852, 210, "7 jewelry shops", "1,696 a day", "bad"),
    "sg": (852, 360, "3 gyms", "no plan", "bad"),
}
LINKS = [  # from, to, per day, kind
    ("p7", "hub", 31288, "weekly"), ("p1", "hub", 2790, "weekly"),
    ("hub", "fc", 16426, "daily"), ("hub", "fj", 3775, "daily"), ("hub", "fe", 2400, "daily"),
    ("fc", "cd", 8704, "daily"), ("fj", "jd", 1698, "daily"), ("fj", "cd", 267, "daily"), ("fe", "jd", 60, "daily"),
    ("cd", "sc", 8973, "daily"), ("jd", "sj", 1696, "daily"),
    ("hub", "sg", 0, "noplan"),
]
NW, NH = 170, 44


def flow_svg(selected: str = "") -> str:
    out = ('<svg class="flow" viewBox="0 0 1040 420" role="img" aria-label="How goods move from the piers to the shops">'
           '<text class="col" x="20" y="18">IMPORTERS</text><text class="col" x="228" y="18">WAREHOUSES</text>'
           '<text class="col" x="436" y="18">FACTORIES</text><text class="col" x="644" y="18">WAREHOUSES</text><text class="col" x="852" y="18">SHOPS</text>')
    for a, b, per, kind in LINKS:
        ax, ay = NODES[a][0] + NW, NODES[a][1] + NH / 2
        bx, by = NODES[b][0], NODES[b][1] + NH / 2
        mid = (ax + bx) / 2
        w = 1.4 if kind == "noplan" else min(10, 1.4 + math.sqrt(per) / 16)
        lit = selected and selected in (a, b)
        dim = selected and not lit
        cls = f'pipe {kind}{" lit" if lit else ""}{" dim" if dim else ""}'
        path = f"M{ax:.0f} {ay:.0f} C{mid:.0f} {ay:.0f} {mid:.0f} {by:.0f} {bx:.0f} {by:.0f}"
        tip = "no plan: nothing brings drinks to the gyms" if kind == "noplan" else f"{per:,} a day"
        out += f'<path class="{cls}" d="{path}" stroke-width="{w:.1f}"><title>{tip}</title></path>'
        if kind == "noplan":
            out += f'<text class="plab bad" x="{bx - 60:.0f}" y="{by - 10:.0f}">no plan</text>'
    for key, (x, y, name, sub, dot) in NODES.items():
        cls = "node" + (" sb-on" if key == selected else "") + (" faded" if selected and key != selected and not any(
            selected in (a, b) and key in (a, b) for a, b, _, _ in LINKS) else "")
        out += (f'<g class="{cls}" data-node="{key}" transform="translate({x},{y})"><rect width="{NW}" height="{NH}" rx="7"></rect>'
                f'<text x="14" y="19">{esc(name)}</text><text class="s" x="14" y="34">{esc(sub)}</text>'
                + (f'<circle class="sb-dot {dot}" cx="{NW - 4}" cy="4" r="5.5"></circle>' if dot else "") + "</g>")
    return out + "</svg>"


LEGEND = ('<div class="sb-flowleg"><span><u></u>weekly import</span><span><u class="d"></u>morning round</span>'
          '<span><i style="background:var(--neg)"></i>short or no plan</span><span><i style="background:var(--warn)"></i>tight</span>'
          '<span><i style="background:var(--info)"></i>idle</span><span>Click a site to see its rows</span></div>')


def flow_toggle() -> str:
    """Option A: the diagram is a view of the tab you are on."""
    body = warehouses(arrived=False)
    body = body.replace(subhead("Warehouses", left={**LEFT, "Shops": 8}),
                        subhead("Warehouses", left={**LEFT, "Shops": 8}, diagram=True))
    diag = f"""
<div class="sb-diagonly">
  <div class="sb-flowbox">{flow_svg("cd")}{LEGEND}</div>
  <p class="sb-more">Clicked: <b style="color:var(--ink);font-weight:600">&nbsp;Clothing Distr.</b>&nbsp; the list opens on its rows, lit. &nbsp;<a class="link" href="#" data-view="list">Back to the list</a></p>
</div>"""
    return body.replace('<div class="sb-listonly">', diag + '<div class="sb-listonly">', 1)


def flow_tab() -> str:
    """Option B: Goods flow stays a tab of its own, and its node detail is the object's own rows."""
    rows = [
        wh_row("Paper Bag", "2,997", "2,139", "Sat 2,540", gauge(127, "bad"), chg(2000, 2600, "/day", "round from Factory Clothing"), "14,970", "short",
               "Saturdays draw 2,540; Factory Clothing's round brings 2,000", key="w1"),
        wh_row("Clothing (Classic Cheap Female)", "1,170", "872", "Sat 1,030", gauge(52), chg(2000, None, "/day", ""), "6,100", "covered", "Saturdays take 52% of the round"),
        wh_row("Jewelry (Cheap)", "100", "205", "Sat 242", gauge(24), chg(1000, None, "/day", "from Factory Jewelry"), "1,440", "covered", ""),
    ]
    io = f"""
<div class="sb-io">
  <table><thead><tr><th>Comes in from</th><th>Units / day</th></tr></thead><tbody>
    <tr><td class="l">{site("IC", "Factory Clothing")}</td><td>8,704</td></tr><tr><td class="l">{site("IC", "Factory Jewelry")}</td><td>267</td></tr></tbody></table>
  <table><thead><tr><th>Goes out to</th><th>Units / day</th></tr></thead><tbody>
    <tr><td class="l">7 clothing shops</td><td>8,973</td></tr><tr><td class="l quiet">busiest, Saturday</td><td>10,590</td></tr></tbody></table>
</div>"""
    return f"""
{subhead("Goods flow", left={**LEFT, "Shops": 8}, fourth=True, tabs_only=True)}
{tray(2, 19)}
<div class="sb-flowbox" style="margin-top:22px">{flow_svg("cd")}{LEGEND}</div>
<div class="sb-detail">
  <div class="head"><h3>{site("GD", "Clothing Distr.")}</h3><span class="quiet">Warehouse · fed each morning · 11 lines</span>
    <a class="link" style="margin-left:auto" href="Warehouses.dc.html">Its rows on Warehouses</a></div>
  {io}
  <p class="sb-part" style="margin-top:18px">Held against need · the same rows and words as Warehouses</p>
  {table(WH_COLS, rows, "flowT", WH_W)}
</div>"""


# --------------------------------------------------------------------------
# PHONE: Warehouses at 390 px, rows as cards
# --------------------------------------------------------------------------
def card(item, word, why, facts, setting=None, where="", key=None, done=False, ev=False, arrived=False):
    tk = tick(f"{item}: typed in", done) if key else "<span></span>"
    cls = "sb-card" + (" sb-done" if done else "") + (" sb-ev" if ev else "")
    st = (f'<div class="set"><span>{setting}</span><span class="where">{where}</span></div>' if setting else "")
    return (f'<div class="{cls}"{f" data-chg=\"{key}\"" if key else ""}>{tk}<div><div class="top"><b>{item}</b>{v(word)}</div>'
            f'<span class="sb-why">{why}</span></div><div class="facts">{facts}</div>{st}</div>')


def phone() -> str:
    def f(*pairs):
        return "".join(f"<span>{k} <b>{val}</b></span>" for k, val in pairs)
    return f"""
{subhead("Warehouses", left={**LEFT, "Shops": 8})}
{tray(2, 19)}
{verdict("<b>2 levels fall short, 4 sit inside their margin</b>; 29 of 35 lines reach their next delivery with room.")}
<div class="sb-grp">{site("GD", "Clothing Distr.")}<span class="cnt">1 to change</span></div>
<p class="how">Each morning from Factory Clothing · takes 8,973 a day, 10,590 on Saturdays</p>
{card("Paper Bag", "short", "Saturdays draw 2,540; Factory Clothing's round brings 2,000", f(("on hand", "2,997"), ("draws", "2,139/d"), ("Sat", "2,540")),
      chg(2000, 2600, "/day"), "in Factory Clothing's plan", key="w1")}
{card("Clothing (Classic Cheap Female)", "covered", "Saturdays take 52% of the round", f(("on hand", "1,170"), ("draws", "872/d")), ev=True)}
<div class="sb-grp">{site("GD", "Jewelry Distrib.")}<span class="cnt">1 to change</span></div>
{card("Metal Band", "idle", "nothing here uses it; Factory Jewelry keeps 5,000 here", f(("on hand", "5,000"), ("draws", "—")),
      chg(5000, 0), "in Factory Jewelry's plan", key="w2")}
<div class="sb-grp">{site("GD", "Import Hub")}<span class="cnt">5 to change</span></div>
<p class="how">Weekly from 7 Pier and 1 Pier, Monday · 4.5 days</p>
{card("Uncut Gems (Expensive)", "short", "uses 5,040 a week (rated); the level brings 4,800", f(("on hand", "4,342"), ("uses", "5,040/wk"), ("cover", "8.9 d")),
      chg(4800, 5700, "in stock"), "uses 5,040 + 12% · Smart Delivery · 7 Pier", key="w0")}
{card("Fabric (Cheap)", "tight", "covers the 80,640 a week it uses (rated), not the 12% margin", f(("on hand", "63,824"), ("uses", "80,640/wk")),
      chg(80700, 90400, "in stock"), "uses 80,640 + 12% · 7 Pier", key="w3")}
<p class="more3">+ 3 more inside their margin: Fabric (Expensive), Metal Band, Uncut Gems (Cheap)</p>
{card("Energy Drink", "idle", 'nothing draws it; <a href="Shops.dc.html">3 gyms sell 554 a day with no plan</a>', f(("on hand", "4,000")))}
{card("Capacitors +9", "idle", "10 electronics parts hold 6 weeks", f(("on hand", "572,160"), ("levels", "5–7× a week")))}
"""


# --------------------------------------------------------------------------
# ONE WORD PER FACT (R8): the vocabulary, and one fact in four places
# --------------------------------------------------------------------------
def vocabulary() -> str:
    words = [
        ("covered", "Reaches the next delivery with room to spare.", "Fabric (Expensive) at Factory Clothing"),
        ("tight", "Covers what it uses, but not the 12% margin; or reaches the delivery with under half a day to spare.", "Fabric (Cheap) at Import Hub: uses 80,640 a week, the level is 80,700"),
        ("short", "Runs out before the next delivery, or the setting brings less than the need.", "Paper Bag at Clothing Distr. on Saturdays"),
        ("no plan", "Nothing refills it: no delivery plan, no import.", "Energy Drink at the three gyms"),
        ("paused", "Its import contract is paused.", "none on this save"),
        ("stalled", "On a plan, stocked upstream, and nothing arrived all week.", "none on this save"),
        ("idle", "Held with little or nothing moving out. The one name for what Today now calls Stock not moving and Top-up target too high.", "Metal Band at Jewelry Distrib."),
        ("made here", "Made in-house, so no route brings it.", "none on this save"),
        ("new", "Too little log to judge: fewer than 3 days of deliveries.", "the electronics line, from day 72"),
    ]
    wl = "".join(f'<div class="sb-word"><span>{v(w)}</span><span><b>{m}</b><small>{ex}</small></span></div>' for w, m, ex in words)
    today_row = (f'<a class="find watch" href="#" style="grid-template-columns:22px 150px 1fr auto 28px"><span class="mark" style="background:var(--neg)"></span>'
                 f'<span class="site"><span class="hood">GD</span>Clothing Distr.</span><span class="what">Paper Bag runs short on Saturdays {v("short")}</span>'
                 f'<span class="amt">2,600<small>SET TO</small></span><span class="go">{svg("right")}</span></a>')
    supply_row = table(WH_COLS[:1] + WH_COLS[5:6] + WH_COLS[7:], [
        {"key": "v1", "tick": tick("typed in"), "cells": [("Paper Bag", None), (chg(2000, 2600, "/day", "round from Factory Clothing"), None),
                                                           (v("short", "Saturdays draw 2,540; Factory Clothing's round brings 2,000"), None)]}], "vocT1")
    page_row = (f'<table><thead><tr><th>Line</th><th>On hand</th><th>Draw / day</th><th class="l">Status</th></tr></thead><tbody>'
                f'<tr><td class="l">Paper Bag</td><td>2,997</td><td>2,139</td><td class="l">{v("short", "Saturdays draw 2,540; the round brings 2,000")}</td></tr></tbody></table>')
    node = (f'<span class="sb-node"><span class="d" style="background:var(--neg)"></span><span>Clothing Distr.<br><small>13,653 held</small></span></span>'
            f'&nbsp; <span class="quiet">its row in the node detail:</span> {v("short")}')
    fab_supply = (f'<table><tbody><tr><td class="l">Fabric (Expensive)</td><td>11,600</td><td class="l">'
                  f'{v("covered", "the lines stop at Produce up to 2,000, so they draw 6,612")}</td></tr></tbody></table>')

    def place(icon, tag, body):
        return f'<div class="sb-place"><span class="tag">{svg(icon)}{tag}</span>{body}</div>'
    return f"""
<div class="sechead" style="margin-top:36px"><h2>One word per supply fact</h2><span class="quiet">computed once in Python, read by Today, Supply, the site page and Goods flow</span></div>
<div class="sb-voc">
  <div class="sb-words">{wl}</div>
  <div class="sb-where">
    <p class="sb-part" style="margin:0">A fact that needs a change: Paper Bag at Clothing Distr.</p>
    {place("today", "Today · the finding", today_row)}
    {place("supply", "Supply › Warehouses", supply_row)}
    {place("warehouse", "Clothing Distr. · its page", page_row)}
    {place("flow", "Goods flow · the node", node)}
    <p class="sb-part" style="margin:14px 0 0">A fact that is fine: Fabric (Expensive) into Factory Clothing (five answers today)</p>
    <div class="sb-pair">
      {place("today", "Today", '<div class="sb-quiet"><span class="dash"></span>no finding: a covered fact makes none</div>')}
      {place("supply", "Supply › Factories · and the factory page", fab_supply)}
    </div>
  </div>
</div>"""


# --------------------------------------------------------------------------
# behaviour every artboard carries; each part does nothing where its elements are absent
# --------------------------------------------------------------------------
WIRE = r"""
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const board = $('.board');
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a && (a.getAttribute('href') || '#').charAt(0) === '#') e.preventDefault(); });

    const rv = $$('.rv');
    rv.forEach((el) => el.classList.add('in'));

    const nav = $('#nav');
    if (nav) { const ink = (a) => { if (!a) return; const r = a.getBoundingClientRect(), n = nav.getBoundingClientRect();
        nav.style.setProperty('--nx', (r.left - n.left) + 'px'); nav.style.setProperty('--nw', r.width + 'px'); };
      const homeInk = () => ink($('a.on', nav));
      $$('a', nav).forEach(a => a.addEventListener('mouseenter', () => ink(a))); nav.addEventListener('mouseleave', homeInk);
      setTimeout(homeInk, 50); setTimeout(homeInk, 600); }

    // Needs a change / Everything, for the whole page
    const setMode = (m) => { board.classList.toggle('sb-every', m === 'all');
      $$('.sb-mode a').forEach(a => a.classList.toggle('on', a.dataset.mode === m)); };
    $$('[data-mode]').forEach(a => a.addEventListener('click', () => setMode(a.dataset.mode)));
    // list / diagram
    $$('[data-view]').forEach(a => a.addEventListener('click', () => { const d = a.dataset.view === 'diagram';
      board.classList.toggle('sb-diag', d); $$('.sb-view a').forEach(x => x.classList.toggle('on', x.dataset.view === a.dataset.view)); }));
    $$('.flow [data-node]').forEach(g => g.addEventListener('click', () => {
      if (!$('.sb-view')) return; board.classList.remove('sb-diag'); $$('.sb-view a').forEach(x => x.classList.toggle('on', x.dataset.view === 'list'));
      const map = { cd: 'whClo', jd: 'whJew', hub: 'whHub' }; const o = $('[data-obj="' + (map[g.dataset.node] || '') + '"]');
      if (o) { o.open = true; o.classList.add('lit'); o.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => o.classList.remove('lit'), 2400); } }));

    // ticks: one checklist for the page, counted on the road
    const tray = $('.sb-tray');
    const count = () => { if (!tray) return; const all = $$('[data-chg]').filter(r => !r.closest('.sb-place'));
      const mine = all.filter(r => r.classList.contains('sb-done')).length;
      const total = +tray.dataset.total, other = +tray.dataset.other - (tray.dataset.base ? +tray.dataset.base : 0);
      const done = Math.min(total, other + mine), left = total - done;
      $('.d', tray).textContent = done; $('.l', tray).textContent = left; tray.style.setProperty('--p', total ? done / total : 1);
      tray.classList.toggle('done', !left); $('.sb-copy', tray).disabled = !left; $('.sb-reset', tray).disabled = !done;
      const tab = $('.sb-tabs a.on .sb-n:not(.zero)'); if (tab) { if (!tab.dataset.start) tab.dataset.start = tab.textContent;
        tab.textContent = Math.max(0, +tab.dataset.start - (mine - +(tray.dataset.base || 0))); tab.classList.add('bump'); setTimeout(() => tab.classList.remove('bump'), 260); } };
    if (tray) tray.dataset.base = $$('[data-chg].sb-done').length;
    $$('.sb-tick').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); const r = b.closest('[data-chg]'); if (!r) return;
      const on = r.classList.toggle('sb-done'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); count(); }));
    if (tray) {
      $('.sb-copy', tray).addEventListener('click', () => { const c = $('.sb-copy', tray); c.classList.add('copied');
        const lab = $('span', c); const was = lab.textContent; lab.textContent = 'Copied';
        setTimeout(() => { c.classList.remove('copied'); lab.textContent = was; }, 1600); });
      $('.sb-reset', tray).addEventListener('click', () => { $$('[data-chg].sb-done').forEach(r => { r.classList.remove('sb-done'); const t = $('.sb-tick', r); if (t) t.setAttribute('aria-pressed', 'false'); });
        const tb = $('.sb-tabs a.on .sb-n:not(.zero)'); if (tb && tb.dataset.start) tb.dataset.start = +tb.dataset.start + +(tray.dataset.base || 0);
        tray.dataset.other = 0; tray.dataset.base = 0; count(); });
      count(); }

    // bundle rows open into their parts
    $$('.sb-kids').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); b.closest('table').classList.toggle('open-kids'); }));
    // the crumb from a finding clears the lit row
    $$('[data-crumb]').forEach(b => b.addEventListener('click', () => { b.closest('.sb-crumb').remove(); $$('.sb-arrived').forEach(r => r.classList.remove('sb-arrived')); $$('.sb-obj.lit').forEach(o => o.classList.remove('lit')); }));

    // sortable columns, per table; "usual order" puts the rows back
    $$('table.sb-t').forEach(t => { const tb = $('tbody', t); $$('tr', tb).forEach((r, i) => r.dataset.i = i);
      $$('th[data-col] button', t).forEach(btn => btn.addEventListener('click', () => { const th = btn.closest('th'), col = +th.dataset.col + 1;
        const dir = th.dataset.dir === 'desc' ? 'asc' : th.dataset.dir === 'asc' ? null : (th.classList.contains('l') ? 'asc' : 'desc');
        $$('th', t).forEach(x => { if (x !== th) delete x.dataset.dir; });
        if (!dir) delete th.dataset.dir; else th.dataset.dir = dir;
        const rows = $$('tr', tb);
        rows.sort((a, b) => { if (!dir) return a.dataset.i - b.dataset.i; const x = a.children[col] && a.children[col].dataset.v, y = b.children[col] && b.children[col].dataset.v;
          if (x == null || x === '') return 1; if (y == null || y === '') return -1; const nx = parseFloat(x), ny = parseFloat(y);
          const c = (!isNaN(nx) && !isNaN(ny)) ? nx - ny : String(x).localeCompare(String(y)); return dir === 'asc' ? c : -c; });
        rows.forEach(r => tb.appendChild(r)); t.classList.toggle('sorted', !!dir); })); });
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
<div class="board {{theme}} __CLS__" style="width: __W__px; height: __H__px;">
<div class="wrap">__MAST__
__BODY__
</div>
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
<body><div class="board __THEME__ __CLS__" style="width:__W__px"><div class="wrap">__MAST__
__BODY__
</div></div>
<script>window.addEventListener('load', function () {__WIRE__});</script></body></html>
"""

DESK, PHONE = 1440, 390
# file, title, builder, width, height, board classes
BOARDS = [
    ("Main.dc.html", "Shops", lambda: shops({"s0", "s1"}), DESK, 1100, ""),
    ("Warehouses.dc.html", "Warehouses · arrived from a finding", lambda: warehouses(), DESK, 1720, ""),
    ("Factories.dc.html", "Factories", lambda: factories(), DESK, 930, ""),
    ("FactoriesAll.dc.html", "Factories · Everything", lambda: factories(every=True), DESK, 2250, "sb-every"),
    ("ShopsEmpty.dc.html", "Shops · nothing to change", shops_empty, DESK, 830, ""),
    ("Phone.dc.html", "Phone · Warehouses", phone, PHONE, 1620, "phone"),
    ("FlowToggle.dc.html", "Goods flow A · a diagram view on each tab", flow_toggle, DESK, 930, "sb-diag"),
    ("FlowTab.dc.html", "Goods flow B · a fourth tab", flow_tab, DESK, 1300, ""),
    ("Words.dc.html", "One word per supply fact (R8)", vocabulary, DESK, 1010, ""),
]
# the tab links point at artboards; Shops is the entry artboard
LINK_FIX = {"Shops.dc.html": "Main.dc.html"}

TIPS = {
    "Main.dc.html": "Shops: every shelf against tomorrow morning's round. It opens on the 10 rows that need a change; Everything lists all 100. The checklist is the tick at the head of each row, and the figure to type sits where the setting lives (Daily top-up). Tick a row: the truck drives along the road, the tab badge counts down. Two gym rows are ticked already. Click a heading to sort; a third click puts the usual order back.",
    "Warehouses.dc.html": "Warehouses: every depot, including the second tier that no import reaches (#78). Each head says what fills it and what it takes a day, which is what the site upstream has to deliver. A daily round reads as a gauge, a weekly import as the rail from the depot page. An import's figure to type is what the routes use plus a 12% margin; hover Uses / week for the sites behind it. This board arrived from the Today finding on Metal Band: that row and its depot are lit, and the crumb clears it.",
    "Factories.dc.html": "Factories: lines with the hours they are staffed against the hours they need for what ships (the top vote, 42), then Factory inputs. A factory with nothing to change folds to one line. The dashed strip is an idea, not a fault.",
    "FactoriesAll.dc.html": "Everything on Factories: each line's day, a cell an hour. Hatched hours are staffed but more than what ships needs; red outlines are needed and not staffed. Fabric reads covered here and everywhere else: the lines stop at Produce up to, so they draw what ships.",
    "ShopsEmpty.dc.html": "A tab with nothing to change: the badge turns into a tick, the shelf gets its moment, and the three closest to the edge still show, so the all-clear has something to stand on. Hover the drawing.",
    "Phone.dc.html": "390 px: rows become cards, the setting to type gets its own line, the tabs fill the width. The same ticks and the same words.",
    "FlowToggle.dc.html": "Option A: Goods flow is a view of the tab you are on (the icon pair by Needs a change). Click a site and the list opens on its rows, lit. Nothing on the diagram has its own table any more.",
    "FlowTab.dc.html": "Option B: Goods flow stays a fourth tab. Its node detail is no longer Held against need with its own verdicts; it is the object's own rows, the same words.",
    "Words.dc.html": "R8, drawn: one status word per (site, item), with its reason, computed once and shown the same on Today, Supply, the site page and Goods flow.",
}


def css(theme: str) -> str:
    base = BOARD_CSS.replace("@import url('" + FONTS + "');", "")
    if theme == "light":
        base = base.replace("body{margin:0;background:#0d100f}", "body{margin:0;background:#eef0ea}")
    return base + SP_CSS + SB_CSS


def fix_links(body: str) -> str:
    for a, b in LINK_FIX.items():
        body = body.replace(f'href="{a}"', f'href="{b}"')
    return body


def build(preview_dir: str | None = None) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    boards, order, notes = {}, [], {}
    layout = {  # row, column; x is summed per row
        "Main.dc.html": (0, 0), "Warehouses.dc.html": (0, 1), "Factories.dc.html": (0, 2),
        "FactoriesAll.dc.html": (1, 0), "ShopsEmpty.dc.html": (1, 1), "Phone.dc.html": (1, 2),
        "FlowToggle.dc.html": (2, 0), "FlowTab.dc.html": (2, 1),
        "Words.dc.html": (3, 0),
    }
    rows_h: dict[int, int] = {}
    for name, title, builder, w, h, cls in BOARDS:
        rows_h[layout[name][0]] = max(rows_h.get(layout[name][0], 0), h)
    row_y, y = {}, 0
    for r in sorted(rows_h):
        y += 560
        row_y[r] = y
        y += rows_h[r]
    for name, title, builder, w, h, cls in BOARDS:
        body = fix_links(builder())
        props = {"dark": {"editor": "boolean", "default": True, "section": "Theme"}, "$preview": {"width": w, "height": h}}
        page = (PAGE.replace("__TITLE__", "Supply: " + title).replace("__FONTS__", FONTS.replace("&", "&amp;"))
                .replace("__CSS__", css("dark")).replace("__W__", str(w)).replace("__H__", str(h)).replace("__CLS__", cls)
                .replace("__MAST__", masthead()).replace("__BODY__", body)
                .replace("__PROPS__", json.dumps(props, separators=(",", ":"))).replace("__LOGIC__", LOGIC))
        (ROOT / name).write_text(page, encoding="utf-8", newline="\n")
        if preview_dir:
            out = Path(preview_dir)
            out.mkdir(parents=True, exist_ok=True)
            for theme in ("", "light"):
                (out / f"{name.split('.')[0]}{'-light' if theme else ''}.html").write_text(
                    PREVIEW.replace("__TITLE__", title).replace("__FONTS__", FONTS.replace("&", "&amp;")).replace("__CSS__", css(theme or "dark"))
                    .replace("__THEME__", theme).replace("__CLS__", cls).replace("__W__", str(w)).replace("__MAST__", masthead())
                    .replace("__BODY__", body).replace("__WIRE__", WIRE), encoding="utf-8", newline="\n")
        r, c = layout[name]
        x = sum(b["w"] + 120 for k, b in boards.items() if layout[k][0] == r and layout[k][1] < c)
        boards[name] = {"x": x, "y": row_y[r], "w": w, "h": h, "title": title, "is_interactive": True}
        order.append(name)
        notes["try-" + name.split(".")[0].lower()] = {"x": x, "y": row_y[r] - 280, "w": 620, "maxH": 230, "text": TIPS[name]}
    wx = boards["Warehouses.dc.html"]["x"]
    notes["open-rated"] = {"x": wx + 680, "y": row_y[0] - 280, "w": 620, "maxH": 230, "fill": "orange",
                           "text": "Open decision (Peter): the weekly order is now what the ends of the routes use plus a 12% margin, rounded up (R8). "
                                   "Factory lines are drawn here at their rated 24/7 rate, flagged 'rated'. At measured use they draw far less "
                                   "(fabric about 46k and 54k a week, not 80,640), and the four 'tight' import rows would read covered. Which one counts is not settled."}
    titles = {0: "Supply by object: Shops, Warehouses, Factories", 1: "States: everything, nothing to change, phone",
              2: "Goods flow: pick one", 3: "One word per supply fact"}
    for r, t in titles.items():
        notes[f"title-{r}"] = {"x": 0, "y": row_y[r] - 520, "text": t, "kind": "title1", "maxW": 4560}
    index = {"v": 3, "createdOnFiles": {"v": 1, "at": CREATED_AT}, "title": "Big Copilot Supply by object", "launch": {"view": "canvas"},
             "pages": [], "boards": boards, "order": order, "notes": notes, "designSystems": []}
    (ROOT / "canvas.json").write_text(json.dumps(index, indent=1), encoding="utf-8", newline="\n")
    print("wrote", len(order), "artboards")


if __name__ == "__main__":
    arg = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    build(arg)
